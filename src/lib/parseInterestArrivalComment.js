/**
 * ニコ生の興味タグ来場システムコメントをパースする純関数。
 *
 * generalSystemMessage 例:
 *   「料理」が好きな1人が来場しました
 *   「雑談」が好きな3人が来場しました
 *
 * 個人名は含まれず、タグと人数の集計通知のみ。
 */

/**
 * @typedef {{ tag: string, count: number }} ParsedInterestArrivalComment
 */

const INTEREST_ARRIVAL_RE = /^「(.+?)」が好きな(\d+)人が来場しました$/;

/**
 * @param {string} text
 * @returns {ParsedInterestArrivalComment | null}
 */
export function parseInterestArrivalComment(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const m = trimmed.match(INTEREST_ARRIVAL_RE);
  if (!m) return null;
  const tag = m[1].trim();
  const count = parseInt(m[2], 10);
  if (!tag || !Number.isFinite(count) || count < 1) return null;
  return { tag, count };
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isInterestArrivalCommentText(text) {
  return parseInterestArrivalComment(text) !== null;
}
