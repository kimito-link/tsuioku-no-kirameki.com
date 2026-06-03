import { describe, it, expect } from 'vitest';
import {
  giftBahamutTierFromPoints,
  pickGiftBahamutCelebration,
  giftBahamutDurationMsForTier
} from './giftBahamutCelebration.js';

describe('giftBahamutCelebration', () => {
  it('pt  tier 判定', () => {
    expect(giftBahamutTierFromPoints(10)).toBe('small');
    expect(giftBahamutTierFromPoints(50)).toBe('medium');
    expect(giftBahamutTierFromPoints(500)).toBe('large');
    expect(giftBahamutTierFromPoints(5000)).toBe('mega');
  });

  it('ギフトコメントから spec を組み立てる', () => {
    const spec = pickGiftBahamutCelebration(
      { sender: 'テスト', item: '応援メガホン', point: 500 },
      'lv1|no:42'
    );
    expect(spec?.tier).toBe('large');
    expect(spec?.dedupeKey).toBe('gift_bahamut_lv1|no:42');
    expect(spec?.message).toContain('500');
    expect(giftBahamutDurationMsForTier(spec.tier)).toBeGreaterThan(2500);
  });
});
