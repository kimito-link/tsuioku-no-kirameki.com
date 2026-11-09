// tt-content-entry.js — TikTok LIVE の配信ページ(tiktok.com/@<名前>/live)で、コメントとギフトを読んで記録に渡す入口。
/* global chrome, location, setTimeout, clearTimeout, setInterval, clearInterval, window, fetch, document, DecompressionStream, Blob, Response, KeyboardEvent, InputEvent */
//
// ★設計(council/tiktok-support-PLAN.md・ミクチャの mx-content-entry.js と同じ形)
//   - 形は 2026-11-09 の PC 実測(本物・ログイン済み)から。ソケットは X-Bogus 署名つきで自分では開けないので、
//     ページ自身の世界の tt-main-entry.js が写した受信(postMessage)を読む。gzip は DecompressionStream で解く。
//   - 配信の情報は /api-live/user/room/(status 2 = 配信中)を 30 秒おきに読む。終わりもここで知る
//     (終わりの知らせ WebcastControlMessage は未実測)。
//   - ★ログインしていないとコメントのソケットが開かない(2026-11-09 PC 実測)。配信中なのに 20 秒たっても
//     ソケットが開かないときは、計器に stopReason='login-required' を残し、ページに小さく理由を出す。
//   - 記録は YT_STREAM_META / YT_CHAT_ITEMS / YT_LEADERBOARD へ。配信キーは 'tt.<名前>.<roomId>'。

import {
  parseTtUniqueIdFromUrl,
  ttRoomInfoUrl,
  parseTtRoomInfo,
  parseTtPushFrame,
  parseTtResponse,
  parseTtChat,
  ttChatDropReason,
  parseTtGift,
  parseTtGiftList,
  ttGiftRow,
  createTtComboTracker,
  parseTtRoomUserSeq,
  parseTtMemberViewers,
  buildTtStreamKey,
} from '../../src/lib/tiktok/ttParse.js';
import { createInfoPollGate } from '../../src/lib/platform/infoPollGate.js';

const META_EVERY_MS = 30_000;
const BOARD_EVERY_MS = 60_000;
const FLUSH_MS = 200;
const MAX_SEEN = 8000;
const LOGIN_WAIT_MS = 20_000;
const FROM_MAIN = 'nl-tt-main';

/** 計器(状態速報と同じく storage に置く) */
const diag = {
  v: 1,
  uniqueId: '',
  roomId: '',
  streamKey: '',
  live: /** @type {boolean | null} */ (null),
  /** @type {Record<string, number>} status の値ごとの数 */
  liveStatus: {},
  /** ページのソケット(写し)の様子 */
  wsState: 'idle',
  wsOpens: 0,
  frames: 0,
  /** よその部屋の受信(別の配信に移った直後など) */
  otherRoomFrames: 0,
  gzipFail: 0,
  /** @type {Record<string, number>} 型ごとの数(知らない型に気づくため) */
  types: {},
  comments: 0,
  gifts: 0,
  giftCoin: 0,
  /** 連打の終わりの印が来ずに、待ってから数えた数 */
  comboTimeouts: 0,
  unknownGiftNames: 0,
  giftList: 0,
  items: 0,
  dropped: 0,
  /** @type {Record<string, number>} 捨てた理由ごとの数(chat:no-text など) */
  dropReasons: {},
  /** @type {Record<string, number>} 読まない型のうち、コメントらしい名前の型(Chat・Emote・Barrage を含む)の数 */
  chatLikeSkipped: {},
  boardRows: 0,
  apiFail: 0,
  lastError: '',
  /** 記録できない理由('login-required' = ログインしていないのでコメントが届かない) */
  stopReason: '',
  stoppedAt: 0,
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

/** このタブの印(計器をタブで分け合うため) */
const TAB_TOKEN = Math.random().toString(36).slice(2, 10);
let diagTimer = 0;
function saveDiagSoon() {
  if (diagTimer) return;
  diagTimer = setTimeout(() => {
    diagTimer = 0;
    diag.updatedAt = Date.now();
    const snap = { ...diag, tab: TAB_TOKEN, types: { ...diag.types }, dropReasons: { ...diag.dropReasons }, chatLikeSkipped: { ...diag.chatLikeSkipped }, liveStatus: { ...diag.liveStatus } };
    try {
      // 計器は1つの置き場をタブで分け合う。記録していないタブ(配信が終わったページ等)は、別のタブが
      //   2分以内に記録中として書いた計器を上書きしない(2026-11-09 PC 実測: 終わったタブの値で記録中の値が消えた)
      void Promise.resolve(diag.streamKey ? null : chrome.storage.local.get('yt_diag_tt_chat'))
        .then((bag) => {
          const prev = bag?.yt_diag_tt_chat;
          if (prev && prev.tab !== TAB_TOKEN && prev.streamKey && Date.now() - Number(prev.updatedAt || 0) < 120_000) return;
          return chrome.storage.local.set({ yt_diag_tt_chat: snap });
        })
        .catch(() => {});
    } catch {
      /* no-op */
    }
  }, 2000);
}

/** @param {string} url */
async function tryJson(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`tt_${res.status}`);
    return await res.json();
  } catch (e) {
    diag.apiFail += 1;
    diag.lastError = String(/** @type {any} */ (e)?.message || e).slice(0, 80);
    return null;
  }
}

/** @param {Uint8Array} b */
async function gunzip(b) {
  const stream = new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ---- ギフトの一覧(ページが読んだ gift/list の写し)----
/** @type {Map<string, import('../../src/lib/tiktok/ttParse.js').TtGiftInfo>} */
let giftInfo = new Map();

// ---- ページのソケットの様子 ----
/** @type {Set<string>} 開いているソケットの部屋 */
const openRooms = new Set();
/** @type {Set<string>} 一度でも開いた部屋 */
const seenRooms = new Set();
/** @type {{ roomId: string, buf: ArrayBuffer }[]} 配信の情報より先に来た受信 */
let early = [];

// ---- 1配信ぶんの読み取り ----
/**
 * @typedef {{ uniqueId: string, roomId: string, key: string, startedAt: number, onFrame: (buf: ArrayBuffer) => void, stop: () => void }} Reader
 */
let current = /** @type {null | Reader} */ (null);
/** ソケットから来た視聴数(次の配信情報の送信で使う) */
let latestViewers = /** @type {number | null} */ (null);

/**
 * @param {string} uniqueId
 * @param {string} roomId
 * @param {string} key
 * @returns {Reader}
 */
function startReader(uniqueId, roomId, key) {
  let stopped = false;
  let flushTimer = 0;
  let boardAt = 0;
  /** @type {any[]} */
  let pending = [];
  /** @type {Set<string>} */
  const seen = new Set();
  const combo = createTtComboTracker();
  // 受信は順番どおりに解く(gzip を解くのが非同期のため)
  let chain = Promise.resolve();

  const flush = () => {
    flushTimer = 0;
    if (stopped || !pending.length) return;
    const rows = pending.sort((a, b) => a.postedAtMs - b.postedAtMs);
    pending = [];
    diag.items += rows.length;
    safeSendMessage({ type: 'YT_CHAT_ITEMS', payload: { videoId: key, chatFilterLabel: '', items: rows } });
    saveDiagSoon();
  };
  /** @param {any} r */
  const add = (r) => {
    if (!r || seen.has(r.id)) return;
    seen.add(r.id);
    if (seen.size > MAX_SEEN) seen.delete(/** @type {string} */ (seen.values().next().value));
    if (r.giftName) {
      diag.gifts += 1;
      diag.giftCoin += r.amount;
      if (r.giftName === 'ギフト' || /^[\x20-\x7e]+$/.test(r.giftName)) diag.unknownGiftNames += 1;
    } else diag.comments += 1;
    pending.push(r);
    if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
  };
  /** @param {any[]} list */
  const addGifts = (list) => {
    for (const g of list) add(ttGiftRow(g, uniqueId));
  };

  /** @param {{ type: string, payload: Uint8Array, msgId: string }} m */
  const onMessage = (m) => {
    diag.types[m.type] = (diag.types[m.type] || 0) + 1;
    const now = Date.now();
    if (m.type === 'WebcastChatMessage') {
      const r = parseTtChat(m.payload, { msgId: m.msgId, uniqueId, nowMs: now });
      if (r) add(r);
      else {
        diag.dropped += 1;
        const why = `chat:${ttChatDropReason(m.payload, m.msgId)}`;
        diag.dropReasons[why] = (diag.dropReasons[why] || 0) + 1;
      }
    } else if (m.type === 'WebcastGiftMessage') {
      const g = parseTtGift(m.payload, { gifts: giftInfo, nowMs: now });
      if (g) addGifts(combo.push(g, now));
      else {
        diag.dropped += 1;
        diag.dropReasons['gift:bad'] = (diag.dropReasons['gift:bad'] || 0) + 1;
      }
    } else if (m.type === 'WebcastRoomUserSeqMessage') {
      const s = parseTtRoomUserSeq(m.payload);
      if (s.viewers != null) latestViewers = s.viewers;
      if (s.rows.length && now - boardAt >= BOARD_EVERY_MS) {
        boardAt = now;
        diag.boardRows = s.rows.length;
        // 配信中の視聴者の順位(この配信の分・score つき)
        safeSendMessage({ type: 'YT_LEADERBOARD', payload: { videoId: key, rows: s.rows } });
      }
    } else if (m.type === 'WebcastMemberMessage') {
      const v = parseTtMemberViewers(m.payload);
      if (v != null) latestViewers = v;
    } else if (/Chat|Emote|Barrage|Comment/i.test(m.type)) {
      // コメント欄に出るのに読んでいない型があるかもしれない(画面と記録の差の手がかり)
      diag.chatLikeSkipped[m.type] = (diag.chatLikeSkipped[m.type] || 0) + 1;
    }
  };

  /** @param {ArrayBuffer} buf */
  const onFrame = (buf) => {
    chain = chain.then(async () => {
      if (stopped) return;
      diag.frames += 1;
      const f = parseTtPushFrame(new Uint8Array(buf));
      if (!f) return;
      let body = f.payload;
      if (f.gzip) {
        try {
          body = await gunzip(f.payload);
        } catch {
          diag.gzipFail += 1;
          return;
        }
      }
      for (const m of parseTtResponse(body)) {
        try {
          onMessage(m);
        } catch {
          diag.dropped += 1;
        }
      }
      saveDiagSoon();
    });
  };

  const comboTimer = setInterval(() => {
    if (stopped) return;
    const due = combo.flushDue(Date.now());
    if (due.length) {
      diag.comboTimeouts += due.length;
      addGifts(due);
    }
  }, 1000);

  return {
    uniqueId,
    roomId,
    key,
    startedAt: Date.now(),
    onFrame,
    stop: () => {
      // 連打の途中で止まったギフトも、見た中で一番大きい数で残す
      addGifts(combo.flushDue(Date.now(), true));
      flush();
      stopped = true;
      clearInterval(comboTimer);
      if (flushTimer) clearTimeout(flushTimer);
    },
  };
}

// ---- ログインしていないときの知らせ ----
const NOTE_ID = 'nl-tt-login-note';
/** @param {boolean} show */
function setLoginNote(show) {
  const el = document.getElementById(NOTE_ID);
  if (!show) {
    el?.remove();
    return;
  }
  if (el || !document.body) return;
  const box = document.createElement('div');
  box.id = NOTE_ID;
  box.setAttribute('role', 'status');
  box.style.cssText =
    'position:fixed;right:12px;bottom:12px;z-index:2147483646;max-width:320px;padding:10px 32px 10px 12px;border-radius:10px;' +
    'background:rgba(20,20,28,.92);color:#fff;font:13px/1.5 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35)';
  box.textContent = '追憶のきらめき: TikTok にログインしていないため、コメントとギフトが届かず記録できません。ログインしてからこの配信を開き直してください。';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', '閉じる');
  close.style.cssText = 'position:absolute;top:4px;right:6px;border:0;background:none;color:#fff;font-size:16px;cursor:pointer';
  close.addEventListener('click', () => {
    dismissed = true;
    box.remove();
  });
  box.appendChild(close);
  document.body.appendChild(box);
}
let dismissed = false;

function checkLogin() {
  if (!current) return setLoginNote(false);
  const ok = seenRooms.has(current.roomId);
  if (ok) {
    if (diag.stopReason === 'login-required') {
      diag.stopReason = '';
      diag.stoppedAt = 0;
      saveDiagSoon();
    }
    return setLoginNote(false);
  }
  if (Date.now() - current.startedAt < LOGIN_WAIT_MS) return;
  if (diag.stopReason !== 'login-required') {
    diag.stopReason = 'login-required';
    diag.stoppedAt = Date.now();
    saveDiagSoon();
  }
  if (!dismissed) setLoginNote(true);
}

// ---- ページの世界からの写し ----
window.addEventListener('message', (ev) => {
  if (ev.source !== window) return;
  const d = ev.data;
  if (!d || d.source !== FROM_MAIN) return;
  const roomId = String(d.roomId || '');
  if (d.t === 'open') {
    openRooms.add(roomId);
    seenRooms.add(roomId);
    diag.wsOpens += 1;
    diag.wsState = 'open';
    saveDiagSoon();
  } else if (d.t === 'close') {
    openRooms.delete(roomId);
    diag.wsState = openRooms.size ? 'open' : 'closed';
    saveDiagSoon();
  } else if (d.t === 'state') {
    for (const r of Array.isArray(d.rooms) ? d.rooms : []) {
      openRooms.add(String(r));
      seenRooms.add(String(r));
    }
    if (openRooms.size) diag.wsState = 'open';
  } else if (d.t === 'gifts') {
    const list = parseTtGiftList(d.json);
    if (list.length) {
      giftInfo = new Map(list.map((g) => [g.id, g]));
      diag.giftList = giftInfo.size;
      saveDiagSoon();
    }
  } else if (d.t === 'frame' && d.buf instanceof ArrayBuffer) {
    if (current && current.roomId === roomId) current.onFrame(d.buf);
    else {
      // 配信の情報より先に来た分(別の配信へ移った直後も)は、その部屋の読み取りが始まるまでためる
      if (current) diag.otherRoomFrames += 1;
      early.push({ roomId, buf: d.buf });
      if (early.length > 400) early.shift();
    }
  }
});
// ためていた分をもらう(入口が document_idle なので、ページのソケットのほうが先に開いている)
try {
  window.postMessage({ source: 'nl-tt-iso', t: 'hello' }, location.origin);
} catch {
  /* no-op */
}

// 記録中でなくても同じページは決めた間隔でしか読まない(2026-11-09 PC 実測: 配信が終わったページで毎秒読み 403 になった)
const infoGate = createInfoPollGate({ liveMs: META_EVERY_MS, idleMs: 60_000, failBaseMs: 30_000, failMaxMs: 300_000 });
let checking = false;

async function check() {
  if (checking) return;
  const uniqueId = parseTtUniqueIdFromUrl(location.href);
  if (!uniqueId) {
    if (current) {
      current.stop();
      current = null;
    }
    diag.uniqueId = '';
    setLoginNote(false);
    return;
  }
  if (!infoGate.due(uniqueId, Date.now())) return checkLogin();
  checking = true;
  try {
    const info = parseTtRoomInfo(await tryJson(ttRoomInfoUrl(uniqueId)));
    infoGate.done(uniqueId, !info ? 'fail' : info.isLive ? 'live' : 'idle', Date.now());
    diag.uniqueId = uniqueId;
    if (!info) return saveDiagSoon();
    diag.live = info.isLive;
    diag.liveStatus[String(info.status)] = (diag.liveStatus[String(info.status)] || 0) + 1;
    if (!info.isLive) {
      if (current) {
        const endedKey = current.key;
        current.stop();
        current = null;
        safeSendMessage({ type: 'YT_STREAM_META', payload: { videoId: endedKey, endedAt: Date.now() } });
      }
      diag.streamKey = '';
      setLoginNote(false);
      return saveDiagSoon();
    }
    const key = buildTtStreamKey(uniqueId, { roomId: info.roomId });
    if (!key) return saveDiagSoon();
    if (!current || current.key !== key) {
      current?.stop();
      latestViewers = null;
      current = startReader(uniqueId, info.roomId, key);
      diag.streamKey = key;
      diag.roomId = info.roomId;
      diag.stopReason = '';
      diag.stoppedAt = 0;
      // 先に来ていたこの部屋の受信を渡す
      const list = early;
      early = [];
      for (const e of list) if (e.roomId === info.roomId) current.onFrame(e.buf);
    }
    const viewers = latestViewers ?? info.viewers;
    safeSendMessage({
      type: 'YT_STREAM_META',
      payload: {
        videoId: key,
        title: info.title || `${info.name || `@${uniqueId}`}の配信`,
        broadcasterName: info.name || `@${uniqueId}`,
        // 人キーはコメントと同じ tt:<userId>(配信者が自分でコメントしたときに同じ人として扱う)。分からなければ名前で
        broadcasterChannelId: info.userId ? `tt:${info.userId}` : `tt:@${uniqueId}`,
        broadcasterHandle: uniqueId,
        broadcasterIconUrl: info.iconUrl || '',
        concurrentViewers: viewers != null && viewers >= 0 ? viewers : undefined,
        ...(info.startedAtMs ? { startedAt: info.startedAtMs, startedAtApprox: false } : {}),
      },
    });
    checkLogin();
    saveDiagSoon();
  } finally {
    checking = false;
  }
}

// ---- サイドパネル・会場からのコメント送信 ----
// 入力欄は data-e2e="room-chat-input-field"(DIV・contenteditable・最大 150 字)、送信は room-chat-send-btn(2026-11-09 PC 実測)。
//   ログインしていないと同じ欄の placeholder が「コメントをオフにする」になる。
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
const INPUT_SEL = '[data-e2e="room-chat-input-field"]';
const SEND_SEL = '[data-e2e="room-chat-send-btn"]';

/** @param {string} reason */
function noteSendFail(reason) {
  try {
    void chrome.storage.local.set({ yt_diag_tt_send_fail: { at: Date.now(), reason, uniqueId: diag.uniqueId } });
  } catch {
    /* no-op */
  }
}

/** @param {Element} el */
function boxText(el) {
  return String(/** @type {HTMLElement} */ (el).innerText ?? el.textContent ?? '').trim();
}

try {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== 'TT_SEND_COMMENT') return undefined;
    (async () => {
      const text = String(msg.text || '').replace(/\s+/g, ' ').trim().slice(0, 150);
      if (!text) return { ok: false, reason: 'empty' };
      let input = /** @type {HTMLElement | null} */ (document.querySelector(INPUT_SEL));
      for (let i = 0; !input && i < 6; i += 1) {
        await sleep(250);
        input = document.querySelector(INPUT_SEL);
      }
      if (!input) {
        noteSendFail('no-input');
        return { ok: false, reason: 'no-input' };
      }
      const ph = `${input.getAttribute('placeholder') || ''} ${input.getAttribute('data-placeholder') || ''} ${input.getAttribute('aria-placeholder') || ''}`;
      if (/コメントをオフ/.test(ph) || diag.stopReason === 'login-required') {
        noteSendFail('not-signed-in');
        return { ok: false, reason: 'not-signed-in' };
      }
      input.focus();
      // contenteditable は値を入れる口が無いので、ページの入力と同じ insertText で入れる
      try {
        document.execCommand('selectAll', false);
        document.execCommand('insertText', false, text);
      } catch {
        input.textContent = text;
        input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
      }
      await sleep(150);
      const btn = /** @type {HTMLElement | null} */ (document.querySelector(SEND_SEL));
      if (btn) btn.click();
      else {
        const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
        input.dispatchEvent(new KeyboardEvent('keydown', opts));
        input.dispatchEvent(new KeyboardEvent('keyup', opts));
      }
      await sleep(500);
      const ok = boxText(input) !== text;
      try {
        void chrome.storage.local.set({ yt_diag_tt_send_last: { at: Date.now(), ok, len: text.length, uniqueId: diag.uniqueId, via: btn ? 'button' : 'enter' } });
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
