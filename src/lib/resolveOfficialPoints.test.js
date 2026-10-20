import { describe, it, expect } from 'vitest';
import { resolveOfficialPoints } from './resolveOfficialPoints.js';

describe('resolveOfficialPoints', () => {
  it('DOM 値(watch ページ programStats)を最優先する', () => {
    expect(
      resolveOfficialPoints({ domValue: 12000, ndgrValue: 9800 })
    ).toBe(12000);
  });

  it('DOM 値が無ければ NDGR 値にフォールバックする', () => {
    expect(
      resolveOfficialPoints({ domValue: null, ndgrValue: 9800 })
    ).toBe(9800);
  });

  it('DOM 値が 0(観測済みゼロ)なら 0 を採り NDGR に落ちない', () => {
    // 0 は「未取得」ではなく有効な観測値。>= 0 を満たすので DOM 優先を維持する。
    expect(
      resolveOfficialPoints({ domValue: 0, ndgrValue: 9800 })
    ).toBe(0);
  });

  it('status-entry の旧実装(NDGR 先頭 fallback)とは逆=DOM を先に見る(逆転の根治)', () => {
    // 旧 status-entry: numOrNull(snap.officialAdPointsNdgr) ?? numOrNull(s.adPoints)
    //   → NDGR(9800) が先に採られていた。新実装は DOM(12000) を採る=popup と一致。
    expect(
      resolveOfficialPoints({ domValue: 12000, ndgrValue: 9800 })
    ).toBe(12000);
  });

  it('DOM が非数値(undefined / NaN / 文字列)なら NDGR に落ちる', () => {
    expect(resolveOfficialPoints({ domValue: undefined, ndgrValue: 50 })).toBe(50);
    expect(resolveOfficialPoints({ domValue: NaN, ndgrValue: 50 })).toBe(50);
    // @ts-expect-error 文字列を渡しても数値として採らない
    expect(resolveOfficialPoints({ domValue: '12000', ndgrValue: 50 })).toBe(50);
  });

  it('負値(破損データ)は捨てて次の候補へ落ちる', () => {
    expect(resolveOfficialPoints({ domValue: -1, ndgrValue: 50 })).toBe(50);
    expect(resolveOfficialPoints({ domValue: -1, ndgrValue: -5 })).toBeNull();
  });

  it('どちらも無ければ null(未取得)', () => {
    expect(resolveOfficialPoints({})).toBeNull();
    expect(resolveOfficialPoints({ domValue: null, ndgrValue: null })).toBeNull();
  });

  it('Infinity は有限でないので採らない', () => {
    expect(resolveOfficialPoints({ domValue: Infinity, ndgrValue: 50 })).toBe(50);
  });
});
