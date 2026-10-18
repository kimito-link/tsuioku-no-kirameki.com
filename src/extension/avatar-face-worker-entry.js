// avatar-face-worker-entry.js — 匿名の顔を合成する専用 Worker(v0.1.1681)。
//
// ★役割は1つ: 「素材の取得→描画→PNG の data URL」をメインスレッドの外でやる(手順は src/lib/avatarFaceRender.js)。
//   IndexedDB にも chrome.* にも触れない(キャッシュ・永続化・差し替えはメインスレッド側が正本)。
//   入力 {id, baseUrl, files, hairHue} → 出力 {id, ok:true, dataUrl} / {id, ok:false, error}。
//   OffscreenCanvas / createImageBitmap が無い環境は error='no-offscreencanvas'(呼び手は即 dead にして従来合成へ)。
import { renderAvatarFace } from '../lib/avatarFaceRender.js';

/** @type {Map<string, Promise<any>>} 素材のビットマップ(Worker が生きている間は持つ=顔ごとに取り直さない) */
const partCache = new Map();

/** @param {Blob} blob @returns {Promise<string>} */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('FileReader returned a non data: value')));
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

const hasOffscreen = typeof OffscreenCanvas === 'function' && typeof createImageBitmap === 'function';

self.onmessage = async (/** @type {MessageEvent<any>} */ ev) => {
  const msg = ev.data;
  const id = msg && msg.id;
  if (!hasOffscreen) {
    self.postMessage({ id, ok: false, error: 'no-offscreencanvas' });
    return;
  }
  try {
    const dataUrl = await renderAvatarFace(msg, {
      fetchFn: (url) => fetch(url),
      createImageBitmapFn: (blob) => createImageBitmap(blob),
      makeCanvas: (w, h) => new OffscreenCanvas(w, h),
      blobToDataUrl,
      partCache
    });
    self.postMessage({ id, ok: true, dataUrl });
  } catch (e) {
    self.postMessage({ id, ok: false, error: String((e && /** @type {any} */ (e).message) || e) });
  }
};
