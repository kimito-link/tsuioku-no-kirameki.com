/**
 * 拡張プロセスのメモリが「何で」増えているかを時系列で見る(JS ヒープ / DOM ノード / リスナー / ドキュメント / OS 側メモリ)。
 *
 * 使い方: node scripts/perf-ab/growth.mjs --lv lv351523930 [--minutes 3] [--every 15] [--ext dir]
 *
 * 読み方:
 *  - OS メモリ(RSS)だけ増え、JSHeap が平ら → JS 以外(画像・DOM・Blink 側)が増えている。
 *  - JSHeap が増える → JS 側の蓄積(配列・Map・クロージャ)。ヒープスナップショットで中身を見る。
 *  - Nodes / JSEventListeners / Documents が増える → DOM やリスナーの積み残し(作りっぱなし)。
 */
import { launchWithExtension, enableAutoshow, parseArgs, sleep, shutdown, sampleExtensionProcessCpu } from './common.mjs';

const args = parseArgs();
if (!/^lv\d+$/.test(args.lv || '')) {
  console.error('usage: node scripts/perf-ab/growth.mjs --lv lv123456789 [--minutes 3] [--every 15]');
  process.exit(2);
}
const PORT = Number(args.port || 9334);
const totalMs = Number(args.minutes || 3) * 60000;
const everyMs = Number(args.every || 15) * 1000;

const { ctx, sw, userDataDir } = await launchWithExtension({ extDir: args.ext, debugPort: PORT });
let exitCode = 0;
try {
  await enableAutoshow(sw, true);
  const page = await ctx.newPage();
  page.goto(`https://live.nicovideo.jp/watch/${args.lv}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await sleep(20000);

  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const target = targets.find((t) => t.type === 'iframe' && /popup\.html/.test(t.url));
  if (!target) throw new Error('popup iframe target not found');
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
      setTimeout(() => rej(new Error('timeout ' + method)), 60000);
    });
  await send('Performance.enable');

  const t0 = Date.now();
  console.log('t(s)  OS(CPU/MB)         JSHeapUsed  JSHeapTotal  Nodes  Docs  Listeners  LayoutObjects');
  while (Date.now() - t0 < totalMs) {
    const os = sampleExtensionProcessCpu(userDataDir, 3);
    const m = Object.fromEntries((await send('Performance.getMetrics')).result.metrics.map((x) => [x.name, x.value]));
    const mb = (v) => ((v || 0) / 1048576).toFixed(0).padStart(5) + 'MB';
    console.log(
      `${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}  ${os.padEnd(20)} ${mb(m.JSHeapUsedSize)}   ${mb(m.JSHeapTotalSize)}    ` +
        `${String(m.Nodes).padStart(6)} ${String(m.Documents).padStart(4)} ${String(m.JSEventListeners).padStart(8)}  ${String(m.LayoutObjects || '').padStart(8)}`
    );
    await sleep(Math.max(0, everyMs - 3000));
  }
  ws.close();
} catch (e) {
  console.error('FAILED:', String(e));
  exitCode = 1;
} finally {
  await shutdown(ctx, userDataDir);
  process.exit(exitCode);
}
