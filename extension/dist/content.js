(() => {
  // src/lib/broadcastUrl.js
  var LV_RE = /\blv\d+/i;
  function extractLiveIdFromUrl(url) {
    const s = String(url || "").trim();
    if (!s) return null;
    try {
      const u = new URL(s);
      const m = u.pathname.match(LV_RE) || u.href.match(LV_RE);
      return m ? m[0].toLowerCase() : null;
    } catch {
      const m = s.match(LV_RE);
      return m ? m[0].toLowerCase() : null;
    }
  }
  function isLocalE2EWatchHost(u) {
    const host = u.hostname.toLowerCase();
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    return u.protocol === "http:" && (host === "127.0.0.1" || host === "localhost") && port === "3456";
  }
  function isNicoLiveWatchUrl(url) {
    try {
      const u = new URL(String(url || ""));
      const host = u.hostname.toLowerCase();
      const pathOk = /\/watch\/lv\d+/i.test(u.pathname);
      if (isLocalE2EWatchHost(u)) return pathOk;
      if (!host.includes("nicovideo.jp")) return false;
      return pathOk;
    } catch {
      return false;
    }
  }

  // src/lib/storageKeys.js
  var KEY_RECORDING = "nls_recording_enabled";
  var KEY_LAST_WATCH_URL = "nls_last_watch_url";
  var KEY_STORAGE_WRITE_ERROR = "nls_storage_write_error";
  var KEY_POPUP_FRAME = "nls_popup_frame";
  var KEY_POPUP_FRAME_CUSTOM = "nls_popup_frame_custom";
  var KEY_THUMB_AUTO = "nls_thumb_auto_enabled";
  var KEY_THUMB_INTERVAL_MS = "nls_thumb_interval_ms";
  var KEY_INLINE_PANEL_WIDTH_MODE = "nls_inline_panel_width_mode";
  var INLINE_PANEL_WIDTH_PLAYER_ROW = "player_row";
  var INLINE_PANEL_WIDTH_VIDEO = "video";
  function normalizeInlinePanelWidthMode(raw) {
    const s = String(raw || "").trim();
    if (s === INLINE_PANEL_WIDTH_VIDEO) return INLINE_PANEL_WIDTH_VIDEO;
    return INLINE_PANEL_WIDTH_PLAYER_ROW;
  }
  function commentsStorageKey(liveId2) {
    const id = String(liveId2 || "").trim().toLowerCase();
    return `nls_comments_${id}`;
  }

  // src/lib/videoCapture.js
  var DEFAULT_MAX_EDGE = 1280;
  function fitThumbnailDimensions(srcW, srcH, maxW, maxH) {
    const w = Math.max(1, Math.floor(Number(srcW) || 1));
    const h = Math.max(1, Math.floor(Number(srcH) || 1));
    let mw = Math.max(1, Math.floor(Number(maxW) || 1));
    let mh = Math.max(1, Math.floor(Number(maxH) || 1));
    if (maxW <= 0 || maxH <= 0) {
      mw = 1;
      mh = 1;
    }
    const scale = Math.min(mw / w, mh / h, 1);
    const width = Math.max(1, Math.round(w * scale));
    const height = Math.max(1, Math.round(h * scale));
    return { width, height };
  }
  function interpretCaptureError(err) {
    if (err == null) return "unknown";
    const name = err && typeof err === "object" && "name" in err ? String(
      /** @type {{ name?: string }} */
      err.name || ""
    ) : "";
    if (name === "SecurityError") return "tainted_canvas";
    const msg = err && typeof err === "object" && "message" in err ? String(
      /** @type {{ message?: string }} */
      err.message || ""
    ) : String(err);
    if (/no video|video not found/i.test(msg)) return "no_video";
    if (/not ready|HAVE_NOTHING|empty/i.test(msg)) return "not_ready";
    return "capture_failed";
  }
  function pickLargestVisibleVideo(doc) {
    const list = Array.from(doc.querySelectorAll("video"));
    let best = null;
    for (const v of list) {
      if (!(v instanceof HTMLVideoElement)) continue;
      const rect = v.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      const st = doc.defaultView?.getComputedStyle(v);
      if (st && (st.visibility === "hidden" || st.display === "none")) continue;
      const area = rect.width * rect.height;
      if (!best || area > best.area) best = { el: v, area };
    }
    return best?.el || null;
  }
  async function captureVideoToPngDataUrl(video, opts) {
    const maxEdge = opts?.maxEdge ?? DEFAULT_MAX_EDGE;
    if (!(video instanceof HTMLVideoElement)) {
      return { ok: false, errorCode: "no_video" };
    }
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) {
      return { ok: false, errorCode: "not_ready" };
    }
    const { width, height } = fitThumbnailDimensions(vw, vh, maxEdge, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return { ok: false, errorCode: "capture_failed" };
    }
    try {
      ctx.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/png");
      if (!dataUrl || !dataUrl.startsWith("data:image/png")) {
        return { ok: false, errorCode: "capture_failed" };
      }
      return { ok: true, mime: "image/png", dataUrl };
    } catch (err) {
      return { ok: false, errorCode: interpretCaptureError(err) };
    }
  }

  // src/lib/thumbFifo.js
  var MAX_THUMBS_PER_LIVE = 500;
  function thumbIdsToDropForFifo(sortedOldestFirst, maxKeep) {
    const n = sortedOldestFirst.length;
    if (n <= maxKeep) return [];
    const drop = n - maxKeep;
    return sortedOldestFirst.slice(0, drop).map((r) => r.id);
  }

  // src/lib/thumbDb.js
  var DB_NAME = "nls_thumb_v1";
  var STORE = "thumbs";
  var VERSION = 1;
  function isIndexedDbAvailable() {
    return typeof indexedDB !== "undefined";
  }
  function openThumbDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const s = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
          s.createIndex("byLive", "liveId", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function addThumbBlob(liveId2, blob) {
    if (!isIndexedDbAvailable()) return;
    const lid = String(liveId2 || "").trim().toLowerCase();
    if (!lid || !(blob instanceof Blob)) return;
    const db = await openThumbDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        const idx = store.index("byLive");
        const addReq = store.add({
          liveId: lid,
          capturedAt: Date.now(),
          blob
        });
        addReq.onerror = () => reject(addReq.error);
        addReq.onsuccess = () => {
          const getReq = idx.getAll(lid);
          getReq.onerror = () => reject(getReq.error);
          getReq.onsuccess = () => {
            const all = (
              /** @type {{ id: number, capturedAt: number }[]} */
              getReq.result || []
            );
            all.sort((a, b) => a.capturedAt - b.capturedAt);
            const toDrop = thumbIdsToDropForFifo(
              all.map((r) => ({ id: r.id, capturedAt: r.capturedAt })),
              MAX_THUMBS_PER_LIVE
            );
            for (const id of toDrop) {
              store.delete(id);
            }
          };
        };
        tx.oncomplete = () => resolve(void 0);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }
  async function countThumbsForLive(liveId2) {
    if (!isIndexedDbAvailable()) return 0;
    const lid = String(liveId2 || "").trim().toLowerCase();
    if (!lid) return 0;
    const db = await openThumbDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const idx = tx.objectStore(STORE).index("byLive");
        const r = idx.getAll(lid);
        r.onsuccess = () => resolve((r.result || []).length);
        r.onerror = () => reject(r.error);
      });
    } finally {
      db.close();
    }
  }

  // src/lib/thumbSettings.js
  var THUMB_INTERVAL_PRESET_MS = Object.freeze([
    0,
    3e4,
    6e4,
    3e5
  ]);
  var THUMB_INTERVAL_E2E_MS = 2e3;
  var ALLOWED = new Set(THUMB_INTERVAL_PRESET_MS);
  function normalizeThumbIntervalMs(raw) {
    const n = typeof raw === "string" ? Number(raw) : Number(raw);
    if (!Number.isFinite(n) || n < 0) return 0;
    if (ALLOWED.has(n)) return n;
    return 0;
  }
  function normalizeThumbIntervalMsForHost(raw, hostname) {
    const h = String(hostname || "").toLowerCase();
    const isLocal = h === "localhost" || h === "127.0.0.1";
    if (isLocal && Number(raw) === THUMB_INTERVAL_E2E_MS) return THUMB_INTERVAL_E2E_MS;
    return normalizeThumbIntervalMs(raw);
  }
  function isThumbAutoEnabled(v) {
    return v === true;
  }

  // src/lib/supportGrowthTileSrc.js
  function isHttpOrHttpsUrl(url) {
    const s = String(url || "").trim();
    return /^https?:\/\//i.test(s);
  }

  // src/lib/commentRecord.js
  function normalizeCommentText(value) {
    return String(value || "").replace(/\r\n/g, "\n").split("\n").map((l) => l.trim()).join("\n").trim();
  }
  function buildDedupeKey(liveId2, rec) {
    const text = normalizeCommentText(rec.text);
    const no = String(rec.commentNo ?? "").trim();
    if (no) {
      return `${liveId2}|${no}|${text}`;
    }
    const sec = Math.floor(Number(rec.capturedAt || 0) / 1e3);
    return `${liveId2}||${text}|${sec}`;
  }
  function randomId() {
    return `c_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
  function createCommentEntry(p) {
    const capturedAt = Date.now();
    const text = normalizeCommentText(p.text);
    const commentNo = String(p.commentNo ?? "").trim();
    const liveId2 = String(p.liveId || "").trim().toLowerCase();
    const nickname = p.nickname ? String(p.nickname).trim() : "";
    const av = String(p.avatarUrl || "").trim();
    const avatarUrl = isHttpOrHttpsUrl(av) ? av : "";
    const entry = {
      id: randomId(),
      liveId: liveId2,
      commentNo,
      text,
      userId: p.userId ? String(p.userId) : null,
      ...nickname ? { nickname } : {},
      ...avatarUrl ? { avatarUrl } : {},
      capturedAt
    };
    return entry;
  }
  function storedCommentDedupeKey(lid, ex) {
    return buildDedupeKey(lid, {
      commentNo: ex.commentNo,
      text: ex.text,
      capturedAt: ex.capturedAt
    });
  }
  function mergeNewComments(liveId2, existing, incoming) {
    const lid = String(liveId2 || "").trim().toLowerCase();
    const keys = /* @__PURE__ */ new Set();
    for (const e of existing) {
      const ex = (
        /** @type {StoredComment} */
        e
      );
      keys.add(storedCommentDedupeKey(lid, ex));
    }
    const added = [];
    const next = (
      /** @type {StoredComment[]} */
      [...existing]
    );
    const now = Date.now();
    let storageTouched = false;
    for (const row of incoming) {
      const text = normalizeCommentText(row.text);
      if (!text) continue;
      const commentNo = String(row.commentNo ?? "").trim();
      const key = buildDedupeKey(lid, {
        commentNo,
        text,
        capturedAt: now
      });
      const rawAv = String(row.avatarUrl || "").trim();
      const validAvatar = isHttpOrHttpsUrl(rawAv) ? rawAv : "";
      if (keys.has(key)) {
        const idx = next.findIndex((ex) => storedCommentDedupeKey(lid, ex) === key);
        if (idx >= 0) {
          const ex = (
            /** @type {StoredComment} */
            next[idx]
          );
          let patched = ex;
          let touched = false;
          if (validAvatar) {
            const hasAv = Boolean(
              ex.avatarUrl && isHttpOrHttpsUrl(String(ex.avatarUrl))
            );
            if (!hasAv) {
              patched = { ...patched, avatarUrl: validAvatar };
              touched = true;
            }
          }
          const incUid = row.userId ? String(row.userId).trim() : "";
          if (incUid && !ex.userId) {
            patched = { ...patched, userId: incUid };
            touched = true;
          }
          const incNick = String(row.nickname || "").trim();
          if (incNick && !String(ex.nickname || "").trim()) {
            patched = { ...patched, nickname: incNick };
            touched = true;
          }
          if (touched) {
            next[idx] = patched;
            storageTouched = true;
          }
        }
        continue;
      }
      keys.add(key);
      const entry = createCommentEntry({
        liveId: lid,
        commentNo,
        text,
        userId: row.userId ?? null,
        nickname: row.nickname || "",
        avatarUrl: validAvatar || void 0
      });
      added.push(entry);
      next.push(entry);
    }
    if (added.length) storageTouched = true;
    return { next, added, storageTouched };
  }

  // src/lib/nicoliveDom.js
  var LINE_HEAD = /^(\d{1,8})\s+([\s\S]+)$/;
  function parseCommentLineText(text) {
    const t = String(text || "").replace(/\r\n/g, "\n").trim();
    if (!t) return null;
    const m = t.match(LINE_HEAD);
    if (!m) return null;
    const body = m[2].replace(/\n+/g, " ").trim();
    if (!body) return null;
    return { commentNo: m[1], text: body };
  }
  function extractUserIdFromLinks(el) {
    if (!el || el.nodeType !== 1) return null;
    const tryHref = (href) => {
      const h = String(href || "");
      const m = h.match(/nicovideo\.jp\/user\/(\d+)/i) || h.match(/live\.nicovideo\.jp\/watch\/user\/(\d+)/i) || h.match(/\/user\/(\d+)/i);
      return m ? m[1] : null;
    };
    const anchors = el.querySelectorAll("a[href]");
    for (const a of anchors) {
      const id = tryHref(a.getAttribute("href"));
      if (id) return id;
    }
    let p = el;
    for (let i = 0; i < 10 && p; i++) {
      if (p.tagName === "A") {
        const id = tryHref(p.getAttribute("href"));
        if (id) return id;
      }
      p = p.parentElement;
    }
    return null;
  }
  function extractUserIdFromDataAttributes(el) {
    if (!el || el.nodeType !== 1) return null;
    const nodes = [el, ...el.querySelectorAll("*")];
    for (const n of nodes) {
      const attrs = n.attributes;
      if (!attrs) continue;
      for (let i = 0; i < attrs.length; i++) {
        const name = attrs[i].name.toLowerCase();
        if (!name.includes("user") && !name.includes("owner") && !name.includes("author") && !name.includes("account")) {
          continue;
        }
        const v = String(attrs[i].value || "").trim();
        if (/^\d{5,14}$/.test(v)) return v;
        if (/^[a-zA-Z0-9_-]{10,26}$/.test(v)) return v;
      }
    }
    return null;
  }
  function extractUserIdFromIconSrc(el) {
    if (!el || el.nodeType !== 1) return null;
    const imgs = el.querySelectorAll(
      'img[src*="usericon"], img[src*="nicoaccount"]'
    );
    for (const img of imgs) {
      const src = String(img.getAttribute("src") || "");
      let m = src.match(/\/usericon\/(?:s\/)?(\d+)\/(\d+)\./i);
      if (m?.[2]) return m[2];
      m = src.match(/nicoaccount\/usericon\/(\d+)/i);
      if (m?.[1] && m[1].length >= 5) return m[1];
    }
    return null;
  }
  function collectNicoUserIconUrlPartsFromImg(img) {
    if (!(img instanceof HTMLImageElement)) return [];
    const urls = [];
    for (const a of [
      "src",
      "data-src",
      "data-original",
      "data-lazy-src",
      "data-url"
    ]) {
      const v = img.getAttribute(a);
      if (v) urls.push(String(v).trim());
    }
    const srcset = img.getAttribute("srcset");
    if (srcset) {
      for (const chunk of srcset.split(",")) {
        const token = chunk.trim().split(/\s+/)[0];
        if (token) urls.push(token);
      }
    }
    return urls;
  }
  function looksLikeNicoUserIconUrl(url) {
    const s = String(url || "");
    if (!s) return false;
    return /nicoaccount\/usericon|\/usericon\/|usericon\.nicovideo/i.test(s);
  }
  function absoluteNicoUserIconFromImg(img, baseHref) {
    const base = String(baseHref || "").trim() || "https://live.nicovideo.jp/";
    if (!(img instanceof HTMLImageElement)) return "";
    for (const raw of collectNicoUserIconUrlPartsFromImg(img)) {
      if (!looksLikeNicoUserIconUrl(raw)) continue;
      let abs = "";
      try {
        abs = new URL(raw, base).href;
      } catch {
        abs = raw;
      }
      if (!/^https?:\/\//i.test(abs)) continue;
      const rect = img.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && (rect.width > 96 || rect.height > 96)) {
        continue;
      }
      return abs;
    }
    return "";
  }
  function extractUserIconUrlFromElement(el, baseHref) {
    if (!el || el.nodeType !== 1) return "";
    const base = String(baseHref || "").trim() || "https://live.nicovideo.jp/";
    const imgs = el.querySelectorAll("img");
    for (const img of imgs) {
      const abs = absoluteNicoUserIconFromImg(
        /** @type {HTMLImageElement} */
        img,
        base
      );
      if (abs) return abs;
    }
    return "";
  }
  function documentBaseHref(doc) {
    try {
      return String(doc?.defaultView?.location?.href || "").trim();
    } catch {
      return "";
    }
  }
  function extractUserIdFromReactFiber(el) {
    if (!el || el.nodeType !== 1) return null;
    const targets = [el, el.parentElement].filter(Boolean);
    for (const node of targets) {
      const fiber = getReactFiber(node);
      if (!fiber) continue;
      const id = walkFiberForUserId(fiber, 6);
      if (id) return id;
    }
    return null;
  }
  function getReactFiber(el) {
    if (!el) return null;
    const keys = Object.keys(el);
    for (const k of keys) {
      if (k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")) {
        return el[k] || null;
      }
    }
    return null;
  }
  var USERID_PROP_KEYS = [
    "userId",
    "user_id",
    "userid",
    "hashedUserId",
    "hashed_user_id",
    "senderUserId",
    "accountId",
    "uid"
  ];
  function walkFiberForUserId(fiber, maxDepth) {
    let cur = fiber;
    for (let i = 0; i < maxDepth && cur; i++) {
      for (const bag of [cur.memoizedProps, cur.pendingProps]) {
        const id = pickUserIdFromBag(bag);
        if (id) return id;
      }
      cur = cur.return;
    }
    return null;
  }
  function pickUserIdFromBag(bag) {
    if (!bag || typeof bag !== "object") return null;
    const obj = (
      /** @type {Record<string, unknown>} */
      bag
    );
    for (const key of USERID_PROP_KEYS) {
      const v = obj[key];
      if (v == null) continue;
      const s = String(v).trim();
      if (/^\d{5,14}$/.test(s)) return s;
      if (/^[a-zA-Z0-9_-]{10,26}$/.test(s)) return s;
    }
    for (const key of ["comment", "data", "item", "chat", "message"]) {
      const nested = obj[key];
      if (!nested || typeof nested !== "object") continue;
      const nestedObj = (
        /** @type {Record<string, unknown>} */
        nested
      );
      for (const uid of USERID_PROP_KEYS) {
        const v = nestedObj[uid];
        if (v == null) continue;
        const s = String(v).trim();
        if (/^\d{5,14}$/.test(s)) return s;
        if (/^[a-zA-Z0-9_-]{10,26}$/.test(s)) return s;
      }
    }
    return null;
  }
  function extractUserIdFromOuterHtml(el, maxLen = 12e3) {
    if (!el || el.nodeType !== 1) return null;
    let html = "";
    try {
      html = String(el.outerHTML || "").slice(0, maxLen);
    } catch {
      return null;
    }
    const patterns = [
      /"userId"\s*:\s*"([^"\\]+)"/,
      /"user_id"\s*:\s*"([^"\\]+)"/,
      /"userId"\s*:\s*(\d+)/,
      /data-user-id\s*=\s*"([^"]+)"/i,
      /data-userid\s*=\s*"([^"]+)"/i
    ];
    for (const p of patterns) {
      const m = html.match(p);
      if (!m?.[1]) continue;
      const v = String(m[1]).trim();
      if (/^\d{5,14}$/.test(v)) return v;
      if (/^[a-zA-Z0-9_-]{10,26}$/.test(v)) return v;
    }
    return null;
  }
  function resolveUserIdOnElement(el) {
    if (!el || el.nodeType !== 1) return null;
    const userAttr = el.getAttribute("data-user-id") || el.getAttribute("data-userid") || el.getAttribute("data-owner-id") || el.closest("[data-user-id]")?.getAttribute("data-user-id") || el.closest("[data-userid]")?.getAttribute("data-userid") || null;
    let userId = userAttr ? String(userAttr).trim() || null : null;
    if (!userId) userId = extractUserIdFromLinks(el);
    if (!userId) userId = extractUserIdFromIconSrc(el);
    if (!userId) userId = extractUserIdFromDataAttributes(el);
    if (!userId) userId = extractUserIdFromReactFiber(el);
    if (!userId) userId = extractUserIdFromOuterHtml(el);
    if (!userId) {
      let p = el.parentElement;
      for (let i = 0; i < 10 && p; i++) {
        userId = extractUserIdFromLinks(p) || extractUserIdFromIconSrc(p) || extractUserIdFromDataAttributes(p) || extractUserIdFromReactFiber(p) || extractUserIdFromOuterHtml(p);
        if (userId) break;
        p = p.parentElement;
      }
    }
    return userId;
  }
  function parseNicoLiveTableRow(el) {
    if (!el || el.nodeType !== 1) return null;
    const row = el.matches?.(".table-row") ? el : el.closest?.('div.table-row[role="row"]') || el.closest?.(".table-row");
    if (!row) return null;
    if (row.getAttribute("data-comment-type") !== "normal") return null;
    const numEl = row.querySelector(".comment-number");
    const textEl = row.querySelector(".comment-text");
    if (!numEl || !textEl) return null;
    const commentNo = String(numEl.textContent || "").replace(/\s+/g, "").trim();
    if (!commentNo || !/^\d{1,9}$/.test(commentNo)) return null;
    const text = String(textEl.textContent || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (!text) return null;
    const userId = resolveUserIdOnElement(row);
    const base = documentBaseHref(row.ownerDocument) || "https://live.nicovideo.jp/";
    const avatarUrl = extractUserIconUrlFromElement(row, base);
    const out = { commentNo, text, userId };
    if (avatarUrl) out.avatarUrl = avatarUrl;
    return out;
  }
  function parseCommentElement(el) {
    if (!el || el.nodeType !== 1) return null;
    const fromGrid = parseNicoLiveTableRow(el);
    if (fromGrid) return fromGrid;
    const userId = resolveUserIdOnElement(el);
    const base = documentBaseHref(el.ownerDocument) || "https://live.nicovideo.jp/";
    const avatarUrl = extractUserIconUrlFromElement(el, base);
    const raw = (("innerText" in el ? (
      /** @type {HTMLElement} */
      el.innerText
    ) : "") || el.textContent || "").replace(/\u00a0/g, " ").trim();
    if (!raw) return null;
    const withAv = (o) => ({
      ...o,
      userId,
      ...avatarUrl ? { avatarUrl } : {}
    });
    const lines = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const p2 = parseCommentLineText(line);
      if (p2) return withAv(p2);
    }
    const oneLine = raw.replace(/\s+/g, " ").trim();
    const p = parseCommentLineText(oneLine);
    if (p) return withAv(p);
    return null;
  }
  var ROW_QUERY = [
    "li",
    '[role="listitem"]',
    '[class*="comment" i]',
    '[class*="Comment" i]'
  ].join(",");
  function collectNicoLiveTableRows(el) {
    if (!el || el.nodeType !== 1) return [];
    const set = /* @__PURE__ */ new Set();
    try {
      if (el.matches?.('div.table-row[data-comment-type="normal"]')) set.add(el);
      el.querySelectorAll?.('div.table-row[data-comment-type="normal"]').forEach(
        (r) => set.add(r)
      );
    } catch {
    }
    return [...set];
  }
  function extractCommentsFromNode(root) {
    if (!root || root.nodeType !== 1) return [];
    const el = (
      /** @type {Element} */
      root
    );
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    function push(parsed) {
      if (!parsed) return;
      const k = `${parsed.commentNo}	${parsed.text}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push(parsed);
    }
    const tableRows = collectNicoLiveTableRows(el);
    for (const row of tableRows) {
      push(parseNicoLiveTableRow(row));
    }
    const tag = el.tagName?.toLowerCase() || "";
    const skipRootBlobParse = tableRows.length > 0;
    if (!skipRootBlobParse && tag !== "ul" && tag !== "ol") {
      push(parseCommentElement(el));
    }
    try {
      el.querySelectorAll(ROW_QUERY).forEach((node) => {
        if (node.closest?.(".program-recommend-panel")) return;
        if (node.closest?.("article.program-card")) return;
        push(parseCommentElement(node));
      });
    } catch {
      el.querySelectorAll("li").forEach((node) => {
        if (node.closest?.(".program-recommend-panel")) return;
        if (node.closest?.("article.program-card")) return;
        push(parseCommentElement(node));
      });
    }
    return out;
  }

  // src/lib/watchPageViewerProfile.js
  var HEADER_BAND_MAX_TOP = 220;
  function extractNicoUserIdFromHref(href) {
    const m = String(href || "").match(/\/user\/(\d+)/);
    return m ? m[1] : "";
  }
  function pickViewerUserIdFromRoots(uniqueRoots) {
    const best = /* @__PURE__ */ new Map();
    for (const root of uniqueRoots) {
      for (const a of root.querySelectorAll('a[href*="/user/"]')) {
        if (!(a instanceof HTMLAnchorElement)) continue;
        const uid = extractNicoUserIdFromHref(a.getAttribute("href") || "");
        if (!uid) continue;
        let score = 1;
        if (a.querySelector(
          'img[src*="nicoaccount"], img[src*="/usericon/"], img[src*="usericon"]'
        )) {
          score += 4;
        }
        const hint = `${a.getAttribute("aria-label") || ""} ${a.textContent || ""}`;
        if (/アカウント|マイページ|プロフィール|ログイン|ユーザー/i.test(hint)) score += 2;
        if (/広場|フォロー|フォロワー|コミュニティ|チャンネル/i.test(hint)) score -= 2;
        best.set(uid, Math.max(best.get(uid) || 0, score));
      }
    }
    if (best.size === 0) return "";
    return [...best.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  function collectLoggedInViewerProfile(doc, baseHref) {
    const base = String(baseHref || "").trim() || "https://live.nicovideo.jp/";
    const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();
    const roots = [];
    const h = doc.querySelector("header");
    if (h) roots.push(h);
    doc.querySelectorAll('[role="banner"]').forEach((el) => roots.push(el));
    const site = doc.querySelector(
      '[class*="SiteHeader" i], [class*="GlobalHeader" i], [class*="site-header" i], [class*="siteHeader" i], [class*="AccountMenu" i], [class*="account-menu" i], [class*="UserMenu" i]'
    );
    if (site && !roots.includes(site)) roots.push(site);
    const seen = /* @__PURE__ */ new Set();
    const uniqueRoots = roots.filter((r) => {
      if (seen.has(r)) return false;
      seen.add(r);
      return true;
    });
    let viewerAvatarUrl = "";
    for (const root of uniqueRoots) {
      const imgs = root.querySelectorAll("img");
      for (const img of imgs) {
        const u = absoluteNicoUserIconFromImg(
          /** @type {HTMLImageElement} */
          img,
          base
        );
        if (u) {
          viewerAvatarUrl = u;
          break;
        }
      }
      if (viewerAvatarUrl) break;
    }
    if (!viewerAvatarUrl) {
      const all = [...doc.querySelectorAll("img")];
      all.sort(
        (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top
      );
      for (const img of all) {
        const rect = img.getBoundingClientRect();
        if (rect.top > HEADER_BAND_MAX_TOP) break;
        const u = absoluteNicoUserIconFromImg(
          /** @type {HTMLImageElement} */
          img,
          base
        );
        if (u) {
          viewerAvatarUrl = u;
          break;
        }
      }
    }
    let viewerNickname = "";
    for (const root of uniqueRoots) {
      const nodes = root.querySelectorAll('button[aria-label], a[href*="/user/"]');
      for (const b of nodes) {
        const al = clean(b.getAttribute("aria-label") || "");
        if (al && al.length >= 2 && al.length < 72 && !/^(開く|メニュー|通知|検索|ログアウト|設定|menu|open)/i.test(al)) {
          if (/^P\s*ポイント|^ポイント購入/i.test(al)) continue;
          viewerNickname = al;
          break;
        }
        if (b instanceof HTMLAnchorElement) {
          const href = String(b.getAttribute("href") || "");
          if (/\/user\/\d+/.test(href)) {
            const t = clean(b.textContent || "");
            if (t && t.length < 72 && !/^https?:\/\//i.test(t)) {
              viewerNickname = t;
              break;
            }
          }
        }
      }
      if (viewerNickname) break;
    }
    const viewerUserId = pickViewerUserIdFromRoots(uniqueRoots);
    return { viewerAvatarUrl, viewerNickname, viewerUserId };
  }

  // src/lib/commentHarvest.js
  function findNicoCommentPanel(root = document) {
    if (!root || root.nodeType !== 9 && root.nodeType !== 1) return null;
    const doc = root.nodeType === 9 ? (
      /** @type {Document} */
      root
    ) : root.ownerDocument || document;
    const base = root.nodeType === 9 ? doc.documentElement : (
      /** @type {Element} */
      root
    );
    try {
      return doc.querySelector(".ga-ns-comment-panel") || doc.querySelector(".comment-panel") || base.querySelector?.(".ga-ns-comment-panel") || base.querySelector?.(".comment-panel") || null;
    } catch {
      return null;
    }
  }
  function findLargestVerticalScrollHost(el) {
    if (!el || el.nodeType !== 1) return null;
    let best = null;
    let bestDelta = 0;
    const doc = el.ownerDocument || document;
    const win = doc.defaultView;
    if (!win) return null;
    const walk = (node) => {
      if (node.nodeType !== 1) return;
      const st = win.getComputedStyle(node);
      const oy = st.overflowY;
      const ox = st.overflow;
      const scrollable = oy === "auto" || oy === "scroll" || oy === "overlay" || ox === "auto" || ox === "scroll";
      const delta = node.scrollHeight - node.clientHeight;
      const inlineY = String(node.getAttribute("style") || "").includes("overflow");
      if (delta > bestDelta + 8 && (scrollable || inlineY)) {
        bestDelta = delta;
        best = node;
      }
      for (const c of node.children) walk(c);
    };
    walk(el);
    return best;
  }
  function findCommentListScrollHost(doc = document) {
    const panel = findNicoCommentPanel(doc);
    if (!panel) return null;
    try {
      const byRole = panel.querySelector('.body[role="rowgroup"]');
      if (byRole && byRole.scrollHeight > byRole.clientHeight + 5) return byRole;
      const byClass = panel.querySelector(".body");
      if (byClass && byClass.scrollHeight > byClass.clientHeight + 5) return byClass;
    } catch {
    }
    return findLargestVerticalScrollHost(panel);
  }
  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function raf(doc) {
    const win = doc.defaultView;
    if (!win?.requestAnimationFrame) return Promise.resolve();
    return new Promise((r) => win.requestAnimationFrame(() => r()));
  }
  async function harvestVirtualCommentList(opts) {
    const doc = opts.document || document;
    const extract = opts.extractCommentsFromNode;
    const waitMs = opts.waitMs ?? 50;
    const panel = findNicoCommentPanel(doc);
    const scanRoot = panel || doc.body;
    if (!extract) return [];
    const mergeInto = (map, rows) => {
      for (const row of rows) {
        const no = String(row.commentNo ?? "").trim();
        const text = String(row.text ?? "").trim();
        if (!text) continue;
        const k = no ? `${no}	${text}` : text;
        map.set(k, row);
      }
    };
    const host = panel ? findCommentListScrollHost(doc) : null;
    if (!host || host.scrollHeight <= host.clientHeight + 10) {
      const m = /* @__PURE__ */ new Map();
      mergeInto(m, extract(scanRoot));
      return [...m.values()];
    }
    const out = /* @__PURE__ */ new Map();
    const saved = host.scrollTop;
    const max = Math.max(0, host.scrollHeight - host.clientHeight);
    const step = Math.max(64, Math.floor(host.clientHeight * 0.72));
    host.scrollTop = 0;
    await raf(doc);
    await delay(waitMs);
    mergeInto(out, extract(scanRoot));
    for (let y = 0; y <= max; y += step) {
      host.scrollTop = Math.min(y, max);
      await raf(doc);
      await delay(waitMs);
      mergeInto(out, extract(scanRoot));
    }
    host.scrollTop = max;
    await raf(doc);
    await delay(waitMs);
    mergeInto(out, extract(scanRoot));
    host.scrollTop = saved;
    await raf(doc);
    await delay(30);
    return [...out.values()];
  }

  // src/lib/observerTarget.js
  function pickCommentMutationObserverRoot(doc) {
    if (!doc || doc.nodeType !== 9) {
      throw new TypeError("pickCommentMutationObserverRoot expects a Document");
    }
    const panel = findNicoCommentPanel(doc);
    if (panel && panel.nodeType === 1) return panel;
    const el = doc.documentElement;
    if (!el) throw new Error("pickCommentMutationObserverRoot: missing documentElement");
    return el;
  }

  // src/lib/watchContext.js
  function normalizeLiveId(previousLiveId) {
    if (previousLiveId == null) return null;
    const s = String(previousLiveId).trim().toLowerCase();
    return s || null;
  }
  function resolveWatchPageContext(href, previousLiveId) {
    const isWatchPage = isNicoLiveWatchUrl(href);
    const liveId2 = isWatchPage ? extractLiveIdFromUrl(href) : null;
    const prev = normalizeLiveId(previousLiveId);
    const liveIdChanged = prev !== liveId2;
    return { liveId: liveId2, isWatchPage, liveIdChanged };
  }

  // src/lib/storageErrorState.js
  var MESSAGE_MAX = 200;
  function buildStorageWriteErrorPayload(liveId2, err) {
    let message;
    const msg = err !== null && typeof err === "object" && "message" in err && typeof /** @type {{ message?: unknown }} */
    err.message === "string" ? (
      /** @type {{ message: string }} */
      err.message
    ) : void 0;
    if (msg !== void 0) {
      message = String(msg).slice(0, MESSAGE_MAX);
    } else if (typeof err === "string") {
      message = err.slice(0, MESSAGE_MAX);
    }
    const id = liveId2 == null ? null : String(liveId2).trim();
    return {
      at: Date.now(),
      ...id ? { liveId: id } : {},
      ...message ? { message } : {}
    };
  }

  // src/lib/inlinePanelLayout.js
  function isValidBroadcastPlayerRect(rect, viewport) {
    const w = Number(rect.width) || 0;
    const h = Number(rect.height) || 0;
    const top = Number(rect.top) || 0;
    const left = Number(rect.left) || 0;
    const vw = Number(viewport.innerWidth) || 0;
    const vh = Number(viewport.innerHeight) || 0;
    if (w < 280 || h < 150) return false;
    if (top > vh - 80 || left > vw - 80) return false;
    const aspect = w / Math.max(h, 1);
    if (aspect < 1.02 || aspect > 3.2) return false;
    return true;
  }
  function selectBestPlayerRectIndex(rects, viewport) {
    let bestIdx = -1;
    let bestArea = -1;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (!isValidBroadcastPlayerRect(r, viewport)) continue;
      const area = r.width * r.height;
      if (area > bestArea) {
        bestArea = area;
        bestIdx = i;
      }
    }
    return bestIdx;
  }
  var DEFAULT_MIN_PANEL_WIDTH = 320;
  var DEFAULT_EDGE_MARGIN = 12;
  function computeInlinePanelSizeAndOffset(videoRect, parentRect, viewport, opts = {}) {
    const minWidth = opts.minWidth ?? DEFAULT_MIN_PANEL_WIDTH;
    const edgeMargin = opts.edgeMargin ?? DEFAULT_EDGE_MARGIN;
    const vw = Number(viewport.innerWidth) || 0;
    const vLeft = Number(videoRect.left) || 0;
    const vWidth = Number(videoRect.width) || 0;
    let panelWidthPx = Math.max(minWidth, Math.round(vWidth));
    const maxByViewport = Math.max(minWidth, Math.floor(vw - vLeft - edgeMargin));
    panelWidthPx = Math.min(panelWidthPx, maxByViewport);
    let marginLeftPx = 0;
    if (parentRect) {
      marginLeftPx = Math.max(
        0,
        Math.round(vLeft - (Number(parentRect.left) || 0))
      );
    }
    return { panelWidthPx, marginLeftPx };
  }
  function computeInlinePanelLayout(mode, args) {
    const m = mode === "video" ? "video" : "player_row";
    const {
      videoRect,
      rowRect,
      parentRect,
      viewport,
      minWidth,
      edgeMargin
    } = args;
    const opts = { minWidth, edgeMargin };
    if (m === "video") {
      return computeInlinePanelSizeAndOffset(videoRect, parentRect, viewport, opts);
    }
    if (rowRect == null) {
      return computeInlinePanelSizeAndOffset(videoRect, parentRect, viewport, opts);
    }
    const minW = minWidth ?? DEFAULT_MIN_PANEL_WIDTH;
    const em = edgeMargin ?? DEFAULT_EDGE_MARGIN;
    const vw = Number(viewport.innerWidth) || 0;
    const rLeft = Number(rowRect.left) || 0;
    const rWidth = Number(rowRect.width) || 0;
    let panelWidthPx = Math.max(minW, Math.round(rWidth));
    const maxByViewport = Math.max(minW, Math.floor(vw - rLeft - em));
    panelWidthPx = Math.min(panelWidthPx, maxByViewport);
    let marginLeftPx = 0;
    if (parentRect) {
      marginLeftPx = Math.max(
        0,
        Math.round(rLeft - (Number(parentRect.left) || 0))
      );
    }
    return { panelWidthPx, marginLeftPx };
  }

  // src/lib/voiceComment.js
  var VOICE_COMMENT_MAX_CHARS = 250;
  function isVoiceCommentSupported() {
    if (typeof window === "undefined") return false;
    const C = window.SpeechRecognition || window.webkitSpeechRecognition;
    return typeof C === "function";
  }
  function applyRecognitionResult(sessionBase, sessionFinalsSoFar, e) {
    let finals = sessionFinalsSoFar;
    let interim = "";
    const { results } = e;
    for (let i = e.resultIndex; i < results.length; i++) {
      const seg = typeof results.item === "function" ? results.item(i) : (
        /** @type {SpeechRecognitionResult} */
        results[i]
      );
      if (!seg) continue;
      const alt = seg[0];
      const t = alt?.transcript ?? "";
      if (seg.isFinal) finals += t;
      else interim += t;
    }
    const display = (sessionBase + finals + interim).trim().slice(0, VOICE_COMMENT_MAX_CHARS);
    return { sessionFinals: finals, display };
  }

  // src/lib/voiceInputDevices.js
  function audioConstraintsForDevice(deviceId) {
    const id = String(deviceId || "").trim();
    if (!id) {
      return { audio: true };
    }
    return { audio: { deviceId: { ideal: id } } };
  }

  // src/lib/pollUntil.js
  async function pollUntil(fn, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? 4e3;
    const intervalMs = opts.intervalMs ?? 100;
    const start2 = Date.now();
    while (Date.now() - start2 < timeoutMs) {
      const v = fn();
      if (v) return v;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return null;
  }

  // src/extension/content-entry.js
  var DEBOUNCE_MS = 400;
  var LIVE_POLL_MS = 4e3;
  var LIVE_PANEL_SCAN_MS = 2e3;
  var DEEP_HARVEST_DELAY_MS = 1200;
  var BOOTSTRAP_DELAYS_MS = [400, 2e3, 4500];
  var SNAPSHOT_LINK_RELS = /* @__PURE__ */ new Set([
    "alternate",
    "icon",
    "shortcut icon",
    "preload",
    "stylesheet"
  ]);
  var recording = false;
  var liveId = null;
  var pendingRoots = /* @__PURE__ */ new Set();
  var flushTimer = null;
  var mutationObserver = null;
  var observedMutationRoot = null;
  var harvestRunning = false;
  var scrollHooked = /* @__PURE__ */ new WeakMap();
  var thumbAuto = false;
  var thumbIntervalMs = 0;
  var thumbTimerId = null;
  var nlsVoiceRec = null;
  var nlsVoiceSessionBase = "";
  var nlsVoiceSessionFinals = "";
  var nlsVoiceLastDisplay = "";
  var nlsVoiceUserWantsListen = false;
  var nlsVoiceMeterRaf = null;
  var nlsVoiceMeterStream = null;
  var nlsVoiceMeterCtx = null;
  var nlsVoiceMeterSmoothed = 0;
  var nlsVoiceMeterLastSent = 0;
  function nlsVoiceNotifyPopup(payload) {
    if (!hasExtensionContext()) return;
    chrome.runtime.sendMessage({ type: "NLS_VOICE_TO_POPUP", ...payload }).catch(() => {
    });
  }
  function nlsVoiceStopMeter() {
    if (nlsVoiceMeterRaf != null) {
      cancelAnimationFrame(nlsVoiceMeterRaf);
      nlsVoiceMeterRaf = null;
    }
    if (nlsVoiceMeterStream) {
      nlsVoiceMeterStream.getTracks().forEach((t) => t.stop());
      nlsVoiceMeterStream = null;
    }
    if (nlsVoiceMeterCtx) {
      nlsVoiceMeterCtx.close().catch(() => {
      });
      nlsVoiceMeterCtx = null;
    }
    nlsVoiceMeterSmoothed = 0;
    nlsVoiceNotifyPopup({ level: 0 });
  }
  async function nlsVoiceStartMeter(deviceId) {
    nlsVoiceStopMeter();
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(
        audioConstraintsForDevice(deviceId)
      );
    } catch {
      return;
    }
    nlsVoiceMeterStream = stream;
    const AC = window.AudioContext || /** @type {typeof window & { webkitAudioContext?: typeof AudioContext }} */
    window.webkitAudioContext;
    if (typeof AC !== "function") {
      nlsVoiceStopMeter();
      return;
    }
    let ctx;
    try {
      ctx = new AC();
    } catch {
      nlsVoiceStopMeter();
      return;
    }
    nlsVoiceMeterCtx = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.55;
    src.connect(analyser);
    const timeBuf = new Uint8Array(analyser.fftSize);
    nlsVoiceMeterLastSent = 0;
    const tick = () => {
      if (!nlsVoiceMeterStream) return;
      nlsVoiceMeterRaf = requestAnimationFrame(tick);
      analyser.getByteTimeDomainData(timeBuf);
      let sum = 0;
      for (let i = 0; i < timeBuf.length; i++) {
        const v = (timeBuf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / timeBuf.length);
      const instant = Math.min(1, rms * 4.2);
      nlsVoiceMeterSmoothed = nlsVoiceMeterSmoothed * 0.72 + instant * 0.28;
      const now = Date.now();
      if (now - nlsVoiceMeterLastSent >= 48) {
        nlsVoiceMeterLastSent = now;
        nlsVoiceNotifyPopup({ level: nlsVoiceMeterSmoothed });
      }
    };
    nlsVoiceMeterRaf = requestAnimationFrame(tick);
  }
  function nlsVoiceForceStop() {
    nlsVoiceUserWantsListen = false;
    nlsVoiceStopMeter();
    const r = nlsVoiceRec;
    nlsVoiceRec = null;
    if (!r) return;
    try {
      r.stop();
    } catch {
    }
  }
  async function nlsVoiceToggleOnPage(sessionBase, deviceId) {
    if (!isNicoLiveWatchUrl(window.location.href)) {
      return { ok: false, error: "watch\u30DA\u30FC\u30B8\u4EE5\u5916\u3067\u306F\u97F3\u58F0\u5165\u529B\u3067\u304D\u307E\u305B\u3093\u3002" };
    }
    if (nlsVoiceRec) {
      nlsVoiceForceStop();
      return { ok: true, listening: false };
    }
    if (!isVoiceCommentSupported()) {
      return { ok: false, error: "\u3053\u306E\u30D6\u30E9\u30A6\u30B6\u3067\u306F\u97F3\u58F0\u5165\u529B\u306B\u5BFE\u5FDC\u3057\u3066\u3044\u307E\u305B\u3093\u3002" };
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (typeof SR !== "function") {
      return { ok: false, error: "\u97F3\u58F0\u8A8D\u8B58API\u3092\u5229\u7528\u3067\u304D\u307E\u305B\u3093\u3002" };
    }
    const id = String(deviceId || "").trim();
    nlsVoiceSessionBase = String(sessionBase || "");
    nlsVoiceSessionFinals = "";
    nlsVoiceLastDisplay = nlsVoiceSessionBase.trim().slice(0, VOICE_COMMENT_MAX_CHARS);
    nlsVoiceUserWantsListen = true;
    const rec = new SR();
    nlsVoiceRec = rec;
    rec.lang = "ja-JP";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const applied = applyRecognitionResult(
        nlsVoiceSessionBase,
        nlsVoiceSessionFinals,
        e
      );
      nlsVoiceSessionFinals = applied.sessionFinals;
      nlsVoiceLastDisplay = applied.display;
      nlsVoiceNotifyPopup({ partial: applied.display });
    };
    rec.onerror = (ev) => {
      const code = ev.error || "";
      if (code === "aborted") {
        nlsVoiceRec = null;
        return;
      }
      if (code === "no-speech") return;
      nlsVoiceUserWantsListen = false;
      nlsVoiceRec = null;
      nlsVoiceStopMeter();
      nlsVoiceNotifyPopup({
        error: true,
        code,
        message: code === "not-allowed" ? "\u30DE\u30A4\u30AF\u304C\u62D2\u5426\u3055\u308C\u307E\u3057\u305F\u3002\u30BF\u30D6\u306E\u9375\u30A2\u30A4\u30B3\u30F3\u304B\u3089\u30DE\u30A4\u30AF\u3092\u8A31\u53EF\u3057\u3066\u304F\u3060\u3055\u3044\u3002" : `\u97F3\u58F0\u30A8\u30E9\u30FC: ${code}`
      });
    };
    rec.onend = () => {
      const sameSession = nlsVoiceRec === rec;
      if (sameSession) {
        nlsVoiceRec = null;
      }
      if (nlsVoiceUserWantsListen) {
        nlsVoiceRec = rec;
        window.setTimeout(() => {
          if (!nlsVoiceUserWantsListen || nlsVoiceRec !== rec) return;
          try {
            rec.start();
          } catch {
            nlsVoiceUserWantsListen = false;
            nlsVoiceRec = null;
            nlsVoiceStopMeter();
            nlsVoiceNotifyPopup({
              done: true,
              text: nlsVoiceLastDisplay
            });
          }
        }, 0);
        return;
      }
      nlsVoiceStopMeter();
      nlsVoiceNotifyPopup({
        done: true,
        text: nlsVoiceLastDisplay
      });
    };
    try {
      rec.start();
      void nlsVoiceStartMeter(id);
      return { ok: true, listening: true };
    } catch {
      nlsVoiceUserWantsListen = false;
      nlsVoiceRec = null;
      nlsVoiceStopMeter();
      return { ok: false, error: "\u97F3\u58F0\u5165\u529B\u3092\u958B\u59CB\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002" };
    }
  }
  async function nlsVoiceQuickSrProbe(_deviceId) {
    if (!isNicoLiveWatchUrl(window.location.href)) {
      return { ok: false, error: "watch\u30DA\u30FC\u30B8\u3067\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002" };
    }
    if (nlsVoiceRec) {
      return { ok: false, error: "\u97F3\u58F0\u5165\u529B\u4E2D\u306F\u4F7F\u3048\u307E\u305B\u3093\u3002\u5148\u306B\u505C\u6B62\u3057\u3066\u304F\u3060\u3055\u3044\u3002" };
    }
    if (!isVoiceCommentSupported()) {
      return { ok: false, error: "\u3053\u306E\u30D6\u30E9\u30A6\u30B6\u3067\u306F\u97F3\u58F0\u8A8D\u8B58\u306B\u5BFE\u5FDC\u3057\u3066\u3044\u307E\u305B\u3093\u3002" };
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (typeof SR !== "function") {
      return { ok: false, error: "\u97F3\u58F0\u8A8D\u8B58API\u3092\u5229\u7528\u3067\u304D\u307E\u305B\u3093\u3002" };
    }
    const rec = new SR();
    rec.lang = "ja-JP";
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    return await new Promise((resolve) => {
      let settled = false;
      const settle = (p) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        try {
          rec.abort();
        } catch {
        }
        resolve(p);
      };
      const timer = window.setTimeout(() => {
        settle({
          ok: false,
          error: "\u6642\u9593\u5185\u306B\u8A8D\u8B58\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u30DE\u30A4\u30AF\u306B\u5411\u304B\u3063\u3066\u77ED\u304F\u8A71\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
        });
      }, 5e3);
      rec.onresult = (e) => {
        const text = String(e.results[0]?.[0]?.transcript || "").trim();
        settle(
          text ? { ok: true, text } : { ok: false, error: "\u8A8D\u8B58\u7D50\u679C\u304C\u7A7A\u3067\u3057\u305F\u3002\u3082\u3046\u4E00\u5EA6\u8A66\u3057\u3066\u304F\u3060\u3055\u3044\u3002" }
        );
      };
      rec.onerror = (ev) => {
        const code = ev.error || "";
        if (code === "aborted") return;
        if (code === "no-speech") {
          settle({ ok: false, error: "\u58F0\u304C\u691C\u51FA\u3055\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002" });
          return;
        }
        settle({
          ok: false,
          error: code === "not-allowed" ? "\u30DE\u30A4\u30AF\u304C\u62D2\u5426\u3055\u308C\u3066\u3044\u307E\u3059\u3002\u30BF\u30D6\u306E\u9375\u30A2\u30A4\u30B3\u30F3\u304B\u3089\u8A31\u53EF\u3057\u3066\u304F\u3060\u3055\u3044\u3002" : `\u8A8D\u8B58\u30A8\u30E9\u30FC: ${code}`
        });
      };
      rec.onend = () => {
        if (!settled) {
          settle({ ok: false, error: "\u8A8D\u8B58\u304C\u7D42\u4E86\u3057\u307E\u3057\u305F\u304C\u3001\u6587\u304C\u5F97\u3089\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002" });
        }
      };
      try {
        rec.start();
      } catch {
        window.clearTimeout(timer);
        if (!settled) {
          settled = true;
          resolve({ ok: false, error: "\u30C6\u30B9\u30C8\u3092\u958B\u59CB\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002" });
        }
      }
    });
  }
  globalThis.__NLS_VOICE_TOGGLE__ = nlsVoiceToggleOnPage;
  globalThis.__NLS_VOICE_STOP__ = nlsVoiceForceStop;
  globalThis.__NLS_VOICE_PROBE_SR__ = nlsVoiceQuickSrProbe;
  window.addEventListener("pagehide", () => {
    nlsVoiceForceStop();
  });
  var interceptedUsers = /* @__PURE__ */ new Map();
  var interceptedNicknames = /* @__PURE__ */ new Map();
  var INTERCEPT_MAP_MAX = 8e3;
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    if (!e.data || e.data.type !== "NLS_INTERCEPT_USERID") return;
    const entries = e.data.entries;
    if (!Array.isArray(entries)) return;
    for (const { no, uid, name } of entries) {
      if (!no || !uid) continue;
      const sNo = String(no);
      const sUid = String(uid);
      const sName = String(name || "").trim();
      interceptedUsers.set(sNo, { uid: sUid, name: sName });
      if (sName) interceptedNicknames.set(sUid, sName);
    }
    if (interceptedUsers.size > INTERCEPT_MAP_MAX) {
      const excess = interceptedUsers.size - INTERCEPT_MAP_MAX;
      const iter = interceptedUsers.keys();
      for (let i = 0; i < excess; i++) {
        const key = iter.next().value;
        if (key != null) interceptedUsers.delete(key);
      }
    }
  });
  var lastWatchUrlTimer = null;
  var PAGE_FRAME_STYLE_ID = "nls-watch-prikura-style";
  var PAGE_FRAME_OVERLAY_ID = "nls-watch-prikura-frame";
  var INLINE_POPUP_HOST_ID = "nls-inline-popup-host";
  var INLINE_POPUP_IFRAME_ID = "nls-inline-popup-iframe";
  var PAGE_FRAME_LOOP_MS = 360;
  var DEFAULT_PAGE_FRAME = "light";
  var LEGACY_PAGE_FRAME_ALIAS = {
    trio: "light",
    rink: "light",
    konta: "sunset",
    tanunee: "midnight"
  };
  var DEFAULT_PAGE_FRAME_CUSTOM = Object.freeze({
    headerStart: "#0f8fd8",
    headerEnd: "#14b8a6",
    accent: "#0f8fd8"
  });
  var PAGE_FRAME_PRESETS = {
    light: {
      headerStart: "#0f8fd8",
      headerEnd: "#14b8a6",
      accent: "#0f8fd8"
    },
    dark: {
      headerStart: "#1e293b",
      headerEnd: "#334155",
      accent: "#60a5fa"
    },
    midnight: {
      headerStart: "#1e1b4b",
      headerEnd: "#1d4ed8",
      accent: "#7dd3fc"
    },
    sunset: {
      headerStart: "#fb923c",
      headerEnd: "#f43f5e",
      accent: "#ea580c"
    }
  };
  var pageFrameState = {
    frameId: DEFAULT_PAGE_FRAME,
    custom: { ...DEFAULT_PAGE_FRAME_CUSTOM }
  };
  var pageFrameLoopTimer = null;
  function hasPageFramePreset(id) {
    return Object.prototype.hasOwnProperty.call(PAGE_FRAME_PRESETS, id);
  }
  function normalizePageFrameId(raw) {
    const id = String(raw || "").trim().toLowerCase();
    if (!id) return "";
    return LEGACY_PAGE_FRAME_ALIAS[
      /** @type {keyof typeof LEGACY_PAGE_FRAME_ALIAS} */
      id
    ] || id;
  }
  function normalizeHexColor(value, fallback) {
    const s = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : fallback;
  }
  function darkenHexColor(hex, ratio) {
    const source = normalizeHexColor(hex, "#0f8fd8").slice(1);
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
    const r = clamp(parseInt(source.slice(0, 2), 16) * (1 - ratio));
    const g = clamp(parseInt(source.slice(2, 4), 16) * (1 - ratio));
    const b = clamp(parseInt(source.slice(4, 6), 16) * (1 - ratio));
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }
  function sanitizePageFrameCustom(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    return {
      headerStart: normalizeHexColor(
        /** @type {{ headerStart?: unknown }} */
        source.headerStart,
        DEFAULT_PAGE_FRAME_CUSTOM.headerStart
      ),
      headerEnd: normalizeHexColor(
        /** @type {{ headerEnd?: unknown }} */
        source.headerEnd,
        DEFAULT_PAGE_FRAME_CUSTOM.headerEnd
      ),
      accent: normalizeHexColor(
        /** @type {{ accent?: unknown }} */
        source.accent,
        DEFAULT_PAGE_FRAME_CUSTOM.accent
      )
    };
  }
  function resolvePageFramePalette(frameId, custom) {
    const normalized = normalizePageFrameId(frameId);
    if (normalized === "custom") {
      const safe = sanitizePageFrameCustom(custom);
      return {
        headerStart: safe.headerStart,
        headerEnd: safe.headerEnd,
        accent: safe.accent,
        accentDeep: darkenHexColor(safe.accent, 0.22)
      };
    }
    const preset = hasPageFramePreset(normalized) ? PAGE_FRAME_PRESETS[
      /** @type {keyof typeof PAGE_FRAME_PRESETS} */
      normalized
    ] : PAGE_FRAME_PRESETS[DEFAULT_PAGE_FRAME];
    return {
      headerStart: preset.headerStart,
      headerEnd: preset.headerEnd,
      accent: preset.accent,
      accentDeep: darkenHexColor(preset.accent, 0.22)
    };
  }
  function ensurePageFrameStyle() {
    if (document.getElementById(PAGE_FRAME_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = PAGE_FRAME_STYLE_ID;
    style.textContent = `
    #${PAGE_FRAME_OVERLAY_ID} {
      --nls-frame-start: #0f8fd8;
      --nls-frame-end: #14b8a6;
      --nls-frame-accent: #0f8fd8;
      --nls-frame-accent-deep: #0b73ad;
    }
    #${PAGE_FRAME_OVERLAY_ID} {
      position: fixed;
      inset: 0 auto auto 0;
      width: 0;
      height: 0;
      pointer-events: none;
      z-index: 2147483000;
      display: none;
    }
    #${PAGE_FRAME_OVERLAY_ID} .nls-frame-outline {
      position: absolute;
      inset: 0;
      border-radius: 18px;
      border: 3px solid var(--nls-frame-accent);
      box-shadow:
        0 0 0 1px rgb(255 255 255 / 72%),
        0 14px 28px rgb(2 6 23 / 30%),
        inset 0 0 0 2px rgb(255 255 255 / 45%);
      background:
        linear-gradient(138deg, rgb(255 255 255 / 10%), transparent 34%) border-box,
        linear-gradient(145deg, rgb(15 23 42 / 4%), transparent 70%) border-box;
    }
    #${INLINE_POPUP_HOST_ID} {
      display: none;
      width: 100%;
      margin: 2px 0 2px;
      pointer-events: auto;
      position: relative;
      z-index: 2147482000;
      border: none !important;
      outline: none !important;
      box-shadow: none !important;
    }
    #${INLINE_POPUP_HOST_ID}:focus,
    #${INLINE_POPUP_HOST_ID}:focus-within {
      outline: none !important;
      box-shadow: none !important;
    }
    #${INLINE_POPUP_HOST_ID} iframe {
      width: 100%;
      height: 820px;
      border: none !important;
      border-radius: 0;
      box-shadow: none !important;
      outline: none !important;
      pointer-events: auto;
      background: transparent;
      display: block;
    }
    #${INLINE_POPUP_HOST_ID} iframe:focus,
    #${INLINE_POPUP_HOST_ID} iframe:focus-visible {
      outline: none !important;
      box-shadow: none !important;
    }
  `;
    document.head.appendChild(style);
  }
  function ensurePageFrameOverlay() {
    let overlay = document.getElementById(PAGE_FRAME_OVERLAY_ID);
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = PAGE_FRAME_OVERLAY_ID;
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `<div class="nls-frame-outline"></div>`;
    document.documentElement.appendChild(overlay);
    return overlay;
  }
  function ensureInlinePopupHost() {
    let host = document.getElementById(INLINE_POPUP_HOST_ID);
    if (host) return host;
    host = document.createElement("div");
    host.id = INLINE_POPUP_HOST_ID;
    host.setAttribute("aria-hidden", "true");
    host.style.display = "none";
    host.style.pointerEvents = "auto";
    host.style.width = "100%";
    const iframe = document.createElement("iframe");
    iframe.id = INLINE_POPUP_IFRAME_ID;
    iframe.setAttribute("title", "nicolivelog inline panel");
    iframe.setAttribute("allow", "microphone");
    iframe.style.pointerEvents = "auto";
    try {
      iframe.src = chrome.runtime.getURL("popup.html") + "?inline=1";
    } catch {
    }
    host.appendChild(iframe);
    return host;
  }
  function findFrameInsertAnchorFromVideo(base) {
    if (!(base instanceof HTMLElement)) return base;
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    let best = null;
    let cur = base;
    for (let i = 0; i < 8 && cur; i++) {
      if (cur === document.body || cur === document.documentElement) break;
      if (cur.querySelector?.(`#${INLINE_POPUP_HOST_ID}`)) {
        cur = cur.parentElement;
        continue;
      }
      const rect = cur.getBoundingClientRect();
      const area = rect.width * rect.height;
      const aspect = rect.width / Math.max(rect.height, 1);
      if (rect.width >= 260 && rect.height >= 140 && area <= viewportArea * 0.92 && aspect >= 1 && aspect <= 3.4) {
        const score = area * (1.25 - Math.min(Math.abs(aspect - 1.78), 1.1) * 0.2);
        if (!best || score > best.score) best = { el: cur, score };
      }
      cur = cur.parentElement;
    }
    return best?.el || base;
  }
  function unionViewRects(a, b) {
    const right = Math.max(a.left + a.width, b.left + b.width);
    const bottom = Math.max(a.top + a.height, b.top + b.height);
    const left = Math.min(a.left, b.left);
    const top = Math.min(a.top, b.top);
    return { left, top, width: right - left, height: bottom - top };
  }
  function resolvePlayerRowRect(video, insertAfter) {
    const vr = video.getBoundingClientRect();
    let best = {
      left: vr.left,
      top: vr.top,
      width: vr.width,
      height: vr.height
    };
    const widenWithEl = (el) => {
      if (!(el instanceof HTMLElement)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 64 || r.height < 100) return;
      const b = { left: r.left, top: r.top, width: r.width, height: r.height };
      const u = unionViewRects(best, b);
      if (u.width > best.width * 1.04) best = u;
    };
    try {
      const panel = findNicoCommentPanel(document);
      if (panel) widenWithEl(panel);
    } catch {
    }
    try {
      document.querySelectorAll('[class*="comment-data-grid" i]').forEach((n) => widenWithEl(n));
    } catch {
    }
    const ar = insertAfter.getBoundingClientRect();
    if (ar.width >= vr.width * 1.06 && ar.width >= best.width * 0.95) {
      best = {
        left: ar.left,
        top: ar.top,
        width: ar.width,
        height: ar.height
      };
    }
    return best;
  }
  var inlinePanelWidthMode = normalizeInlinePanelWidthMode(void 0);
  function renderInlineHostAnchoredToVideo(video) {
    const insertAfter = findFrameInsertAnchorFromVideo(video);
    const parent = insertAfter.parentElement;
    if (!parent) return;
    const host = ensureInlinePopupHost();
    const vr = video.getBoundingClientRect();
    if (vr.width < 260 || vr.height < 140) {
      host.style.display = "none";
      host.setAttribute("aria-hidden", "true");
      return;
    }
    const pr = parent.getBoundingClientRect();
    const viewport = nlsViewportSize();
    const mode = inlinePanelWidthMode === "video" ? "video" : "player_row";
    const rowRect = mode === "player_row" ? resolvePlayerRowRect(video, insertAfter) : null;
    const { panelWidthPx, marginLeftPx } = computeInlinePanelLayout(mode, {
      videoRect: {
        width: vr.width,
        height: vr.height,
        top: vr.top,
        left: vr.left
      },
      rowRect,
      parentRect: {
        width: pr.width,
        height: pr.height,
        top: pr.top,
        left: pr.left
      },
      viewport
    });
    const insertNext = insertAfter.nextSibling;
    const needsMove = host.parentElement !== parent || host.previousSibling !== insertAfter;
    if (needsMove) {
      if (insertNext) parent.insertBefore(host, insertNext);
      else parent.appendChild(host);
    }
    host.style.boxSizing = "border-box";
    host.style.marginLeft = `${marginLeftPx}px`;
    host.style.maxWidth = "100%";
    host.style.width = `${panelWidthPx}px`;
    const iframe = (
      /** @type {HTMLIFrameElement|null} */
      host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
    );
    if (iframe) iframe.style.width = `${panelWidthPx}px`;
    host.style.pointerEvents = "auto";
    host.setAttribute("aria-hidden", "false");
    host.style.display = "block";
  }
  function renderInlinePopupHost(target) {
    if (target instanceof HTMLVideoElement) {
      renderInlineHostAnchoredToVideo(target);
      return;
    }
    const parent = target.parentElement;
    if (!parent) return;
    const host = ensureInlinePopupHost();
    host.style.marginLeft = "";
    host.style.maxWidth = "";
    const currentRect = target.getBoundingClientRect();
    if (currentRect.width < 260 || currentRect.height < 140) {
      host.style.display = "none";
      host.setAttribute("aria-hidden", "true");
      return;
    }
    if (host.parentElement !== parent || host.previousSibling !== target) {
      const next = target.nextSibling;
      if (next) parent.insertBefore(host, next);
      else parent.appendChild(host);
    }
    const panelWidth = Math.max(320, Math.round(currentRect.width));
    const iframe = (
      /** @type {HTMLIFrameElement|null} */
      host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
    );
    if (iframe) iframe.style.width = `${panelWidth}px`;
    host.style.width = `${panelWidth}px`;
    host.style.pointerEvents = "auto";
    host.setAttribute("aria-hidden", "false");
    host.style.display = "block";
  }
  function hidePageFrameOverlay() {
    const overlay = document.getElementById(PAGE_FRAME_OVERLAY_ID);
    if (overlay) overlay.style.display = "none";
    const host = document.getElementById(INLINE_POPUP_HOST_ID);
    if (host) {
      host.style.display = "none";
      host.setAttribute("aria-hidden", "true");
    }
    stableFrameTarget = null;
  }
  function applyPageFramePalette(frameId, custom) {
    const overlay = ensurePageFrameOverlay();
    const palette = resolvePageFramePalette(frameId, custom);
    overlay.style.setProperty("--nls-frame-start", palette.headerStart);
    overlay.style.setProperty("--nls-frame-end", palette.headerEnd);
    overlay.style.setProperty("--nls-frame-accent", palette.accent);
    overlay.style.setProperty("--nls-frame-accent-deep", palette.accentDeep);
  }
  function isValidFrameTargetElement(el) {
    if (!(el instanceof HTMLElement)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 280 || rect.height < 150) return false;
    if (rect.top > window.innerHeight - 80 || rect.left > window.innerWidth - 80) {
      return false;
    }
    const aspect = rect.width / Math.max(rect.height, 1);
    if (aspect < 1.02 || aspect > 3.2) return false;
    return true;
  }
  var stableFrameTarget = null;
  function nlsViewportSize() {
    return { innerWidth: window.innerWidth, innerHeight: window.innerHeight };
  }
  function pickBestInlinePanelVideo() {
    const viewport = nlsViewportSize();
    const list = Array.from(document.querySelectorAll("video")).filter(
      (v) => v instanceof HTMLVideoElement
    );
    if (!list.length) return null;
    const rects = list.map((v) => {
      const b = v.getBoundingClientRect();
      return { width: b.width, height: b.height, top: b.top, left: b.left };
    });
    const idx = selectBestPlayerRectIndex(rects, viewport);
    if (idx < 0) return null;
    const video = list[idx];
    const st = window.getComputedStyle(video);
    if (st.visibility === "hidden" || st.display === "none") return null;
    return video;
  }
  function findWatchFrameTargetElement() {
    const video = pickBestInlinePanelVideo();
    if (video) {
      stableFrameTarget = video;
      return video;
    }
    if (stableFrameTarget && stableFrameTarget.isConnected && !(stableFrameTarget instanceof HTMLVideoElement) && isValidFrameTargetElement(stableFrameTarget)) {
      return stableFrameTarget;
    }
    const selector = '[data-testid*="player" i], [class*="video-player" i], [class*="VideoPlayer" i], [class*="watch-player" i], [class*="player-container" i]';
    const candidates = Array.from(document.querySelectorAll(selector)).filter((el) => {
      if (el.id === INLINE_POPUP_HOST_ID || el.id === PAGE_FRAME_OVERLAY_ID) return false;
      if (el.querySelector?.(`#${INLINE_POPUP_HOST_ID}`)) return false;
      return isValidFrameTargetElement(el);
    });
    if (!candidates.length) return null;
    let best = (
      /** @type {HTMLElement|null} */
      null
    );
    let bestScore = -1;
    for (const c of candidates) {
      if (!(c instanceof HTMLElement)) continue;
      const rect = c.getBoundingClientRect();
      const area = rect.width * rect.height;
      const aspect = rect.width / Math.max(rect.height, 1);
      const score = area * (1.2 - Math.min(Math.abs(aspect - 1.78), 1.2) * 0.18);
      if (score > bestScore) {
        best = c;
        bestScore = score;
      }
    }
    stableFrameTarget = best;
    return best;
  }
  function renderPageFrameOverlay() {
    if (!isNicoLiveWatchUrl(window.location.href)) {
      hidePageFrameOverlay();
      return;
    }
    const target = findWatchFrameTargetElement();
    if (!target) {
      hidePageFrameOverlay();
      return;
    }
    const rect = target.getBoundingClientRect();
    if (rect.width < 260 || rect.height < 140) {
      hidePageFrameOverlay();
      return;
    }
    const overlay = ensurePageFrameOverlay();
    overlay.style.display = "none";
    renderInlinePopupHost(target);
  }
  async function loadPageFrameSettings() {
    if (!hasExtensionContext()) return;
    const bag = await chrome.storage.local.get([
      KEY_POPUP_FRAME,
      KEY_POPUP_FRAME_CUSTOM,
      KEY_INLINE_PANEL_WIDTH_MODE
    ]);
    inlinePanelWidthMode = normalizeInlinePanelWidthMode(
      bag[KEY_INLINE_PANEL_WIDTH_MODE]
    );
    const rawFrame = normalizePageFrameId(bag[KEY_POPUP_FRAME]);
    pageFrameState.frameId = rawFrame === "custom" || hasPageFramePreset(rawFrame) ? rawFrame : DEFAULT_PAGE_FRAME;
    pageFrameState.custom = sanitizePageFrameCustom(bag[KEY_POPUP_FRAME_CUSTOM]);
    applyPageFramePalette(pageFrameState.frameId, pageFrameState.custom);
    renderPageFrameOverlay();
  }
  function startPageFrameLoop() {
    if (pageFrameLoopTimer) return;
    const tick = () => {
      if (!hasExtensionContext()) return;
      renderPageFrameOverlay();
    };
    pageFrameLoopTimer = setInterval(tick, PAGE_FRAME_LOOP_MS);
    window.addEventListener("scroll", tick, { passive: true });
    window.addEventListener("resize", tick);
    document.addEventListener("visibilitychange", tick);
    tick();
  }
  function hasExtensionContext() {
    try {
      return Boolean(chrome?.runtime?.id);
    } catch {
      return false;
    }
  }
  function isContextInvalidatedError(err) {
    const msg = err && typeof err === "object" && "message" in err ? String(
      /** @type {{ message?: unknown }} */
      err.message || ""
    ) : String(err || "");
    return msg.includes("Extension context invalidated");
  }
  function isVisibleElement(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return el.getClientRects().length > 0;
  }
  function findCommentEditorElement() {
    const selectors = [
      'textarea[placeholder*="\u30B3\u30E1\u30F3\u30C8"]',
      'textarea[aria-label*="\u30B3\u30E1\u30F3\u30C8"]',
      'textarea[name*="comment" i]',
      'input[type="text"][placeholder*="\u30B3\u30E1\u30F3\u30C8"]',
      'input[type="text"][name*="comment" i]',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"][aria-label*="\u30B3\u30E1\u30F3\u30C8"]',
      '[class*="comment-input" i] textarea',
      '[class*="comment-box" i] textarea',
      '[class*="CommentForm" i] textarea',
      '[class*="commentForm" i] textarea',
      '[data-testid*="comment" i] textarea',
      '[data-testid*="Comment" i] textarea'
    ];
    const panels = [
      document.querySelector(".ga-ns-comment-panel"),
      document.querySelector(".comment-panel"),
      document.querySelector('[class*="comment-panel" i]'),
      document.querySelector('[class*="CommentPanel" i]')
    ].filter(Boolean);
    for (const panel of panels) {
      for (const selector of selectors) {
        const list = panel.querySelectorAll(selector);
        for (const node of list) {
          if (!isVisibleElement(node)) continue;
          if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement || node instanceof HTMLElement) {
            return node;
          }
        }
      }
      const loose = panel.querySelectorAll("textarea");
      for (const node of loose) {
        if (!isVisibleElement(node)) continue;
        if (node instanceof HTMLTextAreaElement) return node;
      }
    }
    for (const selector of selectors) {
      const list = document.querySelectorAll(selector);
      for (const node of list) {
        if (!isVisibleElement(node)) continue;
        if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement || node instanceof HTMLElement) {
          return node;
        }
      }
    }
    return null;
  }
  function setEditorText(el, text) {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const proto = Object.getPrototypeOf(el);
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      if (desc?.set) {
        desc.set.call(el, text);
      } else {
        el.value = text;
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      try {
        el.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            cancelable: true,
            inputType: "insertText",
            data: text
          })
        );
      } catch {
      }
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if (el.isContentEditable) {
      el.focus();
      el.textContent = text;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
    }
  }
  function findVisibleEnabledSubmitForEditor(editor) {
    if (!(editor instanceof HTMLElement)) {
      return findCommentSubmitButton(document);
    }
    const form = editor.closest("form");
    const scope = form || editor.closest('[class*="comment" i], [role="group"]') || document;
    const inScope = findCommentSubmitButton(scope);
    if (inScope) return inScope;
    return findCommentSubmitButton(document);
  }
  function findCommentSubmitButton(root) {
    const selectors = [
      'button[type="submit"]',
      'button[aria-label*="\u9001\u4FE1"]',
      'button[aria-label*="\u30B3\u30E1\u30F3\u30C8"]',
      'button[data-testid*="send" i]',
      'button[data-testid*="comment" i]',
      'button[data-testid*="Submit" i]',
      '[role="button"][aria-label*="\u9001\u4FE1"]',
      '[class*="send" i][role="button"]',
      'button[class*="Send" i]',
      'button[class*="submit" i]'
    ];
    for (const selector of selectors) {
      const list = root.querySelectorAll(selector);
      for (const node of list) {
        if (!(node instanceof HTMLElement)) continue;
        if (!isVisibleElement(node)) continue;
        if (node.matches('[disabled],[aria-disabled="true"]')) continue;
        return node;
      }
    }
    return null;
  }
  function trySubmitComment(editor) {
    const form = editor instanceof HTMLElement ? editor.closest("form") : null;
    const scope = form || (editor instanceof HTMLElement ? editor.closest('[class*="comment" i], [role="group"]') : null) || document;
    const btnInScope = findCommentSubmitButton(scope);
    if (btnInScope) {
      btnInScope.click();
      return true;
    }
    const btnGlobal = findCommentSubmitButton(document);
    if (btnGlobal) {
      btnGlobal.click();
      return true;
    }
    if (form && typeof form.requestSubmit === "function") {
      form.requestSubmit();
      return true;
    }
    editor.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true
      })
    );
    editor.dispatchEvent(
      new KeyboardEvent("keyup", {
        key: "Enter",
        code: "Enter",
        bubbles: true
      })
    );
    return true;
  }
  async function postCommentFromContentAsync(rawText) {
    if (!isNicoLiveWatchUrl(window.location.href)) {
      return { ok: false, error: "watch\u30DA\u30FC\u30B8\u4EE5\u5916\u3067\u306F\u6295\u7A3F\u3067\u304D\u307E\u305B\u3093\u3002" };
    }
    const text = String(rawText || "").trim();
    if (!text) {
      return { ok: false, error: "\u30B3\u30E1\u30F3\u30C8\u304C\u7A7A\u3067\u3059\u3002" };
    }
    const editor = await pollUntil(findCommentEditorElement, {
      timeoutMs: 8e3,
      intervalMs: 50
    });
    if (!editor) {
      return {
        ok: false,
        error: "\u30B3\u30E1\u30F3\u30C8\u5165\u529B\u6B04\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002\u30DA\u30FC\u30B8\u306E\u518D\u8AAD\u307F\u8FBC\u307F\u76F4\u5F8C\u306F\u6570\u79D2\u5F85\u3063\u3066\u304B\u3089\u518D\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002"
      };
    }
    try {
      if (editor instanceof HTMLElement) {
        editor.focus();
      }
      setEditorText(editor, text);
      await new Promise((r) => {
        requestAnimationFrame(() => requestAnimationFrame(r));
      });
      await new Promise((r) => setTimeout(r, 220));
      const btn = await pollUntil(() => findVisibleEnabledSubmitForEditor(editor), {
        timeoutMs: 6500,
        intervalMs: 80
      });
      if (btn) {
        btn.click();
        return { ok: true };
      }
      trySubmitComment(editor);
      await new Promise((r) => setTimeout(r, 280));
      const btnLate = findVisibleEnabledSubmitForEditor(editor);
      if (btnLate) {
        btnLate.click();
        return { ok: true };
      }
      trySubmitComment(editor);
      return { ok: true };
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err ? String(
        /** @type {{ message?: unknown }} */
        err.message || "post_failed"
      ) : "post_failed";
      return { ok: false, error: message };
    }
  }
  function collectWatchPageSnapshot() {
    const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();
    const toAbsoluteUrl = (raw) => {
      if (!raw) return "";
      try {
        return new URL(raw, window.location.href).href;
      } catch {
        return raw;
      }
    };
    const metaGet = (map, keys) => {
      for (const key of keys) {
        const hit = map.get(key.toLowerCase());
        if (hit) return hit;
      }
      return "";
    };
    const url = String(window.location.href || "");
    const links = [];
    document.querySelectorAll("link[rel]").forEach((el) => {
      const rel = String(el.getAttribute("rel") || "").toLowerCase().replace(/\s+/g, " ").trim();
      if (!SNAPSHOT_LINK_RELS.has(rel)) return;
      links.push({
        rel,
        href: String(el.getAttribute("href") || ""),
        as: String(el.getAttribute("as") || ""),
        type: String(el.getAttribute("type") || "")
      });
    });
    const metas = [];
    const metaMap = /* @__PURE__ */ new Map();
    document.querySelectorAll("meta").forEach((m) => {
      const key = m.getAttribute("property") || m.getAttribute("name") || m.getAttribute("http-equiv") || m.getAttribute("charset") || "";
      const value = m.getAttribute("content") || m.getAttribute("charset") || "";
      if (!key) return;
      const nKey = String(key);
      const nVal = String(value);
      metas.push({ key: nKey, value: nVal });
      if (!metaMap.has(nKey.toLowerCase()) && nVal) {
        metaMap.set(nKey.toLowerCase(), nVal);
      }
    });
    const scripts = [];
    document.querySelectorAll("script[src]").forEach((s) => {
      scripts.push({
        src: String(s.getAttribute("src") || ""),
        type: String(s.getAttribute("type") || "text/javascript")
      });
    });
    const noopenerLinks = [];
    document.querySelectorAll('a[rel~="noopener"]').forEach((a) => {
      const href = String(a.getAttribute("href") || "");
      const text = clean(a.textContent);
      noopenerLinks.push({ text, href });
    });
    const titleFromDocument = clean(document.title).replace(/\s+-\s+ニコニコ生放送.*$/, "");
    const titleFromMeta = clean(
      metaGet(metaMap, ["og:title", "twitter:title", "title"])
    );
    const h1Text = clean(document.querySelector("h1")?.textContent || "");
    const broadcastTitle = titleFromMeta || h1Text || titleFromDocument;
    const streamLink = Array.from(
      document.querySelectorAll('a[href*="/user/"]')
    ).find((a) => {
      const href = String(a.getAttribute("href") || "");
      const text = clean(a.textContent);
      return /\/user\/\d+/.test(href) && /\/live_programs(?:\?|$)/.test(href) && text && !/^https?:\/\//i.test(text);
    });
    const broadcasterNameFromMeta = clean(
      metaGet(metaMap, ["author", "twitter:creator", "profile:username"])
    );
    const broadcasterNameFromDom = clean(streamLink?.textContent || "") || clean(
      document.querySelector('[class*="userName"], [class*="streamerName"]')?.textContent || ""
    );
    const broadcasterName = broadcasterNameFromDom || broadcasterNameFromMeta;
    const thumbnailUrl = toAbsoluteUrl(
      clean(metaGet(metaMap, ["og:image", "twitter:image"]))
    );
    const tags = /* @__PURE__ */ new Set();
    const addTag = (t) => {
      const s = clean(t).replace(/^#/, "");
      if (!s || s.length > 80) return;
      tags.add(s);
    };
    clean(metaGet(metaMap, ["keywords"])).split(/[,、]/).forEach((v) => addTag(v));
    document.querySelectorAll('a[href*="dic.nicovideo.jp/a/"], a[href*="dic.nicovideo.jp/l/"]').forEach((a) => addTag(a.textContent));
    const startAtText = (() => {
      const fromMeta = clean(metaGet(metaMap, ["og:description", "twitter:description"]));
      const m = clean(document.title).match(
        /(\d{4}\/\d{1,2}\/\d{1,2}\([^)]*\)\s+\d{1,2}:\d{2}開始)/
      );
      return clean(m?.[1] || fromMeta);
    })();
    const viewer = collectLoggedInViewerProfile(document, url);
    return {
      title: String(document.title || ""),
      url,
      liveId,
      broadcastTitle,
      broadcasterName,
      thumbnailUrl,
      tags: Array.from(tags),
      startAtText,
      links,
      metas,
      scripts,
      noopenerLinks,
      viewerAvatarUrl: viewer.viewerAvatarUrl,
      viewerNickname: viewer.viewerNickname,
      viewerUserId: viewer.viewerUserId
    };
  }
  function isWatchPageMainFrameForMessages() {
    try {
      return window.self === window.top;
    } catch {
      return true;
    }
  }
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!hasExtensionContext()) return;
    if (!msg || typeof msg !== "object" || !("type" in msg)) return;
    if (msg.type === "NLS_CAPTURE_SCREENSHOT") {
      if (!isWatchPageMainFrameForMessages()) return;
      void (async () => {
        try {
          if (!isNicoLiveWatchUrl(window.location.href)) {
            sendResponse({ ok: false, errorCode: "not_watch" });
            return;
          }
          const video = pickLargestVisibleVideo(document);
          if (!video) {
            sendResponse({ ok: false, errorCode: "no_video" });
            return;
          }
          const cap = await captureVideoToPngDataUrl(video);
          if (cap.ok === false) {
            sendResponse({ ok: false, errorCode: cap.errorCode });
            return;
          }
          sendResponse({
            ok: true,
            mime: cap.mime,
            dataUrl: cap.dataUrl,
            liveId: liveId || ""
          });
        } catch {
          sendResponse({ ok: false, errorCode: "capture_failed" });
        }
      })();
      return true;
    }
    if (msg.type === "NLS_THUMB_STATS") {
      if (!isWatchPageMainFrameForMessages()) return;
      void (async () => {
        try {
          if (!liveId) {
            sendResponse({ ok: true, count: 0 });
            return;
          }
          const count = await countThumbsForLive(liveId);
          sendResponse({ ok: true, count });
        } catch {
          sendResponse({ ok: false, count: 0 });
        }
      })();
      return true;
    }
    if (msg.type === "NLS_POST_COMMENT") {
      if (!isWatchPageMainFrameForMessages()) return;
      const text = "text" in msg ? String(
        /** @type {{ text?: unknown }} */
        msg.text || ""
      ) : "";
      void postCommentFromContentAsync(text).then((result) => sendResponse(result)).catch(
        (err) => sendResponse({
          ok: false,
          error: err && typeof err === "object" && "message" in err ? String(
            /** @type {{ message?: unknown }} */
            err.message || "post_failed"
          ) : "post_failed"
        })
      );
      return true;
    }
    if (msg.type === "NLS_EXPORT_WATCH_SNAPSHOT") {
      if (!isWatchPageMainFrameForMessages()) return;
      if (!isNicoLiveWatchUrl(window.location.href)) {
        sendResponse({
          ok: false,
          error: "watch\u30DA\u30FC\u30B8\u4EE5\u5916\u3067\u306F\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093"
        });
        return;
      }
      try {
        sendResponse({
          ok: true,
          snapshot: collectWatchPageSnapshot()
        });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err && typeof err === "object" && "message" in err ? String(
            /** @type {{ message?: unknown }} */
            err.message || "snapshot_error"
          ) : "snapshot_error"
        });
      }
    }
  });
  function rememberWatchPageUrl() {
    if (!hasExtensionContext()) return;
    if (!isNicoLiveWatchUrl(window.location.href)) return;
    if (lastWatchUrlTimer) clearTimeout(lastWatchUrlTimer);
    lastWatchUrlTimer = setTimeout(() => {
      lastWatchUrlTimer = null;
      if (!hasExtensionContext()) return;
      chrome.storage.local.set({ [KEY_LAST_WATCH_URL]: window.location.href }).catch(() => {
      });
    }, 400);
  }
  async function readRecordingFlag() {
    if (!hasExtensionContext()) return false;
    const r = await chrome.storage.local.get(KEY_RECORDING);
    return r[KEY_RECORDING] === true;
  }
  function reconnectMutationObserver() {
    if (!mutationObserver) return;
    const nextRoot = pickCommentMutationObserverRoot(document);
    if (observedMutationRoot === nextRoot) return;
    mutationObserver.disconnect();
    observedMutationRoot = nextRoot;
    mutationObserver.observe(observedMutationRoot, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
  function enrichRowsWithInterceptedUserIds(rows) {
    if (!interceptedUsers.size && !interceptedNicknames.size) return rows;
    return rows.map((r) => {
      const no = String(r.commentNo ?? "").trim();
      const entry = no ? interceptedUsers.get(no) : void 0;
      const userId = r.userId || entry?.uid || null;
      const nickname = entry?.name || (userId ? interceptedNicknames.get(userId) : "") || "";
      return { ...r, userId, ...nickname ? { nickname } : {} };
    });
  }
  async function persistCommentRows(rows) {
    if (!rows?.length || !recording || !liveId || !isNicoLiveWatchUrl(window.location.href) || !hasExtensionContext()) {
      return;
    }
    const enriched = enrichRowsWithInterceptedUserIds(rows);
    const key = commentsStorageKey(liveId);
    try {
      const bag = await chrome.storage.local.get(key);
      const existing = Array.isArray(bag[key]) ? bag[key] : [];
      const { next, storageTouched } = mergeNewComments(
        liveId,
        existing,
        enriched
      );
      if (!storageTouched) return;
      await chrome.storage.local.set({ [key]: next });
      await chrome.storage.local.remove(KEY_STORAGE_WRITE_ERROR);
    } catch (err) {
      if (isContextInvalidatedError(err) || !hasExtensionContext()) return;
      try {
        await chrome.storage.local.set({
          [KEY_STORAGE_WRITE_ERROR]: buildStorageWriteErrorPayload(liveId, err)
        });
      } catch {
      }
    }
  }
  function clearThumbTimer() {
    if (thumbTimerId != null) {
      clearInterval(thumbTimerId);
      thumbTimerId = null;
    }
  }
  function applyThumbSchedule() {
    clearThumbTimer();
    if (!hasExtensionContext()) return;
    if (!isNicoLiveWatchUrl(window.location.href)) return;
    if (!liveId) return;
    if (!thumbAuto || !thumbIntervalMs) return;
    if (!isIndexedDbAvailable()) return;
    thumbTimerId = setInterval(() => {
      void runThumbCaptureTick();
    }, thumbIntervalMs);
  }
  async function readThumbSettings() {
    if (!hasExtensionContext()) return;
    const bag = await chrome.storage.local.get([KEY_THUMB_AUTO, KEY_THUMB_INTERVAL_MS]);
    thumbAuto = isThumbAutoEnabled(bag[KEY_THUMB_AUTO]);
    thumbIntervalMs = normalizeThumbIntervalMsForHost(
      bag[KEY_THUMB_INTERVAL_MS],
      window.location.hostname
    );
  }
  async function runThumbCaptureTick() {
    if (!liveId || !isNicoLiveWatchUrl(window.location.href)) return;
    if (!isIndexedDbAvailable()) return;
    const video = pickLargestVisibleVideo(document);
    if (!video) return;
    const cap = await captureVideoToPngDataUrl(video);
    if (!cap.ok) return;
    try {
      const blob = await (await fetch(cap.dataUrl)).blob();
      await addThumbBlob(liveId, blob);
    } catch {
    }
  }
  function syncLiveIdFromLocation() {
    const href = window.location.href;
    if (!isNicoLiveWatchUrl(href)) {
      liveId = null;
      clearThumbTimer();
      reconnectMutationObserver();
      hidePageFrameOverlay();
      return;
    }
    rememberWatchPageUrl();
    const ctx = resolveWatchPageContext(href, liveId);
    if (ctx.liveIdChanged) {
      pendingRoots.clear();
      interceptedUsers.clear();
      interceptedNicknames.clear();
      liveId = ctx.liveId;
      reconnectMutationObserver();
      pendingRoots.add(document.body);
      scheduleFlush();
      scheduleDeepHarvest("live-id-change");
      applyThumbSchedule();
    } else {
      liveId = ctx.liveId;
      reconnectMutationObserver();
    }
    renderPageFrameOverlay();
  }
  function enqueueNode(node) {
    if (!node) return;
    if (node.nodeType === Node.ELEMENT_NODE) {
      pendingRoots.add(node);
    } else if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      node.childNodes.forEach((c) => enqueueNode(c));
    }
  }
  async function flushToStorage() {
    if (!recording || !liveId || !isNicoLiveWatchUrl(window.location.href) || !pendingRoots.size) {
      pendingRoots.clear();
      return;
    }
    const rows = [];
    for (const n of pendingRoots) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        extractCommentsFromNode(
          /** @type {Element} */
          n
        ).forEach(
          (r) => rows.push(r)
        );
      }
    }
    pendingRoots.clear();
    if (!rows.length) return;
    await persistCommentRows(rows);
  }
  function scheduleFlush() {
    if (!recording || !liveId) return;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushToStorage().catch(() => {
      });
    }, DEBOUNCE_MS);
  }
  var deepHarvestTimer = null;
  function scheduleDeepHarvest(_reason) {
    if (!recording || !liveId || !isNicoLiveWatchUrl(window.location.href)) return;
    if (deepHarvestTimer) clearTimeout(deepHarvestTimer);
    deepHarvestTimer = setTimeout(() => {
      deepHarvestTimer = null;
      runDeepHarvest().catch(() => {
      });
    }, DEEP_HARVEST_DELAY_MS);
  }
  async function runDeepHarvest() {
    if (harvestRunning || !recording || !liveId || !isNicoLiveWatchUrl(window.location.href)) {
      return;
    }
    harvestRunning = true;
    try {
      const rows = await harvestVirtualCommentList({
        document,
        extractCommentsFromNode,
        waitMs: 55
      });
      await persistCommentRows(rows);
    } finally {
      harvestRunning = false;
    }
  }
  function scanVisibleCommentsNow() {
    if (!recording || !liveId || !isNicoLiveWatchUrl(window.location.href)) return;
    const panel = findNicoCommentPanel(document);
    const root = panel || document.body;
    const rows = extractCommentsFromNode(root);
    void persistCommentRows(rows);
  }
  function attachCommentScrollHook() {
    const host = findCommentListScrollHost(document);
    if (!host || scrollHooked.has(host)) return false;
    scrollHooked.set(host, true);
    let t = null;
    host.addEventListener(
      "scroll",
      () => {
        if (!recording || !liveId) return;
        clearTimeout(t);
        t = setTimeout(() => scanVisibleCommentsNow(), 550);
      },
      { passive: true }
    );
    return true;
  }
  function tryAttachScrollHookSoon() {
    if (attachCommentScrollHook()) return;
    let n = 0;
    const id = setInterval(() => {
      n++;
      if (attachCommentScrollHook() || n > 40) clearInterval(id);
    }, 800);
  }
  async function start() {
    if (!hasExtensionContext()) return;
    recording = await readRecordingFlag();
    ensurePageFrameStyle();
    startPageFrameLoop();
    await loadPageFrameSettings().catch(() => {
    });
    mutationObserver = new MutationObserver((records) => {
      if (!recording || !liveId || !isNicoLiveWatchUrl(window.location.href)) {
        return;
      }
      for (const rec of records) {
        if (rec.type === "childList") {
          rec.addedNodes.forEach((n) => enqueueNode(n));
        } else if (rec.type === "characterData" && rec.target?.parentElement) {
          const row = rec.target.parentElement.closest?.(
            'div.table-row[data-comment-type="normal"]'
          );
          if (row) pendingRoots.add(row);
          else pendingRoots.add(rec.target.parentElement);
        }
      }
      if (pendingRoots.size) scheduleFlush();
    });
    syncLiveIdFromLocation();
    await readThumbSettings().catch(() => {
    });
    applyThumbSchedule();
    chrome.storage.onChanged.addListener((changes, area) => {
      if (!hasExtensionContext()) return;
      if (area !== "local") return;
      if (changes[KEY_POPUP_FRAME] || changes[KEY_POPUP_FRAME_CUSTOM]) {
        loadPageFrameSettings().catch(() => {
        });
      }
      if (changes[KEY_INLINE_PANEL_WIDTH_MODE]) {
        inlinePanelWidthMode = normalizeInlinePanelWidthMode(
          changes[KEY_INLINE_PANEL_WIDTH_MODE].newValue
        );
        renderPageFrameOverlay();
      }
      if (changes[KEY_THUMB_AUTO] || changes[KEY_THUMB_INTERVAL_MS]) {
        readThumbSettings().then(() => applyThumbSchedule()).catch(() => {
        });
      }
      if (changes[KEY_RECORDING]) {
        recording = changes[KEY_RECORDING].newValue === true;
        if (recording) {
          pendingRoots.add(document.body);
          reconnectMutationObserver();
          scheduleFlush();
          scheduleDeepHarvest("recording-on");
          tryAttachScrollHookSoon();
        }
      }
    });
    if (recording && liveId) {
      pendingRoots.add(document.body);
      scheduleFlush();
      scheduleDeepHarvest("startup");
      tryAttachScrollHookSoon();
      for (const ms of BOOTSTRAP_DELAYS_MS) {
        setTimeout(() => {
          if (recording && liveId && isNicoLiveWatchUrl(window.location.href)) {
            scanVisibleCommentsNow();
          }
        }, ms);
      }
    }
    setInterval(() => {
      if (!hasExtensionContext()) return;
      syncLiveIdFromLocation();
    }, LIVE_POLL_MS);
    setInterval(() => {
      if (!hasExtensionContext()) return;
      if (!recording || !liveId || !isNicoLiveWatchUrl(window.location.href)) {
        return;
      }
      scanVisibleCommentsNow();
    }, LIVE_PANEL_SCAN_MS);
  }
  if (!document.documentElement.hasAttribute("data-nls-active")) {
    document.documentElement.setAttribute("data-nls-active", "1");
    start().catch(() => {
    });
  }
})();
