import { describe, it, expect } from 'vitest';
import { formatCommentTimelineReportLines } from './commentTimelineReport.js';

describe('formatCommentTimelineReportLines', () => {
  it('鏡が無い/空なら「鏡がありません」を1行出す(載っていないことが分かる)', () => {
    for (const mirror of [null, undefined, {}, { rows: [] }, { rows: [{ text: '', name: '' }] }]) {
      const lines = formatCommentTimelineReportLines(mirror, 1000);
      expect(lines[0]).toBe('### 応援コメント(最新の本文)');
      expect(lines.some((l) => l.includes('まだコメントの鏡がありません'))).toBe(true);
    }
  });

  it('鏡ありなら「名前: 本文」で本文を出す', () => {
    const mirror = {
      liveId: 'lv1',
      capturedAt: 1000,
      totalSeen: 51,
      rows: [
        { at: 900, name: 'りんく', text: 'がんばれー', kind: 'comment' },
        { at: 950, name: '', text: '888', kind: 'comment' }
      ]
    };
    const lines = formatCommentTimelineReportLines(mirror, 6000);
    expect(lines.some((l) => l.includes('りんく: がんばれー'))).toBe(true);
    // 名前空の匿名は「(匿名): 本文」
    expect(lines.some((l) => l.includes('(匿名): 888'))).toBe(true);
    // 鮮度行(約N秒前 / 観測累計)
    expect(lines.some((l) => l.includes('観測累計 51 件'))).toBe(true);
    expect(lines.some((l) => l.includes('約5秒前'))).toBe(true);
  });

  it('comment/chat 以外の kind には印を付ける(ギフト等を通常コメントと区別)', () => {
    const mirror = { rows: [{ name: 'たぬ姉', text: 'ギフト投げた', kind: 'gift' }] };
    const lines = formatCommentTimelineReportLines(mirror, 0);
    expect(lines.some((l) => l.includes('[gift] たぬ姉: ギフト投げた'))).toBe(true);
  });

  it('最新20件だけ出す(末尾=最新・古い順に並ぶ)', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ name: 'u', text: `c${i}`, kind: 'comment' }));
    const lines = formatCommentTimelineReportLines({ rows }, 0);
    const body = lines.filter((l) => l.includes('u: c'));
    expect(body.length).toBe(20);
    // 末尾20件(c10..c29)= 最後の行が最新 c29
    expect(body[0]).toContain('u: c10');
    expect(body[body.length - 1]).toContain('u: c29');
  });
});
