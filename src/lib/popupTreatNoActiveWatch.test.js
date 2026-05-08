import { describe, it, expect } from 'vitest';
import { computeTreatAsNoActiveWatch } from './popupTreatNoActiveWatch.js';

describe('computeTreatAsNoActiveWatch', () => {
  it('新規タブ相当（前面が watch 以外）なら、背景に watch タブがあっても empty 扱い', () => {
    expect(
      computeTreatAsNoActiveWatch({
        resolvedWatchUrl: 'https://live.nicovideo.jp/watch/lv123?ref=x',
        watchUrlSource: 'storage',
        hasOpenMatchingWatchTab: true,
        embedWatchIframe: false,
        sidePanel: false,
        focusedNormalTabUrl: 'chrome://newtab/'
      })
    ).toBe(true);
  });

  it('前面がニコ生 watch なら背景タブ込みで live になりうる', () => {
    expect(
      computeTreatAsNoActiveWatch({
        resolvedWatchUrl: 'https://live.nicovideo.jp/watch/lv123',
        watchUrlSource: 'storage',
        hasOpenMatchingWatchTab: true,
        embedWatchIframe: false,
        sidePanel: false,
        focusedNormalTabUrl: 'https://live.nicovideo.jp/watch/lv123'
      })
    ).toBe(false);
  });

  it('watch 埋め込み iframe では前面ゲートを使わない（常に live 側へ）', () => {
    expect(
      computeTreatAsNoActiveWatch({
        resolvedWatchUrl: 'https://live.nicovideo.jp/watch/lv999',
        watchUrlSource: 'activeTab',
        hasOpenMatchingWatchTab: true,
        embedWatchIframe: true,
        sidePanel: false,
        focusedNormalTabUrl: 'chrome://newtab/'
      })
    ).toBe(false);
  });

  it('サイドパネルでは前面ゲートを適用（youtube 等では empty）', () => {
    expect(
      computeTreatAsNoActiveWatch({
        resolvedWatchUrl: 'https://live.nicovideo.jp/watch/lv1',
        watchUrlSource: 'storage',
        hasOpenMatchingWatchTab: true,
        embedWatchIframe: false,
        sidePanel: true,
        focusedNormalTabUrl: 'https://www.youtube.com/watch?v=abc'
      })
    ).toBe(true);
  });
});
