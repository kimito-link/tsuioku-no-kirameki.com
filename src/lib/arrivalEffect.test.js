/**
 * arrivalEffect.js のテスト(ラベル組み立て・音階決定・CD判定・メーター重みの純関数)。
 */

import { describe, it, expect } from 'vitest';
import {
  buildArrivalLabel,
  arrivalSoundKindForCount,
  shouldFireArrivalEffect,
  arrivalMeterWeight,
  ARRIVAL_EFFECT_CD_MS
} from './arrivalEffect.js';

describe('buildArrivalLabel', () => {
  it('単一キーワードはそのままラベルになる', () => {
    expect(buildArrivalLabel({ entries: [{ keyword: '真夏の夜の淫夢', count: 1, source: 'dictionary' }], totalCount: 1 })).toBe('真夏の夜の淫夢');
  });

  it('複数キーワードは先頭+ほかN件形式', () => {
    expect(
      buildArrivalLabel({
        entries: [
          { keyword: 'ニコニコ生放送', count: 2, source: 'like' },
          { keyword: '真夏の夜の淫夢', count: 1, source: 'like' }
        ],
        totalCount: 3
      })
    ).toBe('ニコニコ生放送 ほか1件');
  });

  it('3件以上でも先頭+残り件数', () => {
    expect(
      buildArrivalLabel({
        entries: [
          { keyword: 'A', count: 1, source: 'dictionary' },
          { keyword: 'B', count: 2, source: 'dictionary' },
          { keyword: 'C', count: 3, source: 'dictionary' }
        ],
        totalCount: 6
      })
    ).toBe('A ほか2件');
  });

  it('長いキーワードは省略される', () => {
    const label = buildArrivalLabel({ entries: [{ keyword: 'あ'.repeat(30), count: 1, source: 'dictionary' }], totalCount: 1 });
    expect(label.endsWith('…')).toBe(true);
    expect(Array.from(label).length).toBeLessThanOrEqual(15);
  });

  it('entries が空/不正なら既定ラベル', () => {
    expect(buildArrivalLabel({ entries: [], totalCount: 0 })).toBe('来場');
    expect(buildArrivalLabel(null)).toBe('来場');
    expect(buildArrivalLabel(undefined)).toBe('来場');
  });
});

describe('arrivalSoundKindForCount', () => {
  // 設計原則(ユーザー確定): 無料イベントの来場は有料ギフト演出より必ず控えめ。
  //   人数(totalCount)に関わらず常に hold_lamp 固定(昇格禁止・音量も既定のまま)。
  it('1人は hold_lamp', () => {
    expect(arrivalSoundKindForCount(1)).toBe('hold_lamp');
  });

  it('0人(不正値)も hold_lamp扱い', () => {
    expect(arrivalSoundKindForCount(0)).toBe('hold_lamp');
  });

  it('2〜4人でも昇格せず hold_lamp のまま', () => {
    expect(arrivalSoundKindForCount(2)).toBe('hold_lamp');
    expect(arrivalSoundKindForCount(3)).toBe('hold_lamp');
    expect(arrivalSoundKindForCount(4)).toBe('hold_lamp');
  });

  it('5人以上の大量来場でも昇格せず hold_lamp のまま(来場は常に最下段の演出強度)', () => {
    expect(arrivalSoundKindForCount(5)).toBe('hold_lamp');
    expect(arrivalSoundKindForCount(100)).toBe('hold_lamp');
  });
});

describe('shouldFireArrivalEffect', () => {
  it('CD経過前はfalse', () => {
    expect(shouldFireArrivalEffect(1000, 1000 + ARRIVAL_EFFECT_CD_MS - 1)).toBe(false);
  });

  it('CDちょうど経過はtrue', () => {
    expect(shouldFireArrivalEffect(1000, 1000 + ARRIVAL_EFFECT_CD_MS)).toBe(true);
  });

  it('未発火(0)でも十分先の時刻ならtrue', () => {
    expect(shouldFireArrivalEffect(0, ARRIVAL_EFFECT_CD_MS)).toBe(true);
  });

  it('未発火(0)でもnowMsがCD未満なら発火不可(0=epoch起点であって特別扱いではない)', () => {
    expect(shouldFireArrivalEffect(0, 1)).toBe(false);
  });

  it('カスタムCD値を尊重する', () => {
    expect(shouldFireArrivalEffect(1000, 1500, 1000)).toBe(false);
    expect(shouldFireArrivalEffect(1000, 2000, 1000)).toBe(true);
  });
});

describe('arrivalMeterWeight', () => {
  it('コメントと同じ重み(1人=1)', () => {
    expect(arrivalMeterWeight(1)).toBe(1);
  });

  it('人数ぶん加算される', () => {
    expect(arrivalMeterWeight(3)).toBe(3);
  });

  it('上限5でクランプされる', () => {
    expect(arrivalMeterWeight(100)).toBe(5);
  });

  it('0人以下は0', () => {
    expect(arrivalMeterWeight(0)).toBe(0);
    expect(arrivalMeterWeight(-5)).toBe(0);
  });
});
