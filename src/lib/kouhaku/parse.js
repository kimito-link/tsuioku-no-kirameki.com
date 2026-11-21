/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】公式15106のHTMLから紅組・白組の順位表を読む
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.* / 画像バイトの取得
 * 【書けるstorageキー】なし
 * 【正本宣言】公式ブログの表の読み方はこのファイルのみ
 *
 * parse.js — 順位表の img が公開 usericon のときだけ URL を残す。ロゴなどは捨てる。
 */

import { getEvent } from '../eventRanking/registry.js';
import { HTML_MAX_BYTES } from './constants.js';
import { officialIconUrl } from './icon.js';
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
 * @typedef {string} TeamId
 * @typedef {{
 *   team: TeamId,
 *   rank: number,
 *   userId: string,
 *   displayName: string,
 *   score: number,
 *   iconUrl?: string|null
 * }} RankingEntry
 * @typedef {{
 *   officialUpdateLabel: string,
 *   officialUpdateAt: string|null,
 *   entries: RankingEntry[]
 * }} ParsedRanking
 */

const LABEL_RE = /※\s*(\d{1,2}月\d{1,2}日（[月火水木金土日]）\d{1,2}時\d{1,2}分頃更新分)/;

/**
 * @param {{ groups?: { id: string, heading: string|null }[] }|undefined} options
 * @returns {{ id: string, heading: string|null }[]}
 */
function groupsOf(options) {
  if (options && Array.isArray(options.groups) && options.groups.length) return options.groups;
  const event = getEvent('kouhaku-2026');
  return event ? event.groups : [];
}
const ROW_RE = /<tr>\s*<td>\s*(\d+)\s*<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>\s*<a href="https:\/\/www\.nicovideo\.jp\/user\/(\d+)"[^>]*>\s*([\s\S]*?)\s*<\/a>\s*<\/td>\s*<td>\s*([\d,]+)\s*<\/td>\s*<\/tr>/gi;

/**
 * @param {string} cell
 * @returns {string|null}
 */
function iconFromCell(cell) {
  const match = String(cell || '').match(/<img\b[^>]*\bsrc="([^"]+)"/i);
  return officialIconUrl(match && match[1]) || null;
}

/**
 * @param {RankingEntry[]} entries
 * @param {string} section
 * @param {string} team
 */
function pushRows(entries, section, team) {
  ROW_RE.lastIndex = 0;
  const seen = new Set(entries.filter((entry) => entry.team === team).map((entry) => entry.userId));
  for (const row of section.matchAll(ROW_RE)) {
    const rank = Number(row[1]);
    const userId = row[3] || '';
    const displayName = decodeHtml(row[4] || '').replace(/<[^>]+>/g, '').trim();
    const score = Number(String(row[5] || '').replaceAll(',', ''));
    const iconUrl = iconFromCell(row[2] || '');
    if (!Number.isInteger(rank) || rank < 1) continue;
    if (!/^\d{1,16}$/.test(userId)) continue;
    if (!displayName || displayName.length > 80) continue;
    if (!Number.isInteger(score) || score < 0) continue;
    if (seen.has(userId)) continue;
    seen.add(userId);
    entries.push({ team, rank, userId, displayName, score, iconUrl });
  }
  ROW_RE.lastIndex = 0;
}

/**
 * @param {string} html
 * @param {{ fetchedAt: Date, groups?: { id: string, heading: string|null }[] }} options
 * @returns {ParsedRanking}
 */
export function parseRankingHtml(html, options) {
  const source = String(html || '');
  if (source.length > HTML_MAX_BYTES) throw new RankingParseError('html-too-large');

  const labelMatch = source.match(LABEL_RE);
  if (!labelMatch || !labelMatch[1]) throw new RankingParseError('official-update-label-missing');
  const officialUpdateLabel = labelMatch[1];
  const groups = groupsOf(options);
  const headed = groups.filter((group) => group.heading);
  /** @type {RankingEntry[]} */
  const entries = [];

  if (headed.length === 0) {
    const only = groups[0];
    if (!only) throw new RankingParseError('team-heading-missing');
    pushRows(entries, source, only.id);
    if (!entries.some((entry) => entry.team === only.id)) throw new RankingParseError(`${only.id}-empty`);
  } else {
    const names = headed.map((group) => String(group.heading).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const headingRe = new RegExp(`<h3[^>]*>\\s*(?:<span[^>]*>)?\\s*(${names})\\s*(?:<\\/span>)?\\s*<\\/h3>`, 'gi');
    const headings = [...source.matchAll(headingRe)];
    if (headings.length === 0) throw new RankingParseError('team-heading-missing');
    for (let index = 0; index < headings.length; index += 1) {
      const heading = headings[index];
      if (!heading || heading.index === undefined) continue;
      const teamName = heading[1];
      const group = headed.find((item) => item.heading === teamName);
      if (!group) continue;
      const start = heading.index + heading[0].length;
      const next = headings[index + 1];
      const end = next && next.index !== undefined ? next.index : source.length;
      const before = entries.length;
      pushRows(entries, source.slice(start, end), group.id);
      if (entries.length === before) throw new RankingParseError(`${teamName}-rows-missing`);
    }
    for (const group of headed) {
      if (!entries.some((entry) => entry.team === group.id)) throw new RankingParseError(`${group.id}-empty`);
    }
  }

  entries.sort((a, b) => (a.team < b.team ? -1 : a.team > b.team ? 1 : a.rank - b.rank));
  return {
    officialUpdateLabel,
    officialUpdateAt: parseOfficialUpdateAt(officialUpdateLabel, options.fetchedAt),
    entries
  };
}
