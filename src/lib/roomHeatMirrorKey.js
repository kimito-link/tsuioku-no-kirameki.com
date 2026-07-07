/**
 * 室温(ルーム熱度・5分増減)鏡の storage キー正本
 *   (reference_full_mirror_SYNTHESIS.md M3・第4号)。
 *   producer = popup(watch タブで室温を計算・renderRoomHeatSummary) / consumer = status(jsonBlob 相乗り) → 純Web③。
 *   commentTimelineMirrorKey.js / giftHistoryMirrorKey.js と同思想で別ページ間で同じキーを使う。
 *
 * 狙い = ①の「室温」パネル(直近5分の応援増加・件数/人数/熱度バー)を純Web③にも丸写しする。
 */
export const KEY_ROOM_HEAT_MIRROR = 'nls_room_heat_mirror_v1';
