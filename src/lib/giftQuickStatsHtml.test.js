/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { buildGiftQuickStatsHtml } from './giftQuickStatsHtml.js';

// characterization テスト: 抽出前の renderGiftQuickStatsPanel の本体組み立てを固定。

const wrap = (html) => new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
const u = (over = {}) => ({ nickname: 'りんく', userId: '12345', capturedAt: 1000, ...over });

describe('buildGiftQuickStatsHtml', () => {
  it('空配列・非配列は空文字', () => {
    expect(buildGiftQuickStatsHtml([])).toBe('');
    expect(buildGiftQuickStatsHtml(null)).toBe('');
  });

  it('見出しに総数を出し、ul を作る', () => {
    const html = buildGiftQuickStatsHtml([u(), u({ userId: '2' })]);
    expect(html).toContain('2 名を記録中（直近順に最大15件）');
    const doc = wrap(html);
    expect(doc.querySelector('ul.nl-gift-quick-list')).not.toBeNull();
    expect(doc.querySelectorAll('li').length).toBe(2);
  });

  it('capturedAt 降順で並ぶ', () => {
    const html = buildGiftQuickStatsHtml([
      u({ userId: 'old', capturedAt: 1 }),
      u({ userId: 'new', capturedAt: 100 }),
      u({ userId: 'mid', capturedAt: 50 })
    ]);
    const uids = [...wrap(html).querySelectorAll('.nl-gift-uid')].map((c) => c.textContent);
    expect(uids).toEqual(['new', 'mid', 'old']);
  });

  it('top15 まで（総数は全件を表示）', () => {
    const many = Array.from({ length: 20 }, (_, i) => u({ userId: `u${i}`, capturedAt: i }));
    const html = buildGiftQuickStatsHtml(many);
    expect(html).toContain('20 名を記録中');
    expect(wrap(html).querySelectorAll('li').length).toBe(15);
  });

  it('nickname 欠損は (noname)', () => {
    const html = buildGiftQuickStatsHtml([u({ nickname: '' })]);
    expect(wrap(html).querySelector('.nl-gift-nick').textContent).toBe('(noname)');
  });

  it('XSS: nickname/userId はエスケープされる', () => {
    const doc = wrap(
      buildGiftQuickStatsHtml([u({ nickname: '<script>x</script>', userId: 'a"<>' })])
    );
    expect(doc.querySelector('script')).toBeNull();
    expect(doc.querySelector('.nl-gift-nick').textContent).toBe('<script>x</script>');
  });

  it('元配列を破壊しない（sort はコピーに対して行う）', () => {
    const arr = [u({ capturedAt: 1 }), u({ capturedAt: 9 })];
    const before = arr.map((x) => x.capturedAt);
    buildGiftQuickStatsHtml(arr);
    expect(arr.map((x) => x.capturedAt)).toEqual(before);
  });
});
