// avatarPartsComposer.js — 匿名ユーザー用アバターのパーツ(髪/目/口など)定義と組み合わせ合成。
import { anonymousIdenticonDataUrl } from './anonymousIdenticon.js';

export const AVATAR_PART_KEYS = Object.freeze({
  hair: Object.freeze([
    'bob',
    'short-flip',
    'long',
    'ponytail',
    'twintail',
    'mushroom',
    'center-part',
    'wolf'
  ]),
  eyes: Object.freeze([
    'open',
    'smile',
    'jito',
    'sparkle',
    'surprised',
    'sleepy'
  ]),
  mouth: Object.freeze([
    'omega',
    'smile',
    'open',
    'mu',
    'pokan',
    'smirk'
  ]),
  cheek: Object.freeze([null, '0', '1']),
  hairHue: Object.freeze([0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330])
});

/**
 * 128x128 の正規化座標。素材差し替え後もここだけで位置と大きさを調整する。
 * 各パーツは width だけ指定し、高さは素材のアスペクト比から自動算出する
 * (drawPart 参照)。固定 height で歪ませない=これがゆっくり顔の自然さの肝。
 * v0.1.704 実機24面プレビュー(chrome-devtools-mcp)で確定した値。
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

const AVATAR_DATA_URL_CACHE_MAX = 256;
/** @type {Map<string, string>} */
const avatarDataUrlCache = new Map();
/** @type {Map<string, Promise<string>>} */
const avatarComposeInFlight = new Map();
/** @type {Map<string, Promise<HTMLImageElement>>} */
const avatarPartImageCache = new Map();

/**
 * anonymousIdenticon.js と同じ FNV-1a 32bit。
 * @param {string} str
 * @returns {number}
 */
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * @param {unknown} userKey
 * @returns {string}
 */
function normalizeUserKey(userKey) {
  return typeof userKey === 'string' ? userKey.trim() : '';
}

/**
 * @template T
 * @param {string} userKey
 * @param {string} slot
 * @param {readonly T[]} values
 * @returns {T}
 */
function pickHashed(userKey, slot, values) {
  return values[hashString(`${userKey}\u001f${slot}`) % values.length];
}

/**
 * @param {unknown} userKey
 * @returns {{
 *   hairKey: string,
 *   hairHue: number,
 *   eyesKey: string,
 *   mouthKey: string,
 *   cheekKey: string|null
 * }|null}
 */
export function selectAvatarParts(userKey) {
  const key = normalizeUserKey(userKey);
  if (!key) return null;
  return Object.freeze({
    hairKey: pickHashed(key, 'hair', AVATAR_PART_KEYS.hair),
    hairHue: pickHashed(key, 'hair-hue', AVATAR_PART_KEYS.hairHue),
    eyesKey: pickHashed(key, 'eyes', AVATAR_PART_KEYS.eyes),
    mouthKey: pickHashed(key, 'mouth', AVATAR_PART_KEYS.mouth),
    cheekKey: pickHashed(key, 'cheek', AVATAR_PART_KEYS.cheek)
  });
}

/**
 * @param {string} filename
 * @returns {string}
 */
function avatarPartUrl(filename) {
  const runtime = globalThis.chrome?.runtime;
  if (!runtime || typeof runtime.getURL !== 'function') {
    throw new Error('chrome.runtime.getURL is unavailable');
  }
  return runtime.getURL(`images/avatar-parts/${filename}`);
}

/**
 * @param {string} filename
 * @returns {Promise<HTMLImageElement>}
 */
function loadAvatarPartImage(filename) {
  const hit = avatarPartImageCache.get(filename);
  if (hit) return hit;
  const promise = new Promise((resolve, reject) => {
    if (typeof Image !== 'function') {
      reject(new Error('Image is unavailable'));
      return;
    }
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`avatar part load failed: ${filename}`));
    img.src = avatarPartUrl(filename);
  });
  avatarPartImageCache.set(filename, promise);
  promise.catch(() => {
    if (avatarPartImageCache.get(filename) === promise) {
      avatarPartImageCache.delete(filename);
    }
  });
  return promise;
}

/**
 * パーツを width 基準で配置する。高さは素材の自然なアスペクト比から算出し、
 * 縦横を歪ませない(目=横長・口=極薄など素材ごとに比率が違うため固定 height は不可)。
 * 素材の naturalWidth/Height が取れない場合だけ anchor.height(無ければ width)に退避する。
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} image
 * @param {{cx:number,cy:number,width:number,height?:number}} anchor
 * @param {number} size
 */
function drawPart(ctx, image, anchor, size) {
  const width = anchor.width * size;
  const natW = Number(/** @type {any} */ (image)?.naturalWidth) || 0;
  const natH = Number(/** @type {any} */ (image)?.naturalHeight) || 0;
  const aspect = natW > 0 && natH > 0 ? natH / natW : null;
  const height =
    aspect != null
      ? width * aspect
      : (Number.isFinite(anchor.height) ? Number(anchor.height) : anchor.width) * size;
  ctx.drawImage(
    image,
    (anchor.cx * size) - (width / 2),
    (anchor.cy * size) - (height / 2),
    width,
    height
  );
}

/**
 * @param {HTMLImageElement} image
 * @param {number} hairHue
 * @param {number} size
 * @returns {HTMLCanvasElement}
 */
function colorizeHair(image, hairHue, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas is unavailable');

  drawPart(ctx, image, AVATAR_PART_ANCHORS.hair, size);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `hsl(${hairHue} 72% 58%)`;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'destination-in';
  drawPart(ctx, image, AVATAR_PART_ANCHORS.hair, size);
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

/**
 * @param {unknown} userKey
 * @returns {Promise<string>} 失敗時は reject。呼び出し側が SVG 即時表示を維持する。
 */
export function composeAvatarPartsDataUrl(userKey) {
  const key = normalizeUserKey(userKey);
  const selected = selectAvatarParts(key);
  if (!selected) return Promise.resolve('');

  const cached = avatarDataUrlCache.get(key);
  if (cached) {
    avatarDataUrlCache.delete(key);
    avatarDataUrlCache.set(key, cached);
    return Promise.resolve(cached);
  }
  const inFlight = avatarComposeInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      throw new Error('document canvas is unavailable');
    }
    const files = [
      `hair-${selected.hairKey}.png`,
      `eyes-${selected.eyesKey}.png`,
      `mouth-${selected.mouthKey}.png`,
      ...(selected.cheekKey == null ? [] : [`cheek-${selected.cheekKey}.png`])
    ];
    const loaded = await Promise.all(files.map(loadAvatarPartImage));
    const [hair, eyes, mouth, cheek] = loaded;
    const size = AVATAR_PART_ANCHORS.canvasSize;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d canvas is unavailable');

    const face = AVATAR_PART_ANCHORS.face;
    ctx.beginPath();
    ctx.arc(face.cx * size, face.cy * size, face.radius * size, 0, Math.PI * 2);
    ctx.fillStyle = face.fill;
    ctx.fill();
    ctx.lineWidth = face.strokeWidth * size;
    ctx.strokeStyle = face.stroke;
    ctx.stroke();

    if (cheek) drawPart(ctx, cheek, AVATAR_PART_ANCHORS.cheek, size);
    drawPart(ctx, eyes, AVATAR_PART_ANCHORS.eyes, size);
    drawPart(ctx, mouth, AVATAR_PART_ANCHORS.mouth, size);
    ctx.drawImage(colorizeHair(hair, selected.hairHue, size), 0, 0);

    const dataUrl = canvas.toDataURL('image/png');
    avatarDataUrlCache.set(key, dataUrl);
    while (avatarDataUrlCache.size > AVATAR_DATA_URL_CACHE_MAX) {
      const oldestKey = avatarDataUrlCache.keys().next().value;
      if (oldestKey == null) break;
      avatarDataUrlCache.delete(oldestKey);
    }
    return dataUrl;
  })();

  avatarComposeInFlight.set(key, promise);
  void promise.then(
    () => {
      if (avatarComposeInFlight.get(key) === promise) {
        avatarComposeInFlight.delete(key);
      }
    },
    () => {
      if (avatarComposeInFlight.get(key) === promise) {
        avatarComposeInFlight.delete(key);
      }
    }
  );
  return promise;
}

/**
 * SVG を同期で返し、canvas 合成が終わったら PNG data URL を返す二段構え。
 * @param {unknown} userKey
 * @param {number} [sizePx]
 * @returns {{ immediate: string, promise: Promise<string> }}
 */
export function anonymousAvatarDataUrlUpgrade(userKey, sizePx = 64) {
  const key = normalizeUserKey(userKey);
  const immediate = anonymousIdenticonDataUrl(key, sizePx);
  if (!key || !immediate) {
    return { immediate: '', promise: Promise.resolve('') };
  }
  return {
    immediate,
    promise: composeAvatarPartsDataUrl(key).catch(() => immediate)
  };
}

/**
 * @param {HTMLImageElement|null|undefined} img
 * @param {unknown} userKey
 * @param {number} [sizePx]
 * @returns {{ immediate: string, promise: Promise<string> }}
 */
export function upgradeAnonymousAvatarImage(img, userKey, sizePx = 64) {
  const key = normalizeUserKey(userKey);
  const upgrade = anonymousAvatarDataUrlUpgrade(key, sizePx);
  if (!img || !key || !upgrade.immediate) return upgrade;

  img.dataset.nlAnonymousAvatarKey = key;
  if (!img.getAttribute('src')) img.src = upgrade.immediate;
  const expectedSrc = img.getAttribute('src') || upgrade.immediate;
  void upgrade.promise.then((dataUrl) => {
    if (!dataUrl || img.dataset.nlAnonymousAvatarKey !== key) return;
    if ('isConnected' in img && !img.isConnected) return;
    const currentSrc = img.getAttribute('src') || '';
    if (currentSrc !== expectedSrc && currentSrc !== upgrade.immediate) return;
    img.src = dataUrl;
  });
  return upgrade;
}

/**
 * 現在の表示元が従来SVGのときだけ非同期アップグレードを始める。
 * @param {HTMLImageElement|null|undefined} img
 * @param {unknown} userKey
 * @param {unknown} currentSrc
 * @param {number} [sizePx]
 */
export function upgradeAnonymousAvatarImageFromFallback(
  img,
  userKey,
  currentSrc,
  sizePx = 64
) {
  if (!String(currentSrc || '').startsWith('data:image/svg+xml')) return;
  upgradeAnonymousAvatarImage(img, userKey, sizePx);
}

/**
 * data 属性を付けて生成した匿名 img を一括アップグレードする。
 * @param {ParentNode|null|undefined} root
 */
export function upgradeAnonymousAvatarImages(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  root
    .querySelectorAll('img[data-nl-anonymous-avatar-key]')
    .forEach((node) => {
      const img = /** @type {HTMLImageElement} */ (node);
      upgradeAnonymousAvatarImage(
        img,
        img.dataset.nlAnonymousAvatarKey || '',
        Math.max(img.naturalWidth || 0, img.width || 0, 64)
      );
    });
}
