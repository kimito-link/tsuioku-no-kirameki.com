import { test, expect } from './fixtures.js';
import {
  E2E_MOCK_WATCH_URL as MOCK_WATCH,
  E2E_MOCK_ORIGIN_PATTERN
} from './constants.js';

test.describe('画面キャプチャ（モック watch + video）', () => {
  test('NLS_CAPTURE_SCREENSHOT が PNG data URL を返す', async ({ context }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }

    const page = await context.newPage();
    await page.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
    await expect(page.locator('#e2e-mock-video')).toBeVisible();
    await page.evaluate(`
      (function () {
        var v = document.getElementById('e2e-mock-video');
        if (v && v.play) return v.play().catch(function () {});
        return Promise.resolve();
      })()
    `);
    await page.waitForTimeout(600);

    const result = await sw.evaluate(async (tabUrlPattern) => {
      const tabs = await chrome.tabs.query({ url: tabUrlPattern });
      const id = tabs[0]?.id;
      if (!id) return { ok: false, reason: 'no_tab' };
      try {
        return await chrome.tabs.sendMessage(
          id,
          { type: 'NLS_CAPTURE_SCREENSHOT' },
          { frameId: 0 }
        );
      } catch (e) {
        return {
          ok: false,
          reason: e && typeof e === 'object' && 'message' in e ? String(e.message) : 'send_failed'
        };
      }
    }, E2E_MOCK_ORIGIN_PATTERN);

    expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
    expect(String(/** @type {{ dataUrl?: string }} */ (result).dataUrl || '')).toMatch(
      /^data:image\/png;base64,/
    );
  });
});
