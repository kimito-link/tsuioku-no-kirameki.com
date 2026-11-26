/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { buildViewerBehaviorBoard, viewerBehaviorBoardInnerHtml } from '../lib/viewerBehavior.js';
import { hydrateViewerBehaviorLiveLayout } from './viewerBehaviorLiveLayout.js';

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
