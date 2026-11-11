import { describe, it, expect } from 'vitest';
import {
  parseAbLoginFromUrl,
  abPageUrl,
  buildAbStreamKey,
  isAbStreamKey,
  abLoginOfStreamKey,
  abSessionOfChatId,
  safeAbImageUrl,
  isAbCommentUrl,
  abCommentWindowFromUrl,
  abChatIdFromUrl,
  parseAbCommentBatch,
  parseAbProgramMeta,
  abMessagesNearPlayhead,
  abCommentRow,
  enqueueAbMainBacklog,
  shrinkAbPayload,
  abChannelLogoUrl,
  abLinearChannelId,
  abUrlsFromCss,
  abUrlsFromSrcset,
  isAbBroadcastJsonUrl,
  abPayloadNotices,
  abAudienceFromPayload,
  abOnAirSlotStats,
  abViewCounterText,
  abCompactCount,
  abPreferViewCount,
  abCounterValue,
  abChannelNameText,
  abChannelNameFromTitle,
  pickAbBroadcasterImage,
} from './abParse.js';
import { ytIconForNumericUid, ytSummaryToNicoSnapshot } from '../../../extension-youtube/src/ytNicoShim.js';
import { resolveBroadcasterFollowTarget } from '../broadcasterFollowTarget.js';
import { platformOfStreamKey, platformChannelOfUrl, platformOfHostname, placeholderStreamKeyForChannel, STREAM_PLATFORMS } from '../platform/streamPlatform.js';

/** 2025-07 公開観測の chats/messages(値は合成)。表示名は応答に無いことがある */
const FIXTURE_CHAT_MESSAGES = {
  messages: [
    { arin: 'msg-aaa111', chatArin: 'abm1.chat.chat.program1', userId: 'abcd1234', kind: 1, body: 'こんにちは', elapsedMs: 3_500_000 },
    { arin: 'msg-bbb222', chatArin: 'abm1.chat.chat.program1', userId: 'efgh5678', kind: 1, body: 'いまここ', elapsedMs: 3_619_000, userName: '視聴サンプル', iconUrl: 'https://hayabusa.io/abema/user/abcd.jpg' },
    { arin: 'msg-old333', chatArin: 'abm1.chat.chat.program1', userId: 'ijkl9012', kind: 1, body: 'ずっと前', elapsedMs: 1_000 },
    { arin: 'msg-empty', chatArin: 'abm1.chat.chat.program1', userId: 'abcd1234', kind: 1, body: '   ' },
    { arin: 'msg-noname', chatArin: 'abm1.chat.chat.program1', userId: '', kind: 1, body: '誰' },
  ],
  count: 5,
  pollingInterval: 5,
  isPolling: true,
};

/** それより前の slots/comments */
const FIXTURE_SLOT_COMMENTS = {
  comments: [
    { id: 'cmt100', message: 'スロットのコメント', userId: 'mnop3456', elapsedMs: 10_000, createdAtMs: 1_700_000_000_000 },
    { id: 'cmt101', message: '', userId: 'mnop3456' },
  ],
};

describe('ABEMA のページ', () => {
  it('4 種類の放送ページを login にでき、元の URL に戻せる', () => {
    const cases = [
      ['https://abema.tv/now-on-air/abema-news', 'n-abema-news'],
      ['https://abema.tv/live-event/ev123abc/', 'e-ev123abc'],
      ['https://abema.tv/video/episode/194-25_s2_p1?t=1', 'p-194-25_s2_p1'],
      ['https://www.abema.tv/channels/anime-live2/slots/E8tvAnMJ7a9a5d', 's-anime-live2__e8tvanmj7a9a5d'],
    ];
    for (const [url, login] of cases) {
      expect(parseAbLoginFromUrl(url), url).toBe(login);
      expect(parseAbLoginFromUrl(abPageUrl(login)), url).toBe(login);
    }
  });
  it('トップ・番組表・別ホストは放送ページではない', () => {
    expect(parseAbLoginFromUrl('https://abema.tv/')).toBe('');
    expect(parseAbLoginFromUrl('https://abema.tv/timetable')).toBe('');
    expect(parseAbLoginFromUrl('https://abema.tv/search?q=news')).toBe('');
    expect(parseAbLoginFromUrl('https://abema.tv.evil.example/now-on-air/abema-news')).toBe('');
  });
});

describe('ABEMA のコメント JSON', () => {
  it('messages の形を読み、空の本文と利用者 ID の無い行は捨てる', () => {
    const batch = parseAbCommentBatch(FIXTURE_CHAT_MESSAGES);
    expect(batch?.isPolling).toBe(true);
    expect(batch?.pollingIntervalSec).toBe(5);
    expect(batch?.chatId).toBe('program1');
    expect(batch?.messages.map((m) => m.text)).toEqual(['こんにちは', 'いまここ', 'ずっと前']);
    expect(batch?.messages[0].name).toBe('abcd1234');
    expect(batch?.messages[1].name).toBe('視聴サンプル');
    expect(batch?.messages[1].iconUrl).toContain('hayabusa.io');
  });
  it('本文へ空白は足さない。届いた字のまま残す', () => {
    const plain = parseAbCommentBatch({ messages: [{ userId: 'abcd1234', message: '無敵の笑顔で荒らす' }] });
    expect(plain?.messages[0].text).toBe('無敵の笑顔で荒らす');
    const spaced = parseAbCommentBatch({ messages: [{ userId: 'abcd1234', message: '無 敵の笑 顔で' }] });
    expect(spaced?.messages[0].text).toBe('無 敵の笑 顔で');
  });
  it('comments の形も読む', () => {
    const batch = parseAbCommentBatch(FIXTURE_SLOT_COMMENTS);
    expect(batch?.messages).toHaveLength(1);
    expect(batch?.messages[0].text).toBe('スロットのコメント');
    expect(batch?.messages[0].key).toBe('cmt100');
  });
  it('知らない形は null。コメントの束は番組情報にしない', () => {
    expect(parseAbCommentBatch(null)).toBe(null);
    expect(parseAbCommentBatch({ ok: true })).toBe(null);
    expect(parseAbCommentBatch({ messages: [] })?.messages).toEqual([]);
    expect(shrinkAbPayload({ messages: [] })).toBe(null);
    expect(parseAbProgramMeta(FIXTURE_CHAT_MESSAGES)).toBe(null);
  });
  it('広い窓もコメントは全部残し、読み上げは新しい端の 20 秒だけ', () => {
    const batch = parseAbCommentBatch(FIXTURE_CHAT_MESSAGES);
    const wide = abMessagesNearPlayhead(batch.messages, { sinceMs: 3_620_000, untilMs: 0 });
    expect(wide.map((m) => m.text)).toEqual(['ずっと前', 'こんにちは', 'いまここ']);
    expect(wide.filter((m) => m.speak).map((m) => m.text)).toEqual(['いまここ']);
    const tight = abMessagesNearPlayhead(batch.messages, { sinceMs: 12_000, untilMs: 0 });
    expect(tight).toHaveLength(3);
    expect(tight.every((m) => m.speak)).toBe(true);
  });
  it('時刻の無い新しい順の束は先頭 20 件まで残す', () => {
    const messages = Array.from({ length: 30 }, (_, i) => ({ elapsedMs: null, createdAtMs: null, text: String(i) }));
    expect(abMessagesNearPlayhead(messages).map((m) => m.text)).toEqual(messages.slice(0, 20).map((m) => m.text));
    expect(abMessagesNearPlayhead(messages.slice(0, 5))).toHaveLength(5);
  });
  it('since だけが古い端のときも一覧は残し、読み上げは新しい端に合わせる', () => {
    const batch = parseAbCommentBatch(FIXTURE_CHAT_MESSAGES);
    const near = abMessagesNearPlayhead(batch.messages, { sinceMs: 0 });
    expect(near.map((m) => m.text)).toEqual(['ずっと前', 'こんにちは', 'いまここ']);
    expect(near.filter((m) => m.speak).map((m) => m.text)).toEqual(['いまここ']);
  });
  it('記録の 1 件は人の ID と本文を持ち、リンク用の login は空', () => {
    const batch = parseAbCommentBatch({ data: { messages: FIXTURE_CHAT_MESSAGES.messages, isPolling: true } });
    const row = abCommentRow(batch.messages[1], { pageLogin: 'n-abema-news', nowMs: 1_700_000_000_000 });
    expect(row.channelId).toBe('ab:efgh5678');
    expect(row.login).toBe('');
    expect(row.kind).toBe('text');
    expect(row.postedAtMs).toBe(1_700_000_000_000);
    expect(row.skipVoice).toBe(false);
    expect(row.id.startsWith('ab-')).toBe(true);
  });
  it('実測の comments は新しい順。1時間分も残し、続きの1件も足す', () => {
    const newest = 1_794_364_815_754;
    const id = 'abm1.chat.chat.11111111-1111-4111-8111-111111111111.01ARZ3NDEKTSV4RRFFQ69G5FAV';
    const comments = [
      { id, message: 'いま', createdAtMs: newest, userId: 'A2AmVn58ed3nrb' },
      { id: `${id}b`, message: '20秒前', createdAtMs: newest - 15_000, userId: 'B3BmWn69fe4osc' },
      { id: `${id}c`, message: '2分前', createdAtMs: newest - 120_000, userId: 'C4CnXo70gf5ptd' },
    ];
    for (let i = 0; i < 97; i += 1) {
      comments.push({
        id: `${id}${i}`,
        message: `むかし${i}`,
        createdAtMs: newest - 180_000 - i * 1000,
        userId: 'D5DoYp81hg6que',
      });
    }
    const batch = parseAbCommentBatch({ comments });
    expect(batch?.messages[0].name).toBe('A2AmVn58ed3nrb');
    expect(batch?.messages[0].iconUrl).toBe('');
    expect(batch?.messages[0].createdAtMs).toBe(newest);
    expect(batch?.messages[0].key).toBe(id);
    const first = abMessagesNearPlayhead(batch?.messages, {});
    expect(first).toHaveLength(100);
    expect(first.slice(-2).map((m) => m.text)).toEqual(['20秒前', 'いま']);
    expect(first.filter((m) => m.speak).map((m) => m.text)).toEqual(['20秒前', 'いま']);
    expect(first.find((m) => m.text === '2分前')?.speak).toBe(false);
    const spoken = abCommentRow(first.find((m) => m.text === 'いま'), { pageLogin: 'n-isekai-anime-3', nowMs: newest + 60_000 });
    const quiet = abCommentRow(first.find((m) => m.text === '2分前'), { pageLogin: 'n-isekai-anime-3', nowMs: newest + 60_000 });
    expect(spoken?.skipVoice).toBe(false);
    expect(spoken?.postedAtMs).toBe(newest);
    expect(quiet?.skipVoice).toBe(true);
    expect(quiet?.postedAtMs).toBe(newest - 120_000);
    const live = abMessagesNearPlayhead(batch?.messages, { sinceMs: newest });
    expect(live).toHaveLength(100);
    expect(live.filter((m) => m.speak).map((m) => m.text)).toEqual(['20秒前', 'いま']);
    const next = parseAbCommentBatch({
      comments: [{ id: `${id}n`, message: 'つぎ', createdAtMs: newest + 4_000, userId: 'A2AmVn58ed3nrb' }],
    });
    const followed = abMessagesNearPlayhead(next?.messages, { sinceMs: newest });
    expect(followed.map((m) => m.text)).toEqual(['つぎ']);
    expect(followed[0].speak).toBe(true);
    const shrunk = shrinkAbPayload({ comments });
    expect(shrunk.messages[0].createdAtMs).toBe(newest);
    expect(JSON.stringify(shrunk)).not.toContain('A2AmVn58ed3nrb-secret');
  });
  it('視聴数だけの応答はコメントにしない', () => {
    const stats = { stats: { view: 11580, comment: 580 } };
    expect(parseAbCommentBatch(stats)).toBe(null);
    expect(parseAbProgramMeta(stats)).toBe(null);
    expect(shrinkAbPayload(stats)).toBe(null);
    const notice = abPayloadNotices(stats);
    expect(notice.batch).toBe(null);
    expect(notice.meta.views).toBe(11580);
    expect(notice.meta.comments).toBe(580);
    expect(notice.meta.concurrent).toBe(null);
    expect(abAudienceFromPayload({ concurrentViewers: 40, viewCount: 37000 }).concurrent).toBe(40);
    expect(abAudienceFromPayload({ concurrentViewers: 40, viewCount: 37000 }).views).toBe(37000);
    expect(abCompactCount('3.7万')).toBe(37000);
    expect(abCompactCount('3,662')).toBe(null);
    expect(abPreferViewCount(37821, 37000)).toBe(37821);
    expect(abPreferViewCount(500, 37000)).toBe(37000);
    expect(isAbBroadcastJsonUrl('https://api.p-c3-e.abema-tv.com/v1/broadcast/slots/abc/stats')).toBe(true);
    expect(abViewCounterText('48,027')).toBe(48027);
    expect(abViewCounterText('4.8万')).toBe(48000);
    expect(abViewCounterText('コメント 865')).toBe(null);
  });
  it('画面の数は title の正確な数を使う（2026-11-11 PC 実測: 表示「2.1 万」・title="21139"）', () => {
    expect(abCounterValue('21139', '2.1 万')).toBe(21139);
    expect(abCounterValue('1707', '1,707')).toBe(1707);
    expect(abCounterValue('', '2.1 万')).toBe(21000);
    expect(abCounterValue(null, '')).toBe(null);
    expect(abCounterValue('abc', 'コメント')).toBe(null);
  });
  it('チャンネル名はロゴの alt かページタイトルの頭（番組名やタイトル全体にしない）', () => {
    expect(abChannelNameText('将棋チャンネル')).toBe('将棋チャンネル');
    expect(abChannelNameText('ABEMA')).toBe('');
    expect(abChannelNameText('')).toBe('');
    expect(abChannelNameFromTitle('将棋チャンネル | 速報や中継を無料で生放送中 | ABEMA')).toBe('将棋チャンネル');
    expect(abChannelNameFromTitle('【再】ヒューリック杯棋聖戦 | ABEMA')).toBe('');
    expect(abChannelNameFromTitle('ABEMA')).toBe('');
  });
  it('番組表では放送中の枠の視聴数を使い、次の枠の空の stats は使わない', () => {
    const now = Date.now();
    const start = Math.floor(now / 1000) - 120;
    const end = Math.floor(now / 1000) + 3600;
    const raw = {
      slots: [
        { id: 'next', channelId: 'shogi', startAt: end, endAt: end + 3600, stats: {} },
        { id: 'now', channelId: 'shogi', startAt: start, endAt: end, stats: { view: 48027, comment: 4920 } },
        { id: 'other', channelId: 'drama-2', startAt: start, endAt: end, stats: { view: 695, comment: 2 } },
      ],
    };
    const rows = abOnAirSlotStats(raw, now);
    expect(rows.find((r) => r.channelId === 'shogi')?.views).toBe(48027);
    expect(rows.find((r) => r.channelId === 'shogi')?.startedAtMs).toBe(start * 1000);
    expect(rows.find((r) => r.channelId === 'drama-2')?.views).toBe(695);
    const notice = abPayloadNotices(raw);
    expect(notice?.meta?.views).toBe(null);
    expect(notice?.meta?.slotRows?.find((r) => r.channelId === 'shogi')?.views).toBe(48027);
  });
  it('hello までの控えは、番組情報で最初のコメント一覧を押し出さない', () => {
    let q = [];
    for (let i = 0; i < 40; i += 1) q = enqueueAbMainBacklog(q, { t: 'meta', meta: { title: `番組${i}` } });
    q = enqueueAbMainBacklog(q, { t: 'batch', body: { messages: [{ text: 'お尻が見えん' }, { text: 'ここ平和そう' }] } });
    for (let i = 0; i < 40; i += 1) q = enqueueAbMainBacklog(q, { t: 'meta', meta: { title: `あと${i}` } });
    const batches = q.filter((m) => m.t === 'batch');
    expect(batches).toHaveLength(1);
    expect(batches[0].body.messages).toHaveLength(2);
    expect(q.length).toBeLessThanOrEqual(40);
    let many = [];
    for (let i = 0; i < 9; i += 1) many = enqueueAbMainBacklog(many, { t: 'batch', body: { messages: [{ text: String(i) }] } });
    expect(many.map((m) => m.body.messages[0].text)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
  });
  it('縮めた JSON に認可や知らない欄は残さない', () => {
    const shrunk = shrinkAbPayload({ ...FIXTURE_CHAT_MESSAGES, authorization: 'secret', token: 'nope' });
    expect(shrunk.authorization).toBeUndefined();
    expect(shrunk.token).toBeUndefined();
    expect(shrunk.messages).toHaveLength(3);
    expect(JSON.stringify(shrunk)).not.toContain('secret');
  });
});

describe('ABEMA の番組情報と URL', () => {
  it('slot の題と開始時刻(秒)と視聴数', () => {
    const meta = parseAbProgramMeta({ slot: { title: '朝のニュース | ABEMA', startAt: 1_700_000_000, viewers: 1200 } });
    expect(meta.title).toBe('朝のニュース');
    expect(meta.startedAtMs).toBe(1_700_000_000_000);
    expect(meta.viewers).toBe(1200);
  });
  it('視聴数が無いときは null。0 は欄があるときだけ', () => {
    expect(parseAbProgramMeta({ event: { title: '特番' } }).viewers).toBe(null);
    expect(parseAbProgramMeta({ event: { title: '特番', viewers: 0 } }).viewers).toBe(0);
  });
  it('コメントの口だけ URL とみなす', () => {
    expect(isAbCommentUrl('https://api.p-c3-e.abema-tv.com/v1/chats/program1/messages?since=10&until=0')).toBe(true);
    expect(abCommentWindowFromUrl('https://api.p-c3-e.abema-tv.com/v1/chats/program1/messages?since=10&until=0')).toEqual({ sinceMs: 10, untilMs: 0 });
    expect(isAbCommentUrl('https://abema.tv/now-on-air/abema-news')).toBe(false);
    expect(isAbCommentUrl('https://evil.example/v1/chats/x/messages')).toBe(false);
  });
  it('チャット id の末尾がセッションになる', () => {
    expect(abSessionOfChatId('abm1.chat.chat.program1')).toBe('program1');
    expect(abChatIdFromUrl('https://api.p-c3-e.abema-tv.com/v1/slots/E8tvAnMJ7a9a5d/comments?limit=100')).toBe('e8tvanmj7a9a5d');
    expect(abChatIdFromUrl('https://api.p-c3-e.abema-tv.com/v1/slots/E8tvAnMJ7a9a5d/comments?since=1794364815754&limit=100')).toBe('e8tvanmj7a9a5d');
    expect(buildAbStreamKey('n-abema-news', { chatId: 'abm1.chat.chat.program1' })).toBe('ab.n-abema-news.program1');
    expect(isAbStreamKey('ab.n-abema-news.00000')).toBe(true);
    expect(abLoginOfStreamKey('ab.n-abema-news.program1')).toBe('n-abema-news');
  });
  it('配信者カードはチャンネル画像。コメントの顔は空のまま', () => {
    const logo = 'https://image.p-c2-x.abema-tv.com/image/channels/abema-news/logo.png?format=png&width=320&height=320';
    const og = 'https://image.p-c2-x.abema-tv.com/image/programs/p1/thumb001.png';
    expect(pickAbBroadcasterImage({
      login: 'n-abema-news',
      images: [og, logo],
      metas: [{ property: 'og:image', content: og }],
    })).toBe(logo);
    expect(pickAbBroadcasterImage({
      login: 'n-shogi',
      metas: [{ property: 'og:image', content: og }],
    })).toBe(abChannelLogoUrl('n-shogi'));
    expect(pickAbBroadcasterImage({
      login: 'e-event1',
      metas: [{ property: 'og:image', content: og }],
    })).toBe(og);
    expect(pickAbBroadcasterImage({
      login: 'e-event1',
      metas: [{ property: 'og:image', content: 'https://evil.example/a.jpg' }],
    })).toBe('');
    expect(pickAbBroadcasterImage({ login: 'n-abema-news' })).toBe(logo);
    expect(abChannelLogoUrl('e-event1')).toBe('');
    expect(abChannelLogoUrl('n-shogi')).toContain('/channels/shogi/logo.png');
    expect(abLinearChannelId('s-abema-news__slot1')).toBe('abema-news');
    expect(abChannelLogoUrl('s-abema-news__slot1')).toBe(logo);
    expect(abUrlsFromCss('background-image:url("https://image.p-c2-x.abema-tv.com/image/channels/shogi/logo.png")')).toEqual([
      'https://image.p-c2-x.abema-tv.com/image/channels/shogi/logo.png',
    ]);
    expect(abUrlsFromSrcset('https://image.p-c2-x.abema-tv.com/image/channels/shogi/logo.png 320w, https://evil.example/a.png 640w')).toEqual([
      'https://image.p-c2-x.abema-tv.com/image/channels/shogi/logo.png',
    ]);
    expect(isAbBroadcastJsonUrl('https://api.p-c3-e.abema-tv.com/v1/channels/shogi')).toBe(true);
    expect(isAbBroadcastJsonUrl('https://image.p-c2-x.abema-tv.com/image/channels/shogi/logo.png')).toBe(false);
    expect(isAbBroadcastJsonUrl('https://evil.example/v1/channels/shogi')).toBe(false);

    const meta = parseAbProgramMeta({
      slot: {
        title: '朝のニュース',
        channel: { id: 'abema-news' },
        thumbComponent: { urlPrefix: 'https://hayabusa.io/abema/programs/p1', filename: 'thumb001.png' },
      },
    });
    expect(meta.channelId).toBe('abema-news');
    expect(meta.imageUrl).toBe('https://hayabusa.io/abema/programs/p1/thumb001.png');
    expect(pickAbBroadcasterImage({ apiImage: meta.imageUrl })).toBe(meta.imageUrl);
    expect(pickAbBroadcasterImage({ channelId: meta.channelId, apiImage: meta.imageUrl })).toBe(logo);
    expect(pickAbBroadcasterImage({
      login: 'n-shogi',
      images: ['https://image.p-c2-x.abema-tv.com/image/channels/abema-news/logo.png'],
    })).toContain('/channels/shogi/logo.png');
    expect(parseAbProgramMeta({
      slot: { title: '朝のニュース', channel: { id: 'abema-news', logoUrl: logo } },
    }).imageUrl).toBe(logo);

    const shrunk = shrinkAbPayload({
      comments: [{ id: 'abm1.chat.chat.x.ulid01', message: 'ウホ。', createdAtMs: 1794364815754, userId: 'A2AmVn58ed3nrb' }],
      channel: { id: 'abema-news', logoUrl: logo },
    });
    expect(shrunk.messages[0].iconUrl).toBe('');
    expect(JSON.stringify(shrunk)).not.toContain('logo.png');
    const notice = abPayloadNotices({
      comments: [{ id: 'abm1.chat.chat.x.ulid01', message: 'ウホ。', createdAtMs: 1794364815754, userId: 'A2AmVn58ed3nrb' }],
      channel: { id: 'abema-news', logoUrl: logo },
    });
    expect(notice.batch.messages[0].iconUrl).toBe('');
    expect(notice.meta.imageUrl).toBe(logo);
    expect(notice.meta.channelId).toBe('abema-news');

    const snap = ytSummaryToNicoSnapshot({
      title: 'ABEMA NEWSチャンネル',
      broadcasterName: 'ABEMA NEWSチャンネル',
      broadcasterChannelId: 'ab:@n-abema-news',
      broadcasterHandle: 'n-abema-news',
      broadcasterIconUrl: logo,
    }, 'ab.n-abema-news.program1', '');
    expect(snap.broadcasterIconUrl).toBe(logo);
    expect(snap.broadcasterUserId).toMatch(/^8\d{9}$/);
    expect(ytIconForNumericUid(snap.broadcasterUserId)).toBe(logo);
    const card = resolveBroadcasterFollowTarget(snap);
    expect(card.iconUrl).toBe(logo);
    expect(card.iconUrl).not.toContain('nimg.jp');
    expect(card.pageUrl).toBe('https://abema.tv/now-on-air/abema-news');
    expect(card.followLabel).toBe('チャンネルを見る');
    expect(snap.thumbnailUrl).toContain('/channels/abema-news/logo.png');
    expect(snap.officialAudienceOnly).toBeUndefined();

    const bare = ytSummaryToNicoSnapshot({
      title: '将棋チャンネル',
      broadcasterName: '将棋チャンネル',
      broadcasterChannelId: 'ab:@n-shogi',
      broadcasterHandle: 'n-shogi',
    }, 'ab.n-shogi.live1', '');
    expect(bare.broadcasterIconUrl).toContain('/channels/shogi/logo.png');
    expect(bare.broadcasterIconUrl).not.toContain('nimg.jp');
    const bareCard = resolveBroadcasterFollowTarget(bare);
    expect(bareCard.iconUrl).toContain('/channels/shogi/logo.png');
    expect(bareCard.pageUrl).toBe('https://abema.tv/now-on-air/shogi');
    const started = Date.now() - 90 * 60 * 1000;
    const aged = ytSummaryToNicoSnapshot({
      title: '将棋チャンネル',
      broadcasterName: '将棋チャンネル',
      broadcasterChannelId: 'ab:@n-shogi',
      broadcasterHandle: 'n-shogi',
      startedAt: started,
    }, 'ab.n-shogi.live1', '');
    expect(aged.streamAgeMin).toBeGreaterThanOrEqual(89);
    expect(aged.streamAgeMin).toBeLessThanOrEqual(91);
  });
  it('画像は https の ABEMA の置き場だけ', () => {
    expect(safeAbImageUrl('http://hayabusa.io/a.jpg')).toBe('');
    expect(safeAbImageUrl('https://evil.example/a.jpg')).toBe('');
    expect(safeAbImageUrl('https://image.abema.io/a.jpg')).toContain('abema.io');
  });
});

describe('ABEMA は配信サービスの表に入る', () => {
  it('キー・URL・ホストから ABEMA と分かる', () => {
    const key = buildAbStreamKey('n-abema-news', { session: 'program1' });
    expect(platformOfStreamKey(key)).toBe(STREAM_PLATFORMS.abema);
    expect(platformChannelOfUrl('https://abema.tv/now-on-air/abema-news')?.platform.id).toBe('abema');
    expect(platformOfHostname('abema.tv')?.id).toBe('abema');
    expect(platformOfHostname('www.abema.tv')?.id).toBe('abema');
    const placeholder = placeholderStreamKeyForChannel(STREAM_PLATFORMS.abema, 'n-abema-news');
    expect(placeholder).toBe('ab.n-abema-news.00000');
    expect(platformOfStreamKey(placeholder)).toBe(STREAM_PLATFORMS.abema);
  });
});
