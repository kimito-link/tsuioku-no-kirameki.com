import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { YT_PANEL_SRC, isYtPanelSrc, isYtPanelTabUrl } from './ytPanelRoute.js';

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
  });
  it('いま YouTube 版を見せているか', () => {
    expect(isYtPanelSrc(YT_PANEL_SRC)).toBe(true);
    expect(isYtPanelSrc('popup.html?inline=1&lv=lv1')).toBe(false);
    expect(isYtPanelSrc(null)).toBe(false);
  });
  it('★配線: パネルはタブ専用にせず、中の iframe だけ付け替える(sidepanel-iframe-boot-entry)', () => {
    const boot = readFileSync('src/extension/sidepanel-iframe-boot-entry.js', 'utf8');
    expect(boot).toContain('if (isYtPanelTabUrl(activeTabs && activeTabs[0] && activeTabs[0].url)) return YT_PANEL_SRC;');
    expect(boot).toContain('loader.update(YT_PANEL_SRC)');
    const sw = readFileSync('extension/background.js', 'utf8');
    expect(sw).toContain("importScripts('dist/yt-background.js')");
  });
});
