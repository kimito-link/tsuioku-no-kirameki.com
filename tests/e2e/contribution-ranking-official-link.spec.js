import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * v0.1.316: 貢献度ランキングレーンが、公式 koken API 由来の userPageUrl がある
 * 記名行だけを niconico ユーザーページへの <a> リンクにすることを実ブラウザで実証。
 * 匿名行・uid 無し行はリンク化しない（推測ゼロ・公式提供分のみ・誤マージ不能）。
 *
 * v0.1.338: 貢献度ランキングを縦リストから「横並びカード」（ギフト履歴/広告と同型の
 *   `nl-top-support-rank--below-cards`）に統一。リンク行は `a.nl-top-support-rank__line--linkable`
 *   になり、href・rel・「さん」付き表示・上位10名 cap は維持。匿名行はリンク化しない。
 */

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_RECORDING = 'nls_recording_enabled';
const KEY_KOKEN = 'nls_koken_api_contrib_lv888888888';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('貢献度ランキング: 記名行(公式userPageUrl)はリンク化・匿名行はしない', async ({
  context
}) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;

  await sw.evaluate(
    async ({ watchUrl, watchKey, recordingKey, kokenKey }) => {
      await chrome.storage.local.set({
        [watchKey]: watchUrl,
        [recordingKey]: true,
        // resolveContributionRankingRowsFromSources が読む koken storage 形 { liveId, rows }
        [kokenKey]: {
          liveId: 'lv888888888',
          capturedAt: Date.now(),
          rows: [
            {
              rank: 1,
              name: '貢献タロウ',
              contribution: 5000,
              isAnonymous: false,
              thumbnailUrl: '',
              userPageUrl: 'https://www.nicovideo.jp/user/4046119'
            },
            { rank: 2, name: '名無し', contribution: 1000, isAnonymous: true, thumbnailUrl: '' }
          ]
        }
      });
    },
    {
      watchUrl: MOCK_WATCH,
      watchKey: KEY_LAST_WATCH_URL,
      recordingKey: KEY_RECORDING,
      kokenKey: KEY_KOKEN
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
  await popup.waitForTimeout(1500);

  const body = popup.locator('#northStarLaneBody-contributionRanking');
  await expect(body).toBeAttached();
  await expect
    .poll(async () => (await body.innerHTML().catch(() => '')).includes('貢献タロウ'), {
      timeout: 8000
    })
    .toBe(true);

  // v0.1.338: 横並びカード（ギフト履歴/広告と同型）に統一されている。
  await expect(body).toHaveClass(/nl-top-support-rank--below-cards/);

  // 記名行は user ページへの <a>（横カードの linkable 行）。
  const link = body.locator('a.nl-top-support-rank__line--linkable');
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute('href', 'https://www.nicovideo.jp/user/4046119');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(link).toContainText('貢献タロウ');

  // 匿名行はリンク化されない（リンクは記名1件のみ）。匿名は公式準拠の「名無し」表示（v0.1.317）。
  const text = await body.innerText();
  expect(text).toContain('名無し');
  expect(text).not.toContain('__anon');
  expect(text).not.toContain('__contrib_');

  await popup.screenshot({
    path: 'test-results/contribution-ranking-official-link.png',
    fullPage: false
  });
});
