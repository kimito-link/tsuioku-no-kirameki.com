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
import {
  isInlinePanelHostReadyForFocus,
  shouldRespondFocusedNowFromToolbar
} from './inlinePanelFocusGate.js';

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

/*
 * 0.1.15 (M/N): host が DOM に居れば即座に focused=true を返す軽量判定。
 *   isInlinePanelHostReadyForFocus の重い rect 判定を待っていると background が
 *   popup 窓を開く race を起こすので、応答用の判定を分けた。
 */
describe('shouldRespondFocusedNowFromToolbar', () => {
  it('null/undefined → false', () => {
    expect(shouldRespondFocusedNowFromToolbar(null)).toBe(false);
    expect(shouldRespondFocusedNowFromToolbar(undefined)).toBe(false);
  });

  it('isConnected=false（DOM から外された）→ false', () => {
    expect(shouldRespondFocusedNowFromToolbar({ isConnected: false })).toBe(false);
  });

  it('isConnected=true → true（display:none でも rect=0 でも true）', () => {
    expect(shouldRespondFocusedNowFromToolbar({ isConnected: true })).toBe(true);
  });

  it('isConnected が真偽値以外 → false（防御）', () => {
    // @ts-expect-error: invalid input
    expect(shouldRespondFocusedNowFromToolbar({ isConnected: 'yes' })).toBe(false);
    // @ts-expect-error
    expect(shouldRespondFocusedNowFromToolbar({ isConnected: 1 })).toBe(false);
  });

  it('isConnected=true, deps 無し → true（旧挙動の互換）', () => {
    // 古い呼び出し互換: deps 省略時は isConnected のみで判定
    const host = { isConnected: true };
    expect(shouldRespondFocusedNowFromToolbar(host)).toBe(true);
  });

  /*
   * 0.1.43 (Y): prewarm された host が display:none で残ったケースの検出。
   * renderPageFrameOverlay が何らかの理由で host を可視化できなかった場合、
   * focused=true を返すと background が popup window fallback しないため
   * 「kon-ta 押しても何も出ない」現象になる。computedStyle で見える状態を
   * 確認して、不可視なら false を返して background に fallback を任せる。
   */
  describe('0.1.43 (Y): computedStyle deps を渡したとき', () => {
    it('host が display:none → false（popup window fallback を促す）', () => {
      const host = { isConnected: true };
      const deps = {
        getComputedStyle: () => ({ display: 'none', visibility: 'visible' })
      };
      expect(shouldRespondFocusedNowFromToolbar(host, deps)).toBe(false);
    });

    it('host が visibility:hidden → false', () => {
      const host = { isConnected: true };
      const deps = {
        getComputedStyle: () => ({ display: 'block', visibility: 'hidden' })
      };
      expect(shouldRespondFocusedNowFromToolbar(host, deps)).toBe(false);
    });

    it('host が display:block, visibility:visible → true', () => {
      const host = { isConnected: true };
      const deps = {
        getComputedStyle: () => ({ display: 'block', visibility: 'visible' })
      };
      expect(shouldRespondFocusedNowFromToolbar(host, deps)).toBe(true);
    });

    it('display: flex, visibility: visible → true（block 以外でも OK）', () => {
      const host = { isConnected: true };
      const deps = {
        getComputedStyle: () => ({ display: 'flex', visibility: 'visible' })
      };
      expect(shouldRespondFocusedNowFromToolbar(host, deps)).toBe(true);
    });

    it('isConnected=false なら deps があっても false', () => {
      const host = { isConnected: false };
      const deps = {
        getComputedStyle: () => ({ display: 'block', visibility: 'visible' })
      };
      expect(shouldRespondFocusedNowFromToolbar(host, deps)).toBe(false);
    });

    it('getComputedStyle が throw → 保守的に true（popup window race 回避）', () => {
      const host = { isConnected: true };
      const deps = {
        getComputedStyle: () => { throw new Error('detached'); }
      };
      expect(shouldRespondFocusedNowFromToolbar(host, deps)).toBe(true);
    });

    it('deps.getComputedStyle が関数でない → true（旧互換扱い）', () => {
      const host = { isConnected: true };
      // @ts-expect-error - 不正な deps
      expect(shouldRespondFocusedNowFromToolbar(host, {})).toBe(true);
      // @ts-expect-error
      expect(shouldRespondFocusedNowFromToolbar(host, { getComputedStyle: 'not-a-fn' })).toBe(true);
    });
  });
});
