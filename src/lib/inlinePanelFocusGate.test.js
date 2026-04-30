/**
 * inlinePanelFocusGate のテスト。
 *
 * 0.1.11 (B1): toolbar からの NLS_FOCUS_INLINE_PANEL 受信 →
 *   renderPageFrameOverlay() で host 挿入直後、rect が確定する前に
 *   focusInlinePanelHostFromToolbar が r.width < 120 で false を返してしまう
 *   レース条件があった。判定ロジックをここに切り出して unit test し、
 *   呼び出し側は pollUntil で 500ms 待つ async 版に置き換える。
 */

import { describe, it, expect } from 'vitest';
import { isInlinePanelHostReadyForFocus } from './inlinePanelFocusGate.js';

/**
 * @param {{ width?: number, height?: number, display?: string, visibility?: string, isConnected?: boolean }} [opts]
 */
function makeHostStub(opts = {}) {
  const width = opts.width ?? 320;
  const height = opts.height ?? 480;
  const display = opts.display ?? 'block';
  const visibility = opts.visibility ?? 'visible';
  const isConnected = opts.isConnected ?? true;
  return {
    host: { isConnected },
    deps: {
      getComputedStyle: () => ({ display, visibility }),
      getBoundingClientRect: () => ({ width, height })
    }
  };
}

describe('isInlinePanelHostReadyForFocus', () => {
  it('null/undefined host は ready ではない', () => {
    const { deps } = makeHostStub();
    expect(isInlinePanelHostReadyForFocus(null, deps)).toBe(false);
    expect(isInlinePanelHostReadyForFocus(undefined, deps)).toBe(false);
  });

  it('isConnected=false は ready ではない（DOM から外された host）', () => {
    const { host, deps } = makeHostStub({ isConnected: false });
    expect(isInlinePanelHostReadyForFocus(host, deps)).toBe(false);
  });

  it('display:none は ready ではない', () => {
    const { host, deps } = makeHostStub({ display: 'none' });
    expect(isInlinePanelHostReadyForFocus(host, deps)).toBe(false);
  });

  it('visibility:hidden は ready ではない', () => {
    const { host, deps } = makeHostStub({ visibility: 'hidden' });
    expect(isInlinePanelHostReadyForFocus(host, deps)).toBe(false);
  });

  it('rect width が minSize 未満は ready ではない（rect 未確定の典型ケース）', () => {
    const { host, deps } = makeHostStub({ width: 0, height: 480 });
    expect(isInlinePanelHostReadyForFocus(host, deps)).toBe(false);
  });

  it('rect height が minSize 未満は ready ではない', () => {
    const { host, deps } = makeHostStub({ width: 320, height: 0 });
    expect(isInlinePanelHostReadyForFocus(host, deps)).toBe(false);
  });

  it('rect が boundary (デフォルト 120x120) ちょうどは ready', () => {
    const { host, deps } = makeHostStub({ width: 120, height: 120 });
    expect(isInlinePanelHostReadyForFocus(host, deps)).toBe(true);
  });

  it('rect が boundary 未満（119x120）は ready ではない', () => {
    const { host, deps } = makeHostStub({ width: 119, height: 120 });
    expect(isInlinePanelHostReadyForFocus(host, deps)).toBe(false);
  });

  it('全条件満たすときに ready', () => {
    const { host, deps } = makeHostStub();
    expect(isInlinePanelHostReadyForFocus(host, deps)).toBe(true);
  });

  it('minSize 引数で閾値を変更できる（テスト用）', () => {
    const { host, deps } = makeHostStub({ width: 80, height: 80 });
    expect(
      isInlinePanelHostReadyForFocus(host, { ...deps, minSize: 80 })
    ).toBe(true);
    expect(
      isInlinePanelHostReadyForFocus(host, { ...deps, minSize: 120 })
    ).toBe(false);
  });

  it('display: flex / inline-block など block 以外でも ready（none と hidden だけが NG）', () => {
    for (const display of ['flex', 'inline-block', 'grid', 'inline']) {
      const { host, deps } = makeHostStub({ display });
      expect(isInlinePanelHostReadyForFocus(host, deps)).toBe(true);
    }
  });
});
