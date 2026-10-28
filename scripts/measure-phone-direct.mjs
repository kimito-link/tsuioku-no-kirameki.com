#!/usr/bin/env node
/**
 * measure-phone-direct.mjs — 「iPhone アプリが自分でニコ生のコメントを取る」(拡張なし 第3段)の前に測る。
 *
 * ■ 何を確かめるか(計画 /mnt/project-files/smartphone/plan-6-no-extension.md ③)
 *   1. 視聴の WebSocket が、アプリの WebView の Origin(https://app.tsuioku-no-kirameki.com)でも
 *      握手できるか(できなければ WebView の WebSocket は使えない=ネイティブの部品が要る)。
 *   2. CORS: watch ページ・NDGR(mpn.live)・koken・nicoad が、アプリの Origin に読ませるか
 *      (Access-Control-Allow-Origin)。読ませないものはネイティブ通信(CapacitorHttp)で取る。
 *   3. 遅れ: NDGR の segment を「最後まで読む GET」(CapacitorHttp と同じ取り方)で前方向に追ったとき、
 *      コメントが流れてから手元に届くまでの秒数(p50 / p90)。
 *   4. 続けて取ったときに 429 / 403 が出ないか(回数制限)。
 *
 * ■ 秘密を出さない
 *   webSocketUrl・viewUri・segment の URL は表示しない(nicoliveGuest.js と同じ約束)。数と時間だけ出す。
 *
 * 使い方(りんくの PC。ニコニコへ届く場所で):
 *   node scripts/measure-phone-direct.mjs lv123456789 [分=3]
 *   lv を省くと app.tsuioku-no-kirameki.com/api/live-ranking の先頭の放送中の配信を使う。
 */

import { fetchWatchHtml, fetchViewUri } from '../src/server/nicoliveGuest.js';
import { extractEmbeddedData } from '../src/lib/nicoliveRankingPick.js';
import { pickWsUrlFromEmbeddedData, pickProgramBeginAt } from '../src/lib/embeddedDataExtract.js';
import { crawlNdgrForward } from '../src/lib/ndgrForwardCrawl.js';

const APP_ORIGIN = 'https://app.tsuioku-no-kirameki.com';
const LV_RE = /^lv\d{6,15}$/;

async function pickLv(arg) {
  if (LV_RE.test(String(arg || ''))) return String(arg);
  const r = await fetch(`${APP_ORIGIN}/api/live-ranking`);
  const j = await r.json();
  const lv = j?.lives?.[0]?.liveId;
  if (!LV_RE.test(String(lv || ''))) throw new Error('放送中の配信が見つかりません。lv を渡してください。');
  return lv;
}

/** Origin を付けた GET の Access-Control-Allow-Origin と状態だけを返す。 */
async function corsProbe(url) {
  try {
    const r = await fetch(url, { headers: { Origin: APP_ORIGIN } });
    const acao = r.headers.get('access-control-allow-origin') || '(なし)';
    try { await r.arrayBuffer(); } catch { /* 中身は使わない */ }
    return { status: r.status, acao, readable: acao === '*' || acao === APP_ORIGIN };
  } catch (e) {
    return { status: 0, acao: `(通信失敗 ${e?.name || e})`, readable: false };
  }
}

/** Origin ごとに WebSocket の握手(messageServer まで来るか)を試す。 */
async function wsProbe(wsUrl, origin) {
  /** Node の WebSocket(undici)は第2引数の headers で Origin を付けられる。 */
  class WithOrigin extends globalThis.WebSocket {
    constructor(url) {
      super(url, origin ? { headers: { Origin: origin } } : undefined);
    }
  }
  const t0 = Date.now();
  const r = await fetchViewUri(wsUrl, { timeoutMs: 8000, WebSocketImpl: WithOrigin });
  return { ok: Boolean(r.viewUri), error: r.error || '', ms: Date.now() - t0, viewUri: r.viewUri };
}

function pct(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

async function main() {
  const lv = await pickLv(process.argv[2]);
  const minutes = Number(process.argv[3]) > 0 ? Number(process.argv[3]) : 3;
  console.log(`# 計測 ${lv}(${minutes}分)`);

  const html = await fetchWatchHtml(lv);
  const props = extractEmbeddedData(html);
  const wsUrl = props ? pickWsUrlFromEmbeddedData(props) : '';
  if (!wsUrl) throw new Error('watch ページから視聴の接続先を読めませんでした(放送が終わっているかも)。');
  // vpos の基準は vposBaseTime(無ければ開始時刻)。秒でも ms でも来るので ms にそろえる。
  const vb = Number(props?.program?.vposBaseTime) || 0;
  const beginAtMs = vb > 0 ? (vb < 1e12 ? vb * 1000 : vb) : Number(pickProgramBeginAt(props)) || 0;

  console.log('\n## 1. WebSocket の握手(Origin ごと)');
  /** @type {string} */
  let viewUri = '';
  for (const origin of ['', 'https://live.nicovideo.jp', APP_ORIGIN, 'capacitor://localhost']) {
    // ★1つの wsUrl(audience_token)を使い回すと2本目以降が断られることがあるので、毎回 watch を取り直す。
    const h = origin ? await fetchWatchHtml(lv) : html;
    const p = extractEmbeddedData(h);
    const u = p ? pickWsUrlFromEmbeddedData(p) : '';
    const r = u ? await wsProbe(u, origin) : { ok: false, error: 'no_ws_url', ms: 0, viewUri: '' };
    console.log(`- Origin ${origin || '(なし)'}: ${r.ok ? 'OK' : `NG (${r.error})`} ${r.ms}ms`);
    if (r.ok && !viewUri) viewUri = r.viewUri;
  }
  if (!viewUri) throw new Error('どの Origin でも握手できませんでした。');

  console.log('\n## 2. CORS(アプリの Origin で読めるか)');
  const probes = {
    'watch ページ': `https://live.nicovideo.jp/watch/${lv}`,
    'NDGR view(mpn.live)': `${viewUri}${viewUri.includes('?') ? '&' : '?'}at=now`,
    'ギフト順位(koken)': `https://api.koken.nicovideo.jp/v1/userperspective/contents/gift/live/${lv}/ranking?rank=10`,
    '広告順位(nicoad)': `https://api.nicoad.nicovideo.jp/v1/contents/live/${lv}/ranking/contribution?limit=10`
  };
  for (const [name, url] of Object.entries(probes)) {
    const r = await corsProbe(url);
    console.log(`- ${name}: ${r.status} ACAO=${r.acao} → ${r.readable ? 'WebView の fetch で読める' : 'ネイティブ通信が要る'}`);
  }

  console.log(`\n## 3-4. 前方向に ${minutes} 分追う(最後まで読む GET)`);
  const statuses = new Map();
  const lags = [];
  let chats = 0;
  const ac = new AbortController();
  const stopAt = Date.now() + minutes * 60_000;
  const fetchBinary = async (url, o) => {
    try {
      const r = await fetch(url, { signal: o?.signal });
      statuses.set(r.status, (statuses.get(r.status) || 0) + 1);
      return { ok: r.ok, status: r.status, bytes: r.ok ? new Uint8Array(await r.arrayBuffer()) : new Uint8Array() };
    } catch {
      statuses.set(0, (statuses.get(0) || 0) + 1);
      return { ok: false, status: 0, bytes: new Uint8Array() };
    }
  };
  const timer = setTimeout(() => ac.abort(), minutes * 60_000);
  const gen = crawlNdgrForward({ viewBase: viewUri, fetchBinary, signal: ac.signal });
  let stopReason = '';
  for (;;) {
    const step = await gen.next();
    if (step.done) { stopReason = step.value?.stopReason || ''; break; }
    const got = Date.now();
    for (const c of step.value.chats || []) {
      chats += 1;
      // vpos は放送開始からの 1/100 秒。始まりの時刻が取れたときだけ遅れを出す。
      if (beginAtMs > 0 && Number.isFinite(c.vpos)) {
        const lagSec = (got - (beginAtMs + Number(c.vpos) * 10)) / 1000;
        if (lagSec > -5 && lagSec < 600) lags.push(lagSec);
      }
    }
    if (Date.now() > stopAt) break;
  }
  clearTimeout(timer);
  ac.abort();
  console.log(`- 受け取ったコメント: ${chats} 件・終わり方: ${stopReason || '時間切れ'}`);
  console.log(`- 遅れ(秒): p50=${pct(lags, 50)?.toFixed(1) ?? '—'} p90=${pct(lags, 90)?.toFixed(1) ?? '—'}(${lags.length} 件で計算)`);
  console.log(`- HTTP の状態: ${[...statuses].map(([s, n]) => `${s}×${n}`).join(' ') || '—'}`);
  const limited = (statuses.get(429) || 0) + (statuses.get(403) || 0);
  console.log(`- 回数制限(429/403): ${limited ? `${limited} 回 → 間隔を広げる必要あり` : 'なし'}`);
}

main().catch((e) => {
  console.error(`計測できませんでした: ${e?.message || e}`);
  process.exit(1);
});
