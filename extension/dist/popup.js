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
  var KEY_VOICE_AUTOSEND = "nls_voice_autosend";
  var KEY_VOICE_INPUT_DEVICE = "nls_voice_input_device";
  function commentsStorageKey(liveId) {
    const id = String(liveId || "").trim().toLowerCase();
    return `nls_comments_${id}`;
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
  function displayUserLabel(userKey, nickname) {
    if (!userKey || userKey === UNKNOWN_USER_KEY) {
      return "ID\u672A\u53D6\u5F97\uFF08DOM\u306B\u6295\u7A3F\u8005\u60C5\u5831\u306A\u3057\uFF09";
    }
    const name = String(nickname || "").trim();
    const s = String(userKey);
    const shortId = s.length <= 18 ? s : `${s.slice(0, 8)}\u2026${s.slice(-6)}`;
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
      if (!map.has(userKey)) {
        map.set(userKey, {
          userKey,
          nickname: "",
          count: 0,
          lastAt: 0,
          lastText: ""
        });
      }
      const row = map.get(userKey);
      row.count += 1;
      if (nickname && !row.nickname) row.nickname = nickname;
      if (capturedAt >= row.lastAt) {
        row.lastAt = capturedAt;
        row.lastText = text.length > 60 ? `${text.slice(0, 60)}\u2026` : text;
      }
    }
    return [...map.values()].sort((a, b) => b.lastAt - a.lastAt);
  }

  // src/extension/popup-entry.js
  function $(id) {
    return document.getElementById(id);
  }
  function syncVoiceCommentButton() {
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
  function applyResponsivePopupLayout() {
    const root = document.documentElement;
    const body = document.body;
    if (!root || !body) return;
    root.classList.toggle("nl-inline", INLINE_MODE);
    body.classList.toggle("nl-inline", INLINE_MODE);
    if (INLINE_MODE) {
      const width2 = Math.max(640, Math.round(window.innerWidth || 640));
      const header2 = (
        /** @type {HTMLElement|null} */
        document.querySelector(".nl-header")
      );
      const main2 = (
        /** @type {HTMLElement|null} */
        document.querySelector(".nl-main")
      );
      const contentHeight2 = header2 && main2 ? Math.ceil(header2.scrollHeight + main2.scrollHeight + 6) : 760;
      const height2 = Math.max(720, Math.min(1400, contentHeight2));
      const baseFont2 = width2 >= 1600 ? 17.25 : width2 >= 1200 ? 16.5 : width2 >= 900 ? 15.75 : 15;
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
  function setCountDisplay(value) {
    const countEl = $("count");
    if (!countEl) return;
    countEl.textContent = value;
    countEl.classList.toggle("is-placeholder", value === "-" || value === "");
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
    const uid = latest.userId ? String(latest.userId).trim() : "";
    const nick = latest.nickname ? String(latest.nickname).trim() : "";
    const label = displayUserLabel(uid || UNKNOWN_USER_KEY, nick);
    const rawText = String(latest.text || "").trim();
    const textShown = truncateText(rawText, 72);
    const noStr = String(latest.commentNo || "").trim();
    const noPrefix = /^\d+$/.test(noStr) ? `No.${noStr} ` : "";
    const tip = `${noPrefix}${label}\uFF1A${rawText || "\uFF08\u30B3\u30E1\u30F3\u30C8\u672C\u6587\u306A\u3057\uFF09"}`;
    segA.innerHTML = `<span class="nl-ticker-item nl-ticker-latest" aria-live="polite">${escapeHtml(noPrefix)}${escapeHtml(label)}\uFF1A${escapeHtml(textShown)}</span>`;
    const line = (
      /** @type {HTMLSpanElement|null} */
      segA.querySelector(".nl-ticker-latest")
    );
    if (line) line.title = tip;
  }
  function setPostStatus(message, kind = "idle") {
    const status = $("postStatus");
    if (!status) return;
    status.textContent = message;
    status.classList.remove("error", "success");
    if (kind === "error") status.classList.add("error");
    if (kind === "success") status.classList.add("success");
  }
  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }
  var watchMetaCache = {
    key: "",
    snapshot: null
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
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
    const r = clamp(parseInt(source.slice(0, 2), 16) * (1 - ratio));
    const g = clamp(parseInt(source.slice(2, 4), 16) * (1 - ratio));
    const b = clamp(parseInt(source.slice(4, 6), 16) * (1 - ratio));
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
  async function copyTextToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "true");
      area.style.position = "fixed";
      area.style.opacity = "0";
      area.style.pointerEvents = "none";
      document.body.appendChild(area);
      area.focus();
      area.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(area);
      return copied;
    }
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
  var STORY_RINK_TILE_IMG = "images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png";
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
    if (img) img.src = STORY_RINK_FACE_IMG;
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
      gaugeLabel.textContent = count <= 0 ? "\u5FDC\u63F4 0 \u30B3\u30E1\u30F3\u30C8" : `\u5FDC\u63F4 ${count.toLocaleString("ja-JP")} \u30B3\u30E1\u30F3\u30C8 / \u5DE6\u4E0A\u304B\u30891\u30B3\u30E1\u30F3\u30C8\u305A\u3064\u8868\u793A\uFF08\u30AF\u30EA\u30C3\u30AF\u3067\u8A73\u7D30\uFF09`;
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
    /** 選択中の表示スロット（0..表示数-1） */
    selectedIndex: (
      /** @type {number|null} */
      null
    ),
    /** syncStorySourceEntries の内容が変わったあと DOM を付け直すための簡易シグネチャ */
    sourceSig: ""
  };
  var STORY_SOURCE_STATE = {
    liveId: "",
    entries: (
      /** @type {PopupCommentEntry[]} */
      []
    )
  };
  function syncStorySourceEntries(liveId, arr) {
    const nextLiveId = String(liveId || "");
    const list = Array.isArray(arr) ? arr : [];
    if (STORY_SOURCE_STATE.liveId !== nextLiveId) {
      STORY_SOURCE_STATE.liveId = nextLiveId;
      STORY_GROWTH_STATE.selectedIndex = null;
    }
    STORY_SOURCE_STATE.entries = list;
    const sel = STORY_GROWTH_STATE.selectedIndex;
    if (typeof sel === "number" && (sel < 0 || sel >= list.length)) {
      STORY_GROWTH_STATE.selectedIndex = null;
    }
    renderStorySelectedCommentDetail();
  }
  function getStoryEntryByIndex(index) {
    const entries = STORY_SOURCE_STATE.entries;
    if (!Number.isFinite(index) || index < 0 || index >= entries.length) return null;
    return entries[index];
  }
  function storyUserKey(entry) {
    const userId = String(entry?.userId || "").trim();
    return userId || UNKNOWN_USER_KEY;
  }
  function renderStorySelectedCommentDetail() {
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
    const idx = STORY_GROWTH_STATE.selectedIndex;
    if (typeof idx !== "number") {
      wrap.hidden = true;
      listEl.innerHTML = "";
      return;
    }
    const entry = getStoryEntryByIndex(idx);
    if (!entry) {
      wrap.hidden = true;
      listEl.innerHTML = "";
      return;
    }
    const userId = String(entry.userId || "").trim();
    const nickname = String(entry.nickname || "").trim();
    const userKey = storyUserKey(entry);
    const userLabel = displayUserLabel(userKey, nickname);
    if (img) img.src = STORY_RINK_TILE_IMG;
    userEl.textContent = userLabel;
    userMetaEl.textContent = userId ? `ID: ${userId}` : "ID\u672A\u53D6\u5F97\uFF08DOM\u306B\u6295\u7A3F\u8005\u60C5\u5831\u306A\u3057\uFF09";
    textEl.textContent = String(entry.text || "").trim() || "\uFF08\u30B3\u30E1\u30F3\u30C8\u672C\u6587\u306A\u3057\uFF09";
    const commentNo = String(entry.commentNo || "").trim() || "-";
    const at = formatDateTime(entry.capturedAt || 0);
    const liveId = String(entry.liveId || STORY_SOURCE_STATE.liveId || "").trim() || "-";
    metaEl.textContent = `No.${commentNo} / ${at} / ${liveId}`;
    const recent = STORY_SOURCE_STATE.entries.filter((row) => storyUserKey(row) === userKey).slice(-5).reverse();
    listEl.innerHTML = "";
    for (const row of recent) {
      const li = document.createElement("li");
      const no = String(row.commentNo || "").trim() || "-";
      const line = String(row.text || "").trim() || "\uFF08\u30B3\u30E1\u30F3\u30C8\u672C\u6587\u306A\u3057\uFF09";
      li.textContent = `#${no} ${truncateText(line, 72)}`;
      listEl.appendChild(li);
    }
    wrap.hidden = false;
  }
  function storySourceSignature() {
    const e = STORY_SOURCE_STATE.entries;
    if (!e.length) return "";
    const first = e[0];
    const last = e[e.length - 1];
    return `${e.length}|${first?.capturedAt ?? ""}|${last?.capturedAt ?? ""}|${last?.id ?? ""}`;
  }
  function bindStoryGrowthInteractions(root) {
    if (root.dataset.nlStoryGrowthBound === "1") return;
    root.dataset.nlStoryGrowthBound = "1";
    root.addEventListener("click", (ev) => {
      const t = (
        /** @type {HTMLElement} */
        ev.target
      );
      const img = t.closest("img.nl-story-growth-icon");
      if (!img || !root.contains(img)) return;
      const idx = Number(img.getAttribute("data-comment-index"));
      if (!Number.isFinite(idx)) return;
      STORY_GROWTH_STATE.selectedIndex = STORY_GROWTH_STATE.selectedIndex === idx ? null : idx;
      for (const el of root.querySelectorAll("img.nl-story-growth-icon")) {
        const i = Number(el.getAttribute("data-comment-index"));
        el.classList.toggle("is-selected", STORY_GROWTH_STATE.selectedIndex === i);
      }
      renderStorySelectedCommentDetail();
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
  }
  function clearStoryGrowthTimer() {
    if (!STORY_GROWTH_STATE.timer) return;
    clearTimeout(STORY_GROWTH_STATE.timer);
    STORY_GROWTH_STATE.timer = null;
  }
  function storyGrowthStepDelayMs() {
    const remain = STORY_GROWTH_STATE.targetCount - STORY_GROWTH_STATE.renderedCount;
    if (remain > 1500) return 1;
    if (remain > 700) return 2;
    if (remain > 300) return 4;
    if (remain > 120) return 8;
    if (remain > 40) return 14;
    return 26;
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
  function applyStoryGrowthIconAttributes(img, index, isNew) {
    img.className = isNew ? "nl-story-growth-icon is-new" : "nl-story-growth-icon";
    if (STORY_GROWTH_STATE.selectedIndex === index) {
      img.classList.add("is-selected");
    }
    img.src = STORY_RINK_TILE_IMG;
    const entry = getStoryEntryByIndex(index);
    const userId = String(entry?.userId || "").trim();
    const nickname = String(entry?.nickname || "").trim();
    const userKey = userId || UNKNOWN_USER_KEY;
    const userLabel = displayUserLabel(userKey, nickname);
    const text = truncateText(entry?.text || "", 26);
    img.setAttribute("data-comment-index", String(index));
    img.setAttribute("role", "button");
    img.setAttribute("tabindex", "0");
    img.setAttribute(
      "aria-label",
      entry ? `${index + 1}\u4EF6\u76EE ${userLabel} ${text || "\u30B3\u30E1\u30F3\u30C8"}` : `${index + 1}\u4EF6\u76EE\u306E\u30B3\u30E1\u30F3\u30C8`
    );
    img.title = entry ? `#${entry.commentNo || "-"} ${userLabel}` : `${index + 1}\u4EF6\u76EE`;
    img.alt = "";
  }
  function createStoryGrowthIcon(isNew, index) {
    const img = document.createElement("img");
    applyStoryGrowthIconAttributes(img, index, isNew);
    return img;
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
      frag.appendChild(createStoryGrowthIcon(false, i));
    }
    root.appendChild(frag);
  }
  function runStoryGrowthTick() {
    STORY_GROWTH_STATE.timer = null;
    const root = STORY_GROWTH_STATE.root;
    if (!root) return;
    if (STORY_GROWTH_STATE.renderedCount >= STORY_GROWTH_STATE.targetCount) return;
    const nextIndex = STORY_GROWTH_STATE.renderedCount;
    STORY_GROWTH_STATE.renderedCount += 1;
    root.appendChild(createStoryGrowthIcon(true, nextIndex));
    if (STORY_GROWTH_STATE.renderedCount >= STORY_GROWTH_STATE.targetCount) return;
    STORY_GROWTH_STATE.timer = window.setTimeout(runStoryGrowthTick, storyGrowthStepDelayMs());
  }
  function syncStoryGrowth(liveId, count, root) {
    const nextLiveId = String(liveId || "");
    const targetFull = Math.max(0, Math.floor(Number(count) || 0));
    const target = targetFull;
    const changedLive = STORY_GROWTH_STATE.liveId !== nextLiveId;
    const changedRoot = STORY_GROWTH_STATE.root !== root;
    if (changedLive || changedRoot) {
      clearStoryGrowthTimer();
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
    root.style.setProperty("--nl-story-icon-size", `${resolveStoryIconSize(target)}px`);
    if (STORY_GROWTH_STATE.renderedCount > STORY_GROWTH_STATE.targetCount) {
      STORY_GROWTH_STATE.renderedCount = STORY_GROWTH_STATE.targetCount;
      rebuildStoryGrowth(root, STORY_GROWTH_STATE.renderedCount);
    }
    const nextSig = storySourceSignature();
    const needSourceSync = STORY_GROWTH_STATE.renderedCount > 0 && STORY_GROWTH_STATE.renderedCount === STORY_GROWTH_STATE.targetCount && nextSig !== STORY_GROWTH_STATE.sourceSig;
    STORY_GROWTH_STATE.sourceSig = nextSig;
    if (needSourceSync) {
      patchStoryGrowthIconsFromSource(root, { pulseLast: true });
    }
    if (STORY_GROWTH_STATE.renderedCount < STORY_GROWTH_STATE.targetCount) {
      if (!STORY_GROWTH_STATE.timer) {
        STORY_GROWTH_STATE.timer = window.setTimeout(runStoryGrowthTick, 0);
      }
    } else if (STORY_GROWTH_STATE.renderedCount === 0 && root.childElementCount > 0) {
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
    if (!wrap || !title || !broadcaster || !thumb || !tags) return;
    wrap.hidden = true;
    title.textContent = "-";
    broadcaster.textContent = "-";
    thumb.hidden = true;
    thumb.removeAttribute("src");
    tags.innerHTML = "";
  }
  function renderWatchMetaCard(snapshot) {
    const wrap = $("watchMeta");
    const title = $("watchTitle");
    const broadcaster = $("watchBroadcaster");
    const thumb = (
      /** @type {HTMLImageElement} */
      $("watchThumb")
    );
    const tags = $("watchTags");
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
    wrap.hidden = false;
  }
  async function renderStorageErrorBanner() {
    const banner = $("storageErrorBanner");
    const detail = $("storageErrorDetail");
    if (!banner || !detail) return;
    const bag = await chrome.storage.local.get(KEY_STORAGE_WRITE_ERROR);
    const raw = bag[KEY_STORAGE_WRITE_ERROR];
    if (raw && typeof raw === "object" && "at" in raw && typeof /** @type {{ at: unknown }} */
    raw.at === "number") {
      const err = (
        /** @type {{ at: number; liveId?: string; message?: string }} */
        raw
      );
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
  function renderUserRooms(entries) {
    const ul = (
      /** @type {HTMLUListElement} */
      $("userRoomList")
    );
    if (!ul) return;
    const rooms = aggregateCommentsByUser(entries);
    ul.innerHTML = "";
    if (!rooms.length) {
      const li = document.createElement("li");
      li.className = "empty-hint";
      li.textContent = "\u307E\u3060\u30B3\u30E1\u30F3\u30C8\u304C\u3042\u308A\u307E\u305B\u3093";
      ul.appendChild(li);
      return;
    }
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
    const rankedRooms = rooms.map((room) => ({
      ...room,
      recentCount: recentMap.get(room.userKey) || 0
    })).sort((a, b) => {
      if (b.recentCount !== a.recentCount) return b.recentCount - a.recentCount;
      if (b.count !== a.count) return b.count - a.count;
      return b.lastAt - a.lastAt;
    });
    const denseLayout = document.body?.classList.contains("nl-tight") || document.body?.classList.contains("nl-compact");
    const compactRooms = !INLINE_MODE;
    const MAX_VISIBLE_ROOMS = compactRooms ? 1 : denseLayout ? 2 : 3;
    const visibleRooms = rankedRooms.slice(0, MAX_VISIBLE_ROOMS);
    const maxTotal = Math.max(1, ...visibleRooms.map((v) => v.count));
    const maxRecent = Math.max(1, ...visibleRooms.map((v) => v.recentCount));
    const totalRecent = rankedRooms.reduce((sum, v) => sum + v.recentCount, 0);
    const activeUsers = rankedRooms.filter((v) => v.recentCount > 0).length;
    const heatPercent = totalRecent > 0 ? Math.min(100, Math.log10(totalRecent + 1) * 38) : 0;
    const heatText = totalRecent >= 50 ? "\u5897\u52A0\u304C\u3068\u3066\u3082\u5927\u304D\u3044" : totalRecent >= 20 ? "\u5897\u52A0\u304C\u5927\u304D\u3044" : totalRecent >= 5 ? "\u5897\u52A0\u3042\u308A" : "\u5897\u52A0\u306F\u5C11\u306A\u3081";
    if (!compactRooms) {
      const summaryLi = document.createElement("li");
      summaryLi.className = "room-heat";
      summaryLi.innerHTML = `
      <div class="room-heat-head">
        <span class="room-heat-title">\u76F4\u8FD15\u5206\u306E\u5FDC\u63F4\u5897\u52A0</span>
        <span class="room-heat-meta">+${totalRecent}\u4EF6 / ${activeUsers}\u4EBA</span>
      </div>
      <div class="room-heat-track">
        <div class="room-heat-fill" style="width:${heatPercent.toFixed(2)}%"></div>
      </div>
      <div class="room-heat-note">${heatText}\uFF08\u3053\u306E5\u5206\u3067\u5897\u3048\u305F\u4EF6\u6570\uFF09</div>
    `;
      ul.appendChild(summaryLi);
    }
    for (const r of visibleRooms) {
      const li = document.createElement("li");
      li.classList.add("room-card");
      const label = displayUserLabel(r.userKey, r.nickname);
      const isUnknown = r.userKey === UNKNOWN_USER_KEY;
      const totalPercent = Math.max(6, Math.min(100, r.count / maxTotal * 100));
      const recentPercent = r.recentCount > 0 ? Math.max(4, Math.min(100, r.recentCount / maxRecent * 100)) : 0;
      const deltaLabel = r.recentCount > 0 ? `+${r.recentCount} / 5\u5206` : "\xB10 / 5\u5206";
      const hint = isUnknown ? '<div class="room-hint">\u6295\u7A3F\u8005ID\u672A\u53D6\u5F97\u306E\u30B3\u30E1\u30F3\u30C8\u3092\u3053\u3053\u306B\u307E\u3068\u3081\u3066\u3044\u307E\u3059\u3002</div>' : "";
      li.innerHTML = compactRooms ? `
      <div class="room-meta">
        <span class="room-name" title="${escapeHtml(r.userKey)}">${escapeHtml(label)}</span>
        <span class="room-count">${r.count}\u4EF6</span>
      </div>
      ${r.lastText ? `<div class="room-preview">${escapeHtml(r.lastText)}</div>` : ""}
    ` : `
      <div class="room-meta">
        <span class="room-name" title="${escapeHtml(r.userKey)}">${escapeHtml(label)}</span>
        <span class="room-count">${r.count}\u4EF6</span>
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
    `;
      ul.appendChild(li);
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
    const candidates = [];
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id && typeof activeTab.url === "string" && isNicoLiveWatchUrl(activeTab.url)) {
      candidates.push({ id: activeTab.id, url: activeTab.url });
    }
    if (watchUrl) {
      try {
        const allTabs = await chrome.tabs.query({});
        for (const tab of allTabs) {
          if (!tab?.id || typeof tab.url !== "string") continue;
          if (!isNicoLiveWatchUrl(tab.url)) continue;
          if (tab.url !== watchUrl) continue;
          if (candidates.some((v) => v.id === tab.id)) continue;
          candidates.push({ id: tab.id, url: tab.url });
        }
      } catch {
      }
    }
    for (const candidate of candidates) {
      try {
        return await chrome.tabs.sendMessage(candidate.id, message);
      } catch {
      }
    }
    return null;
  }
  async function findWatchTabIdForVoice(watchUrl) {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id != null && typeof activeTab.url === "string" && isNicoLiveWatchUrl(activeTab.url)) {
      if (!watchUrl || activeTab.url === watchUrl) {
        return activeTab.id;
      }
    }
    if (watchUrl) {
      try {
        const allTabs = await chrome.tabs.query({});
        for (const tab of allTabs) {
          if (tab?.id == null || typeof tab.url !== "string") continue;
          if (tab.url === watchUrl) return tab.id;
        }
      } catch {
      }
    }
    return null;
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
  async function resolveWatchContextUrl() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || "";
    if (isNicoLiveWatchUrl(url)) {
      return { url, fromActiveTab: true };
    }
    const stash = await chrome.storage.local.get(KEY_LAST_WATCH_URL);
    const last = stash[KEY_LAST_WATCH_URL];
    if (typeof last === "string" && isNicoLiveWatchUrl(last)) {
      return { url: last, fromActiveTab: false };
    }
    return { url: "", fromActiveTab: true };
  }
  async function refresh() {
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
    await renderStorageErrorBanner();
    const { url, fromActiveTab } = await resolveWatchContextUrl();
    const bagRec = await chrome.storage.local.get(KEY_RECORDING);
    toggle.checked = bagRec[KEY_RECORDING] === true;
    toggle.disabled = false;
    if (postBtn) postBtn.disabled = true;
    syncVoiceCommentButton();
    if (commentInput) {
      commentInput.placeholder = "watch\u30DA\u30FC\u30B8\u3092\u958B\u304F\u3068\u30B3\u30E1\u30F3\u30C8\u9001\u4FE1\u3067\u304D\u307E\u3059";
    }
    setPostStatus("", "idle");
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
      syncStorySourceEntries("", []);
      renderCharacterScene({
        hasWatch: false,
        recording: toggle.checked,
        commentCount: 0,
        liveId: "",
        snapshot: null
      });
      if (postBtn) postBtn.disabled = true;
      syncVoiceCommentButton();
      if (commentInput) {
        commentInput.placeholder = "watch\u30DA\u30FC\u30B8\u3092\u958B\u304F\u3068\u30B3\u30E1\u30F3\u30C8\u9001\u4FE1\u3067\u304D\u307E\u3059";
      }
      renderUserRooms([]);
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
      syncStorySourceEntries("", []);
      renderCharacterScene({
        hasWatch: true,
        recording: toggle.checked,
        commentCount: 0,
        liveId: "",
        snapshot: null
      });
      if (postBtn) postBtn.disabled = true;
      syncVoiceCommentButton();
      if (commentInput) {
        commentInput.placeholder = "\u30B3\u30E1\u30F3\u30C8\u3092\u5165\u529B\u3057\u3066\u9001\u4FE1";
      }
      renderUserRooms([]);
      return;
    }
    const key = commentsStorageKey(lv);
    const data = await chrome.storage.local.get(key);
    const arr = Array.isArray(data[key]) ? data[key] : [];
    setCountDisplay(String(arr.length));
    renderCommentTicker(
      /** @type {PopupCommentEntry[]} */
      arr
    );
    exportBtn.disabled = false;
    exportBtn.dataset.liveId = lv;
    exportBtn.dataset.storageKey = key;
    exportBtn.dataset.watchUrl = url;
    if (captureBtn) {
      captureBtn.disabled = false;
      captureBtn.dataset.watchUrl = url;
    }
    const stats = (
      /** @type {{ ok?: boolean, count?: number }|null} */
      await sendMessageToWatchTabs(url, { type: "NLS_THUMB_STATS" })
    );
    if (thumbCountEl) {
      thumbCountEl.textContent = stats && stats.ok === true && typeof stats.count === "number" ? String(stats.count) : "0";
    }
    if (postBtn) postBtn.disabled = false;
    syncVoiceCommentButton();
    if (commentInput) {
      commentInput.placeholder = "\u30B3\u30E1\u30F3\u30C8\u3092\u5165\u529B\u3057\u3066\u9001\u4FE1";
    }
    syncStorySourceEntries(lv, arr);
    renderUserRooms(arr);
    renderCharacterScene({
      hasWatch: true,
      recording: toggle.checked,
      commentCount: arr.length,
      liveId: lv,
      snapshot: null
    });
    const snapshotKey = `${lv}|${url}`;
    if (watchMetaCache.key !== snapshotKey || !watchMetaCache.snapshot) {
      watchMetaCache.key = snapshotKey;
      const { snapshot } = await requestWatchPageSnapshotFromOpenTab(url);
      watchMetaCache.snapshot = snapshot;
    }
    renderWatchMetaCard(watchMetaCache.snapshot);
    renderCharacterScene({
      hasWatch: true,
      recording: toggle.checked,
      commentCount: arr.length,
      liveId: lv,
      snapshot: watchMetaCache.snapshot
    });
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
  async function requestWatchPageSnapshotFromOpenTab(watchUrl) {
    const candidates = [];
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id && typeof activeTab.url === "string" && isNicoLiveWatchUrl(activeTab.url)) {
      candidates.push({ id: activeTab.id, url: activeTab.url });
    }
    if (watchUrl) {
      try {
        const allTabs = await chrome.tabs.query({});
        for (const tab of allTabs) {
          if (!tab?.id || typeof tab.url !== "string") continue;
          if (!isNicoLiveWatchUrl(tab.url)) continue;
          if (tab.url !== watchUrl) continue;
          if (candidates.some((v) => v.id === tab.id)) continue;
          candidates.push({ id: tab.id, url: tab.url });
        }
      } catch {
      }
    }
    if (!candidates.length) {
      return {
        snapshot: null,
        error: "watch\u30BF\u30D6\u304C\u898B\u3064\u304B\u3089\u306A\u3044\u305F\u3081\u3001head\u60C5\u5831\u306F\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002"
      };
    }
    for (const candidate of candidates) {
      try {
        const res = await chrome.tabs.sendMessage(candidate.id, {
          type: "NLS_EXPORT_WATCH_SNAPSHOT"
        });
        if (res?.ok && res.snapshot) {
          return {
            snapshot: (
              /** @type {WatchPageSnapshot} */
              res.snapshot
            ),
            error: ""
          };
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
    const candidates = [];
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id && typeof activeTab.url === "string" && isNicoLiveWatchUrl(activeTab.url)) {
      candidates.push({ id: activeTab.id, url: activeTab.url });
    }
    if (watchUrl) {
      try {
        const allTabs = await chrome.tabs.query({});
        for (const tab of allTabs) {
          if (!tab?.id || typeof tab.url !== "string") continue;
          if (!isNicoLiveWatchUrl(tab.url)) continue;
          if (tab.url !== watchUrl) continue;
          if (candidates.some((v) => v.id === tab.id)) continue;
          candidates.push({ id: tab.id, url: tab.url });
        }
      } catch {
      }
    }
    if (!candidates.length) {
      return {
        ok: false,
        error: "watch\u30BF\u30D6\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002\u653E\u9001\u30BF\u30D6\u3092\u958B\u3044\u3066\u304B\u3089\u9001\u4FE1\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
      };
    }
    for (const candidate of candidates) {
      try {
        const res = await chrome.tabs.sendMessage(candidate.id, {
          type: "NLS_POST_COMMENT",
          text: trimmed
        });
        if (res?.ok) {
          return { ok: true, error: "" };
        }
        if (res?.error) {
          return { ok: false, error: String(res.error) };
        }
      } catch {
      }
    }
    return {
      ok: false,
      error: "\u30B3\u30E1\u30F3\u30C8\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u653E\u9001\u30BF\u30D6\u3092\u518D\u8AAD\u307F\u8FBC\u307F\u3057\u3066\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
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
    <title>nicolivelog-report-${safeLiveId}</title>
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
      .yukkuri-row--reverse {
        flex-direction: row-reverse;
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
      .speech-bubble strong {
        display: block;
        margin-bottom: 6px;
        color: #7dd3fc;
        font-size: 0.8rem;
      }
      .speech-bubble p {
        margin: 0;
        color: var(--text);
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
        <h1>nicolivelog HTML\u30EC\u30DD\u30FC\u30C8 <span class="pill">${safeLiveId}</span></h1>
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

      <section class="card yukkuri-guide-card" style="margin-top:12px;">
        <h2>\u306A\u306B\u3053\u308C\uFF1F\uFF08\u3086\u3063\u304F\u308A\u30AC\u30A4\u30C9\uFF09</h2>
        <p class="guide-lead">\u3053\u306EHTML\u306F\u3001\u3053\u306EPC\u306B\u4FDD\u5B58\u3057\u305F\u30B3\u30E1\u30F3\u30C8\u3068\u3001\u5F53\u6642\u306E\u653E\u9001\u30DA\u30FC\u30B8\u304B\u3089\u53D6\u308C\u305F\u60C5\u5831\u3092\u307E\u3068\u3081\u305F\u300C\u632F\u308A\u8FD4\u308A\u7528\u30E1\u30E2\u300D\u306A\u306E\u3060\u3002</p>
        <div class="yukkuri-guide">
          <div class="yukkuri-row">
            ${avatarRink}
            <div class="speech-bubble">
              <strong>\u3086\u3063\u304F\u308A\u308A\u3093\u304F</strong>
              <p>\u307E\u305A\u306F\u4E0A\u306E\u300C\u6982\u8981\u300D\u3067\u30BF\u30A4\u30C8\u30EB\u3068\u914D\u4FE1\u8005\u3092\u78BA\u8A8D\u3059\u308B\u306E\u3060\u3002\u691C\u7D22\u30DC\u30C3\u30AF\u30B9\u306B\u30AD\u30FC\u30EF\u30FC\u30C9\u3092\u5165\u308C\u308B\u3068\u3001\u3053\u306E\u30DA\u30FC\u30B8\u5168\u4F53\u304B\u3089\u7D5E\u308A\u8FBC\u3081\u308B\u306E\u3060\u3002</p>
            </div>
          </div>
          <div class="yukkuri-row yukkuri-row--reverse">
            ${avatarKonta}
            <div class="speech-bubble">
              <strong>\u3086\u3063\u304F\u308A\u3053\u3093\u592A</strong>
              <p>\u300C\u30B7\u30A7\u30A2\u30FB\u30D7\u30EC\u30D3\u30E5\u30FC\u5411\u3051\u300D\u306F\u3001LINE\u3084X\u3067\u30EA\u30F3\u30AF\u3092\u8CBC\u3063\u305F\u3068\u304D\u306B\u51FA\u3084\u3059\u3044\u30BF\u30A4\u30C8\u30EB\u3084\u8AAC\u660E\u6587\u306A\u306E\u3060\u3002\u7D30\u304B\u3044\u82F1\u8A9E\u306E\u30AD\u30FC\u540D\u306F\u6C17\u306B\u3057\u306A\u304F\u3066\u3088\u3044\u306E\u3060\u3002</p>
            </div>
          </div>
          <div class="yukkuri-row">
            ${avatarTanu}
            <div class="speech-bubble">
              <strong>\u3086\u3063\u304F\u308A\u305F\u306C\u59C9</strong>
              <p>\u30A2\u30D7\u30EA\u9023\u643A\u7528\u306E\u9577\u3044\u30BF\u30B0\u3084 script \u306EURL\u306F\u3001\u4E0B\u306E\u6298\u308A\u305F\u305F\u307F\u306B\u307E\u3068\u3081\u3066\u3042\u308B\u306E\u3060\u3002\u8ABF\u3079\u3082\u306E\u3092\u3059\u308B\u3068\u304D\u4EE5\u5916\u306F\u958B\u304B\u306A\u304F\u3066\u5927\u4E08\u592B\u306A\u306E\u3060\u3002\u30BF\u30B0\u306E\u30C1\u30C3\u30D7\u306F\u4E0A\u306E\u6982\u8981\u3068\u540C\u3058\u3060\u304B\u3089\u3001\u8868\u3067\u306F\u4E8C\u5EA6\u51FA\u3055\u306A\u3044\u306E\u3060\u3002</p>
            </div>
          </div>
        </div>
      </section>

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
        \u3053\u306EHTML\u306F nicolivelog \u304C\u30ED\u30FC\u30AB\u30EB\u751F\u6210\u3057\u305F\u632F\u308A\u8FD4\u308A\u7528\u30EC\u30DD\u30FC\u30C8\u3067\u3059\u3002\u30D6\u30E9\u30A6\u30B6\u5185\u3067\u691C\u7D22\u3057\u3066\u518D\u5229\u7528\u3067\u304D\u307E\u3059\u3002
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
  function initPopup() {
    applyResponsivePopupLayout();
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
      refresh().catch(() => {
      }).finally(() => {
        requestAnimationFrame(() => {
          applyResponsivePopupLayout();
        });
      });
    };
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
        if (frameEditor) frameEditor.open = true;
      }
      applyPopupFrame(popupFrameState.id, popupFrameState.custom);
      setFrameShareStatus("", "idle");
      await savePopupFrameSettings();
    };
    dismissErr?.addEventListener("click", async () => {
      await chrome.storage.local.remove(KEY_STORAGE_WRITE_ERROR);
      safeRefresh();
    });
    toggle.addEventListener("change", async () => {
      await chrome.storage.local.set({ [KEY_RECORDING]: toggle.checked });
      safeRefresh();
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
        if (popupFrameState.id === "custom" && frameEditor) frameEditor.open = true;
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
        await chrome.downloads.download({ url: res.dataUrl, filename, saveAs: false });
        setCaptureStatus(captureStatus, "\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002", "success");
        safeRefresh();
      } catch {
        setCaptureStatus(captureStatus, "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002", "error");
      }
    });
    thumbIntervalSel?.addEventListener("change", async () => {
      const v = Number(thumbIntervalSel.value);
      if (v === 0) {
        await chrome.storage.local.set({
          [KEY_THUMB_AUTO]: false,
          [KEY_THUMB_INTERVAL_MS]: 0
        });
      } else {
        await chrome.storage.local.set({
          [KEY_THUMB_AUTO]: true,
          [KEY_THUMB_INTERVAL_MS]: v
        });
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
      if (postBtn) postBtn.disabled = true;
      syncVoiceCommentButton();
      setPostStatus("\u9001\u4FE1\u4E2D\u2026", "idle");
      const result = await requestPostCommentToOpenTab(text, watchUrl);
      if (postBtn) postBtn.disabled = false;
      syncVoiceCommentButton();
      if (result.ok) {
        if (commentInput) commentInput.value = "";
        setPostStatus("\u30B3\u30E1\u30F3\u30C8\u3092\u9001\u4FE1\u3057\u307E\u3057\u305F\u3002", "success");
        return;
      }
      setPostStatus(result.error || "\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002", "error");
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
      await chrome.storage.local.set({
        [KEY_VOICE_AUTOSEND]: voiceAutoSend.checked
      });
    });
    voiceDeviceSel?.addEventListener("change", async () => {
      await chrome.storage.local.set({
        [KEY_VOICE_INPUT_DEVICE]: voiceDeviceSel.value
      });
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
    chrome.runtime.onMessage.addListener((msg) => {
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
            setPostStatus("\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002", "error");
          });
        } else {
          setPostStatus("\u5185\u5BB9\u3092\u78BA\u8A8D\u3057\u3066\u300C\u30B3\u30E1\u30F3\u30C8\u9001\u4FE1\u300D\u3092\u62BC\u3057\u3066\u304F\u3060\u3055\u3044\u3002", "success");
        }
      }
    });
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
    postBtn?.addEventListener("click", () => {
      submitComment().catch(() => {
        setPostStatus("\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002", "error");
      });
    });
    commentInput?.addEventListener("keydown", (e) => {
      if (!e.ctrlKey || e.key !== "Enter") return;
      e.preventDefault();
      submitComment().catch(() => {
        setPostStatus("\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002", "error");
      });
    });
    commentInput?.addEventListener("input", () => {
      setPostStatus("", "idle");
    });
    loadPopupFrameSettings().catch(() => {
      applyPopupFrame(popupFrameState.id, popupFrameState.custom);
    }).finally(() => {
      applyThumbSelectFromStorage().catch(() => {
      });
      applyVoiceAutosendFromStorage().catch(() => {
      });
      refreshVoiceInputDeviceList().catch(() => {
      });
      safeRefresh();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
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
      safeRefresh();
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPopup);
  } else {
    initPopup();
  }
})();
