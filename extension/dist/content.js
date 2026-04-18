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
      const hasWatchOrEmbed = /\/watch\//.test(u.pathname) || /\/embed\//.test(u.pathname);
      if (isLocalE2EWatchHost(u)) return hasWatchOrEmbed;
      if (!host.includes("nicovideo.jp")) return false;
      if (host === "live.nicovideo.jp" || host === "sp.live.nicovideo.jp") {
        return hasWatchOrEmbed;
      }
      return /\/watch\/(lv|ch)\d+/i.test(u.pathname);
    } catch {
      return false;
    }
  }
  function isNicoVideoJpHost(url) {
    try {
      const h = new URL(String(url || "")).hostname.toLowerCase();
      return h === "nicovideo.jp" || h.endsWith(".nicovideo.jp");
    } catch {
      return false;
    }
  }
  function extractLiveIdFromDom(doc) {
    if (!doc) return null;
    const tryHref = (raw) => extractLiveIdFromUrl(String(raw || ""));
    for (const a of doc.querySelectorAll(
      'a[href*="/watch/lv"], a[href*="watch/lv"], a[href*="/embed/lv"], a[href*="embed/lv"]'
    )) {
      const id = tryHref(a.getAttribute("href"));
      if (id) return id;
    }
    for (const sel of [
      'meta[property="og:url"]',
      'meta[name="og:url"]',
      'link[rel="canonical"]'
    ]) {
      const el = doc.querySelector(sel);
      const raw = el?.getAttribute("content") || el?.getAttribute("href") || "";
      const id = tryHref(raw);
      if (id) return id;
    }
    return null;
  }

  // src/lib/storageKeys.js
  var KEY_RECORDING = "nls_recording_enabled";
  var KEY_DEEP_HARVEST_QUIET_UI = "nls_deep_harvest_quiet_ui";
  var KEY_LAST_WATCH_URL = "nls_last_watch_url";
  var KEY_STORAGE_WRITE_ERROR = "nls_storage_write_error";
  var KEY_COMMENT_PANEL_STATUS = "nls_comment_panel_status";
  var KEY_COMMENT_INGEST_LOG = "nls_comment_ingest_log_v1";
  var KEY_AUTO_BACKUP_STATE = "nls_auto_backup_state";
  var KEY_POPUP_FRAME = "nls_popup_frame";
  var KEY_POPUP_FRAME_CUSTOM = "nls_popup_frame_custom";
  var KEY_THUMB_AUTO = "nls_thumb_auto_enabled";
  var KEY_THUMB_INTERVAL_MS = "nls_thumb_interval_ms";
  var KEY_SELF_POSTED_RECENTS = "nls_self_posted_recents";
  var KEY_USER_COMMENT_PROFILE_CACHE = "nls_user_comment_profile_v1";
  var EXTENSION_SOFT_CACHE_STORAGE_KEYS = Object.freeze([
    KEY_USER_COMMENT_PROFILE_CACHE
  ]);
  var KEY_INLINE_PANEL_WIDTH_MODE = "nls_inline_panel_width_mode";
  var KEY_INLINE_PANEL_PLACEMENT = "nls_inline_panel_placement";
  var KEY_INLINE_PANEL_FLOAT_TO_DOCK_MIGRATED = "nls_inline_panel_float_to_dock_migrated";
  var KEY_INLINE_PANEL_AUTOSHOW_ENABLED = "nls_inline_panel_autoshow_enabled";
  function normalizeInlinePanelAutoshowEnabled(raw) {
    return raw !== false;
  }
  var INLINE_PANEL_PLACEMENT_BELOW = "below";
  var INLINE_PANEL_PLACEMENT_BESIDE = "beside";
  var INLINE_PANEL_PLACEMENT_FLOATING = "floating";
  var INLINE_PANEL_PLACEMENT_DOCK_BOTTOM = "dock_bottom";
  var KEY_INLINE_FLOATING_ANCHOR = "nls_inline_floating_anchor";
  var INLINE_FLOATING_ANCHOR_TOP_RIGHT = "top_right";
  var INLINE_FLOATING_ANCHOR_BOTTOM_LEFT = "bottom_left";
  var INLINE_PANEL_WIDTH_PLAYER_ROW = "player_row";
  var INLINE_PANEL_WIDTH_VIDEO = "video";
  function normalizeInlinePanelWidthMode(raw) {
    const s = String(raw || "").trim();
    if (s === INLINE_PANEL_WIDTH_VIDEO) return INLINE_PANEL_WIDTH_VIDEO;
    return INLINE_PANEL_WIDTH_PLAYER_ROW;
  }
  function normalizeInlinePanelPlacement(raw) {
    const s = String(raw || "").trim().toLowerCase();
    if (s === INLINE_PANEL_PLACEMENT_BESIDE) return INLINE_PANEL_PLACEMENT_BESIDE;
    if (s === INLINE_PANEL_PLACEMENT_FLOATING) return INLINE_PANEL_PLACEMENT_FLOATING;
    if (s === INLINE_PANEL_PLACEMENT_BELOW) return INLINE_PANEL_PLACEMENT_BELOW;
    if (s === INLINE_PANEL_PLACEMENT_DOCK_BOTTOM || s === "dock" || s === "bottom_dock") {
      return INLINE_PANEL_PLACEMENT_DOCK_BOTTOM;
    }
    if (!s) return INLINE_PANEL_PLACEMENT_DOCK_BOTTOM;
    return INLINE_PANEL_PLACEMENT_BELOW;
  }
  function normalizeInlineFloatingAnchor(raw) {
    const s = String(raw || "").trim().toLowerCase();
    if (s === INLINE_FLOATING_ANCHOR_BOTTOM_LEFT) return INLINE_FLOATING_ANCHOR_BOTTOM_LEFT;
    return INLINE_FLOATING_ANCHOR_TOP_RIGHT;
  }
  function isRecordingEnabled(raw) {
    return raw !== false;
  }
  function isDeepHarvestQuietUiEnabled(raw) {
    return raw !== false;
  }
  function commentsStorageKey(liveId2) {
    const id = String(liveId2 || "").trim().toLowerCase();
    return `nls_comments_${id}`;
  }
  function giftUsersStorageKey(liveId2) {
    const id = String(liveId2 || "").trim().toLowerCase();
    return `nls_gift_users_${id}`;
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
  function niconicoDefaultUserIconUrl(userId) {
    const s = String(userId || "").trim();
    if (!/^\d{5,14}$/.test(s)) return "";
    const n = Number(s);
    if (!Number.isFinite(n) || n < 1) return "";
    const bucket = Math.max(1, Math.floor(n / 1e4));
    return `https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/${bucket}/${s}.jpg`;
  }
  function looksLikeNiconicoUserIconHttpUrl(url) {
    const s = String(url || "").trim();
    if (!isHttpOrHttpsUrl(s)) return false;
    return /nicoaccount\/usericon|\/usericon\/|usericon\.nicovideo|\/usericon\/defaults\//i.test(
      s
    );
  }
  function isWeakNiconicoUserIconHttpUrl(url) {
    const s = String(url || "").trim();
    if (!isHttpOrHttpsUrl(s)) return false;
    return /\/usericon\/defaults\//i.test(s);
  }
  function isNiconicoSyntheticDefaultUserIconUrl(avatarUrl, userId) {
    const url = String(avatarUrl || "").trim();
    const uid = String(userId || "").trim();
    if (!isHttpOrHttpsUrl(url) || !/^\d{5,14}$/.test(uid)) return false;
    const expected = niconicoDefaultUserIconUrl(uid);
    return Boolean(expected && url === expected);
  }
  function commentEnrichmentAvatarScore(userId, url) {
    const c = String(url || "").trim();
    if (!isHttpOrHttpsUrl(c)) return 0;
    if (isWeakNiconicoUserIconHttpUrl(c)) return 1;
    const u = String(userId || "").trim();
    if (/^\d{5,14}$/.test(u) && isNiconicoSyntheticDefaultUserIconUrl(c, u)) return 1;
    return 2;
  }
  function pickStrongestAvatarUrlForUser(userId, orderedCandidates) {
    const u = String(userId || "").trim();
    let best = "";
    let bestSc = 0;
    if (!Array.isArray(orderedCandidates)) return "";
    for (const raw of orderedCandidates) {
      const c = String(raw || "").trim();
      if (!c) continue;
      const sc = commentEnrichmentAvatarScore(u, c);
      if (sc > bestSc) {
        bestSc = sc;
        best = c;
      }
    }
    return best;
  }

  // src/lib/userIdPreference.js
  function userIdObservationStrength(userId) {
    const s = String(userId ?? "").trim();
    if (!s) return 0;
    if (/^\d{5,14}$/.test(s)) return 2;
    return 1;
  }
  function pickStrongerUserId(existing, incoming, tiePrefer = "incoming") {
    const ex = String(existing ?? "").trim();
    const inc = String(incoming ?? "").trim();
    if (!inc) return ex;
    if (!ex) return inc;
    const se = userIdObservationStrength(ex);
    const si = userIdObservationStrength(inc);
    if (si > se) return inc;
    if (si < se) return ex;
    if (inc === ex) return ex;
    return tiePrefer === "existing" ? ex : inc;
  }
  function mergeUserIdForEnrichment(rowUid, interceptedUid, rowLikelyContaminated) {
    const int = String(interceptedUid ?? "").trim();
    const row = String(rowUid ?? "").trim();
    if (rowLikelyContaminated) {
      if (int) return int;
      return row || null;
    }
    const dom = row;
    if (!dom && !int) return null;
    if (!dom) return int;
    if (!int) return dom;
    const sd = userIdObservationStrength(dom);
    const si = userIdObservationStrength(int);
    if (si > sd) return int;
    if (sd > si) return dom;
    return dom;
  }

  // src/lib/nicoAnonymousDisplay.js
  function isNiconicoAnonymousUserId(userId) {
    const s = String(userId ?? "").trim();
    if (!s.startsWith("a:")) return false;
    const rest = s.slice(2).trim();
    return rest.length >= 2;
  }
  function isNiconicoAutoUserPlaceholderNickname(nickname) {
    const n = String(nickname ?? "").trim();
    return /^user\s+[A-Za-z0-9]+$/i.test(n);
  }
  function anonymousNicknameFallback(userId, nickname) {
    const nick = String(nickname ?? "").trim();
    if (nick) return nick;
    return isNiconicoAnonymousUserId(userId) ? "\u533F\u540D" : "";
  }

  // src/lib/commentRecord.js
  var COMMENT_TEXT_MAX_CHARS = 1e3;
  function userIdFromNicoUserIconHttpUrl(url) {
    const s = String(url || "");
    if (!isHttpOrHttpsUrl(s)) return "";
    let m = s.match(/\/usericon\/(?:s\/)?(\d+)\/(\d+)\./i);
    if (m?.[2]) return m[2];
    m = s.match(/nicoaccount\/usericon\/(\d+)/i);
    if (m?.[1] && m[1].length >= 5) return m[1];
    return "";
  }
  function normalizeCommentText(value) {
    return String(value || "").replace(/\r\n/g, "\n").split("\n").map((l) => l.trim()).join("\n").trim().slice(0, COMMENT_TEXT_MAX_CHARS);
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
    const av = String(p.avatarUrl || "").trim();
    const avatarUrl = isHttpOrHttpsUrl(av) ? av : "";
    let uid = p.userId ? String(p.userId).trim() : "";
    if (!uid && avatarUrl) {
      const fromAv = userIdFromNicoUserIconHttpUrl(avatarUrl);
      if (fromAv) uid = fromAv;
    }
    const nickname = anonymousNicknameFallback(uid, p.nickname);
    const storedAvatar = avatarUrl;
    const entry = {
      id: randomId(),
      liveId: liveId2,
      commentNo,
      text,
      userId: uid || null,
      ...nickname ? { nickname } : {},
      ...storedAvatar ? { avatarUrl: storedAvatar } : {},
      ...p.avatarObserved ? { avatarObserved: true } : {},
      ...p.vpos != null ? { vpos: p.vpos } : {},
      ...p.accountStatus != null ? { accountStatus: p.accountStatus } : {},
      ...p.is184 ? { is184: true } : {},
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
  function patchExistingComment(existing, incoming) {
    const rawAv = String(incoming.avatarUrl || "").trim();
    const validAvatar = isHttpOrHttpsUrl(rawAv) ? rawAv : "";
    let incUid = incoming.userId ? String(incoming.userId).trim() : "";
    if (!incUid && validAvatar) {
      const fromAv = userIdFromNicoUserIconHttpUrl(validAvatar);
      if (fromAv) incUid = fromAv;
    }
    let entry = (
      /** @type {StoredComment} */
      existing
    );
    let touched = false;
    if (validAvatar) {
      const exAv = String(entry.avatarUrl || "").trim();
      const hasAv = Boolean(exAv && isHttpOrHttpsUrl(exAv));
      let uidForSynthetic = String(entry.userId || incUid || "").trim();
      if (!uidForSynthetic && exAv) {
        uidForSynthetic = userIdFromNicoUserIconHttpUrl(exAv);
      }
      const canUpgradeSynthetic = hasAv && looksLikeNiconicoUserIconHttpUrl(validAvatar) && validAvatar !== exAv && isNiconicoSyntheticDefaultUserIconUrl(exAv, uidForSynthetic);
      const canUpgradeWeakPlaceholder = hasAv && isWeakNiconicoUserIconHttpUrl(exAv) && looksLikeNiconicoUserIconHttpUrl(validAvatar) && !isWeakNiconicoUserIconHttpUrl(validAvatar) && validAvatar !== exAv;
      if (!hasAv) {
        entry = { ...entry, avatarUrl: validAvatar };
        touched = true;
      } else if (canUpgradeSynthetic) {
        entry = { ...entry, avatarUrl: validAvatar };
        touched = true;
      } else if (canUpgradeWeakPlaceholder) {
        entry = { ...entry, avatarUrl: validAvatar };
        touched = true;
      }
    }
    const exUid = String(entry.userId || "").trim();
    const chosenUid = pickStrongerUserId(exUid, incUid);
    if (incUid && chosenUid !== exUid) {
      entry = { ...entry, userId: chosenUid ? chosenUid : null };
      touched = true;
    }
    const incNickRaw = String(incoming.nickname || "").trim();
    const incNick = incNickRaw || anonymousNicknameFallback(String(entry.userId || incUid || ""), "");
    const exNick = String(entry.nickname || "").trim();
    if (incNick && (!exNick || incNick.length > exNick.length)) {
      entry = { ...entry, nickname: incNick };
      touched = true;
    }
    if (!String(entry.userId || "").trim()) {
      const avHeal = String(entry.avatarUrl || "").trim();
      if (isHttpOrHttpsUrl(avHeal)) {
        const h = userIdFromNicoUserIconHttpUrl(avHeal);
        if (h) {
          entry = { ...entry, userId: h };
          touched = true;
        }
      }
    }
    if (incoming.avatarObserved && !entry.avatarObserved) {
      entry = { ...entry, avatarObserved: true };
      touched = true;
    }
    return { entry, touched };
  }
  function mergeNewComments(liveId2, existing, incoming) {
    const lid = String(liveId2 || "").trim().toLowerCase();
    const keyToIndex = /* @__PURE__ */ new Map();
    for (let i = 0; i < existing.length; i += 1) {
      const e = existing[i];
      const ex = (
        /** @type {StoredComment} */
        e
      );
      const key = storedCommentDedupeKey(lid, ex);
      if (!keyToIndex.has(key)) keyToIndex.set(key, i);
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
      const idx = keyToIndex.get(key);
      if (idx != null && idx >= 0 && idx < next.length) {
        const result = patchExistingComment(next[idx], row);
        if (result.touched) {
          next[idx] = result.entry;
          storageTouched = true;
        }
        continue;
      }
      keyToIndex.set(key, next.length);
      const rawAv = String(row.avatarUrl || "").trim();
      const validAvatar = isHttpOrHttpsUrl(rawAv) ? rawAv : "";
      const entry = createCommentEntry({
        liveId: lid,
        commentNo,
        text,
        userId: row.userId ?? null,
        nickname: row.nickname || "",
        avatarUrl: validAvatar || void 0,
        avatarObserved: row.avatarObserved || false,
        vpos: row.vpos,
        accountStatus: row.accountStatus,
        is184: row.is184
      });
      added.push(entry);
      next.push(entry);
    }
    if (added.length) storageTouched = true;
    return { next, added, storageTouched };
  }
  function backfillNumericSyntheticAvatarsOnStoredComments(entries) {
    if (!Array.isArray(entries) || !entries.length) {
      return { next: entries, patched: 0 };
    }
    let patched = 0;
    const next = entries.map((e) => {
      const av = String(
        /** @type {{ avatarUrl?: unknown }} */
        e?.avatarUrl || ""
      ).trim();
      if (!av || !isHttpOrHttpsUrl(av)) return e;
      const uid = String(
        /** @type {{ userId?: unknown }} */
        e?.userId || ""
      ).trim();
      if (/^\d{5,14}$/.test(uid) && isNiconicoSyntheticDefaultUserIconUrl(av, uid)) {
        patched += 1;
        const copy = { .../** @type {object} */
        e };
        delete /** @type {Record<string,unknown>} */
        copy.avatarUrl;
        return copy;
      }
      return e;
    });
    return { next, patched };
  }

  // src/lib/supportGridDisplayTier.js
  function supportGridStrongNickname(nick, userId) {
    const n = String(nick ?? "").trim();
    if (!n) return false;
    if (isNiconicoAutoUserPlaceholderNickname(n)) return false;
    if (n === "\uFF08\u672A\u53D6\u5F97\uFF09" || n === "(\u672A\u53D6\u5F97)") return false;
    if (n === "\u533F\u540D") return false;
    if (n === "\u30B2\u30B9\u30C8" || /^guest$/i.test(n)) return false;
    if (isNiconicoAnonymousUserId(userId) && n.length <= 1) return false;
    return true;
  }

  // src/lib/userCommentProfileCache.js
  var USER_COMMENT_PROFILE_CACHE_MAX = 5e3;
  var USER_COMMENT_PROFILE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1e3;
  function isFreshProfileEntry(updatedAt, nowMs, maxAgeMs) {
    if (!Number.isFinite(updatedAt) || updatedAt <= 0) return false;
    if (updatedAt < 1e12) return true;
    if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return true;
    return updatedAt >= nowMs - maxAgeMs;
  }
  function normalizeUserCommentProfileMap(raw, opts = {}) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const nowMsRaw = Number(opts.nowMs);
    const nowMs = Number.isFinite(nowMsRaw) && nowMsRaw > 0 ? nowMsRaw : Date.now();
    const maxAgeRaw = Number(opts.maxAgeMs);
    const maxAgeMs = Number.isFinite(maxAgeRaw) && maxAgeRaw > 0 ? maxAgeRaw : USER_COMMENT_PROFILE_CACHE_MAX_AGE_MS;
    const src = (
      /** @type {Record<string, unknown>} */
      raw
    );
    const out = {};
    for (const [k, v] of Object.entries(src)) {
      const uid = String(k || "").trim();
      if (!uid || uid.length > 128) continue;
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      const o = (
        /** @type {Record<string, unknown>} */
        v
      );
      const updatedAt = Number(o.updatedAt);
      if (!isFreshProfileEntry(updatedAt, nowMs, maxAgeMs)) continue;
      const nick = String(o.nickname || "").trim().slice(0, 200);
      const av = String(o.avatarUrl || "").trim();
      const avatarUrl = av && isHttpOrHttpsUrl(av) && !isWeakNiconicoUserIconHttpUrl(av) ? av.slice(0, 2e3) : "";
      if (!nick && !avatarUrl) continue;
      out[uid] = {
        updatedAt,
        ...nick ? { nickname: nick } : {},
        ...avatarUrl ? { avatarUrl } : {}
      };
    }
    return out;
  }
  function mergeIntoMap(map, uid, p) {
    const nickIn = String(p.nickname || "").trim();
    const avIn = String(p.avatarUrl || "").trim();
    const strongAv = avIn && isHttpOrHttpsUrl(avIn) && !isWeakNiconicoUserIconHttpUrl(avIn) ? avIn : "";
    if (!nickIn && !strongAv) return false;
    const now = Date.now();
    const prev = map[uid] || { updatedAt: 0 };
    let nextNick = String(prev.nickname || "").trim();
    let nextAv = String(prev.avatarUrl || "").trim();
    let changed = false;
    if (nickIn) {
      if (!nextNick || nickIn.length > nextNick.length) {
        nextNick = nickIn;
        changed = true;
      }
    }
    if (strongAv) {
      const prevStrong = nextAv && isHttpOrHttpsUrl(nextAv) && !isWeakNiconicoUserIconHttpUrl(nextAv);
      if (!prevStrong) {
        nextAv = strongAv;
        changed = true;
      }
    }
    if (!changed) return false;
    const entry = { updatedAt: now };
    if (nextNick) entry.nickname = nextNick;
    if (nextAv && isHttpOrHttpsUrl(nextAv)) entry.avatarUrl = nextAv;
    map[uid] = entry;
    return true;
  }
  function upsertUserCommentProfileFromEntry(map, entry) {
    const uid = String(entry?.userId || "").trim();
    if (!uid) return false;
    return mergeIntoMap(map, uid, {
      nickname: String(entry?.nickname || "").trim(),
      avatarUrl: String(entry?.avatarUrl || "").trim()
    });
  }
  function upsertUserCommentProfileFromIntercept(map, it) {
    const uid = String(it?.uid || "").trim();
    if (!uid) return false;
    const av = String(it?.av || "").trim();
    return mergeIntoMap(map, uid, {
      nickname: String(it?.name || "").trim(),
      avatarUrl: av
    });
  }
  function isWeakMergedDisplayNickname(nick) {
    const n = String(nick || "").trim();
    if (!n) return true;
    if (n === "\uFF08\u672A\u53D6\u5F97\uFF09" || n === "(\u672A\u53D6\u5F97)" || n === "\u533F\u540D") return true;
    if (isNiconicoAutoUserPlaceholderNickname(n)) return true;
    return false;
  }
  function applyUserCommentProfileMapToEntries(entries, map) {
    if (!Array.isArray(entries) || !entries.length || !Object.keys(map).length) {
      return { next: entries, patched: 0 };
    }
    let patched = 0;
    const next = entries.map((e) => {
      const uid = String(
        /** @type {{ userId?: string|null }} */
        e?.userId || ""
      ).trim();
      if (!uid) return e;
      const hit = map[uid];
      if (!hit) return e;
      const curNick = String(
        /** @type {{ nickname?: string }} */
        e?.nickname || ""
      ).trim();
      const candNick = String(hit.nickname || "").trim();
      const curAv = String(
        /** @type {{ avatarUrl?: string }} */
        e?.avatarUrl || ""
      ).trim();
      const candAv = String(hit.avatarUrl || "").trim();
      let out = (
        /** @type {T} */
        e
      );
      let changed = false;
      if (candNick) {
        const preferNick = !curNick || candNick.length > curNick.length || isWeakMergedDisplayNickname(curNick) && supportGridStrongNickname(candNick, uid);
        if (preferNick && candNick !== curNick) {
          out = { ...out, nickname: candNick };
          changed = true;
        }
      }
      if (candAv && isHttpOrHttpsUrl(candAv) && !isWeakNiconicoUserIconHttpUrl(candAv)) {
        const curStrong = curAv && isHttpOrHttpsUrl(curAv) && !isWeakNiconicoUserIconHttpUrl(curAv);
        if (!curStrong) {
          out = { ...out, avatarUrl: candAv };
          changed = true;
        }
      }
      if (changed) patched += 1;
      return out;
    });
    return { next, patched };
  }
  function pruneUserCommentProfileMap(map, max = USER_COMMENT_PROFILE_CACHE_MAX, opts = {}) {
    const raw = Number(max);
    const lim = Math.max(
      1,
      Math.min(
        Number.isFinite(raw) && raw > 0 ? raw : USER_COMMENT_PROFILE_CACHE_MAX,
        2e4
      )
    );
    const nowMsRaw = Number(opts.nowMs);
    const nowMs = Number.isFinite(nowMsRaw) && nowMsRaw > 0 ? nowMsRaw : Date.now();
    const maxAgeRaw = Number(opts.maxAgeMs);
    const maxAgeMs = Number.isFinite(maxAgeRaw) && maxAgeRaw > 0 ? maxAgeRaw : USER_COMMENT_PROFILE_CACHE_MAX_AGE_MS;
    const ids = Object.keys(map).filter(
      (id) => isFreshProfileEntry(Number(map[id]?.updatedAt), nowMs, maxAgeMs)
    );
    if (ids.length <= lim) {
      if (ids.length === Object.keys(map).length) return map;
      const freshOnly = {};
      for (const id of ids) {
        freshOnly[id] = map[id];
      }
      return freshOnly;
    }
    ids.sort((a, b) => (map[b].updatedAt || 0) - (map[a].updatedAt || 0));
    const keep = new Set(ids.slice(0, lim));
    const out = {};
    for (const id of keep) {
      out[id] = map[id];
    }
    return out;
  }
  async function readStorageBagWithRetry(readFn, opts = {}) {
    const attempts = Math.max(1, Math.min(Number(opts.attempts) || 4, 8));
    const delays = Array.isArray(opts.delaysMs) && opts.delaysMs.length ? opts.delaysMs : [0, 50, 120, 280];
    for (let i = 0; i < attempts; i += 1) {
      if (i > 0) {
        const ms = Math.max(
          0,
          Number(delays[Math.min(i - 1, delays.length - 1)]) || 0
        );
        if (ms > 0) {
          await new Promise((r) => setTimeout(r, ms));
        }
      }
      try {
        const bag = await readFn();
        if (bag && typeof bag === "object" && !Array.isArray(bag)) {
          return (
            /** @type {Record<string, unknown>} */
            bag
          );
        }
      } catch {
      }
    }
    return {};
  }

  // src/lib/giftRecord.js
  function mergeGiftUsers(existing, incoming) {
    const byId = /* @__PURE__ */ new Map();
    for (const e of existing) {
      byId.set(e.userId, e);
    }
    const added = [];
    let storageTouched = false;
    const now = Date.now();
    for (const inc of incoming) {
      const uid = String(inc.userId || "").trim();
      if (!uid) continue;
      const nick = String(inc.nickname || "").trim();
      const ex = byId.get(uid);
      if (ex) {
        if (nick && !ex.nickname) {
          byId.set(uid, { ...ex, nickname: nick });
          storageTouched = true;
        }
        continue;
      }
      const entry = { userId: uid, nickname: nick, capturedAt: now };
      byId.set(uid, entry);
      added.push(entry);
    }
    if (added.length) storageTouched = true;
    const next = [...byId.values()];
    return { next, added, storageTouched };
  }

  // src/lib/commentSubmitConfirm.js
  var COMMENT_SUBMIT_CONFIRM_PROBE_MS = Object.freeze([
    280,
    700,
    1400,
    2500,
    4e3
  ]);
  function isEditorReflectingSubmit(expectedNormalized, currentNormalized) {
    const exp = String(expectedNormalized || "").trim();
    const cur = String(currentNormalized || "").trim();
    if (!exp) return false;
    if (!cur || cur !== exp) return true;
    return false;
  }
  async function waitUntilEditorReflectsSubmit(opts) {
    const {
      expectedNormalized,
      readNormalized,
      probeEndpointsMs = COMMENT_SUBMIT_CONFIRM_PROBE_MS,
      sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    } = opts;
    const expected = String(expectedNormalized || "").trim();
    if (!expected) return false;
    const endpoints = [...probeEndpointsMs].sort((a, b) => a - b);
    let waited = 0;
    for (const endpoint of endpoints) {
      const delta = Math.max(0, endpoint - waited);
      waited = endpoint;
      if (delta > 0) await sleep(delta);
      if (isEditorReflectingSubmit(expected, readNormalized())) return true;
    }
    return false;
  }

  // src/lib/commentPostDom.js
  var COMMENT_SEND_LABEL_RE = /(コメント.{0,8}(送信|投稿)|送信|投稿|書き込|書込|submit|send|post)/i;
  var COMMENT_SEND_ATTR_RE = /(send|submit|post|comment|コメント|投稿|書込)/i;
  var COMMENT_NON_SUBMIT_RE = /(reload|再読み込み|html|export|save|保存|capture|screen|screenshot|voice|mic|settings?|detail|閉じ|close|cancel|音声|スクショ)/i;
  var COMMENT_BUTTON_CANDIDATE_SELECTOR = 'button, input[type="submit"], input[type="button"], [role="button"]';
  function isHtmlElement(el) {
    return el instanceof HTMLElement;
  }
  function isVisibleCommentActionElement(el) {
    if (!isHtmlElement(el) || !el.isConnected || el.hidden) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    try {
      if (typeof el.getClientRects === "function" && el.getClientRects().length > 0) {
        return true;
      }
    } catch {
    }
    return true;
  }
  function isDisabledCommentActionElement(el) {
    if (el.matches('[disabled],[aria-disabled="true"]')) return true;
    if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) {
      return el.disabled;
    }
    return false;
  }
  function readCommentActionPrimaryLabel(el) {
    const parts = [];
    for (const key of ["aria-label", "title"]) {
      const v = String(el.getAttribute(key) || "").trim();
      if (v) parts.push(v);
    }
    if (el instanceof HTMLInputElement) {
      const v = String(el.value || "").trim();
      if (v) parts.push(v);
    }
    const text = String(el.textContent || "").trim();
    if (text) parts.push(text);
    return parts.join(" ").trim();
  }
  function readCommentActionTokenText(el) {
    const parts = [];
    for (const key of ["id", "name", "class", "data-testid", "data-test-id"]) {
      const v = String(el.getAttribute(key) || "").trim();
      if (v) parts.push(v);
    }
    return parts.join(" ").trim();
  }
  function scoreCommentSubmitButton(el, editor) {
    let score = 0;
    const label = readCommentActionPrimaryLabel(el);
    const tokens = readCommentActionTokenText(el);
    const type = el instanceof HTMLButtonElement || el instanceof HTMLInputElement ? String(el.type || "").trim().toLowerCase() : "";
    const editorForm = editor?.closest("form") || null;
    const buttonForm = el.closest("form");
    if (editorForm && buttonForm === editorForm) score += 140;
    else if (editorForm && buttonForm && buttonForm !== editorForm) score -= 40;
    if (type === "submit") score += 90;
    if (type === "button") score += 12;
    if (el.getAttribute("role") === "button") score += 8;
    if (COMMENT_SEND_LABEL_RE.test(label)) score += 110;
    if (COMMENT_SEND_ATTR_RE.test(tokens)) score += 45;
    if (/comment|コメント/i.test(label)) score += 18;
    if (COMMENT_NON_SUBMIT_RE.test(label) || COMMENT_NON_SUBMIT_RE.test(tokens)) {
      score -= 220;
    }
    if (editor && editor.parentElement && el.parentElement === editor.parentElement) {
      score += 20;
    }
    return score;
  }
  function findCommentSubmitButton(root, editor = null) {
    if (!root || typeof root.querySelectorAll !== "function") return null;
    let best = null;
    let bestScore = -Infinity;
    const list = root.querySelectorAll(COMMENT_BUTTON_CANDIDATE_SELECTOR);
    for (const node of list) {
      if (!(node instanceof HTMLElement)) continue;
      if (!isVisibleCommentActionElement(node)) continue;
      if (isDisabledCommentActionElement(node)) continue;
      const score = scoreCommentSubmitButton(node, editor);
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }
    const minimumScore = editor != null ? 80 : root instanceof HTMLFormElement ? 60 : 120;
    return bestScore >= minimumScore ? best : null;
  }

  // src/lib/nicoliveDom.js
  var LINE_HEAD = /^(\d{1,12})\s+([\s\S]+)$/;
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
  var NICO_USER_ICON_IMG_LAZY_ATTRS = Object.freeze([
    "src",
    "data-src",
    "data-lazy-src",
    "data-original",
    "data-url"
  ]);
  function collectNicoUserIconUrlPartsFromImg(img) {
    if (!(img instanceof HTMLImageElement)) return [];
    const urls = [];
    for (const a of NICO_USER_ICON_IMG_LAZY_ATTRS) {
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
    return /nicoaccount\/usericon|\/usericon\/|usericon\.nicovideo|\/usericon\/defaults\//i.test(
      s
    );
  }
  function toAbsoluteHttpUrl(raw, base) {
    const r = String(raw || "").trim();
    if (!r) return "";
    let abs = "";
    try {
      abs = new URL(r, base).href;
    } catch {
      abs = r;
    }
    return /^https?:\/\//i.test(abs) ? abs : "";
  }
  function avatarUrlHeuristicScore(abs) {
    const u = String(abs || "");
    if (!u) return -999;
    let score = 0;
    if (looksLikeNicoUserIconUrl(u)) score += 120;
    if (/(avatar|icon|profile|user|face|user[_-]?image)/i.test(u)) score += 36;
    if (/(emoji|stamp|gift|logo|banner|sprite|program|thumbnail|player)/i.test(u))
      score -= 90;
    if (/(nimg\.jp|nicovideo\.jp|dcdn|cdn)/i.test(u)) score += 10;
    return score;
  }
  function imageSizePenaltyOrBonus(img) {
    const rect = img.getBoundingClientRect();
    const wAttr = Number(img.getAttribute("width") || 0);
    const hAttr = Number(img.getAttribute("height") || 0);
    const w = Number(rect.width || 0) || wAttr || Number(img.naturalWidth || 0) || 0;
    const h = Number(rect.height || 0) || hAttr || Number(img.naturalHeight || 0) || 0;
    if (w > 0 && w > 96 || h > 0 && h > 96) return -999;
    if (w > 0 && w < 10 || h > 0 && h < 10) return -40;
    if (w > 0 && w <= 64 || h > 0 && h <= 64) return 16;
    if (w > 0 && w <= 96 || h > 0 && h <= 96) return 8;
    return 0;
  }
  function avatarElementHintScore(el) {
    const className = String(el.getAttribute?.("class") || "");
    const id = String(el.getAttribute?.("id") || "");
    const alt = String(el.getAttribute?.("alt") || "");
    const aria = String(el.getAttribute?.("aria-label") || "");
    const dataTest = String(el.getAttribute?.("data-testid") || "");
    const all = `${className} ${id} ${alt} ${aria} ${dataTest}`;
    if (/(avatar|icon|user|profile|face)/i.test(all)) return 24;
    return 0;
  }
  function extractUserIdFromNicoUserIconUrlString(raw) {
    const s = String(raw || "");
    let m = s.match(/\/usericon\/(?:s\/)?(\d+)\/(\d+)\./i);
    if (m?.[2]) return m[2];
    m = s.match(/nicoaccount\/usericon\/(\d+)/i);
    if (m?.[1] && m[1].length >= 5) return m[1];
    return null;
  }
  function extractUserIdFromIconSrc(el) {
    if (!el || el.nodeType !== 1) return null;
    const imgs = el.querySelectorAll("img");
    for (const img of imgs) {
      if (!(img instanceof HTMLImageElement)) continue;
      for (const raw of collectNicoUserIconUrlPartsFromImg(img)) {
        if (!looksLikeNicoUserIconUrl(raw)) continue;
        const id = extractUserIdFromNicoUserIconUrlString(raw);
        if (id) return id;
      }
    }
    const av = extractUserIconUrlFromElement(el);
    if (av) return extractUserIdFromNicoUserIconUrlString(av);
    return null;
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
  function urlsFromCssLikeValue(raw) {
    const s = String(raw || "");
    if (!s) return [];
    const out = [];
    const re = /url\((['"]?)(.*?)\1\)/gi;
    let m;
    while ((m = re.exec(s)) != null) {
      const u = String(m[2] || "").trim();
      if (u) out.push(u);
    }
    return out;
  }
  function absoluteLikelyAvatarFromImg(img, baseHref) {
    const base = String(baseHref || "").trim() || "https://live.nicovideo.jp/";
    if (!(img instanceof HTMLImageElement)) return "";
    let best = "";
    let bestScore = -999;
    const sizeScore = imageSizePenaltyOrBonus(img);
    if (sizeScore <= -900) return "";
    const hintScore = avatarElementHintScore(img);
    for (const raw of collectNicoUserIconUrlPartsFromImg(img)) {
      const abs = toAbsoluteHttpUrl(raw, base);
      if (!abs) continue;
      const score = avatarUrlHeuristicScore(abs) + sizeScore + hintScore;
      if (score > bestScore) {
        bestScore = score;
        best = abs;
      }
    }
    return bestScore >= 25 ? best : "";
  }
  function absoluteNicoUserIconFromElementAttrs(el, baseHref) {
    if (!el || el.nodeType !== 1) return "";
    const base = String(baseHref || "").trim() || "https://live.nicovideo.jp/";
    const attrs = [
      "src",
      "data-src",
      "data-original",
      "data-lazy-src",
      "data-url",
      "data-avatar-url",
      "style"
    ];
    const rawCandidates = [];
    for (const a of attrs) {
      const v = el.getAttribute?.(a);
      if (!v) continue;
      rawCandidates.push(String(v).trim());
      if (a === "style") {
        rawCandidates.push(...urlsFromCssLikeValue(v));
      }
    }
    const inlineBg = (
      /** @type {HTMLElement} */
      el.style?.backgroundImage || ""
    );
    if (inlineBg) rawCandidates.push(...urlsFromCssLikeValue(inlineBg));
    try {
      const win = el.ownerDocument?.defaultView;
      if (win && el instanceof win.HTMLElement) {
        const computedBg = win.getComputedStyle(el).backgroundImage;
        if (computedBg) rawCandidates.push(...urlsFromCssLikeValue(computedBg));
      }
    } catch {
    }
    let best = "";
    let bestScore = -999;
    const hintScore = avatarElementHintScore(el);
    for (const raw of rawCandidates) {
      const abs = toAbsoluteHttpUrl(raw, base);
      if (!abs) continue;
      let score = avatarUrlHeuristicScore(abs) + hintScore;
      const rect = (
        /** @type {HTMLElement} */
        el.getBoundingClientRect?.()
      );
      const w = Number(rect?.width || 0);
      const h = Number(rect?.height || 0);
      if (w > 0 && w > 120 || h > 0 && h > 120) score -= 50;
      if (score > bestScore) {
        bestScore = score;
        best = abs;
      }
    }
    return bestScore >= 25 ? best : "";
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
    for (const img of imgs) {
      const abs = absoluteLikelyAvatarFromImg(
        /** @type {HTMLImageElement} */
        img,
        base
      );
      if (abs) return abs;
    }
    const nodes = [el, ...el.querySelectorAll("*")];
    for (let i = 0; i < nodes.length && i < 120; i += 1) {
      if (nodes[i] instanceof HTMLImageElement) continue;
      const abs = absoluteNicoUserIconFromElementAttrs(nodes[i], base);
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
  function extractUserIdFromReactFiberSelfOnly(el) {
    if (!el || el.nodeType !== 1) return null;
    const fiber = getReactFiber(el);
    if (!fiber) return null;
    return pickUserIdFromFiber(fiber);
  }
  function extractUserIdFromReactFiberInSubtree(root, maxNodes = 56, opts = {}) {
    if (!root || root.nodeType !== 1) return null;
    const skipRoot = Boolean(opts.skipRoot);
    const queue = [];
    if (!skipRoot) queue.push(root);
    for (const c of root.children) queue.push(c);
    let seen = 0;
    while (queue.length > 0 && seen < maxNodes) {
      const el = queue.shift();
      if (!el || el.nodeType !== 1) continue;
      seen += 1;
      const id = extractUserIdFromReactFiberSelfOnly(el);
      if (id) return id;
      for (const c of el.children) queue.push(c);
    }
    return null;
  }
  function resolveUserIdForNicoLiveCommentRow(row) {
    if (!row || row.nodeType !== 1) return null;
    const fromAttr = row.getAttribute("data-user-id") || row.getAttribute("data-userid") || row.getAttribute("data-owner-id") || "";
    let userId = String(fromAttr || "").trim() || null;
    if (!userId) userId = extractUserIdFromLinks(row);
    if (!userId) userId = extractUserIdFromIconSrc(row);
    if (!userId) userId = extractUserIdFromDataAttributes(row);
    if (!userId) {
      userId = extractUserIdFromReactFiberInSubtree(row, 56, { skipRoot: true });
    }
    if (!userId) userId = extractUserIdFromOuterHtml(row);
    return userId;
  }
  function cleanNicknameCandidate(raw) {
    const t = String(raw ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (!t || t.length > 128) return "";
    if (/^https?:\/\//i.test(t)) return "";
    return t;
  }
  function extractNicknameFromNicoLiveCommentRow(row, commentText) {
    if (!row || row.nodeType !== 1) return "";
    const bodyNorm = String(commentText || "").replace(/\s+/g, " ").trim();
    const accept = (n) => {
      const s = cleanNicknameCandidate(n);
      if (!s) return "";
      if (bodyNorm && s === bodyNorm) return "";
      return s;
    };
    try {
      const links = row.querySelectorAll('a[href*="/user/"]');
      for (const a of links) {
        const t = accept(a.getAttribute("title") || "");
        if (t) return t;
        const ar = accept(a.getAttribute("aria-label") || "");
        if (ar) return ar;
      }
    } catch {
    }
    const dataHints = [
      row.getAttribute("data-user-name"),
      row.getAttribute("data-username"),
      row.getAttribute("data-display-name")
    ];
    for (const d of dataHints) {
      const t = accept(d || "");
      if (t) return t;
    }
    try {
      const namedChild = row.querySelector("[data-user-name]");
      if (namedChild) {
        const t = accept(namedChild.getAttribute("data-user-name") || "");
        if (t) return t;
      }
    } catch {
    }
    const fromFiber = extractNicknameFromReactFiberInSubtree(row, 56, {
      skipRoot: true
    });
    if (fromFiber) {
      const t = accept(fromFiber);
      if (t) return t;
    }
    return "";
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
    "uid",
    "rawUserId",
    "raw_user_id",
    "anonymousUserId",
    "userIdHash"
  ];
  function walkFiberForUserId(fiber, maxDepth) {
    let cur = fiber;
    for (let i = 0; i < maxDepth && cur; i++) {
      const id = pickUserIdFromFiber(cur);
      if (id) return id;
      cur = cur.return;
    }
    return null;
  }
  function pickUserIdFromFiber(fiber) {
    if (!fiber || typeof fiber !== "object") return null;
    for (const bag of [fiber.memoizedProps, fiber.pendingProps]) {
      const id = pickUserIdFromBag(bag);
      if (id) return id;
    }
    return null;
  }
  function looksLikeUserId(s) {
    if (!s) return false;
    if (/^\d{4,14}$/.test(s)) return true;
    if (/^[a-zA-Z0-9_-]{8,64}$/.test(s)) return true;
    if (/^[a-zA-Z0-9]{2}:[a-zA-Z0-9_-]{4,}$/.test(s)) return true;
    return false;
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
      if (looksLikeUserId(s)) return s;
    }
    for (const key of ["comment", "data", "item", "chat", "message", "user", "sender", "commenter"]) {
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
        if (looksLikeUserId(s)) return s;
      }
    }
    if (typeof obj.user === "object" && obj.user) {
      const u = (
        /** @type {Record<string, unknown>} */
        obj.user
      );
      if (typeof u.id === "number" && u.id > 0) return String(u.id);
      if (typeof u.id === "string" && looksLikeUserId(String(u.id).trim())) return String(u.id).trim();
    }
    return null;
  }
  var NICKNAME_PROP_KEYS = [
    "name",
    "nickname",
    "nickName",
    "userName",
    "screenName",
    "handleName",
    "displayName",
    "userNickname",
    "senderName",
    "profileName"
  ];
  function pickNicknameFromBag(bag) {
    if (!bag || typeof bag !== "object") return "";
    const obj = (
      /** @type {Record<string, unknown>} */
      bag
    );
    for (const key of NICKNAME_PROP_KEYS) {
      const v = obj[key];
      if (v == null) continue;
      const s = cleanNicknameCandidate(String(v));
      if (s) return s;
    }
    for (const key of ["comment", "data", "item", "chat", "message"]) {
      const nested = obj[key];
      if (!nested || typeof nested !== "object") continue;
      const nestedObj = (
        /** @type {Record<string, unknown>} */
        nested
      );
      for (const nk of NICKNAME_PROP_KEYS) {
        const v = nestedObj[nk];
        if (v == null) continue;
        const s = cleanNicknameCandidate(String(v));
        if (s) return s;
      }
    }
    return "";
  }
  function pickNicknameFromFiber(fiber) {
    if (!fiber || typeof fiber !== "object") return "";
    const f = (
      /** @type {{ memoizedProps?: unknown, pendingProps?: unknown }} */
      fiber
    );
    for (const bag of [f.memoizedProps, f.pendingProps]) {
      const n = pickNicknameFromBag(bag);
      if (n) return n;
    }
    return "";
  }
  function extractNicknameFromReactFiberSelfOnly(el) {
    if (!el || el.nodeType !== 1) return "";
    const fiber = getReactFiber(el);
    if (!fiber) return "";
    return pickNicknameFromFiber(fiber);
  }
  function extractNicknameFromReactFiberInSubtree(root, maxNodes = 56, opts = {}) {
    if (!root || root.nodeType !== 1) return "";
    const skipRoot = Boolean(opts.skipRoot);
    const queue = [];
    if (!skipRoot) queue.push(root);
    for (const c of root.children) queue.push(c);
    let seen = 0;
    while (queue.length > 0 && seen < maxNodes) {
      const el = queue.shift();
      if (!el || el.nodeType !== 1) continue;
      seen += 1;
      const n = extractNicknameFromReactFiberSelfOnly(el);
      if (n) return n;
      for (const c of el.children) queue.push(c);
    }
    return "";
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
    const numEl = row.querySelector(".comment-number");
    const textEl = row.querySelector(".comment-text");
    if (!numEl || !textEl) return null;
    const commentNo = String(numEl.textContent || "").replace(/\s+/g, "").trim();
    if (!commentNo || !/^\d{1,18}$/.test(commentNo)) return null;
    const text = String(textEl.textContent || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (!text) return null;
    const userId = resolveUserIdForNicoLiveCommentRow(row);
    const base = documentBaseHref(row.ownerDocument) || "https://live.nicovideo.jp/";
    const avatarUrl = extractUserIconUrlFromElement(row, base);
    const nickname = extractNicknameFromNicoLiveCommentRow(row, text);
    const out = { commentNo, text, userId };
    if (nickname) out.nickname = nickname;
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
  function closestHarvestableNicoCommentRow(el) {
    if (!el || el.nodeType !== 1) return null;
    const row = el.closest?.('div.table-row[role="row"]') || el.closest?.("div.table-row");
    if (!row) return null;
    if (!row.querySelector?.(".comment-number") || !row.querySelector?.(".comment-text"))
      return null;
    return row;
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
    const maybeAdd = (r) => {
      if (!r.querySelector?.(".comment-number") || !r.querySelector?.(".comment-text"))
        return;
      set.add(r);
    };
    try {
      if (el.matches?.("div.table-row")) maybeAdd(el);
      el.querySelectorAll?.("div.table-row").forEach((r) => maybeAdd(r));
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
    const genericQuery = tableRows.length > 0 ? 'li,[role="listitem"]' : ROW_QUERY;
    if (genericQuery) {
      try {
        el.querySelectorAll(genericQuery).forEach((node) => {
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

  // src/lib/liveAudienceDom.js
  var MAX_REASONABLE_VIEWERS = 12e6;
  function normalizeDigitsForViewerScan(text) {
    let s = String(text || "");
    const fw = "\uFF10\uFF11\uFF12\uFF13\uFF14\uFF15\uFF16\uFF17\uFF18\uFF19\uFF0C";
    const hw = "0123456789,";
    for (let i = 0; i < fw.length; i++) {
      s = s.split(fw[i]).join(hw[i]);
    }
    return s;
  }
  function gatherWatchPageTextForViewerScan(doc) {
    if (!doc) return "";
    const chunks = [];
    const pushRootText = (root) => {
      if (!root) return;
      try {
        const body = root instanceof Document ? root.body : root;
        if (body) {
          chunks.push(String(body.textContent || ""));
          if ("innerText" in body) {
            chunks.push(
              String(
                /** @type {HTMLElement} */
                body.innerText || ""
              )
            );
          }
        }
      } catch {
      }
    };
    pushRootText(doc);
    try {
      doc.querySelectorAll("iframe").forEach((frame) => {
        try {
          const idoc = frame.contentDocument;
          if (idoc) pushRootText(idoc);
        } catch {
        }
      });
    } catch {
    }
    const pushShadowTexts = (root, depth) => {
      if (!root || depth < 0) return;
      try {
        root.querySelectorAll("*").forEach((el) => {
          const sr = (
            /** @type {HTMLElement} */
            el.shadowRoot
          );
          if (sr) {
            chunks.push(String(sr.textContent || ""));
            pushShadowTexts(sr, depth - 1);
          }
        });
      } catch {
      }
    };
    try {
      if (doc.body) pushShadowTexts(doc.body, 8);
    } catch {
    }
    try {
      doc.querySelectorAll("[aria-label], [title]").forEach((el) => {
        chunks.push(String(el.getAttribute("aria-label") || ""));
        chunks.push(String(el.getAttribute("title") || ""));
      });
    } catch {
    }
    return chunks.join("\n");
  }
  function parseViewerCountFromLooseText(chunk) {
    const raw = normalizeDigitsForViewerScan(chunk);
    const s = String(raw || "").replace(/\s+/g, " ");
    const patterns = [
      /(\d[\d,]*)\s*人が視聴/,
      /(\d[\d,]*)\s*人\s*が\s*視聴/,
      /(\d[\d,]*)\s*人\s*視聴中/,
      /(\d[\d,]*)\s*名が視聴/,
      /視聴者数\s*[：:\u3000\s]*(\d[\d,]*)(?!\d)/,
      /視聴者\s*(\d[\d,]*)(?!\d)/,
      /(\d[\d,]*)\s*人\s*が\s*オンライン/,
      /同時視聴\s*[:：]?\s*(\d[\d,]*)(?!\d)/,
      /(\d[\d,]*)\s*人\s*が\s*見てます/,
      /([\d,]+)\s+viewers?\b/i,
      /(\d[\d,]*)\s*人(?=[^\d]{0,16}視聴)/,
      /視聴[^0-9]{0,40}(\d[\d,]*)\s*人/,
      /来場\s*(\d[\d,]*)\s*人/,
      /(\d[\d,]*)\s*人\s*来場/
    ];
    for (const re of patterns) {
      const m = s.match(re);
      if (!m?.[1]) continue;
      const n = parseInt(String(m[1]).replace(/,/g, ""), 10);
      if (!Number.isFinite(n) || n < 0 || n > MAX_REASONABLE_VIEWERS) continue;
      return n;
    }
    return null;
  }
  function parseLiveViewerCountFromDocument(doc) {
    if (!doc || !doc.body) return null;
    const merged = gatherWatchPageTextForViewerScan(doc);
    const flat = merged.replace(/\s+/g, " ");
    const fromMerged = parseViewerCountFromLooseText(flat);
    if (fromMerged != null) return fromMerged;
    const tags = "span,div,p,strong,li,button,a,em,time,h2,h3,td,th,label";
    try {
      const nodes = doc.querySelectorAll(tags);
      for (const el of nodes) {
        const t = String(el.textContent || "").replace(/\s+/g, " ").trim();
        if (t.length > 200) continue;
        if (!/視聴|viewers?/i.test(t)) continue;
        const hit = parseViewerCountFromLooseText(t);
        if (hit != null) return hit;
      }
    } catch {
    }
    const fromScripts = parseViewerCountFromInlineScripts(doc);
    if (fromScripts != null) return fromScripts;
    return null;
  }
  function parseViewerCountFromInlineScripts(doc) {
    if (!doc) return null;
    const maxLen = 8e5;
    try {
      const scripts = doc.querySelectorAll("script:not([src])");
      for (const s of scripts) {
        const t = String(s.textContent || "");
        if (t.length < 30 || t.length > maxLen) continue;
        if (!/viewer|watching|watchCount|viewCount|視聴|listen|audience/i.test(t)) {
          continue;
        }
        const res = [
          /"watching(?:User)?Count"\s*:\s*(\d+)/i,
          /"viewerCount"\s*:\s*(\d+)/i,
          /"viewCount"\s*:\s*(\d+)/i,
          /"watchCount"\s*:\s*(\d+)/i,
          /"watching_count"\s*:\s*(\d+)/i,
          /watchingCount["']?\s*:\s*(\d+)/i,
          /viewerCount["']?\s*:\s*(\d+)/i
        ];
        for (const re of res) {
          const m = t.match(re);
          if (!m?.[1]) continue;
          const n = parseInt(m[1], 10);
          if (Number.isFinite(n) && n >= 0 && n <= MAX_REASONABLE_VIEWERS) {
            return n;
          }
        }
      }
    } catch {
    }
    return null;
  }
  function parseViewerCountFromSnapshotMetas(metas) {
    if (!Array.isArray(metas) || !metas.length) return null;
    const chunks = [];
    for (const m of metas) {
      const v = String(m?.value || "");
      if (!v) continue;
      if (/視聴|viewer/i.test(v)) chunks.push(v);
    }
    if (!chunks.length) return null;
    return parseViewerCountFromLooseText(chunks.join(" "));
  }

  // src/lib/commentHarvest.js
  var HARVEST_SCROLL_STEP_CLIENT_HEIGHT_RATIO = 0.46;
  function mergeVirtualHarvestRows(prev, next) {
    const uidN = String(next.userId ?? "").trim();
    const uidP = String(prev.userId ?? "").trim();
    const userId = uidN || uidP || null;
    const nickN = String(next.nickname ?? "").trim();
    const nickP = String(prev.nickname ?? "").trim();
    const nickname = nickN || nickP;
    const avN = String(next.avatarUrl ?? "").trim();
    const avP = String(prev.avatarUrl ?? "").trim();
    const avatarUrl = (isHttpOrHttpsUrl(avN) ? avN : "") || (isHttpOrHttpsUrl(avP) ? avP : "");
    const commentNo = String(next.commentNo ?? prev.commentNo ?? "").trim();
    const text = String(next.text ?? prev.text ?? "").trim();
    const out = { commentNo, text, userId };
    if (nickname) out.nickname = nickname;
    if (avatarUrl) out.avatarUrl = avatarUrl;
    return out;
  }
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
  function pageUserLikelyTypingIn(doc) {
    const ae = doc.activeElement;
    if (!ae || ae.nodeType !== Node.ELEMENT_NODE) return false;
    const el = (
      /** @type {Element} */
      ae
    );
    const tag = el.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") {
      const t = (
        /** @type {HTMLInputElement} */
        el.type
      );
      return t === "text" || t === "search" || t === "email" || t === "url" || t === "tel" || t === "";
    }
    return (
      /** @type {HTMLElement} */
      el.isContentEditable === true
    );
  }
  async function harvestVirtualCommentList(opts) {
    const doc = opts.document || document;
    const extract = opts.extractCommentsFromNode;
    const waitMs = opts.waitMs ?? 50;
    const respectTyping = opts.respectTyping !== false;
    const twoPass = Boolean(opts.twoPass);
    const twoPassGapMs = opts.twoPassGapMs ?? 140;
    const scrollStepRatio = typeof opts.scrollStepClientHeightRatio === "number" ? opts.scrollStepClientHeightRatio : HARVEST_SCROLL_STEP_CLIENT_HEIGHT_RATIO;
    const quietScroll = Boolean(opts.quietScroll);
    const panel = findNicoCommentPanel(doc);
    const scanRoot = panel || doc.body;
    if (!extract) return [];
    const mergeInto = (map, rows) => {
      for (const row of rows) {
        const no = String(row.commentNo ?? "").trim();
        const text = String(row.text ?? "").trim();
        if (!text) continue;
        const k = no ? `${no}	${text}` : text;
        const existing = map.get(k);
        if (!existing) {
          map.set(k, row);
          continue;
        }
        map.set(k, mergeVirtualHarvestRows(existing, row));
      }
    };
    const runVirtualScrollSweep = async (map, restoreFocusAfter) => {
      const host = panel ? (
        /** @type {HTMLElement|null} */
        findCommentListScrollHost(doc)
      ) : null;
      if (!host || host.scrollHeight <= host.clientHeight + 10) {
        mergeInto(map, extract(scanRoot));
        return;
      }
      if (respectTyping && pageUserLikelyTypingIn(doc)) {
        mergeInto(map, extract(scanRoot));
        return;
      }
      const qsOrig = quietScroll ? {
        opacity: host.style.opacity,
        pointerEvents: host.style.pointerEvents,
        transition: host.style.transition
      } : null;
      if (quietScroll) {
        host.style.transition = "none";
        host.style.opacity = "0";
        host.style.pointerEvents = "none";
      }
      try {
        const saved = host.scrollTop;
        const max = Math.max(0, host.scrollHeight - host.clientHeight);
        const step = Math.max(64, Math.floor(host.clientHeight * scrollStepRatio));
        host.scrollTop = 0;
        await raf(doc);
        await delay(waitMs);
        mergeInto(map, extract(scanRoot));
        for (let y = 0; y <= max; y += step) {
          host.scrollTop = Math.min(y, max);
          await raf(doc);
          await delay(waitMs);
          mergeInto(map, extract(scanRoot));
        }
        host.scrollTop = max;
        await raf(doc);
        await delay(waitMs);
        mergeInto(map, extract(scanRoot));
        host.scrollTop = saved;
        await raf(doc);
        await delay(30);
      } finally {
        if (qsOrig) {
          host.style.opacity = qsOrig.opacity;
          host.style.pointerEvents = qsOrig.pointerEvents;
          host.style.transition = qsOrig.transition;
        }
      }
      if (restoreFocusAfter && focusEl && focusEl.isConnected) {
        try {
          focusEl.focus({ preventScroll: true });
        } catch {
          try {
            focusEl.focus();
          } catch {
          }
        }
      }
    };
    const focusEl = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
    const out = /* @__PURE__ */ new Map();
    await runVirtualScrollSweep(out, !twoPass);
    if (twoPass) {
      await delay(twoPassGapMs);
      opts.onBetweenVirtualPasses?.();
      await runVirtualScrollSweep(out, true);
    }
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
    if (w < 260 || h < 140) return false;
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
  var INLINE_VIEWPORT_BESIDE_MIN_WIDTH = 1200;
  function effectiveInlinePanelPlacement(storedPlacement, viewportInnerWidth) {
    let s = String(storedPlacement || "").trim();
    if (!s) s = "dock_bottom";
    const w = Number(viewportInnerWidth) || 0;
    if (s === "beside" && w > 0 && w < INLINE_VIEWPORT_BESIDE_MIN_WIDTH) {
      return "below";
    }
    return s;
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

  // src/lib/embeddedDataExtract.js
  function extractEmbeddedDataProps(doc) {
    if (!doc) return null;
    try {
      const el = doc.getElementById("embedded-data") || doc.querySelector("#embedded-data");
      if (!el) return null;
      let raw = el.getAttribute("data-props") || "";
      if (!raw) return null;
      if (raw.includes("&quot;")) raw = raw.replace(/&quot;/g, '"');
      if (raw.includes("&amp;")) raw = raw.replace(/&amp;/g, "&");
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
      return obj;
    } catch {
      return null;
    }
  }
  function pickViewerCountFromEmbeddedData(props) {
    if (!props || typeof props !== "object") return null;
    const wc = props?.program?.statistics?.watchCount;
    if (wc == null) return null;
    const n = typeof wc === "number" ? wc : parseInt(String(wc), 10);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  }
  function pickProgramBeginAt(props) {
    if (!props || typeof props !== "object") return null;
    const candidates = [
      props?.program?.beginAt,
      props?.program?.beginTime,
      props?.program?.openTime,
      props?.program?.vposBaseAt,
      props?.program?.schedule?.begin,
      props?.program?.schedule?.openTime,
      props?.socialGroup?.programBeginTime,
      props?.program?.nicoliveProgramId ? void 0 : void 0
    ];
    for (const c of candidates) {
      if (c == null) continue;
      if (typeof c === "string" && c.length >= 10) {
        const t = new Date(c).getTime();
        if (Number.isFinite(t) && t > 0) return t;
      }
      if (typeof c === "number" && Number.isFinite(c) && c > 0) {
        return c < 1e12 ? c * 1e3 : c;
      }
    }
    return null;
  }

  // src/lib/concurrentEstimate.js
  var DEFAULT_WINDOW_MS = 5 * 60 * 1e3;
  var DIRECT_VIEWERS_FRESH_MS = 90 * 1e3;
  var DIRECT_VIEWERS_NOWCAST_MAX_MS = 210 * 1e3;
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function countRecentActiveUsers(userTimestamps, now, windowMs) {
    const w = typeof windowMs === "number" && windowMs > 0 ? windowMs : DEFAULT_WINDOW_MS;
    const cutoff = now - w;
    let count = 0;
    for (const ts of userTimestamps.values()) {
      if (ts >= cutoff) count++;
    }
    return count;
  }
  function calcCommentCaptureRatio({
    previousStatisticsComments,
    currentStatisticsComments,
    receivedCommentsDelta
  }) {
    const prev = Number(previousStatisticsComments);
    const curr = Number(currentStatisticsComments);
    const received = Number(receivedCommentsDelta);
    if (!Number.isFinite(prev) || !Number.isFinite(curr)) return 1;
    const statsDelta = curr - prev;
    if (!(statsDelta > 0)) return 1;
    if (!Number.isFinite(received)) return 0;
    return clamp(received / statsDelta, 0, 1);
  }

  // src/lib/officialStatsWindow.js
  function summarizeOfficialCommentHistory({
    history,
    nowMs,
    targetWindowMs = 60 * 1e3,
    minWindowMs = 15 * 1e3
  }) {
    if (!Array.isArray(history) || history.length < 2) return null;
    const now = typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : Date.now();
    const valid = history.map((sample) => ({
      at: Number(sample?.at),
      statisticsComments: Number(sample?.statisticsComments),
      recordedComments: Number(sample?.recordedComments)
    })).filter(
      (sample) => Number.isFinite(sample.at) && sample.at <= now && Number.isFinite(sample.statisticsComments) && sample.statisticsComments >= 0 && Number.isFinite(sample.recordedComments) && sample.recordedComments >= 0
    ).sort((a, b) => a.at - b.at);
    if (valid.length < 2) return null;
    const current = valid[valid.length - 1];
    let previous = null;
    for (let i = valid.length - 2; i >= 0; i -= 1) {
      const candidate = valid[i];
      const windowMs = current.at - candidate.at;
      if (!(windowMs >= minWindowMs)) continue;
      previous = candidate;
      if (windowMs >= targetWindowMs) break;
    }
    if (!previous) return null;
    const statisticsCommentsDelta = Math.max(
      0,
      current.statisticsComments - previous.statisticsComments
    );
    const receivedCommentsDelta = Math.max(
      0,
      current.recordedComments - previous.recordedComments
    );
    return {
      previousStatisticsComments: previous.statisticsComments,
      currentStatisticsComments: current.statisticsComments,
      receivedCommentsDelta,
      statisticsCommentsDelta,
      captureRatio: calcCommentCaptureRatio({
        previousStatisticsComments: previous.statisticsComments,
        currentStatisticsComments: current.statisticsComments,
        receivedCommentsDelta
      }),
      sampleWindowMs: Math.max(0, current.at - previous.at)
    };
  }

  // src/lib/watchSnapshotOfficialFields.js
  function buildWatchSnapshotOfficialFields(p) {
    const {
      nowMs,
      officialViewerCount: officialViewerCount2,
      officialCommentCount: officialCommentCount2,
      officialStatsUpdatedAt: officialStatsUpdatedAt2,
      officialCommentStatsUpdatedAt: ocStatsAtRaw,
      officialViewerIntervalMs: officialViewerIntervalMs2,
      officialCommentSummary
    } = p;
    const officialCommentStatsUpdatedAt2 = typeof ocStatsAtRaw === "number" && Number.isFinite(ocStatsAtRaw) && ocStatsAtRaw > 0 ? ocStatsAtRaw : 0;
    return {
      officialViewerCount: typeof officialViewerCount2 === "number" && Number.isFinite(officialViewerCount2) && officialViewerCount2 >= 0 ? officialViewerCount2 : null,
      officialCommentCount: typeof officialCommentCount2 === "number" && Number.isFinite(officialCommentCount2) && officialCommentCount2 >= 0 ? officialCommentCount2 : null,
      officialStatsUpdatedAt: officialStatsUpdatedAt2 > 0 ? officialStatsUpdatedAt2 : null,
      officialStatsFreshnessMs: officialStatsUpdatedAt2 > 0 ? Math.max(0, nowMs - officialStatsUpdatedAt2) : null,
      officialCommentStatsUpdatedAt: officialCommentStatsUpdatedAt2 > 0 ? officialCommentStatsUpdatedAt2 : null,
      officialCommentStatsFreshnessMs: officialCommentStatsUpdatedAt2 > 0 ? Math.max(0, nowMs - officialCommentStatsUpdatedAt2) : null,
      officialViewerIntervalMs: typeof officialViewerIntervalMs2 === "number" && officialViewerIntervalMs2 > 0 ? officialViewerIntervalMs2 : null,
      officialStatisticsCommentsDelta: officialCommentSummary?.statisticsCommentsDelta ?? null,
      officialReceivedCommentsDelta: officialCommentSummary?.receivedCommentsDelta ?? null,
      officialCommentSampleWindowMs: officialCommentSummary?.sampleWindowMs ?? null,
      officialCaptureRatio: typeof officialCommentSummary?.captureRatio === "number" ? officialCommentSummary.captureRatio : null
    };
  }

  // src/lib/commentIngestLog.js
  var COMMENT_INGEST_LOG_VERSION = 1;
  var COMMENT_INGEST_LOG_MAX_ITEMS = 500;
  var COMMENT_INGEST_SOURCE = {
    NDGR: "ndgr",
    VISIBLE: "visible",
    MUTATION: "mutation",
    DEEP: "deep",
    UNKNOWN: "unknown"
  };
  var INGEST_LOG_VALID_SOURCES = (
    /** @type {ReadonlySet<string>} */
    new Set(Object.values(COMMENT_INGEST_SOURCE))
  );
  var COMMENT_INGEST_LOG_NDGR_MIN_INTERVAL_MS = 5e3;
  var COMMENT_INGEST_LOG_VISIBLE_MIN_INTERVAL_MS = 4e3;
  var COMMENT_INGEST_LOG_NDGR_MIN_ADDED = 3;
  var COMMENT_INGEST_LOG_VISIBLE_MIN_ADDED = 5;
  var INGEST_LOG_ALWAYS_LOG_TOTAL_DELTA = 10;
  var INGEST_LOG_COOLDOWN_RULES = (
    /** @type {Readonly<Record<string, { minIntervalMs: number, minAdded: number, minTotalDelta: number }>>} */
    {
      [COMMENT_INGEST_SOURCE.NDGR]: {
        minIntervalMs: COMMENT_INGEST_LOG_NDGR_MIN_INTERVAL_MS,
        minAdded: COMMENT_INGEST_LOG_NDGR_MIN_ADDED,
        minTotalDelta: INGEST_LOG_ALWAYS_LOG_TOTAL_DELTA
      },
      [COMMENT_INGEST_SOURCE.VISIBLE]: {
        minIntervalMs: COMMENT_INGEST_LOG_VISIBLE_MIN_INTERVAL_MS,
        minAdded: COMMENT_INGEST_LOG_VISIBLE_MIN_ADDED,
        minTotalDelta: INGEST_LOG_ALWAYS_LOG_TOTAL_DELTA
      }
    }
  );
  function normalizeIngestSource(src) {
    const s = String(src || "").trim().toLowerCase().slice(0, 32);
    return INGEST_LOG_VALID_SOURCES.has(s) ? s : COMMENT_INGEST_SOURCE.UNKNOWN;
  }
  function parseCommentIngestLog(raw) {
    if (!raw || typeof raw !== "object") {
      return { v: COMMENT_INGEST_LOG_VERSION, items: [] };
    }
    const o = (
      /** @type {Record<string, unknown>} */
      raw
    );
    const v = Number(o.v) || COMMENT_INGEST_LOG_VERSION;
    const items = Array.isArray(o.items) ? o.items : [];
    const out = [];
    for (const x of items) {
      if (!x || typeof x !== "object") continue;
      const it = (
        /** @type {Record<string, unknown>} */
        x
      );
      const t = Number(it.t);
      if (!Number.isFinite(t)) continue;
      const liveId2 = String(it.liveId || "").trim().toLowerCase();
      if (!liveId2) continue;
      const source = normalizeIngestSource(it.source);
      const batchIn = Math.max(0, Math.floor(Number(it.batchIn) || 0));
      const added = Math.max(0, Math.floor(Number(it.added) || 0));
      const totalAfter = Math.max(0, Math.floor(Number(it.totalAfter) || 0));
      let official = null;
      if (it.official != null && Number.isFinite(Number(it.official))) {
        const oc = Math.floor(Number(it.official));
        official = oc >= 0 ? oc : null;
      }
      out.push({ t, liveId: liveId2, source, batchIn, added, totalAfter, official });
    }
    return { v, items: out };
  }
  function appendCommentIngestLog(prevRaw, entry, maxItems = COMMENT_INGEST_LOG_MAX_ITEMS) {
    const base = parseCommentIngestLog(prevRaw);
    const cap = Math.max(16, Math.min(5e3, Math.floor(maxItems)));
    const official = entry.official != null && Number.isFinite(Number(entry.official)) ? Math.max(0, Math.floor(Number(entry.official))) : null;
    const row = {
      t: Math.max(0, Math.floor(Number(entry.t) || Date.now())),
      liveId: String(entry.liveId || "").trim().toLowerCase(),
      source: normalizeIngestSource(entry.source),
      batchIn: Math.max(0, Math.floor(Number(entry.batchIn) || 0)),
      added: Math.max(0, Math.floor(Number(entry.added) || 0)),
      totalAfter: Math.max(0, Math.floor(Number(entry.totalAfter) || 0)),
      official
    };
    const nextItems = [...base.items, row].slice(-cap);
    return { v: COMMENT_INGEST_LOG_VERSION, items: nextItems };
  }
  function maybeAppendCommentIngestLog(prevRaw, entry, maxItems = COMMENT_INGEST_LOG_MAX_ITEMS) {
    const base = parseCommentIngestLog(prevRaw);
    const lid = String(entry.liveId || "").trim().toLowerCase();
    const src = normalizeIngestSource(entry.source);
    const t = Math.max(0, Math.floor(Number(entry.t) || Date.now()));
    const added = Math.max(0, Math.floor(Number(entry.added) || 0));
    const totalAfter = Math.max(0, Math.floor(Number(entry.totalAfter) || 0));
    const cooldownRule = INGEST_LOG_COOLDOWN_RULES[src];
    if (!cooldownRule) {
      return appendCommentIngestLog(prevRaw, entry, maxItems);
    }
    let prevSame = null;
    for (let i = base.items.length - 1; i >= 0; i--) {
      const it = base.items[i];
      if (it.liveId === lid && it.source === src) {
        prevSame = it;
        break;
      }
    }
    if (prevSame) {
      const dt = t - prevSame.t;
      const totalDelta = totalAfter - prevSame.totalAfter;
      if (dt >= 0 && dt < cooldownRule.minIntervalMs && added < cooldownRule.minAdded && totalDelta >= 0 && totalDelta < cooldownRule.minTotalDelta) {
        return null;
      }
    }
    return appendCommentIngestLog(prevRaw, entry, maxItems);
  }

  // src/lib/migrateInlinePanelFloatToDock.js
  async function migrateFloatingInlinePanelToDockOnce(storage) {
    const bag = await storage.get([
      KEY_INLINE_PANEL_PLACEMENT,
      KEY_INLINE_PANEL_FLOAT_TO_DOCK_MIGRATED
    ]);
    if (bag[KEY_INLINE_PANEL_FLOAT_TO_DOCK_MIGRATED] === true) {
      return { changed: false };
    }
    const p = String(bag[KEY_INLINE_PANEL_PLACEMENT] ?? "").trim().toLowerCase();
    if (p !== INLINE_PANEL_PLACEMENT_FLOATING) {
      return { changed: false };
    }
    await storage.set({
      [KEY_INLINE_PANEL_PLACEMENT]: INLINE_PANEL_PLACEMENT_DOCK_BOTTOM,
      [KEY_INLINE_PANEL_FLOAT_TO_DOCK_MIGRATED]: true
    });
    return { changed: true };
  }

  // src/lib/persistThrottle.js
  function createPersistCoalescer(flushFn, minIntervalMs = 300, burstThreshold = 0) {
    let buffer = [];
    let timer = null;
    let lastFlushTime = 0;
    function enqueue(rows) {
      buffer.push(...rows);
      if (burstThreshold > 0 && buffer.length >= burstThreshold) {
        void flush();
        return;
      }
      if (timer) return;
      const delay2 = lastFlushTime ? Math.max(0, minIntervalMs - (Date.now() - lastFlushTime)) : 0;
      timer = setTimeout(flush, delay2);
    }
    async function flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (!buffer.length) return;
      const batch = buffer;
      buffer = [];
      lastFlushTime = Date.now();
      await flushFn(batch);
    }
    function clear() {
      buffer = [];
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }
    return { enqueue, flush, clear, pending: () => buffer.length };
  }

  // src/lib/enrichmentAvatarFallback.js
  function enrichmentAvatarWithCanonicalFallback(userId, interceptEntryAv, interceptMapAv, rowAv) {
    if (interceptEntryAv || interceptMapAv || rowAv) return "";
    return niconicoDefaultUserIconUrl(userId);
  }

  // src/lib/userEntryAvatarResolve.js
  function resolveUserEntryAvatarSignals(input) {
    const userId = String(input?.userId || "").trim();
    const rowAv = String(input?.rowAv || "").trim();
    const interceptEntryAv = String(input?.interceptEntryAv || "").trim();
    const interceptMapAv = String(input?.interceptMapAv || "").trim();
    const avatarObserved = Boolean(rowAv || interceptEntryAv || interceptMapAv);
    const canonicalFallback = enrichmentAvatarWithCanonicalFallback(
      userId,
      interceptEntryAv,
      interceptMapAv,
      rowAv
    );
    const displayAvatarUrl = pickStrongestAvatarUrlForUser(userId, [
      interceptEntryAv,
      interceptMapAv,
      rowAv,
      canonicalFallback
    ]) || "";
    return { displayAvatarUrl, avatarObserved };
  }

  // src/lib/reportSilentError.js
  var MESSAGE_MAX2 = 200;
  function isContextInvalidatedError(err) {
    const msg = err && typeof err === "object" && "message" in err ? String(
      /** @type {{ message?: unknown }} */
      err.message || ""
    ) : String(err || "");
    return msg.includes("Extension context invalidated");
  }
  function buildSilentErrorPayload(context, err, liveId2) {
    const invalidated = isContextInvalidatedError(err);
    let message;
    if (err !== null && typeof err === "object" && "message" in err && typeof /** @type {{ message?: unknown }} */
    err.message === "string") {
      message = /** @type {{ message: string }} */
      err.message.slice(0, MESSAGE_MAX2);
    } else if (typeof err === "string") {
      message = err.slice(0, MESSAGE_MAX2);
    }
    const id = liveId2 == null ? void 0 : String(liveId2).trim() || void 0;
    return {
      context,
      at: Date.now(),
      shouldReport: !invalidated,
      ...message !== void 0 ? { message } : {},
      ...id ? { liveId: id } : {}
    };
  }

  // src/lib/cleanNdgrChatRows.js
  function cleanNdgrChatRows(raw) {
    const cleaned = [];
    for (const x of raw) {
      if (!x || typeof x !== "object") continue;
      const commentNo = String(
        /** @type {any} */
        x.commentNo ?? ""
      ).trim();
      const text = String(
        /** @type {any} */
        x.text ?? ""
      );
      if (!commentNo) continue;
      const uid = String(
        /** @type {any} */
        x.userId ?? ""
      ).trim();
      const row = { commentNo, text, userId: uid || null };
      const nick = String(
        /** @type {any} */
        x.nickname ?? ""
      ).trim();
      if (nick) row.nickname = nick;
      if (
        /** @type {any} */
        x.vpos != null
      ) row.vpos = /** @type {any} */
      x.vpos;
      if (
        /** @type {any} */
        x.accountStatus != null
      ) row.accountStatus = /** @type {any} */
      x.accountStatus;
      if (
        /** @type {any} */
        x.is184
      ) row.is184 = true;
      cleaned.push(row);
    }
    return cleaned;
  }

  // src/lib/trimMap.js
  function trimMapToMax(map, max) {
    if (map.size <= max) return;
    const excess = map.size - max;
    const iter = map.keys();
    for (let i = 0; i < excess; i++) {
      const key = iter.next().value;
      if (key != null) map.delete(key);
    }
  }

  // src/lib/commentSubmitSteps.js
  function diagnosePersistGate(input) {
    const CHECKS = [
      { key: "hasRows", check: (v) => !!v },
      { key: "recording", check: (v) => !!v },
      { key: "liveId", check: (v) => !!v },
      { key: "locationAllows", check: (v) => !!v },
      { key: "hasExtensionContext", check: (v) => !!v }
    ];
    const failures = CHECKS.filter((c) => !c.check(input[c.key])).map((c) => c.key);
    return { pass: failures.length === 0, failures };
  }

  // src/lib/timingConstants.js
  var INGEST_TIMING = (
    /** @type {const} */
    {
      debounceMs: 80,
      livePollMs: 4e3,
      statsPollMs: 45e3,
      panelScanMs: 550,
      ndgrFlushMs: 150,
      ndgrPendingThreshold: 240,
      ndgrPendingMax: 1200,
      interceptReconcileMs: 320,
      endedHarvestCheckMs: 4e3,
      coalescerMinMs: 300,
      // 高流量時は 300ms 待たずに早期 flush（体感レイテンシ短縮）。
      // NDGR_CHAT_ROWS_POST_CHUNK=220 より少し上に置き、1チャンク=即flushを避ける。
      coalescerBurstThreshold: 260,
      visibleScanDelayMs: 380,
      pageFrameLoopMs: 360
    }
  );
  var SUBMIT_TIMING = (
    /** @type {const} */
    {
      editorPollTimeoutMs: 8e3,
      editorPollIntervalMs: 50,
      reactSettleMs: 220,
      buttonPollTimeoutMs: 1200,
      buttonPollIntervalMs: 80
    }
  );
  var MAP_LIMITS = (
    /** @type {const} */
    {
      activeUserMax: 12e3,
      interceptMax: 5e4
    }
  );
  var HARVEST_TIMING = (
    /** @type {const} */
    {
      delayMs: 600,
      scrollWaitMs: 48,
      secondPassGapMs: 180,
      quietUiMs: 800,
      periodicMs: 12e4,
      stabilityFollowUpMs: 9e4,
      ndgrActiveThresholdMs: 6e4,
      deepRecoveryMs: 3e5
    }
  );

  // src/lib/deepHarvestReason.js
  var DEEP_HARVEST_REASONS = (
    /** @type {const} */
    {
      startup: "startup",
      recordingOn: "recording-on",
      liveIdChange: "live-id-change",
      tabVisible: "tab-visible"
    }
  );

  // src/lib/shouldSkipDeepHarvest.js
  function shouldSkipDeepHarvest({ ndgrLastReceivedAt: ndgrLastReceivedAt2, now, thresholdMs = 6e4 }) {
    if (!ndgrLastReceivedAt2 || ndgrLastReceivedAt2 <= 0) return false;
    const elapsed = now - ndgrLastReceivedAt2;
    return elapsed < thresholdMs;
  }
  function shouldForceDeepHarvestForReason(reason) {
    return String(reason || "").trim() === DEEP_HARVEST_REASONS.startup;
  }
  function shouldForceDeepHarvestRecovery({ lastCompletedAt, now, recoveryMs = 3e5 }) {
    if (!lastCompletedAt || lastCompletedAt <= 0) return true;
    return now - lastCompletedAt > recoveryMs;
  }

  // src/lib/commentPipelineLog.js
  var PIPELINE_LOG_PREFIX = "[comment-pipeline]";
  function formatPipelinePhase(phase, data) {
    const p = PIPELINE_LOG_PREFIX;
    switch (phase) {
      case "start":
        return `${p} \u958B\u59CB: liveId=${data.liveId}, existing=${data.existingCount}, incoming=${data.incomingCount}`;
      case "merge":
        return `${p} \u30DE\u30FC\u30B8: +${data.added}\u4EF6\u8FFD\u52A0, touched=${data.storageTouched}`;
      case "commit":
        return `${p} \u4FDD\u5B58: ${data.keysWritten}\u30AD\u30FC`;
      case "done":
        return `${p} \u5B8C\u4E86: \u5408\u8A08${data.totalCount}\u4EF6 (${data.elapsedMs}ms)`;
      case "skip":
        return `${p} \u30B9\u30AD\u30C3\u30D7: ${data.reason}`;
      default:
        return `${p} ${phase}: ${JSON.stringify(data)}`;
    }
  }

  // src/lib/deepExportPolicy.js
  function planDeepExportSweep(opts) {
    if (!opts.deep) {
      return {
        shouldRunSweep: false,
        quietScroll: true,
        skipReason: "not_deep_request"
      };
    }
    if (shouldSkipDeepHarvest({
      ndgrLastReceivedAt: opts.ndgrLastReceivedAt,
      now: opts.now,
      thresholdMs: opts.thresholdMs
    })) {
      return {
        shouldRunSweep: false,
        quietScroll: true,
        skipReason: "ndgr_active"
      };
    }
    return {
      shouldRunSweep: true,
      quietScroll: true,
      skipReason: ""
    };
  }

  // src/lib/inlineHostLayoutReset.js
  var INLINE_HOST_RESETTABLE_STYLE_PROPERTIES = Object.freeze([
    "position",
    "top",
    "right",
    "left",
    "bottom",
    "width",
    "maxWidth",
    "maxHeight",
    "marginLeft",
    "boxSizing",
    "overflow",
    "overflowX",
    "overflowY",
    "boxShadow",
    "borderRadius",
    "background",
    "zIndex"
  ]);
  var INLINE_HOST_PLACEMENT_CLASSES = Object.freeze([
    "nls-inline-host--floating",
    "nls-inline-host--dock-bottom"
  ]);
  function applyInlineHostPlacementReset(host) {
    if (!host) return;
    if (host.classList && typeof host.classList.remove === "function") {
      for (const cls of INLINE_HOST_PLACEMENT_CLASSES) {
        host.classList.remove(cls);
      }
    }
    if (host.style) {
      for (const prop of INLINE_HOST_RESETTABLE_STYLE_PROPERTIES) {
        host.style[prop] = "";
      }
    }
  }

  // src/lib/ndgrBacklog.js
  function shouldDeferNdgrFlushUntilLiveId(opts) {
    const recording2 = Boolean(opts?.recording);
    const locationAllows = Boolean(opts?.locationAllows);
    const liveId2 = String(opts?.liveId || "").trim();
    return recording2 && locationAllows && !liveId2;
  }
  function mergeNdgrBacklogWithCap(existing, incoming, cap) {
    const max = Number.isFinite(cap) ? Math.max(1, Math.floor(cap)) : 1;
    const merged = [...incoming, ...existing];
    if (merged.length <= max) return merged;
    return merged.slice(0, max);
  }

  // src/lib/mergeStoredCommentsWithIntercept.js
  function mergeStoredCommentsWithIntercept(entries, items) {
    if (!Array.isArray(entries) || !entries.length || !Array.isArray(items) || !items.length) {
      return { next: Array.isArray(entries) ? entries : [], patched: 0 };
    }
    const byNo = /* @__PURE__ */ new Map();
    for (const raw of items) {
      const no = String(raw?.no || "").trim();
      if (!no) continue;
      const prev = byNo.get(no) || { uid: "", name: "", av: "" };
      const uid = String(raw?.uid || "").trim() || prev.uid;
      const name = String(raw?.name || "").trim() || prev.name;
      const avRaw = String(raw?.av || "").trim();
      const av = (isHttpOrHttpsUrl(avRaw) ? avRaw : "") || prev.av;
      if (!uid && !name && !av) continue;
      byNo.set(no, { uid, name, av });
    }
    if (!byNo.size) return { next: entries, patched: 0 };
    let patched = 0;
    const next = entries.map((e) => {
      const no = String(
        /** @type {{ commentNo?: unknown }} */
        e?.commentNo || ""
      ).trim();
      if (!no) return e;
      const hit = byNo.get(no);
      if (!hit) return e;
      const curUid = String(
        /** @type {{ userId?: unknown }} */
        e?.userId || ""
      ).trim();
      const curNick = String(
        /** @type {{ nickname?: unknown }} */
        e?.nickname || ""
      ).trim();
      const curAv = String(
        /** @type {{ avatarUrl?: unknown }} */
        e?.avatarUrl || ""
      ).trim();
      const out = (
        /** @type {Record<string, unknown>} */
        { .../** @type {object} */
        e }
      );
      let changed = false;
      if (hit.uid) {
        const chosen = pickStrongerUserId(curUid, hit.uid);
        if (chosen !== curUid) {
          out.userId = chosen || null;
          changed = true;
        }
      }
      const curNickWeak = curNick === "\u533F\u540D" || curNick === "\uFF08\u672A\u53D6\u5F97\uFF09" || curNick === "(\u672A\u53D6\u5F97)";
      if (hit.name && (!curNick || curNickWeak || hit.name.length > curNick.length)) {
        out.nickname = hit.name;
        changed = true;
      }
      const uidForAv = String(out.userId || "").trim();
      const pickedAv = pickStrongestAvatarUrlForUser(uidForAv, [hit.av, curAv]);
      if (pickedAv && pickedAv !== curAv) {
        out.avatarUrl = pickedAv;
        changed = true;
      }
      if (hit.av && out.avatarObserved !== true) {
        out.avatarObserved = true;
        changed = true;
      }
      if (changed) {
        patched += 1;
        return out;
      }
      return e;
    });
    return { next, patched };
  }

  // src/lib/watchProgramEndState.js
  function isWatchProgramEndedText(text) {
    const s = String(text || "").trim();
    if (!s) return false;
    return /(公開終了|放送は終了|番組は終了|次回の放送をお楽しみ|タイムシフト)/.test(s);
  }
  function shouldRunEndedBulkHarvest(p) {
    if (!p?.recording) return false;
    if (!p?.locationAllows) return false;
    if (!p?.endedDetected) return false;
    const liveId2 = String(p?.liveId || "").trim();
    if (!liveId2) return false;
    const last = String(p?.lastTriggeredLiveId || "").trim();
    return liveId2 !== last;
  }

  // src/lib/interceptAvatarHydration.js
  function hydrateInterceptAvatarMapFromProfile(avatarMap, profileMap, allowedUserIds) {
    if (!(avatarMap instanceof Map) || !profileMap || typeof profileMap !== "object") {
      return 0;
    }
    const hasAllowSet = allowedUserIds instanceof Set && allowedUserIds.size > 0;
    let added = 0;
    for (const [uidRaw, rec] of Object.entries(profileMap)) {
      const uid = String(uidRaw || "").trim();
      if (hasAllowSet && !allowedUserIds.has(uid)) continue;
      if (!uid || avatarMap.has(uid)) continue;
      const av = String(rec?.avatarUrl || "").trim();
      if (!isHttpOrHttpsUrl(av)) continue;
      if (isWeakNiconicoUserIconHttpUrl(av)) continue;
      avatarMap.set(uid, av);
      added += 1;
    }
    return added;
  }

  // src/lib/commentPanelHealthProbe.js
  var LATEST_COMMENT_BUTTON_SELECTOR = 'button.indicator[aria-label="\u6700\u65B0\u30B3\u30E1\u30F3\u30C8\u306B\u623B\u308B"]';
  var COMMENT_PANEL_RESTORE_COOLDOWN_MS = 10 * 1e3;
  var COMMENT_PANEL_USER_SCROLL_LOCKOUT_MS = 5 * 1e3;
  var COMMENT_PANEL_SCROLLED_UP_THRESHOLD_PX = 200;
  var COMMENT_PANEL_OUT_OF_VIEWPORT_RATIO = 0.9;
  var KEY_COMMENT_PANEL_AUTO_RESTORE = "nls_comment_panel_auto_restore_enabled";
  function normalizeCommentPanelAutoRestoreEnabled(raw) {
    return raw !== false;
  }
  function decideCommentPanelRestoreAction(input) {
    const i = input || /** @type {CommentPanelHealthInput} */
    {};
    if (!i.enabled) return { action: "none", reason: "disabled" };
    const cooldownMs = Number.isFinite(i.cooldownMs) ? (
      /** @type {number} */
      i.cooldownMs
    ) : COMMENT_PANEL_RESTORE_COOLDOWN_MS;
    const lastAt = Number(i.lastActionAt) || 0;
    const now = Number(i.now) || 0;
    if (lastAt > 0 && now - lastAt < cooldownMs) {
      return { action: "none", reason: "cooldown" };
    }
    const userScrollAt = Number(i.lastUserScrollAt) || 0;
    const userScrollLockoutMs = Number.isFinite(i.userScrollLockoutMs) ? (
      /** @type {number} */
      i.userScrollLockoutMs
    ) : COMMENT_PANEL_USER_SCROLL_LOCKOUT_MS;
    if (userScrollAt > 0 && now - userScrollAt < userScrollLockoutMs) {
      return { action: "none", reason: "user_scrolling" };
    }
    if (!i.panelPresent) return { action: "none", reason: "panel_missing" };
    const vh = Number(i.viewportHeight) || 0;
    if (vh > 0 && i.panelRect && Number.isFinite(i.panelRect.top) && Number.isFinite(i.panelRect.height)) {
      const top = Number(i.panelRect.top);
      const height = Number(i.panelRect.height);
      const bottom = top + height;
      if (top > vh * COMMENT_PANEL_OUT_OF_VIEWPORT_RATIO || bottom <= 0) {
        return { action: "scroll_panel_into_view", reason: "out_of_viewport" };
      }
    }
    if (i.hasLatestButton) {
      return { action: "click_latest_button", reason: "scrolled_up_button" };
    }
    const host = i.scrollHost;
    if (host && Number.isFinite(host.scrollTop) && Number.isFinite(host.scrollHeight) && Number.isFinite(host.clientHeight)) {
      const scrollTop = Number(host.scrollTop);
      const scrollHeight = Number(host.scrollHeight);
      const clientHeight = Number(host.clientHeight);
      if (scrollHeight > clientHeight + 100) {
        const bottomGap = scrollHeight - clientHeight - scrollTop;
        if (bottomGap > COMMENT_PANEL_SCROLLED_UP_THRESHOLD_PX) {
          return { action: "click_latest_button", reason: "scrolled_up_gap" };
        }
      }
    }
    return { action: "none", reason: "healthy" };
  }

  // src/extension/content-entry.js
  var DEBOUNCE_MS = INGEST_TIMING.debounceMs;
  var LIVE_POLL_MS = INGEST_TIMING.livePollMs;
  var STATS_POLL_MS = INGEST_TIMING.statsPollMs;
  var LIVE_PANEL_SCAN_MS = INGEST_TIMING.panelScanMs;
  var DEEP_HARVEST_DELAY_MS = HARVEST_TIMING.delayMs;
  var DEEP_HARVEST_QUIET_UI_MS = HARVEST_TIMING.quietUiMs;
  var DEEP_HARVEST_SCROLL_WAIT_MS = HARVEST_TIMING.scrollWaitMs;
  var DEEP_HARVEST_SCROLL_STEP_RATIO = 0.52;
  var DEEP_HARVEST_SECOND_PASS_GAP_MS = HARVEST_TIMING.secondPassGapMs;
  var DEEP_HARVEST_PERIODIC_MS = HARVEST_TIMING.periodicMs;
  var DEEP_HARVEST_STABILITY_FOLLOWUP_MS = HARVEST_TIMING.stabilityFollowUpMs;
  var DEEP_HARVEST_RECOVERY_MS = HARVEST_TIMING.deepRecoveryMs;
  var DEEP_HARVEST_LOADING_HOST_ID = "nl-deep-harvest-loading";
  var DEEP_HARVEST_LOADING_IMG_PATH = "images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png";
  var BOOTSTRAP_DELAYS_MS = [400, 2e3, 4500];
  var tabVisibleHarvestDebounceTimer = null;
  var TAB_VISIBLE_HARVEST_MIN_MS = 12e3;
  var lastTabVisibleHarvestAt = 0;
  var MAX_SELF_POSTED_ITEMS = 48;
  var SELF_POST_RECENT_TTL_MS = 24 * 60 * 60 * 1e3;
  var SELF_POST_NATIVE_DEDUPE_MS = 5e3;
  var SELF_POST_MATCH_LATE_MS = 10 * 60 * 1e3;
  var SELF_POST_MATCH_EARLY_MS = 30 * 1e3;
  var AUTO_BACKUP_LIVES_MAX = 40;
  var SNAPSHOT_LINK_RELS = /* @__PURE__ */ new Set([
    "alternate",
    "icon",
    "shortcut icon",
    "preload",
    "stylesheet"
  ]);
  var recording = false;
  var deepHarvestQuietUi = true;
  var liveId = null;
  var wsViewerCount = null;
  var wsCommentCount = null;
  var wsViewerCountUpdatedAt = 0;
  var officialViewerCount = null;
  var officialCommentCount = null;
  var officialCommentStatsUpdatedAt = 0;
  var officialStatsUpdatedAt = 0;
  var officialViewerIntervalMs = null;
  var lastOfficialViewerTickAt = 0;
  var officialViewerIntervals = [];
  var officialCommentHistory = [];
  var observedRecordedCommentCount = 0;
  var programBeginAtMs = null;
  var pendingRoots = /* @__PURE__ */ new Set();
  var flushTimer = null;
  var mutationObserver = null;
  var observedMutationRoot = null;
  var nativeSelfPostRecorderBound = false;
  var lastNativeSelfPost = { liveId: "", textNorm: "", at: 0 };
  var harvestRunning = false;
  var deepHarvestPipelineStats = {
    lastCompletedAt: 0,
    lastRowCount: 0,
    runCount: 0,
    lastError: false
  };
  var lastPersistCommentBatchSize = 0;
  var lastPersistGateFailures = [];
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
  var activeUserTimestamps = /* @__PURE__ */ new Map();
  var ACTIVE_USER_MAP_MAX = MAP_LIMITS.activeUserMax;
  var VIEWER_JOIN_FLUSH_SUPPRESS_MS = 2500;
  var interceptedNicknames = /* @__PURE__ */ new Map();
  var interceptedAvatars = /* @__PURE__ */ new Map();
  var INTERCEPT_MAP_MAX = MAP_LIMITS.interceptMax;
  var ndgrLastReceivedAt = 0;
  var ndgrChatRowsPending = [];
  var ndgrChatRowsFlushTimer = null;
  var NDGR_CHAT_ROWS_FLUSH_MS = INGEST_TIMING.ndgrFlushMs;
  var NDGR_PENDING_FLUSH_THRESHOLD = INGEST_TIMING.ndgrPendingThreshold;
  var NDGR_PENDING_MAX = INGEST_TIMING.ndgrPendingMax;
  var INTERCEPT_RECONCILE_MS = INGEST_TIMING.interceptReconcileMs;
  var ENDED_HARVEST_CHECK_MS = INGEST_TIMING.endedHarvestCheckMs;
  var interceptReconcilePendingEntries = [];
  var interceptReconcilePendingUsers = [];
  var interceptReconcileTimer = null;
  var endedBulkHarvestTriggeredLiveId = "";
  var endedBulkHarvestLastCheckedAt = 0;
  function clearNdgrChatRowsPending() {
    ndgrChatRowsPending.length = 0;
    if (ndgrChatRowsFlushTimer != null) {
      clearTimeout(ndgrChatRowsFlushTimer);
      ndgrChatRowsFlushTimer = null;
    }
  }
  function clearInterceptReconcilePending() {
    interceptReconcilePendingEntries.length = 0;
    interceptReconcilePendingUsers.length = 0;
    if (interceptReconcileTimer != null) {
      clearTimeout(interceptReconcileTimer);
      interceptReconcileTimer = null;
    }
  }
  function detectWatchProgramEndedFromDom() {
    const candidates = [];
    const pushText = (v) => {
      const s = String(v || "").trim();
      if (!s) return;
      candidates.push(s.slice(0, 600));
    };
    try {
      pushText(document.querySelector('[class*="program" i] [class*="status" i]')?.textContent);
      pushText(document.querySelector('[class*="timeshift" i]')?.textContent);
      pushText(document.querySelector("main")?.textContent);
    } catch {
    }
    if (!candidates.length) return false;
    return candidates.some((t) => isWatchProgramEndedText(t));
  }
  function maybeRunEndedBulkHarvest() {
    if (!hasExtensionContext()) return;
    const now = Date.now();
    if (now - endedBulkHarvestLastCheckedAt < ENDED_HARVEST_CHECK_MS) return;
    endedBulkHarvestLastCheckedAt = now;
    const endedDetected = detectWatchProgramEndedFromDom();
    if (!shouldRunEndedBulkHarvest({
      recording,
      liveId,
      locationAllows: locationAllowsCommentRecording(),
      endedDetected,
      lastTriggeredLiveId: endedBulkHarvestTriggeredLiveId
    })) {
      return;
    }
    endedBulkHarvestTriggeredLiveId = String(liveId || "").trim();
    void runDeepHarvest({ force: true }).catch(
      (err) => reportSilentErrorToStorage("endedBulkHarvest", err)
    );
  }
  function queueInterceptReconcile(entries, users) {
    if (!entries.length && !users.length) return;
    interceptReconcilePendingEntries.push(...entries);
    interceptReconcilePendingUsers.push(...users);
    if (interceptReconcileTimer != null) return;
    interceptReconcileTimer = setTimeout(() => {
      interceptReconcileTimer = null;
      const entrySlice = interceptReconcilePendingEntries;
      const userSlice = interceptReconcilePendingUsers;
      interceptReconcilePendingEntries = [];
      interceptReconcilePendingUsers = [];
      void runInterceptReconcile(entrySlice, userSlice);
    }, INTERCEPT_RECONCILE_MS);
  }
  async function runInterceptReconcile(entries, users) {
    if (!recording || !liveId || !locationAllowsCommentRecording() || !hasExtensionContext()) {
      return;
    }
    const lidAtQueue = liveId;
    const mergedByNo = /* @__PURE__ */ new Map();
    for (const it of entries) {
      const no = String(it?.no || "").trim();
      if (!no) continue;
      const prev = mergedByNo.get(no) || { no, uid: "", name: "", av: "" };
      const uid = String(it?.uid || "").trim() || prev.uid;
      const name = String(it?.name || "").trim() || prev.name;
      const av = isHttpAvatarUrl(it?.av) ? String(it.av || "").trim() : prev.av;
      if (!uid && !name && !av) continue;
      mergedByNo.set(no, { no, uid, name, av });
    }
    const mergedUsersByUid = /* @__PURE__ */ new Map();
    for (const u of users) {
      const uid = String(u?.uid || "").trim();
      if (!uid) continue;
      const prev = mergedUsersByUid.get(uid) || { uid, name: "", av: "" };
      const name = String(u?.name || "").trim() || prev.name;
      const av = isHttpAvatarUrl(u?.av) ? String(u.av || "").trim() : prev.av;
      mergedUsersByUid.set(uid, { uid, name, av });
    }
    const mergedItems = [...mergedByNo.values()];
    const mergedUsers = [...mergedUsersByUid.values()];
    if (!mergedItems.length && !mergedUsers.length) return;
    const key = commentsStorageKey(lidAtQueue);
    const job = persistCommentRowsChain.then(async () => {
      const bag = await readStorageBagWithRetry(
        () => chrome.storage.local.get([key, KEY_USER_COMMENT_PROFILE_CACHE]),
        { attempts: 4, delaysMs: [0, 50, 120, 280] }
      );
      const existing = Array.isArray(bag[key]) ? bag[key] : [];
      let next = existing;
      let commentsTouched = false;
      if (mergedItems.length) {
        const merged = mergeStoredCommentsWithIntercept(existing, mergedItems);
        if (merged.patched > 0) {
          next = merged.next;
          commentsTouched = true;
        }
      }
      let profileMap = normalizeUserCommentProfileMap(bag[KEY_USER_COMMENT_PROFILE_CACHE]);
      let cacheTouched = false;
      for (const it of mergedItems) {
        if (upsertUserCommentProfileFromIntercept(profileMap, { uid: it.uid, name: it.name, av: it.av })) {
          cacheTouched = true;
        }
      }
      for (const u of mergedUsers) {
        if (upsertUserCommentProfileFromIntercept(profileMap, u)) {
          cacheTouched = true;
        }
      }
      const applied = applyUserCommentProfileMapToEntries(next, profileMap);
      if (applied.patched > 0) {
        next = applied.next;
        commentsTouched = true;
      }
      const pruned = pruneUserCommentProfileMap(profileMap);
      if (Object.keys(pruned).length !== Object.keys(profileMap).length) {
        profileMap = pruned;
        cacheTouched = true;
      }
      if (!commentsTouched && !cacheTouched) return;
      const saveBag = {};
      if (commentsTouched) saveBag[key] = next;
      if (cacheTouched) saveBag[KEY_USER_COMMENT_PROFILE_CACHE] = profileMap;
      await chrome.storage.local.set(saveBag);
    });
    persistCommentRowsChain = job.catch((err) => reportSilentErrorToStorage("interceptReconcile", err));
    await job;
  }
  async function flushNdgrChatRowsBatch(batch) {
    if (!batch.length) return;
    if (shouldDeferNdgrFlushUntilLiveId({
      recording,
      locationAllows: locationAllowsCommentRecording(),
      liveId
    })) {
      ndgrChatRowsPending = mergeNdgrBacklogWithCap(
        ndgrChatRowsPending,
        batch,
        NDGR_PENDING_MAX
      );
      if (ndgrChatRowsFlushTimer == null) {
        ndgrChatRowsFlushTimer = setTimeout(() => {
          ndgrChatRowsFlushTimer = null;
          const slice = ndgrChatRowsPending;
          ndgrChatRowsPending = [];
          void flushNdgrChatRowsBatch(slice);
        }, NDGR_CHAT_ROWS_FLUSH_MS);
      }
      return;
    }
    if (!recording || !liveId || !locationAllowsCommentRecording()) return;
    const byKey = /* @__PURE__ */ new Map();
    for (const r of batch) {
      if (!r || typeof r !== "object") continue;
      const no = String(r.commentNo ?? "").trim();
      const text = normalizeCommentText(r.text);
      if (!no || !text) continue;
      const k = `${no}	${text}`;
      const uid = String(r.userId || "").trim();
      const nick = String(r.nickname || "").trim();
      const prev = byKey.get(k);
      if (!prev) {
        byKey.set(k, {
          commentNo: no,
          text,
          userId: uid || null,
          ...nick ? { nickname: nick } : {}
        });
        continue;
      }
      const mUid = uid || String(prev.userId || "").trim();
      const mNick = nick || String(prev.nickname || "").trim();
      byKey.set(k, {
        commentNo: no,
        text,
        userId: mUid || null,
        ...mNick ? { nickname: mNick } : {}
      });
    }
    const merged = [...byKey.values()].map((r) => {
      const uid = String(r.userId || "").trim();
      const nick = anonymousNicknameFallback(uid, r.nickname);
      return nick ? { ...r, nickname: nick } : r;
    });
    for (const r of merged) {
      const u = String(r.userId || "").trim();
      const n = String(r.nickname || "").trim();
      if (u && n) interceptedNicknames.set(u, n);
    }
    await persistCommentRows(merged, { source: COMMENT_INGEST_SOURCE.NDGR });
  }
  function schedulePersistNdgrChatRows(rows) {
    if (!Array.isArray(rows) || !rows.length) return;
    if (!recording || !locationAllowsCommentRecording()) return;
    ndgrLastReceivedAt = Date.now();
    ndgrChatRowsPending = mergeNdgrBacklogWithCap(
      ndgrChatRowsPending,
      rows,
      NDGR_PENDING_MAX
    );
    if (ndgrChatRowsPending.length >= NDGR_PENDING_FLUSH_THRESHOLD) {
      if (ndgrChatRowsFlushTimer != null) {
        clearTimeout(ndgrChatRowsFlushTimer);
        ndgrChatRowsFlushTimer = null;
      }
      const slice = ndgrChatRowsPending;
      ndgrChatRowsPending = [];
      void flushNdgrChatRowsBatch(slice);
      return;
    }
    if (ndgrChatRowsFlushTimer != null) return;
    ndgrChatRowsFlushTimer = setTimeout(() => {
      ndgrChatRowsFlushTimer = null;
      const slice = ndgrChatRowsPending;
      ndgrChatRowsPending = [];
      void flushNdgrChatRowsBatch(slice);
    }, NDGR_CHAT_ROWS_FLUSH_MS);
  }
  async function flushInterceptViewerJoin(viewers) {
    if (!Array.isArray(viewers) || !viewers.length) return;
    if (!liveId || !hasExtensionContext()) return;
    const seenNow = Date.now();
    const seenInFlush = /* @__PURE__ */ new Set();
    const applied = [];
    for (const v of viewers) {
      if (!v || typeof v !== "object") continue;
      const uid = String(
        /** @type {{ userId?: unknown }} */
        v.userId || ""
      ).trim();
      if (!uid) continue;
      if (seenInFlush.has(uid)) continue;
      const lastActive = activeUserTimestamps.get(uid);
      if (lastActive != null && seenNow - lastActive < VIEWER_JOIN_FLUSH_SUPPRESS_MS) {
        continue;
      }
      seenInFlush.add(uid);
      applied.push(
        /** @type {Record<string, unknown>} */
        v
      );
    }
    if (!applied.length) return;
    for (const v of applied) {
      const uid = String(v.userId || "").trim();
      if (!uid) continue;
      const nick = String(v.nickname || "").trim();
      const iconRaw = String(v.iconUrl || "").trim();
      const icon = isHttpAvatarUrl(iconRaw) ? iconRaw : "";
      if (nick) interceptedNicknames.set(uid, nick);
      if (icon) interceptedAvatars.set(uid, icon);
      activeUserTimestamps.set(uid, seenNow);
    }
    if (activeUserTimestamps.size > ACTIVE_USER_MAP_MAX) {
      const excess = activeUserTimestamps.size - ACTIVE_USER_MAP_MAX;
      const iter = activeUserTimestamps.keys();
      for (let i = 0; i < excess; i++) {
        const key = iter.next().value;
        if (key != null) activeUserTimestamps.delete(key);
      }
    }
    try {
      const bag = await chrome.storage.local.get(KEY_USER_COMMENT_PROFILE_CACHE);
      const profileMap = normalizeUserCommentProfileMap(bag[KEY_USER_COMMENT_PROFILE_CACHE]);
      let cacheTouched = false;
      for (const v of applied) {
        const uid = String(v.userId || "").trim();
        if (!uid) continue;
        const nick = String(v.nickname || "").trim();
        const iconUrl = isHttpAvatarUrl(v.iconUrl) ? String(v.iconUrl || "").trim() : "";
        if (upsertUserCommentProfileFromEntry(profileMap, {
          userId: uid,
          nickname: nick,
          avatarUrl: iconUrl
        })) {
          cacheTouched = true;
        }
      }
      if (cacheTouched) {
        await chrome.storage.local.set({ [KEY_USER_COMMENT_PROFILE_CACHE]: profileMap });
      }
      await chrome.storage.local.remove(KEY_STORAGE_WRITE_ERROR);
    } catch (err) {
      if (isContextInvalidatedError2(err) || !hasExtensionContext()) return;
      try {
        await chrome.storage.local.set({
          [KEY_STORAGE_WRITE_ERROR]: buildStorageWriteErrorPayload(liveId, err)
        });
      } catch {
      }
    }
  }
  var broadcasterUidCache = "";
  var broadcasterUidCacheAt = 0;
  function isHttpAvatarUrl(v) {
    return /^https?:\/\//i.test(String(v || "").trim());
  }
  function resetOfficialStatsState() {
    officialViewerCount = null;
    officialCommentCount = null;
    officialCommentStatsUpdatedAt = 0;
    officialStatsUpdatedAt = 0;
    officialViewerIntervalMs = null;
    lastOfficialViewerTickAt = 0;
    officialViewerIntervals.length = 0;
    resetOfficialCommentSamplingState();
  }
  function resetOfficialCommentSamplingState() {
    officialCommentHistory.length = 0;
    observedRecordedCommentCount = 0;
  }
  function maybeFillProgramBeginFromEmbeddedData() {
    if (programBeginAtMs != null && Number.isFinite(programBeginAtMs) && programBeginAtMs > 0) {
      return;
    }
    const props = extractEmbeddedDataProps(document);
    if (!props) return;
    const t = pickProgramBeginAt(props);
    if (t != null && Number.isFinite(t) && t > 0) {
      programBeginAtMs = t;
    }
  }
  function noteOfficialViewerTick(at) {
    if (!(at > 0)) return;
    if (lastOfficialViewerTickAt > 0) {
      const delta = at - lastOfficialViewerTickAt;
      if (delta >= 15e3 && delta <= 5 * 60 * 1e3) {
        officialViewerIntervals.push(delta);
        while (officialViewerIntervals.length > 8) officialViewerIntervals.shift();
        const sorted = [...officialViewerIntervals].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        officialViewerIntervalMs = sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
      }
    }
    lastOfficialViewerTickAt = at;
  }
  function noteOfficialCommentSample(at) {
    if (!recording || !liveId || !locationAllowsCommentRecording() || !Number.isFinite(at) || at <= 0 || officialCommentCount == null || !Number.isFinite(officialCommentCount) || officialCommentCount < 0) {
      return;
    }
    const next = {
      at,
      statisticsComments: officialCommentCount,
      recordedComments: observedRecordedCommentCount
    };
    const last = officialCommentHistory[officialCommentHistory.length - 1];
    if (last && last.statisticsComments === next.statisticsComments && last.recordedComments === next.recordedComments) {
      last.at = next.at;
      return;
    }
    officialCommentHistory.push(next);
    while (officialCommentHistory.length > 48 || officialCommentHistory.length > 2 && next.at - officialCommentHistory[0].at > 15 * 60 * 1e3) {
      officialCommentHistory.shift();
    }
  }
  function updateOfficialStatistics(stats) {
    const at = typeof stats?.observedAt === "number" && Number.isFinite(stats.observedAt) ? stats.observedAt : Date.now();
    let touched = false;
    if (typeof stats?.viewers === "number" && Number.isFinite(stats.viewers) && stats.viewers >= 0) {
      officialStatsUpdatedAt = at;
      noteOfficialViewerTick(at);
      touched = true;
    }
    if (typeof stats?.comments === "number" && Number.isFinite(stats.comments) && stats.comments >= 0) {
      officialCommentCount = stats.comments;
      officialCommentStatsUpdatedAt = at;
      touched = true;
    }
    if (touched) noteOfficialCommentSample(at);
  }
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    if (!e.data || typeof e.data.type !== "string") return;
    if (e.data.type === "NLS_INTERCEPT_SCHEDULE") {
      const b = e.data.begin;
      if (typeof b === "string" && b.length >= 10) {
        const t = new Date(b).getTime();
        if (Number.isFinite(t)) programBeginAtMs = t;
      }
      return;
    }
    if (e.data.type === "NLS_INTERCEPT_STATISTICS") {
      const now = Date.now();
      const v = e.data.viewers;
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
        wsViewerCount = v;
        wsViewerCountUpdatedAt = now;
      }
      const c = e.data.comments;
      if (typeof c === "number" && Number.isFinite(c) && c >= 0) {
        wsCommentCount = c;
      }
      updateOfficialStatistics({
        ...typeof v === "number" && Number.isFinite(v) && v >= 0 ? { viewers: v } : {},
        ...typeof c === "number" && Number.isFinite(c) && c >= 0 ? { comments: c } : {},
        observedAt: now
      });
      return;
    }
    if (e.data.type === "NLS_INTERCEPT_VIEWER_JOIN") {
      const raw = e.data.viewers;
      if (Array.isArray(raw) && raw.length) {
        const run = () => {
          void flushInterceptViewerJoin(raw);
        };
        if (typeof queueMicrotask === "function") queueMicrotask(run);
        else setTimeout(run, 0);
      }
      return;
    }
    if (e.data.type === "NLS_INTERCEPT_EMBEDDED_DATA") {
      const v = e.data.viewers;
      if (typeof v === "number" && Number.isFinite(v) && v >= 0 && wsViewerCount == null) {
        wsViewerCount = v;
        wsViewerCountUpdatedAt = Date.now();
      }
      return;
    }
    if (e.data.type === "NLS_INTERCEPT_CHAT_ROWS") {
      const raw = e.data.rows;
      if (Array.isArray(raw) && raw.length) {
        const cleaned = cleanNdgrChatRows(raw);
        if (cleaned.length) schedulePersistNdgrChatRows(cleaned);
      }
      return;
    }
    if (e.data.type === "NLS_INTERCEPT_GIFT_USERS") {
      const raw = e.data.users;
      if (Array.isArray(raw) && raw.length && liveId && hasExtensionContext()) {
        const key = giftUsersStorageKey(liveId);
        chrome.storage.local.get(key).then((bag) => {
          const existing = Array.isArray(bag[key]) ? bag[key] : [];
          const { next, storageTouched } = mergeGiftUsers(existing, raw);
          if (storageTouched) {
            chrome.storage.local.set({ [key]: next }).catch((err) => {
              if (!isContextInvalidatedError2(err) && hasExtensionContext()) {
                try {
                  chrome.storage.local.set({
                    [KEY_STORAGE_WRITE_ERROR]: buildStorageWriteErrorPayload(liveId, err)
                  });
                } catch {
                }
              }
            });
          }
        }).catch((err) => reportSilentErrorToStorage("gift", err));
      }
      return;
    }
    if (e.data.type === "NLS_INTERCEPT_COMMENT_POST") {
      const body = e.data.body;
      if (body && typeof body === "object") {
        const no = String(body.no ?? body.commentNo ?? "").trim();
        const text = String(body.body ?? body.text ?? "").trim();
        if (no && text) {
          const uid = String(body.userId ?? body.user_id ?? "").trim() || null;
          persistCommentRows([{ commentNo: no, text, userId: uid }]);
        }
      }
      return;
    }
    if (e.data.type === "NLS_SPA_NAVIGATION") {
      const newUrl = String(e.data.url || "");
      const prevUrl = String(e.data.prevUrl || "");
      const newIsWatch = isNicoLiveWatchUrl(newUrl);
      const prevIsWatch = isNicoLiveWatchUrl(prevUrl);
      if (!newIsWatch) {
        syncLiveIdFromLocation();
        return;
      }
      if (newIsWatch && prevIsWatch && extractLiveIdFromUrl(newUrl) === extractLiveIdFromUrl(prevUrl)) {
        return;
      }
      const now = Date.now();
      if (now < spaNavThrottleUntil) return;
      spaNavThrottleUntil = now + 300;
      syncLiveIdFromLocation();
      return;
    }
    if (e.data.type !== "NLS_INTERCEPT_USERID") return;
    const entries = e.data.entries;
    const users = e.data.users;
    const seenNow = Date.now();
    const reconcileUsers = [];
    const reconcileEntries = [];
    if (Array.isArray(users)) {
      for (const { uid, name, av } of users) {
        const sUid = String(uid || "").trim();
        const sName = String(name || "").trim();
        const sAv = isHttpAvatarUrl(av) ? String(av).trim() : "";
        if (!sUid) continue;
        if (sName) interceptedNicknames.set(sUid, sName);
        if (sAv) interceptedAvatars.set(sUid, sAv);
        activeUserTimestamps.set(sUid, seenNow);
        reconcileUsers.push({ uid: sUid, name: sName, av: sAv });
      }
    }
    if (Array.isArray(entries)) {
      for (const { no, uid, name, av } of entries) {
        const sNo = String(no || "").trim();
        if (!sNo) continue;
        const sUid = String(uid || "").trim();
        const sName = String(name || "").trim();
        const sAv = isHttpAvatarUrl(av) ? String(av).trim() : "";
        if (!sUid && !sName && !sAv) continue;
        const prev = interceptedUsers.get(sNo);
        const prevUid = String(prev?.uid || "").trim();
        const prevName = String(prev?.name || "").trim();
        const prevAv = isHttpAvatarUrl(prev?.av) ? String(prev?.av || "").trim() : "";
        const nextUid = sUid || prevUid;
        const nextName = sName || prevName;
        const nextAv = sAv || prevAv;
        interceptedUsers.set(sNo, {
          ...nextUid ? { uid: nextUid } : {},
          ...nextName ? { name: nextName } : {},
          ...nextAv ? { av: nextAv } : {}
        });
        if (sName && sUid) interceptedNicknames.set(sUid, sName);
        if (sAv && sUid) interceptedAvatars.set(sUid, sAv);
        if (sUid) activeUserTimestamps.set(sUid, seenNow);
        reconcileEntries.push({ no: sNo, uid: sUid, name: sName, av: sAv });
      }
    }
    trimMapToMax(activeUserTimestamps, ACTIVE_USER_MAP_MAX);
    trimMapToMax(interceptedUsers, INTERCEPT_MAP_MAX);
    queueInterceptReconcile(reconcileEntries, reconcileUsers);
  });
  var lastWatchUrlTimer = null;
  var PAGE_FRAME_STYLE_ID = "nls-watch-prikura-style";
  var PAGE_FRAME_OVERLAY_ID = "nls-watch-prikura-frame";
  var INLINE_POPUP_HOST_ID = "nls-inline-popup-host";
  var INLINE_POPUP_IFRAME_ID = "nls-inline-popup-iframe";
  var KEY_AI_SHARE_FAST_DIAG = "nls_ai_share_fast_diag_v1";
  var nlsInlinePopupHostSingleton = null;
  var inlineIframeVisibilityTimer = null;
  var renderingPageFrame = false;
  var spaNavThrottleUntil = 0;
  var nlsInlinePanelRenderErrors = [];
  var NLS_INLINE_PANEL_RENDER_ERR_MAX = 14;
  function noteInlinePanelRenderError(where, err) {
    try {
      nlsInlinePanelRenderErrors.push({
        t: Date.now(),
        where: String(where || "").slice(0, 80),
        message: String(
          err && typeof err === "object" && "message" in err ? (
            /** @type {{ message?: unknown }} */
            err.message
          ) : err || ""
        ).slice(0, 500)
      });
      while (nlsInlinePanelRenderErrors.length > NLS_INLINE_PANEL_RENDER_ERR_MAX) {
        nlsInlinePanelRenderErrors.shift();
      }
    } catch {
    }
  }
  var PAGE_FRAME_LOOP_MS = INGEST_TIMING.pageFrameLoopMs;
  var DEFAULT_PAGE_FRAME = "light";
  var LEGACY_PAGE_FRAME_ALIAS = {
    trio: "light",
    link: "light",
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
  var aiShareFastDiagLastPersistAt = 0;
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
    const clamp2 = (v) => Math.max(0, Math.min(255, Math.round(v)));
    const r = clamp2(parseInt(source.slice(0, 2), 16) * (1 - ratio));
    const g = clamp2(parseInt(source.slice(2, 4), 16) * (1 - ratio));
    const b = clamp2(parseInt(source.slice(4, 6), 16) * (1 - ratio));
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
      opacity: 0;
      transition: opacity 0.25s ease-in-out;
      pointer-events: auto;
      position: relative;
      z-index: 2147482000;
      border: none !important;
      outline: none !important;
      box-shadow: none !important;
      flex: 0 0 auto;
      flex-shrink: 0;
      align-self: flex-start;
    }
    #${INLINE_POPUP_HOST_ID}:focus,
    #${INLINE_POPUP_HOST_ID}:focus-within {
      outline: none !important;
      box-shadow: none !important;
    }
    #${INLINE_POPUP_HOST_ID} iframe {
      width: 100%;
      /* \u5FDC\u63F4\u30B0\u30EA\u30C3\u30C9\u304C\u898B\u3048\u308B\u9AD8\u3055\u306B\u3057\u3064\u3064\u3001\u65E7 820px \u7D1A\u306E\u5854\u306F\u907F\u3051\u308B\uFF08\u5185\u5074\u30B9\u30AF\u30ED\u30FC\u30EB\uFF09 */
      height: min(560px, 58vh);
      min-height: 240px;
      max-height: min(720px, 72vh);
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
    #${INLINE_POPUP_HOST_ID}.nls-inline-host--floating {
      -webkit-overflow-scrolling: touch;
    }
    #${INLINE_POPUP_HOST_ID}.nls-inline-host--dock-bottom {
      -webkit-overflow-scrolling: touch;
      min-height: 200px;
      /* \u8AAD\u307F\u8FBC\u307F\u9045\u5EF6\u6642\u306B\u9ED2\u30D9\u30BF\u9762\u304C\u6B8B\u3089\u306A\u3044\u3088\u3046\u900F\u660E\u5BC4\u308A\u306B\u3059\u308B */
      background: transparent;
    }
    #${INLINE_POPUP_HOST_ID}.nls-inline-host--dock-bottom iframe {
      width: 100% !important;
      height: min(520px, 52vh);
      min-height: 220px;
      max-height: min(680px, 56vh);
      background: transparent;
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
  function pickPrimaryInlinePopupHostFromDom() {
    const hosts = Array.from(
      document.querySelectorAll(`#${INLINE_POPUP_HOST_ID}`)
    ).filter((n) => n instanceof HTMLDivElement);
    if (!hosts.length) return null;
    const connected = hosts.filter((h) => h.isConnected);
    const primary = connected[0] || hosts[0];
    for (const h of hosts) {
      if (h === primary) continue;
      try {
        h.remove();
      } catch {
      }
    }
    return primary;
  }
  function ensureInlinePopupIframe(host) {
    if (!(host instanceof HTMLDivElement)) return;
    const expectedSrc = (() => {
      try {
        return chrome.runtime.getURL("popup.html") + "?inline=1";
      } catch {
        return "";
      }
    })();
    const existing = (
      /** @type {HTMLIFrameElement|null} */
      host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
    );
    if (existing && String(existing.getAttribute("src") || "").trim() === expectedSrc) {
      return;
    }
    let iframe = existing;
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = INLINE_POPUP_IFRAME_ID;
      iframe.setAttribute("title", "nicolivelog inline panel");
      iframe.setAttribute("allow", "microphone");
      iframe.style.pointerEvents = "auto";
      iframe.style.visibility = "hidden";
      host.appendChild(iframe);
    }
    if (expectedSrc) {
      iframe.setAttribute("src", expectedSrc);
    }
    iframe.addEventListener(
      "load",
      () => {
        if (inlineIframeVisibilityTimer) {
          clearTimeout(inlineIframeVisibilityTimer);
          inlineIframeVisibilityTimer = null;
        }
        requestAnimationFrame(() => {
          iframe.style.visibility = "visible";
          host.style.opacity = "1";
        });
      },
      { once: true }
    );
    if (inlineIframeVisibilityTimer) clearTimeout(inlineIframeVisibilityTimer);
    inlineIframeVisibilityTimer = setTimeout(() => {
      inlineIframeVisibilityTimer = null;
      iframe.style.visibility = "visible";
      host.style.opacity = "1";
    }, 2e3);
  }
  function ensureInlinePopupHost() {
    let host = pickPrimaryInlinePopupHostFromDom();
    if (host) {
      ensureInlinePopupIframe(host);
      nlsInlinePopupHostSingleton = host;
      return host;
    }
    if (nlsInlinePopupHostSingleton && nlsInlinePopupHostSingleton.id === INLINE_POPUP_HOST_ID) {
      ensureInlinePopupIframe(nlsInlinePopupHostSingleton);
      return nlsInlinePopupHostSingleton;
    }
    host = document.createElement("div");
    host.id = INLINE_POPUP_HOST_ID;
    host.setAttribute("aria-hidden", "true");
    host.style.display = "none";
    host.style.pointerEvents = "auto";
    host.style.width = "100%";
    ensureInlinePopupIframe(host);
    nlsInlinePopupHostSingleton = host;
    return host;
  }
  function inlinePopupHostIsCorrectlyPlaced(host, hostParent, insertAfter) {
    if (!(host instanceof HTMLElement) || !(insertAfter instanceof HTMLElement)) {
      return host.parentNode === hostParent && host.previousSibling === insertAfter;
    }
    return host.parentNode === hostParent && host.previousElementSibling === insertAfter;
  }
  function clearInlineHostFloatingLayout(host) {
    if (!(host instanceof HTMLElement)) return;
    applyInlineHostPlacementReset(host);
  }
  function renderInlinePanelFloatingHost() {
    const host = ensureInlinePopupHost();
    clearInlineHostFloatingLayout(host);
    const viewport = nlsViewportSize();
    let vh = Number(viewport.innerHeight) || 0;
    if (vh < 200) vh = 640;
    const pad = 12;
    const panelW = Math.min(420, Math.max(280, viewport.innerWidth - pad * 2));
    const maxH = Math.min(Math.round(vh * 0.92), 900);
    const iframeH = Math.min(580, Math.round(vh * 0.78));
    if (host.parentNode !== document.body) {
      document.body.appendChild(host);
    }
    host.classList.add("nls-inline-host--floating");
    host.style.position = "fixed";
    if (inlineFloatingAnchor === INLINE_FLOATING_ANCHOR_BOTTOM_LEFT) {
      host.style.top = "";
      host.style.right = "";
      host.style.bottom = `calc(${pad}px + env(safe-area-inset-bottom, 0px))`;
      host.style.left = `calc(${pad}px + env(safe-area-inset-left, 0px))`;
    } else {
      host.style.bottom = "";
      host.style.left = "";
      host.style.top = `calc(${pad}px + env(safe-area-inset-top, 0px))`;
      host.style.right = `calc(${pad}px + env(safe-area-inset-right, 0px))`;
    }
    host.style.width = `${panelW}px`;
    host.style.maxWidth = `${panelW}px`;
    host.style.maxHeight = `${maxH}px`;
    host.style.overflow = "auto";
    host.style.overflowX = "hidden";
    host.style.marginLeft = "0";
    host.style.boxSizing = "border-box";
    host.style.zIndex = "2147483646";
    host.style.boxShadow = "0 12px 40px rgba(15, 23, 42, 0.28), 0 0 0 1px rgba(15, 23, 42, 0.08)";
    host.style.borderRadius = "14px";
    host.style.background = "transparent";
    const iframe = (
      /** @type {HTMLIFrameElement|null} */
      host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
    );
    if (iframe) {
      iframe.style.width = `${panelW}px`;
      iframe.style.height = `${Math.min(iframeH, maxH - 12)}px`;
      iframe.style.maxHeight = `${Math.min(iframeH, maxH - 12)}px`;
    }
    host.style.pointerEvents = "auto";
    host.setAttribute("aria-hidden", "false");
    host.style.display = "block";
    host.style.opacity = "1";
  }
  function renderInlinePanelDockBottomHost() {
    const host = ensureInlinePopupHost();
    clearInlineHostFloatingLayout(host);
    host.classList.remove("nls-inline-host--floating");
    host.classList.add("nls-inline-host--dock-bottom");
    const viewport = nlsViewportSize();
    let vh = Number(viewport.innerHeight) || 0;
    if (vh < 280) vh = 720;
    const maxDockH = watchDockPanelMaxHeightPx();
    const iframeInnerH = Math.max(
      200,
      Math.min(maxDockH - 16, Math.round(vh * 0.5))
    );
    if (host.parentNode !== document.body) {
      document.body.appendChild(host);
    }
    host.style.position = "fixed";
    host.style.left = "0";
    host.style.right = "0";
    host.style.bottom = "env(safe-area-inset-bottom, 0px)";
    host.style.top = "";
    host.style.width = "100%";
    host.style.maxWidth = "100%";
    host.style.maxHeight = `${maxDockH}px`;
    host.style.marginLeft = "0";
    host.style.overflow = "auto";
    host.style.overflowX = "hidden";
    host.style.boxSizing = "border-box";
    host.style.zIndex = "2147483646";
    host.style.boxShadow = "0 -10px 36px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.06)";
    host.style.borderRadius = "14px 14px 0 0";
    host.style.background = "transparent";
    const iframe = (
      /** @type {HTMLIFrameElement|null} */
      host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
    );
    if (iframe) {
      iframe.style.width = "100%";
      iframe.style.height = `${iframeInnerH}px`;
      iframe.style.maxHeight = `${iframeInnerH}px`;
    }
    host.style.pointerEvents = "auto";
    host.setAttribute("aria-hidden", "false");
    host.style.display = "block";
    host.style.opacity = "1";
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
    if (ar.width >= 260 && best.width > ar.width + 4) {
      best = {
        left: ar.left,
        top: Math.min(best.top, ar.top),
        width: ar.width,
        height: Math.max(best.height, ar.height)
      };
    }
    return best;
  }
  var inlinePanelWidthMode = normalizeInlinePanelWidthMode(void 0);
  var inlinePanelPlacementMode = normalizeInlinePanelPlacement(void 0);
  var inlineFloatingAnchor = normalizeInlineFloatingAnchor(void 0);
  var inlinePanelAutoshowEnabled = normalizeInlinePanelAutoshowEnabled(void 0);
  var toolbarInitiatedShowThisSession = false;
  function insertionParentForElement(el) {
    if (!(el instanceof HTMLElement)) return null;
    if (el.parentElement) return el.parentElement;
    const pn = el.parentNode;
    if (pn && typeof pn.insertBefore === "function" && typeof pn.appendChild === "function") {
      return (
        /** @type {ParentNode} */
        pn
      );
    }
    return null;
  }
  function getInsertionContainerRect(hostParent, viewport) {
    if (hostParent instanceof HTMLElement) {
      const r = hostParent.getBoundingClientRect();
      return {
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height
      };
    }
    if (hostParent instanceof ShadowRoot) {
      const h = hostParent.host;
      if (h instanceof HTMLElement) {
        const r = h.getBoundingClientRect();
        return {
          left: r.left,
          top: r.top,
          width: r.width,
          height: r.height
        };
      }
    }
    return {
      left: 0,
      top: 0,
      width: viewport.innerWidth,
      height: viewport.innerHeight
    };
  }
  function resolveInlinePanelInsertAnchor(domAnchor, placement) {
    if (!(domAnchor instanceof HTMLElement)) {
      return {
        insertAfter: (
          /** @type {HTMLElement} */
          domAnchor
        ),
        hostParent: null
      };
    }
    if (placement === INLINE_PANEL_PLACEMENT_FLOATING || placement === INLINE_PANEL_PLACEMENT_DOCK_BOTTOM) {
      return {
        insertAfter: domAnchor,
        hostParent: null
      };
    }
    if (placement === INLINE_PANEL_PLACEMENT_BESIDE) {
      return {
        insertAfter: domAnchor,
        hostParent: insertionParentForElement(domAnchor)
      };
    }
    const rowLikeEl = domAnchor.parentElement;
    if (!rowLikeEl) {
      return {
        insertAfter: domAnchor,
        hostParent: insertionParentForElement(domAnchor)
      };
    }
    try {
      const cs = window.getComputedStyle(rowLikeEl);
      const isRowFlex = cs.display === "flex" && (cs.flexDirection === "row" || cs.flexDirection === "row-reverse");
      if (isRowFlex) {
        const rowHostParent = insertionParentForElement(rowLikeEl);
        if (rowHostParent) {
          return { insertAfter: rowLikeEl, hostParent: rowHostParent };
        }
      }
    } catch {
    }
    return {
      insertAfter: domAnchor,
      hostParent: insertionParentForElement(domAnchor)
    };
  }
  function findBesideFlexRowColumnInsertion(video) {
    if (!(video instanceof HTMLElement)) return null;
    const vw = window.innerWidth;
    const minRowW = Math.min(720, Math.max(400, vw * 0.46));
    let node = video;
    for (let depth = 0; depth < 24 && node && node !== document.body; depth++) {
      const parent = node.parentElement;
      if (!parent) break;
      try {
        const cs = window.getComputedStyle(parent);
        const isRowFlex = cs.display === "flex" && (cs.flexDirection === "row" || cs.flexDirection === "row-reverse");
        if (isRowFlex && node.parentElement === parent && parent.children.length >= 2) {
          const rr = parent.getBoundingClientRect();
          if (rr.width >= minRowW) {
            return { insertAfter: node, hostParent: parent };
          }
        }
      } catch {
      }
      node = parent;
    }
    return null;
  }
  function renderInlineHostAnchoredToVideo(video) {
    clearInlineHostFloatingLayout(ensureInlinePopupHost());
    const placement = getEffectiveInlinePanelPlacement();
    if (placement === INLINE_PANEL_PLACEMENT_FLOATING) {
      renderInlinePanelFloatingHost();
      return;
    }
    if (placement === INLINE_PANEL_PLACEMENT_DOCK_BOTTOM) {
      renderInlinePanelDockBottomHost();
      return;
    }
    const domAnchor = findFrameInsertAnchorFromVideo(video);
    const insertResolveAnchor = placement === INLINE_PANEL_PLACEMENT_BESIDE ? video : domAnchor;
    let insertAfter;
    let hostParent;
    let besideFlexRowColumn = false;
    if (placement === INLINE_PANEL_PLACEMENT_BESIDE) {
      const col = findBesideFlexRowColumnInsertion(video);
      if (col?.hostParent && col.insertAfter) {
        insertAfter = col.insertAfter;
        hostParent = col.hostParent;
        besideFlexRowColumn = true;
      } else {
        const r = resolveInlinePanelInsertAnchor(
          insertResolveAnchor,
          placement
        );
        insertAfter = /** @type {HTMLElement} */
        r.insertAfter;
        hostParent = r.hostParent;
      }
    } else {
      const r = resolveInlinePanelInsertAnchor(domAnchor, placement);
      insertAfter = /** @type {HTMLElement} */
      r.insertAfter;
      hostParent = r.hostParent;
    }
    let hostAttachFallbackBody = false;
    if (!hostParent) {
      hostParent = document.body;
      hostAttachFallbackBody = true;
    }
    const host = ensureInlinePopupHost();
    const vr = video.getBoundingClientRect();
    if (vr.width < 260 || vr.height < 140) {
      host.style.display = "none";
      host.setAttribute("aria-hidden", "true");
      return;
    }
    const viewport = nlsViewportSize();
    const pr = getInsertionContainerRect(hostParent, viewport);
    const mode = besideFlexRowColumn || inlinePanelWidthMode === "video" ? "video" : "player_row";
    const rowRect = mode === "player_row" ? resolvePlayerRowRect(video, domAnchor) : null;
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
    if (hostAttachFallbackBody) {
      if (host.parentNode !== hostParent) hostParent.appendChild(host);
    } else {
      if (!inlinePopupHostIsCorrectlyPlaced(host, hostParent, insertAfter)) {
        insertAfter.insertAdjacentElement("afterend", host);
      }
    }
    host.style.boxSizing = "border-box";
    host.style.marginLeft = hostAttachFallbackBody || besideFlexRowColumn ? "0" : `${marginLeftPx}px`;
    host.style.maxWidth = "100%";
    host.style.width = hostAttachFallbackBody ? `${Math.min(720, Math.max(320, Math.round(viewport.innerWidth - 24)))}px` : `${panelWidthPx}px`;
    const iframe = (
      /** @type {HTMLIFrameElement|null} */
      host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
    );
    if (iframe)
      iframe.style.width = hostAttachFallbackBody ? host.style.width : `${panelWidthPx}px`;
    host.style.pointerEvents = "auto";
    host.setAttribute("aria-hidden", "false");
    host.style.display = "block";
    host.style.opacity = "1";
  }
  function renderInlinePopupHost(target) {
    if (!(target instanceof HTMLElement)) return;
    clearInlineHostFloatingLayout(ensureInlinePopupHost());
    const effPlacement = getEffectiveInlinePanelPlacement();
    if (effPlacement === INLINE_PANEL_PLACEMENT_FLOATING) {
      renderInlinePanelFloatingHost();
      return;
    }
    if (effPlacement === INLINE_PANEL_PLACEMENT_DOCK_BOTTOM) {
      renderInlinePanelDockBottomHost();
      return;
    }
    let video = null;
    if (target instanceof HTMLVideoElement) {
      video = target;
    } else {
      const cand = pickInlinePanelVideoWithinTarget(target);
      if (cand) {
        const vr = cand.getBoundingClientRect();
        if (vr.width >= 260 && vr.height >= 140) {
          video = cand;
        }
      }
    }
    if (video) {
      renderInlineHostAnchoredToVideo(video);
      return;
    }
    const currentRect = target.getBoundingClientRect();
    const hostEarly = ensureInlinePopupHost();
    if (currentRect.width < 260 || currentRect.height < 140) {
      hostEarly.style.display = "none";
      hostEarly.setAttribute("aria-hidden", "true");
      return;
    }
    const placement = getEffectiveInlinePanelPlacement();
    const { insertAfter, hostParent: resolvedHostParent } = resolveInlinePanelInsertAnchor(target, placement);
    let hostParent = resolvedHostParent;
    let hostAttachFallbackBody = false;
    if (!hostParent) {
      hostParent = document.body;
      hostAttachFallbackBody = true;
    }
    const host = ensureInlinePopupHost();
    const viewport = nlsViewportSize();
    const pr = getInsertionContainerRect(hostParent, viewport);
    const mode = inlinePanelWidthMode === "video" ? "video" : "player_row";
    const rowRect = mode === "player_row" ? {
      left: currentRect.left,
      top: currentRect.top,
      width: currentRect.width,
      height: currentRect.height
    } : null;
    const { panelWidthPx, marginLeftPx } = computeInlinePanelLayout(mode, {
      videoRect: {
        width: currentRect.width,
        height: currentRect.height,
        top: currentRect.top,
        left: currentRect.left
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
    if (hostAttachFallbackBody) {
      if (host.parentNode !== hostParent) hostParent.appendChild(host);
    } else {
      if (!inlinePopupHostIsCorrectlyPlaced(host, hostParent, insertAfter)) {
        insertAfter.insertAdjacentElement("afterend", host);
      }
    }
    host.style.boxSizing = "border-box";
    host.style.marginLeft = hostAttachFallbackBody ? "0" : `${marginLeftPx}px`;
    host.style.maxWidth = "100%";
    host.style.width = hostAttachFallbackBody ? `${Math.min(720, Math.max(320, Math.round(viewport.innerWidth - 24)))}px` : `${panelWidthPx}px`;
    const iframe = (
      /** @type {HTMLIFrameElement|null} */
      host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
    );
    if (iframe)
      iframe.style.width = hostAttachFallbackBody ? host.style.width : `${panelWidthPx}px`;
    host.style.pointerEvents = "auto";
    host.setAttribute("aria-hidden", "false");
    host.style.display = "block";
    host.style.opacity = "1";
  }
  function hidePageFrameOverlay() {
    const overlay = document.getElementById(PAGE_FRAME_OVERLAY_ID);
    if (overlay) overlay.style.display = "none";
    if (inlineIframeVisibilityTimer) {
      clearTimeout(inlineIframeVisibilityTimer);
      inlineIframeVisibilityTimer = null;
    }
    const host = nlsInlinePopupHostSingleton || document.getElementById(INLINE_POPUP_HOST_ID);
    if (host) {
      host.style.display = "none";
      host.setAttribute("aria-hidden", "true");
    }
    stableFrameTarget = null;
    syncWatchPageDockBodyReserve();
  }
  function inlineHostLooksVisible() {
    const host = nlsInlinePopupHostSingleton || document.getElementById(INLINE_POPUP_HOST_ID);
    if (!(host instanceof HTMLElement)) return false;
    if (!host.isConnected) return false;
    const cs = window.getComputedStyle(host);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    const r = host.getBoundingClientRect();
    return r.width >= 120 && r.height >= 120;
  }
  function focusInlinePanelHostFromToolbar() {
    if (!isWatchInlinePanelTopFrame()) return false;
    if (!isNicoLiveWatchUrl(window.location.href)) return false;
    const host = nlsInlinePopupHostSingleton || document.getElementById(INLINE_POPUP_HOST_ID);
    if (!(host instanceof HTMLElement) || !host.isConnected) return false;
    const cs = window.getComputedStyle(host);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    const r = host.getBoundingClientRect();
    if (r.width < 120 || r.height < 120) return false;
    try {
      suppressOwnScrollCountingFor(1e3);
      host.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } catch {
      try {
        host.scrollIntoView();
      } catch {
      }
    }
    const iframe = host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`);
    if (iframe instanceof HTMLIFrameElement) {
      try {
        iframe.focus();
      } catch {
      }
    }
    return true;
  }
  function buildAiShareFastDiagnosticsPayload() {
    const href = String(window.location.href || "");
    let isTop = true;
    try {
      isTop = window.self === window.top;
    } catch {
      isTop = true;
    }
    const target = findWatchFrameTargetElement();
    let targetBrief = null;
    if (target instanceof HTMLElement) {
      const r = target.getBoundingClientRect();
      targetBrief = {
        tag: String(target.tagName || "").toLowerCase(),
        id: String(target.id || "").slice(0, 100),
        cls: String(target.className || "").slice(0, 200),
        rectW: Math.round(r.width),
        rectH: Math.round(r.height)
      };
    }
    const host = nlsInlinePopupHostSingleton || document.getElementById(INLINE_POPUP_HOST_ID);
    let hostBrief = null;
    if (host instanceof HTMLElement) {
      const cs = window.getComputedStyle(host);
      const r = host.getBoundingClientRect();
      hostBrief = {
        isConnected: host.isConnected,
        inlineDisplay: host.style.display || "",
        computedDisplay: cs.display,
        computedVisibility: cs.visibility,
        rectTop: Math.round(r.top),
        rectLeft: Math.round(r.left),
        rectW: Math.round(r.width),
        rectH: Math.round(r.height),
        parentNodeName: host.parentNode ? host.parentNode.nodeName : "",
        parentIsShadowRoot: host.parentNode instanceof ShadowRoot
      };
    }
    return {
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      frame: {
        isTop,
        href: href.slice(0, 500),
        userAgent: String(navigator.userAgent || "").slice(0, 280)
      },
      contentScript: {
        hasExtensionContext: hasExtensionContext(),
        executionStarted: true,
        dataNlsActive: document.documentElement?.getAttribute?.("data-nls-active") ?? null,
        shouldRunWatchContentInThisFrame: shouldRunWatchContentInThisFrame()
      },
      watch: {
        isNicoLiveWatchUrl: isNicoLiveWatchUrl(href)
      },
      player: {
        videoCount: document.querySelectorAll("video").length,
        frameTarget: targetBrief
      },
      inlinePanel: {
        placementMode: inlinePanelPlacementMode,
        placementEffective: getEffectiveInlinePanelPlacement(),
        viewportInnerWidth: nlsViewportSize().innerWidth,
        widthMode: inlinePanelWidthMode,
        floatingAnchor: inlineFloatingAnchor,
        host: hostBrief,
        recentRenderErrors: nlsInlinePanelRenderErrors.slice()
      },
      pageFrameLoopTimerActive: Boolean(pageFrameLoopTimer),
      romiDebug: {
        recording,
        liveId: String(liveId || ""),
        harvestRunning,
        deepHarvestRunCount: deepHarvestPipelineStats.runCount,
        deepHarvestLastRowCount: deepHarvestPipelineStats.lastRowCount,
        deepHarvestLastCompletedAt: deepHarvestPipelineStats.lastCompletedAt || 0,
        deepHarvestLastError: deepHarvestPipelineStats.lastError,
        ndgrPending: ndgrChatRowsPending.length,
        ndgrLastReceivedAgo: ndgrLastReceivedAt > 0 ? Math.max(0, Date.now() - ndgrLastReceivedAt) : null,
        interceptMapSize: interceptedUsers.size,
        interceptNicknameSize: interceptedNicknames.size,
        interceptAvatarSize: interceptedAvatars.size,
        lastPersistBatch: lastPersistCommentBatchSize,
        persistGateFailures: Array.isArray(lastPersistGateFailures) ? lastPersistGateFailures.slice(0, 8) : [],
        endedBulkHarvestTriggeredLiveId: String(endedBulkHarvestTriggeredLiveId || ""),
        endedBulkHarvestLastCheckedAgo: endedBulkHarvestLastCheckedAt > 0 ? Math.max(0, Date.now() - endedBulkHarvestLastCheckedAt) : null
      }
    };
  }
  function persistAiShareFastDiagnostics() {
    if (!hasExtensionContext()) return;
    const now = Date.now();
    if (now - aiShareFastDiagLastPersistAt < 1500) return;
    aiShareFastDiagLastPersistAt = now;
    try {
      const payload = {
        popup: null,
        content: buildAiShareFastDiagnosticsPayload(),
        note: "Chrome \u30B3\u30F3\u30BD\u30FC\u30EB\u306E ERR_BLOCKED_BY_CLIENT / \u5E83\u544A\u30B9\u30AF\u30EA\u30D7\u30C8\u5931\u6557\u306F\u30D6\u30ED\u30C3\u30AB\u30FC\u7531\u6765\u3067\u591A\u304F\u3001\u672C\u62E1\u5F35\u3068\u306F\u7121\u95A2\u4FC2\u306A\u3053\u3068\u304C\u3042\u308A\u307E\u3059\u3002",
        resolvedTabUrl: String(window.location.href || "").slice(0, 500),
        persistedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      void chrome.storage.local.set({ [KEY_AI_SHARE_FAST_DIAG]: payload });
    } catch {
    }
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
    if (rect.width < 260 || rect.height < 140) return false;
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
  function watchDockPanelMaxHeightPx() {
    let ih = Number(nlsViewportSize().innerHeight) || 0;
    if (ih < 280) ih = 720;
    const capped = Math.min(Math.round(ih * 0.58), 720);
    return Math.max(260, capped);
  }
  function syncWatchPageDockBodyReserve() {
    if (!isWatchInlinePanelTopFrame()) return;
    try {
      document.documentElement.style.removeProperty("padding-bottom");
    } catch {
    }
  }
  function getEffectiveInlinePanelPlacement() {
    return effectiveInlinePanelPlacement(
      inlinePanelPlacementMode,
      nlsViewportSize().innerWidth
    );
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
  function pickInlinePanelVideoWithinTarget(target) {
    if (!(target instanceof HTMLElement)) return null;
    if (target instanceof HTMLVideoElement) {
      const r = target.getBoundingClientRect();
      return r.width >= 260 && r.height >= 140 ? target : null;
    }
    const list = Array.from(target.querySelectorAll("video")).filter(
      (v) => v instanceof HTMLVideoElement
    );
    for (const v of list) {
      const r = v.getBoundingClientRect();
      const st = window.getComputedStyle(v);
      if (r.width >= 260 && r.height >= 140 && st.visibility !== "hidden" && st.display !== "none") {
        return v;
      }
    }
    const picked = pickBestInlinePanelVideo();
    if (picked && target.contains(picked)) return picked;
    return null;
  }
  function findWatchFrameTargetElement() {
    let video = pickBestInlinePanelVideo();
    if (!video && stableFrameTarget instanceof HTMLVideoElement && stableFrameTarget.isConnected) {
      const rect = stableFrameTarget.getBoundingClientRect();
      const st = window.getComputedStyle(stableFrameTarget);
      if (rect.width >= 260 && rect.height >= 140 && st.visibility !== "hidden" && st.display !== "none") {
        video = stableFrameTarget;
      }
    }
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
  function isWatchInlinePanelTopFrame() {
    try {
      return window.self === window.top;
    } catch {
      return false;
    }
  }
  function renderPageFrameOverlay() {
    if (renderingPageFrame) return;
    if (!isWatchInlinePanelTopFrame()) {
      hidePageFrameOverlay();
      return;
    }
    if (!isNicoLiveWatchUrl(window.location.href)) {
      hidePageFrameOverlay();
      return;
    }
    if (!inlinePanelAutoshowEnabled && !toolbarInitiatedShowThisSession) {
      hidePageFrameOverlay();
      return;
    }
    renderingPageFrame = true;
    try {
      const overlay = ensurePageFrameOverlay();
      overlay.style.display = "none";
      const effPlacement = getEffectiveInlinePanelPlacement();
      if (effPlacement === INLINE_PANEL_PLACEMENT_FLOATING) {
        renderInlinePanelFloatingHost();
      } else if (effPlacement === INLINE_PANEL_PLACEMENT_DOCK_BOTTOM) {
        renderInlinePanelDockBottomHost();
      } else {
        const target = findWatchFrameTargetElement();
        if (!target) {
          renderInlinePanelDockBottomHost();
        } else {
          const rect = target.getBoundingClientRect();
          if (rect.width < 260 || rect.height < 140) {
            renderInlinePanelDockBottomHost();
          } else {
            renderInlinePopupHost(target);
          }
        }
      }
      if (!inlineHostLooksVisible() && effPlacement !== INLINE_PANEL_PLACEMENT_FLOATING && effPlacement !== INLINE_PANEL_PLACEMENT_DOCK_BOTTOM) {
        renderInlinePanelDockBottomHost();
      }
    } catch (e) {
      noteInlinePanelRenderError("renderPageFrameOverlay", e);
      try {
        renderInlinePanelDockBottomHost();
      } catch (fallbackErr) {
        noteInlinePanelRenderError("renderPageFrameOverlay:fallback", fallbackErr);
      }
    } finally {
      renderingPageFrame = false;
      syncWatchPageDockBodyReserve();
    }
    startPageFrameLoop();
  }
  async function loadPageFrameSettings() {
    if (!hasExtensionContext()) return;
    const bag = await chrome.storage.local.get([
      KEY_POPUP_FRAME,
      KEY_POPUP_FRAME_CUSTOM,
      KEY_INLINE_PANEL_WIDTH_MODE,
      KEY_INLINE_PANEL_PLACEMENT,
      KEY_INLINE_FLOATING_ANCHOR,
      KEY_INLINE_PANEL_AUTOSHOW_ENABLED
    ]);
    inlinePanelWidthMode = normalizeInlinePanelWidthMode(
      bag[KEY_INLINE_PANEL_WIDTH_MODE]
    );
    inlinePanelPlacementMode = normalizeInlinePanelPlacement(
      bag[KEY_INLINE_PANEL_PLACEMENT]
    );
    inlineFloatingAnchor = normalizeInlineFloatingAnchor(
      bag[KEY_INLINE_FLOATING_ANCHOR]
    );
    inlinePanelAutoshowEnabled = normalizeInlinePanelAutoshowEnabled(
      bag[KEY_INLINE_PANEL_AUTOSHOW_ENABLED]
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
      maybeRunEndedBulkHarvest();
      persistAiShareFastDiagnostics();
    };
    pageFrameLoopTimer = setInterval(tick, PAGE_FRAME_LOOP_MS);
    window.addEventListener("scroll", tick, { passive: true });
    window.addEventListener("resize", tick);
    document.addEventListener("visibilitychange", tick);
    tick();
  }
  function hasExtensionContext() {
    try {
      return Boolean(chrome?.runtime?.id && chrome?.storage?.local);
    } catch {
      return false;
    }
  }
  function isContextInvalidatedError2(err) {
    return isContextInvalidatedError(err);
  }
  function reportSilentErrorToStorage(context, err) {
    const p = buildSilentErrorPayload(context, err, liveId);
    if (!p.shouldReport || !hasExtensionContext()) return;
    try {
      chrome.storage.local.set({ [KEY_STORAGE_WRITE_ERROR]: { at: p.at, ...p.liveId ? { liveId: p.liveId } : {}, ...p.message ? { message: p.message } : {} } });
    } catch {
    }
  }
  function isVisibleElement(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (!el.isConnected || el.hidden) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    try {
      if (typeof el.getClientRects === "function" && el.getClientRects().length > 0) {
        return true;
      }
    } catch {
    }
    return true;
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
    const inScope = findCommentSubmitButton(scope, editor);
    if (inScope) return inScope;
    return findCommentSubmitButton(document, editor);
  }
  function trySubmitComment(editor) {
    const form = editor instanceof HTMLElement ? editor.closest("form") : null;
    const scope = form || (editor instanceof HTMLElement ? editor.closest('[class*="comment" i], [role="group"]') : null) || document;
    const scopedEditor = editor instanceof HTMLElement ? editor : null;
    const btnInScope = findCommentSubmitButton(scope, scopedEditor);
    if (btnInScope) {
      btnInScope.click();
      return true;
    }
    if (form && typeof form.requestSubmit === "function") {
      form.requestSubmit();
      return true;
    }
    const btnGlobal = findCommentSubmitButton(document, scopedEditor);
    if (btnGlobal) {
      btnGlobal.click();
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
  function canPostCommentInThisFrame() {
    if (locationAllowsCommentRecording()) return true;
    return Boolean(findCommentEditorElement());
  }
  async function confirmSubmittedCommentAsync(editor, rawText) {
    const expected = normalizeCommentText(rawText);
    if (!expected) return false;
    return waitUntilEditorReflectsSubmit({
      expectedNormalized: expected,
      readNormalized: () => {
        const currentEditor = editor.isConnected && isVisibleElement(editor) ? editor : findCommentEditorElement();
        return normalizeCommentText(readCommentEditorText(currentEditor));
      },
      probeEndpointsMs: COMMENT_SUBMIT_CONFIRM_PROBE_MS
    });
  }
  async function postCommentFromContentAsync(rawText) {
    if (!canPostCommentInThisFrame()) {
      return { ok: false, error: "\u30B3\u30E1\u30F3\u30C8\u6B04\u306E\u3042\u308Bwatch\u30D5\u30EC\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002" };
    }
    const text = String(rawText || "").trim();
    if (!text) {
      return { ok: false, error: "\u30B3\u30E1\u30F3\u30C8\u304C\u7A7A\u3067\u3059\u3002" };
    }
    const editor = await pollUntil(findCommentEditorElement, {
      timeoutMs: SUBMIT_TIMING.editorPollTimeoutMs,
      intervalMs: SUBMIT_TIMING.editorPollIntervalMs
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
      await new Promise((r) => setTimeout(r, SUBMIT_TIMING.reactSettleMs));
      const submitOnce = async () => {
        const btn = await pollUntil(() => findVisibleEnabledSubmitForEditor(editor), {
          timeoutMs: SUBMIT_TIMING.buttonPollTimeoutMs,
          intervalMs: SUBMIT_TIMING.buttonPollIntervalMs
        });
        if (btn) {
          btn.click();
          return true;
        }
        return trySubmitComment(editor);
      };
      if (!await submitOnce()) {
        return {
          ok: false,
          error: "\u516C\u5F0F\u306E\u9001\u4FE1\u30DC\u30BF\u30F3\u3092\u898B\u3064\u3051\u3089\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002watch\u30DA\u30FC\u30B8\u3092\u518D\u8AAD\u307F\u8FBC\u307F\u3057\u3001\u30B3\u30E1\u30F3\u30C8\u6B04\u304C\u898B\u3048\u308B\u72B6\u614B\u3067\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
        };
      }
      if (await confirmSubmittedCommentAsync(editor, text)) {
        return { ok: true };
      }
      if (!await submitOnce()) {
        return {
          ok: false,
          error: "\u30B3\u30E1\u30F3\u30C8\u9001\u4FE1\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002watch\u30DA\u30FC\u30B8\u3092\u524D\u9762\u306B\u51FA\u3057\u3001\u5FC5\u8981\u306A\u3089\u518D\u8AAD\u307F\u8FBC\u307F\u3057\u3066\u304B\u3089\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
        };
      }
      if (await confirmSubmittedCommentAsync(editor, text)) {
        return { ok: true };
      }
      return {
        ok: false,
        error: "\u30B3\u30E1\u30F3\u30C8\u9001\u4FE1\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002watch\u30DA\u30FC\u30B8\u3092\u524D\u9762\u306B\u51FA\u3057\u3001\u5FC5\u8981\u306A\u3089\u518D\u8AAD\u307F\u8FBC\u307F\u3057\u3066\u304B\u3089\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
      };
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err ? String(
        /** @type {{ message?: unknown }} */
        err.message || "post_failed"
      ) : "post_failed";
      return { ok: false, error: message };
    }
  }
  function resolveCommentEditorFromTarget(node) {
    if (!(node instanceof Element)) return null;
    const direct = node.closest(
      'textarea, input[type="text"], [contenteditable="true"], [contenteditable="plaintext-only"]'
    );
    if (direct instanceof HTMLElement) return direct;
    return null;
  }
  function readCommentEditorText(el) {
    if (!el) return "";
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      return String(el.value || "").trim();
    }
    if (el.isContentEditable) {
      return String(el.textContent || "").trim();
    }
    return "";
  }
  async function rememberNativeSelfPostedComment(rawText) {
    const lid = String(liveId || "").trim().toLowerCase();
    const textNorm = normalizeCommentText(rawText);
    if (!lid || !textNorm || !hasExtensionContext()) return;
    const now = Date.now();
    if (lastNativeSelfPost.liveId === lid && lastNativeSelfPost.textNorm === textNorm && now - lastNativeSelfPost.at < SELF_POST_NATIVE_DEDUPE_MS) {
      return;
    }
    lastNativeSelfPost = { liveId: lid, textNorm, at: now };
    try {
      const bag = await chrome.storage.local.get(KEY_SELF_POSTED_RECENTS);
      const raw = bag[KEY_SELF_POSTED_RECENTS];
      const items = raw && typeof raw === "object" && Array.isArray(raw.items) ? raw.items : [];
      const next = items.filter(
        (x) => x && typeof x.liveId === "string" && typeof x.textNorm === "string" && typeof x.at === "number" && now - x.at < SELF_POST_RECENT_TTL_MS
      );
      const duplicated = next.some(
        (it) => String(it.liveId || "").trim().toLowerCase() === lid && String(it.textNorm || "") === textNorm && Math.abs(now - (Number(it.at) || 0)) < SELF_POST_NATIVE_DEDUPE_MS
      );
      if (duplicated) return;
      next.push({ liveId: lid, at: now, textNorm });
      while (next.length > MAX_SELF_POSTED_ITEMS) next.shift();
      await chrome.storage.local.set({
        [KEY_SELF_POSTED_RECENTS]: { items: next }
      });
    } catch {
    }
  }
  function scheduleNativeSelfPostedConfirm(editor, rawText) {
    const expected = normalizeCommentText(rawText);
    const lid = String(liveId || "").trim().toLowerCase();
    if (!expected || !lid || !recording) return;
    const probes = [...COMMENT_SUBMIT_CONFIRM_PROBE_MS];
    let done = false;
    for (const delayMs of probes) {
      setTimeout(() => {
        if (done) return;
        if (!hasExtensionContext()) return;
        if (!recording) return;
        if (String(liveId || "").trim().toLowerCase() !== lid) return;
        const currentEditor = editor.isConnected && isVisibleElement(editor) ? editor : findCommentEditorElement();
        const currentText = normalizeCommentText(readCommentEditorText(currentEditor));
        if (currentText && currentText === expected) return;
        done = true;
        void rememberNativeSelfPostedComment(rawText);
      }, delayMs);
    }
  }
  function bindNativeSelfPostedRecorder() {
    if (nativeSelfPostRecorderBound) return;
    nativeSelfPostRecorderBound = true;
    document.addEventListener(
      "click",
      (ev) => {
        if (!ev.isTrusted) return;
        if (!liveId || !recording || !locationAllowsCommentRecording()) return;
        const target = ev.target;
        if (!(target instanceof Element)) return;
        const clickedButton = target.closest('button, [role="button"]');
        if (!(clickedButton instanceof HTMLElement) || !isVisibleElement(clickedButton)) {
          return;
        }
        const editor = findCommentEditorElement();
        if (!editor) return;
        const submit = findVisibleEnabledSubmitForEditor(editor);
        if (!(submit instanceof HTMLElement) || submit !== clickedButton) return;
        const text = readCommentEditorText(editor);
        if (!text) return;
        scheduleNativeSelfPostedConfirm(editor, text);
      },
      true
    );
    document.addEventListener(
      "keydown",
      (ev) => {
        if (!ev.isTrusted) return;
        if (ev.key !== "Enter" || ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey) {
          return;
        }
        if (Boolean(ev.isComposing) || ev.keyCode === 229) return;
        if (!liveId || !recording || !locationAllowsCommentRecording()) return;
        const editor = resolveCommentEditorFromTarget(
          ev.target instanceof Element ? ev.target : null
        );
        if (!(editor instanceof HTMLElement) || !isVisibleElement(editor)) return;
        const current = findCommentEditorElement();
        if (current && current !== editor) return;
        const text = readCommentEditorText(editor);
        if (!text) return;
        scheduleNativeSelfPostedConfirm(editor, text);
      },
      true
    );
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
    const embeddedProps = (() => {
      try {
        return extractEmbeddedDataProps(document);
      } catch {
        return null;
      }
    })();
    const broadcasterNameFromEmbedded = clean(
      embeddedProps?.program?.supplier?.name ?? ""
    );
    const broadcasterNameFromMeta = clean(
      metaGet(metaMap, ["author", "twitter:creator", "profile:username"])
    );
    const broadcasterNameFromStreamLink = clean(streamLink?.textContent || "");
    const broadcasterNameFromDomFallback = clean(
      document.querySelector('[class*="userName"], [class*="streamerName"]')?.textContent || ""
    );
    const broadcasterName = broadcasterNameFromEmbedded || broadcasterNameFromStreamLink || broadcasterNameFromMeta || broadcasterNameFromDomFallback;
    const broadcasterUserId = (() => {
      const href = String(streamLink?.getAttribute("href") || "");
      const m = href.match(/\/user\/(\d+)/);
      if (m) return m[1];
      const supplierId = String(
        embeddedProps?.program?.supplier?.programProviderId ?? embeddedProps?.program?.supplier?.id ?? ""
      ).trim();
      if (/^\d+$/.test(supplierId)) return supplierId;
      const pageUrl = String(embeddedProps?.program?.supplier?.pageUrl ?? "");
      const m2 = pageUrl.match(/\/user\/(\d+)/);
      return m2 ? m2[1] : "";
    })();
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
    const WS_STALE_MS = 12e4;
    const wsRecent = wsViewerCount != null && wsViewerCountUpdatedAt > 0 && Date.now() - wsViewerCountUpdatedAt < WS_STALE_MS;
    const officialCommentSummary = summarizeOfficialCommentHistory({
      history: officialCommentHistory,
      nowMs: Date.now(),
      targetWindowMs: typeof officialViewerIntervalMs === "number" && officialViewerIntervalMs > 0 ? officialViewerIntervalMs : 6e4,
      minWindowMs: 15e3
    });
    let viewerCountFromDom = null;
    let viewerCountSource = "none";
    if (wsRecent) {
      viewerCountFromDom = wsViewerCount;
      viewerCountSource = "ws";
    }
    if (viewerCountFromDom == null) {
      const props = extractEmbeddedDataProps(document);
      if (props) {
        viewerCountFromDom = pickViewerCountFromEmbeddedData(props);
        if (viewerCountFromDom != null) viewerCountSource = "embedded";
      }
    }
    if (viewerCountFromDom == null) {
      viewerCountFromDom = parseLiveViewerCountFromDocument(document) ?? parseViewerCountFromSnapshotMetas(metas);
      if (viewerCountFromDom != null) viewerCountSource = "dom";
    }
    const _debug = {};
    try {
      const _edProps = extractEmbeddedDataProps(document);
      Object.assign(_debug, {
        wsViewerCount,
        wsCommentCount,
        wsAge: wsViewerCountUpdatedAt ? Date.now() - wsViewerCountUpdatedAt : -1,
        intercept: interceptedUsers.size,
        interceptNicknames: interceptedNicknames.size,
        interceptAvatars: interceptedAvatars.size,
        fiberDiag: document.documentElement?.getAttribute("data-nls-fiber-diag") || "",
        harvestPipeline: {
          ...deepHarvestPipelineStats,
          harvestRunning,
          ndgrPending: ndgrChatRowsPending.length,
          ndgrLastReceivedAgo: ndgrLastReceivedAt > 0 ? Date.now() - ndgrLastReceivedAt : null,
          lastPersistBatch: lastPersistCommentBatchSize,
          persistGateFailures: lastPersistGateFailures
        },
        embeddedVC: _edProps ? pickViewerCountFromEmbeddedData(_edProps) : null,
        officialVsRecorded: officialCommentCount != null && Number.isFinite(officialCommentCount) && officialCommentCount >= 0 ? {
          officialComments: officialCommentCount,
          recordedComments: observedRecordedCommentCount
        } : null,
        programBeginAtMs,
        embeddedBeginAt: _edProps ? pickProgramBeginAt(_edProps) : null,
        startAtText,
        edProgramKeys: _edProps?.program ? Object.keys(_edProps.program).slice(0, 20).join(",") : "",
        poll: { ..._pollDiag }
      });
      const sels = {
        tblRow: "div.table-row",
        roleRow: '[role="row"]',
        gaPanel: ".ga-ns-comment-panel",
        cClass: '[class*="comment" i]',
        dCType: "[data-comment-type]",
        uicon: 'img[src*="usericon"], img[src*="nicoaccount"]',
        dgrid: '[class*="data-grid"]',
        dgridRow: '[class*="data-grid"] > div'
      };
      const c = {};
      for (const [k, sel] of Object.entries(sels)) {
        try {
          c[k] = document.querySelectorAll(sel).length;
        } catch {
          c[k] = -1;
        }
      }
      _debug.dom = c;
      const grid = document.querySelector('[class*="comment-data-grid"], [class*="data-grid"]');
      if (grid) {
        const kids = Array.from(grid.children).slice(0, 3);
        _debug.gridTag = grid.tagName;
        _debug.gridCls = (grid.className || "").substring(0, 80);
        _debug.gridKidCount = grid.children.length;
        _debug.gridKids = kids.map((ch) => {
          const attrs = [];
          for (let i = 0; i < Math.min(ch.attributes.length, 6); i++) {
            const a = ch.attributes[i];
            if (a.name === "class") continue;
            attrs.push(`${a.name}=${String(a.value).substring(0, 30)}`);
          }
          const firstChild = ch.children[0];
          const fcInfo = firstChild ? `${firstChild.tagName}.${(firstChild.className || "").substring(0, 40)}` : "";
          return {
            tag: ch.tagName,
            cls: (ch.className || "").substring(0, 80),
            childCount: ch.children.length,
            attrs: attrs.join(" "),
            fc: fcInfo,
            txt: (ch.textContent || "").substring(0, 50).replace(/\s+/g, " ")
          };
        });
        const deepKid = grid.querySelector("div > div > div");
        if (deepKid) {
          _debug.deepSample = {
            tag: deepKid.tagName,
            cls: (deepKid.className || "").substring(0, 80),
            txt: (deepKid.textContent || "").substring(0, 60).replace(/\s+/g, " ")
          };
        }
      }
      {
        const g2 = document.querySelector('[class*="comment-data-grid"], [class*="data-grid"]');
        if (g2) {
          const bdy = g2.querySelector('[class*="body"]');
          const tbl = bdy?.querySelector('[class*="table"]');
          const rc = tbl || bdy;
          if (rc) {
            const rws = Array.from(rc.children).slice(0, 3);
            _debug.tblKids = rc.children.length;
            _debug.tblRows = rws.map((r) => ({
              tag: r.tagName,
              cls: (r.className || "").substring(0, 80),
              ch: r.children.length,
              role: r.getAttribute("role") || "",
              style: (r.getAttribute("style") || "").substring(0, 60),
              txt: (r.textContent || "").substring(0, 50).replace(/\s+/g, " ")
            }));
          }
        }
      }
      const docEl = document.documentElement;
      if (docEl) {
        _debug.pi = docEl.getAttribute("data-nls-page-intercept") || "";
        _debug.piEnq = docEl.getAttribute("data-nls-page-intercept-enqueued") || "";
        _debug.piPost = docEl.getAttribute("data-nls-page-intercept-posted") || "";
        _debug.piWs = docEl.getAttribute("data-nls-page-intercept-ws") || "";
        _debug.piFetch = docEl.getAttribute("data-nls-page-intercept-fetch") || "";
        _debug.piXhr = docEl.getAttribute("data-nls-page-intercept-xhr") || "";
        _debug.fbScans = docEl.getAttribute("data-nls-fiber-scans") || "";
        _debug.fbFound = docEl.getAttribute("data-nls-fiber-found") || "";
        _debug.fbRows = docEl.getAttribute("data-nls-fiber-rows") || "";
        _debug.fbProbe = docEl.getAttribute("data-nls-fiber-probe") || "";
        _debug.fbStep = docEl.getAttribute("data-nls-fiber-step") || "";
        _debug.fbAttempts = docEl.getAttribute("data-nls-fiber-attempts") || "";
        _debug.fbErr = docEl.getAttribute("data-nls-fiber-err") || "";
        _debug.fetchLog = docEl.getAttribute("data-nls-fetch-log") || "";
        _debug.fetchOther = docEl.getAttribute("data-nls-fetch-other") || "";
        _debug.piPhase = docEl.getAttribute("data-nls-pi-phase") || "";
        _debug.ndgr = docEl.getAttribute("data-nls-ndgr") || "";
        _debug.ndgrLdStream = docEl.getAttribute("data-nls-ld-stream") || "";
      }
      try {
        const ctHist = {};
        document.querySelectorAll("div.table-row[data-comment-type]").forEach((el) => {
          const t = el.getAttribute("data-comment-type") || "?";
          ctHist[t] = (ctHist[t] || 0) + 1;
        });
        _debug.commentTypeVisibleSample = ctHist;
      } catch {
      }
    } catch {
    }
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
      viewerUserId: viewer.viewerUserId,
      broadcasterUserId,
      broadcasterLevel: (() => {
        try {
          const lv = embeddedProps?.program?.supplier?.level ?? embeddedProps?.socialGroup?.level ?? embeddedProps?.user?.userLevel;
          if (typeof lv === "number" && Number.isFinite(lv) && lv > 0) return lv;
          const parsed = parseInt(String(lv), 10);
          return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
        } catch {
          return null;
        }
      })(),
      viewerCountFromDom,
      viewerCountSource,
      ...buildWatchSnapshotOfficialFields({
        nowMs: Date.now(),
        officialViewerCount,
        officialCommentCount,
        officialStatsUpdatedAt,
        officialCommentStatsUpdatedAt,
        officialViewerIntervalMs,
        officialCommentSummary
      }),
      totalComments: wsCommentCount,
      streamAgeMin: (() => {
        if (programBeginAtMs != null && Number.isFinite(programBeginAtMs)) {
          const age = (Date.now() - programBeginAtMs) / 6e4;
          if (age >= 0) return Math.round(age);
        }
        const beginMs = embeddedProps ? pickProgramBeginAt(embeddedProps) : null;
        if (beginMs != null && Number.isFinite(beginMs)) {
          const age = (Date.now() - beginMs) / 6e4;
          if (age >= 0) return Math.round(age);
        }
        const satm = startAtText.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\([^)]*\)\s+(\d{1,2}):(\d{2})/);
        if (satm) {
          const d = new Date(+satm[1], +satm[2] - 1, +satm[3], +satm[4], +satm[5]);
          const age = (Date.now() - d.getTime()) / 6e4;
          if (age >= 0 && age < 1440) return Math.round(age);
        }
        try {
          const playerArea = document.querySelector('[class*="player" i], [class*="Player" i], [id*="player" i], video')?.closest('[class*="player" i], [class*="Player" i], [id*="player" i]') || document.querySelector('[class*="player" i], [class*="Player" i]');
          const txt = playerArea?.textContent || "";
          const pm = txt.match(/(\d{1,2}):(\d{2}):(\d{2})\s*\/\s*\d/);
          if (pm) return +pm[1] * 60 + +pm[2];
        } catch {
        }
        return null;
      })(),
      recentActiveUsers: countRecentActiveUsers(activeUserTimestamps, Date.now()),
      _debug
    };
  }
  function isWatchPageMainFrameForMessages() {
    try {
      return window.self === window.top;
    } catch {
      return true;
    }
  }
  function buildInterceptCacheExportItems() {
    const avatarByUid = /* @__PURE__ */ new Map();
    for (const [uid, av] of interceptedAvatars) {
      if (uid && isHttpAvatarUrl(av) && !avatarByUid.has(uid)) {
        avatarByUid.set(uid, String(av).trim());
      }
    }
    for (const v of interceptedUsers.values()) {
      const uid = String(v?.uid || "").trim();
      const av = String(v?.av || "").trim();
      if (!uid || !isHttpAvatarUrl(av)) continue;
      if (!avatarByUid.has(uid)) avatarByUid.set(uid, av);
    }
    const items = [];
    for (const [no, v] of interceptedUsers) {
      const uid = String(v?.uid || "").trim();
      const name = String(v?.name || "").trim() || (uid ? String(interceptedNicknames.get(uid) || "").trim() : "");
      const av = String(v?.av || "").trim() || String(avatarByUid.get(uid) || "").trim();
      if (!uid && !name && !isHttpAvatarUrl(av)) continue;
      items.push({
        no: String(no || "").trim(),
        ...uid ? { uid } : {},
        ...name ? { name } : {},
        ...isHttpAvatarUrl(av) ? { av } : {}
      });
    }
    const MAX = 12e3;
    return items.length > MAX ? items.slice(items.length - MAX) : items;
  }
  function buildAiSharePageDiagnostics() {
    const g = typeof globalThis !== "undefined" ? globalThis : window;
    const href = String(window.location.href || "");
    let isTop = true;
    try {
      isTop = window.self === window.top;
    } catch {
      isTop = true;
    }
    const target = findWatchFrameTargetElement();
    const placementEffective = getEffectiveInlinePanelPlacement();
    let insertionPlan = null;
    if (placementEffective === INLINE_PANEL_PLACEMENT_FLOATING) {
      insertionPlan = {
        mode: "floating",
        description: "fixed top-right on viewport; not inserted into player DOM"
      };
    } else if (placementEffective === INLINE_PANEL_PLACEMENT_DOCK_BOTTOM) {
      insertionPlan = {
        mode: "dock_bottom",
        description: "fixed full-width bottom of viewport; not inserted into player DOM"
      };
    } else if (target instanceof HTMLElement) {
      let video = null;
      if (target instanceof HTMLVideoElement) {
        video = target;
      } else {
        const cand = pickInlinePanelVideoWithinTarget(target);
        if (cand) {
          const vr = cand.getBoundingClientRect();
          if (vr.width >= 260 && vr.height >= 140) video = cand;
        }
      }
      let insertResolve = target;
      if (video) {
        const domAnchor = findFrameInsertAnchorFromVideo(video);
        insertResolve = placementEffective === INLINE_PANEL_PLACEMENT_BESIDE ? video : domAnchor;
      }
      let insertAfter;
      let hostParent;
      let besideFlexRowColumnChosen = false;
      if (video && placementEffective === INLINE_PANEL_PLACEMENT_BESIDE) {
        const col = findBesideFlexRowColumnInsertion(video);
        if (col?.hostParent && col.insertAfter) {
          insertAfter = col.insertAfter;
          hostParent = col.hostParent;
          besideFlexRowColumnChosen = true;
        } else {
          const r = resolveInlinePanelInsertAnchor(
            insertResolve,
            placementEffective
          );
          insertAfter = /** @type {HTMLElement} */
          r.insertAfter;
          hostParent = r.hostParent;
        }
      } else {
        const r = resolveInlinePanelInsertAnchor(
          insertResolve,
          placementEffective
        );
        insertAfter = /** @type {HTMLElement} */
        r.insertAfter;
        hostParent = r.hostParent;
      }
      const hpKind = hostParent == null ? "null" : hostParent instanceof ShadowRoot ? "ShadowRoot" : hostParent instanceof HTMLElement ? String(hostParent.nodeName || "").toLowerCase() : typeof hostParent;
      insertionPlan = {
        insertResolveTag: insertResolve instanceof HTMLElement ? String(insertResolve.tagName || "").toLowerCase() : "?",
        insertAfterTag: insertAfter instanceof HTMLElement ? String(insertAfter.tagName || "").toLowerCase() : "?",
        hostParentKind: hpKind,
        usedVideoPath: Boolean(video),
        besideFlexRowColumnChosen
      };
    }
    const host = nlsInlinePopupHostSingleton || document.getElementById(INLINE_POPUP_HOST_ID);
    let hostBrief = null;
    if (host) {
      const cs = window.getComputedStyle(host);
      const r = host.getBoundingClientRect();
      hostBrief = {
        isConnected: host.isConnected,
        inlineDisplay: host.style.display || "",
        computedDisplay: cs.display,
        computedVisibility: cs.visibility,
        rectTop: Math.round(r.top),
        rectLeft: Math.round(r.left),
        rectW: Math.round(r.width),
        rectH: Math.round(r.height),
        parentNodeName: host.parentNode ? host.parentNode.nodeName : "",
        parentIsShadowRoot: host.parentNode instanceof ShadowRoot
      };
    }
    let targetBrief = null;
    if (target instanceof HTMLElement) {
      const r = target.getBoundingClientRect();
      targetBrief = {
        tag: String(target.tagName || "").toLowerCase(),
        id: String(target.id || "").slice(0, 100),
        cls: String(target.className || "").slice(0, 200),
        rectW: Math.round(r.width),
        rectH: Math.round(r.height)
      };
    }
    return {
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      frame: {
        isTop,
        href: href.slice(0, 500),
        userAgent: String(navigator.userAgent || "").slice(0, 280)
      },
      contentScript: {
        hasExtensionContext: hasExtensionContext(),
        executionStarted: Boolean(g.__NLS_CONTENT_ENTRY_STARTED__),
        dataNlsActive: document.documentElement?.getAttribute?.("data-nls-active") ?? null,
        shouldRunWatchContentInThisFrame: shouldRunWatchContentInThisFrame()
      },
      watch: {
        isNicoLiveWatchUrl: isNicoLiveWatchUrl(href)
      },
      player: {
        videoCount: document.querySelectorAll("video").length,
        frameTarget: targetBrief
      },
      inlinePanel: {
        placementMode: inlinePanelPlacementMode,
        placementEffective,
        besideNarrowViewportFallback: inlinePanelPlacementMode === INLINE_PANEL_PLACEMENT_BESIDE && placementEffective !== inlinePanelPlacementMode,
        viewportInnerWidth: nlsViewportSize().innerWidth,
        widthMode: inlinePanelWidthMode,
        floatingAnchor: inlineFloatingAnchor,
        insertionPlan,
        host: hostBrief,
        recentRenderErrors: nlsInlinePanelRenderErrors.slice()
      },
      pageFrameLoopTimerActive: Boolean(pageFrameLoopTimer),
      romiDebug: {
        recording,
        liveId: String(liveId || ""),
        harvestRunning,
        deepHarvestRunCount: deepHarvestPipelineStats.runCount,
        deepHarvestLastRowCount: deepHarvestPipelineStats.lastRowCount,
        deepHarvestLastCompletedAt: deepHarvestPipelineStats.lastCompletedAt || 0,
        deepHarvestLastError: deepHarvestPipelineStats.lastError,
        ndgrPending: ndgrChatRowsPending.length,
        ndgrLastReceivedAgo: ndgrLastReceivedAt > 0 ? Math.max(0, Date.now() - ndgrLastReceivedAt) : null,
        interceptMapSize: interceptedUsers.size,
        interceptNicknameSize: interceptedNicknames.size,
        interceptAvatarSize: interceptedAvatars.size,
        lastPersistBatch: lastPersistCommentBatchSize,
        persistGateFailures: Array.isArray(lastPersistGateFailures) ? lastPersistGateFailures.slice(0, 8) : [],
        endedBulkHarvestTriggeredLiveId: String(endedBulkHarvestTriggeredLiveId || ""),
        endedBulkHarvestLastCheckedAgo: endedBulkHarvestLastCheckedAt > 0 ? Math.max(0, Date.now() - endedBulkHarvestLastCheckedAt) : null
      }
    };
  }
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!hasExtensionContext()) return;
    if (!msg || typeof msg !== "object" || !("type" in msg)) return;
    if (msg.type === "NLS_FOCUS_INLINE_PANEL") {
      if (!isWatchInlinePanelTopFrame()) {
        return false;
      }
      toolbarInitiatedShowThisSession = true;
      try {
        renderPageFrameOverlay();
      } catch {
      }
      const focused = focusInlinePanelHostFromToolbar();
      sendResponse({ ok: true, focused });
      return false;
    }
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
      if (!canPostCommentInThisFrame()) {
        sendResponse({
          ok: false,
          error: "\u3053\u306E\u30D5\u30EC\u30FC\u30E0\u306B\u306F\u30B3\u30E1\u30F3\u30C8\u6B04\u304C\u3042\u308A\u307E\u305B\u3093\u3002"
        });
        return true;
      }
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
      if (!canExportWatchSnapshotFromThisFrame()) {
        sendResponse({
          ok: false,
          error: "watch\u30DA\u30FC\u30B8\u4EE5\u5916\u3067\u306F\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093"
        });
        return;
      }
      syncLiveIdFromLocation();
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
    if (msg.type === "NLS_EXPORT_INTERCEPT_CACHE") {
      if (!canExportWatchSnapshotFromThisFrame()) {
        sendResponse({
          ok: false,
          error: "watch\u30DA\u30FC\u30B8\u4EE5\u5916\u3067\u306F\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093"
        });
        return;
      }
      void (async () => {
        try {
          const deep = !!(msg && typeof msg === "object" && "deep" in msg && /** @type {{ deep?: unknown }} */
          msg.deep);
          const deepPlan = planDeepExportSweep({
            deep,
            ndgrLastReceivedAt,
            now: Date.now(),
            thresholdMs: HARVEST_TIMING.ndgrActiveThresholdMs
          });
          if (deepPlan.shouldRunSweep && locationAllowsCommentRecording()) {
            const rows = await harvestVirtualCommentList({
              document,
              extractCommentsFromNode,
              waitMs: 42,
              respectTyping: false,
              quietScroll: deepPlan.quietScroll
            });
            for (const r of rows) {
              const no = String(r?.commentNo || "").trim();
              const uid = String(r?.userId || "").trim();
              if (!no) continue;
              const av = isHttpAvatarUrl(r?.avatarUrl) ? String(r.avatarUrl).trim() : "";
              if (!uid && !av) continue;
              const prev = interceptedUsers.get(no);
              const name = String(prev?.name || "").trim();
              const prevUid = String(prev?.uid || "").trim();
              const prevAv = isHttpAvatarUrl(prev?.av) ? String(prev?.av || "").trim() : "";
              interceptedUsers.set(no, {
                ...uid || prevUid ? { uid: uid || prevUid } : {},
                ...name ? { name } : {},
                ...av || prevAv ? { av: av || prevAv } : {}
              });
              if (uid && av) interceptedAvatars.set(uid, av);
            }
          }
          sendResponse({ ok: true, items: buildInterceptCacheExportItems() });
        } catch (err) {
          const msg2 = err && typeof err === "object" && "message" in err ? String(
            /** @type {{ message?: unknown }} */
            err.message || "intercept_export_error"
          ) : "intercept_export_error";
          sendResponse({
            ok: false,
            error: msg2.length > 220 ? `${msg2.slice(0, 220)}\u2026` : msg2
          });
        }
      })();
      return true;
    }
    if (msg.type === "NLS_AI_SHARE_PAGE_DIAGNOSTICS") {
      try {
        persistAiShareFastDiagnostics();
        sendResponse({
          ok: true,
          diagnostics: buildAiSharePageDiagnostics()
        });
      } catch (err) {
        sendResponse({
          ok: false,
          error: String(
            err && typeof err === "object" && "message" in err ? (
              /** @type {{ message?: unknown }} */
              err.message
            ) : err || "diag_failed"
          )
        });
      }
      return true;
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
    return isRecordingEnabled(r[KEY_RECORDING]);
  }
  async function readDeepHarvestQuietUiFromStorage() {
    if (!hasExtensionContext()) {
      deepHarvestQuietUi = true;
      return;
    }
    try {
      const bag = await chrome.storage.local.get(KEY_DEEP_HARVEST_QUIET_UI);
      deepHarvestQuietUi = isDeepHarvestQuietUiEnabled(bag[KEY_DEEP_HARVEST_QUIET_UI]);
    } catch {
      deepHarvestQuietUi = true;
    }
  }
  function bindCommentRowUserIconLoadOnce(img) {
    if (!(img instanceof HTMLImageElement)) return;
    if (img.dataset.nlsCommentAvBound === "1") return;
    img.dataset.nlsCommentAvBound = "1";
    img.addEventListener("load", onCommentPanelUserIconLoaded, { passive: true });
  }
  function onCommentPanelUserIconLoaded(ev) {
    if (!recording || !liveId || !locationAllowsCommentRecording()) return;
    const t = ev.target;
    if (!(t instanceof HTMLImageElement)) return;
    const row = closestHarvestableNicoCommentRow(t);
    if (row) {
      pendingRoots.add(row);
      scheduleFlush();
    }
  }
  function bindCommentPanelUserIconLoads(root) {
    if (!root || !root.querySelectorAll) return;
    try {
      root.querySelectorAll("img").forEach((img) => {
        bindCommentRowUserIconLoadOnce(
          /** @type {HTMLImageElement} */
          img
        );
      });
    } catch {
    }
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
      characterData: true,
      attributes: true,
      attributeFilter: [...NICO_USER_ICON_IMG_LAZY_ATTRS, "srcset"]
    });
    bindCommentPanelUserIconLoads(observedMutationRoot);
  }
  function detectBroadcasterUserIdFromDom() {
    const now = Date.now();
    if (broadcasterUidCache && now - broadcasterUidCacheAt < 3e3) {
      return broadcasterUidCache;
    }
    const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();
    const streamLink = Array.from(
      document.querySelectorAll('a[href*="/user/"]')
    ).find((a) => {
      const href2 = String(a.getAttribute("href") || "");
      const text = clean(a.textContent);
      return /\/user\/\d+/.test(href2) && /\/live_programs(?:\?|$)/.test(href2) && text && !/^https?:\/\//i.test(text);
    });
    const href = String(streamLink?.getAttribute("href") || "");
    const m = href.match(/\/user\/(\d+)/);
    broadcasterUidCache = m ? m[1] : "";
    broadcasterUidCacheAt = now;
    return broadcasterUidCache;
  }
  function enrichRowsWithInterceptedUserIds(rows) {
    const broadcasterUid = detectBroadcasterUserIdFromDom();
    return rows.map((r) => {
      const no = String(r.commentNo ?? "").trim();
      const entry = no ? interceptedUsers.get(no) : void 0;
      const rowUid = r.userId ? String(r.userId).trim() : "";
      const interceptedUid = entry?.uid ? String(entry.uid).trim() : "";
      const rowLikelyContaminated = Boolean(rowUid && broadcasterUid && rowUid === broadcasterUid);
      const mergedUid = mergeUserIdForEnrichment(
        rowUid,
        interceptedUid,
        rowLikelyContaminated
      );
      const userId = mergedUid;
      const canUseInterceptMeta = Boolean(
        entry && (interceptedUid && userId === interceptedUid || String(entry?.name || "").trim() || isHttpAvatarUrl(entry?.av))
      );
      const rowNick = r.nickname ? String(r.nickname).trim() : "";
      const nickname = (canUseInterceptMeta ? String(entry?.name || "").trim() : "") || rowNick || (userId ? interceptedNicknames.get(String(userId)) : "") || anonymousNicknameFallback(userId, "") || "";
      const rowAv = String(r.avatarUrl || "").trim();
      const interceptEntryAv = canUseInterceptMeta && isHttpAvatarUrl(entry?.av) ? String(entry?.av || "").trim() : "";
      const interceptMapAv = userId && isHttpAvatarUrl(interceptedAvatars.get(String(userId))) ? String(interceptedAvatars.get(String(userId)) || "").trim() : "";
      const { displayAvatarUrl, avatarObserved } = resolveUserEntryAvatarSignals({
        userId,
        rowAv,
        interceptEntryAv,
        interceptMapAv
      });
      return {
        ...r,
        userId,
        ...nickname ? { nickname } : {},
        ...displayAvatarUrl ? { avatarUrl: displayAvatarUrl } : {},
        ...avatarObserved ? { avatarObserved: true } : {}
      };
    });
  }
  function consumeMatchedSelfPostedRecents(added, pendingItems, lid) {
    const live = String(lid || "").trim().toLowerCase();
    const rows = Array.isArray(added) ? added : [];
    const items = Array.isArray(pendingItems) ? pendingItems : [];
    if (!live || !rows.length || !items.length) {
      return { markedIds: /* @__PURE__ */ new Set(), remainingItems: items, changed: false };
    }
    const recents = items.map((it, itemIndex) => ({
      itemIndex,
      liveId: String(it?.liveId || "").trim().toLowerCase(),
      at: Number(it?.at) || 0,
      textNorm: String(it?.textNorm || "")
    })).filter((it) => it.liveId === live && it.at > 0 && it.textNorm).sort((a, b) => a.at - b.at || a.itemIndex - b.itemIndex);
    if (!recents.length) {
      return { markedIds: /* @__PURE__ */ new Set(), remainingItems: items, changed: false };
    }
    const byText = /* @__PURE__ */ new Map();
    for (let i = 0; i < rows.length; i += 1) {
      const entry = rows[i];
      if (entry?.selfPosted) continue;
      const textNorm = normalizeCommentText(entry?.text);
      const id = String(entry?.id || "").trim();
      if (!textNorm || !id) continue;
      const bucket = byText.get(textNorm) || [];
      bucket.push({
        id,
        capturedAt: Number(entry?.capturedAt || 0),
        index: i
      });
      byText.set(textNorm, bucket);
    }
    for (const bucket of byText.values()) {
      bucket.sort((a, b) => {
        if (a.capturedAt !== b.capturedAt) return a.capturedAt - b.capturedAt;
        return a.index - b.index;
      });
    }
    const markedIds = /* @__PURE__ */ new Set();
    const consumedIndexes = /* @__PURE__ */ new Set();
    for (const recent of recents) {
      const bucket = byText.get(recent.textNorm);
      if (!bucket?.length) continue;
      let best = null;
      let bestScore = Number.POSITIVE_INFINITY;
      let bestIndex = Number.POSITIVE_INFINITY;
      for (const candidate of bucket) {
        if (markedIds.has(candidate.id)) continue;
        const cap = candidate.capturedAt;
        if (cap < recent.at - SELF_POST_MATCH_EARLY_MS || cap > recent.at + SELF_POST_MATCH_LATE_MS) {
          continue;
        }
        const delta = cap - recent.at;
        const score = Math.abs(delta) + (delta >= 0 ? 0 : SELF_POST_MATCH_EARLY_MS + 1);
        if (score < bestScore || score === bestScore && candidate.index < bestIndex) {
          best = candidate;
          bestScore = score;
          bestIndex = candidate.index;
        }
      }
      if (!best) continue;
      markedIds.add(best.id);
      consumedIndexes.add(recent.itemIndex);
    }
    if (!markedIds.size && !consumedIndexes.size) {
      return { markedIds, remainingItems: items, changed: false };
    }
    return {
      markedIds,
      remainingItems: items.filter((_, i) => !consumedIndexes.has(i)),
      changed: true
    };
  }
  function normalizeAutoBackupState(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    const rawLives = src && typeof src === "object" && "lives" in src && src.lives && typeof src.lives === "object" ? src.lives : {};
    const lives = {};
    for (const [liveId2, meta] of Object.entries(rawLives)) {
      const lid = String(liveId2 || "").trim().toLowerCase();
      if (!lid) continue;
      const row = meta && typeof meta === "object" ? meta : {};
      lives[lid] = {
        liveId: lid,
        commentCount: Math.max(0, Number(row.commentCount) || 0),
        updatedAt: Math.max(0, Number(row.updatedAt) || 0),
        lastCommentAt: Math.max(0, Number(row.lastCommentAt) || 0),
        watchUrl: String(row.watchUrl || "").trim(),
        lastBackupAt: Math.max(0, Number(row.lastBackupAt) || 0),
        lastBackedUpdatedAt: Math.max(0, Number(row.lastBackedUpdatedAt) || 0),
        lastBackupCount: Math.max(0, Number(row.lastBackupCount) || 0)
      };
    }
    return { lives };
  }
  function pruneAutoBackupLives(state) {
    const entries = Object.entries(state?.lives || {});
    if (entries.length <= AUTO_BACKUP_LIVES_MAX) return state;
    entries.sort((a, b) => {
      const aAt = Math.max(Number(a[1]?.updatedAt) || 0, Number(a[1]?.lastBackupAt) || 0);
      const bAt = Math.max(Number(b[1]?.updatedAt) || 0, Number(b[1]?.lastBackupAt) || 0);
      return bAt - aAt;
    });
    state.lives = Object.fromEntries(entries.slice(0, AUTO_BACKUP_LIVES_MAX));
    return state;
  }
  var persistCommentRowsChain = Promise.resolve();
  var MIN_PERSIST_INTERVAL_MS = INGEST_TIMING.coalescerMinMs;
  var PERSIST_BURST_THRESHOLD = INGEST_TIMING.coalescerBurstThreshold;
  var persistCoalescer = createPersistCoalescer(async (batch) => {
    const job = persistCommentRowsChain.then(() => persistCommentRowsImpl(batch));
    persistCommentRowsChain = job.catch((err) => reportSilentErrorToStorage("persist", err));
    await job;
  }, MIN_PERSIST_INTERVAL_MS, PERSIST_BURST_THRESHOLD);
  function persistCommentRows(rows, _opts = {}) {
    const gate = diagnosePersistGate({
      hasRows: !!rows?.length,
      recording,
      liveId: liveId || "",
      locationAllows: locationAllowsCommentRecording(),
      hasExtensionContext: hasExtensionContext()
    });
    if (!gate.pass) {
      if (gate.failures.length && rows?.length) {
        lastPersistGateFailures = gate.failures;
      }
      return;
    }
    lastPersistGateFailures = [];
    persistCoalescer.enqueue(
      /** @type {ParsedCommentRow[]} */
      rows
    );
  }
  async function persistCommentRowsImpl(rows, opts = {}) {
    if (!rows?.length || !recording || !liveId || !locationAllowsCommentRecording() || !hasExtensionContext()) {
      return;
    }
    lastPersistCommentBatchSize = rows.length;
    const pipelineT0 = Date.now();
    const enriched = enrichRowsWithInterceptedUserIds(rows);
    const key = commentsStorageKey(liveId);
    try {
      const bag = await readStorageBagWithRetry(
        () => chrome.storage.local.get([
          key,
          KEY_SELF_POSTED_RECENTS,
          KEY_AUTO_BACKUP_STATE,
          KEY_LAST_WATCH_URL,
          KEY_USER_COMMENT_PROFILE_CACHE,
          KEY_COMMENT_INGEST_LOG
        ]),
        { attempts: 4, delaysMs: [0, 50, 120, 280] }
      );
      const existing = Array.isArray(bag[key]) ? bag[key] : [];
      console.debug(formatPipelinePhase("start", {
        liveId,
        existingCount: existing.length,
        incomingCount: enriched.length
      }));
      const pendingRaw = bag[KEY_SELF_POSTED_RECENTS];
      const pendingItems = pendingRaw && typeof pendingRaw === "object" && Array.isArray(pendingRaw.items) ? pendingRaw.items.filter(
        (x) => x && typeof x.liveId === "string" && typeof x.textNorm === "string" && typeof x.at === "number"
      ) : [];
      const mergedRows = mergeNewComments(
        liveId,
        existing,
        enriched
      );
      let { next, storageTouched } = mergedRows;
      observedRecordedCommentCount = next.length;
      noteOfficialCommentSample(Date.now());
      const { added } = mergedRows;
      console.debug(formatPipelinePhase("merge", {
        added: added.length,
        storageTouched
      }));
      const consumed = consumeMatchedSelfPostedRecents(added, pendingItems, liveId);
      if (consumed.markedIds.size) {
        next = next.map((entry) => {
          const id = String(entry?.id || "").trim();
          if (!id || !consumed.markedIds.has(id) || entry?.selfPosted) return entry;
          return { ...entry, selfPosted: true };
        });
        storageTouched = true;
      }
      const pendingTouched = consumed.changed;
      let profileMap = normalizeUserCommentProfileMap(
        bag[KEY_USER_COMMENT_PROFILE_CACHE]
      );
      let cacheTouched = false;
      for (const r of enriched) {
        if (upsertUserCommentProfileFromEntry(profileMap, r)) cacheTouched = true;
      }
      for (const e of next) {
        if (upsertUserCommentProfileFromEntry(profileMap, e)) cacheTouched = true;
      }
      const profileApplied = applyUserCommentProfileMapToEntries(next, profileMap);
      if (profileApplied.patched > 0) {
        next = profileApplied.next;
        storageTouched = true;
      }
      const bfAv = backfillNumericSyntheticAvatarsOnStoredComments(next);
      if (bfAv.patched > 0) {
        next = bfAv.next;
        storageTouched = true;
      }
      const profileKeysBefore = Object.keys(profileMap).length;
      profileMap = pruneUserCommentProfileMap(profileMap);
      if (Object.keys(profileMap).length !== profileKeysBefore) cacheTouched = true;
      const liveObservedUserIds = /* @__PURE__ */ new Set();
      for (const item of next) {
        const uid = String(item?.userId || "").trim();
        if (uid) liveObservedUserIds.add(uid);
      }
      hydrateInterceptAvatarMapFromProfile(
        interceptedAvatars,
        profileMap,
        liveObservedUserIds
      );
      if (!storageTouched && !pendingTouched && !cacheTouched) {
        console.debug(formatPipelinePhase("skip", { reason: "no changes" }));
        return;
      }
      let ingestLogPayload = null;
      if (storageTouched || pendingTouched) {
        const src = String(opts?.source || "unknown").slice(0, 32);
        ingestLogPayload = maybeAppendCommentIngestLog(bag[KEY_COMMENT_INGEST_LOG], {
          t: Date.now(),
          liveId: String(liveId || "").trim().toLowerCase(),
          source: src,
          batchIn: rows.length,
          added: added.length,
          totalAfter: next.length,
          official: officialCommentCount != null && Number.isFinite(officialCommentCount) ? Math.floor(officialCommentCount) : null
        });
      }
      const updatedAt = Date.now();
      const lastCommentAt = Math.max(0, Number(next[next.length - 1]?.capturedAt || 0));
      const rememberedWatchUrl = String(bag[KEY_LAST_WATCH_URL] || "").trim();
      const backupWatchUrl = isNicoLiveWatchUrl(window.location.href) ? String(window.location.href || "") : extractLiveIdFromUrl(rememberedWatchUrl) === liveId ? rememberedWatchUrl : `https://live.nicovideo.jp/watch/${liveId}`;
      const autoBackupState = normalizeAutoBackupState(bag[KEY_AUTO_BACKUP_STATE]);
      const prevBackupMeta = autoBackupState.lives[String(liveId || "").trim().toLowerCase()] || {
        lastBackupAt: 0,
        lastBackedUpdatedAt: 0,
        lastBackupCount: 0
      };
      autoBackupState.lives[String(liveId || "").trim().toLowerCase()] = {
        liveId: String(liveId || "").trim().toLowerCase(),
        commentCount: next.length,
        updatedAt,
        lastCommentAt,
        watchUrl: backupWatchUrl,
        lastBackupAt: Math.max(0, Number(prevBackupMeta.lastBackupAt) || 0),
        lastBackedUpdatedAt: Math.max(0, Number(prevBackupMeta.lastBackedUpdatedAt) || 0),
        lastBackupCount: Math.max(0, Number(prevBackupMeta.lastBackupCount) || 0)
      };
      pruneAutoBackupLives(autoBackupState);
      if (storageTouched || pendingTouched) {
        await chrome.storage.local.set({
          [key]: next,
          [KEY_AUTO_BACKUP_STATE]: autoBackupState,
          ...ingestLogPayload ? { [KEY_COMMENT_INGEST_LOG]: ingestLogPayload } : {},
          ...pendingTouched ? { [KEY_SELF_POSTED_RECENTS]: { items: consumed.remainingItems } } : {},
          ...cacheTouched ? { [KEY_USER_COMMENT_PROFILE_CACHE]: profileMap } : {}
        });
      } else if (cacheTouched) {
        await chrome.storage.local.set({
          [KEY_USER_COMMENT_PROFILE_CACHE]: profileMap
        });
      }
      await chrome.storage.local.remove(KEY_STORAGE_WRITE_ERROR);
      const keysWritten = (storageTouched || pendingTouched ? 2 : 0) + (cacheTouched ? 1 : 0) + (ingestLogPayload ? 1 : 0);
      console.debug(formatPipelinePhase("commit", { keysWritten }));
      console.debug(formatPipelinePhase("done", {
        totalCount: next.length,
        elapsedMs: Date.now() - pipelineT0
      }));
    } catch (err) {
      if (isContextInvalidatedError2(err) || !hasExtensionContext()) return;
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
    if (isNicoLiveWatchUrl(href)) {
      rememberWatchPageUrl();
      const ctx = resolveWatchPageContext(href, liveId);
      if (ctx.liveIdChanged) {
        void clearCommentHarvestPanelDiagnostic();
        pendingRoots.clear();
        clearNdgrChatRowsPending();
        clearInterceptReconcilePending();
        endedBulkHarvestTriggeredLiveId = "";
        endedBulkHarvestLastCheckedAt = 0;
        resetDeepHarvestStabilityFollowUp();
        interceptedUsers.clear();
        interceptedNicknames.clear();
        interceptedAvatars.clear();
        activeUserTimestamps.clear();
        broadcasterUidCache = "";
        broadcasterUidCacheAt = 0;
        wsViewerCount = null;
        wsCommentCount = null;
        wsViewerCountUpdatedAt = 0;
        resetOfficialStatsState();
        programBeginAtMs = null;
        ndgrLastReceivedAt = 0;
        liveId = ctx.liveId;
        reconnectMutationObserver();
        pendingRoots.add(document.body);
        scheduleFlush();
        scheduleDeepHarvest(DEEP_HARVEST_REASONS.liveIdChange);
        applyThumbSchedule();
      } else {
        liveId = ctx.liveId;
        reconnectMutationObserver();
        if (ndgrChatRowsPending.length) {
          const slice = ndgrChatRowsPending;
          ndgrChatRowsPending = [];
          void flushNdgrChatRowsBatch(slice);
        }
      }
      renderPageFrameOverlay();
      return;
    }
    let isTop = true;
    try {
      isTop = window.self === window.top;
    } catch {
      isTop = true;
    }
    if (hasWatchCommentPanel() && (!isTop || isNicoVideoJpHost(href))) {
      const fromUrl = extractLiveIdFromUrl(href);
      const fromDom = extractLiveIdFromDom(document);
      const next = fromUrl || fromDom || liveId;
      if (next !== liveId) {
        void clearCommentHarvestPanelDiagnostic();
        pendingRoots.clear();
        clearNdgrChatRowsPending();
        clearInterceptReconcilePending();
        endedBulkHarvestTriggeredLiveId = "";
        endedBulkHarvestLastCheckedAt = 0;
        resetDeepHarvestStabilityFollowUp();
        interceptedUsers.clear();
        interceptedNicknames.clear();
        interceptedAvatars.clear();
        activeUserTimestamps.clear();
        broadcasterUidCache = "";
        broadcasterUidCacheAt = 0;
        wsViewerCount = null;
        wsCommentCount = null;
        wsViewerCountUpdatedAt = 0;
        resetOfficialStatsState();
        programBeginAtMs = null;
        ndgrLastReceivedAt = 0;
        liveId = next;
        reconnectMutationObserver();
        pendingRoots.add(document.body);
        scheduleFlush();
        scheduleDeepHarvest(DEEP_HARVEST_REASONS.liveIdChange);
        applyThumbSchedule();
      } else {
        liveId = next;
        reconnectMutationObserver();
        if (ndgrChatRowsPending.length) {
          const slice = ndgrChatRowsPending;
          ndgrChatRowsPending = [];
          void flushNdgrChatRowsBatch(slice);
        }
      }
      renderPageFrameOverlay();
      return;
    }
    liveId = null;
    ndgrLastReceivedAt = 0;
    cancelPendingDeepHarvest();
    void clearCommentHarvestPanelDiagnostic();
    clearNdgrChatRowsPending();
    clearInterceptReconcilePending();
    endedBulkHarvestTriggeredLiveId = "";
    endedBulkHarvestLastCheckedAt = 0;
    clearThumbTimer();
    reconnectMutationObserver();
    hidePageFrameOverlay();
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
    if (!pendingRoots.size) return;
    if (!hasExtensionContext()) {
      pendingRoots.clear();
      return;
    }
    if (!recording) {
      pendingRoots.clear();
      return;
    }
    if (!liveId || !locationAllowsCommentRecording()) {
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
    await persistCommentRows(rows, { source: COMMENT_INGEST_SOURCE.MUTATION });
  }
  function scheduleFlush() {
    if (!recording || !liveId) return;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushToStorage().catch((err) => reportSilentErrorToStorage("flush", err));
    }, DEBOUNCE_MS);
  }
  var deepHarvestTimer = null;
  var deepHarvestStabilityFollowUpTimer = null;
  var deepHarvestStabilityFollowUpScheduled = false;
  function resetDeepHarvestStabilityFollowUp() {
    if (deepHarvestStabilityFollowUpTimer != null) {
      clearTimeout(deepHarvestStabilityFollowUpTimer);
      deepHarvestStabilityFollowUpTimer = null;
    }
    deepHarvestStabilityFollowUpScheduled = false;
  }
  function removeDeepHarvestLoadingUi() {
    try {
      document.getElementById(DEEP_HARVEST_LOADING_HOST_ID)?.remove();
    } catch {
    }
  }
  function ensureDeepHarvestLoadingUi() {
    if (!hasExtensionContext()) return;
    if (document.getElementById(DEEP_HARVEST_LOADING_HOST_ID)) return;
    let imgUrl = "";
    try {
      imgUrl = chrome.runtime.getURL(DEEP_HARVEST_LOADING_IMG_PATH);
    } catch {
      imgUrl = "";
    }
    const host = document.createElement("div");
    host.id = DEEP_HARVEST_LOADING_HOST_ID;
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    host.setAttribute(
      "aria-label",
      "\u30B3\u30E1\u30F3\u30C8\u4E00\u89A7\u306E\u8AAD\u307F\u8FBC\u307F\u6E96\u5099\u4E2D\u3002\u3057\u3070\u3089\u304F\u304A\u5F85\u3061\u304F\u3060\u3055\u3044\u3002"
    );
    host.style.cssText = [
      "position:fixed",
      /* ドック（画面下全幅）と重ならないよう左上付近。旧: 右下でドックと干渉し「消えたあとなにも」と誤認されやすい */
      "z-index:2147483647",
      "left:max(14px,env(safe-area-inset-left))",
      "top:max(72px,calc(env(safe-area-inset-top) + 56px))",
      "right:auto",
      "bottom:auto",
      "max-width:min(320px,calc(100vw - 32px))",
      "box-sizing:border-box",
      "padding:12px 14px",
      "border-radius:12px",
      "background:rgba(255,255,255,0.96)",
      "color:#1a1a1a",
      "font:14px/1.45 system-ui,-apple-system,sans-serif",
      "box-shadow:0 4px 24px rgba(0,0,0,0.12)",
      "display:flex",
      "align-items:center",
      "gap:12px",
      "pointer-events:none"
    ].join(";");
    const img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.width = 48;
    img.height = 48;
    img.style.cssText = "width:48px;height:48px;object-fit:contain;flex-shrink:0;border-radius:8px";
    if (imgUrl) img.src = imgUrl;
    const text = document.createElement("div");
    text.style.cssText = "min-width:0";
    text.innerHTML = '<div style="font-weight:600;margin:0 0 2px">\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026</div><div style="font-size:12px;opacity:0.78;margin:0;line-height:1.35">\u30B3\u30E1\u30F3\u30C8\u8A18\u9332\u306E\u6E96\u5099\u3092\u3057\u3066\u3044\u307E\u3059\u3002\u3086\u3063\u304F\u308A\u3057\u3066\u3044\u3063\u3066\u306D\uFF01</div>';
    host.appendChild(img);
    host.appendChild(text);
    try {
      document.documentElement.appendChild(host);
    } catch {
    }
  }
  function cancelPendingDeepHarvest() {
    if (deepHarvestTimer) {
      clearTimeout(deepHarvestTimer);
      deepHarvestTimer = null;
    }
    resetDeepHarvestStabilityFollowUp();
    removeDeepHarvestLoadingUi();
  }
  function scheduleDeepHarvest(reason) {
    if (!recording || !liveId || !locationAllowsCommentRecording()) {
      cancelPendingDeepHarvest();
      return;
    }
    if (deepHarvestTimer) clearTimeout(deepHarvestTimer);
    const wantQuietSchedule = deepHarvestQuietUi && (reason === "startup" || reason === "recording-on");
    const delayMs = wantQuietSchedule ? Math.max(DEEP_HARVEST_DELAY_MS, DEEP_HARVEST_QUIET_UI_MS) : DEEP_HARVEST_DELAY_MS;
    if (!wantQuietSchedule) {
      removeDeepHarvestLoadingUi();
    } else {
      ensureDeepHarvestLoadingUi();
    }
    deepHarvestTimer = setTimeout(() => {
      deepHarvestTimer = null;
      removeDeepHarvestLoadingUi();
      if (isWatchInlinePanelTopFrame() && isNicoLiveWatchUrl(window.location.href)) {
        renderPageFrameOverlay();
      }
      resetDeepHarvestStabilityFollowUp();
      runDeepHarvest({
        armStabilityFollowUp: true,
        force: shouldForceDeepHarvestForReason(reason)
      }).catch((err) => reportSilentErrorToStorage("deepHarvest", err));
    }, delayMs);
  }
  function tryPeriodicQuietDeepHarvest() {
    if (!hasExtensionContext()) return;
    if (!recording || !liveId || !locationAllowsCommentRecording()) return;
    if (document.hidden) return;
    if (harvestRunning) return;
    resetDeepHarvestStabilityFollowUp();
    const needsRecovery = shouldForceDeepHarvestRecovery({
      lastCompletedAt: deepHarvestPipelineStats.lastCompletedAt,
      now: Date.now(),
      recoveryMs: DEEP_HARVEST_RECOVERY_MS
    });
    void runDeepHarvest({
      stabilityFollowUp: !needsRecovery,
      force: needsRecovery
    });
  }
  function onTabVisibleForCommentHarvest() {
    if (document.visibilityState !== "visible") return;
    if (!recording || !liveId || !locationAllowsCommentRecording()) return;
    scanVisibleCommentsNow();
    const now = Date.now();
    const needsRecovery = shouldForceDeepHarvestRecovery({
      lastCompletedAt: deepHarvestPipelineStats.lastCompletedAt,
      now,
      recoveryMs: DEEP_HARVEST_RECOVERY_MS
    });
    if (!needsRecovery && now - lastTabVisibleHarvestAt < TAB_VISIBLE_HARVEST_MIN_MS) return;
    lastTabVisibleHarvestAt = now;
    if (tabVisibleHarvestDebounceTimer != null) {
      clearTimeout(tabVisibleHarvestDebounceTimer);
    }
    tabVisibleHarvestDebounceTimer = setTimeout(() => {
      tabVisibleHarvestDebounceTimer = null;
      if (recording && liveId && locationAllowsCommentRecording() && !document.hidden) {
        void runDeepHarvest({
          stabilityFollowUp: !needsRecovery,
          force: needsRecovery
        });
      }
    }, 850);
  }
  async function runDeepHarvest(opts = {}) {
    if (harvestRunning || !recording || !liveId || !locationAllowsCommentRecording()) {
      return;
    }
    if (!opts.force && shouldSkipDeepHarvest({
      ndgrLastReceivedAt,
      now: Date.now(),
      thresholdMs: HARVEST_TIMING.ndgrActiveThresholdMs
    })) {
      return;
    }
    harvestRunning = true;
    try {
      const rows = await harvestVirtualCommentList({
        document,
        extractCommentsFromNode,
        waitMs: DEEP_HARVEST_SCROLL_WAIT_MS,
        twoPass: !opts.stabilityFollowUp,
        twoPassGapMs: DEEP_HARVEST_SECOND_PASS_GAP_MS,
        scrollStepClientHeightRatio: DEEP_HARVEST_SCROLL_STEP_RATIO,
        quietScroll: true,
        respectTyping: false
      });
      await persistCommentRows(rows, { source: COMMENT_INGEST_SOURCE.DEEP });
      deepHarvestPipelineStats.lastCompletedAt = Date.now();
      deepHarvestPipelineStats.lastRowCount = rows.length;
      deepHarvestPipelineStats.runCount += 1;
      deepHarvestPipelineStats.lastError = false;
    } catch {
      deepHarvestPipelineStats.lastError = true;
    } finally {
      harvestRunning = false;
      if (opts.armStabilityFollowUp === true && !opts.stabilityFollowUp && !deepHarvestPipelineStats.lastError && recording && liveId && locationAllowsCommentRecording() && !deepHarvestStabilityFollowUpScheduled) {
        deepHarvestStabilityFollowUpScheduled = true;
        deepHarvestStabilityFollowUpTimer = setTimeout(() => {
          deepHarvestStabilityFollowUpTimer = null;
          if (recording && liveId && locationAllowsCommentRecording()) {
            void runDeepHarvest({ stabilityFollowUp: true });
          }
        }, DEEP_HARVEST_STABILITY_FOLLOWUP_MS);
      }
    }
  }
  var COMMENT_PANEL_MISS_THRESHOLD = 5;
  var commentPanelMissStreak = 0;
  var lastPublishedHarvestPanelState = null;
  async function clearCommentHarvestPanelDiagnostic() {
    commentPanelMissStreak = 0;
    lastPublishedHarvestPanelState = null;
    if (!hasExtensionContext()) return;
    try {
      await chrome.storage.local.remove(KEY_COMMENT_PANEL_STATUS);
    } catch (err) {
      if (!isContextInvalidatedError2(err)) {
      }
    }
  }
  async function syncCommentHarvestPanelStatus() {
    if (!hasExtensionContext()) return;
    if (!recording || !liveId || !locationAllowsCommentRecording()) {
      await clearCommentHarvestPanelDiagnostic();
      return;
    }
    const panel = findNicoCommentPanel(document);
    if (panel) {
      commentPanelMissStreak = 0;
      if (lastPublishedHarvestPanelState === "warn") {
        lastPublishedHarvestPanelState = null;
        try {
          await chrome.storage.local.remove(KEY_COMMENT_PANEL_STATUS);
        } catch (err) {
          if (!isContextInvalidatedError2(err)) {
          }
        }
      }
      return;
    }
    commentPanelMissStreak += 1;
    if (commentPanelMissStreak < COMMENT_PANEL_MISS_THRESHOLD) return;
    if (lastPublishedHarvestPanelState === "warn") return;
    lastPublishedHarvestPanelState = "warn";
    try {
      await chrome.storage.local.set({
        [KEY_COMMENT_PANEL_STATUS]: {
          ok: false,
          code: "no_comment_panel",
          updatedAt: Date.now(),
          liveId: String(liveId).trim().toLowerCase()
        }
      });
    } catch (err) {
      if (!isContextInvalidatedError2(err)) {
      }
    }
  }
  function scanVisibleCommentsNow() {
    if (!recording || !liveId || !locationAllowsCommentRecording()) return;
    const panel = findNicoCommentPanel(document);
    const root = panel || document.body;
    const rows = extractCommentsFromNode(root);
    void persistCommentRows(rows, { source: COMMENT_INGEST_SOURCE.VISIBLE });
    void syncCommentHarvestPanelStatus();
  }
  var commentPanelAutoRestoreEnabled = true;
  var lastCommentPanelRestoreActionAt = 0;
  var lastUserInitiatedScrollAt = 0;
  var ownScrollSuppressionUntil = 0;
  function suppressOwnScrollCountingFor(ms) {
    const dur = Number.isFinite(ms) ? (
      /** @type {number} */
      ms
    ) : 800;
    ownScrollSuppressionUntil = Date.now() + dur;
  }
  function noteUserInitiatedScroll() {
    lastUserInitiatedScrollAt = Date.now();
  }
  function noteScrollEventMaybeFromUser() {
    if (Date.now() < ownScrollSuppressionUntil) return;
    lastUserInitiatedScrollAt = Date.now();
  }
  var userScrollListenersAttached = false;
  function attachUserScrollListeners() {
    if (userScrollListenersAttached) return;
    if (typeof window === "undefined" || !window.addEventListener) return;
    userScrollListenersAttached = true;
    const opts = { passive: true, capture: true };
    window.addEventListener("wheel", noteUserInitiatedScroll, opts);
    window.addEventListener("touchmove", noteUserInitiatedScroll, opts);
    window.addEventListener("scroll", noteScrollEventMaybeFromUser, opts);
    if (typeof document !== "undefined" && document && document.addEventListener) {
      document.addEventListener("scroll", noteScrollEventMaybeFromUser, opts);
    }
    window.addEventListener(
      "keydown",
      (ev) => {
        const k = ev && ev.key;
        if (k === "PageUp" || k === "PageDown" || k === "Home" || k === "End" || k === "ArrowUp" || k === "ArrowDown" || k === " " || k === "Spacebar") {
          noteUserInitiatedScroll();
        }
      },
      opts
    );
  }
  async function readCommentPanelAutoRestoreFromStorage() {
    if (!hasExtensionContext()) return;
    try {
      const bag = await chrome.storage.local.get(KEY_COMMENT_PANEL_AUTO_RESTORE);
      commentPanelAutoRestoreEnabled = normalizeCommentPanelAutoRestoreEnabled(
        bag[KEY_COMMENT_PANEL_AUTO_RESTORE]
      );
    } catch (err) {
      if (!isContextInvalidatedError2(err)) {
      }
    }
  }
  async function probeAndRestoreCommentPanelHealth() {
    if (!commentPanelAutoRestoreEnabled) return;
    if (!hasExtensionContext()) return;
    if (!recording || !liveId || !locationAllowsCommentRecording()) return;
    const panel = findNicoCommentPanel(document);
    let panelRect = null;
    if (panel && typeof panel.getBoundingClientRect === "function") {
      try {
        const r = panel.getBoundingClientRect();
        panelRect = { top: r.top, height: r.height };
      } catch {
        panelRect = null;
      }
    }
    const host = findCommentListScrollHost(document);
    let scrollHost = null;
    if (host) {
      scrollHost = {
        scrollTop: Number(host.scrollTop) || 0,
        scrollHeight: Number(host.scrollHeight) || 0,
        clientHeight: Number(host.clientHeight) || 0
      };
    }
    let latestButton = null;
    try {
      latestButton = /** @type {HTMLButtonElement | null} */
      document.querySelector(LATEST_COMMENT_BUTTON_SELECTOR);
    } catch {
      latestButton = null;
    }
    const decision = decideCommentPanelRestoreAction({
      enabled: true,
      now: Date.now(),
      lastActionAt: lastCommentPanelRestoreActionAt,
      lastUserScrollAt: lastUserInitiatedScrollAt,
      panelPresent: !!panel,
      panelRect,
      viewportHeight: Number(window.innerHeight) || 0,
      scrollHost,
      hasLatestButton: !!latestButton
    });
    if (decision.action === "click_latest_button") {
      if (!latestButton) return;
      try {
        latestButton.click();
        lastCommentPanelRestoreActionAt = Date.now();
      } catch {
      }
      return;
    }
    if (decision.action === "scroll_panel_into_view") {
      if (!panel || typeof panel.scrollIntoView !== "function") return;
      try {
        suppressOwnScrollCountingFor(800);
        panel.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
        lastCommentPanelRestoreActionAt = Date.now();
      } catch {
      }
    }
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
        t = setTimeout(() => scanVisibleCommentsNow(), INGEST_TIMING.visibleScanDelayMs);
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
  function hasWatchCommentPanel() {
    return !!(document.querySelector(".ga-ns-comment-panel") || document.querySelector(".comment-panel"));
  }
  function shouldRunWatchContentInThisFrame() {
    const href = String(window.location.href || "");
    let isTop = true;
    try {
      isTop = window.self === window.top;
    } catch {
      isTop = true;
    }
    if (isTop) {
      if (isNicoLiveWatchUrl(href)) return true;
      if (hasWatchCommentPanel() && isNicoVideoJpHost(href)) return true;
      return false;
    }
    return hasWatchCommentPanel();
  }
  function locationAllowsCommentRecording() {
    return shouldRunWatchContentInThisFrame();
  }
  function canExportWatchSnapshotFromThisFrame() {
    const href = String(window.location.href || "");
    if (isNicoLiveWatchUrl(href)) return true;
    if (!hasWatchCommentPanel()) return false;
    try {
      if (window.self !== window.top) return true;
    } catch {
      return true;
    }
    return isNicoVideoJpHost(href);
  }
  var _pollDiag = { ran: 0, ok: 0, err: "", status: 0, htmlLen: 0, wcMatch: "", ccMatch: "" };
  var POLL_TIMEOUT_MS = 12e3;
  async function pollStatsFromPage() {
    _pollDiag.ran += 1;
    const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
    const tid = ac ? setTimeout(() => ac.abort(), POLL_TIMEOUT_MS) : null;
    try {
      const href = window.location.href;
      if (!href || !href.startsWith("http")) {
        _pollDiag.err = "bad-href";
        return;
      }
      const url = new URL(href);
      url.searchParams.delete("_nls_t");
      const resp = await fetch(url.href, {
        credentials: "same-origin",
        ...ac ? { signal: ac.signal } : {}
      });
      if (tid) clearTimeout(tid);
      _pollDiag.status = resp.status;
      if (!resp.ok) {
        _pollDiag.err = `http-${resp.status}`;
        return;
      }
      let html = await resp.text();
      _pollDiag.htmlLen = html.length;
      if (html.includes("&quot;")) html = html.replace(/&quot;/g, '"');
      if (html.includes("&amp;")) html = html.replace(/&amp;/g, "&");
      const wc = html.match(/"watchCount"\s*:\s*(\d+)/) || html.match(/"watching(?:Count)?"\s*:\s*(\d+)/i);
      _pollDiag.wcMatch = wc ? wc[0].substring(0, 40) : "";
      if (wc?.[1]) {
        const n = parseInt(wc[1], 10);
        if (Number.isFinite(n) && n >= 0) {
          wsViewerCount = n;
          wsViewerCountUpdatedAt = Date.now();
          _pollDiag.ok += 1;
        }
      }
      const cc = html.match(/"commentCount"\s*:\s*(\d+)/) || html.match(/"comments"\s*:\s*(\d+)/);
      _pollDiag.ccMatch = cc ? cc[0].substring(0, 40) : "";
      if (cc?.[1]) {
        const n = parseInt(cc[1], 10);
        if (Number.isFinite(n) && n >= 0) {
          wsCommentCount = n;
        }
      }
      if (!wc && !cc) {
        _pollDiag.err = "no-match";
      }
    } catch (e) {
      if (tid) clearTimeout(tid);
      _pollDiag.err = String(e?.message || e || "unknown").substring(0, 80);
    }
  }
  async function start() {
    if (!hasExtensionContext()) return;
    if (!shouldRunWatchContentInThisFrame()) return;
    recording = await readRecordingFlag();
    await readDeepHarvestQuietUiFromStorage();
    await readCommentPanelAutoRestoreFromStorage();
    attachUserScrollListeners();
    if (isWatchInlinePanelTopFrame()) {
      ensurePageFrameStyle();
      await migrateFloatingInlinePanelToDockOnce({
        get: (keys) => chrome.storage.local.get(keys),
        set: (obj) => chrome.storage.local.set(obj)
      }).catch(() => ({ changed: false }));
      await loadPageFrameSettings().catch(() => {
      });
      if (isNicoLiveWatchUrl(window.location.href)) {
        startPageFrameLoop();
      }
    }
    bindNativeSelfPostedRecorder();
    mutationObserver = new MutationObserver((records) => {
      if (!recording || !liveId || !locationAllowsCommentRecording()) {
        return;
      }
      for (const rec of records) {
        if (rec.type === "childList") {
          rec.addedNodes.forEach((n) => {
            enqueueNode(n);
            if (n.nodeType === Node.ELEMENT_NODE) {
              bindCommentPanelUserIconLoads(
                /** @type {Element} */
                n
              );
            }
          });
        } else if (rec.type === "characterData" && rec.target?.parentElement) {
          const row = closestHarvestableNicoCommentRow(rec.target.parentElement);
          if (row) pendingRoots.add(row);
          else pendingRoots.add(rec.target.parentElement);
        } else if (rec.type === "attributes" && rec.target?.nodeType === Node.ELEMENT_NODE) {
          const el = (
            /** @type {Element} */
            rec.target
          );
          if (el.tagName === "IMG") {
            const row = closestHarvestableNicoCommentRow(el);
            if (row) pendingRoots.add(row);
          }
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
        if (isWatchInlinePanelTopFrame()) {
          loadPageFrameSettings().catch(() => {
          });
        }
      }
      if (changes[KEY_INLINE_PANEL_WIDTH_MODE]) {
        if (isWatchInlinePanelTopFrame()) {
          inlinePanelWidthMode = normalizeInlinePanelWidthMode(
            changes[KEY_INLINE_PANEL_WIDTH_MODE].newValue
          );
          renderPageFrameOverlay();
        }
      }
      if (changes[KEY_INLINE_PANEL_PLACEMENT]) {
        if (isWatchInlinePanelTopFrame()) {
          inlinePanelPlacementMode = normalizeInlinePanelPlacement(
            changes[KEY_INLINE_PANEL_PLACEMENT].newValue
          );
          renderPageFrameOverlay();
        }
      }
      if (changes[KEY_INLINE_PANEL_AUTOSHOW_ENABLED]) {
        if (isWatchInlinePanelTopFrame()) {
          inlinePanelAutoshowEnabled = normalizeInlinePanelAutoshowEnabled(
            changes[KEY_INLINE_PANEL_AUTOSHOW_ENABLED].newValue
          );
          if (!inlinePanelAutoshowEnabled) {
            toolbarInitiatedShowThisSession = false;
          }
          renderPageFrameOverlay();
        }
      }
      if (changes[KEY_INLINE_FLOATING_ANCHOR]) {
        if (isWatchInlinePanelTopFrame()) {
          inlineFloatingAnchor = normalizeInlineFloatingAnchor(
            changes[KEY_INLINE_FLOATING_ANCHOR].newValue
          );
          renderPageFrameOverlay();
        }
      }
      if (changes[KEY_THUMB_AUTO] || changes[KEY_THUMB_INTERVAL_MS]) {
        readThumbSettings().then(() => applyThumbSchedule()).catch(() => {
        });
      }
      if (changes[KEY_COMMENT_PANEL_AUTO_RESTORE]) {
        commentPanelAutoRestoreEnabled = normalizeCommentPanelAutoRestoreEnabled(
          changes[KEY_COMMENT_PANEL_AUTO_RESTORE].newValue
        );
      }
      if (changes[KEY_DEEP_HARVEST_QUIET_UI]) {
        deepHarvestQuietUi = isDeepHarvestQuietUiEnabled(
          changes[KEY_DEEP_HARVEST_QUIET_UI].newValue
        );
        if (!deepHarvestQuietUi && recording && liveId && locationAllowsCommentRecording() && deepHarvestTimer) {
          cancelPendingDeepHarvest();
          scheduleDeepHarvest(DEEP_HARVEST_REASONS.liveIdChange);
        } else if (!deepHarvestQuietUi) {
          removeDeepHarvestLoadingUi();
        }
      }
      if (changes[KEY_RECORDING]) {
        recording = isRecordingEnabled(changes[KEY_RECORDING].newValue);
        if (recording) {
          pendingRoots.add(document.body);
          reconnectMutationObserver();
          scheduleFlush();
          scheduleDeepHarvest(DEEP_HARVEST_REASONS.recordingOn);
          tryAttachScrollHookSoon();
        } else {
          ndgrLastReceivedAt = 0;
          cancelPendingDeepHarvest();
          resetOfficialCommentSamplingState();
          void clearCommentHarvestPanelDiagnostic();
        }
      }
    });
    if (recording && liveId) {
      pendingRoots.add(document.body);
      scheduleFlush();
      scheduleDeepHarvest(DEEP_HARVEST_REASONS.startup);
      tryAttachScrollHookSoon();
      for (const ms of BOOTSTRAP_DELAYS_MS) {
        setTimeout(() => {
          if (recording && liveId && locationAllowsCommentRecording()) {
            maybeFillProgramBeginFromEmbeddedData();
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
      if (!recording || !liveId || !locationAllowsCommentRecording()) {
        return;
      }
      scanVisibleCommentsNow();
      void probeAndRestoreCommentPanelHealth();
    }, LIVE_PANEL_SCAN_MS);
    setInterval(() => {
      tryPeriodicQuietDeepHarvest();
    }, DEEP_HARVEST_PERIODIC_MS);
    document.addEventListener("visibilitychange", onTabVisibleForCommentHarvest);
    pollStatsFromPage();
    setInterval(() => {
      if (!hasExtensionContext()) return;
      pollStatsFromPage();
    }, STATS_POLL_MS);
  }
  var __nlsBootGlobal = typeof globalThis !== "undefined" ? globalThis : window;
  if (!__nlsBootGlobal.__NLS_CONTENT_ENTRY_STARTED__) {
    __nlsBootGlobal.__NLS_CONTENT_ENTRY_STARTED__ = true;
    try {
      document.documentElement.setAttribute("data-nls-active", "1");
    } catch {
    }
    start().catch((err) => reportSilentErrorToStorage("start", err));
  }
})();
