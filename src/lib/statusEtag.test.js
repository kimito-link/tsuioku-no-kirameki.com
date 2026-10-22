import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isEtagMatch } from './statusEtag.js';
import handler, { etagOf } from '../../api/status.js';

describe('isEtagMatch(スマホが持っている版と同じか・v0.1.1729)', () => {
  it('同じ ETag なら true・違えば false', () => {
    expect(isEtagMatch('"abc"', '"abc"')).toBe(true);
    expect(isEtagMatch('"abc"', '"abd"')).toBe(false);
  });
  it('弱い比較(W/)・カンマ区切り・* に対応', () => {
    expect(isEtagMatch('W/"abc"', '"abc"')).toBe(true);
    expect(isEtagMatch('"x", "abc"', '"abc"')).toBe(true);
    expect(isEtagMatch('*', '"abc"')).toBe(true);
  });
  it('★どちらかが空・壊れていれば false(本文を返す側に倒す=古い画面を出し続けない)', () => {
    expect(isEtagMatch('', '"abc"')).toBe(false);
    expect(isEtagMatch('"abc"', null)).toBe(false);
    expect(isEtagMatch(undefined, undefined)).toBe(false);
    expect(isEtagMatch('*', '')).toBe(false);
  });
});

/** Upstash REST を Map で模す(SET key val EX ttl / GET key)。 */
function mockUpstash(store) {
  return vi.fn(async (_url, init) => {
    const cmd = JSON.parse(init.body);
    if (cmd[0] === 'SET') store.set(cmd[1], cmd[2]);
    const result = cmd[0] === 'GET' ? store.get(cmd[1]) ?? null : 'OK';
    return { ok: true, json: async () => ({ result }) };
  });
}
const mkRes = () => {
  const r = { code: 0, body: undefined, ended: false, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return { json: (b) => { r.body = b; }, end: () => { r.ended = true; } }; };
  return r;
};
const TOKEN = 'tokentoken123';

describe('api/status: 変わっていなければ 304(v0.1.1729 スマホ化 第1段)', () => {
  let store; let logSpy;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('fetch', mockUpstash(store));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env.STATUS_INGEST_KEY = 'k';
    process.env.KV_REST_API_URL = 'https://kv.example';
    process.env.KV_REST_API_TOKEN = 't';
  });
  afterEach(() => {
    vi.unstubAllGlobals(); logSpy.mockRestore();
    delete process.env.STATUS_INGEST_KEY; delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;
  });
  const post = (body) => handler({ method: 'POST', headers: { 'x-share-key': 'k' }, body: { ...body, v: TOKEN } }, mkRes());
  const get = async (inm) => {
    const res = mkRes();
    await handler({ method: 'GET', headers: inm ? { 'if-none-match': inm } : {}, query: { v: TOKEN } }, res);
    return res;
  };

  it('★初回は本文と ETag を返し、同じ ETag で聞き直すと本文なしの 304', async () => {
    await post({ a: 1 });
    const first = await get();
    expect(first.code).toBe(200);
    expect(first.body.data).toEqual({ a: 1 });
    expect(first.headers.ETag).toBe(etagOf(JSON.stringify({ a: 1 })));
    const again = await get(first.headers.ETag);
    expect(again.code).toBe(304);
    expect(again.ended).toBe(true);
    expect(again.body).toBeUndefined();
  });
  it('★中身が変われば、古い ETag で聞いても新しい本文を返す', async () => {
    await post({ a: 1 });
    const first = await get();
    await post({ a: 2 });
    const next = await get(first.headers.ETag);
    expect(next.code).toBe(200);
    expect(next.body.data).toEqual({ a: 2 });
    expect(next.headers.ETag).not.toBe(first.headers.ETag);
  });
  it('ETag の別キーが無い(この版より前に保存された)ときは本文を返す', async () => {
    store.set(`status:latest:${TOKEN}`, JSON.stringify({ old: true }));
    const res = await get('"whatever"');
    expect(res.code).toBe(200);
    expect(res.body.data).toEqual({ old: true });
  });
});

import { MAX_INGEST_BYTES } from '../../api/status.js';

describe('api/status: 大きすぎる送信は保存しない(v0.1.1729)', () => {
  it('★上限を超えたら 413 で、保存しない', async () => {
    const store = new Map();
    vi.stubGlobal('fetch', mockUpstash(store));
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env.STATUS_INGEST_KEY = 'k';
    const res = mkRes();
    await handler({ method: 'POST', headers: { 'x-share-key': 'k', 'content-length': String(MAX_INGEST_BYTES + 1) }, body: { a: 1, v: TOKEN } }, res);
    expect(res.code).toBe(413);
    expect(store.size).toBe(0);
    expect(spy.mock.calls.some((c) => String(c[0]).includes('"too_large"'))).toBe(true);
    vi.unstubAllGlobals(); spy.mockRestore(); delete process.env.STATUS_INGEST_KEY;
  });
});
