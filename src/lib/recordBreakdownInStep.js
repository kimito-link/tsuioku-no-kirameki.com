/**
 * v0.1.2242: 「記録」の下の「内訳: 通常 N …」を、記録の数字と同じ歩幅で動かす(純関数・状態は呼び出し側が1つ持つ)。
 *
 * 症状(2026-11-26 実機・保存データを消した状態・Twitch 生放送):
 *   記録は 720 → 5,104 と増え続けるのに、内訳は 通常 2,001 で止まったまま戻らない(元の版 0.1.2229 でも同じ)。
 *   別の人の実機では、同じ配信の途中で内訳が 1,072 → 285 に減ったこともある。
 *
 * 原因(数え方が2つに分かれていた):
 *   - 記録 = 保存した件数の数え(サマリの recordedCount / IndexedDB の件数)。軽い見回り(applyLightweightPanelSummaryCards)
 *     でも全件の読み直しでも、同じ数え・同じ単調ゲート(resolveMonotonicCommentCount)を通る。
 *   - 内訳 = 横の欄がそのとき手元に持っているコメント配列(displayEntries)を数えた結果だけ。
 *     配信を開いた直後の過去コメントのまとめ読み込み中は、重い全件読み直しが止まる/控えの配列を使い回す/
 *     新着の差分(テール)だけを足す、のどれかになり、手元の配列は記録の一部しか持たない。軽い見回りは
 *     内訳を書き換えない(setCountDisplay に内訳を渡さない)ので、内訳は止まったままになる。
 *     さらに内訳には単調ゲートが無く、後から短い配列で数え直すと減る。
 *
 * 直し方(記録と同じ数字を土台にする):
 *   - 通常以外の分類(興味来場・フォロー通知・システム・配信者・二重に届いた来場の数え落とし)は、
 *     これまでどおり手元の行を見て数える。同じ配信の中では減らさない(見えた最大を覚える)。
 *   - 「通常」は、記録の数字(単調ゲートを通った、画面の記録と同じ値)から、通常以外の分類を引いた残り。
 *     手元の行で数えた通常のほうが大きいときはそちらを使い、前に出した通常より小さくはしない。
 *     → 内訳の合計は記録と同じ歩幅で増え、まとめ読み込み中も止まらず、途中で減らない。
 *   - 軽い見回り(行を読まない)でも、この覚えている分類と記録の数字だけで内訳を出せる=重い読み込みを足さない。
 *   - 配信が変わったら(lv が変わったら)覚えをやり直す(記録の単調ゲートと同じ決まり)。
 *   - 一度も行を数えていない配信では、軽い見回りから内訳を作らない(今までどおり、最初の全件読み直しを待つ)。
 *
 * 全サービス共通: ニコ生も、YouTube・Twitch・Kick・ツイキャス・SHOWROOM・ミクチャ・ABEMA・TikTok・17LIVE 等も
 *   同じ popup-entry.js の setCountDisplay を通る(他サービスは ytNicoShim.js で疑似 lv にして同じ画面を動かす)。
 *
 * @module recordBreakdownInStep
 */

import { normalizeMonotonicLiveId } from './monotonicCommentCount.js';

/**
 * @typedef {{
 *   lv: string,
 *   seen: boolean,
 *   hidden: boolean,
 *   normal: number,
 *   interestArrival: number,
 *   followNotice: number,
 *   otherSystem: number,
 *   broadcaster: number,
 *   uncounted: number
 * }} RecordBreakdownInStepState
 */

/**
 * @typedef {{
 *   total: number,
 *   normal: number,
 *   interestArrival: number,
 *   followNotice: number,
 *   otherSystem: number,
 *   _broadcasterCount?: number
 * }} InStepBreakdown
 */

/** @returns {RecordBreakdownInStepState} */
export function createRecordBreakdownInStepState() {
  return {
    lv: '',
    seen: false,
    hidden: false,
    normal: 0,
    interestArrival: 0,
    followNotice: 0,
    otherSystem: 0,
    broadcaster: 0,
    uncounted: 0
  };
}

/** @param {unknown} v */
function nonNegInt(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * @param {RecordBreakdownInStepState} state
 * @param {string} lv 正規化済み
 */
function resetFor(state, lv) {
  Object.assign(state, createRecordBreakdownInStepState(), { lv });
}

/**
 * 画面に出す内訳を決める。state は in-place で更新する。
 *
 * 戻り値の意味は setCountDisplay の breakdown 引数と同じ:
 *   undefined = 内訳の行に触らない(前の表示のまま) / null = 行を隠す / オブジェクト = その内訳を出す
 *
 * @param {RecordBreakdownInStepState} state
 * @param {unknown} lv 画面が描いている配信(記録の単調ゲートと同じもの)
 * @param {number|null|undefined} recorded 画面に出した記録の数(単調ゲート後)。数字でなければ null
 * @param {import('./commentRecordBreakdown.js').CommentRecordBreakdown & { _broadcasterCount?: number } | null | undefined} seen
 *   手元の行を数えた内訳(全件の読み直しのとき)。null=隠す・undefined=行を数えていない(軽い見回り)
 * @param {{ followRecord?: boolean }} [opts] followRecord=true のとき、行を数えていなくても記録に合わせて内訳を出す
 * @returns {InStepBreakdown|null|undefined}
 */
export function resolveRecordBreakdownInStep(state, lv, recorded, seen, opts = {}) {
  const normLv = normalizeMonotonicLiveId(lv);
  // 配信が分からないときは今までどおり(覚えに触らない・素通し)
  if (!normLv) return seen;
  if (state.lv !== normLv) resetFor(state, normLv);

  if (seen === null) {
    state.hidden = true;
    return null;
  }
  if (seen === undefined) {
    if (!(opts && opts.followRecord === true)) return undefined;
    if (!state.seen || state.hidden) return undefined;
  } else if (seen && typeof seen === 'object') {
    state.seen = true;
    state.hidden = false;
    const n = nonNegInt(seen.normal);
    const ia = nonNegInt(seen.interestArrival);
    const fn = nonNegInt(seen.followNotice);
    const os = nonNegInt(seen.otherSystem);
    const bc = nonNegInt(/** @type {any} */ (seen)._broadcasterCount);
    // 行はあるが分類に入らなかった分(来場の二重受信など)。記録には入っているので、通常から引く側に置く
    const unc = Math.max(0, nonNegInt(seen.total) - (n + ia + fn + os));
    state.normal = Math.max(state.normal, n);
    state.interestArrival = Math.max(state.interestArrival, ia);
    state.followNotice = Math.max(state.followNotice, fn);
    state.otherSystem = Math.max(state.otherSystem, os);
    state.broadcaster = Math.max(state.broadcaster, bc);
    state.uncounted = Math.max(state.uncounted, unc);
  } else {
    return seen;
  }

  const rec = typeof recorded === 'number' && Number.isFinite(recorded) && recorded >= 0 ? Math.floor(recorded) : null;
  if (rec != null) {
    const others =
      state.interestArrival + state.followNotice + state.otherSystem + state.broadcaster + state.uncounted;
    const fromRecord = Math.max(0, rec - others);
    if (fromRecord > state.normal) state.normal = fromRecord;
  }
  const shownSum = state.normal + state.interestArrival + state.followNotice + state.otherSystem;
  /** @type {InStepBreakdown} */
  const out = {
    total: Math.max(rec ?? 0, shownSum + state.uncounted),
    normal: state.normal,
    interestArrival: state.interestArrival,
    followNotice: state.followNotice,
    otherSystem: state.otherSystem
  };
  if (state.broadcaster > 0) out._broadcasterCount = state.broadcaster;
  return out;
}
