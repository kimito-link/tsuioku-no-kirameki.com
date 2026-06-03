/**
 * 同接推定の較正データロガー（しおりのようにストレージへサンプルが積まれる）。
 *
 * 目的: 推定の各シグナル（A:コメ主 / B:滞留 / C:リトル / D:密度 / blend）と、
 * 来場(累計)・コメ毎分・配信経過・(公式同接が取れるサイトでは)公式値と誤差を、
 * 時系列で貯めて、後から係数（avgSessionMin / perPersonCommentsPerMin / 倍率）の
 * 較正に使う。手動視聴と自動巡回(autopatrol)の両方が同じ器へ書く前提で、
 * 「1サンプル追記」の純粋APIにする（DOM非依存・テスト可能）。
 *
 * PII なし: 数値・liveId・platform・ts・source のみ。ニックネーム/本文/avatar は保存しない。
 */

export const CALIBRATION_LOG_VERSION = 1;
export const CALIBRATION_LOG_MAX_ITEMS = 2000;
/** 同一 (platform+liveId) で連続サンプルを間引く最小間隔 */
export const CALIBRATION_MIN_INTERVAL_MS = 30000;

/** @enum {string} */
export const CALIBRATION_SOURCE = {
  /** 人が実際に視聴しているタブからの採取 */
  MANUAL: 'manual',
  /** 自動巡回(b)が背景タブで開いた配信からの採取 */
  AUTOPATROL: 'autopatrol',
  UNKNOWN: 'unknown'
};

const VALID_SOURCES = /** @type {ReadonlySet<string>} */ (
  new Set(Object.values(CALIBRATION_SOURCE))
);

/**
 * CSV / 行オブジェクトの正準フィールド順（CSV ヘッダもこの順）。
 * @type {readonly string[]}
 */
export const CALIBRATION_FIELDS = Object.freeze([
  'ts',
  'platform',
  'liveId',
  'source',
  'estimated',
  'blended',
  'blendedSignalCount',
  'signalA',
  'signalB',
  'signalC',
  'signalD',
  'method',
  'confidence',
  'captureRatio',
  'activeCommenters',
  'multiplier',
  'retentionPct',
  'totalVisitors',
  'recentActiveUsers',
  'streamAgeMin',
  'commentsPerMin',
  'officialConcurrent',
  'errorPct'
]);

/**
 * @typedef {{
 *   ts: number,
 *   platform: string,
 *   liveId: string,
 *   source: string,
 *   estimated: number|null,
 *   blended: number|null,
 *   blendedSignalCount: number|null,
 *   signalA: number|null,
 *   signalB: number|null,
 *   signalC: number|null,
 *   signalD: number|null,
 *   method: string,
 *   confidence: number|null,
 *   captureRatio: number|null,
 *   activeCommenters: number|null,
 *   multiplier: number|null,
 *   retentionPct: number|null,
 *   totalVisitors: number|null,
 *   recentActiveUsers: number|null,
 *   streamAgeMin: number|null,
 *   commentsPerMin: number|null,
 *   officialConcurrent: number|null,
 *   errorPct: number|null
 * }} CalibrationSample
 */

/**
 * @param {unknown} v
 * @param {{ min?: number, max?: number, round?: number, int?: boolean }} [opts]
 * @returns {number|null}
 */
function toNumOrNull(v, opts = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  let out = n;
  if (typeof opts.min === 'number' && out < opts.min) out = opts.min;
  if (typeof opts.max === 'number' && out > opts.max) out = opts.max;
  if (opts.int) return Math.round(out);
  if (typeof opts.round === 'number') {
    const f = 10 ** opts.round;
    return Math.round(out * f) / f;
  }
  return out;
}

/** @param {unknown} raw */
function normSource(raw) {
  const s = String(raw || '').trim().toLowerCase().slice(0, 24);
  return VALID_SOURCES.has(s) ? s : CALIBRATION_SOURCE.UNKNOWN;
}

/** @param {unknown} raw */
function normPlatform(raw) {
  const s = String(raw || '').trim().toLowerCase().slice(0, 24);
  return s || 'niconico';
}

/** @param {unknown} raw */
function normLiveId(raw) {
  return String(raw || '').trim().slice(0, 64);
}

/** @param {unknown} raw */
function normMethod(raw) {
  return String(raw || '').trim().toLowerCase().slice(0, 24) || 'unknown';
}

/**
 * resolved（resolveConcurrentViewers の戻り）＋文脈から 1 サンプルを作る純粋関数。
 *
 * @param {{
 *   nowMs?: number,
 *   platform?: string,
 *   liveId?: string,
 *   source?: string,
 *   resolved?: Record<string, unknown> & { base?: Record<string, unknown> },
 *   totalVisitors?: number|null,
 *   recentActiveUsers?: number|null,
 *   streamAgeMin?: number|null,
 *   commentsPerMin?: number|null,
 *   officialConcurrent?: number|null
 * }} input
 * @returns {CalibrationSample}
 */
export function buildCalibrationSample(input = {}) {
  const resolved = input.resolved && typeof input.resolved === 'object'
    ? input.resolved
    : {};
  const base = resolved.base && typeof resolved.base === 'object'
    ? /** @type {Record<string, unknown>} */ (resolved.base)
    : {};

  const blended = toNumOrNull(base.blended, { min: 0, int: true });
  const official = toNumOrNull(input.officialConcurrent, { min: 0, int: true });

  // 誤差は「新式 blend vs 公式」を主に置く（公式が取れるサイトでのみ非 null）。
  /** @type {number|null} */
  let errorPct = null;
  if (official != null && official > 0 && blended != null) {
    errorPct = toNumOrNull(((blended - official) / official) * 100, { round: 1 });
  }

  return {
    ts: toNumOrNull(input.nowMs, { min: 0, int: true }) ?? Date.now(),
    platform: normPlatform(input.platform),
    liveId: normLiveId(input.liveId),
    source: normSource(input.source),
    estimated: toNumOrNull(resolved.estimated, { min: 0, int: true }),
    blended,
    blendedSignalCount: toNumOrNull(base.blendedSignalCount, { min: 0, int: true }),
    signalA: toNumOrNull(base.signalA, { min: 0, int: true }),
    signalB: toNumOrNull(base.signalB, { min: 0, int: true }),
    signalC: toNumOrNull(base.signalC, { min: 0, int: true }),
    signalD: toNumOrNull(base.signalD, { min: 0, int: true }),
    method: normMethod(resolved.method),
    confidence: toNumOrNull(resolved.confidence, { min: 0, max: 1, round: 3 }),
    captureRatio: toNumOrNull(resolved.captureRatio, { min: 0, max: 1, round: 3 }),
    activeCommenters: toNumOrNull(base.activeCommenters, { min: 0, int: true }),
    multiplier: toNumOrNull(base.multiplier, { min: 0, round: 2 }),
    retentionPct: toNumOrNull(base.retentionPct, { min: 0, int: true }),
    totalVisitors: toNumOrNull(input.totalVisitors, { min: 0, int: true }),
    recentActiveUsers: toNumOrNull(input.recentActiveUsers, { min: 0, int: true }),
    streamAgeMin: toNumOrNull(input.streamAgeMin, { min: 0, round: 1 }),
    commentsPerMin: toNumOrNull(input.commentsPerMin, { min: 0, round: 2 }),
    officialConcurrent: official,
    errorPct
  };
}

/**
 * 任意のオブジェクトを正準サンプル行へ正規化する（ストレージ復元・追記の共通経路）。
 * @param {unknown} raw
 * @returns {CalibrationSample|null} ts/liveId が無効なら null
 */
function normalizeSampleRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const ts = toNumOrNull(o.ts, { min: 0, int: true });
  if (ts == null) return null;
  const liveId = normLiveId(o.liveId);
  if (!liveId) return null;
  return {
    ts,
    platform: normPlatform(o.platform),
    liveId,
    source: normSource(o.source),
    estimated: toNumOrNull(o.estimated, { min: 0, int: true }),
    blended: toNumOrNull(o.blended, { min: 0, int: true }),
    blendedSignalCount: toNumOrNull(o.blendedSignalCount, { min: 0, int: true }),
    signalA: toNumOrNull(o.signalA, { min: 0, int: true }),
    signalB: toNumOrNull(o.signalB, { min: 0, int: true }),
    signalC: toNumOrNull(o.signalC, { min: 0, int: true }),
    signalD: toNumOrNull(o.signalD, { min: 0, int: true }),
    method: normMethod(o.method),
    confidence: toNumOrNull(o.confidence, { min: 0, max: 1, round: 3 }),
    captureRatio: toNumOrNull(o.captureRatio, { min: 0, max: 1, round: 3 }),
    activeCommenters: toNumOrNull(o.activeCommenters, { min: 0, int: true }),
    multiplier: toNumOrNull(o.multiplier, { min: 0, round: 2 }),
    retentionPct: toNumOrNull(o.retentionPct, { min: 0, int: true }),
    totalVisitors: toNumOrNull(o.totalVisitors, { min: 0, int: true }),
    recentActiveUsers: toNumOrNull(o.recentActiveUsers, { min: 0, int: true }),
    streamAgeMin: toNumOrNull(o.streamAgeMin, { min: 0, round: 1 }),
    commentsPerMin: toNumOrNull(o.commentsPerMin, { min: 0, round: 2 }),
    officialConcurrent: toNumOrNull(o.officialConcurrent, { min: 0, int: true }),
    errorPct: toNumOrNull(o.errorPct, { round: 1 })
  };
}

/**
 * @param {unknown} raw
 * @returns {{ v: number, items: CalibrationSample[] }}
 */
export function parseCalibrationLog(raw) {
  if (!raw || typeof raw !== 'object') {
    return { v: CALIBRATION_LOG_VERSION, items: [] };
  }
  const o = /** @type {Record<string, unknown>} */ (raw);
  const v = Number(o.v) || CALIBRATION_LOG_VERSION;
  const items = Array.isArray(o.items) ? o.items : [];
  /** @type {CalibrationSample[]} */
  const out = [];
  for (const x of items) {
    const row = normalizeSampleRow(x);
    if (row) out.push(row);
  }
  return { v, items: out };
}

/**
 * 1 サンプルを追記する。同一 (platform+liveId) で直近サンプルから minIntervalMs 未満なら
 * 追記せず null を返す（throttle）。cap 超過は古いものから捨てる（リングバッファ）。
 *
 * @param {unknown} prevRaw
 * @param {CalibrationSample|Record<string, unknown>} sample
 * @param {{ cap?: number, minIntervalMs?: number }} [opts]
 * @returns {{ v: number, items: CalibrationSample[] }|null}
 */
export function appendCalibrationSample(prevRaw, sample, opts = {}) {
  const row = normalizeSampleRow(sample);
  if (!row) return null;
  const cap = Math.max(16, Math.min(20000, Math.floor(opts.cap ?? CALIBRATION_LOG_MAX_ITEMS)));
  const minIntervalMs = Math.max(
    0,
    Math.floor(opts.minIntervalMs ?? CALIBRATION_MIN_INTERVAL_MS)
  );
  const base = parseCalibrationLog(prevRaw);

  if (minIntervalMs > 0) {
    /** @type {CalibrationSample|null} */
    let prevSame = null;
    for (let i = base.items.length - 1; i >= 0; i--) {
      const it = base.items[i];
      if (it.platform === row.platform && it.liveId === row.liveId) {
        prevSame = it;
        break;
      }
    }
    if (prevSame) {
      const dt = row.ts - prevSame.ts;
      if (dt >= 0 && dt < minIntervalMs) return null;
    }
  }

  const nextItems = [...base.items, row].slice(-cap);
  return { v: CALIBRATION_LOG_VERSION, items: nextItems };
}

/**
 * @param {{ items?: CalibrationSample[] }|CalibrationSample[]|unknown} parsedOrItems
 * @returns {CalibrationSample[]}
 */
function toItems(parsedOrItems) {
  if (Array.isArray(parsedOrItems)) {
    /** @type {CalibrationSample[]} */
    const out = [];
    for (const x of parsedOrItems) {
      const row = normalizeSampleRow(x);
      if (row) out.push(row);
    }
    return out;
  }
  if (parsedOrItems && typeof parsedOrItems === 'object') {
    const o = /** @type {Record<string, unknown>} */ (parsedOrItems);
    if (Array.isArray(o.items)) return toItems(o.items);
  }
  return [];
}

/**
 * @param {{ items?: CalibrationSample[] }|CalibrationSample[]} parsedOrItems
 * @returns {string} 改行区切り JSON（items 配列をそのまま）
 */
export function serializeCalibrationJson(parsedOrItems) {
  const items = toItems(parsedOrItems);
  return JSON.stringify({ v: CALIBRATION_LOG_VERSION, items }, null, 2);
}

/** @param {string|number|null} cell */
function csvCell(cell) {
  if (cell == null) return '';
  const s = String(cell);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * @param {{ items?: CalibrationSample[] }|CalibrationSample[]} parsedOrItems
 * @returns {string} ヘッダ付き CSV（CALIBRATION_FIELDS 順 + 先頭に isoTime 列）
 */
export function serializeCalibrationCsv(parsedOrItems) {
  const items = toItems(parsedOrItems);
  const header = ['isoTime', ...CALIBRATION_FIELDS];
  const lines = [header.join(',')];
  for (const it of items) {
    const iso = Number.isFinite(it.ts) ? new Date(it.ts).toISOString() : '';
    const row = [iso, ...CALIBRATION_FIELDS.map((f) => csvCell(/** @type {any} */ (it)[f]))];
    lines.push(row.join(','));
  }
  return lines.join('\n');
}
