/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import {
  HTML_REPORT_COMMENTS_TABLE_INITIAL_ROWS,
  HTML_REPORT_HEAVY_COMMENT_THRESHOLD,
  buildReportCommentTableRowHtml,
  buildReportCommentsTableSectionHtml
} from './reportCommentsTableSection.js';

const formatDateTime = (ms) => (ms > 0 ? `2026-01-01T00:00:00+09:00` : '-');

describe('reportCommentsTableSection', () => {
  it('初期行数を超えるコメントは折りたたみ + overflow JSON を出す', () => {
    const comments = Array.from({ length: 120 }, (_, i) => ({
      commentNo: String(i + 1),
      userId: '12345',
      nickname: 'tester',
      text: `comment-${i + 1}`,
      capturedAt: 1_700_000_000_000 + i
    }));
    const html = buildReportCommentsTableSectionHtml({
      comments,
      userKeyToResolvedThumb: new Map([['12345', 'https://example.com/a.jpg']]),
      formatDateTime,
      reportCommentsCsv: 'csv-body'
    });
    expect(html).toContain('id="sec-all-comments"');
    expect(html).toContain('nl-report-comments-overflow-v1');
    expect(html).toContain('残り 40 件を表示');
    expect(html).toContain('先頭 80 件');
    const rowMatches = html.match(/class="search-item nl-comment-row"/g) || [];
    expect(rowMatches.length).toBe(HTML_REPORT_COMMENTS_TABLE_INITIAL_ROWS);
  });

  it('heavy 閾値超えでは CSV 埋め込みと overflow JSON を省略する', () => {
    const n = HTML_REPORT_HEAVY_COMMENT_THRESHOLD + 50;
    const comments = Array.from({ length: n }, (_, i) => ({
      commentNo: String(i + 1),
      userId: '1',
      text: `c-${i}`,
      capturedAt: 1
    }));
    const html = buildReportCommentsTableSectionHtml({
      comments,
      userKeyToResolvedThumb: new Map(),
      formatDateTime,
      reportCommentsCsv: 'SHOULD-NOT-APPEAR'
    });
    expect(html).toContain('nl-report-comments-heavy-note');
    expect(html).not.toContain('nlReportCsvData');
    expect(html).not.toContain('SHOULD-NOT-APPEAR');
    expect(html).not.toContain('nl-report-comments-overflow-v1');
  });

  it('80件以下なら展開ボタンなし', () => {
    const html = buildReportCommentsTableSectionHtml({
      comments: [{ commentNo: '1', userId: '99', text: 'hi', capturedAt: 1 }],
      userKeyToResolvedThumb: new Map(),
      formatDateTime,
      reportCommentsCsv: 'csv'
    });
    expect(html).not.toContain('nl-report-comments-more-btn');
    expect(html).not.toContain('nl-report-comments-overflow-v1');
  });

  it('行 HTML にサムネと search-item を付ける', () => {
    const row = buildReportCommentTableRowHtml(
      { commentNo: '7', userId: '555', nickname: 'alpha', text: 'hello', capturedAt: 1000 },
      0,
      {
        userKeyToResolvedThumb: new Map([['555', 'https://example.com/x.png']]),
        formatDateTime,
        includeInSearch: true
      }
    );
    expect(row).toContain('search-item');
    expect(row).toContain('report-comment-av');
    expect(row).toContain('hello');
  });
});
