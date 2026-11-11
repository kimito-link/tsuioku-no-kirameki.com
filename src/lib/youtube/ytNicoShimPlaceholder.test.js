// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { streamKeyForWatchUrl, videoIdForYtHandleLive, ytSummaryToNicoSnapshot, isWatchLikeTabUrl } from '../../../extension-youtube/src/ytNicoShim.js';

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
