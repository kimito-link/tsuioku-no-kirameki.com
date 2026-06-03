import { describe, it, expect } from 'vitest';
import {
  shouldDeferCelebrationsUntilHeavySettled,
  shouldReprimeCommentMilestones,
  COMMENT_MILESTONE_REPRIME_MIN_JUMP
} from './watchPopupCelebrationGuard.js';
import { pickCommentMilestoneCelebration } from './supportCelebration.js';

describe('watchPopupCelebrationGuard', () => {
  it('heavy 未完了の間は演出スキャンを遅延する', () => {
    expect(shouldDeferCelebrationsUntilHeavySettled(true)).toBe(true);
    expect(shouldDeferCelebrationsUntilHeavySettled(false)).toBe(false);
  });

  it('軽量100件→heavy2970件のジャンプでは再プライムが必要', () => {
    expect(
      shouldReprimeCommentMilestones({
        primedLiveId: 'lv1',
        liveId: 'lv1',
        prevHighWater: 100,
        newCount: 2970
      })
    ).toBe(true);
    expect(
      shouldReprimeCommentMilestones({
        primedLiveId: 'lv1',
        liveId: 'lv1',
        prevHighWater: 2970,
        newCount: 2975
      })
    ).toBe(false);
    expect(COMMENT_MILESTONE_REPRIME_MIN_JUMP).toBeGreaterThanOrEqual(50);
  });

  it('プライム済み high-water と同じ件数ではマイルストーン横断判定しない', () => {
    expect(pickCommentMilestoneCelebration(2970, 2970)).toBeNull();
    expect(pickCommentMilestoneCelebration(2960, 2970)).toBeNull();
  });

});
