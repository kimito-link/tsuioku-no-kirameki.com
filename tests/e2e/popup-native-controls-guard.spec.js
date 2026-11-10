// popup-native-controls-guard.spec.js — パネルに「見た目の指定が無いボタン」と「枠からはみ出す三角」が無いことを守る。
//
// 背景(v0.1.2021): コメビュ・読み上げ・なふだ等のボタンに CSS が1行も無く、ブラウザ既定の灰色の
// ボタンのまま出ていた。操作ボタン列が上部へ移った後は、マーケとスクショが1行ずつ占有していた。
// 人の目に頼らず、計算後のスタイルと位置で検出する。
import { test, expect, dismissExtensionUsageTermsGate, focusMockWatchThenReloadPopup } from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

const KEY_RECORDING = 'nls_recording_enabled';
const KEY_LAST_WATCH_URL = 'nls_last_watch_url';

/**
 * @param {import('@playwright/test').BrowserContext} context
 * @param {number} width
 */
async function openWiredPopup(context, width) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  const extensionId = new URL(sw.url()).hostname;
  await sw.evaluate(
    async ({ recordingKey, lastWatchKey, watchUrl }) => {
      await chrome.storage.local.set({ [recordingKey]: true, [lastWatchKey]: watchUrl });
    },
    { recordingKey: KEY_RECORDING, lastWatchKey: KEY_LAST_WATCH_URL, watchUrl: MOCK_WATCH }
  );
  const watch = await context.newPage();
  await watch.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
  const popup = await context.newPage();
  await popup.setViewportSize({ width, height: 900 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await focusMockWatchThenReloadPopup(watch, popup);
  await dismissExtensionUsageTermsGate(popup);
  await expect(popup.locator('html[data-nl-support-wired]')).toBeAttached({ timeout: 15_000 });
  return popup;
}

test.describe('パネルの部品はブラウザ既定の見た目のまま出ない', () => {
  test('ボタンに見た目の指定がある・三角が枠の中に収まる', async ({ context }) => {
    const popup = await openWiredPopup(context, 400);
    const found = await popup.evaluate(() => {
      /** @type {string[]} */
      const nativeButtons = [];
      for (const b of document.querySelectorAll('button, input[type=button], input[type=submit]')) {
        const cs = getComputedStyle(b);
        // ブラウザ既定のボタン = 枠が outset か、背景が ButtonFace(#efefef)のまま。
        if (cs.borderTopStyle === 'outset' || cs.backgroundColor === 'rgb(239, 239, 239)') {
          nativeButtons.push(`${b.id || b.className || '(名前なし)'}: ${(b.textContent || '').trim().slice(0, 16)}`);
        }
      }
      /** @type {string[]} */
      const markersOutside = [];
      for (const s of document.querySelectorAll('summary')) {
        const cs = getComputedStyle(s);
        if (cs.display !== 'list-item' || cs.listStyleType === 'none' || cs.listStylePosition !== 'outside') continue;
        const box = s.parentElement;
        if (!box) continue;
        const bs = getComputedStyle(box);
        // 外付けの三角は summary の左へ約1文字ぶん出る。親の枠の内側(余白込み)に収まる幅があるか。
        const room =
          parseFloat(cs.marginLeft) + parseFloat(bs.paddingLeft) + parseFloat(bs.borderLeftWidth);
        if (room < parseFloat(cs.fontSize)) {
          markersOutside.push(`${s.className || box.className || box.id}: ${(s.textContent || '').trim().slice(0, 16)}`);
        }
      }
      return { nativeButtons, markersOutside };
    });
    expect(found.nativeButtons, '見た目の指定が無いボタン').toEqual([]);
    expect(found.markersOutside, '枠からはみ出す三角').toEqual([]);
  });

  for (const width of [400, 320]) {
    test(`上部の操作ボタン列は幅 ${width}px で2行以内・高さがそろう`, async ({ context }) => {
      const popup = await openWiredPopup(context, width);
      const toolbar = popup.locator('.nl-compose-quick-toolbar');
      await expect(toolbar).toHaveAttribute('data-nl-hoisted', 'top');
      const rects = await toolbar.evaluate((el) =>
        [...el.querySelectorAll(':scope > button:not([hidden])')].map((b) => {
          const r = b.getBoundingClientRect();
          return { id: b.id, top: Math.round(r.top), height: Math.round(r.height) };
        })
      );
      expect(rects.map((r) => r.id)).toEqual([
        'exportMarketingQuickBtn',
        'captureScreenshot',
        'reloadWatchTabBtn',
        'openComeviewBtn',
        'openComeviewVoiceBtn'
      ]);
      const rows = [...new Set(rects.map((r) => r.top))];
      expect(rows.length, `行数 ${JSON.stringify(rects)}`).toBeLessThanOrEqual(2);
      for (const top of rows) {
        const heights = new Set(rects.filter((r) => r.top === top).map((r) => r.height));
        expect(heights.size, `同じ行の高さ ${JSON.stringify(rects)}`).toBe(1);
      }
      // 押しやすさ(40px 以上)は保つ。
      for (const r of rects) expect(r.height).toBeGreaterThanOrEqual(40);
    });
  }

  // v0.1.2022: 状態ページにも見た目の指定が無いボタンが38個あった(効果音の ▶ 試聴など)。ほかの画面も同じ物差しで守る。
  for (const pagePath of [
    'status.html',
    'comeview.html',
    'venue.html?lv=lv888888888',
    'marketing-export.html',
    'live-view.html'
  ]) {
    test(`${pagePath} のボタンに見た目の指定がある`, async ({ context }) => {
      let sw = context.serviceWorkers()[0];
      if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
      const extensionId = new URL(sw.url()).hostname;
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/${pagePath}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000
      });
      // 後から作られるボタン(状態ページの一覧など)が出そろうのを待つ。
      await page.waitForTimeout(4000);
      const nativeButtons = await page.evaluate(() => {
        /** @type {string[]} */
        const out = [];
        for (const b of document.querySelectorAll('button, input[type=button], input[type=submit]')) {
          const cs = getComputedStyle(b);
          if (cs.borderTopStyle === 'outset' || cs.backgroundColor === 'rgb(239, 239, 239)') {
            out.push(`${b.id || b.className || '(名前なし)'}: ${(b.textContent || '').trim().slice(0, 16)}`);
          }
        }
        return out;
      });
      expect(nativeButtons, '見た目の指定が無いボタン').toEqual([]);
    });
  }
});
