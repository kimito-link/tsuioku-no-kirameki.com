#!/usr/bin/env node
/**
 * Claude Code 向け verify ランナー。
 * Windows の Claude ターミナル統合で vitest/tsc がハングして見える事象対策:
 * - 各ステップを Node spawn で逐次実行しログを必ず flush
 * - 失敗時は .artifacts/verify-cc.log に全文を残す
 *
 * 使い方: npm run verify:cc
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const logDir = path.join(ROOT, '.artifacts');
const logFile = path.join(logDir, 'verify-cc.log');

fs.mkdirSync(logDir, { recursive: true });
fs.writeFileSync(logFile, '', 'utf8');

/**
 * @param {string} msg
 */
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(logFile, line, 'utf8');
  process.stdout.write(line);
}

/**
 * @param {string} name
 * @param {string} script
 * @returns {boolean}
 */
function runNpmScript(name, script) {
  log(`STEP ${name} start (${script})`);
  const r = spawnSync('npm', ['run', script], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 32 * 1024 * 1024,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      CI: '1',
      NODE_NO_WARNINGS: '1'
    }
  });
  if (r.stdout) fs.appendFileSync(logFile, r.stdout);
  if (r.stderr) fs.appendFileSync(logFile, r.stderr);
  if (r.status !== 0) {
    log(`STEP ${name} FAILED exit=${r.status ?? 'null'}`);
    if (r.error) log(`STEP ${name} error=${r.error.message}`);
    return false;
  }
  log(`STEP ${name} OK`);
  return true;
}

log('verify:cc start');
const steps = [
  ['test', 'test:cc'],
  ['lint', 'lint'],
  ['typecheck', 'typecheck'],
  ['build', 'build'],
  // ★v0.1.1245: ビルド直後に「秘密が焼き込まれていないか」を検査する。
  //   dist は git 追跡下=push すると公開リポジトリで誰でも読める。実際に
  //   /api/status の書き込み認証キーが GitHub 上に出ていた事故があった。
  ['no-secrets', 'check:no-secrets'],
  ['tracked-imports', 'check:tracked-imports'],
  ['tree-map', 'tree-map:check'],
  ['site-health', 'site-health:check'],
  ['feature-map', 'feature-map:check'],
  // ★v0.1.1465: src/lib が「純粋ロジックの箱」であり続けるか(src/lib/AGENTS.md)
  // ★検知器自身が壊れていないか(毒→赤)。45リポからの収穫
  // ★版ごとの実測値が退化していないか(申請にも使う)
  ['improvement', 'check:improvement'],
  ['improvement-selftest', 'check:improvement:selftest'],
  ['layer-selftest', 'check:layer:selftest'],
  ['layer', 'check:layer'],
  // ★HTML版(docs/layer-map.html)が最新か。手で編集させない
  ['layer-map', 'layer-map:check'],
  ['verify:bump', 'verify:bump']
];

/*
 * ★selftest は package.json から【自動で拾う】（2026-08-29）。
 *
 * ■ なぜ手で並べないか
 *   上の steps は手書きの表なので、新しく selftest を足しても
 *   ★ここに書き忘れれば永久に走らない。
 *   実際 check:tracked-imports:selftest を足した日に、この表には載っていなかった。
 *
 *   同じ型の穴を web-ios-android 側で同じ週に3回踏んでいる:
 *     PAIRS(22件の登録漏れ) / diagnostics の CHECKS / verify-all の手書き表(10件)。
 *   ⟹ ★拾えるものは拾う。人の記憶を仕組みの前提にしない。
 *
 * ■ ★重複は足さない（上に既に書いてあるものは尊重する）
 */
const declared = new Set(steps.map(([, script]) => script));
const pkgScripts = (() => {
  try {
    return JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts || {};
  } catch {
    return {};
  }
})();
const autoSelftests = Object.keys(pkgScripts)
  .filter((k) => k.endsWith(':selftest') && !declared.has(k))
  .sort();
for (const k of autoSelftests) steps.push([k, k]);

// ★1本も拾えないのは「selftest が無い」のではなく【拾えていない】疑い。
if (Object.keys(pkgScripts).filter((k) => k.endsWith(':selftest')).length === 0) {
  log('WARN: selftest を1本も見つけられませんでした(★package.json を読めていない疑い)');
}

let ok = true;
for (const [name, script] of steps) {
  if (!runNpmScript(name, script)) {
    ok = false;
    break;
  }
}

log(ok ? 'verify:cc OK' : 'verify:cc FAILED — see .artifacts/verify-cc.log');
process.exit(ok ? 0 : 1);
