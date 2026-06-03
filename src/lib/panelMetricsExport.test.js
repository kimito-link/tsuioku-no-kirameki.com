import { describe, expect, it } from 'vitest';
import { buildPanelLiveSummary } from './panelLiveSummary.js';
import {
  buildPanelMetricsResponse,
  PANEL_METRICS_MESSAGE_TYPE,
  resolvePanelMetricsFromMessageResponse
} from './panelMetricsExport.js';

describe('panelMetricsExport', () => {
  it('PANEL_METRICS_MESSAGE_TYPE', () => {
    expect(PANEL_METRICS_MESSAGE_TYPE).toBe('NLS_EXPORT_PANEL_METRICS');
  });

  it('buildPanelMetricsResponse / resolvePanelMetricsFromMessageResponse', () => {
    const payload = buildPanelLiveSummary({
      liveId: 'lv42',
      recordedCount: 8806,
      officialCount: 8724,
      viewerCountFromDom: 100,
      concurrentEstimated: 12
    });
    const res = buildPanelMetricsResponse(payload);
    expect(res.ok).toBe(true);
    const metrics = resolvePanelMetricsFromMessageResponse(res, 'lv42');
    expect(metrics?.recordedCount).toBe(8806);
    expect(resolvePanelMetricsFromMessageResponse(res, 'lv99')).toBeNull();
  });
});
