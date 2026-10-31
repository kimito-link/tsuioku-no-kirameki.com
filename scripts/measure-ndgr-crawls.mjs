#!/usr/bin/env node
/**
 * measure-ndgr-crawls.mjs — 拡張の NDGR 巡回(前方向の立て直し・過去埋め)を本物の配信に当てて数える。
 *
 * ■ 何を確かめるか(2026-10-31・v0.1.1842/1843 の修正の実データ確認)
 *   1. `?at=now` の応答を decodeChunkedEntry で読み、next.at が「いま」に近い unixtime か。
 *      (直す前は長さの数値 34 などを拾っていた)
 *   2. crawlNdgrForward(入口が死んだときの立て直し)を N 分回して、取れたコメント数と止まった理由。
 *      (直す前は 3分で 0件だった)
 *   3. crawlNdgrBackward / crawlNdgrBackwardDeterministic(過去埋め)を上限つきで回して、取れた数と止まった理由。
 *
 * ■ 負荷: 1本ずつ順に回す。過去埋めは segment 20本・3000件で打ち切る。拡張と同じ間隔・429 の待ちを使う。
 * ■ 秘密を出さない: webSocketUrl・viewUri・segment の URL は表示しない。数と理由だけ出す。
 *
 * 使い方(りんくの PC。ニコニコへ届く場所で):
 *   node scripts/measure-ndgr-crawls.mjs [lv123456789] [前方向の分=2]
 *   lv を省くと app.tsuioku-no-kirameki.com/api/live-ranking の放送中でコメントの一番多い配信を使う。
 */

import { fetchWatchHtml, fetchViewUri } from '../src/server/nicoliveGuest.js';
import { extractEmbeddedData } from '../src/lib/nicoliveRankingPick.js';
import { pickWsUrlFromEmbeddedData } from '../src/lib/embeddedDataExtract.js';
import { decodeChunkedEntry } from '../src/lib/ndgrDecode.js';
import { crawlNdgrForward } from '../src/lib/ndgrForwardCrawl.js';
import { crawlNdgrBackward, crawlNdgrBackwardDeterministic } from '../src/lib/ndgrBackfillCrawl.js';

const APP_ORIGIN = 'https://app.tsuioku-no-kirameki.com';
const LV_RE = /^lv\d{6,15}$/;
const BACKFILL_CAPS = { segments: 20, rows: 3000 };
const BACKFILL_TIMEOUT_MS = 90_000;

async function pickLv(arg) {
  if (LV_RE.test(String(arg || ''))) return String(arg);
  const r = await fetch(`${APP_ORIGIN}/api/live-ranking`);
  const j = await r.json();
  const lives = (Array.isArray(j?.lives) ? j.lives : []).filter((/** @type {any} */ l) => l?.onAir !== false);
  lives.sort((/** @type {any} */ a, /** @type {any} */ b) => (Number(b?.commentCount) || 0) - (Number(a?.commentCount) || 0));
  const lv = lives[0]?.liveId;
  if (!LV_RE.test(String(lv || ''))) throw new Error('放送中の配信が見つかりません。lv を渡してください。');
  return lv;
}

/** 拡張の fetchBinary と同じ形({ ok, status, bytes })。 */
async function fetchBinary(url, o = {}) {
  const res = await fetch(url, { signal: o.signal, credentials: 'omit' });
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { ok: res.ok, status: res.status, bytes };
}

/**
 * async generator を最後まで(または時間切れまで)回して、取れたコメント数と戻り値を返す。
 * @param {AsyncGenerator<any, any, void>} gen
 * @param {AbortController} ac
 * @param {number} timeoutMs
 */
async function drain(gen, ac, timeoutMs) {
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let chats = 0;
  let steps = 0;
  let ret;
  try {
    for (;;) {
      const r = await gen.next();
      if (r.done) { ret = r.value; break; }
      steps += 1;
      chats += Array.isArray(r.value?.chats) ? r.value.chats.length : 0;
    }
  } finally {
    clearTimeout(timer);
  }
  return { chats, steps, ret };
}

async function main() {
  const lv = await pickLv(process.argv[2]);
  const minutes = Number(process.argv[3]) > 0 ? Number(process.argv[3]) : 2;
  console.log(`# NDGR 巡回の実データ確認 ${lv}`);

  const html = await fetchWatchHtml(lv);
  const props = extractEmbeddedData(html);
  const wsUrl = props ? pickWsUrlFromEmbeddedData(props) : '';
  if (!wsUrl) throw new Error('watch ページから視聴の接続先を読めませんでした(放送が終わっているかも)。');
  const { viewUri, error } = await fetchViewUri(wsUrl, { timeoutMs: 8000 });
  if (!viewUri) throw new Error(`view の入口を取れませんでした(${error || '不明'})。`);

  console.log('\n## 1. ?at=now の next.at');
  const nowRes = await fetchBinary(`${viewUri}${viewUri.includes('?') ? '&' : '?'}at=now`);
  const nav = decodeChunkedEntry(nowRes.bytes);
  const nowSec = Math.floor(Date.now() / 1000);
  const diff = nav.nextAt == null ? null : nav.nextAt - nowSec;
  console.log(`- 状態 ${nowRes.status}・${nowRes.bytes.length} バイト・segment ${nav.segmentUris.length}・previous ${nav.previousUris.length}・backward ${nav.backwardUri ? 'あり' : 'なし'}`);
  console.log(`- next.at: ${nav.nextAt == null ? 'なし' : `いまから ${diff} 秒`} → ${diff != null && Math.abs(diff) < 600 ? 'OK(いまに近い unixtime)' : 'NG'}`);

  console.log(`\n## 2. 前方向(立て直し)を ${minutes} 分`);
  {
    const ac = new AbortController();
    const t0 = Date.now();
    const r = await drain(crawlNdgrForward({ viewBase: viewUri, fetchBinary, signal: ac.signal }), ac, minutes * 60_000);
    console.log(`- コメント ${r.chats} 件・${Math.round((Date.now() - t0) / 1000)} 秒・止まった理由 ${r.ret?.stopReason}・segment ${r.ret?.segmentsFetched ?? '—'} 本`);
  }

  for (const [name, fn] of [['過去埋め(従来)', crawlNdgrBackward], ['過去埋め(決定的)', crawlNdgrBackwardDeterministic]]) {
    console.log(`\n## 3. ${name}(segment ${BACKFILL_CAPS.segments} 本・${BACKFILL_CAPS.rows} 件・${BACKFILL_TIMEOUT_MS / 1000} 秒で打ち切り)`);
    const ac = new AbortController();
    const t0 = Date.now();
    try {
      const r = await drain(fn({ viewBase: viewUri, fetchBinary, signal: ac.signal, caps: BACKFILL_CAPS }), ac, BACKFILL_TIMEOUT_MS);
      console.log(`- コメント ${r.chats} 件・${Math.round((Date.now() - t0) / 1000)} 秒・止まった理由 ${r.ret?.stopReason}・segment ${r.ret?.segmentsFetched ?? '—'} 本`);
    } catch (e) {
      console.log(`- 失敗: ${e?.name || e}`);
    }
  }
}

main().catch((e) => {
  console.error(`計測できませんでした: ${e?.message || e}`);
  process.exit(1);
});
