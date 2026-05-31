/**
 * v0.1.511: NDGR コメントの「前方向（forward）継続取得」巡回エンジン（純ロジック）。
 *
 * 目的（[[前方向NDGR継続取得]] プラン）:
 *   ページの NDGR 通信を横から傍受する現行の継続取得は、ページ側の状態（WebSocket 再接続漏れ・
 *   仮想リスト・裏タブ throttle）に依存して desync し、「記録カウントが本家コメントに追従せず止まる」
 *   症状を起こしていた。そこで公式プレイヤーと同じ要領で、拡張自身が NDGR view エンドポイントの
 *   前方向ポインタ `nextAt` を long-poll で辿り続け、新着 ChunkedEntry の segment を取得し続ける
 *   独立経路を提供する。取得行は既存 dedupe（mergeNewComments）で二重排除されるため、page-intercept
 *   傍受・DOM harvest と併走しても安全。
 *
 * 設計（過去ログ backward 巡回 ndgrBackfillCrawl.js と同じ「注入式純ロジック」思想）:
 *   - fetch / sleep / now / signal を引数で受け取り、副作用は yield のみ。実 I/O ゼロで
 *     フィクスチャ fetch により単体テストできる。
 *   - backward 専用の reseed / reached_start / PackedSegment 連鎖は持たない（forward は
 *     `?at=now` → nextAt → `?at={nextAt}` の単純な long-poll ループ）。
 *   - hot path（page-intercept の fetch patch / reader ループ）には一切入らない。呼び出し側
 *     （content world のリーダータブ 1 本）が opt-in でこの generator を回す。
 *   - rate limit（429/403）と一過性失敗（timeout/5xx/空）は backward 実装で実証済みの
 *     backoff/transient 列を再利用する（混雑時は自動減速・最終的に停止して BAN を避ける）。
 *
 * @module ndgrForwardCrawl
 */

import { decodeChunkedEntry, decodeChunkedMessage } from './ndgrDecode.js';
import { splitLengthDelimitedMessages } from './lengthDelimitedStream.js';
import {
  NDGR_BACKFILL_BACKOFF_MS,
  NDGR_BACKFILL_TRANSIENT_RETRY_MS
} from './ndgrBackfillCrawl.js';

/**
 * 継続取得の上限（最終防波堤）。forward は配信中ずっと走る前提なので「経過時間の上限」は持たず、
 * 累計セグメント / 行のみで暴走を止める（通常は abort（タブ離脱 / liveId 変化 / 番組終了）で終了）。
 *
 * v0.1.512 軽量化: `segmentsPerHop` を追加。1 回の long-poll hop で取得する segment 数に上限を設け、
 *   巨大・高速放送で 1 hop の同期デコード/保存バーストが描画スレッドを詰まらせる（実機 lv 37k で
 *   「ページが応答しません」を観測）のを防ぐ。超過分は次 hop に自然に持ち越される。
 * @typedef {{ segments: number, rows: number, segmentsPerHop: number }} NdgrForwardCaps
 */
/** @type {Readonly<NdgrForwardCaps>} */
export const NDGR_FORWARD_DEFAULT_CAPS = Object.freeze({
  segments: 500_000,
  rows: 5_000_000,
  segmentsPerHop: 8
});

/**
 * long-poll の最小待機（nextAt が現在/過去のときでもこの間隔は空ける＝叩きすぎ防止）。
 * v0.1.512: 500ms→2000ms。forward は「傍受/DOM が取りこぼした新着を補うバックアップ」なので
 *   2 秒間隔で十分。間隔を広げて巨大放送での描画スレッド占有・storage チェーン負荷を下げる
 *   （実機 37k 放送のハードフリーズ対策）。
 */
export const NDGR_FORWARD_MIN_GAP_MS = 2_000;
/** long-poll の最大待機（nextAt が遠い未来でもこの間隔で必ず再ポールして鮮度を保つ）。 */
export const NDGR_FORWARD_MAX_GAP_MS = 8_000;
/** 同一 hop 内で複数 segment を fetch するときの最小待機。 */
export const NDGR_FORWARD_FETCH_GAP_MS = 15;
/** entry fetch が連続で空/失敗したときに諦める回数（一過性 backoff を使い切った後の上限）。 */
export const NDGR_FORWARD_MAX_CONSEC_ERRORS = 30;
/** visited segment URI 集合の上限（長尺で無限肥大しないよう古い側を間引く）。 */
export const NDGR_FORWARD_VISITED_MAX = 4_000;
/**
 * v0.1.512: `previousUris`（直近過去の MessageSegment）を取得する最大件数。**初回 hop のみ**取得する
 *   ことで「ライブ最前〜起点の隙間」を一度だけ埋め、以降はライブ edge だけを追う。毎 hop で過去を
 *   再取得すると巨大放送で過剰バースト→フリーズの原因になるため上限・初回限定にする
 *   （配信開始までの本格的な過去埋めは backward backfill が担当）。
 */
export const NDGR_FORWARD_FIRST_HOP_PREVIOUS_MAX = 4;

/**
 * 巡回の終了理由。
 * @typedef {(
 *   'aborted' | 'no_view_base' | 'no_cursor' | 'rate_limited' |
 *   'cap_segments' | 'cap_rows' | 'too_many_errors'
 * )} NdgrForwardStopReason
 */

/**
 * generator が segment ごとに yield する進捗イベント。
 * @typedef {{
 *   chats: import('./ndgrDecode.js').NdgrChat[],
 *   nextAt: number|null,
 *   segmentsFetched: number,
 *   rowsSeen: number,
 *   bytesFetched: number
 * }} NdgrForwardProgress
 */

/**
 * "view base + at" を組み立てる（base に既存クエリは無い前提）。
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
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function positiveOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * @param {number} value
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
function clamp(value, lo, hi) {
  if (!Number.isFinite(value)) return lo;
  return Math.max(lo, Math.min(hi, value));
}

/**
 * fetchBinary を throttle + backoff 付きで呼ぶ（backward 実装と同形）。成功で Uint8Array、
 * レート制限が backoff を使い切ったら rateLimited:true を返す（呼び出し側が停止する）。
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
  let transientIdx = 0;
  for (;;) {
    let res;
    try {
      res = await ctx.fetchBinary(url, { signal: ctx.signal });
    } catch {
      if (isAborted(ctx.signal)) return { bytes: null, rateLimited: false };
      if (transientIdx < NDGR_BACKFILL_TRANSIENT_RETRY_MS.length) {
        await ctx.sleep(NDGR_BACKFILL_TRANSIENT_RETRY_MS[transientIdx]);
        transientIdx += 1;
        if (isAborted(ctx.signal)) return { bytes: null, rateLimited: false };
        continue;
      }
      return { bytes: null, rateLimited: false };
    }
    if (res && res.ok && res.bytes && res.bytes.length > 0) {
      return { bytes: res.bytes, rateLimited: false };
    }
    const status = res ? res.status : 0;
    if ((status === 429 || status === 403) && backoffIdx < NDGR_BACKFILL_BACKOFF_MS.length) {
      await ctx.sleep(NDGR_BACKFILL_BACKOFF_MS[backoffIdx]);
      backoffIdx += 1;
      if (isAborted(ctx.signal)) return { bytes: null, rateLimited: false };
      continue;
    }
    if (status === 429 || status === 403) {
      return { bytes: null, rateLimited: true };
    }
    if (
      (status >= 500 || status === 0 || !res || !res.bytes || res.bytes.length === 0) &&
      transientIdx < NDGR_BACKFILL_TRANSIENT_RETRY_MS.length
    ) {
      await ctx.sleep(NDGR_BACKFILL_TRANSIENT_RETRY_MS[transientIdx]);
      transientIdx += 1;
      if (isAborted(ctx.signal)) return { bytes: null, rateLimited: false };
      continue;
    }
    return { bytes: null, rateLimited: false };
  }
}

/**
 * MessageSegment URI の中身（ChunkedMessage の length-delimited stream）から chats を抽出する。
 * 壊れたフレームでは throw して呼び出し側がスキップできるようにする（巡回は止めない）。
 * @param {Uint8Array} bytes
 * @returns {import('./ndgrDecode.js').NdgrChat[]}
 */
function extractChatsFromSegment(bytes) {
  /** @type {import('./ndgrDecode.js').NdgrChat[]} */
  const chats = [];
  const frames = splitLengthDelimitedMessages(bytes);
  for (const frame of frames) {
    const decoded = decodeChunkedMessage(frame);
    if (decoded && Array.isArray(decoded.chats) && decoded.chats.length) {
      chats.push(...decoded.chats);
    }
  }
  return chats;
}

/**
 * visited 集合が上限を超えたら古い側を間引く（Set は挿入順を保持するので先頭から削る）。
 * @param {Set<string>} visited
 */
function trimVisited(visited) {
  if (visited.size <= NDGR_FORWARD_VISITED_MAX) return;
  const removeCount = visited.size - NDGR_FORWARD_VISITED_MAX;
  let i = 0;
  for (const key of visited) {
    visited.delete(key);
    i += 1;
    if (i >= removeCount) break;
  }
}

/**
 * NDGR view の前方向ポインタ（nextAt）を long-poll で辿り、新着 segment の chats を yield し続ける
 * async generator。配信中ずっと回す前提（終了は通常 abort / cap）。
 *
 * フロー:
 *   1. `?at=now` → decodeChunkedEntry(bytes).nextAt で初期カーソル取得。
 *   2. `?at={cursorAt}` → ChunkedEntry → segmentUris（ライブ edge）＋ previousUris（直近過去）を fetch。
 *   3. 各 segment URI → ChunkedMessage stream → decodeChunkedMessage で chats 抽出 → yield。
 *   4. cursorAt = nextAt。`wait = clamp(nextAt*1000 - now(), minGapMs, maxGapMs)` で sleep。
 *
 * @param {object} opts
 * @param {string} opts.viewBase NDGR view URL ベース（`?at=` 前）。
 * @param {(url: string, o: { signal?: AbortSignal }) => Promise<{ ok: boolean, status: number, bytes: Uint8Array }>} opts.fetchBinary
 * @param {(ms: number) => Promise<void>} [opts.sleep]
 * @param {() => number} [opts.now] epoch ms（既定 Date.now）。
 * @param {AbortSignal} [opts.signal]
 * @param {Partial<NdgrForwardCaps>} [opts.caps]
 * @param {number} [opts.minGapMs]
 * @param {number} [opts.maxGapMs]
 * @param {number} [opts.fetchGapMs]
 * @returns {AsyncGenerator<NdgrForwardProgress, { stopReason: NdgrForwardStopReason, segmentsFetched: number, rowsSeen: number, bytesFetched: number }, void>}
 */
export async function* crawlNdgrForward(opts) {
  const viewBase = String(opts?.viewBase || '').trim();
  const fetchBinary = opts?.fetchBinary;
  const sleep =
    typeof opts?.sleep === 'function'
      ? opts.sleep
      : (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
  const now = typeof opts?.now === 'function' ? opts.now : () => Date.now();
  const signal = opts?.signal;
  const caps = { ...NDGR_FORWARD_DEFAULT_CAPS, ...(opts?.caps || {}) };
  const minGapMs = positiveOr(opts?.minGapMs, NDGR_FORWARD_MIN_GAP_MS);
  const maxGapMs = Math.max(minGapMs, positiveOr(opts?.maxGapMs, NDGR_FORWARD_MAX_GAP_MS));
  const fetchGapMs = positiveOr(opts?.fetchGapMs, NDGR_FORWARD_FETCH_GAP_MS);

  let segmentsFetched = 0;
  let rowsSeen = 0;
  let bytesFetched = 0;
  const summary = () => ({ segmentsFetched, rowsSeen, bytesFetched });
  /** @param {NdgrForwardStopReason} reason */
  const done = (reason) => ({ stopReason: reason, ...summary() });

  if (!viewBase || typeof fetchBinary !== 'function') return done('no_view_base');

  const ctx = { fetchBinary, sleep, signal, gapMs: fetchGapMs };
  /** @type {Set<string>} 取得済み segment URI（同一バケット再 fetch を避ける）。 */
  const visitedSegments = new Set();
  let consecutiveErrors = 0;

  // 1) ?at=now → 初期カーソル（未来方向 long-poll ポインタ）。
  if (isAborted(signal)) return done('aborted');
  const nowRes = await fetchWithThrottle(ctx, buildViewAtUrl(viewBase, 'now'), true);
  if (nowRes.rateLimited) return done('rate_limited');
  if (!nowRes.bytes) return done('no_cursor');
  bytesFetched += nowRes.bytes.length;
  let cursorAt = decodeChunkedEntry(nowRes.bytes).nextAt;
  if (cursorAt == null) return done('no_cursor');

  // 2) 前方向 long-poll ループ。
  let hopIndex = 0;
  for (;;) {
    if (isAborted(signal)) return done('aborted');
    if (segmentsFetched >= caps.segments) return done('cap_segments');
    if (rowsSeen >= caps.rows) return done('cap_rows');

    const entryRes = await fetchWithThrottle(ctx, buildViewAtUrl(viewBase, cursorAt), true);
    if (entryRes.rateLimited) return done('rate_limited');
    if (!entryRes.bytes) {
      // entry fetch が空/失敗（transient 列は fetchWithThrottle 内で使い切り済み）。
      consecutiveErrors += 1;
      if (consecutiveErrors >= NDGR_FORWARD_MAX_CONSEC_ERRORS) return done('too_many_errors');
      if (isAborted(signal)) return done('aborted');
      await sleep(minGapMs);
      continue;
    }
    consecutiveErrors = 0;
    bytesFetched += entryRes.bytes.length;
    const nav = decodeChunkedEntry(entryRes.bytes);

    // ライブ edge（segmentUris）を集める。previousUris（直近過去）は初回 hop のみ・件数上限つき
    //   （v0.1.512: 毎 hop の過去再取得＝巨大放送フリーズの原因を回避。過去埋めは backfill 担当）。
    /** @type {string[]} */
    const segUris = [];
    for (const u of nav.segmentUris) if (u && !visitedSegments.has(u)) segUris.push(u);
    if (hopIndex === 0) {
      let prevTaken = 0;
      for (const u of nav.previousUris) {
        if (prevTaken >= NDGR_FORWARD_FIRST_HOP_PREVIOUS_MAX) break;
        if (u && !visitedSegments.has(u)) {
          segUris.push(u);
          prevTaken += 1;
        }
      }
    }
    // v0.1.512: 1 hop あたりの segment 取得数に上限（同期デコード/保存バーストの抑制）。
    //   超過分は visited に入れず、次 hop で（まだ生きていれば）拾い直す。
    const hopSegUris =
      segUris.length > caps.segmentsPerHop ? segUris.slice(0, caps.segmentsPerHop) : segUris;

    for (const uri of hopSegUris) {
      if (isAborted(signal)) return done('aborted');
      visitedSegments.add(uri);
      const segRes = await fetchWithThrottle(ctx, uri, false);
      if (segRes.rateLimited) return done('rate_limited');
      if (!segRes.bytes || segRes.bytes.length === 0) continue; // best-effort スキップ
      bytesFetched += segRes.bytes.length;
      segmentsFetched += 1;

      /** @type {import('./ndgrDecode.js').NdgrChat[]} */
      let chats;
      try {
        chats = extractChatsFromSegment(segRes.bytes);
      } catch {
        continue; // 壊れたフレームで巡回を止めない
      }
      if (chats.length) {
        rowsSeen += chats.length;
        yield {
          chats,
          nextAt: nav.nextAt,
          segmentsFetched,
          rowsSeen,
          bytesFetched
        };
        if (rowsSeen >= caps.rows) return done('cap_rows');
      }
    }
    trimVisited(visitedSegments);
    hopIndex += 1;

    // 3) カーソル前進（long-poll）。nextAt が無ければ minGap 待って同じ at を再ポール。
    const nextAt = nav.nextAt;
    if (nextAt == null) {
      if (isAborted(signal)) return done('aborted');
      await sleep(minGapMs);
      continue;
    }
    const waitMs = clamp(nextAt * 1000 - now(), minGapMs, maxGapMs);
    cursorAt = nextAt;
    if (isAborted(signal)) return done('aborted');
    await sleep(waitMs);
  }
}
