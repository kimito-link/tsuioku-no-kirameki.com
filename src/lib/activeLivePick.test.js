import { describe, expect, it } from 'vitest';
import { liveIdFromStreamKey, pickActiveLiveId } from './activeLivePick.js';
import { computePseudoLvForVideoId } from './youtube/ytPseudoLv.js';

describe('いまの配信', () => {
  it('ニコ生の URL から lv を取る', () => {
    expect(pickActiveLiveId({
      nicoUrl: 'https://live.nicovideo.jp/watch/lv350229229'
    })).toBe('lv350229229');
  });

  it('YouTube や Twitch の配信キーを疑似 lv にする', () => {
    const yt = liveIdFromStreamKey('abcdefghijk');
    expect(yt).toBe(computePseudoLvForVideoId('abcdefghijk'));
    expect(yt).toMatch(/^lv9\d{11}$/);
    const tw = liveIdFromStreamKey('tw.example.9');
    expect(pickActiveLiveId({ streamKey: 'tw.example.9', streamAt: 10 })).toBe(tw);
  });

  it('新しい方の配信を選ぶ', () => {
    const streamLv = liveIdFromStreamKey('abcdefghijk');
    expect(pickActiveLiveId({
      nicoUrl: 'https://live.nicovideo.jp/watch/lv100',
      nicoAt: 100,
      streamKey: 'abcdefghijk',
      streamAt: 200
    })).toBe(streamLv);
    expect(pickActiveLiveId({
      nicoUrl: 'https://live.nicovideo.jp/watch/lv100',
      nicoAt: 300,
      streamKey: 'abcdefghijk',
      streamAt: 200
    })).toBe('lv100');
  });
});
