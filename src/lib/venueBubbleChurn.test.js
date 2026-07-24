import { describe, it, expect } from 'vitest';
import {
  createVenueBubbleChurnState,
  observeVenueBubbleSpawn,
  observeVenueBubbleEviction,
  toVenueBubbleChurnDiag
} from './venueBubbleChurn.js';

/**
 * venueBubbleChurn.js — 会場「応援TOP」吹き出しchurnの実測計器(診断先行アプローチ)。
 * 掟: 数えるだけ・DOM/データを触らない(venueSeatLinkParity.js等と同じ)。
 */

describe('createVenueBubbleChurnState', () => {
  it('初期値は全部ゼロ', () => {
    const state = createVenueBubbleChurnState();
    expect(state.spawned).toBe(0);
    expect(state.shortCount).toBe(0);
    expect(state.midCount).toBe(0);
    expect(state.longCount).toBe(0);
    expect(state.evicted).toBe(0);
    expect(state.lastRatePerSec).toBe(0);
  });
});

describe('observeVenueBubbleSpawn', () => {
  it('flowLifetimeMs<1500msはshortCountに分類', () => {
    const state = createVenueBubbleChurnState();
    observeVenueBubbleSpawn(state, { flowLifetimeMs: 1200, ratePerSec: 5 });
    expect(state.spawned).toBe(1);
    expect(state.shortCount).toBe(1);
    expect(state.midCount).toBe(0);
    expect(state.longCount).toBe(0);
    expect(state.lastRatePerSec).toBe(5);
  });

  it('1500ms<=flowLifetimeMs<3000msはmidCountに分類', () => {
    const state = createVenueBubbleChurnState();
    observeVenueBubbleSpawn(state, { flowLifetimeMs: 2000, ratePerSec: 2 });
    expect(state.midCount).toBe(1);
  });

  it('flowLifetimeMs>=3000msはlongCountに分類', () => {
    const state = createVenueBubbleChurnState();
    observeVenueBubbleSpawn(state, { flowLifetimeMs: 4000, ratePerSec: 0.5 });
    expect(state.longCount).toBe(1);
  });

  it('flowLifetimeMsが数値でなければspawnedのみ増える(バケット分類しない)', () => {
    const state = createVenueBubbleChurnState();
    observeVenueBubbleSpawn(state, { flowLifetimeMs: undefined, ratePerSec: 1 });
    expect(state.spawned).toBe(1);
    expect(state.shortCount).toBe(0);
    expect(state.midCount).toBe(0);
    expect(state.longCount).toBe(0);
  });

  it('lastRatePerSecは最後の観測値で上書きされる', () => {
    const state = createVenueBubbleChurnState();
    observeVenueBubbleSpawn(state, { flowLifetimeMs: 1000, ratePerSec: 3 });
    observeVenueBubbleSpawn(state, { flowLifetimeMs: 1000, ratePerSec: 9 });
    expect(state.lastRatePerSec).toBe(9);
  });
});

describe('observeVenueBubbleEviction', () => {
  it('件数ぶんevictedが増える', () => {
    const state = createVenueBubbleChurnState();
    observeVenueBubbleEviction(state, 3);
    observeVenueBubbleEviction(state, 2);
    expect(state.evicted).toBe(5);
  });

  it('負数/非数値は0として扱う(壊れない)', () => {
    const state = createVenueBubbleChurnState();
    observeVenueBubbleEviction(state, -1);
    observeVenueBubbleEviction(state, NaN);
    expect(state.evicted).toBe(0);
  });
});

describe('toVenueBubbleChurnDiag', () => {
  it('spawned=0は⚪未観測', () => {
    const diag = toVenueBubbleChurnDiag(createVenueBubbleChurnState());
    expect(diag.line).toBe('応援TOP吹き出し ⚪ 未観測');
  });

  it('観測済みなら生成累計・バケット分布・強制退去・流速を1行に含む', () => {
    const state = createVenueBubbleChurnState();
    observeVenueBubbleSpawn(state, { flowLifetimeMs: 1200, ratePerSec: 8 });
    observeVenueBubbleSpawn(state, { flowLifetimeMs: 2000, ratePerSec: 6 });
    observeVenueBubbleSpawn(state, { flowLifetimeMs: 4000, ratePerSec: 4 });
    observeVenueBubbleEviction(state, 2);
    const diag = toVenueBubbleChurnDiag(state);
    expect(diag.line).toContain('生成累計3');
    expect(diag.line).toContain('短命<1.5s:1');
    expect(diag.line).toContain('中1.5-3s:1');
    expect(diag.line).toContain('長>3s:1');
    expect(diag.line).toContain('強制退去2');
    expect(diag.line).toContain('直近流速4件/秒');
  });

  it('壊れたstateでも例外を投げずnullを返す', () => {
    expect(toVenueBubbleChurnDiag(null)).toBeNull();
    expect(toVenueBubbleChurnDiag(undefined)).toBeNull();
  });
});
