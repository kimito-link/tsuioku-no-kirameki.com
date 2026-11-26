import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fillTwitchVodAvatarsFromLiveIcons, TW_LIVE_ICONS_KEY } from './twVodLiveIcons.js';

const ROOT = join(__dirname, '../../..');

describe('v0.1.2253 Twitch 録画の顔を、ライブで覚えた顔(login ごと)から埋める', () => {
  it('覚えている login だけ埋め、顔がある人・覚えていない人はそのまま', () => {
    const icons = { alice: 'https://static-cdn.jtvnw.net/jtv_user_pictures/a.png', bob: '' };
    const r = fillTwitchVodAvatarsFromLiveIcons([
      { id: 'tw:Alice', name: 'Alice', avatarUrl: '' },
      { id: 'tw:bob', name: 'bob', avatarUrl: '' },
      { id: 'tw:carol', name: 'carol', avatarUrl: 'https://x/c.png' },
      { id: 'kk:@alice', name: 'alice', avatarUrl: '' },
    ], icons);
    expect(r.filled).toBe(1);
    expect(r.authors[0].avatarUrl).toBe(icons.alice);
    expect(r.authors[1].avatarUrl).toBe('');
    expect(r.authors[2].avatarUrl).toBe('https://x/c.png');
    expect(r.authors[3].avatarUrl).toBe('');
  });
  it('覚えが無ければ何もしない', () => {
    const a = [{ id: 'tw:alice', avatarUrl: '' }];
    expect(fillTwitchVodAvatarsFromLiveIcons(a, null)).toEqual({ authors: a, filled: 0 });
  });
  it('ライブの Twitch が書く場所と同じ鍵・入口は storage を読むだけ(通信・タイマー・見張りなし)', () => {
    const tw = readFileSync(join(ROOT, 'extension-youtube/src/tw-content-entry.js'), 'utf8');
    expect(tw).toContain(`const TW_LATE_ICONS_KEY = '${TW_LIVE_ICONS_KEY}';`);
    const entry = readFileSync(join(ROOT, 'src/extension/vod-video-watch-entry.js'), 'utf8');
    expect(entry).toContain('chrome.storage.local.get(TW_LIVE_ICONS_KEY)');
    expect(entry).not.toMatch(/fetch\(|XMLHttpRequest|MutationObserver|setInterval|setTimeout/);
  });
});
