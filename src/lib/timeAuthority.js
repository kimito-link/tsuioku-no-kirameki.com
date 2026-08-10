/**
 * timeAuthority — 「その値がいつ真だったか」と「その値は判定に使えるか」の【唯一の正本】。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ★なぜこのモジュールが要るか(2026-08-10・同じ症状に7版を費やした構造の解剖)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   サイドパネル黒画面・鏡🔴誤報に v0.1.1294〜1303 の7版を費やした。真因は行数ではなく
 *   【判定が共有されていないこと】だった。
 *
 *   popupDiagUptimeNote.js は 2026-08-01 に書かれ、JSDoc に正しい知識を持っていた:
 *     「起動直後は計器が構造的にゼロ」「鏡の flush は publish の 400ms 後」
 *   ★知識は正しく、文書化もされていた。しかしそれは【注記テキストを返す関数】でしかなく、
 *     🔴 を実際に出す diagnosticsTrust.js と parityVerdict.js は各自別基準で判定していた。
 *   → 同じ速報に「⏳起動直後です」と「🔴取りこぼし」が同居し、開発者は🔴を信じて3回空振りした。
 *
 *   実測(2026-08-10):
 *     計器・判定系ファイル             : 148個
 *     独自に時刻/齢を持つファイル       : 140個
 *     独自に「保留」を判定するファイル   :  48個
 *     同じ概念に付いた名前              :   9通り
 *     ★共有の道具は既にあるのに使われていない:
 *       cardFreshnessNote.formatAgoLabel の利用は 4ファイルだけ、
 *       一方 49ファイルが「◯秒前」を自前で組み立てている
 *
 *   → **ドキュメントを増やしても直らない。判定関数を共有したときだけ直る。**
 *     コメントは「読む人が思い出せば効く」もの。関数は「呼べば必ず効く」。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ★時点(timestamp)と経過(duration)は【別の量・別の時計】。統合してはいけない
 * ─────────────────────────────────────────────────────────────────────────
 *
 *     capturedAt = Date.now()                     → epoch の【時点】
 *     shadeAgeMs = performance.now() 差            → 【経過時間】(別の時計)
 *     readAgoMs / writerBootAgoMs                  → 【経過時間】
 *
 *   このリポは過去に2つを混ぜて事故っている([[venue-seats-lastupdate-clock-mismatch-v1044]]
 *   = 会場座席の「更新 1782996212秒前(約56年前)」)。
 *   → classifyReading は時点と経過を【別引数】で受ける。1つの型にまとめない。
 *   → 名前を寄せる対象も時点系(capturedAt / persistedAt / measuredAt)に限る。
 *     AgoMs / AgoSec / shadeAgeMs は経過なので寄せない。
 *
 * ★このモジュールは純関数のみ(DOM も chrome API も触らない)。
 * @module timeAuthority
 */

/** 時点フィールドの正式名(epoch ms)。storage の書式は変えない=これは【読み方】の規約。 */
export const CANONICAL_TIME_FIELD = 'capturedAt';

/** 値が「新鮮」とみなされる上限(3分)。旧 POPUP_DIAG_FRESH_MS と同値。 */
export const VALUE_FRESH_MS = 3 * 60 * 1000;

/**
 * 書き手(popup)の起動直後、まだ書けていなくて当然とみなす猶予。
 * 根拠: 鏡の flush は publish の 400ms 後・初期ローディングの幕は 800ms 最低表示。
 * ★旧 POPUP_BOOT_GRACE_MS(diagnosticsTrust.js) と popupDiagUptimeNote.js の
 *   リテラル 3000 を統合したもの。同じ値が2箇所にあった状態を解消する
 *   (「2箇所で違う定義を作らない」とコメントに書きながら実際には作っていた)。
 */
export const WRITER_BOOT_GRACE_MS = 3000;

/**
 * ISO/epoch を epoch ms に(取れなければ 0)。
 * ★diagnosticsTrust.js から【挙動を1ビットも変えずに】移設したもの。
 *   Number(-1) は有限だが n > 0 を満たさないため Date.parse('-1') へ落ち、
 *   環境依存で日付として解釈されうる(移設前の実測: 978274800000)。
 *   奇妙だが【既存の呼び手がこの挙動に依存していないと確認できていない】ため直さない。
 *   直すなら別タスクで、影響範囲を調べてから。
 * @param {unknown} v
 * @returns {number}
 */
export function toEpochMs(v) {
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return n;
  const t = Date.parse(String(v || ''));
  return Number.isFinite(t) && t > 0 ? t : 0;
}

/**
 * 経過 ms → 「N秒前/N分前」(取れなければ '')。
 * ★diagnosticsTrust.js から【挙動を1ビットも変えずに】移設したもの。
 *   Number(null)===0 なので agoLabel(null) は '0秒前' を返す(undefined は '')。
 *   この非対称も既存挙動なので保存する。
 * @param {unknown} ms
 * @returns {string}
 */
export function agoLabel(ms) {
  const m = Number(ms);
  if (!Number.isFinite(m) || m < 0) return '';
  const sec = Math.round(m / 1000);
  return sec < 90 ? `${sec}秒前` : `${Math.round(sec / 60)}分前`;
}

/**
 * 時点(capturedAt)と現在時刻から齢(経過ms)を出す。取れなければ null。
 * ★null を 0 と誤読しないためのガードを内蔵する。Number(null)===0 なので、
 *   これが無いと「値が取れなかった」を「齢0ms=たった今」と偽って報告してしまう。
 * @param {unknown} capturedAt 時点(epoch ms または ISO)
 * @param {unknown} nowMs
 * @returns {number|null}
 */
export function ageMsOf(capturedAt, nowMs) {
  const at = toEpochMs(capturedAt);
  const now = Number(nowMs);
  if (!(at > 0) || !Number.isFinite(now) || !(now > 0)) return null;
  return Math.max(0, now - at);
}

/**
 * 経過時間として妥当な数値だけを通す(それ以外は null)。
 * ★Number(null)===0 / Number('')===0 を「経過0ms」と誤読しないための共通ガード。
 *   7版事件の直接原因のひとつ(「取れなかった」を「起動0秒」と偽る)。
 * @param {unknown} v
 * @returns {number|null}
 */
export function durationMsOf(v) {
  if (v == null) return null;
  // ★空文字/空白も弾く: Number('')===0 / Number(' ')===0 なので、
  //   これが無いと「取れなかった」を「経過0ms」と偽る(7版事件と同じ穴)。
  //   実装中にこのテストが実際に赤を出して捕まえた欠陥。
  if (typeof v === 'string' && v.trim() === '') return null;
  if (typeof v === 'boolean') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * ★判定の正本。「この値は判定に使えるか」を決める唯一の関数。
 *
 * v0.1.1303 で diagnosticsTrust に書いたロジックを、場所だけ正本へ移したもの。
 *
 * 【判定の考え方】
 *   問うべきは「書き手(popup)が若いか」ではなく
 *   【その値を読んだ時点で、書き手は書ける状態だったか】。
 *
 *   実機(2026-08-10)の反例がこれを示した:
 *     popup 起動から 4.3秒 / 鏡は 8秒前に読んだ値 → 読んだのは起動の【3.7秒前】
 *   = まだ存在しないものを読んだので空なのは当然。しかし「起動から3秒未満か」
 *     だけで判定していたため、起動4.3秒=猶予の外で🔴を出していた。
 *
 * 【時点と経過を混ぜない】
 *   capturedAt は【時点】、readAgoMs / writerBootAgoMs は【経過】。別引数で受ける。
 *
 * @param {{
 *   present?: unknown,          // 値が存在したか
 *   capturedAt?: unknown,       // 値がいつ真だったか(時点・旧名の値もここへ渡す)
 *   readAgoMs?: unknown,        // その値を読んだのは now の何ms前か(経過)
 *   writerBootAgoMs?: unknown,  // 書き手が起動したのは now の何ms前か(経過)
 *   graceMs?: unknown,          // 既定 WRITER_BOOT_GRACE_MS
 *   freshMs?: unknown,          // 既定 VALUE_FRESH_MS
 *   nowMs?: unknown
 * }} input
 * @returns {{
 *   state: 'fresh'|'stale'|'pending'|'absent',
 *   ageMs: number|null,
 *   fresh: boolean|null,
 *   readAtRelativeToBootMs: number|null
 * }}
 *   fresh は三値: true/false/null(齢不明)。★齢が取れないとき true を名乗らない
 *   =信頼を偽装しない(fail-closed)。
 */
export function classifyReading(input) {
  const v = input && typeof input === 'object' ? input : {};
  const grace = durationMsOf(v.graceMs) ?? WRITER_BOOT_GRACE_MS;
  const freshMs = durationMsOf(v.freshMs) ?? VALUE_FRESH_MS;
  const readAgoMs = durationMsOf(v.readAgoMs);
  const writerBootAgoMs = durationMsOf(v.writerBootAgoMs);

  // 読んだ時刻が書き手の起動から見て何msか(負=起動より前に読んだ)。
  const readAtRelativeToBootMs =
    writerBootAgoMs != null && readAgoMs != null ? writerBootAgoMs - readAgoMs : null;

  if (v.present !== true) {
    /*
     * ★「読んだ時点で書き手は書ける状態だったか」で決める。
     *   両方の経過が取れるならそれを使い、取れなければ従来どおり起動基準へフォールバック
     *   (extras の概念を持たない呼び手=テスト等のため)。
     */
    const withinGrace =
      readAtRelativeToBootMs != null
        ? readAtRelativeToBootMs < grace
        : writerBootAgoMs != null && writerBootAgoMs < grace;
    return {
      state: withinGrace ? 'pending' : 'absent',
      ageMs: null,
      fresh: null,
      readAtRelativeToBootMs
    };
  }

  const ageMs = ageMsOf(v.capturedAt, v.nowMs);
  // ★齢が取れないときは fresh を名乗らない(null)。state は 'fresh' に倒さず 'stale' でもない
  //   =呼び手が三値で扱えるよう fresh:null を返し、state は便宜上 'fresh'(存在はする)とする。
  //   既存 diagnosticsTrust の戻り(fresh:null)の意味を壊さないための設計。
  const fresh = ageMs == null ? null : ageMs <= freshMs;
  return {
    state: fresh === false ? 'stale' : 'fresh',
    ageMs,
    fresh,
    readAtRelativeToBootMs
  };
}
