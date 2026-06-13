import { describe, it, expect } from 'vitest';
import { isVoiceItemStale } from './voiceAgeGate.js';

describe('isVoiceItemStale', () => {
  it('不正値は安全側（stale=false）として扱う', () => {
    expect(isVoiceItemStale(null, 100, 1).stale).toBe(false);
    expect(isVoiceItemStale(100, undefined, 1).stale).toBe(false);
    expect(isVoiceItemStale(100, 200, null).stale).toBe(false);
    
    // 未来の時刻や0以下も安全側
    expect(isVoiceItemStale(200, 100, 1).stale).toBe(false);
    expect(isVoiceItemStale(-1, 100, 1).stale).toBe(false);
  });

  it('キューが5件未満の場合、閾値は5000ms', () => {
    // 5000ms丁度はセーフ
    expect(isVoiceItemStale(1000, 6000, 4).stale).toBe(false);
    // 5001msはアウト
    expect(isVoiceItemStale(1000, 6001, 4).stale).toBe(true);
    expect(isVoiceItemStale(1000, 6001, 4).reason).toMatch(/age 5001ms > 5000ms/);
  });

  it('キューが5件以上の場合、閾値は3000msに短縮', () => {
    // 3000ms丁度はセーフ
    expect(isVoiceItemStale(1000, 4000, 5).stale).toBe(false);
    // 3001msはアウト
    expect(isVoiceItemStale(1000, 4001, 5).stale).toBe(true);
    expect(isVoiceItemStale(1000, 4001, 5).reason).toMatch(/age 3001ms > 3000ms/);
  });

  it('highPriority（ギフト等）はキュー長に関わらず閾値8000ms', () => {
    // キューが10件あっても8000msまではセーフ
    expect(isVoiceItemStale(1000, 9000, 10, true).stale).toBe(false);
    // 8001msはアウト
    expect(isVoiceItemStale(1000, 9001, 10, true).stale).toBe(true);
    expect(isVoiceItemStale(1000, 9001, 10, true).reason).toMatch(/age 8001ms > 8000ms/);
  });
});
