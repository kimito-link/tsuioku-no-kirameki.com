#!/usr/bin/env node
/**
 * プロジェクト用 Claude Code 設定を .claude/settings.json に展開する。
 * allow だけの設定だと Bash が黙って止まることがあるため defaultMode を必ず入れる。
 *
 * 使い方: npm run setup:claude
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const dir = path.join(ROOT, '.claude');
const target = path.join(dir, 'settings.json');
const example = path.join(dir, 'settings.json.example');

if (!fs.existsSync(example)) {
  console.error('missing .claude/settings.json.example');
  process.exit(1);
}

fs.mkdirSync(dir, { recursive: true });
const next = fs.readFileSync(example, 'utf8');
if (fs.existsSync(target)) {
  const cur = fs.readFileSync(target, 'utf8');
  if (cur.trim() === next.trim()) {
    console.log('Claude Code settings already up to date:', target);
    process.exit(0);
  }
}
fs.writeFileSync(target, next, 'utf8');
console.log('Wrote Claude Code settings:', target);
console.log('Restart Claude Code session if it was stuck waiting for permissions.');
