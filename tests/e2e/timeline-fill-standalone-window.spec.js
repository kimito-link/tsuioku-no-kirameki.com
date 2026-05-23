import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * v0.1.345: 別ウィンドウ(standalone window=html.nl-popup-window)かつ配信中のとき、応援タイムラインを
 * `.nl-main` 末尾へ移して下部常設+既定オープンにし、下の空白を埋める。action popup/inline は不変。
 *
 * e2e では Chrome に実 type:popup ウィンドウを開かせるのが難しいため、popup ページに
 * html.nl-popup-window を付与して standalone 文脈を再現し、(1) タイムラインが .nl-main 末尾へ移る
 * (2) 既定オープン (3) 内側スクロール解除で .nl-main が単一スクローラのまま、を確認する。
 */

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_RECORDING = 'nls_recording_enabled';
const KEY_COMMENTS = 'nls_comments_lv888888888';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('別ウィンドウ配信中: 応援タイムラインが下部常設+既定オープンで空白を埋める', async ({
  context
}) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;
  await sw.evaluate(
    async ({ watchKey, recKey, cKey, watchUrl }) => {
      const base = Date.now() - 30_000;
      const comments = Array.from({ length: 8 }, (_, i) => ({
        id: `lv888888888::c${i}`,
        liveId: 'lv888888888',
        commentNo: String(i + 1),
        userId: `10000${i}`,
        nickname: `視聴者${i}`,
        text: `コメント${i}`,
        capturedAt: base + i * 1000
      }));
      await chrome.storage.local.set({
        [watchKey]: watchUrl,
        [recKey]: true,
        [cKey]: comments
      });
    },
    { watchKey: KEY_LAST_WATCH_URL, recKey: KEY_RECORDING, cKey: KEY_COMMENTS, watchUrl: MOCK_WATCH }
  );

  const watch = await context.newPage();
  await watch.goto(MOCK_WATCH, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 420, height: 820 }); // 別ウィンドウ相当（縦長）
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  // standalone window 文脈を再現（本番は resizePopupWindowForState が付与）。
  await popup.evaluate(() => document.documentElement.classList.add('nl-popup-window'));
  await dismissExtensionUsageTermsGate(popup);
  await focusMockWatchThenReloadPopup(watch, popup);
  // reload で class が落ちるので付け直す。
  await popup.evaluate(() => document.documentElement.classList.add('nl-popup-window'));
  await expect(popup.locator('html[data-nl-support-wired]')).toBeAttached({
    timeout: 20_000
  });
  await popup.waitForTimeout(2000);

  const probe = await popup.evaluate(() => {
    const details = document.getElementById('supportTimelineDetails');
    const main = document.querySelector('.nl-main');
    const body = document.getElementById('supportTimelineBody');
    if (!details || !main || !body) return null;
    const cs = getComputedStyle(body);
    return {
      // .nl-main の末尾の子になっている（下部常設）。
      isMainLastChild: details.parentElement === main && details.nextElementSibling === null,
      docked: details.getAttribute('data-nl-timeline-docked'),
      open: details.open,
      // 内側スクロール解除（double-scroll 防止）。
      bodyOverflowY: cs.overflowY,
      // main は単一スクローラのまま。
      mainOverflowY: getComputedStyle(main).overflowY,
      mainScrollers: Array.from(main.querySelectorAll('*')).filter((el) => {
        const s = getComputedStyle(el);
        return (
          (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
          el.scrollHeight > el.clientHeight + 1
        );
      }).length
    };
  });

  console.log('=== standalone timeline probe ===', JSON.stringify(probe));
  expect(probe).not.toBeNull();
  expect(probe.isMainLastChild).toBe(true);
  expect(probe.docked).toBe('window-bottom');
  expect(probe.open).toBe(true); // 別ウィンドウは既定オープン
  expect(probe.bodyOverflowY).toBe('visible'); // 内側スクロール解除

  await popup.screenshot({
    path: 'test-results/timeline-fill-standalone-window.png',
    fullPage: false
  });
});
