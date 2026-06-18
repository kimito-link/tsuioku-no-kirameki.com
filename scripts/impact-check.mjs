// impact-check.mjs
// 星野ロミ式「規律を自動ゲートに」(2026-06-18・COUNCIL の次の一手)。
//
// 狙い: AGENTS.md §10 の【共有 lib を変える前に impact-map を見る】という"人の規律"を、
//   diff から自動で発火する"ゲート"に変える。変更したファイルのうち影響大(複数機能に波及)の
//   ものを検出し、「この変更は N 機能に波及する→これらの動作確認を」と必ず目に入る形で出す。
//
// 設計(星野メソッド: 摩擦ゼロ・行動誘発):
//   - ブロックしない(規律を守れたか=機械判定できない項目で hard fail は摩擦)。既定は【警告のみ・exit 0】。
//   - `--strict` のときだけ「影響大ファイルを変更した」場合に exit 1(CI で明示ゲートにしたいとき用)。
//   - 入力 = git diff の変更ファイル(既定 base = origin/master、無ければ HEAD)。
//   - データ = docs/feature-map/impact-map.json(feature-map が生成・機械可読)。markdown を parse しない。
//   - 新規データ取得ゼロ・依存ゼロ。
//
// 使い方:
//   node scripts/impact-check.mjs                 # 作業ツリー(staged+unstaged)の変更を対象・警告のみ
//   node scripts/impact-check.mjs --base <ref>    # 比較基準を指定
//   node scripts/impact-check.mjs --strict        # 影響大の変更があれば exit 1

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const IMPACT_JSON = join(ROOT, 'docs', 'feature-map', 'impact-map.json');
const HIGH_IMPACT_THRESHOLD = 3; // 3 機能以上に波及 = 影響大

const argv = process.argv.slice(2);
const strict = argv.includes('--strict');
const baseIdx = argv.indexOf('--base');
const baseArg = baseIdx >= 0 ? argv[baseIdx + 1] : null;

/** git で安全にコマンド実行(失敗時 null)。 */
function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
  } catch {
    return null;
  }
}

/** 比較基準を決める: --base 指定 → origin/master → なければ作業ツリー(HEAD)。 */
function resolveBase() {
  if (baseArg) return baseArg;
  if (git('rev-parse --verify origin/master') != null) return 'origin/master';
  return null; // null = 作業ツリーの変更(staged + unstaged)を見る
}

/** 変更された src/app ファイル一覧。 */
function changedFiles(base) {
  let out = '';
  if (base) {
    out = git(`diff --name-only ${base}...HEAD`) || '';
    // base...HEAD に加え、未コミットの作業ツリー変更も拾う
    const wt = git('diff --name-only HEAD') || '';
    out = [out, wt].filter(Boolean).join('\n');
  } else {
    const staged = git('diff --name-only --cached') || '';
    const unstaged = git('diff --name-only') || '';
    out = [staged, unstaged].filter(Boolean).join('\n');
  }
  return [...new Set(out.split('\n').map((s) => s.trim()).filter(Boolean))]
    .filter((p) => p.startsWith('src/') || p.startsWith('app/'))
    .filter((p) => !/\.test\.js$/.test(p));
}

/** impact-map.json を読む(無ければ案内して終了)。 */
function loadImpact() {
  if (!existsSync(IMPACT_JSON)) {
    console.warn('[impact-check] docs/feature-map/impact-map.json が無い。`npm run feature-map` で生成してください。');
    return null;
  }
  try {
    const json = JSON.parse(readFileSync(IMPACT_JSON, 'utf8'));
    const map = new Map();
    for (const row of json.files || []) map.set(row.file, row);
    return map;
  } catch {
    console.warn('[impact-check] impact-map.json の読み込みに失敗。');
    return null;
  }
}

/** 同じ場所の test が存在するか(FYI 表示用・ブロックには使わない)。 */
function hasColocatedTest(file) {
  const base = file.replace(/\.js$/, '');
  return existsSync(join(ROOT, `${base}.test.js`));
}

const base = resolveBase();
const files = changedFiles(base);
const impact = loadImpact();

if (!impact) process.exit(0);
if (!files.length) {
  console.log('[impact-check] 変更された src/app ファイルはありません。');
  process.exit(0);
}

const highImpact = [];
for (const f of files) {
  const row = impact.get(f);
  if (row && row.featureCount >= HIGH_IMPACT_THRESHOLD) highImpact.push(row);
}
highImpact.sort((a, b) => b.featureCount - a.featureCount);

if (!highImpact.length) {
  console.log(`[impact-check] 変更 ${files.length} ファイル中、影響大(${HIGH_IMPACT_THRESHOLD}機能以上波及)はありません。`);
  process.exit(0);
}

console.log('');
console.log('⚠️  影響範囲ゲート: 複数機能に波及する共有ファイルを変更しています。');
console.log('   各機能の動作確認を(impact-map.md / status.html の対処カードで確認できます)。');
console.log('');
for (const r of highImpact) {
  const test = hasColocatedTest(r.file) ? 'test あり' : 'test 無し(entry/DOM配線なら可・純ロジックなら追加推奨)';
  console.log(`  ● ${r.file} → ${r.featureCount} 機能に波及 [${test}]`);
  console.log(`      波及先: ${(r.labels || r.features).join(' / ')}`);
}
console.log('');

if (strict) {
  console.error('[impact-check] --strict: 影響大の変更があるため exit 1(各機能の確認後に通す)。');
  process.exit(1);
}
console.log('[impact-check] 警告のみ(ブロックしません)。確認できたら続行してください。');
process.exit(0);
