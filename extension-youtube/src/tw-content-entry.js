// tw-content-entry.js — Twitch の視聴ページ(www.twitch.tv/<チャンネル>)で、チャットを読んで記録に渡す入口。
/* global chrome, WebSocket, location, setTimeout, clearTimeout, setInterval, window, fetch, document, HTMLTextAreaElement, Event */
//
// ★設計(council/twitch-support-PLAN.md)
//   - 読むのは Twitch 公式の読み取り専用 IRC(ログイン無し・justinfanNNNN)。DOM より壊れにくい。
//   - 記録は YouTube 版と同じ口(YT_STREAM_META / YT_CHAT_ITEMS)へ送る。配信キー(videoId の位置)は 'tw.<login>.<配信番号>'。
//     そうすると記録・集計・ニコ生版の画面(yt-*.html)が YouTube と同じ作りで動く(直しが片方だけになる事故を防ぐ)。
//   - 配信番号・開始時刻・同接・顔は、twitch.tv のページ自身が使う GQL から読む(形を確かめ、取れなければ代わりの値)。
//   - 配信していないチャンネルのページでは記録しない(つながない)。

import { parseTwChatLine, parseTwChannelFromUrl } from '../../src/lib/twitch/twIrcParse.js';
import { buildTwStreamKey } from '../../src/lib/twitch/twStreamKey.js';
import {
  TW_GQL_URL,
  TW_WEB_CLIENT_ID,
  buildTwStreamInfoQuery,
  buildTwStreamInfoMinimalQuery,
  buildTwUsersIconQuery,
  buildTwLeaderboardsQuery,
  buildTwLeaderboardsFallbackQuery,
  parseTwStreamInfo,
  parseTwUsersIcons,
  parseTwLeaderboards,
} from '../../src/lib/twitch/twGql.js';

const IRC_URL = 'wss://irc-ws.chat.twitch.tv:443';
const META_EVERY_MS = 30_000;
const FLUSH_MS = 150;
const ICON_WAIT_MS = 400;
const MAX_SEEN = 5000;
/** 公式の応援ランキングを読み直す間(ページのチャット欄の順位表も数分おきにしか変わらない) */
const BOARD_EVERY_MS = 2 * 60_000;

/** 計器(状態速報と同じく storage に置く・りんくに聞かずに数で確かめる) */
const diag = {
  v: 1,
  channel: '',
  streamKey: '',
  live: null,
  ircState: 'idle',
  ircConnects: 0,
  ircLastErrorAt: 0,
  lines: 0,
  items: 0,
  bits: 0,
  subs: 0,
  gifts: 0,
  raids: 0,
  rewards: 0,
  milestones: 0,
  iconAsked: 0,
  iconFound: 0,
  iconLate: 0,
  gqlFail: 0,
  /** 公式の応援ランキング: 行数・どこから(gql:persisted / gql:query)・期間・読めなかった回数 */
  boardRows: 0,
  boardFrom: '',
  boardPeriod: '',
  boardFail: 0,
  updatedAt: 0,
};

function safeSendMessage(msg) {
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
      void chrome.storage.local.set({ yt_diag_tw_chat: { ...diag } });
    } catch {
      /* no-op */
    }
  }, 2000);
}

/** @param {any} body */
async function gql(body) {
  const res = await fetch(TW_GQL_URL, {
    method: 'POST',
    headers: { 'Client-Id': TW_WEB_CLIENT_ID, 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(body),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`gql_${res.status}`);
  return res.json();
}

/** @param {string} login */
async function fetchStreamInfo(login) {
  try {
    const info = parseTwStreamInfo(await gql(buildTwStreamInfoQuery(login)));
    if (info) return info;
  } catch {
    /* 下の小さい問い合わせへ */
  }
  try {
    const info = parseTwStreamInfo(await gql(buildTwStreamInfoMinimalQuery(login)));
    if (info) return info;
  } catch {
    /* 取れない */
  }
  diag.gqlFail += 1;
  return null;
}

// ---- 顔(IRC に無い)----
/** @type {Map<string, string>} login → 顔の URL('' = 顔が無いと分かった) */
const iconByLogin = new Map();
/** @type {Set<string>} */
const iconPending = new Set();
// 400ms の待ちに間に合わず顔なしで記録した人。あとで顔が分かったら storage(yt_tw_icons)に置き、画面が描くときに埋める
//   (記録は同じ id を2回入れられないので、記録そのものは書き直さない。2026-11-07 実配信 caedrel で顔ありの23人が顔なし)
const TW_LATE_ICONS_KEY = 'yt_tw_icons';
const TW_LATE_ICONS_MAX = 3000;
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
        const old = (await chrome.storage.local.get(TW_LATE_ICONS_KEY))?.[TW_LATE_ICONS_KEY];
        if (old && typeof old === 'object') lateIcons = { ...old, ...lateIcons };
        lateLoaded = true;
      }
      const keys = Object.keys(lateIcons);
      if (keys.length > TW_LATE_ICONS_MAX) {
        for (const k of keys.slice(0, keys.length - TW_LATE_ICONS_MAX)) delete lateIcons[k];
      }
      void chrome.storage.local.set({ [TW_LATE_ICONS_KEY]: lateIcons });
    } catch {
      /* 拡張が入れ替わった直後 */
    }
  }, 1500);
}

/** @param {string[]} logins */
async function lookupIcons(logins) {
  const want = logins.filter((l) => l && !iconByLogin.has(l) && !iconPending.has(l));
  if (!want.length) return;
  const q = buildTwUsersIconQuery(want);
  if (!q.logins.length) return;
  for (const l of q.logins) iconPending.add(l);
  diag.iconAsked += q.logins.length;
  try {
    const found = parseTwUsersIcons(await gql({ query: q.query }));
    for (const l of q.logins) {
      const url = found.get(l) || '';
      iconByLogin.set(l, url);
      if (url) diag.iconFound += 1;
      if (lateWanted.delete(l) && url) {
        delete lateIcons[l];
        lateIcons[l] = url;
        diag.iconLate += 1;
        saveLateIconsSoon();
      }
    }
  } catch {
    diag.gqlFail += 1;
    // 取れなかった人は次の発言でもう一度聞く(iconByLogin に入れない)
  } finally {
    for (const l of q.logins) iconPending.delete(l);
    if (iconByLogin.size > 20000) iconByLogin.clear();
  }
}

// ---- 1配信ぶんの読み取り ----
let current = /** @type {null | { login: string, key: string, stop: () => void }} */ (null);

/**
 * @param {string} login
 * @param {string} key
 */
function startReader(login, key) {
  let stopped = false;
  /** @type {WebSocket | null} */
  let ws = null;
  let backoff = 1000;
  let reconnectTimer = 0;
  /** @type {any[]} */
  let pending = [];
  let flushTimer = 0;
  /** @type {Set<string>} */
  const seen = new Set();

  const flush = async () => {
    flushTimer = 0;
    if (stopped || !pending.length) return;
    const batch = pending;
    pending = [];
    const need = [...new Set(batch.map((r) => r.login).filter((l) => l && !iconByLogin.has(l)))];
    if (need.length) {
      await Promise.race([lookupIcons(need), new Promise((r) => setTimeout(r, ICON_WAIT_MS))]);
    }
    const items = batch.map((r) => ({ ...r, iconUrl: iconByLogin.get(r.login) || '' }));
    for (const r of items) {
      if (!r.iconUrl && r.login && !iconByLogin.has(r.login)) lateWanted.add(r.login);
    }
    if (lateWanted.size > 5000) lateWanted.clear();
    diag.items += items.length;
    safeSendMessage({ type: 'YT_CHAT_ITEMS', payload: { videoId: key, chatFilterLabel: '', items } });
    saveDiagSoon();
  };

  /** @param {string} line */
  const onLine = (line) => {
    if (line.startsWith('PING')) {
      try {
        ws?.send(`PONG${line.slice(4)}`);
      } catch {
        /* no-op */
      }
      return;
    }
    diag.lines += 1;
    if (/^(?:@\S+ )?:tmi\.twitch\.tv RECONNECT/.test(line)) {
      try {
        ws?.close();
      } catch {
        /* no-op */
      }
      return;
    }
    const r = parseTwChatLine(line);
    if (!r || r.channel !== login) return;
    // まとめ贈り(submysterygift)の内訳の1人ずつの行は記録しない(まとめの1行に件数がある・二重に数えない)
    if (r.giftPartOf) return;
    if (seen.has(r.id)) return;
    seen.add(r.id);
    if (seen.size > MAX_SEEN) seen.delete(/** @type {string} */ (seen.values().next().value));
    if (r.kind === 'superchat') diag.bits += r.amount;
    else if (r.kind === 'membership') diag.subs += 1;
    // ギフトサブは金額 0(件数は giftCount)。金額を足していたので計器が常に 0 だった(2026-11-07 実配信)
    else if (r.kind === 'membership_gift') diag.gifts += Math.max(1, Number(r.giftCount) || 1);
    else if (r.kind === 'tw_raid') diag.raids += 1;
    else if (r.kind === 'tw_reward') diag.rewards += 1;
    else if (r.kind === 'tw_milestone') diag.milestones += 1;
    pending.push(r);
    if (!flushTimer) flushTimer = setTimeout(() => void flush(), FLUSH_MS);
  };

  const connect = () => {
    if (stopped) return;
    diag.ircState = 'connecting';
    diag.ircConnects += 1;
    try {
      ws = new WebSocket(IRC_URL);
    } catch {
      scheduleReconnect();
      return;
    }
    ws.onopen = () => {
      backoff = 1000;
      diag.ircState = 'open';
      const nick = `justinfan${10000 + Math.floor(Math.random() * 80000)}`;
      ws?.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      ws?.send('PASS SCHMOOPIIE');
      ws?.send(`NICK ${nick}`);
      ws?.send(`JOIN #${login}`);
      saveDiagSoon();
    };
    ws.onmessage = (ev) => {
      const text = typeof ev.data === 'string' ? ev.data : '';
      for (const line of text.split('\r\n')) if (line) onLine(line);
    };
    ws.onerror = () => {
      diag.ircLastErrorAt = Date.now();
    };
    ws.onclose = () => {
      diag.ircState = 'closed';
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

  connect();
  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (flushTimer) clearTimeout(flushTimer);
    void flush();
    try {
      ws?.close();
    } catch {
      /* no-op */
    }
    diag.ircState = 'idle';
  };
}

let lastInfoAt = 0;
let checking = false;
let lastBoardAt = 0;
let lastBoardKey = '';

/**
 * Twitch 公式の Bits ランキングを記録側へ(Kick の Kicks ランキング・YouTube のトップファンと同じ口・「ギフト貢献度」の欄に出る)。
 * 読めないとき・Bits の順位が空のときは送らない(画面はこの PC の記録から数えた順位のまま)。
 * @param {string} login @param {string} userId @param {string} key
 */
async function sendTwBoard(login, userId, key) {
  lastBoardAt = Date.now();
  lastBoardKey = key;
  /** @type {ReturnType<typeof parseTwLeaderboards>} */
  let board = null;
  let from = '';
  const persisted = buildTwLeaderboardsQuery(userId);
  if (persisted) {
    try {
      board = parseTwLeaderboards(await gql(persisted));
      if (board) from = 'gql:persisted';
    } catch {
      /* 下の手書きの問い合わせへ */
    }
  }
  if (!board) {
    const q = buildTwLeaderboardsFallbackQuery(login);
    try {
      board = q ? parseTwLeaderboards(await gql(q)) : null;
      if (board) from = 'gql:query';
    } catch {
      /* 読めない */
    }
  }
  if (!board || !board.bits.length) {
    diag.boardFail += 1;
    saveDiagSoon();
    return;
  }
  // 順位表には顔が無いので、チャットと同じ方法で顔を聞く(待ちすぎない)
  const logins = board.bits.map((r) => r.login).filter((l) => !iconByLogin.has(l));
  if (logins.length) await Promise.race([lookupIcons(logins), new Promise((r) => setTimeout(r, 3000))]);
  const rows = board.bits.map((r) => ({ rank: r.rank, name: r.name, xp: r.xp, iconUrl: iconByLogin.get(r.login) || '' }));
  diag.boardRows = rows.length;
  diag.boardFrom = from;
  diag.boardPeriod = board.period;
  safeSendMessage({ type: 'YT_LEADERBOARD', payload: { videoId: key, rows, period: board.period } });
  saveDiagSoon();
}

async function check() {
  if (checking) return;
  const login = parseTwChannelFromUrl(location.href);
  if (!login) {
    if (current) {
      current.stop();
      current = null;
    }
    diag.channel = '';
    return;
  }
  const sameChannel = current?.login === login;
  if (sameChannel && Date.now() - lastInfoAt < META_EVERY_MS) return;
  checking = true;
  try {
    const info = await fetchStreamInfo(login);
    lastInfoAt = Date.now();
    diag.channel = login;
    diag.live = info ? info.live : null;
    // 配信していない(と分かった)チャンネルは記録しない。GQL が読めないときは、つないで日付のキーで記録する(fail-soft)。
    if (info && !info.live) {
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
    const key = buildTwStreamKey(login, { streamId: info?.streamId, startedAtMs: info?.startedAtMs || null });
    if (!key) return;
    if (!current || current.key !== key) {
      current?.stop();
      current = { login, key, stop: startReader(login, key) };
      diag.streamKey = key;
    }
    safeSendMessage({
      type: 'YT_STREAM_META',
      payload: {
        videoId: key,
        title: info?.title || '',
        broadcasterName: info?.displayName || login,
        broadcasterChannelId: info?.userId ? `tw:${info.userId}` : `tw:@${login}`,
        broadcasterHandle: login,
        broadcasterIconUrl: info?.iconUrl || '',
        concurrentViewers: typeof info?.viewers === 'number' ? info.viewers : undefined,
        ...(info?.startedAtMs ? { startedAt: info.startedAtMs, startedAtApprox: false } : {}),
      },
    });
    if (info?.userId && (lastBoardKey !== key || Date.now() - lastBoardAt >= BOARD_EVERY_MS)) void sendTwBoard(login, info.userId, key);
    saveDiagSoon();
  } finally {
    checking = false;
  }
}

// ---- サイドパネル・会場からのコメント送信 ----
// Twitch 本体の入力欄に書いて送信ボタンを押す(YouTube 版の setupCommentSendBridge と同じ考え方。ログイン・送れるかは Twitch 本体が決める)。
//   入力欄は Slate(contenteditable)。execCommand('insertText') は beforeinput を出すので Slate が受け取れる。
const TW_INPUT_SEL = '[data-a-target="chat-input"] [contenteditable="true"], [data-a-target="chat-input"][contenteditable="true"], textarea[data-a-target="chat-input"]';
const TW_SEND_SEL = 'button[data-a-target="chat-send-button"]';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ログインしていないと分かるか。Twitch は未ログインでも入力欄と送信ボタンを出す(押すとログインを促す)ので、
 *   入力欄の有無では分からない(2026-11-07 実配信 3 チャンネルで確認)。ヘッダーのログインボタンと、ログイン中にだけ
 *   ある login クッキー(HttpOnly ではない)で見る。どちらも分からなければ「分からない」=送ってみる。
 */
function twSignedOut() {
  // ★user-menu-toggle は未ログインでもある(2026-11-07 実配信 caedrel ほか4チャンネルで確認)ので判定に使わない
  const hasLoginCookie = /(?:^|;\s*)login=[^;]+/.test(String(document.cookie || ''));
  if (hasLoginCookie) return false;
  return !!document.querySelector('[data-a-target="login-button"], [data-a-target="signup-button"]');
}

/** @param {string} reason */
function noteSendFail(reason) {
  try {
    void chrome.storage.local.set({ yt_diag_tw_send_fail: { at: Date.now(), reason, channel: diag.channel } });
  } catch {
    /* no-op */
  }
}

/** 入力欄が無い理由 */
function twInputBlockReason() {
  if (twSignedOut()) return 'not-signed-in';
  if (document.querySelector('[data-test-selector="chat-input-restricted"], [data-a-target="chat-input-restricted"]')) return 'chat-restricted';
  return 'no-input';
}

try {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== 'TW_SEND_COMMENT') return undefined;
    (async () => {
      const text = String(msg.text || '').replace(/\s+/g, ' ').trim().slice(0, 500);
      if (!text) return { ok: false, reason: 'empty' };
      // 未ログインで打つと、Twitch がログインの窓を出すだけで送られない。打つ前に止めて理由を出す
      if (twSignedOut()) {
        noteSendFail('not-signed-in');
        return { ok: false, reason: 'not-signed-in' };
      }
      let input = /** @type {HTMLElement | null} */ (document.querySelector(TW_INPUT_SEL));
      for (let i = 0; !input && i < 6; i += 1) {
        await sleep(250);
        input = /** @type {HTMLElement | null} */ (document.querySelector(TW_INPUT_SEL));
      }
      if (!input) {
        const reason = twInputBlockReason();
        noteSendFail(reason);
        return { ok: false, reason };
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
      const btn = /** @type {HTMLButtonElement | null} */ (document.querySelector(TW_SEND_SEL));
      if (!btn) {
        noteSendFail('no-send-button');
        return { ok: false, reason: 'no-send-button' };
      }
      if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') {
        noteSendFail('send-disabled');
        return { ok: false, reason: 'send-disabled' };
      }
      btn.click();
      await sleep(400);
      const left = String((input instanceof HTMLTextAreaElement ? input.value : input.textContent) || '').trim();
      const ok = left !== text;
      try {
        void chrome.storage.local.set({ yt_diag_tw_send_last: { at: Date.now(), ok, len: text.length, channel: diag.channel } });
      } catch {
        /* no-op */
      }
      return { ok, reason: ok ? '' : 'still-in-box' };
    })()
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, reason: String(e) }));
    return true;
  });
} catch {
  /* 拡張が入れ替わった直後 */
}

// Twitch は1枚のページの中で URL だけ変わる(チャンネルを移っても読み込み直さない)ので、URL を見張る
let lastHref = '';
setInterval(() => {
  if (location.href !== lastHref) {
    lastHref = location.href;
    lastInfoAt = 0;
  }
  void check();
}, 1000);
window.addEventListener('pagehide', () => current?.stop());
