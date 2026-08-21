#!/usr/bin/env node
/**
 * audit-gates.mjs — ★**計器を計器で測る**(メタ検査)。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ ★ユーザー指示(2026-08-21)「github から学べるもの全部いれて計器を最強にして」
 *
 * ■ 収穫元(実ファイルで確認済み)
 *   `soushin-suggest.link/scripts/audit-inconclusive.ps1`
 *   ＝ 全プローブを走査し「**exit 2 を出せない**＝『測れなかった』を報告できない
 *      プローブ」を列挙する。
 *
 * ■ ★これ自身は【ゲートにしない】(収穫元と同じ方針)
 *   exit 0 で終わる**レポート**。理由:
 *   ★ゲートにすると「既存53本を全部直すまで出荷できない」になり、
 *     現実的でないので**無効化されて死ぬ**。
 *   ★このリポで死んだ仕掛けは全部「一度に全部直せ」と迫るものだった。
 *   まず**見えるようにする**。直すのは1リリース1本ずつでよい。
 *
 * ■ 何を見るか
 *   1. `--selftest` を持つか … ★毒を入れて赤くなるか自分で確かめられるか
 *   2. 3値の終了コードを持つか … ★「測れなかった」を緑に混ぜていないか
 *   3. 「直し方」を出すか … 読んだ人が直せるか
 *
 *   使い方: node scripts/audit-gates.mjs [--json]
 * ───────────────────────────────────────────────────────────────────────────
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = join(ROOT, 'scripts');
const JSON_OUT = process.argv.includes('--json');

/** ゲート(出荷前に走る検査)らしいファイル名か。 */
function isGate(name) {
  return /^(check|verify)-.*\.mjs$/.test(name) || /-(check|map)\.mjs$/.test(name)
    || /^(feature-map|site-health|repo-tree-map|layer-map-html)\.mjs$/.test(name);
}

/** 実コードだけ(コメント・文字列を除く)。 */
function codeOnly(text) {
  let s = text.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  s = s.replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
  s = s.replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
  s = s.replace(/`(?:[^`\\]|\\.)*`/g, '``');
  return s;
}

const rows = [];
for (const name of readdirSync(SCRIPTS)) {
  if (!name.endsWith('.mjs') || !isGate(name)) continue;
  const p = join(SCRIPTS, name);
  if (!statSync(p).isFile()) continue;
  const raw = readFileSync(p, 'utf8');
  const code = codeOnly(raw);
  rows.push({
    name,
    selftest: /--selftest|SELFTEST/.test(code),
    // ★exit 2 か EXIT.INCONCLUSIVE を出せるか
    threeState: /exit\(\s*2\s*\)|EXIT\.INCONCLUSIVE|computeExitCode/.test(code),
    // ★直し方を出しているか(赤で終わるだけにしない)
    howToFix: /直し方|howToFix|してください/.test(raw)
  });
}
rows.sort((a, b) => a.name.localeCompare(b.name));

const lacksSelftest = rows.filter((r) => !r.selftest);
const lacks3 = rows.filter((r) => !r.threeState);
const lacksFix = rows.filter((r) => !r.howToFix);

if (JSON_OUT) {
  console.log(JSON.stringify({ total: rows.length, rows }, null, 2));
  process.exit(0);
}

console.log(`[audit-gates] ゲート ${rows.length} 本を検査(★これはレポートであってゲートではありません)`);
console.log('');
console.log('  凡例: ✔=あり  ・=なし');
console.log('  ' + 'ファイル'.padEnd(30) + ' selftest  3値exit  直し方');
for (const r of rows) {
  console.log(
    '  ' + r.name.padEnd(30)
    + '   ' + (r.selftest ? '✔' : '・')
    + '        ' + (r.threeState ? '✔' : '・')
    + '       ' + (r.howToFix ? '✔' : '・')
  );
}
console.log('');
console.log(`  ★selftest が無い: ${lacksSelftest.length}/${rows.length} 本`);
console.log('     → 毒を入れても赤くなるか、誰も確かめていません(手で変異テストするしかない)');
console.log(`  ★「測れなかった」を出せない: ${lacks3.length}/${rows.length} 本`);
console.log('     → 走査0件でも緑になります＝守っているつもりで守れていない可能性');
console.log(`  ★直し方を出さない: ${lacksFix.length}/${rows.length} 本`);
console.log('');
console.log('  直し方: scripts/lib/instrument-core.mjs の computeExitCode / runSelfTest を使う。');
console.log('          見本は scripts/check-layer.mjs。1リリース1本ずつでよい。');
console.log('  ★この検査が判定しないこと: 検査の中身が正しいかは見ません。');
console.log('          「自分が壊れたら気づける形か」だけを見ます。');
process.exit(0);
