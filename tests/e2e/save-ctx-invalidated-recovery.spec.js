import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * v0.1.396 実機実証（2026-05-26）。
 *
 * ユーザー報告: HTML保存で「HTML の保存に失敗しました（Extension context invalidated.）」が出て、
 * 消える文言だけで「壊れた」ように見える。これは拡張が更新され古いページとの接続が切れた状態で、
 * ページ再読み込みで直るが、案内が分かりにくかった。
 *
 * v0.1.396: 保存/マーケが context-invalidated になったら、ワンクリック復帰できる
 * 「拡張の接続が切れました／このパネルを再読み込み」バナー(#extensionContextBanner)を即出す。
 *
 * 検証: 保存ボタンの裏で chrome.storage.local.get を「Extension context invalidated」で
 * throw させ、HTML保存を押す → 再読み込みバナーが visible になり、案内文言が出ることを確認。
 */

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_RECORDING = 'nls_recording_enabled';
const STORAGE_COMMENTS = 'nls_comments_lv888888888';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('保存が context-invalidated のとき、ワンクリック再読み込みバナーを出す', async ({
  context
}) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;

  await sw.evaluate(
    async ({ watchUrl, watchKey, recordingKey, commentsKey }) => {
      await chrome.storage.local.set({
        [watchKey]: watchUrl,
        [recordingKey]: true,
        [commentsKey]: [
          { id: 'lv888888888::c1', liveId: 'lv888888888', commentNo: '1', userId: 'u1', text: 'hi', capturedAt: Date.now() }
        ]
      });
    },
    {
      watchUrl: MOCK_WATCH,
      watchKey: KEY_LAST_WATCH_URL,
      recordingKey: KEY_RECORDING,
      commentsKey: STORAGE_COMMENTS
    }
  );

  const watch = await context.newPage();
  await watch.goto(MOCK_WATCH, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await dismissExtensionUsageTermsGate(popup);
  await focusMockWatchThenReloadPopup(watch, popup);
  await dismissExtensionUsageTermsGate(popup);

  // バナーは最初は隠れている。
  await expect(popup.locator('#extensionContextBanner')).toBeHidden();

  // 保存処理の裏の storage.get を「Extension context invalidated」で投げさせる。
  await popup.evaluate(() => {
    const orig = chrome.storage.local.get.bind(chrome.storage.local);
    // @ts-ignore - テスト用に差し替え
    chrome.storage.local.get = (...args) => {
      const cb = args[args.length - 1];
      const err = new Error('Extension context invalidated.');
      if (typeof cb === 'function') {
        // callback 形式
        throw err;
      }
      return Promise.reject(err);
    };
    void orig;
  });

  // HTML 保存ボタンの入力契約を整えてクリック。
  const exportBtn = popup.locator('#exportJson');
  await expect(exportBtn).toBeAttached();
  await exportBtn.evaluate(
    (el, { lv, key, watchUrl }) => {
      const btn = /** @type {HTMLButtonElement} */ (el);
      btn.dataset.liveId = lv;
      btn.dataset.storageKey = key;
      btn.dataset.watchUrl = watchUrl;
      btn.disabled = false;
    },
    { lv: 'lv888888888', key: STORAGE_COMMENTS, watchUrl: MOCK_WATCH }
  );
  await exportBtn.click();

  // ワンクリック復帰バナーが出る（これが復帰手段の本体）。
  await expect(popup.locator('#extensionContextBanner')).toBeVisible({ timeout: 10_000 });
  await expect(popup.locator('#extensionContextBannerReload')).toBeVisible();
  // 案内文言（postStatus は隠れ得るので textContent で読む）。
  await expect
    .poll(
      async () =>
        popup.locator('#postStatus').evaluate((el) => el.textContent || '').catch(() => ''),
      { timeout: 8_000 }
    )
    .toContain('再読み込み');
});
