import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

const KEY_RECORDING = 'nls_recording_enabled';
const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const STORAGE_COMMENTS = 'nls_comments_lv888888888';

/**
 * popup の #liveStatCards（記録・推定同接・来場者）が snapshot 取得後も HTML 初期値「—」の
 * まま残らないことを検証する（0.1.135 の watch メタ／カード描画分離の回帰ガード）。
 * 記録件数はモック watch の仮想リスト行が content から取り込まれるため、3 件 seed より増えることがある。
 */
test.describe('popup live stat cards', () => {
  test('watch 解決後、来場・同接・記録が「—」固定にならない', async ({ context }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;

    await sw.evaluate(
      async ({ recordingKey, lastWatchKey, commentsKey, watchUrl }) => {
        const rows = Array.from({ length: 3 }, (_, idx) => ({
          id: `lv888888888::e2e-stat-${idx + 1}`,
          liveId: 'lv888888888',
          commentNo: String(idx + 1),
          userId: `user_stat_${idx}`,
          text: `e2e stat row ${idx + 1}`,
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
    await expect(watch.locator('#e2e-mock-viewer-count-sentinel')).toBeAttached();

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await focusMockWatchThenReloadPopup(watch, popup);
    await dismissExtensionUsageTermsGate(popup);
    await expect(popup.locator('html[data-nl-support-wired]')).toBeAttached({
      timeout: 20_000
    });

    await expect(popup.locator('#liveStatCards')).toBeVisible();

    await expect
      .poll(
        async () => {
          const raw = (await popup.locator('#watchViewerDom').innerText()).trim();
          return raw.replace(/[,，\s]/g, '');
        },
        { timeout: 25_000, message: '来場者数カードが snapshot 由来の数値になるまで' }
      )
      .toBe('9876');

    await expect
      .poll(
        async () => {
          const t = (await popup.locator('#watchConcurrentEst').innerText()).trim();
          return t;
        },
        { timeout: 25_000, message: '推定同接カードが計測中／— から遷移するまで' }
      )
      .not.toMatch(/^(—|－|計測中…)$/u);

    await expect
      .poll(
        async () => {
          const t = (await popup.locator('#liveStatComments').innerText()).trim();
          return t.replace(/[,，\s]/g, '');
        },
        { timeout: 15_000, message: '記録カードが「—」から数値表示になるまで' }
      )
      .toMatch(/^\d+$/u);
    const recorded = Number(
      (await popup.locator('#liveStatComments').innerText()).trim().replace(/[,，\s]/g, '')
    );
    expect(recorded).toBeGreaterThanOrEqual(3);
  });
});
