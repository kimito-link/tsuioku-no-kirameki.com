import { describe, it, expect } from 'vitest';
import { computeHeatLevel } from './heatLevel.js';

describe('computeHeatLevel', () => {
  it('分速の閾値で段階が変わる', () => {
    expect(computeHeatLevel(0).stage).toBe('idle');
    expect(computeHeatLevel(5).stage).toBe('idle');
    expect(computeHeatLevel(8).stage).toBe('warm');
    expect(computeHeatLevel(29).stage).toBe('warm');
    expect(computeHeatLevel(30).stage).toBe('hot');
    expect(computeHeatLevel(99).stage).toBe('hot');
    expect(computeHeatLevel(100).stage).toBe('blazing');
    expect(computeHeatLevel(500).stage).toBe('blazing');
  });

  it('label は段階に対応(絵文字付き)', () => {
    expect(computeHeatLevel(2).label).toContain('おだやか');
    expect(computeHeatLevel(15).label).toContain('あたたまって');
    expect(computeHeatLevel(50).label).toContain('盛り上がってる');
    expect(computeHeatLevel(150).label).toContain('激盛り');
  });

  it('score は 0..100(cpm/2・上限頭打ち)', () => {
    expect(computeHeatLevel(0).score).toBe(0);
    expect(computeHeatLevel(60).score).toBe(30);
    expect(computeHeatLevel(200).score).toBe(100);
    expect(computeHeatLevel(9999).score).toBe(100); // 頭打ち
  });

  it('不正/負/NaN は 0 扱い(idle)', () => {
    expect(computeHeatLevel(-10)).toMatchObject({ stage: 'idle', score: 0 });
    expect(computeHeatLevel(NaN)).toMatchObject({ stage: 'idle', score: 0 });
    expect(computeHeatLevel('x')).toMatchObject({ stage: 'idle', score: 0 });
    expect(computeHeatLevel(null)).toMatchObject({ stage: 'idle', score: 0 });
  });

  it('commentsPerMinute をそのまま返す(表示用)', () => {
    expect(computeHeatLevel(42).commentsPerMinute).toBe(42);
  });
});
