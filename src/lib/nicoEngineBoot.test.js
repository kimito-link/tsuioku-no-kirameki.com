import { describe, expect, it } from 'vitest';
import { needsNicoEngineFrame, shouldPollNicoEngine } from './nicoEngineBoot.js';
import { needsYtVenue, shouldPollYtVenue } from './youtube/ytVenueBoot.js';

describe('needsNicoEngineFrame', () => {
  it('生放送の視聴だけ載せる', () => {
    expect(needsNicoEngineFrame('https://live.nicovideo.jp/watch/lv123')).toBe(true);
    expect(needsNicoEngineFrame('https://www.nicovideo.jp/watch/lv9')).toBe(true);
    expect(needsNicoEngineFrame('http://127.0.0.1:3456/watch/lv1/')).toBe(true);
    expect(needsNicoEngineFrame('https://www.nicovideo.jp/')).toBe(false);
    expect(needsNicoEngineFrame('https://www.nicovideo.jp/watch/sm123')).toBe(false);
  });

  it('ギフトと貢献度の子フレームは載せる', () => {
    expect(needsNicoEngineFrame('https://koken.nicovideo.jp/embed')).toBe(true);
    expect(needsNicoEngineFrame('https://nicoad.nicovideo.jp/live/publish/lv42')).toBe(true);
    expect(needsNicoEngineFrame('https://audition.nicovideo.jp/embedded/richview/live')).toBe(true);
  });

  it('コメント欄が見えていれば about:blank でも載せる', () => {
    expect(needsNicoEngineFrame('about:blank', { hasCommentPanel: true })).toBe(true);
  });

  it('親フレームだけ URL の変化を見る', () => {
    expect(shouldPollNicoEngine('https://www.nicovideo.jp/', true)).toBe(true);
    expect(shouldPollNicoEngine('https://www.nicovideo.jp/', false)).toBe(false);
  });
});

describe('needsYtVenue', () => {
  it('配信の視聴ページだけ会場を載せる', () => {
    expect(needsYtVenue('https://www.youtube.com/watch?v=abcdefghijk')).toBe(true);
    expect(needsYtVenue('https://www.youtube.com/')).toBe(false);
    expect(needsYtVenue('https://www.youtube.com/feed/subscriptions')).toBe(false);
    expect(needsYtVenue('https://www.twitch.tv/somechannel')).toBe(true);
    expect(needsYtVenue('https://www.twitch.tv/directory')).toBe(false);
    expect(needsYtVenue('https://kick.com/somechannel')).toBe(true);
    expect(needsYtVenue('https://kick.com/')).toBe(false);
    expect(needsYtVenue('https://whowatch.tv/viewer/123')).toBe(true);
    expect(needsYtVenue('https://www.showroom-live.com/r/room')).toBe(true);
    expect(needsYtVenue('https://mixch.tv/u/1/live')).toBe(true);
    expect(needsYtVenue('https://www.tiktok.com/@name/live')).toBe(true);
    expect(needsYtVenue('https://www.tiktok.com/@name')).toBe(false);
  });

  it('対応ホストでは視聴へ移るまで URL を見る', () => {
    expect(shouldPollYtVenue('https://www.youtube.com/')).toBe(true);
    expect(shouldPollYtVenue('https://example.com/')).toBe(false);
  });
});
