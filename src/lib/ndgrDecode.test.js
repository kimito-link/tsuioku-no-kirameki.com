import { describe, it, expect } from 'vitest';
import {
  pbVarint,
  pbForEach,
  decodeStatistics,
  decodeChat,
  decodeGift,
  pickNdgrGiftAdvertiserUserId,
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
  });

  it('handles partial statistics', () => {
    const buf = new Uint8Array(varintField(1, 100));
    const stats = decodeStatistics(buf, 0, buf.length);
    expect(stats.viewers).toBe(100);
    expect(stats.comments).toBeNull();
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

describe('pickNdgrGiftAdvertiserUserId', () => {
  it('field 5 varint を field 1 より優先', () => {
    expect(
      pickNdgrGiftAdvertiserUserId([
        { fieldNum: 1, val: '4046119', kind: 'varint' },
        { fieldNum: 5, val: '87654321', kind: 'varint' }
      ])
    ).toBe('87654321');
  });

  it('field 3 varint を field 1 より優先', () => {
    expect(
      pickNdgrGiftAdvertiserUserId([
        { fieldNum: 1, val: '4046119', kind: 'varint' },
        { fieldNum: 3, val: '87654321', kind: 'varint' }
      ])
    ).toBe('87654321');
  });

  it('nestedChatRaw は field 5 より優先', () => {
    expect(
      pickNdgrGiftAdvertiserUserId([
        { fieldNum: 5, val: '11111111', kind: 'varint' },
        { fieldNum: 7, val: '87654321', kind: 'nestedChatRaw' }
      ])
    ).toBe('87654321');
  });

  it('nestedChatRaw 同士は深い _nestDepth を優先', () => {
    expect(
      pickNdgrGiftAdvertiserUserId([
        { fieldNum: 1, val: '11111111', kind: 'nestedChatRaw', _nestDepth: 0 },
        { fieldNum: 2, val: '87654321', kind: 'nestedChatRaw', _nestDepth: 2 }
      ])
    ).toBe('87654321');
  });
});

describe('decodeGift', () => {
  it('pulls advertiser id and name from len/varint fields', () => {
    const buf = new Uint8Array([
      ...strField(2, 'senderNick'),
      ...varintField(3, 87654321)
    ]);
    const g = decodeGift(buf, 0, buf.length);
    expect(g.advertiserUserId).toBe('87654321');
    expect(g.advertiserName).toBe('senderNick');
  });

  it('field 1 の誤検出 ID より field 3 の送り主 ID を採用（誤結合回帰）', () => {
    const buf = new Uint8Array([
      ...varintField(1, 4046119),
      ...strField(2, 'kusa'),
      ...varintField(3, 87654321)
    ]);
    const g = decodeGift(buf, 0, buf.length);
    expect(g.advertiserUserId).toBe('87654321');
    expect(g.advertiserName).toBe('kusa');
  });

  it('field 5 があれば field 3 より優先（Chat raw_user_id と整合）', () => {
    const buf = new Uint8Array([
      ...strField(2, 'ギフト送り'),
      ...varintField(3, 11111111),
      ...varintField(5, 87654321)
    ]);
    const g = decodeGift(buf, 0, buf.length);
    expect(g.advertiserUserId).toBe('87654321');
    expect(g.advertiserName).toBe('ギフト送り');
  });

  it('LEN ネスト内の field5 raw_user_id を最優先し、表示名もネストから取る', () => {
    const nested = new Uint8Array([
      ...varintField(5, 87654321),
      ...strField(2, '本物の送り主')
    ]);
    const buf = new Uint8Array([
      ...varintField(1, 4046119),
      ...strField(2, '表層ラベル'),
      ...lenDelimited(7, [...nested])
    ]);
    const g = decodeGift(buf, 0, buf.length);
    expect(g.advertiserUserId).toBe('87654321');
    expect(g.advertiserName).toBe('本物の送り主');
  });

  it('二段 LEN の奥の field5 も拾う', () => {
    const core = new Uint8Array([
      ...varintField(5, 87654321),
      ...strField(2, '奥の送り主')
    ]);
    const mid = new Uint8Array(lenDelimited(11, [...core]));
    const buf = new Uint8Array([
      ...varintField(1, 4046119),
      ...lenDelimited(10, [...mid])
    ]);
    const g = decodeGift(buf, 0, buf.length);
    expect(g.advertiserUserId).toBe('87654321');
    expect(g.advertiserName).toBe('奥の送り主');
  });

  it('field5 が数字のみの LEN 文字列でも送り主として採用', () => {
    const nested = new Uint8Array([
      ...strField(5, '87654321'),
      ...strField(2, 'str5nick')
    ]);
    const buf = new Uint8Array([...lenDelimited(9, [...nested])]);
    const g = decodeGift(buf, 0, buf.length);
    expect(g.advertiserUserId).toBe('87654321');
    expect(g.advertiserName).toBe('str5nick');
  });

  it('field 2 が nicolive_ 内部ラベルのときは表示名にせず別の LEN を採用', () => {
    const buf = new Uint8Array([
      ...strField(2, 'nicolive_audition_lightgreen'),
      ...strField(2, 'AIコメントジェネレータテトス'),
      ...varintField(3, 10170134)
    ]);
    const g = decodeGift(buf, 0, buf.length);
    expect(g.advertiserUserId).toBe('10170134');
    expect(g.advertiserName).toBe('AIコメントジェネレータテトス');
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

  it('decodes gift from NicoliveMessage field 8', () => {
    const gift = new Uint8Array([
      ...strField(2, 'ギフト送り'),
      ...varintField(3, 87654321)
    ]);
    const nicoliveMessage = new Uint8Array(lenDelimited(8, [...gift]));
    const chunkedMessage = new Uint8Array(lenDelimited(2, [...nicoliveMessage]));

    const result = decodeChunkedMessage(chunkedMessage);
    expect(result.chats.length).toBe(0);
    expect(result.gifts.length).toBe(1);
    expect(result.gifts[0].advertiserUserId).toBe('87654321');
    expect(result.gifts[0].advertiserName).toBe('ギフト送り');
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
