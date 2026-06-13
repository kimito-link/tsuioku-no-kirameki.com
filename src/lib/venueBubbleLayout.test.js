import { describe, it, expect } from 'vitest';
import {
  bubbleAnchorForSeatRect,
  resolveBubbleY,
  BUBBLE_ANCHOR_GAP
} from './venueBubbleLayout.js';

describe('bubbleAnchorForSeatRect', () => {
  it('席の上端中央(頭上)をアンカーにする', () => {
    const a = bubbleAnchorForSeatRect({ left: 100, top: 200, width: 80, height: 80 });
    expect(a.x).toBe(140); // 100 + 80/2
    expect(a.y).toBe(200 - BUBBLE_ANCHOR_GAP);
  });
  it('gap を指定できる', () => {
    const a = bubbleAnchorForSeatRect({ left: 0, top: 100, width: 40, height: 40 }, 20);
    expect(a).toEqual({ x: 20, y: 80 });
  });
  it('壊れた入力でも数値を返す', () => {
    const a = bubbleAnchorForSeatRect(null);
    expect(Number.isFinite(a.x)).toBe(true);
    expect(Number.isFinite(a.y)).toBe(true);
  });
});

describe('resolveBubbleY', () => {
  it('既存が無ければ候補の y のまま', () => {
    expect(resolveBubbleY({ x: 100, y: 300, h: 40 }, [])).toBe(300);
  });

  it('同じ列で重なる既存があれば上へ逃がす', () => {
    // 既存: x=100, 下辺y=300, h=40 → 帯 [260,300]
    // 候補: x=110(近い), 下辺y=300, h=40 → 重なる → 既存の上端260 - vGap(6) = 254
    const y = resolveBubbleY({ x: 110, y: 300, h: 40 }, [{ x: 100, y: 300, h: 40 }], { vGap: 6 });
    expect(y).toBe(254);
  });

  it('列が離れていれば重ならない(ずらさない)', () => {
    const y = resolveBubbleY({ x: 500, y: 300, h: 40 }, [{ x: 100, y: 300, h: 40 }], { xThreshold: 120 });
    expect(y).toBe(300);
  });

  it('複数重なりでも連鎖的に解消する', () => {
    const placed = [
      { x: 100, y: 300, h: 40 }, // 帯 [260,300]
      { x: 105, y: 254, h: 40 } // 帯 [214,254]
    ];
    // 候補は両方と重なる → 一番上(214)の更に上へ: 214 - 6 = 208
    const y = resolveBubbleY({ x: 102, y: 300, h: 40 }, placed, { vGap: 6 });
    expect(y).toBe(208);
  });

  it('上端を越えそうなら minY にクランプ(画面内優先)', () => {
    // h=40, minY=8 → y は最低 48
    const y = resolveBubbleY({ x: 100, y: 20, h: 40 }, [], { minY: 8 });
    expect(y).toBe(48);
  });
});
