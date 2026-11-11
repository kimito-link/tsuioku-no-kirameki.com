// mx-content-entry.js — ミクチャの配信ページ(mixch.tv/u/<番号>/live)で、コメントとギフトを読んで記録に渡す入口。
/* global chrome, WebSocket, location, setTimeout, clearTimeout, setInterval, clearInterval, window, fetch, document, HTMLInputElement, HTMLTextAreaElement, Event, KeyboardEvent */
//
// ★設計(council/mixch-support-PLAN.md・SHOWROOM の sr-content-entry.js と同じ形)
//   - 形は 2026-11-08 の PC 実測(本物・ログインなし)から。ページ自身と同じ口を読む:
//     配信 /api-web/users/<A>/live → ソケット wss://chat.mixch.tv/torte/room/<A>(受けるだけ)。
//     開いた時点の分は /api-web/lives/<A>/messages から(同じコメントはソケットと同じ message_id=重ねない)。
//   - ギフトの値段は /items/available の price × 個数(単位はコインとみている)。名前の口は未発見なので「ギフト」と出す。
//   - 公式の順位は今月のファンランキング(score つき)を YT_LEADERBOARD へ。
//   - 記録は YT_STREAM_META / YT_CHAT_ITEMS へ。配信キーは 'mx.<A>.<live_session_id>'。
//   - 配信の終わりは /api-web/users/<A>/live で配信の情報が消えたとき(終わりの印は未実測・計器 liveStatus で見る)。

import {
  MX_ORIGIN,
  parseMxUserIdFromUrl,
  mxLiveInfoUrl,
  mxMessagesUrl,
  mxRankingUrl,
  mxItemsUrls,
  parseMxLive,
  parseMxItems,
  parseMxSocketFrame,
  mxMessageRows,
  mxKindOf,
  parseMxMessage,
  parseMxRanking,
  buildMxStreamKey,
} from '../../src/lib/mixch/mxParse.js';
import { startPageStallWatch } from '../../src/lib/stallTrace.js';
try {
  const stallRoot = /** @type {any} */ (globalThis);
  if (!stallRoot.__nlStallWatch) {
    stallRoot.__nlStallWatch = startPageStallWatch({
      file: 'mx-content-entry.js',
      send: (summary) => {
        try { chrome.runtime.sendMessage({ type: 'NLS_STALL_SUMMARY', page: location.hostname, summary, events: stallRoot.__nlStallWatch.takeFresh() }); } catch { /* 計器 */ }
      },
    });
  }
} catch { /* 計器 */ }
import { createInfoPollGate } from '../../src/lib/platform/infoPollGate.js';
import { parseMxLiveStats } from '../../src/lib/platform/platformStats.js';
import { makeDiagTabToken, shouldSkipDiagWrite } from '../../src/lib/platform/diagTabShare.js';
import { platformFetchTimeoutSignal } from '../../src/lib/platform/fetchTimeout.js';

const META_EVERY_MS = 30_000;
const BOARD_EVERY_MS = 120_000;
const FLUSH_MS = 200;
const MAX_SEEN = 8000;

/** 計器(状態速報と同じく storage に置く) */
const diag = {
  v: 1,
  userId: '',
  sessionId: '',
  streamKey: '',
  live: /** @type {boolean | null} */ (null),
  /** @type {Record<string, number>} broadcasterInfo.live_status の値ごとの数(終わりの印を探すため) */
  liveStatus: {},
  wsState: 'idle',
  wsConnects: 0,
  frames: 0,
  /** @type {Record<string, number>} ソケットの kind ごとの数(知らない kind に気づくため) */
  kinds: {},
  comments: 0,
  gifts: 0,
  giftCoin: 0,
  unknownGifts: 0,
  backlog: 0,
  items: 0,
  dropped: 0,
  itemList: 0,
  itemsVia: '',
  /** 絵の分かったギフトの種類の数・絵を聞けなかった回数 */
  giftImages: 0,
  giftImageFail: 0,
  boardRows: 0,
  apiFail: 0,
  lastError: '',
  /** 記録が止まった理由('login-redirect' = 未ログインでミクチャにログイン画面へ飛ばされた) */
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
const TAB_TOKEN = makeDiagTabToken();
let diagTimer = 0;
function saveDiagSoon() {
  if (diagTimer) return;
  diagTimer = setTimeout(() => {
    diagTimer = 0;
    diag.updatedAt = Date.now();
    const snap = { ...diag, tab: TAB_TOKEN, kinds: { ...diag.kinds }, liveStatus: { ...diag.liveStatus } };
    try {
      // 記録していないタブ(配信が終わったページ等)は、別のタブが2分以内に記録中として書いた計器を上書きしない
      //   (2026-11-09 PC 実測: 終わったタブの値で記録中の値が一時的に消えた)
      void Promise.resolve(diag.streamKey ? null : chrome.storage.local.get('yt_diag_mx_chat'))
        .then((bag) => {
          if (shouldSkipDiagWrite(bag?.yt_diag_mx_chat, { tab: TAB_TOKEN, streamKey: diag.streamKey, now: Date.now() })) return;
          return chrome.storage.local.set({ yt_diag_mx_chat: snap });
        })
        .catch(() => {});
    } catch {
      /* no-op */
    }
  }, 2000);
}

/** @param {string} url */
async function getJson(url) {
  const res = await fetch(url, { credentials: 'include', signal: platformFetchTimeoutSignal(), headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`mx_${res.status}`);
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
let current = /** @type {null | { userId: string, key: string, stop: () => void }} */ (null);

/**
 * @param {string} userId
 * @param {string} sessionId
 * @param {string} key
 * @param {string} socketUrl
 * @param {(viewers: number) => void} onViewers
 */
function startReader(userId, sessionId, key, socketUrl, onViewers) {
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
  /** @type {Map<string, import('../../src/lib/mixch/mxParse.js').MxItem>} */
  let items = new Map();

  const flush = () => {
    flushTimer = 0;
    if (stopped || !pending.length) return;
    const rows = pending.sort((a, b) => a.postedAtMs - b.postedAtMs);
    pending = [];
    diag.items += rows.length;
    safeSendMessage({ type: 'YT_CHAT_ITEMS', payload: { videoId: key, chatFilterLabel: '', items: rows } });
    saveDiagSoon();
  };
  // ギフトの絵: 初めて見たギフトの種類はバックグラウンドに絵を聞いてから記録する(最大2秒待つ・待てなければ絵なし)
  /** @type {any[]} */
  let held = [];
  /** @type {Set<string>} */
  const askIds = new Set();
  let askTimer = 0;
  const releaseHeld = () => {
    const list = held;
    held = [];
    for (const raw of list) take(raw, true);
  };
  const askImages = () => {
    askTimer = 0;
    const ids = [...askIds];
    askIds.clear();
    if (!ids.length) return;
    let done = false;
    /** @param {Record<string, string>} images */
    const apply = (images) => {
      if (done) return;
      done = true;
      for (const it of items.values()) {
        if (!it.resourceId || !ids.includes(it.resourceId)) continue;
        it.imageTried = true;
        const u = String(images?.[it.resourceId] || '');
        if (u) it.imageUrl = u;
      }
      diag.giftImages = [...items.values()].filter((it) => it.imageUrl).length;
      releaseHeld();
    };
    const timer = setTimeout(() => apply({}), 2000);
    try {
      if (!chrome?.runtime?.id) return apply({});
      chrome.runtime.sendMessage({ type: 'YT_MX_GIFT_IMAGES', ids }, (r) => {
        void chrome.runtime.lastError;
        clearTimeout(timer);
        if (!r?.ok) diag.giftImageFail += 1;
        apply(r?.ok ? r.images : {});
      });
    } catch {
      clearTimeout(timer);
      apply({});
    }
  };
  /** @param {any} raw @param {boolean} [again] 絵を待ったあと */
  const take = (raw, again = false) => {
    if (!again && raw?.item_id != null) {
      const it = items.get(String(raw.item_id));
      if (it && it.resourceId && !it.imageUrl && !it.imageTried) {
        held.push(raw);
        askIds.add(it.resourceId);
        if (!askTimer) askTimer = setTimeout(askImages, 100);
        return;
      }
    }
    if (stopped) return;
    const kind = mxKindOf(raw);
    if (kind === 10 && Number.isFinite(Number(raw?.viewer))) onViewers(Math.max(0, Math.floor(Number(raw.viewer))));
    const r = parseMxMessage(raw, { userId, items });
    if (!r) {
      if (kind === 0 || raw?.item_id != null) diag.dropped += 1;
      return;
    }
    if (seen.has(r.id)) return;
    seen.add(r.id);
    if (seen.size > MAX_SEEN) seen.delete(/** @type {string} */ (seen.values().next().value));
    if (r.giftName) {
      diag.gifts += 1;
      diag.giftCoin += r.amount;
      if (!r.amount) diag.unknownGifts += 1;
    } else diag.comments += 1;
    pending.push(r);
    if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
  };

  const loadItems = async () => {
    for (const url of mxItemsUrls(sessionId)) {
      try {
        const m = parseMxItems(await getJson(url));
        if (m.size) {
          items = m;
          diag.itemsVia = url.includes('/api-web/') ? 'api-web' : 'root';
          break;
        }
      } catch {
        /* 次の候補 */
      }
    }
    diag.itemList = items.size;
  };

  const loadBoard = async () => {
    const rows = parseMxRanking(await tryJson(mxRankingUrl(userId)));
    boardAt = Date.now();
    if (stopped || !rows.length) return;
    diag.boardRows = rows.length;
    // ミクチャの順位は今月のファンランキング(見出しを「今月」にする)
    safeSendMessage({ type: 'YT_LEADERBOARD', payload: { videoId: key, rows, period: 'MONTH' } });
    saveDiagSoon();
  };

  const loadBacklog = async () => {
    const rows = mxMessageRows(await tryJson(mxMessagesUrl(userId)));
    if (stopped) return;
    diag.backlog += rows.length;
    rows.forEach((r) => take(r));
  };

  /** @param {string} raw */
  const onFrame = (raw) => {
    diag.frames += 1;
    for (const m of parseMxSocketFrame(raw)) {
      const k = String(mxKindOf(m));
      diag.kinds[k] = (diag.kinds[k] || 0) + 1;
      take(m);
    }
    saveDiagSoon();
  };

  const connect = () => {
    if (stopped) return;
    if (!socketUrl) {
      diag.wsState = 'no-url';
      return;
    }
    diag.wsState = 'connecting';
    diag.wsConnects += 1;
    try {
      ws = new WebSocket(socketUrl);
    } catch {
      scheduleReconnect();
      return;
    }
    ws.onopen = () => {
      diag.wsState = 'open';
      backoff = 1000;
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
      // つなぎ直しの間の分を取り戻す(同じ message_id は重ねない)
      void loadBacklog();
    }, backoff);
    backoff = Math.min(backoff * 2, 60_000);
  };
  const boardTimer = setInterval(() => {
    if (!stopped && Date.now() - boardAt >= BOARD_EVERY_MS) void loadBoard();
  }, 15_000);

  void (async () => {
    await loadItems();
    if (stopped) return;
    connect();
    void loadBacklog();
    void loadBoard();
  })();

  return () => {
    // 絵を待っていたギフトも絵なしで残す
    if (askTimer) clearTimeout(askTimer);
    releaseHeld();
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
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
let checking = false;
/** ソケットの kind 10 から来た視聴数(次の配信情報の送信で使う) */
let latestViewers = /** @type {number | null} */ (null);

// 未ログインで配信を開くと、約5分(302秒)でミクチャがログイン画面(/login)へ飛ばす(2026-11-08 PC 実測)。
//   ページが変わるので記録はそこで止まる。止まった理由を計器に残す(前のページの計器は live=true のまま残っていた)
let loginNoted = false;
function noteLoginRedirect() {
  if (loginNoted || !/^\/login\b/.test(String(location.pathname || ''))) return;
  loginNoted = true;
  // ミクチャはページを読み直さずに /login へ移る(同じ計器がメモリに残る)。メモリの計器に書かないと、
  //   次の saveDiagSoon が live=true のまま上書きして理由が消えた(2026-11-08 PC 実測・1〜2秒後)
  if (diag.streamKey) {
    diag.live = null;
    diag.stopReason = 'login-redirect';
    diag.stoppedAt = Date.now();
    saveDiagSoon();
    return;
  }
  try {
    void Promise.resolve(chrome.storage.local.get('yt_diag_mx_chat'))
      .then((bag) => {
        const prev = bag?.yt_diag_mx_chat;
        // 直前(2分以内)に配信を記録していたときだけ(ふつうにログインしに来たときは書かない)
        if (!prev || !prev.streamKey || Date.now() - Number(prev.updatedAt || 0) > 120_000) return;
        return chrome.storage.local.set({ yt_diag_mx_chat: { ...prev, live: null, stopReason: 'login-redirect', stoppedAt: Date.now() } });
      })
      .catch(() => {});
  } catch {
    /* 拡張が入れ替わった直後 */
  }
}

async function check() {
  if (checking) return;
  const userId = parseMxUserIdFromUrl(location.href);
  if (!userId) {
    if (current) {
      current.stop();
      current = null;
    }
    diag.userId = '';
    noteLoginRedirect();
    return;
  }
  if (!infoGate.due(userId, Date.now())) return;
  checking = true;
  try {
    const liveJson = await tryJson(mxLiveInfoUrl(userId));
    const info = parseMxLive(liveJson, userId);
    infoGate.done(userId, !info ? 'fail' : info.isLive ? 'live' : 'idle', Date.now());
    diag.userId = userId;
    if (!info) return saveDiagSoon();
    diag.live = info.isLive;
    if (info.liveStatus) diag.liveStatus[info.liveStatus] = (diag.liveStatus[info.liveStatus] || 0) + 1;
    if (!info.isLive) {
      if (current) {
        const endedKey = current.key;
        current.stop();
        current = null;
        safeSendMessage({ type: 'YT_STREAM_META', payload: { videoId: endedKey, endedAt: Date.now() } });
      }
      diag.streamKey = '';
      return saveDiagSoon();
    }
    const key = buildMxStreamKey(userId, { sessionId: info.sessionId });
    if (!key) return saveDiagSoon();
    if (!current || current.key !== key) {
      current?.stop();
      latestViewers = null;
      current = { userId, key, stop: startReader(userId, info.sessionId, key, info.chat, (v) => (latestViewers = v)) };
      diag.streamKey = key;
      diag.sessionId = info.sessionId;
      diag.stopReason = '';
      diag.stoppedAt = 0;
      loginNoted = false;
    }
    const viewers = latestViewers ?? info.viewers;
    safeSendMessage({
      type: 'YT_STREAM_META',
      payload: {
        videoId: key,
        title: info.title || `${info.name || 'ミクチャ'}の配信`,
        broadcasterName: info.name || `ミクチャ${userId.slice(-4)}`,
        broadcasterChannelId: `mx:${userId}`,
        broadcasterHandle: userId,
        broadcasterIconUrl: info.iconUrl || '',
        concurrentViewers: viewers != null && viewers >= 0 ? viewers : undefined,
        ...(info.startedAtMs ? { startedAt: info.startedAtMs, startedAtApprox: false } : {}),
        // 名前の下のレベル・ファン・スーパーファン・ライバーランク(と、出ているときのイベント順位・pt)。同じ応答の値そのまま
        platformStats: parseMxLiveStats(liveJson),
      },
    });
    saveDiagSoon();
  } finally {
    checking = false;
  }
}

// ---- サイドパネル・会場からのコメント送信 ----
// 未ログインのときは入力欄が無く「コメントするにはログインしてください」が出る(2026-11-08 PC 実測)。
//   ログイン中の入力欄の形は未実測なので、コメントの入力欄らしいものを広めに探す。/api-web/login-status が null なら未ログイン。
const MX_INPUT_SEL = 'textarea[placeholder*="コメント"], input[placeholder*="コメント"], form textarea, form input[type="text"]';
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

/** ログインしていないと分かるか(分からなければ false=送ってみる) */
async function mxSignedOut() {
  try {
    const res = await fetch(`${MX_ORIGIN}/api-web/login-status`, { credentials: 'include', signal: platformFetchTimeoutSignal(), headers: { Accept: 'application/json' } });
    if (!res.ok) return false;
    const body = (await res.text()).trim();
    return body === '' || body === 'null';
  } catch {
    return false;
  }
}

/** 「送信する」ボタン(文字で探す) */
function findSendButton() {
  for (const b of Array.from(document.querySelectorAll('button'))) {
    if (/送信/.test(String(b.textContent || ''))) return /** @type {HTMLButtonElement} */ (b);
  }
  return null;
}

/** @param {string} reason */
function noteSendFail(reason) {
  try {
    void chrome.storage.local.set({ yt_diag_mx_send_fail: { at: Date.now(), reason, userId: diag.userId } });
  } catch {
    /* no-op */
  }
}

try {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== 'MX_SEND_COMMENT') return undefined;
    (async () => {
      const text = String(msg.text || '').replace(/\s+/g, ' ').trim().slice(0, 100);
      if (!text) return { ok: false, reason: 'empty' };
      if (await mxSignedOut()) {
        noteSendFail('not-signed-in');
        return { ok: false, reason: 'not-signed-in' };
      }
      let input = /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (document.querySelector(MX_INPUT_SEL));
      for (let i = 0; !input && i < 6; i += 1) {
        await sleep(250);
        input = /** @type {any} */ (document.querySelector(MX_INPUT_SEL));
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
      const btn = findSendButton();
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
        void chrome.storage.local.set({ yt_diag_mx_send_last: { at: Date.now(), ok, len: text.length, userId: diag.userId, via: btn ? 'button' : 'enter' } });
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
