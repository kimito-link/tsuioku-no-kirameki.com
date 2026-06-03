import { describe, it, expect, beforeEach } from 'vitest';
import {
  consumeCelebrationTailPrimeSlot,
  resetCelebrationTailPrimeSession
} from './celebrationTailScanSession.js';

describe('celebrationTailScanSession', () => {
  beforeEach(() => resetCelebrationTailPrimeSession());

  it('初回だけ prime スロットを消費する', () => {
    expect(consumeCelebrationTailPrimeSlot('lv123')).toBe(true);
    expect(consumeCelebrationTailPrimeSlot('lv123')).toBe(false);
    expect(consumeCelebrationTailPrimeSlot('LV123')).toBe(false);
  });

  it('別配信は独立', () => {
    expect(consumeCelebrationTailPrimeSlot('lv1')).toBe(true);
    expect(consumeCelebrationTailPrimeSlot('lv2')).toBe(true);
  });
});
