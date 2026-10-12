import { describe, it, expect } from 'vitest';
import { shouldYieldToStoredMirror, LANE_MIRROR_YIELD_WINDOW_MS } from './laneMirrorWriterYield.js';

const stored = (o = {}) => ({ writerId: 'other', pickedLength: 1096, capturedAt: 1000, ...o });

describe('shouldYieldToStoredMirror(小さい鏡は大きい鏡を上書きしない)', () => {
  it('他のパネルが直近により大きい鏡を書いていたら譲る', () => {
    expect(shouldYieldToStoredMirror(stored(), { pickedLength: 283 }, 'me', 2000)).toBe(true);
  });

  it('自分の方が大きい/同数なら譲らない', () => {
    expect(shouldYieldToStoredMirror(stored({ pickedLength: 300 }), { pickedLength: 301 }, 'me', 2000)).toBe(false);
    expect(shouldYieldToStoredMirror(stored({ pickedLength: 300 }), { pickedLength: 300 }, 'me', 2000)).toBe(false);
  });

  it('窓を過ぎたら(大きい方が止まったら)自分が書く', () => {
    expect(shouldYieldToStoredMirror(stored(), { pickedLength: 1 }, 'me', 1000 + LANE_MIRROR_YIELD_WINDOW_MS)).toBe(true);
    expect(shouldYieldToStoredMirror(stored(), { pickedLength: 1 }, 'me', 1000 + LANE_MIRROR_YIELD_WINDOW_MS + 1)).toBe(false);
  });

  it('窓は鏡の書き込み床(60秒)より長い(大きい側が静かな間に上書きされない)', () => {
    expect(LANE_MIRROR_YIELD_WINDOW_MS).toBeGreaterThan(120_000); // 重いPCで書き込み間隔が114秒まで開いた実測より長い
    expect(LANE_MIRROR_YIELD_WINDOW_MS).toBeLessThan(900_000); // 会場が古い鏡を使い続ける上限(HARD 15分)より小さい
  });

  it('自分が書いた鏡・writerId の無い旧版の鏡には譲らない', () => {
    expect(shouldYieldToStoredMirror(stored({ writerId: 'me' }), { pickedLength: 1 }, 'me', 2000)).toBe(false);
    expect(shouldYieldToStoredMirror(stored({ writerId: '' }), { pickedLength: 1 }, 'me', 2000)).toBe(false);
    expect(shouldYieldToStoredMirror(stored({ writerId: undefined }), { pickedLength: 1 }, 'me', 2000)).toBe(false);
  });

  it('壊れた入力は譲らない(判定できないときに止めない)', () => {
    expect(shouldYieldToStoredMirror(null, { pickedLength: 1 }, 'me', 2000)).toBe(false);
    expect(shouldYieldToStoredMirror(undefined, { pickedLength: 1 }, 'me', 2000)).toBe(false);
    expect(shouldYieldToStoredMirror(stored({ capturedAt: 0 }), { pickedLength: 1 }, 'me', 2000)).toBe(false);
    expect(shouldYieldToStoredMirror(stored({ capturedAt: 'x' }), { pickedLength: 1 }, 'me', 2000)).toBe(false);
  });

  it('時計が戻っても譲り続けない(未来の capturedAt は無視)', () => {
    expect(shouldYieldToStoredMirror(stored({ capturedAt: 5000 }), { pickedLength: 1 }, 'me', 4000)).toBe(false);
  });
});
