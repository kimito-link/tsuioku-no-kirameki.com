// v0.1.2265: 同じタブで Twitch ライブからニコ生へ移ったら、横の欄はニコ生版(lv 付き)へ
import { describe, expect, it } from 'vitest';
import { nextSidepanelIframeSrc } from './sidepanelIframeSrc.js';

const NICO_BASE = 'popup.html?inline=1&dock=sidepanel';
const YT_TWITCH = 'yt-sidepanel.html?inline=1&dock=sidepanel&stream=twitch%3Asomeone&site=twitch';

describe('nextSidepanelIframeSrc: Twitch ライブ → ニコ生', () => {
  it('いま yt-sidepanel でも、ニコ生の URL なら nico の src に lv を付けて切り替える', () => {
    const next = nextSidepanelIframeSrc({
      tabUrl: 'https://live.nicovideo.jp/watch/lv351841372',
      currentSrc: YT_TWITCH,
      nicoBase: NICO_BASE,
      shownLv: '',
    });
    expect(next).toBeTruthy();
    expect(String(next)).not.toContain('yt-sidepanel.html');
    expect(String(next)).toContain('lv=lv351841372');
    expect(String(next)).toContain('popup.html');
  });
  it('ニコ生のまま同じ lv なら付け替えない', () => {
    const cur = `${NICO_BASE}&lv=lv351841372`;
    expect(nextSidepanelIframeSrc({
      tabUrl: 'https://live.nicovideo.jp/watch/lv351841372',
      currentSrc: cur,
      nicoBase: NICO_BASE,
      shownLv: 'lv351841372',
    })).toBeNull();
  });
  it('ニコ生から Twitch へ戻るときは YouTube 版へ', () => {
    const next = nextSidepanelIframeSrc({
      tabUrl: 'https://www.twitch.tv/someone',
      currentSrc: `${NICO_BASE}&lv=lv351841372`,
      nicoBase: NICO_BASE,
      shownLv: 'lv351841372',
    });
    expect(String(next)).toContain('yt-sidepanel.html');
    expect(String(next)).toContain('twitch');
  });
});
