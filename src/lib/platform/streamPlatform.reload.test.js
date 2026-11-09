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
