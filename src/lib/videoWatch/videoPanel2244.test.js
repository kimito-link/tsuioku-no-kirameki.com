// v0.1.2244: 実機の横の欄(chrome.sidePanel・1回開いたまま同じタブでページを移る)で 0.1.2241 が 0 人だった原因の再現と固定。
//   0.1.2241 の箱の検証は横の欄を【タブとして】開いていたので、次の 3 つが再現しなかった:
//   ① 横の欄の定期の見回りが refresh() まで進まず(描き直しの間引き)、前面タブが照合に渡らない → タブの既存の知らせで受け取る
//   ② 外枠は配信キーが変わるときだけ中身を付け替える → 録画・ニコ動では前のサービスの中身が残る(TikTok で「ABEMA の放送…」)
//   ③ YouTube のライブも /watch?v= なので、URL だけで「動画」の印を付けるとライブの同時視聴者数まで隠していた
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';
import { videoPanelSrcForTab } from './videoPanelRoute.js';
import { vodWatchPageFromUrl } from './vodWatchUrl.js';
import { buildVodVideoWatchCardModel } from './videoWatchCard.js';
import { buildYtVideoWatchCardModel } from '../youtube/ytVideoWatchCard.js';
import {
  installViewerBehaviorBoardFromStorage,
  pulseVideoPageTabForSidePanel,
  VIDEO_WATCH_ROOT_ATTR,
  VIDEO_WATCH_REREAD_MESSAGE,
  VIEWER_BEHAVIOR_BOARD_EL_ID,
} from '../../extension/viewerBehaviorBoardPaint.js';
import { KEY_NICO_VIDEO_WATCH_CARD, KEY_VOD_VIDEO_WATCH_CARD, KEY_YT_VIDEO_WATCH_CARD } from '../storageKeys.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const NICO_BASE = 'popup.html?inline=1&dock=sidepanel';
const flush = async () => { for (let i = 0; i < 4; i += 1) await new Promise((r) => setTimeout(r, 0)); };

function fakeStorage(initial = {}) {
  const data = { ...initial };
  const listeners = [];
  return {
    data,
    storage: {
      local: { get: vi.fn(async (keys) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter((k) => k in data).map((k) => [k, data[k]]))) },
      onChanged: { addListener: (fn) => listeners.push(fn) },
    },
    set(k, v) { data[k] = v; for (const fn of listeners) fn({ [k]: { newValue: v } }, 'local'); },
  };
}

/** chrome.tabs の知らせ(onActivated / onUpdated)を手で鳴らせる偽物。query は「開いた瞬間の前面タブ」を返す */
function fakeTabs(initialActive) {
  const act = [];
  const upd = [];
  const byId = new Map();
  if (initialActive) byId.set(initialActive.id, initialActive);
  return {
    api: {
      query: vi.fn(async () => (initialActive ? [initialActive] : [])),
      get: vi.fn(async (id) => byId.get(id)),
      onActivated: { addListener: (fn) => act.push(fn) },
      onUpdated: { addListener: (fn) => upd.push(fn) },
    },
    windows: { getCurrent: async () => ({ id: 1 }) },
    navigate(tab) { byId.set(tab.id, tab); for (const fn of upd) fn(tab.id, { url: tab.url }, tab); },
    activate(tab) { byId.set(tab.id, tab); for (const fn of act) fn({ tabId: tab.id, windowId: tab.windowId }); },
  };
}

function freshDoc() {
  const win = new Window({ url: 'chrome-extension://x/yt-sidepanel.html?inline=1&dock=sidepanel' });
  win.document.write('<!DOCTYPE html><html><head></head><body><div id="nlPopupPrimary"><div id="watchConcurrentCard">同時視聴者数 782</div></div></body></html>');
  return win.document;
}

const vodWrap = (url, n = 2) => {
  const page = vodWatchPageFromUrl(url);
  const authors = Array.from({ length: n }, (_, i) => ({ id: `u${i}`, name: `人${i}`, commentCount: 1 }));
  return { videoId: page.pageKey, at: 1, card: buildVodVideoWatchCardModel({ platform: page.platform, videoId: page.videoId, pageKey: page.pageKey, title: 't', viewCount: null, videoAuthors: authors, nowMs: 1 }) };
};
const ytWrap = { videoId: 'kKl0E22tU78', at: 1, card: buildYtVideoWatchCardModel({ videoId: 'kKl0E22tU78', videoAuthors: [{ handle: '@mochiomochi-h2j', name: '@mochiomochi-h2j' }] }) };

const TW_VOD = 'https://www.twitch.tv/videos/2940252213?t=0h15m0s';
const TIKTOK = 'https://www.tiktok.com/@musubisu.jp/video/7703545605435575570';

describe('① 横の欄を開いたまま同じタブでページを移っても、refresh() に頼らず前面タブで塗る', () => {
  it('再現(0.1.2241): refresh() からの受け取りが無いと、ページを移っても動画カードは出ない', async () => {
    const doc = freshDoc();
    const s = fakeStorage({ [KEY_VOD_VIDEO_WATCH_CARD]: vodWrap(TW_VOD, 18) });
    installViewerBehaviorBoardFromStorage({ document: doc, storage: s.storage, getUrl: () => '', placement: 'flow', sources: 'video' });
    await flush();
    expect(doc.getElementById(VIEWER_BEHAVIOR_BOARD_EL_ID)).toBeNull();
  });

  it('YouTube 動画 → Twitch 録画 → TikTok と同じタブで移ると、そのつど塗り直す(タブの知らせだけで)', async () => {
    const doc = freshDoc();
    const ytTab = { id: 5, windowId: 1, active: true, url: 'https://live.nicovideo.jp/watch/lv927058321372', __ytUrl: 'https://www.youtube.com/watch?v=kKl0E22tU78' };
    const t = fakeTabs(ytTab);
    const s = fakeStorage({ [KEY_YT_VIDEO_WATCH_CARD]: ytWrap, [KEY_VOD_VIDEO_WATCH_CARD]: vodWrap(TW_VOD, 18) });
    const sendToTab = vi.fn(() => Promise.resolve());
    installViewerBehaviorBoardFromStorage({ document: doc, storage: s.storage, getUrl: () => '', placement: 'flow', sources: 'video', sendToTab, tabs: t.api, windows: t.windows });
    await flush();
    expect(doc.getElementById(VIEWER_BEHAVIOR_BOARD_EL_ID)?.innerHTML).toContain('data-video-id="kKl0E22tU78"');
    t.navigate({ id: 5, windowId: 1, active: true, url: TW_VOD });
    await flush();
    expect(doc.getElementById(VIEWER_BEHAVIOR_BOARD_EL_ID)?.innerHTML).toContain('data-video-id="twvod:2940252213"');
    expect(sendToTab).toHaveBeenLastCalledWith(5, { type: VIDEO_WATCH_REREAD_MESSAGE, key: 'twvod:2940252213' });
    s.set(KEY_VOD_VIDEO_WATCH_CARD, vodWrap(TIKTOK, 0));
    t.navigate({ id: 5, windowId: 1, active: true, url: TIKTOK });
    await flush();
    const board = doc.getElementById(VIEWER_BEHAVIOR_BOARD_EL_ID);
    expect(board).not.toBeNull();
    expect(board?.innerHTML).toContain('data-video-id="ttvid:musubisu.jp/7703545605435575570"');
    expect(board?.innerHTML).not.toContain('twvod:2940252213');
  });

  it('v0.1.2263: YouTube はカードがまだ無くても、ページが「動画」と決めたまとめで動画の形にする。ライブのまとめなら付けない', async () => {
    const doc = freshDoc();
    const tab = { id: 5, windowId: 1, active: true, url: 'https://www.youtube.com/watch?v=kKl0E22tU78' };
    const t = fakeTabs(tab);
    const s = fakeStorage({ 'ytm:sum:v1:kKl0E22tU78': { videoId: 'kKl0E22tU78', contentKind: 'video' } });
    installViewerBehaviorBoardFromStorage({ document: doc, storage: s.storage, getUrl: () => '', placement: 'flow', sources: 'video', tabs: t.api, windows: t.windows });
    await flush();
    expect(doc.documentElement.getAttribute(VIDEO_WATCH_ROOT_ATTR)).toBe('1');
    const doc2 = freshDoc();
    const t2 = fakeTabs({ id: 6, windowId: 1, active: true, url: 'https://www.youtube.com/watch?v=LIVE0000000' });
    const s2 = fakeStorage({ 'ytm:sum:v1:LIVE0000000': { videoId: 'LIVE0000000', contentKind: 'live' } });
    installViewerBehaviorBoardFromStorage({ document: doc2, storage: s2.storage, getUrl: () => '', placement: 'flow', sources: 'video', tabs: t2.api, windows: t2.windows });
    await flush();
    expect(doc2.documentElement.getAttribute(VIDEO_WATCH_ROOT_ATTR)).toBeNull();
  });

  it('タブを切り替えたとき(onActivated)も、その前面タブで塗る。別のウィンドウのタブは見ない', async () => {
    const doc = freshDoc();
    const t = fakeTabs(null);
    const s = fakeStorage({ [KEY_NICO_VIDEO_WATCH_CARD]: { videoId: 'sm9', at: 1, card: { kind: 'video', platform: 'niconico', behavior: null } } });
    installViewerBehaviorBoardFromStorage({ document: doc, storage: s.storage, getUrl: () => '', placement: 'flow', sources: 'video', tabs: t.api, windows: t.windows });
    await flush();
    t.activate({ id: 8, windowId: 2, active: true, url: 'https://www.nicovideo.jp/watch/sm9' });
    await flush();
    expect(doc.getElementById(VIEWER_BEHAVIOR_BOARD_EL_ID)).toBeNull();
    t.activate({ id: 9, windowId: 1, active: true, url: 'https://www.nicovideo.jp/watch/sm9' });
    await flush();
    expect(doc.getElementById(VIEWER_BEHAVIOR_BOARD_EL_ID)).not.toBeNull();
  });

  it('既存の見回りの合図(pulse)は、動画ページのときだけ読み直しを頼む。ライブでは何も送らない', async () => {
    const doc = freshDoc();
    const t = fakeTabs({ id: 5, windowId: 1, active: true, url: 'https://www.twitch.tv/sasatikk' });
    const s = fakeStorage({ [KEY_VOD_VIDEO_WATCH_CARD]: vodWrap(TW_VOD, 3) });
    const sendToTab = vi.fn(() => Promise.resolve());
    installViewerBehaviorBoardFromStorage({ document: doc, storage: s.storage, getUrl: () => '', placement: 'flow', sources: 'video', sendToTab, tabs: t.api, windows: t.windows });
    await flush();
    pulseVideoPageTabForSidePanel();
    expect(sendToTab).not.toHaveBeenCalled();
    t.navigate({ id: 5, windowId: 1, active: true, url: TW_VOD });
    await flush();
    sendToTab.mockClear();
    pulseVideoPageTabForSidePanel();
    pulseVideoPageTabForSidePanel();
    expect(sendToTab).toHaveBeenCalledTimes(2);
    expect(sendToTab).toHaveBeenCalledWith(5, { type: VIDEO_WATCH_REREAD_MESSAGE, key: 'twvod:2940252213' });
    t.navigate({ id: 5, windowId: 1, active: true, url: 'https://www.twitch.tv/sasatikk' });
    await flush();
    sendToTab.mockClear();
    pulseVideoPageTabForSidePanel();
    expect(sendToTab).not.toHaveBeenCalled();
  });
});

describe('③ YouTube のライブ(/watch?v=)では、横の欄の同時視聴者数を隠さない(0.1.2241 の実機の後退)', () => {
  it('再現値: ライブ zMoUaCkot9w を前面にしても、動画カードが無いので印は付かない', async () => {
    const doc = freshDoc();
    const live = { id: 5, windowId: 1, active: true, url: 'https://live.nicovideo.jp/watch/lv964290072750', __ytUrl: 'https://www.youtube.com/watch?v=zMoUaCkot9w' };
    const t = fakeTabs(live);
    // 直前に見た通常動画のカードが残っている(実機の storage そのまま)
    const s = fakeStorage({ [KEY_YT_VIDEO_WATCH_CARD]: ytWrap });
    installViewerBehaviorBoardFromStorage({ document: doc, storage: s.storage, getUrl: () => '', placement: 'flow', sources: 'video', tabs: t.api, windows: t.windows });
    await flush();
    expect(doc.documentElement.hasAttribute(VIDEO_WATCH_ROOT_ATTR)).toBe(false);
    expect(doc.getElementById(VIEWER_BEHAVIOR_BOARD_EL_ID)).toBeNull();
  });

  it('通常動画(カードあり)→ ライブへ移ると印が外れる', async () => {
    const doc = freshDoc();
    const t = fakeTabs({ id: 5, windowId: 1, active: true, url: 'x', __ytUrl: 'https://www.youtube.com/watch?v=kKl0E22tU78' });
    const s = fakeStorage({ [KEY_YT_VIDEO_WATCH_CARD]: ytWrap });
    installViewerBehaviorBoardFromStorage({ document: doc, storage: s.storage, getUrl: () => '', placement: 'flow', sources: 'video', tabs: t.api, windows: t.windows });
    await flush();
    expect(doc.documentElement.getAttribute(VIDEO_WATCH_ROOT_ATTR)).toBe('1');
    t.navigate({ id: 5, windowId: 1, active: true, url: 'x', __ytUrl: 'https://www.youtube.com/watch?v=zMoUaCkot9w' });
    await flush();
    expect(doc.documentElement.hasAttribute(VIDEO_WATCH_ROOT_ATTR)).toBe(false);
  });
});

describe('② 録画・ニコ動へ移ったら、外枠はそのサービスの中身に付け替える(ライブ・トップは今までどおり)', () => {
  const ytSrc = (q) => `yt-sidepanel.html?inline=1&dock=sidepanel${q}`;
  it.each([
    // 実機: ABEMA → TikTok で「ABEMA の放送を開いて…」が残っていた
    [TIKTOK, ytSrc('&site=abema'), ytSrc('&site=tiktok')],
    // 実機: YouTube 動画 → Twitch 録画で「YouTube には…」が残っていた
    [TW_VOD, ytSrc('&stream=yt%3AkKl0E22tU78&site=youtube'), ytSrc('&site=twitch')],
    ['https://kick.com/sirgime/videos/01a20e11-4ea8-7eba-b3ef-a132654bb4bf', NICO_BASE, ytSrc('&site=kick')],
    ['https://abema.tv/video/episode/90-2069_s1_p2', ytSrc('&site=twitch'), ytSrc('&site=abema')],
    ['https://twitcasting.tv/c:yuucho311/movie/843232645', ytSrc('&site=kick'), ytSrc('&site=twitcasting')],
    // 実機: YouTube → ニコ動 sm9 で YouTube 版のまま
    ['https://www.nicovideo.jp/watch/sm9', ytSrc('&stream=yt%3AkKl0E22tU78&site=youtube'), NICO_BASE],
  ])('%s(今 %s)→ %s', (url, cur, want) => {
    expect(videoPanelSrcForTab(url, cur, NICO_BASE)).toBe(want);
  });

  it.each([
    // ライブ・トップ・YouTube(配信キーで今までどおり)は付け替えない
    ['https://www.twitch.tv/sasatikk', ytSrc('&stream=twitch%3Asasatikk&site=twitch')],
    ['https://www.youtube.com/watch?v=zMoUaCkot9w', ytSrc('&site=twitch')],
    ['https://www.youtube.com/watch?v=kKl0E22tU78', NICO_BASE],
    ['https://live.nicovideo.jp/watch/lv351841372', ytSrc('&site=youtube')],
    ['https://www.tiktok.com/', ytSrc('&site=abema')],
    ['https://abema.tv/now-on-air/abema-news', ytSrc('&site=abema')],
    // 同じサービスの中身を見せているなら保つ(ライブの配信を見せていても作り直さない)
    [TW_VOD, ytSrc('&stream=twitch%3Asasatikk&site=twitch')],
    // ニコ生の配信を見せているならニコ動でも保つ
    ['https://www.nicovideo.jp/watch/sm9', `${NICO_BASE}&lv=lv351841372`],
  ])('%s(今 %s)は付け替えない', (url, cur) => {
    expect(videoPanelSrcForTab(url, cur, NICO_BASE)).toBeNull();
  });

  it('外枠は追従の最初にこの関数を使い、ライブの判定(配信キー)はそのまま残す', () => {
    const src = readFileSync(join(ROOT, 'src/extension/sidepanel-iframe-boot-entry.js'), 'utf8');
    expect(src).toContain('nextSidepanelIframeSrc');
    const lib = readFileSync(join(ROOT, 'src/lib/sidepanelIframeSrc.js'), 'utf8');
    expect(lib).toMatch(/videoPanelSrcForTab\(tabUrl, currentSrc, nicoBase\)/);
    expect(lib).toMatch(/k && k !== readYtPanelStreamKey\(currentSrc\)/);
  });
});

describe('仕組みは足さない(タイマー・Observer・通信なし)', () => {
  it('前面タブは既存の chrome.tabs の知らせ、読み直しは既存の見回りの先頭で頼むだけ', () => {
    const board = readFileSync(join(ROOT, 'src/extension/viewerBehaviorBoardPaint.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(board).not.toMatch(/MutationObserver|setInterval|setTimeout|fetch\(|XMLHttpRequest/);
    const route = readFileSync(join(ROOT, 'src/lib/videoWatch/videoPanelRoute.js'), 'utf8');
    expect(route).not.toMatch(/chrome\.|setInterval|setTimeout|fetch\(/);
    const popup = readFileSync(join(ROOT, 'src/extension/popup-entry.js'), 'utf8');
    const tick = popup.slice(popup.indexOf('popupPollIntervalId = /** @type {number} */ ('), popup.indexOf('}, POLL_INTERVAL_MS)'));
    expect(tick).toMatch(/if \(_panelHidden\(\)\) return;\n\s+if \(INLINE_SIDE_PANEL\) pulseVideoPageTabForSidePanel\(\);/);
    expect(popup).toMatch(/tabs: chrome\.tabs, windows: chrome\.windows/);
  });
});

describe('④ サイトの中のリンクで録画へ移っても(SPA・文書は読み直されない)、録画の入口が居る', () => {
  const FIXTURE = join(ROOT, 'src/lib/videoWatch/fixtures/twitch-vod-2940252213-replay-chat.slim.html');

  /** happy-dom のページに vod-video-watch-entry.js を載せる(chrome は偽物)。 */
  async function loadEntryAt(url) {
    const win = new Window({ url });
    win.document.write('<!DOCTYPE html><html><body><div id="nlsb-venue-root">会場</div></body></html>');
    const onMessage = [];
    const onChanged = [];
    const set = vi.fn(async () => {});
    const saved = { window: globalThis.window, document: globalThis.document, location: globalThis.location, chrome: globalThis.chrome };
    Object.assign(globalThis, {
      window: win,
      document: win.document,
      location: win.location,
      chrome: {
        storage: { local: { set }, onChanged: { addListener: (fn) => onChanged.push(fn) } },
        runtime: { onMessage: { addListener: (fn) => onMessage.push(fn) } },
      },
    });
    vi.resetModules();
    await import('../../extension/vod-video-watch-entry.js');
    const restore = () => Object.assign(globalThis, saved);
    return { win, set, onMessage, onChanged, restore };
  }

  it('ライブのページで読み込まれても、何も書かず会場も隠さない。別タブの録画カードが書かれても隠さない', async () => {
    const e = await loadEntryAt('https://www.twitch.tv/sasatikk');
    try {
      expect(e.set).not.toHaveBeenCalled();
      for (const fn of e.onChanged) fn({ nls_vod_video_watch_card_v1: { newValue: { videoId: 'twvod:1' } } }, 'local');
      expect(e.win.document.getElementById('nlsb-venue-root')?.hidden).toBe(false);
    } finally {
      e.restore();
    }
  });

  it('ライブ → 録画へ SPA で移り、横の欄の「読み直して」が届くと、実測の再生チャットから録画カードを書く', async () => {
    const e = await loadEntryAt('https://www.twitch.tv/kenki521');
    try {
      expect(e.onMessage.length).toBeGreaterThan(0);
      e.win.history.pushState({}, '', '/videos/2940252213?t=0h15m0s');
      e.win.document.body.insertAdjacentHTML('beforeend', readFileSync(FIXTURE, 'utf8'));
      for (const fn of e.onMessage) fn({ type: VIDEO_WATCH_REREAD_MESSAGE, key: 'twvod:2940252213' });
      expect(e.set).toHaveBeenCalledTimes(1);
      const wrap = e.set.mock.calls[0][0].nls_vod_video_watch_card_v1;
      expect(wrap.videoId).toBe('twvod:2940252213');
      expect(wrap.card.videoAuthorCount).toBeGreaterThan(0);
      // v0.1.2263(りんく 11-28「会場モードは全部のサービスで」): Twitch の録画でも会場を隠さない(YouTube の動画と同じ会場)
      expect(e.win.document.getElementById('nlsb-venue-root')?.hidden).toBe(false);
      expect(wrap.card.videoRows.length).toBeGreaterThan(0);
      // 録画からライブへ戻っても、会場は出たまま
      e.win.history.pushState({}, '', '/kenki521');
      for (const fn of e.onMessage) fn({ type: VIDEO_WATCH_REREAD_MESSAGE, key: '' });
      expect(e.win.document.getElementById('nlsb-venue-root')?.hidden).toBe(false);
    } finally {
      e.restore();
    }
  });

  it('manifest: 入口はサービス全体に載る。どのホストも既に許可済み(新しい許可は無い)', () => {
    const m = JSON.parse(readFileSync(join(ROOT, 'extension/manifest.json'), 'utf8'));
    const cs = m.content_scripts.find((c) => c.js.includes('dist/vod-video-watch.js'));
    expect(cs.matches).toEqual(['https://www.twitch.tv/*', 'https://kick.com/*', 'https://twitcasting.tv/*', 'https://www.tiktok.com/*', 'https://abema.tv/*']);
    for (const host of cs.matches) expect(m.host_permissions).toContain(host);
  });
});
