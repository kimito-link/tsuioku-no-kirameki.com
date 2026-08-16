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

  describe('★予算を締めすぎると read が枯渇する(v0.1.1411・退化の再発防止)', () => {
    /*
     * ■ v0.1.1410 で出した退化(実機「読み込み中です...」が居座った)
     *   体感を短くするつもりで予算を 12,000→4,000 / 初回 1,500 に締めた。
     *   ところが status-entry のコア5read は `_slice()` を **引数なし**で呼ぶ。
     *   next(0) は「残り全部」を返す仕様なので、
     *   **最初の1本が予算を丸ごと持っていく** → 後続が全部 0(読まない)。
     *   初回はキャッシュ(stale)も無いので空のまま描画され、
     *   「読み込み中」が消えなくなった。
     *
     * ★教訓: 予算は「事故の上限」であって「体感の調整つまみ」ではない。
     *   正常系の実測合計(≒4.2秒)を下回らせない。
     */
    /** 実測の正常系合計[ms]（popupDiag 1471 + extras 1454 + summaries 1278 ≒ 4.2秒）。 */
    const OBSERVED_NORMAL_TOTAL_MS = 4_200;

    it('通常サイクルの予算は正常系の実測合計を下回らない', () => {
      expect(REFRESH_CYCLE_BUDGET_MS).toBeGreaterThanOrEqual(OBSERVED_NORMAL_TOTAL_MS);
    });

    it('★初回サイクルの予算も正常系を通せる(初回は stale が無い＝枯渇が即・空表示になる)', () => {
      expect(REFRESH_FIRST_CYCLE_BUDGET_MS).toBeGreaterThanOrEqual(OBSERVED_NORMAL_TOTAL_MS);
    });

    it('★引数なし _slice() を5本直列に呼んでも、最後の1本が0にならない', () => {
      /*
       * status-entry のコア5read と同じ呼び方を再現する。
       * 各 read が「実測どおりの時間」を使ったとき、5本目まで生き残るか。
       */
      const clock = { t: 0, now: () => clock.t };
      const d = createRefreshDeadline({ totalMs: REFRESH_FIRST_CYCLE_BUDGET_MS, now: clock.now });
      const spend = [200, 1278, 300, 1471, 200]; // lives/summaries/fastDiag/popupDiag/backfill
      const slices = [];
      for (const ms of spend) {
        slices.push(d.next());   // ★引数なし＝残り全部を要求する(実装と同じ)
        clock.t += ms;
      }
      // 5本とも「読まない(0)」にならないこと＝空表示にならない
      expect(slices.every((s) => s > 0)).toBe(true);
    });
  });
});
