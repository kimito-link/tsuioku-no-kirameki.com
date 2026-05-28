import { test, expect, enableInlinePanelAutoshow } from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * PR0（feat/multitab-scale-ultraC・観測基盤）: 「watch タブを複数同時に開くと各パネルが
 * 全カード『—』で固まる/遅れる」を実拡張で観測する基準線テスト。
 *
 * 真因（[[reference_multitab_scale_ultraC_leader_election]]）: N タブが各々 storage.local を
 * read-merge-write し、同一 Chrome プロファイルの storage キューが head-of-line blocking →
 * popup refresh が timeout → 全カード「—」固定。
 *
 * このテストは N 枚の watch タブ（= N 個の inline パネル）を開き、各タブの popup の
 * `chrome.storage.local.get` を起動直後だけ遅延させて多タブ stall を模す。北極星の保証＝
 * 「全タブのパネルが描画完了マーカー（data-nl-popup-content-painted）を立てる＝『—』のまま
 * 永久に固まらない」を全タブで確認する。
 *
 * v0.1.337 の stall 防御（per-attempt withTimeout）が効いていれば、N タブでもこのマーカーは
 * 立つ。以降の PR（SW 集約 / リーダー選出 / 単一writer）はこの基準線を緑に保ったまま、
 * 実機での体感（req/s・stall 時間）を下げていく。
 */

const KEY_RECORDING = 'nls_recording_enabled';
const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const STORAGE_COMMENTS = 'nls_comments_lv888888888';
const INLINE_HOST_ID = 'nls-inline-popup-host';

/** 起動直後 STALL_MS ミリ秒だけ全 storage.get を DELAY_MS 遅延させる initScript。 */
function makeStallInitScript() {
  return () => {
    try {
      const realGet = chrome.storage.local.get.bind(chrome.storage.local);
      const startedAt = Date.now();
      const STALL_WINDOW_MS = 6000;
      const DELAY_MS = 2000;
      // @ts-expect-error テスト用差し替え
      chrome.storage.local.get = function stallGet(...args) {
        const stalling = Date.now() - startedAt < STALL_WINDOW_MS;
        const lastArg = args[args.length - 1];
        if (stalling) {
          if (typeof lastArg === 'function') {
            setTimeout(() => realGet(...args), DELAY_MS);
            return undefined;
          }
          return new Promise((resolve) =>
            setTimeout(() => resolve(realGet(args[0])), DELAY_MS)
          );
        }
        return realGet(...args);
      };
    } catch {
      /* no-op */
    }
  };
}

test.describe('多タブ storage 競合の基準線（PR0 観測基盤）', () => {
  // タブ数。実機で固まったのは 7 枚だったが、e2e は安定性優先で 4 枚で contention を作る。
  const TAB_COUNT = 4;

  test(`${TAB_COUNT} 枚の watch タブ + inline パネルが、stall 下でも全部「—」で固まらず描画完了する`, async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });

    await enableInlinePanelAutoshow(context);
    await sw.evaluate(
      async ({ recordingKey, lastWatchKey, commentsKey, watchUrl }) => {
        // 多タブ contention を強めるため、コメント配列をある程度大きくしておく
        // （read-merge-write のコストを上げる）。
        const rows = Array.from({ length: 200 }, (_, idx) => ({
          id: `lv888888888::e2e-mt-${idx + 1}`,
          liveId: 'lv888888888',
          commentNo: String(idx + 1),
          userId: `user_mt_${idx % 40}`,
          text: `multitab contention row ${idx + 1}`,
          capturedAt: Date.now() - idx * 1000
        }));
        await chrome.storage.local.set({
          [recordingKey]: true,
          [lastWatchKey]: watchUrl,
          [commentsKey]: rows
        });
      },
      {
        recordingKey: KEY_RECORDING,
        lastWatchKey: KEY_LAST_WATCH_URL,
        commentsKey: STORAGE_COMMENTS,
        watchUrl: MOCK_WATCH
      }
    );

    /** @type {import('@playwright/test').Page[]} */
    const pages = [];
    for (let i = 0; i < TAB_COUNT; i += 1) {
      const page = await context.newPage();
      // 各タブの content/inline popup の storage.get を起動直後だけ遅延（多タブ stall 模擬）。
      await page.addInitScript(makeStallInitScript());
      await page.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
      await expect(page.locator('#e2e-mock-viewer-count-sentinel')).toBeAttached();
      pages.push(page);
    }

    // 全タブで inline パネル（cross-origin extension iframe）が出るのを待つ。
    for (const page of pages) {
      await expect(page.locator(`#${INLINE_HOST_ID}`)).toBeVisible({ timeout: 40_000 });
    }

    // ★核心: 全タブの inline パネルが描画完了マーカーを立てる（＝stall 下でも paint が走った）。
    //   1 タブでも「—」のまま固まれば、ここで timeout して RED になる。
    for (let i = 0; i < pages.length; i += 1) {
      const frame = pages[i].frameLocator(`#${INLINE_HOST_ID} iframe`);
      await expect(
        frame.locator('html[data-nl-popup-content-painted]'),
        `tab#${i + 1} の inline パネルが描画完了マーカーを立てる`
      ).toBeAttached({ timeout: 30_000 });
    }

    // stall 回復後、全タブで記録カードが「—」から数値（>=200）になる（自然復活）。
    for (let i = 0; i < pages.length; i += 1) {
      const frame = pages[i].frameLocator(`#${INLINE_HOST_ID} iframe`);
      await expect
        .poll(
          async () =>
            (await frame.locator('#liveStatComments').innerText())
              .trim()
              .replace(/[,，\s]/g, ''),
          {
            timeout: 30_000,
            message: `tab#${i + 1} の記録カードが stall 回復後に数値表示へ復活するまで`
          }
        )
        .toMatch(/^\d+$/u);
    }

    await pages[0].screenshot({
      path: 'test-results/multitab-storage-contention.png',
      fullPage: false
    });
  });
});
