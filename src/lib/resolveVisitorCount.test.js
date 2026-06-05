import { describe, it, expect } from 'vitest';
import { resolveVisitorCount } from './resolveVisitorCount.js';

describe('resolveVisitorCount', () => {
  it('viewerCountFromDom を最優先する', () => {
    expect(
      resolveVisitorCount({ viewerCountFromDom: 5164, panelWatchCount: 5088 })
    ).toBe(5164);
  });

  it('viewerCountFromDom が無ければ panel.watchCount にフォールバック', () => {
    expect(
      resolveVisitorCount({ viewerCountFromDom: null, panelWatchCount: 5088 })
    ).toBe(5088);
  });

  it('同接(officialViewerCount)は来場枠に混ぜない=引数に取らない(ズレ根治の核心)', () => {
    // 旧実装は officialViewerCount を先頭 fallback にしていた。新実装はそれを
    // 受け取らないため、同接値で来場が化けることが構造的に起きない。
    const out = resolveVisitorCount({
      viewerCountFromDom: 5164,
      panelWatchCount: 5088,
      // @ts-expect-error 旧フィールドを渡しても無視される
      officialViewerCount: 312,
    });
    expect(out).toBe(5164);
  });

  it('どちらも無ければ null(未取得)', () => {
    expect(resolveVisitorCount({})).toBeNull();
    expect(resolveVisitorCount({ viewerCountFromDom: null, panelWatchCount: null })).toBeNull();
    expect(resolveVisitorCount(null)).toBeNull();
  });

  it('NaN/Infinity/文字列は無効値として扱う', () => {
    expect(resolveVisitorCount({ viewerCountFromDom: NaN, panelWatchCount: 100 })).toBe(100);
    expect(resolveVisitorCount({ viewerCountFromDom: Infinity, panelWatchCount: 100 })).toBe(100);
    expect(resolveVisitorCount({ viewerCountFromDom: '5164', panelWatchCount: 100 })).toBe(100);
  });

  it('0 は有効値として返す(来場0人)', () => {
    expect(resolveVisitorCount({ viewerCountFromDom: 0, panelWatchCount: 99 })).toBe(0);
  });
});
