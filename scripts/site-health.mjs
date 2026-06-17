// site-health.mjs
// 公開ページ(LP/記事/docs)の「内部リンク健全性」を検証する(2026-06-18・COUNCIL bug-proof-map)。
//
// 狙い: リンク切れ・参照先消失を未然に防ぐ「Web健全性MAP」。repo-tree-map.mjs の姉妹で、
//   git 追跡の公開HTML/MD を静的解析し、相対内部リンクの参照先がディスクに実在するか照合する。
//   外部リンク(http/https)は叩かない=ネットワーク非依存・プライバシー/CWS/オフライン安全・依存ゼロ。
//
// 純ロジックは src/lib/siteLinkHealth.js(test 付き)。ここは I/O(git ls-files・読み込み・出力)だけ。
//
// 使い方:
//   node scripts/site-health.mjs          → docs/site-health.md を生成(+リンク切れがあれば警告)
//   node scripts/site-health.mjs --check  → 生成物が最新でない or リンク切れがあれば exit 1
//
// 第1コミット時点では verify:cc には挿さない(手動確認=挙動不変)。第2で組み込む。

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { findBrokenInternalLinks, findMetaUrlMismatches } from '../src/lib/siteLinkHealth.js';

const ROOT = resolve(process.cwd());
const OUT_MD = join(ROOT, 'docs', 'site-health.md');

/** 検証対象 = 公開ページ。git 追跡の html/md のうち、配布LP・記事・docs に限る(src/ のコードや node_modules は対象外)。 */
const TARGET_GLOBS = [
  /^tsuioku-no-kirameki\/.*\.html$/,
  /^docs\/.*\.html$/,
  /^docs\/.*\.md$/,
  /^council\/.*\.md$/
];

function trackedFiles() {
  const out = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

/** @param {string[]} all @returns {{ path: string, text: string }[]} */
function loadTargets(all) {
  const targets = all.filter((p) => TARGET_GLOBS.some((re) => re.test(p)));
  const files = [];
  for (const p of targets) {
    try {
      files.push({ path: p, text: readFileSync(join(ROOT, p), 'utf8') });
    } catch {
      // 読めないファイルはスキップ(バイナリ等)
    }
  }
  return files;
}

function render(files, broken, mismatches) {
  const lines = [];
  lines.push('# サイト健全性チェック（自動生成）');
  lines.push('');
  lines.push('> `scripts/site-health.mjs` が git 追跡の公開ページ(LP/記事/docs/council)を静的解析。**手で編集しない**。');
  lines.push('> 検証: ①**相対内部リンク(.html/.md)の参照先がディスクに実在するか** ②**canonical/og:url が自ファイル名と一致するか**。');
  lines.push('> 外部リンクは叩かない(依存/プライバシー/速度)。再生成: `npm run site-health` ／ 検証のみ: `npm run site-health:check`(問題で exit 1)。');
  lines.push('');
  lines.push(`検証対象: ${files.length} ファイル`);
  lines.push('');
  // ① 内部リンク
  if (!broken.length) {
    lines.push('## ✅ 内部リンク健全性: 問題なし');
    lines.push('');
    lines.push('相対内部リンクの参照先はすべて実在します。');
    lines.push('');
  } else {
    lines.push(`## 🔴 リンク切れ ${broken.length} 件`);
    lines.push('');
    lines.push('参照元 → リンク(解決先) の順。リネーム/削除したファイルへのリンクが残っている可能性。');
    lines.push('');
    for (const b of broken) {
      lines.push(`- \`${b.from}\` → \`${b.link}\`（解決先 \`${b.resolved}\` が無い）`);
    }
    lines.push('');
  }
  // ② canonical / og:url
  if (!mismatches.length) {
    lines.push('## ✅ canonical / og:url: 自ファイル名と一致');
    lines.push('');
  } else {
    lines.push(`## 🔴 canonical/og:url の取り違え ${mismatches.length} 件`);
    lines.push('');
    lines.push('コピペで作った記事の URL が前記事のまま等。');
    lines.push('');
    for (const m of mismatches) {
      lines.push(`- \`${m.from}\` の ${m.kind} が \`${m.urlBasename}\`（自ファイルは \`${m.fileBasename}\`）`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

const isCheck = process.argv.includes('--check');
const all = trackedFiles();
const trackedSet = new Set(all);
const files = loadTargets(all);
// exists は「git 追跡 or ディスク実在」で判定(新規作成直後の未追跡ファイルも実在扱い)
const exists = (repoPath) => trackedSet.has(repoPath) || existsSync(join(ROOT, repoPath));
const broken = findBrokenInternalLinks(files, exists);
const mismatches = findMetaUrlMismatches(files);
const md = render(files, broken, mismatches);

if (isCheck) {
  let fail = false;
  const cur = existsSync(OUT_MD) ? readFileSync(OUT_MD, 'utf8') : '';
  if (cur !== md) {
    fail = true;
    console.error(`[site-health] drift: ${OUT_MD} が最新ではありません。\`npm run site-health\` を実行してコミットしてください。`);
  }
  for (const b of broken) {
    fail = true;
    console.error(`[site-health] リンク切れ: ${b.from} → ${b.link}(解決先 ${b.resolved} が無い)`);
  }
  for (const m of mismatches) {
    fail = true;
    console.error(`[site-health] ${m.kind} 取り違え: ${m.from} が ${m.urlBasename}(自ファイルは ${m.fileBasename})`);
  }
  if (fail) process.exit(1);
  console.log(`[site-health] OK(対象 ${files.length} ファイル・リンク切れ 0・URL取り違え 0)。`);
} else {
  mkdirSync(join(ROOT, 'docs'), { recursive: true });
  writeFileSync(OUT_MD, md, 'utf8');
  console.log(`[site-health] wrote ${OUT_MD}(対象 ${files.length}・リンク切れ ${broken.length}・URL取り違え ${mismatches.length})`);
  for (const b of broken) console.warn(`[site-health] リンク切れ: ${b.from} → ${b.link}`);
  for (const m of mismatches) console.warn(`[site-health] ${m.kind} 取り違え: ${m.from} が ${m.urlBasename}`);
}
