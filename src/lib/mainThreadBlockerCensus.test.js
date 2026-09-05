import { describe, it, expect } from 'vitest';
import {
  createBlockerCensus, noteBlocker, formatBlockerLine, measureBlocker, LONG_TASK_MS
} from './mainThreadBlockerCensus.js';

describe('mainThreadBlockerCensus', () => {
  it('短い処理は記録しない(ノイズを溜めない)', () => {
    const c = noteBlocker(createBlockerCensus(), { name: 'x', ms: LONG_TASK_MS - 1 });
    expect(c.count).toBe(0);
  });

  it('★止めている当人を名前で名指しする(「探せ」で終わらせない)', () => {
    let c = createBlockerCensus();
    c = noteBlocker(c, { name: 'grid-rebuild', ms: 900 });
    c = noteBlocker(c, { name: 'lane-heavy', ms: 120 });
    const line = formatBlockerLine(c);
    expect(c.worstName).toBe('grid-rebuild');
    expect(line).toContain('grid-rebuild');
    expect(line).toContain('止めている当人');
  });

  it('★可視復帰の直後に偏っているかを数える(スリープ→黒の検証)', () => {
    let c = createBlockerCensus();
    c = noteBlocker(c, { name: 'grid-rebuild', ms: 800, sinceVisibleMs: 200 });
    c = noteBlocker(c, { name: 'grid-rebuild', ms: 200, sinceVisibleMs: 60_000 });
    expect(c.afterResumeCount).toBe(1);
    expect(c.afterResumeMs).toBe(800);
    const line = formatBlockerLine(c);
    expect(line).toContain('可視復帰の直後');
    expect(line).toContain('黒の主因');
  });

  it('幕/シェードは下流だと明記する(描画側を直させない)', () => {
    const c = noteBlocker(createBlockerCensus(), { name: 'refresh', ms: 700 });
    expect(formatBlockerLine(c)).toContain('下流');
  });

  it('観測ゼロなら正常と言う', () => {
    expect(formatBlockerLine(createBlockerCensus())).toContain('✅');
  });

  it('measureBlocker は戻り値をそのまま返す', () => {
    const c = createBlockerCensus();
    let t = 0;
    const now = () => t;
    const got = measureBlocker(c, 'work', () => { t += 300; return 42; }, { now });
    expect(got).toBe(42);
    expect(c.count).toBe(1);
    expect(c.worstName).toBe('work');
  });

  it('★例外が出ても計測する(重い処理ほど落ちやすい=取りこぼすと真因を見失う)', () => {
    const c = createBlockerCensus();
    let t = 0;
    const now = () => t;
    expect(() => measureBlocker(c, 'boom', () => { t += 500; throw new Error('x'); }, { now }))
      .toThrow('x');
    expect(c.count).toBe(1);
    expect(c.worstName).toBe('boom');
  });

  it('サンプルは上限で古いものから捨てる', () => {
    let c = createBlockerCensus();
    for (let i = 0; i < 20; i += 1) c = noteBlocker(c, { name: `n${i}`, ms: 100 });
    expect(c.samples.length).toBeLessThanOrEqual(8);
    expect(c.count).toBe(20);
  });
});
