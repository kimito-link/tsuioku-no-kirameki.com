import { describe, it, expect } from 'vitest';
import {
  resolveGiftProjectile,
  resolveGiftThrowPath,
  canLaunchGiftThrow,
  GIFT_THROW_MAX_CONCURRENT,
  GIFT_THROW_ARC_LIFT_PX,
  GIFT_THROW_DURATION_MS
} from './giftThrowProjectile.js';

describe('resolveGiftProjectile', () => {
  it('ギフトは 🎁 + アイテム名・帯/duration を point から決める', () => {
    const p = resolveGiftProjectile({ sender: 'A', item: '応援メガホン 黄', point: 10 }, 'gift');
    expect(p).toMatchObject({ kind: 'gift', emoji: '🎁', label: '応援メガホン 黄', point: 10, tier: 'small' });
    expect(p.durationMs).toBe(GIFT_THROW_DURATION_MS.small);
  });

  it('広告は 📣 + Npt・point<=0 は null', () => {
    expect(resolveGiftProjectile({ sender: 'B', point: 100 }, 'ad')).toMatchObject({
      kind: 'ad', emoji: '📣', label: '100pt', tier: 'medium'
    });
    expect(resolveGiftProjectile({ sender: 'B', point: 0 }, 'ad')).toBeNull();
  });

  it('item 空のギフトは null(無効)', () => {
    expect(resolveGiftProjectile({ sender: 'A', item: '', point: 10 }, 'gift')).toBeNull();
  });

  it('帯の閾値: 50/500/5000 で medium/large/mega', () => {
    expect(resolveGiftProjectile({ item: 'x', point: 49 }, 'gift').tier).toBe('small');
    expect(resolveGiftProjectile({ item: 'x', point: 50 }, 'gift').tier).toBe('medium');
    expect(resolveGiftProjectile({ item: 'x', point: 500 }, 'gift').tier).toBe('large');
    expect(resolveGiftProjectile({ item: 'x', point: 5000 }, 'gift').tier).toBe('mega');
  });

  it('長いアイテム名は省略(投げ物が巨大化しない)', () => {
    const p = resolveGiftProjectile({ item: 'あ'.repeat(40), point: 10 }, 'gift');
    expect(Array.from(p.label).length).toBeLessThanOrEqual(15); // 14 + …
    expect(p.label.endsWith('…')).toBe(true);
  });

  it('壊れた入力は null', () => {
    expect(resolveGiftProjectile(null, 'gift')).toBeNull();
    expect(resolveGiftProjectile(undefined, 'ad')).toBeNull();
  });
});

describe('resolveGiftThrowPath', () => {
  it('差分 dx/dy と アーチ中間点を返す', () => {
    const r = resolveGiftThrowPath({ x: 100, y: 400 }, { x: 300, y: 100 });
    expect(r.startX).toBe(100);
    expect(r.startY).toBe(400);
    expect(r.dx).toBe(200);
    expect(r.dy).toBe(-300);
    expect(r.midX).toBeCloseTo(120); // 200*0.6
    expect(r.midY).toBeCloseTo(-300 * 0.6 - GIFT_THROW_ARC_LIFT_PX); // -180 - 90
  });

  it('lift を変えると中間 Y が上がる', () => {
    const a = resolveGiftThrowPath({ x: 0, y: 0 }, { x: 0, y: 0 }, 0);
    const b = resolveGiftThrowPath({ x: 0, y: 0 }, { x: 0, y: 0 }, 100);
    expect(a.midY).toBe(0);
    expect(b.midY).toBe(-100);
  });

  it('壊れた座標は 0 扱いで安全', () => {
    const r = resolveGiftThrowPath(null, undefined);
    expect(r).toMatchObject({ startX: 0, startY: 0, dx: 0, dy: 0 });
  });
});

describe('canLaunchGiftThrow', () => {
  it('上限未満なら true・以上なら false', () => {
    expect(canLaunchGiftThrow(0)).toBe(true);
    expect(canLaunchGiftThrow(GIFT_THROW_MAX_CONCURRENT - 1)).toBe(true);
    expect(canLaunchGiftThrow(GIFT_THROW_MAX_CONCURRENT)).toBe(false);
    expect(canLaunchGiftThrow(GIFT_THROW_MAX_CONCURRENT + 5)).toBe(false);
  });

  it('max を明示できる', () => {
    expect(canLaunchGiftThrow(3, 3)).toBe(false);
    expect(canLaunchGiftThrow(2, 3)).toBe(true);
  });
});
