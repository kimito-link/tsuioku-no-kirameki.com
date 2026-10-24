import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import deviceHandler from '../../api/device.js';
import statusHandler from '../../api/status.js';
import { liveChannelName } from './liveEventsApi.js';

/** Upstash(Map)と Ably(呼ばれた内容を記録)をまとめて模す。 */
function mockFetch(store, ably) {
  return vi.fn(async (url, init) => {
    if (String(url).startsWith('https://main.realtime.ably.net')) {
      ably.push({ url: String(url), auth: init.headers.Authorization, body: JSON.parse(init.body) });
      if (String(url).includes('/requestToken')) return { ok: true, status: 200, json: async () => ({ token: 'tok.abc', expires: 99 }) };
      return { ok: true, status: 201, json: async () => ({}) };
    }
    const [op, key, ...rest] = JSON.parse(init.body);
    let result = 'OK';
    if (op === 'SET') store.set(key, rest[0]);
    else if (op === 'GET') result = store.get(key) ?? null;
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
const batch = (extra = {}) => ({ liveId: 'lv123', sendId: 'send-0001', events: [{ type: 'comment', no: '5', at: 1000, name: 'a', text: 'こんにちは' }], dropped: 0, ...extra });
const sendEvents = (headers, body) => call(statusHandler, { method: 'POST', query: { action: 'events' }, headers, body });

describe('api/status ?action=events / realtime(v0.1.1756 Ably)', () => {
  let store; let ably; let logSpy; let c;
  beforeEach(async () => {
    store = new Map(); ably = [];
    vi.stubGlobal('fetch', mockFetch(store, ably));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env.KV_REST_API_URL = 'https://kv.example';
    process.env.KV_REST_API_TOKEN = 't';
    c = (await call(deviceHandler, { method: 'POST', headers: { 'x-forwarded-for': '1.2.3.4' } })).body;
  });
  afterEach(() => {
    vi.unstubAllGlobals(); logSpy.mockRestore();
    for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'ABLY_API_KEY', 'LIVE_EVENTS_DAILY_LIMIT', 'LIVE_EVENTS_MONTHLY_LIMIT', 'STATUS_INGEST_KEY']) delete process.env[k];
  });

  it('★キーが無いときは何もしない: 送っても realtime:false・Redis も Ably も使わない・PC への返事も realtime:false', async () => {
    const before = store.size;
    const r = await sendEvents(auth(c), batch());
    expect(r.body).toEqual({ ok: true, realtime: false });
    expect(store.size).toBe(before);
    expect(ably).toHaveLength(0);
    expect((await call(statusHandler, { method: 'GET', query: { v: c.viewToken, action: 'realtime' } })).body).toEqual({ ok: true, realtime: false });
    expect((await call(statusHandler, { method: 'POST', headers: auth(c), body: { a: 1 } })).body.realtime).toBe(false);
  });

  it('★キーがあると、送り先はサーバーが決めたチャンネルに Ably で発行(同じ sendId は同じ id=Ably が1回にまとめる)', async () => {
    process.env.ABLY_API_KEY = 'app1.key1:secret';
    const r = await sendEvents(auth(c), batch());
    expect(r.body).toMatchObject({ ok: true, realtime: true, sent: 1 });
    expect(ably).toHaveLength(1);
    expect(ably[0].url).toBe(`https://main.realtime.ably.net/channels/${encodeURIComponent(liveChannelName(c.viewToken))}/messages`);
    expect(ably[0].auth).toBe(`Basic ${Buffer.from('app1.key1:secret').toString('base64')}`);
    expect(ably[0].body.id).toBe('d-send-0001');
    expect(JSON.parse(ably[0].body.data)).toMatchObject({ liveId: 'lv123', events: [{ no: '5', text: 'こんにちは' }] });
    expect(liveChannelName(c.viewToken)).not.toContain(c.viewToken);
    expect((await call(statusHandler, { method: 'POST', headers: auth(c), body: { a: 1 } })).body.realtime).toBe(true);
  });

  it('鍵が違えば 401・形が違えば 400・上限を超えたら 429(1日・月)', async () => {
    process.env.ABLY_API_KEY = 'app1.key1:secret';
    expect((await sendEvents({ 'x-device-id': c.deviceId, 'x-write-key': 'y'.repeat(43) }, batch())).code).toBe(401);
    expect((await sendEvents(auth(c), batch({ liveId: 'nope' }))).code).toBe(400);
    process.env.LIVE_EVENTS_DAILY_LIMIT = '1';
    expect((await sendEvents(auth(c), batch())).code).toBe(200);
    const r = await sendEvents(auth(c), batch({ sendId: 'send-0002' }));
    expect(r.code).toBe(429);
    expect(r.body.error).toBe('events_quota');
    delete process.env.LIVE_EVENTS_DAILY_LIMIT;
    process.env.LIVE_EVENTS_MONTHLY_LIMIT = '1';
    expect((await sendEvents(auth(c), batch({ sendId: 'send-0003' }))).body.error).toBe('events_month_quota');
  });

  it('★スマホへの許可は「このチャンネルの購読だけ」・1時間・接続先の URL つき', async () => {
    process.env.ABLY_API_KEY = 'app1.key1:secret';
    const r = await call(statusHandler, { method: 'GET', query: { v: c.viewToken, action: 'realtime' } });
    expect(r.body).toMatchObject({ ok: true, realtime: true, expires: 99 });
    const req = ably.find((x) => x.url.includes('/requestToken'));
    expect(req.url).toBe('https://main.realtime.ably.net/keys/app1.key1/requestToken');
    expect(JSON.parse(req.body.capability)).toEqual({ [liveChannelName(c.viewToken)]: ['subscribe'] });
    expect(req.body.ttl).toBe(3_600_000);
    expect(req.body.nonce.length).toBeGreaterThanOrEqual(16);
    expect(r.body.sseUrl).toBe(`https://main.realtime.ably.net/sse?v=1.2&channels=${encodeURIComponent(liveChannelName(c.viewToken))}&accessToken=tok.abc`);
    expect(r.body.sseUrl).not.toContain('secret');
  });

  it('共有キー経路でも送れる(送り先は本文の v)', async () => {
    process.env.ABLY_API_KEY = 'app1.key1:secret';
    process.env.STATUS_INGEST_KEY = 'k';
    const r = await sendEvents({ 'x-share-key': 'k' }, batch({ v: c.viewToken }));
    expect(r.body.realtime).toBe(true);
    expect(ably[0].body.id).toBe('s-send-0001');
  });
});
