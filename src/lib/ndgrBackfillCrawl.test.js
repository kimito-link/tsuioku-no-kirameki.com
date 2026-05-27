import { describe, it, expect } from 'vitest';
import {
  crawlNdgrBackward,
  NDGR_BACKFILL_DEFAULT_CAPS,
  NDGR_BACKFILL_FETCH_GAP_MS,
  NDGR_BACKFILL_BACKOFF_MS,
  NDGR_BACKFILL_SEED_LAG_SEC
} from './ndgrBackfillCrawl.js';

// テストは now を固定（1_000_000ms）注入する。seed は floor(now/1000) - SEED_LAG_SEC。
const FIXED_NOW_MS = 1_000_000;
const SEED_AT = Math.floor(FIXED_NOW_MS / 1000) - NDGR_BACKFILL_SEED_LAG_SEC;

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
const VIEW_BASE = 'https://mpn.live.nicovideo.jp/api/view/v4/BBxAbc:view';

/** `?at={at}` の URL（エンジンと同じ組み立て）。 */
function atUrl(at) {
  return `${VIEW_BASE}?at=${encodeURIComponent(String(at))}`;
}

/** ?at=now の応答 = next ポインタ varint だけ（PoC で 9 バイト）。field1=next.at 相当。 */
function nowEntryBytes(nextAt) {
  return new Uint8Array(varintField(1, nextAt));
}

/**
 * View の ChunkedEntry。過去ログ巡回で使うのは backward 入口 URI（BackwardSegment.
 * segment.uri）。decodeChunkedEntry は path 分類で `/data/backward/v4/` を backwardUri と
 * して拾うので、ここでは backward URI を持つ message を埋めるだけでよい（field 番号非依存）。
 */
function viewEntryBytes({ backwardUri, nextAt } = {}) {
  // nextAt を指定すると next.at(field4 varint) を入れる（seed の next 追従テスト用）。
  // 指定なしでも非空にするため、何も無いときは backward も next も無い極小 entry にする。
  const out = [];
  if (nextAt != null) out.push(...varintField(4, nextAt));
  if (backwardUri) out.push(...lenDelimited(2, strField(1, backwardUri)));
  // backward も next も無いと空 buffer になり no_entry 判定に落ちるため、無害な padding を足す。
  // ⚠️ varint(wt0) は decodeChunkedEntry が nextAt として拾うので、len-delimited(wt2) の
  //    非 URI 文字列で padding する（nextAt も backward も生まれない）。
  if (out.length === 0) out.push(...strField(15, 'pad'));
  return new Uint8Array(out);
}

/**
 * 1 件の chat を ChunkedMessage に包む。
 *   ChunkedMessage.field1(LEN) = NicoliveMessage
 *   NicoliveMessage.field1(LEN) = Chat
 *   Chat: no@8, content@1, name@2, rawUserId@5, vpos@3
 */
function chatChunkedMessage({ no, content, name, rawUserId, vpos }) {
  const chat = [];
  if (content != null) chat.push(...strField(1, content));
  if (name != null) chat.push(...strField(2, name));
  if (vpos != null) chat.push(...varintField(3, vpos));
  if (rawUserId != null) chat.push(...varintField(5, rawUserId));
  if (no != null) chat.push(...varintField(8, no));
  const nicoliveMsg = lenDelimited(1, chat); // NicoliveMessage.field1 = Chat
  return lenDelimited(1, nicoliveMsg); // ChunkedMessage.field1 = NicoliveMessage
}

/**
 * Backward API の応答 = 単一の PackedSegment（length-delimited stream ではない）。
 *   PackedSegment {
 *     repeated ChunkedMessage messages = 1;   // chats インライン
 *     Next { string uri = 1 } next = 2;        // 次に古い backward URI
 *   }
 * nextUri を省略すると next 無し = 配信開始。
 */
function packedSegmentBytes(chats, nextUri) {
  const out = [];
  // PackedSegment.messages = field1 repeated ChunkedMessage。各 ChunkedMessage を field1 で包む。
  for (const c of chats) out.push(...lenDelimited(1, chatChunkedMessage(c)));
  if (nextUri) out.push(...lenDelimited(2, strField(1, nextUri))); // next{uri}
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

// 共通: ?at=now（liveness）→ seed は過去時刻 ?at={SEED_AT}（View ChunkedEntry）から。
const ENTRY_AT = atUrl(SEED_AT);

describe('crawlNdgrBackward（過去ログ backward 巡回エンジン）', () => {
  it('backward(PackedSegment) を next.uri で辿り、配信開始で backward_exhausted で停止する', async () => {
    // View → backward BK0（chats + next=BK1）→ BK1（chats, next 無し = 配信開始）
    const BK0 = `https://mpn.live.nicovideo.jp/data/backward/v4/BK0`;
    const BK1 = `https://mpn.live.nicovideo.jp/data/backward/v4/BK1`;

    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    map.set(ENTRY_AT, viewEntryBytes({ backwardUri: BK0 }));
    map.set(BK0, packedSegmentBytes([{ no: 50, content: 'これは新しい方', name: 'u1' }], BK1));
    map.set(BK1, packedSegmentBytes([{ no: 10, content: '配信開始直後', name: 'u2' }])); // next 無し

    const { fetchBinary } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result, chatsAll } = await drain(
      crawlNdgrBackward({ viewBase: VIEW_BASE, fetchBinary, sleep, now: () => 1_000_000 })
    );

    expect(result.stopReason).toBe('backward_exhausted');
    expect(chatsAll.map((c) => c.no)).toEqual([50, 10]);
    expect(chatsAll.map((c) => c.content)).toEqual(['これは新しい方', '配信開始直後']);
    expect(result.segmentsFetched).toBe(2);
  });

  it('同一 backward URI に戻されても無限ループせず安全に停止し、1 回だけ取り込む', async () => {
    const SELF = `https://mpn.live.nicovideo.jp/data/backward/v4/SELF_LOOP`;

    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    map.set(ENTRY_AT, viewEntryBytes({ backwardUri: SELF }));
    // SELF の next がまた SELF（自己ループ）。visited で 2 回目を弾き区画終了→再シードも
    // 進めない（vpos 不明）ので停止する。
    map.set(SELF, packedSegmentBytes([{ no: 5, content: 'once', name: 'u' }], SELF));

    const { fetchBinary } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result, chatsAll } = await drain(
      crawlNdgrBackward({ viewBase: VIEW_BASE, fetchBinary, sleep, now: () => 1_000_000 })
    );

    // 無限ループせず終了し（visited 保護）、SELF は 1 回だけ取り込む。
    expect(['backward_exhausted', 'reached_start', 'visited_revisit']).toContain(
      result.stopReason
    );
    expect(chatsAll.map((c) => c.no)).toEqual([5]); // 1 回だけ取り込む
  });

  it('区画(next=N)で終端しても、さらに前の時刻から再シードして配信開始まで遡る（60%止まり回帰）', async () => {
    // ⛔ v0.1.411 回帰: 1 本の backward 連鎖は時刻区画ごとに next=N で終端する。
    //   実機で「now-90s から始めた連鎖が約60%で next=N→終了」し、残り40%（さらに前の
    //   区画）に届かなかった。再シードで次の区画を辿れることを確認する。
    const PROGRAM_START = 1000; // 配信開始 unixtime（秒）
    // chain1: seed(=PROGRAM_START + (90000ms前 相当)... テストでは ENTRY_AT=atUrl(SEED_AT)）。
    const BK_A = `https://mpn.live.nicovideo.jp/data/backward/v4/CHAIN1`;
    const BK_B = `https://mpn.live.nicovideo.jp/data/backward/v4/CHAIN2`;

    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    // chain1 入口（直近区画）。SEED_AT=910 で見つかる。vpos=6000(=60秒地点)。next=N で区画終端。
    map.set(ENTRY_AT, viewEntryBytes({ backwardUri: BK_A }));
    map.set(BK_A, packedSegmentBytes([{ no: 50, content: '新区画', name: 'u', vpos: 6000 }]));
    // v0.1.431: 再シードは「直前の種(910)より最低 1 バケット(50)前」に強制される（同一バケット
    //   舞い戻り＝偽 no_progress の根治）。vpos 由来の理想点 1055 は ceil=910-50=860 に丸められ、
    //   再シードは atUrl(860) になる。そこに chain2 入口（さらに前の区画・vpos=100=配信開始付近）。
    map.set(atUrl(860), viewEntryBytes({ backwardUri: BK_B }));
    map.set(BK_B, packedSegmentBytes([{ no: 5, content: '配信開始付近', name: 'u', vpos: 100 }]));
    // chain2 の最古 vpos=100 は NEAR_START(3000) 以内＝配信開始到達で reached_start。追加 entry 不要。

    const { fetchBinary } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result, chatsAll } = await drain(
      crawlNdgrBackward({
        viewBase: VIEW_BASE,
        fetchBinary,
        sleep,
        now: () => 1_000_000,
        programStartSec: PROGRAM_START
      })
    );

    // 区画1(no=50)で止まらず、再シードで区画2(no=5)まで遡り、配信開始で終了する。
    expect(chatsAll.map((c) => c.no)).toEqual([50, 5]);
    expect(result.stopReason).toBe('reached_start');
  });

  it('途中参加: 再シードで「進めない」区画に当たっても即停止せず、起点を戻して遡り続ける（v0.1.429 真因修正）', async () => {
    // ⛔ 真因（実機: 途中参加の全配信で 1〜5% しか取れない＋『ぜんぶ届いた』誤表示）:
    //   旧実装は「前回より古い vpos へ進めなかった」を即 reached_start にして数%で停止した。
    //   ここでは再シード先で前回と同じ vpos の区画に当たる（進めない）状況を作り、起点を
    //   さらに大きく戻して古い区画へ到達できることを確認する（早期 reached_start にしない）。
    const PROGRAM_START = 1000;
    const BK_A = 'https://mpn.live.nicovideo.jp/data/backward/v4/MJ_A';
    const BK_STUCK = 'https://mpn.live.nicovideo.jp/data/backward/v4/MJ_STUCK';
    const BK_OLD = 'https://mpn.live.nicovideo.jp/data/backward/v4/MJ_OLD';

    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    // 区画1: SEED_AT=910 で見つかる。vpos=60000(=600秒地点)。next=N で終端。
    map.set(ENTRY_AT, viewEntryBytes({ backwardUri: BK_A }));
    map.set(BK_A, packedSegmentBytes([{ no: 50, content: '途中', name: 'u', vpos: 60000 }]));
    // v0.1.431: 再シードは「直前の種より 1 バケット(50)前」に強制されるので、910 から
    //   860→810… と 50 ずつ降りていく。最初の再シード(860)は「前回と同じ vpos=60000」の区画
    //   （= 進めない・overlap）。即 reached_start にせず次のバケットへ降りるのが核心。
    map.set(atUrl(860), viewEntryBytes({ backwardUri: BK_STUCK }));
    map.set(BK_STUCK, packedSegmentBytes([{ no: 50, content: '同じ', name: 'u', vpos: 60000 }]));
    // 次の再シード(810)で「古い vpos=100(=1秒地点)」の区画に届く（早期 reached_start にしない）。
    map.set(atUrl(810), viewEntryBytes({ backwardUri: BK_OLD }));
    map.set(BK_OLD, packedSegmentBytes([{ no: 5, content: '配信序盤', name: 'u', vpos: 100 }]));

    const { fetchBinary } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result, chatsAll } = await drain(
      crawlNdgrBackward({
        viewBase: VIEW_BASE,
        fetchBinary,
        sleep,
        now: () => 1_000_000,
        programStartSec: PROGRAM_START
      })
    );

    // 「進めない」区画(no=50 重複)で諦めず、起点を戻して序盤(no=5・vpos=100)まで遡る。
    expect(chatsAll.map((c) => c.no)).toContain(5);
    // 序盤(vpos<=NEAR_START)に到達したので reached_start。早期停止していないことが核心。
    expect(result.stopReason).toBe('reached_start');
  });

  it('爆速配信: 各区画が同一バケットを返しても、再シードを1バケット前へ確実に進めて配信開始まで遡る（v0.1.431・34%停止の真因）', async () => {
    // ⛔ 実機 lv350604301（爆速配信・2026-05-27）で決定的に観測した真因:
    //   NDGR の `?at={t}` 応答は約 30〜45 秒のバケットに量子化されている。区画を読み終え
    //   「最古 vpos − 5s」で再シードすると、たった今読んだバケットに舞い戻り、その backward URI
    //   が既に visited のため入口なし→偽 no_progress→数回リトライ後 34% 等で停止していた。
    //
    //   ここでは「at が同じバケット幅(50)内なら同じ区画(同 vpos)を返す」サーバを模し、旧来の
    //   vpos−5s 再シードでは進めないが、v0.1.431 の「直前の種より最低 1 バケット前」強制で
    //   バケットを1つずつ確実に降り、配信開始(vpos<=NEAR_START)まで遡れることを検証する。
    // 実機に近い時間幾何: now=4000s, 配信開始=1000s ⇒ 約 3000 秒（60 バケット）の配信。
    const NOW_MS = 4_000_000;
    const NOW_SEC = Math.floor(NOW_MS / 1000); // 4000
    const PROGRAM_START = 1000;
    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(NOW_SEC));

    // バケット幅 50 で量子化されたサーバ: at を 50 で床に丸めたバケットごとに区画が決まる。
    //   バケット境界 b の vpos(センチ秒) = (b - PROGRAM_START) * 100。最古ほど vpos 小。
    //   初回シードは now-90=3910 で見つかり、そこから 50 ずつ確実に降りて、b≈1000 近傍
    //   (vpos<=NEAR_START)で reached_start。旧 vpos−5s 再シードでは同一バケットに舞い戻り頓挫する。
    //   ⚠️ 各バケットは固有 URI（同一だと chain で visited 即終了し再シード経路を試せない）。
    for (let at = NOW_SEC; at >= PROGRAM_START - 50; at -= 1) {
      const bucket = Math.floor(at / 50) * 50; // 同一バケットは同一 backward URI
      const uri = `https://mpn.live.nicovideo.jp/data/backward/v4/Q_${bucket}`;
      map.set(atUrl(at), viewEntryBytes({ backwardUri: uri }));
      const vpos = Math.max(0, (bucket - PROGRAM_START) * 100); // 古いバケットほど小さい vpos
      map.set(uri, packedSegmentBytes([{ no: bucket, content: `b${bucket}`, name: 'u', vpos }]));
    }

    const { fetchBinary } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result, chatsAll } = await drain(
      crawlNdgrBackward({
        viewBase: VIEW_BASE,
        fetchBinary,
        sleep,
        now: () => NOW_MS,
        programStartSec: PROGRAM_START
      })
    );

    // 同一バケット舞い戻りで詰まらず、配信開始付近(vpos<=NEAR_START=3000)まで遡れた。
    expect(result.stopReason).toBe('reached_start');
    // 複数の異なるバケットを実際に取り込んでいる（1 区画で止まっていない）。
    const distinctBuckets = new Set(chatsAll.map((c) => c.no));
    expect(distinctBuckets.size).toBeGreaterThan(3);
  });

  it('進めない区画が続いてリトライ上限に達したら reached_start でなく no_progress（嘘の達成を出さない）', async () => {
    // 起点を何度戻しても前回と同じ vpos の区画にしか入れない＝古いものに届かない。
    // この場合「配信開始まで遡った」とは言えないので reached_start ではなく no_progress。
    const PROGRAM_START = 1000;
    const BK_A = 'https://mpn.live.nicovideo.jp/data/backward/v4/NP_A';

    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    map.set(ENTRY_AT, viewEntryBytes({ backwardUri: BK_A }));
    map.set(BK_A, packedSegmentBytes([{ no: 50, content: '途中', name: 'u', vpos: 60000 }]));
    // v0.1.431: 再シードは 910 から 50 ずつ降りる（860→810→760→710→660…）。どの at でも
    //   「同じ vpos=60000 帯」の別 URI を返す＝古いものに永遠に届かない（進めない）。リトライ
    //   上限(4)まで降りても vpos が縮まないので no_progress（reached_start にしない）。
    //   ⚠️ 同一 URI だと chain で visited 即 break→null→no_progress に落ちて「リトライを尽くした」
    //      経路を試せないので、at ごとに別 URI(BK_SAME_<at>) を割り当てて vpos だけ同じにする。
    for (const at of [860, 810, 760, 710, 660, 610]) {
      const uri = `https://mpn.live.nicovideo.jp/data/backward/v4/NP_SAME_${at}`;
      map.set(atUrl(at), viewEntryBytes({ backwardUri: uri }));
      map.set(uri, packedSegmentBytes([{ no: 49, content: '同じ帯', name: 'u', vpos: 60000 }]));
    }

    const { fetchBinary } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result } = await drain(
      crawlNdgrBackward({
        viewBase: VIEW_BASE,
        fetchBinary,
        sleep,
        now: () => 1_000_000,
        programStartSec: PROGRAM_START
      })
    );

    // 古いものに届かないので reached_start とは言わない（『ぜんぶ届いた』誤表示の防止）。
    expect(result.stopReason).toBe('no_progress');
  });

  it('再シードで入口が見つからなくても vpos が序盤まで程遠いなら reached_start にしない（v0.1.430・32%停止の主因）', async () => {
    // ⛔ 高速・大量配信で 32% 等で止まる主因: 再シード時刻が区画の隙間に落ち「入口が見つからない」
    //   ＝旧実装は即 reached_start としていたが、まだ vpos=60000(=600秒地点)で序盤まで程遠い。
    //   起点を戻して再探索→それでも入口が出ないなら no_progress（reached_start にしない）。
    const PROGRAM_START = 1000;
    const BK_A = 'https://mpn.live.nicovideo.jp/data/backward/v4/GAP_A';
    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    // 区画1: vpos=60000。next=N で終端。
    map.set(ENTRY_AT, viewEntryBytes({ backwardUri: BK_A }));
    map.set(BK_A, packedSegmentBytes([{ no: 50, content: '途中', name: 'u', vpos: 60000 }]));
    // 以降どの再シード時刻に行っても入口が無い（隙間）。entry はあるが backward を持たない。
    for (const at of [1595, 1000, 400, 200, 100, 50, 20]) {
      map.set(atUrl(at), viewEntryBytes({})); // backward も next も無い極小 entry
    }

    const { fetchBinary } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result } = await drain(
      crawlNdgrBackward({
        viewBase: VIEW_BASE,
        fetchBinary,
        sleep,
        now: () => 1_000_000,
        programStartSec: PROGRAM_START
      })
    );

    // vpos=60000 は NEAR_START(3000) より遥かに大きい＝序盤未到達。reached_start にしない。
    expect(result.stopReason).toBe('no_progress');
  });

  it('再シードで入口が無くても、既に序盤(vpos<=NEAR_START)まで遡れていれば reached_start（本当の完了）', async () => {
    const PROGRAM_START = 1000;
    const BK_A = 'https://mpn.live.nicovideo.jp/data/backward/v4/DONE_A';
    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    // 区画1で序盤 vpos=50(=0.5秒地点)まで到達。next=N で終端。
    map.set(ENTRY_AT, viewEntryBytes({ backwardUri: BK_A }));
    map.set(BK_A, packedSegmentBytes([{ no: 2, content: '序盤', name: 'u', vpos: 50 }]));
    // 再シード時刻に入口は無い（もう最初まで来た）。
    map.set(atUrl(996), viewEntryBytes({}));

    const { fetchBinary } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result } = await drain(
      crawlNdgrBackward({
        viewBase: VIEW_BASE,
        fetchBinary,
        sleep,
        now: () => 1_000_000,
        programStartSec: PROGRAM_START
      })
    );

    // 序盤(vpos=50<=3000)まで遡れた後に入口が無い＝本当の配信開始到達。
    expect(result.stopReason).toBe('reached_start');
  });

  it('segment 数 cap に達したら cap_segments で停止する', async () => {
    // backward を延々辿れるチェーン（BK_i → BK_{i+1}）。各 1 件 chat。
    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    map.set(ENTRY_AT, viewEntryBytes({ backwardUri: `https://mpn.live.nicovideo.jp/data/backward/v4/BK_0` }));
    for (let i = 0; i < 10; i += 1) {
      const cur = `https://mpn.live.nicovideo.jp/data/backward/v4/BK_${i}`;
      const next = `https://mpn.live.nicovideo.jp/data/backward/v4/BK_${i + 1}`;
      map.set(cur, packedSegmentBytes([{ no: 100 - i, content: `c${i}`, name: 'u' }], next));
    }

    const { fetchBinary } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result } = await drain(
      crawlNdgrBackward({
        viewBase: VIEW_BASE,
        fetchBinary,
        sleep,
        now: () => 1_000_000,
        caps: { segments: 3 }
      })
    );

    expect(result.stopReason).toBe('cap_segments');
    expect(result.segmentsFetched).toBe(3);
  });

  it('経過時間 cap に達したら cap_elapsed で停止する', async () => {
    // now() を呼ぶたびに 120 秒進める偽クロック。elapsedMs=300000 なので数回で超える。
    let t = 0;
    const now = () => {
      t += 120_000;
      return t;
    };
    // crawl 内で最初に now() が呼ばれて t0=120000 → seed = floor(120000/1000) - LAG。
    const seedAtForTest = Math.floor(120_000 / 1000) - NDGR_BACKFILL_SEED_LAG_SEC;

    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    map.set(atUrl(seedAtForTest), viewEntryBytes({ backwardUri: `https://mpn.live.nicovideo.jp/data/backward/v4/T_BK_0` }));
    for (let i = 0; i < 20; i += 1) {
      const cur = `https://mpn.live.nicovideo.jp/data/backward/v4/T_BK_${i}`;
      const next = `https://mpn.live.nicovideo.jp/data/backward/v4/T_BK_${i + 1}`;
      map.set(cur, packedSegmentBytes([{ no: 100 - i, content: `c${i}`, name: 'u' }], next));
    }
    const { fetchBinary } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result } = await drain(
      crawlNdgrBackward({ viewBase: VIEW_BASE, fetchBinary, sleep, now })
    );

    expect(result.stopReason).toBe('cap_elapsed');
  });

  it('累計取り込み行数が rows cap に達したら cap_rows で停止する', async () => {
    const BK0 = `https://mpn.live.nicovideo.jp/data/backward/v4/ROWS_BK0`;
    const BK1 = `https://mpn.live.nicovideo.jp/data/backward/v4/ROWS_BK1`;

    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    map.set(ENTRY_AT, viewEntryBytes({ backwardUri: BK0 }));
    // BK0 に 3 件 → rows cap=2 を超える。
    map.set(
      BK0,
      packedSegmentBytes(
        [
          { no: 30, content: 'a', name: 'u' },
          { no: 29, content: 'b', name: 'u' },
          { no: 28, content: 'c', name: 'u' }
        ],
        BK1
      )
    );
    map.set(BK1, packedSegmentBytes([{ no: 1, content: 'd', name: 'u' }]));

    const { fetchBinary, calls } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result, chatsAll } = await drain(
      crawlNdgrBackward({ viewBase: VIEW_BASE, fetchBinary, sleep, now: () => 1_000_000, caps: { rows: 2 } })
    );

    expect(result.stopReason).toBe('cap_rows');
    // BK0 の 1 batch（3 件）を yield した直後に cap 判定で止まる。BK1 には進まない。
    expect(chatsAll.map((c) => c.no)).toEqual([30, 29, 28]);
    expect(calls).not.toContain(BK1);
  });

  it('既知コメントと重なっても早期終了せず、配信開始まで遡る（途中参加ギャップ埋めの回帰）', async () => {
    // ⛔ v0.1.411 回帰: 旧 known_min_reached は「直近 RT と重なった瞬間に全部記録済みと
    //   誤判定」して途中(6%)で止め、配信開始〜参加時刻のギャップを埋め損ねた。今は
    //   knownMinCommentNo を渡しても無視し、backward が尽きるまで遡る。重複は呼び出し側
    //   dedupe が弾く。
    const BK0 = `https://mpn.live.nicovideo.jp/data/backward/v4/MIN_BK0`;
    const BK1 = `https://mpn.live.nicovideo.jp/data/backward/v4/MIN_BK1`;

    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    map.set(ENTRY_AT, viewEntryBytes({ backwardUri: BK0 }));
    // BK0 は直近 RT と重なる範囲（no=25,20）。さらに前の BK1 に未記録の過去（no=5）。
    map.set(
      BK0,
      packedSegmentBytes(
        [
          { no: 25, content: 'x', name: 'u' },
          { no: 20, content: 'y', name: 'u' }
        ],
        BK1
      )
    );
    map.set(BK1, packedSegmentBytes([{ no: 5, content: 'z', name: 'u' }])); // next 無し=配信開始

    const { fetchBinary, calls } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result, chatsAll } = await drain(
      crawlNdgrBackward({
        viewBase: VIEW_BASE,
        fetchBinary,
        sleep,
        now: () => 1_000_000,
        // 旧 API 互換で渡してみるが、もう無視される（早期終了しない）。
        knownMinCommentNo: 20
      })
    );

    // 重なり(BK0)で止まらず BK1 まで遡り、配信開始(backward_exhausted)で終了する。
    expect(result.stopReason).toBe('backward_exhausted');
    expect(chatsAll.map((c) => c.no)).toEqual([25, 20, 5]);
    expect(calls).toContain(BK1); // ギャップ(no=5)を埋めるため BK1 も取得する
  });

  it('429 を backoff 上限まで受けたら rate_limited で停止し backoff を踏む', async () => {
    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    // View ChunkedEntry が常に 429。
    map.set(ENTRY_AT, { status: 429, bytes: new Uint8Array() });

    const { fetchBinary } = makeFetchFromMap(map);
    const { sleep, slept } = makeNoopSleep();
    const { result } = await drain(
      crawlNdgrBackward({ viewBase: VIEW_BASE, fetchBinary, sleep, now: () => 1_000_000 })
    );

    expect(result.stopReason).toBe('rate_limited');
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

  it('初回起点(now-90s)に入口が無くても、より深い過去へ起点をずらして見つける（1回目0件ムラの回帰）', async () => {
    // ⛔ 回帰: 起点 now-90s がタイミングによって backward を持たず 0 件で終わるムラ。
    //   起点候補 [now-90, now-300, ...] を順に試して確実に入口を見つける。
    //   now=1_000_000ms → nowSec=1000 → 候補 [910, 700, 100, ...]。
    const BK0 = `https://mpn.live.nicovideo.jp/data/backward/v4/ESC_BK0`;
    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    // 910（now-90）= 入口なし・next も自分自身（これ以上進めない）→ この候補は不発。
    map.set(atUrl(910), viewEntryBytes({ nextAt: 910 }));
    // 700（now-300）= 入口あり。escalate でここに到達して遡れる。
    map.set(atUrl(700), viewEntryBytes({ backwardUri: BK0 }));
    map.set(BK0, packedSegmentBytes([{ no: 7, content: 'esc', name: 'u' }])); // next 無し

    const { fetchBinary, calls } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result, chatsAll } = await drain(
      crawlNdgrBackward({ viewBase: VIEW_BASE, fetchBinary, sleep, now: () => 1_000_000 })
    );

    // 910 で諦めず 700 まで起点をずらして取り込めた（0 件にならない）。
    expect(chatsAll.map((c) => c.no)).toEqual([7]);
    expect(calls).toContain(atUrl(700));
    expect(result.stopReason === 'reached_start' || result.stopReason === 'backward_exhausted').toBe(true);
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
    map.set(atUrl('now'), new Uint8Array([])); // nextAt を持たない
    const { fetchBinary } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result } = await drain(
      crawlNdgrBackward({ viewBase: VIEW_BASE, fetchBinary, sleep, now: () => 1_000_000 })
    );
    expect(result.stopReason).toBe('no_entry');
  });

  it('View ChunkedEntry に backward 入口が無く next も進まなければ backward_exhausted で停止する', async () => {
    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    // backward 無し・next=SEED_AT（= seedAt と同じ＝これ以上進めない）→ seed ループ終了。
    map.set(ENTRY_AT, viewEntryBytes({ nextAt: SEED_AT }));
    const { fetchBinary } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result } = await drain(
      crawlNdgrBackward({ viewBase: VIEW_BASE, fetchBinary, sleep, now: () => 1_000_000 })
    );
    expect(result.stopReason).toBe('backward_exhausted');
  });

  it('seed: backward が無い entry なら next を辿り、現れた backward から遡る（実機回帰）', async () => {
    // 実機回帰: ?at={nextAt}（live-tip）に backward が無く next だけ → 次を辿ると backward
    // が出る。旧実装は 1 回で諦めて backward_exhausted（押しても無反応）だった。
    const BK0 = `https://mpn.live.nicovideo.jp/data/backward/v4/SEED_BK0`;
    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    // hop0: ?at=1000 は backward 無し・next=2000。
    map.set(ENTRY_AT, viewEntryBytes({ nextAt: 2000 }));
    // hop1: ?at=2000 で backward 入口が出る。
    map.set(atUrl(2000), viewEntryBytes({ backwardUri: BK0 }));
    map.set(BK0, packedSegmentBytes([{ no: 42, content: '遡れた', name: 'u' }])); // next 無し

    const { fetchBinary } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result, chatsAll } = await drain(
      crawlNdgrBackward({ viewBase: VIEW_BASE, fetchBinary, sleep, now: () => 1_000_000 })
    );

    expect(result.stopReason).toBe('backward_exhausted');
    expect(chatsAll.map((c) => c.no)).toEqual([42]); // backward を辿って取り込めた
  });

  it('?at=now には gap を入れず、2 回目以降に fetchGap を入れる', async () => {
    const BK0 = `https://mpn.live.nicovideo.jp/data/backward/v4/GAP_BK0`;
    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    map.set(ENTRY_AT, viewEntryBytes({ backwardUri: BK0 }));
    map.set(BK0, packedSegmentBytes([{ no: 1, content: 'g', name: 'u' }])); // next 無し

    const { fetchBinary } = makeFetchFromMap(map);
    const { sleep, slept } = makeNoopSleep();
    await drain(crawlNdgrBackward({ viewBase: VIEW_BASE, fetchBinary, sleep, now: () => 1_000_000, fetchGapMs: 600 }));

    // ?at=now（1回目・gap無し）→ ?at=1000 View（gap）→ BK0（gap）。gap=600 が 2 回。
    const gaps = slept.filter((ms) => ms === 600);
    expect(gaps.length).toBe(2);
  });

  it('デフォルト定数が想定値（長尺配信を最後まで遡れる値）', () => {
    // v0.1.406: 18h 配信を 200ms で 5 分だと 39% 止まりだった実機結果＋OSS実装(10ms)の知見で緩和。
    // v0.1.417: 13% 等の途中終了の完走率を上げるため elapsedMs 10→15分・gap 30→15ms。
    expect(NDGR_BACKFILL_DEFAULT_CAPS.segments).toBe(20_000);
    expect(NDGR_BACKFILL_DEFAULT_CAPS.elapsedMs).toBe(900_000);
    expect(NDGR_BACKFILL_DEFAULT_CAPS.bytes).toBe(60_000_000);
    expect(NDGR_BACKFILL_DEFAULT_CAPS.rows).toBe(100_000);
    expect(NDGR_BACKFILL_FETCH_GAP_MS).toBe(15);
    expect(NDGR_BACKFILL_BACKOFF_MS).toEqual([2_000, 4_000, 8_000]);
  });
});
