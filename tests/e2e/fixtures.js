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
