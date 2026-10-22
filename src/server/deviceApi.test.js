import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import deviceHandler from '../../api/device.js';
import { gzipSync } from 'node:zlib';
import statusHandler from '../../api/status.js';

/** Upstash REST を Map で模す(SET/GET/DEL/INCR/EXPIRE)。 */
function mockUpstash(store, ttl) {
  return vi.fn(async (_url, init) => {
    const [op, key, ...rest] = JSON.parse(init.body);
    let result = 'OK';
    if (op === 'SET') {
      store.set(key, rest[0]);
      if (rest[1] === 'EX') ttl.set(key, Number(rest[2]));
    } else if (op === 'GET') result = store.get(key) ?? null;
    else if (op === 'DEL') {
      result = 0;
      for (const k of [key, ...rest]) if (store.delete(k)) result++;
    } else if (op === 'INCR') {
      result = Number(store.get(key) || 0) + 1;
      store.set(key, String(result));
    } else if (op === 'EXPIRE') ttl.set(key, Number(rest[0]));
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
const register = (ip = '1.2.3.4') => call(deviceHandler, { method: 'POST', headers: { 'x-forwarded-for': ip } });
const auth = (c) => ({ 'x-device-id': c.deviceId, 'x-write-key': c.writeKey });
const postAs = (c, body) => call(statusHandler, { method: 'POST', headers: auth(c), body });
const view = (v) => call(statusHandler, { method: 'GET', query: { v } });

describe('api/device + api/status: 利用者ごとの鍵(v0.1.1730)', () => {
  let store; let ttl; let logSpy;
  beforeEach(() => {
    store = new Map(); ttl = new Map();
    vi.stubGlobal('fetch', mockUpstash(store, ttl));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env.KV_REST_API_URL = 'https://kv.example';
    process.env.KV_REST_API_TOKEN = 't';
  });
  afterEach(() => {
    vi.unstubAllGlobals(); logSpy.mockRestore();
    delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;
    delete process.env.DEVICE_DAILY_LIMIT; delete process.env.STATUS_GLOBAL_DAILY_LIMIT;
  });

  it('★発行した鍵で書くと、自分の閲覧URLで見える(保存は24時間)。writeKey そのものはサーバーに残らない', async () => {
    const r = await register();
    expect(r.code).toBe(200);
    const c = r.body;
    expect(c.deviceId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(c.writeKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect([...store.values()].some((v) => String(v).includes(c.writeKey))).toBe(false);
    expect((await postAs(c, { a: 1 })).code).toBe(200);
    const g = await view(c.viewToken);
    expect(g.code).toBe(200);
    expect(g.body.data).toEqual({ a: 1 });
    expect(ttl.get(`status:latest:${c.viewToken}`)).toBe(86_400);
  });

  it('★他人の閲覧トークンを body.v に書いても、自分の場所にしか書けない', async () => {
    const alice = (await register('1.1.1.1')).body;
    const bob = (await register('2.2.2.2')).body;
    await postAs(alice, { who: 'alice' });
    await postAs(bob, { who: 'bob', v: alice.viewToken });
    expect((await view(alice.viewToken)).body.data).toEqual({ who: 'alice' });
    expect((await view(bob.viewToken)).body.data).toEqual({ who: 'bob' });
  });

  it('★鍵が違えば 401(何も保存しない)', async () => {
    const c = (await register()).body;
    const bad = await postAs({ ...c, writeKey: 'x'.repeat(43) }, { a: 1 });
    expect(bad.code).toBe(401);
    expect(store.has(`status:latest:${c.viewToken}`)).toBe(false);
    expect((await postAs({ deviceId: 'nosuchdevice00000000', writeKey: c.writeKey }, { a: 1 })).code).toBe(401);
  });

  it('★利用者経由では診断の全文(statusReport/fastDiag)を保存しない', async () => {
    const c = (await register()).body;
    await postAs(c, { statusReport: 'secret', fastDiag: { x: 1 }, keep: 1 });
    expect((await view(c.viewToken)).body.data).toEqual({ keep: 1 });
  });

  it('★1日の上限を超えたら 429 と Retry-After 120(保存しない)', async () => {
    process.env.DEVICE_DAILY_LIMIT = '2';
    const c = (await register()).body;
    expect((await postAs(c, { n: 1 })).code).toBe(200);
    expect((await postAs(c, { n: 2 })).code).toBe(200);
    const third = await postAs(c, { n: 3 });
    expect(third.code).toBe(429);
    expect(third.headers['Retry-After']).toBe('120');
    expect(third.body.error).toBe('device_quota');
    expect((await view(c.viewToken)).body.data).toEqual({ n: 2 });
  });

  it('全体の上限を超えたら、誰でも 429(global_quota)', async () => {
    process.env.STATUS_GLOBAL_DAILY_LIMIT = '1';
    const a = (await register('1.1.1.1')).body;
    const b = (await register('2.2.2.2')).body;
    expect((await postAs(a, { n: 1 })).code).toBe(200);
    const r = await postAs(b, { n: 1 });
    expect(r.code).toBe(429);
    expect(r.body.error).toBe('global_quota');
  });

  it('★削除するとスマホは 404・鍵も使えなくなる', async () => {
    const c = (await register()).body;
    await postAs(c, { a: 1 });
    expect((await call(deviceHandler, { method: 'DELETE', headers: auth(c) })).code).toBe(200);
    expect((await view(c.viewToken)).code).toBe(404);
    expect((await postAs(c, { a: 2 })).code).toBe(401);
    expect((await call(deviceHandler, { method: 'DELETE', headers: { 'x-device-id': c.deviceId, 'x-write-key': 'y'.repeat(43) } })).code).toBe(401);
  });

  it('★閲覧URLを作り直すと、古いURLは 404・新しいURLに書ける', async () => {
    const c = (await register()).body;
    await postAs(c, { a: 1 });
    const r = await call(deviceHandler, { method: 'POST', query: { action: 'rotate' }, headers: auth(c) });
    expect(r.code).toBe(200);
    expect(r.body.viewToken).not.toBe(c.viewToken);
    expect((await view(c.viewToken)).code).toBe(404);
    await postAs(c, { a: 2 });
    expect((await view(r.body.viewToken)).body.data).toEqual({ a: 2 });
  });

  it('発行の乱発は送信元ごとに1時間5回まで', async () => {
    for (let i = 0; i < 5; i++) expect((await register('9.9.9.9')).code).toBe(200);
    const r = await register('9.9.9.9');
    expect(r.code).toBe(429);
    expect((await register('8.8.8.8')).code).toBe(200);
  });

  it('共有キー経路は今のまま(診断の全文も残す)', async () => {
    process.env.STATUS_INGEST_KEY = 'k';
    await call(statusHandler, { method: 'POST', headers: { 'x-share-key': 'k' }, body: { v: 'tokentoken123', statusReport: 'r' } });
    expect((await view('tokentoken123')).body.data).toEqual({ statusReport: 'r' });
    delete process.env.STATUS_INGEST_KEY;
  });

  it('★v0.1.1735: gzip で送った本文(x-nls-body: gzip)も保存できる。壊れた gzip・膨らみすぎは 400', async () => {
    const c = (await register()).body;
    const zip = (o) => gzipSync(Buffer.from(JSON.stringify(o)));
    const ok = await call(statusHandler, { method: 'POST', headers: { ...auth(c), 'x-nls-body': 'gzip' }, body: zip({ a: 1, fastDiag: {} }) });
    expect(ok.code).toBe(200);
    expect((await view(c.viewToken)).body.data).toEqual({ a: 1 });
    const broken = await call(statusHandler, { method: 'POST', headers: { ...auth(c), 'x-nls-body': 'gzip' }, body: Buffer.from('not gzip') });
    expect(broken.code).toBe(400);
    const bomb = await call(statusHandler, { method: 'POST', headers: { ...auth(c), 'x-nls-body': 'gzip' }, body: zip({ s: 'a'.repeat(1_000_000) }) });
    expect(bomb.code).toBe(400);
  });
});
