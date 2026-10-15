import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler, { logIngest } from '../../api/status.js';

/** 2026-10-15: 受け口の記録。拡張の送信が届いたか・どう返したかが、鍵や本文を漏らさず1行で残ること。 */
const mkRes = () => {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return { json: (b) => { r.body = b; } }; };
  return r;
};
const lines = (spy) => spy.mock.calls.map((c) => { try { return JSON.parse(c[0]); } catch { return null; } }).filter((x) => x && x.m === 'status-ingest');

describe('api/status: 受け口の記録', () => {
  let spy;
  beforeEach(() => {
    spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env.STATUS_INGEST_KEY = 'secret-key-123';
  });
  afterEach(() => { spy.mockRestore(); delete process.env.STATUS_INGEST_KEY; });

  it('★鍵が違う送信は unauthorized と記録し、401 を返す(拡張からかどうかも残る)', async () => {
    const res = mkRes();
    await handler({ method: 'POST', headers: { 'x-share-key': 'wrong', origin: 'chrome-extension://abc', 'content-length': '123' }, body: {} }, res);
    expect(res.code).toBe(401);
    expect(lines(spy)).toEqual([{ m: 'status-ingest', outcome: 'unauthorized', bytes: 123, from: 'extension' }]);
  });
  it('★閲覧トークンが不正なら bad_token・本文が無ければ bad_body', async () => {
    const r1 = mkRes();
    await handler({ method: 'POST', headers: { 'x-share-key': 'secret-key-123' }, body: { v: '!' } }, r1);
    expect(r1.code).toBe(400);
    const r2 = mkRes();
    await handler({ method: 'POST', headers: { 'x-share-key': 'secret-key-123' }, body: null }, r2);
    expect(lines(spy).map((l) => l.outcome)).toEqual(['bad_token', 'bad_body']);
  });
  it('★保存に成功したら ok と記録し、200 を返す', async () => {
    process.env.KV_REST_API_URL = 'https://kv.example';
    process.env.KV_REST_API_TOKEN = 't';
    const f = vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ result: 'OK' }) })));
    try {
      const res = mkRes();
      await handler({ method: 'POST', headers: { 'x-share-key': 'secret-key-123', origin: 'chrome-extension://abc', 'content-length': '999' }, body: { v: 'view-token-abcdefgh', a: 1 } }, res);
      expect(res.code).toBe(200);
      expect(lines(spy)).toEqual([{ m: 'status-ingest', outcome: 'ok', bytes: 999, from: 'extension' }]);
    } finally {
      vi.unstubAllGlobals();
      delete process.env.KV_REST_API_URL;
      delete process.env.KV_REST_API_TOKEN;
      void f;
    }
  });
  it('★記録に鍵・閲覧トークン・本文が入らない', async () => {
    await handler({ method: 'POST', headers: { 'x-share-key': 'secret-key-123', origin: 'https://x.example' }, body: { v: 'view-token-abcdefgh', statusReport: 'コメント本文' } }, mkRes());
    const text = JSON.stringify(spy.mock.calls);
    expect(text).not.toContain('secret-key-123');
    expect(text).not.toContain('view-token-abcdefgh');
    expect(text).not.toContain('コメント本文');
  });
  it('記録の例外で受け口を止めない', () => {
    expect(() => logIngest(/** @type {any} */ (null), 'ok')).not.toThrow();
  });
});
