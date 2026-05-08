/**
 * v0.1.195: LP「ギフト個別 event 重複排除」セクションの契約テスト。
 * 6 コンポーネントの 2 番目（snapshot-gift-detail）。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lpIndexPath = path.join(repoRoot, 'tsuioku-no-kirameki', 'index.html');

function giftDetailBlock(html) {
  const start = html.indexOf('id="snapshot-gift-detail"');
  if (start < 0) return '';
  const candidates = [
    html.indexOf('id="snapshot-ranking"', start),
    html.indexOf('id="marketing-features"', start)
  ].filter((p) => p > start);
  const end = candidates.length ? Math.min(...candidates) : html.length;
  return html.slice(start, end);
}

describe('lpIndexSnapshotGiftDetail', () => {
  const html = readFileSync(lpIndexPath, 'utf8');

  it('セクション存在 + data 属性', () => {
    expect(html).toContain('id="snapshot-gift-detail"');
    expect(html).toContain('data-lp-feature="snapshot-gift-detail"');
  });

  it('「同じギフトを 2 経路で重複しないこと」を平易に説明', () => {
    const block = giftDetailBlock(html);
    expect(block.length).toBeGreaterThan(0);
    expect(block).toMatch(/重複|ダブり|二重|同じギフト/);
    expect(block).toMatch(/送り手|誰が|送信者/);
  });

  it('LP 用ダミー表現を含まない', () => {
    const block = giftDetailBlock(html);
    expect(block).not.toContain('LP 用ダミー');
    expect(block).not.toContain('LP 用モック');
  });
});
