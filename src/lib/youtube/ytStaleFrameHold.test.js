import { describe, it, expect } from 'vitest';
import { createStaleFrameHold } from './ytStaleFrameHold.js';

function clock() {
  let t = 0;
  /** @type {number[]} */
  const slept = [];
  return {
    now: () => t,
    sleep: async (/** @type {number} */ ms) => {
      slept.push(ms);
      t += ms;
    },
    advance: (/** @type {number} */ ms) => {
      t += ms;
    },
    slept,
  };
}

describe('createStaleFrameHold(0.1.1958: 切り替わる直前の古い画面は次の配信を描かない)', () => {
  it('サービスが同じなら待たない', async () => {
    const c = clock();
    const h = createStaleFrameHold({ now: c.now, sleep: c.sleep });
    expect(await h.wait(false)).toBe(false);
    expect(c.slept).toEqual([]);
    expect(h.heldCount()).toBe(0);
  });

  it('食い違ったら、最初の食い違いから 3 秒までは返事を待たせる', async () => {
    const c = clock();
    const h = createStaleFrameHold({ now: c.now, sleep: c.sleep });
    expect(await h.wait(true)).toBe(true);
    expect(c.slept).toEqual([3000]);
    expect(h.heldCount()).toBe(1);
  });

  it('途中で来た2回目は残りの時間だけ待つ', async () => {
    const c = clock();
    /** @type {number[]} */
    const waited = [];
    const h = createStaleFrameHold({ graceMs: 3000, now: c.now, sleep: async (ms) => { waited.push(ms); } });
    await h.wait(true); // t=0 で始まる(この sleep は時間を進めない)
    c.advance(1000);
    await h.wait(true);
    expect(waited).toEqual([3000, 2000]);
  });

  it('作り直されずに3秒過ぎたら、いつもどおり答える(止まったままにしない)', async () => {
    const c = clock();
    const h = createStaleFrameHold({ now: c.now, sleep: c.sleep });
    await h.wait(true);
    expect(await h.wait(true)).toBe(false);
    c.advance(60_000);
    expect(await h.wait(true)).toBe(false);
    expect(h.heldCount()).toBe(1);
  });
});
