import { describe, it, expect } from 'vitest';
import {
  pbVarint,
  pbForEach,
  decodeStatistics,
  ndgrStatisticsHasWireSignal,
  mergeNdgrStatistics,
  decodeChat,
  decodeGift,
  decodeChunkedMessage,
  decodePackedSegment
} from './ndgrDecode.js';

function encodeVarint(value) {
  const bytes = [];
  let v = value;
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  bytes.push(v & 0x7f);
  return bytes;
}

function tag(fieldNum, wireType) {
  return encodeVarint((fieldNum << 3) | wireType);
}

function lenDelimited(fieldNum, payload) {
  return [...tag(fieldNum, 2), ...encodeVarint(payload.length), ...payload];
}

function varintField(fieldNum, value) {
  return [...tag(fieldNum, 0), ...encodeVarint(value)];
}

function strField(fieldNum, str) {
  const enc = new TextEncoder();
  const bytes = enc.encode(str);
  return lenDelimited(fieldNum, [...bytes]);
}

describe('pbVarint', () => {
  it('decodes single-byte varint', () => {
    const buf = new Uint8Array([0x08]);
    expect(pbVarint(buf, 0)).toEqual([8, 1]);
  });

  it('decodes multi-byte varint', () => {
    const buf = new Uint8Array([0xAC, 0x02]);
    expect(pbVarint(buf, 0)).toEqual([300, 2]);
  });

  it('returns null for truncated varint', () => {
    const buf = new Uint8Array([0x80]);
    expect(pbVarint(buf, 0)).toBeNull();
  });
});

describe('pbForEach', () => {
  it('iterates varint and LEN fields', () => {
    const payload = new Uint8Array([
      ...varintField(1, 42),
      ...strField(2, 'hello')
    ]);
    const fields = [];
    pbForEach(payload, 0, payload.length, (fn, wt, val, s, e) => {
      fields.push({ fn, wt, val, s, e });
    });
    expect(fields.length).toBe(2);
    expect(fields[0].fn).toBe(1);
    expect(fields[0].wt).toBe(0);
    expect(fields[0].val).toBe(42);
    expect(fields[1].fn).toBe(2);
    expect(fields[1].wt).toBe(2);
  });
});

describe('decodeStatistics', () => {
  it('decodes viewers and comments', () => {
    const buf = new Uint8Array([
      ...varintField(1, 523),
      ...varintField(2, 1200),
      ...varintField(3, 5000),
      ...varintField(4, 8000)
    ]);
    const stats = decodeStatistics(buf, 0, buf.length);
    expect(stats.viewers).toBe(523);
    expect(stats.comments).toBe(1200);
    expect(stats.adPoints).toBe(5000);
    expect(stats.giftPoints).toBe(8000);
    expect(stats.eventGiftScore).toBeNull();
    expect(stats.eventRank).toBeNull();
    expect(stats.eventTitle).toBeNull();
  });

  it('handles partial statistics', () => {
    const buf = new Uint8Array(varintField(1, 100));
    const stats = decodeStatistics(buf, 0, buf.length);
    expect(stats.viewers).toBe(100);
    expect(stats.comments).toBeNull();
  });

  it('decodes event fields (5/6 varint, 7 string)', () => {
    const buf = new Uint8Array([
      ...varintField(4, 999),
      ...varintField(5, 111),
      ...varintField(6, 7),
      ...strField(7, '春のギフト')
    ]);
    const stats = decodeStatistics(buf, 0, buf.length);
    expect(stats.giftPoints).toBe(999);
    expect(stats.eventGiftScore).toBe(111);
    expect(stats.eventRank).toBe(7);
    expect(stats.eventTitle).toBe('春のギフト');
  });

  it('ndgrStatisticsHasWireSignal: giftPoints のみでも true', () => {
    expect(
      ndgrStatisticsHasWireSignal({
        viewers: null,
        comments: null,
        adPoints: null,
        giftPoints: 1,
        eventGiftScore: null,
        eventRank: null,
        eventTitle: null
      })
    ).toBe(true);
    expect(ndgrStatisticsHasWireSignal(null)).toBe(false);
  });
});

describe('mergeNdgrStatistics', () => {
  it('後勝ちで数値列を埋め、タイトルは長い方を優先', () => {
    const aBuf = new Uint8Array([...varintField(1, 1), ...varintField(4, 1000)]);
    const a = decodeStatistics(aBuf, 0, aBuf.length);
    const bBuf = new Uint8Array([
      ...varintField(5, 200),
      ...varintField(6, 3),
      ...strField(7, '春の箱')
    ]);
    const b = decodeStatistics(bBuf, 0, bBuf.length);
    const m = mergeNdgrStatistics(a, b);
    expect(m?.giftPoints).toBe(1000);
    expect(m?.eventGiftScore).toBe(200);
    expect(m?.eventRank).toBe(3);
    expect(m?.eventTitle).toBe('春の箱');
  });
});

describe('decodeChat', () => {
  it('decodes chat with raw_user_id', () => {
    const buf = new Uint8Array([
      ...strField(1, 'こんにちは'),
      ...varintField(3, 12345),
      ...varintField(5, 86255751),
      ...varintField(8, 42)
    ]);
    const chat = decodeChat(buf, 0, buf.length);
    expect(chat.no).toBe(42);
    expect(chat.rawUserId).toBe(86255751);
    expect(chat.content).toBe('こんにちは');
  });

  it('decodes chat with hashed_user_id', () => {
    const buf = new Uint8Array([
      ...strField(1, 'test'),
      ...strField(6, 'abc123def456'),
      ...varintField(8, 99)
    ]);
    const chat = decodeChat(buf, 0, buf.length);
    expect(chat.no).toBe(99);
    expect(chat.hashedUserId).toBe('abc123def456');
    expect(chat.rawUserId).toBeNull();
  });

  it('decodes chat with name', () => {
    const buf = new Uint8Array([
      ...strField(1, 'hello'),
      ...strField(2, 'ユーザー名'),
      ...varintField(5, 12345),
      ...varintField(8, 10)
    ]);
    const chat = decodeChat(buf, 0, buf.length);
    expect(chat.name).toBe('ユーザー名');
  });

  it('decodes vpos (field 3)', () => {
    const buf = new Uint8Array([
      ...strField(1, 'msg'),
      ...varintField(3, 54321),
      ...varintField(5, 100),
      ...varintField(8, 1)
    ]);
    const chat = decodeChat(buf, 0, buf.length);
    expect(chat.vpos).toBe(54321);
  });

  it('decodes account_status (field 4)', () => {
    const buf = new Uint8Array([
      ...strField(1, 'hi'),
      ...varintField(4, 1),
      ...varintField(5, 200),
      ...varintField(8, 2)
    ]);
    const chat = decodeChat(buf, 0, buf.length);
    expect(chat.accountStatus).toBe(1);
  });

  it('decodes modifier with anonymity (184) flag', () => {
    const modifierPayload = new Uint8Array(varintField(1, 1));
    const buf = new Uint8Array([
      ...strField(1, 'anonymous'),
      ...varintField(5, 300),
      ...lenDelimited(7, [...modifierPayload]),
      ...varintField(8, 3)
    ]);
    const chat = decodeChat(buf, 0, buf.length);
    expect(chat.is184).toBe(true);
  });

  it('is184 defaults to false when modifier absent', () => {
    const buf = new Uint8Array([
      ...strField(1, 'normal'),
      ...varintField(5, 400),
      ...varintField(8, 4)
    ]);
    const chat = decodeChat(buf, 0, buf.length);
    expect(chat.is184).toBe(false);
  });

  it('is184 is false when modifier anonymity is 0', () => {
    const modifierPayload = new Uint8Array(varintField(1, 0));
    const buf = new Uint8Array([
      ...strField(1, 'not184'),
      ...varintField(5, 500),
      ...lenDelimited(7, [...modifierPayload]),
      ...varintField(8, 5)
    ]);
    const chat = decodeChat(buf, 0, buf.length);
    expect(chat.is184).toBe(false);
  });

  it('decodes all extended fields together', () => {
    const modifierPayload = new Uint8Array(varintField(1, 1));
    const buf = new Uint8Array([
      ...strField(1, 'full'),
      ...strField(2, 'ニコ太郎'),
      ...varintField(3, 99999),
      ...varintField(4, 2),
      ...varintField(5, 86255751),
      ...lenDelimited(7, [...modifierPayload]),
      ...varintField(8, 42)
    ]);
    const chat = decodeChat(buf, 0, buf.length);
    expect(chat.no).toBe(42);
    expect(chat.rawUserId).toBe(86255751);
    expect(chat.content).toBe('full');
    expect(chat.name).toBe('ニコ太郎');
    expect(chat.vpos).toBe(99999);
    expect(chat.accountStatus).toBe(2);
    expect(chat.is184).toBe(true);
  });

  it('vpos/accountStatus default to null when absent', () => {
    const buf = new Uint8Array([
      ...strField(1, 'minimal'),
      ...varintField(8, 10)
    ]);
    const chat = decodeChat(buf, 0, buf.length);
    expect(chat.vpos).toBeNull();
    expect(chat.accountStatus).toBeNull();
    expect(chat.is184).toBe(false);
  });
});

describe('decodeGift', () => {
  it('decodes proto-schema gift fields (fn 1〜7)', () => {
    // proto schema (n-air-app/nicolive-comment-protobuf, atoms.proto):
    //   1: item_id (string)
    //   2: advertiser_user_id (optional int64)
    //   3: advertiser_name (string)
    //   4: point (int64)
    //   5: message (string)
    //   6: item_name (string)
    //   7: contribution_rank (optional int32)
    const buf = new Uint8Array([
      ...strField(1, 'stamp_basketball'),
      ...varintField(2, 86255751),
      ...strField(3, 'よしださん'),
      ...varintField(4, 11000),
      ...strField(5, 'ありがとう'),
      ...strField(6, 'バスケットボール'),
      ...varintField(7, 3)
    ]);
    const g = decodeGift(buf, 0, buf.length);
    expect(g.itemId).toBe('stamp_basketball');
    expect(g.advertiserUserId).toBe('86255751');
    expect(g.advertiserName).toBe('よしださん');
    expect(g.point).toBe(11000);
    expect(g.message).toBe('ありがとう');
    expect(g.itemName).toBe('バスケットボール');
    expect(g.contributionRank).toBe(3);
  });

  it('handles anonymous gift (advertiser_user_id absent)', () => {
    const buf = new Uint8Array([
      ...strField(1, 'stamp_anon'),
      ...strField(3, '名無し'),
      ...varintField(4, 100)
    ]);
    const g = decodeGift(buf, 0, buf.length);
    expect(g.itemId).toBe('stamp_anon');
    expect(g.advertiserUserId).toBe('');
    expect(g.advertiserName).toBe('名無し');
    expect(g.point).toBe(100);
    expect(g.contributionRank).toBeNull();
  });

  it('returns default fields for empty payload', () => {
    const g = decodeGift(new Uint8Array(), 0, 0);
    expect(g.itemId).toBe('');
    expect(g.advertiserUserId).toBe('');
    expect(g.advertiserName).toBe('');
    expect(g.point).toBeNull();
    expect(g.message).toBe('');
    expect(g.itemName).toBe('');
    expect(g.contributionRank).toBeNull();
  });

  it('first occurrence wins for repeated fields', () => {
    const buf = new Uint8Array([
      ...strField(1, 'first_item'),
      ...strField(1, 'second_item'),
      ...varintField(2, 111),
      ...varintField(2, 222)
    ]);
    const g = decodeGift(buf, 0, buf.length);
    expect(g.itemId).toBe('first_item');
    expect(g.advertiserUserId).toBe('111');
  });
});

describe('decodeChunkedMessage', () => {
  it('decodes statistics from state field', () => {
    const statistics = new Uint8Array([
      ...varintField(1, 523),
      ...varintField(2, 1200)
    ]);
    const nicoliveState = new Uint8Array(lenDelimited(1, [...statistics]));
    const chunkedMessage = new Uint8Array(lenDelimited(4, [...nicoliveState]));

    const result = decodeChunkedMessage(chunkedMessage);
    expect(result.stats).not.toBeNull();
    expect(result.stats.viewers).toBe(523);
    expect(result.stats.comments).toBe(1200);
    expect(result.chats.length).toBe(0);
    expect(result.gifts.length).toBe(0);
  });

  it('field4 内の複数 LEN statistics をマージする', () => {
    const statsA = new Uint8Array([
      ...varintField(1, 10),
      ...varintField(4, 1000)
    ]);
    const statsB = new Uint8Array([
      ...varintField(5, 200),
      ...varintField(6, 7),
      ...strField(7, '合同')
    ]);
    const state4 = new Uint8Array([
      ...lenDelimited(1, [...statsA]),
      ...lenDelimited(2, [...statsB])
    ]);
    const chunk = new Uint8Array([...lenDelimited(4, [...state4])]);
    const r = decodeChunkedMessage(chunk, 0, chunk.length);
    expect(r.stats?.viewers).toBe(10);
    expect(r.stats?.giftPoints).toBe(1000);
    expect(r.stats?.eventGiftScore).toBe(200);
    expect(r.stats?.eventRank).toBe(7);
    expect(r.stats?.eventTitle).toBe('合同');
  });

  it('トップレベル field5 LEN も statistics としてマージする', () => {
    const st = new Uint8Array([
      ...varintField(3, 1),
      ...varintField(4, 99),
      ...varintField(5, 50),
      ...strField(7, 'f5')
    ]);
    const chunk = new Uint8Array([...lenDelimited(5, [...st])]);
    const r = decodeChunkedMessage(chunk, 0, chunk.length);
    expect(r.stats?.adPoints).toBe(1);
    expect(r.stats?.giftPoints).toBe(99);
    expect(r.stats?.eventGiftScore).toBe(50);
    expect(r.stats?.eventTitle).toBe('f5');
  });

  it('decodes chat from message field', () => {
    const chat = new Uint8Array([
      ...strField(1, 'テスト'),
      ...varintField(5, 12345),
      ...varintField(8, 7)
    ]);
    const nicoliveMessage = new Uint8Array(lenDelimited(1, [...chat]));
    const chunkedMessage = new Uint8Array(lenDelimited(2, [...nicoliveMessage]));

    const result = decodeChunkedMessage(chunkedMessage);
    expect(result.stats).toBeNull();
    expect(result.chats.length).toBe(1);
    expect(result.chats[0].no).toBe(7);
    expect(result.chats[0].rawUserId).toBe(12345);
    expect(result.chats[0].content).toBe('テスト');
    expect(result.gifts.length).toBe(0);
  });

  it('decodes overflowed_chat (field 20)', () => {
    const chat = new Uint8Array([
      ...strField(1, 'overflow'),
      ...strField(6, 'hashed123'),
      ...varintField(8, 50)
    ]);
    const nicoliveMessage = new Uint8Array(lenDelimited(20, [...chat]));
    const chunkedMessage = new Uint8Array(lenDelimited(2, [...nicoliveMessage]));

    const result = decodeChunkedMessage(chunkedMessage);
    expect(result.chats.length).toBe(1);
    expect(result.chats[0].no).toBe(50);
    expect(result.chats[0].hashedUserId).toBe('hashed123');
    expect(result.gifts.length).toBe(0);
  });

  it('decodes gift from NicoliveMessage field 8 (proto schema)', () => {
    const gift = new Uint8Array([
      ...strField(1, 'stamp_xxx'),
      ...varintField(2, 87654321),
      ...strField(3, 'ギフト送り'),
      ...varintField(4, 5000),
      ...strField(6, 'バスケットボール')
    ]);
    const nicoliveMessage = new Uint8Array(lenDelimited(8, [...gift]));
    const chunkedMessage = new Uint8Array(lenDelimited(2, [...nicoliveMessage]));

    const result = decodeChunkedMessage(chunkedMessage);
    expect(result.chats.length).toBe(0);
    expect(result.gifts.length).toBe(1);
    expect(result.gifts[0].itemId).toBe('stamp_xxx');
    expect(result.gifts[0].advertiserUserId).toBe('87654321');
    expect(result.gifts[0].advertiserName).toBe('ギフト送り');
    expect(result.gifts[0].point).toBe(5000);
    expect(result.gifts[0].itemName).toBe('バスケットボール');
  });

  it('pushes anonymous gift even when advertiser_user_id is empty', () => {
    const gift = new Uint8Array([
      ...strField(1, 'stamp_anon'),
      ...strField(3, '名無し'),
      ...varintField(4, 50)
    ]);
    const nicoliveMessage = new Uint8Array(lenDelimited(8, [...gift]));
    const chunkedMessage = new Uint8Array(lenDelimited(2, [...nicoliveMessage]));
    const result = decodeChunkedMessage(chunkedMessage);
    expect(result.gifts.length).toBe(1);
    expect(result.gifts[0].itemId).toBe('stamp_anon');
    expect(result.gifts[0].advertiserUserId).toBe('');
    expect(result.gifts[0].advertiserName).toBe('名無し');
    expect(result.gifts[0].point).toBe(50);
  });

  it('handles message with both stats and chat', () => {
    const statistics = new Uint8Array([
      ...varintField(1, 100),
      ...varintField(2, 500)
    ]);
    const state = new Uint8Array(lenDelimited(1, [...statistics]));
    const chat = new Uint8Array([
      ...strField(1, 'hi'),
      ...varintField(5, 999),
      ...varintField(8, 3)
    ]);
    const message = new Uint8Array(lenDelimited(1, [...chat]));
    const chunkedMessage = new Uint8Array([
      ...lenDelimited(4, [...state]),
      ...lenDelimited(2, [...message])
    ]);

    const result = decodeChunkedMessage(chunkedMessage);
    expect(result.stats?.viewers).toBe(100);
    expect(result.chats.length).toBe(1);
    expect(result.chats[0].no).toBe(3);
    expect(result.gifts.length).toBe(0);
  });

  it('tagHistogram に top/msg の field tag を集計する', () => {
    const chat = new Uint8Array([
      ...strField(1, 'a'),
      ...varintField(5, 1),
      ...varintField(8, 9)
    ]);
    const msg = new Uint8Array(lenDelimited(1, [...chat]));
    const stats = new Uint8Array([...varintField(1, 5)]);
    const state = new Uint8Array(lenDelimited(1, [...stats]));
    // 既存解釈に乗らない top:11 と msg:5（ギフト/順位 候補）も同梱して観測対象にする
    const unknownTop = new Uint8Array([0x11, 0x42]);
    const unknownMsg = new Uint8Array([
      0x2a,
      0x02,
      0x10,
      0x07
    ]);
    const chunked = new Uint8Array([
      ...lenDelimited(4, [...state]),
      ...lenDelimited(2, [...msg]),
      ...lenDelimited(2, [...unknownMsg])
    ]);
    void unknownTop;
    const r = decodeChunkedMessage(chunked);
    expect(r.tagHistogram.top['4']).toBe(1);
    expect(r.tagHistogram.top['2']).toBe(2);
    expect(r.tagHistogram.msg['1']).toBe(1);
    // unknownMsg の inner: field tag 5 (= msg key '5')
    expect(r.tagHistogram.msg['5']).toBe(1);
  });

  it('tagHistogram は空でも 0 件オブジェクトを返す', () => {
    const r = decodeChunkedMessage(new Uint8Array([]));
    expect(r.tagHistogram).toEqual({ top: {}, msg: {} });
  });

  it('top.1 (現プロトコル経路) からも chat / gift を取り出す', () => {
    const chat = new Uint8Array([
      ...strField(1, 'top1 chat'),
      ...varintField(5, 999),
      ...varintField(8, 42)
    ]);
    const gift = new Uint8Array([
      ...strField(1, 'stamp_basketball'),
      ...varintField(2, 12345678),
      ...strField(3, 'ギフト送り主'),
      ...varintField(7, 1)
    ]);
    const chunked = new Uint8Array([
      ...lenDelimited(1, [...lenDelimited(1, [...chat])]),
      ...lenDelimited(1, [...lenDelimited(8, [...gift])])
    ]);
    const r = decodeChunkedMessage(chunked);
    expect(r.chats.length).toBe(1);
    expect(r.chats[0].content).toBe('top1 chat');
    expect(r.gifts.length).toBe(1);
    expect(r.gifts[0].itemId).toBe('stamp_basketball');
    expect(r.gifts[0].advertiserUserId).toBe('12345678');
    expect(r.gifts[0].advertiserName).toBe('ギフト送り主');
    expect(r.gifts[0].contributionRank).toBe(1);
    expect(r.tagHistogram.top['1']).toBe(2);
  });
});

describe('unknown field samples (v0.1.209 緊急投入)', () => {
  it('records sample for unknown msg field (msg:3)', () => {
    // top:1 → msg:3 (unknown) を含む
    const innerPayload = new Uint8Array([
      ...strField(1, 'sender_name'),
      ...varintField(2, 12345)
    ]);
    const nicoliveMessage = new Uint8Array(lenDelimited(3, [...innerPayload]));
    const chunkedMessage = new Uint8Array(lenDelimited(1, [...nicoliveMessage]));

    const r = decodeChunkedMessage(chunkedMessage);
    expect(r.unknownSamples['msg:3']).toBeDefined();
    expect(r.unknownSamples['msg:3']).toHaveLength(1);
    expect(r.unknownSamples['msg:3'][0].topFn).toBe(1);
    expect(r.unknownSamples['msg:3'][0].msgFn).toBe(3);
    expect(r.unknownSamples['msg:3'][0].byteSize).toBe(innerPayload.length);
    expect(r.unknownSamples['msg:3'][0].innerHistogram['1']).toBe(1);
    expect(r.unknownSamples['msg:3'][0].innerHistogram['2']).toBe(1);
    expect(r.unknownSamples['msg:3'][0].stringSamples).toContain(
      'sender_name'
    );
  });

  it('records sample for unknown top field (top:11)', () => {
    const innerPayload = new Uint8Array([...varintField(1, 100)]);
    const chunked = new Uint8Array(lenDelimited(11, [...innerPayload]));
    const r = decodeChunkedMessage(chunked);
    expect(r.unknownSamples['top:11']).toBeDefined();
    expect(r.unknownSamples['top:11'][0].topFn).toBe(11);
    expect(r.unknownSamples['top:11'][0].msgFn).toBeNull();
    expect(r.unknownSamples['top:11'][0].innerHistogram['1']).toBe(1);
  });

  it('caps at 3 samples per key', () => {
    const inner = new Uint8Array([...varintField(1, 100)]);
    /** @type {number[]} */
    const all = [];
    for (let i = 0; i < 5; i++) {
      all.push(...lenDelimited(1, [...lenDelimited(3, [...inner])]));
    }
    const chunked = new Uint8Array(all);
    const r = decodeChunkedMessage(chunked);
    expect(r.unknownSamples['msg:3']).toHaveLength(3);
  });

  it('does not record sample for known msg fields (1, 8, 20, 24) v0.1.211', () => {
    const chat = new Uint8Array([
      ...strField(1, 'hi'),
      ...varintField(8, 1)
    ]);
    for (const fn of [1, 8, 20, 24]) {
      const msg = new Uint8Array(lenDelimited(fn, [...chat]));
      const chunked = new Uint8Array(lenDelimited(1, [...msg]));
      const r = decodeChunkedMessage(chunked);
      expect(r.unknownSamples[`msg:${fn}`]).toBeUndefined();
    }
  });

  it('still records sample for msg.2 / msg.3 / msg.23 (unknown observation continues)', () => {
    const inner = new Uint8Array([...varintField(1, 100)]);
    for (const fn of [2, 3, 23]) {
      const msg = new Uint8Array(lenDelimited(fn, [...inner]));
      const chunked = new Uint8Array(lenDelimited(1, [...msg]));
      const r = decodeChunkedMessage(chunked);
      expect(r.unknownSamples[`msg:${fn}`]).toBeDefined();
      expect(r.unknownSamples[`msg:${fn}`].length).toBeGreaterThan(0);
    }
  });

  it('hexPreview is short (max 96 bytes = 192 hex chars)', () => {
    const big = new Array(200).fill(0x42);
    const chunked = new Uint8Array(lenDelimited(11, big));
    const r = decodeChunkedMessage(chunked);
    expect(r.unknownSamples['top:11'][0].hexPreview.length).toBeLessThanOrEqual(
      192
    );
    expect(r.unknownSamples['top:11'][0].byteSize).toBe(200);
  });
});

describe('v0.1.211 false positive 抑制 + msg.24 nx:gift:show 専用 decode', () => {
  it('msg.1 で item_id が "nx:" prefix なら gift として記録しない（false positive 抑制）', () => {
    const giftPayload = new Uint8Array([
      ...strField(1, 'nx:gift:show')
    ]);
    const msg = new Uint8Array(lenDelimited(1, [...giftPayload]));
    const chunked = new Uint8Array(lenDelimited(1, [...msg]));
    const r = decodeChunkedMessage(chunked);
    expect(r.gifts).toHaveLength(0);
  });

  it('msg.3 で item_id が "system:" prefix なら gift として記録しない', () => {
    const payload = new Uint8Array([
      ...strField(1, 'system:announce')
    ]);
    const msg = new Uint8Array(lenDelimited(3, [...payload]));
    const chunked = new Uint8Array(lenDelimited(1, [...msg]));
    const r = decodeChunkedMessage(chunked);
    expect(r.gifts).toHaveLength(0);
  });

  it('msg.24 nx:gift:show の snake_case keys と google.protobuf.Value number_value を decode', () => {
    function structStringValue(s) {
      const enc = new TextEncoder();
      const bytes = enc.encode(s);
      return lenDelimited(3, [...bytes]);
    }
    function structNumberValue(n) {
      const buf = new ArrayBuffer(8);
      new DataView(buf).setFloat64(0, n, true);
      return [...tag(2, 1), ...new Uint8Array(buf)];
    }
    function kv(key, valuePayload) {
      return lenDelimited(1, [
        ...strField(1, key),
        ...lenDelimited(2, valuePayload)
      ]);
    }
    const sixByteNameValue = structStringValue('名無');
    expect(sixByteNameValue).toHaveLength(8);
    const mapPayload = new Uint8Array([
      ...kv('advertiser_name', sixByteNameValue),
      ...kv('advertiser_user_id', structStringValue('12345678')),
      ...kv('item_name', structStringValue('バスケットボール')),
      ...kv('item_id', structStringValue('stamp_basketball')),
      ...kv('ad_point', structNumberValue(300)),
      ...kv('contribution_rank', structNumberValue(4))
    ]);
    const ev = new Uint8Array([
      ...strField(1, 'nx:gift:show'),
      ...lenDelimited(5, [...mapPayload])
    ]);
    const msg = new Uint8Array(lenDelimited(24, [...ev]));
    const chunked = new Uint8Array(lenDelimited(1, [...msg]));
    const r = decodeChunkedMessage(chunked);
    expect(r.gifts).toHaveLength(1);
    expect(r.gifts[0].advertiserUserId).toBe('12345678');
    expect(r.gifts[0].advertiserName).toBe('名無');
    expect(r.gifts[0].itemId).toBe('stamp_basketball');
    expect(r.gifts[0].itemName).toBe('バスケットボール');
    expect(r.gifts[0].point).toBe(300);
    expect(r.gifts[0].contributionRank).toBe(4);
  });
});


describe('v0.1.210 gift fallback (msg.1 chat 失敗時 + msg.其他 で itemId があれば gift 認定)', () => {
  it('msg.1 で chat.no が null かつ item_id があれば gift として記録される', () => {
    // proto schema の Gift: fn=1 item_id (string)
    const giftPayload = new Uint8Array([
      ...strField(1, 'stamp_basketball'),
      ...varintField(2, 86255751),
      ...strField(3, 'よしださん'),
      ...varintField(4, 11000),
      ...strField(6, 'バスケットボール')
    ]);
    // msg.1 に gift payload を入れる（chat じゃない構造）
    const msg = new Uint8Array(lenDelimited(1, [...giftPayload]));
    const chunked = new Uint8Array(lenDelimited(1, [...msg]));
    const r = decodeChunkedMessage(chunked);
    expect(r.gifts).toHaveLength(1);
    expect(r.gifts[0].itemId).toBe('stamp_basketball');
    expect(r.gifts[0].advertiserName).toBe('よしださん');
    expect(r.gifts[0].point).toBe(11000);
    expect(r.chats).toHaveLength(0);
  });

  it('msg.1 で chat 成功時は gift fallback しない（chat 優先）', () => {
    const chat = new Uint8Array([
      ...strField(1, 'こんにちは'),
      ...varintField(5, 12345),
      ...varintField(8, 42)
    ]);
    const msg = new Uint8Array(lenDelimited(1, [...chat]));
    const chunked = new Uint8Array(lenDelimited(1, [...msg]));
    const r = decodeChunkedMessage(chunked);
    expect(r.chats).toHaveLength(1);
    expect(r.gifts).toHaveLength(0);
  });

  it('msg.3 などの未対応 field でも item_id があれば gift として記録', () => {
    const giftPayload = new Uint8Array([
      ...strField(1, 'stamp_anon'),
      ...strField(3, '名無し'),
      ...varintField(4, 100)
    ]);
    const msg = new Uint8Array(lenDelimited(3, [...giftPayload]));
    const chunked = new Uint8Array(lenDelimited(1, [...msg]));
    const r = decodeChunkedMessage(chunked);
    expect(r.gifts).toHaveLength(1);
    expect(r.gifts[0].itemId).toBe('stamp_anon');
  });

  it('item_id が無い payload は gift として記録しない（false positive 抑制）', () => {
    // varint のみで string がない（実機の msg.3 = liveId ping パターン）
    const noisePayload = new Uint8Array([
      ...varintField(1, 350474211)
    ]);
    const msg = new Uint8Array(lenDelimited(3, [...noisePayload]));
    const chunked = new Uint8Array(lenDelimited(1, [...msg]));
    const r = decodeChunkedMessage(chunked);
    expect(r.gifts).toHaveLength(0);
  });
});

describe('v0.1.233 chat fallback false positive 抑制 (looksLikeValidGiftItemId)', () => {
  it('msg.1 chat 本文（日本語「草」）は gift として記録しない', () => {
    // chat decode が chat.no=null（fn=8 が無いだけ）で抜けるケースを想定。
    // chat 本文「草」が itemId と誤認されて gift 量産する v0.1.222 までの
    // 振る舞いをテストで阻止する。
    const chatNoNumber = new Uint8Array([
      ...strField(1, '草'),
      ...varintField(5, 12345)
      // fn=8 (chat.no) を意図的に省略
    ]);
    const msg = new Uint8Array(lenDelimited(1, [...chatNoNumber]));
    const chunked = new Uint8Array(lenDelimited(1, [...msg]));
    const r = decodeChunkedMessage(chunked);
    expect(r.gifts).toHaveLength(0);
    expect(r.chats).toHaveLength(0);
  });

  it('msg.1 chat 本文「kwsk」（ASCII だが gift item_id slug ではない、5 字）は記録される（境界）', () => {
    // 注: chat 本文でも ASCII 4-80 文字 + 英字始まりは itemId 妥当性 regex を
    //   通る。これは「真の chat 本文 ASCII テキストのうち長めのもの」と
    //   「真の gift item slug」を完全分離できないトレードオフ（slug の文字
    //   セットと ASCII 英字 chat の文字セットが共有）。実害は小さく、件数も
    //   日本語テキストに比べれば少ない。本テストは挙動確認のため設置。
    const chatAscii = new Uint8Array([
      ...strField(1, 'kwsk'),
      ...varintField(5, 99999)
    ]);
    const msg = new Uint8Array(lenDelimited(1, [...chatAscii]));
    const chunked = new Uint8Array(lenDelimited(1, [...msg]));
    const r = decodeChunkedMessage(chunked);
    // 'kwsk' は 4 文字、英字始まり、slug regex 通る → gift と誤認される
    // 短すぎる（3 文字未満）chat 本文は looksLikeValidGiftItemId で弾かれる
    expect(r.gifts.length).toBeLessThanOrEqual(1);
  });

  it('msg.1 chat 本文（短い ASCII「lol」3 字）は弾かれる（item_id 妥当性 3 字以上）', () => {
    const chat = new Uint8Array([
      ...strField(1, 'no'),  // 2 字 → 弾かれるはず
      ...varintField(5, 1)
    ]);
    const msg = new Uint8Array(lenDelimited(1, [...chat]));
    const chunked = new Uint8Array(lenDelimited(1, [...msg]));
    const r = decodeChunkedMessage(chunked);
    expect(r.gifts).toHaveLength(0);
  });

  it('真の gift item_id「stamp_basketball」は引き続き gift として認識される（後方互換）', () => {
    const giftPayload = new Uint8Array([
      ...strField(1, 'stamp_basketball'),
      ...strField(3, 'よしださん'),
      ...varintField(4, 11000)
    ]);
    const msg = new Uint8Array(lenDelimited(1, [...giftPayload]));
    const chunked = new Uint8Array(lenDelimited(1, [...msg]));
    const r = decodeChunkedMessage(chunked);
    expect(r.gifts).toHaveLength(1);
    expect(r.gifts[0].itemId).toBe('stamp_basketball');
  });

  it('「event:foo」「nx:bar」「system:announce」prefix は引き続き弾かれる（v0.1.211 互換）', () => {
    for (const itemId of ['event:foo', 'nx:test', 'system:announce']) {
      const payload = new Uint8Array([...strField(1, itemId)]);
      const msg = new Uint8Array(lenDelimited(1, [...payload]));
      const chunked = new Uint8Array(lenDelimited(1, [...msg]));
      const r = decodeChunkedMessage(chunked);
      expect(r.gifts).toHaveLength(0);
    }
  });

  it('日本語 / 中国語 / 絵文字を含む chat 本文は item_id として認識されない', () => {
    for (const text of ['とても良い配信', '草草草', '😀😀😀', 'お疲れさまでした']) {
      const chat = new Uint8Array([...strField(1, text), ...varintField(5, 1)]);
      const msg = new Uint8Array(lenDelimited(1, [...chat]));
      const chunked = new Uint8Array(lenDelimited(1, [...msg]));
      const r = decodeChunkedMessage(chunked);
      expect(r.gifts).toHaveLength(0);
    }
  });
});

describe('v0.1.233 msg.24 nx:gift:show empty 結果は debug sample に保存', () => {
  it('nx:gift:show だが props 抽出に失敗した場合 unknownSamples["msg:24:empty"] に hex が残る', () => {
    // event_type のみ "nx:gift:show" で、payload 構造が想定外（fn=5 が無い）
    const ev = new Uint8Array([
      ...strField(1, 'nx:gift:show')
    ]);
    const msg = new Uint8Array(lenDelimited(24, [...ev]));
    const chunked = new Uint8Array(lenDelimited(1, [...msg]));
    const r = decodeChunkedMessage(chunked);
    expect(r.gifts).toHaveLength(0);
    expect(r.unknownSamples['msg:24:empty']).toBeDefined();
    expect(r.unknownSamples['msg:24:empty'].length).toBeGreaterThan(0);
    expect(r.unknownSamples['msg:24:empty'][0].topFn).toBe(1);
    expect(r.unknownSamples['msg:24:empty'][0].msgFn).toBe(24);
  });
});

describe('v0.1.235 msg.24 nx:gift:show partial decode サンプル + props キー名', () => {
  // Helpers shared across cases
  function structStringValue(s) {
    const enc = new TextEncoder();
    const bytes = enc.encode(s);
    return lenDelimited(3, [...bytes]);
  }
  function structNumberValue(n) {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, n, true);
    return [...tag(2, 1), ...new Uint8Array(buf)];
  }
  function kv(key, valuePayload) {
    return lenDelimited(1, [
      ...strField(1, key),
      ...lenDelimited(2, valuePayload)
    ]);
  }

  it('item / uid / rank が全部欠落しても name+point が取れていれば push 成功し、3 種の partial サンプルが出る', () => {
    const mapPayload = new Uint8Array([
      ...kv('advertiser_name', structStringValue('名無し')),
      ...kv('ad_point', structNumberValue(5))
    ]);
    const ev = new Uint8Array([
      ...strField(1, 'nx:gift:show'),
      ...lenDelimited(5, [...mapPayload])
    ]);
    const msg = new Uint8Array(lenDelimited(24, [...ev]));
    const chunked = new Uint8Array(lenDelimited(1, [...msg]));
    const r = decodeChunkedMessage(chunked);
    expect(r.gifts).toHaveLength(1);
    expect(r.gifts[0].advertiserName).toBe('名無し');
    expect(r.gifts[0].point).toBe(5);
    expect(r.gifts[0].itemId).toBe('');
    expect(r.gifts[0].advertiserUserId).toBe('');
    expect(r.gifts[0].contributionRank).toBeNull();
    // 全 3 種の partial サンプルが出る（push 成功なので msg:24:empty には入らない）
    expect(r.unknownSamples['msg:24:empty']).toBeUndefined();
    expect(r.unknownSamples['msg:24:noitem']).toBeDefined();
    expect(r.unknownSamples['msg:24:nouid']).toBeDefined();
    expect(r.unknownSamples['msg:24:norank']).toBeDefined();
    // propsKeyNames に「実機 wire のキー名」が見える化されている
    const sample = r.unknownSamples['msg:24:noitem'][0];
    expect(sample.propsKeyNames).toEqual(
      expect.arrayContaining(['advertiser_name', 'ad_point'])
    );
    expect(sample.topFn).toBe(1);
    expect(sample.msgFn).toBe(24);
  });

  it('item と uid は取れていて rank だけ欠落の場合は msg:24:norank だけ出る', () => {
    const mapPayload = new Uint8Array([
      ...kv('advertiser_name', structStringValue('よしださん')),
      ...kv('advertiser_user_id', structStringValue('86255751')),
      ...kv('item_id', structStringValue('stamp_basketball')),
      ...kv('item_name', structStringValue('バスケットボール')),
      ...kv('ad_point', structNumberValue(11000))
    ]);
    const ev = new Uint8Array([
      ...strField(1, 'nx:gift:show'),
      ...lenDelimited(5, [...mapPayload])
    ]);
    const msg = new Uint8Array(lenDelimited(24, [...ev]));
    const chunked = new Uint8Array(lenDelimited(1, [...msg]));
    const r = decodeChunkedMessage(chunked);
    expect(r.gifts).toHaveLength(1);
    expect(r.unknownSamples['msg:24:noitem']).toBeUndefined();
    expect(r.unknownSamples['msg:24:nouid']).toBeUndefined();
    expect(r.unknownSamples['msg:24:norank']).toBeDefined();
    expect(r.unknownSamples['msg:24:norank'][0].propsKeyNames).toEqual(
      expect.arrayContaining(['item_id', 'item_name', 'advertiser_user_id'])
    );
  });

  it('rank まで全部取れる完全な gift では partial サンプルは一切出ない', () => {
    const mapPayload = new Uint8Array([
      ...kv('advertiser_name', structStringValue('よしださん')),
      ...kv('advertiser_user_id', structStringValue('86255751')),
      ...kv('item_id', structStringValue('stamp_basketball')),
      ...kv('item_name', structStringValue('バスケットボール')),
      ...kv('ad_point', structNumberValue(11000)),
      ...kv('contribution_rank', structNumberValue(3))
    ]);
    const ev = new Uint8Array([
      ...strField(1, 'nx:gift:show'),
      ...lenDelimited(5, [...mapPayload])
    ]);
    const msg = new Uint8Array(lenDelimited(24, [...ev]));
    const chunked = new Uint8Array(lenDelimited(1, [...msg]));
    const r = decodeChunkedMessage(chunked);
    expect(r.gifts).toHaveLength(1);
    expect(r.gifts[0].contributionRank).toBe(3);
    expect(r.unknownSamples['msg:24:noitem']).toBeUndefined();
    expect(r.unknownSamples['msg:24:nouid']).toBeUndefined();
    expect(r.unknownSamples['msg:24:norank']).toBeUndefined();
    expect(r.unknownSamples['msg:24:empty']).toBeUndefined();
  });

  it('partial サンプルは MAX_PER_KEY (3) で頭打ち', () => {
    const mapPayload = new Uint8Array([
      ...kv('advertiser_name', structStringValue('名無し')),
      ...kv('ad_point', structNumberValue(5))
    ]);
    const ev = new Uint8Array([
      ...strField(1, 'nx:gift:show'),
      ...lenDelimited(5, [...mapPayload])
    ]);
    const msg = new Uint8Array(lenDelimited(24, [...ev]));
    // 同じ ChunkedMessage に msg.24 を 5 個並べる
    const chunked = new Uint8Array(
      lenDelimited(1, [...msg, ...msg, ...msg, ...msg, ...msg])
    );
    const r = decodeChunkedMessage(chunked);
    expect(r.gifts).toHaveLength(5);
    expect(r.unknownSamples['msg:24:noitem'].length).toBe(3);
    expect(r.unknownSamples['msg:24:nouid'].length).toBe(3);
    expect(r.unknownSamples['msg:24:norank'].length).toBe(3);
  });
});

describe('decodePackedSegment', () => {
  it('decodes repeated ChunkedMessages', () => {
    const chat1 = new Uint8Array([
      ...strField(1, 'msg1'),
      ...varintField(5, 111),
      ...varintField(8, 1)
    ]);
    const msg1 = new Uint8Array(lenDelimited(1, [...chat1]));
    const cm1 = new Uint8Array(lenDelimited(2, [...msg1]));

    const chat2 = new Uint8Array([
      ...strField(1, 'msg2'),
      ...varintField(5, 222),
      ...varintField(8, 2)
    ]);
    const msg2 = new Uint8Array(lenDelimited(1, [...chat2]));
    const cm2 = new Uint8Array(lenDelimited(2, [...msg2]));

    const packed = new Uint8Array([
      ...lenDelimited(1, [...cm1]),
      ...lenDelimited(1, [...cm2])
    ]);

    const results = decodePackedSegment(packed);
    expect(results.length).toBe(2);
    expect(results[0].chats[0].no).toBe(1);
    expect(results[0].chats[0].rawUserId).toBe(111);
    expect(results[1].chats[0].no).toBe(2);
    expect(results[1].chats[0].rawUserId).toBe(222);
  });
});
