/**
 * voiceReachabilityProbe.js — 「読み上げは今どういう状態か」を1行で断定する純関数。
 *
 * ★2026-08-11(v0.1.1330) なぜ要るか(会議4体・全員一致の結論)
 *
 * ■ 起きていたこと
 *   読み上げの計器(KEY_VOICE_DIAG)は【コメビュ/会場を開いている間だけ】書かれる。
 *   ユーザーは普段どちらも開いていないため、状態速報には常に古い値が出て、
 *   v0.1.1326/1327/1329 と3版続けて修正を出したのに
 *   【効いたかどうかの証拠が1度も取れなかった】。
 *   = 一番知りたい機能の計器が、一番測れない。
 *
 * ■ 会議の裁定(Q5・4人とも同じ一手を指した)
 *   「常駐している面(content script)から測れ」。
 *   ただし read-aloud のキュー自体は別の面に居るので、常駐側が測れるのは
 *   【到達可能性(reachability)】= 読み上げが動きうる状態か・誰が担当か・
 *   計器がいつのものか、である。これが分かれば
 *   「開いていないから測れない」のか「開いているのに壊れている」のかが
 *   1回で確定する(会議の保証目標=真因特定までの往復を1回にする)。
 *
 * ■ この関数が答える3つ
 *   1. 読み上げを担当できる面が今あるか(会場が開いているか)
 *   2. その面の計器はいつのものか(化石か・新鮮か)
 *   3. → だから次に何をすればいいか(ユーザーへの具体的な指示)
 *
 * ★純関数(DOM/chrome.* 非依存・テスト可能)。判定だけを持ち、文言も含めてここで決める。
 */

/** 計器を「新鮮」とみなす上限(ms)。voiceDiag は3秒 min-gap で書かれる。 */
export const VOICE_REACH_FRESH_MS = 60_000;

/**
 * @typedef {'no-surface'|'stale-surface'|'live'|'unknown'} VoiceReachState
 *   no-surface   … 読み上げを担当する面が開いていない(=そもそも鳴りようがない)
 *   stale-surface… 面は開いている(と主張している)が計器が古い(=止まっている疑い)
 *   live         … 面が開いていて計器も新鮮(=ここから先は中身の話)
 *   unknown      … 判定材料が無い
 */

/**
 * 読み上げの到達可能性を判定する。
 *
 * ★時点(epoch)を受け取らず【経過ms】だけを受け取る。
 *   本リポは「独自に時点フィールドを持つファイル」を凍結リストで単調減少させており
 *   (timeAuthorityRegistry.js・追加は禁止)、新規ファイルが時点フィールドを持つと
 *   registry テストが赤になる。判定に必要なのは齢だけなので、時点の差し引きは
 *   呼び出し側(既に時点を扱っている面)に任せる=増殖させない。
 *   ★この方針のおかげで、この関数は時計に依存しない=テストが決定論的になる副次効果もある。
 *
 * @param {{
 *   venueOpen?: unknown,        // content script が見た html.nlsb-venue-open
 *   diagAgeMs?: unknown,        // 読み上げ計器が書かれてからの経過ms(-1/未指定=記録なし)
 *   diagSource?: unknown,       // 'venue' | 'comeview' | ''
 *   diagEnabled?: unknown,      // その計器の時点で読み上げが ON だったか
 *   freshMs?: unknown
 * }} input
 * @returns {{ state: VoiceReachState, ageMs: number, source: string, line: string }}
 */
export function judgeVoiceReachability(input) {
  const fresh = Number(input?.freshMs) > 0 ? Number(input.freshMs) : VOICE_REACH_FRESH_MS;
  const source = String(input?.diagSource || '').trim();
  const venueOpen = input?.venueOpen === true;
  const enabled = input?.diagEnabled === true;

  const rawAge = Number(input?.diagAgeMs);
  const ageMs = Number.isFinite(rawAge) && rawAge >= 0 ? rawAge : -1;
  const isFresh = ageMs >= 0 && ageMs <= fresh;

  // 1) 計器が新鮮 = 面が今まさに動いている。中身の判定は既存の voiceDiag に任せる。
  if (isFresh) {
    return {
      state: 'live',
      ageMs,
      source,
      line: `読み上げ到達: ✅稼働中(${source || '面不明'}・${Math.round(ageMs / 1000)}秒前の値)`
    };
  }

  // 2) 会場が開いていないなら、そもそも読み上げは動かない。
  //    ★ここが今回の核心: ユーザーが「押しても動かない」と言うとき、
  //      面を開いていないだけなのか、開いているのに壊れているのかを分ける。
  if (!venueOpen) {
    const ageNote = ageMs >= 0 ? `(記録は${Math.round(ageMs / 60000)}分前)` : '(記録なし)';
    return {
      state: 'no-surface',
      ageMs,
      source,
      line:
        `読み上げ到達: ⚪担当する画面が開いていません${ageNote} ` +
        `→ 会場モード(動画右下の桜色ボタン)かコメビュを開いてから読み上げを押してください`
    };
  }

  // 3) 会場は開いているのに計器が古い = 動いていない/止まっている疑い。
  //    ★これが出たら「開いているのに鳴らない」が確定するので、次に見るべきは中身。
  const ageNote = ageMs >= 0 ? `${Math.round(ageMs / 60000)}分前` : '記録なし';
  if (ageMs < 0) {
    return {
      state: 'unknown',
      ageMs,
      source,
      line: '読み上げ到達: ⚠会場は開いていますが計器がまだ書かれていません(起動直後かもしれません)'
    };
  }
  return {
    state: 'stale-surface',
    ageMs,
    source,
    line:
      `読み上げ到達: 🔴会場は開いているのに計器が${ageNote}で止まっています` +
      `${enabled ? '(最後はONでした)' : '(最後はOFFでした)'} ` +
      `→ 読み上げ処理が動いていません。会場を開き直しても直らなければ不具合です`
  };
}
