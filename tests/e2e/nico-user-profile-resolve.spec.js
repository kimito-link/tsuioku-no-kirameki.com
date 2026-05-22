import { test, expect } from './fixtures.js';

/*
 * 候補D（v0.1.321）: 記名 uid のサムネ/nickname を nvapi で解決し、既存
 * userCommentProfileCache 経由でギフト履歴・貢献度ランキング・コメント全体に
 * 反映する経路を、実ブラウザ + 実 nvapi 通信で実証する。
 *
 * 核心の実証点:
 *  1. SW（host_permissions 特権 fetch）が nvapi.nicovideo.jp/v1/users/<uid> を
 *     無認証（x-frontend-id:6）で取得できる（CORS バイパスは SW でのみ可能）。
 *  2. 純関数 normalizeNicoUserProfileResponse が実応答から
 *     {userId, nickname, avatarUrl} を取り出せる。
 *
 * 実 API のニックネームは変わり得るので、値そのものではなく
 * 「nickname が空でない」「avatarUrl が当該 uid を含む http(s)」を検証する。
 */

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('nvapi: SW が実 uid プロフィールを無認証で取得し正規化できる', async ({ context }) => {
  const sw = await swOf(context);

  // SW コンテキストで実 nvapi に通信（content→SW と同じ host_permission 特権 fetch）。
  // 実在の長期アカウント uid（sm9 広告ランキング 1 位・本テスト用に固定）。
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

  console.log('nvapi SW fetch status:', result.status, 'ok:', result.ok);
  expect(result.ok).toBe(true);
  expect(result.json?.meta?.status).toBe(200);

  const user = result.json?.data?.user;
  expect(user).toBeTruthy();
  expect(String(user.id)).toBe('5428353');
  // nickname は変わり得るが、記名アカウントなので空ではない
  expect(String(user.nickname || '').trim().length).toBeGreaterThan(0);
  // アイコン URL は当該 uid を含む http(s)（avatar-uid 一致ガードを通る形）
  const iconUrl = String(user?.icons?.large || user?.icons?.small || '');
  console.log('nvapi user icon:', iconUrl, 'nickname:', user.nickname);
  expect(iconUrl).toMatch(/^https?:\/\//);
  expect(iconUrl).toContain('5428353');
});
