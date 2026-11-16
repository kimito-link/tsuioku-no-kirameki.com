import { describe, expect, it } from 'vitest';
import { buildVenueHeadlessVoiceItem } from './venueHeadlessVoiceItem.js';
import { VoicePlayer } from './voicePlayer.js';

describe('閉会場の音声item', () => {
  it('会場を一度も開かなくても既存broadcaster contextのuidを渡す', () => {
    expect(buildVenueHeadlessVoiceItem(
      { userId: 'caster', name: '放送主', key: 'k2', text: '2回目', capturedAt: 123 },
      { liveId: 'lv1', broadcasterUid: 'caster', receivedAt: 999 }
    )).toMatchObject({ liveId: 'lv1', broadcasterUid: 'caster', receivedAt: 123 });
  });

  it('放送主の2回目も混雑列でimportance=broadcasterとして残る', () => {
    const p = new VoicePlayer({ isObsMode: () => false });
    p.enabled = true;
    p.playing = true; // 列だけを検査し、再生は始めない
    const context = { liveId: 'lv1', broadcasterUid: 'caster', receivedAt: 999 };
    p.enqueue([buildVenueHeadlessVoiceItem({ userId: 'caster', key: 'c1', text: '1回目' }, context)]);
    p.enqueue([buildVenueHeadlessVoiceItem({ userId: 'u1', key: 'u1', text: '通常1' }, context)]);
    p.enqueue([buildVenueHeadlessVoiceItem({ userId: 'u2', key: 'u2', text: '通常2' }, context)]);
    p.enqueue([buildVenueHeadlessVoiceItem({ userId: 'caster', key: 'c2', text: '2回目' }, context)]);
    expect(p.queue.some((item) => item.body === '2回目' && item.importance === 'broadcaster')).toBe(true);
  });
});
