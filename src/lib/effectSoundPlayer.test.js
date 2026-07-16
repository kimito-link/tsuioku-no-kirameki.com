import { describe, expect, it, vi } from 'vitest';
import {
  EFFECT_SOUND_KINDS,
  EFFECT_SOUND_GUARD_MS,
  EFFECT_SOUND_PATHS,
  EFFECT_SOUND_VARIANT_PATHS,
  shouldPlayEffectSound,
  shouldSkipEffectSoundForVenuePresence,
  resolveEffectSoundPath,
  effectSoundKindForGiftTier,
  playEffectSound,
  defaultVolumeForEffectSoundKind,
  EFFECT_SOUND_DEFAULT_VOLUME,
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

describe('resolveEffectSoundPath', () => {
  it('バリエーションが無い種類は EFFECT_SOUND_PATHS の単一パスを返す(後方互換)', () => {
    expect(resolveEffectSoundPath(EFFECT_SOUND_KINDS.GIFT)).toBe(EFFECT_SOUND_PATHS[EFFECT_SOUND_KINDS.GIFT]);
  });

  // 2026-07-16: ad/rank_upは効果音ラボ(soundeffect-lab.info)の専用素材(sound/tiers/ad-*.mp3・
  //   rank-up-*.mp3)へ、rank_downは引き続き自作合成音(gift-small・価値序列上いちばん控えめ)へ。
  it('adは効果音ラボ由来の専用バリエーション(sound/tiers/ad-*.mp3)を返す', () => {
    const variants = EFFECT_SOUND_VARIANT_PATHS[EFFECT_SOUND_KINDS.AD];
    expect(resolveEffectSoundPath(EFFECT_SOUND_KINDS.AD, { rng: () => 0 })).toBe(variants[0]);
    expect(resolveEffectSoundPath(EFFECT_SOUND_KINDS.AD, { rng: () => 0.999 })).toBe(variants[2]);
  });

  it('rank_upは効果音ラボ由来の専用バリエーション(sound/tiers/rank-up-*.mp3)を返す', () => {
    const variants = EFFECT_SOUND_VARIANT_PATHS[EFFECT_SOUND_KINDS.RANK_UP];
    expect(resolveEffectSoundPath(EFFECT_SOUND_KINDS.RANK_UP, { rng: () => 0 })).toBe(variants[0]);
    expect(resolveEffectSoundPath(EFFECT_SOUND_KINDS.RANK_UP, { rng: () => 0.999 })).toBe(variants[2]);
  });

  it('rank_downは自作合成音(gift-small系)をバリエーションとして返す', () => {
    const variants = EFFECT_SOUND_VARIANT_PATHS[EFFECT_SOUND_KINDS.RANK_DOWN];
    expect(resolveEffectSoundPath(EFFECT_SOUND_KINDS.RANK_DOWN, { rng: () => 0 })).toBe(variants[0]);
    expect(resolveEffectSoundPath(EFFECT_SOUND_KINDS.RANK_DOWN, { rng: () => 0.999 })).toBe(variants[2]);
  });

  it('ad/rank_up/rank_downのバリエーションは3件ずつでEFFECT_SOUND_PATHSの旧パスと異なる', () => {
    for (const kind of [EFFECT_SOUND_KINDS.AD, EFFECT_SOUND_KINDS.RANK_UP, EFFECT_SOUND_KINDS.RANK_DOWN]) {
      const variants = EFFECT_SOUND_VARIANT_PATHS[kind];
      expect(variants).toHaveLength(3);
      for (const v of variants) {
        expect(v).not.toBe(EFFECT_SOUND_PATHS[kind]);
      }
    }
  });

  it('バリエーションがある種類は候補一覧の中からrngで選ぶ', () => {
    const variants = EFFECT_SOUND_VARIANT_PATHS[EFFECT_SOUND_KINDS.MILESTONE_SOFT];
    expect(resolveEffectSoundPath(EFFECT_SOUND_KINDS.MILESTONE_SOFT, { rng: () => 0 })).toBe(variants[0]);
    expect(resolveEffectSoundPath(EFFECT_SOUND_KINDS.MILESTONE_SOFT, { rng: () => 0.999 })).toBe(variants[2]);
  });

  it('rng未指定でも候補一覧のいずれかを返す(Math.randomフォールバック)', () => {
    const variants = EFFECT_SOUND_VARIANT_PATHS[EFFECT_SOUND_KINDS.MILESTONE_JACKPOT];
    const result = resolveEffectSoundPath(EFFECT_SOUND_KINDS.MILESTONE_JACKPOT);
    expect(variants).toContain(result);
  });

  it('未知の種類はundefinedを返す', () => {
    expect(resolveEffectSoundPath('nonexistent_kind')).toBeUndefined();
  });

  it('gift_small/medium/large/megaのバリエーションが3件ずつ定義されている', () => {
    for (const key of ['gift_small', 'gift_medium', 'gift_large', 'gift_mega']) {
      expect(EFFECT_SOUND_VARIANT_PATHS[key]).toHaveLength(3);
    }
  });

  it('reachのバリエーションが2件定義されている', () => {
    expect(EFFECT_SOUND_VARIANT_PATHS.reach).toHaveLength(2);
  });
});

describe('effectSoundKindForGiftTier', () => {
  it('small/medium/large/megaをそれぞれ対応するキーに変換する', () => {
    expect(effectSoundKindForGiftTier('small')).toBe('gift_small');
    expect(effectSoundKindForGiftTier('medium')).toBe('gift_medium');
    expect(effectSoundKindForGiftTier('large')).toBe('gift_large');
    expect(effectSoundKindForGiftTier('mega')).toBe('gift_mega');
  });

  it('未知/未指定のtierは既定のgiftキーにフォールバックする', () => {
    expect(effectSoundKindForGiftTier(undefined)).toBe(EFFECT_SOUND_KINDS.GIFT);
    expect(effectSoundKindForGiftTier(null)).toBe(EFFECT_SOUND_KINDS.GIFT);
    expect(effectSoundKindForGiftTier('unknown')).toBe(EFFECT_SOUND_KINDS.GIFT);
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

describe('v0.1.1061: 種類別の既定音量と正直な戻り値', () => {
  it('ギフト系(gift/gift_small〜mega)の既定音量は1.0・その他は0.7', () => {
    expect(defaultVolumeForEffectSoundKind('gift')).toBe(1.0);
    expect(defaultVolumeForEffectSoundKind('gift_small')).toBe(1.0);
    expect(defaultVolumeForEffectSoundKind('gift_mega')).toBe(1.0);
    expect(defaultVolumeForEffectSoundKind('milestone_soft')).toBe(EFFECT_SOUND_DEFAULT_VOLUME);
    expect(defaultVolumeForEffectSoundKind('ad')).toBe(EFFECT_SOUND_DEFAULT_VOLUME);
    expect(defaultVolumeForEffectSoundKind('')).toBe(EFFECT_SOUND_DEFAULT_VOLUME);
  });

  it('volume 未指定ならギフトは1.0で鳴る(配信音声に埋もれない)', () => {
    _resetEffectSoundGuardForTest();
    const audio = { volume: 0, play: vi.fn(() => Promise.resolve()) };
    playEffectSound(EFFECT_SOUND_KINDS.GIFT, { audioFactory: () => audio, nowMs: 1000 });
    expect(audio.volume).toBe(1.0);
  });

  it('鳴らしたら played・ガードに食われたら guarded・不明種別は no-path を返す', () => {
    _resetEffectSoundGuardForTest();
    const audioFactory = vi.fn(() => ({ volume: 0, play: vi.fn(() => Promise.resolve()) }));
    expect(playEffectSound(EFFECT_SOUND_KINDS.AD, { audioFactory, nowMs: 1000 })).toBe('played');
    expect(playEffectSound(EFFECT_SOUND_KINDS.AD, { audioFactory, nowMs: 1100 })).toBe('guarded');
    expect(playEffectSound('unknown_kind', { audioFactory, nowMs: 1000 })).toBe('no-path');
  });

  it('audioFactory の例外は error を返す(伝播しない)', () => {
    _resetEffectSoundGuardForTest();
    const audioFactory = vi.fn(() => { throw new Error('boom'); });
    expect(playEffectSound(EFFECT_SOUND_KINDS.GIFT, { audioFactory, nowMs: 1000 })).toBe('error');
  });
});
