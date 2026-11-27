/**
 * v0.1.2263(りんく 11-28「会場モードは全部のサービスで」): Twitch・Kick・ツイキャスの録画、TikTok の動画のページにも
 *   YouTube の動画と同じ会場を出す。鍵は録画・動画の鍵(pageKey)。帯は再生・コメントだけ(動画のカードの数)。ライブは変えない。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { venueVideoPageFromUrl, VENUE_VIDEO_PLATFORMS } from './vodWatchUrl.js';
import { needsYtVenue } from '../youtube/ytVenueBoot.js';
import { buildVodVideoWatchCardModel, vodCommentsInPageOrder } from './videoWatchCard.js';
import { recordedRowsOrAnyVideoCardRows } from './videoCommentRows.js';
import { venueItemsForPlatform } from '../platform/platformMetrics.js';
import { ytSummaryToNicoSnapshot } from '../../../extension-youtube/src/ytNicoShim.js';

const PAGES = /** @type {const} */ ([
  ['twitch', 'https://www.twitch.tv/videos/2940553066', 'twvod:2940553066'],
  ['kick', 'https://kick.com/xqc/videos/01a214cb-42f8-75cd-b00f-f083ea893dfd', 'kkvod:xqc/01a214cb-42f8-75cd-b00f-f083ea893dfd'],
  ['twitcasting', 'https://twitcasting.tv/c:asumi_mio/movie/822000000', 'tcmov:c:asumi_mio/822000000'],
  ['tiktok', 'https://www.tiktok.com/@tiktok/video/7106594312292453675', 'ttvid:tiktok/7106594312292453675'],
]);
const bag = (/** @type {any} */ facts) => ({
  records: { text: '12', isPlaceholder: false },
  concurrent: { text: '—', isPlaceholder: true },
  streamAge: { text: '3分', isPlaceholder: false },
  facts,
});
const authors = [
  { id: 'old', name: '古い人', avatarUrl: '', postedAtMs: 1000, seq: 1, commentCount: 1, comments: [{ id: 'old#1', text: 'はじめまして' }] },
  { id: 'new', name: '新しい人', avatarUrl: '', postedAtMs: 5000, seq: 9, commentCount: 2, comments: [{ id: 'new#9', text: '草' }, { id: 'new#8', text: 'すごい' }] },
  { id: 'quiet', name: '本文なし', avatarUrl: '', postedAtMs: 3000, seq: 5, commentCount: 1 },
];

describe.each(PAGES)('%s の録画・動画のページ', (platform, url, wantKey) => {
  const page = venueVideoPageFromUrl(url);
  it('会場を載せる・鍵は録画・動画の鍵(チャンネルの配信の鍵ではない)', () => {
    expect(page?.platform).toBe(platform);
    expect(page?.pageKey.toLowerCase()).toBe(wantKey.toLowerCase());
    expect(needsYtVenue(url)).toBe(true);
  });

  const key = page ? page.pageKey : wantKey;
  const card = buildVodVideoWatchCardModel({ platform, videoId: page?.videoId, pageKey: key, title: 't', viewCount: 4321, videoAuthors: authors, facts: { commentTotal: 77 }, nowMs: 10_000 });
  const wrap = { videoId: key, at: 1, card };

  it('会場のコメントは、このカードの行(本文のある人だけ・本文を作らない)', () => {
    const rows = recordedRowsOrAnyVideoCardRows([], [null, wrap], key);
    expect(rows.map((r) => r.text).sort()).toEqual(['すごい', 'はじめまして', '草']);
    expect(rows.every((r) => r.videoComment === true && r.skipVoice === true && r.videoId === key)).toBe(true);
    // 記録があれば記録のまま(ライブの会場は変わらない)
    expect(recordedRowsOrAnyVideoCardRows([{ text: 'live' }], [wrap], key)).toEqual([{ text: 'live' }]);
    // 別の録画のカードは使わない
    expect(recordedRowsOrAnyVideoCardRows([], [wrap], `${key}x`)).toEqual([]);
  });

  it('帯は 再生・コメント だけ(動画のカードの数・記録や経過は出さない)', () => {
    const snap = ytSummaryToNicoSnapshot({ contentKind: 'video', isLive: false }, key, '', {}, wrap);
    expect(snap.platformFacts.contentKind).toBe('video');
    const items = venueItemsForPlatform(platform, bag(snap.platformFacts));
    expect(items?.map((it) => `${it.label} ${it.text}${it.unit}`)).toEqual(['再生 4,321回', 'コメント 77件']);
    // 読めない数は出さない(「読み込み中」で止めない)
    const blank = buildVodVideoWatchCardModel({ platform, pageKey: key, title: 't', viewCount: null, videoAuthors: [], nowMs: 1 });
    const s2 = ytSummaryToNicoSnapshot({ contentKind: 'video', isLive: false }, key, '', {}, { videoId: key, card: blank });
    expect(venueItemsForPlatform(platform, bag(s2.platformFacts))).toEqual([]);
  });

  it('ページに総数が出ないサービスでも、帯のコメントは横の欄と同じ「いまページに出ているコメント」の数', () => {
    // 実ページ(Twitch・Kick の録画)では再生数も総数も読めず、帯が空だった
    const noTotal = buildVodVideoWatchCardModel({ platform, pageKey: key, title: 't', viewCount: null, videoAuthors: authors, nowMs: 1 });
    const s3 = ytSummaryToNicoSnapshot({ contentKind: 'video', isLive: false }, key, '', {}, { videoId: key, card: noTotal });
    expect(venueItemsForPlatform(platform, bag(s3.platformFacts))?.map((it) => `${it.label} ${it.text}${it.unit}`)).toEqual([`コメント ${noTotal?.behavior?.commentsTotal}件`]);
    expect(Number(noTotal?.behavior?.commentsTotal)).toBeGreaterThan(0);
  });

  it('ライブの帯は今まで通り(記録・同時接続・経過)', () => {
    const items = venueItemsForPlatform(platform, bag({ viewers: 120 })) || [];
    expect(items.some((it) => it.key === 'records')).toBe(true);
    expect(items.some((it) => it.key === 'streamAge')).toBe(true);
  });
});

describe('ほかのページ', () => {
  it('ABEMA の見逃し・ライブのチャンネルは、録画の鍵を使わない', () => {
    expect(venueVideoPageFromUrl('https://abema.tv/video/episode/90-1888_s1_p1')).toBe(null);
    expect(needsYtVenue('https://abema.tv/video/episode/90-1888_s1_p1')).toBe(false);
    expect(venueVideoPageFromUrl('https://www.twitch.tv/kimito_link')).toBe(null);
    expect(venueVideoPageFromUrl('https://kick.com/xqc')).toBe(null);
    expect([...VENUE_VIDEO_PLATFORMS]).toEqual(['twitch', 'kick', 'twitcasting', 'tiktok']);
  });
  it('本文の並びは新しい人から・同じ人は新しい本文から', () => {
    expect(vodCommentsInPageOrder(authors).map((c) => c.text)).toEqual(['草', 'すごい', 'はじめまして']);
  });
  it('YouTube の通常動画の帯も同じ形(今までと同じ)', () => {
    const items = venueItemsForPlatform('youtube', bag({ contentKind: 'video', viewCount: 18_808_370, commentCount: 5_467_509 }));
    expect(items).toEqual([
      { key: 'concurrent', label: '再生', text: '18,808,370', unit: '回', isPlaceholder: false, face: 'konta', title: expect.any(String) },
      { key: 'comments', label: 'コメント', text: '5,467,509', unit: '件', isPlaceholder: false, face: '', title: 'いまページに出ているコメントの件数です（このPCの記録ではありません）。' },
    ]);
    expect(venueItemsForPlatform('niconico', bag({ contentKind: 'video' }))).toBe(null);
  });
  it('会場の鍵は録画・動画の鍵を先に見る / 録画の入口は会場を出すサービスでは隠さない', () => {
    const venue = readFileSync(new URL('../../../extension-youtube/src/venue-inline-entry.js', import.meta.url), 'utf8');
    const fn = venue.slice(venue.indexOf('function currentVideoId'), venue.indexOf('function ensureBaseFontSize'));
    expect(fn.indexOf('venueVideoPageFromUrl(href)')).toBeGreaterThan(-1);
    expect(fn.indexOf('venueVideoPageFromUrl(href)')).toBeLessThan(fn.indexOf('streamKeyForWatchUrl(href)'));
    const vod = readFileSync(new URL('../../extension/vod-video-watch-entry.js', import.meta.url), 'utf8');
    expect(vod).toContain('hideVenueModeForVideoPage(!venueVideoPageFromUrl(href))');
  });
});
