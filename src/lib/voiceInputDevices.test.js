import { describe, it, expect } from 'vitest';
import { audioConstraintsForDevice, VOICE_MIC_LEVEL_THRESHOLD } from './voiceInputDevices.js';

describe('audioConstraintsForDevice', () => {
  it('空IDは audio: true', () => {
    expect(audioConstraintsForDevice('')).toEqual({ audio: true });
    expect(audioConstraintsForDevice('  ')).toEqual({ audio: true });
  });

  it('非空は deviceId ideal', () => {
    expect(audioConstraintsForDevice('abc')).toEqual({
      audio: { deviceId: { ideal: 'abc' } }
    });
  });
});

describe('VOICE_MIC_LEVEL_THRESHOLD', () => {
  it('しきい値は正の整数', () => {
    expect(VOICE_MIC_LEVEL_THRESHOLD).toBeGreaterThan(0);
  });
});
