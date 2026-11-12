// kick-content-entry.js — Kick の視聴ページ(kick.com/<チャンネル>)で、チャットを読んで記録に渡す入口。
/* global chrome, crypto, WebSocket, location, setTimeout, clearTimeout, setInterval, clearInterval, window, fetch, document, HTMLTextAreaElement, Event, KeyboardEvent */
//
// ★設計(council/kick-support-PLAN.md・Twitch の tw-content-entry.js と同じ形)
//   - 読むのは Kick のページ自身が使うリアルタイムの接続(ログイン無しで購読できる)。DOM より壊れにくい。
//     ★2026-11-08 PC 実測: 固定の Pusher の鍵は無効になっていた(0件)。つなぎ先は毎回 Kick の API に聞く
//       (src/lib/kick/kickRealtime.js)。第一候補は Centrifugo、だめなら API が返す Pusher の鍵。
//   - 記録は YouTube 版と同じ口(YT_STREAM_META / YT_CHAT_ITEMS)へ送る。配信キー(videoId の位置)は 'kk.<slug>.<配信番号>'。
//   - チャットルームの番号・配信番号・開始時刻・同接・顔は、kick.com のページ自身が使う /api/v2/channels/<slug> から読む
//     (形を確かめ、取れなければ代わりの値)。配信していないチャンネルのページでは記録しない(つながない)。
//   - Pusher のイベント名・項目名は公式の文書が無い。計器(yt_diag_kk_chat)で PC 実測して確かめる。

import { parseKickChannelFromUrl, parsePusherFrame, parseKickEvent, parseKickDeleted } from '../../src/lib/kick/kickChatParse.js';
import { startPageStallWatch } from '../../src/lib/stallTrace.js';
try {
  const stallRoot = /** @type {any} */ (globalThis);
  if (!stallRoot.__nlStallWatch) {
    stallRoot.__nlStallWatch = startPageStallWatch({
      file: 'kick-content-entry.js',
      send: (summary) => {
        try { chrome.runtime.sendMessage({ type: 'NLS_STALL_SUMMARY', page: location.hostname, summary, events: stallRoot.__nlStallWatch.takeFresh() }); } catch { /* 計器 */ }
      },
    });
  }
} catch { /* 計器 */ }
import { kickChatHistoryUrl, parseKickChatHistory, kickChannelApiUrl, parseKickChannel, parseKickUserIcon, parseKickKicksLeaderboard, kickKicksLeaderboardUrl, parseKickSubsLeaderboard, kickSubsLeaderboardUrl } from '../../src/lib/kick/kickApi.js';
import { buildKickStreamKey } from '../../src/lib/platform/streamPlatform.js';
import {
  KICK_REALTIME_CONNECTION_URL,
  KICK_REALTIME_AUTH_URL,
  kickRealtimeConnectionBody,
  parseKickRealtimeConnection,
  parseKickRealtimeToken,
  kickPusherUrl,
  kickRealtimeChannels,
  centrifugoConnectMsg,
  centrifugoSubscribeMsg,
  parseCentrifugoFrames,
} from '../../src/lib/kick/kickRealtime.js';
import { createEmoteSaver } from './pfEmoteStore.js';
import { platformFetchTimeoutSignal } from '../../src/lib/platform/fetchTimeout.js';
// 視聴者数をページに合わせるため 10 秒おき(30 秒だとページの数から遅れていた・2026-11-11 PC 計測の Twitch と同じ)
const META_EVERY_MS = 10_000;
const FLUSH_MS = 150;
const ICON_WAIT_MS = 400;
// 顔は1人ずつ・間をあけて聞く。混んだ配信で毎秒聞いて Kick に 429(多すぎ)を返され、
//   自分の配信の問い合わせまで 429 になった(2026-11-08 PC 実測・約7分で 429 が 375 回)。
const ICON_PARALLEL = 1;
/** 公式の順位表をソケットで受けないまま、この時間たったら API で読み直す */
const BOARD_REFRESH_MS = 5 * 60_000;
const ICON_GAP_MS = 1500;
/** 429 を受けたら少し休む(続けば倍に・最大5分) */
const ICON_PAUSE_MIN_MS = 30_000;
const ICON_PAUSE_MAX_MS = 300_000;
/** 取れなかった人は、しばらく聞き直さない */
const ICON_RETRY_AFTER_MS = 10 * 60_000;
const MAX_SEEN = 5000;

/** 計器(状態速報と同じく storage に置く・りんくに聞かずに数で確かめる) */
const diag = {
  /** 覚えた絵文字の数(画面で画像にする名前) */
  emotes: 0,
  v: 1,
  channel: '',
  streamKey: '',
  chatroomId: '',
  live: null,
  wsState: 'idle',
  wsConnects: 0,
  wsLastErrorAt: 0,
  /** つないだ方式('centrifugo' / 'pusher')と、つなぎ先を聞く API の失敗数 */
  provider: '',
  realtimeHost: '',
  routeFail: 0,
  pusherKey: '',
  rewards: 0,
  /** 公式の Kicks ランキング(行数・どこから・どの id で取れたか) */
  boardRows: 0,
  subBoardRows: 0,
  subBoardFrom: '',
  subBoardFail: 0,
  boardFrom: '',
  boardFail: 0,
  subscribed: 0,
  frames: 0,
  /** @type {Record<string, number>} 来たイベント名ごとの数(名前が変わったら気づくため) */
  events: {},
  items: 0,
  /** 開いた時点(とつなぎ直し)の過去ログから入れた数・読めなかった回数 */
  historyItems: 0,
  historyFail: 0,
  kicks: 0,
  subs: 0,
  gifts: 0,
  hosts: 0,
  deleted: 0,
  iconAsked: 0,
  iconFound: 0,
  iconLate: 0,
  /** 顔の問い合わせで 429 を受けた回数と、休んだ回数 */
  icon429: 0,
  iconPaused: 0,
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
/** 絵文字の名前 → 画像(画面で本文を画像にする・pfEmoteStore.js) */
const emoteSaver = createEmoteSaver('yt_kk_emotes');
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

/** @param {string} url @param {any} body */
async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include', signal: platformFetchTimeoutSignal(),
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`kick_${res.status}`);
  return res.json();
}

function newClientId() {
  try {
    if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* 下へ */
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}-4000-8000-${Math.random().toString(16).slice(2, 14)}`;
}

/** @param {string} url */
async function getJson(url) {
  const res = await fetch(url, { credentials: 'include', signal: platformFetchTimeoutSignal(), headers: { Accept: 'application/json' } });
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
let iconNextAt = 0;
let iconPauseMs = 0;
let iconPumpTimer = 0;
/** @type {Map<string, number>} slug → 取れなかった時刻 */
const iconFailedAt = new Map();
function pumpIcons() {
  const now = Date.now();
  if (iconRunning < ICON_PARALLEL && iconQueue.length && now < iconNextAt) {
    if (!iconPumpTimer) {
      iconPumpTimer = setTimeout(() => {
        iconPumpTimer = 0;
        pumpIcons();
      }, iconNextAt - now);
    }
    return;
  }
  while (iconRunning < ICON_PARALLEL && iconQueue.length) {
    const slug = /** @type {string} */ (iconQueue.shift());
    iconRunning += 1;
    diag.iconAsked += 1;
    iconNextAt = Date.now() + ICON_GAP_MS;
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
        iconPauseMs = 0;
      } catch (e) {
        diag.apiFail += 1;
        // 取れなかった人は、しばらくしてからもう一度聞く(iconBySlug に入れない)
        iconFailedAt.set(slug, Date.now());
        if (iconFailedAt.size > 5000) iconFailedAt.clear();
        if (String(/** @type {any} */ (e)?.message || '') === 'kick_429') {
          diag.icon429 += 1;
          diag.iconPaused += 1;
          iconPauseMs = Math.min(ICON_PAUSE_MAX_MS, iconPauseMs ? iconPauseMs * 2 : ICON_PAUSE_MIN_MS);
          iconNextAt = Date.now() + iconPauseMs;
          // 休む間に溜まった頼みは捨てる(待っている記録は顔なしで先に出し、あとで顔を足す)
          for (const q of iconQueue.splice(0)) iconPending.delete(q);
        }
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
    const failed = iconFailedAt.get(s);
    if (failed && Date.now() - failed < ICON_RETRY_AFTER_MS) continue;
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
 * @param {{ chatroomId: string, channelId: string, userId?: string }} ids
 */
function startReader(slug, key, ids) {
  let stopped = false;
  /** @type {WebSocket | null} */
  let ws = null;
  let backoff = 1000;
  let reconnectTimer = 0;
  let pingTimer = 0;
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
    diag.emotes = emoteSaver.takeFrom(items);
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

  /** 名前(小文字)→ チャットで見た本物の user id と slug @type {Map<string, { id: string, slug: string }>} */
  const whoByName = new Map();

  /** 1件のイベント(Centrifugo / Pusher 共通の形)@param {{ event: string, channel: string, data: Record<string, any> | null }} f */
  const onEvent = (f) => {
    const evName = f.event.replace(/^App\\Events\\/, '').slice(0, 60);
    diag.events[evName] = (diag.events[evName] || 0) + 1;
    if (evName === 'KicksLeaderboardUpdated') return sendBoard(parseKickKicksLeaderboard(f.data), 'socket');
    if (evName === 'GiftsLeaderboardUpdated') return sendSubBoard(parseKickSubsLeaderboard(f.data), 'socket');
    const del = parseKickDeleted(f);
    if (del) {
      diag.deleted += 1;
      return;
    }
    const r = parseKickEvent(f, {
      chatroomId: ids.chatroomId,
      idOfSlug: (s) => idBySlug.get(s) || '',
      who: (name) => whoByName.get(String(name || '').toLowerCase()) || null,
    });
    if (!r) return;
    if (r.kind === 'text' && r.login && r.channelId.startsWith('kk:') && !r.channelId.startsWith('kk:@')) {
      idBySlug.set(r.login, r.channelId.slice(3));
      whoByName.set(r.name.toLowerCase(), { id: r.channelId.slice(3), slug: r.login });
      if (idBySlug.size > 20000) idBySlug.clear();
      if (whoByName.size > 20000) whoByName.clear();
    }
    if (r.iconUrl && r.login && !iconBySlug.has(r.login)) iconBySlug.set(r.login, r.iconUrl);
    if (seen.has(r.id)) return;
    seen.add(r.id);
    if (seen.size > MAX_SEEN) seen.delete(/** @type {string} */ (seen.values().next().value));
    if (r.kind === 'superchat') diag.kicks += r.amount;
    else if (r.kind === 'membership') diag.subs += 1;
    else if (r.kind === 'membership_gift') diag.gifts += Math.max(1, Number(r.giftCount) || 1);
    else if (r.kind === 'kk_host') diag.hosts += 1;
    else if (r.kind === 'kk_reward') diag.rewards += 1;
    pending.push(r);
    if (!flushTimer) flushTimer = setTimeout(() => void flush(), FLUSH_MS);
  };

  const chans = kickRealtimeChannels(ids.chatroomId, ids.channelId);

  /** 公式の Kicks ランキングを記録側へ(YouTube のトップファンと同じ口・ギフト貢献度の欄に出る) @param {any} rows @param {string} from */
  let boardAt = 0;
  const sendBoard = (rows, from) => {
    if (!Array.isArray(rows) || !rows.length) return;
    boardAt = Date.now();
    diag.boardRows = rows.length;
    diag.boardFrom = from;
    safeSendMessage({ type: 'YT_LEADERBOARD', payload: { videoId: key, rows } });
    saveDiagSoon();
  };
  // 順位表を API で読む。答えるのはチャンネル id(2026-11-08 PC 実測・ユーザー id は空の一覧)。念のためユーザー id も試す
  const fetchBoard = async () => {
    for (const id of [ids.channelId, ids.userId]) {
      const url = kickKicksLeaderboardUrl(id);
      if (!url || stopped) continue;
      try {
        const rows = parseKickKicksLeaderboard(await getJson(url));
        if (rows.length) return sendBoard(rows, `api:${id === ids.channelId ? 'channel' : 'user'}`);
      } catch {
        /* 次の id */
      }
    }
    diag.boardFail += 1;
    saveDiagSoon();
  };
  /**
   * 2つめの公式ランキング = kick.com のチャット欄の順位表の「サブ」(ギフトサブ・通算)。
   *   Kicks の順位表(歴代)と並べるので期間は通算にそろえる。数は Kick の値そのまま。
   * @param {any} rows @param {string} from
   */
  let subBoardAt = 0;
  const sendSubBoard = (rows, from) => {
    if (!Array.isArray(rows) || !rows.length) return;
    subBoardAt = Date.now();
    diag.subBoardRows = rows.length;
    diag.subBoardFrom = from;
    safeSendMessage({
      type: 'YT_LEADERBOARD',
      payload: { videoId: key, slot: 'sub', title: 'ギフトサブ ランキング', unit: 'サブ', period: 'ALLTIME', rows },
    });
    saveDiagSoon();
  };
  const fetchSubBoard = async () => {
    const url = kickSubsLeaderboardUrl(slug);
    if (!url || stopped) return;
    try {
      const rows = parseKickSubsLeaderboard(await getJson(url));
      if (rows.length) return sendSubBoard(rows, 'api');
    } catch {
      /* 下で数える */
    }
    diag.subBoardFail += 1;
    saveDiagSoon();
  };
  // 開いた時点で1回。以後はソケットの KicksLeaderboardUpdated で届くが、Kicks が来ない配信では
  //   「最終更新: 7分前（少し前の値）」と古く見えた(値は正しい)ので、5分届かなければ API で読み直す
  void fetchBoard();
  void fetchSubBoard();
  const boardTimer = setInterval(() => {
    if (stopped) return clearInterval(boardTimer);
    if (Date.now() - boardAt >= BOARD_REFRESH_MS) void fetchBoard();
    if (Date.now() - subBoardAt >= BOARD_REFRESH_MS) void fetchSubBoard();
  }, 60_000);

  // 開いた時点でチャット欄に出ている過去ログを記録に入れる(つないだ後に来た分しか記録せず、開いた直後は「記録 0」に見えた・
  //   2026-11-12 PC 実測: kuru96 で過去ログ25行中1行しか記録されず、YouTube は 73行全部)。
  //   つなぎ直したときも読む(切れていた間の分を拾う)。同じ id は seen と保存側の pk で1件になる。
  const fetchHistory = async () => {
    const url = kickChatHistoryUrl(ids.channelId);
    if (!url || stopped) return;
    try {
      const frames = parseKickChatHistory(await getJson(url));
      if (stopped) return;
      const before = diag.items + pending.length;
      for (const f of frames) onEvent(f);
      diag.historyItems += Math.max(0, diag.items + pending.length - before);
    } catch {
      diag.historyFail += 1;
    }
    saveDiagSoon();
  };

  /** Pusher の1通 @param {string} raw */
  const onPusherFrame = (raw) => {
    const f = parsePusherFrame(raw);
    if (!f) return;
    diag.frames += 1;
    if (f.event === 'pusher:connection_established') {
      established = true;
      diag.wsState = 'open';
      backoff = 1000;
      for (const channel of chans) send({ event: 'pusher:subscribe', data: { auth: '', channel } });
      void fetchHistory();
      saveDiagSoon();
      return;
    }
    if (f.event === 'pusher:ping') return send({ event: 'pusher:pong', data: {} });
    if (f.event === 'pusher_internal:subscription_succeeded') {
      diag.subscribed += 1;
      return;
    }
    if (f.event.startsWith('pusher')) return;
    onEvent(f);
  };

  /** Centrifugo の1フレーム @param {string} raw */
  const onCentFrame = (raw) => {
    for (const m of parseCentrifugoFrames(raw)) {
      diag.frames += 1;
      if (m.type === 'ping') {
        try {
          ws?.send('{}');
        } catch {
          /* no-op */
        }
      } else if (m.type === 'reply') {
        if (m.id === 1 && m.ok) {
          established = true;
          diag.wsState = 'open';
          backoff = 1000;
          chans.forEach((channel, i) => send(centrifugoSubscribeMsg(channel, i + 2)));
          void fetchHistory();
          saveDiagSoon();
        } else if (m.id >= 2 && m.ok) diag.subscribed += 1;
        else if (!m.ok) diag.wsLastErrorAt = Date.now();
      } else if (m.type === 'push') onEvent(m);
    }
  };

  // つなぎ方の順番。Centrifugo でつながらなかったら次は Pusher を試す(交互)
  let preferPusher = false;

  /** つなぎ先を Kick に聞く(失敗したら null) */
  const resolveRoute = async () => {
    const clientId = newClientId();
    try {
      const routes = parseKickRealtimeConnection(
        await postJson(KICK_REALTIME_CONNECTION_URL, kickRealtimeConnectionBody(clientId, preferPusher ? ['pusher'] : ['pusher', 'centrifugo'])),
      );
      const route = routes.find((r) => r.provider === (preferPusher ? 'pusher' : 'centrifugo')) || routes[0];
      if (!route) throw new Error('no_route');
      if (route.provider === 'pusher') return { kind: 'pusher', url: kickPusherUrl(route.key, route.cluster), key: route.key, token: '' };
      const token = parseKickRealtimeToken(await postJson(KICK_REALTIME_AUTH_URL, { client_id: clientId }));
      if (!token) throw new Error('no_token');
      return { kind: 'centrifugo', url: route.url, key: '', token };
    } catch {
      diag.routeFail += 1;
      saveDiagSoon();
      return null;
    }
  };

  const connect = async () => {
    if (stopped) return;
    established = false;
    diag.wsState = 'resolving';
    const route = await resolveRoute();
    if (stopped) return;
    if (!route) {
      diag.wsState = 'closed';
      preferPusher = !preferPusher;
      scheduleReconnect();
      return;
    }
    diag.provider = route.kind;
    diag.pusherKey = route.key;
    try {
      diag.realtimeHost = new URL(route.url).host;
    } catch {
      diag.realtimeHost = '';
    }
    diag.wsState = 'connecting';
    diag.wsConnects += 1;
    try {
      ws = new WebSocket(route.url);
    } catch {
      scheduleReconnect();
      return;
    }
    if (route.kind === 'centrifugo') {
      ws.onopen = () => send(centrifugoConnectMsg(route.token));
      ws.onmessage = (ev) => onCentFrame(typeof ev.data === 'string' ? ev.data : '');
    } else {
      ws.onmessage = (ev) => onPusherFrame(typeof ev.data === 'string' ? ev.data : '');
    }
    ws.onerror = () => {
      diag.wsLastErrorAt = Date.now();
    };
    ws.onclose = () => {
      diag.wsState = 'closed';
      // つながらずに切れた → 次はもう一方の方式を試す。つながっていたら同じ方式で(token はもらい直す)
      if (!established) preferPusher = !preferPusher;
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

  // Pusher は 120 秒何も無いと切る。こちらからも1分おきに ping(Centrifugo はサーバーの {} に返すだけでよい)
  pingTimer = setInterval(() => {
    if (established && diag.provider === 'pusher') send({ event: 'pusher:ping', data: {} });
  }, 60_000);

  void connect();
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
      current = { slug, key, stop: startReader(slug, key, { chatroomId: info.chatroomId, channelId: info.channelId, userId: info.userId }) };
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
  // 実測 2026-11-08: 未ログインでは data-testid="login" が2つ(1つは見えない・文字なし)。見えるものだけを印にする
  const btns = [...document.querySelectorAll('button, a')].slice(0, 400);
  return btns.some(
    (b) =>
      (/^(?:log ?in|sign ?in|ログイン)$/i.test(String(b.textContent || '').trim()) || b.getAttribute('data-testid') === 'login') &&
      typeof b.getClientRects === 'function' &&
      b.getClientRects().length > 0,
  );
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
