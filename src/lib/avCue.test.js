import { describe, it, expect } from 'vitest';
import {
  VISUAL_FOR_AUDIO_KIND,
  visualForAudioKind,
  GIFT_LANDING_RATIO,
  planGiftLandingCueDelayMs,
  DEFAULT_EFFECT_VISUAL_LEVEL,
  visualLevelFor
} from './avCue.js';
import { EFFECT_SOUND_KINDS, EFFECT_SOUND_VARIANT_PATHS } from './effectSoundPlayer.js';
import { VOICE_KEY_LIMITS } from './voiceDirector.js';
import { GIFT_THROW_DURATION_MS } from './giftThrowProjectile.js';

// effectStage.js が実装済みの視覚キー集合(V1時点)。VISUAL_FOR_AUDIO_KIND の値はこの部分集合であること。
const IMPLEMENTED_VISUAL_KEYS_V1 = new Set(['', 'flash_t1', 'flash_t2', 'flash_t3', 'flash_t4']);

describe('VISUAL_FOR_AUDIO_KIND', () => {
  it('既知の音キー集合(gift tiers + ad + milestone + phase + voice_* + payout/hold_lamp/rank_*)を全数カバーする', () => {
    const knownKeys = new Set([
      ...Object.keys(EFFECT_SOUND_VARIANT_PATHS), // gift_small/medium/large/mega + reach
      EFFECT_SOUND_KINDS.AD,
      EFFECT_SOUND_KINDS.MILESTONE_SOFT,
      EFFECT_SOUND_KINDS.MILESTONE_HARD,
      EFFECT_SOUND_KINDS.MILESTONE_JACKPOT,
      EFFECT_SOUND_KINDS.RANK_UP,
      EFFECT_SOUND_KINDS.RANK_DOWN,
      'breakthrough',
      'payout',
      'hold_lamp',
      ...Object.keys(VOICE_KEY_LIMITS)
    ]);
    const tableKeys = new Set(Object.keys(VISUAL_FOR_AUDIO_KIND));
    for (const k of knownKeys) {
      expect(tableKeys.has(k), `対応表に${k}が無い`).toBe(true);
    }
    for (const k of tableKeys) {
      expect(knownKeys.has(k), `対応表の${k}が既知音キー集合に無い(削除された音キー?)`).toBe(true);
    }
  });

  it('値は全て文字列(空文字含む)= 型崩れが無い', () => {
    for (const v of Object.values(VISUAL_FOR_AUDIO_KIND)) {
      expect(typeof v).toBe('string');
    }
  });
});

describe('visualForAudioKind', () => {
  it('対応表にあるキーはそのまま値を返す', () => {
    expect(visualForAudioKind('gift_small')).toBe('flash_t1');
    expect(visualForAudioKind('gift_medium')).toBe('flash_t2');
    expect(visualForAudioKind('gift_large')).toBe('flash_t3');
    expect(visualForAudioKind('gift_mega')).toBe('flash_t4');
    expect(visualForAudioKind('ad')).toBe('flash_t2');
    expect(visualForAudioKind('payout')).toBe('coin_rain');
    expect(visualForAudioKind('hold_lamp')).toBe('lamp_pulse');
    expect(visualForAudioKind('voice_jackpot')).toBe('logo_jackpot');
    expect(visualForAudioKind('milestone_jackpot')).toBe('logo_jackpot');
  });

  it('意図的に視覚なしのキーは空文字', () => {
    expect(visualForAudioKind('voice_breakthrough')).toBe('');
    expect(visualForAudioKind('voice_stage')).toBe('');
    expect(visualForAudioKind('rank_up')).toBe('');
    expect(visualForAudioKind('rank_down')).toBe('');
  });

  it('未知キー/空/undefined/nullは空文字(安全側の無音視覚)', () => {
    expect(visualForAudioKind('bgm_jingle_win')).toBe('');
    expect(visualForAudioKind('totally_unknown_kind')).toBe('');
    expect(visualForAudioKind('')).toBe('');
    expect(visualForAudioKind(undefined)).toBe('');
    expect(visualForAudioKind(null)).toBe('');
  });

  it('V1時点で発火し得る視覚キー(flash系)は effectStage 実装済み集合の部分集合', () => {
    const giftAdKinds = ['gift_small', 'gift_medium', 'gift_large', 'gift_mega', 'ad'];
    for (const k of giftAdKinds) {
      expect(IMPLEMENTED_VISUAL_KEYS_V1.has(visualForAudioKind(k))).toBe(true);
    }
  });
});

describe('GIFT_LANDING_RATIO / planGiftLandingCueDelayMs', () => {
  it('比は0.72固定(既存keyframeのバースト点と一致)', () => {
    expect(GIFT_LANDING_RATIO).toBe(0.72);
  });

  it('GIFT_THROW_DURATION_MSの全tierで決定論の固定値を返す', () => {
    expect(planGiftLandingCueDelayMs(GIFT_THROW_DURATION_MS.small)).toBe(1080);
    expect(planGiftLandingCueDelayMs(GIFT_THROW_DURATION_MS.medium)).toBe(1260);
    expect(planGiftLandingCueDelayMs(GIFT_THROW_DURATION_MS.large)).toBe(1476);
    expect(planGiftLandingCueDelayMs(GIFT_THROW_DURATION_MS.mega)).toBe(1728);
  });

  it('同じ入力には常に同じ結果(決定論・乱数なし)', () => {
    const a = planGiftLandingCueDelayMs(1500);
    const b = planGiftLandingCueDelayMs(1500);
    expect(a).toBe(b);
  });

  it('不正値/0は0扱い', () => {
    expect(planGiftLandingCueDelayMs(0)).toBe(0);
    expect(planGiftLandingCueDelayMs(NaN)).toBe(0);
    expect(planGiftLandingCueDelayMs(undefined)).toBe(0);
  });
});

describe('visualLevelFor', () => {
  it('既定値は soft', () => {
    expect(DEFAULT_EFFECT_VISUAL_LEVEL).toBe('soft');
  });

  it('off/soft/maxはそのまま通す', () => {
    expect(visualLevelFor('off')).toBe('off');
    expect(visualLevelFor('soft')).toBe('soft');
    expect(visualLevelFor('max')).toBe('max');
  });

  it('不正値/未設定はsoftへフォールバック', () => {
    expect(visualLevelFor(undefined)).toBe('soft');
    expect(visualLevelFor(null)).toBe('soft');
    expect(visualLevelFor('')).toBe('soft');
    expect(visualLevelFor('invalid')).toBe('soft');
    expect(visualLevelFor(123)).toBe('soft');
  });
});
