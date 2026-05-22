import { describe, expect, it } from 'vitest';
import { mergeProgramStatsWatchIntoWatchMetaSnapshot } from './mergeProgramStatsWatchIntoWatchMetaSnapshot.js';

describe('mergeProgramStatsWatchIntoWatchMetaSnapshot', () => {
  it('viewerCountFromDom が無いとき watchCount を補完し officialViewerCount は触らない', () => {
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

  it('🐛 viewerCountFromDom が異なる値でも 公式 watchCount を優先して上書きする（カードとチップを揃える）', () => {
    // 実機 lv350583010 再現: カード(522=WS由来) vs チップ(927=watchCount) の食い違い解消。
    const snap = { liveId: 'lv1', viewerCountFromDom: 522 };
    const merged = mergeProgramStatsWatchIntoWatchMetaSnapshot(snap, {
      watchCount: 927
    });
    expect(merged).not.toBe(snap);
    expect(merged.viewerCountFromDom).toBe(927);
  });

  it('viewerCountFromDom が watchCount と同値なら同一参照を返す（無駄な再描画回避）', () => {
    const snap = { liveId: 'lv1', viewerCountFromDom: 927 };
    const merged = mergeProgramStatsWatchIntoWatchMetaSnapshot(snap, {
      watchCount: 927
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
