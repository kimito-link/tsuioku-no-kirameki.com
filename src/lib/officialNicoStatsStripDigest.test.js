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
    expect(d.eventGiftPts.isPlaceholder).toBe(true);
    expect(d.eventRank.isPlaceholder).toBe(true);
    expect(d.stableKey).toContain('lv1');
    expect(d.summaryText).toContain('来20,684');
    expect(d.summaryText).toContain('累11,530');
  });

  it('officialViewerCount が無いとき viewerCountFromDom で来場を埋める', () => {
    const d = buildOfficialNicoStatsStripDigest({
      liveId: 'lv3',
      officialViewerCount: null,
      viewerCountFromDom: 3796,
      officialCommentCount: 10
    });
    expect(d).not.toBeNull();
    expect(d.viewers.text).toBe('3,796');
    expect(d.summaryText).toContain('来3,796');
  });

  it('イベント累計と現在順位のチップを返す', () => {
    const d = buildOfficialNicoStatsStripDigest({
      liveId: 'lv2',
      officialViewerCount: 100,
      officialGiftPoints: 3880,
      officialEventGiftScore: 7780,
      officialNicoEventRank: 21
    });
    expect(d).not.toBeNull();
    expect(d.eventGiftPts.text).toBe('7,780');
    expect(d.eventRank.text).toBe('21位');
    expect(d.stableKey).toContain('7,780');
    expect(d.stableKey).toContain('21位');
    expect(d.summaryText).toContain('イ7,780');
    expect(d.summaryText).toContain('順21位');
  });

  it('未取得だと summary はタップ案内', () => {
    const d = buildOfficialNicoStatsStripDigest({
      liveId: 'lv9'
    });
    expect(d.summaryText).toContain('タップ');
  });

  it('snapshot が *Ndgr 命名を持つ場合（WIP 後の現行命名）でも値を拾う', () => {
    const d = buildOfficialNicoStatsStripDigest({
      liveId: 'lv350457157',
      officialViewerCount: 1234,
      officialAdPointsNdgr: 2500,
      officialGiftPointsNdgr: 100,
      officialEventGiftScoreNdgr: null,
      officialNicoEventRankNdgr: 50,
      officialNicoEventTitleNdgr: ''
    });
    expect(d).not.toBeNull();
    expect(d.adPts.text).toBe('2,500');
    expect(d.giftPts.text).toBe('100');
    expect(d.eventRank.text).toBe('50位');
    expect(d.eventGiftPts.isPlaceholder).toBe(true);
    expect(d.eventTitle.isPlaceholder).toBe(true);
  });

  it('*Ndgr が無く旧命名のみでも拾う（後方互換）', () => {
    const d = buildOfficialNicoStatsStripDigest({
      liveId: 'lv-legacy',
      officialAdPoints: 99,
      officialGiftPoints: 88
    });
    expect(d.adPts.text).toBe('99');
    expect(d.giftPts.text).toBe('88');
  });
});
