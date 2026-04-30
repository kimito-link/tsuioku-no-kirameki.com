import { describe, it, expect } from 'vitest';
import {
  buildCommenterFirstSecondLatency,
  detectTalentPeakMoments,
  scoreSentimentTimeline,
  suggestUniqueWords,
  computeReachCoefficient
} from './commenterCulturalAnalytics.js';

const t0 = Date.UTC(2026, 3, 30, 10, 0, 0);
function c(at, userId, text = 'x') {
  return { capturedAt: at, userId, text };
}

describe('buildCommenterFirstSecondLatency (L6)', () => {
  it('入力なし → distribution は全 0 / totalUsers=0', () => {
    const r = buildCommenterFirstSecondLatency([]);
    expect(r.totalUsers).toBe(0);
    expect(Object.values(r.distribution).every((v) => v === 0)).toBe(true);
  });

  it('各ユーザーの 1 コメ → 2 コメ目までの間隔を集計', () => {
    const r = buildCommenterFirstSecondLatency([
      c(t0, 'A'), c(t0 + 5_000, 'A'),         // 5 秒
      c(t0, 'B'), c(t0 + 60_000, 'B'),        // 60 秒
      c(t0, 'C')                               // C は 1 コメのみ → distribution 外
    ]);
    expect(r.totalUsers).toBe(2);
    expect(r.distribution['<10s']).toBe(1);
    expect(r.distribution['1-2m']).toBe(1);
  });

  it('順不同入力でも処理', () => {
    const r = buildCommenterFirstSecondLatency([
      c(t0 + 5_000, 'A'),
      c(t0, 'A')
    ]);
    expect(r.totalUsers).toBe(1);
  });
});

describe('detectTalentPeakMoments (L10 配信者の話芸ピーク)', () => {
  it('沈黙後 30 秒以内に 5+ コメ → 話芸ピーク候補', () => {
    const r = detectTalentPeakMoments([
      c(t0, 'A'),
      c(t0 + 90_000, 'B'),                   // 90 秒沈黙
      c(t0 + 91_000, 'C'),
      c(t0 + 92_000, 'D'),
      c(t0 + 93_000, 'E'),
      c(t0 + 94_000, 'F'),
      c(t0 + 95_000, 'G')
    ]);
    expect(r.length).toBe(1);
    expect(r[0].afterCount).toBeGreaterThanOrEqual(5);
  });

  it('沈黙後あんまりコメが来ない → 候補から外れる', () => {
    const r = detectTalentPeakMoments([
      c(t0, 'A'),
      c(t0 + 90_000, 'B'),
      c(t0 + 91_000, 'C')
    ]);
    expect(r.length).toBe(0);
  });

  it('沈黙が短い（60秒未満）→ 対象外', () => {
    const r = detectTalentPeakMoments([
      c(t0, 'A'),
      c(t0 + 30_000, 'B'),
      c(t0 + 31_000, 'C'),
      c(t0 + 32_000, 'D'),
      c(t0 + 33_000, 'E'),
      c(t0 + 34_000, 'F')
    ]);
    expect(r.length).toBe(0);
  });
});

describe('scoreSentimentTimeline (L11)', () => {
  it('ポジ/ネガ/驚き/困惑のキーワードを時系列で集計', () => {
    const r = scoreSentimentTimeline([
      c(t0, 'A', '楽しい'),
      c(t0 + 10_000, 'B', 'うれしい'),
      c(t0 + 20_000, 'C', 'つらい'),
      c(t0 + 30_000, 'D', 'マジ？'),
      c(t0 + 40_000, 'E', 'うーん')
    ], { bucketMs: 60_000 });
    expect(r.buckets.length).toBe(1);
    expect(r.buckets[0].positive).toBeGreaterThanOrEqual(2);
    expect(r.buckets[0].negative).toBeGreaterThanOrEqual(1);
    expect(r.buckets[0].surprise).toBeGreaterThanOrEqual(1);
  });

  it('辞書外の語は集計されない', () => {
    const r = scoreSentimentTimeline([
      c(t0, 'A', 'asdf')
    ]);
    expect(r.totals.positive).toBe(0);
    expect(r.totals.negative).toBe(0);
  });

  it('入力なし → 空', () => {
    expect(scoreSentimentTimeline([]).buckets).toEqual([]);
  });
});

describe('suggestUniqueWords (L14)', () => {
  it('全コメ頻出だが自コメに無い語 TOP N を返す', () => {
    const r = suggestUniqueWords({
      allComments: [
        { text: 'すごい' },
        { text: 'すごい' },
        { text: 'すごい' },
        { text: 'すごい' },
        { text: '草' },
        { text: '草' },
        { text: '草' }
      ],
      selfComments: [
        { text: '草' }
      ],
      topN: 5,
      minOccurrence: 3
    });
    // すごい は全体で 4 回出現、selfに無い → 提案
    // 草は self が使ってる → 除外
    expect(r.length).toBeGreaterThanOrEqual(1);
    const word = r.find((w) => w.word === 'すごい');
    expect(word).toBeDefined();
    expect(word.count).toBe(4);
  });

  it('入力なし → 空', () => {
    expect(suggestUniqueWords({ allComments: [], selfComments: [] })).toEqual([]);
  });
});

describe('computeReachCoefficient (L15)', () => {
  it('同接 / 5 分内ユニーク = リーチ係数', () => {
    const r = computeReachCoefficient({
      currentConcurrent: 200,
      uniqueCommentersInWindow: 50
    });
    expect(r.coefficient).toBe(4);
  });

  it('uniqueCommenters が 0 → null', () => {
    const r = computeReachCoefficient({
      currentConcurrent: 100,
      uniqueCommentersInWindow: 0
    });
    expect(r.coefficient).toBeNull();
  });

  it('値 negative や NaN → null', () => {
    expect(computeReachCoefficient({ currentConcurrent: -1, uniqueCommentersInWindow: 10 }).coefficient).toBeNull();
    expect(computeReachCoefficient({ currentConcurrent: NaN, uniqueCommentersInWindow: 10 }).coefficient).toBeNull();
  });

  it('null 入力 → null', () => {
    expect(computeReachCoefficient(null).coefficient).toBeNull();
  });
});
