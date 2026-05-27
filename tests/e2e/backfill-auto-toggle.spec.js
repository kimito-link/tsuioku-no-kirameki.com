/**
 * v0.1.418: 過去ログ「自動取り込み」トグルの実拡張検証。
 *   既定 ON（checked）で、OFF にすると KEY_BACKFILL_AUTO_DISABLED=true が storage に保存され、
 *   再オープンで状態が復元される（ユーザー要望「自動＋OFF もできる」2026-05-27）。
 */

import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  openNlPopupSettings
} from './fixtures.js';

const KEY_BACKFILL_AUTO_DISABLED = 'nls_backfill_auto_disabled';

async function extensionIdFromContext(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return new URL(sw.url()).hostname;
}

async function readAutoDisabled(context) {
  const sw = context.serviceWorkers()[0];
  return sw.evaluate(async (key) => {
    const bag = await chrome.storage.local.get(key);
    return bag[key];
  }, KEY_BACKFILL_AUTO_DISABLED);
}

test.describe('過去ログ自動取り込みトグル (v0.1.418)', () => {
  test('既定で checked（自動 ON）→ OFF にすると disabled=true が保存され、再オープンで復元', async ({
    context
  }) => {
    const extensionId = await extensionIdFromContext(context);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await dismissExtensionUsageTermsGate(popup);
    await openNlPopupSettings(popup);

    const toggle = popup.locator('#backfillAutoStartToggle');
    await expect(toggle).toBeVisible();
    // 既定 ON（未設定 → checked）。
    await expect(toggle).toBeChecked();

    // OFF にする → KEY_BACKFILL_AUTO_DISABLED=true が保存される。
    await toggle.uncheck();
    await expect.poll(async () => readAutoDisabled(context), {
      timeout: 5_000,
      message: 'OFF で disabled=true が保存される'
    }).toBe(true);

    // 再オープンで OFF が復元される。
    const popup2 = await context.newPage();
    await popup2.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await dismissExtensionUsageTermsGate(popup2);
    await openNlPopupSettings(popup2);
    const toggle2 = popup2.locator('#backfillAutoStartToggle');
    await expect(toggle2).toBeVisible();
    await expect(toggle2).not.toBeChecked();

    // 再び ON に戻す → disabled=false が保存される。
    await toggle2.check();
    await expect.poll(async () => readAutoDisabled(context), {
      timeout: 5_000,
      message: 'ON に戻すと disabled=false'
    }).toBe(false);
  });
});
