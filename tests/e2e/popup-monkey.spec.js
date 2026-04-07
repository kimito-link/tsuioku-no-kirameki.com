import { test, expect, dismissExtensionUsageTermsGate } from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';
const KEY_RECORDING = 'nls_recording_enabled';
const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const STORAGE_COMMENTS = 'nls_comments_lv888888888';

/** 再現可能な乱数（同一シードなら同じ操作列） */
function mulberry32(seed) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * ポップアップ上で疑似ランダム操作を繰り返し、クラッシュや pageerror が出ないことを確認する。
 * 実行例: npm run test:e2e:monkey
 */
test.describe('popup monkey', () => {
  test('シード付きランダム操作後も UI が生存', async ({ context }) => {
    const seed = 0x4e4c534d; // "NLSM"
    const rand = mulberry32(seed);

    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;

    await sw.evaluate(
      async ({ recordingKey, lastWatchKey, commentsKey, watchUrl }) => {
        const rows = Array.from({ length: 24 }, (_, idx) => ({
          id: `lv888888888::${idx + 1}`,
          liveId: 'lv888888888',
          commentNo: String(idx + 1),
          userId: `user_${idx % 6}`,
          text: `monkey row ${idx + 1}`,
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
    const pageErrors = [];
    popup.on('pageerror', (err) => {
      pageErrors.push(String(err));
    });

    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await dismissExtensionUsageTermsGate(popup);
    await popup.waitForTimeout(600);

    const actionPool = [
      async () => {
        const loc = popup.locator('#recordToggle');
        if (await loc.isVisible()) await loc.click({ timeout: 3000 });
      },
      async () => {
        const loc = popup.locator('details.nl-voice-os-guide summary').first();
        if (await loc.isVisible()) await loc.click({ timeout: 3000 });
      },
      async () => {
        const loc = popup.locator('#voiceDeviceRefresh');
        if (await loc.isVisible()) await loc.click({ timeout: 3000 });
      },
      async () => {
        const loc = popup.locator('#commentInput');
        if (await loc.isVisible()) {
          await loc.fill(`e2e ${Math.floor(rand() * 1e6)}`);
        }
      },
      async () => {
        const loc = popup.locator('img.nl-story-growth-icon').first();
        if ((await loc.count()) > 0 && (await loc.isVisible())) {
          await loc.click({ timeout: 3000 });
        }
      },
      async () => {
        const loc = popup.locator('#voiceAutoSend');
        if (await loc.isVisible()) await loc.click({ timeout: 3000 });
      },
      async () => {
        const loc = popup.locator('select#thumbInterval');
        if (await loc.isVisible()) {
          const opts = await loc.locator('option').count();
          if (opts > 1) {
            const i = 1 + Math.floor(rand() * (opts - 1));
            await loc.selectOption({ index: i }).catch(() => {});
          }
        }
      },
      async () => {
        await popup.keyboard.press('Escape');
      },
      async () => {
        await popup.keyboard.press('Tab');
      }
    ];

    const steps = 36;
    for (let i = 0; i < steps; i++) {
      const fn = actionPool[Math.floor(rand() * actionPool.length)];
      await fn().catch(() => {});
      await popup.waitForTimeout(50 + Math.floor(rand() * 120));
    }

    await expect(popup.locator('.nl-main')).toBeVisible();
    await expect(popup.locator('#count')).toBeVisible();

    expect(
      pageErrors,
      `pageerror が発生: ${pageErrors.join(' | ')}`
    ).toHaveLength(0);
  });
});
