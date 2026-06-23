// statCardsMirrorKey.js
// popup 上部の数字カード群(記録N件・推定同時接続・来場者数・公式統計チップ)を status.html に
//   そっくり映すための鏡データの storage キー。応援レーンの鏡(laneMirrorKey.js)と同じ方式
//   (popup→storage→status が読んで本物の値で描く)。会場には一切関係しない=popup と status だけ。
//   レーンの鏡(KEY_LANE_MIRROR)とは別キーに分離=互いに太らせない。

/** 数字カード鏡データの storage キー(local only)。 */
export const KEY_STAT_CARDS_MIRROR = 'nls_stat_cards_mirror_v1';
