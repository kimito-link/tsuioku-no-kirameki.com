/**
 * 0.1.72 (BB): popup window が empty state（配信なし）時に
 * `chrome.windows.update` で適切な高さに resize されているかを実機で測る。
 *
 * 0.1.71 (BA) で実測ベース resize を入れたが、`body.scrollHeight` が
 * empty でも可視な changelog/concept/frame/powered-by を含む全コンテンツ
 * 高さを返すため、popup が逆に拡大することが判明（ユーザー報告 0501-1117 ビルド）。
 *
 * 0.1.72 で fixed preset に戻し、本 spec で実機サイズが target 範囲内
 * （history あり 620 ± 余裕、no-history 600 ± 余裕）に入ることを担保する。
 */

import { test, expect, dismissExtensionUsageTermsGate } from './fixtures.js';

const POPUP_WIDTH = 420;
const ACTIVE_WATCH_HEIGHT = 780;
// EMPTY_HISTORY_HEIGHT (= 620) は将来 case 追加時に使う想定。現状は no-history 1 ケースのみ
const EMPTY_NO_HISTORY_HEIGHT = 600;

/** Chrome window manager の小数誤差・OS chrome 差を吸収するトレランス（±px） */
const HEIGHT_TOLERANCE = 16;

test.describe('popup window height for empty state', () => {
  test('履歴ゼロ empty では popup window が EMPTY_NO_HISTORY_HEIGHT (~600) に縮む', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;

    // SW から popup window を作成。activeTab に watch URL が無い状態で開くと
    // popup は empty state に倒れる。履歴 IDB がフレッシュなら no-history fallback。
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

    // popup ページを context から拾う
    let popupPage;
    const popupDeadline = Date.now() + 30_000;
    while (Date.now() < popupDeadline) {
      popupPage = context.pages().find((p) => p.url() === popupUrl);
      if (popupPage) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(popupPage, 'popup page should be created').toBeDefined();

    await dismissExtensionUsageTermsGate(popupPage);

    // refresh + resize が走るのを待つ
    await expect(
      popupPage.locator('html[data-nl-popup-content-painted="1"]')
    ).toBeAttached({ timeout: 15_000 });
    await popupPage.waitForTimeout(800); // resize の chrome.windows.update を待つ

    // popup window の現サイズを SW 経由で取得
    const dims = await sw.evaluate(async (url) => {
      const wins = await chrome.windows.getAll({ populate: true });
      const popup = wins.find(
        (w) =>
          w.type === 'popup' &&
          (w.tabs?.[0]?.url || '').startsWith(url.replace(/[?#].*$/, ''))
      );
      return { width: popup?.width, height: popup?.height, type: popup?.type };
    }, popupUrl);

    console.log(`[popup-empty-state-window-height] measured dims:`, dims);

    expect(dims.width).toBe(POPUP_WIDTH);
    expect(dims.type).toBe('popup');
    // 履歴ゼロ or 履歴ありどちらの可能性もある（このテストは fresh profile を仮定）。
    // 580 (no-history 想定下限) 〜 ACTIVE_WATCH_HEIGHT までの範囲なら OK
    // とし、resize が「780 のまま動かなかった」を強く弾く（780 ぴったり ±2 は退行）。
    expect(dims.height).toBeLessThanOrEqual(ACTIVE_WATCH_HEIGHT);
    expect(dims.height).toBeGreaterThanOrEqual(EMPTY_NO_HISTORY_HEIGHT - HEIGHT_TOLERANCE);
    expect(
      Math.abs(dims.height - ACTIVE_WATCH_HEIGHT),
      `popup didn't resize from default ${ACTIVE_WATCH_HEIGHT}`
    ).toBeGreaterThan(HEIGHT_TOLERANCE);
  });
});
