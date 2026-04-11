import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/**
 * E2E 用静的ルート。相対パスをコマンドに渡すと cwd 次第で 404 になる。
 * Windows では日本語パスをシェル引数に含めると serve が壊れることがあるため、
 * webServer.cwd に絶対パスを渡し、コマンドは `serve .` のみにする。
 */
const e2eFixturesDir = path.join(__dirname, 'tests', 'e2e', 'fixtures');
/** npx 経由だと Windows で子プロセス追跡がずれ serve が即死することがあるため node で CLI を直起動 */
const serveCliJs = path.join(__dirname, 'node_modules', 'serve', 'build', 'main.js');

/**
 * 拡張機能の読み込みは Chromium の永続コンテキストが必要で、多くの環境では headless 非対応。
 * ローカルでの操作確認（ヘッド付き既定）: test:e2e:headed / test:e2e:interaction / test:e2e:smoke / test:e2e:monkey / test:e2e:ui
 * SKIP_E2E=1 は npm スクリプト `scripts/run-e2e.mjs` 側で処理（Playwright 自体は起動しない）。
 *
 * E2E_NO_WEBSERVER=1 … モック watch 用の静的サーバを立てない（chrome-extension:// のみの spec 向け）。
 *
 * ローカルでは tests/e2e/global-setup.js が先に :3456 を用意し、webServer は reuse で拾う（Windows 等の起動不安定対策）。
 */
const e2eNoWebServer = process.env.E2E_NO_WEBSERVER === '1';

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: path.join(__dirname, 'tests', 'e2e', 'global-setup.js'),
  globalTeardown: path.join(__dirname, 'tests', 'e2e', 'global-teardown.js'),
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    // ローカルはヘッド付き（ブラウザが見える）。CI / PW_HEADLESS=1 ではヘッドレス。
    headless: process.env.CI === 'true' || process.env.PW_HEADLESS === '1',
    trace: 'on-first-retry'
  },
  ...(e2eNoWebServer
    ? {}
    : {
        webServer: {
          // 3456 占有時に serve が別ポートへ逃げると、url 待機は古いプロセスへ当たり E2E が空 DOM になる。固定失敗にする。
          command: `node ${JSON.stringify(serveCliJs)} . -l tcp://127.0.0.1:3456 --no-port-switching --no-request-logging`,
          cwd: e2eFixturesDir,
          url: 'http://127.0.0.1:3456/watch/lv888888888/',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          // pipe は環境によって背圧で子が詰まることがある。global-setup が先に起動した場合は再利用のみ。
          stdout: 'ignore',
          stderr: 'ignore'
        }
      })
});
