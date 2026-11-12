import { describe, it, expect } from 'vitest';
import {
  parseMxUserIdFromUrl,
  mxIconFromRaw,
  mxIconsFromRanking,
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
    expect(mxItemsUrls('99')[0]).toBe('https://mixch.tv/items/available?live_session_id=99');
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
  const items = parseMxItems({ items: [{ id: 501, price: 100, resource_id: 376, url: 'https://mixch.tv/p/gk26o21v' }, { id: 'x' }] });
  it('アイテムの一覧', () => {
    expect(items.size).toBe(1);
    // url はページへのリンクなので絵にしない。絵は resource_id から引く
    expect(items.get('501')).toEqual({ price: 100, resourceId: '376', imageUrl: '' });
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

describe('ギフトの絵(資源の index.json → file → preview・2026-11-08 PC 実測の形)', () => {
  it('土台 + file / 土台 + preview。形の違う・外へ出る値は捨てる', async () => {
    const { parseMxResourceIndex, mxResourcePreviewUrl, MX_RES_BASE } = await import('./mxParse.js');
    const idx = parseMxResourceIndex({
      resources: [
        { id: 1, file: '/scom_thunder/single.json' },
        { id: 376, file: '/scom_mikkuma_10000/scom_mikkuma_10000.json' },
        { id: 2, file: '../x.json' },
        { id: 3, file: 'https://evil.example/a.json' },
        { id: 4, file: '/a/b.png' },
      ],
    });
    expect([...idx.keys()]).toEqual(['1', '376']);
    expect(idx.get('1')).toBe(`${MX_RES_BASE}/scom_thunder/single.json`);
    expect(mxResourcePreviewUrl({ preview: '/scom_thunder/thumbThunderLv1.png' })).toBe(
      'https://d2uqarpmf42qy0.cloudfront.net/torte_web_resources/scom_thunder/thumbThunderLv1.png',
    );
    expect(mxResourcePreviewUrl({ preview: '//evil.example/a.png' })).toBe('');
    expect(mxResourcePreviewUrl({ preview: '/a/../b.png' })).toBe('');
    expect(mxResourcePreviewUrl({})).toBe('');
  });
});

describe('mxIconFromRaw / mxIconsFromRanking(コメントにはアイコンが来ない・2026-11-12 PC 実測)', () => {
  const ICON = 'https://d2jtsb989t238a.cloudfront.net/u/7.jpg';
  it('コメント(kind 0)の実測の形にはアイコンが無い→帳面には何も足さない', () => {
    const comment = { body: 'こんばんわ', created: 1762950000, kind: 0, level: 3, message_id: 'abc', name: 'りんく', superfan_rank: 0, user_id: 7, vip_rank: { rank: 0, rank_group: 0 } };
    expect(mxIconFromRaw(comment)).toBeNull();
    expect(parseMxMessage(comment, { userId: '5' })?.iconUrl).toBe('');
  });
  it('ギフトの行からは user_id とアイコンを覚える・匿名と許していない置き場は覚えない', () => {
    expect(mxIconFromRaw({ kind: 45, user_id: 7, profile_image_url: ICON, anonymous: 0 })).toEqual(['7', ICON]);
    expect(mxIconFromRaw({ kind: 45, user_id: 7, profile_image_url: ICON, anonymous: 1 })).toBeNull();
    expect(mxIconFromRaw({ kind: 45, user_id: 7, profile_image_url: 'https://evil.example/x.jpg' })).toBeNull();
    expect(mxIconFromRaw({ kind: 45, user_id: 7, profile_image_url: '' })).toBeNull();
  });
  it('ファンランキングは人の番号が id(user_id ではない)', () => {
    const m = mxIconsFromRanking({ superfans: [{ id: 7, name: 'りんく', profile_image_url: ICON, score: 10 }, { id: 8, name: 'x', profile_image_url: '' }, null] });
    expect([...m]).toEqual([['7', ICON]]);
    expect(mxIconsFromRanking(null).size).toBe(0);
  });
});
