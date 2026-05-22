/**
 * 公式 DOM bundle の programStats.watchCount（累計来場）を snapshot に補完する。
 *
 * watchCount は viewerCountFromDom（来場カード・本家寄せ帯の「来場」）と同義の累計指標であり、
 * snapshot.officialViewerCount（WS statistics.viewers 系列＝resolveConcurrentViewers の direct 判定用）
 * には流し込まない。誤って入れると推定同接カードが来場と同じ数字になる（0.1.278 修正）。
 *
 * 🐛 修正(2026-05-22 v0.1.301): 旧実装は viewerCountFromDom が既に入っていると watchCount を
 * 無視していたため、「来場者数」カード（viewerCountFromDom=WS由来 522）と「来場」チップ
 * （officialNicoStatsStripDigest が watchCount を最優先＝927）で同じ指標が食い違っていた。
 * niconico プレイヤー DOM の watchCount は公式の正本（リアルタイム data-value）であり、
 * WS 由来の viewerCountFromDom より信頼できる。よって watchCount があるときはそれを
 * **優先**して viewerCountFromDom を上書きし、カードとチップを同一の正本値に揃える。
 * （チップ側 pickViewerCountForOfficialStrip も officialViewerCount=watchCount を最優先する
 *  ため、両者が watchCount に一致する。）
 *
 * @param {Record<string, unknown>|null|undefined} snapshot
 * @param {Record<string, unknown>|null|undefined} programStats
 * @returns {Record<string, unknown>|null|undefined}
 */
export function mergeProgramStatsWatchIntoWatchMetaSnapshot(
  snapshot,
  programStats
) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  if (!programStats || typeof programStats !== 'object') return snapshot;
  const wc = programStats.watchCount;
  if (typeof wc !== 'number' || !Number.isFinite(wc) || wc < 0) return snapshot;
  const vcd = snapshot.viewerCountFromDom;
  // 既に同値なら新オブジェクトを作らない（無駄な再描画を避ける）。
  if (typeof vcd === 'number' && Number.isFinite(vcd) && vcd === wc) {
    return snapshot;
  }
  // 公式 watchCount を正本として優先（カードとチップを揃える）。
  return { ...snapshot, viewerCountFromDom: wc };
}
