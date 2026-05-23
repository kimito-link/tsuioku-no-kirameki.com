import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * v0.1.346: ランキング「フレームなし」化（ユーザー要望: ランキング関連は全部フレームなしに）。
 * 貢献度/広告/ギフト履歴の横並びカードレーンは、高さ上限と内側スクロールを撤廃し、全カードを
 * 折り返したまま丸ごと表示する（カードが切れない・内側スクロールが無い）。縦スクロールは
 * .nl-main 1 本に委ねる。
 *
 * （旧 v0.1.344 は body max-height:220px + list overflow-y:auto で「2 行目まで表示・残りは
 *  内側スクロール」だったが、ユーザーが内側スクロール自体を嫌ったため撤廃。）
 *
 * 検証: 多数の貢献者を seed して 2 行以上に折り返させ、(1) list が内側スクロール領域でない
 * （scrollHeight <= clientHeight）、(2) どのカードも body の内側に収まり下端で clip されていない、
 * を確認する。
 */

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_RECORDING = 'nls_recording_enabled';
const KEY_KOKEN = 'nls_koken_api_contrib_lv888888888';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('貢献度カード: フレームなしで全カードが切れず内側スクロールも無い', async ({
  context
}) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;

  // 実機同様、複数の貢献者（2 行に折り返す枚数）を seed。
  await sw.evaluate(
    async ({ watchUrl, watchKey, recordingKey, kokenKey }) => {
      const names = ['カムイ', 'まさる', 'かめいは', 'よにん', 'ごにん', 'ろくにん'];
      const rows = names.map((name, i) => ({
        rank: i + 1,
        name,
        contribution: 1000 - i * 100,
        isAnonymous: false,
        thumbnailUrl: ''
      }));
      await chrome.storage.local.set({
        [watchKey]: watchUrl,
        [recordingKey]: true,
        [kokenKey]: { liveId: 'lv888888888', capturedAt: Date.now(), rows }
      });
    },
    {
      watchUrl: MOCK_WATCH,
      watchKey: KEY_LAST_WATCH_URL,
      recordingKey: KEY_RECORDING,
      kokenKey: KEY_KOKEN
    }
  );

  const watch = await context.newPage();
  await watch.goto(MOCK_WATCH, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 400, height: 700 }); // 狭幅でカードが折り返す
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await dismissExtensionUsageTermsGate(popup);
  await focusMockWatchThenReloadPopup(watch, popup);
  await popup.waitForTimeout(2500);

  const body = popup.locator('#northStarLaneBody-contributionRanking');
  await expect(body).toBeAttached();
  await expect
    .poll(async () => (await body.innerText().catch(() => '')).includes('カムイ'), {
      timeout: 10_000
    })
    .toBe(true);

  // 横カード化されている（縦リストでない）。
  await expect(body).toHaveClass(/nl-top-support-rank--below-cards/);

  const probe = await popup.evaluate(() => {
    const body = document.getElementById('northStarLaneBody-contributionRanking');
    const list = body?.querySelector('.nl-top-support-rank__list');
    const lines = Array.from(body?.querySelectorAll('.nl-top-support-rank__line') || []);
    if (!(body instanceof HTMLElement) || !(list instanceof HTMLElement)) return null;
    // フレームなし: body も list も内側スクロール領域でない（コンテンツ高まで伸びる）。
    const bodyScrolls = body.scrollHeight > body.clientHeight + 1;
    const listScrolls = list.scrollHeight > list.clientHeight + 1;
    // どのカードも body の内側に収まり、下端で clip されていない（=見切れていない）。
    const bodyRect = body.getBoundingClientRect();
    let allCardsWithinBody = true;
    for (const line of lines) {
      if (!(line instanceof HTMLElement)) continue;
      const lr = line.getBoundingClientRect();
      // カード下端が body の下端（+2px 許容）を超えていない＝切れていない。
      if (lr.bottom > bodyRect.bottom + 2) {
        allCardsWithinBody = false;
        break;
      }
    }
    return { lineCount: lines.length, bodyScrolls, listScrolls, allCardsWithinBody };
  });

  console.log('=== contribution no-frame probe ===', JSON.stringify(probe));
  expect(probe).not.toBeNull();
  // 2 行に折り返す枚数を seed。
  expect(probe.lineCount).toBeGreaterThanOrEqual(5);
  // フレームなし: 内側スクロールが無い（body/list ともスクロール領域でない）。
  expect(probe.bodyScrolls).toBe(false);
  expect(probe.listScrolls).toBe(false);
  // 全カードが body 内に収まり、下端で切れていない。
  expect(probe.allCardsWithinBody).toBe(true);

  await popup.screenshot({
    path: 'test-results/contribution-card-no-clip.png',
    fullPage: false
  });
});
