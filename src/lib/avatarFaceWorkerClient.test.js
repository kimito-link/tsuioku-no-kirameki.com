import { describe, expect, it } from 'vitest';
import { createAvatarFaceWorkerClient } from './avatarFaceWorkerClient.js';

const PARTS = { baseUrl: 'x/', files: { hair: 'h.png', eyes: 'e.png', mouth: 'm.png', cheek: null }, hairHue: 90 };
const PNG = 'data:image/png;base64,AAAA';

/** 偽の時計: 登録された timeout を手で進める */
const fakeTimers = () => {
  let t = 0;
  let seq = 0;
  /** @type {Map<number, { at: number, fn: () => void }>} */
  const q = new Map();
  return {
    set: (fn, ms) => { const h = ++seq; q.set(h, { at: t + ms, fn }); return h; },
    clear: (h) => { q.delete(h); },
    advance: (ms) => { t += ms; for (const [h, e] of [...q]) if (e.at <= t) { q.delete(h); e.fn(); } },
    count: () => q.size
  };
};

/** 偽の Worker: 受けた要求を覚えて、テストが応答を返す */
const fakeWorker = () => {
  const w = { sent: [], terminated: false, onmessage: null, onerror: null, onmessageerror: null,
    postMessage(m) { w.sent.push(m); },
    terminate() { w.terminated = true; },
    reply(data) { w.onmessage({ data }); } };
  return w;
};

const mk = (extra = {}) => {
  const timers = fakeTimers();
  const workers = [];
  const client = createAvatarFaceWorkerClient({
    makeWorker: () => { const w = fakeWorker(); workers.push(w); return w; },
    setTimeoutRef: timers.set, clearTimeoutRef: timers.clear, ...extra
  });
  return { client, timers, workers };
};

describe('avatarFaceWorkerClient', () => {
  it('★要求を送り、同じ id の応答で PNG の data URL を返す(遅延起動=最初の要求で Worker を作る)', async () => {
    const { client, workers } = mk();
    expect(client.snapshot().state).toBe('off');
    const p = client.render(PARTS);
    expect(workers).toHaveLength(1);
    expect(workers[0].sent[0]).toMatchObject({ baseUrl: 'x/', hairHue: 90 });
    workers[0].reply({ id: workers[0].sent[0].id, ok: true, dataUrl: PNG });
    expect(await p).toBe(PNG);
    expect(client.snapshot()).toMatchObject({ state: 'ready', rendered: 1, inFlight: 0 });
  });

  it('★複数の要求が重なっても、id で正しく対応づく(順不同で返っても取り違えない)', async () => {
    const { client, workers } = mk();
    const a = client.render(PARTS);
    const b = client.render({ ...PARTS, hairHue: 30 });
    const [ma, mb] = workers[0].sent;
    workers[0].reply({ id: mb.id, ok: true, dataUrl: 'data:image/png;base64,BBBB' });
    workers[0].reply({ id: ma.id, ok: true, dataUrl: 'data:image/png;base64,AAAA' });
    expect(await a).toBe('data:image/png;base64,AAAA');
    expect(await b).toBe('data:image/png;base64,BBBB');
  });

  it('★3秒返らなければ reject(呼び手は従来合成へ)・遅れて来た応答は捨てる', async () => {
    const { client, workers, timers } = mk();
    const p = client.render(PARTS);
    const id = workers[0].sent[0].id;
    timers.advance(3000);
    await expect(p).rejects.toThrow('timeout');
    expect(client.snapshot()).toMatchObject({ timedOut: 1, inFlight: 0 });
    expect(() => workers[0].reply({ id, ok: true, dataUrl: PNG })).not.toThrow(); // 捨てる
    expect(client.snapshot().rendered).toBe(0);
  });

  it('★1件の失敗では殺さない・連続2回失敗で dead(以後は作り直さず即 reject)', async () => {
    const { client, workers } = mk();
    const p1 = client.render(PARTS);
    workers[0].reply({ id: workers[0].sent[0].id, ok: false, error: 'fetch failed' });
    await expect(p1).rejects.toThrow('fetch failed');
    expect(client.snapshot().state).toBe('ready');
    const p2 = client.render(PARTS);
    workers[0].reply({ id: workers[0].sent[1].id, ok: false, error: 'fetch failed' });
    await expect(p2).rejects.toThrow('fetch failed');
    expect(client.snapshot().state).toBe('dead');
    expect(workers[0].terminated).toBe(true);
    await expect(client.render(PARTS)).rejects.toThrow('worker dead');
    expect(workers).toHaveLength(1); // 作り直していない
  });

  it('★成功が挟まれば連続失敗は数え直し(1回失敗→成功→1回失敗では dead にならない)', async () => {
    const { client, workers } = mk();
    const fail = async () => { const p = client.render(PARTS); const m = workers[0].sent[workers[0].sent.length - 1]; workers[0].reply({ id: m.id, ok: false, error: 'x' }); await p.catch(() => {}); };
    const ok = async () => { const p = client.render(PARTS); const m = workers[0].sent[workers[0].sent.length - 1]; workers[0].reply({ id: m.id, ok: true, dataUrl: PNG }); await p; };
    await fail(); await ok(); await fail();
    expect(client.snapshot().state).toBe('ready');
  });

  it('★起動で例外(Worker を作れない)なら dead・以後 reject', async () => {
    const timers = fakeTimers();
    const client = createAvatarFaceWorkerClient({ makeWorker: () => { throw new Error('no worker'); }, setTimeoutRef: timers.set, clearTimeoutRef: timers.clear });
    await expect(client.render(PARTS)).rejects.toThrow();
    expect(client.snapshot().state).toBe('dead');
    await expect(client.render(PARTS)).rejects.toThrow();
  });

  it('★onerror(スクリプトが読めない等)で dead・待っていた要求は全部 reject', async () => {
    const { client, workers } = mk();
    const a = client.render(PARTS);
    const b = client.render(PARTS);
    workers[0].onerror({ message: 'boom' });
    await expect(a).rejects.toThrow();
    await expect(b).rejects.toThrow();
    expect(client.snapshot().state).toBe('dead');
  });

  it('★OffscreenCanvas が無い環境(no-offscreencanvas)は、1回で dead', async () => {
    const { client, workers } = mk();
    const p = client.render(PARTS);
    workers[0].reply({ id: workers[0].sent[0].id, ok: false, error: 'no-offscreencanvas' });
    await expect(p).rejects.toThrow();
    expect(client.snapshot().state).toBe('dead');
  });

  it('★30秒使われなければ terminate して off(dead ではない)・次の要求で作り直す', async () => {
    const { client, workers, timers } = mk();
    const p = client.render(PARTS);
    workers[0].reply({ id: workers[0].sent[0].id, ok: true, dataUrl: PNG });
    await p;
    timers.advance(30000);
    expect(workers[0].terminated).toBe(true);
    expect(client.snapshot().state).toBe('off');
    const p2 = client.render(PARTS);
    expect(workers).toHaveLength(2);
    workers[1].reply({ id: workers[1].sent[0].id, ok: true, dataUrl: PNG });
    expect(await p2).toBe(PNG);
  });

  it('処理中はアイドル終了しない(待っている要求があるうちは terminate しない)', async () => {
    const { client, workers, timers } = mk();
    const p = client.render(PARTS);
    timers.advance(2900); // タイムアウト(3秒)の手前。待っている間はアイドルの終了時計が止まっている
    expect(workers[0].terminated).toBe(false);
    workers[0].reply({ id: workers[0].sent[0].id, ok: true, dataUrl: PNG });
    await p;
  });

  it('★PNG の data URL 以外の応答(壊れた値)は失敗として扱う', async () => {
    const { client, workers } = mk();
    const p = client.render(PARTS);
    workers[0].reply({ id: workers[0].sent[0].id, ok: true, dataUrl: 'data:image/svg+xml,<svg/>' });
    await expect(p).rejects.toThrow();
  });

  it('postMessage が例外でも reject する・壊れた応答では落ちない', async () => {
    const { client, workers } = mk();
    workers.length = 0;
    const timers = fakeTimers();
    const c2 = createAvatarFaceWorkerClient({ makeWorker: () => ({ postMessage() { throw new Error('clone'); }, terminate() {} }), setTimeoutRef: timers.set, clearTimeoutRef: timers.clear });
    await expect(c2.render(PARTS)).rejects.toThrow('clone');
    const p = client.render(PARTS);
    expect(() => workers[0].onmessage({ data: null })).not.toThrow();
    expect(() => workers[0].onmessage({ data: { id: 'x' } })).not.toThrow();
    workers[0].reply({ id: workers[0].sent[0].id, ok: true, dataUrl: PNG });
    await p;
  });
});
