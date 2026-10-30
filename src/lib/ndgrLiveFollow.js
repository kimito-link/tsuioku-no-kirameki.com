/**
 * ndgrLiveFollow.js — NDGR(ニコ生の新しいコメント配信)を「いま」から前へ追う純粋部品。
 *
 * ■ なぜ ndgrForwardCrawl.js とは別に置くか(2026-10-28 実測)
 *   ndgrForwardCrawl は view の応答を「URI らしい文字列」と「最初に見つけた数値」で推測して読む。
 *   りんくの PC で人気の配信を3分追うと、view 91回に対して segment 4本・12バイトしか取れず、
 *   コメントは0件だった(テストの模型が公開の型と違っていた=segment の URI の番号・next の形)。
 *   ここは公開の型(n-air-app/nicolive-comment-protobuf)どおりに番号で読む。同じ配信で
 *   view 8回・segment 14本・コメント 459件・429/403 なしを確かめた
 *   (/mnt/project-files/smartphone/plan-6-no-extension.md ③)。
 *
 *   ChunkedEntry  { segment=1 MessageSegment, backward=2, previous=3 MessageSegment, next=4 ReadyForNext }
 *   MessageSegment { from=1 Timestamp, until=2 Timestamp, uri=3 string }
 *   ReadyForNext  { at=1 int64(秒) }
 *   segment の中身 = 長さつき ChunkedMessage の並び。ChunkedMessage { meta=1 { id=1, at=2 Timestamp }, message=2 }
 *
 * ■ I/O は注入(fetchBytes / sleep / now / signal)。fetch も window も書かない。
 *   iPhone アプリでは fetchBytes に CapacitorHttp を渡す(ニコニコはアプリの Origin に CORS を許さないため)。
 *
 * ■ 秘密を出さない: viewUri・segment の URI は戻り値にもログにも出さない(nicoliveGuest.js と同じ約束)。
 *
 * @module lib/ndgrLiveFollow
 */

import { pbForEach, decodeChunkedMessage } from './ndgrDecode.js';
import { splitLengthDelimitedMessagesWithTail } from './lengthDelimitedStream.js';

/** 同時に読む segment の上限(1本は約16秒の窓。普段は1〜2本しか重ならない)。 */
export const NDGR_FOLLOW_MAX_INFLIGHT = 3;
/** view に next が無かったとき・失敗したときに待つ時間。 */
export const NDGR_FOLLOW_RETRY_MS = 2000;
/** 429/403 のときに待つ時間(回数制限に当たったら間を空ける)。 */
export const NDGR_FOLLOW_LIMITED_MS = 10_000;
/** 続けて失敗したらあきらめる回数。 */
export const NDGR_FOLLOW_MAX_FAILS = 5;
/** 覚えておく segment の数(同じ segment を2回読まない)。 */
const SEEN_MAX = 200;

/**
 * Timestamp { seconds=1, nanos=2 } を ms に。
 * @param {Uint8Array} b
 * @param {number} s
 * @param {number} e
 * @returns {number}
 */
function timestampMs(b, s, e) {
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
 * view の1区切り(ChunkedEntry)を読む。
 * @param {Uint8Array} f 長さを外した1区切り
 * @returns {{ kind: ''|'segment'|'previous'|'backward'|'next', uri: string, untilMs: number, at: number }}
 */
export function readNdgrViewEntry(f) {
  /** @type {{ kind: ''|'segment'|'previous'|'backward'|'next', uri: string, untilMs: number, at: number }} */
  const out = { kind: '', uri: '', untilMs: 0, at: 0 };
  pbForEach(f, 0, f.length, (fn, wt, _v, s, e) => {
    if (wt !== 2) return;
    if (fn === 1 || fn === 3) {
      out.kind = fn === 1 ? 'segment' : 'previous';
      pbForEach(f, s, e, (gn, gw, _gv, gs, ge) => {
        if (gw !== 2) return;
        if (gn === 2) out.untilMs = timestampMs(f, gs, ge);
        if (gn === 3) out.uri = new TextDecoder().decode(f.subarray(gs, ge));
      });
    } else if (fn === 2) {
      out.kind = 'backward';
    } else if (fn === 4) {
      out.kind = 'next';
      pbForEach(f, s, e, (gn, gw, gv) => {
        if (gn === 1 && gw === 0) out.at = Number(gv) || 0;
      });
    }
  });
  if (out.uri && !/^https?:\/\//.test(out.uri)) out.uri = '';
  return out;
}

/**
 * ChunkedMessage の meta.at(コメントが付いた時刻・ms)。無ければ 0。
 * @param {Uint8Array} f
 * @returns {number}
 */
export function ndgrMessageAtMs(f) {
  let at = 0;
  pbForEach(f, 0, f.length, (fn, wt, _v, s, e) => {
    if (fn !== 1 || wt !== 2) return;
    pbForEach(f, s, e, (gn, gw, _gv, gs, ge) => {
      if (gn === 2 && gw === 2) at = timestampMs(f, gs, ge);
    });
  });
  return at;
}

/**
 * コメントした人の ID。数値 ID(rawUserId)を先に、無ければ匿名の ID(hashedUserId・ID の形のものだけ)。
 * @param {{ rawUserId: number|null, hashedUserId: string }} c
 * @returns {string} 分からなければ ''
 */
export function chatUserId(c) {
  if (typeof c.rawUserId === 'number' && c.rawUserId > 0) return String(c.rawUserId);
  const h = String(c.hashedUserId || '').trim();
  return /^[a-zA-Z0-9_:-]{8,}$/.test(h) ? h : '';
}

/**
 * segment の中身からコメントを取り出す(壊れた区切りは捨てて残りを読む)。
 * @param {Uint8Array} bytes
 * @returns {{ no: string, text: string, name: string, userId: string, atMs: number }[]}
 */
export function ndgrCommentsFromSegment(bytes) {
  /** @type {{ no: string, text: string, name: string, userId: string, atMs: number }[]} */
  const rows = [];
  for (const fr of splitLengthDelimitedMessagesWithTail(bytes).frames) {
    let chats;
    try {
      chats = decodeChunkedMessage(fr).chats;
    } catch {
      continue;
    }
    if (!chats.length) continue;
    const atMs = ndgrMessageAtMs(fr);
    for (const c of chats) {
      const text = String(c.content || '').trim();
      if (!text) continue;
      rows.push({ no: c.no == null ? '' : String(c.no), text, name: String(c.name || ''), userId: chatUserId(c), atMs });
    }
  }
  return rows;
}

/**
 * segment の中身からギフトだけを取り出す(Gift の型どおり。名前もアイテム名も無い壊れた1件は捨てる)。
 * @param {Uint8Array} bytes
 * @returns {{ name: string, itemName: string, point: number|null, atMs: number }[]}
 */
export function ndgrGiftsFromSegment(bytes) {
  /** @type {{ name: string, itemName: string, point: number|null, atMs: number }[]} */
  const rows = [];
  for (const fr of splitLengthDelimitedMessagesWithTail(bytes).frames) {
    let gifts;
    try {
      gifts = decodeChunkedMessage(fr).gifts;
    } catch {
      continue;
    }
    if (!gifts.length) continue;
    const atMs = ndgrMessageAtMs(fr);
    for (const g of gifts) {
      const itemName = String(g.itemName || '').trim();
      const name = String(g.advertiserName || '').trim();
      if (!itemName && !name) continue;
      const point = typeof g.point === 'number' && Number.isFinite(g.point) ? g.point : null;
      rows.push({ name, itemName, point, atMs });
    }
  }
  return rows;
}

/**
 * @param {string} viewUri
 * @param {string|number} at
 */
function viewAt(viewUri, at) {
  return `${viewUri}${viewUri.includes('?') ? '&' : '?'}at=${encodeURIComponent(String(at))}`;
}

/**
 * view を next.at で辿り、新しい segment を読んでコメントを渡し続ける。止まるまで resolve しない。
 *
 * @param {{
 *   viewUri: string,
 *   fetchBytes: (url: string) => Promise<{ status: number, bytes: Uint8Array }>,
 *   onComments: (rows: { no: string, text: string, name: string, userId: string, atMs: number }[]) => void,
 *   onGifts?: (rows: { name: string, itemName: string, point: number|null, atMs: number }[]) => void,
 *   signal?: AbortSignal,
 *   sleep?: (ms: number) => Promise<void>
 * }} opts
 * @returns {Promise<'aborted'|'too_many_errors'|'no_view'>}
 */
export async function followNdgrLive(opts) {
  const viewUri = String(opts?.viewUri || '');
  const fetchBytes = opts?.fetchBytes;
  if (!viewUri || typeof fetchBytes !== 'function') return 'no_view';
  const sleep = opts.sleep || ((/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms)));
  const signal = opts.signal;
  const stopped = () => Boolean(signal && signal.aborted);
  const seen = new Set();
  /** @type {Set<Promise<void>>} */
  const inflight = new Set();
  let fails = 0;

  const readSegment = async (/** @type {string} */ uri) => {
    try {
      const r = await fetchBytes(uri);
      if (stopped() || r.status !== 200 || !r.bytes?.length) return;
      const rows = ndgrCommentsFromSegment(r.bytes);
      if (rows.length) opts.onComments(rows);
      if (typeof opts.onGifts === 'function') {
        const gifts = ndgrGiftsFromSegment(r.bytes);
        if (gifts.length) opts.onGifts(gifts);
      }
    } catch {
      /* 1本読めなくても追うのは止めない */
    }
  };

  /** @type {string|number} */
  let at = 'now';
  while (!stopped()) {
    /** @type {{ status: number, bytes: Uint8Array }} */
    let r;
    try {
      r = await fetchBytes(viewAt(viewUri, at));
    } catch {
      r = { status: 0, bytes: new Uint8Array() };
    }
    if (stopped()) break;
    if (r.status === 429 || r.status === 403) {
      fails += 1;
      if (fails >= NDGR_FOLLOW_MAX_FAILS) return 'too_many_errors';
      await sleep(NDGR_FOLLOW_LIMITED_MS);
      continue;
    }
    if (r.status !== 200 || !r.bytes?.length) {
      fails += 1;
      if (fails >= NDGR_FOLLOW_MAX_FAILS) return 'too_many_errors';
      await sleep(NDGR_FOLLOW_RETRY_MS);
      continue;
    }
    fails = 0;
    let nextAt = 0;
    for (const fr of splitLengthDelimitedMessagesWithTail(r.bytes).frames) {
      const ent = readNdgrViewEntry(fr);
      if (ent.kind === 'next' && ent.at > 0) nextAt = ent.at;
      // previous(直近の過去)は読まない=開いた時点より前のコメントを読み上げに混ぜない。
      if (ent.kind !== 'segment' || !ent.uri || seen.has(ent.uri)) continue;
      seen.add(ent.uri);
      if (seen.size > SEEN_MAX) seen.delete(seen.values().next().value);
      while (inflight.size >= NDGR_FOLLOW_MAX_INFLIGHT) await Promise.race(inflight);
      const p = readSegment(ent.uri).finally(() => inflight.delete(p));
      inflight.add(p);
    }
    if (nextAt > 0) at = nextAt;
    else await sleep(NDGR_FOLLOW_RETRY_MS);
  }
  return 'aborted';
}
