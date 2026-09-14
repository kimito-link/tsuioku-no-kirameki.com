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
import { createCommentTally } from '../src/lib/liveCommentTally.js';

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

/**
 * watch ページの HTML を取る。取れなければ ''。
 * @param {string} lv
 * @returns {Promise<string>}
 */
async function fetchWatchHtml(lv) {
  try {
    const res = await fetch(`https://live.nicovideo.jp/watch/${lv}`, {
      signal: AbortSignal.any([runAbort.signal, AbortSignal.timeout(HTTP_TIMEOUT_MS)]),
      headers: { 'user-agent': UA },
      redirect: 'follow'
    });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  }
}

/**
 * 視聴セッション WS にゲストで繋ぎ、コメントサーバの場所(view の URL)だけを受け取って切る。
 *
 * ★送るのは startWatching 1 通だけ。`ping` に pong は返さない・`keepSeat` も送らない
 *   (欲しいのは最初の messageServer だけで、席を持ち続ける必要が無い)。
 * ★`stream`(映像)の中身は読まない。
 *
 * @param {string} wsUrl
 * @returns {Promise<{ viewUri: string, error: string }>} viewUri は呼び出し元の外へ出さない
 */
function fetchViewUri(wsUrl) {
  return new Promise((resolve) => {
    let settled = false;
    /** @type {WebSocket|null} */
    let ws = null;
    const finish = (viewUri, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws?.close(1000); } catch { /* 閉じられないなら放置(プロセスは終わる) */ }
      resolve({ viewUri, error });
    };
    const timer = setTimeout(() => finish('', 'ws_timeout'), WS_TIMEOUT_MS);
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      finish('', 'ws_open_failed');
      return;
    }
    ws.addEventListener('open', () => {
      try {
        ws?.send(JSON.stringify({
          type: 'startWatching',
          data: {
            stream: { quality: 'abr', protocol: 'hls', latency: 'low', chasePlay: false },
            room: { protocol: 'webSocket', commentable: true },
            reconnect: false
          }
        }));
      } catch {
        finish('', 'ws_send_failed');
      }
    });
    ws.addEventListener('message', (ev) => {
      let msg = null;
      try { msg = JSON.parse(String(ev.data || '')); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'messageServer') {
        const uri = String(msg?.data?.viewUri || '').trim();
        finish(uri && /^https:\/\//i.test(uri) ? uri : '', uri ? '' : 'no_view_uri');
      } else if (msg.type === 'disconnect') {
        finish('', 'ws_disconnect');
      }
    });
    ws.addEventListener('error', () => finish('', 'ws_error'));
    ws.addEventListener('close', () => finish('', 'ws_closed'));
  });
}

/**
 * 1 配信ぶんを数える。★ここが返す形が、そのまま保存形の `byLive[liveId]` になる。
 * @param {{ liveId: string, beginTime?: unknown, streamer?: { id?: unknown }|null }} live
 * @returns {Promise<{ ok: boolean, reason: string, entry: object|null }>}
 */
async function tallyOne(live) {
  const lv = String(live.liveId || '').trim().toLowerCase();
  if (!/^lv\d{6,15}$/.test(lv)) return { ok: false, reason: 'bad_live_id', entry: null };

  const html = await fetchWatchHtml(lv);
  if (!html) return { ok: false, reason: 'watch_fetch_failed', entry: null };
  const props = extractEmbeddedData(html);
  if (!props) return { ok: false, reason: 'no_embedded_data', entry: null };
  const wsUrl = pickWsUrlFromEmbeddedData(/** @type {any} */ (props));
  // ★終了した番組は空文字になる(実測)。「取れない」と「終わっている」を混ぜない。
  if (!wsUrl) return { ok: false, reason: 'no_ws_url', entry: null };

  const { viewUri, error } = await fetchViewUri(wsUrl);
  if (!viewUri) return { ok: false, reason: error || 'no_view_uri', entry: null };

  const beginSec = Math.floor(Number(live.beginTime) || 0) || null;
  const tally = createCommentTally({ broadcasterUid: live.streamer ? live.streamer.id : '' });
  const gen = crawlNdgrBackward({
    viewBase: viewUri,
    fetchBinary,
    signal: runAbort.signal,
    programStartSec: beginSec,
    fetchGapMs: FETCH_GAP_MS,
    caps: { ...CRAWL_CAPS }
  });

  const t0 = Date.now();
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
      if (Array.isArray(v.chats) && v.chats.length) tally.add(ndgrChatsToMergeRows(v.chats));
    }
  } catch {
    // ★壊れた 1 本で run 全体を落とさない。その時点までの数はそのまま使う。
    // ★例外の本文は載せない。中に URL(token 入り)が混ざる可能性を【構造的に】断つ
    //   (実測では Node の fetch 失敗は "fetch failed" だけだが、それに頼らない)。
    stopReason = 'crawl_error';
  }

  const r = tally.result();
  return {
    ok: true,
    reason: stopReason,
    entry: {
      rankers: r.rankers,
      commenters: r.commenters,
      comments: r.comments,
      anonCommenters: r.anonCommenters,
      stopReason,
      segments,
      bytes,
      ms: Date.now() - t0,
      partial: !COMPLETE_STOP_REASONS.has(stopReason)
    }
  };
}

/**
 * 同時実行数に上限を付けて配信を処理する。
 * ★サーキットブレーカ: `rate_limited` を 1 件でも見たら、残りは叩かずに飛ばす。
 * ★締め切りを過ぎたら未着手は飛ばす(その時点の結果を必ず返す)。
 * @param {any[]} lives
 */
async function runAll(lives) {
  /** @type {Record<string, any>} */
  const byLive = {};
  /** @type {Record<string, number>} */
  const reasons = {};
  let okN = 0;
  let ng = 0;
  let skipped = 0;
  let rateLimited = false;
  let cursor = 0;

  const bump = (key) => { reasons[key] = (reasons[key] || 0) + 1; };

  const worker = async () => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= lives.length) return;
      const live = lives[i];
      if (rateLimited) { skipped += 1; bump('skipped_rate_limited'); continue; }
      if (deadlinePassed()) { skipped += 1; bump('skipped_deadline'); continue; }
      let out;
      try {
        out = await tallyOne(live);
      } catch {
        // ★理由は固定語だけ(例外本文に URL が混ざる余地を残さない・上と同じ理屈)。
        out = { ok: false, reason: 'error', entry: null };
      }
      if (out.ok && out.entry) {
        okN += 1;
        byLive[String(live.liveId)] = out.entry;
        bump(out.reason);
        if (out.reason === 'rate_limited') rateLimited = true;
      } else {
        ng += 1;
        bump(out.reason);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, lives.length || 1) }, worker));
  return { byLive, reasons, okN, ng, skipped };
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

  const { byLive, reasons, okN, ng, skipped } = await runAll(lives);
  clearTimeout(deadlineTimer);

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
    byLive
  };

  // ★stdout の 1 行 JSON(Actions のログで読む唯一の記録)。★URL・トークンは含めない。
  console.log(JSON.stringify({
    kind: 'comment-tally',
    at: payload.at,
    lives: lives.length,
    ok: okN,
    ng,
    skipped,
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
