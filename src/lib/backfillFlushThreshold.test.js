import { describe, it, expect } from 'vitest';
import {
  computeBackfillFlushThreshold,
  BACKFILL_FLUSH_BASE_ROWS,
  BACKFILL_FLUSH_GROWTH,
  BACKFILL_FLUSH_MAX_ROWS
} from './backfillFlushThreshold.js';

describe('computeBackfillFlushThreshold', () => {
  it('小規模（0件付近）は base を返す', () => {
    expect(computeBackfillFlushThreshold(0)).toBe(BACKFILL_FLUSH_BASE_ROWS);
    expect(computeBackfillFlushThreshold(100)).toBe(BACKFILL_FLUSH_BASE_ROWS);
    // 800/0.5 = 1600 件までは base が勝つ
    expect(computeBackfillFlushThreshold(1599)).toBe(BACKFILL_FLUSH_BASE_ROWS);
  });

  it('保存件数に比例して閾値が伸びる（base と max の間）', () => {
    // v0.1.654: max を 8000→2000 に下げた(中断損失最小化)。base(800)と max(2000)の間を確認。
    expect(computeBackfillFlushThreshold(2000)).toBe(1000); // floor(2000*0.5)
    expect(computeBackfillFlushThreshold(3000)).toBe(1500); // floor(3000*0.5)
  });

  it('max で頭打ちになる（メモリ保護）', () => {
    expect(computeBackfillFlushThreshold(20000)).toBe(BACKFILL_FLUSH_MAX_ROWS);
    expect(computeBackfillFlushThreshold(100000)).toBe(BACKFILL_FLUSH_MAX_ROWS);
  });

  it('成長係数どおりの境界', () => {
    // growth=0.5 の境界: ちょうど base に達する件数
    const boundary = Math.ceil(BACKFILL_FLUSH_BASE_ROWS / BACKFILL_FLUSH_GROWTH);
    expect(computeBackfillFlushThreshold(boundary)).toBeGreaterThanOrEqual(
      BACKFILL_FLUSH_BASE_ROWS
    );
  });

  it('不正入力は base にフォールバック', () => {
    expect(computeBackfillFlushThreshold(NaN)).toBe(BACKFILL_FLUSH_BASE_ROWS);
    expect(computeBackfillFlushThreshold(-500)).toBe(BACKFILL_FLUSH_BASE_ROWS);
    expect(computeBackfillFlushThreshold(undefined)).toBe(BACKFILL_FLUSH_BASE_ROWS);
    expect(computeBackfillFlushThreshold('abc')).toBe(BACKFILL_FLUSH_BASE_ROWS);
  });

  it('常に >=1 を返す', () => {
    expect(computeBackfillFlushThreshold(0)).toBeGreaterThanOrEqual(1);
    expect(computeBackfillFlushThreshold(50000)).toBeGreaterThanOrEqual(1);
  });

  it('オプションで base/growth/max を上書きできる', () => {
    expect(
      computeBackfillFlushThreshold(10000, { base: 500, growth: 0.1, max: 2000 })
    ).toBe(1000);
    // max クランプ
    expect(
      computeBackfillFlushThreshold(10000, { base: 500, growth: 1, max: 2000 })
    ).toBe(2000);
    // 異常 max（base 未満）でも base は保証
    expect(
      computeBackfillFlushThreshold(0, { base: 800, max: 100 })
    ).toBe(800);
  });

  it('単調非減少（件数が増えても閾値が下がらない）', () => {
    let prev = 0;
    for (const n of [0, 500, 1600, 4000, 8000, 16000, 40000, 200000]) {
      const v = computeBackfillFlushThreshold(n);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});
