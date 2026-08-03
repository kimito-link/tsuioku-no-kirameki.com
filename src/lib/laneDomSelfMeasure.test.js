// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { measureLaneDomSelf } from './laneDomSelfMeasure.js';

function tile(width, height, hidden = false, userKey = '') {
  const el = document.createElement('div');
  el.className = 'nl-story-userlane-cell';
  el.hidden = hidden;
  if (userKey) el.dataset.userKey = userKey;
  Object.defineProperty(el, 'offsetWidth', { configurable: true, value: width });
  Object.defineProperty(el, 'offsetHeight', { configurable: true, value: height });
  return el;
}

function lane(...tiles) {
  const el = document.createElement('div');
  el.className = 'nl-story-userlane';
  for (const item of tiles) el.appendChild(item);
  return el;
}

/**
 * 会場モードの DOM 形。会場は wrapTileEl でタイルを席(.nlsb-seat)に包むため、
 * タイルは段の【直下ではなく席の中】にある。空席(.nlsb-is-empty)は中身を持つが不可視。
 * @param {boolean} empty 空席か
 */
function seat(tileEl, empty = false) {
  const el = document.createElement('div');
  el.className = empty ? 'nlsb-seat nlsb-is-empty' : 'nlsb-seat';
  el.appendChild(tileEl);
  return el;
}

afterEach(() => {
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
});

describe('measureLaneDomSelf', () => {
  it('全段の要素が無ければ measured:false・全段0件', () => {
    const result = measureLaneDomSelf(null);
    expect(result.measured).toBe(false);
    expect(result.perTier).toEqual({
      link: { visible: 0, tileW: 0, tileH: 0, tileKey: '' },
      gift: { visible: 0, tileW: 0, tileH: 0, tileKey: '' },
      ad: { visible: 0, tileW: 0, tileH: 0, tileKey: '' },
      konta: { visible: 0, tileW: 0, tileH: 0, tileKey: '' },
      tanu: { visible: 0, tileW: 0, tileH: 0, tileKey: '' }
    });
  });

  it('段要素があれば0件でも measured:true、一部段だけ件数と先頭タイル寸法を採取する', () => {
    const result = measureLaneDomSelf({
      laneLink: lane(tile(64, 84), tile(64, 84), tile(64, 84, true)),
      laneGift: lane(),
      laneAd: null,
      laneKonta: null,
      laneTanu: lane(tile(72, 90))
    });
    expect(result.measured).toBe(true);
    expect(result.perTier.link).toEqual({ visible: 2, tileW: 64, tileH: 84, tileKey: '' });
    expect(result.perTier.gift).toEqual({ visible: 0, tileW: 0, tileH: 0, tileKey: '' });
    expect(result.perTier.tanu).toEqual({ visible: 1, tileW: 72, tileH: 90, tileKey: '' });
  });

  it('非表示の段は子があっても0件・0pxとして扱う', () => {
    const hiddenLane = lane(tile(64, 84));
    hiddenLane.hidden = true;
    expect(measureLaneDomSelf({ laneLink: hiddenLane }).perTier.link).toEqual({
      visible: 0,
      tileW: 0,
      tileH: 0,
      tileKey: ''
    });
  });

  /**
   * v0.1.1212: 「寸法を測った当のタイルが誰か」を持ち帰る。
   * ①と会場で先頭タイルの人が違うと、CSSが完全一致でも名前長の差でタイル幅が変わるため、
   * これが無いと「幾何≠」がCSS不整合か測定対象ズレかを永久に区別できない。
   */
  it('寸法を測った先頭タイルの userKey を採取する', () => {
    const result = measureLaneDomSelf({
      laneLink: lane(tile(110, 38, false, '55141222'), tile(128, 40, false, 'a:H0oFiJ'))
    });
    // 測ったのは先頭タイルなので、その人のキーが返る(2枚目ではない)
    expect(result.perTier.link.tileKey).toBe('55141222');
    expect(result.perTier.link.tileW).toBe(110);
  });

  it('userKey を持たないタイル(広告主等)は空文字にする(嘘のキーを作らない)', () => {
    const result = measureLaneDomSelf({ laneAd: lane(tile(80, 23)) });
    expect(result.perTier.ad.tileKey).toBe('');
    expect(result.perTier.ad.tileW).toBe(80);
  });

  /**
   * v0.1.1241 実配信 lv351085849 で `未説明1(link:幾何差(対象不明))` が出た真因。
   *
   * 会場は wrapTileEl でタイルを席(.nlsb-seat)に包むので、タイルは段の【直下にない】。
   * 旧実装は lane.children(直下のみ)を見ていたため、会場の DOM を測ると
   * visible=0・tileKey='' になり、venueGeometryVerdict が unknown_target=「対象不明」に
   * 落ちていた。会場側(venueDomCensus)は querySelectorAll で子孫を走査するので値が取れ、
   * 「①だけ空」という非対称が幾何差の判定不能を生んでいた。
   */
  it('会場の席(.nlsb-seat)に包まれたタイルも子孫まで探して測る', () => {
    const result = measureLaneDomSelf({
      laneLink: lane(
        seat(tile(118, 40, false, '55141222')),
        seat(tile(118, 40, false, 'a:H0oFiJ'))
      )
    });
    expect(result.perTier.link.visible).toBe(2);
    expect(result.perTier.link.tileW).toBe(118);
    expect(result.perTier.link.tileH).toBe(40);
    // 対象不明にならないこと=これが出れば CSS 差か測定ズレかを判定できる
    expect(result.perTier.link.tileKey).toBe('55141222');
  });

  /**
   * 会場側(venueDomCensus)は空席(.nlsb-is-empty)の中身を可視から除外する。
   * ①側が除外しないと「先頭タイル」が別人になり、CSS が同一でも幅差が出て誤警告になる。
   */
  it('空席(.nlsb-is-empty)の中身は会場側と同じく数えず・測らない', () => {
    const result = measureLaneDomSelf({
      laneLink: lane(
        seat(tile(999, 999, false, 'ghost'), true),
        seat(tile(118, 40, false, '55141222'))
      )
    });
    expect(result.perTier.link.visible).toBe(1);
    // 空席の幽霊(999px)ではなく、最初の【中身のある】席を測る=会場と同じ人
    expect(result.perTier.link.tileW).toBe(118);
    expect(result.perTier.link.tileKey).toBe('55141222');
  });

  it('現在の devicePixelRatio を指紋へ含める', () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1.75 });
    expect(measureLaneDomSelf({ laneLink: lane() }).dpr).toBe(1.75);
  });
});
