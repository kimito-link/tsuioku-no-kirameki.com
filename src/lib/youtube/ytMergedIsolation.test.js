import { describe, it, expect, vi } from 'vitest';
import {
  installYtMergedIsolation,
  ytMergedStorageKey,
  ytMergedVisibleKey,
  ytMergedPagePath,
  ytMergedOutgoingMessage,
  ytMergedIdbName,
} from './ytMergedIsolation.js';

function fakeChrome() {
  /** @type {Record<string, any>} */
  const store = {};
  /** @type {Function[]} */
  const changeFns = [];
  const local = {
    get: vi.fn(async (keys) => {
      if (keys == null) return { ...store };
      const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      /** @type {Record<string, any>} */
      const out = {};
      for (const k of list) if (k in store) out[k] = store[k];
      return out;
    }),
    set: vi.fn(async (items) => {
      Object.assign(store, items);
    }),
    remove: vi.fn(async (keys) => {
      for (const k of typeof keys === 'string' ? [keys] : keys) delete store[k];
    }),
  };
  const sent = [];
  const chrome = {
    storage: { local, onChanged: { addListener: (fn) => changeFns.push(fn), removeListener: (fn) => changeFns.splice(changeFns.indexOf(fn), 1) } },
    runtime: {
      id: 'x',
      getURL: (p) => `chrome-extension://x/${String(p).replace(/^\//, '')}`,
      sendMessage: vi.fn(async (m) => {
        sent.push(m);
        return { ok: true };
      }),
    },
  };
  return { chrome, store, changeFns, sent };
}

describe('ytMergedIsolation の決まり', () => {
  it('YouTube の記録(yt_…)以外は ytm: 付きのキーへ', () => {
    expect(ytMergedStorageKey('yt_stream_summaries')).toBe('yt_stream_summaries');
    expect(ytMergedStorageKey('nls_voice_settings')).toBe('ytm:nls_voice_settings');
    expect(ytMergedStorageKey('ytm:nls_x')).toBe('ytm:nls_x');
    expect(ytMergedVisibleKey('ytm:nls_x')).toBe('nls_x');
    expect(ytMergedVisibleKey('yt_a')).toBe('yt_a');
    expect(ytMergedVisibleKey('nls_x')).toBe(null); // ニコ生版のキーは見せない
  });
  it('画面の名前だけ YouTube 版の写しへ(画像・音・ほかの画面はそのまま)', () => {
    expect(ytMergedPagePath('comeview.html?lv=lv912345678901')).toBe('yt-comeview.html?lv=lv912345678901');
    expect(ytMergedPagePath('/venue.html')).toBe('/yt-venue.html');
    expect(ytMergedPagePath('marketing-export.html*')).toBe('yt-marketing-export.html*');
    expect(ytMergedPagePath('sidepanel.html')).toBe('yt-sidepanel.html');
    expect(ytMergedPagePath('images/logo/a.png')).toBe('images/logo/a.png');
    expect(ytMergedPagePath('status.html')).toBe('status.html');
    expect(ytMergedPagePath('dist/avatar-face-worker.js')).toBe('dist/avatar-face-worker.js');
  });
  it('裏方への頼みは YouTube 版が答えていたものだけ通す', () => {
    expect(ytMergedOutgoingMessage({ type: 'YT_CHAT_ITEMS' })).toEqual({ type: 'YT_CHAT_ITEMS' });
    expect(ytMergedOutgoingMessage({ type: 'NLS_OPEN_COMEVIEW', liveId: 'lv9' })).toEqual({ type: 'YT_OPEN_COMEVIEW', liveId: 'lv9' });
    expect(ytMergedOutgoingMessage({ type: 'NLS_OPEN_VENUE' })).toEqual({ type: 'YT_OPEN_VENUE' });
    expect(ytMergedOutgoingMessage({ type: 'NLS_FETCH_PROXY', url: 'u' })?.type).toBe('NLS_FETCH_PROXY');
    // 会場の遅延読み込みと計器は、仕切りの付いた配信ページ(Twitch・Kick 等)からも裏方へ届く
    expect(ytMergedOutgoingMessage({ type: 'NLS_BOOT_ENGINE', file: 'dist/yt-venue-inline.js' })?.type).toBe('NLS_BOOT_ENGINE');
    expect(ytMergedOutgoingMessage({ type: 'NLS_STALL_SUMMARY' })?.type).toBe('NLS_STALL_SUMMARY');
    expect(ytMergedOutgoingMessage({ type: 'NLS_FETCH_PROXY_ABORT', id: '1' })?.type).toBe('NLS_FETCH_PROXY_ABORT');
    expect(ytMergedOutgoingMessage({ type: 'NLS_VOICE_READER_CLAIM' })?.type).toBe('NLS_VOICE_READER_CLAIM');
    // ニコ生版の記録・取得はさせない(疑似の配信番号で本体の記録を汚す)
    expect(ytMergedOutgoingMessage({ type: 'NLS_CDB_APPEND' })).toBe(null);
    expect(ytMergedOutgoingMessage({ type: 'NLS_KOKEN_CONTRIB_FETCH' })).toBe(null);
    expect(ytMergedOutgoingMessage({ type: 'NLS_OPEN_SIDE_PANEL' })).toBe(null);
    expect(ytMergedOutgoingMessage(null)).toBe(null);
  });
  it('IndexedDB は YouTube の記録以外 ytm: 付き', () => {
    expect(ytMergedIdbName('yt_kirameki_db')).toBe('yt_kirameki_db');
    expect(ytMergedIdbName('nls_comment_db')).toBe('ytm:nls_comment_db');
  });
});

describe('installYtMergedIsolation', () => {
  it('保存はニコ生版と混ざらない(書き・読み・全部読み)', async () => {
    const { chrome, store } = fakeChrome();
    store.nls_voice_settings = { nico: true };
    store.yt_stream_summaries = { a: 1 };
    installYtMergedIsolation({ chrome });
    expect(await chrome.storage.local.get('nls_voice_settings')).toEqual({});
    await chrome.storage.local.set({ nls_voice_settings: { yt: true }, yt_x: 2 });
    expect(store.nls_voice_settings).toEqual({ nico: true });
    expect(store['ytm:nls_voice_settings']).toEqual({ yt: true });
    expect(store.yt_x).toBe(2);
    expect(await chrome.storage.local.get(['nls_voice_settings', 'yt_stream_summaries'])).toEqual({
      nls_voice_settings: { yt: true },
      yt_stream_summaries: { a: 1 },
    });
    const all = await chrome.storage.local.get(null);
    expect(all).toEqual({ nls_voice_settings: { yt: true }, yt_stream_summaries: { a: 1 }, yt_x: 2 });
    // callback の形
    const got = await new Promise((r) => chrome.storage.local.get('nls_voice_settings', r));
    expect(got).toEqual({ nls_voice_settings: { yt: true } });
    // 全部消す = YouTube 版の分だけ
    await chrome.storage.local.clear();
    expect(store).toEqual({ nls_voice_settings: { nico: true } });
  });
  it('変化の知らせはニコ生版のキーを落とし、ytm: を外して渡す', () => {
    const { chrome, changeFns } = fakeChrome();
    installYtMergedIsolation({ chrome });
    const fn = vi.fn();
    chrome.storage.onChanged.addListener(fn);
    changeFns[0]({ nls_comments_lv1: { newValue: [] } }, 'local');
    expect(fn).not.toHaveBeenCalled();
    changeFns[0]({ 'ytm:nls_a': { newValue: 1 }, yt_b: { newValue: 2 }, nls_c: { newValue: 3 } }, 'local');
    expect(fn).toHaveBeenCalledWith({ nls_a: { newValue: 1 }, yt_b: { newValue: 2 } }, 'local');
    changeFns[0]({ k: { newValue: 1 } }, 'session');
    expect(fn).toHaveBeenLastCalledWith({ k: { newValue: 1 } }, 'session');
    chrome.storage.onChanged.removeListener(fn);
    expect(changeFns.length).toBe(0);
  });
  it('画面の名前と裏方への頼みを直す・送らないものは返事なし', async () => {
    const { chrome, sent } = fakeChrome();
    installYtMergedIsolation({ chrome });
    expect(chrome.runtime.getURL('comeview.html')).toBe('chrome-extension://x/yt-comeview.html');
    expect(chrome.runtime.getURL('images/a.png')).toBe('chrome-extension://x/images/a.png');
    expect(await chrome.runtime.sendMessage({ type: 'NLS_OPEN_VENUE', liveId: 'lv9' })).toEqual({ ok: true });
    expect(await chrome.runtime.sendMessage({ type: 'NLS_CDB_APPEND' })).toBe(undefined);
    const cbVal = await new Promise((r) => chrome.runtime.sendMessage({ type: 'NLS_NEXT_LIVE_REQUEST' }, r));
    expect(cbVal).toBe(undefined);
    expect(sent).toEqual([{ type: 'YT_OPEN_VENUE', liveId: 'lv9' }]);
  });
  it('2回呼んでも1回だけ仕切る', () => {
    const { chrome } = fakeChrome();
    expect(installYtMergedIsolation({ chrome })).toBe(true);
    expect(installYtMergedIsolation({ chrome })).toBe(false);
    expect(chrome.runtime.getURL('venue.html')).toBe('chrome-extension://x/yt-venue.html');
  });
  it('IndexedDB の名前を仕切る', () => {
    const open = vi.fn();
    const idb = { open };
    installYtMergedIsolation({ chrome: fakeChrome().chrome, indexedDB: idb });
    idb.open('nls_thumbs', 2);
    idb.open('yt_kirameki_db', 1);
    expect(open.mock.calls).toEqual([['ytm:nls_thumbs', 2], ['yt_kirameki_db', 1]]);
  });
});

describe('ytMergedIsolation: サポーターのキーは共有(v0.1.1893 課金)', () => {
  it('nls_supporter_ はそのまま通す=ニコ生版で入れたコードが YouTube 版のマーケ HTML でも使える', async () => {
    const { ytMergedStorageKey, ytMergedVisibleKey, YT_MERGED_SHARED_KEY_PREFIXES } = await import('./ytMergedIsolation.js');
    const { KEY_SUPPORTER_CODE, SUPPORTER_SHARED_KEY_PREFIX } = await import('../supporterAccess.js');
    expect(YT_MERGED_SHARED_KEY_PREFIXES).toContain(SUPPORTER_SHARED_KEY_PREFIX);
    expect(ytMergedStorageKey(KEY_SUPPORTER_CODE)).toBe(KEY_SUPPORTER_CODE);
    expect(ytMergedVisibleKey(KEY_SUPPORTER_CODE)).toBe(KEY_SUPPORTER_CODE);
    expect(ytMergedStorageKey('nls_other')).toBe('ytm:nls_other');
  });
});
