import { describe, it, expect } from 'vitest';
import {
  createVenueYukkuriNamedCensusState,
  observeVenueYukkuriNamedTile,
  toVenueYukkuriNamedCensusDiag
} from './venueYukkuriNamedCensus.js';

/**
 * venueYukkuriNamedCensus.js — 「名前ありゆっくり顔」実害確定計器(診断先行アプローチ)。
 * 真因: isAnonymousStyleNicoUserId(^\d{5,14}$)の桁レンジ境界(4桁以下/15桁以上)。
 * 掟: 数えるだけ・DOM/データを触らない(venueDomCensus.jsと同じ)。
 */

const IDENTICON = 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E';
const REAL_URL = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1234/12345678.jpg';

describe('createVenueYukkuriNamedCensusState', () => {
  it('初期値は全部ゼロ・lastSampleはnull', () => {
    const state = createVenueYukkuriNamedCensusState();
    expect(state.checked).toBe(0);
    expect(state.yukkuriNamed).toBe(0);
    expect(state.outOfRangeDigits).toBe(0);
    expect(state.lastSample).toBeNull();
  });
});

describe('observeVenueYukkuriNamedTile（正常系）', () => {
  it('実写/CDN URLで名前ありなら不一致カウントは増えない(検査対象にはなる)', () => {
    const state = createVenueYukkuriNamedCensusState();
    observeVenueYukkuriNamedTile(state, { uid: '12345678', rawName: '太郎', displaySrc: REAL_URL });
    expect(state.checked).toBe(1);
    expect(state.yukkuriNamed).toBe(0);
  });

  it('名前が無いタイル(匿名表示名"匿名NNN"がidenticon)は対象外', () => {
    const state = createVenueYukkuriNamedCensusState();
    observeVenueYukkuriNamedTile(state, { uid: '1234', rawName: '', displaySrc: IDENTICON });
    expect(state.checked).toBe(0);
    expect(state.yukkuriNamed).toBe(0);
  });

  it('数値IDでない(a:系)は対象外(仕様通りのidenticon)', () => {
    const state = createVenueYukkuriNamedCensusState();
    observeVenueYukkuriNamedTile(state, { uid: 'a:anon-1', rawName: '名前あり', displaySrc: IDENTICON });
    expect(state.checked).toBe(0);
  });
});

describe('observeVenueYukkuriNamedTile（実害: 桁境界の数値IDが名前ありでidenticon）', () => {
  it('4桁以下の数値IDで名前ありがidenticonなら yukkuriNamed が増える', () => {
    const state = createVenueYukkuriNamedCensusState();
    observeVenueYukkuriNamedTile(state, { uid: '1234', rawName: '花子', displaySrc: IDENTICON });
    expect(state.checked).toBe(1);
    expect(state.yukkuriNamed).toBe(1);
    expect(state.outOfRangeDigits).toBe(1);
    expect(state.lastSample).toEqual({ uid: '1234', name: '花子', digits: 4 });
  });

  it('15桁以上の数値IDで名前ありがidenticonなら yukkuriNamed が増える', () => {
    const state = createVenueYukkuriNamedCensusState();
    observeVenueYukkuriNamedTile(state, {
      uid: '123456789012345',
      rawName: '次郎',
      displaySrc: IDENTICON
    });
    expect(state.yukkuriNamed).toBe(1);
    expect(state.outOfRangeDigits).toBe(1);
  });

  it('5〜14桁の範囲内の数値IDが名前ありでidenticonになる(別要因のバグ)場合も検知するがoutOfRangeDigitsには入れない', () => {
    const state = createVenueYukkuriNamedCensusState();
    observeVenueYukkuriNamedTile(state, { uid: '12345678', rawName: '三郎', displaySrc: IDENTICON });
    expect(state.yukkuriNamed).toBe(1);
    expect(state.outOfRangeDigits).toBe(0);
  });

  it('lastSampleは最後の1件で上書きされる', () => {
    const state = createVenueYukkuriNamedCensusState();
    observeVenueYukkuriNamedTile(state, { uid: '1234', rawName: 'A', displaySrc: IDENTICON });
    observeVenueYukkuriNamedTile(state, { uid: '99999999999999999', rawName: 'B', displaySrc: IDENTICON });
    expect(state.lastSample?.name).toBe('B');
    expect(state.yukkuriNamed).toBe(2);
  });
});

describe('toVenueYukkuriNamedCensusDiag', () => {
  it('checked=0は⚪未観測', () => {
    const diag = toVenueYukkuriNamedCensusDiag(createVenueYukkuriNamedCensusState());
    expect(diag.line).toBe('名前ありゆっくり顔 ⚪ 未観測');
  });

  it('yukkuriNamed=0は✅', () => {
    const state = createVenueYukkuriNamedCensusState();
    observeVenueYukkuriNamedTile(state, { uid: '12345678', rawName: '太郎', displaySrc: REAL_URL });
    const diag = toVenueYukkuriNamedCensusDiag(state);
    expect(diag.line).toContain('✅');
    expect(diag.line).toContain('検1');
  });

  it('yukkuriNamed>0は🔴+件数+桁境界件数+直近サンプルを1行に含む', () => {
    const state = createVenueYukkuriNamedCensusState();
    observeVenueYukkuriNamedTile(state, { uid: '1234', rawName: '花子', displaySrc: IDENTICON });
    const diag = toVenueYukkuriNamedCensusDiag(state);
    expect(diag.line).toContain('🔴');
    expect(diag.line).toContain('1件');
    expect(diag.line).toContain('桁境界1');
    expect(diag.line).toContain('花子');
    expect(diag.yukkuriNamed).toBe(1);
  });

  it('壊れたstateでも例外を投げずnullを返す', () => {
    expect(toVenueYukkuriNamedCensusDiag(null)).toBeNull();
    expect(toVenueYukkuriNamedCensusDiag(undefined)).toBeNull();
  });
});
