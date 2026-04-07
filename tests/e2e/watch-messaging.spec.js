import { test, expect } from './fixtures.js';
import {
  E2E_MOCK_WATCH_URL as MOCK_WATCH,
  E2E_MOCK_ORIGIN_PATTERN
} from './constants.js';

/**
 * ポップアップ側 tabsSendMessageWithRetry と同じく frameId: 0（メインフレーム）へ送る。
 * iframe が先に応答して失敗する回帰を防ぐための経路を E2E で固定する。
 */
test.describe('watch タブへの messaging（メインフレーム）', () => {
  test('NLS_EXPORT_WATCH_SNAPSHOT が ok と liveId を返す', async ({ context }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }

    const page = await context.newPage();
    await page.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });

    const result = await sw.evaluate(async (tabUrlPattern) => {
      const tabs = await chrome.tabs.query({ url: tabUrlPattern });
      const id = tabs[0]?.id;
      if (!id) return { ok: false, reason: 'no_tab' };
      try {
        return await chrome.tabs.sendMessage(
          id,
          { type: 'NLS_EXPORT_WATCH_SNAPSHOT' },
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
    const snap = /** @type {{ snapshot?: { liveId?: string|null } }} */ (result).snapshot;
    expect(snap?.liveId).toBe('lv888888888');
  });
});
