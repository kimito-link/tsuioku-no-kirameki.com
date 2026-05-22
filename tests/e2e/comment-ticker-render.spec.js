import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * A-1 リファクタ検証: renderCommentTicker の HTML 組み立てを純関数
 * buildCommentTickerLatestHtml に外出ししても、実 popup の最新ティッカーが
 * 従来どおり描画されることを実ブラウザで実証する（pure refactor 挙動不変）。
 *
 * 注: active watch ではモック watch ページの content script が自前のコメントを
 * harvest して表示エントリの source of truth になるため、storage seed した
 * userId は採用されない（リンク有無の網羅は unit test 側で固定）。本 e2e は
 * 「抽出した純関数が popup に正しく配線され、ティッカーが描画される」ことを担保する。
 */

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_RECORDING = 'nls_recording_enabled';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('最新コメントティッカーが nl-ticker-latest として描画される（配線確認）', async ({
  context
}) => {
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
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await dismissExtensionUsageTermsGate(popup);
  await focusMockWatchThenReloadPopup(watch, popup);
  await popup.waitForTimeout(1500);

  const seg = popup.locator('#commentTickerSegA');
  await expect(seg).toBeAttached();
  await expect
    .poll(async () => (await seg.innerHTML().catch(() => '')).length, { timeout: 8000 })
    .toBeGreaterThan(0);

  // 抽出した buildCommentTickerLatestHtml が生成する構造が出ている
  const latest = seg.locator('.nl-ticker-latest');
  await expect(latest).toHaveCount(1);
  await expect(seg.locator('.nl-ticker-latest__row')).toHaveCount(1);
  await expect(seg.locator('img.nl-ticker-latest__avatar')).toHaveCount(1);
  await expect(seg.locator('.nl-ticker-latest__text')).toHaveCount(1);
  // aria-live が付いている（従来どおり）
  await expect(latest).toHaveAttribute('aria-live', 'polite');
});
