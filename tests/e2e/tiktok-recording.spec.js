// tiktok-recording.spec.js — TikTok LIVE の配信ページを開くと、ページ自身のソケットの受信を写してコメント・ギフト・
//   配信中の順位を記録し、サイドパネル側からコメントを送れるか。ログインしていない(ソケットが開かない)ときは
//   計器とページに理由を出すか(council/tiktok-support-PLAN.md・計器で確かめる: りんくに見え方を聞かない)。
//
// 本物の TikTok には出ない(CI もクラウドも出られない):
//   - www.tiktok.com のページと /api-live/user/room/・webcast.tiktok.com の gift/list → Playwright の route で差し替え
//   - webcast-ws.tiktok.com のソケット → Chromium の名前解決を 127.0.0.1 に向け、手元の TLS の WebSocket で役をする
//   形(PushFrame・gzip・番号)は 2026-11-09 の PC 実測(本物・ログイン済み・値抜き)から写した(値は作りもの)。
import { test as base, chromium, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import https from 'node:https';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../../extension');

const UNIQUE = 'some.user';
const ROOM = '7571234567890123456';
const KEY = `tt.${UNIQUE}.${ROOM}`;
const OTHER = 'quiet.user';
const OTHER_ROOM = '7579999999999999999';
const WS_HOST = 'webcast-ws.tiktok.com';
const T0 = Date.now();
const AV = 'https://p16-sign-sg.tiktokcdn.com/aweme/100x100/a.webp';
const GIMG = 'https://p16-webcast.tiktokcdn.com/img/alisg/webcast-sg/resource/rose.png~tplv-obj.webp';

// ---- protobuf の小さな書き手 ----
const enc = new TextEncoder();
/** @param {bigint|number} v */
function varint(v) {
  let x = BigInt(v);
  const out = [];
  do {
    let b = Number(x & 0x7fn);
    x >>= 7n;
    if (x) b |= 0x80;
    out.push(b);
  } while (x);
  return out;
}
/** @param {number} no @param {bigint|number} v */
const fv = (no, v) => [...varint((no << 3) | 0), ...varint(v)];
/** @param {number} no @param {number[]|Uint8Array|string} b */
const fb = (no, b) => {
  const bytes = typeof b === 'string' ? [...enc.encode(b)] : [...b];
  return [...varint((no << 3) | 2), ...varint(bytes.length), ...bytes];
};
/** @param {string|number} id @param {string} nick @param {string} unique */
const user = (id, nick, unique) => [...fv(1, BigInt(id)), ...fb(3, nick), ...fb(9, fb(1, AV)), ...fb(38, unique)];
const common = (/** @type {number} */ ms) => fb(1, fv(4, ms));
const chat = (/** @type {string} */ uid, /** @type {string} */ nick, /** @type {string} */ text, /** @type {number} */ ms) => [...common(ms), ...fb(2, user(uid, nick, `u${uid}`)), ...fb(3, text)];
/** @param {{ uid: string, nick: string, giftId: number, count: number, end?: boolean, group: number, type: number, diamond: number, en: string, ms: number }} o */
const gift = (o) => [
  ...common(o.ms),
  ...fv(2, o.giftId),
  ...(o.end ? [] : fv(3, 1)),
  ...fv(5, o.count),
  ...fb(7, user(o.uid, o.nick, `u${o.uid}`)),
  ...(o.end ? fv(9, 1) : []),
  ...fv(11, o.group),
  ...fb(15, [...fb(1, fb(1, GIMG)), ...fv(5, o.giftId), ...fv(11, o.type), ...fv(12, o.diamond), ...fb(16, o.en)]),
];
const seq = (/** @type {number} */ viewers) => [
  ...fb(2, [...fv(1, 900), ...fb(2, user('31', 'おおもの', 'u31')), ...fv(3, 1)]),
  ...fb(2, [...fv(1, 3), ...fb(2, user('21', 'ばらのひと', 'u21')), ...fv(3, 2)]),
  ...fv(3, viewers),
];
/** @param {[string, number[], number][]} msgs 型・中身・msgId */
const frame = (msgs) => {
  const body = msgs.flatMap(([type, payload, id]) => fb(1, [...fb(1, type), ...fb(2, payload), ...fv(3, id)]));
  return Buffer.from([...fv(1, 1), ...fv(2, 99), ...fb(6, 'pb'), ...fb(7, 'msg'), ...fb(8, zlib.gzipSync(Buffer.from(body)))]);
};
const FRAMES = [
  frame([
    ['WebcastChatMessage', chat('11', 'ファンA', 'わこつ', T0 + 1000), 1001],
    ['WebcastMemberMessage', [...fb(2, user('12', 'ファンB', 'u12')), ...fv(3, 70)], 1002],
  ]),
  // 同じコメント(同じ msgId)は重ねない
  frame([['WebcastChatMessage', chat('11', 'ファンA', 'わこつ', T0 + 1000), 1001]]),
  // 連打のバラ(一覧で combo)= 1・2・3(終わり)で 3 個を1回だけ
  frame([['WebcastGiftMessage', gift({ uid: '21', nick: 'ばらのひと', giftId: 5655, count: 1, group: 1, type: 1, diamond: 1, en: 'Rose', ms: T0 + 2000 }), 2001]]),
  frame([['WebcastGiftMessage', gift({ uid: '21', nick: 'ばらのひと', giftId: 5655, count: 2, group: 1, type: 1, diamond: 1, en: 'Rose', ms: T0 + 2100 }), 2002]]),
  frame([['WebcastGiftMessage', gift({ uid: '21', nick: 'ばらのひと', giftId: 5655, count: 3, end: true, group: 1, type: 1, diamond: 1, en: 'Rose', ms: T0 + 2200 }), 2003]]),
  // 連打できないライオン(一覧で combo=false)は終わりの印なしで数える
  frame([['WebcastGiftMessage', gift({ uid: '31', nick: 'おおもの', giftId: 6064, count: 1, group: 2, type: 2, diamond: 500, en: 'Lion', ms: T0 + 3000 }), 3001]]),
  // 一覧に無い連打(type 1)で終わりの印が来ない → 待ってから最後の数で・名前は英語の控え
  frame([['WebcastGiftMessage', gift({ uid: '41', nick: 'ふしぎ', giftId: 9999, count: 2, group: 3, type: 1, diamond: 5, en: 'Mystery', ms: T0 + 4000 }), 4001]]),
  frame([
    ['WebcastRoomUserSeqMessage', seq(77), 5001],
    ['WebcastChatMessage', chat('12', 'ファンB', 'こんばんは', T0 + 5000), 5002],
    // スタンプだけのコメント(本文の field 3 が無く field 13 にスタンプ・2026-11-09 PC 実測の形)
    ['WebcastChatMessage', [...common(T0 + 5100), ...fb(2, user('13', 'ファンC', 'u13')), ...fb(13, [...fv(1, 0), ...fb(2, [...fb(1, '7300000000000000001'), ...fb(2, fb(1, GIMG))])])], 5003],
  ]),
];
const GIFT_LIST = {
  data: {
    gifts: [
      { id: 5655, name: 'バラ', diamond_count: 1, combo: true, type: 1, image: { url_list: [GIMG] } },
      { id: 6064, name: 'ライオン', diamond_count: 500, combo: false, type: 2, image: { url_list: [GIMG] } },
    ],
  },
};
const WANT_ROWS = [
  'superchat:tt:21:ばらのひと:バラ ×3:3:TTCOIN:face',
  'superchat:tt:31:おおもの:ライオン:500:TTCOIN:face',
  'superchat:tt:41:ふしぎ:Mystery ×2:10:TTCOIN:face',
  'text:tt:11:ファンA:わこつ:0::face',
  'text:tt:12:ファンB:こんばんは:0::face',
  'text:tt:13:ファンC:[スタンプ]:0::face',
];

/** @param {boolean} socket ログイン済み(ページがコメントのソケットを開く) @param {string} room */
const pageHtml = (socket, room) => `<!doctype html><html><head><meta charset="utf-8"><title>TikTok LIVE</title></head><body>
<div data-e2e="live-chat-input-container"><div data-e2e="room-chat-input-field" contenteditable="plaintext-only" placeholder="${socket ? '入力...' : 'コメントをオフにする'}"></div>
<div data-e2e="room-chat-send-btn" id="send">送信</div></div>
<script>
  window.__sent = [];
  document.getElementById('send').addEventListener('click', () => {
    const el = document.querySelector('[data-e2e="room-chat-input-field"]');
    window.__sent.push(el.innerText.trim());
    el.textContent = '';
  });
  ${socket ? `fetch('https://webcast.tiktok.com/webcast/gift/list/?aid=1988&room_id=${room}&X-Bogus=x', { credentials: 'include' })
    .then((r) => r.json())
    .then(() => {
      const ws = new WebSocket('wss://${WS_HOST}/webcast/im/ws_proxy/ws_reuse_supplement/?aid=1988&room_id=${room}&X-Bogus=x');
      ws.binaryType = 'arraybuffer';
      ws.onmessage = () => { window.__pageGot = (window.__pageGot || 0) + 1; };
    });` : ''}
</script></body></html>`;

function startFakeSocket() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-ws-'));
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', `/CN=${WS_HOST}`, '-addext', `subjectAltName=DNS:${WS_HOST}`], { stdio: 'ignore' });
  const server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) });
  const wss = new WebSocketServer({ server });
  /** @type {string[]} */
  const paths = [];
  wss.on('connection', (ws, req) => {
    paths.push(String(req.url));
    // 拡張の入口(document_idle)より先に届く分も出るよう、すぐ送り始める
    FRAMES.forEach((f, i) => setTimeout(() => ws.send(f), 200 + i * 150));
    // ハートビート(hb)は読まない
    setTimeout(() => ws.send(Buffer.from([...fb(6, 'pb'), ...fb(7, 'hb'), ...fb(8, [1])])), 100);
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

test('TikTok のコメント・ギフト・配信中の順位を記録し、送信も届く・未ログインは理由を出す', async ({ context, sock }) => {
  test.setTimeout(150_000);
  let live = true;
  /** @type {Record<string, number>} 配信の情報の口を読んだ回数(名前ごと) */
  const infoCalls = {};
  await context.route(/^https:\/\/[^/]*tiktokcdn\.com\//, (route) => route.fulfill({ status: 404, body: '' }));
  await context.route('https://webcast.tiktok.com/**', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/webcast/gift/list/') return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': 'https://www.tiktok.com', 'access-control-allow-credentials': 'true' }, body: JSON.stringify(GIFT_LIST) });
    return route.fulfill({ status: 404, body: '' });
  });
  await context.route('https://www.tiktok.com/**', async (route) => {
    const u = new URL(route.request().url());
    const json = (/** @type {any} */ body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (u.pathname === '/api-live/user/room/') {
      const who = String(u.searchParams.get('uniqueId') || '');
      infoCalls[who] = (infoCalls[who] || 0) + 1;
      const room = who === OTHER ? OTHER_ROOM : ROOM;
      const on = who === OTHER || live;
      return json({
        data: {
          liveRoom: { status: on ? 2 : 4, title: who === OTHER ? 'しずかな配信' : 'ざつだん配信', startTime: Math.floor(T0 / 1000) - 60, liveRoomStats: { userCount: 50, enterCount: 300 } },
          user: { id: who === OTHER ? '6900000000000000002' : '6900000000000000001', roomId: room, nickname: who === OTHER ? 'しずか' : 'はいしんしゃ', uniqueId: who, avatarThumb: AV, status: on ? 2 : 4 },
        },
        statusCode: 0,
      });
    }
    if (u.pathname.startsWith('/api-live/')) return route.fulfill({ status: 404, body: '' });
    const signedIn = u.pathname.startsWith(`/@${UNIQUE}/`);
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: pageHtml(signedIn, signedIn ? ROOM : OTHER_ROOM) });
  });

  const sw = await extWorker(context);
  const page = await context.newPage();
  await page.goto(`https://www.tiktok.com/@${UNIQUE}/live`);

  // 記録: 同じ msgId は1件・連打は終わりに1回・連打できないものはすぐ・終わりの印が来ない連打は待ってから
  await expect.poll(() => readRows(sw), { timeout: 40_000 }).toEqual(WANT_ROWS);
  expect(/** @type {any} */ (sock).paths.some((p) => p.includes(`room_id=${ROOM}`))).toBe(true);
  // ページ自身の受信は止めていない(写すだけ)
  expect(await page.evaluate(() => /** @type {any} */ (window).__pageGot)).toBe(FRAMES.length + 1);

  const ttDiag = async () => (await sw.evaluate(async () => chrome.storage.local.get('yt_diag_tt_chat'))).yt_diag_tt_chat || {};
  await expect
    .poll(async () => {
      const d = await ttDiag();
      return { wsState: d.wsState, giftCoin: d.giftCoin, giftList: d.giftList, boardRows: d.boardRows, comboTimeouts: d.comboTimeouts, gzipFail: d.gzipFail, stopReason: d.stopReason, chats: d.types?.WebcastChatMessage, noText: d.dropReasons?.['chat:no-text'] || 0 };
    }, { timeout: 15_000 })
    .toEqual({ wsState: 'open', giftCoin: 513, giftList: 2, boardRows: 2, comboTimeouts: 1, gzipFail: 0, stopReason: '', chats: 4, noText: 0 });

  // 配信中の視聴者の順位(score つき)が YouTube のトップファンと同じ置き場に入る
  const board = await sw.evaluate(async (key) => (await chrome.storage.local.get(`yt_leaderboard_${key}`))[`yt_leaderboard_${key}`], KEY);
  expect(board.rows).toEqual([
    { rank: 1, name: 'おおもの', xp: 900, iconUrl: AV },
    { rank: 2, name: 'ばらのひと', xp: 3, iconUrl: AV },
  ]);
  // ギフトの絵
  const giftImages = await sw.evaluate(
    (/** @type {string} */ key) =>
      new Promise((resolve) => {
        const req = indexedDB.open('yt_kirameki_db');
        req.onsuccess = () => {
          const all = req.result.transaction('comments').objectStore('comments').index('by_videoId').getAll(IDBKeyRange.only(key));
          all.onsuccess = () => resolve(all.result.filter((/** @type {any} */ r) => r.kind === 'superchat').every((/** @type {any} */ r) => /tiktokcdn/.test(String(r.giftImageUrl || ''))));
        };
      }),
    KEY,
  );
  expect(giftImages).toBe(true);

  // 配信のまとめ(題・配信者・開始時刻・視聴数はソケットの値)
  await expect
    .poll(async () => (await sw.evaluate(async (key) => (await chrome.storage.local.get('yt_stream_summaries')).yt_stream_summaries?.[key], KEY))?.concurrentViewers, { timeout: 40_000 })
    .toBe(77);
  const sum = await sw.evaluate(async (key) => (await chrome.storage.local.get('yt_stream_summaries')).yt_stream_summaries?.[key], KEY);
  expect(sum).toMatchObject({ title: 'ざつだん配信', broadcasterName: 'はいしんしゃ', broadcasterHandle: UNIQUE, broadcasterChannelId: 'tt:6900000000000000001' });
  expect(Number(sum.startedAt)).toBe((Math.floor(T0 / 1000) - 60) * 1000);

  // 送信: 入力欄(contenteditable)に書いて送信ボタン
  const ext = await context.newPage();
  await ext.goto(`${sw.url().replace(/\/[^/]*$/, '')}/yt-sidepanel.html`);
  const res = await ext.evaluate((key) => chrome.runtime.sendMessage({ type: 'YT_SEND_COMMENT', videoId: key, text: 'こんにちは TikTok' }), KEY);
  expect(res).toMatchObject({ ok: true });
  expect(await page.evaluate(() => /** @type {any} */ (window).__sent)).toEqual(['こんにちは TikTok']);

  // ニコ生版の画面に TikTok のコメント・配信・ギフトが出る・言葉は TikTok の言葉
  await page.bringToFront();
  await ext.reload();
  await page.bringToFront();
  const bodyText = () => ext.evaluate(() => document.body.innerText);
  for (const want of ['ファンA', 'はいしんしゃ', 'おおもの']) {
    await expect.poll(bodyText, { timeout: 30_000 }).toContain(want);
  }
  expect(await bodyText()).not.toMatch(/tt:\d|tt\.some|スパチャ|スーパーチャット|ギフトサブ/);

  // 配信が終わったら(status 4)終わった時刻を送る
  live = false;
  await expect
    .poll(async () => Number((await sw.evaluate(async (key) => (await chrome.storage.local.get('yt_stream_summaries')).yt_stream_summaries?.[key], KEY))?.endedAt || 0), { timeout: 45_000 })
    .toBeGreaterThan(0);
  // 配信が終わったページを開いたままでも、毎秒は読みに行かない(2026-11-09 PC 実測: 1 秒おきに読み 403 になった)
  const callsAtEnd = infoCalls[UNIQUE] || 0;
  await page.waitForTimeout(8000);
  expect((infoCalls[UNIQUE] || 0) - callsAtEnd).toBeLessThanOrEqual(1);

  // 未ログイン(ページがコメントのソケットを開かない)= 20 秒で計器に理由・ページの右下に知らせ・送信は打たずに理由
  await page.goto(`https://www.tiktok.com/@${OTHER}/live`);
  await expect.poll(async () => { const d = await ttDiag(); return `${d.streamKey}|${d.stopReason}`; }, { timeout: 45_000 }).toBe(`tt.${OTHER}.${OTHER_ROOM}|login-required`);
  await expect(page.locator('#nl-tt-login-note')).toContainText('ログイン', { timeout: 10_000 });
  const res2 = await ext.evaluate((key) => chrome.runtime.sendMessage({ type: 'YT_SEND_COMMENT', videoId: key, text: 'みえないはず' }), `tt.${OTHER}.${OTHER_ROOM}`);
  expect(res2).toMatchObject({ ok: false, reason: 'not-signed-in' });
  expect(await page.evaluate(() => /** @type {any} */ (window).__sent)).toEqual([]);
});
