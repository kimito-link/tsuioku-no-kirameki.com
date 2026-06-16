// ownPostedUserIdSet.js
// v0.1.773: 「自分が投稿した userId」の集合を1パスで作る純関数。
//
// 背景(性能): renderStoryUserLane は集約(aggregate)ごとに hasOwnPostedEntryForUserId を呼び、
//   その中で保存コメント全件(N)を走査していた。集約数 U × N の O(U·N) が、表示が変わらない
//   refresh でも(描画ガードより手前で)毎回走り、長時間・大量コメントで「めちゃ遅い」原因に。
//   そこでループの外で own-posted な userId 集合を1回だけ作り、ループ内は O(1) の has() にする。
//
// own-posted 判定は popup の hasOwnPostedEntryForUserId と同一規則:
//   entry が selfPosted、または matchedIds(=自己投稿履歴と1対1照合済みの安定ID集合)に
//   entry の安定IDが含まれるなら、その entry.userId は own-posted。

/**
 * @param {ReadonlyArray<{ userId?: unknown, selfPosted?: unknown }>|null|undefined} entries
 *   保存コメント(当ライブ)。各 entry は userId / selfPosted を持ちうる。
 * @param {ReadonlySet<string>|null|undefined} matchedIds
 *   自己投稿履歴に1対1照合できた entry の安定ID集合(getOwnPostedMatchedIdSet 由来)。
 * @param {(entry: any) => string} stableIdOf
 *   entry → 安定ID を返す関数(popupEntryStableId(entry, lid) を束縛して渡す)。
 * @returns {Set<string>} own-posted な userId の集合(trim 済み・空 userId は含めない)。
 */
export function buildOwnPostedUserIdSet(entries, matchedIds, stableIdOf) {
  const set = new Set();
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) return set;
  const hasMatch = matchedIds instanceof Set && matchedIds.size > 0;
  const idOf = typeof stableIdOf === 'function' ? stableIdOf : null;
  for (const entry of list) {
    const uid = String(/** @type {any} */ (entry)?.userId ?? '').trim();
    if (!uid) continue;
    if (set.has(uid)) continue; // 既に own-posted 確定なら再判定不要
    if (/** @type {any} */ (entry)?.selfPosted) {
      set.add(uid);
      continue;
    }
    if (hasMatch && idOf && matchedIds.has(idOf(entry))) {
      set.add(uid);
    }
  }
  return set;
}
