import { describe, it, expect } from 'vitest';
import { resolveDisplayElapsedSec } from './frozenElapsedOnEnd.js';

describe('resolveDisplayElapsedSec（終了枠の経過秒の凍結）', () => {
  it('未終了(endedFlag null)は live 値をそのまま返す', () => {
    expect(resolveDisplayElapsedSec(null, 100)).toBe(100);
    expect(resolveDisplayElapsedSec(undefined, 250)).toBe(250);
  });

  it('終了 + 凍結値ありは凍結値で止める(live が大きくても採らない=46時間を止める)', () => {
    const flag = { liveId: 'lv1', endedAt: 1700, elapsedSecAtEnd: 3600 };
    // live は 46時間(=165600秒)に伸びていても、凍結値 3600 を返す
    expect(resolveDisplayElapsedSec(flag, 165600)).toBe(3600);
  });

  it('終了 + 凍結値なし(古い終了枠)は live 値へフォールバック(壊さない)', () => {
    const flag = { liveId: 'lv1', endedAt: 1700, elapsedSecAtEnd: null };
    expect(resolveDisplayElapsedSec(flag, 5000)).toBe(5000);
  });

  it('終了 + 凍結値 0(開始直後終了)は 0 を返す(> ではなく >= で尊重)', () => {
    const flag = { liveId: 'lv1', endedAt: 1700, elapsedSecAtEnd: 0 };
    expect(resolveDisplayElapsedSec(flag, 9999)).toBe(0);
  });

  it('endedAt が 0/無効なら未終了扱い=live 値', () => {
    expect(resolveDisplayElapsedSec({ endedAt: 0, elapsedSecAtEnd: 100 }, 50)).toBe(50);
    expect(resolveDisplayElapsedSec({ elapsedSecAtEnd: 100 }, 50)).toBe(50);
  });

  it('live 値が null/NaN なら null(表示側が「—」等に落とせる)', () => {
    expect(resolveDisplayElapsedSec(null, null)).toBe(null);
    expect(resolveDisplayElapsedSec(null, NaN)).toBe(null);
  });

  it('凍結値・live 値とも小数は floor する', () => {
    expect(resolveDisplayElapsedSec({ endedAt: 1, elapsedSecAtEnd: 42.9 }, 100)).toBe(42);
    expect(resolveDisplayElapsedSec(null, 88.7)).toBe(88);
  });
});
