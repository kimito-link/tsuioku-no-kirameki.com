// @ts-nocheck
/**
 * /api/live-recent-comments — `/live/` の「コメントで応援した人」にホバーしたとき、
 *   その番組の上位コメント投稿者の【直近の発言(最大 5 件)】をその場で NDGR から浅く取って返す。
 *
 * ■ 何をするか / 何をしないか(2026-09-15・設計 §機能B)
 *   - する: watch HTML → 視聴セッション握手(viewUri)→ NDGR を浅く遡り、対象 uid の直近 5 件を集める。
 *   - しない: 本文を Redis / ディスクに保存しない。取れた本文はサーバのメモリに最長 60 秒だけ持ち、
 *     その後は破棄する。viewUri / webSocketUrl / audience_token / HLS はログにも応答にも一切出さない。
 *
 * ■ なぜ POST か
 *   Vercel のアクセスログは URL(クエリ含む)を残すため、`?uid=` だと「誰を見たか」が platform 側に
 *   残る。body はアクセスログに乗らない。同一オリジン(vercel.json の rewrite は api/ 除外)なので
 *   preflight は発生しない。
 *
 * ■ npm 依存ゼロ(Node 標準のみ)。純ロジックは src/lib、I/O 係は src/server から import する。
 *   ★global WebSocket は Node 22 から。無ければ 501 を返す(フォールバック)。
 *
 * @module api/live-recent-comments
 */

import { upstash } from './live-ranking.js';
import { fetchViewUri, fetchWatchHtml } from '../src/server/nicoliveGuest.js';
import { extractEmbeddedData } from '../src/lib/nicoliveRankingPick.js';
import { pickWsUrlFromEmbeddedData, pickProgramBeginAt } from '../src/lib/embeddedDataExtract.js';
import { crawlNdgrBackward } from '../src/lib/ndgrBackfillCrawl.js';
import { ndgrChatsToMergeRows } from '../src/lib/ndgrChatRows.js';
import { formatRecentTexts, RECENT_TEXT_KEEP } from '../src/lib/recentTextRing.js';

/** 表示済みの集計(=対象 uid 集合の出どころ)。live-ranking.js の COMMENTS_KEY と同じ鍵。 */
const COMMENTS_KEY = 'live:comments:latest';
/** 番組ごとに握手を 1 本へ絞るロック。crawl 上限 4s + 握手 + HTML < 10s。 */
const RECENT_LOCK_PREFIX = 'live:recent-lock:';
const RECENT_LOCK_TTL_SECONDS = 10;
/** サーバ側メモリキャッシュの寿命。握手を 1 番組 60 秒に 1 回へ(privacy §14 の文と一致)。 */
const RECENT_CACHE_TTL_MS = 60_000;
/** メモリに残す番組数の上限(温かいインスタンス内だけ・古い順に落とす)。 */
const RECENT_CACHE_MAX_LIVES = 50;
/** 対象 uid 数の上限(rankers ≤10 + 要求 uid)。 */
const RECENT_TARGET_UIDS_MAX = 10;
/** カード 1 件あたりの表示文字数(320px 幅で 2 行入る)。 */
const RECENT_TEXT_MAX_CHARS = 80;
/** 浅い取得の上限(6 区画 0.6 秒=実測の 2 倍を区画に、Vercel 既定 10s から HTML/WS を引いた範囲)。 */
const RECENT_CRAWL_CAPS = Object.freeze({ elapsedMs: 4000, segments: 12, bytes: 2_000_000, rows: 20_000 });
/** 巡回の fetch 間隔(ms)。tally と同じ。 */
const RECENT_FETCH_GAP_MS = 30;
/** watch HTML / WS 握手の 1 リクエスト上限(合計 < 10s)。 */
const RECENT_HTTP_TIMEOUT_MS = 2500;
const RECENT_WS_TIMEOUT_MS = 2500;
/** ★連絡先を名乗る(tally と同じ)。 */
const RECENT_UA = 'tsuioku-no-kirameki.com live-ranking (admin@kimito-link.com)';

/** 「最後まで遡れた」とみなす終了理由。これ以外は partial(直近ぶん)。 */
const COMPLETE_STOP_REASONS = new Set(['reached_start', 'backward_exhausted']);

/**
 * サーバ(温かいインスタンス)のメモリキャッシュ。番組 → { at, byUid, partial }。
 * ★モジュールスコープ=このインスタンスが生きている間だけ。Redis には本文を SET しない。
 * @type {Map<string, { at: number, byUid: Record<string, string[]>, partial: boolean }>}
 */
const recentByLive = new Map();

/** 期限切れ・溢れたぶんを掃く。 */
function pruneCache(now) {
  for (const [lv, v] of recentByLive) {
    if (now - v.at >= RECENT_CACHE_TTL_MS) recentByLive.delete(lv);
  }
  while (recentByLive.size > RECENT_CACHE_MAX_LIVES) {
    const oldest = recentByLive.keys().next().value;
    if (oldest === undefined) break;
    recentByLive.delete(oldest);
  }
}

/** 巡回の fetch(素の GET・credentials なし)。 */
async function fetchBinary(url, o) {
  const signals = [o?.signal, AbortSignal.timeout(RECENT_HTTP_TIMEOUT_MS)].filter(Boolean);
  const res = await fetch(url, {
    signal: AbortSignal.any(signals),
    headers: { 'user-agent': RECENT_UA },
    redirect: 'follow'
  });
  return { ok: res.ok, status: res.status, bytes: new Uint8Array(await res.arrayBuffer()) };
}

/**
 * 保存済み集計(COMMENTS_KEY)から、その番組の対象 uid 集合を作る。
 * @param {string} lv
 * @param {string} wantUid 要求された uid(必ず含める)。
 * @returns {Promise<Set<string>>}
 */
async function targetUidsFor(lv, wantUid) {
  const set = new Set();
  if (wantUid) set.add(wantUid);
  try {
    const raw = await upstash(['GET', COMMENTS_KEY]);
    const stored = raw ? JSON.parse(raw) : null;
    const byLive = stored && stored.byLive && typeof stored.byLive === 'object' ? stored.byLive : null;
    const entry = byLive && Object.prototype.hasOwnProperty.call(byLive, lv) ? byLive[lv] : null;
    const rankers = entry && Array.isArray(entry.rankers) ? entry.rankers : [];
    for (const r of rankers) {
      if (set.size >= RECENT_TARGET_UIDS_MAX) break;
      const u = r && typeof r === 'object' ? String(r.uid || '').trim() : '';
      if (u) set.add(u);
    }
  } catch {
    // 集計が読めなくても要求 uid だけで進める(found:0 でも 200)。
  }
  return set;
}

/**
 * 巡回して、対象 uid ごとの直近発言(新しい順)を集める。
 * ★行は新→古の順で来る(区画は新→古・crawl の設計)。各 uid が keep 件たまったら止める。
 * @param {string} viewUri
 * @param {number|null} programStartSec
 * @param {Set<string>} targets
 * @returns {Promise<{ byUid: Record<string, string[]>, partial: boolean }>}
 */
async function crawlRecent(viewUri, programStartSec, targets) {
  /** @type {Record<string, string[]>} 新しい順に貯める。 */
  const byUid = {};
  for (const u of targets) byUid[u] = [];
  const reached = () => {
    for (const u of targets) if (byUid[u].length < RECENT_TEXT_KEEP) return false;
    return true;
  };

  const gen = crawlNdgrBackward({
    viewBase: viewUri,
    fetchBinary,
    programStartSec: programStartSec || null,
    fetchGapMs: RECENT_FETCH_GAP_MS,
    caps: { ...RECENT_CRAWL_CAPS }
  });

  let complete = false;
  let stopReason = '';
  try {
    for (;;) {
      const n = await gen.next();
      if (n.done) {
        const v = n.value || {};
        stopReason = String(v.stopReason || '');
        break;
      }
      const v = n.value || {};
      if (Array.isArray(v.chats) && v.chats.length) {
        const rows = ndgrChatsToMergeRows(v.chats);
        // 区画内は新→古で並んでいる前提。対象 uid の行だけを到着順(=新しい順)に足す。
        for (const row of rows) {
          const uid = row && row.userId ? String(row.userId).trim() : '';
          if (!uid || !(uid in byUid)) continue;
          if (byUid[uid].length >= RECENT_TEXT_KEEP) continue;
          const t = String(row.text || '').replace(/\s+/g, ' ').trim();
          if (!t) continue;
          // 直前と同一本文は畳む(連投で枠を埋めない)。
          if (byUid[uid][byUid[uid].length - 1] === t) continue;
          byUid[uid].push(t);
        }
      }
      if (reached()) {
        try { await gen.return(undefined); } catch { /* lib に finally は無い */ }
        complete = true;
        break;
      }
    }
  } catch {
    // 壊れた 1 本で全体を落とさない。その時点までの結果を使う。★例外本文は載せない。
    stopReason = 'crawl_error';
  }

  // 全員 keep 件たまった=complete、または最後まで遡れた=complete。それ以外は partial。
  if (!complete && COMPLETE_STOP_REASONS.has(stopReason)) complete = true;
  return { byUid, partial: !complete };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'method not allowed' });
      return;
    }
    const body = (req.body && typeof req.body === 'object')
      ? req.body
      : (typeof req.body === 'string' && req.body ? safeParse(req.body) : null);
    const lv = String((body && body.lv) || '').trim().toLowerCase();
    const wantUid = String((body && body.uid) || '').trim();
    if (!/^lv\d{6,15}$/i.test(lv) || wantUid.length > 64) {
      res.status(400).json({ ok: false, error: 'bad_request' });
      return;
    }

    const now = Date.now();
    pruneCache(now);

    // (1) メモリキャッシュ hit(温かいインスタンス内・60 秒)。
    const cached = recentByLive.get(lv);
    if (cached && now - cached.at < RECENT_CACHE_TTL_MS) {
      res.status(200).json({ ok: true, lv, byUid: shape(cached.byUid), partial: cached.partial, cached: true });
      return;
    }

    // (2) WebSocket が無い環境(Node 22 未満)は 501(無言にしない)。
    if (typeof WebSocket !== 'function') {
      res.status(501).json({ ok: false, error: 'ws_unavailable' });
      return;
    }

    // (3) 番組ごとに握手を 1 本へ絞る。取れなければ 202(少し待って再試行してもらう)。
    const lockKey = RECENT_LOCK_PREFIX + lv;
    let locked = null;
    try {
      locked = await upstash(['SET', lockKey, String(now), 'NX', 'EX', String(RECENT_LOCK_TTL_SECONDS)]);
    } catch {
      locked = null;
    }
    if (locked !== 'OK') {
      res.status(202).json({ ok: false, inFlight: true });
      return;
    }

    try {
      const targets = await targetUidsFor(lv, wantUid);
      const html = await fetchWatchHtml(lv, { timeoutMs: RECENT_HTTP_TIMEOUT_MS, ua: RECENT_UA });
      if (!html) {
        res.status(502).json({ ok: false, error: 'upstream' });
        return;
      }
      const props = extractEmbeddedData(html);
      const wsUrl = props ? pickWsUrlFromEmbeddedData(props) : '';
      // 終了した番組は wsUrl が空になる(「取れない」と「終わっている」を混ぜない)。
      if (!wsUrl) {
        res.status(410).json({ ok: false, error: 'ended' });
        return;
      }
      const beginMs = props ? pickProgramBeginAt(props) : null;
      const programStartSec = beginMs ? Math.floor(beginMs / 1000) : null;

      const { viewUri, error } = await fetchViewUri(wsUrl, { timeoutMs: RECENT_WS_TIMEOUT_MS });
      if (!viewUri) {
        // ★error 文字列は固定語(URL/token を含まない)。それでも本文には URL を載せない。
        res.status(502).json({ ok: false, error: 'upstream', reason: error || 'no_view_uri' });
        return;
      }

      const { byUid, partial } = await crawlRecent(viewUri, programStartSec, targets);

      // 表示用に整形(各 uid 最大 5 件・各 80 字)。
      /** @type {Record<string, string[]>} */
      const formatted = {};
      for (const [uid, list] of Object.entries(byUid)) {
        formatted[uid] = formatRecentTexts(list, { max: RECENT_TEXT_KEEP, maxChars: RECENT_TEXT_MAX_CHARS });
      }

      recentByLive.set(lv, { at: Date.now(), byUid: formatted, partial });
      pruneCache(Date.now());

      res.status(200).json({ ok: true, lv, byUid: formatted, partial, cached: false });
    } finally {
      try { await upstash(['DEL', lockKey]); } catch { /* TTL で消える */ }
    }
  } catch {
    // ★例外本文に URL/token が混ざる余地を残さない(固定語だけ)。
    res.status(500).json({ ok: false, error: 'server_error' });
  }
}

/** JSON.parse を安全に(壊れていれば null)。 */
function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

/** 応答に載せる byUid を「配列だけ」に整える(想定外の値を混ぜない)。 */
function shape(byUid) {
  const out = {};
  if (byUid && typeof byUid === 'object') {
    for (const [uid, list] of Object.entries(byUid)) {
      out[uid] = Array.isArray(list) ? list.filter((t) => typeof t === 'string') : [];
    }
  }
  return out;
}
