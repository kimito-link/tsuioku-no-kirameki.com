import { test, expect } from './fixtures.js';

const MOCK_WATCH = 'http://127.0.0.1:3456/watch/lv888888888/';
const KEY_RECORDING = 'nls_recording_enabled';
const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const STORAGE_COMMENTS = 'nls_comments_lv888888888';

test.describe('popup layout', () => {
  test('popup renders all core blocks without internal scrolling', async ({ context }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;

    await sw.evaluate(
      async ({ recordingKey, lastWatchKey, commentsKey, watchUrl }) => {
        const rows = Array.from({ length: 80 }, (_, idx) => ({
          id: `lv888888888::${idx + 1}`,
          liveId: 'lv888888888',
          commentNo: String(idx + 1),
          userId: `user_${idx % 18}`,
          text: `mock row ${idx + 1}`,
          capturedAt: Date.now() - idx * 1000
        }));
        await chrome.storage.local.set({
          [recordingKey]: true,
          [lastWatchKey]: watchUrl,
          [commentsKey]: rows
        });
      },
      {
        recordingKey: KEY_RECORDING,
        lastWatchKey: KEY_LAST_WATCH_URL,
        commentsKey: STORAGE_COMMENTS,
        watchUrl: MOCK_WATCH
      }
    );

    const watch = await context.newPage();
    await watch.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await popup.waitForTimeout(700);

    const metrics = await popup.evaluate(() => {
      const doc = globalThis.document;
      const html = doc.documentElement;
      const body = doc.body;
      const main = doc.querySelector('.nl-main');
      const rooms = doc.getElementById('userRoomList');
      const viewportHeight = body?.clientHeight || html.clientHeight || 0;
      const requiredSelectors = [
        '.nl-stats',
        '.nl-record',
        '.nl-comment-compose',
        '.nl-btn-row',
        '.nl-capture',
        '#userRoomList'
      ];
      const required = requiredSelectors.map((selector) => {
        const el = doc.querySelector(selector);
        if (!el) {
          return { selector, exists: false, bottom: -1 };
        }
        const rect = el.getBoundingClientRect();
        return {
          selector,
          exists: true,
          bottom: Math.round(rect.bottom)
        };
      });
      return {
        width: body?.clientWidth || 0,
        height: body?.clientHeight || 0,
        bodyOverflow: Math.max(0, body.scrollHeight - body.clientHeight),
        mainOverflow: main
          ? Math.max(0, main.scrollHeight - main.clientHeight)
          : -1,
        roomsOverflow: rooms
          ? Math.max(0, rooms.scrollHeight - rooms.clientHeight)
          : -1,
        viewportHeight,
        required,
        requiredInsideViewport: required.every(
          (v) => v.exists && v.bottom > 0 && v.bottom <= viewportHeight + 1
        )
      };
    });
    console.log('popup metrics', metrics);

    expect(metrics.width).toBeGreaterThanOrEqual(340);
    expect(metrics.width).toBeLessThanOrEqual(540);
    expect(metrics.height).toBeGreaterThanOrEqual(560);
    expect(metrics.height).toBeLessThanOrEqual(960);
    expect(metrics.bodyOverflow).toBeLessThanOrEqual(1);
    expect(metrics.mainOverflow).toBeLessThanOrEqual(10);
    expect(metrics.roomsOverflow).toBeLessThanOrEqual(1);
    expect(metrics.requiredInsideViewport).toBeTruthy();
  });
});
