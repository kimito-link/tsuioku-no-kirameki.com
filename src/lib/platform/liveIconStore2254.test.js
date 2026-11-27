import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rememberLiveIcon, mergeLiveIconStore } from './liveIconStore.js';
import { fillTwitchVodAvatarsFromLiveIcons, TW_LIVE_ICONS_KEY } from '../videoWatch/twVodLiveIcons.js';

const ROOT = join(__dirname, '../../..');
const U = (n) => `https://static-cdn.jtvnw.net/jtv_user_pictures/${n}-profile_image-70x70.png`;

describe('v0.1.2254 ライブで分かった顔を全員ぶん yt_tw_icons に置く', () => {
  it('覚えるのは https の顔だけ・同じなら false・覚え直すと新しい側へ動く', () => {
    const s = {};
    expect(rememberLiveIcon(s, 'Alice', U('a'))).toBe(true);
    expect(rememberLiveIcon(s, 'alice', U('a'))).toBe(false);
    expect(rememberLiveIcon(s, 'bob', '')).toBe(false);
    expect(rememberLiveIcon(s, 'bob', 'http://x/b.png')).toBe(false);
    expect(rememberLiveIcon(s, 'carol', U('c'))).toBe(true);
    expect(rememberLiveIcon(s, 'alice', U('a2'))).toBe(true);
    expect(Object.keys(s)).toEqual(['carol', 'alice']);
  });
  it('storage の分(ほかのタブ)を残し、このタブの分を新しい側に置き、上限で古い順に捨てる', () => {
    const saved = { old1: U('o1'), old2: U('o2'), alice: U('stale'), junk: 1, empty: '' };
    const mine = { alice: U('a'), bob: U('b') };
    expect(mergeLiveIconStore(saved, mine, 10)).toEqual({ old1: U('o1'), old2: U('o2'), alice: U('a'), bob: U('b') });
    const capped = mergeLiveIconStore(saved, mine, 3);
    expect(Object.keys(capped)).toEqual(['old2', 'alice', 'bob']);
    expect(Object.keys(mergeLiveIconStore(null, mine, 1))).toEqual(['bob']);
  });
  it('間に合った人も置いた顔で、録画の同じ login の人が埋まる', () => {
    const s = {};
    for (let i = 0; i < 270; i += 1) rememberLiveIcon(s, `user${i}`, U(String(i)));
    const store = mergeLiveIconStore({}, s, 3000);
    const vod = Array.from({ length: 33 }, (_, i) => ({ id: `tw:user${i * 8}`, avatarUrl: '' }));
    expect(fillTwitchVodAvatarsFromLiveIcons(vod, store).filled).toBe(33);
  });
  it('ライブの入口: 間に合った人も覚える・新しい通信/見張りは無い・同じ鍵', () => {
    const tw = readFileSync(join(ROOT, 'extension-youtube/src/tw-content-entry.js'), 'utf8');
    expect(tw).toContain(`const TW_LATE_ICONS_KEY = '${TW_LIVE_ICONS_KEY}';`);
    expect(tw).toMatch(/if \(rememberLiveIcon\(lateIcons, l, url\)\) saveLateIconsSoon\(late \? TW_LATE_SAVE_MS : TW_KEEP_SAVE_MS\)/);
    expect(tw).toContain('mergeLiveIconStore(old, lateIcons, TW_LATE_ICONS_MAX)');
    expect(tw).not.toMatch(/MutationObserver|setInterval/);
  });
});
