/**
 * 状態画面(status.html)が「自動公開(WEBへ2分ごとに送信)」を実際に試みるかを、一時プロファイルで再現する。
 *
 * 背景(2026-10-15): 実機で鍵・同意・送信先が保存済みなのに、サーバーに拡張からの送信が1件も届かなかった。
 *   サーバーの記録(api/status.js の status-ingest)でも 0 件=拡張が送っていない。どの条件で止まるかを
 *   拡張の画面を見られない私の側で特定するための再現。
 *
 * 使い方: node scripts/perf-ab/status-publish-repro.mjs --lv lv351594605 [--wait 150] [--no-watch]
 *   - 一時プロファイルで拡張を起動し、共有設定(鍵・同意)を service worker 経由で storage へ入れる
 *     (鍵は環境変数 NL_STATUS_INGEST_KEY / NL_STATUS_VIEW_TOKEN / NL_STATUS_APP_ORIGIN から読む=.env。画面にも出さない)
 *   - 視聴ページ(--no-watch で省略)→ status.html を開き、/api/status への POST を観察する
 *   - ★本物のサーバーへは送らない: /api/status への要求は page.route で止めて 200 を返す(試みた事実だけを数える)
 *
 * 読み方: 「POST の試み N 回」が 0 なら、判定(shouldAutoPublish)のどこかで止まっている(下に各条件の実測を出す)。
 */
import { launchWithExtension, parseArgs, sleep, shutdown } from './common.mjs';

try { process.loadEnvFile(); } catch { /* .env が無くても続ける */ }

const args = parseArgs();
const waitMs = Number(args.wait || 150) * 1000;
const withWatch = args['no-watch'] === undefined && args.watch !== '0';
const ingestKey = process.env.NL_STATUS_INGEST_KEY || '';
const viewToken = process.env.NL_STATUS_VIEW_TOKEN || '';
const appOrigin = process.env.NL_STATUS_APP_ORIGIN || 'https://app.tsuioku-no-kirameki.com';
if (!ingestKey || !viewToken) { console.error('NL_STATUS_INGEST_KEY / NL_STATUS_VIEW_TOKEN が .env にありません'); process.exit(2); }
if (withWatch && !/^lv\d+$/.test(args.lv || '')) { console.error('usage: --lv lv123456789 (または --no-watch)'); process.exit(2); }

const { ctx, sw, extId, userDataDir } = await launchWithExtension({});
let exitCode = 0;
try {
  // 共有設定と同意を拡張の storage へ入れる(実機と同じキー名・同じ形)。
  await sw.evaluate(async ({ k, t, o }) => {
    await chrome.storage.local.set({
      nls_status_upload_config_v1: { ingestKey: k, viewToken: t, appOrigin: o },
      nls_web_publish_opt_in: true
    });
  }, { k: ingestKey, t: viewToken, o: appOrigin });

  let attempts = 0;
  const seen = [];
  await ctx.route('**/api/status', async (route) => {
    const req = route.request();
    if (req.method() === 'POST') { attempts += 1; seen.push(`${new Date().toISOString().slice(11, 19)} POST bytes=${(req.postData() || '').length}`); }
    // ★本物のサーバーへは出さない。試みた事実だけを数える。
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  if (withWatch) {
    const watch = await ctx.newPage();
    watch.goto(`https://live.nicovideo.jp/watch/${args.lv}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await sleep(30000);
  }
  const page = await ctx.newPage();
  page.on('console', (m) => { const t = m.text(); if (/publish|upload|公開|送信/i.test(t)) console.log('[status console]', t.slice(0, 160)); });
  await page.goto(`chrome-extension://${extId}/status.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const t0 = Date.now();
  while (Date.now() - t0 < waitMs) {
    await sleep(5000);
    if (attempts > 0) break;
  }
  // 条件の実測: 同意・鍵・視聴中の配信・直近の送信結果の記録
  const gates = await page.evaluate(async () => {
    const bag = await chrome.storage.local.get(['nls_web_publish_opt_in', 'nls_status_upload_config_v1', 'nls_liveview_publish_outcome_v1']);
    const cfg = bag.nls_status_upload_config_v1 || {};
    return {
      optIn: bag.nls_web_publish_opt_in === true,
      hasKeys: Boolean(cfg.ingestKey && cfg.viewToken),
      outcomeRecorded: Boolean(bag.nls_liveview_publish_outcome_v1),
      livesCardText: (document.querySelector('#lives')?.innerText || document.body.innerText || '').slice(0, 160).replace(/\s+/g, ' ')
    };
  }).catch((e) => ({ error: String(e) }));
  console.log(`POST の試み ${attempts} 回 / 待った ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  for (const l of seen) console.log('  ', l);
  console.log('条件の実測:', JSON.stringify(gates));
  if (attempts === 0) exitCode = 3;
} catch (e) {
  console.error('FAILED:', String(e));
  exitCode = 1;
} finally {
  await shutdown(ctx, userDataDir);
}
process.exit(exitCode);
