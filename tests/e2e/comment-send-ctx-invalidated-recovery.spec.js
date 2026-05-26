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
 * ユーザー報告: コメント送信が「送信中…」のまま固まる（拡張更新後の古いページで起きる
 * Extension context invalidated）。v0.1.396 で submitComment の finally に、context 喪失時も
 * ボタンを「コメント送信」に直接戻す復帰を入れた（再読み込みバナーも出す＝バナー表示自体は
 * save-ctx-invalidated-recovery.spec.js で実証）。
 *
 * 別ファイルにしているのは、context を汚す stub を使うテスト同士を同一 persistentContext で
 * 走らせると干渉するため（1ファイル=1 context）。
 *
 * 検証: 送信の裏 chrome.tabs.query を投げさせて送信を必ず失敗させ、ボタンが「送信中…」で
 * 固まらず「コメント送信」に復帰することを確認。
 */

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_RECORDING = 'nls_recording_enabled';
const STORAGE_COMMENTS = 'nls_comments_lv888888888';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('コメント送信が失敗しても「送信中…」で固まらずボタンが復帰する', async ({ context }) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;

  await sw.evaluate(
    async ({ watchUrl, watchKey, recordingKey, commentsKey }) => {
      await chrome.storage.local.set({
        [watchKey]: watchUrl,
        [recordingKey]: false, // optimistic ログを挟まず post 経路だけを試す
        [commentsKey]: []
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
  await watch.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
  await watch.waitForTimeout(600);

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await focusMockWatchThenReloadPopup(watch, popup);
  await dismissExtensionUsageTermsGate(popup);

  const postBtn = popup.locator('#postCommentBtn');
  const input = popup.locator('#commentInput');
  await expect(input).toHaveAttribute('placeholder', 'コメントを入力して送信');

  // 送信処理の裏 chrome.tabs.query を投げさせて、送信を必ず失敗させる。
  await popup.evaluate(() => {
    // @ts-ignore - テスト用に差し替え
    chrome.tabs.query = () => Promise.reject(new Error('Extension context invalidated.'));
  });

  await input.fill('元気になってよかった');
  await expect(postBtn).toBeEnabled();
  await postBtn.click();

  // ★核心: 送信失敗でも「送信中…」のまま固まらず「コメント送信」に復帰する。
  await expect(postBtn).toHaveText('コメント送信', { timeout: 10_000 });
});
