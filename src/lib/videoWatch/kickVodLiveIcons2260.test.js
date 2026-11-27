import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  KK_LIVE_ICONS_KEY,
  TW_LIVE_ICONS_KEY,
  fillKickVodAvatarsFromLiveIcons,
  fillVodAvatarsFromLiveIcons,
  vodLiveIconsKeyForPlatform,
} from './twVodLiveIcons.js';
import { rememberLiveIcon, mergeLiveIconStore } from '../platform/liveIconStore.js';
import { readVodWatchDom } from './vodCommentsFromDom.js';

const ROOT = join(__dirname, '../../..');
const U = (n) => `https://files.kick.com/images/user/${n}/profile_image/conversion/x-thumb.webp`;

describe('v0.1.2260 Kick 録画の顔を、ライブの Kick で覚えた顔(slug ごと)から埋める', () => {
  it('kk:@slug で引く・_ のままの本物の slug も名前から当たる・覚えていない人と顔がある人はそのまま', () => {
    const icons = { alnasty: U(1), kanata_2525: U(2), 'foo-bar': U(3), bad: 'http://x/y.png' };
    const r = fillKickVodAvatarsFromLiveIcons([
      { id: 'kk:@alnasty', name: 'Alnasty', avatarUrl: '' },
      { id: 'kk:@kanata-2525', name: 'kanata_2525', avatarUrl: '' },
      { id: 'kk:@foo-bar', name: 'Foo_Bar', avatarUrl: '' },
      { id: 'kk:@bad', name: 'bad', avatarUrl: '' },
      { id: 'kk:@nobody', name: 'nobody', avatarUrl: '' },
      { id: 'kk:@alnasty', name: 'x', avatarUrl: 'https://x/keep.png' },
      { id: 'tw:alnasty', name: 'zzz', avatarUrl: '' },
    ], icons);
    expect(r.filled).toBe(3);
    expect(r.authors.map((a) => a.avatarUrl)).toEqual([U(1), U(2), U(3), '', '', 'https://x/keep.png', '']);
  });
  it('サービスごとの鍵と振り分け(Twitch は今までどおり・ほかのサービスは何もしない)', () => {
    expect(vodLiveIconsKeyForPlatform('twitch')).toBe(TW_LIVE_ICONS_KEY);
    expect(vodLiveIconsKeyForPlatform('kick')).toBe(KK_LIVE_ICONS_KEY);
    expect(vodLiveIconsKeyForPlatform('twitcasting')).toBe('');
    const a = [{ id: 'tw:alice', avatarUrl: '' }];
    expect(fillVodAvatarsFromLiveIcons('twitch', a, { alice: U('a') })?.filled).toBe(1);
    expect(fillVodAvatarsFromLiveIcons('kick', a, { alice: U('a') })?.filled).toBe(0);
    expect(fillVodAvatarsFromLiveIcons('abema', a, { alice: U('a') })).toBeNull();
    expect(fillKickVodAvatarsFromLiveIcons(a, null)).toEqual({ authors: a, filled: 0 });
  });
  it('ライブで間に合った人も置いた顔で、録画の Chat Replay の人が埋まる', () => {
    const s = {};
    for (let i = 0; i < 50; i += 1) rememberLiveIcon(s, `user${i}`, U(i));
    const store = mergeLiveIconStore({}, s, 3000);
    const rows = Array.from({ length: 10 }, (_, i) => ({
      querySelector: () => ({ getAttribute: (n) => (n === 'title' ? `User${i * 3}` : null), textContent: `User${i * 3}` }),
    }));
    const doc = /** @type {any} */ ({
      querySelectorAll: (sel) => (sel === '#chatroom-messages [data-index]' ? rows : []),
      querySelector: () => null,
    });
    const read = readVodWatchDom(doc, /** @type {any} */ ({ platform: 'kick', videoId: 'v', pageKey: 'k', ownerId: 'o' }));
    expect(read.authors.length).toBe(10);
    expect(fillKickVodAvatarsFromLiveIcons(read.authors, store).filled).toBe(10);
  });
  it('ライブの Kick: 間に合った人も覚える(liveIconStore.js)・同じ鍵・新しい見張りは無い', () => {
    const kk = readFileSync(join(ROOT, 'extension-youtube/src/kick-content-entry.js'), 'utf8');
    expect(kk).toContain(`const LATE_ICONS_KEY = '${KK_LIVE_ICONS_KEY}';`);
    expect(kk).toMatch(/if \(rememberLiveIcon\(lateIcons, slug, url\)\) saveLateIconsSoon\(late \? LATE_SAVE_MS : KEEP_SAVE_MS\)/);
    expect(kk).toContain('mergeLiveIconStore(old, lateIcons, LATE_ICONS_MAX)');
    // 見張り・繰り返し・通信の数は v0.1.2257 と同じ(増やしていない)
    expect((kk.match(/MutationObserver|setInterval|fetch\(/g) || []).length).toBe(8);
    const entry = readFileSync(join(ROOT, 'src/extension/vod-video-watch-entry.js'), 'utf8');
    expect(entry).toContain("vodLiveIconsKeyForPlatform('kick')");
    expect(entry).not.toMatch(/fetch\(|XMLHttpRequest|MutationObserver|setInterval|setTimeout/);
  });
});
