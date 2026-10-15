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

/**
 * Blob を data: URL の【文字列】にする(FileReader)。失敗したら reject。
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = typeof reader.result === 'string' ? reader.result : '';
      if (r.startsWith('data:')) resolve(r);
      else reject(new Error('FileReader returned a non data: value'));
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * canvas を <img src> に使える URL にする。
 *
 * ■ 経緯
 *   2026-10-11: toDataURL('image/png') は PNG 書き出しをメインスレッドで同期に行う。匿名330人ぶんの合成で
 *     toDataURL だけが 3〜4秒(起動の主スレッド総時間 約10秒のうち)・最長 4.1秒連続で止まっていた。
 *     toBlob は書き出しを別スレッドで行うので負担が大きく減る(前後比較で 9.8〜11.3秒 → 6.5〜6.7秒)。
 *   2026-10-12: ★その結果を blob: URL にしていたのが【解放されずに積み上がる漏れ】だった(私の退化)。
 *     実測: 作成295・解放0(10秒)→ 378・解放0・8.6MB(91秒)。1枚 約23KB。しかも「別人の数」ではなく
 *     【合成のたび】に増える(キャッシュは256件=追い出された人は次の描画でまた合成され、新しい blob が積まれる)。
 *     お使いのPCの記録では、起動直後のプロセスのメモリが1分で約1.8GB・5分ごとに約+2GB で 6.3GB に達していた。
 *   → 書き出しは toBlob(別スレッド)のまま、結果は FileReader で data: URL の【文字列】にする。
 *     文字列は使い終われば GC され、解放の管理が要らない(標準の作法)。blob URL を一切作らない。
 *     追い出されたキャッシュの文字列も、画面の <img> が持っていれば残り、無ければ GC される。
 *   toBlob / FileReader が無い、toBlob が null を返す、読み込みが失敗する環境では従来の toDataURL に戻る
 *   (機能を失わない)。
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<string>}
 */
export async function canvasToImageUrl(canvas) {
  if (typeof canvas.toBlob === 'function' && typeof FileReader !== 'undefined') {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob) {
      try {
        return await blobToDataUrl(blob);
      } catch {
        /* 読み込みの失敗でも画像を失わない=toDataURL に戻る */
      }
    }
  }
  return canvas.toDataURL('image/png');
}
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

    const dataUrl = await canvasToImageUrl(canvas);
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
  const immediate = key ? anonymousIdenticonDataUrl(key, sizePx) : '';
  if (!img || !key || !immediate) return anonymousAvatarDataUrlUpgrade(key, sizePx);
  // ★合成は画面の近くに来てから・同時3つまで(上の説明)。最終的な画像は従来と同じ。
  const upgrade = { immediate, promise: composeWhenNear(img, key, immediate) };

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
 * ★2026-10-15 黒い幕の実測(boot-profile 13回)で、起動が重い回の犯人がこの顔の合成(toBlob 約1.5〜1.8秒)と判明。
 *   原因: 匿名タイルを描くたびに【全員ぶん】を canvas で合成していた。しかもキャッシュは 256 件なのに匿名は 500 人超
 *   =追い出された人を描き直しのたびにまた合成していた。
 *   対策(見た目は1画素も変えない=最終的な画像は同じ・作る【時期と数】だけを変える):
 *     ① 画面の近く(上下 400px)に来るまで合成しない(それまでは即時表示の SVG 顔のまま)
 *     ② 同時に走らせる合成は 3 つまで
 *   IntersectionObserver が無い環境では従来どおり即時に合成する(機能を失わない)。
 */
export const AVATAR_COMPOSE_MAX_CONCURRENT = 3;
export const AVATAR_COMPOSE_NEAR_MARGIN_PX = 400;
const AVATAR_GATE_SWEEP_MS = 3000;

/**
 * 同時実行数を制限する。task は Promise を返す関数。
 * @param {number} max
 */
export function createComposeLimiter(max = AVATAR_COMPOSE_MAX_CONCURRENT) {
  const limit = Math.max(1, Math.floor(max) || 1);
  let active = 0;
  /** @type {Array<{ task: () => Promise<any>, resolve: (v: any) => void, reject: (e: any) => void }>} */
  const queue = [];
  const stats = { maxQueued: 0 };
  const pump = () => {
    while (active < limit && queue.length > 0) {
      const job = /** @type {NonNullable<ReturnType<typeof queue.shift>>} */ (queue.shift());
      active += 1;
      let p;
      try { p = Promise.resolve(job.task()); } catch (e) { p = Promise.reject(e); }
      p.then(job.resolve, job.reject).finally(() => { active -= 1; pump(); });
    }
  };
  return {
    run(/** @type {() => Promise<any>} */ task) {
      return new Promise((resolve, reject) => {
        queue.push({ task, resolve, reject });
        if (queue.length > stats.maxQueued) stats.maxQueued = queue.length;
        pump();
      });
    },
    snapshot: () => ({ active, queued: queue.length, maxQueued: stats.maxQueued })
  };
}

/**
 * 「画面の近くに来た」を待つゲート。IntersectionObserver を1つだけ共有する。
 *   - 近くに来たら resolve(true)。取り外された(isConnected=false)要素は定期掃除で resolve(false) にして解放する
 *     (描き直しのたびに古いタイルが取り外される=観測が積み上がらないように)。
 *   - IntersectionObserver が無ければ即 resolve(true)(従来どおり=機能を失わない)。
 * @param {{ IntersectionObserver?: any, setInterval?: any, clearInterval?: any, marginPx?: number }} [deps]
 */
export function createViewportGate(deps = {}) {
  const IO = deps.IntersectionObserver !== undefined ? deps.IntersectionObserver : globalThis.IntersectionObserver;
  const setIv = deps.setInterval || globalThis.setInterval;
  const clearIv = deps.clearInterval || globalThis.clearInterval;
  const marginPx = deps.marginPx ?? AVATAR_COMPOSE_NEAR_MARGIN_PX;
  /** @type {Map<any, (near: boolean) => void>} */
  const pending = new Map();
  /** @type {any} */ let io = null;
  /** @type {any} */ let timer = null;
  const stopSweepIfIdle = () => { if (pending.size === 0 && timer != null) { clearIv(timer); timer = null; } };
  const sweep = () => {
    for (const [el, resolve] of [...pending]) {
      if (el && el.isConnected === false) { pending.delete(el); try { io?.unobserve(el); } catch { /* no-op */ } resolve(false); }
    }
    stopSweepIfIdle();
  };
  return {
    whenNear(/** @type {any} */ el) {
      if (!el || typeof IO !== 'function') return Promise.resolve(true);
      return new Promise((resolve) => {
        if (!io) {
          io = new IO((/** @type {any[]} */ entries) => {
            for (const e of entries) {
              if (!e.isIntersecting) continue;
              const r = pending.get(e.target);
              if (!r) continue;
              pending.delete(e.target);
              try { io.unobserve(e.target); } catch { /* no-op */ }
              r(true);
            }
            stopSweepIfIdle();
          }, { rootMargin: `${marginPx}px 0px` });
        }
        pending.set(el, resolve);
        io.observe(el);
        if (timer == null) timer = setIv(sweep, AVATAR_GATE_SWEEP_MS);
      });
    },
    pendingCount: () => pending.size,
    sweepNow: sweep
  };
}

const avatarComposeLimiter = createComposeLimiter();
const avatarViewportGate = createViewportGate();
const avatarComposeStats = { requested: 0, cacheHit: 0, composedAfterNear: 0, skippedDetached: 0, failed: 0 };

/** 状態速報用: 顔の合成の要求・実行・見送りの内訳。 */
export function getAvatarComposeStats() {
  const lim = avatarComposeLimiter.snapshot();
  return { ...avatarComposeStats, waitingNear: avatarViewportGate.pendingCount(), active: lim.active, queued: lim.queued, maxQueued: lim.maxQueued, cacheSize: avatarDataUrlCache.size };
}

/**
 * img が画面の近くに来てから(キャッシュ済みなら即)合成する。取り外されたら合成しない。失敗時は即時の SVG のまま。
 * @param {any} img
 * @param {string} key
 * @param {string} immediate
 * @returns {Promise<string>}
 */
function composeWhenNear(img, key, immediate) {
  avatarComposeStats.requested += 1;
  if (avatarDataUrlCache.has(key)) {
    avatarComposeStats.cacheHit += 1;
    return composeAvatarPartsDataUrl(key).catch(() => immediate);
  }
  return avatarViewportGate.whenNear(img).then((near) => {
    if (!near) { avatarComposeStats.skippedDetached += 1; return immediate; }
    avatarComposeStats.composedAfterNear += 1;
    return avatarComposeLimiter.run(() => composeAvatarPartsDataUrl(key)).catch(() => { avatarComposeStats.failed += 1; return immediate; });
  });
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
