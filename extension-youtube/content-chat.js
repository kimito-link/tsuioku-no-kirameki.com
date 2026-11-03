// content-chat.js — YouTube Live チャット欄 DOM の監視・コメント取得バンドル
/* eslint-disable */
(() => {
  // src/lib/htmlText.js
  function safeHttpUrl(v) {
    const s = String(v == null ? "" : v).trim();
    return /^https?:\/\//i.test(s) ? s : "";
  }

  // src/lib/youtube/ytChatParse.js
  var BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var CURRENCY_PREFIX_MAP = [
    ["NT$", "TWD"],
    ["HK$", "HKD"],
    ["CA$", "CAD"],
    ["A$", "AUD"],
    ["NZ$", "NZD"],
    ["MX$", "MXN"],
    ["US$", "USD"],
    ["R$", "BRL"],
    ["S$", "SGD"],
    ["￥", "JPY"],
    ["¥", "JPY"],
    ["$", "USD"],
    ["₩", "KRW"],
    ["€", "EUR"],
    ["£", "GBP"],
    ["₹", "INR"],
    ["₱", "PHP"],
    ["₫", "VND"],
    ["฿", "THB"]
  ];
  function decodeBase64Ascii(input) {
    const clean = String(input || "").replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+/=]/g, "");
    if (!clean) return "";
    let out = "";
    let buffer = 0;
    let bits = 0;
    for (let i = 0; i < clean.length; i += 1) {
      const ch = clean[i];
      if (ch === "=") break;
      const val = BASE64_CHARS.indexOf(ch);
      if (val < 0) continue;
      buffer = buffer << 6 | val;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out += String.fromCharCode(buffer >> bits & 255);
      }
    }
    return out;
  }
  function extractChannelIdFromContextMenuParams(params) {
    if (!params || typeof params !== "string") return "";
    try {
      const step1 = decodeBase64Ascii(params.trim());
      if (!step1) return "";
      let candidates = step1.match(/UC[A-Za-z0-9_-]{22}/g) || [];
      let decodedUri = step1;
      try {
        decodedUri = decodeURIComponent(step1);
      } catch {
        decodedUri = step1;
      }
      const step2 = decodeBase64Ascii(decodedUri);
      if (step2) {
        const innerMatches = step2.match(/UC[A-Za-z0-9_-]{22}/g);
        if (innerMatches && innerMatches.length > 0) {
          candidates = innerMatches;
        }
      }
      if (candidates.length === 0) return "";
      return candidates[candidates.length - 1];
    } catch {
      return "";
    }
  }
  function parsePurchaseAmount(raw) {
    const s = String(raw || "").replace(/\u00a0/g, " ").trim();
    if (!s) return { amount: 0, currency: "" };
    let currency = "";
    let rest = s;
    const isoMatch = rest.match(/^([A-Z]{3})\s*([0-9.,]+)$/);
    if (isoMatch) {
      currency = isoMatch[1];
      rest = isoMatch[2];
    } else {
      for (const [symbol, code] of CURRENCY_PREFIX_MAP) {
        if (rest.startsWith(symbol)) {
          currency = code;
          rest = rest.slice(symbol.length).trim();
          break;
        }
      }
    }
    if (!currency) return { amount: 0, currency: "" };
    const numStr = rest.replace(/,/g, "").trim();
    const amount = Number.parseFloat(numStr);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { amount: 0, currency: "" };
    }
    return { amount, currency };
  }
  function extractMessageTextWithEmoji(root) {
    if (!root) return "";
    let out = "";
    const walk = (node) => {
      if (!node) return;
      const nodeType = node.nodeType;
      if (nodeType === 3) {
        out += node.nodeValue || "";
        return;
      }
      if (nodeType === 1) {
        const tag = String(node.tagName || "").toLowerCase();
        if (tag === "img") {
          const alt = typeof node.getAttribute === "function" && (node.getAttribute("alt") || node.getAttribute("shared-tooltip-text")) || "";
          out += alt;
          return;
        }
        const children = node.childNodes;
        if (children && typeof children.length === "number") {
          for (let i = 0; i < children.length; i += 1) {
            walk(children[i]);
          }
        }
      }
    };
    walk(root);
    return out.replace(/\s+/g, " ").trim();
  }
  function extractBadges(el) {
    const badgeSet = /* @__PURE__ */ new Set();
    const authorType = String(el.getAttribute?.("author-type") || "").trim().toLowerCase();
    if (authorType === "owner" || authorType === "moderator" || authorType === "member") {
      badgeSet.add(authorType);
    }
    const badgeEls = el.querySelectorAll?.("yt-live-chat-author-badge-renderer") || [];
    for (let i = 0; i < badgeEls.length; i += 1) {
      const b = badgeEls[i];
      const t = String(b.getAttribute?.("type") || "").trim().toLowerCase();
      if (t) badgeSet.add(t);
    }
    return Array.from(badgeSet);
  }
  function extractAuthorIconUrl(el) {
    if (!el || typeof el.querySelectorAll !== "function") return "";
    const normalizeCandidateUrl = (raw) => {
      const trimmed = String(raw || "").trim();
      if (!trimmed) return "";
      const withProtocol = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
      return safeHttpUrl(withProtocol);
    };
    const prioritySelectors = [
      "#author-photo img",
      "yt-img-shadow#author-photo img",
      "#avatar img",
      "yt-avatar-shape img",
      ".yt-spec-avatar-shape img",
      "img.yt-spec-avatar-shape__image"
    ];
    for (const sel of prioritySelectors) {
      const imgs = el.querySelectorAll(sel) || [];
      for (let i = 0; i < imgs.length; i += 1) {
        const img = imgs[i];
        const rawSrc = img?.getAttribute?.("src") || (typeof img?.src === "string" ? img.src : "");
        const valid = normalizeCandidateUrl(rawSrc);
        if (valid) return valid;
      }
    }
    const allImgs = el.querySelectorAll("#img, yt-img-shadow img, img") || [];
    for (let i = 0; i < allImgs.length; i += 1) {
      const img = allImgs[i];
      if (!img) continue;
      if (typeof img.closest === "function" && img.closest(
        "#gift-image, #sticker, #sticker-bumper, #currency-img, #chat-badges, #chip-badges, #prepend-chat-badges, yt-live-chat-author-badge-renderer, #message, #message-v2"
      )) {
        continue;
      }
      const cls = String(img.getAttribute?.("class") || "");
      if (cls.includes("emoji")) continue;
      const rawSrc = img.getAttribute?.("src") || (typeof img.src === "string" ? img.src : "");
      const valid = normalizeCandidateUrl(rawSrc);
      if (!valid) continue;
      if (valid.includes("/youtube/img/pdg/gift/") || valid.includes("/notoemoji/")) {
        continue;
      }
      return valid;
    }
    return "";
  }
  var YT_MAX_PLAUSIBLE_VIEWERS = 5e7;
  function extractYtWatchConcurrentViewersFromText(rawText) {
    if (typeof rawText !== "string" || !rawText.trim()) return null;
    const normalized = rawText.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 65248)).replace(/，/g, ",").replace(/．/g, ".").replace(/\s+/g, " ").trim();
    const NUM = "(?<![0-9,.])((?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,9})(?:\\.[0-9]+)?)";
    const jaMatch = normalized.match(new RegExp(`${NUM}\\s*(万|億)?\\s*人(?:が)?\\s*視聴中`));
    if (jaMatch) {
      const base = Number.parseFloat(jaMatch[1].replace(/,/g, ""));
      if (!Number.isFinite(base) || base < 0) return null;
      const unit = jaMatch[2] || "";
      const mult = unit === "億" ? 1e8 : unit === "万" ? 1e4 : 1;
      const v = Math.round(base * mult);
      return v <= YT_MAX_PLAUSIBLE_VIEWERS ? v : null;
    }
    const enMatch = normalized.match(new RegExp(`${NUM}\\s*([KkMm])?\\s*watching(?:\\s+now)?\\b`, "i"));
    if (enMatch) {
      const base = Number.parseFloat(enMatch[1].replace(/,/g, ""));
      if (!Number.isFinite(base) || base < 0) return null;
      const unit = (enMatch[2] || "").toUpperCase();
      const mult = unit === "M" ? 1e6 : unit === "K" ? 1e3 : 1;
      const v = Math.round(base * mult);
      return v <= YT_MAX_PLAUSIBLE_VIEWERS ? v : null;
    }
    return null;
  }
  function extractChannelId(el, name) {
    const direct = el.getAttribute?.("data-author-external-channel-id") || el.getAttribute?.("author-external-channel-id") || "";
    if (direct && direct.trim()) return direct.trim();
    const clickableRaw = el.getAttribute?.("whole-message-clickable") || "";
    if (clickableRaw) {
      try {
        const parsed = JSON.parse(clickableRaw);
        const params = parsed?.liveChatItemContextMenuEndpoint?.params || "";
        const fromParams = extractChannelIdFromContextMenuParams(params);
        if (fromParams) return fromParams;
      } catch {
      }
    }
    const linkEl = el.querySelector?.('a[href*="/channel/UC"]');
    const href = linkEl?.getAttribute?.("href") || "";
    const m = href.match(/\/channel\/(UC[A-Za-z0-9_-]{22})/);
    if (m) return m[1];
    if (name) {
      return `handle:${name}`;
    }
    return "";
  }
  function parseYtChatElement(el) {
    try {
      if (!el || typeof el.tagName !== "string") return null;
      const tag = el.tagName.toLowerCase();
      let kind = "";
      if (tag === "yt-live-chat-text-message-renderer") {
        kind = "text";
      } else if (tag === "yt-live-chat-paid-message-renderer") {
        kind = "superchat";
      } else if (tag === "yt-live-chat-paid-sticker-renderer") {
        kind = "sticker";
      } else if (tag === "yt-live-chat-membership-item-renderer") {
        kind = "membership";
      } else if (tag === "ytd-sponsorships-live-chat-gift-purchase-announcement-renderer" || tag === "yt-live-chat-sponsorships-gift-purchase-announcement-renderer" || tag === "yt-gift-message-view-model") {
        kind = "membership_gift";
      } else {
        return null;
      }
      const rawId = String(el.getAttribute?.("id") || "").trim();
      const authorEl = el.querySelector?.("#author-name, #author-name-v2");
      const name = String(authorEl?.textContent || "").replace(/\s+/g, " ").trim();
      if (!rawId && !name) return null;
      const channelId = extractChannelId(el, name);
      const iconUrl = extractAuthorIconUrl(el);
      const badges = extractBadges(el);
      let text = "";
      const msgEl = el.querySelector?.("#message, #message-v2");
      if (msgEl) {
        text = extractMessageTextWithEmoji(msgEl);
      }
      if (!text && kind === "membership") {
        const subEl = el.querySelector?.("#header-subtext, #header-primary-text");
        text = extractMessageTextWithEmoji(subEl);
      } else if (!text && kind === "membership_gift") {
        const giftEl = el.querySelector?.("#primary-text, #header-primary-text");
        text = extractMessageTextWithEmoji(giftEl);
      } else if (!text && kind === "sticker") {
        const stickerImg = el.querySelector?.("#sticker img, #sticker-bumper img");
        const alt = String(stickerImg?.getAttribute?.("alt") || "").trim();
        text = alt || "スーパーステッカー";
      }
      let amount = 0;
      let currency = "";
      if (kind === "superchat" || kind === "sticker") {
        const amountEl = el.querySelector?.("#purchase-amount, #purchase-amount-chip");
        const parsedAmount = parsePurchaseAmount(amountEl?.textContent || "");
        amount = parsedAmount.amount;
        currency = parsedAmount.currency;
      }
      if (!name && !text && amount <= 0) {
        return null;
      }
      const tsEl = el.querySelector?.("#timestamp");
      const ts = String(tsEl?.textContent || "").replace(/\s+/g, " ").trim();
      const id = rawId || `${kind}:${channelId || name}:${ts || text.slice(0, 32)}`;
      return {
        id,
        channelId,
        name,
        iconUrl,
        text,
        kind,
        amount,
        currency,
        badges,
        ts
      };
    } catch {
      return null;
    }
  }

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
  function isYtWatchLikeUrl(rawUrl) {
    try {
      const u = new URL(rawUrl, "https://www.youtube.com");
      const p = u.pathname;
      if (p.startsWith("/live_chat")) return false;
      return p === "/watch" || p.startsWith("/live/");
    } catch {
      return false;
    }
  }
  function pickYtBroadcasterIconUrl(candidates) {
    if (!Array.isArray(candidates)) return "";
    for (const raw of candidates) {
      const s = String(raw || "").trim();
      if (!s) continue;
      let abs = s;
      if (abs.startsWith("//")) abs = `https:${abs}`;
      if (!/^https:\/\//i.test(abs)) continue;
      let host = "";
      try {
        host = new URL(abs).hostname.toLowerCase();
      } catch {
        continue;
      }
      if (!/(ggpht\.com|googleusercontent\.com|ytimg\.com)$/.test(host)) continue;
      return abs.replace(/=s(\d{2,3})-/, (m, n) => Number(n) < 176 ? "=s176-" : m);
    }
    return "";
  }

  // extension-youtube/src/content-chat-entry.js
  var AUTO_ALL_CHAT_KEY = "yt_auto_all_chat_v1";
  var CHAT_ITEM_SELECTOR = [
    "yt-live-chat-text-message-renderer",
    "yt-live-chat-paid-message-renderer",
    "yt-live-chat-paid-sticker-renderer",
    "yt-live-chat-membership-item-renderer",
    "ytd-sponsorships-live-chat-gift-purchase-announcement-renderer",
    "yt-live-chat-sponsorships-gift-purchase-announcement-renderer",
    "yt-gift-message-view-model"
  ].join(", ");
  var MAX_SEEN_IDS = 5e3;
  function resolveCurrentVideoId() {
    const own = parseYtVideoIdFromUrl(String(window.location.href || ""));
    if (own) return own;
    try {
      if (window.top && window.top !== window) {
        const top = parseYtVideoIdFromUrl(String(window.top.location.href || ""));
        if (top) return top;
      }
    } catch {
    }
    return parseYtVideoIdFromUrl(String(document.referrer || ""));
  }
  function readChatFilterLabel() {
    try {
      const labelEl = document.querySelector(
        "yt-sort-filter-sub-menu-renderer #label, yt-live-chat-header-renderer #trigger #label"
      );
      return String(labelEl?.textContent || "").replace(/\s+/g, " ").trim();
    } catch {
      return "";
    }
  }
  function safeSendMessage(msg) {
    try {
      if (!chrome?.runtime?.id) return;
      chrome.runtime.sendMessage(msg, () => {
        void chrome.runtime.lastError;
      });
    } catch {
    }
  }
  function collectImgUrlCandidates(img) {
    if (!img) return [];
    const out = [];
    const anyImg = (
      /** @type {any} */
      img
    );
    out.push(String(anyImg.currentSrc || ""));
    out.push(String(anyImg.src || ""));
    out.push(String(img.getAttribute("src") || ""));
    const srcset = String(img.getAttribute("srcset") || "");
    if (srcset) out.push(srcset.split(",").pop()?.trim().split(/\s+/)[0] || "");
    out.push(String(img.getAttribute("data-src") || ""));
    out.push(String(img.getAttribute("data-thumb") || ""));
    return out;
  }
  function readBroadcasterIconUrl() {
    const selectors = [
      "ytd-watch-metadata ytd-video-owner-renderer #avatar img",
      "ytd-watch-metadata #owner yt-img-shadow img",
      "ytd-watch-metadata #owner img",
      "#owner #avatar img",
      "ytd-video-owner-renderer #avatar img",
      "ytd-video-owner-renderer img",
      "#upload-info #avatar img",
      "ytd-channel-name ~ * img"
    ];
    const candidates = [];
    for (const sel of selectors) {
      try {
        document.querySelectorAll(sel).forEach((img) => {
          candidates.push(...collectImgUrlCandidates(img));
        });
      } catch {
      }
    }
    try {
      const metaImg = document.querySelector('link[itemprop="thumbnailUrl"][href*="ggpht"], meta[itemprop="image"][content*="ggpht"]');
      if (metaImg) candidates.push(String(metaImg.getAttribute("href") || metaImg.getAttribute("content") || ""));
    } catch {
    }
    return pickYtBroadcasterIconUrl(candidates);
  }
  function visibleTextOf(root) {
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let out = "";
      const clipCache = /* @__PURE__ */ new Map();
      const rootRect = root.getBoundingClientRect();
      const clipRectOf = (start) => {
        for (let e = start; e && e !== root.parentElement; e = e.parentElement) {
          if (clipCache.has(e)) return clipCache.get(e) || null;
          const st = window.getComputedStyle(e);
          if (st.overflow !== "visible" || st.overflowY !== "visible") {
            const r = e.getBoundingClientRect();
            clipCache.set(e, r);
            return r;
          }
        }
        return null;
      };
      let node;
      while (node = walker.nextNode()) {
        const text = String(node.nodeValue || "");
        if (!text.trim()) {
          out += text;
          continue;
        }
        const parent = node.parentElement;
        if (parent && window.getComputedStyle(parent).visibility === "hidden") continue;
        range.selectNodeContents(node);
        const r = range.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        const clip = clipRectOf(parent) || rootRect;
        if (clip && clip.height > 0) {
          const overlap = Math.min(r.bottom, clip.bottom) - Math.max(r.top, clip.top);
          if (overlap < r.height / 2) continue;
        }
        out += text;
      }
      return out.replace(/\s+/g, " ").replace(/([0-9,.])\s+(?=[0-9,.])/g, "$1").trim();
    } catch {
      return "";
    }
  }
  function readConcurrentViewers() {
    const selectors = [
      "ytd-watch-metadata #description #info",
      "ytd-watch-metadata #info-container",
      "ytd-watch-info-text",
      "ytd-watch-metadata #view-count",
      "#view-count",
      "ytd-video-primary-info-renderer #count",
      "ytd-video-view-count-renderer",
      "#info"
    ];
    for (const sel of selectors) {
      let nodes;
      try {
        nodes = document.querySelectorAll(sel);
      } catch {
        continue;
      }
      for (let i = 0; i < nodes.length; i += 1) {
        const el = nodes[i];
        const texts = [visibleTextOf(el), String(el.getAttribute("aria-label") || "")];
        el.querySelectorAll("[aria-label]").forEach((x) => texts.push(String(x.getAttribute("aria-label") || "")));
        texts.push(String(
          /** @type {HTMLElement} */
          el.innerText || ""
        ));
        texts.push(String(el.textContent || ""));
        for (const t of texts) {
          const parsed = extractYtWatchConcurrentViewersFromText(t);
          if (parsed !== null) return parsed;
        }
      }
    }
    return null;
  }
  function setupWatchPageMetaObserver() {
    const sendMeta = () => {
      if (!isYtWatchLikeUrl(String(window.location.href || ""))) return;
      const videoId = resolveCurrentVideoId();
      if (!videoId) return;
      const titleEl = document.querySelector(
        "ytd-watch-metadata h1 yt-formatted-string, h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string"
      );
      const rawTitle = String(titleEl?.textContent || "").replace(/\s+/g, " ").trim() || String(document.title || "").replace(/\s*-\s*YouTube$/i, "").replace(/^\(\d+\)\s*/, "").trim();
      const ownerNameEl = document.querySelector(
        "ytd-watch-metadata #owner #channel-name a, #owner #channel-name a, ytd-video-owner-renderer #channel-name a, #upload-info #channel-name a"
      );
      const broadcasterName = String(ownerNameEl?.textContent || "").replace(/\s+/g, " ").trim();
      let broadcasterChannelId = "";
      try {
        const links = document.querySelectorAll(
          "ytd-watch-metadata #owner a[href], #owner a[href], ytd-video-owner-renderer a[href]"
        );
        for (let i = 0; i < links.length && !broadcasterChannelId; i += 1) {
          const m = String(links[i].getAttribute("href") || "").match(/\/channel\/(UC[A-Za-z0-9_-]{22})/);
          if (m) broadcasterChannelId = m[1];
        }
        if (!broadcasterChannelId) {
          const metaCh = document.querySelector('meta[itemprop="channelId"], meta[itemprop="identifier"][content^="UC"]');
          const c = String(metaCh?.getAttribute("content") || "");
          if (/^UC[A-Za-z0-9_-]{22}$/.test(c)) broadcasterChannelId = c;
        }
      } catch {
      }
      safeSendMessage({
        type: "YT_STREAM_META",
        payload: {
          videoId,
          title: rawTitle,
          broadcasterName,
          broadcasterChannelId,
          broadcasterIconUrl: readBroadcasterIconUrl(),
          concurrentViewers: readConcurrentViewers()
        }
      });
    };
    sendMeta();
    setTimeout(sendMeta, 1500);
    setTimeout(sendMeta, 4e3);
    setInterval(sendMeta, 5e3);
    window.addEventListener("yt-navigate-finish", () => {
      setTimeout(sendMeta, 800);
      setTimeout(sendMeta, 2500);
    });
  }
  function setupAutoAllChat() {
    let attempts = 0;
    let done = false;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const tryOnce = async () => {
      if (done || attempts >= 6) return;
      attempts += 1;
      let enabled = true;
      try {
        const got = await chrome.storage.local.get(AUTO_ALL_CHAT_KEY);
        enabled = got?.[AUTO_ALL_CHAT_KEY] !== false;
      } catch {
      }
      if (!enabled) {
        done = true;
        return;
      }
      const trigger = (
        /** @type {HTMLElement | null} */
        document.querySelector(
          "yt-live-chat-header-renderer yt-sort-filter-sub-menu-renderer #trigger, yt-live-chat-header-renderer #trigger"
        )
      );
      if (!trigger) return;
      trigger.click();
      await sleep(350);
      const items = Array.from(
        document.querySelectorAll(
          "tp-yt-iron-dropdown tp-yt-paper-listbox a, tp-yt-iron-dropdown tp-yt-paper-listbox tp-yt-paper-item, yt-sort-filter-sub-menu-renderer tp-yt-paper-listbox a"
        )
      ).filter((el) => (
        /** @type {HTMLElement} */
        el.offsetParent !== null || el.closest("tp-yt-iron-dropdown")
      ));
      const uniq = items.filter((el) => !items.some((o) => o !== el && o.contains(el)));
      if (uniq.length < 2) {
        trigger.click();
        return;
      }
      const allItem = (
        /** @type {HTMLElement} */
        uniq[1]
      );
      const selected = allItem.classList.contains("iron-selected") || allItem.getAttribute("aria-selected") === "true" || !!allItem.querySelector('.iron-selected, [aria-selected="true"]');
      if (selected) {
        trigger.click();
        done = true;
        return;
      }
      allItem.click();
      done = true;
    };
    setTimeout(tryOnce, 1500);
    setTimeout(tryOnce, 4e3);
    setTimeout(tryOnce, 8e3);
    setTimeout(tryOnce, 15e3);
  }
  function setupLiveChatObserver() {
    const seenIds = /* @__PURE__ */ new Set();
    const seenWithIconIds = /* @__PURE__ */ new Set();
    let pendingBatch = [];
    let flushTimer = null;
    let lastFilterLabel = "";
    const rememberId = (id) => {
      seenIds.add(id);
      if (seenIds.size > MAX_SEEN_IDS) {
        const first = seenIds.values().next().value;
        if (first) seenIds.delete(first);
      }
    };
    const rememberIconId = (id) => {
      seenWithIconIds.add(id);
      if (seenWithIconIds.size > MAX_SEEN_IDS) {
        const first = seenWithIconIds.values().next().value;
        if (first) seenWithIconIds.delete(first);
      }
    };
    const flushBatch = () => {
      flushTimer = null;
      const filterLabel = readChatFilterLabel();
      if (pendingBatch.length === 0 && filterLabel === lastFilterLabel) return;
      lastFilterLabel = filterLabel;
      const items = pendingBatch;
      pendingBatch = [];
      safeSendMessage({
        type: "YT_CHAT_ITEMS",
        payload: {
          videoId: resolveCurrentVideoId(),
          chatFilterLabel: filterLabel,
          items
        }
      });
    };
    const queueFlush = () => {
      if (flushTimer !== null) return;
      flushTimer = setTimeout(flushBatch, 150);
    };
    const inspectElement = (el, retryCount = 0) => {
      if (!el || typeof el.tagName !== "string") return;
      const rawId = String(el.getAttribute?.("id") || "").trim();
      if (rawId && seenWithIconIds.has(rawId)) return;
      const parsed = parseYtChatElement(el);
      if (!parsed) {
        if (retryCount < 2) {
          setTimeout(() => inspectElement(el, retryCount + 1), 150);
        }
        return;
      }
      if (!seenIds.has(parsed.id)) {
        rememberId(parsed.id);
        if (parsed.iconUrl) {
          rememberIconId(parsed.id);
        } else if (retryCount < 3) {
          setTimeout(() => inspectElement(el, retryCount + 1), 200 * (retryCount + 1));
        }
        pendingBatch.push(parsed);
        queueFlush();
        return;
      }
      if (parsed.iconUrl && !seenWithIconIds.has(parsed.id)) {
        rememberIconId(parsed.id);
        pendingBatch.push(parsed);
        queueFlush();
      } else if (!parsed.iconUrl && retryCount < 3) {
        setTimeout(() => inspectElement(el, retryCount + 1), 250 * (retryCount + 1));
      }
    };
    const scanAllExisting = (root = document) => {
      try {
        const nodes = root.querySelectorAll(CHAT_ITEM_SELECTOR);
        for (let i = 0; i < nodes.length; i += 1) {
          inspectElement(nodes[i], 0);
        }
        queueFlush();
      } catch {
      }
    };
    scanAllExisting(document);
    const observer = new MutationObserver((mutations) => {
      for (let i = 0; i < mutations.length; i += 1) {
        const added = mutations[i].addedNodes;
        if (!added) continue;
        for (let j = 0; j < added.length; j += 1) {
          const node = (
            /** @type {any} */
            added[j]
          );
          if (!node || node.nodeType !== 1) continue;
          if (typeof node.matches === "function" && node.matches(CHAT_ITEM_SELECTOR)) {
            inspectElement(node, 0);
          }
          if (typeof node.querySelectorAll === "function") {
            const children = node.querySelectorAll(CHAT_ITEM_SELECTOR);
            for (let k = 0; k < children.length; k += 1) {
              inspectElement(children[k], 0);
            }
          }
        }
      }
    });
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
    setInterval(() => {
      scanAllExisting(document);
    }, 2e3);
  }
  function setupCommentSendBridge() {
    if (String(window.location.pathname || "").startsWith("/live_chat_replay")) return;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    try {
      chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (!msg || msg.type !== "YT_SEND_COMMENT_TO_FRAME") return void 0;
        const want = String(msg.videoId || "");
        const mine = resolveCurrentVideoId();
        if (want && mine && want !== mine) return void 0;
        (async () => {
          const text = String(msg.text || "").replace(/\s+/g, " ").trim().slice(0, 200);
          if (!text) return { ok: false, reason: "empty" };
          const input = (
            /** @type {HTMLElement | null} */
            document.querySelector(
              "yt-live-chat-text-input-field-renderer #input[contenteditable], #input.yt-live-chat-text-input-field-renderer, yt-live-chat-message-input-renderer #input[contenteditable]"
            )
          );
          if (!input) {
            const signIn = document.querySelector(
              'yt-live-chat-message-input-renderer #sign-in, yt-live-chat-restricted-participation-renderer, yt-live-chat-message-input-renderer yt-button-renderer a[href*="ServiceLogin"]'
            );
            return { ok: false, reason: signIn ? "not-signed-in" : "no-input" };
          }
          input.focus();
          try {
            document.execCommand("selectAll", false);
            document.execCommand("delete", false);
            document.execCommand("insertText", false, text);
          } catch {
          }
          if (String(input.textContent || "").trim() !== text) {
            input.textContent = text;
            input.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
          }
          await sleep(120);
          const btn = (
            /** @type {HTMLButtonElement | null} */
            document.querySelector(
              "yt-live-chat-message-input-renderer #send-button button, #send-button yt-button-renderer button, #send-button button"
            )
          );
          if (!btn) return { ok: false, reason: "no-send-button" };
          if (btn.disabled || btn.getAttribute("aria-disabled") === "true") {
            return { ok: false, reason: "send-disabled" };
          }
          btn.click();
          await sleep(400);
          const left = String(input.textContent || "").trim();
          return { ok: left === "" || left !== text, reason: left === text ? "still-in-box" : "" };
        })().then((r) => sendResponse(r)).catch((e) => sendResponse({ ok: false, reason: String(e) }));
        return true;
      });
    } catch {
    }
  }
  function setupVideoFrameCapture() {
    try {
      chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (!msg || msg.type !== "YT_CAPTURE_FRAME_IN_PAGE") return void 0;
        try {
          const video = (
            /** @type {HTMLVideoElement | null} */
            document.querySelector("#movie_player video.html5-main-video, video.html5-main-video, #movie_player video")
          );
          if (!video || !video.videoWidth) {
            sendResponse({ ok: false, reason: "no-video" });
            return void 0;
          }
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            sendResponse({ ok: false, reason: "no-canvas" });
            return void 0;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          sendResponse({ ok: true, dataUrl: canvas.toDataURL("image/png"), currentTime: video.currentTime });
        } catch (e) {
          sendResponse({ ok: false, reason: String(e) });
        }
        return void 0;
      });
    } catch {
    }
  }
  function init() {
    const path = String(window.location.pathname || "");
    if (path.startsWith("/live_chat")) {
      setupLiveChatObserver();
      if (!path.startsWith("/live_chat_replay")) setupAutoAllChat();
      setupCommentSendBridge();
    } else if (window.top === window) {
      setupWatchPageMetaObserver();
      setupVideoFrameCapture();
    }
  }
  init();
})();
