/**
 * 複数タブ白化の自動検出(2026-06-04 セッションの「手で特定する消耗」を根絶するため)。
 *
 * 実機で「2つ目以降のニコ生タブのインラインパネルが白く(空に)なる」問題を手作業で
 * 何度も再現・特定していた。これを自動化する。
 *
 * 検証方針(ビジュアル回帰ではなく要素アサーション = ライブ更新UIで flaky にならない):
 *   - 2つの watch タブを開き、両方を順に前面化する。
 *   - 各タブで前面化後、インラインパネルの iframe(#nls-inline-popup-host iframe)が
 *     存在し・高さ > 0・iframe 内の popup が描画完了マーカー(data-nl-popup-content-painted)
 *     を持つ = 「空(白)でない」ことを assert。
 *   - 裏タブは省電力で描画されないのは仕様なので、各タブを bringToFront してから検証する。
 *
 * 注: 裏タブのまま描画を強制しない(省電力仕様を尊重)。「前面に戻せば必ず描画される」を担保。
 */

import { test, expect, enableInlinePanelAutoshow } from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

const INLINE_HOST = '#nls-inline-popup-host';

/** mock watch タブを開いて記録を seed する。 */
async function seedAndOpenWatch(context, sw) {
  await sw.evaluate(async ({ watchUrl }) => {
    const rows = Array.from({ length: 12 }, (_, idx) => ({
      id: `lv888888888::blank-${idx + 1}`,
      liveId: 'lv888888888',
      commentNo: String(idx + 1),
      userId: `user_${idx % 4}`,
      text: `blank-detect row ${idx + 1}`,
      capturedAt: Date.now() - idx * 1000
    }));
    await chrome.storage.local.set({
      nls_last_watch_url: watchUrl,
      nls_comments_lv888888888: rows
    });
  }, { watchUrl: MOCK_WATCH });

  const page = await context.newPage();
  await page.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
  await expect(page.locator('#e2e-mock-viewer-count-sentinel')).toBeAttached();
  return page;
}

/**
 * 前面化したタブで、インラインパネルが「空(白)でない」ことを検証する。
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 */
async function expectInlinePanelNotBlank(page, label) {
  await page.bringToFront();
  // 前面化後、省電力 gate が解除され描画されるまで待つ。
  const host = page.locator(INLINE_HOST);
  await expect(host, `${label}: インラインホストが出現すべき`).toBeAttached({
    timeout: 20_000
  });

  // host が高さ > 0(潰れていない)。
  await expect
    .poll(
      async () =>
        host.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return Math.round(r.height);
        }),
      { message: `${label}: インラインホストの高さが 0(白く潰れている)`, timeout: 20_000 }
    )
    .toBeGreaterThan(20);

  // iframe(popup.html)は chrome-extension:// オリジンのため contentDocument は
  //   クロスオリジンで読めない。frameLocator でフレーム内を覗き、描画完了マーカーと
  //   .nl-main の可視を確認する = 中身が白(空)でないことの担保。
  const frame = page.frameLocator(`${INLINE_HOST} iframe`);
  await expect(
    frame.locator('html[data-nl-popup-content-painted="1"]'),
    `${label}: パネル iframe が描画完了しない(白い)`
  ).toBeAttached({ timeout: 25_000 });
  await expect(
    frame.locator('.nl-main'),
    `${label}: パネル本体 .nl-main が見えない(白い)`
  ).toBeVisible({ timeout: 25_000 });
}

test.describe('複数タブ インラインパネル白化検出', () => {
  test('2つの watch タブを順に前面化 → どちらも白く(空に)ならない', async ({
    context
  }) => {
    await enableInlinePanelAutoshow(context);

    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }

    // 1 つ目のタブ。
    const tabA = await seedAndOpenWatch(context, sw);
    await expectInlinePanelNotBlank(tabA, 'タブA(初手)');

    // 2 つ目のタブ(同じ mock watch・複数タブ状況を作る)。
    const tabB = await seedAndOpenWatch(context, sw);
    await expectInlinePanelNotBlank(tabB, 'タブB(2つ目)');

    // 1 つ目に戻す → 裏に回ってから前面化しても再描画され白くならない(省電力復帰の担保)。
    await expectInlinePanelNotBlank(tabA, 'タブA(再前面化)');
  });
});
