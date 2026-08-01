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

  it('現在の devicePixelRatio を指紋へ含める', () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1.75 });
    expect(measureLaneDomSelf({ laneLink: lane() }).dpr).toBe(1.75);
  });
});
