// twitcasting-recording.spec.js — ツイキャスの配信ページを開くと、コメント・ギフト(🍡)・ページに出ている数を記録し、
//   サイドパネル側からの送信は未ログインなら打たずに理由を返すか(council/twitcasting-support-PLAN.md・計器で確かめる)。
//
// 本物のツイキャスには出ない(CI もクラウドも出られない):
//   - twitcasting.tv のページ・streamserver.php・eventpubsuburl.php → Playwright の route で差し替え
//   - ソケット(ws1.twitcasting.tv)→ Chromium の名前解決を 127.0.0.1 に向け、手元の TLS の WebSocket で役をする
//   形は 2026-11-12 の PC 実測(本物・ログインなし・値抜き)から写した(値は作りもの)。
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

const USER = 'c:hostuser';
const MOVIE = 842841215;
const KEY = `tc.${USER}.${MOVIE}`;
const WS_HOST = 'ws1.twitcasting.tv';
// 開始は今より前(未来の開始時刻だと、終わった時刻が開始より前になり記録されない)
const T0 = Math.floor((Date.now() - 10 * 60_000) / 1000) * 1000;
const ICON = 'https://imagegw02.twitcasting.tv/image3s/pbs.twimg.com/a.jpg';
const GIFT_IMG = 'https://twitcasting.tv/img/item_star.png';

const pageHtml = (/** @type {{ live: boolean, signedIn: boolean }} */ s) => `<!doctype html><html><head><meta charset="utf-8">
<meta property="og:title" content="ざつだんキャス"><meta property="og:description" content="テロップです">
<title>はいしんしゃ (@${USER}) さんのライブ - ツイキャス</title></head><body>
<span id="updatetimer" class="tw-player-duration-time" data-started-at="${T0}" data-live-type="${s.live ? 'live' : 'movie'}">0:10:00</span>
<div id="viewer-counter"><span class="tw-viewer-indicator__number"><span class="tw-fraction">123/4567</span></span></div>
<div id="comment-count"><a title="コメント数 890"><span>890</span></a></div>
<div id="comment-list-app" data-movie-id="${MOVIE}" data-broadcaster-name="はいしんしゃ" data-broadcaster-screen-name="${USER}"
  data-broadcaster-profile-image="${ICON}" data-account-type="${s.signedIn ? 'normal' : 'not_logged_in'}">
  ${s.signedIn ? '<form><textarea name="comment" placeholder="コメントする"></textarea><button type="button" id="send">コメント</button></form>' : '<div class="tw-login-button-list">ログイン方法を選んでください</div>'}
</div>
<script>
  window.__sent = [];
  document.getElementById('send')?.addEventListener('click', () => {
    const el = document.querySelector('textarea');
    window.__sent.push(el.value);
    el.value = '';
  });
</script></body></html>`;

// 配信者のサポーターランキング(サーバーが描いた HTML・2026-11-12 PC 実測の形)
const SUPPORTER_HTML = `<!doctype html><html><body><div class="tw-supporter-ranking-summary-title">現在のレベル: 30</div>
<section class="tw-top-supporters">
  <div class="tw-top-supporter" data-rank="1"><a class="tw-user-name-icon" data-user-id="g:1181112"><img src="${ICON}"></a><a class="tw-supporter-user-name"><span>おうえん</span></a>
    <div class="tw-supporter-point-stat"><span class="tw-supporter-point-stat-current">90815</span><span class="tw-supporter-point-stat-total">379005</span></div></div>
  <div class="tw-top-supporter" data-rank="2"><a class="tw-user-name-icon" data-user-id="fan_a"><img src="${ICON}"></a><a class="tw-supporter-user-name"><span>ファンA</span></a>
    <div class="tw-supporter-point-stat"><span class="tw-supporter-point-stat-current">59045</span><span class="tw-supporter-point-stat-total">161145</span></div></div>
</section></body></html>`;

// 1通は配列。[] は生きている印
const FRAMES = [
  [],
  [
    { type: 'comment', id: 33979474901, message: 'わこつ', createdAt: T0 + 1000, author: { id: 'fan_a', name: 'ファンA', screenName: 'fan_a', profileImage: ICON, grade: 1 }, numComments: 889 },
    { type: 'comment', id: 33979474902, message: 'こんばんは', createdAt: T0 + 2000, author: { id: 'c:tw2', name: '匿名コメント', screenName: 'c:tw2', profileImage: ICON, grade: 0 }, isAnonymous: true, numComments: 890 },
  ],
  [{ type: 'gift', id: 'a085f979.6af4ae', message: 'がんばれ(+🍡90)', plainMessage: 'がんばれ', isPaidGift: false, item: { name: '応援スター', image: GIFT_IMG, showsSenderInfo: true }, sender: { id: 'g:1181112', name: 'おうえん', screenName: 'g:1181112', profileImage: ICON, grade: 1 }, createdAt: T0 + 3000, score_items: [{ title: '🍡', text: '90' }] }],
  [{ type: 'gift', id: 'b11', message: '(+🍡20)', plainMessage: '', isPaidGift: false, item: { name: 'お茶ｘ10', image: GIFT_IMG, showsSenderInfo: true }, sender: { id: 'twitcastinguest', name: '匿名さん', screenName: 'twitcastinguest' }, createdAt: T0 + 4000, score_items: [{ title: '🍡', text: '20' }] }],
  [{ type: 'gift', id: 'c22', message: '', plainMessage: '', isPaidGift: true, item: { name: 'お茶爆100', image: GIFT_IMG, showsSenderInfo: true }, sender: { id: 'fan_a', name: 'ファンA', screenName: 'fan_a', profileImage: ICON }, createdAt: T0 + 5000, score_items: [{ title: '🍡', text: '✨' }] }],
  // 配信者のスコアのお知らせ・レイドは記録しない
  [{ type: 'gift', id: 'd33', message: 'スコア', item: { name: '', showsSenderInfo: false }, sender: { id: USER, name: 'はいしんしゃ', screenName: USER }, createdAt: T0 + 6000 }],
  [{ type: 'raid', id: '842841215::1', mode: 'push', movieId: MOVIE, broadcaster: { id: USER }, createdAt: T0 + 7000 }],
];

const WANT_ROWS = [
  'superchat:tc:fan_a:ファンA:お茶爆100:0:TCSCORE:face',
  'superchat:tc:g:1181112:おうえん:がんばれ:90:TCSCORE:face',
  'superchat:tc:n:匿名:匿名さん:お茶ｘ10:20:TCSCORE:-',
  'text:tc:fan_a:ファンA:わこつ:0::face',
  'text:tc:n:匿名:匿名コメント:こんばんは:0::-',
];

function startFakeSocket() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-ws-'));
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', `/CN=${WS_HOST}`, '-addext', `subjectAltName=DNS:${WS_HOST}`], { stdio: 'ignore' });
  const server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) });
  const wss = new WebSocketServer({ server });
  /** @type {string[]} */
  const paths = [];
  wss.on('connection', (ws, req) => {
    paths.push(String(req.url));
    setTimeout(() => FRAMES.forEach((m) => ws.send(JSON.stringify(m))), 1000);
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

test('ツイキャスのコメント・ギフト(🍡)・ページの数を記録し、未ログインの送信は止める', async ({ context, sock }) => {
  const state = { live: true, signedIn: true };
  /** @type {string[]} */
  const pubsubBodies = [];
  /** @type {string[]} */
  const ssCalls = [];
  await context.route('https://imagegw02.twitcasting.tv/**', (route) => route.fulfill({ status: 404, body: '' }));
  await context.route('https://twitcasting.tv/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const json = (/** @type {any} */ body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (u.pathname === '/streamserver.php') {
      ssCalls.push(String(state.live));
      if (u.searchParams.get('target') !== USER) return route.fulfill({ status: 400, body: '' });
      return json({ movie: { id: MOVIE, live: state.live }, hls: {}, 'tc-hls': {} });
    }
    if (u.pathname === '/eventpubsuburl.php') {
      pubsubBodies.push(String(req.postData() || ''));
      return json({ url: `wss://${WS_HOST}/event.pubsub/v1/streams/${MOVIE}/events?token=abc:::1794400000:xyz&n=0.12` });
    }
    if (u.pathname === `/${USER}/supporter`) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: SUPPORTER_HTML });
    if (u.pathname.startsWith('/img/')) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: pageHtml(state) });
  });

  const sw = await extWorker(context);
  const page = await context.newPage();
  await page.goto(`https://twitcasting.tv/${USER}`);

  // 記録: 匿名はまとめて1席・🍡はページの数・有料ギフト(✨)は 0・お知らせとレイドは記録しない
  await expect.poll(() => readRows(sw), { timeout: 30_000 }).toEqual(WANT_ROWS);
  // つなぎ先は movie_id を送って取り、gift=1 を付けてつなぐ
  expect(pubsubBodies.join('\n')).toContain(String(MOVIE));
  expect(/** @type {any} */ (sock).paths.some((p) => p.startsWith(`/event.pubsub/v1/streams/${MOVIE}/events?`) && /[?&]gift=1(?:&|$)/.test(p))).toBe(true);

  const tcDiag = async () => (await sw.evaluate(async () => chrome.storage.local.get('yt_diag_tc_chat'))).yt_diag_tc_chat || {};
  await expect
    .poll(async () => {
      const d = await tcDiag();
      return { wsState: d.wsState, giftParam: d.giftParam, comments: d.comments, gifts: d.gifts, keepAlive: d.keepAlive >= 1, raid: d.types?.raid, tab: /^[a-z0-9]{4,}$/.test(String(d.tab || '')) };
    }, { timeout: 15_000 })
    .toEqual({ wsState: 'open', giftParam: true, comments: 2, gifts: 3, keepAlive: true, raid: 1, tab: true });

  // 公式のサポーターランキング(現在のレベルのアイテムスコアの順)が、他サービスの公式ランキングと同じ置き場に入る
  await expect.poll(async () => (await sw.evaluate(async (key) => (await chrome.storage.local.get(`yt_leaderboard_${key}`))[`yt_leaderboard_${key}`], KEY))?.rows?.length || 0, { timeout: 15_000 }).toBe(2);
  const board = await sw.evaluate(async (key) => (await chrome.storage.local.get(`yt_leaderboard_${key}`))[`yt_leaderboard_${key}`], KEY);
  expect(board).toMatchObject({ period: 'LEVEL', rows: [{ rank: 1, name: 'おうえん', xp: 90815, iconUrl: ICON }, { rank: 2, name: 'ファンA', xp: 59045, iconUrl: ICON }] });
  expect(await tcDiag()).toMatchObject({ boardRows: 2, supporterLevel: 30 });

  // 配信のまとめ(題・配信者・開始時刻・ページの視聴者数)
  await expect.poll(async () => String((await readStreamSummary(sw, KEY))?.title || ''), { timeout: 15_000 }).toBe('ざつだんキャス');
  const sum = await readStreamSummary(sw, KEY);
  expect(sum).toMatchObject({ broadcasterName: 'はいしんしゃ', broadcasterHandle: USER });
  expect(Number(sum.startedAt)).toBe(T0);

  // 送信: ログイン中は入力欄に書いて送る
  const ext = await context.newPage();
  await ext.goto(`${sw.url().replace(/\/[^/]*$/, '')}/yt-sidepanel.html?inline=1&dock=sidepanel&stream=${encodeURIComponent("twitcasting:c:hostuser")}`); // 実際のサイドパネルと同じ src(ytPanelRoute)
  const res = await ext.evaluate((key) => chrome.runtime.sendMessage({ type: 'YT_SEND_COMMENT', videoId: key, text: 'こんにちは ツイキャス' }), KEY);
  expect(res).toMatchObject({ ok: true });
  expect(await page.evaluate(() => /** @type {any} */ (window).__sent)).toEqual(['こんにちは ツイキャス']);

  // ニコ生版の画面にツイキャスのコメント・配信が出る・言葉はツイキャスの言葉・ページの数がそのまま出る
  await page.bringToFront();
  await ext.reload();
  await page.bringToFront();
  const bodyText = () => ext.evaluate(() => document.body.innerText);
  for (const want of ['ファンA', 'はいしんしゃ', 'おうえん']) {
    await expect.poll(bodyText, { timeout: 30_000 }).toContain(want);
  }
  const text = await bodyText();
  expect(text).not.toMatch(/tc:fan|tc\.c:|スパチャ|スーパーチャット|トップファン|ギフトサブ/);
  const chip = (/** @type {string} */ k) => ext.evaluate((key) => {
    const el = document.querySelector(`[data-nl-metric="${key}"]`);
    return el ? `${el.textContent}|${el.getAttribute('title') || ''}` : '';
  }, k);
  await expect.poll(() => chip('totalViews'), { timeout: 45_000 }).toContain('4,567');
  // ギフト貢献度の欄はツイキャス公式のサポーターランキング(スコア)
  await expect.poll(bodyText, { timeout: 30_000 }).toContain('90,815 スコア');
  expect(await bodyText()).toContain('ツイキャス 公式のサポーターランキング（現在のレベル）');
  expect(await bodyText()).not.toContain('チャット欄');
  // 段の案内・「該当者なし」にニコ生の数値ID・匿名(a:)の話を残さない(2026-11-12 実ページで発見)
  expect(await bodyText()).not.toMatch(/数値ユーザーID|数値ID|匿名（a:）/);
  expect(await chip('commentTotal')).toContain('890');
  // ギフト履歴の送り主: 値段の出ない有料ギフト(✨)だけの人も並ぶ(数は作らずギフトの名前)。単位は公式と同じ「スコア」(2026-11-12 実配信で発見)
  const giftLane = () => ext.evaluate(() => {
    const body = document.getElementById('northStarLaneBody-giftHistory');
    return [...(body?.querySelectorAll('[role="listitem"]') || [])].map((li) => String(li.textContent || '').replace(/\s+/g, ' ').trim());
  });
  await expect.poll(async () => (await giftLane()).join(' / '), { timeout: 30_000 }).toMatch(/お茶爆100 @fan_a ファンA/);
  const laneText = (await giftLane()).join(' / ');
  expect(laneText).toMatch(/90 スコア/);
  expect(laneText).not.toMatch(/\d\s*pt\b/);
  expect(await bodyText()).not.toMatch(/推定|広告pt|来場者数/);
  await ext.locator('[data-nl-metric="totalViews"]').locator('xpath=..').screenshot({ path: 'test-results/twitcasting-official-chips.png' });
  await ext.screenshot({ path: 'test-results/twitcasting-sidepanel.png', fullPage: true });

  // 未ログイン: 欄が無く not_logged_in。打たずに理由を返す
  state.signedIn = false;
  const before = ssCalls.length;
  await page.reload();
  // 読み直したページがもう一度読み始めるまで待つ(配信中のまま)
  await expect.poll(() => ssCalls.length, { timeout: 15_000 }).toBeGreaterThan(before);
  const res2 = await ext.evaluate((key) => chrome.runtime.sendMessage({ type: 'YT_SEND_COMMENT', videoId: key, text: 'みえないはず' }), KEY);
  expect(res2).toMatchObject({ ok: false, reason: 'not-signed-in' });

  // 配信が終わったら(streamserver の live=false)終わった時刻を送る
  state.live = false;
  await expect
    .poll(async () => Number((await readStreamSummary(sw, KEY))?.endedAt || 0), { timeout: 70_000 })
    .toBeGreaterThan(0);
});
