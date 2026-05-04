/**
 * beside（横付き）モードの inline panel の幅・高さを最適計算する純粋関数。
 *
 * 経緯（0.1.66 AV）:
 *   旧実装は幅は `inlinePanelLayout.js` の `computeInlinePanelSizeAndOffset`
 *   で `min(videoRect.width, viewport.width - vLeft - 12)` の clamp を持つが、
 *   実機の SPA 構造（特に video の右に幅広コメ列がある層構造）では panel が
 *   viewport 右端から見切れるケースが報告された (~1920px)。また高さは JS で
 *   設定されず CSS の `min(560px, 58vh)` 固定で、動画行の自然高さに連動
 *   しないため大画面では下半分が cream の空白になる現象（~2000px）も。
 *
 *   本関数は dock_bottom の `inlineHostDockSizing` と同じ方向性で、
 *   - 幅: video の **右隣の余白**を測る。flex で動画カラムと公式コメ列の **あいだ**
 *     に挟むときは `computeBesideInsertionGapPx` で実ギャップを渡す（viewport 右まで
 *     しか見ないと幅が過大になり flex 折り返しで動画と重なる）。
 *     ギャップが minWidth を下回れば null を返して below フォールバック。
 *     `flexInsertionGapPx` 省略時は従来どおり viewport − video.right（単体テスト互換）。
 *   - 高さ: player + コメ列の bottom（playerRowRect.height）に合わせ、content
 *     の自然高さが分かれば短い方を採用、最終的に viewport*0.72 で safety clamp。
 *
 * 設計:
 *   入力:
 *     - videoRect: video 要素の getBoundingClientRect
 *     - playerRowRect: video + コメ列の合計 rect（resolvePlayerRowRect 由来、
 *       取れなければ null）
 *     - viewport: { width, height } = innerWidth/innerHeight
 *     - contentNaturalHeight: panel iframe content の自然高さ（postMessage で
 *       取得できれば、なければ null）
 *   出力（null の場合あり）:
 *     - panelWidth: 採用する panel 幅
 *     - panelHeight: 採用する panel 高さ
 *     - source: 算出経路の診断情報
 *
 *   返り値が null のとき: 利用可能幅が minWidth を下回った = beside で出すと
 *   panel が破綻する → 呼出元で below モードに緊急フォールバックすべし。
 */

/**
 * @typedef {{ left: number, top: number, width: number, height: number }} RectLike
 * @typedef {{ width: number, height: number }} ViewportLike
 */

/**
 * @typedef {Object} BesidePanelLimits
 * @property {number} minWidth        panel の最小幅 (px)。これ未満なら null
 * @property {number} minHeight       panel の最小高さ (px)
 * @property {number} maxHeightRatio  viewport.height に対する高さ上限比
 * @property {number} safeRight       viewport 右端と panel 右端の最小余白 (px)
 * @property {number} besideInnerGap  flex 埋め込み時に次兄弟との間に確保するインナー余白 (px)
 */

/** @type {Readonly<BesidePanelLimits>} */
export const DEFAULT_BESIDE_PANEL_LIMITS = Object.freeze({
  minWidth: 280,
  minHeight: 240,
  maxHeightRatio: 0.72,
  safeRight: 12,
  /** 動画カラムと次兄弟（公式コメ列など）の間にパネルを挟むときの最低インナー余白 */
  besideInnerGap: 8
});

/**
 * DOM 上で動画カラムの **右端** と、すぐ右の兄弟要素の **左端**（無ければ viewport 右）
 * までに実際に確保されている横幅を返す。ここを無視すると「viewport にはまだ余白がある」
 * とみなしてパネル幅が肥大し、flex が折り返して動画と重なる。
 *
 * @param {number} insertColumnRight   動画カラム要素の getBoundingClientRect().right
 * @param {number} viewportInnerWidth
 * @param {number|null|undefined} nextSiblingLeft  次兄弟の getBoundingClientRect().left（無ければ null）
 * @param {Partial<BesidePanelLimits>} [overrides]
 * @returns {number} ギャップ px（負や極小になりうる）
 */
export function computeBesideInsertionGapPx(
  insertColumnRight,
  viewportInnerWidth,
  nextSiblingLeft,
  overrides = {}
) {
  const limits = { ...DEFAULT_BESIDE_PANEL_LIMITS, ...overrides };
  const vw = Math.max(0, Number(viewportInnerWidth) || 0);
  const colRight = Number(insertColumnRight) || 0;
  const gapInner = Number(limits.besideInnerGap) || 8;

  let slotRight = vw - limits.safeRight;
  if (nextSiblingLeft != null && Number.isFinite(Number(nextSiblingLeft))) {
    slotRight = Math.min(slotRight, Number(nextSiblingLeft) - gapInner);
  }
  return slotRight - colRight;
}

/**
 * @param {{
 *   videoRect: RectLike,
 *   playerRowRect: RectLike | null,
 *   viewport: ViewportLike,
 *   contentNaturalHeight: number | null,
 *   flexInsertionGapPx?: number | null
 * }} input
 * @param {Partial<BesidePanelLimits>} [overrides]
 * @returns {{ panelWidth: number, panelHeight: number, source: 'player-rect' | 'video-fallback' | 'content-fit' } | null}
 */
export function calculateBesidePanelLayout(input, overrides = {}) {
  const limits = { ...DEFAULT_BESIDE_PANEL_LIMITS, ...overrides };
  const {
    videoRect,
    playerRowRect,
    viewport,
    contentNaturalHeight,
    flexInsertionGapPx
  } = input;

  const vw = Math.max(0, Number(viewport.width) || 0);
  const vh = Math.max(0, Number(viewport.height) || 0);
  const vRight = Math.max(0, videoRect.left + videoRect.width);
  const videoWidth = Math.max(0, videoRect.width);
  const videoHeight = Math.max(0, videoRect.height);

  /*
   * 幅:
   *   - flex で「動画カラムの直後」に挟むときは flexInsertionGapPx（実ギャップ）を優先。
   *   - 無ければ従来どおり viewport 右まで（後方互換・単体テスト）
   */
  let availableRight;
  if (
    flexInsertionGapPx != null &&
    Number.isFinite(Number(flexInsertionGapPx))
  ) {
    availableRight = Number(flexInsertionGapPx);
  } else {
    availableRight = vw - vRight - limits.safeRight;
  }

  if (availableRight < limits.minWidth) {
    // 利用可能幅不足 → 呼出元で below フォールバックさせる
    return null;
  }

  // 利用可能幅と video.width の小さい方を採用（video と同幅を希望、不足分は縮める）
  let panelWidth = Math.min(videoWidth, availableRight);
  // video.width が 0 等で minWidth を下回ると不自然なので持ち上げ（availableRight 以下に clamp）
  if (panelWidth < limits.minWidth) {
    panelWidth = Math.min(limits.minWidth, availableRight);
    if (panelWidth < limits.minWidth) {
      return null;
    }
  }

  // 高さ: playerRowRect が取れればそれ、取れなければ video.height
  /** @type {'player-rect' | 'video-fallback'} */
  let baseSource = 'video-fallback';
  let baseHeight = videoHeight;
  if (
    playerRowRect &&
    Number.isFinite(playerRowRect.height) &&
    playerRowRect.height >= limits.minHeight
  ) {
    baseHeight = playerRowRect.height;
    baseSource = 'player-rect';
  }

  // safety: viewport*maxHeightRatio で上限 clamp
  const safetyMax = Math.max(
    limits.minHeight,
    Math.round(vh * limits.maxHeightRatio)
  );
  let panelHeight = Math.min(baseHeight, safetyMax);
  /** @type {'player-rect' | 'video-fallback' | 'content-fit'} */
  let source = baseSource;

  // contentNaturalHeight が分かれば、それで panel を縮める（過大な panel を出さない）
  if (
    contentNaturalHeight != null &&
    Number.isFinite(contentNaturalHeight)
  ) {
    const cnClamped = Math.max(limits.minHeight, contentNaturalHeight);
    if (cnClamped < panelHeight) {
      panelHeight = cnClamped;
      source = 'content-fit';
    }
  }

  // 最低 minHeight 保証
  panelHeight = Math.max(limits.minHeight, Math.round(panelHeight));

  return {
    panelWidth: Math.round(panelWidth),
    panelHeight,
    source
  };
}
