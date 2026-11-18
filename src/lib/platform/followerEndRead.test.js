import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  fetchFollowerEndSample,
  followerEndReadForEvent,
  normalizeFollowerEndArm,
} from './followerEndRead.js';

const tw = normalizeFollowerEndArm(
  { platform: 'twitch', videoKey: 'tw.sasatikk.1711', login: 'sasatikk', clientId: 'kimne78kx3ncx6brgo4mv6wki5h1ko' },
  7,
);
const sr = normalizeFollowerEndArm(
  { platform: 'showroom', videoKey: 'sr.551215.904', roomKey: '551215', roomId: '61576' },
  8,
);
const ww = normalizeFollowerEndArm(
  { platform: 'whowatch', videoKey: 'ww.777.348122', userId: '348122', livePageId: '777' },
  9,
);

describe('記録の終わりの人数は、裏方がタブの出来事で1回読む', () => {
  it('閉じる・配信ページから離れる・配信が終わる、でその記録だけを読む', () => {
    const arms = [tw, sr, ww].filter(Boolean);
    const done = new Set();
    expect(followerEndReadForEvent(arms, done, { type: 'url', tabId: 7, url: 'https://www.twitch.tv/sasatikk' })).toBe(null);
    const left = followerEndReadForEvent(arms, done, { type: 'url', tabId: 7, url: 'https://www.google.com/' });
    expect(left?.videoKey).toBe('tw.sasatikk.1711');
    done.add(left.videoKey);
    expect(followerEndReadForEvent(arms, done, { type: 'removed', tabId: 7 })).toBe(null);
    const ended = followerEndReadForEvent(arms, done, { type: 'stream-end', videoKey: 'sr.551215.904' });
    expect(ended?.videoKey).toBe('sr.551215.904');
    done.add(ended.videoKey);
    expect(followerEndReadForEvent(arms, done, { type: 'removed', tabId: 8 })).toBe(null);
    expect(followerEndReadForEvent(arms, done, { type: 'removed', tabId: 9 })?.videoKey).toBe('ww.777.348122');
  });

  it('別のタブを閉じても、その記録は読まない', () => {
    expect(followerEndReadForEvent([tw], new Set(), { type: 'removed', tabId: 99 })).toBe(null);
  });

  it('ページの外のアドレスや、合わない記録キーは受け取らない', () => {
    expect(normalizeFollowerEndArm({ platform: 'twitch', videoKey: 'tw.other.1', login: 'sasatikk', url: 'https://evil.example/' }, 1)).toBe(null);
    expect(normalizeFollowerEndArm({ platform: 'showroom', videoKey: 'sr.551215.1', roomKey: 'other', roomId: '1' }, 1)).toBe(null);
  });

  it('読めた時刻は、応答を読み終えた時刻。時間切れの合図を付ける', async () => {
    let t = 1_700_000_000_000;
    /** @type {{ signal?: AbortSignal, credentials?: string } | undefined} */
    let sent;
    const sample = await fetchFollowerEndSample(tw, {
      fetch: async (_url, init) => {
        sent = init;
        t = 1_700_000_003_725;
        return { ok: true, json: async () => ({ data: { user: { followers: { totalCount: 1232778 } } } }) };
      },
      now: () => t,
    });
    expect(sample).toMatchObject({ at: 1_700_000_003_725, count: 1232778, force: true, rounded: false });
    expect(sent?.credentials).toBe('omit');
    expect(sent?.signal).toBeInstanceOf(AbortSignal);
  });

  it('裏方はタブを閉じたときと URL が変わったときに読み、ページが閉じる瞬間の fetch には頼らない', () => {
    const bg = readFileSync(new URL('../../../extension-youtube/src/background-entry.js', import.meta.url), 'utf8');
    expect(bg).toContain('chrome.tabs.onRemoved');
    expect(bg).toContain('chrome.tabs.onUpdated');
    expect(bg).toContain('followerEndReadForEvent');
    expect(bg).toContain('fetchFollowerEndSample');
    expect(bg).not.toContain('marketing-export');
    for (const file of ['tw-content-entry.js', 'sr-content-entry.js', 'ww-content-entry.js']) {
      const src = readFileSync(new URL(`../../../extension-youtube/src/${file}`, import.meta.url), 'utf8');
      const hideAt = src.indexOf("addEventListener('pagehide'");
      expect(hideAt).toBeGreaterThan(0);
      expect(src.slice(hideAt, hideAt + 280)).not.toMatch(/request(Tw|Sr|Ww)Followers/);
      expect(src).toContain('YT_FOLLOWER_END_ARM');
      expect(src).toContain('YT_FOLLOWER_END_NOW');
    }
  });
});
