/**
 * 配信終了フラグ。
 *
 * content が watch ページの DOM から「配信終了」を検知したとき、
 * `nls_live_ended_<lv>` に終了時刻を記録する。status / Web版がこれを読み、
 * 「視聴中の配信」に残ったまま更新が止まった終了枠へ ⚠ マークを付けて
 * ノイズと区別する(タブを閉じない限り tabs.query には残るため)。
 *
 * panel_summary(コメント記録の正本)とは独立した小さい別キー。
 *
 * @module liveEndedFlag
 */

/** 終了フラグの storage キー接頭辞。 */
export const LIVE_ENDED_PREFIX = 'nls_live_ended_';

/**
 * @param {string} liveId
 * @returns {string}
 */
export function liveEndedStorageKey(liveId) {
  const id = String(liveId || '').trim().toLowerCase();
  return `${LIVE_ENDED_PREFIX}${id}`;
}

/**
 * @param {{ liveId?: string, endedAt?: number }} [opts]
 * @returns {{ liveId: string, endedAt: number }}
 */
export function buildLiveEndedFlag(opts = {}) {
  const endedAt = Number(opts.endedAt);
  return {
    liveId: String(opts.liveId || '').trim().toLowerCase(),
    endedAt: Number.isFinite(endedAt) && endedAt > 0 ? Math.floor(endedAt) : 0
  };
}

/**
 * @param {unknown} obj
 * @returns {boolean}
 */
export function isLiveEndedFlag(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const o = /** @type {Record<string, unknown>} */ (obj);
  return typeof o.liveId === 'string' && typeof o.endedAt === 'number' && o.endedAt > 0;
}
