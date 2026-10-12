/**
 * 視聴ページに埋め込まれたパネル(popup.html?inline=1)の【メインスレッド CPU プロファイル】を取る。
 *
 * 使い方:
 *   node scripts/perf-ab/profile-popup.mjs --lv lv351523930 [--ext <拡張フォルダ>] [--settle 25] [--seconds 10] [--save out.cpuprofile.json]
 *   (--settle 65 で「読み込みの1分後以降の重い時間帯」を測れる。--save は呼び出し元をたどる解析用)
 *   (放送中の lv を渡す。ranking: https://live.nicovideo.jp/ranking)
 *
 * 出力: 窓の長さ・暇な時間・稼働率(busy%)・自分の時間の上位・スタック上に居た時間(含む)の上位。
 *   ★「修正前 vs 修正後」は make-before.mjs で修正前の拡張を作り、--ext で切り替えて【続けて】2回走らせる。
 *   ★稼働率が 100% 近いなら、メインスレッドが飽和(=その上位関数が犯人)。ヘッドレスなので GPU 合成は含まない。
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, launchWithExtension, enableAutoshow, parseArgs, sleep, shutdown, summarizeProfile } from './common.mjs';

const args = parseArgs();
if (!/^lv\d+$/.test(args.lv || '')) {
  console.error('usage: node scripts/perf-ab/profile-popup.mjs --lv lv123456789 [--ext dir] [--settle 25] [--seconds 10]');
  process.exit(2);
}
const settleMs = Number(args.settle || 25) * 1000;
const windowMs = Number(args.seconds || 10) * 1000;
const PORT = Number(args.port || 9333);

const { ctx, sw, userDataDir } = await launchWithExtension({ extDir: args.ext, debugPort: PORT });
let exitCode = 0;
try {
  await enableAutoshow(sw, true);
  const page = await ctx.newPage();
  page.goto(`https://live.nicovideo.jp/watch/${args.lv}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await sleep(settleMs);

  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const target = targets.find((t) => t.type === 'iframe' && /popup\.html/.test(t.url));
  if (!target) throw new Error('popup iframe target not found (放送が終わっている/autoshow が効いていない可能性)');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let nextId = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d);
      pending.delete(d.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++nextId;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => rej(new Error('timeout ' + method)), 120000);
    });

  // メインスレッド時間の内訳(スクリプト/スタイル計算/レイアウト/その他)。「native only」の正体を見る。
  await send('Performance.enable');
  const metricsOf = async () => Object.fromEntries((await send('Performance.getMetrics')).result.metrics.map((m) => [m.name, m.value]));
  const m0 = await metricsOf();
  await send('Profiler.enable');
  await send('Profiler.setSamplingInterval', { interval: 2000 });
  await send('Profiler.start');
  await sleep(windowMs);
  const m1 = await metricsOf();
  const { result } = await send('Profiler.stop');
  if (args.save) fs.writeFileSync(String(args.save), JSON.stringify(result.profile));
  const s = summarizeProfile(result.profile, { top: Number(args.top || 22) });

  console.log(`ext=${args.ext || 'extension/'}  lv=${args.lv}  settle=${settleMs / 1000}s`);
  console.log(`window ${windowMs / 1000}s → sampled ${s.sampledMs.toFixed(0)}ms  idle ${s.idleMs.toFixed(0)}ms  BUSY ${s.busyPct}%`);
  {
    const d = (k) => (((m1[k] || 0) - (m0[k] || 0)) * 1000);
    const task = d('TaskDuration');
    const script = d('ScriptDuration');
    const layout = d('LayoutDuration');
    const style = d('RecalcStyleDuration');
    console.log(
      `main thread ${task.toFixed(0)}ms = script ${script.toFixed(0)} + layout ${layout.toFixed(0)} + style ${style.toFixed(0)} + other ${(task - script - layout - style).toFixed(0)}` +
        `   (Nodes ${m1.Nodes}, JSHeap ${((m1.JSHeapUsedSize || 0) / 1048576).toFixed(0)}MB, LayoutCount +${(m1.LayoutCount || 0) - (m0.LayoutCount || 0)}, RecalcStyleCount +${(m1.RecalcStyleCount || 0) - (m0.RecalcStyleCount || 0)})`
    );
  }
  console.log('--- self time (ms)');
  for (const [k, t] of s.self) console.log(`${t.toFixed(0).padStart(7)}  ${k}`);
  console.log('--- inclusive (ms)');
  for (const [k, t] of s.inclusive.slice(0, Number(args.top || 16))) console.log(`${t.toFixed(0).padStart(7)}  ${k}`);
  console.log('--- ENTRY POINTS (誰が仕事を始めているか・スタックの一番下)');
  // minify された dist の「行:列」から、その関数の冒頭を読んで正体を示す(無名の入口を名指しするため)
  const distFile = path.join(args.ext || path.join(REPO_ROOT, 'extension'), 'dist', 'popup.js');
  const distLines = fs.existsSync(distFile) ? fs.readFileSync(distFile, 'utf8').split(String.fromCharCode(10)) : [];
  for (const [k, ms] of s.entries.slice(0, 14)) {
    const m = /(dist\/popup\.js):(\d+):(\d+)$/.exec(k);
    const snippet = m && distLines[Number(m[2]) - 1] ? '   ⇒ ' + distLines[Number(m[2]) - 1].slice(Number(m[3]) - 1, Number(m[3]) + 110).replace(/\s+/g, ' ') : '';
    console.log(`${ms.toFixed(0).padStart(7)}  ${k}${snippet}`);
  }
  ws.close();
} catch (e) {
  console.error('FAILED:', String(e));
  exitCode = 1;
} finally {
  await shutdown(ctx, userDataDir);
  process.exit(exitCode);
}
