import { describe, expect, it } from 'vitest';
import {
  concurrentEstimateIsSparseSignal,
  shouldShowConcurrentEstimate
} from './popupConcurrentEstimateGate.js';
import { watchMetaConcurrentGateFromSnapshot } from './popupWatchMetaConcurrentGate.js';

describe('watchMetaConcurrentGateFromSnapshot', () => {
  it('popup のゲート関数と同じ引数に分解できる（表示可否）', () => {
    const snapshots = [
      {},
      { recentActiveUsers: 0, officialViewerCount: null, viewerCountFromDom: null, liveId: '' },
      { recentActiveUsers: 1, liveId: '' },
      { recentActiveUsers: 0, officialViewerCount: 99, liveId: '' },
      { recentActiveUsers: 0, viewerCountFromDom: 0, liveId: '' },
      { recentActiveUsers: 0, viewerCountFromDom: 500, liveId: '' },
      { recentActiveUsers: 0, viewerCountFromDom: null, liveId: 'lv1' }
    ];
    for (const s of snapshots) {
      const vc = s.viewerCountFromDom;
      const recentActive = typeof s.recentActiveUsers === 'number' ? s.recentActiveUsers : 0;
      const expected = shouldShowConcurrentEstimate({
        recentActiveUsers: recentActive,
        officialViewerCount: s.officialViewerCount,
        viewerCountFromDom: vc,
        liveId: s.liveId
      });
      expect(watchMetaConcurrentGateFromSnapshot(s).showConcurrent).toBe(expected);
    }
  });

  it('sparse 判定もゲートモジュールと一致', () => {
    const snapshots = [
      { recentActiveUsers: 0, officialViewerCount: null, viewerCountFromDom: null },
      { recentActiveUsers: 0, officialViewerCount: null, viewerCountFromDom: 0 },
      { recentActiveUsers: 0, officialViewerCount: null, viewerCountFromDom: 3 }
    ];
    for (const s of snapshots) {
      const expected = concurrentEstimateIsSparseSignal({
        recentActiveUsers: typeof s.recentActiveUsers === 'number' ? s.recentActiveUsers : 0,
        officialViewerCount: s.officialViewerCount,
        viewerCountFromDom: s.viewerCountFromDom
      });
      expect(watchMetaConcurrentGateFromSnapshot(s).sparseConcurrent).toBe(expected);
    }
  });

  it('snapshot が null/undefined ならカード非表示・sparse', () => {
    expect(watchMetaConcurrentGateFromSnapshot(null)).toEqual({
      showConcurrent: false,
      sparseConcurrent: true
    });
    expect(watchMetaConcurrentGateFromSnapshot(undefined)).toEqual({
      showConcurrent: false,
      sparseConcurrent: true
    });
  });
});
