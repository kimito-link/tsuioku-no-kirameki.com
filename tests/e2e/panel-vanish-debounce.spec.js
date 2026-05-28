import { test, expect, enableInlinePanelAutoshow } from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * v0.1.311 パネル消失デバウンス検証（会議室確定の対策2）。
 *
 * syncLiveIdFromLocation は LIVE_POLL_MS(=4000ms, timingConstants.js)ごとに走り、
 * 従来は「watch URL でない」を 1 tick 検出しただけで即 hidePageFrameOverlay() していた。
 * SPA 遷移トランジェントでパネルが点滅消失するため、連続 NON_WATCH_HIDE_TICK_THRESHOLD
 * (=5, ≒20s) 観測してから初めて hide するデバウンスを入れた。
 *
 * このテストは:
 *  - 短いトランジェント（~2.5s 非 watch → 復帰）でパネルが消えないこと
 *  - 持続的に離脱（5 tick × 4s = 約 20s 以上）したら従来どおり hide すること
 * を実ブラウザ（headed 既定 / CI は PW_HEADLESS=1）で実証する。
 *
 * v0.1.444: 元 spec のコメントは livePollMs 360ms 前提のままだったが、master の
 *   timingConstants.js では既に 4000ms。閾値 5 × 4s = 20s なので、トランジェント期間と
 *   持続離脱の hide 待ち timeout を実態に合わせて延長した（spec のみ・実装不変）。
 */

const INLINE_HOST_ID = 'nls-inline-popup-host';

async function hostDisplay(page) {
  return page.evaluate((id) => {
    const el = globalThis.document.getElementById(id);
    if (!el) return 'absent';
    return globalThis.getComputedStyle(el).display;
  }, INLINE_HOST_ID);
}

test.describe('panel vanish debounce', () => {
  test('短い非watchトランジェントではパネルが消えない / 持続離脱では消える', async ({
    context
  }) => {
    await enableInlinePanelAutoshow(context);

    const page = await context.newPage();
    await page.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
    // パネルが出るまで待つ
    await expect
      .poll(() => hostDisplay(page), { timeout: 15_000 })
      .toBe('block');

    // --- 短いトランジェント: 非 watch URL に ~3s だけ滞在して戻す（閾値 5 tick × 4s = 20s 未満）---
    await page.evaluate(() => {
      globalThis.history.pushState({}, '', '/transient-not-watch');
      globalThis.dispatchEvent(new Event('popstate'));
    });
    await page.waitForTimeout(3_000); // 閾値(~20s)未満
    await page.evaluate((mock) => {
      const u = new URL(mock);
      globalThis.history.pushState({}, '', u.pathname);
      globalThis.dispatchEvent(new Event('popstate'));
    }, MOCK_WATCH);
    await page.waitForTimeout(1_000);

    // トランジェント中・復帰後ともパネルは block のまま（消えない）
    expect(await hostDisplay(page)).toBe('block');

    // --- 持続離脱: 非 watch に >20s 滞在 → デバウンス閾値を超えて hide ---
    await page.evaluate(() => {
      globalThis.history.pushState({}, '', '/leave-watch-for-good');
      globalThis.dispatchEvent(new Event('popstate'));
    });
    // 5 tick × 4s = 20s + 余裕。実装が hide を呼ぶまで poll で待つ。
    await expect
      .poll(() => hostDisplay(page), { timeout: 30_000 })
      .toBe('none');
  });
});
