// twitch-recording.spec.js — Twitch の配信ページを開くと、チャット(IRC)を記録し、サイドパネル側からコメントを送れるか
//   (council/twitch-support-PLAN.md・計器で確かめる: りんくに見え方を聞かない)。
//
// 本物の Twitch には出ない(CI もクラウドも出られない):
//   - www.twitch.tv のページ・gql.twitch.tv の応答 → Playwright の route で差し替え
//   - irc-ws.chat.twitch.tv の WebSocket → 拡張の content script(隔離された世界)の WebSocket は Playwright の
//     routeWebSocket では捕まらないので、Chromium の名前解決を 127.0.0.1 に向け、手元の TLS の WebSocket で
//     Twitch の IRC の役をする(行の形は Twitch 公式の IRC の説明どおり)。
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

const LOGIN = 'testchan';
const STREAM_ID = '41234567890';
const KEY = `tw.${LOGIN}.${STREAM_ID}`;

const LINES = [
  `@badges=;color=#1E90FF;display-name=ファンA;emotes=25:4-8;id=m-1;room-id=99;tmi-sent-ts=1762480000123;user-id=1001 :fan_a!fan_a@fan_a.tmi.twitch.tv PRIVMSG #${LOGIN} :わこつ Kappa`,
  `@badges=;bits=500;color=;display-name=Bitter;id=m-2;room-id=99;tmi-sent-ts=1762480001123;user-id=1002 :bitter!bitter@bitter.tmi.twitch.tv PRIVMSG #${LOGIN} :Cheer500 おめでとう`,
  `@badges=subscriber/0;display-name=NewSub;id=m-3;login=newsub;msg-id=sub;msg-param-sub-plan=1000;room-id=99;system-msg=NewSub\\ssubscribed;tmi-sent-ts=1762480002123;user-id=1003 :tmi.twitch.tv USERNOTICE #${LOGIN}`,
  `@badges=;display-name=Other;id=m-4;room-id=7;tmi-sent-ts=1762480003123;user-id=1004 :other!other@other.tmi.twitch.tv PRIVMSG #otherchan :別のチャンネル`,
];
// 少し遅れて来る行: まとめてギフトサブ(計器 gifts=5 になる)と、顔の問い合わせが 400ms の待ちに間に合わない人
const LATE_LINES = [
  `@badges=;display-name=Giver;id=m-5;login=giver;msg-id=submysterygift;msg-param-mass-gift-count=5;msg-param-sub-plan=1000;room-id=99;tmi-sent-ts=1762480004123;user-id=1005 :tmi.twitch.tv USERNOTICE #${LOGIN}`,
  `@badges=;color=;display-name=LateFan;id=m-6;room-id=99;tmi-sent-ts=1762480005123;user-id=1006 :late_fan!late_fan@late_fan.tmi.twitch.tv PRIVMSG #${LOGIN} :おそくなりました`,
  // 本文つきのリワード交換は IRC にも来る(名前なし)。Hermes で名前つきを受けているので、こちらは記録しない
  `@badges=;color=;custom-reward-id=rw-1;display-name=ファンA;id=m-7;room-id=99;tmi-sent-ts=1762480006123;user-id=1001 :fan_a!fan_a@fan_a.tmi.twitch.tv PRIVMSG #${LOGIN} :がんばって`,
];
// Hermes(twitch.tv のページが使う通知の口)で届くリワードの交換(名前つき)
const REDEEM = {
  type: 'reward-redeemed',
  data: {
    timestamp: '2026-11-08T11:00:00Z',
    redemption: { id: 'r-1', user: { id: '1001', login: 'fan_a', display_name: 'ファンA' }, channel_id: '99', redeemed_at: '2026-11-08T11:00:01Z', reward: { id: 'rw-1', title: '水を飲んで', cost: 500 }, user_input: 'がんばって', status: 'UNFULFILLED' },
  },
};
// ハイプトレインのレベルアップ・予想の決着(2026-11-08 PC 実測の形から必要な所だけ)
const HYPE = { type: 'hype-train-level-up', data: { time_to_expire: 300, progress: { level: { value: 2, goal: 1000 }, value: 10, goal: 1000, total: 1500 }, hype_train: { id: 'ht-1' } } };
const PRED = {
  type: 'event-updated',
  data: {
    timestamp: '2026-11-08T11:30:00Z',
    event: {
      id: 'p-1', status: 'RESOLVED', title: '勝てる?', winning_outcome_id: 'o-1', ended_at: '2026-11-08T11:30:00Z',
      outcomes: [{ id: 'o-1', title: 'はい', total_points: 3400, total_users: 12 }, { id: 'o-2', title: 'いいえ', total_points: 100, total_users: 3 }],
    },
  },
};
const LATE_ICON = 'https://static-cdn.jtvnw.net/jtv_user_pictures/late_fan-70x70.png';

const PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>${LOGIN} - Twitch</title></head><body>
<button data-a-target="user-menu-toggle">メニュー</button>
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
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=irc-ws.chat.twitch.tv', '-addext', 'subjectAltName=DNS:irc-ws.chat.twitch.tv,DNS:hermes.twitch.tv'], { stdio: 'ignore' });
  const server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) });
  const wss = new WebSocketServer({ server });
  /** @type {string[]} */
  const received = [];
  /** @type {string[]} Hermes で受けた1通 */
  const hermes = [];
  wss.on('connection', (ws, req) => {
    if (String(req.url || '').startsWith('/v1')) {
      // Hermes の役: welcome → 購読に ok → リワードの交換を1件
      hermes.push(`url:${req.url}`);
      ws.send(JSON.stringify({ type: 'welcome', welcome: { keepaliveSec: 10, recoveryUrl: 'x', sessionId: 's' }, id: 'w', timestamp: '' }));
      ws.on('message', (data) => {
        const m = JSON.parse(String(data));
        hermes.push(m?.subscribe?.pubsub?.topic || '');
        if (m.type !== 'subscribe') return;
        ws.send(JSON.stringify({ type: 'subscribeResponse', subscribeResponse: { result: 'ok', subscription: { id: m.subscribe.id } } }));
        const tp = String(m.subscribe.pubsub.topic || '');
        const body = tp.startsWith('community-points') ? REDEEM : tp.startsWith('hype-train') ? HYPE : tp.startsWith('predictions') ? PRED : null;
        if (body) setTimeout(() => ws.send(JSON.stringify({ type: 'notification', notification: { subscription: { id: m.subscribe.id }, type: 'pubsub', pubsub: JSON.stringify(body) } })), 200);
      });
      return;
    }
    ws.on('message', (data) => {
      const text = String(data);
      received.push(text);
      if (text.startsWith(`JOIN #${LOGIN}`)) {
        ws.send(`:justinfan!justinfan@justinfan.tmi.twitch.tv JOIN #${LOGIN}\r\n`);
        setTimeout(() => ws.send(LINES.join('\r\n') + '\r\n'), 300);
        setTimeout(() => ws.send(LATE_LINES.join('\r\n') + '\r\n'), 2500);
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = /** @type {any} */ (server.address()).port;
      // 自分で作った証明書を、この試験の Chromium にだけ信じさせる(--ignore-certificate-errors-spki-list)
      const spki = execFileSync('sh', ['-c', `openssl x509 -in '${cert}' -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64`]).toString().trim();
      resolve({ port, spki, received, hermes, close: () => new Promise((r) => { wss.close(); server.close(() => r(undefined)); }) });
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
        `--host-resolver-rules=MAP irc-ws.chat.twitch.tv:443 127.0.0.1:${/** @type {any} */ (irc).port}, MAP hermes.twitch.tv:443 127.0.0.1:${/** @type {any} */ (irc).port}`,
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
    if (body.includes('late_fan')) await new Promise((r) => setTimeout(r, 1200));
    // 公式の応援ランキング(ChannelLeaderboards・登録済みの問い合わせ)。期間は今月(チャンネルごとに違う)
    const node = (/** @type {number} */ rank, /** @type {number} */ score, /** @type {string} */ login, /** @type {string} */ displayName) => ({ node: { rank, score, user: { id: String(rank), login, displayName } } });
    const json = body.includes('ChannelLeaderboards')
      ? [{ data: { user: { channel: { leaderboardTimePeriod: 'MONTH', leaderboardSet: {
          bits: { items: { edges: [node(1, 123456, 'big_cheer', 'ビッグチア'), node(2, 500, 'bitter', 'Bitter')] } },
          subGift: { items: { edges: [node(1, 25, 'sub_gifter', 'サブギフター')] } },
        } } } } }]
      : body.includes('users(logins')
      ? {
          data: {
            users: [
              { login: 'fan_a', profileImageURL: 'https://static-cdn.jtvnw.net/jtv_user_pictures/fan_a-70x70.png' },
              ...(body.includes('late_fan') ? [{ login: 'late_fan', profileImageURL: LATE_ICON }] : []),
            ],
          },
        }
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
  // 絵文字の画像(1×1 の PNG)。顔は 404 のまま(あとから足したルートが先に効く)
  const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
  await context.route('https://static-cdn.jtvnw.net/emoticons/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: PNG_1PX }),
  );

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
      'membership_gift:Giver:ギフトサブを5件贈りました:0::-',
      'superchat:Bitter:おめでとう:500:BITS:-',
      'text:LateFan:おそくなりました:0::-',
      'text:ファンA:わこつ Kappa:0::face',
      'tw_hype:テストちゃん:ハイプトレインがレベル2になりました:0::-',
      'tw_prediction:テストちゃん:予想「勝てる?」の結果: 「はい」(12人・3,400ポイント):0::-',
      'tw_reward:ファンA:「水を飲んで」を交換しました: がんばって:0::face',
    ]);
  // Hermes にはチャンネルの数字の id で、リワードの話題だけを購読した
  expect(irc.hermes).toContain('community-points-channel-v1.99');
  expect(irc.hermes).toContain('hype-train-events-v2.99');
  expect(irc.hermes).toContain('predictions-channel-v1.99');

  // 計器: ギフトサブは件数で数える(金額 0 を足して常に 0 だった)。間に合わなかった顔はあとで yt_tw_icons に置く
  await expect
    .poll(async () => {
      const b = await sw.evaluate(async () => chrome.storage.local.get(['yt_diag_tw_chat', 'yt_tw_icons']));
      return { gifts: b.yt_diag_tw_chat?.gifts, subs: b.yt_diag_tw_chat?.subs, late: b.yt_tw_icons?.late_fan || '' };
    }, { timeout: 15_000 })
    .toEqual({ gifts: 5, subs: 1, late: LATE_ICON });

  // 配信のまとめ(配信者・同接・開始時刻)
  const sum = await readStreamSummary(sw, KEY);
  // 0.1.1948: 配信ページが「最後に見た配信」を自分で記録する(pfLastStreamUrl.js・SPEC §4-C1)。キーはこのチャンネルのもの
  await expect
    .poll(async () => String((await sw.evaluate(async () => (await chrome.storage.local.get('yt_last_stream_url')).yt_last_stream_url))?.key || ''), { timeout: 10_000 })
    .toContain(KEY.slice(0, KEY.lastIndexOf('.') + 1));
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

  // 未ログイン(ヘッダーにログインボタン)なら、入力欄があっても打たずに理由を返す(Twitch は未ログインでも入力欄を出す)
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.setAttribute('data-a-target', 'login-button');
    b.id = 'login';
    document.body.prepend(b);
  });
  const res2 = await ext.evaluate((key) => chrome.runtime.sendMessage({ type: 'YT_SEND_COMMENT', videoId: key, text: 'みえないはず' }), KEY);
  expect(res2).toMatchObject({ ok: false, reason: 'not-signed-in' });
  expect(await page.evaluate(() => /** @type {any} */ (window).__sent)).toEqual(['こんにちは Twitch']);
  expect((await sw.evaluate(async () => chrome.storage.local.get('yt_diag_tw_send_fail'))).yt_diag_tw_send_fail?.reason).toBe('not-signed-in');
  await page.evaluate(() => document.getElementById('login')?.remove());

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
  // ランキング欄に YouTube の言葉(スパチャ・トップファン)を残さない(2026-11-07 実配信で残っていた)
  expect(text).not.toMatch(/スパチャ|スーパーチャット|トップファン/);
  // Twitch 公式の Bits ランキング(今月)が「ギフト貢献度」の欄に出る・記録から数えた言葉は出さない
  const all = await ext.evaluate(() => document.body.textContent || '');
  expect(all).toContain('Twitch 公式の Bits ランキング（今月）');
  expect(all).toContain('ビッグチア');
  expect(all).toContain('123,456 Bits');
  expect(all).not.toContain('このPCの記録から数えます');
  expect(gqlBodies.some((b) => b.includes('"operationName":"ChannelLeaderboards"') && b.includes('"channelID":"99"'))).toBe(true);
  const d = (await sw.evaluate(async () => chrome.storage.local.get('yt_diag_tw_chat'))).yt_diag_tw_chat;
  expect(d).toMatchObject({ boardRows: 2, boardFrom: 'gql:persisted', boardPeriod: 'MONTH', subBoardRows: 1 });
  // 2つめの公式ランキング(ギフトサブ)は「広告ランキング」の欄に Twitch の言葉で出る(platformSubBoard.js)
  const adLane = () =>
    ext.evaluate(() => {
      const lane = /** @type {HTMLElement | null} */ (document.querySelector('[data-lane="adRanking"]'));
      return lane && !lane.hidden ? String(lane.innerText || '').replace(/\s+/g, ' ') : '';
    });
  await expect.poll(adLane, { timeout: 30_000 }).toContain('サブギフター');
  const lane = await adLane();
  expect(lane).toContain('ギフトサブ ランキング');
  expect(lane).toContain('Twitch 公式のギフトサブ ランキング');
  expect(lane).toContain('25 サブ');
  expect(lane).not.toMatch(/広告|ニコニ|貢/);
  // ギフトサブの人は応援レーンの広告列に入らない(欄だけ)
  expect(await ext.evaluate(() => String(document.getElementById('sceneStoryUserLaneAd')?.textContent || ''))).not.toContain('サブギフター');
  await ext.locator('[data-lane="adRanking"]').screenshot({ path: 'test-results/twitch-sub-board.png' });
  // 「ギフト貢献度」の欄の見出しも中身(公式の Bits ランキング)と同じ名前(記録から数えた「合計順」と書かない)
  await expect
    .poll(() => ext.evaluate(() => String(document.querySelector('[data-lane="contributionRanking"] .nl-north-star-lane__label')?.textContent || '').trim()), { timeout: 10_000 })
    .toBe('Twitch 公式の Bits ランキング');

  // 絵文字(Kappa)は名前 → 画像の対応を覚え、コメントの一覧では画像で見せる。文字は消さない(textContent はそのまま)
  await expect
    .poll(async () => (await sw.evaluate(async () => chrome.storage.local.get('yt_tw_emotes'))).yt_tw_emotes, { timeout: 10_000 })
    .toEqual({ Kappa: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0' });
  expect(d.emotes).toBe(1);
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
      return e ? `${e.textContent}|${e.classList.contains('is-ready')}|${/emoticons\/v2\/25\//.test(/** @type {HTMLElement} */ (e).style.backgroundImage)}|${e.closest('.nl-tl-row__text')?.textContent}` : '';
    }), { timeout: 20_000 })
    .toBe('Kappa|true|true|わこつ Kappa');
});
