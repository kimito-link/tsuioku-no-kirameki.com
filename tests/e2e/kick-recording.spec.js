// kick-recording.spec.js — Kick の配信ページを開くと、チャット(ページ自身が使うリアルタイムの接続)を記録し、サイドパネル側からコメントを送れるか
//   (council/kick-support-PLAN.md・計器で確かめる: りんくに見え方を聞かない)。
//
// 本物の Kick には出ない(CI もクラウドも出られない):
//   - kick.com のページ・/api/v2/channels/<slug> の応答 → Playwright の route で差し替え
//   - つなぎ先 API(web.kick.com/api/v1/realtime/*)→ route で差し替え
//   - realtime.<region>.platform.kick.com(Centrifugo)と ws-us2.pusher.com(予備)の WebSocket → Chromium の名前解決を
//     127.0.0.1 に向け、手元の TLS の WebSocket で役をする(twitch-recording.spec.js と同じ作り。
//     イベントの形は 2026-11-08 の PC 実測で本物から写した)。
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

/** イベント1件(届く方式に合わせてあとで包む) @param {string} event @param {any} data @param {string} [channel] */
const ev = (event, data, channel = ROOM) => ({ event, channel, data });
const chat = (id, uid, username, slug, content, extra = {}) =>
  ev('App\\Events\\ChatMessageEvent', { id, chatroom_id: CHATROOM, content, type: 'message', created_at: '2026-11-08T09:59:58+00:00', sender: { id: uid, username, slug, identity: { color: '#00FF00', badges: [] } }, ...extra });
const kicks = (tx, amount, gname) =>
  ev('KicksGifted', { gift_transaction_id: tx, message: amount > 1 ? 'がんばれ' : '', sender: { id: 1002, username: 'Kicker', username_color: '#FF2C56', profile_picture: 'https://files.kick.com/images/user/1002/profile_image/k.webp' }, gift: { gift_id: gname, name: gname, amount, type: 'BASIC', tier: 'BASIC' }, created_at: '2026-11-08T09:59:58.318794143Z' }, `channel_${CHANNEL_ID}`);

// 形は 2026-11-08 の PC 実測(本物の Kick)に合わせてある(memory kick-realtime-protocol)
const FIRST = [
  chat('m-1', 1001, 'ファンA', 'fan-a', 'わこつ [emote:1:KEKW]'),
  chat('m-7', 1007, 'New_Sub', 'new_sub', 'はじめまして'),
  ev('App\\Events\\SubscriptionEvent', { chatroom_id: CHATROOM, username: 'New_Sub', months: 1 }),
  { ...chat('m-other', 1004, 'Other', 'other', '別の部屋'), data: { ...chat('m-other', 1004, 'Other', 'other', '別の部屋').data, chatroom_id: 5 } },
  ev('App\\Events\\MessageDeletedEvent', { id: 'd-1', message: { id: 'm-1' }, aiModerated: true }),
];
const LATE = [
  kicks('tx-1', 500, 'Rage Quit'),
  kicks('tx-2', 1, 'Hell Yeah'),
  kicks('tx-3', 1, 'Hell Yeah'),
  ev('KicksLeaderboardUpdated', { gifts_lifetime: [{ user_id: 1002, username: 'Kicker', quantity: 9502 }, { user_id: 1001, username: 'ファンA', quantity: 300 }], gifts_lifetime_enabled: true, gifts_week: [] }, `channel_${CHANNEL_ID}`),
  ev('GiftedSubscriptionsEvent', { chatroom_id: CHATROOM, correlation_id: 'c-1', gifted_usernames: ['a1', 'b2'], gifter_username: 'Giver', gifted_total: 5, gifter_total: 9, chunk_details: null }, `chatroom_${CHATROOM}`),
  chat('m-8', 1008, 'Fan8', 'fan8', '', { type: 'celebration', metadata: { celebration: { id: 'c', type: 'subscription_renewed', total_months: 26 } } }),
  ev('RewardRedeemedEvent', { reward_title: '歌って', user_id: 1001, channel_id: CHANNEL_ID, username: 'ファンA', user_input: '星座になれたら', reward_background_color: '#FEA0CF' }, `chatroom_${CHATROOM}`),
  chat('m-6', 1006, 'LateFan', 'late-fan', 'おそくなりました'),
];

/** Centrifugo の形で包む(複数を改行でまとめて1フレームにする=本物と同じ) @param {Array<any>} list */
const asCentrifugo = (list) =>
  list.map((e) => JSON.stringify({ push: { channel: e.channel, pub: { data: { event: e.event, data: JSON.stringify(e.data) } } } })).join('\n');
/** Pusher の形で包む @param {any} e */
const asPusher = (e) => JSON.stringify({ event: e.event, channel: e.channel, data: JSON.stringify(e.data) });

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

const CENT_HOST = 'realtime.us-west-2.platform.kick.com';
const PUSHER_HOST = 'ws-us2.pusher.com';

/** 手元の TLS の WebSocket(Kick のリアルタイム=Centrifugo と、予備の Pusher の役)を立てる */
function startFakeRealtime() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-rt-'));
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', `/CN=${CENT_HOST}`, '-addext', `subjectAltName=DNS:${CENT_HOST},DNS:${PUSHER_HOST}`], { stdio: 'ignore' });
  const server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) });
  const wss = new WebSocketServer({ server });
  /** @type {string[]} */
  const received = [];
  /** @type {string[]} */
  const urls = [];
  wss.on('connection', (ws, req) => {
    const url = String(req.url || '');
    urls.push(url);
    let sent = false;
    if (url.startsWith('/app/')) {
      ws.send(JSON.stringify({ event: 'pusher:connection_established', data: JSON.stringify({ socket_id: '1.2', activity_timeout: 120 }) }));
      ws.on('message', (data) => {
        const text = String(data);
        received.push(text);
        const m = JSON.parse(text);
        if (m.event === 'pusher:subscribe') {
          ws.send(JSON.stringify({ event: 'pusher_internal:subscription_succeeded', channel: m.data.channel, data: '{}' }));
          if (m.data.channel === ROOM && !sent) {
            sent = true;
            setTimeout(() => FIRST.forEach((f) => ws.send(asPusher(f))), 300);
            setTimeout(() => LATE.forEach((f) => ws.send(asPusher(f))), 2500);
          }
        }
      });
      return;
    }
    // Centrifugo: connect(token)→ subscribe ごとに返事。サーバーの ping は {}
    ws.on('message', (data) => {
      for (const line of String(data).split('\n')) {
        if (!line.trim()) continue;
        received.push(line);
        const m = JSON.parse(line);
        if (m.connect) ws.send(JSON.stringify({ id: m.id, connect: { client: 'c1', version: '6', expires: true, ttl: 2700, ping: 25, pong: true } }));
        if (m.subscribe) {
          ws.send(JSON.stringify({ id: m.id, subscribe: {} }));
          if (m.subscribe.channel === ROOM && !sent) {
            sent = true;
            setTimeout(() => ws.send('{}'), 100);
            setTimeout(() => ws.send(asCentrifugo(FIRST)), 300);
            setTimeout(() => LATE.forEach((f) => ws.send(asCentrifugo([f]))), 2500);
          }
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
  rt: async ({}, use) => {
    const p = await startFakeRealtime();
    await use(p);
    await /** @type {any} */ (p).close();
  },
  context: async ({ rt }, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      ignoreHTTPSErrors: true,
      env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(?:https?|all)_proxy$/i.test(k))),
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        `--host-resolver-rules=MAP ${CENT_HOST}:443 127.0.0.1:${/** @type {any} */ (rt).port}, MAP ${PUSHER_HOST}:443 127.0.0.1:${/** @type {any} */ (rt).port}`,
        `--ignore-certificate-errors-spki-list=${/** @type {any} */ (rt).spki}`,
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

const PUSHER_FALLBACK_KEY = 'abcdef0123456789abcd';

/**
 * つなぎ先 API(web.kick.com)の役。本物と同じく CORS を返す(コンテンツスクリプトの fetch は kick.com の出どころで飛ぶ)
 * @param {import('@playwright/test').BrowserContext} context @param {'centrifugo' | 'pusher'} mode @param {string[]} asked
 */
async function routeRealtimeApi(context, mode, asked) {
  await context.route('https://web.kick.com/**', async (route) => {
    const req = route.request();
    const cors = {
      'Access-Control-Allow-Origin': 'https://kick.com',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'content-type, accept',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    const p = new URL(req.url()).pathname;
    if (p === '/api/v1/realtime/connection') {
      const body = JSON.parse(req.postData() || '{}');
      const accepts = (body?.capabilities?.accepted_providers || []).map((/** @type {any} */ x) => x.provider);
      asked.push(accepts.join('+'));
      const conn =
        mode === 'centrifugo' && accepts.includes('centrifugo')
          ? { provider: 'centrifugo', credentials: { url: `wss://${CENT_HOST}/connection/websocket` } }
          : { provider: 'pusher', credentials: { app_key: PUSHER_FALLBACK_KEY, cluster: 'us2' } };
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data: { connections: [conn], mode: 'websocket' }, message: 'success' }) });
    }
    if (p === `/api/v1/kicks/${CHANNEL_ID}/leaderboard`) {
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data: { kicks_gifts_lifetime: [{ user_id: 1002, username: 'Kicker', quantity: 9000 }, { user_id: 1001, username: 'ファンA', quantity: 300 }], kicks_gifts_week: [] } }) });
    }
    if (p === '/api/v1/realtime/auth/connection') {
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data: { token: 'fake.token-1234567890' } }) });
    }
    return route.fulfill({ status: 404, headers: cors, body: '' });
  });
}

const WANT_ROWS = [
  'kk_reward:kk:1001:ファンA:「歌って」を交換しました: 星座になれたら:0::face',
  'membership:kk:1007:New_Sub:サブスク:0::-',
  'membership:kk:1008:Fan8:サブスク(26か月目):0::-',
  'membership_gift:kk:@giver:Giver:ギフトサブを5件贈りました:0::-',
  'superchat:kk:1002:Kicker:Hell Yeahを贈りました:1:KICKS:face',
  'superchat:kk:1002:Kicker:Hell Yeahを贈りました:1:KICKS:face',
  'superchat:kk:1002:Kicker:がんばれ:500:KICKS:face',
  'text:kk:1001:ファンA:わこつ KEKW:0::face',
  'text:kk:1006:LateFan:おそくなりました:0::-',
  'text:kk:1007:New_Sub:はじめまして:0::-',
];

/** @param {any} sw */
const readRows = (sw) =>
  sw.evaluate(
    (/** @type {string} */ key) =>
      new Promise((resolve) => {
        const req = indexedDB.open('yt_kirameki_db');
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('comments')) return resolve([]);
          const all = db.transaction('comments').objectStore('comments').index('by_videoId').getAll(IDBKeyRange.only(key));
          all.onsuccess = () => resolve(all.result.map((/** @type {any} */ r) => `${r.kind}:${r.channelId}:${r.name}:${r.text}:${r.amount}:${r.currency}:${r.iconUrl ? 'face' : '-'}`).sort());
          all.onerror = () => resolve([]);
        };
        req.onerror = () => resolve([]);
      }),
    KEY,
  );

test('Kick のチャットを記録し、送信も届く', async ({ context, rt }) => {
  const asked = [];
  await routeRealtimeApi(context, 'centrifugo', asked);
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
  // 絵文字の画像(1×1 の PNG)。顔は 404 のまま(あとから足したルートが先に効く)
  const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
  await context.route('https://files.kick.com/emotes/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX }));

  const sw = await extWorker(context);
  const page = await context.newPage();
  await page.goto(`https://kick.com/${SLUG}`);

  // 記録(IndexedDB yt_kirameki_db)に、このチャットルームの分だけが入る(別の部屋の行は入れない)。
  //   連続した同じ Kicks(tx-2・tx-3)は1件に潰さない。名前だけのサブスクは、チャットで見た本物の id にそろう
  await expect.poll(() => readRows(sw), { timeout: 30_000 }).toEqual(WANT_ROWS);

  // 計器: イベントの数・ギフトサブの件数・Kicks・間に合わなかった顔(yt_kk_icons)
  await expect
    .poll(async () => {
      const b = await sw.evaluate(async () => chrome.storage.local.get(['yt_diag_kk_chat', 'yt_kk_icons']));
      const d = b.yt_diag_kk_chat || {};
      return { gifts: d.gifts, subs: d.subs, kicks: d.kicks, wsState: d.wsState, late: b.yt_kk_icons?.['late-fan'] || '', provider: d.provider, deleted: d.deleted, rewards: d.rewards, subscribed: d.subscribed, boardFrom: d.boardFrom };
    }, { timeout: 15_000 })
    .toEqual({ gifts: 5, subs: 2, kicks: 502, wsState: 'open', late: LATE_ICON, provider: 'centrifugo', deleted: 1, rewards: 1, subscribed: 4, boardFrom: 'socket' });

  // 公式の Kicks ランキング(開いた時点は API・以後はソケット)が、YouTube のトップファンと同じ置き場に入る
  const board = await sw.evaluate(async (key) => (await chrome.storage.local.get(`yt_leaderboard_${key}`))[`yt_leaderboard_${key}`], KEY);
  expect(board.rows.slice(0, 2)).toEqual([
    { rank: 1, name: 'Kicker', xp: 9502, iconUrl: '' },
    { rank: 2, name: 'ファンA', xp: 300, iconUrl: '' },
  ]);

  // 配信のまとめ(配信者・同接・開始時刻)
  const sum = await sw.evaluate(async (key) => (await chrome.storage.local.get('yt_stream_summaries')).yt_stream_summaries?.[key], KEY);
  // 0.1.1948: 配信ページが「最後に見た配信」を自分で記録する(pfLastStreamUrl.js・SPEC §4-C1)。キーはこのチャンネルのもの
  await expect
    .poll(async () => String((await sw.evaluate(async () => (await chrome.storage.local.get('yt_last_stream_url')).yt_last_stream_url))?.key || ''), { timeout: 10_000 })
    .toContain(KEY.slice(0, KEY.lastIndexOf('.') + 1));
  expect(sum).toMatchObject({ title: 'テスト配信', broadcasterName: 'テストきっく', broadcasterHandle: SLUG, concurrentViewers: 12 });
  expect(Number(sum.startedAt)).toBe(Date.parse('2026-11-08T09:00:00Z'));

  // つなぎ先は Kick に聞いて Centrifugo へ。token で connect し、チャットルームを購読している(ping の {} にも返す)
  expect(asked[0]).toBe('pusher+centrifugo');
  const got = /** @type {any} */ (rt);
  expect(got.urls[0]).toBe('/connection/websocket');
  expect(got.received.some((/** @type {string} */ l) => l.includes('"token":"fake.token-1234567890"'))).toBe(true);
  expect(got.received.some((/** @type {string} */ l) => l.includes(`"channel":"${ROOM}"`))).toBe(true);
  expect(got.received).toContain('{}');

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
  for (const want of ['ファンA', 'テストきっく', '500 Kicks', '@fan-a', 'Kicks ランキング']) {
    await expect.poll(bodyText, { timeout: 30_000 }).toContain(want);
  }
  const text = await bodyText();
  expect(text).not.toMatch(/kk:\d/);
  expect(text).not.toContain('データ源: youtube');
  expect(text).not.toMatch(/スパチャ|スーパーチャット|トップファン/);
  // 公式ランキングがあるので「このPCの記録から数えます」の言葉は出さない
  const all = await ext.evaluate(() => document.body.textContent || '');
  expect(all).not.toContain('このPCの記録から数えます');
  expect(all).toContain('Kick 公式の Kicks ランキング');
  expect(all).toContain('「歴代トップKICKユーザー」と同じ値です');
  // ニコ生だけの部品(なふだ)は見せない・ランキング欄の補足(title・aria-label)にも「ニコ生」「放送者」を残さない
  const left = await ext.evaluate(() => {
    const vis = document.body.innerText.split('\n').filter((l) => /ニコ生|放送者/.test(l));
    const attrs = [];
    for (const el of document.querySelectorAll('*')) for (const name of ['title', 'aria-label']) if (/ニコ生|放送者/.test(el.getAttribute(name) || '')) attrs.push(`${el.tagName}#${el.id} ${name}`);
    return { vis, attrs };
  });
  expect(left).toEqual({ vis: [], attrs: [] });

  // 絵文字(KEKW)は名前 → 画像の対応を覚え、コメントの一覧では画像で見せる(文字は残す)
  expect((await sw.evaluate(async () => chrome.storage.local.get('yt_kk_emotes'))).yt_kk_emotes).toEqual({
    KEKW: 'https://files.kick.com/emotes/1/fullsize',
  });
  await ext.evaluate(() => {
    const det = /** @type {HTMLDetailsElement | null} */ (document.getElementById('supportTimelineDetails'));
    if (det && !det.open) {
      det.open = true;
      det.dispatchEvent(new Event('toggle'));
    }
  });
  await expect
    .poll(() => ext.evaluate(() => {
      const e = document.querySelector('.nl-tl-row__text .nl-emote');
      return e ? `${e.textContent}|${e.classList.contains('is-ready')}|${e.closest('.nl-tl-row__text')?.textContent}` : '';
    }), { timeout: 20_000 })
    .toBe('KEKW|true|わこつ KEKW');
});

test('Centrifugo が使えないときは、API が返す Pusher の鍵で読む', async ({ context, rt }) => {
  const asked = [];
  await routeRealtimeApi(context, 'pusher', asked);
  await context.route('https://kick.com/**', async (route) => {
    const m = new URL(route.request().url()).pathname.match(/^\/api\/v2\/channels\/([^/]+)$/);
    if (!m) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE_HTML });
    if (m[1] === SLUG) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: CHANNEL_ID, user_id: 66, slug: SLUG, chatroom: { id: CHATROOM }, user: { username: 'テストきっく' }, livestream: { id: Number(STREAM_ID), is_live: true, session_title: 'テスト配信', viewer_count: 12, start_time: '2026-11-08 09:00:00' } }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ slug: m[1], chatroom: { id: 1 }, user: { username: m[1], profile_pic: null } }) });
  });
  await context.route('https://files.kick.com/**', (route) => route.fulfill({ status: 404, body: '' }));
  const sw = await extWorker(context);
  const page = await context.newPage();
  await page.goto(`https://kick.com/${SLUG}`);
  await expect.poll(async () => (await readRows(sw)).length, { timeout: 30_000 }).toBe(WANT_ROWS.length);
  const d = (await sw.evaluate(async () => chrome.storage.local.get('yt_diag_kk_chat'))).yt_diag_kk_chat;
  expect(d).toMatchObject({ provider: 'pusher', pusherKey: PUSHER_FALLBACK_KEY, wsState: 'open' });
  expect(/** @type {any} */ (rt).urls[0]).toMatch(new RegExp(`^/app/${PUSHER_FALLBACK_KEY}\\?protocol=7`));
});
