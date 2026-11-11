/**
 * 配信サービスが公開している数字だけを出す。印が無い配信（ニコ生・YouTube）は今までどおり。
 * 画面はサービスの名前で分岐せず、この印だけを見る。
 * @param {any} snapshot
 */
export function serviceMetricsOf(snapshot) {
  const m = snapshot?.serviceMetrics;
  return m && typeof m === 'object' ? m : null;
}

/**
 * 帯・カードから外すキー。来場者数は visitor、チップの来場は viewers。
 * @param {any} snapshot
 * @returns {string[]}
 */
export function omittedOfficialStatKeys(snapshot) {
  const m = serviceMetricsOf(snapshot);
  if (!m) return [];
  /** @type {string[]} */
  const out = [];
  if (m.visitors === false) out.push('visitor', 'viewers');
  if (m.adPoints === false) out.push('adPts');
  if (m.giftPoints === false) out.push('giftPts');
  const n = snapshot?.slotCommentCount;
  const hasComments = typeof n === 'number' && n > 0;
  if (m.officialComments === false) out.push('comments');
  else if (m.commentLabel && !hasComments) out.push('comments');
  const views = snapshot?.slotViewCount;
  const hasViews = typeof views === 'number' && views > 0;
  if (m.estimateConcurrent === false && !hasViews) out.push('concurrent');
  return out;
}

/**
 * 北極星レーンを出さないサービスか。
 * @param {any} snapshot
 * @param {unknown} laneId
 */
export function laneHiddenByService(snapshot, laneId) {
  const m = serviceMetricsOf(snapshot);
  if (!m) return false;
  const id = String(laneId || '');
  if (id === 'contributionRanking' && m.paidRank === false) return true;
  if (id === 'adRanking' && m.adPoints === false) return true;
  if (id === 'giftHistory' && m.giftHistory === false) return true;
  return false;
}
