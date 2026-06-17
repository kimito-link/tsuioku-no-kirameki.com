import { describe, it, expect } from 'vitest';
import { buildEventSelfStatusHeaderHtml } from './eventSelfStatusHeaderHtml.js';

// v0.1.809: popup-entry.js から抽出した純関数の characterization test(挙動完全不変の担保)。

describe('buildEventSelfStatusHeaderHtml', () => {
  it('self が無い/非オブジェクトは空文字', () => {
    expect(buildEventSelfStatusHeaderHtml(null)).toBe('');
    expect(buildEventSelfStatusHeaderHtml(undefined)).toBe('');
    expect(buildEventSelfStatusHeaderHtml('x')).toBe('');
    expect(buildEventSelfStatusHeaderHtml({})).toBe(''); // rank なし→空
  });

  it('rank が確定できないと空文字(順位を大きく見せるのが主目的)', () => {
    expect(buildEventSelfStatusHeaderHtml({ rank: 0 })).toBe('');
    expect(buildEventSelfStatusHeaderHtml({ rank: -1 })).toBe('');
    expect(buildEventSelfStatusHeaderHtml({ rank: NaN })).toBe('');
    expect(buildEventSelfStatusHeaderHtml({ score: 100 })).toBe(''); // rank 無し
  });

  it('1位はメダル🥇+守ろう文言+top1クラス', () => {
    const html = buildEventSelfStatusHeaderHtml({ rank: 1, score: 5000, eventName: 'ゴリアテ杯' }, 'のどか');
    expect(html).toContain('nl-event-self__badge--top1');
    expect(html).toContain('🥇');
    expect(html).toContain('堂々の<strong>1位</strong>');
    expect(html).toContain('🏆 ゴリアテ杯');
    expect(html).toContain('のどかさんは現在 <strong>1位</strong>');
    expect(html).toContain('（💎5,000）');
  });

  it('2-3位もメダル', () => {
    expect(buildEventSelfStatusHeaderHtml({ rank: 2 })).toContain('🥈');
    expect(buildEventSelfStatusHeaderHtml({ rank: 3 })).toContain('🥉');
    expect(buildEventSelfStatusHeaderHtml({ rank: 3 })).toContain('nl-event-self__badge--top3');
  });

  it('4位以降はメダル無し・diffToNext があれば次位までの差を出す', () => {
    const html = buildEventSelfStatusHeaderHtml({ rank: 5, diffToNext: 1200 }, '');
    expect(html).not.toContain('🥇');
    expect(html).toContain('nl-event-self__rank-num--plain');
    expect(html).toContain('あと <strong>💎1,200</strong> で <strong>4位</strong>');
    expect(html).toContain('この配信者さん'); // 名前空→既定ラベル
  });

  it('配信者名は escapeHtml される(XSS防止)', () => {
    const html = buildEventSelfStatusHeaderHtml({ rank: 4 }, '<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;さん');
    expect(html).not.toContain('<b>x</b>さん');
  });

  it('eventName も escapeHtml される', () => {
    const html = buildEventSelfStatusHeaderHtml({ rank: 2, eventName: '<i>e</i>' });
    expect(html).toContain('🏆 &lt;i&gt;e&lt;/i&gt;');
  });

  it('score 無し/負は（💎…）を出さない', () => {
    const html = buildEventSelfStatusHeaderHtml({ rank: 4, score: -1 });
    expect(html).not.toContain('💎');
    // rank 4 で diffToNext 無し→既定の応援文言
    expect(html).toContain('みんなでランキングに入れるよう応援しよう');
  });
});
