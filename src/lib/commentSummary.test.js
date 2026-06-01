import { describe, it, expect } from 'vitest';
import {
  summaryStorageKey,
  normalizeSummaryRecentRows,
  buildCommentSummary,
  isCommentSummary,
  SUMMARY_RECENT_ROWS_MAX,
  COMMENT_SUMMARY_VERSION
} from './commentSummary.js';

describe('summaryStorageKey', () => {
  it('別接頭辞 nls_csummary_ を使い、trim + 小文字化する', () => {
    expect(summaryStorageKey('LV123')).toBe('nls_csummary_lv123');
    expect(summaryStorageKey('  LV99 ')).toBe('nls_csummary_lv99');
  });

  it('nls_comments_lv* 列挙とは衝突しない接頭辞である', () => {
    expect(summaryStorageKey('lv1').startsWith('nls_comments_')).toBe(false);
    expect(summaryStorageKey('lv1').startsWith('nls_comments_lv')).toBe(false);
  });
});

describe('normalizeSummaryRecentRows', () => {
  it('末尾（新しい側）から最大件数だけ採用する', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ text: `c${i}`, commentNo: String(i) }));
    const out = normalizeSummaryRecentRows(rows, 30);
    expect(out.length).toBe(30);
    expect(out[0].text).toBe('c20');
    expect(out[29].text).toBe('c49');
  });

  it('表示に使う最小フィールドだけ残す（未知フィールドは落とす）', () => {
    const out = normalizeSummaryRecentRows([
      {
        text: ' やぁ ',
        userId: 'u1',
        capturedAt: 1000,
        commentNo: '7',
        name: 'みけ',
        selfPosted: true,
        avatar: 'data:img',
        liveId: 'lv1',
        lvId: 'lv1',
        no: 7,
        bloat: 'x'.repeat(9999),
        nested: { huge: true }
      }
    ]);
    expect(out).toHaveLength(1);
    const r = out[0];
    expect(r.text).toBe('やぁ');
    expect(r.userId).toBe('u1');
    expect(r.commentNo).toBe('7');
    expect(r.name).toBe('みけ');
    expect(r.selfPosted).toBe(true);
    expect('bloat' in r).toBe(false);
    expect('nested' in r).toBe(false);
  });

  it('空テキスト・非オブジェクトは除外', () => {
    const out = normalizeSummaryRecentRows([
      { text: '   ' },
      null,
      42,
      { text: 'ok' }
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('ok');
  });

  it('非配列は空配列', () => {
    expect(normalizeSummaryRecentRows(null)).toEqual([]);
    expect(normalizeSummaryRecentRows(undefined)).toEqual([]);
    expect(normalizeSummaryRecentRows('x')).toEqual([]);
  });

  it('max 未指定は SUMMARY_RECENT_ROWS_MAX を使う', () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ text: `c${i}` }));
    expect(normalizeSummaryRecentRows(rows).length).toBe(SUMMARY_RECENT_ROWS_MAX);
  });
});

describe('buildCommentSummary', () => {
  it('最小限のフィールドを持つサマリを作る', () => {
    const s = buildCommentSummary({
      liveId: 'LV5',
      recordedCount: 12345,
      officialCount: 12500,
      lastIngestAt: 1700000000000,
      recentRows: [{ text: 'a' }, { text: 'b' }],
      nowMs: 1700000001000
    });
    expect(s.v).toBe(COMMENT_SUMMARY_VERSION);
    expect(s.liveId).toBe('lv5');
    expect(s.recordedCount).toBe(12345);
    expect(s.officialCount).toBe(12500);
    expect(s.lastIngestAt).toBe(1700000000000);
    expect(s.updatedAt).toBe(1700000001000);
    expect(s.recent.map((r) => r.text)).toEqual(['a', 'b']);
  });

  it('officialCount / lastIngestAt が無効なら null', () => {
    const s = buildCommentSummary({ liveId: 'lv1', recordedCount: 10 });
    expect(s.officialCount).toBeNull();
    expect(s.lastIngestAt).toBeNull();
  });

  it('recordedCount は非負整数に丸める（負・NaN は 0）', () => {
    expect(buildCommentSummary({ recordedCount: -5 }).recordedCount).toBe(0);
    expect(buildCommentSummary({ recordedCount: 3.9 }).recordedCount).toBe(3);
    expect(buildCommentSummary({}).recordedCount).toBe(0);
  });
});

describe('isCommentSummary', () => {
  it('正しいサマリは true', () => {
    const s = buildCommentSummary({ liveId: 'lv1', recordedCount: 5 });
    expect(isCommentSummary(s)).toBe(true);
    expect(isCommentSummary(s, 'lv1')).toBe(true);
    expect(isCommentSummary(s, 'LV1')).toBe(true);
  });

  it('liveId 不一致・破損・旧形式は false', () => {
    const s = buildCommentSummary({ liveId: 'lv1', recordedCount: 5 });
    expect(isCommentSummary(s, 'lv2')).toBe(false);
    expect(isCommentSummary(null)).toBe(false);
    expect(isCommentSummary({})).toBe(false);
    expect(isCommentSummary({ v: 999, recordedCount: 5, recent: [] })).toBe(false);
    expect(isCommentSummary({ v: 1, recordedCount: 'x', recent: [] })).toBe(false);
    expect(isCommentSummary({ v: 1, recordedCount: 5, recent: 'no' })).toBe(false);
  });
});
