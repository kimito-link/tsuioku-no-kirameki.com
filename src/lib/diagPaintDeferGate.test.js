import { describe, it, expect } from 'vitest';
import { shouldSkipHeavyDiagPaint } from './diagPaintDeferGate.js';

/*
 * 重い diag 集計(全件O(N))をスクロール中スキップしてよいかの純判定。
 * スクロール重さ根治 PR4(2026-06-05・[[reference_scroll_5yr_architecture_plan]])。
 */

describe('shouldSkipHeavyDiagPaint', () => {
  it('スクロール中 かつ 描画済 ならスキップしてよい', () => {
    expect(shouldSkipHeavyDiagPaint({ scrolling: true, alreadyPainted: true })).toBe(true);
  });

  it('スクロール中でも 未描画(初回/配信切替)なら必ず計算する(=スキップ不可)', () => {
    expect(shouldSkipHeavyDiagPaint({ scrolling: true, alreadyPainted: false })).toBe(false);
  });

  it('描画済でも スクロールしていなければ計算する', () => {
    expect(shouldSkipHeavyDiagPaint({ scrolling: false, alreadyPainted: true })).toBe(false);
  });

  it('両方 false なら計算する', () => {
    expect(shouldSkipHeavyDiagPaint({ scrolling: false, alreadyPainted: false })).toBe(false);
  });

  it('引数欠落・非真偽値は安全側(計算する=スキップしない)', () => {
    expect(shouldSkipHeavyDiagPaint({})).toBe(false);
    expect(shouldSkipHeavyDiagPaint(undefined)).toBe(false);
    expect(shouldSkipHeavyDiagPaint({ scrolling: 1, alreadyPainted: 1 })).toBe(false);
  });
});
