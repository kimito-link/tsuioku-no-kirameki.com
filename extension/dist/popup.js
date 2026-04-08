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
  function watchPageUrlsMatchForSnapshot(a, b) {
    const la = extractLiveIdFromUrl(a);
    const lb = extractLiveIdFromUrl(b);
    if (la && lb) return la === lb;
    try {
      const ua = new URL(String(a || ""));
      const ub = new URL(String(b || ""));
      if (ua.origin !== ub.origin) return false;
      const pa = ua.pathname.replace(/\/$/, "");
      const pb = ub.pathname.replace(/\/$/, "");
      return pa === pb;
    } catch {
      return String(a || "").trim() === String(b || "").trim();
    }
  }

  // src/lib/popupWatchUrlResolve.js
  function resolveWatchUrlFromTabAndStash(tab, lastWatchUrlRaw) {
    const tabUrl = tab?.url || "";
    if (isNicoLiveWatchUrl(tabUrl)) {
      return { url: tabUrl, fromActiveTab: true };
    }
    if (typeof lastWatchUrlRaw === "string" && isNicoLiveWatchUrl(lastWatchUrlRaw)) {
      return { url: lastWatchUrlRaw, fromActiveTab: false };
    }
    return { url: "", fromActiveTab: true };
  }

  // src/lib/nicoAnonymousDisplay.js
  function isNiconicoAnonymousUserId(userId) {
    const s = String(userId ?? "").trim();
    if (!s.startsWith("a:")) return false;
    const rest = s.slice(2).trim();
    return rest.length >= 2;
  }
  function anonymousNicknameFallback(userId, nickname) {
    const nick = String(nickname ?? "").trim();
    if (nick) return nick;
    return isNiconicoAnonymousUserId(userId) ? "\u533F\u540D" : "";
  }
  function compactNicoLaneUserId(userId) {
    const s = String(userId ?? "").trim();
    if (!s) return "";
    if (/^\d{5,14}$/.test(s)) {
      return s.length <= 18 ? s : `${s.slice(0, 8)}\u2026${s.slice(-6)}`;
    }
    if (/^a:/i.test(s)) {
      const rest = s.slice(2).trim();
      const head = rest.slice(0, 4);
      if (rest.length <= 5) return `a:${rest}`;
      return `a:${head}\u2026`;
    }
    if (s.length <= 12) return s;
    return `${s.slice(0, 5)}\u2026${s.slice(-3)}`;
  }

  // src/lib/storageKeys.js
  var KEY_RECORDING = "nls_recording_enabled";
  var KEY_DEEP_HARVEST_QUIET_UI = "nls_deep_harvest_quiet_ui";
  var KEY_LAST_WATCH_URL = "nls_last_watch_url";
  var KEY_STORAGE_WRITE_ERROR = "nls_storage_write_error";
  var KEY_COMMENT_PANEL_STATUS = "nls_comment_panel_status";
  var KEY_COMMENT_INGEST_LOG = "nls_comment_ingest_log_v1";
  var KEY_POPUP_FRAME = "nls_popup_frame";
  var KEY_POPUP_FRAME_CUSTOM = "nls_popup_frame_custom";
  var KEY_THUMB_AUTO = "nls_thumb_auto_enabled";
  var KEY_THUMB_INTERVAL_MS = "nls_thumb_interval_ms";
  var KEY_VOICE_AUTOSEND = "nls_voice_autosend";
  var KEY_COMMENT_ENTER_SEND = "nls_comment_enter_send";
  var KEY_STORY_GROWTH_COLLAPSED = "nls_story_growth_collapsed";
  var KEY_SUPPORT_VISUAL_EXPANDED = "nls_support_visual_expanded";
  var KEY_USAGE_TERMS_ACK = "nls_usage_terms_ack_v1";
  var KEY_VOICE_INPUT_DEVICE = "nls_voice_input_device";
  var KEY_SELF_POSTED_RECENTS = "nls_self_posted_recents";
  var KEY_USER_COMMENT_PROFILE_CACHE = "nls_user_comment_profile_v1";
  var EXTENSION_SOFT_CACHE_STORAGE_KEYS = Object.freeze([
    KEY_USER_COMMENT_PROFILE_CACHE
  ]);
  var KEY_INLINE_PANEL_WIDTH_MODE = "nls_inline_panel_width_mode";
  var KEY_INLINE_PANEL_PLACEMENT = "nls_inline_panel_placement";
  var INLINE_PANEL_PLACEMENT_BELOW = "below";
  var INLINE_PANEL_PLACEMENT_BESIDE = "beside";
  var INLINE_PANEL_PLACEMENT_FLOATING = "floating";
  var KEY_CALM_PANEL_MOTION = "nls_calm_panel_motion";
  function normalizeCalmPanelMotion(raw, opts = {}) {
    if (raw === true) return true;
    if (raw === false) return false;
    return opts.inlineDefault === true;
  }
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
    return INLINE_PANEL_PLACEMENT_BELOW;
  }
  function isRecordingEnabled(raw) {
    return raw !== false;
  }
  function isDeepHarvestQuietUiEnabled(raw) {
    return raw !== false;
  }
  function isCommentEnterSendEnabled(raw) {
    return raw !== false;
  }
  var KEY_DEV_MONITOR_TREND_PREFIX = "nls_dm_tr:";
  function devMonitorTrendStorageKey(liveId) {
    return `${KEY_DEV_MONITOR_TREND_PREFIX}${String(liveId || "").trim() || "_"}`;
  }
  function commentsStorageKey(liveId) {
    const id = String(liveId || "").trim().toLowerCase();
    return `nls_comments_${id}`;
  }
  function giftUsersStorageKey(liveId) {
    const id = String(liveId || "").trim().toLowerCase();
    return `nls_gift_users_${id}`;
  }

  // src/lib/supportVisualExpanded.js
  function normalizeSupportVisualExpanded(raw, opts = {}) {
    const inlineMode = opts.inlineMode === true;
    if (raw === true) return true;
    if (raw === false) return false;
    return inlineMode;
  }

  // src/lib/nlMainScrollReveal.js
  function computeScrollDeltaToRevealInParent(parentRect, elRect, pad = 12) {
    const deltaTop = elRect.top - parentRect.top;
    const deltaBottom = elRect.bottom - parentRect.bottom;
    if (deltaTop < pad) {
      return deltaTop - pad;
    }
    if (deltaBottom > -pad) {
      return deltaBottom + pad;
    }
    return 0;
  }

  // src/lib/commentComposeShortcuts.js
  function commentComposeKeyAction(p) {
    if (p.key !== "Enter") return "default";
    if (p.isComposing) return "default";
    const mod = Boolean(p.ctrlKey || p.metaKey);
    if (mod) return "submit";
    if (p.enterSendsComment) {
      if (p.shiftKey) return "default";
      return "submit";
    }
    return "default";
  }

  // src/lib/voiceInputDevices.js
  var VOICE_MIC_PROBE_MS = 1e3;
  var VOICE_MIC_LEVEL_THRESHOLD = 6;
  function audioConstraintsForDevice(deviceId) {
    const id = String(deviceId || "").trim();
    if (!id) {
      return { audio: true };
    }
    return { audio: { deviceId: { ideal: id } } };
  }
  async function probeMicrophoneLevel(constraints, sampleMs = VOICE_MIC_PROBE_MS) {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch {
      return {
        ok: false,
        peak: 0,
        error: "\u30DE\u30A4\u30AF\u306B\u63A5\u7D9A\u3067\u304D\u307E\u305B\u3093\u3002\u8A31\u53EF\u30FB\u30C7\u30D0\u30A4\u30B9\u9078\u629E\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
      };
    }
    let ctx = null;
    try {
      const AC = window.AudioContext || /** @type {typeof window & { webkitAudioContext?: typeof AudioContext }} */
      window.webkitAudioContext;
      if (typeof AC !== "function") {
        return { ok: true, peak: 255, error: void 0 };
      }
      ctx = new AC();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      let peak = 0;
      const end = Date.now() + sampleMs;
      while (Date.now() < end) {
        analyser.getByteFrequencyData(buf);
        for (let i = 0; i < buf.length; i++) {
          if (buf[i] > peak) peak = buf[i];
        }
        await new Promise((r) => {
          requestAnimationFrame(r);
        });
      }
      const ok = peak >= VOICE_MIC_LEVEL_THRESHOLD;
      return {
        ok,
        peak,
        error: ok ? void 0 : "\u97F3\u304C\u691C\u51FA\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u30DE\u30A4\u30AF\u97F3\u91CF\u3092\u4E0A\u3052\u308B\u304B\u3001\u5225\u306E\u7AEF\u672B\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044\u3002"
      };
    } finally {
      stream.getTracks().forEach((t) => t.stop());
      if (ctx) {
        await ctx.close().catch(() => {
        });
      }
    }
  }

  // src/lib/videoCapture.js
  function buildScreenshotFilename(liveId, ext, nowMs) {
    const safeLv = String(liveId || "unknown").replace(/[/\\:*?"<>|]/g, "").replace(/\.\./g, "").slice(0, 32) || "unknown";
    const e = String(ext || "png").replace(/^\./, "").toLowerCase() || "png";
    const ts = Math.floor(Number(nowMs) || Date.now());
    return `nicolivelog-${safeLv}-${ts}.${e}`;
  }

  // src/lib/thumbSettings.js
  var THUMB_INTERVAL_PRESET_MS = Object.freeze([
    0,
    3e4,
    6e4,
    3e5
  ]);
  var ALLOWED = new Set(THUMB_INTERVAL_PRESET_MS);
  function normalizeThumbIntervalMs(raw) {
    const n = typeof raw === "string" ? Number(raw) : Number(raw);
    if (!Number.isFinite(n) || n < 0) return 0;
    if (ALLOWED.has(n)) return n;
    return 0;
  }
  function isThumbAutoEnabled(v) {
    return v === true;
  }

  // src/lib/supportGrowthTileSrc.js
  function isHttpOrHttpsUrl(url) {
    const s = String(url || "").trim();
    return /^https?:\/\//i.test(s);
  }
  var NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS = "https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg";
  function niconicoDefaultUserIconUrl(userId) {
    const s = String(userId || "").trim();
    if (!/^\d{5,14}$/.test(s)) return "";
    const n = Number(s);
    if (!Number.isFinite(n) || n < 1) return "";
    const bucket = Math.max(1, Math.floor(n / 1e4));
    return `https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/${bucket}/${s}.jpg`;
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
  function isAnonymousStyleNicoUserId(userId) {
    const s = String(userId || "").trim();
    if (!s) return true;
    if (/^\d{5,14}$/.test(s)) return false;
    if (/^a:/i.test(s)) return true;
    if (/^[a-zA-Z0-9_-]{10,26}$/.test(s)) return true;
    return true;
  }
  function pickSupportGrowthFallbackTileSrc(userId, httpCandidate, yukkuriSrc, tvSrc) {
    if (isHttpOrHttpsUrl(httpCandidate)) {
      return String(httpCandidate).trim();
    }
    const y = String(yukkuriSrc || "").trim();
    const t = String(tvSrc || "").trim();
    return isAnonymousStyleNicoUserId(userId) ? t || y : y || t;
  }
  function resolveSupportGrowthTileSrc(p) {
    const def = String(p.defaultSrc || "");
    if (isHttpOrHttpsUrl(p.entryAvatarUrl)) {
      return String(p.entryAvatarUrl).trim();
    }
    const derived = niconicoDefaultUserIconUrl(p.userId);
    if (isHttpOrHttpsUrl(derived)) {
      return derived;
    }
    if (p.isOwnPosted && isHttpOrHttpsUrl(p.viewerAvatarUrl)) {
      return String(p.viewerAvatarUrl).trim();
    }
    return def;
  }
  function userLaneDedupeKey(p) {
    const u = String(p?.userId || "").trim();
    if (u) return `u:${u}`;
    if (isHttpOrHttpsUrl(p?.avatarHttpCandidate)) {
      return `t:${String(p.avatarHttpCandidate).trim()}`;
    }
    const s = String(p?.stableId || "").trim();
    if (s) return `s:${s}`;
    return "";
  }
  function userLaneResolvedThumbScore(userId, httpCandidate) {
    const c = String(httpCandidate || "").trim();
    if (!isHttpOrHttpsUrl(c)) return 0;
    if (isWeakNiconicoUserIconHttpUrl(c)) return 0;
    const u = String(userId || "").trim();
    if (/^\d{5,14}$/.test(u) && isNiconicoSyntheticDefaultUserIconUrl(c, u)) return 1;
    return 2;
  }
  function commentEnrichmentAvatarScore(userId, url) {
    const c = String(url || "").trim();
    if (!isHttpOrHttpsUrl(c)) return 0;
    if (isWeakNiconicoUserIconHttpUrl(c)) return 1;
    const u = String(userId || "").trim();
    if (/^\d{5,14}$/.test(u) && isNiconicoSyntheticDefaultUserIconUrl(c, u)) return 1;
    return 2;
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

  // src/lib/commentRecord.js
  function normalizeCommentText(value) {
    return String(value || "").replace(/\r\n/g, "\n").split("\n").map((l) => l.trim()).join("\n").trim();
  }
  function buildDedupeKey(liveId, rec) {
    const text = normalizeCommentText(rec.text);
    const no = String(rec.commentNo ?? "").trim();
    if (no) {
      return `${liveId}|${no}|${text}`;
    }
    const sec = Math.floor(Number(rec.capturedAt || 0) / 1e3);
    return `${liveId}||${text}|${sec}`;
  }

  // src/lib/liveCommenterStats.js
  function normalizedUserIdFromRow(row) {
    if (row == null || typeof row !== "object") return "";
    const raw = row.userId;
    if (raw == null) return "";
    const s = String(raw).trim();
    return s;
  }
  function summarizeRecordedCommenters(rows) {
    const list = Array.isArray(rows) ? rows : [];
    let commentsWithoutUserId = 0;
    const set = /* @__PURE__ */ new Set();
    const avatars = /* @__PURE__ */ new Set();
    for (const row of list) {
      const uid = normalizedUserIdFromRow(row);
      if (!uid) commentsWithoutUserId += 1;
      else set.add(uid);
      const av = row && typeof row === "object" ? String(row.avatarUrl || "").trim() : "";
      if (isHttpOrHttpsUrl(av)) avatars.add(av);
    }
    return {
      totalComments: list.length,
      uniqueKnownUserIds: set.size,
      commentsWithoutUserId,
      distinctAvatarUrls: avatars.size
    };
  }

  // src/lib/concurrentEstimate.js
  var DEFAULT_WINDOW_MS = 5 * 60 * 1e3;
  var DIRECT_VIEWERS_FRESH_MS = 90 * 1e3;
  var DIRECT_VIEWERS_NOWCAST_MAX_MS = 210 * 1e3;
  var MULTIPLIER_TABLE = (
    /** @type {const} */
    [
      [50, 4],
      [200, 5],
      [500, 6],
      [1e3, 7],
      [3e3, 10],
      [8e3, 15],
      [2e4, 20],
      [5e4, 25]
    ]
  );
  var VISITOR_SOFT_CAP_RATIO = 0.35;
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function resolveDirectViewersThresholds(officialViewerIntervalMs) {
    const hinted = typeof officialViewerIntervalMs === "number" && Number.isFinite(officialViewerIntervalMs) && officialViewerIntervalMs > 0 ? officialViewerIntervalMs : null;
    if (hinted == null) {
      return {
        freshMs: DIRECT_VIEWERS_FRESH_MS,
        nowcastMaxMs: DIRECT_VIEWERS_NOWCAST_MAX_MS
      };
    }
    const freshMs = clamp(Math.round(hinted * 1.6), 45e3, 12e4);
    const nowcastMaxMs = clamp(
      Math.round(hinted * 4),
      freshMs + 45e3,
      5 * 60 * 1e3
    );
    return { freshMs, nowcastMaxMs };
  }
  function dynamicMultiplier(totalVisitors) {
    if (typeof totalVisitors !== "number" || !Number.isFinite(totalVisitors) || totalVisitors <= 0) {
      return 7;
    }
    const T = MULTIPLIER_TABLE;
    if (totalVisitors <= T[0][0]) return T[0][1];
    if (totalVisitors >= T[T.length - 1][0]) return T[T.length - 1][1];
    for (let i = 0; i < T.length - 1; i++) {
      if (totalVisitors <= T[i + 1][0]) {
        const [v0, m0] = T[i];
        const [v1, m1] = T[i + 1];
        const t = (Math.log(totalVisitors) - Math.log(v0)) / (Math.log(v1) - Math.log(v0));
        return Math.round((m0 + t * (m1 - m0)) * 10) / 10;
      }
    }
    return 7;
  }
  function retentionRate(ageMin) {
    if (typeof ageMin !== "number" || !Number.isFinite(ageMin) || ageMin < 0) return 0.4;
    return Math.max(0.08, 0.48 * Math.exp(-5e-3 * ageMin));
  }
  function estimateConcurrentViewers({
    recentActiveUsers,
    totalVisitors,
    streamAgeMin,
    multiplier
  }) {
    const active = typeof recentActiveUsers === "number" && recentActiveUsers >= 0 ? Math.floor(recentActiveUsers) : 0;
    const hasVisitors = typeof totalVisitors === "number" && Number.isFinite(totalVisitors) && totalVisitors > 0;
    const hasAge = typeof streamAgeMin === "number" && Number.isFinite(streamAgeMin) && streamAgeMin >= 0;
    const m = typeof multiplier === "number" && multiplier > 0 ? multiplier : dynamicMultiplier(hasVisitors ? totalVisitors : null);
    const signalA = active > 0 ? active * m : 0;
    let signalB = 0;
    let retPct = (
      /** @type {number|null} */
      null
    );
    if (hasVisitors && hasAge) {
      retPct = retentionRate(
        /** @type {number} */
        streamAgeMin
      );
      signalB = Math.round(
        /** @type {number} */
        totalVisitors * retPct
      );
    }
    let estimated = 0;
    let method = "none";
    if (signalA > 0 && signalB > 0) {
      estimated = Math.round(Math.sqrt(signalA * signalB));
      method = "combined";
    } else if (signalA > 0) {
      estimated = Math.round(signalA);
      method = "active_only";
    } else if (signalB > 0) {
      estimated = signalB;
      method = "retention_only";
    }
    let capped = false;
    if (hasVisitors) {
      if (method === "active_only") {
        const softCap = Math.round(
          /** @type {number} */
          totalVisitors * VISITOR_SOFT_CAP_RATIO
        );
        if (estimated > softCap) {
          estimated = softCap;
          capped = true;
        }
      }
      if (estimated > /** @type {number} */
      totalVisitors) {
        estimated = /** @type {number} */
        totalVisitors;
        capped = true;
      }
    }
    return {
      estimated,
      activeCommenters: active,
      multiplier: m,
      capped,
      method,
      signalA: Math.round(signalA),
      signalB,
      retentionPct: retPct != null ? Math.round(retPct * 100) : null,
      streamAgeMin: hasAge ? (
        /** @type {number} */
        streamAgeMin
      ) : null
    };
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
  function resolveConcurrentViewers({
    nowMs,
    officialViewers,
    officialUpdatedAtMs,
    officialViewerIntervalMs,
    previousStatisticsComments,
    currentStatisticsComments,
    receivedCommentsDelta,
    recentActiveUsers,
    totalVisitors,
    streamAgeMin,
    multiplier
  }) {
    const base = estimateConcurrentViewers({
      recentActiveUsers,
      totalVisitors,
      streamAgeMin,
      multiplier
    });
    const now = typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : Date.now();
    const official = typeof officialViewers === "number" && Number.isFinite(officialViewers) && officialViewers >= 0 ? Math.round(officialViewers) : null;
    const updatedAt = typeof officialUpdatedAtMs === "number" && Number.isFinite(officialUpdatedAtMs) ? officialUpdatedAtMs : null;
    const freshnessMs = official != null && updatedAt != null ? Math.max(0, now - updatedAt) : null;
    const thresholds = resolveDirectViewersThresholds(officialViewerIntervalMs);
    const captureRatio = previousStatisticsComments != null || currentStatisticsComments != null || receivedCommentsDelta != null ? calcCommentCaptureRatio({
      previousStatisticsComments,
      currentStatisticsComments,
      receivedCommentsDelta
    }) : null;
    const capture = captureRatio == null ? 1 : captureRatio;
    if (official != null && freshnessMs != null && freshnessMs <= thresholds.freshMs) {
      return {
        estimated: official,
        lower: official,
        upper: official,
        confidence: 0.98,
        method: "official",
        capped: false,
        freshnessMs,
        captureRatio,
        base
      };
    }
    if (official != null && freshnessMs != null && freshnessMs <= thresholds.nowcastMaxMs) {
      const freshnessRatio = (freshnessMs - thresholds.freshMs) / Math.max(1, thresholds.nowcastMaxMs - thresholds.freshMs);
      const driftWeight = clamp(freshnessRatio * (0.35 + capture * 0.65), 0, 0.65);
      const target = base.estimated > 0 ? base.estimated : official;
      const rawEstimate = official + (target - official) * driftWeight;
      const bandRatio = clamp(0.1 + freshnessRatio * 0.08 + (1 - capture) * 0.1, 0.08, 0.3);
      const estimated = clamp(
        Math.round(rawEstimate),
        Math.max(0, Math.round(official * (1 - bandRatio))),
        Math.round(official * (1 + bandRatio))
      );
      const confidence = clamp(
        0.88 - freshnessRatio * 0.18 - (1 - capture) * 0.18,
        0.45,
        0.9
      );
      const rangeRatio = clamp(0.08 + freshnessRatio * 0.1 + (1 - capture) * 0.1, 0.08, 0.32);
      return {
        estimated,
        lower: Math.max(0, Math.round(estimated * (1 - rangeRatio))),
        upper: Math.round(estimated * (1 + rangeRatio)),
        confidence,
        method: "nowcast",
        capped: base.capped,
        freshnessMs,
        captureRatio,
        base
      };
    }
    const fallbackRangeRatio = base.method === "combined" ? 0.2 : base.method === "active_only" ? 0.28 : base.method === "retention_only" ? 0.32 : 0.5;
    const fallbackConfidence = base.method === "combined" ? 0.62 : base.method === "active_only" ? 0.52 : base.method === "retention_only" ? 0.45 : 0.2;
    return {
      estimated: base.estimated,
      lower: Math.max(0, Math.round(base.estimated * (1 - fallbackRangeRatio))),
      upper: Math.round(base.estimated * (1 + fallbackRangeRatio)),
      confidence: fallbackConfidence,
      method: "fallback",
      capped: base.capped,
      freshnessMs,
      captureRatio,
      base
    };
  }

  // src/lib/popupConcurrentEstimateGate.js
  function shouldShowConcurrentEstimate({
    recentActiveUsers,
    officialViewerCount,
    viewerCountFromDom,
    liveId
  }) {
    const recent = typeof recentActiveUsers === "number" && Number.isFinite(recentActiveUsers) ? recentActiveUsers : 0;
    if (recent > 0) return true;
    if (typeof officialViewerCount === "number" && Number.isFinite(officialViewerCount)) {
      return true;
    }
    const vc = viewerCountFromDom;
    if (typeof vc === "number" && Number.isFinite(vc) && vc >= 0) return true;
    return Boolean(String(liveId || "").trim());
  }
  function concurrentEstimateIsSparseSignal({
    recentActiveUsers,
    officialViewerCount,
    viewerCountFromDom
  }) {
    const recent = typeof recentActiveUsers === "number" && Number.isFinite(recentActiveUsers) ? recentActiveUsers : 0;
    if (recent > 0) return false;
    if (typeof officialViewerCount === "number" && Number.isFinite(officialViewerCount)) {
      return false;
    }
    const vc = viewerCountFromDom;
    if (typeof vc === "number" && Number.isFinite(vc) && vc >= 0) return false;
    return true;
  }

  // src/lib/popupWatchMetaConcurrentGate.js
  function watchMetaConcurrentGateFromSnapshot(snapshot) {
    if (!snapshot) {
      return { showConcurrent: false, sparseConcurrent: true };
    }
    const vc = snapshot.viewerCountFromDom;
    const recentActive = typeof snapshot.recentActiveUsers === "number" ? snapshot.recentActiveUsers : 0;
    const showConcurrent = shouldShowConcurrentEstimate({
      recentActiveUsers: recentActive,
      officialViewerCount: snapshot.officialViewerCount,
      viewerCountFromDom: vc,
      liveId: snapshot.liveId
    });
    const sparseConcurrent = concurrentEstimateIsSparseSignal({
      recentActiveUsers: recentActive,
      officialViewerCount: snapshot.officialViewerCount,
      viewerCountFromDom: vc
    });
    return { showConcurrent, sparseConcurrent };
  }

  // src/lib/watchConcurrentEstimateUiCopy.js
  var SPARSE_CONCURRENT_ESTIMATE_NOTE = "\u6765\u5834\u8005\u30FB\u7D71\u8A08\u304C\u672A\u53D6\u5F97\u306E\u305F\u3081\u63A8\u5B9A\u306F\u53C2\u8003\u5024";
  function concurrentResolutionMethodTitlePart(method) {
    if (method === "official") return "watch WebSocket \u7531\u6765\u306E\u76F4\u63A5\u5024";
    if (method === "nowcast") return "watch WebSocket \u306E\u6700\u7D42\u5024\u304B\u3089\u77ED\u671F\u88DC\u9593";
    return "\u30B3\u30E1\u30F3\u30C8/\u6765\u5834\u8005\u30D9\u30FC\u30B9\u306E\u63A8\u5B9A";
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

  // src/lib/pickLatestComment.js
  function pickLatestCommentEntry(list) {
    if (!Array.isArray(list) || !list.length) return null;
    const rank = (e) => {
      const noStr = String(e?.commentNo ?? "").trim();
      const noNum = /^\d+$/.test(noStr) ? Number(noStr) : NaN;
      const at = Number(e?.capturedAt || 0);
      return { noNum, at };
    };
    const pickNewer = (a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      const aHas = Number.isFinite(ra.noNum);
      const bHas = Number.isFinite(rb.noNum);
      if (aHas && bHas && ra.noNum !== rb.noNum) {
        return ra.noNum > rb.noNum ? a : b;
      }
      if (aHas && !bHas) return a;
      if (!aHas && bHas) return b;
      return ra.at >= rb.at ? a : b;
    };
    let best = list[0];
    for (let i = 1; i < list.length; i += 1) {
      best = pickNewer(list[i], best);
    }
    return best;
  }

  // src/lib/userRooms.js
  var UNKNOWN_USER_KEY = "__unknown__";
  function shortUserKeyDisplay(userKey) {
    if (!userKey || userKey === UNKNOWN_USER_KEY) return "";
    const s = String(userKey);
    return s.length <= 18 ? s : `${s.slice(0, 8)}\u2026${s.slice(-6)}`;
  }
  function displayUserLabel(userKey, nickname) {
    if (!userKey || userKey === UNKNOWN_USER_KEY) {
      return "ID\u672A\u53D6\u5F97\uFF08DOM\u306B\u6295\u7A3F\u8005\u60C5\u5831\u306A\u3057\uFF09";
    }
    const name = anonymousNicknameFallback(userKey, nickname);
    const shortId = shortUserKeyDisplay(userKey);
    if (name) return `${name}\uFF08${shortId}\uFF09`;
    return shortId;
  }
  function aggregateCommentsByUser(entries) {
    const list = Array.isArray(entries) ? entries : [];
    const map = /* @__PURE__ */ new Map();
    for (const e of list) {
      const uid = e?.userId ? String(e.userId).trim() : "";
      const userKey = uid || UNKNOWN_USER_KEY;
      const capturedAt = Number(e?.capturedAt || 0);
      const text = String(e?.text || "").trim();
      const nickname = String(e?.nickname || "").trim();
      const rawAv = String(e?.avatarUrl || "").trim();
      const avatarCandidate = isHttpOrHttpsUrl(rawAv) ? rawAv : "";
      if (!map.has(userKey)) {
        map.set(userKey, {
          userKey,
          nickname: "",
          count: 0,
          lastAt: 0,
          lastText: "",
          avatarUrl: ""
        });
      }
      const row = map.get(userKey);
      row.count += 1;
      if (nickname) {
        if (!row.nickname) row.nickname = nickname;
        else if (nickname.length > row.nickname.length) row.nickname = nickname;
      }
      if (capturedAt >= row.lastAt) {
        row.lastAt = capturedAt;
        row.lastText = text.length > 60 ? `${text.slice(0, 60)}\u2026` : text;
        if (userKey !== UNKNOWN_USER_KEY && avatarCandidate) row.avatarUrl = avatarCandidate;
      }
    }
    return [...map.values()].sort((a, b) => b.lastAt - a.lastAt);
  }

  // src/lib/userSupportGridAccent.js
  var ACCENT_OKLCH_LIGHT = Object.freeze([
    "oklch(0.52 0.13 264)",
    "oklch(0.58 0.12 230)",
    "oklch(0.52 0.12 150)",
    "oklch(0.62 0.14 85)",
    "oklch(0.54 0.16 25)",
    "oklch(0.52 0.14 310)",
    "oklch(0.62 0.14 50)",
    "oklch(0.56 0.02 264)"
  ]);
  var ACCENT_OKLCH_DARK = Object.freeze([
    "oklch(0.78 0.09 264)",
    "oklch(0.82 0.08 230)",
    "oklch(0.78 0.09 150)",
    "oklch(0.84 0.10 85)",
    "oklch(0.79 0.11 25)",
    "oklch(0.78 0.09 310)",
    "oklch(0.84 0.10 50)",
    "oklch(0.78 0.03 264)"
  ]);
  var ACCENT_HEX_LIGHT = Object.freeze([
    "#375ca8",
    "#0f8ab8",
    "#217a4a",
    "#c9a227",
    "#c43c4f",
    "#8f3d8c",
    "#d9781a",
    "#6b6f7a"
  ]);
  var ACCENT_HEX_DARK = Object.freeze([
    "#8eb7ff",
    "#6fd4f5",
    "#5ecd8f",
    "#e8cf5a",
    "#ff8a9d",
    "#d896ff",
    "#ffb366",
    "#b4b8c4"
  ]);
  function fnv1a32(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function accentSlotFromUserKey(userKey) {
    const k = String(userKey || "").trim();
    if (!k || k === UNKNOWN_USER_KEY) return null;
    return fnv1a32(k) % 8;
  }
  function accentColorForSlot(slot, colorScheme) {
    if (!Number.isInteger(slot) || slot < 0 || slot > 7) return null;
    const pal = colorScheme === "dark" ? ACCENT_HEX_DARK : ACCENT_HEX_LIGHT;
    return pal[slot] ?? null;
  }
  function supportUserKeyFromEntry(entry) {
    if (!entry || typeof entry !== "object") return UNKNOWN_USER_KEY;
    const uid = String(
      /** @type {{ userId?: string }} */
      entry.userId || ""
    ).trim();
    return uid || UNKNOWN_USER_KEY;
  }
  function supportOrdinalForIndex(entries, index) {
    if (!Array.isArray(entries) || !Number.isFinite(index)) return 0;
    const i = Math.floor(index);
    if (i < 0 || i >= entries.length) return 0;
    const key = supportUserKeyFromEntry(entries[i]);
    let n = 0;
    for (let j = 0; j <= i; j += 1) {
      if (supportUserKeyFromEntry(entries[j]) === key) n += 1;
    }
    return n;
  }
  function supportSameUserTotalInEntries(entries, userKey) {
    if (!Array.isArray(entries) || !userKey) return 0;
    let n = 0;
    for (const e of entries) {
      if (supportUserKeyFromEntry(e) === userKey) n += 1;
    }
    return n;
  }

  // src/lib/userCommentProfileCache.js
  var USER_COMMENT_PROFILE_CACHE_MAX = 5e3;
  function normalizeUserCommentProfileMap(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
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
      if (!Number.isFinite(updatedAt) || updatedAt <= 0) continue;
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
      if (candNick && (!curNick || candNick.length > curNick.length)) {
        out = { ...out, nickname: candNick };
        changed = true;
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
  function pruneUserCommentProfileMap(map, max = USER_COMMENT_PROFILE_CACHE_MAX) {
    const raw = Number(max);
    const lim = Math.max(
      1,
      Math.min(
        Number.isFinite(raw) && raw > 0 ? raw : USER_COMMENT_PROFILE_CACHE_MAX,
        2e4
      )
    );
    const ids = Object.keys(map);
    if (ids.length <= lim) return map;
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
  function hydrateUserCommentProfileMapFromStorage(into, fromDisk) {
    if (!into || !fromDisk || typeof into !== "object" || typeof fromDisk !== "object") {
      return false;
    }
    let touched = false;
    for (const [uid, disk] of Object.entries(fromDisk)) {
      if (!disk || typeof disk !== "object") continue;
      const du = Number(disk.updatedAt);
      if (!Number.isFinite(du) || du <= 0) continue;
      const cur = into[uid];
      if (!cur) {
        into[uid] = { ...disk };
        touched = true;
        continue;
      }
      const cu = Number(cur.updatedAt) || 0;
      if (du > cu) {
        into[uid] = { ...disk };
        touched = true;
        continue;
      }
      let nextNick = String(cur.nickname || "").trim();
      const dn = String(disk.nickname || "").trim();
      let gapTouched = false;
      if (dn.length > nextNick.length) {
        nextNick = dn;
        gapTouched = true;
      }
      let nextAv = String(cur.avatarUrl || "").trim();
      const da = String(disk.avatarUrl || "").trim();
      const curStrong = nextAv && isHttpOrHttpsUrl(nextAv) && !isWeakNiconicoUserIconHttpUrl(nextAv);
      const diskStrong = da && isHttpOrHttpsUrl(da) && !isWeakNiconicoUserIconHttpUrl(da);
      if (!curStrong && diskStrong) {
        nextAv = da;
        gapTouched = true;
      }
      if (!gapTouched) continue;
      const entry = { updatedAt: Math.max(cu, du) };
      if (nextNick) entry.nickname = nextNick;
      if (nextAv && isHttpOrHttpsUrl(nextAv)) entry.avatarUrl = nextAv;
      into[uid] = entry;
      touched = true;
    }
    return touched;
  }

  // src/lib/supportGrowthAvatarLoad.js
  function defaultUrlKey(url) {
    const s = String(url || "").trim();
    if (!s) return "";
    try {
      const u = new URL(s);
      return `${u.origin}${u.pathname}`.toLowerCase();
    } catch {
      return s.toLowerCase();
    }
  }
  function createSupportAvatarLoadGuard(options) {
    const fallbackSrc = String(options?.fallbackSrc || "");
    const urlKeyFn = typeof options?.urlKey === "function" ? options.urlKey : defaultUrlKey;
    const onFallbackApplied = typeof options?.onFallbackApplied === "function" ? options.onFallbackApplied : null;
    const failedKeys = /* @__PURE__ */ new Set();
    function pickDisplaySrc(requestedSrc) {
      const req = String(requestedSrc || "").trim();
      if (!req) return fallbackSrc;
      if (!isHttpOrHttpsUrl(req)) return req;
      const key = urlKeyFn(req);
      if (key && failedKeys.has(key)) return fallbackSrc;
      return req;
    }
    function noteRemoteAttempt(img, requestedSrc) {
      if (!(img instanceof HTMLImageElement)) return;
      const req = String(requestedSrc || "").trim();
      if (!isHttpOrHttpsUrl(req)) return;
      if (pickDisplaySrc(req) !== req) return;
      const key = urlKeyFn(req);
      if (!key) return;
      const onError = () => {
        failedKeys.add(key);
        img.src = fallbackSrc;
        onFallbackApplied?.(img);
      };
      img.addEventListener("error", onError, { once: true });
    }
    function clearFailedUrls() {
      failedKeys.clear();
    }
    function markFailedForTests(url) {
      const k = urlKeyFn(String(url || ""));
      if (k) failedKeys.add(k);
    }
    return {
      pickDisplaySrc,
      noteRemoteAttempt,
      clearFailedUrls,
      markFailedForTests
    };
  }

  // src/lib/storyDetailRelatedEntries.js
  function entriesRelatedForStoryDetail(allEntries, focusEntry, opts = {}) {
    const limit = Number(opts.limit) > 0 ? Number(opts.limit) : 5;
    const uid = String(focusEntry?.userId || "").trim();
    if (!uid) return [];
    const list = Array.isArray(allEntries) ? allEntries : [];
    return list.filter((row) => String(row?.userId || "").trim() === uid).slice(-limit).reverse();
  }

  // src/lib/storageErrorState.js
  function storageErrorRelevantToLiveId(payload, viewerLiveId) {
    if (!payload || typeof payload !== "object") return false;
    const errLid = String(
      /** @type {{ liveId?: unknown }} */
      payload.liveId || ""
    ).trim().toLowerCase();
    if (!errLid) return true;
    const v = String(viewerLiveId || "").trim().toLowerCase();
    if (!v) return true;
    return errLid === v;
  }

  // src/lib/commentPanelStatus.js
  function parseCommentPanelStatusPayload(raw) {
    if (!raw || typeof raw !== "object") return null;
    const o = (
      /** @type {{ ok?: unknown; updatedAt?: unknown }} */
      raw
    );
    if (o.ok !== false) return null;
    const updatedAt = Number(o.updatedAt);
    if (!Number.isFinite(updatedAt)) return null;
    const liveId = "liveId" in o && o.liveId != null ? String(
      /** @type {{ liveId?: unknown }} */
      o.liveId
    ).trim() : "";
    const code = "code" in o && o.code != null ? String(
      /** @type {{ code?: unknown }} */
      o.code
    ).trim() : "";
    return {
      ok: false,
      updatedAt,
      ...liveId ? { liveId } : {},
      ...code ? { code } : {}
    };
  }
  function commentPanelStatusRelevantToLiveId(payload, viewerLiveId) {
    if (!payload || typeof payload !== "object") return false;
    const errLid = String(
      /** @type {{ liveId?: unknown }} */
      payload.liveId || ""
    ).trim().toLowerCase();
    if (!errLid) return true;
    const v = String(viewerLiveId || "").trim().toLowerCase();
    if (!v) return true;
    return errLid === v;
  }

  // src/lib/htmlEscape.js
  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }

  // src/lib/topSupportRankStripLines.js
  function topSupportRankLineModels(stripRooms, opts) {
    const defaultThumb = String(opts?.defaultThumbSrc || "").trim();
    const anonThumb = String(opts?.anonymousFallbackThumbSrc || "").trim();
    const colorScheme = opts?.colorScheme === "dark" ? "dark" : "light";
    const rooms = Array.isArray(stripRooms) ? stripRooms : [];
    let knownRank = 0;
    return rooms.map((r) => {
      const userKey = String(r?.userKey ?? "");
      const isUnknown = userKey === UNKNOWN_USER_KEY;
      if (!isUnknown) knownRank += 1;
      const placeNumber = isUnknown ? null : knownRank;
      const rawAv = String(r?.avatarUrl || "").trim();
      const uidForThumb = isUnknown ? "" : userKey;
      const thumbSrc = pickSupportGrowthFallbackTileSrc(
        uidForThumb,
        rawAv,
        defaultThumb,
        anonThumb || defaultThumb
      );
      const thumbNeedsNoReferrer = isHttpOrHttpsUrl(thumbSrc);
      const idTitle = isUnknown ? "" : String(r.userKey);
      const idShort = isUnknown ? "\u2014" : shortUserKeyDisplay(userKey) || String(userKey);
      const nickRaw = String(r?.nickname || "").trim();
      const nameLine = isUnknown ? "\u2014" : anonymousNicknameFallback(userKey, nickRaw) || "\uFF08\u672A\u53D6\u5F97\uFF09";
      const fullLabelForTitle = displayUserLabel(userKey, r?.nickname);
      let hasAccent = false;
      let accentColorCss = null;
      if (!isUnknown) {
        const slot = accentSlotFromUserKey(userKey);
        const col = slot != null ? accentColorForSlot(slot, colorScheme) : null;
        if (col) {
          hasAccent = true;
          accentColorCss = col;
        }
      }
      return {
        count: Math.max(0, Number(r?.count) || 0),
        isUnknown,
        placeNumber,
        hasAccent,
        accentColorCss,
        thumbSrc,
        thumbNeedsNoReferrer,
        idTitle,
        idShort,
        nameLine,
        fullLabelForTitle
      };
    });
  }

  // src/lib/topSupportRankStripConfig.js
  var TOP_SUPPORT_RANK_STRIP_MAX = 11;

  // src/lib/topSupportRankStripStableKey.js
  function topSupportRankStripStableKey(liveId, entryCount, stripRooms) {
    const lid = String(liveId || "").trim().toLowerCase();
    const n = Math.max(0, Math.floor(Number(entryCount) || 0));
    const rows = Array.isArray(stripRooms) ? stripRooms : [];
    if (!rows.length) {
      return `${lid}
${n}
`;
    }
    const body = rows.map((r) => {
      const k = String(r?.userKey ?? "");
      const c = Math.max(0, Math.floor(Number(r?.count) || 0));
      return `${k}:${c}`;
    }).join("\n");
    return `${lid}
${n}
${body}`;
  }

  // src/lib/supportGridDisplayTier.js
  var SUPPORT_GRID_TIER_RINK = "rink";
  var SUPPORT_GRID_TIER_KONTA = "konta";
  var SUPPORT_GRID_TIER_TANU = "tanu";
  function goodUserThumbUrl(u) {
    const s = String(u || "").trim();
    return isHttpOrHttpsUrl(s) && !isWeakNiconicoUserIconHttpUrl(s);
  }
  function supportGridTierHasPersonalThumb(userId, httpAvatarCandidate, storedAvatarUrl) {
    const u = String(userId || "").trim();
    const http = String(httpAvatarCandidate ?? "").trim();
    const raw = String(storedAvatarUrl ?? "").trim();
    const syn = u && /^\d{5,14}$/.test(u) ? String(niconicoDefaultUserIconUrl(u) || "").trim() : "";
    if (goodUserThumbUrl(raw)) return true;
    if (goodUserThumbUrl(http) && (!syn || http !== syn)) return true;
    return false;
  }
  function supportGridStrongNickname(nick, userId) {
    const n = String(nick ?? "").trim();
    if (!n) return false;
    if (n === "\uFF08\u672A\u53D6\u5F97\uFF09" || n === "(\u672A\u53D6\u5F97)") return false;
    if (n === "\u533F\u540D") return false;
    if (isNiconicoAnonymousUserId(userId) && n.length <= 1) return false;
    return true;
  }
  function supportGridDisplayTier(p) {
    const uid = String(p?.userId ?? "").trim();
    if (!uid) return SUPPORT_GRID_TIER_TANU;
    let hasThumb = false;
    if (p.lpMockHasCustomAvatar === true) hasThumb = true;
    else if (p.lpMockHasCustomAvatar === false) hasThumb = false;
    else {
      const httpCandidate = String(p.httpAvatarCandidate ?? "").trim();
      const rawAv = String(p.storedAvatarUrl ?? "").trim();
      hasThumb = supportGridTierHasPersonalThumb(uid, httpCandidate, rawAv);
    }
    const nick = String(p?.nickname ?? "").trim();
    const strongNick = supportGridStrongNickname(nick, uid);
    if (strongNick && hasThumb) return SUPPORT_GRID_TIER_RINK;
    if (strongNick || hasThumb) return SUPPORT_GRID_TIER_KONTA;
    return SUPPORT_GRID_TIER_TANU;
  }

  // src/lib/storyUserLaneBuckets.js
  function bucketStoryUserLanePicks(sortedCandidates, maxTotal) {
    const n = Math.max(0, Math.floor(Number(maxTotal) || 0));
    const a3 = sortedCandidates.filter((c) => c.profileTier === 3);
    const a2 = sortedCandidates.filter((c) => c.profileTier === 2);
    const a1 = sortedCandidates.filter((c) => c.profileTier === 1);
    let rem = n;
    const rink = a3.slice(0, rem);
    rem -= rink.length;
    const konta = a2.slice(0, rem);
    rem -= konta.length;
    const tanu = a1.slice(0, rem);
    return { rink, konta, tanu };
  }
  function flattenStoryUserLaneBuckets(b) {
    return [...b.rink, ...b.konta, ...b.tanu];
  }

  // src/lib/storyUserLaneGuideHtml.js
  function storyUserLaneGuideLine(src, textEscaped) {
    return `<div class="nl-story-userlane-guide__line"><img class="nl-story-userlane-guide__face" src="${escapeAttr(src)}" alt="" width="24" height="24" decoding="async" /><span class="nl-story-userlane-guide__text">${textEscaped}</span></div>`;
  }
  function buildStoryUserLaneGuideTopHtml(faceRink) {
    return storyUserLaneGuideLine(
      faceRink,
      escapeHtml(
        "\u308A\u3093\u304F: \u30CB\u30B3\u751F\u306E\u30E6\u30FC\u30B6\u30FC\u8B58\u5225\u5B50\uFF08\u6570\u5024ID\u30FB\u533F\u540D\u306E a: \u5F62\u5F0F\uFF09\u304C\u4ED8\u3044\u305F\u5FDC\u63F4\u3060\u3051\u304C\u3053\u306E\u5217\u306B\u8F09\u308B\u3088\u3002\u4E26\u3073\u3067\u306F\u3001\u500B\u4EBA\u30B5\u30E0\u30CD\u3068\u300C\u533F\u540D\u300D\u300C\uFF08\u672A\u53D6\u5F97\uFF09\u300D\u4EE5\u5916\u306E\u8868\u793A\u540D\u304C\u305D\u308D\u3063\u305F\u4EBA\u3092\u3044\u3061\u3070\u3093\u624B\u524D\u306B\u5BC4\u305B\u308B\u3088\u3002\u30B5\u30E0\u30CD\u3068\u30D7\u30ED\u30D5\u30A3\u30FC\u30EB\u3092\u6574\u3048\u3066\u3044\u308B\u3068\u3001\u914D\u4FE1\u8005\u5074\u304B\u3089\u3082\u898B\u3064\u3051\u3084\u3059\u304F\u306A\u308A\u3084\u3059\u3044\u3001\u3068\u3044\u3046\u6587\u8108\u3067\u3082\u3042\u308B\u3088\u3002"
      )
    );
  }
  function buildStoryUserLaneGuideKontaHtml(faceKonta) {
    return storyUserLaneGuideLine(
      faceKonta,
      escapeHtml(
        "\u3053\u3093\u592A: 2\u756A\u76EE\u306E\u512A\u5148\u3068\u3057\u3066\u3001\u8868\u793A\u540D\u304B\u500B\u4EBA\u30B5\u30E0\u30CD\u306E\u3069\u3061\u3089\u304B\u307E\u3067\u53D6\u308C\u305F\u4EBA\u306F\u3001\u305D\u306E\u6B21\u306E\u6BB5\u3068\u3057\u3066\u4E26\u3073\u3084\u3059\u3044\u3088\uFF08\u5168\u54E1\u3092\u96A0\u3059\u308F\u3051\u3058\u3083\u306A\u3044\u3088\uFF09\u3002"
      )
    );
  }
  function buildStoryUserLaneGuideTanuHtml(faceTanu) {
    return storyUserLaneGuideLine(
      faceTanu,
      escapeHtml(
        "\u305F\u306C\u59C9: ID\u304C\u53D6\u308C\u3066\u3044\u306A\u3044\u30B3\u30E1\u30F3\u30C8\u306F\u3001\u3053\u306E\u5217\u306B\u306F\u8F09\u305B\u306A\u3044\u3088\uFF08\u533A\u5225\u3067\u304D\u306A\u3044\u304B\u3089\uFF09\u3002\u3042\u3068\u53D6\u5F97\u304C\u8584\u3044\u4EBA\u306F\u4E26\u3073\u306E\u5F8C\u308D\u5BC4\u308A\u306B\u306A\u308A\u3084\u3059\u3044\u304B\u3089\u3001\u4E0B\u306E\u300C\u72B6\u6CC1\u306E\u8A73\u7D30\u300D\u3067\u6B20\u3051\u3092\u78BA\u8A8D\u3057\u3066\u306D\u3002"
      )
    );
  }
  function buildStoryUserLaneGuideFootHtml(displayCount) {
    const n = Math.max(0, Math.floor(Number(displayCount) || 0));
    return `<p class="nl-story-userlane-guide__foot" aria-live="polite">${escapeHtml(`\u3044\u307E ${n} \u4EF6\u3092\u8868\u793A\u4E2D`)}</p>`;
  }

  // src/lib/htmlReportConceptGuide.js
  var CONCEPT_H2 = "\u3053\u306E\u62E1\u5F35\u306B\u3064\u3044\u3066\uFF08\u541B\u6597\u308A\u3093\u304F\u306E\u8FFD\u61B6\u306E\u304D\u3089\u3081\u304D\uFF09";
  var CONCEPT_TEASER_LEAD = "\u3053\u306E\u30D6\u30E9\u30A6\u30B6\u62E1\u5F35\u306E\u547C\u3073\u540D\u306F\u300C\u541B\u6597\u308A\u3093\u304F\u306E\u8FFD\u61B6\u306E\u304D\u3089\u3081\u304D\u300D\u306A\u306E\u3060\u3002\u30CB\u30B3\u30CB\u30B3\u751F\u653E\u9001\u306E\u5FDC\u63F4\u30B3\u30E1\u30F3\u30C8\u3092\u3053\u306EPC\u306B\u8A18\u9332\u3057\u3001\u5FDC\u63F4\u306E\u53EF\u8996\u5316\u3084\u3042\u3068\u304B\u3089\u306E\u632F\u308A\u8FD4\u308A\u306B\u3064\u306A\u3052\u308B\u306E\u3060\u3002\u8A73\u3057\u3044\u6587\u8108\u306F\u3001\u4E0B\u306E\u6298\u308A\u305F\u305F\u307F\u3092\u958B\u3044\u3066\u307B\u3057\u3044\u306E\u3060\u3002";
  var CONCEPT_READ_MORE_1_BODY = `
          <p class="concept-read-more__prose">
            \u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3059\u308B HTML \u306E\u30D5\u30A1\u30A4\u30EB\u540D\u306A\u3069\u306B\u306F\u3001\u958B\u767A\u8B58\u5225\u5B50\u3068\u3057\u3066 <strong>nicolivelog</strong>
            \u304C\u4ED8\u304F\u3053\u3068\u304C\u3042\u308B\u306E\u3060\u3002Chrome \u306E\u62E1\u5F35\u4E00\u89A7\u306B\u8868\u793A\u3055\u308C\u308B\u540D\u524D\u306F\u300C\u541B\u6597\u308A\u3093\u304F\u306E\u8FFD\u61B6\u306E\u304D\u3089\u3081\u304D\u300D\u306A\u306E\u3060\u3002
          </p>
          <p class="concept-read-more__prose">
            \u57FA\u672C\u306E\u8996\u8074\u306F\u5916\u90E8\u30D7\u30E9\u30C3\u30C8\u30D5\u30A9\u30FC\u30E0\u4E0A\u3067\u8D77\u304D\u308B\u306E\u3060\u3002\u3060\u304B\u3089\u300C\u30B5\u30A4\u30C8\u306B\u6765\u305F\u30E6\u30CB\u30FC\u30AF\u300D\u3060\u3051\u3067\u306F\u3001\u5FDC\u63F4\u306E\u5168\u4F53\u50CF\u306F\u898B\u3048\u306B\u304F\u3044\u306E\u3060\u3002\u3053\u306E\u62E1\u5F35\u306F\u3001\u30B3\u30E1\u30F3\u30C8\u3068\u3044\u3046<strong>\u5FDC\u63F4\u306E\u75D5\u8DE1</strong>\u3092\u30ED\u30FC\u30AB\u30EB\u306B\u6B8B\u3057\u3001\u4E3B\u50AC\u5074\u3082\u30D5\u30A1\u30F3\u5074\u3082\u300C\u3061\u3083\u3093\u3068\u3042\u3063\u305F\u300D\u3068\u78BA\u8A8D\u3057\u3084\u3059\u304F\u3059\u308B\u306E\u3060\u3002
          </p>
          <p class="concept-read-more__prose">
            \u30CB\u30B3\u751F\u306E<strong>\u7D2F\u8A08\u6765\u5834\u8005\u6570</strong>\uFF08\u914D\u4FE1\u30DA\u30FC\u30B8\u306E statistics.watchCount \u76F8\u5F53\uFF09\u306F\u3001<a href="https://nicodb.net/" target="_blank" rel="noopener noreferrer">NicoDB\uFF08nicodb.net\uFF09</a> \u306E\u300C\u6765\u5834\u8005\u6570\u300D\u3068\u540C\u7CFB\u3067\u6BD4\u8F03\u3057\u3084\u3059\u3044\u306E\u3060\u3002\u4E0B\u306E\u300C\u6765\u5834\uFF08\u5FDC\u63F4\u30B3\u30E1\u30F3\u30C8\uFF09\u300D\u306E\u8A71\u3068\u306F<strong>\u5225\u306E\u5B9A\u7FA9</strong>\u306A\u306E\u3060\u3002
          </p>
          <p class="concept-read-more__prose">
            \u4ECA\u5F8C\u3001X\uFF08\u65E7Twitter\uFF09\u306A\u3069\u30C1\u30E3\u30CD\u30EB\u304C\u5897\u3048\u3066\u3082\u3001<strong>\u5B9A\u7FA9\u3092\u3059\u308A\u66FF\u3048\u305A\u306B</strong>\u540C\u3058\u8003\u3048\u65B9\u3067\u305D\u308D\u3048\u3066\u3044\u304D\u305F\u3044\u306E\u3060\u3002\u7528\u8A9E\u306E\u5B9A\u7FA9\u30DA\u30FC\u30B8\u3092\u5225\u9014\u7528\u610F\u3057\u3001\u300C\u6765\u5834\u300D\u300C\u5FDC\u63F4\u30ED\u30B0\u300D\u306A\u3069\u3092\u5171\u6709\u3057\u3066\u304A\u304F\u30A4\u30E1\u30FC\u30B8\u306A\u306E\u3060\u3002
          </p>
          <p class="concept-read-more__prose">
            <strong>\u52D5\u54E1\u3061\u3083\u308C\u3093\u3058</strong>\uFF08<a href="https://doin-challenge.com/" target="_blank" rel="noopener noreferrer">doin-challenge.com</a>\uFF09\u306F\u3001\u3053\u306E\u62E1\u5F35\u3068<strong>\u6587\u8108\u3067\u30EA\u30F3\u30AF\u3057\u3066\u3044\u308B\u95A2\u9023\u306E\u53D6\u308A\u7D44\u307F</strong>\u306A\u306E\u3060\u3002\u30B5\u30A4\u30C8\u5074\u306E\u30B3\u30F3\u30BB\u30D7\u30C8\u3068\u3001\u3053\u3053\u3067\u6B8B\u308B\u30B3\u30E1\u30F3\u30C8\u8A18\u9332\u3092\u3001\u540C\u3058\u571F\u4FF5\u3067\u8A9E\u308C\u308B\u3088\u3046\u306B\u3057\u305F\u3044\u306E\u3060\u3002
          </p>`;
  function speechBubbleParagraphsHtml(paragraphs) {
    return paragraphs.map((t) => `<p>${t}</p>`).join("");
  }
  function yukkuriGuideRowMultiHtml(avatarHtml, speakerLabel, bodyParagraphs, reverse) {
    const rowClass = reverse ? "yukkuri-row yukkuri-row--reverse" : "yukkuri-row";
    return `
          <div class="${rowClass}">
            ${avatarHtml}
            <div class="speech-bubble">
              <strong>${speakerLabel}</strong>
              ${speechBubbleParagraphsHtml(bodyParagraphs)}
            </div>
          </div>`;
  }
  function yukkuriGuideRowHtml(avatarHtml, speakerLabel, body, reverse) {
    return yukkuriGuideRowMultiHtml(avatarHtml, speakerLabel, [body], reverse);
  }
  var RINK_PARAS = [
    "\u5FDC\u63F4\u306F\u3001\u6D88\u3048\u3084\u3059\u3044\u306E\u3060\u3002\u5916\u306E\u30D7\u30E9\u30C3\u30C8\u30D5\u30A9\u30FC\u30E0\u3060\u3051\u3060\u3068\u3001\u3044\u3044\u306D\u3082\u8FD4\u4FE1\u3082\u3064\u304D\u306B\u304F\u304F\u3001\u81EA\u5206\u3060\u3051\u6D6E\u3044\u3066\u3044\u308B\u3088\u3046\u306B\u611F\u3058\u3066\u3001\u6295\u7A3F\u3084\u30B3\u30E1\u30F3\u30C8\u3092\u6D88\u3057\u3066\u3057\u307E\u3046\u4EBA\u3082\u3044\u308B\u306E\u3060\u3002\u305D\u308C\u306F\u5FDC\u63F4\u3057\u305F\u4EBA\u304C\u60AA\u3044\u306E\u3067\u306F\u306A\u304F\u3001<strong>\u5C4A\u3044\u305F\u304B\u3069\u3046\u304B\u304C\u898B\u3048\u306B\u304F\u3044</strong>\u304B\u3089\u306A\u306E\u3060\u3002\u30A2\u30A4\u30C9\u30EB\u3084\u914D\u4FE1\u306E\u73FE\u5834\u3067\u3082\u3001\u5FDC\u63F4\u6295\u7A3F\u3057\u3066\u53CD\u5FDC\u304C\u306A\u304F\u3066\u6D88\u3059\u3001\u3068\u3044\u3046\u8A71\u306F\u3088\u304F\u805E\u304F\u306E\u3060\u3002",
    "\u3060\u304B\u3089\u300C<strong>\u5FDC\u63F4\u30ED\u30B0</strong>\u300D\u306E\u8003\u3048\u65B9\u304C\u3042\u308B\u306E\u3060\u3002\u30D5\u30A1\u30F3\u306B\u306F\u300C\u3061\u3083\u3093\u3068\u5FDC\u63F4\u3057\u305F\u3053\u3068\u304C\u3001\u3053\u3053\u306B\u6B8B\u308B\u300D\u3001\u4E3B\u50AC\u306B\u306F\u300C\u3061\u3083\u3093\u3068\u898B\u3066\u3044\u308B\u3088\u300D\u3092\u3001\u8FD4\u4FE1\u306E\u672C\u6570\u3060\u3051\u306B\u983C\u3089\u305A\u4F1D\u3048\u3084\u3059\u304F\u3059\u308B\u306E\u3060\u3002\u3059\u3079\u3066\u306B\u624B\u3067\u8FD4\u3059\u3053\u3068\u304C\u6B63\u89E3\u3068\u306F\u9650\u3089\u306A\u3044\u306E\u3060\u3002",
    "\u4ECA\u5F8C X \u306A\u3069\u3082\u8996\u91CE\u306B\u5165\u308C\u308B\u306A\u3089\u3001\u30CF\u30C3\u30B7\u30E5\u30BF\u30B0\u3084\u30E1\u30F3\u30B7\u30E7\u30F3\u306A\u3069\u300C\u3053\u308C\u3092\u3057\u305F\u3089\u8A18\u9332\u5BFE\u8C61\u300D\u3068\u3044\u3063\u305F\u30EB\u30FC\u30EB\u3092\u305D\u308D\u3048\u3066\u3044\u304F\u30A4\u30E1\u30FC\u30B8\u306A\u306E\u3060\u3002\u524A\u9664\u3084\u975E\u516C\u958B\u306B\u306A\u3063\u305F\u6295\u7A3F\u306F\u3001\u30D7\u30E9\u30C3\u30C8\u30D5\u30A9\u30FC\u30E0\u5074\u306E\u90FD\u5408\u3067\u8FFD\u3044\u306B\u304F\u3044\u3053\u3068\u3082\u3042\u308B\u306E\u3060\u3002",
    "\u5FDC\u63F4\u306E<strong>\u53EF\u8996\u5316</strong>\u306F\u3001\u6570\u5B57\u306E\u7AF6\u4E89\u3060\u3051\u3067\u306F\u306A\u3044\u306E\u3060\u3002<strong>\u3061\u3083\u3093\u3068\u5FDC\u63F4\u3057\u305F\u4EBA\u304C\u3001\u4ED5\u7D44\u307F\u4E0A\u3059\u304F\u308F\u308C\u308B</strong>\u65B9\u5411\u306B\u5BC4\u305B\u305F\u3044\u306E\u3060\u3002"
  ];
  var KONTA_PARAS = [
    "\u4E3B\u50AC\u5074\u306B\u306F\u3001\u300C<strong>\u3061\u3083\u3093\u3068\u898B\u3066\u308B\u3088</strong>\u300D\u304C\u4F1D\u308F\u308B\u3088\u3046\u306B\u3057\u305F\u3044\u306E\u3060\u3002\u30ED\u30B0\u304C\u3042\u308C\u3070\u3001\u3059\u3079\u3066\u306E\u30B3\u30E1\u30F3\u30C8\u306B\u624B\u3067\u8FD4\u3055\u306A\u304F\u3066\u3082\u3001\u53D7\u3051\u53D6\u3063\u305F\u3053\u3068\u304C\u5F62\u3068\u3057\u3066\u5171\u6709\u3057\u3084\u3059\u3044\u306E\u3060\u3002",
    "<strong>\u30B3\u30E1\u30F3\u30C8</strong>\u3084<strong>\u30A2\u30A4\u30C6\u30E0</strong>\u3001\u30C6\u30F3\u30B7\u30E7\u30F3\u3092\u4E0A\u3052\u3066\u304F\u308C\u308B\u884C\u70BA\u306B\u306F\u3001\u4E00\u751F\u61F8\u547D\u306E\u71B1\u91CF\u304C\u3042\u308B\u306E\u3060\u3002<strong>\u76DB\u308A\u4E0A\u3052\u3066\u304F\u308C\u305F\u4EBA</strong>\u3092\u3001\u4EF6\u6570\u3084\u540C\u63A5\u306E\u6570\u5B57\u3060\u3051\u3067\u5207\u308A\u6368\u3066\u306A\u3044\u3067\u3044\u305F\u3044\u306E\u3060\u3002",
    "\u540C\u6642\u63A5\u7D9A\uFF08\u540C\u63A5\uFF09\u306E\u6570\u5B57\u306F\u3001\u30B5\u30FC\u30D0\u30FC\u4E0A\u306E\u6570\u3060\u3051\u3067\u306F\u306A\u3044\u306E\u3060\u3002<strong>\u540C\u3058\u6642\u9593\u306B\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB\u3092\u5408\u308F\u305B\u3066\u304D\u305F</strong>\u3001\u305D\u306E\u30B3\u30B9\u30C8\u3068\u610F\u5FD7\u3082\u542B\u3081\u3066\u3001\u539A\u307F\u3068\u3057\u3066\u8A9E\u308C\u308B\u306E\u3060\u3002\u8868\u793A\u306E\u5B9A\u7FA9\u306F\u30B5\u30FC\u30D3\u30B9\u3054\u3068\u306B\u9055\u3046\u304B\u3089\u3001\u516C\u5F0F\u306B\u6570\u3048\u308B\u3068\u304D\u306F\u30EB\u30FC\u30EB\u3092\u305D\u308D\u3048\u308B\u306E\u3060\u3002",
    "\u3053\u306E HTML \u30EC\u30DD\u30FC\u30C8\u306F\u3001\u3042\u3068\u304B\u3089\u8AAD\u307F\u8FD4\u3059<strong>\u632F\u308A\u8FD4\u308A\u7528\u30E1\u30E2</strong>\u3067\u3082\u3042\u308B\u306E\u3060\u3002\u5275\u4F5C\u8005\u304C\u30D5\u30A1\u30F3\u306E\u71B1\u91CF\u306B\u6C17\u3065\u304F\u624B\u304C\u304B\u308A\u306B\u306A\u308C\u3070\u3044\u3044\u306E\u3060\u3002"
  ];
  var TANU_PARAS = [
    "\u300C<strong>\u6765\u5834</strong>\u300D\u3092\u6570\u3048\u308B\u3068\u304D\u306E\u539F\u5247\u3068\u3057\u3066\u3001<strong>\u5FDC\u63F4\u30B3\u30E1\u30F3\u30C8\u304C\u4E00\u672C\u306F\u3042\u308B\u3053\u3068</strong>\u3001\u3068\u3044\u3046\u8003\u3048\u65B9\u3092\u8EF8\u306B\u3057\u305F\u3044\u306E\u3060\u3002\u898B\u3066\u3044\u308B\u3060\u3051\u306E\u4EBA\u307E\u3067\u540C\u3058\u67A0\u306B\u5165\u308C\u306A\u3044\u3068\u3001\u30A8\u30F3\u30B2\u30FC\u30B8\u3057\u305F\u4EBA\u304C\u304B\u3048\u3063\u3066\u898B\u3048\u306B\u304F\u304F\u306A\u308B\u306E\u3060\u3002",
    '\u5FDC\u63F4\u30B3\u30E1\u30F3\u30C8\u3092\u8A18\u9332\u3059\u308B\u3053\u306E\u62E1\u5F35\u306E\u8A2D\u8A08\u3068\u3001\u300C\u6765\u5834\u300D\u3084\u300C\u53C2\u52A0\u300D\u306E\u8A9E\u306F\u3001\u3064\u306A\u304C\u308B\u306E\u3060\u3002<strong>\u52D5\u54E1\u3061\u3083\u308C\u3093\u3058</strong>\uFF08<a href="https://doin-challenge.com/" target="_blank" rel="noopener noreferrer">doin-challenge.com</a>\uFF09\u3068<strong>\u30EA\u30F3\u30AF\u3057\u3066</strong>\u3001\u30AA\u30F3\u30E9\u30A4\u30F3\u306E\u5FDC\u63F4\u3068\u4F1A\u5834\u3078\u306E\u52D5\u7DDA\u3092\u3001\u540C\u3058\u6587\u8108\u3067\u8A9E\u308C\u308B\u3088\u3046\u306B\u3057\u305F\u3044\u306E\u3060\u3002\u52D5\u54E1\u30C1\u30E3\u30F3\u30CD\u30EB\u306A\u3069\u3067\u3001\u5B9A\u7FA9\u3092\u6BCE\u56DE\u3059\u308A\u66FF\u3048\u306A\u3044\u306E\u304C\u5927\u4E8B\u306A\u306E\u3060\u3002',
    "\u71B1\u91CF\u306E\u968E\u6BB5\u3092\u30A4\u30E1\u30FC\u30B8\u3059\u308B\u3068\u3001\u8996\u8074\u30FB\u540C\u3058\u6642\u9593\u5E2F\u306B\u3044\u308B\u3001\u30C7\u30B8\u30BF\u30EB\u4E0A\u306E\u5FDC\u63F4\uFF08\u30B3\u30E1\u30F3\u30C8\u3084\u30A2\u30A4\u30C6\u30E0\uFF09\u3001\u305D\u3057\u3066<strong>\u30A4\u30D9\u30F3\u30C8\u5F53\u65E5\u3001\u8EAB\u4F53\u3092\u52D5\u304B\u3057\u3066\u30E9\u30A4\u30D6\u4F1A\u5834\u306B\u6765\u3066\u304F\u308C\u305F\u3053\u3068</strong>\u3092\u3001\u3044\u3061\u3070\u3093\u91CD\u3044\u53C2\u52A0\u3068\u3057\u3066\u7F6E\u304D\u305F\u3044\u306E\u3060\u3002\u30AA\u30F3\u30E9\u30A4\u30F3\u306E\u5FDC\u63F4\u3092\u8EFD\u304F\u3059\u308B\u8A71\u3067\u306F\u306A\u3044\u306E\u3060\u3002<strong>\u6765\u3089\u308C\u306A\u3044\u7406\u7531</strong>\u306F\u4EBA\u305D\u308C\u305E\u308C\u3060\u304B\u3089\u3001\u5225\u8EF8\u3067\u5C0A\u91CD\u3059\u308B\u306E\u3060\u3002",
    "\u5168\u4F53\u306E\u300C\u30E6\u30CB\u30FC\u30AF\u30E6\u30FC\u30B6\u30FC\u300D\u3092\u30D7\u30E9\u30C3\u30C8\u30D5\u30A9\u30FC\u30E0\u6A2A\u65AD\u3067\u6B63\u78BA\u306B\u4E00\u3064\u306B\u307E\u3068\u3081\u308B\u306E\u306F\u96E3\u3057\u3044\u306E\u3060\u3002\u3060\u304B\u3089\u300C\u3053\u306E\u62E1\u5F35\u3068\u30EC\u30DD\u30FC\u30C8\u3067\u4F55\u3092\u6570\u3048\u308B\u304B\u300D\u3092\u3001\u6587\u7AE0\u3067\u5171\u6709\u3057\u3066\u304A\u304F\u306E\u3060\u3002"
  ];
  var SAVE_H2 = "\u306A\u306B\u3053\u308C\uFF1F\uFF08\u3086\u3063\u304F\u308A\u30AC\u30A4\u30C9\uFF09";
  var SAVE_LEAD = "\u3053\u306EHTML\u306F\u3001\u3053\u306EPC\u306B\u4FDD\u5B58\u3057\u305F\u30B3\u30E1\u30F3\u30C8\u3068\u3001\u5F53\u6642\u306E\u653E\u9001\u30DA\u30FC\u30B8\u304B\u3089\u53D6\u308C\u305F\u60C5\u5831\u3092\u307E\u3068\u3081\u305F\u300C\u632F\u308A\u8FD4\u308A\u7528\u30E1\u30E2\u300D\u306A\u306E\u3060\u3002\u5FDC\u63F4\u306E\u75D5\u8DE1\u3092\u6B8B\u3059\u305F\u3081\u306E\u8A18\u9332\u3067\u3082\u3042\u308B\u306E\u3060\u3002";
  function conceptReadMoreHtml(summaryTitle, bodyHtml) {
    return `
        <details class="concept-read-more">
          <summary class="concept-read-more__summary">
            <span class="concept-read-more__tag">\u7D9A\u304D\u3092\u8AAD\u3080</span>
            <span class="concept-read-more__title">${summaryTitle}</span>
          </summary>
          <div class="concept-read-more__body">${bodyHtml}</div>
        </details>`;
  }
  function buildHtmlReportConceptGuideCardHtml(avatars) {
    const { avatarRinkHtml, avatarKontaHtml, avatarTanuHtml } = avatars;
    const rinkRow = yukkuriGuideRowMultiHtml(
      avatarRinkHtml,
      "\u3086\u3063\u304F\u308A\u308A\u3093\u304F",
      RINK_PARAS,
      false
    );
    const kontaRow = yukkuriGuideRowMultiHtml(
      avatarKontaHtml,
      "\u3086\u3063\u304F\u308A\u3053\u3093\u592A",
      KONTA_PARAS,
      true
    );
    const tanuRow = yukkuriGuideRowMultiHtml(
      avatarTanuHtml,
      "\u3086\u3063\u304F\u308A\u305F\u306C\u59C9",
      TANU_PARAS,
      false
    );
    const accordions = [
      conceptReadMoreHtml("\u306D\u3089\u3044\u30FB\u540D\u524D\u30FB\u52D5\u54E1\u3061\u3083\u308C\u3093\u3058\u3068\u306E\u95A2\u4FC2", CONCEPT_READ_MORE_1_BODY),
      conceptReadMoreHtml("\u3086\u3063\u304F\u308A\u308A\u3093\u304F\uFF1A\u5FDC\u63F4\u30ED\u30B0\u3068\u53EF\u8996\u5316", rinkRow),
      conceptReadMoreHtml("\u3086\u3063\u304F\u308A\u3053\u3093\u592A\uFF1A\u4E3B\u50AC\u306E\u300C\u898B\u3066\u3044\u308B\u300D\u3068\u71B1\u91CF", kontaRow),
      conceptReadMoreHtml("\u3086\u3063\u304F\u308A\u305F\u306C\u59C9\uFF1A\u6765\u5834\u30FB\u4F1A\u5834\u30FB\u5B9A\u7FA9\u306E\u8A71", tanuRow)
    ].join("");
    return `
      <section class="card yukkuri-guide-card" style="margin-top:12px;">
        <h2>${CONCEPT_H2}</h2>
        <p class="guide-lead">${CONCEPT_TEASER_LEAD}</p>
        ${accordions}
      </section>`;
  }
  function buildHtmlReportSaveGuideCardHtml(avatars) {
    const { avatarRinkHtml, avatarKontaHtml, avatarTanuHtml } = avatars;
    const rows = [
      yukkuriGuideRowHtml(
        avatarRinkHtml,
        "\u3086\u3063\u304F\u308A\u308A\u3093\u304F",
        "\u307E\u305A\u306F\u4E0A\u306E\u300C\u6982\u8981\u300D\u3067\u30BF\u30A4\u30C8\u30EB\u3068\u914D\u4FE1\u8005\u3092\u78BA\u8A8D\u3059\u308B\u306E\u3060\u3002\u691C\u7D22\u30DC\u30C3\u30AF\u30B9\u306B\u30AD\u30FC\u30EF\u30FC\u30C9\u3092\u5165\u308C\u308B\u3068\u3001\u3053\u306E\u30DA\u30FC\u30B8\u5168\u4F53\u304B\u3089\u7D5E\u308A\u8FBC\u3081\u308B\u306E\u3060\u3002",
        false
      ),
      yukkuriGuideRowHtml(
        avatarKontaHtml,
        "\u3086\u3063\u304F\u308A\u3053\u3093\u592A",
        "\u300C\u30B7\u30A7\u30A2\u30FB\u30D7\u30EC\u30D3\u30E5\u30FC\u5411\u3051\u300D\u306F\u3001LINE\u3084X\u3067\u30EA\u30F3\u30AF\u3092\u8CBC\u3063\u305F\u3068\u304D\u306B\u51FA\u3084\u3059\u3044\u30BF\u30A4\u30C8\u30EB\u3084\u8AAC\u660E\u6587\u306A\u306E\u3060\u3002\u7D30\u304B\u3044\u82F1\u8A9E\u306E\u30AD\u30FC\u540D\u306F\u6C17\u306B\u3057\u306A\u304F\u3066\u3088\u3044\u306E\u3060\u3002",
        true
      ),
      yukkuriGuideRowHtml(
        avatarTanuHtml,
        "\u3086\u3063\u304F\u308A\u305F\u306C\u59C9",
        "\u30A2\u30D7\u30EA\u9023\u643A\u7528\u306E\u9577\u3044\u30BF\u30B0\u3084 script \u306EURL\u306F\u3001\u4E0B\u306E\u6298\u308A\u305F\u305F\u307F\u306B\u307E\u3068\u3081\u3066\u3042\u308B\u306E\u3060\u3002\u8ABF\u3079\u3082\u306E\u3092\u3059\u308B\u3068\u304D\u4EE5\u5916\u306F\u958B\u304B\u306A\u304F\u3066\u5927\u4E08\u592B\u306A\u306E\u3060\u3002\u30BF\u30B0\u306E\u30C1\u30C3\u30D7\u306F\u4E0A\u306E\u6982\u8981\u3068\u540C\u3058\u3060\u304B\u3089\u3001\u8868\u3067\u306F\u4E8C\u5EA6\u51FA\u3055\u306A\u3044\u306E\u3060\u3002",
        false
      )
    ];
    return `
      <section class="card yukkuri-guide-card" style="margin-top:12px;">
        <h2>${SAVE_H2}</h2>
        <p class="guide-lead">${SAVE_LEAD}</p>
        <div class="yukkuri-guide">${rows.join("")}
        </div>
      </section>`;
  }

  // src/lib/watchAudienceCopy.js
  var BODY_TEXT = "\u6765\u5834\u8005\u6570\u306F\u3001\u914D\u4FE1\u30DA\u30FC\u30B8\u306B\u51FA\u3066\u3044\u308B\u7D2F\u8A08\uFF08\u516C\u5F0F\u306E\u30AB\u30A6\u30F3\u30C8\uFF09\u3067\u3059\u3002NicoDB\uFF08https://nicodb.net/\uFF09\u3068\u3082\u6BD4\u8F03\u3057\u3084\u3059\u3044\u5B9A\u7FA9\u3067\u3059\u3002\u63A8\u5B9A\u540C\u6642\u63A5\u7D9A\u306F\u30B3\u30E1\u30F3\u30C8\u306A\u3069\u304B\u3089\u3053\u306E\u62E1\u5F35\u304C\u51FA\u3057\u3066\u3044\u308B\u76EE\u5B89\u3067\u3001\u516C\u5F0F\u306E\u540C\u63A5\u8868\u793A\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002HTML\u30EC\u30DD\u30FC\u30C8\u306E\u300C\u6765\u5834\uFF08\u5FDC\u63F4\u30B3\u30E1\u30F3\u30C8\uFF09\u300D\u306F\u5225\u306E\u610F\u5473\u3067\u3059\u3002\u6570\u5B57\u306E\u66F4\u65B0\u306F\u6570\u5341\u79D2\u304A\u304D\u7A0B\u5EA6\u3067\u3059\u3002";
  var TITLE_TEXT = "\u7D2F\u8A08\u6765\u5834\u8005\u306F\u30DA\u30FC\u30B8\u306E\u516C\u5F0F\u30C7\u30FC\u30BF\u304B\u3089\u3001\u63A8\u5B9A\u540C\u6642\u63A5\u7D9A\u306F\u8A18\u9332\u3057\u305F\u30B3\u30E1\u30F3\u30C8\u306A\u3069\u304B\u3089\u8A08\u7B97\u3057\u3066\u3044\u307E\u3059\u3002\u8A73\u3057\u3044\u5F0F\u306FLP\u306E\u300C\u63A8\u5B9A\u540C\u6642\u63A5\u7D9A\u300D\u7BC0\u3092\u53C2\u7167\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
  function buildWatchAudienceNote({ snapshot }) {
    void snapshot;
    return {
      body: BODY_TEXT,
      title: TITLE_TEXT
    };
  }

  // src/lib/commentIngestLog.js
  var COMMENT_INGEST_LOG_VERSION = 1;
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
      const liveId = String(it.liveId || "").trim().toLowerCase();
      if (!liveId) continue;
      const source = String(it.source || "unknown").slice(0, 32);
      const batchIn = Math.max(0, Math.floor(Number(it.batchIn) || 0));
      const added = Math.max(0, Math.floor(Number(it.added) || 0));
      const totalAfter = Math.max(0, Math.floor(Number(it.totalAfter) || 0));
      let official = null;
      if (it.official != null && Number.isFinite(Number(it.official))) {
        const oc = Math.floor(Number(it.official));
        official = oc >= 0 ? oc : null;
      }
      out.push({ t, liveId, source, batchIn, added, totalAfter, official });
    }
    return { v, items: out };
  }

  // src/lib/devMonitorDebugSubset.js
  function pickDevMonitorDebugSubset(raw) {
    if (!raw || typeof raw !== "object") return {};
    const o = (
      /** @type {Record<string, unknown>} */
      raw
    );
    return {
      wsViewerCount: o.wsViewerCount,
      wsCommentCount: o.wsCommentCount,
      wsAge: o.wsAge,
      intercept: o.intercept,
      harvestPipeline: o.harvestPipeline,
      embeddedVC: o.embeddedVC,
      programBeginAtMs: o.programBeginAtMs,
      embeddedBeginAt: o.embeddedBeginAt,
      edProgramKeys: o.edProgramKeys,
      poll: o.poll,
      dom: o.dom,
      pi: o.pi,
      piEnq: o.piEnq,
      piPost: o.piPost,
      piWs: o.piWs,
      piFetch: o.piFetch,
      piXhr: o.piXhr,
      piPhase: o.piPhase,
      fbScans: o.fbScans,
      fbFound: o.fbFound,
      fbRows: o.fbRows,
      fbProbe: o.fbProbe,
      fbStep: o.fbStep,
      fbAttempts: o.fbAttempts,
      fbErr: o.fbErr,
      fetchLog: o.fetchLog,
      fetchOther: o.fetchOther,
      ndgr: o.ndgr,
      ndgrLdStream: o.ndgrLdStream,
      commentTypeVisibleSample: o.commentTypeVisibleSample
    };
  }

  // src/lib/devMonitorAvatarStats.js
  function summarizeStoredCommentProfileGaps(entries) {
    const empty = {
      numericUidWithHttpAvatar: 0,
      numericUidWithoutHttpAvatar: 0,
      anonStyleUidWithHttpAvatar: 0,
      anonStyleUidWithoutHttpAvatar: 0,
      numericWithNickname: 0,
      numericWithoutNickname: 0,
      anonWithNickname: 0,
      anonWithoutNickname: 0
    };
    if (!Array.isArray(entries)) return empty;
    let numericUidWithHttpAvatar = 0;
    let numericUidWithoutHttpAvatar = 0;
    let anonStyleUidWithHttpAvatar = 0;
    let anonStyleUidWithoutHttpAvatar = 0;
    let numericWithNickname = 0;
    let numericWithoutNickname = 0;
    let anonWithNickname = 0;
    let anonWithoutNickname = 0;
    for (const e of entries) {
      const uid = String(e?.userId ?? "").trim();
      if (!uid) continue;
      const av = String(e?.avatarUrl || "").trim();
      const http = isHttpOrHttpsUrl(av);
      const nick = String(e?.nickname ?? "").trim();
      const hasNick = Boolean(nick);
      const numeric = /^\d{5,14}$/.test(uid);
      if (numeric) {
        if (http) numericUidWithHttpAvatar += 1;
        else numericUidWithoutHttpAvatar += 1;
        if (hasNick) numericWithNickname += 1;
        else numericWithoutNickname += 1;
      } else if (isAnonymousStyleNicoUserId(uid)) {
        if (http) anonStyleUidWithHttpAvatar += 1;
        else anonStyleUidWithoutHttpAvatar += 1;
        if (hasNick) anonWithNickname += 1;
        else anonWithoutNickname += 1;
      }
    }
    return {
      numericUidWithHttpAvatar,
      numericUidWithoutHttpAvatar,
      anonStyleUidWithHttpAvatar,
      anonStyleUidWithoutHttpAvatar,
      numericWithNickname,
      numericWithoutNickname,
      anonWithNickname,
      anonWithoutNickname
    };
  }
  function summarizeStoredCommentAvatarStats(entries) {
    const empty = {
      total: 0,
      withHttpAvatar: 0,
      withoutHttpAvatar: 0,
      syntheticDefaultAvatar: 0,
      numericUserId: 0,
      nonNumericUserId: 0,
      missingUserId: 0,
      withNickname: 0,
      withoutNickname: 0
    };
    if (!Array.isArray(entries)) return empty;
    let withHttpAvatar = 0;
    let withoutHttpAvatar = 0;
    let syntheticDefaultAvatar = 0;
    let numericUserId = 0;
    let nonNumericUserId = 0;
    let missingUserId = 0;
    let withNickname = 0;
    let withoutNickname = 0;
    for (const e of entries) {
      const av = String(e?.avatarUrl || "").trim();
      const uid = String(e?.userId ?? "").trim();
      const nick = String(e?.nickname ?? "").trim();
      if (nick) withNickname += 1;
      else withoutNickname += 1;
      const http = isHttpOrHttpsUrl(av);
      if (http) {
        withHttpAvatar += 1;
        if (/^\d{5,14}$/.test(uid) && isNiconicoSyntheticDefaultUserIconUrl(av, uid)) {
          syntheticDefaultAvatar += 1;
        }
      } else {
        withoutHttpAvatar += 1;
      }
      if (!uid) missingUserId += 1;
      else if (/^\d{5,14}$/.test(uid)) numericUserId += 1;
      else nonNumericUserId += 1;
    }
    return {
      total: entries.length,
      withHttpAvatar,
      withoutHttpAvatar,
      syntheticDefaultAvatar,
      numericUserId,
      nonNumericUserId,
      missingUserId,
      withNickname,
      withoutNickname
    };
  }

  // src/lib/devMonitorTrendSession.js
  var STORAGE_PREFIX = "nl-dev-monitor-trend:";
  var MAX_SESSION_POINTS = 24;
  var MAX_PERSISTED_POINTS = 250;
  var MAX_AGE_MS = 7 * 24 * 60 * 60 * 1e3;
  var TREND_CHROME_PERSIST_MIN_MS = 3e4;
  var TREND_SESSION_APPEND_MIN_MS = 12e3;
  var _lastChromeTrendPersistMs = /* @__PURE__ */ new Map();
  var _lastSessionTrendAppendMs = /* @__PURE__ */ new Map();
  function trendMetricsEqual(a, b) {
    if (!a || !b) return false;
    if (a.thumb !== b.thumb || a.idPct !== b.idPct || a.nick !== b.nick || a.comment !== b.comment) {
      return false;
    }
    if (a.displayCount !== b.displayCount) return false;
    if (a.storageCount !== b.storageCount) return false;
    return true;
  }
  function latestTrendPointByTime(points) {
    if (!Array.isArray(points) || !points.length) return null;
    let best = null;
    for (const p of points) {
      if (!p || typeof p.t !== "number" || !Number.isFinite(p.t)) continue;
      if (!best || p.t >= best.t) best = p;
    }
    return best;
  }
  function sessionKeyFor(liveId) {
    return `${STORAGE_PREFIX}${String(liveId || "").trim() || "_"}`;
  }
  function parseTrendJsonArray(raw) {
    if (typeof raw !== "string" || !raw) return [];
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p.filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  function trimTrendByAgeAndCap(points, maxPoints, maxAgeMs, nowMs) {
    const cutoff = nowMs - maxAgeMs;
    const fresh = points.filter(
      (pt) => pt && typeof pt.t === "number" && Number.isFinite(pt.t) && pt.t >= cutoff
    );
    fresh.sort((a, b) => a.t - b.t);
    const byT = /* @__PURE__ */ new Map();
    for (const pt of fresh) {
      byT.set(pt.t, pt);
    }
    const deduped = Array.from(byT.values()).sort((a, b) => a.t - b.t);
    return deduped.slice(-maxPoints);
  }
  function mergeTrendArrays(a, b) {
    return trimTrendByAgeAndCap(
      [...a, ...b],
      MAX_PERSISTED_POINTS,
      MAX_AGE_MS,
      Date.now()
    );
  }
  function readTrendSeries(win, liveId) {
    try {
      const raw = win.sessionStorage.getItem(sessionKeyFor(liveId));
      return parseTrendJsonArray(raw);
    } catch {
      return [];
    }
  }
  function appendTrendPoint(win, liveId, sample) {
    const lid = String(liveId || "").trim();
    if (!lid) return;
    const now0 = Date.now();
    const lastS = _lastSessionTrendAppendMs.get(lid) || 0;
    if (now0 - lastS < TREND_SESSION_APPEND_MIN_MS) return;
    const prev = readTrendSeries(win, lid);
    const comm = sample.commentPct != null && Number.isFinite(sample.commentPct) ? Math.max(0, Math.min(100, sample.commentPct)) : null;
    const now = now0;
    const pt = {
      t: now,
      thumb: Math.max(0, Math.min(100, sample.thumb)),
      idPct: Math.max(0, Math.min(100, sample.idPct)),
      nick: Math.max(0, Math.min(100, sample.nick)),
      comment: comm
    };
    if (typeof sample.displayCount === "number" && Number.isFinite(sample.displayCount)) {
      pt.displayCount = Math.max(0, Math.floor(sample.displayCount));
    }
    if (typeof sample.storageCount === "number" && Number.isFinite(sample.storageCount)) {
      pt.storageCount = Math.max(0, Math.floor(sample.storageCount));
    }
    const lastSess = latestTrendPointByTime(prev);
    if (lastSess && trendMetricsEqual(lastSess, pt)) {
      _lastSessionTrendAppendMs.set(lid, now);
      return;
    }
    const next = trimTrendByAgeAndCap(
      [...prev, pt],
      MAX_SESSION_POINTS,
      MAX_AGE_MS,
      now
    );
    try {
      win.sessionStorage.setItem(sessionKeyFor(lid), JSON.stringify(next));
      _lastSessionTrendAppendMs.set(lid, now);
    } catch {
    }
  }
  async function persistTrendPointChrome(liveId, sample) {
    const lid = String(liveId || "").trim();
    if (!lid) return;
    const nowWall = Date.now();
    const lastC = _lastChromeTrendPersistMs.get(lid) || 0;
    if (nowWall - lastC < TREND_CHROME_PERSIST_MIN_MS) return;
    const key = devMonitorTrendStorageKey(lid);
    const chromeObj = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local ? chrome.storage.local : null;
    if (!chromeObj) return;
    const comm = sample.commentPct != null && Number.isFinite(sample.commentPct) ? Math.max(0, Math.min(100, sample.commentPct)) : null;
    const now = Date.now();
    const pt = {
      t: now,
      thumb: Math.max(0, Math.min(100, sample.thumb)),
      idPct: Math.max(0, Math.min(100, sample.idPct)),
      nick: Math.max(0, Math.min(100, sample.nick)),
      comment: comm
    };
    if (typeof sample.displayCount === "number" && Number.isFinite(sample.displayCount)) {
      pt.displayCount = Math.max(0, Math.floor(sample.displayCount));
    }
    if (typeof sample.storageCount === "number" && Number.isFinite(sample.storageCount)) {
      pt.storageCount = Math.max(0, Math.floor(sample.storageCount));
    }
    const bag = await new Promise((resolve) => {
      try {
        chromeObj.get(key, (r) => resolve(r && typeof r === "object" ? r : {}));
      } catch {
        resolve({});
      }
    });
    const prev = parseTrendJsonArray(bag[key]);
    const lastPersisted = latestTrendPointByTime(prev);
    if (lastPersisted && trendMetricsEqual(lastPersisted, pt)) {
      _lastChromeTrendPersistMs.set(lid, Date.now());
      return;
    }
    const merged = trimTrendByAgeAndCap(
      [...prev, pt],
      MAX_PERSISTED_POINTS,
      MAX_AGE_MS,
      now
    );
    await new Promise((resolve) => {
      try {
        chromeObj.set({ [key]: JSON.stringify(merged) }, () => resolve(void 0));
      } catch {
        resolve(void 0);
      }
    });
    _lastChromeTrendPersistMs.set(lid, Date.now());
  }
  async function readMergedTrendSeries(win, liveId) {
    const lid = String(liveId || "").trim();
    if (!lid) return [];
    const sess = readTrendSeries(win, lid);
    const chromeObj = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local ? chrome.storage.local : null;
    if (!chromeObj) return mergeTrendArrays(sess, []);
    const key = devMonitorTrendStorageKey(lid);
    const bag = await new Promise((resolve) => {
      try {
        chromeObj.get(key, (r) => resolve(r && typeof r === "object" ? r : {}));
      } catch {
        resolve({});
      }
    });
    const persisted = parseTrendJsonArray(bag[key]);
    return mergeTrendArrays(sess, persisted);
  }
  function trendToSparklineArrays(points) {
    return {
      thumbSeries: points.map((p) => p.thumb),
      idSeries: points.map((p) => p.idPct),
      nickSeries: points.map((p) => p.nick),
      commentSeries: points.map(
        (p) => p.comment != null && Number.isFinite(p.comment) ? p.comment : null
      ),
      displaySeries: points.map(
        (p) => typeof p.displayCount === "number" ? p.displayCount : 0
      ),
      storageSeries: points.map(
        (p) => typeof p.storageCount === "number" ? p.storageCount : 0
      )
    };
  }
  function trendHasCountSamples(points) {
    return points.some(
      (p) => typeof p.displayCount === "number" && p.displayCount >= 0 || typeof p.storageCount === "number" && p.storageCount >= 0
    );
  }

  // src/lib/marketingAggregate.js
  function aggregateMarketingReport(comments, liveId) {
    const filtered = comments.filter(
      (c) => c.liveId === liveId && c.text && c.text.trim()
    );
    const userMap = /* @__PURE__ */ new Map();
    const timestamps = [];
    for (const c of filtered) {
      const uid = c.userId || `anon:${(c.commentNo || c.id || "").slice(0, 12)}`;
      const t = c.capturedAt || 0;
      timestamps.push(t);
      const existing = userMap.get(uid);
      if (existing) {
        existing.count++;
        if (!existing.nickname && c.nickname) existing.nickname = c.nickname;
        if (!existing.avatarUrl && c.avatarUrl) existing.avatarUrl = c.avatarUrl;
        if (t < existing.firstAt) existing.firstAt = t;
        if (t > existing.lastAt) existing.lastAt = t;
      } else {
        userMap.set(uid, {
          userId: uid,
          nickname: c.nickname || "",
          avatarUrl: c.avatarUrl || "",
          count: 1,
          firstAt: t,
          lastAt: t
        });
      }
    }
    const users = [...userMap.values()];
    users.sort((a, b) => b.count - a.count);
    const counts = users.map((u) => u.count).sort((a, b) => a - b);
    const median = counts.length === 0 ? 0 : counts.length % 2 === 1 ? counts[Math.floor(counts.length / 2)] : (counts[counts.length / 2 - 1] + counts[counts.length / 2]) / 2;
    const minT = timestamps.length ? Math.min(...timestamps) : 0;
    const maxT = timestamps.length ? Math.max(...timestamps) : 0;
    const durationMs = maxT - minT;
    const durationMinutes = Math.max(1, Math.round(durationMs / 6e4));
    const bucketMap = /* @__PURE__ */ new Map();
    for (const c of filtered) {
      const t = c.capturedAt || 0;
      const minute = Math.floor((t - minT) / 6e4);
      const uid = c.userId || `anon:${(c.commentNo || "").slice(0, 12)}`;
      let b = bucketMap.get(minute);
      if (!b) {
        b = { count: 0, uids: /* @__PURE__ */ new Set() };
        bucketMap.set(minute, b);
      }
      b.count++;
      b.uids.add(uid);
    }
    const timeline = [];
    let peakMinute = 0;
    let peakMinuteCount = 0;
    for (let m = 0; m <= durationMinutes; m++) {
      const b = bucketMap.get(m);
      const count = b ? b.count : 0;
      const uniqueUsers = b ? b.uids.size : 0;
      timeline.push({ minute: m, count, uniqueUsers });
      if (count > peakMinuteCount) {
        peakMinute = m;
        peakMinuteCount = count;
      }
    }
    const heavy = users.filter((u) => u.count >= 10).length;
    const mid = users.filter((u) => u.count >= 4 && u.count < 10).length;
    const light = users.filter((u) => u.count >= 2 && u.count < 4).length;
    const once = users.filter((u) => u.count === 1).length;
    const total = Math.max(1, users.length);
    const hourDistribution = new Array(24).fill(0);
    for (const t of timestamps) {
      const h = new Date(t).getHours();
      hourDistribution[h]++;
    }
    return {
      liveId,
      totalComments: filtered.length,
      uniqueUsers: users.length,
      avgCommentsPerUser: users.length > 0 ? Math.round(filtered.length / users.length * 10) / 10 : 0,
      medianCommentsPerUser: median,
      peakMinute,
      peakMinuteCount,
      durationMinutes,
      commentsPerMinute: Math.round(filtered.length / durationMinutes * 10) / 10,
      topUsers: users.slice(0, 30),
      timeline,
      segmentCounts: { heavy, mid, light, once },
      segmentPcts: {
        heavy: Math.round(heavy / total * 1e3) / 10,
        mid: Math.round(mid / total * 1e3) / 10,
        light: Math.round(light / total * 1e3) / 10,
        once: Math.round(once / total * 1e3) / 10
      },
      hourDistribution
    };
  }

  // src/lib/marketingChartsHtml.js
  function buildMarketingDashboardHtml(r) {
    return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>\u914D\u4FE1\u30DE\u30FC\u30B1\u5206\u6790 \u2014 ${escapeHtml(r.liveId)}</title>
<style>${CSS_BODY}</style>
</head>
<body>
<header class="mkt-header">
<h1 class="mkt-header__title">\u{1F4CA} \u914D\u4FE1\u30DE\u30FC\u30B1\u30C6\u30A3\u30F3\u30B0\u5206\u6790</h1>
<p class="mkt-header__sub">${escapeHtml(r.liveId)} \u2014 ${(/* @__PURE__ */ new Date()).toLocaleString("ja-JP")} \u51FA\u529B</p>
</header>
<main class="mkt-main">
${sectionKpi(r)}
${sectionTimeline(r)}
${sectionSegment(r)}
${sectionTopUsers(r)}
${sectionHourHeatmap(r)}
</main>
<footer class="mkt-footer">nicolivelog marketing analytics \u2014 generated at ${(/* @__PURE__ */ new Date()).toISOString()}</footer>
</body></html>`;
  }
  function sectionKpi(r) {
    const cards = [
      { label: "\u7DCF\u30B3\u30E1\u30F3\u30C8\u6570", value: r.totalComments.toLocaleString(), icon: "\u{1F4AC}" },
      { label: "\u30E6\u30CB\u30FC\u30AF\u30E6\u30FC\u30B6\u30FC", value: r.uniqueUsers.toLocaleString(), icon: "\u{1F465}" },
      { label: "\u30B3\u30E1\u30F3\u30C8/\u5206", value: String(r.commentsPerMinute), icon: "\u26A1" },
      { label: "\u5E73\u5747\u30B3\u30E1\u30F3\u30C8/\u4EBA", value: String(r.avgCommentsPerUser), icon: "\u{1F4C8}" },
      { label: "\u4E2D\u592E\u5024/\u4EBA", value: String(r.medianCommentsPerUser), icon: "\u{1F4CA}" },
      { label: "\u914D\u4FE1\u6642\u9593", value: `${r.durationMinutes} \u5206`, icon: "\u23F1\uFE0F" },
      { label: "\u30D4\u30FC\u30AF\u5206", value: `${r.peakMinute} \u5206\u76EE\uFF08${r.peakMinuteCount} \u30B3\u30E1\uFF09`, icon: "\u{1F525}" }
    ];
    const inner = cards.map(
      (c) => `<div class="mkt-kpi"><span class="mkt-kpi__icon">${c.icon}</span><span class="mkt-kpi__val">${escapeHtml(c.value)}</span><span class="mkt-kpi__label">${escapeHtml(c.label)}</span></div>`
    ).join("");
    return `<section class="mkt-section"><h2>KPI \u30B5\u30DE\u30EA</h2><div class="mkt-kpi-grid">${inner}</div></section>`;
  }
  function sectionTimeline(r) {
    const tl = r.timeline;
    if (tl.length < 2) return "";
    const maxC = Math.max(1, ...tl.map((b) => b.count));
    const maxU = Math.max(1, ...tl.map((b) => b.uniqueUsers));
    const W = 900;
    const H = 220;
    const pad = 40;
    const innerW = W - pad * 2;
    const innerH = H - pad * 2;
    const n = tl.length;
    const barW = Math.max(1, Math.min(8, innerW / n - 1));
    const bars = tl.map((b, i) => {
      const x = pad + innerW * i / n;
      const h = b.count / maxC * innerH;
      return `<rect x="${x.toFixed(1)}" y="${(pad + innerH - h).toFixed(1)}" width="${barW}" height="${h.toFixed(1)}" fill="#3b82f6" opacity="0.6"><title>${b.minute}\u5206: ${b.count}\u30B3\u30E1 / ${b.uniqueUsers}\u4EBA</title></rect>`;
    }).join("");
    const linePts = tl.map((b, i) => {
      const x = pad + innerW * i / n + barW / 2;
      const y = pad + innerH - b.uniqueUsers / maxU * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const yLabelsC = Array.from({ length: 5 }, (_, i) => {
      const v = Math.round(maxC * (4 - i) / 4);
      const y = pad + innerH * i / 4;
      return `<text x="${pad - 4}" y="${y + 4}" text-anchor="end" class="mkt-axis">${v}</text>`;
    }).join("");
    const xLabels = tl.filter((_, i) => i % Math.max(1, Math.floor(n / 10)) === 0).map((b) => {
      const x = pad + innerW * b.minute / n + barW / 2;
      return `<text x="${x.toFixed(1)}" y="${H - 4}" text-anchor="middle" class="mkt-axis">${b.minute}m</text>`;
    }).join("");
    return `<section class="mkt-section">
<h2>\u30B3\u30E1\u30F3\u30C8\u30BF\u30A4\u30E0\u30E9\u30A4\u30F3</h2>
<p class="mkt-note">\u9752\u30D0\u30FC\uFF1D\u30B3\u30E1\u30F3\u30C8\u6570/\u5206 / \u30AA\u30EC\u30F3\u30B8\u7DDA\uFF1D\u30E6\u30CB\u30FC\u30AF\u30E6\u30FC\u30B6\u30FC\u6570/\u5206</p>
<div class="mkt-chart-wrap">
<svg viewBox="0 0 ${W} ${H}" class="mkt-svg">
<rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="none" stroke="#334155" stroke-width="0.5"/>
${yLabelsC}${xLabels}${bars}
<polyline points="${linePts}" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round"/>
</svg>
</div></section>`;
  }
  function sectionSegment(r) {
    const s = r.segmentCounts;
    const total = Math.max(1, s.heavy + s.mid + s.light + s.once);
    const segs = [
      { label: "\u30D8\u30D3\u30FC\uFF0810+\uFF09", count: s.heavy, color: "#ef4444" },
      { label: "\u30DF\u30C9\u30EB\uFF084-9\uFF09", count: s.mid, color: "#f97316" },
      { label: "\u30E9\u30A4\u30C8\uFF082-3\uFF09", count: s.light, color: "#3b82f6" },
      { label: "\u4E00\u898B\uFF081\uFF09", count: s.once, color: "#94a3b8" }
    ];
    const R = 80;
    const cx = 100;
    const cy = 100;
    let cumAngle = -Math.PI / 2;
    const paths = segs.map((sg) => {
      const pct = sg.count / total;
      if (pct <= 0) return "";
      const angle = pct * 2 * Math.PI;
      const x1 = cx + R * Math.cos(cumAngle);
      const y1 = cy + R * Math.sin(cumAngle);
      cumAngle += angle;
      const x2 = cx + R * Math.cos(cumAngle);
      const y2 = cy + R * Math.sin(cumAngle);
      const large = angle > Math.PI ? 1 : 0;
      return `<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${sg.color}"><title>${sg.label}: ${sg.count}\u4EBA (${(pct * 100).toFixed(1)}%)</title></path>`;
    }).join("");
    const legend = segs.map(
      (sg) => `<span class="mkt-leg"><span class="mkt-leg__dot" style="background:${sg.color}"></span>${escapeHtml(sg.label)} ${sg.count}\u4EBA</span>`
    ).join("");
    return `<section class="mkt-section">
<h2>\u30E6\u30FC\u30B6\u30FC\u30BB\u30B0\u30E1\u30F3\u30C8</h2>
<p class="mkt-note">\u30B3\u30E1\u30F3\u30C8\u56DE\u6570\u3067\u30E6\u30FC\u30B6\u30FC\u30924\u5C64\u306B\u5206\u985E</p>
<div class="mkt-seg-wrap">
<svg viewBox="0 0 200 200" class="mkt-pie">${paths}</svg>
<div class="mkt-seg-legend">${legend}</div>
</div></section>`;
  }
  function sectionTopUsers(r) {
    if (r.topUsers.length === 0) return "";
    const maxCount = r.topUsers[0].count;
    const rows = r.topUsers.slice(0, 20).map((u, i) => {
      const pct = u.count / Math.max(1, maxCount) * 100;
      const avImg = u.avatarUrl ? `<img src="${escapeHtml(u.avatarUrl)}" class="mkt-rank-av" alt="" loading="lazy">` : '<span class="mkt-rank-av mkt-rank-av--empty"></span>';
      const name = u.nickname || u.userId || "\u2014";
      return `<tr>
<td class="mkt-rank-n">${i + 1}</td>
<td>${avImg}</td>
<td class="mkt-rank-name">${escapeHtml(name)}</td>
<td class="mkt-rank-bar"><div class="mkt-rank-bar__fill" style="width:${pct.toFixed(1)}%"></div><span class="mkt-rank-bar__label">${u.count}</span></td>
</tr>`;
    }).join("");
    return `<section class="mkt-section">
<h2>\u30C8\u30C3\u30D7\u30B3\u30E1\u30F3\u30BF\u30FC TOP 20</h2>
<table class="mkt-rank-table"><tbody>${rows}</tbody></table>
</section>`;
  }
  function sectionHourHeatmap(r) {
    const max = Math.max(1, ...r.hourDistribution);
    const cells = r.hourDistribution.map((v, h) => {
      const intensity = v / max;
      const alpha = Math.max(0.08, intensity);
      return `<div class="mkt-hour" style="background:rgba(59,130,246,${alpha.toFixed(2)})" title="${h}\u6642: ${v}\u4EF6"><span class="mkt-hour__label">${h}</span><span class="mkt-hour__val">${v}</span></div>`;
    }).join("");
    return `<section class="mkt-section">
<h2>\u6642\u9593\u5E2F\u30D2\u30FC\u30C8\u30DE\u30C3\u30D7</h2>
<p class="mkt-note">\u30B3\u30E1\u30F3\u30C8\u304C\u591A\u3044\u6642\u9593\u5E2F\u307B\u3069\u6FC3\u3044\u9752</p>
<div class="mkt-hour-grid">${cells}</div>
</section>`;
  }
  var CSS_BODY = `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;font-family:'Segoe UI','Hiragino Sans',sans-serif;background:#0f172a;color:#e2e8f0;line-height:1.6}
.mkt-header{padding:2rem 1.5rem 1rem;background:linear-gradient(135deg,#1e293b,#0f172a);border-bottom:1px solid #334155}
.mkt-header__title{margin:0;font-size:1.6rem;font-weight:700}
.mkt-header__sub{margin:.3rem 0 0;font-size:.85rem;color:#94a3b8}
.mkt-main{max-width:960px;margin:0 auto;padding:1.5rem 1rem}
.mkt-section{background:#1e293b;border-radius:12px;padding:1.2rem 1.4rem;margin-bottom:1.2rem;border:1px solid #334155}
.mkt-section h2{margin:0 0 .8rem;font-size:1.1rem;color:#f8fafc;border-left:4px solid #3b82f6;padding-left:.6rem}
.mkt-note{font-size:.78rem;color:#94a3b8;margin:0 0 .6rem}
.mkt-kpi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.8rem}
.mkt-kpi{background:#0f172a;border-radius:10px;padding:.8rem;text-align:center;border:1px solid #334155}
.mkt-kpi__icon{font-size:1.4rem;display:block}
.mkt-kpi__val{font-size:1.3rem;font-weight:700;display:block;color:#f8fafc}
.mkt-kpi__label{font-size:.72rem;color:#94a3b8}
.mkt-chart-wrap{overflow-x:auto}
.mkt-svg{width:100%;height:auto;max-height:260px}
.mkt-axis{font-size:10px;fill:#94a3b8}
.mkt-seg-wrap{display:flex;align-items:center;gap:2rem;flex-wrap:wrap}
.mkt-pie{width:180px;height:180px;flex-shrink:0}
.mkt-seg-legend{display:flex;flex-direction:column;gap:.5rem}
.mkt-leg{display:flex;align-items:center;gap:.4rem;font-size:.85rem}
.mkt-leg__dot{width:12px;height:12px;border-radius:3px;flex-shrink:0}
.mkt-rank-table{width:100%;border-collapse:collapse}
.mkt-rank-table td{padding:.35rem .4rem;border-bottom:1px solid #1e293b}
.mkt-rank-n{width:2rem;color:#64748b;text-align:right;font-size:.8rem}
.mkt-rank-av{width:28px;height:28px;border-radius:50%;object-fit:cover;display:block}
.mkt-rank-av--empty{background:#334155}
.mkt-rank-name{font-size:.85rem;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mkt-rank-bar{position:relative;height:22px;background:#0f172a;border-radius:4px;overflow:hidden}
.mkt-rank-bar__fill{height:100%;background:linear-gradient(90deg,#3b82f6,#6366f1);border-radius:4px}
.mkt-rank-bar__label{position:absolute;right:6px;top:2px;font-size:.75rem;color:#f8fafc;font-weight:600}
.mkt-hour-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:4px}
.mkt-hour{border-radius:6px;text-align:center;padding:.5rem .2rem;min-height:52px;display:flex;flex-direction:column;justify-content:center;border:1px solid #334155}
.mkt-hour__label{font-size:.7rem;color:#94a3b8}
.mkt-hour__val{font-size:.9rem;font-weight:600}
.mkt-footer{text-align:center;padding:1.5rem;font-size:.72rem;color:#475569}
@media(max-width:640px){
  .mkt-kpi-grid{grid-template-columns:repeat(2,1fr)}
  .mkt-hour-grid{grid-template-columns:repeat(6,1fr)}
  .mkt-seg-wrap{flex-direction:column;align-items:flex-start}
}
`;

  // src/lib/devMonitorViz.js
  function officialVsRecordedBarState(p) {
    const d = Math.max(0, Math.floor(Number(p.displayCount) || 0));
    const o = p.officialCount != null && Number.isFinite(p.officialCount) && p.officialCount > 0 ? Math.max(0, Math.floor(Number(p.officialCount))) : null;
    if (o == null) {
      return {
        fillPct: d > 0 ? 100 : 0,
        ratioLabel: d > 0 ? `\u8A18\u9332 ${d} \u4EF6\uFF08\u516C\u5F0F\u4EF6\u6570\u306A\u3057\uFF09` : "\u8A18\u9332 0",
        tone: "neutral"
      };
    }
    const fill = Math.min(100, d / o * 100);
    const tone = fill >= 95 ? "ok" : fill >= 80 ? "warn" : d === 0 && o > 0 ? "bad" : "bad";
    return {
      fillPct: fill,
      ratioLabel: `${d} / ${o}\uFF08${fill.toFixed(1)}%\uFF09`,
      tone
    };
  }
  function profileGapBarSeries(gaps) {
    const rows = [
      {
        label: "\u6570\u5B57ID\u30FB\u30A2\u30A4\u30B3\u30F3\u3042\u308A",
        n: gaps.numericUidWithHttpAvatar,
        tone: "g1"
      },
      {
        label: "\u6570\u5B57ID\u30FB\u30A2\u30A4\u30B3\u30F3\u306A\u3057",
        n: gaps.numericUidWithoutHttpAvatar,
        tone: "g2"
      },
      {
        label: "\u533F\u540D\u98A8ID\u30FB\u30A2\u30A4\u30B3\u30F3\u3042\u308A",
        n: gaps.anonStyleUidWithHttpAvatar,
        tone: "g3"
      },
      {
        label: "\u533F\u540D\u98A8ID\u30FB\u30A2\u30A4\u30B3\u30F3\u306A\u3057",
        n: gaps.anonStyleUidWithoutHttpAvatar,
        tone: "g4"
      },
      { label: "\u6570\u5B57ID\u30FB\u540D\u524D\u3042\u308A", n: gaps.numericWithNickname, tone: "g5" },
      { label: "\u6570\u5B57ID\u30FB\u540D\u524D\u306A\u3057", n: gaps.numericWithoutNickname, tone: "g6" },
      { label: "\u533F\u540D\u98A8\u30FB\u540D\u524D\u3042\u308A", n: gaps.anonWithNickname, tone: "g7" },
      { label: "\u533F\u540D\u98A8\u30FB\u540D\u524D\u306A\u3057", n: gaps.anonWithoutNickname, tone: "g8" }
    ];
    const maxN = Math.max(1, ...rows.map((r) => r.n));
    return rows.map((r) => ({
      label: r.label,
      count: r.n,
      pct: r.n / maxN * 100,
      tone: r.tone
    }));
  }
  function commentTypeDistribution(sample) {
    if (!sample || typeof sample !== "object") return [];
    const m = {};
    for (const [k, v] of Object.entries(sample)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) m[k] = n;
    }
    const total = Object.values(m).reduce((a, b) => a + b, 0);
    if (total <= 0) return [];
    return Object.entries(m).map(([key, count]) => ({
      key,
      count,
      pct: count / total * 100
    })).sort((a, b) => b.count - a.count);
  }
  var WS_STALE_MS = 12e4;
  function wsStalenessState(wsAgeMs) {
    if (!Number.isFinite(wsAgeMs) || wsAgeMs < 0) {
      return { freshnessPct: 0, label: "\u2014", tone: "bad" };
    }
    const freshnessPct = Math.max(0, Math.min(100, 100 - wsAgeMs / WS_STALE_MS * 100));
    const tone = freshnessPct >= 70 ? "ok" : freshnessPct >= 35 ? "warn" : "bad";
    const label = `${Math.round(wsAgeMs)} ms`;
    return { freshnessPct, label, tone };
  }
  function htmlOfficialVsRecordedBar(st) {
    const toneClass = st.tone === "ok" ? "nl-viz-bar__fill--ok" : st.tone === "warn" ? "nl-viz-bar__fill--warn" : st.tone === "bad" ? "nl-viz-bar__fill--bad" : "nl-viz-bar__fill--neutral";
    return `<section class="nl-viz-block" aria-label="\u8A18\u9332\u4EF6\u6570\u3068\u516C\u5F0F\u30B3\u30E1\u30F3\u30C8\u6570\u306E\u6BD4\u8F03"><h4 class="nl-viz-block__title">\u8A18\u9332\u4EF6\u6570\u3068\u516C\u5F0F\u30B3\u30E1\u30F3\u30C8\u6570\uFF08\u68D2\u30B0\u30E9\u30D5\uFF09</h4><div class="nl-viz-bar nl-viz-bar--tall"><div class="nl-viz-bar__track"><div class="nl-viz-bar__fill ${toneClass}" style="width:${Math.min(100, st.fillPct).toFixed(2)}%"></div></div><p class="nl-viz-block__caption">${escapeHtml(st.ratioLabel)}</p></div></section>`;
  }
  function htmlCaptureRatioBar(ratio) {
    if (ratio == null || !Number.isFinite(ratio)) return "";
    const pct = Math.max(0, Math.min(100, ratio * 100));
    const toneClass = pct >= 70 ? "nl-viz-bar__fill--ok" : pct >= 40 ? "nl-viz-bar__fill--warn" : "nl-viz-bar__fill--bad";
    return `<section class="nl-viz-block" aria-label="\u30AD\u30E3\u30D7\u30C1\u30E3\u7387"><h4 class="nl-viz-block__title">\u516C\u5F0F\u7D71\u8A08\u304B\u3089\u898B\u305F\u30B3\u30E1\u30F3\u30C8\u30AD\u30E3\u30D7\u30C1\u30E3\u7387\uFF08\u53C2\u8003\uFF09</h4><div class="nl-viz-bar nl-viz-bar--tall"><div class="nl-viz-bar__track"><div class="nl-viz-bar__fill ${toneClass}" style="width:${pct.toFixed(2)}%"></div></div><p class="nl-viz-block__caption">${escapeHtml(`${pct.toFixed(1)}%`)}</p></div></section>`;
  }
  function htmlProfileGapBars(series) {
    if (!series.length) return "";
    const rows = series.map(
      (s) => `<div class="nl-viz-mini-row"><span class="nl-viz-mini-row__label">${escapeHtml(s.label)}</span><div class="nl-viz-mini-row__track"><div class="nl-viz-mini-row__fill nl-viz-mini-row__fill--${s.tone}" style="width:${Math.min(100, s.pct).toFixed(2)}%"></div></div><span class="nl-viz-mini-row__n">${escapeHtml(String(s.count))}</span></div>`
    ).join("");
    return `<section class="nl-viz-block" aria-label="\u5229\u7528\u8005\u306E\u7A2E\u985E\u5225\u30FB\u30A2\u30A4\u30B3\u30F3\u3068\u540D\u524D\u306E\u53D6\u308A\u3084\u3059\u3055"><h4 class="nl-viz-block__title">\u5229\u7528\u8005\u306E\u7A2E\u985E\u5225\u30FB\u53D6\u308C\u305F\u60C5\u5831\uFF08\u76EE\u5B89\u30D0\u30FC\uFF09</h4><div class="nl-viz-mini-rows">${rows}</div><p class="nl-viz-block__note">\u30D0\u30FC\u306F\u300C\u3044\u3061\u3070\u3093\u591A\u3044\u884C\u300D\u3092100%\u3068\u3057\u305F\u76EE\u5B89\u3067\u3059\u3002\u6570\u5B57\u540C\u58EB\u3092\u305D\u306E\u307E\u307E\u8DB3\u3057\u305F\u308A\u6BD4\u8F03\u3057\u305F\u308A\u306F\u3067\u304D\u307E\u305B\u3093\u3002</p></section>`;
  }
  function commentTypeKeyLabelJa(key) {
    const k = String(key || "").trim().toLowerCase();
    const map = {
      gift: "\u30AE\u30D5\u30C8",
      normal: "\u901A\u5E38",
      operator: "\u904B\u55B6",
      system: "\u30B7\u30B9\u30C6\u30E0",
      command: "\u30B3\u30DE\u30F3\u30C9",
      easy: "\u30A4\u30FC\u30B8\u30FC",
      premium: "\u30D7\u30EC\u30DF\u30A2\u30E0",
      emotion: "\u30A8\u30E2\u30FC\u30B7\u30E7\u30F3"
    };
    return map[k] || String(key || "").trim() || "\u305D\u306E\u4ED6";
  }
  function htmlCommentTypeBars(dist) {
    if (!dist.length) return "";
    const tones = ["c0", "c1", "c2", "c3", "c4", "c5"];
    const rows = dist.map((d, i) => {
      const tone = tones[Math.min(i, tones.length - 1)];
      const ja = commentTypeKeyLabelJa(d.key);
      return `<div class="nl-viz-mini-row"><span class="nl-viz-mini-row__label" title="\u5185\u90E8\u30AD\u30FC: ${escapeHtml(d.key)}">${escapeHtml(ja)}</span><div class="nl-viz-mini-row__track"><div class="nl-viz-mini-row__fill nl-viz-mini-row__fill--${tone}" style="width:${Math.min(100, d.pct).toFixed(2)}%"></div></div><span class="nl-viz-mini-row__n">${escapeHtml(String(d.count))}</span></div>`;
    }).join("");
    return `<section class="nl-viz-block" aria-label="\u753B\u9762\u306B\u8F09\u3063\u3066\u3044\u308B\u30B3\u30E1\u30F3\u30C8\u306E\u7A2E\u985E"><h4 class="nl-viz-block__title">\u3044\u307E\u753B\u9762\u306B\u51FA\u3066\u3044\u308B\u30B3\u30E1\u30F3\u30C8\u306E\u7A2E\u985E\uFF08\u5272\u5408\uFF09</h4><div class="nl-viz-mini-rows">${rows}</div></section>`;
  }
  function htmlWsStalenessBar(st) {
    if (st.label === "\u2014") return "";
    const toneClass = st.tone === "ok" ? "nl-viz-bar__fill--ok" : st.tone === "warn" ? "nl-viz-bar__fill--warn" : "nl-viz-bar__fill--bad";
    return `<section class="nl-viz-block" aria-label="\u63A5\u7D9A\u60C5\u5831\u306E\u65B0\u3057\u3055"><h4 class="nl-viz-block__title">\u914D\u4FE1\u30DA\u30FC\u30B8\u3068\u306E\u63A5\u7D9A\u306E\u65B0\u3057\u3055\uFF08\u53C2\u8003\uFF09</h4><div class="nl-viz-bar nl-viz-bar--tall"><div class="nl-viz-bar__track"><div class="nl-viz-bar__fill ${toneClass}" style="width:${st.freshnessPct.toFixed(2)}%"></div></div><p class="nl-viz-block__caption">${escapeHtml(`\u6700\u7D42\u66F4\u65B0\u304B\u3089\u306E\u7D4C\u904E ${st.label}\uFF08\u9577\u3044\u307B\u3069\u30D0\u30FC\u304C\u77ED\u304F\u306A\u308A\u307E\u3059\uFF09`)}</p></div></section>`;
  }
  function htmlAcquisitionSparklines(seriesArrays, opts = {}) {
    const series = [
      { label: "\u30B5\u30E0\u30CD", color: "#0f8fd8", vals: seriesArrays.thumbSeries },
      { label: "ID", color: "#6366f1", vals: seriesArrays.idSeries },
      { label: "\u540D\u524D", color: "#ea580c", vals: seriesArrays.nickSeries },
      { label: "\u30B3\u30E1", color: "#0d9488", vals: seriesArrays.commentSeries }
    ];
    const W = 200;
    const H = 36;
    const pad = 4;
    const innerW = W - pad * 2;
    const innerH = H - pad * 2;
    const lineOrDotSvg = (vals, color) => {
      if (!vals.length) return "";
      const n = vals.length;
      const missing = (v) => v == null || typeof v === "number" && !Number.isFinite(v);
      const coords = vals.map((v, i) => {
        if (missing(v)) return null;
        const vn = (
          /** @type {number} */
          v
        );
        const x = n === 1 ? pad + innerW / 2 : pad + innerW * i / Math.max(1, n - 1);
        const y = pad + innerH * (1 - Math.max(0, Math.min(100, vn)) / 100);
        return { x, y };
      });
      const present = coords.filter(Boolean);
      if (present.length === 0) return "";
      if (present.length === 1) {
        const c = (
          /** @type {{ x: number, y: number }} */
          present[0]
        );
        return `<circle cx="${c.x.toFixed(2)}" cy="${c.y.toFixed(2)}" r="2.2" fill="${color}"/>`;
      }
      let d = "";
      let pen = false;
      for (let i = 0; i < n; i++) {
        const c = coords[i];
        if (!c) {
          pen = false;
          continue;
        }
        d += pen ? ` L ${c.x.toFixed(2)},${c.y.toFixed(2)}` : `M ${c.x.toFixed(2)},${c.y.toFixed(2)}`;
        pen = true;
      }
      return d ? `<path fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" d="${d}"/>` : "";
    };
    const blocks = series.map((s) => {
      const svgInner = lineOrDotSvg(s.vals, s.color);
      return `<div class="nl-viz-spark"><span class="nl-viz-spark__cap">${escapeHtml(s.label)}</span><svg class="nl-viz-spark__svg" viewBox="0 0 ${W} ${H}" aria-hidden="true"><rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="none" stroke="color-mix(in srgb, var(--nl-border) 70%, transparent)" stroke-width="0.6" rx="3"/>` + svgInner + "</svg></div>";
    }).join("");
    const note = opts.persisted ? "4\u672C\u3068\u3082\u300C\u53D6\u308C\u3066\u3044\u308B\u5272\u5408\u300D\u306E\u63A8\u79FB\u3067\u3059\u3002\u3053\u306EPC\u306B\u5C11\u3057\u305A\u3064\u6B8B\u308A\u307E\u3059\uFF08\u76EE\u5B89\u3067\u6700\u5927\u7D047\u65E5\u30FB250\u70B9\uFF09\u3002\u30B3\u30E1\u306F\u516C\u5F0F\u4EF6\u6570\u304C\u7121\u3044\u30B5\u30F3\u30D7\u30EB\u3067\u306F\u6B20\u6E2C\u3068\u306A\u308A\u3001\u6298\u308C\u7DDA\u304C\u9014\u5207\u308C\u308B\u3053\u3068\u304C\u3042\u308A\u307E\u3059\u3002" : "4\u672C\u3068\u3082\u300C\u53D6\u308C\u3066\u3044\u308B\u5272\u5408\u300D\u306E\u63A8\u79FB\u3067\u3059\u3002\u30D6\u30E9\u30A6\u30B6\u306E\u30BF\u30D6\u3092\u9589\u3058\u308B\u307E\u3067\u306E\u5C65\u6B74\u3060\u3051\u3067\u3059\u3002\u30B3\u30E1\u306F\u516C\u5F0F\u4EF6\u6570\u304C\u7121\u3044\u30B5\u30F3\u30D7\u30EB\u3067\u306F\u6B20\u6E2C\u3068\u306A\u308A\u3001\u6298\u308C\u7DDA\u304C\u9014\u5207\u308C\u308B\u3053\u3068\u304C\u3042\u308A\u307E\u3059\u3002";
    return `<section class="nl-viz-block" aria-label="\u30C7\u30FC\u30BF\u53D6\u5F97\u7387\u306E\u63A8\u79FB"><h4 class="nl-viz-block__title">\u53D6\u5F97\u7387\u306E\u63A8\u79FB\uFF08\u5C0F\u3055\u306A\u6298\u308C\u7DDA\uFF09</h4><p class="nl-viz-block__note">${escapeHtml(note)}</p><div class="nl-viz-spark-grid">${blocks}</div></section>`;
  }
  function htmlDualCountSparklines(displaySeries, storageSeries) {
    if (!displaySeries.length || displaySeries.length !== storageSeries.length) return "";
    const maxVal = Math.max(
      1,
      ...displaySeries,
      ...storageSeries
    );
    const dN = displaySeries.map((n2) => Math.max(0, n2) / maxVal * 100);
    const sN = storageSeries.map((n2) => Math.max(0, n2) / maxVal * 100);
    const W = 220;
    const H = 40;
    const pad = 4;
    const innerW = W - pad * 2;
    const innerH = H - pad * 2;
    const n = dN.length;
    if (n < 1) return "";
    const pathFor = (vals, color) => {
      if (n === 1) {
        const v = vals[0];
        const x = pad + innerW / 2;
        const y = pad + innerH * (1 - Math.max(0, Math.min(100, v)) / 100);
        return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.2" fill="${color}"/>`;
      }
      const pts = vals.map(
        /** @param {number} v @param {number} i */
        (v, i) => {
          const x = pad + innerW * i / (n - 1);
          const y = pad + innerH * (1 - Math.max(0, Math.min(100, v)) / 100);
          return `${x.toFixed(2)},${y.toFixed(2)}`;
        }
      );
      return `<path fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" d="M ${pts.join(" L ")}"/>`;
    };
    const svg = `<svg class="nl-viz-count-spark__svg" viewBox="0 0 ${W} ${H}" aria-hidden="true"><rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="none" stroke="color-mix(in srgb, var(--nl-border) 70%, transparent)" stroke-width="0.6" rx="3"/>` + pathFor(dN, "#0f8fd8") + pathFor(sN, "#0d9488") + "</svg>";
    return `<section class="nl-viz-block" aria-label="\u8A18\u9332\u4EF6\u6570\u306E\u63A8\u79FB"><h4 class="nl-viz-block__title">\u8A18\u9332\u4EF6\u6570\u306E\u63A8\u79FB\uFF08\u4E00\u89A7\uFF1D\u9752\u30FB\u4FDD\u5B58\uFF1D\u7DD1\uFF09</h4><p class="nl-viz-block__note">\u30DD\u30C3\u30D7\u30A2\u30C3\u30D7\u3092\u958B\u3044\u3066\u66F4\u65B0\u3059\u308B\u305F\u3073\u306B1\u70B9\u8DB3\u3057\u307E\u3059\u3002\u9AD8\u3055\u306F\u305D\u306E\u6642\u70B9\u3067\u306E\u6700\u5927\u306B\u5408\u308F\u305B\u305F\u76EE\u5B89\u3067\u3059\u3002</p><div class="nl-viz-count-spark">${svg}<div class="nl-viz-count-spark__legend"><span><span class="nl-viz-leg nl-viz-leg--disp" aria-hidden="true"></span>\u4E00\u89A7\u306E\u4EF6\u6570</span><span><span class="nl-viz-leg nl-viz-leg--stor" aria-hidden="true"></span>\u3053\u306EPC\u306B\u4FDD\u5B58\u3057\u305F\u4EF6\u6570</span></div></div></section>`;
  }
  function htmlStoredCommentStackCharts(avs) {
    const t = avs.total;
    if (t <= 0) return "";
    const segRow = (title, segments) => {
      const inner = segments.map((s) => {
        const w = Math.max(0, Math.min(100, s.pct));
        return `<div class="nl-viz-stack-seg nl-viz-stack-seg--${s.tone}" style="width:${w.toFixed(2)}%" title="${escapeHtml(s.hint)}"></div>`;
      }).join("");
      const cap = segments.map((s) => `${s.label} ${s.count}`).join(" \xB7 ");
      return `<div class="nl-viz-stack-block"><p class="nl-viz-stack-block__title">${escapeHtml(title)}</p><div class="nl-viz-stack-track" role="img" aria-label="${escapeHtml(cap)}">${inner}</div><p class="nl-viz-stack-block__cap">${escapeHtml(cap)}</p></div>`;
    };
    const httpPct = avs.withHttpAvatar / t * 100;
    const missPct = avs.withoutHttpAvatar / t * 100;
    const nickYes = avs.withNickname / t * 100;
    const nickNo = avs.withoutNickname / t * 100;
    const numPct = avs.numericUserId / t * 100;
    const anonPct = avs.nonNumericUserId / t * 100;
    const missUid = avs.missingUserId / t * 100;
    const blocks = [
      segRow("\u30A2\u30A4\u30B3\u30F3\u753B\u50CF\u306EURL\uFF08\u8A18\u9332\u3057\u305F\u30B3\u30E1\u30F3\u30C8\uFF09", [
        {
          label: "\u3042\u308A",
          count: avs.withHttpAvatar,
          pct: httpPct,
          tone: "http",
          hint: "https \u306E\u30A2\u30A4\u30B3\u30F3URL\u304C\u53D6\u308C\u3066\u3044\u308B"
        },
        {
          label: "\u306A\u3057",
          count: avs.withoutHttpAvatar,
          pct: missPct,
          tone: "miss",
          hint: "\u672A\u53D6\u5F97\u30FBURL\u306A\u3057"
        }
      ]),
      segRow("\u8868\u793A\u540D\uFF08\u30CB\u30C3\u30AF\u30CD\u30FC\u30E0\uFF09", [
        { label: "\u3042\u308A", count: avs.withNickname, pct: nickYes, tone: "nickY", hint: "" },
        { label: "\u306A\u3057", count: avs.withoutNickname, pct: nickNo, tone: "nickN", hint: "" }
      ]),
      segRow("\u30E6\u30FC\u30B6\u30FCID\u306E\u5F62\uFF08\u5408\u8A08100%\uFF09", [
        { label: "\u6570\u5B57\u306EID", count: avs.numericUserId, pct: numPct, tone: "uidN", hint: "" },
        { label: "\u533F\u540D\u98A8\u30FB\u305D\u306E\u4ED6", count: avs.nonNumericUserId, pct: anonPct, tone: "uidA", hint: "" },
        { label: "\u672A\u53D6\u5F97", count: avs.missingUserId, pct: missUid, tone: "uidM", hint: "" }
      ])
    ].join("");
    return `<section class="nl-viz-block" aria-label="\u8A18\u9332\u30B3\u30E1\u30F3\u30C8\u306E\u5185\u8A33\u30B0\u30E9\u30D5"><h4 class="nl-viz-block__title">\u4E0B\u306E\u8868\u3068\u540C\u3058\u5185\u8A33\uFF08\u7A4D\u307F\u4E0A\u3052\u30D0\u30FC\uFF09</h4>${blocks}</section>`;
  }
  function htmlRecordOfficialGapStack(displayCount, officialCount) {
    const o = Math.max(0, Math.floor(officialCount));
    const d = Math.max(0, Math.floor(displayCount));
    if (o <= 0) return "";
    const recPct = Math.min(100, d / o * 100);
    const gapPct = Math.max(0, 100 - recPct);
    const gap = o - d;
    return `<section class="nl-viz-block" aria-label="\u516C\u5F0F\u306B\u5BFE\u3059\u308B\u8A18\u9332\u306E\u5272\u5408"><h4 class="nl-viz-block__title">\u516C\u5F0F\u30B3\u30E1\u30F3\u30C8\u6570\u306B\u5BFE\u3059\u308B\u8A18\u9332\uFF08\u7A4D\u307F\u4E0A\u3052\uFF09</h4><div class="nl-viz-stack-track nl-viz-stack-track--tall" role="img" aria-label="\u8A18\u9332 ${d} \u4EF6\u3001\u5DEE ${gap} \u4EF6"><div class="nl-viz-stack-seg nl-viz-stack-seg--rec" style="width:${recPct.toFixed(2)}%"></div><div class="nl-viz-stack-seg nl-viz-stack-seg--gap" style="width:${gapPct.toFixed(2)}%"></div></div><p class="nl-viz-stack-block__cap">${escapeHtml(`\u8A18\u9332 ${d} / \u516C\u5F0F ${o}\uFF08\u672A\u53D6\u308A\u8FBC\u307F ${gap}\uFF09`)}</p></section>`;
  }
  function htmlInterceptStorageBar(interceptCount, storageTotal) {
    const ic = Math.max(0, Math.floor(interceptCount));
    const st = Math.max(0, Math.floor(storageTotal));
    if (st <= 0 && ic <= 0) return "";
    const denom = Math.max(st, ic, 1);
    const pct = Math.min(100, ic / denom * 100);
    return `<section class="nl-viz-block" aria-label="\u30DA\u30FC\u30B8\u304B\u3089\u62FE\u3063\u305F\u5229\u7528\u8005\u30E1\u30E2\u3068\u8A18\u9332\u4EF6\u6570"><h4 class="nl-viz-block__title">\u8996\u8074\u30DA\u30FC\u30B8\u3067\u62FE\u3063\u305F\u5229\u7528\u8005\u30E1\u30E2\u3068\u3001\u4FDD\u5B58\u4EF6\u6570\uFF08\u76EE\u5B89\uFF09</h4><div class="nl-viz-bar nl-viz-bar--tall"><div class="nl-viz-bar__track"><div class="nl-viz-bar__fill nl-viz-bar__fill--neutral" style="width:${pct.toFixed(2)}%"></div></div><p class="nl-viz-block__caption">${escapeHtml(`\u30DA\u30FC\u30B8\u5074\u30E1\u30E2 ${ic} \u4EF6\u30FB\u4FDD\u5B58 ${st} \u4EF6\u306E\u3046\u3061\u5927\u304D\u3044\u65B9\u3092\u57FA\u6E96\u306B\u3057\u305F\u30D0\u30FC ${pct.toFixed(1)}%`)}</p></div></section>`;
  }
  function buildDevMonitorDlChartsHtml(p) {
    const lid = String(p.liveId || "").trim();
    if (!lid) return "";
    const parts = [];
    if (p.avatarStats && p.avatarStats.total > 0) {
      parts.push(htmlStoredCommentStackCharts(p.avatarStats));
    }
    const snap = p.snapshot && typeof p.snapshot === "object" ? (
      /** @type {Record<string, unknown>} */
      p.snapshot
    ) : null;
    const ocRaw = snap?.officialCommentCount;
    const oc = typeof ocRaw === "number" && Number.isFinite(ocRaw) ? ocRaw : null;
    if (oc != null && oc > 0) {
      parts.push(htmlRecordOfficialGapStack(p.displayCount, oc));
    }
    const dbgRaw = snap?._debug;
    const dbg = dbgRaw && typeof dbgRaw === "object" ? (
      /** @type {Record<string, unknown>} */
      dbgRaw
    ) : null;
    const intercept = dbg && dbg.intercept != null ? Number(dbg.intercept) : NaN;
    if (Number.isFinite(intercept) && p.storageCount >= 0) {
      parts.push(htmlInterceptStorageBar(intercept, p.storageCount));
    }
    return `<div class="nl-dev-monitor-dl-charts">${parts.join("")}</div>`;
  }

  // src/lib/storyAvatarDiagLine.js
  function interceptExportCodeUserLabel(code, detail = "") {
    const c = String(code || "").trim();
    const d = String(detail || "").trim();
    switch (c) {
      case "ok":
        return "\u53D6\u308A\u8FBC\u307F\u306B\u6210\u529F\u3057\u307E\u3057\u305F\u3002";
      case "ok_empty":
        return "\u53D6\u308A\u8FBC\u307F\u306F\u6210\u529F\u3057\u307E\u3057\u305F\u304C\u3001\u307E\u3060\u884C\u304C\u3042\u308A\u307E\u305B\u3093\u3002watch \u30BF\u30D6\u3092\u958B\u3044\u305F\u307E\u307E\u306B\u3057\u3066\u3001\u30DD\u30C3\u30D7\u30A2\u30C3\u30D7\u3092\u66F4\u65B0\u3057\u3066\u307F\u3066\u304F\u3060\u3055\u3044\u3002";
      case "export_rejected":
        return d ? `\u53D6\u308A\u8FBC\u307F\u3092\u30DA\u30FC\u30B8\u5074\u304C\u62D2\u5426\u3057\u307E\u3057\u305F\uFF08${d.slice(0, 80)}\uFF09` : "\u53D6\u308A\u8FBC\u307F\u3092\u30DA\u30FC\u30B8\u5074\u304C\u62D2\u5426\u3057\u307E\u3057\u305F\u3002";
      case "message_failed":
        return "\u30DA\u30FC\u30B8\u3068\u306E\u901A\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002watch \u3092\u518D\u8AAD\u307F\u8FBC\u307F\uFF08F5\uFF09\u3057\u3066\u304B\u3089\u8A66\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
      case "no_success_response":
        return "\u30DA\u30FC\u30B8\u304B\u3089\u5FDC\u7B54\u304C\u3042\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u5BFE\u8C61\u306E watch \u30BF\u30D6\u304C\u958B\u3044\u3066\u3044\u308B\u304B\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
      default:
        return c ? `\u72B6\u614B\u30B3\u30FC\u30C9: ${c}` : "\u72B6\u614B\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002";
    }
  }
  function formatStoryAvatarDiagLine(s) {
    const total = typeof s.total === "number" && s.total > 0 ? s.total : 0;
    if (total <= 0) return null;
    let line = `\u8A3A\u65AD(\u6280\u8853): \u4FDD\u5B58\u30A2\u30A4\u30B3\u30F3URL ${s.withAvatar}/${s.total}\uFF08\u7A2E\u985E ${s.uniqueAvatar}\uFF09 / \u8868\u793A\u306B\u4F7F\u3048\u305F\u30A2\u30A4\u30B3\u30F3 ${s.resolvedAvatar}/${s.total}\uFF08\u7A2E\u985E ${s.resolvedUniqueAvatar}\uFF09 / \u30E6\u30FC\u30B6\u30FCID ${s.withUid}/${s.total} / \u81EA\u5206\u306E\u6295\u7A3F \u8868\u793A${s.selfShown}\u4EF6\uFF08\u4FDD\u5B58\u6E08${s.selfSaved}, \u5F85\u3061${s.selfPending}, \u4E00\u81F4${s.selfPendingMatched}\uFF09 / \u30DA\u30FC\u30B8\u304B\u3089\u62FE\u3063\u305F\u88DC\u52A9 ${s.interceptItems}\u4EF6\uFF08ID${s.interceptWithUid}, \u30A2\u30A4\u30B3\u30F3${s.interceptWithAvatar}\uFF09 / \u5F8C\u304B\u3089\u88DC\u5B8C ${s.mergedPatched}\u4EF6`;
    if (s.mergedUidReplaced > 0) {
      line += `\uFF08ID\u5DEE\u3057\u66FF\u3048 ${s.mergedUidReplaced}\uFF09`;
    }
    if (s.stripped > 0) {
      line += ` / \u4E0D\u6574\u5408\u9664\u53BB ${s.stripped}\u4EF6`;
    }
    const mapOn = typeof s.interceptMapOnPage === "number" && s.interceptMapOnPage >= 0 ? String(s.interceptMapOnPage) : "\u2014";
    const exportRows = typeof s.interceptExportRows === "number" && s.interceptExportRows >= 0 ? s.interceptExportRows : null;
    const exCode = String(s.interceptExportCode || "").trim();
    const exDetail = String(s.interceptExportDetail || "").trim().slice(0, 72);
    if (mapOn !== "\u2014" || exportRows != null || exCode) {
      line += ` / \u30DA\u30FC\u30B8\u5185\u306E\u4E00\u6642\u5BFE\u5FDC\u8868 ${mapOn}\u4EF6`;
      if (exportRows != null) line += `\u30FB\u76F4\u8FD1\u306E\u53D6\u308A\u8FBC\u307F ${exportRows}\u884C`;
      if (exCode) line += ` [${exCode}]`;
      if (exDetail) line += ` (${exDetail})`;
    }
    return line;
  }
  function buildStoryAvatarDiagHtml(s) {
    const total = typeof s.total === "number" && s.total > 0 ? s.total : 0;
    if (total <= 0) return null;
    const leadParts = [];
    leadParts.push(
      `\u8A18\u9332\u3057\u3066\u3044\u308B\u5FDC\u63F4\u30B3\u30E1\u30F3\u30C8 <strong>${total}</strong> \u4EF6\u306E\u3046\u3061\u3001\u4E00\u89A7\u3067\u30A2\u30A4\u30B3\u30F3\u307E\u3067\u8868\u793A\u3067\u304D\u3066\u3044\u308B\u306E\u306F <strong>${s.resolvedAvatar}</strong> \u4EF6\u3001\u30E6\u30FC\u30B6\u30FCID\u304C\u4ED8\u3044\u3066\u3044\u308B\u306E\u306F <strong>${s.withUid}</strong> \u4EF6\u3067\u3059\u3002`
    );
    if (s.mergedPatched > 0) {
      leadParts.push(
        `\u3042\u3068\u304B\u3089\u60C5\u5831\u304C\u8DB3\u308A\u3066\u57CB\u307E\u3063\u305F\u884C\u304C <strong>${s.mergedPatched}</strong> \u4EF6\u3042\u308A\u307E\u3059\u3002`
      );
    }
    if (s.selfShown > 0 || s.selfPending > 0 || s.selfSaved > 0) {
      leadParts.push(
        `\u3042\u306A\u305F\u304C\u9001\u3063\u305F\u30B3\u30E1\u30F3\u30C8\u306F\u3001\u753B\u9762\u4E0A <strong>${s.selfShown}</strong> \u4EF6\u30FB\u3053\u306EPC\u306B\u4FDD\u5B58\u6E08\u307F <strong>${s.selfSaved}</strong> \u4EF6\u30FB\u7167\u5408\u5F85\u3061 <strong>${s.selfPending}</strong> \u4EF6\u3067\u3059\u3002`
      );
    }
    if (s.interceptItems > 0) {
      leadParts.push(
        `\u8996\u8074\u30DA\u30FC\u30B8\u306E\u901A\u4FE1\u304B\u3089\u62FE\u3063\u305F\u5229\u7528\u8005\u60C5\u5831\uFF08\u30A2\u30A4\u30B3\u30F3\u3084\u540D\u524D\u306E\u88DC\u52A9\uFF09\u304C <strong>${s.interceptItems}</strong> \u4EF6\u5206\u3042\u308A\u307E\u3059\u3002`
      );
    }
    const mapOn = typeof s.interceptMapOnPage === "number" && s.interceptMapOnPage >= 0 ? s.interceptMapOnPage : null;
    const exCode = String(s.interceptExportCode || "").trim();
    if (mapOn != null || exCode) {
      const extra = [];
      if (mapOn != null) {
        extra.push(
          `\u3044\u307E\u306E watch \u30BF\u30D6\u5185\u306E\u300C\u30B3\u30E1\u30F3\u30C8\u756A\u53F7\u3068\u5229\u7528\u8005\u306E\u5BFE\u5FDC\u8868\u300D\u306F <strong>${mapOn}</strong> \u4EF6\u3067\u3059\uFF08\u30BF\u30D6\u3092\u9589\u3058\u308B\u3068\u6D88\u3048\u307E\u3059\uFF09\u3002`
        );
      }
      if (exCode) {
        extra.push(
          escapeHtml(
            interceptExportCodeUserLabel(
              exCode,
              String(s.interceptExportDetail || "")
            )
          )
        );
      }
      leadParts.push(extra.join(" "));
    }
    const technical = formatStoryAvatarDiagLine(s);
    const glossary = '<ul class="nl-story-diag__list"><li><strong>\u4FDD\u5B58\u30A2\u30A4\u30B3\u30F3</strong>\uFF1A\u3053\u306EPC\u306E\u8A18\u9332\u306B\u3001\u30A2\u30A4\u30B3\u30F3\u306EURL\u3068\u3057\u3066\u6B8B\u3063\u3066\u3044\u308B\u4EF6\u6570\u3067\u3059\u3002</li><li><strong>\u8868\u793A\u30A2\u30A4\u30B3\u30F3</strong>\uFF1A\u30B0\u30EA\u30C3\u30C9\u306A\u3069\u3067\u5B9F\u969B\u306B\u753B\u50CF\u3068\u3057\u3066\u4F7F\u3048\u3066\u3044\u308B\u4EF6\u6570\u3067\u3059\u3002</li><li><strong>\u30DA\u30FC\u30B8\u304B\u3089\u62FE\u3063\u305F\u88DC\u52A9</strong>\uFF1A\u30CB\u30B3\u751F\u306E\u30DA\u30FC\u30B8\u304C\u8AAD\u307F\u53D6\u308B\u901A\u4FE1\u304B\u3089\u3001\u62E1\u5F35\u304C\u5229\u7528\u8005\u8868\u793A\u3092\u88DC\u3046\u305F\u3081\u306B\u4F7F\u3046\u60C5\u5831\u3067\u3059\uFF08\u672C\u6587\u306F\u4FDD\u5B58\u3057\u307E\u305B\u3093\uFF09\u3002</li><li><strong>\u4E00\u6642\u5BFE\u5FDC\u8868</strong>\uFF1A\u958B\u3044\u3066\u3044\u308B watch \u30BF\u30D6\u306E\u30E1\u30E2\u30EA\u4E0A\u3060\u3051\u306B\u3042\u308B\u5BFE\u5FDC\u8868\u3067\u3001\u30AD\u30E3\u30C3\u30B7\u30E5\u3068\u306F\u5225\u3067\u3059\u3002</li></ul>';
    return `<div class="nl-story-diag"><p class="nl-story-diag__lead">${leadParts.join(" ")}</p><details class="nl-story-diag__more"><summary class="nl-story-diag__summary">\u5185\u8A33\u30FB\u7528\u8A9E\uFF08\u8A73\u3057\u304F\u898B\u308B\uFF09</summary><div class="nl-story-diag__body">` + glossary + (technical ? `<p class="nl-story-diag__technical">${escapeHtml(technical)}</p>` : "") + `</div></details></div>`;
  }

  // src/lib/commentVelocityWindow.js
  function countCommentsInWindowMs(entries, nowMs, windowMs) {
    if (!Array.isArray(entries) || windowMs <= 0) return 0;
    const now = typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : Date.now();
    const cutoff = now - windowMs;
    let n = 0;
    for (const e of entries) {
      const t = e && typeof e === "object" && typeof e.capturedAt === "number" ? e.capturedAt : 0;
      if (t >= cutoff && t <= now) n += 1;
    }
    return n;
  }
  function commentsPerMinuteFromWindow(count, windowMs) {
    if (windowMs <= 0) return 0;
    const c = typeof count === "number" && Number.isFinite(count) && count >= 0 ? count : 0;
    return c * 6e4 / windowMs;
  }

  // src/lib/broadcastSessionSummaryDb.js
  var BROADCAST_SUMMARY_DB_NAME = "nls_broadcast_summary_v1";
  var BROADCAST_SUMMARY_STORE = "samples";
  var DB_VERSION = 1;
  var BROADCAST_SUMMARY_MAX_ROWS = 5e3;
  var BROADCAST_SUMMARY_MAX_PER_LIVE = 200;
  function openBroadcastSessionSummaryDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(BROADCAST_SUMMARY_DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(BROADCAST_SUMMARY_STORE)) {
          const s = db.createObjectStore(BROADCAST_SUMMARY_STORE, {
            keyPath: "id",
            autoIncrement: true
          });
          s.createIndex("byLiveCaptured", ["liveId", "capturedAt"], {
            unique: false
          });
          s.createIndex("byCapturedAt", "capturedAt", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function appendBroadcastSessionSummarySample(db, row) {
    const lid = String(row.liveId || "").trim().toLowerCase();
    if (!lid) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(BROADCAST_SUMMARY_STORE, "readwrite");
      const store = tx.objectStore(BROADCAST_SUMMARY_STORE);
      const addReq = store.add({ ...row, liveId: lid });
      addReq.onerror = () => reject(addReq.error);
      addReq.onsuccess = () => resolve(void 0);
      tx.oncomplete = () => resolve(void 0);
      tx.onerror = () => reject(tx.error);
    });
    await pruneBroadcastSessionSummaryForLive(db, lid);
    await pruneBroadcastSessionSummaryGlobal(db);
  }
  async function listBroadcastSessionSummaryForLive(db, liveId, limit) {
    const lid = String(liveId || "").trim().toLowerCase();
    if (!lid) return [];
    const lim = typeof limit === "number" && Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 30;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BROADCAST_SUMMARY_STORE, "readonly");
      const store = tx.objectStore(BROADCAST_SUMMARY_STORE);
      const idx = store.index("byLiveCaptured");
      const range = IDBKeyRange.bound([lid, 0], [lid, Number.MAX_SAFE_INTEGER]);
      const req = idx.openCursor(range, "prev");
      const out = [];
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur || out.length >= lim) {
          resolve(out);
          return;
        }
        out.push(
          /** @type {BroadcastSessionSummaryRow} */
          cur.value
        );
        cur.continue();
      };
    });
  }
  async function pruneBroadcastSessionSummaryForLive(db, liveId) {
    const lid = String(liveId || "").trim().toLowerCase();
    if (!lid) return;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BROADCAST_SUMMARY_STORE, "readwrite");
      const store = tx.objectStore(BROADCAST_SUMMARY_STORE);
      const idx = store.index("byLiveCaptured");
      const range = IDBKeyRange.bound([lid, 0], [lid, Number.MAX_SAFE_INTEGER]);
      const req = idx.openCursor(range, "next");
      const all = [];
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const cur = req.result;
        if (cur) {
          all.push(
            /** @type {BroadcastSessionSummaryRow} */
            cur.value
          );
          cur.continue();
          return;
        }
        if (all.length <= BROADCAST_SUMMARY_MAX_PER_LIVE) {
          resolve(void 0);
          return;
        }
        all.sort((a, b) => a.capturedAt - b.capturedAt);
        const drop = all.length - BROADCAST_SUMMARY_MAX_PER_LIVE;
        for (let i = 0; i < drop; i += 1) {
          const id = all[i].id;
          if (typeof id === "number") store.delete(id);
        }
        resolve(void 0);
      };
      tx.onerror = () => reject(tx.error);
    });
  }
  async function pruneBroadcastSessionSummaryGlobal(db) {
    const total = await new Promise((resolve, reject) => {
      const tx = db.transaction(BROADCAST_SUMMARY_STORE, "readonly");
      const store = tx.objectStore(BROADCAST_SUMMARY_STORE);
      const r = store.count();
      r.onerror = () => reject(r.error);
      r.onsuccess = () => resolve(r.result);
    });
    if (total <= BROADCAST_SUMMARY_MAX_ROWS) return;
    const toDrop = total - BROADCAST_SUMMARY_MAX_ROWS;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BROADCAST_SUMMARY_STORE, "readwrite");
      const store = tx.objectStore(BROADCAST_SUMMARY_STORE);
      const idx = store.index("byCapturedAt");
      const curReq = idx.openCursor();
      let dropped = 0;
      curReq.onerror = () => reject(curReq.error);
      curReq.onsuccess = () => {
        const cur = curReq.result;
        if (!cur || dropped >= toDrop) {
          resolve(void 0);
          return;
        }
        const row = (
          /** @type {BroadcastSessionSummaryRow} */
          cur.value
        );
        const id = row.id;
        if (typeof id === "number") {
          store.delete(id);
          dropped += 1;
        }
        cur.continue();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  // src/lib/broadcastSessionSummaryFlush.js
  var FLUSH_MIN_INTERVAL_MS = 6e4;
  var lastFlushAt = 0;
  function peakConcurrentEstimateFromSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return null;
    const vcRaw = snapshot.viewerCountFromDom;
    const vc = typeof vcRaw === "number" && Number.isFinite(vcRaw) && vcRaw >= 0 ? vcRaw : void 0;
    const recentActive = typeof snapshot.recentActiveUsers === "number" ? snapshot.recentActiveUsers : 0;
    const officialVcRaw = snapshot.officialViewerCount;
    const officialVc = typeof officialVcRaw === "number" && Number.isFinite(officialVcRaw) ? officialVcRaw : void 0;
    const liveIdStr = typeof snapshot.liveId === "string" ? snapshot.liveId : "";
    const show = shouldShowConcurrentEstimate({
      recentActiveUsers: recentActive,
      officialViewerCount: officialVc,
      viewerCountFromDom: vc,
      liveId: liveIdStr
    });
    if (!show) return null;
    const streamAge = typeof snapshot.streamAgeMin === "number" && snapshot.streamAgeMin >= 0 ? snapshot.streamAgeMin : void 0;
    const resolved = resolveConcurrentViewers({
      nowMs: Date.now(),
      officialViewers: typeof snapshot.officialViewerCount === "number" && Number.isFinite(snapshot.officialViewerCount) ? snapshot.officialViewerCount : void 0,
      officialUpdatedAtMs: typeof snapshot.officialStatsUpdatedAt === "number" && Number.isFinite(snapshot.officialStatsUpdatedAt) ? snapshot.officialStatsUpdatedAt : void 0,
      officialViewerIntervalMs: typeof snapshot.officialViewerIntervalMs === "number" && Number.isFinite(snapshot.officialViewerIntervalMs) && snapshot.officialViewerIntervalMs > 0 ? snapshot.officialViewerIntervalMs : void 0,
      previousStatisticsComments: typeof snapshot.officialCommentCount === "number" && Number.isFinite(snapshot.officialCommentCount) && typeof snapshot.officialStatisticsCommentsDelta === "number" && Number.isFinite(snapshot.officialStatisticsCommentsDelta) ? Math.max(
        0,
        snapshot.officialCommentCount - snapshot.officialStatisticsCommentsDelta
      ) : void 0,
      currentStatisticsComments: typeof snapshot.officialCommentCount === "number" && Number.isFinite(snapshot.officialCommentCount) ? snapshot.officialCommentCount : void 0,
      receivedCommentsDelta: typeof snapshot.officialReceivedCommentsDelta === "number" && Number.isFinite(snapshot.officialReceivedCommentsDelta) ? snapshot.officialReceivedCommentsDelta : void 0,
      recentActiveUsers: recentActive,
      totalVisitors: vc != null && vc > 0 ? vc : void 0,
      streamAgeMin: streamAge
    });
    const est = resolved?.estimated;
    return typeof est === "number" && Number.isFinite(est) ? Math.round(est) : null;
  }
  async function maybeFlushBroadcastSessionSummarySample(input) {
    if (typeof indexedDB === "undefined") return;
    const lid = String(input.liveId || "").trim().toLowerCase();
    if (!lid) return;
    const now = Date.now();
    if (now - lastFlushAt < FLUSH_MIN_INTERVAL_MS) return;
    lastFlushAt = now;
    const comments = Array.isArray(input.comments) ? input.comments : [];
    const st = summarizeRecordedCommenters(comments);
    let giftUserCount = 0;
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local?.get) {
        const bag = await chrome.storage.local.get(giftUsersStorageKey(lid));
        const key = giftUsersStorageKey(lid);
        const raw = bag[key];
        giftUserCount = Array.isArray(raw) ? raw.length : 0;
      }
    } catch {
      giftUserCount = 0;
    }
    const snap = input.snapshot;
    const oc = snap && typeof snap.officialCommentCount === "number" ? snap.officialCommentCount : null;
    const ov = snap && typeof snap.officialViewerCount === "number" ? snap.officialViewerCount : null;
    let officialCaptureRatio = null;
    if (snap && snap.officialCaptureRatio != null) {
      const r = Number(snap.officialCaptureRatio);
      if (Number.isFinite(r)) officialCaptureRatio = r;
    }
    const row = {
      liveId: lid,
      capturedAt: now,
      watchUrl: String(input.watchUrl || "").trim(),
      recording: Boolean(input.recording),
      commentStorageCount: comments.length,
      uniqueKnownCommenters: st.uniqueKnownUserIds,
      giftUserCount,
      peakConcurrentEstimate: peakConcurrentEstimateFromSnapshot(snap),
      officialCommentCount: oc,
      officialViewerCount: ov,
      officialCaptureRatio
    };
    let db;
    try {
      db = await openBroadcastSessionSummaryDb();
      await appendBroadcastSessionSummarySample(db, row);
    } catch {
    } finally {
      try {
        db?.close();
      } catch {
      }
    }
  }

  // src/extension/popup-entry.js
  function $(id) {
    return document.getElementById(id);
  }
  function syncVoiceCommentButton() {
    if (!hasExtensionContext()) return;
    const post = (
      /** @type {HTMLButtonElement|null} */
      $("postCommentBtn")
    );
    const voice = (
      /** @type {HTMLButtonElement|null} */
      $("voiceCommentBtn")
    );
    const srCheck = (
      /** @type {HTMLButtonElement|null} */
      $("voiceSrCheck")
    );
    if (!voice) return;
    voice.title = "\u805E\u304D\u53D6\u308A\u306F watch \u30DA\u30FC\u30B8\u4E0A\u3067\u884C\u3044\u307E\u3059\uFF08\u30BF\u30C3\u30D7\u3067\u958B\u59CB\u30FB\u3082\u3046\u4E00\u5EA6\u3067\u505C\u6B62\uFF09";
    const dis = Boolean(post?.disabled);
    voice.disabled = dis;
    if (srCheck) {
      srCheck.disabled = dis;
      srCheck.title = dis ? "watch\u30DA\u30FC\u30B8\u3092\u958B\u304F\u3068\u4F7F\u3048\u307E\u3059" : "watch\u30DA\u30FC\u30B8\u4E0A\u3067\u77ED\u3044\u97F3\u58F0\u8A8D\u8B58\u30C6\u30B9\u30C8\u3092\u3057\u307E\u3059";
    }
  }
  var INLINE_MODE = (() => {
    try {
      return new URLSearchParams(window.location.search).get("inline") === "1";
    } catch {
      return false;
    }
  })();
  var INLINE_EMBED_WATCH = (() => {
    if (!INLINE_MODE) return false;
    try {
      return new URLSearchParams(window.location.search).get("dock") !== "sidepanel";
    } catch {
      return true;
    }
  })();
  var INLINE_SIDE_PANEL = (() => {
    if (!INLINE_MODE) return false;
    try {
      return new URLSearchParams(window.location.search).get("dock") === "sidepanel";
    } catch {
      return false;
    }
  })();
  function applyResponsivePopupLayout() {
    const root = document.documentElement;
    const body = document.body;
    if (!root || !body) return;
    root.classList.toggle("nl-inline", INLINE_MODE);
    body.classList.toggle("nl-inline", INLINE_MODE);
    root.classList.toggle("nl-inline-embed-watch", INLINE_EMBED_WATCH);
    body.classList.toggle("nl-inline-embed-watch", INLINE_EMBED_WATCH);
    root.classList.toggle("nl-skin-panel-dark", !INLINE_MODE || INLINE_SIDE_PANEL);
    body.classList.toggle("nl-skin-panel-dark", !INLINE_MODE || INLINE_SIDE_PANEL);
    if (INLINE_MODE) {
      const iw = Math.round(window.innerWidth || 360);
      const ih = Math.round(window.innerHeight || 400);
      const width2 = Math.max(260, iw);
      const height2 = Math.max(180, ih);
      const baseFont2 = width2 >= 900 ? 15.5 : width2 >= 720 ? 15.25 : width2 >= 520 ? 15 : 14.5;
      root.style.setProperty("--nl-pop-width", `${width2}px`);
      root.style.setProperty("--nl-pop-height", `${height2}px`);
      root.style.setProperty("--nl-base-font", `${baseFont2}px`);
      body.classList.remove("nl-tight", "nl-compact");
      return;
    }
    const sw = Number(window.screen?.availWidth || window.innerWidth || 1366);
    const sh = Number(window.screen?.availHeight || window.innerHeight || 768);
    const widthMin = sw >= 1920 ? 400 : sw >= 1440 ? 380 : sw >= 1100 ? 360 : 340;
    const widthMax = sw >= 1920 ? 520 : sw >= 1600 ? 500 : sw >= 1366 ? 470 : 440;
    const width = Math.max(widthMin, Math.min(widthMax, Math.round(sw * 0.265)));
    const heightMax = sh >= 900 ? 960 : sh >= 800 ? 900 : 860;
    const heightMin = sh >= 760 ? 700 : sh >= 660 ? 640 : 560;
    const baseHeight = Math.max(heightMin, Math.min(heightMax, Math.round(sh * 0.88)));
    const header = (
      /** @type {HTMLElement|null} */
      document.querySelector(".nl-header")
    );
    const main = (
      /** @type {HTMLElement|null} */
      document.querySelector(".nl-main")
    );
    const contentHeight = header && main ? Math.ceil(header.scrollHeight + main.scrollHeight + 2) : 0;
    const height = Math.min(heightMax, Math.max(baseHeight, contentHeight));
    const baseFont = width >= 500 ? 16.25 : width >= 460 ? 15.75 : width >= 420 ? 15.25 : width >= 380 ? 14.75 : 14.25;
    root.style.setProperty("--nl-pop-width", `${width}px`);
    root.style.setProperty("--nl-pop-height", `${height}px`);
    root.style.setProperty("--nl-base-font", `${baseFont}px`);
    const innerH = Number(window.innerHeight || height);
    const tight = innerH < 520 || height < 520;
    const compact = innerH < 580 || height < 580 || width < 340;
    body.classList.toggle("nl-tight", tight);
    body.classList.toggle("nl-compact", compact);
  }
  var CHARA_BOUNCE_CLASSES = ["nl-chara-bounce-small", "nl-chara-bounce-medium", "nl-chara-bounce-big"];
  var CHARA_IMG_BASE = "images/yukkuri-charactore-english";
  var RINKU_IMGS = (
    /** @type {const} */
    {
      default: `${CHARA_IMG_BASE}/link/link-yukkuri-smile-mouth-open.png`,
      small: `${CHARA_IMG_BASE}/link/link-yukkuri-smile-mouth-closed.png`,
      medium: `${CHARA_IMG_BASE}/link/link-yukkuri-smile-mouth-open.png`,
      big: `${CHARA_IMG_BASE}/link/link-yukkuri-blink-mouth-open.png`
    }
  );
  var KONTA_IMGS = (
    /** @type {const} */
    {
      default: `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-smile-mouth-open.png`,
      small: `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-smile-mouth-closed.png`,
      medium: `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-smile-mouth-open.png`,
      big: `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-blink-mouth-open.png`
    }
  );
  var TANUNEE_IMGS = (
    /** @type {const} */
    {
      default: `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-smile-mouth-open.png`,
      small: `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-normal-mouth-open.png`,
      medium: `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-smile-mouth-open.png`,
      big: `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-blink-mouth-open.png`
    }
  );
  var _charaRevertTimers = /* @__PURE__ */ new Map();
  function triggerCharaReaction(iconEl, { delta, thresholds, images }) {
    if (!iconEl || delta <= 0) return;
    const [t1, t2, t3] = thresholds;
    let rank;
    if (delta >= t3) rank = "big";
    else if (delta >= t2) rank = "medium";
    else if (delta >= t1) rank = "small";
    else return;
    const bounceClass = `nl-chara-bounce-${rank}`;
    iconEl.src = images[rank];
    for (const c of CHARA_BOUNCE_CLASSES) iconEl.classList.remove(c);
    void /** @type {HTMLElement} */
    iconEl.offsetWidth;
    iconEl.classList.add(bounceClass);
    const prev = _charaRevertTimers.get(iconEl);
    if (prev) clearTimeout(prev);
    _charaRevertTimers.set(iconEl, window.setTimeout(() => {
      iconEl.src = images.default;
      _charaRevertTimers.delete(iconEl);
    }, 600));
  }
  var _prevSupportCount = (
    /** @type {number|null} */
    null
  );
  var _lastTopSupportRankStripStableKey = null;
  function setCountDisplay(value, watchSnapshot = null) {
    const countEl = $("count");
    if (countEl) {
      countEl.textContent = value;
      countEl.classList.toggle("is-placeholder", value === "-" || value === "");
    }
    const liveStatEl = $("liveStatComments");
    if (liveStatEl) liveStatEl.textContent = value;
    const officialEl = (
      /** @type {HTMLElement|null} */
      $("liveStatCommentsOfficial")
    );
    if (officialEl) {
      const oc = watchSnapshot?.officialCommentCount;
      if (typeof oc === "number" && Number.isFinite(oc) && oc >= 0) {
        officialEl.hidden = false;
        const recorded = parseInt(value, 10);
        let line = `\u516C\u5F0F ${oc.toLocaleString("ja-JP")} \u4EF6`;
        if (!Number.isNaN(recorded) && recorded >= 0 && oc > 0) {
          if (recorded <= oc) {
            line += ` \xB7 \u8A18\u9332\u306F\u516C\u5F0F\u306E\u7D04${Math.round(recorded / oc * 100)}%`;
          } else {
            line += " \xB7 \u8A18\u9332\u304C\u5148\u884C\uFF08\u516C\u5F0F\u8868\u793A\u306E\u66F4\u65B0\u5F85\u3061\u306E\u3053\u3068\u304C\u3042\u308A\u307E\u3059\uFF09";
          }
        }
        officialEl.textContent = line;
        officialEl.title = "\u3053\u306E\u300C\u516C\u5F0F\u300D\u306F\u8996\u8074\u7528WebSocket\u7B49\u306E statistics \u30E1\u30C3\u30BB\u30FC\u30B8\uFF08comments / commentCount\uFF09\u306E\u7D2F\u8A08\u3067\u3059\u3002\u30D7\u30EC\u30A4\u30E4\u30FC\u4ED8\u8FD1\u306B\u51FA\u308B\u30B3\u30E1\u30F3\u30C8\u6570\u3068\u306F\u5225\u7D4C\u8DEF\u306E\u305F\u3081\u4E00\u81F4\u3057\u306A\u3044\u3053\u3068\u304C\u3042\u308A\u307E\u3059\u3002\u6BD4\u8F03\u306E\u57FA\u6E96\u306F\u3053\u3061\u3089\u3067\u3059\u3002\u540C\u3058\u30BF\u30D6\u3067\u898B\u7D9A\u3051\u3001NDGR\uFF08\u30DA\u30FC\u30B8\u5185\u30A4\u30F3\u30BF\u30FC\u30BB\u30D7\u30C8\uFF09\u304C\u52B9\u3044\u3066\u3044\u308B\u3068\u304D\u306F\u8A18\u9332\u304C\u8FD1\u3065\u304D\u3084\u3059\u3044\u3067\u3059\u3002\u9014\u4E2D\u5165\u5BA4\u30FB\u4EEE\u60F3\u30EA\u30B9\u30C8\u30FB\u8A18\u9332OFF\u30FB\u975E\u8868\u793A\u30BF\u30D6\u30FB\u30B5\u30A4\u30C8\u6539\u4FEE\u30FB\u30B9\u30C8\u30EC\u30FC\u30B8\u4E0A\u9650\u3067\u3082\u5DEE\u304C\u51FA\u307E\u3059\u3002";
      } else {
        officialEl.hidden = true;
        officialEl.textContent = "";
        officialEl.removeAttribute("title");
      }
    }
    const num = parseInt(value, 10);
    if (!Number.isNaN(num) && _prevSupportCount != null && num > _prevSupportCount) {
      const card = document.getElementById("supportVisualLiveCard");
      const icon = card?.querySelector(".nl-live-stat-icon");
      triggerCharaReaction(icon ?? null, {
        delta: num - _prevSupportCount,
        thresholds: [1, 3, 10],
        images: RINKU_IMGS
      });
    }
    if (!Number.isNaN(num)) _prevSupportCount = num;
  }
  function commentTickerDisplayLabel(entry, liveId, entries) {
    if (!entry) return "";
    const nickname = String(entry.nickname || "").trim();
    if (nickname) return nickname;
    const ownPosted = isOwnPostedSupportComment(entry, liveId, entries);
    const viewerNick = String(watchMetaCache.snapshot?.viewerNickname || "").trim();
    if (ownPosted && viewerNick) return viewerNick;
    const userId = String(entry.userId || "").trim();
    if (userId) return displayUserLabel(userId);
    return "";
  }
  function renderCommentTicker(comments) {
    const segA = $("commentTickerSegA");
    const segB = $("commentTickerSegB");
    const scroll = (
      /** @type {HTMLElement|null} */
      $("commentTickerScroll")
    );
    const viewport = (
      /** @type {HTMLElement|null} */
      $("commentTickerViewport")
    );
    if (!segA || !segB || !scroll) return;
    const list = Array.isArray(comments) ? comments : [];
    const latest = (
      /** @type {PopupCommentEntry|null} */
      pickLatestCommentEntry(list)
    );
    const placeholder = '<span class="nl-ticker-item nl-ticker-latest">\u307E\u3060\u5FDC\u63F4\u30B3\u30E1\u30F3\u30C8\u304C\u306A\u3044\u306E\u3060\u2026 \u8A18\u9332ON\u3067\u305F\u307E\u308B\u3088</span>';
    scroll.classList.add("is-paused", "is-latest-only");
    segB.innerHTML = "";
    if (!latest) {
      segA.innerHTML = placeholder;
      if (viewport) viewport.classList.add("is-empty");
      return;
    }
    if (viewport) viewport.classList.remove("is-empty");
    const liveId = String(latest.liveId || STORY_SOURCE_STATE.liveId || "");
    const label = commentTickerDisplayLabel(latest, liveId, list);
    const avatarSrc = storyGrowthTileSrcForEntry(latest, liveId, list);
    const rawText = String(latest.text || "").trim();
    const noStr = String(latest.commentNo || "").trim();
    const noPrefix = /^\d+$/.test(noStr) ? `No.${noStr} ` : "";
    const textFallback = rawText || (noStr ? `\uFF08\u672C\u6587\u306A\u3057\u30FB${noPrefix.trim()}\uFF09` : "\uFF08\u672C\u6587\u306A\u3057\uFF09");
    const textShown = truncateText(rawText || textFallback, 72);
    const tip = label ? `${noPrefix}${label}\uFF1A${rawText || "\uFF08\u30B3\u30E1\u30F3\u30C8\u672C\u6587\u306A\u3057\uFF09"}` : `${noPrefix}${rawText || "\uFF08\u30B3\u30E1\u30F3\u30C8\u672C\u6587\u306A\u3057\uFF09"}`;
    const labelHtml = label ? `<span class="nl-ticker-latest__name">${escapeHtml(label)}</span><span class="nl-ticker-latest__colon">\uFF1A</span>` : "";
    segA.innerHTML = `<span class="nl-ticker-item nl-ticker-latest" aria-live="polite"><span class="nl-ticker-latest__row"><img class="nl-ticker-latest__avatar" alt="" src="${escapeHtml(avatarSrc)}">` + labelHtml + `<span class="nl-ticker-latest__text">${escapeHtml(textShown)}</span></span></span>`;
    const line = (
      /** @type {HTMLSpanElement|null} */
      segA.querySelector(".nl-ticker-latest")
    );
    if (line) line.title = tip;
    const avatar = (
      /** @type {HTMLImageElement|null} */
      segA.querySelector(".nl-ticker-latest__avatar")
    );
    if (avatar && isHttpOrHttpsUrl(avatarSrc)) {
      avatar.referrerPolicy = "no-referrer";
    }
  }
  function setPostStatus(message, kind = "idle") {
    const status = $("postStatus");
    if (!status) return;
    status.textContent = message;
    status.classList.remove("error", "success");
    if (kind === "error") status.classList.add("error");
    if (kind === "success") status.classList.add("success");
  }
  var COMMENT_POST_UI_STATE = {
    submitting: false
  };
  var EXTENSION_RELOAD_USER_GUIDE_JA = "chrome://extensions \u3092\u958B\u304D\u3001\u300C\u541B\u6597\u308A\u3093\u304F\u306E\u8FFD\u61B6\u306E\u304D\u3089\u3081\u304D\u300D\u306E\u300C\u66F4\u65B0\u300D\u3067\u62E1\u5F35\u3092\u518D\u8AAD\u307F\u8FBC\u307F\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
  function withCommentSendTroubleshootHint(message) {
    const s = String(message || "").trim();
    if (!s) return "";
    if (/再読み込み（F5）|chrome:\/\/extensions|うまくいかないとき|「更新」/.test(s)) {
      return s;
    }
    return `${s}
\u203B\u3046\u307E\u304F\u3044\u304B\u306A\u3044\u3068\u304D\uFF1Awatch\u30DA\u30FC\u30B8\u3092\u518D\u8AAD\u307F\u8FBC\u307F\uFF08F5\uFF09\u3002${EXTENSION_RELOAD_USER_GUIDE_JA}`;
  }
  function isExtensionContextInvalidatedError(err) {
    const msg = err && typeof err === "object" && "message" in err ? String(
      /** @type {{ message?: unknown }} */
      err.message || ""
    ) : String(err || "");
    return /Extension context invalidated/i.test(msg);
  }
  function hasExtensionContext() {
    try {
      return Boolean(
        globalThis.chrome?.runtime?.id && globalThis.chrome?.storage?.local
      );
    } catch {
      return false;
    }
  }
  var extensionContextErrorGuardInstalled = false;
  function installExtensionContextErrorGuard() {
    if (extensionContextErrorGuardInstalled) return;
    extensionContextErrorGuardInstalled = true;
    globalThis.addEventListener("unhandledrejection", (ev) => {
      if (!isExtensionContextInvalidatedError(ev.reason)) return;
      ev.preventDefault();
    });
    globalThis.addEventListener("error", (ev) => {
      if (!isExtensionContextInvalidatedError(ev.error || ev.message)) return;
      ev.preventDefault();
    });
  }
  async function storageSetSafe(bag) {
    if (!hasExtensionContext()) return false;
    try {
      await chrome.storage.local.set(bag);
      return true;
    } catch (e) {
      if (isExtensionContextInvalidatedError(e)) return false;
      throw e;
    }
  }
  async function storageRemoveSafe(key) {
    if (!hasExtensionContext()) return false;
    try {
      await chrome.storage.local.remove(key);
      return true;
    } catch (e) {
      if (isExtensionContextInvalidatedError(e)) return false;
      throw e;
    }
  }
  async function storageGetSafe(key, fallback) {
    if (!hasExtensionContext()) return fallback;
    try {
      return (
        /** @type {T} */
        await chrome.storage.local.get(key)
      );
    } catch (e) {
      if (isExtensionContextInvalidatedError(e)) return fallback;
      throw e;
    }
  }
  function renderExtensionContextBanner(visible) {
    const el = $("extensionContextBanner");
    if (!el) return;
    if (visible) el.removeAttribute("hidden");
    else el.setAttribute("hidden", "");
  }
  var watchMetaCache = {
    key: "",
    snapshot: null
  };
  var watchPopupRefreshGeneration = 0;
  function markPopupRefreshContentPainted() {
    try {
      document.documentElement.setAttribute("data-nl-popup-content-painted", "1");
    } catch {
    }
  }
  function hideCommentVelocityLine() {
    const el = $("commentVelocityLine");
    if (!el) return;
    el.setAttribute("hidden", "");
    el.textContent = "";
  }
  function updateCommentVelocityLine(displayEntries) {
    const el = $("commentVelocityLine");
    if (!el) return;
    const windowMs = 6e4;
    const now = Date.now();
    const list = Array.isArray(displayEntries) ? displayEntries : [];
    const n = countCommentsInWindowMs(list, now, windowMs);
    if (n <= 0) {
      el.setAttribute("hidden", "");
      el.textContent = "";
      return;
    }
    el.removeAttribute("hidden");
    const perMin = commentsPerMinuteFromWindow(n, windowMs);
    el.textContent = `\u76F4\u8FD11\u5206: \u7D04 ${perMin.toFixed(1)} \u4EF6/\u5206\uFF08${n}\u4EF6\uFF09`;
  }
  async function renderSessionSummaryComparePanel(liveId) {
    const mount = $("sessionSummaryCompareMount");
    if (!mount) return;
    const lid = String(liveId || "").trim().toLowerCase();
    if (!lid || typeof indexedDB === "undefined") {
      mount.innerHTML = '<p class="nl-sub">\u8996\u8074\u30DA\u30FC\u30B8\u3092\u958B\u304F\u3068\u3001\u3053\u3053\u306B\u30B5\u30DE\u30EA\u306E\u63A8\u79FB\u304C\u51FA\u307E\u3059\u3002</p>';
      return;
    }
    let db;
    try {
      db = await openBroadcastSessionSummaryDb();
      const rows = await listBroadcastSessionSummaryForLive(db, lid, 24);
      if (!rows.length) {
        mount.innerHTML = '<p class="nl-sub">\u307E\u3060\u30B5\u30F3\u30D7\u30EB\u304C\u3042\u308A\u307E\u305B\u3093\uFF08\u66F4\u65B0\u304C\u9032\u3080\u3068\u6E9C\u307E\u308A\u307E\u3059\uFF09\u3002</p>';
        return;
      }
      const header = '<table class="nl-session-summary-table"><thead><tr><th>\u6642\u523B</th><th>\u8A18\u9332\u30B3\u30E1\u30F3\u30C8</th><th>\u30E6\u30CB\u30FC\u30AFUID</th><th>\u30AE\u30D5\u30C8\u30E6\u30FC\u30B6\u30FC</th><th>\u540C\u63A5\u63A8\u5B9A</th><th>\u516C\u5F0F\u30B3\u30E1</th></tr></thead><tbody>';
      const body = rows.map((r) => {
        const t = new Date(r.capturedAt).toLocaleString("ja-JP");
        const peak = r.peakConcurrentEstimate != null && Number.isFinite(r.peakConcurrentEstimate) ? String(r.peakConcurrentEstimate) : "\u2014";
        const oc = r.officialCommentCount != null && Number.isFinite(r.officialCommentCount) ? String(r.officialCommentCount) : "\u2014";
        return `<tr><td>${escapeHtml(t)}</td><td>${r.commentStorageCount}</td><td>${r.uniqueKnownCommenters}</td><td>${r.giftUserCount}</td><td>${escapeHtml(peak)}</td><td>${escapeHtml(oc)}</td></tr>`;
      }).join("");
      mount.innerHTML = `${header}${body}</tbody></table>`;
    } catch {
      mount.innerHTML = '<p class="nl-sub">IndexedDB \u306E\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002</p>';
    } finally {
      try {
        db?.close();
      } catch {
      }
    }
  }
  async function renderGiftQuickStatsPanel(liveId) {
    const mount = $("giftQuickStatsMount");
    if (!mount) return;
    const lid = String(liveId || "").trim().toLowerCase();
    if (!lid) {
      mount.innerHTML = "";
      return;
    }
    try {
      const gk = giftUsersStorageKey(lid);
      const bag = await chrome.storage.local.get(gk);
      const raw = bag[gk];
      const users = Array.isArray(raw) ? raw : [];
      if (!users.length) {
        mount.innerHTML = '<p class="nl-sub">\u307E\u3060\u30AE\u30D5\u30C8\u30FB\u5E83\u544A\u30E6\u30FC\u30B6\u30FC\u304C\u8A18\u9332\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002</p>';
        return;
      }
      const sorted = [...users].sort(
        (a, b) => (b.capturedAt || 0) - (a.capturedAt || 0)
      );
      const top = sorted.slice(0, 15);
      mount.innerHTML = `<p class="nl-sub">${users.length} \u540D\u3092\u8A18\u9332\u4E2D\uFF08\u76F4\u8FD1\u9806\u306B\u6700\u592715\u4EF6\uFF09</p><ul class="nl-gift-quick-list">` + top.map((u) => {
        const nick = escapeHtml(String(u.nickname || "").trim() || "(noname)");
        const uid = escapeHtml(String(u.userId || "").trim());
        return `<li><span class="nl-gift-nick">${nick}</span> <code class="nl-gift-uid">${uid}</code></li>`;
      }).join("") + "</ul>";
    } catch {
      mount.textContent = "\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002";
    }
  }
  async function downloadSessionSummaryJson(liveId) {
    const lid = String(liveId || "").trim().toLowerCase();
    if (!lid || typeof indexedDB === "undefined") return;
    let db;
    try {
      db = await openBroadcastSessionSummaryDb();
      const rows = await listBroadcastSessionSummaryForLive(db, lid, 500);
      const json = JSON.stringify(rows, null, 2);
      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      try {
        await chrome.downloads.download({
          url,
          filename: `nicolivelog-session-summary-${lid}-${Date.now()}.json`,
          saveAs: true,
          conflictAction: "uniquify"
        });
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 6e4);
      }
    } catch {
    } finally {
      try {
        db?.close();
      } catch {
      }
    }
  }
  var INTERCEPT_BACKFILL_STATE = {
    liveId: "",
    deepTried: false
  };
  var DEFAULT_FRAME_ID = "light";
  var LEGACY_FRAME_ALIAS = {
    trio: "light",
    rink: "light",
    konta: "sunset",
    tanunee: "midnight"
  };
  var FRAME_PRESETS = {
    light: {
      label: "\u30E9\u30A4\u30C8",
      vars: {
        "--nl-bg": "#fffaf2",
        "--nl-bg-soft": "#eef8ff",
        "--nl-surface": "#ffffff",
        "--nl-text": "#1f2937",
        "--nl-muted": "#5b6475",
        "--nl-border": "#d5e3f5",
        "--nl-accent": "#0f8fd8",
        "--nl-accent-hover": "#0b73ad",
        "--nl-header-start": "#0f8fd8",
        "--nl-header-end": "#14b8a6",
        "--nl-frame-outline": "rgb(255 255 255 / 22%)"
      }
    },
    dark: {
      label: "\u30C0\u30FC\u30AF",
      vars: {
        "--nl-bg": "#0b1220",
        "--nl-bg-soft": "#111827",
        "--nl-surface": "#0f172a",
        "--nl-text": "#e5e7eb",
        "--nl-muted": "#94a3b8",
        "--nl-border": "#243244",
        "--nl-accent": "#60a5fa",
        "--nl-accent-hover": "#3b82f6",
        "--nl-header-start": "#1e293b",
        "--nl-header-end": "#334155",
        "--nl-frame-outline": "rgb(255 255 255 / 18%)"
      }
    },
    midnight: {
      label: "\u30DF\u30C3\u30C9\u30CA\u30A4\u30C8",
      vars: {
        "--nl-bg": "#0b1022",
        "--nl-bg-soft": "#1b1f3a",
        "--nl-surface": "#10182f",
        "--nl-text": "#e2e8f0",
        "--nl-muted": "#9fb1ca",
        "--nl-border": "#2a3761",
        "--nl-accent": "#7dd3fc",
        "--nl-accent-hover": "#38bdf8",
        "--nl-header-start": "#1e1b4b",
        "--nl-header-end": "#1d4ed8",
        "--nl-frame-outline": "rgb(255 255 255 / 22%)"
      }
    },
    sunset: {
      label: "\u30B5\u30F3\u30BB\u30C3\u30C8",
      vars: {
        "--nl-bg": "#fff7ed",
        "--nl-bg-soft": "#ffedd5",
        "--nl-surface": "#fffbf6",
        "--nl-text": "#1f2937",
        "--nl-muted": "#6b7280",
        "--nl-border": "#f5d0b5",
        "--nl-accent": "#ea580c",
        "--nl-accent-hover": "#c2410c",
        "--nl-header-start": "#fb923c",
        "--nl-header-end": "#f43f5e",
        "--nl-frame-outline": "rgb(255 255 255 / 30%)"
      }
    }
  };
  var DEFAULT_CUSTOM_FRAME = Object.freeze({
    headerStart: "#0f8fd8",
    headerEnd: "#14b8a6",
    accent: "#0f8fd8"
  });
  function hasFramePreset(id) {
    return Object.prototype.hasOwnProperty.call(FRAME_PRESETS, id);
  }
  function normalizeFrameId(raw) {
    const id = String(raw || "").trim().toLowerCase();
    if (!id) return "";
    return LEGACY_FRAME_ALIAS[
      /** @type {keyof typeof LEGACY_FRAME_ALIAS} */
      id
    ] || id;
  }
  function getFramePreset(id) {
    return hasFramePreset(id) ? FRAME_PRESETS[
      /** @type {keyof typeof FRAME_PRESETS} */
      id
    ] : null;
  }
  var popupFrameState = {
    id: DEFAULT_FRAME_ID,
    custom: { ...DEFAULT_CUSTOM_FRAME }
  };
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
  function sanitizeCustomFrame(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    return {
      headerStart: normalizeHexColor(
        /** @type {{ headerStart?: unknown }} */
        source.headerStart,
        DEFAULT_CUSTOM_FRAME.headerStart
      ),
      headerEnd: normalizeHexColor(
        /** @type {{ headerEnd?: unknown }} */
        source.headerEnd,
        DEFAULT_CUSTOM_FRAME.headerEnd
      ),
      accent: normalizeHexColor(
        /** @type {{ accent?: unknown }} */
        source.accent,
        DEFAULT_CUSTOM_FRAME.accent
      )
    };
  }
  function resolveFrameVars(frameId, custom) {
    if (frameId !== "custom") {
      return getFramePreset(frameId)?.vars || FRAME_PRESETS[DEFAULT_FRAME_ID].vars;
    }
    const safe = sanitizeCustomFrame(custom);
    return {
      "--nl-bg": "#f7fbff",
      "--nl-bg-soft": "#e8f4ff",
      "--nl-surface": "#ffffff",
      "--nl-text": "#1f2937",
      "--nl-muted": "#5b6475",
      "--nl-border": "#cfe0f4",
      "--nl-accent": safe.accent,
      "--nl-accent-hover": darkenHexColor(safe.accent, 0.2),
      "--nl-header-start": safe.headerStart,
      "--nl-header-end": safe.headerEnd,
      "--nl-frame-outline": "rgb(255 255 255 / 28%)"
    };
  }
  function frameLabel(frameId) {
    return frameId === "custom" ? "\u30AB\u30B9\u30BF\u30E0" : getFramePreset(frameId)?.label || FRAME_PRESETS[DEFAULT_FRAME_ID].label;
  }
  function renderFrameSelection(frameId) {
    const labelEl = $("frameCurrentLabel");
    if (labelEl) labelEl.textContent = frameLabel(frameId);
    const chips = Array.from(document.querySelectorAll(".nl-frame-chip"));
    for (const chip of chips) {
      const id = String(chip.getAttribute("data-frame-id") || "");
      const active = id === frameId;
      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-selected", active ? "true" : "false");
    }
  }
  function renderCustomFrameEditor(custom) {
    const safe = sanitizeCustomFrame(custom);
    const start = (
      /** @type {HTMLInputElement|null} */
      $("frameHeaderStart")
    );
    const end = (
      /** @type {HTMLInputElement|null} */
      $("frameHeaderEnd")
    );
    const accent = (
      /** @type {HTMLInputElement|null} */
      $("frameAccent")
    );
    if (start) start.value = safe.headerStart;
    if (end) end.value = safe.headerEnd;
    if (accent) accent.value = safe.accent;
  }
  function applyPopupFrame(frameId, custom) {
    const root = document.documentElement;
    const normalized = normalizeFrameId(frameId);
    const selectedFrame = normalized === "custom" || hasFramePreset(normalized) ? normalized : DEFAULT_FRAME_ID;
    const vars = resolveFrameVars(selectedFrame, custom);
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
    renderFrameSelection(selectedFrame);
    renderCustomFrameEditor(custom);
    syncFrameShareInput();
  }
  function openFrameThemeSectionIfPresent() {
    const theme = (
      /** @type {HTMLDetailsElement|null} */
      $("frameThemeDetails")
    );
    if (theme) theme.open = true;
  }
  async function loadPopupFrameSettings() {
    const bag = await chrome.storage.local.get([
      KEY_POPUP_FRAME,
      KEY_POPUP_FRAME_CUSTOM
    ]);
    const rawFrameId = normalizeFrameId(bag[KEY_POPUP_FRAME]);
    const frameId = rawFrameId === "custom" || hasFramePreset(rawFrameId) ? rawFrameId : DEFAULT_FRAME_ID;
    const custom = sanitizeCustomFrame(bag[KEY_POPUP_FRAME_CUSTOM]);
    popupFrameState.id = frameId;
    popupFrameState.custom = custom;
    applyPopupFrame(frameId, custom);
    if (frameId === "custom") openFrameThemeSectionIfPresent();
  }
  async function savePopupFrameSettings() {
    await chrome.storage.local.set({
      [KEY_POPUP_FRAME]: popupFrameState.id,
      [KEY_POPUP_FRAME_CUSTOM]: popupFrameState.custom
    });
  }
  function encodeBase64UrlUtf8(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }
  function decodeBase64UrlUtf8(text) {
    let base64 = text.replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    if (pad) base64 += "=".repeat(4 - pad);
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  function createFrameShareCode(frameId, custom) {
    const normalized = normalizeFrameId(frameId);
    const safeId = normalized === "custom" || hasFramePreset(normalized) ? normalized : DEFAULT_FRAME_ID;
    const payload = {
      v: 1,
      frame: safeId,
      custom: sanitizeCustomFrame(custom)
    };
    const encoded = encodeBase64UrlUtf8(JSON.stringify(payload));
    return `nlsframe.${encoded}`;
  }
  function parseFrameShareCode(raw) {
    const code = String(raw || "").trim();
    if (!code) {
      throw new Error("\u5171\u6709\u30B3\u30FC\u30C9\u304C\u7A7A\u3067\u3059\u3002");
    }
    const payloadText = code.startsWith("nlsframe.") ? decodeBase64UrlUtf8(code.slice("nlsframe.".length)) : code;
    const payload = JSON.parse(payloadText);
    const source = payload && typeof payload === "object" ? payload : {};
    const frameValue = normalizeFrameId(
      /** @type {{ frame?: unknown }} */
      source.frame || ""
    );
    const frameId = frameValue === "custom" || hasFramePreset(frameValue) ? frameValue : DEFAULT_FRAME_ID;
    return {
      frameId,
      custom: sanitizeCustomFrame(
        /** @type {{ custom?: unknown }} */
        source.custom || {}
      )
    };
  }
  function setFrameShareStatus(message, kind = "idle") {
    const status = $("frameShareStatus");
    if (!status) return;
    status.textContent = message;
    status.classList.remove("error", "success");
    if (kind === "error") status.classList.add("error");
    if (kind === "success") status.classList.add("success");
  }
  function copyTextViaExecCommand(text) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "true");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    area.style.top = "0";
    area.style.opacity = "0";
    area.style.pointerEvents = "none";
    document.body.appendChild(area);
    area.focus();
    area.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(area);
    return copied;
  }
  async function copyTextToClipboard(text) {
    let embedded = false;
    try {
      embedded = window.self !== window.top;
    } catch {
      embedded = true;
    }
    if (embedded) {
      return copyTextViaExecCommand(text);
    }
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return copyTextViaExecCommand(text);
    }
  }
  function formatAiShareDiagnosticsMarkdown(parts) {
    const lines = [];
    lines.push("## nicolivelog \u8A3A\u65AD\u30D0\u30F3\u30C9\u30EB\uFF08AI \u5171\u6709\u7528\uFF09");
    lines.push("");
    lines.push(
      "\u6B21\u306E JSON \u30D6\u30ED\u30C3\u30AF\u3092\u305D\u306E\u307E\u307E AI \u306B\u8CBC\u3063\u3066\u304F\u3060\u3055\u3044\u3002\u62E1\u5F35\u3092\u518D\u8AAD\u307F\u8FBC\u307F\u3057\u305F\u76F4\u5F8C\u306F watch \u30DA\u30FC\u30B8\u3092 **F5** \u3057\u3066\u304F\u3060\u3055\u3044\u3002"
    );
    lines.push("");
    lines.push(`- \u62E1\u5F35: ${parts.extensionName} v${parts.extensionVersion}`);
    lines.push(`- \u30BF\u30D6\u9078\u629E: ${parts.watchUrlNote}`);
    if (parts.lastSendMessageError) {
      lines.push(`- content \u3078\u306E\u9001\u4FE1: \`${parts.lastSendMessageError}\``);
    }
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(parts.payload, null, 2));
    lines.push("```");
    return lines.join("\n");
  }
  function syncFrameShareInput() {
    const input = (
      /** @type {HTMLTextAreaElement|null} */
      $("frameShareCode")
    );
    if (!input) return;
    input.value = createFrameShareCode(popupFrameState.id, popupFrameState.custom);
  }
  var STORY_RINK_FACE_IMG = "images/toumeilink.png";
  var STORY_RINK_COLLECTING_JPG = "images/icon/kewXCUOt_400x400.jpg";
  var STORY_GRID_DEFAULT_TILE_IMG = "images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png";
  var STORY_GUIDE_FACE_RINK = "images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png";
  var STORY_GUIDE_FACE_KONTA = "images/yukkuri-charactore-english/konta/kitsune-yukkuri-half-eyes-mouth-closed.png";
  var STORY_GUIDE_FACE_TANU = "images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-half-eyes-mouth-closed.png";
  var STORY_REMOTE_FAILED_PLACEHOLDER_IMG = NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS;
  function storyTileUsesYukkuriTvStyle(requestedSrc, displaySrc) {
    const r = String(requestedSrc || "");
    const d = String(displaySrc || "");
    return r.includes("yukkuri-charactore-english") || d.includes("yukkuri-charactore-english");
  }
  function applyStoryAvatarTvFallbackClass(img) {
    if (!(img instanceof HTMLImageElement)) return;
    try {
      const s = String(img.currentSrc || img.src || "");
      if (/nicoaccount\/usericon\/defaults\//i.test(s)) return;
    } catch {
    }
    if (img.classList.contains("nl-story-userlane-avatar")) {
      img.classList.add("nl-avatar--tv-fallback");
      return;
    }
    if (img.classList.contains("nl-story-growth-icon")) {
      img.classList.add("nl-story-growth-icon--tv-fallback");
      return;
    }
    if (img.classList.contains("nl-story-detail-img")) {
      img.classList.add("nl-story-detail-img--tv-fallback");
    }
  }
  var storyAvatarLoadGuard = createSupportAvatarLoadGuard({
    fallbackSrc: STORY_REMOTE_FAILED_PLACEHOLDER_IMG,
    onFallbackApplied: applyStoryAvatarTvFallbackClass
  });
  var MAX_SELF_POSTED_ITEMS = 48;
  var SELF_POST_DUPLICATE_WINDOW_MS = 5e3;
  var SELF_POST_MATCH_LATE_MS = 10 * 60 * 1e3;
  var SELF_POST_MATCH_EARLY_MS = 30 * 1e3;
  var SELF_POST_RECENT_TTL_MS = 24 * 60 * 60 * 1e3;
  var selfPostedRecentsCache = [];
  var SELF_POST_MATCH_CACHE = {
    entriesRef: (
      /** @type {PopupCommentEntry[]|null} */
      null
    ),
    liveId: "",
    recentFingerprint: "",
    entriesFingerprint: "",
    matchedIds: /* @__PURE__ */ new Set()
  };
  function popupEntryStableId(entry, fallbackLiveId = "") {
    if (!entry) return "";
    const id = String(entry.id || "").trim();
    if (id) return id;
    const lid = String(entry.liveId || fallbackLiveId || STORY_SOURCE_STATE.liveId || "").trim().toLowerCase();
    return `legacy:${buildDedupeKey(lid, {
      commentNo: entry.commentNo,
      text: String(entry.text || ""),
      capturedAt: entry.capturedAt
    })}`;
  }
  function selfPostedEntryFingerprint(entries) {
    const list = Array.isArray(entries) ? entries : [];
    if (!list.length) return "0";
    const first = list[0];
    const last = list[list.length - 1];
    return `${list.length}|${popupEntryStableId(first)}|${popupEntryStableId(last)}|${Number(last?.capturedAt || 0)}`;
  }
  function buildOwnPostedMatchedIdSet(entries, liveId) {
    return matchSelfPostedRecentsToEntries(entries, liveId).matchedIds;
  }
  function getOwnPostedMatchedIdSet(entries, liveId) {
    const list = Array.isArray(entries) ? entries : [];
    const lid = String(liveId || "").trim().toLowerCase();
    const recentFingerprint = selfPostedRecentsFingerprintForLive(lid);
    const entriesFingerprint = selfPostedEntryFingerprint(list);
    if (SELF_POST_MATCH_CACHE.entriesRef === list && SELF_POST_MATCH_CACHE.liveId === lid && SELF_POST_MATCH_CACHE.recentFingerprint === recentFingerprint && SELF_POST_MATCH_CACHE.entriesFingerprint === entriesFingerprint) {
      return SELF_POST_MATCH_CACHE.matchedIds;
    }
    const matchedIds = buildOwnPostedMatchedIdSet(list, lid);
    SELF_POST_MATCH_CACHE.entriesRef = list;
    SELF_POST_MATCH_CACHE.liveId = lid;
    SELF_POST_MATCH_CACHE.recentFingerprint = recentFingerprint;
    SELF_POST_MATCH_CACHE.entriesFingerprint = entriesFingerprint;
    SELF_POST_MATCH_CACHE.matchedIds = matchedIds;
    return matchedIds;
  }
  function applySelfPostedRecentsFromBag(bag) {
    try {
      const raw = bag[KEY_SELF_POSTED_RECENTS];
      const items = raw && typeof raw === "object" && Array.isArray(raw.items) ? raw.items : [];
      const now = Date.now();
      selfPostedRecentsCache = items.filter(
        (x) => x && typeof x.liveId === "string" && typeof x.textNorm === "string" && typeof x.at === "number" && now - x.at < SELF_POST_RECENT_TTL_MS
      );
    } catch {
      selfPostedRecentsCache = [];
    }
  }
  async function appendSelfPostedComment(liveId, rawText) {
    const lid = String(liveId || "").trim().toLowerCase();
    const textNorm = normalizeCommentText(rawText);
    if (!lid || !textNorm) return;
    const at = Date.now();
    const next = selfPostedRecentsCache.filter((it) => at - it.at < SELF_POST_RECENT_TTL_MS);
    const duplicated = next.some(
      (it) => String(it.liveId || "").trim().toLowerCase() === lid && String(it.textNorm || "") === textNorm && Math.abs(at - (Number(it.at) || 0)) < SELF_POST_DUPLICATE_WINDOW_MS
    );
    if (duplicated) return;
    next.push({ liveId: lid, at, textNorm });
    while (next.length > MAX_SELF_POSTED_ITEMS) next.shift();
    selfPostedRecentsCache = next;
    try {
      await storageSetSafe({
        [KEY_SELF_POSTED_RECENTS]: { items: next }
      });
    } catch {
    }
  }
  async function revertLastSelfPostedComment(liveId, rawText) {
    const lid = String(liveId || "").trim().toLowerCase();
    const textNorm = normalizeCommentText(rawText);
    if (!lid || !textNorm) return;
    let bestIdx = -1;
    let bestAt = -1;
    for (let i = 0; i < selfPostedRecentsCache.length; i += 1) {
      const it = selfPostedRecentsCache[i];
      if (String(it.liveId).toLowerCase() !== lid) continue;
      if (it.textNorm !== textNorm) continue;
      const t = Number(it.at) || 0;
      if (t >= bestAt) {
        bestAt = t;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) return;
    const next = selfPostedRecentsCache.filter((_, i) => i !== bestIdx);
    selfPostedRecentsCache = next;
    try {
      await storageSetSafe({
        [KEY_SELF_POSTED_RECENTS]: { items: next }
      });
    } catch {
    }
  }
  function isOwnPostedSupportComment(entry, liveId, entries = STORY_SOURCE_STATE.entries) {
    if (!entry) return false;
    if (entry.selfPosted) return true;
    const lid = String(liveId || STORY_SOURCE_STATE.liveId || "").trim().toLowerCase();
    if (!lid) return false;
    const list = Array.isArray(entries) ? entries : [];
    if (list.length > 0) {
      const matchedIds = getOwnPostedMatchedIdSet(list, lid);
      return matchedIds.has(popupEntryStableId(entry, lid));
    }
    const norm = normalizeCommentText(entry.text);
    if (!norm) return false;
    const cap = Number(entry.capturedAt) || 0;
    for (const it of selfPostedRecentsCache) {
      if (String(it.liveId).toLowerCase() !== lid) continue;
      if (it.textNorm !== norm) continue;
      if (cap >= it.at - SELF_POST_MATCH_EARLY_MS && cap <= it.at + SELF_POST_MATCH_LATE_MS) {
        return true;
      }
    }
    return false;
  }
  var popupUserCommentProfileMap = (
    /** @type {null|Record<string, { nickname?: string, avatarUrl?: string, updatedAt: number }>} */
    null
  );
  function popupMergeUserCommentProfileCache(arr) {
    if (!popupUserCommentProfileMap) {
      return { arr, commentsPatched: false, cacheTouched: false };
    }
    let cacheTouched = false;
    for (const e of arr) {
      if (upsertUserCommentProfileFromEntry(popupUserCommentProfileMap, e)) {
        cacheTouched = true;
      }
    }
    const ap = applyUserCommentProfileMapToEntries(arr, popupUserCommentProfileMap);
    const nextArr = ap.patched > 0 ? ap.next : arr;
    const beforeK = Object.keys(popupUserCommentProfileMap).length;
    popupUserCommentProfileMap = pruneUserCommentProfileMap(popupUserCommentProfileMap);
    if (Object.keys(popupUserCommentProfileMap).length !== beforeK) {
      cacheTouched = true;
    }
    return {
      arr: nextArr,
      commentsPatched: ap.patched > 0,
      cacheTouched
    };
  }
  async function runDeferredUserCommentProfileHydrate(ctx) {
    const { refreshGen, commentsKey, getArr, setArr, paint } = ctx;
    try {
      if (!hasExtensionContext()) return;
      if (refreshGen !== watchPopupRefreshGeneration) return;
      const bag = await readStorageBagWithRetry(
        () => chrome.storage.local.get(KEY_USER_COMMENT_PROFILE_CACHE),
        { attempts: 4, delaysMs: [0, 60, 150, 300] }
      );
      if (refreshGen !== watchPopupRefreshGeneration) return;
      if (!popupUserCommentProfileMap) return;
      const late = normalizeUserCommentProfileMap(
        bag[KEY_USER_COMMENT_PROFILE_CACHE]
      );
      if (!Object.keys(late).length) return;
      const hydrated = hydrateUserCommentProfileMapFromStorage(
        popupUserCommentProfileMap,
        late
      );
      if (!hydrated) return;
      const prof = popupMergeUserCommentProfileCache(getArr());
      setArr(prof.arr);
      const save = {};
      if (prof.commentsPatched) save[commentsKey] = prof.arr;
      if (prof.cacheTouched || hydrated) {
        save[KEY_USER_COMMENT_PROFILE_CACHE] = popupUserCommentProfileMap;
      }
      if (Object.keys(save).length) {
        await storageSetSafe(save);
      }
      if (refreshGen !== watchPopupRefreshGeneration) return;
      paint();
    } catch (e) {
      if (isExtensionContextInvalidatedError(e)) return;
    }
  }
  function scheduleDeferredUserCommentProfileHydrate(ctx) {
    const run = () => {
      void runDeferredUserCommentProfileHydrate(ctx);
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: 900 });
    } else {
      setTimeout(run, 200);
    }
  }
  function rememberedAvatarUrlForUserId(userId) {
    const uid = String(userId || "").trim();
    if (!uid) return "";
    const fromCache = String(
      popupUserCommentProfileMap?.[uid]?.avatarUrl || ""
    ).trim();
    if (fromCache && isHttpOrHttpsUrl(fromCache) && !isWeakNiconicoUserIconHttpUrl(fromCache)) {
      return fromCache;
    }
    const list = STORY_SOURCE_STATE?.entries;
    if (!Array.isArray(list) || list.length === 0) return "";
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const e = list[i];
      if (String(e?.userId || "").trim() !== uid) continue;
      const av = String(e?.avatarUrl || "").trim();
      if (av && isHttpOrHttpsUrl(av) && !isWeakNiconicoUserIconHttpUrl(av)) {
        return av;
      }
    }
    return "";
  }
  function avatarCompareKey(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    try {
      const u = new URL(s);
      u.search = "";
      u.hash = "";
      return u.href;
    } catch {
      return s;
    }
  }
  function isSameAvatarUrl(a, b) {
    const ka = avatarCompareKey(a);
    const kb = avatarCompareKey(b);
    return Boolean(ka && kb && ka === kb);
  }
  function countEntriesWithUserId(entries) {
    let n = 0;
    for (const e of entries) {
      if (String(e?.userId || "").trim()) n += 1;
    }
    return n;
  }
  function countEntriesWithAvatar(entries) {
    let n = 0;
    for (const e of entries) {
      if (isHttpOrHttpsUrl(String(e?.avatarUrl || "").trim())) n += 1;
    }
    return n;
  }
  function countUniqueAvatarEntries(entries) {
    const set = /* @__PURE__ */ new Set();
    for (const e of entries) {
      const k = avatarCompareKey(String(e?.avatarUrl || "").trim());
      if (k) set.add(k);
    }
    return set.size;
  }
  function countResolvedAvatarEntries(entries, liveId) {
    const list = Array.isArray(entries) ? entries : [];
    const lid = String(liveId || "").trim();
    if (!lid || !list.length) return { total: 0, unique: 0 };
    let total = 0;
    const unique = /* @__PURE__ */ new Set();
    for (const entry of list) {
      const src = storyGrowthAvatarSrcCandidate(entry, lid, list);
      const key = avatarCompareKey(src);
      if (!key) continue;
      total += 1;
      unique.add(key);
    }
    return { total, unique: unique.size };
  }
  function countPendingSelfPostedRecentsForLive(liveId) {
    const lid = String(liveId || "").trim().toLowerCase();
    if (!lid) return 0;
    let n = 0;
    for (const it of selfPostedRecentsCache) {
      if (String(it.liveId).toLowerCase() === lid) n += 1;
    }
    return n;
  }
  function countOwnPostedEntries(entries, liveId) {
    const list = Array.isArray(entries) ? entries : [];
    const lid = String(liveId || "").trim().toLowerCase();
    if (!lid || !list.length) return 0;
    const matchedIds = getOwnPostedMatchedIdSet(list, lid);
    let n = 0;
    for (const entry of list) {
      if (Boolean(entry?.selfPosted) || matchedIds.has(popupEntryStableId(entry, lid))) {
        n += 1;
      }
    }
    return n;
  }
  function countSavedOwnPostedEntries(entries) {
    const list = Array.isArray(entries) ? entries : [];
    let n = 0;
    for (const entry of list) {
      if (entry?.selfPosted) n += 1;
    }
    return n;
  }
  function matchSelfPostedRecentsToEntries(entries, liveId) {
    const list = Array.isArray(entries) ? entries : [];
    const lid = String(liveId || "").trim().toLowerCase();
    const matchedIds = /* @__PURE__ */ new Set();
    const consumedIndexes = /* @__PURE__ */ new Set();
    if (!lid || !list.length || !selfPostedRecentsCache.length) {
      return { matchedIds, consumedIndexes };
    }
    const recents = selfPostedRecentsCache.map((it, itemIndex) => ({
      itemIndex,
      liveId: String(it?.liveId || "").trim().toLowerCase(),
      at: Number(it?.at) || 0,
      textNorm: String(it?.textNorm || "")
    })).filter((it) => it.liveId === lid && it.at > 0 && it.textNorm).sort((a, b) => a.at - b.at || a.itemIndex - b.itemIndex);
    if (!recents.length) {
      return { matchedIds, consumedIndexes };
    }
    const byText = /* @__PURE__ */ new Map();
    for (let i = 0; i < list.length; i += 1) {
      const entry = list[i];
      const textNorm = normalizeCommentText(entry?.text);
      const id = popupEntryStableId(entry, lid);
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
    for (const recent of recents) {
      const bucket = byText.get(recent.textNorm);
      if (!bucket?.length) continue;
      let best = null;
      let bestScore = Number.POSITIVE_INFINITY;
      let bestIndex = Number.POSITIVE_INFINITY;
      for (const candidate of bucket) {
        if (matchedIds.has(candidate.id)) continue;
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
      matchedIds.add(best.id);
      consumedIndexes.add(recent.itemIndex);
    }
    return { matchedIds, consumedIndexes };
  }
  function reconcileStoredOwnPostedEntries(entries, liveId) {
    const list = Array.isArray(entries) ? entries : [];
    const lid = String(liveId || "").trim().toLowerCase();
    if (!lid || !list.length || !selfPostedRecentsCache.length) {
      return {
        next: list,
        remaining: selfPostedRecentsCache,
        changed: false,
        pendingChanged: false
      };
    }
    const { matchedIds, consumedIndexes } = matchSelfPostedRecentsToEntries(list, lid);
    if (!matchedIds.size && !consumedIndexes.size) {
      return {
        next: list,
        remaining: selfPostedRecentsCache,
        changed: false,
        pendingChanged: false
      };
    }
    let changed = false;
    const next = list.map((entry) => {
      const id = popupEntryStableId(entry, lid);
      if (!id || !matchedIds.has(id) || entry?.selfPosted) return entry;
      changed = true;
      return { ...entry, selfPosted: true };
    });
    return {
      next,
      remaining: selfPostedRecentsCache.filter((_, i) => !consumedIndexes.has(i)),
      changed,
      pendingChanged: consumedIndexes.size > 0
    };
  }
  function buildDisplayCommentEntries(entries, liveId) {
    const list = Array.isArray(entries) ? entries : [];
    const lid = String(liveId || "").trim().toLowerCase();
    if (!lid || !selfPostedRecentsCache.length) return list;
    const { consumedIndexes } = matchSelfPostedRecentsToEntries(list, lid);
    const viewerUid = String(watchMetaCache.snapshot?.viewerUserId || "").trim();
    const viewerNick = String(watchMetaCache.snapshot?.viewerNickname || "").trim();
    const viewerAvatarUrl = String(watchMetaCache.snapshot?.viewerAvatarUrl || "").trim();
    const pending = selfPostedRecentsCache.map((it, itemIndex) => ({ it, itemIndex })).filter(({ it, itemIndex }) => {
      if (consumedIndexes.has(itemIndex)) return false;
      return String(it?.liveId || "").trim().toLowerCase() === lid && Number(it?.at) > 0 && Boolean(String(it?.textNorm || "").trim());
    }).sort((a, b) => (Number(a.it?.at) || 0) - (Number(b.it?.at) || 0)).map(({ it, itemIndex }) => ({
      id: `pending-self:${lid}:${itemIndex}:${Number(it?.at) || 0}`,
      liveId: lid,
      text: String(it?.textRaw || it?.textNorm || "").trim(),
      userId: viewerUid || null,
      nickname: viewerNick,
      avatarUrl: isHttpOrHttpsUrl(viewerAvatarUrl) ? viewerAvatarUrl : "",
      selfPosted: true,
      capturedAt: Number(it?.at) || Date.now()
    }));
    if (!pending.length) return list;
    return [...list, ...pending];
  }
  function storyGrowthAvatarSrcCandidate(entry, liveId, entries = STORY_SOURCE_STATE.entries) {
    const snap = watchMetaCache.snapshot;
    const own = isOwnPostedSupportComment(entry, String(liveId || ""), entries);
    const bc = String(snap?.broadcasterUserId || "").trim();
    const entUid = String(entry?.userId || "").trim();
    const avatarUrl = String(entry?.avatarUrl || "").trim();
    const viewerAvatarUrl = String(snap?.viewerAvatarUrl || "").trim();
    const mistakenBroadcaster = !own && Boolean(bc && entUid && bc === entUid);
    const fallbackAvatar = mistakenBroadcaster || viewerAvatarUrl && isSameAvatarUrl(avatarUrl, viewerAvatarUrl) && !own ? "" : rememberedAvatarUrlForUserId(entUid);
    const effectiveAvatar = viewerAvatarUrl && isSameAvatarUrl(avatarUrl, viewerAvatarUrl) && !own ? "" : avatarUrl;
    const src = resolveSupportGrowthTileSrc({
      entryAvatarUrl: effectiveAvatar || fallbackAvatar,
      userId: mistakenBroadcaster ? null : entry?.userId ?? null,
      isOwnPosted: own,
      viewerAvatarUrl: snap?.viewerAvatarUrl,
      defaultSrc: ""
    });
    return isHttpOrHttpsUrl(src) ? src : "";
  }
  function storyGrowthTileSrcForEntry(entry, liveId, entries = STORY_SOURCE_STATE.entries) {
    const candidate = storyGrowthAvatarSrcCandidate(entry, liveId, entries);
    if (candidate) return candidate;
    return pickSupportGrowthFallbackTileSrc(
      entry?.userId,
      "",
      STORY_GRID_DEFAULT_TILE_IMG,
      STORY_REMOTE_FAILED_PLACEHOLDER_IMG
    );
  }
  function userLaneProfileCompletenessTier(entry, httpCandidate) {
    const uid = String(entry?.userId || "").trim();
    if (!uid) return 0;
    const nick = String(entry?.nickname || "").trim();
    const rawAv = String(entry?.avatarUrl || "").trim();
    const t = supportGridDisplayTier({
      userId: uid,
      nickname: nick,
      httpAvatarCandidate: httpCandidate,
      storedAvatarUrl: rawAv
    });
    if (t === SUPPORT_GRID_TIER_RINK) return 3;
    if (t === SUPPORT_GRID_TIER_KONTA) return 2;
    return 1;
  }
  function storyUserLaneMetaLines(entry, httpCandidate, userLaneDedupeKey2 = "") {
    const uid = String(entry?.userId || "").trim();
    const nick = String(entry?.nickname || "").trim();
    const hasHttp = isHttpOrHttpsUrl(httpCandidate);
    const dk = String(userLaneDedupeKey2 || "");
    if (!uid) {
      if (dk.startsWith("t:")) {
        return {
          idLine: "\u2014",
          nameLine: "\u30E6\u30FC\u30B6\u30FCID\u672A\u53D6\u5F97\uFF08\u30B5\u30E0\u30CDURL\u3067\u533A\u5225\uFF09"
        };
      }
      if (dk.startsWith("s:")) {
        return {
          idLine: "\u2014",
          nameLine: "\u30E6\u30FC\u30B6\u30FCID\u672A\u53D6\u5F97\uFF08\u884CID\u3067\u533A\u5225\uFF09"
        };
      }
      return { idLine: "\u2014", nameLine: "ID\u672A\u53D6\u5F97" };
    }
    if (isAnonymousStyleNicoUserId(uid)) {
      const idLine2 = compactNicoLaneUserId(uid);
      const nameLine = anonymousNicknameFallback(uid, nick);
      return {
        idLine: idLine2 || "\u2014",
        nameLine: nameLine || "\u2014"
      };
    }
    const idLine = shortUserKeyDisplay(uid) || uid;
    const numeric = /^\d{5,14}$/.test(uid);
    if (numeric && hasHttp && nick) {
      return { idLine, nameLine: nick };
    }
    if (numeric && !nick) {
      return { idLine, nameLine: "\uFF08\u672A\u53D6\u5F97\uFF09" };
    }
    if (nick) {
      return { idLine, nameLine: nick };
    }
    return { idLine, nameLine: "\uFF08\u672A\u53D6\u5F97\uFF09" };
  }
  var STORY_HOP_STATE = {
    clearTimer: (
      /** @type {ReturnType<typeof setTimeout>|null} */
      null
    )
  };
  function triggerStoryFaceHop(avatarsEl) {
    if (STORY_HOP_STATE.clearTimer) {
      clearTimeout(STORY_HOP_STATE.clearTimer);
      STORY_HOP_STATE.clearTimer = null;
    }
    const face = avatarsEl.querySelector(".nl-story-face");
    if (!face) return;
    face.classList.remove("is-hop");
    void avatarsEl.offsetWidth;
    face.classList.add("is-hop");
    STORY_HOP_STATE.clearTimer = window.setTimeout(() => {
      face.classList.remove("is-hop");
      STORY_HOP_STATE.clearTimer = null;
    }, 580);
  }
  function truncateText(value, max) {
    const s = String(value || "").trim();
    if (!s) return "";
    return s.length > max ? `${s.slice(0, max)}\u2026` : s;
  }
  function setSceneStory(lead, sub, opts = {}) {
    const story = (
      /** @type {HTMLElement|null} */
      document.querySelector(".nl-story")
    );
    const img = (
      /** @type {HTMLImageElement|null} */
      $("sceneStoryImg")
    );
    const leadEl = $("sceneStoryLead");
    const subEl = $("sceneStorySub");
    const deltaEl = $("sceneStoryDelta");
    const growthEl = (
      /** @type {HTMLElement|null} */
      $("sceneStoryGrowth")
    );
    const gaugeEl = (
      /** @type {HTMLElement|null} */
      $("sceneStoryGauge")
    );
    const gaugeLabel = $("sceneStoryGaugeLabel");
    const delta = Math.max(0, Number(opts.delta || 0));
    const liveId = String(opts.liveId || "");
    const count = Math.max(0, Number(opts.count || 0));
    const facePick = String(opts.faceSrc || "").trim();
    if (img) img.src = facePick || STORY_RINK_FACE_IMG;
    if (leadEl) leadEl.textContent = lead;
    if (subEl) subEl.textContent = sub;
    if (deltaEl) {
      if (delta > 0) {
        deltaEl.hidden = false;
        deltaEl.textContent = `+${delta}`;
      } else {
        deltaEl.hidden = true;
        deltaEl.textContent = "";
      }
    }
    syncStoryGrowth(liveId, count, growthEl);
    if (gaugeEl) {
      gaugeEl.classList.toggle("is-hot", delta > 0);
      gaugeEl.setAttribute(
        "aria-label",
        `\u5FDC\u63F4\u30B3\u30E1\u30F3\u30C8\u30A2\u30A4\u30B3\u30F3: \u7D2F\u8A08 ${count.toLocaleString("ja-JP")} \u30B3\u30E1\u30F3\u30C8`
      );
    }
    if (gaugeLabel) {
      gaugeLabel.textContent = count <= 0 ? "\u5FDC\u63F4 0 \u30B3\u30E1\u30F3\u30C8" : `\u5FDC\u63F4 ${count.toLocaleString("ja-JP")} \u30B3\u30E1\u30F3\u30C8 / \u30DB\u30D0\u30FC\u3067\u30D7\u30EC\u30D3\u30E5\u30FC\u30FB\u30AF\u30EA\u30C3\u30AF\u3067\u8A73\u7D30\u56FA\u5B9A\uFF08Esc\u30FB\u5916\u5074\u30AF\u30EA\u30C3\u30AF\u3067\u9589\u3058\u308B\uFF09`;
    }
    if (!story) return;
    const reaction = String(opts.reaction || "idle");
    const avatars = (
      /** @type {HTMLElement|null} */
      story.querySelector(".nl-story-avatars")
    );
    if (avatars) {
      avatars.classList.toggle("is-hop-strong", reaction === "burst" || reaction === "sparkle");
    }
    if (delta > 0 && !STORY_REACTION_STATE.reducedMotion && avatars) {
      triggerStoryFaceHop(avatars);
    }
    story.classList.remove("is-pulse", "is-burst", "is-sparkle");
    if (STORY_REACTION_STATE.reducedMotion) return;
    if (STORY_REACTION_STATE.clearTimer) {
      clearTimeout(STORY_REACTION_STATE.clearTimer);
      STORY_REACTION_STATE.clearTimer = null;
    }
    if (reaction === "pulse") story.classList.add("is-pulse");
    if (reaction === "burst") story.classList.add("is-burst");
    if (reaction === "sparkle") {
      story.classList.add("is-burst");
      story.classList.add("is-sparkle");
    }
    STORY_REACTION_STATE.clearTimer = window.setTimeout(() => {
      story.classList.remove("is-pulse", "is-burst", "is-sparkle");
      STORY_REACTION_STATE.clearTimer = null;
    }, 920);
  }
  var STORY_REACTION_STATE = {
    liveId: "",
    lastCount: null,
    clearTimer: null,
    reducedMotion: typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false
  };
  var STORY_GROWTH_STATE = {
    liveId: "",
    renderedCount: 0,
    targetCount: 0,
    root: (
      /** @type {HTMLElement|null} */
      null
    ),
    timer: (
      /** @type {ReturnType<typeof setTimeout>|null} */
      null
    ),
    /** クリックで固定したコメントの安定 ID（`comment.id` ベース、レガシーは dedupe キー） */
    pinnedCommentId: (
      /** @type {string|null} */
      null
    ),
    /** ホバー一時プレビュー（固定中は無視・上書きしない） */
    hoverPreviewCommentId: (
      /** @type {string|null} */
      null
    ),
    /** syncStorySourceEntries の内容が変わったあと DOM を付け直すための簡易シグネチャ */
    sourceSig: "",
    /** ホバー解除の遅延用 */
    hoverClearTimer: (
      /** @type {ReturnType<typeof setTimeout>|null} */
      null
    ),
    /** ホバー中アイコンの viewport 座標 */
    hoverAnchorRect: (
      /** @type {DOMRect|null} */
      null
    ),
    /** ホバー再取得用の最後のポインタ座標 */
    hoverClientX: Number.NaN,
    /** ホバー再取得用の最後のポインタ座標 */
    hoverClientY: Number.NaN
  };
  function getStoryColorScheme() {
    if (typeof window.matchMedia !== "function") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  var storyGrowthColorSchemeListenerBound = false;
  function ensureStoryGrowthColorSchemeListener() {
    if (storyGrowthColorSchemeListenerBound) return;
    storyGrowthColorSchemeListenerBound = true;
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const root = STORY_GROWTH_STATE.root;
      if (root) patchStoryGrowthIconsFromSource(root, {});
      renderStoryUserLane();
    };
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
    } else {
      mq.addListener(onChange);
    }
  }
  var STORY_SOURCE_STATE = {
    liveId: "",
    entries: (
      /** @type {PopupCommentEntry[]} */
      []
    )
  };
  var lastDevMonitorPanelParams = (
    /** @type {null|object} */
    null
  );
  var STORY_AVATAR_DIAG_STATE = {
    total: 0,
    withUid: 0,
    withAvatar: 0,
    uniqueAvatar: 0,
    resolvedAvatar: 0,
    resolvedUniqueAvatar: 0,
    selfShown: 0,
    selfSaved: 0,
    selfPending: 0,
    selfPendingMatched: 0,
    interceptItems: 0,
    interceptWithUid: 0,
    interceptWithAvatar: 0,
    mergedPatched: 0,
    mergedUidReplaced: 0,
    stripped: 0,
    /** watch ページ content の interceptedUsers サイズ（スナップショット _debug.intercept）。未取得は -1 */
    interceptMapOnPage: -1,
    /** 直近の NLS_EXPORT_INTERCEPT_CACHE 成功時の export 行数（マージ前の配列長） */
    interceptExportRows: 0,
    /** 直近 export 試行の理由コード（no_watch_tab / export_rejected / message_failed / ok_empty / ok 等） */
    interceptExportCode: "",
    /** export 失敗時の短い補足（PII なし） */
    interceptExportDetail: ""
  };
  var storyUserLaneLastRenderSig = "";
  function commentStableId(entry) {
    return popupEntryStableId(entry);
  }
  function getStoryEntryByStableId(stableId) {
    const want = String(stableId || "").trim();
    if (!want) return null;
    for (const e of STORY_SOURCE_STATE.entries) {
      if (commentStableId(e) === want) return e;
    }
    return null;
  }
  function storyHoverPreviewEnabled() {
    if (typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }
  function cancelStoryHoverClearTimer() {
    if (STORY_GROWTH_STATE.hoverClearTimer) {
      clearTimeout(STORY_GROWTH_STATE.hoverClearTimer);
      STORY_GROWTH_STATE.hoverClearTimer = null;
    }
  }
  function updateStoryHoverAnchorFromElement(el) {
    if (!(el instanceof Element)) {
      STORY_GROWTH_STATE.hoverAnchorRect = null;
      return;
    }
    try {
      STORY_GROWTH_STATE.hoverAnchorRect = el.getBoundingClientRect();
    } catch {
      STORY_GROWTH_STATE.hoverAnchorRect = null;
    }
  }
  function updateStoryHoverPointerFromEvent(ev) {
    const x = Number(ev?.clientX);
    const y = Number(ev?.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    STORY_GROWTH_STATE.hoverClientX = x;
    STORY_GROWTH_STATE.hoverClientY = y;
  }
  function findStoryHoverIconFromPointer() {
    const root = STORY_GROWTH_STATE.root;
    const x = STORY_GROWTH_STATE.hoverClientX;
    const y = STORY_GROWTH_STATE.hoverClientY;
    if (Number.isFinite(x) && Number.isFinite(y) && typeof document.elementFromPoint === "function") {
      const hit = document.elementFromPoint(x, y);
      if (hit instanceof Element) {
        const img = hit.closest("img.nl-story-growth-icon");
        if (img instanceof HTMLImageElement && (!root || root.contains(img))) {
          return img;
        }
        if ($("sceneStoryDetail")?.contains(hit)) return null;
      }
    }
    if (!root) return null;
    try {
      const hovered = root.querySelector("img.nl-story-growth-icon:hover");
      return hovered instanceof HTMLImageElement ? hovered : null;
    } catch {
      return null;
    }
  }
  function reconcileStoryHoverPreviewFromPointer() {
    if (STORY_GROWTH_STATE.pinnedCommentId) return false;
    const img = findStoryHoverIconFromPointer();
    if (!img) return false;
    const sid = String(img.getAttribute("data-comment-id") || "").trim();
    if (!sid) return false;
    STORY_GROWTH_STATE.hoverPreviewCommentId = sid;
    updateStoryHoverAnchorFromElement(img);
    cancelStoryHoverClearTimer();
    return true;
  }
  function scheduleStoryHoverClear() {
    cancelStoryHoverClearTimer();
    STORY_GROWTH_STATE.hoverClearTimer = window.setTimeout(() => {
      STORY_GROWTH_STATE.hoverClearTimer = null;
      if (!STORY_GROWTH_STATE.pinnedCommentId) {
        if (reconcileStoryHoverPreviewFromPointer()) {
          renderStoryCommentDetailPanel();
          return;
        }
        STORY_GROWTH_STATE.hoverPreviewCommentId = null;
        STORY_GROWTH_STATE.hoverAnchorRect = null;
        renderStoryCommentDetailPanel();
      }
    }, 140);
  }
  function clearPinnedStoryComment() {
    STORY_GROWTH_STATE.pinnedCommentId = null;
    STORY_GROWTH_STATE.hoverPreviewCommentId = null;
    STORY_GROWTH_STATE.hoverAnchorRect = null;
    cancelStoryHoverClearTimer();
    syncGrowthIconSelection(STORY_GROWTH_STATE.root);
    renderStoryCommentDetailPanel();
  }
  function syncGrowthIconSelection(root) {
    if (!root) return;
    const pin = STORY_GROWTH_STATE.pinnedCommentId;
    for (const el of root.querySelectorAll("img.nl-story-growth-icon")) {
      const id = el.getAttribute("data-comment-id");
      const on = Boolean(pin && id && id === pin);
      el.classList.toggle("is-selected", on);
      const cell = el.closest(".nl-story-growth-cell");
      if (cell instanceof HTMLElement) {
        cell.classList.toggle("nl-story-growth-cell--selected", on);
      }
    }
  }
  var storyGlobalDismissBound = false;
  function ensureStoryGlobalDismissHandlers() {
    if (storyGlobalDismissBound) return;
    storyGlobalDismissBound = true;
    document.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape") return;
      if (!STORY_GROWTH_STATE.pinnedCommentId) return;
      ev.preventDefault();
      clearPinnedStoryComment();
    });
    document.addEventListener(
      "pointerdown",
      (ev) => {
        if (!STORY_GROWTH_STATE.pinnedCommentId) return;
        const t = ev.target;
        if (!(t instanceof Node)) return;
        const g = $("sceneStoryGrowth");
        const d = $("sceneStoryDetail");
        if (g?.contains(t) || d?.contains(t)) return;
        clearPinnedStoryComment();
      },
      false
    );
  }
  function bindStoryDetailHoverBridge() {
    const detail = $("sceneStoryDetail");
    if (!detail || detail.dataset.nlDetailHoverBound === "1") return;
    detail.dataset.nlDetailHoverBound = "1";
    detail.addEventListener("pointerenter", () => {
      cancelStoryHoverClearTimer();
    });
    detail.addEventListener("pointerleave", (ev) => {
      if (STORY_GROWTH_STATE.pinnedCommentId) return;
      const rel = ev.relatedTarget;
      if (rel instanceof Element && rel.closest?.("#sceneStoryGrowth")) return;
      if (rel instanceof Element && rel.closest?.("img.nl-story-growth-icon"))
        return;
      STORY_GROWTH_STATE.hoverPreviewCommentId = null;
      STORY_GROWTH_STATE.hoverAnchorRect = null;
      renderStoryCommentDetailPanel();
    });
  }
  function storyUserLaneRenderSignature(liveId, colorScheme, picked, sourceEntryCount) {
    const lid = String(liveId || "").trim().toLowerCase();
    const scheme = String(colorScheme || "light");
    if (!picked.length) {
      const n = Math.max(0, Math.floor(Number(sourceEntryCount) || 0));
      return `${lid}|${scheme}|0|src:${n}`;
    }
    const parts = picked.map((p) => {
      const sid = commentStableId(p.entry);
      return [
        sid,
        p.displaySrc,
        p.meta.idLine,
        p.meta.nameLine,
        String(p.profileTier)
      ].join("");
    });
    return `${lid}|${scheme}|${picked.length}${parts.join("")}`;
  }
  function renderStoryUserLane() {
    const stack = (
      /** @type {HTMLElement|null} */
      $("sceneStoryUserLaneStack")
    );
    const laneRink = (
      /** @type {HTMLElement|null} */
      $("sceneStoryUserLaneRink")
    );
    const laneKonta = (
      /** @type {HTMLElement|null} */
      $("sceneStoryUserLaneKonta")
    );
    const laneTanu = (
      /** @type {HTMLElement|null} */
      $("sceneStoryUserLaneTanu")
    );
    const hintRink = (
      /** @type {HTMLElement|null} */
      $("sceneStoryUserLaneRinkHint")
    );
    const rinkWrap = (
      /** @type {HTMLElement|null} */
      $("sceneStoryUserLaneRinkWrap")
    );
    const guideTop = (
      /** @type {HTMLElement|null} */
      $("sceneStoryUserLaneGuideTop")
    );
    const guideLinesTop = (
      /** @type {HTMLElement|null} */
      $("sceneStoryUserLaneGuideLinesTop")
    );
    const guideMidKonta = (
      /** @type {HTMLElement|null} */
      $("sceneStoryUserLaneGuideMidKonta")
    );
    const guideLinesMidKonta = (
      /** @type {HTMLElement|null} */
      $("sceneStoryUserLaneGuideLinesMidKonta")
    );
    const guideMidTanu = (
      /** @type {HTMLElement|null} */
      $("sceneStoryUserLaneGuideMidTanu")
    );
    const guideLinesMidTanu = (
      /** @type {HTMLElement|null} */
      $("sceneStoryUserLaneGuideLinesMidTanu")
    );
    const guideBottom = (
      /** @type {HTMLElement|null} */
      $("sceneStoryUserLaneGuideBottom")
    );
    const guideLinesBottom = (
      /** @type {HTMLElement|null} */
      $("sceneStoryUserLaneGuideLinesBottom")
    );
    if (!stack || !laneRink || !laneKonta || !laneTanu) return;
    const clearMidGuides = () => {
      if (guideMidKonta) guideMidKonta.hidden = true;
      if (guideLinesMidKonta) guideLinesMidKonta.innerHTML = "";
      if (guideMidTanu) guideMidTanu.hidden = true;
      if (guideLinesMidTanu) guideLinesMidTanu.innerHTML = "";
    };
    const resetLaneTierCells = () => {
      laneRink.innerHTML = "";
      laneKonta.innerHTML = "";
      laneTanu.innerHTML = "";
      laneRink.hidden = true;
      laneKonta.hidden = true;
      laneTanu.hidden = true;
      if (hintRink) hintRink.hidden = true;
      if (rinkWrap) rinkWrap.hidden = true;
    };
    const hideUserLaneStackFully = () => {
      resetLaneTierCells();
      clearMidGuides();
      stack.hidden = true;
    };
    const entries = Array.isArray(STORY_SOURCE_STATE.entries) ? STORY_SOURCE_STATE.entries : [];
    if (!entries.length) {
      storyUserLaneLastRenderSig = "";
      hideUserLaneStackFully();
      if (guideTop) guideTop.hidden = true;
      if (guideLinesTop) guideLinesTop.innerHTML = "";
      if (guideBottom) guideBottom.hidden = true;
      if (guideLinesBottom) guideLinesBottom.innerHTML = "";
      return;
    }
    const limit = INLINE_MODE ? 48 : 24;
    const seen = /* @__PURE__ */ new Set();
    const liveId = String(STORY_SOURCE_STATE.liveId || "");
    const laneScheme = getStoryColorScheme();
    const candidates = [];
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const e = entries[i];
      const uidRaw = String(e?.userId || "").trim();
      if (!uidRaw) continue;
      const httpCandidate = storyGrowthAvatarSrcCandidate(e, liveId);
      const dedupeKey = userLaneDedupeKey({
        userId: uidRaw,
        avatarHttpCandidate: "",
        stableId: ""
      });
      if (!dedupeKey) continue;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const displaySrc = pickSupportGrowthFallbackTileSrc(
        e?.userId,
        httpCandidate,
        STORY_GRID_DEFAULT_TILE_IMG,
        STORY_REMOTE_FAILED_PLACEHOLDER_IMG
      );
      if (!displaySrc) continue;
      const label = storyGrowthDisplayLabel(e, liveId) || "\u30E6\u30FC\u30B6\u30FC";
      const meta = storyUserLaneMetaLines(e, httpCandidate, dedupeKey);
      const thumbScore = userLaneResolvedThumbScore(e?.userId, httpCandidate);
      const profileTier = userLaneProfileCompletenessTier(e, httpCandidate);
      candidates.push({
        entryIndex: i,
        profileTier,
        thumbScore,
        displaySrc,
        title: label,
        entry: e,
        meta
      });
    }
    const laneUidSortRank = (uidRaw) => {
      const s = String(uidRaw || "").trim();
      if (/^\d{5,14}$/.test(s)) return 0;
      if (/^a:/i.test(s)) return 1;
      return 2;
    };
    candidates.sort((a, b) => {
      if (b.profileTier !== a.profileTier) return b.profileTier - a.profileTier;
      if (b.thumbScore !== a.thumbScore) return b.thumbScore - a.thumbScore;
      const ua = String(a.entry?.userId || "").trim();
      const ub = String(b.entry?.userId || "").trim();
      const ra = laneUidSortRank(ua);
      const rb = laneUidSortRank(ub);
      if (ra !== rb) return ra - rb;
      if (ua !== ub) return ua < ub ? -1 : ua > ub ? 1 : 0;
      return b.entryIndex - a.entryIndex;
    });
    const buckets = bucketStoryUserLanePicks(candidates, limit);
    const picked = flattenStoryUserLaneBuckets(buckets);
    const laneSig = storyUserLaneRenderSignature(
      liveId,
      laneScheme,
      picked,
      entries.length
    );
    if (laneSig === storyUserLaneLastRenderSig) {
      return;
    }
    storyUserLaneLastRenderSig = laneSig;
    if (!picked.length) {
      resetLaneTierCells();
      stack.hidden = false;
      if (guideLinesTop) {
        guideLinesTop.innerHTML = buildStoryUserLaneGuideTopHtml(
          STORY_GUIDE_FACE_RINK
        );
      }
      if (guideTop) guideTop.hidden = false;
      if (guideLinesMidKonta) {
        guideLinesMidKonta.innerHTML = buildStoryUserLaneGuideKontaHtml(
          STORY_GUIDE_FACE_KONTA
        );
      }
      if (guideMidKonta) guideMidKonta.hidden = false;
      if (guideLinesMidTanu) {
        guideLinesMidTanu.innerHTML = buildStoryUserLaneGuideTanuHtml(
          STORY_GUIDE_FACE_TANU
        );
      }
      if (guideMidTanu) guideMidTanu.hidden = false;
      if (guideLinesBottom) {
        guideLinesBottom.innerHTML = buildStoryUserLaneGuideFootHtml(0);
      }
      if (guideBottom) guideBottom.hidden = false;
      return;
    }
    const fillLaneTier = (el, items) => {
      el.innerHTML = "";
      if (!items.length) {
        el.hidden = true;
        return;
      }
      el.hidden = false;
      const frag = document.createDocumentFragment();
      for (const p of items) {
        const cell = document.createElement("span");
        cell.className = "nl-story-userlane-cell";
        const img = document.createElement("img");
        img.className = "nl-story-userlane-avatar";
        const requestedLane = p.displaySrc;
        const displayLane = storyAvatarLoadGuard.pickDisplaySrc(requestedLane);
        img.src = displayLane;
        storyAvatarLoadGuard.noteRemoteAttempt(img, requestedLane);
        img.classList.toggle(
          "nl-avatar--tv-fallback",
          storyTileUsesYukkuriTvStyle(requestedLane, displayLane)
        );
        img.alt = "";
        const fullUid = String(p.entry?.userId || "").trim();
        const tip = fullUid && fullUid !== p.meta.idLine ? `${p.title} | ${fullUid}` : p.title;
        img.title = tip;
        cell.title = tip;
        img.decoding = "async";
        if (isHttpOrHttpsUrl(img.src)) {
          img.referrerPolicy = "no-referrer";
        }
        const metaEl = document.createElement("span");
        metaEl.className = "nl-story-userlane-meta";
        const idRow = document.createElement("span");
        idRow.className = "nl-story-userlane-meta__id";
        idRow.textContent = p.meta.idLine;
        const nameRow = document.createElement("span");
        nameRow.className = "nl-story-userlane-meta__name";
        nameRow.textContent = p.meta.nameLine;
        metaEl.appendChild(idRow);
        metaEl.appendChild(nameRow);
        cell.appendChild(img);
        cell.appendChild(metaEl);
        frag.appendChild(cell);
      }
      el.appendChild(frag);
    };
    fillLaneTier(laneRink, buckets.rink);
    fillLaneTier(laneKonta, buckets.konta);
    fillLaneTier(laneTanu, buckets.tanu);
    if (hintRink) {
      const showRinkHint = buckets.rink.length === 0 && (buckets.konta.length > 0 || buckets.tanu.length > 0);
      hintRink.hidden = !showRinkHint;
    }
    if (rinkWrap) {
      const showRinkWrap = !laneRink.hidden || hintRink && !hintRink.hidden;
      rinkWrap.hidden = !showRinkWrap;
    }
    stack.setAttribute(
      "aria-label",
      `\u6700\u8FD1\u306E\u5FDC\u63F4\u30E6\u30FC\u30B6\u30FC\u30B5\u30E0\u30CD\u30A4\u30EB \u5408\u8A08${picked.length}\u4EF6`
    );
    stack.hidden = false;
    if (guideLinesTop) {
      guideLinesTop.innerHTML = buildStoryUserLaneGuideTopHtml(
        STORY_GUIDE_FACE_RINK
      );
    }
    if (guideTop) guideTop.hidden = false;
    if (guideLinesMidKonta) {
      guideLinesMidKonta.innerHTML = buildStoryUserLaneGuideKontaHtml(
        STORY_GUIDE_FACE_KONTA
      );
    }
    if (guideMidKonta) guideMidKonta.hidden = false;
    if (guideLinesMidTanu) {
      guideLinesMidTanu.innerHTML = buildStoryUserLaneGuideTanuHtml(
        STORY_GUIDE_FACE_TANU
      );
    }
    if (guideMidTanu) guideMidTanu.hidden = false;
    if (guideLinesBottom) {
      guideLinesBottom.innerHTML = buildStoryUserLaneGuideFootHtml(picked.length);
    }
    if (guideBottom) guideBottom.hidden = false;
  }
  function renderStoryAvatarDiag() {
    const el = (
      /** @type {HTMLElement|null} */
      $("storyAvatarDiag")
    );
    if (!el) return;
    const html = buildStoryAvatarDiagHtml(STORY_AVATAR_DIAG_STATE);
    if (html == null) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    el.innerHTML = html;
    el.hidden = false;
  }
  function resetStoryAvatarDiagState() {
    STORY_AVATAR_DIAG_STATE.total = 0;
    STORY_AVATAR_DIAG_STATE.withUid = 0;
    STORY_AVATAR_DIAG_STATE.withAvatar = 0;
    STORY_AVATAR_DIAG_STATE.uniqueAvatar = 0;
    STORY_AVATAR_DIAG_STATE.resolvedAvatar = 0;
    STORY_AVATAR_DIAG_STATE.resolvedUniqueAvatar = 0;
    STORY_AVATAR_DIAG_STATE.selfShown = 0;
    STORY_AVATAR_DIAG_STATE.selfSaved = 0;
    STORY_AVATAR_DIAG_STATE.selfPending = 0;
    STORY_AVATAR_DIAG_STATE.selfPendingMatched = 0;
    STORY_AVATAR_DIAG_STATE.interceptItems = 0;
    STORY_AVATAR_DIAG_STATE.interceptWithUid = 0;
    STORY_AVATAR_DIAG_STATE.interceptWithAvatar = 0;
    STORY_AVATAR_DIAG_STATE.mergedPatched = 0;
    STORY_AVATAR_DIAG_STATE.mergedUidReplaced = 0;
    STORY_AVATAR_DIAG_STATE.stripped = 0;
    STORY_AVATAR_DIAG_STATE.interceptMapOnPage = -1;
    STORY_AVATAR_DIAG_STATE.interceptExportRows = 0;
    STORY_AVATAR_DIAG_STATE.interceptExportCode = "";
    STORY_AVATAR_DIAG_STATE.interceptExportDetail = "";
    renderStoryAvatarDiag();
  }
  function syncInterceptMapDiagFromSnapshot(snap) {
    const d = snap?._debug;
    STORY_AVATAR_DIAG_STATE.interceptMapOnPage = d && typeof d.intercept === "number" && Number.isFinite(d.intercept) && d.intercept >= 0 ? Math.floor(d.intercept) : -1;
  }
  function syncStorySourceEntries(liveId, arr) {
    const nextLiveId = String(liveId || "");
    const list = Array.isArray(arr) ? arr : [];
    if (STORY_SOURCE_STATE.liveId !== nextLiveId) {
      STORY_SOURCE_STATE.liveId = nextLiveId;
      STORY_GROWTH_STATE.pinnedCommentId = null;
      STORY_GROWTH_STATE.hoverPreviewCommentId = null;
      cancelStoryHoverClearTimer();
    }
    STORY_SOURCE_STATE.entries = list;
    const pin = STORY_GROWTH_STATE.pinnedCommentId;
    if (pin && !list.some((e) => commentStableId(e) === pin)) {
      STORY_GROWTH_STATE.pinnedCommentId = null;
      STORY_GROWTH_STATE.hoverPreviewCommentId = null;
      cancelStoryHoverClearTimer();
    }
    if (!STORY_GROWTH_STATE.pinnedCommentId && STORY_GROWTH_STATE.hoverPreviewCommentId) {
      reconcileStoryHoverPreviewFromPointer();
    }
    syncGrowthIconSelection(STORY_GROWTH_STATE.root);
    renderStoryUserLane();
    renderStoryAvatarDiag();
    renderStoryCommentDetailPanel();
  }
  function getStoryEntryByIndex(index) {
    const entries = STORY_SOURCE_STATE.entries;
    if (!Number.isFinite(index) || index < 0 || index >= entries.length) return null;
    return entries[index];
  }
  function renderStoryCommentDetailPanel() {
    const wrap = (
      /** @type {HTMLElement|null} */
      $("sceneStoryDetail")
    );
    const img = (
      /** @type {HTMLImageElement|null} */
      $("sceneStoryDetailImg")
    );
    const userEl = $("sceneStoryDetailUser");
    const userMetaEl = $("sceneStoryDetailUserMeta");
    const textEl = $("sceneStoryDetailText");
    const metaEl = $("sceneStoryDetailMeta");
    const listEl = (
      /** @type {HTMLUListElement|null} */
      $("sceneStoryDetailList")
    );
    if (!wrap || !userEl || !userMetaEl || !textEl || !metaEl || !listEl) return;
    const pinned = STORY_GROWTH_STATE.pinnedCommentId;
    const hover = STORY_GROWTH_STATE.hoverPreviewCommentId;
    const effectiveId = pinned || hover;
    const isHoverBubble = Boolean(!pinned && hover);
    wrap.classList.toggle("is-preview", Boolean(!pinned && hover));
    wrap.classList.toggle("is-pinned-detail", Boolean(pinned));
    wrap.classList.toggle("is-hover-bubble", isHoverBubble);
    wrap.classList.remove("is-hover-below");
    if (!effectiveId) {
      wrap.hidden = true;
      listEl.innerHTML = "";
      wrap.style.removeProperty("left");
      wrap.style.removeProperty("top");
      wrap.style.removeProperty("--nl-story-detail-arrow-left");
      return;
    }
    let entry = getStoryEntryByStableId(effectiveId);
    if (!entry && isHoverBubble && reconcileStoryHoverPreviewFromPointer()) {
      entry = getStoryEntryByStableId(STORY_GROWTH_STATE.hoverPreviewCommentId);
    }
    if (!entry) {
      wrap.hidden = true;
      listEl.innerHTML = "";
      return;
    }
    const userId = String(entry.userId || "").trim();
    const lidForOwn = String(entry.liveId || STORY_SOURCE_STATE.liveId || "");
    const ownPosted = isOwnPostedSupportComment(
      entry,
      lidForOwn,
      STORY_SOURCE_STATE.entries
    );
    const viewerNick = String(
      watchMetaCache.snapshot?.viewerNickname || ""
    ).trim();
    const viewerUid = String(
      watchMetaCache.snapshot?.viewerUserId || ""
    ).trim();
    if (img) {
      const requestedDetail = storyGrowthTileSrcForEntry(
        entry,
        String(entry.liveId || STORY_SOURCE_STATE.liveId || "")
      );
      const displayDetail = storyAvatarLoadGuard.pickDisplaySrc(requestedDetail);
      img.src = displayDetail;
      storyAvatarLoadGuard.noteRemoteAttempt(img, requestedDetail);
      img.classList.toggle(
        "nl-story-detail-img--tv-fallback",
        storyTileUsesYukkuriTvStyle(requestedDetail, displayDetail)
      );
      if (isHttpOrHttpsUrl(img.src)) {
        img.referrerPolicy = "no-referrer";
        img.classList.add("nl-story-detail-img--remote");
      } else {
        img.removeAttribute("referrerpolicy");
        img.classList.remove("nl-story-detail-img--remote");
      }
    }
    userEl.textContent = storyGrowthDisplayLabel(entry, lidForOwn);
    if (userId) {
      userMetaEl.textContent = `ID: ${userId}`;
    } else if (ownPosted) {
      if (viewerUid) {
        userMetaEl.textContent = `ID\uFF08\u30D8\u30C3\u30C0\u30FC\u304B\u3089\u63A8\u5B9A\uFF09: ${viewerUid}`;
      } else if (viewerNick) {
        userMetaEl.textContent = `\u8868\u793A\u540D\uFF08\u30D8\u30C3\u30C0\u30FC\uFF09: ${viewerNick}`;
      } else {
        userMetaEl.textContent = "\u30B3\u30E1\u30F3\u30C8\u884C\u306B\u6295\u7A3F\u8005ID\u306F\u3042\u308A\u307E\u305B\u3093\u3002\u9001\u4FE1\u5C65\u6B74\u3068\u4E00\u81F4\u3059\u308B\u305F\u3081\u300C\u81EA\u5206\u306E\u30B3\u30E1\u30F3\u30C8\u300D\u3068\u3057\u3066\u8868\u793A\u3057\u3066\u3044\u307E\u3059\u3002";
      }
    } else {
      userMetaEl.textContent = "ID\u672A\u53D6\u5F97\uFF08DOM\u306B\u6295\u7A3F\u8005\u60C5\u5831\u306A\u3057\uFF09";
    }
    textEl.textContent = String(entry.text || "").trim() || "\uFF08\u30B3\u30E1\u30F3\u30C8\u672C\u6587\u306A\u3057\uFF09";
    const commentNo = String(entry.commentNo || "").trim() || "-";
    const at = formatDateTime(entry.capturedAt || 0);
    const liveId = String(entry.liveId || STORY_SOURCE_STATE.liveId || "").trim() || "-";
    const modeLabel = pinned ? "\u56FA\u5B9A" : "\u30D7\u30EC\u30D3\u30E5\u30FC";
    metaEl.textContent = `${modeLabel} \xB7 No.${commentNo} / ${at} / ${liveId}`;
    const recent = storyDetailRecentEntries(
      STORY_SOURCE_STATE.entries,
      entry,
      lidForOwn,
      { limit: 5 }
    );
    listEl.innerHTML = "";
    listEl.hidden = recent.length === 0;
    for (const row of recent) {
      const li = document.createElement("li");
      const no = String(row.commentNo || "").trim() || "-";
      const line = String(row.text || "").trim() || "\uFF08\u30B3\u30E1\u30F3\u30C8\u672C\u6587\u306A\u3057\uFF09";
      li.textContent = `#${no} ${truncateText(line, 72)}`;
      listEl.appendChild(li);
    }
    wrap.hidden = false;
    wrap.style.removeProperty("left");
    wrap.style.removeProperty("top");
    wrap.style.removeProperty("--nl-story-detail-arrow-left");
    if (isHoverBubble && STORY_GROWTH_STATE.hoverAnchorRect) {
      const anchor = STORY_GROWTH_STATE.hoverAnchorRect;
      const margin = 8;
      const gap = 10;
      const minLeft = 6;
      const maxWidth = Math.min(280, Math.max(180, window.innerWidth - 16));
      wrap.style.maxWidth = `${maxWidth}px`;
      wrap.style.visibility = "hidden";
      const measuredWidth = Math.min(maxWidth, Math.max(180, wrap.offsetWidth || 220));
      const measuredHeight = wrap.offsetHeight || 120;
      const anchorCenter = anchor.left + anchor.width / 2;
      let left = Math.round(anchorCenter - measuredWidth / 2);
      left = Math.max(minLeft, Math.min(left, window.innerWidth - measuredWidth - minLeft));
      let top = Math.round(anchor.top - measuredHeight - gap);
      let below = false;
      if (top < margin) {
        top = Math.round(anchor.bottom + gap);
        below = true;
      }
      top = Math.max(margin, Math.min(top, window.innerHeight - measuredHeight - margin));
      const arrowLeft = Math.max(
        14,
        Math.min(measuredWidth - 14, Math.round(anchorCenter - left))
      );
      wrap.style.left = `${left}px`;
      wrap.style.top = `${top}px`;
      wrap.style.setProperty("--nl-story-detail-arrow-left", `${arrowLeft}px`);
      wrap.classList.toggle("is-hover-below", below);
      wrap.style.visibility = "";
    } else {
      wrap.style.maxWidth = "";
      wrap.style.visibility = "";
    }
  }
  function storyAvatarFingerprint(entries) {
    let h = 0;
    for (let i = 0; i < entries.length; i++) {
      const u = entries[i]?.avatarUrl;
      if (!u || typeof u !== "string") continue;
      h = h * 33 + u.length + i | 0;
      const start = Math.max(0, u.length - 8);
      for (let j = start; j < u.length; j++) {
        h = h * 31 + u.charCodeAt(j) | 0;
      }
    }
    return h;
  }
  function watchViewerAvatarFingerprint() {
    const u = watchMetaCache.snapshot?.viewerAvatarUrl;
    if (!u || typeof u !== "string") return "0";
    let h = 0;
    h = h * 33 + u.length | 0;
    const start = Math.max(0, u.length - 12);
    for (let j = start; j < u.length; j += 1) {
      h = h * 31 + u.charCodeAt(j) | 0;
    }
    return `${u.length}|${h}`;
  }
  function watchViewerUserIdFingerprint() {
    const id = watchMetaCache.snapshot?.viewerUserId;
    if (!id || typeof id !== "string") return "0";
    let h = 0;
    const start = Math.max(0, id.length - 8);
    for (let j = start; j < id.length; j += 1) {
      h = h * 31 + id.charCodeAt(j) | 0;
    }
    return `${id.length}|${h}`;
  }
  function selfPostedRecentsFingerprintForLive(liveId) {
    const lid = String(liveId || "").trim().toLowerCase();
    if (!lid) return "0";
    let h = 0;
    let maxAt = 0;
    let n = 0;
    for (const it of selfPostedRecentsCache) {
      if (String(it.liveId).toLowerCase() !== lid) continue;
      n += 1;
      maxAt = Math.max(maxAt, Number(it.at) || 0);
      const tn = it.textNorm;
      for (let k = 0; k < tn.length; k += 1) {
        h = h * 31 + tn.charCodeAt(k) | 0;
      }
    }
    return `${n}|${maxAt}|${h}`;
  }
  function storyDetailRecentEntries(entries, focusEntry, liveId, opts = {}) {
    const list = Array.isArray(entries) ? entries : [];
    const entry = focusEntry || null;
    const limit = Number(opts.limit) > 0 ? Number(opts.limit) : 5;
    if (!entry || list.length === 0) return [];
    const uid = String(entry.userId || "").trim();
    if (uid) {
      return entriesRelatedForStoryDetail(list, entry, { limit });
    }
    if (!isOwnPostedSupportComment(entry, liveId, list)) return [];
    return list.filter((row) => isOwnPostedSupportComment(row, liveId, list)).slice(-limit).reverse();
  }
  function storyCommentTextPenalty(text) {
    const s = normalizeCommentText(text).replace(/\n+/g, " ").trim();
    if (!s) return Number.POSITIVE_INFINITY;
    const numberedTokens = s.match(/(?:^|[\s\u3000])\d{3,9}(?=\s+\S)/g)?.length || 0;
    return s.length + Math.max(0, numberedTokens - 1) * 240;
  }
  function normalizeStoredCommentEntries(entries) {
    const list = Array.isArray(entries) ? entries : [];
    if (list.length <= 1) return { next: list, changed: false };
    const out = [];
    const indexByKey = /* @__PURE__ */ new Map();
    let changed = false;
    const mergeVariant = (prev, next) => {
      const prevText = normalizeCommentText(prev.text);
      const nextText = normalizeCommentText(next.text);
      const preferNextText = Boolean(nextText) && storyCommentTextPenalty(nextText) < storyCommentTextPenalty(prevText);
      const userId = String(next.userId || "").trim() || String(prev.userId || "").trim() || null;
      const nickname = String(next.nickname || "").trim() || String(prev.nickname || "").trim() || "";
      const avatarUrl = String(next.avatarUrl || "").trim() || String(prev.avatarUrl || "").trim() || "";
      const selfPosted = Boolean(prev.selfPosted) || Boolean(next.selfPosted);
      return {
        ...prev,
        ...preferNextText ? { text: nextText || prevText } : {},
        ...userId ? { userId } : { userId: null },
        ...nickname ? { nickname } : {},
        ...avatarUrl ? { avatarUrl } : {},
        ...selfPosted ? { selfPosted: true } : {}
      };
    };
    for (const raw of list) {
      const entry = (
        /** @type {PopupCommentEntry} */
        raw
      );
      const no = String(entry?.commentNo || "").trim();
      const key = /^\d+$/.test(no) ? `no:${no}` : `${String(entry?.liveId || "").trim().toLowerCase()}|${normalizeCommentText(entry?.text || "")}|${Number(entry?.capturedAt || 0)}`;
      const existingIndex = indexByKey.get(key);
      if (existingIndex == null) {
        indexByKey.set(key, out.length);
        out.push(entry);
        continue;
      }
      const merged = mergeVariant(out[existingIndex], entry);
      if (merged !== out[existingIndex]) {
        changed = true;
        out[existingIndex] = merged;
      } else {
        changed = true;
      }
    }
    return { next: out, changed: changed || out.length !== list.length };
  }
  function storySourceSignature() {
    const e = STORY_SOURCE_STATE.entries;
    if (!e.length) return "";
    const first = e[0];
    const last = e[e.length - 1];
    const av = storyAvatarFingerprint(e);
    const lid = String(STORY_SOURCE_STATE.liveId || "").trim().toLowerCase();
    const vf = watchViewerAvatarFingerprint();
    const uf = watchViewerUserIdFingerprint();
    const pf = selfPostedRecentsFingerprintForLive(lid);
    return `${e.length}|${first?.capturedAt ?? ""}|${last?.capturedAt ?? ""}|${last?.id ?? ""}|a:${av}|v:${vf}|u:${uf}|p:${pf}`;
  }
  function bindStoryGrowthInteractions(root) {
    if (root.dataset.nlStoryGrowthBound === "1") return;
    root.dataset.nlStoryGrowthBound = "1";
    ensureStoryGlobalDismissHandlers();
    bindStoryDetailHoverBridge();
    root.addEventListener("click", (ev) => {
      const t = (
        /** @type {HTMLElement} */
        ev.target
      );
      const img = t.closest("img.nl-story-growth-icon");
      if (!img || !root.contains(img)) return;
      const sid = img.getAttribute("data-comment-id");
      if (!sid) return;
      cancelStoryHoverClearTimer();
      STORY_GROWTH_STATE.hoverPreviewCommentId = null;
      STORY_GROWTH_STATE.pinnedCommentId = STORY_GROWTH_STATE.pinnedCommentId === sid ? null : sid;
      syncGrowthIconSelection(root);
      renderStoryCommentDetailPanel();
    });
    root.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const t = (
        /** @type {HTMLElement} */
        ev.target
      );
      if (!t.matches("img.nl-story-growth-icon")) return;
      ev.preventDefault();
      t.click();
    });
    root.addEventListener("pointerover", (ev) => {
      if (!storyHoverPreviewEnabled()) return;
      if (STORY_GROWTH_STATE.pinnedCommentId) return;
      updateStoryHoverPointerFromEvent(ev);
      const el = ev.target;
      const img = el instanceof Element ? el.closest("img.nl-story-growth-icon") : null;
      if (!img || !root.contains(img)) return;
      const sid = img.getAttribute("data-comment-id");
      if (!sid) return;
      cancelStoryHoverClearTimer();
      STORY_GROWTH_STATE.hoverPreviewCommentId = sid;
      updateStoryHoverAnchorFromElement(img);
      renderStoryCommentDetailPanel();
    });
    root.addEventListener("pointermove", (ev) => {
      if (!storyHoverPreviewEnabled()) return;
      if (STORY_GROWTH_STATE.pinnedCommentId) return;
      updateStoryHoverPointerFromEvent(ev);
      const el = ev.target;
      const img = el instanceof Element ? el.closest("img.nl-story-growth-icon") : null;
      if (!img || !root.contains(img)) return;
      const sid = img.getAttribute("data-comment-id");
      if (!sid || STORY_GROWTH_STATE.hoverPreviewCommentId !== sid) return;
      updateStoryHoverAnchorFromElement(img);
      renderStoryCommentDetailPanel();
    });
    root.addEventListener("pointerout", (ev) => {
      if (!storyHoverPreviewEnabled()) return;
      if (STORY_GROWTH_STATE.pinnedCommentId) return;
      updateStoryHoverPointerFromEvent(ev);
      const el = ev.target;
      const img = el instanceof Element ? el.closest("img.nl-story-growth-icon") : null;
      if (!img || !root.contains(img)) return;
      const rel = ev.relatedTarget;
      if (rel instanceof Element) {
        if (rel.closest?.("img.nl-story-growth-icon") && root.contains(rel)) return;
        if ($("sceneStoryDetail")?.contains(rel)) return;
      }
      scheduleStoryHoverClear();
    });
  }
  function clearStoryGrowthTimer() {
    if (!STORY_GROWTH_STATE.timer) return;
    clearTimeout(STORY_GROWTH_STATE.timer);
    STORY_GROWTH_STATE.timer = null;
  }
  function resolveStoryIconSize(count) {
    const total = Math.max(0, Math.floor(Number(count) || 0));
    const compact = document.body?.classList.contains("nl-compact") || document.body?.classList.contains("nl-tight");
    if (INLINE_MODE) {
      if (total <= 20) return 40;
      if (total <= 80) return 34;
      if (total <= 200) return 30;
      if (total <= 500) return 26;
      if (total <= 1200) return 22;
      if (total <= 3e3) return 18;
      if (total <= 6e3) return 14;
      return 12;
    }
    if (compact) {
      if (total <= 18) return 16;
      if (total <= 120) return 12;
      return 10;
    }
    if (total <= 18) return 18;
    if (total <= 140) return 13;
    return 10;
  }
  function storyGrowthDisplayLabel(entry, liveId) {
    if (!entry) return "";
    const userId = String(entry.userId || "").trim();
    const nickname = String(entry.nickname || "").trim();
    const userKey = userId || UNKNOWN_USER_KEY;
    const lid = String(liveId || STORY_SOURCE_STATE.liveId || "");
    const ownPosted = isOwnPostedSupportComment(entry, lid);
    const snap = watchMetaCache.snapshot;
    const viewerNick = String(snap?.viewerNickname || "").trim();
    const viewerUid = String(snap?.viewerUserId || "").trim();
    if (ownPosted) {
      if (userId) return displayUserLabel(userId, nickname || viewerNick);
      if (viewerUid) return displayUserLabel(viewerUid, nickname || viewerNick);
      if (viewerNick) return viewerNick;
      return "\u81EA\u5206\uFF08\u3053\u306E\u30D6\u30E9\u30A6\u30B6\u3067\u9001\u4FE1\u3057\u305F\u30B3\u30E1\u30F3\u30C8\uFF09";
    }
    if (!userId && nickname) return nickname;
    return displayUserLabel(userKey, nickname);
  }
  function storyGrowthImgAssignSrc(img, nextSrc) {
    const next = String(nextSrc || "").trim();
    if (!next) {
      if (!img.hasAttribute("src")) return;
      img.removeAttribute("src");
      return;
    }
    const attr = img.getAttribute("src");
    if (attr === next) return;
    try {
      const resolvedNext = new URL(next, document.baseURI).href;
      if (img.src === resolvedNext) return;
    } catch {
    }
    img.src = next;
  }
  function applyStoryGrowthIconAttributes(img, index, isNew) {
    const entry = getStoryEntryByIndex(index);
    const stable = commentStableId(entry);
    const selected = Boolean(stable && STORY_GROWTH_STATE.pinnedCommentId === stable);
    img.className = isNew ? "nl-story-growth-icon is-new" : "nl-story-growth-icon";
    if (selected) img.classList.add("is-selected");
    const requestedTile = storyGrowthTileSrcForEntry(entry, STORY_SOURCE_STATE.liveId);
    const displayTile = storyAvatarLoadGuard.pickDisplaySrc(requestedTile);
    storyGrowthImgAssignSrc(img, displayTile);
    storyAvatarLoadGuard.noteRemoteAttempt(img, requestedTile);
    img.classList.toggle(
      "nl-story-growth-icon--tv-fallback",
      storyTileUsesYukkuriTvStyle(requestedTile, displayTile)
    );
    if (isHttpOrHttpsUrl(img.src)) {
      img.referrerPolicy = "no-referrer";
      img.classList.add("nl-story-growth-icon--remote");
    } else {
      img.removeAttribute("referrerpolicy");
      img.classList.remove("nl-story-growth-icon--remote");
    }
    const entries = STORY_SOURCE_STATE.entries;
    const storyKey = entry ? supportUserKeyFromEntry(entry) : UNKNOWN_USER_KEY;
    const ordinal = supportOrdinalForIndex(entries, index);
    img.classList.remove("nl-story-growth-icon--user-accent");
    const cell = img.closest(".nl-story-growth-cell");
    if (cell instanceof HTMLElement) {
      cell.style.removeProperty("--nl-user-accent");
      cell.classList.remove("nl-story-growth-cell--accent");
      cell.classList.remove("nl-story-growth-cell--user-accent");
      if (ordinal > 1) {
        cell.classList.add("nl-story-growth-cell--repeat");
        cell.setAttribute("data-support-ordinal", String(ordinal));
      } else {
        cell.classList.remove("nl-story-growth-cell--repeat");
        cell.removeAttribute("data-support-ordinal");
      }
      cell.classList.toggle("nl-story-growth-cell--selected", selected);
    }
    const userLabel = storyGrowthDisplayLabel(entry, STORY_SOURCE_STATE.liveId);
    const text = truncateText(entry?.text || "", 26);
    img.setAttribute("data-comment-index", String(index));
    if (stable) img.setAttribute("data-comment-id", stable);
    else img.removeAttribute("data-comment-id");
    img.setAttribute("role", "button");
    img.setAttribute("tabindex", "0");
    const hoverHint = storyHoverPreviewEnabled() ? "\u30DE\u30A6\u30B9\u3092\u4E57\u305B\u308B\u3068\u30D7\u30EC\u30D3\u30E5\u30FC\u3001" : "";
    const totalSame = supportSameUserTotalInEntries(entries, storyKey);
    const sameUserBlurb = entry && totalSame > 1 ? `\u540C\u4E00\u30E6\u30FC\u30B6\u30FC${ordinal}\u4EF6\u76EE\u3001\u4E00\u89A7\u306B\u540C\u30E6\u30FC\u30B6\u30FC\u8A08${totalSame}\u4EF6\u3002` : "";
    img.setAttribute(
      "aria-label",
      entry ? `${index + 1}\u4EF6\u76EE ${userLabel} ${text || "\u30B3\u30E1\u30F3\u30C8"}\u3002${sameUserBlurb}${hoverHint}Enter \u307E\u305F\u306F Space \u3067\u8A73\u7D30\u306E\u56FA\u5B9A\u30FB\u89E3\u9664` : `${index + 1}\u4EF6\u76EE\u306E\u30B3\u30E1\u30F3\u30C8`
    );
    img.title = entry ? `#${entry.commentNo || "-"} ${userLabel}\uFF08${sameUserBlurb}${hoverHint}\u30AF\u30EA\u30C3\u30AF\u3067\u8A73\u7D30\uFF09` : `${index + 1}\u4EF6\u76EE`;
    img.alt = "";
  }
  function createStoryGrowthCell(isNew, index) {
    const cell = document.createElement("span");
    cell.className = "nl-story-growth-cell";
    const media = document.createElement("span");
    media.className = "nl-story-growth-cell__media";
    const img = document.createElement("img");
    media.appendChild(img);
    cell.appendChild(media);
    applyStoryGrowthIconAttributes(img, index, isNew);
    return cell;
  }
  function patchStoryGrowthIconsFromSource(root, opts = {}) {
    const n = STORY_GROWTH_STATE.renderedCount;
    const imgs = root.querySelectorAll("img.nl-story-growth-icon");
    if (imgs.length !== n) {
      rebuildStoryGrowth(root, n);
      return;
    }
    for (let i = 0; i < n; i += 1) {
      applyStoryGrowthIconAttributes(
        /** @type {HTMLImageElement} */
        imgs[i],
        i,
        false
      );
    }
    if (opts.pulseLast && n > 0) {
      const last = (
        /** @type {HTMLImageElement} */
        imgs[n - 1]
      );
      last.classList.remove("is-new");
      void last.offsetWidth;
      last.classList.add("is-new");
      window.setTimeout(() => last.classList.remove("is-new"), 820);
    }
  }
  function rebuildStoryGrowth(root, total) {
    root.innerHTML = "";
    if (total <= 0) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < total; i += 1) {
      frag.appendChild(createStoryGrowthCell(false, i));
    }
    root.appendChild(frag);
  }
  function syncStoryGrowth(liveId, count, root) {
    const nextLiveId = String(liveId || "");
    const targetFull = Math.max(0, Math.floor(Number(count) || 0));
    const target = targetFull;
    const changedLive = STORY_GROWTH_STATE.liveId !== nextLiveId;
    const changedRoot = STORY_GROWTH_STATE.root !== root;
    if (changedLive || changedRoot) {
      clearStoryGrowthTimer();
      if (changedLive) {
        storyAvatarLoadGuard.clearFailedUrls();
      }
      STORY_GROWTH_STATE.liveId = nextLiveId;
      STORY_GROWTH_STATE.renderedCount = 0;
      STORY_GROWTH_STATE.targetCount = 0;
      STORY_GROWTH_STATE.sourceSig = "";
      STORY_GROWTH_STATE.root = root;
      if (root) root.innerHTML = "";
    }
    STORY_GROWTH_STATE.root = root;
    STORY_GROWTH_STATE.targetCount = target;
    if (!root) return;
    bindStoryGrowthInteractions(root);
    ensureStoryGrowthColorSchemeListener();
    const iconPx = `${resolveStoryIconSize(target)}px`;
    const storyBody = root.closest(".nl-story-body");
    if (storyBody instanceof HTMLElement) {
      storyBody.style.setProperty("--nl-story-icon-size", iconPx);
    } else {
      root.style.setProperty("--nl-story-icon-size", iconPx);
    }
    if (STORY_GROWTH_STATE.renderedCount > STORY_GROWTH_STATE.targetCount) {
      STORY_GROWTH_STATE.renderedCount = STORY_GROWTH_STATE.targetCount;
      rebuildStoryGrowth(root, STORY_GROWTH_STATE.renderedCount);
    }
    const tgt = STORY_GROWTH_STATE.targetCount;
    const rnd = STORY_GROWTH_STATE.renderedCount;
    if (rnd < tgt && tgt > 0) {
      clearStoryGrowthTimer();
      rebuildStoryGrowth(root, tgt);
      STORY_GROWTH_STATE.renderedCount = tgt;
      patchStoryGrowthIconsFromSource(root, { pulseLast: true });
      STORY_GROWTH_STATE.sourceSig = storySourceSignature();
    }
    const nextSig = storySourceSignature();
    const needSourceSync = STORY_GROWTH_STATE.renderedCount > 0 && STORY_GROWTH_STATE.renderedCount === STORY_GROWTH_STATE.targetCount && nextSig !== STORY_GROWTH_STATE.sourceSig;
    STORY_GROWTH_STATE.sourceSig = nextSig;
    if (needSourceSync) {
      patchStoryGrowthIconsFromSource(root, { pulseLast: true });
    }
    if (STORY_GROWTH_STATE.renderedCount === 0 && root.childElementCount > 0) {
      root.innerHTML = "";
    }
  }
  function computeStoryReaction(liveId, commentCount) {
    const count = Math.max(0, Number(commentCount) || 0);
    const nextLiveId = String(liveId || "");
    if (STORY_REACTION_STATE.liveId !== nextLiveId) {
      STORY_REACTION_STATE.liveId = nextLiveId;
      STORY_REACTION_STATE.lastCount = count;
      return { count, delta: 0, reaction: "idle" };
    }
    const prev = STORY_REACTION_STATE.lastCount;
    STORY_REACTION_STATE.lastCount = count;
    if (!Number.isFinite(prev) || prev == null || count <= prev) {
      return { count, delta: 0, reaction: "idle" };
    }
    const delta = count - prev;
    if (delta >= 20 || count % 20 === 0) {
      return { count, delta, reaction: "sparkle" };
    }
    if (delta >= 5 || count % 5 === 0) {
      return { count, delta, reaction: "burst" };
    }
    return { count, delta, reaction: "pulse" };
  }
  function renderCharacterScene(state) {
    const { hasWatch, recording, commentCount, liveId, snapshot } = state;
    const roleCopy = "1\u30B3\u30E1\u30F3\u30C8\u3054\u3068\u306B\u3001\u308A\u3093\u304F\u304C1\u4F53\u305A\u3064\u5897\u3048\u308B\u3088\u3002";
    if (!hasWatch) {
      STORY_REACTION_STATE.liveId = "";
      STORY_REACTION_STATE.lastCount = 0;
      syncStorySourceEntries("", []);
      setSceneStory(
        "\u308A\u3093\u304F\u304C\u307F\u3093\u306A\u306E\u5FDC\u63F4\u30B3\u30E1\u30F3\u30C8\u3092\u96C6\u3081\u308B\u6E96\u5099\u4E2D\u3060\u3088\u3002",
        recording ? `\u8A18\u9332\u306FON\u3002watch\u30DA\u30FC\u30B8\u304C\u958B\u3044\u305F\u3089\u5FDC\u63F4\u30B3\u30E1\u30F3\u30C8\u306E\u53EF\u8996\u5316\u3092\u59CB\u3081\u308B\u3088\u3002${roleCopy}` : `watch\u30DA\u30FC\u30B8\u3092\u958B\u3044\u305F\u3089\u3001\u308A\u3093\u304F\u304C\u5FDC\u63F4\u30B3\u30E1\u30F3\u30C8\u306E\u53EF\u8996\u5316\u3092\u59CB\u3081\u308B\u3088\u3002${roleCopy}`,
        {
          liveId: "",
          delta: 0,
          reaction: "idle",
          count: 0
        }
      );
      return;
    }
    const title = truncateText(snapshot?.broadcastTitle || "", 25);
    const caster = truncateText(snapshot?.broadcasterName || "", 18);
    const tags = Array.isArray(snapshot?.tags) ? snapshot.tags.filter((v) => String(v || "").trim()).slice(0, 2) : [];
    const reaction = computeStoryReaction(liveId, commentCount);
    if (recording && commentCount <= 0) {
      setSceneStory(
        "\u308A\u3093\u304F\u304C\u307F\u3093\u306A\u306E\u5FDC\u63F4\u30B3\u30E1\u30F3\u30C8\u3092\u96C6\u3081\u3066\u3044\u307E\u3059",
        `\u300C${title || liveId || "\u653E\u9001"}\u300D\u3092\u958B\u3044\u305F\u307E\u307E\u306B\u3057\u3066\u306D\u3002\u6570\u5B57\u304C\u3059\u3050\u5897\u3048\u306A\u3044\u3068\u304D\u306F\u3001\u53F3\u306E\u30B3\u30E1\u30F3\u30C8\u4E00\u89A7\u304C\u4EEE\u60F3\u30B9\u30AF\u30ED\u30FC\u30EB\u306E\u305F\u3081\u5C11\u3057\u5F85\u3064\u304B\u3001\u4E00\u89A7\u3092\u5C11\u3057\u30B9\u30AF\u30ED\u30FC\u30EB\u3059\u308B\u3068\u53D6\u308A\u8FBC\u307F\u3084\u3059\u3044\u3088\u3002${roleCopy}`,
        {
          liveId,
          delta: 0,
          reaction: "idle",
          count: reaction.count,
          faceSrc: STORY_RINK_COLLECTING_JPG
        }
      );
      return;
    }
    const countLabel = reaction.count.toLocaleString("ja-JP");
    setSceneStory(
      "\u308A\u3093\u304F\u304C\u307F\u3093\u306A\u306E\u5FDC\u63F4\u30B3\u30E1\u30F3\u30C8\u3092\u96C6\u3081\u3066\u3044\u308B\u3088\uFF01",
      recording ? `\u3044\u307E ${countLabel} \u30B3\u30E1\u30F3\u30C8\u3002${reaction.delta > 0 ? `\u5FDC\u63F4\u304C +${reaction.delta} \u30B3\u30E1\u30F3\u30C8\u5897\u3048\u305F\u3088\u3002` : `\u300C${title || liveId || "\u653E\u9001"}\u300D\u3092\u898B\u5B88\u3063\u3066\u3044\u308B\u3088\u3002`} ${roleCopy}` : `\u8A18\u9332OFF\u3002ON\u306B\u3059\u308B\u3068\u300C${title || liveId || "\u653E\u9001"}\u300D\u306E\u5FDC\u63F4\u30B3\u30E1\u30F3\u30C8\u3092\u53EF\u8996\u5316\u3067\u304D\u308B\u3088\u3002${caster ? ` \u914D\u4FE1\u8005: ${caster}\u3002` : ""}${tags.length ? ` \u30BF\u30B0: ${tags.join(" / ")}\u3002` : ""}${roleCopy}`,
      {
        liveId,
        delta: reaction.delta,
        reaction: reaction.reaction,
        count: reaction.count
      }
    );
  }
  function clearWatchMetaCard() {
    const wrap = $("watchMeta");
    const title = $("watchTitle");
    const broadcaster = $("watchBroadcaster");
    const thumb = (
      /** @type {HTMLImageElement} */
      $("watchThumb")
    );
    const tags = $("watchTags");
    const audience = $("watchAudience");
    const viewerDomEl = $("watchViewerDom");
    const concurrentEstEl = $("watchConcurrentEst");
    const concurrentSubEl = $("watchConcurrentSub");
    const concurrentLoadingEl = $("watchConcurrentLoading");
    const concurrentReadyEl = $("watchConcurrentReady");
    const concurrentCard = (
      /** @type {HTMLElement|null} */
      $("watchConcurrentCard")
    );
    const uniqueEl = $("watchUniqueUsers");
    const noIdEl = $("watchCommentsNoId");
    const noteEl = $("watchAudienceNote");
    if (!wrap || !title || !broadcaster || !thumb || !tags) return;
    if (concurrentLoadingEl) concurrentLoadingEl.hidden = true;
    if (concurrentReadyEl) concurrentReadyEl.hidden = false;
    if (concurrentCard) concurrentCard.removeAttribute("aria-busy");
    wrap.hidden = true;
    title.textContent = "-";
    broadcaster.textContent = "-";
    thumb.hidden = true;
    thumb.removeAttribute("src");
    tags.innerHTML = "";
    if (audience) audience.hidden = true;
    if (viewerDomEl) viewerDomEl.textContent = "\u2014";
    if (concurrentEstEl) {
      concurrentEstEl.textContent = "\u2014";
      concurrentEstEl.removeAttribute("title");
    }
    if (concurrentSubEl) concurrentSubEl.textContent = "\u4EBA";
    if (uniqueEl) {
      uniqueEl.textContent = "\u2014";
      uniqueEl.removeAttribute("title");
    }
    if (noIdEl) noIdEl.textContent = "\u2014";
    if (noteEl) {
      noteEl.textContent = "";
      noteEl.removeAttribute("title");
    }
  }
  var _prevConcurrentEstimated = (
    /** @type {number|null} */
    null
  );
  var _prevViewerCount = (
    /** @type {number|null} */
    null
  );
  function renderWatchMetaCard(snapshot, commentEntries = []) {
    const wrap = $("watchMeta");
    const title = $("watchTitle");
    const broadcaster = $("watchBroadcaster");
    const thumb = (
      /** @type {HTMLImageElement} */
      $("watchThumb")
    );
    const tags = $("watchTags");
    const audience = $("watchAudience");
    const viewerDomEl = $("watchViewerDom");
    const concurrentEstEl = $("watchConcurrentEst");
    const concurrentSubEl = $("watchConcurrentSub");
    const concurrentLoadingEl = $("watchConcurrentLoading");
    const concurrentReadyEl = $("watchConcurrentReady");
    const concurrentCard = (
      /** @type {HTMLElement|null} */
      $("watchConcurrentCard")
    );
    const uniqueEl = $("watchUniqueUsers");
    const noIdEl = $("watchCommentsNoId");
    const noteEl = $("watchAudienceNote");
    if (!wrap || !title || !broadcaster || !thumb || !tags) return;
    if (!snapshot) {
      clearWatchMetaCard();
      return;
    }
    const titleText = String(snapshot.broadcastTitle || snapshot.title || "-").trim() || "-";
    const broadcasterText = String(snapshot.broadcasterName || "-").trim() || "-";
    const tagList = Array.isArray(snapshot.tags) ? snapshot.tags.filter((v) => String(v || "").trim()).slice(0, 10) : [];
    title.textContent = titleText;
    broadcaster.textContent = broadcasterText;
    tags.innerHTML = "";
    for (const tag of tagList) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = tag;
      tags.appendChild(chip);
    }
    const thumbnail = String(snapshot.thumbnailUrl || "").trim();
    if (thumbnail) {
      thumb.src = thumbnail;
      thumb.hidden = false;
    } else {
      thumb.hidden = true;
      thumb.removeAttribute("src");
    }
    const vc = snapshot.viewerCountFromDom;
    if (viewerDomEl) {
      viewerDomEl.textContent = typeof vc === "number" && Number.isFinite(vc) && vc >= 0 ? String(vc) : "\u2014";
    }
    if (typeof vc === "number" && Number.isFinite(vc) && vc >= 0) {
      if (_prevViewerCount != null && vc > _prevViewerCount) {
        const visitorsCard = viewerDomEl?.closest(".nl-live-stat-card");
        const icon = visitorsCard?.querySelector(".nl-live-stat-icon");
        triggerCharaReaction(icon ?? null, {
          delta: vc - _prevViewerCount,
          thresholds: [1, 10, 50],
          images: TANUNEE_IMGS
        });
      }
      _prevViewerCount = vc;
    }
    const recentActive = typeof snapshot.recentActiveUsers === "number" ? snapshot.recentActiveUsers : 0;
    if (concurrentEstEl) {
      const nowMs = Date.now();
      const { showConcurrent, sparseConcurrent } = watchMetaConcurrentGateFromSnapshot(snapshot);
      if (showConcurrent) {
        if (concurrentLoadingEl) concurrentLoadingEl.hidden = true;
        if (concurrentReadyEl) concurrentReadyEl.hidden = false;
        if (concurrentCard) concurrentCard.removeAttribute("aria-busy");
        const streamAge = typeof snapshot.streamAgeMin === "number" && snapshot.streamAgeMin >= 0 ? snapshot.streamAgeMin : void 0;
        const resolved = resolveConcurrentViewers({
          nowMs,
          officialViewers: typeof snapshot.officialViewerCount === "number" && Number.isFinite(snapshot.officialViewerCount) ? snapshot.officialViewerCount : void 0,
          officialUpdatedAtMs: typeof snapshot.officialStatsUpdatedAt === "number" && Number.isFinite(snapshot.officialStatsUpdatedAt) ? snapshot.officialStatsUpdatedAt : void 0,
          officialViewerIntervalMs: typeof snapshot.officialViewerIntervalMs === "number" && Number.isFinite(snapshot.officialViewerIntervalMs) && snapshot.officialViewerIntervalMs > 0 ? snapshot.officialViewerIntervalMs : void 0,
          previousStatisticsComments: typeof snapshot.officialCommentCount === "number" && Number.isFinite(snapshot.officialCommentCount) && typeof snapshot.officialStatisticsCommentsDelta === "number" && Number.isFinite(snapshot.officialStatisticsCommentsDelta) ? Math.max(0, snapshot.officialCommentCount - snapshot.officialStatisticsCommentsDelta) : void 0,
          currentStatisticsComments: typeof snapshot.officialCommentCount === "number" && Number.isFinite(snapshot.officialCommentCount) ? snapshot.officialCommentCount : void 0,
          receivedCommentsDelta: typeof snapshot.officialReceivedCommentsDelta === "number" && Number.isFinite(snapshot.officialReceivedCommentsDelta) ? snapshot.officialReceivedCommentsDelta : void 0,
          recentActiveUsers: recentActive,
          totalVisitors: typeof vc === "number" && vc > 0 ? vc : void 0,
          streamAgeMin: streamAge
        });
        const directLike = resolved.method === "official";
        concurrentEstEl.textContent = `${directLike ? "" : "~"}${resolved.estimated}`;
        if (_prevConcurrentEstimated != null && resolved.estimated !== _prevConcurrentEstimated && concurrentCard) {
          const icon = concurrentCard.querySelector(".nl-live-stat-icon");
          triggerCharaReaction(icon, {
            delta: Math.abs(resolved.estimated - _prevConcurrentEstimated),
            thresholds: [1, 20, 100],
            images: KONTA_IMGS
          });
        }
        _prevConcurrentEstimated = resolved.estimated;
        const parts = [];
        parts.push(concurrentResolutionMethodTitlePart(resolved.method));
        if (resolved.freshnessMs != null) {
          parts.push(`\u66F4\u65B0 ${Math.round(resolved.freshnessMs / 1e3)} \u79D2\u524D`);
        }
        if (resolved.captureRatio != null) {
          parts.push(`\u30B3\u30E1\u30F3\u30C8\u6355\u6349\u7387 ${Math.round(resolved.captureRatio * 100)}%`);
        }
        if (typeof snapshot.officialCommentSampleWindowMs === "number" && Number.isFinite(snapshot.officialCommentSampleWindowMs) && snapshot.officialCommentSampleWindowMs > 0) {
          parts.push(`\u7A93 ${Math.round(snapshot.officialCommentSampleWindowMs / 1e3)} \u79D2`);
        }
        const base = resolved.base;
        if (resolved.method !== "official") {
          const baseMethod = base.method === "combined" ? "\u8907\u5408" : base.method === "retention_only" ? "\u6EDE\u7559" : base.method === "active_only" ? "\u30B3\u30E1\u7387" : "\u6B20\u6E2C";
          parts.push(`${base.activeCommenters}\u4EBA\xD7${base.multiplier}\u2248${base.signalA}`);
          if (base.signalB > 0) parts.push(`\u6EDE\u7559${base.retentionPct}%\u2248${base.signalB}`);
          parts.push(`base:${baseMethod}`);
        }
        parts.push(`\u4FE1\u983C\u5EA6 ${Math.round(resolved.confidence * 100)}%`);
        if (sparseConcurrent) {
          parts.push(SPARSE_CONCURRENT_ESTIMATE_NOTE);
        }
        concurrentEstEl.title = parts.join(" | ");
        if (concurrentSubEl) {
          if (resolved.method === "official") {
            concurrentSubEl.textContent = "\u76F4\u63A5\u5024";
          } else if (resolved.method === "nowcast") {
            concurrentSubEl.textContent = resolved.freshnessMs != null ? `${Math.round(resolved.freshnessMs / 1e3)}\u79D2\u524D\u304B\u3089\u88DC\u9593` : "\u88DC\u9593";
          } else if (base.method === "combined") {
            concurrentSubEl.textContent = `${base.activeCommenters}\u4EBA\xD7${base.multiplier} + \u6EDE\u7559${base.retentionPct}%`;
          } else {
            concurrentSubEl.textContent = `5\u5206\u5185 ${base.activeCommenters}\u4EBA\xD7${base.multiplier}`;
          }
        }
      } else {
        if (concurrentLoadingEl) concurrentLoadingEl.hidden = false;
        if (concurrentReadyEl) concurrentReadyEl.hidden = true;
        if (concurrentCard) concurrentCard.setAttribute("aria-busy", "true");
        concurrentEstEl.textContent = "";
        concurrentEstEl.removeAttribute("title");
        if (concurrentSubEl) concurrentSubEl.textContent = "";
      }
    }
    const st = summarizeRecordedCommenters(
      Array.isArray(commentEntries) ? commentEntries : []
    );
    if (uniqueEl) {
      if (st.uniqueKnownUserIds > 0) {
        uniqueEl.textContent = String(st.uniqueKnownUserIds);
        uniqueEl.title = "userId \u304C\u53D6\u308C\u305F\u30B3\u30E1\u30F3\u30C8\u306B\u3064\u3044\u3066\u306E distinct \u6570";
      } else if (st.distinctAvatarUrls > 0) {
        uniqueEl.textContent = `\u2248${st.distinctAvatarUrls}`;
        uniqueEl.title = "userId \u672A\u53D6\u5F97\u306E\u305F\u3081\u3001\u8A18\u9332\u3055\u308C\u305F https \u30A2\u30A4\u30B3\u30F3 URL \u306E\u7A2E\u985E\u6570\u3092\u53C2\u8003\u8868\u793A\uFF08\u91CD\u8907\u30A2\u30A4\u30B3\u30F3\u306F1\u306B\u307E\u3068\u307E\u308A\u307E\u3059\uFF09";
      } else {
        uniqueEl.textContent = "0";
        uniqueEl.title = "userId \u3082\u6709\u52B9\u306A avatarUrl \u3082\u7121\u3044\u30B3\u30E1\u30F3\u30C8\u306E\u307F\u306E\u3068\u304D\u306F 0 \u306E\u307E\u307E\u3067\u3059";
      }
    }
    if (noIdEl) noIdEl.textContent = String(st.commentsWithoutUserId);
    if (noteEl) {
      const { body, title: title2 } = buildWatchAudienceNote({ snapshot });
      noteEl.textContent = body;
      noteEl.title = title2;
    }
    if (audience) audience.hidden = false;
    wrap.hidden = false;
  }
  function applyStorageErrorBannerFromBag(bag, viewerLiveId = "") {
    const banner = $("storageErrorBanner");
    const detail = $("storageErrorDetail");
    if (!banner || !detail) return;
    const raw = bag[KEY_STORAGE_WRITE_ERROR];
    if (raw && typeof raw === "object" && "at" in raw && typeof /** @type {{ at: unknown }} */
    raw.at === "number") {
      const err = (
        /** @type {{ at: number; liveId?: string; message?: string }} */
        raw
      );
      if (!storageErrorRelevantToLiveId(err, viewerLiveId)) {
        banner.classList.remove("is-visible");
        detail.textContent = "";
        return;
      }
      banner.classList.add("is-visible");
      const parts = [];
      if (err.liveId) parts.push(`\u653E\u9001: ${String(err.liveId)}`);
      if (err.message) parts.push(String(err.message));
      detail.textContent = parts.length ? `\uFF08${parts.join(" / ")}\uFF09` : "";
    } else {
      banner.classList.remove("is-visible");
      detail.textContent = "";
    }
  }
  function applyCommentHarvestBannerFromBag(bag, viewerLiveId = "") {
    const banner = $("commentHarvestBanner");
    const detail = $("commentHarvestBannerDetail");
    if (!banner || !detail) return;
    const payload = parseCommentPanelStatusPayload(bag[KEY_COMMENT_PANEL_STATUS]);
    if (payload && commentPanelStatusRelevantToLiveId(payload, viewerLiveId)) {
      banner.removeAttribute("hidden");
      const parts = [];
      if (payload.liveId) parts.push(`\u653E\u9001: ${String(payload.liveId)}`);
      if (payload.code) parts.push(String(payload.code));
      detail.textContent = parts.length ? `\uFF08${parts.join(" / ")}\uFF09` : "";
    } else {
      banner.setAttribute("hidden", "");
      detail.textContent = "";
    }
  }
  function renderRoomHeatSummary(totalRecent, activeUsers, heatPercent, heatText) {
    const summary = (
      /** @type {HTMLElement|null} */
      $("roomHeatSummary")
    );
    const meta = $("roomHeatMeta");
    const fill = (
      /** @type {HTMLElement|null} */
      $("roomHeatFill")
    );
    const note = $("roomHeatNote");
    if (!summary || !meta || !fill || !note) return;
    summary.hidden = false;
    meta.textContent = `+${totalRecent}\u4EF6 / ${activeUsers}\u4EBA`;
    fill.style.width = `${Math.max(0, Math.min(100, Number(heatPercent) || 0)).toFixed(2)}%`;
    note.textContent = `${heatText}\uFF08\u3053\u306E5\u5206\u3067\u5897\u3048\u305F\u4EF6\u6570\uFF09`;
  }
  function renderTopSupportRankStrip(stripRooms) {
    const strip = (
      /** @type {HTMLElement|null} */
      $("topSupportRankStrip")
    );
    if (!strip) return;
    if (!stripRooms.length) {
      strip.hidden = true;
      strip.innerHTML = "";
      strip.setAttribute("aria-hidden", "true");
      return;
    }
    strip.hidden = false;
    strip.removeAttribute("aria-hidden");
    strip.setAttribute(
      "aria-label",
      "\u8A18\u9332\u3057\u305F\u5FDC\u63F4\u30B3\u30E1\u30F3\u30C8\u3092\u30E6\u30FC\u30B6\u30FC\u5225\u306B\u6570\u3048\u305F\u4EF6\u6570\u306E\u591A\u3044\u9806"
    );
    const rankScheme = getStoryColorScheme();
    const models = topSupportRankLineModels(stripRooms, {
      defaultThumbSrc: STORY_GRID_DEFAULT_TILE_IMG,
      anonymousFallbackThumbSrc: STORY_REMOTE_FAILED_PLACEHOLDER_IMG,
      colorScheme: rankScheme
    });
    const html = models.map((m) => {
      const placeHtml = m.placeNumber != null ? `<span class="nl-top-support-rank__place" aria-hidden="true">${m.placeNumber}</span>` : `<span class="nl-top-support-rank__place nl-top-support-rank__place--empty" aria-hidden="true"></span>`;
      const full = escapeAttr(m.fullLabelForTitle);
      const displayThumb = storyAvatarLoadGuard.pickDisplaySrc(m.thumbSrc);
      const thumbRp = isHttpOrHttpsUrl(displayThumb) ? ' referrerpolicy="no-referrer"' : "";
      const idText = escapeHtml(m.idShort);
      const nameText = escapeHtml(m.nameLine);
      const idTitle = m.isUnknown ? "" : escapeAttr(m.idTitle);
      let lineClass = `nl-top-support-rank__line${m.isUnknown ? " nl-top-support-rank__line--unknown" : ""}`;
      let lineStyle = "";
      if (m.hasAccent && m.accentColorCss) {
        lineClass += " nl-top-support-rank__line--has-accent";
        lineStyle = ` style="--nl-rank-accent:${escapeAttr(m.accentColorCss)}"`;
      }
      return `<div class="${lineClass}"${lineStyle} role="listitem" title="${full}">
        ${placeHtml}
        <span class="nl-top-support-rank__count">${m.count}\u4EF6</span>
        <span class="nl-top-support-rank__thumb-wrap">
          <img class="nl-top-support-rank__thumb" src="${escapeAttr(displayThumb)}" alt="" decoding="async"${thumbRp} />
        </span>
        <span class="nl-top-support-rank__id" title="${idTitle}">${idText}</span>
        <span class="nl-top-support-rank__name">${nameText}</span>
      </div>`;
    }).join("");
    strip.innerHTML = `<p class="nl-top-support-rank__note">\u8A18\u9332\u5185\u30FB\u30E6\u30FC\u30B6\u30FC\u5225\u306E\u5FDC\u63F4\u4EF6\u6570\u304C\u591A\u3044\u9806\u3067\u3059\u3002</p><div class="nl-top-support-rank__list" role="list">${html}</div>`;
    const thumbs = strip.querySelectorAll("img.nl-top-support-rank__thumb");
    models.forEach((m, i) => {
      const img = thumbs[i];
      if (!(img instanceof HTMLImageElement)) return;
      if (isHttpOrHttpsUrl(m.thumbSrc)) {
        storyAvatarLoadGuard.noteRemoteAttempt(img, m.thumbSrc);
      }
    });
  }
  function renderUserRooms(entries, liveId = "") {
    const ul = (
      /** @type {HTMLUListElement} */
      $("userRoomList")
    );
    if (!ul) return;
    const list = Array.isArray(entries) ? entries : [];
    const latestAt = list.reduce((max, e) => {
      const at = Number(e?.capturedAt || 0);
      return at > max ? at : max;
    }, 0);
    const recentWindowMs = 5 * 60 * 1e3;
    const recentThreshold = latestAt > 0 ? latestAt - recentWindowMs : Infinity;
    const recentMap = /* @__PURE__ */ new Map();
    for (const e of list) {
      const at = Number(e?.capturedAt || 0);
      if (at <= 0 || at < recentThreshold) continue;
      const uid = e?.userId ? String(e.userId).trim() : "";
      const userKey = uid || UNKNOWN_USER_KEY;
      recentMap.set(userKey, (recentMap.get(userKey) || 0) + 1);
    }
    const recentCounts = Array.from(recentMap.values());
    const totalRecent = recentCounts.reduce((sum, v) => sum + v, 0);
    const activeUsers = recentCounts.filter((v) => v > 0).length;
    const heatPercent = totalRecent > 0 ? Math.min(100, Math.log10(totalRecent + 1) * 38) : 0;
    const heatText = totalRecent >= 50 ? "\u5897\u52A0\u304C\u3068\u3066\u3082\u5927\u304D\u3044" : totalRecent >= 20 ? "\u5897\u52A0\u304C\u5927\u304D\u3044" : totalRecent >= 5 ? "\u5897\u52A0\u3042\u308A" : "\u5897\u52A0\u306F\u5C11\u306A\u3081";
    renderRoomHeatSummary(totalRecent, activeUsers, heatPercent, heatText);
    const rooms = aggregateCommentsByUser(list);
    ul.innerHTML = "";
    if (!rooms.length) {
      _lastTopSupportRankStripStableKey = null;
      renderTopSupportRankStrip([]);
      const li = document.createElement("li");
      li.className = "empty-hint";
      li.textContent = "\u307E\u3060\u30B3\u30E1\u30F3\u30C8\u304C\u3042\u308A\u307E\u305B\u3093";
      ul.appendChild(li);
      return;
    }
    const rankedRooms = rooms.map((room) => ({
      ...room,
      recentCount: recentMap.get(room.userKey) || 0
    })).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      const uidA = a.userKey === UNKNOWN_USER_KEY ? "" : a.userKey;
      const uidB = b.userKey === UNKNOWN_USER_KEY ? "" : b.userKey;
      const scoreA = userLaneResolvedThumbScore(uidA, a.avatarUrl);
      const scoreB = userLaneResolvedThumbScore(uidB, b.avatarUrl);
      if (scoreB !== scoreA) return scoreB - scoreA;
      if (b.recentCount !== a.recentCount) return b.recentCount - a.recentCount;
      return b.lastAt - a.lastAt;
    });
    const denseLayout = document.body?.classList.contains("nl-tight") || document.body?.classList.contains("nl-compact");
    const compactRooms = !INLINE_MODE;
    const MAX_VISIBLE_ROOMS = compactRooms ? 1 : denseLayout ? 2 : 3;
    const stripSlice = rankedRooms.slice(0, TOP_SUPPORT_RANK_STRIP_MAX);
    const stripKey = topSupportRankStripStableKey(liveId, list.length, stripSlice);
    if (stripKey !== _lastTopSupportRankStripStableKey) {
      _lastTopSupportRankStripStableKey = stripKey;
      renderTopSupportRankStrip(stripSlice);
    }
    const visibleRooms = rankedRooms.slice(0, MAX_VISIBLE_ROOMS);
    const maxTotal = Math.max(1, ...visibleRooms.map((v) => v.count));
    const maxRecent = Math.max(1, ...visibleRooms.map((v) => v.recentCount));
    for (const r of visibleRooms) {
      const li = document.createElement("li");
      li.classList.add("room-card");
      const label = displayUserLabel(r.userKey, r.nickname);
      const isUnknown = r.userKey === UNKNOWN_USER_KEY;
      const uidForThumb = isUnknown ? "" : r.userKey;
      const thumbSrc = pickSupportGrowthFallbackTileSrc(
        uidForThumb,
        r.avatarUrl,
        STORY_GRID_DEFAULT_TILE_IMG,
        STORY_REMOTE_FAILED_PLACEHOLDER_IMG
      );
      const displayThumb = storyAvatarLoadGuard.pickDisplaySrc(thumbSrc);
      const thumbRp = isHttpOrHttpsUrl(displayThumb) ? ' referrerpolicy="no-referrer"' : "";
      const avatarHtml = `<img class="nl-ticker-latest__avatar room-card__avatar" alt="" src="${escapeAttr(displayThumb)}" decoding="async"${thumbRp}>`;
      const totalPercent = Math.max(6, Math.min(100, r.count / maxTotal * 100));
      const recentPercent = r.recentCount > 0 ? Math.max(4, Math.min(100, r.recentCount / maxRecent * 100)) : 0;
      const deltaLabel = r.recentCount > 0 ? `+${r.recentCount} / 5\u5206` : "\xB10 / 5\u5206";
      const hint = isUnknown ? '<div class="room-hint">\u6295\u7A3F\u8005ID\u672A\u53D6\u5F97\u306E\u30B3\u30E1\u30F3\u30C8\u3092\u3053\u3053\u306B\u307E\u3068\u3081\u3066\u3044\u307E\u3059\u3002</div>' : "";
      li.innerHTML = compactRooms ? `
      <div class="room-card__row">
        ${avatarHtml}
        <div class="room-main">
          <div class="room-name-row">
            <span class="room-name" title="${escapeHtml(r.userKey)}">${escapeHtml(label)}</span>
          </div>
          ${r.lastText ? `<div class="room-preview">${escapeHtml(r.lastText)}</div>` : ""}
          ${hint}
        </div>
      </div>
    ` : `
      <div class="room-card__row">
        ${avatarHtml}
        <div class="room-main">
          <div class="room-name-row">
            <span class="room-name" title="${escapeHtml(r.userKey)}">${escapeHtml(label)}</span>
          </div>
          <div class="room-bar-row">
            <div class="room-bar-track">
              <div class="room-bar-total" style="width:${totalPercent.toFixed(2)}%"></div>
              <div class="room-bar-recent" style="width:${recentPercent.toFixed(2)}%"></div>
            </div>
            <span class="room-delta ${r.recentCount > 0 ? "up" : ""}">${deltaLabel}</span>
          </div>
          ${r.lastText ? `<div class="room-preview">${escapeHtml(r.lastText)}</div>` : ""}
          ${hint}
        </div>
      </div>
    `;
      ul.appendChild(li);
      const avImg = li.querySelector("img.room-card__avatar");
      if (avImg instanceof HTMLImageElement && isHttpOrHttpsUrl(thumbSrc)) {
        storyAvatarLoadGuard.noteRemoteAttempt(avImg, thumbSrc);
      }
    }
    if (rankedRooms.length > visibleRooms.length) {
      const rest = rankedRooms.length - visibleRooms.length;
      const li = document.createElement("li");
      li.className = "empty-hint";
      li.textContent = `\u307B\u304B ${rest} \u30E6\u30FC\u30B6\u30FC\uFF08\u4E0A\u4F4D\u306E\u307F\u8868\u793A\uFF09`;
      ul.appendChild(li);
    }
  }
  async function sendMessageToWatchTabs(watchUrl, message) {
    const candidates = await collectWatchTabCandidates(watchUrl);
    for (const candidate of candidates) {
      try {
        return await tabsSendMessageWithRetry(candidate.id, message);
      } catch {
      }
    }
    return null;
  }
  function normalizeInterceptCacheItems(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const v of raw) {
      if (!v || typeof v !== "object") continue;
      const item = (
        /** @type {{ no?: unknown, uid?: unknown, name?: unknown, av?: unknown }} */
        v
      );
      const no = String(item.no || "").trim();
      const uid = String(item.uid || "").trim();
      if (!no) continue;
      const name = String(item.name || "").trim();
      const av = isHttpOrHttpsUrl(item.av) ? String(item.av || "").trim() : "";
      if (!uid && !name && !av) continue;
      out.push({ no, uid, name, av });
    }
    return out;
  }
  function mergeInterceptCacheItems(items) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const byNo = /* @__PURE__ */ new Map();
    for (const it of items) {
      const no = String(it?.no || "").trim();
      if (!no) continue;
      const prev = byNo.get(no);
      if (!prev) {
        byNo.set(no, {
          no,
          uid: String(it?.uid || "").trim(),
          name: String(it?.name || "").trim(),
          av: isHttpOrHttpsUrl(it?.av) ? String(it.av || "").trim() : ""
        });
        continue;
      }
      byNo.set(no, {
        no,
        uid: String(it?.uid || "").trim() || prev.uid,
        name: String(it?.name || "").trim() || prev.name,
        av: (isHttpOrHttpsUrl(it?.av) ? String(it.av || "").trim() : "") || prev.av
      });
    }
    return [...byNo.values()];
  }
  async function requestInterceptCacheFromOpenTab(watchUrl, opts = {}) {
    const diag = { code: "no_watch_tab", detail: "" };
    const candidates = await collectWatchTabCandidates(watchUrl);
    if (!candidates.length) {
      return { items: [], diag };
    }
    const merged = [];
    let sawOkTrue = false;
    let sawOkFalse = false;
    let lastRejectError = "";
    let sawSendError = false;
    for (const candidate of candidates) {
      try {
        const ranked = await listWatchFramesWithInnerText(candidate.id);
        const tried = /* @__PURE__ */ new Set();
        const tryOrder = [...ranked.map((r) => r.frameId), 0];
        for (const fid of tryOrder) {
          if (tried.has(fid)) continue;
          tried.add(fid);
          try {
            const res = (
              /** @type {{ ok?: boolean, items?: unknown, error?: unknown }|null} */
              await tabsSendMessageWithRetry(
                candidate.id,
                {
                  type: "NLS_EXPORT_INTERCEPT_CACHE",
                  ...opts.deep ? { deep: true } : {}
                },
                { frameId: fid, maxAttempts: 5, delayMs: 90 }
              )
            );
            if (!res) continue;
            if (res.ok === true) {
              sawOkTrue = true;
              const chunk = normalizeInterceptCacheItems(res.items);
              merged.push(...chunk);
              continue;
            }
            if (res.ok === false) {
              sawOkFalse = true;
              const er = String(res.error || "").trim();
              if (er) lastRejectError = er;
            }
          } catch {
            sawSendError = true;
          }
        }
      } catch {
        sawSendError = true;
      }
    }
    const items = mergeInterceptCacheItems(merged);
    if (items.length > 0) {
      diag.code = "ok";
      diag.detail = "";
    } else if (sawOkTrue) {
      diag.code = "ok_empty";
      diag.detail = "\u53D6\u308A\u8FBC\u307F\u306F\u6210\u529F\u3057\u307E\u3057\u305F\u304C0\u4EF6\u3067\u3057\u305F\u3002watch\u3092\u958B\u3044\u305F\u307E\u307E\u30DD\u30C3\u30D7\u30A2\u30C3\u30D7\u3092\u66F4\u65B0\u3059\u308B\u304B\u3001\u30DA\u30FC\u30B8\u3092\u518D\u8AAD\u307F\u8FBC\u307F\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
    } else if (sawOkFalse) {
      diag.code = "export_rejected";
      diag.detail = lastRejectError ? lastRejectError.slice(0, 120) : "\u30DA\u30FC\u30B8\u5074\u304C\u53D6\u308A\u8FBC\u307F\u3092\u62D2\u5426\u3057\u307E\u3057\u305F";
    } else if (sawSendError) {
      diag.code = "message_failed";
      diag.detail = "\u30DA\u30FC\u30B8\u3068\u306E\u901A\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\uFF08\u30BF\u30D6\u306E\u518D\u8AAD\u307F\u8FBC\u307F\u3092\u8A66\u3057\u3066\u304F\u3060\u3055\u3044\uFF09";
    } else {
      diag.code = "no_success_response";
      diag.detail = "\u30DA\u30FC\u30B8\u304B\u3089\u5FDC\u7B54\u304C\u3042\u308A\u307E\u305B\u3093\uFF08\u5BFE\u8C61\u306Ewatch\u30BF\u30D6\u304C\u958B\u3044\u3066\u3044\u308B\u304B\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\uFF09";
    }
    return { items, diag };
  }
  function mergeCommentsWithInterceptCache(entries, items, opts = {}) {
    if (!Array.isArray(entries) || entries.length === 0 || items.length === 0) {
      return {
        next: Array.isArray(entries) ? entries : [],
        patched: 0,
        uidReplaced: 0
      };
    }
    const byNo = /* @__PURE__ */ new Map();
    for (const it of items) {
      const prev = byNo.get(it.no);
      if (!prev) {
        byNo.set(it.no, it);
        continue;
      }
      byNo.set(it.no, {
        no: it.no,
        uid: it.uid || prev.uid,
        name: it.name || prev.name,
        av: it.av || prev.av
      });
    }
    const mismatchByCurrentUid = /* @__PURE__ */ new Map();
    for (const e of entries) {
      const no = String(e?.commentNo || "").trim();
      if (!no) continue;
      const hit = byNo.get(no);
      if (!hit?.uid) continue;
      const curUid = String(e?.userId || "").trim();
      if (!curUid) continue;
      const st = mismatchByCurrentUid.get(curUid) || {
        total: 0,
        mismatch: 0,
        hitUids: /* @__PURE__ */ new Set()
      };
      st.total += 1;
      if (curUid !== hit.uid) {
        st.mismatch += 1;
        st.hitUids.add(hit.uid);
      }
      mismatchByCurrentUid.set(curUid, st);
    }
    const preferInterceptUidSet = opts.preferInterceptUidSet instanceof Set ? opts.preferInterceptUidSet : /* @__PURE__ */ new Set();
    const shouldReplaceUid = (curUid) => {
      if (!curUid) return false;
      if (preferInterceptUidSet.has(curUid)) return true;
      const st = mismatchByCurrentUid.get(curUid);
      if (!st || st.total < 4) return false;
      if (st.hitUids.size < 3) return false;
      return st.mismatch >= Math.ceil(st.total * 0.6);
    };
    let patched = 0;
    let uidReplaced = 0;
    const next = entries.map((e) => {
      const no = String(e?.commentNo || "").trim();
      if (!no) return e;
      const hit = byNo.get(no);
      if (!hit) return e;
      const curUid = String(e?.userId || "").trim();
      const curName = String(e?.nickname || "").trim();
      const curAv = String(e?.avatarUrl || "").trim();
      let changed = false;
      let out = e;
      if (hit.uid) {
        const tie = shouldReplaceUid(curUid) ? "incoming" : "existing";
        const chosen = pickStrongerUserId(curUid, hit.uid, tie);
        if (chosen && chosen !== curUid) {
          if (curUid) uidReplaced += 1;
          out = { ...out, userId: chosen };
          changed = true;
        }
      }
      if (hit.name && !curName) {
        out = { ...out, nickname: hit.name };
        changed = true;
      }
      const uidForAv = String(out.userId || "").trim();
      const hitAv = String(hit.av || "").trim();
      if (hitAv && isHttpOrHttpsUrl(hitAv)) {
        const curSc = commentEnrichmentAvatarScore(uidForAv, curAv);
        const hitSc = commentEnrichmentAvatarScore(uidForAv, hitAv);
        if (hitSc > curSc) {
          out = { ...out, avatarUrl: hitAv };
          changed = true;
        }
      }
      if (changed) patched += 1;
      return out;
    });
    return { next, patched, uidReplaced };
  }
  function stripViewerAvatarContamination(entries, liveId, snapshot) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return { next: Array.isArray(entries) ? entries : [], patched: 0 };
    }
    const viewerAvatar = String(snapshot?.viewerAvatarUrl || "").trim();
    const viewerUid = String(snapshot?.viewerUserId || "").trim();
    const broadcasterUid = String(snapshot?.broadcasterUserId || "").trim();
    if (!isHttpOrHttpsUrl(viewerAvatar) && !viewerUid && !broadcasterUid) {
      return { next: entries, patched: 0 };
    }
    const ownPostedIds = getOwnPostedMatchedIdSet(entries, liveId);
    let patched = 0;
    const next = entries.map((e) => {
      let changed = false;
      const out = { ...e };
      const isOwn = e?.selfPosted || ownPostedIds.has(popupEntryStableId(e, liveId));
      if (viewerUid && String(e?.userId || "").trim() === viewerUid) {
        if (!isOwn) {
          delete out.userId;
          changed = true;
        }
      }
      if (broadcasterUid && String(e?.userId || "").trim() === broadcasterUid) {
        if (!isOwn) {
          delete out.userId;
          changed = true;
        }
      }
      const av = String(e?.avatarUrl || "").trim();
      if (isHttpOrHttpsUrl(viewerAvatar) && av && isSameAvatarUrl(av, viewerAvatar) && !isOwn) {
        delete out.avatarUrl;
        changed = true;
      }
      if (!changed) return e;
      patched += 1;
      return out;
    });
    return { next, patched };
  }
  async function findWatchTabIdForVoice(watchUrl) {
    const list = await collectWatchTabCandidates(watchUrl);
    return list[0]?.id ?? null;
  }
  function setCaptureStatus(statusEl, message, kind = "idle") {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.remove("error", "success");
    if (kind === "error") statusEl.classList.add("error");
    if (kind === "success") statusEl.classList.add("success");
  }
  function screenshotErrorMessage(code) {
    switch (code) {
      case "not_watch":
        return "watch\u30DA\u30FC\u30B8\u306E\u30BF\u30D6\u3092\u958B\u3044\u305F\u72B6\u614B\u3067\u8A66\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
      case "no_video":
        return "\u52D5\u753B\u30D7\u30EC\u30A4\u30E4\u30FC\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002";
      case "not_ready":
        return "\u52D5\u753B\u306E\u6E96\u5099\u304C\u3067\u304D\u3066\u3044\u307E\u305B\u3093\u3002\u3057\u3070\u3089\u304F\u3057\u3066\u304B\u3089\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
      case "tainted_canvas":
        return "\u30D6\u30E9\u30A6\u30B6\u306E\u5236\u9650\u3067\u3053\u306E\u914D\u4FE1\u306F\u76F4\u63A5\u30AD\u30E3\u30D7\u30C1\u30E3\u3067\u304D\u307E\u305B\u3093\u3002";
      default:
        return "\u30AD\u30E3\u30D7\u30C1\u30E3\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002";
    }
  }
  async function applyThumbSelectFromStorage() {
    const sel = (
      /** @type {HTMLSelectElement|null} */
      $("thumbInterval")
    );
    if (!sel) return;
    const bag = await chrome.storage.local.get([KEY_THUMB_AUTO, KEY_THUMB_INTERVAL_MS]);
    const auto = isThumbAutoEnabled(bag[KEY_THUMB_AUTO]);
    const ms = normalizeThumbIntervalMs(bag[KEY_THUMB_INTERVAL_MS]);
    const v = auto && ms > 0 ? String(ms) : "0";
    const allowed = /* @__PURE__ */ new Set(["0", "30000", "60000", "300000"]);
    sel.value = allowed.has(v) ? v : "0";
  }
  async function applyVoiceAutosendFromStorage() {
    const cb = (
      /** @type {HTMLInputElement|null} */
      $("voiceAutoSend")
    );
    if (!cb) return;
    const bag = await chrome.storage.local.get(KEY_VOICE_AUTOSEND);
    cb.checked = bag[KEY_VOICE_AUTOSEND] !== false;
  }
  async function applyCommentEnterSendFromStorage() {
    const cb = (
      /** @type {HTMLInputElement|null} */
      $("commentEnterSend")
    );
    if (!cb) return;
    const bag = await chrome.storage.local.get(KEY_COMMENT_ENTER_SEND);
    cb.checked = isCommentEnterSendEnabled(bag[KEY_COMMENT_ENTER_SEND]);
  }
  var suppressSupportVisualTogglePersist = false;
  var ownSupportVisualPersistInFlight = false;
  var supportVisualUiWired = false;
  function scrollNlMainToRevealElement(el) {
    const main = (
      /** @type {HTMLElement|null} */
      document.querySelector(".nl-main")
    );
    if (!main || !el) return;
    const pad = 12;
    const parentRect = main.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const delta = computeScrollDeltaToRevealInParent(
      { top: parentRect.top, bottom: parentRect.bottom },
      { top: elRect.top, bottom: elRect.bottom },
      pad
    );
    if (delta !== 0) main.scrollTop += delta;
  }
  function afterNextLayout(cb) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        cb();
      });
    });
  }
  var supportVisualScrollObserver = null;
  function scheduleScrollOpenSupportVisualDetails(details) {
    if (!details) return;
    cleanupSupportVisualScrollObserver();
    const body = details.querySelector(".nl-support-visual-details__body");
    const target = (
      /** @type {HTMLElement} */
      body || details
    );
    const runScroll = () => {
      if (!details.open) return;
      const detailsEl = (
        /** @type {HTMLElement} */
        details
      );
      scrollNlMainToRevealElement(detailsEl);
      scrollNlMainToRevealElement(target);
    };
    supportVisualScrollObserver = new ResizeObserver(() => runScroll());
    supportVisualScrollObserver.observe(target);
    afterNextLayout(runScroll);
    globalThis.setTimeout(() => {
      cleanupSupportVisualScrollObserver();
    }, 800);
  }
  function cleanupSupportVisualScrollObserver() {
    if (supportVisualScrollObserver) {
      supportVisualScrollObserver.disconnect();
      supportVisualScrollObserver = null;
    }
  }
  function setUsageTermsGateDismissedUi() {
    document.documentElement.setAttribute("data-nl-usage-terms-ack", "1");
  }
  function writeUsageTermsAckToLocalMirror() {
    try {
      globalThis.localStorage?.setItem(KEY_USAGE_TERMS_ACK, "1");
    } catch {
    }
  }
  async function applyUsageTermsGateState() {
    setUsageTermsGateDismissedUi();
    if (!hasExtensionContext()) return;
    writeUsageTermsAckToLocalMirror();
    try {
      await storageSetSafe({ [KEY_USAGE_TERMS_ACK]: true });
    } catch {
    }
  }
  function correctSupportVisualScrollIfOpen() {
    const details = (
      /** @type {HTMLDetailsElement|null} */
      document.getElementById("supportVisualDetails")
    );
    if (!details?.open) return;
    const body = details.querySelector(".nl-support-visual-details__body");
    const target = (
      /** @type {HTMLElement} */
      body || details
    );
    scrollNlMainToRevealElement(
      /** @type {HTMLElement} */
      details
    );
    scrollNlMainToRevealElement(target);
  }
  async function applySupportVisualExpandedFromStorage() {
    const details = (
      /** @type {HTMLDetailsElement|null} */
      $("supportVisualDetails")
    );
    if (!details) return;
    const bag = await storageGetSafe(KEY_SUPPORT_VISUAL_EXPANDED, {});
    const raw = bag[KEY_SUPPORT_VISUAL_EXPANDED];
    const open = normalizeSupportVisualExpanded(raw, { inlineMode: INLINE_MODE });
    if (details.open === open) {
      return;
    }
    suppressSupportVisualTogglePersist = true;
    try {
      details.open = open;
    } finally {
      suppressSupportVisualTogglePersist = false;
    }
  }
  async function applyStoryGrowthCollapsedFromStorage() {
    const btn = (
      /** @type {HTMLButtonElement|null} */
      $("storyGrowthCollapseBtn")
    );
    const bag = await chrome.storage.local.get(KEY_STORY_GROWTH_COLLAPSED);
    const collapsed = bag[KEY_STORY_GROWTH_COLLAPSED] === true;
    document.body?.classList.toggle("nl-story-growth-collapsed", collapsed);
    if (btn) {
      btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
      btn.textContent = collapsed ? "\u30A2\u30A4\u30B3\u30F3\u5217\u3092\u8868\u793A" : "\u30A2\u30A4\u30B3\u30F3\u5217\u3092\u96A0\u3059";
    }
  }
  function setVoiceDeviceCheckStatus(el, text, kind = "idle") {
    if (!el) return;
    el.textContent = text;
    el.classList.remove("error", "success");
    if (kind === "error") el.classList.add("error");
    if (kind === "success") el.classList.add("success");
  }
  async function refreshVoiceInputDeviceList() {
    const sel = (
      /** @type {HTMLSelectElement|null} */
      $("voiceInputDevice")
    );
    const statusEl = $("voiceDeviceCheckStatus");
    if (!sel) return;
    const previous = sel.value;
    const bag = await chrome.storage.local.get(KEY_VOICE_INPUT_DEVICE);
    const stored = String(bag[KEY_VOICE_INPUT_DEVICE] || "");
    setVoiceDeviceCheckStatus(statusEl, "\u4E00\u89A7\u3092\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026", "idle");
    try {
      try {
        const warm = await navigator.mediaDevices.getUserMedia({ audio: true });
        warm.getTracks().forEach((t) => t.stop());
      } catch {
      }
      const list = await navigator.mediaDevices.enumerateDevices();
      const inputs = list.filter((d) => d.kind === "audioinput");
      sel.innerHTML = "";
      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = "\u65E2\u5B9A\uFF08\u30B7\u30B9\u30C6\u30E0\u30C7\u30D5\u30A9\u30EB\u30C8\uFF09";
      sel.appendChild(opt0);
      for (const d of inputs) {
        const o = document.createElement("option");
        o.value = d.deviceId;
        o.textContent = d.label || `\u30DE\u30A4\u30AF (${d.deviceId.slice(0, 10)}\u2026)`;
        sel.appendChild(o);
      }
      const ids = new Set(Array.from(sel.options, (o) => o.value));
      const pick = (previous && ids.has(previous) ? previous : "") || (stored && ids.has(stored) ? stored : "");
      sel.value = pick;
      if (pick !== stored) {
        await chrome.storage.local.set({ [KEY_VOICE_INPUT_DEVICE]: pick });
      }
      setVoiceDeviceCheckStatus(
        statusEl,
        inputs.length ? `\u30DE\u30A4\u30AF ${inputs.length} \u53F0\u3092\u691C\u51FA\u3057\u307E\u3057\u305F` : "\u5165\u529B\u30C7\u30D0\u30A4\u30B9\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093",
        "idle"
      );
    } catch {
      setVoiceDeviceCheckStatus(statusEl, "\u30C7\u30D0\u30A4\u30B9\u4E00\u89A7\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002", "error");
    }
  }
  function renderAcquisitionDashboard(p) {
    const host = $("devMonitorAcquisition");
    if (!host) return;
    const liveId = String(p.liveId || "").trim();
    if (!liveId) {
      host.innerHTML = '<section class="nl-acquisition nl-acquisition--empty" aria-label="\u30C7\u30FC\u30BF\u53D6\u5F97\u7387"><p class="nl-acquisition__empty">\u30CB\u30B3\u751F watch \u3092\u958B\u3044\u305F\u72B6\u614B\u3067\u30DD\u30C3\u30D7\u30A2\u30C3\u30D7\u3092\u958B\u304F\u3068\u3001\u53D6\u5F97\u7387\u30C1\u30E3\u30FC\u30C8\u304C\u8868\u793A\u3055\u308C\u307E\u3059\uFF08\u8A18\u93320\u4EF6\u3067\u3082\u8868\u793A\uFF09\u3002</p></section>';
      return;
    }
    const avs = p.avatarStats;
    const t = avs && typeof avs.total === "number" ? Math.max(0, avs.total) : 0;
    const withHttpStored = avs && typeof avs.withHttpAvatar === "number" && Number.isFinite(avs.withHttpAvatar) ? Math.max(0, avs.withHttpAvatar) : 0;
    const resolvedRaw = avs && typeof avs.withResolvedAvatar === "number" && Number.isFinite(avs.withResolvedAvatar) ? Math.max(0, avs.withResolvedAvatar) : null;
    const thumbNumerator = resolvedRaw != null ? Math.min(resolvedRaw, t || resolvedRaw) : withHttpStored;
    const thumb = t > 0 ? thumbNumerator / t * 100 : 0;
    const idPct = t > 0 ? (t - avs.missingUserId) / t * 100 : 0;
    const nick = t > 0 ? avs.withNickname / t * 100 : 0;
    const oc = p.snapshot && typeof p.snapshot.officialCommentCount === "number" && Number.isFinite(p.snapshot.officialCommentCount) ? p.snapshot.officialCommentCount : null;
    let commentPct = null;
    if (oc != null && oc > 0) {
      commentPct = Math.min(100, p.displayCount / oc * 100);
    }
    const radarComment = commentPct != null ? commentPct : 0;
    const cx = 60;
    const cy = 60;
    const R = 44;
    const vals = [thumb, idPct, nick, radarComment];
    const polyPts = vals.map((pct, i) => {
      const th = -Math.PI / 2 + i * Math.PI / 2;
      const rr = Math.max(0, Math.min(100, pct)) / 100 * R;
      const x = cx + rr * Math.cos(th);
      const y = cy + rr * Math.sin(th);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ");
    const ringPts = [0, 1, 2, 3].map((i) => {
      const th = -Math.PI / 2 + i * Math.PI / 2;
      const x = cx + R * Math.cos(th);
      const y = cy + R * Math.sin(th);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ");
    const midR = R * 0.5;
    const midPts = [0, 1, 2, 3].map((i) => {
      const th = -Math.PI / 2 + i * Math.PI / 2;
      const x = cx + midR * Math.cos(th);
      const y = cy + midR * Math.sin(th);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ");
    const axisLines = [0, 1, 2, 3].map((i) => {
      const th = -Math.PI / 2 + i * Math.PI / 2;
      const x2 = cx + R * Math.cos(th);
      const y2 = cy + R * Math.sin(th);
      return `<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(
        2
      )}" stroke="#94a3b8" stroke-width="0.45" opacity="0.4"/>`;
    }).join("");
    const fmt = (n) => `${n.toFixed(1)}%`;
    const commentBar = commentPct != null ? fmt(commentPct) : "\u2014";
    const wThumb = Math.max(0, thumb);
    const wId = Math.max(0, idPct);
    const wNick = Math.max(0, nick);
    const wComm = commentPct != null ? Math.max(0, commentPct) : 0;
    const wSum = wThumb + wId + wNick + wComm;
    let pieDiskBackground = "#94a3b8";
    if (wSum > 1e-3) {
      let a = 0;
      const segs = [];
      const pushSeg = (frac, color) => {
        const deg = frac / wSum * 360;
        const b = a + deg;
        segs.push(`${color} ${a}deg ${b}deg`);
        a = b;
      };
      pushSeg(wThumb, "#0f8fd8");
      pushSeg(wId, "#6366f1");
      pushSeg(wNick, "#ea580c");
      pushSeg(wComm, "#0d9488");
      pieDiskBackground = `conic-gradient(${segs.join(",")})`;
    }
    const footExtra = t <= 0 ? "\u8A18\u93320\u4EF6\u306E\u305F\u3081\u30B5\u30E0\u30CD\u30FBID\u30FB\u540D\u524D\u306F0%\u3002\u30ED\u30B0\u30A4\u30F3\u4E0D\u8981\u3067\u8868\u793A\u3057\u307E\u3059\u3002" : "";
    const footMain = commentPct != null ? "\u30B3\u30E1\u30F3\u30C8\uFF1D\u8A18\u9332\u306E\u8868\u793A\u4EF6\u6570\xF7\u516C\u5F0F\u30B3\u30E1\u30F3\u30C8\u6570\uFF08\u4E0A\u9650100%\uFF09\u3002" : "\u30B3\u30E1\u30F3\u30C8\u7387\u306F\u516C\u5F0F\u4EF6\u6570\u304C\u7121\u3044\u3068\u304D\u300C\u2014\u300D\uFF08\u30EC\u30FC\u30C0\u30FC\u30FB\u5186\u306E\u30B3\u30E1\u30F3\u30C8\u5206\u306F0\u6271\u3044\uFF09\u3002";
    const footThumb = t > 0 ? " \u30B5\u30E0\u30CD\uFF1D\u5FDC\u63F4\u30EC\u30FC\u30F3\u3068\u540C\u3058\u304F\u300C\u8868\u793A\u306B\u4F7F\u3048\u308B http(s) \u30A2\u30A4\u30B3\u30F3\u300D\u307E\u3067\u89E3\u6C7A\u3067\u304D\u305F\u5272\u5408\uFF08\u6570\u5B57ID\u306E\u65E2\u5B9ACDN\u5408\u6210\u3092\u542B\u3080\u3002\u533F\u540D\u5F62\u5F0F\u306F\u30DA\u30FC\u30B8\u5074\u306E\u8FFD\u52A0\u60C5\u5831\u304C\u7121\u3044\u3068\u4E0A\u304C\u308A\u306B\u304F\u3044\uFF09\u3002" : "";
    const foot = escapeHtml(
      footExtra ? `${footMain}${footThumb} ${footExtra}` : `${footMain}${footThumb}`
    );
    host.innerHTML = '<section class="nl-acquisition" aria-label="\u30C7\u30FC\u30BF\u53D6\u5F97\u7387"><h3 class="nl-acquisition__title">\u73FE\u5728\u306E\u30C7\u30FC\u30BF\u53D6\u5F97\u7387</h3><div class="nl-acquisition__charts"><div class="nl-acquisition__radar"><svg viewBox="0 0 120 120" aria-hidden="true">' + axisLines + `<polygon fill="none" stroke="#94a3b8" stroke-width="0.55" opacity="0.45" points="${ringPts}" /><polygon fill="none" stroke="#94a3b8" stroke-width="0.45" opacity="0.32" points="${midPts}" /><polygon fill="rgb(15 143 216 / 22%)" stroke="#0f8fd8" stroke-width="1.2" points="${polyPts}" /></svg><span class="nl-acquisition__cap">4\u9805\u76EE\u30D0\u30E9\u30F3\u30B9\uFF08\u30EC\u30FC\u30C0\u30FC\uFF09</span></div><div class="nl-acquisition__bars"><div class="nl-acquisition__bar-row"><p class="nl-acquisition__bar-label">\u30B5\u30E0\u30CD</p><div class="nl-acquisition__bar-track"><div class="nl-acquisition__bar-fill nl-acquisition__bar-fill--thumb" style="width:${Math.min(
      100,
      thumb
    )}%"></div></div><p class="nl-acquisition__bar-pct">${escapeHtml(
      fmt(thumb)
    )}</p></div><div class="nl-acquisition__bar-row"><p class="nl-acquisition__bar-label">ID</p><div class="nl-acquisition__bar-track"><div class="nl-acquisition__bar-fill nl-acquisition__bar-fill--id" style="width:${Math.min(
      100,
      idPct
    )}%"></div></div><p class="nl-acquisition__bar-pct">${escapeHtml(
      fmt(idPct)
    )}</p></div><div class="nl-acquisition__bar-row"><p class="nl-acquisition__bar-label">\u540D\u524D</p><div class="nl-acquisition__bar-track"><div class="nl-acquisition__bar-fill nl-acquisition__bar-fill--nick" style="width:${Math.min(
      100,
      nick
    )}%"></div></div><p class="nl-acquisition__bar-pct">${escapeHtml(
      fmt(nick)
    )}</p></div><div class="nl-acquisition__bar-row"><p class="nl-acquisition__bar-label">\u30B3\u30E1</p><div class="nl-acquisition__bar-track"><div class="nl-acquisition__bar-fill nl-acquisition__bar-fill--comment" style="width:${commentPct != null ? Math.min(100, commentPct) : 0}%"></div></div><p class="nl-acquisition__bar-pct">${escapeHtml(
      commentBar
    )}</p></div></div><div class="nl-acquisition__pie"><div class="nl-acquisition__pie-disk"></div><span class="nl-acquisition__cap">\u69CB\u6210\u6BD4\uFF08\u5186\uFF09</span></div></div><ul class="nl-acquisition__legend"><li><span class="nl-acquisition__dot nl-acquisition__dot--thumb" aria-hidden="true"></span>\u30A2\u30A4\u30B3\u30F3\uFF08\u8868\u793A\u89E3\u6C7A\u30FB\u5FDC\u63F4\u30EC\u30FC\u30F3\u3068\u540C\u3058\u57FA\u6E96\uFF09</li><li><span class="nl-acquisition__dot nl-acquisition__dot--id" aria-hidden="true"></span>\u30E6\u30FC\u30B6\u30FCID\uFF08\u53D6\u308C\u3066\u3044\u308B\u5272\u5408\uFF09</li><li><span class="nl-acquisition__dot nl-acquisition__dot--nick" aria-hidden="true"></span>\u8868\u793A\u540D\u30FB\u30CB\u30C3\u30AF\u30CD\u30FC\u30E0\uFF08\u4ED8\u3044\u3066\u3044\u308B\u5272\u5408\uFF09</li><li><span class="nl-acquisition__dot nl-acquisition__dot--comment" aria-hidden="true"></span>\u30B3\u30E1\u30F3\u30C8\uFF08\u8A18\u9332\xF7\u516C\u5F0F\uFF09</li></ul><p class="nl-acquisition__footnote">${foot}</p></section>`;
    const disk = host.querySelector(".nl-acquisition__pie-disk");
    if (disk instanceof HTMLElement) {
      disk.style.background = pieDiskBackground;
    }
    const win = typeof globalThis !== "undefined" ? globalThis : window;
    appendTrendPoint(win, liveId, {
      thumb,
      idPct,
      nick,
      commentPct,
      displayCount: p.displayCount,
      storageCount: p.storageCount
    });
    void persistTrendPointChrome(liveId, {
      thumb,
      idPct,
      nick,
      commentPct,
      displayCount: p.displayCount,
      storageCount: p.storageCount
    });
  }
  function renderDevMonitorSecondaryViz(p, opts = {}) {
    const vizHost = $("devMonitorViz");
    if (!vizHost) return;
    const liveId = String(p.liveId || "").trim();
    if (!liveId) {
      vizHost.innerHTML = '<div class="nl-dev-monitor-viz"><p class="nl-viz-block__empty">\u30CB\u30B3\u751F\u306E\u8996\u8074\u30DA\u30FC\u30B8\uFF08watch\uFF09\u3092\u958B\u304F\u3068\u3001\u4EF6\u6570\u306E\u6BD4\u8F03\u3084\u63A8\u79FB\u306E\u30B0\u30E9\u30D5\u304C\u8868\u793A\u3055\u308C\u307E\u3059\u3002</p></div>';
      return;
    }
    const win = typeof globalThis !== "undefined" ? globalThis : window;
    const trend = opts.mergedTrend != null ? opts.mergedTrend : readTrendSeries(win, liveId);
    const persisted = Boolean(opts.mergedTrend);
    const snap = p.snapshot;
    const oc = snap && typeof snap.officialCommentCount === "number" && Number.isFinite(snap.officialCommentCount) ? snap.officialCommentCount : null;
    const parts = [];
    parts.push(
      htmlOfficialVsRecordedBar(
        officialVsRecordedBarState({
          displayCount: p.displayCount,
          officialCount: oc
        })
      )
    );
    if (snap && typeof snap.officialCaptureRatio === "number" && Number.isFinite(snap.officialCaptureRatio)) {
      parts.push(htmlCaptureRatioBar(snap.officialCaptureRatio));
    }
    const gaps = p.profileGaps;
    if (gaps && p.storageCount > 0) {
      parts.push(htmlProfileGapBars(profileGapBarSeries(gaps)));
    }
    const dbg = snap?._debug && typeof snap._debug === "object" ? (
      /** @type {Record<string, unknown>} */
      snap._debug
    ) : null;
    if (dbg && dbg.commentTypeVisibleSample != null && typeof dbg.commentTypeVisibleSample === "object") {
      parts.push(
        htmlCommentTypeBars(
          commentTypeDistribution(
            /** @type {Record<string, unknown>} */
            dbg.commentTypeVisibleSample
          )
        )
      );
    }
    if (dbg && typeof dbg.wsAge === "number") {
      parts.push(htmlWsStalenessBar(wsStalenessState(dbg.wsAge)));
    }
    if (trend.length >= 1) {
      const series = trendToSparklineArrays(trend);
      parts.push(htmlAcquisitionSparklines(series, { persisted }));
      if (trendHasCountSamples(trend)) {
        parts.push(htmlDualCountSparklines(series.displaySeries, series.storageSeries));
      }
    }
    vizHost.innerHTML = `<div class="nl-dev-monitor-viz">${parts.filter(Boolean).join("")}</div>`;
  }
  function renderDevMonitorPanel(p) {
    lastDevMonitorPanelParams = p;
    const mktBtn = (
      /** @type {HTMLButtonElement|null} */
      $("devMonitorExportMarketingBtn")
    );
    if (mktBtn) mktBtn.disabled = !String(p.liveId || "").trim();
    const statsEl = $("devMonitorStats");
    const jsonEl = $("devMonitorJson");
    const dlChartsEl = $("devMonitorDlCharts");
    renderAcquisitionDashboard(p);
    renderDevMonitorSecondaryViz(p);
    if (dlChartsEl) {
      dlChartsEl.innerHTML = buildDevMonitorDlChartsHtml(p);
    }
    if (!statsEl || !jsonEl) return;
    const win = typeof globalThis !== "undefined" ? globalThis : window;
    const lid = String(p.liveId || "").trim();
    if (lid) {
      void readMergedTrendSeries(win, lid).then((merged) => {
        renderDevMonitorSecondaryViz(p, { mergedTrend: merged });
      });
    }
    const snap = p.snapshot;
    const oc = snap && typeof snap.officialCommentCount === "number" && Number.isFinite(snap.officialCommentCount) ? snap.officialCommentCount : null;
    const gap = oc != null && p.liveId ? oc - p.displayCount : null;
    const rows = [];
    rows.push(["\u914D\u4FE1ID\uFF08lv\u2026\uFF09", p.liveId || "\u2014"]);
    rows.push(["\u3053\u306EPC\u306B\u4FDD\u5B58\u3057\u305F\u4EF6\u6570", String(p.storageCount)]);
    rows.push(["\u4E00\u89A7\u306B\u51FA\u3057\u3066\u3044\u308B\u4EF6\u6570", String(p.displayCount)]);
    rows.push(["\u516C\u5F0F\u306E\u7D2F\u8A08\u30B3\u30E1\u30F3\u30C8\u6570", oc != null ? String(oc) : "\u2014"]);
    {
      const DEV_OFFICIAL_COMMENT_STALE_MS = 12e4;
      const ocsu = snap && typeof snap.officialCommentStatsUpdatedAt === "number" && Number.isFinite(snap.officialCommentStatsUpdatedAt) && snap.officialCommentStatsUpdatedAt > 0 ? snap.officialCommentStatsUpdatedAt : null;
      const ocf = snap && typeof snap.officialCommentStatsFreshnessMs === "number" && Number.isFinite(snap.officialCommentStatsFreshnessMs) ? snap.officialCommentStatsFreshnessMs : null;
      if (ocsu != null) {
        rows.push([
          "\u516C\u5F0F\u30B3\u30E1\u30F3\u30C8\u6570\u30FB\u6700\u7D42\u66F4\u65B0\uFF08\u30ED\u30FC\u30AB\u30EB\u6642\u523B\uFF09",
          new Date(ocsu).toLocaleString("ja-JP", { hour12: false })
        ]);
      }
      if (ocf != null && ocsu != null) {
        const sec = Math.max(0, Math.round(ocf / 1e3));
        const stale = ocf > DEV_OFFICIAL_COMMENT_STALE_MS;
        rows.push([
          "\u516C\u5F0F\u30B3\u30E1\u30F3\u30C8\u6570\u30FB\u66F4\u65B0\u304B\u3089\u306E\u7D4C\u904E",
          stale ? `${sec} \u79D2\u524D\uFF08\u3084\u3084\u53E4\u3044\u53EF\u80FD\u6027: \u30BF\u30D6\u3092\u524D\u9762\u306B\u30FB\u901A\u4FE1\u78BA\u8A8D\u30FB\u5FC5\u8981\u306A\u3089\u518D\u8AAD\u8FBC\uFF09` : `${sec} \u79D2\u524D`
        ]);
      } else if (oc != null && ocsu == null) {
        rows.push([
          "\u516C\u5F0F\u30B3\u30E1\u30F3\u30C8\u6570\u30FB\u6700\u7D42\u66F4\u65B0",
          "\u672A\u53D6\u5F97\uFF08statistics \u306E comments \u304C\u307E\u3060\u6765\u3066\u3044\u307E\u305B\u3093\uFF09"
        ]);
      }
    }
    rows.push(["\u516C\u5F0F\u3068\u306E\u5DEE\uFF08\u516C\u5F0F\u2212\u4E00\u89A7\uFF09", gap != null ? String(gap) : "\u2014"]);
    rows.push([
      "\u5DEE\u304C\u51FA\u308B\u4E3B\u306A\u7406\u7531\uFF08\u53C2\u8003\uFF09",
      "\u753B\u9762\u306B\u8F09\u3063\u3066\u3044\u306A\u3044\u30B3\u30E1\u30F3\u30C8\u306F\u53D6\u308A\u8FBC\u3081\u307E\u305B\u3093\u3002\u7A2E\u985E\u306E\u6271\u3044\u306E\u9055\u3044\u30FB\u901A\u4FE1\u306E\u5207\u308C\u30FB\u30B5\u30A4\u30C8\u306E\u4F5C\u308A\u5909\u308F\u308A\u306A\u3069\u304C\u91CD\u306A\u308A\u5F97\u307E\u3059\uFF08\u4E0B\u306E\u300C\u7A2E\u985E\u306E\u5185\u8A33\u300D\u3082\u53C2\u7167\uFF09\u3002"
    ]);
    rows.push([
      "\u516C\u5F0F\u3068\u300C\u8A18\u9332\u300D\u306E\u3061\u304C\u3044",
      "\u516C\u5F0F\u306F\u653E\u9001\u306E\u7D2F\u8A08\u3067\u3059\u3002\u8A18\u9332\u306F\u3001\u3053\u306EPC\u306E\u62E1\u5F35\u304C\u5B9F\u969B\u306B\u53D6\u308C\u305F\u884C\u3060\u3051\u3067\u3059\uFF08\u30BF\u30A4\u30E0\u30B7\u30D5\u30C8\u30FB\u5225\u30BF\u30D6\u30FB\u9AD8\u6D41\u91CF\u30FB\u4ED5\u69D8\u5909\u66F4\u3067\u5DEE\u304C\u51FA\u307E\u3059\uFF09\u3002"
    ]);
    const avs = p.avatarStats;
    if (avs && avs.total > 0) {
      rows.push(["\u30A2\u30A4\u30B3\u30F3URL\u304C\u6B8B\u3063\u3066\u3044\u308B\u4EF6\u6570", String(avs.withHttpAvatar)]);
      rows.push(["\u30A2\u30A4\u30B3\u30F3URL\u304C\u7121\u3044\u4EF6\u6570", String(avs.withoutHttpAvatar)]);
      rows.push([
        "\u30A2\u30A4\u30B3\u30F3URL\u304C\u3042\u308B\u5272\u5408",
        `${(avs.withHttpAvatar / avs.total * 100).toFixed(1)}%`
      ]);
      if (typeof avs.withResolvedAvatar === "number" && Number.isFinite(avs.withResolvedAvatar)) {
        rows.push([
          "\u30A2\u30A4\u30B3\u30F3\u304C\u8868\u793A\u89E3\u6C7A\u3067\u304D\u305F\u4EF6\u6570\uFF08\u5FDC\u63F4\u30EC\u30FC\u30F3\u57FA\u6E96\uFF09",
          String(avs.withResolvedAvatar)
        ]);
        rows.push([
          "\u8868\u793A\u89E3\u6C7A\u304C\u3042\u308B\u5272\u5408",
          `${(avs.withResolvedAvatar / avs.total * 100).toFixed(1)}%`
        ]);
      }
      rows.push(["\u65E2\u5B9A\u30A2\u30A4\u30B3\u30F3\u76F8\u5F53\u306E\u307F\u306E\u4EF6\u6570", String(avs.syntheticDefaultAvatar)]);
      rows.push(["\u8868\u793A\u540D\uFF08\u30CB\u30C3\u30AF\u30CD\u30FC\u30E0\uFF09\u304C\u3042\u308B\u4EF6\u6570", String(avs.withNickname)]);
      rows.push(["\u8868\u793A\u540D\u304C\u7121\u3044\u4EF6\u6570", String(avs.withoutNickname)]);
      rows.push(["\u30E6\u30FC\u30B6\u30FCID\u304C\u6570\u5B57\u306E\u4EF6\u6570", String(avs.numericUserId)]);
      rows.push(["\u30E6\u30FC\u30B6\u30FCID\u304C\u533F\u540D\u98A8\u306A\u3069\u306E\u4EF6\u6570", String(avs.nonNumericUserId)]);
      rows.push(["\u30E6\u30FC\u30B6\u30FCID\u304C\u53D6\u308C\u3066\u3044\u306A\u3044\u4EF6\u6570", String(avs.missingUserId)]);
    }
    const gaps = p.profileGaps;
    if (gaps && p.storageCount > 0) {
      rows.push(["\u2500\u2500 \u5229\u7528\u8005\u306E\u7A2E\u985E\u5225\uFF08ID\u304C\u3042\u308B\u884C\u3060\u3051\uFF09", "\u2500\u2500"]);
      rows.push(["\u6570\u5B57ID\u30FB\u30A2\u30A4\u30B3\u30F3\u3042\u308A", String(gaps.numericUidWithHttpAvatar)]);
      rows.push(["\u6570\u5B57ID\u30FB\u30A2\u30A4\u30B3\u30F3\u306A\u3057", String(gaps.numericUidWithoutHttpAvatar)]);
      rows.push(["\u533F\u540D\u98A8ID\u30FB\u30A2\u30A4\u30B3\u30F3\u3042\u308A", String(gaps.anonStyleUidWithHttpAvatar)]);
      rows.push(["\u533F\u540D\u98A8ID\u30FB\u30A2\u30A4\u30B3\u30F3\u306A\u3057", String(gaps.anonStyleUidWithoutHttpAvatar)]);
      rows.push(["\u6570\u5B57ID\u30FB\u540D\u524D\u3042\u308A", String(gaps.numericWithNickname)]);
      rows.push(["\u6570\u5B57ID\u30FB\u540D\u524D\u306A\u3057", String(gaps.numericWithoutNickname)]);
      rows.push(["\u533F\u540D\u98A8\u30FB\u540D\u524D\u3042\u308A", String(gaps.anonWithNickname)]);
      rows.push(["\u533F\u540D\u98A8\u30FB\u540D\u524D\u306A\u3057", String(gaps.anonWithoutNickname)]);
    }
    if (snap?._debug && typeof snap._debug === "object") {
      const d = (
        /** @type {Record<string, unknown>} */
        snap._debug
      );
      if (typeof d.wsAge === "number")
        rows.push(["\u914D\u4FE1\u30DA\u30FC\u30B8\u306E\u66F4\u65B0\u304B\u3089\u306E\u7D4C\u904E\uFF08ms\u30FB\u53C2\u8003\uFF09", String(d.wsAge)]);
      if (d.intercept != null)
        rows.push(["\u8996\u8074\u30DA\u30FC\u30B8\u5185\u306E\u5229\u7528\u8005\u30E1\u30E2\uFF08\u4EF6\u6570\uFF09", String(d.intercept)]);
      if (d.ndgr != null && String(d.ndgr).trim())
        rows.push(["\u914D\u4FE1\u30C7\u30FC\u30BF\u306E\u5185\u90E8\u72B6\u614B\uFF08\u8A18\u53F7\u30FB\u958B\u767A\u5411\u3051\uFF09", String(d.ndgr)]);
      if (d.ndgrLdStream != null && String(d.ndgrLdStream).trim()) {
        rows.push(["\u914D\u4FE1\u30C7\u30FC\u30BF\u306E\u53D7\u4FE1\u72B6\u6CC1\uFF08\u8A18\u53F7\u30FB\u958B\u767A\u5411\u3051\uFF09", String(d.ndgrLdStream)]);
      }
      if (d.commentTypeVisibleSample != null && typeof d.commentTypeVisibleSample === "object" && Object.keys(d.commentTypeVisibleSample).length) {
        rows.push([
          "\u3044\u307E\u753B\u9762\u306B\u51FA\u3066\u3044\u308B\u30B3\u30E1\u30F3\u30C8\u306E\u7A2E\u985E\uFF08\u5185\u90E8\u30AD\u30FC\uFF09",
          JSON.stringify(d.commentTypeVisibleSample)
        ]);
      }
      if (d.piPost != null) {
        rows.push(["\u30DA\u30FC\u30B8\u304C\u53D7\u3051\u53D6\u3063\u305F\u53D6\u308A\u8FBC\u307F\u6307\u793A\uFF08\u4EF6\u6570\uFF09", String(d.piPost)]);
      }
      if (d.piEnq != null) {
        rows.push(["\u30DA\u30FC\u30B8\u304C\u51E6\u7406\u5F85\u3061\u306B\u3057\u305F\u4EF6\u6570", String(d.piEnq)]);
      }
    }
    {
      const st = STORY_AVATAR_DIAG_STATE;
      if (p.liveId && (st.interceptMapOnPage >= 0 || st.interceptExportCode || st.interceptExportRows > 0)) {
        rows.push(["\u2500\u2500 \u76F4\u8FD1\u306E\u53D6\u308A\u8FBC\u307F\uFF08\u30DD\u30C3\u30D7\u30A2\u30C3\u30D7\u304B\u3089\uFF09", "\u2500\u2500"]);
        rows.push([
          "watch\u30BF\u30D6\u5185\u306E\u4E00\u6642\u5BFE\u5FDC\u8868\uFF08\u4EF6\u6570\uFF09",
          st.interceptMapOnPage >= 0 ? String(st.interceptMapOnPage) : "\u2014"
        ]);
        rows.push(["\u53D6\u308A\u8FBC\u3093\u3060\u884C\u6570", String(st.interceptExportRows)]);
        rows.push(["\u7D50\u679C\u30B3\u30FC\u30C9", st.interceptExportCode || "\u2014"]);
        if (String(st.interceptExportDetail || "").trim()) {
          rows.push(["\u88DC\u8DB3\u30E1\u30C3\u30BB\u30FC\u30B8", String(st.interceptExportDetail).trim()]);
        }
      }
    }
    statsEl.innerHTML = rows.map(
      ([dt, dd]) => `<div class="nl-dev-monitor__row"><dt>${escapeHtml(dt)}</dt><dd>${escapeHtml(dd)}</dd></div>`
    ).join("");
    if (!p.liveId) {
      jsonEl.textContent = "watch \u3092\u958B\u3044\u3066\u3044\u308B\u3068\u304D\u306B\u30B9\u30CA\u30C3\u30D7\u30B7\u30E7\u30C3\u30C8\u304C\u5165\u308A\u307E\u3059\u3002\u672C\u6587\u306F\u51FA\u3057\u307E\u305B\u3093\u3002";
      return;
    }
    const debugSub = pickDevMonitorDebugSubset(
      snap?._debug && typeof snap._debug === "object" ? (
        /** @type {Record<string, unknown>} */
        snap._debug
      ) : void 0
    );
    const outJson = { ...debugSub };
    if (snap && typeof snap === "object") {
      if (snap.officialCommentStatsUpdatedAt != null) {
        outJson.officialCommentStatsUpdatedAt = snap.officialCommentStatsUpdatedAt;
      }
      if (snap.officialCommentStatsFreshnessMs != null) {
        outJson.officialCommentStatsFreshnessMs = snap.officialCommentStatsFreshnessMs;
      }
    }
    if (avs && avs.total > 0) {
      outJson.avatarStats = avs;
    }
    if (gaps && p.storageCount > 0) {
      outJson.profileGaps = gaps;
    }
    jsonEl.textContent = JSON.stringify(outJson, null, 2);
  }
  function applyCalmPanelMotionClass(enabled) {
    document.documentElement.classList.toggle("nl-calm-motion", Boolean(enabled));
  }
  async function refresh() {
    if (!hasExtensionContext()) {
      renderExtensionContextBanner(true);
      return;
    }
    renderExtensionContextBanner(false);
    const liveEl = $("liveId");
    const toggle = (
      /** @type {HTMLInputElement} */
      $("recordToggle")
    );
    const exportBtn = (
      /** @type {HTMLButtonElement} */
      $("exportJson")
    );
    const captureBtn = (
      /** @type {HTMLButtonElement|null} */
      $("captureScreenshot")
    );
    const thumbCountEl = $("thumbCount");
    const commentInput = (
      /** @type {HTMLTextAreaElement} */
      $("commentInput")
    );
    const postBtn = (
      /** @type {HTMLButtonElement} */
      $("postCommentBtn")
    );
    try {
      let paintWatchPopupUi = function() {
        syncInterceptMapDiagFromSnapshot(watchSnapshot);
        STORY_AVATAR_DIAG_STATE.total = arr.length;
        STORY_AVATAR_DIAG_STATE.withUid = countEntriesWithUserId(arr);
        STORY_AVATAR_DIAG_STATE.withAvatar = countEntriesWithAvatar(arr);
        STORY_AVATAR_DIAG_STATE.uniqueAvatar = countUniqueAvatarEntries(arr);
        {
          const resolvedAvatar = countResolvedAvatarEntries(arr, lv);
          STORY_AVATAR_DIAG_STATE.resolvedAvatar = resolvedAvatar.total;
          STORY_AVATAR_DIAG_STATE.resolvedUniqueAvatar = resolvedAvatar.unique;
        }
        STORY_AVATAR_DIAG_STATE.selfShown = countOwnPostedEntries(arr, lv);
        STORY_AVATAR_DIAG_STATE.selfSaved = countSavedOwnPostedEntries(arr);
        STORY_AVATAR_DIAG_STATE.selfPending = countPendingSelfPostedRecentsForLive(lv);
        STORY_AVATAR_DIAG_STATE.selfPendingMatched = getOwnPostedMatchedIdSet(arr, lv).size;
        const displayEntries = buildDisplayCommentEntries(arr, lv);
        STORY_AVATAR_DIAG_STATE.selfShown = countOwnPostedEntries(displayEntries, lv);
        setCountDisplay(String(displayEntries.length), watchSnapshot);
        renderCommentTicker(
          /** @type {PopupCommentEntry[]} */
          displayEntries
        );
        exportBtn.disabled = false;
        exportBtn.dataset.liveId = lv;
        exportBtn.dataset.storageKey = key;
        exportBtn.dataset.watchUrl = url;
        if (captureBtn) {
          captureBtn.disabled = false;
          captureBtn.dataset.watchUrl = url;
        }
        if (postBtn) postBtn.disabled = COMMENT_POST_UI_STATE.submitting;
        setReloadWatchTabUiDisabled(false);
        syncVoiceCommentButton();
        if (commentInput) {
          commentInput.placeholder = "\u30B3\u30E1\u30F3\u30C8\u3092\u5165\u529B\u3057\u3066\u9001\u4FE1";
        }
        syncStorySourceEntries(lv, displayEntries);
        renderUserRooms(arr, lv);
        renderCharacterScene({
          hasWatch: true,
          recording: toggle.checked,
          commentCount: displayEntries.length,
          liveId: lv,
          snapshot: watchSnapshot
        });
        renderWatchMetaCard(watchSnapshot, arr);
        const growthEl = (
          /** @type {HTMLElement|null} */
          $("sceneStoryGrowth")
        );
        if (growthEl) patchStoryGrowthIconsFromSource(growthEl);
        {
          const baseAv = summarizeStoredCommentAvatarStats(arr);
          const resolvedTotal = countResolvedAvatarEntries(arr, lv).total;
          renderDevMonitorPanel({
            snapshot: watchSnapshot,
            liveId: lv,
            displayCount: displayEntries.length,
            storageCount: arr.length,
            avatarStats: { ...baseAv, withResolvedAvatar: resolvedTotal },
            profileGaps: summarizeStoredCommentProfileGaps(arr)
          });
        }
        updateCommentVelocityLine(
          /** @type {PopupCommentEntry[]} */
          displayEntries
        );
      };
      document.documentElement.removeAttribute("data-nl-popup-content-painted");
      const [tabs, openBag] = await Promise.all([
        chrome.tabs.query({ active: true, currentWindow: true }),
        chrome.storage.local.get([
          KEY_SELF_POSTED_RECENTS,
          KEY_LAST_WATCH_URL,
          KEY_RECORDING,
          KEY_DEEP_HARVEST_QUIET_UI,
          KEY_INLINE_PANEL_WIDTH_MODE,
          KEY_INLINE_PANEL_PLACEMENT,
          KEY_CALM_PANEL_MOTION,
          KEY_STORAGE_WRITE_ERROR,
          KEY_COMMENT_PANEL_STATUS
        ])
      ]);
      applySelfPostedRecentsFromBag(openBag);
      const calmOn = normalizeCalmPanelMotion(openBag[KEY_CALM_PANEL_MOTION], {
        inlineDefault: INLINE_MODE
      });
      applyCalmPanelMotionClass(calmOn);
      const calmMotionElHydrate = (
        /** @type {HTMLInputElement|null} */
        $("calmPanelMotion")
      );
      if (calmMotionElHydrate) calmMotionElHydrate.checked = calmOn;
      const { url, fromActiveTab } = resolveWatchUrlFromTabAndStash(
        tabs[0],
        openBag[KEY_LAST_WATCH_URL]
      );
      const resolvedLv = extractLiveIdFromUrl(url);
      const viewerLvForError = isNicoLiveWatchUrl(url) && resolvedLv ? resolvedLv : "";
      applyStorageErrorBannerFromBag(openBag, viewerLvForError);
      applyCommentHarvestBannerFromBag(openBag, viewerLvForError);
      toggle.checked = isRecordingEnabled(openBag[KEY_RECORDING]);
      toggle.disabled = false;
      const deepHarvestQuietEl = (
        /** @type {HTMLInputElement|null} */
        $("deepHarvestQuietUiToggle")
      );
      if (deepHarvestQuietEl) {
        deepHarvestQuietEl.checked = isDeepHarvestQuietUiEnabled(
          openBag[KEY_DEEP_HARVEST_QUIET_UI]
        );
        deepHarvestQuietEl.disabled = false;
      }
      const panelMode = normalizeInlinePanelWidthMode(
        openBag[KEY_INLINE_PANEL_WIDTH_MODE]
      );
      const radioPlayerRow = (
        /** @type {HTMLInputElement|null} */
        $("inlinePanelWidthPlayerRow")
      );
      const radioVideoOnly = (
        /** @type {HTMLInputElement|null} */
        $("inlinePanelWidthVideo")
      );
      if (radioPlayerRow && radioVideoOnly) {
        radioPlayerRow.checked = panelMode === INLINE_PANEL_WIDTH_PLAYER_ROW;
        radioVideoOnly.checked = panelMode === INLINE_PANEL_WIDTH_VIDEO;
      }
      const placementMode = normalizeInlinePanelPlacement(
        openBag[KEY_INLINE_PANEL_PLACEMENT]
      );
      const radioPlacementBelow = (
        /** @type {HTMLInputElement|null} */
        $("inlinePanelPlacementBelow")
      );
      const radioPlacementBeside = (
        /** @type {HTMLInputElement|null} */
        $("inlinePanelPlacementBeside")
      );
      const radioPlacementFloating = (
        /** @type {HTMLInputElement|null} */
        $("inlinePanelPlacementFloating")
      );
      if (radioPlacementBelow) {
        radioPlacementBelow.checked = placementMode === INLINE_PANEL_PLACEMENT_BELOW;
      }
      if (radioPlacementBeside) {
        radioPlacementBeside.checked = placementMode === INLINE_PANEL_PLACEMENT_BESIDE;
      }
      if (radioPlacementFloating) {
        radioPlacementFloating.checked = placementMode === INLINE_PANEL_PLACEMENT_FLOATING;
      }
      syncVoiceCommentButton();
      if (!isNicoLiveWatchUrl(url)) {
        if (liveEl) liveEl.textContent = "\uFF08\u30CB\u30B3\u751Fwatch\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044\uFF09";
        setCountDisplay("-");
        renderCommentTicker([]);
        exportBtn.disabled = true;
        exportBtn.dataset.watchUrl = "";
        if (captureBtn) {
          captureBtn.disabled = true;
          captureBtn.dataset.watchUrl = "";
        }
        if (thumbCountEl) thumbCountEl.textContent = "-";
        watchMetaCache.key = "";
        watchMetaCache.snapshot = null;
        clearWatchMetaCard();
        popupUserCommentProfileMap = null;
        syncStorySourceEntries("", []);
        resetStoryAvatarDiagState();
        renderCharacterScene({
          hasWatch: false,
          recording: toggle.checked,
          commentCount: 0,
          liveId: "",
          snapshot: null
        });
        if (postBtn) postBtn.disabled = true;
        setReloadWatchTabUiDisabled(true);
        syncVoiceCommentButton();
        if (commentInput) {
          commentInput.placeholder = "watch\u30DA\u30FC\u30B8\u3092\u958B\u304F\u3068\u30B3\u30E1\u30F3\u30C8\u9001\u4FE1\u3067\u304D\u307E\u3059";
        }
        renderUserRooms([], "");
        renderDevMonitorPanel({
          snapshot: null,
          liveId: "",
          displayCount: 0,
          storageCount: 0,
          avatarStats: null,
          profileGaps: null
        });
        hideCommentVelocityLine();
        void renderSessionSummaryComparePanel("");
        void renderGiftQuickStatsPanel("");
        markPopupRefreshContentPainted();
        return;
      }
      const lv = extractLiveIdFromUrl(url);
      if (liveEl) {
        liveEl.textContent = lv && !fromActiveTab ? `${lv}\uFF08\u76F4\u8FD1\u306E\u8996\u8074\u30DA\u30FC\u30B8\uFF09` : lv || "-";
      }
      if (!lv) {
        setCountDisplay("-");
        renderCommentTicker([]);
        exportBtn.disabled = true;
        exportBtn.dataset.watchUrl = "";
        if (captureBtn) {
          captureBtn.disabled = true;
          captureBtn.dataset.watchUrl = "";
        }
        if (thumbCountEl) thumbCountEl.textContent = "-";
        watchMetaCache.key = "";
        watchMetaCache.snapshot = null;
        clearWatchMetaCard();
        popupUserCommentProfileMap = null;
        syncStorySourceEntries("", []);
        resetStoryAvatarDiagState();
        renderCharacterScene({
          hasWatch: true,
          recording: toggle.checked,
          commentCount: 0,
          liveId: "",
          snapshot: null
        });
        if (postBtn) postBtn.disabled = true;
        setReloadWatchTabUiDisabled(true);
        syncVoiceCommentButton();
        if (commentInput) {
          commentInput.placeholder = "\u30B3\u30E1\u30F3\u30C8\u3092\u5165\u529B\u3057\u3066\u9001\u4FE1";
        }
        renderUserRooms([], "");
        renderDevMonitorPanel({
          snapshot: null,
          liveId: "",
          displayCount: 0,
          storageCount: 0,
          avatarStats: null,
          profileGaps: null
        });
        hideCommentVelocityLine();
        void renderSessionSummaryComparePanel("");
        void renderGiftQuickStatsPanel("");
        markPopupRefreshContentPainted();
        return;
      }
      const snapshotKey = `${lv}|${url}|s17`;
      const key = commentsStorageKey(lv);
      const snapshotCacheHit = watchMetaCache.key === snapshotKey && watchMetaCache.snapshot != null;
      let watchSnapshot = snapshotCacheHit ? watchMetaCache.snapshot : null;
      if (!snapshotCacheHit) {
        watchMetaCache.key = snapshotKey;
        watchMetaCache.snapshot = null;
      }
      const data = await readStorageBagWithRetry(
        () => chrome.storage.local.get([key, KEY_USER_COMMENT_PROFILE_CACHE]),
        { attempts: 4, delaysMs: [0, 50, 120, 280] }
      );
      let arr = Array.isArray(data[key]) ? data[key] : [];
      popupUserCommentProfileMap = normalizeUserCommentProfileMap(
        data[KEY_USER_COMMENT_PROFILE_CACHE]
      );
      const normalizedStored = normalizeStoredCommentEntries(
        /** @type {PopupCommentEntry[]} */
        arr
      );
      if (normalizedStored.changed) {
        arr = normalizedStored.next;
      }
      const profAfterNormalize = popupMergeUserCommentProfileCache(arr);
      arr = profAfterNormalize.arr;
      if (normalizedStored.changed || profAfterNormalize.commentsPatched || profAfterNormalize.cacheTouched) {
        const save = {};
        if (normalizedStored.changed || profAfterNormalize.commentsPatched) {
          save[key] = arr;
        }
        if (profAfterNormalize.cacheTouched) {
          save[KEY_USER_COMMENT_PROFILE_CACHE] = popupUserCommentProfileMap;
        }
        if (Object.keys(save).length) {
          await storageSetSafe(save);
        }
      }
      STORY_AVATAR_DIAG_STATE.total = arr.length;
      STORY_AVATAR_DIAG_STATE.withUid = countEntriesWithUserId(arr);
      STORY_AVATAR_DIAG_STATE.withAvatar = countEntriesWithAvatar(arr);
      STORY_AVATAR_DIAG_STATE.uniqueAvatar = countUniqueAvatarEntries(arr);
      {
        const resolvedAvatar = countResolvedAvatarEntries(arr, lv);
        STORY_AVATAR_DIAG_STATE.resolvedAvatar = resolvedAvatar.total;
        STORY_AVATAR_DIAG_STATE.resolvedUniqueAvatar = resolvedAvatar.unique;
      }
      STORY_AVATAR_DIAG_STATE.selfShown = countOwnPostedEntries(arr, lv);
      STORY_AVATAR_DIAG_STATE.selfSaved = countSavedOwnPostedEntries(arr);
      STORY_AVATAR_DIAG_STATE.selfPending = countPendingSelfPostedRecentsForLive(lv);
      STORY_AVATAR_DIAG_STATE.selfPendingMatched = getOwnPostedMatchedIdSet(arr, lv).size;
      STORY_AVATAR_DIAG_STATE.interceptItems = 0;
      STORY_AVATAR_DIAG_STATE.interceptWithUid = 0;
      STORY_AVATAR_DIAG_STATE.interceptWithAvatar = 0;
      STORY_AVATAR_DIAG_STATE.mergedPatched = 0;
      STORY_AVATAR_DIAG_STATE.mergedUidReplaced = 0;
      STORY_AVATAR_DIAG_STATE.stripped = 0;
      STORY_AVATAR_DIAG_STATE.interceptExportRows = 0;
      STORY_AVATAR_DIAG_STATE.interceptExportCode = "";
      STORY_AVATAR_DIAG_STATE.interceptExportDetail = "";
      syncInterceptMapDiagFromSnapshot(watchSnapshot);
      const strippedViewerAvatar = stripViewerAvatarContamination(
        arr,
        lv,
        watchSnapshot
      );
      if (strippedViewerAvatar.patched > 0) {
        arr = strippedViewerAvatar.next;
        const profAfterStrip = popupMergeUserCommentProfileCache(arr);
        arr = profAfterStrip.arr;
        const saveStrip = { [key]: arr };
        if (profAfterStrip.cacheTouched) {
          saveStrip[KEY_USER_COMMENT_PROFILE_CACHE] = popupUserCommentProfileMap;
        }
        await storageSetSafe(saveStrip);
      }
      STORY_AVATAR_DIAG_STATE.stripped = strippedViewerAvatar.patched;
      if (INTERCEPT_BACKFILL_STATE.liveId !== lv) {
        INTERCEPT_BACKFILL_STATE.liveId = lv;
        INTERCEPT_BACKFILL_STATE.deepTried = false;
      }
      const missingIdCount = arr.reduce(
        (sum, e) => String(e?.userId || "").trim() ? sum : sum + 1,
        0
      );
      const shouldDeep = !INTERCEPT_BACKFILL_STATE.deepTried && arr.length >= 30 && missingIdCount >= Math.ceil(arr.length * 0.4);
      if (!snapshotCacheHit) {
        paintWatchPopupUi();
        markPopupRefreshContentPainted();
        const snapResult = await requestWatchPageSnapshotFromOpenTab(url);
        watchMetaCache.snapshot = snapResult.snapshot;
        watchSnapshot = watchMetaCache.snapshot;
        const strippedAfterSnap = stripViewerAvatarContamination(
          arr,
          lv,
          watchSnapshot
        );
        if (strippedAfterSnap.patched > 0) {
          arr = strippedAfterSnap.next;
          await storageSetSafe({ [key]: arr });
        }
        STORY_AVATAR_DIAG_STATE.stripped += strippedAfterSnap.patched;
      }
      const refreshGen = ++watchPopupRefreshGeneration;
      if (thumbCountEl) thumbCountEl.textContent = "\u2026";
      paintWatchPopupUi();
      markPopupRefreshContentPainted();
      scheduleDeferredUserCommentProfileHydrate({
        refreshGen,
        commentsKey: key,
        getArr: () => arr,
        setArr: (next) => {
          arr = next;
        },
        paint: () => paintWatchPopupUi()
      });
      void maybeFlushBroadcastSessionSummarySample({
        liveId: lv,
        watchUrl: url,
        comments: arr,
        snapshot: watchSnapshot,
        recording: toggle.checked
      });
      void renderSessionSummaryComparePanel(lv);
      void renderGiftQuickStatsPanel(lv);
      void (async () => {
        try {
          if (refreshGen !== watchPopupRefreshGeneration) return;
          const interceptResult = await requestInterceptCacheFromOpenTab(url, {
            deep: shouldDeep
          });
          const interceptItems = interceptResult.items;
          const interceptDiag = interceptResult.diag;
          if (refreshGen !== watchPopupRefreshGeneration) return;
          if (shouldDeep) {
            INTERCEPT_BACKFILL_STATE.deepTried = true;
          }
          STORY_AVATAR_DIAG_STATE.interceptExportRows = interceptItems.length;
          STORY_AVATAR_DIAG_STATE.interceptExportCode = interceptDiag.code;
          STORY_AVATAR_DIAG_STATE.interceptExportDetail = interceptDiag.detail || "";
          syncInterceptMapDiagFromSnapshot(watchSnapshot);
          if (interceptItems.length > 0) {
            STORY_AVATAR_DIAG_STATE.interceptItems = interceptItems.length;
            STORY_AVATAR_DIAG_STATE.interceptWithUid = interceptItems.reduce(
              (sum, it) => it.uid ? sum + 1 : sum,
              0
            );
            STORY_AVATAR_DIAG_STATE.interceptWithAvatar = interceptItems.reduce(
              (sum, it) => it.av ? sum + 1 : sum,
              0
            );
            const suspectUidSet = new Set(
              [
                String(watchSnapshot?.viewerUserId || "").trim(),
                String(watchSnapshot?.broadcasterUserId || "").trim()
              ].filter(Boolean)
            );
            const merged = mergeCommentsWithInterceptCache(arr, interceptItems, {
              preferInterceptUidSet: suspectUidSet
            });
            STORY_AVATAR_DIAG_STATE.mergedPatched = merged.patched;
            STORY_AVATAR_DIAG_STATE.mergedUidReplaced = merged.uidReplaced;
            if (merged.patched > 0) {
              arr = merged.next;
            }
            let interceptCacheTouched = false;
            for (const it of interceptItems) {
              if (upsertUserCommentProfileFromIntercept(popupUserCommentProfileMap, it)) {
                interceptCacheTouched = true;
              }
            }
            const profAfterIntercept = popupMergeUserCommentProfileCache(arr);
            arr = profAfterIntercept.arr;
            if (merged.patched > 0 || profAfterIntercept.commentsPatched || profAfterIntercept.cacheTouched || interceptCacheTouched) {
              const saveIc = {};
              if (merged.patched > 0 || profAfterIntercept.commentsPatched) {
                saveIc[key] = arr;
              }
              if (profAfterIntercept.cacheTouched || interceptCacheTouched) {
                saveIc[KEY_USER_COMMENT_PROFILE_CACHE] = popupUserCommentProfileMap;
              }
              if (Object.keys(saveIc).length) {
                await storageSetSafe(saveIc);
              }
            }
          } else {
            STORY_AVATAR_DIAG_STATE.interceptItems = 0;
            STORY_AVATAR_DIAG_STATE.interceptWithUid = 0;
            STORY_AVATAR_DIAG_STATE.interceptWithAvatar = 0;
          }
          const reconciledOwnPosted = reconcileStoredOwnPostedEntries(arr, lv);
          if (reconciledOwnPosted.changed || reconciledOwnPosted.pendingChanged) {
            arr = reconciledOwnPosted.next;
            selfPostedRecentsCache = reconciledOwnPosted.remaining;
            await storageSetSafe({
              [key]: arr,
              [KEY_SELF_POSTED_RECENTS]: { items: selfPostedRecentsCache }
            });
          }
          if (refreshGen !== watchPopupRefreshGeneration) return;
          const stats = (
            /** @type {{ ok?: boolean, count?: number }|null} */
            await sendMessageToWatchTabs(url, { type: "NLS_THUMB_STATS" })
          );
          if (refreshGen !== watchPopupRefreshGeneration) return;
          if (thumbCountEl) {
            thumbCountEl.textContent = stats && stats.ok === true && typeof stats.count === "number" ? String(stats.count) : "0";
          }
          paintWatchPopupUi();
        } catch (e) {
          if (isExtensionContextInvalidatedError(e)) {
            renderExtensionContextBanner(true);
            return;
          }
          if (thumbCountEl && refreshGen === watchPopupRefreshGeneration) {
            thumbCountEl.textContent = "0";
          }
        }
      })();
    } catch (e) {
      if (isExtensionContextInvalidatedError(e)) {
        renderExtensionContextBanner(true);
        return;
      }
      throw e;
    }
  }
  function formatDateTime(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "-";
    try {
      return new Date(n).toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    } catch {
      return "-";
    }
  }
  function prioritizeWatchTabCandidates(candidates, watchUrl) {
    const w = String(watchUrl || "").trim();
    if (!w) return candidates;
    try {
      const ref = new URL(w);
      const refKey = `${ref.pathname.replace(/\/$/, "")}${ref.search}`;
      return [...candidates].sort((a, b) => {
        const rank = (url) => {
          try {
            const u = new URL(url);
            const k = `${u.pathname.replace(/\/$/, "")}${u.search}`;
            return k === refKey ? 0 : 1;
          } catch {
            return 2;
          }
        };
        return rank(a.url) - rank(b.url);
      });
    } catch {
      return candidates;
    }
  }
  async function collectWatchTabCandidates(watchUrl) {
    const out = [];
    const w = String(watchUrl || "").trim();
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tryAdd = (tab) => {
      if (!tab?.id || typeof tab.url !== "string") return;
      if (!isNicoLiveWatchUrl(tab.url)) return;
      if (w && !watchPageUrlsMatchForSnapshot(tab.url, w)) return;
      if (out.some((x) => x.id === tab.id)) return;
      out.push({ id: tab.id, url: tab.url });
    };
    tryAdd(activeTab);
    if (w) {
      try {
        const allTabs = await chrome.tabs.query({});
        for (const tab of allTabs) tryAdd(tab);
      } catch {
      }
    }
    return prioritizeWatchTabCandidates(out, w);
  }
  async function reloadWatchTabForUrl(watchUrl) {
    const w = String(watchUrl || "").trim();
    if (!w || !isNicoLiveWatchUrl(w)) {
      return { ok: false, error: "watch\u30DA\u30FC\u30B8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002" };
    }
    const candidates = await collectWatchTabCandidates(w);
    for (const c of candidates) {
      try {
        await chrome.tabs.reload(c.id);
        return { ok: true };
      } catch {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: c.id },
            func: () => {
              globalThis.location.reload();
            }
          });
          return { ok: true };
        } catch {
        }
      }
    }
    return {
      ok: false,
      error: "watch\u30BF\u30D6\u306E\u518D\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u30BF\u30D6\u3092\u624B\u52D5\u3067\u66F4\u65B0\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
    };
  }
  function setReloadWatchTabUiDisabled(disabled) {
    const v = Boolean(disabled);
    const main = (
      /** @type {HTMLButtonElement|null} */
      $("reloadWatchTabBtn")
    );
    const panel = (
      /** @type {HTMLButtonElement|null} */
      $("reloadWatchTabPanelBtn")
    );
    if (main) main.disabled = v;
    if (panel) panel.disabled = v;
  }
  var _reloadWatchTabFromPopupInFlight = false;
  async function triggerReloadWatchTabFromPopup() {
    const exportBtnEl = (
      /** @type {HTMLButtonElement|null} */
      $("exportJson")
    );
    const watchUrl = exportBtnEl?.dataset.watchUrl || "";
    if (!watchUrl || _reloadWatchTabFromPopupInFlight) return;
    _reloadWatchTabFromPopupInFlight = true;
    setReloadWatchTabUiDisabled(true);
    setPostStatus("watch\u30DA\u30FC\u30B8\u3092\u518D\u8AAD\u307F\u8FBC\u307F\u3057\u3066\u3044\u307E\u3059\u2026", "idle");
    try {
      const r = await reloadWatchTabForUrl(watchUrl);
      if (r.ok) {
        setPostStatus(
          "\u518D\u8AAD\u307F\u8FBC\u307F\u3092\u5B9F\u884C\u3057\u307E\u3057\u305F\u3002\u6570\u79D2\u5F8C\u306B\u30DD\u30C3\u30D7\u30A2\u30C3\u30D7\u3092\u958B\u304D\u76F4\u3059\u3068\u53CD\u6620\u3055\u308C\u307E\u3059\u3002",
          "success"
        );
      } else {
        setPostStatus(
          withCommentSendTroubleshootHint(r.error || "\u518D\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002"),
          "error"
        );
      }
    } catch {
      setPostStatus(
        withCommentSendTroubleshootHint("\u518D\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002"),
        "error"
      );
    } finally {
      _reloadWatchTabFromPopupInFlight = false;
      setReloadWatchTabUiDisabled(false);
    }
  }
  async function listWatchFramesWithInnerText(tabId) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: () => {
          const href = String(location.href || "");
          const panel = !!(document.querySelector(".ga-ns-comment-panel") || document.querySelector(".comment-panel") || document.querySelector('[class*="comment-data-grid"]'));
          const hasVideo = !!document.querySelector("video");
          const inner = document.body?.innerText || "";
          const len = inner.length;
          const text = inner.slice(0, 12e4);
          const score = (panel ? 8e6 : 0) + (hasVideo ? 4e5 : 0) + Math.min(len, 5e6) + (/\/watch\/lv\d+/i.test(href) ? 5e4 : 0) + (href.includes("nicovideo.jp") && href.includes("watch") ? 25e3 : 0);
          return { score, text, href };
        }
      });
      const out = [];
      for (const row of results || []) {
        const res = row?.result;
        if (!res || typeof res.score !== "number") continue;
        const fid = typeof row.frameId === "number" ? row.frameId : 0;
        out.push({
          frameId: fid,
          score: res.score,
          text: String(res.text || "")
        });
      }
      out.sort((a, b) => b.score - a.score);
      return out;
    } catch {
      return [];
    }
  }
  function probeViewerCountFromFrameTexts(frames) {
    for (const f of frames) {
      const n = parseViewerCountFromLooseText(f.text);
      if (n != null) return n;
    }
    return null;
  }
  function mergeViewerProbeIntoSnapshot(snap, probe) {
    if (!snap || probe == null) return snap;
    const cur = snap.viewerCountFromDom;
    if (typeof cur === "number" && Number.isFinite(cur) && cur >= 0) return snap;
    return { ...snap, viewerCountFromDom: probe };
  }
  async function tabsSendMessageWithRetry(tabId, message, retryOpts = {}) {
    const max = retryOpts.maxAttempts ?? 8;
    const delayMs = retryOpts.delayMs ?? 75;
    const frameId = retryOpts.frameId !== void 0 ? retryOpts.frameId : 0;
    const opts = { frameId };
    let lastErr = null;
    for (let i = 0; i < max; i++) {
      try {
        return await chrome.tabs.sendMessage(tabId, message, opts);
      } catch (e) {
        lastErr = e;
        if (i < max - 1) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }
    throw lastErr;
  }
  async function requestWatchPageSnapshotFromOpenTab(watchUrl) {
    const candidates = await collectWatchTabCandidates(watchUrl);
    if (!candidates.length) {
      return {
        snapshot: null,
        error: "watch\u30BF\u30D6\u304C\u898B\u3064\u304B\u3089\u306A\u3044\u305F\u3081\u3001head\u60C5\u5831\u306F\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002"
      };
    }
    for (const candidate of candidates) {
      try {
        const ranked = await listWatchFramesWithInnerText(candidate.id);
        const viewerProbe = probeViewerCountFromFrameTexts(ranked);
        const tried = /* @__PURE__ */ new Set();
        const tryOrder = [
          ...ranked.map((r) => r.frameId),
          0
        ];
        for (const fid of tryOrder) {
          if (tried.has(fid)) continue;
          tried.add(fid);
          try {
            const res = await tabsSendMessageWithRetry(
              candidate.id,
              { type: "NLS_EXPORT_WATCH_SNAPSHOT" },
              { frameId: fid, maxAttempts: 5, delayMs: 90 }
            );
            if (res?.ok && res.snapshot) {
              const merged = mergeViewerProbeIntoSnapshot(
                /** @type {WatchPageSnapshot} */
                res.snapshot,
                viewerProbe
              );
              return { snapshot: merged, error: "" };
            }
          } catch {
          }
        }
      } catch {
      }
    }
    return {
      snapshot: null,
      error: "watch\u30DA\u30FC\u30B8\u304B\u3089\u306E\u60C5\u5831\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u653E\u9001\u30BF\u30D6\u3092\u958B\u3044\u305F\u72B6\u614B\u3067\u30DD\u30C3\u30D7\u30A2\u30C3\u30D7\u3092\u518D\u5EA6\u958B\u3044\u3066\u304F\u3060\u3055\u3044\u3002"
    };
  }
  async function requestPostCommentToOpenTab(text, watchUrl) {
    const trimmed = String(text || "").trim();
    if (!trimmed) {
      return { ok: false, error: "\u30B3\u30E1\u30F3\u30C8\u304C\u7A7A\u3067\u3059\u3002" };
    }
    const candidates = await collectWatchTabCandidates(watchUrl);
    if (!candidates.length) {
      return {
        ok: false,
        error: "watch\u30BF\u30D6\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002\u653E\u9001\u30BF\u30D6\u3092\u958B\u3044\u3066\u304B\u3089\u9001\u4FE1\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
      };
    }
    let lastDetail = "";
    for (const candidate of candidates) {
      try {
        const ranked = await listWatchFramesWithInnerText(candidate.id);
        const tried = /* @__PURE__ */ new Set();
        const tryOrder = [...ranked.map((r) => r.frameId), 0];
        for (const fid of tryOrder) {
          if (tried.has(fid)) continue;
          tried.add(fid);
          try {
            const res = await tabsSendMessageWithRetry(
              candidate.id,
              {
                type: "NLS_POST_COMMENT",
                text: trimmed
              },
              { frameId: fid, maxAttempts: 5, delayMs: 120 }
            );
            if (res?.ok) {
              return { ok: true, error: "" };
            }
            if (res && typeof res === "object" && "error" in res && res.error) {
              lastDetail = String(res.error);
            }
          } catch (e) {
            const msg = e && typeof e === "object" && "message" in e ? String(
              /** @type {{ message?: unknown }} */
              e.message || ""
            ) : String(e || "");
            if (msg) lastDetail = msg;
          }
        }
      } catch (e) {
        const msg = e && typeof e === "object" && "message" in e ? String(
          /** @type {{ message?: unknown }} */
          e.message || ""
        ) : String(e || "");
        if (msg) lastDetail = msg;
      }
    }
    return {
      ok: false,
      error: lastDetail ? `\u30B3\u30E1\u30F3\u30C8\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\uFF08${lastDetail}\uFF09` : "\u30B3\u30E1\u30F3\u30C8\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u653E\u9001\u30BF\u30D6\u3092\u518D\u8AAD\u307F\u8FBC\u307F\u3057\u3066\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
    };
  }
  function isFriendlyHtmlReportMetaKey(key) {
    const k = String(key || "").toLowerCase().trim();
    if (k === "description" || k === "keywords" || k === "og:title" || k === "og:description" || k === "og:image" || k === "og:url" || k === "og:site_name" || k === "og:type" || k === "twitter:title" || k === "twitter:description" || k.startsWith("twitter:image")) {
      return true;
    }
    return false;
  }
  function friendlyHtmlReportMetaLabel(key) {
    const k = String(key || "").toLowerCase().trim();
    const labels = {
      description: "\u30DA\u30FC\u30B8\u8AAC\u660E\uFF08meta\uFF09",
      keywords: "\u30AD\u30FC\u30EF\u30FC\u30C9\uFF08meta\uFF09",
      "og:title": "\u30B7\u30A7\u30A2\u7528\u30BF\u30A4\u30C8\u30EB\uFF08Open Graph\uFF09",
      "og:description": "\u30B7\u30A7\u30A2\u7528\u8AAC\u660E\uFF08Open Graph\uFF09",
      "og:image": "\u30B7\u30A7\u30A2\u7528\u753B\u50CFURL\uFF08Open Graph\uFF09",
      "og:url": "\u6B63\u898FURL\uFF08Open Graph\uFF09",
      "og:site_name": "\u30B5\u30A4\u30C8\u540D\uFF08Open Graph\uFF09",
      "og:type": "\u7A2E\u985E\uFF08Open Graph\uFF09",
      "twitter:title": "\u30B7\u30A7\u30A2\u7528\u30BF\u30A4\u30C8\u30EB\uFF08X\uFF09",
      "twitter:description": "\u30B7\u30A7\u30A2\u7528\u8AAC\u660E\uFF08X\uFF09"
    };
    if (k.startsWith("twitter:image")) return "\u30B7\u30A7\u30A2\u7528\u753B\u50CF\uFF08X\uFF09";
    return labels[k] || key;
  }
  function partitionMetasForHtmlReport(metas) {
    const all = Array.isArray(metas) ? metas : [];
    const friendly = [];
    const technical = [];
    for (const v of all) {
      if (!v || !String(v.key || "").trim()) continue;
      if (isFriendlyHtmlReportMetaKey(v.key)) friendly.push(v);
      else technical.push(v);
    }
    return { friendly, technical };
  }
  var YUKKURI_REPORT_IMAGES = {
    rink: "images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png",
    konta: "images/yukkuri-charactore-english/konta/kitsune-yukkuri-half-eyes-mouth-closed.png",
    tanu: "images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-half-eyes-mouth-closed.png"
  };
  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  async function fetchExtensionPngAsDataUrl(relativePath) {
    try {
      if (!chrome?.runtime?.getURL) return "";
      const url = chrome.runtime.getURL(relativePath);
      const res = await fetch(url);
      if (!res.ok) return "";
      const buf = await res.arrayBuffer();
      return `data:image/png;base64,${arrayBufferToBase64(buf)}`;
    } catch {
      return "";
    }
  }
  function yukkuriReportAvatarHtml(dataUrl, fallbackClass, fallbackChar) {
    if (dataUrl) {
      return `<img class="yukkuri-avatar-img" src="${escapeAttr(dataUrl)}" alt="" width="72" height="72" decoding="async" />`;
    }
    return `<div class="yukkuri-avatar ${fallbackClass}" aria-hidden="true">${escapeHtml(fallbackChar)}</div>`;
  }
  async function buildHtmlReportDocument(comments, snapshot, snapshotError, liveId, watchUrl) {
    const exportedAtIso = (/* @__PURE__ */ new Date()).toISOString();
    const exportedAtJst = formatDateTime(Date.now());
    const safeLiveId = escapeHtml(liveId);
    const safeWatchUrl = escapeHtml(watchUrl || snapshot?.url || "-");
    const safeTitle = escapeHtml(snapshot?.title || "-");
    const safeBroadcastTitle = escapeHtml(
      snapshot?.broadcastTitle || snapshot?.title || "-"
    );
    const safeBroadcasterName = escapeHtml(snapshot?.broadcasterName || "-");
    const safeStartAtText = escapeHtml(snapshot?.startAtText || "-");
    const safeThumbnailUrl = escapeAttr(snapshot?.thumbnailUrl || "");
    const safeSnapshotError = snapshotError ? escapeHtml(snapshotError) : "";
    const tags = Array.isArray(snapshot?.tags) ? snapshot.tags.filter((v) => String(v || "").trim()) : [];
    const [dataRink, dataKonta, dataTanu] = await Promise.all([
      fetchExtensionPngAsDataUrl(YUKKURI_REPORT_IMAGES.rink),
      fetchExtensionPngAsDataUrl(YUKKURI_REPORT_IMAGES.konta),
      fetchExtensionPngAsDataUrl(YUKKURI_REPORT_IMAGES.tanu)
    ]);
    const avatarRink = yukkuriReportAvatarHtml(dataRink, "yukkuri-avatar--rink", "\u308A");
    const avatarKonta = yukkuriReportAvatarHtml(dataKonta, "yukkuri-avatar--konta", "\u3053");
    const avatarTanu = yukkuriReportAvatarHtml(dataTanu, "yukkuri-avatar--tanu", "\u305F");
    const yukkuriAvatars = {
      avatarRinkHtml: avatarRink,
      avatarKontaHtml: avatarKonta,
      avatarTanuHtml: avatarTanu
    };
    const htmlReportConceptGuideCardHtml = buildHtmlReportConceptGuideCardHtml(yukkuriAvatars);
    const htmlReportSaveGuideCardHtml = buildHtmlReportSaveGuideCardHtml(yukkuriAvatars);
    const roomRows = aggregateCommentsByUser(comments).map((room) => {
      const label = displayUserLabel(room.userKey, room.nickname);
      const search = escapeAttr(
        `${label} ${room.nickname || ""} ${room.userKey} ${room.lastText || ""} ${room.count}`.toLowerCase()
      );
      return `
      <tr class="search-item" data-search="${search}">
        <td>${escapeHtml(label)}</td>
        <td>${room.count}</td>
        <td>${escapeHtml(room.lastText || "")}</td>
      </tr>
    `;
    });
    const commentRows = comments.map((c, idx) => {
      const commentNo = String(c.commentNo || "").trim();
      const text = String(c.text || "").trim();
      const userId = c.userId ? String(c.userId) : "";
      const userLabel = displayUserLabel(userId || UNKNOWN_USER_KEY);
      const search = escapeAttr(
        `${commentNo} ${text} ${userId} ${userLabel} ${c.liveId || ""}`.toLowerCase()
      );
      return `
      <tr class="search-item" data-search="${search}">
        <td>${idx + 1}</td>
        <td>${escapeHtml(commentNo || "-")}</td>
        <td>${escapeHtml(userLabel)}</td>
        <td>${escapeHtml(text || "-")}</td>
        <td>${escapeHtml(formatDateTime(c.capturedAt || 0))}</td>
      </tr>
    `;
    });
    const linkRows = (links) => links.map((v) => {
      const search = escapeAttr(
        `${v.rel} ${v.href} ${v.as} ${v.type}`.toLowerCase()
      );
      return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(v.rel)}</td>
          <td>${escapeHtml(v.href || "-")}</td>
          <td>${escapeHtml(v.as || "-")}</td>
          <td>${escapeHtml(v.type || "-")}</td>
        </tr>
      `;
    });
    const metaRows = (metas) => metas.map((v) => {
      const search = escapeAttr(`${v.key} ${v.value}`.toLowerCase());
      return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(v.key)}</td>
          <td>${escapeHtml(v.value || "-")}</td>
        </tr>
      `;
    });
    const scriptRows = (scripts) => scripts.map((v) => {
      const search = escapeAttr(`${v.src} ${v.type}`.toLowerCase());
      return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(v.type || "text/javascript")}</td>
          <td>${escapeHtml(v.src || "-")}</td>
        </tr>
      `;
    });
    const noopenerRows = (links) => links.map((v) => {
      const search = escapeAttr(`${v.text} ${v.href}`.toLowerCase());
      return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(v.text || "-")}</td>
          <td>${escapeHtml(v.href || "-")}</td>
        </tr>
      `;
    });
    const headLinkRows = snapshot ? linkRows(snapshot.links) : [];
    const { friendly: friendlyMetas, technical: technicalMetas } = partitionMetasForHtmlReport(snapshot?.metas);
    const friendlyMetaRowsHtml = friendlyMetas.map((v) => {
      const label = friendlyHtmlReportMetaLabel(v.key);
      const search = escapeAttr(`${v.key} ${v.value} ${label}`.toLowerCase());
      return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(label)}</td>
          <td class="mono">${escapeHtml(v.value || "-")}</td>
        </tr>`;
    });
    const headTechnicalMetaRows = metaRows(technicalMetas);
    const headScriptRows = snapshot ? scriptRows(snapshot.scripts) : [];
    const headNoopenerRows = snapshot ? noopenerRows(snapshot.noopenerLinks) : [];
    return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>\u541B\u6597\u308A\u3093\u304F\u306E\u8FFD\u61B6\u306E\u304D\u3089\u3081\u304D \u30EC\u30DD\u30FC\u30C8 ${safeLiveId}</title>
    <style>
      :root {
        --bg: #0b1220;
        --panel: #111b2e;
        --panel-border: #1f2a44;
        --text: #e2e8f0;
        --muted: #93a4be;
        --accent: #38bdf8;
        --chip: #1d4ed8;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", "Noto Sans JP", sans-serif;
        color: var(--text);
        background: linear-gradient(160deg, #0b1220, #0f172a 45%, #111827);
      }
      .wrap { max-width: 1200px; margin: 0 auto; padding: 20px 16px 32px; }
      .hero {
        background: linear-gradient(130deg, #0369a1, #0e7490);
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 14px;
        padding: 14px 16px;
        margin-bottom: 14px;
      }
      .hero h1 { margin: 0; font-size: 1.15rem; }
      .hero p { margin: 6px 0 0; font-size: 0.86rem; opacity: 0.96; }
      .search-box {
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 12px;
        padding: 12px;
        margin-bottom: 14px;
      }
      .search-box input {
        width: 100%;
        border-radius: 10px;
        border: 1px solid #334155;
        background: #0f172a;
        color: var(--text);
        padding: 10px 12px;
        font-size: 14px;
      }
      .search-box .hint { margin-top: 7px; color: var(--muted); font-size: 12px; }
      .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
      section.card {
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 12px;
        padding: 12px;
      }
      section.card h2 {
        margin: 0 0 10px;
        font-size: 0.95rem;
        color: #f8fafc;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      th, td {
        border-bottom: 1px solid #24324f;
        text-align: left;
        vertical-align: top;
        padding: 7px 6px;
      }
      th { color: #bfdbfe; font-weight: 700; font-size: 11px; }
      td { color: var(--text); }
      .pill {
        display: inline-block;
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 11px;
        background: var(--chip);
        color: #fff;
      }
      .mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        word-break: break-all;
      }
      .thumb-wrap {
        width: 100%;
        max-width: 320px;
        border-radius: 10px;
        border: 1px solid #2f3f61;
        overflow: hidden;
        background: #0b1220;
      }
      .thumb-wrap img {
        display: block;
        width: 100%;
        height: auto;
      }
      .tag-list {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .tag-chip {
        display: inline-flex;
        align-items: center;
        padding: 4px 8px;
        border-radius: 999px;
        background: #1e3a8a;
        color: #dbeafe;
        font-size: 11px;
        line-height: 1.2;
      }
      .warn {
        margin-top: 10px;
        border-radius: 10px;
        border: 1px solid #7f1d1d;
        background: #450a0a;
        color: #fecaca;
        padding: 10px;
        font-size: 12px;
      }
      .footer-note {
        margin-top: 16px;
        color: var(--muted);
        font-size: 11px;
      }
      .guide-lead {
        margin: 0 0 12px;
        color: var(--muted);
        font-size: 0.88rem;
        line-height: 1.45;
      }
      .yukkuri-guide-card .guide-lead {
        color: #cbd5e1;
        font-size: clamp(0.85rem, 2.2vw, 0.93rem);
        line-height: 1.62;
        max-width: 52rem;
      }
      .yukkuri-guide-card h2 { margin-bottom: 6px; }
      .yukkuri-guide {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .yukkuri-row {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: 12px;
      }
      /* \u53F3\u5BC4\u305B\u30A2\u30D0\u30BF\u30FC\u306F\u672C\u6587\u5217\u304C\u6975\u7AEF\u306B\u72ED\u304F\u306A\u308A\u65E5\u672C\u8A9E\u304C\u5D29\u308C\u308B\u305F\u3081\u3001\u5E38\u306B\u5DE6\u30A2\u30D0\u30BF\u30FC\uFF0B\u53F3\u672C\u6587 */
      .yukkuri-row--reverse {
        flex-direction: row;
      }
      .yukkuri-avatar {
        width: clamp(48px, 12vw, 56px);
        height: clamp(48px, 12vw, 56px);
        border-radius: 50%;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 900;
        font-size: clamp(1rem, 3.5vw, 1.2rem);
        color: #0f172a;
        border: 2px solid rgba(255, 255, 255, 0.28);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
      }
      .yukkuri-avatar--rink {
        background: linear-gradient(145deg, #fecdd3, #fda4af);
      }
      .yukkuri-avatar--konta {
        background: linear-gradient(145deg, #bbf7d0, #4ade80);
      }
      .yukkuri-avatar--tanu {
        background: linear-gradient(145deg, #fde68a, #fbbf24);
      }
      .yukkuri-avatar-img {
        width: clamp(52px, 14vw, 72px);
        height: auto;
        max-height: 72px;
        object-fit: contain;
        flex-shrink: 0;
        border-radius: 10px;
        filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.4));
      }
      .speech-bubble {
        flex: 1 1 min(100%, 280px);
        min-width: 0;
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 14px;
        padding: 10px 14px;
        font-size: clamp(0.82rem, 2.4vw, 0.9rem);
        line-height: 1.5;
      }
      /* \u30AD\u30E3\u30E9\u540D\u306F\u76F4\u4E0B\u306E strong \u306E\u307F\u30D6\u30ED\u30C3\u30AF\uFF08\u672C\u6587\u5185\u306E strong \u306F\u30A4\u30F3\u30E9\u30A4\u30F3\u306E\u307E\u307E\uFF09 */
      .speech-bubble > strong {
        display: block;
        margin-bottom: 6px;
        color: #e0f2fe;
        font-size: clamp(0.78rem, 2.2vw, 0.85rem);
      }
      .speech-bubble p strong {
        display: inline;
        color: #f0f9ff;
        font-weight: 700;
      }
      .speech-bubble p {
        margin: 0;
        color: var(--text);
        word-break: normal;
        overflow-wrap: break-word;
        line-height: 1.65;
      }
      .speech-bubble p + p {
        margin-top: 10px;
      }
      details.concept-read-more {
        margin-top: 10px;
        background: #0f172a;
        border: 1px solid #475569;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 1px 0 rgb(148 163 184 / 12%);
      }
      details.concept-read-more:first-of-type {
        margin-top: 12px;
      }
      .concept-read-more__summary {
        cursor: pointer;
        list-style: none;
        padding: clamp(11px, 2.5vw, 14px) clamp(12px, 3.5vw, 18px);
        font-weight: 700;
        color: #f8fafc;
        background: #1e293b;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 12px;
        font-size: clamp(0.84rem, 2.5vw, 0.95rem);
        line-height: 1.4;
      }
      .concept-read-more__summary::-webkit-details-marker {
        display: none;
      }
      .concept-read-more__summary::before {
        content: '';
        width: 0.45em;
        height: 0.45em;
        border-right: 2.5px solid #38bdf8;
        border-bottom: 2.5px solid #38bdf8;
        transform: rotate(-45deg);
        flex-shrink: 0;
        margin-top: 0.05em;
        transition: transform 0.15s ease;
      }
      details.concept-read-more[open] .concept-read-more__summary::before {
        transform: rotate(45deg);
        margin-top: 0.15em;
      }
      .concept-read-more__summary:focus-visible {
        outline: 2px solid #7dd3fc;
        outline-offset: 2px;
      }
      .concept-read-more__tag {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        background: #0284c7;
        color: #ffffff;
        font-size: clamp(0.7rem, 2vw, 0.78rem);
        font-weight: 800;
        letter-spacing: 0.02em;
        border: 1px solid rgb(125 211 252 / 35%);
      }
      .concept-read-more__title {
        flex: 1 1 min(100%, 14rem);
        min-width: 0;
        color: #f1f5f9;
      }
      .concept-read-more__body {
        padding: clamp(14px, 3.2vw, 22px) clamp(12px, 4vw, 26px) clamp(16px, 3.5vw, 24px);
        border-top: 1px solid #475569;
        max-width: 52rem;
        margin: 0 auto;
        box-sizing: border-box;
      }
      .concept-read-more__prose {
        margin: 0 0 clamp(10px, 2vw, 14px);
        color: #e2e8f0;
        font-size: clamp(0.84rem, 2.4vw, 0.92rem);
        line-height: 1.72;
      }
      .concept-read-more__prose strong {
        color: #f8fafc;
        font-weight: 700;
      }
      .concept-read-more__prose a,
      .concept-read-more__body a {
        color: #7dd3fc;
        font-weight: 600;
        text-decoration: underline;
        text-decoration-thickness: 1.5px;
        text-underline-offset: 3px;
      }
      .concept-read-more__prose a:hover,
      .concept-read-more__body a:hover {
        color: #bae6fd;
      }
      .concept-read-more__prose a:focus-visible,
      .concept-read-more__body a:focus-visible {
        outline: 2px solid #7dd3fc;
        outline-offset: 2px;
        border-radius: 2px;
      }
      .concept-read-more__body .speech-bubble p {
        line-height: 1.75;
      }
      /* \u30A2\u30B3\u30FC\u30C7\u30A3\u30AA\u30F3\u5185: \u6298\u308A\u8FD4\u3057\u30671\u6587\u5B57\u884C\u30FB\u8AAD\u70B9\u982D\u306A\u3069\u3092\u9632\u3050\uFF08reverse \u3067\u72ED\u3044\u5217\u306B\u306A\u3089\u306A\u3044\uFF09 */
      .concept-read-more__body .yukkuri-row {
        flex-wrap: nowrap;
        width: 100%;
        align-items: flex-start;
      }
      .concept-read-more__body .speech-bubble {
        flex: 1 1 0;
        min-width: 0;
        max-width: 100%;
        padding: 12px 16px;
      }
      .concept-read-more__body .yukkuri-avatar,
      .concept-read-more__body .yukkuri-avatar-img {
        flex-shrink: 0;
      }
      .concept-read-more__prose:last-child {
        margin-bottom: 0;
      }
      @media (max-width: 420px) {
        .concept-read-more__summary {
          flex-direction: column;
          align-items: flex-start;
        }
        .concept-read-more__summary::before {
          align-self: flex-start;
          margin-top: 4px;
        }
      }
      details.tech-dump {
        margin-top: 12px;
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 12px;
        overflow: hidden;
      }
      details.tech-dump > summary {
        cursor: pointer;
        list-style: none;
        padding: 12px 14px;
        font-weight: 700;
        color: #bae6fd;
        background: rgba(15, 23, 42, 0.72);
      }
      details.tech-dump > summary::-webkit-details-marker {
        display: none;
      }
      .tech-dump-inner {
        padding: 12px 14px 16px;
        border-top: 1px solid var(--panel-border);
      }
      .tech-dump-hint {
        margin: 0 0 12px;
        color: var(--muted);
        font-size: 0.82rem;
        line-height: 1.45;
      }
      .tech-dump-inner h3 {
        margin: 16px 0 8px;
        font-size: 0.82rem;
        color: #94a3b8;
        font-weight: 700;
      }
      .tech-dump-inner h3:first-of-type {
        margin-top: 0;
      }
      .hide { display: none !important; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header class="hero">
        <h1>\u541B\u6597\u308A\u3093\u304F\u306E\u8FFD\u61B6\u306E\u304D\u3089\u3081\u304D HTML\u30EC\u30DD\u30FC\u30C8 <span class="pill">${safeLiveId}</span></h1>
        <p>\u51FA\u529B\u65E5\u6642: ${escapeHtml(exportedAtJst)} / ISO: ${escapeHtml(exportedAtIso)}</p>
        <p class="mono">watch URL: ${safeWatchUrl}</p>
      </header>

      <div class="search-box">
        <input id="q" type="search" placeholder="\u30BF\u30A4\u30C8\u30EB\u30FB\u914D\u4FE1\u8005\u30FB\u30BF\u30B0\u30FB\u30E1\u30BF\u30FBscript\u30FB\u30B3\u30E1\u30F3\u30C8\u3092\u6A2A\u65AD\u691C\u7D22\uFF08\u4F8B: \u73C8\u7432 / \u307E\u3081\u3002\uFF12 / \u30B3\u30FC\u30D2\u30FC / og:title\uFF09">
        <div id="searchResult" class="hint">\u691C\u7D22\u5BFE\u8C61: <span id="totalCount">0</span> \u4EF6</div>
      </div>

      <div class="grid">
        <section class="card">
          <h2>\u6982\u8981</h2>
          <table>
            <tbody>
              <tr class="search-item" data-search="${escapeAttr(liveId.toLowerCase())}"><th>liveId</th><td class="mono">${safeLiveId}</td></tr>
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.broadcastTitle || "").toLowerCase())}"><th>\u653E\u9001\u30BF\u30A4\u30C8\u30EB</th><td>${safeBroadcastTitle}</td></tr>
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.broadcasterName || "").toLowerCase())}"><th>\u914D\u4FE1\u8005\u540D</th><td>${safeBroadcasterName}</td></tr>
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.startAtText || "").toLowerCase())}"><th>\u958B\u59CB\u6642\u523B</th><td>${safeStartAtText}</td></tr>
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.url || watchUrl || "").toLowerCase())}"><th>URL</th><td class="mono">${safeWatchUrl}</td></tr>
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.title || "").toLowerCase())}"><th>Title\u30BF\u30B0</th><td>${safeTitle}</td></tr>
              <tr><th>\u4FDD\u5B58\u30B3\u30E1\u30F3\u30C8\u6570</th><td>${comments.length}</td></tr>
              <tr><th>\u30E6\u30FC\u30B6\u30FC\u5225\u4EF6\u6570</th><td>${aggregateCommentsByUser(comments).length}</td></tr>
            </tbody>
          </table>
          <h2 style="margin-top:12px;">\u30B5\u30E0\u30CD\u30A4\u30EB</h2>
          ${safeThumbnailUrl ? `<div class="thumb-wrap search-item" data-search="${safeThumbnailUrl.toLowerCase()}"><img src="${safeThumbnailUrl}" alt="\u653E\u9001\u30B5\u30E0\u30CD\u30A4\u30EB"></div>` : '<div class="mono">\u53D6\u5F97\u306A\u3057</div>'}
          <h2 style="margin-top:12px;">\u30BF\u30B0</h2>
          ${tags.length ? `<div class="tag-list">${tags.map(
      (tag) => `<span class="tag-chip search-item" data-search="${escapeAttr(
        tag.toLowerCase()
      )}">${escapeHtml(tag)}</span>`
    ).join("")}</div>` : '<div class="mono">\u53D6\u5F97\u306A\u3057</div>'}
          ${safeSnapshotError ? `<div class="warn">${safeSnapshotError}</div>` : ""}
        </section>

        <section class="card">
          <h2>\u30E6\u30FC\u30B6\u30FC\u5225\uFF08\u3057\u304A\u308A\u96C6\u8A08\uFF09</h2>
          <table>
            <thead><tr><th>\u30E6\u30FC\u30B6\u30FC</th><th>\u4EF6\u6570</th><th>\u6700\u65B0\u30B3\u30E1\u30F3\u30C8</th></tr></thead>
            <tbody>${roomRows.join("") || '<tr><td colspan="3">\u30C7\u30FC\u30BF\u306A\u3057</td></tr>'}</tbody>
          </table>
        </section>
      </div>
      ${htmlReportConceptGuideCardHtml}
      ${htmlReportSaveGuideCardHtml}

      <section class="card" style="margin-top:12px;">
        <h2>\u30B7\u30A7\u30A2\u30FB\u30D7\u30EC\u30D3\u30E5\u30FC\u5411\u3051\u306E\u60C5\u5831</h2>
        <p class="guide-lead">SNS\u3084\u30D6\u30E9\u30A6\u30B6\u306E\u30D7\u30EC\u30D3\u30E5\u30FC\u306B\u4F7F\u308F\u308C\u308B\u3053\u3068\u304C\u591A\u3044\u9805\u76EE\u3060\u3051\u3001\u65E5\u672C\u8A9E\u306E\u898B\u51FA\u3057\u306B\u76F4\u3057\u3066\u8F09\u305B\u3066\u3044\u308B\u306E\u3060\u3002</p>
        <table>
          <thead><tr><th>\u9805\u76EE</th><th>\u5185\u5BB9</th></tr></thead>
          <tbody>${friendlyMetaRowsHtml.join("") || '<tr><td colspan="2">\u3053\u306E\u30DA\u30FC\u30B8\u304B\u3089\u306F\u53D6\u5F97\u3067\u304D\u306A\u304B\u3063\u305F\u306E\u3060</td></tr>'}</tbody>
        </table>
      </section>

      <details class="tech-dump">
        <summary>\u30DA\u30FC\u30B8\u306E\u88CF\u5074\u30C7\u30FC\u30BF\uFF08\u30A2\u30D7\u30EA\u9023\u643A\u30FB\u8ABF\u67FB\u7528\u30FB\u4E0A\u7D1A\u8005\u5411\u3051\uFF09\u2014 \u30AF\u30EA\u30C3\u30AF\u3067\u958B\u304F</summary>
        <div class="tech-dump-inner">
          <p class="tech-dump-hint">al:android \u3084 twitter:card \u306A\u3069\u3001\u3075\u3060\u3093\u8AAD\u307E\u306A\u304F\u3066\u3088\u3044\u884C\u304C\u4E26\u3076\u306E\u3060\u3002\u30DA\u30FC\u30B8\u306E\u89E3\u6790\u3084\u30C8\u30E9\u30D6\u30EB\u8ABF\u67FB\u306E\u3068\u304D\u306B\u4F7F\u3046\u306E\u3060\u3002</p>
          <h3>head \u5185\u306E link\uFF08stylesheet / icon \u306A\u3069\uFF09</h3>
          <table>
            <thead><tr><th>rel</th><th>href</th><th>as</th><th>type</th></tr></thead>
            <tbody>${headLinkRows.join("") || '<tr><td colspan="4">\u53D6\u5F97\u306A\u3057</td></tr>'}</tbody>
          </table>
          <h3>\u30E1\u30BF\u30BF\u30B0\u5168\u6587\uFF08\u4E0A\u8A18\u300C\u30B7\u30A7\u30A2\u5411\u3051\u300D\u4EE5\u5916\uFF09</h3>
          <table>
            <thead><tr><th>key</th><th>value</th></tr></thead>
            <tbody>${headTechnicalMetaRows.join("") || '<tr><td colspan="2">\u53D6\u5F97\u306A\u3057</td></tr>'}</tbody>
          </table>
          <h3>script\uFF08src\uFF09</h3>
          <table>
            <thead><tr><th>type</th><th>src</th></tr></thead>
            <tbody>${headScriptRows.join("") || '<tr><td colspan="2">\u53D6\u5F97\u306A\u3057</td></tr>'}</tbody>
          </table>
          <h3>noopener \u30EA\u30F3\u30AF</h3>
          <table>
            <thead><tr><th>text</th><th>href</th></tr></thead>
            <tbody>${headNoopenerRows.join("") || '<tr><td colspan="2">\u53D6\u5F97\u306A\u3057</td></tr>'}</tbody>
          </table>
        </div>
      </details>

      <section class="card" style="margin-top:12px;">
        <h2>\u4FDD\u5B58\u30B3\u30E1\u30F3\u30C8\u4E00\u89A7</h2>
        <table>
          <thead><tr><th>#</th><th>commentNo</th><th>user</th><th>text</th><th>capturedAt</th></tr></thead>
          <tbody>${commentRows.join("") || '<tr><td colspan="5">\u30B3\u30E1\u30F3\u30C8\u306A\u3057</td></tr>'}</tbody>
        </table>
      </section>

      <p class="footer-note">
        \u3053\u306EHTML\u306F\u300C\u541B\u6597\u308A\u3093\u304F\u306E\u8FFD\u61B6\u306E\u304D\u3089\u3081\u304D\u300D\uFF08\u958B\u767A\u8B58\u5225\u5B50 nicolivelog\uFF09\u304C\u30ED\u30FC\u30AB\u30EB\u751F\u6210\u3057\u305F\u632F\u308A\u8FD4\u308A\u7528\u30EC\u30DD\u30FC\u30C8\u3067\u3059\u3002\u30D6\u30E9\u30A6\u30B6\u5185\u3067\u691C\u7D22\u3057\u3066\u518D\u5229\u7528\u3067\u304D\u307E\u3059\u3002
      </p>
    </div>

    <script>
      (() => {
        const q = document.getElementById('q');
        const all = Array.from(document.querySelectorAll('.search-item'));
        const totalEl = document.getElementById('totalCount');
        const resultEl = document.getElementById('searchResult');
        const update = () => {
          const keyword = String(q.value || '').toLowerCase().trim();
          let visible = 0;
          for (const el of all) {
            const hay = String(el.getAttribute('data-search') || '').toLowerCase();
            const hit = !keyword || hay.includes(keyword);
            el.classList.toggle('hide', !hit);
            if (hit) visible++;
          }
          totalEl.textContent = String(all.length);
          resultEl.textContent = keyword
            ? '\u691C\u7D22\u7D50\u679C: ' + visible + ' / ' + all.length + ' \u4EF6'
            : '\u691C\u7D22\u5BFE\u8C61: ' + all.length + ' \u4EF6';
        };
        q.addEventListener('input', update);
        update();
      })();
    <\/script>
  </body>
</html>`;
  }
  async function downloadCommentsHtml(liveId, storageKey, watchUrl) {
    const data = await chrome.storage.local.get(storageKey);
    const comments = Array.isArray(data[storageKey]) ? (
      /** @type {PopupCommentEntry[]} */
      data[storageKey]
    ) : [];
    const { snapshot, error } = await requestWatchPageSnapshotFromOpenTab(watchUrl);
    const html = await buildHtmlReportDocument(
      comments,
      snapshot,
      error,
      liveId,
      watchUrl
    );
    const blob = new Blob([html], {
      type: "text/html;charset=utf-8"
    });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `nicolivelog-${liveId}-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(blobUrl);
  }
  var storageRefreshCoalesceTimer = null;
  var storageRefreshMaxWaitTimer = null;
  var STORAGE_REFRESH_COALESCE_MS = 550;
  var STORAGE_REFRESH_MAX_WAIT_MS = 2200;
  function isHighFrequencyCommentRelatedStorageKey(key) {
    const k = String(key || "");
    if (/^nls_comments_/i.test(k)) return true;
    if (/^nls_gift_users_/i.test(k)) return true;
    if (k === KEY_SELF_POSTED_RECENTS) return true;
    if (k.startsWith(KEY_DEV_MONITOR_TREND_PREFIX)) return true;
    return false;
  }
  function scheduleCoalescedStorageRefresh(changes, runRefresh) {
    const keys = Object.keys(changes || {});
    if (!keys.length) return;
    const allHighFreq = keys.every(
      (k) => isHighFrequencyCommentRelatedStorageKey(k)
    );
    if (!allHighFreq) {
      if (storageRefreshCoalesceTimer) {
        clearTimeout(storageRefreshCoalesceTimer);
        storageRefreshCoalesceTimer = null;
      }
      if (storageRefreshMaxWaitTimer) {
        clearTimeout(storageRefreshMaxWaitTimer);
        storageRefreshMaxWaitTimer = null;
      }
      runRefresh();
      return;
    }
    if (storageRefreshCoalesceTimer) clearTimeout(storageRefreshCoalesceTimer);
    storageRefreshCoalesceTimer = setTimeout(() => {
      storageRefreshCoalesceTimer = null;
      if (storageRefreshMaxWaitTimer) {
        clearTimeout(storageRefreshMaxWaitTimer);
        storageRefreshMaxWaitTimer = null;
      }
      runRefresh();
    }, STORAGE_REFRESH_COALESCE_MS);
    if (!storageRefreshMaxWaitTimer) {
      storageRefreshMaxWaitTimer = setTimeout(() => {
        storageRefreshMaxWaitTimer = null;
        if (storageRefreshCoalesceTimer) {
          clearTimeout(storageRefreshCoalesceTimer);
          storageRefreshCoalesceTimer = null;
        }
        runRefresh();
      }, STORAGE_REFRESH_MAX_WAIT_MS);
    }
  }
  function initPopup() {
    installExtensionContextErrorGuard();
    void globalThis.chrome?.storage?.local?.get(KEY_CALM_PANEL_MOTION)?.then((b) => {
      applyCalmPanelMotionClass(
        normalizeCalmPanelMotion(b[KEY_CALM_PANEL_MOTION], {
          inlineDefault: INLINE_MODE
        })
      );
    });
    ensureStoryGrowthColorSchemeListener();
    applyResponsivePopupLayout();
    void applyUsageTermsGateState();
    if (INLINE_MODE) {
      const watchDetails = (
        /** @type {HTMLDetailsElement|null} */
        document.querySelector(".nl-watch-settings-details")
      );
      if (watchDetails) watchDetails.open = true;
      const frameThemeDetails = (
        /** @type {HTMLDetailsElement|null} */
        $("frameThemeDetails")
      );
      if (frameThemeDetails) frameThemeDetails.open = true;
    }
    window.addEventListener("resize", applyResponsivePopupLayout);
    const toggle = (
      /** @type {HTMLInputElement} */
      $("recordToggle")
    );
    const exportBtn = (
      /** @type {HTMLButtonElement} */
      $("exportJson")
    );
    const captureBtn = (
      /** @type {HTMLButtonElement|null} */
      $("captureScreenshot")
    );
    const captureStatus = $("captureStatus");
    const thumbIntervalSel = (
      /** @type {HTMLSelectElement|null} */
      $("thumbInterval")
    );
    const postBtn = (
      /** @type {HTMLButtonElement} */
      $("postCommentBtn")
    );
    const voiceBtn = (
      /** @type {HTMLButtonElement|null} */
      $("voiceCommentBtn")
    );
    const voiceAutoSend = (
      /** @type {HTMLInputElement|null} */
      $("voiceAutoSend")
    );
    const commentEnterSend = (
      /** @type {HTMLInputElement|null} */
      $("commentEnterSend")
    );
    const voiceDeviceSel = (
      /** @type {HTMLSelectElement|null} */
      $("voiceInputDevice")
    );
    const voiceDeviceRefreshBtn = (
      /** @type {HTMLButtonElement|null} */
      $("voiceDeviceRefresh")
    );
    const voiceMicCheckBtn = (
      /** @type {HTMLButtonElement|null} */
      $("voiceMicCheck")
    );
    const voiceSrCheckBtn = (
      /** @type {HTMLButtonElement|null} */
      $("voiceSrCheck")
    );
    const voiceDeviceCheckStatusEl = $("voiceDeviceCheckStatus");
    const voiceLevelFill = (
      /** @type {HTMLDivElement|null} */
      $("voiceLevelFill")
    );
    const voiceLevelTrack = (
      /** @type {HTMLDivElement|null} */
      $("voiceLevelTrack")
    );
    const commentInput = (
      /** @type {HTMLTextAreaElement} */
      $("commentInput")
    );
    const dismissErr = $("dismissStorageError");
    const frameChips = Array.from(document.querySelectorAll(".nl-frame-chip"));
    const frameEditor = (
      /** @type {HTMLDetailsElement|null} */
      $("frameCustomEditor")
    );
    const saveCustomFrameBtn = $("saveCustomFrame");
    const resetCustomFrameBtn = $("resetCustomFrame");
    const copyFrameCodeBtn = $("copyFrameCode");
    const toggleFrameCodeInputBtn = $("toggleFrameCodeInput");
    const frameShareBox = $("frameShareBox");
    const frameShareCode = (
      /** @type {HTMLTextAreaElement|null} */
      $("frameShareCode")
    );
    const applyFrameCodeBtn = $("applyFrameCode");
    const safeRefresh = () => {
      if (!hasExtensionContext()) return Promise.resolve();
      return refresh().catch((e) => {
        if (!isExtensionContextInvalidatedError(e)) {
        }
      }).finally(() => {
        requestAnimationFrame(() => {
          applyResponsivePopupLayout();
          correctSupportVisualScrollIfOpen();
        });
      });
    };
    $("devMonitorRefresh")?.addEventListener("click", () => {
      watchMetaCache.key = "";
      watchMetaCache.snapshot = null;
      safeRefresh();
    });
    $("devMonitorCopyAiBundleBtn")?.addEventListener("click", async () => {
      const stEl = (
        /** @type {HTMLElement|null} */
        $("devMonitorExportTrendStatus")
      );
      const exportBtn2 = (
        /** @type {HTMLButtonElement|null} */
        $("exportJson")
      );
      let watchUrl = String(exportBtn2?.dataset.watchUrl || "").trim();
      if (!watchUrl) {
        try {
          const bag = await chrome.storage.local.get(KEY_LAST_WATCH_URL);
          watchUrl = String(bag[KEY_LAST_WATCH_URL] || "").trim();
        } catch {
          watchUrl = "";
        }
      }
      if (stEl) stEl.textContent = "\u53CE\u96C6\u4E2D\u2026";
      let lastErr = "";
      const payload = {
        popup: {
          exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
          embedded: (() => {
            try {
              return window.self !== window.top;
            } catch {
              return true;
            }
          })()
        },
        content: null,
        note: "Chrome \u30B3\u30F3\u30BD\u30FC\u30EB\u306E ERR_BLOCKED_BY_CLIENT / \u5E83\u544A\u30B9\u30AF\u30EA\u30D7\u30C8\u5931\u6557\u306F\u30D6\u30ED\u30C3\u30AB\u30FC\u7531\u6765\u3067\u591A\u304F\u3001\u672C\u62E1\u5F35\u3068\u306F\u7121\u95A2\u4FC2\u306A\u3053\u3068\u304C\u3042\u308A\u307E\u3059\u3002"
      };
      try {
        const manifest = chrome.runtime.getManifest();
        const candidates = await collectWatchTabCandidates(watchUrl);
        if (!candidates.length) {
          lastErr = "watch \u30BF\u30D6\u5019\u88DC\u306A\u3057\uFF08\u30CB\u30B3\u751F watch \u3092\u958B\u3044\u305F\u72B6\u614B\u3067\u8A66\u3057\u3066\u304F\u3060\u3055\u3044\uFF09";
        } else {
          for (const c of candidates) {
            try {
              const res = (
                /** @type {{ ok?: boolean, diagnostics?: unknown, error?: string }} */
                await tabsSendMessageWithRetry(
                  c.id,
                  { type: "NLS_AI_SHARE_PAGE_DIAGNOSTICS" },
                  { frameId: 0, maxAttempts: 8, delayMs: 80 }
                )
              );
              if (res?.ok && res.diagnostics) {
                payload.content = /** @type {Record<string, unknown>} */
                res.diagnostics;
                payload.resolvedTabUrl = String(c.url || "").slice(0, 240);
                lastErr = "";
                break;
              }
              lastErr = String(res?.error || "content \u304C ok \u3092\u8FD4\u3057\u307E\u305B\u3093\u3067\u3057\u305F");
            } catch (e) {
              lastErr = String(
                e && typeof e === "object" && "message" in e ? (
                  /** @type {{ message?: unknown }} */
                  e.message
                ) : e || "send_failed"
              );
            }
          }
        }
        const md = formatAiShareDiagnosticsMarkdown({
          extensionName: manifest.name,
          extensionVersion: manifest.version,
          watchUrlNote: watchUrl ? `\u8A18\u9332\u4E2D URL \u512A\u5148\uFF08${watchUrl.slice(0, 120)}\uFF09` : "\u524D\u9762\u30A2\u30AF\u30C6\u30A3\u30D6\u306E\u30CB\u30B3\u751F watch \u30BF\u30D6\u512A\u5148",
          lastSendMessageError: lastErr,
          payload
        });
        const ok = await copyTextToClipboard(md);
        if (stEl) {
          stEl.textContent = ok ? "\u8A3A\u65AD\u307E\u3068\u3081\u3092\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F\uFF08AI \u306B\u8CBC\u308A\u4ED8\u3051\u53EF\uFF09" : "\u30B3\u30D4\u30FC\u306B\u5931\u6557\u3057\u307E\u3057\u305F";
        }
      } catch {
        if (stEl) stEl.textContent = "\u53CE\u96C6\u306B\u5931\u6557\u3057\u307E\u3057\u305F";
      }
    });
    $("devMonitorExportTrendBtn")?.addEventListener("click", async () => {
      const prm = lastDevMonitorPanelParams;
      const stEl = (
        /** @type {HTMLElement|null} */
        $("devMonitorExportTrendStatus")
      );
      if (!prm || !String(prm.liveId || "").trim()) {
        if (stEl) stEl.textContent = "liveId \u306A\u3057";
        return;
      }
      try {
        const w = typeof globalThis !== "undefined" ? globalThis : window;
        const trend = await readMergedTrendSeries(w, String(prm.liveId));
        const out = {
          exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
          liveId: prm.liveId,
          displayCount: prm.displayCount,
          storageCount: prm.storageCount,
          trendPointCount: trend.length,
          trend
        };
        const ok = await copyTextToClipboard(JSON.stringify(out, null, 2));
        if (stEl) {
          stEl.textContent = ok ? `\u30B3\u30D4\u30FC\u6E08\u307F\uFF08${trend.length} \u70B9\uFF09` : "\u30B3\u30D4\u30FC\u306B\u5931\u6557\u3057\u307E\u3057\u305F";
        }
      } catch {
        if (stEl) stEl.textContent = "\u30B3\u30D4\u30FC\u306B\u5931\u6557\u3057\u307E\u3057\u305F";
      }
    });
    $("devMonitorExportIngestBtn")?.addEventListener("click", async () => {
      const stEl = (
        /** @type {HTMLElement|null} */
        $("devMonitorExportTrendStatus")
      );
      try {
        const bag = await chrome.storage.local.get(KEY_COMMENT_INGEST_LOG);
        const parsed = parseCommentIngestLog(bag[KEY_COMMENT_INGEST_LOG]);
        const prm = lastDevMonitorPanelParams;
        const lid = String(prm?.liveId || "").trim().toLowerCase();
        const items = lid ? parsed.items.filter((x) => x.liveId === lid) : parsed.items;
        const out = {
          exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
          filterLiveId: lid || null,
          itemCount: items.length,
          totalStored: parsed.items.length,
          items
        };
        const ok = await copyTextToClipboard(JSON.stringify(out, null, 2));
        if (stEl) {
          stEl.textContent = ok ? `\u53D6\u308A\u8FBC\u307F\u30ED\u30B0 ${items.length} \u4EF6\u30B3\u30D4\u30FC\uFF08\u5168\u4F53 ${parsed.items.length}\uFF09` : "\u30B3\u30D4\u30FC\u306B\u5931\u6557\u3057\u307E\u3057\u305F";
        }
      } catch {
        if (stEl) stEl.textContent = "\u30B3\u30D4\u30FC\u306B\u5931\u6557\u3057\u307E\u3057\u305F";
      }
    });
    $("devMonitorClearIngestBtn")?.addEventListener("click", async () => {
      const stEl = (
        /** @type {HTMLElement|null} */
        $("devMonitorExportTrendStatus")
      );
      try {
        await chrome.storage.local.remove(KEY_COMMENT_INGEST_LOG);
        if (stEl) stEl.textContent = "\u53D6\u308A\u8FBC\u307F\u30ED\u30B0\u3092\u6D88\u53BB\u3057\u307E\u3057\u305F";
      } catch {
        if (stEl) stEl.textContent = "\u6D88\u53BB\u306B\u5931\u6557\u3057\u307E\u3057\u305F";
      }
    });
    $("devMonitorExportMarketingBtn")?.addEventListener("click", async () => {
      const prm = lastDevMonitorPanelParams;
      const stEl = (
        /** @type {HTMLElement|null} */
        $("devMonitorExportTrendStatus")
      );
      const btn = (
        /** @type {HTMLButtonElement|null} */
        $("devMonitorExportMarketingBtn")
      );
      const lid = String(prm?.liveId || "").trim();
      if (!lid) {
        if (stEl) stEl.textContent = "liveId \u306A\u3057";
        return;
      }
      if (btn) btn.disabled = true;
      if (stEl) stEl.textContent = "\u5206\u6790\u4E2D\u2026";
      try {
        const sKey = commentsStorageKey(lid);
        const data = await chrome.storage.local.get(sKey);
        const comments = (
          /** @type {import('../lib/commentRecord.js').StoredComment[]} */
          Array.isArray(data[sKey]) ? data[sKey] : []
        );
        if (comments.length === 0) {
          if (stEl) stEl.textContent = "\u30B3\u30E1\u30F3\u30C8\u304C0\u4EF6\u3067\u3059";
          if (btn) btn.disabled = false;
          return;
        }
        const report = aggregateMarketingReport(comments, lid);
        const html = buildMarketingDashboardHtml(report);
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `nicolivelog-marketing-${lid}-${Date.now()}.html`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(url);
          a.remove();
        }, 1e3);
        if (stEl) stEl.textContent = `DL\u5B8C\u4E86\uFF08${report.totalComments}\u4EF6 / ${report.uniqueUsers}\u4EBA\uFF09`;
      } catch (e) {
        if (stEl) stEl.textContent = "\u30A8\u30E9\u30FC: " + String(e?.message || e);
      } finally {
        if (btn) btn.disabled = false;
      }
    });
    const readCustomFrameInputs = () => sanitizeCustomFrame({
      headerStart: (
        /** @type {HTMLInputElement|null} */
        $("frameHeaderStart")?.value
      ),
      headerEnd: (
        /** @type {HTMLInputElement|null} */
        $("frameHeaderEnd")?.value
      ),
      accent: (
        /** @type {HTMLInputElement|null} */
        $("frameAccent")?.value
      )
    });
    const applyAndSaveFrame = async (frameId) => {
      const normalized = frameId === "custom" || hasFramePreset(frameId) ? frameId : DEFAULT_FRAME_ID;
      popupFrameState.id = normalized;
      if (normalized === "custom") {
        popupFrameState.custom = readCustomFrameInputs();
        openFrameThemeSectionIfPresent();
        if (frameEditor) frameEditor.open = true;
      }
      applyPopupFrame(popupFrameState.id, popupFrameState.custom);
      setFrameShareStatus("", "idle");
      await savePopupFrameSettings();
    };
    dismissErr?.addEventListener("click", async () => {
      try {
        const ok = await storageRemoveSafe(KEY_STORAGE_WRITE_ERROR);
        if (!ok) return;
        safeRefresh();
      } catch {
      }
    });
    $("dismissCommentHarvestBanner")?.addEventListener("click", async () => {
      try {
        const ok = await storageRemoveSafe(KEY_COMMENT_PANEL_STATUS);
        if (!ok) return;
        safeRefresh();
      } catch {
      }
    });
    $("extensionCacheClearBtn")?.addEventListener("click", async () => {
      const statusEl = $("extensionCacheClearStatus");
      if (statusEl) statusEl.textContent = "";
      const confirmMsg = "\u300C\u8868\u793A\u30AD\u30E3\u30C3\u30B7\u30E5\u300D\u3092\u6D88\u3059\u3068\u3001\u3053\u306EPC\u304C\u899A\u3048\u305F\u30E6\u30FC\u30B6\u30FC\u540D\u30FB\u30A2\u30A4\u30B3\u30F3URL\u3060\u3051\u3092\u5FD8\u308C\u307E\u3059\u3002\n\u8A18\u9332\u3057\u305F\u5FDC\u63F4\u30B3\u30E1\u30F3\u30C8\u30FB\u8A2D\u5B9A\u30FB\u5B9A\u671F\u30B5\u30E0\u30CD\u306F\u6D88\u3048\u307E\u305B\u3093\u3002\n\u307E\u305A\u8A66\u3057\u3066\u3044\u306A\u3044\u306A\u3089\u3001\u30AD\u30E3\u30F3\u30BB\u30EB\u3057\u3066\u4E0A\u306E\u300Cwatch \u3092\u518D\u8AAD\u307F\u8FBC\u307F\u300D\u3060\u3051\u3067\u3082\u69CB\u3044\u307E\u305B\u3093\u3002\n\u6D88\u3057\u307E\u3059\u304B\uFF1F";
      if (!window.confirm(confirmMsg)) return;
      try {
        const keys = (
          /** @type {string[]} */
          [...EXTENSION_SOFT_CACHE_STORAGE_KEYS]
        );
        const ok = await storageRemoveSafe(keys);
        if (!ok) {
          if (statusEl) {
            statusEl.textContent = "\u524A\u9664\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002chrome://extensions \u3067\u62E1\u5F35\u3092\u66F4\u65B0\u3057\u3066\u304B\u3089\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002";
          }
          return;
        }
        if (statusEl) {
          statusEl.textContent = "\u6D88\u3057\u307E\u3057\u305F\u3002\u7D9A\u3051\u3066\u300Cwatch \u3092\u518D\u8AAD\u307F\u8FBC\u307F\u300D\u3092\u62BC\u3059\u304B\u3001watch \u30BF\u30D6\u3092 F5 \u3067\u66F4\u65B0\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
        }
        safeRefresh();
      } catch {
        if (statusEl) statusEl.textContent = "\u524A\u9664\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002";
      }
    });
    toggle.addEventListener("change", async () => {
      const next = toggle.checked;
      try {
        const ok = await storageSetSafe({ [KEY_RECORDING]: next });
        if (!ok) {
          toggle.checked = !next;
          return;
        }
        safeRefresh();
      } catch {
        toggle.checked = !next;
      }
    });
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
    });
    const deepHarvestQuietToggle = (
      /** @type {HTMLInputElement|null} */
      $("deepHarvestQuietUiToggle")
    );
    deepHarvestQuietToggle?.addEventListener("change", async () => {
      try {
        const ok = await storageSetSafe({
          [KEY_DEEP_HARVEST_QUIET_UI]: deepHarvestQuietToggle.checked
        });
        if (!ok) return;
      } catch {
      }
    });
    const saveInlinePanelWidthMode = async (value) => {
      const v = value === INLINE_PANEL_WIDTH_VIDEO ? INLINE_PANEL_WIDTH_VIDEO : INLINE_PANEL_WIDTH_PLAYER_ROW;
      const ok = await storageSetSafe({ [KEY_INLINE_PANEL_WIDTH_MODE]: v });
      if (!ok) return;
      safeRefresh();
    };
    const saveInlinePanelPlacement = async (value) => {
      const v = value === INLINE_PANEL_PLACEMENT_BESIDE ? INLINE_PANEL_PLACEMENT_BESIDE : value === INLINE_PANEL_PLACEMENT_FLOATING ? INLINE_PANEL_PLACEMENT_FLOATING : INLINE_PANEL_PLACEMENT_BELOW;
      const ok = await storageSetSafe({ [KEY_INLINE_PANEL_PLACEMENT]: v });
      if (!ok) return;
      safeRefresh();
    };
    const radioPlayerRowEl = $("inlinePanelWidthPlayerRow");
    const radioVideoOnlyEl = $("inlinePanelWidthVideo");
    radioPlayerRowEl?.addEventListener("change", (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.checked) {
        void saveInlinePanelWidthMode(INLINE_PANEL_WIDTH_PLAYER_ROW);
      }
    });
    radioVideoOnlyEl?.addEventListener("change", (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.checked) {
        void saveInlinePanelWidthMode(INLINE_PANEL_WIDTH_VIDEO);
      }
    });
    const radioPlacementBelowEl = $("inlinePanelPlacementBelow");
    const radioPlacementBesideEl = $("inlinePanelPlacementBeside");
    const radioPlacementFloatingEl = $("inlinePanelPlacementFloating");
    radioPlacementBelowEl?.addEventListener("change", (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.checked) {
        void saveInlinePanelPlacement(INLINE_PANEL_PLACEMENT_BELOW);
      }
    });
    radioPlacementBesideEl?.addEventListener("change", (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.checked) {
        void saveInlinePanelPlacement(INLINE_PANEL_PLACEMENT_BESIDE);
      }
    });
    radioPlacementFloatingEl?.addEventListener("change", (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.checked) {
        void saveInlinePanelPlacement(INLINE_PANEL_PLACEMENT_FLOATING);
      }
    });
    const calmMotionEl = (
      /** @type {HTMLInputElement|null} */
      $("calmPanelMotion")
    );
    calmMotionEl?.addEventListener("change", async () => {
      try {
        const on = Boolean(calmMotionEl.checked);
        applyCalmPanelMotionClass(on);
        await storageSetSafe({ [KEY_CALM_PANEL_MOTION]: on });
      } catch {
      }
    });
    for (const chip of frameChips) {
      chip.addEventListener("click", () => {
        const frameId = String(chip.getAttribute("data-frame-id") || "");
        applyAndSaveFrame(frameId).catch(() => {
        });
      });
    }
    saveCustomFrameBtn?.addEventListener("click", () => {
      popupFrameState.custom = readCustomFrameInputs();
      popupFrameState.id = "custom";
      applyPopupFrame(popupFrameState.id, popupFrameState.custom);
      setFrameShareStatus("\u30AB\u30B9\u30BF\u30E0\u8272\u3092\u66F4\u65B0\u3057\u307E\u3057\u305F\u3002", "success");
      savePopupFrameSettings().catch(() => {
      });
    });
    resetCustomFrameBtn?.addEventListener("click", () => {
      popupFrameState.custom = { ...DEFAULT_CUSTOM_FRAME };
      renderCustomFrameEditor(popupFrameState.custom);
      if (popupFrameState.id === "custom") {
        applyPopupFrame(popupFrameState.id, popupFrameState.custom);
      }
      setFrameShareStatus("\u30AB\u30B9\u30BF\u30E0\u8272\u3092\u521D\u671F\u5316\u3057\u307E\u3057\u305F\u3002", "success");
      savePopupFrameSettings().catch(() => {
      });
    });
    toggleFrameCodeInputBtn?.addEventListener("click", () => {
      if (!frameShareBox) return;
      const nextHidden = !frameShareBox.hidden;
      frameShareBox.hidden = nextHidden;
      setFrameShareStatus("", "idle");
      if (!nextHidden) {
        syncFrameShareInput();
        frameShareCode?.focus();
        frameShareCode?.select();
      }
    });
    copyFrameCodeBtn?.addEventListener("click", () => {
      const code = createFrameShareCode(popupFrameState.id, popupFrameState.custom);
      copyTextToClipboard(code).then((ok) => {
        if (ok) {
          setFrameShareStatus("\u5171\u6709\u30B3\u30FC\u30C9\u3092\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F\u3002", "success");
          return;
        }
        setFrameShareStatus("\u30B3\u30D4\u30FC\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002", "error");
      }).catch(() => {
        setFrameShareStatus("\u30B3\u30D4\u30FC\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002", "error");
      });
    });
    applyFrameCodeBtn?.addEventListener("click", () => {
      const raw = String(frameShareCode?.value || "");
      try {
        const parsed = parseFrameShareCode(raw);
        popupFrameState.id = parsed.frameId;
        popupFrameState.custom = parsed.custom;
        applyPopupFrame(popupFrameState.id, popupFrameState.custom);
        if (popupFrameState.id === "custom") {
          openFrameThemeSectionIfPresent();
          if (frameEditor) frameEditor.open = true;
        }
        savePopupFrameSettings().catch(() => {
        });
        setFrameShareStatus("\u5171\u6709\u30B3\u30FC\u30C9\u3092\u9069\u7528\u3057\u307E\u3057\u305F\u3002", "success");
      } catch {
        setFrameShareStatus("\u5171\u6709\u30B3\u30FC\u30C9\u306E\u5F62\u5F0F\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093\u3002", "error");
      }
    });
    frameShareCode?.addEventListener("input", () => {
      setFrameShareStatus("", "idle");
    });
    captureBtn?.addEventListener("click", async () => {
      const watchUrl = exportBtn.dataset.watchUrl || captureBtn?.dataset.watchUrl || "";
      if (!watchUrl) {
        setCaptureStatus(captureStatus, "watch\u30DA\u30FC\u30B8\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044\u3002", "error");
        return;
      }
      setCaptureStatus(captureStatus, "\u30AD\u30E3\u30D7\u30C1\u30E3\u4E2D\u2026", "idle");
      try {
        const res = (
          /** @type {{ ok?: boolean, errorCode?: string, dataUrl?: string, liveId?: string }|null} */
          await sendMessageToWatchTabs(watchUrl, { type: "NLS_CAPTURE_SCREENSHOT" })
        );
        if (!res?.ok || !res.dataUrl) {
          setCaptureStatus(
            captureStatus,
            screenshotErrorMessage(res?.errorCode),
            "error"
          );
          return;
        }
        const lv = res.liveId || extractLiveIdFromUrl(watchUrl) || "unknown";
        const filename = buildScreenshotFilename(lv, "png", Date.now());
        let saved = false;
        try {
          await chrome.downloads.download({
            url: res.dataUrl,
            filename,
            saveAs: false,
            conflictAction: "uniquify"
          });
          saved = true;
        } catch {
        }
        if (saved) {
          setCaptureStatus(captureStatus, "\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002", "success");
        } else {
          await chrome.tabs.create({ url: res.dataUrl });
          setCaptureStatus(captureStatus, "\u65B0\u3057\u3044\u30BF\u30D6\u306B\u8868\u793A\u3057\u307E\u3057\u305F\u3002\u53F3\u30AF\u30EA\u30C3\u30AF\u2192\u300C\u540D\u524D\u3092\u4ED8\u3051\u3066\u753B\u50CF\u3092\u4FDD\u5B58\u300D\u3067\u4FDD\u5B58\u3067\u304D\u307E\u3059\u3002", "idle");
        }
        safeRefresh();
      } catch (err) {
        setCaptureStatus(captureStatus, `\u30AD\u30E3\u30D7\u30C1\u30E3\u306B\u5931\u6557: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    });
    thumbIntervalSel?.addEventListener("change", async () => {
      const v = Number(thumbIntervalSel.value);
      try {
        if (v === 0) {
          await storageSetSafe({
            [KEY_THUMB_AUTO]: false,
            [KEY_THUMB_INTERVAL_MS]: 0
          });
        } else {
          await storageSetSafe({
            [KEY_THUMB_AUTO]: true,
            [KEY_THUMB_INTERVAL_MS]: v
          });
        }
      } catch {
      }
    });
    exportBtn.addEventListener("click", async () => {
      const lv = exportBtn.dataset.liveId;
      const key = exportBtn.dataset.storageKey;
      const watchUrl = exportBtn.dataset.watchUrl || "";
      if (!lv || !key || exportBtn.disabled) return;
      try {
        await downloadCommentsHtml(lv, key, watchUrl);
      } catch {
      }
    });
    $("exportSessionSummaryJsonBtn")?.addEventListener("click", async () => {
      const lv = exportBtn.dataset.liveId;
      if (!lv || exportBtn.disabled) return;
      try {
        await downloadSessionSummaryJson(lv);
      } catch {
      }
    });
    async function submitComment() {
      const text = String(commentInput?.value || "").trim();
      const watchUrl = exportBtn.dataset.watchUrl || "";
      if (!text) {
        setPostStatus("\u30B3\u30E1\u30F3\u30C8\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002", "error");
        return;
      }
      if (!watchUrl) {
        setPostStatus("watch\u30DA\u30FC\u30B8\u3092\u958B\u3044\u3066\u304B\u3089\u9001\u4FE1\u3057\u3066\u304F\u3060\u3055\u3044\u3002", "error");
        return;
      }
      const lvPost = String(exportBtn.dataset.liveId || "").trim().toLowerCase();
      let optimisticLogged = false;
      COMMENT_POST_UI_STATE.submitting = true;
      if (postBtn) postBtn.disabled = true;
      syncVoiceCommentButton();
      setPostStatus("\u9001\u4FE1\u4E2D\u2026", "idle");
      try {
        if (lvPost && toggle.checked) {
          await appendSelfPostedComment(lvPost, text);
          optimisticLogged = true;
        }
        if (!hasExtensionContext()) return;
        const result = await requestPostCommentToOpenTab(text, watchUrl);
        if (!hasExtensionContext()) return;
        if (result.ok) {
          if (commentInput) commentInput.value = "";
          setPostStatus("\u30B3\u30E1\u30F3\u30C8\u3092\u9001\u4FE1\u3057\u307E\u3057\u305F\u3002", "success");
          const growthEl = (
            /** @type {HTMLElement|null} */
            $("sceneStoryGrowth")
          );
          if (growthEl) patchStoryGrowthIconsFromSource(growthEl);
          return;
        }
        if (optimisticLogged && lvPost) {
          await revertLastSelfPostedComment(lvPost, text);
          optimisticLogged = false;
        }
        setPostStatus(
          withCommentSendTroubleshootHint(
            result.error || "\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002"
          ),
          "error"
        );
      } catch (e) {
        if (optimisticLogged && lvPost) {
          await revertLastSelfPostedComment(lvPost, text).catch(() => {
          });
        }
        if (isExtensionContextInvalidatedError(e) || !hasExtensionContext()) return;
        throw e;
      } finally {
        COMMENT_POST_UI_STATE.submitting = false;
        if (hasExtensionContext()) {
          if (postBtn) postBtn.disabled = false;
          syncVoiceCommentButton();
        }
      }
    }
    let voiceListeningUi = false;
    const setVoiceLevelMeter = (level) => {
      const pct = Math.max(0, Math.min(100, Math.round(Number(level) * 100)));
      if (voiceLevelFill) voiceLevelFill.style.width = `${pct}%`;
      if (voiceLevelTrack) voiceLevelTrack.setAttribute("aria-valuenow", String(pct));
    };
    const setVoiceListeningUi = (on) => {
      voiceListeningUi = on;
      if (voiceBtn) {
        voiceBtn.classList.toggle("is-listening", on);
        voiceBtn.setAttribute("aria-pressed", on ? "true" : "false");
      }
      if (!on) setVoiceLevelMeter(0);
    };
    window.addEventListener("pagehide", () => {
      const w = exportBtn.dataset.watchUrl || "";
      if (!w || !voiceListeningUi) return;
      findWatchTabIdForVoice(w).then((tabId) => {
        if (tabId == null) return;
        return chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const st = globalThis.__NLS_VOICE_STOP__;
            if (typeof st === "function") st();
          }
        });
      }).catch(() => {
      });
      setVoiceListeningUi(false);
    });
    voiceAutoSend?.addEventListener("change", async () => {
      try {
        await storageSetSafe({
          [KEY_VOICE_AUTOSEND]: voiceAutoSend.checked
        });
      } catch {
      }
    });
    commentEnterSend?.addEventListener("change", async () => {
      try {
        await storageSetSafe({
          [KEY_COMMENT_ENTER_SEND]: commentEnterSend.checked
        });
      } catch {
      }
    });
    const storyGrowthCollapseBtn = $("storyGrowthCollapseBtn");
    storyGrowthCollapseBtn?.addEventListener("click", () => {
      void (async () => {
        const bag = await storageGetSafe(KEY_STORY_GROWTH_COLLAPSED, {});
        const collapsed = bag[KEY_STORY_GROWTH_COLLAPSED] === true;
        const ok = await storageSetSafe({
          [KEY_STORY_GROWTH_COLLAPSED]: !collapsed
        });
        if (!ok) return;
        await applyStoryGrowthCollapsedFromStorage();
      })();
    });
    const wireSupportVisualUi = () => {
      if (supportVisualUiWired) return;
      supportVisualUiWired = true;
      const supportVisualDetails = (
        /** @type {HTMLDetailsElement|null} */
        $("supportVisualDetails")
      );
      if (supportVisualDetails) {
        supportVisualDetails.ontoggle = () => {
          if (suppressSupportVisualTogglePersist) return;
          const open = Boolean(supportVisualDetails?.open);
          if (open) {
            scheduleScrollOpenSupportVisualDetails(supportVisualDetails);
          } else {
            cleanupSupportVisualScrollObserver();
          }
          void (async () => {
            const prev = !open;
            ownSupportVisualPersistInFlight = true;
            try {
              const bag = await storageGetSafe(KEY_SUPPORT_VISUAL_EXPANDED, {});
              const rawStored = bag[KEY_SUPPORT_VISUAL_EXPANDED];
              if ((rawStored === true || rawStored === false) && rawStored === open) {
                return;
              }
              const ok = await storageSetSafe({
                [KEY_SUPPORT_VISUAL_EXPANDED]: open
              });
              if (!ok) {
                suppressSupportVisualTogglePersist = true;
                try {
                  if (supportVisualDetails) supportVisualDetails.open = prev;
                } finally {
                  suppressSupportVisualTogglePersist = false;
                }
              }
            } finally {
              globalThis.setTimeout(() => {
                ownSupportVisualPersistInFlight = false;
              }, 0);
            }
          })();
        };
      }
    };
    voiceDeviceSel?.addEventListener("change", async () => {
      try {
        await storageSetSafe({
          [KEY_VOICE_INPUT_DEVICE]: voiceDeviceSel.value
        });
      } catch {
      }
    });
    voiceDeviceRefreshBtn?.addEventListener("click", () => {
      refreshVoiceInputDeviceList().catch(() => {
      });
    });
    voiceMicCheckBtn?.addEventListener("click", () => {
      void (async () => {
        setVoiceDeviceCheckStatus(
          voiceDeviceCheckStatusEl,
          "\u78BA\u8A8D\u4E2D\u2026 \u77ED\u304F\u8A71\u3057\u3066\u304F\u3060\u3055\u3044\uFF08\u7D041\u79D2\uFF09",
          "idle"
        );
        const id = String(voiceDeviceSel?.value || "");
        const c = audioConstraintsForDevice(id);
        const r = await probeMicrophoneLevel(c);
        if (!r.ok) {
          setVoiceDeviceCheckStatus(
            voiceDeviceCheckStatusEl,
            r.error || "\u97F3\u3092\u691C\u51FA\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002",
            "error"
          );
          return;
        }
        setVoiceDeviceCheckStatus(
          voiceDeviceCheckStatusEl,
          `\u30DE\u30A4\u30AF\u5165\u529BOK\uFF08\u30D4\u30FC\u30AF ${Math.round(r.peak)}\uFF09`,
          "success"
        );
      })();
    });
    voiceSrCheckBtn?.addEventListener("click", () => {
      void (async () => {
        const watchUrl = exportBtn.dataset.watchUrl || "";
        if (!watchUrl) {
          setVoiceDeviceCheckStatus(
            voiceDeviceCheckStatusEl,
            "watch\u30DA\u30FC\u30B8\u3092\u958B\u3044\u3066\u304B\u3089\u300C\u8A8D\u8B58\u30C6\u30B9\u30C8\u300D\u3092\u4F7F\u3063\u3066\u304F\u3060\u3055\u3044\u3002",
            "error"
          );
          return;
        }
        const tabId = await findWatchTabIdForVoice(watchUrl);
        if (tabId == null) {
          setVoiceDeviceCheckStatus(
            voiceDeviceCheckStatusEl,
            "\u5BFE\u8C61\u306Ewatch\u30BF\u30D6\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002\u30BF\u30D6\u3092\u524D\u9762\u306B\u51FA\u3057\u3066\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
            "error"
          );
          return;
        }
        setVoiceDeviceCheckStatus(
          voiceDeviceCheckStatusEl,
          "\u8A8D\u8B58\u30C6\u30B9\u30C8\u4E2D\u2026 \u77ED\u3044\u6587\u3092\u8A71\u3057\u3066\u304F\u3060\u3055\u3044\uFF08\u6700\u59275\u79D2\uFF09",
          "idle"
        );
        try {
          const exec = await chrome.scripting.executeScript({
            target: { tabId },
            func: async (dev) => {
              const fn = globalThis.__NLS_VOICE_PROBE_SR__;
              if (typeof fn !== "function") {
                return {
                  ok: false,
                  error: "\u62E1\u5F35\u3092\u518D\u8AAD\u307F\u8FBC\u307F\u3057\u3001watch\u30DA\u30FC\u30B8\u3082\u66F4\u65B0\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
                };
              }
              return await fn(dev);
            },
            args: [String(voiceDeviceSel?.value || "")]
          });
          const r = (
            /** @type {{ ok?: boolean, text?: string, error?: string }|undefined} */
            exec?.[0]?.result
          );
          if (r?.ok === true && r.text) {
            setVoiceDeviceCheckStatus(
              voiceDeviceCheckStatusEl,
              `\u8A8D\u8B58OK: \u300C${r.text.slice(0, 80)}${r.text.length > 80 ? "\u2026" : ""}\u300D`,
              "success"
            );
          } else {
            setVoiceDeviceCheckStatus(
              voiceDeviceCheckStatusEl,
              r?.error || "\u8A8D\u8B58\u30C6\u30B9\u30C8\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002",
              "error"
            );
          }
        } catch {
          setVoiceDeviceCheckStatus(
            voiceDeviceCheckStatusEl,
            "\u8A8D\u8B58\u30C6\u30B9\u30C8\u3092\u5B9F\u884C\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002",
            "error"
          );
        }
      })();
    });
    try {
      const onMsg = chrome?.runtime?.onMessage;
      if (onMsg && typeof onMsg.addListener === "function") {
        onMsg.addListener((msg) => {
          if (!msg || msg.type !== "NLS_VOICE_TO_POPUP") return;
          if (typeof msg.level === "number") {
            setVoiceLevelMeter(msg.level);
            return;
          }
          if ("partial" in msg && commentInput) {
            commentInput.value = String(msg.partial || "").slice(0, 250);
            return;
          }
          if (msg.error === true) {
            setVoiceListeningUi(false);
            setPostStatus(String(msg.message || "\u97F3\u58F0\u5165\u529B\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002"), "error");
            return;
          }
          if (msg.done === true) {
            setVoiceListeningUi(false);
            const text = String(msg.text || "").trim();
            if (commentInput) commentInput.value = text.slice(0, 250);
            if (!text) {
              setPostStatus("", "idle");
              return;
            }
            if (voiceAutoSend?.checked) {
              submitComment().catch(() => {
                setPostStatus(
                  withCommentSendTroubleshootHint("\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002"),
                  "error"
                );
              });
            } else {
              setPostStatus("\u5185\u5BB9\u3092\u78BA\u8A8D\u3057\u3066\u300C\u30B3\u30E1\u30F3\u30C8\u9001\u4FE1\u300D\u3092\u62BC\u3057\u3066\u304F\u3060\u3055\u3044\u3002", "success");
            }
          }
        });
      }
    } catch {
    }
    voiceBtn?.addEventListener("click", () => {
      void (async () => {
        if (!commentInput || !voiceBtn || voiceBtn.disabled) return;
        const watchUrl = exportBtn.dataset.watchUrl || "";
        if (!watchUrl) {
          setPostStatus("watch\u30DA\u30FC\u30B8\u3092\u958B\u3044\u3066\u304B\u3089\u4F7F\u3063\u3066\u304F\u3060\u3055\u3044\u3002", "error");
          return;
        }
        const sessionBase = String(commentInput.value || "");
        const tabId = await findWatchTabIdForVoice(watchUrl);
        if (tabId == null) {
          setPostStatus(
            "\u97F3\u58F0\u5165\u529B: \u5BFE\u8C61\u306Ewatch\u30BF\u30D6\u3092\u524D\u9762\u306B\u51FA\u3059\u304B\u3001\u30DA\u30FC\u30B8\u3092\u518D\u8AAD\u307F\u8FBC\u307F\u3057\u3066\u304B\u3089\u8A66\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
            "error"
          );
          return;
        }
        const deviceId = String(voiceDeviceSel?.value || "");
        try {
          const exec = await chrome.scripting.executeScript({
            target: { tabId },
            func: async (base, dev) => {
              const fn = globalThis.__NLS_VOICE_TOGGLE__;
              if (typeof fn !== "function") {
                return {
                  ok: false,
                  error: "\u62E1\u5F35\u306E\u30B9\u30AF\u30EA\u30D7\u30C8\u304C\u53E4\u3044\u3067\u3059\u3002watch\u30DA\u30FC\u30B8\u3092\u518D\u8AAD\u307F\u8FBC\u307F\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
                };
              }
              return await fn(base, dev);
            },
            args: [sessionBase, deviceId]
          });
          const r = (
            /** @type {{ ok?: boolean, listening?: boolean, error?: string }|undefined} */
            exec?.[0]?.result
          );
          if (!r || r.ok === false) {
            setVoiceListeningUi(false);
            setPostStatus(r?.error || "\u97F3\u58F0\u5165\u529B\u3092\u5207\u308A\u66FF\u3048\u3089\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002", "error");
            return;
          }
          if (r.listening === true) {
            setVoiceListeningUi(true);
            setPostStatus("\u805E\u3044\u3066\u3044\u307E\u3059\u2026 \u7D42\u308F\u3063\u305F\u3089\u3082\u3046\u4E00\u5EA6\u300C\u97F3\u58F0\u5165\u529B\u300D", "idle");
          } else {
            setVoiceListeningUi(false);
          }
        } catch {
          setVoiceListeningUi(false);
          setPostStatus("\u97F3\u58F0\u5165\u529B\u3092\u958B\u59CB\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002", "error");
        }
      })();
    });
    $("reloadWatchTabBtn")?.addEventListener("click", () => {
      void triggerReloadWatchTabFromPopup();
    });
    $("reloadWatchTabPanelBtn")?.addEventListener("click", () => {
      void triggerReloadWatchTabFromPopup();
    });
    postBtn?.addEventListener("click", () => {
      submitComment().catch(() => {
        setPostStatus(
          withCommentSendTroubleshootHint("\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002"),
          "error"
        );
      });
    });
    commentInput?.addEventListener("keydown", (e) => {
      const action = commentComposeKeyAction({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        isComposing: Boolean(e.isComposing) || e.keyCode === 229,
        enterSendsComment: Boolean(commentEnterSend?.checked)
      });
      if (action !== "submit") return;
      e.preventDefault();
      submitComment().catch(() => {
        setPostStatus(
          withCommentSendTroubleshootHint("\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002"),
          "error"
        );
      });
    });
    commentInput?.addEventListener("input", () => {
      setPostStatus("", "idle");
    });
    loadPopupFrameSettings().catch(() => {
      applyPopupFrame(popupFrameState.id, popupFrameState.custom);
    }).finally(() => {
      void (async () => {
        const refreshDone = safeRefresh();
        await applySupportVisualExpandedFromStorage().catch(() => {
        });
        wireSupportVisualUi();
        document.documentElement.setAttribute("data-nl-support-wired", "");
        void applyThumbSelectFromStorage().catch(() => {
        });
        void applyVoiceAutosendFromStorage().catch(() => {
        });
        void applyCommentEnterSendFromStorage().catch(() => {
        });
        void applyStoryGrowthCollapsedFromStorage().catch(() => {
        });
        void refreshVoiceInputDeviceList().catch(() => {
        });
        await refreshDone;
      })();
    });
    try {
      const stCh = chrome?.storage?.onChanged;
      if (stCh && typeof stCh.addListener === "function") {
        stCh.addListener((changes, area) => {
          if (area !== "local") return;
          if (changes[KEY_POPUP_FRAME] || changes[KEY_POPUP_FRAME_CUSTOM]) {
            loadPopupFrameSettings().catch(() => {
            });
          }
          if (changes[KEY_THUMB_AUTO] || changes[KEY_THUMB_INTERVAL_MS]) {
            applyThumbSelectFromStorage().catch(() => {
            });
          }
          if (changes[KEY_VOICE_AUTOSEND]) {
            applyVoiceAutosendFromStorage().catch(() => {
            });
          }
          if (changes[KEY_COMMENT_ENTER_SEND]) {
            applyCommentEnterSendFromStorage().catch(() => {
            });
          }
          if (changes[KEY_STORY_GROWTH_COLLAPSED]) {
            applyStoryGrowthCollapsedFromStorage().catch(() => {
            });
          }
          const skipVisualExternalSync = changes[KEY_SUPPORT_VISUAL_EXPANDED] && ownSupportVisualPersistInFlight;
          const changedKeys = Object.keys(changes);
          const onlyVisualExpanded = changedKeys.length === 1 && changedKeys[0] === KEY_SUPPORT_VISUAL_EXPANDED;
          if (!skipVisualExternalSync || !onlyVisualExpanded) {
            scheduleCoalescedStorageRefresh(changes, () => safeRefresh());
          }
        });
      }
    } catch {
    }
    setInterval(() => {
      if (!hasExtensionContext()) return;
      if (typeof document !== "undefined" && document.hidden) return;
      watchMetaCache.key = "";
      watchMetaCache.snapshot = null;
      safeRefresh();
    }, 3e4);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPopup);
  } else {
    initPopup();
  }
})();
