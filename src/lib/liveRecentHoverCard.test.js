import { describe, expect, it } from 'vitest';
import { buildRecentCardHtml } from './liveRecentHoverCard.js';

/**
 * v0.1.1514: /live/ の「コメントで応援した人」にホバーしたとき出すカードの中身(HTML 文字列)。
 * DOM/fetch を持たない純関数なので、状態→HTML 文字列の対応だけを検査する。
 */
describe('buildRecentCardHtml', () => {
  it('loading はスケルトン(骨格)を出す（待たされ感を消す・取得中は aria-label に残す）', () => {
    const html = buildRecentCardHtml({ phase: 'loading' });
    expect(html).toContain('recent-skeleton');
    expect(html).toContain('取得中'); // スクリーンリーダー向けに aria-label で残す
    expect(html).toContain('class="sk"'); // 骨格の帯
  });

  it('ok は各発言を <li> で並べる', () => {
    const html = buildRecentCardHtml({ phase: 'ok', texts: ['こんばんは', 'たのしい'] });
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>こんばんは</li>');
    expect(html).toContain('<li>たのしい</li>');
  });

  it('ok でも本文が空なら empty 扱い(嘘のカードを出さない)', () => {
    const html = buildRecentCardHtml({ phase: 'ok', texts: [] });
    expect(html).toContain('見当たりませんでした');
    expect(html).not.toContain('<ul>');
  });

  it('本文は escapeHtml を通す(<script> をそのまま出さない)', () => {
    const html = buildRecentCardHtml({ phase: 'ok', texts: ['<script>alert(1)</script>'] });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('partial のときは「直近ぶんだけ」を添える', () => {
    const html = buildRecentCardHtml({ phase: 'ok', texts: ['あ'], partial: true });
    expect(html).toContain('直近ぶんだけ');
  });

  it('partial でないときは注記を出さない', () => {
    const html = buildRecentCardHtml({ phase: 'ok', texts: ['あ'], partial: false });
    expect(html).not.toContain('直近ぶんだけ');
  });

  it('empty は理由を添える(無言にしない)', () => {
    const html = buildRecentCardHtml({ phase: 'empty' });
    expect(html).toContain('見当たりませんでした');
  });

  it('error は「取得できませんでした」を出す', () => {
    const html = buildRecentCardHtml({ phase: 'error' });
    expect(html).toContain('取得できませんでした');
  });

  it('unsupported(501)は「表示できません」を出す', () => {
    const html = buildRecentCardHtml({ phase: 'unsupported' });
    expect(html).toContain('表示できません');
  });

  it('blank と未知の状態は空文字(カードを出さない)', () => {
    expect(buildRecentCardHtml({ phase: 'blank' })).toBe('');
    expect(buildRecentCardHtml({ phase: 'nope' })).toBe('');
    expect(buildRecentCardHtml(null)).toBe('');
  });
});
