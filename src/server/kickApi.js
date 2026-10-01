/**
 * kickApi.js — Kick 公式 API(App Access Token)の I/O だけ(サーバ専用・npm 依存なし)。
 *
 * ■ 2026-10-01 新設(設計 docs/handoff/live-multiplatform-kick-youtube-SPEC.md §4.4)
 *   api/live-platforms.js から呼ぶ。Redis・正規化はここに入れない(正規化は src/lib/kickLivestreams.js)。
 *   ★fetchImpl を注入できる＝テストは実ネットワークへ出ない。
 *
 * ■ 一次情報(docs.kick.com・2026-10-01 確認)
 *   token: POST https://id.kick.com/oauth/token(grant_type=client_credentials, form-urlencoded)
 *   一覧 : GET  https://api.kick.com/public/v2/livestreams(Bearer・language_code・limit 1-1000)
 *   ★レート制限はドキュメントに記載なし → 応答ヘッダに ratelimit らしきものがあれば headersSample で返し、
 *     初回の実測で確かめる(数字を発明しない)。
 *
 * ■ ★token / client_secret はどこにも書き出さない(console・例外文・戻り値の error 文字列)。
 */
import { KICK_TOKEN_URL, KICK_LIVESTREAMS_URL, KICK_LANGUAGE_CODE, KICK_PAGE_LIMIT } from '../lib/kickLivestreams.js';

/** api/live-ranking.js の FETCH_TIMEOUT_MS(8000・export されていない)と同値。 */
const DEFAULT_TIMEOUT_MS = 8000;
/** 既存の収集と同じ名乗り(scripts/live-og-bake.mjs:53 と同文)。 */
const UA = 'tsuioku-no-kirameki.com live-ranking (admin@kimito-link.com)';

/**
 * @param {{ clientId: string, clientSecret: string, fetchImpl?: typeof fetch, timeoutMs?: number }} d
 * @returns {Promise<{ ok: true, token: string, expiresIn: number } | { ok: false, status: number, error: string }>}
 */
export async function fetchKickAppToken(d) {
  const clientId = String(d.clientId || '');
  const clientSecret = String(d.clientSecret || '');
  if (!clientId || !clientSecret) return { ok: false, status: 0, error: 'no credentials' };
  const f = d.fetchImpl || fetch;
  try {
    const r = await f(KICK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': UA },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }).toString(),
      signal: AbortSignal.timeout(d.timeoutMs || DEFAULT_TIMEOUT_MS)
    });
    if (!r.ok) return { ok: false, status: r.status, error: 'token http error' };
    const json = /** @type {any} */ (await r.json());
    const token = json && typeof json.access_token === 'string' ? json.access_token : '';
    if (!token) return { ok: false, status: r.status, error: 'token missing' };
    return { ok: true, token, expiresIn: Number(json.expires_in) || 0 };
  } catch {
    return { ok: false, status: 0, error: 'token fetch failed' };
  }
}

/**
 * レート制限らしきヘッダだけ抜き出す(値の確認用)。無ければ undefined。
 * @param {any} headers
 * @returns {Record<string, string>|undefined}
 */
function rateHeaders(headers) {
  if (!headers || typeof headers.forEach !== 'function') return undefined;
  /** @type {Record<string, string>} */
  const out = {};
  headers.forEach((/** @type {string} */ v, /** @type {string} */ k) => { if (/rate|retry-after/i.test(k)) out[k.toLowerCase()] = String(v); });
  return Object.keys(out).length ? out : undefined;
}

/**
 * @param {{ token: string, languageCode?: string, limit?: number, fetchImpl?: typeof fetch, timeoutMs?: number }} d
 * @returns {Promise<{ ok: boolean, status: number, json: unknown|null, headersSample?: Record<string, string> }>}
 */
export async function fetchKickLivestreams(d) {
  const f = d.fetchImpl || fetch;
  const u = new URL(KICK_LIVESTREAMS_URL);
  u.searchParams.set('language_code', d.languageCode || KICK_LANGUAGE_CODE);
  u.searchParams.set('limit', String(d.limit || KICK_PAGE_LIMIT));
  try {
    const r = await f(u.toString(), {
      headers: { Authorization: `Bearer ${d.token}`, Accept: 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(d.timeoutMs || DEFAULT_TIMEOUT_MS)
    });
    const headersSample = rateHeaders(r.headers);
    if (!r.ok) return { ok: false, status: r.status, json: null, ...(headersSample ? { headersSample } : {}) };
    let json = null;
    try { json = await r.json(); } catch { json = null; }
    return { ok: json != null, status: r.status, json, ...(headersSample ? { headersSample } : {}) };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}
