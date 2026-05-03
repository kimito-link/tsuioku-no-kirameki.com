/**
 * ライブ中に「公式 statistics コメント数」と「記録件数」の差が大きいとき、
 * quiet deep harvest を追加で走らせるか判定する純関数。
 * 配信終了後の `shouldRunEndedBulkHarvest` と併用する前提。
 *
 * @param {{
 *   recording: boolean,
 *   liveId: string|null|undefined,
 *   locationAllows: boolean,
 *   documentHidden: boolean,
 *   harvestRunning: boolean,
 *   now: number,
 *   lastTriggeredAt: number,
 *   cooldownMs: number,
 *   officialCommentCount: number|null|undefined,
 *   recordedCommentCount: number|null|undefined,
 *   minOfficial: number,
 *   minGapAbsolute: number,
 *   gapRatio: number
 * }} p
 * @returns {boolean}
 */
export function shouldTriggerOfficialGapDeepHarvest(p) {
  if (!p?.recording) return false;
  if (!p?.locationAllows) return false;
  const liveId = String(p?.liveId || '').trim();
  if (!liveId) return false;
  if (p?.documentHidden) return false;
  if (p?.harvestRunning) return false;

  const now = Math.max(0, Number(p.now) || 0);
  const last = Math.max(0, Number(p.lastTriggeredAt) || 0);
  const cooldown = Math.max(5000, Number(p.cooldownMs) || 55_000);
  if (last > 0 && now - last < cooldown) return false;

  const officialRaw = p.officialCommentCount;
  if (officialRaw == null || !Number.isFinite(officialRaw)) return false;
  const official = Math.max(0, Math.floor(Number(officialRaw)));
  const minOfficial = Math.max(0, Number(p.minOfficial) || 0);
  if (official < minOfficial) return false;

  const recRaw = p.recordedCommentCount;
  const rec =
    recRaw != null && Number.isFinite(recRaw)
      ? Math.max(0, Math.floor(Number(recRaw)))
      : 0;
  const gap = official - rec;

  const minAbs = Math.max(0, Number(p.minGapAbsolute) || 0);
  const ratio = Math.max(0, Number(p.gapRatio) || 0);
  const threshold = Math.max(minAbs, Math.floor(official * ratio));
  return gap >= threshold;
}
