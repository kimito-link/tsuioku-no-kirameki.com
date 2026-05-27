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
 *   bubble の文言（data-phase / lead）を正しく更新することを確認する。
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
  // backfill prompt が出る（lv 解決済み）まで待つ。
  await expect(popup.locator('#backfillFetchPrompt')).toBeAttached({ timeout: 20_000 });
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

test.describe('backfill rinku honest completion (v0.1.415)', () => {
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

    const bubble = popup.locator('#backfillRinku');
    await expect(bubble).toBeVisible({ timeout: 10_000 });
    await expect(bubble).toHaveAttribute('data-phase', 'partial', { timeout: 10_000 });

    const lead = (await popup.locator('#backfillRinkuLead').innerText()).trim();
    console.log('[honest-completion partial] lead:', lead);
    expect(lead).not.toContain('ぜんぶ届いた');
    expect(lead).toContain('もう一度');
  });

  test('reached_start で完走 → 「ぜんぶ届いた✨」を表示（done）', async ({ context }) => {
    const { sw, popup } = await openPopupResolvedToMockWatch(context);

    await writeProgress(sw, {
      lid: LV,
      seg: 900,
      rows: 1885,
      done: 1,
      stopReason: 'reached_start',
      ts: Date.now()
    });

    const bubble = popup.locator('#backfillRinku');
    await expect(bubble).toBeVisible({ timeout: 10_000 });
    await expect(bubble).toHaveAttribute('data-phase', 'done', { timeout: 10_000 });

    const lead = (await popup.locator('#backfillRinkuLead').innerText()).trim();
    console.log('[honest-completion done] lead:', lead);
    expect(lead).toContain('届いた');
    // 完了時も正確な件数は出さない（公式件数とのズレを気にさせない）。
    expect(lead).not.toContain('1885');
    expect(lead).not.toContain('1,885');
  });

  test('取り込み中（done=0・件数あり）→ 跳ねる演出（data-phase=progress）', async ({
    context
  }) => {
    const { sw, popup } = await openPopupResolvedToMockWatch(context);

    await writeProgress(sw, {
      lid: LV,
      seg: 10,
      rows: 42,
      done: 0,
      stopReason: '',
      ts: Date.now()
    });

    const bubble = popup.locator('#backfillRinku');
    await expect(bubble).toBeVisible({ timeout: 10_000 });
    await expect(bubble).toHaveAttribute('data-phase', 'progress', { timeout: 10_000 });

    const lead = (await popup.locator('#backfillRinkuLead').innerText()).trim();
    console.log('[honest-completion progress] lead:', lead);
    expect(lead).toContain('42件');
  });
});
