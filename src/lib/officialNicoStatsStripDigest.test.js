import { describe, expect, it } from 'vitest';
import { buildOfficialNicoStatsStripDigest } from './officialNicoStatsStripDigest.js';

describe('buildOfficialNicoStatsStripDigest', () => {
  it('liveId が無いときは null', () => {
    expect(buildOfficialNicoStatsStripDigest({ liveId: '' })).toBe(null);
  });

  it('数値チップと stableKey を返す', () => {
    const d = buildOfficialNicoStatsStripDigest({
      liveId: 'lv1',
      officialViewerCount: 20684,
      officialCommentCount: 9410,
      streamAgeMin: 125,
      officialAdPoints: 23200,
      officialGiftPoints: 11530
    });
    expect(d).not.toBeNull();
    expect(d.viewers.text).toBe('20,684');
    expect(d.comments.text).toBe('9,410');
    expect(d.streamAge.text).toBe('2時間5分');
    expect(d.adPts.text).toBe('23,200');
    expect(d.giftPts.text).toBe('11,530');
    expect(d.stableKey).toContain('lv1');
    expect(d.summaryText).toContain('来20,684');
  });

  it('未取得だと summary はタップ案内', () => {
    const d = buildOfficialNicoStatsStripDigest({
      liveId: 'lv9'
    });
    expect(d.summaryText).toContain('タップ');
  });
});
