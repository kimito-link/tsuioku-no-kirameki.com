/**
 * v0.1.415: 過去ログ取り込みの「りんくの語り」が stopReason で正直に出し分けることを
 * 実拡張ロードで検証する。
 *
 * 問題（ユーザー指摘 2026-05-27）:
 *   取り込みが途中（時間切れ/混雑/入口なし）で止まっても、finally が一律 done=1 を立て、
 *   りんくが「配信のはじめまで、ぜんぶ届いたよ✨」と誤宣言していた（実機 13% で達成宣言→
 *   後から 95% まで増える）。
 *
 * 根治: crawl の stopReason を progress に含め、reached_start の時だけ達成を言う。
 *   ここでは KEY_BACKFILL_PROGRESS を SW から書き、popup の onChanged リスナーが
 *   A 内 hint の文言（data-phase / lead）を正しく更新することを確認する。
 *
 * v0.1.450 (PR5) 追従:
 *   - B (#backfillFetchPrompt / #backfillRinku) が廃止され、A 内
 *     (#liveStatCommentsBackfillHint / #recordCardBackfillRinku / #recordCardBackfillRinkuLead)
 *     に集約された。locator を A 用 ID に更新。
 *   - A 内 hint は設計上「進行中（fetching/progress）は沈黙」のため、3 つ目のテスト
 *     （取り込み中の演出）は「A 内 hint は hidden のまま」を期待する形に書き換えた。
 *     done 時の partial/reached_start 文言テストは引き続き有効。
 */

import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_BACKFILL_PROGRESS = 'nls_backfill_progress_v1';
const LV = 'lv888888888';

/** popup を開き、mock watch を前面にして lv を解決させる。 */
async function openPopupResolvedToMockWatch(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  const extensionId = new URL(sw.url()).hostname;

  await sw.evaluate(
    async ({ lastWatchKey, watchUrl }) => {
      await chrome.storage.local.set({ [lastWatchKey]: watchUrl });
    },
    { lastWatchKey: KEY_LAST_WATCH_URL, watchUrl: MOCK_WATCH }
  );

  const watch = await context.newPage();
  await watch.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
  await expect(watch.locator('#e2e-mock-viewer-count-sentinel')).toBeAttached();

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await focusMockWatchThenReloadPopup(watch, popup);
  await dismissExtensionUsageTermsGate(popup);
  // v0.1.450: 記録カード内 hint の wrapper が attached（lv 解決済み）まで待つ。
  //   hidden 属性で隠れてもよい（progress を書く前は idle で hidden）。
  await expect(popup.locator('#liveStatCommentsBackfillHint')).toBeAttached({
    timeout: 20_000
  });
  return { sw, popup };
}

/** SW から KEY_BACKFILL_PROGRESS を書く（onChanged を発火）。 */
async function writeProgress(sw, progress) {
  await sw.evaluate(
    async ({ key, value }) => {
      await chrome.storage.local.set({ [key]: value });
    },
    { key: KEY_BACKFILL_PROGRESS, value: progress }
  );
}

test.describe('backfill rinku honest completion (v0.1.415 / v0.1.450 A 集約)', () => {
  test('cap_elapsed で途中終了 → 「ぜんぶ届いた」と言わず「もう一度」と促す（partial）', async ({
    context
  }) => {
    const { sw, popup } = await openPopupResolvedToMockWatch(context);

    await writeProgress(sw, {
      lid: LV,
      seg: 120,
      rows: 238,
      done: 1,
      stopReason: 'cap_elapsed',
      ts: Date.now()
    });

    // A 内 hint の wrapper が visible になる（partial = no_entry/partial/paused のひとつ）。
    const wrapper = popup.locator('#liveStatCommentsBackfillHint');
    await expect(wrapper).toBeVisible({ timeout: 10_000 });

    const rinku = popup.locator('#recordCardBackfillRinku');
    await expect(rinku).toHaveAttribute('data-phase', 'partial', { timeout: 10_000 });

    const lead = (await popup.locator('#recordCardBackfillRinkuLead').innerText()).trim();
    console.log('[honest-completion partial] lead:', lead);
    expect(lead).not.toContain('ぜんぶ届いた');
    expect(lead).toContain('もう一度');
  });

  test('reached_start で完走 → A 内 hint は沈黙する（done は記録カードに出さない設計）', async ({
    context
  }) => {
    // v0.1.450: 設計上、reached_start の done では記録カード hint は hidden（達成感は
    //   ボタンや他の場所で十分・記録カードを散らかさない）。これは v0.1.438 から続く
    //   backfillRecordCardHint の方針で、純関数テスト（unit）でも fetching/progress/done/
    //   done_empty/idle は hidden=true で固定されている。e2e でもこの挙動を実証する。
    const { sw, popup } = await openPopupResolvedToMockWatch(context);

    await writeProgress(sw, {
      lid: LV,
      seg: 900,
      rows: 1885,
      done: 1,
      stopReason: 'reached_start',
      ts: Date.now()
    });

    // 少し待ってから hidden を確認（onChanged が反映されるまで）。
    const wrapper = popup.locator('#liveStatCommentsBackfillHint');
    await expect.poll(async () => (await wrapper.isHidden()) ? 'hidden' : 'visible', {
      timeout: 10_000
    }).toBe('hidden');
  });

  test('取り込み中（done=0・件数あり）→ A 内 hint は沈黙する（進行中は記録カードを散らかさない）', async ({
    context
  }) => {
    // v0.1.450: 設計上、fetching/progress では A 内 hint は hidden。進行中の演出は別レーン
    //   (#liveStatCommentsIngest = 取り込みハートビート) に任せて、記録カードのコメント数
    //   表示と隣接する hint は static な状況のときだけ出す（no_entry/partial/paused/caught_up）。
    const { sw, popup } = await openPopupResolvedToMockWatch(context);

    await writeProgress(sw, {
      lid: LV,
      seg: 10,
      rows: 42,
      done: 0,
      stopReason: '',
      ts: Date.now()
    });

    const wrapper = popup.locator('#liveStatCommentsBackfillHint');
    await expect.poll(async () => (await wrapper.isHidden()) ? 'hidden' : 'visible', {
      timeout: 10_000
    }).toBe('hidden');
  });

  test('backward_exhausted で件数 0 → 「過去ログは今は遡れませんでした」(no_entry)', async ({
    context
  }) => {
    // v0.1.450: 入口が見つからないケース（rows=0 + backward_exhausted）。
    //   A 内 hint は no_entry を visible で出し、「少し経つと取り込めることがあります」と案内する。
    //   これがユーザー要望「もう一度ボタンが近くにある」状態を実現する典型ケース。
    const { sw, popup } = await openPopupResolvedToMockWatch(context);

    await writeProgress(sw, {
      lid: LV,
      seg: 0,
      rows: 0,
      done: 1,
      stopReason: 'backward_exhausted',
      ts: Date.now()
    });

    const wrapper = popup.locator('#liveStatCommentsBackfillHint');
    await expect(wrapper).toBeVisible({ timeout: 10_000 });

    const rinku = popup.locator('#recordCardBackfillRinku');
    await expect(rinku).toHaveAttribute('data-phase', 'no_entry', { timeout: 10_000 });

    const lead = (await popup.locator('#recordCardBackfillRinkuLead').innerText()).trim();
    expect(lead).toContain('過去ログ');
    expect(lead).toContain('少し経つと');

    // v0.1.450 (PR3): visible 時に A 内 ↻ もう一度ためす ボタンが動的挿入されること。
    const retryBtn = popup.locator('#recordCardBackfillRetryBtn');
    await expect(retryBtn).toBeVisible({ timeout: 5_000 });
  });
});
