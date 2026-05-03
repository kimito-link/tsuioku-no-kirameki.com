import { DEEP_HARVEST_REASONS } from './deepHarvestReason.js';

/**
 * NDGR がリアルタイムでコメントを提供している間は deep harvest（仮想リスト走査）を
 * スキップし、「コメントの滝」視覚的撹乱を防止する純関数。
 *
 * @param {{ ndgrLastReceivedAt: number|null|undefined, now: number, thresholdMs?: number }} opts
 * @returns {boolean} true = deep harvest をスキップすべき
 */
export function shouldSkipDeepHarvest({ ndgrLastReceivedAt, now, thresholdMs = 60_000 }) {
  if (!ndgrLastReceivedAt || ndgrLastReceivedAt <= 0) return false;
  const elapsed = now - ndgrLastReceivedAt;
  return elapsed < thresholdMs;
}

/**
 * deep harvest を NDGR 判定より優先して強制実行するかを reason で判定する。
 * 「滝」を最小化するため、初回 startup のみ許可する。
 *
 * @param {string} reason
 * @returns {boolean}
 */
export function shouldForceDeepHarvestForReason(reason) {
  return String(reason || '').trim() === DEEP_HARVEST_REASONS.startup;
}

/**
 * deep harvest が長時間走っていない場合に強制実行すべきか判定する純関数。
 * NDGR が活発でも、deep が一定時間実行されていなければ仮想リスト全域の
 * 取りこぼしを回収するために force で実行する。
 *
 * @param {{ lastCompletedAt: number|null|undefined, now: number, recoveryMs?: number }} opts
 * @returns {boolean} true = NDGR判定をバイパスして deep を強制実行すべき
 */
export function shouldForceDeepHarvestRecovery({ lastCompletedAt, now, recoveryMs = 240_000 }) {
  if (!lastCompletedAt || lastCompletedAt <= 0) return true;
  return now - lastCompletedAt > recoveryMs;
}
