import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * v0.1.319: 北極星「イベント現在順位」レーンが、bundle.eventBanner.rank（audition
 * iframe 新DOMから scrape した現在順位）を「現在 N 位」で表示することを実ブラウザで実証。
 * scrape の DOM 解釈は officialEventBannerDom.test.js（unit）で固定。本 e2e は
 * 「rank があればレーンに出る」配線を確認する。
 */

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_RECORDING = 'nls_recording_enabled';
const KEY_EVENT_DOM = 'nls_event_dom_lv888888888';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('イベント現在順位: eventBanner.rank=17 がレーンに「現在 17 位」と出る', async ({
  context
}) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;

  await sw.evaluate(
    async ({ watchUrl, watchKey, recordingKey, eventDomKey }) => {
      await chrome.storage.local.set({
        [watchKey]: watchUrl,
        [recordingKey]: true,
        // readOfficialEventDomBundleFromStorage が読む bundle 形（eventBanner.rank を含む）
        [eventDomKey]: {
          capturedAt: Date.now(),
          eventBanner: { rank: 17, score: 10440, title: 'なち', iconUrl: '', ownerText: 'なちさんを応援しよう！', href: '' },
          contributionRanking: null,
          adContributionRanking: null,
          programStats: null,
          giftHistory: null
        }
      });
    },
    {
      watchUrl: MOCK_WATCH,
      watchKey: KEY_LAST_WATCH_URL,
      recordingKey: KEY_RECORDING,
      eventDomKey: KEY_EVENT_DOM
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

  const body = popup.locator('#northStarLaneBody-eventRank');
  await expect(body).toBeAttached();
  await expect
    .poll(async () => (await body.innerText().catch(() => '')).includes('位'), { timeout: 8000 })
    .toBe(true);

  const text = await body.innerText();
  console.log('event-rank lane:', JSON.stringify(text));
  expect(text).toContain('17');
  expect(text).toContain('位');
  // NDGR 推定ではなく公式 banner 由来なので「目安」注記は出ない
  expect(text).not.toContain('NDGR 推定');

  await popup.screenshot({ path: 'test-results/event-current-rank.png', fullPage: false });
});
