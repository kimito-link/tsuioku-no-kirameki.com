/**
 * v0.1.195: LP「複数タブ安全性」セクションの契約テスト。
 * 6 コンポーネントの 4 番目（snapshot-multi-tab-safety）。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lpIndexPath = path.join(repoRoot, 'tsuioku-no-kirameki', 'index.html');

function multiTabBlock(html) {
  const start = html.indexOf('id="snapshot-multi-tab-safety"');
  if (start < 0) return '';
  const candidates = [
    html.indexOf('id="snapshot-observability"', start),
    html.indexOf('id="marketing-features"', start)
  ].filter((p) => p > start);
  const end = candidates.length ? Math.min(...candidates) : html.length;
  return html.slice(start, end);
}

describe('lpIndexSnapshotMultiTabSafety', () => {
  const html = readFileSync(lpIndexPath, 'utf8');

  it('セクション存在 + data 属性', () => {
    expect(html).toContain('id="snapshot-multi-tab-safety"');
    expect(html).toContain('data-lp-feature="snapshot-multi-tab-safety"');
  });

  it('「複数タブで消えない」を平易に説明', () => {
    const block = multiTabBlock(html);
    expect(block.length).toBeGreaterThan(0);
    expect(block).toMatch(/複数タブ|並行|同時|別タブ/);
    expect(block).toMatch(/消えない|保持|残る|安定/);
  });

  it('LP 用ダミー表現を含まない', () => {
    const block = multiTabBlock(html);
    expect(block).not.toContain('LP 用ダミー');
    expect(block).not.toContain('LP 用モック');
  });
});
