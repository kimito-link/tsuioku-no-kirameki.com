import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup,
  openNlPopupSettings
} from './fixtures.js';
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
/**
 * 固定 1 シードを N 回反復しても同一決定列の再生で探索空間は増えない。
 * 会議室の指摘（テスト戦略: 設計AI ✗重大 / 批判AI 重い / ギャップ 中）に従い、
 * 反復回数ではなく seed を配列で回して入力多様性＝情報量を増やす。
 * 先頭 0x4e4c534d ("NLSM") は従来 baseline との連続性のため温存し、
 * 残りは 32bit に分散させた定数（黄金比/xxhash/murmur 由来）。
 */
const MONKEY_SEEDS = [0x4e4c534d, 0x9e3779b1, 0x85ebca6b, 0xc2b2ae35];

test.describe('popup monkey', () => {
  for (const seed of MONKEY_SEEDS) {
    const seedHex = `0x${(seed >>> 0).toString(16)}`;
    test(`シード ${seedHex} のランダム操作後も UI が生存`, async ({ context }) => {
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
    await focusMockWatchThenReloadPopup(watch, popup);
    await dismissExtensionUsageTermsGate(popup);
    await popup.waitForTimeout(600);
    await openNlPopupSettings(popup);

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
  }
});
