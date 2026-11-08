import { describe, it, expect } from 'vitest';
import { createInfoPollGate } from './infoPollGate.js';

describe('配信の情報を読む間隔', () => {
  it('配信していないページでも毎秒は読まない(2026-11-09 TikTok で毎秒読んでいた)', () => {
    const g = createInfoPollGate({ liveMs: 30_000, idleMs: 60_000 });
    expect(g.due('a', 0)).toBe(true);
    g.done('a', 'idle', 0);
    let reads = 1;
    for (let t = 1000; t <= 180_000; t += 1000) {
      if (g.due('a', t)) {
        reads += 1;
        g.done('a', 'idle', t);
      }
    }
    expect(reads).toBe(4); // 0・60・120・180 秒
  });
  it('失敗は倍々に間をあけ、上限で止まり、成功で戻る', () => {
    const g = createInfoPollGate({ failBaseMs: 30_000, failMaxMs: 120_000, liveMs: 30_000 });
    g.done('a', 'fail', 0);
    expect(g.due('a', 29_999)).toBe(false);
    expect(g.due('a', 30_000)).toBe(true);
    g.done('a', 'fail', 30_000);
    expect(g.due('a', 89_999)).toBe(false);
    g.done('a', 'fail', 90_000);
    g.done('a', 'fail', 210_000);
    expect(g.fails).toBe(4);
    expect(g.due('a', 329_999)).toBe(false); // 上限 120 秒
    expect(g.due('a', 330_000)).toBe(true);
    g.done('a', 'live', 330_000);
    expect(g.fails).toBe(0);
    expect(g.due('a', 360_000)).toBe(true);
  });
  it('ページが変わればすぐ読む・配信中は終わり際だけ短くできる', () => {
    const g = createInfoPollGate({ liveMs: 30_000 });
    g.done('a', 'live', 0);
    expect(g.due('b', 1)).toBe(true);
    expect(g.due('a', 5_000)).toBe(false);
    expect(g.due('a', 5_000, 5_000)).toBe(true);
    g.done('a', 'idle', 5_000);
    expect(g.due('a', 10_000, 5_000)).toBe(false); // 配信していないときは短くしない
    g.reset();
    expect(g.due('a', 10_001)).toBe(true);
  });
});
