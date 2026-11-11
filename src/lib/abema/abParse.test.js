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
  shrinkAbPayload,
} from './abParse.js';
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
  it('広い窓は新しい端の 20 秒だけ、狭い窓は全部', () => {
    const batch = parseAbCommentBatch(FIXTURE_CHAT_MESSAGES);
    const wide = abMessagesNearPlayhead(batch.messages, { sinceMs: 3_620_000, untilMs: 0 });
    expect(wide.map((m) => m.text)).toEqual(['いまここ']);
    const tight = abMessagesNearPlayhead(batch.messages, { sinceMs: 12_000, untilMs: 0 });
    expect(tight).toHaveLength(3);
  });
  it('時刻の無い新しい順の束は先頭 20 件まで残す', () => {
    const messages = Array.from({ length: 30 }, (_, i) => ({ elapsedMs: null, createdAtMs: null, text: String(i) }));
    expect(abMessagesNearPlayhead(messages).map((m) => m.text)).toEqual(messages.slice(0, 20).map((m) => m.text));
    expect(abMessagesNearPlayhead(messages.slice(0, 5))).toHaveLength(5);
  });
  it('since だけが古い端のときは、届いた中の新しい端に合わせる', () => {
    const batch = parseAbCommentBatch(FIXTURE_CHAT_MESSAGES);
    const near = abMessagesNearPlayhead(batch.messages, { sinceMs: 0 });
    expect(near.map((m) => m.text)).toEqual(['いまここ']);
  });
  it('記録の 1 件は人の ID と本文を持ち、リンク用の login は空', () => {
    const batch = parseAbCommentBatch({ data: { messages: FIXTURE_CHAT_MESSAGES.messages, isPolling: true } });
    const row = abCommentRow(batch.messages[1], { pageLogin: 'n-abema-news', nowMs: 1_700_000_000_000 });
    expect(row.channelId).toBe('ab:efgh5678');
    expect(row.login).toBe('');
    expect(row.kind).toBe('text');
    expect(row.postedAtMs).toBe(1_700_000_000_000);
    expect(row.id.startsWith('ab-')).toBe(true);
  });
  it('実測の comments は新しい順。過去の 100 件は新しい端だけ残す', () => {
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
    expect(first.map((m) => m.text)).toEqual(['20秒前', 'いま']);
    const live = abMessagesNearPlayhead(batch?.messages, { sinceMs: newest });
    expect(live.map((m) => m.text)).toEqual(['20秒前', 'いま']);
    const next = parseAbCommentBatch({
      comments: [{ id: `${id}n`, message: 'つぎ', createdAtMs: newest + 4_000, userId: 'A2AmVn58ed3nrb' }],
    });
    expect(abMessagesNearPlayhead(next?.messages, { sinceMs: newest }).map((m) => m.text)).toEqual(['つぎ']);
    const shrunk = shrinkAbPayload({ comments });
    expect(shrunk.messages[0].createdAtMs).toBe(newest);
    expect(JSON.stringify(shrunk)).not.toContain('A2AmVn58ed3nrb-secret');
  });
  it('視聴数だけの応答はコメントにしない', () => {
    const stats = { stats: { view: 11580, comment: 580 } };
    expect(parseAbCommentBatch(stats)).toBe(null);
    expect(parseAbProgramMeta(stats)).toBe(null);
    expect(shrinkAbPayload(stats)).toBe(null);
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
