/**
 * 拡張プロセス(--extension-process)の CPU%・メモリが、ページを開くたびにどう積み上がるかを時系列で見る。
 *
 * 使い方:
 *   node scripts/perf-ab/cpu-timeline.mjs --lv lv351523930 [--lv2 lv351527130] [--status] [--side] [--ext dir] [--autoshow 0]
 *   --autoshow 0 : 視聴ページ内パネルを出さない(content script だけ)=パネルが原因かの切り分け用
 *   --extra "--blink-settings=imagesEnabled=false" : Chromium に追加の起動引数を渡す(切り分け用)
 *
 * 見方: baseline(開く前)→ 各ページを開いた直後 → steady(安定後)。
 *   例(2026-10-11 実測・保存データ空・配信1つ): パネルあり 113%/885MB→1.9GB、パネルなし 2〜3%/250MB。
 */
import { launchWithExtension, enableAutoshow, parseArgs, sleep, shutdown, sampleExtensionProcessCpu } from './common.mjs';

const args = parseArgs();
if (!/^lv\d+$/.test(args.lv || '')) {
  console.error('usage: node scripts/perf-ab/cpu-timeline.mjs --lv lv123456789 [--lv2 ...] [--status] [--side] [--autoshow 0]');
  process.exit(2);
}
const lives = [args.lv, args.lv2].filter(Boolean);
const t0 = Date.now();
const el = () => `${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s`;

const { ctx, sw, extId, userDataDir } = await launchWithExtension({ extDir: args.ext, extraArgs: args.extra ? String(args.extra).split(' ') : [] });
try {
  await enableAutoshow(sw, args.autoshow !== '0');
  console.log(el(), 'baseline         ', sampleExtensionProcessCpu(userDataDir, 5));
  for (const lv of lives) {
    const p = await ctx.newPage();
    p.goto(`https://live.nicovideo.jp/watch/${lv}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await sleep(4000);
    console.log(el(), `opened ${lv}`.padEnd(17), sampleExtensionProcessCpu(userDataDir, 5));
  }
  if (args.status) {
    const p = await ctx.newPage();
    await p.goto(`chrome-extension://${extId}/status.html`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    console.log(el(), 'opened status.html', sampleExtensionProcessCpu(userDataDir, 5));
  }
  if (args.side) {
    const p = await ctx.newPage();
    await p.goto(`chrome-extension://${extId}/sidepanel.html`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    console.log(el(), 'opened sidepanel ', sampleExtensionProcessCpu(userDataDir, 5));
  }
  for (let i = 0; i < Number(args.steady || 4); i += 1) {
    await sleep(15000);
    console.log(el(), 'steady           ', sampleExtensionProcessCpu(userDataDir, 5));
  }
} finally {
  await shutdown(ctx, userDataDir);
  process.exit(0);
}
