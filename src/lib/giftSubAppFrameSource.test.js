import { describe, it, expect } from 'vitest';
import {
  classifyGiftSubAppFrameSource,
  isContributionRankingTrustedSource,
  isGiftHistoryTrustedSource,
  isEventBannerTrustedSource
} from './giftSubAppFrameSource.js';

describe('classifyGiftSubAppFrameSource', () => {
  it('audition.nicovideo.jp → audition', () => {
    expect(
      classifyGiftSubAppFrameSource(
        'https://audition.nicovideo.jp/embedded/richview/live?content_id=lv1&frontend_id=9'
      )
    ).toBe('audition');
  });

  it('koken.nicovideo.jp → koken', () => {
    expect(
      classifyGiftSubAppFrameSource(
        'https://koken.nicovideo.jp/supporter/contents/live/lv1/gift'
      )
    ).toBe('koken');
  });

  it('gift.nicovideo.jp → gift', () => {
    expect(
      classifyGiftSubAppFrameSource(
        'https://gift.nicovideo.jp/live/lv1/purchase?frontend_id=9'
      )
    ).toBe('gift');
  });

  it('nicoad.nicovideo.jp → nicoad', () => {
    expect(
      classifyGiftSubAppFrameSource(
        'https://nicoad.nicovideo.jp/live/publish/lv1?frontend_id=9'
      )
    ).toBe('nicoad');
  });

  it('null / undefined / 空文字 → unknown', () => {
    expect(classifyGiftSubAppFrameSource(null)).toBe('unknown');
    expect(classifyGiftSubAppFrameSource(undefined)).toBe('unknown');
    expect(classifyGiftSubAppFrameSource('')).toBe('unknown');
  });

  it('未知 host → unknown', () => {
    expect(classifyGiftSubAppFrameSource('https://example.com/foo')).toBe('unknown');
    expect(classifyGiftSubAppFrameSource('https://www.nicovideo.jp/user/123')).toBe('unknown');
    expect(classifyGiftSubAppFrameSource('https://live.nicovideo.jp/watch/lv1')).toBe('unknown');
  });

  it('大文字 / mixed case でも判定', () => {
    expect(
      classifyGiftSubAppFrameSource(
        'https://Audition.NicoVideo.JP/embedded/richview/live'
      )
    ).toBe('audition');
  });
});

describe('isContributionRankingTrustedSource', () => {
  it('audition / koken のみ true', () => {
    expect(isContributionRankingTrustedSource('audition')).toBe(true);
    expect(isContributionRankingTrustedSource('koken')).toBe(true);
  });

  it('nicoad / gift / unknown は false（広告ランキングを混入させない）', () => {
    expect(isContributionRankingTrustedSource('nicoad')).toBe(false);
    expect(isContributionRankingTrustedSource('gift')).toBe(false);
    expect(isContributionRankingTrustedSource('unknown')).toBe(false);
  });
});

describe('isGiftHistoryTrustedSource', () => {
  it('koken のみ true', () => {
    expect(isGiftHistoryTrustedSource('koken')).toBe(true);
    expect(isGiftHistoryTrustedSource('audition')).toBe(false);
    expect(isGiftHistoryTrustedSource('nicoad')).toBe(false);
    expect(isGiftHistoryTrustedSource('gift')).toBe(false);
    expect(isGiftHistoryTrustedSource('unknown')).toBe(false);
  });
});

describe('isEventBannerTrustedSource', () => {
  it('audition のみ true', () => {
    expect(isEventBannerTrustedSource('audition')).toBe(true);
    expect(isEventBannerTrustedSource('koken')).toBe(false);
    expect(isEventBannerTrustedSource('nicoad')).toBe(false);
    expect(isEventBannerTrustedSource('gift')).toBe(false);
    expect(isEventBannerTrustedSource('unknown')).toBe(false);
  });
});
