import { describe, expect, it, vi } from 'vitest';
import {
  EFFECT_SOUND_KINDS,
  EFFECT_SOUND_GUARD_MS,
  shouldPlayEffectSound,
  shouldSkipEffectSoundForVenuePresence,
  playEffectSound,
  _resetEffectSoundGuardForTest
} from './effectSoundPlayer.js';

describe('shouldPlayEffectSound', () => {
  it('ガード間隔未満なら false', () => {
    expect(shouldPlayEffectSound(1000, 1000 + EFFECT_SOUND_GUARD_MS - 1)).toBe(false);
  });

  it('ガード間隔以上なら true', () => {
    expect(shouldPlayEffectSound(1000, 1000 + EFFECT_SOUND_GUARD_MS)).toBe(true);
  });

  it('未再生(0)からガード間隔以上経てば true', () => {
    expect(shouldPlayEffectSound(0, EFFECT_SOUND_GUARD_MS)).toBe(true);
  });
});

describe('shouldSkipEffectSoundForVenuePresence', () => {
  it('会場プレゼンスが新鮮ならスキップ(true)', () => {
    expect(shouldSkipEffectSoundForVenuePresence(1000, 1000 + 3000, 8000)).toBe(true);
  });

  it('会場プレゼンスが古ければスキップしない(false)', () => {
    expect(shouldSkipEffectSoundForVenuePresence(1000, 1000 + 9000, 8000)).toBe(false);
  });

  it('会場プレゼンスが無い(0)ならスキップしない', () => {
    expect(shouldSkipEffectSoundForVenuePresence(0, 1000, 8000)).toBe(false);
  });
});

describe('playEffectSound', () => {
  it('未知の種類は再生を試みない', () => {
    const audioFactory = vi.fn();
    playEffectSound('unknown_kind', { audioFactory, nowMs: 1 });
    expect(audioFactory).not.toHaveBeenCalled();
  });

  it('既知の種類は Audio を生成し play() を呼ぶ', () => {
    _resetEffectSoundGuardForTest();
    const playMock = vi.fn(() => Promise.resolve());
    const audioFactory = vi.fn(() => ({ volume: 0, play: playMock }));
    const getUrl = vi.fn((p) => `chrome-extension://x/${p}`);
    playEffectSound(EFFECT_SOUND_KINDS.GIFT, { audioFactory, getUrl, nowMs: 1000 });
    expect(getUrl).toHaveBeenCalledWith('sound/effect-gift.mp3');
    expect(audioFactory).toHaveBeenCalledWith('chrome-extension://x/sound/effect-gift.mp3');
    expect(playMock).toHaveBeenCalled();
  });

  it('ガード間隔内の連続呼び出しは2回目を鳴らさない', () => {
    _resetEffectSoundGuardForTest();
    const audioFactory = vi.fn(() => ({ volume: 0, play: vi.fn(() => Promise.resolve()) }));
    playEffectSound(EFFECT_SOUND_KINDS.AD, { audioFactory, nowMs: 1000 });
    playEffectSound(EFFECT_SOUND_KINDS.AD, { audioFactory, nowMs: 1000 + EFFECT_SOUND_GUARD_MS - 1 });
    expect(audioFactory).toHaveBeenCalledTimes(1);
  });

  it('種類ごとにガードは独立している', () => {
    _resetEffectSoundGuardForTest();
    const audioFactory = vi.fn(() => ({ volume: 0, play: vi.fn(() => Promise.resolve()) }));
    playEffectSound(EFFECT_SOUND_KINDS.RANK_UP, { audioFactory, nowMs: 1000 });
    playEffectSound(EFFECT_SOUND_KINDS.RANK_DOWN, { audioFactory, nowMs: 1000 });
    expect(audioFactory).toHaveBeenCalledTimes(2);
  });

  it('audioFactory が例外を投げても呼び出し元に伝播しない', () => {
    _resetEffectSoundGuardForTest();
    const audioFactory = vi.fn(() => { throw new Error('boom'); });
    expect(() => playEffectSound(EFFECT_SOUND_KINDS.GIFT, { audioFactory, nowMs: 1000 })).not.toThrow();
  });

  it('volume は 0-1 にクランプされる', () => {
    _resetEffectSoundGuardForTest();
    const audio = { volume: 0, play: vi.fn(() => Promise.resolve()) };
    const audioFactory = vi.fn(() => audio);
    playEffectSound(EFFECT_SOUND_KINDS.GIFT, { audioFactory, nowMs: 1000, volume: 5 });
    expect(audio.volume).toBe(1);
  });
});
