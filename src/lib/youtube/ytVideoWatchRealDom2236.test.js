import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { concurrentFromVideoViewCountRenderer, concurrentViewersInInnertube, videoIdFromYtInitialData } from './ytConcurrentViewers.js';
import {
  classifyYtWatchContentKind,
  concurrentViewersIsViewCountLeak,
  viewCountFromVideoViewCountRenderer,
  viewCountInInnertube,
  ytLiveFlagsFromPlayerOrInitial,
  ytPageShouldHideVenueMode,
  ytVideoCommentAuthorsFromInnertube,
  ytWatchMayShowConcurrentViewers,
} from './ytVideoWatchMeta.js';
import { parseYtVideoIdFromUrl } from './ytPageMeta.js';
import { venueItemsForPlatform } from '../platform/platformMetrics.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/real-dom');
const readJson = (name) => JSON.parse(readFileSync(join(FIX, name), 'utf8'));

const MIX_VOD = 'SIk45QZsnDM';
const VIEWS_VOD = 'mlfY1WYFpEc';
const NOW = Date.parse('2026-11-26T10:37:00+09:00');

const player = readJson('mlfY1WYFpEc.player.json');
const initial = readJson('mlfY1WYFpEc.initial-viewcount.json');
const comments = readJson('mlfY1WYFpEc.comments-page1.json');
const reply = readJson('mlfY1WYFpEc.reply-viewer.json');
const unplayable = readJson('SIk45QZsnDM.playability.json');

describe('公開ページから取った YouTube 通常動画の実データ (0.1.2236)', () => {
  it('list= と start_radio がついていても v= の動画IDだけを取る', () => {
    expect(parseYtVideoIdFromUrl(`https://www.youtube.com/watch?v=${MIX_VOD}&list=RD${MIX_VOD}&start_radio=1`)).toBe(MIX_VOD);
    expect(parseYtVideoIdFromUrl(`https://www.youtube.com/watch?v=${VIEWS_VOD}&list=RD${VIEWS_VOD}&start_radio=1`)).toBe(VIEWS_VOD);
  });

  it('SIk45QZsnDM は再生できない。同時視聴にも通常動画のコメント欄にもしない', () => {
    expect(unplayable.playabilityStatus.status).toBe('ERROR');
    expect(unplayable.playabilityStatus.reason).toBe('この動画は再生できません');
    expect(concurrentViewersInInnertube(unplayable, MIX_VOD)).toBeNull();
    expect(ytLiveFlagsFromPlayerOrInitial(unplayable)).toEqual({
      isLive: null,
      isLiveContent: null,
      isOwnerViewing: null,
    });
    expect(ytVideoCommentAuthorsFromInnertube(unplayable)).toEqual([]);
  });

  it('mlfY1WYFpEc の originalViewCount 135321 は再生回数であり、同時視聴者数にしない', () => {
    const renderer = initial.contents.twoColumnWatchNextResults.results.results.contents[0]
      .videoPrimaryInfoRenderer.viewCount.videoViewCountRenderer;
    expect(renderer.originalViewCount).toBe('135321');
    expect(renderer.viewCount.simpleText).toBe('135,321回視聴');
    expect(videoIdFromYtInitialData(initial)).toBe(VIEWS_VOD);
    expect(viewCountFromVideoViewCountRenderer(renderer)).toBe(135321);
    expect(viewCountInInnertube(initial, VIEWS_VOD)).toBe(135321);
    expect(concurrentFromVideoViewCountRenderer(renderer)).toBeNull();
    expect(concurrentViewersInInnertube(initial, VIEWS_VOD)).toBeNull();
    expect(concurrentViewersIsViewCountLeak(135321, 135321)).toBe(true);

    const flags = ytLiveFlagsFromPlayerOrInitial(player);
    expect(flags.isLiveContent).toBe(false);
    expect(player.videoDetails.viewCount).toBe('135321');
    const kind = classifyYtWatchContentKind({
      url: `https://www.youtube.com/watch?v=${VIEWS_VOD}&list=RD${VIEWS_VOD}&start_radio=1`,
      isLive: flags.isLive,
      isLiveContent: flags.isLiveContent,
      viewCount: 135321,
      concurrentViewers: 135321,
    });
    expect(kind).toBe('video');
    expect(ytWatchMayShowConcurrentViewers({ contentKind: kind, isLive: false, isLiveContent: false })).toBe(false);
    expect(ytPageShouldHideVenueMode({ contentKind: kind, isLive: false, isLiveContent: false })).toBe(true);

    const items = venueItemsForPlatform('youtube', {
      records: { text: '0', isPlaceholder: false },
      concurrent: { text: '135,321', isPlaceholder: false },
      streamAge: { text: '—', isPlaceholder: true },
      facts: { contentKind: 'video', isLive: false, isLiveContent: false, viewCount: 135321, viewers: 135321 },
    });
    const concurrent = items.find((row) => row.key === 'concurrent');
    expect(concurrent.label).toBe('再生');
    expect(concurrent.unit).toBe('回');
    expect(concurrent.text).toBe('135,321');
  });

  it('公開の next 継続に入っている commentEntityPayload から、顔と新しいコメント順の投稿者を取る', () => {
    const authors = ytVideoCommentAuthorsFromInnertube(comments, { nowMs: NOW });
    expect(authors.length).toBe(15);
    expect(authors.every((row) => row.channelId && /^UC/.test(row.channelId))).toBe(true);
    expect(authors.every((row) => /^https:\/\//.test(String(row.avatarUrl || '')))).toBe(true);
    expect(authors.every((row) => row.name)).toBe(true);
    expect(authors[0].name).toBe('@haniwa-w5p');
    expect(authors[0].handle).toBe('@haniwa-w5p');
    expect(authors.at(-1).name).toBe('@Taisayuh');
    const times = authors.map((row) => Number(row.postedAtMs) || 0);
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(times[0]).toBeGreaterThan(times.at(-1));
  });

  it('返信の継続も同じ形で読め、このキャプチャでは視聴者の返信である', () => {
    const authors = ytVideoCommentAuthorsFromInnertube(reply, { nowMs: NOW });
    expect(authors).toHaveLength(1);
    expect(authors[0]).toMatchObject({
      handle: '@mickx_dreamer_YT',
      name: '@mickx_dreamer_YT',
      channelId: 'UCP4pElPBo_l1nvap2vw93Ng',
    });
    expect(authors[0].avatarUrl).toMatch(/^https:\/\//);
  });
});
