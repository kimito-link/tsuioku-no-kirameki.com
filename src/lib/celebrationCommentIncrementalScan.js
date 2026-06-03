/**
 * コメント配列のギフト／広告演出: 配信ごとに初回は全件 prime のみ、以降は追加分だけ process。
 * 毎回末尾24件を走査すると heavy 読込後に未 prime の古いギフトが誤爆する。
 */

/** @type {Map<string, number>} */
const scannedLenByLive = new Map();

/**
 * @param {string} [liveId] 省略時は全配信リセット
 */
export function resetCelebrationIncrementalScan(liveId) {
  if (liveId == null || String(liveId).trim() === '') {
    scannedLenByLive.clear();
    return;
  }
  scannedLenByLive.delete(String(liveId).trim().toLowerCase());
}

/**
 * @param {unknown[]} entries
 * @param {string} liveId
 * @param {{ primeEntry: (entry: unknown) => void, processEntry: (entry: unknown) => void }} hooks
 */
export function runCelebrationCommentIncrementalScan(entries, liveId, hooks) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || !Array.isArray(entries)) return;

  const prev = scannedLenByLive.get(lid);
  if (prev === undefined) {
    for (const entry of entries) {
      hooks.primeEntry(entry);
    }
    scannedLenByLive.set(lid, entries.length);
    return;
  }

  const from = Math.max(0, Math.floor(prev));
  if (entries.length <= from) return;

  for (let i = from; i < entries.length; i += 1) {
    hooks.processEntry(entries[i]);
  }
  scannedLenByLive.set(lid, entries.length);
}
