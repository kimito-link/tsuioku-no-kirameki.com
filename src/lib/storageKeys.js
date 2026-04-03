/**
 * chrome.storage.local キー（プレフィックスで衝突回避）
 */

export const KEY_RECORDING = 'nls_recording_enabled';

/** @param {string} liveId lv123 */
export function commentsStorageKey(liveId) {
  const id = String(liveId || '').trim().toLowerCase();
  return `nls_comments_${id}`;
}
