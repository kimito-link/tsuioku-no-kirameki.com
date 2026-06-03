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
 * @property {'mixed'} characterSet
 * @property {string} [sender]
 * @property {string} [item]
 * @property {number} [point]
 * @property {string} [sourceDedupeKey]
 */

export const SELF_ACTION_CELEBRATION_MIN_GAP_MS = 2500;
export const SELF_ACTION_GIFT_ZOOM_MIN_POINT = 50;
/** 自分広告をパチンコ風（多段ドロップ＋ ad_throw 級）にする最低 pt */
export const SELF_ACTION_AD_PACHINKO_MIN_POINT = 30;

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
    characterSet: 'mixed',
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
  const pachinko = point >= SELF_ACTION_AD_PACHINKO_MIN_POINT;
  return {
    kind: 'self_ad',
    message,
    durationMs: pachinko ? (point >= 500 ? 3000 : point >= 100 ? 2700 : 2500) : 1900,
    sessionDedupeKey: dedupeKey('self_ad', opts.sessionDedupeKey),
    dropCount: pachinko
      ? Math.min(34, 14 + Math.floor(point / 12))
      : point >= 500
        ? 12
        : 10,
    characterSet: 'mixed',
    sender: cleanText(opts.sender),
    point,
    sourceDedupeKey: cleanText(opts.sourceDedupeKey)
  };
}

/**
 * 自分広告をパチンコ風の ad_throw 演出（他者広告と同系の多段ドロップ）に載せ替える。
 * @param {SelfActionCelebrationSpec} spec
 * @returns {import('./supportCelebration.js').SupportCelebrationSpec|null}
 */
export function selfAdCelebrationAsPachinkoThrow(spec) {
  if (!spec || spec.kind !== 'self_ad') return null;
  const point = nonNegativeInt(spec.point);
  if (point < SELF_ACTION_AD_PACHINKO_MIN_POINT) return null;
  return {
    kind: 'ad_throw',
    message: spec.message,
    dropCount: Math.min(36, Math.max(16, Number(spec.dropCount) || 14)),
    durationMs: Math.max(2400, Number(spec.durationMs) || 2500),
    dedupeKey: `self_ad_pachi_${spec.sessionDedupeKey}`,
    characterSet: 'mixed',
    dropVariant: 'rinku_deluge'
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

/**
 * @param {SelfActionCelebrationKind} kind
 * @param {number|null|undefined} point
 * @returns {boolean}
 */
export function selfActionUsesAdPachinko(kind, point) {
  return kind === 'self_ad' && nonNegativeInt(point) >= SELF_ACTION_AD_PACHINKO_MIN_POINT;
}
