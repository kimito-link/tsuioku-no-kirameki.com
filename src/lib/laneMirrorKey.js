// laneMirrorKey.js
// popup の応援レーン(りんく/こん太/広告/たぬ姉の段組み)を「顔=avatar 含めてそっくり」status へ
//   映すための鏡データの storage キー。laneDiagKey.js(人数だけ)とは別キーに分離する=健全度パネルが
//   毎回読む軽量 laneDiag を太らせない(status の軽さ最優先・MEMORY 鉄則)。
//   会場をいじる前に「POP に並ぶべきもの」を正本として診断に映し、会場のズレを後で突合する土台にする。
//
// ★端末内(同一拡張の storage.local)に閉じる=外部送信なし。avatar URL/表示名は記録済みコメント由来で
//   既に端末内にある情報なので方針の精神に反しない。が、最小限(各段 cap・4フィールド)に間引いて書く。

/** 応援レーン鏡データの storage キー(local only)。 */
export const KEY_LANE_MIRROR = 'nls_lane_mirror_v1';
