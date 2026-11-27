import { describe, it, expect } from 'vitest';
import { needsYtVenue, shouldPollYtVenue } from './ytVenueBoot.js';

describe('ytVenueBoot: 会場は配信の視聴ページだけに載せる', () => {
  it('YouTube は視聴ページだけ', () => {
    expect(needsYtVenue('https://www.youtube.com/watch?v=abc')).toBe(true);
    expect(needsYtVenue('https://www.youtube.com/')).toBe(false);
    expect(needsYtVenue('https://www.youtube.com/results?search_query=x')).toBe(false);
  });
  it('ABEMA は放送・イベント・番組のページだけ(0.1.2082・#608 の取り込み)', () => {
    expect(needsYtVenue('https://abema.tv/now-on-air/shogi')).toBe(true);
    expect(needsYtVenue('https://abema.tv/live-event/abc-123')).toBe(true);
    expect(needsYtVenue('https://abema.tv/video/episode/194-25_s2_p1')).toBe(false);
    expect(needsYtVenue('https://abema.tv/')).toBe(false);
    expect(needsYtVenue('https://abema.tv/timetable')).toBe(false);
    expect(shouldPollYtVenue('https://abema.tv/')).toBe(true);
  });
  it('他のサービスの配信ページ', () => {
    expect(needsYtVenue('https://kick.com/testkick')).toBe(true);
    expect(needsYtVenue('https://kick.com/')).toBe(false);
    // v0.1.2263(りんく 11-28「会場モードは全部のサービスで」): 録画・動画のページにも会場を載せる
    expect(needsYtVenue('https://kick.com/xqc/videos/01a20f53-0dd8-717a-9448-de51354741b0')).toBe(true);
    expect(needsYtVenue('https://www.twitch.tv/videos/2938022552')).toBe(true);
    expect(needsYtVenue('https://www.twitch.tv/directory')).toBe(false);
    expect(needsYtVenue('https://twitcasting.tv/c:someone/movie/843232645')).toBe(true);
    expect(needsYtVenue('https://www.twitch.tv/kimito_link')).toBe(true);
    expect(needsYtVenue('https://www.tiktok.com/@example_user/video/7282612548646554922')).toBe(true);
    expect(needsYtVenue('https://www.tiktok.com/@example_user/live')).toBe(true);
    expect(needsYtVenue('https://whowatch.tv/viewer/24680')).toBe(true);
    expect(needsYtVenue('https://example.com/watch')).toBe(false);
  });
});
