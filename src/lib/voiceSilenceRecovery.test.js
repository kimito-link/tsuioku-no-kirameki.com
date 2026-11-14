import { describe, expect, it } from 'vitest';
import { planVoiceSilenceRecovery, VOICE_SILENCE_RECOVERY_MS } from './voiceSilenceRecovery.js';

describe('planVoiceSilenceRecovery', () => {
  it('コメントが届いて18秒未満なら何もしない', () => {
    expect(planVoiceSilenceRecovery({ enabled: true, nowMs: 17999, lastInputAt: 17000, silenceStartedAt: 1 })).toMatchObject({ recover: false });
  });

  it('コメントが届き続けて20秒無音なら合成詰まりを立て直す', () => {
    expect(planVoiceSilenceRecovery({
      enabled: true, nowMs: VOICE_SILENCE_RECOVERY_MS + 1, lastInputAt: 17000,
      silenceStartedAt: 1,
      synthInFlight: 1, playing: true, audioStarted: false
    })).toMatchObject({ recover: true, reason: 'synth-stall' });
  });

  it('鳴った後に新しい入力が無ければ静かな配信として立て直さない', () => {
    expect(planVoiceSilenceRecovery({
      enabled: true, nowMs: 50000, lastInputAt: 10000, lastAudibleAt: 11000,
      queueLength: 0
    })).toMatchObject({ recover: false });
  });

  it('復旧は一回限りでなく、その後の新着がまた20秒無音なら再び効く', () => {
    expect(planVoiceSilenceRecovery({
      enabled: true, nowMs: 41001, lastInputAt: 40000, lastRecoveryAt: 21000,
      silenceStartedAt: 21000,
      queueLength: 3
    })).toMatchObject({ recover: true, reason: 'queue-stall' });
  });

  it('再生開始後の詰まりと単なる入力無音を理由で分ける', () => {
    expect(planVoiceSilenceRecovery({ enabled: true, nowMs: 30000, lastInputAt: 25000, silenceStartedAt: 1, playing: true, audioStarted: true }).reason).toBe('playback-stall');
    expect(planVoiceSilenceRecovery({ enabled: true, nowMs: 30000, lastInputAt: 25000, silenceStartedAt: 1 }).reason).toBe('silent-input');
  });
});
