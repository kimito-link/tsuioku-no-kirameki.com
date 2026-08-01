import { describe, expect, it } from 'vitest';
import { classifyVenueGeometryDiff, formatVenueGeometryCause } from './venueGeometryVerdict.js';

/**
 * 2026-08-01 実測(lv351079683)で `幾何≠ link:128×40px(①110×38px)` が出たが、
 * ①popup.html と venueBar.js の当該CSSはバイト単位で同一だった。
 * 計器が各段の【先頭タイル1枚】しか測らないため、①と会場で先頭の人が違うと
 * 名前の長さの差だけでタイル幅が変わる(meta は max-width までの収縮ボックス)。
 *
 * 「直す必要のないCSSを触って壊す」のを防ぐのがこの判定の目的。
 */
describe('classifyVenueGeometryDiff', () => {
  it('同一人物を測っているなら本物のCSS不一致と判定する', () => {
    const v = classifyVenueGeometryDiff({ tileKey: '55141222' }, { tileKey: '55141222' });
    expect(v.cause).toBe('css_mismatch');
    expect(v.sameTarget).toBe(true);
  });

  it('別人を測っているならCSS不一致とは言えないと判定する', () => {
    const v = classifyVenueGeometryDiff({ tileKey: '55141222' }, { tileKey: 'a:H0oFiJ' });
    expect(v.cause).toBe('measured_different_people');
    expect(v.sameTarget).toBe(false);
    // どちらを測ったかを note に残す(次の調査で追える)
    expect(v.note).toContain('55141222');
    expect(v.note).toContain('a:H0oFiJ');
  });

  it('識別子が取れなければ判定不能にする(どちらかに決めつけない)', () => {
    expect(classifyVenueGeometryDiff({ tileKey: '' }, { tileKey: 'x' }).cause).toBe('unknown_target');
    expect(classifyVenueGeometryDiff({ tileKey: 'x' }, { tileKey: '' }).cause).toBe('unknown_target');
    expect(classifyVenueGeometryDiff(null, null).cause).toBe('unknown_target');
    expect(classifyVenueGeometryDiff(undefined, undefined).cause).toBe('unknown_target');
  });

  it('前後の空白は無視して同一人物と見なす', () => {
    const v = classifyVenueGeometryDiff({ tileKey: ' 55141222 ' }, { tileKey: '55141222' });
    expect(v.cause).toBe('css_mismatch');
  });

  it('空白だけのキーは「取れなかった」扱い(空文字と同じ)', () => {
    expect(classifyVenueGeometryDiff({ tileKey: '   ' }, { tileKey: 'x' }).cause).toBe(
      'unknown_target'
    );
  });

  it('匿名キー同士でも同一なら本物のCSS不一致と判定する', () => {
    const v = classifyVenueGeometryDiff({ tileKey: 'a:H0oFiJ' }, { tileKey: 'a:H0oFiJ' });
    expect(v.cause).toBe('css_mismatch');
  });
});

describe('formatVenueGeometryCause', () => {
  it('原因ごとに、読んだ人が次の一手を選べる文言にする', () => {
    const same = classifyVenueGeometryDiff({ tileKey: 'u1' }, { tileKey: 'u1' });
    expect(formatVenueGeometryCause('link', same)).toBe('link:幾何差(同一人物=CSS不一致)');

    const diff = classifyVenueGeometryDiff({ tileKey: 'u1' }, { tileKey: 'u2' });
    expect(formatVenueGeometryCause('ad', diff)).toBe('ad:測定対象ズレ(別人=CSS不一致ではない)');

    const unknown = classifyVenueGeometryDiff(null, null);
    expect(formatVenueGeometryCause('tanu', unknown)).toBe('tanu:幾何差(対象不明)');
  });
});
