/**
 * 応援ランクストリップ（renderUserRooms）と同じ放送文脈でギフト帯を再読み込みするための正本。
 * コメント由来の UI だけ更新すると、storage のギフト行が進んでも帯が空のまま残るため、
 * renderUserRooms の各出口で必ずこれを通す。
 *
 * @param {unknown} liveId
 * @param {(normalizedLiveId: string) => void | Promise<unknown>} refreshGiftRankStripForLive
 */
export function syncGiftRankStripAfterUserRoomsRender(
  liveId,
  refreshGiftRankStripForLive
) {
  const lid = String(liveId ?? '').trim().toLowerCase();
  void refreshGiftRankStripForLive(lid);
}
