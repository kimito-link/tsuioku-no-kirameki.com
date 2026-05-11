/**
 * v0.1.252: 北極星レーン 1 / 2 の on-demand 取得ボタン UI smoke test。
 *
 * 検証範囲（UI のみ、実際の click → scrape は対象外）:
 *   - mirror html が未取得状態で popup を開く
 *   - レーン 1 body に `#fetchContributionRankingBtn` が動的注入される
 *   - レーン 2 body に `#fetchGiftHistoryBtn` が動的注入される
 *   - ボタン label / hint テキスト / data-loading 初期値が想定通り
 *   - ボタンが disabled でなく、`data-lane-state` が reason 付きで設定される
 *
 * 実際の click → content script 経由の autoOpen フロー検証は、ニコ生 DOM の
 * モックが大規模になるため対象外。本 spec は UI 配線の回帰検出を担当する。
 */

import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

const KEY_RECORDING = 'nls_recording_enabled';
const KEY_LAST_WATCH_URL = 'nls_last_watch_url';

test.describe('popup 北極星レーン 1/2 on-demand 取得ボタン', () => {
  test('mirror html 未取得時、popup body に取得ボタンが動的注入される', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;

    // recording ON + watch URL を seed
    await sw.evaluate(
      async ({ recordingKey, lastWatchKey, watchUrl }) => {
        await chrome.storage.local.set({
          [recordingKey]: true,
          [lastWatchKey]: watchUrl
        });
      },
      {
        recordingKey: KEY_RECORDING,
        lastWatchKey: KEY_LAST_WATCH_URL,
        watchUrl: MOCK_WATCH
      }
    );

    // mock watch を開く
    const watch = await context.newPage();
    await watch.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });

    // popup を開く
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await focusMockWatchThenReloadPopup(watch, popup);
    await dismissExtensionUsageTermsGate(popup);
    await expect(popup.locator('html[data-nl-support-wired]')).toBeAttached({
      timeout: 20_000
    });

    // 北極星レーンの section が居る
    await expect(popup.locator('#northStarLanes')).toBeAttached();

    // レーン 1 body
    const lane1Body = popup.locator('#northStarLaneBody-contributionRanking');
    await expect(lane1Body).toBeAttached();

    // レーン 1 に取得ボタンが動的注入されるまで待つ
    const fetchContribBtn = popup.locator('#fetchContributionRankingBtn');
    await expect(fetchContribBtn).toBeAttached({ timeout: 15_000 });
    await expect(fetchContribBtn).toBeVisible();
    await expect(fetchContribBtn).toHaveText('貢献度ランキングを取得');
    await expect(fetchContribBtn).toHaveAttribute('data-loading', 'false');
    await expect(fetchContribBtn).not.toBeDisabled();

    // レーン 1 body に reason 付き state がセットされる
    // (mirror 未取得 + 配信中 + サイドバー未描画 → iframe_unrendered or no_event or not_yet)
    const lane1State = await lane1Body.getAttribute('data-lane-state');
    expect(['iframe_unrendered', 'no_event', 'not_yet', 'missing']).toContain(
      lane1State
    );

    // hint span に reason 文字列が出る
    const lane1Hint = popup.locator(
      '#northStarLaneBody-contributionRanking .nl-on-demand-fetch__hint'
    );
    await expect(lane1Hint).toBeVisible();
    const lane1HintText = (await lane1Hint.textContent())?.trim() || '';
    // 何らかの reason text が出ること（空ではない）
    expect(lane1HintText.length).toBeGreaterThan(0);
    // popup の placeholder regex の何れか
    expect(lane1HintText).toMatch(
      /(取得待ち|未取得|取得中|イベント不参加|ギフト 0 件|取得エラー)/u
    );

    // レーン 2 body
    const lane2Body = popup.locator('#northStarLaneBody-giftHistory');
    await expect(lane2Body).toBeAttached();

    // レーン 2 取得ボタン
    const fetchHistoryBtn = popup.locator('#fetchGiftHistoryBtn');
    await expect(fetchHistoryBtn).toBeAttached({ timeout: 15_000 });
    await expect(fetchHistoryBtn).toBeVisible();
    await expect(fetchHistoryBtn).toHaveText('ギフト履歴を取得');
    await expect(fetchHistoryBtn).toHaveAttribute('data-loading', 'false');
    await expect(fetchHistoryBtn).not.toBeDisabled();

    // 2 つのボタンが両方共 lane body の子に居る (誤って別 section に出ていない)
    const lane1ButtonInside = await lane1Body.locator('#fetchContributionRankingBtn').count();
    expect(lane1ButtonInside).toBe(1);
    const lane2ButtonInside = await lane2Body.locator('#fetchGiftHistoryBtn').count();
    expect(lane2ButtonInside).toBe(1);
  });

  test('click でボタンが loading 状態に切り替わる (即時の UI 反応のみ)', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;

    await sw.evaluate(
      async ({ recordingKey, lastWatchKey, watchUrl }) => {
        await chrome.storage.local.set({
          [recordingKey]: true,
          [lastWatchKey]: watchUrl
        });
      },
      {
        recordingKey: KEY_RECORDING,
        lastWatchKey: KEY_LAST_WATCH_URL,
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
    await dismissExtensionUsageTermsGate(popup);

    const fetchBtn = popup.locator('#fetchContributionRankingBtn');
    await expect(fetchBtn).toBeAttached({ timeout: 15_000 });

    // click → 即時 disabled + 「取得中…」label
    await fetchBtn.click();
    await expect(fetchBtn).toHaveAttribute('data-loading', 'true', { timeout: 3_000 });
    await expect(fetchBtn).toBeDisabled();
    const loadingText = (await fetchBtn.textContent())?.trim() || '';
    expect(loadingText).toMatch(/取得中/u);
  });
});
