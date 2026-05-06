/**
 * v0.1.195: LP「他配信比較 Future Work」セクションの契約テスト。
 * 6 コンポーネントの 6 番目（snapshot-future-comparison）。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lpIndexPath = path.join(repoRoot, 'tsuioku-no-kirameki', 'index.html');

describe('lpIndexSnapshotFutureComparison', () => {
  const html = readFileSync(lpIndexPath, 'utf8');

  it('セクション存在 + data 属性', () => {
    expect(html).toContain('id="snapshot-future-comparison"');
    expect(html).toContain('data-lp-feature="snapshot-future-comparison"');
  });

  it('「将来の機能」であることを明示（誇張防止）', () => {
    const start = html.indexOf('id="snapshot-future-comparison"');
    const end = html.indexOf('id="marketing-features"', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = html.slice(start, end);
    // 必須: 「将来」「予定」のいずれか
    expect(block).toMatch(/将来|予定|これから|計画/);
    // 必須: いますぐは使えないことの言及
    expect(block).toMatch(/まだ|未対応|今は|現時点/);
  });

  it('プライバシー方針の最低限言及', () => {
    const start = html.indexOf('id="snapshot-future-comparison"');
    const end = html.indexOf('id="marketing-features"', start);
    const block = html.slice(start, end);
    expect(block).toMatch(/視聴者|個人情報|匿名|hash/);
  });

  it('LP 用ダミー表現を含まない', () => {
    const start = html.indexOf('id="snapshot-future-comparison"');
    const end = html.indexOf('id="marketing-features"', start);
    const block = html.slice(start, end);
    expect(block).not.toContain('LP 用ダミー');
    expect(block).not.toContain('LP 用モック');
  });
});
