/**
 * 取得した watch snapshot を generation を超えて永続化するためのヘルパ。
 *
 * 設計（0.1.94 race fix）:
 *   popup-entry.js#refresh() は polling 周期ごとに呼ばれ、毎回
 *   `++watchPopupRefreshGeneration` で世代番号を付与する。fetch 完了後の paint は
 *   `if (!isFreshRefresh()) return;` で守られている。これは「古い refresh が
 *   後から戻ってきて新しい放送を上書きしないように」という設計意図。
 *
 *   しかし旧コードは snapshot のマージも `isFreshRefresh()` の後ろに置いていた。
 *   INLINE モードで polling=10s、`requestWatchPageSnapshotFromOpenTab` の
 *   frame iteration × retry で fetch が ~11s かかる場合、bail-out で
 *   `watchMetaCache.snapshot` が更新されず永久に null のまま、結果として
 *   「（接続中…）」が固定される race condition が発生していた（ユーザー実機 v0.1.92 で確認）。
 *
 *   このヘルパは「snapshot は generation を超える永続キャッシュ」という分離を
 *   コードレベルで強制する。fetch が成功して値があれば必ず merge して返す。
 *   呼び出し側は `isFreshRefresh()` の前に呼ぶ運用とする。
 *
 *   一方で paint や derived UI 更新は引き続き `isFreshRefresh()` で守る。
 *   snapshot 自体は世代をまたいで生き残るが、それを使った描画は最新世代のみが行う。
 */

/**
 * @template T
 * @param {{
 *   currentSnapshot: T | null,
 *   fetchedSnapshot: T | null,
 *   merge: (prev: T | null, next: T | null) => T | null
 * }} args
 * @returns {T | null}
 */
export function persistFreshlyFetchedSnapshot({ currentSnapshot, fetchedSnapshot, merge }) {
  if (fetchedSnapshot == null) return currentSnapshot;
  return merge(currentSnapshot, fetchedSnapshot);
}
