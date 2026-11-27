import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isTcUser,
  parseTcUserFromUrl,
  tcStreamServerUrl,
  tcTimeMs,
  safeTcImageUrl,
  parseTcStreamServer,
  parseTcPubSubUrl,
  parseTcSocketFrame,
  tcCommentListUrl,
  parseTcCommentList,
  parseTcEvent,
  tcGiftCountOfName,
  tcGiftScore,
  buildTcStreamKey,
  isTcStreamKey,
  tcUserOfStreamKey,
  tcUserUrl,
  isTcBroadcastScopedAnonPersonKey,
  isTcBroadcastScopedAnonComment,
  tcAnonPersonKeyFromName,
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

describe('ツイキャスの開く前のコメント(listall)', () => {
  it('ページ自身と同じ口の URL を作る(件数は1〜100・飛ばす数は0以上)', () => {
    expect(tcCommentListUrl('sktk_xx', '842879584', { n: 100, f: 200, nowMs: 5 })).toBe(
      'https://twitcasting.tv/sktk_xx/userajax.php?c=listall&m=842879584&n=100&f=200&k=0&format=json&__n=5',
    );
    expect(tcCommentListUrl('c:abzou_sub', '1', { n: 999, f: -3, nowMs: 5 })).toBe(
      'https://twitcasting.tv/c:abzou_sub/userajax.php?c=listall&m=1&n=100&f=0&k=0&format=json&__n=5',
    );
    expect(tcCommentListUrl('help', '1')).toBe('');
    expect(tcCommentListUrl('sktk_xx', 'abc')).toBe('');
  });
  it('応答の comments を取り出し、ソケットと同じ形として記録に変えられる(2026-11-16 実測の形)', () => {
    const json = {
      comments: [
        {
          type: 'comment',
          id: 33980687816,
          message: '何日働いた？',
          createdAt: 1794483729000,
          author: { id: 'c:tw2', name: '匿名コメント', screenName: 'c:tw2', profileImage: 'https://s01.twitcasting.tv/img/twitcas_guest2_64.jpg', grade: 0 },
          isAnonymous: true,
        },
        null,
        'x',
      ],
    };
    const rows = parseTcCommentList(json);
    expect(rows).toHaveLength(1);
    const r = parseTcEvent(rows[0], { user: 'sktk_xx' });
    expect(r?.id).toBe('tc-33980687816');
    expect(r?.text).toBe('何日働いた？');
    expect(r?.postedAtMs).toBe(1794483729000);
  });
  it('形が違えば空', () => {
    expect(parseTcCommentList(null)).toEqual([]);
    expect(parseTcCommentList({ comments: 'x' })).toEqual([]);
    expect(parseTcCommentList([])).toEqual([]);
  });
});

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');

describe('ツイキャス匿名の公式番号', () => {
  it('番号なしの匿名は従来どおり1つの席。c:tw* では分けない', () => {
    const a = parseTcEvent({ ...COMMENT, isAnonymous: true, author: { id: 'c:tw2', name: '匿名コメント', screenName: 'c:tw2' } }, { user: 'a' });
    const b = parseTcEvent({ ...COMMENT, author: { id: 'c:tw1', name: '匿名コメント', screenName: 'c:tw1' } }, { user: 'a' });
    expect(a).toMatchObject({ channelId: 'tc:n:匿名', name: '匿名コメント', login: '', badges: ['anonymous'] });
    expect(b?.channelId).toBe('tc:n:匿名');
    expect(tcAnonPersonKeyFromName('匿名コメント')).toBe('tc:n:匿名');
  });

  it('公式の「匿名コメント#N」だけを席に使う。同じ番号は同じ席、違う番号は別席、同じ c:tw でも分けない', () => {
    const a = parseTcEvent({ ...COMMENT, isAnonymous: true, id: 1, author: { id: 'c:tw3', name: '匿名コメント#1026', screenName: 'c:tw3' } }, { user: 'yuucho311' });
    const b = parseTcEvent({ ...COMMENT, isAnonymous: true, id: 2, author: { id: 'c:tw3', name: '匿名コメント#1138', screenName: 'c:tw3' } }, { user: 'yuucho311' });
    const c = parseTcEvent({ ...COMMENT, isAnonymous: true, id: 3, author: { id: 'c:tw1', name: '匿名コメント#1026', screenName: 'c:tw1' } }, { user: 'yuucho311' });
    expect(a).toMatchObject({ channelId: 'tc:n:匿名#1026', name: '匿名コメント#1026', login: '', badges: ['anonymous'] });
    expect(b).toMatchObject({ channelId: 'tc:n:匿名#1138', name: '匿名コメント#1138' });
    expect(c?.channelId).toBe('tc:n:匿名#1026');
    expect(isTcBroadcastScopedAnonPersonKey('tc:n:匿名#1026')).toBe(true);
    expect(isTcBroadcastScopedAnonPersonKey('tc:n:匿名')).toBe(true);
    expect(isTcBroadcastScopedAnonPersonKey('tc:en01_on')).toBe(false);
  });

  it('本物の c: ユーザー（c:twicas1986 等）を匿名と誤検出しない', () => {
    const r = parseTcEvent({ ...COMMENT, author: { id: 'c:twicas1986', name: 'メイ牛山', screenName: 'c:twicas1986' } }, { user: 'a' });
    expect(r).toMatchObject({ channelId: 'tc:c:twicas1986', name: 'メイ牛山', login: 'c:twicas1986' });
    expect(r?.badges).toEqual([]);
  });

  it('匿名ギフト（twitcastinguest）の席は変えない', () => {
    const r = parseTcEvent({ ...GIFT, sender: { id: 'twitcastinguest', name: '匿名さん', screenName: 'twitcastinguest' }, item: { name: '応援スター', showsSenderInfo: true }, score_items: [{ title: '🍡', text: '90' }] }, { user: 'a' });
    expect(r).toMatchObject({ channelId: 'tc:n:匿名', name: '匿名さん', login: '' });
  });

  it('実DOMフィクスチャ（86d0c67b6・c:yuucho311）の匿名は番号で分かれ、記名は個人キーのまま', () => {
    const raw = JSON.parse(readFileSync(join(FIXTURE_DIR, 'tc-anon-result.json'), 'utf8'));
    const htmlAnon = readFileSync(join(FIXTURE_DIR, 'anon-comments-5.html'), 'utf8');
    const htmlNamed = readFileSync(join(FIXTURE_DIR, 'named-comments-5.html'), 'utf8');
    expect(htmlAnon).toContain('匿名コメント#1026');
    expect(htmlNamed).toContain('en01_on');
    const anons = raw.anonComments.map((row) => parseTcEvent(row, { user: 'c:yuucho311' }));
    expect(anons.map((r) => r?.channelId)).toEqual([
      'tc:n:匿名#1026',
      'tc:n:匿名#1045',
      'tc:n:匿名#1138',
      'tc:n:匿名#1112',
      'tc:n:匿名#1104',
    ]);
    expect(anons.map((r) => r?.name)).toEqual([
      '匿名コメント#1026',
      '匿名コメント#1045',
      '匿名コメント#1138',
      '匿名コメント#1112',
      '匿名コメント#1104',
    ]);
    expect(new Set(anons.map((r) => r?.channelId)).size).toBe(5);
    // 3件が同じ c:tw3 でも席は番号で分かれる
    expect(anons.filter((r) => r && raw.anonComments[anons.indexOf(r)].author.id === 'c:tw3').map((r) => r.channelId)).toEqual([
      'tc:n:匿名#1026',
      'tc:n:匿名#1138',
      'tc:n:匿名#1104',
    ]);
    const named = raw.namedComments.map((row) => parseTcEvent(row, { user: 'c:yuucho311' }));
    expect(named[0]).toMatchObject({ channelId: 'tc:en01_on', name: 'えン', login: 'en01_on' });
    expect(named[1]).toMatchObject({ channelId: 'tc:17257vavivuvevo', name: '稲葉', login: '17257VAVIVUVEVO' });
    expect(named.every((r) => r && !r.badges.includes('anonymous'))).toBe(true);
    expect(isTcBroadcastScopedAnonComment(anons[0])).toBe(true);
    expect(isTcBroadcastScopedAnonComment(named[0])).toBe(false);
  });
});
