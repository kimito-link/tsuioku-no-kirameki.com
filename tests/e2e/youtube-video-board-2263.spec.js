// youtube-video-board-2263.spec.js — v0.1.2263 計器(りんく 11-27): YouTube の通常動画ページ(実測のコメント DOM)で、
//   1) 動画のカードが作られ、書いた本文・いいね・返信の数が載る  2) 会場モードの読み口(YT_GET_STREAM_COMMENTS)が動画の行を返す
//   3) ページを読み直さずに別の動画へ移っても(ミックスの 2 本目)、ライブ扱いにせず、移った先の動画のカードになる。
//   本物の YouTube には繋がない(ページは route で返す)。新しい権限・通信は使わない。
import { test as base, chromium, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../../extension');
const FIX = path.resolve(__dirname, '../../src/lib/youtube/fixtures/real-dom');
const VID = 'kKl0E22tU78';
const VID2 = 'zyxwvutsrqp';
const threads =
  fs.readFileSync(path.join(FIX, 'kKl0E22tU78-thread-pinned-hikakin.slim.html'), 'utf8') +
  fs.readFileSync(path.join(FIX, 'kKl0E22tU78-thread-kvibaba.slim.html'), 'utf8');

const player = (id, live) => ({ videoDetails: { videoId: id, isLive: live, isLiveContent: live, viewCount: '6781234' } });
const initial = (id) => ({ currentVideoEndpoint: { watchEndpoint: { videoId: id } } });

function pageHtml(id) {
  // 最初に開いたページはライブ(前のページの印が残る形)。2 本目へはページを読み直さずに移る。
  const first = id === 'LIVExxxxxxx';
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="canonical" href="https://www.youtube.com/watch?v=${id}">
<title>テスト - YouTube</title></head><body>
<h1>テスト</h1>
<script>var ytInitialData = ${JSON.stringify(initial(id))}; var ytInitialPlayerResponse = ${JSON.stringify(player(id, first))};</script>
<div id="comments">${first ? '' : threads}</div>
</body></html>`;
}

const test = base.extend({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture API
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: false,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
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
    const sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://') && w.url().includes('/background'));
    if (sw) return sw;
    if (Date.now() > deadline) throw new Error('service worker not found');
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** @param {any} sw */
const readCard = (sw) => sw.evaluate(async () => (await chrome.storage.local.get('yt_video_watch_card_v1')).yt_video_watch_card_v1 || null);

test.describe('YouTube の通常動画(v0.1.2263)', () => {
  test.beforeEach(async ({ context }) => {
    await context.route(/https:\/\/www\.youtube\.com\/.*/, async (route) => {
      if (route.request().resourceType() !== 'document') {
        await route.fulfill({ status: 204, body: '' });
        return;
      }
      const id = new URL(route.request().url()).searchParams.get('v') || VID;
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: pageHtml(id) });
    });
  });

  test('動画のカードに本文・いいね・返信が載り、会場の読み口が動画の行を返す', async ({ context }) => {
    const sw = await extWorker(context);
    const page = await context.newPage();
    await page.goto(`https://www.youtube.com/watch?v=${VID}`);
    await expect.poll(async () => (await readCard(sw))?.videoId || '', { timeout: 30_000 }).toBe(VID);
    const wrap = await readCard(sw);
    const rows = wrap.card.behavior.rows;
    const hk = rows.find((r) => /HikakinTV/.test(r.name));
    expect(hk.comments[0].text).toContain('200万再生ありがとう');
    expect(hk.comments[0].likes).toBe('4597');
    expect(hk.comments[0].replyCount).toBe(54);
    expect(wrap.card.videoRows.length).toBeGreaterThan(0);
    const ext = await context.newPage();
    await ext.goto(`${sw.url().replace(/\/[^/]*$/, '')}/status.html`).catch(() => {});
    const res = await ext.evaluate((vid) => chrome.runtime.sendMessage({ type: 'YT_GET_STREAM_COMMENTS', videoId: vid }), VID);
    expect(res.ok).toBe(true);
    expect(res.items.some((r) => /200万再生ありがとう/.test(r.text))).toBe(true);
  });

  test('ライブから読み直さずに動画へ移っても、ライブ扱いにせず動画のカードになる', async ({ context }) => {
    const sw = await extWorker(context);
    const page = await context.newPage();
    await page.goto('https://www.youtube.com/watch?v=LIVExxxxxxx');
    await page.waitForTimeout(1500);
    await page.evaluate(({ id, threadsHtml, resp }) => {
      history.pushState(null, '', `/watch?v=${id}&list=RDtest&index=2`);
      document.getElementById('comments').innerHTML = threadsHtml;
      window.dispatchEvent(new CustomEvent('yt-navigate-finish', { detail: { response: resp } }));
    }, { id: VID2, threadsHtml: threads, resp: { response: initial(VID2), playerResponse: player(VID2, false) } });
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-nl-yt-content-kind')), { timeout: 10_000 }).toBe('video');
    await expect.poll(async () => (await readCard(sw))?.videoId || '', { timeout: 30_000 }).toBe(VID2);
  });
});
