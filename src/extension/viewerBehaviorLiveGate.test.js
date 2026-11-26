import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { planViewerBehaviorBoardPaint } from './viewerBehaviorBoardPaint.js';
import { buildViewerBehaviorBoard, viewerBehaviorBoardInnerHtml } from '../lib/viewerBehavior.js';
import { buildYtVideoWatchCardModel, ytVideoWatchCardInnerHtml } from '../lib/youtube/ytVideoWatchCard.js';
import { buildVodVideoWatchCardModel, vodVideoWatchCardInnerHtml } from '../lib/videoWatch/videoWatchCard.js';

const LIVE_URL = 'https://live.nicovideo.jp/watch/lv123456789';
const VIDEO_URL = 'https://www.youtube.com/watch?v=mlfY1WYFpEc';

describe('ライブ配信には視聴者の行動ボードを出さない (0.1.2236)', () => {
  it('会場のライブ経路は master と同じで、コメントごとにボードを書かない', () => {
    const venue = readFileSync(new URL('./venueBar.js', import.meta.url), 'utf8');
    expect(venue).not.toContain('KEY_VIEWER_BEHAVIOR_BOARD');
    expect(venue).not.toContain('noteNicoViewerBehavior');
    expect(venue).not.toContain('nlsb-viewer-behavior-slot');
    expect(venue).not.toContain('installViewerBehaviorBoardFromStorage');
  });

  it('ライブ用に残った板があっても、通常動画モードでは塗らない', () => {
    const liveBoard = buildViewerBehaviorBoard({
      nowMs: 1,
      historyReady: true,
      contentKind: 'live',
      visiblePeople: [{ id: '69531734', name: 'もぴー', commentCount: 2 }],
      historyById: { 69531734: { name: 'もぴー', commentCount: 8, liveVisits: 2, seenLive: true, firstAt: 1, lastAt: 2 } },
    });
    const planned = planViewerBehaviorBoardPaint({
      url: LIVE_URL,
      sources: 'video',
      liveWrap: { pageKey: 'lv123456789', kind: 'live', board: liveBoard },
    });
    expect(planned.hide).toBe(true);
    expect(planned.html).toBe('');
    expect(planned.source).toBe('none');
    expect(viewerBehaviorBoardInnerHtml(liveBoard)).toContain('視聴者の行動');
  });

  it('通常動画のカードだけは、その動画の URL のとき塗る', () => {
    const card = buildYtVideoWatchCardModel({
      videoId: 'mlfY1WYFpEc',
      title: '通常動画',
      viewCount: 135321,
      videoAuthors: [{ channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa', name: '花子', postedAtMs: 2 }],
      nowMs: 2,
    });
    const planned = planViewerBehaviorBoardPaint({
      url: VIDEO_URL,
      sources: 'video',
      ytCard: { videoId: 'mlfY1WYFpEc', card },
    });
    expect(planned.hide).toBe(false);
    expect(planned.source).toBe('youtube-video');
    expect(planned.html).toBe(ytVideoWatchCardInnerHtml(card));
    const onLive = planViewerBehaviorBoardPaint({
      url: LIVE_URL,
      sources: 'video',
      ytCard: { videoId: 'mlfY1WYFpEc', card },
    });
    expect(onLive.hide).toBe(true);
    expect(onLive.html).toBe('');
  });

  it('YouTube のライブ取り込みは、視聴者の行動ボードを storage に書かない', () => {
    const bg = readFileSync(new URL('../../extension-youtube/src/background-entry.js', import.meta.url), 'utf8');
    expect(bg).not.toContain('[KEY_VIEWER_BEHAVIOR_BOARD]');
    expect(bg).toContain('ライブ配信では視聴者の行動ボードを storage に書かない');
  });


  it('Twitch など他サービスの通常動画だけ、その URL のときカードを塗る。ライブ配信では隠す', () => {
    const card = buildVodVideoWatchCardModel({
      platform: 'twitch',
      pageKey: 'twvod:2938022552',
      videoId: '2938022552',
      title: 'VOD',
    });
    const planned = planViewerBehaviorBoardPaint({
      url: 'https://www.twitch.tv/videos/2938022552',
      sources: 'video',
      vodCard: { videoId: 'twvod:2938022552', card },
    });
    expect(planned.hide).toBe(false);
    expect(planned.source).toBe('vod-video');
    expect(planned.html).toBe(vodVideoWatchCardInnerHtml(card));
    expect(planned.html).not.toContain('視聴者の行動');
    const onLive = planViewerBehaviorBoardPaint({
      url: 'https://www.twitch.tv/example_channel',
      sources: 'video',
      vodCard: { videoId: 'twvod:2938022552', card },
    });
    expect(onLive.hide).toBe(true);
    expect(onLive.html).toBe('');
  });


});
