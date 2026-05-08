/**
 * v0.1.201: 拡張の network 層異常を診断 JSON 用に集約する純関数。
 *
 * 既存散在していた `nicoadFetchStatus`（data-nls-nicoad-fetch 属性）と、
 * NDGR 最終受信時刻 / reconnect カウンタ / service worker 状態を、
 * 1 ブロック `networkErrorProbe` にまとめて出すための変換関数。
 *
 * ndgrConnectStatus の判定:
 *   - lastReceivedAgoMs が null/未取得 → 'unknown'
 *   - lastReceivedAgoMs <= 60_000 → 'connected'
 *   - それ以外 → 'disconnected'
 *
 * 副作用なし。
 */

const NDGR_DISCONNECT_THRESHOLD_MS = 60_000;

/**
 * @typedef {{
 *   nicoadFetchStatus?: string,
 *   nicoadFetchErrors?: any,
 *   ndgrLastReceivedAgoMs?: number|null,
 *   ndgrReconnectCount?: number,
 *   ndgrLastError?: string|null,
 *   serviceWorkerInactive?: boolean
 * }} NetworkProbeInput
 *
 * @typedef {{
 *   nicoadFetchStatus: string,
 *   nicoadFetchErrorMessages: string[],
 *   ndgrConnectStatus: 'connected'|'disconnected'|'unknown',
 *   ndgrLastError: string|null,
 *   ndgrReconnectCount: number,
 *   serviceWorkerInactive: boolean
 * }} NetworkErrorProbe
 */

/**
 * @param {NetworkProbeInput|null|undefined} input
 * @returns {NetworkErrorProbe}
 */
export function buildNetworkErrorProbe(input) {
  /** @type {NetworkErrorProbe} */
  const empty = {
    nicoadFetchStatus: 'never',
    nicoadFetchErrorMessages: [],
    ndgrConnectStatus: 'unknown',
    ndgrLastError: null,
    ndgrReconnectCount: 0,
    serviceWorkerInactive: false
  };
  if (!input || typeof input !== 'object') return empty;

  const nicoadFetchStatus =
    typeof input.nicoadFetchStatus === 'string' && input.nicoadFetchStatus
      ? input.nicoadFetchStatus
      : 'never';

  /** @type {string[]} */
  const errs = [];
  if (Array.isArray(input.nicoadFetchErrors)) {
    for (const e of input.nicoadFetchErrors) {
      if (typeof e === 'string' && e.length > 0) errs.push(e);
      if (errs.length >= 5) break;
    }
  }

  /** @type {'connected'|'disconnected'|'unknown'} */
  let ndgrConnectStatus = 'unknown';
  const ago = input.ndgrLastReceivedAgoMs;
  if (typeof ago === 'number' && Number.isFinite(ago) && ago >= 0) {
    ndgrConnectStatus =
      ago <= NDGR_DISCONNECT_THRESHOLD_MS ? 'connected' : 'disconnected';
  }

  const ndgrReconnectCount =
    typeof input.ndgrReconnectCount === 'number' &&
    Number.isFinite(input.ndgrReconnectCount)
      ? Math.max(0, input.ndgrReconnectCount | 0)
      : 0;

  const ndgrLastError =
    typeof input.ndgrLastError === 'string' && input.ndgrLastError
      ? input.ndgrLastError
      : null;

  const serviceWorkerInactive = !!input.serviceWorkerInactive;

  return {
    nicoadFetchStatus,
    nicoadFetchErrorMessages: errs,
    ndgrConnectStatus,
    ndgrLastError,
    ndgrReconnectCount,
    serviceWorkerInactive
  };
}
