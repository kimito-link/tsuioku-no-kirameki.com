import { describe, it, expect } from 'vitest';
import {
  isTcUser,
  parseTcUserFromUrl,
  tcStreamServerUrl,
  tcTimeMs,
  safeTcImageUrl,
  parseTcStreamServer,
  parseTcPubSubUrl,
  parseTcSocketFrame,
  parseTcEvent,
  tcGiftCountOfName,
  tcGiftScore,
  buildTcStreamKey,
  isTcStreamKey,
  tcUserOfStreamKey,
  tcUserUrl,
} from './tcParse.js';
import { platformOfStreamKey, platformOfPersonKey, platformChannelOfUrl, platformOfHostname, placeholderStreamKeyForChannel, STREAM_PLATFORMS } from '../platform/streamPlatform.js';

describe('ツイキャスの URL', () => {
  it('配信者のページから user を取る(頭つきも・小文字に)', () => {
    expect(parseTcUserFromUrl('https://twitcasting.tv/twitcasting_jp')).toBe('twitcasting_jp');
    expect(parseTcUserFromUrl('https://twitcasting.tv/c:Abzou_Sub/')).toBe('c:abzou_sub');
    expect(parseTcUserFromUrl('https://twitcasting.tv/c%3Aabzou_sub')).toBe('c:abzou_sub');
    expect(parseTcUserFromUrl('https://twitcasting.tv/g:123456789012')).toBe('g:123456789012');
  });
  it('配信者のページでないものは空', () => {
    expect(parseTcUserFromUrl('https://twitcasting.tv/')).toBe('');
    expect(parseTcUserFromUrl('https://twitcasting.tv/indexcaslive.php')).toBe('');
    expect(parseTcUserFromUrl('https://twitcasting.tv/search')).toBe('');
    expect(parseTcUserFromUrl('https://twitcasting.tv/abc/movie/123')).toBe('');
    expect(parseTcUserFromUrl('https://evil.example/abc')).toBe('');
    expect(parseTcUserFromUrl('nope')).toBe('');
    expect(isTcUser('a.b')).toBe(false);
    expect(isTcUser('')).toBe(false);
  });
  it('配信中かを聞く URL', () => {
    expect(tcStreamServerUrl('c:abc')).toBe('https://twitcasting.tv/streamserver.php?target=c%3Aabc&mode=client&player=pc_web');
    expect(tcStreamServerUrl('../x')).toBe('');
    expect(tcUserUrl('C:Abc')).toBe('https://twitcasting.tv/c:abc');
  });
});

describe('時刻と画像', () => {
  it('ms・秒・文字', () => {
    expect(tcTimeMs(1731300000000)).toBe(1731300000000);
    expect(tcTimeMs(1731300000)).toBe(1731300000000);
    expect(tcTimeMs('2024-11-11T00:00:00Z')).toBe(Date.parse('2024-11-11T00:00:00Z'));
    expect(tcTimeMs(0)).toBe(0);
    expect(tcTimeMs('x')).toBe(0);
  });
  it('ツイキャスの画像置き場だけ・// で始まるものは https に', () => {
    expect(safeTcImageUrl('//imagegw03.twitcasting.tv/image3s/pbs.twimg.com/a.jpg')).toBe('https://imagegw03.twitcasting.tv/image3s/pbs.twimg.com/a.jpg');
    expect(safeTcImageUrl('https://pbs.twimg.com/profile_images/1/a.jpg')).toBe('https://pbs.twimg.com/profile_images/1/a.jpg');
    expect(safeTcImageUrl('http://twitcasting.tv/a.png')).toBe('');
    expect(safeTcImageUrl('https://evil.example/a.png')).toBe('');
    expect(safeTcImageUrl('javascript:alert(1)')).toBe('');
  });
});

describe('streamserver.php', () => {
  it('配信中なら movie id', () => {
    expect(parseTcStreamServer({ movie: { id: 842033018, live: true } })).toEqual({ movieId: '842033018', isLive: true });
  });
  it('配信していなければ live=false(前の配信の id があっても配信中にしない)', () => {
    expect(parseTcStreamServer({ movie: { id: 842033018, live: false } })).toEqual({ movieId: '842033018', isLive: false });
    expect(parseTcStreamServer({ movie: { id: 0, live: true } })).toEqual({ movieId: '', isLive: false });
  });
  it('形が違えば null', () => {
    expect(parseTcStreamServer({})).toBeNull();
    expect(parseTcStreamServer({ movie: { id: 1 } })).toBeNull();
    expect(parseTcStreamServer(null)).toBeNull();
  });
});

describe('eventpubsuburl.php', () => {
  const ok = 'wss://202-218-171-223.twitcasting.tv/event.pubsub/v1/streams/842033018/events?token=abc:::1731300000:xyz&n=0.5';
  it('ギフトも来るように gift=1 を足す', () => {
    const u = parseTcPubSubUrl({ url: ok });
    expect(u.startsWith('wss://202-218-171-223.twitcasting.tv/event.pubsub/v1/streams/842033018/events?')).toBe(true);
    expect(new URL(u).searchParams.get('gift')).toBe('1');
    expect(new URL(u).searchParams.get('token')).toBe('abc:::1731300000:xyz');
  });
  it('ツイキャスの wss でなければ空', () => {
    expect(parseTcPubSubUrl({ url: ok.replace('wss:', 'ws:') })).toBe('');
    expect(parseTcPubSubUrl({ url: 'wss://evil.example/event.pubsub/v1/streams/1/events' })).toBe('');
    expect(parseTcPubSubUrl({ url: 'wss://x.twitcasting.tv/other' })).toBe('');
    expect(parseTcPubSubUrl({})).toBe('');
    expect(parseTcPubSubUrl(null)).toBe('');
  });
});

describe('ソケットの1通', () => {
  it('配列も1件も読む・[] は空', () => {
    expect(parseTcSocketFrame('[]')).toEqual([]);
    expect(parseTcSocketFrame('[{"type":"comment"},{"type":"gift"}]')).toHaveLength(2);
    expect(parseTcSocketFrame('{"type":"comment"}')).toHaveLength(1);
    expect(parseTcSocketFrame('oops')).toEqual([]);
    expect(parseTcSocketFrame('[1, null, "x"]')).toEqual([]);
  });
});

const COMMENT = {
  type: 'comment',
  id: 31234567890,
  message: ' こんばんは\nいらっしゃい ',
  createdAt: 1731300000123,
  author: { id: 'c:viewer1', name: '視聴者1', screenName: 'c:viewer1', profileImage: 'https://imagegw02.twitcasting.tv/image3s/pbs.twimg.com/a.jpg', grade: 0 },
  numComments: 120,
};
const GIFT = {
  type: 'gift',
  id: 'a085f979.6af4ae1934c',
  message: 'いつも応援してます(+🍡20)',
  plainMessage: 'いつも応援してます',
  isPaidGift: true,
  item: { name: 'お茶ｘ10', image: 'https://twitcasting.tv/img/gift/tea10.png', showsSenderInfo: true },
  sender: { id: 'c:viewer2', name: '視聴者2', screenName: 'c:viewer2', profileImage: 'https://imagegw02.twitcasting.tv/x.jpg' },
  createdAt: 1731300001000,
  score_items: [{ title: '🍡', text: '20' }],
};

describe('コメント', () => {
  it('記録の形にする(人キーは screenName・本文の空白をまとめる)', () => {
    const r = parseTcEvent(COMMENT, { user: 'host_a' });
    expect(r).toMatchObject({
      id: 'tc-31234567890',
      channelId: 'tc:c:viewer1',
      name: '視聴者1',
      login: 'c:viewer1',
      text: 'こんばんは いらっしゃい',
      kind: 'text',
      amount: 0,
      postedAtMs: 1731300000123,
      channel: 'host_a',
    });
    expect(r?.iconUrl).toBe('https://imagegw02.twitcasting.tv/image3s/pbs.twimg.com/a.jpg');
    expect(platformOfPersonKey(r?.channelId)?.id).toBe('twitcasting');
  });
  it('本文が無い・人が無い・id が変なものは捨てる', () => {
    expect(parseTcEvent({ ...COMMENT, message: '  ' }, { user: 'a' })).toBeNull();
    expect(parseTcEvent({ ...COMMENT, author: null }, { user: 'a' })).toBeNull();
    expect(parseTcEvent({ ...COMMENT, id: 'a b' }, { user: 'a' })).toBeNull();
    expect(parseTcEvent({ ...COMMENT, type: 'update_comment' }, { user: 'a' })).toBeNull();
  });
  it('匿名コメント(c:tw1 などを大勢で使う)は1つの席に', () => {
    const r = parseTcEvent({ ...COMMENT, isAnonymous: true, author: { id: 'c:tw3', name: '匿名コメント', screenName: 'c:tw3', profileImage: 'https://imagegw02.twitcasting.tv/a.jpg' } }, { user: 'a' });
    expect(r).toMatchObject({ channelId: 'tc:n:匿名', name: '匿名コメント', login: '', iconUrl: '' });
    expect(parseTcEvent({ ...COMMENT, author: { id: 'c:tw1', name: 'x', screenName: 'c:tw1' } }, { user: 'a' })?.channelId).toBe('tc:n:匿名');
  });
  it('時刻が無ければ今', () => {
    const r = parseTcEvent({ ...COMMENT, createdAt: undefined }, { user: 'a', nowMs: 1700000000000 });
    expect(r?.postedAtMs).toBe(1700000000000);
  });
});

describe('ギフト', () => {
  it('数はページに出ている 🍡・贈った人の言葉を本文に・個数は名前から', () => {
    const r = parseTcEvent(GIFT, { user: 'host_a' });
    expect(r).toMatchObject({
      id: 'tc-g-a085f979.6af4ae1934c',
      channelId: 'tc:c:viewer2',
      text: 'いつも応援してます',
      kind: 'superchat',
      amount: 20,
      currency: 'TCSCORE',
      giftName: 'お茶ｘ10',
      giftImageUrl: 'https://twitcasting.tv/img/gift/tea10.png',
      giftCount: 10,
      badges: ['paid'],
    });
  });
  it('言葉が無ければアイテムの名前', () => {
    expect(parseTcEvent({ ...GIFT, plainMessage: '', item: { name: 'お茶', showsSenderInfo: true } }, { user: 'a' })).toMatchObject({ text: 'お茶', amount: 20 });
  });
  it('匿名さんは1つの席に', () => {
    const r = parseTcEvent({ ...GIFT, sender: { id: 'twitcastinguest', name: '匿名さん', screenName: 'twitcastinguest' }, item: { name: '応援スター', showsSenderInfo: true }, score_items: [{ title: '🍡', text: '90' }] }, { user: 'a' });
    expect(r).toMatchObject({ channelId: 'tc:n:匿名', name: '匿名さん', login: '', amount: 90 });
    expect(parseTcEvent({ ...GIFT, sender: null }, { user: 'a' })).toMatchObject({ channelId: 'tc:n:匿名', name: '匿名さん' });
  });
  it('配信者のスコアのお知らせ(showsSenderInfo=false)は記録しない', () => {
    expect(parseTcEvent({ ...GIFT, item: { name: '', showsSenderInfo: false } }, { user: 'a' })).toBeNull();
    expect(parseTcEvent({ ...GIFT, item: { name: 'スコア', showsSenderInfo: false } }, { user: 'a' })).toBeNull();
  });
  it('有料ギフトは 🍡 が ✨ で数が無い → 0(名前は残す)', () => {
    const r = parseTcEvent({ ...GIFT, isPaidGift: true, message: '', item: { name: 'お茶爆100', showsSenderInfo: true }, score_items: [{ title: '🍡', text: '✨' }] }, { user: 'a' });
    expect(r).toMatchObject({ kind: 'superchat', amount: 0, giftName: 'お茶爆100', badges: ['paid'] });
  });
  it('🍡の読み方', () => {
    expect(tcGiftScore({ score_items: [{ title: '🍡', text: '1,200' }] })).toBe(1200);
    expect(tcGiftScore({ score_items: [], message: 'がんばれ(+🍡90)' })).toBe(90);
    expect(tcGiftScore({ score_items: [{ title: '⭐', text: '5' }] })).toBe(0);
    expect(tcGiftScore({})).toBe(0);
  });
  it('個数の読み方', () => {
    expect(tcGiftCountOfName('お茶ｘ10')).toBe(10);
    expect(tcGiftCountOfName('お茶x３')).toBe(3);
    expect(tcGiftCountOfName('おもいで日記爆100')).toBe(1);
    expect(tcGiftCountOfName('コンティニューコイン')).toBe(1);
  });
});

describe('配信キーとサービスの表', () => {
  it('tc.<user>.<movie id>', () => {
    const k = buildTcStreamKey('C:Abc', { movieId: '842033018' });
    expect(k).toBe('tc.c:abc.842033018');
    expect(isTcStreamKey(k)).toBe(true);
    expect(tcUserOfStreamKey(k)).toBe('c:abc');
    expect(buildTcStreamKey('abc', { movieId: 'x' })).toBe('');
    expect(isTcStreamKey('tc.search.1')).toBe(false);
  });
  it('表から引ける', () => {
    expect(platformOfStreamKey('tc.abc.842033018')?.id).toBe('twitcasting');
    expect(platformChannelOfUrl('https://twitcasting.tv/c:abc')).toEqual({ platform: STREAM_PLATFORMS.twitcasting, login: 'c:abc' });
    expect(platformOfHostname('twitcasting.tv')?.id).toBe('twitcasting');
    expect(placeholderStreamKeyForChannel(STREAM_PLATFORMS.twitcasting, 'c:abc')).toBe('tc.c:abc.00000');
    // ほかのサービスのキーと取り違えない
    expect(platformOfStreamKey('tw.abc.123')?.id).toBe('twitch');
  });
});
