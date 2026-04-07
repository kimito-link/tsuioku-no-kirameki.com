import { test, expect } from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

const STORAGE_COMMENTS = 'nls_comments_lv888888888';

/**
 * 実際のニコ生はログイン・配信の有無で DOM が変わるため、
 * E2E はローカル静的ページ（manifest の :3456 のみ）で「記録〜storage」の経路を検証する。
 */
test.describe('拡張機能（モック watch）', () => {
  test('記録ONでモックコメントが storage に溜まる', async ({ context }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    expect(sw.url(), 'service worker が立ち上がる').toContain(
      'chrome-extension://'
    );

    await sw.evaluate(async (commentsKey) => {
      const payload = { nls_recording_enabled: true };
      payload[commentsKey] = [];
      await chrome.storage.local.set(payload);
    }, STORAGE_COMMENTS);

    const page = await context.newPage();
    await page.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
    await expect(page.locator('#e2e-comment-form')).toBeVisible();

    await expect
      .poll(
        async () => {
          return sw.evaluate((key) => {
            return new Promise((resolve) => {
              chrome.storage.local.get(key, (r) => {
                const arr = r[key];
                resolve(Array.isArray(arr) ? arr.length : -1);
              });
            });
          }, STORAGE_COMMENTS);
        },
        {
          timeout: 60_000,
          message:
            'コンテンツスクリプトがコメントをマージするまで（深掘りスクロール含む）'
        }
      )
      .toBeGreaterThanOrEqual(25);
  });
});
