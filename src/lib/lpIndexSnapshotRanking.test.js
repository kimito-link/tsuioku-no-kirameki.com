/**
 * v0.1.195: LP「ランキング統合表示」セクションの契約テスト。
 * 6 コンポーネントの 3 番目（snapshot-ranking）。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lpIndexPath = path.join(repoRoot, 'tsuioku-no-kirameki', 'index.html');

function rankingBlock(html) {
  const start = html.indexOf('id="snapshot-ranking"');
  if (start < 0) return '';
  const candidates = [
    html.indexOf('id="snapshot-multi-tab-safety"', start),
    html.indexOf('id="marketing-features"', start)
  ].filter((p) => p > start);
  const end = candidates.length ? Math.min(...candidates) : html.length;
  return html.slice(start, end);
}

describe('lpIndexSnapshotRanking', () => {
  const html = readFileSync(lpIndexPath, 'utf8');

  it('セクション存在 + data 属性', () => {
    expect(html).toContain('id="snapshot-ranking"');
    expect(html).toContain('data-lp-feature="snapshot-ranking"');
  });

  it('応援・貢献度・広告の 3 種類のランキング言及', () => {
    const block = rankingBlock(html);
    expect(block.length).toBeGreaterThan(0);
    expect(block).toMatch(/応援/);
    expect(block).toMatch(/貢献/);
    expect(block).toMatch(/広告/);
  });

  it('LP 用ダミー表現を含まない', () => {
    const block = rankingBlock(html);
    expect(block).not.toContain('LP 用ダミー');
    expect(block).not.toContain('LP 用モック');
  });
});
