import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * v0.1.332: 待機UIの正直化を実ブラウザ（実拡張）で実証する。
 *
 * rescue-link 配信（koken/DOM/iframe 3経路とも永久に空）で iframe_unrendered の
 * 待機UIが永久に出続け「固まった」印象を与える真因3への対処。
 *
 * 検証分担:
 *  - 確定文言への遷移ロジック（閾値・後方互換・field6 silence）= lib unit test
 *    (northStarLaneWaitingUi.test.js 16件) で担保。
 *  - 本 e2e = 「貢献度が取れない配信で待機UIが実拡張に実際に表示される」統合確認
 *    （待機UIが出るからこそ、閾値超で確定文言へ遷移する経路が意味を持つ）。
 *    50s 経過の実時間待ちは非現実的なので、待機UIの存在と data-lane-state を観測する。
 */

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_RECORDING = 'nls_recording_enabled';
const STORAGE_COMMENTS = 'nls_comments_lv888888888';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('待機UI正直化: 貢献度が取れない配信で待機UIが実拡張に表示される', async ({ context }) => {
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

  // 待機UI（取得待ち）が実際に表示される＝確定文言遷移の前提が実拡張で成立している。
  await expect
    .poll(
      async () => {
        const state = await body.getAttribute('data-lane-state').catch(() => null);
        const html = await body.innerHTML().catch(() => '');
        return { state, hasWaitUi: html.includes('nl-north-star-lane-wait') };
      },
      { timeout: 10_000 }
    )
    .toMatchObject({ hasWaitUi: true });

  const text = await body.innerText();
  console.log('contribution lane (no data) text:', JSON.stringify(text));

  // 待機メッセージが出ている（取得待ちのキャラ台詞）。閾値前なので確定文言ではない。
  expect(text.length).toBeGreaterThan(0);
  // 内部キーや数値の誤露出が無いこと（field6 silence・待機段階で順位を出さない）。
  expect(text).not.toContain('__');
  expect(text).not.toContain('undefined');

  await popup.screenshot({ path: 'test-results/lane-wait-honest.png', fullPage: false });
});
