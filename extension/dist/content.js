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
  function isNicoLiveWatchUrl(url) {
    try {
      const u = new URL(String(url || ""));
      const host = u.hostname.toLowerCase();
      if (!host.includes("nicovideo.jp")) return false;
      return /\/watch\/lv\d+/i.test(u.pathname);
    } catch {
      return false;
    }
  }

  // src/lib/storageKeys.js
  var KEY_RECORDING = "nls_recording_enabled";
  function commentsStorageKey(liveId2) {
    const id = String(liveId2 || "").trim().toLowerCase();
    return `nls_comments_${id}`;
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
    const entry = {
      id: randomId(),
      liveId: liveId2,
      commentNo,
      text,
      userId: p.userId ? String(p.userId) : null,
      capturedAt
    };
    return entry;
  }
  function mergeNewComments(liveId2, existing, incoming) {
    const lid = String(liveId2 || "").trim().toLowerCase();
    const keys = /* @__PURE__ */ new Set();
    for (const e of existing) {
      keys.add(
        buildDedupeKey(lid, {
          commentNo: e.commentNo,
          text: e.text,
          capturedAt: e.capturedAt
        })
      );
    }
    const added = [];
    const next = [...existing];
    const now = Date.now();
    for (const row of incoming) {
      const text = normalizeCommentText(row.text);
      if (!text) continue;
      const commentNo = String(row.commentNo ?? "").trim();
      const key = buildDedupeKey(lid, {
        commentNo,
        text,
        capturedAt: now
      });
      if (keys.has(key)) continue;
      keys.add(key);
      const entry = createCommentEntry({
        liveId: lid,
        commentNo,
        text,
        userId: row.userId ?? null
      });
      added.push(entry);
      next.push(entry);
    }
    return { next, added };
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
    const anchors = el.querySelectorAll?.("a[href]") || [];
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
    const imgs = el.querySelectorAll?.('img[src*="usericon"], img[src*="nicoaccount"]') || [];
    for (const img of imgs) {
      const src = String(img.getAttribute("src") || "");
      let m = src.match(/\/usericon\/(?:s\/)?(\d+)\/(\d+)\./i);
      if (m?.[2]) return m[2];
      m = src.match(/nicoaccount\/usericon\/(\d+)/i);
      if (m?.[1] && m[1].length >= 5) return m[1];
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
    if (!userId) userId = extractUserIdFromOuterHtml(el);
    if (!userId) {
      let p = el.parentElement;
      for (let i = 0; i < 10 && p; i++) {
        userId = extractUserIdFromLinks(p) || extractUserIdFromIconSrc(p) || extractUserIdFromDataAttributes(p) || extractUserIdFromOuterHtml(p);
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
    return { commentNo, text, userId };
  }
  function parseCommentElement(el) {
    if (!el || el.nodeType !== 1) return null;
    const fromGrid = parseNicoLiveTableRow(el);
    if (fromGrid) return fromGrid;
    const userId = resolveUserIdOnElement(el);
    const raw = (el.innerText || el.textContent || "").replace(/\u00a0/g, " ").trim();
    if (!raw) return null;
    const lines = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const p2 = parseCommentLineText(line);
      if (p2) return { ...p2, userId };
    }
    const oneLine = raw.replace(/\s+/g, " ").trim();
    const p = parseCommentLineText(oneLine);
    if (p) return { ...p, userId };
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

  // src/lib/commentHarvest.js
  function findNicoCommentPanel(root = document) {
    if (!root || root.nodeType !== 9 && root.nodeType !== 1) return null;
    const doc = root.nodeType === 9 ? root : root.ownerDocument || document;
    const base = root.nodeType === 9 ? doc.documentElement : root;
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

  // src/extension/content-entry.js
  var DEBOUNCE_MS = 800;
  var LIVE_POLL_MS = 4e3;
  var DEEP_HARVEST_DELAY_MS = 1200;
  var BOOTSTRAP_DELAYS_MS = [400, 2e3, 4500];
  var recording = false;
  var liveId = null;
  var pendingRoots = /* @__PURE__ */ new Set();
  var flushTimer = null;
  var observer = null;
  var harvestRunning = false;
  var scrollHooked = /* @__PURE__ */ new WeakMap();
  async function readRecordingFlag() {
    const r = await chrome.storage.local.get(KEY_RECORDING);
    return r[KEY_RECORDING] === true;
  }
  async function persistCommentRows(rows) {
    if (!rows?.length || !recording || !liveId || !isNicoLiveWatchUrl(window.location.href)) {
      return;
    }
    const key = commentsStorageKey(liveId);
    const bag = await chrome.storage.local.get(key);
    const existing = Array.isArray(bag[key]) ? bag[key] : [];
    const { next } = mergeNewComments(liveId, existing, rows);
    await chrome.storage.local.set({ [key]: next });
  }
  function syncLiveIdFromLocation() {
    if (!isNicoLiveWatchUrl(window.location.href)) {
      liveId = null;
      return;
    }
    const next = extractLiveIdFromUrl(window.location.href);
    if (next !== liveId) {
      liveId = next;
      pendingRoots.add(document.body);
      scheduleFlush();
      scheduleDeepHarvest("liveId-change");
    }
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
    recording = await readRecordingFlag();
    syncLiveIdFromLocation();
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[KEY_RECORDING]) return;
      recording = changes[KEY_RECORDING].newValue === true;
      if (recording) {
        pendingRoots.add(document.body);
        scheduleFlush();
        scheduleDeepHarvest("recording-on");
        tryAttachScrollHookSoon();
      }
    });
    observer = new MutationObserver((records) => {
      if (!recording || !liveId || !isNicoLiveWatchUrl(window.location.href)) {
        return;
      }
      for (const rec of records) {
        rec.addedNodes.forEach((n) => enqueueNode(n));
      }
      if (pendingRoots.size) scheduleFlush();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
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
      syncLiveIdFromLocation();
    }, LIVE_POLL_MS);
  }
  start().catch(() => {
  });
})();
