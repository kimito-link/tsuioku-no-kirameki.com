#!/usr/bin/env node
/**
 * census-watch.mjs — 配置後の「更新→F5→溜まるまで待つ→速報を読む→基準線と比べる」を機械にする(2026-10-20)。
 *
 * これまで: 配置のたびに人が「更新・F5・3分待つ・『おした』」と言い、私が status:live を読んで目で比べていた。
 * いま: 版が実機に届き、census の窓が十分溜まり、コメントが流れるまで自動で待ち、数字だけで判定して終了コードで返す。
 *   人の操作は【拡張の更新ボタンと視聴ページの F5 だけ】(Chrome の仕様で私からは押せない場合。chrome-devtools の
 *   reload_extension が使える環境では私が押せる=CLAUDE.md「反映は司令塔が全部やる」)。
 *
 * 使い方:
 *   npm run census:watch -- --version v0.1.1700 --save v1700                  # 届くのを待って測り、基準線 v1700 に保存
 *   npm run census:watch -- --version v0.1.1701 --vs v1700 --expect nls_comments_*:0.7
 *   npm run census:watch -- --once                                            # 待たず、いまの速報を1回読む
 *   主なオプション: --min-minutes 3(窓の最低長) --timeout-min 15 --interval-sec 20 --expect <キー>:<毎分の上限>(複数可)
 *   --save は条件(速報が新しい・窓が十分・コメントが流れている)を満たした窓でだけ保存する。弱い窓で強制するなら --force-save。
 * 終了コード: 0=合格(期待が無ければ測れた) / 1=期待を破った / 2=測れていない(タイムアウト・取得失敗) / 3=上位3族に無く証明できない
 *
 * 取得は既存の `scripts/status-live.mjs --json` を子プロセスで呼ぶ(.env の NL_STATUS_VIEW_TOKEN。新しい通信路は作らない)。
 * 安全: 読むのは census 行だけ。出力は数字と nls_ キー名のみ(第三者のコメント本文を通さない)。判定の本体は src/lib/censusWatch.js。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aggregateByKey,
  compareToBaseline,
  decideReady,
  evaluateExpect,
  parseCensusReport
} from '../src/lib/censusWatch.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const wantVersion = opt('--version', null);
const minSec = Math.max(10, Number(opt('--min-minutes', '3')) * 60);
const timeoutMs = Math.max(1, Number(opt('--timeout-min', '15'))) * 60_000;
const intervalMs = Math.max(5, Number(opt('--interval-sec', '20'))) * 1000;
const once = args.includes('--once');
const saveName = opt('--save', null);
const vsName = opt('--vs', null);
const expects = [];
args.forEach((a, i) => {
  if (a === '--expect' && args[i + 1]) {
    const [key, max] = args[i + 1].split(':');
    if (key && Number.isFinite(Number(max))) expects.push({ key, maxPerMin: Number(max) });
  }
});
const baselinePath = (name) => join(root, '.artifacts', `census-baseline-${String(name).replace(/[^A-Za-z0-9._-]/g, '_')}.json`);

/** @returns {{ ok: boolean, text?: string, ageSec?: number|null, error?: string }} */
function fetchReport() {
  try {
    const out = execFileSync(process.execPath, [join(root, 'scripts', 'status-live.mjs'), '--json'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 64 * 1024 * 1024
    });
    const at = out.indexOf('{');
    if (at < 0) return { ok: false, error: out.trim().split('\n').slice(-1)[0] || '速報なし' };
    const data = JSON.parse(out.slice(at));
    const gen = Date.parse(String(data.generatedAt || ''));
    return {
      ok: true,
      text: typeof data.statusReport === 'string' ? data.statusReport : '',
      ageSec: Number.isFinite(gen) ? Math.max(0, (Date.now() - gen) / 1000) : null
    };
  } catch (e) {
    return { ok: false, error: `取得失敗: ${e && e.message ? String(e.message).split('\n')[0] : e}` };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
let last = null;
let lastReasons = [];

while (true) {
  const got = fetchReport();
  if (got.ok) {
    const report = parseCensusReport(got.text);
    const d = decideReady(report, { wantVersion, minWindowSec: minSec, reportAgeSec: got.ageSec ?? null });
    last = { report, decision: d };
    lastReasons = d.reasons;
    if (d.ready || once) break;
    console.log(`[${new Date().toLocaleTimeString('ja-JP')}] 待機中: ${d.reasons.join(' / ')}`);
  } else {
    lastReasons = [got.error || '取得失敗'];
    console.log(`[${new Date().toLocaleTimeString('ja-JP')}] 🔴 ${lastReasons[0]}`);
    if (once) break;
  }
  if (Date.now() - t0 >= timeoutMs) break;
  await sleep(intervalMs);
}

if (!last) {
  console.log('🔴 測れていません(速報を取得できなかった)。異常なしの意味ではありません。');
  process.exit(2);
}

const { report, decision } = last;
const agg = aggregateByKey(report.docs, Math.min(minSec, Math.max(0, ...report.docs.map((d) => d.windowSec))));
console.log(`\n── census 判定 ──  版 ${report.version || '不明'} / 書込モード ${report.writeMode} / 取得 ${report.commentRatePerSec ?? '不明'}件/秒`);
if (!decision.ready) console.log(`⚠️ 判定の条件を満たしていません: ${decision.reasons.join(' / ')}`);
console.log('キー別(各文書の最大・毎分): 回数/分 ・ KB/分');
for (const [key, v] of Object.entries(agg).sort((a, b) => b[1].maxKbPerMin - a[1].maxKbPerMin).slice(0, 12)) {
  console.log(`  ${key}  ${v.maxPerMin.toFixed(2)}回/分 ・ ${Math.round(v.maxKbPerMin)}KB/分  (${v.docs}文書)`);
}
console.log('文書別の稼働: ' + report.docs.map((d) => `${d.kind}#${d.id} ${d.windowSec}秒窓 ${d.busyPct ?? '?'}%`).join(' / '));

if (vsName) {
  const p = baselinePath(vsName);
  if (!existsSync(p)) {
    console.log(`⚠️ 基準線 ${vsName} が無い(${p})。先に --save ${vsName} で保存してください。`);
  } else {
    const base = JSON.parse(readFileSync(p, 'utf8'));
    console.log(`\n基準線 ${vsName}(版 ${base.version || '不明'}・取得 ${base.commentRatePerSec ?? '不明'}件/秒)との比較(毎分の回数):`);
    for (const r of compareToBaseline(base.agg || {}, agg)) {
      const pct = r.changePct == null ? '—' : `${r.changePct > 0 ? '+' : ''}${r.changePct.toFixed(0)}%`;
      console.log(`  ${r.key}  ${r.baseline == null ? '—' : r.baseline.toFixed(2)} → ${r.now == null ? '(上位3族に無い)' : r.now.toFixed(2)}  ${pct}`);
    }
    if (base.commentRatePerSec != null && report.commentRatePerSec != null) {
      const ratio = report.commentRatePerSec / Math.max(0.01, base.commentRatePerSec);
      if (ratio < 0.5 || ratio > 2) {
        console.log(`⚠️ コメント流量が基準線と大きく違う(×${ratio.toFixed(1)})。回数の増減は流量差が混ざる=結論に使わない。`);
      }
    }
  }
}

if (saveName) {
  const p = baselinePath(saveName);
  // 条件未達(速報が古い・窓が短い・コメントが流れていない)の窓は、基準線にしない(後で比較に使い誤るため)。--force-save で強制。
  if (!decision.ready && !args.includes('--force-save')) {
    console.log(`\n⚠️ 条件未達のため基準線 ${saveName} は保存しませんでした(弱い基準線を作らない)。強制するなら --force-save`);
  } else {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(
      p,
      JSON.stringify({ savedAt: new Date().toISOString(), version: report.version, commentRatePerSec: report.commentRatePerSec, ready: decision.ready, agg }, null, 2) + '\n'
    );
    console.log(`\n💾 基準線 ${saveName} を保存しました: ${p}${decision.ready ? '' : '  ※--force-save: 条件未達の窓で保存(基準線として弱い)'}`);
  }
}

let code = 0;
for (const e of expects) {
  const v = evaluateExpect(agg, e);
  const mark = v.verdict === 'pass' ? '✅' : v.verdict === 'fail' ? '🔴' : '❔';
  console.log(`${mark} 期待 ${e.key} ≤ ${e.maxPerMin}回/分: ${v.note}`);
  if (v.verdict === 'fail') code = Math.max(code, 1);
  if (v.verdict === 'absent-from-top3' && code === 0) code = 3;
}
if (!decision.ready && !once) code = 2;
if (!decision.ready && code === 0) code = 2;
process.exit(code);
