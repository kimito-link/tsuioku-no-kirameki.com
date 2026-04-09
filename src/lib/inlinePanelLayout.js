/**
 * 視聴ページに埋め込む nicolivelog パネルの幅・位置を、動画要素の表示矩形に合わせるための純関数。
 * （ニコ生のプレイヤー外周ラッパーは装飾込みで広いため、video の getBoundingClientRect を基準にする）
 */

/**
 * @typedef {{ width: number, height: number, top: number, left: number }} ViewRect
 */

/**
 * @typedef {{ innerWidth: number, innerHeight: number }} ViewportSize
 */

/**
 * インライン用に「主役の動画」とみなせる表示矩形か（従来のフレームターゲット判定と同閾値）
 * @param {ViewRect} rect
 * @param {ViewportSize} viewport
 * @returns {boolean}
 */
export function isValidBroadcastPlayerRect(rect, viewport) {
  const w = Number(rect.width) || 0;
  const h = Number(rect.height) || 0;
  const top = Number(rect.top) || 0;
  const left = Number(rect.left) || 0;
  const vw = Number(viewport.innerWidth) || 0;
  const vh = Number(viewport.innerHeight) || 0;
  /** content-entry のインライン表示閾値（260×140）と揃え、ギリギリのプレイヤーでも選べるようにする */
  if (w < 260 || h < 140) return false;
  if (top > vh - 80 || left > vw - 80) return false;
  const aspect = w / Math.max(h, 1);
  if (aspect < 1.02 || aspect > 3.2) return false;
  return true;
}

/**
 * 複数矩形のうち、有効なものの中で面積最大のインデックス（同一 document 内の複数 video 用）
 * @param {ViewRect[]} rects
 * @param {ViewportSize} viewport
 * @returns {number} 該当なしは -1
 */
export function selectBestPlayerRectIndex(rects, viewport) {
  let bestIdx = -1;
  let bestArea = -1;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (!isValidBroadcastPlayerRect(r, viewport)) continue;
    const area = r.width * r.height;
    if (area > bestArea) {
      bestArea = area;
      bestIdx = i;
    }
  }
  return bestIdx;
}

const DEFAULT_MIN_PANEL_WIDTH = 320;
const DEFAULT_EDGE_MARGIN = 12;

/**
 * パネル幅（px）と親内での左オフセット（margin-left 用）
 * @param {ViewRect} videoRect
 * @param {ViewRect|null} parentRect video.parentElement の矩形。無ければ null
 * @param {ViewportSize} viewport
 * @param {{ minWidth?: number, edgeMargin?: number }} [opts]
 * @returns {{ panelWidthPx: number, marginLeftPx: number }}
 */
export function computeInlinePanelSizeAndOffset(
  videoRect,
  parentRect,
  viewport,
  opts = {}
) {
  const minWidth = opts.minWidth ?? DEFAULT_MIN_PANEL_WIDTH;
  const edgeMargin = opts.edgeMargin ?? DEFAULT_EDGE_MARGIN;
  const vw = Number(viewport.innerWidth) || 0;
  const vLeft = Number(videoRect.left) || 0;
  const vWidth = Number(videoRect.width) || 0;

  let panelWidthPx = Math.max(minWidth, Math.round(vWidth));
  const maxByViewport = Math.max(minWidth, Math.floor(vw - vLeft - edgeMargin));
  panelWidthPx = Math.min(panelWidthPx, maxByViewport);

  let marginLeftPx = 0;
  if (parentRect) {
    marginLeftPx = Math.max(
      0,
      Math.round(vLeft - (Number(parentRect.left) || 0))
    );
  }

  return { panelWidthPx, marginLeftPx };
}

/**
 * @typedef {'video' | 'player_row'} InlinePanelWidthMode
 */

/**
 * @param {InlinePanelWidthMode|string} mode
 * @param {{
 *   videoRect: ViewRect
 *   rowRect: ViewRect | null
 *   parentRect: ViewRect | null
 *   viewport: ViewportSize
 *   minWidth?: number
 *   edgeMargin?: number
 * }} args
 * @returns {{ panelWidthPx: number, marginLeftPx: number }}
 */
export function computeInlinePanelLayout(mode, args) {
  const m = mode === 'video' ? 'video' : 'player_row';
  const {
    videoRect,
    rowRect,
    parentRect,
    viewport,
    minWidth,
    edgeMargin
  } = args;
  const opts = { minWidth, edgeMargin };
  if (m === 'video') {
    return computeInlinePanelSizeAndOffset(videoRect, parentRect, viewport, opts);
  }
  if (rowRect == null) {
    return computeInlinePanelSizeAndOffset(videoRect, parentRect, viewport, opts);
  }
  const minW = minWidth ?? DEFAULT_MIN_PANEL_WIDTH;
  const em = edgeMargin ?? DEFAULT_EDGE_MARGIN;
  const vw = Number(viewport.innerWidth) || 0;
  const rLeft = Number(rowRect.left) || 0;
  const rWidth = Number(rowRect.width) || 0;

  let panelWidthPx = Math.max(minW, Math.round(rWidth));
  const maxByViewport = Math.max(minW, Math.floor(vw - rLeft - em));
  panelWidthPx = Math.min(panelWidthPx, maxByViewport);

  let marginLeftPx = 0;
  if (parentRect) {
    marginLeftPx = Math.max(
      0,
      Math.round(rLeft - (Number(parentRect.left) || 0))
    );
  }

  return { panelWidthPx, marginLeftPx };
}

/**
 * 横付き（beside）は公式コメント列・入力バーと幅を奪い合い、狭いウィンドウで欠けやすい。
 * 保存された配置は変えず、実際の挿入・幅計算だけ「下（below）」に寄せる。
 */
export const INLINE_VIEWPORT_BESIDE_MIN_WIDTH = 1200;

/**
 * @param {string} storedPlacement `below` | `beside` | `floating`
 * @param {number} viewportInnerWidth
 * @returns {string}
 */
export function effectiveInlinePanelPlacement(
  storedPlacement,
  viewportInnerWidth
) {
  const s = String(storedPlacement || 'below');
  const w = Number(viewportInnerWidth) || 0;
  if (s === 'beside' && w > 0 && w < INLINE_VIEWPORT_BESIDE_MIN_WIDTH) {
    return 'below';
  }
  return s;
}
