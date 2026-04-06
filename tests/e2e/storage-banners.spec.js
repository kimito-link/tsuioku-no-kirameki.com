import { test, expect, dismissExtensionUsageTermsGate } from './fixtures.js';

const MOCK_WATCH = 'http://127.0.0.1:3456/watch/lv888888888/';
const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_STORAGE_WRITE_ERROR = 'nls_storage_write_error';
const KEY_COMMENT_PANEL_STATUS = 'nls_comment_panel_status';

async function waitForPopupWired(popup) {
  await dismissExtensionUsageTermsGate(popup);
  await expect(popup.locator('html[data-nl-support-wired]')).toBeAttached({
    timeout: 15_000
  });
}

test.describe('popup storage banners', () => {
  test('nls_storage_write_error があれば保存失敗バナーが出る', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await waitForPopupWired(popup);

    await popup.evaluate(
      async ({ lastUrl, keyErr, mockWatch, payload }) => {
        await chrome.storage.local.set({
          [lastUrl]: mockWatch,
          [keyErr]: payload
        });
      },
      {
        lastUrl: KEY_LAST_WATCH_URL,
        keyErr: KEY_STORAGE_WRITE_ERROR,
        mockWatch: MOCK_WATCH,
        payload: {
          at: Date.now(),
          liveId: 'lv888888888',
          message: 'QUOTA_EXCEEDED'
        }
      }
    );

    await expect(popup.locator('#storageErrorBanner.is-visible')).toBeVisible({
      timeout: 10_000
    });
  });

  test('nls_comment_panel_status があればコメント検出バナーが出る', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await waitForPopupWired(popup);

    await popup.evaluate(
      async ({ lastUrl, keyPanel, mockWatch, payload }) => {
        await chrome.storage.local.set({
          [lastUrl]: mockWatch,
          [keyPanel]: payload
        });
      },
      {
        lastUrl: KEY_LAST_WATCH_URL,
        keyPanel: KEY_COMMENT_PANEL_STATUS,
        mockWatch: MOCK_WATCH,
        payload: {
          ok: false,
          updatedAt: Date.now(),
          liveId: 'lv888888888',
          code: 'no_comment_panel'
        }
      }
    );

    await expect(popup.locator('#commentHarvestBanner')).toBeVisible({
      timeout: 10_000
    });
  });
});
