import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

const KEY_RECORDING = 'nls_recording_enabled';
const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const STORAGE_COMMENTS = 'nls_comments_lv888888888';

/*
 * v0.1.337: 「上部カード/ランキングが全部『—』で固まる」再発バグの根治を実ブラウザで実証する。
 *
 * 真因: refresh() が描画前に `await Promise.all([tabs, win, storage.get(設定)])` と
 *   `await readStorageBagWithRetry(() => storage.get(コメント配列))` をタイムアウトなしで待つため、
 *   MV3 で多タブ時に storage.get が一時的に応答しなくなる（global stall）と refresh が止まり、
 *   paintWatchPopupUi が走らず全カードが「—」固定になっていた（実機 lv350592761:
 *   storage_read_failed=診断の 3 キー read が 1200ms タイムアウト＝global stall の証拠）。
 *
 * 修正: 各 storage 読みに withTimeout / per-attempt timeout を入れ、stall しても best-effort で
 *   描画を続行する（設定 read が固まれば last-good を再利用、コメント read が固まれば空で続行）。
 *
 * このテストは popup の `chrome.storage.local.get` を起動直後 6 秒だけ 2.5 秒遅延させて
 * 「一時的な global stall」を再現し、それでも描画完了マーカー
 * `html[data-nl-popup-content-painted]`（= paintWatchPopupUi が走った証拠）が立つことを確認する。
 * 旧コードならこのマーカーは stall 中に永久に立たず（refresh が固まったまま）タイムアウトしていた。
 */
test('storage.get が一時的に応答しなくても popup の描画は止まらない（全部—固定の根治）', async ({
  context
}) => {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  const extensionId = new URL(sw.url()).hostname;

  await sw.evaluate(
    async ({ recordingKey, lastWatchKey, commentsKey, watchUrl }) => {
      const rows = Array.from({ length: 3 }, (_, idx) => ({
        id: `lv888888888::e2e-hang-${idx + 1}`,
        liveId: 'lv888888888',
        commentNo: String(idx + 1),
        userId: `user_hang_${idx}`,
        text: `e2e hang row ${idx + 1}`,
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

  const watch = await context.newPage();
  await watch.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
  await expect(watch.locator('#e2e-mock-viewer-count-sentinel')).toBeAttached();

  const popup = await context.newPage();
  // ナビゲーション前に「起動直後 6 秒は全 storage.get を 2.5 秒遅延」させるパッチを仕込む
  // （= MV3 多タブ時の一時的な global stall の再現）。6 秒経過後は素通しに戻す。
  await popup.addInitScript(() => {
    try {
      const realGet = chrome.storage.local.get.bind(chrome.storage.local);
      const startedAt = Date.now();
      // @ts-expect-error テスト用の差し替え
      chrome.storage.local.get = function stallGet(...args) {
        const stalling = Date.now() - startedAt < 6000;
        const lastArg = args[args.length - 1];
        if (stalling) {
          if (typeof lastArg === 'function') {
            setTimeout(() => realGet(...args), 2500); // callback 形式
            return undefined;
          }
          return new Promise((resolve) =>
            setTimeout(() => resolve(realGet(args[0])), 2500)
          ); // promise 形式
        }
        return realGet(...args);
      };
    } catch {
      /* no-op */
    }
  });

  await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await focusMockWatchThenReloadPopup(watch, popup);
  await dismissExtensionUsageTermsGate(popup);

  // ★ 核心: stall 中でも描画完了マーカーが立つ（= refresh が固まらず paint が走った）。
  //   旧コードならここで永久に立たずタイムアウトしていた。
  await expect(popup.locator('html[data-nl-popup-content-painted]')).toBeAttached({
    timeout: 20_000
  });

  // カード枠自体も見えている（cloak されたまま固まっていない）。
  await expect(popup.locator('#liveStatCards')).toBeVisible();

  // stall 回復後は記録カードが「—」から数値になる（自然復活）。
  await expect
    .poll(
      async () =>
        (await popup.locator('#liveStatComments').innerText())
          .trim()
          .replace(/[,，\s]/g, ''),
      { timeout: 20_000, message: 'stall 回復後に記録カードが数値表示へ復活するまで' }
    )
    .toMatch(/^\d+$/u);

  await popup.screenshot({
    path: 'test-results/refresh-storage-hang-resilient.png',
    fullPage: false
  });
});
