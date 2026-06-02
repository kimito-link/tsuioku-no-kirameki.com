import { describe, it, expect } from 'vitest';
import {
  flyTextLinesForSupportCelebration,
  flyTextLinesForGiftBahamut,
  flyTextCountForDuration,
  nicoFlyPhraseAt
} from './celebrationFlyText.js';
import { pickCommentMilestoneCelebration } from './supportCelebration.js';
import { pickGiftBahamutCelebration } from './giftBahamutCelebration.js';

describe('celebrationFlyText', () => {
  it('duration に応じた行数', () => {
    expect(flyTextCountForDuration(6500)).toBe(28);
    expect(flyTextCountForDuration(2000)).toBe(8);
  });

  it('コメントマイルストーンにスクロールとバーストが混在', () => {
    const spec = pickCommentMilestoneCelebration(99, 100);
    const lines = flyTextLinesForSupportCelebration(spec);
    expect(lines.length).toBeGreaterThan(10);
    expect(lines.some((l) => l.motion === 'scroll')).toBe(true);
    expect(lines.some((l) => l.motion === 'burst')).toBe(true);
    expect(lines.some((l) => l.text.includes('100'))).toBe(true);
  });

  it('ギフトに送信者・pt・888が含まれる', () => {
    const spec = pickGiftBahamutCelebration(
      { sender: 'テスト', item: '星', point: 500 },
      'lv1|no:1'
    );
    const lines = flyTextLinesForGiftBahamut(spec);
    expect(lines.some((l) => l.text.includes('500'))).toBe(true);
    expect(lines.some((l) => l.text.includes('テスト'))).toBe(true);
    expect(lines.some((l) => l.text === '888888888')).toBe(true);
  });

  it('フレーズローテーション', () => {
    expect(nicoFlyPhraseAt(0)).toBeTruthy();
    expect(nicoFlyPhraseAt(99)).toBeTruthy();
  });
});
