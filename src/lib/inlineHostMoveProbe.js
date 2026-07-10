/**
 * inlineHostMoveProbe.js — ①POPインラインパネルの host(#nls-inline-popup-host)DOM移設を観測する
 * 純関数(v0.1.1124・D-1計器・robust-pondering-fountain 計画 Patch1)。
 *
 * 背景(2026-07-10 実測): D-0計器(v0.1.1123)で「popupBootAtIso が診断の33ms前・ticks=1・幕age34ms」
 *   =①iframe が繰り返し再生成されている(ローディングちかちか)ことが確定。iframe リロードを起こす
 *   唯一の経路は host の DOM 移設(iframe を外して付け直すと中身がリロードされるブラウザ仕様)。
 *   ただし移設6箇所のどれが・何回・会場open中かは【未実測】なので、推測で直さず観測を先にする
 *   (scrollWhiteoutProbe.js と同じ思想・同型実装)。
 *
 * この lib は DOM に触れない純関数だけを持つ。isConnected/iframe有無/venueOpen の採取は呼び出し側
 *   (content-entry.js の noteInlineHostMove)が移設【直前】に行い、ここへ渡す。
 */

/** 記録する最新サンプルの最大数(リングバッファ)。 */
export const INLINE_HOST_MOVE_SAMPLE_CAP = 8;

/**
 * host 移設1回を観測状態へ取り込む(破壊的更新)。
 *   reloadCount は「prevConnected && hadIframe」のときだけ増える=接続済み host に iframe が居る状態で
 *   動かした(=iframe リロード実害あり)移設のみ。初回 attach や iframe 生成前の移設はノイズとして
 *   moveCount にだけ入る。
 * @param {{ count:number, reloadCount:number, venueOpenMoves:number, byReason:Record<string,number>, samples:Array<object>, lastAtMs:number }} state
 * @param {{ reason:string, atMs:number, prevConnected:boolean, hadIframe:boolean, venueOpen:boolean }} move
 * @returns {object} 更新後の同じ state
 */
export function recordInlineHostMove(state, move) {
  if (!state || typeof state !== 'object') return state;
  if (!Array.isArray(state.samples)) state.samples = [];
  if (typeof state.count !== 'number') state.count = 0;
  if (typeof state.reloadCount !== 'number') state.reloadCount = 0;
  if (typeof state.venueOpenMoves !== 'number') state.venueOpenMoves = 0;
  if (!state.byReason || typeof state.byReason !== 'object') state.byReason = {};
  const reason = String(move?.reason || 'unknown').slice(0, 40);
  const prevConnected = move?.prevConnected === true;
  const hadIframe = move?.hadIframe === true;
  const venueOpen = move?.venueOpen === true;
  state.count += 1;
  state.byReason[reason] = (Number(state.byReason[reason]) || 0) + 1;
  if (prevConnected && hadIframe) state.reloadCount += 1;
  if (venueOpen) state.venueOpenMoves += 1;
  state.lastAtMs = Number(move?.atMs) || 0;
  state.samples.push({
    reason,
    prevConnected,
    hadIframe,
    venueOpen,
    atMs: state.lastAtMs
  });
  if (state.samples.length > INLINE_HOST_MOVE_SAMPLE_CAP) {
    state.samples = state.samples.slice(-INLINE_HOST_MOVE_SAMPLE_CAP);
  }
  return state;
}

/**
 * v0.1.1125 盲点計器: 同一 document に `#nls-inline-popup-host` が2つ以上見えた瞬間を数える
 * (破壊的更新)。dedupe(pickPrimaryInlinePopupHostFromDom)は非primaryを即 remove するため、
 * 「2つできてる」現象は count でしか残らない(実測: 削除まで約74ms=状態速報のスクショには写らない)。
 * @param {{ duplicateSeen?:number }} state recordInlineHostMove と同じ state を共有する
 * @param {number} hostCount その瞬間の host 総数(2以上のときだけ呼ぶ想定だが、ガードもする)
 * @returns {object} 更新後の同じ state
 */
export function recordInlineHostDuplicateSeen(state, hostCount) {
  if (!state || typeof state !== 'object') return state;
  if ((Number(hostCount) || 0) < 2) return state;
  state.duplicateSeen = (Number(state.duplicateSeen) || 0) + 1;
  return state;
}

/**
 * fastDiag(content.hostMoveDiag)へ出す形に要約する純関数。
 * @param {{ count:number, reloadCount:number, venueOpenMoves:number, duplicateSeen?:number, byReason:Record<string,number>, samples:Array<object>, lastAtMs:number }|null} state
 * @param {number} nowMs
 * @returns {{ moveCount:number, reloadCount:number, venueOpenMoves:number, duplicateSeen:number, lastMoveAgoMs:(number|null), byReason:Record<string,number>, samples:Array<object> }}
 */
export function summarizeInlineHostMoveDiag(state, nowMs) {
  const lastAtMs = Number(state?.lastAtMs) || 0;
  return {
    moveCount: Number(state?.count) || 0,
    reloadCount: Number(state?.reloadCount) || 0,
    venueOpenMoves: Number(state?.venueOpenMoves) || 0,
    duplicateSeen: Number(state?.duplicateSeen) || 0,
    lastMoveAgoMs: lastAtMs > 0 ? Math.max(0, Number(nowMs) - lastAtMs) : null,
    byReason: state?.byReason && typeof state.byReason === 'object' ? { ...state.byReason } : {},
    samples: Array.isArray(state?.samples) ? state.samples.slice(-INLINE_HOST_MOVE_SAMPLE_CAP) : []
  };
}
