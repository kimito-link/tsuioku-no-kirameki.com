/**
 * レイヤ依存方向の契約テスト。
 *
 * docs/lane-architecture-redesign.md §2.1 に定めた依存方向を静的に検証する:
 *
 *   shared/   ← どこからでも import 可（依存先は他の shared/ のみ）
 *   domain/   ← shared/ のみ import 可
 *   data/     ← domain/ + shared/ のみ import 可
 *   ui/       ← data/ + domain/ + shared/ のみ import 可
 *   extension/ ← 上記全部を import 可
 *
 * **鉄則: 下層は上層を知らない。** たとえば domain/ は ui/ を import してはいけない。
 *
 * Phase 0 時点では src/shared, src/domain, src/data, src/ui のいずれもまだ空なので
 * この contract は「空でも落ちない」形で書いている。Phase 1 以降で該当ディレクトリに
 * ファイルが入り始めた時点で自動的に検証が効く。
 *
 * 将来の import 逸脱（例: ui/views/StoryUserLane/LinkColumn.js が domain/ を飛ばして
 * data/ の実装詳細を直接触る）が混入したら、ここで静的に落ちるようにする余地がある。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');

/**
 * 指定ディレクトリを再帰走査して .js ファイルの相対パスを返す。
 * fs.globSync を使わず readdirSync({ recursive: true }) で代替（stable API）。
 *
 * @param {string} relDir リポジトリルートからの相対パス（例: 'src/shared'）
 * @returns {string[]} relDir 起点の相対パス配列（リポジトリルート起点ではない）
 */
function listJsFilesRecursive(relDir) {
  const abs = resolve(REPO_ROOT, relDir);
  try {
    statSync(abs);
  } catch {
    return [];
  }
  /** @type {string[]} */
  const entries = readdirSync(abs, { recursive: true, withFileTypes: true });
  /** @type {string[]} */
  const out = [];
  for (const d of entries) {
    if (!d.isFile()) continue;
    if (!d.name.endsWith('.js')) continue;
    // readdirSync({recursive:true}) では d.parentPath に絶対パスが入る（Node 20.12+）
    const parent = /** @type {any} */ (d).parentPath || /** @type {any} */ (d).path || abs;
    const absFile = resolve(parent, d.name);
    out.push(relative(REPO_ROOT, absFile).replaceAll('\\', '/'));
  }
  return out;
}

/**
 * 1 つの JS ファイルから ES import 元のパス（相対/絶対）を抜き出す。
 * 静的解析の完全性は求めない（AST を使わず正規表現）。
 * 目的は「明らかな逸脱を拾う」ことなので、ある程度の false negative は許容。
 *
 * @param {string} source
 * @returns {string[]}
 */
function extractImportSources(source) {
  /** @type {string[]} */
  const out = [];
  // import ... from 'x'
  const importRe = /import\s+(?:[^'"`]+?from\s+)?['"]([^'"]+)['"]/g;
  // dynamic import('x')
  const dynRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  // export ... from 'x'
  const reexRe = /export\s+[^'"`;]*from\s+['"]([^'"]+)['"]/g;
  for (const re of [importRe, dynRe, reexRe]) {
    let m;
    while ((m = re.exec(source))) out.push(m[1]);
  }
  return out;
}

/**
 * 相対パス import を絶対パス（リポジトリルート起点）に正規化する。
 *
 * @param {string} fromFile 現ファイルのフルパス
 * @param {string} spec     import 先の spec 文字列
 * @returns {string|null}   相対・絶対 import 先（外部パッケージは null）
 */
function resolveImportTarget(fromFile, spec) {
  if (spec.startsWith('.')) {
    return resolve(dirname(fromFile), spec);
  }
  // 絶対パス起点の spec（'src/...' 形式）は Phase 1 以降で発生し得る
  if (spec.startsWith('/') || spec.startsWith('src/')) {
    return resolve(REPO_ROOT, spec.replace(/^\//, ''));
  }
  // 外部 package / node 組み込み
  return null;
}

/**
 * ファイルパスが属するレイヤを返す。
 *
 * @param {string} absPath
 * @returns {'shared'|'domain'|'data'|'ui'|'extension'|'lib'|'other'}
 */
function layerOf(absPath) {
  const norm = absPath.replaceAll('\\', '/');
  if (norm.includes('/src/shared/')) return 'shared';
  if (norm.includes('/src/domain/')) return 'domain';
  if (norm.includes('/src/data/')) return 'data';
  if (norm.includes('/src/ui/')) return 'ui';
  if (norm.includes('/src/extension/')) return 'extension';
  if (norm.includes('/src/lib/')) return 'lib';
  return 'other';
}

/** どのレイヤがどのレイヤを import できるか。 */
const ALLOWED = {
  shared: new Set(['shared', 'other']),
  domain: new Set(['domain', 'shared', 'other']),
  data: new Set(['data', 'domain', 'shared', 'other']),
  ui: new Set(['ui', 'data', 'domain', 'shared', 'other']),
  extension: new Set(['extension', 'ui', 'data', 'domain', 'shared', 'lib', 'other']),
  // lib/ は Phase 1 移行中の transitional なので一時的に許容度を広くしておく。
  // Phase 5 で lib/ を空にすれば、このエントリは不要になる。
  lib: new Set(['lib', 'shared', 'domain', 'data', 'other'])
};

describe('layer-dependency contract', () => {
  it('src/shared, src/domain, src/data, src/ui の各ディレクトリは依存方向を守る', () => {
    const files = [
      ...listJsFilesRecursive('src/shared'),
      ...listJsFilesRecursive('src/domain'),
      ...listJsFilesRecursive('src/data'),
      ...listJsFilesRecursive('src/ui')
    ];
    /** @type {{ file: string, importSpec: string, targetLayer: string, currentLayer: string }[]} */
    const violations = [];
    for (const rel of files) {
      // テストファイル自身は除外（test 内で ui/components を require する等があり得る）
      if (rel.endsWith('.test.js')) continue;
      const abs = resolve(REPO_ROOT, rel);
      const source = readFileSync(abs, 'utf8');
      const current = layerOf(abs);
      for (const spec of extractImportSources(source)) {
        const target = resolveImportTarget(abs, spec);
        if (!target) continue;
        const targetLayer = layerOf(target);
        if (!ALLOWED[current].has(targetLayer)) {
          violations.push({
            file: rel,
            importSpec: spec,
            targetLayer,
            currentLayer: current
          });
        }
      }
    }
    if (violations.length > 0) {
      // 可読なメッセージで失敗させる
      const msg = violations
        .map(
          (v) =>
            `  ${v.currentLayer}/ ${v.file} → ${v.targetLayer}/ (import '${v.importSpec}')`
        )
        .join('\n');
      throw new Error(
        `レイヤ依存方向の違反を検出:\n${msg}\n\n依存方向: shared ← domain ← data ← ui ← extension`
      );
    }
    expect(violations).toEqual([]);
  });

  it('src/domain/ は DOM / document / window に触れない（pure であるべき）', () => {
    const files = listJsFilesRecursive('src/domain');
    /** @type {{ file: string, matches: string[] }[]} */
    const leaks = [];
    for (const rel of files) {
      if (rel.endsWith('.test.js')) continue;
      const abs = resolve(REPO_ROOT, rel);
      const source = readFileSync(abs, 'utf8');
      // 明確に DOM/BOM に依存するシンボル
      const matches = [
        ...source.matchAll(
          /\b(document|window|navigator|localStorage|sessionStorage|fetch|XMLHttpRequest|MutationObserver)\b/g
        )
      ]
        .map((m) => m[0])
        .filter((_token) => {
          // コメント内・文字列リテラル内は見逃す（粗い検出でよい）
          return true;
        });
      if (matches.length > 0) leaks.push({ file: rel, matches });
    }
    if (leaks.length > 0) {
      const msg = leaks
        .map((v) => `  ${v.file} → ${v.matches.join(', ')}`)
        .join('\n');
      throw new Error(`domain/ に side-effect が混入:\n${msg}`);
    }
    expect(leaks).toEqual([]);
  });
});
