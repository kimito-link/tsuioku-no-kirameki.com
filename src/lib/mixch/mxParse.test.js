import { describe, it, expect } from 'vitest';
import {
  parseMxUserIdFromUrl,
  mxLiveInfoUrl,
  mxMessagesUrl,
  mxItemsUrls,
  mxSocketUrl,
  mxTimeMs,
  safeMxImageUrl,
  parseMxLive,
  parseMxItems,
  parseMxSocketFrame,
  mxMessageRows,
  parseMxMessage,
  parseMxRanking,
  buildMxStreamKey,
  isMxStreamKey,
  mxUserIdOfStreamKey,
  mxLiveUrl,
} from './mxParse.js';
import { platformOfStreamKey, platformOfPersonKey, platformChannelOfUrl, platformOfHostname, STREAM_PLATFORMS } from '../platform/streamPlatform.js';

describe('ミクチャの URL', () => {
  it('配信のページから配信者の番号を取る', () => {
    expect(parseMxUserIdFromUrl('https://mixch.tv/u/1234567/live')).toBe('1234567');
    expect(parseMxUserIdFromUrl('https://mixch.tv/u/1234567')).toBe('1234567');
    expect(parseMxUserIdFromUrl('https://mixch.tv/u/abc/live')).toBe('');
    expect(parseMxUserIdFromUrl('https://evil.example/u/1/live')).toBe('');
    expect(parseMxUserIdFromUrl('nope')).toBe('');
  });
  it('API とソケットの URL', () => {
    expect(mxLiveInfoUrl('12')).toBe('https://mixch.tv/api-web/users/12/live');
    expect(mxMessagesUrl('12')).toBe('https://mixch.tv/api-web/lives/12/messages');
    expect(mxItemsUrls('99')[0]).toBe('https://mixch.tv/api-web/items/available?live_session_id=99');
    expect(mxItemsUrls('x')).toEqual([]);
    expect(mxSocketUrl('wss://chat.mixch.tv/torte/room/12', '12')).toBe('wss://chat.mixch.tv/torte/room/12');
    expect(mxSocketUrl('wss://evil.example/x', '12')).toBe('wss://chat.mixch.tv/torte/room/12');
    expect(mxLiveInfoUrl('../x')).toBe('');
  });
  it('時刻と画像', () => {
    expect(mxTimeMs(1700000000)).toBe(1700000000000);
    expect(mxTimeMs(0)).toBe(0);
    expect(safeMxImageUrl('https://d2jtsb989t238a.cloudfront.net/a.jpg')).toBe('https://d2jtsb989t238a.cloudfront.net/a.jpg');
    expect(safeMxImageUrl('http://d2jtsb989t238a.cloudfront.net/a.jpg')).toBe('');
    expect(safeMxImageUrl('https://evil.com/a.jpg')).toBe('');
  });
});

describe('配信の情報', () => {
  const LIVE = {
    liveInfo: { id: 5, chat: 'wss://chat.mixch.tv/torte/room/5', live_session_id: 77, title: 'ざつだん', viewer: 10, created: 1700000000 },
    broadcasterInfo: { id: 5, name: 'はいしんしゃ', profile_image_url: 'https://d2jtsb989t238a.cloudfront.net/5.jpg', live_status: 1 },
  };
  it('配信中を読む', () => {
    expect(parseMxLive(LIVE)).toMatchObject({ userId: '5', sessionId: '77', isLive: true, title: 'ざつだん', name: 'はいしんしゃ', viewers: 10, startedAtMs: 1700000000000 });
  });
  it('配信の情報が無ければ配信していない', () => {
    expect(parseMxLive({ broadcasterInfo: LIVE.broadcasterInfo, liveInfo: null })?.isLive).toBe(false);
    expect(parseMxLive({ ...LIVE, liveInfo: { ...LIVE.liveInfo, live_session_id: 0 } })?.isLive).toBe(false);
  });
  it('形が違えば null', () => {
    expect(parseMxLive(null)).toBe(null);
    expect(parseMxLive({})).toBe(null);
  });
});

describe('メッセージ', () => {
  const items = parseMxItems({ items: [{ id: 501, price: 100, url: 'https://d2uqarpmf42qy0.cloudfront.net/torte_web_resources/501.png' }, { id: 'x' }] });
  it('アイテムの一覧', () => {
    expect(items.size).toBe(1);
    expect(items.get('501')).toEqual({ price: 100, imageUrl: 'https://d2uqarpmf42qy0.cloudfront.net/torte_web_resources/501.png' });
  });
  it('コメント', () => {
    expect(parseMxMessage({ kind: 0, message_id: 'a-1', user_id: 11, name: 'ファンA', body: ' わこつ ', created: 1700000001 }, { userId: '5' })).toMatchObject({
      id: 'mx-a-1', channelId: 'mx:11', name: 'ファンA', text: 'わこつ', kind: 'text', amount: 0, postedAtMs: 1700000001000, channel: '5',
    });
    expect(parseMxMessage({ kind: 0, message_id: 'a-2', user_id: 11, body: '' }, { userId: '5' })).toBe(null);
  });
  it('ギフトは price × 個数。一覧に無ければ item_price', () => {
    expect(parseMxMessage({ kind: 42, message_id: 'g-1', user_id: 13, name: 'X', item_id: 501, count: 3 }, { userId: '5', items })).toMatchObject({
      kind: 'superchat', amount: 300, currency: 'MXCOIN', giftName: 'ギフト', giftCount: 3, text: 'ギフト ×3',
    });
    expect(parseMxMessage({ kind: 120, message_id: 'g-2', user_id: 13, item_id: 9, item_price: 50 }, { userId: '5', items })).toMatchObject({ amount: 50 });
    expect(parseMxMessage({ kind: 45, message_id: 'g-3', user_id: 13, item_id: 9 }, { userId: '5', items })).toMatchObject({ kind: 'text', amount: 0, giftName: 'ギフト' });
  });
  it('匿名のギフトは1つの席にまとめる', () => {
    expect(parseMxMessage({ kind: 42, message_id: 'g-4', user_id: 13, name: '本名', anonymous: 1, item_id: 501 }, { userId: '5', items })).toMatchObject({ channelId: 'mx:n:匿名', name: '匿名', iconUrl: '' });
  });
  it('入室・状態は記録しない', () => {
    expect(parseMxMessage({ kind: 61, message_id: 'e', user_id: 1, body: '入室' }, { userId: '5' })).toBe(null);
    expect(parseMxMessage({ kind: 10, viewer: 3 }, { userId: '5' })).toBe(null);
  });
  it('ソケットの1通と開いた時点の分', () => {
    expect(parseMxSocketFrame('{"kind":0}')).toEqual([{ kind: 0 }]);
    expect(parseMxSocketFrame('[{"kind":0},{"kind":10}]').length).toBe(2);
    expect(parseMxSocketFrame('ping')).toEqual([]);
    expect(mxMessageRows([{ kind: 0, created: 2 }, { kind: 0, created: 1 }]).map((r) => r.created)).toEqual([1, 2]);
    expect(mxMessageRows(null)).toEqual([]);
  });
  it('今月のファンランキング', () => {
    expect(parseMxRanking({ superfans: [{ name: 'A', score: 10 }, { score: 5 }, { name: 'B', score: 3 }] })).toEqual([
      { rank: 1, name: 'A', xp: 10, iconUrl: '' },
      { rank: 2, name: 'B', xp: 3, iconUrl: '' },
    ]);
  });
});

describe('配信キーとサービスの表', () => {
  it('mx.<番号>.<live_session_id>', () => {
    expect(buildMxStreamKey('5', { sessionId: 77 })).toBe('mx.5.77');
    expect(buildMxStreamKey('5')).toBe('');
    expect(isMxStreamKey('mx.5.77')).toBe(true);
    expect(mxUserIdOfStreamKey('mx.5.77')).toBe('5');
    expect(mxLiveUrl('5')).toBe('https://mixch.tv/u/5/live');
  });
  it('表から引ける', () => {
    expect(platformOfStreamKey('mx.5.77')).toBe(STREAM_PLATFORMS.mixch);
    expect(platformOfPersonKey('mx:11')).toBe(STREAM_PLATFORMS.mixch);
    expect(platformChannelOfUrl('https://mixch.tv/u/5/live')).toEqual({ platform: STREAM_PLATFORMS.mixch, login: '5' });
    expect(platformOfHostname('mixch.tv')).toBe(STREAM_PLATFORMS.mixch);
    expect(platformOfStreamKey('sr.room.1')).toBe(STREAM_PLATFORMS.showroom);
  });
});
