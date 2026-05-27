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
  // 経過時間の上限。長尺（18h・数千 hop）でも遡りきれるよう 10 分まで許容（進捗UI前提）。
  elapsedMs: 600_000,
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
 */
export const NDGR_BACKFILL_FETCH_GAP_MS = 30;

/** 429/403 を受けたときの backoff 待機列（ms）。これを使い切ったら巡回中断。 */
export const NDGR_BACKFILL_BACKOFF_MS = Object.freeze([2_000, 4_000, 8_000]);

/**
 * 巡回の終了理由。
 * @typedef {(
 *   'backward_exhausted' | 'visited_revisit' | 'cap_segments' | 'cap_elapsed' |
 *   'cap_bytes' | 'cap_rows' | 'known_min_reached' | 'aborted' | 'rate_limited' |
 *   'no_view_base' | 'no_entry'
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
 * @param {number|null} [opts.knownMinCommentNo] 既存ストレージの最小 commentNo。
 *   ここに到達したら以降は全て dedupe で捨てられるため早期終了する。
 * @param {Partial<NdgrBackfillCaps>} [opts.caps] 上限の上書き。
 * @param {number} [opts.fetchGapMs] fetch 間の待機 ms。
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
  const knownMin =
    opts?.knownMinCommentNo == null ? null : Number(opts.knownMinCommentNo);
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
  //   ⭐ 2026-05-27 OSS 3実装（NDGRClient/NdgrClientSharp/rinsuki-lab）の正解:
  //   View の ChunkedEntry stream を ?at={next.at} で読み、`backward` フィールドを持つ
  //   entry が現れるまで `next` ポインタを辿る（NDGRClient の外側 while ループ）。
  //   1 回の ?at={nextAt} だけだと live-tip 応答に backward が無いことがあり、旧実装は
  //   そこで即 backward_exhausted（実機で押しても無反応の回帰）していた。next を数回
  //   辿れば backward が出る。出たらそれが過去への入口。以降は Backward API
  //   （PackedSegment・下記 3）を辿る。View の live segment は long-poll で空なので使わない。
  const t0 = now();
  /** @type {Set<string>} 再訪防止（backward URI / at URL を一意キーに） */
  const visited = new Set();
  /** @type {string} backward 連鎖の入口 URI（見つかるまで '') */
  let backwardUri = '';
  let seedAt = nowNav.nextAt;
  // next を辿る回数の上限（暴走防止）。通常は数回で backward が出る。
  for (let hop = 0; hop < 20; hop += 1) {
    if (isAborted(signal)) return done('aborted');
    if (now() - t0 >= caps.elapsedMs) return done('cap_elapsed');
    const atUrl = buildViewAtUrl(viewBase, seedAt);
    if (visited.has(atUrl)) break; // 同じ at に戻された＝これ以上進めない
    visited.add(atUrl);
    const entryRes = await fetchWithThrottle(ctx, atUrl, false);
    if (entryRes.rateLimited) return done('rate_limited');
    if (!entryRes.bytes || entryRes.bytes.length === 0) return done('no_entry');
    bytesFetched += entryRes.bytes.length;
    const entryNav = decodeChunkedEntry(entryRes.bytes);
    if (entryNav.backwardUri) {
      backwardUri = entryNav.backwardUri; // 過去への入口を発見
      break;
    }
    // backward がまだ無ければ next を辿る（進めない/同じなら終了）。
    if (entryNav.nextAt == null || entryNav.nextAt === seedAt) break;
    seedAt = entryNav.nextAt;
  }
  if (!backwardUri) return done('backward_exhausted');

  // --- 3) backward URI を PackedSegment として辿り、配信開始まで遡る ---
  //   Backward API の応答は ChunkedEntry ではなく PackedSegment（body 全体が 1 メッセージ・
  //   length-delimited 分割しない）。コメントは messages にインライン、次に古い URI は
  //   next.uri。next が無くなったら配信開始＝完了。旧実装はここを decodeChunkedEntry で
  //   誤解釈し chat を 0 件しか拾えず数ホップで backward_exhausted していた。
  for (;;) {
    if (isAborted(signal)) return done('aborted');
    if (now() - t0 >= caps.elapsedMs) return done('cap_elapsed');
    if (bytesFetched >= caps.bytes) return done('cap_bytes');
    if (segmentsFetched >= caps.segments) return done('cap_segments');
    if (visited.has(backwardUri)) return done('visited_revisit');
    visited.add(backwardUri);

    const bwRes = await fetchWithThrottle(ctx, backwardUri, false);
    if (bwRes.rateLimited) return done('rate_limited');
    if (!bwRes.bytes || bwRes.bytes.length === 0) return done('backward_exhausted');
    bytesFetched += bwRes.bytes.length;
    segmentsFetched += 1;

    const { results, nextUri } = decodePackedSegmentNav(bwRes.bytes);
    /** @type {import('./ndgrDecode.js').NdgrChat[]} */
    const chats = [];
    for (const r of results) {
      if (r && Array.isArray(r.chats) && r.chats.length) chats.push(...r.chats);
    }
    // ⛔ NLS_BACKFILL_DIAG4: backward ホップ可視化（確定後に除去）。
    try {
      console.warn(
        `[NLS_BACKFILL_DIAG4] bw hop bytes=${bwRes.bytes.length} msgs=${results.length} chats=${chats.length} next=${nextUri ? 'Y' : 'N'}`
      );
    } catch { /* no-op */ }

    if (chats.length) {
      rowsSeen += chats.length;
      const minNo = minNoOf(chats);
      yield {
        chats,
        segmentsFetched,
        rowsSeen,
        bytesFetched,
        minCommentNo: minNo
      };
      // 行数 cap（storage 膨張の最終防波堤）。
      if (rowsSeen >= caps.rows) return done('cap_rows');
      // 既存ストレージの最古に到達 → 以降は全て dedupe で捨てられるので早期終了。
      if (knownMin != null && minNo != null && minNo <= knownMin) {
        return done('known_min_reached');
      }
    }

    // next.uri が無ければ配信開始に到達（唯一の自然終了）。
    if (!nextUri) return done('backward_exhausted');
    backwardUri = nextUri;
  }
}
