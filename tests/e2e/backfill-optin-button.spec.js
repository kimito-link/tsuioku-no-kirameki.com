import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/**
 * v0.1.405: 過去ログ一括バックフィル opt-in ボタンの実ブラウザ配線検証。
 *
 * ここで確かめるのは「popup のボタン → storage フラグ」までの配線が実拡張で動くこと。
 * 巡回エンジン本体（crawlNdgrBackward）の停止条件・デコード・throttle は純関数 unit
 * （ndgrBackfillCrawl.test.js 12件）で実 wire フィクスチャ検証済みなので、ここでは
 * UI 操作が KEY_BACKFILL_ENABLED を立て、content の onChanged 起動の引き金になる
 * 「false → true 立ち上がり」を確実に作ることを実拡張ロードで実証する。
 */
const KEY_RECORDING = 'nls_recording_enabled';
const KEY_BACKFILL_ENABLED = 'nls_backfill_enabled';
const KEY_LAST_WATCH_URL = 'nls_last_watch_url';

test.describe('過去ログ取り込み opt-in ボタン（β）', () => {
  test('ボタン押下で KEY_BACKFILL_ENABLED が true になり、状態テキストが出る', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;

    // 記録 ON + 直近 watch URL をセット（prompt は lid があると表示される）。
    await sw.evaluate(
      async ({ recKey, watchKey, watchUrl, backfillKey }) => {
        await chrome.storage.local.set({
          [recKey]: true,
          [watchKey]: watchUrl
        });
        // 念のため初期状態は未設定（OFF）に。
        await chrome.storage.local.remove(backfillKey);
      },
      {
        recKey: KEY_RECORDING,
        watchKey: KEY_LAST_WATCH_URL,
        watchUrl: MOCK_WATCH,
        backfillKey: KEY_BACKFILL_ENABLED
      }
    );

    // mock watch を前面にしてから popup を開く（watch 解決済みのペイントに合わせる）。
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

    // prompt とボタンが出る（lid があるので表示）。
    const btn = popup.locator('#enableBackfillFetchBtn');
    await expect(btn).toBeVisible({ timeout: 20_000 });

    // 押下前はフラグ未設定（OFF）。
    const before = await sw.evaluate((key) => {
      return new Promise((resolve) => {
        chrome.storage.local.get(key, (r) => resolve(r[key] ?? null));
      });
    }, KEY_BACKFILL_ENABLED);
    expect(before).toBeNull();

    await btn.click();

    // 押下で true になる（content の onChanged false→true 立ち上がりの引き金）。
    await expect
      .poll(
        async () =>
          sw.evaluate((key) => {
            return new Promise((resolve) => {
              chrome.storage.local.get(key, (r) => resolve(r[key] === true));
            });
          }, KEY_BACKFILL_ENABLED),
        { timeout: 10_000 }
      )
      .toBe(true);

    // 状態テキストが表示される（「取り込み中…」）。
    await expect(popup.locator('#backfillFetchStatus')).toBeVisible({ timeout: 10_000 });
  });

  test('lid が無い（empty state）ときは prompt を出さない', async ({ context }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;

    // 直近 watch URL を消す → empty state。
    await sw.evaluate(
      async ({ watchKey, backfillKey }) => {
        await chrome.storage.local.remove(watchKey);
        await chrome.storage.local.remove(backfillKey);
      },
      { watchKey: KEY_LAST_WATCH_URL, backfillKey: KEY_BACKFILL_ENABLED }
    );

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await dismissExtensionUsageTermsGate(popup);
    await popup.waitForTimeout(600);

    // prompt は hidden のまま。
    await expect(popup.locator('#backfillFetchPrompt')).toBeHidden();
  });
});
