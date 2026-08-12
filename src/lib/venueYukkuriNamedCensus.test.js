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

  it('数値IDでない(a:系)は数値ID系カウンタ(checked)は対象外(桁境界とは別集計)', () => {
    const state = createVenueYukkuriNamedCensusState();
    observeVenueYukkuriNamedTile(state, { uid: 'a:anon-1', rawName: '名前あり', displaySrc: IDENTICON });
    expect(state.checked).toBe(0);
  });

  it('uid空(素性不明)は匿名系カウンタも対象外', () => {
    const state = createVenueYukkuriNamedCensusState();
    observeVenueYukkuriNamedTile(state, { uid: '', rawName: '名前あり', displaySrc: IDENTICON });
    expect(state.checkedAnonymousStyle).toBe(0);
  });

  it('2026-07-20実測(実配信で誤検知10件→判明): rawNameが「匿名（uid）」合成ラベル(displayUserLabelの' +
    'フォールバック)なら数値ID系・匿名系どちらも対象外(本人の投稿名ではない)', () => {
    const state = createVenueYukkuriNamedCensusState();
    observeVenueYukkuriNamedTile(state, {
      uid: 'a:t_boQTpES7t72s20',
      rawName: '匿名（a:t_boQTpES7t72s20）',
      displaySrc: IDENTICON
    });
    expect(state.checkedAnonymousStyle).toBe(0);
    expect(state.yukkuriNamedAnonymousStyle).toBe(0);
  });

  it('rawNameが「匿名NNN」(anonymousDisplayLabel由来)も数値ID系で対象外', () => {
    const state = createVenueYukkuriNamedCensusState();
    observeVenueYukkuriNamedTile(state, { uid: '12345678', rawName: '匿名123', displaySrc: IDENTICON });
    expect(state.checked).toBe(0);
    expect(state.yukkuriNamed).toBe(0);
  });
});

describe('observeVenueYukkuriNamedTile（2026-07-20拡張: a:系/ハッシュ系の匿名スタイルカウンタ）', () => {
  it('a:系で実写/CDN URLなら不一致カウントは増えない(検査対象にはなる)', () => {
    const state = createVenueYukkuriNamedCensusState();
    observeVenueYukkuriNamedTile(state, { uid: 'a:anon-1', rawName: 'メデタセット', displaySrc: REAL_URL });
    expect(state.checkedAnonymousStyle).toBe(1);
    expect(state.yukkuriNamedAnonymousStyle).toBe(0);
  });

  it('a:系で名前ありがidenticonなら yukkuriNamedAnonymousStyle が増える(数値ID系のyukkuriNamedとは別集計)', () => {
    const state = createVenueYukkuriNamedCensusState();
    observeVenueYukkuriNamedTile(state, { uid: 'a:anon-1', rawName: 'メデタセット', displaySrc: IDENTICON });
    expect(state.checkedAnonymousStyle).toBe(1);
    expect(state.yukkuriNamedAnonymousStyle).toBe(1);
    expect(state.yukkuriNamed).toBe(0);
    expect(state.lastSampleAnonymousStyle).toEqual({ uid: 'a:anon-1', name: 'メデタセット' });
  });

  it('ハッシュ系(10〜26文字英数字)も匿名スタイルカウンタで観測される', () => {
    const state = createVenueYukkuriNamedCensusState();
    observeVenueYukkuriNamedTile(state, {
      uid: 'abcdef1234567890',
      rawName: '花子',
      displaySrc: IDENTICON
    });
    expect(state.yukkuriNamedAnonymousStyle).toBe(1);
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

  it('数値ID系は未観測(checked=0)でも匿名系が観測済みなら⚪にならない', () => {
    const state = createVenueYukkuriNamedCensusState();
    observeVenueYukkuriNamedTile(state, { uid: 'a:anon-1', rawName: 'メデタセット', displaySrc: REAL_URL });
    const diag = toVenueYukkuriNamedCensusDiag(state);
    expect(diag.line).not.toContain('⚪');
    expect(diag.line).toContain('✅');
    expect(diag.line).toContain('匿名系検1');
  });

  it('匿名系のみ実害ありは🔴+匿名系件数+直近匿名系サンプルを1行に含む', () => {
    const state = createVenueYukkuriNamedCensusState();
    observeVenueYukkuriNamedTile(state, { uid: 'a:anon-1', rawName: 'メデタセット', displaySrc: IDENTICON });
    const diag = toVenueYukkuriNamedCensusDiag(state);
    expect(diag.line).toContain('🔴');
    expect(diag.line).toContain('匿名系1件');
    expect(diag.line).toContain('メデタセット');
    expect(diag.line).toContain('uid=a:anon-1');
    expect(diag.yukkuriNamedAnonymousStyle).toBe(1);
  });

  it('壊れたstateでも例外を投げずnullを返す', () => {
    expect(toVenueYukkuriNamedCensusDiag(null)).toBeNull();
    expect(toVenueYukkuriNamedCensusDiag(undefined)).toBeNull();
  });

  /*
   * ★v0.1.1358(ユーザー実機 2026-08-12・指摘「名前があるのがゆっくりがお 計器が機能してない証拠」)
   *
   *   スクショの広告列: 「無職にまっしぐら」「そろおじさん」「ノエル」が
   *   **名前ありなのにゆっくり顔**。ところが速報は
   *     名前ありゆっくり顔 ✅ 検18(匿名系検0)
   *   = 実害0 と報告していた。
   *
   *   真因: uid が空のタイル(広告主・ゲスト)は `if (!uid) return` で
   *   **checked にすら入らず**完全に計器の外だった。
   *   ★「0件」は「異常なし」ではなく「測っていない」だった。
   */
  describe('★uid が無いタイル(広告主・ゲスト)も数える', () => {
    it('名前ありゆっくり顔なら🔴として数える(実機スクショの再現)', () => {
      const state = createVenueYukkuriNamedCensusState();
      // 広告列: 広告主名はあるが uid が取れない(公式ランキング由来)。
      observeVenueYukkuriNamedTile(state, { uid: '', rawName: 'そろおじさん', displaySrc: IDENTICON });
      observeVenueYukkuriNamedTile(state, { uid: '', rawName: 'ノエル', displaySrc: IDENTICON });
      const diag = toVenueYukkuriNamedCensusDiag(state);
      expect(diag.yukkuriNamedNoUid).toBe(2);
      expect(diag.checkedNoUid).toBe(2);
      expect(diag.line).toContain('🔴');
      expect(diag.line).toContain('ID無2件');
      expect(diag.line).toContain('ノエル');
    });

    it('★uid無しでも実写サムネなら正常(誤検知しない)', () => {
      const state = createVenueYukkuriNamedCensusState();
      observeVenueYukkuriNamedTile(state, {
        uid: '',
        rawName: 'ノエル',
        displaySrc: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/1.jpg'
      });
      const diag = toVenueYukkuriNamedCensusDiag(state);
      expect(diag.checkedNoUid).toBe(1);
      expect(diag.yukkuriNamedNoUid).toBe(0);
      expect(diag.line).toContain('✅');
    });

    it('uid無しの観測だけでも「未観測」にならない(測っている事実が出る)', () => {
      const state = createVenueYukkuriNamedCensusState();
      observeVenueYukkuriNamedTile(state, { uid: '', rawName: 'ゲスト太郎', displaySrc: 'https://x/y.jpg' });
      const diag = toVenueYukkuriNamedCensusDiag(state);
      expect(diag.line).not.toContain('未観測');
      expect(diag.line).toContain('ID無検1');
    });

    it('名前が無ければ従来どおり対象外(匿名は仕様どおり=ノイズにしない)', () => {
      const state = createVenueYukkuriNamedCensusState();
      observeVenueYukkuriNamedTile(state, { uid: '', rawName: '', displaySrc: IDENTICON });
      observeVenueYukkuriNamedTile(state, { uid: '', rawName: '匿名123', displaySrc: IDENTICON });
      const diag = toVenueYukkuriNamedCensusDiag(state);
      expect(diag.checkedNoUid).toBe(0);
      expect(diag.yukkuriNamedNoUid).toBe(0);
    });
  });
});
