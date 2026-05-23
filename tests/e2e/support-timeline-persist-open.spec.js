import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * v0.1.343: 応援タイムラインの開閉状態を永続化（単一枠の完成度向上）を実ブラウザで実証。
 * 既定は閉じ。開いて reload しても開いたまま。再び閉じて reload すると閉じたまま。
 */

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_RECORDING = 'nls_recording_enabled';
const KEY_TIMELINE_OPEN = 'nls_support_timeline_open_v1';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('応援タイムライン: 開いた状態が reload 後も保持される（既定は閉じ）', async ({
  context
}) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;
  await sw.evaluate(
    async ({ watchKey, recKey, watchUrl }) => {
      await chrome.storage.local.set({ [watchKey]: watchUrl, [recKey]: true });
    },
    { watchKey: KEY_LAST_WATCH_URL, recKey: KEY_RECORDING, watchUrl: MOCK_WATCH }
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
  await expect(popup.locator('html[data-nl-support-wired]')).toBeAttached({
    timeout: 20_000
  });

  const details = popup.locator('#supportTimelineDetails');
  await expect(details).toBeAttached();
  // 既定は閉じ。
  expect(await details.evaluate((el) => el.open)).toBe(false);

  // 開く（summary クリック）→ storage に true が保存される。
  await popup.locator('#supportTimelineDetails > summary').click();
  await expect
    .poll(
      async () => {
        const b = await sw.evaluate(async (k) => {
          const bag = await chrome.storage.local.get(k);
          return bag[k];
        }, KEY_TIMELINE_OPEN);
        return b === true;
      },
      { timeout: 6000, message: '開いたら storage に true が保存されるまで' }
    )
    .toBe(true);

  // reload して、開いたままであることを確認。
  await popup.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await dismissExtensionUsageTermsGate(popup);
  await expect(popup.locator('html[data-nl-support-wired]')).toBeAttached({
    timeout: 20_000
  });
  await expect
    .poll(async () => popup.locator('#supportTimelineDetails').evaluate((el) => el.open), {
      timeout: 8000,
      message: 'reload 後も開いたままになるまで'
    })
    .toBe(true);

  // 閉じる → reload → 閉じたまま。
  await popup.locator('#supportTimelineDetails > summary').click();
  await expect
    .poll(
      async () =>
        sw.evaluate(async (k) => {
          const bag = await chrome.storage.local.get(k);
          return bag[k];
        }, KEY_TIMELINE_OPEN),
      { timeout: 6000 }
    )
    .toBe(false);
  await popup.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await dismissExtensionUsageTermsGate(popup);
  await expect(popup.locator('html[data-nl-support-wired]')).toBeAttached({
    timeout: 20_000
  });
  await popup.waitForTimeout(1000);
  expect(
    await popup.locator('#supportTimelineDetails').evaluate((el) => el.open)
  ).toBe(false);
});
