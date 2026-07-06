import { describe, it, expect } from 'vitest';
import {
  easeOutQuart,
  scoreCountUpValueAt,
  shouldPlayScoreTick,
  startScoreCountUp,
  SCORE_COUNT_UP_DEFAULT_DURATION_MS
} from './scoreCountUp.js';

describe('easeOutQuart', () => {
  it('t=0で0、t=1で1(終端一致)', () => {
    expect(easeOutQuart(0)).toBe(0);
    expect(easeOutQuart(1)).toBe(1);
  });

  it('範囲外の入力は0-1にクランプされる', () => {
    expect(easeOutQuart(-1)).toBe(0);
    expect(easeOutQuart(2)).toBe(1);
  });

  it('単調増加(減速イージング)', () => {
    const a = easeOutQuart(0.2);
    const b = easeOutQuart(0.5);
    const c = easeOutQuart(0.8);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});

describe('scoreCountUpValueAt', () => {
  it('経過0msは0', () => {
    expect(scoreCountUpValueAt(100, 0, 1600)).toBe(0);
  });

  it('経過がdurationMs以上ならtargetに一致(終端一致)', () => {
    expect(scoreCountUpValueAt(87, 1600, 1600)).toBe(87);
    expect(scoreCountUpValueAt(87, 5000, 1600)).toBe(87);
  });

  it('中間地点は0とtargetの間', () => {
    const v = scoreCountUpValueAt(100, 800, 1600);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(100);
  });

  it('決定論: 同じ入力には常に同じ結果', () => {
    const a = scoreCountUpValueAt(73, 400, 1600);
    const b = scoreCountUpValueAt(73, 400, 1600);
    expect(a).toBe(b);
  });

  it('target=0は常に0', () => {
    expect(scoreCountUpValueAt(0, 800, 1600)).toBe(0);
  });

  it('非数値のdurationMsでも死なない(下限1msにクランプ)', () => {
    expect(Number.isFinite(scoreCountUpValueAt(100, 10, NaN))).toBe(true);
  });
});

describe('shouldPlayScoreTick', () => {
  it('初回(lastPlayedAtMsが非数値)は常にtrue', () => {
    expect(shouldPlayScoreTick(NaN, 0)).toBe(true);
    expect(shouldPlayScoreTick(undefined, 50)).toBe(true);
  });

  it('90ms未満はfalse(間引き)', () => {
    expect(shouldPlayScoreTick(0, 50, 90)).toBe(false);
    expect(shouldPlayScoreTick(0, 89, 90)).toBe(false);
  });

  it('90ms以上経過したらtrue', () => {
    expect(shouldPlayScoreTick(0, 90, 90)).toBe(true);
    expect(shouldPlayScoreTick(0, 200, 90)).toBe(true);
  });
});

describe('startScoreCountUp', () => {
  /** 決定論なフェイクrAF/時刻を組み立てる。stepMsごとに時刻を進めてコールバックを呼ぶ。 */
  function makeFakeClock(stepMs) {
    let t = 0;
    const raf = (cb) => {
      t += stepMs;
      cb(t);
      return 0;
    };
    const now = () => t;
    return { raf, now };
  }

  it('onTickが呼ばれ、最終フレームでtargetに一致する(終端一致)', () => {
    const { raf, now } = makeFakeClock(100);
    const el = { textContent: '' };
    const ticks = [];
    startScoreCountUp(el, 87, {
      durationMs: 500,
      raf,
      now,
      onTick: (v) => ticks.push(v)
    });
    expect(ticks[ticks.length - 1]).toBe(87);
    expect(el.textContent).toBe('87');
  });

  it('onDoneがtargetと共に1回だけ呼ばれる', () => {
    const { raf, now } = makeFakeClock(200);
    let doneCount = 0;
    let doneValue = null;
    startScoreCountUp({ textContent: '' }, 50, {
      durationMs: 400,
      raf,
      now,
      onDone: (target) => {
        doneCount += 1;
        doneValue = target;
      }
    });
    expect(doneCount).toBe(1);
    expect(doneValue).toBe(50);
  });

  it('表示値は単調増加(逆行しない)', () => {
    const { raf, now } = makeFakeClock(50);
    const values = [];
    startScoreCountUp({ textContent: '' }, 100, {
      durationMs: 1600,
      raf,
      now,
      onTick: (v) => values.push(v)
    });
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
  });

  it('要素がnullでも死なない(DOM操作をスキップ)', () => {
    const { raf, now } = makeFakeClock(200);
    expect(() => startScoreCountUp(null, 42, { durationMs: 400, raf, now })).not.toThrow();
  });

  it('cancel()で以後のonTick/onDoneが呼ばれなくなる', () => {
    let callCount = 0;
    /** @type {(() => void)|null} */
    let pendingStep = null;
    const raf = (cb) => {
      pendingStep = cb; // 即時実行せず、テスト側が明示的に1フレームずつ進める。
      return 0;
    };
    const handle = startScoreCountUp({ textContent: '' }, 100, {
      durationMs: 100000, // 終わらないように長くする(cancel前にonDoneへ到達させない)。
      raf,
      now: () => 0,
      onTick: () => { callCount += 1; }
    });
    // 1フレーム目を手動で進める。
    const step1 = pendingStep;
    pendingStep = null;
    step1 && step1();
    const countAfterFirst = callCount;
    expect(countAfterFirst).toBe(1);

    handle.cancel();
    // cancel後にスケジュールされていた次フレームを実行しても、もう増えない。
    const step2 = pendingStep;
    pendingStep = null;
    step2 && step2();
    expect(callCount).toBe(countAfterFirst);
  });

  it('既定durationMsが定義されている', () => {
    expect(SCORE_COUNT_UP_DEFAULT_DURATION_MS).toBeGreaterThan(0);
  });
});
