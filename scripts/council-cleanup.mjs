#!/usr/bin/env node
/**
 * council-cleanup.mjs — 会議ハーネス(meeting.mjs)の後始末。
 *
 * 背景（2026-06-22 実機で発生）: 会議を何度も回した後、Ollama のランナー `run.exe` が
 * 正常終了に失敗してゾンビ化し、CPU を1時間半（積算6476秒）掴みっぱなしで PC が固まった。
 * モデルのアンロードだけでは消えず、プロセスを直接 kill する必要があった。
 *
 * このスクリプトの仕事（安全第一）:
 *   1. Ollama にロード中のモデルを keep_alive:0 で全アンロード（VRAM 解放）。
 *   2. ゾンビ化しやすい `run.exe` / `llama-server.exe` が居残っていたら停止。
 *      ただし「会議が今まさに動いている」最中に殺すと事故るので、実行中の
 *      meeting.mjs(node) を検出したら既定では中止（--force で無視できる）。
 *
 * 絶対に触らないもの:
 *   - `ollama.exe` / `ollama app.exe` 本体（サーバー）。落とすと次回 ollama が起動しない。
 *   - MCP サーバー等の他の node プロセス（server-memory / server-filesystem 等）。
 *     → kill 対象は run.exe / llama-server.exe の2名に限定。node は一切 kill しない。
 *
 * 使い方:
 *   node scripts/council-cleanup.mjs           … 通常（会議中なら中止）
 *   node scripts/council-cleanup.mjs --force    … 会議中でも強制掃除
 *   node scripts/council-cleanup.mjs --dry-run  … 何もせず、対象だけ表示
 *
 * Windows 専用（tasklist / taskkill を使う）。
 */
import { execFileSync } from 'node:child_process';
import { unlinkSync } from 'node:fs';

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const DRY = argv.includes('--dry-run') || argv.includes('--dry');

let OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
if (!/^https?:\/\//.test(OLLAMA)) OLLAMA = 'http://' + OLLAMA;
OLLAMA = OLLAMA.replace('0.0.0.0', '127.0.0.1');

// kill 対象はこの2名だけ。ollama 本体や node(MCP等) は絶対に含めない。
const ZOMBIE_NAMES = ['run.exe', 'llama-server.exe'];

/** tasklist を CSV で取り、{name, pid} の配列にする。 */
function listProcesses() {
  let out = '';
  try {
    out = execFileSync('tasklist', ['/fo', 'csv', '/nh'], { encoding: 'utf8' });
  } catch (e) {
    console.error('tasklist 取得に失敗:', e.message);
    return [];
  }
  return out.split(/\r?\n/).filter(Boolean).map((line) => {
    // "name.exe","pid","session","#","mem" の CSV。素朴にダブルクォート区切りで拾う。
    const cols = line.split('","').map((s) => s.replace(/^"|"$/g, ''));
    return { name: (cols[0] || '').trim(), pid: Number(cols[1]) };
  }).filter((p) => p.name && Number.isFinite(p.pid));
}

// この分数を超えて走り続ける meeting.mjs は「ゾンビ」とみなして掃除対象にする。
const MEETING_STALE_MIN = Number(process.env.COUNCIL_MEETING_STALE_MIN) || 20;

/**
 * meeting.mjs を走らせている node を {pid, ageMin} の配列で返す。
 * CreationDate から経過分を出し、新鮮な会議（=実行中）とゾンビ（=長時間居残り）を区別する。
 */
function meetingProcs() {
  try {
    const ps =
      `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ` +
      `Where-Object { $_.CommandLine -like '*meeting.mjs*' } | ` +
      `ForEach-Object { '{0},{1}' -f $_.ProcessId, [math]::Round(((Get-Date)-$_.CreationDate).TotalMinutes,1) }`;
    const out = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
    return out.split(/\r?\n/).filter(Boolean).map((line) => {
      const [pid, age] = line.split(',');
      return { pid: Number(pid), ageMin: Number(age) };
    }).filter((p) => Number.isFinite(p.pid));
  } catch {
    return []; // 判定不能なら空（掃除を妨げない）
  }
}

/** 古い council-q*.txt（多重起動の痕跡）を Temp から掃除。 */
function cleanTempQuestions() {
  try {
    const dir = process.env.TEMP || process.env.TMP || '';
    if (!dir) return;
    const ps = `Get-ChildItem -Path (Join-Path $env:TEMP 'council-q*.txt') -ErrorAction SilentlyContinue | ` +
      `ForEach-Object { $_.FullName }`;
    const out = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
    const files = out.split(/\r?\n/).filter(Boolean);
    if (!files.length) { console.log('  古い council-q*.txt: なし'); return; }
    for (const f of files) {
      if (DRY) { console.log(`  [dry] 削除対象: ${f}`); continue; }
      try { unlinkSync(f.trim()); } catch { /* 無視 */ }
    }
    if (!DRY) console.log(`  council-q*.txt を ${files.length}件 削除`);
  } catch { /* 無視 */ }
}

/** Ollama にロード中のモデルを全アンロード。 */
async function unloadModels() {
  let ps;
  try {
    const r = await fetch(`${OLLAMA}/api/ps`, { signal: AbortSignal.timeout(5000) });
    ps = await r.json();
  } catch (e) {
    console.log('  Ollama 応答なし（既に停止？）:', String(e.message || e).slice(0, 80));
    return;
  }
  const models = ps?.models || [];
  if (!models.length) { console.log('  ロード中モデル: なし'); return; }
  for (const m of models) {
    const vram = (m.size_vram / 1e9).toFixed(1);
    if (DRY) { console.log(`  [dry] アンロード対象: ${m.name} (VRAM ${vram}GB)`); continue; }
    try {
      await fetch(`${OLLAMA}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: m.name, keep_alive: 0, prompt: '' }),
        signal: AbortSignal.timeout(15000),
      });
      console.log(`  アンロード: ${m.name} (VRAM ${vram}GB 解放)`);
    } catch (e) {
      console.log(`  アンロード失敗: ${m.name}: ${String(e.message || e).slice(0, 60)}`);
    }
  }
}

/** ゾンビ run.exe / llama-server.exe を停止。 */
function killZombies() {
  // モデルのアンロードで ollama が llama-server を先に畳むことがある → 直前に取り直して
  // 「もう消えている」PID を kill しに行かない（taskkill の "見つかりません" を避ける）。
  const procs = listProcesses().filter((p) => ZOMBIE_NAMES.includes(p.name.toLowerCase()));
  if (!procs.length) { console.log('  ゾンビ(run.exe/llama-server.exe): なし（既に解放済み）'); return; }
  for (const p of procs) {
    if (DRY) { console.log(`  [dry] 停止対象: ${p.name} PID=${p.pid}`); continue; }
    try {
      // taskkill の出力(SJIS)が文字化けするので捨て、終了コードだけ見る。
      execFileSync('taskkill', ['/PID', String(p.pid), '/F', '/T'], { stdio: 'ignore' });
      console.log(`  停止: ${p.name} PID=${p.pid} ✅`);
    } catch (e) {
      // 終了コード128 = プロセスが既に無い＝目的は達成済み（アンロードで自然終了した）。
      if (e.status === 128) {
        console.log(`  既に終了済み: ${p.name} PID=${p.pid}（アンロードで自然消滅）`);
      } else {
        console.log(`  停止失敗: ${p.name} PID=${p.pid}（status=${e.status}）`);
      }
    }
  }
}

/** 走りっぱなしの meeting.mjs を扱う。新鮮なら守る、ゾンビ(>STALE分)は kill。 */
function handleMeetingProcs() {
  const procs = meetingProcs();
  if (!procs.length) { console.log('  実行中の meeting.mjs: なし'); return true; }
  const fresh = procs.filter((p) => p.ageMin < MEETING_STALE_MIN);
  const stale = procs.filter((p) => p.ageMin >= MEETING_STALE_MIN);

  // 新鮮な会議が居る → --force でなければ中止（途中の会議を守る）。
  if (fresh.length && !FORCE) {
    for (const p of fresh) console.error(`  ⚠ 会議が実行中: PID=${p.pid}（${p.ageMin}分経過・新鮮）`);
    console.error('  会議の途中です。終了を待つか、本当に止めてよいなら --force を付けてください。');
    return false;
  }
  // ゾンビ（長時間居残り）または --force → 停止。
  for (const p of [...stale, ...(FORCE ? fresh : [])]) {
    const why = p.ageMin >= MEETING_STALE_MIN ? `${p.ageMin}分・ゾンビ` : `${p.ageMin}分・--force`;
    if (DRY) { console.log(`  [dry] meeting.mjs 停止対象: PID=${p.pid}（${why}）`); continue; }
    try {
      execFileSync('taskkill', ['/PID', String(p.pid), '/F', '/T'], { stdio: 'ignore' });
      console.log(`  停止: meeting.mjs PID=${p.pid}（${why}）✅`);
    } catch (e) {
      if (e.status === 128) console.log(`  既に終了済み: meeting.mjs PID=${p.pid}`);
      else console.log(`  停止失敗: meeting.mjs PID=${p.pid}（status=${e.status}）`);
    }
  }
  return true;
}

// ── メイン ──────────────────────────────────────────────────────────────
console.log('=== 会議ハーネス後始末 ' + (DRY ? '(dry-run)' : '') + ' ===');

console.log('\n[1/4] 走りっぱなしの meeting.mjs の確認');
if (!handleMeetingProcs()) process.exit(2); // 新鮮な会議が居て --force 無し → 中止

console.log('\n[2/4] Ollama モデルのアンロード');
await unloadModels();

console.log('\n[3/4] ゾンビプロセスの停止（run.exe / llama-server.exe のみ）');
killZombies();

console.log('\n[4/4] 古い council-q*.txt（多重起動の痕跡）の掃除');
cleanTempQuestions();

console.log('\n完了。ollama 本体・MCP の node には触れていません。');
