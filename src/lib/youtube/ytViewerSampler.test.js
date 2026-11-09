import { describe, it, expect } from 'vitest';
import { shouldSampleYtViewers, ytViewerSampleRow, YT_VIEWER_SAMPLE_INTERVAL_MS } from './ytViewerSampler.js';
import { computePseudoLvForVideoId } from './ytPseudoLv.js';
import { buildConcurrentTimelineSeries } from '../concurrentTimelineSeries.js';

describe('ytViewerSampler', () => {
  it('1分に1回・数のときだけ(0や読めないときは書かない)', () => {
    const m = new Map();
    expect(shouldSampleYtViewers(m, 'abcdefghijk', 21729, 1e6)).toBe(true);
    m.set('abcdefghijk', 1e6);
    expect(shouldSampleYtViewers(m, 'abcdefghijk', 21729, 1e6 + 30_000)).toBe(false);
    expect(shouldSampleYtViewers(m, 'abcdefghijk', 21729, 1e6 + YT_VIEWER_SAMPLE_INTERVAL_MS)).toBe(true);
    expect(shouldSampleYtViewers(m, 'zzzzzzzzzzz', 0, 1e6)).toBe(false);
    expect(shouldSampleYtViewers(m, 'zzzzzzzzzzz', null, 1e6)).toBe(false);
  });
  it('行は画面と同じ疑似 lv・同接は画面と同じ欄', () => {
    const row = ytViewerSampleRow('abcdefghijk', 20933.4, 5000, { itemCount: 12, title: '配信' });
    expect(row.liveId).toBe(computePseudoLvForVideoId('abcdefghijk'));
    expect(row.liveId).toMatch(/^lv9\d{11}$/);
    expect(row.peakConcurrentEstimate).toBe(20933);
    expect(row.officialViewerCount).toBe(20933);
    expect(row.commentStorageCount).toBe(12);
    expect(row.broadcastTitle).toBe('配信');
  });
  it('パネルが書いた直近の行の題名・応援者数を写す(最後の行を空にしない)', () => {
    const base = { id: 7, liveId: 'lv9', capturedAt: 1, uniqueKnownCommenters: 532, giftUserCount: 11, broadcastTitle: '公式の題名', commentStorageCount: 2476, officialViewerCount: 15000 };
    const row = ytViewerSampleRow('abcdefghijk', 21729, 9000, { itemCount: 2000 }, base);
    expect(row).not.toHaveProperty('id');
    expect(row.uniqueKnownCommenters).toBe(532);
    expect(row.giftUserCount).toBe(11);
    expect(row.broadcastTitle).toBe('公式の題名');
    expect(row.commentStorageCount).toBe(2476);
    expect(row.officialViewerCount).toBe(21729);
    expect(row.capturedAt).toBe(9000);
    expect(row.liveId).toBe(computePseudoLvForVideoId('abcdefghijk'));
  });
  it('同接推移カーブがこの行を読める', () => {
    const rows = [0, 1, 2].map((i) => ytViewerSampleRow('abcdefghijk', 15000 + i * 1000, 1_000_000 + i * 60_000));
    const series = buildConcurrentTimelineSeries(rows);
    expect(series.points.map((p) => p.value)).toEqual([15000, 16000, 17000]);
  });
});
