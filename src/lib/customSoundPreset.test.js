import { describe, expect, it } from 'vitest';
import {
  CUSTOM_SOUND_PRESET,
  CUSTOM_SOUND_PRESET_KEYS,
  countPresetAssets,
  parseAudiostockNoFromFilename,
  presetIdForNo,
  buildPresetNoIndex
} from './customSoundPreset.js';

describe('CUSTOM_SOUND_PRESET(85素材の完全割り当て表)', () => {
  it('全85素材が割り当て済み(SE52+ボイス22+BGM11の検算)', () => {
    expect(countPresetAssets()).toBe(85);
  });

  it('id が重複しない', () => {
    const ids = [];
    for (const list of Object.values(CUSTOM_SOUND_PRESET)) {
      for (const asset of list) ids.push(asset.id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('No. も重複しない', () => {
    const nos = [];
    for (const list of Object.values(CUSTOM_SOUND_PRESET)) {
      for (const asset of list) nos.push(asset.no);
    }
    expect(new Set(nos).size).toBe(nos.length);
  });

  it('全キーの id は as_<No.> 形式', () => {
    for (const list of Object.values(CUSTOM_SOUND_PRESET)) {
      for (const asset of list) {
        expect(asset.id).toBe(`as_${asset.no}`);
      }
    }
  });

  it('既存SEキー(gift_*, milestone_*, reach, ad, rank_*)が含まれる', () => {
    for (const key of [
      'gift_small', 'gift_medium', 'gift_large', 'gift_mega',
      'milestone_soft', 'milestone_hard', 'milestone_jackpot',
      'reach', 'ad', 'rank_up', 'rank_down'
    ]) {
      expect(CUSTOM_SOUND_PRESET_KEYS).toContain(key);
    }
  });

  it('新設SEキー(breakthrough/payout/hold_lamp)が含まれる', () => {
    expect(CUSTOM_SOUND_PRESET_KEYS).toContain('breakthrough');
    expect(CUSTOM_SOUND_PRESET_KEYS).toContain('payout');
    expect(CUSTOM_SOUND_PRESET_KEYS).toContain('hold_lamp');
  });

  it('新設ボイスキー(voice_*)が7種含まれる', () => {
    const voiceKeys = CUSTOM_SOUND_PRESET_KEYS.filter((k) => k.startsWith('voice_'));
    expect(voiceKeys).toHaveLength(7);
  });

  it('新設BGMキー(bgm_*)が4種含まれる', () => {
    const bgmKeys = CUSTOM_SOUND_PRESET_KEYS.filter((k) => k.startsWith('bgm_'));
    expect(bgmKeys).toHaveLength(4);
  });

  it('bgm_jingle_win は固定1本', () => {
    expect(CUSTOM_SOUND_PRESET.bgm_jingle_win).toHaveLength(1);
  });
});

describe('parseAudiostockNoFromFilename', () => {
  it('audiostock_<No.>パターンをNo.として抽出する(拡張子問わず)', () => {
    expect(parseAudiostockNoFromFilename('audiostock_204361.mp3')).toBe(204361);
    expect(parseAudiostockNoFromFilename('audiostock_1587171.wav')).toBe(1587171);
    expect(parseAudiostockNoFromFilename('audiostock_812926.m4a')).toBe(812926);
  });

  it('パス付きファイル名でも抽出できる', () => {
    expect(parseAudiostockNoFromFilename('C:/download/audiostock_141689.mp3')).toBe(141689);
  });

  it('マッチしないファイル名は null', () => {
    expect(parseAudiostockNoFromFilename('random-file.mp3')).toBeNull();
    expect(parseAudiostockNoFromFilename('')).toBeNull();
    expect(parseAudiostockNoFromFilename(undefined)).toBeNull();
  });
});

describe('presetIdForNo', () => {
  it('No.からid(as_<No.>)を導出する', () => {
    expect(presetIdForNo(204361)).toBe('as_204361');
    expect(presetIdForNo('812926')).toBe('as_812926');
  });
});

describe('buildPresetNoIndex', () => {
  it('全85件のNo.が逆引きできる', () => {
    const idx = buildPresetNoIndex();
    expect(idx.size).toBe(85);
    expect(idx.get(204361)).toMatchObject({ key: 'gift_large', title: '【キュイーン】パチンコの演出に', id: 'as_204361' });
  });

  it('variantIndexは配列内の宣言順(変奏順)と一致する', () => {
    const idx = buildPresetNoIndex();
    expect(idx.get(812926)).toMatchObject({ key: 'gift_medium', variantIndex: 0 });
    expect(idx.get(1587171)).toMatchObject({ key: 'gift_medium', variantIndex: 1 });
  });
});
