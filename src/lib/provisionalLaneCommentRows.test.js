import { describe, it, expect } from 'vitest';
import { selectLaneFeedCommentRows } from './provisionalLaneCommentRows.js';

describe('selectLaneFeedCommentRows', () => {
  it('heavy 完了後は primary のみ', () => {
    const primary = [{ commentNo: '1', text: 'a', userId: 'u1', liveId: 'lv1' }];
    const r = selectLaneFeedCommentRows({
      liveId: 'lv1',
      primaryEntries: primary,
      heavySettled: true,
      panelSummary: { recentRows: [{ commentNo: '2', text: 'b', userId: 'u2' }] }
    });
    expect(r.provisional).toBe(false);
    expect(r.entries).toEqual(primary);
  });

  it('heavy 未完了ならサマリ recent をマージする', () => {
    const primary = [{ commentNo: '1', text: 'a', userId: 'u1', liveId: 'lv1' }];
    const r = selectLaneFeedCommentRows({
      liveId: 'lv1',
      primaryEntries: primary,
      heavySettled: false,
      panelSummary: {
        recentRows: [
          { commentNo: '2', text: 'b', userId: 'u2', liveId: 'lv1' },
          { commentNo: '3', text: 'c', userId: 'u3', liveId: 'lv1' }
        ]
      }
    });
    expect(r.provisional).toBe(true);
    expect(r.entries.length).toBe(3);
  });

  it('panelSummary は storage 形の recent フィールドを読む', () => {
    const r = selectLaneFeedCommentRows({
      liveId: 'lv1',
      primaryEntries: [],
      heavySettled: false,
      panelSummary: {
        recent: [{ commentNo: '7', text: 'panel', userId: 'u7', liveId: 'lv1' }]
      }
    });
    expect(r.provisional).toBe(true);
    expect(r.entries.length).toBe(1);
  });

  it('同一 commentNo は二重に載せない', () => {
    const row = { commentNo: '9', text: 'x', userId: 'u9', liveId: 'lv1' };
    const r = selectLaneFeedCommentRows({
      liveId: 'lv1',
      primaryEntries: [row],
      heavySettled: false,
      commentSummary: { recent: [row, { commentNo: '10', text: 'y', userId: 'u10' }] }
    });
    expect(r.entries.length).toBe(2);
  });
});
