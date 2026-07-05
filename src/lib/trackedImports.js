// @ts-nocheck — テキスト/パス解析の純ロジック(I/O は呼び出し側)
/**
 * 「コミットし忘れた新規ファイルを import しているソース」を検出する純ロジック(2026-07-06)。
 *
 * 実事故: src/lib/safeStorageLocal.js を `git add` し忘れたまま commit したところ、
 *   ローカルの verify:cc / pre-push は「作業ツリー基準」(未追跡ファイルもディスクにあれば
 *   esbuild が普通に resolve できる)ため検出できず、Vercel ビルドだけが
 *   `Could not resolve "./safeStorageLocal.js"` で落ちた(commit d77b8064 で復旧)。
 *
 * 対策: 「git 追跡ファイルからの相対 import が、解決先も git 追跡されているか」を静的に検査する。
 *   git clone 直後の状態(=本番ビルド環境の実体)を模した判定になる。
 *
 * 純関数だけ置く(fs/git に触らない)。ファイル一覧・本文・追跡集合は呼び出し側が注入する。
 * site-health.mjs / siteLinkHealth.js と同じ自前静的解析の流儀。
 */

/**
 * @typedef {{ specifier: string, line: number, raw: string }} ImportRef
 */

/**
 * 1ファイル分のソーステキストから相対 import の指定子を抽出する。
 * 対象: `import ... from '...'` / `export ... from '...'`(複数行の分割 import 含む) /
 *       動的 `import('...')`。
 * 対象外: bare specifier(node_modules 等・先頭が `./` `../` でないもの)。
 *
 * 実装方針: 本プロジェクトの規約(既存コード全数調査済み)は
 *   - すべての内部 import が相対パスで `.js` を明示している(拡張子省略なし)
 *   - bare specifier(npm パッケージ)は src/app/extension のバンドル対象コードに存在しない
 *   ため、フルパーサは不要。`import`/`export`+`from` の直後に続く最初のクォート文字列、
 *   および `import(...)` の引数を正規表現で拾う簡易実装で誤検知ゼロを狙う。
 *
 * @param {string} text ファイル本文
 * @returns {ImportRef[]}
 */
export function extractRelativeImportSpecifiers(text) {
  const s = String(text || '');
  const out = [];

  /** 指定子を採用するかどうか(相対パスのみ)。 @param {string} spec */
  const isRelative = (spec) => spec.startsWith('./') || spec.startsWith('../');

  /** マッチ位置から行番号(1始まり)を算出する。 @param {number} index */
  const lineAt = (index) => s.slice(0, index).split('\n').length;

  // ① `import ... from '...'` / `export ... from '...'`(複数行可・非 greedy で最初の from まで)
  //    import/export キーワードの後、`from` の直前までを飛ばして quote 文字列だけ拾う。
  const staticRe = /\b(?:import|export)\b[^;'"]*?\bfrom\s*(['"])((?:(?!\1).)*)\1/g;
  let m;
  while ((m = staticRe.exec(s)) != null) {
    const spec = m[2];
    if (isRelative(spec)) {
      out.push({ specifier: spec, line: lineAt(m.index), raw: m[0] });
    }
  }

  // ② 副作用 import: `import '...'`(from 節なし)
  const sideEffectRe = /\bimport\s*(['"])((?:(?!\1).)*)\1\s*;/g;
  while ((m = sideEffectRe.exec(s)) != null) {
    const spec = m[2];
    if (isRelative(spec)) {
      out.push({ specifier: spec, line: lineAt(m.index), raw: m[0] });
    }
  }

  // ③ 動的 import('...')(テンプレートリテラルの動的パスは静的解析不可のため対象外)。
  //    JSDoc の型参照 `@param {import('./x.js').Foo}` は実行時の動的 import ではないため除外する
  //    (この記法は本プロジェクトで56ファイルが使用。閉じ括弧の直後に `.識別子` が続くのが目印で、
  //    実行時の動的 import はそのような続き方をしない=既存コード全数調査で確認済み)。
  const dynamicRe = /\bimport\s*\(\s*(['"])((?:(?!\1).)*)\1\s*\)(\.[a-zA-Z_$])?/g;
  while ((m = dynamicRe.exec(s)) != null) {
    const spec = m[2];
    const isJsdocTypeRef = Boolean(m[3]);
    if (isRelative(spec) && !isJsdocTypeRef) {
      out.push({ specifier: spec, line: lineAt(m.index), raw: m[0] });
    }
  }

  return out;
}

/**
 * 参照元のリポジトリ相対パスと import 指定子から、解決先候補(リポジトリ相対パス)を返す。
 * 本プロジェクトの規約は拡張子省略なしだが、念のため素のパス/`.js` 補完/`index.js` 補完も
 * 候補に含める(誤検知防止のための保険。いずれかが実在すれば OK 判定にする)。
 *
 * @param {string} fromRepoPath 参照元のリポジトリ相対パス(/ 区切り)
 * @param {string} specifier import 指定子(相対パス)
 * @returns {string[]} 解決候補(重複排除・優先順)
 */
export function resolveImportCandidates(fromRepoPath, specifier) {
  const fromDir = String(fromRepoPath || '').split('/').slice(0, -1);
  const parts = String(specifier || '').split('/');
  const stack = [...fromDir];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  const base = stack.join('/');
  if (!base) return [];

  const candidates = [];
  const pushUnique = (p) => {
    if (p && !candidates.includes(p)) candidates.push(p);
  };

  // 既に拡張子(.js/.json/.mjs 等)がある指定子はそのまま。
  if (/\.[a-zA-Z0-9]+$/.test(base)) {
    pushUnique(base);
  } else {
    // 拡張子省略(規約上は存在しないはずだが保険として).js / index.js を候補に。
    pushUnique(`${base}.js`);
    pushUnique(`${base}/index.js`);
    pushUnique(base);
  }
  return candidates;
}

/**
 * 複数ファイルの相対 import を検査し、「解決先候補のいずれも git 追跡されていない」ものを
 * 未追跡 import(コミット漏れの疑い)として返す純関数。
 *
 * @param {{ path: string, text: string }[]} files 検査対象(path=リポジトリ相対・/ 区切り)
 * @param {Set<string>|string[]} trackedFiles git ls-files で得た追跡ファイル一覧(リポジトリ相対)
 * @returns {{ from: string, line: number, specifier: string, candidates: string[] }[]}
 */
export function findUntrackedImports(files, trackedFiles) {
  const tracked = trackedFiles instanceof Set ? trackedFiles : new Set(trackedFiles || []);
  const violations = [];
  for (const f of Array.isArray(files) ? files : []) {
    const from = String(f?.path || '');
    if (!from) continue;
    const refs = extractRelativeImportSpecifiers(f.text);
    for (const ref of refs) {
      const candidates = resolveImportCandidates(from, ref.specifier);
      if (candidates.length === 0) continue;
      const resolved = candidates.some((c) => tracked.has(c));
      if (!resolved) {
        violations.push({
          from,
          line: ref.line,
          specifier: ref.specifier,
          candidates
        });
      }
    }
  }
  return violations;
}
