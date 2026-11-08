import { describe, it, expect } from 'vitest';
import {
  isWwLiveId,
  isWwUserPath,
  parseWwLiveIdFromUrl,
  wwLiveApiUrl,
  isWwApiUrl,
  wwTimeMs,
  safeWwImageUrl,
  parseWwLive,
  parseWwComment,
  parseWwItem,
  buildWwStreamKey,
  isWwStreamKey,
  wwLiveIdOfStreamKey,
  wwPageUrl,
} from './wwParse.js';
import { platformOfStreamKey, platformOfPersonKey, platformChannelOfUrl, platformOfHostname, STREAM_PLATFORMS } from '../platform/streamPlatform.js';

describe('ふわっちの URL', () => {
  it('視聴ページから配信の番号を取る', () => {
    expect(parseWwLiveIdFromUrl('https://whowatch.tv/viewer/12345678')).toBe('12345678');
    expect(parseWwLiveIdFromUrl('https://whowatch.tv/viewer/12345678/')).toBe('12345678');
    expect(parseWwLiveIdFromUrl('https://whowatch.tv/profile/w:abc')).toBe('');
    expect(parseWwLiveIdFromUrl('https://whowatch.tv/viewer/abc')).toBe('');
    expect(parseWwLiveIdFromUrl('https://evil.example/viewer/1')).toBe('');
    expect(parseWwLiveIdFromUrl('nope')).toBe('');
  });
  it('API の URL', () => {
    expect(wwLiveApiUrl('99')).toBe('https://api.whowatch.tv/lives/99?last_updated_at=0');
    expect(wwLiveApiUrl('99', 1700000000123)).toBe('https://api.whowatch.tv/lives/99?last_updated_at=1700000000123');
    expect(wwLiveApiUrl('x')).toBe('');
    expect(isWwApiUrl(wwLiveApiUrl('99', 5))).toBe(true);
    expect(isWwApiUrl('https://api.whowatch.tv/users/1')).toBe(false);
    expect(isWwApiUrl('https://api.whowatch.tv.evil.com/lives/1')).toBe(false);
  });
  it('番号と user_path の見分け', () => {
    expect(isWwLiveId('123')).toBe(true);
    expect(isWwLiveId('')).toBe(false);
    expect(isWwUserPath('w:abc')).toBe(true);
    expect(isWwUserPath('123')).toBe(false);
    expect(isWwUserPath('a/b')).toBe(false);
    expect(wwPageUrl('123')).toBe('https://whowatch.tv/viewer/123');
    expect(wwPageUrl('w:abc')).toBe('https://whowatch.tv/profile/w:abc');
    expect(wwPageUrl('')).toBe('');
  });
});

describe('時刻と画像', () => {
  it('秒でも ms でも ms にする', () => {
    expect(wwTimeMs(1700000000123)).toBe(1700000000123);
    expect(wwTimeMs(1700000000)).toBe(1700000000000);
    expect(wwTimeMs('2025-01-01T00:00:00Z')).toBe(Date.UTC(2025, 0, 1));
    expect(wwTimeMs(0)).toBe(0);
    expect(wwTimeMs('x')).toBe(0);
  });
  it('https のふわっちの画像だけ通す', () => {
    expect(safeWwImageUrl('https://img.whowatch.tv/user_files/1/icon.jpg')).toBe('https://img.whowatch.tv/user_files/1/icon.jpg');
    expect(safeWwImageUrl('https://d1.cloudfront.net/a.png')).toBe('https://d1.cloudfront.net/a.png');
    expect(safeWwImageUrl('http://img.whowatch.tv/a.jpg')).toBe('');
    expect(safeWwImageUrl('https://evil.com/a.jpg')).toBe('');
    expect(safeWwImageUrl('https://img.whowatch.tv/default_icon.png')).toBe('');
  });
});

const LIVE = {
  live: {
    id: 555,
    title: 'ざつだん',
    user: { id: 42, name: 'はいしんしゃ', user_path: 'w:host', icon_url: 'https://img.whowatch.tv/u/42.jpg' },
    started_at: 1700000000000,
    view_count: 120,
    total_view_count: 3000,
    comment_count: 50,
    live_status: 'PUBLISHING',
  },
  comments: [
    { id: 2, user: { id: 7, name: 'ファンB', user_path: 'w:fanb' }, message: 'こんばんは', posted_at: 1700000002000, comment_type: 'BY_PUBLIC' },
    { id: 1, user: { id: 8, name: 'ファンA', user_path: 'w:fana', icon_url: 'https://img.whowatch.tv/u/8.jpg' }, message: 'わこつ', posted_at: 1700000001000 },
  ],
  updated_at: 1700000002500,
};

describe('配信の情報', () => {
  it('形どおりの応答を読む', () => {
    const info = parseWwLive(LIVE, '555');
    expect(info?.liveId).toBe('555');
    expect(info?.title).toBe('ざつだん');
    expect(info?.user).toEqual({ id: '42', name: 'はいしんしゃ', userPath: 'w:host', iconUrl: 'https://img.whowatch.tv/u/42.jpg' });
    expect(info?.isLive).toBe(true);
    expect(info?.viewers).toBe(120);
    expect(info?.updatedAt).toBe(1700000002500);
    expect(info?.comments.length).toBe(2);
  });
  it('終わった配信を見分ける', () => {
    expect(parseWwLive({ live: { ...LIVE.live, live_status: 'FINISHED' } })?.isLive).toBe(false);
    expect(parseWwLive({ live: { ...LIVE.live, live_status: '', ended_at: 1700000009000 } })?.isLive).toBe(false);
    expect(parseWwLive({ live: { ...LIVE.live, live_status: 'UNKNOWN_X' } })?.isLive).toBe(null);
  });
  it('形が違えば null', () => {
    expect(parseWwLive(null)).toBe(null);
    expect(parseWwLive({})).toBe(null);
    expect(parseWwLive({ live: { title: 'x' } })).toBe(null);
    // 番号が応答に無くても、ページの番号で読む
    expect(parseWwLive({ comments: [], updated_at: 1 }, '9')?.liveId).toBe('9');
  });
});

describe('コメント', () => {
  it('普通のコメント → 記録の形', () => {
    const r = parseWwComment(LIVE.comments[1], { liveId: '555' });
    expect(r).toMatchObject({
      id: 'ww-1',
      channelId: 'ww:8',
      name: 'ファンA',
      login: 'w:fana',
      iconUrl: 'https://img.whowatch.tv/u/8.jpg',
      text: 'わこつ',
      kind: 'text',
      amount: 0,
      postedAtMs: 1700000001000,
      channel: '555',
    });
    expect(parseWwComment(LIVE.comments[0], { liveId: '555' })?.badges).toEqual([]);
  });
  it('アイテムは superchat(pt)にして名前と絵を持つ', () => {
    const c = { id: 3, user: { id: 9, name: 'ファンC' }, message: '', item_count: 3, item: { name: 'ハート', point: 100, image_url: 'https://img.whowatch.tv/items/heart.png' } };
    const r = parseWwComment(c, { liveId: '555' });
    expect(r).toMatchObject({ kind: 'superchat', amount: 300, currency: 'WWPT', giftName: 'ハート', giftImageUrl: 'https://img.whowatch.tv/items/heart.png', giftCount: 3, text: 'ハート ×3' });
    expect(parseWwItem({ play_item: { name: 'x' } })).toMatchObject({ name: 'x', totalPt: 0 });
    // 値段の分からないアイテムは本文として残す
    expect(parseWwComment({ id: 4, user: { id: 9 }, play_item: { name: 'スター' } }, { liveId: '1' })).toMatchObject({ kind: 'text', text: 'スター', giftName: 'スター' });
  });
  it('形が違う1件は捨てる', () => {
    expect(parseWwComment(null, { liveId: '1' })).toBe(null);
    expect(parseWwComment({ id: 1, message: 'x' }, { liveId: '1' })).toBe(null);
    expect(parseWwComment({ id: 1, user: { id: 2 }, message: '' }, { liveId: '1' })).toBe(null);
    expect(parseWwComment({ id: '../x', user: { id: 2 }, message: 'a' }, { liveId: '1' })).toBe(null);
  });
  it('名前が無い人も名無しにしない', () => {
    expect(parseWwComment({ id: 5, user: { id: 123456 }, message: 'a' }, { liveId: '1' })?.name).toBe('ふわっち3456');
  });
});

describe('配信キーとサービスの表', () => {
  it('ww.<番号>.<配信者>', () => {
    expect(buildWwStreamKey('555', { userId: 42 })).toBe('ww.555.42');
    expect(buildWwStreamKey('555')).toBe('ww.555.0');
    expect(buildWwStreamKey('x')).toBe('');
    expect(isWwStreamKey('ww.555.42')).toBe(true);
    expect(isWwStreamKey('ww.abc.42')).toBe(false);
    expect(wwLiveIdOfStreamKey('ww.555.42')).toBe('555');
  });
  it('表から引ける', () => {
    expect(platformOfStreamKey('ww.555.42')).toBe(STREAM_PLATFORMS.whowatch);
    expect(platformOfPersonKey('ww:8')).toBe(STREAM_PLATFORMS.whowatch);
    expect(platformChannelOfUrl('https://whowatch.tv/viewer/555')).toEqual({ platform: STREAM_PLATFORMS.whowatch, login: '555' });
    expect(platformOfHostname('whowatch.tv')).toBe(STREAM_PLATFORMS.whowatch);
    expect(STREAM_PLATFORMS.whowatch.channelUrl(STREAM_PLATFORMS.whowatch.loginOfStreamKey('ww.555.42'))).toBe('https://whowatch.tv/viewer/555');
    // ほかのサービスの鍵と取り違えない
    expect(platformOfStreamKey('kk.foo.1')).toBe(STREAM_PLATFORMS.kick);
    expect(platformOfPersonKey('kk:1')).toBe(STREAM_PLATFORMS.kick);
  });
});
