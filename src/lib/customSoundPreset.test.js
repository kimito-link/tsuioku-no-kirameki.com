import { describe, expect, it } from 'vitest';
import {
  CUSTOM_SOUND_PRESET,
  CUSTOM_SOUND_PRESET_KEYS,
  countPresetAssets,
  parseAudiostockNoFromFilename,
  presetIdForNo,
  buildPresetNoIndex
} from './customSoundPreset.js';

// council/operation-sound-SYNTHESIS.md §5.1: op_* キー(Phase D1操作音)は既存85本の同一No.を
//   複数キーから「意図的に」参照する(重複購入ゼロにするための設計)。よって id/No. の重複禁止は
//   op_* を除いた元の85本表の中でのみ検証する(op_*での再参照は仕様どおりで異常ではない)。
const ORIGINAL_85_KEYS = Object.keys(CUSTOM_SOUND_PRESET).filter((k) => !k.startsWith('op_'));

describe('CUSTOM_SOUND_PRESET(85素材の完全割り当て表)', () => {
  it('元の85素材が割り当て済み(SE52+ボイス22+BGM11の検算・op_*を除く)', () => {
    const original85Count = ORIGINAL_85_KEYS.reduce(
      (sum, key) => sum + CUSTOM_SOUND_PRESET[key].length,
      0
    );
    expect(original85Count).toBe(85);
  });

  it('op_* を含む全キーの延べアセット数はcountPresetAssetsと一致する(op_*は既存Noの再参照ぶん加算)', () => {
    const opKeys = Object.keys(CUSTOM_SOUND_PRESET).filter((k) => k.startsWith('op_'));
    const opCount = opKeys.reduce((sum, key) => sum + CUSTOM_SOUND_PRESET[key].length, 0);
    const original85Count = ORIGINAL_85_KEYS.reduce(
      (sum, key) => sum + CUSTOM_SOUND_PRESET[key].length,
      0
    );
    expect(countPresetAssets()).toBe(original85Count + opCount);
  });

  it('id が重複しない(op_*を除く元の85本表の中で)', () => {
    const ids = [];
    for (const key of ORIGINAL_85_KEYS) {
      for (const asset of CUSTOM_SOUND_PRESET[key]) ids.push(asset.id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('No. も重複しない(op_*を除く元の85本表の中で)', () => {
    const nos = [];
    for (const key of ORIGINAL_85_KEYS) {
      for (const asset of CUSTOM_SOUND_PRESET[key]) nos.push(asset.no);
    }
    expect(new Set(nos).size).toBe(nos.length);
  });

  it('op_* キーが載っているアセットのNo.は元の85本表に実在する(流用元の裏取り)', () => {
    const originalNos = new Set();
    for (const key of ORIGINAL_85_KEYS) {
      for (const asset of CUSTOM_SOUND_PRESET[key]) originalNos.add(asset.no);
    }
    const opKeys = Object.keys(CUSTOM_SOUND_PRESET).filter((k) => k.startsWith('op_'));
    for (const key of opKeys) {
      for (const asset of CUSTOM_SOUND_PRESET[key]) {
        expect(originalNos.has(asset.no)).toBe(true);
      }
    }
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

  it('Phase D1新設op_*キー(操作音)が視聴イベントキーと不共有の13種で含まれる', () => {
    const opKeys = CUSTOM_SOUND_PRESET_KEYS.filter((k) => k.startsWith('op_'));
    expect(opKeys).toHaveLength(13);
    for (const key of [
      'op_handle', 'op_shot_1', 'op_shot_2', 'op_shot_3', 'op_shot_4',
      'op_self_milestone', 'op_toggle_on', 'op_toggle_off',
      'op_panel_open', 'op_panel_close', 'op_seat', 'op_copy', 'op_publish'
    ]) {
      expect(opKeys).toContain(key);
    }
  });

  it('op_shot_1〜3・op_handle・op_toggle_on/off専用素材は未調達(空配列=no-path・安全側)', () => {
    for (const key of ['op_handle', 'op_shot_1', 'op_shot_2', 'op_shot_3']) {
      expect(CUSTOM_SOUND_PRESET[key]).toHaveLength(0);
    }
  });

  it('op_shot_4・op_self_milestone・op_toggle_on/off・op_panel_*・op_seat・op_copy・op_publishは既存No.流用で1件ずつ割当済み', () => {
    for (const key of [
      'op_shot_4', 'op_self_milestone', 'op_toggle_on', 'op_toggle_off',
      'op_panel_open', 'op_panel_close', 'op_seat', 'op_copy', 'op_publish'
    ]) {
      expect(CUSTOM_SOUND_PRESET[key]).toHaveLength(1);
    }
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
