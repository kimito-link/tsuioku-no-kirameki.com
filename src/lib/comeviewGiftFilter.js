/**
 * comeviewGiftFilter.js — ギフトの表示と、表示・読み上げから外す人。
 * 記録そのものは消さない。件数の正本も変えない。
 */
export const COMEVIEW_EXCLUDE_KEY = 'nls_comeview_exclude_v1';
export const COMEVIEW_GIFT_FILTER_KEY = 'nls_comeview_gift_filter_v1';
export const GIFT_FILTERS = Object.freeze(['all', 'gifts', 'paid', 'free']);
const LINE_MAX = 80;
const LINE_CHARS = 80;

/**
 * @param {unknown} mode
 * @returns {'all' | 'gifts' | 'paid' | 'free'}
 */
export function normalizeGiftFilter(mode) {
  const value = String(mode || '');
  return GIFT_FILTERS.includes(value) ? /** @type {'all' | 'gifts' | 'paid' | 'free'} */ (value) : 'all';
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function clipLines(raw) {
  const list = Array.isArray(raw)
    ? raw
    : String(raw || '').split(/\r?\n/);
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const row of list) {
    const line = String(row || '').trim().slice(0, LINE_CHARS);
    if (!line || seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= LINE_MAX) break;
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {{ formatVersion: number, names: string[], ids: string[] }}
 */
export function normalizeComeviewExclude(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const names = clipLines(/** @type {any} */ (src).names);
  const ids = clipLines(/** @type {any} */ (src).ids);
  if (!names.length && !ids.length && typeof raw === 'string') {
    return { formatVersion: 1, names: clipLines(raw), ids: [] };
  }
  return { formatVersion: 1, names, ids };
}

/**
 * ポイントの有無。無いときは unknown。0 は「ポイントが付いていない」。
 * @param {unknown} item
 * @returns {'comment' | 'paid' | 'free' | 'unknown'}
 */
export function classifyGiftPoints(item) {
  if (!item || typeof item !== 'object' || /** @type {any} */ (item).kind !== 'gift') return 'comment';
  const src = /** @type {any} */ (item);
  if (src.free === true) return 'free';
  if (!Object.prototype.hasOwnProperty.call(src, 'point') || src.point == null || src.point === '') {
    return 'unknown';
  }
  const point = Number(src.point);
  if (!Number.isFinite(point)) return 'unknown';
  if (point > 0) return 'paid';
  if (point === 0) return 'free';
  return 'unknown';
}

/**
 * アスタリスクが1つだけのときだけ前後一致。それ以外は全文一致。
 * @param {string} pattern
 * @param {string} name
 * @returns {boolean}
 */
export function namePatternMatches(pattern, name) {
  const rule = String(pattern || '');
  const value = String(name || '').trim();
  const stars = rule.split('*').length - 1;
  if (stars !== 1 || rule === '*') return rule === value;
  const mark = rule.indexOf('*');
  const head = rule.slice(0, mark);
  const tail = rule.slice(mark + 1);
  return value.startsWith(head) && value.endsWith(tail) && value.length >= head.length + tail.length;
}

/**
 * @param {unknown} item
 * @param {unknown} rules
 * @returns {boolean}
 */
export function isDisplayExcluded(item, rules) {
  const src = item && typeof item === 'object' ? /** @type {any} */ (item) : {};
  const exclude = normalizeComeviewExclude(rules);
  const userId = String(src.userId || '').trim();
  if (userId && exclude.ids.includes(userId)) return true;
  const names = [src.name, src.nickname, src.userName].map((value) => String(value || '').trim()).filter(Boolean);
  return exclude.names.some((pattern) => names.some((name) => namePatternMatches(pattern, name)));
}

/**
 * @param {readonly unknown[]} items
 * @param {unknown} rules
 * @returns {unknown[]}
 */
export function excludeComeviewItems(items, rules) {
  const list = Array.isArray(items) ? items : [];
  return list.filter((item) => !isDisplayExcluded(item, rules));
}

/**
 * @param {readonly unknown[]} items
 * @param {unknown} mode
 * @returns {unknown[]}
 */
export function filterComeviewGiftView(items, mode) {
  const list = Array.isArray(items) ? items : [];
  const filter = normalizeGiftFilter(mode);
  if (filter === 'all') return list.slice();
  return list.filter((item) => {
    if (!item || typeof item !== 'object' || /** @type {any} */ (item).kind !== 'gift') return false;
    if (filter === 'gifts') return true;
    const kind = classifyGiftPoints(item);
    if (filter === 'paid') return kind === 'paid';
    return kind === 'free';
  });
}
