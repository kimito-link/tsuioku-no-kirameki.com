// twitch-recording.spec.js — Twitch の配信ページを開くと、チャット(IRC)を記録し、サイドパネル側からコメントを送れるか
//   (council/twitch-support-PLAN.md・計器で確かめる: りんくに見え方を聞かない)。
//
// 本物の Twitch には出ない(CI もクラウドも出られない):
//   - www.twitch.tv のページ・gql.twitch.tv の応答 → Playwright の route で差し替え
//   - irc-ws.chat.twitch.tv の WebSocket → 拡張の content script(隔離された世界)の WebSocket は Playwright の
//     routeWebSocket では捕まらないので、Chromium の名前解決を 127.0.0.1 に向け、手元の TLS の WebSocket で
//     Twitch の IRC の役をする(行の形は Twitch 公式の IRC の説明どおり)。
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

const LOGIN = 'testchan';
const STREAM_ID = '41234567890';
const KEY = `tw.${LOGIN}.${STREAM_ID}`;

const LINES = [
  `@badges=;color=#1E90FF;display-name=ファンA;id=m-1;room-id=99;tmi-sent-ts=1762480000123;user-id=1001 :fan_a!fan_a@fan_a.tmi.twitch.tv PRIVMSG #${LOGIN} :わこつ`,
  `@badges=;bits=500;color=;display-name=Bitter;id=m-2;room-id=99;tmi-sent-ts=1762480001123;user-id=1002 :bitter!bitter@bitter.tmi.twitch.tv PRIVMSG #${LOGIN} :Cheer500 おめでとう`,
  `@badges=subscriber/0;display-name=NewSub;id=m-3;login=newsub;msg-id=sub;msg-param-sub-plan=1000;room-id=99;system-msg=NewSub\\ssubscribed;tmi-sent-ts=1762480002123;user-id=1003 :tmi.twitch.tv USERNOTICE #${LOGIN}`,
  `@badges=;display-name=Other;id=m-4;room-id=7;tmi-sent-ts=1762480003123;user-id=1004 :other!other@other.tmi.twitch.tv PRIVMSG #otherchan :別のチャンネル`,
];

const PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>${LOGIN} - Twitch</title></head><body>
<div data-a-target="chat-input"><div contenteditable="true" id="in"></div></div>
<button data-a-target="chat-send-button" id="send">チャット</button>
<script>
  window.__sent = [];
  document.getElementById('send').addEventListener('click', () => {
    const el = document.getElementById('in');
    window.__sent.push(el.textContent);
    el.textContent = '';
  });
</script></body></html>`;

/** 手元の TLS の WebSocket(Twitch の IRC の役)を立てる */
function startFakeIrc() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-irc-'));
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=irc-ws.chat.twitch.tv', '-addext', 'subjectAltName=DNS:irc-ws.chat.twitch.tv'], { stdio: 'ignore' });
  const server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) });
  const wss = new WebSocketServer({ server });
  /** @type {string[]} */
  const received = [];
  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      const text = String(data);
      received.push(text);
      if (text.startsWith(`JOIN #${LOGIN}`)) {
        ws.send(`:justinfan!justinfan@justinfan.tmi.twitch.tv JOIN #${LOGIN}\r\n`);
        setTimeout(() => ws.send(LINES.join('\r\n') + '\r\n'), 300);
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = /** @type {any} */ (server.address()).port;
      // 自分で作った証明書を、この試験の Chromium にだけ信じさせる(--ignore-certificate-errors-spki-list)
      const spki = execFileSync('sh', ['-c', `openssl x509 -in '${cert}' -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64`]).toString().trim();
      resolve({ port, spki, received, close: () => new Promise((r) => { wss.close(); server.close(() => r(undefined)); }) });
    });
  });
}

const test = base.extend({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture API
  irc: async ({}, use) => {
    const irc = await startFakeIrc();
    await use(irc);
    await /** @type {any} */ (irc).close();
  },
  context: async ({ irc }, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      ignoreHTTPSErrors: true,
      // Chromium は Linux で環境変数のプロキシを使う。手元の偽 IRC(127.0.0.1)へ直接つなぐため、この試験のブラウザには渡さない
      env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(?:https?|all)_proxy$/i.test(k))),
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        `--host-resolver-rules=MAP irc-ws.chat.twitch.tv:443 127.0.0.1:${/** @type {any} */ (irc).port}`,
        `--ignore-certificate-errors-spki-list=${/** @type {any} */ (irc).spki}`,
        '--ignore-certificate-errors',
        '--no-proxy-server',
        // 公開のページ(twitch.tv)から 127.0.0.1 へつなぐのを Chromium の「ローカルネットワークへの接続の確認」が止めるので、この試験だけ外す
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

test('Twitch のチャットを記録し、送信も届く', async ({ context, irc }) => {
  /** @type {string[]} */
  const gqlBodies = [];
  await context.route('https://www.twitch.tv/**', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE_HTML }));
  await context.route('https://gql.twitch.tv/**', async (route) => {
    const body = String(route.request().postData() || '');
    gqlBodies.push(body);
    const json = body.includes('users(logins')
      ? { data: { users: [{ login: 'fan_a', profileImageURL: 'https://static-cdn.jtvnw.net/jtv_user_pictures/fan_a-70x70.png' }] } }
      : {
          data: {
            user: {
              id: '99', login: LOGIN, displayName: 'テストちゃん', profileImageURL: 'https://static-cdn.jtvnw.net/jtv_user_pictures/x-70x70.png',
              broadcastSettings: { title: 'テスト配信' },
              stream: { id: STREAM_ID, createdAt: '2026-11-07T10:00:00Z', viewersCount: 12 },
            },
          },
        };
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(json) });
  });
  await context.route('https://static-cdn.jtvnw.net/**', (route) => route.fulfill({ status: 404, body: '' }));

  const sw = await extWorker(context);
  const page = await context.newPage();
  await page.goto(`https://www.twitch.tv/${LOGIN}`);

  // 記録(IndexedDB yt_kirameki_db)に、このチャンネルの3件だけが入る(別のチャンネルの行は入れない)
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
      'membership:NewSub:サブスク Tier 1:0::-',
      'superchat:Bitter:おめでとう:500:BITS:-',
      'text:ファンA:わこつ:0::face',
    ]);

  // 配信のまとめ(配信者・同接・開始時刻)
  const sum = await sw.evaluate(async (key) => (await chrome.storage.local.get('yt_stream_summaries')).yt_stream_summaries?.[key], KEY);
  expect(sum).toMatchObject({ title: 'テスト配信', broadcasterName: 'テストちゃん', broadcasterHandle: LOGIN, concurrentViewers: 12 });
  expect(Number(sum.startedAt)).toBe(Date.parse('2026-11-07T10:00:00Z'));

  // 読み取り専用の名前でつないでいる(ログインの情報を送らない)
  expect(irc.received.some((l) => /^NICK justinfan\d+/.test(l))).toBe(true);
  expect(irc.received.some((l) => /oauth:/i.test(l))).toBe(false);

  // サイドパネル・会場と同じ口(YT_SEND_COMMENT)から送ると、Twitch の入力欄に書かれて送信ボタンが押される
  const ext = await context.newPage();
  await ext.goto(`${sw.url().replace(/\/[^/]*$/, '')}/yt-sidepanel.html`);
  const res = await ext.evaluate((key) => chrome.runtime.sendMessage({ type: 'YT_SEND_COMMENT', videoId: key, text: 'こんにちは Twitch' }), KEY);
  expect(res).toMatchObject({ ok: true });
  expect(await page.evaluate(() => /** @type {any} */ (window).__sent)).toEqual(['こんにちは Twitch']);

  // ニコ生版の画面(yt-sidepanel.html)に、Twitch のコメントと配信者が出る
  await page.bringToFront();
  await ext.reload();
  await page.bringToFront();
  const bodyText = () => ext.evaluate(() => document.body.innerText);
  for (const want of ['ファンA', 'テストちゃん', '500 Bits', '@bitter']) {
    // 人の見分けは @ログイン名(tw:数字 を出さない)
    await expect.poll(bodyText, { timeout: 30_000 }).toContain(want);
  }
  const text = await bodyText();
  expect(text).not.toMatch(/tw:\d/);
  expect(text).not.toContain('データ源: youtube');
});
