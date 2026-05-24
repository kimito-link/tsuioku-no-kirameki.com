import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * v0.1.359: イベント誤表示の根治を実ブラウザで実証する。
 *
 * 症状（実機スクショ）: イベント未参加の普通の配信なのに「○○さんが参加しています！」
 *   バナー / 「イベント現在順位 現在N位」/ 「イベント累計スコア 72」/ 文字化けタイトルが
 *   誤表示されていた。
 *
 * 真因と修正:
 *  1) 表示ゲートを `officialEventConfirmedFromDom(bundle)` に一本化（公式 watch ページ DOM
 *     由来の証拠＝eventBanner / eventBalloon.eventTotalScore / 鏡 HTML が在る時だけ true）。
 *     NDGR の rank/score/title 単独では「参加」と見なさない＝feedback_ndgr_field6_silence に
 *     完全回帰。
 *  2) 文字化けタイトル（NDGR field7-9 の非テキストバイト列の誤デコード）は decode 時点の
 *     純関数ガード `isPlausibleEventTitleText` で遮断（ndgrDecode.test.js が固定）。
 *  3) CSS バグも同時に根治: 補助レーンが `no_event` で非表示になるべき時、JS が付ける
 *     `hidden` 属性が `.nl-north-star-lane { display: flex }` に specificity 負けして効かず、
 *     空レーンが ~170px の縦スペースを占有していた（実機で空の「イベント累計スコア/現在順位」
 *     枠が残る）。`.nl-north-star-lane[hidden]{display:none!important}` を追加して確実に畳む。
 *
 * 本 e2e は実拡張をロードして2方向を実証する:
 *   (A) 非イベントのギフト配信（programStats + giftHistory は在るが公式イベント DOM 証拠は
 *       何も無い）→ 参加バナーは出ず、eventScore / eventRank レーンは offsetHeight=0 で
 *       完全に畳まれる（誤表示せず縦スペースも食わない）。
 *   (B) 公式 DOM 証拠あり（鏡 HTML）→ eventScore に「5,400」、eventRank に「現在 3 位」が
 *       出る（確証ありは正しく表示する）。
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
        [commentsKey]: [{ no: 1, content: 'こんばんは', userId: 'u1', date: Date.now() }],
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

/** 表示/非表示が適用される `.nl-north-star-lane` 枠。 */
function lane(popup, laneId) {
  return popup.locator(`.nl-north-star-lane[data-lane="${laneId}"]`);
}

test('非イベントのギフト配信: 参加バナー/イベントレーンは出ず縦スペースも食わない', async ({
  context
}) => {
  const popup = await openPopupForBundle(context, {
    capturedAt: Date.now(),
    // ギフトは受けている普通の配信。公式「イベント」UI 由来の証拠は一切無い。
    eventBanner: null,
    eventBalloon: null,
    eventCumulativeScoreMirrorHtml: null,
    eventCurrentRankMirrorHtml: null,
    contributionRanking: null,
    adContributionRanking: null,
    programStats: { giftPoints: 1500, watchCount: 320 },
    giftHistory: [{ name: '花火', point: 300 }]
  });

  // 参加バナーは出ない。
  const card = popup.locator('#watchOfficialEventBannerCard');
  await expect(card).toBeAttached();
  await expect(card).toBeHidden();

  // イベント累計スコアレーン: 状態 no_event・本文空・枠は完全に畳まれている。
  const scoreBody = popup.locator('#northStarLaneBody-eventScore');
  await expect(scoreBody).toBeAttached();
  await expect
    .poll(async () => scoreBody.getAttribute('data-lane-state'), { timeout: 8000 })
    .toBe('no_event');
  await expect(lane(popup, 'eventScore')).toBeHidden();
  await expect
    .poll(async () => lane(popup, 'eventScore').evaluate((el) => el.offsetHeight), {
      timeout: 8000
    })
    .toBe(0);
  expect(((await scoreBody.innerText().catch(() => '')) || '').trim()).toBe('');

  // イベント現在順位レーン: 同上（「現在N位」を出さない）。
  const rankBody = popup.locator('#northStarLaneBody-eventRank');
  await expect(rankBody).toBeAttached();
  await expect
    .poll(async () => rankBody.getAttribute('data-lane-state'), { timeout: 8000 })
    .toBe('no_event');
  await expect(lane(popup, 'eventRank')).toBeHidden();
  await expect
    .poll(async () => lane(popup, 'eventRank').evaluate((el) => el.offsetHeight), {
      timeout: 8000
    })
    .toBe(0);
  const rankText = ((await rankBody.innerText().catch(() => '')) || '').trim();
  expect(rankText).toBe('');
  expect(rankText).not.toContain('位');

  await popup.screenshot({
    path: 'test-results/event-false-positive-hidden.png',
    fullPage: false
  });
});

test('公式 DOM 証拠あり（鏡 HTML）: eventScore/eventRank が正しく出る', async ({ context }) => {
  const popup = await openPopupForBundle(context, {
    capturedAt: Date.now(),
    // banner は無いが、公式 DOM 由来の鏡 HTML が取れている＝公式参加の確証。
    eventBanner: null,
    eventBalloon: null,
    eventCumulativeScoreMirrorHtml: '<span class="score">5,400</span>',
    eventCurrentRankMirrorHtml:
      '<span class="rank-field">現在 <strong class="rank-num">3</strong> 位</span>',
    contributionRanking: null,
    adContributionRanking: null,
    programStats: { giftPoints: 4000, watchCount: 500 },
    giftHistory: null
  });

  // 累計スコアレーンは表示され「5,400」が出る。
  await expect(lane(popup, 'eventScore')).toBeVisible({ timeout: 8000 });
  const scoreBody = popup.locator('#northStarLaneBody-eventScore');
  await expect
    .poll(async () => (await scoreBody.innerText().catch(() => '')).includes('5,400'), {
      timeout: 8000
    })
    .toBe(true);

  // 現在順位レーンは表示され「現在 3 位」が出る。鏡 HTML 由来なので「目安」注記は出ない。
  await expect(lane(popup, 'eventRank')).toBeVisible({ timeout: 8000 });
  const rankBody = popup.locator('#northStarLaneBody-eventRank');
  const rankText = await rankBody.innerText();
  expect(rankText).toContain('3');
  expect(rankText).toContain('位');
  expect(rankText).not.toContain('NDGR 推定');

  await popup.screenshot({
    path: 'test-results/event-confirmed-shows.png',
    fullPage: false
  });
});
