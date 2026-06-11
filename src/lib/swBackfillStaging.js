/**
 * Service Worker backfill の取り置きペイロードを扱う純関数群。
 * SW は正本チャンクへ直接書かず、content が既存 persist パイプラインへ畳み込む。
 *
 * @module swBackfillStaging
 */

/** 1 live の取り置きに保持する最大行数。 */
export const SW_BACKFILL_STAGED_ROWS_MAX = 30_000;

/**
 * 取り置きストレージキーを返す。
 *
 * @param {string} liveId
 * @returns {string}
 */
export function swBackfillStagedKey(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  return `nls_swbf_staged_${lid}`;
}

/**
 * 既存取り置きと新規行を commentNo で dedupe し、新規側を優先してマージする。
 * commentNo が無い行は後段の既存 persist パイプラインへそのまま委ねる。
 *
 * @param {{
 *   lid: string,
 *   existingStaged: unknown,
 *   newRows: unknown,
 *   stopReason: unknown,
 *   now: number
 * }} args
 * @returns {{ v: 1, lid: string, rows: object[], stopReason: string, done: 1, ts: number }}
 */
export function buildSwBackfillStagedPayload({
  lid,
  existingStaged,
  newRows,
  stopReason,
  now
}) {
  const normalizedLid = String(lid || '').trim().toLowerCase();
  const existingRows =
    existingStaged &&
    typeof existingStaged === 'object' &&
    Array.isArray(/** @type {{ rows?: unknown }} */ (existingStaged).rows)
      ? /** @type {object[]} */ (
          /** @type {{ rows: unknown[] }} */ (existingStaged).rows
        )
      : [];
  const incomingRows = Array.isArray(newRows)
    ? /** @type {object[]} */ (newRows)
    : [];
  const combined = existingRows.concat(incomingRows);
  const seenCommentNos = new Set();
  /** @type {object[]} */
  const dedupedReversed = [];

  for (let i = combined.length - 1; i >= 0; i -= 1) {
    const row = combined[i];
    const commentNo = String(
      row && typeof row === 'object' && 'commentNo' in row
        ? /** @type {{ commentNo?: unknown }} */ (row).commentNo ?? ''
        : ''
    ).trim();
    if (commentNo) {
      if (seenCommentNos.has(commentNo)) continue;
      seenCommentNos.add(commentNo);
    }
    dedupedReversed.push(row);
  }

  const rows = dedupedReversed
    .reverse()
    .slice(-SW_BACKFILL_STAGED_ROWS_MAX);
  const timestamp = Number(now);

  return {
    v: 1,
    lid: normalizedLid,
    rows,
    stopReason: String(stopReason || ''),
    done: 1,
    ts: Number.isFinite(timestamp) ? timestamp : 0
  };
}

/**
 * 取り置きが指定 live の畳み込み対象として有効か判定する。
 *
 * @param {unknown} staged
 * @param {string} liveId
 * @returns {boolean}
 */
export function isSwBackfillStagedForLive(staged, liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || !staged || typeof staged !== 'object') return false;
  const payload = /** @type {{ v?: unknown, lid?: unknown, rows?: unknown }} */ (
    staged
  );
  return (
    payload.v === 1 &&
    String(payload.lid || '').trim().toLowerCase() === lid &&
    Array.isArray(payload.rows) &&
    payload.rows.length > 0
  );
}
