import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * v0.1.352: イベント参加が確認できれば、順位（rank）が取れなくてもイベントカードを
 * 表示する（アンチグラビティ実装 + Claude レビューの安全な両立案）。
 *
 * 背景: 従来は watchOfficialEventBannerCard が rank!=null を表示の必須条件にしていたため、
 *   「イベント参加中だが順位がまだ取れていない」配信ではカードごと消えていた（実機:
 *   「イベント参加中（公式の順位・スコアは取得できていません）」状態）。
 *
 * 安全性（feedback_ndgr_field6_silence 維持）: NDGR field6 の rank/score は非参加配信にも
 *   返るため誤情報の温床。そこで表示の必須条件は「公式バナー/バルーン、または eventTitle が
 *   存在する時」に限定し、rank/score 単独では出さない（hasEvent = banner||balloon||title）。
 *   NDGR の eventTitle は非参加配信には返らない（アンチグラビティ調査で確認）ため、title を
 *   参加判定の主シグナルにできる。
 *
 * 本 e2e は2ケースを実ブラウザで実証:
 *   (A) title あり・rank/score なし → カード表示・順位欄は隠れる（参加中・順位未取得を救う）
 *   (B) banner/balloon/title すべて無し（NDGR rank 単独相当） → カード非表示（誤表示しない）
 */

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_RECORDING = 'nls_recording_enabled';
const KEY_EVENT_DOM = 'nls_event_dom_lv888888888';
const STORAGE_COMMENTS = 'nls_comments_lv888888888';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

async function openPopupForBundle(context, bundle) {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;
  await sw.evaluate(
    async ({ watchUrl, watchKey, recordingKey, commentsKey, eventDomKey, bundleVal }) => {
      await chrome.storage.local.set({
        [watchKey]: watchUrl,
        [recordingKey]: true,
        [commentsKey]: [{ no: 1, content: 'やあ', userId: 'u1', date: Date.now() }],
        [eventDomKey]: bundleVal
      });
    },
    {
      watchUrl: MOCK_WATCH,
      watchKey: KEY_LAST_WATCH_URL,
      recordingKey: KEY_RECORDING,
      commentsKey: STORAGE_COMMENTS,
      eventDomKey: KEY_EVENT_DOM,
      bundleVal: bundle
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
  await popup.waitForTimeout(1800);
  return popup;
}

test('イベントカード: title ありで rank/score なしでも表示され、順位欄だけ隠れる', async ({
  context
}) => {
  const popup = await openPopupForBundle(context, {
    capturedAt: Date.now(),
    // 参加中だが順位・スコアが scrape できていない（title だけ取れている）。
    eventBanner: { rank: null, score: null, title: 'なつまつり', iconUrl: '', ownerText: 'なちさんが参加しています！', href: '' },
    eventBalloon: null,
    contributionRanking: null,
    adContributionRanking: null,
    programStats: null,
    giftHistory: null
  });

  const card = popup.locator('#watchOfficialEventBannerCard');
  await expect(card).toBeAttached();
  // カードは表示される（hidden でない）。
  await expect(card).toBeVisible({ timeout: 8000 });

  // タイトルは出る、順位欄は隠れる（null位 等のゴミを出さない）。
  await expect(popup.locator('#watchOfficialEventBannerTitle')).toHaveText('なつまつり');
  await expect(popup.locator('#watchOfficialEventBannerRank')).toBeHidden();

  await popup.screenshot({ path: 'test-results/event-card-title-no-rank.png', fullPage: false });
});

test('イベントカード: banner/balloon/title すべて無し（NDGR rank 単独相当）は非表示', async ({
  context
}) => {
  const popup = await openPopupForBundle(context, {
    capturedAt: Date.now(),
    // 非参加配信に NDGR rank だけ返ってきた状況を模擬（公式 DOM 由来は何も無い）。
    // bundle 側に banner/balloon/title が無ければ hasEvent=false でカードは出ない。
    eventBanner: null,
    eventBalloon: null,
    contributionRanking: null,
    adContributionRanking: null,
    programStats: null,
    giftHistory: null
  });

  const card = popup.locator('#watchOfficialEventBannerCard');
  await expect(card).toBeAttached();
  // 参加の確証が無いのでカードは隠れたまま（誤情報より沈黙）。
  await expect(card).toBeHidden();
});
