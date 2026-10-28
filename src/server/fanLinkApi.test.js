import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import deviceHandler from '../../api/device.js';
import statusHandler from '../../api/status.js';
import { liveChannelName } from './liveEventsApi.js';
import { FAN_TOKEN_RE, fanRealtimeVerdict, fanViewUrl, isFanToken } from '../lib/fanLink.js';

/** Upstash(Map)と Ably(requestToken だけ)を模す。 */
function mockFetch(store, ably) {
  return vi.fn(async (url, init) => {
    if (String(url).startsWith('https://main.realtime.ably.net')) {
      ably.push({ url: String(url), body: JSON.parse(init.body) });
      return { ok: true, status: 200, json: async () => ({ token: 'tok.abc', expires: 99 }) };
    }
    const [op, key, ...rest] = JSON.parse(init.body);
    let result = 'OK';
    if (op === 'SET') store.set(key, rest[0]);
    else if (op === 'GET') result = store.get(key) ?? null;
    else if (op === 'DEL') { result = 0; for (const k of [key, ...rest]) if (store.delete(k)) result++; }
    else if (op === 'INCR') { result = Number(store.get(key) || 0) + 1; store.set(key, String(result)); }
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
const auth = (c) => ({ 'x-device-id': c.deviceId, 'x-write-key': c.writeKey });
const fanPost = (headers, body) => call(statusHandler, { method: 'POST', query: { action: 'fan' }, headers, body });
const view = (v, extra = {}) => call(statusHandler, { method: 'GET', query: { v, ...extra } });

describe('配信者中継: ファン用の読むだけのリンク(v0.1.1820)', () => {
  let store; let ably; let logSpy; let c;
  beforeEach(async () => {
    store = new Map(); ably = [];
    vi.stubGlobal('fetch', mockFetch(store, ably));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env.KV_REST_API_URL = 'https://kv.example';
    process.env.KV_REST_API_TOKEN = 't';
    c = (await call(deviceHandler, { method: 'POST', headers: { 'x-forwarded-for': '1.2.3.4' } })).body;
    await call(statusHandler, { method: 'POST', headers: auth(c), body: { a: 1 } });
  });
  afterEach(() => {
    vi.unstubAllGlobals(); logSpy.mockRestore();
    for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'ABLY_API_KEY', 'FAN_REALTIME_HOURLY_LIMIT', 'FAN_REALTIME_MONTHLY_LIMIT', 'STATUS_INGEST_KEY']) delete process.env[k];
  });

  it('★ON にするとファン用リンクが出て、配信者の最新を読める(閲覧トークンとは別の文字列・何度押しても同じ)', async () => {
    const r = await fanPost(auth(c), { on: true });
    expect(r.code).toBe(200);
    const f = r.body.fanToken;
    expect(isFanToken(f)).toBe(true);
    expect(f).not.toContain(c.viewToken);
    expect((await fanPost(auth(c), { on: true })).body.fanToken).toBe(f);
    const g = await view(f);
    expect(g.code).toBe(200);
    expect(g.body.data).toEqual({ a: 1 });
    expect(g.headers['Cache-Control']).toBe('public, max-age=0, s-maxage=5');
  });

  it('★ファンが見ても、配信者の PC の動きを変える目印(スマホが見ている・声がほしい)は置かない', async () => {
    const f = (await fanPost(auth(c), { on: true })).body.fanToken;
    await view(f);
    await view(f, { action: 'voice' });
    expect(store.has(`status:viewing:${c.viewToken}`)).toBe(false);
    expect([...store.keys()].some((k) => k.includes('want'))).toBe(false);
    await view(c.viewToken);
    expect(store.has(`status:viewing:${c.viewToken}`)).toBe(true);
  });

  it('★OFF にすると古いリンクは 404・鍵が違えば 401・ファン用リンクでは作れない', async () => {
    const f = (await fanPost(auth(c), { on: true })).body.fanToken;
    expect((await fanPost(auth(c), { on: false })).body).toEqual({ ok: true, fan: false });
    expect((await view(f)).code).toBe(404);
    expect((await view('fan_' + 'x'.repeat(22))).code).toBe(404);
    expect((await fanPost({ ...auth(c), 'x-write-key': 'y'.repeat(43) }, { on: true })).code).toBe(401);
    process.env.STATUS_INGEST_KEY = 'k';
    expect((await fanPost({ 'x-share-key': 'k' }, { on: true, v: f })).code).toBe(400);
  });

  it('★閲覧URLを作り直してもファン用リンクは切れない(新しい方を読む)・スマホで見るを止めたら消える', async () => {
    const f = (await fanPost(auth(c), { on: true })).body.fanToken;
    const rot = await call(deviceHandler, { method: 'POST', query: { action: 'rotate' }, headers: auth(c) });
    await call(statusHandler, { method: 'POST', headers: auth(c), body: { a: 2 } });
    expect((await view(f)).body.data).toEqual({ a: 2 });
    expect((await fanPost(auth(c), { on: true })).body.fanToken).toBe(f);
    expect(store.get(`fan:link:${f}`)).toBe(rot.body.viewToken);
    await call(deviceHandler, { method: 'DELETE', headers: auth(c) });
    expect((await view(f)).code).toBe(404);
  });

  it('★ファンのリアルタイムは配信者のチャンネルの購読だけ・1時間の人数を超えたら realtime:false(15秒ごとの取得へ)', async () => {
    process.env.ABLY_API_KEY = 'app1.key1:secret';
    process.env.FAN_REALTIME_HOURLY_LIMIT = '2';
    const f = (await fanPost(auth(c), { on: true })).body.fanToken;
    const ok = await view(f, { action: 'realtime' });
    expect(ok.body).toMatchObject({ ok: true, realtime: true });
    expect(JSON.parse(ably[0].body.capability)).toEqual({ [liveChannelName(c.viewToken)]: ['subscribe'] });
    expect((await view(f, { action: 'realtime' })).body.realtime).toBe(true);
    expect((await view(f, { action: 'realtime' })).body).toEqual({ ok: true, realtime: false, reason: 'fan_hour_limit' });
    // 配信者本人のスマホは数えない
    expect((await view(c.viewToken, { action: 'realtime' })).body.realtime).toBe(true);
  });
});

describe('fanLink(純関数)', () => {
  it('形・上限の判定・URL', () => {
    expect(FAN_TOKEN_RE.test('fan_' + 'a'.repeat(22))).toBe(true);
    expect(isFanToken('fan_short')).toBe(false);
    expect(isFanToken('a'.repeat(32))).toBe(false);
    expect(fanRealtimeVerdict({ hourCount: 30, monthCount: 3000 }).allow).toBe(true);
    expect(fanRealtimeVerdict({ hourCount: 31, monthCount: 1 }).reason).toBe('fan_hour_limit');
    expect(fanRealtimeVerdict({ hourCount: 1, monthCount: 3001 }).reason).toBe('fan_month_limit');
    expect(fanViewUrl('https://app.tsuioku-no-kirameki.com/', 'fan_x')).toBe('https://app.tsuioku-no-kirameki.com/live-view?v=fan_x');
  });
});
