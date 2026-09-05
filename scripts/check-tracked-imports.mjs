// check-tracked-imports.mjs
// 「コミットし忘れた新規ファイルを import している」ことを機械的に検出するリリース工程ガード(2026-07-06)。
//
// 実事故: src/lib/safeStorageLocal.js を `git add` し忘れたまま commit したところ、ローカルの
//   verify:cc / pre-push は「作業ツリー基準」(未追跡でもディスクにあれば esbuild が resolve できる)
//   のため検出できず、Vercel ビルド(=git clone 直後の状態)だけが `Could not resolve` で落ちた
//   (commit d77b8064 で復旧)。これを再発不能にする。
//
// 狙い: esbuild バンドル対象(src/**・app/**・extension/** の .js、dist/ と *.test.js は除く)の
//   相対 import を静的に抽出し、解決先が git 追跡ファイル一覧に存在するかを照合する。
//   git ls-files だけで完結する = git clone 直後の状態を模した判定。依存追加なし。
//
// 純ロジックは src/lib/trackedImports.js(test 付き)。ここは I/O(git ls-files・読み込み・出力)だけ。
// site-health.mjs / feature-map.mjs と同じ自前静的解析の流儀。
//
// 使い方: node scripts/check-tracked-imports.mjs(問題があれば exit 1)

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { findUntrackedImports } from '../src/lib/trackedImports.js';

const ROOT = resolve(process.cwd());

/** git 追跡ファイル一覧(リポジトリ相対・/ 区切り)を返す。 @returns {string[]} */
function trackedFiles() {
  const out = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

/** esbuild バンドル対象になりうる .js のうちテスト・dist を除いたもの。 @param {string[]} all */
function bundleTargets(all) {
  const isCandidateDir = (p) =>
    p.startsWith('src/') || p.startsWith('app/') || p.startsWith('extension/');
  return all.filter(
    (p) =>
      isCandidateDir(p) &&
      p.endsWith('.js') &&
      !p.endsWith('.test.js') &&
      !p.includes('/dist/')
  );
}

/** @param {string[]} targets @returns {{ path: string, text: string }[]} */
function loadFiles(targets) {
  const files = [];
  for (const p of targets) {
    try {
      files.push({ path: p, text: readFileSync(join(ROOT, p), 'utf8') });
    } catch {
      // 読めないファイルはスキップ(削除直後の索引ズレ等)
    }
  }
  return files;
}

/*
 * ── --selftest: ★毒を食わせ、赤が出ることを確認する ──────────────────────
 *
 * ■ ★なぜ要るか（2026-08-29）
 *   判定ロジック(src/lib/trackedImports.js)には手厚いテストがあるが、
 *   ★この【ゲート本体】が実際に赤(exit 1)を返すかは誰も確かめていなかった。
 *   ＝「純関数は正しいが、ゲートが常に緑を返す」状態を検出できない。
 *   実際このリポでは、別のゲートが★1行も走らないまま exit 0 を返していた
 *   前科がある（isMain 判定が Windows + 日本語パスで必ず false になっていた）。
 *
 * ■ ★ここで確かめること
 *   ① 未追跡ファイルへの import を入れたら【違反として拾う】か（見逃さない）
 *   ② 追跡済みなら拾わない（誤検知しない）
 *   ③ 検査対象が0件のとき、それを「違反0件＝合格」と読ませていないか
 *      ★これが一番危険（何も測っていないのに緑）
 */
if (process.argv.includes('--selftest')) {
  const fails = [];

  // 毒1: 未追跡ファイルへの import → 違反として拾うべき
  {
    const files = [{ path: 'src/a.js', text: "import { x } from './nope.js';\n" }];
    const v = findUntrackedImports(files, new Set(['src/a.js']));
    if (v.length !== 1) fails.push(`★未追跡 import を拾えなかった(得た: ${v.length}件)`);
  }
  // 毒2: 追跡済みなら拾わない（誤検知しない）
  {
    const files = [{ path: 'src/a.js', text: "import { x } from './b.js';\n" }];
    const v = findUntrackedImports(files, new Set(['src/a.js', 'src/b.js']));
    if (v.length !== 0) fails.push(`★追跡済みなのに違反と誤検知した(得た: ${v.length}件)`);
  }
  // 毒3: ★検査対象0件を「違反0件」と同じに扱っていないか
  {
    const v = findUntrackedImports([], new Set());
    if (v.length !== 0) fails.push('★空入力で違反を捏造した');
    // ここでは「0件でも exit 0 になる」ことを問題として明示する。
    // ★実運用では下の本体が files.length を出力するので、0 件なら人が気づける。
    if (bundleTargets([]).length !== 0) fails.push('★空の追跡一覧から対象を捏造した');
  }
  // 毒4: 実リポで対象が1件も無いのはおかしい（検査が空振りしていないか）
  {
    const n = bundleTargets(trackedFiles()).length;
    if (n === 0) fails.push('★実リポで検査対象が0件（検査が空振りしています）');
  }

  if (fails.length > 0) {
    console.error('[check-tracked-imports] ★selftest 失敗（検知が効いていません）:');
    for (const f of fails) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('[check-tracked-imports] selftest OK'
    + '（未追跡を拾う / 追跡済みを誤検知しない / 空入力で捏造しない / 実リポで空振りしない）');
  process.exit(0);
}

const all = trackedFiles();
const trackedSet = new Set(all);
const targets = bundleTargets(all);
const files = loadFiles(targets);
const violations = findUntrackedImports(files, trackedSet);

if (violations.length > 0) {
  console.error(
    `[check-tracked-imports] git 未追跡のファイルへ import している疑いが ${violations.length} 件見つかりました。`
  );
  console.error('[check-tracked-imports] git add し忘れの疑いがあります。以下を確認してください:');
  console.error('');
  for (const v of violations) {
    console.error(`  ${v.from}:${v.line} が '${v.specifier}' を import`);
    console.error(`    → 解決先候補が git 追跡に無い: ${v.candidates.join(' / ')}`);
  }
  console.error('');
  console.error('[check-tracked-imports] 対処: 該当ファイルが新規なら `git add <path>` してから commit してください。');
  console.error('[check-tracked-imports] (ローカルの verify:cc は作業ツリー基準のため、この検査だけが git clone 直後の状態を再現します)');
  process.exit(1);
}

console.log(`[check-tracked-imports] OK(検査対象 ${files.length} ファイル・未追跡 import 0 件)。`);
