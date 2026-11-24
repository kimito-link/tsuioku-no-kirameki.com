/**
 * 【層】L0 判定層(純粋関数。記憶は任意のメモリ Map のみ・storage もネットワークも禁止)
 * 【この箱に入るもの】配信者の表示 src を決める。ゆっくり顔・identicon・合成顔は使わない。
 * 【この箱に入らないもの】画像の読み込み・プローブ・DOM(正本は supportGrowthAvatarLoad.js)
 * 【書けるstorageキー】なし
 * 【正本宣言】イベント順位の配信者タイルと「配信者」カードの、未確定・失敗時の表示 src の入口。
 *
 * 匿名の応援者・サムネが取れない視聴者のゆっくり顔は、avatarFallbackFromUrl.js のまま変えない。
 *
 * @module broadcasterAvatarDisplay
 */
import { isHttpOrHttpsUrl } from './supportGrowthTileSrc.js';
import { officialDomRankBadgeThumb } from './topSupportRankStripLines.js';

/**
 * ゆっくり顔・identicon・合成顔の src か。中立な「未取得」バッジは含めない。
 * @param {unknown} src
 * @returns {boolean}
 */
export function isYukkuriOrIdenticonSrc(src) {
  const s = String(src == null ? '' : src).trim();
  if (!s) return false;
  if (
    /yukkuri-charactore-english|konta-yukkuri-icon|link-yukkuri|tanuki-yukkuri|kitsune-yukkuri/i.test(
      s
    )
  ) {
    return true;
  }
  if (s.startsWith('data:image/svg+xml')) {
    return !svgPayloadContainsUnobtained(s);
  }
  return false;
}

/**
 * @param {string} s
 * @returns {boolean}
 */
function svgPayloadContainsUnobtained(s) {
  const comma = s.indexOf(',');
  const payload = comma >= 0 ? s.slice(comma + 1) : s;
  if (payload.includes('未取得') || payload.includes('%E6%9C%AA%E5%8F%96%E5%BE%97')) {
    return true;
  }
  try {
    return decodeURIComponent(payload).includes('未取得');
  } catch {
    return false;
  }
}

/**
 * pageUrl や数値 uid、表示名から配信者の記憶キーを取る。
 * @param {{ pageUrl?: unknown, name?: unknown, userKey?: unknown }|null|undefined} target
 * @returns {string}
 */
export function broadcasterMemoryKey(target) {
  const userKey = String(target?.userKey == null ? '' : target.userKey).trim();
  if (/^\d{1,18}$/.test(userKey)) return userKey;
  const fromKey = extractBroadcasterUid(userKey);
  if (fromKey) return fromKey;
  const fromPage = extractBroadcasterUid(String(target?.pageUrl == null ? '' : target.pageUrl));
  if (fromPage) return fromPage;
  if (userKey) return userKey;
  const name = String(target?.name == null ? '' : target.name).trim();
  return name || 'broadcaster';
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function extractBroadcasterUid(value) {
  const t = String(value == null ? '' : value).trim();
  if (/^\d{1,18}$/.test(t)) return t;
  const page = t.match(/\/user\/(\d{1,18})\/?$/i) || t.match(/\/user\/(\d{1,18})(?:[/?#]|$)/i);
  if (page) return page[1];
  const icon = t.match(/\/usericon\/(?:[sm]\/)?\d+\/(\d{1,14})\.(?:jpe?g|png|gif|webp)/i);
  return icon ? icon[1] : '';
}

/** @type {Map<string, string>} */
const lastKnownByKey = new Map();

/**
 * 直前まで出ていた本人アイコンを覚える（メモリのみ）。
 * @param {unknown} userKey
 * @param {unknown} src
 */
export function rememberBroadcasterAvatar(userKey, src) {
  const s = String(src == null ? '' : src).trim();
  if (!isHttpOrHttpsUrl(s) || isYukkuriOrIdenticonSrc(s)) return;
  const keys = new Set();
  const k = String(userKey == null ? '' : userKey).trim();
  if (k) keys.add(k);
  const uid = extractBroadcasterUid(k) || extractBroadcasterUid(s);
  if (uid) keys.add(uid);
  for (const key of keys) lastKnownByKey.set(key, s);
}

/**
 * @param {unknown} userKey
 * @returns {string}
 */
export function lastKnownBroadcasterAvatar(userKey) {
  const k = String(userKey == null ? '' : userKey).trim();
  if (k && lastKnownByKey.has(k)) return lastKnownByKey.get(k) || '';
  const uid = extractBroadcasterUid(k);
  if (uid && lastKnownByKey.has(uid)) return lastKnownByKey.get(uid) || '';
  return '';
}

/** Vitest 用 */
export function resetBroadcasterAvatarMemoryForTests() {
  lastKnownByKey.clear();
}

/**
 * 配信者の表示 src。ゆっくり顔には倒さない。
 *
 * 優先順: 確認済みの本人 HTTP アイコン → 直前の本人アイコン → 中立な「未取得」バッジ。
 * 未確認の HTTP URL そのものは出さない（404 のちらつきを避ける。プローブは呼び出し側の
 * 既存 noteRemoteAttempt が成功時に img.src を差し替える）。
 *
 * @param {{
 *   requestedSrc?: unknown,
 *   guardDisplaySrc?: unknown,
 *   lastKnownSrc?: unknown,
 *   placeNumber?: number|null,
 *   userKey?: unknown
 * }} p
 * @returns {string}
 */
export function pickBroadcasterDisplaySrc(p) {
  const requested = String(p?.requestedSrc == null ? '' : p.requestedSrc).trim();
  const fromGuard = String(p?.guardDisplaySrc == null ? '' : p.guardDisplaySrc).trim();
  const userKey = String(p?.userKey == null ? '' : p.userKey).trim();
  const lastKnown = String(
    p?.lastKnownSrc == null ? lastKnownBroadcasterAvatar(userKey) : p.lastKnownSrc
  ).trim();
  const place = p?.placeNumber ?? null;

  const usable = (/** @type {string} */ s) => Boolean(s) && !isYukkuriOrIdenticonSrc(s);
  const usableHttp = (/** @type {string} */ s) => usable(s) && isHttpOrHttpsUrl(s);

  if (usableHttp(fromGuard)) {
    rememberBroadcasterAvatar(userKey, fromGuard);
    return fromGuard;
  }
  if (usableHttp(lastKnown)) return lastKnown;
  if (usable(requested) && !isHttpOrHttpsUrl(requested)) return requested;
  if (usable(fromGuard) && !isHttpOrHttpsUrl(fromGuard)) return fromGuard;
  return officialDomRankBadgeThumb(place, userKey || requested || 'broadcaster');
}

/**
 * 配信者アイコンの読み込み失敗時。失敗した URL と同じ最後の本人アイコンは使わず、
 * 別の最後の本人アイコンか中立バッジへ倒す（onerror のループを避ける）。
 *
 * @param {{ failedSrc?: unknown, userKey?: unknown, placeNumber?: number|null }} p
 * @returns {string}
 */
export function pickBroadcasterErrorFallbackSrc(p) {
  const failed = String(p?.failedSrc == null ? '' : p.failedSrc).trim();
  const userKey = String(p?.userKey == null ? '' : p.userKey).trim();
  const last = lastKnownBroadcasterAvatar(userKey);
  if (
    last &&
    last !== failed &&
    isHttpOrHttpsUrl(last) &&
    !isYukkuriOrIdenticonSrc(last)
  ) {
    return last;
  }
  return officialDomRankBadgeThumb(p?.placeNumber ?? null, userKey || 'broadcaster');
}
