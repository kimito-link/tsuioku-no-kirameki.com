import { describe, it, expect } from 'vitest';
import { judgeLaneWindow, LANE_WINDOW_MIN_TILES } from './laneWindowVerdict.js';

describe('judgeLaneWindow — 窓にするか', () => {
  it('48枚までは窓にしない(従来の体験を変えない)', () => {
    expect(judgeLaneWindow({ tileCount: 48 }).windowed).toBe(false);
    expect(judgeLaneWindow({ tileCount: 0 }).windowed).toBe(false);
  });

  it('★49枚から窓にする', () => {
    expect(judgeLaneWindow({ tileCount: LANE_WINDOW_MIN_TILES }).windowed).toBe(true);
    expect(judgeLaneWindow({ tileCount: 857 }).windowed).toBe(true);
  });

  it('★会場は対象外(元々スクロールする器を持つ)', () => {
    expect(judgeLaneWindow({ tileCount: 857, isVenue: true }).windowed).toBe(false);
    expect(judgeLaneWindow({ tileCount: 857, isVenue: true }).reason).toBe('venue-has-own-scroll');
  });

  it('★件数が測れないときは窓にしない(「無い」と「まだ分からない」を混ぜない)', () => {
    expect(judgeLaneWindow({ tileCount: null }).windowed).toBe(false);
    expect(judgeLaneWindow({ tileCount: 'x' }).windowed).toBe(false);
    expect(judgeLaneWindow({}).windowed).toBe(false);
    expect(judgeLaneWindow(null).windowed).toBe(false);
  });

  it('★判定は構造で返す(理由が読める)', () => {
    expect(judgeLaneWindow({ tileCount: 857 }).reason).toBe('many-tiles');
    expect(judgeLaneWindow({ tileCount: 10 }).reason).toBe('fits-without-window');
    expect(judgeLaneWindow({ tileCount: null }).reason).toBe('count-unknown');
  });

  it('★この箱は件数を減らさない(cap ではないことの固定)', () => {
    // ★戻り値に「何枚にするか」を含めない＝構造的に cap になりえない。
    const r = judgeLaneWindow({ tileCount: 857 });
    expect(Object.keys(r).sort()).toEqual(['reason', 'windowed']);
    expect(r).not.toHaveProperty('limit');
    expect(r).not.toHaveProperty('cap');
  });
});
