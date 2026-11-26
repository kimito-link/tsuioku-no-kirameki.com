import { describe, it, expect } from 'vitest';
import { isIndexedPersonId, pageKeysForWatchUrl, viewerBehaviorWrapMatchesUrl } from './viewerBehaviorMatch.js';

describe('isIndexedPersonId', () => {
  it('YouTube の UC と、他サービスの人の鍵だけを認める', () => {
    expect(isIndexedPersonId('UCabcdefghijklmnopqrstuv')).toBe(true);
    expect(isIndexedPersonId('tw:12345')).toBe(true);
    expect(isIndexedPersonId('kk:@slug')).toBe(true);
    expect(isIndexedPersonId('sr:room-9')).toBe(true);
    expect(isIndexedPersonId('mx:100')).toBe(true);
    expect(isIndexedPersonId('tt:@name')).toBe(true);
    expect(isIndexedPersonId('ww:55')).toBe(true);
    expect(isIndexedPersonId('tc:user')).toBe(true);
    expect(isIndexedPersonId('ab:@n-slot')).toBe(true);
    expect(isIndexedPersonId('4')).toBe(false);
    expect(isIndexedPersonId('not-a-channel')).toBe(false);
    expect(isIndexedPersonId('')).toBe(false);
  });
});

describe('viewerBehaviorWrapMatchesUrl', () => {
  it('ニコ生・ニコ動・YouTube・他サービスの URL を、それぞれのキーと照合する', () => {
    expect(viewerBehaviorWrapMatchesUrl({ pageKey: 'lv123' }, 'https://live.nicovideo.jp/watch/lv123')).toBe(true);
    expect(viewerBehaviorWrapMatchesUrl({ pageKey: 'sm9' }, 'https://www.nicovideo.jp/watch/sm9')).toBe(true);
    expect(viewerBehaviorWrapMatchesUrl({ pageKey: 'abcdefghijk' }, 'https://www.youtube.com/watch?v=abcdefghijk')).toBe(true);
    expect(viewerBehaviorWrapMatchesUrl({ pageKey: 'tw.alice.999' }, 'https://www.twitch.tv/alice')).toBe(true);
    expect(viewerBehaviorWrapMatchesUrl({ pageKey: 'sr.myroom.1' }, 'https://www.showroom-live.com/r/myroom')).toBe(true);
    expect(viewerBehaviorWrapMatchesUrl({ pageKey: 'mx.10.5' }, 'https://mixch.tv/u/10/live')).toBe(true);
    expect(viewerBehaviorWrapMatchesUrl({ pageKey: 'kk.bob.2' }, 'https://kick.com/bob')).toBe(true);
    expect(viewerBehaviorWrapMatchesUrl({ pageKey: 'tt.somename.3' }, 'https://www.tiktok.com/@somename/live')).toBe(true);
    expect(viewerBehaviorWrapMatchesUrl({ pageKey: 'tc.castuser.4' }, 'https://twitcasting.tv/castuser')).toBe(true);
    expect(viewerBehaviorWrapMatchesUrl({ pageKey: 'ww.12345.9' }, 'https://whowatch.tv/viewer/12345')).toBe(true);
    expect(viewerBehaviorWrapMatchesUrl({ pageKey: 'ab.n-slotid.1' }, 'https://abema.tv/now-on-air/slotid')).toBe(true);
    expect(viewerBehaviorWrapMatchesUrl({ pageKey: 'lv123' }, 'https://live.nicovideo.jp/watch/lv999')).toBe(false);
    expect(viewerBehaviorWrapMatchesUrl({ pageKey: 'tw.alice.999' }, 'https://www.twitch.tv/bob')).toBe(false);
  });
});

describe('pageKeysForWatchUrl', () => {
  it('配信と動画のキーを取り違えない', () => {
    expect(pageKeysForWatchUrl('https://live.nicovideo.jp/watch/lv1')).toContain('lv1');
    expect(pageKeysForWatchUrl('https://www.nicovideo.jp/watch/sm9')).toContain('sm9');
    expect(pageKeysForWatchUrl('https://www.nicovideo.jp/watch/sm9')).not.toContain('lv1');
  });
});
