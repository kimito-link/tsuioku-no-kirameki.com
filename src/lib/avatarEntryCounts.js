/**
 * コメントエントリ配列から avatar の数を数える純関数。
 *
 * popup-entry.js に直書きだった countUniqueAvatarEntries を、テスト可能な純関数として
 * 切り出したもの。chrome / DOM / 可変グローバルに依存しない(avatarCompareKey は同じ lib 群)。
 *
 * @module avatarEntryCounts
 */

import { avatarCompareKey } from './avatarUrlCompare.js';

/**
 * entries の中で、avatar URL が指す「実体として一意な」アバターの数を数える。
 *
 * 同じ人物を指す URL の表記ゆれ(クエリ違い等)は avatarCompareKey で正規化して 1 つに畳む。
 * 空 URL は数えない。元の popup-entry.js#countUniqueAvatarEntries と完全同一。
 *
 * @param {Array<{avatarUrl?: string}>|null|undefined} entries
 * @returns {number} 一意なアバター数
 */
export function countUniqueAvatarEntries(entries) {
  const set = new Set();
  for (const e of entries || []) {
    const k = avatarCompareKey(String(e?.avatarUrl || '').trim());
    if (k) set.add(k);
  }
  return set.size;
}
