(() => {
  // src/lib/protobufVarint.js
  function readUint32Varint(bytes, offset) {
    if (offset < 0 || offset >= bytes.length) return null;
    let result = 0n;
    let shift = 0n;
    let o = offset;
    for (let i = 0; i < 10; i += 1) {
      const b = bytes[o];
      if (b === void 0) return null;
      o += 1;
      result |= BigInt(b & 127) << shift;
      if (result > 0xffffffffn) return null;
      if ((b & 128) === 0) {
        return { value: Number(result), length: o - offset };
      }
      shift += 7n;
    }
    return null;
  }

  // src/lib/lengthDelimitedStream.js
  function splitLengthDelimitedMessages(bytes) {
    if (!bytes.length) return [];
    const out = [];
    let offset = 0;
    while (offset < bytes.length) {
      const vr = readUint32Varint(bytes, offset);
      if (!vr) break;
      offset += vr.length;
      const len = vr.value;
      if (offset + len > bytes.length) break;
      out.push(bytes.subarray(offset, offset + len));
      offset += len;
    }
    return out;
  }

  // src/lib/interceptBinaryTextExtract.js
  var MAX_PAIR_DISTANCE = 600;
  var UID_RE = /"(?:user_id|userId|uid|hashed_user_id|hashedUserId|raw_user_id)"\s*:\s*"?(\w{5,26})"?/g;
  var NO_RE = /"(?:no|commentNo|comment_no)"\s*:\s*(\d+)/g;
  function extractPairsFromBinaryUtf8(text) {
    if (!text || text.length < 4) return [];
    const uids = [];
    const nos = [];
    let m;
    const uidRe = new RegExp(UID_RE.source, "g");
    while ((m = uidRe.exec(text)) !== null) {
      uids.push({ val: m[1], pos: m.index });
    }
    const noRe = new RegExp(NO_RE.source, "g");
    while ((m = noRe.exec(text)) !== null) {
      nos.push({ val: m[1], pos: m.index });
    }
    if (!uids.length || !nos.length) return [];
    const out = [];
    for (const u of uids) {
      let best = null;
      let bestDist = Infinity;
      for (const n of nos) {
        const dist = Math.abs(u.pos - n.pos);
        if (dist < bestDist) {
          bestDist = dist;
          best = n;
        }
      }
      if (best && bestDist < MAX_PAIR_DISTANCE) {
        out.push({ no: best.val, uid: u.val });
      }
    }
    return out;
  }

  // src/extension/page-intercept-entry.js
  (() => {
    "use strict";
    if (window.__NLS_PAGE_INTERCEPT__) return;
    const href = String(window.location?.href || "");
    const referrer = String(document.referrer || "");
    const parseUrl = (raw) => {
      try {
        return new URL(String(raw || ""));
      } catch {
        return null;
      }
    };
    const isNicoHost = (h) => String(h || "").endsWith(".nicovideo.jp") || String(h || "") === "nicovideo.jp";
    const isLocalHost = (h) => String(h || "") === "127.0.0.1:3456" || String(h || "") === "localhost:3456";
    const isWatchLikePath = (p) => String(p || "").startsWith("/watch/") || String(p || "").startsWith("/embed/");
    const here = parseUrl(href);
    const ref = parseUrl(referrer);
    const host = String(here?.host || window.location?.host || "");
    const path = String(here?.pathname || window.location?.pathname || "");
    const isAboutLikeFrame = /^(about:blank|about:srcdoc|blob:|data:)/i.test(href);
    const isRefWatchPage = Boolean(
      ref && (isNicoHost(ref.host) || isLocalHost(ref.host)) && isWatchLikePath(ref.pathname)
    );
    const isWatchPage = isNicoHost(host) && isWatchLikePath(path) || isAboutLikeFrame && isRefWatchPage;
    const isLocalDev = isLocalHost(host) || isAboutLikeFrame && Boolean(ref && isLocalHost(ref.host));
    if (!isWatchPage && !isLocalDev) return;
    window.__NLS_PAGE_INTERCEPT__ = true;
    const MSG_TYPE = "NLS_INTERCEPT_USERID";
    const MSG_STATISTICS = "NLS_INTERCEPT_STATISTICS";
    const batch = /* @__PURE__ */ new Map();
    let timer = null;
    const diag = {
      enqueued: 0,
      posted: 0,
      wsMessages: 0,
      fetchHits: 0
    };
    function publishDiag() {
      const root = document.documentElement;
      if (!root) return;
      root.setAttribute("data-nls-page-intercept", "1");
      root.setAttribute("data-nls-page-intercept-enqueued", String(diag.enqueued));
      root.setAttribute("data-nls-page-intercept-posted", String(diag.posted));
      root.setAttribute("data-nls-page-intercept-ws", String(diag.wsMessages));
      root.setAttribute("data-nls-page-intercept-fetch", String(diag.fetchHits));
      if (href) root.setAttribute("data-nls-page-intercept-href", href.slice(0, 240));
      if (referrer) {
        root.setAttribute("data-nls-page-intercept-referrer", referrer.slice(0, 240));
      }
    }
    publishDiag();
    const knownNames = /* @__PURE__ */ new Map();
    const knownAvatars = /* @__PURE__ */ new Map();
    function flush() {
      if (!batch.size) return;
      const entries = [];
      for (const [no, v] of batch) {
        const uid = String(v?.uid || "").trim();
        const name = String(v?.name || "").trim() || (uid ? String(knownNames.get(uid) || "").trim() : "");
        const av = String(v?.av || "").trim() || (uid ? String(knownAvatars.get(uid) || "").trim() : "");
        if (!uid && !name && !av) continue;
        entries.push({
          no,
          ...uid ? { uid } : {},
          ...name ? { name } : {},
          ...av ? { av } : {}
        });
      }
      batch.clear();
      if (entries.length > 0) {
        diag.posted += entries.length;
        publishDiag();
        window.postMessage({ type: MSG_TYPE, entries }, "*");
      }
    }
    function normalizeAvatarUrl(url) {
      const s = String(url ?? "").trim();
      if (!/^https?:\/\//i.test(s)) return "";
      return s;
    }
    function enqueue(commentNo, userId, nickname, avatarUrl = "") {
      const no = String(commentNo ?? "").trim();
      const uid = String(userId ?? "").trim();
      if (!no) return;
      const name = String(nickname ?? "").trim();
      const av = normalizeAvatarUrl(avatarUrl);
      if (!uid && !name && !av) return;
      diag.enqueued += 1;
      publishDiag();
      if (name && uid) knownNames.set(uid, name);
      if (av && uid) knownAvatars.set(uid, av);
      const prev = batch.get(no);
      const prevUid = String(prev?.uid || "").trim();
      const prevName = String(prev?.name || "").trim();
      const prevAv = String(prev?.av || "").trim();
      const nextUid = uid || prevUid;
      const nextName = name || prevName;
      const nextAv = av || prevAv;
      batch.set(no, {
        ...nextUid ? { uid: nextUid } : {},
        ...nextName ? { name: nextName } : {},
        ...nextAv ? { av: nextAv } : {}
      });
      if (!timer) timer = setTimeout(() => {
        timer = null;
        flush();
      }, 150);
    }
    function learnUser(userId, nickname, avatarUrl = "") {
      const uid = String(userId ?? "").trim();
      const name = String(nickname ?? "").trim();
      const av = normalizeAvatarUrl(avatarUrl);
      if (uid && name) knownNames.set(uid, name);
      if (uid && av) knownAvatars.set(uid, av);
    }
    const NO_KEYS = ["no", "commentNo", "comment_no", "number", "vpos_no"];
    const UID_KEYS = [
      "user_id",
      "userId",
      "uid",
      "raw_user_id",
      "hashedUserId",
      "hashed_user_id",
      "senderUserId",
      "accountId"
    ];
    const NAME_KEYS = [
      "name",
      "nickname",
      "userName",
      "user_name",
      "displayName",
      "display_name"
    ];
    const AVATAR_KEYS = [
      "iconUrl",
      "icon_url",
      "avatarUrl",
      "avatar_url",
      "userIconUrl",
      "user_icon_url",
      "thumbnailUrl",
      "thumbnail_url"
    ];
    function dig(obj, depth) {
      if (!obj || typeof obj !== "object" || depth > 5) return;
      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length && i < 500; i++) dig(obj[i], depth + 1);
        return;
      }
      let no = null;
      let uid = null;
      let name = null;
      let av = "";
      for (const k of NO_KEYS) {
        if (obj[k] != null) {
          no = obj[k];
          break;
        }
      }
      for (const k of UID_KEYS) {
        if (obj[k] != null) {
          uid = obj[k];
          break;
        }
      }
      for (const k of NAME_KEYS) {
        if (obj[k] != null && typeof obj[k] === "string") {
          name = obj[k];
          break;
        }
      }
      for (const k of AVATAR_KEYS) {
        if (obj[k] != null && typeof obj[k] === "string") {
          av = normalizeAvatarUrl(obj[k]);
          if (av) break;
        }
      }
      const NESTED = ["chat", "comment", "data", "message", "body", "user", "sender"];
      if (no == null || uid == null || name == null || !av) {
        for (const sub of NESTED) {
          const child = obj[sub];
          if (!child || typeof child !== "object" || Array.isArray(child)) continue;
          if (no == null) {
            for (const k of NO_KEYS) {
              if (child[k] != null) {
                no = child[k];
                break;
              }
            }
          }
          if (uid == null) {
            for (const k of UID_KEYS) {
              if (child[k] != null) {
                uid = child[k];
                break;
              }
            }
          }
          if (name == null) {
            for (const k of NAME_KEYS) {
              if (child[k] != null && typeof child[k] === "string") {
                name = child[k];
                break;
              }
            }
          }
          if (!av) {
            for (const k of AVATAR_KEYS) {
              if (child[k] != null && typeof child[k] === "string") {
                av = normalizeAvatarUrl(child[k]);
                if (av) break;
              }
            }
          }
        }
      }
      if (no != null && (uid != null || av)) {
        enqueue(no, uid, name, av);
      } else if (uid != null && name != null) {
        learnUser(uid, name, av);
      }
      const keys = Object.keys(obj);
      for (let i = 0; i < keys.length && i < 30; i++) {
        const v = obj[keys[i]];
        if (v && typeof v === "object") dig(v, depth + 1);
      }
    }
    function extractFromBinaryText(text) {
      for (const p of extractPairsFromBinaryUtf8(text)) {
        enqueue(p.no, p.uid, "", "");
      }
    }
    function tryProcessBinaryBuffer(u8) {
      if (u8.byteLength < 8 || u8.byteLength > 2e6) return;
      const chunks = splitLengthDelimitedMessages(u8);
      const dec = new TextDecoder("utf-8", { fatal: false });
      if (chunks.length > 0) {
        for (const ch of chunks) {
          extractFromBinaryText(dec.decode(ch));
        }
      }
      extractFromBinaryText(dec.decode(u8));
    }
    const VIEWER_KEYS = ["viewers", "watchCount", "watching", "watchingCount", "viewerCount", "viewCount"];
    const COMMENT_KEYS = ["comments", "commentCount"];
    function pickNum(obj, keys, max) {
      for (const k of keys) {
        const r = obj[k];
        if (r == null) continue;
        const n = typeof r === "number" ? r : parseInt(String(r), 10);
        if (Number.isFinite(n) && n >= 0 && (!max || n <= max)) return n;
      }
      return null;
    }
    function tryForwardStatistics(obj) {
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
      const o = (
        /** @type {Record<string, unknown>} */
        obj
      );
      const d = o.data;
      const target = d && typeof d === "object" && !Array.isArray(d) ? (
        /** @type {Record<string, unknown>} */
        d
      ) : o;
      let viewers = pickNum(target, VIEWER_KEYS, 5e7);
      let comments = pickNum(target, COMMENT_KEYS);
      if (viewers == null && target !== o) {
        viewers = pickNum(o, VIEWER_KEYS, 5e7);
        comments = comments ?? pickNum(o, COMMENT_KEYS);
      }
      if (viewers == null) return;
      window.postMessage(
        { type: MSG_STATISTICS, viewers, comments },
        "*"
      );
    }
    function tryProcess(raw) {
      if (typeof raw === "string") {
        if (raw.length < 4 || raw.length > 1e6) return;
        try {
          const parsed = JSON.parse(raw);
          tryForwardStatistics(parsed);
          dig(parsed, 0);
        } catch {
        }
        return;
      }
      if (raw instanceof ArrayBuffer || raw instanceof Uint8Array) {
        const buf = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
        tryProcessBinaryBuffer(buf);
        return;
      }
      if (typeof Blob !== "undefined" && raw instanceof Blob) {
        if (raw.size > 2e6) return;
        raw.arrayBuffer().then((ab) => tryProcess(ab)).catch(() => {
        });
      }
    }
    const OrigWS = window.WebSocket;
    try {
      window.WebSocket = new Proxy(OrigWS, {
        construct(target, args) {
          const ws = new target(...args);
          ws.addEventListener("message", (e) => {
            try {
              diag.wsMessages += 1;
              publishDiag();
              tryProcess(e.data);
            } catch {
            }
          });
          return ws;
        }
      });
      Object.defineProperty(window.WebSocket, "prototype", {
        value: OrigWS.prototype,
        writable: false,
        configurable: false
      });
    } catch {
    }
    const origFetch = window.fetch;
    if (typeof origFetch === "function") {
      window.fetch = function(...args) {
        const p = origFetch.apply(this, args);
        void (async () => {
          try {
            const res = await p;
            const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
            const isNico = url.includes("nicovideo.jp") || url.includes("nimg.jp") || url.includes("dmc.nico") || url.includes("nicolive") || url.includes("ndgr") || url.includes("127.0.0.1:3456") || url.includes("localhost:3456");
            if (!isNico) return;
            diag.fetchHits += 1;
            publishDiag();
            const ct = res.headers?.get("content-type") || "";
            const isBinary = ct.includes("protobuf") || ct.includes("octet") || ct.includes("grpc");
            const isJson = ct.includes("json");
            if (!isBinary && !isJson) return;
            const clone = res.clone();
            if (isBinary && clone.body) {
              const reader = clone.body.getReader();
              void (async () => {
                try {
                  for (; ; ) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (value) tryProcessBinaryBuffer(value);
                  }
                } catch {
                }
              })();
            } else {
              try {
                tryProcess(await clone.arrayBuffer());
              } catch {
              }
            }
          } catch {
          }
        })();
        return p;
      };
    }
    const FIBER_SCAN_MS = 3500;
    const FB_NO = ["no", "commentNo", "comment_no", "number", "vposNo"];
    const FB_UID = ["userId", "user_id", "uid", "hashedUserId", "hashed_user_id", "senderUserId", "rawUserId", "raw_user_id"];
    const FB_NAME = ["name", "nickname", "userName", "user_name", "displayName", "display_name"];
    const FB_AV = ["iconUrl", "icon_url", "avatarUrl", "avatar_url", "userIconUrl"];
    function getFiber(el) {
      if (!el) return null;
      for (const k of Object.keys(el)) {
        if (k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")) return el[k] || null;
      }
      return null;
    }
    function pickStr(obj, keys) {
      if (!obj || typeof obj !== "object") return "";
      for (const k of keys) {
        const v = obj[k];
        if (v != null && v !== "") return String(v);
      }
      return "";
    }
    function digFiber(fiber, depth) {
      if (!fiber || depth > 6) return null;
      const props = fiber.memoizedProps || fiber.pendingProps;
      if (props && typeof props === "object" && !Array.isArray(props)) {
        let no = pickStr(props, FB_NO);
        let uid = pickStr(props, FB_UID);
        let nm = pickStr(props, FB_NAME);
        let av = normalizeAvatarUrl(pickStr(props, FB_AV));
        const SUBS = ["data", "chat", "comment", "item", "message", "props", "value"];
        for (const s of SUBS) {
          const c = props[s];
          if (!c || typeof c !== "object" || Array.isArray(c)) continue;
          if (!no) no = pickStr(c, FB_NO);
          if (!uid) uid = pickStr(c, FB_UID);
          if (!nm) nm = pickStr(c, FB_NAME);
          if (!av) av = normalizeAvatarUrl(pickStr(c, FB_AV));
        }
        if (no && uid) return { no, uid, nm, av };
      }
      let child = fiber.child;
      while (child) {
        const r = digFiber(child, depth + 1);
        if (r) return r;
        child = child.sibling;
      }
      return null;
    }
    let _fiberScanCount = 0;
    let _fiberFoundCount = 0;
    let _fiberRowCount = 0;
    let _fiberProbeKeys = "";
    function scanGridFibers() {
      try {
        const grid = document.querySelector('[class*="comment-data-grid"], [class*="data-grid"]');
        if (!grid) return;
        const body = grid.querySelector('[class*="body"]');
        if (!body) return;
        const table = body.querySelector('[class*="table"]');
        const target = table || body;
        const rows = target.children;
        _fiberScanCount++;
        _fiberRowCount = rows.length;
        let found = 0;
        for (let i = 0; i < rows.length && i < 300; i++) {
          const row = rows[i];
          const fb = getFiber(row);
          if (!fb) continue;
          if (_fiberProbeKeys === "" && i === 0) {
            const p = fb.memoizedProps || fb.pendingProps || {};
            const keys = Object.keys(p).slice(0, 20);
            _fiberProbeKeys = keys.join(",");
            for (const key of keys) {
              if (typeof p[key] === "object" && p[key] !== null && !Array.isArray(p[key])) {
                _fiberProbeKeys += " | " + key + ":{" + Object.keys(p[key]).slice(0, 15).join(",") + "}";
                break;
              }
            }
          }
          const data = digFiber(fb, 0);
          if (data) {
            enqueue(data.no, data.uid, data.nm, data.av);
            found++;
          }
        }
        _fiberFoundCount += found;
        const root = document.documentElement;
        if (root) {
          root.setAttribute("data-nls-fiber-scans", String(_fiberScanCount));
          root.setAttribute("data-nls-fiber-found", String(_fiberFoundCount));
          root.setAttribute("data-nls-fiber-rows", String(_fiberRowCount));
          root.setAttribute("data-nls-fiber-probe", _fiberProbeKeys.substring(0, 300));
        }
      } catch {
      }
    }
    function startFiberScan() {
      let attempts = 0;
      const tryStart = () => {
        attempts++;
        if (document.querySelector('[class*="comment-data-grid"], [class*="data-grid"]')) {
          scanGridFibers();
          setInterval(scanGridFibers, FIBER_SCAN_MS);
          return;
        }
        if (attempts < 60) setTimeout(tryStart, 2e3);
      };
      tryStart();
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => setTimeout(startFiberScan, 1500), { once: true });
    } else {
      setTimeout(startFiberScan, 1500);
    }
    const MSG_EMBEDDED_DATA = "NLS_INTERCEPT_EMBEDDED_DATA";
    function tryReadEmbeddedData() {
      try {
        const el = document.getElementById("embedded-data");
        if (!el) return;
        let raw = el.getAttribute("data-props") || "";
        if (!raw) return;
        if (raw.includes("&quot;")) raw = raw.replace(/&quot;/g, '"');
        if (raw.includes("&amp;")) raw = raw.replace(/&amp;/g, "&");
        const obj = JSON.parse(raw);
        if (!obj || typeof obj !== "object") return;
        const wc = obj?.program?.statistics?.watchCount;
        const viewers = wc != null && Number.isFinite(Number(wc)) && Number(wc) >= 0 ? Number(wc) : null;
        window.postMessage(
          { type: MSG_EMBEDDED_DATA, viewers },
          "*"
        );
      } catch {
      }
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", tryReadEmbeddedData, { once: true });
    } else {
      tryReadEmbeddedData();
    }
  })();
})();
