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
  ['tree-map', 'tree-map:check'],
  ['site-health', 'site-health:check'],
  ['feature-map', 'feature-map:check'],
  ['verify:bump', 'verify:bump']
];

let ok = true;
for (const [name, script] of steps) {
  if (!runNpmScript(name, script)) {
    ok = false;
    break;
  }
}

log(ok ? 'verify:cc OK' : 'verify:cc FAILED — see .artifacts/verify-cc.log');
process.exit(ok ? 0 : 1);
