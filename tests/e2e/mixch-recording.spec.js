// mixch-recording.spec.js — ミクチャの配信ページを開くと、コメント・ギフト・公式の順位を記録し、
//   サイドパネル側からコメントを送れるか(council/mixch-support-PLAN.md・計器で確かめる: りんくに見え方を聞かない)。
//
// 本物のミクチャには出ない(CI もクラウドも出られない):
//   - mixch.tv のページと /api-web/* → Playwright の route で差し替え
//   - chat.mixch.tv のソケット → Chromium の名前解決を 127.0.0.1 に向け、手元の TLS の WebSocket で役をする
//   形は 2026-11-08 の PC 実測(本物・値抜き)から写した(値は作りもの)。
import { test as base, chromium, expect } from '@playwright/test';
import { readStreamSummary } from './readStreamSummary.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../../extension');

const A = 1234567;
const SESSION = 888001;
const KEY = `mx.${A}.${SESSION}`;
const WS_HOST = 'chat.mixch.tv';
const T0 = Math.floor(Date.parse('2026-11-08T09:00:00Z') / 1000);
const ICON = 'https://d2jtsb989t238a.cloudfront.net/u/1.jpg';

const PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>ミクチャ</title></head><body>
<form><textarea placeholder="コメントする"></textarea><button type="button" id="send">送信する</button></form>
<script>
  window.__sent = [];
  document.getElementById('send').addEventListener('click', () => {
    const el = document.querySelector('textarea');
    window.__sent.push(el.value);
    el.value = '';
  });
</script></body></html>`;

const LIVE = {
  liveInfo: { id: A, chat: `wss://${WS_HOST}/torte/room/${A}`, live_session_id: SESSION, title: 'ざつだん配信', viewer: 42, visitor: 300, created: T0, name: 'はいしんしゃ' },
  broadcasterInfo: { id: A, name: 'はいしんしゃ', profile_image_url: ICON, live_status: 1, fan: 123456, superfan: 321 },
  // 名前の下のレベル・ライバーランク(2026-11-11 PC 実測で画面の数字と照合した欄・値は作り物)
  broadcasterLevel: { level: 27, level_exp: 10, level_goal: 20 },
  streamerRank: { available: true, rank: 5, star_group: 2, score: 45678, superfan_bonus: 12 },
  eventInfo: { id: 9, rank: 7, point: 8888, title: 'テストのイベント', active: true },
  displayPoint: 1000,
  loginInfo: null,
};
// url は絵ではなくページへのリンク。絵は resource_id → 資源の index.json → file → preview(2026-11-08 PC 実測)
const ITEMS = { items: [{ id: 501, price: 100, resource_id: 376, url: 'https://mixch.tv/p/gk26o21v', kind: 1 }, { id: 502, price: 3000, resource_id: 12, kind: 1 }], tabs: [] };
const RES = 'https://d2uqarpmf42qy0.cloudfront.net/torte_web_resources';
// 開いた時点の分(新しい順・本物と同じ)
const MESSAGES = [
  { kind: 42, message_id: 'm-gift-1', user_id: 13, name: 'ギフトさん', profile_image_url: ICON, item_id: 501, count: 2, anonymous: 0, created: T0 + 3 },
  { kind: 61, message_id: 'm-enter-1', user_id: 12, name: 'ファンB', body: '入室しました', created: T0 + 2 },
  { kind: 0, message_id: 'm-c-1', user_id: 11, name: 'ファンA', body: 'わこつ', created: T0 + 1 },
];
const SOCKET = [
  // 開いた時点の分と同じコメント(重ねない)
  { kind: 0, message_id: 'm-c-1', user_id: 11, name: 'ファンA', body: 'わこつ', created: T0 + 1 },
  { kind: 0, message_id: 'm-c-2', user_id: 14, name: 'ファンC', body: 'こんばんは', created: T0 + 5 },
  { kind: 46, message_id: 'm-gift-2', user_id: 15, name: 'おおもの', profile_image_url: ICON, item_id: 502, count: 1, anonymous: 0, created: T0 + 6 },
  { kind: 120, message_id: 'm-gift-3', user_id: 16, name: 'ふしぎ', item_id: 999, item_price: 50, count: 3, anonymous: 0, created: T0 + 7 },
  { kind: 42, message_id: 'm-gift-4', user_id: 17, name: 'かくれ', item_id: 501, count: 1, anonymous: 1, created: T0 + 8 },
  { kind: 10, viewer: 55, point: 1200 },
];

const WANT_ROWS = [
  'superchat:mx:13:ギフトさん:ギフト ×2:200:MXCOIN:face',
  'superchat:mx:15:おおもの:ギフト:3000:MXCOIN:face',
  'superchat:mx:16:ふしぎ:ギフト ×3:150:MXCOIN:-',
  'superchat:mx:n:匿名:匿名:ギフト:100:MXCOIN:-',
  'text:mx:11:ファンA:わこつ:0::-',
  'text:mx:14:ファンC:こんばんは:0::-',
];

function startFakeSocket() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mx-ws-'));
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', `/CN=${WS_HOST}`, '-addext', `subjectAltName=DNS:${WS_HOST}`], { stdio: 'ignore' });
  const server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) });
  const wss = new WebSocketServer({ server });
  /** @type {string[]} */
  const paths = [];
  wss.on('connection', (ws, req) => {
    paths.push(String(req.url));
    setTimeout(() => SOCKET.forEach((m) => ws.send(JSON.stringify(m))), 1500);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = /** @type {any} */ (server.address()).port;
      const spki = execFileSync('sh', ['-c', `openssl x509 -in '${cert}' -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64`]).toString().trim();
      resolve({ port, spki, paths, close: () => new Promise((r) => { wss.close(); server.close(() => r(undefined)); }) });
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

test('ミクチャのコメント・ギフト・公式の順位を記録し、送信も届く', async ({ context, sock }) => {
  let signedIn = true;
  let live = true;
  await context.route('https://d2jtsb989t238a.cloudfront.net/**', (route) => route.fulfill({ status: 404, body: '' }));
  await context.route('https://d2uqarpmf42qy0.cloudfront.net/**', (route) => {
    const u = route.request().url();
    const json = (/** @type {any} */ body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    // 本物と同じく CORS のヘッダは付けない(ページからは読めない=バックグラウンドが読む)
    if (u === `${RES}/index.json`) return json({ resources: [{ id: 376, file: '/m/m.json' }, { id: 12, file: '/n/n.json' }] });
    if (u === `${RES}/m/m.json`) return json({ type: 1, preview: '/m/thumb.png' });
    if (u === `${RES}/n/n.json`) return json({ type: 1 });
    return route.fulfill({ status: 404, body: '' });
  });
  await context.route('https://mixch.tv/**', async (route) => {
    const u = new URL(route.request().url());
    const json = (/** @type {any} */ body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (u.pathname === `/api-web/users/${A}/live`) return json(live ? LIVE : { broadcasterInfo: { ...LIVE.broadcasterInfo, live_status: 0 }, liveInfo: null });
    if (u.pathname === `/api-web/lives/${A}/messages`) return json(MESSAGES);
    if (u.pathname === '/items/available' || u.pathname === '/api-web/items/available') return u.searchParams.get('live_session_id') === String(SESSION) ? json(ITEMS) : route.fulfill({ status: 400, body: '' });
    if (u.pathname === `/api-web/users/${A}/fans/ranking/monthly`) return json({ month: 11, superfans: [{ id: 15, name: 'おおもの', score: 90000, profile_image_url: ICON }, { id: 13, name: 'ギフトさん', score: 500 }] });
    if (u.pathname === '/api-web/login-status') return route.fulfill({ status: 200, contentType: 'application/json', body: signedIn ? JSON.stringify({ user_id: 500 }) : 'null' });
    if (u.pathname.startsWith('/api-web/') || u.pathname.startsWith('/items/')) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE_HTML });
  });

  const sw = await extWorker(context);
  const page = await context.newPage();
  await page.goto(`https://mixch.tv/u/${A}/live`);

  // 記録: 開いた時点の分とソケットの同じコメントは1件。入室・状態は記録しない。ギフトは price × 個数(一覧に無ければ item_price)
  await expect.poll(() => readRows(sw), { timeout: 30_000 }).toEqual(WANT_ROWS);
  expect(/** @type {any} */ (sock).paths).toContain(`/torte/room/${A}`);

  await expect
    .poll(async () => {
      const d = (await sw.evaluate(async () => chrome.storage.local.get('yt_diag_mx_chat'))).yt_diag_mx_chat || {};
      return { wsState: d.wsState, giftCoin: d.giftCoin, itemList: d.itemList, itemsVia: d.itemsVia, boardRows: d.boardRows, k10: d.kinds?.['10'], giftImages: d.giftImages, tab: /^[a-z0-9]{4,}$/.test(String(d.tab || '')) };
    }, { timeout: 15_000 })
    .toEqual({ wsState: 'open', giftCoin: 3450, itemList: 2, itemsVia: 'root', boardRows: 2, k10: 1, giftImages: 1, tab: true });

  // ギフトの絵: 資源の preview が分かったギフト(item 501)だけ絵つき。preview の無いもの・一覧に無いものは絵なし
  const giftImages = await sw.evaluate(
    (/** @type {string} */ key) =>
      new Promise((resolve) => {
        const req = indexedDB.open('yt_kirameki_db');
        req.onsuccess = () => {
          const all = req.result.transaction('comments').objectStore('comments').index('by_videoId').getAll(IDBKeyRange.only(key));
          all.onsuccess = () => resolve(all.result.filter((/** @type {any} */ r) => r.kind === 'superchat').map((/** @type {any} */ r) => `${r.name}:${r.giftImageUrl || '-'}`).sort());
        };
      }),
    KEY,
  );
  expect(giftImages).toEqual([`ギフトさん:${RES}/m/thumb.png`, 'ふしぎ:-', 'おおもの:-', `匿名:${RES}/m/thumb.png`].sort());

  // 公式の今月のファンランキング(score つき)が YouTube のトップファンと同じ置き場に入る
  const board = await sw.evaluate(async (key) => (await chrome.storage.local.get(`yt_leaderboard_${key}`))[`yt_leaderboard_${key}`], KEY);
  expect(board.rows.slice(0, 2)).toEqual([
    { rank: 1, name: 'おおもの', xp: 90000, iconUrl: ICON },
    { rank: 2, name: 'ギフトさん', xp: 500, iconUrl: '' },
  ]);

  // 配信のまとめ(題・配信者・開始時刻)
  const sum = await readStreamSummary(sw, KEY);
  // 0.1.1948: 配信ページが「最後に見た配信」を自分で記録する(pfLastStreamUrl.js・SPEC §4-C1)。キーはこのチャンネルのもの
  await expect
    .poll(async () => String((await sw.evaluate(async () => (await chrome.storage.local.get('yt_last_stream_url')).yt_last_stream_url))?.key || ''), { timeout: 10_000 })
    .toContain(KEY.slice(0, KEY.lastIndexOf('.') + 1));
  expect(sum).toMatchObject({ title: 'ざつだん配信', broadcasterName: 'はいしんしゃ', broadcasterHandle: String(A) });
  expect(Number(sum.startedAt)).toBe(T0 * 1000);

  // 送信: 入力欄に書いて「送信する」。未ログイン(/api-web/login-status が null)なら打たずに理由を返す
  const ext = await context.newPage();
  await ext.goto(`${sw.url().replace(/\/[^/]*$/, '')}/yt-sidepanel.html`);
  const res = await ext.evaluate((key) => chrome.runtime.sendMessage({ type: 'YT_SEND_COMMENT', videoId: key, text: 'こんにちは ミクチャ' }), KEY);
  expect(res).toMatchObject({ ok: true });
  expect(await page.evaluate(() => /** @type {any} */ (window).__sent)).toEqual(['こんにちは ミクチャ']);
  signedIn = false;
  const res2 = await ext.evaluate((key) => chrome.runtime.sendMessage({ type: 'YT_SEND_COMMENT', videoId: key, text: 'みえないはず' }), KEY);
  expect(res2).toMatchObject({ ok: false, reason: 'not-signed-in' });
  signedIn = true;

  // ニコ生版の画面にミクチャのコメント・配信・ギフトが出る・言葉はミクチャの言葉
  await page.bringToFront();
  await ext.reload();
  await page.bringToFront();
  const bodyText = () => ext.evaluate(() => document.body.innerText);
  for (const want of ['ファンA', 'はいしんしゃ', 'おおもの']) {
    await expect.poll(bodyText, { timeout: 30_000 }).toContain(want);
  }
  const text = await bodyText();
  expect(text).not.toMatch(/mx:\d|mx\.\d|スパチャ|スーパーチャット|トップファン|ギフトサブ/);

  // ミクチャ特有: レベル・ファン・スーパーファン・ライバーランク・イベント順位を、値のまま
  const chip = (/** @type {string} */ k) => ext.evaluate((key) => {
    const el = document.querySelector(`[data-nl-metric="${key}"]`);
    return el ? `${el.textContent}|${el.getAttribute('title') || ''}` : '';
  }, k);
  await expect.poll(() => chip('level'), { timeout: 45_000 }).toContain('Lv27');
  expect(await chip('fans')).toContain('123,456人');
  expect(await chip('superfans')).toContain('321人');
  expect(await chip('liverRank')).toContain('45,678');
  expect(await chip('liverRank')).toContain('12%');
  expect(await chip('eventRank')).toContain('7位');
  expect(await chip('eventPoint')).toContain('8,888pt');
  expect(await bodyText()).not.toMatch(/推定|広告pt|来場者数/);
  await ext.locator('[data-nl-metric="level"]').locator('xpath=..').screenshot({ path: 'test-results/mixch-official-chips.png' });

  // コメビュ: ギフトはカードだけ(「ギフト」だけの行とカードの2行にしない・2026-11-08 PC 実測)
  const cv = await context.newPage();
  await cv.goto(`${sw.url().replace(/\/[^/]*$/, '')}/yt-comeview.html`);
  const cvCount = () =>
    cv.evaluate(() => ({
      rows: [...document.querySelectorAll('.nl-tl-row')].filter((e) => /おおもの/.test(e.textContent || '')).length,
      cards: [...document.querySelectorAll('.nl-tl-gift')].filter((e) => /おおもの/.test(e.textContent || '')).length,
      comment: [...document.querySelectorAll('.nl-tl-row')].some((e) => /ファンA/.test(e.textContent || '')),
    }));
  await expect.poll(cvCount, { timeout: 30_000 }).toEqual({ rows: 0, cards: 1, comment: true });
  await cv.close();
  await page.bringToFront();

  // 未ログインだとミクチャはページを読み直さずに /login へ移す。止まった理由が計器に残り、上書きで消えない
  await page.evaluate(() => history.pushState(null, '', '/login'));
  const mxDiag = async () => (await sw.evaluate(async () => chrome.storage.local.get('yt_diag_mx_chat'))).yt_diag_mx_chat || {};
  await expect.poll(async () => (await mxDiag()).stopReason, { timeout: 15_000 }).toBe('login-redirect');
  await page.waitForTimeout(3000);
  expect(await mxDiag()).toMatchObject({ stopReason: 'login-redirect', live: null });
  await page.goto(`https://mixch.tv/u/${A}/live`);
  // 開き直すと記録が戻り、理由は消える
  await expect.poll(async () => { const d = await mxDiag(); return `${d.streamKey}|${d.stopReason}`; }, { timeout: 30_000 }).toBe(`${KEY}|`);

  // 配信が終わったら(配信の情報が消えたら)終わった時刻を送る
  live = false;
  await expect
    .poll(async () => Number((await readStreamSummary(sw, KEY))?.endedAt || 0), { timeout: 45_000 })
    .toBeGreaterThan(0);
});
