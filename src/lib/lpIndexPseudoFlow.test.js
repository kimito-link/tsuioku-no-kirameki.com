/**
 * LP「拡張の疑似体験」ブロック（#extension-visual 内）の契約。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lpIndexPath = path.join(repoRoot, 'tsuioku-no-kirameki', 'index.html');

describe('lpIndexPseudoFlow', () => {
  const html = readFileSync(lpIndexPath, 'utf8');

  it('id と data-lp-feature と extension-visual 内配置', () => {
    expect(html).toContain('id="lp-extension-pseudo-flow"');
    expect(html).toContain('data-lp-feature="extension-pseudo-flow"');
    const start = html.indexOf('id="extension-visual"');
    const end = html.indexOf('id="lp-top-commenters"', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = html.slice(start, end);
    expect(block).toContain('id="lp-extension-pseudo-flow"');
  });

  it('流れ星の比喩と応援コメントの記録コピー、見本で操作不可の注意', () => {
    expect(html).toMatch(/流れ星/);
    expect(html).toContain('応援コメントの記録');
    expect(html).toMatch(/このページに載っている[\s\S]*動きません|操作はできません|押しても動きません/);
  });

  it('ステップが2つ（lp-pseudo-flow__step）', () => {
    const n = (html.match(/class="lp-pseudo-flow__step"/g) || []).length;
    expect(n).toBe(2);
  });

  it('比喩用の一文（本拡張が24時間で消えると誤解されにくい語）', () => {
    expect(html).toMatch(/別のサービス|短時間で消える/);
  });
});
