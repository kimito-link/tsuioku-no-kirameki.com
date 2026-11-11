import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sanitizeLiveEventsBody } from './liveEvents.js';
import { computePseudoLvForVideoId } from './youtube/ytPseudoLv.js';
import { serviceItemsToLiveTail, serviceItemToMirrorRow } from './obsServiceComments.js';

describe('OBS中継へ渡す、ニコ生以外のコメント', () => {
  it('YouTube も Twitch も、サーバーが受け取れる lv の形になる', () => {
    const now = 1_700_000_000_000;
    const yt = serviceItemsToLiveTail('abcdefghijk', [
      { id: 'm1', name: 'りん', text: 'きた', iconUrl: 'https://yt3.ggpht.com/a.jpg', channelId: 'UCxxxxxxxxxxxxxxxxxxxxxx', kind: 'text', postedAtMs: now }
    ], now);
    const tw = serviceItemsToLiveTail('tw.examplechan.42', [
      { id: 't1', name: 'foo', text: 'hello', iconUrl: 'http://evil.example/a.jpg', channelId: 'tw:9', kind: 'superchat', postedAtMs: now }
    ], now);
    expect(yt?.liveId).toBe(computePseudoLvForVideoId('abcdefghijk'));
    expect(tw?.liveId).toBe(computePseudoLvForVideoId('tw.examplechan.42'));
    expect(yt?.liveId).toMatch(/^lv\d{12}$/);
    expect(sanitizeLiveEventsBody({ liveId: yt?.liveId, sendId: 'send-0001', events: [{ type: 'comment', at: now, name: 'りん', text: 'きた' }], dropped: 0 })).not.toBeNull();
    expect(yt?.rows[0]).toMatchObject({ name: 'りん', text: 'きた', kind: '', avatarUrl: 'https://yt3.ggpht.com/a.jpg' });
    expect(tw?.rows[0]).toMatchObject({ kind: 'gift', avatarUrl: '' });
  });

  it('アーカイブの再生と空の行は送らない', () => {
    expect(serviceItemToMirrorRow({ replay: true, name: 'a', text: 'b' }, 1)).toBeNull();
    expect(serviceItemToMirrorRow({ name: '', text: '' }, 1)).toBeNull();
    expect(serviceItemsToLiveTail('', [{ name: 'a', text: 'b' }], 1)).toBeNull();
  });

  it('透過ページはニコ生の画面を前提にしない', () => {
    const page = readFileSync(new URL('../../app/obs-overlay.js', import.meta.url), 'utf8');
    expect(page).not.toMatch(/nicovideo|comeview\.html|niconico/);
    expect(page).toContain('row.name');
    expect(page).toContain('row.text');
    const boot = readFileSync(new URL('../extension/obsBrowserSourceBoot.js', import.meta.url), 'utf8');
    const relay = readFileSync(new URL('../extension/obsServiceRelay.js', import.meta.url), 'utf8');
    const bg = readFileSync(new URL('../../extension-youtube/src/background-entry.js', import.meta.url), 'utf8');
    expect(boot).toContain('OBS_SERVICE_COMEVIEW_PAGE');
    expect(relay).toContain('serviceItemsToLiveTail');
    expect(bg).toContain('relayObsServiceComments');
  });
});
