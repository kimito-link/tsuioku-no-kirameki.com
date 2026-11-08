// whowatch-recording.spec.js — ふわっちの視聴ページを開くと、配信とコメント(ページ自身が使う API)を記録し、
//   サイドパネル側からコメントを送れるか(council/whowatch-support-PLAN.md・計器で確かめる: りんくに見え方を聞かない)。
//
// 本物のふわっちには出ない(CI もクラウドも出られない):
//   - whowatch.tv のページ・api.whowatch.tv/lives/<番号> の応答 → Playwright の route で差し替え
//   ★応答の形は 2018〜2025 の非公式資料による推定。PC 実測で本物の形が分かったら、ここも本物に合わせる。
import { test as base, chromium, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../../extension');

const LIVE_ID = '24680';
const HOST_ID = 42;
const KEY = `ww.${LIVE_ID}.${HOST_ID}`;

const PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>ふわっち</title></head><body>
<form id="f" class="item-form-area"><textarea placeholder="コメントを入力"></textarea><button type="submit">送信</button></form>
<script>
  window.__sent = [];
  document.getElementById('f').addEventListener('submit', (e) => {
    e.preventDefault();
    const el = document.querySelector('textarea');
    window.__sent.push(el.value);
    el.value = '';
  });
</script></body></html>`;

const test = base.extend({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture API
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(?:https?|all)_proxy$/i.test(k))),
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--no-proxy-server'],
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

const user = (id, name, extra = {}) => ({ id, name, user_path: `w:u${id}`, ...extra });
const LIVE = (status) => ({
  id: Number(LIVE_ID),
  title: 'テストざつだん',
  user: user(HOST_ID, 'テストはいしん', { icon_url: 'https://img.whowatch.tv/u/42.jpg' }),
  started_at: Date.parse('2026-11-08T09:00:00Z'),
  view_count: 33,
  live_status: status,
});
// 新しい順で届く
const FIRST = [
  // アイテムの形は 2026-11-08 の PC 実測(本物)から写した(値は作りもの)
  { id: 106, comment_type: 'BY_PUBLIC', user: user(1, '匿名たぬきB', { is_tanuki: true }), message: 'たぬB', posted_at: Date.parse('2026-11-08T09:00:05Z') },
  { id: 105, comment_type: 'BY_PUBLIC', user: user(1, '匿名たぬきA', { anonymized: true }), message: 'たぬA', posted_at: Date.parse('2026-11-08T09:00:04Z') },
  { id: 107, comment_type: 'BY_SYSTEM', not_escaped: true, user: user(2, 'ふわっち運営'), message: '<b>お知らせ</b>', posted_at: Date.parse('2026-11-08T09:00:06Z') },
  { id: 103, comment_type: 'BY_PLAYITEM', not_escaped: true, user: user(9, 'アイテムさん', { icon_url: 'https://img.whowatch.tv/u/9.jpg' }), message: '<b>アイテムさん</b>が<br>ハートを2個贈りました', item_count: 2, play_item_pattern: { id: 5, name: 'ハート', image_url: 'https://img.whowatch.tv/items/h.png', quantity: 1 }, posted_at: Date.parse('2026-11-08T09:00:03Z') },
  { id: 102, user: user(8, 'ファンB'), message: 'こんばんは', posted_at: Date.parse('2026-11-08T09:00:02Z'), comment_type: 'BY_PUBLIC' },
  { id: 101, user: user(7, 'ファンA', { icon_url: 'https://img.whowatch.tv/u/7.jpg' }), message: 'わこつ', posted_at: Date.parse('2026-11-08T09:00:01Z') },
  { id: 100, message: '形がちがう' },
];
const LATER = [{ id: 104, user: user(7, 'ファンA', { icon_url: 'https://img.whowatch.tv/u/7.jpg' }), message: 'おかえり', posted_at: Date.parse('2026-11-08T09:00:09Z') }];

const WANT_ROWS = [
  'superchat:ww:9:アイテムさん:アイテムさんが ハートを2個贈りました:2:WWITEM:face',
  'text:ww:7:ファンA:おかえり:0::face',
  'text:ww:7:ファンA:わこつ:0::face',
  'text:ww:8:ファンB:こんばんは:0::-',
  'text:ww:n:匿名たぬきA:匿名たぬきA:たぬA:0::-',
  'text:ww:n:匿名たぬきB:匿名たぬきB:たぬB:0::-',
].sort();

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

test('ふわっちの配信とコメントを記録し、送信も届く', async ({ context }) => {
  /** @type {string[]} */
  const asked = [];
  let ended = false;
  await context.route('https://whowatch.tv/**', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE_HTML }));
  await context.route('https://img.whowatch.tv/**', (route) => route.fulfill({ status: 404, body: '' }));
  await context.route('https://api.whowatch.tv/**', async (route) => {
    const req = route.request();
    const cors = { 'Access-Control-Allow-Origin': 'https://whowatch.tv' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    const u = new URL(req.url());
    if (u.pathname !== `/lives/${LIVE_ID}`) return route.fulfill({ status: 404, headers: cors, body: '' });
    const since = Number(u.searchParams.get('last_updated_at') || 0);
    asked.push(String(since));
    const comments = since === 0 ? FIRST : since === 1000 ? LATER : [];
    const body = { live: LIVE(ended ? 'FINISHED' : 'PUBLISHING'), comments, updated_at: since === 0 ? 1000 : 2000 };
    return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
  });

  const sw = await extWorker(context);
  const page = await context.newPage();
  await page.goto(`https://whowatch.tv/viewer/${LIVE_ID}`);

  // 記録(IndexedDB yt_kirameki_db)に入る。形の違う1件は捨てる。アイテムは pt(個数×値段)で数える
  await expect.poll(() => readRows(sw), { timeout: 30_000 }).toEqual(WANT_ROWS);
  // 前回の updated_at を渡して続きだけ聞いている
  expect(asked.slice(0, 2)).toEqual(['0', '1000']);

  // 計器: 読めた道・捨てた数・届いた項目の名前・新しい順か
  await expect
    .poll(async () => {
      const d = (await sw.evaluate(async () => chrome.storage.local.get('yt_diag_ww_chat'))).yt_diag_ww_chat || {};
      return { via: d.via, streamKey: d.streamKey, dropped: d.dropped, paid: d.paid, paidItems: d.paidItems, newestFirst: d.newestFirst, isLive: d.isLive, hasItemShape: (d.shapes?.['comment.play_item_pattern'] || []).includes('name') };
    }, { timeout: 15_000 })
    .toEqual({ via: 'page', streamKey: KEY, dropped: 2, paid: 1, paidItems: 2, newestFirst: true, isLive: true, hasItemShape: true });

  // 配信のまとめ(配信者・同接・開始時刻)
  const sum = await sw.evaluate(async (key) => (await chrome.storage.local.get('yt_stream_summaries')).yt_stream_summaries?.[key], KEY);
  expect(sum).toMatchObject({ title: 'テストざつだん', broadcasterName: 'テストはいしん', broadcasterHandle: 'w:u42', concurrentViewers: 33 });
  expect(Number(sum.startedAt)).toBe(Date.parse('2026-11-08T09:00:00Z'));

  // サイドパネル・会場と同じ口(YT_SEND_COMMENT)から送ると、ふわっちの入力欄に書かれて送られる
  const ext = await context.newPage();
  await ext.goto(`${sw.url().replace(/\/[^/]*$/, '')}/yt-sidepanel.html`);
  const res = await ext.evaluate((key) => chrome.runtime.sendMessage({ type: 'YT_SEND_COMMENT', videoId: key, text: 'こんにちは ふわっち' }), KEY);
  expect(res).toMatchObject({ ok: true });
  expect(await page.evaluate(() => /** @type {any} */ (window).__sent)).toEqual(['こんにちは ふわっち']);

  // 未ログイン(本物: 入力欄が disabled・placeholder「コメントを送るにはログインが必要です」)なら、打たずに理由を返す
  await page.evaluate(() => {
    const t = /** @type {HTMLTextAreaElement} */ (document.querySelector('textarea'));
    t.disabled = true;
    t.placeholder = 'コメントを送るにはログインが必要です';
  });
  const res2 = await ext.evaluate((key) => chrome.runtime.sendMessage({ type: 'YT_SEND_COMMENT', videoId: key, text: 'みえないはず' }), KEY);
  expect(res2).toMatchObject({ ok: false, reason: 'not-signed-in' });
  await page.evaluate(() => {
    const t = /** @type {HTMLTextAreaElement} */ (document.querySelector('textarea'));
    t.disabled = false;
    t.placeholder = 'コメントを入力';
  });

  // ニコ生版の画面(yt-sidepanel.html)に、ふわっちのコメントと配信者が出る・言葉はふわっちの言葉
  await page.bringToFront();
  await ext.reload();
  await page.bringToFront();
  const bodyText = () => ext.evaluate(() => document.body.innerText);
  for (const want of ['ファンA', 'テストはいしん', 'ハート']) {
    await expect.poll(bodyText, { timeout: 30_000 }).toContain(want);
  }
  const text = await bodyText();
  expect(text).not.toMatch(/ww:\d|ww:n:|<b>|&lt;/);
  expect(text).not.toMatch(/スパチャ|スーパーチャット|トップファン|ギフトサブ/);

  // 配信が終わったと分かったら、終わった時刻を送って読むのをやめる
  ended = true;
  await expect
    .poll(async () => Number((await sw.evaluate(async (key) => (await chrome.storage.local.get('yt_stream_summaries')).yt_stream_summaries?.[key], KEY))?.endedAt || 0), { timeout: 20_000 })
    .toBeGreaterThan(0);
  const n = asked.length;
  await page.waitForTimeout(4000);
  expect(asked.length).toBe(n);
});

test('ページから API を読めない(CORS・拒否)ときは、バックグラウンドが代わりに読む', async ({ context }) => {
  await context.route('https://whowatch.tv/**', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE_HTML }));
  await context.route('https://img.whowatch.tv/**', (route) => route.fulfill({ status: 404, body: '' }));
  // ページ(whowatch.tv の出どころ)からの読み取りは断る=バックグラウンド(拡張の出どころ)からだけ読める
  await context.route('https://api.whowatch.tv/**', async (route) => {
    const origin = String(route.request().headers().origin || '');
    if (origin.startsWith('https://whowatch.tv')) return route.fulfill({ status: 403, body: '' });
    const u = new URL(route.request().url());
    const since = Number(u.searchParams.get('last_updated_at') || 0);
    const body = { live: LIVE('PUBLISHING'), comments: since === 0 ? FIRST : [], updated_at: 1000 };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const sw = await extWorker(context);
  const page = await context.newPage();
  await page.goto(`https://whowatch.tv/viewer/${LIVE_ID}`);
  await expect.poll(async () => (await readRows(sw)).length, { timeout: 30_000 }).toBe(5);
  await expect
    .poll(async () => {
      const d = (await sw.evaluate(async () => chrome.storage.local.get('yt_diag_ww_chat'))).yt_diag_ww_chat || {};
      return `${d.via}|${d.streamKey}`;
    }, { timeout: 15_000 })
    .toBe(`bg|${KEY}`);
});
