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

async function extensionIdFromContext(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) {
    sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  }
  return new URL(sw.url()).hostname;
}

test.describe('popup compose / toolbar-only visibility', () => {
  test('通常ポップアップでは data-nl-toolbar-only のコメント補助セクションが表示される', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;

    await sw.evaluate(
      async ({ recordingKey, lastWatchKey, commentsKey, watchUrl }) => {
        await chrome.storage.local.set({
          [recordingKey]: true,
          [lastWatchKey]: watchUrl,
          [commentsKey]: []
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

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await focusMockWatchThenReloadPopup(watch, popup);
    await dismissExtensionUsageTermsGate(popup);
    await expect(popup.locator('html[data-nl-support-wired]')).toBeAttached({
      timeout: 15_000
    });

    const display = await popup.evaluate(() => {
      const el = document.querySelector(
        'section.nl-comment-compose[data-nl-toolbar-only]'
      );
      return el ? globalThis.getComputedStyle(el).display : null;
    });
    expect(display, '補助セクションが DOM にある').not.toBeNull();
    expect(display).not.toBe('none');
  });

  test('inline=1 では data-nl-toolbar-only セクションが非表示', async ({
    context
  }) => {
    const extensionId = await extensionIdFromContext(context);
    const popup = await context.newPage();
    await popup.goto(
      `chrome-extension://${extensionId}/popup.html?inline=1`,
      {
        waitUntil: 'domcontentloaded',
        timeout: 60_000
      }
    );
    await dismissExtensionUsageTermsGate(popup);

    const display = await popup.evaluate(() => {
      const el = document.querySelector(
        'section.nl-comment-compose[data-nl-toolbar-only]'
      );
      return el ? globalThis.getComputedStyle(el).display : null;
    });
    expect(display, '補助セクションが DOM にある').not.toBeNull();
    expect(display).toBe('none');
  });

  test('inline=1（watch 埋め込み）でも primary のコメント入力と送信ボタンを表示する', async ({
    context
  }) => {
    const extensionId = await extensionIdFromContext(context);

    const embed = await context.newPage();
    await embed.goto(
      `chrome-extension://${extensionId}/popup.html?inline=1`,
      {
        waitUntil: 'domcontentloaded',
        timeout: 60_000
      }
    );
    await dismissExtensionUsageTermsGate(embed);
    const embedVisibility = await embed.evaluate(() => {
      const input = document.getElementById('commentInput');
      const post = document.getElementById('postCommentBtn');
      return {
        inputDisplay: input ? globalThis.getComputedStyle(input).display : null,
        postDisplay: post ? globalThis.getComputedStyle(post).display : null
      };
    });
    expect(embedVisibility.inputDisplay).not.toBe('none');
    expect(embedVisibility.postDisplay).not.toBe('none');

    const side = await context.newPage();
    await side.goto(
      `chrome-extension://${extensionId}/popup.html?inline=1&dock=sidepanel`,
      {
        waitUntil: 'domcontentloaded',
        timeout: 60_000
      }
    );
    await dismissExtensionUsageTermsGate(side);
    const sideVisibility = await side.evaluate(() => {
      const input = document.getElementById('commentInput');
      const post = document.getElementById('postCommentBtn');
      return {
        inputDisplay: input ? globalThis.getComputedStyle(input).display : null,
        postDisplay: post ? globalThis.getComputedStyle(post).display : null
      };
    });
    expect(sideVisibility.inputDisplay).not.toBe('none');
    expect(sideVisibility.postDisplay).not.toBe('none');
  });

  test('inline=1 では本家公式統計チップ行が grid で並びチップが DOM に残る', async ({
    context
  }) => {
    const extensionId = await extensionIdFromContext(context);
    const page = await context.newPage();
    await page.goto(
      `chrome-extension://${extensionId}/popup.html?inline=1`,
      {
        waitUntil: 'domcontentloaded',
        timeout: 60_000
      }
    );
    await dismissExtensionUsageTermsGate(page);
    await expect(page.locator('html.nl-inline')).toBeAttached({
      timeout: 10_000
    });

    const row = page.locator('.nl-official-nico-stats__row');
    await expect(row).toBeAttached();
    const display = await row.evaluate((el) =>
      globalThis.getComputedStyle(el).display
    );
    expect(display).toBe('grid');

    const chipCount = await page
      .locator('.nl-official-nico-stats__row .nl-official-nico-stats__chip')
      .count();
    expect(chipCount).toBeGreaterThan(0);

    await expect(page.locator('.nl-main')).toBeVisible();
  });
});
