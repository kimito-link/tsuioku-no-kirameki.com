import { test, expect, enableInlinePanelAutoshow } from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * v0.1.392 実機実証（2026-05-26）。
 *
 * ユーザー要望「公式パネルの数値をリアルタイムにしてほしい」。
 * 上流（ニコ生ページ DOM）は常時 live なので、遅れの実体は popup の polling 間隔だった
 * （inline は従来 10 秒）。本テストは、inline パネルを実拡張で表示した状態で
 * watch ページの「視聴中人数」テキストを書き換えると、パネルの来場者数カードが
 * **数秒以内**に追従する（= 3 秒 polling が live DOM を取り込む）ことを実証する。
 *
 * これが無いと「間隔を縮めたつもりで実は反映されない」回帰に気づけない
 * （[[feedback_verify_in_real_browser_before_reporting]]）。
 */

const KEY_RECORDING = 'nls_recording_enabled';
const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const STORAGE_COMMENTS = 'nls_comments_lv888888888';
const INLINE_HOST_ID = 'nls-inline-popup-host';

test.describe('inline パネル リアルタイム更新（実拡張）', () => {
  test('視聴中人数を書き換えると数秒で来場者数カードが追従する', async ({ context }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });

    await enableInlinePanelAutoshow(context);
    await sw.evaluate(
      async ({ recordingKey, lastWatchKey, commentsKey, watchUrl }) => {
        await chrome.storage.local.set({
          [recordingKey]: true,
          [lastWatchKey]: watchUrl,
          [commentsKey]: []
        });
      },
      {
        recordingKey: KEY_RECORDING,
        lastWatchKey: KEY_LAST_WATCH_URL,
        commentsKey: STORAGE_COMMENTS,
        watchUrl: MOCK_WATCH
      }
    );

    const page = await context.newPage();
    await page.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
    await expect(page.locator('#e2e-mock-viewer-count-sentinel')).toBeAttached();

    // inline パネル（cross-origin extension iframe）が出るのを待つ。
    await expect(page.locator(`#${INLINE_HOST_ID}`)).toBeVisible({ timeout: 30_000 });
    const panel = page.frameLocator(`#${INLINE_HOST_ID} iframe`);

    const viewerText = async () =>
      (await panel.locator('#watchViewerDom').innerText()).replace(/[,，\s]/g, '');

    // 初期値（mock は「現在 9,876人が視聴中」）に追従するまで待つ。
    await expect
      .poll(viewerText, {
        timeout: 30_000,
        message: '来場者数カードが mock の初期値 9876 になるまで'
      })
      .toBe('9876');

    // ★watch ページ DOM の視聴中人数を書き換える（ニコ生側が live 更新した状況の再現）。
    await page.evaluate(() => {
      const el = document.getElementById('e2e-mock-viewer-count-sentinel');
      if (el) el.innerHTML = '現在 <strong>12,345人が視聴中</strong>';
    });

    // 3 秒 polling が live DOM を取り込み、カードが新値に追従する（数秒以内）。
    await expect
      .poll(viewerText, {
        timeout: 12_000,
        message: '書き換え後、来場者数カードが 12345 に追従するまで（3 秒 polling）'
      })
      .toBe('12345');
  });
});
