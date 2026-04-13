/** @vitest-environment happy-dom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSupportAvatarLoadGuard } from './supportGrowthAvatarLoad.js';
import { NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS } from './supportGrowthTileSrc.js';

const FALLBACK = NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS;
const REMOTE = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/123456789.jpg';

afterEach(() => {
  vi.useRealTimers();
});

describe('createSupportAvatarLoadGuard', () => {
  it('pickDisplaySrc はローカル相対パスをそのまま返す', () => {
    const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK });
    expect(g.pickDisplaySrc(FALLBACK)).toBe(FALLBACK);
  });

  it('pickDisplaySrc は未登録の https をそのまま返す', () => {
    const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK });
    expect(g.pickDisplaySrc(REMOTE)).toBe(REMOTE);
  });

  it('markFailedForTests 後は同一 URL をフォールバックに差し替える', () => {
    const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK });
    g.markFailedForTests(REMOTE);
    expect(g.pickDisplaySrc(REMOTE)).toBe(FALLBACK);
  });

  it('noteRemoteAttempt + error で src がフォールバックになり、以降 pick もフォールバック', () => {
    const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK });
    const img = document.createElement('img');
    img.src = REMOTE;
    g.noteRemoteAttempt(img, REMOTE);
    img.dispatchEvent(new Event('error'));
    expect(img.src).toContain('nicoaccount/usericon/defaults');
    expect(g.pickDisplaySrc(REMOTE)).toBe(FALLBACK);
  });

  it('フォールバック表示後に error を再送してもリスナは再登録されず例外にならない', () => {
    const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK });
    const img = document.createElement('img');
    img.src = REMOTE;
    g.noteRemoteAttempt(img, REMOTE);
    img.dispatchEvent(new Event('error'));
    expect(() => img.dispatchEvent(new Event('error'))).not.toThrow();
  });

  it('pick が既にフォールバックなら noteRemoteAttempt はリスナを付けない', () => {
    const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK });
    g.markFailedForTests(REMOTE);
    const img = document.createElement('img');
    img.src = g.pickDisplaySrc(REMOTE);
    g.noteRemoteAttempt(img, REMOTE);
    img.dispatchEvent(new Event('error'));
    expect(img.src).toContain('nicoaccount/usericon/defaults');
  });

  it('error 時に onFallbackApplied を呼ぶ', () => {
    let called = 0;
    const g = createSupportAvatarLoadGuard({
      fallbackSrc: FALLBACK,
      onFallbackApplied: () => {
        called += 1;
      }
    });
    const img = document.createElement('img');
    img.className = 'nl-story-growth-icon';
    img.src = REMOTE;
    g.noteRemoteAttempt(img, REMOTE);
    img.dispatchEvent(new Event('error'));
    expect(called).toBe(1);
  });

  it('clearFailedUrls で再びリモートを試せる', () => {
    const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK });
    g.markFailedForTests(REMOTE);
    expect(g.pickDisplaySrc(REMOTE)).toBe(FALLBACK);
    g.clearFailedUrls();
    expect(g.pickDisplaySrc(REMOTE)).toBe(REMOTE);
  });

  it('noteRemoteAttempt は timeoutMs 経過で fallback に切り替える', () => {
    vi.useFakeTimers();
    const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK, timeoutMs: 3000 });
    const img = document.createElement('img');
    img.src = REMOTE;
    g.noteRemoteAttempt(img, REMOTE);
    vi.advanceTimersByTime(3001);
    expect(img.src).toContain('nicoaccount/usericon/defaults');
    expect(g.pickDisplaySrc(REMOTE)).toBe(FALLBACK);
  });

  it('load 済みなら timeout 経過しても fallback しない', () => {
    vi.useFakeTimers();
    const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK, timeoutMs: 3000 });
    const img = document.createElement('img');
    img.src = REMOTE;
    g.noteRemoteAttempt(img, REMOTE);
    img.dispatchEvent(new Event('load'));
    vi.advanceTimersByTime(3001);
    expect(g.pickDisplaySrc(REMOTE)).toBe(REMOTE);
  });
});
