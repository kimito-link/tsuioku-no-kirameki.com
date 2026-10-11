/**
 * 「修正前」の拡張フォルダを作る(extension/ をコピーし、dist の bundle を git の指定リビジョンのものに差し替える)。
 *
 * 使い方:
 *   node scripts/perf-ab/make-before.mjs [--ref master] [--dst C:/nls-ab/ext_before]
 *   → profile-popup.mjs --ext <dst> で修正前、既定(extension/)で修正後を、同じ配信で続けて測る。
 *
 * ★dst は【短いパス】にする(Windows の 260 文字制限。深い images/ 配下のコピーが失敗する)。
 * ★差し替えるのは dist/popup.js のみ(--files で追加可: 例 --files popup.js,content.js)。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { REPO_ROOT, parseArgs } from './common.mjs';

const args = parseArgs();
const ref = args.ref || 'master';
const dst = path.resolve(args.dst || 'C:/nls-ab/ext_before');
const files = String(args.files || 'popup.js').split(',').map((s) => s.trim()).filter(Boolean);

if (!fs.existsSync(dst)) {
  fs.cpSync(path.join(REPO_ROOT, 'extension'), dst, { recursive: true });
}
for (const f of files) {
  const buf = execFileSync('git', ['show', `${ref}:extension/dist/${f}`], { cwd: REPO_ROOT, maxBuffer: 256 * 1024 * 1024 });
  fs.writeFileSync(path.join(dst, 'dist', f), buf);
  console.log(`dist/${f} ← ${ref} (${(buf.length / 1024).toFixed(0)}KB)`);
}
console.log('before extension:', dst);
