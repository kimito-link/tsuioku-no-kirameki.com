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
 *   node scripts/live-comment-tally.mjs --loop-seconds 390
 *        … ★1 run の中で「新しく増えた分だけ数えて保存」を約 60 秒ごとにくり返す(2026-11-21・
 *          りんくさん「ユーザーがもとめるリアルタイム性だして」)。下の「■ くり返しモード」参照。
 *
 * ■ くり返しモード(--loop-seconds N)
 *   - 1 回目(pass 0)は従来の 1 回きりと同じ: 前回 run の続きから数え、古い側の掘り下げ(フェーズ B)もする。
 *   - 2 回目以降は【新しい側(フェーズ A)だけ】を短い上限で読む＝ニコ生へは新しい区画だけ取りに行く。
 *     古い側の掘り下げは 1 run に 1 回のまま(相手への負荷を今より増やさない)。
 *   - 毎回、保存済みの一覧を読み直し、【まだ数えたことのない配信(新しく一覧に入った配信)から先に】数える。
 *     ★これが「一覧に居るのにコメント集計待ち」(実測 20 配信中 12 配信しか集計が無い)の直し。
 *       原因は、集計が 1 run 1 回で、その間に 60 秒ごとの一覧更新で配信が入れ替わっていたこと。
 *   - 視聴の接続先(viewUri)は【この run のメモリにだけ】持ち回す(ログにも POST にも出さない)。
 *     読めなかった配信は捨てて、次の回に握手からやり直す。
 *   - 表示用の集計は毎回 POST する。作業用の state(高水位・名簿・大きい)は【最後の回だけ】POST する。
 *     途中で落ちても、次の run は前回保存の state から数え直すので件数は二重にならない。
 *   - 新しい回は N 秒を過ぎたら始めない。各回にも締め切りがあり、run 全体にも固い締め切りがある
 *     (= workflow の timeout より必ず先に終わる)。
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
import { mergeDisplay, nextPassDelayMs, orderNewFirst, seedDisplayFromLives, shouldStartPass } from '../src/lib/liveTallyLoop.js';

/** ★連絡先を名乗る(相手が迷惑に思ったとき止められるように)。 */
const UA = 'tsuioku-no-kirameki.com live-ranking (admin@kimito-link.com)';

/** GET 元・POST 先。環境変数で差し替えられる(検証で別環境を指せるように)。 */
const API_BASE = process.env.LIVE_RANKING_API || 'https://app.tsuioku-no-kirameki.com/api/live-ranking';

/** 1 回きり(または くり返しの 1 回目)の締め切り。従来の run 全体の締め切りと同じ値。 */
const FIRST_PASS_DEADLINE_MS = 150_000;
/** くり返しモードの 2 回目以降の 1 回あたりの締め切り(新しい側だけなので短い)。 */
const LATER_PASS_DEADLINE_MS = 45_000;
/** くり返しの間隔(回の開始どうし)。一覧の更新(60 秒の throttle)と同じ。 */
export const PASS_INTERVAL_MS = 60_000;
/** くり返しモードの上限(これより長い指定は切る。workflow の timeout-minutes より十分短く)。 */
const LOOP_MAX_MS = 8 * 60_000;
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
/** くり返しの 2 回目以降の巡回上限(新しい側だけ。前回の続きの区画で止まるのでふつうは 1〜2 区画)。 */
const LATER_CRAWL_CAPS = Object.freeze({ elapsedMs: 10_000, segments: 30, bytes: 2_000_000, rows: 100_000 });
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
const LOOP_MS = Math.min(LOOP_MAX_MS, Math.max(0, Math.floor(Number(argOf('loop-seconds')) || 0) * 1000));
const ONLY_LV = String(argOf('lv') || '').trim().toLowerCase();
const LIMIT = Number(argOf('limit')) || 0;

/**
 * run 全体の固い締め切り。1 回きりは従来どおり 150 秒。くり返しは「最後の回が始まれる上限 +
 * その回の締め切り」。★workflow の timeout-minutes より必ず手前。
 */
const RUN_DEADLINE_MS = LOOP_MS > 0 ? LOOP_MS + FIRST_PASS_DEADLINE_MS : FIRST_PASS_DEADLINE_MS;
/** @type {AbortController} run 全体で共有する締め切り。 */
const runAbort = new AbortController();
const runStartedAt = Date.now();
const deadlineTimer = setTimeout(() => runAbort.abort(), RUN_DEADLINE_MS);
deadlineTimer.unref?.();
/** いまの回の締め切り(run の締め切りとどちらか早い方)。runPass が差し替える。 */
let passSignal = runAbort.signal;
const deadlinePassed = () => passSignal.aborted;
/** いまの回が 1 回目か(古い側の掘り下げは 1 回目だけ)。 */
let isFirstPass = true;
/**
 * ★視聴の接続先(viewUri)を【この run のメモリだけ】に持ち回す(lv → viewUri)。
 *   2 回目以降に watch HTML と WS 握手をやり直さない(相手への負荷を増やさない)。
 *   ★ログ・POST・state には決して載せない。読めなかったら消して次の回に取り直す。
 * @type {Map<string, string>}
 */
const viewUriCache = new Map();

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

  let viewUri = viewUriCache.get(lv) || '';
  if (!viewUri) {
    const html = await fetchWatchHtml(lv, { timeoutMs: HTTP_TIMEOUT_MS, signal: passSignal, ua: UA });
    if (!html) return { ok: false, reason: 'watch_fetch_failed', entry: null, state: null };
    const props = extractEmbeddedData(html);
    if (!props) return { ok: false, reason: 'no_embedded_data', entry: null, state: null };
    const wsUrl = pickWsUrlFromEmbeddedData(/** @type {any} */ (props));
    // ★終了した番組は空文字になる(実測)。「取れない」と「終わっている」を混ぜない。
    if (!wsUrl) return { ok: false, reason: 'no_ws_url', entry: null, state: null };

    const got = await fetchViewUri(wsUrl, { timeoutMs: WS_TIMEOUT_MS });
    if (!got.viewUri) return { ok: false, reason: got.error || 'no_view_uri', entry: null, state: null };
    viewUri = got.viewUri;
    viewUriCache.set(lv, viewUri);
  }

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
  // ★2 回目以降(くり返しモード)は前回の続きがある配信だけ短い上限にする。初めての配信は通常の上限。
  const capsA = (!isFirstPass && p) ? LATER_CRAWL_CAPS : CRAWL_CAPS;
  const genA = crawlNdgrBackward({
    viewBase: viewUri,
    fetchBinary,
    signal: passSignal,
    programStartSec: beginSec,
    fetchGapMs: FETCH_GAP_MS,
    caps: { ...capsA }
  });
  const a = await runCrawlPhase(genA, prevWater, addRows, !!p, p ? (p.maxNo ?? null) : null);
  // ★接続先が使えなかった(壊れた・1 区画も取れない)ら捨てて、次の回に握手からやり直す。
  if (a.stopReason === 'crawl_error' || a.segments === 0) viewUriCache.delete(lv);
  let water = a.water;
  let segments = a.segments;
  let bytes = a.bytes;
  const stopA = a.stopReason;
  let stopB = null;

  // ── フェーズ B(掘り下げ): 前回が未完・A が高水位で止まった・残り時間あり のときだけ。
  // ★古い側の掘り下げは 1 run に 1 回(1 回目)だけ。くり返しで掘り下げの量を増やさない。
  const remainingMs = CRAWL_CAPS.elapsedMs - (Date.now() - t0);
  if (isFirstPass && p && !p.complete && stopA === REACHED_HIGH_WATER && remainingMs > DIG_MIN_REMAINING_MS) {
    const genB = crawlNdgrBackward({
      viewBase: viewUri,
      fetchBinary,
      signal: passSignal,
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
    signal: AbortSignal.any([passSignal, AbortSignal.timeout(30_000)]),
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

/**
 * 1 回ぶん: 一覧を読み直し → 新しい配信から数える → 表示用を合流 → POST。
 * @param {{ stateIn: Record<string, any>, display: Record<string, object>, isLast: () => boolean }} ctx
 * @returns {Promise<{ stored: boolean, fatal: boolean, stateByLive: Record<string, any>, display: Record<string, object> }>}
 */
async function runPass(ctx) {
  const passStartedAt = Date.now();
  /** @type {any[]} */
  let lives = [];
  try {
    lives = await loadLives();
  } catch (e) {
    console.log(`::${isFirstPass ? 'error' : 'warning'}::一覧を読めませんでした: ${String(e && e.message ? e.message : e)}`);
    return { stored: false, fatal: isFirstPass, stateByLive: ctx.stateIn, display: ctx.display };
  }
  if (ONLY_LV) lives = lives.filter((l) => String(l && l.liveId || '').toLowerCase() === ONLY_LV);
  if (LIMIT > 0) lives = lives.slice(0, LIMIT);

  // ★前に数えた結果(前 run の保存分・この run の前の回)を持ち越す。数えられなかった配信を「集計待ち」に戻さない。
  const seeded = { ...seedDisplayFromLives(lives), ...ctx.display };

  const { byLive, stateByLive, reasons, okN, ng, skipped, incremental, dug } = await runAll(orderNewFirst(lives, ctx.stateIn), ctx.stateIn);
  const display = mergeDisplay(seeded, byLive, lives);

  const last = ctx.isLast();
  // ★state の総バイトが上限を超えたら uids の多い配信から uids を落とす。
  const { byLive: stateByLiveTrimmed, trimmed: stateTrimmed } = trimStateBytes(stateByLive);

  const runMs = Date.now() - passStartedAt;
  let segments = 0;
  let bytes = 0;
  for (const v of Object.values(byLive)) {
    segments += Number(/** @type {any} */ (v).segments) || 0;
    bytes += Number(/** @type {any} */ (v).bytes) || 0;
  }

  /** @type {any} */
  const payload = {
    ok: true,
    at: Date.now(),
    runMs,
    lives: lives.length,
    ok_n: okN,
    ng,
    skipped,
    reasons,
    byLive: display
  };
  // ★作業用の state(大きい)は最後の回だけ送る(1 回きりモードは毎回=従来どおり)。
  if (last) payload.state = { byLive: stateByLiveTrimmed };

  // ★stdout の 1 行 JSON(Actions のログで読む唯一の記録)。★URL・トークンは含めない。
  console.log(JSON.stringify({
    kind: 'comment-tally',
    at: payload.at,
    pass: passNo,
    last,
    lives: lives.length,
    shown: Object.keys(display).length,
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
  if (partials > 0 && isFirstPass) console.log(`::warning::${partials} 配信は上限に当たり「直近ぶんの集計」です`);
  if (skipped > 0) console.log(`::warning::${skipped} 配信を飛ばしました(締め切り/連続失敗の回避)`);

  if (DRY_RUN) {
    console.log(JSON.stringify({ ...payload, state: payload.state ? { lives: Object.keys(payload.state.byLive).length } : undefined }, null, 2));
    return { stored: true, fatal: false, stateByLive, display };
  }

  if (okN === 0 && lives.length >= 1) {
    // ★1 回目は従来どおり失敗(赤)。2 回目以降の一時的な失敗は、前の回の保存が生きているので警告だけ。
    console.log(`::${isFirstPass ? 'error' : 'warning'}::1 配信も集計できませんでした(保存しません)`);
    return { stored: false, fatal: isFirstPass, stateByLive: ctx.stateIn, display };
  }

  const key = process.env.STATUS_INGEST_KEY || '';
  if (!key) {
    console.log('::error::STATUS_INGEST_KEY がありません');
    return { stored: false, fatal: true, stateByLive, display };
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
    return { stored: false, fatal: isFirstPass, stateByLive, display };
  }
  const text = await res.text();
  console.log(`POST HTTP ${res.status} ${text.slice(0, 300)}`);
  if (res.status !== 200 || !text.includes('"stored":true')) {
    console.log(`::error::保存されませんでした (HTTP ${res.status})`);
    return { stored: false, fatal: isFirstPass, stateByLive, display };
  }
  return { stored: true, fatal: false, stateByLive, display };
}

let passNo = 0;

async function main() {
  // ★前回の作業状態を読む(鍵なし/失敗は {} = 全配信フル)。
  /** @type {Record<string, any>} */
  let stateIn = await loadState();
  /** @type {Record<string, object>} */
  let display = {};
  let storedAny = false;

  for (;;) {
    const passStartedAt = Date.now();
    const budget = isFirstPass ? FIRST_PASS_DEADLINE_MS : LATER_PASS_DEADLINE_MS;
    const passAbort = AbortSignal.timeout(budget);
    passSignal = AbortSignal.any([runAbort.signal, passAbort]);
    // 「この回が最後か」は回の終わり(POST の直前)に決める: 次の回の予定開始時刻で始められるか。
    // ★最後の回にだけ state を載せるので、ここで「続ける」と決めたら必ず次の回を走らせる(下で再判定しない)。
    //   POST が長引いても(上限 30 秒)、次の回の締め切り 45 秒と合わせて run の固い締め切りの内側に収まる。
    let lastDecision = /** @type {boolean|null} */ (null);
    const isLast = () => {
      if (lastDecision != null) return lastDecision;
      const now = Date.now();
      const nextStart = now + nextPassDelayMs({ nowMs: now, passStartedAtMs: passStartedAt, intervalMs: PASS_INTERVAL_MS });
      lastDecision = LOOP_MS <= 0 || !shouldStartPass({
        nowMs: nextStart,
        startedAtMs: runStartedAt,
        loopMs: LOOP_MS,
        hardDeadlineMs: RUN_DEADLINE_MS,
        passBudgetMs: LATER_PASS_DEADLINE_MS
      });
      return lastDecision;
    };
    const out = await runPass({ stateIn, display, isLast });
    if (out.fatal) { process.exitCode = 1; break; }
    if (out.stored) storedAny = true;
    // ★次の回は今回の作業状態から続ける(メモリ上だけ。保存は最後の回)。
    stateIn = out.stateByLive;
    display = out.display;
    passNo += 1;
    if (isLast()) break;
    const wait = nextPassDelayMs({ nowMs: Date.now(), passStartedAtMs: passStartedAt, intervalMs: PASS_INTERVAL_MS });
    await new Promise((ok) => setTimeout(ok, wait));
    isFirstPass = false;
  }
  clearTimeout(deadlineTimer);
  if (!storedAny && process.exitCode !== 1 && !DRY_RUN) {
    console.log('::error::この run では 1 度も保存できませんでした');
    process.exitCode = 1;
  }
}

await main();
