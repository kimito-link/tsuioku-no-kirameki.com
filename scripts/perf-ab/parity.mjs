/**
 * 会場(venue.html)が「POP(popup.html)の鏡の投影」になっているかを、時系列で測る。
 *
 * 使い方: node scripts/perf-ab/parity.mjs --lv lv351523930 [--collect 60] [--at 5,10,15,25,40,60,90] [--ext dir]
 *
 * 手順: 視聴ページを collect 秒開いて記録を溜める → POP と会場を同時に開く → --at の秒数ごとに3つの集合を採取:
 *   POP  = POP の応援レーンの実 DOM(人の識別子(data-user-key。無ければタイトル)の集合)
 *   鏡   = chrome.storage の鏡(nls_lane_mirror_v2_<lv>)のセルの userId(無ければタイトル) + capturedAt/件数
 *   会場 = 会場の実 DOM
 * 読み方(原因の切り分け):
 *   会場 ≠ 鏡  … 会場が鏡を映していない(投影の破れ)
 *   鏡   ≠ POP … 鏡がPOPの画面と別物(例: 縮小ガード前の中身を鏡に出している)
 *   会場 = 鏡 でも 鏡の capturedAt が古い … 開いた直後に古い鏡を採っている(stale 採用)
 * 収束(各集合の差が 0 になる秒)が見える。許容は実測から決める(ここでは判定しない)。
 */
import { launchWithExtension, enableAutoshow, parseArgs, sleep, shutdown } from './common.mjs';

const args = parseArgs();
if (!/^lv\d+$/.test(args.lv || '')) {
  console.error('usage: node scripts/perf-ab/parity.mjs --lv lv123456789 [--collect 60] [--at 5,10,15,25,40,60,90]');
  process.exit(2);
}
const marks = String(args.at || '5,10,15,25,40,60,90').split(',').map(Number).filter((n) => n > 0).sort((a, b) => a - b);
const { ctx, sw, extId, userDataDir } = await launchWithExtension({ extDir: args.ext });
let code = 0;

const POP_IDS = { link: 'sceneStoryUserLaneLink', gift: 'sceneStoryUserLaneGift', ad: 'sceneStoryUserLaneAd', konta: 'sceneStoryUserLaneKonta', tanu: 'sceneStoryUserLaneTanu' };

const diff = (a, b) => {
  const sa = new Set(a);
  const sb = new Set(b);
  return { onlyA: [...sa].filter((x) => !sb.has(x)).length, onlyB: [...sb].filter((x) => !sa.has(x)).length };
};

try {
  await enableAutoshow(sw, false);
  const watch = await ctx.newPage();
  watch.goto(`https://live.nicovideo.jp/watch/${args.lv}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await sleep(Number(args.collect || 60) * 1000);

  const pop = await ctx.newPage();
  await pop.setViewportSize({ width: 664, height: 1000 });
  const ven = await ctx.newPage();
  await ven.setViewportSize({ width: 1280, height: 900 });
  const t0 = Date.now();
  await Promise.all([
    pop.goto(`chrome-extension://${extId}/popup.html?inline=1&dock=sidepanel&lv=${args.lv}`, { waitUntil: 'domcontentloaded' }),
    ven.goto(`chrome-extension://${extId}/venue.html?lv=${args.lv}`, { waitUntil: 'domcontentloaded' })
  ]);

  // 鏡の書き手別の書き込みを会場ページで控える(誰が・何人の鏡を・何回書いたか)。
  await ven.evaluate((lv) => {
    const key = `nls_lane_mirror_v2_${lv}`;
    window.__nlsMirrorWrites = [];
    chrome.storage.onChanged.addListener((ch) => {
      const m = ch[key] && ch[key].newValue;
      if (m) window.__nlsMirrorWrites.push({ at: Date.now(), writerId: m.writerId || '(なし)', picked: m.pickedLength || 0 });
    });
  }, args.lv);
  console.log('秒   POP  鏡   会場 | 会場-鏡(会場のみ/鏡のみ) | 鏡-POP(鏡のみ/POPのみ) | 鏡の古さ(s) 鏡KB 申告(picked/候補)');
  for (const sec of marks) {
    const wait = sec * 1000 - (Date.now() - t0);
    if (wait > 0) await sleep(wait);
    const popTitles = await pop.evaluate((ids) => {
      const out = [];
      for (const id of Object.values(ids)) {
        const el = document.getElementById(id);
        if (el) for (const c of el.querySelectorAll('.nl-story-userlane-cell')) out.push((c.getAttribute('data-user-key') || c.title).replace(/^u:/, ''));
      }
      return out;
    }, POP_IDS);
    const venTitles = await ven.evaluate(() => [...document.querySelectorAll('.nl-story-userlane-cell')].map((c) => (c.getAttribute('data-user-key') || c.title).replace(/^u:/, '')));
    const mirror = await ven.evaluate(async (lv) => {
      const key = `nls_lane_mirror_v2_${lv}`;
      const r = await chrome.storage.local.get(key);
      const m = r[key];
      if (!m) return null;
      const titles = [];
      for (const tier of ['link', 'gift', 'ad', 'konta', 'tanu']) for (const c of m[tier] || []) titles.push(String(c.userId || c.title).replace(/^u:/, ''));
      return { titles, capturedAt: m.capturedAt || 0, kb: Math.round(JSON.stringify(m).length / 1024), picked: m.pickedLength || 0, total: m.totalCandidates || 0 };
    }, args.lv);
    const mt = mirror ? mirror.titles : [];
    const dv = diff(venTitles, mt);
    const dm = diff(mt, popTitles);
    const age = mirror && mirror.capturedAt ? ((Date.now() - mirror.capturedAt) / 1000).toFixed(0) : '-';
    console.log(
      `${String(sec).padStart(3)}  ${String(popTitles.length).padStart(4)} ${String(mt.length).padStart(4)} ${String(venTitles.length).padStart(5)} | ` +
        `${String(dv.onlyA).padStart(5)}/${String(dv.onlyB).padEnd(5)}            | ${String(dm.onlyA).padStart(5)}/${String(dm.onlyB).padEnd(5)}              | ${age}  ${mirror ? mirror.kb + 'KB ' + mirror.picked + '/' + mirror.total : '(鏡なし)'}`
    );
  }
  const writes = await ven.evaluate(() => window.__nlsMirrorWrites || []);
  const byWriter = new Map();
  for (const w of writes) {
    const e = byWriter.get(w.writerId) || { n: 0, min: Infinity, max: 0 };
    e.n += 1; e.min = Math.min(e.min, w.picked); e.max = Math.max(e.max, w.picked);
    byWriter.set(w.writerId, e);
  }
  if (args.writes) console.log('書き込み列(t秒:書き手:人数): ' + writes.map((w) => `${((w.at - t0) / 1000).toFixed(0)}:${w.writerId.slice(1, 4)}:${w.picked}`).join(' '));
  console.log('鏡の書き手別(開いてから): ' + ([...byWriter].map(([id, e]) => `${id}: ${e.n}回 ${e.min}〜${e.max}人`).join(' / ') || '書き込み無し'));
} catch (e) {
  console.error('FAILED:', String(e));
  code = 1;
} finally {
  await shutdown(ctx, userDataDir);
  process.exit(code);
}
