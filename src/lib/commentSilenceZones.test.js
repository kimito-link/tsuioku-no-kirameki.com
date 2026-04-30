import { describe, it, expect } from 'vitest';
import { detectCommentSilenceZones } from './commentSilenceZones.js';

const t0 = Date.UTC(2026, 3, 30, 10, 0, 0);
function c(at, text = 'x') {
  return { capturedAt: at, text };
}

describe('detectCommentSilenceZones', () => {
  it('空配列 → 空ゾーン', () => {
    const r = detectCommentSilenceZones([], { thresholdMs: 60_000 });
    expect(r).toEqual([]);
  });

  it('1 件しか無い → 沈黙判定不能で空', () => {
    const r = detectCommentSilenceZones([c(t0)], { thresholdMs: 60_000 });
    expect(r).toEqual([]);
  });

  it('60秒未満の間隔は沈黙判定しない', () => {
    const r = detectCommentSilenceZones([
      c(t0),
      c(t0 + 30_000),
      c(t0 + 50_000)
    ], { thresholdMs: 60_000 });
    expect(r).toEqual([]);
  });

  it('60秒以上の間隔があれば 1 ゾーンとして検出', () => {
    const r = detectCommentSilenceZones([
      c(t0, 'before'),
      c(t0 + 90_000, 'after')
    ], { thresholdMs: 60_000 });
    expect(r.length).toBe(1);
    expect(r[0].startAt).toBe(t0);
    expect(r[0].endAt).toBe(t0 + 90_000);
    expect(r[0].durationMs).toBe(90_000);
  });

  it('複数の沈黙ゾーンが正しく検出される', () => {
    const r = detectCommentSilenceZones([
      c(t0),
      c(t0 + 70_000),       // 70 秒沈黙 #1
      c(t0 + 80_000),       // 10 秒（沈黙ではない）
      c(t0 + 200_000)       // 120 秒沈黙 #2
    ], { thresholdMs: 60_000 });
    expect(r.length).toBe(2);
    expect(r[0].durationMs).toBe(70_000);
    expect(r[1].durationMs).toBe(120_000);
  });

  it('quality 判定: 沈黙後 30秒以内に 5 コメ以上 → "engaged"（ガン見系・話芸ピーク候補）', () => {
    const before = [c(t0, 'b1'), c(t0 + 5_000, 'b2'), c(t0 + 10_000, 'b3')];
    const longGap = c(t0 + 90_000, 'longgap');  // 80秒沈黙
    // 沈黙後 30秒以内に 5+ コメ
    const after = [
      c(t0 + 91_000, 'a1'),
      c(t0 + 95_000, 'a2'),
      c(t0 + 100_000, 'a3'),
      c(t0 + 105_000, 'a4'),
      c(t0 + 110_000, 'a5'),
      c(t0 + 115_000, 'a6')
    ];
    const r = detectCommentSilenceZones(
      [...before, longGap, ...after],
      { thresholdMs: 60_000, quality: { windowMs: 30_000 } }
    );
    expect(r.length).toBe(1);
    expect(r[0].quality).toBe('engaged');
    expect(r[0].afterCount).toBeGreaterThanOrEqual(5);
  });

  it('quality 判定: 沈黙後 30秒以内に 0-1 コメ → "departed"（離脱系）', () => {
    const r = detectCommentSilenceZones([
      c(t0, 'b'),
      c(t0 + 90_000, 'after'),
      c(t0 + 600_000, 'much later')   // 沈黙後の 30秒には何もない
    ], { thresholdMs: 60_000, quality: { windowMs: 30_000 } });
    expect(r.length).toBe(2);
    expect(r[0].quality).toBe('departed');
    expect(r[0].afterCount).toBeLessThanOrEqual(1);
  });

  it('quality 判定: 沈黙後 30秒以内に 2-4 コメ → "neutral"', () => {
    const r = detectCommentSilenceZones([
      c(t0, 'b'),
      c(t0 + 90_000, 'g1'),
      c(t0 + 100_000, 'g2'),
      c(t0 + 110_000, 'g3')
    ], { thresholdMs: 60_000, quality: { windowMs: 30_000 } });
    expect(r.length).toBe(1);
    expect(r[0].quality).toBe('neutral');
  });

  it('quality 判定オフ → quality: "unknown"', () => {
    const r = detectCommentSilenceZones([
      c(t0),
      c(t0 + 90_000)
    ], { thresholdMs: 60_000 });
    expect(r[0].quality).toBe('unknown');
  });

  it('閾値カスタマイズ: 30秒で検出', () => {
    const r = detectCommentSilenceZones([
      c(t0),
      c(t0 + 45_000)
    ], { thresholdMs: 30_000 });
    expect(r.length).toBe(1);
  });

  it('順不同入力でも捕えるよう内部で sort', () => {
    const r = detectCommentSilenceZones([
      c(t0 + 90_000, 'a'),
      c(t0, 'b')
    ], { thresholdMs: 60_000 });
    expect(r.length).toBe(1);
  });

  it('破損 capturedAt を持つコメは無視', () => {
    const r = detectCommentSilenceZones([
      c(t0),
      { capturedAt: NaN, text: 'bad' },
      c(t0 + 100_000)
    ], { thresholdMs: 60_000 });
    expect(r.length).toBe(1);
  });

  it('入力配列を破壊しない', () => {
    const arr = [c(t0 + 90_000, 'a'), c(t0, 'b')];
    const before = JSON.stringify(arr);
    detectCommentSilenceZones(arr, { thresholdMs: 60_000 });
    expect(JSON.stringify(arr)).toBe(before);
  });
});
