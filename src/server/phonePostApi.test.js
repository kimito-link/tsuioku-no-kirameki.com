import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import deviceHandler from '../../api/device.js';
import postHandler from '../../api/post.js';

/** Upstash REST を Map で模す(このテストで使う命令だけ)。 */
function mockUpstash(store) {
  return vi.fn(async (_url, init) => {
    const [op, key, ...rest] = JSON.parse(init.body);
    let result = 'OK';
    if (op === 'SET') store.set(key, rest[0]);
    else if (op === 'GET') result = store.get(key) ?? null;
    else if (op === 'DEL') {
      result = 0;
      for (const k of [key, ...rest]) if (store.delete(k)) result++;
    } else if (op === 'INCR') {
      result = Number(store.get(key) || 0) + 1;
      store.set(key, String(result));
    } else if (op === 'EXISTS') result = store.has(key) ? 1 : 0;
    else if (op === 'RPUSH') {
      const list = store.get(key) || [];
      list.push(...rest);
      store.set(key, list);
      result = list.length;
    } else if (op === 'LPOP') {
      const list = store.get(key) || [];
      const n = Number(rest[0] || 1);
      result = list.length ? list.splice(0, n) : null;
    } else if (op === 'HSET') {
      const h = store.get(key) || {};
      h[rest[0]] = rest[1];
      store.set(key, h);
    } else if (op === 'HMGET') {
      const h = store.get(key) || {};
      result = rest.map((f) => h[f] ?? null);
    }
    return { ok: true, json: async () => ({ result }) };
  });
}
const mkRes = () => {
  const r = { code: 0, body: undefined, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return { json: (b) => { r.body = b; }, end: () => {} }; };
  return r;
};
const call = async (h, req) => { const res = mkRes(); await h({ headers: {}, query: {}, ...req }, res); return res; };
const register = () => call(deviceHandler, { method: 'POST', headers: { 'x-forwarded-for': '1.2.3.4' } });
const owner = (c) => ({ 'x-device-id': c.deviceId, 'x-write-key': c.writeKey });
const ownerAct = (c, action, body) => call(postHandler, { method: 'POST', query: { action }, headers: owner(c), body });
const phonePost = (pk, body) => call(postHandler, { method: 'POST', headers: { 'x-post-key': pk }, body });
const phoneGet = (pk, query = {}) => call(postHandler, { method: 'GET', headers: { 'x-post-key': pk }, query });

describe('api/post: スマホからのコメントの受け渡し(v0.1.1734)', () => {
  let store; let logSpy;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('fetch', mockUpstash(store));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env.KV_REST_API_URL = 'https://kv.example';
    process.env.KV_REST_API_TOKEN = 't';
  });
  afterEach(() => {
    vi.unstubAllGlobals(); logSpy.mockRestore(); vi.useRealTimers();
    delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN; delete process.env.STATUS_INGEST_KEY;
  });

  it('★スマホが預けた1件を PC が取り出し、結果を返すとスマホに「PCが投稿した」が見える', async () => {
    const c = (await register()).body;
    const pk = (await ownerAct(c, 'enable')).body.postKey;
    expect(pk).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await phonePost(pk, { id: 'phone0001', text: ' わこつ ', lv: 'LV123' })).code).toBe(200);
    expect((await phoneGet(pk, { ids: 'phone0001' })).body.states).toEqual({ phone0001: 'queued' });

    const pulled = await ownerAct(c, 'pull');
    expect(pulled.body.items).toEqual([{ id: 'phone0001', text: 'わこつ', lv: 'lv123', at: expect.any(Number) }]);
    expect(pulled.body.active).toBe(true);
    expect((await ownerAct(c, 'pull')).body.items).toEqual([]); // 二度は出ない=二重投稿しない

    await ownerAct(c, 'ack', { id: 'phone0001', state: 'sent' });
    const g = await phoneGet(pk, { ids: 'phone0001' });
    expect(g.body.states).toEqual({ phone0001: 'sent' });
    expect(g.body.pcSeenAt).toBeGreaterThan(0);
  });

  it('★投稿用の鍵はハッシュだけ保存する・閲覧URLを知っているだけでは送れない', async () => {
    const c = (await register()).body;
    const pk = (await ownerAct(c, 'enable')).body.postKey;
    expect([...store.values()].some((v) => String(v).includes(pk))).toBe(false);
    expect((await phonePost(c.viewToken + 'xxxxxxxxxxxxxxxxxxxx', { id: 'phone0001', text: 'a', lv: 'lv1' })).code).toBe(401);
    expect((await phonePost('', { id: 'phone0001', text: 'a', lv: 'lv1' })).code).toBe(401);
  });

  it('★作り直すと古い鍵は使えない・OFF にすると送れない', async () => {
    const c = (await register()).body;
    const pk1 = (await ownerAct(c, 'enable')).body.postKey;
    const pk2 = (await ownerAct(c, 'enable')).body.postKey;
    expect((await phonePost(pk1, { id: 'phone0001', text: 'a', lv: 'lv1' })).code).toBe(401);
    expect((await phonePost(pk2, { id: 'phone0002', text: 'a', lv: 'lv1' })).code).toBe(200);
    await ownerAct(c, 'disable');
    expect((await phonePost(pk2, { id: 'phone0003', text: 'a', lv: 'lv1' })).code).toBe(401);
  });

  it('★閲覧URLを作り直す・同意 OFF(削除)でも、コメントの鍵は無効になる', async () => {
    const c = (await register()).body;
    const pk = (await ownerAct(c, 'enable')).body.postKey;
    await call(deviceHandler, { method: 'POST', query: { action: 'rotate' }, headers: owner(c) });
    expect((await phonePost(pk, { id: 'phone0001', text: 'a', lv: 'lv1' })).code).toBe(401);
    const pk2 = (await ownerAct(c, 'enable')).body.postKey;
    await call(deviceHandler, { method: 'DELETE', headers: owner(c) });
    expect((await phonePost(pk2, { id: 'phone0002', text: 'a', lv: 'lv1' })).code).toBe(401);
  });

  it('★20秒に9件目からは 429(連打で放送を荒らさない)', async () => {
    const c = (await register()).body;
    const pk = (await ownerAct(c, 'enable')).body.postKey;
    for (let i = 0; i < 8; i++) {
      expect((await phonePost(pk, { id: `phone000${i}`, text: `${i}`, lv: 'lv1' })).code).toBe(200);
    }
    const r = await phonePost(pk, { id: 'phone0009', text: '9', lv: 'lv1' });
    expect(r.code).toBe(429);
    expect(r.body.error).toBe('too_fast');
  });

  it('★空・長すぎ・lv 不正は預からない', async () => {
    const c = (await register()).body;
    const pk = (await ownerAct(c, 'enable')).body.postKey;
    expect((await phonePost(pk, { id: 'phone0001', text: '   ', lv: 'lv1' })).code).toBe(400);
    expect((await phonePost(pk, { id: 'phone0001', text: 'あ'.repeat(251), lv: 'lv1' })).code).toBe(400);
    expect((await phonePost(pk, { id: 'phone0001', text: 'a', lv: 'sm9' })).code).toBe(400);
  });

  it('★1分以上 PC が取りに来なかったものは投稿せず「時間切れ」にする', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-22T00:00:00Z'));
    const c = (await register()).body;
    const pk = (await ownerAct(c, 'enable')).body.postKey;
    await phonePost(pk, { id: 'phone0001', text: 'おそい', lv: 'lv1' });
    vi.setSystemTime(new Date('2026-10-22T00:01:30Z'));
    expect((await ownerAct(c, 'pull')).body.items).toEqual([]);
    expect((await phoneGet(pk, { ids: 'phone0001' })).body.states).toEqual({ phone0001: 'failed:stale' });
  });

  it('PC の照合: 鍵が違えば 401・共有キーなら x-view-token の送り先で動く', async () => {
    expect((await call(postHandler, { method: 'POST', query: { action: 'pull' }, headers: { 'x-device-id': 'x'.repeat(22), 'x-write-key': 'y'.repeat(43) } })).code).toBe(401);
    process.env.STATUS_INGEST_KEY = 'devkey';
    const shared = { 'x-share-key': 'devkey', 'x-view-token': 'mytoken123' };
    const en = await call(postHandler, { method: 'POST', query: { action: 'enable' }, headers: shared });
    expect(en.code).toBe(200);
    await phonePost(en.body.postKey, { id: 'phone0001', text: 'hi', lv: 'lv1' });
    const pulled = await call(postHandler, { method: 'POST', query: { action: 'pull' }, headers: shared });
    expect(pulled.body.items.map((i) => i.id)).toEqual(['phone0001']);
    expect((await call(postHandler, { method: 'POST', query: { action: 'pull' }, headers: { ...shared, 'x-share-key': 'bad' } })).code).toBe(401);
  });

  it('★記録に本文・鍵を書かない', async () => {
    const c = (await register()).body;
    const pk = (await ownerAct(c, 'enable')).body.postKey;
    await phonePost(pk, { id: 'phone0001', text: 'ひみつの本文', lv: 'lv1' });
    await ownerAct(c, 'pull');
    const logged = logSpy.mock.calls.map((a) => String(a[0])).join('\n');
    expect(logged).not.toContain('ひみつの本文');
    expect(logged).not.toContain(pk);
  });
});
