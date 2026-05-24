/**
 * v0.1.201: window.error / unhandledrejection を捕捉する ring buffer のテスト。
 *
 * 診断 JSON `consoleErrorProbe` ブロックに使う pure-ish module。
 * 副作用は (1) 自身の内部 buffer 更新、(2) install/uninstall で window listener 操作のみ。
 */

import { describe, it, expect } from 'vitest';
import {
  createConsoleErrorBuffer,
  isIgnoredErrorMessage
} from './consoleErrorBuffer.js';

describe('createConsoleErrorBuffer', () => {
  it('record で error を保持し、snapshot で取得できる', () => {
    const buf = createConsoleErrorBuffer({ capacity: 10 });
    buf.record({ message: 'fail A', source: 'window.error', timestamp: 1 });
    buf.record({ message: 'fail B', source: 'unhandledrejection', timestamp: 2 });
    const s = buf.snapshot();
    expect(s.totalCount).toBe(2);
    expect(s.recentErrors).toHaveLength(2);
    expect(s.recentErrors[0].message).toBe('fail A');
    expect(s.recentErrors[1].message).toBe('fail B');
  });

  it('capacity を超えると古いものから捨てる（FIFO ring）', () => {
    const buf = createConsoleErrorBuffer({ capacity: 3 });
    buf.record({ message: 'a', source: 'window.error', timestamp: 1 });
    buf.record({ message: 'b', source: 'window.error', timestamp: 2 });
    buf.record({ message: 'c', source: 'window.error', timestamp: 3 });
    buf.record({ message: 'd', source: 'window.error', timestamp: 4 });
    const s = buf.snapshot();
    expect(s.recentErrors).toHaveLength(3);
    expect(s.recentErrors.map((e) => e.message)).toEqual(['b', 'c', 'd']);
    // totalCount は throw された累計（無視除く）
    expect(s.totalCount).toBe(4);
  });

  it('既知の無視リスト（ERR_BLOCKED_BY_CLIENT 等）は ignoredCount に振り分け', () => {
    const buf = createConsoleErrorBuffer({ capacity: 10 });
    buf.record({ message: 'real error', source: 'window.error', timestamp: 1 });
    buf.record({
      message: 'net::ERR_BLOCKED_BY_CLIENT loading https://x',
      source: 'window.error',
      timestamp: 2
    });
    buf.record({
      message: 'ResizeObserver loop completed with undelivered notifications',
      source: 'window.error',
      timestamp: 3
    });
    const s = buf.snapshot();
    expect(s.totalCount).toBe(1); // real error のみ
    expect(s.ignoredCount).toBe(2);
    expect(s.recentErrors).toHaveLength(1);
    expect(s.recentErrors[0].message).toBe('real error');
  });

  it('reset で buffer をクリアする', () => {
    const buf = createConsoleErrorBuffer({ capacity: 5 });
    buf.record({ message: 'a', source: 'window.error', timestamp: 1 });
    buf.reset();
    const s = buf.snapshot();
    expect(s.recentErrors).toHaveLength(0);
    expect(s.totalCount).toBe(0);
    expect(s.ignoredCount).toBe(0);
  });

  it('壊れた entry（null/undefined/型違反）でも crash しない', () => {
    const buf = createConsoleErrorBuffer({ capacity: 5 });
    buf.record(/** @type {any} */ (null));
    buf.record(/** @type {any} */ (undefined));
    buf.record(/** @type {any} */ ({}));
    const s = buf.snapshot();
    // 完全に空の entry は記録対象として無視（totalCount 0）
    expect(s.recentErrors).toHaveLength(0);
    expect(s.totalCount).toBe(0);
  });
});

describe('isIgnoredErrorMessage', () => {
  it('ERR_BLOCKED_BY_CLIENT を ignored 判定', () => {
    expect(isIgnoredErrorMessage('net::ERR_BLOCKED_BY_CLIENT')).toBe(true);
    expect(isIgnoredErrorMessage('Failed: net::ERR_BLOCKED_BY_CLIENT')).toBe(true);
  });

  it('ResizeObserver loop completed を ignored 判定', () => {
    expect(
      isIgnoredErrorMessage(
        'ResizeObserver loop completed with undelivered notifications.'
      )
    ).toBe(true);
  });

  it('通常の error は ignored=false', () => {
    expect(isIgnoredErrorMessage('TypeError: foo is not a function')).toBe(false);
    expect(isIgnoredErrorMessage('Cannot read properties of undefined')).toBe(false);
  });

  it('null/undefined/空文字は ignored=true として扱う（情報なし）', () => {
    expect(isIgnoredErrorMessage(null)).toBe(true);
    expect(isIgnoredErrorMessage(undefined)).toBe(true);
    expect(isIgnoredErrorMessage('')).toBe(true);
  });

  // v0.1.354: 拡張更新後の古いタブの context invalidated は実害なしなので ignored。
  it('Extension context invalidated を ignored 判定', () => {
    expect(isIgnoredErrorMessage('Extension context invalidated.')).toBe(true);
    expect(
      isIgnoredErrorMessage('Error: Extension context invalidated.')
    ).toBe(true);
  });
});

describe('install: context invalidated の unhandledrejection 抑止', () => {
  /** addEventListener を捕まえる簡易 target */
  function makeTarget() {
    /** @type {Record<string, Function>} */
    const listeners = {};
    return {
      addEventListener: (type, fn) => {
        listeners[type] = fn;
      },
      removeEventListener: () => {},
      fireRejection: (reason) => {
        let prevented = false;
        const e = {
          reason,
          preventDefault: () => {
            prevented = true;
          }
        };
        listeners.unhandledrejection?.(e);
        return prevented;
      }
    };
  }

  it('context invalidated の rejection は preventDefault され、ring buffer に載らない（ignored）', () => {
    const buf = createConsoleErrorBuffer();
    const target = makeTarget();
    buf.install(target);
    const prevented = target.fireRejection(
      new Error('Extension context invalidated.')
    );
    expect(prevented).toBe(true);
    const snap = buf.snapshot();
    expect(snap.totalCount).toBe(0); // 実害エラーとしては記録しない
    expect(snap.ignoredCount).toBe(1);
    expect(snap.recentErrors).toHaveLength(0);
  });

  it('通常の rejection は preventDefault されず、ring buffer に載る', () => {
    const buf = createConsoleErrorBuffer();
    const target = makeTarget();
    buf.install(target);
    const prevented = target.fireRejection(
      new Error('TypeError: foo is not a function')
    );
    expect(prevented).toBe(false);
    const snap = buf.snapshot();
    expect(snap.totalCount).toBe(1);
    expect(snap.recentErrors[0].message).toContain('TypeError');
  });
});
