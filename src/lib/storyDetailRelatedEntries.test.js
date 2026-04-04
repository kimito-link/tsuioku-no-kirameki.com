import { describe, it, expect } from 'vitest';
import { entriesRelatedForStoryDetail } from './storyDetailRelatedEntries.js';

describe('entriesRelatedForStoryDetail', () => {
  it('同一 userId のみ・新しい順（末尾5件を reverse）', () => {
    const all = [
      { userId: '1', commentNo: '1', text: 'a' },
      { userId: '2', commentNo: '2', text: 'b' },
      { userId: '1', commentNo: '3', text: 'c' },
      { userId: '1', commentNo: '4', text: 'd' }
    ];
    const r = entriesRelatedForStoryDetail(all, { userId: '1' }, { limit: 5 });
    expect(r.map((x) => x.commentNo)).toEqual(['4', '3', '1']);
  });

  it('focus が userId なしのときは空（無関係な ID未取得同士を混ぜない）', () => {
    const all = [
      { userId: null, commentNo: '1', text: 'x' },
      { userId: null, commentNo: '2', text: 'y' }
    ];
    expect(entriesRelatedForStoryDetail(all, { userId: null })).toEqual([]);
    expect(entriesRelatedForStoryDetail(all, {})).toEqual([]);
  });

  it('limit で件数制限', () => {
    const all = Array.from({ length: 10 }, (_, i) => ({
      userId: '9',
      commentNo: String(i),
      text: 't'
    }));
    expect(entriesRelatedForStoryDetail(all, { userId: '9' }, { limit: 2 })).toHaveLength(2);
  });
});
