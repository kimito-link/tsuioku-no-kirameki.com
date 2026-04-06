/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { createSupportAvatarLoadGuard } from './supportGrowthAvatarLoad.js';

const FALLBACK =
  'images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png';
const REMOTE = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/123456789.jpg';

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
    expect(img.src).toContain('link-yukkuri-half-eyes-mouth-closed');
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
    expect(img.src).toContain('link-yukkuri-half-eyes-mouth-closed');
  });

  it('clearFailedUrls で再びリモートを試せる', () => {
    const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK });
    g.markFailedForTests(REMOTE);
    expect(g.pickDisplaySrc(REMOTE)).toBe(FALLBACK);
    g.clearFailedUrls();
    expect(g.pickDisplaySrc(REMOTE)).toBe(REMOTE);
  });
});
