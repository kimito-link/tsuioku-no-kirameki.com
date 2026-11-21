/**
 * kouhakuOfficialPage.js — 公式15106へ GET する唯一の場所。
 * ページ描画・OGP・共有ボタンからは import しない。
 */

import { FETCH_TIMEOUT_MS, OFFICIAL_RANKING_URL } from '../lib/kouhaku/constants.js';

/**
 * @typedef {{ ok: true, status: 200, etag: string|null, html: string }
 *   | { ok: true, status: 304, etag: string|null }
 *   | { ok: false, status: number, etag: string|null, error: string }} FetchPageResult
 */

/**
 * @param {{ etag: string|null, userAgent: string, signal?: AbortSignal }} input
 * @returns {Promise<FetchPageResult>}
 */
export async function fetchRankingPage(input) {
  /** @type {Record<string, string>} */
  const headers = {
    Accept: 'text/html,application/xhtml+xml',
    'User-Agent': input.userAgent
  };
  if (input.etag) headers['If-None-Match'] = input.etag;

  const response = await fetch(OFFICIAL_RANKING_URL, {
    method: 'GET',
    headers,
    redirect: 'follow',
    cache: 'no-store',
    signal: input.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });

  const etag = response.headers.get('etag') ?? input.etag;
  if (!response.url.includes('/niconews/15106')) {
    return { ok: false, status: response.status, etag, error: 'unexpected-redirect' };
  }
  if (response.status === 304) return { ok: true, status: 304, etag };
  if (response.status !== 200) {
    return { ok: false, status: response.status, etag, error: `HTTP ${response.status}` };
  }
  const html = await response.text();
  return { ok: true, status: 200, etag, html };
}
