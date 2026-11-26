/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildViewerBehaviorBoard, resolveViewerBehaviorAvatarUrl, viewerBehaviorBoardInnerHtml } from '../lib/viewerBehavior.js';
import { hydrateViewerBehaviorLiveLayout, viewerBehaviorRowsToLaneBuckets } from './viewerBehaviorLiveLayout.js';
import { wireLaneUserDetailOpen } from './popup/wireLaneUserDetailOpen.js';
import { deriveAvatarUrlFromUid } from '../lib/deriveAvatarUrlFromUid.js';

const NOW = Date.parse('2026-11-26T08:40:00+09:00');
const FIRST = Date.parse('2026-11-03T12:00:00+09:00');

describe('配信モードと同じレーンと数字の帯', () => {
  it('タイルは paintStoryUserLaneDomFilled のマスで、似せた自作グリッドは出さない', () => {
    const board = buildViewerBehaviorBoard({
      nowMs: NOW,
      historyReady: true,
      platform: 'youtube',
      viewCount: 12345,
      visiblePeople: [
        { id: 'UCaaaaaaaaaaaaaaaaaaaaaa', name: '花子', commentCount: 2, avatarUrl: 'https://yt3.ggpht.com/hanako.jpg', pending: false },
        { id: 'UCbbbbbbbbbbbbbbbbbbbbbb', name: '新しい人', commentCount: 1, giftCount: 1, knownAmountJpy: 500, avatarUrl: 'https://yt3.ggpht.com/new.jpg', pending: true, commentAnchor: 'UgxdBBB' },
        { id: '184', name: '匿名', commentCount: 3, pending: true },
        { id: 'anon:9', name: '匿名さん', commentCount: 1, pending: true },
      ],
      historyById: {
        UCaaaaaaaaaaaaaaaaaaaaaa: { name: '花子', commentCount: 12, liveVisits: 3, seenLive: true, firstAt: FIRST, lastAt: NOW },
      },
    });
    const html = viewerBehaviorBoardInnerHtml(board);
    expect(html).not.toContain('nlsb-viewer-behavior__tile');
    expect(html).toContain('data-live-lane-host');
    expect(html).toContain('data-stat-strip-host');
    expect(html).toContain('未対応');
    document.body.innerHTML = html;
    hydrateViewerBehaviorLiveLayout(document.body, board, { document });
    const cells = document.querySelectorAll('.nl-story-userlane-cell');
    expect(cells.length).toBeGreaterThanOrEqual(3);
    const imgs = [...document.querySelectorAll('.nl-story-userlane-cell img')];
    expect(imgs.length).toBeGreaterThanOrEqual(2);
    expect(imgs.every((img) => img.getAttribute('loading') === 'lazy')).toBe(true);
    const strip = document.querySelector('.nlsb-stat-strip');
    expect(strip).toBeTruthy();
    expect(strip.textContent).toContain('再生');
    expect(strip.textContent).toContain('12,345');
    expect(strip.textContent).toContain('応援');
    expect(strip.textContent).toContain('ギフト');
    const names = [...cells].map((c) => c.textContent || c.getAttribute('title') || '').join(' ');
    expect(names).toMatch(/花子/);
    expect(names).toMatch(/匿名/);
    expect(document.querySelector('.nlsb-viewer-behavior__tile')).toBeNull();
  });
});


describe('ニコ生の記名ユーザーの顔とクリック', () => {
  it('数値のユーザーIDから、配信モードと同じ公開アイコン URL を付ける', () => {
    const id = '12345678';
    const url = resolveViewerBehaviorAvatarUrl(id, '');
    expect(url).toBe(deriveAvatarUrlFromUid(id));
    expect(url).toContain('/nicoaccount/usericon/s/1234/12345678.jpg');
    const board = buildViewerBehaviorBoard({
      nowMs: NOW,
      historyReady: true,
      platform: 'niconico',
      contentKind: 'live',
      visiblePeople: [{ id, name: 'sigh2525', commentCount: 2 }],
      historyById: { [id]: { name: 'sigh2525', commentCount: 8, liveVisits: 2, seenLive: true, firstAt: FIRST, lastAt: NOW } },
    });
    expect(board.rows[0].avatarUrl).toBe(deriveAvatarUrlFromUid(id));
  });

  it('タイルをクリックすると、下の段と同じ発言一覧の窓を開く', () => {
    const created = [];
    globalThis.chrome = {
      runtime: { getURL: (p) => `chrome-extension://ID/${p}` },
      windows: { create: vi.fn((opts) => { created.push(opts); return Promise.resolve({}); }) },
    };
    const id = '12345678';
    const board = buildViewerBehaviorBoard({
      nowMs: NOW,
      historyReady: true,
      platform: 'niconico',
      contentKind: 'live',
      visiblePeople: [{ id, name: 'sigh2525', commentCount: 2, avatarUrl: deriveAvatarUrlFromUid(id) }],
      historyById: { [id]: { name: 'sigh2525', commentCount: 8, liveVisits: 2, seenLive: true, firstAt: FIRST, lastAt: NOW } },
    });
    document.body.innerHTML = viewerBehaviorBoardInnerHtml(board);
    hydrateViewerBehaviorLiveLayout(document.body, board, { document });
    wireLaneUserDetailOpen(document);
    const tile = document.querySelector('.nl-story-userlane-cell[data-user-key="u:12345678"]');
    expect(tile).toBeTruthy();
    tile.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    expect(created).toHaveLength(1);
    expect(created[0].url).toContain('comeview.html?user=12345678');
    expect(created[0].url).toContain('uname=');
    delete globalThis.chrome;
  });
});

describe('動画のサムネイルは新しいコメント順', () => {
  it('動画では新しいコメントが先で、なじみとギフトの印は残る。ライブの並びはなじみ→ギフト→ほかのまま', () => {
    const older = NOW - 3600_000;
    const newer = NOW;
    const people = [
      { id: 'UCaaaaaaaaaaaaaaaaaaaaaa', name: '花子', commentCount: 1, at: older },
      { id: 'UCbbbbbbbbbbbbbbbbbbbbbb', name: '新しい人', commentCount: 1, giftCount: 1, knownAmountJpy: 500, at: newer },
    ];
    const hist = { UCaaaaaaaaaaaaaaaaaaaaaa: { name: '花子', commentCount: 12, liveVisits: 3, seenLive: true, firstAt: FIRST, lastAt: NOW } };
    const live = buildViewerBehaviorBoard({
      nowMs: NOW, historyReady: true, contentKind: 'live', visiblePeople: people, historyById: hist,
    });
    const liveBuckets = viewerBehaviorRowsToLaneBuckets(live);
    expect(liveBuckets.link[0].title).toBe('花子');
    expect(liveBuckets.gift[0].title).toBe('新しい人');

    const video = buildViewerBehaviorBoard({
      nowMs: NOW, historyReady: true, contentKind: 'video', platform: 'youtube', visiblePeople: people, historyById: hist,
    });
    const videoBuckets = viewerBehaviorRowsToLaneBuckets(video);
    expect(videoBuckets.link).toHaveLength(0);
    expect(videoBuckets.gift).toHaveLength(0);
    const order = videoBuckets.tanu.map((i) => i.title);
    expect(order[0]).toBe('新しい人');
    expect(order[1]).toBe('花子');
    expect(videoBuckets.tanu[0].meta.idLine).toContain('ギフト');
    expect(videoBuckets.tanu[1].meta.idLine).toContain('なじみ');
  });
});
