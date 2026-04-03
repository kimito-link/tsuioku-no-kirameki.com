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
  function commentsStorageKey(liveId) {
    const id = String(liveId || "").trim().toLowerCase();
    return `nls_comments_${id}`;
  }

  // src/lib/userRooms.js
  var UNKNOWN_USER_KEY = "__unknown__";
  function displayUserLabel(userKey) {
    if (!userKey || userKey === UNKNOWN_USER_KEY) {
      return "ID\u672A\u53D6\u5F97\uFF08DOM\u306B\u6295\u7A3F\u8005\u60C5\u5831\u306A\u3057\uFF09";
    }
    const s = String(userKey);
    if (s.length <= 18) return s;
    return `${s.slice(0, 8)}\u2026${s.slice(-6)}`;
  }
  function aggregateCommentsByUser(entries) {
    const list = Array.isArray(entries) ? entries : [];
    const map = /* @__PURE__ */ new Map();
    for (const e of list) {
      const uid = e?.userId ? String(e.userId).trim() : "";
      const userKey = uid || UNKNOWN_USER_KEY;
      const capturedAt = Number(e?.capturedAt || 0);
      const text = String(e?.text || "").trim();
      if (!map.has(userKey)) {
        map.set(userKey, {
          userKey,
          count: 0,
          lastAt: 0,
          lastText: ""
        });
      }
      const row = map.get(userKey);
      row.count += 1;
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
  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
    for (const r of rooms) {
      const li = document.createElement("li");
      const label = displayUserLabel(r.userKey);
      const isUnknown = r.userKey === UNKNOWN_USER_KEY;
      const hint = isUnknown ? `<div class="room-preview" style="font-size:10px;color:#9ca3af">\u30DA\u30FC\u30B8\u304C\u6295\u7A3F\u8005ID\u3092DOM\u306B\u51FA\u3057\u3066\u3044\u306A\u3044\u3068\u304D\u306F\u3053\u3053\u306B\u307E\u3068\u307E\u308A\u307E\u3059\u3002\u62E1\u5F35\u3092\u66F4\u65B0\u3057\u3066\u518D\u8AAD\u307F\u8FBC\u307F\u3059\u308B\u304B\u3001\u958B\u767A\u8005\u30C4\u30FC\u30EB\u3067\u30B3\u30E1\u30F3\u30C8\u884C\u306EHTML\u3092\u5171\u6709\u3059\u308B\u3068\u6539\u5584\u3067\u304D\u307E\u3059\u3002</div>` : "";
      li.innerHTML = `
      <div class="room-meta">
        <span class="room-name" title="${escapeHtml(r.userKey)}">${escapeHtml(label)}</span>
        <span class="room-count">${r.count}\u4EF6</span>
      </div>
      ${r.lastText ? `<div class="room-preview">${escapeHtml(r.lastText)}</div>` : ""}
      ${hint}
    `;
      ul.appendChild(li);
    }
  }
  async function refresh() {
    const liveEl = $("liveId");
    const countEl = $("count");
    const toggle = (
      /** @type {HTMLInputElement} */
      $("recordToggle")
    );
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || "";
    if (!isNicoLiveWatchUrl(url)) {
      liveEl.textContent = "\uFF08\u30CB\u30B3\u751Fwatch\u30DA\u30FC\u30B8\u3067\u958B\u3044\u3066\u304F\u3060\u3055\u3044\uFF09";
      countEl.textContent = "-";
      toggle.disabled = true;
      renderUserRooms([]);
      return;
    }
    toggle.disabled = false;
    const lv = extractLiveIdFromUrl(url);
    liveEl.textContent = lv || "-";
    const bag = await chrome.storage.local.get(KEY_RECORDING);
    toggle.checked = bag[KEY_RECORDING] === true;
    if (!lv) {
      countEl.textContent = "-";
      renderUserRooms([]);
      return;
    }
    const key = commentsStorageKey(lv);
    const data = await chrome.storage.local.get(key);
    const arr = Array.isArray(data[key]) ? data[key] : [];
    countEl.textContent = String(arr.length);
    renderUserRooms(arr);
  }
  function initPopup() {
    const toggle = (
      /** @type {HTMLInputElement} */
      $("recordToggle")
    );
    toggle.addEventListener("change", async () => {
      await chrome.storage.local.set({ [KEY_RECORDING]: toggle.checked });
      await refresh();
    });
    refresh();
    chrome.storage.onChanged.addListener((_, area) => {
      if (area === "local") refresh();
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPopup);
  } else {
    initPopup();
  }
})();
