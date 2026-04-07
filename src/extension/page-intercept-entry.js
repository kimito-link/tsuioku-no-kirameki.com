// @ts-nocheck — MAIN world IIFE; DOM/ページ型が広く any 相当
/**
 * MAIN world エントリ（esbuild で単一 IIFE にバンドルされる）
 */
import {
  createLengthDelimitedStreamAccumulator,
  splitLengthDelimitedMessagesWithTail
} from '../lib/lengthDelimitedStream.js';
import { extractPairsFromBinaryUtf8 } from '../lib/interceptBinaryTextExtract.js';
import { decodeChunkedMessage, decodePackedSegment } from '../lib/ndgrDecode.js';
import { ndgrChatsToMergeRows } from '../lib/ndgrChatRows.js';
import { anonymousNicknameFallback } from '../lib/nicoAnonymousDisplay.js';
import {
  collectInterceptSignalsFromObject,
  extractLearnUsersFromNicoUserIconUrlsInString
} from '../lib/niconicoInterceptLearn.js';
import { recordUnforwardedInterceptJsonForProbe } from '../lib/interceptVisitorProbeDebug.js';

(() => {
  'use strict';
  if (window.__NLS_PAGE_INTERCEPT__) return;
  const href = String(window.location?.href || '');
  const referrer = String(document.referrer || '');
  /** @param {string} raw */
  const parseUrl = (raw) => {
    try {
      return new URL(String(raw || ''));
    } catch {
      return null;
    }
  };
  /** @param {string} h */
  const isNicoHost = (h) =>
    String(h || '').endsWith('.nicovideo.jp') || String(h || '') === 'nicovideo.jp';
  /** @param {string} h */
  const isLocalHost = (h) =>
    String(h || '') === '127.0.0.1:3456' || String(h || '') === 'localhost:3456';
  /** @param {string} p */
  const isWatchLikePath = (p) =>
    String(p || '').startsWith('/watch/') || String(p || '').startsWith('/embed/');
  const here = parseUrl(href);
  const ref = parseUrl(referrer);
  const host = String(here?.host || window.location?.host || '');
  const path = String(here?.pathname || window.location?.pathname || '');
  const isAboutLikeFrame = /^(about:blank|about:srcdoc|blob:|data:)/i.test(href);
  const isRefWatchPage = Boolean(
    ref &&
      (isNicoHost(ref.host) || isLocalHost(ref.host)) &&
      isWatchLikePath(ref.pathname)
  );
  const isWatchPage =
    (isNicoHost(host) && isWatchLikePath(path)) ||
    (isAboutLikeFrame && isRefWatchPage);
  const isLocalDev =
    isLocalHost(host) || (isAboutLikeFrame && Boolean(ref && isLocalHost(ref.host)));
  if (!isWatchPage && !isLocalDev) return;
  window.__NLS_PAGE_INTERCEPT__ = true;

  const MSG_TYPE = 'NLS_INTERCEPT_USERID';
  const MSG_STATISTICS = 'NLS_INTERCEPT_STATISTICS';
  const MSG_SCHEDULE = 'NLS_INTERCEPT_SCHEDULE';
  const MSG_CHAT_ROWS = 'NLS_INTERCEPT_CHAT_ROWS';
  const MSG_GIFT_USERS = 'NLS_INTERCEPT_GIFT_USERS';

  /** @type {{ commentNo: string, text: string, userId: string, nickname?: string }[]} */
  let ndgrChatRowsBatch = [];
  /** @type {ReturnType<typeof setTimeout>|null} */
  let ndgrChatRowsTimer = null;
  const NDGR_CHAT_ROWS_BATCH_MS = 120;
  /** 1 メッセージが巨大になりすぎないよう分割（高流量・structured clone 負荷対策） */
  const NDGR_CHAT_ROWS_POST_CHUNK = 220;

  function postNdgrChatRowsChunks(all) {
    if (!all.length) return;
    const w = typeof window !== 'undefined' ? window : null;
    const schedule =
      w && typeof w.queueMicrotask === 'function'
        ? (fn) => w.queueMicrotask(fn)
        : (fn) => setTimeout(fn, 0);
    let i = 0;
    const pump = () => {
      if (i >= all.length) return;
      const payload = all.slice(i, i + NDGR_CHAT_ROWS_POST_CHUNK);
      i += payload.length;
      window.postMessage({ type: MSG_CHAT_ROWS, rows: payload }, '*');
      if (i < all.length) schedule(pump);
    };
    pump();
  }

  function scheduleNdgrChatRowsPost(rows) {
    if (!rows?.length) return;
    ndgrChatRowsBatch.push(...rows);
    if (ndgrChatRowsTimer != null) return;
    ndgrChatRowsTimer = setTimeout(() => {
      ndgrChatRowsTimer = null;
      const payload = ndgrChatRowsBatch;
      ndgrChatRowsBatch = [];
      if (payload.length) postNdgrChatRowsChunks(payload);
    }, NDGR_CHAT_ROWS_BATCH_MS);
  }

  /** @type {Map<string, { uid?: string, name?: string, av?: string }>} */
  const batch = new Map();
  /** @type {Map<string, { name?: string, av?: string }>} */
  const dirtyUsers = new Map();
  /** @type {number|null} */
  let timer = null;
  const diag = {
    enqueued: 0,
    posted: 0,
    wsMessages: 0,
    fetchHits: 0,
    xhrHits: 0
  };

  function publishDiag() {
    const root = document.documentElement;
    if (!root) return;
    root.setAttribute('data-nls-page-intercept', '1');
    root.setAttribute('data-nls-page-intercept-enqueued', String(diag.enqueued));
    root.setAttribute('data-nls-page-intercept-posted', String(diag.posted));
    root.setAttribute('data-nls-page-intercept-ws', String(diag.wsMessages));
    root.setAttribute('data-nls-page-intercept-fetch', String(diag.fetchHits));
    root.setAttribute('data-nls-page-intercept-xhr', String(diag.xhrHits));
    if (href) root.setAttribute('data-nls-page-intercept-href', href.slice(0, 240));
    if (referrer) {
      root.setAttribute('data-nls-page-intercept-referrer', referrer.slice(0, 240));
    }
  }

  publishDiag();

  /** userId→nickname の補助マップ（ユーザー情報メッセージ用） */
  /** @type {Map<string, string>} */
  const knownNames = new Map();
  /** @type {Map<string, string>} */
  const knownAvatars = new Map();

  function flush() {
    const entries = [];
    for (const [no, v] of batch) {
      const uid = String(v?.uid || '').trim();
      const name =
        String(v?.name || '').trim() ||
        (uid ? String(knownNames.get(uid) || '').trim() : '');
      const av =
        String(v?.av || '').trim() ||
        (uid ? String(knownAvatars.get(uid) || '').trim() : '');
      if (!uid && !name && !av) continue;
      entries.push({
        no,
        ...(uid ? { uid } : {}),
        ...(name ? { name } : {}),
        ...(av ? { av } : {})
      });
    }
    batch.clear();
    const users = [];
    for (const [uid, meta] of dirtyUsers) {
      const name = String(meta?.name || '').trim();
      const av = String(meta?.av || '').trim();
      if (!uid || (!name && !av)) continue;
      users.push({
        uid,
        ...(name ? { name } : {}),
        ...(av ? { av } : {})
      });
    }
    dirtyUsers.clear();
    if (!entries.length && !users.length) return;
    diag.posted += entries.length;
    publishDiag();
    window.postMessage({ type: MSG_TYPE, entries, users }, '*');
  }

  function normalizeAvatarUrl(url) {
    const s = String(url ?? '').trim();
    if (!/^https?:\/\//i.test(s)) return '';
    return s;
  }

  function enqueue(commentNo, userId, nickname, avatarUrl = '') {
    const no = String(commentNo ?? '').trim();
    const uid = String(userId ?? '').trim();
    if (!no) return;
    const name = String(nickname ?? '').trim();
    const av = normalizeAvatarUrl(avatarUrl);
    if (!uid && !name && !av) return;
    diag.enqueued += 1;
    publishDiag();
    if (uid && (name || av)) {
      if (name) knownNames.set(uid, name);
      if (av) knownAvatars.set(uid, av);
      const prevMeta = dirtyUsers.get(uid);
      dirtyUsers.set(uid, {
        ...(String(prevMeta?.name || '').trim() || name
          ? { name: String(prevMeta?.name || '').trim() || name }
          : {}),
        ...(String(prevMeta?.av || '').trim() || av
          ? { av: String(prevMeta?.av || '').trim() || av }
          : {})
      });
    }
    const prev = batch.get(no);
    const prevUid = String(prev?.uid || '').trim();
    const prevName = String(prev?.name || '').trim();
    const prevAv = String(prev?.av || '').trim();
    const nextUid = uid || prevUid;
    const nextName = name || prevName;
    const nextAv = av || prevAv;
    batch.set(no, {
      ...(nextUid ? { uid: nextUid } : {}),
      ...(nextName ? { name: nextName } : {}),
      ...(nextAv ? { av: nextAv } : {})
    });
    if (!timer) timer = setTimeout(() => { timer = null; flush(); }, 150);
  }

  /** ユーザー情報だけのメッセージ（コメント番号なし）を蓄積 */
  function learnUser(userId, nickname, avatarUrl = '') {
    const uid = String(userId ?? '').trim();
    const name = String(nickname ?? '').trim();
    const av = normalizeAvatarUrl(avatarUrl);
    if (!uid || (!name && !av)) return;
    if (name) knownNames.set(uid, name);
    if (av) knownAvatars.set(uid, av);
    const prevMeta = dirtyUsers.get(uid);
    dirtyUsers.set(uid, {
      ...(String(prevMeta?.name || '').trim() || name
        ? { name: String(prevMeta?.name || '').trim() || name }
        : {}),
      ...(String(prevMeta?.av || '').trim() || av
        ? { av: String(prevMeta?.av || '').trim() || av }
        : {})
    });
    if (!timer) timer = setTimeout(() => { timer = null; flush(); }, 150);
  }

  /** @param {unknown} obj */
  function dig(obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > 5) return;
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length && i < 500; i++) dig(obj[i], depth + 1);
      return;
    }
    const { enqueues, learnUsers } = collectInterceptSignalsFromObject(obj);
    for (const e of enqueues) {
      enqueue(e.no, e.uid, e.name, e.av);
    }
    for (const u of learnUsers) {
      learnUser(u.uid, u.name, u.av);
    }

    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length && i < 30; i++) {
      const v = obj[keys[i]];
      if (typeof v === 'string') {
        for (const u of extractLearnUsersFromNicoUserIconUrlsInString(v)) {
          learnUser(u.uid, u.name, u.av);
        }
      } else if (v && typeof v === 'object') dig(v, depth + 1);
    }
  }

  /** @param {string} text */
  function extractFromBinaryText(text) {
    for (const p of extractPairsFromBinaryUtf8(text)) {
      enqueue(p.no, p.uid, anonymousNicknameFallback(String(p.uid), ''), '');
    }
  }

  const _ndgr = { stats: 0, chats: 0, gifts: 0, decoded: 0 };
  /** @type {{ pendingBytes: number, droppedBytes: number, totalFrames: number }|null} */
  let _ldStreamStats = null;

  function publishLdStreamDiag() {
    const root = document.documentElement;
    if (!root || !_ldStreamStats) return;
    root.setAttribute(
      'data-nls-ld-stream',
      `p=${_ldStreamStats.pendingBytes} d=${_ldStreamStats.droppedBytes} f=${_ldStreamStats.totalFrames}`
    );
  }

  function handleNdgrResult(result) {
    if (!result) return;
    if (result.stats && result.stats.viewers != null) {
      _ndgr.stats++;
      window.postMessage({ type: MSG_STATISTICS, viewers: result.stats.viewers, comments: result.stats.comments }, '*');
    }
    for (const chat of result.chats) {
      const uid = chat.rawUserId ? String(chat.rawUserId) : chat.hashedUserId;
      if (chat.no != null && uid) {
        _ndgr.chats++;
        enqueue(
          String(chat.no),
          uid,
          anonymousNicknameFallback(String(uid), chat.name),
          ''
        );
      }
    }
    const giftList = result.gifts || [];
    /** @type {{ userId: string, nickname: string }[]} */
    const giftUsers = [];
    for (const g of giftList) {
      const uid = String(g.advertiserUserId || '').trim();
      const name = String(g.advertiserName || '').trim();
      if (uid) {
        _ndgr.gifts++;
        learnUser(uid, name, '');
        giftUsers.push({ userId: uid, nickname: name });
      }
    }
    if (giftUsers.length) {
      window.postMessage({ type: MSG_GIFT_USERS, users: giftUsers }, '*');
    }
    scheduleNdgrChatRowsPost(ndgrChatsToMergeRows(result.chats));
  }

  /** @param {Uint8Array} frame */
  function processLengthDelimitedNdgrFrame(frame) {
    const dec = new TextDecoder('utf-8', { fatal: false });
    extractFromBinaryText(dec.decode(frame));
    let handled = false;
    try {
      const r = decodeChunkedMessage(frame);
      if (r.stats || r.chats.length || (r.gifts && r.gifts.length)) {
        handleNdgrResult(r);
        handled = true;
      }
    } catch { /* no-op */ }
    if (!handled) {
      try {
        for (const r of decodePackedSegment(frame)) handleNdgrResult(r);
      } catch { /* no-op */ }
    }
  }

  /**
   * @param {Uint8Array} u8
   * @param {ReturnType<typeof createLengthDelimitedStreamAccumulator>|null} [streamAcc]
   */
  function tryProcessBinaryBuffer(u8, streamAcc) {
    if (u8.byteLength < 4 || u8.byteLength > 2_000_000) return;
    const dec = new TextDecoder('utf-8', { fatal: false });

    if (streamAcc) {
      streamAcc.push(u8, processLengthDelimitedNdgrFrame);
      _ldStreamStats = streamAcc.getStats();
      publishLdStreamDiag();
      _ndgr.decoded++;
    } else {
      const { frames, tail } = splitLengthDelimitedMessagesWithTail(u8);
      if (frames.length > 0) {
        for (const ch of frames) processLengthDelimitedNdgrFrame(ch);
        _ndgr.decoded++;
      } else {
        processLengthDelimitedNdgrFrame(u8);
        _ndgr.decoded++;
      }
      extractFromBinaryText(dec.decode(u8));
      if (tail.length) {
        try {
          extractFromBinaryText(dec.decode(tail));
        } catch { /* no-op */ }
      }
    }

    const root = document.documentElement;
    if (root && (_ndgr.stats > 0 || _ndgr.chats > 0 || _ndgr.gifts > 0)) {
      root.setAttribute(
        'data-nls-ndgr',
        `s=${_ndgr.stats} c=${_ndgr.chats} g=${_ndgr.gifts} d=${_ndgr.decoded}`
      );
    }
  }

  const VIEWER_KEYS = ['viewers', 'watchCount', 'watching', 'watchingCount', 'viewerCount', 'viewCount'];
  const COMMENT_KEYS = ['comments', 'commentCount'];
  function pickNum(obj, keys, max) {
    for (const k of keys) {
      const r = obj[k];
      if (r == null) continue;
      const n = typeof r === 'number' ? r : parseInt(String(r), 10);
      if (Number.isFinite(n) && n >= 0 && (!max || n <= max)) return n;
    }
    return null;
  }

  /**
   * パース済み JSON からビューア数・コメント数を検出して転送。
   * type:"statistics" だけでなく、既知キーがあれば広く拾う。
   * @param {unknown} obj
   */
  /** @returns {boolean} viewers を拾って転送したら true */
  function tryForwardStatistics(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    const o = /** @type {Record<string, unknown>} */ (obj);
    const d = o.data;
    const target =
      d && typeof d === 'object' && !Array.isArray(d)
        ? /** @type {Record<string, unknown>} */ (d)
        : o;
    let viewers = pickNum(target, VIEWER_KEYS, 50_000_000);
    let comments = pickNum(target, COMMENT_KEYS);
    if (viewers == null && target !== o) {
      viewers = pickNum(o, VIEWER_KEYS, 50_000_000);
      comments = comments ?? pickNum(o, COMMENT_KEYS);
    }
    if (viewers == null) return false;
    window.postMessage(
      { type: MSG_STATISTICS, viewers, comments },
      '*'
    );
    return true;
  }

  /** statistics 未転送 JSON の観測（sessionStorage フラグ ON のときのみ） */
  function maybeRecordInterceptVisitorProbe(parsed) {
    const snippet = recordUnforwardedInterceptJsonForProbe(parsed);
    if (!snippet) return;
    const root = document.documentElement;
    if (root) root.setAttribute('data-nls-intercept-visitor-probe', snippet);
  }

  let _scheduleSent = false;
  /** @param {unknown} obj */
  function tryForwardSchedule(obj) {
    if (_scheduleSent) return;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    const o = /** @type {Record<string, unknown>} */ (obj);
    if (o.type !== 'schedule') return;
    const d = o.data;
    if (!d || typeof d !== 'object') return;
    const dd = /** @type {Record<string, unknown>} */ (d);
    const begin = dd.begin || dd.beginAt || dd.openTime;
    if (typeof begin === 'string' && begin.length >= 10) {
      _scheduleSent = true;
      window.postMessage({ type: MSG_SCHEDULE, begin }, '*');
    }
  }

  /** @param {unknown} raw */
  function tryProcess(raw) {
    if (typeof raw === 'string') {
      if (raw.length < 4 || raw.length > 1_000_000) return;
      try {
        const parsed = JSON.parse(raw);
        if (!tryForwardStatistics(parsed)) maybeRecordInterceptVisitorProbe(parsed);
        tryForwardSchedule(parsed);
        dig(parsed, 0);
      } catch {
        /* not JSON */
      }
      return;
    }
    if (raw instanceof ArrayBuffer || raw instanceof Uint8Array) {
      const buf = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
      tryProcessBinaryBuffer(buf);
      return;
    }
    if (typeof Blob !== 'undefined' && raw instanceof Blob) {
      if (raw.size > 2_000_000) return;
      raw.arrayBuffer().then((ab) => tryProcess(ab)).catch(() => {});
    }
  }

  const OrigWS = window.WebSocket;
  try {
    window.WebSocket = new Proxy(OrigWS, {
      construct(target, args) {
        const ws = new target(...args);
        ws.addEventListener('message', (/** @type {MessageEvent} */ e) => {
          try {
            diag.wsMessages += 1;
            publishDiag();
            tryProcess(e.data);
          } catch {
            /* never break the page */
          }
        });
        return ws;
      }
    });
    Object.defineProperty(window.WebSocket, 'prototype', {
      value: OrigWS.prototype,
      writable: false,
      configurable: false
    });
  } catch {
    /* Proxy 失敗は無視 */
  }

  /** @type {string[]} */
  const _fetchLog = [];
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (...args) {
      let p;
      try {
        p = origFetch.apply(this, args);
      } catch (e) {
        return Promise.reject(e);
      }
      /* 同一 Promise に同期的に拒否ハンドラを付け、ページ側が catch しない失敗で
       * 「Uncaught (in promise) TypeError: Failed to fetch」が拡張エラーに出るのを防ぐ */
      if (p != null && typeof p.then === 'function') {
        p.catch(() => {
          /* ネットワーク失敗・CORS 等はページ本来の挙動。インターセプト側では無視 */
        });
      }
      void (async () => {
        try {
          const res = await p;
          const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
          const isNico =
            url.includes('nicovideo.jp') ||
            url.includes('nimg.jp') ||
            url.includes('dmc.nico') ||
            url.includes('nicolive') ||
            url.includes('ndgr') ||
            url.includes('127.0.0.1:3456') ||
            url.includes('localhost:3456');
          if (!isNico) return;
          diag.fetchHits += 1;
          try { if (typeof maybeScanFromFetch === 'function') maybeScanFromFetch(); } catch { /* no-op */ }
          const ct = res.headers?.get('content-type') || '';
          if (_fetchLog.length < 20) {
            const u = url.replace(/https?:\/\/[^/]+/, '').substring(0, 60);
            _fetchLog.push(`${u} [${ct.substring(0, 25)}]`);
            const root = document.documentElement;
            if (root) root.setAttribute('data-nls-fetch-log', _fetchLog.join(' | '));
          }
          publishDiag();
          const isBinary = ct.includes('protobuf') || ct.includes('octet') || ct.includes('grpc');
          const isJson = ct.includes('json');
          const isStream = ct.includes('event-stream') || ct.includes('ndjson');
          const isNdgr = /\/(view|segment|backward|snapshot)\/v\d\//.test(url) || url.includes('ndgr');
          if (!isBinary && !isJson && !isStream && !isNdgr) return;
          const clone = res.clone();
          if ((isBinary || isStream || isNdgr) && clone.body) {
            const reader = clone.body.getReader();
            void (async () => {
              try {
                const dec = new TextDecoder('utf-8', { fatal: false });
                const ldAcc = createLengthDelimitedStreamAccumulator({
                  maxPendingBytes: 2_000_000
                });
                for (;;) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  if (value) {
                    tryProcessBinaryBuffer(value, ldAcc);
                    extractFromBinaryText(dec.decode(value));
                    const text = dec.decode(value, { stream: true });
                    if (text.length > 3 && text.length < 500000) {
                      try {
                        const j = JSON.parse(text);
                        if (!tryForwardStatistics(j)) maybeRecordInterceptVisitorProbe(j);
                        dig(j, 0);
                      } catch { /* not JSON */ }
                    }
                  }
                }
                _ldStreamStats = ldAcc.getStats();
                publishLdStreamDiag();
              } catch { /* stream end */ }
            })();
          } else {
            try { tryProcess(await clone.arrayBuffer()); } catch { /* no-op */ }
          }
        } catch {
          /* fetch rejection — ignore */
        }
      })();
      return p;
    };
  }

  const OrigXHR = window.XMLHttpRequest;
  if (typeof OrigXHR === 'function') {
    try {
      const origOpen = OrigXHR.prototype.open;
      const origSend = OrigXHR.prototype.send;
      OrigXHR.prototype.open = function (method, url, ...rest) {
        try {
          this.__nlsUrl = typeof url === 'string' ? url : String(url || '');
        } catch { /* no-op */ }
        return origOpen.call(this, method, url, ...rest);
      };
      OrigXHR.prototype.send = function (...args) {
        try {
          this.addEventListener(
            'loadend',
            () => {
              try {
                const url = String(this.__nlsUrl || this.responseURL || '');
                const isNico =
                  url.includes('nicovideo.jp') ||
                  url.includes('nimg.jp') ||
                  url.includes('dmc.nico') ||
                  url.includes('nicolive') ||
                  url.includes('ndgr') ||
                  url.includes('127.0.0.1:3456') ||
                  url.includes('localhost:3456');
                if (!isNico) return;
                diag.xhrHits += 1;
                try { if (typeof maybeScanFromFetch === 'function') maybeScanFromFetch(); } catch { /* no-op */ }
                publishDiag();
                const rt = String(this.responseType || '');
                if (!rt || rt === 'text') {
                  tryProcess(String(this.responseText || ''));
                  return;
                }
                if (rt === 'json') {
                  const res = this.response;
                  if (!tryForwardStatistics(res)) maybeRecordInterceptVisitorProbe(res);
                  dig(res, 0);
                  return;
                }
                if (rt === 'arraybuffer' && this.response) {
                  tryProcess(this.response);
                  return;
                }
                if (rt === 'blob' && this.response) {
                  tryProcess(this.response);
                }
              } catch { /* no-op */ }
            },
            { once: true }
          );
        } catch { /* no-op */ }
        return origSend.apply(this, args);
      };
    } catch { /* no-op */ }
  }

  // --- React Fiber scanning for userId extraction from data-grid ---
  try {
    const _r = document.documentElement;
    if (_r) _r.setAttribute('data-nls-pi-phase', 'fiber-init');
  } catch { /* no-op */ }
  const FIBER_SCAN_MS = 3000;
  const FB_NO = ['no', 'commentNo', 'comment_no', 'number', 'vposNo'];
  const FB_UID = [
    'userId',
    'user_id',
    'uid',
    'hashedUserId',
    'hashed_user_id',
    'senderUserId',
    'rawUserId',
    'raw_user_id',
    'advertiserUserId',
    'advertiser_user_id'
  ];
  const FB_NAME = [
    'name',
    'nickname',
    'userName',
    'user_name',
    'displayName',
    'display_name',
    'advertiserName',
    'advertiser_name'
  ];
  const FB_AV = [
    'iconUrl',
    'icon_url',
    'avatarUrl',
    'avatar_url',
    'userIconUrl',
    'thumbnailUrl',
    'thumbnail_url'
  ];

  function getReactCandidates(el) {
    /** @type {unknown[]} */
    const out = [];
    if (!el) return out;
    try {
      for (const k of Object.getOwnPropertyNames(el)) {
        if (
          k.startsWith('__reactFiber$') ||
          k.startsWith('__reactInternalInstance$') ||
          k.startsWith('__reactProps$') ||
          k.startsWith('__reactEventHandlers$')
        ) {
          out.push(el[k]);
        }
      }
    } catch { /* no-op */ }
    try {
      for (const s of Object.getOwnPropertySymbols(el)) {
        const d = String(s?.description || s?.toString?.() || '');
        if (/react/i.test(d)) out.push(el[s]);
      }
    } catch { /* no-op */ }
    return out;
  }

  function pickStr(obj, keys) {
    if (!obj || typeof obj !== 'object') return '';
    for (const k of keys) { const v = obj[k]; if (v != null && v !== '') return String(v); }
    return '';
  }

  function extractFromProps(props) {
    if (!props || typeof props !== 'object' || Array.isArray(props)) return null;
    let no = pickStr(props, FB_NO);
    let uid = pickStr(props, FB_UID);
    let nm = pickStr(props, FB_NAME);
    let av = normalizeAvatarUrl(pickStr(props, FB_AV));
    const SUBS = ['data', 'chat', 'comment', 'item', 'message', 'props', 'value', 'row', 'rowData', 'original'];
    for (const s of SUBS) {
      const c = props[s];
      if (!c || typeof c !== 'object' || Array.isArray(c)) continue;
      if (!no) no = pickStr(c, FB_NO);
      if (!uid) uid = pickStr(c, FB_UID);
      if (!nm) nm = pickStr(c, FB_NAME);
      if (!av) av = normalizeAvatarUrl(pickStr(c, FB_AV));
    }
    if (no && (uid || nm || av)) return { no, uid, nm, av };
    return null;
  }

  function digFiberDown(fiber, depth) {
    if (!fiber || depth > 6) return null;
    const props = fiber.memoizedProps || fiber.pendingProps;
    const r = extractFromProps(props);
    if (r) return r;
    let child = fiber.child;
    while (child) {
      const cr = digFiberDown(child, depth + 1);
      if (cr) return cr;
      child = child.sibling;
    }
    return null;
  }

  function digFiberUp(fiber, maxUp) {
    let cur = fiber;
    for (let i = 0; i < maxUp && cur; i++) {
      const props = cur.memoizedProps || cur.pendingProps;
      const r = extractFromProps(props);
      if (r) return r;
      cur = cur.return;
    }
    return null;
  }

  function digFiber(fiber, _depth) {
    const down = digFiberDown(fiber, 0);
    if (down) return down;
    return digFiberUp(fiber, 8);
  }

  const _fb = { scans: 0, found: 0, rows: 0, probe: '', step: '', attempts: 0, err: '' };

  function publishFiberDiag() {
    const root = document.documentElement;
    if (!root) return;
    root.setAttribute('data-nls-fiber-scans', String(_fb.scans));
    root.setAttribute('data-nls-fiber-found', String(_fb.found));
    root.setAttribute('data-nls-fiber-rows', String(_fb.rows));
    root.setAttribute('data-nls-fiber-probe', _fb.probe.substring(0, 300));
    root.setAttribute('data-nls-fiber-step', _fb.step);
    root.setAttribute('data-nls-fiber-attempts', String(_fb.attempts));
    if (_fb.err) root.setAttribute('data-nls-fiber-err', _fb.err.substring(0, 120));
  }

  function scanCommentFibers() {
    try {
      const panel = document.querySelector('.ga-ns-comment-panel') ||
                    document.querySelector('[class*="comment-panel" i]');
      const grid = document.querySelector('[class*="comment-data-grid"], [class*="data-grid"]');
      const root = panel || grid;
      if (!root) { _fb.step = 'no-root'; publishFiberDiag(); return; }

      const allEls = root.querySelectorAll('*');
      _fb.scans++;
      _fb.rows = allEls.length;
      let found = 0;
      let hasFiber = 0;
      let firstHitProbe = '';
      for (let i = 0; i < allEls.length && i < 1200; i++) {
        const el = allEls[i];
        const candidates = getReactCandidates(el);
        if (!candidates.length) continue;
        hasFiber += candidates.length;
        for (const candidate of candidates) {
          if (_fb.probe === '') {
            try {
              const p =
                candidate?.memoizedProps ||
                candidate?.pendingProps ||
                (candidate && typeof candidate === 'object' ? candidate : {}) ||
                {};
              const keys = Object.keys(p).slice(0, 20);
              _fb.probe = keys.join(',');
              for (const key of keys) {
                const v = p[key];
                if (v && typeof v === 'object' && !Array.isArray(v)) {
                  _fb.probe += ' | ' + key + ':{' + Object.keys(v).slice(0, 15).join(',') + '}';
                  break;
                }
              }
            } catch { /* no-op */ }
          }
          const data =
            extractFromProps(candidate) ||
            (candidate && typeof candidate === 'object' ? digFiber(candidate, 0) : null);
          if (!data) continue;
          enqueue(data.no, data.uid, data.nm, data.av);
          found++;
          if (!firstHitProbe) {
            try {
              const p =
                candidate?.memoizedProps ||
                candidate?.pendingProps ||
                (candidate && typeof candidate === 'object' ? candidate : {}) ||
                {};
              firstHitProbe = Object.keys(p).slice(0, 10).join(',');
            } catch { /* no-op */ }
          }
          break;
        }
      }
      _fb.found += found;
      _fb.step = (panel ? 'panel' : 'grid') + ':' + allEls.length + ' fb=' + hasFiber + ' hit=' + found;
      if (firstHitProbe) _fb.step += ' hp=' + firstHitProbe.substring(0, 60);
      publishFiberDiag();
    } catch (e) {
      _fb.err = String(e?.message || e || '?').substring(0, 120);
      publishFiberDiag();
    }
  }

  // Fiber scan: use bound setTimeout chain (setInterval callback was not firing)
  try {
    const _r2 = document.documentElement;
    if (_r2) _r2.setAttribute('data-nls-pi-phase', 'pre-fiber-start');
  } catch { /* no-op */ }
  let _fiberRunning = false;
  const _bST = window.setTimeout.bind(window);
  const _bSI = window.setInterval.bind(window);
  function fiberTick() {
    try {
      _fb.attempts++;
      _fb.step = 'tick-' + _fb.attempts;
      publishFiberDiag();
      const rootEl = document.querySelector('.ga-ns-comment-panel') ||
                     document.querySelector('[class*="comment-panel" i]') ||
                     document.querySelector('[class*="comment-data-grid"], [class*="data-grid"]');
      if (rootEl) {
        _fb.step = 'found-root';
        publishFiberDiag();
        _fiberRunning = true;
        scanCommentFibers();
        _bSI(scanCommentFibers, FIBER_SCAN_MS);
        return;
      }
    } catch (e) {
      _fb.err = String(e?.message || e || '?').substring(0, 80);
      publishFiberDiag();
    }
    if (_fb.attempts < 200) _bST(fiberTick, 1500);
  }
  _bST(fiberTick, 2000);
  let _lastFetchFiber = 0;
  function maybeScanFromFetch() {
    if (_fiberRunning) return;
    const now = Date.now();
    if (now - _lastFetchFiber < 3000) return;
    _lastFetchFiber = now;
    fiberTick();
  }

  // --- EventSource proxy for NDGR SSE streams ---
  const OrigES = window.EventSource;
  if (typeof OrigES === 'function') {
    try {
      window.EventSource = function (url, opts) {
        const es = new OrigES(url, opts);
        diag.fetchHits += 1;
        if (_fetchLog.length < 12) {
          _fetchLog.push('ES:' + String(url).replace(/https?:\/\/[^/]+/, '').substring(0, 60));
          const root = document.documentElement;
          if (root) root.setAttribute('data-nls-fetch-log', _fetchLog.join(' | '));
        }
        publishDiag();
        es.addEventListener('message', (e) => {
          try {
            diag.wsMessages += 1;
            publishDiag();
            tryProcess(e.data);
          } catch { /* no-op */ }
        });
        return es;
      };
      Object.defineProperty(window.EventSource, 'prototype', {
        value: OrigES.prototype, writable: false, configurable: false
      });
      window.EventSource.CONNECTING = OrigES.CONNECTING;
      window.EventSource.OPEN = OrigES.OPEN;
      window.EventSource.CLOSED = OrigES.CLOSED;
    } catch { /* no-op */ }
  }

  // --- MAIN world statistics polling (ISOLATED world fetch hangs) ---
  const MSG_EMBEDDED_DATA = 'NLS_INTERCEPT_EMBEDDED_DATA';
  const MAIN_POLL_MS = 30000;

  function tryReadEmbeddedData() {
    try {
      const el = document.getElementById('embedded-data');
      if (!el) return;
      let raw = el.getAttribute('data-props') || '';
      if (!raw) return;
      if (raw.includes('&quot;')) raw = raw.replace(/&quot;/g, '"');
      if (raw.includes('&amp;')) raw = raw.replace(/&amp;/g, '&');
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return;
      const wc = obj?.program?.statistics?.watchCount;
      const viewers =
        wc != null && Number.isFinite(Number(wc)) && Number(wc) >= 0
          ? Number(wc)
          : null;
      window.postMessage({ type: MSG_EMBEDDED_DATA, viewers }, '*');
    } catch { /* no-op */ }
  }

  function mainWorldPollStats() {
    try {
      const pageUrl = window.location.href;
      if (!pageUrl || !pageUrl.startsWith('http')) return;
      origFetch(pageUrl, { credentials: 'same-origin' })
        .then((res) => {
          if (!res.ok) return;
          return res.text();
        })
        .then((html) => {
          if (!html) return;
          if (html.includes('&quot;')) html = html.replace(/&quot;/g, '"');
          if (html.includes('&amp;')) html = html.replace(/&amp;/g, '&');
          const wc =
            html.match(/"watchCount"\s*:\s*(\d+)/) ||
            html.match(/"watching(?:Count)?"\s*:\s*(\d+)/i);
          if (wc?.[1]) {
            const n = parseInt(wc[1], 10);
            if (Number.isFinite(n) && n >= 0) {
              window.postMessage({ type: MSG_STATISTICS, viewers: n }, '*');
            }
          }
          const cc =
            html.match(/"commentCount"\s*:\s*(\d+)/) ||
            html.match(/"comments"\s*:\s*(\d+)/);
          if (cc?.[1]) {
            const cn = parseInt(cc[1], 10);
            if (Number.isFinite(cn) && cn >= 0) {
              window.postMessage({ type: MSG_STATISTICS, viewers: null, comments: cn }, '*');
            }
          }
        })
        .catch(() => { /* no-op */ });
    } catch { /* no-op */ }
  }

  function initEmbeddedAndPoll() {
    tryReadEmbeddedData();
    setTimeout(mainWorldPollStats, 8000);
    setInterval(mainWorldPollStats, MAIN_POLL_MS);
  }

  // Don't rely on DOMContentLoaded — use setTimeout polling
  let _embeddedPollStarted = false;
  const _embPollId = setInterval(() => {
    if (_embeddedPollStarted) return;
    if (document.getElementById('embedded-data') || document.readyState !== 'loading') {
      _embeddedPollStarted = true;
      clearInterval(_embPollId);
      initEmbeddedAndPoll();
    }
  }, 500);

  // Also log ALL fetch domains (not just nico) for the first few
  const _allFetchLog = [];
  try {
    const prevFetch = window.fetch;
    window.fetch = function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (_allFetchLog.length < 5 && !url.includes('nicovideo.jp') && !url.includes('nimg.jp')) {
        const u = url.substring(0, 80);
        _allFetchLog.push(u);
        const root = document.documentElement;
        if (root) root.setAttribute('data-nls-fetch-other', _allFetchLog.join(' | '));
      }
      return prevFetch.apply(this, args);
    };
  } catch { /* no-op */ }
})();
