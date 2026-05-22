import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * v0.1.318: ギフト履歴レーンが、個別ギフト event（nls_gift_events_<lid>）を
 * 送信者別に「正確な投げ量(pt)」で集計し、多い順（pt降順）に表示することを実ブラウザで実証。
 * 公式 DOM 履歴も保存 throws も無い配信（モック）で events_pt フォールバックが効く。
 */

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_RECORDING = 'nls_recording_enabled';
const KEY_GIFT_EVENTS = 'nls_gift_events_lv888888888';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('ギフト履歴: 送信者別の合計ptで多い順に並ぶ（個別event集計）', async ({ context }) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;

  await sw.evaluate(
    async ({ watchUrl, watchKey, recordingKey, eventsKey }) => {
      const now = Date.now();
      await chrome.storage.local.set({
        [watchKey]: watchUrl,
        [recordingKey]: true,
        // 個別ギフト event（content-entry.js の appendGiftEvents が書く形）
        [eventsKey]: [
          { userId: '111', nickname: 'ちいさん', itemId: 'a', itemName: 'x', point: 100, message: '', contributionRank: null, capturedAt: now },
          { userId: '222', nickname: 'おおきさん', itemId: 'b', itemName: 'y', point: 500, message: '', contributionRank: null, capturedAt: now + 1 },
          { userId: '111', nickname: 'ちいさん', itemId: 'a', itemName: 'x', point: 50, message: '', contributionRank: null, capturedAt: now + 2 },
          // 匿名（uid 空）も nickname で集計
          { userId: '', nickname: 'むめい', itemId: 'c', itemName: 'z', point: 300, message: '', contributionRank: null, capturedAt: now + 3 }
        ]
      });
    },
    {
      watchUrl: MOCK_WATCH,
      watchKey: KEY_LAST_WATCH_URL,
      recordingKey: KEY_RECORDING,
      eventsKey: KEY_GIFT_EVENTS
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

  const body = popup.locator('#northStarLaneBody-giftHistory');
  await expect(body).toBeAttached();
  await expect
    .poll(async () => (await body.innerText().catch(() => '')).includes('おおきさん'), {
      timeout: 8000
    })
    .toBe(true);

  const text = await body.innerText();
  console.log('gift-history lane:', JSON.stringify(text));

  // 全員出る（ちいさんは 100+50=150 に合算）
  expect(text).toContain('おおきさん');
  expect(text).toContain('むめい');
  expect(text).toContain('ちいさん');
  // pt 表記（回ではない）
  expect(text).toContain('pt');
  expect(text).not.toContain('投げ回数');

  // 並び順: おおき(500) > むめい(300) > ちい(150) の順で名前が現れる
  const idxOoki = text.indexOf('おおきさん');
  const idxMumei = text.indexOf('むめい');
  const idxChii = text.indexOf('ちいさん');
  expect(idxOoki).toBeGreaterThanOrEqual(0);
  expect(idxOoki).toBeLessThan(idxMumei);
  expect(idxMumei).toBeLessThan(idxChii);

  await popup.screenshot({ path: 'test-results/gift-history-points-ranking.png', fullPage: false });
});
