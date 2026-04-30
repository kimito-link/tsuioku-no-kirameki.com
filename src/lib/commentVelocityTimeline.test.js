import { describe, it, expect } from 'vitest';
import {
  buildCommentVelocityTimeline,
  buildLaughterDensityTimeline,
  isLaughterText
} from './commentVelocityTimeline.js';

const t0 = Date.UTC(2026, 3, 30, 10, 0, 0);
function c(at, text = 'x') {
  return { capturedAt: at, text };
}

describe('buildCommentVelocityTimeline', () => {
  it('空配列 → 空 buckets', () => {
    const r = buildCommentVelocityTimeline([], { bucketMs: 60_000 });
    expect(r.buckets).toEqual([]);
    expect(r.peakValue).toBe(0);
  });

  it('1分粒度: 0-1分=3コメ / 1-2分=1コメ', () => {
    const r = buildCommentVelocityTimeline([
      c(t0),
      c(t0 + 10_000),
      c(t0 + 30_000),
      c(t0 + 65_000)
    ], { bucketMs: 60_000 });
    expect(r.buckets.length).toBe(2);
    expect(r.buckets[0].minute).toBe(0);
    expect(r.buckets[0].count).toBe(3);
    expect(r.buckets[1].count).toBe(1);
    expect(r.peakValue).toBe(3);
  });

  it('rolling 5min: 各 bucket は前4分含む 5分窓の平均', () => {
    // 5分間で 50 コメ → 各分平均 10
    const cs = [];
    for (let i = 0; i < 50; i++) {
      cs.push(c(t0 + (i * 6000))); // 6 sec間隔 → 5分 = 50コメ
    }
    const r = buildCommentVelocityTimeline(cs, {
      bucketMs: 60_000,
      rollingWindowMin: 5
    });
    // 4分目以降の rolling は ~10 を期待
    expect(r.buckets[4].rolling5).toBeCloseTo(10, 0);
  });

  it('peak は max bucket', () => {
    const r = buildCommentVelocityTimeline([
      c(t0),
      c(t0 + 60_000),
      c(t0 + 60_001),
      c(t0 + 60_002),
      c(t0 + 120_000)
    ], { bucketMs: 60_000 });
    // bucket 1 = 3 コメ
    expect(r.peakValue).toBe(3);
    expect(r.peakMinute).toBe(1);
  });

  it('順不同入力でも対応', () => {
    const r = buildCommentVelocityTimeline([
      c(t0 + 70_000),
      c(t0)
    ], { bucketMs: 60_000 });
    expect(r.buckets.length).toBe(2);
  });

  it('破損 capturedAt 除外', () => {
    const r = buildCommentVelocityTimeline([
      c(t0),
      { capturedAt: NaN, text: 'bad' }
    ], { bucketMs: 60_000 });
    expect(r.buckets.length).toBe(1);
  });
});

describe('isLaughterText', () => {
  it.each([
    ['ww'],
    ['ｗｗｗ'],
    ['草'],
    ['草ァ！'],
    ['草不可避'],
    ['8888'],
    ['8888888'],
    ['爆笑'],
    ['ワロタ'],
    ['ｗｗｗｗｗ'],
    ['ｗｗｗｗｗｗｗ'],
    ['(笑)'],
    ['（笑）'],
    ['なんだそれwww']
  ])('%s は笑い系', (t) => {
    expect(isLaughterText(t)).toBe(true);
  });

  it.each([
    ['hello'],
    ['ありがとう'],
    ['w'],          // 1 文字の w は曖昧（タイポの可能性）→ false
    ['ｗ'],          // 1 文字も曖昧
    ['8'],          // 1 桁の 8 だけは普通の数字
    ['78'],         // "8" 含むが "8888" パターンではない
    [''],
    ['草薙'],         // 草で始まるが固有名詞っぽい
    ['ぐさり']
  ])('%s は笑い系ではない', (t) => {
    expect(isLaughterText(t)).toBe(false);
  });
});

describe('buildLaughterDensityTimeline (L4 アヘ顔密度)', () => {
  it('空配列 → 空', () => {
    const r = buildLaughterDensityTimeline([], { bucketMs: 30_000 });
    expect(r.buckets).toEqual([]);
  });

  it('30秒粒度: 笑い系コメだけ数える / 比率も出す', () => {
    const r = buildLaughterDensityTimeline([
      c(t0, '8888'),
      c(t0 + 5_000, 'wwww'),
      c(t0 + 10_000, 'ふつうのコメント'),
      c(t0 + 35_000, '草'),
      c(t0 + 40_000, '普通')
    ], { bucketMs: 30_000 });
    // 0-30 sec: 3 件中 2 件笑い → density=2、ratio=2/3
    // 30-60 sec: 2 件中 1 件笑い → density=1、ratio=0.5
    expect(r.buckets[0].count).toBe(2);
    expect(r.buckets[0].total).toBe(3);
    expect(r.buckets[0].ratio).toBeCloseTo(2 / 3, 2);
    expect(r.buckets[1].count).toBe(1);
    expect(r.buckets[1].ratio).toBe(0.5);
  });

  it('peak と全体笑い比率', () => {
    const r = buildLaughterDensityTimeline([
      c(t0, '草'),
      c(t0 + 5_000, '草'),
      c(t0 + 10_000, '普通')
    ], { bucketMs: 30_000 });
    expect(r.peakBucket).toBe(0);
    expect(r.totalLaughter).toBe(2);
    expect(r.totalCount).toBe(3);
    expect(r.overallRatio).toBeCloseTo(2 / 3, 2);
  });
});
