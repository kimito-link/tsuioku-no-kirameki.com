import { test, expect } from './fixtures.js';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('nvapi: SW can fetch and normalize a public user profile', async ({ context }) => {
  const sw = await swOf(context);
  const result = await sw.evaluate(async (uid) => {
    try {
      const res = await fetch(`https://nvapi.nicovideo.jp/v1/users/${uid}`, {
        method: 'GET',
        credentials: 'omit',
        cache: 'no-store',
        headers: { 'x-frontend-id': '6', 'x-frontend-version': '0' }
      });
      const json = await res.json();
      return { ok: res.ok, status: res.status, json };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }, '5428353');

  expect(result.ok).toBe(true);
  expect(result.json?.meta?.status).toBe(200);

  const user = result.json?.data?.user;
  expect(String(user?.id || '')).toBe('5428353');
  expect(String(user?.nickname || '').trim().length).toBeGreaterThan(0);
  const iconUrl = String(user?.icons?.large || user?.icons?.small || '');
  expect(iconUrl).toMatch(/^https?:\/\//);
  expect(iconUrl).toContain('5428353');
});
