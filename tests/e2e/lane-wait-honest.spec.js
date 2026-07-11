import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * v0.1.332: 待機UIの正直化を実ブラウザ（実拡張）で実証する（rescue-link 配信＝
 * koken/DOM/iframe 3経路とも永久に空、への対処として新設）。
 *
 * ★v0.1.653 で仕様が上書きされた: ユーザー実機要望「ローディング表示を全廃・
 * 無いものは静かに隠せ」により、contributionRanking は
 * NORTH_STAR_API_DIRECT_HIDE_WHEN_EMPTY_LANES に入り、待機UI（「問い合わせ中」案内）
 * を一切出さず静かに畳む(body.innerHTML='')仕様になった。本テストはその新仕様
 * （待機UIを出さず隠れる）を検証する。
 *
 * 検証分担:
 *  - 確定文言への遷移ロジック（閾値・後方互換・field6 silence）= lib unit test
 *    (northStarLaneWaitingUi.test.js) で担保。
 *  - 本 e2e = 「貢献度が取れない配信で待機UIを出さず静かに畳まれる」統合確認。
 */

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_RECORDING = 'nls_recording_enabled';
const STORAGE_COMMENTS = 'nls_comments_lv888888888';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('待機UI正直化: 貢献度が取れない配信で待機UIを出さず静かに畳まれる（v0.1.653）', async ({ context }) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;

  // 貢献度ランキングのデータ源（koken API / DOM bundle / iframe relay）を一切 seed しない
  // ＝ rescue-link 配信相当（取れない）。コメントだけ入れて recording 状態にする。
  await sw.evaluate(
    async ({ watchUrl, watchKey, recordingKey, commentsKey }) => {
      await chrome.storage.local.set({
        [watchKey]: watchUrl,
        [recordingKey]: true,
        [commentsKey]: [{ no: 1, content: 'やあ', userId: 'u1', date: Date.now() }]
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
  await popup.waitForTimeout(2000);

  const body = popup.locator('#northStarLaneBody-contributionRanking');
  await expect(body).toBeAttached();

  // v0.1.653: contributionRanking は待機UIを出さず、data-lane-state を保持したまま
  // 静かに畳まれる（body 空・待機UIの「問い合わせ中」案内は出ない）。
  await expect
    .poll(
      async () => {
        const state = await body.getAttribute('data-lane-state').catch(() => null);
        const html = await body.innerHTML().catch(() => '');
        return {
          state,
          hasWaitUi: html.includes('nl-north-star-lane-wait'),
          isEmpty: html.trim().length === 0
        };
      },
      { timeout: 10_000 }
    )
    .toMatchObject({ hasWaitUi: false, isEmpty: true });

  const state = await body.getAttribute('data-lane-state');
  console.log('contribution lane (no data) state:', JSON.stringify(state));
  // 待機状態であることは data-lane-state に残る（診断用）。
  expect(state).toBeTruthy();

  await popup.screenshot({ path: 'test-results/lane-wait-honest.png', fullPage: false });
});
