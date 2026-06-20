import { describe, it, expect } from 'vitest';
import {
  KEY_REPORT_PREVIEW,
  REPORT_PREVIEW_MAX_AGE_MS,
  buildReportPreviewRecord,
  isReportPreviewFresh
} from './reportPreviewKey.js';

describe('reportPreviewKey 定数', () => {
  it('キーは producer/consumer 共有の正本リテラル', () => {
    expect(KEY_REPORT_PREVIEW).toBe('nls_report_preview_v1');
    expect(REPORT_PREVIEW_MAX_AGE_MS).toBe(120_000);
  });
});

describe('buildReportPreviewRecord', () => {
  it('preview に at を付ける', () => {
    const rec = buildReportPreviewRecord({ liveId: 'lv1', totalComments: 10 }, 1000);
    expect(rec).toEqual({ liveId: 'lv1', totalComments: 10, at: 1000 });
  });

  it('null/非オブジェクトは null', () => {
    expect(buildReportPreviewRecord(null, 1000)).toBeNull();
    expect(buildReportPreviewRecord(undefined, 1000)).toBeNull();
    expect(buildReportPreviewRecord('x', 1000)).toBeNull();
  });

  it('nowMs が非数なら at=0', () => {
    const rec = buildReportPreviewRecord({ liveId: 'lv1' }, NaN);
    expect(rec.at).toBe(0);
  });
});

describe('isReportPreviewFresh', () => {
  it('maxAge 以内は fresh', () => {
    expect(isReportPreviewFresh({ at: 1000 }, 1000 + 60_000)).toBe(true);
    expect(isReportPreviewFresh({ at: 1000 }, 1000)).toBe(true);
  });

  it('maxAge 超過は stale', () => {
    expect(isReportPreviewFresh({ at: 1000 }, 1000 + 120_001)).toBe(false);
  });

  it('at 欠落/0/null は fresh でない', () => {
    expect(isReportPreviewFresh(null, 1000)).toBe(false);
    expect(isReportPreviewFresh({}, 1000)).toBe(false);
    expect(isReportPreviewFresh({ at: 0 }, 1000)).toBe(false);
  });

  it('maxAgeMs を上書きできる', () => {
    expect(isReportPreviewFresh({ at: 1000 }, 1000 + 5000, 1000)).toBe(false);
    expect(isReportPreviewFresh({ at: 1000 }, 1000 + 500, 1000)).toBe(true);
  });
});
