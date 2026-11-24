/**
 * 「配信者」カード／バナーのサムネ。ゆっくり顔へ倒さず、本人アイコンか中立な「未取得」を使う。
 */
import {
  broadcasterMemoryKey,
  lastKnownBroadcasterAvatar,
  pickBroadcasterDisplaySrc,
  pickBroadcasterErrorFallbackSrc,
  rememberBroadcasterAvatar
} from '../../lib/broadcasterAvatarDisplay.js';

/**
 * @param {{ pageUrl?: unknown, name?: unknown, iconUrl?: unknown }|null|undefined} target
 * @returns {{ userKey: string, src: string }}
 */
export function resolveCasterThumb(target) {
  const userKey = broadcasterMemoryKey({ pageUrl: target?.pageUrl, name: target?.name });
  const src = pickBroadcasterDisplaySrc({
    requestedSrc: target?.iconUrl || '',
    guardDisplaySrc: target?.iconUrl || '',
    lastKnownSrc: lastKnownBroadcasterAvatar(userKey),
    userKey
  });
  return { userKey, src };
}

/**
 * @param {HTMLImageElement} img
 * @param {{ pageUrl?: unknown, name?: unknown, iconUrl?: unknown }|null|undefined} target
 * @returns {string} userKey
 */
export function bindCasterThumbElement(img, target) {
  const { userKey, src } = resolveCasterThumb(target);
  img.src = src;
  img.onload = () => {
    rememberBroadcasterAvatar(userKey, img.currentSrc || img.src);
  };
  img.onerror = () => {
    const next = pickBroadcasterErrorFallbackSrc({
      failedSrc: img.currentSrc || img.src,
      userKey
    });
    if (next && img.src !== next) img.src = next;
  };
  return userKey;
}

/**
 * @param {HTMLImageElement} node
 */
export function bindNeutralAvatarError(node) {
  const apply = () => {
    try {
      const userKey = node.dataset.fallbackUserKey || 'broadcaster';
      const next = pickBroadcasterErrorFallbackSrc({
        failedSrc: node.currentSrc || node.src,
        userKey
      });
      if (next && node.src !== next) node.src = next;
    } catch {
      /* ignore */
    }
  };
  node.addEventListener('error', apply, { once: true });
  if (node.complete && node.naturalWidth === 0) apply();
}

/**
 * @param {{ pageUrl?: unknown, name?: unknown, iconUrl?: unknown }|null|undefined} target
 * @param {(s: string) => string} escapeAttr
 * @returns {string}
 */
export function casterThumbImgHtml(target, escapeAttr) {
  const { userKey, src } = resolveCasterThumb(target);
  return `<img class="nl-top-support-rank__caster-thumb" src="${escapeAttr(src)}" alt="" decoding="async" referrerpolicy="no-referrer" data-on-error-fallback="neutral" data-fallback-user-key="${escapeAttr(userKey)}" />`;
}
