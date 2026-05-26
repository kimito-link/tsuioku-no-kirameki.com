import { describe, it, expect } from 'vitest';
import {
  crawlNdgrBackward,
  NDGR_BACKFILL_DEFAULT_CAPS,
  NDGR_BACKFILL_FETCH_GAP_MS,
  NDGR_BACKFILL_BACKOFF_MS
} from './ndgrBackfillCrawl.js';

// ── protobuf wire encoders（ndgrDecode.test.js と同形） ──────────────────────
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

// ── NDGR メッセージ・フィクスチャ ──────────────────────────────────────────
// view base（PoC の host）。
const VIEW_BASE = 'https://mpn.live.nicovideo.jp/api/view/v4/BBxAbc:view';

/** `?at={at}` の URL（エンジンと同じ組み立て）。 */
function atUrl(at) {
  return `${VIEW_BASE}?at=${encodeURIComponent(String(at))}`;
}

/** ?at=now の応答 = next ポインタ varint だけ（PoC で 9 バイト）。 */
function nowEntryBytes(nextAt) {
  return new Uint8Array(varintField(1, nextAt));
}

/**
 * ChunkedEntry を作る。各 oneof（backward/segment/snapshot）は「message の中に
 * uri 文字列」。field 番号は decodeChunkedEntry が path 分類で番号非依存なので
 * 何でもよいが、実形に寄せて backward=1 / segment=2 / snapshot=9 にする。
 * next ポインタ varint も持たせられる。
 */
function chunkedEntryBytes({ backwardUri, segmentUris = [], snapshotUri, nextAt } = {}) {
  const out = [];
  if (nextAt != null) out.push(...varintField(7, nextAt));
  if (backwardUri) out.push(...lenDelimited(1, strField(1, backwardUri)));
  for (const s of segmentUris) out.push(...lenDelimited(2, strField(1, s)));
  if (snapshotUri) out.push(...lenDelimited(9, strField(1, snapshotUri)));
  return new Uint8Array(out);
}

/**
 * 1 件の chat を ChunkedMessage の中に包む。
 *   PackedSegment.field1(LEN) = ChunkedMessage
 *   ChunkedMessage.field1(LEN) = NicoliveMessage
 *   NicoliveMessage.field1(LEN) = Chat
 *   Chat: no@8(varint), content@1(str), name@2(str), rawUserId@5(varint), vpos@3(varint)
 */
function chatBytes({ no, content, name, rawUserId, vpos }) {
  const chat = [];
  if (content != null) chat.push(...strField(1, content));
  if (name != null) chat.push(...strField(2, name));
  if (vpos != null) chat.push(...varintField(3, vpos));
  if (rawUserId != null) chat.push(...varintField(5, rawUserId));
  if (no != null) chat.push(...varintField(8, no));
  const nicoliveMsg = lenDelimited(1, chat); // NicoliveMessage.field1 = Chat
  const chunkedMessage = lenDelimited(1, nicoliveMsg); // ChunkedMessage.field1 = NicoliveMessage
  return chunkedMessage;
}

/** 複数 chat を持つ PackedSegment（field1 repeated ChunkedMessage）。 */
function segmentBytes(chats) {
  const out = [];
  for (const c of chats) out.push(...lenDelimited(1, chatBytes(c)));
  return new Uint8Array(out);
}

/**
 * url→{ok,status,bytes} を返す fetchBinary を Map から作る。
 * status を指定したいときは値を `{ status, bytes }` で渡す。未登録 URL は 404。
 */
function makeFetchFromMap(map) {
  const calls = [];
  const fetchBinary = async (url) => {
    calls.push(url);
    const entry = map.get(url);
    if (entry == null) return { ok: false, status: 404, bytes: new Uint8Array() };
    if (entry instanceof Uint8Array) {
      return { ok: true, status: 200, bytes: entry };
    }
    // { status, bytes }
    const ok = entry.status >= 200 && entry.status < 300;
    return { ok, status: entry.status, bytes: entry.bytes || new Uint8Array() };
  };
  return { fetchBinary, calls };
}

/** sleep を no-op に（待機ゼロでテスト即完了）。呼ばれた ms を記録。 */
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

describe('crawlNdgrBackward（過去ログ backward 巡回エンジン）', () => {
  it('backward を最後まで辿り、配信開始で backward_exhausted で停止する', async () => {
    // now → entry@1000（seg=A, backward=entry@900）→ entry@900（seg=B, backward 無し）
    const ENTRY1 = atUrl(1000);
    const ENTRY0_URI = `${VIEW_BASE.replace('/view/', '/data/backward/')}/v4/PREV0`;
    const SEG_A = `https://mpn.live.nicovideo.jp/data/segment/v4/SEG_A`;
    const SEG_B = `https://mpn.live.nicovideo.jp/data/segment/v4/SEG_B`;

    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    map.set(ENTRY1, chunkedEntryBytes({ backwardUri: ENTRY0_URI, segmentUris: [SEG_A] }));
    map.set(ENTRY0_URI, chunkedEntryBytes({ segmentUris: [SEG_B] })); // backward 無し = 配信開始
    map.set(SEG_A, segmentBytes([{ no: 50, content: 'これは新しい方', name: 'u1' }]));
    map.set(SEG_B, segmentBytes([{ no: 10, content: '配信開始直後', name: 'u2' }]));

    const { fetchBinary } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result, chatsAll } = await drain(
      crawlNdgrBackward({ viewBase: VIEW_BASE, fetchBinary, sleep })
    );

    expect(result.stopReason).toBe('backward_exhausted');
    expect(chatsAll.map((c) => c.no)).toEqual([50, 10]);
    expect(chatsAll.map((c) => c.content)).toEqual(['これは新しい方', '配信開始直後']);
    expect(result.segmentsFetched).toBe(2);
  });

  it('同一 backward URI に戻されても無限ループせず visited_revisit で停止する', async () => {
    const ENTRY1 = atUrl(1000);
    const SELF = `https://mpn.live.nicovideo.jp/data/backward/v4/SELF_LOOP`;
    const SEG_A = `https://mpn.live.nicovideo.jp/data/segment/v4/SEG_LOOP`;

    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    // entry@1000 の backward が SELF を指し、SELF の backward もまた SELF（自己ループ）。
    map.set(ENTRY1, chunkedEntryBytes({ backwardUri: SELF, segmentUris: [SEG_A] }));
    map.set(SELF, chunkedEntryBytes({ backwardUri: SELF, segmentUris: [] }));
    map.set(SEG_A, segmentBytes([{ no: 5, content: 'once', name: 'u' }]));

    const { fetchBinary } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result, chatsAll } = await drain(
      crawlNdgrBackward({ viewBase: VIEW_BASE, fetchBinary, sleep })
    );

    expect(result.stopReason).toBe('visited_revisit');
    // SEG_A は 1 回だけ取り込まれる。
    expect(chatsAll.map((c) => c.no)).toEqual([5]);
  });

  it('segment 数 cap に達したら cap_segments で停止する', async () => {
    // backward を延々辿れるチェーン（entry@N → entry@N-1）。各 entry が 1 seg。
    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    // 連番 backward URI を 10 段作る。
    let prevKey = atUrl(1000);
    for (let i = 0; i < 10; i += 1) {
      const segUri = `https://mpn.live.nicovideo.jp/data/segment/v4/SEG_${i}`;
      const backUri = `https://mpn.live.nicovideo.jp/data/backward/v4/BK_${i}`;
      map.set(prevKey, chunkedEntryBytes({ backwardUri: backUri, segmentUris: [segUri] }));
      map.set(segUri, segmentBytes([{ no: 100 - i, content: `c${i}`, name: 'u' }]));
      prevKey = backUri;
    }

    const { fetchBinary } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result } = await drain(
      crawlNdgrBackward({
        viewBase: VIEW_BASE,
        fetchBinary,
        sleep,
        caps: { segments: 3 }
      })
    );

    expect(result.stopReason).toBe('cap_segments');
    expect(result.segmentsFetched).toBe(3);
  });

  it('経過時間 cap に達したら cap_elapsed で停止する', async () => {
    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    let prevKey = atUrl(1000);
    for (let i = 0; i < 10; i += 1) {
      const segUri = `https://mpn.live.nicovideo.jp/data/segment/v4/T_SEG_${i}`;
      const backUri = `https://mpn.live.nicovideo.jp/data/backward/v4/T_BK_${i}`;
      map.set(prevKey, chunkedEntryBytes({ backwardUri: backUri, segmentUris: [segUri] }));
      map.set(segUri, segmentBytes([{ no: 100 - i, content: `c${i}`, name: 'u' }]));
      prevKey = backUri;
    }

    // now() を呼ぶたびに 40 秒進める偽クロック。elapsedMs=90000 なので数回で超える。
    let t = 0;
    const now = () => {
      t += 40_000;
      return t;
    };
    const { fetchBinary } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result } = await drain(
      crawlNdgrBackward({ viewBase: VIEW_BASE, fetchBinary, sleep, now })
    );

    expect(result.stopReason).toBe('cap_elapsed');
  });

  it('累計取り込み行数が rows cap に達したら cap_rows で停止する', async () => {
    const ENTRY1 = atUrl(1000);
    const SEG_A = `https://mpn.live.nicovideo.jp/data/segment/v4/ROWS_A`;
    const BK = `https://mpn.live.nicovideo.jp/data/backward/v4/ROWS_BK`;
    const SEG_B = `https://mpn.live.nicovideo.jp/data/segment/v4/ROWS_B`;

    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    map.set(ENTRY1, chunkedEntryBytes({ backwardUri: BK, segmentUris: [SEG_A] }));
    map.set(BK, chunkedEntryBytes({ segmentUris: [SEG_B] }));
    // SEG_A に 3 件 → rows cap=2 を超える。
    map.set(
      SEG_A,
      segmentBytes([
        { no: 30, content: 'a', name: 'u' },
        { no: 29, content: 'b', name: 'u' },
        { no: 28, content: 'c', name: 'u' }
      ])
    );
    map.set(SEG_B, segmentBytes([{ no: 1, content: 'd', name: 'u' }]));

    const { fetchBinary } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result, chatsAll } = await drain(
      crawlNdgrBackward({ viewBase: VIEW_BASE, fetchBinary, sleep, caps: { rows: 2 } })
    );

    expect(result.stopReason).toBe('cap_rows');
    // SEG_A の 1 batch（3 件）を yield した直後に cap 判定で止まる。SEG_B には進まない。
    expect(chatsAll.map((c) => c.no)).toEqual([30, 29, 28]);
  });

  it('既知の最小 commentNo に到達したら known_min_reached で早期終了する', async () => {
    const ENTRY1 = atUrl(1000);
    const SEG_A = `https://mpn.live.nicovideo.jp/data/segment/v4/MIN_A`;
    const BK = `https://mpn.live.nicovideo.jp/data/backward/v4/MIN_BK`;
    const SEG_B = `https://mpn.live.nicovideo.jp/data/segment/v4/MIN_B`;

    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    map.set(ENTRY1, chunkedEntryBytes({ backwardUri: BK, segmentUris: [SEG_A] }));
    map.set(BK, chunkedEntryBytes({ segmentUris: [SEG_B] }));
    // SEG_A の最小 no=20。既知最小=20 なので SEG_A 取り込み後に早期終了。
    map.set(
      SEG_A,
      segmentBytes([
        { no: 25, content: 'x', name: 'u' },
        { no: 20, content: 'y', name: 'u' }
      ])
    );
    map.set(SEG_B, segmentBytes([{ no: 5, content: 'z', name: 'u' }]));

    const { fetchBinary, calls } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result, chatsAll } = await drain(
      crawlNdgrBackward({
        viewBase: VIEW_BASE,
        fetchBinary,
        sleep,
        knownMinCommentNo: 20
      })
    );

    expect(result.stopReason).toBe('known_min_reached');
    expect(chatsAll.map((c) => c.no)).toEqual([25, 20]);
    // SEG_B は fetch されない（早期終了でコスト削減）。
    expect(calls).not.toContain(SEG_B);
  });

  it('429 を backoff 上限まで受けたら rate_limited で停止し backoff を踏む', async () => {
    const ENTRY1 = atUrl(1000);
    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    // 最初の ChunkedEntry が常に 429。
    map.set(ENTRY1, { status: 429, bytes: new Uint8Array() });

    const { fetchBinary } = makeFetchFromMap(map);
    const { sleep, slept } = makeNoopSleep();
    const { result } = await drain(
      crawlNdgrBackward({ viewBase: VIEW_BASE, fetchBinary, sleep })
    );

    expect(result.stopReason).toBe('rate_limited');
    // gap(1回) + backoff 3 段が踏まれている。
    for (const b of NDGR_BACKFILL_BACKOFF_MS) {
      expect(slept).toContain(b);
    }
  });

  it('AbortSignal が立っていたら aborted で即停止する', async () => {
    const ac = new AbortController();
    ac.abort();
    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));

    const { fetchBinary, calls } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result } = await drain(
      crawlNdgrBackward({ viewBase: VIEW_BASE, fetchBinary, sleep, signal: ac.signal })
    );

    expect(result.stopReason).toBe('aborted');
    expect(calls.length).toBe(0); // 1 件も fetch しない
  });

  it('viewBase が空 / fetchBinary 不正なら no_view_base で何もしない', async () => {
    const g1 = crawlNdgrBackward({ viewBase: '', fetchBinary: async () => ({ ok: true, status: 200, bytes: new Uint8Array() }) });
    const r1 = await drain(g1);
    expect(r1.result.stopReason).toBe('no_view_base');

    const g2 = crawlNdgrBackward({ viewBase: VIEW_BASE, fetchBinary: null });
    const r2 = await drain(g2);
    expect(r2.result.stopReason).toBe('no_view_base');
  });

  it('?at=now が空 / nextAt 無しなら no_entry で停止する', async () => {
    const map = new Map();
    // ?at=now は登録するが nextAt を持たない（空 ChunkedEntry）。
    map.set(atUrl('now'), new Uint8Array([]));
    const { fetchBinary } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result } = await drain(
      crawlNdgrBackward({ viewBase: VIEW_BASE, fetchBinary, sleep })
    );
    expect(result.stopReason).toBe('no_entry');
  });

  it('最初の fetch には gap を入れず、2 回目以降に fetchGap を入れる', async () => {
    const ENTRY1 = atUrl(1000);
    const SEG_A = `https://mpn.live.nicovideo.jp/data/segment/v4/GAP_A`;
    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    map.set(ENTRY1, chunkedEntryBytes({ segmentUris: [SEG_A] })); // backward 無し
    map.set(SEG_A, segmentBytes([{ no: 1, content: 'g', name: 'u' }]));

    const { fetchBinary } = makeFetchFromMap(map);
    const { sleep, slept } = makeNoopSleep();
    await drain(crawlNdgrBackward({ viewBase: VIEW_BASE, fetchBinary, sleep, fetchGapMs: 600 }));

    // ?at=now（1回目・gap無し）→ entry（gap）→ segment（gap）。gap=600 が 2 回。
    const gaps = slept.filter((ms) => ms === 600);
    expect(gaps.length).toBe(2);
  });

  it('デフォルト定数が想定値', () => {
    expect(NDGR_BACKFILL_DEFAULT_CAPS.segments).toBe(300);
    expect(NDGR_BACKFILL_DEFAULT_CAPS.elapsedMs).toBe(90_000);
    expect(NDGR_BACKFILL_DEFAULT_CAPS.bytes).toBe(30_000_000);
    expect(NDGR_BACKFILL_DEFAULT_CAPS.rows).toBe(50_000);
    expect(NDGR_BACKFILL_FETCH_GAP_MS).toBe(600);
    expect(NDGR_BACKFILL_BACKOFF_MS).toEqual([2_000, 4_000, 8_000]);
  });
});
