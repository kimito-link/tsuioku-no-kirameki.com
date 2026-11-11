import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { YT_PANEL_SRC, isYtPanelSrc, isYtPanelTabUrl, ytPanelStreamKeyOfUrl, buildYtPanelSrc, readYtPanelStreamKey } from './ytPanelRoute.js';

describe('ytPanelRoute', () => {
  it('YouTube のタブだけ YouTube 版', () => {
    expect(isYtPanelTabUrl('https://www.youtube.com/watch?v=abcdefghijk')).toBe(true);
    expect(isYtPanelTabUrl('https://www.youtube.com/live/abcdefghijk')).toBe(true);
    expect(isYtPanelTabUrl('https://live.nicovideo.jp/watch/lv1')).toBe(false);
    expect(isYtPanelTabUrl('https://youtube.com.evil.example/')).toBe(false);
    expect(isYtPanelTabUrl(undefined)).toBe(false);
  });
  it('Twitch のタブも同じ画面', () => {
    expect(isYtPanelTabUrl('https://www.twitch.tv/kimito_link')).toBe(true);
    expect(isYtPanelTabUrl('https://twitch.tv.evil.example/')).toBe(false);
    expect(isYtPanelTabUrl('https://kick.com/kimito-link')).toBe(true);
    expect(isYtPanelTabUrl('https://kick.com.evil.example/')).toBe(false);
    expect(isYtPanelTabUrl('https://whowatch.tv/viewer/123')).toBe(true);
    expect(isYtPanelTabUrl('https://whowatch.tv.evil.example/')).toBe(false);
    expect(isYtPanelTabUrl('https://abema.tv/now-on-air/abema-news')).toBe(true);
    expect(isYtPanelTabUrl('https://abema.tv.evil.example/')).toBe(false);
  });
  it('いま YouTube 版を見せているか', () => {
    expect(isYtPanelSrc(YT_PANEL_SRC)).toBe(true);
    expect(isYtPanelSrc('popup.html?inline=1&lv=lv1')).toBe(false);
    expect(isYtPanelSrc(null)).toBe(false);
  });
  it('★配線: パネルはタブ専用にせず、中の iframe だけ付け替える(sidepanel-iframe-boot-entry)', () => {
    const boot = readFileSync('src/extension/sidepanel-iframe-boot-entry.js', 'utf8');
    expect(boot).toContain('if (isYtPanelTabUrl(activeUrl)) return buildYtPanelSrc(ytPanelStreamKeyOfUrl(activeUrl));');
    // 0.1.1949: YouTube 系どうしでも別の配信になったら読み込み直す(配信キーで比べる)
    expect(boot).toContain('k !== readYtPanelStreamKey(cur)');
    expect(boot).toContain('loader.update(buildYtPanelSrc(k))');
    const sw = readFileSync('extension/background.js', 'utf8');
    expect(sw).toContain("importScripts('dist/yt-background.js')");
  });
  it('0.1.1949: 配信ページ → チャンネル単位の配信キー(配信ページでなければ空)', () => {
    expect(ytPanelStreamKeyOfUrl('https://www.youtube.com/watch?v=abcdefghijk')).toBe('yt:abcdefghijk');
    expect(ytPanelStreamKeyOfUrl('https://www.youtube.com/@hotspanishvlogs/live')).toBe('yt:ytlive:@hotspanishvlogs');
    expect(ytPanelStreamKeyOfUrl('https://www.youtube.com/weathernews/live')).toBe('yt:ytlive:weathernews');
    expect(ytPanelStreamKeyOfUrl('https://www.youtube.com/')).toBe('');
    expect(ytPanelStreamKeyOfUrl('https://www.twitch.tv/kimito_link')).toBe('twitch:kimito_link');
    expect(ytPanelStreamKeyOfUrl('https://kick.com/kimito-link')).toBe('kick:kimito-link');
    expect(ytPanelStreamKeyOfUrl('https://www.showroom-live.com/r/some_room')).toMatch(/^showroom:/);
    expect(ytPanelStreamKeyOfUrl('https://www.tiktok.com/@some.one/live')).toMatch(/^tiktok:/);
    expect(ytPanelStreamKeyOfUrl('https://whowatch.tv/viewer/123')).toMatch(/^whowatch:/);
    expect(ytPanelStreamKeyOfUrl('https://abema.tv/now-on-air/abema-news')).toBe('abema:n-abema-news');
    expect(ytPanelStreamKeyOfUrl('https://live.nicovideo.jp/watch/lv1')).toBe('');
    expect(ytPanelStreamKeyOfUrl('https://kick.com.evil.example/x')).toBe('');
  });
  it('0.1.1949: src に焼いて読み戻す(往復・記号は encode)', () => {
    for (const k of ['yt:abcdefghijk', 'kick:a-b', 'tiktok:some.one', 'showroom:a&b=c']) {
      const src = buildYtPanelSrc(k);
      expect(isYtPanelSrc(src)).toBe(true);
      expect(readYtPanelStreamKey(src)).toBe(k);
    }
    expect(buildYtPanelSrc('')).toBe(YT_PANEL_SRC);
    expect(readYtPanelStreamKey(YT_PANEL_SRC)).toBe('');
    expect(readYtPanelStreamKey(null)).toBe('');
  });
});
