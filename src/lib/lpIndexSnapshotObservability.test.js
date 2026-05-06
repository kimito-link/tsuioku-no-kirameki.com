/**
 * v0.1.195: LP「観測の見える化」セクションの契約テスト。
 * 6 コンポーネントの 5 番目（snapshot-observability）。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lpIndexPath = path.join(repoRoot, 'tsuioku-no-kirameki', 'index.html');

function observabilityBlock(html) {
  const start = html.indexOf('id="snapshot-observability"');
  if (start < 0) return '';
  const candidates = [
    html.indexOf('id="snapshot-future-comparison"', start),
    html.indexOf('id="marketing-features"', start)
  ].filter((p) => p > start);
  const end = candidates.length ? Math.min(...candidates) : html.length;
  return html.slice(start, end);
}

describe('lpIndexSnapshotObservability', () => {
  const html = readFileSync(lpIndexPath, 'utf8');

  it('セクション存在 + data 属性', () => {
    expect(html).toContain('id="snapshot-observability"');
    expect(html).toContain('data-lp-feature="snapshot-observability"');
  });

  it('「なぜ取れていないか」分類への言及', () => {
    const block = observabilityBlock(html);
    expect(block.length).toBeGreaterThan(0);
    expect(block).toMatch(/なぜ|取れない|理由|わかる/);
  });

  it('LP 用ダミー表現を含まない', () => {
    const block = observabilityBlock(html);
    expect(block).not.toContain('LP 用ダミー');
    expect(block).not.toContain('LP 用モック');
  });
});
