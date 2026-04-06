import { test, expect, dismissExtensionUsageTermsGate } from './fixtures.js';

const MOCK_WATCH = 'http://127.0.0.1:3456/watch/lv888888888/';
const INLINE_HOST_ID = 'nls-inline-popup-host';
const INLINE_IFRAME_ID = 'nls-inline-popup-iframe';
const KEY_RECORDING = 'nls_recording_enabled';

/**
 * ヘッド付き（playwright.config の headless: false）で UI が実際に操作できることを確認する。
 * - ツールバー: default_popup は無し（二重表示防止）。popup は chrome-extension://…/popup.html を直接開いて検証
 * - 埋め込み: 視聴ページ内 iframe は cross-origin でも Playwright の frameLocator で操作可能
 */
test.describe('extension interaction', () => {
  test('chrome-extension URL で popup を開き記録チェックがトグルできる', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;

    await sw.evaluate(async (key) => {
      await chrome.storage.local.set({ [key]: false });
    }, KEY_RECORDING);

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await dismissExtensionUsageTermsGate(popup);
    await popup.waitForTimeout(400);

    const toggle = popup.locator('#recordToggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(toggle).toBeChecked();

    const stored = await sw.evaluate((key) => {
      return new Promise((resolve) => {
        chrome.storage.local.get(key, (r) => {
          resolve(Boolean(r[key]));
        });
      });
    }, KEY_RECORDING);
    expect(stored).toBe(true);
  });

  test('モック watch の埋め込み iframe 内で記録チェックがトグルできる', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }

    await sw.evaluate(async (key) => {
      await chrome.storage.local.set({ [key]: false });
    }, KEY_RECORDING);

    const page = await context.newPage();
    await page.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });

    await page.evaluate(() => {
      const doc = globalThis.document;
      const win = globalThis.window;
      const old = doc.getElementById('e2e-mock-video');
      if (old) old.remove();

      const wrap = doc.createElement('section');
      wrap.id = 'mock-player-wrap';
      wrap.style.cssText =
        'width:500px;margin:12px 0;display:flex;flex-direction:column;align-items:center;background:#111;';

      const v = doc.createElement('video');
      v.setAttribute('playsinline', '');
      v.setAttribute('width', '400');
      v.setAttribute('height', '225');
      v.style.cssText = 'display:block;width:400px;height:225px;';
      wrap.appendChild(v);

      doc.body.prepend(wrap);
      win.scrollTo(0, 0);
      win.dispatchEvent(new Event('resize'));
    });

    await expect(page.locator(`#${INLINE_HOST_ID}`)).toBeVisible({
      timeout: 25_000
    });

    const panel = page.frameLocator(`#${INLINE_IFRAME_ID}`);
    await expect(panel.locator('.nl-main')).toBeVisible({ timeout: 25_000 });

    const toggle = panel.locator('#recordToggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(toggle).toBeChecked();

    const stored = await sw.evaluate((key) => {
      return new Promise((resolve) => {
        chrome.storage.local.get(key, (r) => {
          resolve(Boolean(r[key]));
        });
      });
    }, KEY_RECORDING);
    expect(stored).toBe(true);
  });
});
