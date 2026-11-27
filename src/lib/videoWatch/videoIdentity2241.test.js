/** @vitest-environment happy-dom */
/**
 * v0.1.2241: 0.1.2239 の実機確認(Antigravity・2026-11-26・未ログインの別プロファイル)で、
 * 7 ページすべて横の欄が 0 人だった原因を、1 つずつ再現して固定する。
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';
import {
  videoIdentityFromUrl,
  videoPageUrlOfTab,
  videoCardWrapMatchesIdentity,
} from './videoIdentity.js';
import { vodWatchPageFromUrl } from './vodWatchUrl.js';
import { readVodWatchDom } from './vodCommentsFromDom.js';
import { buildVodVideoWatchCardModel, vodVideoWatchCardInnerHtml } from './videoWatchCard.js';
import { nicoVideoIdFromUrl } from '../niconico/nicoVideoWatchMeta.js';
import {
  installViewerBehaviorBoardFromStorage,
  planViewerBehaviorBoardPaint,
  applyVideoWatchRootMark,
  VIDEO_WATCH_ROOT_ATTR,
  VIDEO_WATCH_REREAD_MESSAGE,
  VIEWER_BEHAVIOR_BOARD_EL_ID,
} from '../../extension/viewerBehaviorBoardPaint.js';
import {
  KEY_LAST_WATCH_URL,
  KEY_NICO_VIDEO_WATCH_CARD,
  KEY_VOD_VIDEO_WATCH_CARD,
  KEY_YT_VIDEO_WATCH_CARD,
} from '../storageKeys.js';
import { installYtMergedIsolation, ytMergedStorageKey } from '../youtube/ytMergedIsolation.js';
import { classifyYtWatchContentKind, concurrentViewersIsViewCountLeak, ytVideoCommentAuthorsFromDom } from '../youtube/ytVideoWatchMeta.js';
import { buildYtVideoWatchCardModel } from '../youtube/ytVideoWatchCard.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, 'fixtures');
const YT_FIX = join(HERE, '../youtube/fixtures/real-dom');
const ROOT = join(HERE, '../../..');

/** 0.1.2239 で確認できなかった 7 ページ(実機の URL そのまま) */
const PAGES = [
  { url: 'https://www.youtube.com/watch?v=kKl0E22tU78', service: 'youtube', key: 'kKl0E22tU78' },
  { url: 'https://www.nicovideo.jp/watch/sm9', service: 'niconico', key: 'sm9' },
  { url: 'https://www.twitch.tv/videos/2940252213?t=0h15m0s', service: 'twitch', key: 'twvod:2940252213' },
  { url: 'https://twitcasting.tv/c:yuucho311/movie/843232645', service: 'twitcasting', key: 'tcmov:c:yuucho311/843232645' },
  { url: 'https://kick.com/sirgime/videos/01a20e11-4ea8-7eba-b3ef-a132654bb4bf', service: 'kick', key: 'kkvod:sirgime/01a20e11-4ea8-7eba-b3ef-a132654bb4bf' },
  { url: 'https://abema.tv/video/episode/90-2069_s1_p2', service: 'abema', key: 'abep:90-2069_s1_p2' },
  { url: 'https://www.tiktok.com/@musubisu.jp/video/7703545605435575570', service: 'tiktok', key: 'ttvid:musubisu.jp/7703545605435575570' },
];

/** ライブ配信・一覧のページ(動画の身元を作ってはいけない=ライブの画面は何も変えない) */
const LIVE_URLS = [
  'https://live.nicovideo.jp/watch/lv351841372',
  'https://www.youtube.com/live/SIk45QZsnDM',
  'https://www.youtube.com/@HikakinTV/live',
  'https://www.youtube.com/live_chat?v=SIk45QZsnDM',
  'https://www.twitch.tv/minto_vtuber',
  'https://kick.com/butib',
  'https://kick.com/sirgime/videos',
  'https://twitcasting.tv/c:yuucho311',
  'https://www.tiktok.com/@musubisu.jp/live',
  'https://abema.tv/now-on-air/abema-news',
  'https://www.showroom-live.com/r/tps_ST24989',
  'https://mixch.tv/u/18395689/live',
  'https://whowatch.tv/viewer/12345',
  '',
  'not a url',
];

/** yt-sidepanel.html の前面タブ(ytNicoShim の mapTab が疑似 lv に写し、本物を __ytUrl に残す・0.1.2239 実機の値) */
const YT_SIDEPANEL_TAB = {
  id: 7,
  url: 'https://live.nicovideo.jp/watch/lv927058321372',
  __ytUrl: 'https://www.youtube.com/watch?v=kKl0E22tU78',
};

function fakeStorage(initial = {}) {
  /** @type {Record<string, any>} */
  const data = { ...initial };
  /** @type {Function[]} */
  const listeners = [];
  const get = vi.fn(async (keys) => {
    const out = {};
    for (const k of Array.isArray(keys) ? keys : [keys]) if (k in data) out[k] = data[k];
    return out;
  });
  return {
    data,
    get,
    storage: {
      local: { get },
      onChanged: { addListener: (fn) => listeners.push(fn) },
    },
    set(k, v) {
      data[k] = v;
      for (const fn of listeners) fn({ [k]: { newValue: v } }, 'local');
    },
  };
}

function freshDoc() {
  const win = new Window({ url: 'chrome-extension://ohifblceplfkfajfecaoaclmkiahfflm/yt-sidepanel.html?inline=1&dock=sidepanel' });
  win.document.write('<!DOCTYPE html><html><head></head><body><div id="nlPopupPrimary"><div id="watchConcurrentCard">同時視聴者数</div></div></body></html>');
  return win.document;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function sampleVodCard(page, authors = [{ id: 'tw:minto_vtuber', name: 'みんみん', commentCount: 2 }]) {
  return buildVodVideoWatchCardModel({
    platform: page.platform,
    videoId: page.videoId,
    pageKey: page.pageKey,
    title: 't',
    viewCount: null,
    videoAuthors: authors,
    nowMs: 1,
  });
}

describe('動画の身元は 1 か所で決まる(書く側と探す側が同じ鍵)', () => {
  it.each(PAGES)('$service: $url の身元', ({ url, service, key }) => {
    const id = videoIdentityFromUrl(url);
    expect(id).toEqual(expect.objectContaining({ service, key }));
  });

  it('書く側(視聴ページの入口)が作る鍵と、身元の鍵が一致する', () => {
    for (const p of PAGES) {
      const id = videoIdentityFromUrl(p.url);
      if (p.service === 'youtube') continue; // YouTube のカードは裏方が動画 id(11 文字)で書く
      if (p.service === 'niconico') {
        expect(nicoVideoIdFromUrl(p.url)).toBe(id?.key);
        continue;
      }
      expect(vodWatchPageFromUrl(p.url)?.pageKey).toBe(id?.key);
    }
  });

  it.each(LIVE_URLS)('ライブ・一覧のページ %s は身元なし', (url) => {
    expect(videoIdentityFromUrl(url)).toBeNull();
  });

  it('置き場のサービスが違えば、同じ文字列でも照合しない(YouTube id と sm 番号の取り違え防止)', () => {
    const nicoLike = { service: 'niconico', videoId: 'sm123456789', key: 'sm123456789' };
    expect(videoCardWrapMatchesIdentity({ videoId: 'sm123456789' }, nicoLike, 'youtube')).toBe(false);
    expect(videoCardWrapMatchesIdentity({ videoId: 'sm123456789' }, nicoLike, 'niconico')).toBe(true);
  });

  it('yt-sidepanel の前面タブは本物の URL(__ytUrl)を使う', () => {
    expect(videoPageUrlOfTab(YT_SIDEPANEL_TAB)).toBe('https://www.youtube.com/watch?v=kKl0E22tU78');
    expect(videoPageUrlOfTab({ url: 'https://www.nicovideo.jp/watch/sm9' })).toBe('https://www.nicovideo.jp/watch/sm9');
  });
});

describe('原因1: 横の欄の照合が内部の watch URL(疑似 lv・空)を見ていた', () => {
  const ytWrap = { videoId: 'kKl0E22tU78', at: 1, card: buildYtVideoWatchCardModel({ videoId: 'kKl0E22tU78', videoAuthors: [{ handle: '@KviBaba', name: 'KviBaba' }] }) };
  const nicoWrap = { videoId: 'sm9', at: 1, card: { kind: 'video', platform: 'niconico', ownerId: 'u1', behavior: null } };

  it('再現: 0.1.2239 の道(疑似 lv / ニコ生の最後の lv)では、どのカードも塗られない', () => {
    for (const url of ['https://live.nicovideo.jp/watch/lv927058321372', '', 'https://live.nicovideo.jp/watch/lv351841372']) {
      const plan = planViewerBehaviorBoardPaint({ url, sources: 'video', ytCard: ytWrap, nicoCard: nicoWrap });
      expect(plan.hide).toBe(true);
    }
  });

  it('YouTube: 前面タブ(__ytUrl)を受け取ると、動画のカードを塗り、ページに読み直しを頼む', async () => {
    const doc = freshDoc();
    const s = fakeStorage({ [KEY_YT_VIDEO_WATCH_CARD]: ytWrap, [KEY_LAST_WATCH_URL]: 'https://live.nicovideo.jp/watch/lv927058321372' });
    const sendToTab = vi.fn(() => Promise.resolve());
    const h = installViewerBehaviorBoardFromStorage({
      document: doc,
      storage: s.storage,
      getUrl: () => 'https://live.nicovideo.jp/watch/lv927058321372',
      placement: 'flow',
      sources: 'video',
      sendToTab,
    });
    await flush();
    expect(doc.getElementById(VIEWER_BEHAVIOR_BOARD_EL_ID)).toBeNull(); // 0.1.2239 と同じ=まだ出ない
    h.notePageTab(YT_SIDEPANEL_TAB);
    await flush();
    await flush();
    expect(doc.getElementById(VIEWER_BEHAVIOR_BOARD_EL_ID)).not.toBeNull();
    expect(doc.documentElement.getAttribute(VIDEO_WATCH_ROOT_ATTR)).toBe('1');
    expect(sendToTab).toHaveBeenCalledWith(7, { type: VIDEO_WATCH_REREAD_MESSAGE, key: 'kKl0E22tU78' });
  });

  it('ニコ動 sm9: popup.html?dock=sidepanel は lv しか持たず url が空でも、前面タブ sm9 で 80 人のカードを塗る', async () => {
    const doc = freshDoc();
    const s = fakeStorage({ [KEY_NICO_VIDEO_WATCH_CARD]: nicoWrap });
    const h = installViewerBehaviorBoardFromStorage({ document: doc, storage: s.storage, getUrl: () => '', placement: 'flow', sources: 'video' });
    await flush();
    expect(doc.getElementById(VIEWER_BEHAVIOR_BOARD_EL_ID)).toBeNull();
    h.notePageTab({ id: 3, url: 'https://www.nicovideo.jp/watch/sm9' });
    await flush();
    await flush();
    expect(doc.getElementById(VIEWER_BEHAVIOR_BOARD_EL_ID)).not.toBeNull();
  });

  it.each(PAGES.filter((p) => !['youtube', 'niconico'].includes(p.service)))('$service: 録画カードを前面タブの身元で塗る', async ({ url }) => {
    const page = vodWatchPageFromUrl(url);
    const doc = freshDoc();
    const s = fakeStorage({ [KEY_VOD_VIDEO_WATCH_CARD]: { videoId: page.pageKey, at: 1, card: sampleVodCard(page) } });
    const h = installViewerBehaviorBoardFromStorage({ document: doc, storage: s.storage, getUrl: () => '', placement: 'flow', sources: 'video' });
    h.notePageTab({ id: 1, url });
    await flush();
    await flush();
    expect(doc.getElementById(VIEWER_BEHAVIOR_BOARD_EL_ID)).not.toBeNull();
  });

  it('別の動画のカードが残っていても、前面の動画と違えば塗らない', async () => {
    const doc = freshDoc();
    const other = vodWatchPageFromUrl('https://www.twitch.tv/videos/1111111111');
    const s = fakeStorage({ [KEY_VOD_VIDEO_WATCH_CARD]: { videoId: other.pageKey, at: 1, card: sampleVodCard(other) } });
    const h = installViewerBehaviorBoardFromStorage({ document: doc, storage: s.storage, getUrl: () => '', placement: 'flow', sources: 'video' });
    h.notePageTab({ id: 1, url: 'https://www.twitch.tv/videos/2940252213' });
    await flush();
    await flush();
    expect(doc.getElementById(VIEWER_BEHAVIOR_BOARD_EL_ID)).toBeNull();
  });
});

describe('ライブのページは何も変わらない(回帰)', () => {
  it.each(LIVE_URLS)('%s: 印も読み直しの頼みも塗り直しも起きない', async (url) => {
    const doc = freshDoc();
    const twitch = vodWatchPageFromUrl('https://www.twitch.tv/videos/2940252213');
    const s = fakeStorage({
      [KEY_VOD_VIDEO_WATCH_CARD]: { videoId: twitch.pageKey, at: 1, card: sampleVodCard(twitch) },
      [KEY_NICO_VIDEO_WATCH_CARD]: { videoId: 'sm9', at: 1, card: { kind: 'video', platform: 'niconico' } },
    });
    const sendToTab = vi.fn(() => Promise.resolve());
    const h = installViewerBehaviorBoardFromStorage({ document: doc, storage: s.storage, getUrl: () => url, placement: 'flow', sources: 'video', sendToTab });
    await flush();
    const callsAfterInstall = s.get.mock.calls.length;
    h.notePageTab({ id: 9, url });
    h.notePageTab({ id: 9, url });
    await flush();
    expect(s.get.mock.calls.length).toBe(callsAfterInstall);
    expect(sendToTab).not.toHaveBeenCalled();
    expect(doc.documentElement.hasAttribute(VIDEO_WATCH_ROOT_ATTR)).toBe(false);
    expect(doc.getElementById(VIEWER_BEHAVIOR_BOARD_EL_ID)).toBeNull();
    expect(planViewerBehaviorBoardPaint({ url, sources: 'video', vodCard: s.data[KEY_VOD_VIDEO_WATCH_CARD], nicoCard: s.data[KEY_NICO_VIDEO_WATCH_CARD] }).hide).toBe(true);
  });

  it('動画からライブへ移ると、印を外してライブの数字の枠を戻す', async () => {
    const doc = freshDoc();
    // v0.1.2244: 印は「いまのページ用の動画カードを塗れた」ときだけ付く(カードが無ければ付かない)
    const twitch = vodWatchPageFromUrl('https://www.twitch.tv/videos/2940252213');
    const s = fakeStorage({ [KEY_VOD_VIDEO_WATCH_CARD]: { videoId: twitch.pageKey, at: 1, card: sampleVodCard(twitch) } });
    const h = installViewerBehaviorBoardFromStorage({ document: doc, storage: s.storage, getUrl: () => '', placement: 'flow', sources: 'video' });
    h.notePageTab({ id: 1, url: 'https://www.twitch.tv/videos/2940252213' });
    await flush();
    await flush();
    expect(doc.documentElement.getAttribute(VIDEO_WATCH_ROOT_ATTR)).toBe('1');
    h.notePageTab({ id: 1, url: 'https://www.twitch.tv/minto_vtuber' });
    await flush();
    await flush();
    expect(doc.documentElement.hasAttribute(VIDEO_WATCH_ROOT_ATTR)).toBe(false);
  });
});

describe('原因3/6: 動画ページでは横の欄の同時視聴・来場・経過の枠を隠し、空の状態を作らない', () => {
  it('印で #watchConcurrentCard と数字の並び(コメント 読み込み中 / 経過)を隠す CSS が入る', () => {
    const doc = freshDoc();
    applyVideoWatchRootMark(doc, true);
    const css = [...doc.querySelectorAll('style')].map((s) => s.textContent).join('\n');
    expect(css).toMatch(/html\[data-nl-video-watch="1"\] #watchConcurrentCard/);
    expect(css).toMatch(/\.nl-official-nico-stats__row/);
    applyVideoWatchRootMark(doc, false);
    expect(doc.documentElement.hasAttribute(VIDEO_WATCH_ROOT_ATTR)).toBe(false);
  });

  it.each(['kick', 'abema', 'tiktok'])('%s の未ログイン(コメント DOM なし)は 0 人の空のカード。再生 0 回 や 読み込み中 を作らない', (platform) => {
    const page = vodWatchPageFromUrl(PAGES.find((p) => p.service === platform).url);
    const read = readVodWatchDom(new Window().document, page);
    const card = buildVodVideoWatchCardModel({ platform, pageKey: page.pageKey, title: read.title, viewCount: read.viewCount, videoAuthors: read.authors, nowMs: 1 });
    expect(card.viewCount).toBeNull();
    expect(card.viewCountText).toBe('');
    const html = vodVideoWatchCardInnerHtml(card);
    expect(html).not.toMatch(/0 回/);
    expect(html).not.toMatch(/読み込み中/);
    expect(html).not.toMatch(/同時視聴/);
    expect(html).toMatch(/コメント欄が読み込まれると、ここに書いた人が並びます/);
  });
});

describe('原因2: YouTube 通常動画の再生数が「同時視聴者数」に化けてライブ扱いになる', () => {
  it('再現値: 丸めた再生数 474万(4,740,000) と概要欄の 4,740,759 は同じ数', () => {
    expect(concurrentViewersIsViewCountLeak(4_740_759, 4_740_000)).toBe(true);
    expect(classifyYtWatchContentKind({
      url: 'https://www.youtube.com/watch?v=kKl0E22tU78',
      concurrentViewers: 4_740_759,
      viewCount: 4_740_000,
      isLive: null,
      isLiveContent: null,
      hasLiveChat: false,
      hasLiveChatReplay: false,
    })).toBe('video');
  });

  it('公式が isLiveContent=false なら、同時視聴の欄に数があっても通常動画', () => {
    expect(classifyYtWatchContentKind({ concurrentViewers: 4_740_759, viewCount: null, isLive: null, isLiveContent: false })).toBe('video');
  });

  it('ライブの判定は変わらない', () => {
    expect(classifyYtWatchContentKind({ concurrentViewers: 1234, viewCount: null, isLive: true, isLiveContent: true })).toBe('live');
    expect(classifyYtWatchContentKind({ concurrentViewers: 1234, viewCount: null, isLive: null, isLiveContent: null })).toBe('live');
    expect(classifyYtWatchContentKind({ concurrentViewers: 87, viewCount: null, isLive: null, isLiveContent: true, hasLiveChat: true })).toBe('live');
    expect(classifyYtWatchContentKind({ hasLiveChatReplay: true, concurrentViewers: null, viewCount: 100 })).toBe('live_replay');
  });

  it('丸めでない数・桁の外の数は同じ数とみなさない', () => {
    expect(concurrentViewersIsViewCountLeak(12_346, 12_345)).toBe(false);
    expect(concurrentViewersIsViewCountLeak(4_739_999, 4_740_000)).toBe(false);
    expect(concurrentViewersIsViewCountLeak(4_750_000, 4_740_000)).toBe(false);
    expect(concurrentViewersIsViewCountLeak(1234, null)).toBe(false);
    expect(concurrentViewersIsViewCountLeak(500, 500)).toBe(true);
  });

  it('未ログインの実測コメント(投稿者は /@名前 だけ)を「匿名」にまとめず一人ずつ並べる', () => {
    const win = new Window({ url: 'https://www.youtube.com/watch?v=kKl0E22tU78' });
    win.document.write(`<!DOCTYPE html><html><body>${readFileSync(join(YT_FIX, 'kKl0E22tU78-thread-kvibaba.slim.html'), 'utf8')}${readFileSync(join(YT_FIX, 'kKl0E22tU78-thread-pinned-hikakin.slim.html'), 'utf8')}</body></html>`);
    const authors = ytVideoCommentAuthorsFromDom(win.document);
    expect(authors.length).toBeGreaterThanOrEqual(2);
    expect(authors.every((a) => !a.channelId && a.handle)).toBe(true);
    const card = buildYtVideoWatchCardModel({ videoId: 'kKl0E22tU78', videoAuthors: authors, nowMs: 1 });
    const rows = card.behavior.rows;
    expect(rows.filter((r) => !r.isAnonymous).length).toBe(authors.length);
    expect(rows.some((r) => r.isAnonymous)).toBe(false);
  });
});

describe('原因5: ツイキャス録画のカードが「ytm:」付きのキーに書かれ、横の欄から見えなかった', () => {
  /** ytMergedIsolation を入れた世界と入れていない世界が、同じ chrome.storage.local を共有する */
  function twoWorlds() {
    /** @type {Record<string, any>} */
    const raw = {};
    const mkArea = () => ({
      get: async (keys) => {
        const out = {};
        const list = keys == null ? Object.keys(raw) : Array.isArray(keys) ? keys : [keys];
        for (const k of list) if (k in raw) out[k] = raw[k];
        return out;
      },
      set: async (items) => {
        Object.assign(raw, items);
      },
      remove: async () => {},
      onChanged: { addListener: () => {} },
    });
    const isolated = { runtime: { getURL: (p) => p, sendMessage: () => Promise.resolve() }, storage: { local: mkArea(), onChanged: { addListener: () => {} } } };
    installYtMergedIsolation({ chrome: isolated, indexedDB: undefined });
    const plain = { storage: { local: mkArea() } };
    return { raw, isolated, plain };
  }

  it('動画カードの置き場は仕切りを素通しする(ライブの記録・設定のキーは今までどおり ytm: 付き)', () => {
    expect(ytMergedStorageKey(KEY_VOD_VIDEO_WATCH_CARD)).toBe(KEY_VOD_VIDEO_WATCH_CARD);
    expect(ytMergedStorageKey(KEY_NICO_VIDEO_WATCH_CARD)).toBe(KEY_NICO_VIDEO_WATCH_CARD);
    expect(ytMergedStorageKey(KEY_YT_VIDEO_WATCH_CARD)).toBe(KEY_YT_VIDEO_WATCH_CARD);
    expect(ytMergedStorageKey(KEY_LAST_WATCH_URL)).toBe(`ytm:${KEY_LAST_WATCH_URL}`);
    expect(ytMergedStorageKey('nls_comments_lv123')).toBe('ytm:nls_comments_lv123');
  });

  it('仕切りの内(ツイキャスの yt-venue-inline・後から入る Twitch の記録係)で書いても、外(popup.html)と内(yt-sidepanel)の両方から同じカードが見える', async () => {
    const w = twoWorlds();
    const html = readFileSync(join(FIX, 'twitcasting-movie-843232645-comment-items.slim.html'), 'utf8');
    const win = new Window({ url: 'https://twitcasting.tv/c:yuucho311/movie/843232645' });
    win.document.write(`<!DOCTYPE html><html><body>${html}</body></html>`);
    const page = vodWatchPageFromUrl('https://twitcasting.tv/c:yuucho311/movie/843232645');
    const read = readVodWatchDom(win.document, page);
    expect(read.authors.length).toBeGreaterThan(0);
    const card = buildVodVideoWatchCardModel({ platform: page.platform, pageKey: page.pageKey, title: read.title, viewCount: read.viewCount, videoAuthors: read.authors, nowMs: 1 });
    await w.isolated.storage.local.set({ [KEY_VOD_VIDEO_WATCH_CARD]: { videoId: page.pageKey, at: 1, card } });
    expect(Object.keys(w.raw)).toEqual([KEY_VOD_VIDEO_WATCH_CARD]);
    const fromPlain = await w.plain.storage.local.get([KEY_VOD_VIDEO_WATCH_CARD]);
    const fromIsolated = await w.isolated.storage.local.get([KEY_VOD_VIDEO_WATCH_CARD]);
    expect(fromPlain[KEY_VOD_VIDEO_WATCH_CARD]?.card?.videoAuthorCount).toBe(read.authors.length);
    expect(fromIsolated[KEY_VOD_VIDEO_WATCH_CARD]?.card?.videoAuthorCount).toBe(read.authors.length);
    const plan = planViewerBehaviorBoardPaint({ url: 'https://twitcasting.tv/c:yuucho311/movie/843232645', sources: 'video', vodCard: fromIsolated[KEY_VOD_VIDEO_WATCH_CARD] });
    expect(plan.hide).toBe(false);
  });
});

describe('原因4: Twitch 録画は document_idle に 0 人で書いたあと更新されなかった', () => {
  it('実測の再生チャット DOM が後から描かれれば、読み直しで人が出る(初回 0 人 → 読み直し 1 人)', () => {
    const page = vodWatchPageFromUrl('https://www.twitch.tv/videos/2940252213?t=0h15m0s');
    const before = readVodWatchDom(new Window().document, page);
    expect(before.authors).toHaveLength(0);
    const win = new Window({ url: page.href });
    win.document.write(`<!DOCTYPE html><html><body>${readFileSync(join(FIX, 'twitch-vod-2940252213-replay-chat.slim.html'), 'utf8')}</body></html>`);
    const after = readVodWatchDom(win.document, page);
    expect(after.authors.length).toBeGreaterThan(0);
  });

  it.each(['src/extension/vod-video-watch-entry.js', 'src/extension/nico-video-watch-entry.js'])(
    '%s は横の欄の「読み直して」の合図で読み直す。新しい Observer・タイマー・通信は使わない',
    (rel) => {
      const src = readFileSync(join(ROOT, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(src).toMatch(/NLS_VIDEO_WATCH_REREAD/);
      expect(src).toMatch(/chrome\.runtime\.onMessage\.addListener/);
      expect(src).not.toMatch(/MutationObserver|setInterval|setTimeout|requestAnimationFrame|fetch\(|XMLHttpRequest/);
    },
  );

  it('横の欄の読み直しの頼みは既存の refresh() に乗せるだけ(新しいタイマーを足さない)', () => {
    const src = readFileSync(join(ROOT, 'src/extension/viewerBehaviorBoardPaint.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/MutationObserver|setInterval|setTimeout|fetch\(|XMLHttpRequest/);
    const popup = readFileSync(join(ROOT, 'src/extension/popup-entry.js'), 'utf8');
    // v0.1.2263: ツールバーのポップアップでも動画ページの照合をする(ページに埋め込んだ枠は除く)
    expect(popup).toMatch(/if \(INLINE_SIDE_PANEL \|\| !INLINE_MODE\) noteVideoPageTabForSidePanel\(tabs\[0\] \|\| null\)/);
  });
});

describe('ニコ動の視聴ページの右下にカードを浮かせない(横の欄だけ)', () => {
  it('nico-video-watch-entry はページにカードを足さず、前の版が残した枠を消す', () => {
    const src = readFileSync(join(ROOT, 'src/extension/nico-video-watch-entry.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/appendChild\(/);
    expect(src).not.toMatch(/position:fixed/);
    expect(src).toMatch(/getElementById\(CARD_ID\)\?\.remove\(\)/);
  });
});
