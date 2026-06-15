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
const agentsDir = path.join(dir, 'agents');
const TOOL_MARKUP_LINE_RE =
  /^\s*<\/?(?:content|invoke|parameter|tool_use|function_calls?)\b[^>]*>\s*$/gim;

function repairAgentDefinitions() {
  if (!fs.existsSync(agentsDir)) return;
  for (const entry of fs.readdirSync(agentsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const agentPath = path.join(agentsDir, entry.name);
    const current = fs.readFileSync(agentPath, 'utf8');
    const repaired = current
      .replace(TOOL_MARKUP_LINE_RE, '')
      .replace(/\r?\n{3,}$/g, '\n');
    if (repaired !== current) {
      fs.writeFileSync(agentPath, repaired, 'utf8');
      console.log('Removed invalid tool markup:', agentPath);
    }
  }
}

if (!fs.existsSync(example)) {
  console.error('missing .claude/settings.json.example');
  process.exit(1);
}

fs.mkdirSync(dir, { recursive: true });
repairAgentDefinitions();
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
