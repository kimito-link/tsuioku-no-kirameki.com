/**
 * アプリから自分が操作した直後に返す軽量演出の spec。
 * 節目演出の storage dedupe とは分離し、popup セッション内の重複抑制だけに使う。
 */

/** @typedef {'self_comment'|'self_gift'|'self_ad'} SelfActionCelebrationKind */

/**
 * @typedef {Object} SelfActionCelebrationSpec
 * @property {SelfActionCelebrationKind} kind
 * @property {string} message
 * @property {number} durationMs
 * @property {string} sessionDedupeKey
 * @property {number} dropCount
 * @property {'mixed'|'konta'} characterSet
 * @property {string} [sender]
 * @property {string} [item]
 * @property {number} [point]
 * @property {string} [sourceDedupeKey]
 */

export const SELF_ACTION_CELEBRATION_MIN_GAP_MS = 2500;
export const SELF_ACTION_GIFT_ZOOM_MIN_POINT = 50;

/**
 * @param {unknown} value
 * @returns {number}
 */
function nonNegativeInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} prefix
 * @param {unknown} value
 * @returns {string}
 */
function dedupeKey(prefix, value) {
  const raw = cleanText(value);
  return raw || prefix;
}

/**
 * @param {{ sessionDedupeKey?: string }} [opts]
 * @returns {SelfActionCelebrationSpec}
 */
export function buildSelfCommentCelebrationSpec(opts = {}) {
  return {
    kind: 'self_comment',
    message: 'コメント送信！',
    durationMs: 1800,
    sessionDedupeKey: dedupeKey('self_comment', opts.sessionDedupeKey),
    dropCount: 6,
    characterSet: 'mixed'
  };
}

/**
 * @param {{ sender?: string, item?: string, point?: number, sessionDedupeKey?: string, sourceDedupeKey?: string }} [opts]
 * @returns {SelfActionCelebrationSpec}
 */
export function buildSelfGiftCelebrationSpec(opts = {}) {
  const point = nonNegativeInt(opts.point);
  const item = cleanText(opts.item);
  const ptLabel = point > 0 ? `${point.toLocaleString('ja-JP')}pt` : '';
  const itemLabel = item ? `「${item}」` : 'ギフト';
  const message =
    point >= SELF_ACTION_GIFT_ZOOM_MIN_POINT
      ? `${itemLabel} ${ptLabel}！`
      : 'ギフト届いた！';
  return {
    kind: 'self_gift',
    message,
    durationMs: point >= SELF_ACTION_GIFT_ZOOM_MIN_POINT ? 2200 : 1900,
    sessionDedupeKey: dedupeKey('self_gift', opts.sessionDedupeKey),
    dropCount: point >= SELF_ACTION_GIFT_ZOOM_MIN_POINT ? 10 : 8,
    characterSet: 'konta',
    sender: cleanText(opts.sender),
    item,
    point,
    sourceDedupeKey: cleanText(opts.sourceDedupeKey)
  };
}

/**
 * @param {{ sender?: string, point?: number, sessionDedupeKey?: string, sourceDedupeKey?: string }} [opts]
 * @returns {SelfActionCelebrationSpec}
 */
export function buildSelfAdCelebrationSpec(opts = {}) {
  const point = nonNegativeInt(opts.point);
  const message = point > 0
    ? `${point.toLocaleString('ja-JP')}pt 広告！`
    : '広告ありがとう！';
  return {
    kind: 'self_ad',
    message,
    durationMs: point >= 500 ? 2200 : 1900,
    sessionDedupeKey: dedupeKey('self_ad', opts.sessionDedupeKey),
    dropCount: point >= 500 ? 9 : 7,
    characterSet: 'konta',
    sender: cleanText(opts.sender),
    point,
    sourceDedupeKey: cleanText(opts.sourceDedupeKey)
  };
}

/**
 * 本人ギフトだけ、一定以上の pt で既存のギフトズームを使う。
 * @param {SelfActionCelebrationKind} kind
 * @param {number|null|undefined} point
 * @returns {boolean}
 */
export function selfActionUsesGiftZoom(kind, point) {
  return kind === 'self_gift' && nonNegativeInt(point) >= SELF_ACTION_GIFT_ZOOM_MIN_POINT;
}
