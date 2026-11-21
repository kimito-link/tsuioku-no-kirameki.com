/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】順位差・伸びの表示文言
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし
 * 【正本宣言】pt の桁区切りは htmlText.js の formatNumberJa を使う
 *
 * format.js — 「首位」「あと何pt」「前回 +N」。
 */

import { formatNumberJa } from '../htmlText.js';

/**
 * @typedef {import('./calc.js').RankedEntry} RankedEntry
 */

/**
 * @param {number} value
 * @returns {string}
 */
export function formatPt(value) {
  return formatNumberJa(value);
}

/**
 * @param {number} value
 * @returns {string}
 */
export function formatSigned(value) {
  const formatted = formatPt(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return '±0';
}

/**
 * @param {Pick<RankedEntry, 'rank'|'gapToNext'|'nextRank'>} entry
 * @returns {string}
 */
export function formatGap(entry) {
  if (entry.rank === 1 || entry.nextRank === null || entry.gapToNext === null) return '首位';
  if (entry.gapToNext === 0) return `${entry.nextRank}位と同点`;
  return `${entry.nextRank}位まであと ${formatPt(entry.gapToNext)} pt`;
}

/**
 * @param {number|null} delta
 * @returns {string}
 */
export function formatDelta(delta) {
  if (delta === null) return '前回 —';
  return `前回 ${formatSigned(delta)}`;
}

/**
 * 画面に出す「前回の公式更新からの伸び」。
 * @param {number|null} delta
 * @returns {string}
 */
export function formatGrowthSinceOfficial(delta) {
  if (delta === null) return '前回の公式更新から —';
  return `前回の公式更新から ${formatSigned(delta)} pt`;
}
