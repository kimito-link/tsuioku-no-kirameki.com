import { describe, it, expect } from 'vitest';
import { buildEventRankingSectionHtml } from './eventRankingSectionHtml.js';

// v0.1.810: popup-entry.js の buildHtmlReportDocument から抽出した純関数の characterization test。
//   抽出前の挙動と完全一致を担保(挙動完全不変リファクタの安全網)。

describe('buildEventRankingSectionHtml', () => {
  it('model が無効ならイベント不参加扱いで空文字(fail-soft)', () => {
    expect(buildEventRankingSectionHtml(null)).toBe('');
    expect(buildEventRankingSectionHtml(undefined)).toBe('');
    expect(buildEventRankingSectionHtml('x')).toBe('');
    expect(buildEventRankingSectionHtml({})).toBe(''); // self/rows 無し→空
  });

  it('rows があればテーブルを出す・順位/スコア/ユーザー列', () => {
    const html = buildEventRankingSectionHtml({
      eventName: 'ゴリアテ杯',
      rows: [
        { rank: 1, userId: '123', name: 'のどか', score: 5000, thumbnailUrl: 'https://x/a.jpg' },
        { rank: 2, userId: '', name: '名無し2', score: 2000 }
      ]
    });
    expect(html).toContain('id="sec-event-ranking"');
    expect(html).toContain('🏆 ゴリアテ杯');
    expect(html).toContain('event-rank__table');
    expect(html).toContain('💎 5,000');
    // 数字 userId はプロフィールリンク+サムネ link
    expect(html).toContain('https://www.nicovideo.jp/user/123');
    expect(html).toContain('src="https://x/a.jpg"');
    // 非数字 userId はリンクにしない
    expect(html).not.toContain('user/名無し2');
  });

  it('self の順位ヘッダ・配信者名は数字IDならリンク', () => {
    const html = buildEventRankingSectionHtml(
      { self: { rank: 3, score: 1000, broadcasterName: 'のどか', diffToNext: 200 }, rows: [] },
      { userId: '98428117' }
    );
    expect(html).toContain('event-rank__self');
    expect(html).toContain('現在 <strong>3</strong> 位');
    expect(html).toContain('💎 <strong>1,000</strong>');
    expect(html).toContain('あと 💎 200 で 2 位');
    expect(html).toContain('user/98428117'); // 数字ID→リンク
  });

  it('self.rank が 1 なら diff 行は出さない', () => {
    const html = buildEventRankingSectionHtml({ self: { rank: 1, score: 9, diffToNext: 100 }, rows: [] });
    expect(html).toContain('現在 <strong>1</strong> 位');
    expect(html).not.toContain('event-rank__diff');
  });

  it('thumbnailUrl が http/https でなければ画像を出さない(scheme検証)', () => {
    const html = buildEventRankingSectionHtml({
      rows: [{ rank: 1, userId: '1', name: 'a', score: 1, thumbnailUrl: 'javascript:alert(1)' }]
    });
    expect(html).not.toContain('javascript:');
    expect(html).toContain('event-rank__thumb--none');
  });

  it('isStale なら注記を出す', () => {
    const html = buildEventRankingSectionHtml({ rows: [{ rank: 1, userId: '1', name: 'a', score: 1 }], isStale: true });
    expect(html).toContain('event-rank__stale');
    expect(html).toContain('少し前に取得した値');
  });

  it('ユーザー名は escapeHtml される', () => {
    const html = buildEventRankingSectionHtml({ rows: [{ rank: 1, userId: '', name: '<b>x</b>', score: 1 }] });
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b></td>');
  });
});
