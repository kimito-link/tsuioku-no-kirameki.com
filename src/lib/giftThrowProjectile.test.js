import { describe, it, expect } from 'vitest';
import {
  resolveGiftProjectile,
  resolveGiftThrowPath,
  resolveGiftImageUrl,
  canLaunchGiftThrow,
  resolveVisibleThrowPoint,
  GIFT_THROW_MAX_CONCURRENT,
  GIFT_THROW_ARC_LIFT_PX,
  GIFT_THROW_DURATION_MS,
  GIFT_THUMBNAIL_BASE
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

  it('v0.1.1058: item 空のギフトは汎用ラベル「ギフト」で投げる(itemName欠落でも取りこぼさない)', () => {
    const p = resolveGiftProjectile({ sender: 'A', item: '', point: 10 }, 'gift');
    expect(p).toMatchObject({ kind: 'gift', emoji: '🎁', label: 'ギフト', point: 10, tier: 'small' });
  });

  it('v0.1.1058: item 未指定のギフトも汎用ラベル「ギフト」で投げる', () => {
    const p = resolveGiftProjectile({ sender: 'A', point: 10 }, 'gift');
    expect(p).toMatchObject({ kind: 'gift', emoji: '🎁', label: 'ギフト' });
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

  it('v0.1.783: itemId があれば imageUrl に実画像 URL が乗る(NDGR event 経路)', () => {
    const p = resolveGiftProjectile({ item: 'バスケットボール', point: 10, itemId: 'ball_basketball' }, 'gift');
    expect(p.imageUrl).toBe(`${GIFT_THUMBNAIL_BASE}ball_basketball.png`);
  });

  it('v0.1.783: itemId が無い/不正なギフトは imageUrl が空(絵文字フォールバック)', () => {
    expect(resolveGiftProjectile({ item: 'x', point: 10 }, 'gift').imageUrl).toBe('');
    expect(resolveGiftProjectile({ item: 'x', point: 10, itemId: '' }, 'gift').imageUrl).toBe('');
    // nx:/system: prefix や日本語本文は URL に乗せない(誤検知の混入防止)。
    expect(resolveGiftProjectile({ item: 'x', point: 10, itemId: 'nx:gift:show' }, 'gift').imageUrl).toBe('');
    expect(resolveGiftProjectile({ item: 'x', point: 10, itemId: '応援' }, 'gift').imageUrl).toBe('');
  });

  it('v0.1.783: 広告は imageUrl 常に空', () => {
    expect(resolveGiftProjectile({ point: 100 }, 'ad').imageUrl).toBe('');
  });

  it('v0.1.783: duration を延長(着弾が一瞬で消えない)', () => {
    expect(GIFT_THROW_DURATION_MS.small).toBeGreaterThanOrEqual(1500);
    expect(GIFT_THROW_DURATION_MS.mega).toBeGreaterThan(GIFT_THROW_DURATION_MS.small);
  });
});

describe('resolveGiftImageUrl', () => {
  it('slug 形式の item_id は CDN URL を返す', () => {
    expect(resolveGiftImageUrl('stamp_thanks')).toBe(`${GIFT_THUMBNAIL_BASE}stamp_thanks.png`);
    expect(resolveGiftImageUrl('heart')).toBe(`${GIFT_THUMBNAIL_BASE}heart.png`);
    expect(resolveGiftImageUrl('  ball_basketball  ')).toBe(`${GIFT_THUMBNAIL_BASE}ball_basketball.png`);
  });

  it('不正な item_id は空(URL に乗せない)', () => {
    expect(resolveGiftImageUrl('')).toBe('');
    expect(resolveGiftImageUrl(null)).toBe('');
    expect(resolveGiftImageUrl(undefined)).toBe('');
    expect(resolveGiftImageUrl('ab')).toBe(''); // 短すぎ(3文字未満)
    expect(resolveGiftImageUrl('1leading_digit')).toBe(''); // 先頭が数字
    expect(resolveGiftImageUrl('nx:gift:show')).toBe(''); // event type 混入
    expect(resolveGiftImageUrl('応援メガホン')).toBe(''); // 日本語(chat本文の誤検知)
    expect(resolveGiftImageUrl('a'.repeat(81))).toBe(''); // 長すぎ
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

describe('resolveVisibleThrowPoint (2026-07-06: デルタ補完/来場の飛翔が見えないバグの根治)', () => {
  it('通常の有効な座標(レイヤー内)はそのまま使う', () => {
    const r = resolveVisibleThrowPoint({ x: 200, y: 560 }, { width: 800, height: 600 }, 'origin');
    expect(r).toEqual({ x: 200, y: 560, usedFallback: false });
  });

  it('原点(0,0)ちょうどはレイアウト未確定の典型値としてフォールバックする', () => {
    const r = resolveVisibleThrowPoint({ x: 0, y: 0 }, { width: 800, height: 600 }, 'origin');
    expect(r.usedFallback).toBe(true);
    expect(r.x).toBeGreaterThan(0);
    expect(r.y).toBeGreaterThan(0);
  });

  it('レイヤーサイズが既知の時、領域外の座標はフォールバックする', () => {
    const r = resolveVisibleThrowPoint({ x: 9999, y: 9999 }, { width: 800, height: 600 }, 'target');
    expect(r.usedFallback).toBe(true);
    expect(r.x).toBeLessThanOrEqual(800);
    expect(r.y).toBeLessThanOrEqual(600);
  });

  it('負の座標もフォールバックする', () => {
    const r = resolveVisibleThrowPoint({ x: -10, y: -10 }, { width: 800, height: 600 }, 'origin');
    expect(r.usedFallback).toBe(true);
  });

  it('NaN/undefined座標はフォールバックする(有限数でない)', () => {
    expect(resolveVisibleThrowPoint({ x: NaN, y: 100 }, { width: 800, height: 600 }, 'origin').usedFallback).toBe(true);
    expect(resolveVisibleThrowPoint(undefined, { width: 800, height: 600 }, 'origin').usedFallback).toBe(true);
    expect(resolveVisibleThrowPoint(null, { width: 800, height: 600 }, 'target').usedFallback).toBe(true);
  });

  it('レイヤーサイズも未確定(幅/高さ0)なら固定の既定サイズを基準にフォールバックする(必ず有限座標)', () => {
    const origin = resolveVisibleThrowPoint({ x: 0, y: 0 }, { width: 0, height: 0 }, 'origin');
    const target = resolveVisibleThrowPoint(null, null, 'target');
    expect(Number.isFinite(origin.x)).toBe(true);
    expect(Number.isFinite(origin.y)).toBe(true);
    expect(Number.isFinite(target.x)).toBe(true);
    expect(Number.isFinite(target.y)).toBe(true);
    expect(origin.usedFallback).toBe(true);
    expect(target.usedFallback).toBe(true);
  });

  it('origin既定は下端寄り・target既定は中央よりやや上(見た目の役割が違う)', () => {
    const origin = resolveVisibleThrowPoint({ x: 0, y: 0 }, { width: 800, height: 600 }, 'origin');
    const target = resolveVisibleThrowPoint({ x: 0, y: 0 }, { width: 800, height: 600 }, 'target');
    expect(origin.y).toBeGreaterThan(target.y); // originはtargetより下(客席帯)
  });

  it('境界値(0<=x<=width, 0<=y<=height)は使える(境界包含)', () => {
    const r = resolveVisibleThrowPoint({ x: 800, y: 600 }, { width: 800, height: 600 }, 'origin');
    expect(r.usedFallback).toBe(false);
  });
});
