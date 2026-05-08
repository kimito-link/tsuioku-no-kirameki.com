/**
 * v0.1.195: LP 統合スナップショット 6 コンポーネントの統合（順序）テスト。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lpIndexPath = path.join(repoRoot, 'tsuioku-no-kirameki', 'index.html');

describe('lpIndexUnifiedSnapshotIntegration', () => {
  const html = readFileSync(lpIndexPath, 'utf8');

  it('6 つのコンポーネントが期待順に並ぶ', () => {
    const order = [
      'id="unified-snapshot-overview"',
      'id="snapshot-gift-detail"',
      'id="snapshot-ranking"',
      'id="snapshot-multi-tab-safety"',
      'id="snapshot-observability"',
      'id="snapshot-future-comparison"'
    ];
    let lastPos = -1;
    for (const marker of order) {
      const pos = html.indexOf(marker);
      expect(pos).toBeGreaterThan(lastPos);
      lastPos = pos;
    }
  });

  it('既存 #marketing-features の直前に挿入されている', () => {
    const sectionPos = html.indexOf('id="unified-snapshot-overview"');
    const marketingPos = html.indexOf('id="marketing-features"');
    expect(sectionPos).toBeGreaterThan(-1);
    expect(marketingPos).toBeGreaterThan(sectionPos);
  });

  it('既存 lpIndexPlainLanguage 制約の継承（LP 用ダミー含まない）', () => {
    // 6 セクション全体を抽出
    const start = html.indexOf('id="unified-snapshot-overview"');
    const end = html.indexOf('id="marketing-features"', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = html.slice(start, end);
    expect(block).not.toContain('LP 用ダミー');
    expect(block).not.toContain('LP 用モック');
  });
});
