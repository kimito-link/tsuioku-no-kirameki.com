import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * v0.1.350: 広告ランキング横カードの「2 行目以降が見切れる」問題の回帰防止。
 *
 * 真因（ヘッドフル実ブラウザで観測）: v0.1.329 由来の ID 固有 CSS
 *   `#northStarLaneBody-adRanking.nl-top-support-rank { max-height: 214px }` が、
 *   class 側（.nl-top-support-rank）より詳細度が高く、v0.1.346 のフレームなし化
 *   （max-height:none / overflow:visible）を広告レーンだけ上書きしていた。結果、
 *   広告ランキングは ~214px で頭打ちになり、7〜10 位カードが下端で clip され、
 *   親 shell に内側スクロールが出ていた（貢献度ランキングは ID 固有規則が無いので
 *   フレームなしが効いて全カード表示できていた）。
 *
 * 検証: 広告ランキング 10 行を seed して 2 行以上に折り返させ、(1) body が内側
 *   スクロール領域でない（scrollHeight <= clientHeight）、(2) max-height が none、
 *   (3) どのカードも body 内に収まり下端で clip されていない、を実ブラウザで確認する。
 *   貢献度の contribution-card-no-clip.spec.js の広告版。
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

test('広告ランキング: フレームなしで全カードが切れず内側スクロールも無い（10 行で 2 行折り返し）', async ({
  context
}) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;

  // 実機（10 件の広告主）同様、2 行に折り返す枚数を seed。
  await sw.evaluate(
    async ({ watchUrl, watchKey, recordingKey, commentsKey, adKey }) => {
      const ranking = Array.from({ length: 10 }, (_, i) => ({
        rank: i + 1,
        name: `広告${i + 1}`,
        contribution: 200000 - i * 15000,
        isAnonymous: false,
        userId: String(1000 + i)
      }));
      await chrome.storage.local.set({
        [watchKey]: watchUrl,
        [recordingKey]: true,
        [commentsKey]: [{ no: 1, content: 'やあ', userId: 'u1', date: Date.now() }],
        [adKey]: {
          capturedAt: Date.now(),
          sourceUrl: 'https://nicoad.nicovideo.jp/live/publish/lv888888888',
          ranking
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
  await popup.setViewportSize({ width: 520, height: 760 }); // 実機スクショ近似幅（2 行折り返し）
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
    .poll(async () => (await body.innerText().catch(() => '')).includes('広告1'), {
      timeout: 10_000
    })
    .toBe(true);

  // 横カード化されている（縦リストでない）。
  await expect(body).toHaveClass(/nl-top-support-rank--below-cards/);

  const probe = await popup.evaluate(() => {
    const body = document.getElementById('northStarLaneBody-adRanking');
    const list = body?.querySelector('.nl-top-support-rank__list');
    const lines = Array.from(body?.querySelectorAll('.nl-top-support-rank__line') || []);
    if (!(body instanceof HTMLElement) || !(list instanceof HTMLElement)) return null;
    const bodyScrolls = body.scrollHeight > body.clientHeight + 1;
    const listScrolls = list.scrollHeight > list.clientHeight + 1;
    const bodyMaxHeight = getComputedStyle(body).maxHeight;
    const bodyRect = body.getBoundingClientRect();
    let allCardsWithinBody = true;
    for (const line of lines) {
      if (!(line instanceof HTMLElement)) continue;
      const lr = line.getBoundingClientRect();
      if (lr.bottom > bodyRect.bottom + 2) {
        allCardsWithinBody = false;
        break;
      }
    }
    return {
      lineCount: lines.length,
      bodyScrolls,
      listScrolls,
      bodyMaxHeight,
      allCardsWithinBody
    };
  });

  console.log('=== ad-ranking no-frame probe ===', JSON.stringify(probe));
  expect(probe).not.toBeNull();
  // 10 行 = 2 行以上に折り返す。
  expect(probe.lineCount).toBe(10);
  // フレームなし: 高さ上限が無い（ID 固有 max-height:214px が残っていれば none にならない）。
  expect(probe.bodyMaxHeight).toBe('none');
  // 内側スクロールが無い（body/list ともスクロール領域でない）。
  expect(probe.bodyScrolls).toBe(false);
  expect(probe.listScrolls).toBe(false);
  // 全カードが body 内に収まり、下端で切れていない（7〜10 位が見切れない）。
  expect(probe.allCardsWithinBody).toBe(true);

  await popup.screenshot({
    path: 'test-results/ad-ranking-card-no-clip.png',
    fullPage: false
  });
});
