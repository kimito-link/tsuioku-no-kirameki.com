/**
 * セッション比較(記録サマリの推移)鏡の storage キー正本
 *   (reference_full_mirror_SYNTHESIS.md M5・第5号)。
 *   producer = popup(watch タブで IndexedDB のサマリ推移を読む) / consumer = status(jsonBlob 相乗り) → 純Web③。
 *   giftHistoryMirrorKey.js / roomHeatMirrorKey.js と同思想で別ページ間で同じキーを使う。
 *
 * 狙い = ①の「記録サマリの推移(この放送)」パネル(約1分ごとのサンプル最大24行)を純Web③にも丸写しする。
 *   IndexedDB は popup しか読めないため、paint 直後に同じ rows を鏡へ運ぶ(③は同じ純lib で描く)。
 */
export const KEY_SESSION_SUMMARY_MIRROR = 'nls_session_summary_mirror_v1';
