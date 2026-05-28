import { describe, it, expect } from 'vitest';
import {
  GIFT_PAYOUT_RATES,
  NICONICO_RATE,
  estimateNiconicoGiftRevenue,
  estimateCrossPlatformGiftRevenue
} from './giftRevenueEstimate.js';

describe('GIFT_PAYOUT_RATES テーブル', () => {
  it('各 PF の率は 0 < low <= mid <= high <= 1', () => {
    for (const r of GIFT_PAYOUT_RATES) {
      expect(r.low).toBeGreaterThan(0);
      expect(r.low).toBeLessThanOrEqual(r.mid);
      expect(r.mid).toBeLessThanOrEqual(r.high);
      expect(r.high).toBeLessThanOrEqual(1);
      expect(typeof r.label).toBe('string');
      expect(r.label.length).toBeGreaterThan(0);
    }
  });

  it('niconico が含まれ NICONICO_RATE と一致', () => {
    expect(NICONICO_RATE.key).toBe('niconico');
    expect(GIFT_PAYOUT_RATES.find((r) => r.key === 'niconico')).toBe(NICONICO_RATE);
  });

  it('key は重複しない', () => {
    const keys = GIFT_PAYOUT_RATES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('estimateNiconicoGiftRevenue', () => {
  it('総pt × 還元率レンジで目安円を返す（low<=mid<=high）', () => {
    const r = estimateNiconicoGiftRevenue(10000);
    expect(r.totalPoints).toBe(10000);
    // niconico low=0.3 mid=0.4 high=0.5
    expect(r.low).toBe(3000);
    expect(r.mid).toBe(4000);
    expect(r.high).toBe(5000);
    expect(r.low).toBeLessThanOrEqual(r.mid);
    expect(r.mid).toBeLessThanOrEqual(r.high);
  });

  it('「目安」「ギフト由来のみ」フラグを必ず立てる（確定額/総収益と誤認させない）', () => {
    const r = estimateNiconicoGiftRevenue(500);
    expect(r.isEstimate).toBe(true);
    expect(r.giftDerivedOnly).toBe(true);
    expect(r.rate.key).toBe('niconico');
  });

  it('0 / 負 / 非数値は totalPoints=0・各円 0', () => {
    for (const bad of [0, -100, NaN, Infinity, null, undefined, 'x']) {
      const r = estimateNiconicoGiftRevenue(/** @type {any} */ (bad));
      expect(r.totalPoints).toBe(0);
      expect(r.low).toBe(0);
      expect(r.mid).toBe(0);
      expect(r.high).toBe(0);
    }
  });

  it('端数は円に四捨五入', () => {
    // 333pt × 0.4 = 133.2 → 133
    expect(estimateNiconicoGiftRevenue(333).mid).toBe(133);
  });
});

describe('estimateCrossPlatformGiftRevenue', () => {
  it('全 PF 分の行を返し mid 降順', () => {
    const r = estimateCrossPlatformGiftRevenue(10000);
    expect(r.rows).toHaveLength(GIFT_PAYOUT_RATES.length);
    for (let i = 1; i < r.rows.length; i++) {
      expect(r.rows[i - 1].mid).toBeGreaterThanOrEqual(r.rows[i].mid);
    }
    // niconico も含む
    expect(r.rows.some((row) => row.key === 'niconico')).toBe(true);
  });

  it('「同額仮定の試算」フラグを立てる', () => {
    const r = estimateCrossPlatformGiftRevenue(1000);
    expect(r.isEstimate).toBe(true);
    expect(r.sameAmountAssumption).toBe(true);
  });

  it('各行は 同 pt × その PF の率（ツイキャスは niconico より高い）', () => {
    const r = estimateCrossPlatformGiftRevenue(10000);
    const nico = r.rows.find((x) => x.key === 'niconico');
    const twi = r.rows.find((x) => x.key === 'twitcasting');
    expect(nico?.mid).toBe(4000); // 0.4
    expect(twi?.mid).toBe(7000); // 0.7
    expect(twi.mid).toBeGreaterThan(nico.mid);
  });

  it('0 / 非数値は totalPoints=0・全行 0', () => {
    const r = estimateCrossPlatformGiftRevenue(/** @type {any} */ (null));
    expect(r.totalPoints).toBe(0);
    for (const row of r.rows) {
      expect(row.low).toBe(0);
      expect(row.mid).toBe(0);
      expect(row.high).toBe(0);
    }
  });
});
