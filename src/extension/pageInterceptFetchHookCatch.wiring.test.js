import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 2026-07-16: 通常動画ページ(sm...)で「Uncaught (in promise) TypeError: Failed to fetch」が
//   拡張エラーとして継続的に発生していた実機報告の回帰テスト。page-intercept-entry.js には
//   window.fetch を上書きするフックが2箇所あるが、1つ目(874行目付近)は元Promiseに .catch()
//   を付けて拡張エラー化を防いでいた一方、2つ目(_allFetchLog デバッグ計装)には .catch() が
//   無く、ページ側が catch し忘れたネットワーク失敗がそのまま拡張の未処理例外として漏れていた。
//   ソース文字列スキャンで両方のフックに同じ安全パターンが入っていることを固定する
//   (MAIN world IIFEでDOM/window依存が強くユニットテストを直接組めないため)。

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, 'page-intercept-entry.js'), 'utf8');

describe('page-intercept-entry.js の window.fetch フックは失敗Promiseを必ずcatchする', () => {
  it('1つ目のfetchフック(_fetchLog)がPromiseに.catch()を付けている', () => {
    const start = src.indexOf('const _fetchLog = [];');
    const end = src.indexOf('window.fetch = function', start + 1);
    expect(start).toBeGreaterThanOrEqual(0);
    const block = src.slice(start, end + 500);
    expect(block).toMatch(/p\.catch\(\(\) => \{/);
  });

  it('2つ目のfetchフック(_allFetchLog)もPromiseに.catch()を付けている(2026-07-16根治)', () => {
    const start = src.indexOf('const _allFetchLog = [];');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('} catch { /* no-op */ }', start);
    const block = src.slice(start, end);
    expect(block).toMatch(/p2\.catch\(\(\) => \{/);
    expect(block).toContain('return p2;');
    // 元のfetchはそのまま呼び出し元へ返す(挙動は変えない・拡張エラー化だけ防ぐ)。
    expect(block).toContain('p2 = prevFetch.apply(this, args);');
  });

  it('2つ目のフックは同期例外もPromise.rejectとして扱う(1つ目と同じパターン)', () => {
    const start = src.indexOf('const _allFetchLog = [];');
    const end = src.indexOf('} catch { /* no-op */ }', start);
    const block = src.slice(start, end);
    expect(block).toMatch(/catch \(e\) \{\s*return Promise\.reject\(e\);\s*\}/);
  });
});
