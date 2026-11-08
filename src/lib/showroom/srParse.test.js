import { describe, it, expect } from 'vitest';
import {
  parseSrRoomKeyFromUrl,
  srRoomStatusUrl,
  srLiveApiUrl,
  parseSrRoomStatus,
  parseSrLiveInfo,
  srSocketUrl,
  parseSrSocketFrame,
  parseSrGiftList,
  parseSrComment,
  parseSrGift,
  parseSrRanking,
  buildSrStreamKey,
  isSrStreamKey,
  srRoomKeyOfStreamKey,
  srRoomUrl,
  safeSrImageUrl,
  srAvatarUrl,
} from './srParse.js';
import { platformOfStreamKey, platformOfPersonKey, platformChannelOfUrl, platformOfHostname, STREAM_PLATFORMS } from '../platform/streamPlatform.js';

const GIFTS = parseSrGiftList({
  normal: [
    { gift_id: 1, gift_name: '星', point: 1, free: true, image: 'https://static.showroom-live.com/image/gift/1_s.png' },
    { gift_id: 1601, gift_name: 'ハート', point: 10, free: false, image: 'https://static.showroom-live.com/image/gift/1601_s.png' },
  ],
  enquete: [{ gift_id: 1501, gift_name: 'A', point: 0, free: true }],
});

describe('URL と口', () => {
  it('部屋のページから room_url_key', () => {
    expect(parseSrRoomKeyFromUrl('https://www.showroom-live.com/r/test_room')).toBe('test_room');
    expect(parseSrRoomKeyFromUrl('https://www.showroom-live.com/r/test.room/')).toBe('test.room');
    expect(parseSrRoomKeyFromUrl('https://www.showroom-live.com/onlive')).toBe('');
    expect(parseSrRoomKeyFromUrl('https://evil.example/r/x')).toBe('');
  });
  it('API の URL', () => {
    expect(srRoomStatusUrl('abc')).toBe('https://www.showroom-live.com/api/room/status?room_url_key=abc');
    expect(srLiveApiUrl('comment_log', '123')).toBe('https://www.showroom-live.com/api/live/comment_log?room_id=123');
    expect(srLiveApiUrl('comment_log', 'x')).toBe('');
    expect(srSocketUrl('online.showroom-live.com')).toBe('wss://online.showroom-live.com/');
    expect(srSocketUrl('evil.example')).toBe('');
  });
  it('画像', () => {
    expect(safeSrImageUrl('https://static.showroom-live.com/image/avatar/1.png')).toBeTruthy();
    expect(safeSrImageUrl('https://image.showroom-cdn.com/a.jpeg')).toBeTruthy();
    expect(safeSrImageUrl('http://static.showroom-live.com/a.png')).toBe('');
    expect(srAvatarUrl(1003)).toBe('https://static.showroom-live.com/image/avatar/1003.png');
    expect(srAvatarUrl('x')).toBe('');
  });
});

describe('部屋と配信', () => {
  it('room/status', () => {
    const st = parseSrRoomStatus({ room_id: 99, room_url_key: 'r1', live_id: 555, is_live: true, started_at: 1700000000, room_name: 'へや', broadcast_host: 'online.showroom-live.com', broadcast_key: '99:abc' });
    expect(st).toMatchObject({ roomId: '99', roomKey: 'r1', liveId: '555', isLive: true, startedAtMs: 1700000000000, roomName: 'へや', bcsvrKey: '99:abc' });
    expect(parseSrRoomStatus({ room_id: 99, live_id: 0, is_live: false })?.liveId).toBe('');
    expect(parseSrRoomStatus({})).toBe(null);
  });
  it('live_info', () => {
    expect(parseSrLiveInfo({ bcsvr_host: 'online.showroom-live.com', bcsvr_key: '99:abc', live_id: 555 })).toMatchObject({ bcsvrKey: '99:abc', liveId: '555' });
    expect(parseSrLiveInfo({ bcsvr_host: 'x y', bcsvr_key: 'k' })).toBe(null);
  });
  it('ソケットの1通', () => {
    expect(parseSrSocketFrame('MSG\t99:abc\t{"t":1,"cm":"a"}')).toEqual({ key: '99:abc', msg: { t: 1, cm: 'a' } });
    expect(parseSrSocketFrame('ACK\tshowroom')).toBe(null);
    expect(parseSrSocketFrame('MSG\tk\tnot json')).toBe(null);
  });
});

describe('コメントとギフト', () => {
  it('ソケットとログのコメントは同じ id になる', () => {
    const a = parseSrComment({ t: 1, u: 7, ac: 'ファン', cm: 'こんにちは', av: 1003, created_at: 1700000001 }, { roomId: '99' });
    const b = parseSrComment({ user_id: 7, name: 'ファン', comment: 'こんにちは', avatar_url: 'https://static.showroom-live.com/image/avatar/1003.png', created_at: 1700000001 }, { roomId: '99' });
    expect(a?.id).toBe(b?.id);
    expect(a).toMatchObject({ channelId: 'sr:7', name: 'ファン', kind: 'text', iconUrl: 'https://static.showroom-live.com/image/avatar/1003.png', postedAtMs: 1700000001000 });
    expect(parseSrComment({ u: 7, cm: '' }, { roomId: '99' })).toBe(null);
    expect(parseSrComment({ cm: 'a' }, { roomId: '99' })).toBe(null);
  });
  it('有料のギフトは pt(point × 個数)・無料は捨てる', () => {
    const g = parseSrGift({ t: 2, u: 8, ac: 'B', g: 1601, n: 3, av: 1, created_at: 1700000002 }, { roomId: '99', gifts: GIFTS });
    expect(g).toMatchObject({ kind: 'superchat', amount: 30, currency: 'SRPT', giftName: 'ハート', giftCount: 3, text: 'ハート ×3' });
    expect(parseSrGift({ t: 2, u: 8, g: 1, n: 10 }, { roomId: '99', gifts: GIFTS })).toEqual({ free: true });
    // 一覧に無いギフトは名前なし・pt 0 で残す
    expect(parseSrGift({ u: 8, g: 77777, n: 1 }, { roomId: '99', gifts: GIFTS })).toMatchObject({ kind: 'text', giftName: 'ギフト77777', amount: 0 });
    // ログの形(gift_id・num)も同じ id
    const l = parseSrGift({ user_id: 8, name: 'B', gift_id: 1601, num: 3, created_at: 1700000002 }, { roomId: '99', gifts: GIFTS });
    expect(l?.id).toBe(/** @type {any} */ (g).id);
  });
});

describe('順位', () => {
  it('summary_ranking を優先・無ければ stage_user_list', () => {
    expect(parseSrRanking({ ranking: [{ user_id: 1, name: 'A', point: 500, rank: 1 }, { name: '' }] })).toEqual([{ rank: 1, name: 'A', xp: 500, iconUrl: '' }]);
    expect(parseSrRanking({ ranking: [] }, { stage_user_list: [{ order_no: 1, rank: 1, user: { name: 'B', avatar_url: 'https://static.showroom-live.com/image/avatar/2.png' } }] })).toEqual([
      { rank: 1, name: 'B', xp: 0, iconUrl: 'https://static.showroom-live.com/image/avatar/2.png' },
    ]);
    expect(parseSrRanking(null, null)).toEqual([]);
  });
});

describe('配信キーとサービスの表', () => {
  it('sr.<room_url_key>.<live_id>', () => {
    expect(buildSrStreamKey('room.a', { liveId: '5' })).toBe('sr.room.a.5');
    expect(buildSrStreamKey('room', {})).toBe('');
    expect(isSrStreamKey('sr.room.a.5')).toBe(true);
    expect(srRoomKeyOfStreamKey('sr.room.a.5')).toBe('room.a');
    expect(srRoomUrl('room.a')).toBe('https://www.showroom-live.com/r/room.a');
  });
  it('表から引ける', () => {
    expect(platformOfStreamKey('sr.r1.5')).toBe(STREAM_PLATFORMS.showroom);
    expect(platformOfPersonKey('sr:7')).toBe(STREAM_PLATFORMS.showroom);
    expect(platformChannelOfUrl('https://www.showroom-live.com/r/r1')).toEqual({ platform: STREAM_PLATFORMS.showroom, login: 'r1' });
    expect(platformOfHostname('www.showroom-live.com')).toBe(STREAM_PLATFORMS.showroom);
    expect(platformOfStreamKey('ww.1.2')).toBe(STREAM_PLATFORMS.whowatch);
  });
});
