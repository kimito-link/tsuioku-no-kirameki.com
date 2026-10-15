/**
 * パネル(popup)の【起動の瞬間】のメインスレッド CPU プロファイル。「押した瞬間の黒い幕」の原因探し用。
 *
 * 使い方: node scripts/perf-ab/boot-profile.mjs --lv lv351523930 [--collect 40] [--seconds 6] [--ext dir]
 *   1) 視聴ページを開いて collect 秒ほどコメントを溜める(autoshow は切る=他のパネルが同じスレッドを使わない)
 *   2) 新しいタブで popup.html?inline=1&dock=sidepanel&lv=<lv> を開く【前】にプロファイラを開始
 *   3) 起動から seconds 秒間のプロファイル(稼働率・自分の時間・入口)を出す
 *   (毎回 [metrics Δ] 行で、起動の間の task 全体を script / layout / style / その他 に分解して出す)
 *   --trace 1  : Chrome のトレースを取り、メインスレッドの自分の時間を名前別に出す(--port 既定9335)。(program)の中身を見る用
 *   --gets memo: 【実験】--gets 1 に加えて、同じキーの組の2回目以降は最初の結果を返す(読み直しが重さの原因かの因果確認)
 *   --gets 1   : 起動の間の chrome.storage.local.get を全部記録して、結果が大きい順に出す(保存データの読み出しの犯人探し)
 *   --status 1 : 起動の前に status.html のタブも開いておく(--status-wait 秒待つ。既定20)。あり/なしの差=状態画面が足す時間
 *   --width/--height: パネルの表示サイズ(既定 664x1000=サイドパネル相当。画面に見える範囲が結果を左右する)
 *
 * 読み方: 起動の数秒でメインスレッドが何に使われたか。幕が長いなら、その上位が犯人。
 */
import fs from 'node:fs';
import path from 'node:path';
import { startTrace, stopTraceAndSummarize } from './trace-summary.mjs';
import { REPO_ROOT, launchWithExtension, enableAutoshow, parseArgs, sleep, shutdown, summarizeProfile } from './common.mjs';

const args = parseArgs();
if (!/^lv\d+$/.test(args.lv || '')) {
  console.error('usage: node scripts/perf-ab/boot-profile.mjs --lv lv123456789 [--collect 40] [--seconds 6]');
  process.exit(2);
}
const collectMs = Number(args.collect || 40) * 1000;
const windowMs = Number(args.seconds || 6) * 1000;

const TRACE_PORT = Number(args.port || 9335);
const withTrace = String(args.trace || '0') === '1';
const { ctx, sw, extId, userDataDir } = await launchWithExtension({ extDir: args.ext, debugPort: withTrace ? TRACE_PORT : 0 });
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
  // --gets 1: 起動の間の chrome.storage.local.get を【全部】記録する(キー・かかった時間・結果の大きさ)。
  //   ★(program)/Receive mojo message の正体=保存データの巨大な読み出しを名指しするため。結果の大きさの測定は get の【後】に行う。
  const getsMode = String(args.gets || '0'); // '1'=記録のみ / 'memo'=記録+【実験】同じキーの組の2回目以降は最初の結果を返す(因果の確認用・製品は変えない)
  if (getsMode === '1' || getsMode === 'memo') {
    await page.addInitScript((memoOn) => {
      try {
        const st = chrome.storage.local; const orig = st.get.bind(st);
        window.__nlGets = [];
        const memo = new Map();
        st.get = function (keys, cb) {
          const t0 = performance.now();
          const label = Array.isArray(keys) ? keys.join(',') : (keys && typeof keys === 'object' ? Object.keys(keys).join(',') : String(keys));
          if (memoOn && typeof cb !== 'function' && memo.has(label)) { window.__nlGets.push({ at: Math.round(t0), label: label.slice(0, 90), ms: 0, bytes: 0, nkeys: 0, memo: true }); return Promise.resolve(memo.get(label)); }
          const p = orig(keys);
          const done = (r) => { const ms = performance.now() - t0; let bytes = -1; try { bytes = JSON.stringify(r).length; } catch { /* no-op */ } window.__nlGets.push({ at: Math.round(t0), label: label.slice(0, 90), ms: Math.round(ms), bytes, nkeys: r ? Object.keys(r).length : 0 }); return r; };
          if (typeof cb === 'function') return orig(keys, (r) => { done(r); cb(r); });
          return p.then((r) => { done(r); if (memoOn) memo.set(label, r); return r; });
        };
      } catch { /* no-op */ }
    }, getsMode === 'memo');
  }
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
  await cdp.send('Profiler.start');
  // ★2026-10-16: (program)=JS に数えられないブラウザ内部の処理の【中身】を、Chrome 公式の Performance.getMetrics(レイアウト/
  //   スタイル計算/スクリプト/タスク全体の累計)の前後差で分解する(新しい計測は作らない=既製の方法)。
  await cdp.send('Performance.enable');
  // --trace 1: Chrome のトレースで (program)/「その他」の中身(レイアウト・描画の確定・画像・IPC…)を名前別に分解する。
  const traceHandle = withTrace ? await startTrace(TRACE_PORT) : null;
  const metricsOf = async () => Object.fromEntries(((await cdp.send('Performance.getMetrics')).metrics || []).map((m) => [m.name, m.value]));
  const m0 = await metricsOf();
  const t0 = Date.now();
  page.goto(`chrome-extension://${extId}/popup.html?inline=1&dock=sidepanel&lv=${args.lv}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await sleep(windowMs);
  const getsRows = (getsMode === '1' || getsMode === 'memo') ? await page.evaluate(() => window.__nlGets || []).catch(() => []) : null;
  const m1 = await metricsOf();
  const traceRows = traceHandle ? await stopTraceAndSummarize(traceHandle, { top: Number(args['trace-top'] || 14) }) : null;
  const { profile } = await cdp.send('Profiler.stop');
  const dms = (k) => Math.round(((m1[k] || 0) - (m0[k] || 0)) * 1000);
  const taskMs = dms('TaskDuration');
  const known = dms('ScriptDuration') + dms('LayoutDuration') + dms('RecalcStyleDuration');
  console.log(`[metrics Δ] task ${taskMs}ms = script ${dms('ScriptDuration')} + layout ${dms('LayoutDuration')} + style ${dms('RecalcStyleDuration')} + その他 ${taskMs - known}ms / layout回数 ${Math.round((m1.LayoutCount || 0) - (m0.LayoutCount || 0))} / style回数 ${Math.round((m1.RecalcStyleCount || 0) - (m0.RecalcStyleCount || 0))} / JSヒープ ${Math.round((m1.JSHeapUsedSize || 0) / 1048576)}MB / DOM ${Math.round(m1.Nodes || 0)}`);
  if (args.eval) console.log(`eval ${args.eval} =`, JSON.stringify((await cdp.send('Runtime.evaluate', { expression: String(args.eval), returnByValue: true })).result?.value));
  if (traceRows) {
    for (const t of traceRows.slice(0, 2)) {
      console.log(`[trace] ${t.thread} pid=${t.pid} 忙しさ合計 ${t.busyMs}ms(自分の時間の名前別)`);
      for (const [n, ms] of t.rows) console.log(`  ${String(ms).padStart(6)}ms  ${n}`);
    }
  }
  if (getsRows) {
    const total = getsRows.reduce((a, g) => a + Math.max(0, g.bytes), 0);
    console.log(`[gets] 起動の ${windowMs / 1000}s の chrome.storage.local.get: ${getsRows.length}回 / 結果の合計 ${(total / 1048576).toFixed(1)}MB / 合計 ${getsRows.reduce((a, g) => a + g.ms, 0)}ms(並行なので足し算は目安)`);
    // 同じキーの組ごとの集計(何度も読み直している犯人を名指しする)
    const groups = new Map();
    for (const g of getsRows) { const k = g.label; const e = groups.get(k) || { n: 0, bytes: 0, ms: 0, one: g.bytes }; e.n += 1; e.bytes += Math.max(0, g.bytes); e.ms += g.ms; groups.set(k, e); }
    console.log('[gets-by-keys] 回数 / 結果の合計 / 1回の大きさ / キー');
    for (const [k, e] of [...groups].sort((x, y) => y[1].bytes - x[1].bytes).slice(0, 8)) console.log(`  ${String(e.n).padStart(4)}回 ${(e.bytes / 1048576).toFixed(1).padStart(5)}MB  ${(e.one / 1024).toFixed(0).padStart(6)}KB  ${k}`);
    for (const g of [...getsRows].sort((a, b) => b.bytes - a.bytes).slice(0, 0)) console.log(`  t+${String(g.at).padStart(5)}ms ${String(g.ms).padStart(5)}ms ${(g.bytes / 1024).toFixed(0).padStart(7)}KB keys=${g.nkeys}  ${g.label}`);
  }
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
