// showroom-recording.spec.js — SHOWROOM の部屋のページを開くと、コメント・ギフト・公式の順位を記録し、
//   サイドパネル側からコメントを送れるか(council/showroom-support-PLAN.md・計器で確かめる: りんくに見え方を聞かない)。
//
// 本物の SHOWROOM には出ない(CI もクラウドも出られない):
//   - www.showroom-live.com のページと /api/* → Playwright の route で差し替え
//   - online.showroom-live.com のソケット → Chromium の名前解決を 127.0.0.1 に向け、手元の TLS の WebSocket で役をする
//   形は 2026-11-08 の PC 実測(本物・値抜き)から写した(値は作りもの)。
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

const ROOM_KEY = 'test_room';
const ROOM_ID = 4321;
const LIVE_ID = 98765;
const BC_KEY = `${ROOM_ID}:abcdEFGH`;
const KEY = `sr.${ROOM_KEY}.${LIVE_ID}`;
const WS_HOST = 'online.showroom-live.com';
const T0 = Math.floor(Date.parse('2026-11-08T09:00:00Z') / 1000);

const PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>SHOWROOM</title></head><body>
<div class="st-comment"><input type="text" placeholder="コメントを投稿"><button class="st-comment__button" type="submit">投稿</button></div>
<script>
  window.__sent = [];
  document.querySelector('.st-comment__button').addEventListener('click', () => {
    const el = document.querySelector('.st-comment input');
    window.__sent.push(el.value);
    el.value = '';
  });
</script></body></html>`;

const GIFT_LIST = {
  normal: [
    { gift_id: 1, gift_name: '星', point: 1, free: true, image: 'https://static.showroom-live.com/image/gift/1_s.png', gift_type: 1 },
    { gift_id: 1601, gift_name: 'ハート', point: 10, free: false, image: 'https://static.showroom-live.com/image/gift/1601_s.png', gift_type: 2 },
  ],
  enquete: [],
};
// comment_log は新しい順・gift_log は古い順(本物と同じ)
const COMMENT_LOG = {
  comment_log: [
    { user_id: 12, name: 'ファンB', comment: 'こんばんは', avatar_id: 2, avatar_url: 'https://static.showroom-live.com/image/avatar/2.png', created_at: T0 + 2 },
    { user_id: 11, name: 'ファンA', comment: 'わこつ', avatar_id: 1, avatar_url: 'https://static.showroom-live.com/image/avatar/1.png', created_at: T0 + 1 },
  ],
};
const GIFT_LOG = { gift_log: [{ user_id: 13, name: 'ギフトさん', gift_id: 1601, num: 2, avatar_url: 'https://static.showroom-live.com/image/avatar/3.png', created_at: T0 + 3 }] };
const msg = (o) => `MSG\t${BC_KEY}\t${JSON.stringify(o)}`;
const SOCKET = [
  // ログと同じコメント(重ねない)
  msg({ t: 1, u: 11, ac: 'ファンA', cm: 'わこつ', av: 1, created_at: T0 + 1 }),
  msg({ t: 1, u: 14, ac: 'ファンC', cm: '50', av: 4, created_at: T0 + 5 }),
  msg({ t: 2, u: 13, ac: 'ギフトさん', g: 1601, n: 5, gt: 2, av: 3, created_at: T0 + 6 }),
  msg({ t: 2, u: 15, ac: '星の人', g: 1, n: 10, gt: 1, av: 5, created_at: T0 + 7 }),
  msg({ t: 8, telop: 'テロップ' }),
  'ACK\tshowroom',
];

const WANT_ROWS = [
  'superchat:sr:13:ギフトさん:ハート ×2:20:SRPT:face',
  'superchat:sr:13:ギフトさん:ハート ×5:50:SRPT:face',
  'text:sr:11:ファンA:わこつ:0::face',
  'text:sr:12:ファンB:こんばんは:0::face',
  'text:sr:14:ファンC:50:0::face',
];

function startFakeSocket() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-ws-'));
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', `/CN=${WS_HOST}`, '-addext', `subjectAltName=DNS:${WS_HOST}`], { stdio: 'ignore' });
  const server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) });
  const wss = new WebSocketServer({ server });
  /** @type {string[]} */
  const received = [];
  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      const text = String(data);
      received.push(text);
      if (text === `SUB\t${BC_KEY}`) setTimeout(() => SOCKET.forEach((m) => ws.send(m)), 1500);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = /** @type {any} */ (server.address()).port;
      const spki = execFileSync('sh', ['-c', `openssl x509 -in '${cert}' -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64`]).toString().trim();
      resolve({ port, spki, received, close: () => new Promise((r) => { wss.close(); server.close(() => r(undefined)); }) });
    });
  });
}

const test = base.extend({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture API
  sock: async ({}, use) => {
    const p = await startFakeSocket();
    await use(p);
    await /** @type {any} */ (p).close();
  },
  context: async ({ sock }, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      ignoreHTTPSErrors: true,
      env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(?:https?|all)_proxy$/i.test(k))),
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        `--host-resolver-rules=MAP ${WS_HOST}:443 127.0.0.1:${/** @type {any} */ (sock).port}`,
        `--ignore-certificate-errors-spki-list=${/** @type {any} */ (sock).spki}`,
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

test('SHOWROOM のコメント・ギフト・公式の順位を記録し、送信も届く', async ({ context, sock }) => {
  let signedIn = true;
  let live = true;
  await context.route('https://static.showroom-live.com/**', (route) => route.fulfill({ status: 404, body: '' }));
  await context.route('https://www.showroom-live.com/**', async (route) => {
    const u = new URL(route.request().url());
    const json = (/** @type {any} */ body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    switch (u.pathname) {
      case '/api/room/status':
        return json({ room_id: ROOM_ID, room_url_key: ROOM_KEY, room_name: 'テストのへや', live_id: live ? LIVE_ID : 0, is_live: live, started_at: T0, broadcast_host: WS_HOST, broadcast_key: BC_KEY });
      case '/api/live/live_info':
        return json({ bcsvr_host: WS_HOST, bcsvr_key: BC_KEY, live_id: LIVE_ID, room_id: ROOM_ID });
      case '/api/live/gift_list':
        return json(GIFT_LIST);
      case '/api/live/comment_log':
        return json(COMMENT_LOG);
      case '/api/live/gift_log':
        return json(GIFT_LOG);
      case '/api/live/summary_ranking':
        return json({ ranking: [{ user_id: 13, name: 'ギフトさん', point: 7000, rank: 1, order: 1, avatar_url: '' }, { user_id: 11, name: 'ファンA', point: 300, rank: 2, order: 2 }] });
      case '/api/live/stage_user_list':
        return json({ stage_user_list: [] });
      case '/api/room/event_and_support':
        // 2026-11-11 PC 実測の形(値は作り物)。部屋の画面の「現在のランキング・支援pt」「目標Lv」「貢献ユーザー」
        return json({
          event: {
            event_name: 'テストのイベント',
            ranking: { rank: 4, point: 123456, gap: 5000, lower_gap: 200 },
            quest: { support: { current_point: 900, goal_point: 1500, next_level: 3 } },
            contribution_ranking: [
              { rank: 1, point: 8800, user_id: 13, name: 'イベント応援さん', avatar_url: '' },
              { rank: 2, point: 1200, user_id: 11, name: 'ファンA', avatar_url: '' },
            ],
          },
          regular_event: null,
          support: null,
        });
      case '/api/live/polling':
        return json({ online_user_num: 77, is_login: signedIn });
      case '/api/current_user':
        return json(signedIn ? { user_id: 500, is_login: true } : { user_id: 0, is_login: false });
      default:
        return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE_HTML });
    }
  });

  const sw = await extWorker(context);
  const page = await context.newPage();
  await page.goto(`https://www.showroom-live.com/r/${ROOM_KEY}`);

  // 記録: ログとソケットの同じコメントは1件。無料の星は記録しない。ギフトは point × 個数
  await expect.poll(() => readRows(sw), { timeout: 30_000 }).toEqual(WANT_ROWS);
  const got = /** @type {any} */ (sock);
  expect(got.received).toContain(`SUB\t${BC_KEY}`);

  await expect
    .poll(async () => {
      const d = (await sw.evaluate(async () => chrome.storage.local.get('yt_diag_sr_chat'))).yt_diag_sr_chat || {};
      return { wsState: d.wsState, freeGifts: d.freeGifts, giftPt: d.giftPt, giftList: d.giftList, boardFrom: d.boardFrom, t8: d.types?.['8'], tab: /^[a-z0-9]{4,}$/.test(String(d.tab || '')) };
    }, { timeout: 15_000 })
    .toEqual({ wsState: 'open', freeGifts: 1, giftPt: 70, giftList: 2, boardFrom: 'summary', t8: 1, tab: true });

  // 公式の順位(pt つき)が YouTube のトップファンと同じ置き場に入る
  const board = await sw.evaluate(async (key) => (await chrome.storage.local.get(`yt_leaderboard_${key}`))[`yt_leaderboard_${key}`], KEY);
  expect(board.rows.slice(0, 2)).toEqual([
    { rank: 1, name: 'ギフトさん', xp: 7000, iconUrl: '' },
    { rank: 2, name: 'ファンA', xp: 300, iconUrl: '' },
  ]);

  // 配信のまとめ(部屋の名前・視聴数・開始時刻)
  const sum = await sw.evaluate(async (key) => (await chrome.storage.local.get('yt_stream_summaries')).yt_stream_summaries?.[key], KEY);
  // 0.1.1948: 配信ページが「最後に見た配信」を自分で記録する(pfLastStreamUrl.js・SPEC §4-C1)。キーはこのチャンネルのもの
  await expect
    .poll(async () => String((await sw.evaluate(async () => (await chrome.storage.local.get('yt_last_stream_url')).yt_last_stream_url))?.key || ''), { timeout: 10_000 })
    .toContain(KEY.slice(0, KEY.lastIndexOf('.') + 1));
  expect(sum).toMatchObject({ broadcasterName: 'テストのへや', broadcasterHandle: ROOM_KEY, concurrentViewers: 77 });
  expect(Number(sum.startedAt)).toBe(T0 * 1000);

  // 送信: 入力欄に書いて投稿ボタン。未ログイン(/api/current_user)なら打たずに理由を返す
  const ext = await context.newPage();
  await ext.goto(`${sw.url().replace(/\/[^/]*$/, '')}/yt-sidepanel.html`);
  const res = await ext.evaluate((key) => chrome.runtime.sendMessage({ type: 'YT_SEND_COMMENT', videoId: key, text: 'こんにちは SHOWROOM' }), KEY);
  expect(res).toMatchObject({ ok: true });
  expect(await page.evaluate(() => /** @type {any} */ (window).__sent)).toEqual(['こんにちは SHOWROOM']);
  signedIn = false;
  const res2 = await ext.evaluate((key) => chrome.runtime.sendMessage({ type: 'YT_SEND_COMMENT', videoId: key, text: 'みえないはず' }), KEY);
  expect(res2).toMatchObject({ ok: false, reason: 'not-signed-in' });
  signedIn = true;

  // ニコ生版の画面に SHOWROOM のコメント・部屋・ギフトが出る・言葉は SHOWROOM の言葉
  await page.bringToFront();
  await ext.reload();
  await page.bringToFront();
  const bodyText = () => ext.evaluate(() => document.body.innerText);
  for (const want of ['ファンA', 'テストのへや', 'ハート']) {
    await expect.poll(bodyText, { timeout: 30_000 }).toContain(want);
  }
  const text = await bodyText();
  expect(text).not.toMatch(/sr:\d|スパチャ|スーパーチャット|トップファン|ギフトサブ/);

  // SHOWROOM 特有: イベントの数字はまとめに値のまま、貢献ランキングは2つめの欄(広告ランキングの欄)に SHOWROOM の言葉で
  await expect
    .poll(async () => (await sw.evaluate(async (key) => (await chrome.storage.local.get('yt_stream_summaries')).yt_stream_summaries?.[key], KEY))?.platformStats || null, { timeout: 45_000 })
    .toEqual({ eventName: 'テストのイベント', eventRank: 4, eventPoint: 123456, eventGap: 5000, questLevel: 3, questPoint: 900, questGoal: 1500 });
  const lane = ext.locator('[data-lane="adRanking"]');
  await expect.poll(async () => (await lane.count()) ? lane.first().innerText() : '', { timeout: 30_000 }).toContain('イベント応援さん');
  const laneText = await lane.first().innerText();
  expect(laneText).toContain('イベント貢献ランキング');
  expect(laneText).toContain('SHOWROOM 公式のイベント貢献ランキング');
  expect(laneText).toContain('8,800 pt');
  expect(laneText).not.toMatch(/広告|ニコニ|貢(?!献)/);
  const chipText = (/** @type {string} */ k) => ext.evaluate((key) => document.querySelector(`[data-nl-metric="${key}"]`)?.textContent || '', k);
  await expect.poll(() => chipText('eventRank'), { timeout: 30_000 }).toContain('4位');
  expect(await chipText('eventRank')).toContain('イベント順位');
  expect(await chipText('eventPoint')).toContain('123,456pt');
  expect(await chipText('quest')).toContain('Lv3');
  expect(await bodyText()).not.toMatch(/推定/);
  await lane.first().screenshot({ path: 'test-results/showroom-event-board.png' });
  await ext.locator('[data-nl-metric="eventRank"]').locator('xpath=..').screenshot({ path: 'test-results/showroom-event-chips.png' });

  // 配信が終わったら(is_live=false)終わった時刻を送る
  live = false;
  await expect
    .poll(async () => Number((await sw.evaluate(async (key) => (await chrome.storage.local.get('yt_stream_summaries')).yt_stream_summaries?.[key], KEY))?.endedAt || 0), { timeout: 45_000 })
    .toBeGreaterThan(0);
});
