import { describe, it, expect } from 'vitest';
import {
  pikaTierForSupportCelebration,
  pikaTierForGiftBahamut,
  effectSoundKindForPikaTier
} from './celebrationPika.js';
import { pickCommentMilestoneCelebration } from './supportCelebration.js';
import { pickGiftBahamutCelebration } from './giftBahamutCelebration.js';

describe('celebrationPika', () => {
  it('コメント1000件は jackpot', () => {
    const spec = pickCommentMilestoneCelebration(900, 1000);
    expect(pikaTierForSupportCelebration(spec)).toBe('jackpot');
  });

  it('コメント100件は soft', () => {
    const spec = pickCommentMilestoneCelebration(99, 100);
    expect(pikaTierForSupportCelebration(spec)).toBe('soft');
  });

  it('コメント50件は none', () => {
    const spec = pickCommentMilestoneCelebration(49, 50);
    expect(pikaTierForSupportCelebration(spec)).toBe('none');
  });

  it('ギフト mega は jackpot', () => {
    const spec = pickGiftBahamutCelebration(
      { sender: 'a', item: 'b', point: 5000 },
      'k'
    );
    expect(pikaTierForGiftBahamut(spec)).toBe('jackpot');
  });
});

describe('effectSoundKindForPikaTier', () => {
  it('jackpot/hard/soft はそれぞれ対応する効果音kindを返す', () => {
    expect(effectSoundKindForPikaTier('jackpot')).toBe('milestone_jackpot');
    expect(effectSoundKindForPikaTier('hard')).toBe('milestone_hard');
    expect(effectSoundKindForPikaTier('soft')).toBe('milestone_soft');
  });

  it('none は無音(null)', () => {
    expect(effectSoundKindForPikaTier('none')).toBeNull();
  });
});
