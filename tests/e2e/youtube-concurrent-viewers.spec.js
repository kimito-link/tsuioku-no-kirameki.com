// youtube-concurrent-viewers.spec.js — 画面に「人が視聴中」が無く、ytInitialData の中だけに数があるページで、
//   横の欄に同時視聴者数が 10 秒以内に出る。/@名前/live も canonical から同じ配信として出す。
import { test as base, chromium, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../../extension');
const VID = 'abcdefghijk';
const COUNT = 4321;

const initial = {
  currentVideoEndpoint: { watchEndpoint: { videoId: VID } },
  contents: {
    twoColumnWatchNextResults: {
      results: {
        results: {
          contents: [
            {
              videoPrimaryInfoRenderer: {
                viewCount: {
                  videoViewCountRenderer: {
                    originalViewCount: String(COUNT),
                    viewCount: { simpleText: '4,321 人が視聴中' },
                    isLive: true,
                  },
                },
              },
            },
          ],
        },
      },
    },
  },
};

function pageHtml() {
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="canonical" href="https://www.youtube.com/watch?v=${VID}">
<title>テスト配信 - YouTube</title></head><body>
<h1>テスト配信</h1>
<script>var ytInitialData = ${JSON.stringify(initial)};</script>
</body></html>`;
}

const test = base.extend({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture API
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
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
    const sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://') && w.url().includes('/background'));
    if (sw) return sw;
    if (Date.now() > deadline) throw new Error('service worker not found');
    await new Promise((r) => setTimeout(r, 100));
  }
}

test.describe('YouTube の同時視聴者数', () => {
  test.beforeEach(async ({ context }) => {
    await context.route(/https:\/\/www\.youtube\.com\/.*/, async (route) => {
      if (route.request().resourceType() !== 'document') {
        await route.fulfill({ status: 204, body: '' });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: pageHtml() });
    });
  });

  test('ytInitialData だけの /watch で、10秒以内に横の欄へ数が出る', async ({ context }) => {
    const sw = await extWorker(context);
    await sw.evaluate(async () => chrome.storage.local.set({ yt_stream_summaries: {}, yt_last_stream_url: null }));
    const page = await context.newPage();
    const started = Date.now();
    await page.goto(`https://www.youtube.com/watch?v=${VID}`);
    await page.bringToFront();
    const ext = await context.newPage();
    await ext.goto(`${sw.url().replace(/\/[^/]*$/, '')}/yt-sidepanel.html`);
    await page.bringToFront();
    await ext.reload();
    const left = Math.max(1000, 10_000 - (Date.now() - started));
    await expect.poll(() => ext.evaluate(() => document.body.innerText), { timeout: left }).toContain('4,321');
  });

  test('/@名前/live でも、10秒以内に横の欄へ数が出る', async ({ context }) => {
    const sw = await extWorker(context);
    await sw.evaluate(async () => chrome.storage.local.set({ yt_stream_summaries: {}, yt_last_stream_url: null }));
    const page = await context.newPage();
    const started = Date.now();
    await page.goto('https://www.youtube.com/@testchan/live');
    await page.bringToFront();
    const ext = await context.newPage();
    await ext.goto(`${sw.url().replace(/\/[^/]*$/, '')}/yt-sidepanel.html`);
    await page.bringToFront();
    await ext.reload();
    const left = Math.max(1000, 10_000 - (Date.now() - started));
    await expect.poll(() => ext.evaluate(() => document.body.innerText), { timeout: left }).toContain('4,321');
  });
});
