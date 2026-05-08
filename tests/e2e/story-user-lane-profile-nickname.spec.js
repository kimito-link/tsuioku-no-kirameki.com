/**
 * 応援ユーザーレーン: NDGR 等の stamp_* / nicolive_* 内部表示名より、
 * nls_user_comment_profile_v1（intercept 由来のキャッシュ）の本名が優先されること。
 *
 * 実ユーザー例: user/6292820 の Chiharu さんが stamp_applause と出る退行の回帰ガード。
 */

import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup,
  openNlPopupSettings
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

async function extensionServiceWorker(context) {
  const pickExt = () =>
    context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const ext = pickExt();
    if (ext) return ext;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('extension service worker not found');
}

async function extensionIdFromContext(context) {
  const sw = await extensionServiceWorker(context);
  return new URL(sw.url()).hostname;
}

async function clearLaneAndProfileFixture(context) {
  const sw = await extensionServiceWorker(context);
  await sw.evaluate(async () => {
    const bag = await chrome.storage.local.get(null);
    const rm = Object.keys(bag).filter(
      (k) =>
        k === 'nls_comments' ||
        k.startsWith('nls_comments_') ||
        k === 'nls_user_comment_profile_v1'
    );
    if (rm.length) await chrome.storage.local.remove(rm);
  });
}

/**
 * @param {import('@playwright/test').BrowserContext} context
 * @param {{ includeSelf?: boolean }} [opts]
 */
async function seedProfileNicknameFixture(context, opts = {}) {
  const liveId = 'lv888888888';
  const commentsKey = `nls_comments_${liveId}`;
  const personalThumb = 'https://example.com/e2e-lane-thumb.png';
  /** @type {Record<string, unknown>[]} */
  const rows = [
    {
      id: `${liveId}:chiharu`,
      liveId,
      userId: '6292820',
      nickname: 'stamp_applause',
      avatarUrl: personalThumb,
      capturedAt: Date.now(),
      commentNo: '1',
      text: 'hello',
      avatarObserved: true
    }
  ];
  /** @type {Record<string, { nickname: string, updatedAt: number }>} */
  const profile = {
    '6292820': { nickname: 'Chiharu', updatedAt: Date.now() }
  };
  if (opts.includeSelf) {
    rows.push({
      id: `${liveId}:self`,
      liveId,
      userId: '4046119',
      nickname: 'nicolive_audition_lightgreen',
      avatarUrl: 'https://example.com/e2e-self-thumb.png',
      capturedAt: Date.now() - 1000,
      commentNo: '2',
      text: 'hi',
      avatarObserved: true
    });
    profile['4046119'] = { nickname: '自分プロフィール名', updatedAt: Date.now() };
  }
  const sw = await extensionServiceWorker(context);
  await sw.evaluate(
    async ({ rows: r, commentsKey: ck, profile: prof, watchUrl }) => {
      await chrome.storage.local.set({
        [ck]: r,
        nls_user_comment_profile_v1: prof,
        nls_recording_enabled: true,
        nls_last_watch_url: watchUrl
      });
    },
    { rows, commentsKey, profile, watchUrl: MOCK_WATCH }
  );
}

test.describe('応援レーン: プロファイル表示名（stamp / nicolive 退行ガード）', () => {
  test.afterEach(async ({ context }) => {
    await clearLaneAndProfileFixture(context);
  });

  test('6292820 は stamp_applause ではなく Chiharu が名前行に出る', async ({ context }) => {
    const extensionId = await extensionIdFromContext(context);
    await seedProfileNicknameFixture(context);

    const watch = await context.newPage();
    await watch.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await focusMockWatchThenReloadPopup(watch, popup);
    await dismissExtensionUsageTermsGate(popup);
    await openNlPopupSettings(popup);

    const supportVisualDetails = popup.locator('#supportVisualDetails');
    if (!(await supportVisualDetails.evaluate((el) => el.open))) {
      await popup.locator('#supportVisualDetailsSummary').click();
    }
    await expect(supportVisualDetails).toHaveJSProperty('open', true);

    const nameCells = popup.locator('.nl-story-userlane-meta__name');
    await expect(nameCells.filter({ hasText: 'Chiharu' }).first()).toBeVisible({
      timeout: 20_000
    });
    await expect(popup.getByText('stamp_applause')).toHaveCount(0);
  });

  test('自分用 ID でも nicolive 内部よりプロファイル名が出る', async ({ context }) => {
    const extensionId = await extensionIdFromContext(context);
    await seedProfileNicknameFixture(context, { includeSelf: true });

    const watch = await context.newPage();
    await watch.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await focusMockWatchThenReloadPopup(watch, popup);
    await dismissExtensionUsageTermsGate(popup);
    await openNlPopupSettings(popup);

    const supportVisualDetails = popup.locator('#supportVisualDetails');
    if (!(await supportVisualDetails.evaluate((el) => el.open))) {
      await popup.locator('#supportVisualDetailsSummary').click();
    }
    await expect(supportVisualDetails).toHaveJSProperty('open', true);

    await expect(
      popup.locator('.nl-story-userlane-meta__name').filter({ hasText: '自分プロフィール名' }).first()
    ).toBeVisible({ timeout: 20_000 });
    await expect(popup.getByText('nicolive_audition_lightgreen')).toHaveCount(0);
  });
});
