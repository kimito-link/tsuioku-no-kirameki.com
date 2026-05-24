import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  openNlPopupSettings,
  enableInlinePanelAutoshow
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';
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
    await openNlPopupSettings(popup);

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

    /*
     * 0.1.6 以降、視聴ページのインラインパネルは既定で非表示（autoshow opt-in）。
     * この spec は「視聴ページ埋め込み iframe から記録トグルを操作できる」ことを検証したいので、
     * 事前に autoshow を ON にして #nls-inline-popup-host を確実に露出させる。
     */
    await enableInlinePanelAutoshow(context);

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
    await dismissExtensionUsageTermsGate(panel);
    await page.waitForTimeout(400);
    await openNlPopupSettings(panel);

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

  /*
   * 0.1.349: 多タブで一方のパネルが「—」/「(取得中...)」で永続的に固まる根治の実証。
   *   真因は inline iframe が自タブ liveId を持たず、background タブで
   *   chrome.tabs.query({active,currentWindow}) が前面の別タブを拾うこと。
   *   content script が iframe src に自タブ liveId を `&lv=<id>` で焼き込むように
   *   したので、iframe の src が watch ページの liveId (lv888888888) を含むことを
   *   実ブラウザで確認する（src 焼き込み = 解決の最優先ソース）。
   */
  test('埋め込み iframe の src に自タブ liveId が焼き込まれる（多タブ混信の根治）', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    await enableInlinePanelAutoshow(context);

    const page = await context.newPage();
    await page.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
    await page.evaluate(() => {
      const doc = globalThis.document;
      const old = doc.getElementById('e2e-mock-video');
      if (old) old.remove();
      const v = doc.createElement('video');
      v.setAttribute('playsinline', '');
      v.setAttribute('width', '400');
      v.setAttribute('height', '225');
      v.style.cssText = 'display:block;width:400px;height:225px;';
      doc.body.prepend(v);
      globalThis.window.dispatchEvent(new Event('resize'));
    });

    const iframe = page.locator(`#${INLINE_IFRAME_ID}`);
    await expect(iframe).toHaveCount(1, { timeout: 25_000 });

    // MOCK_WATCH = .../watch/lv888888888/ なので src に lv=lv888888888 が乗る。
    const src = await iframe.getAttribute('src');
    expect(src).toContain('inline=1');
    expect(src).toContain('lv=lv888888888');
  });
});
