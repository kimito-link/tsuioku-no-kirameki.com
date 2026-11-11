// コメントが続くときに、画面のメインスレッドがどれだけ止まるかを測る。
// 使い方: EXT_DIR=extension CPU_THROTTLE=6 MEASURE_FLOOD_MS=60000 node scripts/measure-comment-flood.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const extDir = resolve(process.env.EXT_DIR || 'extension');
const throttle = Number(process.env.CPU_THROTTLE || 6);
const floodMs = Number(process.env.MEASURE_FLOOD_MS || 60000);
const prefill = Number(process.env.MEASURE_PREFILL || 20000);
const rate = Number(process.env.MEASURE_RATE || 80);
const outPath = resolve(process.env.MEASURE_OUT || '.artifacts/comment-flood.json');
const videoId = 'floodvid2046';
const realPages = String(process.env.MEASURE_REAL || '') === '1';

const REAL_URLS = [
  'https://live.nicovideo.jp/',
  'https://www.youtube.com/',
  'https://www.twitch.tv/',
  'https://kick.com/',
  'https://abema.tv/',
];

/** @param {import('playwright').Page | import('playwright').Worker} target */
async function throttleTarget(target, rateValue) {
  try {
    const session = await target.context().newCDPSession(target);
    await session.send('Emulation.setCPUThrottlingRate', { rate: rateValue });
    return true;
  } catch {
    return false;
  }
}

const context = await chromium.launchPersistentContext('', {
  headless: false,
  args: [
    `--disable-extensions-except=${extDir}`,
    `--load-extension=${extDir}`,
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    '--enable-precise-memory-info',
    '--no-first-run',
    '--no-default-browser-check',
  ],
});

/** @type {Record<string, unknown>} */
const report = {
  at: new Date().toISOString(),
  extDir,
  throttle,
  floodMs,
  prefill,
  rate,
  real: [],
};

try {
  const deadline = Date.now() + 30000;
  let sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
  while (!sw && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
  }
  if (!sw) {
    const pages = context.pages().map((p) => p.url());
    const workers = context.serviceWorkers().map((w) => w.url());
    throw new Error(`service worker が見つからない pages=${JSON.stringify(pages)} workers=${JSON.stringify(workers)}`);
  }
  const extId = new URL(sw.url()).host;
  report.extensionId = extId;

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extId}/yt-sidepanel.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    const w = /** @type {any} */ (window);
    w.__lt = [];
    w.__loaf = [];
    w.__rafGap = [];
    try {
      const obs = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          const attr = e.attribution && e.attribution[0];
          w.__lt.push({
            dur: e.duration,
            at: e.startTime,
            name: attr ? String(attr.containerName || attr.name || '') : '',
          });
        }
      });
      obs.observe({ type: 'longtask', buffered: true });
    } catch (err) {
      w.__ltError = String(err);
    }
    try {
      const loaf = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          const scripts = Array.isArray(e.scripts) ? e.scripts : [];
          const top = scripts.reduce((a, s) => ((s?.duration || 0) > (a?.duration || 0) ? s : a), null);
          w.__loaf.push({
            dur: Math.round(e.duration),
            at: e.startTime,
            blocking: Math.round(e.blockingDuration || 0),
            fn: top ? String(top.sourceFunctionName || top.invoker || '') : '',
            src: top ? String(top.sourceURL || '').split('/').pop() : '',
          });
        }
      });
      loaf.observe({ type: 'long-animation-frame', buffered: true });
    } catch (err) {
      w.__loafError = String(err);
    }
    let last = performance.now();
    const tick = (now) => {
      const gap = now - last;
      if (gap > 50) w.__rafGap.push(Math.round(gap));
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const heap = async () => page.evaluate(() => {
    const m = /** @type {any} */ (performance).memory;
    return m ? { used: m.usedJSHeapSize, total: m.totalJSHeapSize } : null;
  });
  report.heapBefore = await heap();

  const prefillStarted = Date.now();
  const prefillRes = await page.evaluate(async ({ n, videoId: vid }) => {
    const batch = 40;
    let added = 0;
    const slow = [];
    for (let i = 0; i < n; i += batch) {
      const items = [];
      for (let j = i; j < Math.min(n, i + batch); j += 1) {
        items.push({
          id: `pre${j}`,
          name: `user${j % 50}`,
          text: `prefill ${j} ${'あ'.repeat(24)}`,
          channelId: `UC${String(j % 50).padStart(22, 'a')}`,
          postedAtMs: 1_700_000_000_000 + j,
        });
      }
      const t0 = performance.now();
      const res = await chrome.runtime.sendMessage({ type: 'YT_CHAT_ITEMS', payload: { videoId: vid, items } });
      const ms = performance.now() - t0;
      if (ms > 100) slow.push(Math.round(ms));
      added += Number(res?.addedCount || 0);
    }
    return { added, slowOver100: slow.length, slowMax: slow.reduce((a, b) => Math.max(a, b), 0) };
  }, { n: prefill, videoId });
  report.prefill = { ...prefillRes, wallMs: Date.now() - prefillStarted };
  report.heapAfterPrefill = await heap();
  report.pageThrottled = await throttleTarget(page, throttle);
  report.swThrottled = await throttleTarget(sw, throttle);

  await page.evaluate(() => {
    const w = /** @type {any} */ (window);
    w.__floodStart = performance.now();
    w.__ltFlood = [];
    w.__rafFlood = [];
    w.__nlPaintMsMax = 0;
    w.__nlPaintPhasesMax = {};
    w.__nlLaneAggMsMax = 0;
    w.__nlLaneFnMsMax = 0;
    w.__nlEnrichMsMax = 0;
    w.__nlIdbChunkMs = 0;
  });

  const flood = await page.evaluate(async ({ ms, perSec, videoId: vid, startAt }) => {
    const perTick = Math.max(1, Math.round(perSec * 0.15));
    let n = startAt;
    const t0 = performance.now();
    const slow = [];
    await new Promise((resolve) => {
      const timer = setInterval(() => {
        const items = [];
        for (let i = 0; i < perTick; i += 1) {
          const id = n;
          n += 1;
          items.push({
            id: `live${id}`,
            name: `user${id % 80}`,
            text: `live ${id}`,
            channelId: `UC${String(id % 80).padStart(22, 'b')}`,
            postedAtMs: Date.now(),
          });
        }
        const t = performance.now();
        chrome.runtime.sendMessage({ type: 'YT_CHAT_ITEMS', payload: { videoId: vid, items } }).then(() => {
          const d = performance.now() - t;
          if (d > 100) slow.push(Math.round(d));
        }).catch(() => {});
        if (performance.now() - t0 >= ms) {
          clearInterval(timer);
          setTimeout(resolve, 800);
        }
      }, 150);
    });
    const w = /** @type {any} */ (window);
    const start = Number(w.__floodStart || 0);
    const lts = (w.__lt || []).filter((e) => e.at >= start);
    const raf = (w.__rafGap || []).filter(() => true);
    const durs = lts.map((e) => e.dur);
    const diag = /** @type {any} */ (globalThis).__ytNicoShimDiag || null;
    return {
      sent: n - startAt,
      longTasks: durs.length,
      longMax: durs.reduce((a, b) => Math.max(a, b), 0),
      longOver100: durs.filter((d) => d > 100).length,
      longOver50: durs.filter((d) => d > 50).length,
      rafGapsOver100: raf.filter((g) => g > 100).length,
      rafGapMax: raf.reduce((a, b) => Math.max(a, b), 0),
      swSlowOver100: slow.length,
      swSlowMax: slow.reduce((a, b) => Math.max(a, b), 0),
      ltError: w.__ltError || '',
      loafError: w.__loafError || '',
      loaf: (w.__loaf || [])
        .filter((e) => e.at >= start && e.dur >= 50)
        .sort((a, b) => b.dur - a.dur)
        .slice(0, 8),
      dom: (() => {
        const all = document.querySelectorAll('*');
        let biggest = 0;
        let biggestId = '';
        for (const el of all) {
          const n = el.childElementCount || 0;
          if (n > biggest) {
            biggest = n;
            biggestId = el.id || el.className?.toString?.().slice(0, 40) || el.tagName;
          }
        }
        return { nodes: all.length, biggest, biggestId };
      })(),
      diag: diag
        ? {
            builds: diag.builds,
            buildReused: diag.buildReused,
            buildMsMax: diag.buildMsMax,
            buildMsLast: diag.buildMsLast,
            rowsMadeLast: diag.rowsMadeLast,
            rowsReusedLast: diag.rowsReusedLast,
            buildPhaseMax: diag.buildPhaseMax,
            notified: diag.notified,
            notifyCoalesced: diag.notifyCoalesced,
            paintMsLast: /** @type {any} */ (globalThis).__nlPaintMsLast || 0,
            paintMsMax: /** @type {any} */ (globalThis).__nlPaintMsMax || 0,
            paintCount: /** @type {any} */ (globalThis).__nlPaintCount || 0,
            paintPhasesLast: /** @type {any} */ (globalThis).__nlPaintPhasesLast || null,
            paintPhasesMax: /** @type {any} */ (globalThis).__nlPaintPhasesMax || null,
            laneMemo: /** @type {any} */ (globalThis).__laneAggregatesMemoDiag || null,
            laneAggMsLast: /** @type {any} */ (globalThis).__nlLaneAggMsLast || 0,
            laneAggMsMax: /** @type {any} */ (globalThis).__nlLaneAggMsMax || 0,
            laneAggN: /** @type {any} */ (globalThis).__nlLaneAggN || 0,
            laneFnMsLast: /** @type {any} */ (globalThis).__nlLaneFnMsLast || 0,
            laneFnMsMax: /** @type {any} */ (globalThis).__nlLaneFnMsMax || 0,
            laneSkip: /** @type {any} */ (globalThis).__nlLaneSkip || 0,
            lanePaint: /** @type {any} */ (globalThis).__nlLanePaint || 0,
            idbChunkMs: /** @type {any} */ (globalThis).__nlIdbChunkMs || 0,
            idbChunkN: /** @type {any} */ (globalThis).__nlIdbChunkN || 0,
            idbChunkRows: /** @type {any} */ (globalThis).__nlIdbChunkRows || 0,
          }
        : null,
    };
  }, { ms: floodMs, perSec: rate, videoId, startAt: prefill });
  report.flood = flood;
  report.heapAfterFlood = await heap();

  if (realPages) {
    for (const url of REAL_URLS) {
      const p = await context.newPage();
      /** @type {Record<string, unknown>} */
      const row = { url };
      try {
        const res = await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        row.status = res ? res.status() : 0;
        row.title = await p.title();
        row.finalUrl = p.url();
      } catch (err) {
        row.error = String(err).slice(0, 240);
      }
      await p.close().catch(() => {});
      report.real.push(row);
    }
  }
} finally {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await context.close().catch(() => {});
}
