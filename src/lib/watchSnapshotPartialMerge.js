/**
 * watchMetaCache.snapshot を更新する際の partial-merge 純粋関数。
 *
 * 設計（0.1.41 W）:
 *   popup-entry.js は 10〜30 秒ごとに `requestWatchPageSnapshotFromOpenTab`
 *   を呼んで snapshot を再取得・上書きしていた。content-entry.js の
 *   `collectWatchPageSnapshot` は `embedded-data` から broadcaster 系を
 *   引いているが、niconico SPA は時間経過で `#embedded-data` 要素を
 *   書き換えたり一瞬消したりすることがあり、polling が運悪くそのタイミングに
 *   当たると broadcaster フィールドが空文字の snapshot が返る。
 *
 *   旧コードは `watchMetaCache.snapshot = snapResult.snapshot` で無条件に
 *   上書きしていたため、空に上書きされ → `resolveBroadcasterFollowTarget`
 *   が kind=none を返す → 配信者タイルが消える、という現象が発生していた。
 *
 *   このヘルパは「新 snapshot で broadcaster 系が空、かつ旧 snapshot に
 *   値が入っている」場合に旧値を保つ。新 snapshot が確実な
 *   フィールド（liveId, viewerCount 等）はそのまま新値で上書きする。
 *
 *   保護対象（broadcaster identity フィールド）:
 *     - broadcasterName
 *     - broadcasterPageUrl
 *     - broadcasterIconUrl
 *     - broadcasterUserId
 *     - broadcasterLevel（null のとき prev を保つ。0 や数値は尊重）
 *
 *   それ以外（viewerCount, totalComments, streamAgeMin, 等）は
 *   時間で変わる値なので新 snapshot をそのまま採用する。
 */

/**
 * @typedef {Record<string, unknown>} SnapshotShape
 */

const PROTECTED_STRING_FIELDS = /** @type {const} */ ([
  'broadcasterName',
  'broadcasterPageUrl',
  'broadcasterIconUrl',
  'broadcasterUserId'
]);

/**
 * @param {unknown} v
 * @returns {string}
 */
function asTrimmedString(v) {
  if (v == null) return '';
  return String(v).trim();
}

/**
 * @param {SnapshotShape | null | undefined} prev
 * @param {SnapshotShape | null | undefined} next
 * @returns {SnapshotShape | null}
 */
export function mergeWatchSnapshotPreservingBroadcaster(prev, next) {
  if (next == null) return null;
  if (prev == null) return next;

  /** @type {SnapshotShape} */
  const merged = { ...next };

  for (const key of PROTECTED_STRING_FIELDS) {
    const nextStr = asTrimmedString(next[key]);
    if (!nextStr) {
      const prevStr = asTrimmedString(prev[key]);
      if (prevStr) {
        merged[key] = prev[key];
      }
    }
  }

  // broadcasterLevel: null/undefined なら prev を採用、数値（0 含む）なら next 尊重
  const nextLv = next.broadcasterLevel;
  if (nextLv == null) {
    if (prev.broadcasterLevel != null) {
      merged.broadcasterLevel = prev.broadcasterLevel;
    }
  }

  return merged;
}
