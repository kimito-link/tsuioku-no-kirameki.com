/**
 * 来場通知を、サイドパネルの内訳と分析レポートで同じ行として数える。
 *
 * 同じ文面でも、時刻が違えば別の来場である。畳むのは同じ通知の二重取り込みだけ
 * （同じ時刻、または約2秒以内）。時刻が無い行は、同じだと証明できないので残す。
 */

import { parseArrivalCommentText } from './parseArrivalComment.js';
import { normalizeCommentText } from './commentRecord.js';
import { toEpochMs } from './timeAuthority.js';

/** 公式の通知と画面の取り込みが同じ通知とみなせる幅。 */
export const ARRIVAL_NOTICE_WINDOW_MS = 2000;

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
 * 内訳とレポートが共有する門。同じ文面でも窓の外は別件数。
 * @returns {{ accept: (row: object) => 'no'|'count'|'dup' }}
 */
export function createArrivalNoticeGate() {
  /** @type {Map<string, number[]>} */
  const timesBySentence = new Map();
  return {
    accept(row) {
      const sentence = niconicoArrivalSentence(row);
      if (!sentence) return 'no';
      const cap = toEpochMs(/** @type {{ capturedAt?: unknown }} */ (row).capturedAt);
      if (cap > 0) {
        const prev = timesBySentence.get(sentence) || [];
        if (prev.some((t) => Math.abs(t - cap) <= ARRIVAL_NOTICE_WINDOW_MS)) return 'dup';
        prev.push(cap);
        timesBySentence.set(sentence, prev);
      }
      return 'count';
    }
  };
}
