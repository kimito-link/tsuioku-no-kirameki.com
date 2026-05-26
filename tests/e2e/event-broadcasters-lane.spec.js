import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_RECORDING = 'nls_recording_enabled';
const KEY_EVENT_SCORE = 'nls_event_score_ranking_lv888888888';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('参加配信者レーン: スコアランキングカード表示・記名はリンク', async ({ context }) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;

  await sw.evaluate(
    async ({ watchUrl, watchKey, recordingKey, scoreKey }) => {
      await chrome.storage.local.set({
        [watchKey]: watchUrl,
        [recordingKey]: true,
        [scoreKey]: {
          liveId: 'lv888888888',
          rows: [
            {
              rank: 1,
              name: '心花',
              score: 123456,
              isAnonymous: false,
              userPageUrl: 'https://www.nicovideo.jp/user/88888888'
            },
            {
              rank: 2,
              name: '馬場龍之介とその仲間たち',
              score: 98765,
              isAnonymous: false,
              userPageUrl: 'https://www.nicovideo.jp/user/22222222'
            }
          ]
        }
      });
    },
    {
      watchUrl: MOCK_WATCH,
      watchKey: KEY_LAST_WATCH_URL,
      recordingKey: KEY_RECORDING,
      scoreKey: KEY_EVENT_SCORE
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

  const body = popup.locator('#northStarLaneBody-eventBroadcasters');
  await expect(body).toBeAttached();

  // 配信者名が出る（rows が描画されている）
  await expect
    .poll(async () => (await body.innerHTML().catch(() => '')).includes('心花'), {
      timeout: 8000
    })
    .toBe(true);

  // レーン枠が表示されている（hidden が外れている）
  const lane = popup.locator('.nl-north-star-lane[data-lane="eventBroadcasters"]');
  await expect(lane).not.toHaveAttribute('hidden', /.*/);

  // 横並びカード
  await expect(body).toHaveClass(/nl-top-support-rank--below-cards/);

  // 記名行の user ページへの <a>（2 行とも記名なので 2 リンク）
  const links = body.locator('a.nl-top-support-rank__line--linkable');
  await expect(links).toHaveCount(2);
  await expect(links.first()).toHaveAttribute('href', 'https://www.nicovideo.jp/user/88888888');

  // スコアが表示されている
  const text = await body.innerText();
  expect(text).toContain('123456');

  // レーンを画面内に送ってから撮る
  await lane.scrollIntoViewIfNeeded().catch(() => {});
  await popup.waitForTimeout(200);
  await lane.screenshot({ path: 'test-results/event-broadcasters-lane.png' }).catch(async () => {
    await popup.screenshot({ path: 'test-results/event-broadcasters-lane.png', fullPage: true });
  });
});

test('参加配信者レーン: イベントランキング無しではレーン枠を隠す', async ({ context }) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;

  await sw.evaluate(
    async ({ watchUrl, watchKey, recordingKey, scoreKey }) => {
      await chrome.storage.local.remove([scoreKey]);
      await chrome.storage.local.set({
        [watchKey]: watchUrl,
        [recordingKey]: true
      });
    },
    {
      watchUrl: MOCK_WATCH,
      watchKey: KEY_LAST_WATCH_URL,
      recordingKey: KEY_RECORDING,
      scoreKey: KEY_EVENT_SCORE
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

  // レーン枠は hidden 属性が付いて隠れる
  const lane = popup.locator('.nl-north-star-lane[data-lane="eventBroadcasters"]');
  await expect(lane).toHaveAttribute('hidden', /.*/);
});
