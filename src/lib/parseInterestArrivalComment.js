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

// v0.1.627: 前後の全角空白(U+3000)・タブ・改行は trim() で落ちないため、
//   正規表現側で先頭/末尾の空白を許容する。中央は変更しない(誤検知防止)。
//   全角空白は U+3000 で表記して no-irregular-whitespace を回避する。
const INTEREST_ARRIVAL_RE = new RegExp(
  '^[\\u3000\\s]*「(.+?)」が好きな(\\d+)人が来場しました[\\u3000\\s]*$'
);

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
