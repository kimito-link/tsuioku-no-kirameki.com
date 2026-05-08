import { describe, it, expect } from 'vitest';
import { isTrustedGiftSubAppRelayMessage } from './giftSubAppRelayTrust.js';

describe('isTrustedGiftSubAppRelayMessage', () => {
  it('nicovideo child iframe の relay を許可する', () => {
    expect(
      isTrustedGiftSubAppRelayMessage({
        origin: 'https://audition.nicovideo.jp',
        isSelfSource: false,
        data: {
          type: 'NLS_GIFT_HISTORY_FROM_IFRAME',
          frameUrl: 'https://audition.nicovideo.jp/embedded/richview/live'
        }
      })
    ).toBe(true);
  });

  it('localhost dev iframe の heartbeat を許可する（origin と frameUrl の host 一致）', () => {
    expect(
      isTrustedGiftSubAppRelayMessage({
        origin: 'http://localhost:3456',
        isSelfSource: false,
        data: {
          type: 'NLS_GIFT_SUBAPP_RELAY_HEARTBEAT',
          frameUrl: 'http://localhost:3456/embed'
        }
      })
    ).toBe(true);
  });

  it('v0.1.234: frameUrl 空は拒否する（旧実装の抜け道）', () => {
    expect(
      isTrustedGiftSubAppRelayMessage({
        origin: 'https://audition.nicovideo.jp',
        isSelfSource: false,
        data: {
          type: 'NLS_GIFT_HISTORY_FROM_IFRAME'
          // frameUrl 欠落
        }
      })
    ).toBe(false);
  });

  it('v0.1.234: origin と frameUrl の origin 不一致は拒否する（trusted host 内のなりすまし）', () => {
    // origin と frameUrl の host が両方 .nicovideo.jp なのに、subdomain が違う
    expect(
      isTrustedGiftSubAppRelayMessage({
        origin: 'https://nicoad.nicovideo.jp',
        isSelfSource: false,
        data: {
          type: 'NLS_GIFT_HISTORY_FROM_IFRAME',
          frameUrl: 'https://audition.nicovideo.jp/embedded/richview/live'
        }
      })
    ).toBe(false);
  });

  it('v0.1.234: protocol が違う（http vs https）の不一致は拒否', () => {
    expect(
      isTrustedGiftSubAppRelayMessage({
        origin: 'http://audition.nicovideo.jp',
        isSelfSource: false,
        data: {
          type: 'NLS_GIFT_HISTORY_FROM_IFRAME',
          frameUrl: 'https://audition.nicovideo.jp/embedded/richview/live'
        }
      })
    ).toBe(false);
  });

  it('同一 window からの spoof を拒否する', () => {
    expect(
      isTrustedGiftSubAppRelayMessage({
        origin: 'https://live.nicovideo.jp',
        isSelfSource: true,
        data: {
          type: 'NLS_GIFT_HISTORY_FROM_IFRAME',
          frameUrl: 'https://audition.nicovideo.jp/embedded/richview/live'
        }
      })
    ).toBe(false);
  });

  it('第三者 iframe からの spoof を拒否する', () => {
    expect(
      isTrustedGiftSubAppRelayMessage({
        origin: 'https://example.com',
        isSelfSource: false,
        data: {
          type: 'NLS_GIFT_HISTORY_FROM_IFRAME',
          frameUrl: 'https://audition.nicovideo.jp/embedded/richview/live'
        }
      })
    ).toBe(false);
  });

  it('frameUrl が第三者 URL の場合も拒否する', () => {
    expect(
      isTrustedGiftSubAppRelayMessage({
        origin: 'https://audition.nicovideo.jp',
        isSelfSource: false,
        data: {
          type: 'NLS_GIFT_HISTORY_FROM_IFRAME',
          frameUrl: 'https://example.com/fake'
        }
      })
    ).toBe(false);
  });

  it('未知の type を拒否する', () => {
    expect(
      isTrustedGiftSubAppRelayMessage({
        origin: 'https://audition.nicovideo.jp',
        isSelfSource: false,
        data: { type: 'NLS_UNKNOWN', frameUrl: 'https://audition.nicovideo.jp/' }
      })
    ).toBe(false);
  });
});
