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
 * 初回表示の利用条件オーバーレイを通過する（既に同意済みなら即 return）
 * @param {import('@playwright/test').Page} popup
 */
export async function dismissExtensionUsageTermsGate(popup) {
  await popup.waitForFunction(
    () =>
      document.documentElement.getAttribute('data-nl-usage-terms-ack') === '1' ||
      (() => {
        const g = document.getElementById('usageTermsGate');
        if (!g) return false;
        return getComputedStyle(g).display !== 'none';
      })(),
    { timeout: 15_000 }
  );
  const acked =
    (await popup
      .locator('html')
      .evaluate((el) => el.getAttribute('data-nl-usage-terms-ack') === '1')) === true;
  if (!acked) {
    await popup.locator('#usageTermsAckCheckbox').check();
    await popup.locator('#usageTermsContinueBtn').click();
    await expect(popup.locator('html')).toHaveAttribute('data-nl-usage-terms-ack', '1', {
      timeout: 8000
    });
  }
}

export { expect };
