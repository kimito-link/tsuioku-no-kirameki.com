/**
 * perf-ab 共通部品: 拡張を読み込んだ Chromium の起動・後片付け・拡張プロセスの CPU/メモリ採取。
 *
 * ★目的: 「重い」を推測せず、同じ配信・同じ手順で【修正前と修正後を続けて】測るための土台
 *   (2026-10-11: これで bestNicknameFromEntries の総当たりを名指しし、前後で稼働率 99.7%→19% を確認した)。
 * ★端末の本物のブラウザ・プロファイル・保存データには一切触れない(一時プロファイルで起動する)。
 * ★Windows 前提(CPU/メモリ採取に PowerShell を使う)。
 */
import { chromium } from 'playwright-core';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** `--key value` 形式の引数を読む。 */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    out[k] = v;
  }
  return out;
}

/**
 * 拡張(extDir)を読み込んだ Chromium を一時プロファイルで起動する。
 * @param {{ extDir?: string, debugPort?: number }} opts
 */
export async function launchWithExtension({ extDir = path.join(REPO_ROOT, 'extension'), debugPort = 0 } = {}) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nls-perf-'));
  const args = [
    `--disable-extensions-except=${extDir}`,
    `--load-extension=${extDir}`,
    '--headless=new',
    '--window-size=1280,900'
  ];
  if (debugPort) args.push(`--remote-debugging-port=${debugPort}`);
  const ctx = await chromium.launchPersistentContext(userDataDir, { headless: false, args });
  const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent('serviceworker', { timeout: 60000 }));
  const extId = new URL(sw.url()).hostname;
  return { ctx, sw, extId, userDataDir };
}

/** 視聴ページ内パネル(autoshow)を有効にする(既定は OFF)。 */
export async function enableAutoshow(sw, on = true) {
  await sw.evaluate(async (v) => {
    await chrome.storage.local.set({ nls_inline_panel_autoshow_enabled: v });
  }, on);
}

/** この実行で起動した Chromium(一時プロファイル名で判別)だけを終了する。 */
export function killTestChromes(userDataDir) {
  const key = path.basename(userDataDir);
  const ps =
    "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | " +
    `Where-Object { $_.CommandLine -like '*${key}*' } | ` +
    'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }';
  try {
    execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'ignore' });
  } catch {
    /* best-effort */
  }
}

/** 終了処理(ctx.close が固まっても進む)。 */
export async function shutdown(ctx, userDataDir) {
  await Promise.race([ctx.close().catch(() => {}), sleep(8000)]);
  killTestChromes(userDataDir);
}

/**
 * この実行の拡張プロセス(--extension-process)の CPU%・メモリを intervalSec 秒間で採取する。
 * @returns {string} 例 "118%/1450MB 3%/60MB"(プロセスごと)
 */
export function sampleExtensionProcessCpu(userDataDir, intervalSec = 5) {
  const key = path.basename(userDataDir);
  const ps =
    "$p = Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | " +
    `Where-Object { $_.CommandLine -like '*${key}*' -and $_.CommandLine -match 'extension-process' }; ` +
    '$a=@{}; foreach($x in $p){ $a[$x.ProcessId]=(Get-Process -Id $x.ProcessId).TotalProcessorTime.TotalSeconds }; ' +
    `Start-Sleep ${intervalSec}; ` +
    "foreach($k in $a.Keys){ $q=Get-Process -Id $k; '{0:N0}%/{1:N0}MB' -f (($q.TotalProcessorTime.TotalSeconds-$a[$k])/" +
    `${intervalSec}*100),($q.WorkingSet64/1MB) }`;
  try {
    return execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim().split(/\r?\n/).join(' ');
  } catch {
    return 'sample-failed';
  }
}

/**
 * V8 の CPU プロファイル(profile)から、自分の時間の上位と、スタック上に居た時間(含む)の上位を集計する。
 * @returns {{ sampledMs: number, idleMs: number, busyPct: number, self: [string, number][], inclusive: [string, number][] }}
 */
export function summarizeProfile(profile, { top = 22 } = {}) {
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const selfByNode = new Map();
  let total = 0;
  profile.samples.forEach((nid, i) => {
    const d = profile.timeDeltas[i] || 0;
    total += d;
    selfByNode.set(nid, (selfByNode.get(nid) || 0) + d);
  });
  const keyOf = (nid) => {
    const cf = nodes.get(nid).callFrame;
    return `${cf.functionName || '(anon)'} ${String(cf.url).replace(/^chrome-extension:\/\/[^/]+\//, '')}:${cf.lineNumber + 1}`;
  };
  const self = new Map();
  const inclusive = new Map();
  for (const [nid, t] of selfByNode) {
    const k = keyOf(nid);
    self.set(k, (self.get(k) || 0) + t);
    const seen = new Set();
    for (let cur = nid; cur; cur = parent.get(cur)) {
      const kk = keyOf(cur);
      if (seen.has(kk)) continue;
      seen.add(kk);
      inclusive.set(kk, (inclusive.get(kk) || 0) + t);
    }
  }
  const idleMs = [...self].filter(([k]) => k.startsWith('(idle)')).reduce((a, [, t]) => a + t, 0) / 1000;
  const sorted = (m, drop) =>
    [...m].filter(([k]) => !drop.test(k)).sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, t]) => [k, t / 1000]);
  return {
    sampledMs: total / 1000,
    idleMs,
    busyPct: total ? Math.round((1 - (idleMs * 1000) / total) * 100) : 0,
    self: sorted(self, /^\(idle\)/),
    inclusive: sorted(inclusive, /^\((root|program|idle|garbage)/)
  };
}
