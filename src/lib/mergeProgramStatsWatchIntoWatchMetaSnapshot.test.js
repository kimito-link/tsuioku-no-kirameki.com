import { describe, expect, it } from 'vitest';
import { mergeProgramStatsWatchIntoWatchMetaSnapshot } from './mergeProgramStatsWatchIntoWatchMetaSnapshot.js';

describe('mergeProgramStatsWatchIntoWatchMetaSnapshot', () => {
  it('viewerCountFromDom が無いときだけ watchCount を補完し officialViewerCount は触らない', () => {
    const snap = {
      liveId: 'lv1',
      officialViewerCount: null,
      officialStatsUpdatedAt: 1_700_000_000_000
    };
    const merged = mergeProgramStatsWatchIntoWatchMetaSnapshot(snap, {
      watchCount: 5000
    });
    expect(merged).not.toBe(snap);
    expect(merged.viewerCountFromDom).toBe(5000);
    expect(merged.officialViewerCount).toBeNull();
  });

  it('viewerCountFromDom が既にあるときは同一参照を返す', () => {
    const snap = { liveId: 'lv1', viewerCountFromDom: 123 };
    const merged = mergeProgramStatsWatchIntoWatchMetaSnapshot(snap, {
      watchCount: 9999
    });
    expect(merged).toBe(snap);
  });

  it('programStats 無し・watchCount 不正は元 snapshot', () => {
    const snap = { liveId: 'lv1' };
    expect(mergeProgramStatsWatchIntoWatchMetaSnapshot(snap, null)).toBe(snap);
    expect(
      mergeProgramStatsWatchIntoWatchMetaSnapshot(snap, { watchCount: NaN })
    ).toBe(snap);
  });
});
