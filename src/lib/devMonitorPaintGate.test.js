import { describe, it, expect } from 'vitest';
import { shouldRunDevMonitorPaint } from './devMonitorPaintGate.js';

/*
 * dev monitor の重い集計を「パネルが開いているときだけ」走らせるゲート判定。
 * スクロール重さ根治 PR1(2026-06-05・[[reference_scroll_5yr_architecture_plan]])。
 */

describe('shouldRunDevMonitorPaint', () => {
  it('パネルが開いている(open=true)なら実行する', () => {
    expect(shouldRunDevMonitorPaint({ panelOpen: true })).toBe(true);
  });

  it('パネルが閉じている(open=false)ならスキップする', () => {
    expect(shouldRunDevMonitorPaint({ panelOpen: false })).toBe(false);
  });

  it('要素が無い(null/undefined)= 閉扱いでスキップ(O(N)集計を回さない)', () => {
    expect(shouldRunDevMonitorPaint({ panelOpen: null })).toBe(false);
    expect(shouldRunDevMonitorPaint({ panelOpen: undefined })).toBe(false);
    expect(shouldRunDevMonitorPaint({})).toBe(false);
    expect(shouldRunDevMonitorPaint(undefined)).toBe(false);
  });

  it('真偽値以外の truthy(1/"open")は厳格に false(=== true のみ許可)', () => {
    // details.open は常に boolean なので、想定外の値は安全側(スキップ)に倒す。
    expect(shouldRunDevMonitorPaint({ panelOpen: 1 })).toBe(false);
    expect(shouldRunDevMonitorPaint({ panelOpen: 'open' })).toBe(false);
  });
});
