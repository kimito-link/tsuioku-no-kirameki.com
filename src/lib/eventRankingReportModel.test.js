import { describe, it, expect } from 'vitest';
import {
  buildEventRankingReportModel,
  EVENT_RANKING_REPORT_MAX_ROWS,
  EVENT_RANKING_REPORT_STALE_MS
} from './eventRankingReportModel.js';

const NOW = 1_700_000_000_000;

function raw() {
  return {
    rows: [
      { rank: 1, score: 4968400, name: 'あめ！', isAnonymous: false, thumbnailUrl: 'https://example.test/a.jpg' },
      { rank: 2, score: 3453400, name: 'この', isAnonymous: false, thumbnailUrl: 'https://example.test/k.jpg', userId: '95461894' },
      { rank: 3, score: 2825600, name: 'ぴとな', isAnonymous: false, thumbnailUrl: '' }
    ],
    selfStatus: { rank: 2, score: 3453400, diffToNext: 1515000, eventName: '横浜DeNA…始球式オーディション', broadcasterName: 'この' },
    capturedAt: NOW - 1000,
    liveId: 'lv1'
  };
}

describe('buildEventRankingReportModel', () => {
  it('null/非object は null', () => {
    expect(buildEventRankingReportModel(null)).toBeNull();
    expect(buildEventRankingReportModel(undefined)).toBeNull();
    expect(buildEventRankingReportModel([])).toBeNull();
    expect(buildEventRankingReportModel('x')).toBeNull();
  });

  it('正常: rows / self / eventName / 古さを正規化', () => {
    const m = buildEventRankingReportModel(raw(), { nowMs: NOW });
    expect(m).not.toBeNull();
    expect(m?.rows).toHaveLength(3);
    expect(m?.rows[0]).toMatchObject({ rank: 1, score: 4968400, name: 'あめ！' });
    expect(m?.rows[1]).toMatchObject({ rank: 2, name: 'この', userId: '95461894' });
    expect(m?.self).toMatchObject({ rank: 2, score: 3453400, diffToNext: 1515000, broadcasterName: 'この' });
    expect(m?.eventName).toBe('横浜DeNA…始球式オーディション');
    expect(m?.isStale).toBe(false);
    expect(m?.ageMs).toBe(1000);
  });

  it('サムネは http/https のみ通す（data:/javascript: は空に）', () => {
    const m = buildEventRankingReportModel({
      rows: [
        { rank: 1, score: 100, name: 'A', thumbnailUrl: 'javascript:alert(1)' },
        { rank: 2, score: 50, name: 'B', thumbnailUrl: 'data:image/svg+xml,<svg onload=alert(1)>' },
        { rank: 3, score: 25, name: 'C', thumbnailUrl: 'https://ok.test/c.jpg' }
      ]
    }, { nowMs: NOW });
    expect(m?.rows[0].thumbnailUrl).toBe('');
    expect(m?.rows[1].thumbnailUrl).toBe('');
    expect(m?.rows[2].thumbnailUrl).toBe('https://ok.test/c.jpg');
  });

  it('順位/スコア未確定の行は落とす（誤値ゼロ）', () => {
    const m = buildEventRankingReportModel({
      rows: [
        { rank: 1, score: 100, name: 'A' },
        { rank: 0, score: 50, name: 'bad-rank' },        // rank<=0 → 落とす
        { rank: 2, name: 'no-score' },                    // score 無し → 落とす
        { score: 30, name: 'no-rank' }                    // rank 無し → 落とす
      ]
    }, { nowMs: NOW });
    expect(m?.rows).toHaveLength(1);
    expect(m?.rows[0].name).toBe('A');
  });

  it('rows は rank 昇順にソート、最大10件', () => {
    const many = [];
    for (let i = 15; i >= 1; i--) many.push({ rank: i, score: i * 10, name: 'u' + i });
    const m = buildEventRankingReportModel({ rows: many }, { nowMs: NOW });
    expect(m?.rows).toHaveLength(EVENT_RANKING_REPORT_MAX_ROWS);
    expect(m?.rows[0].rank).toBe(1);
    expect(m?.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('名前空/未設定は「名無し」+ isAnonymous', () => {
    const m = buildEventRankingReportModel({
      rows: [{ rank: 1, score: 100, name: '' }]
    }, { nowMs: NOW });
    expect(m?.rows[0].name).toBe('名無し');
    expect(m?.rows[0].isAnonymous).toBe(true);
  });

  it('capturedAt が古いと isStale=true', () => {
    const m = buildEventRankingReportModel(
      { rows: [{ rank: 1, score: 100, name: 'A' }], capturedAt: NOW - EVENT_RANKING_REPORT_STALE_MS - 1 },
      { nowMs: NOW }
    );
    expect(m?.isStale).toBe(true);
  });

  it('eventName は selfStatus 優先、無ければ top-level', () => {
    const m1 = buildEventRankingReportModel({ rows: [{ rank: 1, score: 1, name: 'A' }], selfStatus: { eventName: 'S' }, eventName: 'T' }, { nowMs: NOW });
    expect(m1?.eventName).toBe('S');
    const m2 = buildEventRankingReportModel({ rows: [{ rank: 1, score: 1, name: 'A' }], eventName: 'T' }, { nowMs: NOW });
    expect(m2?.eventName).toBe('T');
  });

  it('rows 空 + self 無 + eventName 無 は null（イベント不参加）', () => {
    expect(buildEventRankingReportModel({ rows: [], capturedAt: NOW }, { nowMs: NOW })).toBeNull();
  });

  it('rows 空でも self か eventName があればモデルを返す', () => {
    const m = buildEventRankingReportModel({ rows: [], selfStatus: { rank: 5, eventName: 'E' } }, { nowMs: NOW });
    expect(m).not.toBeNull();
    expect(m?.self?.rank).toBe(5);
    expect(m?.eventName).toBe('E');
  });
});
