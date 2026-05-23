import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * v0.1.334: ヘッダーのパネル位置クイックバーを実ブラウザで実証する。
 * - ヘッダー（ビルドバッジ付近）にクイックバーが表示される。
 * - 「横付き」「下」チップで配置が切り替わり、storage(nls_inline_panel_placement)に
 *   保存される（既存 saveInlinePanelPlacement 経由＝二重管理しない）。
 * - 現在値ラベルが追従する。狭幅でも見切れない（右端が viewport 内）。
 */

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_RECORDING = 'nls_recording_enabled';
const KEY_PLACEMENT = 'nls_inline_panel_placement';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('ヘッダー位置クイックバー: 表示・切替・保存・見切れなし', async ({ context }) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;

  await sw.evaluate(
    async ({ watchUrl, watchKey, recordingKey }) => {
      await chrome.storage.local.set({ [watchKey]: watchUrl, [recordingKey]: true });
    },
    { watchUrl: MOCK_WATCH, watchKey: KEY_LAST_WATCH_URL, recordingKey: KEY_RECORDING }
  );

  const watch = await context.newPage();
  await watch.goto(MOCK_WATCH, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 360, height: 640 }); // 狭幅で見切れ確認
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await dismissExtensionUsageTermsGate(popup);
  await focusMockWatchThenReloadPopup(watch, popup);
  await popup.waitForTimeout(1500);

  const bar = popup.locator('#nlPlacementQuickbar');
  await expect(bar).toBeAttached();
  await expect(bar).toBeVisible();

  // 見切れなし: クイックバーの右端が viewport 内。
  const overflow = await popup.evaluate(() => {
    const el = document.getElementById('nlPlacementQuickbar');
    if (!el) return { right: 0, vw: 0 };
    return { right: Math.round(el.getBoundingClientRect().right), vw: window.innerWidth };
  });
  console.log('quickbar overflow:', JSON.stringify(overflow));
  expect(overflow.right).toBeLessThanOrEqual(overflow.vw + 2);

  // 「横付き」チップを押す → storage が beside に。
  await popup.locator('#nlPlacementQuickBeside').click();
  await popup.waitForTimeout(800);
  const afterBeside = await sw.evaluate(async (k) => {
    const b = await chrome.storage.local.get(k);
    return b[k];
  }, KEY_PLACEMENT);
  console.log('after beside click, placement:', afterBeside);
  expect(afterBeside).toBe('beside');

  // 現在値ラベル・aria-pressed が追従。
  await expect(popup.locator('#nlPlacementQuickValue')).toContainText('横付き');
  await expect(popup.locator('#nlPlacementQuickBeside')).toHaveAttribute('aria-pressed', 'true');

  // 「下」チップを押す → storage が below に。
  await popup.locator('#nlPlacementQuickBelow').click();
  await popup.waitForTimeout(800);
  const afterBelow = await sw.evaluate(async (k) => {
    const b = await chrome.storage.local.get(k);
    return b[k];
  }, KEY_PLACEMENT);
  console.log('after below click, placement:', afterBelow);
  expect(afterBelow).toBe('below');
  await expect(popup.locator('#nlPlacementQuickBelow')).toHaveAttribute('aria-pressed', 'true');
  await expect(popup.locator('#nlPlacementQuickBeside')).toHaveAttribute('aria-pressed', 'false');

  await popup.screenshot({ path: 'test-results/header-placement-quickbar.png', fullPage: false });
});
