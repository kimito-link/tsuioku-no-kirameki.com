import { describe, it, expect } from 'vitest';
import {
  crawlNdgrBackward,
  chainLooksLikeStreamStart,
  NDGR_BACKFILL_DEFAULT_CAPS,
  NDGR_BACKFILL_FETCH_GAP_MS,
  NDGR_BACKFILL_BACKOFF_MS,
  NDGR_BACKFILL_SEED_LAG_SEC,
  NDGR_BACKFILL_NEAR_START_VPOS_CS
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
    // v0.1.434: 真の配信開始区画には冒頭の低 vpos コメントが【複数】ある（reached_start 判定が
    //   「開始近傍 vpos が 2 件以上」を要求するため）。chain2 に NEAR_START(3000) 以内の vpos を
    //   2 件入れる（実機の配信開始＝挨拶等で vpos≈0 が大量、を反映）。
    map.set(
      BK_B,
      packedSegmentBytes([
        { no: 5, content: '配信開始付近', name: 'u', vpos: 100 },
        { no: 6, content: 'こんばんは', name: 'u2', vpos: 200 }
      ])
    );

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

    // 区画1(no=50)で止まらず、再シードで区画2(no=5,6)まで遡り、配信開始で終了する。
    expect(chatsAll.map((c) => c.no)).toEqual([50, 5, 6]);
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
    //   v0.1.434: 真の開始区画は低 vpos が複数（判定が開始近傍 vpos 2 件以上を要求）→ 2 件入れる。
    map.set(
      atUrl(810),
      viewEntryBytes({ backwardUri: BK_OLD })
    );
    map.set(
      BK_OLD,
      packedSegmentBytes([
        { no: 5, content: '配信序盤', name: 'u', vpos: 100 },
        { no: 6, content: 'はじまった', name: 'u2', vpos: 250 }
      ])
    );

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
      // v0.1.434: reached_start 判定は「開始近傍 vpos が 2 件以上」を要求する。実機でも各バケット
      //   には複数コメントが流れる（爆速配信＝秒23コメ）。最古バケット(vpos≈0)が確実に複数の
      //   低 vpos を持つよう、各バケットに 2 件入れる（2 件目は +10cs ずらすが同バケット内）。
      map.set(
        uri,
        packedSegmentBytes([
          { no: bucket, content: `b${bucket}`, name: 'u', vpos },
          { no: bucket + 1, content: `b${bucket}_2`, name: 'u2', vpos: vpos + 10 }
        ])
      );
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

  it('途中参加: 再シードで「空区画(vpos の無い運営コメントだけ)」に当たっても即停止せず、飛び越えて配信開始まで遡る（v0.1.455 真因修正・12%/33%/78%ばらつき停止）', async () => {
    // ⛔ 真因（実機 v0.1.454・2026-05-29 で 12%/33%/78% にばらついて途中停止）:
    //   旧実装は再シード起点がたまたま「コメントの無い時間帯の隙間」や「運営コメントだけ
    //   （vpos を持たない）の区画」に落ちて chainMinVpos==null になると、reseed>0 で即
    //   no_progress で**一発終了**していた（リトライ無し）。配信のどの地点で空区画を引くかは
    //   運次第なので停止率がばらつき、「もう一度」も同じ起点で同じ空区画に落ちて決定的に
    //   同じ所で死ぬ（902→907）。
    //   修正: 空区画も「進めなかった」と同じリトライ経路に合流させ、起点をさらに前へ戻して
    //   次の区画を試す＝空区画を飛び越えて遡り続ける。
    const PROGRAM_START = 1000;
    const BK_A = 'https://mpn.live.nicovideo.jp/data/backward/v4/EMPTY_A';
    const BK_EMPTY = 'https://mpn.live.nicovideo.jp/data/backward/v4/EMPTY_GAP';
    const BK_OLD = 'https://mpn.live.nicovideo.jp/data/backward/v4/EMPTY_OLD';

    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    // 区画1: SEED_AT=910 で見つかる。vpos=60000(=600秒地点)。next=N で終端。
    map.set(ENTRY_AT, viewEntryBytes({ backwardUri: BK_A }));
    map.set(BK_A, packedSegmentBytes([{ no: 50, content: '途中', name: 'u', vpos: 60000 }]));
    // 最初の再シード(860)は「vpos を 1 件も持たない区画」（運営コメントだけ＝記録対象 vpos なし）。
    //   chainMinVpos==null になる。旧実装はここで即 no_progress だったが、修正後は飛び越える。
    map.set(atUrl(860), viewEntryBytes({ backwardUri: BK_EMPTY }));
    map.set(BK_EMPTY, packedSegmentBytes([{ no: 99, content: '【運営】お知らせ', name: 'sys' }])); // vpos 省略
    // 次の再シード(810)で「古い vpos=100(=1秒地点)」の配信開始区画に届く。
    map.set(atUrl(810), viewEntryBytes({ backwardUri: BK_OLD }));
    map.set(
      BK_OLD,
      packedSegmentBytes([
        { no: 5, content: '配信序盤', name: 'u', vpos: 100 },
        { no: 6, content: 'はじまった', name: 'u2', vpos: 250 }
      ])
    );

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

    // 空区画(no=99 運営)で諦めず飛び越え、配信序盤(no=5・vpos=100)まで遡って reached_start。
    expect(chatsAll.map((c) => c.no)).toContain(5);
    expect(chatsAll.map((c) => c.no)).toContain(6);
    expect(result.stopReason).toBe('reached_start');
  });

  it('途中参加: 空区画が連続しても、リトライ上限(12)内なら飛び越えて配信開始まで遡る（v0.1.455・無コメント区間の飛び越え）', async () => {
    // 配信序盤に長い無コメント区間（運営コメントだけの区画が連続）がある配信を模す。
    //   旧実装（上限4・空区画即終了）では飛び越えられなかった。v0.1.455 では空区画もリトライ
    //   経路に合流し、上限を 12 に引き上げたので、連続した空区画を飛び越えて開始まで届く。
    const PROGRAM_START = 1000;
    const BK_A = 'https://mpn.live.nicovideo.jp/data/backward/v4/MULTI_A';
    const BK_OLD = 'https://mpn.live.nicovideo.jp/data/backward/v4/MULTI_OLD';

    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    map.set(ENTRY_AT, viewEntryBytes({ backwardUri: BK_A }));
    map.set(BK_A, packedSegmentBytes([{ no: 50, content: '途中', name: 'u', vpos: 60000 }]));
    // 860→810→760→710→660→610 と 6 連続で「vpos を持たない空区画」を返す（無コメント区間）。
    //   旧上限4なら 710 で力尽きていたが、上限12なら通過できる。
    let i = 0;
    for (const at of [860, 810, 760, 710, 660, 610]) {
      const uri = `https://mpn.live.nicovideo.jp/data/backward/v4/MULTI_EMPTY_${at}`;
      map.set(atUrl(at), viewEntryBytes({ backwardUri: uri }));
      map.set(uri, packedSegmentBytes([{ no: 90 + i, content: '【運営】', name: 'sys' }])); // vpos 無し
      i += 1;
    }
    // 560 でようやく配信開始区画（低 vpos 複数）に届く。
    map.set(atUrl(560), viewEntryBytes({ backwardUri: BK_OLD }));
    map.set(
      BK_OLD,
      packedSegmentBytes([
        { no: 5, content: '配信序盤', name: 'u', vpos: 80 },
        { no: 6, content: 'はじまった', name: 'u2', vpos: 200 }
      ])
    );

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

    // 6 連続の空区画を飛び越えて配信序盤(no=5)まで遡れた。
    expect(chatsAll.map((c) => c.no)).toContain(5);
    expect(result.stopReason).toBe('reached_start');
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
    //   v0.1.434: 副経路（入口尽き時）の reached_start も「最後に遡れた区画が開始区画らしいか
    //   （開始近傍 vpos が 2 件以上）」で判定する。区画1に低 vpos を 2 件入れて真の到達を表す。
    map.set(ENTRY_AT, viewEntryBytes({ backwardUri: BK_A }));
    map.set(
      BK_A,
      packedSegmentBytes([
        { no: 2, content: '序盤', name: 'u', vpos: 50 },
        { no: 3, content: 'はじまり', name: 'u2', vpos: 120 }
      ])
    );
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

  // === v0.1.434: reached_start 誤判定（47%/51% で『ぜんぶ届いた』）の修正 ===
  it('途中区画に vpos 極小の外れ値が 1 件紛れても reached_start にしない（47%/51% 誤完了の真因）', async () => {
    // ⛔ 真因（実機: 47%/51% しか遡れていないのに『配信のはじめまで、ぜんぶ届いた』と誤表示）:
    //   運営/system/gift お知らせは vpos=0 や極小になりがち。これが配信【中盤】の区画に 1 件
    //   紛れると、その区画の最小 vpos が極小になり「単一最小 vpos ≤ 30秒」が成立 → まだ中盤
    //   なのに reached_start を誤発火していた。修正後は「開始近傍 vpos が 2 件以上」を要求する
    //   ので、本体 vpos=60000(=600秒地点) の中盤区画に外れ値 1 件があっても発火しない。
    const PROGRAM_START = 1000;
    const BK_MID = 'https://mpn.live.nicovideo.jp/data/backward/v4/FP_MID';
    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    // 区画: 本体は中盤(vpos=60000)。だが運営お知らせ風の vpos=0 が 1 件だけ紛れている。
    //   旧実装: 最小 vpos=0 ≤ 3000 → reached_start（誤）。新実装: 近傍 vpos は 1 件のみ → 不発。
    map.set(ENTRY_AT, viewEntryBytes({ backwardUri: BK_MID }));
    map.set(
      BK_MID,
      packedSegmentBytes([
        { no: null, content: '【運営】まもなく終了します', name: '運営', vpos: 0 },
        { no: 800, content: '中盤コメント', name: 'u', vpos: 60000 },
        { no: 801, content: 'まだ中盤', name: 'u2', vpos: 60500 }
      ])
    );
    // 以降どの再シード時刻にも入口は無い（これ以上は遡れない状況）。それでも『ぜんぶ届いた』は
    //   出さず、no_progress（→ narration は「もう一度押すと続き」）に倒れるのが正しい。
    for (const at of [860, 810, 760, 710, 660, 610]) {
      map.set(atUrl(at), viewEntryBytes({}));
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

    // 中盤＋外れ値 1 件では reached_start にしない（嘘の『ぜんぶ届いた』を出さない）。
    expect(result.stopReason).toBe('no_progress');
  });

  it('副経路（入口尽き）でも、最後の区画が外れ値 1 件のみ低 vpos なら reached_start にしない', async () => {
    // line 388 の「序盤まで遡れていれば reached_start」の対称ケース。globalMinVpos が外れ値で
    //   極小化していても、最後に遡れた区画が開始近傍 vpos を【複数】持たなければ reached_start に
    //   しない（reachedStreamStartChain フラグで判定）。
    const PROGRAM_START = 1000;
    const BK_A = 'https://mpn.live.nicovideo.jp/data/backward/v4/FP2_A';
    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    // 区画1: 本体は中盤(vpos=60000)＋外れ値 vpos=0 が 1 件。next=N で終端。
    map.set(ENTRY_AT, viewEntryBytes({ backwardUri: BK_A }));
    map.set(
      BK_A,
      packedSegmentBytes([
        { no: null, content: '【システム】', name: 'system', vpos: 0 },
        { no: 500, content: '中盤', name: 'u', vpos: 60000 }
      ])
    );
    // 再シード時刻に入口は無い（もう辿れない）。旧実装は globalMinVpos=0 ≤ 3000 で reached_start
    //   （誤）。新実装は最後の区画が近傍 vpos 1 件のみ → フラグ立たず no_progress。
    map.set(atUrl(996), viewEntryBytes({}));
    map.set(atUrl(946), viewEntryBytes({}));
    map.set(atUrl(896), viewEntryBytes({}));
    map.set(atUrl(846), viewEntryBytes({}));
    map.set(atUrl(796), viewEntryBytes({}));

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

    expect(result.stopReason).toBe('no_progress');
  });

  // ⛔ 実機(糖分さん配信・LIVE 2h30m)で v0.1.434 でも 55%/55% で『ぜんぶ届いた』誤発火が残った真因:
  //    運営/system のお知らせ(vpos=0 や極小)が中盤区画に【2 件以上】紛れると、v0.1.434 の
  //    minHits=2 をすり抜けて reached_start を誤発火していた。v0.1.436 で投票母集団から運営/system
  //    /gift を除外（記録パスと同じガード）して根治する。
  it('中盤区画に運営/system/gift が 2 件以上紛れていても reached_start にしない（v0.1.436・55% 誤判定の核心）', async () => {
    const PROGRAM_START = 1000;
    const BK_MID = 'https://mpn.live.nicovideo.jp/data/backward/v4/FP3_MID';
    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    // 区画: 本体は中盤(vpos=60000・600 秒地点)。だが運営お知らせ 2 件＋gift 1 件＝低 vpos が 3 件混入。
    //   旧(v0.1.435): no==null/gift も投票してしまい minHits=2 成立 → reached_start（誤）。
    //   新(v0.1.436): 投票母集団から除外 → 一般コメは中盤 1 件のみ → false → no_progress（正）。
    map.set(ENTRY_AT, viewEntryBytes({ backwardUri: BK_MID }));
    map.set(
      BK_MID,
      packedSegmentBytes([
        { no: null, content: '【運営】まもなく終了 A', name: '運営', vpos: 0 },
        { no: null, content: '【運営】まもなく終了 B', name: '運営', vpos: 0 },
        {
          no: 9001,
          content: 'Aさんがギフト「emerald（10pt）」を贈りました',
          name: 'A',
          vpos: 50
        },
        { no: 500, content: '中盤コメント', name: 'u', vpos: 60000 }
      ])
    );
    // 以降どの再シード時刻にも入口は無い（これ以上は遡れない状況）。それでも『ぜんぶ届いた』は
    //   出さず、no_progress に倒れるのが正しい挙動。
    for (const at of [860, 810, 760, 710, 660, 610]) {
      map.set(atUrl(at), viewEntryBytes({}));
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

    // 中盤＋運営×2＋gift×1 では reached_start にしない（55% 誤判定の根治）。
    expect(result.stopReason).toBe('no_progress');
  });

  // v0.1.443: reached_start 発火時、判定根拠となった chats を診断情報として戻り値に含める。
  //   実機で「40%なのに『ぜんぶ届いた』」誤判定の真因を後追いで特定するためのもの。
  it('主経路 reached_start 発火時、診断情報に chats と path=main が含まれる', async () => {
    const PROGRAM_START = 1000;
    const BK_A = 'https://mpn.live.nicovideo.jp/data/backward/v4/V443_DIAG_A';
    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    map.set(ENTRY_AT, viewEntryBytes({ backwardUri: BK_A }));
    map.set(
      BK_A,
      packedSegmentBytes([
        { no: 1, content: 'こんばんは', name: 'u1', vpos: 50 },
        { no: 2, content: 'はじまった', name: 'u2', vpos: 150 }
      ])
    );

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

    expect(result.stopReason).toBe('reached_start');
    expect(result.diagnostics).toBeTruthy();
    expect(result.diagnostics.reachedStartPath).toBe('main');
    expect(Array.isArray(result.diagnostics.reachedStartChats)).toBe(true);
    expect(result.diagnostics.reachedStartChats.length).toBeGreaterThan(0);
    // chats の各要素は NdgrChat 構造（vpos を持つ）
    const firstChat = result.diagnostics.reachedStartChats[0];
    expect(typeof firstChat.vpos).toBe('number');
  });

  it('非 reached_start で終わる場合、diagnostics は null', async () => {
    // 入口が見つからないだけのケース → no_entry / backward_exhausted。
    const map = new Map();
    map.set(atUrl('now'), nowEntryBytes(1000));
    map.set(ENTRY_AT, viewEntryBytes({})); // backward 無し

    const { fetchBinary } = makeFetchFromMap(map);
    const { sleep } = makeNoopSleep();
    const { result } = await drain(
      crawlNdgrBackward({
        viewBase: VIEW_BASE,
        fetchBinary,
        sleep,
        now: () => 1_000_000
      })
    );

    expect(result.stopReason).not.toBe('reached_start');
    expect(result.diagnostics).toBeNull();
  });
});

describe('chainLooksLikeStreamStart（区画が配信開始らしいかの純判定・v0.1.434）', () => {
  const C = (vpos) => ({ no: 1, content: 'c', name: 'u', vpos });

  it('開始近傍 vpos が 2 件以上あれば true（真の配信開始区画＝低 vpos 多数）', () => {
    expect(chainLooksLikeStreamStart([C(0), C(50), C(120), C(8000)])).toBe(true);
  });

  it('開始近傍 vpos が 1 件だけ（外れ値混入の中盤区画）なら false', () => {
    // min は 0 だが、それ以外は中盤(60000〜)。誤判定の核心ケース。
    expect(chainLooksLikeStreamStart([C(0), C(60000), C(61000), C(62000)])).toBe(false);
  });

  it('2 件目がしきい値ちょうど(3000)なら true、しきい値超(3001)なら false', () => {
    expect(chainLooksLikeStreamStart([C(10), C(3000), C(60000)])).toBe(true);
    expect(chainLooksLikeStreamStart([C(10), C(3001), C(60000)])).toBe(false);
  });

  it('空配列・非配列は false', () => {
    expect(chainLooksLikeStreamStart([])).toBe(false);
    expect(chainLooksLikeStreamStart(null)).toBe(false);
    expect(chainLooksLikeStreamStart(undefined)).toBe(false);
  });

  it('全件 vpos 欠落（null）は false', () => {
    expect(
      chainLooksLikeStreamStart([
        { no: 1, content: 'a', name: 'u', vpos: null },
        { no: 2, content: 'b', name: 'u', vpos: null }
      ])
    ).toBe(false);
  });

  it('負・非有限の vpos は無視してカウントする', () => {
    // vpos=-1 と NaN は無効。有効な近傍は 10 の 1 件のみ → false。
    expect(
      chainLooksLikeStreamStart([
        { no: 1, content: 'a', name: 'u', vpos: -1 },
        { no: 2, content: 'b', name: 'u', vpos: Number.NaN },
        C(10)
      ])
    ).toBe(false);
    // 有効な近傍が 2 件あれば無効値が混じっても true。
    expect(
      chainLooksLikeStreamStart([{ no: 1, content: 'a', name: 'u', vpos: -5 }, C(10), C(20)])
    ).toBe(true);
  });

  it('minNearStartHits を 3 に上げると、近傍 2 件では false・3 件で true', () => {
    expect(chainLooksLikeStreamStart([C(0), C(100)], { minNearStartHits: 3 })).toBe(false);
    expect(chainLooksLikeStreamStart([C(0), C(100), C(200)], { minNearStartHits: 3 })).toBe(true);
  });

  it('nearStartCs を狭めると、その範囲内の件数で判定する', () => {
    // nearStartCs=100 にすると vpos=200 は近傍外。近傍は 0,50 の 2 件 → true。
    expect(chainLooksLikeStreamStart([C(0), C(50), C(200)], { nearStartCs: 100 })).toBe(true);
    // 0 のみ近傍 → 1 件で false。
    expect(chainLooksLikeStreamStart([C(0), C(150), C(200)], { nearStartCs: 100 })).toBe(false);
  });

  it('既定しきい値は NDGR_BACKFILL_NEAR_START_VPOS_CS(3000) を使う', () => {
    expect(NDGR_BACKFILL_NEAR_START_VPOS_CS).toBe(3000);
    expect(chainLooksLikeStreamStart([C(2999), C(3000)])).toBe(true);
    expect(chainLooksLikeStreamStart([C(2999), C(3001)])).toBe(false);
  });

  // === v0.1.436: 運営/system/gift 投票母集団からの除外（55% 誤判定の追加修正） ===
  it('運営/system(no==null) は近傍カウントから除外する＝外れ値 1 件 + 実コメ 1 件では false', () => {
    // 運営アナウンス（no==null・vpos=0）と一般低 vpos コメ 1 件のみ。実コメは 1 件しか近傍にいない。
    const sys = { no: null, content: '【運営】まもなく終了', name: '運営', vpos: 0 };
    const real = { no: 1, content: 'こんばんは', name: 'u', vpos: 100 };
    const mid = { no: 2, content: '中盤', name: 'u', vpos: 60000 };
    expect(chainLooksLikeStreamStart([sys, real, mid])).toBe(false);
  });

  it('運営/system(no==null) は除外しても、実コメ 2 件以上が近傍にあれば true（真の開始は維持）', () => {
    const sys1 = { no: null, content: '【運営】開始', name: '運営', vpos: 0 };
    const real1 = { no: 1, content: 'はじまった', name: 'u', vpos: 50 };
    const real2 = { no: 2, content: 'やった', name: 'u2', vpos: 200 };
    expect(chainLooksLikeStreamStart([sys1, real1, real2])).toBe(true);
  });

  it('運営/system(no==null) が 2 件以上紛れていても false（55% 誤判定の核心ケース）', () => {
    // ⛔ v0.1.435 までは「近傍 vpos 2 件以上」で true → 運営が 2 件紛れた中盤区画でも誤発火していた。
    //   v0.1.436 では運営は投票母集団から外れるため、本体が中盤(vpos=60000)なら false。
    const sys1 = { no: null, content: '【運営】お知らせ A', name: '運営', vpos: 0 };
    const sys2 = { no: null, content: '【運営】お知らせ B', name: '運営', vpos: 0 };
    const mid = { no: 500, content: '中盤', name: 'u', vpos: 60000 };
    expect(chainLooksLikeStreamStart([sys1, sys2, mid])).toBe(false);
  });

  it('ギフトお知らせ(no あり・content が gift パターン)も近傍カウントから除外する', () => {
    // gift 行は no を持つことがある（送信者 uid）。content の gift パターンで弾く必要がある。
    const gift1 = {
      no: 9001,
      content: 'Aさんがギフト「emerald（10pt）」を贈りました',
      name: 'A',
      vpos: 0
    };
    const gift2 = {
      no: 9002,
      content: 'Bさんがギフト「emerald（10pt）」を贈りました',
      name: 'B',
      vpos: 100
    };
    const mid = { no: 500, content: '中盤', name: 'u', vpos: 60000 };
    expect(chainLooksLikeStreamStart([gift1, gift2, mid])).toBe(false);
  });

  it('isPersistableChat を注入で「全件 false」にすると母集団 0 → false（注入の優先性）', () => {
    expect(
      chainLooksLikeStreamStart([C(0), C(50), C(100)], { isPersistableChat: () => false })
    ).toBe(false);
  });

  it('isPersistableChat を注入で「全件 true」にすると、既定で弾かれる no==null も計上される', () => {
    const sys1 = { no: null, content: '【運営】', name: '運営', vpos: 0 };
    const sys2 = { no: null, content: '【運営】', name: '運営', vpos: 100 };
    // 既定では運営は除外 → false。注入で全件通せば 2 件カウント → true。
    expect(chainLooksLikeStreamStart([sys1, sys2])).toBe(false);
    expect(
      chainLooksLikeStreamStart([sys1, sys2], { isPersistableChat: () => true })
    ).toBe(true);
  });
});
