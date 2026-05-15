/**
 * 公式 DOM bundle の programStats.watchCount（累計来場）を snapshot に補完する。
 *
 * watchCount は viewerCountFromDom（来場カード・本家寄せ帯の「来場」）と同義の累計指標であり、
 * snapshot.officialViewerCount（WS statistics.viewers 系列＝resolveConcurrentViewers の direct 判定用）
 * には流し込まない。誤って入れると推定同接カードが来場と同じ数字になる（0.1.278 修正）。
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
  if (typeof vcd === 'number' && Number.isFinite(vcd) && vcd >= 0) {
    return snapshot;
  }
  return { ...snapshot, viewerCountFromDom: wc };
}
