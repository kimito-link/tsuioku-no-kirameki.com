import { describe, expect, it } from 'vitest';
import {
  placeholderStreamKeyForChannel,
  STREAM_PLATFORMS,
  streamKeysShareChannel,
  watchUrlMatchesStreamKey,
  preferLiveStreamKey,
} from './streamPlatform.js';

describe('同じチャンネルの配信キー', () => {
  it('ミクチャと SHOWROOM の仮キーと本物のキーを同じ部屋とみなす。別の人は混ぜない', () => {
    const mxPh = placeholderStreamKeyForChannel(STREAM_PLATFORMS.mixch, '19026325');
    expect(mxPh).toBe('mx.19026325.00000');
    expect(streamKeysShareChannel(mxPh, 'mx.19026325.7788')).toBe(true);
    expect(streamKeysShareChannel(mxPh, 'mx.1.7788')).toBe(false);
    expect(watchUrlMatchesStreamKey('https://mixch.tv/u/19026325/live', 'mx.19026325.7788')).toBe(true);
    expect(watchUrlMatchesStreamKey('https://mixch.tv/u/19026325/live', 'mx.9.7788')).toBe(false);
    expect(preferLiveStreamKey(mxPh, 'mx.19026325.7788')).toBe('mx.19026325.7788');
    expect(preferLiveStreamKey('mx.19026325.7788', mxPh)).toBe('mx.19026325.7788');

    const srPh = placeholderStreamKeyForChannel(STREAM_PLATFORMS.showroom, 'room_a');
    expect(streamKeysShareChannel(srPh, 'sr.room_a.123456')).toBe(true);
    expect(watchUrlMatchesStreamKey('https://www.showroom-live.com/r/room_a', 'sr.room_a.123456')).toBe(true);
  });
});
