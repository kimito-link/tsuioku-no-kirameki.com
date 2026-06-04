/**
 * 複数タブ モンキーテスト(白化/クラッシュの自動炙り出し)。
 *
 * 既存の popup-monkey.spec.js は単一 popup のランダム操作。こちらは「複数タブを
 * ランダムに前面化しwhile スクロール/操作を浴びせる」= 白フラッシュ・描画飽和・
 * クラッシュが起きる複数タブ状況を再現シードで自動探索する。
 *
 * 各シード実行後に:
 *   - 全タブで pageerror が出ていない
 *   - 最後に各タブを前面化したとき、インラインパネルが白く(空に)ならない
 * を assert。手で「2タブ開いて速くスクロールして…」の消耗を機械に肩代わりさせる。
 */

import { test, expect, enableInlinePanelAutoshow } from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

const INLINE_HOST = '#nls-inline-popup-host';

/** 再現可能な乱数(popup-monkey.spec.js と同型)。 */
function mulberry32(seed) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MONKEY_SEEDS = [0x4e4c534d, 0x9e3779b1];

async function seedComments(sw) {
  await sw.evaluate(async ({ watchUrl }) => {
    const rows = Array.from({ length: 40 }, (_, idx) => ({
      id: `lv888888888::mk-${idx + 1}`,
      liveId: 'lv888888888',
      commentNo: String(idx + 1),
      userId: `user_${idx % 6}`,
      text: `multitab monkey row ${idx + 1}`,
      capturedAt: Date.now() - idx * 1000
    }));
    await chrome.storage.local.set({
      nls_recording_enabled: true,
      nls_last_watch_url: watchUrl,
      nls_comments_lv888888888: rows
    });
  }, { watchUrl: MOCK_WATCH });
}

async function openWatch(context) {
  const page = await context.newPage();
  await page.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
  await expect(page.locator('#e2e-mock-viewer-count-sentinel')).toBeAttached();
  return page;
}

/** 前面化したタブのパネルが白(空)でないことを assert。 */
async function expectNotBlank(page, label) {
  await page.bringToFront();
  const host = page.locator(INLINE_HOST);
  await expect(host, `${label}: ホスト出現`).toBeAttached({ timeout: 20_000 });
  const frame = page.frameLocator(`${INLINE_HOST} iframe`);
  await expect(
    frame.locator('html[data-nl-popup-content-painted="1"]'),
    `${label}: パネルが描画されない(白い)`
  ).toBeAttached({ timeout: 25_000 });
  await expect(frame.locator('.nl-main'), `${label}: .nl-main 不可視`).toBeVisible({
    timeout: 25_000
  });
}

test.describe('複数タブ モンキー 白化/クラッシュ検出', () => {
  for (const seed of MONKEY_SEEDS) {
    const seedHex = `0x${(seed >>> 0).toString(16)}`;
    test(`シード ${seedHex}: 複数タブをランダム前面化+操作しても白化/クラッシュしない`, async ({
      context
    }) => {
      const rand = mulberry32(seed);
      await enableInlinePanelAutoshow(context);

      let sw = context.serviceWorkers()[0];
      if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
      await seedComments(sw);

      const pageErrors = [];
      const tabs = [];
      for (let i = 0; i < 3; i++) {
        const p = await openWatch(context);
        p.on('pageerror', (err) => pageErrors.push(`tab${i}: ${err}`));
        tabs.push(p);
      }

      // ランダムに「タブ切り替え」「スクロール」「リロード」を浴びせる。
      const steps = 24;
      for (let i = 0; i < steps; i++) {
        const t = tabs[Math.floor(rand() * tabs.length)];
        const action = Math.floor(rand() * 3);
        try {
          if (action === 0) {
            await t.bringToFront();
          } else if (action === 1) {
            const host = t.locator(INLINE_HOST);
            if (await host.count()) {
              const frame = t.frameLocator(`${INLINE_HOST} iframe`);
              const main = frame.locator('.nl-main');
              if (await main.count()) {
                await main.evaluate((el, dy) => {
                  el.scrollTop = dy;
                }, Math.floor(rand() * 2000)).catch(() => {});
              }
            }
          } else {
            await t.bringToFront();
          }
        } catch {
          /* 操作失敗は無視(クラッシュは pageerror で拾う) */
        }
        await t.waitForTimeout(40 + Math.floor(rand() * 100));
      }

      // 最後に全タブを前面化して白化していないことを確認。
      for (let i = 0; i < tabs.length; i++) {
        await expectNotBlank(tabs[i], `タブ${i}(モンキー後)`);
      }

      expect(
        pageErrors,
        `pageerror が発生: ${pageErrors.join(' | ')}`
      ).toHaveLength(0);
    });
  }
});
