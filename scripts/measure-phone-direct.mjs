#!/usr/bin/env node
/**
 * measure-phone-direct.mjs — 「iPhone アプリが自分でニコ生のコメントを取る」(拡張なし 第3段)の前に測る。
 *
 * ■ 何を確かめるか(計画 /mnt/project-files/smartphone/plan-6-no-extension.md ③)
 *   1. 視聴の WebSocket が、アプリの WebView の Origin(https://app.tsuioku-no-kirameki.com)でも
 *      握手できるか(できなければ WebView の WebSocket は使えない=ネイティブの部品が要る)。
 *   2. CORS: watch ページ・NDGR(mpn.live)・koken・nicoad が、アプリの Origin に読ませるか
 *      (Access-Control-Allow-Origin)。読ませないものはネイティブ通信(CapacitorHttp)で取る。
 *   3. 遅れ: view を next.at で辿り、segment を「届きしだい読む」(ネイティブ部品)と
 *      「最後まで読む」(CapacitorHttp)の両方で、コメントの時刻(meta.at)から手元に届くまでの秒数(p50 / p90)。
 *      ★src/lib/ndgrForwardCrawl.js は使わない。1回目の計測で segment をほぼ取れなかった(view 91回・segment 4本・12バイト)ため、
 *        公開の型どおりに番号で読む小さな版をここに置いた(結果しだいで lib 側を直す)。
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
import { pickWsUrlFromEmbeddedData } from '../src/lib/embeddedDataExtract.js';
import { pbForEach, decodeChunkedMessage } from '../src/lib/ndgrDecode.js';
import { splitLengthDelimitedMessagesWithTail } from '../src/lib/lengthDelimitedStream.js';

const APP_ORIGIN = 'https://app.tsuioku-no-kirameki.com';
const LV_RE = /^lv\d{6,15}$/;

async function pickLv(arg) {
  if (LV_RE.test(String(arg || ''))) return String(arg);
  const r = await fetch(`${APP_ORIGIN}/api/live-ranking`);
  const j = await r.json();
  // コメントが0件だと遅れを測れないので、放送中でコメントの一番多い配信を選ぶ。
  const lives = (Array.isArray(j?.lives) ? j.lives : []).filter((/** @type {any} */ l) => l?.onAir !== false);
  lives.sort((/** @type {any} */ a, /** @type {any} */ b) => (Number(b?.commentCount) || 0) - (Number(a?.commentCount) || 0));
  const lv = lives[0]?.liveId;
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

  console.log(`\n## 3-4. 前方向に ${minutes} 分追う(公開の型どおりに読む)`);
  const r = await followLive(viewUri, minutes);
  console.log(`- view: ${r.viewGets} 回(区切り ${r.entryKinds})・segment: ${r.segGets} 本(${r.segBytes} バイト)`);
  console.log(`- 受け取ったコメント: ${r.chats} 件(時刻つき ${r.lagsStream.length} 件)`);
  const fmt = (/** @type {number[]} */ a) =>
    `p50=${pct(a, 50)?.toFixed(1) ?? '—'} p90=${pct(a, 90)?.toFixed(1) ?? '—'}`;
  console.log(`- 遅れ(秒・届きしだい読む=ネイティブ部品): ${fmt(r.lagsStream)}`);
  console.log(`- 遅れ(秒・最後まで読む=CapacitorHttp): ${fmt(r.lagsFull)}`);
  console.log(`- HTTP の状態: ${[...r.statuses].map(([k, n]) => `${k}×${n}`).join(' ') || '—'}`);
  const limited = (r.statuses.get(429) || 0) + (r.statuses.get(403) || 0);
  console.log(`- 回数制限(429/403): ${limited ? `${limited} 回 → 間隔を広げる必要あり` : 'なし'}`);
  if (r.note) console.log(`- メモ: ${r.note}`);
}

/**
 * Timestamp { seconds=1, nanos=2 } を ms に。
 * @param {Uint8Array} b @param {number} s @param {number} e
 */
function tsMs(b, s, e) {
  let sec = 0;
  let ns = 0;
  pbForEach(b, s, e, (fn, wt, val) => {
    if (wt !== 0) return;
    if (fn === 1) sec = Number(val) || 0;
    if (fn === 2) ns = Number(val) || 0;
  });
  return sec * 1000 + Math.floor(ns / 1e6);
}

/**
 * view の1区切り(ChunkedEntry: segment=1 / backward=2 / previous=3 / next=4)を読む。
 * 公開の型(n-air-app/nicolive-comment-protobuf)どおりに番号で読む。
 * @param {Uint8Array} f
 */
function readEntry(f) {
  /** @type {{ kind: string, uri?: string, untilMs?: number, at?: number }} */
  const out = { kind: '' };
  pbForEach(f, 0, f.length, (fn, wt, _v, s, e) => {
    if (wt !== 2) return;
    if (fn === 1 || fn === 3) {
      out.kind = fn === 1 ? 'segment' : 'previous';
      pbForEach(f, s, e, (gn, gw, _gv, gs, ge) => {
        if (gw !== 2) return;
        if (gn === 2) out.untilMs = tsMs(f, gs, ge);
        if (gn === 3) out.uri = new TextDecoder().decode(f.subarray(gs, ge));
      });
    } else if (fn === 2) {
      out.kind = 'backward';
    } else if (fn === 4) {
      out.kind = 'next';
      pbForEach(f, s, e, (gn, gw, gv) => {
        if (gn === 1 && gw === 0) out.at = Number(gv);
      });
    }
  });
  return out;
}

/**
 * ChunkedMessage の meta.at(コメントが付いた時刻・ms)。meta=1 { at=2 }。
 * @param {Uint8Array} f
 */
function messageAtMs(f) {
  let at = 0;
  pbForEach(f, 0, f.length, (fn, wt, _v, s, e) => {
    if (fn !== 1 || wt !== 2) return;
    pbForEach(f, s, e, (gn, gw, _gv, gs, ge) => {
      if (gn === 2 && gw === 2) at = tsMs(f, gs, ge);
    });
  });
  return at;
}

/**
 * view を next.at で辿り、新しい segment をすぐ読み始める。segment は流れてくるそばから
 * 読み(=ネイティブ部品の届き方)、読み終わった時刻も控える(=CapacitorHttp の届き方)。
 * @param {string} viewUri
 * @param {number} minutes
 */
export async function followLive(viewUri, minutes) {
  const stopAt = Date.now() + minutes * 60_000;
  const statuses = new Map();
  const bump = (/** @type {number} */ k) => statuses.set(k, (statuses.get(k) || 0) + 1);
  /** @type {Record<string, number>} */
  const kinds = {};
  const seen = new Set();
  /** @type {Promise<void>[]} */
  const tasks = [];
  /** @type {number[]} */
  const lagsStream = [];
  /** @type {number[]} */
  const lagsFull = [];
  let viewGets = 0;
  let segGets = 0;
  let segBytes = 0;
  let chats = 0;
  let note = '';
  const ac = new AbortController();

  const readSegment = async (/** @type {string} */ uri) => {
    segGets += 1;
    /** @type {number[]} */
    const pending = [];
    try {
      const res = await fetch(uri, { signal: ac.signal });
      bump(res.status);
      if (!res.ok || !res.body) return;
      let buf = new Uint8Array();
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        segBytes += value.length;
        const merged = new Uint8Array(buf.length + value.length);
        merged.set(buf);
        merged.set(value, buf.length);
        const { frames, tail } = splitLengthDelimitedMessagesWithTail(merged);
        buf = tail;
        const now = Date.now();
        for (const fr of frames) {
          const n = decodeChunkedMessage(fr).chats.length;
          if (!n) continue;
          chats += n;
          const at = messageAtMs(fr);
          if (at > 0) {
            lagsStream.push((now - at) / 1000);
            pending.push(at);
          }
        }
      }
      const end = Date.now();
      for (const at of pending) lagsFull.push((end - at) / 1000);
    } catch {
      if (!ac.signal.aborted) bump(0);
    }
  };

  /** @type {string|number} */
  let at = 'now';
  while (Date.now() < stopAt) {
    viewGets += 1;
    /** @type {Response} */
    let res;
    try {
      res = await fetch(`${viewUri}${viewUri.includes('?') ? '&' : '?'}at=${at}`, { signal: ac.signal });
    } catch {
      bump(0);
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    bump(res.status);
    if (res.status === 429 || res.status === 403) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    let nextAt = null;
    for (const fr of splitLengthDelimitedMessagesWithTail(bytes).frames) {
      const ent = readEntry(fr);
      kinds[ent.kind || '?'] = (kinds[ent.kind || '?'] || 0) + 1;
      if (ent.kind === 'segment' && ent.uri && !seen.has(ent.uri)) {
        seen.add(ent.uri);
        tasks.push(readSegment(ent.uri));
      }
      if (ent.kind === 'next' && ent.at) nextAt = ent.at;
    }
    if (nextAt == null) {
      note = 'view に next が無い回があった';
      await new Promise((r) => setTimeout(r, 1000));
    } else {
      at = nextAt;
    }
  }
  // 読みかけの segment は最大30秒待って打ち切る(最後まで読む遅れを取りこぼさないため)。
  await Promise.race([Promise.allSettled(tasks), new Promise((r) => setTimeout(r, 30_000))]);
  ac.abort();
  const entryKinds = Object.entries(kinds).map(([k, n]) => `${k}×${n}`).join(' ') || '—';
  return { viewGets, segGets, segBytes, chats, lagsStream, lagsFull, statuses, entryKinds, note };
}

if (!process.env.MEASURE_NO_MAIN) main().catch((e) => {
  console.error(`計測できませんでした: ${e?.message || e}`);
  process.exit(1);
});
