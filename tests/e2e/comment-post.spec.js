import { test, expect } from './fixtures.js';
import {
  E2E_MOCK_WATCH_URL as MOCK_WATCH,
  E2E_MOCK_ORIGIN_PATTERN
} from './constants.js';

/**
 * フィクスチャ HTML は送信後 1.8s で textarea を空にする。
 * 旧プローブ（最大 1.4s）だと確認失敗するため、延長後の回帰防止用。
 */
test.describe('NLS_POST_COMMENT（mock watch・遅延クリア）', () => {
  test('遅延クリアでも ok: true', async ({ context }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }

    const page = await context.newPage();
    await page.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(800);

    const result = await sw.evaluate(async (tabUrlPattern) => {
      const tabs = await chrome.tabs.query({ url: tabUrlPattern });
      const id = tabs[0]?.id;
      if (!id) return { ok: false, reason: 'no_tab' };
      try {
        return await chrome.tabs.sendMessage(
          id,
          { type: 'NLS_POST_COMMENT', text: 'e2e delayed clear' },
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
