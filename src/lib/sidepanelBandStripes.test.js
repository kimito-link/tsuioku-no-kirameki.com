import { describe, it, expect } from 'vitest';
import { judgeSidepanelBandStripes } from './sidepanelSelfDiag.js';

/**
 * ★縞(帯ごとに塗りが割れる)を機械で捕まえられることを固定する。
 *
 * ★動機(2026-09-05・ユーザー報告のスクショ): 右ペインが縞状に黒い。
 *   既存計器は画面中央1点しか見ないので、中心が明るい帯に当たると緑を出す。
 *   ★「機械が見ている所だけが動く」の実例。見ていない場所は無いのと同じ。
 */
describe('judgeSidepanelBandStripes', () => {
  // ★これが本命。ここが緑のままなら、この関数を足した意味が無い。
  it('塗り手が居る帯と居ない帯が混在したら縞として捕まえる', () => {
    const r = judgeSidepanelBandStripes([
      { y: 0, painter: 'div#nl-underlay → rgb(255,250,242)' },
      { y: 100, painter: null },
      { y: 200, painter: 'div#nl-underlay → rgb(255,250,242)' },
      { y: 300, painter: null }
    ]);
    expect(r.verdict).toBe('STRIPED');
    expect(r.painted).toBe(2);
    expect(r.blank).toBe(2);
    expect(r.line).toContain('縞を検出');
  });

  it('全帯に地の色があれば OK', () => {
    const r = judgeSidepanelBandStripes([
      { y: 0, painter: 'html → rgb(255,250,242)' },
      { y: 100, painter: 'html → rgb(255,250,242)' }
    ]);
    expect(r.verdict).toBe('OK');
    expect(r.blank).toBe(0);
  });

  // ★従来の症状(面で黒い)と縞を区別する。混ぜると原因の切り分けができなくなる。
  it('全帯で塗り手が居なければ ALL_BLANK(縞とは別物)', () => {
    const r = judgeSidepanelBandStripes([
      { y: 0, painter: null },
      { y: 100, painter: null },
      { y: 200, painter: null }
    ]);
    expect(r.verdict).toBe('ALL_BLANK');
    expect(r.painted).toBe(0);
    expect(r.line).toContain('面で黒い');
  });

  // ★3値の掟: 測れなかったことを緑に混ぜない。
  it('帯が2つ未満なら INCONCLUSIVE(緑にしない)', () => {
    expect(judgeSidepanelBandStripes([]).verdict).toBe('INCONCLUSIVE');
    expect(judgeSidepanelBandStripes([{ y: 0, painter: 'html → x' }]).verdict).toBe('INCONCLUSIVE');
    expect(judgeSidepanelBandStripes(null).verdict).toBe('INCONCLUSIVE');
    expect(judgeSidepanelBandStripes(undefined).verdict).toBe('INCONCLUSIVE');
  });

  // ★空文字を「塗り手が居る」と数えない(findCenterPainter は塗り手不在で null を返すが、
  //   将来 '' を返す実装に変わっても黙って緑にしないため)。
  it('空文字の painter は塗り手不在として数える', () => {
    const r = judgeSidepanelBandStripes([
      { y: 0, painter: '' },
      { y: 100, painter: '   ' },
      { y: 200, painter: 'html → rgb(255,250,242)' }
    ]);
    expect(r.verdict).toBe('STRIPED');
    expect(r.blank).toBe(2);
  });

  it('壊れた入力でも例外を投げない', () => {
    expect(() => judgeSidepanelBandStripes([null, 42, 'x', {}])).not.toThrow();
    expect(judgeSidepanelBandStripes([null, 42]).verdict).toBe('ALL_BLANK');
  });
});
