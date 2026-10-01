import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchKickAppToken, fetchKickLivestreams } from './kickApi.js';

/**
 * 2026-10-01: Kick 公式 API の I/O を偽 fetch で検査する(実ネットワークへ出ない)。
 * ★token は戻り値でだけ扱い、ログに出さない設計。ここは戻り値と送った中身を固定する。
 */

/** @param {number} status @param {unknown} body @param {Record<string,string>} [headers] */
function res(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body
  };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('fetchKickAppToken', () => {
  it('form-urlencoded で id.kick.com へ POST し、access_token と expires_in を返す', async () => {
    /** @type {any[]} */
    const calls = [];
    const fetchImpl = vi.fn(async (url, init) => { calls.push({ url, init }); return res(200, { access_token: 'tok', expires_in: 3600, token_type: 'Bearer' }); });
    const r = await fetchKickAppToken({ clientId: 'cid', clientSecret: 'sec', fetchImpl });
    expect(r).toEqual({ ok: true, token: 'tok', expiresIn: 3600 });
    expect(calls[0].url).toBe('https://id.kick.com/oauth/token');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const body = new URLSearchParams(String(calls[0].init.body));
    expect(body.get('grant_type')).toBe('client_credentials');
    expect(body.get('client_id')).toBe('cid');
    expect(body.get('client_secret')).toBe('sec');
  });

  it('access_token 無し/HTTP 4xx は ok:false（例外にしない）', async () => {
    const noTok = await fetchKickAppToken({ clientId: 'a', clientSecret: 'b', fetchImpl: async () => res(200, { expires_in: 1 }) });
    expect(noTok.ok).toBe(false);
    const bad = await fetchKickAppToken({ clientId: 'a', clientSecret: 'b', fetchImpl: async () => res(401, { error: 'x' }) });
    expect(bad).toMatchObject({ ok: false, status: 401 });
    const thrown = await fetchKickAppToken({ clientId: 'a', clientSecret: 'b', fetchImpl: async () => { throw new Error('net'); } });
    expect(thrown).toMatchObject({ ok: false, status: 0 });
  });

  it('鍵が空なら通信せず ok:false', async () => {
    const fetchImpl = vi.fn();
    const r = await fetchKickAppToken({ clientId: '', clientSecret: 'b', fetchImpl });
    expect(r.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('fetchKickLivestreams', () => {
  it('Bearer と language_code=ja&limit=100 を付けて GET', async () => {
    /** @type {any[]} */
    const calls = [];
    const fetchImpl = vi.fn(async (url, init) => { calls.push({ url, init }); return res(200, { data: [] }, { 'x-ratelimit-remaining': '99' }); });
    const r = await fetchKickLivestreams({ token: 'tok', fetchImpl });
    expect(r).toMatchObject({ ok: true, status: 200, json: { data: [] } });
    expect(r.headersSample).toEqual({ 'x-ratelimit-remaining': '99' });
    const u = new URL(calls[0].url);
    expect(u.origin + u.pathname).toBe('https://api.kick.com/public/v2/livestreams');
    expect(u.searchParams.get('language_code')).toBe('ja');
    expect(u.searchParams.get('limit')).toBe('100');
    expect(calls[0].init.headers.Authorization).toBe('Bearer tok');
  });

  it('401/5xx/timeout は ok:false と status（throw しない）', async () => {
    expect(await fetchKickLivestreams({ token: 't', fetchImpl: async () => res(401, {}) })).toMatchObject({ ok: false, status: 401, json: null });
    expect(await fetchKickLivestreams({ token: 't', fetchImpl: async () => res(503, {}) })).toMatchObject({ ok: false, status: 503 });
    const to = await fetchKickLivestreams({ token: 't', fetchImpl: async () => { throw new DOMException('timeout', 'TimeoutError'); } });
    expect(to).toMatchObject({ ok: false, status: 0, json: null });
  });

  it('★token の値を console に出さない', async () => {
    const spies = ['log', 'info', 'warn', 'error', 'debug'].map((m) => vi.spyOn(console, /** @type {any} */ (m)).mockImplementation(() => {}));
    await fetchKickAppToken({ clientId: 'a', clientSecret: 'SECRET-xyz', fetchImpl: async () => res(200, { access_token: 'TOKEN-abc', expires_in: 1 }) });
    await fetchKickLivestreams({ token: 'TOKEN-abc', fetchImpl: async () => res(500, {}) });
    await fetchKickLivestreams({ token: 'TOKEN-abc', fetchImpl: async () => { throw new Error('boom'); } });
    for (const s of spies) {
      for (const call of s.mock.calls) {
        expect(JSON.stringify(call)).not.toMatch(/TOKEN-abc|SECRET-xyz/);
      }
    }
  });
});
