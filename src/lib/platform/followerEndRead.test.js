import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  fetchFollowerEndSample,
  followerEndReadForEvent,
  normalizeFollowerEndArm,
} from './followerEndRead.js';

const sr = normalizeFollowerEndArm(
  { platform: 'showroom', videoKey: 'sr.551215.904', roomKey: '551215', roomId: '61576' },
  8,
);
const ww = normalizeFollowerEndArm(
  { platform: 'whowatch', videoKey: 'ww.777.348122', userId: '348122', livePageId: '777' },
  9,
);

describe('記録の終わりの人数', () => {
  it('Twitch は裏方で読まない。SHOWROOM とふわっちは、閉じる・離れる・配信の終わりで1回', () => {
    expect(normalizeFollowerEndArm(
      { platform: 'twitch', videoKey: 'tw.sasatikk.1711', login: 'sasatikk', clientId: 'kimne78kx3ncx6brgo4mv6wki5h1ko' },
      7,
    )).toBe(null);
    const arms = [sr, ww].filter(Boolean);
    const done = new Set();
    expect(followerEndReadForEvent(arms, done, { type: 'url', tabId: 8, url: 'https://www.showroom-live.com/r/551215' })).toBe(null);
    const left = followerEndReadForEvent(arms, done, { type: 'url', tabId: 8, url: 'https://www.google.com/' });
    expect(left?.videoKey).toBe('sr.551215.904');
    done.add(left.videoKey);
    expect(followerEndReadForEvent(arms, done, { type: 'removed', tabId: 8 })).toBe(null);
    const ended = followerEndReadForEvent(arms, done, { type: 'stream-end', videoKey: 'ww.777.348122' });
    expect(ended?.videoKey).toBe('ww.777.348122');
    done.add(ended.videoKey);
    expect(followerEndReadForEvent(arms, done, { type: 'removed', tabId: 9 })).toBe(null);
  });

  it('SHOWROOM の終わりは、応答を読み終えた時刻。時間切れの合図を付ける', async () => {
    let t = 1_700_000_000_000;
    /** @type {{ signal?: AbortSignal, credentials?: string } | undefined} */
    let sent;
    /** @type {string} */
    let urlSent = '';
    const sample = await fetchFollowerEndSample(sr, {
      fetch: async (url, init) => {
        urlSent = String(url);
        sent = init;
        t = 1_700_000_003_725;
        return { ok: true, json: async () => ({ follower_num: 3725 }) };
      },
      now: () => t,
    });
    expect(urlSent).toBe('https://www.showroom-live.com/api/room/profile?room_id=61576');
    expect(sample).toMatchObject({ at: 1_700_000_003_725, count: 3725, force: true, rounded: false });
    expect(sent?.credentials).toBe('omit');
    expect(sent?.signal).toBeInstanceOf(AbortSignal);
  });

  it('裏方の読みに Twitch の窓口は無い。タブを閉じても Twitch はページの fetch に頼らない', () => {
    const endRead = readFileSync(new URL('./followerEndRead.js', import.meta.url), 'utf8');
    const bg = readFileSync(new URL('../../../extension-youtube/src/background-entry.js', import.meta.url), 'utf8');
    expect(endRead).not.toContain('gql.twitch.tv');
    expect(bg).not.toContain('gql.twitch.tv');
    expect(bg).toContain('chrome.tabs.onRemoved');
    expect(bg).toContain('chrome.tabs.onUpdated');
    const tw = readFileSync(new URL('../../../extension-youtube/src/tw-content-entry.js', import.meta.url), 'utf8');
    expect(tw).not.toContain('YT_FOLLOWER_END_');
    const hideAt = tw.indexOf("addEventListener('pagehide'");
    expect(tw.slice(hideAt, hideAt + 180)).not.toContain('requestTwFollowers');
    const endedAt = tw.indexOf('!info.live');
    expect(tw.slice(endedAt, endedAt + 320)).toContain('requestTwFollowers(login, endedKey, { force: true })');
    expect(tw).toContain('signal: platformFetchTimeoutSignal()');
    for (const file of ['sr-content-entry.js', 'ww-content-entry.js']) {
      const src = readFileSync(new URL(`../../../extension-youtube/src/${file}`, import.meta.url), 'utf8');
      expect(src).toContain('YT_FOLLOWER_END_ARM');
      expect(src).toContain('YT_FOLLOWER_END_NOW');
      const hide = src.indexOf("addEventListener('pagehide'");
      expect(src.slice(hide, hide + 180)).not.toMatch(/request(Sr|Ww)Followers/);
    }
  });
});
