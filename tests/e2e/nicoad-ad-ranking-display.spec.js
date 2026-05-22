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

  // v0.1.308/315: 匿名行（rank 3 = isAnonymous、rank 4 = name 空・非匿名）は
  // どちらも「匿名」と表示し、内部合成キーを画面に漏らさない。
  expect(text).toContain('匿名');
  // 匿名表示は 2 行（rank 3, 4）出る
  expect(text.split('匿名').length - 1).toBeGreaterThanOrEqual(2);
  expect(text).not.toContain('__anon');
  expect(text).not.toContain('__ad_');
  expect(text).not.toContain('u/__');

  // 表示テキストだけでなく href（リンク先 URL）にも合成キーが漏れていないこと。
  const hrefs = await body.locator('a[href]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('href') || '')
  );
  for (const href of hrefs) {
    expect(href).not.toContain('__anon');
    expect(href).not.toContain('__ad_');
    expect(href).not.toContain('__contrib_');
  }

  // title 属性（hover ラベル）にも合成キーが出ないこと。
  const titles = await body.locator('[title]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('title') || '')
  );
  for (const t of titles) {
    expect(t).not.toContain('__anon');
    expect(t).not.toContain('__ad_');
    expect(t).not.toContain('__contrib_');
  }

  await popup.screenshot({ path: 'test-results/nicoad-ad-ranking.png', fullPage: false });
});
