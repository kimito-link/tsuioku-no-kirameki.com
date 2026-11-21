// @ts-nocheck
/**
 * イベント💎ランキングの「公式更新以降 +X」「推定イベントpt」用のサーバ側スナップショット（2026-11-21）。
 *
 *   GET /api/event-ranking?key=<audition key>  拡張が読む（そのイベントを控え対象に登録もする）
 *   GET /api/event-ranking?refresh=1           5分おきの収集（GitHub Actions が叩く・鍵なし・サーバ側で間引き）
 *
 * ■ 設計（api/live-ranking.js と同じ流儀・npm 依存ゼロ・fetch と Upstash REST だけ）
 *   - 純関数は src/server/eventRankingSnapshot.js（テストあり）。ここは I/O だけ。
 *   - ★鍵（secret）を新しく要求しない。refresh は誰が叩いても「前回から4分未満なら何もしない」+
 *     Redis の SET NX ロックで1本だけ走る＝ニコニコへの負荷は人数に関係なく一定。
 *     既存の STATUS_INGEST_KEY（集計用の鍵）は使わない・触らない。
 *   - ニコニコへのアクセス: 1回の収集で「イベント数 × rankings のページ数（紅白は2）」+
 *     公式ブログは30分に1回だけ。User-Agent で名乗る。
 *   - 置き場所は Upstash（既存の KV_REST_API_URL / KV_REST_API_TOKEN をそのまま使う）。
 *     キーは全部 `evr:` で始まる（既存の live:* / status:* と混ぜない）。TTL 付きで自然に消える。
 */
import {
  EVENT_KEY_RE,
  MAX_RANKING_PAGES,
  pickRankingRows,
  jstHourBucket,
  appendSnapshotToBucket,
  nearestSnapshot,
  parseOfficialCutoff,
  parseOfficialEventRankingHtml,
  filterOfficialRowsForEvent,
  mergeBaselines,
  buildPublicPayload
} from '../src/server/eventRankingSnapshot.js';

const UA = 'tsuioku-no-kirameki-event-snapshot/1.0 (+https://app.tsuioku-no-kirameki.com/)';
const CAPI = 'https://audition.nicovideo.jp/capi/v1';
const KEYS_KEY = 'evr:keys';
const LOCK_KEY = 'evr:refresh-lock';
const LAST_REFRESH_KEY = 'evr:last-refresh-at';
/** 収集の最短間隔（cron は5分。誰かが叩きすぎても4分未満は収集しない）。 */
const MIN_REFRESH_MS = 4 * 60 * 1000;
const LOCK_TTL_SECONDS = 120;
/** 控えるイベントの上限（勝手に増やされても負荷が青天井にならない）。 */
const MAX_KEYS = 12;
/** 公式ブログを読み直す間隔。 */
const OFFICIAL_REFETCH_MS = 30 * 60 * 1000;
/** 公式ブログの「イベントランキング」ページ探し（詳細ページのリンクを辿る）をやり直す間隔。 */
const OFFICIAL_DISCOVER_MS = 6 * 60 * 60 * 1000;
const BUCKET_TTL_SECONDS = 50 * 3600;
const ANCHOR_TTL_SECONDS = 3 * 86400;
const BASELINE_TTL_SECONDS = 40 * 86400;
/** 拡張から 3 日読まれていない/投票終了から 36 時間たったイベントは控えをやめる。 */
const KEY_IDLE_MS = 3 * 86400 * 1000;
const KEY_AFTER_END_MS = 36 * 3600 * 1000;
const FETCH_TIMEOUT_MS = 8000;

async function upstash(command) {
  const base = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!base || !token) throw new Error('KV env missing');
  const res = await fetch(base, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command)
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  const json = await res.json();
  return json?.result;
}

async function getJson(key) {
  const v = await upstash(['GET', key]);
  if (typeof v !== 'string' || !v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

async function setJson(key, value, ttlSeconds) {
  const cmd = ['SET', key, JSON.stringify(value)];
  if (ttlSeconds) cmd.push('EX', String(ttlSeconds));
  await upstash(cmd);
}

async function fetchNico(url, kind) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: kind === 'json' ? 'application/json' : 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!res.ok) return null;
    return kind === 'json' ? await res.json() : await res.text();
  } catch {
    return null;
  }
}

/** capi で key が実在するか確かめ、詳細 URL と投票期間を返す。 */
async function fetchAuditionInfo(key) {
  const j = await fetchNico(`${CAPI}/auditions/${encodeURIComponent(key)}`, 'json');
  const d = j && j.data && typeof j.data === 'object' ? j.data : null;
  if (!d || String(d.key || '') !== key) return null;
  const detailUrl = /^https:\/\/blog\.nicovideo\.jp\/niconews\/\d{1,8}\/?$/.test(String(d.detail_url || ''))
    ? String(d.detail_url)
    : '';
  const end = Date.parse(String(d.voting_end_at || ''));
  return {
    title: String(d.title || '').slice(0, 120),
    detailUrl,
    votingEndAt: Number.isFinite(end) ? end : 0
  };
}

async function registerKey(key, now) {
  const keys = (await getJson(KEYS_KEY)) || {};
  if (keys[key]) {
    // 読まれた時刻だけ更新（毎回書かない: 10分に1回で十分）
    if (now - (Number(keys[key].lastReqAt) || 0) > 10 * 60 * 1000) {
      keys[key].lastReqAt = now;
      await setJson(KEYS_KEY, keys);
    }
    return true;
  }
  if (Object.keys(keys).length >= MAX_KEYS) return false;
  const info = await fetchAuditionInfo(key);
  if (!info) return false;
  if (info.votingEndAt && now - info.votingEndAt > KEY_AFTER_END_MS) return false;
  keys[key] = { addedAt: now, lastReqAt: now, ...info };
  await setJson(KEYS_KEY, keys);
  return true;
}

async function snapshotRankings(key) {
  /** @type {Record<string, number>} */
  const scores = {};
  let total = 0;
  for (let page = 1; page <= MAX_RANKING_PAGES; page++) {
    const j = await fetchNico(
      `${CAPI}/auditions/${encodeURIComponent(key)}/rankings?limit=100&page=${page}`,
      'json'
    );
    const picked = pickRankingRows(j);
    if (!picked) return null; // 途中で欠けたら保存しない（欠けた全体で差分を作らない）
    total = picked.totalCount;
    for (const r of picked.rows) scores[r.id] = r.score;
    if (picked.rows.length < 100 || Object.keys(scores).length >= total) break;
  }
  return Object.keys(scores).length > 0 ? { scores, total } : null;
}

/** 詳細ページのリンクから「イベントランキング」ページを探す（数本だけ・6時間に1回）。 */
async function discoverOfficialUrl(detailUrl) {
  if (!detailUrl) return '';
  const html = await fetchNico(detailUrl, 'text');
  if (!html) return '';
  const self = detailUrl.replace(/\/$/, '');
  const links = [...new Set((html.match(/https:\/\/blog\.nicovideo\.jp\/niconews\/\d{1,8}/g) || []))]
    .filter((u) => u !== self)
    .slice(0, 8);
  for (const u of links) {
    const page = await fetchNico(u, 'text');
    if (!page) continue;
    const title = (/<title>([^<]{0,300})<\/title>/.exec(page) || [])[1] || '';
    if (!/イベントランキング/.test(title)) continue;
    if (parseOfficialEventRankingHtml(page)) return u;
  }
  return '';
}

async function refreshOfficial(key, info, now, participantScores) {
  const okey = `evr:${key}:official`;
  const prev = await getJson(okey);
  if (prev && now - (Number(prev.checkedAt) || 0) < OFFICIAL_REFETCH_MS) return;
  let url = prev?.url || '';
  if (!url && now - (Number(prev?.discoveredAt) || 0) >= OFFICIAL_DISCOVER_MS) {
    url = await discoverOfficialUrl(info.detailUrl);
    if (!url) {
      await setJson(okey, { ...(prev || {}), url: '', discoveredAt: now, checkedAt: now }, ANCHOR_TTL_SECONDS);
      return;
    }
  }
  if (!url) return;
  const html = await fetchNico(url, 'text');
  const parsed = parseOfficialEventRankingHtml(html);
  if (!parsed) {
    await setJson(okey, { ...(prev || {}), url, checkedAt: now }, ANCHOR_TTL_SECONDS);
    return;
  }
  const rows = filterOfficialRowsForEvent(parsed.rows, participantScores);
  const cutoffAt = parseOfficialCutoff(parsed.note, now) || 0;
  const next = { url, discoveredAt: prev?.discoveredAt || now, checkedAt: now, fetchedAt: now, note: parsed.note, cutoffAt, rows };
  await setJson(okey, next, ANCHOR_TTL_SECONDS);

  // 締め時刻が新しくなったら、そのごろのスナップショットを起点にして「足された定数」を更新する。
  const anchorKey = `evr:${key}:anchor`;
  const prevAnchor = await getJson(anchorKey);
  if (!cutoffAt || (prevAnchor && Number(prevAnchor.cutoffAt) === cutoffAt)) return;
  const buckets = [];
  for (const dh of [-1, 0, 1]) {
    const b = await getJson(`evr:${key}:h:${jstHourBucket(cutoffAt + dh * 3600 * 1000)}`);
    if (b) buckets.push(b);
  }
  // EVENT_ANCHOR_MAX_GAP_MS: 検証用の上書き（未設定なら 15 分）。本番では設定しない。
  const gapEnv = Number(process.env.EVENT_ANCHOR_MAX_GAP_MS);
  const snap = nearestSnapshot(buckets, cutoffAt, Number.isFinite(gapEnv) && gapEnv > 0 ? gapEnv : undefined);
  if (!snap) return; // 締め時刻ごろに控えが無い＝起点なし（推定しない）
  await setJson(anchorKey, { cutoffAt, t: snap.t, s: snap.s }, ANCHOR_TTL_SECONDS);
  if (rows.length > 0) {
    const bkey = `evr:${key}:baselines`;
    const prevB = await getJson(bkey);
    await setJson(bkey, mergeBaselines(prevB, snap, rows, cutoffAt), BASELINE_TTL_SECONDS);
  }
}

async function runRefresh(now) {
  const last = Number(await upstash(['GET', LAST_REFRESH_KEY])) || 0;
  if (now - last < MIN_REFRESH_MS) return { throttled: true, lastRefreshAt: last };
  const got = await upstash(['SET', LOCK_KEY, String(now), 'NX', 'EX', String(LOCK_TTL_SECONDS)]);
  if (got !== 'OK') return { throttled: true, locked: true };
  try {
    await upstash(['SET', LAST_REFRESH_KEY, String(now), 'EX', String(86400)]);
    const keys = (await getJson(KEYS_KEY)) || {};
    const results = {};
    let dirty = false;
    for (const [key, info] of Object.entries(keys)) {
      const idle = now - (Number(info.lastReqAt) || 0) > KEY_IDLE_MS;
      const ended = info.votingEndAt && now - info.votingEndAt > KEY_AFTER_END_MS;
      if (!EVENT_KEY_RE.test(key) || idle || ended) {
        delete keys[key];
        dirty = true;
        results[key] = 'dropped';
        continue;
      }
      if (info.votingEndAt && now > info.votingEndAt + 3600 * 1000) {
        results[key] = 'ended';
        continue;
      }
      const snap = await snapshotRankings(key);
      if (!snap) {
        results[key] = 'fetch-failed';
        continue;
      }
      const bkey = `evr:${key}:h:${jstHourBucket(now)}`;
      const bucket = appendSnapshotToBucket(await getJson(bkey), now, snap.scores);
      await setJson(bkey, bucket, BUCKET_TTL_SECONDS);
      await setJson(`evr:${key}:meta`, { lastSnapAt: now, total: snap.total }, BUCKET_TTL_SECONDS);
      try {
        await refreshOfficial(key, info, now, snap.scores);
      } catch {
        /* 公式ブログが読めなくてもスナップショットは残す */
      }
      results[key] = `ok:${Object.keys(snap.scores).length}`;
    }
    if (dirty) await setJson(KEYS_KEY, keys);
    return { stored: true, results };
  } finally {
    try {
      await upstash(['DEL', LOCK_KEY]);
    } catch {
      /* TTL で外れる */
    }
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method' });
    return;
  }
  const now = Date.now();
  try {
    if (String(req.query?.refresh || '') === '1') {
      const r = await runRefresh(now);
      res.status(200).json({ ok: true, ...r });
      return;
    }
    const key = String(req.query?.key || '').trim();
    if (!EVENT_KEY_RE.test(key)) {
      res.status(400).json({ ok: false, error: 'bad key' });
      return;
    }
    const watched = await registerKey(key, now);
    const [meta, official, anchor, baselines] = await Promise.all([
      getJson(`evr:${key}:meta`),
      getJson(`evr:${key}:official`),
      getJson(`evr:${key}:anchor`),
      getJson(`evr:${key}:baselines`)
    ]);
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).json({
      ...buildPublicPayload({
        key,
        lastSnapAt: meta?.lastSnapAt,
        official: official && official.note ? official : null,
        anchor,
        baselines
      }),
      watched
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message ? e.message : e).slice(0, 120) });
  }
}
