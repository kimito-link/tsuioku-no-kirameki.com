import { describe, it, expect } from 'vitest';
import {
  buildSessionSummaryMirrorSnapshot,
  restoreSessionSummaryMirror,
  SESSION_SUMMARY_MIRROR_ROWS_CAP
} from './sessionSummaryMirror.js';

const NOW = 1_000_000_000_000;

function row(over = {}) {
  return {
    capturedAt: NOW - 60000,
    commentStorageCount: 100,
    uniqueKnownCommenters: 20,
    giftUserCount: 3,
    peakConcurrentEstimate: 280,
    officialCommentCount: 95,
    ...over
  };
}

describe('buildSessionSummaryMirrorSnapshot', () => {
  it('rows を JSON-safe な鏡行に写す', () => {
    const snap = buildSessionSummaryMirrorSnapshot([row(), row({ commentStorageCount: 200 })], { liveId: 'LV1', nowMs: NOW });
    expect(snap.liveId).toBe('lv1');
    expect(snap.capturedAt).toBe(NOW);
    expect(snap.rows).toHaveLength(2);
    expect(snap.rows[0]).toEqual({
      capturedAt: NOW - 60000,
      commentStorageCount: 100,
      uniqueKnownCommenters: 20,
      giftUserCount: 3,
      peakConcurrentEstimate: 280,
      officialCommentCount: 95
    });
    expect(snap.rows[1].commentStorageCount).toBe(200);
  });

  it('null 許容フィールド(peak/official)は null を保つ', () => {
    const snap = buildSessionSummaryMirrorSnapshot([row({ peakConcurrentEstimate: null, officialCommentCount: null })], { liveId: 'lv1', nowMs: NOW });
    expect(snap.rows[0].peakConcurrentEstimate).toBe(null);
    expect(snap.rows[0].officialCommentCount).toBe(null);
  });

  it('cap(24)で頭打ち', () => {
    const many = Array.from({ length: 40 }, (_, i) => row({ commentStorageCount: i }));
    const snap = buildSessionSummaryMirrorSnapshot(many, { liveId: 'lv1', nowMs: NOW });
    expect(snap.rows).toHaveLength(SESSION_SUMMARY_MIRROR_ROWS_CAP);
  });

  it('rows 空/不正入力は null', () => {
    expect(buildSessionSummaryMirrorSnapshot([], { liveId: 'lv1' })).toBe(null);
    expect(buildSessionSummaryMirrorSnapshot(null)).toBe(null);
    expect(buildSessionSummaryMirrorSnapshot(undefined)).toBe(null);
  });

  it('HTML文字列を持ち込まない(structuredClone 可・storage 安全)', () => {
    const dirty = [row({ evil: () => {} })];
    const snap = buildSessionSummaryMirrorSnapshot(dirty, { liveId: 'lv1', nowMs: NOW });
    expect(() => structuredClone(snap)).not.toThrow();
    expect(snap.rows[0]).not.toHaveProperty('evil');
    expect(JSON.stringify(snap)).not.toContain('<');
  });

  it('負数は非負に正規化(nonNegInt)', () => {
    const snap = buildSessionSummaryMirrorSnapshot([row({ commentStorageCount: -5, giftUserCount: 2.9 })], { liveId: 'lv1' });
    expect(snap.rows[0].commentStorageCount).toBe(0);
    expect(snap.rows[0].giftUserCount).toBe(2);
  });
});

describe('restoreSessionSummaryMirror', () => {
  it('null-safe に復元し、buildSessionSummaryCompareTableHtml に食える形', async () => {
    const { buildSessionSummaryCompareTableHtml } = await import('./sessionSummaryCompareTableHtml.js');
    const snap = buildSessionSummaryMirrorSnapshot([row(), row({ officialCommentCount: null })], { liveId: 'lv1', nowMs: NOW });
    const r = restoreSessionSummaryMirror(snap);
    expect(r.rows).toHaveLength(2);
    const html = buildSessionSummaryCompareTableHtml(r.rows);
    expect(html).toContain('<table');
  });

  it('null/空は null', () => {
    expect(restoreSessionSummaryMirror(null)).toBe(null);
    expect(restoreSessionSummaryMirror({})).toBe(null);
    expect(restoreSessionSummaryMirror({ rows: [] })).toBe(null);
  });
});
