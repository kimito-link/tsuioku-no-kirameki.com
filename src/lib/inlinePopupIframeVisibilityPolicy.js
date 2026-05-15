/**
 * `ensureInlinePopupIframe` の early-return 経路で iframe を再表示するか（DOM 非依存の判定部）。
 *
 * host が意図的に隠れている（prewarm 等）ときは false。iframe が読み込み完了していれば true。
 */

/**
 * @param {{
 *   hostDisplay: string,
 *   hostVisibility: string,
 *   iframeDocReadyState: string|null|undefined
 * }} p
 * @returns {{ shouldReveal: boolean }}
 */
export function shouldRevealInlineIframeAfterSameSrc(p) {
  const disp = String(p.hostDisplay || '').toLowerCase();
  const vis = String(p.hostVisibility || '').toLowerCase();
  if (disp === 'none' || vis === 'hidden') {
    return { shouldReveal: false };
  }
  const rs = p.iframeDocReadyState;
  if (typeof rs === 'string' && rs.toLowerCase() === 'complete') {
    return { shouldReveal: true };
  }
  return { shouldReveal: false };
}
