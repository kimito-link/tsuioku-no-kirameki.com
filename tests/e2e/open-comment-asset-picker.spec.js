import { test, expect } from './fixtures.js';
import {
  E2E_MOCK_WATCH_URL as MOCK_WATCH,
  E2E_MOCK_ORIGIN_PATTERN
} from './constants.js';

test.describe('NLS_OPEN_COMMENT_ASSET_PICKER（mock watch）', () => {
  test('ギフト起動ボタンがあれば ok: true', async ({ context }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }

    const page = await context.newPage();
    await page.goto(`${MOCK_WATCH}?commentVariant=asset-picker`, {
      waitUntil: 'load',
      timeout: 60_000
    });
    await page.waitForTimeout(800);

    const result = await sw.evaluate(async (tabUrlPattern) => {
      const tabs = await chrome.tabs.query({ url: tabUrlPattern });
      const tab = tabs.find((entry) =>
        String(entry.url || '').includes('commentVariant=asset-picker')
      );
      const id = tab?.id;
      if (!id) return { ok: false, reason: 'no_tab' };
      try {
        return await chrome.tabs.sendMessage(
          id,
          { type: 'NLS_OPEN_COMMENT_ASSET_PICKER' },
          { frameId: 0 }
        );
      } catch (e) {
        return {
          ok: false,
          reason:
            e && typeof e === 'object' && 'message' in e ? String(e.message) : 'send_failed'
        };
      }
    }, E2E_MOCK_ORIGIN_PATTERN);

    expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
  });
});
