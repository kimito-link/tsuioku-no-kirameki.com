/**
 * LP（file:// のみ）向け Playwright 設定。
 * モック watch 用の :3456 webServer を立てないため、E2E_NO_WEBSERVER と同等でタイムアウトしにくい。
 *
 * 実行: npx playwright test --config=playwright.lp.config.js
 */
import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: path.join(root, 'tests/e2e'),
  testMatch: '**/lp-preview.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    // CI ではヘッドレス。ローカルではブラウザ表示（レイアウト確認しやすい）。
    headless: process.env.CI === 'true' || process.env.PW_HEADLESS === '1',
    trace: 'on-first-retry'
  }
});
