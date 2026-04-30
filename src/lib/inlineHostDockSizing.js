/**
 * dock_bottom モードの inline panel 高さを viewport と player rect から最適計算する純粋関数。
 *
 * 経緯（0.1.65 AU）:
 *   旧: `iframe.height = vh * 0.5` 固定 + `maxDockH = vh * 0.58`（上限 720）。
 *      → 1080px 級では panel が 540px まで広がり「画面下半分占有」、ユーザー報告
 *        「全体のバランスがおかしい」。
 *      → 720p ノートでは panel が 360px、動画 + 上部コンテンツ + panel で
 *        足りなくなる懸念。
 *   新: ニコ生 player（動画 + コメ列）が viewport 上で実際に占めている縦範囲を
 *      測定し、その**残りスペース**を panel に割り当てる。動画は player の自然
 *      サイズを保ち、panel は残った空間にぴったり収まる設計。viewport / player
 *      rect の変化は ResizeObserver で追従（呼び出し側）。
 *
 * 設計:
 *   入力:
 *     - viewportHeight: window.innerHeight
 *     - playerRowBottom: video + コメ列の bottom（viewport 上端からの距離）。
 *       resolvePlayerRowRect から取得、取れなければ null。
 *     - contentNaturalHeight: panel content（iframe 内）の自然高さ（取れなければ null）。
 *   出力:
 *     - height: 採用する panel 高さ
 *     - source: 'player-rect' | 'content-fit' | 'fallback' | 'min'
 *               （どの算出経路で決まったかの診断情報）
 *
 *   eligibility 順:
 *     1. playerRowBottom が取れる: viewport - playerRowBottom - bottomPadding
 *        を「使える空間」として計算。
 *     2. その「使える空間」が contentNaturalHeight より大きく、かつ
 *        contentNaturalHeight が minHeight 以上なら、content-fit（過大な
 *        panel を出さない）。
 *     3. 使える空間が minHeight 未満なら minHeight にフォールバック。
 *     4. playerRowBottom が取れない: viewport * 0.4（控えめなデフォルト）。
 *     5. すべての結果は最終的に safetyMax (viewport * maxRatio) で clamp。
 */

/**
 * @typedef {Object} DockPanelLimits
 * @property {number} minHeight       panel の最小高さ (px)
 * @property {number} maxRatio        viewport.height に対する上限比率
 * @property {number} bottomPadding   panel と viewport bottom の隙間 (px)
 * @property {number} fallbackRatio   playerRowBottom が取れない時の比率
 */

/** @type {Readonly<DockPanelLimits>} */
export const DEFAULT_DOCK_PANEL_LIMITS = Object.freeze({
  minHeight: 220,
  maxRatio: 0.55,
  bottomPadding: 8,
  fallbackRatio: 0.4
});

/**
 * @param {{
 *   viewportHeight: number,
 *   playerRowBottom: number | null,
 *   contentNaturalHeight: number | null
 * }} input
 * @param {Partial<DockPanelLimits>} [overrides]
 * @returns {{ height: number, source: 'player-rect' | 'content-fit' | 'fallback' | 'min' }}
 */
export function calculateDockBottomPanelHeight(input, overrides = {}) {
  const limits = { ...DEFAULT_DOCK_PANEL_LIMITS, ...overrides };
  const vh = Math.max(280, Number(input.viewportHeight) || 0);
  const safetyMax = Math.max(
    limits.minHeight,
    Math.round(vh * limits.maxRatio)
  );

  /**
   * @param {number} h
   * @param {'player-rect' | 'content-fit' | 'fallback' | 'min'} source
   */
  const clamp = (h, source) => ({
    height: Math.max(limits.minHeight, Math.min(safetyMax, Math.round(h))),
    source
  });

  const pb = input.playerRowBottom;
  if (pb != null && Number.isFinite(pb) && pb > 0) {
    const available = vh - pb - limits.bottomPadding;
    if (available >= limits.minHeight) {
      // content の自然高さが分かれば、それで panel を縮める（過大な panel を出さない）。
      // content が minHeight を下回る場合は minHeight にクランプして content-fit 扱い。
      const cn = input.contentNaturalHeight;
      if (cn != null && Number.isFinite(cn)) {
        const cnClamped = Math.max(limits.minHeight, cn);
        if (cnClamped < available) {
          return clamp(cnClamped, 'content-fit');
        }
      }
      return clamp(available, 'player-rect');
    }
    // available が minHeight 未満（player が viewport の大半を占める / 画面外）
    return { height: limits.minHeight, source: 'min' };
  }

  // playerRowBottom が取れない時のフォールバック
  const fallback = Math.round(vh * limits.fallbackRatio);
  return clamp(fallback, 'fallback');
}
