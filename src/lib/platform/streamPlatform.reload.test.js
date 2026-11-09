import { describe, it, expect } from 'vitest';
import { isStreamTabToReload, STREAM_PLATFORM_TAB_URLS } from './streamPlatform.js';

describe('拡張の入れ替え時に読み込み直すタブ(YouTube 以外)', () => {
  it('各サービスの配信ページは読み込み直す', () => {
    expect(isStreamTabToReload('https://www.showroom-live.com/r/some_room')).toBe(true);
    expect(isStreamTabToReload('https://www.tiktok.com/@some.user/live')).toBe(true);
    expect(isStreamTabToReload('https://mixch.tv/u/12345678/live')).toBe(true);
    expect(isStreamTabToReload('https://kick.com/somechannel')).toBe(true);
    expect(isStreamTabToReload('https://www.twitch.tv/somechannel')).toBe(true);
  });
  it('トップ・一覧・別のサイトは読み込み直さない', () => {
    expect(isStreamTabToReload('https://www.showroom-live.com/')).toBe(false);
    expect(isStreamTabToReload('https://www.tiktok.com/foryou')).toBe(false);
    expect(isStreamTabToReload('https://example.com/r/some_room')).toBe(false);
    expect(isStreamTabToReload(undefined)).toBe(false);
  });
  it('探す URL の形は6サービスぶん', () => {
    expect(STREAM_PLATFORM_TAB_URLS).toContain('https://www.showroom-live.com/*');
    expect(STREAM_PLATFORM_TAB_URLS).toContain('https://www.tiktok.com/*');
    expect(STREAM_PLATFORM_TAB_URLS.length).toBe(6);
  });
});

import { placeholderStreamKeyForChannel, isPlaceholderStreamKey, STREAM_PLATFORMS, platformOfStreamKey } from './streamPlatform.js';

describe('記録の無いチャンネルの仮の配信キー', () => {
  it('6サービスとも、そのサービスの配信キーとして読める', () => {
    const logins = { twitch: 'somechannel', kick: 'somechannel', whowatch: '12345', showroom: '62f_room', mixch: '12345678', tiktok: 'some.user' };
    for (const [id, login] of Object.entries(logins)) {
      const p = STREAM_PLATFORMS[/** @type {keyof typeof STREAM_PLATFORMS} */ (id)];
      const key = placeholderStreamKeyForChannel(p, login);
      expect(key, id).toBe(`${p.keyHead}${login}.00000`);
      expect(platformOfStreamKey(key), id).toBe(p);
      expect(p.loginOfStreamKey(key), id).toBe(login);
      expect(isPlaceholderStreamKey(key), id).toBe(true);
    }
  });
  it('形に合わない名前・空は作らない。本物のキーは仮ではない', () => {
    expect(placeholderStreamKeyForChannel(STREAM_PLATFORMS.mixch, 'abc')).toBe('');
    expect(placeholderStreamKeyForChannel(STREAM_PLATFORMS.showroom, '')).toBe('');
    expect(isPlaceholderStreamKey('sr.room.123456')).toBe(false);
    expect(isPlaceholderStreamKey('abc00000')).toBe(false);
  });
});
