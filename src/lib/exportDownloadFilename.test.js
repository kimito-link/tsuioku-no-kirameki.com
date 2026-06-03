import { describe, expect, it } from 'vitest';
import {
  buildHtmlReportDownloadFilename,
  buildMarketingReportDownloadFilename,
  formatBroadcastDateYmdJst,
  resolveBroadcastStartMs,
  sanitizeLiveIdForFilename
} from './exportDownloadFilename.js';

describe('exportDownloadFilename', () => {
  it('formatBroadcastDateYmdJst は JST の YYYY-MM-DD', () => {
    const ms = Date.UTC(2026, 5, 1, 15, 0, 0);
    expect(formatBroadcastDateYmdJst(ms)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('resolveBroadcastStartMs は最古 capturedAt を優先', () => {
    const ms = resolveBroadcastStartMs({
      comments: [
        { capturedAt: 1_700_000_000_000 },
        { capturedAt: 1_700_000_100_000 }
      ],
      nowMs: 9_999_999_999_999
    });
    expect(ms).toBe(1_700_000_000_000);
  });

  it('buildHtmlReportDownloadFilename', () => {
    const name = buildHtmlReportDownloadFilename('lv350663807', {
      comments: [{ capturedAt: Date.UTC(2026, 5, 1, 12, 0, 0) }]
    });
    expect(name).toMatch(/_lv350663807\.html$/);
    expect(name).not.toContain('nicolivelog');
    expect(name).not.toMatch(/\d{13}/);
  });

  it('buildMarketingReportDownloadFilename', () => {
    const name = buildMarketingReportDownloadFilename('LV350663807', {
      comments: [{ capturedAt: 1_700_000_000_000 }]
    });
    expect(name).toMatch(/_lv350663807_marketing\.html$/);
  });

  it('sanitizeLiveIdForFilename は危険文字を除去', () => {
    expect(sanitizeLiveIdForFilename('lv/../x')).toBe('lvx');
  });
});
