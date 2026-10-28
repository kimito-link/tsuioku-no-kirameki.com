import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/live-ranking.js';

/** watch ページの埋め込み JSON(HTML エスケープ済み)の最小形。 */
const watchHtml = (status = 'ON_AIR') => '<meta property="og:title" content="テスト配信">'
  + `<script data-props="{&quot;status&quot;:&quot;${status}&quot;,&quot;supplierType&quot;:&quot;user&quot;,`
  + '&quot;programProviderId&quot;:&quot;12345&quot;,&quot;watchCount&quot;:10,&quot;commentCount&quot;:3,&quot;beginTime&quot;:1700000000}">';

/** Upstash とニコニコを1つの fetch で模す。 */
function mockFetch(store, nico) {
  return vi.fn(async (url, init) => {
    const u = String(url);
    if (u === 'https://kv.example') {
      const [op, key, ...rest] = JSON.parse(init.body);
      let result = 'OK';
      if (op === 'SET') {
        if (rest.includes('NX') && store.has(key)) result = null;
        else store.set(key, rest[0]);
      } else if (op === 'GET') result = store.get(key) ?? null;
      else if (op === 'DEL') result = store.delete(key) ? 1 : 0;
      return { ok: true, json: async () => ({ result }) };
    }
    nico.calls.push(u);
    if (u.startsWith('https://live.nicovideo.jp/watch/')) {
      return nico.watch == null ? { ok: false, text: async () => '' } : { ok: true, text: async () => nico.watch };
    }
    if (u.includes('api.koken.nicovideo.jp')) return { ok: true, json: async () => ({ data: { rankers: nico.gift } }) };
    if (u.includes('api.nicoad.nicovideo.jp')) return { ok: true, json: async () => ({ data: { ranking: [], contentTotalContribution: 0 } }) };
    return { ok: false };
  });
}
const mkRes = () => {
  const r = { code: 0, body: undefined, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return { json: (b) => { r.body = b; }, end: () => {} }; };
  return r;
};
const get = async (lv) => { const res = mkRes(); await handler({ method: 'GET', headers: {}, query: { lv } }, res); return res; };

describe('/api/live-ranking?lv= (PC の拡張が無い人が放送の URL を貼る・v0.1.1822)', () => {
  let store; let nico;
  beforeEach(() => {
    store = new Map();
    nico = { calls: [], watch: watchHtml(), gift: [{ userId: 1, name: 'a', contribution: 500, rank: 1 }] };
    vi.stubGlobal('fetch', mockFetch(store, nico));
    process.env.KV_REST_API_URL = 'https://kv.example';
    process.env.KV_REST_API_TOKEN = 't';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;
  });

  it('1配信の番組情報とギフトの順位表を返し、60秒だけ置いてニコ生を叩き直さない', async () => {
    const r = await get('LV349123456');
    expect(r.code).toBe(200);
    expect(r.body.live.liveId).toBe('lv349123456');
    expect(r.body.live.title).toBe('テスト配信');
    expect(r.body.live.onAir).toBe(true);
    expect(r.body.live.giftTotal).toBe(500);
    expect(r.body.cached).toBe(false);
    const n = nico.calls.length;
    const again = await get('lv349123456');
    expect(again.body.cached).toBe(true);
    expect(nico.calls.length).toBe(n);
    expect(store.has('live:one-lock:lv349123456')).toBe(false);
  });

  it('まだ誰も応援していない・終わった配信でも番組情報は出す', async () => {
    nico.gift = [];
    nico.watch = watchHtml('ENDED');
    const r = await get('lv349123456');
    expect(r.code).toBe(200);
    expect(r.body.live.onAir).toBe(false);
    expect(r.body.live.gift).toEqual({ rankers: [] });
  });

  it('形の違う ID は 400・番組が読めなければ 404・取れなければ 502(空の行を置かない)', async () => {
    expect((await get('co12345')).code).toBe(400);
    nico.watch = '<html>no program</html>';
    expect((await get('lv349123456')).code).toBe(404);
    nico.watch = null;
    expect((await get('lv349123457')).code).toBe(502);
    expect([...store.keys()].some((k) => k.startsWith('live:one:'))).toBe(false);
  });

  it('同じ配信を他の人が取りに行っている最中は 503 で待ってもらう(ニコ生へは1本だけ)', async () => {
    store.set('live:one-lock:lv349123456', '1');
    const r = await get('lv349123456');
    expect(r.code).toBe(503);
    expect(r.headers['Retry-After']).toBe('2');
    expect(nico.calls.length).toBe(0);
  });
});
