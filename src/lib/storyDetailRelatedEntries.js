/**
 * ストーリー詳細／プレビュー脇の「同一ユーザーの直近」リスト用。
 * userId が無いコメント同士を同一人物とみなさない（無関係な行を混ぜない）。
 */

/**
 * @param {{ userId?: string|null }[]} allEntries
 * @param {{ userId?: string|null }} focusEntry
 * @param {{ limit?: number }} [opts]
 * @returns {{ userId?: string|null, commentNo?: string, text?: string }[]}
 */
export function entriesRelatedForStoryDetail(allEntries, focusEntry, opts = {}) {
  const limit = Number(opts.limit) > 0 ? Number(opts.limit) : 5;
  const uid = String(focusEntry?.userId || '').trim();
  if (!uid) return [];
  const list = Array.isArray(allEntries) ? allEntries : [];
  return list
    .filter((row) => String(row?.userId || '').trim() === uid)
    .slice(-limit)
    .reverse();
}
