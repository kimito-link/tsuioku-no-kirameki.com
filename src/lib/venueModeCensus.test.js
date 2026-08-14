import { describe, it, expect } from 'vitest';
import { buildVenueModeCensus, MIRROR_SOFT_MS, MIRROR_HARD_MS } from './venueModeCensus.js';

describe('venueModeCensus', () => {
  it('★開いていなければ判定しない(直せない赤を作らない)', () => {
    const r = buildVenueModeCensus({ venueOpen: false });
    expect(r.level).toBe('na');
    expect(r.line).toContain('開いていません');
  });

  it('新しい鏡なら ✅', () => {
    const r = buildVenueModeCensus({ venueOpen: true, mirrorAgeMs: 5_000, tiers: { link: 7 } });
    expect(r.level).toBe('ok');
    expect(r.mirrorState).toBe('fresh');
  });

  it('★実機の 656秒 は「古い情報を表示中」と出し、残り時間も出す', () => {
    const r = buildVenueModeCensus({
      venueOpen: true, mirrorAgeMs: 656_000, tiers: { link: 7, ad: 4, tanu: 332 }
    });
    expect(r.mirrorState).toBe('stale');
    expect(r.level).toBe('warn');
    expect(r.line).toContain('656秒前の情報を表示中');
    expect(r.line).toContain('あと約');
    expect(r.line).toContain('開き直して');
  });

  it('HARD 超は 🔴', () => {
    const r = buildVenueModeCensus({ venueOpen: true, mirrorAgeMs: MIRROR_HARD_MS + 1000 });
    expect(r.mirrorState).toBe('staleHard');
    expect(r.level).toBe('bad');
  });

  it('★ギフトが来ているのに段が空なら名指しする', () => {
    const r = buildVenueModeCensus({
      venueOpen: true, mirrorAgeMs: 1000, tiers: { link: 7, gift: 0 }, hasGiftData: true
    });
    expect(r.emptyTiers).toContain('gift');
    expect(r.line).toContain('会場のギフト段が空');
  });

  it('ギフトが無い配信では「段が空」と言わない(ノイズを作らない)', () => {
    const r = buildVenueModeCensus({
      venueOpen: true, mirrorAgeMs: 1000, tiers: { link: 7, gift: 0 }, hasGiftData: false
    });
    expect(r.emptyTiers).toEqual([]);
    expect(r.line).not.toContain('ギフト段が空');
  });

  it('SOFT 境界ちょうどは fresh 側', () => {
    expect(buildVenueModeCensus({ venueOpen: true, mirrorAgeMs: MIRROR_SOFT_MS }).mirrorState)
      .toBe('fresh');
  });
});
