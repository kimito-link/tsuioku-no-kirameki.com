// tt-main-entry.js — TikTok のページ自身の世界(MAIN)で動く小さな写し役(council/tiktok-support-PLAN.md)。
/* global window, location, Blob, XMLHttpRequest */
//
// ★TikTok のコメントのソケット(webcast-ws.tiktok.com)は X-Bogus の署名つきで、拡張から同じものを開けない。
//   そこでページが自分で開いたソケットの「受信」だけを写し、隔離された世界(tt-content-entry.js)へ渡す。
//   - 送ったり、ページの受信を変えたり止めたりはしない(写すだけ)。
//   - ギフトの日本語の名前のため、ページが自分で読む gift/list の応答も写す(必要な欄だけに縮めて渡す)。
//   - 入口(document_idle)が来る前の受信は、入口が「hello」と言うまで最大 400 通ためておく。

(() => {
  if (window.__nlTtMain) return;
  window.__nlTtMain = true;
  const OUT = 'nl-tt-main';
  const IN = 'nl-tt-iso';
  /** @type {any[]} */
  let backlog = [];
  let ready = false;
  /** @type {any} */
  let giftList = null;
  /** @type {Map<WebSocket, string>} */
  const open = new Map();

  /** @param {any} msg */
  const post = (msg) => {
    if (!ready) {
      backlog.push(msg);
      if (backlog.length > 400) backlog.shift();
      return;
    }
    try {
      window.postMessage({ source: OUT, ...msg }, location.origin);
    } catch {
      /* 送れない形 */
    }
  };

  /**
   * コメントのソケットなら URL の room_id(無ければ '')、そうでなければ null。
   *   ★ページはこのソケットを配信をまたいで使い回す(room_id は最初の配信のまま)。どの配信の受信かは入口が中身で見分ける
   * @param {unknown} url
   */
  const roomIdOf = (url) => {
    try {
      const u = new URL(String(url || ''), location.href);
      if (u.protocol !== 'wss:' || !/^webcast[^.]*\.(?:[a-z0-9-]+\.)*tiktok\.com$/i.test(u.hostname)) return null;
      const r = String(u.searchParams.get('room_id') || '');
      return /^\d{5,20}$/.test(r) ? r : '';
    } catch {
      return null;
    }
  };

  /** @param {WebSocket} ws @param {unknown} url */
  const watch = (ws, url) => {
    const roomId = roomIdOf(url);
    if (roomId == null) return;
    open.set(ws, roomId);
    post({ t: 'open', roomId, at: Date.now() });
    ws.addEventListener('message', (ev) => {
      const d = ev.data;
      if (d instanceof ArrayBuffer) post({ t: 'frame', roomId, buf: d });
      else if (d instanceof Blob) void d.arrayBuffer().then((buf) => post({ t: 'frame', roomId, buf })).catch(() => {});
    });
    ws.addEventListener('close', () => {
      open.delete(ws);
      post({ t: 'close', roomId, at: Date.now() });
    });
  };

  const Native = window.WebSocket;
  if (typeof Native === 'function') {
    window.WebSocket = new Proxy(Native, {
      construct(target, args, newTarget) {
        const ws = Reflect.construct(target, args, newTarget);
        try {
          watch(ws, args[0]);
        } catch {
          /* 写せなくてもページはそのまま */
        }
        return ws;
      },
    });
  }

  // ---- gift/list(ギフトの日本語の名前・コイン・連打できるか・絵)----
  /** @param {any} json */
  const takeGiftList = (json) => {
    const gifts = json?.data?.gifts;
    if (!Array.isArray(gifts) || !gifts.length) return;
    const pick = (/** @type {any} */ img) => (Array.isArray(img?.url_list) ? img.url_list.slice(0, 2) : []);
    giftList = {
      data: {
        gifts: gifts.slice(0, 3000).map((g) => ({
          id: g?.id,
          name: g?.name,
          diamond_count: g?.diamond_count,
          combo: g?.combo,
          type: g?.type,
          image: { url_list: pick(g?.image) },
          icon: { url_list: pick(g?.icon) },
        })),
      },
    };
    post({ t: 'gifts', json: giftList });
  };
  const GIFT_RE = /\/webcast\/gift\/list\//;

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = function (/** @type {any} */ input, /** @type {any} */ init) {
      const p = nativeFetch.call(this, input, init);
      try {
        const url = typeof input === 'string' ? input : String(input?.url || '');
        if (GIFT_RE.test(url)) {
          void p
            .then((r) => r.clone().json())
            .then(takeGiftList)
            .catch(() => {});
        }
      } catch {
        /* no-op */
      }
      return p;
    };
  }
  const XO = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (/** @type {any} */ method, /** @type {any} */ url) {
    try {
      if (GIFT_RE.test(String(url || ''))) {
        this.addEventListener('load', () => {
          try {
            const body = this.responseType === 'json' ? this.response : this.responseType === '' || this.responseType === 'text' ? JSON.parse(this.responseText) : null;
            if (body) takeGiftList(body);
          } catch {
            /* 読めない応答 */
          }
        });
      }
    } catch {
      /* no-op */
    }
    return XO.apply(this, /** @type {any} */ (arguments));
  };

  // 入口から hello が来たら、ためていた分と今の状態を渡す
  window.addEventListener('message', (ev) => {
    if (ev.source !== window || ev.data?.source !== IN || ev.data?.t !== 'hello') return;
    ready = true;
    const list = backlog;
    backlog = [];
    post({ t: 'state', rooms: [...open.values()] });
    if (giftList) post({ t: 'gifts', json: giftList });
    for (const m of list) if (m.t !== 'gifts') post(m);
  });
})();
