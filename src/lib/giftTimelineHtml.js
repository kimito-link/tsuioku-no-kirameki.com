import { escapeAttr, escapeHtml } from '../shared/html/escape.js';

const W = 900;
const H = 320;
const PAD_X = 58;
const PAD_TOP = 42;
const PAD_BOTTOM = 54;
const INNER_W = W - PAD_X * 2;
const INNER_H = H - PAD_TOP - PAD_BOTTOM;
const PALETTE = {
  bg: '#0f172a',
  panel: '#111c33',
  stroke: '#334155',
  text: '#e2e8f0',
  muted: '#94a3b8',
  green: '#22c55e',
  amber: '#fbbf24',
  purple: '#a855f7',
  sky: '#38bdf8'
};

/**
 * @typedef {object} GiftTimelineGift
 * @property {unknown} [userId]
 * @property {unknown} [nickname]
 * @property {unknown} [senderName]
 * @property {unknown} [capturedAt]
 * @property {unknown} [firstObservedAt]
 * @property {unknown} [itemName]
 * @property {unknown} [throwCount]
 * @property {unknown} [point]
 * @property {unknown} [points]
 * @property {unknown} [totalPoints]
 */

/**
 * @typedef {object} NormalizedGift
 * @property {string} userId
 * @property {string} nickname
 * @property {string} itemName
 * @property {number} capturedAt
 * @property {number} throwCount
 * @property {number} amount
 * @property {'pt'|'件'} amountUnit
 */

/** @param {unknown} value */
function toFiniteTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) && t > 0 ? t : null;
  }
  if (typeof value === 'string' && value.trim()) {
    const t = Date.parse(value);
    return Number.isFinite(t) && t > 0 ? t : null;
  }
  return null;
}

/** @param {unknown} value */
function toThrowCount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

/**
 * @param {Record<string, unknown>} source
 * @param {string[]} keys
 */
function pickPositiveInteger(source, keys) {
  for (const key of keys) {
    const n = toThrowCount(source[key]);
    if (n > 0) return n;
  }
  return 0;
}

/**
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
function textOrFallback(value, fallback) {
  const s = String(value || '').trim();
  return s || fallback;
}

/**
 * @param {GiftTimelineGift[] | undefined} gifts
 * @returns {NormalizedGift[]}
 */
function normalizeGifts(gifts) {
  if (!Array.isArray(gifts)) return [];
  return gifts
    .map((gift) => {
      if (!gift || typeof gift !== 'object') return null;
      const record = /** @type {Record<string, unknown>} */ (gift);
      const capturedAt =
        toFiniteTimestamp(record.capturedAt) ?? toFiniteTimestamp(record.firstObservedAt);
      if (capturedAt === null) return null;
      const throwCount = toThrowCount(record.throwCount);
      if (throwCount <= 0) return null;
      const points = pickPositiveInteger(record, ['point', 'points', 'totalPoints']);
      const amount = points > 0 ? points : throwCount;
      const amountUnit = /** @type {'pt'|'件'} */ (points > 0 ? 'pt' : '件');
      return {
        userId: textOrFallback(record.userId, 'unknown'),
        nickname: textOrFallback(record.nickname, textOrFallback(record.senderName, '匿名ギフター')),
        itemName: textOrFallback(record.itemName, 'ギフト'),
        capturedAt,
        throwCount,
        amount,
        amountUnit
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.capturedAt - b.capturedAt);
}

/** @param {number} ms */
function formatElapsed(ms) {
  const safeMs = Math.max(0, ms);
  const totalSec = Math.floor(safeMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

/** @param {number} n */
function fmt(n) {
  return Number(n).toFixed(1);
}

/** @param {number} n */
function fmtInt(n) {
  return Math.max(0, Math.round(n)).toLocaleString('ja-JP');
}

/**
 * @param {NormalizedGift} gift
 * @param {number} maxAmount
 */
function pointColor(gift, maxAmount) {
  if (gift.amount >= Math.max(5, maxAmount * 0.72)) return PALETTE.purple;
  if (gift.amount >= Math.max(3, maxAmount * 0.42)) return PALETTE.amber;
  return PALETTE.sky;
}

/**
 * @param {number} startAt
 * @param {number} spanMs
 */
function buildXAxisLabels(startAt, spanMs) {
  return Array.from({ length: 5 }, (_, i) => {
    const ratio = i / 4;
    const x = PAD_X + INNER_W * ratio;
    const label = formatElapsed(spanMs * ratio);
    return `<line x1="${fmt(x)}" y1="${PAD_TOP}" x2="${fmt(x)}" y2="${PAD_TOP + INNER_H}" stroke="${PALETTE.stroke}" stroke-width="0.5" opacity="0.35"/>
<text x="${fmt(x)}" y="${H - 22}" text-anchor="middle" fill="${PALETTE.muted}" font-size="11">${escapeHtml(label)}</text>`;
  }).join('');
}

/** @param {number} maxValue */
function buildYAxisLabels(maxValue) {
  return Array.from({ length: 5 }, (_, i) => {
    const ratio = i / 4;
    const y = PAD_TOP + INNER_H * ratio;
    const value = Math.round(maxValue * (1 - ratio));
    return `<line x1="${PAD_X}" y1="${fmt(y)}" x2="${PAD_X + INNER_W}" y2="${fmt(y)}" stroke="${PALETTE.stroke}" stroke-width="0.5" opacity="0.35"/>
<text x="${PAD_X - 10}" y="${fmt(y + 4)}" text-anchor="end" fill="${PALETTE.muted}" font-size="11">${value}</text>`;
  }).join('');
}

/**
 * @param {{ elapsed: number, gift: NormalizedGift }[]} pointModels
 * @param {number} spanMs
 */
function summarizePeakWindow(pointModels, spanMs) {
  if (!pointModels.length) return null;
  const bucketMs = Math.max(60_000, Math.ceil(spanMs / 12));
  /** @type {Map<number, { bucket: number, amount: number, count: number }>} */
  const buckets = new Map();
  for (const model of pointModels) {
    const bucket = Math.floor(model.elapsed / bucketMs);
    const cur = buckets.get(bucket) || { bucket, amount: 0, count: 0 };
    cur.amount += model.gift.amount;
    cur.count += 1;
    buckets.set(bucket, cur);
  }
  let best = null;
  for (const bucket of buckets.values()) {
    if (
      best == null ||
      bucket.amount > best.amount ||
      (bucket.amount === best.amount && bucket.count > best.count)
    ) {
      best = bucket;
    }
  }
  if (!best || best.amount <= 0) return null;
  return {
    startMs: best.bucket * bucketMs,
    endMs: Math.min(spanMs, (best.bucket + 1) * bucketMs),
    amount: best.amount,
    count: best.count
  };
}

/**
 * @param {{ startMs: number, endMs: number, amount: number, count: number } | null} peakWindow
 * @param {number} spanMs
 * @param {'pt'|'件'|'pt/件'} unit
 */
function buildPeakWindowSvg(peakWindow, spanMs, unit) {
  if (!peakWindow) return '';
  const startRatio = Math.min(1, Math.max(0, peakWindow.startMs / spanMs));
  const endRatio = Math.min(1, Math.max(startRatio, peakWindow.endMs / spanMs));
  const x = PAD_X + INNER_W * startRatio;
  const width = Math.max(3, INNER_W * (endRatio - startRatio));
  const label = `盛り上がり ${formatElapsed(peakWindow.startMs)}-${formatElapsed(peakWindow.endMs)} / ${fmtInt(peakWindow.amount)}${unit} / ${peakWindow.count}件`;
  return `<rect class="mkt-gift-timeline__peak-window" x="${fmt(x)}" y="${PAD_TOP}" width="${fmt(width)}" height="${INNER_H}" fill="${PALETTE.amber}" opacity="0.13">
<title>${escapeHtml(label)}</title>
</rect>`;
}

/**
 * @param {string} liveId
 * @returns {string}
 */
function buildEmptySvg(liveId) {
  const aria = `${liveId} のギフトタイムライン。ギフト記録なし。`;
  return `<svg viewBox="0 0 ${W} ${H}" class="mkt-gift-timeline" role="img" aria-label="${escapeAttr(aria)}" xmlns="http://www.w3.org/2000/svg">
<title>${escapeHtml(aria)}</title>
<rect x="0" y="0" width="${W}" height="${H}" rx="14" fill="${PALETTE.bg}"/>
<rect x="${PAD_X}" y="${PAD_TOP}" width="${INNER_W}" height="${INNER_H}" fill="${PALETTE.panel}" stroke="${PALETTE.stroke}" stroke-width="0.5" rx="8"/>
<text x="${W / 2}" y="${H / 2 - 10}" text-anchor="middle" fill="${PALETTE.text}" font-size="20" font-weight="700">ギフト記録なし</text>
<text x="${W / 2}" y="${H / 2 + 18}" text-anchor="middle" fill="${PALETTE.muted}" font-size="13">まだギフトの時系列記録がありません</text>
<g aria-hidden="true">
<circle cx="${W / 2 - 80}" cy="${H / 2 + 52}" r="5" fill="${PALETTE.sky}" opacity="0.8"/>
<circle cx="${W / 2}" cy="${H / 2 + 52}" r="5" fill="${PALETTE.amber}" opacity="0.8"/>
<circle cx="${W / 2 + 80}" cy="${H / 2 + 52}" r="5" fill="${PALETTE.purple}" opacity="0.8"/>
<line x1="${W / 2 - 48}" y1="${H / 2 + 52}" x2="${W / 2 + 48}" y2="${H / 2 + 52}" stroke="${PALETTE.green}" stroke-width="2.2" opacity="0.75"/>
</g>
</svg>`;
}

/**
 * ギフト投入タイミングを、散布図と累積線の inline SVG として描画する。
 *
 * @param {{ liveId?: unknown, gifts?: GiftTimelineGift[], durationMs?: unknown }} input
 * @returns {string}
 */
export function buildGiftTimelineHtml(input = {}) {
  const liveId = textOrFallback(input.liveId, 'unknown live');
  const gifts = normalizeGifts(input.gifts);
  if (!gifts.length) return buildEmptySvg(liveId);

  const firstAt = gifts[0].capturedAt;
  const lastAt = gifts[gifts.length - 1].capturedAt;
  const requestedDuration =
    typeof input.durationMs === 'number' && Number.isFinite(input.durationMs) && input.durationMs > 0
      ? input.durationMs
      : 0;
  const spanMs = Math.max(requestedDuration, lastAt - firstAt, 60_000);
  const totalAmount = gifts.reduce((sum, gift) => sum + gift.amount, 0);
  const maxAmount = Math.max(...gifts.map((gift) => gift.amount));
  const maxY = Math.max(1, totalAmount, maxAmount);
  const unitSet = new Set(gifts.map((gift) => gift.amountUnit));
  const amountUnit = unitSet.size === 1 ? gifts[0].amountUnit : 'pt/件';
  const aria = `${liveId} のギフトタイムライン。${gifts.length}件、累積 ${fmtInt(totalAmount)} ${amountUnit}。`;

  let cumulative = 0;
  const pointModels = gifts.map((gift) => {
    const elapsed = Math.max(0, gift.capturedAt - firstAt);
    const x = PAD_X + INNER_W * Math.min(1, elapsed / spanMs);
    cumulative += gift.amount;
    const pointY = PAD_TOP + INNER_H - (gift.amount / maxY) * INNER_H;
    const lineY = PAD_TOP + INNER_H - (cumulative / maxY) * INNER_H;
    return { gift, elapsed, cumulative, x, pointY, lineY };
  });
  const peakWindow = summarizePeakWindow(pointModels, spanMs);

  const polylinePoints = pointModels
    .map((model) => `${fmt(model.x)},${fmt(model.lineY)}`)
    .join(' ');

  const points = pointModels
    .map((model) => {
      const { gift } = model;
      const r = Math.min(9, 4 + Math.sqrt(gift.amount));
      const amountText = `${fmtInt(gift.amount)}${gift.amountUnit}`;
      const tooltip = `${gift.nickname} (${gift.userId}) / ${gift.itemName} / ${formatElapsed(model.elapsed)} / ${amountText} / 累積 ${fmtInt(model.cumulative)}${amountUnit}`;
      return `<circle class="mkt-gift-timeline__point" cx="${fmt(model.x)}" cy="${fmt(model.pointY)}" r="${fmt(r)}" fill="${pointColor(gift, maxAmount)}" opacity="0.86" stroke="${PALETTE.bg}" stroke-width="1.4">
<title>${escapeHtml(tooltip)}</title>
</circle>`;
    })
    .join('');

  const peak = pointModels.reduce((best, model) => {
    if (!best || model.gift.amount > best.gift.amount) return model;
    return best;
  }, null);
  const peakLabel = peak
    ? `最大 ${fmtInt(peak.gift.amount)}${peak.gift.amountUnit}: ${peak.gift.nickname} (${formatElapsed(peak.elapsed)})`
    : '';

  return `<svg viewBox="0 0 ${W} ${H}" class="mkt-gift-timeline" role="img" aria-label="${escapeAttr(aria)}" xmlns="http://www.w3.org/2000/svg">
<title>${escapeHtml(aria)}</title>
<rect x="0" y="0" width="${W}" height="${H}" rx="14" fill="${PALETTE.bg}"/>
<text x="${PAD_X}" y="25" fill="${PALETTE.text}" font-size="16" font-weight="700">ギフトタイムライン</text>
<text x="${W - PAD_X}" y="25" text-anchor="end" fill="${PALETTE.muted}" font-size="12">${escapeHtml(liveId)}</text>
<rect x="${PAD_X}" y="${PAD_TOP}" width="${INNER_W}" height="${INNER_H}" fill="${PALETTE.panel}" stroke="${PALETTE.stroke}" stroke-width="0.5" rx="8"/>
${buildPeakWindowSvg(peakWindow, spanMs, amountUnit)}
${buildXAxisLabels(firstAt, spanMs)}
${buildYAxisLabels(maxY)}
<polyline class="mkt-gift-timeline__cumulative" points="${polylinePoints}" fill="none" stroke="${PALETTE.green}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
${points}
<text x="${PAD_X}" y="${H - 8}" fill="${PALETTE.muted}" font-size="11">経過時間（記録開始から）</text>
<text x="${PAD_X}" y="${PAD_TOP - 9}" fill="${PALETTE.muted}" font-size="11">${escapeHtml(amountUnit)} / 累積</text>
<g aria-hidden="true" font-size="11" fill="${PALETTE.muted}">
<circle cx="${W - 270}" cy="${H - 18}" r="5" fill="${PALETTE.sky}" opacity="0.86"/>
<text x="${W - 258}" y="${H - 14}">通常</text>
<circle cx="${W - 218}" cy="${H - 18}" r="5" fill="${PALETTE.amber}" opacity="0.86"/>
<text x="${W - 206}" y="${H - 14}">多め</text>
<circle cx="${W - 166}" cy="${H - 18}" r="5" fill="${PALETTE.purple}" opacity="0.86"/>
<text x="${W - 154}" y="${H - 14}">ピーク</text>
<line x1="${W - 98}" y1="${H - 18}" x2="${W - 70}" y2="${H - 18}" stroke="${PALETTE.green}" stroke-width="2.4"/>
<text x="${W - 62}" y="${H - 14}">累積</text>
</g>
<text x="${W - PAD_X}" y="${PAD_TOP - 9}" text-anchor="end" fill="${PALETTE.amber}" font-size="11">${escapeHtml(peakLabel)}</text>
</svg>`;
}
