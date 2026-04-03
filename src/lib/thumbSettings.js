/**
 * 定期サムネイル設定（ストレージ値の正規化）
 */

/** オフ + 30秒 / 1分 / 5分（E2E 用に localhost では別途短縮可＝content 側） */
export const THUMB_INTERVAL_PRESET_MS = Object.freeze([
  0,
  30_000,
  60_000,
  300_000
]);

/** モック・E2E 用の最短間隔（本番ホストでは thumbSettings では使わない） */
export const THUMB_INTERVAL_E2E_MS = 2_000;

const ALLOWED = new Set(THUMB_INTERVAL_PRESET_MS);

/**
 * @param {unknown} raw
 * @returns {number}
 */
export function normalizeThumbIntervalMs(raw) {
  const n = typeof raw === 'string' ? Number(raw) : Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (ALLOWED.has(n)) return n;
  return 0;
}

/**
 * localhost / 127.0.0.1 のときだけ E2E 用間隔を許可
 * @param {unknown} raw
 * @param {string} hostname
 */
export function normalizeThumbIntervalMsForHost(raw, hostname) {
  const h = String(hostname || '').toLowerCase();
  const isLocal = h === 'localhost' || h === '127.0.0.1';
  if (isLocal && Number(raw) === THUMB_INTERVAL_E2E_MS) return THUMB_INTERVAL_E2E_MS;
  return normalizeThumbIntervalMs(raw);
}

/** @param {unknown} v */
export function isThumbAutoEnabled(v) {
  return v === true;
}
