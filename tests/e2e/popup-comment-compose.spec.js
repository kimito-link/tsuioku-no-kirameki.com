import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_RECORDING = 'nls_recording_enabled';
const STORAGE_COMMENTS = 'nls_comments_lv888888888';

async function extensionIdFromContext(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) {
    sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  }
  return new URL(sw.url()).hostname;
}

test.describe('popup comment compose', () => {
  test('watch 未接続では disabled と案内文を出す', async ({ context }) => {
    const extensionId = await extensionIdFromContext(context);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await dismissExtensionUsageTermsGate(popup);

    await expect(popup.locator('#postCommentBtn')).toBeDisabled();
    await expect(popup.locator('#commentInput')).toHaveAttribute(
      'placeholder',
      'watchページを開くとコメント送信できます'
    );
    await expect(popup.locator('#postStatus')).toContainText(
      'watchページを開くとコメント送信できます。'
    );
  });

  test('watch 接続中は空欄で disabled、入力後に送信できて成功文言を返す', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;

    await sw.evaluate(
      async ({ watchUrl, watchKey, recordingKey, commentsKey }) => {
        await chrome.storage.local.set({
          [watchKey]: watchUrl,
          [recordingKey]: true,
          [commentsKey]: []
        });
      },
      {
        watchUrl: MOCK_WATCH,
        watchKey: KEY_LAST_WATCH_URL,
        recordingKey: KEY_RECORDING,
        commentsKey: STORAGE_COMMENTS
      }
    );

    const watch = await context.newPage();
    await watch.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
    await watch.waitForTimeout(800);

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await focusMockWatchThenReloadPopup(watch, popup);
    await dismissExtensionUsageTermsGate(popup);

    const postBtn = popup.locator('#postCommentBtn');
    const input = popup.locator('#commentInput');
    const status = popup.locator('#postStatus');

    await expect(input).toHaveAttribute('placeholder', 'コメントを入力して送信');
    await expect(postBtn).toBeDisabled();

    await input.fill('popup send ok');
    await expect(postBtn).toBeEnabled();

    await postBtn.click();

    await expect(status).toContainText('コメントを送信しました。', { timeout: 15_000 });
    await expect(input).toHaveValue('');
    await expect(postBtn).toBeDisabled();
  });

  test('強い言い方ではりんくの POP が出て、一度だけ言い換えを促してから送る', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;

    await sw.evaluate(
      async ({ watchUrl, watchKey, recordingKey, commentsKey }) => {
        await chrome.storage.local.set({
          [watchKey]: watchUrl,
          [recordingKey]: true,
          [commentsKey]: []
        });
      },
      {
        watchUrl: MOCK_WATCH,
        watchKey: KEY_LAST_WATCH_URL,
        recordingKey: KEY_RECORDING,
        commentsKey: STORAGE_COMMENTS
      }
    );

    const watch = await context.newPage();
    await watch.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
    await watch.waitForTimeout(800);

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await focusMockWatchThenReloadPopup(watch, popup);
    await dismissExtensionUsageTermsGate(popup);

    const postBtn = popup.locator('#postCommentBtn');
    const input = popup.locator('#commentInput');
    const status = popup.locator('#postStatus');
    const care = popup.locator('#commentKindnessPopover');

    await input.fill('死ねよ');

    await expect(care).toBeVisible();
    await expect(care).toContainText('りんくから、ひとこと');
    await expect(care).toContainText('やわらかい言い方にしてみよう');

    await postBtn.click();

    await expect(input).toHaveValue('死ねよ');
    await expect(status).toContainText('送信の前に、りんくのひとことを見てね。');
    await expect(care).toContainText('そのまま送るなら、もう一度');

    await postBtn.click();

    await expect(status).toContainText('コメントを送信しました。', { timeout: 15_000 });
    await expect(input).toHaveValue('');
  });
});
