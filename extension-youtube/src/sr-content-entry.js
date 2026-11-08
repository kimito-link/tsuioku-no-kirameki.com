// sr-content-entry.js — SHOWROOM の部屋のページ(www.showroom-live.com/r/<room_url_key>)で、コメントとギフトを読んで記録に渡す入口。
/* global chrome, WebSocket, location, setTimeout, clearTimeout, setInterval, clearInterval, window, fetch, document, HTMLInputElement, HTMLTextAreaElement, Event, KeyboardEvent */
//
// ★設計(council/showroom-support-PLAN.md・Kick の kick-content-entry.js と同じ形)
//   - 形は 2026-11-08 の PC 実測(本物・ログインなし)から。ページ自身と同じ口を読む:
//     部屋 /api/room/status → ソケット wss://<bcsvr_host>/ に「SUB\t<bcsvr_key>」(t=1 コメント・t=2 ギフト)。
//     開いた時点の分は comment_log・gift_log から(同じコメントはソケットと同じ id になる=重ねない)。
//   - ギフトの pt は gift_list の point × 個数。無料のギフト(星・種)は記録しない(数が多すぎる・計器でだけ数える)。
//   - 公式の順位(summary_ranking・pt つき)を YouTube のトップファンと同じ口(YT_LEADERBOARD)へ。
//   - 記録は YT_STREAM_META / YT_CHAT_ITEMS へ。配信キーは 'sr.<room_url_key>.<live_id>'。
//   - 配信の終わりは /api/room/status の is_live で見る(ソケットの終わりの知らせは実測で見ていない)。

import {
  parseSrRoomKeyFromUrl,
  srRoomStatusUrl,
  srLiveApiUrl,
  parseSrRoomStatus,
  parseSrLiveInfo,
  srSocketUrl,
  parseSrSocketFrame,
  parseSrGiftList,
  parseSrComment,
  parseSrGift,
  srLogRows,
  parseSrRanking,
  buildSrStreamKey,
} from '../../src/lib/showroom/srParse.js';
import { createInfoPollGate } from '../../src/lib/platform/infoPollGate.js';

const META_EVERY_MS = 30_000;
const BOARD_EVERY_MS = 60_000;
const FLUSH_MS = 200;
const PING_MS = 60_000;
const MAX_SEEN = 8000;

/** 計器(状態速報と同じく storage に置く) */
const diag = {
  v: 1,
  roomKey: '',
  roomId: '',
  streamKey: '',
  live: /** @type {boolean | null} */ (null),
  wsState: 'idle',
  wsConnects: 0,
  frames: 0,
  /** @type {Record<string, number>} ソケットの t ごとの数(知らない t に気づくため) */
  types: {},
  comments: 0,
  gifts: 0,
  freeGifts: 0,
  unknownGifts: 0,
  giftPt: 0,
  backlog: 0,
  items: 0,
  dropped: 0,
  giftList: 0,
  boardRows: 0,
  boardFrom: '',
  apiFail: 0,
  lastError: '',
  updatedAt: 0,
};

function safeSendMessage(/** @type {any} */ msg) {
  try {
    if (!chrome?.runtime?.id) return;
    chrome.runtime.sendMessage(msg, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    /* 拡張が入れ替わった直後 */
  }
}

let diagTimer = 0;
function saveDiagSoon() {
  if (diagTimer) return;
  diagTimer = setTimeout(() => {
    diagTimer = 0;
    diag.updatedAt = Date.now();
    try {
      void chrome.storage.local.set({ yt_diag_sr_chat: { ...diag, types: { ...diag.types } } });
    } catch {
      /* no-op */
    }
  }, 2000);
}

/** @param {string} url */
async function getJson(url) {
  const res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`sr_${res.status}`);
  return res.json();
}
/** @param {string} url */
async function tryJson(url) {
  if (!url) return null;
  try {
    return await getJson(url);
  } catch (e) {
    diag.apiFail += 1;
    diag.lastError = String(/** @type {any} */ (e)?.message || e).slice(0, 80);
    return null;
  }
}

// ---- 1配信ぶんの読み取り ----
let current = /** @type {null | { roomKey: string, key: string, stop: () => void }} */ (null);

/**
 * @param {string} roomId
 * @param {string} key
 * @param {{ bcsvrHost: string, bcsvrKey: string }} bc
 */
function startReader(roomId, key, bc) {
  let stopped = false;
  /** @type {WebSocket | null} */
  let ws = null;
  let backoff = 1000;
  let reconnectTimer = 0;
  let flushTimer = 0;
  let boardAt = 0;
  /** @type {any[]} */
  let pending = [];
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {Map<string, import('../../src/lib/showroom/srParse.js').SrGift>} */
  let gifts = new Map();

  const flush = () => {
    flushTimer = 0;
    if (stopped || !pending.length) return;
    const items = pending.sort((a, b) => a.postedAtMs - b.postedAtMs);
    pending = [];
    diag.items += items.length;
    safeSendMessage({ type: 'YT_CHAT_ITEMS', payload: { videoId: key, chatFilterLabel: '', items } });
    saveDiagSoon();
  };
  /** @param {any} r */
  const push = (r) => {
    if (!r) {
      diag.dropped += 1;
      return;
    }
    if (r.free) {
      diag.freeGifts += 1;
      return;
    }
    if (seen.has(r.id)) return;
    seen.add(r.id);
    if (seen.size > MAX_SEEN) seen.delete(/** @type {string} */ (seen.values().next().value));
    if (r.giftName) {
      diag.gifts += 1;
      diag.giftPt += r.amount;
      if (!r.amount) diag.unknownGifts += 1;
    } else diag.comments += 1;
    pending.push(r);
    if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
  };

  const loadGifts = async () => {
    const m = parseSrGiftList(await tryJson(srLiveApiUrl('gift_list', roomId)));
    if (m.size) gifts = m;
    diag.giftList = gifts.size;
  };

  const loadBoard = async () => {
    const [summary, stage] = await Promise.all([tryJson(srLiveApiUrl('summary_ranking', roomId)), tryJson(srLiveApiUrl('stage_user_list', roomId))]);
    if (stopped) return;
    const rows = parseSrRanking(summary, stage);
    boardAt = Date.now();
    if (!rows.length) return;
    diag.boardRows = rows.length;
    diag.boardFrom = rows.some((r) => r.xp > 0) ? 'summary' : 'stage';
    safeSendMessage({ type: 'YT_LEADERBOARD', payload: { videoId: key, rows } });
    saveDiagSoon();
  };

  const loadBacklog = async () => {
    const [cl, gl] = await Promise.all([tryJson(srLiveApiUrl('comment_log', roomId)), tryJson(srLiveApiUrl('gift_log', roomId))]);
    if (stopped) return;
    const rows = [
      ...srLogRows(cl, 'comment_log').map((c) => parseSrComment(c, { roomId })),
      ...srLogRows(gl, 'gift_log').map((g) => parseSrGift(g, { roomId, gifts })),
    ];
    diag.backlog += rows.length;
    rows.forEach(push);
  };

  /** @param {string} raw */
  const onFrame = (raw) => {
    diag.frames += 1;
    if (raw.startsWith('ACK')) return;
    const f = parseSrSocketFrame(raw);
    if (!f) return;
    const t = String(f.msg.t ?? '');
    diag.types[t] = (diag.types[t] || 0) + 1;
    if (t === '1') push(parseSrComment(f.msg, { roomId }));
    else if (t === '2') push(parseSrGift(f.msg, { roomId, gifts }));
    // t=101 は配信が終わった知らせ。room/status の is_live=false は 5〜25 秒遅れて来る(2026-11-08 PC 実測)ので、
    // ここでは止めず、部屋の状態を5秒おきに読みに行かせる(誤って止めない)
    else if (t === '101') endHintAt = Date.now();
    saveDiagSoon();
  };

  const connect = () => {
    if (stopped) return;
    const url = srSocketUrl(bc.bcsvrHost);
    if (!url) {
      diag.wsState = 'no-host';
      return;
    }
    diag.wsState = 'connecting';
    diag.wsConnects += 1;
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }
    ws.onopen = () => {
      diag.wsState = 'open';
      backoff = 1000;
      try {
        ws?.send(`SUB\t${bc.bcsvrKey}`);
      } catch {
        /* no-op */
      }
      saveDiagSoon();
    };
    ws.onmessage = (ev) => onFrame(typeof ev.data === 'string' ? ev.data : '');
    ws.onclose = () => {
      diag.wsState = 'closed';
      saveDiagSoon();
      scheduleReconnect();
    };
  };
  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = 0;
      connect();
    }, backoff);
    backoff = Math.min(backoff * 2, 60_000);
  };
  // つなぎっぱなしにするための合図(SHOWROOM のページと同じ)
  const pingTimer = setInterval(() => {
    try {
      if (ws?.readyState === 1) ws.send('PING\tshowroom');
    } catch {
      /* no-op */
    }
  }, PING_MS);
  const boardTimer = setInterval(() => {
    if (!stopped && Date.now() - boardAt >= BOARD_EVERY_MS) void loadBoard();
  }, 15_000);

  void (async () => {
    await loadGifts();
    if (stopped) return;
    connect();
    void loadBacklog();
    void loadBoard();
  })();

  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    clearInterval(pingTimer);
    clearInterval(boardTimer);
    flush();
    try {
      ws?.close();
    } catch {
      /* no-op */
    }
    diag.wsState = 'idle';
  };
}

// 記録中でなくても同じページは決めた間隔でしか読まない(2026-11-09 TikTok の PC 実測: 配信が終わったページで毎秒読み 403 になった・同じ形だった)
const infoGate = createInfoPollGate({ liveMs: META_EVERY_MS, idleMs: 60_000, failBaseMs: 30_000, failMaxMs: 300_000 });
/** 配信の終わりの知らせ(ソケット t=101)を受けた時刻。この1分は部屋の状態を5秒おきに読む */
let endHintAt = 0;
let checking = false;

async function check() {
  if (checking) return;
  const roomKey = parseSrRoomKeyFromUrl(location.href);
  if (!roomKey) {
    if (current) {
      current.stop();
      current = null;
    }
    diag.roomKey = '';
    return;
  }
  // 終わり際(ソケットの終わりの印から1分)だけ 5 秒おきに確かめる
  const endSoon = Date.now() - endHintAt < 60_000 ? 5_000 : undefined;
  if (!infoGate.due(roomKey, Date.now(), endSoon)) return;
  checking = true;
  try {
    const st = parseSrRoomStatus(await tryJson(srRoomStatusUrl(roomKey)));
    infoGate.done(roomKey, !st ? 'fail' : st.isLive ? 'live' : 'idle', Date.now());
    diag.roomKey = roomKey;
    if (!st) return saveDiagSoon();
    diag.roomId = st.roomId;
    diag.live = st.isLive;
    if (!st.isLive) {
      if (current) {
        const endedKey = current.key;
        current.stop();
        current = null;
        safeSendMessage({ type: 'YT_STREAM_META', payload: { videoId: endedKey, endedAt: Date.now() } });
      }
      diag.streamKey = '';
      return saveDiagSoon();
    }
    // ソケットのつなぎ先は live_info を正にし、無ければ room/status の broadcast_*
    const li = parseSrLiveInfo(await tryJson(srLiveApiUrl('live_info', st.roomId)));
    const liveId = li?.liveId || st.liveId;
    const key = buildSrStreamKey(roomKey, { liveId });
    if (!key) return saveDiagSoon();
    if (!current || current.key !== key) {
      current?.stop();
      const bc = li ? { bcsvrHost: li.bcsvrHost, bcsvrKey: li.bcsvrKey } : { bcsvrHost: st.bcsvrHost, bcsvrKey: st.bcsvrKey };
      current = { roomKey, key, stop: startReader(st.roomId, key, bc) };
      diag.streamKey = key;
    }
    // 視聴数は polling の online_user_num
    const poll = await tryJson(srLiveApiUrl('polling', st.roomId));
    const viewers = Number(poll?.online_user_num);
    safeSendMessage({
      type: 'YT_STREAM_META',
      payload: {
        videoId: key,
        title: li?.title || st.title || `${st.roomName || roomKey}の配信`,
        broadcasterName: st.roomName || roomKey,
        broadcasterChannelId: `sr:room-${st.roomId}`,
        broadcasterHandle: roomKey,
        broadcasterIconUrl: st.iconUrl || '',
        concurrentViewers: Number.isFinite(viewers) && viewers >= 0 ? viewers : undefined,
        ...(st.startedAtMs ? { startedAt: st.startedAtMs, startedAtApprox: false } : {}),
      },
    });
    saveDiagSoon();
  } finally {
    checking = false;
  }
}

// ---- サイドパネル・会場からのコメント送信 ----
// SHOWROOM の入力欄(input[placeholder="コメントを投稿"])に書いて送信ボタンを押す。
//   未ログインでも入力欄は使える形なので(2026-11-08 PC 実測)、/api/current_user で先に確かめる。
const SR_INPUT_SEL = 'input[placeholder="コメントを投稿"], textarea[placeholder="コメントを投稿"], .st-comment input[type="text"]';
const SR_SEND_SEL = 'button.st-comment__button, .st-comment button[type="submit"]';
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

/** ログインしていないと分かるか(分からなければ false=送ってみる) */
async function srSignedOut() {
  try {
    const u = await getJson(`${'https://www.showroom-live.com'}/api/current_user`);
    if (u && typeof u === 'object') {
      if (u.is_login === false) return true;
      if ('user_id' in u && !Number(u.user_id)) return true;
    }
  } catch {
    /* 分からない */
  }
  return false;
}

/** @param {string} reason */
function noteSendFail(reason) {
  try {
    void chrome.storage.local.set({ yt_diag_sr_send_fail: { at: Date.now(), reason, roomKey: diag.roomKey } });
  } catch {
    /* no-op */
  }
}

try {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== 'SR_SEND_COMMENT') return undefined;
    (async () => {
      const text = String(msg.text || '').replace(/\s+/g, ' ').trim().slice(0, 50);
      if (!text) return { ok: false, reason: 'empty' };
      if (await srSignedOut()) {
        noteSendFail('not-signed-in');
        return { ok: false, reason: 'not-signed-in' };
      }
      let input = /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (document.querySelector(SR_INPUT_SEL));
      for (let i = 0; !input && i < 6; i += 1) {
        await sleep(250);
        input = /** @type {any} */ (document.querySelector(SR_INPUT_SEL));
      }
      if (!input) {
        noteSendFail('no-input');
        return { ok: false, reason: 'no-input' };
      }
      input.focus();
      const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(150);
      const btn = /** @type {HTMLButtonElement | null} */ (document.querySelector(SR_SEND_SEL));
      if (btn && (btn.disabled || btn.getAttribute('aria-disabled') === 'true')) {
        noteSendFail('send-disabled');
        return { ok: false, reason: 'send-disabled' };
      }
      if (btn) btn.click();
      else {
        const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
        input.dispatchEvent(new KeyboardEvent('keydown', opts));
        input.dispatchEvent(new KeyboardEvent('keyup', opts));
      }
      await sleep(400);
      const ok = String(input.value || '').trim() !== text;
      try {
        void chrome.storage.local.set({ yt_diag_sr_send_last: { at: Date.now(), ok, len: text.length, roomKey: diag.roomKey, via: btn ? 'button' : 'enter' } });
      } catch {
        /* no-op */
      }
      if (!ok) noteSendFail('still-in-box');
      return { ok, reason: ok ? '' : 'still-in-box' };
    })()
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, reason: String(e) }));
    return true;
  });
} catch {
  /* 拡張が入れ替わった直後 */
}

let lastHref = '';
setInterval(() => {
  if (location.href !== lastHref) {
    lastHref = location.href;
    infoGate.reset();
  }
  void check();
}, 1000);
window.addEventListener('pagehide', () => current?.stop());
