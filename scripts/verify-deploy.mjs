#!/usr/bin/env node
/**
 * verify-deploy.mjs — 「Chrome に配ったビルドが本当に今の版か」を照合する。
 *
 * ★なぜ要るか(2026-08-13 の実害)
 *   司令塔が反映のとき master(古い版)に戻った【後】に dist をコピーし、
 *   manifest だけ新しく・中身は8月7日という食い違いを作った。
 *   ユーザーの実機は v0.1.1283 / buildId 0807-101955 を読み続け、
 *   その間に出した7版が**一つも届いていなかった**。
 *   ユーザー:「この診断のエリアがまだ１つしかない」＝当然だった。
 *
 * ★manifest の version だけ見ても意味がない(コピー順で簡単にズレる)。
 *   **dist の中身**(buildId と、その版で足した関数名)まで照合する。
 *
 * 使い方: node scripts/verify-deploy.mjs [配布先]
 *   既定の配布先: C:/nicolive-ext
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DEST = process.argv[2] || 'C:/nicolive-ext';
const ROOT = process.cwd();

const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
const problems = [];

// ① version の一致
const srcVer = JSON.parse(read(join(ROOT, 'package.json')) || '{}').version || '';
const dstMani = JSON.parse(read(join(DEST, 'manifest.json')) || '{}');
const dstVer = dstMani.version || '';
if (!srcVer || !dstVer) problems.push(`version を読めない (src=${srcVer} dst=${dstVer})`);
else if (srcVer !== dstVer) problems.push(`version 不一致: リポ ${srcVer} ≠ 配布先 ${dstVer}`);

// ② ★buildId の一致(これが本体。manifest だけ合っていても中身が古いことがある)
const pickBuildId = (s) => (s.match(/\b\d{4}-\d{6}\b/) || [])[0] || '';
const srcBuild = pickBuildId(read(join(ROOT, 'extension/dist/popup.js')));
const dstBuild = pickBuildId(read(join(DEST, 'dist/popup.js')));
if (!srcBuild || !dstBuild) problems.push(`buildId を読めない (src=${srcBuild} dst=${dstBuild})`);
else if (srcBuild !== dstBuild) {
  problems.push(`★buildId 不一致: リポ ${srcBuild} ≠ 配布先 ${dstBuild}(古いビルドを配っている)`);
}

// ③ dist が空/極端に小さくないか(コピー失敗の検知)
for (const f of ['dist/popup.js', 'dist/status.js', 'dist/content.js']) {
  const size = read(join(DEST, f)).length;
  if (size < 10000) problems.push(`${f} が小さすぎる(${size} bytes)=コピー失敗の疑い`);
}

if (problems.length) {
  console.error('✖ 反映の照合に失敗しました:');
  for (const p of problems) console.error('  - ' + p);
  console.error('\n対処: 作業ブランチ上で `npm run build` してから dist をコピーし直す');
  process.exit(1);
}
console.log(`✅ 反映OK: v${srcVer} / buildId ${srcBuild} が ${DEST} に届いています`);
