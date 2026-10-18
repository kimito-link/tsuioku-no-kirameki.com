/**
 * 【層】L0 判定層(純粋関数・I/O は deps で注入=Worker でもテストでも同じ手順を走らせる)
 * 【この箱に入るもの】匿名の顔(PNG の data URL)を、素材の取得→描画→PNG 化まで作る手順
 * 【この箱に入らないもの】キャッシュ(メモリ・IndexedDB)・DOM・chrome.*・どの顔をいつ作るかの判断
 * 【書けるstorageキー】なし
 * 【正本宣言】Worker 側の顔の描画手順はこのファイルのみ(メインスレッド側の手順は avatarPartsComposer.js)
 *
 * avatarFaceRender.js — v0.1.1681
 *
 * ■ なぜ Worker で作るか(2026-10-19・実測)
 *   冷スタート(永続キャッシュが空)の顔の合成が、メインスレッドの canvas.toBlob で数秒詰まっていた。
 *   同じ60通りの顔で比べた実験: メイン合成 459ms・長いタスク3件 / Worker 合成(OffscreenCanvas)221ms・長いタスク0件。
 *   しかも出力は 60/60 枚が data URL 文字列まで完全に一致(画素差ゼロ)=見た目は変わらない。
 *
 * ■ 手順(avatarPartsComposer.js の composeAvatarPartsDataUrl と同じ・変えると画素が変わる)
 *   顔の円(塗り+縁)→頬→目→口→髪(別の canvas で multiply で色付け→destination-in でマスク→重ねる)→PNG→data URL
 *
 * @module avatarFaceRender
 */

import { AVATAR_PART_ANCHORS } from './avatarPartAnchors.js';

/**
 * パーツを width 基準で配置する(高さは素材の縦横比から算出=歪ませない)。
 * 素材の寸法は <img> なら naturalWidth/Height・ImageBitmap なら width/height。
 * @param {any} ctx
 * @param {any} image
 * @param {{cx:number,cy:number,width:number,height?:number}} anchor
 * @param {number} size
 */
function drawPart(ctx, image, anchor, size) {
  const width = anchor.width * size;
  const natW = Number(image && (image.naturalWidth ?? image.width)) || 0;
  const natH = Number(image && (image.naturalHeight ?? image.height)) || 0;
  const aspect = natW > 0 && natH > 0 ? natH / natW : null;
  const height =
    aspect != null
      ? width * aspect
      : (Number.isFinite(anchor.height) ? Number(anchor.height) : anchor.width) * size;
  ctx.drawImage(image, (anchor.cx * size) - (width / 2), (anchor.cy * size) - (height / 2), width, height);
}

/**
 * @typedef {{
 *   fetchFn: (url: string) => Promise<{ ok: boolean, blob: () => Promise<any> }>,
 *   createImageBitmapFn: (blob: any) => Promise<any>,
 *   makeCanvas: (w: number, h: number) => any,
 *   blobToDataUrl: (blob: any) => Promise<string>,
 *   partCache?: Map<string, Promise<any>>
 * }} FaceRenderDeps
 */

/**
 * 素材1枚を取る(同じファイルは partCache で使い回す=顔ごとに髪・目を取り直さない)。失敗は reject・キャッシュからも外す。
 * @param {string} url
 * @param {FaceRenderDeps} deps
 * @returns {Promise<any>}
 */
function loadPart(url, deps) {
  const cache = deps.partCache;
  const hit = cache && cache.get(url);
  if (hit) return hit;
  const p = (async () => {
    const res = await deps.fetchFn(url);
    if (!res || !res.ok) throw new Error(`avatar part fetch failed: ${url}`);
    return deps.createImageBitmapFn(await res.blob());
  })();
  if (cache) {
    cache.set(url, p);
    p.catch(() => {
      if (cache.get(url) === p) cache.delete(url);
    });
  }
  return p;
}

/**
 * 顔を1枚作って PNG の data URL を返す。
 * @param {{ baseUrl: string, files: { hair: string, eyes: string, mouth: string, cheek: string|null }, hairHue: number }} msg
 * @param {FaceRenderDeps} deps
 * @returns {Promise<string>}
 */
export async function renderAvatarFace(msg, deps) {
  const base = msg && typeof msg.baseUrl === 'string' ? msg.baseUrl : '';
  const files = msg && msg.files;
  if (!base || !files || !files.hair || !files.eyes || !files.mouth) {
    throw new Error('invalid avatar face message');
  }
  const [hair, eyes, mouth, cheek] = await Promise.all([
    loadPart(base + files.hair, deps),
    loadPart(base + files.eyes, deps),
    loadPart(base + files.mouth, deps),
    files.cheek ? loadPart(base + files.cheek, deps) : Promise.resolve(null)
  ]);
  const size = AVATAR_PART_ANCHORS.canvasSize;
  const canvas = deps.makeCanvas(size, size);
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

  // 髪は別の canvas で色付け(multiply)→元の形でマスク(destination-in)してから重ねる。
  const hairCanvas = deps.makeCanvas(size, size);
  const hairCtx = hairCanvas.getContext('2d');
  if (!hairCtx) throw new Error('2d canvas is unavailable');
  drawPart(hairCtx, hair, AVATAR_PART_ANCHORS.hair, size);
  hairCtx.globalCompositeOperation = 'multiply';
  hairCtx.fillStyle = `hsl(${msg.hairHue} 72% 58%)`;
  hairCtx.fillRect(0, 0, size, size);
  hairCtx.globalCompositeOperation = 'destination-in';
  drawPart(hairCtx, hair, AVATAR_PART_ANCHORS.hair, size);
  hairCtx.globalCompositeOperation = 'source-over';
  ctx.drawImage(hairCanvas, 0, 0);

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return deps.blobToDataUrl(blob);
}
