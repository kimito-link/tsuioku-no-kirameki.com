import { describe, expect, it } from 'vitest';
import {
  extractRelativeImportSpecifiers,
  resolveImportCandidates,
  findUntrackedImports
} from './trackedImports.js';

describe('extractRelativeImportSpecifiers', () => {
  it('単純な named import を拾う', () => {
    const refs = extractRelativeImportSpecifiers("import { foo } from './foo.js';");
    expect(refs).toHaveLength(1);
    expect(refs[0].specifier).toBe('./foo.js');
  });

  it('複数行に分割された import を拾う', () => {
    const text = [
      'import {',
      '  foo,',
      '  bar',
      "} from '../lib/x.js';"
    ].join('\n');
    const refs = extractRelativeImportSpecifiers(text);
    expect(refs).toHaveLength(1);
    expect(refs[0].specifier).toBe('../lib/x.js');
    expect(refs[0].line).toBe(1);
  });

  it('export ... from も拾う', () => {
    const refs = extractRelativeImportSpecifiers("export { z } from './z.js';");
    expect(refs).toHaveLength(1);
    expect(refs[0].specifier).toBe('./z.js');
  });

  it('動的 import() を拾う', () => {
    const refs = extractRelativeImportSpecifiers("const p = import('./dyn.js');");
    expect(refs).toHaveLength(1);
    expect(refs[0].specifier).toBe('./dyn.js');
  });

  it('副作用 import(from節なし)を拾う', () => {
    const refs = extractRelativeImportSpecifiers("import './sideEffect.js';");
    expect(refs).toHaveLength(1);
    expect(refs[0].specifier).toBe('./sideEffect.js');
  });

  it('bare specifier(npmパッケージ)は無視する', () => {
    const refs = extractRelativeImportSpecifiers("import * as esbuild from 'esbuild';");
    expect(refs).toHaveLength(0);
  });

  it('デフォルト import + named import 混在の行を拾う', () => {
    const refs = extractRelativeImportSpecifiers("import y, { x } from './y.js';");
    expect(refs).toHaveLength(1);
    expect(refs[0].specifier).toBe('./y.js');
  });

  it('複数の import 文をすべて拾う', () => {
    const text = [
      "import { a } from './a.js';",
      "import { b } from '../b.js';",
      "const c = await import('./c.js');"
    ].join('\n');
    const refs = extractRelativeImportSpecifiers(text);
    expect(refs.map((r) => r.specifier)).toEqual(['./a.js', '../b.js', './c.js']);
  });

  it('テンプレートリテラルの動的パスは対象外(静的解析不可)', () => {
    const refs = extractRelativeImportSpecifiers('const p = import(`./dyn-${id}.js`);');
    expect(refs).toHaveLength(0);
  });

  it('JSDoc型参照 import(...).Type は動的importとして誤検知しない(実運用56ファイルの記法)', () => {
    const text = " * @param {import('./deletedType.js').Foo} x";
    expect(extractRelativeImportSpecifiers(text)).toHaveLength(0);
  });

  it('JSDoc型参照でも from 節付きの静的importとは別物として扱う(from節が無ければ①②に一致しない)', () => {
    const text = "/** @typedef {import('./marketingAggregate.js').MarketingReport} MarketingReport */";
    expect(extractRelativeImportSpecifiers(text)).toHaveLength(0);
  });

  it('本物の動的importは同一行に .Identifier が続いても直後の . でなければ拾う', () => {
    // 実運用パターン: `await import('./x.js');` のように閉じ括弧の直後は ; や改行
    const refs = extractRelativeImportSpecifiers("await import('./x.js');\nconsole.log('ok');");
    expect(refs).toHaveLength(1);
    expect(refs[0].specifier).toBe('./x.js');
  });
});

describe('resolveImportCandidates', () => {
  it('同ディレクトリの相対 import を解決する', () => {
    const candidates = resolveImportCandidates('src/lib/a.js', './b.js');
    expect(candidates).toContain('src/lib/b.js');
  });

  it('親ディレクトリを辿る相対 import を解決する', () => {
    const candidates = resolveImportCandidates('src/extension/content-entry.js', '../lib/broadcastUrl.js');
    expect(candidates).toContain('src/lib/broadcastUrl.js');
  });

  it('深いネストからの複数階層 .. を解決する', () => {
    const candidates = resolveImportCandidates(
      'src/extension/panels/foo/bar.js',
      '../../../lib/aggregateCommentsByUser.js'
    );
    expect(candidates).toContain('src/lib/aggregateCommentsByUser.js');
  });

  it('拡張子省略時は .js と index.js を候補に補う(保険)', () => {
    const candidates = resolveImportCandidates('src/lib/a.js', './util');
    expect(candidates).toContain('src/lib/util.js');
    expect(candidates).toContain('src/lib/util/index.js');
  });
});

describe('findUntrackedImports', () => {
  it('解決先が git 追跡されていれば違反なし', () => {
    const files = [{ path: 'src/lib/a.js', text: "import { b } from './b.js';" }];
    const tracked = new Set(['src/lib/a.js', 'src/lib/b.js']);
    expect(findUntrackedImports(files, tracked)).toEqual([]);
  });

  it('解決先が git 未追跡なら「コミット漏れ」として検出する(実事故の再現)', () => {
    // 実事故: src/lib/safeStorageLocal.js を git add し忘れたまま commit
    const files = [
      {
        path: 'src/lib/settingsStore.js',
        text: "import { safeGet } from './safeStorageLocal.js';"
      }
    ];
    const tracked = new Set(['src/lib/settingsStore.js']); // safeStorageLocal.js が抜けている
    const violations = findUntrackedImports(files, tracked);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      from: 'src/lib/settingsStore.js',
      line: 1,
      specifier: './safeStorageLocal.js'
    });
    expect(violations[0].candidates).toContain('src/lib/safeStorageLocal.js');
  });

  it('複数ファイル・複数違反をすべて列挙する', () => {
    const files = [
      { path: 'src/lib/a.js', text: "import { x } from './missing1.js';" },
      { path: 'src/lib/b.js', text: "import { y } from './missing2.js';" }
    ];
    const tracked = new Set(['src/lib/a.js', 'src/lib/b.js']);
    const violations = findUntrackedImports(files, tracked);
    expect(violations).toHaveLength(2);
  });

  it('動的 import の未追跡先も検出する', () => {
    const files = [
      { path: 'src/lib/a.js', text: "async function f() { await import('./lazy.js'); }" }
    ];
    const tracked = new Set(['src/lib/a.js']);
    const violations = findUntrackedImports(files, tracked);
    expect(violations).toHaveLength(1);
    expect(violations[0].specifier).toBe('./lazy.js');
  });

  it('現実的な多数 import でも誤検知しない(全員追跡済み)', () => {
    const files = [
      {
        path: 'src/extension/content-entry.js',
        text: [
          'import {',
          '  extractLiveIdFromDom,',
          '  extractLiveIdFromUrl',
          "} from '../lib/broadcastUrl.js';",
          "import { addThumbBlob } from '../lib/thumbDb.js';"
        ].join('\n')
      }
    ];
    const tracked = new Set([
      'src/extension/content-entry.js',
      'src/lib/broadcastUrl.js',
      'src/lib/thumbDb.js'
    ]);
    expect(findUntrackedImports(files, tracked)).toEqual([]);
  });
});
