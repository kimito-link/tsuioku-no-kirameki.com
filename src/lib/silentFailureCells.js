/**
 * silentFailureCells.js — 【無音で死ぬ】故障を画面に出すセル(純関数)。
 *
 * ★なぜ最優先か(2026-08-15 会議3席が独立に一致した結論)
 *   ここで扱う故障は **既に測れているのに画面が無言** なものだけ。
 *   新しい観測を作るのではなく、**測れている真因を届けるだけ** なので
 *   ユーザー確定の価値基準「真因に導いたか」で最高得点になる。
 *
 *   実例: `customSoundDiag.dbAvailable === false` は
 *   customSoundDiag.js:66 が **'-(IndexedDB利用不可)' と静かに出す設計**だった。
 *   ＝カスタム音源が全滅しても画面は「-」しか言わない。
 *   これは v0.1.1401 で最悪と確定した
 *   **「一番知りたい異常時ほど何も出ない」** の現存パターンそのもの。
 *
 * ■ 掟(buriedInstrumentCells.js の1〜5に加え、会議が足した6番)
 *   6. ★**text に「次の一手」か「これは仕様です」を書けないセルは作らない**。
 *      読んで直せない計器は価値が低く、誤誘導なら **負**。
 *      ここのセルは全て「次に何をすればいいか」を持つ(それが選定理由)。
 *
 * ■ 文言の正本を自作しない
 *   読み上げの失敗理由の日本語は **voiceFailureTaxonomy.js が正本**。
 *   ここで三項演算子を並べると同じ原因が別の日本語になる
 *   (実際に voiceLoadingState.js と食い違った前科がある = voiceDiag.js:305)。
 *   ★生トークン(refused 等)は消さずに併記する(grep で追える材料を残す)。
 *
 * @module silentFailureCells
 */

import { canonicalLabel, fromAliveFailure } from './voiceFailureTaxonomy.js';
// ★v0.1.1405: 会場が鏡を受け取れているかの判定(a/b/c)。判定はあちらが正本。
import { judgeVenueMirrorIntake } from './venueMirrorIntakeDiag.js';

/** @param {unknown} v @returns {number} */
function n0(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 状態セルを作る(healthCells.js の stateCell と同形)。
 * @param {string} id
 * @param {string} label
 * @param {'ok'|'warn'|'bad'|'na'} level
 * @param {string} text
 * @returns {import('./healthCells.js').HealthCell}
 */
function cell(id, label, level, text) {
  return { id, label, kind: /** @type {'state'} */ ('state'), value: null, level, text };
}

/**
 * 無音で死ぬ故障をセル化する。
 *
 * ★v0.1.1401 の掟5: 「使っていないから0」と「動くはずなのに0」は別物。
 *   ここは **設定が有効なら必ず出す**(観測ゼロでも ⚪「—」)。
 *   一番知りたい異常時にセルが消えるのを防ぐ。
 *
 * @param {any} data buildHealthCells と同じ入力
 * @returns {Array<import('./healthCells.js').HealthCell>}
 */
export function buildSilentFailureCells(data) {
  /** @type {Array<import('./healthCells.js').HealthCell>} */
  const out = [];

  /* ── カスタム音源が丸ごと使えない ───────────────────────
   * ★これが第1弾の筆頭。IndexedDB が開けないと **登録した音が全部鳴らない**
   *   のに、従来の表示は '-' だけだった(customSoundDiag.js:66)。
   */
  const cs = data?.customSoundDiag ?? null;
  if (!cs || typeof cs !== 'object') {
    out.push(cell('custom-sound-db', 'マイ効果音の保管庫', 'na', '—'));
  } else if (cs.dbAvailable !== true) {
    out.push(cell(
      'custom-sound-db', 'マイ効果音の保管庫', 'bad',
      '使えません(ブラウザの保存領域が開けない)。シークレットウィンドウか、サイトのデータ削除設定が原因のことがあります'
    ));
  } else {
    const assigned = n0(cs.assignedKeyCount);
    const total = n0(cs.totalKeyCount);
    const bundled = n0(cs.localBundledCount);
    const blobs = n0(cs.blobCount);
    /*
     * ★同梱音源があるので「取込0本」は異常ではない(掟2: 仕様上そうなるものを異常にしない)。
     *   割当が1つも無いときだけ warn=鳴らす音が決まっていない状態。
     */
    const nothingAssigned = assigned === 0 && total > 0;
    out.push(cell(
      'custom-sound-db', 'マイ効果音の保管庫',
      nothingAssigned ? 'warn' : 'ok',
      nothingAssigned
        ? `音が割り当てられていません(0/${total}キー)。設定から音を選ぶと鳴ります`
        : `使えます(同梱${bundled}本/取込${blobs}本・割当${assigned}/${total}キー)`
    ));
  }

  /* ── 読み上げが「ONにならない」理由 ─────────────────────
   * ★ユーザー報告「押しても一瞬で戻る」に対し、速報が理由を1文字も
   *   持っていなかったのが v0.1.1331。値は取れているがセルが無かった。
   */
  const v = data?.voiceDiag ?? null;
  if (!v || typeof v !== 'object') {
    out.push(cell('voice-start-fail', '読み上げのON失敗', 'na', '—'));
  } else {
    const failTotal = n0(v.enableFailTotal);
    const rawReason = String(v.lastEnableFailReason || '').trim();
    if (failTotal > 0 && rawReason) {
      // 日本語は taxonomy が正本。生トークンも併記して grep 可能にする。
      const why = canonicalLabel(fromAliveFailure(rawReason));
      out.push(cell(
        'voice-start-fail', '読み上げのON失敗', 'bad',
        why ? `${failTotal}回失敗: ${why} [${rawReason}]` : `${failTotal}回失敗: ${rawReason}`
      ));
    } else if (failTotal > 0) {
      out.push(cell('voice-start-fail', '読み上げのON失敗', 'warn', `${failTotal}回失敗(理由が記録されていません)`));
    } else {
      out.push(cell('voice-start-fail', '読み上げのON失敗', 'ok', '失敗なし'));
    }
  }

  /* ── 合成は通っているのに音が出ない(自動再生ブロック) ─────
   * ★次の一手が明確なので掟6を満たす: 「ページを一度クリック」。
   *   文言は voiceDiag.js:318 の既存表現に合わせる(2箇所で違う日本語にしない)。
   */
  if (!v || typeof v !== 'object') {
    out.push(cell('voice-audio-blocked', '音の再生ブロック', 'na', '—'));
  } else {
    const blocked = n0(v.audioBlockedTotal);
    out.push(cell(
      'voice-audio-blocked', '音の再生ブロック',
      blocked > 0 ? 'warn' : 'ok',
      blocked > 0
        ? `${blocked}件ブロック。ページを一度クリックすると鳴ります`
        : 'ブロックなし'
    ));
  }

  /* ── ギフト音を鳴らそうとして失敗した ───────────────────
   * ★「鳴らなかった」には理由が3つあり、打ち手が違う:
   *     noPath  = 音源への道が無い(割当が無い)
   *     error   = 再生が例外で落ちた
   *     off     = 設定でOFF(=正常・掟2)
   *   coalesced/guarded は **防御が効いた回数**なので異常にしない(掟1)。
   */
  const g = data?.giftEffectDiag ?? null;
  if (!g || typeof g !== 'object') {
    out.push(cell('gift-sound-fail', 'ギフト音の失敗', 'na', '—'));
  } else {
    const err = n0(g.giftSoundError);
    const noPath = n0(g.giftSoundNoPath);
    if (err > 0) {
      out.push(cell('gift-sound-fail', 'ギフト音の失敗', 'bad', `再生エラー${err}件${noPath > 0 ? ` / 音源なし${noPath}件` : ''}`));
    } else if (noPath > 0) {
      out.push(cell('gift-sound-fail', 'ギフト音の失敗', 'warn', `音源が割り当てられていません(${noPath}件)。設定から音を選ぶと鳴ります`));
    } else {
      out.push(cell('gift-sound-fail', 'ギフト音の失敗', 'ok', '失敗なし'));
    }
  }

  /* ── 送ったコメントが出たのに消えた ─────────────────────
   * ★revertCount は「楽観表示したが取り消した」= 送信が実は失敗していた症状。
   *   ユーザーには「送れたように見えて送れていない」と映るので、明確な異常。
   */
  const cp = data?.commentPostDiag ?? null;
  if (!cp || typeof cp !== 'object') {
    out.push(cell('comment-revert', '送信の取り消し', 'na', '—'));
  } else {
    const revert = n0(cp.revertCount);
    const attempts = n0(cp.attempts);
    if (revert > 0) {
      out.push(cell(
        'comment-revert', '送信の取り消し', 'bad',
        `${revert}件が表示後に取り消されました(送れたように見えて届いていません)`
      ));
    } else {
      out.push(cell('comment-revert', '送信の取り消し', 'ok', attempts > 0 ? `取り消しなし(送信${attempts}件)` : '取り消しなし'));
    }
  }

  /* ── 会場が鏡を受け取れているか ─────────────────────────
   * ★未解決の「会場一致が鏡stale(656s)で固定・別配信の値が残っている疑い」を
   *   **肯定/否定できる**セル。書き手(publish)は毎秒動いて見送り0なのに
   *   会場が見ている鏡が11分古い、という状況で読み手のどこが詰まったかを名指しする。
   *
   * ★判定は venueMirrorIntakeDiag.judgeVenueMirrorIntake が正本。
   *   (a)通知が来ない /(b)別配信の鏡 /(c)関所で全却下 で **打ち手が正反対** なので、
   *   ここで再判定すると速報と食い違う。
   */
  const intake = data?.venueSeatsDiag?.mirrorIntake ?? null;
  const venueOpen = data?.venueOpen === true;
  if (!intake) {
    /*
     * ★会場を開いていなければ「使っていないから0」= 異常ではない(掟5の左側)。
     *   開いているのに観測が無いなら、それ自体が症状なので警告にする。
     */
    out.push(venueOpen
      ? cell('venue-intake', '会場の鏡うけとり', 'warn', '会場は開いていますが受け取りの記録がありません')
      : cell('venue-intake', '会場の鏡うけとり', 'na', '—'));
  } else {
    const v = judgeVenueMirrorIntake(intake, Number(data?.nowMs) || Date.now());
    out.push(cell(
      'venue-intake', '会場の鏡うけとり',
      /** @type {'ok'|'warn'|'bad'|'na'} */ (v.level),
      v.level === 'na'
        ? '—'
        : v.nextAction ? `${v.detail} → ${v.nextAction}` : v.detail
    ));
  }

  return out;
}
