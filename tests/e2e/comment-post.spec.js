import { test, expect } from './fixtures.js';
import {
  E2E_MOCK_WATCH_URL as MOCK_WATCH,
  E2E_MOCK_ORIGIN_PATTERN
} from './constants.js';

/**
 * フィクスチャ HTML は ?commentClearDelayMs=1800 指定で送信後 1.8s に textarea を
 * 空ける(既定は fastSubmit 確認用の100ms・fixtures/watch/lv888888888/index.html 参照)。
 * NLS_POST_COMMENT を SW 経由で直接送信するこのテストは fastSubmit を渡さないため
 * 常に通常プローブ COMMENT_SUBMIT_CONFIRM_PROBE_MS(最大4000ms)を使う経路であり、
 * 1.8s の遅いクリアでも確認できることの回帰防止用。
 */
test.describe('NLS_POST_COMMENT（mock watch・遅延クリア）', () => {
  test('遅延クリアでも ok: true', async ({ context }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }

    const page = await context.newPage();
    await page.goto(`${MOCK_WATCH}?commentClearDelayMs=1800`, {
      waitUntil: 'load',
      timeout: 60_000
    });
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

  test('text-only の送信ボタンでも ok: true', async ({ context }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }

    const page = await context.newPage();
    await page.goto(`${MOCK_WATCH}?commentVariant=text-button&commentClearDelayMs=1800`, {
      waitUntil: 'load',
      timeout: 60_000
    });
    await page.waitForTimeout(800);

    const result = await sw.evaluate(async (tabUrlPattern) => {
      const tabs = await chrome.tabs.query({ url: tabUrlPattern });
      const tab = tabs.find((entry) =>
        String(entry.url || '').includes('commentVariant=text-button')
      );
      const id = tab?.id;
      if (!id) return { ok: false, reason: 'no_tab' };
      try {
        return await chrome.tabs.sendMessage(
          id,
          { type: 'NLS_POST_COMMENT', text: 'e2e text button' },
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
