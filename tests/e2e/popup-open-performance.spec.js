import { test, expect, dismissExtensionUsageTermsGate } from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

test.describe('popup open performance', () => {
  test('モック watch ありで初回コンテンツペイントが制限時間内', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;

    const watchPage = await context.newPage();
    await watchPage.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });

    const popup = await context.newPage();
    const t0 = Date.now();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await dismissExtensionUsageTermsGate(popup);

    await expect(popup.locator('html[data-nl-support-wired]')).toBeAttached({
      timeout: 20_000
    });
    await expect(
      popup.locator('html[data-nl-popup-content-painted="1"]')
    ).toBeAttached({ timeout: 15_000 });

    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(45_000);
  });

  test('watch タブなしでも初回コンテンツペイントが付く', async ({ context }) => {
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

    await expect(
      popup.locator('html[data-nl-popup-content-painted="1"]')
    ).toBeAttached({ timeout: 15_000 });
  });

  test('ポップアップ再読み込み後もコンテンツペイントマーカーが付く', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;

    const watchPage = await context.newPage();
    await watchPage.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await dismissExtensionUsageTermsGate(popup);

    await expect(
      popup.locator('html[data-nl-popup-content-painted="1"]')
    ).toBeAttached({ timeout: 15_000 });

    await popup.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    await dismissExtensionUsageTermsGate(popup);

    await expect(
      popup.locator('html[data-nl-popup-content-painted="1"]')
    ).toBeAttached({ timeout: 15_000 });
  });
});
