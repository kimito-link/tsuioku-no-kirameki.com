import { describe, it, expect } from 'vitest';
import {
  crawlNdgrForward,
  NDGR_FORWARD_MIN_GAP_MS,
  NDGR_FORWARD_MAX_GAP_MS
} from './ndgrForwardCrawl.js';

// ── protobuf wire encoders（ndgrBackfillCrawl.test.js と同形） ─────────────────
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
  return lenDelimited(fieldNum, [...enc.encode(str)]);
}

// ── NDGR フィクスチャ ────────────────────────────────────────────────────────
const VIEW_BASE = 'https://mpn.live.nicovideo.jp/api/view/v4/BBxAbc:view';
const SEG = (id) => `https://mpn.live.nicovideo.jp/data/segment/v4/${id}`;

function atUrl(at) {
  return `${VIEW_BASE}?at=${encodeURIComponent(String(at))}`;
}

/** `?at=now` 応答 = next ポインタ varint（field1）。decodeChunkedEntry が nextAt として拾う。 */
function nowEntryBytes(nextAt) {
  return new Uint8Array(varintField(1, nextAt));
}

/**
 * 前方向 View ChunkedEntry。segmentUris（field1=ライブ edge）/ previousUris（field3=直近過去）/
 * nextAt（field4 varint）を埋める。decodeChunkedEntry が path と field 番号で振り分ける。
 */
function viewEntryBytesFwd({ segmentUris, previousUris, nextAt } = {}) {
  const out = [];
  if (nextAt != null) out.push(...varintField(4, nextAt));
  if (Array.isArray(segmentUris)) {
    for (const u of segmentUris) out.push(...lenDelimited(1, strField(1, u)));
  }
  if (Array.isArray(previousUris)) {
    for (const u of previousUris) out.push(...lenDelimited(3, strField(1, u)));
  }
  if (out.length === 0) out.push(...strField(15, 'pad')); // 非空 padding（nextAt も URI も生まない）
  return new Uint8Array(out);
}

/** 1 件の chat を ChunkedMessage に包む（ndgrBackfillCrawl.test.js と同形）。 */
function chatChunkedMessage({ no, content, name, vpos }) {
  const chat = [];
  if (content != null) chat.push(...strField(1, content));
  if (name != null) chat.push(...strField(2, name));
  if (vpos != null) chat.push(...varintField(3, vpos));
  if (no != null) chat.push(...varintField(8, no));
  const nicoliveMsg = lenDelimited(1, chat);
  return lenDelimited(1, nicoliveMsg);
}

/** MessageSegment URI の中身 = ChunkedMessage の length-delimited stream。 */
function messageSegmentStreamBytes(chats) {
  const out = [];
  for (const c of chats) {
    const msg = chatChunkedMessage(c);
    out.push(...encodeVarint(msg.length), ...msg);
  }
  return new Uint8Array(out);
}

/** url→{ok,status,bytes} を返す fetchBinary を Map から作る。未登録 URL は 404。 */
function makeFetchFromMap(map) {
  const calls = [];
  const fetchBinary = async (url) => {
    calls.push(url);
    const entry = map.get(url);
    if (entry == null) return { ok: false, status: 404, bytes: new Uint8Array() };
    if (entry instanceof Uint8Array) return { ok: true, status: 200, bytes: entry };
    const ok = entry.status >= 200 && entry.status < 300;
    return { ok, status: entry.status, bytes: entry.bytes || new Uint8Array() };
  };
  return { fetchBinary, calls };
}

function makeNoopSleep() {
  const slept = [];
  return { sleep: async (ms) => { slept.push(ms); }, slept };
}

/** generator を回し切って全 chat と return 値を集める。 */
async function drain(gen) {
  const chatsAll = [];
  const events = [];
  let res = await gen.next();
  while (!res.done) {
    events.push(res.value);
    chatsAll.push(...res.value.chats);
    res = await gen.next();
  }
  return { result: res.value, events, chatsAll };
}

describe('crawlNdgrForward（前方向 long-poll 巡回エンジン）', () => {
  it('?at=now → ?at={cursor} → segment を取得し chats を yield する', async () => {
    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(2000));
    map.set(atUrl(2000), viewEntryBytesFwd({ segmentUris: [SEG('S0')], nextAt: 2001 }));
    map.set(SEG('S0'), messageSegmentStreamBytes([
      { no: 1, content: 'こんばんは', name: 'u1' },
      { no: 2, content: 'わこつ', name: 'u2' }
    ]));

    const { fetchBinary, calls } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    // caps rows:1 → 1 hop ぶん yield したら cap_rows で停止（無限ループを止める）。
    const { result, chatsAll } = await drain(
      crawlNdgrForward({ viewBase: VIEW_BASE, fetchBinary, sleep, now: () => 0, caps: { rows: 1 } })
    );

    expect(result.stopReason).toBe('cap_rows');
    expect(chatsAll.map((c) => c.no)).toEqual([1, 2]);
    expect(chatsAll.map((c) => c.content)).toEqual(['こんばんは', 'わこつ']);
    // 取得順序: now → at=2000 → segment S0
    expect(calls[0]).toBe(atUrl('now'));
    expect(calls[1]).toBe(atUrl(2000));
    expect(calls[2]).toBe(SEG('S0'));
  });

  it('nextAt を辿って複数 hop 前進し、visited で同一 segment を再取得しない', async () => {
    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(10));
    map.set(atUrl(10), viewEntryBytesFwd({ segmentUris: [SEG('S0')], nextAt: 20 }));
    map.set(SEG('S0'), messageSegmentStreamBytes([
      { no: 1, content: 'a' },
      { no: 2, content: 'b' }
    ]));
    // hop2: S0 は visited で再取得されず、S1 だけ取得する。
    map.set(atUrl(20), viewEntryBytesFwd({ segmentUris: [SEG('S0'), SEG('S1')], nextAt: 30 }));
    map.set(SEG('S1'), messageSegmentStreamBytes([{ no: 3, content: 'c' }]));

    const { fetchBinary, calls } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result, chatsAll } = await drain(
      crawlNdgrForward({ viewBase: VIEW_BASE, fetchBinary, sleep, now: () => 0, caps: { rows: 3 } })
    );

    expect(result.stopReason).toBe('cap_rows');
    expect(chatsAll.map((c) => c.no)).toEqual([1, 2, 3]);
    // S0 は 1 回だけ fetch（hop2 では visited で skip）。
    expect(calls.filter((u) => u === SEG('S0')).length).toBe(1);
    expect(calls.filter((u) => u === SEG('S1')).length).toBe(1);
  });

  it('previousUris（直近過去）も同 hop で取得する', async () => {
    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(100));
    map.set(
      atUrl(100),
      viewEntryBytesFwd({ segmentUris: [SEG('EDGE')], previousUris: [SEG('PREV')], nextAt: 101 })
    );
    map.set(SEG('EDGE'), messageSegmentStreamBytes([
      { no: 10, content: 'edge1' },
      { no: 11, content: 'edge2' }
    ]));
    map.set(SEG('PREV'), messageSegmentStreamBytes([{ no: 9, content: 'prev' }]));

    const { fetchBinary, calls } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result, chatsAll } = await drain(
      crawlNdgrForward({ viewBase: VIEW_BASE, fetchBinary, sleep, now: () => 0, caps: { rows: 3 } })
    );

    expect(result.stopReason).toBe('cap_rows');
    expect(chatsAll.map((c) => c.no)).toEqual([10, 11, 9]); // edge → previous の順
    expect(calls).toContain(SEG('EDGE'));
    expect(calls).toContain(SEG('PREV'));
  });

  it('429 が続くと backoff を使い切って rate_limited で停止する', async () => {
    const map = new Map();
    map.set(atUrl('now'), { status: 429, bytes: new Uint8Array() });

    const { fetchBinary } = makeFetchFromMap(map);
    const { sleep, slept } = makeNoopSleep();
    const { result } = await drain(
      crawlNdgrForward({ viewBase: VIEW_BASE, fetchBinary, sleep, now: () => 0 })
    );

    expect(result.stopReason).toBe('rate_limited');
    // backoff 列（2000/4000/8000）を待ってから諦める。
    expect(slept).toEqual([2000, 4000, 8000]);
  });

  it('abort 済み signal では即 aborted で停止する', async () => {
    const ac = new AbortController();
    ac.abort();
    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(2000));

    const { fetchBinary, calls } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result } = await drain(
      crawlNdgrForward({ viewBase: VIEW_BASE, fetchBinary, sleep, signal: ac.signal })
    );

    expect(result.stopReason).toBe('aborted');
    expect(calls.length).toBe(0); // fetch する前に止まる
  });

  it('viewBase 不正なら no_view_base で即停止する', async () => {
    const { sleep } = makeNoopSleep();
    const { result } = await drain(
      crawlNdgrForward({ viewBase: '', fetchBinary: async () => ({ ok: true, status: 200, bytes: new Uint8Array([1]) }), sleep })
    );
    expect(result.stopReason).toBe('no_view_base');
  });

  it('?at=now から使えるカーソルが得られないと no_cursor で停止する', async () => {
    const map = new Map();
    // 200 だが空応答 → transient リトライを使い切ってカーソル取得不能 → no_cursor。
    map.set(atUrl('now'), { status: 200, bytes: new Uint8Array() });

    const { fetchBinary } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result } = await drain(
      crawlNdgrForward({ viewBase: VIEW_BASE, fetchBinary, sleep })
    );
    expect(result.stopReason).toBe('no_cursor');
  });

  it('long-poll 待機は nextAt が遠い未来なら maxGap に丸める', async () => {
    const ac = new AbortController();
    const slept = [];
    // カーソル前進の待機（maxGap）を観測したら次ループ冒頭で止める。
    const sleep = async (ms) => {
      slept.push(ms);
      if (ms >= NDGR_FORWARD_MAX_GAP_MS) ac.abort();
    };
    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(50));
    // nextAt=1_000_000 秒（now=0ms から見て遠い未来）→ wait = clamp(huge) = maxGap。
    map.set(atUrl(50), viewEntryBytesFwd({ segmentUris: [SEG('S0')], nextAt: 1_000_000 }));
    map.set(SEG('S0'), messageSegmentStreamBytes([{ no: 1, content: 'a' }]));

    const { fetchBinary } = makeFetchFromMap(map);
    const { result, chatsAll } = await drain(
      crawlNdgrForward({ viewBase: VIEW_BASE, fetchBinary, sleep, now: () => 0, signal: ac.signal })
    );

    expect(chatsAll.map((c) => c.no)).toEqual([1]);
    expect(result.stopReason).toBe('aborted');
    expect(slept).toContain(NDGR_FORWARD_MAX_GAP_MS);
  });

  it('long-poll 待機は nextAt が過去/現在なら minGap に丸める', async () => {
    const ac = new AbortController();
    const slept = [];
    const sleep = async (ms) => {
      slept.push(ms);
      // カーソル前進の最小待機を 1 回観測したら止める（segment gap 15ms とは区別）。
      if (ms === NDGR_FORWARD_MIN_GAP_MS) ac.abort();
    };
    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(5000));
    // now=10_000_000ms（=10000秒）。nextAt=5000秒 → wait 負 → clamp minGap。
    map.set(atUrl(5000), viewEntryBytesFwd({ segmentUris: [SEG('S0')], nextAt: 5000 }));
    map.set(SEG('S0'), messageSegmentStreamBytes([{ no: 1, content: 'a' }]));

    const { fetchBinary } = makeFetchFromMap(map);
    const { result, chatsAll } = await drain(
      crawlNdgrForward({
        viewBase: VIEW_BASE,
        fetchBinary,
        sleep,
        now: () => 10_000_000,
        signal: ac.signal
      })
    );

    expect(chatsAll.map((c) => c.no)).toEqual([1]);
    expect(result.stopReason).toBe('aborted');
    expect(slept).toContain(NDGR_FORWARD_MIN_GAP_MS);
  });
});
