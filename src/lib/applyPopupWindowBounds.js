/**
 * 別ウィンドウ popup の外形（幅・高さ）を chrome.windows に渡すための小さな手続き。
 *
 * 一部の環境（仮想ディスプレイなど）では、1回の update で height だけが効き、
 * width が既定の窓幅のまま残ることがある。読み直して幅が違えばもう一度指定する。
 */

/**
 * @param {{ width?: number, height?: number }|null|undefined} win
 * @param {{ width: number, height: number }} bounds
 * @returns {boolean}
 */
export function isPopupWindowAtBounds(win, bounds) {
  const width = bounds?.width;
  const height = bounds?.height;
  return (
    !!win &&
    typeof win.width === 'number' &&
    win.width === width &&
    typeof win.height === 'number' &&
    win.height === height
  );
}

/**
 * @param {{
 *   update: (id: number, info: { width: number, height: number }) => Promise<unknown>,
 *   get: (id: number) => Promise<{ width?: number, height?: number }|undefined>
 * }} windowsApi
 * @param {number} windowId
 * @param {{ width: number, height: number }} bounds
 * @returns {Promise<void>}
 */
export async function applyPopupWindowBounds(windowsApi, windowId, bounds) {
  const width = bounds.width;
  const height = bounds.height;
  await windowsApi.update(windowId, { height, width });
  try {
    const after = await windowsApi.get(windowId);
    if (after && typeof after.width === 'number' && after.width !== width) {
      await windowsApi.update(windowId, { height, width });
    }
  } catch {
    // 読み直し失敗は無視（本文の update は済んでいる）
  }
}
