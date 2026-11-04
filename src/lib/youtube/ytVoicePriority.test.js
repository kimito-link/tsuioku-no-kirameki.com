import { describe, it, expect } from 'vitest';
import { ytIsImportantVoiceRow, ytMarkImportantVoiceRows, ytShouldVoiceWhenCrowded } from './ytVoicePriority.js';

describe('ytVoicePriority(混んだら大事なものだけ読む)', () => {
  it('スパチャ・メンバー・YouTube のギフト・配信者/モデレーターは大事', () => {
    for (const kind of ['superchat', 'sticker', 'membership', 'membership_gift', 'yt_gift']) expect(ytIsImportantVoiceRow({ kind }, false)).toBe(true);
    expect(ytIsImportantVoiceRow({ kind: 'text', badges: ['Owner'] }, false)).toBe(true);
    expect(ytIsImportantVoiceRow({ kind: 'text', badges: ['moderator'] }, false)).toBe(true);
    expect(ytIsImportantVoiceRow({ kind: 'text', badges: ['member'] }, false)).toBe(false);
    expect(ytIsImportantVoiceRow({ kind: 'text' }, false)).toBe(false);
  });
  it('その配信で初めてのコメントは大事・2回目からはふつう', () => {
    const rows = [{ ch: 'A' }, { ch: 'B' }, { ch: 'A' }, { ch: 'A', kind: 'superchat' }, { ch: '' }];
    expect(ytMarkImportantVoiceRows(rows, (r) => r.ch)).toEqual([true, true, false, true, false]);
  });
  it('静かなときは全部読む・混んだらふつうのコメントは読まない', () => {
    expect(ytShouldVoiceWhenCrowded({ important: false, queueLength: 0 })).toBe(true);
    expect(ytShouldVoiceWhenCrowded({ important: false, queueLength: 1 })).toBe(true);
    expect(ytShouldVoiceWhenCrowded({ important: false, queueLength: 2 })).toBe(false);
    expect(ytShouldVoiceWhenCrowded({ important: true, queueLength: 30 })).toBe(true);
  });
});
