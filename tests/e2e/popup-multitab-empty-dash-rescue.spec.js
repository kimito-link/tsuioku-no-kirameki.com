/**
 * v0.1.414: 複数タブ時に別ウィンドウ POP（standalone）が全カード/全チップ「—」で
 * 固まる残穴の根治に関する実拡張ロード検証（happy-path 回帰ガード）。
 *
 * 真因と根治（[[reference_standalone_popup_multitab_empty_dash]]）:
 *   standalone popup は自タブを持たず getLastFocused の前面タブから lv を推測する。
 *   その lv に実データが無いと lv は取れる（source=lastFocusedNormal）ので
 *   treatAsNoActiveWatch=false → 「前回の配信」フォールバックも走らず → 全チップ「—」
 *   固定になっていた。根治は ①データのある lv 優先選択 ②ウォッチドッグ
 *   （shouldRescueEmptyResolvedWatch）で空なら前回配信に倒す。
 *
 *   ①②の純ロジックは unit（popupWatchUrlResolveMultiTab.test.js /
 *   popupContextBarModel.test.js）で網羅。ここでは「ライブな watch タブを前面に
 *   standalone popup を開くと、ウォッチドッグが誤発火せず実データが描画され、全チップ
 *   『—』のまま固まらない」ことを実拡張で担保する（過剰救済の回帰も同時にガード）。
 */

import {
  test,
  expect,
  dismissExtensionUsageTermsGate
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const STORAGE_COMMENTS = 'nls_comments_lv888888888';

test.describe('standalone popup multitab empty-dash 根治 (v0.1.414)', () => {
  test('standalone POP（前面 watch 無し・別タブに記録あり）→ レビュー(empty-state)になり、別配信をフルのアクティブ表示として誤表示しない', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;

    // mock watch（lv888888888）に記録を seed し、last-watch も向ける。
    await sw.evaluate(
      async ({ lastWatchKey, commentsKey, watchUrl }) => {
        const rows = Array.from({ length: 3 }, (_, idx) => ({
          id: `lv888888888::e2e-md-${idx + 1}`,
          liveId: 'lv888888888',
          commentNo: String(idx + 1),
          userId: `user_md_${idx}`,
          text: `e2e multitab row ${idx + 1}`,
          capturedAt: Date.now() - idx * 1000
        }));
        await chrome.storage.local.set({
          [lastWatchKey]: watchUrl,
          [commentsKey]: rows
        });
      },
      {
        lastWatchKey: KEY_LAST_WATCH_URL,
        commentsKey: STORAGE_COMMENTS,
        watchUrl: MOCK_WATCH
      }
    );

    // mock watch タブを開いて前面に（lastFocusedNormal の active = watch）。
    const watch = await context.newPage();
    await watch.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
    await expect(watch.locator('#e2e-mock-viewer-count-sentinel')).toBeAttached();
    await watch.bringToFront();

    // standalone popup を別ウィンドウとして開く（自タブを持たない）。
    const popupUrl = `chrome-extension://${extensionId}/popup.html`;
    await sw.evaluate(async (url) => {
      await chrome.windows.create({
        url,
        type: 'popup',
        width: 420,
        height: 780,
        focused: false
      });
    }, popupUrl);

    let popupPage;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      popupPage = context.pages().find((p) => p.url() === popupUrl);
      if (popupPage) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(popupPage, 'popup page should be created').toBeDefined();

    await dismissExtensionUsageTermsGate(popupPage);

    await expect(
      popupPage.locator('html[data-nl-popup-content-painted="1"]')
    ).toBeAttached({ timeout: 20_000 });
    // ウォッチドッグの非同期フォールバックが走るなら、その後の再描画まで余裕を見る。
    await popupPage.waitForTimeout(1200);

    await popupPage.screenshot({
      path: 'test-results/popup-multitab-empty-dash-rescue.png',
      fullPage: false
    });

    const state = await popupPage.evaluate(() => {
      const txt = (id) => {
        const el = document.getElementById(id);
        return el ? (el.textContent || '').trim() : null;
      };
      const chips = [
        'officialStatNicoViewers',
        'officialStatNicoComments',
        'officialStatNicoStreamAge',
        'officialStatNicoAdPts',
        'officialStatNicoGiftPts'
      ].map((id) => txt(id));
      return {
        rootClasses: document.documentElement.className,
        isEmptyState: document.documentElement.classList.contains('nl-empty-state'),
        chips,
        recordCount: txt('liveStatComments'),
        liveIdLabel: txt('liveId')
      };
    });

    console.log('[multitab-empty-dash] state:', JSON.stringify(state));

    // v0.1.421: このシナリオ＝standalone popup（前面は popup window 自身）+ 別 normal window に
    //   watch タブ。これは「ニコ生以外のページで POP を開いた」実機バグと同型で、正しい挙動は
    //   「データのある配信を **前回配信レビュー（empty-state）** として軽く出す」＝全チップ
    //   フルのアクティブ表示にしない（実機: X 等で別タブの記録 470 件がフル表示される誤情報）。
    //   よって isEmptyState=true が正しい（v0.1.414 旧テストは buggy なフル表示を期待していた）。
    //
    //   北極星の保証は「全カード/全チップが『—』のまま永久に居座らない」こと。empty-state は
    //   レビュー/案内（「ニコ生watchを開いてください」等）を出す＝stuck-dash ではない。
    const emptyHint = await popupPage.evaluate(() => {
      const el = document.getElementById('noWatchRankingHint');
      const liveTxt = (document.getElementById('liveId')?.textContent || '').trim();
      return {
        hintVisible: !!el && !el.hidden && el.style.display !== 'none',
        liveTxt
      };
    });

    // 「—固まり」でないこと＝empty-state（レビュー/案内）に正しく倒れている。
    expect(
      state.isEmptyState,
      `standalone POP（前面 watch 無し）はレビュー(empty-state)になるべき・rootClasses=${state.rootClasses}`
    ).toBe(true);
    // 別タブの記録がフルのアクティブ表示として出ていない（X 等での誤情報フル表示の回帰ガード）。
    //   liveId ラベルは「（ニコ生watchを開いてください）」等の案内で、アクティブ lv 直表示でない。
    expect(
      emptyHint.liveTxt.includes('lv888888888') && !emptyHint.liveTxt.includes('直近'),
      `別配信 lv がアクティブ表示として直に出ている（誤情報フル表示の退行）・liveTxt=${emptyHint.liveTxt}`
    ).toBe(false);
  });
});
