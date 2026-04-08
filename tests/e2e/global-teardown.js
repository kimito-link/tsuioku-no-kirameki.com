/**
 * global-setup が起動した serve の PID を片付ける（ローカル専用）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const pidPath = path.join(repoRoot, 'test-results', '.e2e-fixture-serve.pid');

export default async function globalTeardown() {
  if (!fs.existsSync(pidPath)) return;
  let pid = 0;
  try {
    const raw = fs.readFileSync(pidPath, 'utf8').trim();
    pid = Number(raw);
  } catch {
    return;
  }
  try {
    fs.unlinkSync(pidPath);
  } catch {
    /* ignore */
  }
  if (!Number.isFinite(pid) || pid <= 0) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    /* 既に終了 */
  }
}
