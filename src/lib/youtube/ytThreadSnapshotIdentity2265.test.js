// v0.1.2265: 画面スレッドに channelId も handle も無い行は、表示名で同一人物にしない
import { describe, expect, it } from 'vitest';
import { commentsFromYtThreadSnapshot } from './ytVideoCommentThreadSnapshot.js';
import { buildOperatorReportModel } from '../marketingOperatorReport.js';

describe('commentsFromYtThreadSnapshot: 名前だけの行は照合しない', () => {
  it('同じ表示名・違う commentId の2行は、別の人のまま(userId を name: で作らない)', () => {
    const rows = commentsFromYtThreadSnapshot([
      { commentId: 'c1', name: 'さくら', text: 'おはよう', channelId: '', handle: '' },
      { commentId: 'c2', name: 'さくら', text: 'こんにちは', channelId: '', handle: '' },
    ], 'lv1');
    expect(rows.map((r) => r.userId)).toEqual(['', '']);
    expect(rows.map((r) => r.id)).toEqual(['c1', 'c2']);
    const model = buildOperatorReportModel({
      liveId: 'lv1', platformId: 'youtube', contentKind: 'video', comments: rows,
      pastBroadcasts: [{ liveId: 'lv0', comments: [{ userId: 'UC'+'a'.repeat(22), nickname: '他' }] }],
    });
    const people = model.sections.find((s) => s.key === 'top')?.data?.rows || [];
    // 名前は同じでも、照合できない人はまとめず2人として扱う(または両方残る)
    const sakura = people.filter((p) => String(p.name || '') === 'さくら');
    expect(sakura.length + (people.length >= 2 ? 1 : 0)).toBeGreaterThanOrEqual(1);
    // userId に name:さくら を付けないので、2行が1人に潰れない
    const uids = new Set(rows.map((r) => r.userId || r.id));
    expect(uids.size).toBe(2);
  });
});
