import { describe, it, expect, vi } from 'vitest';
import { moveNodePreservingState, moveNodeAfterPreservingState } from './moveNodePreservingState.js';

function mkParent(extra = {}) {
  return { isConnected: true, insertBefore: vi.fn(), ...extra };
}

describe('moveNodePreservingState', () => {
  it('moveBefore があり両方繋がっていれば moveBefore で動かす', () => {
    const p = mkParent({ moveBefore: vi.fn() });
    const n = { isConnected: true };
    expect(moveNodePreservingState(p, n, null)).toBe('moved');
    expect(p.moveBefore).toHaveBeenCalledWith(n, null);
    expect(p.insertBefore).not.toHaveBeenCalled();
  });
  it('moveBefore が無ければ insertBefore', () => {
    const p = mkParent();
    const n = { isConnected: true };
    expect(moveNodePreservingState(p, n)).toBe('inserted');
    expect(p.insertBefore).toHaveBeenCalledWith(n, null);
  });
  it('node が未接続なら moveBefore を呼ばない', () => {
    const p = mkParent({ moveBefore: vi.fn() });
    const n = { isConnected: false };
    expect(moveNodePreservingState(p, n)).toBe('inserted');
    expect(p.moveBefore).not.toHaveBeenCalled();
  });
  it('moveBefore が投げたら insertBefore で同じ位置へ', () => {
    const ref = {};
    const p = mkParent({ moveBefore: vi.fn(() => { throw new Error('HierarchyRequestError'); }) });
    const n = { isConnected: true };
    expect(moveNodePreservingState(p, n, ref)).toBe('inserted');
    expect(p.insertBefore).toHaveBeenCalledWith(n, ref);
  });
  it('after 版は anchor.parentNode の anchor.nextSibling の前へ', () => {
    const next = {};
    const p = mkParent({ moveBefore: vi.fn() });
    const anchor = { parentNode: p, nextSibling: next };
    const n = { isConnected: true };
    moveNodeAfterPreservingState(anchor, n);
    expect(p.moveBefore).toHaveBeenCalledWith(n, next);
  });
});
