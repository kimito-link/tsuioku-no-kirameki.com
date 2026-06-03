/**
 * heavy read 完了前に応援ランキングへ載せる暫定コメント行の合成（0 秒表示用）。
 * 件数カード（panelSummary / chunk index / cdbSummary.total）と表示リストのギャップを埋める。
 *
 * @module provisionalLaneCommentRows
 */

import { normalizeSummaryRecentRows } from './commentSummary.js';

/**
 * @param {unknown} row
 * @returns {string}
 */
function rowDedupeKey(row) {
  if (!row || typeof row !== 'object') return '';
  const r = /** @type {Record<string, unknown>} */ (row);
  const no = String(r.commentNo ?? r.no ?? '').trim();
  if (no) return `no:${no}`;
  const text = String(r.text ?? '').trim();
  const uid = String(r.userId ?? '').trim();
  const sec = Math.floor(Number(r.capturedAt || 0) / 1000);
  return `t:${text}|${uid}|${sec}`;
}

/**
 * @param {unknown[]} target
 * @param {Set<string>} seen
 * @param {readonly unknown[]} rows
 */
function appendUniqueRows(target, seen, rows) {
  const normalized = normalizeSummaryRecentRows(rows);
  for (const row of normalized) {
    const key = rowDedupeKey(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    target.push(row);
  }
}

/**
 * heavy 未完了時にランキング集計へ渡すコメント行を選ぶ。
 *
 * @param {{
 *   liveId: string,
 *   primaryEntries?: readonly unknown[],
 *   heavySettled?: boolean,
 *   panelSummary?: { recent?: unknown, recentRows?: unknown } | null,
 *   commentSummary?: { recent?: unknown } | null,
 *   cdbSummary?: { recent?: unknown } | null,
 *   extraSummaryRows?: readonly unknown[]
 * }} opts
 * @returns {{ entries: unknown[], provisional: boolean }}
 */
export function selectLaneFeedCommentRows(opts) {
  const lv = String(opts?.liveId || '').trim().toLowerCase();
  const primary = Array.isArray(opts?.primaryEntries) ? [...opts.primaryEntries] : [];
  const heavySettled = opts?.heavySettled === true;

  if (heavySettled || !lv) {
    return { entries: primary, provisional: false };
  }

  /** @type {unknown[]} */
  const merged = [];
  const seen = new Set();
  appendUniqueRows(merged, seen, primary);
  appendUniqueRows(merged, seen, opts?.extraSummaryRows || []);
  const panelRecent =
    /** @type {unknown[]} */ (opts?.panelSummary?.recent) ||
    /** @type {unknown[]} */ (opts?.panelSummary?.recentRows) ||
    [];
  appendUniqueRows(merged, seen, panelRecent);
  appendUniqueRows(
    merged,
    seen,
    /** @type {unknown[]} */ (opts?.commentSummary?.recent) || []
  );
  appendUniqueRows(
    merged,
    seen,
    /** @type {unknown[]} */ (opts?.cdbSummary?.recent) || []
  );

  if (merged.length <= primary.length) {
    return { entries: primary, provisional: false };
  }
  return { entries: merged, provisional: true };
}
