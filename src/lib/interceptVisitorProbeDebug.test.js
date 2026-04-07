import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatInterceptJsonProbeSnippet,
  INTERCEPT_VISITOR_PROBE_SESSION_KEY,
  isInterceptVisitorProbeDebugEnabled,
  recordUnforwardedInterceptJsonForProbe,
  resetInterceptVisitorProbeRingForTest
} from './interceptVisitorProbeDebug.js';

describe('interceptVisitorProbeDebug', () => {
  afterEach(() => {
    resetInterceptVisitorProbeRingForTest();
    vi.unstubAllGlobals();
  });

  it('formatInterceptJsonProbeSnippet は型とキー名のみ（値は出さない）', () => {
    const s = formatInterceptJsonProbeSnippet({
      type: 'foo',
      data: { userId: 'secret', watchCount: 99 },
      meta: 1
    });
    expect(s).toContain('type=foo');
    expect(s).toContain('dataKeys=');
    expect(s).toContain('userId');
    expect(s).not.toContain('secret');
  });

  it('フラグ OFF のときは記録しない', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => null
    });
    expect(
      recordUnforwardedInterceptJsonForProbe({ type: 'x' })
    ).toBeNull();
  });

  it('フラグ ON のとき statistics 未転送 JSON をリングに溜める', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: (k) => (k === INTERCEPT_VISITOR_PROBE_SESSION_KEY ? '1' : null)
    });
    const a = recordUnforwardedInterceptJsonForProbe({ type: 'room', data: { a: 1 } });
    const b = recordUnforwardedInterceptJsonForProbe({ type: 'ping' });
    expect(a).toBeTruthy();
    expect(b).toContain(' ;; ');
    expect(b).toMatch(/type=ping/);
  });
});

describe('isInterceptVisitorProbeDebugEnabled', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sessionStorage が無い環境では false', () => {
    vi.stubGlobal('sessionStorage', undefined);
    expect(isInterceptVisitorProbeDebugEnabled()).toBe(false);
  });
});
