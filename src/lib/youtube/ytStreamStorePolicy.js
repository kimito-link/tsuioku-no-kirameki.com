// ytStreamStorePolicy.js — YouTube Live 配信コメントの保存要約・IndexedDB レコード正規化・表示スライス計算（純関数）
// @layer L0 — 純粋計算（副作用・ブラウザ API なし）

/** サイドパネルの各レーンに表示する最新コメントの上限件数（保存自体は全件） */
export const YT_SIDE_PANEL_DISPLAY_LIMIT = 150;

/**
 * videoId と commentId から IndexedDB 保存用の複合主キーを生成する。
 * @param {string} videoId
 * @param {string} commentId
 * @returns {string}
 */
export function buildYtCommentPrimaryKey(videoId, commentId) {
  const v = String(videoId || '').trim();
  const c = String(commentId || '').trim();
  if (!v || !c) return '';
  return `${v}::${c}`;
}

/**
 * `chrome.storage.local` に置く配信一覧の軽量な要約オブジェクトを生成・更新する。
 * コメント配列（`items`）は IndexedDB に全件保存するため、ここには一切含めない。
 *
 * @param {any} existing
 * @param {{
 *   videoId: string,
 *   title?: string,
 *   broadcasterName?: string,
 *   broadcasterChannelId?: string,
 *   chatFilterLabel?: string,
 *   itemCount?: number
 * }} patch
 * @param {number} [nowMs]
 * @returns {{
 *   videoId: string,
 *   title: string,
 *   broadcasterName: string,
 *   broadcasterChannelId: string,
 *   chatFilterLabel: string,
 *   itemCount: number,
 *   createdAt: number,
 *   updatedAt: number
 * }}
 */
export function mergeYtStreamSummary(existing, patch, nowMs = Date.now()) {
  const prev = existing && typeof existing === 'object' ? existing : {};
  const videoId = String(patch?.videoId || prev.videoId || '').trim();
  const title = String(patch?.title || prev.title || '').trim();
  const broadcasterName = String(patch?.broadcasterName || prev.broadcasterName || '').trim();
  const broadcasterChannelId = String(
    patch?.broadcasterChannelId || prev.broadcasterChannelId || '',
  ).trim();
  const chatFilterLabel = String(patch?.chatFilterLabel || prev.chatFilterLabel || '').trim();
  const itemCount =
    typeof patch?.itemCount === 'number' && Number.isFinite(patch.itemCount) && patch.itemCount >= 0
      ? Math.floor(patch.itemCount)
      : typeof prev.itemCount === 'number' && Number.isFinite(prev.itemCount)
        ? Math.floor(prev.itemCount)
        : 0;

  const createdAt =
    typeof prev.createdAt === 'number' && Number.isFinite(prev.createdAt) && prev.createdAt > 0
      ? prev.createdAt
      : nowMs;

  return {
    videoId,
    title,
    broadcasterName,
    broadcasterChannelId,
    chatFilterLabel,
    itemCount,
    createdAt,
    updatedAt: nowMs,
  };
}

/**
 * 受信したコメント配列を、間引き（上限カット）なしで IndexedDB 保存用レコード配列へ正規化する。
 * 同一バッチ内の重複 `id` は排除する。
 *
 * @param {string} videoId
 * @param {any[]} incomingItems
 * @param {number} [nowMs]
 * @returns {any[]}
 */
export function prepareYtCommentsForIdb(videoId, incomingItems, nowMs = Date.now()) {
  const vid = String(videoId || '').trim();
  if (!vid || !Array.isArray(incomingItems) || incomingItems.length === 0) {
    return [];
  }

  /** @type {Set<string>} */
  const seenPks = new Set();
  /** @type {any[]} */
  const records = [];

  for (let i = 0; i < incomingItems.length; i += 1) {
    const item = incomingItems[i];
    if (!item || typeof item !== 'object') continue;
    const commentId = String(item.id || '').trim();
    const pk = buildYtCommentPrimaryKey(vid, commentId);
    if (!pk || seenPks.has(pk)) continue;
    seenPks.add(pk);

    records.push({
      ...item,
      id: commentId,
      videoId: vid,
      pk,
      recordedAt:
        typeof item.recordedAt === 'number' && Number.isFinite(item.recordedAt)
          ? item.recordedAt
          : nowMs + i * 0.001,
    });
  }

  return records;
}

/**
 * 1つの配信について全件保存されたコメント配列から、サイドパネル表示用に
 * 新しい順（降順）で最大 `limit` 件を取り出す（元の配列は変更しない）。
 *
 * @param {any[]} items
 * @param {number} [limit]
 * @returns {any[]}
 */
export function selectYtNewestCommentsForDisplay(items, limit = YT_SIDE_PANEL_DISPLAY_LIMIT) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const maxCount =
    typeof limit === 'number' && Number.isFinite(limit) && limit > 0
      ? Math.floor(limit)
      : YT_SIDE_PANEL_DISPLAY_LIMIT;
  const startIdx = Math.max(0, items.length - maxCount);
  return items.slice(startIdx).reverse();
}
