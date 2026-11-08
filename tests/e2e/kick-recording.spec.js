// kick-recording.spec.js — Kick の配信ページを開くと、チャット(ページ自身が使う Pusher)を記録し、サイドパネル側からコメントを送れるか
//   (council/kick-support-PLAN.md・計器で確かめる: りんくに見え方を聞かない)。
//
// 本物の Kick には出ない(CI もクラウドも出られない):
//   - kick.com のページ・/api/v2/channels/<slug> の応答 → Playwright の route で差し替え
//   - ws-us2.pusher.com の WebSocket → Chromium の名前解決を 127.0.0.1 に向け、手元の TLS の WebSocket で Pusher の役をする
//     (twitch-recording.spec.js と同じ作り。イベントの形は Kick のページが受けているものの推定=PC 実測で確かめる)。
import { test as base, chromium, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../../extension');

const SLUG = 'testkick';
const CHATROOM = 77;
const CHANNEL_ID = 55;
const STREAM_ID = '9001';
const KEY = `kk.${SLUG}.${STREAM_ID}`;
const ROOM = `chatrooms.${CHATROOM}.v2`;
const LATE_ICON = 'https://files.kick.com/images/user/1006/profile_image/late.webp';

/** @param {string} event @param {any} data @param {string} [channel] */
const ev = (event, data, channel = ROOM) => JSON.stringify({ event, channel, data: JSON.stringify(data) });
const chat = (id, uid, username, slug, content) =>
  ev('App\\Events\\ChatMessageEvent', { id, chatroom_id: CHATROOM, content, type: 'message', created_at: '2026-11-08T09:59:58+00:00', sender: { id: uid, username, slug, identity: { color: '#00FF00', badges: [] } } });

const FIRST = [
  chat('m-1', 1001, 'ファンA', 'fan-a', 'わこつ [emote:1:KEKW]'),
  ev('App\\Events\\SubscriptionEvent', { chatroom_id: CHATROOM, username: 'NewSub', months: 1 }),
  chat('m-other', 1004, 'Other', 'other', '別の部屋').replace(`"chatroom_id\\":${CHATROOM}`, '"chatroom_id\\":5'),
];
const LATE = [
  ev('KicksGifted', { message: 'がんばれ', sender: { id: 1002, username: 'Kicker' }, gift: { gift_id: 'rage', name: 'Rage Quit', amount: 500 } }, `channel_${CHANNEL_ID}`),
  ev('App\\Events\\GiftedSubscriptionsEvent', { chatroom_id: CHATROOM, gifted_usernames: ['a1', 'b2', 'c3', 'd4', 'e5'], gifter_username: 'Giver', gifter_total: 5 }),
  chat('m-6', 1006, 'LateFan', 'late-fan', 'おそくなりました'),
];

const PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>${SLUG} | Kick</title></head><body>
<div id="chatroom-footer"><div contenteditable="true" id="message-input" data-lexical-editor="true"></div>
<button id="send-message-button">Chat</button></div>
<script>
  window.__sent = [];
  document.getElementById('send-message-button').addEventListener('click', () => {
    const el = document.getElementById('message-input');
    window.__sent.push(el.textContent);
    el.textContent = '';
  });
</script></body></html>`;

/** 手元の TLS の WebSocket(Kick のページが使う Pusher の役)を立てる */
function startFakePusher() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-pusher-'));
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=ws-us2.pusher.com', '-addext', 'subjectAltName=DNS:ws-us2.pusher.com'], { stdio: 'ignore' });
  const server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) });
  const wss = new WebSocketServer({ server });
  /** @type {string[]} */
  const received = [];
  /** @type {string[]} */
  const urls = [];
  wss.on('connection', (ws, req) => {
    urls.push(String(req.url || ''));
    ws.send(JSON.stringify({ event: 'pusher:connection_established', data: JSON.stringify({ socket_id: '1.2', activity_timeout: 120 }) }));
    let sent = false;
    ws.on('message', (data) => {
      const text = String(data);
      received.push(text);
      const m = JSON.parse(text);
      if (m.event === 'pusher:subscribe') {
        ws.send(JSON.stringify({ event: 'pusher_internal:subscription_succeeded', channel: m.data.channel, data: '{}' }));
        if (m.data.channel === ROOM && !sent) {
          sent = true;
          setTimeout(() => FIRST.forEach((f) => ws.send(f)), 300);
          setTimeout(() => LATE.forEach((f) => ws.send(f)), 2500);
        }
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = /** @type {any} */ (server.address()).port;
      const spki = execFileSync('sh', ['-c', `openssl x509 -in '${cert}' -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64`]).toString().trim();
      resolve({ port, spki, received, urls, close: () => new Promise((r) => { wss.close(); server.close(() => r(undefined)); }) });
    });
  });
}

const test = base.extend({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture API
  pusher: async ({}, use) => {
    const p = await startFakePusher();
    await use(p);
    await /** @type {any} */ (p).close();
  },
  context: async ({ pusher }, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      ignoreHTTPSErrors: true,
      env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(?:https?|all)_proxy$/i.test(k))),
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        `--host-resolver-rules=MAP ws-us2.pusher.com:443 127.0.0.1:${/** @type {any} */ (pusher).port}`,
        `--ignore-certificate-errors-spki-list=${/** @type {any} */ (pusher).spki}`,
        '--ignore-certificate-errors',
        '--no-proxy-server',
        '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights',
      ],
    });
    try {
      await use(context);
    } finally {
      await context.close();
    }
  },
});

/** @param {import('@playwright/test').BrowserContext} context */
async function extWorker(context) {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
    if (sw) return sw;
    if (Date.now() > deadline) throw new Error('service worker not found');
    await new Promise((r) => setTimeout(r, 100));
  }
}

test('Kick のチャットを記録し、送信も届く', async ({ context, pusher }) => {
  await context.route('https://kick.com/**', async (route) => {
    const url = new URL(route.request().url());
    const m = url.pathname.match(/^\/api\/v2\/channels\/([^/]+)$/);
    if (!m) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE_HTML });
    const slug = m[1];
    if (slug === SLUG) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: CHANNEL_ID, user_id: 66, slug: SLUG, chatroom: { id: CHATROOM },
          user: { username: 'テストきっく', profile_pic: 'https://files.kick.com/images/user/66/profile_image/b.webp' },
          livestream: { id: Number(STREAM_ID), is_live: true, session_title: 'テスト配信', viewer_count: 12, start_time: '2026-11-08 09:00:00' },
        }),
      });
    }
    if (slug === 'late-fan') await new Promise((r) => setTimeout(r, 1200));
    const pic = slug === 'fan-a' ? 'https://files.kick.com/images/user/1001/profile_image/a.webp' : slug === 'late-fan' ? LATE_ICON : null;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ slug, chatroom: { id: 1 }, user: { username: slug, profile_pic: pic } }) });
  });
  await context.route('https://files.kick.com/**', (route) => route.fulfill({ status: 404, body: '' }));

  const sw = await extWorker(context);
  const page = await context.newPage();
  await page.goto(`https://kick.com/${SLUG}`);

  // 記録(IndexedDB yt_kirameki_db)に、このチャットルームの5件だけが入る(別の部屋の行は入れない)
  await expect
    .poll(
      () =>
        sw.evaluate(
          (key) =>
            new Promise((resolve) => {
              const req = indexedDB.open('yt_kirameki_db');
              req.onsuccess = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('comments')) return resolve([]);
                const all = db.transaction('comments').objectStore('comments').index('by_videoId').getAll(IDBKeyRange.only(key));
                all.onsuccess = () => resolve(all.result.map((/** @type {any} */ r) => `${r.kind}:${r.name}:${r.text}:${r.amount}:${r.currency}:${r.iconUrl ? 'face' : '-'}`).sort());
                all.onerror = () => resolve([]);
              };
              req.onerror = () => resolve([]);
            }),
          KEY,
        ),
      { timeout: 30_000 },
    )
    .toEqual([
      'membership:NewSub:サブスク:0::-',
      'membership_gift:Giver:ギフトサブを5件贈りました:0::-',
      'superchat:Kicker:がんばれ:500:KICKS:-',
      'text:LateFan:おそくなりました:0::-',
      'text:ファンA:わこつ KEKW:0::face',
    ]);

  // 計器: イベントの数・ギフトサブの件数・Kicks・間に合わなかった顔(yt_kk_icons)
  await expect
    .poll(async () => {
      const b = await sw.evaluate(async () => chrome.storage.local.get(['yt_diag_kk_chat', 'yt_kk_icons']));
      const d = b.yt_diag_kk_chat || {};
      return { gifts: d.gifts, subs: d.subs, kicks: d.kicks, wsState: d.wsState, late: b.yt_kk_icons?.['late-fan'] || '' };
    }, { timeout: 15_000 })
    .toEqual({ gifts: 5, subs: 1, kicks: 500, wsState: 'open', late: LATE_ICON });

  // 配信のまとめ(配信者・同接・開始時刻)
  const sum = await sw.evaluate(async (key) => (await chrome.storage.local.get('yt_stream_summaries')).yt_stream_summaries?.[key], KEY);
  expect(sum).toMatchObject({ title: 'テスト配信', broadcasterName: 'テストきっく', broadcasterHandle: SLUG, concurrentViewers: 12 });
  expect(Number(sum.startedAt)).toBe(Date.parse('2026-11-08T09:00:00Z'));

  // Pusher には公開キーでつなぎ、チャットルームを購読している(ログインの情報は送らない)
  expect(/** @type {any} */ (pusher).urls[0]).toMatch(/^\/app\/[0-9a-f]{20}\?protocol=7/);
  expect(/** @type {any} */ (pusher).received.some((l) => l.includes(`"channel":"${ROOM}"`))).toBe(true);

  // サイドパネル・会場と同じ口(YT_SEND_COMMENT)から送ると、Kick の入力欄に書かれて送信ボタンが押される
  const ext = await context.newPage();
  await ext.goto(`${sw.url().replace(/\/[^/]*$/, '')}/yt-sidepanel.html`);
  const res = await ext.evaluate((key) => chrome.runtime.sendMessage({ type: 'YT_SEND_COMMENT', videoId: key, text: 'こんにちは Kick' }), KEY);
  expect(res).toMatchObject({ ok: true });
  expect(await page.evaluate(() => /** @type {any} */ (window).__sent)).toEqual(['こんにちは Kick']);

  // 未ログイン(session_token が無く、ログインボタンがある)なら、打たずに理由を返す
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.textContent = 'Log In';
    b.id = 'login';
    document.body.prepend(b);
  });
  const res2 = await ext.evaluate((key) => chrome.runtime.sendMessage({ type: 'YT_SEND_COMMENT', videoId: key, text: 'みえないはず' }), KEY);
  expect(res2).toMatchObject({ ok: false, reason: 'not-signed-in' });
  expect(await page.evaluate(() => /** @type {any} */ (window).__sent)).toEqual(['こんにちは Kick']);
  await page.evaluate(() => document.getElementById('login')?.remove());

  // ニコ生版の画面(yt-sidepanel.html)に、Kick のコメントと配信者が出る・言葉は Kick の言葉
  await page.bringToFront();
  await ext.reload();
  await page.bringToFront();
  const bodyText = () => ext.evaluate(() => document.body.innerText);
  for (const want of ['ファンA', 'テストきっく', '500 Kicks', '@fan-a']) {
    await expect.poll(bodyText, { timeout: 30_000 }).toContain(want);
  }
  const text = await bodyText();
  expect(text).not.toMatch(/kk:\d/);
  expect(text).not.toContain('データ源: youtube');
  expect(text).not.toMatch(/スパチャ|スーパーチャット|トップファン/);
});
