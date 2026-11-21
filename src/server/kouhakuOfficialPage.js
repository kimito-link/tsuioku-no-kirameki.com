/**
 * kouhakuOfficialPage.js — 公式15106へ GET する唯一の場所。
 * ページ描画・OGP・共有ボタンからは import しない。
 */

import { isRegisteredSource } from '../lib/eventRanking/registry.js';
import { FETCH_TIMEOUT_MS, OFFICIAL_RANKING_URL } from '../lib/kouhaku/constants.js';

/**
 * @typedef {{ ok: true, status: 200, etag: string|null, html: string }
 *   | { ok: true, status: 304, etag: string|null }
 *   | { ok: false, status: number, etag: string|null, error: string }} FetchPageResult
 */

/**
 * @param {{ etag: string|null, userAgent: string, sourceUrl?: string, signal?: AbortSignal }} input
 * @returns {Promise<FetchPageResult>}
 */
export async function fetchRankingPage(input) {
  const pageUrl = input.sourceUrl || OFFICIAL_RANKING_URL;
  if (!isRegisteredSource(pageUrl)) {
    return { ok: false, status: 0, etag: input.etag, error: 'source-not-registered' };
  }
  /** @type {Record<string, string>} */
  const headers = {
    Accept: 'text/html,application/xhtml+xml',
    'User-Agent': input.userAgent
  };
  if (input.etag) headers['If-None-Match'] = input.etag;

  const response = await fetch(pageUrl, {
    method: 'GET',
    headers,
    redirect: 'follow',
    cache: 'no-store',
    signal: input.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });

  const etag = response.headers.get('etag') ?? input.etag;
  const finalUrl = String(response.url || pageUrl).split('?')[0];
  if (!isRegisteredSource(finalUrl)) {
    return { ok: false, status: response.status, etag, error: 'unexpected-redirect' };
  }
  if (response.status === 304) return { ok: true, status: 304, etag };
  if (response.status !== 200) {
    return { ok: false, status: response.status, etag, error: `HTTP ${response.status}` };
  }
  const html = await response.text();
  return { ok: true, status: 200, etag, html };
}
