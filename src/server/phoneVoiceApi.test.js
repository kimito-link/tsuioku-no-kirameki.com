import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import deviceHandler from '../../api/device.js';
import statusHandler from '../../api/status.js';

/** Upstash REST を Map で模す(文字列・リスト・期限)。 */
function mockUpstash(store, ttl) {
  return vi.fn(async (_url, init) => {
    const [op, key, ...rest] = JSON.parse(init.body);
    let result = 'OK';
    if (op === 'SET') {
      store.set(key, rest[0]);
      if (rest[1] === 'EX') ttl.set(key, Number(rest[2]));
    } else if (op === 'GET') result = store.get(key) ?? null;
    else if (op === 'INCR') {
      result = Number(store.get(key) || 0) + 1;
      store.set(key, String(result));
    } else if (op === 'EXPIRE') ttl.set(key, Number(rest[0]));
    else if (op === 'LPUSH') {
      const l = store.get(key) || [];
      l.unshift(rest[0]);
      store.set(key, l);
      result = l.length;
    } else if (op === 'LTRIM') store.set(key, (store.get(key) || []).slice(Number(rest[0]), Number(rest[1]) + 1));
    else if (op === 'LRANGE') result = (store.get(key) || []).slice(Number(rest[0]), Number(rest[1]) + 1);
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
const sendVoice = (headers, body) => call(statusHandler, { method: 'POST', query: { action: 'voice' }, headers, body });
const getVoice = (v, after = '') => call(statusHandler, { method: 'GET', query: { v, action: 'voice', after } });

describe('api/status ?action=voice: スマホの読み上げ(v0.1.1740)', () => {
  let store; let ttl; let logSpy; let c;
  beforeEach(async () => {
    store = new Map(); ttl = new Map();
    vi.stubGlobal('fetch', mockUpstash(store, ttl));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env.KV_REST_API_URL = 'https://kv.example';
    process.env.KV_REST_API_TOKEN = 't';
    c = (await call(deviceHandler, { method: 'POST', headers: { 'x-forwarded-for': '1.2.3.4' } })).body;
  });
  afterEach(() => {
    vi.unstubAllGlobals(); logSpy.mockRestore();
    delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;
    delete process.env.STATUS_INGEST_KEY; delete process.env.PHONE_VOICE_DAILY_LIMIT;
  });

  it('★スマホが声を取りに来ると、PC への返事が voiceWanted:true になる(目印は30秒)・ふつうの取得では立たない', async () => {
    expect((await call(statusHandler, { method: 'POST', headers: auth(c), body: { a: 1 } })).body.voiceWanted).toBe(false);
    await call(statusHandler, { method: 'GET', query: { v: c.viewToken } });
    expect(store.has(`voice:want:${c.viewToken}`)).toBe(false);
    await getVoice(c.viewToken);
    expect(ttl.get(`voice:want:${c.viewToken}`)).toBe(30);
    expect((await call(statusHandler, { method: 'POST', headers: auth(c), body: { a: 1 } })).body.voiceWanted).toBe(true);
  });

  it('★利用者の鍵で送った声は、自分の閲覧トークンにだけ入り、2分で消える・20件で切る', async () => {
    for (let i = 1; i <= 22; i++) expect((await sendVoice(auth(c), { no: i, ogg: 'T2dnUw==', v: 'othertoken123' })).code).toBe(200);
    expect(store.has('voice:list:othertoken123')).toBe(false);
    expect(ttl.get(`voice:list:${c.viewToken}`)).toBe(120);
    const g = await getVoice(c.viewToken, '19');
    expect(g.body.clips.map((x) => x.no)).toEqual(['20', '21', '22']);
    expect((await getVoice(c.viewToken)).body.clips).toHaveLength(20);
  });

  it('★鍵が違う・形が違う声は受けない', async () => {
    expect((await sendVoice({ ...auth(c), 'x-write-key': 'x'.repeat(43) }, { no: 1, ogg: 'AA==' })).code).toBe(401);
    expect((await sendVoice({}, { no: 1, ogg: 'AA==' })).code).toBe(401);
    expect((await sendVoice(auth(c), { no: 1, ogg: '<script>' })).code).toBe(400);
    expect((await sendVoice({ ...auth(c), 'content-length': '200000' }, { no: 1, ogg: 'AA==' })).code).toBe(413);
  });

  it('共有キーでも送れる(書き込み先は body.v)', async () => {
    process.env.STATUS_INGEST_KEY = 'k';
    expect((await sendVoice({ 'x-share-key': 'k' }, { no: 3, ogg: 'AA==', v: 'tokentoken123' })).code).toBe(200);
    expect((await getVoice('tokentoken123')).body.clips).toEqual([{ no: '3', ogg: 'AA==' }]);
  });

  it('1日の上限を超えたら 429', async () => {
    process.env.PHONE_VOICE_DAILY_LIMIT = '2';
    await sendVoice(auth(c), { no: 1, ogg: 'AA==' });
    await sendVoice(auth(c), { no: 2, ogg: 'AA==' });
    expect((await sendVoice(auth(c), { no: 3, ogg: 'AA==' })).code).toBe(429);
  });
});
