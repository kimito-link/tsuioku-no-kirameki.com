/**
 * Cross-frame gift relay messages are accepted only from NicoNico/local-dev
 * child frames. Without this guard, any iframe embedded on a watch page could
 * spoof NLS_GIFT_HISTORY_FROM_IFRAME and poison local storage.
 */

export const GIFT_RELAY_MESSAGE_TYPES = [
  'NLS_GIFT_SUBAPP_RELAY_HEARTBEAT',
  'NLS_GIFT_HISTORY_FROM_IFRAME'
];

/**
 * @param {string} raw
 * @returns {URL|null}
 */
function parseUrl(raw) {
  try {
    return new URL(String(raw || ''));
  } catch {
    return null;
  }
}

/**
 * @param {string} host
 * @returns {boolean}
 */
function isTrustedRelayHost(host) {
  const h = String(host || '').trim().toLowerCase();
  return (
    h === 'nicovideo.jp' ||
    h.endsWith('.nicovideo.jp') ||
    h === '127.0.0.1:3456' ||
    h === 'localhost:3456'
  );
}

/**
 * @param {string} rawUrl
 * @returns {boolean}
 */
function isTrustedRelayUrl(rawUrl) {
  const url = parseUrl(rawUrl);
  if (!url) return false;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  return isTrustedRelayHost(url.host);
}

/**
 * v0.1.234 修正: frameUrl 必須化 + origin 一致検証。
 *
 * 旧実装の脆弱性:
 *   1. frameUrl が空文字なら trust 判定を passthrough していた → trusted な
 *      別 iframe（例: niconico 配下の他コンテンツ）が空 frameUrl で偽装可能
 *   2. origin と frameUrl の origin 一致を見ていなかった → trusted な別 iframe が
 *      `frameUrl: 'https://audition.nicovideo.jp/...'` と名乗ることが可能
 *
 * 本修正:
 *   - frameUrl 必須（empty / 不正 URL は false）
 *   - frameUrl の origin が e.origin と一致することを必須化
 *   - frameUrl の host が許可 host（audition / koken / nicoad / gift / *.nicovideo.jp）
 *     に該当することを必須化（旧と同じ）
 *
 * @param {{
 *   data?: unknown,
 *   origin?: string,
 *   isSelfSource?: boolean
 * }} eventLike
 * @returns {boolean}
 */
export function isTrustedGiftSubAppRelayMessage(eventLike) {
  const data = eventLike?.data;
  if (!data || typeof data !== 'object') return false;
  const type = String(/** @type {{ type?: unknown }} */ (data).type || '');
  if (!GIFT_RELAY_MESSAGE_TYPES.includes(type)) return false;
  if (eventLike?.isSelfSource === true) return false;

  const origin = String(eventLike?.origin || '');
  if (!isTrustedRelayUrl(origin)) return false;

  const frameUrl = String(/** @type {{ frameUrl?: unknown }} */ (data).frameUrl || '');
  // v0.1.234: frameUrl 必須（空 / 不正 → reject）
  if (!frameUrl) return false;
  const frameUrlParsed = parseUrl(frameUrl);
  if (!frameUrlParsed) return false;
  if (!isTrustedRelayHost(frameUrlParsed.host)) return false;
  // v0.1.234: frameUrl の origin が e.origin と一致することを必須化
  //   （trusted host のうち別 iframe が他 iframe の URL を名乗るのを阻止）
  if (frameUrlParsed.origin !== origin) return false;
  return true;
}
