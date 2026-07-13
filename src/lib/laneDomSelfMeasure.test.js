// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { measureLaneDomSelf } from './laneDomSelfMeasure.js';

function tile(width, height, hidden = false) {
  const el = document.createElement('div');
  el.className = 'nl-story-userlane-cell';
  el.hidden = hidden;
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
      link: { visible: 0, tileW: 0, tileH: 0 },
      gift: { visible: 0, tileW: 0, tileH: 0 },
      ad: { visible: 0, tileW: 0, tileH: 0 },
      konta: { visible: 0, tileW: 0, tileH: 0 },
      tanu: { visible: 0, tileW: 0, tileH: 0 }
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
    expect(result.perTier.link).toEqual({ visible: 2, tileW: 64, tileH: 84 });
    expect(result.perTier.gift).toEqual({ visible: 0, tileW: 0, tileH: 0 });
    expect(result.perTier.tanu).toEqual({ visible: 1, tileW: 72, tileH: 90 });
  });

  it('非表示の段は子があっても0件・0pxとして扱う', () => {
    const hiddenLane = lane(tile(64, 84));
    hiddenLane.hidden = true;
    expect(measureLaneDomSelf({ laneLink: hiddenLane }).perTier.link).toEqual({
      visible: 0,
      tileW: 0,
      tileH: 0
    });
  });

  it('現在の devicePixelRatio を指紋へ含める', () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1.75 });
    expect(measureLaneDomSelf({ laneLink: lane() }).dpr).toBe(1.75);
  });
});
