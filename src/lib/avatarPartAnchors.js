/**
 * 128x128 の正規化座標。素材差し替え後もここだけで位置と大きさを調整する。
 * 各パーツは width だけ指定し、高さは素材のアスペクト比から自動算出する
 * (drawPart 参照)。固定 height で歪ませない=これがゆっくり顔の自然さの肝。
 * v0.1.704 実機24面プレビュー(chrome-devtools-mcp)で確定した値。
 *
 * ★v0.1.1681: メインスレッドの合成(avatarPartsComposer.js)と Worker の合成(avatarFaceRender.js)が
 *   同じ値を使うため、このファイルへ移した(avatarPartsComposer.js は従来どおり再エクスポートする)。
 */
export const AVATAR_PART_ANCHORS = Object.freeze({
  canvasSize: 128,
  face: Object.freeze({
    cx: 0.5,
    cy: 0.53,
    radius: 0.34,
    fill: '#ffe6cf',
    stroke: '#332a26',
    strokeWidth: 0.02
  }),
  cheek: Object.freeze({
    cx: 0.5,
    cy: 0.6,
    width: 0.58
  }),
  eyes: Object.freeze({
    cx: 0.5,
    cy: 0.5,
    width: 0.52
  }),
  mouth: Object.freeze({
    cx: 0.5,
    cy: 0.66,
    width: 0.24
  }),
  hair: Object.freeze({
    cx: 0.5,
    cy: 0.39,
    width: 0.92
  })
});
