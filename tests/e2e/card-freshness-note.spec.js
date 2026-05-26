import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * v0.1.393 実機実証（2026-05-26・会議 D-PR4）。
 *
 * ユーザー痛点「数字が変わってるか不安／時間が経っても変わらない」に対し、各カードに
 * 「最終更新: ○秒前」を出して鮮度を可視化する。会議結論 C: 周期は揃えず鮮度UIを統一。
 *   - 貢献度（koken API・30秒自動更新）: 「最終更新: ○秒前・自動更新中」が出る
 *   - ギフト履歴（ギフトタブ開いた時だけ取込＝自動更新でない）: 「最終更新: ○分前」だけ
 *     （「自動更新中」は付けない＝正直に）
 *
 * 実拡張を実ブラウザに load して、生成された北極星レーンに鮮度行が出ることを実証する
 * （[[feedback_verify_in_real_browser_before_reporting]]）。
 */

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_RECORDING = 'nls_recording_enabled';
const KEY_KOKEN = 'nls_koken_api_contrib_lv888888888';
const KEY_GIFT_THROWS = 'nls_gift_history_throws_lv888888888';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('カード鮮度: 貢献度は「自動更新中」付き / ギフト履歴は経過のみ', async ({ context }) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;

  await sw.evaluate(
    async ({ watchUrl, watchKey, recordingKey, kokenKey, giftKey }) => {
      const now = Date.now();
      // 貢献度: たった今取得（自動更新中が付くはず）
      const contribRows = ['カムイ', 'まさる', 'かめいは'].map((name, i) => ({
        rank: i + 1,
        name,
        contribution: 1000 - i * 100,
        isAnonymous: false,
        thumbnailUrl: ''
      }));
      // ギフト履歴: 4 分前に取得（自動更新でない＝経過のみ）
      const giftRows = [
        { userId: 'u_rio', nickname: 'リオ', totalPoints: 530, throwCount: 2, capturedAt: now - 4 * 60 * 1000 },
        { userId: 'u_mus', nickname: '武蔵ボビー', totalPoints: 500, throwCount: 1, capturedAt: now - 4 * 60 * 1000 }
      ];
      await chrome.storage.local.set({
        [watchKey]: watchUrl,
        [recordingKey]: true,
        [kokenKey]: { liveId: 'lv888888888', capturedAt: now, rows: contribRows },
        [giftKey]: giftRows
      });
    },
    {
      watchUrl: MOCK_WATCH,
      watchKey: KEY_LAST_WATCH_URL,
      recordingKey: KEY_RECORDING,
      kokenKey: KEY_KOKEN,
      giftKey: KEY_GIFT_THROWS
    }
  );

  const watch = await context.newPage();
  await watch.goto(MOCK_WATCH, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 400, height: 800 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await dismissExtensionUsageTermsGate(popup);
  await focusMockWatchThenReloadPopup(watch, popup);

  // 貢献度レーン: 「自動更新中」付きの鮮度行が出る。
  const contribBody = popup.locator('#northStarLaneBody-contributionRanking');
  await expect(contribBody).toBeAttached();
  await expect
    .poll(async () => (await contribBody.innerText().catch(() => '')).includes('カムイ'), {
      timeout: 12_000
    })
    .toBe(true);
  const contribFresh = contribBody.locator('.nl-top-support-rank__freshness');
  await expect(contribFresh).toBeAttached();
  const contribText = (await contribFresh.innerText()).trim();
  expect(contribText, '貢献度は自動更新中が付く').toMatch(/最終更新: .+・自動更新中/);

  // ギフト履歴レーン: 経過のみ（「自動更新中」は付かない）。
  const giftBody = popup.locator('#northStarLaneBody-giftHistory');
  await expect(giftBody).toBeAttached();
  await expect
    .poll(async () => (await giftBody.innerText().catch(() => '')).includes('リオ'), {
      timeout: 12_000
    })
    .toBe(true);
  const giftFresh = giftBody.locator('.nl-top-support-rank__freshness');
  await expect(giftFresh).toBeAttached();
  const giftText = (await giftFresh.innerText()).trim();
  expect(giftText, 'ギフト履歴は「○分前」が出る').toMatch(/最終更新: \d+分前/);
  expect(giftText, 'ギフト履歴に「自動更新中」は付かない').not.toContain('自動更新中');
});
