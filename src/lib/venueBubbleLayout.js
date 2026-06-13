// venueBubbleLayout.js
// v0.1.717: 会場モードの吹き出し(セリフ)を「席の外の最上位レイヤー」に置くための配置純関数。
//
// 設計正本: memory/reference_venue_fullscreen_meeting.md(第4回会議・確定A/B/D)。
// ユーザー実機不満=吹き出しがアバター下に潜る/上段アイコンと重なる/overflow:hidden でクリップ
//   消失。真因=吹き出しを席ノードに append していて席コンテナの overflow:hidden に切られる。
// 解決=吹き出しは席の外の最上位レイヤーに描き、各席の矩形から「頭上の座標」を計算してそこへ
//   絶対配置する。重なりは上方向オフセットで避ける。星野ロミ流=可読性最優先・セリフが主役。
//
// このファイルは座標計算だけ(DOM/chrome.* 非依存・テスト可能):
//   - 席の矩形 → 吹き出しアンカー(頭上中央)座標
//   - 既存吹き出しとの縦の重なりを上方向オフセットで回避

/** 吹き出しの席頭上からの基本ギャップ(px)。 */
export const BUBBLE_ANCHOR_GAP = 10;

/**
 * 席の矩形(レイヤー基準の相対座標)から、吹き出しの「下端中央」を置くアンカー点を作る。
 * 吹き出しは translate(-50%, -100%) で配置する前提なので、ここが吹き出しの下辺中央になる。
 * @param {{ left:number, top:number, width:number, height:number }} seatRect
 *   レイヤー左上を原点とした席の矩形(getBoundingClientRect をレイヤー基準に変換済み)
 * @param {number} [gap=BUBBLE_ANCHOR_GAP] 席の上端から吹き出し下辺までの余白
 * @returns {{ x:number, y:number }} レイヤー基準のアンカー点(x=中央, y=頭上)
 */
export function bubbleAnchorForSeatRect(seatRect, gap = BUBBLE_ANCHOR_GAP) {
  const left = Number(seatRect?.left) || 0;
  const top = Number(seatRect?.top) || 0;
  const width = Number(seatRect?.width) || 0;
  const g = Number(gap) || 0;
  return {
    x: Math.round(left + width / 2),
    y: Math.round(top - g)
  };
}

/**
 * 新しい吹き出しの縦位置を、既存の吹き出し群と重ならないよう上方向にずらして決める。
 * 吹き出しは「下辺 y を基準に高さ h ぶん上へ伸びる」想定(translateY(-100%))。
 * 同じ列付近(x が近い)で下辺が重なる既存吹き出しがあれば、その上へ逃がす。
 *
 * @param {{ x:number, y:number, h:number }} candidate 置きたい吹き出し(y=下辺・h=高さ)
 * @param {Array<{ x:number, y:number, h:number }>} placed 既に置いた吹き出し(同形式)
 * @param {object} [opts]
 * @param {number} [opts.xThreshold=120] これ以内の x 差を「同じ列」とみなす(px)
 * @param {number} [opts.vGap=6] 重なり回避時に空ける縦の隙間(px)
 * @param {number} [opts.minY=8] レイヤー上端からの最小 y(これ以上は上げない)
 * @returns {number} 衝突回避後の下辺 y
 */
export function resolveBubbleY(candidate, placed, opts) {
  const xThreshold = Number(opts?.xThreshold ?? 120);
  const vGap = Number(opts?.vGap ?? 6);
  const minY = Number(opts?.minY ?? 8);
  const h = Math.max(0, Number(candidate?.h) || 0);
  let y = Number(candidate?.y) || 0;
  const x = Number(candidate?.x) || 0;
  const list = Array.isArray(placed) ? placed : [];

  // 下から上へ:近い列で重なるなら、その吹き出しの上端 - vGap まで持ち上げる。
  // 何度か走査して連鎖的な重なりも解消する(吹き出しは最大4個なので軽い)。
  let moved = true;
  let guard = 0;
  while (moved && guard < 16) {
    moved = false;
    guard += 1;
    for (const p of list) {
      const px = Number(p?.x) || 0;
      if (Math.abs(px - x) > xThreshold) continue; // 別の列は重ならない
      const pTop = (Number(p?.y) || 0) - (Math.max(0, Number(p?.h) || 0));
      const pBottom = Number(p?.y) || 0;
      const myTop = y - h;
      // 縦に重なっている(自分の帯と相手の帯が交差)なら相手の上へ逃がす
      const overlap = myTop < pBottom && y > pTop;
      if (overlap) {
        y = pTop - vGap;
        moved = true;
      }
    }
  }
  // 上端を越えないようにクランプ(越えるなら最小 y に置く=多少重なっても画面内優先)
  if (y - h < minY) y = minY + h;
  return Math.round(y);
}
