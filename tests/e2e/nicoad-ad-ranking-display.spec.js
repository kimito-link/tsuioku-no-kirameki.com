import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * v0.1.307: 広告ランキング（nicoad）の read→merge→display を実ブラウザで検証する。
 *
 * content-entry.js（別 AI 実装）が nicoad iframe relay で `nls_nicoad_ranking_{lid}`
 * に書いた広告ランキングを、popup-entry.js の readOfficialEventDomBundleFromStorage が
 * `bundle.adContributionRanking` にマージし、refreshNorthStarAdRankingLane が
 * `#northStarLaneBody-adRanking` に応援帯と同型で描画する——この一連を確認する。
 */

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_RECORDING = 'nls_recording_enabled';
const STORAGE_COMMENTS = 'nls_comments_lv888888888';
const KEY_NICOAD_RANKING = 'nls_nicoad_ranking_lv888888888';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('広告ランキング: nls_nicoad_ranking_ を seed すると北極星レーンに描画される', async ({
  context
}) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;

  await sw.evaluate(
    async ({ watchUrl, watchKey, recordingKey, commentsKey, adKey }) => {
      await chrome.storage.local.set({
        [watchKey]: watchUrl,
        [recordingKey]: true,
        [commentsKey]: [{ no: 1, content: 'やあ', userId: 'u1', date: Date.now() }],
        // content-entry.js の relay 受信ハンドラが書く形と同じ shape
        [adKey]: {
          capturedAt: Date.now(),
          sourceUrl: 'https://nicoad.nicovideo.jp/live/publish/lv888888888',
          ranking: [
            { rank: 1, name: '広告タロウ', contribution: 5000, isAnonymous: false, userId: '111' },
            { rank: 2, name: '広告ジロウ', contribution: 3000, isAnonymous: false, userId: '222' },
            { rank: 3, name: '', contribution: 1000, isAnonymous: true },
            // v0.1.315: scrape が name を読めず isAnonymous も付かなかった行。
            // __ad_N_（name 空サフィックス）になり、旧版は `u/__ad_3_` と内部キーが漏れていた。
            { rank: 4, name: '', contribution: 500, isAnonymous: false }
          ]
        }
      });
    },
    {
      watchUrl: MOCK_WATCH,
      watchKey: KEY_LAST_WATCH_URL,
      recordingKey: KEY_RECORDING,
      commentsKey: STORAGE_COMMENTS,
      adKey: KEY_NICOAD_RANKING
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

  const body = popup.locator('#northStarLaneBody-adRanking');
  await expect(body).toBeAttached();

  // 描画完了を待つ（refresh は非同期で storage 読み→bundle マージ→paint）
  await expect
    .poll(async () => (await body.innerText().catch(() => '')).length, { timeout: 8000 })
    .toBeGreaterThan(0);

  const text = await body.innerText();
  console.log('ad-ranking lane text:', JSON.stringify(text));

  // 名前付き上位 2 名が出ている（read→merge→display が通った証拠）
  expect(text).toContain('広告タロウ');
  expect(text).toContain('広告ジロウ');

  // v0.1.317: 匿名行（rank 3, name 空）は公式準拠の「名無し」と表示し、内部キーを漏らさない
  expect(text).toContain('名無し');
  expect(text).not.toContain('__anon');
  expect(text).not.toContain('u/__anon');

  // v0.1.315: name 空サフィックス行（rank 4, __ad_N_）も内部キーを漏らさない
  expect(text).not.toContain('__ad_');
  expect(text).not.toContain('u/__ad_');

  await popup.screenshot({ path: 'test-results/nicoad-ad-ranking.png', fullPage: false });
});

const KEY_NICOAD_API_RANKING = 'nls_nicoad_api_ranking_lv888888888';

test('広告ランキング: nicoad API 由来（userPageUrl 付き）が scrape より優先され uid リンクが付く', async ({
  context
}) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;

  await sw.evaluate(
    async ({ watchUrl, watchKey, recordingKey, commentsKey, adKey, adApiKey }) => {
      await chrome.storage.local.set({
        [watchKey]: watchUrl,
        [recordingKey]: true,
        [commentsKey]: [{ no: 1, content: 'やあ', userId: 'u1', date: Date.now() }],
        // scrape 由来（uid 無し・名前だけ）。これは劣後すべき。
        [adKey]: {
          capturedAt: Date.now(),
          sourceUrl: 'https://nicoad.nicovideo.jp/live/publish/lv888888888',
          ranking: [{ rank: 1, name: 'スクレイプ広告', contribution: 9999, isAnonymous: false }]
        },
        // nicoad API 由来（content の maybeFetchNicoadContribRankingMirrorOnce が書く形）。
        // userPageUrl 付き＝officialDomRankingRowsToStripRooms が uid リンク化する。
        [adApiKey]: {
          capturedAt: Date.now(),
          liveId: 'lv888888888',
          // uid は実 nicoad API と同じ現実的な桁数（短すぎる数値は匿名スタイル判定で
          // リンク化されない仕様＝isAnonymousStyleNicoUserId）。sm9 実データ準拠。
          rows: [
            {
              rank: 1,
              name: 'API広告タロウ',
              contribution: 5000,
              isAnonymous: false,
              userPageUrl: 'https://www.nicovideo.jp/user/5428353'
            },
            {
              rank: 2,
              name: 'API広告ジロウ',
              contribution: 3000,
              isAnonymous: false,
              userPageUrl: 'https://www.nicovideo.jp/user/36715409'
            }
          ]
        }
      });
    },
    {
      watchUrl: MOCK_WATCH,
      watchKey: KEY_LAST_WATCH_URL,
      recordingKey: KEY_RECORDING,
      commentsKey: STORAGE_COMMENTS,
      adKey: KEY_NICOAD_RANKING,
      adApiKey: KEY_NICOAD_API_RANKING
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

  const body = popup.locator('#northStarLaneBody-adRanking');
  await expect(body).toBeAttached();
  await expect
    .poll(async () => (await body.innerText().catch(() => '')).length, { timeout: 8000 })
    .toBeGreaterThan(0);

  const text = await body.innerText();
  console.log('ad-ranking(API) lane text:', JSON.stringify(text));

  // API 由来が優先された証拠（scrape の "スクレイプ広告" ではなく API の名前が出る）
  expect(text).toContain('API広告タロウ');
  expect(text).toContain('API広告ジロウ');
  expect(text).not.toContain('スクレイプ広告');
  // v0.1.327: API 由来で uid リンク化できる行も、カード本文は名前を優先する。
  // uid は href に残し、狭いカード内で数字だけが目立つ状態を避ける。
  expect(text).not.toContain('5428353');
  expect(text).not.toContain('36715409');

  // 記名広告主に公式 user ページリンクが付く（他ビューワーに無い uid リンク化）
  const linkHrefs = await body.locator('a[href*="nicovideo.jp/user/"]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('href'))
  );
  console.log('ad-ranking(API) user links:', JSON.stringify(linkHrefs));
  expect(linkHrefs.some((h) => h && h.includes('/user/5428353'))).toBe(true);
  expect(linkHrefs.some((h) => h && h.includes('/user/36715409'))).toBe(true);

  // 内部キーは漏れない
  expect(text).not.toContain('__ad_');
  expect(text).not.toContain('u/__');

  const firstCard = body.locator('.nl-top-support-rank__line').first();
  await expect(firstCard.locator('.nl-top-support-rank__name')).toHaveText('API広告タロウ');
  const metrics = await firstCard.evaluate((el) => {
    const card = el.getBoundingClientRect();
    const name = el.querySelector('.nl-top-support-rank__name');
    const thumb = el.querySelector('.nl-top-support-rank__thumb-wrap');
    const nameStyle = name ? getComputedStyle(name) : null;
    const thumbRect = thumb ? thumb.getBoundingClientRect() : null;
    return {
      cardHeight: card.height,
      nameFontPx: nameStyle ? parseFloat(nameStyle.fontSize) : 0,
      thumbWidth: thumbRect ? thumbRect.width : 0
    };
  });
  expect(metrics.cardHeight).toBeGreaterThanOrEqual(80);
  expect(metrics.nameFontPx).toBeGreaterThanOrEqual(10);
  expect(metrics.thumbWidth).toBeGreaterThanOrEqual(32);

  await popup.screenshot({ path: 'test-results/nicoad-ad-ranking-api.png', fullPage: false });
});
