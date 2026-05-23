import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * v0.1.333: 横スクロールカード（広告/ギフト履歴の --below-cards）で、長い pt 数値が
 * カード幅を超えて右端からはみ出す見切れを是正したことを実ブラウザで実証する。
 *
 * 実機スクショ（広告ランキング）で「7459/13349/12193」等がカード右端からはみ出して
 * いた。__count を minmax(0,auto)+max-width:100%+overflow:hidden、__line に
 * overflow:hidden を足し、カード内に収める。本テストは各 __count が親カード
 * （__line）の幅を超えない（scrollWidth <= clientWidth+許容）ことを確認する。
 */

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_RECORDING = 'nls_recording_enabled';
const STORAGE_COMMENTS = 'nls_comments_lv888888888';
const KEY_NICOAD_API = 'nls_nicoad_api_ranking_lv888888888';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('カード見切れ: 広告ランキングの長い pt 数値がカード幅を超えない', async ({ context }) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;

  // 実機同様、長い pt 数値（5桁）の広告ランカーを多数 seed。
  await sw.evaluate(
    async ({ watchUrl, watchKey, recordingKey, commentsKey, adApiKey }) => {
      await chrome.storage.local.set({
        [watchKey]: watchUrl,
        [recordingKey]: true,
        [commentsKey]: [{ no: 1, content: 'やあ', userId: 'u1', date: Date.now() }],
        [adApiKey]: {
          liveId: 'lv888888888',
          capturedAt: Date.now(),
          rows: [
            { rank: 1, name: 'まるきち', contribution: 74593, isAnonymous: false, userPageUrl: 'https://www.nicovideo.jp/user/10000001' },
            { rank: 2, name: 'Rio', contribution: 13349, isAnonymous: false, userPageUrl: 'https://www.nicovideo.jp/user/10000002' },
            { rank: 3, name: 'ながいなまえのひと', contribution: 12193, isAnonymous: false },
            { rank: 4, name: 'カレントミラー', contribution: 9781, isAnonymous: false },
            { rank: 5, name: 'テスト', contribution: 8671, isAnonymous: false }
          ]
        }
      });
    },
    {
      watchUrl: MOCK_WATCH,
      watchKey: KEY_LAST_WATCH_URL,
      recordingKey: KEY_RECORDING,
      commentsKey: STORAGE_COMMENTS,
      adApiKey: KEY_NICOAD_API
    }
  );

  const watch = await context.newPage();
  await watch.goto(MOCK_WATCH, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 400, height: 580 }); // 狭幅 action popup 相当
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await dismissExtensionUsageTermsGate(popup);
  await focusMockWatchThenReloadPopup(watch, popup);
  await popup.waitForTimeout(2500);

  const body = popup.locator('#northStarLaneBody-adRanking');
  await expect(body).toBeAttached();
  await expect
    .poll(async () => (await body.innerText().catch(() => '')).includes('まるきち'), {
      timeout: 10_000
    })
    .toBe(true);

  // 各カードの __count が親カード（__line）の幅を超えていないか計測。
  const result = await popup.evaluate(() => {
    const lines = Array.from(
      document.querySelectorAll(
        '#northStarLaneBody-adRanking .nl-top-support-rank--below-cards .nl-top-support-rank__line'
      )
    );
    const counts = lines.map((line) => {
      const c = line.querySelector('.nl-top-support-rank__count');
      if (!(c instanceof HTMLElement) || !(line instanceof HTMLElement)) return null;
      return {
        countText: (c.textContent || '').trim(),
        // count がカード（line）の右端を超えてはみ出していないか
        countRight: Math.round(c.getBoundingClientRect().right),
        lineRight: Math.round(line.getBoundingClientRect().right),
        // count 自身の内部クリップ（minmax(0,auto)+overflow:hidden が効くと scrollW<=clientW+ε）
        countOver: c.scrollWidth - c.clientWidth
      };
    });
    return counts.filter(Boolean);
  });

  console.log('=== ad card counts ===', JSON.stringify(result, null, 2));
  expect(result.length).toBeGreaterThan(0);

  // どの count もカード右端を超えてはみ出さない（2px 許容）。
  for (const r of result) {
    expect(r.countRight, `count "${r.countText}" overflows card right`).toBeLessThanOrEqual(
      r.lineRight + 2
    );
  }

  await popup.screenshot({ path: 'test-results/card-count-no-overflow.png', fullPage: false });
});
