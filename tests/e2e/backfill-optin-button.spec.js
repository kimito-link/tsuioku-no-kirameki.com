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
 * v0.1.450 (PR5) 追従:
 *   B (#backfillFetchPrompt / #enableBackfillFetchBtn) は廃止され、A 内
 *   (#liveStatCommentsBackfillHint / #recordCardBackfillRetryBtn) に集約された。
 *
 *   A 内ボタンは「記録カード hint が visible のときだけ動的挿入」される設計。
 *   visible にするには、進捗を直接 storage に書いて hint が no_entry/partial/paused のいずれかの
 *   フェーズに入ったところで初めてボタンが appendChild される。
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
const KEY_BACKFILL_PROGRESS = 'nls_backfill_progress_v1';
const LV = 'lv888888888';

test.describe('過去ログ取り込み opt-in ボタン (v0.1.450 A 集約)', () => {
  test('ボタン押下で KEY_BACKFILL_ENABLED が true になり、retry_started トーストが出る', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;

    // 記録 ON + 直近 watch URL をセット + 入口なし(no_entry) 進捗を仕込む。
    //   進捗が無いと A 内 hint が hidden のままで、ボタンが appendChild されない。
    //   no_entry にすると hint が visible になり、ボタンが動的挿入される。
    await sw.evaluate(
      async ({
        recKey,
        watchKey,
        watchUrl,
        backfillKey,
        progressKey,
        progress
      }) => {
        await chrome.storage.local.set({
          [recKey]: true,
          [watchKey]: watchUrl,
          [progressKey]: progress
        });
        await chrome.storage.local.remove(backfillKey);
      },
      {
        recKey: KEY_RECORDING,
        watchKey: KEY_LAST_WATCH_URL,
        watchUrl: MOCK_WATCH,
        backfillKey: KEY_BACKFILL_ENABLED,
        progressKey: KEY_BACKFILL_PROGRESS,
        progress: {
          lid: LV,
          seg: 0,
          rows: 0,
          done: 1,
          stopReason: 'backward_exhausted',
          ts: Date.now()
        }
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

    // hint が visible になり、A 内ボタンが appendChild される。
    const wrapper = popup.locator('#liveStatCommentsBackfillHint');
    await expect(wrapper).toBeVisible({ timeout: 20_000 });
    const btn = popup.locator('#recordCardBackfillRetryBtn');
    await expect(btn).toBeVisible({ timeout: 10_000 });

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

    // 押下直後トースト: PR1 純関数 backfillRecordCardHintDomState が
    //   retry_started を返し、A 内 hint の文言が「ありがとう…」になる。
    //   トースト期間（1.8秒）以内に検証する必要がある。
    const rinku = popup.locator('#recordCardBackfillRinku');
    await expect(rinku).toHaveAttribute('data-phase', 'retry_started', {
      timeout: 2_000
    });
    const lead = await popup.locator('#recordCardBackfillRinkuLead').innerText();
    expect(lead).toContain('ありがとう');
  });

  test('lid が無い（empty state）ときは hint を出さない', async ({ context }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;

    // 直近 watch URL を消す → empty state（lid 無し）。
    await sw.evaluate(
      async ({ watchKey, backfillKey, progressKey }) => {
        await chrome.storage.local.remove(watchKey);
        await chrome.storage.local.remove(backfillKey);
        await chrome.storage.local.remove(progressKey);
      },
      {
        watchKey: KEY_LAST_WATCH_URL,
        backfillKey: KEY_BACKFILL_ENABLED,
        progressKey: KEY_BACKFILL_PROGRESS
      }
    );

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await dismissExtensionUsageTermsGate(popup);
    await popup.waitForTimeout(600);

    // hint は hidden のまま。
    await expect(popup.locator('#liveStatCommentsBackfillHint')).toBeHidden();
  });
});
