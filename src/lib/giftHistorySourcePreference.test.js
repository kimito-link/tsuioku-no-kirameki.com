import { describe, it, expect } from 'vitest';
import {
  pickGiftHistorySource,
  pickKokenSubAppVsLiveGiftHistory,
  GIFT_IFRAME_STALE_MS
} from './giftHistorySourcePreference.js';

const NOW = 1_700_000_000_000;

describe('pickGiftHistorySource', () => {
  it('どちらも無ければ none', () => {
    expect(
      pickGiftHistorySource({ iframeAvailable: false, liveAvailable: false, nowMs: NOW })
    ).toBe('none');
  });

  it('iframe だけなら iframe', () => {
    expect(
      pickGiftHistorySource({
        iframeAvailable: true,
        iframeCapturedAtMs: NOW - 1000,
        liveAvailable: false,
        nowMs: NOW
      })
    ).toBe('iframe');
  });

  it('ライブだけなら live', () => {
    expect(
      pickGiftHistorySource({
        iframeAvailable: false,
        liveAvailable: true,
        liveLatestAtMs: NOW - 1000,
        nowMs: NOW
      })
    ).toBe('live');
  });

  it('両方あり iframe が新しい（閾値内）なら iframe を維持', () => {
    expect(
      pickGiftHistorySource({
        iframeAvailable: true,
        iframeCapturedAtMs: NOW - 30_000, // 30秒前＝新しい
        liveAvailable: true,
        liveLatestAtMs: NOW - 5_000,
        nowMs: NOW
      })
    ).toBe('iframe');
  });

  it('両方あり iframe が古く（閾値超）ライブが新しいなら live へ', () => {
    expect(
      pickGiftHistorySource({
        iframeAvailable: true,
        iframeCapturedAtMs: NOW - (GIFT_IFRAME_STALE_MS + 30_000),
        liveAvailable: true,
        liveLatestAtMs: NOW - 5_000, // iframe より新しい
        nowMs: NOW
      })
    ).toBe('live');
  });

  it('iframe が古くてもライブがそれより古いなら iframe を維持', () => {
    expect(
      pickGiftHistorySource({
        iframeAvailable: true,
        iframeCapturedAtMs: NOW - (GIFT_IFRAME_STALE_MS + 30_000),
        liveAvailable: true,
        liveLatestAtMs: NOW - (GIFT_IFRAME_STALE_MS + 60_000), // iframe より古い
        nowMs: NOW
      })
    ).toBe('iframe');
  });

  it('iframe の capturedAt 不明なら安全側で iframe 維持（両方あり時）', () => {
    expect(
      pickGiftHistorySource({
        iframeAvailable: true,
        iframeCapturedAtMs: 0,
        liveAvailable: true,
        liveLatestAtMs: NOW - 5_000,
        nowMs: NOW
      })
    ).toBe('iframe');
  });

  it('不正引数は none', () => {
    expect(pickGiftHistorySource(null)).toBe('none');
    expect(pickGiftHistorySource(undefined)).toBe('none');
  });
});

describe('pickKokenSubAppVsLiveGiftHistory', () => {
  it('sub-app のみなら subApp', () => {
    expect(
      pickKokenSubAppVsLiveGiftHistory({
        subAppAvailable: true,
        subAppPointsSum: 5000,
        subAppThrowCount: 3,
        liveAvailable: false,
        livePointsSum: 0,
        liveThrowCount: 0
      })
    ).toBe('subApp');
  });

  it('ライブの pt・件数が明らかに多いなら live', () => {
    expect(
      pickKokenSubAppVsLiveGiftHistory({
        subAppAvailable: true,
        subAppPointsSum: 50,
        subAppThrowCount: 1,
        liveAvailable: true,
        livePointsSum: 10000,
        liveThrowCount: 20
      })
    ).toBe('live');
  });

  it('同程度なら subApp を維持', () => {
    expect(
      pickKokenSubAppVsLiveGiftHistory({
        subAppAvailable: true,
        subAppPointsSum: 4000,
        subAppThrowCount: 10,
        liveAvailable: true,
        livePointsSum: 4200,
        liveThrowCount: 11
      })
    ).toBe('subApp');
  });

  it('公式累計に近い方の源を優先する', () => {
    expect(
      pickKokenSubAppVsLiveGiftHistory({
        subAppAvailable: true,
        subAppPointsSum: 10790,
        subAppThrowCount: 19,
        liveAvailable: true,
        livePointsSum: 10950,
        liveThrowCount: 22,
        officialProgramGiftPts: 10970
      })
    ).toBe('live');
  });
});
