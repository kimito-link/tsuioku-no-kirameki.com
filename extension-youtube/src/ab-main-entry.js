// ab-main-entry.js — ABEMA のページ自身の世界(MAIN)で動く小さな写し役。
/* global window, location, XMLHttpRequest */
//
// ★コメント用の別ホストへ取りに行かない。ページが自分で受け取った JSON だけを縮めて、
//   隔離された世界(ab-content-entry.js)へ渡す。送ったり、ページの受信を止めたりはしない。
//   認可ヘッダや URL のクエリは渡さない。入口が「hello」と言うまで最大 40 件ためておく。

import {
  isAbCommentUrl,
  isAbBroadcastJsonUrl,
  abCommentWindowFromUrl,
  abChatIdFromUrl,
  abPayloadNotices,
  enqueueAbMainBacklog,
  isAbSlotCommentsUrl,
  abSlotCommentsBackfillUrl,
  abNextBackfillUntilMs,
  shouldStopAbBackfill,
  extractAbAuthHeader,
} from '../../src/lib/abema/abParse.js';
import { runBackfillLoop } from '../../src/lib/platform/historyBackfill.js';

(() => {
  if (window.__nlAbMain) return;
  window.__nlAbMain = true;
  const OUT = 'nl-ab-main';
  const IN = 'nl-ab-iso';
  /** @type {any[]} */
  let backlog = [];
  let ready = false;
  /** @type {Map<string, { baseUrl: string, auth: string }>} */
  const slotRoutes = new Map();
  /** @type {Set<string>} */
  const backfillStarted = new Set();
  const noteSlotRoute = (url, auth) => {
    const info = isAbSlotCommentsUrl(url);
    if (!info) return;
    const key = info.slotId.toLowerCase();
    const prev = slotRoutes.get(key);
    slotRoutes.set(key, { baseUrl: info.baseUrl, auth: auth || prev?.auth || '' });
  };

  /** @param {any} msg */
  const post = (msg) => {
    if (!ready) {
      backlog = enqueueAbMainBacklog(backlog, msg);
      return;
    }
    try {
      window.postMessage({ source: OUT, ...msg }, location.origin);
    } catch {
      /* 送れない形 */
    }
  };

  /**
   * @param {string} url
   * @param {string} text
   * @param {boolean} urlMatched
   */
  const consider = (url, text, urlMatched) => {
    if (typeof text !== 'string' || text.length < 2 || text.length > 500_000) return;
    const head = text.trimStart()[0];
    if (head !== '{' && head !== '[') return;
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return;
    }
    const notice = abPayloadNotices(json);
    if (!notice) return;
    if (urlMatched && notice.batch) {
      const shrunk = notice.batch;
      const chatId = shrunk.chatId || abChatIdFromUrl(url);
      const win = url ? abCommentWindowFromUrl(url) : { sinceMs: null, untilMs: null };
      post({
        t: 'batch',
        sinceMs: win.sinceMs,
        untilMs: win.untilMs,
        body: { ...shrunk, chatId },
      });
    }
    if (notice.meta && (urlMatched || isAbBroadcastJsonUrl(url))) post({ t: 'meta', meta: notice.meta });
  };

  /** @param {unknown} url */
  const matched = (url) => {
    try {
      return isAbCommentUrl(String(url || ''));
    } catch {
      return false;
    }
  };

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = function abFetch(...args) {
      const input = args[0];
      const ret = nativeFetch.apply(this, args);
      let url = '';
      try {
        url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url || '';
      } catch {
        url = '';
      }
      if (!matched(url) && !isAbBroadcastJsonUrl(url)) return ret;
      noteSlotRoute(url, extractAbAuthHeader(input, args[1]));
      ret.then((res) => {
        try {
          if ((res.status === 401 || res.status === 403) && matched(url)) post({ t: 'denied' });
          res.clone().text().then((text) => consider(url, text, matched(url))).catch(() => {});
        } catch {
          /* 写せなくてもページはそのまま */
        }
      }).catch(() => {});
      return ret;
    };
  }

  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  const xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function abOpen(method, url, ...rest) {
    try {
      this.__nlAbUrl = String(url || '');
      this.__nlAbAuth = '';
    } catch {
      this.__nlAbUrl = '';
    }
    return xhrOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.setRequestHeader = function abSetHeader(name, value) {
    try {
      if (String(name || '').toLowerCase() === 'authorization') this.__nlAbAuth = String(value || '');
    } catch {
      /* no-op */
    }
    return xhrSetHeader.call(this, name, value);
  };
  XMLHttpRequest.prototype.send = function abSend(...args) {
    if (matched(this.__nlAbUrl) || isAbBroadcastJsonUrl(this.__nlAbUrl)) {
      noteSlotRoute(this.__nlAbUrl, this.__nlAbAuth);
      this.addEventListener('load', () => {
        try {
          if ((this.status === 401 || this.status === 403) && matched(this.__nlAbUrl)) post({ t: 'denied' });
          let text = '';
          try {
            text = typeof this.responseText === 'string' ? this.responseText : '';
          } catch {
            text = '';
          }
          if (!text && this.response && typeof this.response === 'object') {
            try {
              text = JSON.stringify(this.response);
            } catch {
              text = '';
            }
          }
          consider(this.__nlAbUrl, text, matched(this.__nlAbUrl));
        } catch {
          /* 写せなくてもページはそのまま */
        }
      });
    }
    return xhrSend.apply(this, args);
  };

  const NativeSocket = window.WebSocket;
  if (typeof NativeSocket === 'function') {
    window.WebSocket = new Proxy(NativeSocket, {
      construct(target, args, newTarget) {
        const ws = Reflect.construct(target, args, newTarget);
        try {
          const url = String(args[0] || '');
          const urlOk = matched(url);
          ws.addEventListener('message', (ev) => {
            if (typeof ev.data !== 'string') return;
            if (!urlOk && ev.data.length > 100_000) return;
            consider(url, ev.data, urlOk);
          });
        } catch {
          /* 写せなくてもページはそのまま */
        }
        return ws;
      },
    });
  }

  const runAbBackfill = async ({ slotId, untilMs, startedAtMs }) => {
    const id = String(slotId || '').trim().toLowerCase();
    if (!id || backfillStarted.has(id) || typeof nativeFetch !== 'function') return;
    const route = slotRoutes.get(id);
    if (!route || !route.baseUrl) return;
    const startUntil = Math.floor(Number(untilMs) || 0);
    if (startUntil <= 0) return;
    backfillStarted.add(id);
    const res = await runBackfillLoop({
      initialCursor: startUntil,
      fetchPage: async (cursor) => {
        const url = abSlotCommentsBackfillUrl(route.baseUrl, cursor, 100);
        if (!url) return { ok: false, retryable: false, reason: 'bad-url' };
        try {
          const headers = route.auth ? { Authorization: route.auth } : undefined;
          const r = await nativeFetch.call(window, url, headers ? { headers } : undefined);
          if (r.status === 429 || r.status >= 500) {
            return { ok: false, retryable: true, status: r.status, retryAfter: r.headers?.get?.('Retry-After') };
          }
          if (!r.ok) return { ok: false, retryable: false, status: r.status, reason: `http_${r.status}` };
          const json = await r.json();
          const notice = abPayloadNotices(json);
          const msgs = notice?.batch?.messages || [];
          const nextUntil = abNextBackfillUntilMs(msgs, cursor);
          const stopReason = shouldStopAbBackfill({ count: msgs.length, nextUntilMs: nextUntil, startedAtMs });
          return { ok: true, items: notice?.batch ? [notice.batch] : [], nextCursor: nextUntil || 0, stopReason };
        } catch {
          return { ok: false, retryable: true, reason: 'network' };
        }
      },
      onItems: (batches) => {
        let count = 0;
        for (const batch of batches) {
          count += Array.isArray(batch.messages) ? batch.messages.length : 0;
          post({ t: 'batch', backfill: true, sinceMs: null, untilMs: null, body: { ...batch, chatId: batch.chatId || id } });
        }
        return count;
      },
    });
    post({ t: 'backfillDone', chatId: id, pages: res.pages, items: res.items, fails: res.fails, stopReason: res.stopReason });
  };

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || ev.origin !== location.origin) return;
    const data = ev.data;
    if (!data || data.source !== IN) return;
    if (data.t === 'backfill') {
      void runAbBackfill(data);
      return;
    }
    if (data.t !== 'hello') return;
    ready = true;
    const queued = backlog;
    backlog = [];
    for (const msg of queued) post(msg);
  });
})();
