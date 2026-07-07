/**
 * 投げ一覧(giftHistory・koken API)鏡の storage キー正本
 *   (reference_full_mirror_SYNTHESIS.md B・第2号)。
 *   producer = popup(北極星 giftHistory レーンを描く watch タブ) / consumer = status(jsonBlob に相乗り) → 純Web③。
 *   commentTimelineMirrorKey.js / laneMirrorKey.js と同思想で、別ページ間で同じキーを使うためここに集約。
 *
 * 狙い = ①の「投げ一覧」パネル(誰がいつ何を何pt投げたか)を純Web③にも丸写しする。
 */
export const KEY_GIFT_HISTORY_MIRROR = 'nls_gift_history_mirror_v1';
