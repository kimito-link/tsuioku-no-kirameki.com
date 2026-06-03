/**
 * 開示請求モード: 受信コメントの「該当疑い」判定と、popup 表示用フィルタ。
 * 記録自体は止めない（表示のみ抑える）。
 */

import { detectCommentKindnessNudge } from './commentKindnessNudge.js';
import { parseGiftCommentText, parseNicoadCommentText } from './parseGiftComment.js';
import { parseInterestArrivalComment } from './parseInterestArrivalComment.js';

/**
 * @typedef {{
 *   ruleId: string,
 *   level: 'mild' | 'strong',
 *   matchedText: string
 * }} DisclosureFlaggedComment
 */

/**
 * @param {string} text
 * @returns {DisclosureFlaggedComment | null}
 */
export function detectDisclosureFlaggedComment(text) {
  const nudge = detectCommentKindnessNudge(text);
  if (!nudge) return null;
  return {
    ruleId: nudge.id,
    level: nudge.level,
    matchedText: nudge.matchedText
  };
}

/**
 * ギフト・広告・興味タグ来場・自分投稿は表示を維持。
 *
 * @param {{ text?: string, selfPosted?: boolean }} entry
 * @returns {boolean}
 */
export function isDisclosureProtectedCommentEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.selfPosted === true) return true;
  const text = String(entry.text || '').trim();
  if (!text) return false;
  if (parseGiftCommentText(text)) return true;
  if (parseNicoadCommentText(text)) return true;
  if (parseInterestArrivalComment(text)) return true;
  return false;
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isDisclosureFlaggedCommentText(text) {
  return detectDisclosureFlaggedComment(text) !== null;
}

/**
 * @template {{ text?: string, selfPosted?: boolean }} T
 * @param {T[]} entries
 * @returns {T[]}
 */
export function filterCommentsForDisclosureDisplay(entries) {
  if (!Array.isArray(entries) || !entries.length) return [];
  return entries.filter((entry) => {
    if (isDisclosureProtectedCommentEntry(entry)) return true;
    return !isDisclosureFlaggedCommentText(String(entry?.text || ''));
  });
}

/**
 * @template {{ text?: string, selfPosted?: boolean }} T
 * @param {T[]} entries
 * @returns {number}
 */
export function countDisclosureHiddenComments(entries) {
  if (!Array.isArray(entries) || !entries.length) return 0;
  let hidden = 0;
  for (const entry of entries) {
    if (isDisclosureProtectedCommentEntry(entry)) continue;
    if (isDisclosureFlaggedCommentText(String(entry?.text || ''))) hidden += 1;
  }
  return hidden;
}

/**
 * @template {{ text?: string, selfPosted?: boolean, id?: string, commentNo?: string, userId?: string|null, nickname?: string, capturedAt?: number, vpos?: number|null }} T
 * @param {T[]} entries
 * @returns {Array<T & { disclosureFlag: DisclosureFlaggedComment }>}
 */
export function collectDisclosureFlaggedCommentEntries(entries) {
  if (!Array.isArray(entries)) return [];
  /** @type {Array<T & { disclosureFlag: DisclosureFlaggedComment }>} */
  const out = [];
  for (const entry of entries) {
    if (isDisclosureProtectedCommentEntry(entry)) continue;
    const flag = detectDisclosureFlaggedComment(String(entry?.text || ''));
    if (!flag) continue;
    out.push({ ...entry, disclosureFlag: flag });
  }
  return out;
}

/** @param {unknown} raw */
export function normalizeDisclosureRequestModeEnabled(raw) {
  return raw === true;
}
