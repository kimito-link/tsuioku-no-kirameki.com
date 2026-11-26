import { describe, expect, it } from 'vitest';
import {
  parseTwitchVodFromUrl,
  parseKickVodFromUrl,
  parseTwitcastingMovieFromUrl,
  parseAbemaEpisodeFromUrl,
  parseTiktokVideoFromUrl,
  vodWatchPageFromUrl,
  isVodVideoWatchUrl,
} from './vodWatchUrl.js';
import { parseTwChannelFromUrl } from '../twitch/twIrcParse.js';
import { parseKickChannelFromUrl } from '../kick/kickChatParse.js';
import { parseTcUserFromUrl } from '../twitcasting/tcParse.js';
import { parseTtUniqueIdFromUrl } from '../tiktok/ttParse.js';
import { parseAbLoginFromUrl } from '../abema/abParse.js';

describe('通常動画（VOD）の URL 判定', () => {
  it('Twitch は /videos/<id> だけを通常動画とし、チャンネル配信はこれまでどおり', () => {
    const vod = parseTwitchVodFromUrl('https://www.twitch.tv/videos/2938022552');
    expect(vod).toMatchObject({ platform: 'twitch', videoId: '2938022552', pageKey: 'twvod:2938022552' });
    expect(parseTwitchVodFromUrl('https://www.twitch.tv/kimito_link')).toBeNull();
    expect(parseTwitchVodFromUrl('https://www.twitch.tv/videos')).toBeNull();
    expect(parseTwChannelFromUrl('https://www.twitch.tv/videos/2938022552')).toBe('');
    expect(parseTwChannelFromUrl('https://www.twitch.tv/kimito_link')).toBe('kimito_link');
  });

  it('Kick は /<ch>/videos/<id> だけ（一覧 /videos は対象外）。実測の ULID も受ける', () => {
    const vod = parseKickVodFromUrl('https://kick.com/xqc/videos/01a20f53-0dd8-717a-9448-de51354741b0');
    expect(vod).toMatchObject({
      platform: 'kick',
      videoId: '01a20f53-0dd8-717a-9448-de51354741b0',
      ownerId: 'xqc',
      pageKey: 'kkvod:xqc/01a20f53-0dd8-717a-9448-de51354741b0',
    });
    expect(parseKickVodFromUrl('https://kick.com/xqc/videos/140060512')).toMatchObject({ videoId: '140060512' });
    expect(parseKickVodFromUrl('https://kick.com/xqc/videos')).toBeNull();
    expect(parseKickVodFromUrl('https://kick.com/xqc')).toBeNull();
    expect(parseKickChannelFromUrl('https://kick.com/xqc/videos/01a20f53-0dd8-717a-9448-de51354741b0')).toBe('');
    expect(parseKickChannelFromUrl('https://kick.com/xqc')).toBe('xqc');
  });

  it('ツイキャスは /<user>/movie/<id> だけ。配信者ページはこれまでどおり空', () => {
    const vod = parseTwitcastingMovieFromUrl('https://twitcasting.tv/romi_lele/movie/843382496');
    expect(vod).toMatchObject({ platform: 'twitcasting', videoId: '843382496', ownerId: 'romi_lele', pageKey: 'tcmov:romi_lele/843382496' });
    expect(parseTcUserFromUrl('https://twitcasting.tv/romi_lele/movie/843382496')).toBe('');
    expect(parseTcUserFromUrl('https://twitcasting.tv/romi_lele')).toBe('romi_lele');
  });

  it('ABEMA は /video/episode/<id> を通常動画にする。放送中・イベントは対象外', () => {
    const vod = parseAbemaEpisodeFromUrl('https://abema.tv/video/episode/194-25_s2_p1?t=1');
    expect(vod).toMatchObject({ platform: 'abema', videoId: '194-25_s2_p1', pageKey: 'abep:194-25_s2_p1' });
    expect(parseAbemaEpisodeFromUrl('https://abema.tv/now-on-air/abema-news')).toBeNull();
    expect(parseAbemaEpisodeFromUrl('https://abema.tv/live-event/abc-123')).toBeNull();
    // 既存の login 変換は変えない（content 側でエピソードだけライブ開始しない）
    expect(parseAbLoginFromUrl('https://abema.tv/video/episode/194-25_s2_p1?t=1')).toBe('p-194-25_s2_p1');
    expect(parseAbLoginFromUrl('https://abema.tv/now-on-air/abema-news')).toBe('n-abema-news');
  });

  it('TikTok は /@user/video/<id> だけ。ライブ配信 /live は対象外', () => {
    const vod = parseTiktokVideoFromUrl('https://www.tiktok.com/@example_user/video/7282612548646554922');
    expect(vod).toMatchObject({ platform: 'tiktok', videoId: '7282612548646554922', ownerId: 'example_user' });
    expect(parseTiktokVideoFromUrl('https://www.tiktok.com/@example_user/live')).toBeNull();
    expect(parseTtUniqueIdFromUrl('https://www.tiktok.com/@example_user/video/7282612548646554922')).toBe('');
    expect(parseTtUniqueIdFromUrl('https://www.tiktok.com/@example_user/live')).toBe('example_user');
  });

  it('vodWatchPageFromUrl は5サービスだけをまとめ、関係ない URL は null', () => {
    expect(isVodVideoWatchUrl('https://www.youtube.com/watch?v=mlfY1WYFpEc')).toBe(false);
    expect(isVodVideoWatchUrl('https://www.nicovideo.jp/watch/sm9')).toBe(false);
    expect(isVodVideoWatchUrl('https://live.nicovideo.jp/watch/lv351841372')).toBe(false);
    expect(vodWatchPageFromUrl('https://www.twitch.tv/videos/2938022552')?.platform).toBe('twitch');
  });
});
