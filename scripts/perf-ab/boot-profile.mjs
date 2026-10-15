/**
 * パネル(popup)の【起動の瞬間】のメインスレッド CPU プロファイル。「押した瞬間の黒い幕」の原因探し用。
 *
 * 使い方: node scripts/perf-ab/boot-profile.mjs --lv lv351523930 [--collect 40] [--seconds 6] [--ext dir]
 *   1) 視聴ページを開いて collect 秒ほどコメントを溜める(autoshow は切る=他のパネルが同じスレッドを使わない)
 *   2) 新しいタブで popup.html?inline=1&dock=sidepanel&lv=<lv> を開く【前】にプロファイラを開始
 *   3) 起動から seconds 秒間のプロファイル(稼働率・自分の時間・入口)を出す
 *   --status 1 : 起動の前に status.html のタブも開いておく(--status-wait 秒待つ。既定20)。あり/なしの差=状態画面が足す時間
 *   --width/--height: パネルの表示サイズ(既定 664x1000=サイドパネル相当。画面に見える範囲が結果を左右する)
 *
 * 読み方: 起動の数秒でメインスレッドが何に使われたか。幕が長いなら、その上位が犯人。
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, launchWithExtension, enableAutoshow, parseArgs, sleep, shutdown, summarizeProfile } from './common.mjs';

const args = parseArgs();
if (!/^lv\d+$/.test(args.lv || '')) {
  console.error('usage: node scripts/perf-ab/boot-profile.mjs --lv lv123456789 [--collect 40] [--seconds 6]');
  process.exit(2);
}
const collectMs = Number(args.collect || 40) * 1000;
const windowMs = Number(args.seconds || 6) * 1000;

const { ctx, sw, extId, userDataDir } = await launchWithExtension({ extDir: args.ext });
let exitCode = 0;
try {
  await enableAutoshow(sw, false); // 視聴ページ内パネルは出さない(記録だけ行わせる)
  const watch = await ctx.newPage();
  watch.goto(`https://live.nicovideo.jp/watch/${args.lv}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await sleep(collectMs);

  // --status 1: 状態画面(status.html)のタブも開いておく(自動送信のために開きっぱなしにする運用の再現)。
  //   拡張の全ページは1本のメインスレッドを共有するので、これが起動の幕に足す時間を比べる(2026-10-15)。
  if (String(args.status || '0') === '1') {
    const st = await ctx.newPage();
    st.goto(`chrome-extension://${extId}/status.html`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await sleep(Number(args['status-wait'] || 20) * 1000);
  }

  const page = await ctx.newPage();
  // 実際のサイドパネルの大きさ(幅 約664px)に合わせる。全面表示だと「画面に見える顔」が増えて遅延読み込みの効果が見えない。
  await page.setViewportSize({ width: Number(args.width || 664), height: Number(args.height || 1000) });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
  await cdp.send('Profiler.start');
  const t0 = Date.now();
  page.goto(`chrome-extension://${extId}/popup.html?inline=1&dock=sidepanel&lv=${args.lv}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await sleep(windowMs);
  const { profile } = await cdp.send('Profiler.stop');
  if (args.eval) console.log(`eval ${args.eval} =`, JSON.stringify((await cdp.send('Runtime.evaluate', { expression: String(args.eval), returnByValue: true })).result?.value));
  const s = summarizeProfile(profile, { top: Number(args.top || 20) });

  console.log(`boot window ${windowMs / 1000}s (開始から ${(Date.now() - t0) / 1000}s) → sampled ${s.sampledMs.toFixed(0)}ms  idle ${s.idleMs.toFixed(0)}ms  BUSY ${s.busyPct}%  最長の連続稼働 ${s.longestBusyRunMs.toFixed(0)}ms`);
  console.log('--- self time (ms)');
  // minify された dist の「行:列」から関数の冒頭を読んで、無名関数の正体を示す。
  const distFile = path.join(args.ext || path.join(REPO_ROOT, 'extension'), 'dist', 'popup.js');
  const distLines = fs.existsSync(distFile) ? fs.readFileSync(distFile, 'utf8').split(String.fromCharCode(10)) : [];
  const snippetOf = (k) => {
    const m = /dist\/popup\.js:(\d+)(?::(\d+))?$/.exec(k);
    if (!m || !m[2] || !distLines[Number(m[1]) - 1]) return '';
    return '   ⇒ ' + distLines[Number(m[1]) - 1].slice(Number(m[2]) - 1, Number(m[2]) + 110).replace(/\s+/g, ' ');
  };
  for (const [k, t] of s.self) console.log(`${t.toFixed(0).padStart(7)}  ${k}`);
  console.log('--- inclusive (ms)');
  for (const [k, t] of s.inclusive.slice(0, 18)) console.log(`${t.toFixed(0).padStart(7)}  ${k}`);
  console.log('--- ENTRY POINTS');
  for (const [k, t] of s.entries.slice(0, 10)) console.log(`${t.toFixed(0).padStart(7)}  ${k}${snippetOf(k)}`);
} catch (e) {
  console.error('FAILED:', String(e));
  exitCode = 1;
} finally {
  await shutdown(ctx, userDataDir);
  process.exit(exitCode);
}
