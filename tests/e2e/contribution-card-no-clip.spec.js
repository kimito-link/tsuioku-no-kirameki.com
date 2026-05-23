import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * v0.1.344: 貢献度ランキングの横並びカードが 2 行に折り返したとき、3 枚目以降が枠の下端で
 * 途中まで切れて見える問題（実機: カムイ/まさる/かめいは の 3 枚目が見切れ）を是正したことを
 * 実ブラウザで実証する。
 *
 * 真因は body の max-height:176px + overflow:hidden で 2 行目以降がスクロールバーも無く clip
 * されていたこと。修正: list を overflow-y:auto にし body 上限を 220px に上げ、2 行目まで丸ごと
 * 見え、それ以上はスクロールで全カードに到達できる（カードが途中で切れない）。
 *
 * 検証: 多数の貢献者を seed して 2 行以上に折り返させ、(1) どのカードも上端が list の可視範囲に
 * 入る位置までスクロール到達できる＝list が overflow-y:auto でスクロール可能、(2) 最後のカードの
 * 下端が、最大スクロール時に list の可視下端を超えて切れていない、を確認する。
 */

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_RECORDING = 'nls_recording_enabled';
const KEY_KOKEN = 'nls_koken_api_contrib_lv888888888';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('貢献度カード見切れ: 2行に折り返しても 3 枚目以降が切れずスクロール到達できる', async ({
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
    if (!(list instanceof HTMLElement)) return null;
    // list をスクロールできる（折り返しで内容が可視高を超える）。
    const scrollable = list.scrollHeight > list.clientHeight + 1;
    // 最大までスクロールして、最後のカードの下端が list 可視下端を超えて切れていないか。
    list.scrollTop = list.scrollHeight;
    const last = lines[lines.length - 1];
    let lastFullyVisibleAtBottom = false;
    if (last instanceof HTMLElement) {
      const lr = last.getBoundingClientRect();
      const cr = list.getBoundingClientRect();
      // 最後のカード下端が list 可視下端の少し内側（+2px 許容）に収まる＝切れていない。
      lastFullyVisibleAtBottom = lr.bottom <= cr.bottom + 2;
    }
    return { lineCount: lines.length, scrollable, lastFullyVisibleAtBottom };
  });

  console.log('=== contribution clip probe ===', JSON.stringify(probe));
  expect(probe).not.toBeNull();
  // 2 行に折り返す枚数を seed したので複数行＝スクロール可能なはず。
  expect(probe.lineCount).toBeGreaterThanOrEqual(5);
  expect(probe.scrollable).toBe(true);
  // 最大スクロール時、最後のカードが下端で切れていない（=見切れていない）。
  expect(probe.lastFullyVisibleAtBottom).toBe(true);

  await popup.screenshot({
    path: 'test-results/contribution-card-no-clip.png',
    fullPage: false
  });
});
