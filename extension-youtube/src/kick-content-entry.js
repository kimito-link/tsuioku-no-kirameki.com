// kick-content-entry.js — Kick の視聴ページ(kick.com/<チャンネル>)で、チャットを読んで記録に渡す入口。
/* global chrome, WebSocket, location, setTimeout, clearTimeout, setInterval, clearInterval, window, fetch, document, HTMLTextAreaElement, Event, KeyboardEvent */
//
// ★設計(council/kick-support-PLAN.md・Twitch の tw-content-entry.js と同じ形)
//   - 読むのは Kick のページ自身が使う Pusher(ログイン無しで購読できる)。DOM より壊れにくい。
//   - 記録は YouTube 版と同じ口(YT_STREAM_META / YT_CHAT_ITEMS)へ送る。配信キー(videoId の位置)は 'kk.<slug>.<配信番号>'。
//   - チャットルームの番号・配信番号・開始時刻・同接・顔は、kick.com のページ自身が使う /api/v2/channels/<slug> から読む
//     (形を確かめ、取れなければ代わりの値)。配信していないチャンネルのページでは記録しない(つながない)。
//   - Pusher のイベント名・項目名は公式の文書が無い。計器(yt_diag_kk_chat)で PC 実測して確かめる。

import { parseKickChannelFromUrl, parsePusherFrame, parseKickEvent, parseKickDeleted } from '../../src/lib/kick/kickChatParse.js';
import { kickChannelApiUrl, parseKickChannel, parseKickUserIcon } from '../../src/lib/kick/kickApi.js';
import { buildKickStreamKey } from '../../src/lib/platform/streamPlatform.js';

// Kick のページが使う Pusher の公開キー(新しい順)。つながらなければ次を試す
const PUSHER_KEYS = ['32cbd69e4b950bf97679', 'eb1d5f283081a78b932c'];
const pusherUrl = (/** @type {string} */ key) => `wss://ws-us2.pusher.com/app/${key}?protocol=7&client=js&version=8.4.0&flash=false`;
const META_EVERY_MS = 30_000;
const FLUSH_MS = 150;
const ICON_WAIT_MS = 400;
const ICON_PARALLEL = 2;
const MAX_SEEN = 5000;

/** 計器(状態速報と同じく storage に置く・りんくに聞かずに数で確かめる) */
const diag = {
  v: 1,
  channel: '',
  streamKey: '',
  chatroomId: '',
  live: null,
  wsState: 'idle',
  wsConnects: 0,
  wsLastErrorAt: 0,
  pusherKey: '',
  subscribed: 0,
  frames: 0,
  /** @type {Record<string, number>} 来たイベント名ごとの数(名前が変わったら気づくため) */
  events: {},
  items: 0,
  kicks: 0,
  subs: 0,
  gifts: 0,
  hosts: 0,
  deleted: 0,
  iconAsked: 0,
  iconFound: 0,
  iconLate: 0,
  apiFail: 0,
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
      void chrome.storage.local.set({ yt_diag_kk_chat: { ...diag, events: { ...diag.events } } });
    } catch {
      /* no-op */
    }
  }, 2000);
}

/** @param {string} url */
async function getJson(url) {
  const res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`kick_${res.status}`);
  return res.json();
}

/** @param {string} slug */
async function fetchChannel(slug) {
  try {
    const info = parseKickChannel(await getJson(kickChannelApiUrl(slug)));
    if (info) return info;
  } catch {
    /* 下で数える */
  }
  diag.apiFail += 1;
  return null;
}

// ---- 顔(チャットに無い)----
/** @type {Map<string, string>} slug → 顔の URL('' = 顔が無いと分かった) */
const iconBySlug = new Map();
/** @type {Set<string>} */
const iconPending = new Set();
/** @type {string[]} */
const iconQueue = [];
let iconRunning = 0;
const LATE_ICONS_KEY = 'yt_kk_icons';
const LATE_ICONS_MAX = 3000;
/** @type {Set<string>} */
const lateWanted = new Set();
/** @type {Record<string, string>} */
let lateIcons = {};
let lateLoaded = false;
let lateTimer = 0;
function saveLateIconsSoon() {
  if (lateTimer) return;
  lateTimer = setTimeout(async () => {
    lateTimer = 0;
    try {
      if (!lateLoaded) {
        const old = (await chrome.storage.local.get(LATE_ICONS_KEY))?.[LATE_ICONS_KEY];
        if (old && typeof old === 'object') lateIcons = { ...old, ...lateIcons };
        lateLoaded = true;
      }
      const keys = Object.keys(lateIcons);
      if (keys.length > LATE_ICONS_MAX) for (const k of keys.slice(0, keys.length - LATE_ICONS_MAX)) delete lateIcons[k];
      void chrome.storage.local.set({ [LATE_ICONS_KEY]: lateIcons });
    } catch {
      /* 拡張が入れ替わった直後 */
    }
  }, 1500);
}

/** @type {Array<() => void>} */
let iconWaiters = [];
function pumpIcons() {
  while (iconRunning < ICON_PARALLEL && iconQueue.length) {
    const slug = /** @type {string} */ (iconQueue.shift());
    iconRunning += 1;
    diag.iconAsked += 1;
    void (async () => {
      try {
        const url = parseKickUserIcon(await getJson(kickChannelApiUrl(slug)));
        iconBySlug.set(slug, url);
        if (url) diag.iconFound += 1;
        if (lateWanted.delete(slug) && url) {
          delete lateIcons[slug];
          lateIcons[slug] = url;
          diag.iconLate += 1;
          saveLateIconsSoon();
        }
      } catch {
        diag.apiFail += 1;
        // 取れなかった人は次の発言でもう一度聞く(iconBySlug に入れない)
      } finally {
        iconPending.delete(slug);
        iconRunning -= 1;
        if (iconBySlug.size > 20000) iconBySlug.clear();
        const w = iconWaiters;
        iconWaiters = [];
        for (const f of w) f();
        pumpIcons();
      }
    })();
  }
}
/** @param {string[]} slugs */
function lookupIcons(slugs) {
  for (const s of slugs) {
    if (!s || iconBySlug.has(s) || iconPending.has(s)) continue;
    // 混んでいるときは古い頼みを捨てる(新しく話した人を先に)
    if (iconQueue.length > 60) iconPending.delete(/** @type {string} */ (iconQueue.shift()));
    iconPending.add(s);
    iconQueue.push(s);
  }
  pumpIcons();
  return new Promise((resolve) => {
    if (!slugs.some((s) => iconPending.has(s))) return resolve(undefined);
    iconWaiters.push(() => resolve(undefined));
  });
}

// ---- 1配信ぶんの読み取り ----
let current = /** @type {null | { slug: string, key: string, stop: () => void }} */ (null);

/**
 * @param {string} slug
 * @param {string} key
 * @param {{ chatroomId: string, channelId: string }} ids
 */
function startReader(slug, key, ids) {
  let stopped = false;
  /** @type {WebSocket | null} */
  let ws = null;
  let backoff = 1000;
  let reconnectTimer = 0;
  let pingTimer = 0;
  let keyIndex = 0;
  let established = false;
  /** @type {any[]} */
  let pending = [];
  let flushTimer = 0;
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {Map<string, string>} チャットで見た人の slug → user id(サブスク等の通知は名前だけなので同じ人にそろえる) */
  const idBySlug = new Map();

  const flush = async () => {
    flushTimer = 0;
    if (stopped || !pending.length) return;
    const batch = pending;
    pending = [];
    const need = [...new Set(batch.map((r) => r.login).filter((l) => l && !iconBySlug.has(l)))];
    if (need.length) await Promise.race([lookupIcons(need), new Promise((r) => setTimeout(r, ICON_WAIT_MS))]);
    const items = batch.map((r) => ({ ...r, iconUrl: iconBySlug.get(r.login) || '' }));
    for (const r of items) if (!r.iconUrl && r.login && !iconBySlug.has(r.login)) lateWanted.add(r.login);
    if (lateWanted.size > 5000) lateWanted.clear();
    diag.items += items.length;
    safeSendMessage({ type: 'YT_CHAT_ITEMS', payload: { videoId: key, chatFilterLabel: '', items } });
    saveDiagSoon();
  };

  const send = (/** @type {any} */ obj) => {
    try {
      ws?.send(JSON.stringify(obj));
    } catch {
      /* no-op */
    }
  };

  /** @param {string} raw */
  const onFrame = (raw) => {
    const f = parsePusherFrame(raw);
    if (!f) return;
    diag.frames += 1;
    if (f.event === 'pusher:connection_established') {
      established = true;
      diag.wsState = 'open';
      diag.pusherKey = PUSHER_KEYS[keyIndex];
      backoff = 1000;
      const chans = [`chatrooms.${ids.chatroomId}.v2`, `chatroom_${ids.chatroomId}`];
      if (ids.channelId) chans.push(`channel.${ids.channelId}`, `channel_${ids.channelId}`);
      for (const channel of chans) send({ event: 'pusher:subscribe', data: { auth: '', channel } });
      saveDiagSoon();
      return;
    }
    if (f.event === 'pusher:ping') return send({ event: 'pusher:pong', data: {} });
    if (f.event === 'pusher_internal:subscription_succeeded') {
      diag.subscribed += 1;
      return;
    }
    if (f.event === 'pusher:error') {
      // 4001 = キーが無い(Kick がキーを替えた)→ 次のキー
      const code = Number(f.data?.code);
      if (!established && code >= 4000 && code < 4100 && keyIndex + 1 < PUSHER_KEYS.length) keyIndex += 1;
      return;
    }
    if (f.event.startsWith('pusher')) return;
    const evName = f.event.replace(/^App\\Events\\/, '').slice(0, 60);
    diag.events[evName] = (diag.events[evName] || 0) + 1;
    const del = parseKickDeleted(f);
    if (del) {
      diag.deleted += 1;
      return;
    }
    const r = parseKickEvent(f, { chatroomId: ids.chatroomId, idOfSlug: (s) => idBySlug.get(s) || '' });
    if (!r) return;
    if (r.kind === 'text' && r.login && r.channelId.startsWith('kk:') && !r.channelId.startsWith('kk:@')) {
      idBySlug.set(r.login, r.channelId.slice(3));
      if (idBySlug.size > 20000) idBySlug.clear();
    }
    if (seen.has(r.id)) return;
    seen.add(r.id);
    if (seen.size > MAX_SEEN) seen.delete(/** @type {string} */ (seen.values().next().value));
    if (r.kind === 'superchat') diag.kicks += r.amount;
    else if (r.kind === 'membership') diag.subs += 1;
    else if (r.kind === 'membership_gift') diag.gifts += Math.max(1, Number(r.giftCount) || 1);
    else if (r.kind === 'kk_host') diag.hosts += 1;
    pending.push(r);
    if (!flushTimer) flushTimer = setTimeout(() => void flush(), FLUSH_MS);
  };

  const connect = () => {
    if (stopped) return;
    established = false;
    diag.wsState = 'connecting';
    diag.wsConnects += 1;
    try {
      ws = new WebSocket(pusherUrl(PUSHER_KEYS[keyIndex]));
    } catch {
      scheduleReconnect();
      return;
    }
    ws.onmessage = (ev) => onFrame(typeof ev.data === 'string' ? ev.data : '');
    ws.onerror = () => {
      diag.wsLastErrorAt = Date.now();
    };
    ws.onclose = () => {
      diag.wsState = 'closed';
      // つながってすぐ切れた(キーが違う等)なら、次のキーを試す
      if (!established && keyIndex + 1 < PUSHER_KEYS.length) keyIndex += 1;
      else if (!established) keyIndex = 0;
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

  // Pusher は 120 秒何も無いと切る。こちらからも1分おきに ping
  pingTimer = setInterval(() => {
    if (established) send({ event: 'pusher:ping', data: {} });
  }, 60_000);

  connect();
  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (flushTimer) clearTimeout(flushTimer);
    clearInterval(pingTimer);
    void flush();
    try {
      ws?.close();
    } catch {
      /* no-op */
    }
    diag.wsState = 'idle';
  };
}

let lastInfoAt = 0;
let checking = false;

async function check() {
  if (checking) return;
  const slug = parseKickChannelFromUrl(location.href);
  if (!slug) {
    if (current) {
      current.stop();
      current = null;
    }
    diag.channel = '';
    return;
  }
  const sameChannel = current?.slug === slug;
  if (sameChannel && Date.now() - lastInfoAt < META_EVERY_MS) return;
  checking = true;
  try {
    const info = await fetchChannel(slug);
    lastInfoAt = Date.now();
    diag.channel = slug;
    diag.live = info ? info.live : null;
    // チャットルームの番号が分からないと読めない。分からなければ次の見回りでもう一度
    if (!info) {
      saveDiagSoon();
      return;
    }
    diag.chatroomId = info.chatroomId;
    if (!info.live) {
      if (current) {
        const endedKey = current.key;
        current.stop();
        current = null;
        safeSendMessage({ type: 'YT_STREAM_META', payload: { videoId: endedKey, endedAt: Date.now() } });
      }
      diag.streamKey = '';
      saveDiagSoon();
      return;
    }
    const key = buildKickStreamKey(slug, { streamId: info.streamId, startedAtMs: info.startedAtMs || null });
    if (!key) return;
    if (!current || current.key !== key) {
      current?.stop();
      current = { slug, key, stop: startReader(slug, key, { chatroomId: info.chatroomId, channelId: info.channelId }) };
      diag.streamKey = key;
    }
    if (info.iconUrl) iconBySlug.set(slug, info.iconUrl);
    safeSendMessage({
      type: 'YT_STREAM_META',
      payload: {
        videoId: key,
        title: info.title || '',
        broadcasterName: info.displayName || slug,
        broadcasterChannelId: info.userId ? `kk:${info.userId}` : `kk:@${slug}`,
        broadcasterHandle: slug,
        broadcasterIconUrl: info.iconUrl || '',
        concurrentViewers: typeof info.viewers === 'number' ? info.viewers : undefined,
        ...(info.startedAtMs ? { startedAt: info.startedAtMs, startedAtApprox: false } : {}),
      },
    });
    saveDiagSoon();
  } finally {
    checking = false;
  }
}

// ---- サイドパネル・会場からのコメント送信 ----
// Kick 本体の入力欄に書いて送信ボタンを押す(Twitch と同じ考え方)。入力欄は contenteditable(Lexical)。
//   execCommand('insertText') は beforeinput を出すので受け取れる。ボタンが無ければ Enter。
const KK_INPUT_SEL = '#message-input, [data-testid="chat-input"], #chatroom-footer [contenteditable="true"], [data-lexical-editor="true"], textarea[placeholder*="message" i]';
const KK_SEND_SEL = '#send-message-button, [data-testid="send-message-button"], #chatroom-footer button[aria-label*="send" i], button[aria-label*="Send message" i]';
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ログインしていないと分かるか。ログイン中にだけある session_token クッキー(Kick のページがログインに使う)で見る。
 *   無くてもログインボタンが見えなければ「分からない」=送ってみる(Twitch の実配信の教訓: ログインの印になる要素は推測しない)。
 */
function kkSignedOut() {
  if (/(?:^|;\s*)session_token=[^;]+/.test(String(document.cookie || ''))) return false;
  const btns = [...document.querySelectorAll('button, a')].slice(0, 400);
  return btns.some((b) => /^(?:log ?in|sign ?in|ログイン)$/i.test(String(b.textContent || '').trim()) || b.getAttribute('data-testid') === 'login');
}

/** @param {string} reason */
function noteSendFail(reason) {
  try {
    void chrome.storage.local.set({ yt_diag_kk_send_fail: { at: Date.now(), reason, channel: diag.channel } });
  } catch {
    /* no-op */
  }
}

try {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== 'KICK_SEND_COMMENT') return undefined;
    (async () => {
      const text = String(msg.text || '').replace(/\s+/g, ' ').trim().slice(0, 500);
      if (!text) return { ok: false, reason: 'empty' };
      if (kkSignedOut()) {
        noteSendFail('not-signed-in');
        return { ok: false, reason: 'not-signed-in' };
      }
      let input = /** @type {HTMLElement | null} */ (document.querySelector(KK_INPUT_SEL));
      for (let i = 0; !input && i < 6; i += 1) {
        await sleep(250);
        input = /** @type {HTMLElement | null} */ (document.querySelector(KK_INPUT_SEL));
      }
      if (!input) {
        noteSendFail('no-input');
        return { ok: false, reason: 'no-input' };
      }
      input.focus();
      if (input instanceof HTMLTextAreaElement) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(input, text);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        try {
          document.execCommand('selectAll', false);
          document.execCommand('delete', false);
          document.execCommand('insertText', false, text);
        } catch {
          /* no-op */
        }
      }
      await sleep(120);
      const btn = /** @type {HTMLButtonElement | null} */ (document.querySelector(KK_SEND_SEL));
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
      const left = String((input instanceof HTMLTextAreaElement ? input.value : input.textContent) || '').trim();
      const ok = left !== text;
      try {
        void chrome.storage.local.set({ yt_diag_kk_send_last: { at: Date.now(), ok, len: text.length, channel: diag.channel, via: btn ? 'button' : 'enter' } });
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

// Kick も1枚のページの中で URL だけ変わるので、URL を見張る
let lastHref = '';
setInterval(() => {
  if (location.href !== lastHref) {
    lastHref = location.href;
    lastInfoAt = 0;
  }
  void check();
}, 1000);
window.addEventListener('pagehide', () => current?.stop());
