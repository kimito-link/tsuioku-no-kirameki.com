// ab-main-entry.js — ABEMA のページ自身の世界(MAIN)で動く小さな写し役。
/* global window, location, WebSocket, XMLHttpRequest */
//
// ★コメント用の別ホストへ取りに行かない。ページが自分で受け取った JSON だけを縮めて、
//   隔離された世界(ab-content-entry.js)へ渡す。送ったり、ページの受信を止めたりはしない。
//   認可ヘッダや URL のクエリは渡さない。入口が「hello」と言うまで最大 40 件ためておく。

import { isAbCommentUrl, abCommentWindowFromUrl, abChatIdFromUrl, shrinkAbPayload } from '../../src/lib/abema/abParse.js';

(() => {
  if (window.__nlAbMain) return;
  window.__nlAbMain = true;
  const OUT = 'nl-ab-main';
  const IN = 'nl-ab-iso';
  /** @type {any[]} */
  let backlog = [];
  let ready = false;

  /** @param {any} msg */
  const post = (msg) => {
    if (!ready) {
      backlog.push(msg);
      if (backlog.length > 40) backlog.shift();
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
    const shrunk = shrinkAbPayload(json);
    if (!shrunk) return;
    if (shrunk.messages) {
      const chatId = shrunk.chatId || abChatIdFromUrl(url);
      const win = url ? abCommentWindowFromUrl(url) : { sinceMs: null, untilMs: null };
      post({
        t: 'batch',
        sinceMs: win.sinceMs,
        untilMs: win.untilMs,
        body: { ...shrunk, chatId },
      });
      return;
    }
    if (urlMatched && shrunk.meta) post({ t: 'meta', meta: shrunk.meta });
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
      if (!matched(url)) return ret;
      ret.then((res) => {
        try {
          if (res.status === 401 || res.status === 403) post({ t: 'denied' });
          res.clone().text().then((text) => consider(url, text, true)).catch(() => {});
        } catch {
          /* 写せなくてもページはそのまま */
        }
      }).catch(() => {});
      return ret;
    };
  }

  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function abOpen(method, url, ...rest) {
    try {
      this.__nlAbUrl = String(url || '');
    } catch {
      this.__nlAbUrl = '';
    }
    return xhrOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function abSend(...args) {
    if (matched(this.__nlAbUrl)) {
      this.addEventListener('load', () => {
        try {
          if (this.status === 401 || this.status === 403) post({ t: 'denied' });
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
          consider(this.__nlAbUrl, text, true);
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

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || ev.origin !== location.origin) return;
    const data = ev.data;
    if (!data || data.source !== IN || data.t !== 'hello') return;
    ready = true;
    const queued = backlog;
    backlog = [];
    for (const msg of queued) post(msg);
  });
})();
