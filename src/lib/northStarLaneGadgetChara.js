/**
 * 北極星レーン左ガジェットのデフォルトキャラ画像（拡張ルート相対）。
 * モックの「レーンごとに違う案内キャラ」に近づける。未取得時も同画像を段階表示で使う。
 */

/**
 * @param {string} laneId
 * @returns {string}
 */
export function northStarLaneGadgetCharaRelativePath(laneId) {
  const lid = String(laneId || '').trim();
  switch (lid) {
    case 'adRanking':
      return 'images/marketing-html-avatars/konta-72.png';
    case 'giftHistory':
      return 'images/marketing-html-avatars/tanu-72.png';
    case 'contributionRanking':
    case 'eventRank':
    case 'eventScore':
    case 'programPoints':
    default:
      return 'images/marketing-html-avatars/rink-72.png';
  }
}
