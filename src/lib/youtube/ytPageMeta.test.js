import { describe, it, expect } from 'vitest';
import { parseYtVideoIdFromUrl, isYtWatchLikeUrl, ytHandleLivePendingKey, ytHandleOfPendingKey, pickYtBroadcasterIconUrl } from './ytPageMeta.js';

describe('parseYtVideoIdFromUrl', () => {
  it('watch / live / live_chat / youtu.be を読める', () => {
    expect(parseYtVideoIdFromUrl('https://www.youtube.com/watch?v=abcdefghijk&t=1')).toBe('abcdefghijk');
    expect(parseYtVideoIdFromUrl('https://www.youtube.com/live/abcdefghijk?si=x')).toBe('abcdefghijk');
    expect(parseYtVideoIdFromUrl('https://www.youtube.com/live_chat?is_popout=1&v=abcdefghijk')).toBe('abcdefghijk');
    expect(parseYtVideoIdFromUrl('https://youtu.be/abcdefghijk')).toBe('abcdefghijk');
  });
  it('取れないものは空', () => {
    expect(parseYtVideoIdFromUrl('https://www.youtube.com/')).toBe('');
    expect(parseYtVideoIdFromUrl('https://www.youtube.com/live/short')).toBe('');
    expect(parseYtVideoIdFromUrl('')).toBe('');
    expect(parseYtVideoIdFromUrl(/** @type {any} */ (null))).toBe('');
  });
});

describe('isYtWatchLikeUrl', () => {
  it('watch と live は真・live_chat とトップは偽', () => {
    expect(isYtWatchLikeUrl('https://www.youtube.com/watch?v=abcdefghijk')).toBe(true);
    expect(isYtWatchLikeUrl('https://www.youtube.com/live/abcdefghijk')).toBe(true);
    expect(isYtWatchLikeUrl('https://www.youtube.com/live_chat?v=abcdefghijk')).toBe(false);
    expect(isYtWatchLikeUrl('https://www.youtube.com/')).toBe(false);
    expect(isYtWatchLikeUrl('https://www.youtube.com/@testchan/live')).toBe(true);
    expect(isYtWatchLikeUrl('https://www.youtube.com/@testchan/live/')).toBe(true);
    expect(isYtWatchLikeUrl('https://www.youtube.com/@testchan')).toBe(false);
    expect(isYtWatchLikeUrl('https://www.tiktok.com/@some.one/live')).toBe(false);
    expect(ytHandleLivePendingKey('https://www.youtube.com/@hotspanishvlogs/live')).toBe('ytlive:@hotspanishvlogs');
    expect(ytHandleLivePendingKey('https://www.youtube.com/@%E3%81%82%E3%81%AE%E3%81%A1%E3%82%83%E3%82%93%E3%81%93/live')).toBe('ytlive:@あのちゃんこ');
    expect(ytHandleLivePendingKey('https://www.tiktok.com/@some.one/live')).toBe('');
    expect(ytHandleOfPendingKey('ytlive:@hotspanishvlogs')).toBe('@hotspanishvlogs');
    // YouTube が /@名前/live を古い形へ送り直す(2026-11-11 実機: /@weathernews/live → /weathernews/live)
    expect(isYtWatchLikeUrl('https://www.youtube.com/weathernews/live')).toBe(true);
    expect(ytHandleLivePendingKey('https://www.youtube.com/weathernews/live')).toBe('ytlive:weathernews');
    expect(ytHandleOfPendingKey('ytlive:weathernews')).toBe('weathernews');
    expect(isYtWatchLikeUrl('https://www.youtube.com/c/someone/live')).toBe(true);
    expect(ytHandleOfPendingKey(ytHandleLivePendingKey('https://www.youtube.com/user/someone/live/'))).toBe('someone');
    expect(ytHandleLivePendingKey('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv/live')).toBe('ytlive:channel/UCabcdefghijklmnopqrstuv');
    expect(ytHandleOfPendingKey('ytlive:channel/UCabcdefghijklmnopqrstuv')).toBe('');
    expect(isYtWatchLikeUrl('https://www.youtube.com/feed/live')).toBe(false);
    expect(isYtWatchLikeUrl('https://www.youtube.com/gaming/live')).toBe(false);
    expect(isYtWatchLikeUrl('https://www.youtube.com/@testchan/videos')).toBe(false);
  });
});

describe('pickYtBroadcasterIconUrl', () => {
  it('空・data: を飛ばして大きいサイズに上げる', () => {
    expect(
      pickYtBroadcasterIconUrl(['', 'data:image/gif;base64,xx', 'https://yt3.ggpht.com/abc=s48-c-k-c0x00ffffff-no-rj']),
    ).toBe('https://yt3.ggpht.com/abc=s176-c-k-c0x00ffffff-no-rj');
  });
  it('// 始まりを https にする・知らないホストは捨てる', () => {
    expect(pickYtBroadcasterIconUrl(['https://evil.example/a.png', '//yt3.googleusercontent.com/x=s240-c'])).toBe(
      'https://yt3.googleusercontent.com/x=s240-c',
    );
  });
  it('候補なしは空', () => {
    expect(pickYtBroadcasterIconUrl([])).toBe('');
    expect(pickYtBroadcasterIconUrl(/** @type {any} */ (null))).toBe('');
  });
});
