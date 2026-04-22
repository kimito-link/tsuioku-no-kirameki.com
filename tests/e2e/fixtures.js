import { test as base, chromium, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../../extension');

export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture API
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });
    try {
      await use(context);
    } finally {
      await context.close();
    }
  }
});

/*
 * 0.1.6 以降、視聴ページの自動表示は opt-in（既定 OFF）に変更された
 * （`nls_inline_panel_autoshow_enabled` / 変更コミット 8fc59ce 参照）。
 * 既定 OFF のままだと「ツールバーを押す前はパネルが出ない」挙動になり、
 * 既存 E2E の大多数（inline-panel-align / extension-interaction のモック watch 経由）が
 * そもそも #nls-inline-popup-host を得られなくなる。
 *
 * E2E では「autoshow を ON にしたユーザー」を前提にしたいので、
 * 必要なスペックが呼び出す共通ヘルパとして用意する。
 * （本番既定を OFF に保ったまま、テスト側だけで opt-in する）
 */
const KEY_INLINE_PANEL_AUTOSHOW = 'nls_inline_panel_autoshow_enabled';

/**
 * 拡張の service worker 経由で autoshow フラグを true に書き込む。
 * service worker が起動するまで最大 60 秒待つ（persistentContext 起動直後対策）。
 * @param {import('@playwright/test').BrowserContext} context
 */
export async function enableInlinePanelAutoshow(context) {
  const pickExt = () =>
    context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
  const deadline = Date.now() + 60_000;
  let sw = pickExt();
  while (!sw && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    sw = pickExt();
  }
  if (!sw) throw new Error('extension service worker not found');
  await sw.evaluate(async (key) => {
    await chrome.storage.local.set({ [key]: true });
  }, KEY_INLINE_PANEL_AUTOSHOW);
}

/**
 * 利用条件ゲート廃止後も、JS で data 属性が付くまで短く待つ（E2E 安定用）
 * @param {import('@playwright/test').Page | import('@playwright/test').FrameLocator} popup
 */
export async function dismissExtensionUsageTermsGate(popup) {
  await expect(popup.locator('html')).toHaveAttribute('data-nl-usage-terms-ack', '1', {
    timeout: 15_000
  });
}

/**
 * 記録 ON/OFF などが `#nlPopupSettings` 内にある場合に、折りたたみを開く。
 * @param {import('@playwright/test').Page | import('@playwright/test').FrameLocator} pageOrFrame
 */
export async function openNlPopupSettings(pageOrFrame) {
  const details = pageOrFrame.locator('#nlPopupSettings');
  await expect(details).toBeAttached();
  if (!(await details.evaluate((el) => el.open))) {
    await details.locator('summary').click();
  }
  await expect(details).toHaveJSProperty('open', true);
}

export { expect };
