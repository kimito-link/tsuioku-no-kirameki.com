import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  openNlPopupSettings
} from './fixtures.js';

async function extensionIdFromContext(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) {
    sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  }
  return new URL(sw.url()).hostname;
}

test.describe('popup 詳細設定（折りたたみ）', () => {
  test('記録トグルは詳細設定を開くまで非表示・詳細設定は閉じた初期状態で取り込み等は折りたたみ内', async ({
    context
  }) => {
    const extensionId = await extensionIdFromContext(context);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await dismissExtensionUsageTermsGate(popup);

    const details = popup.locator('#nlPopupSettings');
    await expect(details).toBeAttached();
    await expect(details).toHaveJSProperty('open', false);
    await expect(popup.locator('#recordToggle')).not.toBeVisible();

    await expect(popup.locator('#deepHarvestQuietUiToggle')).not.toBeVisible();
    await expect(popup.locator('#inlinePanelPlacementBelow')).not.toBeVisible();
    await expect(popup.locator('#calmPanelMotion')).not.toBeVisible();

    await openNlPopupSettings(popup);
    await expect(popup.locator('#recordToggle')).toBeVisible();
    await expect(popup.locator('#deepHarvestQuietUiToggle')).toBeVisible();
    await expect(popup.locator('#inlinePanelPlacementBelow')).toBeVisible();
    await expect(popup.locator('#calmPanelMotion')).toBeVisible();
  });

  test('inline=1（埋め込み）でも同じ詳細設定の開閉ができる', async ({ context }) => {
    const extensionId = await extensionIdFromContext(context);
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html?inline=1`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await dismissExtensionUsageTermsGate(page);

    const details = page.locator('#nlPopupSettings');
    await expect(details).toBeAttached();
    await expect(details).toHaveJSProperty('open', false);
    await expect(page.locator('#recordToggle')).not.toBeVisible();

    await openNlPopupSettings(page);
    await expect(page.locator('#recordToggle')).toBeVisible();
    await expect(page.locator('#inlinePanelWidthLegend')).toBeVisible();
  });
});
