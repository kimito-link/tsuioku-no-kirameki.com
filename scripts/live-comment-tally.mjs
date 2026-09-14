#!/usr/bin/env node
/**
 * live-comment-tally.mjs — `/live/` の 3 枠目「💬 コメントで応援した人」を集める I/O 係。
 *
 * ■ これは何をするか(2026-09-14・第1版)
 *   1. 保存済みの一覧を GET(`/api/live-ranking`)。放送中の配信を読む(`?refresh=1` は叩かない)。
 *   2. 配信ごとに:
 *        watch ページ HTML → extractEmbeddedData → pickWsUrlFromEmbeddedData
 *        その WS にゲストで接続 → startWatching を 1 通だけ送る
 *        → messageServer を受けたら viewUri を取って【即 close】
 *        → crawlNdgrBackward に Node の fetch を注入して配信開始まで遡る
 *        → 各区画の chats を ndgrChatsToMergeRows → createCommentTally().add()
 *   3. 全配信ぶんを 1 body にまとめて POST(`?ingest=comments`・`x-share-key`)。
 *
 * ■ ★秘密を出さない(この約束がこのファイルの一番の制約)
 *   `webSocketUrl`(audience_token 入り)・`viewUri`・映像(HLS)の URI は
 *   **ログにも POST body にも一切出さない**。ここで扱うのは「数えた結果」だけ。
 *   映像の情報(stream)は読まない。
 *
 * ■ ★純ロジックは src/lib にある。ここに式を書き直さない
 *   採用判定・uid の決め方  → src/lib/ndgrChatRows.js
 *   遡りの巡回              → src/lib/ndgrBackfillCrawl.js
 *   数える                  → src/lib/liveCommentTally.js
 *   HTML から埋め込み JSON  → src/lib/nicoliveRankingPick.js / embeddedDataExtract.js
 *
 * ■ 使い方
 *   node scripts/live-comment-tally.mjs                 … 集めて POST する(cron の本番動作)
 *   node scripts/live-comment-tally.mjs --dry-run       … POST せず同じ JSON を stdout へ
 *   node scripts/live-comment-tally.mjs --lv lvNNNNNN   … その配信だけ
 *   node scripts/live-comment-tally.mjs --limit 3       … 先頭 N 配信だけ
 *
 * ■ 終了コード
 *   0 … POST が 200 かつ stored:true(--dry-run は常に 0)。`ng>0`/cap/rate_limited は ::warning::
 *   1 … `ok=0 かつ lives>=1`、または POST が 200 でない(::error::)
 *
 * ★global WebSocket は Node 22 から。workflow は node-version: "22" を明示している。
 *
 * @module live-comment-tally
 */

import { crawlNdgrBackward } from '../src/lib/ndgrBackfillCrawl.js';
import { ndgrChatsToMergeRows } from '../src/lib/ndgrChatRows.js';
import { extractEmbeddedData } from '../src/lib/nicoliveRankingPick.js';
import { pickWsUrlFromEmbeddedData } from '../src/lib/embeddedDataExtract.js';
import { fetchViewUri, fetchWatchHtml } from '../src/server/nicoliveGuest.js';
import {
  createCommentTally,
  rowsBeyondWater,
  waterOf,
  TALLY_STATE_UIDS_MAX
} from '../src/lib/liveCommentTally.js';

/** ★連絡先を名乗る(相手が迷惑に思ったとき止められるように)。 */
const UA = 'tsuioku-no-kirameki.com live-ranking (admin@kimito-link.com)';

/** GET 元・POST 先。環境変数で差し替えられる(検証で別環境を指せるように)。 */
const API_BASE = process.env.LIVE_RANKING_API || 'https://app.tsuioku-no-kirameki.com/api/live-ranking';

/** run 全体の締め切り。GitHub Actions の timeout-minutes: 6 より十分手前で必ず返す。 */
const RUN_DEADLINE_MS = 150_000;
/** 配信の並列数。相手にもテールにも優しい値(api/live-ranking.js の mapPool と同じ思想)。 */
const CONCURRENCY = 3;
/** WS 握手の上限。返らない相手で run を溶かさない。 */
const WS_TIMEOUT_MS = 5_000;
/** HTML / NDGR の 1 リクエスト上限。 */
const HTTP_TIMEOUT_MS = 8_000;
/**
 * 1 配信ぶんの巡回の上限。
 * ★実測(2026-09-14・68 分の配信)は 38 区画・2.7MB・4.6 秒で `reached_start`。
 *   18h 配信へ比例換算すると約 600 区画・43MB。ここはそれを**上回らない**保守値にして、
 *   長尺は `partial:true`(「直近ぶんの集計」)として載せる。
 */
const CRAWL_CAPS = Object.freeze({ elapsedMs: 20_000, segments: 150, bytes: 8_000_000, rows: 400_000 });
/** 巡回の fetch 間隔(ms)。lib の既定より安全側。 */
const FETCH_GAP_MS = 30;
/** 「最後まで遡れた」とみなす終了理由。これ以外は partial(直近ぶん)。 */
const COMPLETE_STOP_REASONS = new Set(['reached_start', 'backward_exhausted']);
/**
 * ★消費側だけの停止語(lib の enum には入れない)。増分集計のフェーズ A が「前回領域を含む
 *   区画を 1 つ取り込んで止まった」ことを表す。この語のときだけフェーズ B(掘り下げ)へ進む。
 */
const REACHED_HIGH_WATER = 'reached_high_water';
/**
 * ★state(全配信ぶん)の総バイト上限。Upstash の 1 リクエスト本文上限が未確認なので保守側。
 *   超えたら uids の多い配信から uids を落とす(その配信は次 run フル・cap で守られる)。
 */
const STATE_MAX_BYTES = 1_000_000;
/** フェーズ B(掘り下げ)へ進む残り時間の下限。これ未満なら B に入らない。 */
const DIG_MIN_REMAINING_MS = 3_000;

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);
const argOf = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '';
};
const DRY_RUN = hasFlag('dry-run');
const ONLY_LV = String(argOf('lv') || '').trim().toLowerCase();
const LIMIT = Number(argOf('limit')) || 0;

/** @type {AbortController} run 全体で共有する締め切り。 */
const runAbort = new AbortController();
const runStartedAt = Date.now();
const deadlineTimer = setTimeout(() => runAbort.abort(), RUN_DEADLINE_MS);
deadlineTimer.unref?.();
const deadlinePassed = () => runAbort.signal.aborted;

/**
 * 巡回エンジンへ注入する fetch。★`credentials` を送らない素の GET。
 * @param {string} url
 * @param {{ signal?: AbortSignal }} [o]
 * @returns {Promise<{ ok: boolean, status: number, bytes: Uint8Array }>}
 */
async function fetchBinary(url, o) {
  const signals = [o?.signal, AbortSignal.timeout(HTTP_TIMEOUT_MS)].filter(Boolean);
  const res = await fetch(url, {
    signal: AbortSignal.any(signals),
    headers: { 'user-agent': UA },
    redirect: 'follow'
  });
  return { ok: res.ok, status: res.status, bytes: new Uint8Array(await res.arrayBuffer()) };
}

/*
 * ★watch HTML 取得と WS 握手(viewUri 取得)は src/server/nicoliveGuest.js へ移した。
 *   api/live-recent-comments.js と共用する(2 箇所目を書かない)。ここでは import して
 *   run の締め切り signal と本ファイルの timeout 定数を渡すだけ。
 */

/**
 * 巡回 generator を回し、前回水位より外側の行だけを tally へ足す(増分の心臓部)。
 *
 * ★フェーズ A は「前回領域を含む区画を 1 つ取り込んだら止める」(勾配 §6-2)。区画の重複は
 *   `rowsBeyondWater` が水位で弾く。フェーズ B は resumeFromVpos で古い側へ進む。
 * ★`gen.return()` は generator を完了させるだけ(lib に finally は無い・設計 §6-4)。
 *
 * @param {AsyncGenerator<any, any, void>} gen
 * @param {{ maxNo: number|null, maxVpos: number|null, minNo: number|null, minVpos: number|null }} startWater
 *   この巡回に入る時点の高水位(A は prev、B は A 終了時の水位)。
 * @param {(rows: any) => void} addRows tally への追加(前回領域外だけ渡される)。
 * @param {boolean} stopAtHighWater true=前回領域を含む区画で止める(フェーズ A)。false=最後まで(B)。
 * @param {number|null} highWaterMaxNo フェーズ A の停止判定に使う prev.maxNo。
 * @returns {Promise<{ stopReason: string, segments: number, bytes: number, water: object }>}
 */
async function runCrawlPhase(gen, startWater, addRows, stopAtHighWater, highWaterMaxNo) {
  let water = { ...startWater };
  let stopReason = 'no_entry';
  let segments = 0;
  let bytes = 0;
  try {
    for (;;) {
      const n = await gen.next();
      if (n.done) {
        const v = /** @type {any} */ (n.value) || {};
        stopReason = String(v.stopReason || 'no_entry');
        segments = Number(v.segmentsFetched) || segments;
        bytes = Number(v.bytesFetched) || bytes;
        break;
      }
      const v = /** @type {any} */ (n.value) || {};
      segments = Number(v.segmentsFetched) || segments;
      bytes = Number(v.bytesFetched) || bytes;
      if (Array.isArray(v.chats) && v.chats.length) {
        const rows = ndgrChatsToMergeRows(v.chats);
        addRows(rowsBeyondWater(rows, water));
        water = waterOf(rows, water);
      }
      // ★フェーズ A: 前回領域を含む区画(最古 no <= prev.maxNo)を 1 つ取り込んだら止める。
      if (
        stopAtHighWater &&
        highWaterMaxNo != null &&
        v.minCommentNo != null &&
        Number(v.minCommentNo) <= highWaterMaxNo
      ) {
        stopReason = REACHED_HIGH_WATER;
        try {
          await gen.return(undefined);
        } catch {
          // ★lib に finally は無い(設計 §6-4)。投げても run は落とさない。
        }
        break;
      }
    }
  } catch {
    // ★壊れた 1 本で run 全体を落とさない。その時点までの数はそのまま使う。
    // ★例外の本文は載せない(URL/token 混入を構造的に断つ)。
    stopReason = 'crawl_error';
  }
  return { stopReason, segments, bytes, water };
}

/**
 * 1 配信ぶりを数える。★`entry` は表示用(byLive)・`state` は次 run の続きの起点(stateByLive)。
 *
 * @param {{ liveId: string, beginTime?: unknown, streamer?: { id?: unknown }|null }} live
 * @param {object|null} [prev] 前回の state.byLive[lv](無ければ null=初回フル遡及)。
 * @returns {Promise<{ ok: boolean, reason: string, entry: object|null, state: object|null }>}
 */
async function tallyOne(live, prev) {
  const lv = String(live.liveId || '').trim().toLowerCase();
  if (!/^lv\d{6,15}$/.test(lv)) return { ok: false, reason: 'bad_live_id', entry: null, state: null };

  const html = await fetchWatchHtml(lv, { timeoutMs: HTTP_TIMEOUT_MS, signal: runAbort.signal, ua: UA });
  if (!html) return { ok: false, reason: 'watch_fetch_failed', entry: null, state: null };
  const props = extractEmbeddedData(html);
  if (!props) return { ok: false, reason: 'no_embedded_data', entry: null, state: null };
  const wsUrl = pickWsUrlFromEmbeddedData(/** @type {any} */ (props));
  // ★終了した番組は空文字になる(実測)。「取れない」と「終わっている」を混ぜない。
  if (!wsUrl) return { ok: false, reason: 'no_ws_url', entry: null, state: null };

  const { viewUri, error } = await fetchViewUri(wsUrl, { timeoutMs: WS_TIMEOUT_MS });
  if (!viewUri) return { ok: false, reason: error || 'no_view_uri', entry: null, state: null };

  const p = prev && typeof prev === 'object' ? prev : null;
  const beginSec = Math.floor(Number(live.beginTime) || 0) || null;
  // ★前回の名簿・累計を seed して先着順と件数を run 跨ぎで保つ(前回分は水位フィルタが弾く)。
  const tally = createCommentTally({
    broadcasterUid: live.streamer ? live.streamer.id : '',
    seed: p ? { uids: p.uids, comments: p.comments } : undefined
  });
  const addRows = (rows) => { if (Array.isArray(rows) && rows.length) tally.add(rows); };
  const nulls = { maxNo: null, maxVpos: null, minNo: null, minVpos: null };
  const prevWater = p
    ? { maxNo: p.maxNo ?? null, maxVpos: p.maxVpos ?? null, minNo: p.minNo ?? null, minVpos: p.minVpos ?? null }
    : nulls;

  const t0 = Date.now();

  // ── フェーズ A(常に): 新しい区画から。増分なら前回領域を含む区画で止める。
  const genA = crawlNdgrBackward({
    viewBase: viewUri,
    fetchBinary,
    signal: runAbort.signal,
    programStartSec: beginSec,
    fetchGapMs: FETCH_GAP_MS,
    caps: { ...CRAWL_CAPS }
  });
  const a = await runCrawlPhase(genA, prevWater, addRows, !!p, p ? (p.maxNo ?? null) : null);
  let water = a.water;
  let segments = a.segments;
  let bytes = a.bytes;
  const stopA = a.stopReason;
  let stopB = null;

  // ── フェーズ B(掘り下げ): 前回が未完・A が高水位で止まった・残り時間あり のときだけ。
  const remainingMs = CRAWL_CAPS.elapsedMs - (Date.now() - t0);
  if (p && !p.complete && stopA === REACHED_HIGH_WATER && remainingMs > DIG_MIN_REMAINING_MS) {
    const genB = crawlNdgrBackward({
      viewBase: viewUri,
      fetchBinary,
      signal: runAbort.signal,
      programStartSec: beginSec,
      fetchGapMs: FETCH_GAP_MS,
      caps: { ...CRAWL_CAPS, elapsedMs: remainingMs },
      resumeFromVpos: p.minVpos ?? null
    });
    const b = await runCrawlPhase(genB, water, addRows, false, null);
    water = b.water;
    segments += b.segments;
    bytes += b.bytes;
    stopB = b.stopReason;
  }

  const complete = !!(p && p.complete) || COMPLETE_STOP_REASONS.has(stopA) || (stopB != null && COMPLETE_STOP_REASONS.has(stopB));
  const stopReason = stopB != null ? stopB : stopA;
  const mode = p ? 'incremental' : 'full';
  const dug = stopB != null; // フェーズ B(古い側の掘り下げ)が走ったか。

  const r = tally.result();
  const entry = {
    rankers: r.rankers,
    commenters: r.commenters,
    comments: r.comments,
    anonCommenters: r.anonCommenters,
    stopReason,
    mode,
    dug,
    segments,
    bytes,
    ms: Date.now() - t0,
    partial: !complete
  };

  // ★state: crawl が壊れた run(crawl_error)の水位は信じない=prev をそのまま持ち越す(設計 §6-5)。
  //   uids が多すぎる配信は state を書かない(=次 run フル・cap で守られる)。
  let state;
  if (stopA === 'crawl_error' || (stopB != null && stopB === 'crawl_error')) {
    state = p || null;
  } else if (Object.keys(r.uids).length > TALLY_STATE_UIDS_MAX) {
    state = null;
  } else {
    state = {
      maxNo: water.maxNo ?? null,
      maxVpos: water.maxVpos ?? null,
      minNo: water.minNo ?? null,
      minVpos: water.minVpos ?? null,
      complete,
      comments: r.comments,
      uids: r.uids,
      runs: (p && Number(p.runs)) ? Number(p.runs) + 1 : 1
    };
  }

  return { ok: true, reason: stopReason, entry, state };
}

/**
 * 同時実行数に上限を付けて配信を処理する。
 * ★サーキットブレーカ: `rate_limited` を 1 件でも見たら、残りは叩かずに飛ばす。
 * ★締め切りを過ぎたら未着手は飛ばす(その時点の結果を必ず返す)。
 * @param {any[]} lives
 * @param {Record<string, any>} stateIn 前回の state.byLive(lv 小文字キー)。無ければ {}。
 */
async function runAll(lives, stateIn) {
  const prevState = stateIn && typeof stateIn === 'object' ? stateIn : {};
  /** @type {Record<string, any>} */
  const byLive = {};
  /** @type {Record<string, any>} 次 run 用の作業状態。 */
  const stateByLive = {};
  /** @type {Record<string, number>} */
  const reasons = {};
  let okN = 0;
  let ng = 0;
  let skipped = 0;
  let incremental = 0;
  let dug = 0;
  let rateLimited = false;
  let cursor = 0;

  const bump = (key) => { reasons[key] = (reasons[key] || 0) + 1; };
  const prevOf = (live) => prevState[String(live && live.liveId || '').toLowerCase()] || null;
  // ★進めなかった配信(skipped/ng)は前回 state を持ち越す(後退させない・設計 §6-5)。
  const carryOver = (live) => {
    const prev = prevOf(live);
    if (prev) stateByLive[String(live.liveId).toLowerCase()] = prev;
  };

  const worker = async () => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= lives.length) return;
      const live = lives[i];
      if (rateLimited) { skipped += 1; bump('skipped_rate_limited'); carryOver(live); continue; }
      if (deadlinePassed()) { skipped += 1; bump('skipped_deadline'); carryOver(live); continue; }
      let out;
      try {
        out = await tallyOne(live, prevOf(live));
      } catch {
        // ★理由は固定語だけ(例外本文に URL が混ざる余地を残さない・上と同じ理屈)。
        out = { ok: false, reason: 'error', entry: null, state: null };
      }
      if (out.ok && out.entry) {
        okN += 1;
        byLive[String(live.liveId)] = out.entry;
        if (out.entry.mode === 'incremental') incremental += 1;
        if (out.entry.dug === true) dug += 1;
        // state: tallyOne が返した作業状態を採用。null(uids 過多)なら書かない=次 run フル。
        if (out.state) stateByLive[String(live.liveId).toLowerCase()] = out.state;
        bump(out.reason);
        if (out.reason === 'rate_limited') rateLimited = true;
      } else {
        ng += 1;
        bump(out.reason);
        carryOver(live); // ★集計できなくても前回の続きは失わない。
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, lives.length || 1) }, worker));
  return { byLive, stateByLive, reasons, okN, ng, skipped, incremental, dug };
}

/** @returns {Promise<any[]>} 保存済みの放送中一覧。読めなければ空。 */
async function loadLives() {
  const res = await fetch(API_BASE, {
    headers: { accept: 'application/json', 'user-agent': UA },
    signal: AbortSignal.any([runAbort.signal, AbortSignal.timeout(30_000)]),
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(`GET ${res.status}`);
  const data = await res.json();
  const lives = data && Array.isArray(data.lives) ? data.lives : [];
  return lives;
}

/**
 * 前回の増分集計の作業状態(高水位・全員名簿)を読む。
 * ★x-share-key で API 経由(Actions に Upstash 資格情報を置かない・決定事項 F)。
 * ★鍵が無い/非 200/parse 失敗は `null`=全配信フル(安全側に倒す・後退はしても壊れない)。
 * @returns {Promise<Record<string, any>>} `byLive`(lv 小文字キー→前回 entry)。読めなければ {}。
 */
async function loadState() {
  const key = process.env.STATUS_INGEST_KEY || '';
  if (!key) return {};
  try {
    const res = await fetch(`${API_BASE}?state=comments`, {
      headers: { accept: 'application/json', 'x-share-key': key, 'user-agent': UA },
      signal: AbortSignal.any([runAbort.signal, AbortSignal.timeout(30_000)]),
      cache: 'no-store'
    });
    if (!res.ok) return {};
    const data = await res.json();
    const st = data && data.state && typeof data.state === 'object' ? data.state : null;
    const byLive = st && st.byLive && typeof st.byLive === 'object' ? st.byLive : null;
    return byLive || {};
  } catch {
    return {};
  }
}

/**
 * state 全体のバイト数が上限を超えたら、uids の多い配信から uids を落とす(設計 §4-3e)。
 * ★落とした配信は次 run フル(cap で守られる)。POST body 全体は別途 4.5MB 制約(未変更)。
 * @param {Record<string, any>} stateByLive
 * @returns {{ byLive: Record<string, any>, trimmed: number }}
 */
function trimStateBytes(stateByLive) {
  const byLive = stateByLive && typeof stateByLive === 'object' ? stateByLive : {};
  const size = () => JSON.stringify({ byLive }).length;
  let trimmed = 0;
  // uids 人数の多い配信から uids を丸ごと外す(=その配信は state 無し=次 run フル)。
  while (size() > STATE_MAX_BYTES) {
    let victim = null;
    let victimN = -1;
    for (const [lv, v] of Object.entries(byLive)) {
      const n = v && v.uids && typeof v.uids === 'object' ? Object.keys(v.uids).length : 0;
      if (n > victimN) { victimN = n; victim = lv; }
    }
    if (!victim) break;
    delete byLive[victim];
    trimmed += 1;
  }
  return { byLive, trimmed };
}

async function main() {
  /** @type {any[]} */
  let lives = [];
  try {
    lives = await loadLives();
  } catch (e) {
    console.log(`::error::一覧を読めませんでした: ${String(e && e.message ? e.message : e)}`);
    process.exitCode = 1;
    return;
  }
  if (ONLY_LV) lives = lives.filter((l) => String(l && l.liveId || '').toLowerCase() === ONLY_LV);
  if (LIMIT > 0) lives = lives.slice(0, LIMIT);

  // ★前回の作業状態を読む(鍵なし/失敗は {} = 全配信フル)。
  const stateIn = await loadState();

  const { byLive, stateByLive, reasons, okN, ng, skipped, incremental, dug } = await runAll(lives, stateIn);
  clearTimeout(deadlineTimer);

  // ★state の総バイトが上限を超えたら uids の多い配信から uids を落とす。
  const { byLive: stateByLiveTrimmed, trimmed: stateTrimmed } = trimStateBytes(stateByLive);

  const runMs = Date.now() - runStartedAt;
  let segments = 0;
  let bytes = 0;
  for (const v of Object.values(byLive)) {
    segments += Number(/** @type {any} */ (v).segments) || 0;
    bytes += Number(/** @type {any} */ (v).bytes) || 0;
  }

  const payload = {
    ok: true,
    at: Date.now(),
    runMs,
    lives: lives.length,
    ok_n: okN,
    ng,
    skipped,
    reasons,
    byLive,
    state: { byLive: stateByLiveTrimmed }
  };

  // ★stdout の 1 行 JSON(Actions のログで読む唯一の記録)。★URL・トークンは含めない。
  console.log(JSON.stringify({
    kind: 'comment-tally',
    at: payload.at,
    lives: lives.length,
    ok: okN,
    ng,
    skipped,
    incremental,
    dug,
    stateLives: Object.keys(stateByLiveTrimmed).length,
    stateTrimmed,
    segments,
    bytes,
    ms: runMs,
    deadlineHit: deadlinePassed(),
    reasons
  }));

  const partials = Object.values(byLive).filter((v) => /** @type {any} */ (v).partial).length;
  if (ng > 0) console.log(`::warning::${ng} 配信で集計できませんでした(理由は上の JSON の reasons)`);
  if (partials > 0) console.log(`::warning::${partials} 配信は上限に当たり「直近ぶんの集計」です`);
  if (skipped > 0) console.log(`::warning::${skipped} 配信を飛ばしました(締め切り/連続失敗の回避)`);

  if (DRY_RUN) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (okN === 0 && lives.length >= 1) {
    console.log('::error::1 配信も集計できませんでした(保存しません)');
    process.exitCode = 1;
    return;
  }

  const key = process.env.STATUS_INGEST_KEY || '';
  if (!key) {
    console.log('::error::STATUS_INGEST_KEY がありません');
    process.exitCode = 1;
    return;
  }
  let res;
  try {
    res = await fetch(`${API_BASE}?ingest=comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-share-key': key, 'user-agent': UA },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000)
    });
  } catch (e) {
    console.log(`::error::POST に失敗しました: ${String(e && e.message ? e.message : e)}`);
    process.exitCode = 1;
    return;
  }
  const text = await res.text();
  console.log(`POST HTTP ${res.status} ${text.slice(0, 300)}`);
  if (res.status !== 200 || !text.includes('"stored":true')) {
    console.log(`::error::保存されませんでした (HTTP ${res.status})`);
    process.exitCode = 1;
  }
}

await main();
