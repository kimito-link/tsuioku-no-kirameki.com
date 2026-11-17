/**
 * 来場通知を、サイドパネルの内訳と分析レポートで同じ行として数える。
 *
 * 来場の公式文は commentNo が空で、大きな配信ではテール（未畳み込みの末尾）に
 * 同じ文が残る。内訳は末尾を足した表示行を1行ずつ数え、書き出しは liveId の無い
 * 末尾行を落としていた。実配信では内訳 31・レポート 5 に割れた。
 *
 * 保存済みの行は今までどおり1行ずつ数える。取り込み時刻の無い末尾の同じ文面だけ、
 * すでに数えた文面なら足さない。
 */

import { parseArrivalCommentText } from './parseArrivalComment.js';
import { normalizeCommentText } from './commentRecord.js';

/**
 * ニコ生の来場文なら、空白を揃えた全文。来場でなければ空。
 * @param {object|null|undefined} row
 * @returns {string}
 */
export function niconicoArrivalSentence(row) {
  if (!row || typeof row !== 'object') return '';
  const plat = String(/** @type {{ ytPlatform?: unknown }} */ (row).ytPlatform || '').trim();
  if (plat && plat !== 'niconico') return '';
  const text = String(/** @type {{ text?: unknown }} */ (row).text ?? '');
  if (!parseArrivalCommentText(text)) return '';
  return normalizeCommentText(text);
}

/**
 * @param {object} row
 * @param {Set<string>} seenSentences
 * @returns {'no'|'count'|'dup'}
 */
export function classifyArrivalNotice(row, seenSentences) {
  const sentence = niconicoArrivalSentence(row);
  if (!sentence) return 'no';
  const unstamped = /** @type {{ arrivalUnstamped?: unknown }} */ (row).arrivalUnstamped === true;
  if (unstamped && seenSentences.has(sentence)) return 'dup';
  seenSentences.add(sentence);
  return 'count';
}
