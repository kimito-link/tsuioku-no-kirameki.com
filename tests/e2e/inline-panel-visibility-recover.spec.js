/**
 * visibility 切替でインラインパネルが確実に復帰描画されることの回帰テスト。
 *
 * 裏タブ(document.hidden)ではパネル描画を省電力 skip する仕様(content-entry.js の
 * tickPageFrameLayoutFromInterval が visibilityState==='hidden' で renderPageFrameOverlay
 * を見送る)。これは多タブ CPU 比例増を避ける意図的設計で、可視復帰時に確実に再描画される
 * (onPageFrameVisibilityChange が inlineLayoutDirty=true + 即時 tick)。
 *
 * その「省電力 → 可視復帰で必ず塗り直る」契約を自動で担保する。Playwright は
 * document.visibilityState を直接操作できないため、ページ内で visibilitychange を
 * dispatch + visibilityState を一時的に上書きする標準的な回避策を使う。
 */

import { test, expect, enableInlinePanelAutoshow } from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

const INLINE_HOST = '#nls-inline-popup-host';

test.describe('インラインパネル visibility 復帰', () => {
  test('hidden → visible の擬似切替後にパネルが描画される(白いまま固まらない)', async ({
    context
  }) => {
    await enableInlinePanelAutoshow(context);

    let sw = context.serviceWorkers()[0];
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    await sw.evaluate(async ({ watchUrl }) => {
      const rows = Array.from({ length: 8 }, (_, idx) => ({
        id: `lv888888888::vis-${idx + 1}`,
        liveId: 'lv888888888',
        commentNo: String(idx + 1),
        userId: `user_${idx % 3}`,
        text: `visibility row ${idx + 1}`,
        capturedAt: Date.now() - idx * 1000
      }));
      await chrome.storage.local.set({
        nls_last_watch_url: watchUrl,
        nls_comments_lv888888888: rows
      });
    }, { watchUrl: MOCK_WATCH });

    const page = await context.newPage();
    await page.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
    await expect(page.locator('#e2e-mock-viewer-count-sentinel')).toBeAttached();
    await page.bringToFront();

    // まず通常に前面化して描画される(初期状態の担保)。
    const frame = page.frameLocator(`${INLINE_HOST} iframe`);
    await expect(page.locator(INLINE_HOST)).toBeAttached({ timeout: 20_000 });
    await expect(
      frame.locator('html[data-nl-popup-content-painted="1"]')
    ).toBeAttached({ timeout: 25_000 });

    // 擬似的に hidden にして visibilitychange を発火(裏タブ化を再現)。
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden'
      });
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => true
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(500);

    // 可視に戻す → onPageFrameVisibilityChange が走り再描画されるはず。
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible'
      });
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => false
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // 可視復帰後にパネルが描画されている(白いまま固まっていない)。
    await expect(page.locator(INLINE_HOST)).toBeAttached({ timeout: 20_000 });
    await expect(
      frame.locator('html[data-nl-popup-content-painted="1"]'),
      '可視復帰後にパネルが描画されない(白いまま固まった)'
    ).toBeAttached({ timeout: 25_000 });
    await expect(
      frame.locator('.nl-main'),
      '可視復帰後に .nl-main が見えない(白い)'
    ).toBeVisible({ timeout: 25_000 });
  });
});
