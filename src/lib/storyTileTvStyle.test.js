import { describe, it, expect } from 'vitest';
import { storyTileUsesYukkuriTvStyle } from './storyTileTvStyle.js';

describe('storyTileUsesYukkuriTvStyle', () => {
  it('requestedSrc に yukkuri-charactore-english 含む → true', () => {
    expect(
      storyTileUsesYukkuriTvStyle(
        'chrome-extension://abc/images/yukkuri-charactore-english/link/x.png',
        ''
      )
    ).toBe(true);
  });

  it('displaySrc に yukkuri-charactore-english 含む → true', () => {
    expect(
      storyTileUsesYukkuriTvStyle(
        '',
        'chrome-extension://abc/images/yukkuri-charactore-english/konta/y.png'
      )
    ).toBe(true);
  });

  it('両方含まない → false', () => {
    expect(
      storyTileUsesYukkuriTvStyle(
        'https://example.com/img.png',
        'https://example.com/img.png'
      )
    ).toBe(false);
  });

  it('null/undefined → false', () => {
    expect(storyTileUsesYukkuriTvStyle(null, null)).toBe(false);
    expect(storyTileUsesYukkuriTvStyle(undefined, undefined)).toBe(false);
  });

  it('空文字 → false', () => {
    expect(storyTileUsesYukkuriTvStyle('', '')).toBe(false);
  });

  it('niconico の defaults usericon → false（枠付けない）', () => {
    expect(
      storyTileUsesYukkuriTvStyle(
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg',
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg'
      )
    ).toBe(false);
  });
});
