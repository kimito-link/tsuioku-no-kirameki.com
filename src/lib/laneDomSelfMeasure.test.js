// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { measureLaneDomSelf, perTierKeysOf } from './laneDomSelfMeasure.js';

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
    // v0.1.1284: keys(可視タイルの userKey 列)を追加。★形は厳密に固定したまま維持する
    //   (toEqual を toMatchObject に緩めると、フィールドが黙って消える退行を通してしまう)。
    expect(result.perTier).toEqual({
      link: { visible: 0, tileW: 0, tileH: 0, tileKey: '', keys: [] },
      gift: { visible: 0, tileW: 0, tileH: 0, tileKey: '', keys: [] },
      ad: { visible: 0, tileW: 0, tileH: 0, tileKey: '', keys: [] },
      konta: { visible: 0, tileW: 0, tileH: 0, tileKey: '', keys: [] },
      tanu: { visible: 0, tileW: 0, tileH: 0, tileKey: '', keys: [] }
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
    // keys は「鍵を持つ可視タイル」だけ(この段のタイルは userKey 未設定なので空配列)。
    expect(result.perTier.link).toEqual({ visible: 2, tileW: 64, tileH: 84, tileKey: '', keys: [] });
    expect(result.perTier.gift).toEqual({ visible: 0, tileW: 0, tileH: 0, tileKey: '', keys: [] });
    expect(result.perTier.tanu).toEqual({ visible: 1, tileW: 72, tileH: 90, tileKey: '', keys: [] });
  });

  it('非表示の段は子があっても0件・0pxとして扱う', () => {
    const hiddenLane = lane(tile(64, 84));
    hiddenLane.hidden = true;
    expect(measureLaneDomSelf({ laneLink: hiddenLane }).perTier.link).toEqual({
      visible: 0,
      tileW: 0,
      tileH: 0,
      tileKey: '',
      keys: []
    });
  });

  /*
   * ★v0.1.1284(venue-exact-parity-SPEC-2026-08-07 §3-2/M2): キー列の採取。
   *   会場側の census(venueDomCensus.countSection)と【同じ走査規則・同じ除外規則】で
   *   並び順まで揃っていることが、指紋(laneDomFingerprint)が3起点で一致する前提。
   *   ★両者が同じ実DOMから同じ列を出すことの貫通テストは laneSceneEnvelope.fingerprint.test.js。
   */
  describe('keys(可視タイルの userKey 列)', () => {
    it('可視タイルの鍵を【並び順のまま】集める', () => {
      const result = measureLaneDomSelf({
        laneLink: lane(tile(64, 84, false, 'u:1'), tile(64, 84, false, 'u:2'))
      });
      expect(result.perTier.link.keys).toEqual(['u:1', 'u:2']);
    });

    it('hidden なタイルは除く(visible と同じ規則)', () => {
      const result = measureLaneDomSelf({
        laneLink: lane(tile(64, 84, false, 'u:1'), tile(64, 84, true, 'u:hidden'))
      });
      expect(result.perTier.link.visible).toBe(1);
      expect(result.perTier.link.keys).toEqual(['u:1']);
    });

    it('無鍵タイルは keys に入れない(嘘の鍵を作らない・census の unkeyed の縄張り)', () => {
      const result = measureLaneDomSelf({
        laneLink: lane(tile(64, 84, false, 'u:1'), tile(64, 84))
      });
      expect(result.perTier.link.visible).toBe(2);
      expect(result.perTier.link.keys).toEqual(['u:1']);
    });

    it('空席(.nlsb-is-empty)の中身の鍵は拾わない(会場側と同じ除外)', () => {
      const result = measureLaneDomSelf({
        laneLink: lane(seat(tile(999, 999, false, 'u:ghost'), true), seat(tile(118, 40, false, 'u:real')))
      });
      expect(result.perTier.link.keys).toEqual(['u:real']);
    });
  });

  describe('perTierKeysOf', () => {
    it('5段そろえて取り出す(欠けた段は空配列=呼び出し側が手書きしないための小関数)', () => {
      const result = measureLaneDomSelf({ laneLink: lane(tile(64, 84, false, 'u:1')) });
      expect(perTierKeysOf(result)).toEqual({
        link: ['u:1'], gift: [], ad: [], konta: [], tanu: []
      });
    });

    it('null/壊れた入力でも落ちない(全段空配列)', () => {
      expect(perTierKeysOf(null)).toEqual({ link: [], gift: [], ad: [], konta: [], tanu: [] });
      expect(perTierKeysOf({ perTier: 'x' })).toEqual({ link: [], gift: [], ad: [], konta: [], tanu: [] });
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
