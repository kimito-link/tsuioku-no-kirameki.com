/**
 * 来場通知を、サイドパネルの内訳と分析レポートで同じ行として数える。
 *
 * 同じ文面でも、公式の通知どうしは時刻が違えば別の来場である。
 * 約2秒で1回にするのは、公式と画面のように取り込み元が違うときだけ。
 * 公式のメッセージIDが同じなら、同じ通知の取り込み直しなので1回。
 * 時刻が無く、メッセージIDも無い行は、同じだと証明できないので残す。
 */

import { parseArrivalCommentText } from './parseArrivalComment.js';
import { normalizeCommentText } from './commentRecord.js';
import { toEpochMs } from './timeAuthority.js';

/** 公式の通知と画面の取り込みが同じ通知とみなせる幅。 */
export const ARRIVAL_NOTICE_WINDOW_MS = 2000;

const ARRIVAL_NDGR_SOURCES = new Set(['ndgr', 'ndgr_forward', 'backfill']);
const ARRIVAL_DOM_SOURCES = new Set(['mutation', 'visible', 'deep']);

/**
 * 取り込み経路を、来場の照合に使う2種へ丸める。公式系は ndgr、画面系は dom。
 * @param {unknown} source
 * @returns {'ndgr'|'dom'|''}
 */
export function arrivalCaptureKindForSource(source) {
  const s = String(source || '').trim();
  if (ARRIVAL_NDGR_SOURCES.has(s)) return 'ndgr';
  if (ARRIVAL_DOM_SOURCES.has(s)) return 'dom';
  return '';
}

/**
 * 来場文に、まだ付いていなければ取り込み元を書く。公式のメッセージIDは上書きしない。
 * @param {unknown[]} rows
 * @param {unknown} source
 * @returns {unknown[]}
 */
export function stampArrivalCapture(rows, source) {
  const kind = arrivalCaptureKindForSource(source);
  if (!kind || !Array.isArray(rows)) return rows;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const rec = /** @type {{ text?: unknown, arrivalCapture?: unknown }} */ (row);
    if (rec.arrivalCapture === 'ndgr' || rec.arrivalCapture === 'dom') continue;
    if (!parseArrivalCommentText(String(rec.text ?? ''))) continue;
    rec.arrivalCapture = kind;
  }
  return rows;
}

/**
 * @param {object|null|undefined} row
 * @returns {'ndgr'|'dom'|''}
 */
function arrivalCaptureKind(row) {
  const s = String(/** @type {{ arrivalCapture?: unknown }} */ (row || {}).arrivalCapture || '').trim();
  return s === 'ndgr' || s === 'dom' ? s : '';
}

/**
 * @param {object|null|undefined} row
 * @returns {string}
 */
function arrivalMessageId(row) {
  return String(/** @type {{ ndgrMessageId?: unknown }} */ (row || {}).ndgrMessageId ?? '').trim();
}

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
  /** @type {Map<string, { cap: number, kind: ''|'ndgr'|'dom', mid: string }[]>} */
  const seenBySentence = new Map();
  return {
    accept(row) {
      const sentence = niconicoArrivalSentence(row);
      if (!sentence) return 'no';
      const cap = toEpochMs(/** @type {{ capturedAt?: unknown }} */ (row).capturedAt);
      const kind = arrivalCaptureKind(row);
      const mid = arrivalMessageId(row);
      const prev = seenBySentence.get(sentence) || [];
      if (mid && prev.some((p) => p.mid === mid)) return 'dup';
      if (
        cap > 0 &&
        kind &&
        prev.some(
          (p) =>
            p.kind &&
            p.kind !== kind &&
            p.cap > 0 &&
            Math.abs(p.cap - cap) <= ARRIVAL_NOTICE_WINDOW_MS
        )
      ) {
        return 'dup';
      }
      prev.push({ cap, kind, mid });
      seenBySentence.set(sentence, prev);
      return 'count';
    }
  };
}
