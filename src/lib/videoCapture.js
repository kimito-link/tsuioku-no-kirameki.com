/**
 * watch ページの video から PNG を取るためのユーティリティ。
 * 配信映像の保存は利用規約・権利の確認を利用者の責任で行うこと。
 */

const DEFAULT_MAX_EDGE = 1280;
export const SCREENSHOT_DOWNLOAD_SUBDIR = 'スクリーンショット';

/**
 * アスペクト比を保ちつつ maxW/maxH に収まる整数サイズ
 * @param {number} srcW
 * @param {number} srcH
 * @param {number} maxW
 * @param {number} maxH
 * @returns {{ width: number, height: number }}
 */
export function fitThumbnailDimensions(srcW, srcH, maxW, maxH) {
  const w = Math.max(1, Math.floor(Number(srcW) || 1));
  const h = Math.max(1, Math.floor(Number(srcH) || 1));
  let mw = Math.max(1, Math.floor(Number(maxW) || 1));
  let mh = Math.max(1, Math.floor(Number(maxH) || 1));
  if (maxW <= 0 || maxH <= 0) {
    mw = 1;
    mh = 1;
  }
  const scale = Math.min(mw / w, mh / h, 1);
  const width = Math.max(1, Math.round(w * scale));
  const height = Math.max(1, Math.round(h * scale));
  return { width, height };
}

/**
 * Chrome 拡張は任意の絶対パスへは保存できないため、
 * スクショはダウンロード先配下の `スクリーンショット/` に寄せる。
 *
 * @param {string} liveId
 * @param {string} ext
 * @param {number} nowMs
 */
export function buildScreenshotFilename(liveId, ext, nowMs) {
  const safeLv = String(liveId || 'unknown')
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\.\./g, '')
    .slice(0, 32) || 'unknown';
  const e = String(ext || 'png').replace(/^\./, '').toLowerCase() || 'png';
  const ts = Math.floor(Number(nowMs) || Date.now());
  return `${SCREENSHOT_DOWNLOAD_SUBDIR}/nicolivelog-${safeLv}-${ts}.${e}`;
}

/**
 * @param {unknown} err
 * @returns {'tainted_canvas'|'no_video'|'not_ready'|'capture_failed'|'unknown'}
 */
export function interpretCaptureError(err) {
  if (err == null) return 'unknown';
  const name =
    err && typeof err === 'object' && 'name' in err
      ? String(/** @type {{ name?: string }} */ (err).name || '')
      : '';
  if (name === 'SecurityError') return 'tainted_canvas';
  const msg =
    err && typeof err === 'object' && 'message' in err
      ? String(/** @type {{ message?: string }} */ (err).message || '')
      : String(err);
  if (/no video|video not found/i.test(msg)) return 'no_video';
  if (/not ready|HAVE_NOTHING|empty/i.test(msg)) return 'not_ready';
  return 'capture_failed';
}

/**
 * 表示中で面積が最大の video を選ぶ（ニコ生のプレイヤー想定）
 * @param {Document} doc
 * @returns {HTMLVideoElement|null}
 */
export function pickLargestVisibleVideo(doc) {
  const list = Array.from(doc.querySelectorAll('video'));
  /** @type {{ el: HTMLVideoElement, area: number }|null} */
  let best = null;
  for (const v of list) {
    if (!(v instanceof HTMLVideoElement)) continue;
    const rect = v.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    const st = doc.defaultView?.getComputedStyle(v);
    if (st && (st.visibility === 'hidden' || st.display === 'none')) continue;
    const area = rect.width * rect.height;
    if (!best || area > best.area) best = { el: v, area };
  }
  return best?.el || null;
}

/**
 * @param {HTMLVideoElement} video
 * @param {{ maxEdge?: number }} [opts]
 * @returns {Promise<{ ok: true, mime: string, dataUrl: string } | { ok: false, errorCode: ReturnType<typeof interpretCaptureError> }>}
 */
export async function captureVideoToPngDataUrl(video, opts) {
  const maxEdge = opts?.maxEdge ?? DEFAULT_MAX_EDGE;
  if (!(video instanceof HTMLVideoElement)) {
    return { ok: false, errorCode: 'no_video' };
  }
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) {
    return { ok: false, errorCode: 'not_ready' };
  }
  const { width, height } = fitThumbnailDimensions(vw, vh, maxEdge, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { ok: false, errorCode: 'capture_failed' };
  }
  try {
    ctx.drawImage(video, 0, 0, width, height);
    // クロスオリジンで tainted になる場合は SecurityError → 将来は tabs.captureVisibleTab 等のフォールバックを検討
    const dataUrl = canvas.toDataURL('image/png');
    if (!dataUrl || !dataUrl.startsWith('data:image/png')) {
      return { ok: false, errorCode: 'capture_failed' };
    }
    return { ok: true, mime: 'image/png', dataUrl };
  } catch (err) {
    return { ok: false, errorCode: interpretCaptureError(err) };
  }
}
