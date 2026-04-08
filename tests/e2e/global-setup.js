/**
 * ローカル（CI 以外）でモック watch 用の静的サーバが未起動のとき、
 * Playwright の webServer 起動より先に serve を立てる。
 *
 * Windows 等で webServer 子プロセスだけが不安定になるケースの回避。
 * CI（CI=true / GITHUB_ACTIONS=true）では何もせず、従来どおり webServer に任せる。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const pidPath = path.join(repoRoot, 'test-results', '.e2e-fixture-serve.pid');
const fixtureUrl = 'http://127.0.0.1:3456/watch/lv888888888/';

async function urlRespondsOk() {
  try {
    const r = await fetch(fixtureUrl, { signal: AbortSignal.timeout(4000) });
    return r.ok;
  } catch {
    return false;
  }
}

function clearStalePidFile() {
  if (!fs.existsSync(pidPath)) return;
  try {
    const raw = fs.readFileSync(pidPath, 'utf8').trim();
    const prev = Number(raw);
    if (Number.isFinite(prev) && prev > 0) {
      try {
        process.kill(prev, 'SIGTERM');
      } catch {
        /* 既に終了 */
      }
    }
  } finally {
    try {
      fs.unlinkSync(pidPath);
    } catch {
      /* ignore */
    }
  }
}

export default async function globalSetup() {
  if (process.env.E2E_NO_WEBSERVER === '1') return;
  if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') return;

  if (await urlRespondsOk()) return;

  clearStalePidFile();

  const serveCliJs = path.join(repoRoot, 'node_modules', 'serve', 'build', 'main.js');
  const fixturesDir = path.join(repoRoot, 'tests', 'e2e', 'fixtures');

  const child = spawn(
    process.execPath,
    [
      serveCliJs,
      '.',
      '-l',
      'tcp://127.0.0.1:3456',
      '--no-port-switching',
      '--no-request-logging'
    ],
    {
      cwd: fixturesDir,
      stdio: 'ignore',
      windowsHide: true
    }
  );

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await urlRespondsOk()) {
      fs.mkdirSync(path.dirname(pidPath), { recursive: true });
      fs.writeFileSync(pidPath, String(child.pid), 'utf8');
      return;
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  try {
    child.kill('SIGTERM');
  } catch {
    /* ignore */
  }
  throw new Error(`E2E globalSetup: fixture server did not become ready: ${fixtureUrl}`);
}
