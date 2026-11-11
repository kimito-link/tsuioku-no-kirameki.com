// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { streamKeyForWatchUrl, resolveYtWatchStreamKey, videoIdForYtHandleLive, ytSummaryToNicoSnapshot, isWatchLikeTabUrl } from '../../../extension-youtube/src/ytNicoShim.js';
import { buildWatchMetaCardAudienceViewModel } from '../buildWatchMetaCardAudienceViewModel.js';

// 0.1.1947: 記録の無いチャンネル(配信前の部屋)を前面にしても、前に見ていた別の配信を出さない(council/panel-stream-selection-SPEC.md §3-d)
describe('記録の無いチャンネルは仮のキーで「記録 0」', () => {
  it('Kick・SHOWROOM の記録の無いチャンネルでも配信キーに写る', () => {
    expect(streamKeyForWatchUrl('https://kick.com/nobody-here')).toBe('kk.nobody-here.00000');
    const sr = streamKeyForWatchUrl('https://www.showroom-live.com/r/some_room');
    expect(sr).toMatch(/^sr\..+\.00000$/);
    expect(isWatchLikeTabUrl('https://kick.com/nobody-here')).toBe(true);
  });

  it('配信のページでなければ写さない(今までどおり)', () => {
    expect(streamKeyForWatchUrl('https://example.com/')).toBe('');
  });

  it('/@名前/live は、まとめが無くても YouTube の仮キーになり、読み込み中のスナップショットを返す', () => {
    const url = 'https://www.youtube.com/@hotspanishvlogs/live';
    expect(streamKeyForWatchUrl(url)).toBe('ytlive:@hotspanishvlogs');
    expect(resolveYtWatchStreamKey(url, {
      abcdefghijk: { sourceUrl: url, viewersReadAt: 10 },
    })).toBe('abcdefghijk');
    const snap = /** @type {any} */ (ytSummaryToNicoSnapshot(undefined, 'ytlive:@hotspanishvlogs', '配信タイトル'));
    expect(snap.platform).toBe('youtube');
    expect(snap.officialViewersOnly).toBe(true);
    expect(snap.officialViewerCount).toBe(null);
    expect(snap.broadcasterName).toBe('@hotspanishvlogs');
    expect(snap.thumbnailUrl).toBe('');
    const vm = buildWatchMetaCardAudienceViewModel(snap, {
      nowMs: 1_700_000_000_000,
      prevForReactions: { viewerCount: null, concurrentEstimated: null },
    });
    expect(vm.concurrent.estText).toBe('読み込み中');
    expect(vm.concurrent.estText).not.toBe('（取得不可）');
    expect(vm.concurrent.estText).not.toBe('（接続中…）');
  });

  it('/名前/live は @ が無くても仮キーになり、開始時刻が無い経過は出さない', () => {
    expect(streamKeyForWatchUrl('https://www.youtube.com/weathernews/live')).toBe('ytlive:weathernews');
    expect(resolveYtWatchStreamKey('https://www.youtube.com/weathernews/live', {
      abcdefghijk: { sourceUrl: 'https://www.youtube.com/weathernews/live' },
    })).toBe('abcdefghijk');
    const fresh = /** @type {any} */ (ytSummaryToNicoSnapshot({ createdAt: Date.now() }, 'abcdefghijk', '長い配信'));
    expect(fresh.streamAgeMin).toBe(null);
    const known = /** @type {any} */ (ytSummaryToNicoSnapshot({
      createdAt: Date.now(),
      startedAt: Date.now() - 5 * 60 * 60 * 1000,
    }, 'abcdefghijk', '長い配信'));
    expect(known.streamAgeMin).toBeGreaterThanOrEqual(299);
    expect(known.streamAgeMin).toBeLessThanOrEqual(301);
  });

  it('/@名前/live は、まとめに残した同じパスの動画 id に写る', () => {
    const summaries = {
      abcdefghijk: { sourceUrl: 'https://www.youtube.com/@testchan/live', viewersReadAt: 10, concurrentViewers: 4321 },
      zzzzzzzzzzz: { sourceUrl: 'https://www.youtube.com/@other/live', viewersReadAt: 99 },
    };
    expect(videoIdForYtHandleLive('https://www.youtube.com/@testchan/live', summaries)).toBe('abcdefghijk');
    expect(videoIdForYtHandleLive('https://www.youtube.com/@testchan', summaries)).toBe('');
  });

  it('仮のキーの配信者名は URL のチャンネル名(別の配信の名前に倒さない)', () => {
    const snap = /** @type {any} */ (ytSummaryToNicoSnapshot(undefined, 'kk.nobody-here.00000', ''));
    expect(snap.broadcasterName).toBe('nobody-here');
    expect(snap.broadcasterPageUrl).toContain('kick.com/nobody-here');
  });

  it('本物の配信キーで記録に名前が無いときは空のまま(仮のキーだけの扱い)', () => {
    const snap = /** @type {any} */ (ytSummaryToNicoSnapshot({}, 'kk.nobody-here.12345', ''));
    expect(snap.broadcasterName).toBe('');
  });
});
