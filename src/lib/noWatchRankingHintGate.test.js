import { describe, it, expect } from 'vitest';
import { shouldShowNoWatchRankingHint } from './noWatchRankingHintGate.js';

describe('shouldShowNoWatchRankingHint', () => {
  it('埋め込み watch iframe では常に false', () => {
    expect(
      shouldShowNoWatchRankingHint({
        inlineEmbedWatch: true,
        focusedTabUrl: 'https://live.nicovideo.jp/watch/lv123'
      })
    ).toBe(false);
  });

  it('フォーカスが watch のときは false', () => {
    expect(
      shouldShowNoWatchRankingHint({
        inlineEmbedWatch: false,
        focusedTabUrl: 'https://live.nicovideo.jp/watch/lv999'
      })
    ).toBe(false);
  });

  it('フォーカスが空白・別サイトのときは true', () => {
    expect(
      shouldShowNoWatchRankingHint({
        inlineEmbedWatch: false,
        focusedTabUrl: 'about:blank'
      })
    ).toBe(true);
    expect(
      shouldShowNoWatchRankingHint({
        inlineEmbedWatch: false,
        focusedTabUrl: 'https://www.google.com/'
      })
    ).toBe(true);
  });
});
