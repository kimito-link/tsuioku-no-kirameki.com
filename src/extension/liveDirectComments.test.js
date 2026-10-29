/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import {
  nativeHttpOf,
  bytesFromNativeData,
  nativeFetchBytes,
  startDirectComments,
  runDirectComments,
  mountDirectComments,
  giftItem,
  DIRECT_RETRY_DELAYS_MS
} from './liveDirectComments.js';

const nativeCap = (http, { native = true, available = true } = {}) => ({
  isNativePlatform: () => native,
  isPluginAvailable: (n) => (n === 'CapacitorHttp' ? available : false),
  Plugins: { CapacitorHttp: http }
});

describe('nativeHttpOf', () => {
  const http = { get: async () => ({}) };
  it('アプリの中で CapacitorHttp があるときだけ返す', () => {
    expect(nativeHttpOf(nativeCap(http))).toBe(http);
    expect(nativeHttpOf(nativeCap(http, { native: false }))).toBeNull(); // ブラウザ
    expect(nativeHttpOf(nativeCap(http, { available: false }))).toBeNull(); // 古いアプリ
    expect(nativeHttpOf(undefined)).toBeNull();
  });
});

describe('bytesFromNativeData', () => {
  it('base64 の文字列も ArrayBuffer も同じバイト列にする', () => {
    expect([...bytesFromNativeData(btoa('\x01\x02\xff'))]).toEqual([1, 2, 255]);
    expect([...bytesFromNativeData(new Uint8Array([3, 4]).buffer)]).toEqual([3, 4]);
    expect(bytesFromNativeData('###壊れた###').length).toBe(0);
    expect(bytesFromNativeData(null).length).toBe(0);
  });
});

describe('nativeFetchBytes', () => {
  it('arraybuffer で取りに行き、状態とバイト列を返す', async () => {
    const seen = [];
    const http = { get: async (o) => { seen.push(o); return { status: 200, data: btoa('ab') }; } };
    const r = await nativeFetchBytes(http)('https://mpn.example/x');
    expect(r.status).toBe(200);
    expect([...r.bytes]).toEqual([97, 98]);
    expect(seen[0]).toMatchObject({ url: 'https://mpn.example/x', responseType: 'arraybuffer' });
    expect(seen[0].readTimeout).toBeGreaterThanOrEqual(20_000); // view は次の区切りまで待って返る
  });
});

/** watch ページの HTML(embedded-data に視聴の接続先が入っている形)。 */
const watchHtml = (wsUrl) => {
  const props = JSON.stringify({ site: { relive: { webSocketUrl: wsUrl } } }).replace(/"/g, '&quot;');
  return `<script id="embedded-data" data-props="${props}"></script>`;
};

/** 握手で messageServer を返す偽 WebSocket。 */
const fakeWs = (viewUri) =>
  class {
    constructor() {
      this.l = { open: [], message: [], error: [], close: [] };
      queueMicrotask(() => {
        this.l.open.forEach((f) => f());
        this.l.message.forEach((f) => f({ data: JSON.stringify({ type: 'messageServer', data: { viewUri } }) }));
      });
    }
    addEventListener(t, f) { this.l[t].push(f); }
    send() {}
    close() {}
  };

describe('startDirectComments', () => {
  it('終わった配信(接続先が無い)は ended にして、ニコニコの view を叩かない', async () => {
    const urls = [];
    const http = { get: async (o) => { urls.push(o.url); return { status: 200, data: '<html></html>' }; } };
    const states = [];
    await startDirectComments({ lv: 'lv1234567', http, signal: new AbortController().signal, onComments: () => {}, onState: (s) => states.push(s) });
    expect(states).toEqual(['connecting', 'ended']);
    expect(urls).toEqual(['https://live.nicovideo.jp/watch/lv1234567']);
  });

  it('握手できたら live になり、止めると view を叩くのをやめる', async () => {
    const ac = new AbortController();
    const states = [];
    let views = 0;
    const http = {
      get: async (o) => {
        if (o.url.includes('/watch/')) return { status: 200, data: watchHtml('wss://secret/ws') };
        views += 1;
        ac.abort();
        return { status: 200, data: '' };
      }
    };
    await startDirectComments({
      lv: 'lv1234567', http, signal: ac.signal, onComments: () => {}, onState: (s) => states.push(s),
      WebSocketImpl: fakeWs('https://mpn.example/api/view/v4/a')
    });
    expect(states).toEqual(['connecting', 'live']);
    expect(views).toBe(1);
  });
});

describe('runDirectComments(切れたらつなぎ直す)', () => {
  it('握手に失敗したら間を空けてつなぎ直し、使い切ったら failed で止まる', async () => {
    const states = [];
    const waits = [];
    let watches = 0;
    const http = { get: async () => { watches += 1; return { status: 200, data: watchHtml('wss://secret/ws') }; } };
    const failingWs = class {
      constructor() { this.l = { open: [], message: [], error: [], close: [] }; queueMicrotask(() => this.l.error.forEach((f) => f())); }
      addEventListener(t, f) { this.l[t].push(f); }
      send() {}
      close() {}
    };
    await runDirectComments({
      lv: 'lv1234567', http, signal: new AbortController().signal, onComments: () => {},
      onState: (s) => states.push(s), WebSocketImpl: failingWs,
      sleep: async (ms) => { waits.push(ms); }
    });
    expect(waits).toEqual([...DIRECT_RETRY_DELAYS_MS]);
    expect(watches).toBe(DIRECT_RETRY_DELAYS_MS.length + 1);
    expect(states.filter((s) => s === 'retrying')).toHaveLength(DIRECT_RETRY_DELAYS_MS.length);
    expect(states.at(-1)).toBe('failed');
  });

  it('配信が終わっていたら(ended)つなぎ直さない', async () => {
    const states = [];
    const http = { get: async () => ({ status: 200, data: '<html></html>' }) };
    await runDirectComments({ lv: 'lv1234567', http, signal: new AbortController().signal, onComments: () => {}, onState: (s) => states.push(s), sleep: async () => { throw new Error('待たない'); } });
    expect(states).toEqual(['connecting', 'ended']);
  });

  it('止めたら(abort)待っている途中でも終わる', async () => {
    const ac = new AbortController();
    const states = [];
    const http = { get: async () => { throw new Error('圏外'); } };
    await runDirectComments({
      lv: 'lv1234567', http, signal: ac.signal, onComments: () => {}, onState: (s) => states.push(s),
      sleep: async () => { ac.abort(); }
    });
    expect(states).toEqual(['connecting', 'retrying']);
  });
});

describe('mountDirectComments', () => {
  it('アプリの外(LP の /live/・ブラウザ)では何も出さない', () => {
    document.body.innerHTML = '<main id="list"></main>';
    const ok = mountDirectComments({ lv: 'lv1234567', mountBefore: document.getElementById('list'), cap: undefined });
    expect(ok).toBe(false);
    expect(document.querySelector('.direct-comments')).toBeNull();
  });

  it('アプリの中で ?lv= があるときだけ「💬 コメントを流す」を出す', () => {
    document.body.innerHTML = '<main id="list"></main>';
    const cap = nativeCap({ get: async () => ({ status: 200, data: '' }) });
    expect(mountDirectComments({ lv: '', mountBefore: document.getElementById('list'), cap })).toBe(false);
    expect(mountDirectComments({ lv: 'lv1234567', mountBefore: document.getElementById('list'), cap })).toBe(true);
    expect(document.querySelector('[data-direct-toggle]')?.textContent).toContain('コメントを流す');
  });
});

describe('giftItem', () => {
  it('名前・アイテム・ポイントを出し、名前は文字として扱う(タグにしない)', () => {
    const li = giftItem({ name: '<b>x</b>', itemName: 'きらきら', point: 500 });
    expect(li.className).toBe('direct-gift');
    expect(li.textContent).toBe('🎁 <b>x</b> さんが きらきら(500pt)');
    expect(li.querySelector('b')).toBeNull();
    expect(giftItem({ name: '', itemName: '', point: null }).textContent).toBe('🎁 匿名 さんが ギフト');
  });
});
