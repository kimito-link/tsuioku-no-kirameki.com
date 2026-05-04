/**
 * below 配置でインラインホストを「動画列の内側」から外すための挿入点解決。
 *
 * ニコ生 watch はプレイヤー＋公式コメを CSS Grid や入れ子 flex で並べることが多く、
 * `resolveInlinePanelInsertAnchor` の「親が flex-row なら行の直後」脱出だけでは
 * domAnchor が左列ブロックの子のまま残る。祖先が overflow:hidden のとき、
 * margin / max-width を弄んでもビューポート幅まで広がらない（ユーザ報告）。
 *
 * 対策: 動画要素と公式コメントパネルの両方を `contains` でき、かつ矩形幅が
 * 「視聴行らしい」閾値以上のうち、domAnchor に最も近い祖先を選び、その直後に
 * ホストを置く（= 視聴ブロック全体の下に出す）。
 */

/**
 * @param {{ left?: number, top?: number, width?: number, height?: number }} r
 * @returns {{ left: number, top: number, width: number, height: number, right: number, bottom: number }}
 */
function normalizeRect(r) {
  const left = Number(r?.left) || 0;
  const top = Number(r?.top) || 0;
  const width = Math.max(0, Number(r?.width) || 0);
  const height = Math.max(0, Number(r?.height) || 0);
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height
  };
}

/**
 * 視聴行ラッパーとみなす最小幅（px）。union 幅・動画幅・ビューポートから導出。
 * @param {number} viewportInnerWidth
 * @param {{ left?: number, top?: number, width?: number, height?: number }} videoRect
 * @param {{ left?: number, top?: number, width?: number, height?: number } | null | undefined} commentRect
 * @returns {number}
 */
export function computeBelowWideRowThresholdPx(
  viewportInnerWidth,
  videoRect,
  commentRect
) {
  const vw = Math.max(0, Math.round(Number(viewportInnerWidth) || 0));
  if (vw < 400) return vw;
  const vr = normalizeRect(videoRect);
  const hasComment =
    commentRect != null && (Number(commentRect.width) || 0) > 8;
  let unionW = 0;
  if (hasComment) {
    const cr = normalizeRect(commentRect);
    const unionL = Math.min(vr.left, cr.left);
    const unionR = Math.max(vr.right, cr.right);
    unionW = Math.max(0, unionR - unionL);
  }
  /** コメ列 DOM が取れないときは厳しすぎる閾値にしない（動画幅＋タブの一部） */
  const threshold = hasComment
    ? Math.min(
        vw - 32,
        Math.max(
          unionW > 64 ? Math.round(unionW * 0.94 + 48) : 0,
          Math.round(vr.width + 200),
          520
        )
      )
    : Math.min(vw - 32, Math.max(Math.round(vr.width + 240), Math.round(vw * 0.46), 560));
  return Math.max(320, Math.min(threshold, vw - 24));
}

/**
 * 挿入候補の祖先の高さ上限（ページ全体ラッパーを避ける）
 * @param {number} viewportInnerHeight
 * @returns {number}
 */
export function belowWideRowMaxParentHeightPx(viewportInnerHeight) {
  const vh = Math.max(0, Math.round(Number(viewportInnerHeight) || 0));
  return Math.max(480, Math.min(vh * 0.82, 900));
}

/**
 * @param {{
 *   domAnchor: HTMLElement,
 *   videoEl: HTMLElement,
 *   commentPanel: Element | null,
 *   viewportInnerWidth: number,
 *   viewportInnerHeight: number
 * }} args
 * @returns {HTMLElement | null} この要素の `afterend` にホストを置く
 */
export function findBelowWideRowInsertAfterElement(args) {
  const {
    domAnchor,
    videoEl,
    commentPanel,
    viewportInnerWidth,
    viewportInnerHeight
  } = args;
  if (!(domAnchor instanceof HTMLElement) || !(videoEl instanceof HTMLElement)) {
    return null;
  }
  const vw = Math.round(Number(viewportInnerWidth) || 0);
  const vh = Math.round(Number(viewportInnerHeight) || 0);
  if (vw < 520) return null;

  let vr;
  try {
    vr = videoEl.getBoundingClientRect();
  } catch {
    return null;
  }
  const videoPlain = {
    left: vr.left,
    top: vr.top,
    width: vr.width,
    height: vr.height
  };
  let crPlain = null;
  if (commentPanel instanceof HTMLElement) {
    try {
      const cr = commentPanel.getBoundingClientRect();
      crPlain = {
        left: cr.left,
        top: cr.top,
        width: cr.width,
        height: cr.height
      };
    } catch {
      crPlain = null;
    }
  }
  const threshold = computeBelowWideRowThresholdPx(
    vw,
    videoPlain,
    crPlain
  );
  const maxParentH = belowWideRowMaxParentHeightPx(vh);

  let p = domAnchor.parentElement;
  for (let depth = 0; depth < 20 && p; depth++) {
    if (p === document.body || p === document.documentElement) break;
    if (!(p instanceof HTMLElement)) break;
    let pr;
    try {
      pr = p.getBoundingClientRect();
    } catch {
      p = p.parentElement;
      continue;
    }
    if (pr.height > maxParentH) {
      p = p.parentElement;
      continue;
    }
    if (pr.width + 6 < threshold) {
      p = p.parentElement;
      continue;
    }
    try {
      if (!p.contains(videoEl)) {
        p = p.parentElement;
        continue;
      }
    } catch {
      p = p.parentElement;
      continue;
    }
    if (commentPanel instanceof HTMLElement) {
      try {
        if (!p.contains(commentPanel)) {
          p = p.parentElement;
          continue;
        }
      } catch {
        p = p.parentElement;
        continue;
      }
    }
    return p;
  }
  return null;
}
