import { describe, it, expect } from 'vitest';
import { buildGiftThrowerLaneEntries } from './userLaneMergeGiftThrowers.js';

describe('buildGiftThrowerLaneEntries', () => {
  it('数値 ID のギフト投げ主を新しい順に並べる', () => {
    const out = buildGiftThrowerLaneEntries(
      [
        { userId: '11111', nickname: 'A', capturedAt: 100 },
        { userId: '22222', nickname: 'B', capturedAt: 900 }
      ],
      { liveId: 'lv1' }
    );
    expect(out).toHaveLength(2);
    expect(out[0].userId).toBe('22222');
    expect(out[1].userId).toBe('11111');
  });

  it('匿名・__anon_ は含めない', () => {
    const out = buildGiftThrowerLaneEntries(
      [
        { userId: 'a:abc', nickname: 'anon', capturedAt: 1 },
        { userId: '__anon_名無し', nickname: 'x', capturedAt: 2 }
      ],
      { liveId: 'lv1' }
    );
    expect(out).toHaveLength(0);
  });
});
