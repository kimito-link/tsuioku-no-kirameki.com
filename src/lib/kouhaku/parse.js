/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】公式15106のHTMLから紅組・白組の順位表を読む
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.* / 画像URLの保持
 * 【書けるstorageキー】なし
 * 【正本宣言】公式ブログの表の読み方はこのファイルのみ
 *
 * parse.js — 画像セルは読み飛ばし、戻り値に画像URLを含めない。
 */

import { HTML_MAX_BYTES } from './constants.js';
import { parseOfficialUpdateAt } from './time.js';

/** @type {Record<string, string>} */
const NAMED = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0'
};

/**
 * @param {string} input
 * @returns {string}
 */
export function decodeHtml(input) {
  return String(input || '').replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    const token = String(body);
    if (token.startsWith('#')) {
      const hex = token[1] === 'x' || token[1] === 'X';
      const codePoint = Number.parseInt(token.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return whole;
      return String.fromCodePoint(codePoint);
    }
    return Object.prototype.hasOwnProperty.call(NAMED, token) ? NAMED[token] : whole;
  });
}

export class RankingParseError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = 'RankingParseError';
  }
}

/**
 * @typedef {'aka'|'shiro'} TeamId
 * @typedef {{
 *   team: TeamId,
 *   rank: number,
 *   userId: string,
 *   displayName: string,
 *   score: number
 * }} RankingEntry
 * @typedef {{
 *   officialUpdateLabel: string,
 *   officialUpdateAt: string|null,
 *   entries: RankingEntry[]
 * }} ParsedRanking
 */

const LABEL_RE = /※\s*(\d{1,2}月\d{1,2}日（[月火水木金土日]）\d{1,2}時\d{1,2}分頃更新分)/;
const HEADING_RE = /<h3[^>]*>\s*(?:<span[^>]*>)?\s*(紅組|白組)\s*(?:<\/span>)?\s*<\/h3>/gi;
const ROW_RE = /<tr>\s*<td>\s*(\d+)\s*<\/td>\s*<td>[\s\S]*?<\/td>\s*<td>\s*<a href="https:\/\/www\.nicovideo\.jp\/user\/(\d+)"[^>]*>\s*([\s\S]*?)\s*<\/a>\s*<\/td>\s*<td>\s*([\d,]+)\s*<\/td>\s*<\/tr>/gi;

/**
 * @param {string} html
 * @param {{ fetchedAt: Date }} options
 * @returns {ParsedRanking}
 */
export function parseRankingHtml(html, options) {
  const source = String(html || '');
  if (source.length > HTML_MAX_BYTES) throw new RankingParseError('html-too-large');

  const labelMatch = source.match(LABEL_RE);
  if (!labelMatch || !labelMatch[1]) throw new RankingParseError('official-update-label-missing');
  const officialUpdateLabel = labelMatch[1];

  const headings = [...source.matchAll(HEADING_RE)];
  if (headings.length === 0) throw new RankingParseError('team-heading-missing');

  /** @type {RankingEntry[]} */
  const entries = [];
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (!heading || heading.index === undefined) continue;
    const teamName = heading[1];
    const team = teamName === '紅組' ? 'aka' : 'shiro';
    const start = heading.index + heading[0].length;
    const next = headings[index + 1];
    const end = next && next.index !== undefined ? next.index : source.length;
    const section = source.slice(start, end);
    const rows = [...section.matchAll(ROW_RE)];
    if (rows.length === 0) throw new RankingParseError(`${teamName}-rows-missing`);

    const seen = new Set();
    for (const row of rows) {
      const rank = Number(row[1]);
      const userId = row[2] || '';
      const displayName = decodeHtml(row[3] || '').replace(/<[^>]+>/g, '').trim();
      const score = Number(String(row[4] || '').replaceAll(',', ''));
      if (!Number.isInteger(rank) || rank < 1) continue;
      if (!/^\d{1,16}$/.test(userId)) continue;
      if (!displayName || displayName.length > 80) continue;
      if (!Number.isInteger(score) || score < 0) continue;
      if (seen.has(userId)) continue;
      seen.add(userId);
      entries.push({ team, rank, userId, displayName, score });
    }
  }

  for (const team of ['aka', 'shiro']) {
    if (!entries.some((entry) => entry.team === team)) {
      throw new RankingParseError(`${team}-empty`);
    }
  }

  entries.sort((a, b) => (a.team < b.team ? -1 : a.team > b.team ? 1 : a.rank - b.rank));
  return {
    officialUpdateLabel,
    officialUpdateAt: parseOfficialUpdateAt(officialUpdateLabel, options.fetchedAt),
    entries
  };
}
