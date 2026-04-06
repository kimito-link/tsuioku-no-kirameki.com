import { test, expect, dismissExtensionUsageTermsGate } from './fixtures.js';

const MOCK_WATCH = 'http://127.0.0.1:3456/watch/lv888888888/';
const KEY_RECORDING = 'nls_recording_enabled';
const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const STORAGE_COMMENTS = 'nls_comments_lv888888888';
const KEY_SUPPORT_VISUAL_EXPANDED = 'nls_support_visual_expanded';

/** ポップアップ初期化（storage 反映・refresh）が終わるまで待つ */
async function waitForPopupInteractive(popup) {
  await dismissExtensionUsageTermsGate(popup);
  await expect(popup.locator('.nl-stats-bar')).toBeVisible({ timeout: 15_000 });
  await expect(popup.locator('#supportVisualDetails')).toBeAttached({
    timeout: 15_000
  });
  /* 応援トグルは applySupportVisualExpandedFromStorage 後に結線される */
  await expect(popup.locator('html[data-nl-support-wired]')).toBeAttached({
    timeout: 15_000
  });
}

/** #supportVisualDetails の open 状態が期待値になるまで待つ */
async function expectDetailsOpen(popup, open, message) {
  await expect
    .poll(
      async () =>
        popup.locator('#supportVisualDetails').evaluate((el) => el.open),
      { timeout: 8000, message: message || `details.open === ${open}` }
    )
    .toBe(open);
}

/** 応援ビジュアル本文が .nl-main の表示範囲と交差している */
async function expectSupportBodyVisibleInMain(popup) {
  await expect
    .poll(
      async () =>
        popup.evaluate(() => {
          const main = document.querySelector('.nl-main');
          const body = document.querySelector('.nl-support-visual-details__body');
          if (!main || !body) return false;
          const mainRect = main.getBoundingClientRect();
          const bodyRect = body.getBoundingClientRect();
          const topVisible = bodyRect.top < mainRect.bottom;
          const bottomVisible = bodyRect.bottom > mainRect.top;
          return topVisible && bottomVisible;
        }),
      {
        timeout: 10_000,
        message: 'details body should intersect .nl-main viewport after scroll'
      }
    )
    .toBe(true);
}

test.describe('popup layout', () => {
  test('popup renders core blocks; body does not scroll (main may scroll)', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;

    await sw.evaluate(
      async ({ recordingKey, lastWatchKey, commentsKey, watchUrl }) => {
        /* 件数多すぎると .nl-main 内スクロールが必須になり、全ブロックが一画面に収まらない */
        const rows = Array.from({ length: 14 }, (_, idx) => ({
          id: `lv888888888::${idx + 1}`,
          liveId: 'lv888888888',
          commentNo: String(idx + 1),
          userId: `user_${idx % 18}`,
          text: `mock row ${idx + 1}`,
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

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await waitForPopupInteractive(popup);

    const metrics = await popup.evaluate(() => {
      const doc = globalThis.document;
      const html = doc.documentElement;
      const body = doc.body;
      const main = doc.querySelector('.nl-main');
      const rooms = doc.getElementById('userRoomList');
      const viewportHeight = body?.clientHeight || html.clientHeight || 0;
      const mainOverflowY = main
        ? globalThis.getComputedStyle(main).overflowY
        : '';
      const requiredSelectors = [
        '.nl-stats',
        '.nl-record',
        '.nl-comment-compose--primary',
        '.nl-compose-quick-toolbar',
        '#exportJson',
        '#supportVisualDetails',
        '#userRoomList'
      ];
      const required = requiredSelectors.map((selector) => {
        const el = doc.querySelector(selector);
        if (!el) {
          return { selector, exists: false, bottom: -1 };
        }
        const rect = el.getBoundingClientRect();
        return {
          selector,
          exists: true,
          bottom: Math.round(rect.bottom)
        };
      });
      return {
        width: body?.clientWidth || 0,
        height: body?.clientHeight || 0,
        bodyOverflow: Math.max(0, body.scrollHeight - body.clientHeight),
        mainOverflow: main
          ? Math.max(0, main.scrollHeight - main.clientHeight)
          : -1,
        mainOverflowY,
        roomsOverflow: rooms
          ? Math.max(0, rooms.scrollHeight - rooms.clientHeight)
          : -1,
        viewportHeight,
        required,
        requiredAllExist: required.every((v) => v.exists)
      };
    });
    console.log('popup metrics', metrics);

    expect(metrics.width).toBeGreaterThanOrEqual(340);
    expect(metrics.width).toBeLessThanOrEqual(540);
    expect(metrics.height).toBeGreaterThanOrEqual(560);
    expect(metrics.height).toBeLessThanOrEqual(960);
    expect(metrics.bodyOverflow).toBeLessThanOrEqual(1);
    expect(['auto', 'scroll'].includes(metrics.mainOverflowY)).toBeTruthy();
    expect(metrics.roomsOverflow).toBeLessThanOrEqual(1);
    expect(metrics.requiredAllExist).toBeTruthy();
  });

  test('配色ブロックは既定で閉じ、開くとプリセットチップが見える', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await waitForPopupInteractive(popup);

    const themeDetails = popup.locator('#frameThemeDetails');
    await expect(themeDetails).toBeAttached();
    await expect
      .poll(() => themeDetails.evaluate((el) => el.open), {
        timeout: 8000,
        message: 'frameThemeDetails starts closed'
      })
      .toBe(false);

    const lightChip = popup.locator('.nl-frame-chip[data-frame-id="light"]');
    await expect(lightChip).not.toBeVisible();

    await popup.locator('#frameThemeDetails .nl-frame-theme-details__summary').click();
    await expect
      .poll(() => themeDetails.evaluate((el) => el.open), {
        timeout: 8000,
        message: 'frameThemeDetails opens after summary click'
      })
      .toBe(true);
    await expect(lightChip).toBeVisible();
  });

  test('音声ガイドは既定で閉じ、開くと OS 別の手順が見える', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await waitForPopupInteractive(popup);

    const voiceDetails = popup.locator('#voiceOsGuideDetails');
    await expect(voiceDetails).toBeAttached();
    await expect
      .poll(() => voiceDetails.evaluate((el) => el.open), {
        timeout: 8000,
        message: 'voiceOsGuideDetails starts closed'
      })
      .toBe(false);

    const winKbd = popup.locator('#voiceOsGuideDetails kbd').filter({ hasText: 'Win' });
    await expect(winKbd).not.toBeVisible();

    await popup.locator('#voiceOsGuideDetails .nl-voice-guide-summary').click();
    await expect
      .poll(() => voiceDetails.evaluate((el) => el.open), {
        timeout: 8000,
        message: 'voiceOsGuideDetails opens after summary click'
      })
      .toBe(true);
    await expect(winKbd.first()).toBeVisible();
  });

  test('応援ビジュアルは既定で閉じ、summary で開閉してグリッドが見える', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;

    await sw.evaluate(async ({ key }) => {
      await chrome.storage.local.remove(key);
    }, { key: KEY_SUPPORT_VISUAL_EXPANDED });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await waitForPopupInteractive(popup);

    await expectDetailsOpen(popup, false, 'initially details closed');

    await popup.locator('#supportVisualDetailsSummary').click();
    await expectDetailsOpen(popup, true, 'after summary click, details should open');
    await expect(popup.locator('#sceneStoryGauge')).toBeVisible({ timeout: 8000 });

    await popup.locator('#supportVisualDetailsSummary').click();
    await expectDetailsOpen(popup, false, 'after second summary click, details should close');

    await popup.locator('#supportVisualDetailsSummary').click();
    await expectDetailsOpen(popup, true, 'after third summary click, details should open');
    await expect(popup.locator('#sceneStoryGauge')).toBeVisible({ timeout: 8000 });
  });

  test('応援 summary にフォーカスして Space で開き、グリッドが見える', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;

    await sw.evaluate(async ({ key }) => {
      await chrome.storage.local.remove(key);
    }, { key: KEY_SUPPORT_VISUAL_EXPANDED });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await waitForPopupInteractive(popup);
    await expectDetailsOpen(popup, false, 'keyboard test: start closed');

    await popup.locator('#supportVisualDetailsSummary').focus();
    await popup.keyboard.press('Space');
    await expectDetailsOpen(popup, true, 'after Space on summary, details should open');
    await expect(popup.locator('#sceneStoryGauge')).toBeVisible({ timeout: 8000 });
  });

  test('応援 summary で開いたあと details body が .nl-main ビューポート内にスクロールされる', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;

    await sw.evaluate(
      async ({ recordingKey, lastWatchKey, commentsKey, watchUrl, expandedKey }) => {
        const rows = Array.from({ length: 14 }, (_, idx) => ({
          id: `lv888888888::${idx + 1}`,
          liveId: 'lv888888888',
          commentNo: String(idx + 1),
          userId: `user_${idx % 18}`,
          text: `mock row ${idx + 1}`,
          capturedAt: Date.now() - idx * 1000
        }));
        await chrome.storage.local.set({
          [recordingKey]: true,
          [lastWatchKey]: watchUrl,
          [commentsKey]: rows,
          [expandedKey]: false
        });
      },
      {
        recordingKey: KEY_RECORDING,
        lastWatchKey: KEY_LAST_WATCH_URL,
        commentsKey: STORAGE_COMMENTS,
        watchUrl: MOCK_WATCH,
        expandedKey: KEY_SUPPORT_VISUAL_EXPANDED
      }
    );

    const watch = await context.newPage();
    await watch.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await waitForPopupInteractive(popup);

    await expectDetailsOpen(popup, false, 'scroll test: start with details closed');

    await popup.locator('#supportVisualDetailsSummary').click();
    await expectDetailsOpen(popup, true, 'scroll test: open before measuring viewport');
    await expectSupportBodyVisibleInMain(popup);
  });

  test('応援 summary 中心の elementFromPoint が summary（またはその子）を返し、1クリックで開く', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;

    await sw.evaluate(
      async ({ recordingKey, lastWatchKey, commentsKey, watchUrl, expandedKey }) => {
        const rows = Array.from({ length: 14 }, (_, idx) => ({
          id: `lv888888888::${idx + 1}`,
          liveId: 'lv888888888',
          commentNo: String(idx + 1),
          userId: `user_${idx % 18}`,
          text: `mock row ${idx + 1}`,
          capturedAt: Date.now() - idx * 1000
        }));
        await chrome.storage.local.set({
          [recordingKey]: true,
          [lastWatchKey]: watchUrl,
          [commentsKey]: rows,
          [expandedKey]: false
        });
      },
      {
        recordingKey: KEY_RECORDING,
        lastWatchKey: KEY_LAST_WATCH_URL,
        commentsKey: STORAGE_COMMENTS,
        watchUrl: MOCK_WATCH,
        expandedKey: KEY_SUPPORT_VISUAL_EXPANDED
      }
    );

    const watch = await context.newPage();
    await watch.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await waitForPopupInteractive(popup);

    /* 先頭ブロックが増えたとき summary が .nl-main 外に出ると elementFromPoint が外れる */
    await popup.locator('#supportVisualDetailsSummary').scrollIntoViewIfNeeded();

    const hit = await popup.evaluate(() => {
      const el = document.getElementById('supportVisualDetailsSummary');
      if (!el) return { ok: false, reason: 'no-summary' };
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      const inside =
        top instanceof Node && (top === el || el.contains(top));
      return {
        ok: inside,
        topTag: top && /** @type {Element} */ (top).tagName,
        topId: top && 'id' in top ? /** @type {HTMLElement} */ (top).id : ''
      };
    });
    console.log('elementFromPoint at support visual summary center', hit);
    expect(hit.ok).toBe(true);

    await popup.locator('#supportVisualDetailsSummary').click();
    await expectDetailsOpen(popup, true, 'hit-test: one click should open details');
  });
});
