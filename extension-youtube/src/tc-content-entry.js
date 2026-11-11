// tc-content-entry.js — ツイキャスの配信ページ(twitcasting.tv/<user>)で、コメントとギフトを読んで記録に渡す入口。
/* global chrome, DOMParser, WebSocket, location, setTimeout, clearTimeout, setInterval, clearInterval, window, fetch, document, FormData, HTMLInputElement, HTMLTextAreaElement, Event, KeyboardEvent */
//
// ★設計(council/twitcasting-support-PLAN.md・ミクチャの mx-content-entry.js と同じ形)
//   - ページ自身と同じ口を読む(ログイン不要):
//     配信中か streamserver.php → コメントの口 eventpubsuburl.php(POST movie_id)→ ソケット(受けるだけ・gift=1 でギフトも)。
//   - ソケットの署名は約1時間で切れるので、つなぎ直すたびに eventpubsuburl.php から取り直す。
//     10秒何も無いと [] が来る。40秒何も来なければ切れたとみてつなぎ直す。
//   - 記録は YT_STREAM_META / YT_CHAT_ITEMS へ。配信キーは 'tc.<user>.<movie id>'。
//   - 視聴者数・累計・コメント数はページに出ている数をそのまま使う(tcPageStats.js・推定は出さない)。

import {
  TC_PUBSUB_URL,
  parseTcUserFromUrl,
  tcStreamServerUrl,
  parseTcStreamServer,
  parseTcPubSubUrl,
  parseTcSocketFrame,
  tcTypeOf,
  parseTcEvent,
  buildTcStreamKey,
} from '../../src/lib/twitcasting/tcParse.js';
import { readTcPageInfo, parseTcSupporterDoc, tcSupporterUrl } from '../../src/lib/twitcasting/tcPageInfo.js';
import { createInfoPollGate } from '../../src/lib/platform/infoPollGate.js';
import { makeDiagTabToken, shouldSkipDiagWrite } from '../../src/lib/platform/diagTabShare.js';
import { platformFetchTimeoutSignal } from '../../src/lib/platform/fetchTimeout.js';

const META_EVERY_MS = 30_000;
const FLUSH_MS = 200;
const MAX_SEEN = 8000;
/** これだけ何も来なければ切れたとみる(ツイキャスは10秒おきに [] を送る) */
const SILENCE_MS = 40_000;
/** 公式のサポーターランキング(約125KB の HTML)を読み直す間隔。重いので5分おき */
const BOARD_EVERY_MS = 5 * 60_000;

/** 計器(状態速報と同じく storage に置く) */
const diag = {
  v: 1,
  user: '',
  movieId: '',
  streamKey: '',
  live: /** @type {boolean | null} */ (null),
  wsState: 'idle',
  wsConnects: 0,
  /** つなぎ先を取り直した回数・失敗した回数 */
  pubsub: 0,
  pubsubFail: 0,
  /** ソケットの URL に gift=1 が付いていたか */
  giftParam: false,
  frames: 0,
  keepAlive: 0,
  silenceReconnects: 0,
  /** @type {Record<string, number>} type ごとの数(知らない type に気づくため) */
  types: {},
  comments: 0,
  gifts: 0,
  giftItems: 0,
  dropped: 0,
  /** 公式のサポーターランキングの行の数・配信者のサポーターレベル */
  boardRows: 0,
  supporterLevel: 0,
  items: 0,
  withIcon: 0,
  /** ページから読めた数(読めた項目の名前だけ) @type {string[]} */
  pageStats: [],
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

const TAB_TOKEN = makeDiagTabToken();
let diagTimer = 0;
function saveDiagSoon() {
  if (diagTimer) return;
  diagTimer = setTimeout(() => {
    diagTimer = 0;
    diag.updatedAt = Date.now();
    const snap = { ...diag, tab: TAB_TOKEN, types: { ...diag.types }, pageStats: [...diag.pageStats] };
    try {
      void Promise.resolve(diag.streamKey ? null : chrome.storage.local.get('yt_diag_tc_chat'))
        .then((bag) => {
          if (shouldSkipDiagWrite(bag?.yt_diag_tc_chat, { tab: TAB_TOKEN, streamKey: diag.streamKey, now: Date.now() })) return;
          return chrome.storage.local.set({ yt_diag_tc_chat: snap });
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
    const res = await fetch(url, { credentials: 'include', signal: platformFetchTimeoutSignal(), headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`tc_${res.status}`);
    return await res.json();
  } catch (e) {
    diag.apiFail += 1;
    diag.lastError = String(/** @type {any} */ (e)?.message || e).slice(0, 80);
    return null;
  }
}

/** コメントの口(署名つきのソケットの URL)を取り直す @param {string} movieId */
async function fetchSocketUrl(movieId) {
  diag.pubsub += 1;
  try {
    const body = new FormData();
    body.append('movie_id', movieId);
    const res = await fetch(TC_PUBSUB_URL, { method: 'POST', body, credentials: 'include', signal: platformFetchTimeoutSignal() });
    if (!res.ok) throw new Error(`tc_pubsub_${res.status}`);
    const url = parseTcPubSubUrl(await res.json());
    if (!url) throw new Error('tc_pubsub_shape');
    diag.giftParam = /[?&]gift=1(?:&|$)/.test(url);
    return url;
  } catch (e) {
    diag.pubsubFail += 1;
    diag.lastError = String(/** @type {any} */ (e)?.message || e).slice(0, 80);
    return '';
  }
}

// ---- 1配信ぶんの読み取り ----
let current = /** @type {null | { user: string, key: string, stop: () => void }} */ (null);

/**
 * @param {string} user
 * @param {string} movieId
 * @param {string} key
 */
function startReader(user, movieId, key) {
  let stopped = false;
  /** @type {WebSocket | null} */
  let ws = null;
  let backoff = 1000;
  let reconnectTimer = 0;
  let flushTimer = 0;
  let lastFrameAt = Date.now();
  /** @type {any[]} */
  let pending = [];
  /** @type {Set<string>} */
  const seen = new Set();

  const flush = () => {
    flushTimer = 0;
    if (stopped || !pending.length) return;
    const rows = pending.sort((a, b) => a.postedAtMs - b.postedAtMs);
    pending = [];
    diag.items += rows.length;
    safeSendMessage({ type: 'YT_CHAT_ITEMS', payload: { videoId: key, chatFilterLabel: '', items: rows } });
    saveDiagSoon();
  };

  /** @param {any} raw */
  const take = (raw) => {
    const type = tcTypeOf(raw) || '?';
    diag.types[type] = (diag.types[type] || 0) + 1;
    const r = parseTcEvent(raw, { user });
    if (!r) {
      if (type === 'comment' || type === 'gift') diag.dropped += 1;
      return;
    }
    if (seen.has(r.id)) return;
    seen.add(r.id);
    if (seen.size > MAX_SEEN) seen.delete(/** @type {string} */ (seen.values().next().value));
    if (r.giftName) {
      diag.gifts += 1;
      diag.giftItems += r.amount;
    } else diag.comments += 1;
    if (r.iconUrl) diag.withIcon += 1;
    pending.push(r);
    if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
  };

  /** @param {string} raw */
  const onFrame = (raw) => {
    diag.frames += 1;
    lastFrameAt = Date.now();
    const rows = parseTcSocketFrame(raw);
    if (!rows.length) diag.keepAlive += 1;
    rows.forEach(take);
    saveDiagSoon();
  };

  const connect = async () => {
    if (stopped) return;
    diag.wsState = 'connecting';
    const url = await fetchSocketUrl(movieId);
    if (stopped) return;
    if (!url) {
      diag.wsState = 'no-url';
      scheduleReconnect();
      return;
    }
    diag.wsConnects += 1;
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }
    lastFrameAt = Date.now();
    ws.onopen = () => {
      diag.wsState = 'open';
      backoff = 1000;
      saveDiagSoon();
    };
    ws.onmessage = (ev) => onFrame(typeof ev.data === 'string' ? ev.data : '');
    ws.onclose = () => {
      ws = null;
      diag.wsState = 'closed';
      saveDiagSoon();
      scheduleReconnect();
    };
  };
  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = 0;
      void connect();
    }, backoff);
    backoff = Math.min(backoff * 2, 60_000);
  };
  // 何も来ないまま時間が過ぎたら、閉じてつなぎ直す(閉じた知らせが来ないまま止まることがある)
  const silenceTimer = setInterval(() => {
    if (stopped || !ws || Date.now() - lastFrameAt < SILENCE_MS) return;
    diag.silenceReconnects += 1;
    try {
      ws.close();
    } catch {
      /* no-op */
    }
  }, 10_000);

  // 公式のサポーターランキング(/<user>/supporter・サーバーが描いた HTML をそのまま読む。ログイン不要)
  const loadBoard = async () => {
    try {
      const res = await fetch(tcSupporterUrl(user), { credentials: 'include', signal: platformFetchTimeoutSignal() });
      if (!res.ok) throw new Error(`tc_board_${res.status}`);
      const board = parseTcSupporterDoc(new DOMParser().parseFromString(await res.text(), 'text/html'));
      if (stopped) return;
      diag.boardRows = board.rows.length;
      diag.supporterLevel = board.level || 0;
      if (board.rows.length) {
        safeSendMessage({
          type: 'YT_LEADERBOARD',
          payload: { videoId: key, rows: board.rows.map((r) => ({ rank: r.rank, name: r.name, xp: r.xp, iconUrl: r.iconUrl })), period: 'LEVEL' },
        });
      }
    } catch (e) {
      diag.apiFail += 1;
      diag.lastError = String(/** @type {any} */ (e)?.message || e).slice(0, 80);
    }
    saveDiagSoon();
  };
  const boardTimer = setInterval(() => {
    if (!stopped) void loadBoard();
  }, BOARD_EVERY_MS);

  void connect();
  void loadBoard();

  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    clearInterval(silenceTimer);
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

const infoGate = createInfoPollGate({ liveMs: META_EVERY_MS, idleMs: 60_000, failBaseMs: 30_000, failMaxMs: 300_000 });
let checking = false;
let metaKey = '';
let metaAt = 0;

/** 配信の情報(名前・題・開始時刻・ページに出ている数)を送る @param {string} user @param {string} key */
function sendMeta(user, key) {
  const page = readTcPageInfo(document, user);
  diag.pageStats = Object.keys(page.stats || {});
  safeSendMessage({
    type: 'YT_STREAM_META',
    payload: {
      videoId: key,
      title: page.title || page.telop || `${page.name || user}の配信`,
      broadcasterName: page.name || user,
      broadcasterChannelId: `tc:${user}`,
      broadcasterHandle: user,
      broadcasterIconUrl: page.iconUrl || '',
      concurrentViewers: page.viewers != null ? page.viewers : undefined,
      ...(page.startedAtMs ? { startedAt: page.startedAtMs, startedAtApprox: false } : {}),
      ...(Object.keys(page.stats || {}).length ? { platformStats: page.stats } : {}),
    },
  });
  metaKey = key;
  metaAt = Date.now();
  saveDiagSoon();
}

async function check() {
  if (checking) return;
  const user = parseTcUserFromUrl(location.href);
  if (!user) {
    if (current) {
      current.stop();
      current = null;
    }
    diag.user = '';
    return;
  }
  // 配信が終わるとページの #updatetimer が data-live-type="movie" になる(2026-11-12 PC 実測)。すぐに止める
  if (current && current.user === user && document.querySelector('#updatetimer[data-live-type="movie"]')) {
    const endedKey = current.key;
    current.stop();
    current = null;
    diag.live = false;
    diag.streamKey = '';
    safeSendMessage({ type: 'YT_STREAM_META', payload: { videoId: endedKey, endedAt: Date.now() } });
    saveDiagSoon();
  }
  if (!infoGate.due(user, Date.now())) {
    // ページの数は数秒おきに変わるので、配信中は10秒おきに送る(読むのはページの文字だけ・通信なし)。
    //   配信中かを聞く回とは重ねない(同じ瞬間に「情報」と「終わった時刻」を続けて送ると、まとめの書き込みが重なって
    //   終わった時刻が消えることがあった・e2e で確認)
    if (current && current.user === user && metaKey === current.key && Date.now() - metaAt >= 10_000) sendMeta(user, current.key);
    return;
  }
  checking = true;
  try {
    const info = parseTcStreamServer(await tryJson(tcStreamServerUrl(user)));
    infoGate.done(user, !info ? 'fail' : info.isLive ? 'live' : 'idle', Date.now());
    diag.user = user;
    if (!info) return saveDiagSoon();
    diag.live = info.isLive;
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
    const key = buildTcStreamKey(user, { movieId: info.movieId });
    if (!key) return saveDiagSoon();
    if (!current || current.key !== key) {
      current?.stop();
      current = { user, key, stop: startReader(user, info.movieId, key) };
      diag.streamKey = key;
      diag.movieId = info.movieId;
    }
    sendMeta(user, key);
  } finally {
    checking = false;
  }
}

// ---- サイドパネル・会場からのコメント送信 ----
//   ページのコメント欄に打って送る。ログインしていないときは欄そのものが無く、#comment-list-app[data-account-type="not_logged_in"]
//   と「ログイン方法を選んでください」が出る(2026-11-12 PC 実測)ので、打つ前に止める。ログイン中の欄の形は未実測なので広めに探す。
const TC_INPUT_SEL = '#comment-list-app textarea, #comment-list-app input[type="text"], form textarea[name="comment"], textarea[placeholder*="コメント"], input[placeholder*="コメント"]';
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

/** ログインしていないと分かるか(分からなければ false=送ってみる) */
function tcSignedOut() {
  const t = String(document.querySelector('#comment-list-app')?.getAttribute('data-account-type') || '');
  if (t) return t === 'not_logged_in';
  return !!document.querySelector('#comment-list-app .tw-login-button-list');
}

/** 「コメント」送信のボタン(文字で探す) @param {Element | null} near */
function findSendButton(near) {
  const scope = near?.closest('form') || document;
  for (const b of Array.from(scope.querySelectorAll('button, input[type="submit"]'))) {
    const t = `${b.textContent || ''} ${b.getAttribute('value') || ''} ${b.getAttribute('aria-label') || ''}`;
    if (/送信|コメント|投稿|Comment|Send/i.test(t)) return /** @type {HTMLButtonElement} */ (b);
  }
  return null;
}

/** @param {string} reason */
function noteSendFail(reason) {
  try {
    void chrome.storage.local.set({ yt_diag_tc_send_fail: { at: Date.now(), reason, user: diag.user } });
  } catch {
    /* no-op */
  }
}

try {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== 'TC_SEND_COMMENT') return undefined;
    (async () => {
      const text = String(msg.text || '').replace(/\s+/g, ' ').trim().slice(0, 140);
      if (!text) return { ok: false, reason: 'empty' };
      if (tcSignedOut()) {
        noteSendFail('not-signed-in');
        return { ok: false, reason: 'not-signed-in' };
      }
      let input = /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (document.querySelector(TC_INPUT_SEL));
      for (let i = 0; !input && i < 6; i += 1) {
        await sleep(250);
        input = /** @type {any} */ (document.querySelector(TC_INPUT_SEL));
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
      const btn = findSendButton(input);
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
        void chrome.storage.local.set({ yt_diag_tc_send_last: { at: Date.now(), ok, len: text.length, user: diag.user, via: btn ? 'button' : 'enter' } });
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
