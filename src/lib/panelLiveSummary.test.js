import { describe, expect, it } from 'vitest';
import {
  buildPanelLiveSummary,
  isPanelLiveSummary,
  panelSummaryStorageKey,
  watchSnapshotFromPanelSummary
} from './panelLiveSummary.js';

describe('panelLiveSummary', () => {
  it('panelSummaryStorageKey', () => {
    expect(panelSummaryStorageKey('LV1')).toBe('nls_panel_summary_lv1');
  });

  it('buildPanelLiveSummary は来場・同接を載せる', () => {
    const s = buildPanelLiveSummary({
      liveId: 'lv99',
      recordedCount: 10,
      officialCount: 20,
      viewerCountFromDom: 100,
      concurrentEstimated: 12,
      recentActiveUsers: 3,
      streamAgeMin: 45,
      officialStatsUpdatedAt: 1_700_000_000_000,
      officialViewerIntervalMs: 60_000
    });
    expect(s.viewerCountFromDom).toBe(100);
    expect(s.concurrentEstimated).toBe(12);
    expect(s.recentActiveUsers).toBe(3);
    expect(s.streamAgeMin).toBe(45);
    expect(s.officialStatsUpdatedAt).toBe(1_700_000_000_000);
    expect(s.officialViewerIntervalMs).toBe(60_000);
    expect(isPanelLiveSummary(s, 'lv99')).toBe(true);
  });

  it('watchSnapshotFromPanelSummary', () => {
    const snap = watchSnapshotFromPanelSummary(
      buildPanelLiveSummary({
        liveId: 'lv1',
        officialCount: 50,
        viewerCountFromDom: 200,
        concurrentEstimated: 30,
        recentActiveUsers: 4,
        streamAgeMin: 120
      })
    );
    expect(snap?.officialCommentCount).toBe(50);
    expect(snap?.viewerCountFromDom).toBe(200);
    expect(snap?.recentActiveUsers).toBe(4);
    expect(snap?.streamAgeMin).toBe(120);
  });

  it('watchSnapshotFromPanelSummary は concurrentEstimated を recentActiveUsers に流さない', () => {
    const snap = watchSnapshotFromPanelSummary(
      buildPanelLiveSummary({
        liveId: 'lv1',
        viewerCountFromDom: 723,
        concurrentEstimated: 58,
        recentActiveUsers: 0,
        streamAgeMin: 420
      })
    );
    expect(snap?.recentActiveUsers).toBe(0);
    expect(snap?.streamAgeMin).toBe(420);
  });
});
