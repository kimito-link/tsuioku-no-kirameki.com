import { describe, expect, it } from 'vitest';
import { DARK_LUMA_MAX, findDarkRuns, parseSignalstats } from './measure-flash-frames.mjs';

/**
 * ★この検査が守っているのは「黒を見つけること」ではなく
 *   【見つけられなかったときに"無い"と言わないこと】。
 *   実際に合成クリップ(既知の黒50ms)で通しの実測をしたところ、
 *   最初の版は frames:0 なのに verdict:'no-dark' を返した。
 *   ＝測れていないのに正常と報告する = 一番危ない失敗
 *   [[zero-count-may-mean-unmeasured-2026-08-04]]
 */

const f = (n, tSec, yavg) => ({ n, t: tSec, yavg });

describe('parseSignalstats — ffprobe の実出力の形', () => {
  /* ★実際に ffprobe が吐いた形をそのまま貼る(自分で想像した形で検査しない)。 */
  const REAL = [
    '[FRAME]', 'pts_time=0.000000', 'TAG:lavfi.signalstats.YAVG=231',
    '[SIDE_DATA]', '[/SIDE_DATA]', '[/FRAME]',
    '[FRAME]', 'pts_time=0.017000', 'TAG:lavfi.signalstats.YAVG=16', '[/FRAME]'
  ].join('\n');

  it('YAVG と時刻を取り出す', () => {
    expect(parseSignalstats(REAL)).toEqual([
      { n: 0, t: 0, yavg: 231 },
      { n: 1, t: 0.017, yavg: 16 }
    ]);
  });

  it('★読めない入力では空を返す(でっち上げない)', () => {
    expect(parseSignalstats('')).toEqual([]);
    expect(parseSignalstats(null)).toEqual([]);
    expect(parseSignalstats('Error: No such file')).toEqual([]);
  });
});

describe('findDarkRuns — 暗い区間の切り出し', () => {
  it('★実測と同じ形: 明→黒3枚→明 を 1区間として返す', () => {
    /* 合成クリップの実測値(黒 YAVG=16 / クリーム YAVG=231)を使う。 */
    const frames = [
      f(0, 0.0, 231), f(1, 0.017, 231),
      f(2, 0.5, 16), f(3, 0.517, 16), f(4, 0.533, 16),
      f(5, 0.55, 231)
    ];
    const r = findDarkRuns(frames);
    expect(r.verdict).toBe('dark');
    expect(r.darkFrames).toBe(3);
    expect(r.runs).toHaveLength(1);
    expect(r.runs[0].startMs).toBe(500);
    expect(r.runs[0].minYavg).toBe(16);
  });

  it('明るいだけのクリップでは鳴らない(偽陽性を出さない)', () => {
    const r = findDarkRuns([f(0, 0, 231), f(1, 0.017, 250), f(2, 0.033, 231)]);
    expect(r.verdict).toBe('no-dark');
    expect(r.runs).toEqual([]);
  });

  it('★1フレームだけの黒も逃さない(16.7msは人に見える)', () => {
    const r = findDarkRuns([f(0, 0, 231), f(1, 0.017, 8), f(2, 0.033, 231)]);
    expect(r.darkFrames).toBe(1);
    expect(r.verdict).toBe('dark');
  });

  it('複数回ちらついたら区間も複数返す', () => {
    const r = findDarkRuns([
      f(0, 0, 231), f(1, 0.017, 10), f(2, 0.033, 231), f(3, 0.05, 10), f(4, 0.067, 231)
    ]);
    expect(r.runs).toHaveLength(2);
  });

  it('しきい値の境目: DARK_LUMA_MAX ちょうどは暗い / +1 は暗くない', () => {
    expect(findDarkRuns([f(0, 0, DARK_LUMA_MAX)]).darkFrames).toBe(1);
    expect(findDarkRuns([f(0, 0, DARK_LUMA_MAX + 1)]).darkFrames).toBe(0);
  });

  it('★入力ゼロ件では区間ゼロ・frames=0 を返す(呼び出し側が unmeasured と判定できる)', () => {
    const r = findDarkRuns([]);
    expect(r.frames).toBe(0);
    expect(r.darkFrames).toBe(0);
  });

  it('壊れた入力でも落ちない', () => {
    expect(() => findDarkRuns(null)).not.toThrow();
    expect(() => findDarkRuns([null, {}, { yavg: 'x' }])).not.toThrow();
  });
});

describe('★測れていないことを"正常"と言わない配線', () => {
  it('CLI は frames=0 のとき exit 3 で unmeasured を出す', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('./measure-flash-frames.mjs', import.meta.url), 'utf8');
    expect(src).toMatch(/frames\.length === 0/);
    expect(src).toContain("'unmeasured'");
    expect(src).toMatch(/process\.exit\(3\)/);
  });
});
