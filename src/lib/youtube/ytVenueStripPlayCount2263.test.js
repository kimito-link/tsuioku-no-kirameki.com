/**
 * v0.1.2263 (Antigravity 実ページ 9bZkp7q19f0): 通常動画で会場の帯に「再生」が出ず「コメント」だけ。横の欄は再生数を出していた。
 * 再生数は動画のカード(yt_video_watch_card_v1・横の欄と同じ正本)から読む。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { venueItemsForPlatform } from '../platform/platformMetrics.js';
import { ytSummaryToNicoSnapshot } from '../../../extension-youtube/src/ytNicoShim.js';
import { buildYtVideoWatchCardModel, videoCardViewCount } from './ytVideoWatchCard.js';

const VID = '9bZkp7q19f0';
const bag = (facts) => ({
  records: { text: '—', isPlaceholder: true },
  concurrent: { text: '—', isPlaceholder: true },
  streamAge: { text: '—', isPlaceholder: true },
  facts,
});

describe('会場の帯の「再生」は動画のカードから (単一の正本)', () => {
  const card = buildYtVideoWatchCardModel({ videoId: VID, title: 'PSY', viewCount: 5_700_000_000, recorded: {} });
  const wrap = { videoId: VID, at: 1, card };

  it('まとめに再生数が無い通常動画でも、カードの再生数で帯に「再生」が出る', () => {
    const sum = { contentKind: 'video', isLive: false, slotCommentCount: 5_467_509 };
    const snap = ytSummaryToNicoSnapshot(sum, VID, '', { [VID]: sum }, wrap);
    expect(snap.platformFacts.viewCount).toBe(5_700_000_000);
    const items = venueItemsForPlatform('youtube', bag(snap.platformFacts));
    const play = items.find((it) => it.key === 'concurrent');
    expect(play?.label).toBe('再生');
    expect(play?.text).toBe('5,700,000,000');
    expect(play?.unit).toBe('回');
  });

  it('カードが無い・別の動画のカードなら、今まで通り(まとめの数か、出さない)', () => {
    const sum = { contentKind: 'video', isLive: false };
    expect(ytSummaryToNicoSnapshot(sum, VID, '', {}, null).platformFacts.viewCount).toBe(null);
    expect(ytSummaryToNicoSnapshot(sum, VID, '', {}, { videoId: 'other', card }).platformFacts.viewCount).toBe(null);
    const items = venueItemsForPlatform('youtube', bag({ contentKind: 'video', viewCount: null }));
    expect(items.some((it) => it.key === 'concurrent')).toBe(false);
    expect(ytSummaryToNicoSnapshot({ ...sum, slotViewCount: 18_808_370 }, VID, '', {}, null).platformFacts.viewCount).toBe(18_808_370);
  });

  it('videoCardViewCount は読めていない(null)を 0 回にしない', () => {
    expect(videoCardViewCount({ videoId: VID, card: { viewCount: null } }, VID)).toBe(null);
    expect(videoCardViewCount({ videoId: VID, card: { viewCount: 0 } }, VID)).toBe(0);
    expect(videoCardViewCount(undefined, VID)).toBe(null);
  });

  it('会場(視聴ページ内)と横の欄の数字カードの写しは、どちらも同じカードを渡す', () => {
    const venue = readFileSync(new URL('../../../extension-youtube/src/venue-inline-entry.js', import.meta.url), 'utf8');
    const fn = venue.slice(venue.indexOf('async function statCardsSource'), venue.indexOf('let watchKeyMissingSince'));
    expect(fn).toContain("chrome.storage.local.get(['yt_stream_summaries', KEY_YT_VIDEO_WATCH_CARD])");
    expect(fn).toContain('bag?.[KEY_YT_VIDEO_WATCH_CARD]');
    const shim = readFileSync(new URL('../../../extension-youtube/src/ytNicoShim.js', import.meta.url), 'utf8');
    const ex = shim.slice(shim.indexOf("if (type === 'NLS_EXPORT_WATCH_SNAPSHOT')"), shim.indexOf("if (type === 'NLS_CAPTURE_SCREENSHOT')"));
    expect(ex).toContain('KEY_YT_VIDEO_WATCH_CARD');
    expect(ex).toContain(', cardWrap)');
    // ライブは読まない(今までと同じ)
    expect(ex).toContain("sum?.contentKind === 'live' || sum?.isLive === true");
  });
});
