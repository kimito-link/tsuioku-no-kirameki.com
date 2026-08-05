import { describe, it, expect } from 'vitest';
import {
  createVanishForensics, markTrail, recentTrail, noteVanishWithTrail,
  snapshotVanishForensics, formatVanishForensicsLine, TRAIL_MAX
} from './hostVanishForensics.js';

describe('markTrail / recentTrail', () => {
  it('★直前1.2秒以内の足跡だけを古い順に返す', () => {
    const f = createVanishForensics();
    markTrail(f, 'old', 1000);
    markTrail(f, 'render', 9500);
    markTrail(f, 'hide:autoshow_off', 9900);
    expect(recentTrail(f.trail, 10000)).toEqual([
      'render(-500ms)', 'hide:autoshow_off(-100ms)'
    ]);
  });

  it('未来の印は拾わない(時刻が巻き戻っても壊れない)', () => {
    const f = createVanishForensics();
    markTrail(f, 'future', 11000);
    expect(recentTrail(f.trail, 10000)).toEqual([]);
  });

  it('★リングで頭打ちになる(メモリを増やさない)', () => {
    const f = createVanishForensics();
    for (let i = 0; i < TRAIL_MAX + 30; i += 1) markTrail(f, 't' + i, i);
    expect(f.trail.length).toBe(TRAIL_MAX);
  });

  it('壊れた入力でも落ちない', () => {
    expect(() => markTrail(null, 'x', 1)).not.toThrow();
    expect(recentTrail(null, 1)).toEqual([]);
  });
});

describe('noteVanishWithTrail', () => {
  it('★消えた瞬間に直前の足跡を切り出して残す', () => {
    const f = createVanishForensics();
    markTrail(f, 'render', 9800);
    noteVanishWithTrail(f, { nowMs: 10000, w: 0, h: 0, display: 'none' });
    const s = snapshotVanishForensics(f);
    expect(s.vanishCount).toBe(1);
    expect(s.samples[0].before).toEqual(['render(-200ms)']);
    expect(s.samples[0]).toMatchObject({ w: 0, h: 0, display: 'none' });
  });

  it('サンプルは上限で頭打ち(速報を膨らませない)', () => {
    const f = createVanishForensics();
    for (let i = 0; i < 20; i += 1) noteVanishWithTrail(f, { nowMs: i * 100 });
    expect(snapshotVanishForensics(f).samples.length).toBeLessThanOrEqual(4);
    expect(snapshotVanishForensics(f).vanishCount).toBe(20);
  });
});

describe('formatVanishForensicsLine — 0の意味を区別する', () => {
  it('★足跡0件は「未計測」', () => {
    const line = formatVanishForensicsLine({ trailLen: 0, vanishCount: 0, samples: [] });
    expect(line).toContain('未計測');
    expect(line).not.toContain('✅');
  });

  it('足跡ありで消失0なら ✅ かつ件数を併記', () => {
    const line = formatVanishForensicsLine({ trailLen: 40, vanishCount: 0, samples: [] });
    expect(line).toContain('✅');
    expect(line).toContain('足跡40件');
  });

  it('★消えたら直前に走った処理を並べる', () => {
    const line = formatVanishForensicsLine({
      trailLen: 40, vanishCount: 2,
      samples: [{ w: 0, h: 0, display: 'none', before: ['render(-200ms)', 'hide:autoshow_off(-10ms)'] }]
    });
    expect(line).toContain('2回消失');
    expect(line).toContain('直前に走った処理');
    expect(line).toContain('hide:autoshow_off(-10ms)');
  });

  it('★直前に何も走っていなければ外部要因の可能性を明示する', () => {
    const line = formatVanishForensicsLine({
      trailLen: 40, vanishCount: 1, samples: [{ w: 0, h: 0, before: [] }]
    });
    expect(line).toContain('外部要因の可能性');
  });

  it('材料が無ければ空文字', () => {
    expect(formatVanishForensicsLine(null)).toBe('');
  });
});
