import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  AVATAR_COMPOSE_MAX_CONCURRENT,
  createComposeLimiter,
  createViewportGate,
  getAvatarComposeStats
} from './avatarPartsComposer.js';

/** 2026-10-15: 顔画像の合成を「画面の近くに来てから・同時3つまで」にする部品。見た目(最終画像)は変えない。 */

const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createComposeLimiter(同時実行数の制限)', () => {
  it('★同時に走るのは上限まで・空きが出たら次が始まる', async () => {
    const lim = createComposeLimiter(2);
    const gates = [deferred(), deferred(), deferred(), deferred()];
    let running = 0; let maxRunning = 0;
    const results = gates.map((g) => lim.run(async () => {
      running += 1; maxRunning = Math.max(maxRunning, running);
      const v = await g.promise; running -= 1; return v;
    }));
    await tick();
    expect(running).toBe(2);
    expect(lim.snapshot()).toMatchObject({ active: 2, queued: 2 });
    gates[0].resolve('a'); await tick();
    expect(running).toBe(2); // 1つ終わって次が始まった
    gates[1].resolve('b'); gates[2].resolve('c'); gates[3].resolve('d');
    expect(await Promise.all(results)).toEqual(['a', 'b', 'c', 'd']);
    expect(maxRunning).toBe(2);
    expect(lim.snapshot().maxQueued).toBeGreaterThanOrEqual(2);
  });
  it('★失敗しても詰まらない(次の仕事が走る)', async () => {
    const lim = createComposeLimiter(1);
    const bad = lim.run(async () => { throw new Error('boom'); });
    const good = lim.run(async () => 'ok');
    await expect(bad).rejects.toThrow('boom');
    await expect(good).resolves.toBe('ok');
  });
  it('既定の上限は3', () => {
    expect(AVATAR_COMPOSE_MAX_CONCURRENT).toBe(3);
  });
});

describe('createViewportGate(画面の近くに来るまで待つ)', () => {
  const makeFakeIO = () => {
    const instances = [];
    class FakeIO {
      constructor(cb, opts) { this.cb = cb; this.opts = opts; this.observed = new Set(); instances.push(this); }
      observe(el) { this.observed.add(el); }
      unobserve(el) { this.observed.delete(el); }
    }
    return { FakeIO, instances };
  };

  it('★近くに来るまで待ち、来たら true で解決して観測を外す', async () => {
    const { FakeIO, instances } = makeFakeIO();
    const gate = createViewportGate({ IntersectionObserver: FakeIO, setInterval: () => 1, clearInterval: () => {} });
    const el = { isConnected: true };
    let done = null;
    void gate.whenNear(el).then((v) => { done = v; });
    await tick();
    expect(done).toBeNull();
    expect(gate.pendingCount()).toBe(1);
    expect(instances[0].opts.rootMargin).toBe('400px 0px');
    instances[0].cb([{ target: el, isIntersecting: false }]); await tick();
    expect(done).toBeNull(); // まだ遠い
    instances[0].cb([{ target: el, isIntersecting: true }]); await tick();
    expect(done).toBe(true);
    expect(gate.pendingCount()).toBe(0);
    expect(instances[0].observed.size).toBe(0);
  });
  it('★IntersectionObserver が無い環境では即 true(従来どおり=機能を失わない)', async () => {
    const gate = createViewportGate({ IntersectionObserver: undefined });
    await expect(gate.whenNear({ isConnected: true })).resolves.toBe(true);
  });
  it('★取り外された要素は掃除で false になり、観測が積み上がらない', async () => {
    const { FakeIO, instances } = makeFakeIO();
    let sweepCb = null; let cleared = false;
    const gate = createViewportGate({ IntersectionObserver: FakeIO, setInterval: (cb) => { sweepCb = cb; return 7; }, clearInterval: () => { cleared = true; } });
    const el = { isConnected: true };
    let done = null;
    void gate.whenNear(el).then((v) => { done = v; });
    await tick();
    el.isConnected = false;
    sweepCb(); await tick();
    expect(done).toBe(false);
    expect(gate.pendingCount()).toBe(0);
    expect(instances[0].observed.size).toBe(0);
    expect(cleared).toBe(true); // 待ちが空なら掃除の時計も止める
  });
  it('つながったままの要素は掃除で残る', async () => {
    const { FakeIO } = makeFakeIO();
    let sweepCb = null;
    const gate = createViewportGate({ IntersectionObserver: FakeIO, setInterval: (cb) => { sweepCb = cb; return 1; }, clearInterval: () => {} });
    void gate.whenNear({ isConnected: true });
    await tick(); sweepCb();
    expect(gate.pendingCount()).toBe(1);
  });
});

describe('配線: upgradeAnonymousAvatarImage は合成を画面の近くに来てから・同時3つまでで行う', () => {
  const src = fs.readFileSync(path.resolve('src/lib/avatarPartsComposer.js'), 'utf8').split('\r\n').join('\n');
  const at = src.indexOf('export function upgradeAnonymousAvatarImage(');
  const body = src.slice(at, at + 900);
  it('★合成の開始は composeWhenNear 経由(直接 composeAvatarPartsDataUrl を呼ばない)', () => {
    expect(at).toBeGreaterThan(0);
    expect(body).toContain('promise: composeWhenNear(img, key, immediate)');
    expect(body).not.toContain('composeAvatarPartsDataUrl(');
  });
  it('★composeWhenNear: キャッシュ済みは即・未合成は近くに来てから・上限つきの待ち行列へ', () => {
    const f = src.slice(src.indexOf('function composeWhenNear('), src.indexOf('function composeWhenNear(') + 1100);
    expect(f).toContain('avatarDataUrlCache.has(key)');
    expect(f).toContain('avatarViewportGate.whenNear(img)');
    expect(f).toContain('avatarComposeLimiter.run(() => composeAvatarPartsDataUrl(key))');
    expect(f).toContain('if (!near)');
  });
});

describe('getAvatarComposeStats', () => {
  it('内訳の形(状態速報が読む)', () => {
    const s = getAvatarComposeStats();
    for (const k of ['requested', 'cacheHit', 'composedAfterNear', 'skippedDetached', 'failed', 'waitingNear', 'active', 'queued', 'maxQueued', 'cacheSize']) {
      expect(typeof s[k]).toBe('number');
    }
  });
});

describe('配線: 状態速報へ顔の合成の内訳を出す', () => {
  const popup = fs.readFileSync(path.resolve('src/extension/popup-entry.js'), 'utf8').split('\r\n').join('\n');
  const printer = fs.readFileSync(path.resolve('src/lib/aiShareFullText.js'), 'utf8').split('\r\n').join('\n');
  it('★popup の診断に avatarCompose を載せ、速報が1行で出す', () => {
    expect(popup).toContain('avatarCompose: getAvatarComposeStats(),');
    expect(printer).toContain('顔画像の合成: 要求${ac.requested}');
    expect(printer).toContain('取り外されて見送り${ac.skippedDetached}');
  });
});
