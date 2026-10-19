import { describe, expect, it } from 'vitest';
import { RUN_AFTER_PAINT_FALLBACK_MS, runAfterNextPaint } from './runAfterNextPaint.js';

/** 手で進める rAF と時計 */
const env = () => {
  /** @type {Array<() => void>} */
  const rafs = [];
  /** @type {Array<{ at: number, fn: () => void }>} */
  let timers = [];
  let now = 0;
  return {
    raf: (fn) => { rafs.push(fn); return rafs.length; },
    setTimer: (fn, ms) => { timers.push({ at: now + ms, fn }); return timers.length; },
    frame: () => { const fs = rafs.splice(0); fs.forEach((f) => f()); },
    advance: (ms) => {
      const end = now + ms;
      for (;;) {
        const next = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        timers = timers.filter((t) => t !== next);
        now = next.at;
        next.fn();
      }
      now = end;
    }
  };
};

describe('runAfterNextPaint(重い処理を、次の描画のあとへ送る)', () => {
  it('★呼んだ瞬間には走らない(描画より先に重い処理が走って最初のフレームを遅らせない)', () => {
    const e = env(); let n = 0;
    runAfterNextPaint(() => { n += 1; }, { raf: e.raf, setTimer: e.setTimer });
    expect(n).toBe(0);
    e.frame(); // 次のフレームの開始時点でもまだ走らせない(描画の後ろの macrotask へ送る)
    expect(n).toBe(0);
    e.advance(0);
    expect(n).toBe(1);
  });

  it('★rAF が来なくても(隠れた文書など)、保険の時間で必ず走る=処理が永久に失われない', () => {
    const e = env(); let n = 0;
    runAfterNextPaint(() => { n += 1; }, { raf: e.raf, setTimer: e.setTimer });
    e.advance(RUN_AFTER_PAINT_FALLBACK_MS - 1);
    expect(n).toBe(0);
    e.advance(2);
    expect(n).toBe(1);
  });

  it('★1回しか走らない(rAF 経由と保険の両方が来ても)', () => {
    const e = env(); let n = 0;
    runAfterNextPaint(() => { n += 1; }, { raf: e.raf, setTimer: e.setTimer });
    e.frame(); e.advance(0);
    e.advance(RUN_AFTER_PAINT_FALLBACK_MS + 10);
    expect(n).toBe(1);
  });

  it('★rAF が使えない環境でも走る(保険だけで)・処理が例外を投げても外へ漏らさない', () => {
    const e = env(); let n = 0;
    runAfterNextPaint(() => { n += 1; throw new Error('x'); }, { raf: undefined, setTimer: e.setTimer });
    expect(() => e.advance(RUN_AFTER_PAINT_FALLBACK_MS + 1)).not.toThrow();
    expect(n).toBe(1);
  });

  it('保険の時間は、人が気づく長さより短く、描画を待つには足りる', () => {
    expect(RUN_AFTER_PAINT_FALLBACK_MS).toBeGreaterThanOrEqual(100);
    expect(RUN_AFTER_PAINT_FALLBACK_MS).toBeLessThanOrEqual(500);
  });
});
