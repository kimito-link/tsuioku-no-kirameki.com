import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * v0.1.365: 第2弾「同じイベントに参加中の配信者」レーンを実ブラウザで実証。
 *   content が参加番組一覧 API から視聴者数降順で正規化して保存した rows
 *   （nls_event_participation_<lv>）を、popup が横カードで表示し、記名行は
 *   user ページへの <a> になること。イベント不参加（保存無し）ではレーン枠を隠すこと。
 *
 * ⚠️ この API は順位/スコアを持たない名簿なので「視聴者数の多い順」表示であって
 *   イベント順位ではない（note 文言で明示）。
 */

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_RECORDING = 'nls_recording_enabled';
// MOCK_WATCH の lv に合わせる（fixtures の mock watch は lv888888888）。
const KEY_EVENT_PART = 'nls_event_participation_lv888888888';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('参加配信者レーン: 視聴者数順カード表示・記名はリンク・note 明示', async ({ context }) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;

  await sw.evaluate(
    async ({ watchUrl, watchKey, recordingKey, eventKey }) => {
      await chrome.storage.local.set({
        [watchKey]: watchUrl,
        [recordingKey]: true,
        // content が normalizeEventParticipationResponse で作って保存する形 { liveId, rows }。
        // rows は既に視聴者数降順・rank 振り直し済み（contribution=視聴者数）。
        [eventKey]: {
          liveId: 'lv888888888',
          planningEventId: '472',
          capturedAt: Date.now(),
          rows: [
            {
              rank: 1,
              name: '心花',
              contribution: 27,
              isAnonymous: false,
              programId: 'lv350605888',
              thumbnailUrl:
                'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/8888/88888888.jpg',
              userPageUrl: 'https://www.nicovideo.jp/user/88888888'
            },
            {
              rank: 2,
              name: '馬場龍之介とゆかいな仲間たち',
              contribution: 7,
              isAnonymous: false,
              programId: 'lv350605777',
              thumbnailUrl: '',
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
      eventKey: KEY_EVENT_PART
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

  // 配信者名が出る（rows が描画されている）。
  await expect
    .poll(async () => (await body.innerHTML().catch(() => '')).includes('心花'), {
      timeout: 8000
    })
    .toBe(true);

  // レーン枠が表示されている（hidden が外れている）。
  const lane = popup.locator('.nl-north-star-lane[data-lane="eventBroadcasters"]');
  await expect(lane).not.toHaveAttribute('hidden', /.*/);

  // 横並びカード（ギフト履歴/広告/貢献度と同型）。
  await expect(body).toHaveClass(/nl-top-support-rank--below-cards/);

  // 記名行は user ページへの <a>（2 行とも記名なので 2 リンク）。
  const links = body.locator('a.nl-top-support-rank__line--linkable');
  await expect(links).toHaveCount(2);
  await expect(links.first()).toHaveAttribute('href', 'https://www.nicovideo.jp/user/88888888');

  // 「視聴者数の多い順・イベント順位ではない」と note で明示している。
  const text = await body.innerText();
  expect(text).toContain('視聴者数の多い順');
  expect(text).not.toContain('__contrib_');

  // レーンを画面内へ送ってから撮る（小 viewport だと既定では fold 下に居る）。
  await lane.scrollIntoViewIfNeeded().catch(() => {});
  await popup.waitForTimeout(200);
  await lane.screenshot({ path: 'test-results/event-broadcasters-lane.png' }).catch(async () => {
    await popup.screenshot({ path: 'test-results/event-broadcasters-lane.png', fullPage: true });
  });
});

test('参加配信者レーン: イベント不参加（保存無し）ではレーン枠を隠す', async ({ context }) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;

  await sw.evaluate(
    async ({ watchUrl, watchKey, recordingKey, eventKey }) => {
      // 参加データを明示的に消す（前テストの残骸対策）。
      await chrome.storage.local.remove([eventKey]);
      await chrome.storage.local.set({
        [watchKey]: watchUrl,
        [recordingKey]: true
      });
    },
    {
      watchUrl: MOCK_WATCH,
      watchKey: KEY_LAST_WATCH_URL,
      recordingKey: KEY_RECORDING,
      eventKey: KEY_EVENT_PART
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

  // レーン枠は hidden 属性が付いて隠れている（空枠で縦を食わない）。
  const lane = popup.locator('.nl-north-star-lane[data-lane="eventBroadcasters"]');
  await expect(lane).toHaveAttribute('hidden', /.*/);
});
