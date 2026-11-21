import { afterEach, describe, expect, it } from 'vitest';
import { OFFICIAL_RANKING_URL } from '../lib/kouhaku/constants.js';
import { fetchRankingPage } from './kouhakuOfficialPage.js';

const original = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = original;
});

describe('公式ページへのGET', () => {
  it('User-Agent と If-None-Match を付け、15106 以外へ飛んだら本文を採用しない', async () => {
    /** @type {{ url?: string, headers?: Record<string, string> }} */
    const seen = {};
    globalThis.fetch = (async (url, init) => {
      seen.url = String(url);
      seen.headers = /** @type {Record<string, string>} */ (init?.headers);
      const response = new Response(null, { status: 304, headers: { etag: '"abc"' } });
      Object.defineProperty(response, 'url', { value: OFFICIAL_RANKING_URL });
      return response;
    });

    const result = await fetchRankingPage({
      etag: '"abc"',
      userAgent: 'KouhakuOuen/1.0 (+https://tsuioku-no-kirameki.com/)'
    });
    expect(result).toMatchObject({ ok: true, status: 304, etag: '"abc"' });
    expect(seen.url).toBe(OFFICIAL_RANKING_URL);
    expect(seen.headers?.['If-None-Match']).toBe('"abc"');
    expect(seen.headers?.['User-Agent']).toContain('KouhakuOuen/1.0');
    expect(seen.headers?.['User-Agent']).toContain('https://tsuioku-no-kirameki.com/');
    expect(seen.headers?.['User-Agent']).not.toContain('/about');
  });
});
