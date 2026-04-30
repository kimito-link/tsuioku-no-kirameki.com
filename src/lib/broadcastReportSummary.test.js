import { describe, it, expect } from 'vitest';
import {
  summarizeBroadcastTiming,
  summarizeCommentBodyStats,
  summarizeIdentifierStats
} from './broadcastReportSummary.js';

const t0 = Date.UTC(2026, 3, 30, 10, 0, 0);

function c(opts) {
  return {
    capturedAt: opts.at,
    text: opts.text || '',
    userId: opts.userId == null ? '' : String(opts.userId),
    selfPosted: !!opts.selfPosted
  };
}

describe('summarizeBroadcastTiming', () => {
  it('コメント 0 件 → first/last/duration は null / 0', () => {
    const r = summarizeBroadcastTiming({ snapshot: null, comments: [] });
    expect(r.firstCapturedAt).toBeNull();
    expect(r.lastCapturedAt).toBeNull();
    expect(r.durationMs).toBe(0);
    expect(r.durationMinutes).toBe(0);
    expect(r.commentsPerMinute).toBe(0);
    expect(r.broadcasterLevel).toBeNull();
  });

  it('snapshot から broadcasterLevel を読む', () => {
    const r = summarizeBroadcastTiming({
      snapshot: { broadcasterLevel: 42 },
      comments: []
    });
    expect(r.broadcasterLevel).toBe(42);
  });

  it('broadcasterLevel が 0 や負値は null', () => {
    expect(
      summarizeBroadcastTiming({ snapshot: { broadcasterLevel: 0 }, comments: [] })
        .broadcasterLevel
    ).toBeNull();
    expect(
      summarizeBroadcastTiming({ snapshot: { broadcasterLevel: -3 }, comments: [] })
        .broadcasterLevel
    ).toBeNull();
  });

  it('first/last は capturedAt の min / max（順不同入力でも安定）', () => {
    const comments = [
      c({ at: t0 + 60_000, text: 'mid' }),
      c({ at: t0 + 120_000, text: 'late' }),
      c({ at: t0, text: 'first' })
    ];
    const r = summarizeBroadcastTiming({ snapshot: null, comments });
    expect(r.firstCapturedAt).toBe(t0);
    expect(r.lastCapturedAt).toBe(t0 + 120_000);
    expect(r.durationMs).toBe(120_000);
    expect(r.durationMinutes).toBe(2);
  });

  it('CPM = 件数 / durationMinutes（small-burst でも 1 分扱い）', () => {
    const comments = [
      c({ at: t0 }),
      c({ at: t0 + 30_000 }),
      c({ at: t0 + 45_000 })
    ];
    const r = summarizeBroadcastTiming({ snapshot: null, comments });
    expect(r.durationMinutes).toBeCloseTo(0.75, 2);
    // CPM = 3 / 0.75 = 4
    expect(r.commentsPerMinute).toBe(4);
  });

  it('1 件だけのコメント → first=last / duration=0 / CPM=0', () => {
    const r = summarizeBroadcastTiming({
      snapshot: null,
      comments: [c({ at: t0 })]
    });
    expect(r.durationMs).toBe(0);
    expect(r.commentsPerMinute).toBe(0);
  });

  it('破損 capturedAt（NaN/string/0）は除外して扱う', () => {
    const comments = [
      c({ at: t0 }),
      { capturedAt: NaN, text: 'bad', userId: '' },
      { capturedAt: 'abc', text: 'bad', userId: '' },
      { capturedAt: 0, text: 'zero', userId: '' },
      c({ at: t0 + 60_000 })
    ];
    const r = summarizeBroadcastTiming({ snapshot: null, comments });
    expect(r.firstCapturedAt).toBe(t0);
    expect(r.lastCapturedAt).toBe(t0 + 60_000);
  });
});

describe('summarizeCommentBodyStats', () => {
  it('空配列 → 0', () => {
    const r = summarizeCommentBodyStats([]);
    expect(r.totalCount).toBe(0);
    expect(r.totalChars).toBe(0);
    expect(r.averageChars).toBe(0);
    expect(r.medianChars).toBe(0);
    expect(r.maxChars).toBe(0);
  });

  it('合計・平均・中央値・最大を返す', () => {
    const r = summarizeCommentBodyStats([
      c({ at: t0, text: 'ab' }),       // 2
      c({ at: t0, text: 'abc' }),      // 3
      c({ at: t0, text: 'abcdef' }),   // 6
      c({ at: t0, text: 'a' })         // 1
    ]);
    expect(r.totalCount).toBe(4);
    expect(r.totalChars).toBe(12);
    expect(r.averageChars).toBe(3);
    // sorted: [1,2,3,6] → median = (2+3)/2 = 2.5
    expect(r.medianChars).toBe(2.5);
    expect(r.maxChars).toBe(6);
  });

  it('text=undefined は 0 字扱い', () => {
    const r = summarizeCommentBodyStats([
      { capturedAt: t0, userId: '' },
      c({ at: t0, text: 'x' })
    ]);
    expect(r.totalCount).toBe(2);
    expect(r.totalChars).toBe(1);
  });
});

describe('summarizeIdentifierStats', () => {
  it('数値 ID / 184（"a:..."）/ 自コメ / それ以外 を分類', () => {
    const r = summarizeIdentifierStats([
      c({ at: t0, userId: '12345' }),
      c({ at: t0, userId: '67890' }),
      c({ at: t0, userId: 'a:abc' }),
      c({ at: t0, userId: 'a:def' }),
      c({ at: t0, userId: 'a:ghi' }),
      c({ at: t0, userId: '99999', selfPosted: true })
    ]);
    expect(r.totalCount).toBe(6);
    expect(r.numericIdCount).toBe(3); // includes self-posted numeric
    expect(r.anonymous184Count).toBe(3);
    expect(r.selfPostedCount).toBe(1);
    expect(r.otherCount).toBe(0);
    // 184 比率 = 3/6 = 50%
    expect(r.anonymous184Ratio).toBe(0.5);
    // 数値 ID 比率 = 3/6 = 50%
    expect(r.numericIdRatio).toBe(0.5);
  });

  it('userId 空 / null は other 扱い', () => {
    const r = summarizeIdentifierStats([
      { capturedAt: t0, text: '', userId: '' },
      { capturedAt: t0, text: '', userId: null }
    ]);
    expect(r.totalCount).toBe(2);
    expect(r.otherCount).toBe(2);
    expect(r.anonymous184Ratio).toBe(0);
    expect(r.numericIdRatio).toBe(0);
  });

  it('空配列 → ratio は 0', () => {
    const r = summarizeIdentifierStats([]);
    expect(r.totalCount).toBe(0);
    expect(r.anonymous184Ratio).toBe(0);
    expect(r.numericIdRatio).toBe(0);
  });

  it('selfPosted は true のときだけカウント（truthy 判定）', () => {
    const r = summarizeIdentifierStats([
      { capturedAt: t0, text: '', userId: '1', selfPosted: true },
      { capturedAt: t0, text: '', userId: '2', selfPosted: 1 },
      { capturedAt: t0, text: '', userId: '3', selfPosted: 0 },
      { capturedAt: t0, text: '', userId: '4' }
    ]);
    // truthy 判定で 1 (boolean) と 1 (number) 両方カウント
    expect(r.selfPostedCount).toBe(2);
  });
});
