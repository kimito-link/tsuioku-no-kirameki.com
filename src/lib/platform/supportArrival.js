/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】応援が届いた時刻と、その直前のコメントの対応
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし
 * 【正本宣言】種類の名前は platformMetrics.js の supportArrival だけ
 *
 * supportArrival.js — 記録にある応援を時刻順に並べ、直前60秒を両端の添字で見る。
 */

import { niconicoArrivalSentence } from '../arrivalNoticeRows.js';
import { platformCapability } from './platformMetrics.js';

export const SUPPORT_ARRIVAL_ROW_CAP = 50;
export const SUPPORT_ARRIVAL_WINDOW_MS = 60_000;
export const SUPPORT_ARRIVAL_BUCKET_MS = 5 * 60_000;
const EXCERPT_MAX = 24;
const EXCERPT_COUNT = 3;
const CONTEXT_COUNT = 3;

/**
 * @param {unknown} row
 * @returns {number}
 */
function atOf(row) {
  const n = Number(/** @type {{ capturedAt?: unknown }} */ (row || {}).capturedAt);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @param {unknown} platformId
 * @returns {readonly import('./platformMetrics.js').SupportArrivalSpec[]}
 */
export function supportArrivalSpecs(platformId) {
  const cap = platformCapability(String(platformId || ''));
  const list = /** @type {{ supportArrival?: readonly import('./platformMetrics.js').SupportArrivalSpec[] }} */ (cap).supportArrival;
  return Array.isArray(list) ? list : [];
}

/**
 * @param {object} row
 * @param {readonly import('./platformMetrics.js').SupportArrivalSpec[]} specs
 */
function matchSpec(row, specs) {
  const kind = String(/** @type {{ ytKind?: unknown }} */ (row).ytKind || '');
  if (!kind || kind === 'text') return null;
  const cur = String(/** @type {{ ytCurrency?: unknown }} */ (row).ytCurrency || '').trim().toUpperCase();
  const sub = String(/** @type {{ subEvent?: unknown }} */ (row).subEvent || '');
  for (const spec of specs) {
    if (!spec.kinds.includes(kind)) continue;
    if (spec.currency && cur !== spec.currency) continue;
    if (spec.subEvent && sub !== spec.subEvent) continue;
    return spec;
  }
  return null;
}

/**
 * @param {object} row
 * @param {string} platformId
 */
function isContextRow(row, platformId) {
  const kind = String(/** @type {{ ytKind?: unknown }} */ (row).ytKind || '');
  if (kind === 'tw_raid' || kind === 'kk_host' || kind === 'follow' || kind === 'tw_hype') return true;
  if (/** @type {{ isSystem?: unknown }} */ (row).isSystem === true) return true;
  const commentType = String(/** @type {{ commentType?: unknown }} */ (row).commentType || '');
  if (commentType === 'generalSystemMessage' || commentType === 'followNotice') return true;
  if (platformId === 'niconico' && niconicoArrivalSentence(row)) return true;
  return false;
}

/**
 * @param {number} n
 */
function formatInt(n) {
  const v = Math.floor(n);
  try {
    return v.toLocaleString('ja-JP');
  } catch {
    return String(v);
  }
}

/**
 * 目立つ順に並べるための数。表示の単位は amountText 側。
 * @param {object} row
 * @param {import('./platformMetrics.js').SupportArrivalSpec} spec
 */
function amountValue(row, spec) {
  if (spec.amount === 'pieces') {
    const pieces = Number(/** @type {{ ytGiftCount?: unknown }} */ (row).ytGiftCount);
    return Number.isFinite(pieces) && pieces > 0 ? pieces : 0;
  }
  const amount = Number(/** @type {{ ytAmount?: unknown }} */ (row).ytAmount);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

/**
 * @param {object} row
 * @param {import('./platformMetrics.js').SupportArrivalSpec} spec
 * @returns {string}
 */
function amountText(row, spec) {
  const amount = Number(/** @type {{ ytAmount?: unknown }} */ (row).ytAmount);
  const pieces = Number(/** @type {{ ytGiftCount?: unknown }} */ (row).ytGiftCount);
  const cur = String(/** @type {{ ytCurrency?: unknown }} */ (row).ytCurrency || '').trim().toUpperCase();
  if (spec.amount === 'pieces') {
    return Number.isFinite(pieces) && pieces > 0 ? `${formatInt(pieces)}件` : '';
  }
  if (!(Number.isFinite(amount) && amount > 0)) return '';
  if (spec.amount === 'viewers') return `${formatInt(amount)}人`;
  if (spec.amount === 'count') return `${formatInt(amount)}個`;
  if (spec.amount === 'point') return `${formatInt(amount)}pt`;
  if (spec.amount === 'money') {
    const rounded = cur === 'JPY' || cur === 'BITS' || cur === 'KICKS' || Number.isInteger(amount)
      ? Math.round(amount)
      : Math.round(amount * 100) / 100;
    const text = rounded.toLocaleString('ja-JP');
    if (cur === 'JPY') return `¥${text}`;
    if (cur === 'BITS') return `${text} Bits`;
    if (cur === 'KICKS') return `${text} Kicks`;
    if (cur === 'TTCOIN' || cur === 'MXCOIN') return `${text} コイン`;
    if (cur === 'USD') return `USD ${text}`;
    return cur ? `${cur} ${text}` : text;
  }
  return '';
}

/**
 * @param {object} row
 * @param {string} platformId
 */
function contextText(row, platformId) {
  const kind = String(/** @type {{ ytKind?: unknown }} */ (row).ytKind || '');
  const text = clip(String(/** @type {{ text?: unknown }} */ (row).text || ''));
  const n = Math.floor(Number(/** @type {{ ytAmount?: unknown }} */ (row).ytAmount) || 0);
  if (kind === 'tw_raid') return n > 0 ? `レイド ${formatInt(n)}人` : 'レイド';
  if (kind === 'kk_host') return n > 0 ? `ホスト ${formatInt(n)}人` : 'ホスト';
  if (kind === 'follow' || /** @type {{ commentType?: unknown }} */ (row).commentType === 'followNotice') return text || 'フォロー';
  if (kind === 'tw_hype') return text || 'ハイプトレイン';
  if (platformId === 'niconico' && niconicoArrivalSentence(row)) return text || '来場';
  return text || '通知';
}

/**
 * @param {string} s
 */
function clip(s) {
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > EXCERPT_MAX ? `${t.slice(0, EXCERPT_MAX)}…` : t;
}

/**
 * 時刻順の添字に対し、窓 [from, until) の右端を進める。左は呼び出し側が単調に進める。
 * @param {readonly number[]} times
 * @param {number} right
 * @param {number} until
 */
function advanceRight(times, right, until) {
  let r = right;
  while (r < times.length && times[r] < until) r += 1;
  return r;
}

/**
 * @param {readonly number[]} times
 * @param {number} left
 * @param {number} from
 */
function advanceLeft(times, left, from) {
  let l = left;
  while (l < times.length && times[l] < from) l += 1;
  return l;
}

/**
 * @param {object} input
 * @param {string} input.platformId
 * @param {unknown[]} [input.comments]
 * @param {unknown[]} [input.giftEvents]
 * @param {number} [input.startedAtMs]
 * @param {number} [input.cap]
 * @returns {null | {
 *   total: number,
 *   cap: number,
 *   counts: { id: string, label: string, count: number }[],
 *   windows: { startAt: number, count: number }[],
 *   rows: {
 *     at: number,
 *     offsetMs: number | null,
 *     kindLabel: string,
 *     itemName: string,
 *     who: string,
 *     amountText: string,
 *     amountValue: number,
 *     beforeRecording: boolean,
 *     commentCount: number,
 *     excerpts: string[],
 *     contextCount: number,
 *     contexts: string[],
 *   }[]
 * }}
 */
export function analyzeSupportArrivals(input) {
  const platformId = String(input?.platformId || 'niconico');
  const specs = supportArrivalSpecs(platformId);
  if (!specs.length) return null;
  const cap = Number.isFinite(input?.cap) && /** @type {number} */ (input.cap) > 0
    ? Math.floor(/** @type {number} */ (input.cap))
    : SUPPORT_ARRIVAL_ROW_CAP;
  const comments = Array.isArray(input?.comments) ? input.comments : [];
  /** @type {number[]} */
  const speechTimes = [];
  /** @type {string[]} */
  const speechText = [];
  /** @type {number[]} */
  const contextTimes = [];
  /** @type {string[]} */
  const contextLabels = [];
  /** @type {number[]} */
  const contextIds = [];
  /** @type {{ at: number, spec: import('./platformMetrics.js').SupportArrivalSpec, row: object, contextId: number }[]} */
  const events = [];
  let contextSeq = 0;

  for (const raw of comments) {
    if (!raw || typeof raw !== 'object') continue;
    const row = /** @type {object} */ (raw);
    const at = atOf(row);
    if (!(at > 0)) continue;
    const spec = matchSpec(row, specs);
    const context = isContextRow(row, platformId);
    const contextId = context ? (contextSeq += 1) : 0;
    if (spec) events.push({ at, spec, row, contextId });
    if (context) {
      contextTimes.push(at);
      contextLabels.push(contextText(row, platformId));
      contextIds.push(contextId);
    } else if (!spec) {
      const text = clip(String(/** @type {{ text?: unknown }} */ (row).text || ''));
      if (text) {
        speechTimes.push(at);
        speechText.push(text);
      }
    }
  }

  if (platformId === 'niconico' && Array.isArray(input?.giftEvents)) {
    for (const raw of input.giftEvents) {
      if (!raw || typeof raw !== 'object') continue;
      const g = /** @type {{ capturedAt?: unknown, nickname?: unknown, itemName?: unknown, point?: unknown, userId?: unknown }} */ (raw);
      const at = Number(g.capturedAt);
      if (!(Number.isFinite(at) && at > 0)) continue;
      const spec = specs.find((s) => s.kinds.includes('niconico_gift'));
      if (!spec) continue;
      const point = Number(g.point);
      events.push({
        at,
        spec,
        contextId: 0,
        row: {
          ytKind: 'niconico_gift',
          capturedAt: at,
          nickname: g.nickname,
          ytGiftName: g.itemName,
          ytAmount: Number.isFinite(point) && point > 0 ? point : 0,
          ytCurrency: 'PT',
          userId: g.userId,
        },
      });
    }
  }

  if (!events.length) return null;

  const speechOrder = speechTimes.map((_, i) => i).sort((a, b) => speechTimes[a] - speechTimes[b] || a - b);
  const contextOrder = contextTimes.map((_, i) => i).sort((a, b) => contextTimes[a] - contextTimes[b] || a - b);
  const speechAt = speechOrder.map((i) => speechTimes[i]);
  const speechBits = speechOrder.map((i) => speechText[i]);
  const contextAt = contextOrder.map((i) => contextTimes[i]);
  const contextBits = contextOrder.map((i) => contextLabels[i]);
  const contextIdAt = contextOrder.map((i) => contextIds[i]);
  events.sort((a, b) => a.at - b.at);

  const started = Number(input?.startedAtMs);
  const startedOk = Number.isFinite(started) && started > 0 ? started : 0;
  // 記録の最初のコメントより前の窓には、コメントが無いのではなく、まだ記録していない。
  const recordedFrom = speechAt.length ? speechAt[0] : 0;
  /** @type {Map<string, { id: string, label: string, count: number }>} */
  const counts = new Map();
  /** @type {Map<number, number>} */
  const buckets = new Map();
  let speechL = 0;
  let speechR = 0;
  let contextL = 0;
  let contextR = 0;
  /** @type {NonNullable<ReturnType<typeof analyzeSupportArrivals>>['rows']} */
  const rows = [];

  for (const ev of events) {
    const from = ev.at - SUPPORT_ARRIVAL_WINDOW_MS;
    speechL = advanceLeft(speechAt, speechL, from);
    speechR = advanceRight(speechAt, speechR, ev.at);
    contextL = advanceLeft(contextAt, contextL, from);
    contextR = advanceRight(contextAt, Math.max(contextR, contextL), ev.at + 1);
    const commentCount = Math.max(0, speechR - speechL);
    /** @type {string[]} */
    const excerpts = [];
    for (let i = Math.max(speechL, speechR - EXCERPT_COUNT); i < speechR; i += 1) excerpts.push(speechBits[i]);
    const contextSpan = Math.max(0, contextR - contextL);
    const contextCount = ev.contextId ? Math.max(0, contextSpan - 1) : contextSpan;
    /** @type {string[]} */
    const contexts = [];
    for (let i = contextR - 1; i >= contextL && contexts.length < CONTEXT_COUNT; i -= 1) {
      if (ev.contextId && contextIdAt[i] === ev.contextId) continue;
      contexts.push(contextBits[i]);
    }
    contexts.reverse();
    const prev = counts.get(ev.spec.id) || { id: ev.spec.id, label: ev.spec.label, count: 0 };
    prev.count += 1;
    counts.set(ev.spec.id, prev);
    const bucket = Math.floor(ev.at / SUPPORT_ARRIVAL_BUCKET_MS) * SUPPORT_ARRIVAL_BUCKET_MS;
    buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
    const item = clip(String(/** @type {{ ytGiftName?: unknown }} */ (ev.row).ytGiftName || ''));
    const who = String(/** @type {{ nickname?: unknown, name?: unknown }} */ (ev.row).nickname
      || /** @type {{ name?: unknown }} */ (ev.row).name || '').trim();
    rows.push({
      at: ev.at,
      offsetMs: startedOk && ev.at >= startedOk ? ev.at - startedOk : null,
      kindLabel: ev.spec.label,
      itemName: item && item !== ev.spec.label ? item : '',
      who: who || '名前なし',
      amountText: amountText(ev.row, ev.spec),
      amountValue: amountValue(ev.row, ev.spec),
      beforeRecording: recordedFrom > 0 && ev.at <= recordedFrom,
      commentCount,
      excerpts,
      contextCount,
      contexts,
    });
  }

  const windows = [...buckets.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 3)
    .map(([startAt, count]) => ({ startAt, count }));
  const shown = rows.length > cap ? rows.slice(rows.length - cap) : rows;
  return {
    total: rows.length,
    cap,
    counts: [...counts.values()],
    windows,
    rows: shown,
  };
}
