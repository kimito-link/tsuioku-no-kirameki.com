import { describe, it, expect } from 'vitest';
import {
  resolveNdgrPendingThreshold,
  NDGR_HIDDEN_PENDING_THRESHOLD
} from './ndgrHiddenFlushThreshold.js';

/**
 * ★v0.1.1417: 裏タブでコメントが数十秒遅れる問題の本体。
 *
 * 実機(2026-08-16)の「即時プッシュ 配達平均47,686ms」の真因は、
 * Chrome が hidden タブの setTimeout を約1分にクランプすること。
 * 逃げ道の「N行溜まったら即座に吐く」閾値が 240 と大きく、
 * タイマーも来ない・閾値にも届かない板挟みで数十秒溜まっていた。
 */
describe('resolveNdgrPendingThreshold', () => {
  it('可視中は既存のしきい値をそのまま使う(挙動を変えない)', () => {
    expect(resolveNdgrPendingThreshold({ hidden: false, visibleThreshold: 240 })).toBe(240);
  });

  it('★裏タブではしきい値を下げる(数十秒待たされないように)', () => {
    const v = resolveNdgrPendingThreshold({ hidden: true, visibleThreshold: 240 });
    expect(v).toBe(NDGR_HIDDEN_PENDING_THRESHOLD);
    expect(v).toBeLessThan(240);
  });

  it('★体感の見積り: 毎秒10行の配信なら、裏タブの最悪待ちが1桁秒に収まる', () => {
    const rowsPerSec = 10;
    const hidden = resolveNdgrPendingThreshold({ hidden: true, visibleThreshold: 240 });
    const visible = resolveNdgrPendingThreshold({ hidden: false, visibleThreshold: 240 });
    // 旧挙動(240行)は 24秒。タイマーが60秒クランプなら閾値が先に効く=24秒待ち。
    expect(visible / rowsPerSec).toBeGreaterThanOrEqual(20);
    // 新挙動は 4秒。
    expect(hidden / rowsPerSec).toBeLessThanOrEqual(5);
  });

  it('hidden 未指定は可視扱い(安全側=既存挙動)', () => {
    expect(resolveNdgrPendingThreshold({ visibleThreshold: 240 })).toBe(240);
    expect(resolveNdgrPendingThreshold()).toBe(240);
  });

  it('可視中の値が壊れていても既定(240)へ落ちる', () => {
    expect(resolveNdgrPendingThreshold({ visibleThreshold: 0 })).toBe(240);
    expect(resolveNdgrPendingThreshold({ visibleThreshold: NaN })).toBe(240);
    expect(resolveNdgrPendingThreshold({ visibleThreshold: undefined })).toBe(240);
  });

  it('★裏タブのしきい値が可視中を上回らない(逆転を作らない)', () => {
    // 呼び出し側が可視中を極端に小さくした場合でも、裏タブが溜め込む側にならない。
    expect(resolveNdgrPendingThreshold({ hidden: true, visibleThreshold: 10 })).toBe(10);
  });

  it('しきい値は必ず1以上の整数', () => {
    const v = resolveNdgrPendingThreshold({ hidden: true, visibleThreshold: 240, hiddenThreshold: 0.4 });
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(1);
  });
});
