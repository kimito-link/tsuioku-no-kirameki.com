import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * v0.1.395 実機実証（2026-05-26・会議 D）。
 *
 * ユーザー痛点「ギフト履歴が時間たっても変わらない」の根治。ギフト履歴レーンは従来 iframe 由来
 * （ギフトタブを開いた時だけ取込＝stale）を優先し、NDGR ライブ（nls_gift_events・常時接続で
 * リアルタイム・負荷ゼロ）を最後にしか使わなかった。v0.1.395 で、iframe が明らかに古く
 * （>120秒）かつライブの方が新しいときは**ライブへ切替**する（pickGiftHistorySource）。
 * gift hot path には触れず popup の読み取り側のみ。
 *
 * 検証: iframe(throws) を 5 分前・古い名前で、ライブ(gift_events) を直近・別の名前で seed。
 * → ギフト履歴レーンは**ライブの名前**を表示する（古い iframe でなく動いている方が出る）。
 */

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_RECORDING = 'nls_recording_enabled';
const KEY_THROWS = 'nls_gift_history_throws_lv888888888';
const KEY_EVENTS = 'nls_gift_events_lv888888888';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('ギフト履歴: iframe が古くライブが新しいとき、ライブの送り主を表示', async ({ context }) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;

  await sw.evaluate(
    async ({ watchUrl, watchKey, recordingKey, throwsKey, eventsKey }) => {
      const now = Date.now();
      const FIVE_MIN = 5 * 60 * 1000;
      // iframe 由来（古い・5分前）。名前は「旧サポーター」。
      const throwsRows = [
        { userId: 'u_old1', nickname: '旧サポーターA', totalPoints: 999, throwCount: 3, capturedAt: now - FIVE_MIN },
        { userId: 'u_old2', nickname: '旧サポーターB', totalPoints: 800, throwCount: 2, capturedAt: now - FIVE_MIN }
      ];
      // NDGR ライブ（直近）。名前は「ライブ送り主」。pt>0。
      const events = [
        { userId: 'u_live1', nickname: 'ライブ送り主X', itemId: 'g1', itemName: 'ビール', point: 1500, message: '', contributionRank: 1, capturedAt: now - 3000 },
        { userId: 'u_live2', nickname: 'ライブ送り主Y', itemId: 'g2', itemName: '花', point: 700, message: '', contributionRank: 2, capturedAt: now - 2000 }
      ];
      await chrome.storage.local.set({
        [watchKey]: watchUrl,
        [recordingKey]: true,
        [throwsKey]: throwsRows,
        [eventsKey]: events
      });
    },
    {
      watchUrl: MOCK_WATCH,
      watchKey: KEY_LAST_WATCH_URL,
      recordingKey: KEY_RECORDING,
      throwsKey: KEY_THROWS,
      eventsKey: KEY_EVENTS
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

  const giftBody = popup.locator('#northStarLaneBody-giftHistory');
  await expect(giftBody).toBeAttached();

  // ライブの送り主が出る（＝古い iframe でなくライブが選ばれた）。
  await expect
    .poll(async () => (await giftBody.innerText().catch(() => '')), {
      timeout: 12_000,
      message: 'ギフト履歴レーンにライブの送り主が出るまで'
    })
    .toContain('ライブ送り主X');

  const text = await giftBody.innerText();
  expect(text, 'ライブ側の2人目も出る').toContain('ライブ送り主Y');
  // 古い iframe の名前は出ない（ライブが優先された証拠）。
  expect(text, '古い iframe の送り主は表示されない').not.toContain('旧サポーターA');
  // 「自動更新中」が付く（ライブは常時接続）。
  expect(text).toContain('自動更新中');
});

test('ギフト履歴: iframe が新しいときは iframe（公式値）を維持する', async ({ context }) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;

  await sw.evaluate(
    async ({ watchUrl, watchKey, recordingKey, throwsKey, eventsKey }) => {
      const now = Date.now();
      // iframe 由来（直近・30秒前＝新しい）。
      const throwsRows = [
        { userId: 'u_off1', nickname: '公式サポーターA', totalPoints: 999, throwCount: 3, capturedAt: now - 30_000 }
      ];
      // ライブ（さらに直近）。だが iframe が新しいので iframe が勝つべき。
      const events = [
        { userId: 'u_live9', nickname: 'ライブ後発Z', itemId: 'g9', itemName: '星', point: 100, message: '', contributionRank: 1, capturedAt: now - 1000 }
      ];
      await chrome.storage.local.set({
        [watchKey]: watchUrl,
        [recordingKey]: true,
        [throwsKey]: throwsRows,
        [eventsKey]: events
      });
    },
    {
      watchUrl: MOCK_WATCH,
      watchKey: KEY_LAST_WATCH_URL,
      recordingKey: KEY_RECORDING,
      throwsKey: KEY_THROWS,
      eventsKey: KEY_EVENTS
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

  const giftBody = popup.locator('#northStarLaneBody-giftHistory');
  await expect(giftBody).toBeAttached();
  await expect
    .poll(async () => (await giftBody.innerText().catch(() => '')), { timeout: 12_000 })
    .toContain('公式サポーターA');
  const text = await giftBody.innerText();
  // iframe が新しいので、後発ライブには切り替わらない（公式値を維持）。
  expect(text, 'iframe が新しいときライブには切り替えない').not.toContain('ライブ後発Z');
});
