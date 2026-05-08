import { describe, it, expect } from 'vitest';
import { prioritizeWatchFramesForWatchUrl } from './watchFrameRank.js';

describe('prioritizeWatchFramesForWatchUrl', () => {
  it('解決 watch の lv に一致する href の frame を先にする', () => {
    const out = prioritizeWatchFramesForWatchUrl(
      [
        { frameId: 1, score: 9_000_000, text: 'x', href: 'about:blank' },
        {
          frameId: 2,
          score: 8_000_000,
          text: 'y',
          href: 'https://live.nicovideo.jp/watch/lv777777?foo=1'
        }
      ],
      'https://live.nicovideo.jp/watch/lv777777'
    );
    expect(out[0].frameId).toBe(2);
    expect(out[0].score).toBeGreaterThan(out[1].score);
  });

  it('別 lv の frame はボーナス無しで innerText score の順が効く', () => {
    const out = prioritizeWatchFramesForWatchUrl(
      [
        { frameId: 10, score: 10_000_000, text: 'big', href: 'https://live.nicovideo.jp/watch/lv111' },
        { frameId: 11, score: 5_000_000, text: 'small', href: 'https://live.nicovideo.jp/watch/lv222' }
      ],
      'https://live.nicovideo.jp/watch/lv222'
    );
    expect(out[0].frameId).toBe(11);
  });
});
