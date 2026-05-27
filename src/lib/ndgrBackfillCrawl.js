/**
 * v0.1.404: コメント過去ログ一括バックフィルの「巡回エンジン」（純ロジック）。
 *
 * 目的（ユーザー要望「ウルトラC」）:
 *   途中から配信を開いても、配信開始まで遡って過去コメントを取り込みたい。
 *   NDGR の view エンドポイントは ChunkedEntry を返し、その中の `backward` URI を
 *   辿ると「さらに過去」の ChunkedEntry が得られる。各 ChunkedEntry の `segment`
 *   URI を fetch すると、その時刻帯の実コメント（ChunkedMessage stream）が取れる。
 *   これを backward が尽きる（＝配信開始）まで連鎖的に辿る。
 *
 * 実機 PoC（2026-05-27 lv350560887）で確定した前提:
 *   - NDGR host = mpn.live.nicovideo.jp（watch ページと別オリジン = cross-origin）。
 *   - CORS は `credentials:'omit'` 必須（include だと Failed to fetch）。`*` CORS。
 *   - `?at=now` → 9 バイト（next ポインタ varint）。`?at={unixtime}` → ChunkedEntry。
 *   - backward fetch → さらに前の backward URI が在る = 配信開始まで遡及可能。
 *   - rate limit は PoC 未測定 → 連続巡回時は throttle 必須（BAN 回避）。
 *
 * 設計（2026-05-27 会議室で確定）:
 *   - この関数は「純ロジック」。fetch / sleep / now を引数で受け取り、副作用は
 *     yield のみ。これにより実 I/O ゼロで（フィクスチャ fetch で）単体テストできる
 *     （decodeChunkedEntry のフィクスチャ純テストと同じ思想）。
 *   - chat の抽出は decodePackedSegment（既存）で行う。chat → 保存行への整形は
 *     呼び出し側が ndgrChatRows.js の ndgrChatsToMergeRows で行う想定（gift システム
 *     メッセージ guard と vpos 保持はそこに在る）。本エンジンは生の NdgrChat[] を流す。
 *   - hot path（page-intercept の fetch patch / reader ループ）には一切入らない。
 *     呼び出し側（content world）が opt-in でこの generator を回す。
 *
 * @module ndgrBackfillCrawl
 */

import { decodeChunkedEntry } from './ndgrDecode.js';
import { decodePackedSegmentNav } from './ndgrDecode.js';

/**
 * 巡回の各種上限（保守的な初期値）。PoC で rate limit 未測定のため、意図的に
 * 低めに設定し、実機 e2e で 429 が出ないことを確認してから緩める運用。
 *
 * @typedef {{
 *   segments: number,
 *   elapsedMs: number,
 *   bytes: number,
 *   rows: number
 * }} NdgrBackfillCaps
 */

/** @type {Readonly<NdgrBackfillCaps>} */
export const NDGR_BACKFILL_DEFAULT_CAPS = Object.freeze({
  // backward hop（= PackedSegment fetch）の総数。1 hop ≒ 数十秒〜数分の時間窓。実機で
  // 18h 配信は数千 hop 必要（segment窓が短いと 4000+）。最長尺でも遡りきれるよう 20000 に。
  // 実際の終了は通常 backward_exhausted（next.uri 無し＝配信開始）。bytes/rows が最終防波堤。
  segments: 20_000,
  // 経過時間の上限。長尺（18h・数千 hop）でも遡りきれるよう許容（進捗UI前提）。
  // v0.1.417: 10分→15分。実機で 13% 等の途中終了（cap_elapsed 疑い）を減らし完走率を上げる。
  //   進捗はりんく演出で可視化され、タブ非表示で abort されるので長くても無害。
  elapsedMs: 900_000,
  // 累計受信バイトの上限。長尺でも数十 MB 想定。60MB は安全マージン。
  bytes: 60_000_000,
  // 取り込み chat 行の累計上限（storage 膨張の最終防波堤）。
  rows: 100_000
});

/**
 * 各 fetch 間の最小待機（直列・並列度 1）。実機で 200ms だと 18h 配信を 5 分で遡りきれず
 * 39% 止まりだった（数千 hop ×200ms が時間 cap を超過）。広く使われている参考実装
 * NDGRClient は backward 間 10ms。それより安全側の 30ms（約33req/s）にする。mpn.live は
 * CDN 系。429/403 を受けたら NDGR_BACKFILL_BACKOFF_MS で必ず減速・最終的に停止する。
 * v0.1.417: 30ms→15ms。同じ 10 分でも 2 倍の hop を進められ、長尺の完走率を上げる。
 *   NDGRClient の 10ms より安全側を保ちつつ、429/403 backoff の安全網は不変（混雑時は自動減速）。
 */
export const NDGR_BACKFILL_FETCH_GAP_MS = 15;

/**
 * 巡回の起点を「現在より何秒前」にするか。`?at=now` の nextAt は未来方向ポインタで
 * backward が出ないため、封済みになっている過去（この秒数前）を起点に View を読む。
 * 直近この秒数ぶんは RT 記録が拾うので、起点を少し過去にしても取りこぼさない。
 */
export const NDGR_BACKFILL_SEED_LAG_SEC = 90;

/**
 * 1 本の backward 連鎖は時刻区画ごとに next=N で終端する。配信開始まで届かせるには、
 * 終端のたびに「さらに前の時刻」から再シードして次の区画を辿る。その再シード回数の上限。
 * 18h 級でも 1 区画が数十分ぶんなら数十回で開始に届く。暴走防止に 200 で頭打ち。
 */
export const NDGR_BACKFILL_MAX_RESEEDS = 200;
/** 再シード時刻を「最古コメント実時刻 − この秒数」にして区画の取りこぼしを防ぐ。 */
export const NDGR_BACKFILL_RESEED_BUFFER_SEC = 5;
/** 配信開始時刻が不明なときの再シード後退幅（秒・保守的な固定窓）。 */
export const NDGR_BACKFILL_RESEED_STEP_SEC = 1200;

/** 429/403 を受けたときの backoff 待機列（ms）。これを使い切ったら巡回中断。 */
export const NDGR_BACKFILL_BACKOFF_MS = Object.freeze([2_000, 4_000, 8_000]);

/**
 * 巡回の終了理由。
 * @typedef {(
 *   'backward_exhausted' | 'reached_start' | 'cap_reseeds' | 'visited_revisit' |
 *   'cap_segments' | 'cap_elapsed' | 'cap_bytes' | 'cap_rows' | 'aborted' |
 *   'rate_limited' | 'no_view_base' | 'no_entry'
 * )} NdgrBackfillStopReason
 */

/**
 * generator が segment ごとに yield する進捗イベント。
 * @typedef {{
 *   chats: import('./ndgrDecode.js').NdgrChat[],
 *   segmentsFetched: number,
 *   rowsSeen: number,
 *   bytesFetched: number,
 *   minCommentNo: number|null
 * }} NdgrBackfillProgress
 */

/**
 * "view base + at" を組み立てる（base に既存クエリは無い前提＝PoC で確認）。
 * @param {string} viewBase
 * @param {string|number} at
 * @returns {string}
 */
function buildViewAtUrl(viewBase, at) {
  const b = String(viewBase || '');
  const sep = b.includes('?') ? '&' : '?';
  return `${b}${sep}at=${encodeURIComponent(String(at))}`;
}

/**
 * AbortSignal が中断済みかを安全に判定。
 * @param {AbortSignal|undefined} signal
 * @returns {boolean}
 */
function isAborted(signal) {
  return !!(signal && signal.aborted);
}

/**
 * fetchBinary を throttle + backoff 付きで呼ぶ。成功で Uint8Array、レート制限が
 * backoff を使い切ったら null を返す（呼び出し側が rate_limited で停止する）。
 *
 * @param {object} ctx
 * @param {(url: string, opts: { signal?: AbortSignal }) => Promise<{ ok: boolean, status: number, bytes: Uint8Array }>} ctx.fetchBinary
 * @param {(ms: number) => Promise<void>} ctx.sleep
 * @param {AbortSignal|undefined} ctx.signal
 * @param {number} ctx.gapMs
 * @param {string} url
 * @param {boolean} isFirst 最初の fetch は gap を入れない
 * @returns {Promise<{ bytes: Uint8Array|null, rateLimited: boolean }>}
 */
async function fetchWithThrottle(ctx, url, isFirst) {
  if (!isFirst) await ctx.sleep(ctx.gapMs);
  if (isAborted(ctx.signal)) return { bytes: null, rateLimited: false };

  let backoffIdx = 0;
  for (;;) {
    let res;
    try {
      res = await ctx.fetchBinary(url, { signal: ctx.signal });
    } catch {
      // ネットワーク失敗・Abort 等。これ以上の遡及は諦める（best-effort）。
      return { bytes: null, rateLimited: false };
    }
    if (res && res.ok && res.bytes) {
      return { bytes: res.bytes, rateLimited: false };
    }
    const status = res ? res.status : 0;
    // 429/403 はサーバーが嫌がっているサイン。backoff して限られた回数だけ再試行。
    if ((status === 429 || status === 403) && backoffIdx < NDGR_BACKFILL_BACKOFF_MS.length) {
      await ctx.sleep(NDGR_BACKFILL_BACKOFF_MS[backoffIdx]);
      backoffIdx += 1;
      if (isAborted(ctx.signal)) return { bytes: null, rateLimited: false };
      continue;
    }
    if (status === 429 || status === 403) {
      // backoff を使い切った → これ以上叩かない。
      return { bytes: null, rateLimited: true };
    }
    // その他のエラー（404 等）は best-effort で打ち切り。
    return { bytes: null, rateLimited: false };
  }
}

/**
 * chat 配列から最小 commentNo（no）を求める。空なら null。
 * @param {import('./ndgrDecode.js').NdgrChat[]} chats
 * @returns {number|null}
 */
function minNoOf(chats) {
  /** @type {number|null} */
  let min = null;
  for (const c of chats) {
    if (!c || c.no == null) continue;
    const n = Number(c.no);
    if (!Number.isFinite(n)) continue;
    if (min == null || n < min) min = n;
  }
  return min;
}

/**
 * chat 配列から最小 vpos（センチ秒・配信開始からの経過）を求める。空/不明なら null。
 * 再シード時刻の算出（最古コメントの実時刻）に使う。
 * @param {import('./ndgrDecode.js').NdgrChat[]} chats
 * @returns {number|null}
 */
function minVposOf(chats) {
  /** @type {number|null} */
  let min = null;
  for (const c of chats) {
    if (!c || c.vpos == null) continue;
    const v = Number(c.vpos);
    if (!Number.isFinite(v) || v < 0) continue;
    if (min == null || v < min) min = v;
  }
  return min;
}

/**
 * NDGR を backward 方向に巡回し、過去コメント（NdgrChat[]）を segment ごとに yield
 * する async generator。実 I/O は注入された fetchBinary / sleep / now のみ。
 *
 * 巡回フロー:
 *   1. `?at=now` → nextAt（現在地点の long-poll ポインタ）。
 *   2. `?at={nextAt}` → 最初の ChunkedEntry。
 *   3. ChunkedEntry の segment URI を順に fetch → decodePackedSegment → chats を yield。
 *   4. ChunkedEntry の backward URI を直接 fetch して 1 つ前の ChunkedEntry へ（→ 3 へ）。
 *   5. backward URI が無い（配信開始に到達）/ cap / visited / known-min で停止。
 *
 * @param {object} opts
 * @param {string} opts.viewBase NDGR view エンドポイントのベース URL（`?at=` 前）。
 * @param {(url: string, o: { signal?: AbortSignal }) => Promise<{ ok: boolean, status: number, bytes: Uint8Array }>} opts.fetchBinary
 *   URL を fetch して `{ ok, status, bytes }` を返す注入関数。呼び出し側が
 *   `credentials:'omit'` で叩く責務を持つ（cross-origin 必須）。
 * @param {(ms: number) => Promise<void>} [opts.sleep] throttle/backoff 用。既定は実 setTimeout。
 * @param {() => number} [opts.now] 経過時間計測用。既定は Date.now。
 * @param {Partial<NdgrBackfillCaps>} [opts.caps] 上限の上書き。
 * @param {number} [opts.fetchGapMs] fetch 間の待機 ms。
 * @param {number|null} [opts.programStartSec] 配信開始の unixtime（秒）。区画終端での
 *   再シード時刻を「配信開始 + 最古コメント vpos」で精密に算出するのに使う。不明なら
 *   固定窓で後退する（精度は落ちるが動作する）。
 * @param {AbortSignal} [opts.signal] タブ非表示 / SPA 遷移での中断用。
 * @returns {AsyncGenerator<NdgrBackfillProgress, { stopReason: NdgrBackfillStopReason, segmentsFetched: number, rowsSeen: number, bytesFetched: number }, void>}
 */
export async function* crawlNdgrBackward(opts) {
  const viewBase = String(opts?.viewBase || '').trim();
  const fetchBinary = opts?.fetchBinary;
  const sleep =
    typeof opts?.sleep === 'function'
      ? opts.sleep
      : (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
  const now = typeof opts?.now === 'function' ? opts.now : () => Date.now();
  const programStartSec =
    typeof opts?.programStartSec === 'number' && opts.programStartSec > 0
      ? Math.floor(opts.programStartSec)
      : null;
  const caps = { ...NDGR_BACKFILL_DEFAULT_CAPS, ...(opts?.caps || {}) };
  const gapMs =
    typeof opts?.fetchGapMs === 'number' && opts.fetchGapMs >= 0
      ? opts.fetchGapMs
      : NDGR_BACKFILL_FETCH_GAP_MS;
  const signal = opts?.signal;

  let segmentsFetched = 0;
  let rowsSeen = 0;
  let bytesFetched = 0;

  const summary = () => ({ segmentsFetched, rowsSeen, bytesFetched });
  /** @param {NdgrBackfillStopReason} reason */
  const done = (reason) => ({ stopReason: reason, ...summary() });

  if (!viewBase) return done('no_view_base');
  if (typeof fetchBinary !== 'function') return done('no_view_base');

  const ctx = { fetchBinary, sleep, signal, gapMs };

  // --- 1) ?at=now で現在地点ポインタ（nextAt）を得る ---
  if (isAborted(signal)) return done('aborted');
  const nowRes = await fetchWithThrottle(ctx, buildViewAtUrl(viewBase, 'now'), true);
  if (nowRes.rateLimited) return done('rate_limited');
  if (!nowRes.bytes || nowRes.bytes.length === 0) return done('no_entry');
  bytesFetched += nowRes.bytes.length;
  const nowNav = decodeChunkedEntry(nowRes.bytes);
  if (nowNav.nextAt == null) return done('no_entry');

  // --- 2) backward 連鎖の入口 URI（backward.segment.uri）を探す ---
  //   ⭐ 実機で確定（2026-05-27）: 起点は「過去の実時刻」にする。`?at=now` が返す nextAt は
  //   未来方向の long-poll ポインタで、それを起点に next を辿っても backward は出ない
  //   （実機 v0.1.409 で backward_exhausted seg=0）。一方 `?at={少し過去の unixtime}` で
  //   叩くと、その時刻帯の ChunkedEntry に backward.segment.uri が埋まる（v0.1.408 実機で
  //   bwd=Y を確認）。そこで現在より NDGR_BACKFILL_SEED_LAG_SEC 秒前を起点に View を読み、
  //   backward が無ければ next を辿って探す。出たら過去への入口。以降は Backward API
  //   （PackedSegment・下記 3）を辿る。直近 lag 秒ぶんは RT 記録が拾うので取りこぼさない。
  const t0 = now();
  /** @type {Set<string>} 再訪防止（backward URI / at URL を一意キーに） */
  const visited = new Set();
  const nowSec = Math.floor(t0 / 1000);
  /** @type {number|null} これまでに遡れた最古コメントの vpos（センチ秒）。再シード判定用。 */
  let globalMinVpos = null;
  /** @type {{ rateLimited?: boolean, aborted?: boolean }} ヘルパからの異常通知 */
  const abend = {};

  /**
   * ?at={startAt} から View を読み、backward が出るまで next を辿って入口 URI を返す。
   * 見つからなければ ''。rate limit/abort は abend に立てて呼び出し側で停止する。
   * @param {number} startAt
   * @returns {Promise<string>}
   */
  const seekBackwardUri = async (startAt) => {
    let viewAt = startAt;
    for (let hop = 0; hop < 20; hop += 1) {
      if (isAborted(signal)) { abend.aborted = true; return ''; }
      if (now() - t0 >= caps.elapsedMs) { abend.aborted = true; return ''; }
      const atUrl = buildViewAtUrl(viewBase, viewAt);
      if (visited.has(atUrl)) return '';
      visited.add(atUrl);
      const entryRes = await fetchWithThrottle(ctx, atUrl, false);
      if (entryRes.rateLimited) { abend.rateLimited = true; return ''; }
      if (!entryRes.bytes || entryRes.bytes.length === 0) return '';
      bytesFetched += entryRes.bytes.length;
      const entryNav = decodeChunkedEntry(entryRes.bytes);
      if (entryNav.backwardUri) return entryNav.backwardUri;
      if (entryNav.nextAt == null || entryNav.nextAt === viewAt) return '';
      viewAt = entryNav.nextAt;
    }
    return '';
  };

  // === 初回の入口探し: 起点が「過去への入口」を持たないことがある（押すタイミングで
  //   ライブ最先端に近すぎる等）。1 回で諦めず、起点を順に深い過去へずらして確実に
  //   入口を見つける（実機「1 回目0件のムラ」の根治）。配信開始時刻が分かればそれも候補に。===
  /** @type {number[]} 起点候補（現在からの秒数 lag）。浅い→深い順に試す。 */
  const seedLags = [
    NDGR_BACKFILL_SEED_LAG_SEC, 300, 900, 1800, 3600, 7200, 21600, 43200
  ];
  /** @type {number[]} 実際に試す at（秒）。programStart 近傍も末尾に足す。 */
  const seedCandidates = seedLags.map((lag) => nowSec - lag);
  if (programStartSec != null) {
    // 配信開始の少し後（最初の数十秒）も候補に。ここは確実に backward を持つはず。
    seedCandidates.push(programStartSec + 60);
  }
  let seedAtSec = nowSec - NDGR_BACKFILL_SEED_LAG_SEC;
  let initialBackwardUri = '';
  for (const cand of seedCandidates) {
    if (cand <= 0) continue;
    initialBackwardUri = await seekBackwardUri(cand);
    if (abend.aborted) return done('aborted');
    if (abend.rateLimited) return done('rate_limited');
    if (initialBackwardUri) { seedAtSec = cand; break; }
  }
  if (!initialBackwardUri) return done('backward_exhausted');

  // === 外側ループ: 「?at={時刻} で backward 連鎖を辿る」を、配信開始に届くまで時刻を
  //   遡らせて繰り返す。1 本の backward 連鎖は時刻区画ごとに next=N で終端する（実機で
  //   約60%で打ち切られた真因）。終端しても配信開始でなければ、これまでの最古 vpos から
  //   さらに前の ?at で再シードして次の区画を取りに行く。新しく遡れなくなったら終了。===
  for (let reseed = 0; reseed < NDGR_BACKFILL_MAX_RESEEDS; reseed += 1) {
    if (isAborted(signal)) return done('aborted');
    if (now() - t0 >= caps.elapsedMs) return done('cap_elapsed');

    // 入口 URI: 初回は探索済み、再シード後は seedAtSec から探す。
    let backwardUri = reseed === 0 ? initialBackwardUri : await seekBackwardUri(seedAtSec);
    if (abend.aborted) return done('aborted');
    if (abend.rateLimited) return done('rate_limited');
    // 入口が無い＝（再シード後なら）これ以上前は無い＝配信開始に到達。
    if (!backwardUri) {
      return done(reseed === 0 ? 'backward_exhausted' : 'reached_start');
    }

    // --- 3) backward URI を PackedSegment として next.uri で辿る（1 区画ぶん） ---
    let chainMinVpos = null;
    for (;;) {
      if (isAborted(signal)) return done('aborted');
      if (now() - t0 >= caps.elapsedMs) return done('cap_elapsed');
      if (bytesFetched >= caps.bytes) return done('cap_bytes');
      if (segmentsFetched >= caps.segments) return done('cap_segments');
      if (visited.has(backwardUri)) break; // この区画は辿り終えた
      visited.add(backwardUri);

      const bwRes = await fetchWithThrottle(ctx, backwardUri, false);
      if (bwRes.rateLimited) return done('rate_limited');
      if (!bwRes.bytes || bwRes.bytes.length === 0) break; // この区画終わり
      bytesFetched += bwRes.bytes.length;
      segmentsFetched += 1;

      const { results, nextUri } = decodePackedSegmentNav(bwRes.bytes);
      /** @type {import('./ndgrDecode.js').NdgrChat[]} */
      const chats = [];
      for (const r of results) {
        if (r && Array.isArray(r.chats) && r.chats.length) chats.push(...r.chats);
      }

      if (chats.length) {
        rowsSeen += chats.length;
        const minNo = minNoOf(chats);
        const minVpos = minVposOf(chats);
        if (minVpos != null && (chainMinVpos == null || minVpos < chainMinVpos)) {
          chainMinVpos = minVpos;
        }
        yield {
          chats,
          segmentsFetched,
          rowsSeen,
          bytesFetched,
          minCommentNo: minNo
        };
        if (rowsSeen >= caps.rows) return done('cap_rows');
      }

      if (!nextUri) break; // この区画の終端（next=N）。外側ループで再シードする。
      backwardUri = nextUri;
    }

    // === 再シード判定: この区画で「これまでより古い vpos」へ進めたか。 ===
    //   進めていなければ（または vpos 不明なら）配信開始に到達とみなして終了。
    if (
      chainMinVpos == null ||
      (globalMinVpos != null && chainMinVpos >= globalMinVpos)
    ) {
      return done(reseed === 0 ? 'backward_exhausted' : 'reached_start');
    }
    globalMinVpos = chainMinVpos;
    // 次の区画は「最古コメントの実時刻より少し前」から。vpos(センチ秒)→秒に直し、
    //   配信開始(秒) + 最古オフセット - バッファ で再シードする。配信開始が不明なら
    //   現在からの相対で代替（seedAtSec を窓ぶん戻す）。
    const oldestOffsetSec = Math.floor(chainMinVpos / 100);
    if (programStartSec != null) {
      seedAtSec = programStartSec + oldestOffsetSec - NDGR_BACKFILL_RESEED_BUFFER_SEC;
    } else {
      // 配信開始不明: 直近区画ぶん（保守的に固定窓）だけ戻す。
      seedAtSec -= NDGR_BACKFILL_RESEED_STEP_SEC;
    }
  }
  return done('cap_reseeds');
}
