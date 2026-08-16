import { describe, it, expect } from 'vitest';
import {
  createRefreshDeadline,
  worstCaseSerialMs,
  REFRESH_CYCLE_BUDGET_MS,
  REFRESH_FIRST_CYCLE_BUDGET_MS,
  MIN_SLICE_MS
} from './refreshCycleDeadline.js';

/** 手で進められる時計。 */
function fakeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

describe('refreshCycleDeadline', () => {
  it('★症状の再現: 8000ms×10本を直列に並べると80秒になる(これが真因)', () => {
    expect(worstCaseSerialMs(10, 8000)).toBe(80_000);
    // 3サイクルで 240 秒 = ユーザー実機の「180秒経っても開かない」を説明できる
    // (2サイクル=160秒では 180 秒に届かないので、少なくとも3サイクル分詰まっていた)。
    expect(worstCaseSerialMs(10, 8000) * 3).toBeGreaterThan(180_000);
  });

  it('締切があれば、同じ10本でも合計が予算を超えない', () => {
    const clock = fakeClock();
    const d = createRefreshDeadline({ totalMs: 12_000, now: clock.now });
    let total = 0;
    for (let i = 0; i < 10; i += 1) {
      const slice = d.next(8000);
      total += slice;
      clock.advance(slice); // 各 read が timeout いっぱい使った最悪ケース
    }
    expect(total).toBeLessThanOrEqual(12_000);
    // ★ガード無しなら 80,000ms。締切があると 12,000ms で頭打ちになる。
    expect(total).toBeLessThan(worstCaseSerialMs(10, 8000));
  });

  it('残り時間の方が短ければ、既定値でなく残りを返す', () => {
    const clock = fakeClock();
    const d = createRefreshDeadline({ totalMs: 10_000, now: clock.now });
    clock.advance(9_500);
    expect(d.next(8000)).toBe(500);
  });

  it('残りが最小スライス未満なら 0 を返し、skipped が増える', () => {
    const clock = fakeClock();
    const d = createRefreshDeadline({ totalMs: 1_000, minSliceMs: 150, now: clock.now });
    clock.advance(900);
    expect(d.next(8000)).toBe(0);
    expect(d.skipped()).toBe(1);
  });

  it('予算を使い切ったら expired、remaining は負にならない', () => {
    const clock = fakeClock();
    const d = createRefreshDeadline({ totalMs: 1_000, now: clock.now });
    expect(d.expired()).toBe(false);
    clock.advance(5_000);
    expect(d.remaining()).toBe(0);
    expect(d.expired()).toBe(true);
  });

  it('既定値を渡さなければ残り全部を使える(0や負は既定に落ちない)', () => {
    const clock = fakeClock();
    const d = createRefreshDeadline({ totalMs: 4_000, now: clock.now });
    expect(d.next(0)).toBe(4_000);
    expect(d.next(-1)).toBe(4_000);
  });

  it('不正な totalMs は既定値へ倒れる(NaN で無限待ちを作らない)', () => {
    const clock = fakeClock();
    const d = createRefreshDeadline({ totalMs: Number.NaN, now: clock.now });
    expect(d.remaining()).toBe(REFRESH_CYCLE_BUDGET_MS);
    const d2 = createRefreshDeadline({ totalMs: -5, now: clock.now });
    expect(d2.remaining()).toBe(REFRESH_CYCLE_BUDGET_MS);
  });

  it('MIN_SLICE_MS の既定は正の有限値', () => {
    expect(MIN_SLICE_MS).toBeGreaterThan(0);
    expect(Number.isFinite(MIN_SLICE_MS)).toBe(true);
  });

  it('worstCaseSerialMs は不正入力で NaN を返さない', () => {
    expect(worstCaseSerialMs(Number.NaN, 8000)).toBe(0);
    expect(worstCaseSerialMs(10, Number.NaN)).toBe(0);
    expect(worstCaseSerialMs(-1, 8000)).toBe(0);
  });

  describe('★予算は【体感】を守る値に固定する(v0.1.1410)', () => {
    /*
     * 2026-08-16 実機「診断ページがまた重い」の真因:
     *   更新所要 6004ms は **12秒予算の内側なので何にも止められていなかった**。
     *   予算は「事故(80秒)を防ぐ上限」としては効いていたが、
     *   「体感を守る上限」としては緩すぎた。
     * ★緩める変更を入れたらこのテストが赤くなる(数で固定する)。
     */
    it('通常サイクルは refresh 間隔(2秒)の2倍以内', () => {
      expect(REFRESH_CYCLE_BUDGET_MS).toBeLessThanOrEqual(4_000);
    });

    it('★初回サイクルはさらに短い(ページが開くまでの時間そのもの)', () => {
      expect(REFRESH_FIRST_CYCLE_BUDGET_MS).toBeLessThanOrEqual(2_000);
      expect(REFRESH_FIRST_CYCLE_BUDGET_MS).toBeLessThan(REFRESH_CYCLE_BUDGET_MS);
    });

    it('初回予算でも最低1本は read を発行できる(全部スキップにしない)', () => {
      const clock = { t: 0, now: () => clock.t };
      const d = createRefreshDeadline({ totalMs: REFRESH_FIRST_CYCLE_BUDGET_MS, now: clock.now });
      expect(d.next(8000)).toBeGreaterThan(MIN_SLICE_MS);
    });
  });
});
