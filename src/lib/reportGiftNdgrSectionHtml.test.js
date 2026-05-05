import { describe, it, expect } from 'vitest';
import {
  buildReportGiftNdgrSectionHtml,
  DEFAULT_REPORT_GIFT_TABLE_MAX
} from './reportGiftNdgrSectionHtml.js';

describe('buildReportGiftNdgrSectionHtml', () => {
  it('行が無ければ空文字', () => {
    expect(buildReportGiftNdgrSectionHtml([])).toBe('');
    expect(buildReportGiftNdgrSectionHtml(null)).toBe('');
  });

  it('1 行で sec-gifts とテーブルを含む', () => {
    const html = buildReportGiftNdgrSectionHtml([
      { userId: '123', nickname: 'テスト', throwCount: 5, capturedAt: 0 }
    ]);
    expect(html).toContain('id="sec-gifts"');
    expect(html).toContain('report-gift-table');
    expect(html).toContain('テスト');
    expect(html).toContain('>5<');
    expect(html).toContain('—');
    expect(html).not.toContain('<script');
  });

  it('maxRows で切り詰め注記が付く', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      userId: `u${i}`,
      nickname: '',
      throwCount: 1,
      capturedAt: 0
    }));
    const html = buildReportGiftNdgrSectionHtml(rows, { maxRows: 3 });
    expect(html).toContain('最大 3 行');
    expect(html).toContain('全 5 ユーザー');
  });

  it('DEFAULT は marketing より大きい上限', () => {
    expect(DEFAULT_REPORT_GIFT_TABLE_MAX).toBeGreaterThan(200);
  });
});
