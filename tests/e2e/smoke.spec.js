import { test, expect, dismissExtensionUsageTermsGate } from './fixtures.js';

const MOCK_WATCH = 'http://127.0.0.1:3456/watch/lv888888888/';

/**
 * 最短経路のスモーク（レイアウト詳細は popup-layout / page-frame に委譲）
 * 実行例: npm run test:e2e:smoke（Windows でもパス指定で安定）
 */
test.describe('smoke', () => {
  test('モック watch が読み込まれコメントパネルが見える', async ({ context }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    expect(sw.url()).toContain('chrome-extension://');

    const page = await context.newPage();
    await page.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
    await expect(page.locator('.comment-panel')).toBeVisible();
  });

  test('拡張 popup が開きコア領域が表示される', async ({ context }) => {
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
    await dismissExtensionUsageTermsGate(popup);
    await expect(popup.locator('html[data-nl-support-wired]')).toBeAttached({
      timeout: 15_000
    });

    await expect(popup.locator('.nl-main')).toBeVisible();
    await expect(popup.locator('.nl-stats')).toBeVisible();
    await expect(popup.locator('#count')).toBeVisible();
  });
});
