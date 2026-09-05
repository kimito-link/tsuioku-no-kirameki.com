import { describe, expect, it } from 'vitest';
import {
  findCenterPainter,
  judgeSidepanelBlack,
  summarizeZeroAreaWindow
} from './sidepanelSelfDiag.js';

const PAINT = { bgColor: 'rgb(255, 250, 242)', bgImage: 'grad', colorScheme: 'light' };

/**
 * ★v0.1.1302: サイドパネル黒画面を【6回外した】真因の回帰。
 *
 * ■ 実機が出した行(v0.1.1298)
 *     🔴黒くなりうる / 0x0 / 外✅ iframe✅ 中✅ / 原因=iframeが潰れている(0x0)
 *   この名指しに従って v0.1.1299(<html>を1行目へ)を出荷し、外した。
 *
 * ■ なぜ誤りか
 *   sidepanel.html は html,body{height:100%} → iframe{height:100%} の連鎖。
 *   窓に高さが無ければ【全層が高さ0】=iframe の 0x0 は原因ではなく結果。
 *   iframe を名指しすると iframe 側を直しに行って必ず外す。
 */
describe('窓が 0x0 のときは iframe を名指ししない', () => {
  /** 実機が報告したのと同じ入力(窓0x0・3層とも塗っている)。 */
  const realDeviceSample = {
    version: '0.1.1298',
    panelW: 0,
    panelH: 0,
    outer: PAINT,
    iframe: { ...PAINT, w: 0, h: 0, canRead: true, ready: 'complete' },
    inner: { ...PAINT, bodyKids: 5, cloak: '' }
  };

  it('★実機と同じ入力で「iframeが潰れている」と名乗らない', () => {
    const r = judgeSidepanelBlack(realDeviceSample);
    expect(r.cause).not.toContain('iframeが潰れている');
  });

  it('★「未レイアウト＝この判定は当てにならない」と正直に出す', () => {
    const r = judgeSidepanelBlack(realDeviceSample);
    expect(r.cause).toContain('未レイアウト');
    expect(r.cause).toContain('当てにならない');
  });

  it('★未レイアウトは「🔴黒くなりうる」と名乗らない(⏳判定保留)', () => {
    /*
     * ★これを🔴で出すと、読み手は本物の不具合だと信じて原因を追う。
     *   実際 v0.1.1299 はこの🔴に従って出荷し、外した。
     */
    const r = judgeSidepanelBlack(realDeviceSample);
    expect(r.line).toContain('⏳判定保留');
    expect(r.line).not.toContain('🔴黒くなりうる');
  });

  it('★本物の黒(窓に面積あり・外側が塗っていない)は従来どおり🔴', () => {
    const r = judgeSidepanelBlack({
      ...realDeviceSample,
      panelW: 400,
      panelH: 900,
      outer: { bgColor: 'rgba(0, 0, 0, 0)', bgImage: 'none', colorScheme: 'light' },
      iframe: { ...PAINT, w: 400, h: 900, canRead: true }
    });
    expect(r.line).toContain('🔴黒くなりうる');
    expect(r.cause).toContain('外側');
  });

  it('★窓に面積があるときは従来どおり iframe を名指しする(既存の守りを壊さない)', () => {
    const r = judgeSidepanelBlack({
      ...realDeviceSample,
      panelW: 400,
      panelH: 900,
      iframe: { ...PAINT, w: 0, h: 0, canRead: true }
    });
    expect(r.cause).toContain('iframeが潰れている(0x0)');
  });

  it('窓に面積があり全部正常なら ✅', () => {
    const r = judgeSidepanelBlack({
      ...realDeviceSample,
      panelW: 400,
      panelH: 900,
      iframe: { ...PAINT, w: 400, h: 900, canRead: true }
    });
    expect(r.ok).toBe(true);
  });
});

describe('summarizeZeroAreaWindow(0x0 が何ms続いたか)', () => {
  it('★短時間で面積が確定したら、その範囲を出す(人間に見えない可能性が読める)', () => {
    const r = summarizeZeroAreaWindow([
      { t: 0, w: 0, h: 0 },
      { t: 60, w: 0, h: 0 },
      { t: 120, w: 400, h: 900 },
      { t: 300, w: 400, h: 900 }
    ]);
    expect(r.everZero).toBe(true);
    expect(r.firstZeroT).toBe(0);
    expect(r.lastZeroT).toBe(60);
    expect(r.settledT).toBe(120);
    expect(r.line).toContain('t=0〜60ms');
  });

  it('★最後まで 0x0 なら「面積が確定しなかった」と出す', () => {
    const r = summarizeZeroAreaWindow([
      { t: 0, w: 0, h: 0 },
      { t: 800, w: 0, h: 0 }
    ]);
    expect(r.settledT).toBe(null);
    expect(r.line).toContain('確定しなかった');
  });

  it('一度も 0x0 が無ければ ✅ と出す(偽の警告を作らない)', () => {
    const r = summarizeZeroAreaWindow([{ t: 0, w: 400, h: 900 }]);
    expect(r.everZero).toBe(false);
    expect(r.line).toContain('観測されず');
  });

  it('系列が空なら「未観測」(0件を「正常」と偽らない)', () => {
    expect(summarizeZeroAreaWindow([]).line).toContain('未観測');
    expect(summarizeZeroAreaWindow(null).line).toContain('未観測');
  });

  it('t が数値でない点は無視する(壊れた計測で嘘をつかない)', () => {
    const r = summarizeZeroAreaWindow([{ t: 'x', w: 0, h: 0 }, { t: 10, w: 0, h: 0 }]);
    expect(r.zeroCount).toBe(1);
    expect(r.firstZeroT).toBe(10);
  });
});

describe('findCenterPainter(その座標を実際に塗っているのは誰か)', () => {
  it('★誰も塗っていなければ painter=null(=本物の黒)', () => {
    const r = findCenterPainter([
      { tag: 'div', bgColor: 'rgba(0, 0, 0, 0)', bgImage: 'none' },
      { tag: 'body', bgColor: 'transparent', bgImage: 'none' },
      { tag: 'html', bgColor: 'rgba(0, 0, 0, 0)', bgImage: 'none' }
    ]);
    expect(r.painter).toBe(null);
  });

  it('★最前面から見て最初に塗っている要素を名指しする', () => {
    const r = findCenterPainter([
      { tag: 'span', bgColor: 'rgba(0, 0, 0, 0)', bgImage: 'none' },
      { tag: 'div#shade', bgColor: 'rgb(255, 250, 242)', bgImage: 'none' },
      { tag: 'html', bgColor: 'rgb(1, 2, 3)', bgImage: 'none' }
    ]);
    // 手前の shade が地の色の出どころ。奥の html ではない。
    expect(r.painter).toContain('div#shade');
    expect(r.painter).not.toContain('html');
  });

  it('背景画像(グラデ)でも「塗っている」と数える', () => {
    const r = findCenterPainter([{ tag: 'html', bgColor: 'rgba(0, 0, 0, 0)', bgImage: 'grad' }]);
    expect(r.painter).toContain('html');
  });

  it('チェーン全体を追跡用に残す(あとで原因を辿れる)', () => {
    const r = findCenterPainter([
      { tag: 'a', bgColor: 'rgba(0, 0, 0, 0)', bgImage: 'none' },
      { tag: 'b', bgColor: 'rgb(1, 2, 3)', bgImage: 'none' }
    ]);
    expect(r.chain).toEqual(['a:transparent', 'b:rgb(1, 2, 3)']);
  });

  it('空/不正入力でも落ちない', () => {
    expect(findCenterPainter(null).painter).toBe(null);
    expect(findCenterPainter([]).chain).toEqual([]);
  });
});
