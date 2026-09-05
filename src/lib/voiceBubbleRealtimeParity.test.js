import { describe, it, expect } from 'vitest';
import { buildVoiceBubbleParity, PARITY_WARN_GAP_MS } from './voiceBubbleRealtimeParity.js';

describe('voiceBubbleRealtimeParity', () => {
  it('★読み上げを使っていないときは「ズレ」と言わない(直せない赤を作らない)', () => {
    const r = buildVoiceBubbleParity({
      voiceDiag: { enabled: false, spokenTotal: 0 },
      instantPush: { lastGapMs: 5 }
    });
    expect(r.state).toBe('unused');
    expect(r.line).toContain('読み上げを使っていません');
  });

  it('声と表示が近ければ ✅', () => {
    const r = buildVoiceBubbleParity({
      voiceDiag: { enabled: true, spokenTotal: 10, lastE2eMs: 400 },
      instantPush: { lastGapMs: 300 }
    });
    expect(r.state).toBe('ok');
    expect(r.gapMs).toBe(100);
  });

  it('★声だけ遅れていたら検知する(個別には両方「正常」に見える状態)', () => {
    const r = buildVoiceBubbleParity({
      voiceDiag: { enabled: true, spokenTotal: 10, lastE2eMs: 6000 },
      instantPush: { lastGapMs: 5 }
    });
    expect(r.state).toBe('bad');
    expect(r.line).toContain('声が遅れています');
    expect(r.line).toContain('次の一手');
  });

  it('表示が遅れている場合は表示側を名指しする', () => {
    const r = buildVoiceBubbleParity({
      voiceDiag: { enabled: true, spokenTotal: 5, lastE2eMs: 100 },
      instantPush: { lastGapMs: 9000 }
    });
    expect(r.state).toBe('bad');
    expect(r.line).toContain('声が先行しています');
    expect(r.line).toContain('表示側が遅れています');
  });

  it('間引きは「壊れた」ではなく正常動作として説明する', () => {
    const r = buildVoiceBubbleParity({
      voiceDiag: { enabled: true, spokenTotal: 10, lastE2eMs: 300, staleDropTotal: 6 },
      instantPush: { lastGapMs: 250 }
    });
    expect(r.line).toContain('6件を読み飛ばして');
    expect(r.line).toContain('正常な動作');
  });

  it('★-1(未計測)を 0ms と誤読しない', () => {
    const r = buildVoiceBubbleParity({
      voiceDiag: { enabled: true, spokenTotal: 3, lastE2eMs: -1, e2eAvgMs: -1 },
      instantPush: { lastGapMs: -1, avgGapMs: -1 }
    });
    expect(r.state).toBe('unused');
    expect(r.line).toContain('まだ測れていません');
  });

  it('平均へフォールバックする(直近が未計測でも判定できる)', () => {
    const r = buildVoiceBubbleParity({
      voiceDiag: { enabled: true, spokenTotal: 3, lastE2eMs: -1, e2eAvgMs: 2000 },
      instantPush: { lastGapMs: -1, avgGapMs: 100 }
    });
    expect(r.voiceMs).toBe(2000);
    expect(r.bubbleMs).toBe(100);
    expect(Math.abs(r.gapMs)).toBeGreaterThanOrEqual(PARITY_WARN_GAP_MS);
  });
});
