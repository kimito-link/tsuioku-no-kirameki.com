/**
 * ギフト到着時の「画面ズームイン」演出 spec（純関数）。
 * SFC マリオ風 — 小さく見えた三キャラが手前へ迫る。DOM / 画像は popup-entry 側。
 */

/** @typedef {'small'|'medium'|'large'|'mega'} GiftBahamutTier */

/**
 * @typedef {Object} GiftBahamutSpec
 * @property {'gift_bahamut'} kind
 * @property {GiftBahamutTier} tier
 * @property {string} message
 * @property {number} durationMs
 * @property {string} dedupeKey
 * @property {number} point
 * @property {string} sender
 * @property {string} item
 * @property {number} scale
 */

/**
 * @param {number} point
 * @returns {GiftBahamutTier}
 */
export function giftBahamutTierFromPoints(point) {
  const pt = Number(point) || 0;
  if (pt >= 5000) return 'mega';
  if (pt >= 500) return 'large';
  if (pt >= 50) return 'medium';
  return 'small';
}

/**
 * ズーム peak 時の squad 倍率（--nl-bahamut-peak）
 * @param {GiftBahamutTier} tier
 * @returns {number}
 */
export function giftBahamutScaleForTier(tier) {
  if (tier === 'mega') return 2.7;
  if (tier === 'large') return 2.15;
  if (tier === 'medium') return 1.75;
  return 1.35;
}

/**
 * @param {GiftBahamutTier} tier
 * @returns {number}
 */
export function giftBahamutDurationMsForTier(tier) {
  if (tier === 'mega') return 3200;
  if (tier === 'large') return 2800;
  if (tier === 'medium') return 2400;
  return 2000;
}

/**
 * @param {{ sender: string, item: string, point: number }} parsed
 * @param {string} commentDedupeKey
 * @returns {GiftBahamutSpec|null}
 */
export function pickGiftBahamutCelebration(parsed, commentDedupeKey) {
  if (!parsed || !commentDedupeKey) return null;
  const sender = String(parsed.sender || '').trim();
  const item = String(parsed.item || '').trim();
  const point = Number(parsed.point) || 0;
  if (!sender || !item || point <= 0) return null;

  const tier = giftBahamutTierFromPoints(point);
  const ptLabel = point.toLocaleString('ja-JP');
  const message =
    tier === 'mega'
      ? `${sender}さんの ${item}（${ptLabel}pt）！`
      : tier === 'large'
        ? `ギフト ${item}（${ptLabel}pt）`
        : `${sender}さんが ${item} を贈りました`;

  return {
    kind: 'gift_bahamut',
    tier,
    message,
    durationMs: giftBahamutDurationMsForTier(tier),
    dedupeKey: `gift_bahamut_${commentDedupeKey}`,
    point,
    sender,
    item,
    scale: giftBahamutScaleForTier(tier)
  };
}

/** 連続ギフト spam 抑制（ms） */
export const GIFT_BAHAMUT_MIN_GAP_MS = 1600;
