import { test, expect, dismissExtensionUsageTermsGate, focusMockWatchThenReloadPopup } from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';
const KEY_RECORDING = 'nls_recording_enabled';
const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const STORAGE_COMMENTS = 'nls_comments_lv888888888';

async function waitForPopupWired(popup) {
  await dismissExtensionUsageTermsGate(popup);
  await expect(popup.locator('html[data-nl-support-wired]')).toBeAttached({
    timeout: 15_000
  });
}

test.describe('compose quick toolbar (UD + compact)', () => {
  // v0.1.896: 操作ボタン群(.nl-compose-quick-toolbar)はユーザー要望+会議で
  // .nl-comment-compose--primary の中から .nl-main 上部(配信者バナー/統計カードの直前)へ
  // hoistQuickToolbarToTop() が昇格させる。よって「プライマリコメント枠内にある」の
  // 前提はこの版で意図的に覆っている(本テストは旧版時代の想定)。
  test('書き出し・再読み込みボタンはパネル上部へ昇格しており、操作しやすいサイズと名前がある', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;

    await sw.evaluate(
      async ({ recordingKey, lastWatchKey, commentsKey, watchUrl }) => {
        const rows = Array.from({ length: 8 }, (_, idx) => ({
          id: `lv888888888::${idx + 1}`,
          liveId: 'lv888888888',
          commentNo: String(idx + 1),
          userId: `user_${idx % 6}`,
          text: `mock ${idx + 1}`,
          capturedAt: Date.now() - idx * 1000
        }));
        await chrome.storage.local.set({
          [recordingKey]: true,
          [lastWatchKey]: watchUrl,
          [commentsKey]: rows
        });
      },
      {
        recordingKey: KEY_RECORDING,
        lastWatchKey: KEY_LAST_WATCH_URL,
        commentsKey: STORAGE_COMMENTS,
        watchUrl: MOCK_WATCH
      }
    );

    const watch = await context.newPage();
    await watch.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await focusMockWatchThenReloadPopup(watch, popup);
    await waitForPopupWired(popup);

    const compose = popup.locator('.nl-comment-compose--primary');
    await expect(compose).toBeVisible();

    const toolbar = popup.locator('.nl-compose-quick-toolbar');
    await expect(toolbar).toBeVisible();
    // v0.1.896: 昇格済みの印(dataset.nlHoisted='top')が付き、.nl-main 直下にある。
    await expect(toolbar).toHaveAttribute('data-nl-hoisted', 'top');
    await expect(
      toolbar.locator('xpath=ancestor::*[contains(@class,"nl-main")]')
    ).toHaveCount(1);

    for (const id of ['exportJson', 'captureScreenshot', 'reloadWatchTabBtn']) {
      const btn = popup.locator(`#${id}`);
      await expect(btn).toBeVisible();
      await expect(
        btn.locator(
          'xpath=ancestor::*[contains(@class,"nl-compose-quick-toolbar")]'
        )
      ).toHaveCount(1);
    }

    const audit = await popup.evaluate(() => {
      const composeEl = document.querySelector('.nl-comment-compose--primary');
      const ids = ['exportJson', 'captureScreenshot', 'reloadWatchTabBtn'];
      const detailsCount = composeEl
        ? composeEl.querySelectorAll('details').length
        : -1;
      const rows = ids.map((bid) => {
        const el = document.getElementById(bid);
        if (!el || !(el instanceof HTMLButtonElement)) {
          return { id: bid, ok: false, reason: 'no-button' };
        }
        const rect = el.getBoundingClientRect();
        const al = String(el.getAttribute('aria-label') || '').trim();
        const hasVisibleText = String(el.textContent || '').trim().length > 0;
        const nameOk = al.length > 0 || hasVisibleText;
        const sizeOk = rect.height >= 40;
        return {
          id: bid,
          ok: nameOk && sizeOk,
          nameOk,
          sizeOk,
          h: Math.round(rect.height),
          al: al.slice(0, 80)
        };
      });
      return { detailsCount, rows, allOk: rows.every((r) => r.ok) };
    });

    expect(audit.detailsCount, 'primary compose should have exactly one details').toBe(
      1
    );
    expect(audit.allOk, JSON.stringify(audit.rows)).toBe(true);
  });
});
