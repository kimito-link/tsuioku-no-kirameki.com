import { describe, it, expect } from 'vitest';
import {
  readNdgrViewEntry,
  ndgrMessageAtMs,
  ndgrCommentsFromSegment,
  ndgrGiftsFromSegment,
  chatUserId,
  followNdgrLive,
  NDGR_FOLLOW_MAX_FAILS
} from './ndgrLiveFollow.js';

// ── 公開の型(n-air-app/nicolive-comment-protobuf)どおりの模型 ──────────────
const ev = (v) => {
  const b = [];
  while (v > 0x7f) {
    b.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  b.push(v);
  return b;
};
const tag = (f, w) => ev((f << 3) | w);
const ld = (f, p) => [...tag(f, 2), ...ev(p.length), ...p];
const vi = (f, v) => [...tag(f, 0), ...ev(v)];
const st = (f, s) => ld(f, [...new TextEncoder().encode(s)]);
const frame = (p) => [...ev(p.length), ...p];
const ts = (ms) => [...vi(1, Math.floor(ms / 1000)), ...vi(2, (ms % 1000) * 1e6)];

const SEG = (n) => `https://mpn.live.nicovideo.jp/data/segment/v4/s${n}`;
const segmentEntry = (n, fromSec) =>
  ld(1, [...ld(1, ts(fromSec * 1000)), ...ld(2, ts((fromSec + 16) * 1000)), ...st(3, SEG(n))]);
const previousEntry = (n) => ld(3, [...ld(1, ts(0)), ...ld(2, ts(16_000)), ...st(3, SEG(n))]);
const nextEntry = (at) => ld(4, vi(1, at));
const backwardEntry = () => ld(2, st(1, 'https://mpn.live.nicovideo.jp/data/backward/v4/b'));
const viewBytes = (...entries) => new Uint8Array(entries.flatMap((e) => frame(e)));
const chatMessage = ({ no, text, name = '', atMs }) =>
  frame([
    ...ld(1, [...st(1, `id${no}`), ...ld(2, ts(atMs))]),
    ...ld(2, ld(1, [...st(1, text), ...(name ? st(2, name) : []), ...vi(3, 100), ...vi(8, no)]))
  ]);

describe('readNdgrViewEntry', () => {
  it('segment / previous / next / backward を番号どおりに読み分ける', () => {
    const seg = readNdgrViewEntry(new Uint8Array(segmentEntry(1, 1000)));
    expect(seg).toMatchObject({ kind: 'segment', uri: SEG(1), untilMs: 1016_000 });
    expect(readNdgrViewEntry(new Uint8Array(previousEntry(2)))).toMatchObject({ kind: 'previous', uri: SEG(2) });
    expect(readNdgrViewEntry(new Uint8Array(nextEntry(1_761_000_000)))).toMatchObject({ kind: 'next', at: 1_761_000_000 });
    expect(readNdgrViewEntry(new Uint8Array(backwardEntry())).kind).toBe('backward');
  });

  it('★segment の from の秒数を next と取り違えない(ndgrForwardCrawl が踏んだ形)', () => {
    const r = readNdgrViewEntry(new Uint8Array(segmentEntry(1, 1234)));
    expect(r.at).toBe(0);
  });

  it('http でない URI は捨てる(壊れた応答を叩きに行かない)', () => {
    const bad = ld(1, [...ld(2, ts(1000)), ...st(3, 'javascript:alert(1)')]);
    expect(readNdgrViewEntry(new Uint8Array(bad)).uri).toBe('');
  });
});

describe('ndgrCommentsFromSegment / ndgrMessageAtMs', () => {
  it('コメントの本文・番号・名前・付いた時刻を取り出す', () => {
    const bytes = new Uint8Array([
      ...chatMessage({ no: 1, text: 'こんばんは', name: 'りんく', atMs: 1_761_000_000_250 }),
      ...chatMessage({ no: 2, text: '8888', atMs: 1_761_000_001_000 })
    ]);
    expect(ndgrCommentsFromSegment(bytes)).toEqual([
      { no: '1', text: 'こんばんは', name: 'りんく', userId: '', atMs: 1_761_000_000_250 },
      { no: '2', text: '8888', name: '', userId: '', atMs: 1_761_000_001_000 }
    ]);
  });

  it('meta が無ければ時刻は 0', () => {
    expect(ndgrMessageAtMs(new Uint8Array(ld(2, ld(1, st(1, 'x')))))).toBe(0);
  });

  it('途中で切れた末尾は捨てて、確定した分だけ返す', () => {
    const one = chatMessage({ no: 1, text: 'a', atMs: 1000 });
    const two = chatMessage({ no: 2, text: 'b', atMs: 2000 });
    const bytes = new Uint8Array([...one, ...two.slice(0, two.length - 2)]);
    expect(ndgrCommentsFromSegment(bytes).map((r) => r.no)).toEqual(['1']);
  });
});

/** 偽のニコ生: view は at ごとに segment と next を返し、segment は決まったコメントを返す。 */
function fakeServer({ views, segments, statuses = {} }) {
  const calls = [];
  const fetchBytes = async (url) => {
    calls.push(url);
    if (statuses[url]) return { status: statuses[url], bytes: new Uint8Array() };
    if (url.includes('/data/segment/')) return { status: 200, bytes: segments[url] || new Uint8Array() };
    const at = new URL(url).searchParams.get('at');
    return views[at] ? { status: 200, bytes: views[at] } : { status: 200, bytes: viewBytes(nextEntry(Number(at) || 1)) };
  };
  return { fetchBytes, calls };
}

describe('followNdgrLive', () => {
  it('now → next.at の順に view を辿り、新しい segment のコメントだけを渡す(previous は読まない)', async () => {
    const ac = new AbortController();
    const got = [];
    const srv = fakeServer({
      views: {
        now: viewBytes(previousEntry(0), segmentEntry(1, 100), nextEntry(116)),
        116: viewBytes(segmentEntry(1, 100), segmentEntry(2, 116), nextEntry(132))
      },
      segments: {
        [SEG(1)]: new Uint8Array(chatMessage({ no: 1, text: 'one', atMs: 101_000 })),
        [SEG(2)]: new Uint8Array(chatMessage({ no: 2, text: 'two', atMs: 117_000 }))
      }
    });
    const r = await followNdgrLive({
      viewUri: 'https://mpn.live.nicovideo.jp/api/view/v4/abc',
      fetchBytes: async (u) => {
        if (u.endsWith('at=132')) {
          await new Promise((res) => setTimeout(res, 0)); // 読みかけの segment が終わってから止める
          ac.abort();
        }
        return srv.fetchBytes(u);
      },
      onComments: (rows) => got.push(...rows.map((x) => x.text)),
      signal: ac.signal,
      sleep: async () => {}
    });
    expect(r).toBe('aborted');
    expect(got.sort()).toEqual(['one', 'two']);
    expect(srv.calls.filter((u) => u === SEG(1))).toHaveLength(1); // 同じ segment は2回読まない
    expect(srv.calls).not.toContain(SEG(0)); // previous は読まない
  });

  it('429 が続いたら間を空けてからあきらめる(叩き続けない)', async () => {
    const waits = [];
    const r = await followNdgrLive({
      viewUri: 'https://x/api/view/v4/a',
      fetchBytes: async () => ({ status: 429, bytes: new Uint8Array() }),
      onComments: () => {},
      sleep: async (ms) => { waits.push(ms); }
    });
    expect(r).toBe('too_many_errors');
    expect(waits).toHaveLength(NDGR_FOLLOW_MAX_FAILS - 1);
    expect(Math.min(...waits)).toBeGreaterThanOrEqual(10_000);
  });

  it('viewUri が無ければ何も叩かない', async () => {
    let n = 0;
    const r = await followNdgrLive({ viewUri: '', fetchBytes: async () => { n += 1; return { status: 200, bytes: new Uint8Array() }; }, onComments: () => {} });
    expect(r).toBe('no_view');
    expect(n).toBe(0);
  });
});

const giftMessage = ({ name, itemName, point, atMs }) =>
  frame([
    ...ld(1, [...st(1, 'g1'), ...ld(2, ts(atMs))]),
    ...ld(2, ld(8, [...st(1, 'item-1'), ...vi(2, 123), ...st(3, name), ...vi(4, point), ...st(6, itemName)]))
  ]);

describe('ndgrGiftsFromSegment', () => {
  it('ギフトの送り主・アイテム名・ポイントを取り出し、コメントとは混ぜない', () => {
    const bytes = new Uint8Array([
      ...chatMessage({ no: 1, text: 'こんばんは', atMs: 1000 }),
      ...giftMessage({ name: 'こん太', itemName: 'きらきら', point: 500, atMs: 2000 })
    ]);
    expect(ndgrGiftsFromSegment(bytes)).toEqual([{ name: 'こん太', itemName: 'きらきら', point: 500, atMs: 2000 }]);
    expect(ndgrCommentsFromSegment(bytes).map((r) => r.text)).toEqual(['こんばんは']);
  });

  it('followNdgrLive は onGifts があるときだけギフトを渡す', async () => {
    const ac = new AbortController();
    const gifts = [];
    const seg = new Uint8Array(giftMessage({ name: 'たぬ姉', itemName: 'はなまる', point: 100, atMs: 101_000 }));
    await followNdgrLive({
      viewUri: 'https://mpn.live.nicovideo.jp/api/view/v4/abc',
      fetchBytes: async (u) => {
        if (u.includes('/data/segment/')) return { status: 200, bytes: seg };
        if (u.endsWith('at=now')) return { status: 200, bytes: viewBytes(segmentEntry(1, 100), nextEntry(116)) };
        await new Promise((res) => setTimeout(res, 0));
        ac.abort();
        return { status: 200, bytes: new Uint8Array() };
      },
      onComments: () => {},
      onGifts: (rows) => gifts.push(...rows),
      signal: ac.signal,
      sleep: async () => {}
    });
    expect(gifts.map((g) => g.itemName)).toEqual(['はなまる']);
  });
});

describe('chatUserId', () => {
  it('数値 ID を先に、無ければ ID の形をした匿名 ID、どちらも無ければ空', () => {
    expect(chatUserId({ rawUserId: 143172392, hashedUserId: 'a:abcdefgh' })).toBe('143172392');
    expect(chatUserId({ rawUserId: null, hashedUserId: 'a:abcdefgh' })).toBe('a:abcdefgh');
    expect(chatUserId({ rawUserId: 0, hashedUserId: 'バスケットボール' })).toBe('');
  });
});
