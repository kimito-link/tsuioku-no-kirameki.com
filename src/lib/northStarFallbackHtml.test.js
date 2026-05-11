import { describe, it, expect } from 'vitest';
import {
  buildNorthStarRankFallbackHtml,
  buildNorthStarScoreFallbackHtml,
  buildNorthStarProgramPointsFallbackHtml
} from './northStarFallbackHtml.js';

describe('buildNorthStarRankFallbackHtml', () => {
  it('正の整数 rank を「現在 N 位」HTML に整形する', () => {
    const html = buildNorthStarRankFallbackHtml(50);
    expect(html).toContain('class="rank-field"');
    expect(html).toContain('class="rank-num"');
    expect(html).toContain('>50<');
    expect(html).toContain('現在');
    expect(html).toContain('位');
  });

  it('rank=1 (top) も同じ形式で出る', () => {
    const html = buildNorthStarRankFallbackHtml(1);
    expect(html).toContain('>1<');
  });

  it('rank=0 は null（ランク不明 = 表示しない）', () => {
    expect(buildNorthStarRankFallbackHtml(0)).toBeNull();
  });

  it('負の数は null', () => {
    expect(buildNorthStarRankFallbackHtml(-5)).toBeNull();
  });

  it('null / undefined / NaN は null', () => {
    expect(buildNorthStarRankFallbackHtml(null)).toBeNull();
    expect(buildNorthStarRankFallbackHtml(undefined)).toBeNull();
    expect(buildNorthStarRankFallbackHtml(NaN)).toBeNull();
  });

  it('小数は切り捨て', () => {
    const html = buildNorthStarRankFallbackHtml(3.7);
    expect(html).toContain('>3<');
  });

  it('string 等の不正型は null', () => {
    expect(buildNorthStarRankFallbackHtml(/** @type {any} */ ('5'))).toBeNull();
    expect(buildNorthStarRankFallbackHtml(/** @type {any} */ ({}))).toBeNull();
  });
});

describe('buildNorthStarScoreFallbackHtml', () => {
  it('正の整数 score をカンマ区切り HTML に整形する', () => {
    const html = buildNorthStarScoreFallbackHtml(12345);
    expect(html).toContain('class="score"');
    expect(html).toContain('12,345');
  });

  it('小さい数 (3 桁以下) はカンマなし', () => {
    const html = buildNorthStarScoreFallbackHtml(500);
    expect(html).toContain('>500</span>');
    expect(html).not.toContain(',');
  });

  it('大きい数（百万級）も正しくカンマ区切り', () => {
    const html = buildNorthStarScoreFallbackHtml(1234567);
    expect(html).toContain('1,234,567');
  });

  it('score=0 は表示する（"0 件" の表示にも意味あり）', () => {
    const html = buildNorthStarScoreFallbackHtml(0);
    expect(html).toContain('>0</span>');
  });

  it('負の数は null', () => {
    expect(buildNorthStarScoreFallbackHtml(-1)).toBeNull();
  });

  it('null / undefined / NaN / Infinity は null', () => {
    expect(buildNorthStarScoreFallbackHtml(null)).toBeNull();
    expect(buildNorthStarScoreFallbackHtml(undefined)).toBeNull();
    expect(buildNorthStarScoreFallbackHtml(NaN)).toBeNull();
    expect(buildNorthStarScoreFallbackHtml(Infinity)).toBeNull();
  });

  it('小数は切り捨て', () => {
    const html = buildNorthStarScoreFallbackHtml(1500.9);
    expect(html).toContain('>1,500</span>');
  });

  it('string 等の不正型は null', () => {
    expect(buildNorthStarScoreFallbackHtml(/** @type {any} */ ('100'))).toBeNull();
  });
});

describe('buildNorthStarProgramPointsFallbackHtml', () => {
  it('正の整数 value を「X,XXX pt」HTML に整形する', () => {
    const html = buildNorthStarProgramPointsFallbackHtml(1350);
    expect(html).toContain('class="point-value"');
    expect(html).toContain('1,350');
    expect(html).toContain('<small class="point-unit">pt</small>');
  });

  it('小さい数 (3 桁以下) はカンマなし', () => {
    const html = buildNorthStarProgramPointsFallbackHtml(550);
    expect(html).toContain('>550 ');
    expect(html).not.toContain(',');
  });

  it('大きい数（百万級）もカンマ区切り', () => {
    const html = buildNorthStarProgramPointsFallbackHtml(1234567);
    expect(html).toContain('1,234,567');
  });

  it('value=0 は表示する（ギフト発生 0 件も意味あり）', () => {
    const html = buildNorthStarProgramPointsFallbackHtml(0);
    expect(html).toContain('>0 ');
    expect(html).toContain('pt');
  });

  it('負の数は null', () => {
    expect(buildNorthStarProgramPointsFallbackHtml(-1)).toBeNull();
  });

  it('null / undefined / NaN / Infinity は null', () => {
    expect(buildNorthStarProgramPointsFallbackHtml(null)).toBeNull();
    expect(buildNorthStarProgramPointsFallbackHtml(undefined)).toBeNull();
    expect(buildNorthStarProgramPointsFallbackHtml(NaN)).toBeNull();
    expect(buildNorthStarProgramPointsFallbackHtml(Infinity)).toBeNull();
  });

  it('小数は切り捨て', () => {
    const html = buildNorthStarProgramPointsFallbackHtml(1500.9);
    expect(html).toContain('>1,500 ');
  });

  it('string 等の不正型は null', () => {
    expect(buildNorthStarProgramPointsFallbackHtml(/** @type {any} */ ('100'))).toBeNull();
  });
});
