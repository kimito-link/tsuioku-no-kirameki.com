import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lpIndexPath = path.join(repoRoot, 'tsuioku-no-kirameki', 'index.html');

describe('LP index.html — 匿名 Identicon 説明', () => {
  const html = readFileSync(lpIndexPath, 'utf8');

  it('アンカーと data 属性で機能ブロックを特定できる', () => {
    expect(html).toContain('id="lp-anonymous-identicon"');
    expect(html).toContain('data-lp-feature="anonymous-identicon"');
  });

  it('ユーザー向けの要点（Identicon・匿名・既定・ポップアップ設定）を含む', () => {
    expect(html).toContain('Identicon');
    expect(html).toContain('匿名');
    expect(html).toContain('既定');
    expect(html).toContain('応援可視化（ユーザー別）');
    expect(html).toContain('公式');
    expect(html).toContain('識別');
    expect(html).toContain('lp-site-look-mock__identicon-legend');
    expect(html).toContain('りんく');
    expect(html).toContain('こん太');
    expect(html).toContain('たぬ姉');
  });

  it('先頭リードで「同じ匿名の人の件数」と判別の目的が一文で言える', () => {
    expect(html).toContain('data-lp-identicon-lead');
    expect(html).toContain('lp-identicon-lead');
    expect(html).toContain('何件');
    expect(html).toContain('判別');
    expect(html).toContain('lp-identicon-guide-details');
  });
});
