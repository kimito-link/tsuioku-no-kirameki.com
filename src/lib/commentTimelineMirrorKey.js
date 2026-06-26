/**
 * コメントタイムライン鏡の storage キー正本（council/liveview-wholesale-root-SYNTHESIS.md 第2段）。
 *   producer = popup(watch タブで displayEntries を持つ) / consumer = status(jsonBlob に相乗り) → 純Web。
 *   laneMirrorKey.js / northStarMirrorKey.js と同思想で、別ページ間で同じキーを使うためここに集約。
 *
 * 狙い = 純Webで「コメントが進む動き」を出すため、最新N件のコメントタイムラインを鏡として運ぶ。
 */
export const KEY_COMMENT_TIMELINE_MIRROR = 'nls_comment_timeline_mirror_v1';
