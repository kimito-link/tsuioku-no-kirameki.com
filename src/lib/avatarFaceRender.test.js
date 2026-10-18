import { describe, expect, it } from 'vitest';
import { renderAvatarFace } from './avatarFaceRender.js';
import { AVATAR_PART_ANCHORS } from './avatarPartAnchors.js';

/** 描画命令を記録する偽の canvas(Worker の OffscreenCanvas の代わり) */
const makeFakes = () => {
  /** @type {any[]} */
  const log = [];
  const canvases = [];
  class FakeCanvas {
    constructor(w, h) {
      this.width = w;
      this.height = h;
      this.id = canvases.length;
      canvases.push(this);
      this.ctx = {
        _op: 'source-over',
        set globalCompositeOperation(v) { log.push([this.cv, 'op', v]); this._op = v; },
        get globalCompositeOperation() { return this._op; },
        set fillStyle(v) { log.push([this.cv, 'fillStyle', v]); },
        set strokeStyle(v) { log.push([this.cv, 'strokeStyle', v]); },
        set lineWidth(v) { log.push([this.cv, 'lineWidth', Math.round(v * 1000) / 1000]); },
        beginPath: () => log.push([this.id, 'beginPath']),
        arc: (...a) => log.push([this.id, 'arc', ...a.map((x) => Math.round(x * 1000) / 1000)]),
        fill: () => log.push([this.id, 'fill']),
        stroke: () => log.push([this.id, 'stroke']),
        fillRect: (...a) => log.push([this.id, 'fillRect', ...a]),
        drawImage: (img, ...a) => log.push([this.id, 'drawImage', img.name || (img.id != null ? `canvas${img.id}` : '?'), ...a.map((x) => Math.round(x * 1000) / 1000)])
      };
      this.ctx.cv = this.id;
    }
    getContext() { return this.ctx; }
    async convertToBlob(opts) { log.push([this.id, 'convertToBlob', opts.type]); return { size: 4, type: opts.type, bytes: 'PNG' }; }
  }
  const deps = {
    fetchFn: async (url) => ({ ok: true, blob: async () => ({ url }) }),
    createImageBitmapFn: async (blob) => {
      const name = blob.url.split('/').pop();
      // 目=横長・口=極薄など素材ごとに縦横比が違う
      const dims = { 'hair-bob.png': [200, 200], 'eyes-open.png': [100, 40], 'mouth-omega.png': [100, 20], 'cheek-0.png': [100, 50] }[name] || [64, 64];
      return { name, width: dims[0], height: dims[1], close() {} };
    },
    makeCanvas: (w, h) => new FakeCanvas(w, h),
    blobToDataUrl: async (blob) => `data:image/png;base64,${blob.bytes}`
  };
  return { deps, log, canvases };
};

const MSG = {
  baseUrl: 'chrome-extension://x/images/avatar-parts/',
  files: { hair: 'hair-bob.png', eyes: 'eyes-open.png', mouth: 'mouth-omega.png', cheek: 'cheek-0.png' },
  hairHue: 210
};

describe('renderAvatarFace(Worker で顔を合成する・メインスレッドの合成と同じ手順)', () => {
  it('★PNG の data URL を返す', async () => {
    const { deps } = makeFakes();
    expect(await renderAvatarFace(MSG, deps)).toBe('data:image/png;base64,PNG');
  });

  it('★素材はベース URL + ファイル名で取る(拡張の画像ディレクトリ)', async () => {
    const { deps } = makeFakes();
    const urls = [];
    const orig = deps.fetchFn;
    deps.fetchFn = async (u) => { urls.push(u); return orig(u); };
    await renderAvatarFace(MSG, deps);
    expect(urls.sort()).toEqual([
      'chrome-extension://x/images/avatar-parts/cheek-0.png',
      'chrome-extension://x/images/avatar-parts/eyes-open.png',
      'chrome-extension://x/images/avatar-parts/hair-bob.png',
      'chrome-extension://x/images/avatar-parts/mouth-omega.png'
    ]);
  });

  it('★顔の円→頬→目→口→髪(色付き)の順に、メイン側と同じ座標で描く', async () => {
    const { deps, log } = makeFakes();
    await renderAvatarFace(MSG, deps);
    const S = AVATAR_PART_ANCHORS.canvasSize;
    const face = AVATAR_PART_ANCHORS.face;
    const main = log.filter((l) => l[0] === 0);
    expect(main[0]).toEqual([0, 'beginPath']);
    expect(main[1]).toEqual([0, 'arc', face.cx * S, face.cy * S, Math.round(face.radius * S * 1000) / 1000, 0, Math.round(Math.PI * 2 * 1000) / 1000]);
    const draws = main.filter((l) => l[1] === 'drawImage').map((l) => l[2]);
    expect(draws).toEqual(['cheek-0.png', 'eyes-open.png', 'mouth-omega.png', 'canvas1']);
    // 目は横長: 幅 = anchors.eyes.width*S・高さ = 幅*(40/100)(縦横比を歪ませない)
    const eyes = main.find((l) => l[1] === 'drawImage' && l[2] === 'eyes-open.png');
    const w = AVATAR_PART_ANCHORS.eyes.width * S;
    expect(eyes.slice(3)).toEqual([
      Math.round((AVATAR_PART_ANCHORS.eyes.cx * S - w / 2) * 1000) / 1000,
      Math.round((AVATAR_PART_ANCHORS.eyes.cy * S - (w * 0.4) / 2) * 1000) / 1000,
      Math.round(w * 1000) / 1000,
      Math.round(w * 0.4 * 1000) / 1000
    ]);
  });

  it('★髪の色付けは multiply→destination-in の2段(hsl(色相 72% 58%))で、別 canvas に作って重ねる', async () => {
    const { deps, log } = makeFakes();
    await renderAvatarFace(MSG, deps);
    const hair = log.filter((l) => l[0] === 1);
    const ops = hair.filter((l) => l[1] === 'op' || l[1] === 'fillStyle' || l[1] === 'fillRect' || l[1] === 'drawImage').map((l) => l[1] === 'drawImage' ? 'draw' : l.slice(1).join(':'));
    expect(ops).toEqual(['draw', 'op:multiply', 'fillStyle:hsl(210 72% 58%)', 'fillRect:0:0:128:128', 'op:destination-in', 'draw', 'op:source-over']);
  });

  it('頬が無い顔(cheek=null)は頬を取りに行かない・描かない', async () => {
    const { deps, log } = makeFakes();
    const urls = [];
    const orig = deps.fetchFn;
    deps.fetchFn = async (u) => { urls.push(u); return orig(u); };
    await renderAvatarFace({ ...MSG, files: { ...MSG.files, cheek: null } }, deps);
    expect(urls.some((u) => u.includes('cheek'))).toBe(false);
    expect(log.filter((l) => l[0] === 0 && l[1] === 'drawImage').map((l) => l[2])).toEqual(['eyes-open.png', 'mouth-omega.png', 'canvas1']);
  });

  it('★素材が取れない(fetch が !ok)なら reject(呼び側はメインスレッドで作る)', async () => {
    const { deps } = makeFakes();
    deps.fetchFn = async () => ({ ok: false, blob: async () => ({}) });
    await expect(renderAvatarFace(MSG, deps)).rejects.toThrow();
  });

  it('★素材のビットマップは同じファイルなら使い回す(顔ごとに髪・目を取り直さない)', async () => {
    const { deps } = makeFakes();
    let fetches = 0;
    const orig = deps.fetchFn;
    deps.fetchFn = async (u) => { fetches += 1; return orig(u); };
    const cache = new Map();
    await renderAvatarFace(MSG, { ...deps, partCache: cache });
    const first = fetches;
    await renderAvatarFace(MSG, { ...deps, partCache: cache });
    expect(first).toBe(4);
    expect(fetches).toBe(4);
  });

  it('壊れたメッセージでも落ちずに reject する', async () => {
    const { deps } = makeFakes();
    await expect(renderAvatarFace(/** @type {any} */ (null), deps)).rejects.toThrow();
    await expect(renderAvatarFace(/** @type {any} */ ({ baseUrl: 'x', files: {} }), deps)).rejects.toThrow();
  });
});
