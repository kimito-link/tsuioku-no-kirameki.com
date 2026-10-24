// @ts-nocheck
/* global process, Buffer -- サーバー(Vercel 関数)専用の部品。api/ と同じく env を読む */
/**
 * v0.1.1756: スマホのリアルタイム化(Ably)の受け口。api/status.js から呼ぶ。
 *   POST /api/status?action=events      PC が新着コメントのまとめ(3秒ごと)を送る → Ably へ渡す(鍵の照合は呼び出し側)。
 *   GET  /api/status?action=realtime&v= スマホに「購読だけ」の許可(1時間)と接続先を渡す。
 *
 *   ★env ABLY_API_KEY が無いときは何もしない(realtime:false を返す)=キーを入れるまで今までと同じ動き。
 *   ★イベントごとの Redis 書き込みはしない(費用・設計書 7章)。使うのは上限の INCR 2つだけ。
 *     二重送信は Ably の「同じ id の発行は1回だけ」(idempotent publish)で捨てる。
 *   決まりごと(形の検査・上限の数)は src/lib/liveEvents.js。
 */

import { utcDay, utcMonth, MONTH_QUOTA_TTL_SECONDS } from '../lib/deviceAuth.js';
import {
  DEFAULT_LIVE_EVENTS_DAILY_LIMIT,
  DEFAULT_LIVE_EVENTS_MONTHLY_LIMIT,
  LIVE_EVENTS_TOKEN_TTL_MS,
  liveEventKeys,
  sanitizeLiveEventsBody
} from '../lib/liveEvents.js';
import { incrWithExpiry, randomToken, sha256Hex } from './deviceStore.js';

/** Ably の REST と SSE の接続先(公式ドキュメントの既定のホスト)。 */
export const ABLY_REST_BASE = 'https://main.realtime.ably.net';
export const ABLY_SSE_BASE = 'https://main.realtime.ably.net/sse';

/** ABLY_API_KEY の形(<アプリID>.<キーID>:<秘密>)。違えば無いものとして扱う。 */
function ablyKey() {
  const k = String(process.env.ABLY_API_KEY || '').trim();
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+:[^\s]+$/.test(k) ? k : '';
}

/** サーバーに Ably のキーが入っているか(=リアルタイム化が使えるか)。 */
export function isRealtimeEnabled() {
  return Boolean(ablyKey());
}

/** 閲覧トークンから、推測できないチャンネル名を作る(トークンそのものは Ably に渡さない)。 */
export function liveChannelName(token) {
  return `nls-live:${sha256Hex(`live:${token}`).slice(0, 40)}`;
}

function basicAuth(key) {
  return `Basic ${Buffer.from(key).toString('base64')}`;
}

/**
 * PC からの新着のまとめを Ably へ渡す。token と quotaId は呼び出し側が鍵の照合で決めたもの。
 * @param {{ token: string, quotaId: string, body: unknown, nowMs: number }} a
 * @returns {Promise<{ code: number, json: Record<string, unknown> }>}
 */
export async function publishLiveEvents(a) {
  const key = ablyKey();
  if (!key) return { code: 200, json: { ok: true, realtime: false } };
  const batch = sanitizeLiveEventsBody(a.body);
  if (!batch) return { code: 400, json: { ok: false, error: 'bad events' } };
  const daily = await incrWithExpiry(liveEventKeys.daily(a.quotaId, utcDay(a.nowMs)), 2 * 24 * 60 * 60);
  if (daily > (Number(process.env.LIVE_EVENTS_DAILY_LIMIT) || DEFAULT_LIVE_EVENTS_DAILY_LIMIT)) {
    return { code: 429, json: { ok: false, error: 'events_quota', realtime: false } };
  }
  const monthly = await incrWithExpiry(liveEventKeys.monthly(utcMonth(a.nowMs)), MONTH_QUOTA_TTL_SECONDS);
  if (monthly > (Number(process.env.LIVE_EVENTS_MONTHLY_LIMIT) || DEFAULT_LIVE_EVENTS_MONTHLY_LIMIT)) {
    return { code: 429, json: { ok: false, error: 'events_month_quota', realtime: false } };
  }
  const channel = liveChannelName(a.token);
  const res = await fetch(`${ABLY_REST_BASE}/channels/${encodeURIComponent(channel)}/messages`, {
    method: 'POST',
    headers: { Authorization: basicAuth(key), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // 同じ sendId の再送は Ably が1回にまとめる(二重に出さない)。
      id: `${a.quotaId === 'shared' ? 's' : 'd'}-${batch.sendId}`,
      name: 'events',
      data: JSON.stringify({ liveId: batch.liveId, events: batch.events, dropped: batch.dropped })
    })
  });
  if (!res.ok) {
    try { console.log(JSON.stringify({ m: 'live-events', outcome: 'ably_failed', status: res.status })); } catch { /* 記録の失敗は無視 */ }
    return { code: 502, json: { ok: false, error: 'ably_failed', realtime: true } };
  }
  return { code: 200, json: { ok: true, realtime: true, sent: batch.events.length } };
}

/**
 * スマホへ「このチャンネルの購読だけ」の許可を出す。キーが無ければ realtime:false(=ポーリングのまま)。
 * @param {string} token 閲覧トークン(形の検査は呼び出し側)
 * @param {number} nowMs
 * @returns {Promise<{ code: number, json: Record<string, unknown> }>}
 */
export async function issueRealtimeToken(token, nowMs) {
  const key = ablyKey();
  if (!key) return { code: 200, json: { ok: true, realtime: false } };
  const keyName = key.slice(0, key.indexOf(':'));
  const channel = liveChannelName(token);
  const res = await fetch(`${ABLY_REST_BASE}/keys/${encodeURIComponent(keyName)}/requestToken`, {
    method: 'POST',
    headers: { Authorization: basicAuth(key), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      keyName,
      ttl: LIVE_EVENTS_TOKEN_TTL_MS,
      capability: JSON.stringify({ [channel]: ['subscribe'] }),
      timestamp: nowMs,
      nonce: randomToken(16)
    })
  });
  if (!res.ok) return { code: 502, json: { ok: false, error: 'ably_failed', realtime: false } };
  let td;
  try {
    td = await res.json();
  } catch {
    td = null;
  }
  const accessToken = td && typeof td.token === 'string' ? td.token : '';
  if (!accessToken) return { code: 502, json: { ok: false, error: 'ably_failed', realtime: false } };
  const sseUrl = `${ABLY_SSE_BASE}?v=1.2&channels=${encodeURIComponent(channel)}&accessToken=${encodeURIComponent(accessToken)}`;
  return { code: 200, json: { ok: true, realtime: true, sseUrl, expires: Number(td.expires) || nowMs + LIVE_EVENTS_TOKEN_TTL_MS } };
}
