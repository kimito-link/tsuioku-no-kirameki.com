import { describe, it, expect } from 'vitest';
import { chooseBubblePlacement, resolveVisibleAnchor, coveredBubbleIndexes } from './bubblePlacement.js';

/** @param {{left:number,top:number}} p @param {{w:number,h:number}} s */
const boxOf = (p, s) => ({ left: p.left, top: p.top, right: p.left + s.w, bottom: p.top + s.h });
/** @param {any} a @param {any} b */
const overlaps = (a, b) => Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);

const BOUNDS = { left: 0, top: 0, right: 1000, bottom: 800 };
const SIZE = { w: 200, h: 50 };
const SEAT = { left: 400, top: 400, width: 50, height: 50 };

describe('chooseBubblePlacement', () => {
  it('何も邪魔が無ければ席の頭上・真ん中(尻尾は席の中央)', () => {
    const p = chooseBubblePlacement({ anchor: SEAT, size: SIZE, bounds: BOUNDS });
    expect(p.side).toBe('top');
    expect(p.top + SIZE.h).toBeLessThanOrEqual(400);
    expect(p.left + p.tail).toBe(425);
  });

  it('頭上に PICK UP 等の大事な物があれば被せず、下へ出す(ユーザー報告の症状)', () => {
    const pickup = { left: 0, top: 330, right: 1000, bottom: 395, weight: 3 };
    const p = chooseBubblePlacement({ anchor: SEAT, size: SIZE, bounds: BOUNDS, obstacles: [pickup] });
    expect(overlaps(boxOf(p, SIZE), pickup)).toBe(false);
    expect(p.side).toBe('bottom');
    expect(p.top).toBeGreaterThanOrEqual(450);
  });

  it('上も下も塞がっていれば横に出し、話した人の顔は隠さない', () => {
    const above = { left: 0, top: 300, right: 1000, bottom: 395, weight: 3 };
    const below = { left: 0, top: 455, right: 1000, bottom: 600, weight: 3 };
    const p = chooseBubblePlacement({ anchor: SEAT, size: SIZE, bounds: BOUNDS, obstacles: [above, below] });
    expect(['left', 'right']).toContain(p.side);
    expect(overlaps(boxOf(p, SIZE), { left: 400, top: 400, right: 450, bottom: 450 })).toBe(false);
  });

  it('他の吹き出しとは重ねない(頭上にあれば別の向きか、その上へ)', () => {
    const other = { left: 330, top: 340, right: 530, bottom: 390, weight: 5 };
    const p = chooseBubblePlacement({ anchor: SEAT, size: SIZE, bounds: BOUNDS, obstacles: [other] });
    expect(overlaps(boxOf(p, SIZE), other)).toBe(false);
  });

  it('画面の端の席でも、吹き出しは画面からはみ出さず尻尾は席を指す', () => {
    const edgeSeat = { left: 960, top: 400, width: 40, height: 40 };
    const p = chooseBubblePlacement({ anchor: edgeSeat, size: SIZE, bounds: BOUNDS });
    expect(p.left).toBeGreaterThanOrEqual(0);
    expect(p.left + SIZE.w).toBeLessThanOrEqual(1000);
    if (p.side === 'top' || p.side === 'bottom') expect(Math.abs(p.left + p.tail - 980)).toBeLessThanOrEqual(20);
  });

  it('混んでいても、吹き出しを席から何百pxも先(配信映像の上)まで飛ばさない', () => {
    const stack = [0, 1, 2, 3, 4].map((i) => ({ left: 300, top: 340 - i * 56, right: 560, bottom: 390 - i * 56, weight: 5 }));
    const p = chooseBubblePlacement({ anchor: SEAT, size: SIZE, bounds: BOUNDS, obstacles: stack, sides: ['top'] });
    expect(400 - (p.top + SIZE.h)).toBeLessThan(200);
  });

  it('壊れた入力でも例外を出さず、何かしらの置き場所を返す(§3.6)', () => {
    // @ts-expect-error 壊れた入力
    const p = chooseBubblePlacement({ anchor: null, size: null, bounds: null, obstacles: [null, { weight: 3 }] });
    expect(Number.isFinite(p.left) && Number.isFinite(p.top)).toBe(true);
  });
});

describe('resolveVisibleAnchor', () => {
  const clip = { left: 0, top: 100, right: 600, bottom: 300 };
  it('枠の中で見えている席はそのまま', () => {
    const r = resolveVisibleAnchor({ left: 100, top: 150, width: 40, height: 40 }, clip);
    expect(r.visible).toBe(true);
    expect(r.anchor.top).toBe(150);
  });
  it('一覧の下へスクロールで隠れた席は、一覧の下の縁(見えている側)に寄せる', () => {
    const r = resolveVisibleAnchor({ left: 100, top: 380, width: 40, height: 40 }, clip);
    expect(r.visible).toBe(false);
    expect(r.edge).toBe('bottom');
    expect(r.anchor.top).toBeLessThanOrEqual(300);
    expect(r.anchor.top).toBeGreaterThan(290);
    expect(Math.round((r.anchor.left + r.anchor.right) / 2)).toBe(120);
  });
  it('上へ隠れた席は上の縁', () => {
    const r = resolveVisibleAnchor({ left: 100, top: 20, width: 40, height: 40 }, clip);
    expect(r.edge).toBe('top');
    expect(r.anchor.top).toBeGreaterThanOrEqual(100);
  });
  it('半分以上見えていれば見えている扱い・枠が無ければ常に見えている扱い', () => {
    expect(resolveVisibleAnchor({ left: 0, top: 270, width: 40, height: 40 }, clip).visible).toBe(true);
    expect(resolveVisibleAnchor({ left: 0, top: 900, width: 40, height: 40 }, null).visible).toBe(true);
  });
});

describe('coveredBubbleIndexes', () => {
  it('新しい吹き出しが大きく隠した古い吹き出しだけを返す', () => {
    const me = { left: 0, top: 0, right: 100, bottom: 50 };
    const others = [
      { left: 10, top: 10, right: 110, bottom: 60 }, // ほぼ隠れる
      { left: 95, top: 0, right: 195, bottom: 50 }, // 端が少し触れるだけ
      null
    ];
    expect(coveredBubbleIndexes(me, others)).toEqual([0]);
  });
});
