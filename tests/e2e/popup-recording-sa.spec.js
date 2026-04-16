/**
 * H1-Perception / H1-a11y / H2-Consistency
 * @see docs/ux-tdd-hypothesis-matrix.md
 */
import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  openNlPopupSettings
} from './fixtures.js';

const KEY_RECORDING = 'nls_recording_enabled';

async function extensionServiceWorker(context) {
  const pickExt = () =>
    context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const ext = pickExt();
    if (ext) return ext;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('extension service worker not found');
}

async function extensionIdFromContext(context) {
  const sw = await extensionServiceWorker(context);
  return new URL(sw.url()).hostname;
}

/**
 * @param {import('@playwright/test').BrowserContext} context
 * @param {boolean|null} enabled - true/false を保存。null ならキー削除（既定ON挙動）
 */
async function setRecordingStorage(context, enabled) {
  const sw = await extensionServiceWorker(context);
  await sw.evaluate(
    async ({ key, enabled: en }) => {
      if (en === null) {
        await chrome.storage.local.remove([key]);
      } else {
        await chrome.storage.local.set({ [key]: en });
      }
    },
    { key: KEY_RECORDING, enabled }
  );
}

test.describe('popup 記録状態 SA（data-nl-recording / H1）', () => {
  test('記録トグル・data-nl-recording・checked が一致する（既定ON）', async ({
    context
  }) => {
    await setRecordingStorage(context, null);
    const extensionId = await extensionIdFromContext(context);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await dismissExtensionUsageTermsGate(popup);
    await openNlPopupSettings(popup);

    const toggle = popup.locator('#recordToggle');
    const hero = popup.locator('.nl-record-hero');
    await expect(toggle).toBeVisible();
    await expect(hero).toBeVisible();
    await expect(toggle).toBeChecked();
    await expect(hero).toHaveAttribute('data-nl-recording', 'on');
  });

  test('ストレージ false のとき OFF で data-nl-recording は off', async ({
    context
  }) => {
    await setRecordingStorage(context, false);
    const extensionId = await extensionIdFromContext(context);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await dismissExtensionUsageTermsGate(popup);
    await openNlPopupSettings(popup);

    const toggle = popup.locator('#recordToggle');
    const hero = popup.locator('.nl-record-hero');
    await expect(toggle).not.toBeChecked();
    await expect(hero).toHaveAttribute('data-nl-recording', 'off');
  });

  test('記録トグルに名前（aria-label）が残る（H1-a11y）', async ({ context }) => {
    const extensionId = await extensionIdFromContext(context);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await dismissExtensionUsageTermsGate(popup);
    await openNlPopupSettings(popup);

    const toggle = popup.locator('#recordToggle');
    await expect(toggle).toHaveAttribute('aria-label', /.+/);
  });
});

test.describe('popup と inline=1 の記録表示一貫性（H2）', () => {
  test('同一ストレージで data-nl-recording が popup と inline=1 で一致', async ({
    context
  }) => {
    await setRecordingStorage(context, false);
    const extensionId = await extensionIdFromContext(context);

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await dismissExtensionUsageTermsGate(popup);
    await openNlPopupSettings(popup);
    await expect(popup.locator('.nl-record-hero')).toHaveAttribute(
      'data-nl-recording',
      'off'
    );

    const inline = await context.newPage();
    await inline.goto(`chrome-extension://${extensionId}/popup.html?inline=1`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await dismissExtensionUsageTermsGate(inline);
    await openNlPopupSettings(inline);
    await expect(inline.locator('.nl-record-hero')).toHaveAttribute(
      'data-nl-recording',
      'off'
    );

    await setRecordingStorage(context, true);
    await popup.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    await dismissExtensionUsageTermsGate(popup);
    await inline.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    await dismissExtensionUsageTermsGate(inline);

    await expect(popup.locator('.nl-record-hero')).toHaveAttribute(
      'data-nl-recording',
      'on'
    );
    await expect(inline.locator('.nl-record-hero')).toHaveAttribute(
      'data-nl-recording',
      'on'
    );
  });
});
