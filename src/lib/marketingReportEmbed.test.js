import { describe, expect, it } from 'vitest';
import {
  buildMarketingEmbedScriptInnerText,
  slimMarketingReportForHeavyEmbed
} from './marketingReportEmbed.js';

describe('marketingReportEmbed heavy slim', () => {
  it('slimMarketingReportForHeavyEmbed は allNumericCommenters を cap する', () => {
    const numeric = Array.from({ length: 300 }, (_, i) => ({
      userId: String(1000 + i),
      nickname: `u${i}`,
      count: 300 - i,
      avatarUrl: ''
    }));
    const slim = slimMarketingReportForHeavyEmbed(
      { liveId: 'lv1', topUsers: [], allNumericCommenters: numeric },
      { maxNumericCommenters: 200 }
    );
    expect(slim.allNumericCommenters).toHaveLength(200);
  });

  it('buildMarketingEmbedScriptInnerText に slimForHeavyExport フラグ', () => {
    const json = buildMarketingEmbedScriptInnerText(
      {
        liveId: 'lv350663807',
        topUsers: [],
        allNumericCommenters: Array.from({ length: 250 }, (_, i) => ({
          userId: String(i),
          nickname: 'n',
          count: 1
        }))
      },
      { slimForHeavyExport: true, maxNumericCommenters: 50 }
    );
    const parsed = JSON.parse(json);
    expect(parsed.slimForHeavyExport).toBe(true);
    expect(parsed.report.allNumericCommenters.length).toBe(50);
  });
});
