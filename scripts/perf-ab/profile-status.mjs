/**
 * 診断ページ(status.html)自身のメインスレッド CPU プロファイル。「診断ページが重くて出てこない」の原因探し用。
 *
 * 使い方: node scripts/perf-ab/profile-status.mjs --lv lv351531643 [--collect 40] [--seconds 30] [--ext dir] [--top 25]
 *   1) 視聴ページ(視聴ページ内パネルあり=実機と同じ)を collect 秒開いて記録を溜める
 *   2) status.html を開く【前】にプロファイラを開始 → seconds 秒間のプロファイル(自分の時間・入口)
 *   --drop popup|venue|both : 読み込み 3 秒後に、埋め込み iframe(popup.html / venue.html)を外してから測る(犯人の切り分け)
 *
 * 読み方: BUSY% が高い/最長の連続稼働が長い=診断ページが自分で止まっている。上位の関数・入口が犯人候補。
 *   ★同じプロセスの他ページ(視聴ページ内パネル)の仕事はここには出ない(別文書)。両方を見て切り分ける。
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, launchWithExtension, enableAutoshow, parseArgs, sleep, shutdown, summarizeProfile } from './common.mjs';

const args = parseArgs();
if (!/^lv\d+$/.test(args.lv || '')) {
  console.error('usage: node scripts/perf-ab/profile-status.mjs --lv lv123456789 [--collect 40] [--seconds 30]');
  process.exit(2);
}
const collectMs = Number(args.collect || 40) * 1000;
const windowMs = Number(args.seconds || 30) * 1000;

const { ctx, sw, extId, userDataDir } = await launchWithExtension({ extDir: args.ext });
let exitCode = 0;
try {
  await enableAutoshow(sw, args.autoshow !== '0');
  const watch = await ctx.newPage();
  await watch.setViewportSize({ width: 1280, height: 800 });
  watch.goto(`https://live.nicovideo.jp/watch/${args.lv}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await sleep(collectMs);

  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
  await cdp.send('Profiler.start');
  const t0 = Date.now();
  page.goto(`chrome-extension://${extId}/status.html`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  if (args.drop) {
    await sleep(3000);
    const dropped = await page.evaluate((what) => {
      const out = [];
      for (const f of [...document.querySelectorAll('iframe')]) {
        const src = f.getAttribute('src') || '';
        const isPopup = /popup\.html/.test(src);
        const isVenue = /venue\.html/.test(src);
        if ((what === 'popup' && isPopup) || (what === 'venue' && isVenue) || what === 'both') {
          out.push(src.slice(0, 60));
          f.remove();
        }
      }
      return out;
    }, String(args.drop)).catch(() => []);
    console.log('取り外した iframe:', JSON.stringify(dropped));
    await sleep(Math.max(0, windowMs - 3000));
  } else {
    await sleep(windowMs);
  }
  const { profile } = await cdp.send('Profiler.stop');
  const s = summarizeProfile(profile, { top: Number(args.top || 25) });

  console.log(`status.html ${windowMs / 1000}s (開始から ${(Date.now() - t0) / 1000}s) → sampled ${s.sampledMs.toFixed(0)}ms  idle ${s.idleMs.toFixed(0)}ms  BUSY ${s.busyPct}%  最長の連続稼働 ${s.longestBusyRunMs.toFixed(0)}ms`);
  console.log('--- self time (ms)');
  const distFile = path.join(args.ext || path.join(REPO_ROOT, 'extension'), 'dist', 'status.js');
  const distLines = fs.existsSync(distFile) ? fs.readFileSync(distFile, 'utf8').split(String.fromCharCode(10)) : [];
  const snippetOf = (k) => {
    const m = /dist\/status\.js:(\d+)(?::(\d+))?$/.exec(k);
    if (!m || !m[2] || !distLines[Number(m[1]) - 1]) return '';
    return '   ⇒ ' + distLines[Number(m[1]) - 1].slice(Number(m[2]) - 1, Number(m[2]) + 110).replace(/\s+/g, ' ');
  };
  for (const [k, t] of s.self) console.log(`${t.toFixed(0).padStart(7)}  ${k}`);
  console.log('--- inclusive (ms)');
  for (const [k, t] of s.inclusive.slice(0, 18)) console.log(`${t.toFixed(0).padStart(7)}  ${k}`);
  console.log('--- ENTRY POINTS');
  for (const [k, t] of s.entries.slice(0, 12)) console.log(`${t.toFixed(0).padStart(7)}  ${k}${snippetOf(k)}`);
} catch (e) {
  console.error('FAILED:', String(e));
  exitCode = 1;
} finally {
  await shutdown(ctx, userDataDir);
  process.exit(exitCode);
}
