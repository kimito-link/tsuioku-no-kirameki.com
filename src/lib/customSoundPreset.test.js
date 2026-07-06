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
// SC3(council/broadcast-scoring-SYNTHESIS.md §4)の score_* キーは元の85本表とは別枠の
//   追加DL分(D2)なので、op_* と同様に「元の85本表」からは除外して検証する
//   (v0.1.1079の d1DownloadedNos 方式を踏襲・別枠として許容リストで裏取りする)。
const ORIGINAL_85_KEYS = Object.keys(CUSTOM_SOUND_PRESET).filter(
  (k) => !k.startsWith('op_') && !k.startsWith('score_')
);

describe('CUSTOM_SOUND_PRESET(85素材の完全割り当て表)', () => {
  it('元の85素材が割り当て済み(SE52+ボイス22+BGM11の検算・op_*を除く)', () => {
    const original85Count = ORIGINAL_85_KEYS.reduce(
      (sum, key) => sum + CUSTOM_SOUND_PRESET[key].length,
      0
    );
    expect(original85Count).toBe(85);
  });

  it('op_*・score_* を含む全キーの延べアセット数はcountPresetAssetsと一致する(op_*は既存Noの再参照ぶん、score_*はSC3追加DL6本ぶんを加算)', () => {
    const opKeys = Object.keys(CUSTOM_SOUND_PRESET).filter((k) => k.startsWith('op_'));
    const opCount = opKeys.reduce((sum, key) => sum + CUSTOM_SOUND_PRESET[key].length, 0);
    const scoreKeys = Object.keys(CUSTOM_SOUND_PRESET).filter((k) => k.startsWith('score_'));
    const scoreCount = scoreKeys.reduce((sum, key) => sum + CUSTOM_SOUND_PRESET[key].length, 0);
    const original85Count = ORIGINAL_85_KEYS.reduce(
      (sum, key) => sum + CUSTOM_SOUND_PRESET[key].length,
      0
    );
    expect(countPresetAssets()).toBe(original85Count + opCount + scoreCount);
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

  it('op_* キーのNo.は元の85本表への流用か、D1追加DL済み5本のどちらかに限られる(裏取り)', () => {
    const originalNos = new Set();
    for (const key of ORIGINAL_85_KEYS) {
      for (const asset of CUSTOM_SOUND_PRESET[key]) originalNos.add(asset.no);
    }
    // v0.1.1079: D1実装時に Audiostock 定額で追加DLされた操作音5本(計90本)。
    //   D1でプリセット配線が漏れて無音だったのを修正した際にここへ登録。
    const d1DownloadedNos = new Set([861221, 1652750, 1260384, 258054, 108443]);
    const opKeys = Object.keys(CUSTOM_SOUND_PRESET).filter((k) => k.startsWith('op_'));
    for (const key of opKeys) {
      for (const asset of CUSTOM_SOUND_PRESET[key]) {
        expect(originalNos.has(asset.no) || d1DownloadedNos.has(asset.no)).toBe(true);
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

  it('op_handle/op_shot_1〜3はD1追加DL分が配線済み(v0.1.1079の配線漏れ修正を固定)', () => {
    expect(CUSTOM_SOUND_PRESET.op_handle.map((a) => a.no)).toEqual([861221]);
    expect(CUSTOM_SOUND_PRESET.op_shot_1.map((a) => a.no)).toEqual([1652750]);
    expect(CUSTOM_SOUND_PRESET.op_shot_2.map((a) => a.no)).toEqual([1260384]);
    expect(CUSTOM_SOUND_PRESET.op_shot_3.map((a) => a.no)).toEqual([258054]);
  });

  it('op_shot_4・op_self_milestone・op_toggle_on/off・op_panel_close・op_seat・op_copy・op_publishは既存No.流用で1件ずつ割当済み', () => {
    for (const key of [
      'op_shot_4', 'op_self_milestone', 'op_toggle_on', 'op_toggle_off',
      'op_panel_close', 'op_seat', 'op_copy', 'op_publish'
    ]) {
      expect(CUSTOM_SOUND_PRESET[key]).toHaveLength(1);
    }
    // op_panel_open は既存流用+ガチャ扉(D1追加DL)の2変奏(順繰り)。
    expect(CUSTOM_SOUND_PRESET.op_panel_open.map((a) => a.no)).toEqual([141839, 108443]);
  });

  it('SC3新設score_*キー(結果発表演出)が6種含まれる(council/broadcast-scoring-SYNTHESIS.md §4)', () => {
    const scoreKeys = CUSTOM_SOUND_PRESET_KEYS.filter((k) => k.startsWith('score_'));
    expect(scoreKeys).toHaveLength(6);
    for (const key of [
      'score_drumroll', 'score_tick', 'score_result',
      'score_applause', 'score_swoosh', 'score_jingle_s'
    ]) {
      expect(scoreKeys).toContain(key);
    }
  });

  it('score_* キーは全て実データ入り(空配列でない=未割当を偽らない)', () => {
    for (const key of ['score_drumroll', 'score_tick', 'score_result', 'score_applause', 'score_swoosh', 'score_jingle_s']) {
      expect(CUSTOM_SOUND_PRESET[key].length).toBeGreaterThan(0);
    }
  });

  it('score_* キーのNo.は2026-07-06にAudiostock定額で追加DL済みの6本に固定される(実素材割当の裏取り)', () => {
    // council/broadcast-scoring-SYNTHESIS.md §4 で指定された実No.(D2追加DL分・SC5相当を本patchで前倒し実装)。
    const d2DownloadedNos = new Set([
      811438, 52577, // score_drumroll
      57770, 174486, // score_tick
      1511523, 233383, // score_result
      877975, 53069, // score_applause
      91798, // score_swoosh
      1048482 // score_jingle_s
    ]);
    expect(d2DownloadedNos.size).toBe(10);
    const scoreKeys = CUSTOM_SOUND_PRESET_KEYS.filter((k) => k.startsWith('score_'));
    for (const key of scoreKeys) {
      for (const asset of CUSTOM_SOUND_PRESET[key]) {
        expect(d2DownloadedNos.has(asset.no)).toBe(true);
      }
    }
  });

  it('score_* キーのNo.は元の85本表・op_*とも重複しない(重複購入ゼロの裏取り)', () => {
    const otherNos = new Set();
    for (const key of Object.keys(CUSTOM_SOUND_PRESET)) {
      if (key.startsWith('score_')) continue;
      for (const asset of CUSTOM_SOUND_PRESET[key]) otherNos.add(asset.no);
    }
    const scoreKeys = CUSTOM_SOUND_PRESET_KEYS.filter((k) => k.startsWith('score_'));
    for (const key of scoreKeys) {
      for (const asset of CUSTOM_SOUND_PRESET[key]) {
        expect(otherNos.has(asset.no)).toBe(false);
      }
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
  it('全100件のユニークNo.が逆引きできる(Mapキーのため重複Noは1件に畳まれる・85本+D1追加DL5本+SC3 score_*追加DL6本のうち重複分を除いた実数)', () => {
    const idx = buildPresetNoIndex();
    expect(idx.size).toBe(100);
    expect(idx.get(204361)).toMatchObject({ key: 'gift_large', title: '【キュイーン】パチンコの演出に', id: 'as_204361' });
    expect(idx.get(1260384)).toMatchObject({ key: 'op_shot_2', id: 'as_1260384' });
    expect(idx.get(811438)).toMatchObject({ key: 'score_drumroll', id: 'as_811438' });
    expect(idx.get(1048482)).toMatchObject({ key: 'score_jingle_s', id: 'as_1048482' });
  });

  it('variantIndexは配列内の宣言順(変奏順)と一致する', () => {
    const idx = buildPresetNoIndex();
    expect(idx.get(812926)).toMatchObject({ key: 'gift_medium', variantIndex: 0 });
    expect(idx.get(1587171)).toMatchObject({ key: 'gift_medium', variantIndex: 1 });
  });
});
