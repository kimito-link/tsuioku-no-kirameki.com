// background.js — YouTube Live コメントのローカル記録・読み上げキュー管理バンドル
/* eslint-disable */
(() => {
  // src/extension/self-update.js
  var SELF_UPDATE_ALARM = "self-update-check";
  var SELF_UPDATE_PERIOD_MINUTES = 2;
  function compareVersions(a, b) {
    const pa = String(a || "").split(".").map((x) => parseInt(x, 10) || 0);
    const pb = String(b || "").split(".").map((x) => parseInt(x, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d;
    }
    return 0;
  }
  async function extensionPageInFront() {
    try {
      const active = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (chrome.runtime.getContexts) {
        const ctx = await chrome.runtime.getContexts({ contextTypes: ["TAB", "POPUP"] });
        if (ctx.some((c) => c.contextType === "POPUP")) return true;
        const ids = new Set(active.map((t) => t.id));
        return ctx.some((c) => ids.has(c.tabId) && !(Number(c.frameId) > 0));
      }
      const origin = chrome.runtime.getURL("");
      return active.some((t) => String(t.url || t.pendingUrl || "").startsWith(origin));
    } catch (_) {
      return false;
    }
  }
  async function checkForNewVersion(deps = {}) {
    const running = chrome.runtime.getManifest();
    if (running.update_url) return { action: "store", running: running.version };
    let onDisk = "";
    try {
      const read = deps.fetchManifest || (async () => {
        const res = await fetch(chrome.runtime.getURL("manifest.json"), { cache: "no-store" });
        return res.json();
      });
      onDisk = String((await read()).version || "");
    } catch (e) {
      return { action: "error", running: running.version, error: String(e?.message || e) };
    }
    if (!onDisk || compareVersions(onDisk, running.version) <= 0) return { action: "same", running: running.version, onDisk };
    if (await (deps.inFront || extensionPageInFront)()) return { action: "busy", running: running.version, onDisk };
    await chrome.storage.local.set({ selfUpdateLast: { at: Date.now(), from: running.version, to: onDisk } });
    (deps.reload || (() => chrome.runtime.reload()))();
    return { action: "reload", running: running.version, onDisk };
  }
  function scheduleSelfUpdateCheck() {
    chrome.alarms.create(SELF_UPDATE_ALARM, { periodInMinutes: SELF_UPDATE_PERIOD_MINUTES });
  }

  // src/lib/voiceStyleLevelTable.js
  var VOICE_STYLE_LEVEL_TABLE = Object.freeze({
    "0": [0.084, 0.456],
    "1": [0.064, 0.432],
    "2": [0.075, 0.447],
    "3": [0.063, 0.53],
    "4": [0.086, 0.558],
    "5": [0.066, 0.469],
    "6": [0.066, 0.411],
    "7": [0.067, 0.466],
    "8": [0.08, 0.419],
    "9": [0.085, 0.375],
    "10": [0.071, 0.405],
    "11": [0.07, 0.584],
    "12": [0.074, 0.469],
    "13": [0.078, 0.456],
    "14": [0.078, 0.258],
    "15": [0.069, 0.458],
    "16": [0.082, 0.364],
    "17": [0.073, 0.437],
    "18": [0.073, 0.46],
    "19": [0.039, 0.546],
    "20": [0.08, 0.514],
    "21": [0.075, 0.677],
    "22": [0.053, 0.457],
    "23": [0.086, 0.417],
    "24": [0.074, 0.408],
    "25": [0.097, 0.363],
    "26": [0.067, 0.465],
    "27": [0.085, 0.327],
    "28": [0.065, 0.367],
    "29": [0.098, 0.645],
    "30": [0.1, 0.598],
    "31": [0.101, 0.409],
    "32": [0.074, 0.437],
    "33": [0.076, 0.422],
    "34": [0.072, 0.472],
    "35": [0.056, 0.252],
    "36": [0.06, 0.551],
    "37": [0.087, 0.37],
    "38": [0.1, 0.364],
    "39": [0.08, 0.542],
    "40": [0.073, 0.641],
    "41": [0.09, 0.578],
    "42": [0.081, 0.783],
    "43": [0.091, 0.41],
    "44": [0.088, 0.441],
    "45": [0.081, 0.294],
    "46": [0.084, 0.393],
    "47": [0.073, 0.387],
    "48": [0.089, 0.374],
    "49": [0.089, 0.361],
    "50": [0.07, 0.641],
    "51": [0.082, 0.489],
    "52": [0.089, 0.538],
    "53": [0.091, 0.497],
    "54": [0.067, 0.438],
    "55": [0.098, 0.508],
    "56": [0.098, 0.443],
    "57": [0.099, 0.472],
    "58": [0.084, 0.531],
    "59": [0.101, 0.46],
    "60": [0.114, 0.423],
    "61": [0.072, 0.354],
    "62": [0.092, 0.377],
    "63": [0.096, 0.375],
    "64": [0.094, 0.323],
    "65": [0.084, 0.381],
    "66": [0.085, 0.56],
    "67": [0.097, 0.396],
    "68": [0.077, 0.446],
    "69": [0.081, 0.592],
    "70": [0.072, 0.429],
    "71": [0.055, 0.569],
    "72": [0.073, 0.388],
    "73": [0.091, 0.488],
    "74": [0.086, 0.521],
    "75": [0.059, 0.321],
    "76": [0.055, 0.358],
    "77": [0.083, 0.465],
    "78": [0.075, 0.406],
    "79": [0.08, 0.341],
    "80": [0.093, 0.4],
    "81": [0.082, 0.338],
    "82": [0.084, 0.353],
    "83": [0.082, 0.372],
    "84": [0.095, 0.353],
    "85": [0.083, 0.442],
    "86": [0.058, 0.489],
    "87": [0.074, 0.416],
    "88": [0.09, 0.381],
    "89": [0.101, 0.46],
    "90": [0.074, 0.492],
    "91": [0.08, 0.391],
    "92": [0.071, 0.505],
    "93": [0.074, 0.546],
    "94": [0.084, 0.408],
    "95": [0.072, 0.472],
    "96": [0.091, 0.345],
    "97": [0.062, 0.42],
    "98": [0.052, 0.391],
    "99": [0.1, 0.538],
    "100": [0.077, 0.5],
    "101": [0.093, 0.594],
    "102": [0.09, 0.323],
    "103": [0.076, 0.316],
    "104": [0.095, 0.369],
    "105": [0.106, 0.46],
    "106": [0.088, 0.355],
    "107": [0.081, 0.395],
    "108": [0.081, 0.383],
    "109": [0.075, 0.394],
    "110": [0.078, 0.52],
    "111": [0.079, 0.457],
    "112": [0.059, 0.41],
    "113": [0.079, 0.419],
    "114": [0.071, 0.443],
    "115": [0.081, 0.413],
    "116": [0.073, 0.357],
    "117": [0.054, 0.509],
    "118": [0.102, 0.337],
    "119": [0.098, 0.453],
    "120": [0.101, 0.372],
    "121": [0.106, 0.402],
    "122": [0.088, 0.327],
    "123": [0.082, 0.404],
    "124": [0.089, 0.377],
    "125": [0.077, 0.424],
    "126": [0.061, 0.314]
  });
  var VOICE_PITCH_OFFSET_GRID = Object.freeze([-0.06, -0.03, 0, 0.03, 0.06]);
  var VOICE_STYLE_PITCH_RMS_FACTOR = Object.freeze({
    "0": [0.95, 1, 1.13, 1.16],
    "1": [0.63, 0.82, 1.08, 1.03],
    "2": [0.82, 0.93, 1.09, 1.18],
    "3": [0.63, 0.83, 1.28, 1.32],
    "4": [0.98, 1.01, 0.97, 0.95],
    "5": [0.63, 0.83, 0.99, 0.97],
    "6": [0.74, 0.85, 1.01, 1.15],
    "7": [0.67, 0.87, 1.1, 0.93],
    "8": [0.74, 0.87, 0.95, 0.91],
    "9": [0.69, 0.82, 1.18, 1.27],
    "10": [0.71, 0.88, 1.01, 1.04],
    "11": [0.81, 0.93, 1.14, 1.33],
    "12": [0.81, 0.91, 1.09, 1.26],
    "13": [0.8, 0.89, 1.05, 1.09],
    "14": [0.83, 0.94, 0.97, 1.06],
    "15": [0.98, 1.08, 1, 1.08],
    "16": [0.75, 0.88, 1.12, 1.19],
    "17": [0.81, 0.9, 0.99, 0.93],
    "18": [0.77, 0.87, 1.03, 1],
    "19": [1, 1, 1, 1],
    "20": [0.84, 0.91, 1.01, 1.01],
    "21": [0.83, 0.86, 1.18, 1.32],
    "22": [1, 1, 1, 1],
    "23": [1.01, 1.01, 1.02, 1.12],
    "24": [0.72, 0.88, 1.03, 1.06],
    "25": [0.52, 0.77, 1.17, 1.4],
    "26": [0.82, 0.88, 1.1, 1.12],
    "27": [0.75, 0.85, 1.21, 1.33],
    "28": [0.85, 0.94, 1.03, 1.09],
    "29": [0.78, 0.92, 1.05, 1.12],
    "30": [0.72, 0.87, 1.04, 1.07],
    "31": [0.8, 0.92, 1.01, 0.99],
    "32": [0.85, 0.92, 1.19, 1.19],
    "33": [0.84, 0.84, 1.07, 1.16],
    "34": [0.74, 0.88, 1.1, 1.15],
    "35": [0.85, 0.97, 1.1, 0.74],
    "36": [1, 1, 1, 1],
    "37": [0.69, 0.88, 1.19, 1.23],
    "38": [0.72, 0.79, 0.97, 0.7],
    "39": [0.88, 0.93, 1.09, 1.26],
    "40": [0.8, 0.91, 1.09, 1.19],
    "41": [0.89, 0.92, 1.05, 1.05],
    "42": [1.01, 0.99, 1.15, 1.3],
    "43": [0.69, 0.82, 1, 0.98],
    "44": [0.59, 0.74, 1.28, 1.64],
    "45": [0.59, 0.77, 1.19, 1.19],
    "46": [0.86, 0.92, 0.99, 0.87],
    "47": [0.76, 0.91, 1.24, 1.38],
    "48": [0.95, 0.98, 1, 0.99],
    "49": [1.14, 0.98, 1.01, 0.9],
    "50": [1, 1, 1, 1],
    "51": [0.95, 1.01, 1.06, 1.07],
    "52": [0.72, 0.87, 1.09, 1.13],
    "53": [0.94, 0.98, 1.05, 1.08],
    "54": [0.69, 0.88, 1.08, 1.02],
    "55": [0.96, 1.02, 1.01, 1.04],
    "56": [0.78, 0.93, 1.07, 1.2],
    "57": [0.91, 0.98, 1.04, 0.94],
    "58": [0.79, 0.88, 1, 0.95],
    "59": [0.74, 0.85, 1.16, 0.92],
    "60": [0.69, 0.89, 0.94, 0.91],
    "61": [0.55, 0.7, 1.4, 1.6],
    "62": [0.58, 0.78, 1.02, 0.87],
    "63": [0.75, 1.03, 0.73, 0.84],
    "64": [0.57, 0.8, 0.88, 0.62],
    "65": [0.74, 0.9, 1.07, 1.07],
    "66": [0.74, 0.91, 1, 1.02],
    "67": [0.91, 0.96, 1.02, 1.02],
    "68": [0.77, 0.89, 1.05, 1.18],
    "69": [0.9, 0.95, 1.05, 1.13],
    "70": [0.73, 0.87, 1.04, 0.87],
    "71": [1.02, 1.02, 1, 0.98],
    "72": [0.73, 0.83, 1.14, 1.27],
    "73": [0.69, 0.88, 1.11, 1.25],
    "74": [0.8, 0.9, 0.98, 0.87],
    "75": [0.7, 0.85, 1.15, 1.27],
    "76": [1.02, 0.96, 0.88, 0.79],
    "77": [0.88, 0.93, 1.04, 1],
    "78": [0.88, 0.95, 1, 1],
    "79": [0.99, 0.96, 1.09, 1.1],
    "80": [0.78, 0.9, 1.01, 0.92],
    "81": [0.96, 1, 1.02, 1.04],
    "82": [0.85, 0.92, 1.04, 1.06],
    "83": [0.94, 0.96, 1.01, 1.01],
    "84": [0.93, 0.98, 1.01, 1.01],
    "85": [0.86, 0.93, 1.07, 1.12],
    "86": [1, 1, 1, 1],
    "87": [0.99, 1.03, 1.01, 1.07],
    "88": [0.86, 0.99, 0.8, 0.92],
    "89": [1.17, 1.2, 0.92, 0.88],
    "90": [0.72, 0.82, 1.15, 1.16],
    "91": [0.68, 0.85, 1.14, 1.17],
    "92": [0.69, 0.79, 1.1, 1.21],
    "93": [0.84, 0.9, 1.11, 1.19],
    "94": [0.63, 0.87, 1.11, 1.12],
    "95": [0.56, 0.8, 1.08, 1.01],
    "96": [0.54, 0.76, 1.16, 1.32],
    "97": [0.84, 0.93, 1.07, 1.2],
    "98": [0.8, 0.86, 1.22, 1.36],
    "99": [0.79, 0.89, 1.04, 1.09],
    "100": [0.97, 1, 1.05, 1.12],
    "101": [0.72, 0.85, 1.18, 1.31],
    "102": [0.98, 0.99, 0.99, 1.06],
    "103": [0.88, 1.01, 1, 1.08],
    "104": [0.88, 0.89, 0.96, 1.09],
    "105": [0.93, 0.94, 0.93, 0.79],
    "106": [0.74, 0.88, 1.06, 1.17],
    "107": [1.27, 1.09, 0.84, 0.78],
    "108": [0.82, 0.97, 1.07, 0.99],
    "109": [0.77, 0.91, 1.05, 0.99],
    "110": [0.88, 0.97, 0.92, 1.01],
    "111": [0.74, 0.93, 0.98, 0.87],
    "112": [0.77, 0.87, 1.05, 1.13],
    "113": [0.67, 0.85, 1.05, 1.04],
    "114": [0.8, 0.91, 1.04, 1.25],
    "115": [0.94, 0.96, 1.05, 1.08],
    "116": [0.59, 0.8, 1.16, 1.37],
    "117": [1, 1, 1, 1],
    "118": [0.69, 0.83, 1.05, 1.04],
    "119": [0.87, 0.97, 1.01, 0.94],
    "120": [0.77, 0.93, 1.01, 0.93],
    "121": [0.77, 0.88, 1.03, 0.97],
    "122": [0.55, 0.73, 1.22, 1.31],
    "123": [0.57, 0.77, 1.19, 1.36],
    "124": [0.63, 0.8, 1.18, 1.2],
    "125": [0.67, 0.81, 1.24, 1.38],
    "126": [0.5, 0.68, 1.08, 0.94]
  });

  // src/lib/voicevoxClient.js
  var VOICEVOX_BASE_URL = "http://127.0.0.1:50021";
  function positiveTimeout(value, fallback) {
    const timeout = Number(value);
    return Number.isFinite(timeout) && timeout > 0 ? timeout : fallback;
  }
  function isExtensionPage() {
    try {
      return typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.getURL === "function" && typeof location !== "undefined" && location.protocol === "chrome-extension:";
    } catch {
      return false;
    }
  }
  function proxyTextResponse(res) {
    const raw = Number(res && res.status);
    const status = Number.isInteger(raw) && raw >= 200 && raw <= 599 ? raw : 502;
    const noBody = status === 204 || status === 205 || status === 304;
    return new Response(noBody ? null : String(res && res.text != null ? res.text : ""), { status });
  }
  async function proxyFetchFn(url, init) {
    if (isExtensionPage()) {
      return globalThis.fetch(url, init);
    }
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      return new Promise((resolve, reject) => {
        const safeInit = { ...init };
        if ("signal" in safeInit) delete safeInit.signal;
        chrome.runtime.sendMessage(
          { type: "NLS_FETCH_PROXY", url: url.toString(), init: safeInit, wantBuffer: false },
          (res) => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (!res || res.error) return reject(new Error(res?.error || "Proxy fetch failed"));
            try {
              resolve(proxyTextResponse(res));
            } catch (e) {
              reject(e);
            }
          }
        );
      });
    }
    return globalThis.fetch(url, init);
  }
  async function fetchWithTimeout(fetchFn, url, init, timeoutMs) {
    const controller = new AbortController();
    let timer = 0;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("voicevox_timeout"));
      }, timeoutMs);
    });
    try {
      return (
        /** @type {Response} */
        await Promise.race([
          Promise.resolve().then(
            () => fetchFn(url, { ...init, signal: controller.signal })
          ),
          timeout
        ])
      );
    } finally {
      clearTimeout(timer);
    }
  }
  function defaultVoicevoxAliveTimeoutMs(viaProxy) {
    return viaProxy ? 5e3 : 1500;
  }
  function classifyVoicevoxAliveFailure(input) {
    if (input?.hasFetch === false) return "no-fetch";
    const err = input?.error;
    if (err) {
      const msg = String(
        /** @type {any} */
        err?.message || err || ""
      );
      if (msg.includes("voicevox_timeout")) return "timeout";
      if (/abort/i.test(msg) || /** @type {any} */
      err?.name === "AbortError") return "timeout";
      return "refused";
    }
    const res = input?.response;
    if (res && res.ok === false) return "http-error";
    return "";
  }
  async function probeVoicevoxAlive(opts = {}) {
    const fetchFn = opts.fetchFn || proxyFetchFn;
    if (typeof fetchFn !== "function") {
      return { ok: false, reason: classifyVoicevoxAliveFailure({ hasFetch: false }) };
    }
    const baseUrl = String(opts.baseUrl || VOICEVOX_BASE_URL).replace(/\/+$/, "");
    const viaProxy = !opts.fetchFn && !isExtensionPage();
    const fallbackTimeout = defaultVoicevoxAliveTimeoutMs(viaProxy);
    try {
      const response = await fetchWithTimeout(
        fetchFn,
        `${baseUrl}/version`,
        { method: "GET" },
        positiveTimeout(opts.timeoutMs, fallbackTimeout)
      );
      if (response?.ok !== false) return { ok: true, reason: "" };
      return { ok: false, reason: classifyVoicevoxAliveFailure({ response }) };
    } catch (err) {
      return { ok: false, reason: classifyVoicevoxAliveFailure({ error: err }) };
    }
  }
  function isWhisperStyleName(styleName) {
    const name = String(styleName || "");
    return /ささやき|囁き|ウィスパ|whisper/i.test(name);
  }
  async function listVoicevoxStyleIds(opts = {}) {
    const fetchFn = opts.fetchFn || proxyFetchFn;
    if (typeof fetchFn !== "function") return [];
    const baseUrl = String(opts.baseUrl || VOICEVOX_BASE_URL).replace(/\/+$/, "");
    try {
      const response = await fetchWithTimeout(
        fetchFn,
        `${baseUrl}/speakers`,
        { method: "GET" },
        positiveTimeout(opts.timeoutMs, 3e3)
      );
      if (!response || response.ok === false) return [];
      const speakers = await response.json();
      if (!Array.isArray(speakers)) return [];
      const ids = [];
      const seen = /* @__PURE__ */ new Set();
      for (const speaker of speakers) {
        if (!speaker || typeof speaker !== "object" || !Array.isArray(speaker.styles)) {
          continue;
        }
        for (const style of speaker.styles) {
          const id = Number(style?.id);
          if (!Number.isInteger(id) || id < 0 || seen.has(id)) continue;
          if (isWhisperStyleName(style?.name)) continue;
          seen.add(id);
          ids.push(id);
        }
      }
      return ids;
    } catch {
      return [];
    }
  }

  // src/lib/voiceAssignment.js
  var DEFAULT_VOICE = Object.freeze({
    styleId: 3,
    pitchOffset: 0,
    speedOffset: 0
  });
  var PITCH_OFFSETS = Object.freeze([-0.06, -0.03, 0, 0.03, 0.06]);
  var SPEED_OFFSETS = Object.freeze([0, 0.05, 0.1]);
  function fnv1a32(value) {
    const bytes = new TextEncoder().encode(String(value ?? ""));
    let hash = 2166136261;
    for (const byte of bytes) {
      hash ^= byte;
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
  function normalizeStyleIds(styleIds) {
    if (!Array.isArray(styleIds)) return [];
    return styleIds.map((styleId) => Number(styleId)).filter((styleId) => Number.isInteger(styleId) && styleId >= 0);
  }
  function assignVoiceForUser(userKey, styleIds) {
    const styles = normalizeStyleIds(styleIds);
    if (!styles.length) return { ...DEFAULT_VOICE };
    const hash = fnv1a32(userKey);
    const styleBits = hash & 65535;
    const pitchBits = hash >>> 16 & 255;
    const speedBits = hash >>> 24 & 255;
    return {
      styleId: styles[styleBits % styles.length],
      pitchOffset: PITCH_OFFSETS[pitchBits % PITCH_OFFSETS.length],
      speedOffset: SPEED_OFFSETS[speedBits % SPEED_OFFSETS.length]
    };
  }
  function resolveVoiceForUser(userKey, overrides, styleIds) {
    const key = String(userKey ?? "");
    if (overrides && typeof overrides === "object" && Object.prototype.hasOwnProperty.call(overrides, key)) {
      const raw = (
        /** @type {Record<string, any>} */
        overrides[key]
      );
      if (raw && typeof raw === "object") {
        const fallback = assignVoiceForUser(key, styleIds);
        const styleId = Number(raw.styleId);
        const pitchOffset = Number(raw.pitchOffset);
        const speedOffset = Number(raw.speedOffset);
        return {
          styleId: Number.isFinite(styleId) ? styleId : fallback.styleId,
          pitchOffset: Number.isFinite(pitchOffset) ? pitchOffset : 0,
          speedOffset: Number.isFinite(speedOffset) ? speedOffset : 0
        };
      }
    }
    return assignVoiceForUser(key, styleIds);
  }

  // src/lib/voiceNarrowing.js
  var VOICE_NARROW_STYLE_IDS = Object.freeze([3, 2, 8, 10, 13, 14]);
  var VOICE_CAPPED_STYLE_IDS = Object.freeze([3, 2, 8, 10, 13, 14, 11, 21, 20, 46, 0, 4, 6, 1, 7, 5, 81, 82, 83, 84, 85, 66, 77, 78, 79, 80]);
  var VOICE_NARROW_MODES = Object.freeze(["off", "auto", "on"]);

  // src/lib/youtube/ytVoiceQueue.js
  var YT_VOICE_MODES = Object.freeze({
    ALL: "all",
    SELECT: "select"
  });
  var YT_VOICE_AUTO_SELECT_QUEUE_THRESHOLD = 8;
  var YT_VOICE_MAX_QUEUE_LENGTH = 25;
  var YT_DEFAULT_STYLE_IDS = VOICE_CAPPED_STYLE_IDS;
  function buildYtVoiceUserKey(channelId) {
    const clean = String(channelId || "").trim() || "anonymous";
    return clean.startsWith("yt:") ? clean : `yt:${clean}`;
  }
  function resolveYtVoiceForChannel(channelId, opts = {}) {
    const userKey = buildYtVoiceUserKey(channelId);
    const availableStyleIds = Array.isArray(opts.availableStyleIds) && opts.availableStyleIds.length > 0 ? opts.availableStyleIds : Array.from(YT_DEFAULT_STYLE_IDS);
    const currentMap = opts.assignments && typeof opts.assignments === "object" ? opts.assignments : {};
    const reused = Object.prototype.hasOwnProperty.call(currentMap, userKey);
    const res = resolveVoiceForUser(userKey, currentMap, availableStyleIds);
    const nextAssignments = reused ? currentMap : {
      ...currentMap,
      [userKey]: {
        styleId: res.styleId,
        pitchOffset: res.pitchOffset,
        speedOffset: res.speedOffset
      }
    };
    return {
      userKey,
      styleId: res.styleId,
      pitchOffset: res.pitchOffset,
      speedOffset: res.speedOffset,
      assignments: nextAssignments,
      reused
    };
  }
  function shouldReadYtComment(item, opts = {}) {
    if (!item || typeof item !== "object") return false;
    const kind = String(item.kind || "text").toLowerCase();
    const text = String(item.text || "").trim();
    const isSupportEvent = kind === "superchat" || kind === "sticker" || kind === "membership" || kind === "membership_gift";
    if (!text && !isSupportEvent) return false;
    const mode = opts.mode === YT_VOICE_MODES.SELECT ? YT_VOICE_MODES.SELECT : YT_VOICE_MODES.ALL;
    if (mode === YT_VOICE_MODES.ALL) {
      return true;
    }
    if (isSupportEvent) return true;
    const badges = Array.isArray(item.badges) ? item.badges.map((b) => String(b || "").toLowerCase()) : [];
    if (badges.includes("owner") || badges.includes("moderator") || badges.includes("member")) {
      return true;
    }
    const broadcasterName = String(opts.broadcasterName || "").trim();
    if (broadcasterName && text.toLowerCase().includes(broadcasterName.toLowerCase())) {
      return true;
    }
    return false;
  }
  function formatYtSpeechText(item) {
    if (!item || typeof item !== "object") return "";
    const kind = String(item.kind || "text").toLowerCase();
    const name = String(item.name || "").replace(/^@/, "").trim();
    const rawText = String(item.text || "").replace(/https?:\/\/\S+/g, "URL").replace(/\s+/g, " ").trim();
    const body = rawText.length > 100 ? `${rawText.slice(0, 100)}、以下略` : rawText;
    if (kind === "superchat") {
      const prefix = name ? `${name}さん、スーパーチャットありがとうございます。` : "スーパーチャットありがとうございます。";
      return body ? `${prefix}${body}` : prefix;
    }
    if (kind === "sticker") {
      return name ? `${name}さん、スーパーステッカーありがとうございます。` : "スーパーステッカーありがとうございます。";
    }
    if (kind === "membership") {
      return name ? `${name}さん、メンバー加入ありがとうございます。${body}` : body || "メンバー加入ありがとうございます。";
    }
    if (kind === "membership_gift") {
      return name ? `${name}さん、メンバーシップギフトありがとうございます。` : body || "メンバーシップギフトありがとうございます。";
    }
    return body;
  }
  function enqueueYtVoiceItem(queue, item, opts = {}) {
    const safeQueue = Array.isArray(queue) ? queue.slice() : [];
    const requestedMode = opts.mode === YT_VOICE_MODES.SELECT ? YT_VOICE_MODES.SELECT : YT_VOICE_MODES.ALL;
    const threshold = typeof opts.autoSelectThreshold === "number" && opts.autoSelectThreshold > 0 ? opts.autoSelectThreshold : YT_VOICE_AUTO_SELECT_QUEUE_THRESHOLD;
    const autoSwitched = requestedMode === YT_VOICE_MODES.ALL && safeQueue.length >= threshold;
    const effectiveMode = autoSwitched ? YT_VOICE_MODES.SELECT : requestedMode;
    const currentAssignments = opts.assignments || {};
    if (!shouldReadYtComment(item, { mode: effectiveMode, broadcasterName: opts.broadcasterName })) {
      return {
        queue: safeQueue,
        enqueued: false,
        entry: null,
        effectiveMode,
        autoSwitched,
        assignments: currentAssignments
      };
    }
    const speechText = formatYtSpeechText(item);
    if (!speechText) {
      return {
        queue: safeQueue,
        enqueued: false,
        entry: null,
        effectiveMode,
        autoSwitched,
        assignments: currentAssignments
      };
    }
    const channelKeySource = String(item?.channelId || item?.name || "anonymous");
    const voice = resolveYtVoiceForChannel(channelKeySource, {
      availableStyleIds: opts.availableStyleIds,
      assignments: currentAssignments,
      now: opts.now
    });
    const entry = {
      id: String(item.id || `voice-${Date.now()}`),
      userKey: voice.userKey,
      channelId: String(item.channelId || ""),
      name: String(item.name || ""),
      text: speechText,
      styleId: voice.styleId,
      kind: String(item.kind || "text"),
      ts: Number(item.ts || Date.now())
    };
    const nextQueue = [...safeQueue, entry];
    if (nextQueue.length > YT_VOICE_MAX_QUEUE_LENGTH) {
      nextQueue.splice(0, nextQueue.length - YT_VOICE_MAX_QUEUE_LENGTH);
    }
    return {
      queue: nextQueue,
      enqueued: true,
      entry,
      effectiveMode,
      autoSwitched,
      assignments: voice.assignments
    };
  }

  // src/lib/youtube/ytLaneAssign.js
  var YT_LANES = Object.freeze({
    RINKU: "rinku",
    KONTA: "konta",
    TANUNEE: "tanunee"
  });
  var YT_LANE_RULES = Object.freeze([
    {
      lane: YT_LANES.RINKU,
      characterName: "りんく",
      roleLabel: "配信者視点",
      description: "配信者本人・モデレーター",
      badges: Object.freeze(["owner", "moderator"]),
      kinds: Object.freeze([]),
      includeSupporterChannels: false,
      isDefault: false
    },
    {
      lane: YT_LANES.KONTA,
      characterName: "こん太",
      roleLabel: "ファン視点",
      description: "スパチャ・ステッカー・メンバー・メンバーシップギフトの人",
      badges: Object.freeze(["member"]),
      kinds: Object.freeze(["superchat", "sticker", "membership", "membership_gift", "yt_gift"]),
      includeSupporterChannels: true,
      isDefault: false
    },
    {
      lane: YT_LANES.TANUNEE,
      characterName: "たぬ姉",
      roleLabel: "案内役",
      description: "それ以外の一般コメント",
      badges: Object.freeze([]),
      kinds: Object.freeze([]),
      includeSupporterChannels: false,
      isDefault: true
    }
  ]);

  // src/lib/youtube/ytStreamStorePolicy.js
  function buildYtCommentPrimaryKey(videoId, commentId) {
    const v = String(videoId || "").trim();
    const c = String(commentId || "").trim();
    if (!v || !c) return "";
    return `${v}::${c}`;
  }
  function mergeYtStreamSummary(existing, patch, nowMs = Date.now()) {
    const prev = existing && typeof existing === "object" ? existing : {};
    const videoId = String(patch?.videoId || prev.videoId || "").trim();
    const title = String(patch?.title || prev.title || "").trim();
    const broadcasterName = String(patch?.broadcasterName || prev.broadcasterName || "").trim();
    const broadcasterChannelId = String(
      patch?.broadcasterChannelId || prev.broadcasterChannelId || ""
    ).trim();
    const broadcasterHandle = String(patch?.broadcasterHandle || prev.broadcasterHandle || "").trim();
    const broadcasterIconUrl = String(
      patch?.broadcasterIconUrl || prev.broadcasterIconUrl || ""
    ).trim();
    const plausible = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 5e7;
    const concurrentViewers = plausible(patch?.concurrentViewers) ? Math.floor(
      /** @type {number} */
      patch.concurrentViewers
    ) : plausible(prev.concurrentViewers) ? Math.floor(prev.concurrentViewers) : null;
    const prevPeak = plausible(prev.peakConcurrentViewers) ? Math.floor(prev.peakConcurrentViewers) : null;
    const peakConcurrentViewers = concurrentViewers === null ? prevPeak : Math.max(prevPeak ?? 0, concurrentViewers);
    const chatFilterLabel = String(patch?.chatFilterLabel || prev.chatFilterLabel || "").trim();
    const itemCount = typeof patch?.itemCount === "number" && Number.isFinite(patch.itemCount) && patch.itemCount >= 0 ? Math.floor(patch.itemCount) : typeof prev.itemCount === "number" && Number.isFinite(prev.itemCount) ? Math.floor(prev.itemCount) : 0;
    const okTime = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;
    const approx = patch?.startedAtApprox === true;
    let startedAt = okTime(prev.startedAt) ? Math.floor(prev.startedAt) : null;
    let startedAtApprox = prev.startedAtApprox === true;
    if (okTime(patch?.startedAt)) {
      const v = Math.floor(
        /** @type {number} */
        patch.startedAt
      );
      if (!approx) {
        startedAt = v;
        startedAtApprox = false;
      } else if (startedAt === null || v < startedAt) {
        startedAt = v;
        startedAtApprox = true;
      }
    }
    const endedAt = okTime(patch?.endedAt) ? Math.floor(
      /** @type {number} */
      patch.endedAt
    ) : okTime(prev.endedAt) ? Math.floor(prev.endedAt) : null;
    const createdAt = typeof prev.createdAt === "number" && Number.isFinite(prev.createdAt) && prev.createdAt > 0 ? prev.createdAt : nowMs;
    return {
      videoId,
      title,
      broadcasterName,
      broadcasterChannelId,
      broadcasterHandle,
      broadcasterIconUrl,
      concurrentViewers,
      peakConcurrentViewers,
      chatFilterLabel,
      itemCount,
      startedAt,
      ...startedAtApprox ? { startedAtApprox: true } : {},
      ...endedAt ? { endedAt } : {},
      createdAt,
      updatedAt: nowMs
    };
  }
  function prepareYtCommentsForIdb(videoId, incomingItems, nowMs = Date.now()) {
    const vid = String(videoId || "").trim();
    if (!vid || !Array.isArray(incomingItems) || incomingItems.length === 0) {
      return [];
    }
    const seenPks = /* @__PURE__ */ new Set();
    const records = [];
    for (let i = 0; i < incomingItems.length; i += 1) {
      const item = incomingItems[i];
      if (!item || typeof item !== "object") continue;
      const commentId = String(item.id || "").trim();
      const pk = buildYtCommentPrimaryKey(vid, commentId);
      if (!pk || seenPks.has(pk)) continue;
      seenPks.add(pk);
      records.push({
        ...item,
        id: commentId,
        videoId: vid,
        pk,
        recordedAt: typeof item.recordedAt === "number" && Number.isFinite(item.recordedAt) ? item.recordedAt : nowMs + i * 1e-3
      });
    }
    return records;
  }

  // extension-youtube/src/ytIdbStore.js
  var DB_NAME = "yt_kirameki_db";
  var DB_VERSION = 2;
  var STORE_COMMENTS = "comments";
  var INDEX_BY_VIDEO_ID = "by_videoId";
  var INDEX_BY_VIDEO_ID_RECORDED_AT = "by_videoId_recordedAt";
  var dbPromise = null;
  function resetYtCommentsDb() {
    const p = dbPromise;
    dbPromise = null;
    if (p) {
      p.then(
        (db) => {
          try {
            db.close();
          } catch {
          }
        },
        () => {
        }
      );
    }
  }
  function openYtCommentsDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          let store;
          if (!db.objectStoreNames.contains(STORE_COMMENTS)) {
            store = db.createObjectStore(STORE_COMMENTS, { keyPath: "pk" });
          } else {
            store = req.transaction.objectStore(STORE_COMMENTS);
          }
          if (store && !store.indexNames.contains(INDEX_BY_VIDEO_ID)) {
            store.createIndex(INDEX_BY_VIDEO_ID, "videoId", { unique: false });
          }
          if (store && !store.indexNames.contains(INDEX_BY_VIDEO_ID_RECORDED_AT)) {
            store.createIndex(INDEX_BY_VIDEO_ID_RECORDED_AT, ["videoId", "recordedAt"], {
              unique: false
            });
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          db.onclose = () => {
            dbPromise = null;
          };
          db.onversionchange = () => {
            dbPromise = null;
            try {
              db.close();
            } catch {
            }
          };
          resolve(db);
        };
        req.onblocked = () => {
          dbPromise = null;
        };
        req.onerror = () => {
          dbPromise = null;
          reject(req.error || new Error("idb_open_failed"));
        };
      } catch (err) {
        dbPromise = null;
        reject(err);
      }
    });
    return dbPromise;
  }
  async function appendYtStreamCommentsIdb(videoId, incomingItems) {
    const vid = String(videoId || "").trim();
    const records = prepareYtCommentsForIdb(vid, incomingItems);
    const db = await openYtCommentsDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_COMMENTS], "readwrite");
      const store = tx.objectStore(STORE_COMMENTS);
      const index = store.index(INDEX_BY_VIDEO_ID);
      const newlyAdded = [];
      let totalCount = 0;
      let idx = 0;
      const processNext = () => {
        if (idx >= records.length) {
          const countReq = index.count(IDBKeyRange.only(vid));
          countReq.onsuccess = () => {
            totalCount = Number(countReq.result || 0);
          };
          return;
        }
        const rec = records[idx];
        idx += 1;
        const getReq = store.get(rec.pk);
        getReq.onsuccess = () => {
          const existing = getReq.result;
          if (!existing) {
            store.put(rec);
            newlyAdded.push(rec);
          } else if (rec.iconUrl && !existing.iconUrl) {
            store.put({
              ...existing,
              iconUrl: rec.iconUrl
            });
          }
          processNext();
        };
        getReq.onerror = () => {
          processNext();
        };
      };
      processNext();
      tx.oncomplete = () => {
        resolve({ newlyAdded, totalCount });
      };
      tx.onerror = () => {
        reject(tx.error || new Error("idb_append_failed"));
      };
    });
  }
  async function getYtStreamCommentsByVideoId(videoId) {
    const vid = String(videoId || "").trim();
    if (!vid) return [];
    const db = await openYtCommentsDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_COMMENTS], "readonly");
      const store = tx.objectStore(STORE_COMMENTS);
      if (store.indexNames.contains(INDEX_BY_VIDEO_ID_RECORDED_AT)) {
        const index2 = store.index(INDEX_BY_VIDEO_ID_RECORDED_AT);
        const range = IDBKeyRange.bound([vid, 0], [vid, Number.MAX_SAFE_INTEGER]);
        const req2 = index2.getAll(range);
        req2.onsuccess = () => {
          resolve(Array.isArray(req2.result) ? req2.result : []);
        };
        req2.onerror = () => {
          reject(req2.error || new Error("idb_get_failed"));
        };
        return;
      }
      const index = store.index(INDEX_BY_VIDEO_ID);
      const req = index.getAll(IDBKeyRange.only(vid));
      req.onsuccess = () => {
        const list = Array.isArray(req.result) ? req.result : [];
        list.sort((a, b) => Number(a.recordedAt || 0) - Number(b.recordedAt || 0));
        resolve(list);
      };
      req.onerror = () => {
        reject(req.error || new Error("idb_get_failed"));
      };
    });
  }
  async function getYtStreamCommentsSince(videoId, afterRecordedAt = 0) {
    const vid = String(videoId || "").trim();
    if (!vid) return [];
    const lower = typeof afterRecordedAt === "number" && Number.isFinite(afterRecordedAt) && afterRecordedAt > 0 ? afterRecordedAt : 0;
    const db = await openYtCommentsDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_COMMENTS], "readonly");
      const store = tx.objectStore(STORE_COMMENTS);
      const index = store.index(INDEX_BY_VIDEO_ID_RECORDED_AT);
      const range = IDBKeyRange.bound([vid, lower], [vid, Number.MAX_SAFE_INTEGER]);
      const req = index.getAll(range);
      req.onsuccess = () => {
        resolve(Array.isArray(req.result) ? req.result : []);
      };
      req.onerror = () => {
        reject(req.error || new Error("idb_get_since_failed"));
      };
    });
  }
  async function deleteYtCommentsByPks(videoId, pks) {
    const vid = String(videoId || "").trim();
    const db = await openYtCommentsDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_COMMENTS], "readwrite");
      const store = tx.objectStore(STORE_COMMENTS);
      for (const pk of pks) store.delete(pk);
      let total = 0;
      const countReq = store.index(INDEX_BY_VIDEO_ID).count(IDBKeyRange.only(vid));
      countReq.onsuccess = () => {
        total = Number(countReq.result || 0);
      };
      tx.oncomplete = () => resolve(total);
      tx.onerror = () => reject(tx.error || new Error("idb_delete_failed"));
    });
  }

  // src/lib/youtube/ytSwitchLeakCleanup.js
  function authorKey(it) {
    const ch = String(it?.channelId || "").trim();
    if (ch) return `ch:${ch}`;
    const name = String(it?.name || it?.authorName || "").trim();
    return name ? `name:${name}` : "";
  }
  function pickSwitchLeakPks(targetItems, prevItems, windowMs = 3e3) {
    const target = Array.isArray(targetItems) ? targetItems : [];
    const prev = Array.isArray(prevItems) ? prevItems : [];
    if (!target.length || !prev.length) return [];
    let first = Infinity;
    for (const it of target) {
      const t = Number(it?.recordedAt);
      if (Number.isFinite(t) && t < first) first = t;
    }
    if (!Number.isFinite(first)) return [];
    const edge = first + windowMs;
    const prevAuthors = new Set(prev.map(authorKey).filter(Boolean));
    const laterAuthors = /* @__PURE__ */ new Set();
    for (const it of target) {
      if (Number(it?.recordedAt) > edge) {
        const k = authorKey(it);
        if (k) laterAuthors.add(k);
      }
    }
    const out = [];
    for (const it of target) {
      if (!(Number(it?.recordedAt) <= edge)) continue;
      const k = authorKey(it);
      if (!k || !prevAuthors.has(k) || laterAuthors.has(k)) continue;
      if (it?.pk) out.push(String(it.pk));
    }
    return out;
  }

  // extension-youtube/src/background-nico-relay.js
  var OPEN_COMEVIEW_MESSAGE_TYPE = "NLS_OPEN_COMEVIEW";
  var COMEVIEW_LV_RE = /^lv\d{1,15}$/;
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== OPEN_COMEVIEW_MESSAGE_TYPE) return void 0;
    if (!sender || sender.id !== chrome.runtime.id) {
      try {
        sendResponse({ ok: false });
      } catch {
      }
      return false;
    }
    const reply = (v) => {
      try {
        sendResponse(v);
      } catch {
      }
    };
    const lv = COMEVIEW_LV_RE.test(String(msg.liveId || "")) ? String(msg.liveId) : "";
    const base = chrome.runtime.getURL("comeview.html");
    const url = lv ? `${base}?lv=${lv}` : base;
    (async () => {
      try {
        await chrome.windows.create({ url, type: "popup", width: 400, height: 640 });
        reply({ ok: true });
      } catch (err) {
        reply({ ok: false, error: String(err && err.message) });
      }
    })();
    return true;
  });
  var OPEN_VENUE_MESSAGE_TYPE = "NLS_OPEN_VENUE";
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== OPEN_VENUE_MESSAGE_TYPE) return void 0;
    if (!sender || sender.id !== chrome.runtime.id) {
      try {
        sendResponse({ ok: false });
      } catch {
      }
      return false;
    }
    const reply = (v) => {
      try {
        sendResponse(v);
      } catch {
      }
    };
    const lv = COMEVIEW_LV_RE.test(String(msg.liveId || "")) ? String(msg.liveId) : "";
    const base = chrome.runtime.getURL("venue.html");
    const url = lv ? `${base}?lv=${lv}` : base;
    (async () => {
      try {
        await chrome.windows.create({ url, type: "popup", width: 1e3, height: 720 });
        reply({ ok: true });
      } catch (err) {
        reply({ ok: false, error: String(err && err.message) });
      }
    })();
    return true;
  });
  chrome.runtime.onConnect.addListener((port) => {
    if (!port || port.name !== "NLS_VOICEVOX_STREAM") return;
    if (!port.sender || port.sender.id !== chrome.runtime.id) {
      try {
        port.disconnect();
      } catch {
      }
      return;
    }
    const controller = new AbortController();
    let closed = false;
    const send = (m) => {
      if (closed) return;
      try {
        port.postMessage(m);
      } catch {
        closed = true;
        controller.abort();
      }
    };
    port.onDisconnect.addListener(() => {
      closed = true;
      controller.abort();
    });
    port.onMessage.addListener((msg) => {
      if (!msg || msg.type !== "start") return;
      let targetUrl;
      try {
        targetUrl = new URL(String(msg.url || ""));
      } catch {
        send({ type: "error", error: "Invalid URL" });
        return;
      }
      if (!(targetUrl.hostname === "127.0.0.1" && targetUrl.port === "50021" && targetUrl.pathname === "/streaming_synthesis")) {
        send({ type: "error", error: "URL not allowed" });
        return;
      }
      const init = { ...msg.init || {}, signal: controller.signal };
      fetch(targetUrl.toString(), init).then(async (res) => {
        send({ type: "head", ok: res.ok, status: res.status });
        if (!res.ok || !res.body) {
          send({ type: "end" });
          return;
        }
        const reader = res.body.getReader();
        for (; ; ) {
          const { done, value } = await reader.read();
          if (done || closed) break;
          send({ type: "chunk", data: Array.from(value) });
        }
        send({ type: "end" });
      }).catch((err) => send({ type: "error", error: String(err && err.message || err) }));
    });
  });
  var voiceEngineLastActivityAt = 0;
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== "NLS_VOICE_ENGINE_ACTIVITY" && msg.type !== "NLS_VOICE_ENGINE_QUIET") return void 0;
    if (!sender || sender.id !== chrome.runtime.id) return void 0;
    if (msg.type === "NLS_VOICE_ENGINE_ACTIVITY") voiceEngineLastActivityAt = Date.now();
    sendResponse({ quietMs: voiceEngineLastActivityAt > 0 ? Date.now() - voiceEngineLastActivityAt : 1e9 });
    return false;
  });
  var voiceReaderByLive = /* @__PURE__ */ new Map();
  var VOICE_READER_LEASE_TTL_MS = 6e3;
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== "NLS_VOICE_READER_CLAIM" && msg.type !== "NLS_VOICE_READER_RELEASE") return void 0;
    if (!sender || sender.id !== chrome.runtime.id) return void 0;
    const holder = String(msg.holder || "");
    if (msg.type === "NLS_VOICE_READER_RELEASE") {
      for (const [lv2, cur2] of voiceReaderByLive) if (cur2.holder === holder) voiceReaderByLive.delete(lv2);
      sendResponse({ ok: true });
      return false;
    }
    const lv = String(msg.liveId || "").trim().toLowerCase();
    const now = Date.now();
    const cur = voiceReaderByLive.get(lv);
    let granted = true;
    if (lv && holder) {
      if (!cur || cur.holder === holder || now - cur.at > VOICE_READER_LEASE_TTL_MS) voiceReaderByLive.set(lv, { holder, at: now });
      else granted = false;
    }
    sendResponse({ granted });
    return false;
  });
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== "NLS_FETCH_PROXY") return void 0;
    if (!sender || sender.id !== chrome.runtime.id) return void 0;
    let targetUrl;
    try {
      targetUrl = new URL(String(msg.url || ""));
    } catch {
      sendResponse({ error: "Invalid URL" });
      return true;
    }
    const allowed = targetUrl.hostname === "127.0.0.1" && targetUrl.port === "50021" || targetUrl.hostname === "127.0.0.1" && targetUrl.port === "3456" || targetUrl.hostname === "localhost" && targetUrl.port === "3456";
    if (!allowed) {
      sendResponse({ error: "URL not allowed" });
      return true;
    }
    fetch(msg.url, msg.init).then((res) => {
      if (msg.wantBuffer) {
        return res.arrayBuffer().then((buf) => ({
          ok: res.ok,
          status: res.status,
          buffer: Array.from(new Uint8Array(buf))
        }));
      } else {
        return res.text().then((text) => ({
          ok: res.ok,
          status: res.status,
          text
        }));
      }
    }).then((data) => sendResponse(data)).catch((err) => sendResponse({ error: err.message }));
    return true;
  });

  // src/lib/youtube/ytPageMeta.js
  var VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
  function parseYtVideoIdFromUrl(rawUrl) {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) return "";
    let u;
    try {
      u = new URL(rawUrl, "https://www.youtube.com");
    } catch {
      return "";
    }
    const v = String(u.searchParams.get("v") || "").trim();
    if (VIDEO_ID_RE.test(v)) return v;
    const host = u.hostname.toLowerCase();
    const segs = u.pathname.split("/").filter(Boolean);
    if (host === "youtu.be" && segs[0] && VIDEO_ID_RE.test(segs[0])) return segs[0];
    if ((segs[0] === "live" || segs[0] === "shorts") && segs[1] && VIDEO_ID_RE.test(segs[1])) {
      return segs[1];
    }
    return "";
  }

  // src/lib/voiceLightFallback.js
  var LIGHT_VOICE_PITCHES = Object.freeze([0.8, 0.95, 1.1, 1.25, 1.4]);
  var LIGHT_VOICE_RATE = 1.2;
  function pickJapaneseVoices(voices) {
    if (!Array.isArray(voices)) return [];
    const ja = voices.filter((v) => v && /^ja([-_]|$)/i.test(String(v.lang || "")));
    const local = ja.filter((v) => v.localService === true);
    const use = local.length ? local : ja;
    return [...use].sort((a, b) => String(a.name || a.voiceURI || "").localeCompare(String(b.name || b.voiceURI || "")));
  }
  function lightVoiceToneFor(userKey, voiceCount) {
    const n = Math.max(1, Math.floor(Number(voiceCount) || 0));
    if (!userKey) return { voiceIndex: 0, pitch: 1, rate: LIGHT_VOICE_RATE };
    const combos = n * LIGHT_VOICE_PITCHES.length;
    const v = assignVoiceForUser(userKey, Array.from({ length: combos }, (_, i) => i));
    const combo = Number(v.styleId) || 0;
    return {
      voiceIndex: combo % n,
      pitch: LIGHT_VOICE_PITCHES[Math.floor(combo / n) % LIGHT_VOICE_PITCHES.length],
      rate: Math.round((LIGHT_VOICE_RATE + (Number(v.speedOffset) || 0)) * 100) / 100
    };
  }

  // extension-youtube/src/background-entry.js
  var lastIngestDiagAt = 0;
  var STORAGE_KEYS = Object.freeze({
    STREAM_SUMMARIES: "yt_stream_summaries",
    ACTIVE_VIDEO_ID: "yt_active_video_id",
    VOICE_SETTINGS: "yt_voice_settings",
    VOICE_ASSIGNMENTS: "yt_voice_assignments",
    VOICE_QUEUE: "yt_voice_queue",
    VOICE_STATE: "yt_voice_state"
  });
  var BACKGROUND_READER_ENABLED = false;
  var DEFAULT_VOICE_SETTINGS = Object.freeze({
    enabled: true,
    mode: YT_VOICE_MODES.ALL,
    broadcasterNameOverride: "",
    /** VOICEVOX が追いつかない間 PC の声で読むか: 'auto'(既定) / 'off'(VOICEVOX だけで読む) */
    lightVoice: "auto",
    availableStyleIds: Array.from(YT_DEFAULT_STYLE_IDS)
  });
  var storageJobChain = Promise.resolve();
  var creatingOffscreenPromise = null;
  function runSerialized(fn) {
    const guarded = () => Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) => setTimeout(() => reject(new Error("job_timeout")), 2e4))
    ]);
    const next = (
      /** @type {Promise<any>} */
      storageJobChain.then(guarded, guarded)
    );
    storageJobChain = next.then(
      () => void 0,
      () => void 0
    );
    return next;
  }
  async function ensureOffscreenDocument() {
    try {
      if (!chrome?.offscreen?.createDocument) return false;
      if (chrome.runtime?.getContexts) {
        const contexts = await chrome.runtime.getContexts({
          contextTypes: ["OFFSCREEN_DOCUMENT"]
        });
        if (Array.isArray(contexts) && contexts.length > 0) {
          return true;
        }
      } else if (typeof chrome.offscreen.hasDocument === "function") {
        const has = await chrome.offscreen.hasDocument();
        if (has) return true;
      }
      if (!creatingOffscreenPromise) {
        creatingOffscreenPromise = chrome.offscreen.createDocument({
          url: "offscreen.html",
          reasons: ["AUDIO_PLAYBACK"],
          justification: "サイドパネルを閉じていても VOICEVOX によるチャット読み上げ音声を再生し続けるため"
        }).catch((err) => {
          const msg = String(err?.message || err || "");
          if (!msg.includes("Only a single offscreen")) {
            throw err;
          }
        }).finally(() => {
          creatingOffscreenPromise = null;
        });
      }
      await creatingOffscreenPromise;
      return true;
    } catch {
      return false;
    }
  }
  async function nudgeOffscreenDrain() {
    const ready = await ensureOffscreenDocument();
    if (!ready) return;
    try {
      chrome.runtime.sendMessage({ type: "YT_OFFSCREEN_DRAIN" }, () => {
        void chrome.runtime.lastError;
      });
    } catch {
    }
  }
  function extractVideoIdFromSender(sender) {
    return parseYtVideoIdFromUrl(String(sender?.url || "")) || parseYtVideoIdFromUrl(String(sender?.tab?.url || ""));
  }
  async function getJapaneseTtsVoices() {
    if (!chrome?.tts?.getVoices) return [];
    const raw = await new Promise((resolve) => {
      try {
        chrome.tts.getVoices((vs) => resolve(Array.isArray(vs) ? vs : []));
      } catch {
        resolve([]);
      }
    });
    return pickJapaneseVoices(
      /** @type {any[]} */
      raw.map((v) => ({
        name: String(v.voiceName || ""),
        voiceURI: String(v.voiceName || ""),
        lang: String(v.lang || ""),
        localService: v.remote !== true
      }))
    );
  }
  async function speakLightTts(text, userKey) {
    const t = String(text || "").trim();
    if (!t) return { ok: false, reason: "empty" };
    const voices = await getJapaneseTtsVoices();
    if (!voices.length) return { ok: false, reason: "no-voice" };
    const tone = lightVoiceToneFor(userKey, voices.length);
    const voice = voices[tone.voiceIndex % voices.length];
    return new Promise((resolve) => {
      let started = false;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ ok: started, reason: started ? "" : "not-started" });
      };
      const timer = setTimeout(() => {
        try {
          chrome.tts.stop();
        } catch {
        }
        finish();
      }, t.length * 400 + 5e3);
      try {
        chrome.tts.speak(
          t,
          {
            voiceName: voice.name,
            lang: voice.lang || "ja-JP",
            pitch: tone.pitch,
            rate: tone.rate,
            enqueue: false,
            onEvent: (ev) => {
              if (ev.type === "start") started = true;
              else if (["end", "interrupted", "cancelled", "error"].includes(ev.type)) {
                if (ev.type === "end") started = true;
                finish();
              }
            }
          },
          () => {
            if (chrome.runtime.lastError) finish();
          }
        );
      } catch {
        finish();
      }
    });
  }
  async function relayCommentToChatFrame(videoId, text) {
    return relayToChatFrame(videoId, { type: "YT_SEND_COMMENT_TO_FRAME", videoId, text });
  }
  async function relayToChatFrame(videoId, payload) {
    const tabs = await chrome.tabs.query({ url: ["https://www.youtube.com/*"] });
    const scored = tabs.map((t) => {
      const vid = parseYtVideoIdFromUrl(String(t.url || ""));
      let score = 0;
      if (videoId && vid === videoId) score += 10;
      if (String(t.url || "").includes("/live_chat")) score += 2;
      if (t.active) score += 1;
      return { t, score };
    }).filter((x) => x.score >= (videoId ? 10 : 1)).sort((a, b) => b.score - a.score);
    if (scored.length === 0) return { ok: false, reason: "no-tab" };
    let last = { ok: false, reason: "no-chat-frame" };
    for (const { t } of scored) {
      if (typeof t.id !== "number") continue;
      try {
        const res = await chrome.tabs.sendMessage(t.id, payload);
        if (res && res.ok) return res;
        if (res) last = res;
      } catch {
      }
    }
    return last;
  }
  function setupSidePanelBehavior() {
    try {
      if (chrome?.sidePanel?.setPanelBehavior) {
        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
        });
      }
    } catch {
    }
  }
  setupSidePanelBehavior();
  ensureOffscreenDocument();
  async function reloadExistingYtWatchTabs(reason) {
    let tabs = [];
    try {
      tabs = await chrome.tabs.query({ url: ["https://www.youtube.com/watch*", "https://www.youtube.com/live/*"] });
    } catch {
      return;
    }
    let reloaded = 0;
    for (const tab of tabs) {
      if (typeof tab.id !== "number") continue;
      try {
        await chrome.tabs.reload(tab.id);
        reloaded += 1;
      } catch {
      }
    }
    try {
      await chrome.storage.local.set({ yt_last_auto_tab_reload: { at: Date.now(), reason, tabCount: tabs.length, reloaded } });
    } catch {
    }
  }
  async function setupEmbedReferer() {
    try {
      const dnr = chrome.declarativeNetRequest;
      if (!dnr?.updateSessionRules) return;
      await dnr.updateSessionRules({
        removeRuleIds: [7101],
        addRules: [
          {
            id: 7101,
            priority: 1,
            action: {
              type: "modifyHeaders",
              requestHeaders: [{ header: "Referer", operation: "set", value: "https://www.youtube.com/" }]
            },
            condition: {
              urlFilter: "||www.youtube.com/embed/",
              resourceTypes: ["sub_frame"],
              initiatorDomains: [chrome.runtime.id]
            }
          }
        ]
      });
    } catch {
    }
  }
  void setupEmbedReferer();
  chrome.runtime.onInstalled.addListener((details) => {
    setupSidePanelBehavior();
    ensureOffscreenDocument();
    if (details && details.reason === "update") void reloadExistingYtWatchTabs("update");
  });
  chrome.runtime.onStartup?.addListener(() => {
    ensureOffscreenDocument();
  });
  try {
    scheduleSelfUpdateCheck();
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm && alarm.name === SELF_UPDATE_ALARM) void checkForNewVersion().catch(() => {
      });
    });
  } catch {
  }
  var KEY_BACKFILL_STATE = "yt_backfill_state";
  function pickBackfillVideo(summaries, state, now) {
    let best = "";
    let bestEnded = 0;
    for (const [vid, sum] of Object.entries(summaries)) {
      if (!/^[A-Za-z0-9_-]{11}$/.test(vid)) continue;
      const endedAt = Number(sum?.endedAt || 0) || (now - Number(sum?.updatedAt || now) > 20 * 6e4 ? Number(sum.updatedAt) : 0);
      if (!(endedAt > 0) || now - endedAt < 12e4) continue;
      if (now - endedAt > 7 * 24 * 36e5) continue;
      const st = state[vid] || {};
      if (st.status === "done") continue;
      if (Number(st.tries || 0) >= 48) continue;
      const wait = st.status === "running" ? 6e5 : 9e5;
      if (st.lastTryAt && now - Number(st.lastTryAt) < wait) continue;
      if (endedAt > bestEnded) {
        best = vid;
        bestEnded = endedAt;
      }
    }
    return best;
  }
  var SWITCH_LEAK_CLEANUPS = [{ key: "yt_cleanup_switch_leak_GRvNsGECdtc", target: "GRvNsGECdtc", prev: "ZcCrxy_B4fg" }];
  async function runSwitchLeakCleanups() {
    for (const job of SWITCH_LEAK_CLEANUPS) {
      try {
        const done = await chrome.storage.local.get(job.key);
        if (done && done[job.key]) continue;
        const target = await getYtStreamCommentsByVideoId(job.target);
        const prev = await getYtStreamCommentsByVideoId(job.prev);
        if (!target.length || !prev.length) continue;
        const pks = pickSwitchLeakPks(target, prev);
        const total = pks.length ? await deleteYtCommentsByPks(job.target, pks) : target.length;
        const data = await chrome.storage.local.get(STORAGE_KEYS.STREAM_SUMMARIES);
        const summaries = data && data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
        if (summaries[job.target]) {
          summaries[job.target] = { ...summaries[job.target], itemCount: total };
          await chrome.storage.local.set({ [STORAGE_KEYS.STREAM_SUMMARIES]: summaries });
        }
        await chrome.storage.local.set({ [job.key]: { at: Date.now(), removed: pks.length, total } });
      } catch {
      }
    }
  }
  void runSwitchLeakCleanups();
  var KEY_HANDLE_ICONS = "yt_handle_icons";
  var handleIconsBusy = false;
  async function resolveHandleIcons(handles) {
    if (handleIconsBusy || !handles.length) return;
    handleIconsBusy = true;
    try {
      const bag = await chrome.storage.local.get(KEY_HANDLE_ICONS);
      const map = bag && bag[KEY_HANDLE_ICONS] || {};
      let changed = false;
      for (const h of handles) {
        const k = h.toLowerCase();
        const cur = map[k];
        if (cur && (cur.icon || Date.now() - Number(cur.at || 0) < 864e5)) continue;
        let icon = "";
        try {
          const res = await fetch(`https://www.youtube.com/${encodeURIComponent(h).replace(/^%40/, "@")}`, { credentials: "omit" });
          if (res.ok) {
            const html = await res.text();
            const m = html.match(/<meta property="og:image" content="([^"]+)"/);
            const u = m ? m[1].replace(/&amp;/g, "&") : "";
            if (/^https:\/\/yt\d?\.(ggpht|googleusercontent)\.com\//.test(u)) icon = u;
          }
        } catch {
        }
        map[k] = { icon, at: Date.now() };
        changed = true;
      }
      if (changed) await chrome.storage.local.set({ [KEY_HANDLE_ICONS]: map });
    } finally {
      handleIconsBusy = false;
    }
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return false;
    if (message.type === "YT_GET_STREAM_COMMENTS") {
      if (!sender || sender.id !== chrome.runtime.id) return false;
      const vid = String(message.videoId || "");
      const after = Number(message.afterRecordedAt || 0);
      (after > 0 ? getYtStreamCommentsSince(vid, after) : getYtStreamCommentsByVideoId(vid)).then((items) => sendResponse({ ok: true, items: Array.isArray(items) ? items : [] })).catch((err) => sendResponse({ ok: false, items: [], error: String(err && err.message || err) }));
      return true;
    }
    if (message.type === "YT_GET_EXT_ASSET") {
      if (!sender || sender.id !== chrome.runtime.id) return false;
      const rel = String(message.path || "");
      if (!/^(?:images|sound)\/[\w\-./]+\.(?:png|jpe?g|gif|webp|svg|mp3|ogg|wav)$/i.test(rel) || rel.includes("..")) {
        sendResponse({ ok: false });
        return false;
      }
      (async () => {
        const res = await fetch(chrome.runtime.getURL(rel));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = new Uint8Array(await res.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i += 32768) bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 32768)));
        return { ok: true, b64: btoa(bin), mime: res.headers.get("content-type") || "" };
      })().then(sendResponse).catch((err) => sendResponse({ ok: false, error: String(err && err.message || err) }));
      return true;
    }
    if (message.type === "YT_CAPTURE_FRAME") {
      (async () => {
        const want = String(message.videoId || "");
        const tabs = await chrome.tabs.query({ url: ["https://www.youtube.com/*"] });
        const sorted = tabs.filter((t) => !String(t.url || "").includes("/live_chat")).sort((a, b) => {
          const sa = (parseYtVideoIdFromUrl(String(a.url || "")) === want ? 10 : 0) + (a.active ? 1 : 0);
          const sb = (parseYtVideoIdFromUrl(String(b.url || "")) === want ? 10 : 0) + (b.active ? 1 : 0);
          return sb - sa;
        });
        for (const t of sorted) {
          if (typeof t.id !== "number") continue;
          try {
            const res = await chrome.tabs.sendMessage(t.id, { type: "YT_CAPTURE_FRAME_IN_PAGE" }, { frameId: 0 });
            if (res) return res;
          } catch {
          }
        }
        return { ok: false, reason: "no-tab" };
      })().then((res) => sendResponse(res)).catch((err) => sendResponse({ ok: false, reason: String(err) }));
      return true;
    }
    if (message.type === "YT_SPEAK_LIGHT") {
      const payload = message.payload || {};
      speakLightTts(String(payload.text || ""), String(payload.userKey || "")).then((res) => sendResponse(res)).catch((err) => sendResponse({ ok: false, reason: String(err) }));
      return true;
    }
    if (message.type === "YT_REPORT_VOICE_ENGINE") {
      runSerialized(async () => {
        const payload = message.payload || {};
        const data = await chrome.storage.local.get([STORAGE_KEYS.VOICE_STATE]);
        const prevState = data[STORAGE_KEYS.VOICE_STATE] || {};
        const overloaded = payload.overloaded === true;
        await chrome.storage.local.set({
          [STORAGE_KEYS.VOICE_STATE]: {
            ...prevState,
            engineOverloaded: overloaded,
            lightVoiceActive: payload.lightActive === true,
            // 一度でも混雑したら「読み上げが遅い PC」として GPU の案内を出し続ける(ニコ生版 KEY_VOICE_WEAK_PC と同じ考え)
            weakPcSeen: prevState.weakPcSeen === true || overloaded,
            updatedAt: Date.now()
          }
        });
        return { ok: true };
      }).then((res) => sendResponse(res)).catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }
    if (message.type === "YT_OPEN_SUPERCHAT") {
      const videoId = String(message.videoId || "");
      relayToChatFrame(videoId, { type: "YT_OPEN_SUPERCHAT_IN_FRAME", videoId }).then((res) => sendResponse(res)).catch((err) => sendResponse({ ok: false, reason: String(err) }));
      return true;
    }
    if (message.type === "YT_SEND_COMMENT") {
      relayCommentToChatFrame(String(message.videoId || ""), String(message.text || "")).then((res) => sendResponse(res)).catch((err) => sendResponse({ ok: false, reason: String(err) }));
      return true;
    }
    if (message.type === "YT_STREAM_META") {
      runSerialized(async () => {
        const payload = message.payload || {};
        const videoId = String(payload.videoId || extractVideoIdFromSender(sender) || "").trim();
        if (!videoId) return { ok: false };
        const data = await chrome.storage.local.get([
          STORAGE_KEYS.STREAM_SUMMARIES,
          STORAGE_KEYS.ACTIVE_VIDEO_ID
        ]);
        const summaries = data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
        summaries[videoId] = mergeYtStreamSummary(
          summaries[videoId],
          {
            videoId,
            title: payload.title ? String(payload.title) : void 0,
            broadcasterName: payload.broadcasterName ? String(payload.broadcasterName) : void 0,
            broadcasterChannelId: payload.broadcasterChannelId ? String(payload.broadcasterChannelId) : void 0,
            broadcasterIconUrl: payload.broadcasterIconUrl ? String(payload.broadcasterIconUrl) : void 0,
            broadcasterHandle: payload.broadcasterHandle ? String(payload.broadcasterHandle) : void 0,
            concurrentViewers: typeof payload.concurrentViewers === "number" ? payload.concurrentViewers : void 0,
            // 別の動画と同じ開始時刻は、ページ内の移動で前の動画の欄を読んだもの→使わない
            startedAt: typeof payload.startedAt === "number" && !Object.entries(summaries).some(([vid, s]) => vid !== videoId && Number(s?.startedAt) === payload.startedAt) ? payload.startedAt : void 0,
            startedAtApprox: payload.startedAtApprox === true,
            endedAt: typeof payload.endedAt === "number" ? payload.endedAt : void 0
          },
          Date.now()
        );
        await chrome.storage.local.set({
          [STORAGE_KEYS.STREAM_SUMMARIES]: summaries,
          [STORAGE_KEYS.ACTIVE_VIDEO_ID]: videoId
        });
        return { ok: true, videoId };
      }).then((res) => sendResponse(res)).catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }
    if (message.type === "YT_HANDLE_ICONS") {
      const handles = (Array.isArray(message.handles) ? message.handles : []).map((h) => String(h || "").trim()).filter((h) => /^@[^\s/?#]{1,100}$/.test(h));
      void resolveHandleIcons(handles.slice(0, 5));
      return false;
    }
    if (message.type === "YT_LEADERBOARD") {
      const payload = message.payload || {};
      const videoId = String(payload.videoId || extractVideoIdFromSender(sender) || "").trim();
      const rows = Array.isArray(payload.rows) ? payload.rows.slice(0, 100) : [];
      if (!videoId || !rows.length) return false;
      void chrome.storage.local.set({ [`yt_leaderboard_${videoId}`]: { videoId, capturedAt: Date.now(), rows } }).catch(() => {
      });
      return false;
    }
    if (message.type === "YT_BACKFILL_NEXT") {
      runSerialized(async () => {
        const data = await chrome.storage.local.get([STORAGE_KEYS.STREAM_SUMMARIES, KEY_BACKFILL_STATE]);
        const summaries = data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
        const state = data[KEY_BACKFILL_STATE] || {};
        const now = Date.now();
        const vid = pickBackfillVideo(summaries, state, now);
        if (!vid) return { videoId: "" };
        const prev = state[vid] || {};
        state[vid] = { ...prev, status: "running", lastTryAt: now, tries: Number(prev.tries || 0) + 1 };
        await chrome.storage.local.set({ [KEY_BACKFILL_STATE]: state });
        return { videoId: vid, endedAt: Number(summaries[vid]?.endedAt || 0) };
      }).then((res) => sendResponse(res)).catch(() => sendResponse({ videoId: "" }));
      return true;
    }
    if (message.type === "YT_BACKFILL_ITEMS") {
      runSerialized(async () => {
        const payload = message.payload || {};
        const videoId = String(payload.videoId || "").trim();
        const incoming = Array.isArray(payload.items) ? payload.items : [];
        if (!videoId || !incoming.length) return { added: 0 };
        const items = incoming.filter((x) => x && x.id).map((x) => ({ ...x, recordedAt: Number(x.postedAtMs) > 0 ? Number(x.postedAtMs) : Date.now() }));
        const res = await appendYtStreamCommentsIdb(videoId, items);
        const data = await chrome.storage.local.get(STORAGE_KEYS.STREAM_SUMMARIES);
        const summaries = data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
        if (summaries[videoId] && res.newlyAdded.length) {
          summaries[videoId] = mergeYtStreamSummary(summaries[videoId], { videoId, itemCount: res.totalCount }, Date.now());
          await chrome.storage.local.set({ [STORAGE_KEYS.STREAM_SUMMARIES]: summaries });
        }
        return { added: res.newlyAdded.length, total: res.totalCount };
      }).then((res) => sendResponse(res)).catch((err) => sendResponse({ added: 0, error: String(err) }));
      return true;
    }
    if (message.type === "YT_BACKFILL_DONE") {
      runSerialized(async () => {
        const payload = message.payload || {};
        const videoId = String(payload.videoId || "").trim();
        if (!videoId) return;
        const data = await chrome.storage.local.get(KEY_BACKFILL_STATE);
        const state = data[KEY_BACKFILL_STATE] || {};
        state[videoId] = {
          ...state[videoId] || {},
          status: String(payload.status || "error"),
          finishedAt: Date.now(),
          added: Number(payload.added || 0),
          calls: Number(payload.calls || 0),
          reason: String(payload.reason || "").slice(0, 200)
        };
        await chrome.storage.local.set({ [KEY_BACKFILL_STATE]: state });
      }).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
      return true;
    }
    if (message.type === "YT_CHAT_ITEMS") {
      try {
        const tabId = sender?.tab?.id;
        const p0 = message.payload || {};
        const vidNow = String(p0.videoId || extractVideoIdFromSender(sender) || "").trim();
        if (typeof tabId === "number" && vidNow && Array.isArray(p0.items) && p0.items.length) {
          const recs = prepareYtCommentsForIdb(vidNow, p0.items);
          if (recs.length) {
            void Promise.resolve(chrome.tabs.sendMessage(tabId, { type: "YT_LIVE_ROWS", videoId: vidNow, items: recs }, { frameId: 0 })).catch(() => {
            });
          }
        }
      } catch {
      }
      runSerialized(async () => {
        const payload = message.payload || {};
        const videoId = String(payload.videoId || extractVideoIdFromSender(sender) || "").trim() || "live_default";
        const incoming = Array.isArray(payload.items) ? payload.items : [];
        const chatFilterLabel = String(payload.chatFilterLabel || "").trim();
        const data = await chrome.storage.local.get([
          STORAGE_KEYS.STREAM_SUMMARIES,
          STORAGE_KEYS.ACTIVE_VIDEO_ID,
          STORAGE_KEYS.VOICE_SETTINGS,
          STORAGE_KEYS.VOICE_ASSIGNMENTS,
          STORAGE_KEYS.VOICE_QUEUE,
          STORAGE_KEYS.VOICE_STATE
        ]);
        const summaries = data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
        const prevSummary = summaries[videoId] || null;
        const settings = {
          ...DEFAULT_VOICE_SETTINGS,
          ...data[STORAGE_KEYS.VOICE_SETTINGS] || {}
        };
        let assignments = data[STORAGE_KEYS.VOICE_ASSIGNMENTS] || {};
        let voiceQueue = Array.isArray(data[STORAGE_KEYS.VOICE_QUEUE]) ? data[STORAGE_KEYS.VOICE_QUEUE] : [];
        const prevVoiceState = data[STORAGE_KEYS.VOICE_STATE] || {};
        let voiceState = {
          ...prevVoiceState,
          effectiveMode: prevVoiceState.effectiveMode || settings.mode,
          autoSwitched: Boolean(prevVoiceState.autoSwitched),
          updatedAt: Date.now()
        };
        const broadcasterName = String(settings.broadcasterNameOverride || "").trim() || String(prevSummary?.broadcasterName || "").trim();
        const enrichedIncoming = [];
        for (const rawItem of incoming) {
          if (!rawItem || !rawItem.id) continue;
          const voice = resolveYtVoiceForChannel(rawItem.channelId || rawItem.name || "anonymous", {
            availableStyleIds: settings.availableStyleIds,
            assignments
          });
          assignments = voice.assignments;
          enrichedIncoming.push({
            ...rawItem,
            voiceUserKey: voice.userKey,
            voiceStyleId: voice.styleId,
            pitchOffset: voice.pitchOffset,
            speedOffset: voice.speedOffset,
            recordedAt: Date.now()
          });
        }
        let idbResult;
        try {
          idbResult = await appendYtStreamCommentsIdb(videoId, enrichedIncoming);
        } catch (err) {
          resetYtCommentsDb();
          try {
            idbResult = await appendYtStreamCommentsIdb(videoId, enrichedIncoming);
          } catch (err2) {
            void chrome.storage.local.set({
              yt_ingest_diag: { at: Date.now(), ok: false, videoId, error: String(err2 || err).slice(0, 200) }
            });
            throw err2;
          }
        }
        if (Date.now() - lastIngestDiagAt > 3e4) {
          lastIngestDiagAt = Date.now();
          void chrome.storage.local.set({
            yt_ingest_diag: { at: Date.now(), ok: true, videoId, received: incoming.length, added: idbResult.newlyAdded.length }
          });
        }
        let enqueuedAny = false;
        if (BACKGROUND_READER_ENABLED && settings.enabled) {
          for (const newItem of idbResult.newlyAdded) {
            const prevLen = voiceQueue.length;
            const enq = enqueueYtVoiceItem(voiceQueue, newItem, {
              mode: settings.mode,
              broadcasterName,
              availableStyleIds: settings.availableStyleIds,
              assignments
            });
            voiceQueue = enq.queue;
            if (voiceQueue.length > prevLen) {
              enqueuedAny = true;
            }
            assignments = enq.assignments;
            voiceState = {
              ...voiceState,
              effectiveMode: enq.effectiveMode,
              autoSwitched: enq.autoSwitched,
              updatedAt: Date.now()
            };
          }
        }
        summaries[videoId] = mergeYtStreamSummary(
          prevSummary,
          {
            videoId,
            chatFilterLabel: chatFilterLabel || void 0,
            itemCount: idbResult.totalCount
          },
          Date.now()
        );
        const updates = {
          [STORAGE_KEYS.STREAM_SUMMARIES]: summaries,
          [STORAGE_KEYS.VOICE_ASSIGNMENTS]: assignments,
          [STORAGE_KEYS.VOICE_QUEUE]: voiceQueue,
          [STORAGE_KEYS.VOICE_STATE]: voiceState
        };
        if (videoId !== "live_default" || !data[STORAGE_KEYS.ACTIVE_VIDEO_ID]) {
          updates[STORAGE_KEYS.ACTIVE_VIDEO_ID] = videoId;
        }
        await chrome.storage.local.set(updates);
        if (BACKGROUND_READER_ENABLED && settings.enabled && (enqueuedAny || voiceQueue.length > 0)) {
          nudgeOffscreenDrain();
        }
        return {
          ok: true,
          addedCount: idbResult.newlyAdded.length,
          totalCount: idbResult.totalCount,
          videoId
        };
      }).then((res) => sendResponse(res)).catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }
    if (message.type === "YT_SHIFT_VOICE_QUEUE") {
      runSerialized(async () => {
        const data = await chrome.storage.local.get([
          STORAGE_KEYS.VOICE_SETTINGS,
          STORAGE_KEYS.VOICE_QUEUE
        ]);
        const settings = {
          ...DEFAULT_VOICE_SETTINGS,
          ...data[STORAGE_KEYS.VOICE_SETTINGS] || {}
        };
        const queue = Array.isArray(data[STORAGE_KEYS.VOICE_QUEUE]) ? data[STORAGE_KEYS.VOICE_QUEUE] : [];
        if (!BACKGROUND_READER_ENABLED || !settings.enabled || queue.length === 0) {
          return { ok: true, entry: null, remaining: queue.length, enabled: BACKGROUND_READER_ENABLED && Boolean(settings.enabled) };
        }
        const [entry, ...rest] = queue;
        await chrome.storage.local.set({ [STORAGE_KEYS.VOICE_QUEUE]: rest });
        return {
          ok: true,
          entry,
          remaining: rest.length,
          enabled: true,
          lightVoice: settings.lightVoice === "off" ? "off" : "auto"
        };
      }).then((res) => sendResponse(res)).catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }
    if (message.type === "YT_REPORT_VOICEVOX_STATUS") {
      runSerialized(async () => {
        const payload = message.payload || {};
        const online = Boolean(payload.online);
        const reason = String(payload.reason || (online ? "ok" : "unreachable"));
        const availableStyleIds = Array.isArray(payload.availableStyleIds) && payload.availableStyleIds.length > 0 ? payload.availableStyleIds : null;
        const data = await chrome.storage.local.get([
          STORAGE_KEYS.VOICE_SETTINGS,
          STORAGE_KEYS.VOICE_STATE,
          STORAGE_KEYS.VOICE_QUEUE
        ]);
        const currentSettings = {
          ...DEFAULT_VOICE_SETTINGS,
          ...data[STORAGE_KEYS.VOICE_SETTINGS] || {}
        };
        if (availableStyleIds) {
          currentSettings.availableStyleIds = availableStyleIds;
        }
        const queue = Array.isArray(data[STORAGE_KEYS.VOICE_QUEUE]) ? data[STORAGE_KEYS.VOICE_QUEUE] : [];
        const isOverThreshold = currentSettings.enabled !== false && currentSettings.mode === YT_VOICE_MODES.ALL && queue.length >= YT_VOICE_AUTO_SELECT_QUEUE_THRESHOLD;
        const prevState = data[STORAGE_KEYS.VOICE_STATE] || {};
        const nextState = {
          ...prevState,
          effectiveMode: isOverThreshold ? YT_VOICE_MODES.SELECT : currentSettings.mode,
          autoSwitched: isOverThreshold,
          voicevoxOnline: online,
          voicevoxReason: reason,
          availableStyleCount: currentSettings.availableStyleIds.length,
          voicevoxCheckedAt: Date.now(),
          updatedAt: Date.now()
        };
        await chrome.storage.local.set({
          [STORAGE_KEYS.VOICE_SETTINGS]: currentSettings,
          [STORAGE_KEYS.VOICE_STATE]: nextState
        });
        return { ok: true, state: nextState };
      }).then((res) => sendResponse(res)).catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }
    if (message.type === "YT_REPORT_VOICE_SPOKEN") {
      runSerialized(async () => {
        const payload = message.payload || {};
        const data = await chrome.storage.local.get([STORAGE_KEYS.VOICE_STATE]);
        const prevState = data[STORAGE_KEYS.VOICE_STATE] || {};
        const nextState = {
          ...prevState,
          lastSpokenSummary: String(payload.lastSpokenSummary || ""),
          lastSpokenAt: Date.now(),
          updatedAt: Date.now()
        };
        await chrome.storage.local.set({
          [STORAGE_KEYS.VOICE_STATE]: nextState
        });
        return { ok: true };
      }).then((res) => sendResponse(res)).catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }
    if (message.type === "YT_RECHECK_VOICEVOX") {
      runSerialized(async () => {
        await ensureOffscreenDocument();
        const probe = await probeVoicevoxAlive({ baseUrl: VOICEVOX_BASE_URL });
        const online = Boolean(probe.ok);
        const reason = probe.ok ? "ok" : probe.reason === "timeout" ? "timeout" : "unreachable";
        let styles = [];
        if (online) {
          styles = await listVoicevoxStyleIds({ baseUrl: VOICEVOX_BASE_URL });
        }
        const data = await chrome.storage.local.get([
          STORAGE_KEYS.VOICE_SETTINGS,
          STORAGE_KEYS.VOICE_STATE,
          STORAGE_KEYS.VOICE_QUEUE
        ]);
        const currentSettings = {
          ...DEFAULT_VOICE_SETTINGS,
          ...data[STORAGE_KEYS.VOICE_SETTINGS] || {}
        };
        if (styles.length > 0) {
          currentSettings.availableStyleIds = styles;
        }
        const queue = Array.isArray(data[STORAGE_KEYS.VOICE_QUEUE]) ? data[STORAGE_KEYS.VOICE_QUEUE] : [];
        const isOverThreshold = currentSettings.enabled !== false && currentSettings.mode === YT_VOICE_MODES.ALL && queue.length >= YT_VOICE_AUTO_SELECT_QUEUE_THRESHOLD;
        const prevState = data[STORAGE_KEYS.VOICE_STATE] || {};
        const nextState = {
          ...prevState,
          effectiveMode: isOverThreshold ? YT_VOICE_MODES.SELECT : currentSettings.mode,
          autoSwitched: isOverThreshold,
          voicevoxOnline: online,
          voicevoxReason: reason,
          availableStyleCount: currentSettings.availableStyleIds.length,
          voicevoxCheckedAt: Date.now(),
          updatedAt: Date.now()
        };
        await chrome.storage.local.set({
          [STORAGE_KEYS.VOICE_SETTINGS]: currentSettings,
          [STORAGE_KEYS.VOICE_STATE]: nextState
        });
        if (online && currentSettings.enabled && queue.length > 0) {
          nudgeOffscreenDrain();
        }
        return { ok: true, online, reason, state: nextState };
      }).then((res) => sendResponse(res)).catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }
    if (message.type === "YT_UPDATE_VOICE_SETTINGS") {
      runSerialized(async () => {
        const patch = message.payload || {};
        const data = await chrome.storage.local.get([
          STORAGE_KEYS.VOICE_SETTINGS,
          STORAGE_KEYS.VOICE_QUEUE,
          STORAGE_KEYS.VOICE_STATE
        ]);
        const current = {
          ...DEFAULT_VOICE_SETTINGS,
          ...data[STORAGE_KEYS.VOICE_SETTINGS] || {}
        };
        const next = {
          ...current,
          ...patch
        };
        const queue = Array.isArray(data[STORAGE_KEYS.VOICE_QUEUE]) ? data[STORAGE_KEYS.VOICE_QUEUE] : [];
        const nextQueue = next.enabled === false ? [] : queue;
        const isOverThreshold = next.enabled !== false && next.mode === YT_VOICE_MODES.ALL && nextQueue.length >= YT_VOICE_AUTO_SELECT_QUEUE_THRESHOLD;
        const prevState = data[STORAGE_KEYS.VOICE_STATE] || {};
        const updates = {
          [STORAGE_KEYS.VOICE_SETTINGS]: next,
          [STORAGE_KEYS.VOICE_STATE]: {
            ...prevState,
            effectiveMode: isOverThreshold ? YT_VOICE_MODES.SELECT : next.mode,
            autoSwitched: isOverThreshold,
            availableStyleCount: Array.isArray(next.availableStyleIds) ? next.availableStyleIds.length : prevState.availableStyleCount || YT_DEFAULT_STYLE_IDS.length,
            updatedAt: Date.now()
          }
        };
        if (next.enabled === false) {
          updates[STORAGE_KEYS.VOICE_QUEUE] = [];
        }
        await chrome.storage.local.set(updates);
        if (next.enabled && nextQueue.length > 0) {
          nudgeOffscreenDrain();
        }
        return { ok: true, settings: next };
      }).then((res) => sendResponse(res)).catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }
    if (message.type === "YT_CLEAR_VOICE_QUEUE") {
      runSerialized(async () => {
        const data = await chrome.storage.local.get([
          STORAGE_KEYS.VOICE_SETTINGS,
          STORAGE_KEYS.VOICE_STATE
        ]);
        const settings = {
          ...DEFAULT_VOICE_SETTINGS,
          ...data[STORAGE_KEYS.VOICE_SETTINGS] || {}
        };
        const prevState = data[STORAGE_KEYS.VOICE_STATE] || {};
        await chrome.storage.local.set({
          [STORAGE_KEYS.VOICE_QUEUE]: [],
          [STORAGE_KEYS.VOICE_STATE]: {
            ...prevState,
            effectiveMode: settings.mode,
            autoSwitched: false,
            updatedAt: Date.now()
          }
        });
        return { ok: true };
      }).then((res) => sendResponse(res)).catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }
    return false;
  });
})();
