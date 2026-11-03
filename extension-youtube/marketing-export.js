// marketing-export.js — ニコ生版 marketing-export-entry.js(本物)+ YouTube の記録を読む入口のバンドル
/* eslint-disable */
(() => {
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
      kinds: Object.freeze(["superchat", "sticker", "membership", "membership_gift"]),
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

  // src/lib/htmlText.js
  function safeHttpUrl(v) {
    const s = String(v == null ? "" : v).trim();
    return /^https?:\/\//i.test(s) ? s : "";
  }

  // extension-youtube/src/ytIdbStore.js
  var DB_NAME = "yt_kirameki_db";
  var DB_VERSION = 2;
  var STORE_COMMENTS = "comments";
  var INDEX_BY_VIDEO_ID = "by_videoId";
  var INDEX_BY_VIDEO_ID_RECORDED_AT = "by_videoId_recordedAt";
  var dbPromise = null;
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

  // src/lib/youtube/ytPostedAt.js
  function parseYtChatClock(ts) {
    const s = String(ts || "").replace(/\s+/g, " ").trim();
    if (!s) return null;
    const m = s.match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    let h = Number(m[1]);
    const min = Number(m[2]);
    if (!(h >= 0 && h <= 23 && min >= 0 && min <= 59)) return null;
    const pm = /PM|午後/i.test(s);
    const am = /AM|午前/i.test(s);
    if (pm || am) {
      if (h > 12) return null;
      if (h === 12) h = 0;
      if (pm) h += 12;
    }
    return { h, m: min };
  }
  function ytPostedAtFromClock(ts, recordedAt) {
    const rec = Number(recordedAt);
    if (!Number.isFinite(rec) || rec <= 0) return rec;
    const c = parseYtChatClock(ts);
    if (!c) return rec;
    const d = new Date(rec);
    d.setHours(c.h, c.m, 0, 0);
    let t = d.getTime();
    if (t > rec + 6e4) t -= 24 * 36e5;
    if (rec - t <= 9e4) return rec;
    if (rec - t > 12 * 36e5) return rec;
    return t;
  }

  // src/lib/youtube/ytWording.js
  var RULES = [
    [
      "ニコニコ公式のギフト貢献度ランキング（上位）を表示します。ギフトを投げた人がいない配信では空になります（広告ポイントとは別系統です）。",
      "YouTube のトップファン（チャットでの応援の XP の順位・上位）を表示します。チャット欄のトップファンの画面から読み取ります。"
    ],
    ["公式の貢献度ランキング（niconico の表示に準拠）", "YouTube 公式のトップファン（XP の順位）"],
    ["ギフト貢献度", "トップファン"],
    // 数字のあとの単位「貢」→ XP(例: 410貢 → 410 XP)
    [/(\d[\d,]*)\s*貢(?![献])/g, "$1 XP"],
    ["ニコ生の応援コメントを、このPCで見える化", "YouTube の応援コメントを、このPCで見える化"],
    ["ニコニコ生放送 トップ", "YouTube トップ"],
    ["ニコ生の視聴ページの右下に", "YouTube の視聴ページの右下に"],
    ["ニコ生の画面改修でパネルが", "YouTube の画面改修でパネルが"],
    ["ニコ生公式の表示は変わりません", "YouTube 公式の表示は変わりません"]
  ];
  var QUICK = /貢|ニコ/;
  function ytWording(text) {
    const v = String(text ?? "");
    if (!QUICK.test(v)) return v;
    let out = v;
    for (const [from, to] of RULES) {
      out = typeof from === "string" ? out.split(from).join(to) : out.replace(from, to);
    }
    return out;
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

  // extension-youtube/src/ytGiftToNico.js
  var JPY_PER_UNIT = (
    /** @type {Record<string, number>} */
    {
      JPY: 1,
      USD: 150,
      EUR: 165,
      GBP: 195,
      CAD: 110,
      AUD: 100,
      NZD: 90,
      CHF: 175,
      SGD: 115,
      HKD: 19,
      TWD: 4.7,
      KRW: 0.11,
      CNY: 21,
      PHP: 2.6,
      THB: 4.3,
      IDR: 95e-4,
      MYR: 33,
      INR: 1.8,
      BRL: 27,
      MXN: 8
    }
  );
  function ytAmountToPoints(amount, currency) {
    const a = Number(amount);
    if (!Number.isFinite(a) || a <= 0) return 0;
    const rate = JPY_PER_UNIT[String(currency || "").toUpperCase()] ?? 1;
    return Math.max(0, Math.round(a * rate));
  }
  var ITEM_NAME = (
    /** @type {Record<string, string>} */
    {
      superchat: "スーパーチャット",
      sticker: "スーパーステッカー",
      membership: "メンバー加入",
      membership_gift: "メンバーシップギフト"
    }
  );
  function ytAmountLabel(amount, currency) {
    const a = Number(amount);
    if (!Number.isFinite(a) || a <= 0) return "";
    const cur = String(currency || "").toUpperCase();
    if (/^[A-Z]{3}$/.test(cur)) {
      try {
        return new Intl.NumberFormat("ja-JP", { style: "currency", currency: cur }).format(a);
      } catch {
      }
    }
    return `${a.toLocaleString("ja-JP")}${cur ? ` ${cur}` : ""}`;
  }
  function isYtPaidKind(kind) {
    return Object.prototype.hasOwnProperty.call(ITEM_NAME, String(kind || ""));
  }
  function buildYtGiftBags(entries, lv, opts = {}) {
    const now = Number(opts.now) || Date.now();
    const beginSec = Number(opts.startedAt) > 0 ? Math.floor(Number(opts.startedAt) / 1e3) : 0;
    const paid = (Array.isArray(entries) ? entries : []).filter((e) => isYtPaidKind(String(e?.ytKind || "")));
    const events = [];
    const history2 = [];
    const byUser = /* @__PURE__ */ new Map();
    const byItem = /* @__PURE__ */ new Map();
    let totalPoints = 0;
    for (const e of paid) {
      const uid = String(e.userId || "").trim();
      const nickname = String(e.nickname || "").trim();
      const kind = String(e.ytKind || "");
      const baseItemName = ITEM_NAME[kind];
      const amountLabel = ytAmountLabel(Number(e.ytAmount || 0), String(e.ytCurrency || ""));
      const itemName = amountLabel ? `${baseItemName} ${amountLabel}` : baseItemName;
      const point = ytAmountToPoints(Number(e.ytAmount || 0), String(e.ytCurrency || ""));
      const at = Number(e.ytPostedAt) || Number(e.capturedAt) || now;
      const pubSec = Math.floor(at / 1e3);
      totalPoints += point;
      events.push({
        userId: uid,
        nickname,
        itemId: kind,
        itemName,
        point,
        message: String(e.text || ""),
        contributionRank: null,
        capturedAt: at
      });
      const offsetSec = beginSec > 0 ? Math.max(0, pubSec - beginSec) : 0;
      const h = Math.floor(offsetSec / 3600);
      const m = Math.floor(offsetSec % 3600 / 60);
      const s = offsetSec % 60;
      history2.push({
        itemName,
        senderName: nickname || "名無し",
        points: point,
        time: beginSec > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : "—",
        sortKey: beginSec > 0 ? offsetSec : pubSec,
        thumbnailUrl: "",
        senderAvatarUrl: String(e.avatarUrl || ""),
        userId: uid,
        kokenHistoryId: `yt:${String(e.id || "")}`,
        publishedAt: pubSec,
        contribution: point,
        capturedAt: at
      });
      const item = byItem.get(baseItemName) || { itemName: baseItemName, count: 0, thumbnailUrl: "" };
      item.count += 1;
      byItem.set(baseItemName, item);
      if (!uid) continue;
      const u = byUser.get(uid) || {
        userId: uid,
        nickname: nickname || uid,
        avatarUrl: "",
        throwCount: 0,
        totalPoints: 0,
        capturedAt: at
      };
      u.throwCount += 1;
      u.totalPoints += point;
      if (at > u.capturedAt) u.capturedAt = at;
      if (e.avatarUrl) u.avatarUrl = String(e.avatarUrl);
      if (nickname) u.nickname = nickname;
      byUser.set(uid, u);
    }
    history2.sort((a, b) => b.sortKey - a.sortKey);
    const users = [...byUser.values()];
    const ranked = [...users].sort((a, b) => b.totalPoints - a.totalPoints || b.throwCount - a.throwCount);
    return {
      count: paid.length,
      totalPoints,
      giftUsers: users.map((u) => ({
        userId: u.userId,
        nickname: u.nickname,
        capturedAt: u.capturedAt,
        throwCount: u.throwCount
      })),
      giftEvents: events,
      subApp: history2.length ? {
        liveId: lv,
        capturedAt: now,
        source: "youtube",
        history: history2,
        totalCounts: [...byItem.values()].sort((a, b) => b.count - a.count),
        officialTotalPoint: totalPoints,
        officialRemaining: 0
      } : null,
      throws: users.length ? users.map((u) => ({
        userId: u.userId,
        nickname: u.nickname,
        throwCount: u.throwCount,
        totalPoints: u.totalPoints,
        capturedAt: u.capturedAt,
        ...u.avatarUrl ? { avatarUrl: u.avatarUrl } : {}
      })) : null,
      koken: ranked.length ? {
        liveId: lv,
        capturedAt: now,
        lastOk: true,
        lastStatus: 200,
        rows: ranked.map((u, i) => ({
          rank: i + 1,
          name: u.nickname,
          contribution: u.totalPoints,
          isAnonymous: false,
          thumbnailUrl: u.avatarUrl,
          userPageUrl: `https://www.nicovideo.jp/user/${u.userId}`
        }))
      } : null
    };
  }

  // extension-youtube/src/ytNicoShim.js
  var KEY_YT_SUMMARIES = "yt_stream_summaries";
  var COMMENTS_PREFIX = "nls_comments_";
  var TAIL_PREFIX = "nls_ctail_";
  var GIFT_KEY_PREFIXES = (
    /** @type {Array<[string, string]>} */
    [
      ["nls_gift_users_", "giftUsers"],
      ["nls_gift_events_", "giftEvents"],
      ["nls_gift_subapp_history_", "subApp"],
      ["nls_gift_history_throws_", "throws"],
      ["nls_koken_api_contrib_", "koken"]
    ]
  );
  try {
    const u = new URL(window.location.href);
    if (!/\/sidepanel\.html$/.test(u.pathname)) throw new Error("not_sidepanel");
    if (u.searchParams.get("inline") !== "1" || u.searchParams.get("dock") !== "sidepanel") {
      u.searchParams.set("inline", "1");
      u.searchParams.set("dock", "sidepanel");
      history.replaceState(null, "", u.href);
    }
  } catch {
  }
  var videoIdByLv = /* @__PURE__ */ new Map();
  var lvByVideoId = /* @__PURE__ */ new Map();
  function pseudoLvForVideoId(videoId) {
    const id = String(videoId || "");
    if (!id) return "";
    const known = lvByVideoId.get(id);
    if (known) return known;
    let h1 = 2166136261;
    let h2 = 16777619;
    for (let i = 0; i < id.length; i += 1) {
      const c = id.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ c, 16777629) >>> 0;
    }
    const n = (h1 % 1e6 * 1e6 + h2 % 1e6) % 1e12;
    const lv = `lv${String(9 * 1e11 + n % 1e11)}`;
    lvByVideoId.set(id, lv);
    videoIdByLv.set(lv, id);
    return lv;
  }
  function videoIdForPseudoLv(lv) {
    return videoIdByLv.get(String(lv || "").toLowerCase()) || "";
  }
  function mapTab(tab) {
    if (!tab || typeof tab !== "object") return tab;
    const url = String(tab.url || tab.pendingUrl || "");
    if (!isYtWatchLikeUrl(url)) return tab;
    const vid = parseYtVideoIdFromUrl(url);
    if (!vid) return tab;
    const lv = pseudoLvForVideoId(vid);
    return { ...tab, url: `https://live.nicovideo.jp/watch/${lv}`, pendingUrl: void 0, __ytUrl: url };
  }
  var ytKeyByNumericUid = /* @__PURE__ */ new Map();
  var numericUidByYtKey = /* @__PURE__ */ new Map();
  function numericUidForYtKey(ytKey) {
    const key = String(ytKey || "");
    if (!key) return "";
    const known = numericUidByYtKey.get(key);
    if (known) return known;
    let h1 = 2654435761;
    let h2 = 2246822519;
    for (let i = 0; i < key.length; i += 1) {
      const c = key.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ c, 3266489917) >>> 0;
    }
    let n = (h1 % 1e5 * 1e4 + h2 % 1e4) % 1e9;
    let uid = String(8e9 + n);
    while (ytKeyByNumericUid.has(uid) && ytKeyByNumericUid.get(uid) !== key) {
      n = (n + 1) % 1e9;
      uid = String(8e9 + n);
    }
    numericUidByYtKey.set(key, uid);
    ytKeyByNumericUid.set(uid, key);
    return uid;
  }
  function ytKeyForNumericUid(uid) {
    return ytKeyByNumericUid.get(String(uid || "")) || "";
  }
  function ytChannelUrlForNumericUid(uid) {
    const key = ytKeyForNumericUid(uid);
    if (/^UC[A-Za-z0-9_-]{22}$/.test(key)) return `https://www.youtube.com/channel/${key}`;
    const h = key.startsWith("handle:@") ? key.slice("handle:@".length) : "";
    return /^[A-Za-z0-9._-]{3,30}$/.test(h) ? `https://www.youtube.com/@${h}` : "";
  }
  var ytIconByNumericUid = /* @__PURE__ */ new Map();
  var ucByNameHint = /* @__PURE__ */ new Map();
  function ytIconForNumericUid(uid) {
    return ytIconByNumericUid.get(String(uid || "")) || "";
  }
  function ytRecordToNicoEntry(r, i, lv, personKey) {
    const channelId = String(r?.channelId || "").trim();
    const name = String(r?.name || "").trim();
    const key = personKey || channelId || (name ? `name:${name}` : "");
    const at = Number(r?.recordedAt || 0) || Date.now();
    return {
      id: String(r?.id || r?.pk || `yt${i}`),
      liveId: lv,
      commentNo: String(i + 1),
      text: String(r?.text || ""),
      userId: numericUidForYtKey(key),
      ytChannelId: /^UC/.test(key) ? key : channelId,
      nickname: name,
      avatarUrl: String(r?.iconUrl || ""),
      capturedAt: at,
      // チャット欄の時刻表示から求めた「書かれた時刻」(受け取った時刻とずれるのは開いたときに残っていた分)
      ytPostedAt: ytPostedAtFromClock(String(r?.ts || ""), at),
      ytKind: String(r?.kind || "text"),
      ytAmount: Number(r?.amount || 0),
      ytCurrency: String(r?.currency || "")
    };
  }
  function ytSummaryToNicoSnapshot(sum, videoId, tabTitle) {
    const lv = pseudoLvForVideoId(videoId);
    const viewers = typeof sum?.concurrentViewers === "number" ? sum.concurrentViewers : NaN;
    const startedAt = Number(sum?.startedAt || 0) || Number(sum?.createdAt || 0);
    const ucId = String(sum?.broadcasterChannelId || "");
    const handle = String(sum?.broadcasterHandle || "");
    const ucFromRecords = !ucId && handle ? ucByNameHint.get(normName(handle)) || "" : "";
    const chId = ucId || ucFromRecords;
    const bKey = chId || (handle ? `handle:${handle}` : "");
    const bUid = bKey ? numericUidForYtKey(bKey) : "";
    const bIcon = String(sum?.broadcasterIconUrl || "") || ytIconForNumericUid(bUid);
    if (bUid && bIcon) ytIconByNumericUid.set(bUid, bIcon);
    return {
      title: tabTitle || String(sum?.title || ""),
      url: `https://live.nicovideo.jp/watch/${lv}`,
      liveId: lv,
      broadcastTitle: String(sum?.title || ""),
      broadcasterName: String(sum?.broadcasterName || ""),
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      tags: [],
      startAtText: "",
      links: [],
      metas: [],
      scripts: [],
      noopenerLinks: [],
      broadcasterUserId: bUid,
      broadcasterPageUrl: chId ? `https://www.youtube.com/channel/${chId}` : handle ? `https://www.youtube.com/${encodeURI(handle)}` : "",
      broadcasterIconUrl: bIcon,
      // YouTube の「N 人が視聴中」は同時接続そのもの。ニコ生版の「公式の同接」の欄に入れる(推定でなく直接値として出る)。
      // YouTube には延べの来場者数が無いので、来場は空のまま(ニコ生版は「(取得不可)」と出す)。
      viewerCountFromDom: null,
      viewerCountSource: "dom",
      officialViewerCount: Number.isFinite(viewers) && viewers >= 0 ? viewers : null,
      officialStatsUpdatedAt: Number(sum?.updatedAt || 0) || Date.now(),
      streamAgeMin: startedAt > 0 ? Math.max(0, Math.round((Date.now() - startedAt) / 6e4)) : null
    };
  }
  var normName = (name) => String(name || "").trim().replace(/^@/, "").toLowerCase();
  function buildYtPersonResolver(items) {
    const ucByName = /* @__PURE__ */ new Map();
    for (const r of items) {
      const ch = String(r?.channelId || "").trim();
      if (!/^UC[A-Za-z0-9_-]{22}$/.test(ch)) continue;
      const n = normName(r?.name);
      if (n && !ucByName.has(n)) ucByName.set(n, ch);
      if (n) ucByNameHint.set(n, ch);
    }
    const keyOf = (r) => {
      const ch = String(r?.channelId || "").trim();
      if (/^UC[A-Za-z0-9_-]{22}$/.test(ch)) return ch;
      const n = normName(r?.name || (ch.startsWith("handle:") ? ch.slice("handle:".length) : ""));
      const uc = n ? ucByName.get(n) : "";
      if (uc) return uc;
      if (ch) return ch;
      return n ? `name:${n}` : "";
    };
    const iconByKey = /* @__PURE__ */ new Map();
    for (const r of items) {
      const icon = String(r?.iconUrl || "").trim();
      if (!icon) continue;
      const k = keyOf(r);
      if (k) iconByKey.set(k, icon);
    }
    return { keyOf, iconOf: (key) => iconByKey.get(key) || "" };
  }
  var commentsCache = /* @__PURE__ */ new Map();
  var shimDiag = { notified: 0, listeners: 0, lastNotifiedAt: 0, lastCount: 0, commentGets: 0, keysAsked: (
    /** @type {string[]} */
    []
  ) };
  globalThis.__ytNicoShimDiag = shimDiag;
  var lastAskedLv = "";
  function buildCommentsForLv(lv) {
    const hit = commentsCache.get(lv);
    if (hit && Date.now() - hit.at < 1500) return hit.p;
    const p = buildCommentsForLvUncached(lv);
    commentsCache.set(lv, { at: Date.now(), p });
    return p;
  }
  async function buildGiftBagsForLv(lv, summary) {
    const entries = await buildCommentsForLv(lv);
    if (!entries) return void 0;
    return buildYtGiftBags(entries, lv, { startedAt: Number(summary?.startedAt || 0) });
  }
  function ytLeaderboardToKoken(board, entries, lv) {
    const rows = Array.isArray(board?.rows) ? board.rows : [];
    if (!rows.length) return null;
    const byName = /* @__PURE__ */ new Map();
    for (const e of Array.isArray(entries) ? entries : []) {
      const n = normName(e?.nickname);
      if (n && e?.userId) byName.set(n, { uid: String(e.userId), icon: String(e.avatarUrl || "") || byName.get(n)?.icon || "" });
    }
    return {
      liveId: lv,
      capturedAt: Number(board.capturedAt) || Date.now(),
      lastOk: true,
      lastStatus: 200,
      source: "youtube-top-fans",
      rows: rows.map((r) => {
        const name = String(r?.name || "");
        const hit = byName.get(normName(name));
        const uid = hit?.uid || numericUidForYtKey(`handle:${name.startsWith("@") ? name : `@${name}`}`);
        const icon = String(r?.iconUrl || "") || hit?.icon || "";
        if (icon) ytIconByNumericUid.set(uid, icon);
        return {
          rank: Number(r?.rank) || 0,
          name,
          contribution: Number(r?.xp) || 0,
          isAnonymous: false,
          thumbnailUrl: icon,
          userPageUrl: `https://www.nicovideo.jp/user/${uid}`
        };
      })
    };
  }
  async function buildCommentsForLvUncached(lv) {
    const vid = videoIdForPseudoLv(lv);
    if (!vid) return void 0;
    const items = await getYtStreamCommentsByVideoId(vid);
    const list = Array.isArray(items) ? items : [];
    const who = buildYtPersonResolver(list);
    return list.map((r, i) => {
      const key = who.keyOf(r);
      const icon = String(r?.iconUrl || "").trim() || who.iconOf(key);
      const e = ytRecordToNicoEntry({ ...r, iconUrl: icon }, i, lv, key);
      if (icon && e.userId) ytIconByNumericUid.set(e.userId, icon);
      return e;
    });
  }
  var real = (
    /** @type {any} */
    globalThis.chrome
  );
  if (real && real.storage && real.storage.local && real.tabs) {
    const realLocal = real.storage.local;
    const realGet = realLocal.get.bind(realLocal);
    const knownVideosReady = Promise.resolve(realGet(KEY_YT_SUMMARIES)).then((bag) => {
      for (const vid of Object.keys(bag && bag[KEY_YT_SUMMARIES] || {})) pseudoLvForVideoId(vid);
    }).catch(() => {
    });
    const shimGet = async (keys) => {
      await knownVideosReady;
      const list = keys == null ? null : Array.isArray(keys) ? keys.map(String) : typeof keys === "string" ? [keys] : Object.keys(keys);
      const bag = (
        /** @type {Record<string, any>} */
        await realGet(keys)
      );
      if (list) {
        for (const k of list) if (/^nls_/.test(k) && !shimDiag.keysAsked.includes(k.replace(/lv\d+/, "LV"))) shimDiag.keysAsked.push(k.replace(/lv\d+/, "LV"));
      }
      if (list) {
        for (const k of list) {
          if (k.startsWith(COMMENTS_PREFIX) || k.startsWith(TAIL_PREFIX)) {
            const lv2 = k.slice((k.startsWith(TAIL_PREFIX) ? TAIL_PREFIX : COMMENTS_PREFIX).length).toLowerCase();
            if (!videoIdForPseudoLv(lv2)) continue;
            lastAskedLv = lv2;
            shimDiag.commentGets += 1;
            const arr = await buildCommentsForLv(lv2);
            if (arr) bag[k] = arr;
            continue;
          }
          const g = GIFT_KEY_PREFIXES.find(([pre]) => k.startsWith(pre));
          if (!g) continue;
          const lv = k.slice(g[0].length).toLowerCase();
          const vid = videoIdForPseudoLv(lv);
          if (!vid) continue;
          const sums = (
            /** @type {Record<string, any>} */
            await realGet(KEY_YT_SUMMARIES)
          );
          const gifts = (
            /** @type {Record<string, any> | undefined} */
            await buildGiftBagsForLv(lv, sums?.[KEY_YT_SUMMARIES]?.[vid])
          );
          let v = gifts ? gifts[g[1]] : null;
          if (g[1] === "koken") {
            const lbKey = `yt_leaderboard_${vid}`;
            const lb = (
              /** @type {Record<string, any>} */
              (await realGet(lbKey))?.[lbKey]
            );
            const fromBoard = lb ? ytLeaderboardToKoken(lb, await buildCommentsForLv(lv) || [], lv) : null;
            if (fromBoard) v = fromBoard;
          }
          if (v != null) bag[k] = v;
        }
      }
      return bag;
    };
    realLocal.get = (keys, cb) => {
      const p = shimGet(keys);
      if (typeof cb === "function") {
        p.then(cb, () => cb({}));
        return void 0;
      }
      return p;
    };
    const wrapTabsFn = (fn) => {
      return (...args) => {
        const cb = typeof args[args.length - 1] === "function" ? args.pop() : null;
        const p = Promise.resolve(fn.apply(real.tabs, args)).then(
          (res) => Array.isArray(res) ? res.map(mapTab) : mapTab(res)
        );
        if (cb) {
          p.then(cb, () => cb(void 0));
          return void 0;
        }
        return p;
      };
    };
    const realTabsGetFn = real.tabs.get.bind(real.tabs);
    const realTabsGet = (id) => Promise.resolve(realTabsGetFn(id));
    real.tabs.query = wrapTabsFn(real.tabs.query);
    real.tabs.get = wrapTabsFn(real.tabs.get);
    const realSendMessage = real.tabs.sendMessage.bind(real.tabs);
    const answerForYtTab = (tabId, message) => {
      const type = String(message?.type || "");
      if (type === "NLS_EXPORT_WATCH_SNAPSHOT") {
        return realTabsGet(tabId).then(async (tab) => {
          const url = String(tab?.url || "");
          const vid = parseYtVideoIdFromUrl(url);
          if (!vid) return { ok: false, error: "not_youtube" };
          const bag = await realGet(KEY_YT_SUMMARIES);
          const sum = bag && bag[KEY_YT_SUMMARIES] && bag[KEY_YT_SUMMARIES][vid] || {};
          const snapshot = (
            /** @type {Record<string, any>} */
            ytSummaryToNicoSnapshot(sum, vid, String(tab?.title || ""))
          );
          const gifts = await buildGiftBagsForLv(pseudoLvForVideoId(vid), sum).catch(() => void 0);
          if (gifts && gifts.totalPoints > 0) snapshot.officialGiftPoints = gifts.totalPoints;
          return { ok: true, snapshot };
        });
      }
      if (type === "NLS_CAPTURE_SCREENSHOT") {
        return realTabsGet(tabId).then(async (tab) => {
          const vid = parseYtVideoIdFromUrl(String(tab?.url || ""));
          const res = await real.runtime.sendMessage({ type: "YT_CAPTURE_FRAME", videoId: vid });
          if (res && res.ok && typeof res.dataUrl === "string") {
            return { ok: true, dataUrl: res.dataUrl, liveId: pseudoLvForVideoId(vid) };
          }
          return { ok: false, errorCode: String(res?.reason || "capture_failed") };
        });
      }
      if (type === "NLS_POST_COMMENT") {
        return realTabsGet(tabId).then(async (tab) => {
          const vid = parseYtVideoIdFromUrl(String(tab?.url || ""));
          const res = await real.runtime.sendMessage({ type: "YT_SEND_COMMENT", videoId: vid, text: String(message?.text || "") });
          return res && res.ok ? { ok: true } : { ok: false, error: String(res?.reason || res?.error || "send_failed") };
        });
      }
      return null;
    };
    real.tabs.sendMessage = (...args) => {
      const cb = typeof args[args.length - 1] === "function" ? args.pop() : null;
      const [tabId, message] = args;
      const p = realTabsGet(tabId).then((tab) => isYtWatchLikeUrl(String(tab?.url || "")) ? answerForYtTab(tabId, message) : null).catch(() => null).then((answered) => answered ? answered : realSendMessage(...args));
      if (cb) {
        p.then(cb, () => cb(void 0));
        return void 0;
      }
      return p;
    };
    for (const evName of ["onUpdated", "onCreated"]) {
      const ev = real.tabs[evName];
      if (!ev || typeof ev.addListener !== "function") continue;
      const add = ev.addListener.bind(ev);
      ev.addListener = (fn) => add((...a) => {
        const out = a.map((x) => x && typeof x === "object" && "url" in x ? mapTab(x) : x);
        return fn(...out);
      });
    }
    const onChanged = real.storage.onChanged;
    if (onChanged && typeof onChanged.addListener === "function") {
      const listeners = [];
      const add = onChanged.addListener.bind(onChanged);
      onChanged.addListener = (fn) => {
        listeners.push(fn);
        add(fn);
      };
      const lastNotified = /* @__PURE__ */ new Map();
      const notifyLv = async (lv, summary) => {
        commentsCache.delete(lv);
        const arr = await buildCommentsForLv(lv).catch(() => void 0);
        if (!arr) return;
        const sig = `${arr.length}:${arr.length ? arr[arr.length - 1].id : ""}`;
        if (lastNotified.get(lv) === sig) return;
        lastNotified.set(lv, sig);
        const synth = { [`${COMMENTS_PREFIX}${lv}`]: { newValue: arr }, [`${TAIL_PREFIX}${lv}`]: { newValue: arr } };
        try {
          const gifts = (
            /** @type {Record<string, any>} */
            buildYtGiftBags(arr, lv, { startedAt: Number(summary?.startedAt || 0) })
          );
          if (gifts && gifts.count > 0) {
            for (const [pre, field] of GIFT_KEY_PREFIXES) {
              const v = gifts[field];
              if (v != null) synth[`${pre}${lv}`] = { newValue: v };
            }
          }
        } catch {
        }
        try {
          const vid = videoIdForPseudoLv(lv);
          const lbKey = `yt_leaderboard_${vid}`;
          const lb = (
            /** @type {Record<string, any>} */
            (await realGet(lbKey))?.[lbKey]
          );
          const fromBoard = lb ? ytLeaderboardToKoken(lb, arr, lv) : null;
          if (fromBoard) synth[`nls_koken_api_contrib_${lv}`] = { newValue: fromBoard };
        } catch {
        }
        shimDiag.notified += 1;
        shimDiag.listeners = listeners.length;
        shimDiag.lastNotifiedAt = Date.now();
        shimDiag.lastCount = arr.length;
        for (const fn of listeners) {
          try {
            fn(synth, "local");
          } catch {
          }
        }
      };
      add((changes, area) => {
        if (area !== "local") return;
        for (const ck of Object.keys(changes)) {
          if (!ck.startsWith("yt_leaderboard_")) continue;
          const vid = ck.slice("yt_leaderboard_".length);
          const lv = pseudoLvForVideoId(vid);
          void buildCommentsForLv(lv).then((arr) => {
            const koken = ytLeaderboardToKoken(changes[ck].newValue, arr || [], lv);
            if (!koken) return;
            const synth = { [`nls_koken_api_contrib_${lv}`]: { newValue: koken } };
            for (const fn of listeners) {
              try {
                fn(synth, "local");
              } catch {
              }
            }
          });
        }
        if (!changes[KEY_YT_SUMMARIES]) return;
        const next = changes[KEY_YT_SUMMARIES].newValue || {};
        const prev = changes[KEY_YT_SUMMARIES].oldValue || {};
        for (const vid of Object.keys(next)) {
          if (prev[vid] && Number(prev[vid].updatedAt || 0) === Number(next[vid]?.updatedAt || 0)) continue;
          void notifyLv(pseudoLvForVideoId(vid), next[vid]);
        }
      });
      setInterval(() => {
        const lv = lastAskedLv;
        if (!lv) return;
        const vid = videoIdForPseudoLv(lv);
        if (!vid) return;
        void Promise.resolve(realGet(KEY_YT_SUMMARIES)).then((bag) => notifyLv(lv, bag?.[KEY_YT_SUMMARIES]?.[vid])).catch(() => {
        });
      }, 3e3);
    }
  }
  var NICO_USER_LINK_RE = /^https?:\/\/(?:www\.)?nicovideo\.jp\/user\/(\d+)/;
  var PSEUDO_UID_RE = /8\d{9}/g;
  function ytLabelForUid(uid) {
    const key = ytKeyForNumericUid(uid);
    if (!key) return "";
    if (key.startsWith("name:")) return "";
    if (key.startsWith("handle:")) return key.slice("handle:".length);
    return key.length <= 18 ? key : `${key.slice(0, 8)}…${key.slice(-6)}`;
  }
  function fixAnchor(a) {
    const href = String(a.getAttribute("href") || "");
    const m = href.match(NICO_USER_LINK_RE);
    if (!m || !ytKeyForNumericUid(m[1])) return;
    const yt = ytChannelUrlForNumericUid(m[1]);
    if (yt) a.setAttribute("href", yt);
    else a.removeAttribute("href");
  }
  function fixTextNode(node) {
    const v = String(node.nodeValue || "");
    let next = ytWording(v);
    if (/8\d{9}/.test(next)) next = next.replace(PSEUDO_UID_RE, (uid) => ytKeyForNumericUid(uid) ? ytLabelForUid(uid) : uid);
    if (next !== v) node.nodeValue = next;
  }
  function fixTitleAttr(el) {
    const t = el.getAttribute("title");
    if (!t) return;
    let next = ytWording(t);
    if (/8\d{9}/.test(next)) next = next.replace(PSEUDO_UID_RE, (uid) => ytKeyForNumericUid(uid) ? ytLabelForUid(uid) || "" : uid);
    if (next !== t) el.setAttribute("title", next);
  }
  var NICO_USERICON_RE = /nicoaccount\/usericon\/(?:s\/)?\d+\/(8\d{9})\.jpg/;
  function fixImg(img) {
    const src = String(img.getAttribute("src") || "");
    const m = src.match(NICO_USERICON_RE);
    if (!m) return;
    const icon = ytIconForNumericUid(m[1]);
    if (icon && icon !== src) img.setAttribute("src", icon);
  }
  function fixSubtree(root) {
    if (root.nodeType === 3) {
      fixTextNode(
        /** @type {Text} */
        root
      );
      return;
    }
    if (root.nodeType !== 1) return;
    const el = (
      /** @type {Element} */
      root
    );
    if (el.tagName === "A") fixAnchor(el);
    if (el.tagName === "IMG") fixImg(el);
    fixTitleAttr(el);
    el.querySelectorAll('img[src*="nicoaccount/usericon"]').forEach(fixImg);
    el.querySelectorAll('a[href*="nicovideo.jp/user/"]').forEach(fixAnchor);
    el.querySelectorAll("[title]").forEach(fixTitleAttr);
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while (n = walker.nextNode()) fixTextNode(
      /** @type {Text} */
      n
    );
  }
  function startDomFixer() {
    if (!document.body) return;
    fixSubtree(document.body);
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "characterData") fixTextNode(
          /** @type {Text} */
          m.target
        );
        else if (m.type === "attributes") {
          const el = (
            /** @type {Element} */
            m.target
          );
          if (m.attributeName === "href" && el.tagName === "A") fixAnchor(el);
          else if (m.attributeName === "title") fixTitleAttr(el);
          else if (m.attributeName === "src" && el.tagName === "IMG") fixImg(el);
        } else m.addedNodes.forEach(fixSubtree);
      }
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["href", "title", "src"]
    });
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startDomFixer, { once: true });
    else startDomFixer();
  }
  if (real && real.tabs && typeof real.tabs.create === "function") {
    const realCreate = real.tabs.create.bind(real.tabs);
    real.tabs.create = (props, cb) => {
      const m = String(props?.url || "").match(NICO_USER_LINK_RE);
      if (m && ytKeyForNumericUid(m[1])) {
        const yt = ytChannelUrlForNumericUid(m[1]);
        if (!yt) return cb ? cb(void 0) : Promise.resolve(void 0);
        props = { ...props, url: yt };
      }
      return realCreate(props, cb);
    };
  }
  if (typeof window !== "undefined" && typeof window.open === "function") {
    const realOpen = window.open.bind(window);
    window.open = (url, ...rest) => {
      const m = String(url || "").match(NICO_USER_LINK_RE);
      if (m && ytKeyForNumericUid(m[1])) {
        const yt = ytChannelUrlForNumericUid(m[1]);
        if (!yt) return null;
        return realOpen(yt, ...rest);
      }
      return realOpen(url, ...rest);
    };
  }

  // src/lib/storageRefreshTriggerKey.js
  function normalizeStorageKeyForCensus(key) {
    const k = String(key ?? "").trim();
    if (!k) return "";
    return k.replace(/lv\d{1,15}/gi, "*").replace(/_\d{3,}$/g, "_*");
  }

  // src/lib/extDocBusyCensus.js
  var EXT_CENSUS_BYTES_SAMPLE_MS = 3e4;
  var OC_TOP = 3;
  var OC_MAX_FAMILIES = 24;
  function num(v) {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  function detectExtSurface(pathname, search) {
    const file = String(pathname || "").split("/").pop() || "";
    const base = file.replace(/\.html?$/i, "");
    if (base === "popup") {
      const q = new URLSearchParams(String(search || ""));
      if (q.get("dock") === "sidepanel") return "popup-sidepanel";
      if (q.get("dock") === "status") return "popup-status";
      if (q.get("toolbar") === "1") return "popup-toolbar";
      if (q.get("inline") === "1") return "popup-watch";
      return "popup-tab";
    }
    return base || "unknown";
  }
  function createDocCensus(opts) {
    return {
      i: String(opts.instanceId || ""),
      s: String(opts.surface || "unknown"),
      b: num(opts.nowMs) ?? 0,
      lt: { n: 0, ms: 0, max: 0 },
      lo: { n: 0, ms: 0, max: 0 },
      lg: { ms: 0, max: 0, n: 0 },
      oc: /* @__PURE__ */ Object.create(null),
      hp: null
    };
  }
  function noteLongTask(c, durMs, other = false) {
    const d = num(durMs);
    if (d === null || d < 0) return;
    const slot = other ? c.lo : c.lt;
    slot.n += 1;
    slot.ms += d;
    if (d > slot.max) slot.max = d;
  }
  function noteLag(c, lagMs) {
    const d = num(lagMs);
    if (d === null || d <= 0) return;
    c.lg.n += 1;
    c.lg.ms += d;
    if (d > c.lg.max) c.lg.max = d;
  }
  function noteOnChanged(c, key, opts) {
    const fam = normalizeStorageKeyForCensus(key);
    if (!fam) return;
    let slot = c.oc[fam];
    if (!slot) {
      if (Object.keys(c.oc).length >= OC_MAX_FAMILIES) return;
      slot = c.oc[fam] = { n: 0, lastBytes: 0, at: -Infinity };
    }
    slot.n += 1;
    const now = num(opts.nowMs) ?? 0;
    if (typeof opts.bytesOf === "function" && now - slot.at >= EXT_CENSUS_BYTES_SAMPLE_MS) {
      slot.at = now;
      try {
        const b = num(opts.bytesOf());
        if (b !== null && b >= 0) slot.lastBytes = b;
      } catch {
      }
    }
  }
  function noteHeap(c, usedBytes, limitBytes) {
    const u = num(usedBytes);
    const l = num(limitBytes);
    if (u === null || l === null || l <= 0) return;
    if (!c.hp || u > c.hp.used) c.hp = { used: u, limit: l };
  }
  function summarizeDocCensus(c, nowMs) {
    const oc = Object.entries(c.oc).map(([fam, s]) => (
      /** @type {[string, number, number]} */
      [fam, s.n, Math.round(s.n * s.lastBytes / 1024)]
    )).sort((x, y) => y[2] - x[2] || y[1] - x[1]).slice(0, OC_TOP);
    return {
      i: c.i,
      s: c.s,
      a: Math.max(0, Math.round(((num(nowMs) ?? 0) - c.b) / 1e3)),
      lt: [c.lt.n, Math.round(c.lt.ms), Math.round(c.lt.max)],
      lo: [c.lo.n, Math.round(c.lo.ms), Math.round(c.lo.max)],
      lg: [Math.round(c.lg.ms), Math.round(c.lg.max), c.lg.n],
      oc,
      hp: c.hp ? [Math.round(c.hp.used / 1048576), Math.round(c.hp.limit / 1048576)] : null
    };
  }

  // src/lib/extProcessCensusKey.js
  var EXT_CENSUS_MESSAGE_TYPE = "NLS_DOC_CENSUS";

  // src/lib/extDocBusyCensusBoot.js
  var HEARTBEAT_MS = 1e3;
  var REPORT_MS = 6e4;
  var FIRST_REPORT_MS = 1e4;
  function startExtDocBusyCensus(env) {
    const now = typeof env.now === "function" ? env.now : () => Date.now();
    const randomId = typeof env.randomId === "function" ? env.randomId : () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");
    const census = createDocCensus({
      surface: detectExtSurface(env.win.location.pathname, env.win.location.search),
      nowMs: now(),
      instanceId: randomId()
    });
    const cleanups = [];
    let isFrame = false;
    try {
      const top = env.win.top;
      isFrame = !!top && top !== env.win;
    } catch {
      isFrame = true;
    }
    try {
      const Ctor = env.PerformanceObserverCtor;
      if (typeof Ctor === "function") {
        const po = new Ctor((list) => {
          try {
            for (const e of list.getEntries()) {
              const ct = e.attribution && e.attribution[0] ? e.attribution[0].containerType : "";
              noteLongTask(census, e.duration, isFrame ? ct === "window" : ct === "iframe");
            }
          } catch {
          }
        });
        po.observe({ type: "longtask", buffered: true });
        cleanups.push(() => {
          try {
            po.disconnect();
          } catch {
          }
        });
      }
    } catch {
    }
    let lastBeat = now();
    const hb = setInterval(() => {
      try {
        const t = now();
        const hidden = !!(env.win.document && env.win.document.hidden);
        if (!hidden) noteLag(census, t - lastBeat - HEARTBEAT_MS);
        lastBeat = t;
      } catch {
      }
    }, HEARTBEAT_MS);
    cleanups.push(() => clearInterval(hb));
    try {
      env.chromeApi?.storage?.onChanged?.addListener?.((changes, area) => {
        if (area !== "local" || !changes) return;
        try {
          const t = now();
          for (const k of Object.keys(changes)) {
            noteOnChanged(census, k, {
              nowMs: t,
              bytesOf: () => {
                const v = changes[k] && changes[k].newValue;
                return v === void 0 ? 0 : JSON.stringify(v).length;
              }
            });
          }
        } catch {
        }
      });
    } catch {
    }
    const report = () => {
      try {
        const mem = env.perf && env.perf.memory;
        if (mem) noteHeap(census, mem.usedJSHeapSize, mem.jsHeapSizeLimit);
        const r = summarizeDocCensus(census, now());
        const send = env.chromeApi?.runtime?.sendMessage;
        if (typeof send === "function") {
          const p = send.call(env.chromeApi.runtime, { type: EXT_CENSUS_MESSAGE_TYPE, report: r }, () => {
            void env.chromeApi?.runtime?.lastError;
          });
          if (p && typeof p.catch === "function") p.catch(() => {
          });
        }
      } catch {
      }
    };
    const first = setTimeout(report, FIRST_REPORT_MS);
    cleanups.push(() => clearTimeout(first));
    const rep = setInterval(report, REPORT_MS);
    cleanups.push(() => clearInterval(rep));
    return {
      stop() {
        for (const fn of cleanups.splice(0)) fn();
      }
    };
  }
  function autoStartExtDocBusyCensus() {
    try {
      const g = (
        /** @type {any} */
        globalThis
      );
      if (typeof window === "undefined" || typeof document === "undefined") return;
      if (g.__nlsExtDocBusyCensus) return;
      const c = g.chrome;
      if (!c || !c.runtime || typeof c.runtime.sendMessage !== "function" || !c.runtime.id) return;
      g.__nlsExtDocBusyCensus = startExtDocBusyCensus({
        win: window,
        chromeApi: c,
        perf: typeof performance !== "undefined" ? performance : void 0,
        PerformanceObserverCtor: typeof PerformanceObserver !== "undefined" ? PerformanceObserver : void 0
      });
    } catch {
    }
  }
  autoStartExtDocBusyCensus();

  // src/shared/niconico/liveId.js
  function normalizeLv(v) {
    const s = String(v ?? "").trim().toLowerCase();
    if (!s) return "";
    if (s.startsWith("ch")) return s;
    return s.startsWith("lv") ? s : `lv${s}`;
  }

  // src/shared/avatar/avatarUrlGuard.js
  var COMPARE_KEY_CACHE_MAX = 3e3;
  var _compareKeyCache = /* @__PURE__ */ new Map();
  function avatarCompareKey(raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (!s) return "";
    const hit = _compareKeyCache.get(s);
    if (hit !== void 0) return hit;
    let key;
    try {
      const u = new URL(s);
      u.search = "";
      u.hash = "";
      key = u.href;
    } catch {
      key = s;
    }
    if (_compareKeyCache.size >= COMPARE_KEY_CACHE_MAX) _compareKeyCache.clear();
    _compareKeyCache.set(s, key);
    return key;
  }
  function isSameAvatarUrl(a, b) {
    const ka = avatarCompareKey(a);
    const kb = avatarCompareKey(b);
    return Boolean(ka && kb && ka === kb);
  }
  function extractNiconicoUserIdFromIconUrl(raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (!s) return "";
    const m = s.match(/\/(\d{2,15})\.(?:jpg|jpeg|png|gif|webp)(?:[?#]|$)/i);
    if (m && m[1]) return m[1];
    return "";
  }

  // src/lib/parseInterestArrivalComment.js
  var INTEREST_ARRIVAL_RE = new RegExp(
    "^[\\u3000\\s]*「(.+?)」が好きな(\\d+)人が来場しました[\\u3000\\s]*$"
  );
  function parseInterestArrivalComment(text) {
    if (typeof text !== "string") return null;
    const trimmed = text.trim();
    if (!trimmed) return null;
    const m = trimmed.match(INTEREST_ARRIVAL_RE);
    if (!m) return null;
    const tag = m[1].trim();
    const count = parseInt(m[2], 10);
    if (!tag || !Number.isFinite(count) || count < 1) return null;
    return { tag, count };
  }

  // src/lib/marketingAggregate.js
  function scrubMarketingTopUserAvatars(users, ctx) {
    const bUid = String(ctx?.broadcasterUserId || "").trim();
    const bIcon = String(ctx?.broadcasterIconUrl || "").trim();
    return users.map((u) => {
      const av = String(u.avatarUrl || "").trim();
      if (!av) return u;
      const uid = String(u.userId || "").trim();
      if (bUid && bIcon && uid && uid !== bUid && isSameAvatarUrl(av, bIcon)) {
        return { ...u, avatarUrl: "" };
      }
      const avUid = extractNiconicoUserIdFromIconUrl(av);
      if (avUid && /^\d+$/.test(uid) && avUid !== uid) {
        return { ...u, avatarUrl: "" };
      }
      return u;
    });
  }
  function aggregateMarketingReport(comments, liveId, opts = {}) {
    const broadcasterUid = String(opts?.broadcasterUserId || "").trim();
    const targetLv = normalizeLv(liveId);
    const filtered = comments.filter((c) => {
      const row = (
        /** @type {import('./commentRecord.js').StoredComment & { lvId?: string }} */
        c
      );
      const rowLv = normalizeLv(row.liveId ?? row.lvId ?? "");
      return rowLv === targetLv && c.text && String(c.text).trim() && !(broadcasterUid && String(c.userId || "").trim() === broadcasterUid);
    });
    const engagementComments = [];
    const interestArrivalComments = [];
    for (const c of filtered) {
      if (parseInterestArrivalComment(String(c.text || ""))) {
        interestArrivalComments.push(c);
      } else {
        engagementComments.push(c);
      }
    }
    const interestArrivalSummary = computeInterestArrivalSummary(interestArrivalComments);
    const userMap = /* @__PURE__ */ new Map();
    const timestamps = [];
    for (const c of engagementComments) {
      const uid = c.userId || `anon:${(c.commentNo || c.id || "").slice(0, 12)}`;
      const t = c.capturedAt || 0;
      timestamps.push(t);
      const rowAccount = typeof c.accountStatus === "number" && (c.accountStatus === 1 || c.accountStatus === 2) ? c.accountStatus : 0;
      const existing = userMap.get(uid);
      if (existing) {
        existing.count++;
        if (!existing.nickname && c.nickname) existing.nickname = c.nickname;
        if (!existing.avatarUrl && c.avatarUrl) existing.avatarUrl = c.avatarUrl;
        if (t < existing.firstAt) existing.firstAt = t;
        if (t > existing.lastAt) existing.lastAt = t;
        if (rowAccount > (existing.accountStatus || 0)) existing.accountStatus = rowAccount;
      } else {
        userMap.set(uid, {
          userId: uid,
          nickname: c.nickname || "",
          avatarUrl: c.avatarUrl || "",
          count: 1,
          firstAt: t,
          lastAt: t,
          accountStatus: rowAccount
        });
      }
    }
    let users = [...userMap.values()];
    users.sort((a, b) => b.count - a.count);
    users = scrubMarketingTopUserAvatars(users, {
      broadcasterUserId: broadcasterUid,
      broadcasterIconUrl: String(opts?.broadcasterIconUrl || "").trim()
    });
    const counts = users.map((u) => u.count).sort((a, b) => a - b);
    const median2 = counts.length === 0 ? 0 : counts.length % 2 === 1 ? counts[Math.floor(counts.length / 2)] : (counts[counts.length / 2 - 1] + counts[counts.length / 2]) / 2;
    let minT = 0;
    let maxT = 0;
    if (timestamps.length) {
      minT = timestamps[0];
      maxT = timestamps[0];
      for (let i = 1; i < timestamps.length; i++) {
        const t = timestamps[i];
        if (t < minT) minT = t;
        if (t > maxT) maxT = t;
      }
    }
    const durationMs = maxT - minT;
    const durationMinutes = Math.max(1, Math.round(durationMs / 6e4));
    const bucketMap = /* @__PURE__ */ new Map();
    for (const c of engagementComments) {
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
    const textStats = computeTextStats(engagementComments);
    const selfPostedCount = engagementComments.filter((c) => c.selfPosted === true).length;
    const selfPostedPct = engagementComments.length > 0 ? Math.round(selfPostedCount / engagementComments.length * 1e3) / 10 : 0;
    const is184 = compute184Stats(engagementComments);
    const premium = computePremiumStats(engagementComments);
    const timelineCumulative = computeTimelineCumulative(timeline);
    const timelineRolling5Min = computeTimelineRolling5(timeline);
    const maxSilenceGapMs = computeMaxSilenceGapMs(timestamps);
    const vposThirds = computeVposThirds(engagementComments);
    const quarterEngagement = computeQuarterEngagement(engagementComments, minT, maxT);
    const identifiedSet = /* @__PURE__ */ new Set();
    let unattributedComments = 0;
    for (const c of engagementComments) {
      const u = String(c.userId || "").trim();
      if (u) identifiedSet.add(u);
      else unattributedComments += 1;
    }
    return {
      liveId,
      totalComments: engagementComments.length,
      uniqueUsers: users.length,
      identifiedUsers: identifiedSet.size,
      unattributedComments,
      avgCommentsPerUser: users.length > 0 ? Math.round(engagementComments.length / users.length * 10) / 10 : 0,
      medianCommentsPerUser: median2,
      peakMinute,
      peakMinuteCount,
      durationMinutes,
      commentsPerMinute: Math.round(engagementComments.length / durationMinutes * 10) / 10,
      topUsers: users.slice(0, 30),
      allNumericCommenters: users.filter((u) => /^\d{1,18}$/.test(String(u.userId || ""))),
      timeline,
      segmentCounts: { heavy, mid, light, once },
      segmentPcts: {
        heavy: Math.round(heavy / total * 1e3) / 10,
        mid: Math.round(mid / total * 1e3) / 10,
        light: Math.round(light / total * 1e3) / 10,
        once: Math.round(once / total * 1e3) / 10
      },
      hourDistribution,
      textStats,
      selfPostedCount,
      selfPostedPct,
      is184,
      premium,
      timelineCumulative,
      timelineRolling5Min,
      maxSilenceGapMs,
      vposThirds,
      quarterEngagement,
      interestArrivalSummary
    };
  }
  function computeInterestArrivalSummary(interestArrivalComments) {
    const tagMap = /* @__PURE__ */ new Map();
    let totalArrivals = 0;
    let messageCount = 0;
    for (const c of interestArrivalComments) {
      const parsed = parseInterestArrivalComment(String(c.text || ""));
      if (!parsed) continue;
      messageCount += 1;
      totalArrivals += parsed.count;
      const prev = tagMap.get(parsed.tag) || { arrivals: 0, messageCount: 0 };
      tagMap.set(parsed.tag, {
        arrivals: prev.arrivals + parsed.count,
        messageCount: prev.messageCount + 1
      });
    }
    const topTags = [...tagMap.entries()].map(([tag, stats]) => ({
      tag,
      arrivals: stats.arrivals,
      messageCount: stats.messageCount
    })).sort(
      (a, b) => b.arrivals - a.arrivals || b.messageCount - a.messageCount || a.tag.localeCompare(b.tag, "ja")
    );
    return {
      totalArrivals,
      uniqueTags: tagMap.size,
      messageCount,
      topTags
    };
  }
  function computeTextStats(filtered) {
    const n = filtered.length;
    if (!n) {
      return {
        avgChars: 0,
        medianChars: 0,
        withUrlCount: 0,
        withEmojiCount: 0,
        pctWithUrl: 0,
        pctWithEmoji: 0
      };
    }
    const URL_RE = /https?:\/\/[^\s]+/i;
    const EMOJI_RE = new RegExp("\\p{Extended_Pictographic}", "gu");
    const lengths = [];
    let withUrl = 0;
    let withEmoji = 0;
    for (const c of filtered) {
      const t = String(c.text || "").trim();
      lengths.push(t.length);
      if (URL_RE.test(t)) withUrl++;
      const em = t.match(EMOJI_RE);
      if (em && em.length > 0) withEmoji++;
    }
    lengths.sort((a, b) => a - b);
    const midLen = lengths.length % 2 === 1 ? lengths[Math.floor(lengths.length / 2)] : (lengths[lengths.length / 2 - 1] + lengths[lengths.length / 2]) / 2;
    const sum = lengths.reduce((a, b) => a + b, 0);
    return {
      avgChars: Math.round(sum / n * 10) / 10,
      medianChars: midLen,
      withUrlCount: withUrl,
      withEmojiCount: withEmoji,
      pctWithUrl: Math.round(withUrl / n * 1e3) / 10,
      pctWithEmoji: Math.round(withEmoji / n * 1e3) / 10
    };
  }
  function compute184Stats(filtered) {
    const known = filtered.filter((c) => typeof c.is184 === "boolean");
    const k = known.length;
    const count184 = known.filter((c) => c.is184 === true).length;
    return {
      count184,
      knownCount: k,
      pctOfKnown: k > 0 ? Math.round(count184 / k * 1e3) / 10 : 0
    };
  }
  function computePremiumStats(filtered) {
    let premiumCount = 0;
    let standardCount = 0;
    for (const c of filtered) {
      const s = c.accountStatus;
      if (s === 2) premiumCount += 1;
      else if (s === 1) standardCount += 1;
    }
    const knownCount = premiumCount + standardCount;
    return {
      premiumCount,
      standardCount,
      knownCount,
      pctPremiumOfKnown: knownCount > 0 ? Math.round(premiumCount / knownCount * 1e3) / 10 : 0
    };
  }
  function computeTimelineCumulative(timeline) {
    let cum = 0;
    return timeline.map((b) => {
      cum += b.count;
      return cum;
    });
  }
  function computeTimelineRolling5(timeline) {
    return timeline.map((_, i) => {
      let s = 0;
      const from = Math.max(0, i - 4);
      for (let j = from; j <= i; j++) {
        s += timeline[j].count;
      }
      return s;
    });
  }
  function computeMaxSilenceGapMs(timestamps) {
    const uniq = [...new Set(timestamps.filter((t) => t > 0))].sort((a, b) => a - b);
    if (uniq.length < 2) return 0;
    let maxGap = 0;
    for (let i = 1; i < uniq.length; i++) {
      const g = uniq[i] - uniq[i - 1];
      if (g > maxGap) maxGap = g;
    }
    return maxGap;
  }
  var MIN_SPAN_MS_FOR_QUARTERS = 6e4;
  function computeQuarterEngagement(filtered, minT, maxT) {
    const span = maxT - minT;
    if (span < MIN_SPAN_MS_FOR_QUARTERS || !filtered.length) {
      return {
        uniqueCommentersFirstQuarter: 0,
        uniqueCommentersLastQuarter: 0,
        uniqueCommentersBothQuarters: 0,
        skippedShortSpan: span < MIN_SPAN_MS_FOR_QUARTERS
      };
    }
    const q1End = minT + span / 4;
    const q4Start = maxT - span / 4;
    const firstQ = /* @__PURE__ */ new Set();
    const lastQ = /* @__PURE__ */ new Set();
    for (const c of filtered) {
      const t = c.capturedAt || 0;
      const uid = c.userId || `anon:${(c.commentNo || c.id || "").slice(0, 12)}`;
      if (t >= minT && t <= q1End) firstQ.add(uid);
      if (t >= q4Start && t <= maxT) lastQ.add(uid);
    }
    let both = 0;
    for (const uid of firstQ) {
      if (lastQ.has(uid)) both++;
    }
    return {
      uniqueCommentersFirstQuarter: firstQ.size,
      uniqueCommentersLastQuarter: lastQ.size,
      uniqueCommentersBothQuarters: both,
      skippedShortSpan: false
    };
  }
  function computeVposThirds(filtered) {
    const vps = filtered.map((c) => c.vpos).filter((v) => typeof v === "number" && Number.isFinite(v) && v >= 0);
    if (vps.length < 5) return null;
    let maxV = vps[0];
    for (let i = 1; i < vps.length; i++) {
      if (vps[i] > maxV) maxV = vps[i];
    }
    let early = 0;
    let mid = 0;
    let late = 0;
    if (maxV <= 0) {
      early = vps.length;
    } else {
      const t1 = maxV / 3;
      const t2 = 2 * maxV / 3;
      for (const v of vps) {
        if (v < t1) early++;
        else if (v < t2) mid++;
        else late++;
      }
    }
    return { early, mid, late };
  }

  // src/shared/html/escape.js
  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }

  // src/lib/privacyDisplay.js
  function maskLabelForShare(label) {
    const t = String(label || "").trim();
    if (!t || t === "—") return t;
    if (t.length <= 2) return "••";
    if (t.length <= 5) return `${t.charAt(0)}•••`;
    return `${t.slice(0, 2)}•••${t.slice(-2)}`;
  }

  // src/lib/yukkuriBroadcastSummary.js
  var CHAR_BASE = (
    /** @type {const} */
    {
      rinku: "images/yukkuri-charactore-english/link/link-yukkuri",
      konta: "images/yukkuri-charactore-english/konta/kitsune-yukkuri",
      tanunee: "images/yukkuri-charactore-english/tanunee/tanuki-yukkuri"
    }
  );
  function yukkuriCharacterImagePath(character, expression, mouthOpen) {
    const base = CHAR_BASE[character];
    if (character === "konta" && expression === "normal") {
      return `${base}-normal.png`;
    }
    return `${base}-${expression}-mouth-${mouthOpen ? "open" : "closed"}.png`;
  }
  function listYukkuriCharacterImagePaths() {
    const chars = ["rinku", "konta", "tanunee"];
    const exps = ["normal", "smile", "blink", "half-eyes"];
    const set = /* @__PURE__ */ new Set();
    for (const c of chars) {
      for (const e of exps) {
        for (const mouth of [false, true]) {
          set.add(yukkuriCharacterImagePath(c, e, mouth));
        }
      }
    }
    return [...set];
  }
  function yukkuriBroadcastSummaryEmbeddedCss() {
    return [
      ".nl-yukkuri-summary{margin:18px 0;padding:18px;border-radius:14px;background:linear-gradient(180deg,#f6fff8,#eef9f3);border:1px solid #cfe9d8;}",
      ".nl-yukkuri-summary__heading{margin:0 0 12px;font-size:18px;font-weight:700;color:#2a6f4d;}",
      ".nl-yukkuri-summary__body{display:flex;flex-direction:column;gap:10px;}",
      ".nl-yukkuri-line{display:flex;align-items:flex-start;gap:10px;}",
      ".nl-yukkuri-line--konta{flex-direction:row-reverse;}",
      ".nl-yukkuri-face{width:64px;height:64px;border-radius:50%;background:#fff;border:1px solid #cfe9d8;flex-shrink:0;}",
      ".nl-yukkuri-bubble{background:#fff;border:1px solid #cfe9d8;border-radius:12px;padding:8px 12px;max-width:520px;box-shadow:0 1px 0 rgba(42,111,77,0.05);}",
      ".nl-yukkuri-line--konta .nl-yukkuri-bubble{background:#fff8ec;border-color:#f0d9a8;}",
      ".nl-yukkuri-line--tanunee .nl-yukkuri-bubble{background:#f6f0ec;border-color:#d8c3b3;}",
      ".nl-yukkuri-name{font-weight:700;font-size:13px;color:#2a6f4d;margin-bottom:2px;}",
      ".nl-yukkuri-line--konta .nl-yukkuri-name{color:#a86b1e;}",
      ".nl-yukkuri-line--tanunee .nl-yukkuri-name{color:#7a5a3f;}",
      ".nl-yukkuri-text{margin:0;font-size:14px;line-height:1.5;color:#222;}"
    ].join("");
  }

  // src/lib/deriveAvatarUrlFromUid.js
  var AVATAR_HOST = "https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon";
  function deriveAvatarUrlFromUid(uid, size = "s") {
    const numUid = normalizeUid(uid);
    if (numUid == null) return "";
    const dirNum = Math.floor(numUid / 1e4);
    const sz = size === "m" ? "m" : "s";
    return `${AVATAR_HOST}/${sz}/${dirNum}/${numUid}.jpg`;
  }
  function normalizeUid(uid) {
    if (uid == null) return null;
    if (typeof uid === "number") {
      if (!Number.isFinite(uid) || uid < 0 || !Number.isInteger(uid)) return null;
      return uid;
    }
    if (typeof uid === "string") {
      const t = uid.trim();
      if (!/^[0-9]+$/.test(t)) return null;
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0) return null;
      return n;
    }
    return null;
  }

  // src/lib/supportGrowthTileSrc.js
  function isHttpOrHttpsUrl(url) {
    const s = String(url || "").trim();
    return /^https?:\/\//i.test(s);
  }
  var NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS = "https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg";
  function isWeakNiconicoUserIconHttpUrl(url) {
    const s = String(url || "").trim();
    if (!isHttpOrHttpsUrl(s)) return false;
    return /\/usericon\/defaults\//i.test(s);
  }
  function isAnonymousStyleNicoUserId(userId) {
    const s = String(userId || "").trim();
    if (!s) return true;
    if (/^\d{5,14}$/.test(s)) return false;
    if (/^a:/i.test(s)) return true;
    if (/^[a-zA-Z0-9_-]{10,26}$/.test(s)) return true;
    return true;
  }

  // src/lib/commentTickerNameLink.js
  function canLinkCommentTickerName(userId) {
    const s = String(userId || "").trim();
    if (!s) return false;
    return !isAnonymousStyleNicoUserId(s);
  }
  function buildCommentTickerNameHref(userId) {
    if (!canLinkCommentTickerName(userId)) return "";
    const s = String(userId || "").trim();
    return `https://www.nicovideo.jp/user/${encodeURIComponent(s)}`;
  }

  // src/lib/userProfileLinkHtml.js
  function buildUserProfileLinkedLabelHtml(userKey, label) {
    const text = String(label ?? "");
    const escaped = escapeHtml(text);
    const href = buildCommentTickerNameHref(userKey);
    if (!href) return escaped;
    return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" class="nl-user-profile-link">${escaped}</a>`;
  }

  // src/lib/mangaBroadcastSummary.js
  var CHAR_LABELS = (
    /** @type {const} */
    {
      rinku: "りんく",
      konta: "こん太",
      tanunee: "たぬ姉"
    }
  );
  function fmtNum(v) {
    if (typeof v !== "number" || !Number.isFinite(v)) return "—";
    return v.toLocaleString("ja-JP");
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
    );
  }
  function uidFromUserPageUrl(value) {
    const s = String(value == null ? "" : value).trim();
    if (/^\d{1,18}$/.test(s)) return s;
    const m = s.match(/\/user\/(\d{1,18})(?:\/|\?|$)/);
    return m ? m[1] : "";
  }
  function trimToTitle(s) {
    const t = String(s || "").trim();
    if (!t) return "";
    if (t.length <= 60) return t;
    return `${t.slice(0, 58)}…`;
  }
  function buildMangaBroadcastPanels(input) {
    const bundle = input?.bundle || null;
    const broadcasterUid = String(input?.broadcasterUserId || "").trim();
    const ws = bundle?.programStats || null;
    const ev = bundle?.eventBanner || null;
    const bal = bundle?.eventBalloon || null;
    const rank = Array.isArray(bundle?.contributionRanking) ? bundle.contributionRanking : [];
    const titleRaw = trimToTitle(input?.broadcastTitle || "");
    const broadcaster = String(input?.broadcasterName || "").trim();
    const recorded = typeof input?.recordedCommentCount === "number" && Number.isFinite(input.recordedCommentCount) ? Math.max(0, Math.floor(input.recordedCommentCount)) : null;
    const streamAgeMin = typeof input?.streamAgeMin === "number" && Number.isFinite(input.streamAgeMin) ? Math.max(0, Math.floor(input.streamAgeMin)) : null;
    const panels = [];
    {
      const titleSeg = titleRaw ? `「${titleRaw}」` : "この放送";
      const broadcasterSeg = broadcaster ? `（${broadcaster}さん）` : "";
      const openingDialogue = {
        character: "rinku",
        expression: "smile",
        mouthOpen: true,
        size: "big",
        line: `今回の${titleSeg}${broadcasterSeg}、お疲れさまでしたー！`
      };
      if (broadcaster && /^\d{1,18}$/.test(broadcasterUid)) {
        const nameLink = buildUserProfileLinkedLabelHtml(broadcasterUid, `${broadcaster}さん`);
        openingDialogue.lineHtml = `今回の${esc(titleSeg)}（${nameLink}）、お疲れさまでしたー！`;
      }
      panels.push({
        sceneId: "opening",
        caption: "【プロローグ】今回の放送のおさらい",
        bg: "rinku",
        dialogues: [openingDialogue],
        highlight: null,
        onomatopoeia: "わいわい〜！"
      });
    }
    if (ws || streamAgeMin != null) {
      const segs = [];
      if (ws?.watchCount != null) segs.push(`来場 ${fmtNum(ws.watchCount)} 人`);
      if (ws?.commentCount != null) segs.push(`コメ ${fmtNum(ws.commentCount)} 件`);
      if (streamAgeMin != null) {
        const h = Math.floor(streamAgeMin / 60);
        const m = streamAgeMin % 60;
        const t = h > 0 ? `${h}時間${m}分` : `${m}分`;
        segs.push(`配信 ${t}`);
      }
      let hl = null;
      if (typeof ws?.watchCount === "number") {
        hl = { value: `${fmtNum(ws.watchCount)} 人`, label: "来場者数" };
      } else if (typeof ws?.commentCount === "number") {
        hl = { value: `${fmtNum(ws.commentCount)} 件`, label: "本家コメ数" };
      }
      panels.push({
        sceneId: "numbers",
        caption: "【1コマ目】数字の振り返り",
        bg: "neutral",
        dialogues: [
          {
            character: "tanunee",
            expression: "normal",
            mouthOpen: true,
            size: "medium",
            line: `${segs.length ? segs.join(" / ") : "統計はまだそろってない"}で着地タヌ`
          }
        ],
        highlight: hl,
        onomatopoeia: "コクコク"
      });
    }
    if (recorded != null && ws && ws.commentCount && ws.commentCount > 0) {
      const ratio = Math.round(recorded / ws.commentCount * 100);
      const isGood = ratio >= 30;
      panels.push({
        sceneId: "capture",
        caption: "【2コマ目】記録の評価",
        bg: isGood ? "gold" : "konta",
        dialogues: [
          {
            character: "konta",
            expression: isGood ? "smile" : "half-eyes",
            mouthOpen: true,
            size: "medium",
            line: isGood ? `こちらの記録は ${fmtNum(recorded)} 件、捕捉率 ${ratio}% です。よく拾えてますね` : `こちらの記録は ${fmtNum(recorded)} 件、捕捉率 ${ratio}% です。次はもう少し拾えるとよさそうですね`
          }
        ],
        highlight: { value: `${ratio}%`, label: "捕捉率" },
        onomatopoeia: isGood ? "パチパチ！" : "しゅん…"
      });
    }
    if (ev) {
      const evTitle = trimToTitle(ev.title);
      const score = bal?.eventTotalScore != null ? bal.eventTotalScore : ev.score;
      const segs = [];
      if (ev.rank != null) segs.push(`現在 ${ev.rank} 位`);
      if (score != null) segs.push(`累計 ${fmtNum(score)}`);
      let hl = null;
      if (ev.rank != null) {
        hl = { value: `${ev.rank} 位`, label: "イベント順位" };
      } else if (score != null) {
        hl = { value: fmtNum(score), label: "イベントスコア" };
      }
      panels.push({
        sceneId: "event",
        caption: "【3コマ目】参加イベント",
        bg: "gold",
        dialogues: [
          {
            character: "tanunee",
            expression: "blink",
            mouthOpen: true,
            size: "big",
            line: evTitle ? `イベント「${evTitle}」では ${segs.join(" / ")} まで来てるタヌよ` : `イベントでは ${segs.join(" / ")} まで来てるタヌよ`
          }
        ],
        highlight: hl,
        onomatopoeia: "キラキラ✨"
      });
    }
    const namedTop = rank.filter((r) => r && !r.isAnonymous && r.name).slice(0, 3);
    if (namedTop.length > 0) {
      const charRotation = (
        /** @type {MangaCharacter[]} */
        ["rinku", "konta", "tanunee"]
      );
      const intros = [
        "ぶっちぎりのトップ！すごいー！",
        "いつもありがとうございます！",
        "感謝感激タヌ〜"
      ];
      const dialogues = [];
      for (let i = 0; i < namedTop.length; i++) {
        const r = namedTop[i];
        const nameText = trimToTitle(r.name);
        const intro = intros[i] || "ありがとう！";
        const dialogue = {
          character: charRotation[i % 3],
          expression: i === 0 ? "blink" : "smile",
          mouthOpen: true,
          size: i === 0 ? "medium" : "small",
          line: `${r.rank}位 ${nameText} さん、${fmtNum(r.contribution)} 貢！${intro}`
        };
        const rAny = (
          /** @type {any} */
          r
        );
        const uid = uidFromUserPageUrl(rAny.userPageUrl || rAny.userId);
        if (uid) {
          const nameLink = buildUserProfileLinkedLabelHtml(uid, `${nameText} さん`);
          dialogue.lineHtml = `${esc(r.rank)}位 ${nameLink}、${esc(fmtNum(r.contribution))} 貢！${esc(intro)}`;
        }
        dialogues.push(dialogue);
      }
      const hl = namedTop[0] ? {
        value: `${trimToTitle(namedTop[0].name)} さん`,
        label: `1位 ${fmtNum(namedTop[0].contribution)} 貢`
      } : null;
      panels.push({
        sceneId: "top-fans",
        caption: "【4コマ目】上位応援者の発表",
        bg: "pink",
        dialogues,
        highlight: hl,
        onomatopoeia: "ありがとう〜♪"
      });
    }
    panels.push({
      sceneId: "closing",
      caption: "【エピローグ】次回もお楽しみに！",
      bg: "rinku",
      dialogues: [
        {
          character: "rinku",
          expression: "smile",
          mouthOpen: false,
          size: "big",
          line: "応援してくれた皆さん、ありがとうございました。次回もお楽しみにー！"
        }
      ],
      highlight: null,
      onomatopoeia: "ぺこり"
    });
    return panels;
  }
  function escapeHtmlMin(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) => (
        /** @type {Record<string,string>} */
        {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        }[c]
      )
    );
  }
  function renderMangaBroadcastPanelsHtml(panels, opts = {}) {
    if (!Array.isArray(panels) || panels.length === 0) return "";
    const heading = opts?.heading || "今回の放送のおさらい・漫画版";
    const imageMap = opts?.imageDataUrlMap && typeof opts.imageDataUrlMap === "object" ? opts.imageDataUrlMap : null;
    const renderDialogue = (d) => {
      const path = yukkuriCharacterImagePath(d.character, d.expression, d.mouthOpen);
      const src = imageMap && imageMap[path] || path;
      const name = CHAR_LABELS[d.character] || d.character;
      return `<div class="nl-manga-dialogue nl-manga-dialogue--${d.size} nl-manga-dialogue--${escapeHtmlMin(d.character)}"><div class="nl-manga-face-wrap"><img class="nl-manga-face" src="${escapeHtmlMin(src)}" alt="${escapeHtmlMin(name)}" loading="lazy" decoding="async" /><div class="nl-manga-name">${escapeHtmlMin(name)}</div></div><div class="nl-manga-bubble"><p class="nl-manga-bubble__text">${typeof d.lineHtml === "string" && d.lineHtml ? d.lineHtml : escapeHtmlMin(d.line)}</p></div></div>`;
    };
    const items = panels.map((panel) => {
      const dialoguesHtml = panel.dialogues.map(renderDialogue).join("");
      const highlightHtml = panel.highlight ? `<div class="nl-manga-highlight"><div class="nl-manga-highlight__value">${escapeHtmlMin(panel.highlight.value)}</div><div class="nl-manga-highlight__label">${escapeHtmlMin(panel.highlight.label)}</div></div>` : "";
      const onomatopoeiaHtml = panel.onomatopoeia ? `<div class="nl-manga-onomatopoeia" aria-hidden="true">${escapeHtmlMin(panel.onomatopoeia)}</div>` : "";
      return `<article class="nl-manga-panel nl-manga-panel--bg-${escapeHtmlMin(panel.bg)} nl-manga-panel--scene-${escapeHtmlMin(panel.sceneId)}"><div class="nl-manga-panel__caption">${escapeHtmlMin(panel.caption)}</div><div class="nl-manga-panel__body"><div class="nl-manga-panel__dialogues">${dialoguesHtml}</div>` + highlightHtml + `</div>` + onomatopoeiaHtml + `</article>`;
    }).join("");
    return `<section class="nl-manga-summary"><h2 class="nl-manga-summary__heading">${escapeHtmlMin(heading)}</h2><div class="nl-manga-summary__panels">${items}</div></section>`;
  }
  function mangaBroadcastSummaryEmbeddedCss() {
    return [
      /* ── セクション全体（responsive: clamp で全サイズ追従）── */
      '.nl-manga-summary{margin:clamp(12px,3vw,20px) 0;font-family:"Yu Gothic","ヒラギノ角ゴ Pro",system-ui,Arial,sans-serif;container-type:inline-size;}',
      ".nl-manga-summary__heading{margin:0 0 clamp(10px,2.5vw,16px);font-size:clamp(15px,4vw,22px);font-weight:900;letter-spacing:0.04em;color:#1f2937;border-left:clamp(4px,1vw,7px) solid #2a6f4d;padding-left:clamp(8px,2vw,12px);line-height:1.3;}",
      ".nl-manga-summary__panels{display:grid;grid-template-columns:1fr;gap:clamp(10px,2.5vw,16px);}",
      /* container query で 720px 以上は 2 列、それ未満は 1 列（外側 width 不問） */
      "@container (min-width: 720px){.nl-manga-summary__panels{grid-template-columns:1fr 1fr;}}",
      /* viewport 側でも保険（container query 非対応ブラウザ向け） */
      "@media(min-width:760px){.nl-manga-summary__panels{grid-template-columns:1fr 1fr;}}",
      /* ── コマ ── */
      ".nl-manga-panel{position:relative;border:clamp(2px,0.5vw,3px) solid #1f2937;border-radius:clamp(6px,1.5vw,10px);padding:clamp(10px,2.5vw,16px);padding-bottom:clamp(14px,3vw,22px);overflow:hidden;box-shadow:3px 3px 0 #1f2937;min-width:0;}",
      ".nl-manga-panel--bg-rinku{background:linear-gradient(160deg,#fff5f7,#ffe5ec);}",
      ".nl-manga-panel--bg-konta{background:linear-gradient(160deg,#fffbeb,#fef0c7);}",
      ".nl-manga-panel--bg-tanunee{background:linear-gradient(160deg,#fef6ef,#f5e0c9);}",
      ".nl-manga-panel--bg-neutral{background:linear-gradient(160deg,#fafafa,#eef2f7);}",
      ".nl-manga-panel--bg-gold{background:linear-gradient(160deg,#fff7d6,#ffe9a3);}",
      ".nl-manga-panel--bg-pink{background:linear-gradient(160deg,#fff0f5,#ffd6e6);}",
      ".nl-manga-panel--scene-opening{grid-column:1/-1;}",
      ".nl-manga-panel--scene-closing{grid-column:1/-1;}",
      ".nl-manga-panel__caption{font-size:clamp(10px,2.4vw,12px);font-weight:700;color:#6b7280;letter-spacing:0.06em;margin-bottom:clamp(6px,1.5vw,10px);line-height:1.3;}",
      ".nl-manga-panel__body{display:flex;flex-direction:column;gap:clamp(8px,2vw,12px);}",
      ".nl-manga-panel__dialogues{display:flex;flex-direction:column;gap:clamp(8px,2vw,12px);}",
      /* ── 会話（顔と吹き出し）── */
      ".nl-manga-dialogue{display:flex;align-items:flex-start;gap:clamp(8px,2vw,14px);min-width:0;}",
      /* 極狭幅 (480px 未満) では konta も顔を左に揃える（読みやすさ優先） */
      ".nl-manga-dialogue--konta{flex-direction:row-reverse;}",
      "@media (max-width:480px){.nl-manga-dialogue--konta{flex-direction:row;}}",
      ".nl-manga-face-wrap{display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;}",
      ".nl-manga-face{border-radius:50%;background:#fff;border:2px solid #1f2937;box-shadow:2px 2px 0 #1f2937;display:block;}",
      /* 顔サイズは clamp で widths 追従。big/medium/small は段階的に小さく */
      ".nl-manga-dialogue--big .nl-manga-face{width:clamp(64px,18vw,96px);height:clamp(64px,18vw,96px);}",
      ".nl-manga-dialogue--medium .nl-manga-face{width:clamp(54px,14vw,72px);height:clamp(54px,14vw,72px);}",
      ".nl-manga-dialogue--small .nl-manga-face{width:clamp(44px,11vw,56px);height:clamp(44px,11vw,56px);}",
      ".nl-manga-name{font-size:clamp(10px,2.4vw,12px);font-weight:800;color:#1f2937;line-height:1.2;}",
      /* ── 吹き出し ── */
      ".nl-manga-bubble{position:relative;flex:1 1 auto;min-width:0;background:#fff;border:2px solid #1f2937;border-radius:clamp(10px,2.5vw,16px);padding:clamp(8px,2vw,12px) clamp(10px,2.5vw,15px);box-shadow:2px 2px 0 #1f2937;}",
      '.nl-manga-bubble::before{content:"";position:absolute;left:-12px;top:18px;width:0;height:0;border-style:solid;border-width:8px 12px 8px 0;border-color:transparent #1f2937 transparent transparent;}',
      '.nl-manga-bubble::after{content:"";position:absolute;left:-9px;top:20px;width:0;height:0;border-style:solid;border-width:6px 10px 6px 0;border-color:transparent #fff transparent transparent;}',
      ".nl-manga-dialogue--konta .nl-manga-bubble::before{left:auto;right:-12px;border-width:8px 0 8px 12px;border-color:transparent transparent transparent #1f2937;}",
      ".nl-manga-dialogue--konta .nl-manga-bubble::after{left:auto;right:-9px;border-width:6px 0 6px 10px;border-color:transparent transparent transparent #fff;}",
      /* 極狭幅で konta が逆になった時のしっぽ向き直し */
      "@media (max-width:480px){.nl-manga-dialogue--konta .nl-manga-bubble::before{left:-12px;right:auto;border-width:8px 12px 8px 0;border-color:transparent #1f2937 transparent transparent;}.nl-manga-dialogue--konta .nl-manga-bubble::after{left:-9px;right:auto;border-width:6px 10px 6px 0;border-color:transparent #fff transparent transparent;}}",
      ".nl-manga-bubble__text{margin:0;font-size:clamp(13px,3.2vw,15px);line-height:1.55;color:#111827;font-weight:600;overflow-wrap:anywhere;word-break:break-word;}",
      ".nl-manga-dialogue--big .nl-manga-bubble__text{font-size:clamp(14px,3.6vw,16px);}",
      /* ── 強調数字 ── */
      ".nl-manga-highlight{display:inline-block;padding:clamp(6px,1.6vw,9px) clamp(10px,2.5vw,15px);background:#1f2937;color:#fff;border-radius:6px;align-self:flex-start;box-shadow:3px 3px 0 #fff,3px 3px 0 1px #1f2937;max-width:100%;}",
      ".nl-manga-highlight__value{font-size:clamp(18px,5vw,26px);font-weight:900;letter-spacing:0.04em;line-height:1.1;overflow-wrap:anywhere;}",
      ".nl-manga-highlight__label{font-size:clamp(10px,2.4vw,12px);font-weight:700;color:#fbbf24;letter-spacing:0.06em;margin-top:2px;}",
      ".nl-manga-panel--bg-gold .nl-manga-highlight{background:#7c2d12;}",
      ".nl-manga-panel--bg-pink .nl-manga-highlight{background:#9f1239;}",
      ".nl-manga-panel--bg-konta .nl-manga-highlight{background:#92400e;}",
      /* ── 擬音語 ── */
      /* 極狭幅では絶対配置だと邪魔なので、768px 未満では下に普通に並べる */
      '.nl-manga-onomatopoeia{display:inline-block;margin-top:8px;font-size:clamp(15px,4vw,20px);font-weight:900;color:#dc2626;text-shadow:1px 1px 0 #fff,2px 2px 0 #1f2937;font-family:"Impact","Arial Black",sans-serif;letter-spacing:0.06em;transform:rotate(-4deg);pointer-events:none;align-self:flex-end;}',
      "@media (min-width:768px){.nl-manga-onomatopoeia{position:absolute;right:14px;bottom:10px;margin-top:0;}.nl-manga-panel--scene-opening .nl-manga-onomatopoeia,.nl-manga-panel--scene-closing .nl-manga-onomatopoeia{top:14px;bottom:auto;}}",
      /* prefers-reduced-motion 対応：傾きを軽く */
      "@media (prefers-reduced-motion:reduce){.nl-manga-onomatopoeia{transform:none;}}",
      /* ダーク背景の HTML レポート向け：色を反転して可読性確保 */
      "@media (prefers-color-scheme:dark){.nl-manga-summary__heading{color:#e5e7eb;}.nl-manga-bubble__text{color:#111827;}}"
    ].join("\n");
  }

  // src/lib/marketingReportEmbed.js
  function cloneReportForJsonEmbed(report, maskShareLabels) {
    const r = (
      /** @type {MarketingReport} */
      JSON.parse(JSON.stringify(report))
    );
    if (!maskShareLabels) return r;
    const maskUser = (u) => ({
      ...u,
      nickname: maskLabelForShare(String(u.nickname || "")),
      userId: maskLabelForShare(String(u.userId || "")),
      avatarUrl: ""
    });
    r.topUsers = r.topUsers.map(maskUser);
    if (Array.isArray(r.allNumericCommenters)) {
      r.allNumericCommenters = r.allNumericCommenters.map(maskUser);
    }
    if (r.commenterFollowDataset && Array.isArray(r.commenterFollowDataset.rows)) {
      r.commenterFollowDataset = {
        ...r.commenterFollowDataset,
        rows: r.commenterFollowDataset.rows.map((row) => ({
          ...row,
          userId: maskLabelForShare(String(row.userId || "")),
          nickname: maskLabelForShare(String(row.nickname || ""))
        }))
      };
    }
    return r;
  }
  var MARKETING_EMBED_NUMERIC_COMMENTERS_CAP = 200;
  function slimMarketingReportForHeavyEmbed(report, opts = {}) {
    const cap = typeof opts.maxNumericCommenters === "number" && opts.maxNumericCommenters > 0 ? Math.floor(opts.maxNumericCommenters) : MARKETING_EMBED_NUMERIC_COMMENTERS_CAP;
    const numeric = Array.isArray(report.allNumericCommenters) ? report.allNumericCommenters : [];
    if (numeric.length <= cap) return report;
    return {
      ...report,
      allNumericCommenters: numeric.slice(0, cap),
      commenterFollowDataset: report.commenterFollowDataset && Array.isArray(report.commenterFollowDataset.rows) && report.commenterFollowDataset.rows.length > cap ? {
        ...report.commenterFollowDataset,
        rows: report.commenterFollowDataset.rows.slice(0, cap)
      } : report.commenterFollowDataset
    };
  }
  function buildMarketingEmbedScriptInnerText(report, opts = {}) {
    const maskShareLabels = opts.maskShareLabels === true;
    const exportedAt = opts.exportedAt || (/* @__PURE__ */ new Date()).toISOString();
    let baseReport = report;
    if (opts.slimForHeavyExport === true) {
      baseReport = slimMarketingReportForHeavyEmbed(report, {
        maxNumericCommenters: opts.maxNumericCommenters
      });
    }
    const safeReport = cloneReportForJsonEmbed(baseReport, maskShareLabels);
    const payload = {
      schemaVersion: 1,
      exportedAt,
      maskShareLabels,
      slimForHeavyExport: opts.slimForHeavyExport === true,
      liveId: report.liveId,
      report: safeReport
    };
    return JSON.stringify(payload).replace(/</g, "\\u003c");
  }

  // src/lib/supporterPowerScoring.js
  function asNonNegativeNumber(v) {
    if (v == null) return null;
    if (typeof v === "string" && v.trim() === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  }
  function clampNumber(v, min, max) {
    if (!Number.isFinite(v)) return min;
    if (v < min) return min;
    if (v > max) return max;
    return v;
  }
  function logNorm(value, cap) {
    const v = asNonNegativeNumber(value);
    const c = asNonNegativeNumber(cap);
    if (v == null) return 0;
    if (c == null || c <= 0) return 0;
    const denom = Math.log1p(Math.max(1, c));
    if (denom <= 0) return 0;
    const x = 100 * Math.log1p(v) / denom;
    return clampNumber(x, 0, 100);
  }
  function percentileOf(values, p) {
    if (!Array.isArray(values) || values.length === 0) return 0;
    const xs = values.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
    if (xs.length === 0) return 0;
    const pp = clampNumber(p, 0, 100);
    if (xs.length === 1) return xs[0];
    const rank = pp / 100 * (xs.length - 1);
    const lo = Math.floor(rank);
    const hi = Math.ceil(rank);
    if (lo === hi) return xs[lo];
    const frac = rank - lo;
    return xs[lo] * (1 - frac) + xs[hi] * frac;
  }
  function medianOf(values) {
    return percentileOf(values, 50);
  }
  function weightedAverageAvailable(fields, weights) {
    if (!fields || !weights) return null;
    let sum = 0;
    let wTotal = 0;
    for (const key of Object.keys(weights)) {
      const w = Number(weights[key]);
      if (!Number.isFinite(w) || w <= 0) continue;
      const raw = fields[key];
      if (raw == null) continue;
      const v = Number(raw);
      if (!Number.isFinite(v)) continue;
      sum += v * w;
      wTotal += w;
    }
    if (wTotal <= 0) return null;
    return sum / wTotal;
  }
  function buildSupporterPowerScoringContext(inputs, opts = {}) {
    const rows = Array.isArray(inputs) ? inputs : [];
    const sampleSize = rows.length;
    const loyaltyWindowSize = Number.isFinite(Number(opts.loyaltyWindowSize)) && Number(opts.loyaltyWindowSize) > 0 ? Math.floor(Number(opts.loyaltyWindowSize)) : 30;
    const availableLiveCount = Number.isFinite(Number(opts.availableLiveCount)) && Number(opts.availableLiveCount) > 0 ? Math.floor(Number(opts.availableLiveCount)) : loyaltyWindowSize;
    const giftValues = [];
    let hasGiftData = false;
    for (const r of rows) {
      const v = asNonNegativeNumber(r?.giftTotalPoints);
      if (v != null && v > 0) hasGiftData = true;
      if (v != null) giftValues.push(v);
    }
    const commentValues = rows.map((r) => asNonNegativeNumber(r?.commentCount)).filter((v) => v != null);
    const followerValues = rows.map((r) => asNonNegativeNumber(r?.followerCount)).filter((v) => v != null);
    const followeeValues = rows.map((r) => asNonNegativeNumber(r?.followeeCount)).filter((v) => v != null);
    const levelValues = rows.map((r) => asNonNegativeNumber(r?.userLevel)).filter((v) => v != null);
    const useP90 = sampleSize < 20;
    const commentCap = Math.max(
      1,
      useP90 ? percentileOf(
        /** @type {number[]} */
        commentValues,
        90
      ) : percentileOf(
        /** @type {number[]} */
        commentValues,
        95
      )
    );
    const positiveGifts = (
      /** @type {number[]} */
      giftValues.filter((v) => v > 0)
    );
    const giftCap = positiveGifts.length === 0 ? 1 : sampleSize < 20 ? Math.max(...positiveGifts) : percentileOf(positiveGifts, 95);
    const followerCap = Math.max(
      10,
      percentileOf(
        /** @type {number[]} */
        followerValues,
        95
      )
    );
    const followeeCap = Math.max(
      50,
      percentileOf(
        /** @type {number[]} */
        followeeValues,
        95
      )
    );
    const levelCapRaw = percentileOf(
      /** @type {number[]} */
      levelValues,
      95
    );
    const levelCap = Math.max(50, levelCapRaw);
    let tierMode;
    let allowS;
    if (sampleSize >= 20) {
      tierMode = "normal";
      allowS = true;
    } else if (sampleSize >= 5) {
      tierMode = "smallSample";
      allowS = true;
    } else {
      tierMode = "verySmall";
      allowS = false;
    }
    return {
      sampleSize,
      hasGiftData,
      loyaltyWindowSize,
      availableLiveCount,
      commentCap,
      giftCap,
      followerCap,
      followeeCap,
      levelCap,
      influenceMedian: null,
      // 後で influence を計算してから埋める（computeAllSupporterPowers で）
      tierMode,
      allowS
    };
  }
  function computeEngagementScore(input, ctx) {
    const commentScore = logNorm(input?.commentCount, ctx.commentCap);
    if (!ctx.hasGiftData) return clampNumber(commentScore, 0, 100);
    const giftScore = logNorm(input?.giftTotalPoints, ctx.giftCap);
    return clampNumber(0.7 * commentScore + 0.3 * giftScore, 0, 100);
  }
  function computeLoyaltyScore(input, ctx) {
    const raw = input?.loyaltyCount == null ? 1 : asNonNegativeNumber(input.loyaltyCount);
    const lc = raw == null ? 1 : raw;
    const effectiveN = Math.min(
      ctx.loyaltyWindowSize,
      Math.max(1, ctx.availableLiveCount)
    );
    const ratio = clampNumber(lc / effectiveN, 0, 1);
    return clampNumber(100 * Math.sqrt(ratio), 0, 100);
  }
  function computeInfluenceScore(input, ctx) {
    const followerVal = asNonNegativeNumber(input?.followerCount);
    const followeeVal = asNonNegativeNumber(input?.followeeCount);
    const levelVal = asNonNegativeNumber(input?.userLevel);
    const premiumKnown = typeof input?.isPremium === "boolean";
    const followerScore = followerVal == null ? null : logNorm(followerVal, ctx.followerCap);
    const followeeScore = followeeVal == null ? null : logNorm(followeeVal, ctx.followeeCap);
    const levelScore = levelVal == null ? null : clampNumber(100 * levelVal / Math.max(1, ctx.levelCap), 0, 100);
    const premiumScore = premiumKnown ? input.isPremium ? 100 : 0 : null;
    const fields = {
      followerScore,
      levelScore,
      followeeScore,
      premiumScore
    };
    const weights = {
      followerScore: 0.6,
      levelScore: 0.2,
      followeeScore: 0.1,
      premiumScore: 0.1
    };
    let availableFields = 0;
    for (const k of Object.keys(fields)) {
      if (fields[
        /** @type {keyof typeof fields} */
        k
      ] != null) availableFields += 1;
    }
    const value = weightedAverageAvailable(fields, weights);
    return { value: value == null ? null : clampNumber(value, 0, 100), availableFields };
  }
  function computeSupporterRawScore(input, ctx) {
    const engagement = computeEngagementScore(input, ctx);
    const loyalty = computeLoyaltyScore(input, ctx);
    const inf = computeInfluenceScore(input, ctx);
    const influence = inf.value == null ? ctx.influenceMedian == null ? 50 : ctx.influenceMedian : inf.value;
    const raw = 0.45 * engagement + 0.35 * loyalty + 0.2 * influence;
    return {
      score: clampNumber(raw, 0, 100),
      components: {
        engagement: clampNumber(engagement, 0, 100),
        loyalty: clampNumber(loyalty, 0, 100),
        influence: clampNumber(influence, 0, 100)
      },
      coverage: {
        hasGiftData: ctx.hasGiftData,
        influenceFieldsAvailable: inf.availableFields
      },
      _influenceWasMissing: inf.value == null
    };
  }
  function classifyTier(row, percentile, ctx) {
    const score = row.score;
    const eng = row.components.engagement;
    const loy = row.components.loyalty;
    const quietHighInfluence = eng < 20 && loy < 20;
    const heavyRegular = loy >= 90 && eng >= 55;
    let tier;
    if (ctx.tierMode === "normal") {
      if (ctx.allowS && score >= 90 && percentile >= 99) tier = "S";
      else if (score >= 80 && percentile >= 95) tier = "A";
      else if (score >= 65 && percentile >= 80) tier = "B";
      else if (score >= 50 && percentile >= 50) tier = "C";
      else if (score >= 35) tier = "D";
      else tier = "E";
    } else if (ctx.tierMode === "smallSample") {
      if (ctx.allowS && score >= 92) tier = "S";
      else if (score >= 80) tier = "A";
      else if (score >= 65) tier = "B";
      else if (score >= 50) tier = "C";
      else if (score >= 35) tier = "D";
      else tier = "E";
    } else {
      if (score >= 80) tier = "A";
      else if (score >= 65) tier = "B";
      else if (score >= 50) tier = "C";
      else if (score >= 35) tier = "D";
      else tier = "E";
    }
    if (quietHighInfluence) {
      if (tier === "S" || tier === "A") tier = "B";
    }
    if (heavyRegular) {
      if (tier === "C" || tier === "D" || tier === "E") tier = "B";
    }
    return tier;
  }
  function computeAllSupporterPowers(inputs, opts = {}) {
    const rows = Array.isArray(inputs) ? inputs : [];
    const ctx = buildSupporterPowerScoringContext(rows, opts);
    const firstPass = rows.map((input) => computeSupporterRawScore(input, ctx));
    const influenceValuesForMedian = firstPass.filter((r) => !r._influenceWasMissing).map((r) => r.components.influence);
    const influenceMedian = influenceValuesForMedian.length > 0 ? medianOf(influenceValuesForMedian) : null;
    const ctxFinal = { ...ctx, influenceMedian };
    const finalRaw = rows.map((input, i) => {
      if (!firstPass[i]._influenceWasMissing) return firstPass[i];
      return computeSupporterRawScore(input, ctxFinal);
    });
    const scoresOnly = finalRaw.map((r) => r.score);
    const sortedScores = scoresOnly.slice().sort((a, b) => a - b);
    const percentileFor = (s) => {
      if (sortedScores.length === 0) return 0;
      if (sortedScores.length === 1) return 100;
      let lo = 0;
      let hi = sortedScores.length - 1;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (sortedScores[mid] < s) lo = mid + 1;
        else hi = mid;
      }
      const firstGe = lo;
      let lo2 = 0;
      let hi2 = sortedScores.length - 1;
      while (lo2 < hi2) {
        const mid = Math.ceil((lo2 + hi2) / 2);
        if (sortedScores[mid] > s) hi2 = mid - 1;
        else lo2 = mid;
      }
      const lastLe = lo2;
      const avgRank = (firstGe + lastLe) / 2;
      return clampNumber(avgRank / (sortedScores.length - 1) * 100, 0, 100);
    };
    const out = rows.map((input, i) => {
      const raw = finalRaw[i];
      const percentile = percentileFor(raw.score);
      const power = {
        score: Math.round(raw.score),
        tier: classifyTier(raw, percentile, ctxFinal),
        components: {
          engagement: Math.round(raw.components.engagement),
          loyalty: Math.round(raw.components.loyalty),
          influence: Math.round(raw.components.influence)
        },
        percentile: Math.round(percentile),
        coverage: raw.coverage
      };
      return { input, power };
    });
    return { rows: out, context: ctxFinal };
  }
  function buildSupporterPowerSummary(computedRows, opts = {}) {
    const rows = Array.isArray(computedRows) ? computedRows : [];
    const tierCounts = { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0 };
    for (const r of rows) {
      const t = r?.power?.tier;
      if (t === "S" || t === "A" || t === "B" || t === "C" || t === "D" || t === "E") {
        tierCounts[t] += 1;
      }
    }
    const scores = rows.map((r) => Number(r?.power?.score) || 0);
    const medianScore = scores.length === 0 ? 0 : Math.round(medianOf(scores));
    const topN = Number.isFinite(Number(opts.topN)) && Number(opts.topN) > 0 ? Math.floor(Number(opts.topN)) : 10;
    const sorted = rows.slice().sort((a, b) => {
      if (b.power.score !== a.power.score) return b.power.score - a.power.score;
      const ac = Number(a.input?.commentCount) || 0;
      const bc = Number(b.input?.commentCount) || 0;
      if (bc !== ac) return bc - ac;
      const al = Number(a.input?.loyaltyCount) || 0;
      const bl = Number(b.input?.loyaltyCount) || 0;
      if (bl !== al) return bl - al;
      return String(a.input?.userId || "").localeCompare(String(b.input?.userId || ""));
    });
    return {
      sampleSize: rows.length,
      tierCounts,
      medianScore,
      topRows: sorted.slice(0, topN)
    };
  }

  // src/lib/commenterFollowAnalytics.js
  function asRecord(v) {
    return v && typeof v === "object" && !Array.isArray(v) ? (
      /** @type {Record<string, unknown>} */
      v
    ) : null;
  }
  function nonNegativeIntOrNull(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.floor(n);
  }
  function nonNegativeIntOrUndefined(v) {
    const n = nonNegativeIntOrNull(v);
    return n == null ? void 0 : n;
  }
  function boolOrUndefined(v) {
    return typeof v === "boolean" ? v : void 0;
  }
  function firstDefined(values) {
    for (const v of values) {
      if (v !== void 0 && v !== null) return v;
    }
    return void 0;
  }
  function followDatasetRowMap(dataset) {
    const out = /* @__PURE__ */ new Map();
    const ds = asRecord(dataset);
    const rows = Array.isArray(ds?.rows) ? ds.rows : [];
    for (const item of rows) {
      const row = asRecord(item);
      if (!row) continue;
      const uid = String(row.userId || "").trim();
      if (!uid) continue;
      out.set(uid, row);
    }
    return out;
  }
  function analyticsRowFromRecords(src, follow) {
    const uid = String(firstDefined([src.userId, follow?.userId]) || "").trim();
    if (!uid) return null;
    const commentCount = nonNegativeIntOrNull(firstDefined([src.count, src.commentCount, follow?.commentCount])) ?? 0;
    const row = {
      userId: uid,
      nickname: String(firstDefined([src.nickname, follow?.nickname]) || "").trim(),
      avatarUrl: String(src.avatarUrl || "").trim(),
      commentCount
    };
    const followerCount = nonNegativeIntOrUndefined(firstDefined([src.followerCount, follow?.followerCount]));
    const followeeCount = nonNegativeIntOrUndefined(firstDefined([src.followeeCount, follow?.followeeCount]));
    const userLevel = nonNegativeIntOrUndefined(
      firstDefined([src.userLevel, src.level, follow?.userLevel, follow?.level])
    );
    const accountStatus = nonNegativeIntOrUndefined(src.accountStatus);
    const firstAt = nonNegativeIntOrUndefined(src.firstAt);
    const lastAt = nonNegativeIntOrUndefined(src.lastAt);
    const followFetchedAt = nonNegativeIntOrUndefined(
      firstDefined([src.followFetchedAt, follow?.followFetchedAt, follow?.fetchedAt])
    );
    const isPremium = boolOrUndefined(firstDefined([src.isPremium, follow?.isPremium]));
    if (followerCount !== void 0) row.followerCount = followerCount;
    if (followeeCount !== void 0) row.followeeCount = followeeCount;
    if (userLevel !== void 0 && userLevel > 0) row.userLevel = userLevel;
    if (isPremium !== void 0) row.isPremium = isPremium;
    if (accountStatus !== void 0) row.accountStatus = accountStatus;
    if (firstAt !== void 0) row.firstAt = firstAt;
    if (lastAt !== void 0) row.lastAt = lastAt;
    if (followFetchedAt !== void 0) row.followFetchedAt = followFetchedAt;
    return row;
  }
  function normalizeCommenterFollowAnalyticsRows(allNumericCommenters, opts = {}) {
    const src = Array.isArray(allNumericCommenters) ? allNumericCommenters : [];
    const followMap = followDatasetRowMap(opts.commenterFollowDataset);
    const excludeUid = String(opts.excludeUserId || "").trim();
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const item of src) {
      const record = asRecord(item);
      if (!record) continue;
      const uid = String(record.userId || "").trim();
      const row = analyticsRowFromRecords(record, uid ? followMap.get(uid) : void 0);
      if (!row) continue;
      if (excludeUid && row.userId === excludeUid) continue;
      out.push(row);
      seen.add(row.userId);
    }
    for (const [uid, follow] of followMap) {
      if (seen.has(uid)) continue;
      if (excludeUid && uid === excludeUid) continue;
      const row = analyticsRowFromRecords(follow, void 0);
      if (row) out.push(row);
    }
    out.sort((a, b) => b.commentCount - a.commentCount || a.userId.localeCompare(b.userId));
    return out;
  }
  function computePercentile(values, percentileValue) {
    const nums = values.filter((v) => Number.isFinite(v)).map((v) => Number(v)).sort((a, b) => a - b);
    if (!nums.length) return 0;
    const pct = Math.max(0, Math.min(100, Number(percentileValue)));
    const idx = (nums.length - 1) * pct / 100;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return nums[lo];
    const weight = idx - lo;
    return nums[lo] * (1 - weight) + nums[hi] * weight;
  }
  function computeCommenterFollowThresholds(allNumericCommenters, opts = {}) {
    const rows = normalizeCommenterFollowAnalyticsRows(allNumericCommenters, opts).filter(
      (row) => typeof row.followerCount === "number"
    );
    const highPercentile = Number.isFinite(Number(opts.highPercentile)) ? Math.max(0, Math.min(100, Number(opts.highPercentile))) : 75;
    const followerValues = rows.map((row) => Number(row.followerCount));
    const commentValues = rows.map((row) => row.commentCount);
    const followerPct = computePercentile(followerValues, highPercentile);
    const commentPct = computePercentile(commentValues, highPercentile);
    return {
      sampleSize: rows.length,
      highPercentile,
      followerCount: {
        median: computePercentile(followerValues, 50),
        percentile: followerPct,
        threshold: rows.length ? Math.max(1, Math.ceil(followerPct)) : 0
      },
      commentCount: {
        median: computePercentile(commentValues, 50),
        percentile: commentPct,
        threshold: rows.length ? Math.max(1, Math.ceil(commentPct)) : 0
      }
    };
  }
  function classifySegment(row, thresholds) {
    const followerHigh = typeof row.followerCount === "number" && thresholds.followerCount.threshold > 0 && row.followerCount >= thresholds.followerCount.threshold;
    const commentHigh = thresholds.commentCount.threshold > 0 && row.commentCount >= thresholds.commentCount.threshold;
    if (followerHigh && commentHigh) return "highFollowerRegulars";
    if (!followerHigh && commentHigh) return "localEnthusiasts";
    if (followerHigh && !commentHigh) return "quietSupporters";
    return "other";
  }
  function pctOf(count, total) {
    return total > 0 ? Math.round(count / total * 1e3) / 10 : 0;
  }
  function makeSegment(id, label, description, rows, total) {
    const count = rows.length;
    const pct = pctOf(count, total);
    return {
      id,
      label,
      description,
      count,
      pctOfFollowed: pct,
      summary: `${label}は${count}名（フォロワー数取得済みの${pct}%）です。${description}`,
      representatives: rows.slice(0, 3),
      rows
    };
  }
  function buildCommenterFollowSegments(allNumericCommenters, opts = {}) {
    const thresholds = opts.thresholds || computeCommenterFollowThresholds(allNumericCommenters, opts);
    const rows = normalizeCommenterFollowAnalyticsRows(allNumericCommenters, opts).filter(
      (row) => typeof row.followerCount === "number"
    );
    const highFollowerRegulars = [];
    const localEnthusiasts = [];
    const quietSupporters = [];
    for (const row of rows) {
      const id = classifySegment(row, thresholds);
      if (id === "highFollowerRegulars") highFollowerRegulars.push(row);
      else if (id === "localEnthusiasts") localEnthusiasts.push(row);
      else if (id === "quietSupporters") quietSupporters.push(row);
    }
    const byCommentThenFollower = (a, b) => b.commentCount - a.commentCount || (Number(b.followerCount) || 0) - (Number(a.followerCount) || 0);
    const byFollowerThenComment = (a, b) => (Number(b.followerCount) || 0) - (Number(a.followerCount) || 0) || b.commentCount - a.commentCount;
    highFollowerRegulars.sort(byCommentThenFollower);
    localEnthusiasts.sort(byCommentThenFollower);
    quietSupporters.sort(byFollowerThenComment);
    return {
      highFollowerRegulars: makeSegment(
        "highFollowerRegulars",
        "高フォロワー常連",
        "外から見つかりやすい人が、この配信でも継続的に反応している層です。",
        highFollowerRegulars,
        rows.length
      ),
      localEnthusiasts: makeSegment(
        "localEnthusiasts",
        "ローカル熱心層",
        "外部フォロワー規模より、この枠での参加量が強く出た層です。",
        localEnthusiasts,
        rows.length
      ),
      quietSupporters: makeSegment(
        "quietSupporters",
        "静かな支援",
        "外部フォロワー規模は大きめでも、この枠では少数コメントで支えていた層です。",
        quietSupporters,
        rows.length
      )
    };
  }
  function buildCommenterFollowScatterPoints(allNumericCommenters, opts = {}) {
    const thresholds = opts.thresholds || computeCommenterFollowThresholds(allNumericCommenters, opts);
    return normalizeCommenterFollowAnalyticsRows(allNumericCommenters, opts).filter((row) => typeof row.followerCount === "number").map((row) => ({
      userId: row.userId,
      nickname: row.nickname,
      label: row.nickname || row.userId,
      followerCount: Number(row.followerCount),
      commentCount: row.commentCount,
      segmentId: classifySegment(row, thresholds)
    }));
  }
  function analyzeCommenterFollowDeltas(rows, priorMap = {}) {
    const prior = priorMap && typeof priorMap === "object" ? priorMap : {};
    const increased = [];
    const decreased = [];
    let unchangedCount = 0;
    let comparedCount = 0;
    let netFollowerDelta = 0;
    let netFolloweeDelta = 0;
    for (const row of rows) {
      if (typeof row.followerCount !== "number") continue;
      const rawPrior = prior[row.userId];
      const prevRec = asRecord(rawPrior);
      if (!prevRec) continue;
      const prevFollower = nonNegativeIntOrNull(prevRec.followerCount);
      if (prevFollower === null) continue;
      const prevFollowee = nonNegativeIntOrNull(prevRec.followeeCount) ?? 0;
      const prevFetchedAt = nonNegativeIntOrNull(prevRec.fetchedAt) ?? 0;
      const curFetchedAt = row.followFetchedAt ?? 0;
      if (curFetchedAt > 0 && prevFetchedAt > 0 && curFetchedAt <= prevFetchedAt) continue;
      const dFollower = row.followerCount - prevFollower;
      const dFollowee = (row.followeeCount ?? 0) - prevFollowee;
      comparedCount += 1;
      netFollowerDelta += dFollower;
      netFolloweeDelta += dFollowee;
      if (dFollower === 0 && dFollowee === 0) {
        unchangedCount += 1;
        continue;
      }
      const deltaRow = {
        userId: row.userId,
        nickname: row.nickname,
        followerDelta: dFollower,
        followeeDelta: dFollowee,
        priorFollowerCount: prevFollower,
        currentFollowerCount: row.followerCount,
        commentCount: row.commentCount,
        priorFetchedAt: prevFetchedAt || void 0
      };
      if (typeof row.followeeCount === "number") deltaRow.currentFolloweeCount = row.followeeCount;
      if (typeof row.firstAt === "number") deltaRow.firstAt = row.firstAt;
      if (dFollower > 0 || dFollower === 0 && dFollowee > 0) increased.push(deltaRow);
      else decreased.push(deltaRow);
    }
    increased.sort(
      (a, b) => b.followerDelta - a.followerDelta || b.followeeDelta - a.followeeDelta || b.commentCount - a.commentCount
    );
    decreased.sort(
      (a, b) => a.followerDelta - b.followerDelta || a.followeeDelta - b.followeeDelta || b.commentCount - a.commentCount
    );
    const insightLines = [];
    if (comparedCount > 0) {
      insightLines.push(
        `キャッシュ比較 ${comparedCount}名中、フォロワー増 ${increased.length}名・減 ${decreased.length}名（純増 ${netFollowerDelta >= 0 ? "+" : ""}${netFollowerDelta}）。`
      );
      if (netFolloweeDelta !== 0) {
        insightLines.push(
          `フォロー数（followee）の純増減は ${netFolloweeDelta >= 0 ? "+" : ""}${netFolloweeDelta} です。`
        );
      }
    } else {
      insightLines.push(
        "前回キャッシュとの比較データがまだありません。配信をまたいで同じコメンターが取れると増減が見えます。"
      );
    }
    return {
      comparedCount,
      increased,
      decreased,
      unchangedCount,
      netFollowerDelta,
      netFolloweeDelta,
      insightLines
    };
  }
  function analyzeCommenterFolloweeProfile(rows) {
    const withFollowee = rows.filter((row) => typeof row.followeeCount === "number");
    const withLevel = rows.filter((row) => typeof row.userLevel === "number" && row.userLevel > 0);
    const premiumCount = rows.filter((row) => row.isPremium === true).length;
    const followeeValues = withFollowee.map((row) => Number(row.followeeCount));
    const followeeBuckets = [
      { label: "0〜50人", count: 0, pct: 0 },
      { label: "51〜200人", count: 0, pct: 0 },
      { label: "201〜500人", count: 0, pct: 0 },
      { label: "501人以上", count: 0, pct: 0 }
    ];
    for (const row of withFollowee) {
      const n = Number(row.followeeCount);
      if (n <= 50) followeeBuckets[0].count += 1;
      else if (n <= 200) followeeBuckets[1].count += 1;
      else if (n <= 500) followeeBuckets[2].count += 1;
      else followeeBuckets[3].count += 1;
    }
    for (const bucket of followeeBuckets) {
      bucket.pct = pctOf(bucket.count, withFollowee.length);
    }
    const levelBuckets = [
      { label: "LV 1〜9", count: 0, pct: 0 },
      { label: "LV 10〜19", count: 0, pct: 0 },
      { label: "LV 20〜29", count: 0, pct: 0 },
      { label: "LV 30+", count: 0, pct: 0 }
    ];
    for (const row of withLevel) {
      const lv = Number(row.userLevel);
      if (lv < 10) levelBuckets[0].count += 1;
      else if (lv < 20) levelBuckets[1].count += 1;
      else if (lv < 30) levelBuckets[2].count += 1;
      else levelBuckets[3].count += 1;
    }
    for (const bucket of levelBuckets) {
      bucket.pct = pctOf(bucket.count, withLevel.length);
    }
    const insightLines = [];
    if (withFollowee.length) {
      const median2 = computePercentile(followeeValues, 50);
      insightLines.push(
        `コメンター ${withFollowee.length}名のフォロー数（followee）中央値は ${Math.round(median2)} 人です。`
      );
      const heavy = followeeBuckets[3].count + followeeBuckets[2].count;
      if (heavy > 0) {
        insightLines.push(
          `201人以上フォローしている層が ${heavy}名（${pctOf(heavy, withFollowee.length)}%）。`
        );
      }
    }
    if (rows.length) {
      insightLines.push(`プレミアム会員は ${premiumCount}名（${pctOf(premiumCount, rows.length)}%）。`);
    }
    return {
      sampleSize: withFollowee.length,
      medianFolloweeCount: followeeValues.length ? Math.round(computePercentile(followeeValues, 50)) : 0,
      premiumPct: pctOf(premiumCount, rows.length),
      levelBuckets,
      followeeBuckets,
      insightLines
    };
  }
  function analyzeCommenterFollowTimingByCommentWindow(rows, deltas, opts = {}) {
    const labels = ["序盤(0-25%)", "前半(25-50%)", "後半(50-75%)", "終盤(75-100%)"];
    const buckets = labels.map((label) => ({
      label,
      commenterCount: 0,
      increasedCount: 0,
      decreasedCount: 0,
      netFollowerDelta: 0
    }));
    const timedRows = rows.filter((row) => typeof row.firstAt === "number" && row.firstAt > 0);
    if (!timedRows.length) {
      return {
        buckets,
        insightLines: ["初コメ時刻が取れないため、配信内タイミング別の増減は出せません。"]
      };
    }
    const firstTimes = timedRows.map((row) => Number(row.firstAt));
    const minAt = Math.min(...firstTimes);
    const maxAt = Math.max(...firstTimes);
    const spanMs = Number.isFinite(Number(opts.durationMs)) && Number(opts.durationMs) > 0 ? Number(opts.durationMs) : Math.max(1, maxAt - minAt);
    const deltaByUid = /* @__PURE__ */ new Map();
    for (const row of deltas.increased) deltaByUid.set(row.userId, row);
    for (const row of deltas.decreased) deltaByUid.set(row.userId, row);
    for (const row of timedRows) {
      const rel = Math.max(0, Math.min(1, (Number(row.firstAt) - minAt) / spanMs));
      const idx = Math.min(3, Math.floor(rel * 4));
      buckets[idx].commenterCount += 1;
      const delta = deltaByUid.get(row.userId);
      if (!delta) continue;
      if (delta.followerDelta > 0 || delta.followerDelta === 0 && delta.followeeDelta > 0) {
        buckets[idx].increasedCount += 1;
      } else if (delta.followerDelta < 0 || delta.followerDelta === 0 && delta.followeeDelta < 0) {
        buckets[idx].decreasedCount += 1;
      }
      buckets[idx].netFollowerDelta += delta.followerDelta;
    }
    const insightLines = [];
    const busiest = buckets.reduce(
      (best, bucket) => bucket.increasedCount + bucket.decreasedCount > best.increasedCount + best.decreasedCount ? bucket : best
    );
    if (busiest.increasedCount + busiest.decreasedCount > 0) {
      insightLines.push(
        `フォロワー増減が目立ったのは ${busiest.label}（増 ${busiest.increasedCount} / 減 ${busiest.decreasedCount}）。`
      );
    } else if (deltas.comparedCount > 0) {
      insightLines.push("初コメ時刻帯ごとの増減差は小さめです。");
    }
    return { buckets, insightLines };
  }
  function analyzeCommenterBroadcasterFollow(rows, listMap = {}, broadcasterUserId = "") {
    const bUid = String(broadcasterUserId || "").trim();
    const map = listMap && typeof listMap === "object" ? listMap : {};
    let sampleSize = 0;
    let followedCount = 0;
    let notFetchedCount = 0;
    const seen = /* @__PURE__ */ new Set();
    for (const row of rows) {
      const uid = String(row.userId || "").trim();
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      const hit = asRecord(map[uid]);
      if (!hit || hit.status !== "ok") {
        notFetchedCount += 1;
        continue;
      }
      sampleSize += 1;
      const ids = Array.isArray(hit.userIds) ? hit.userIds.map((v) => String(v)) : [];
      if (bUid && ids.includes(bUid)) followedCount += 1;
    }
    return {
      followedCount,
      sampleSize,
      pct: pctOf(followedCount, sampleSize),
      notFetchedCount,
      broadcasterUserId: bUid
    };
  }
  function analyzeCommonFolloweesAmongCommenters(listMap = {}, opts = {}) {
    const map = listMap && typeof listMap === "object" ? listMap : {};
    const topN = Number.isFinite(Number(opts.topN)) && Number(opts.topN) > 0 ? Math.floor(Number(opts.topN)) : 20;
    const minOverlap = Number.isFinite(Number(opts.minOverlap)) && Number(opts.minOverlap) > 1 ? Math.floor(Number(opts.minOverlap)) : 2;
    const counter = /* @__PURE__ */ new Map();
    for (const entryRaw of Object.values(map)) {
      const entry = asRecord(entryRaw);
      if (!entry || entry.status !== "ok") continue;
      const ids = Array.isArray(entry.userIds) ? entry.userIds : [];
      const seen = /* @__PURE__ */ new Set();
      for (const rawId of ids) {
        const uid = String(rawId || "").trim();
        if (!/^\d{1,18}$/.test(uid) || seen.has(uid)) continue;
        seen.add(uid);
        counter.set(uid, (counter.get(uid) || 0) + 1);
      }
    }
    return [...counter.entries()].filter(([, count]) => count >= minOverlap).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, topN).map(([userId, overlapCount]) => ({ userId, overlapCount }));
  }
  function buildCommenterFollowingListInsights(broadcasterFollow, coverage) {
    const lines = [];
    if (coverage?.loginRequired > 0) {
      lines.push(
        "ニコニコにログインした状態でレポートを出力すると、上位コメンターのフォロー先一覧が取得できます。"
      );
    }
    if (coverage?.error > 0 && !coverage?.loginRequired) {
      lines.push(
        `${coverage.error}名のフォロー一覧取得に失敗しました。ニコニコにログインしているか確認し、レポートを再出力してください。`
      );
    }
    if (coverage?.notAttempted > 0 && coverage?.attempted === 0) {
      lines.push("フォロー一覧はまだ取得していません。配信中またはレポート出力時に上位コメンターから順に取得します。");
    }
    if (coverage?.forbidden > 0) {
      lines.push(`${coverage.forbidden}名は公開設定によりフォロー一覧を取得できませんでした。`);
    }
    if (broadcasterFollow.sampleSize > 0 && broadcasterFollow.broadcasterUserId) {
      lines.push(
        `フォロー一覧取得済み ${broadcasterFollow.sampleSize}名のうち ${broadcasterFollow.followedCount}名が配信者をフォロー（${broadcasterFollow.pct}%）。`
      );
    } else if (broadcasterFollow.notFetchedCount > 0 && !lines.length) {
      lines.push("配信者フォロー率を出すには、上位コメンターのフォロー一覧取得が必要です。");
    }
    return lines;
  }
  function buildCommenterFollowAnalytics(allNumericCommenters, opts = {}) {
    const rows = normalizeCommenterFollowAnalyticsRows(allNumericCommenters, opts);
    const thresholds = computeCommenterFollowThresholds(rows, {
      highPercentile: opts.highPercentile
    });
    const rowsWithFollowerCount = rows.filter((row) => typeof row.followerCount === "number");
    const followDeltas = analyzeCommenterFollowDeltas(rows, opts.priorFollowEntries);
    const followeeProfile = analyzeCommenterFolloweeProfile(rows);
    const followTiming = analyzeCommenterFollowTimingByCommentWindow(rows, followDeltas, {
      durationMs: opts.durationMs
    });
    const broadcasterFollow = analyzeCommenterBroadcasterFollow(
      rows,
      opts.followingListMap,
      opts.excludeUserId
    );
    const commonFollowees = analyzeCommonFolloweesAmongCommenters(opts.followingListMap, {
      topN: 20
    });
    const followingListInsights = buildCommenterFollowingListInsights(
      broadcasterFollow,
      opts.followingListCoverage
    );
    const out = {
      rows,
      rowsWithFollowerCount,
      thresholds,
      scatterPoints: buildCommenterFollowScatterPoints(rows, { thresholds }),
      segments: buildCommenterFollowSegments(rows, { thresholds }),
      followDeltas,
      followeeProfile,
      followTiming,
      broadcasterFollow,
      commonFollowees,
      followingListInsights
    };
    if (opts.includeSupporterPower === true) {
      const sp = buildSupporterPowerOutputs(rows, opts);
      if (sp) {
        out.supporterPowerRows = sp.supporterPowerRows;
        out.supporterPowerSummary = sp.supporterPowerSummary;
      }
    }
    return out;
  }
  function buildSupporterPowerOutputs(rows, opts) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const giftTotals = opts.giftTotalsByUserId && typeof opts.giftTotalsByUserId === "object" ? (
      /** @type {any} */
      opts.giftTotalsByUserId
    ) : {};
    const loyaltyCounts = opts.loyaltyCountsByUserId && typeof opts.loyaltyCountsByUserId === "object" ? (
      /** @type {any} */
      opts.loyaltyCountsByUserId
    ) : {};
    const inputs = rows.map((r) => {
      const giftRaw = giftTotals[r.userId];
      const giftTotalPoints = typeof giftRaw === "number" && Number.isFinite(giftRaw) && giftRaw >= 0 ? giftRaw : 0;
      const loyaltyRaw = loyaltyCounts[r.userId];
      let loyaltyCount;
      if (typeof loyaltyRaw === "number" && Number.isFinite(loyaltyRaw) && loyaltyRaw >= 0) {
        loyaltyCount = Math.floor(loyaltyRaw);
      }
      const input = {
        userId: r.userId,
        nickname: r.nickname,
        commentCount: r.commentCount,
        giftTotalPoints
      };
      if (loyaltyCount !== void 0) input.loyaltyCount = loyaltyCount;
      if (typeof r.followerCount === "number") input.followerCount = r.followerCount;
      if (typeof r.followeeCount === "number") input.followeeCount = r.followeeCount;
      if (typeof r.isPremium === "boolean") input.isPremium = r.isPremium;
      if (typeof r.userLevel === "number") input.userLevel = r.userLevel;
      return input;
    });
    const { rows: computed } = computeAllSupporterPowers(inputs, {
      loyaltyWindowSize: opts.loyaltyWindowSize,
      availableLiveCount: opts.availableLiveCount
    });
    const thresholdsForSeg = computeCommenterFollowThresholds(rows, {
      highPercentile: opts.highPercentile
    });
    const segs = buildCommenterFollowSegments(rows, { thresholds: thresholdsForSeg });
    const segmentMap = {};
    for (
      const segId of
      /** @type {const} */
      [
        "highFollowerRegulars",
        "localEnthusiasts",
        "quietSupporters"
      ]
    ) {
      const bucket = (
        /** @type {any} */
        segs?.[segId]
      );
      const rowsForBucket = Array.isArray(bucket?.rows) ? bucket.rows : [];
      for (const seg of rowsForBucket) {
        if (seg?.userId) segmentMap[String(seg.userId)] = segId;
      }
    }
    const supporterPowerRows = computed.map((c) => ({
      userId: c.input.userId,
      nickname: c.input.nickname || "",
      commentCount: c.input.commentCount,
      giftTotalPoints: c.input.giftTotalPoints,
      loyaltyCount: c.input.loyaltyCount ?? null,
      followerCount: c.input.followerCount ?? null,
      followeeCount: c.input.followeeCount ?? null,
      isPremium: c.input.isPremium ?? null,
      userLevel: c.input.userLevel ?? null,
      power: c.power,
      segmentId: segmentMap[c.input.userId] || "other"
    }));
    const topN = typeof opts.supporterPowerTopN === "number" && opts.supporterPowerTopN > 0 ? Math.floor(opts.supporterPowerTopN) : 10;
    const summary = buildSupporterPowerSummary(
      computed.map((c) => ({ input: c.input, power: c.power })),
      { topN }
    );
    const topUidSet = new Set(summary.topRows.map((r) => r.input.userId));
    const topRowsEx = supporterPowerRows.filter((r) => topUidSet.has(r.userId));
    const orderIndex = {};
    summary.topRows.forEach((r, i) => {
      orderIndex[r.input.userId] = i;
    });
    topRowsEx.sort((a, b) => (orderIndex[a.userId] ?? 0) - (orderIndex[b.userId] ?? 0));
    return {
      supporterPowerRows,
      supporterPowerSummary: {
        sampleSize: summary.sampleSize,
        tierCounts: summary.tierCounts,
        medianScore: summary.medianScore,
        topRows: topRowsEx
      }
    };
  }

  // src/lib/broadcasterProfileCard.js
  function str(v) {
    return String(v == null ? "" : v).trim();
  }
  function httpUrl(v) {
    const s = str(v);
    return /^https?:\/\//i.test(s) ? s : "";
  }
  function nonNegInt(v) {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
  }
  function boolOrNull(v) {
    return v === true ? true : v === false ? false : null;
  }
  function normalizeBroadcasterProfileModel(raw) {
    if (!raw || typeof raw !== "object") return null;
    const o = (
      /** @type {Record<string, unknown>} */
      raw
    );
    const userId = str(o.userId ?? o.broadcasterUserId ?? o.id);
    const nickname = str(o.nickname ?? o.broadcasterName ?? o.name);
    const avatarUrl = httpUrl(o.avatarUrl ?? o.broadcasterIconUrl ?? o.iconUrl);
    const pageUrl = httpUrl(o.pageUrl ?? o.broadcasterPageUrl ?? o.userPageUrl);
    const startAtText = str(o.startAtText);
    const level = nonNegInt(o.level ?? o.broadcasterLevel ?? o.niconicoLevel ?? o.userLevel);
    const isPremium = boolOrNull(o.isPremium ?? o.premium);
    const followeeCount = nonNegInt(o.followeeCount ?? o.followingCount ?? o.followCount);
    const followerCount = nonNegInt(o.followerCount ?? o.followersCount);
    const broadcastStartDate = str(o.broadcastStartDate ?? o.broadcastStartedDate);
    const cumulativeBroadcastDays = nonNegInt(
      o.cumulativeBroadcastDays ?? o.totalBroadcastDays ?? o.broadcastDays
    );
    const wishlistUrl = httpUrl(o.wishlistUrl ?? o.wishlist);
    const broadcastRequestEnabled = boolOrNull(o.broadcastRequestEnabled ?? o.broadcastRequest);
    const description = str(o.description).slice(0, 2e3);
    const sns = [];
    if (Array.isArray(o.sns)) {
      for (const raw2 of o.sns.slice(0, 8)) {
        const r = raw2 && typeof raw2 === "object" ? (
          /** @type {Record<string, unknown>} */
          raw2
        ) : {};
        const url = httpUrl(r.url);
        if (!url) continue;
        sns.push({ label: str(r.label).slice(0, 40), screenName: str(r.screenName).slice(0, 80), url });
      }
    }
    const lx = o.levelExp && typeof o.levelExp === "object" ? (
      /** @type {Record<string, unknown>} */
      o.levelExp
    ) : null;
    const lxCur = lx ? nonNegInt(lx.current) : null;
    const lxThr = lx ? nonNegInt(lx.threshold) : null;
    const levelExp = lxCur != null && lxThr != null && lxThr > 0 ? { current: lxCur, threshold: lxThr } : null;
    const model = {
      userId,
      nickname,
      avatarUrl,
      pageUrl,
      startAtText,
      level,
      isPremium,
      followeeCount,
      followerCount,
      broadcastStartDate,
      cumulativeBroadcastDays,
      wishlistUrl,
      broadcastRequestEnabled,
      description,
      sns,
      levelExp
    };
    const hasAnything = nickname || userId || avatarUrl || pageUrl || startAtText || level != null || isPremium != null || followeeCount != null || followerCount != null || broadcastStartDate || cumulativeBroadcastDays != null || wishlistUrl || broadcastRequestEnabled != null || description || sns.length > 0 || levelExp != null;
    return hasAnything ? model : null;
  }
  function isNumericUid(userId) {
    return /^\d{1,18}$/.test(str(userId));
  }
  function broadcasterNameLinkedHtml(m) {
    const label = m.nickname || (m.userId ? `ユーザー ${m.userId}` : "配信者");
    if (isNumericUid(m.userId)) {
      return buildUserProfileLinkedLabelHtml(m.userId, label);
    }
    if (m.pageUrl) {
      return `<a href="${escapeAttr(m.pageUrl)}" target="_blank" rel="noopener noreferrer" class="nl-user-profile-link">${escapeHtml(label)}</a>`;
    }
    return escapeHtml(label);
  }
  function profileHref(m) {
    if (isNumericUid(m.userId)) return `https://www.nicovideo.jp/user/${encodeURIComponent(m.userId)}`;
    return m.pageUrl || "";
  }
  function linkifyBioHtml(text, linkClass) {
    const re = /https?:\/\/[^\s<>"'`、。，．）)」』】\]]+/g;
    let out = "";
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      let url = m[0];
      const trimmed = url.replace(/[.,;:!?]+$/, "");
      url = trimmed;
      out += escapeHtml(text.slice(last, m.index));
      out += `<a class="${linkClass}" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(url)}</a>`;
      last = m.index + url.length;
      re.lastIndex = last;
    }
    out += escapeHtml(text.slice(last));
    return out.replace(/\n/g, "<br>");
  }
  function jp(n) {
    return Number(n).toLocaleString("ja-JP");
  }
  function buildBroadcasterProfileMarketingCardHtml(model) {
    if (!model) return "";
    const m = model;
    const href = profileHref(m);
    const avatar = m.avatarUrl ? `<img class="mkt-bcaster__avatar" src="${escapeAttr(m.avatarUrl)}" alt="" width="56" height="56" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '<span class="mkt-bcaster__avatar mkt-bcaster__avatar--empty" aria-hidden="true">配</span>';
    const chips = [];
    if (m.level != null) chips.push(`<span class="mkt-bcaster__chip">LV${escapeHtml(String(m.level))}</span>`);
    if (m.levelExp) {
      chips.push(`<span class="mkt-bcaster__chip" title="公式の値(現レベルの経験値 / 次のレベルに必要な経験値)">経験値 ${escapeHtml(jp(m.levelExp.current))} / ${escapeHtml(jp(m.levelExp.threshold))}</span>`);
    }
    if (m.isPremium === true) chips.push('<span class="mkt-bcaster__chip mkt-bcaster__chip--prem">プレミアム会員</span>');
    else if (m.isPremium === false) chips.push('<span class="mkt-bcaster__chip mkt-bcaster__chip--reg">一般会員</span>');
    if (m.followerCount != null) chips.push(`<span class="mkt-bcaster__chip">フォロワー ${escapeHtml(jp(m.followerCount))}</span>`);
    if (m.followeeCount != null) chips.push(`<span class="mkt-bcaster__chip">フォロー中 ${escapeHtml(jp(m.followeeCount))}</span>`);
    if (m.cumulativeBroadcastDays != null) {
      chips.push(`<span class="mkt-bcaster__chip">累計配信 ${escapeHtml(jp(m.cumulativeBroadcastDays))}日</span>`);
    }
    if (m.broadcastRequestEnabled === true) chips.push('<span class="mkt-bcaster__chip">放送リクエスト 可</span>');
    const metaLines = [];
    if (m.userId) {
      metaLines.push(`<span class="mkt-bcaster__meta">ID: ${escapeHtml(m.userId)}</span>`);
    }
    if (m.broadcastStartDate) {
      metaLines.push(`<span class="mkt-bcaster__meta">配信開始日: ${escapeHtml(m.broadcastStartDate)}</span>`);
    } else if (m.startAtText) {
      metaLines.push(`<span class="mkt-bcaster__meta">開始: ${escapeHtml(m.startAtText)}</span>`);
    }
    const links = [];
    if (href) {
      links.push(
        `<a class="mkt-bcaster__link" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">プロフィール</a>`
      );
    }
    if (m.wishlistUrl) {
      links.push(
        `<a class="mkt-bcaster__link mkt-bcaster__link--wish" href="${escapeAttr(m.wishlistUrl)}" target="_blank" rel="noopener noreferrer">欲しいものリスト</a>`
      );
    }
    for (const sn of m.sns || []) {
      const label = `${sn.label || "SNS"}${sn.screenName ? ` ${sn.screenName}` : ""}`;
      links.push(
        `<a class="mkt-bcaster__link mkt-bcaster__link--sns" href="${escapeAttr(sn.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
      );
    }
    const bio = m.description ? `<div class="mkt-bcaster__bio">${linkifyBioHtml(m.description, "mkt-bcaster__bio-link")}</div>` : "";
    return `<section class="mkt-section mkt-section--bcaster" aria-label="配信者プロフィール">
<h2>配信者プロフィール</h2>
<div class="mkt-bcaster">
${avatar}
<div class="mkt-bcaster__body">
<p class="mkt-bcaster__name">${broadcasterNameLinkedHtml(m)}</p>
${metaLines.length ? `<div class="mkt-bcaster__metas">${metaLines.join("")}</div>` : ""}
${chips.length ? `<div class="mkt-bcaster__chips">${chips.join("")}</div>` : ""}
${bio}
${links.length ? `<div class="mkt-bcaster__links">${links.join("")}</div>` : ""}
</div>
</div>
</section>`;
  }
  var BROADCASTER_PROFILE_MARKETING_CSS = `
.mkt-section--bcaster h2{border-left-color:#38bdf8}
.mkt-bcaster{display:flex;gap:.9rem;align-items:flex-start;flex-wrap:wrap}
.mkt-bcaster__avatar{width:56px;height:56px;border-radius:50%;object-fit:cover;background:#0f172a;border:1px solid #334155;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;color:#93c5fd;font-weight:700}
.mkt-bcaster__avatar--empty{font-size:.85rem}
.mkt-bcaster__body{flex:1;min-width:0}
.mkt-bcaster__name{margin:0 0 .35rem;font-size:1.05rem;font-weight:700;color:#f8fafc;overflow-wrap:anywhere}
.mkt-bcaster__name .nl-user-profile-link{color:#93c5fd;text-decoration:underline;text-underline-offset:2px}
.mkt-bcaster__metas{display:flex;flex-wrap:wrap;gap:.5rem;margin:.1rem 0 .4rem}
.mkt-bcaster__meta{font-size:.78rem;color:#aab6c8}
.mkt-bcaster__chips{display:flex;flex-wrap:wrap;gap:.35rem;margin:.1rem 0}
.mkt-bcaster__chip{display:inline-block;border:1px solid #334155;background:#111827;color:#dbeafe;border-radius:999px;padding:.1rem .5rem;font-size:.74rem;line-height:1.4;white-space:nowrap}
.mkt-bcaster__chip--prem{border-color:rgba(251,191,36,.55);background:rgba(251,191,36,.14);color:#fde68a}
.mkt-bcaster__chip--reg{border-color:#475569;background:#0f172a;color:#cbd5e1}
.mkt-bcaster__links{display:flex;flex-wrap:wrap;gap:.6rem;margin:.5rem 0 0}
.mkt-bcaster__link{font-size:.8rem;color:#93c5fd;text-decoration:underline;text-underline-offset:2px}
.mkt-bcaster__link--wish{color:#fdba74}
.mkt-bcaster__link--sns{color:#86efac}
.mkt-bcaster__bio-link{color:#93c5fd;text-decoration:underline;text-underline-offset:2px}
.mkt-bcaster__bio{margin:.5rem 0 0;padding:.5rem .7rem;border-left:3px solid #334155;background:rgba(15,23,42,.55);color:#cbd5e1;font-size:.82rem;line-height:1.6;overflow-wrap:anywhere;max-height:12em;overflow:auto}
.mkt-acct-badge{display:inline-block;margin-left:.4rem;border-radius:999px;padding:.02rem .42rem;font-size:.66rem;font-weight:700;line-height:1.5;vertical-align:middle;white-space:nowrap}
.mkt-acct-badge--prem{border:1px solid rgba(251,191,36,.55);background:rgba(251,191,36,.16);color:#fde68a}
.mkt-acct-badge--reg{border:1px solid #475569;background:#0f172a;color:#cbd5e1}
.mkt-ext-link-chips{display:flex;flex-wrap:wrap;gap:.5rem}
.mkt-ext-link-chip{display:inline-block;max-width:100%;border:1px solid #334155;background:#111827;color:#93c5fd;border-radius:999px;padding:.18rem .6rem;font-size:.8rem;text-decoration:none;overflow-wrap:anywhere}
.mkt-ext-link-chip:hover{text-decoration:underline;border-color:#475569}
.nl-user-thumb-link{display:inline-block;line-height:0;text-decoration:none;border-radius:50%}
.nl-user-thumb-link:hover{outline:2px solid #38bdf8;outline-offset:1px}
.mkt-gift-thumb{width:28px;height:28px;border-radius:50%;object-fit:cover;background:#0f172a;vertical-align:middle}
.mkt-gift-thumb--empty{display:inline-block;border:1px solid #334155}
`;
  function buildBroadcasterProfileReportRowsHtml(model) {
    if (!model) return "";
    const m = model;
    const rows = [];
    const href = profileHref(m);
    if (href) {
      rows.push(
        `<tr><th>配信者プロフィール</th><td><a class="nl-user-profile-link" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(href)}</a></td></tr>`
      );
    }
    if (m.userId) {
      rows.push(`<tr><th>配信者ID</th><td class="mono">${escapeHtml(m.userId)}</td></tr>`);
    }
    if (m.isPremium != null) {
      rows.push(`<tr><th>会員種別</th><td>${m.isPremium ? "プレミアム会員" : "一般会員"}</td></tr>`);
    }
    if (m.followerCount != null) {
      rows.push(`<tr><th>フォロワー数</th><td>${escapeHtml(jp(m.followerCount))}</td></tr>`);
    }
    if (m.followeeCount != null) {
      rows.push(`<tr><th>フォロー中</th><td>${escapeHtml(jp(m.followeeCount))}</td></tr>`);
    }
    if (m.levelExp) {
      rows.push(`<tr><th>経験値</th><td>${escapeHtml(jp(m.levelExp.current))} / ${escapeHtml(jp(m.levelExp.threshold))}(公式の値)</td></tr>`);
    }
    if (m.description) {
      rows.push(`<tr><th>自己紹介</th><td>${linkifyBioHtml(m.description, "nl-user-profile-link")}</td></tr>`);
    }
    if (m.sns && m.sns.length) {
      const links = m.sns.map((sn) => `<a class="nl-user-profile-link" href="${escapeAttr(sn.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(`${sn.label || "SNS"}${sn.screenName ? ` ${sn.screenName}` : ""}`)}</a>`).join(" / ");
      rows.push(`<tr><th>SNS</th><td>${links}</td></tr>`);
    }
    if (m.broadcastStartDate) {
      rows.push(`<tr><th>配信開始日</th><td>${escapeHtml(m.broadcastStartDate)}</td></tr>`);
    }
    if (m.cumulativeBroadcastDays != null) {
      rows.push(`<tr><th>累計配信日数</th><td>${escapeHtml(jp(m.cumulativeBroadcastDays))}日</td></tr>`);
    }
    if (m.broadcastRequestEnabled != null) {
      rows.push(`<tr><th>放送リクエスト</th><td>${m.broadcastRequestEnabled ? "受付中" : "—"}</td></tr>`);
    }
    if (m.wishlistUrl) {
      rows.push(
        `<tr><th>欲しいものリスト</th><td><a class="nl-user-profile-link" href="${escapeAttr(m.wishlistUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(m.wishlistUrl)}</a></td></tr>`
      );
    }
    return rows.join("\n");
  }
  function broadcasterNameCellHtml(model, fallbackName) {
    if (model && (model.nickname || model.userId || model.pageUrl)) {
      return broadcasterNameLinkedHtml(model);
    }
    return escapeHtml(str(fallbackName) || "-");
  }

  // src/lib/nicoAnonymousDisplay.js
  var NICO_HASHED_ANON_USER_ID_RE = /^[A-Za-z0-9_-]{16,40}$/;
  function isNiconicoHashedAnonymousUserId(userId) {
    const s = String(userId ?? "").trim();
    if (!s) return false;
    if (s.startsWith("__")) return false;
    if (/^\d+$/.test(s)) return false;
    return NICO_HASHED_ANON_USER_ID_RE.test(s);
  }
  function isNiconicoAnonymousUserId(userId) {
    const s = String(userId ?? "").trim();
    if (/^a:/i.test(s)) {
      const rest = s.slice(2).trim();
      return rest.length >= 2;
    }
    return isNiconicoHashedAnonymousUserId(s);
  }
  function isNiconicoAutoUserPlaceholderNickname(nickname) {
    const n = String(nickname ?? "").trim();
    return /^user\s+[A-Za-z0-9]+$/i.test(n);
  }
  function isNiconicoGuestPlaceholderNickname(nickname) {
    const n = String(nickname ?? "").trim();
    return n === "ゲスト";
  }
  function anonymousNicknameFallback(userId, nickname) {
    const nick = String(nickname ?? "").trim();
    const isPlaceholder = isNiconicoGuestPlaceholderNickname(nick) || isNiconicoAutoUserPlaceholderNickname(nick);
    if (nick && !isPlaceholder) return nick;
    return isNiconicoAnonymousUserId(userId) ? "匿名" : "";
  }

  // src/lib/backfillRemoveRecommendedLivePollution.js
  function isRecommendedUserChipPollutionRow(entry) {
    if (!entry || typeof entry !== "object") return false;
    const userId = String(
      /** @type {{ userId?: unknown }} */
      entry.userId || ""
    ).trim();
    if (!/^\d{5,14}$/.test(userId)) return false;
    const text = String(
      /** @type {{ text?: unknown }} */
      entry.text || ""
    ).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (!text) return false;
    const uid = userId;
    const lower = text.toLowerCase();
    if (text === uid) return true;
    if (lower === `u/${uid}`) return true;
    if (lower === `${uid} u/${uid}`) return true;
    if (lower === `u/${uid} ${uid}`) return true;
    if (/^https:\/\/(www\.)?nicovideo\.jp\/user\/\d{5,14}\/?$/i.test(text) && text.includes(uid)) {
      return true;
    }
    return false;
  }

  // src/lib/userRooms.js
  var UNKNOWN_USER_KEY = "__unknown__";
  function shortUserKeyDisplay(userKey) {
    if (!userKey || userKey === UNKNOWN_USER_KEY) return "";
    const s = String(userKey);
    return s.length <= 18 ? s : `${s.slice(0, 8)}…${s.slice(-6)}`;
  }
  function displayUserLabel(userKey, nickname) {
    if (!userKey || userKey === UNKNOWN_USER_KEY) {
      return "ID未取得（DOMに投稿者情報なし）";
    }
    const name = anonymousNicknameFallback(userKey, nickname);
    const shortId = shortUserKeyDisplay(userKey);
    if (name) return `${name}（${shortId}）`;
    return shortId;
  }
  function sampleEntriesEvenly(list, sampleMax) {
    if (list.length <= sampleMax) return [...list];
    const out = [];
    const step = list.length / sampleMax;
    for (let i = 0; i < sampleMax; i++) {
      out.push(list[Math.floor(i * step)]);
    }
    return out;
  }
  function aggregateCommentsByUser(entries, options) {
    let list = Array.isArray(entries) ? entries : [];
    const sampleMax = typeof options?.sampleMaxEntries === "number" && options.sampleMaxEntries > 0 ? Math.floor(options.sampleMaxEntries) : 0;
    if (sampleMax > 0 && list.length > sampleMax) {
      list = sampleEntriesEvenly(list, sampleMax);
    }
    const requireText = !!options?.requireText;
    const trackCharTotals = options?.trackCharTotals === true;
    const maxRooms = typeof options?.maxRooms === "number" && options.maxRooms > 0 ? Math.floor(options.maxRooms) : 0;
    const sortByCount = options?.sortByCount === true;
    const map = /* @__PURE__ */ new Map();
    for (const e of list) {
      const uid = e?.userId ? String(e.userId).trim() : "";
      const userKey = uid || UNKNOWN_USER_KEY;
      const capturedAt = Number(e?.capturedAt || 0);
      const text = String(e?.text || "").trim();
      if (requireText && !text) continue;
      if (requireText && isRecommendedUserChipPollutionRow(e)) continue;
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
          avatarUrl: "",
          totalChars: 0
        });
      }
      const row = map.get(userKey);
      row.count += 1;
      if (trackCharTotals) row.totalChars += text.length;
      if (nickname) {
        if (!row.nickname) row.nickname = nickname;
        else if (nickname.length > row.nickname.length) row.nickname = nickname;
      }
      if (capturedAt >= row.lastAt) {
        row.lastAt = capturedAt;
        row.lastText = text.length > 60 ? `${text.slice(0, 60)}…` : text;
        if (userKey !== UNKNOWN_USER_KEY && avatarCandidate) row.avatarUrl = avatarCandidate;
      }
    }
    let rows = [...map.values()];
    if (sortByCount) {
      rows.sort((a, b) => b.count - a.count || b.lastAt - a.lastAt);
    } else {
      rows.sort((a, b) => b.lastAt - a.lastAt);
    }
    if (maxRooms > 0 && rows.length > maxRooms) {
      rows = rows.slice(0, maxRooms);
    }
    if (!trackCharTotals) {
      return rows.map(({ totalChars: _tc, ...rest }) => rest);
    }
    return rows;
  }

  // src/lib/reportUserThumb.js
  var NICO_USER_ICON_CDN_BASE = "https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon";
  function buildNiconicoDefaultUserIconUrl(uid) {
    const s = String(uid || "").trim();
    if (!/^\d{5,14}$/.test(s)) return "";
    const bucket = Math.floor(Number(s) / 1e4);
    return `${NICO_USER_ICON_CDN_BASE}/${bucket}/${s}.jpg`;
  }
  function resolveReportUserThumbSrc(opts) {
    const userId = String(opts?.userId || "").trim();
    const avatarUrl = String(opts?.avatarUrl || "").trim();
    if (isHttpOrHttpsUrl(avatarUrl)) {
      return avatarUrl;
    }
    if (!userId || userId === "__unknown__") return "";
    if (/^\d{5,14}$/.test(userId)) {
      return buildNiconicoDefaultUserIconUrl(userId);
    }
    if (typeof opts?.identiconResolver === "function") {
      const r = opts.identiconResolver(userId);
      if (typeof r === "string" && r.length > 0) return r;
    }
    return "";
  }

  // src/lib/userThumbGrid.js
  var THUMB_USER_KIND_NUMERIC = "numeric";
  var THUMB_USER_KIND_ANONYMOUS = "anonymous";
  function isNumericNicoUserId(userId) {
    return /^\d{5,14}$/.test(String(userId || "").trim());
  }
  function isAnonymousLikeUserId(userId) {
    const s = String(userId || "").trim();
    if (!s) return false;
    if (isNiconicoAnonymousUserId(s)) return true;
    if (/^[a-zA-Z0-9_-]{10,26}$/.test(s)) return true;
    return false;
  }
  function categorizeUsersForThumbGrid(users, opts = {}) {
    const numericIdUsers = [];
    const anonymousUsers = [];
    let skippedCount = 0;
    const maxNumeric = Number.isFinite(opts.maxNumeric) ? Number(opts.maxNumeric) : Number.POSITIVE_INFINITY;
    const maxAnonymous = Number.isFinite(opts.maxAnonymous) ? Number(opts.maxAnonymous) : Number.POSITIVE_INFINITY;
    const broadcasterUid = typeof opts.broadcasterUserId === "string" ? String(opts.broadcasterUserId).trim() : "";
    if (!Array.isArray(users)) {
      return { numericIdUsers, anonymousUsers, skippedCount: 0 };
    }
    for (const u of users) {
      const userId = String(u?.userId || "").trim();
      if (!userId || userId === "__unknown__") {
        skippedCount += 1;
        continue;
      }
      if (broadcasterUid && userId === broadcasterUid) {
        skippedCount += 1;
        continue;
      }
      const thumbSrc = resolveReportUserThumbSrc({
        userId,
        avatarUrl: u?.avatarUrl || "",
        identiconResolver: opts.identiconResolver
      });
      if (!thumbSrc) {
        skippedCount += 1;
        continue;
      }
      const nickname = String(u?.nickname || "");
      const count = Number(u?.count || 0);
      if (isNumericNicoUserId(userId)) {
        if (numericIdUsers.length < maxNumeric) {
          numericIdUsers.push({
            userId,
            nickname,
            count,
            thumbSrc,
            kind: THUMB_USER_KIND_NUMERIC
          });
        }
      } else if (isAnonymousLikeUserId(userId)) {
        if (anonymousUsers.length < maxAnonymous) {
          anonymousUsers.push({
            userId,
            nickname,
            count,
            thumbSrc,
            kind: THUMB_USER_KIND_ANONYMOUS
          });
        }
      } else {
        skippedCount += 1;
      }
    }
    return { numericIdUsers, anonymousUsers, skippedCount };
  }

  // src/lib/concurrentTimelineSeries.js
  function isFiniteNonNegative(v) {
    return typeof v === "number" && Number.isFinite(v) && v >= 0;
  }
  function buildConcurrentTimelineSeries(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
      return { points: [], maxValue: 0, firstAt: null, lastAt: null, source: "none" };
    }
    let officialCount = 0;
    let estimatedCount = 0;
    const collected = [];
    for (const r of list) {
      if (!r || typeof r !== "object") continue;
      if (typeof r.capturedAt !== "number" || !Number.isFinite(r.capturedAt)) continue;
      if (isFiniteNonNegative(r.officialViewerCount)) {
        collected.push({
          at: r.capturedAt,
          value: (
            /** @type {number} */
            r.officialViewerCount
          ),
          kind: "official"
        });
        officialCount += 1;
      } else if (isFiniteNonNegative(r.peakConcurrentEstimate)) {
        collected.push({
          at: r.capturedAt,
          value: (
            /** @type {number} */
            r.peakConcurrentEstimate
          ),
          kind: "estimated"
        });
        estimatedCount += 1;
      }
    }
    if (!collected.length) {
      return { points: [], maxValue: 0, firstAt: null, lastAt: null, source: "none" };
    }
    collected.sort((a, b) => a.at - b.at);
    const source = officialCount > 0 && estimatedCount > 0 ? "mixed" : officialCount > 0 ? "official" : "estimated";
    const firstAt = collected[0].at;
    const lastAt = collected[collected.length - 1].at;
    let maxValue = 0;
    const points = collected.map((p) => {
      if (p.value > maxValue) maxValue = p.value;
      return {
        at: p.at,
        value: p.value,
        minute: Math.max(0, Math.floor((p.at - firstAt) / 6e4))
      };
    });
    return { points, maxValue, firstAt, lastAt, source };
  }

  // src/lib/concurrentPeakAnalysis.js
  var EMPTY = Object.freeze({
    peakValue: 0,
    peakMinute: null,
    startValue: 0,
    endValue: 0,
    endRetentionRatio: null,
    halfDecayMinute: null
  });
  function analyzeConcurrentPeak(series) {
    if (!series || typeof series !== "object") return { ...EMPTY };
    const points = Array.isArray(series.points) ? series.points : [];
    if (!points.length) return { ...EMPTY };
    let peakValue = points[0].value;
    let peakIdx = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].value > peakValue) {
        peakValue = points[i].value;
        peakIdx = i;
      }
    }
    const peak = points[peakIdx];
    const start = points[0];
    const end = points[points.length - 1];
    const endRetentionRatio = peakValue > 0 ? Math.round(end.value / peakValue * 1e3) / 1e3 : null;
    let halfDecayMinute = null;
    if (peakValue > 0) {
      const threshold = peakValue / 2;
      for (let i = peakIdx + 1; i < points.length; i++) {
        if (points[i].value < threshold) {
          halfDecayMinute = points[i].minute;
          break;
        }
      }
    }
    return {
      peakValue,
      peakMinute: peak.minute,
      startValue: start.value,
      endValue: end.value,
      endRetentionRatio,
      halfDecayMinute
    };
  }

  // src/lib/commentSilenceZones.js
  function detectCommentSilenceZones(comments, opts = {}) {
    const list = Array.isArray(comments) ? comments : [];
    const threshold = typeof opts.thresholdMs === "number" && opts.thresholdMs > 0 ? opts.thresholdMs : 6e4;
    const qualityCfg = opts.quality;
    const qualityWindowMs = qualityCfg && typeof qualityCfg.windowMs === "number" && qualityCfg.windowMs > 0 ? qualityCfg.windowMs : 0;
    const valid = [];
    for (const c of list) {
      if (!c || typeof c !== "object") continue;
      const at = c.capturedAt;
      if (typeof at !== "number" || !Number.isFinite(at) || at <= 0) continue;
      valid.push(c);
    }
    valid.sort(
      (a, b) => (
        /** @type {number} */
        a.capturedAt - /** @type {number} */
        b.capturedAt
      )
    );
    if (valid.length < 2) return [];
    const zones = [];
    for (let i = 1; i < valid.length; i++) {
      const prev = valid[i - 1];
      const cur = valid[i];
      const prevAt = (
        /** @type {number} */
        prev.capturedAt
      );
      const curAt = (
        /** @type {number} */
        cur.capturedAt
      );
      const gap = curAt - prevAt;
      if (gap < threshold) continue;
      let quality = "unknown";
      let afterCount = 0;
      if (qualityWindowMs > 0) {
        const windowEnd = curAt + qualityWindowMs;
        for (let j = i; j < valid.length; j++) {
          const at = (
            /** @type {number} */
            valid[j].capturedAt
          );
          if (at > windowEnd) break;
          afterCount += 1;
        }
        if (afterCount >= 5) quality = "engaged";
        else if (afterCount <= 1) quality = "departed";
        else quality = "neutral";
      }
      zones.push({
        startAt: prevAt,
        endAt: curAt,
        durationMs: gap,
        quality,
        afterCount,
        beforeText: String(prev.text || "").slice(0, 60),
        afterText: String(cur.text || "").slice(0, 60)
      });
    }
    return zones;
  }

  // src/lib/commentFatigue.js
  function medianOfSorted(sorted) {
    const n = sorted.length;
    if (!n) return 0;
    const mid = Math.floor(n / 2);
    return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  function round(v, digits) {
    const p = 10 ** digits;
    return Math.round(v * p) / p;
  }
  function computeCommentFatigue(comments, opts = {}) {
    const minComments = Number.isFinite(opts.minComments) && opts.minComments >= 3 ? Math.floor(opts.minComments) : 3;
    const slowThreshold = Number.isFinite(opts.slowThreshold) && opts.slowThreshold > 1 ? opts.slowThreshold : 1.2;
    const maxTenureMin = Number.isFinite(opts.maxTenureMin) && opts.maxTenureMin > 0 ? Math.floor(opts.maxTenureMin) : 30;
    const broadcasterUserId = String(opts.broadcasterUserId || "").trim();
    const byUser = /* @__PURE__ */ new Map();
    const rows = Array.isArray(comments) ? comments : [];
    for (const c of rows) {
      const uid = String(c && c.userId || "").trim();
      if (!uid) continue;
      if (broadcasterUserId && uid === broadcasterUserId) continue;
      const t = Number(c && c.capturedAt || 0);
      if (!Number.isFinite(t) || t <= 0) continue;
      let arr = byUser.get(uid);
      if (!arr) {
        arr = [];
        byUser.set(uid, arr);
      }
      arr.push(t);
    }
    let multiCommenterCount = 0;
    let analyzedCount = 0;
    let slowedCount = 0;
    const ratios = [];
    const tenureComments = new Array(maxTenureMin + 1).fill(0);
    const tenureUserSets = Array.from({ length: maxTenureMin + 1 }, () => /* @__PURE__ */ new Set());
    for (const [uid, tsRaw] of byUser) {
      const ts = tsRaw.slice().sort((a, b) => a - b);
      const n = ts.length;
      if (n >= minComments) multiCommenterCount += 1;
      const first = ts[0];
      for (const t of ts) {
        const m = Math.floor((t - first) / 6e4);
        if (m >= 0 && m <= maxTenureMin) {
          tenureComments[m] += 1;
          tenureUserSets[m].add(uid);
        }
      }
      if (n >= 3) {
        const gaps = [];
        for (let i = 1; i < n; i++) gaps.push(ts[i] - ts[i - 1]);
        const half = Math.floor(gaps.length / 2);
        if (half >= 1) {
          const firstHalf = gaps.slice(0, half).sort((a, b) => a - b);
          const secondHalf = gaps.slice(gaps.length - half).sort((a, b) => a - b);
          const fMed = medianOfSorted(firstHalf);
          const sMed = medianOfSorted(secondHalf);
          if (fMed > 0) {
            const ratio = sMed / fMed;
            ratios.push(ratio);
            analyzedCount += 1;
            if (ratio >= slowThreshold) slowedCount += 1;
          }
        }
      }
    }
    ratios.sort((a, b) => a - b);
    const medianSlowdownRatio = ratios.length ? round(medianOfSorted(ratios), 2) : 0;
    const startUsers = tenureUserSets[0].size;
    const tenureBuckets = [];
    for (let m = 0; m <= maxTenureMin; m++) {
      const activeUsers = tenureUserSets[m].size;
      const cnt = tenureComments[m];
      tenureBuckets.push({
        minute: m,
        activeUsers,
        comments: cnt,
        perUser: activeUsers > 0 ? round(cnt / activeUsers, 2) : 0,
        retentionPct: startUsers > 0 ? round(activeUsers / startUsers * 100, 1) : 0
      });
    }
    while (tenureBuckets.length > 1 && tenureBuckets[tenureBuckets.length - 1].comments === 0 && tenureBuckets[tenureBuckets.length - 1].activeUsers === 0) {
      tenureBuckets.pop();
    }
    return {
      trackedUsers: byUser.size,
      multiCommenterCount,
      analyzedCount,
      slowedCount,
      slowedPct: analyzedCount > 0 ? round(slowedCount / analyzedCount * 100, 1) : 0,
      medianSlowdownRatio,
      startUsers,
      tenureBuckets
    };
  }

  // src/lib/commentVelocityTimeline.js
  function collectValidSorted(comments) {
    const list = Array.isArray(comments) ? comments : [];
    const valid = [];
    for (const c of list) {
      if (!c || typeof c !== "object") continue;
      const at = (
        /** @type {any} */
        c.capturedAt
      );
      if (typeof at !== "number" || !Number.isFinite(at) || at <= 0) continue;
      valid.push(c);
    }
    if (!valid.length) return null;
    valid.sort(
      (a, b) => (
        /** @type {number} */
        a.capturedAt - /** @type {number} */
        b.capturedAt
      )
    );
    return {
      valid,
      firstAt: (
        /** @type {number} */
        valid[0].capturedAt
      ),
      lastAt: (
        /** @type {number} */
        valid[valid.length - 1].capturedAt
      )
    };
  }
  function buildCommentVelocityTimeline(comments, opts = {}) {
    const bucketMs = typeof opts.bucketMs === "number" && opts.bucketMs > 0 ? opts.bucketMs : 6e4;
    const rollingWindowMin = typeof opts.rollingWindowMin === "number" && opts.rollingWindowMin > 0 ? opts.rollingWindowMin : 5;
    const collected = collectValidSorted(comments);
    if (!collected) return { buckets: [], peakValue: 0, peakMinute: null, totalCount: 0 };
    const { valid, firstAt, lastAt } = collected;
    const totalBuckets = Math.max(1, Math.floor((lastAt - firstAt) / bucketMs) + 1);
    const buckets = [];
    for (let m = 0; m < totalBuckets; m++) {
      buckets.push({ minute: m, atStart: firstAt + m * bucketMs, count: 0, rolling5: 0 });
    }
    for (const c of valid) {
      const idx = Math.floor(
        /** @type {number} */
        (c.capturedAt - firstAt) / bucketMs
      );
      if (idx >= 0 && idx < buckets.length) buckets[idx].count += 1;
    }
    const win = rollingWindowMin;
    for (let i = 0; i < buckets.length; i++) {
      const start = Math.max(0, i - win + 1);
      let sum = 0;
      let n = 0;
      for (let j = start; j <= i; j++) {
        sum += buckets[j].count;
        n += 1;
      }
      buckets[i].rolling5 = n > 0 ? Math.round(sum / n * 100) / 100 : 0;
    }
    let peakValue = 0;
    let peakMinute = null;
    for (const b of buckets) {
      if (b.count > peakValue) {
        peakValue = b.count;
        peakMinute = b.minute;
      }
    }
    return { buckets, peakValue, peakMinute, totalCount: valid.length };
  }
  function isLaughterText(text) {
    const s = String(text || "");
    if (!s) return false;
    if (/^[wｗ]{2,}$/i.test(s.trim())) return true;
    if (/[wｗ]{2,}/i.test(s)) {
      return true;
    }
    if (/8{4,}/.test(s)) return true;
    if (new RegExp("^草[ァァっぁぁ！？!?。、  ]*$").test(s.trim())) return true;
    if (s === "草") return true;
    if (/草不可避|大草原|草生える|草生やす/.test(s)) return true;
    if (/(?:^|[^一-龥])(笑)(?:[^一-龥]|$)/.test(s)) return true;
    if (/\(笑\)|（笑）/.test(s)) return true;
    if (/爆笑|ワロタ|わろた|ｗｗ/i.test(s)) return true;
    return false;
  }
  function buildLaughterDensityTimeline(comments, opts = {}) {
    const bucketMs = typeof opts.bucketMs === "number" && opts.bucketMs > 0 ? opts.bucketMs : 3e4;
    const collected = collectValidSorted(comments);
    if (!collected) {
      return {
        buckets: [],
        peakBucket: null,
        peakValue: 0,
        totalLaughter: 0,
        totalCount: 0,
        overallRatio: 0
      };
    }
    const { valid, firstAt, lastAt } = collected;
    const totalBuckets = Math.max(1, Math.floor((lastAt - firstAt) / bucketMs) + 1);
    const buckets = [];
    for (let m = 0; m < totalBuckets; m++) {
      buckets.push({ minute: m, atStart: firstAt + m * bucketMs, count: 0, total: 0, ratio: 0 });
    }
    let totalLaughter = 0;
    for (const c of valid) {
      const idx = Math.floor(
        /** @type {number} */
        (c.capturedAt - firstAt) / bucketMs
      );
      if (idx < 0 || idx >= buckets.length) continue;
      buckets[idx].total += 1;
      if (isLaughterText(
        /** @type {any} */
        c.text
      )) {
        buckets[idx].count += 1;
        totalLaughter += 1;
      }
    }
    let peakValue = 0;
    let peakBucket = null;
    for (const b of buckets) {
      b.ratio = b.total > 0 ? Math.round(b.count / b.total * 1e3) / 1e3 : 0;
      if (b.count > peakValue) {
        peakValue = b.count;
        peakBucket = b.minute;
      }
    }
    return {
      buckets,
      peakBucket,
      peakValue,
      totalLaughter,
      totalCount: valid.length,
      overallRatio: valid.length > 0 ? Math.round(totalLaughter / valid.length * 1e3) / 1e3 : 0
    };
  }

  // src/lib/commenterHistoricalAnalytics.js
  function cleanUid(v) {
    if (v == null) return "";
    return String(v).trim();
  }
  function indexPastUsers(pastBroadcasts, currentLiveId) {
    const map = /* @__PURE__ */ new Map();
    const currentLid = cleanUid(currentLiveId).toLowerCase();
    const list = Array.isArray(pastBroadcasts) ? pastBroadcasts : [];
    for (const b of list) {
      if (!b || typeof b !== "object") continue;
      const lid = cleanUid(b.liveId).toLowerCase();
      if (!lid) continue;
      if (lid === currentLid) continue;
      const cs = Array.isArray(b.comments) ? b.comments : [];
      for (const c of cs) {
        const uid = cleanUid(c?.userId);
        if (!uid) continue;
        const nick = String(c?.nickname == null ? "" : c.nickname).trim();
        let row = map.get(uid);
        if (!row) {
          row = { userId: uid, totalComments: 0, broadcastIds: /* @__PURE__ */ new Set(), nickname: "" };
          map.set(uid, row);
        }
        row.totalComments += 1;
        row.broadcastIds.add(lid);
        if (nick && nick.length > row.nickname.length) {
          row.nickname = nick;
        }
      }
    }
    return map;
  }
  function classifyCommentersAgainstHistory(input) {
    const params = input && typeof input === "object" ? input : {};
    const currentLiveId = cleanUid(params.currentLiveId);
    const currentComments = Array.isArray(params.currentComments) ? params.currentComments : [];
    const pastBroadcasts = Array.isArray(params.pastBroadcasts) ? params.pastBroadcasts : [];
    const heavyThreshold = typeof params.heavyThreshold === "number" && params.heavyThreshold > 0 ? params.heavyThreshold : 5;
    const past = indexPastUsers(pastBroadcasts, currentLiveId);
    const currentUsers = /* @__PURE__ */ new Set();
    for (const c of currentComments) {
      const uid = cleanUid(c?.userId);
      if (!uid) continue;
      currentUsers.add(uid);
    }
    let newCount = 0;
    let repeatCount = 0;
    let heavyCount = 0;
    for (const uid of currentUsers) {
      const past_ = past.get(uid);
      if (!past_) {
        newCount += 1;
      } else {
        repeatCount += 1;
        if (past_.totalComments >= heavyThreshold) heavyCount += 1;
      }
    }
    const total = currentUsers.size;
    const ratio = (n) => total > 0 ? Math.round(n / total * 1e3) / 1e3 : 0;
    return {
      totalCurrent: total,
      newCount,
      repeatCount,
      heavyCount,
      newRatio: ratio(newCount),
      repeatRatio: ratio(repeatCount),
      heavyRatio: ratio(heavyCount)
    };
  }
  function findDepartedHeavyCommenters(input) {
    const params = input && typeof input === "object" ? input : {};
    const currentComments = Array.isArray(params.currentComments) ? params.currentComments : [];
    const pastBroadcasts = Array.isArray(params.pastBroadcasts) ? params.pastBroadcasts : [];
    const heavyThreshold = typeof params.heavyThreshold === "number" && params.heavyThreshold > 0 ? params.heavyThreshold : 5;
    const topN = typeof params.topN === "number" && params.topN > 0 ? Math.floor(params.topN) : 10;
    const past = indexPastUsers(pastBroadcasts, "");
    const currentUsers = /* @__PURE__ */ new Set();
    for (const c of currentComments) {
      const uid = cleanUid(c?.userId);
      if (uid) currentUsers.add(uid);
    }
    const departed = [];
    for (const [uid, row] of past) {
      if (currentUsers.has(uid)) continue;
      if (row.totalComments < heavyThreshold) continue;
      departed.push({
        userId: uid,
        // 0.1.34 (AI): 表示用 nickname も返す（過去配信から最も詳しいハンドル名）。
        nickname: row.nickname || "",
        totalComments: row.totalComments,
        broadcastCount: row.broadcastIds.size
      });
    }
    departed.sort((a, b) => b.totalComments - a.totalComments);
    return departed.slice(0, topN);
  }
  function buildCommenterAttendanceMatrix(input) {
    const params = input && typeof input === "object" ? input : {};
    const broadcasts = Array.isArray(params.broadcasts) ? params.broadcasts : [];
    const topN = typeof params.topN === "number" && params.topN > 0 ? Math.floor(params.topN) : 20;
    if (!broadcasts.length) return { users: [], broadcasts: [] };
    const perBroadcast = [];
    const totals = /* @__PURE__ */ new Map();
    const nicknames = /* @__PURE__ */ new Map();
    for (const b of broadcasts) {
      if (!b || typeof b !== "object") continue;
      const lid = cleanUid(b.liveId);
      if (!lid) continue;
      const userCount = /* @__PURE__ */ new Map();
      const cs = Array.isArray(b.comments) ? b.comments : [];
      for (const c of cs) {
        const uid = cleanUid(c?.userId);
        if (!uid) continue;
        userCount.set(uid, (userCount.get(uid) || 0) + 1);
        totals.set(uid, (totals.get(uid) || 0) + 1);
        const nick = String(c?.nickname == null ? "" : c.nickname).trim();
        if (nick) {
          const cur = nicknames.get(uid) || "";
          if (nick.length > cur.length) nicknames.set(uid, nick);
        }
      }
      perBroadcast.push({ liveId: lid, users: userCount });
    }
    const ranked = [...totals.entries()].map(([uid, n]) => ({ userId: uid, totalComments: n })).sort((a, b) => b.totalComments - a.totalComments).slice(0, topN);
    const users = ranked.map((u) => ({
      userId: u.userId,
      nickname: nicknames.get(u.userId) || "",
      totalComments: u.totalComments,
      attendance: perBroadcast.map((b) => b.users.has(u.userId) ? 1 : 0)
    }));
    return {
      users,
      broadcasts: perBroadcast.map((b) => ({
        liveId: b.liveId,
        totalComments: [...b.users.values()].reduce((a, x) => a + x, 0)
      }))
    };
  }

  // src/lib/commenterSurvivalCurve.js
  function buildCommenterSurvivalCurve(comments, opts = {}) {
    const segmentCount = typeof opts?.segmentCount === "number" && opts.segmentCount > 0 ? Math.floor(opts.segmentCount) : 4;
    const list = Array.isArray(comments) ? comments : [];
    const valid = [];
    for (const c of list) {
      if (!c || typeof c !== "object") continue;
      const at = c.capturedAt;
      if (typeof at !== "number" || !Number.isFinite(at) || at <= 0) continue;
      const uid = c.userId == null ? "" : String(c.userId).trim();
      if (!uid) continue;
      valid.push({ at, uid });
    }
    if (!valid.length) return { baseUserCount: 0, segments: [] };
    valid.sort((a, b) => a.at - b.at);
    const firstAt = valid[0].at;
    const lastAt = valid[valid.length - 1].at;
    const totalSpan = Math.max(1, lastAt - firstAt);
    const segSpan = totalSpan / segmentCount;
    const segUsers = Array.from({ length: segmentCount }, () => /* @__PURE__ */ new Set());
    for (const v of valid) {
      let idx = Math.floor((v.at - firstAt) / segSpan);
      if (idx >= segmentCount) idx = segmentCount - 1;
      if (idx < 0) idx = 0;
      segUsers[idx].add(v.uid);
    }
    const baseUsers = segUsers[0];
    const baseUserCount = baseUsers.size;
    const segments = segUsers.map((users, i) => {
      let present = 0;
      for (const u of baseUsers) if (users.has(u)) present += 1;
      const retentionPct = baseUserCount > 0 ? Math.round(present / baseUserCount * 1e3) / 10 : 0;
      return {
        segmentIndex: i,
        startMin: Math.round(i * segSpan / 6e4),
        endMin: Math.round((i + 1) * segSpan / 6e4),
        presentCount: present,
        retentionPct
      };
    });
    return { baseUserCount, segments };
  }

  // src/lib/newVsRepeatBasis.js
  function judgeNewVsRepeatBasis(pastBroadcastCount) {
    const n = Number(pastBroadcastCount);
    if (Number.isFinite(n) && n > 0) return { ok: true, note: "" };
    return {
      ok: false,
      note: "過去の配信を読み込んでいないため、新規／リピーター／ヘビー常連は未集計です(コメントの多い配信では、生成を軽くするため過去配信の読み込みを省略します)。過去を突き合わせないと全員が「新規」になってしまうので、数字は出していません。"
    };
  }

  // src/lib/marketingGiftThrowLedger.js
  var MARKETING_GIFT_LEDGER_MAX_ROWS = 200;
  var MARKETING_GIFT_LEDGER_DISPLAY_RULE_NOTE = "取得できたサムネ・送り主（アカウント/ID）・アイテム名・pt は必ず表示します。未取得のみ「—」またはプレースホルダです。";
  var MARKETING_GIFT_LEDGER_MAX_SENDERS = 20;
  function giftLedgerSenderKey(row) {
    const uid = String(row.userId || "").trim();
    if (/^\d{1,18}$/.test(uid)) return `uid:${uid}`;
    const name = String(row.senderLabel || "").trim() || "（不明）";
    return `name:${name}`;
  }
  function buildGiftLedgerSenderAggregates(rows, opts = {}) {
    const maxSenders = typeof opts.maxSenders === "number" && opts.maxSenders > 0 ? Math.trunc(opts.maxSenders) : MARKETING_GIFT_LEDGER_MAX_SENDERS;
    const maxItems = typeof opts.maxItemsPerSender === "number" && opts.maxItemsPerSender > 0 ? Math.trunc(opts.maxItemsPerSender) : 6;
    const map = /* @__PURE__ */ new Map();
    for (const row of rows) {
      if (!row || !row.points) continue;
      const key = giftLedgerSenderKey(row);
      let agg = map.get(key);
      if (!agg) {
        agg = {
          senderKey: key,
          senderLabel: String(row.senderLabel || "").trim() || "（不明）",
          userId: String(row.userId || "").trim(),
          senderAvatarUrl: String(row.senderAvatarUrl || "").trim(),
          throwCount: 0,
          totalPoints: 0,
          items: [],
          _items: /* @__PURE__ */ new Map()
        };
        map.set(key, agg);
      }
      const rowUid = String(row.userId || "").trim();
      if (rowUid && /^\d{1,18}$/.test(rowUid)) {
        agg.userId = rowUid;
      }
      const rowAv = String(row.senderAvatarUrl || "").trim();
      if (rowAv && !agg.senderAvatarUrl) agg.senderAvatarUrl = rowAv;
      agg.throwCount += 1;
      agg.totalPoints += row.points;
      const itemKey = String(row.itemName || "（名称未取得）").trim();
      const cur = agg._items.get(itemKey) || {
        itemName: itemKey,
        throwCount: 0,
        totalPoints: 0,
        thumbnailUrl: ""
      };
      cur.throwCount += 1;
      cur.totalPoints += row.points;
      const itemThumb = String(row.thumbnailUrl || "").trim();
      if (itemThumb && !cur.thumbnailUrl) cur.thumbnailUrl = itemThumb;
      agg._items.set(itemKey, cur);
    }
    const out = [...map.values()].map((agg) => {
      const items = [...agg._items.values()].sort(
        (a, b) => b.totalPoints - a.totalPoints || b.throwCount - a.throwCount || a.itemName.localeCompare(b.itemName, "ja")
      ).slice(0, maxItems);
      const rest = { ...agg };
      delete rest._items;
      return { ...rest, items };
    });
    return out.sort(
      (a, b) => b.totalPoints - a.totalPoints || b.throwCount - a.throwCount || a.senderLabel.localeCompare(b.senderLabel, "ja")
    ).slice(0, maxSenders);
  }
  function buildGiftLedgerChartSeries(rows, opts = {}) {
    const max = typeof opts.max === "number" && opts.max > 0 ? Math.trunc(opts.max) : 12;
    return rows.filter((r) => r && Number.isFinite(r.value) && r.value > 0).slice(0, max).map((r) => ({
      label: String(r.label || "").trim(),
      value: Math.trunc(r.value),
      sublabel: r.sublabel ? String(r.sublabel) : void 0,
      thumbnailUrl: r.thumbnailUrl ? String(r.thumbnailUrl) : void 0
    }));
  }
  function positivePoints(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.trunc(n);
  }
  function parseGiftStreamTimeSortKey(timeLabel) {
    const s = String(timeLabel || "").trim();
    if (!s) return 0;
    const parts = s.split(":").map((p) => parseInt(String(p).replace(/[^\d]/g, ""), 10));
    if (parts.some((n) => !Number.isFinite(n))) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 1) return parts[0];
    return 0;
  }
  function ledgerDedupeKey(sender, item, points, timeLabel) {
    return `${String(timeLabel).trim()}	${String(sender).trim()}	${String(item).trim()}	${points}`;
  }
  function buildGiftLedgerItemAggregates(allRows, totalCounts) {
    const officialCountByKey = /* @__PURE__ */ new Map();
    const itemMap = /* @__PURE__ */ new Map();
    for (const raw of totalCounts) {
      const r = (
        /** @type {Record<string, unknown>} */
        raw || {}
      );
      const name = String(r.itemName || "").trim();
      const count = positivePoints(r.count);
      if (!name || !count) continue;
      const key = name.toLowerCase();
      officialCountByKey.set(key, count);
      itemMap.set(key, {
        itemName: name,
        count: 0,
        points: 0,
        thumbnailUrl: String(r.thumbnailUrl || "").trim(),
        rowCount: 0
      });
    }
    for (const row of allRows) {
      if (!row || !row.points) continue;
      const key = String(row.itemName || "").trim().toLowerCase();
      if (!key) continue;
      let cur = itemMap.get(key);
      if (!cur) {
        cur = {
          itemName: row.itemName,
          count: 0,
          points: 0,
          thumbnailUrl: "",
          rowCount: 0
        };
        itemMap.set(key, cur);
      }
      cur.rowCount += 1;
      cur.points += row.points;
      if (!cur.thumbnailUrl && row.thumbnailUrl) cur.thumbnailUrl = row.thumbnailUrl;
    }
    return [...itemMap.values()].map(({ rowCount, ...rest }) => {
      const key = rest.itemName.toLowerCase();
      const official = officialCountByKey.get(key);
      return {
        itemName: rest.itemName,
        count: official != null && official > 0 ? official : rowCount,
        points: rest.points,
        thumbnailUrl: rest.thumbnailUrl
      };
    }).sort(
      (a, b) => b.count - a.count || b.points - a.points || a.itemName.localeCompare(b.itemName, "ja")
    ).slice(0, 24);
  }
  function isNdgrLedgerDuplicateOfOfficial(candidate, rows) {
    const uid = String(candidate.userId || "").trim();
    const pts = candidate.points;
    if (!uid || !pts) return false;
    const item = String(candidate.itemName || "").trim();
    const unnamed = !item || item === "（名称未取得）";
    for (const ex of rows) {
      if (!ex.source.includes("公式") && !ex.source.includes("koken")) continue;
      if (String(ex.userId || "").trim() !== uid || ex.points !== pts) continue;
      const exItem = String(ex.itemName || "").trim();
      if (unnamed || !exItem || exItem === item) return true;
    }
    return false;
  }
  function upsertLedgerRow(map, row, priority) {
    const key = row.dedupeKey;
    const prev = map.get(key);
    if (!prev || priority > (prev._priority || 0)) {
      map.set(key, { ...row, _priority: priority });
    }
  }
  function buildMarketingGiftThrowLedger(input, opts = {}) {
    const maxRows = typeof opts.maxRows === "number" && opts.maxRows > 0 ? Math.trunc(opts.maxRows) : MARKETING_GIFT_LEDGER_MAX_ROWS;
    const map = /* @__PURE__ */ new Map();
    const sourceNotes = [];
    const subHistory = Array.isArray(input?.giftSubAppHistory?.history) ? input.giftSubAppHistory.history : [];
    const subSource = String(input?.giftSubAppHistory?.source || "").trim();
    if (subHistory.length) {
      const label = subSource === "koken-api" ? "koken 公式 API" : subSource === "merged" ? "公式履歴（DOM + koken API）" : "ギフト sub-app / DOM";
      sourceNotes.push(`${label} ${subHistory.length} 件`);
      for (const raw of subHistory) {
        const r = (
          /** @type {Record<string, unknown>} */
          raw || {}
        );
        const senderLabel = String(r.senderName || "").trim();
        const itemName = String(r.itemName || "").trim();
        const points = positivePoints(r.points);
        const timeLabel = String(r.time || "").trim();
        if (!senderLabel || !points) continue;
        const userId = String(r.userId || "").trim();
        const rowSource = subSource === "koken-api" ? "公式履歴（koken API・一括）" : subSource === "merged" ? "公式履歴" : "公式履歴（sub-app）";
        const kokenId = String(r.kokenHistoryId || "").trim();
        const row = {
          timeLabel: timeLabel || "—",
          sortKey: Number.isFinite(Number(r.sortKey)) && Number(r.sortKey) > 0 ? Number(r.sortKey) : parseGiftStreamTimeSortKey(timeLabel),
          senderLabel,
          userId,
          itemName: itemName || "（名称未取得）",
          points,
          thumbnailUrl: String(r.thumbnailUrl || "").trim(),
          senderAvatarUrl: String(r.senderAvatarUrl || "").trim(),
          source: rowSource,
          dedupeKey: kokenId ? `koken:${kokenId}` : ledgerDedupeKey(senderLabel, itemName, points, timeLabel)
        };
        upsertLedgerRow(map, row, subSource === "koken-api" ? 28 : 30);
      }
    }
    const official = Array.isArray(input?.officialGiftHistory) ? input.officialGiftHistory : [];
    if (official.length) {
      sourceNotes.push(`公式 DOM ギフト履歴 ${official.length} 件`);
      for (const raw of official) {
        const r = (
          /** @type {Record<string, unknown>} */
          raw || {}
        );
        const senderLabel = String(r.advertiserName || r.nickname || "").trim();
        const itemName = String(r.giftName || r.itemName || "").trim();
        const points = positivePoints(r.point ?? r.points);
        const timeLabel = String(r.time || "").trim();
        if (!senderLabel || !points) continue;
        const row = {
          timeLabel: timeLabel || "—",
          sortKey: parseGiftStreamTimeSortKey(timeLabel),
          senderLabel,
          userId: "",
          itemName: itemName || "（名称未取得）",
          points,
          thumbnailUrl: String(r.thumbnailUrl || "").trim(),
          senderAvatarUrl: "",
          source: "公式履歴（DOM）",
          dedupeKey: ledgerDedupeKey(senderLabel, itemName, points, timeLabel)
        };
        upsertLedgerRow(map, row, 20);
      }
    }
    const officialRowsSoFar = [...map.values()].map(({ _priority, ...rest }) => rest);
    const skipNdgrLedger = subHistory.length > 0;
    const events = Array.isArray(input?.giftEvents) ? input.giftEvents : [];
    if (events.length) {
      if (skipNdgrLedger) {
        sourceNotes.push(`NDGR 個別ギフト ${events.length} 件（公式履歴と重複のため台帳では省略）`);
      } else {
        sourceNotes.push(`NDGR 個別ギフト ${events.length} 件`);
      }
      for (const raw of events) {
        if (skipNdgrLedger) continue;
        const r = (
          /** @type {Record<string, unknown>} */
          raw || {}
        );
        const userId = String(r.userId || "").trim();
        const senderLabel = String(r.nickname || r.senderName || userId || "").trim();
        const itemName = String(r.itemName || r.giftName || "").trim();
        const points = positivePoints(r.point ?? r.points);
        const capturedAt = Number(r.capturedAt);
        const timeLabel = Number.isFinite(capturedAt) && capturedAt > 0 ? new Date(capturedAt).toLocaleTimeString("ja-JP", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        }) : "—";
        if (!senderLabel || !points) continue;
        const row = {
          timeLabel,
          sortKey: Number.isFinite(capturedAt) && capturedAt > 0 ? capturedAt : 0,
          senderLabel,
          userId,
          itemName: itemName || "（名称未取得）",
          points,
          thumbnailUrl: String(r.thumbnailUrl || "").trim(),
          senderAvatarUrl: "",
          source: "NDGR 受信",
          dedupeKey: ledgerDedupeKey(senderLabel, itemName || "", points, `${timeLabel}	${userId}`)
        };
        if (isNdgrLedgerDuplicateOfOfficial(row, officialRowsSoFar)) continue;
        upsertLedgerRow(map, row, 10);
      }
    }
    const allRows = [...map.values()].map(({ _priority, ...rest }) => rest);
    allRows.sort((a, b) => {
      if (b.sortKey !== a.sortKey) return b.sortKey - a.sortKey;
      if (b.points !== a.points) return b.points - a.points;
      return a.senderLabel.localeCompare(b.senderLabel, "ja");
    });
    const truncated = allRows.length > maxRows;
    const displayRows = truncated ? allRows.slice(0, maxRows) : allRows;
    const itemAggregates = buildGiftLedgerItemAggregates(
      allRows,
      Array.isArray(input?.giftSubAppHistory?.totalCounts) ? input.giftSubAppHistory.totalCounts : []
    );
    const senderAggregates = buildGiftLedgerSenderAggregates(allRows);
    const senderChart = buildGiftLedgerChartSeries(
      senderAggregates.map((s) => ({
        label: s.senderLabel,
        value: s.totalPoints,
        sublabel: `${s.throwCount}投`
      })),
      { max: 12 }
    );
    const itemChart = buildGiftLedgerChartSeries(
      itemAggregates.map((it) => ({
        label: it.itemName,
        value: it.points,
        sublabel: `×${it.count}`,
        thumbnailUrl: it.thumbnailUrl
      })),
      { max: 12 }
    );
    if (!sourceNotes.length) {
      sourceNotes.push(
        "ギフト履歴未取得（マーケ DL 時に koken API で一括取得を試みます。配信ページを開いた状態で再 DL してください）"
      );
    }
    return {
      rows: displayRows,
      itemAggregates,
      senderAggregates,
      senderChart,
      itemChart,
      totalThrows: allRows.length,
      totalPoints: allRows.reduce((sum, r) => sum + r.points, 0),
      uniqueSenders: senderAggregates.length,
      truncated,
      sourceNotes
    };
  }

  // src/lib/timeAuthority.js
  var VALUE_FRESH_MS = 3 * 60 * 1e3;
  function toEpochMs(v) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
    const t = Date.parse(String(v || ""));
    return Number.isFinite(t) && t > 0 ? t : 0;
  }

  // src/lib/supportersGiftsSection.js
  var SUPPORTERS_GIFTS_MAX_COMMENTS_PER_USER = 1e3;
  var SUPPORTERS_GIFTS_MAX_COMMENT_ONLY_USERS = 300;
  var SUPPORTERS_GIFTS_OPEN_TOP = 10;
  var SUPPORTERS_GIFTS_VISIBLE = 50;
  var SUPPORTERS_GIFTS_CSS = `
.mkt-sg-list{display:flex;flex-direction:column;gap:6px}
.mkt-sg{border:1px solid #334155;border-radius:8px;background:#0f172a;color:#e2e8f0}
.mkt-sg>summary{cursor:pointer;padding:8px 10px;display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.mkt-sg>summary:hover{background:#162033}
.mkt-sg-rest>summary{cursor:pointer;color:#93c5fd;padding:8px 2px}
.mkt-sg a{color:#7dd3fc}
.mkt-sg__rank{font-weight:700;min-width:2.2em;color:#fbbf24}
.mkt-sg__meta{color:#aab6c8;font-size:.92em}
.mkt-sg__body{padding:4px 12px 10px}
.mkt-sg__body h4{margin:8px 0 4px;font-size:.95em;color:#cbd5e1}
.mkt-sg__table{width:100%;border-collapse:collapse;font-size:.92em;color:#e2e8f0}
.mkt-sg__table th{color:#94a3b8;font-weight:600}
.mkt-sg__table th,.mkt-sg__table td{padding:3px 6px;text-align:left;border-bottom:1px solid #334155;vertical-align:top;word-break:break-word}
.mkt-sg__time{white-space:nowrap;color:#94a3b8}
.mkt-sg__more{color:#94a3b8;font-size:.9em}
.mkt-sg-search{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:.4rem 0 .8rem}
.mkt-sg-search input{flex:1 1 260px;min-width:0;padding:8px 10px;border-radius:8px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;font-size:.95rem}
.mkt-sg-search input:focus{outline:2px solid #38bdf8;border-color:#38bdf8}
.mkt-sg-search__result{color:#aab6c8;font-size:.85rem}
@media print{.mkt-sg,.mkt-sg__table{background:#fff;color:#111}.mkt-sg__table th,.mkt-sg__table td{border-bottom-color:#ccc}.mkt-sg__meta,.mkt-sg__time,.mkt-sg__more,.mkt-sg__body h4,.mkt-sg__table th{color:#333}.mkt-sg-search{display:none}}
`;
  var SUPPORTERS_GIFTS_SEARCH_SCRIPT = `<script>
(function () {
  var input = document.getElementById('mktSgSearch');
  var result = document.getElementById('mktSgSearchResult');
  var list = document.getElementById('mktSgList');
  if (!input || !result || !list) return;
  var items = Array.prototype.slice.call(list.querySelectorAll('details.mkt-sg'));
  var rest = list.querySelector('details.mkt-sg-rest');
  var restWasOpen = !!(rest && rest.open);
  var hays = null;
  var wasOpen = items.map(function (d) { return d.hasAttribute('open'); });
  var timer = 0;
  function norm(s) { return String(s || '').toLowerCase(); }
  function apply() {
    var q = norm(input.value).trim();
    var rows = list.querySelectorAll('tbody tr');
    if (rest) rest.open = q ? true : restWasOpen;
    if (!q) {
      items.forEach(function (d, i) { d.hidden = false; if (wasOpen[i]) d.setAttribute('open', ''); else d.removeAttribute('open'); });
      for (var r = 0; r < rows.length; r++) rows[r].hidden = false;
      result.textContent = '';
      return;
    }
    if (!hays) hays = items.map(function (d) { return norm(d.textContent); });
    var hit = 0;
    items.forEach(function (d, i) {
      var ok = hays[i].indexOf(q) >= 0;
      d.hidden = !ok;
      if (!ok) return;
      hit++;
      d.setAttribute('open', '');
      var sm = d.querySelector('summary');
      var summaryHit = norm(sm ? sm.textContent : '').indexOf(q) >= 0;
      var trs = d.querySelectorAll('tbody tr');
      for (var k = 0; k < trs.length; k++) trs[k].hidden = !summaryHit && norm(trs[k].textContent).indexOf(q) < 0;
    });
    result.textContent = hit + '名が一致(全' + items.length + '名)';
  }
  input.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(apply, 150);
  });
})();
<\/script>`;
  var NUMERIC_UID = /^\d{1,18}$/;
  var str2 = (v) => String(v == null ? "" : v).trim();
  function commentUserKey(uid) {
    return NUMERIC_UID.test(uid) ? `uid:${uid}` : uid;
  }
  function formatClockJst(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return "—";
    try {
      return new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
      }).format(new Date(n));
    } catch {
      return "—";
    }
  }
  function buildSupportersGiftsRows(input) {
    const comments = Array.isArray(input?.comments) ? input.comments : [];
    const giftRows = Array.isArray(input?.giftRows) ? input.giftRows : [];
    const bcUid = str2(input?.broadcasterUserId);
    const map = /* @__PURE__ */ new Map();
    const ensure = (key, userId) => {
      let row = map.get(key);
      if (!row) {
        row = {
          userKey: key,
          userId,
          label: "",
          avatarUrl: "",
          commentCount: 0,
          comments: [],
          commentsOmitted: 0,
          giftCount: 0,
          giftPoints: 0,
          gifts: []
        };
        map.set(key, row);
      }
      return row;
    };
    for (const raw of comments) {
      const e = (
        /** @type {Record<string, unknown>} */
        raw || {}
      );
      const uid = str2(e.userId);
      const text = str2(e.text);
      if (!uid || !text) continue;
      if (bcUid && uid === bcUid) continue;
      const row = ensure(commentUserKey(uid), uid);
      row.commentCount += 1;
      const nick = str2(e.nickname);
      if (nick && (!row.label || nick.length > row.label.length)) row.label = nick;
      const av = str2(e.avatarUrl);
      if (av && /^https?:\/\//.test(av)) row.avatarUrl = av;
      row.comments.push({ at: toEpochMs(e.capturedAt), text });
    }
    for (const raw of giftRows) {
      const r = (
        /** @type {any} */
        raw || {}
      );
      const points = Number(r.points) || 0;
      if (!(points > 0)) continue;
      const key = giftLedgerSenderKey(r);
      const row = ensure(key, str2(r.userId));
      row.giftCount += 1;
      row.giftPoints += points;
      const sender = str2(r.senderLabel);
      if (sender && !row.label) row.label = sender;
      const av = str2(r.senderAvatarUrl);
      if (av && !row.avatarUrl && /^https?:\/\//.test(av)) row.avatarUrl = av;
      row.gifts.push({
        timeLabel: str2(r.timeLabel) || "—",
        itemName: str2(r.itemName) || "（名称未取得）",
        points,
        thumbnailUrl: str2(r.thumbnailUrl),
        _sort: Number(r.sortKey) || 0
      });
    }
    const all = [...map.values()];
    for (const row of all) {
      row.comments.sort((a, b) => a.at - b.at);
      if (row.comments.length > SUPPORTERS_GIFTS_MAX_COMMENTS_PER_USER) {
        row.commentsOmitted = row.comments.length - SUPPORTERS_GIFTS_MAX_COMMENTS_PER_USER;
        row.comments = row.comments.slice(0, SUPPORTERS_GIFTS_MAX_COMMENTS_PER_USER);
      }
      row.gifts.sort((a, b) => (a._sort || 0) - (b._sort || 0));
      for (const gft of row.gifts) delete gft._sort;
    }
    all.sort((a, b) => b.giftPoints - a.giftPoints || b.commentCount - a.commentCount || (a.userKey < b.userKey ? -1 : a.userKey > b.userKey ? 1 : 0));
    const gifted = all.filter((r) => r.giftCount > 0);
    const commentOnly = all.filter((r) => r.giftCount === 0);
    const keptCommentOnly = commentOnly.slice(0, SUPPORTERS_GIFTS_MAX_COMMENT_ONLY_USERS);
    const out = [...gifted, ...keptCommentOnly];
    out.sort((a, b) => b.giftPoints - a.giftPoints || b.commentCount - a.commentCount || (a.userKey < b.userKey ? -1 : a.userKey > b.userKey ? 1 : 0));
    Object.defineProperty(out, "omittedUsers", { value: commentOnly.length - keptCommentOnly.length, enumerable: false });
    return out;
  }
  var fmt = (n) => Number(n || 0).toLocaleString("ja-JP");
  function sectionSupportersGiftsHtml(rows, opts = {}) {
    const list = Array.isArray(rows) ? rows : [];
    const mask = opts.maskShare === true;
    const openTop = Number.isFinite(opts.openTop) ? Math.max(0, Number(opts.openTop)) : SUPPORTERS_GIFTS_OPEN_TOP;
    const head = `<h2>応援者とギフト（誰がどんなコメントをして・どんなギフトを出したか）</h2>`;
    if (!list.length) {
      return `<section class="mkt-section" id="mkt-supporters-gifts">
${head}
<p class="mkt-note">この配信のコメント・ギフトの記録がありません。</p>
</section>`;
    }
    const omittedUsers = Number(
      /** @type {any} */
      list.omittedUsers
    ) || 0;
    const giftedUsers = list.filter((r) => r.giftCount > 0).length;
    const totalPts = list.reduce((n, r) => n + r.giftPoints, 0);
    const totalComments = list.reduce((n, r) => n + r.commentCount, 0);
    const note = `<p class="mkt-note">応援者ごとに、コメントとギフトをまとめています(畳んであります。上位${openTop}人は開いています)。 <strong>${escapeHtml(`${fmt(list.length)}名(うちギフト ${fmt(giftedUsers)}名)・コメント ${fmt(totalComments)}件・ギフト合計 ${fmt(totalPts)} pt`)}</strong>` + (omittedUsers > 0 ? ` ギフトを出していない方のうち、コメントの少ない ${fmt(omittedUsers)}名は省略しています。` : "") + (mask ? " 共有モード(伏せ字)のため、名前・コメント本文・アイテムの内訳は出していません。" : "") + `</p>`;
    const items = list.map((row, i) => {
      const meta = `<span class="mkt-sg__meta">コメント ${fmt(row.commentCount)} 件${row.giftCount > 0 ? ` ／ ギフト ${fmt(row.giftCount)} 回・${fmt(row.giftPoints)} pt` : ""}</span>`;
      if (mask) {
        return `<div class="mkt-sg mkt-sg--mask"><div class="mkt-sg__summary" style="padding:8px 10px"><span class="mkt-sg__rank">#${i + 1}</span> ${meta}</div></div>`;
      }
      const idc = typeof opts.renderIdentity === "function" ? opts.renderIdentity(row) : { thumbCell: "", accountHtml: escapeHtml(row.label || row.userKey), idHtml: escapeHtml(row.userId) };
      const giftsHtml = row.gifts.length ? `<h4>ギフト(${fmt(row.gifts.length)}回)</h4><table class="mkt-sg__table"><thead><tr><th>時刻</th><th>アイテム</th><th>pt</th></tr></thead><tbody>${row.gifts.map((g) => `<tr><td class="mkt-sg__time">${escapeHtml(g.timeLabel)}</td><td>${escapeHtml(g.itemName)}</td><td>${fmt(g.points)} pt</td></tr>`).join("")}</tbody></table>` : "";
      const commentsHtml = row.comments.length ? `<h4>コメント(${fmt(row.commentCount)}件)</h4><table class="mkt-sg__table"><thead><tr><th>時刻</th><th>コメント</th></tr></thead><tbody>${row.comments.map((cm) => `<tr><td class="mkt-sg__time">${escapeHtml(formatClockJst(cm.at))}</td><td>${escapeHtml(cm.text)}</td></tr>`).join("")}</tbody></table>${row.commentsOmitted > 0 ? `<p class="mkt-sg__more">ほか ${fmt(row.commentsOmitted)} 件(長いため省略。件数は実数です)</p>` : ""}` : "";
      return `<details class="mkt-sg"${i < openTop ? " open" : ""}><summary><span class="mkt-sg__rank">#${i + 1}</span>${idc.thumbCell} ${idc.accountHtml} ${idc.idHtml} ${meta}</summary><div class="mkt-sg__body">${giftsHtml}${commentsHtml}</div></details>`;
    });
    const searchBox = mask ? "" : `<div class="mkt-sg-search"><input type="search" id="mktSgSearch" placeholder="コメント・名前・ID・ギフトのアイテムを検索" aria-label="応援者とギフトの検索" autocomplete="off"><span class="mkt-sg-search__result" id="mktSgSearchResult" aria-live="polite"></span></div>`;
    return `<section class="mkt-section" id="mkt-supporters-gifts">
${head}
${note}
${searchBox}
<div class="mkt-sg-list" id="mktSgList">
${items.slice(0, SUPPORTERS_GIFTS_VISIBLE).join("\n")}
${items.length > SUPPORTERS_GIFTS_VISIBLE ? `<details class="mkt-sg-rest"><summary>残り ${fmt(items.length - SUPPORTERS_GIFTS_VISIBLE)}人を見る</summary>
${items.slice(SUPPORTERS_GIFTS_VISIBLE).join("\n")}
</details>` : ""}
</div>
${mask ? "" : SUPPORTERS_GIFTS_SEARCH_SCRIPT}
</section>`;
  }

  // src/lib/mediaKitEmbed.js
  var MEDIA_KIT_EMBED_SCOPE = "#mkt-media-kit";
  function scopeCss(css, scope) {
    let out = "";
    let i = 0;
    const n = css.length;
    while (i < n) {
      const open = css.indexOf("{", i);
      if (open < 0) break;
      const head = css.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < n && depth > 0) {
        const ch = css[j];
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
        j++;
      }
      const inner = css.slice(open + 1, j - 1);
      if (/^@(media|supports|container|layer)\b/.test(head)) {
        out += `${head}{${scopeCss(inner, scope)}}`;
      } else if (head.startsWith("@")) {
        out += `${head}{${inner}}`;
      } else {
        const sel = head.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
          if (s === ":root" || s === "html" || s === "body") return scope;
          if (s === "*") return `${scope} *`;
          return `${scope} ${s}`;
        }).join(",");
        out += `${sel}{${inner}}`;
      }
      i = j;
    }
    return out;
  }
  function extractMediaKitParts(kitHtml) {
    const html = String(kitHtml || "");
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
    const mainMatch = html.match(/<main>([\s\S]*)<\/main>/);
    if (!styleMatch || !mainMatch) return null;
    return { css: styleMatch[1], bodyHtml: mainMatch[1] };
  }
  function sectionMediaKitHtml(kitHtml) {
    const parts = extractMediaKitParts(kitHtml);
    if (!parts) return "";
    const css = scopeCss(parts.css, MEDIA_KIT_EMBED_SCOPE);
    return `<section class="mkt-section" id="mkt-media-kit-section">
<h2>${escapeHtml("メディアキット（共有用の実績サマリ）")}</h2>
<p class="mkt-note">スポンサーや仲間への共有用に、この配信者の最近の配信実績をまとめた章です(この PC で記録した配信だけ)。</p>
<div id="mkt-media-kit"><style>${css}</style>${parts.bodyHtml}</div>
</section>`;
  }

  // src/lib/viewerRetentionEstimate.js
  var VIEWER_RETENTION_MIN_DURATION_MS = 6 * 6e4;
  var EDGE_WINDOW_RATIO = 0.1;
  var EDGE_WINDOW_MIN_MS = 3 * 6e4;
  var EDGE_WINDOW_MAX_MS = 10 * 6e4;
  function pct1(n) {
    return Math.round(n * 1e3) / 10;
  }
  function estimateViewerRetention(comments, opts = {}) {
    const broadcasterUid = String(opts?.broadcasterUserId || "").trim();
    const byUser = /* @__PURE__ */ new Map();
    let firstAll = 0;
    let lastAll = 0;
    for (const raw of Array.isArray(comments) ? comments : []) {
      if (!raw || typeof raw !== "object") continue;
      const c = (
        /** @type {Record<string, unknown>} */
        raw
      );
      const at = toEpochMs(c.capturedAt);
      if (!(at > 0)) continue;
      const uid = c.userId == null ? "" : String(c.userId).trim();
      if (!uid) continue;
      if (broadcasterUid && uid === broadcasterUid) continue;
      if (parseInterestArrivalComment(String(c.text || ""))) continue;
      if (!firstAll || at < firstAll) firstAll = at;
      if (at > lastAll) lastAll = at;
      const nick = typeof c.nickname === "string" ? c.nickname : "";
      const av = typeof c.avatarUrl === "string" ? c.avatarUrl : "";
      const u = byUser.get(uid);
      if (u) {
        u.count += 1;
        if (at < u.firstAt) u.firstAt = at;
        if (at > u.lastAt) u.lastAt = at;
        if (!u.nickname && nick) u.nickname = nick;
        if (!u.avatarUrl && av) u.avatarUrl = av;
      } else {
        byUser.set(uid, {
          userId: uid,
          nickname: nick,
          avatarUrl: av,
          count: 1,
          firstAt: at,
          lastAt: at,
          watchedMs: 0,
          retentionPct: 0,
          stayedToEnd: false,
          fromStart: false,
          singleComment: false
        });
      }
    }
    const programStart = Number(opts?.programStartAtMs);
    const useProgram = Number.isFinite(programStart) && programStart > 0 && firstAll > 0 && programStart <= firstAll;
    const startMs = useProgram ? programStart : firstAll;
    const endMs = lastAll;
    const durationMs = Math.max(0, endMs - startMs);
    const edgeWindowMs = Math.min(EDGE_WINDOW_MAX_MS, Math.max(EDGE_WINDOW_MIN_MS, durationMs * EDGE_WINDOW_RATIO));
    const empty = {
      ok: false,
      reason: "",
      startMs,
      endMs,
      durationMs,
      edgeWindowMs,
      startSource: useProgram ? "program" : "first_comment",
      totalUsers: byUser.size,
      stayedCount: 0,
      stayedPct: 0,
      fromStartCount: 0,
      fromStartStayedCount: 0,
      fromStartStayedPct: 0,
      avgRetentionPct: 0,
      users: []
    };
    if (byUser.size === 0) return { ...empty, reason: "コメントした人が記録されていません。" };
    if (durationMs < VIEWER_RETENTION_MIN_DURATION_MS) {
      return { ...empty, reason: "記録できた配信が6分より短いため、最後まで見たかを判定できません。" };
    }
    const users = [...byUser.values()];
    let stayed = 0;
    let fromStart = 0;
    let fromStartStayed = 0;
    let sumPct = 0;
    for (const u of users) {
      u.stayedToEnd = u.lastAt >= endMs - edgeWindowMs;
      u.fromStart = u.firstAt <= startMs + edgeWindowMs;
      u.singleComment = u.count === 1;
      const from = u.fromStart ? startMs : u.firstAt;
      const to = u.stayedToEnd ? endMs : u.lastAt;
      u.watchedMs = Math.max(0, to - from);
      u.retentionPct = Math.min(100, pct1(u.watchedMs / durationMs));
      sumPct += u.retentionPct;
      if (u.stayedToEnd) stayed += 1;
      if (u.fromStart) {
        fromStart += 1;
        if (u.stayedToEnd) fromStartStayed += 1;
      }
    }
    users.sort(
      (a, b) => Number(b.stayedToEnd) - Number(a.stayedToEnd) || b.retentionPct - a.retentionPct || b.count - a.count || a.firstAt - b.firstAt
    );
    return {
      ...empty,
      ok: true,
      stayedCount: stayed,
      stayedPct: pct1(stayed / users.length),
      fromStartCount: fromStart,
      fromStartStayedCount: fromStartStayed,
      fromStartStayedPct: fromStart > 0 ? pct1(fromStartStayed / fromStart) : 0,
      avgRetentionPct: Math.round(sumPct / users.length * 10) / 10,
      users
    };
  }

  // src/lib/viewerRetentionSectionHtml.js
  var VIEWER_RETENTION_SECTION_ID = "mkt-viewer-retention";
  var VIEWER_RETENTION_TABLE_CAP = 500;
  var VIEWER_RETENTION_OPEN_ROWS = 50;
  function minLabel(ms) {
    const m = Math.max(0, Math.round(ms / 6e4));
    if (m < 60) return `${m}分`;
    return `${Math.floor(m / 60)}時間${m % 60}分`;
  }
  function viewerRetentionBasisHtml(est) {
    const startText = est.startSource === "program" ? "番組の開始時刻" : "最初に記録したコメントの時刻（番組の開始時刻が取れなかったため）";
    const edge = minLabel(est.edgeWindowMs);
    return `<details class="mkt-vr__basis" open>
<summary>この数字の出し方（推定の根拠）</summary>
<ul>
<li>ニコ生は「誰がいつ入って、いつ出たか」を公開していません。そこで<strong>コメントした時刻</strong>から在席を推し量っています。見ているだけでコメントしなかった人は数に入りません。</li>
<li>配信の始まり = ${escapeHtml(startText)}。配信の終わり = 最後に記録したコメントの時刻（配信中に保存したときは、その時点まで）。</li>
<li><strong>最後まで見た</strong> = その人の最後のコメントが、終わりの${escapeHtml(edge)}以内にある。${escapeHtml(edge)}は配信の長さの10%（3分〜10分）です。</li>
<li><strong>一人ずつの視聴維持率</strong> = 推定視聴時間 ÷ 配信の長さ。最初のコメントから最後のコメントまではずっと見ていたとみなします。始まりから${escapeHtml(edge)}以内にコメントした人は始まりから、最後まで見た人は終わりまで見たとみなします。</li>
<li><strong>全体の視聴維持率</strong> = 最後まで見た人 ÷ コメントした人。</li>
<li>コメントが1回だけの人は、その1回の時刻だけで決まるので判定が粗くなります（表に「1回」と出ます）。配信者本人と「〇〇が好きな人が来場しました」の通知は除いています。</li>
</ul>
</details>`;
  }
  function buildViewerRetentionSectionHtml(est, opts = {}) {
    if (!est || est.totalUsers === 0) return "";
    const maskShare = opts.maskShare === true;
    const head = `<section class="mkt-section" id="${VIEWER_RETENTION_SECTION_ID}">
<h2>視聴維持率（最後まで見たか・推定）</h2>`;
    if (!est.ok) {
      return `${head}
<p class="mkt-note">${escapeHtml(est.reason || "判定できませんでした。")}</p>
</section>`;
    }
    const cards = [
      ["全体の視聴維持率", `${est.stayedPct}%`, `コメントした ${est.totalUsers}人のうち ${est.stayedCount}人が最後まで`],
      [
        "始まりから最後まで",
        est.fromStartCount > 0 ? `${est.fromStartStayedPct}%` : "—",
        `序盤にいた ${est.fromStartCount}人のうち ${est.fromStartStayedCount}人`
      ],
      ["一人あたりの平均", `${est.avgRetentionPct}%`, `配信の長さ ${minLabel(est.durationMs)} に対する推定視聴時間`]
    ].map(
      ([k, v, sub]) => `<div class="mkt-vr__card"><div class="mkt-vr__k">${escapeHtml(k)}</div><div class="mkt-vr__v">${escapeHtml(v)}</div><div class="mkt-vr__sub">${escapeHtml(sub)}</div></div>`
    ).join("");
    const shown = est.users.slice(0, VIEWER_RETENTION_TABLE_CAP);
    const rowHtml = shown.map((u, i) => {
      const rawLabel = displayUserLabel(u.userId, u.nickname || "");
      const nameHtml = maskShare ? escapeHtml(maskLabelForShare(rawLabel)) : buildUserProfileLinkedLabelHtml(u.userId, rawLabel);
      const thumb = maskShare ? "" : resolveReportUserThumbSrc({ userId: u.userId, avatarUrl: u.avatarUrl || "", identiconResolver: opts.identiconResolver });
      const thumbHtml = thumb ? `<img class="mkt-vr__av" src="${escapeAttr(thumb)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${escapeAttr(NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS)}'">` : '<span class="mkt-vr__av mkt-vr__av--empty"></span>';
      const verdict = u.stayedToEnd ? '<span class="mkt-vr__tag mkt-vr__tag--stay">最後まで</span>' : '<span class="mkt-vr__tag mkt-vr__tag--left">途中まで</span>';
      const single = u.singleComment ? ' <span class="mkt-vr__tag">1回</span>' : "";
      const join = u.fromStart ? "始まりから" : `${minLabel(u.firstAt - est.startMs)}〜`;
      const last = minLabel(u.lastAt - est.startMs);
      return `<tr>
<td>${i + 1}</td><td>${thumbHtml}</td><td>${nameHtml}</td>
<td>${verdict}${single}</td>
<td class="mkt-vr__bar"><div class="mkt-vr__fill" style="width:${u.retentionPct}%"></div><span>${u.retentionPct}%</span></td>
<td>${escapeHtml(join)}</td><td>${escapeHtml(last)}</td><td>${u.count}</td>
</tr>`;
    });
    const thead = "<thead><tr><th>#</th><th>サムネ</th><th>ユーザー</th><th>判定</th><th>視聴維持率</th><th>見始め</th><th>最後のコメント</th><th>コメント数</th></tr></thead>";
    const openRows = rowHtml.slice(0, VIEWER_RETENTION_OPEN_ROWS).join("");
    const restRows = rowHtml.slice(VIEWER_RETENTION_OPEN_ROWS);
    const restHtml = restRows.length ? `<details class="mkt-vr__rest"><summary>残り ${restRows.length}人を見る</summary><div class="mkt-vr__table-wrap"><table>${thead}<tbody>${restRows.join("")}</tbody></table></div></details>` : "";
    const more = est.users.length > shown.length ? `<p class="mkt-note">ほか ${est.users.length - shown.length}人は表を軽くするため省略しています（全体の数字には入っています）。</p>` : "";
    const maskNote = maskShare ? '<p class="mkt-note">共有向け: 表示名は伏せ字です。</p>' : "";
    return `${head}
<style>
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:.6rem;margin:.6rem 0}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__card{background:#111c31;border:1px solid #26364f;border-radius:10px;padding:.7rem .8rem}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__k{font-size:.8rem;color:#93a4be}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__v{font-size:1.6rem;font-weight:700;color:#e2e8f0}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__sub{font-size:.78rem;color:#93a4be}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__basis{margin:.6rem 0;font-size:.85rem;line-height:1.6}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__basis summary{cursor:pointer;color:#93c5fd}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__table-wrap{overflow-x:auto}
#${VIEWER_RETENTION_SECTION_ID} table{width:100%;border-collapse:collapse;font-size:.84rem}
#${VIEWER_RETENTION_SECTION_ID} th,#${VIEWER_RETENTION_SECTION_ID} td{padding:.35rem .45rem;border-bottom:1px solid #1f2a44;text-align:left;white-space:nowrap}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__av{width:24px;height:24px;border-radius:50%;object-fit:cover;display:inline-block;background:#1f2a44}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__tag{display:inline-block;font-size:.72rem;padding:.05rem .4rem;border-radius:999px;background:#1f2a44;color:#cbd5e1}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__tag--stay{background:#14532d;color:#bbf7d0}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__tag--left{background:#3f2a14;color:#fed7aa}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__bar{position:relative;min-width:120px}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__fill{position:absolute;left:0;top:25%;height:50%;background:#7c3aed55;border-radius:4px}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__bar span{position:relative}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__rest{margin:.5rem 0}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__rest>summary{cursor:pointer;color:#93c5fd;padding:.35rem 0}
</style>
<p class="mkt-note">コメントした人ひとりずつについて、配信の最後まで見ていたかを<strong>コメントの時刻から推定</strong>しました。</p>
<div class="mkt-vr__cards">${cards}</div>
${viewerRetentionBasisHtml(est)}
${maskNote}
<div class="mkt-vr__table-wrap"><table>
${thead}
<tbody>${openRows}</tbody>
</table></div>
${restHtml}
${more}
</section>`;
  }

  // src/lib/htmlReportEmbed.js
  var HTML_REPORT_EMBED_SCOPE = "#mkt-html-report";
  function stripCssComments(css) {
    return String(css || "").replace(/\/\*[\s\S]*?\*\//g, "");
  }
  function extractHtmlReportParts(reportHtml) {
    const html = String(reportHtml || "");
    const headMatch = html.match(/<head>([\s\S]*?)<\/head>/);
    const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/);
    if (!headMatch || !bodyMatch) return null;
    const css = [...headMatch[1].matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
    return { css, bodyHtml: bodyMatch[1] };
  }
  function sectionHtmlReportChapter(reportHtml) {
    const parts = extractHtmlReportParts(reportHtml);
    if (!parts) return "";
    const embedCss = `.wrap{max-width:none;padding:0}
@media (min-width:1100px){#sec-user-summary{grid-column:span 2}}`;
    const css = scopeCss(stripCssComments(`${parts.css}
${embedCss}`), HTML_REPORT_EMBED_SCOPE);
    return `<section class="mkt-section" id="mkt-html-report-section">
<h2>${escapeHtml("コメント記録（全文検索・CSV・ユーザー別）")}</h2>
<p class="mkt-note">以前の「HTML」ボタンで保存していた内容です。記録したコメントの全文を検索でき、CSV でも取り出せます。</p>
<div id="mkt-html-report"><style>${css}</style>${parts.bodyHtml}</div>
</section>`;
  }

  // src/lib/supporterRanking.js
  function num2(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  function isAnonymousUserId(userId) {
    const id = String(userId || "").trim();
    if (!id) return true;
    return /^(__anon_|anon:|a:)/i.test(id);
  }
  function buildSupporterRanking(topUsers, opts = {}) {
    const limit = Math.max(1, Math.min(50, Math.floor(num2(opts.limit) || 10)));
    const list = Array.isArray(topUsers) ? topUsers : [];
    const rows = [];
    for (const u of list) {
      const count = num2(u?.count);
      if (count <= 0) continue;
      const userId = String(u?.userId || "").trim();
      const anon = isAnonymousUserId(userId);
      const nickname = String(u?.nickname || "").trim();
      rows.push({
        rank: 0,
        // 後で採番
        userId,
        name: nickname || (anon ? "匿名" : userId || "名無し"),
        avatarUrl: String(u?.avatarUrl || "").trim(),
        count,
        isAnonymous: anon
      });
      if (rows.length >= limit) break;
    }
    rows.sort((a, b) => b.count - a.count);
    return rows.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 }));
  }

  // src/lib/crossSupporterRanking.js
  function buildCrossSupporterRanking(pastBroadcasts, currentLiveId, opts = {}) {
    const map = indexPastUsers(pastBroadcasts, currentLiveId);
    const topUsers = Array.from(map.values()).sort((a, b) => b.totalComments - a.totalComments).map((row) => ({
      userId: row.userId,
      nickname: row.nickname,
      avatarUrl: "",
      count: row.totalComments
    }));
    const rows = buildSupporterRanking(topUsers, opts);
    const broadcastCountByUserId = new Map(
      Array.from(map.values()).map((row) => [row.userId, row.broadcastIds.size])
    );
    return rows.map((row) => ({
      ...row,
      broadcastCount: row.userId ? broadcastCountByUserId.get(row.userId) || 0 : 0
    }));
  }

  // src/lib/keyboardTypeDiagnostic.js
  var EMOJI_REGEX = new RegExp("\\p{Extended_Pictographic}", "gu");
  function countEmojis(text) {
    if (!text) return 0;
    const m = String(text).match(EMOJI_REGEX);
    return m ? m.length : 0;
  }
  function classifyKeyboardType(stats) {
    const count = typeof stats?.count === "number" ? stats.count : 0;
    const totalChars = typeof stats?.totalChars === "number" ? stats.totalChars : 0;
    const emojiCount = typeof stats?.emojiCount === "number" ? stats.emojiCount : 0;
    if (count <= 1) return "quiet";
    if (totalChars > 0 && emojiCount / totalChars >= 0.3) return "emoji";
    const avg = totalChars / count;
    if (avg < 5) return "short";
    if (avg >= 25) return "long";
    return "balanced";
  }
  function diagnoseKeyboardTypes(comments, opts = {}) {
    const broadcasterUid = typeof opts?.broadcasterUserId === "string" ? opts.broadcasterUserId.trim() : "";
    const list = Array.isArray(comments) ? comments : [];
    const map = /* @__PURE__ */ new Map();
    for (const c of list) {
      if (!c || typeof c !== "object") continue;
      const uid = c.userId == null ? "" : String(c.userId).trim();
      if (!uid) continue;
      if (broadcasterUid && uid === broadcasterUid) continue;
      const text = c.text == null ? "" : String(c.text);
      const len = text.length;
      const emoji = countEmojis(text);
      let row = map.get(uid);
      if (!row) {
        row = { count: 0, totalChars: 0, emojiCount: 0 };
        map.set(uid, row);
      }
      row.count += 1;
      row.totalChars += len;
      row.emojiCount += emoji;
    }
    const userTypeMap = {};
    const counts = { emoji: 0, short: 0, long: 0, quiet: 0, balanced: 0 };
    for (const [uid, stats] of map) {
      const t = classifyKeyboardType(stats);
      userTypeMap[uid] = t;
      counts[t] += 1;
    }
    return { userTypeMap, counts };
  }

  // src/lib/broadcastCrossCompare.js
  function spanOfComments(comments) {
    let first = null;
    let last = null;
    for (const c of comments) {
      if (!c || typeof c !== "object") continue;
      const at = c.capturedAt;
      if (typeof at !== "number" || !Number.isFinite(at) || at <= 0) continue;
      if (first == null || at < first) first = at;
      if (last == null || at > last) last = at;
    }
    return { first, last };
  }
  function buildRecentBroadcastComparison(input) {
    const params = input && typeof input === "object" ? input : {};
    const broadcasts = Array.isArray(params.broadcasts) ? params.broadcasts : [];
    const limit = typeof params.limit === "number" && params.limit > 0 ? Math.floor(params.limit) : 5;
    const all = [];
    for (const b of broadcasts) {
      if (!b || typeof b !== "object") continue;
      const lid = String(b.liveId || "").trim();
      if (!lid) continue;
      const cs = Array.isArray(b.comments) ? b.comments : [];
      const { first, last } = spanOfComments(cs);
      const uniq = /* @__PURE__ */ new Set();
      for (const c of cs) {
        const uid = c?.userId == null ? "" : String(c.userId).trim();
        if (uid) uniq.add(uid);
      }
      all.push({
        liveId: lid,
        totalComments: cs.length,
        uniqueUsers: uniq.size,
        durationMin: first != null && last != null ? Math.round((last - first) / 6e4) : 0,
        firstCapturedAt: first
      });
    }
    all.sort((a, b) => {
      const av = a.firstCapturedAt == null ? -Infinity : a.firstCapturedAt;
      const bv = b.firstCapturedAt == null ? -Infinity : b.firstCapturedAt;
      return av - bv;
    });
    const bars = all.slice(Math.max(0, all.length - limit));
    return { bars };
  }
  function buildWeekdayHourHeatmap(input) {
    const params = input && typeof input === "object" ? input : {};
    const broadcasts = Array.isArray(params.broadcasts) ? params.broadcasts : [];
    const matrix = Array.from({ length: 7 }, () => new Array(24).fill(0));
    for (const b of broadcasts) {
      if (!b || typeof b !== "object") continue;
      const cs = Array.isArray(b.comments) ? b.comments : [];
      for (const c of cs) {
        const at = c?.capturedAt;
        if (typeof at !== "number" || !Number.isFinite(at) || at <= 0) continue;
        const d = new Date(at);
        const dow = d.getDay();
        const hour = d.getHours();
        if (dow >= 0 && dow < 7 && hour >= 0 && hour < 24) {
          matrix[dow][hour] += 1;
        }
      }
    }
    let maxValue = 0;
    for (const row of matrix) {
      for (const v of row) if (v > maxValue) maxValue = v;
    }
    return { matrix, maxValue };
  }
  function computeBroadcastGrowthScore(input) {
    const params = input && typeof input === "object" ? input : {};
    const past = Array.isArray(params.pastValues) ? params.pastValues.filter((v) => typeof v === "number" && Number.isFinite(v)) : [];
    const current = typeof params.currentValue === "number" && Number.isFinite(params.currentValue) ? params.currentValue : 0;
    if (!past.length) {
      return { average: null, stdDev: null, zScore: null, deltaPct: null };
    }
    const sum = past.reduce((a, b) => a + b, 0);
    const avg = sum / past.length;
    const variance = past.reduce((a, b) => a + (b - avg) ** 2, 0) / past.length;
    const stdDev = Math.sqrt(variance);
    const zScore = stdDev > 0 ? Math.round((current - avg) / stdDev * 100) / 100 : null;
    const deltaPct = avg > 0 ? Math.round((current - avg) / avg * 1e4) / 1e4 : 0;
    return {
      average: Math.round(avg * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
      zScore,
      deltaPct
    };
  }

  // src/lib/broadcastNarrativeBuilder.js
  var PHASE_LABELS = (
    /** @type {const} */
    {
      opening: "冒頭",
      middle: "中盤",
      ending: "終盤",
      whole: "全体"
    }
  );
  var REACTION_TOKENS = [
    "888",
    "8888",
    "草",
    "ｗ",
    "ww",
    "www",
    "笑",
    "わこつ",
    "初見",
    "ありがとう",
    "ありがと",
    "おめ",
    "おつ",
    "ナイス",
    "いいね",
    "楽しい",
    "最高",
    "かわいい",
    "可愛い",
    "すごい",
    "好き",
    "がんば",
    "えらい"
  ];
  var STOPWORDS = /* @__PURE__ */ new Set([
    "これ",
    "それ",
    "あれ",
    "ここ",
    "そこ",
    "これで",
    "そう",
    "ですね",
    "です",
    "ます",
    "した",
    "する",
    "いる",
    "ある",
    "ない",
    "この",
    "その",
    "ため",
    "さん",
    "ちゃん",
    "くん",
    "コメント",
    "ニコ生"
  ]);
  function toFiniteTimestamp(value) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
    if (typeof value === "string" && value.trim()) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  }
  function cleanText(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }
  function tokenizeComment(text) {
    const src = cleanText(text).replace(/https?:\/\/\S+/gi, " ");
    if (!src) return [];
    const out = [];
    const lower = src.toLowerCase();
    for (const token of REACTION_TOKENS) {
      if (lower.includes(token.toLowerCase())) out.push(token);
    }
    const chunks = src.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z0-9ー]{2,24}/gu) || [];
    for (const raw of chunks) {
      const token = raw.trim();
      if (!token || STOPWORDS.has(token)) continue;
      if (/^\d+$/.test(token)) continue;
      out.push(token);
    }
    return out;
  }
  function normalizeComments(comments, broadcasterUserId) {
    const broadcaster = String(broadcasterUserId || "").trim();
    return (Array.isArray(comments) ? comments : []).map((c) => ({
      at: toFiniteTimestamp(c?.capturedAt),
      text: cleanText(c?.text),
      userId: c?.userId == null ? "" : String(c.userId).trim()
    })).filter(
      (c) => c.at != null && c.text && !(broadcaster && c.userId && c.userId === broadcaster)
    ).sort((a, b) => (
      /** @type {number} */
      a.at - /** @type {number} */
      b.at
    ));
  }
  function topKeywords(rows, limit) {
    const counts = /* @__PURE__ */ new Map();
    for (const row of rows) {
      for (const token of tokenizeComment(row.text)) {
        counts.set(token, (counts.get(token) || 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja")).slice(0, limit).map(([token]) => token);
  }
  function pickSamples(rows, keywords, limit) {
    const scored = [];
    rows.forEach((row, index) => {
      const text = cleanText(row.text);
      if (text.length < 2) return;
      let score = Math.min(text.length, 80) / 80;
      for (const kw of keywords) {
        if (kw && text.includes(kw)) score += 1;
      }
      if (/https?:\/\//i.test(text)) score -= 1;
      scored.push({ text: text.length > 64 ? `${text.slice(0, 63)}…` : text, score, index });
    });
    scored.sort((a, b) => b.score - a.score || a.index - b.index);
    const out = [];
    for (const item of scored) {
      if (!out.includes(item.text)) out.push(item.text);
      if (out.length >= limit) break;
    }
    return out;
  }
  function pickPeakSegment(segments, total) {
    if (!segments.length || total <= 0) return null;
    return segments.reduce(
      (best, seg) => seg.commentCount > best.commentCount ? seg : best
    );
  }
  function buildImprovementHints(input) {
    const segments = input.segments;
    const total = Math.max(1, input.totalComments);
    const peak = input.peak;
    const hints = [];
    if (input.totalComments < 8) {
      hints.push("記録が少ない回なので、まずは冒頭と終盤の一言メモだけ残す");
      hints.push("次回は開始直後から拡張を開き、コメントの流れを長めに残す");
      return hints;
    }
    const opening = segments.find((s) => s.phase === "opening");
    const ending = segments.find((s) => s.phase === "ending");
    if (opening && opening.commentCount / total < 0.2) {
      hints.push("冒頭 5〜10 分に、答えやすい質問か今日の目的を短く置く");
    }
    if (ending && ending.commentCount / total < 0.2) {
      hints.push("終盤 5 分前に、次回予定と今日の見どころを一言で戻す");
    }
    if (peak?.phase === "opening") {
      hints.push("冒頭の掴みが効いた回なので、同じ導入パターンを次回も再利用する");
    } else if (peak?.phase === "middle") {
      hints.push("中盤の話題が山になった回なので、そのテーマを次回の柱にする");
    } else if (peak?.phase === "ending") {
      hints.push("終盤に伸びた回なので、締めの前に小さな山場を用意する");
    }
    const allKeywords = segments.flatMap((s) => s.keywords);
    if (allKeywords.some((kw) => /888|ｗ|ww|草|笑|楽しい|最高/.test(kw))) {
      hints.push("笑い・拍手系の語が出た時間を、切り抜きや告知候補として控える");
    }
    if (allKeywords.some((kw) => /初見|わこつ/.test(kw))) {
      hints.push("初見・来場あいさつが見えるので、冒頭の自己紹介を短く固定化する");
    }
    return hints.slice(0, 4);
  }
  function buildBroadcastNarrative(input = {}) {
    const report = input?.report || {};
    const rows = normalizeComments(input?.comments || [], input?.broadcasterUserId || "");
    const liveId = String(report.liveId || "").trim();
    const includeSamples = input?.includeSamples !== false;
    const maxKeywords = typeof input?.maxKeywordsPerSegment === "number" && input.maxKeywordsPerSegment > 0 ? Math.floor(input.maxKeywordsPerSegment) : 5;
    const maxSamples = typeof input?.maxSamplesPerSegment === "number" && input.maxSamplesPerSegment > 0 ? Math.floor(input.maxSamplesPerSegment) : 2;
    if (!rows.length) {
      return {
        liveId,
        totalComments: 0,
        durationMinutes: 0,
        lowData: true,
        peakSegmentLabel: "",
        summaryLine: "コメント本文の時系列がないため、配信内容の流れはまだ描写できません。",
        segments: [],
        improvementHints: ["次回はコメント記録が始まっている状態で配信を見届ける"]
      };
    }
    const first = (
      /** @type {number} */
      rows[0].at
    );
    const last = (
      /** @type {number} */
      rows[rows.length - 1].at
    );
    const durationMinutes = Math.max(1, Math.ceil((last - first) / 6e4));
    const boundaries = rows.length < 6 || durationMinutes < 3 ? [{ phase: (
      /** @type {BroadcastNarrativePhase} */
      "whole"
    ), start: 0, end: durationMinutes }] : [
      { phase: (
        /** @type {BroadcastNarrativePhase} */
        "opening"
      ), start: 0, end: Math.ceil(durationMinutes / 3) },
      { phase: (
        /** @type {BroadcastNarrativePhase} */
        "middle"
      ), start: Math.ceil(durationMinutes / 3), end: Math.ceil(durationMinutes * 2 / 3) },
      { phase: (
        /** @type {BroadcastNarrativePhase} */
        "ending"
      ), start: Math.ceil(durationMinutes * 2 / 3), end: durationMinutes }
    ];
    const segments = boundaries.map((b, index) => {
      const bucketRows = rows.filter((row) => {
        const minute = Math.floor(
          /** @type {number} */
          (row.at - first) / 6e4
        );
        const isLast = index === boundaries.length - 1;
        return minute >= b.start && (isLast ? minute <= b.end : minute < b.end);
      });
      const uids = new Set(bucketRows.map((row) => row.userId).filter(Boolean));
      const keywords = topKeywords(bucketRows, maxKeywords);
      return {
        phase: b.phase,
        label: PHASE_LABELS[b.phase],
        startMinute: b.start,
        endMinute: b.end,
        commentCount: bucketRows.length,
        uniqueUsers: uids.size,
        keywords,
        sampleComments: includeSamples ? pickSamples(bucketRows, keywords, maxSamples) : []
      };
    });
    const peak = pickPeakSegment(segments, rows.length);
    const peakSegmentLabel = peak?.label || "";
    const summaryLine = rows.length < 8 ? "コメント量が少なめなので、代表コメントと時間帯の傾向だけを控えめに見ます。" : `${peakSegmentLabel || "全体"}にコメントが最も集まり、${peak?.keywords.slice(0, 3).join("・") || "反応語"}が目立ちました。`;
    return {
      liveId,
      totalComments: rows.length,
      durationMinutes,
      lowData: rows.length < 8,
      peakSegmentLabel,
      summaryLine,
      segments,
      improvementHints: buildImprovementHints({
        segments,
        totalComments: rows.length,
        peak
      })
    };
  }

  // src/lib/openingFiveMinuteCorrelation.js
  var FIVE_MIN_MS = 5 * 6e4;
  function summarizeOpeningAndPeak(comments) {
    const ats = [];
    for (const c of comments) {
      if (!c || typeof c !== "object") continue;
      const at = c.capturedAt;
      if (typeof at !== "number" || !Number.isFinite(at) || at <= 0) continue;
      ats.push(at);
    }
    if (!ats.length) return { openingComments: 0, peakCpm: 0, firstAt: null };
    ats.sort((a, b) => a - b);
    const first = ats[0];
    let opening = 0;
    const minuteBuckets = /* @__PURE__ */ new Map();
    for (const at of ats) {
      if (at - first < FIVE_MIN_MS) opening += 1;
      const m = Math.floor((at - first) / 6e4);
      minuteBuckets.set(m, (minuteBuckets.get(m) || 0) + 1);
    }
    let peakCpm = 0;
    for (const v of minuteBuckets.values()) {
      if (v > peakCpm) peakCpm = v;
    }
    return { openingComments: opening, peakCpm, firstAt: first };
  }
  function buildOpeningFiveMinutePoints(broadcasts) {
    const list = Array.isArray(broadcasts) ? broadcasts : [];
    const points = [];
    for (const b of list) {
      if (!b || typeof b !== "object") continue;
      const lid = String(b.liveId || "").trim();
      if (!lid) continue;
      const cs = Array.isArray(b.comments) ? b.comments : [];
      const sum = summarizeOpeningAndPeak(cs);
      if (sum.firstAt == null) continue;
      points.push({
        liveId: lid,
        openingComments: sum.openingComments,
        openingCpm: Math.round(sum.openingComments / 5 * 100) / 100,
        peakCpm: sum.peakCpm
      });
    }
    let correlation = null;
    if (points.length >= 2) {
      const n = points.length;
      const xs = points.map((p) => p.openingCpm);
      const ys = points.map((p) => p.peakCpm);
      const xMean = xs.reduce((a, b) => a + b, 0) / n;
      const yMean = ys.reduce((a, b) => a + b, 0) / n;
      let num3 = 0;
      let dx2 = 0;
      let dy2 = 0;
      for (let i = 0; i < n; i++) {
        const dx = xs[i] - xMean;
        const dy = ys[i] - yMean;
        num3 += dx * dy;
        dx2 += dx * dx;
        dy2 += dy * dy;
      }
      const denom = Math.sqrt(dx2 * dy2);
      correlation = denom > 0 ? Math.round(num3 / denom * 1e3) / 1e3 : null;
    }
    return { points, correlation };
  }

  // src/lib/broadcastWaveformFingerprint.js
  function buildBroadcastWaveformFingerprint(comments, opts = {}) {
    const dim = typeof opts?.dimensions === "number" && opts.dimensions > 0 ? Math.floor(opts.dimensions) : 16;
    const list = Array.isArray(comments) ? comments : [];
    const ats = [];
    for (const c of list) {
      if (!c || typeof c !== "object") continue;
      const at = c.capturedAt;
      if (typeof at !== "number" || !Number.isFinite(at) || at <= 0) continue;
      ats.push(at);
    }
    if (!ats.length) return null;
    ats.sort((a, b) => a - b);
    const first = ats[0];
    const last = ats[ats.length - 1];
    const span = Math.max(1, last - first);
    const counts = new Array(dim).fill(0);
    for (const at of ats) {
      let idx = Math.floor((at - first) / span * dim);
      if (idx >= dim) idx = dim - 1;
      if (idx < 0) idx = 0;
      counts[idx] += 1;
    }
    const peak = counts.reduce((a, b) => Math.max(a, b), 0);
    const vector = counts.map((v) => peak > 0 ? Math.round(v / peak * 1e3) / 1e3 : 0);
    return { vector, totalCount: ats.length };
  }
  function cosineSimilarity(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return null;
    if (a.length !== b.length || a.length === 0) return null;
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
      const av = Number(a[i]) || 0;
      const bv = Number(b[i]) || 0;
      dot += av * bv;
      na += av * av;
      nb += bv * bv;
    }
    if (na === 0 || nb === 0) return null;
    return Math.round(dot / Math.sqrt(na * nb) * 1e3) / 1e3;
  }
  function findSimilarBroadcasts(current, pastFingerprints, opts = {}) {
    if (!current || !current.vector) return [];
    const past = Array.isArray(pastFingerprints) ? pastFingerprints : [];
    const topN = typeof opts?.topN === "number" && opts.topN > 0 ? Math.floor(opts.topN) : 5;
    const out = [];
    for (const p of past) {
      if (!p || typeof p !== "object") continue;
      if (p.liveId === current.liveId) continue;
      const sim = cosineSimilarity(current.vector, p.vector);
      if (sim == null) continue;
      out.push({
        liveId: String(p.liveId || ""),
        similarity: sim,
        totalCount: typeof p.totalCount === "number" ? p.totalCount : 0
      });
    }
    out.sort((a, b) => b.similarity - a.similarity);
    return out.slice(0, topN);
  }

  // src/lib/commentEchoDetector.js
  function normalizeForEcho(text) {
    let s = String(text == null ? "" : text);
    try {
      s = s.normalize("NFKC");
    } catch {
    }
    s = s.replace(
      /[ァ-ヶ]/g,
      (ch) => String.fromCharCode(ch.charCodeAt(0) - 96)
    );
    s = s.replace(/[Ｗｗ]/g, "w");
    s = s.toLowerCase();
    s = s.replace(/[!?！？。、,．\s]/g, "");
    s = s.trim();
    if (s.length === 0) return "";
    if (s.length === 1) {
      if (s.charCodeAt(0) < 128) return "";
    }
    return s;
  }
  function collectKeys(comments) {
    const list = Array.isArray(comments) ? comments : [];
    const out = [];
    for (const c of list) {
      if (!c || typeof c !== "object") continue;
      const at = c.capturedAt;
      if (typeof at !== "number" || !Number.isFinite(at) || at <= 0) continue;
      const uid = c.userId == null ? "" : String(c.userId).trim();
      if (!uid) continue;
      const key = normalizeForEcho(c.text);
      if (!key) continue;
      out.push({ at, uid, key });
    }
    out.sort((a, b) => a.at - b.at);
    return out;
  }
  function detectClusters(comments, cfg) {
    const items = collectKeys(comments);
    if (items.length === 0) return [];
    const open = /* @__PURE__ */ new Map();
    const bursts = [];
    for (const it of items) {
      const cur = open.get(it.key);
      if (cur && it.at - cur.firstAt <= cfg.windowMs) {
        cur.lastAt = it.at;
        cur.users.add(it.uid);
        cur.commentCount += 1;
      } else if (cur) {
        const tailContiguous = it.at - cur.lastAt <= cfg.windowMs;
        if (!tailContiguous) {
          if (cur.users.size >= cfg.minDistinctUsers) {
            bursts.push({
              text: it.key,
              firstAt: cur.firstAt,
              lastAt: cur.lastAt,
              userCount: cur.users.size,
              commentCount: cur.commentCount
            });
          }
          open.set(it.key, {
            firstAt: it.at,
            lastAt: it.at,
            users: /* @__PURE__ */ new Set([it.uid]),
            commentCount: 1
          });
        } else {
          const boostedUsers = new Set(cur.users);
          boostedUsers.add(it.uid);
          const boostedCount = cur.commentCount + 1;
          if (boostedUsers.size >= cfg.minDistinctUsers) {
            bursts.push({
              text: it.key,
              firstAt: cur.firstAt,
              lastAt: it.at,
              userCount: boostedUsers.size,
              commentCount: boostedCount
            });
            open.delete(it.key);
          } else {
            open.set(it.key, {
              firstAt: it.at,
              lastAt: it.at,
              users: /* @__PURE__ */ new Set([it.uid]),
              commentCount: 1
            });
          }
        }
      } else {
        open.set(it.key, {
          firstAt: it.at,
          lastAt: it.at,
          users: /* @__PURE__ */ new Set([it.uid]),
          commentCount: 1
        });
      }
    }
    for (const [key, cur] of open) {
      if (cur.users.size >= cfg.minDistinctUsers) {
        bursts.push({
          text: key,
          firstAt: cur.firstAt,
          lastAt: cur.lastAt,
          userCount: cur.users.size,
          commentCount: cur.commentCount
        });
      }
    }
    bursts.sort((a, b) => b.userCount - a.userCount || b.commentCount - a.commentCount);
    return bursts;
  }
  function detectCommentPropagation(comments, opts = {}) {
    const windowMs = typeof opts?.windowMs === "number" && opts.windowMs > 0 ? opts.windowMs : 3e4;
    const minDistinctUsers = typeof opts?.minDistinctUsers === "number" && opts.minDistinctUsers > 0 ? opts.minDistinctUsers : 3;
    return detectClusters(comments || [], { windowMs, minDistinctUsers });
  }
  function detectCommentSyncBursts(comments, opts = {}) {
    const windowMs = typeof opts?.windowMs === "number" && opts.windowMs > 0 ? opts.windowMs : 5e3;
    const minDistinctUsers = typeof opts?.minDistinctUsers === "number" && opts.minDistinctUsers > 0 ? opts.minDistinctUsers : 3;
    return detectClusters(comments || [], { windowMs, minDistinctUsers });
  }

  // src/lib/commenterCulturalAnalytics.js
  function collectValid(comments) {
    const list = Array.isArray(comments) ? comments : [];
    const out = [];
    for (const c of list) {
      if (!c || typeof c !== "object") continue;
      const at = c.capturedAt;
      if (typeof at !== "number" || !Number.isFinite(at) || at <= 0) continue;
      const uid = c.userId == null ? "" : String(c.userId).trim();
      const text = c.text == null ? "" : String(c.text);
      out.push({ at, uid, text });
    }
    out.sort((a, b) => a.at - b.at);
    return out;
  }
  function buildCommenterFirstSecondLatency(comments) {
    const valid = collectValid(comments || []);
    const userTimes = /* @__PURE__ */ new Map();
    for (const v of valid) {
      if (!v.uid) continue;
      let list = userTimes.get(v.uid);
      if (!list) {
        list = [];
        userTimes.set(v.uid, list);
      }
      list.push(v.at);
    }
    const distribution = {
      "<10s": 0,
      "10-30s": 0,
      "30-60s": 0,
      "1-2m": 0,
      "2-5m": 0,
      "5-10m": 0,
      "10m+": 0
    };
    let totalUsers = 0;
    for (const ats of userTimes.values()) {
      if (ats.length < 2) continue;
      totalUsers += 1;
      const dt = ats[1] - ats[0];
      if (dt < 1e4) distribution["<10s"] += 1;
      else if (dt < 3e4) distribution["10-30s"] += 1;
      else if (dt < 6e4) distribution["30-60s"] += 1;
      else if (dt < 12e4) distribution["1-2m"] += 1;
      else if (dt < 3e5) distribution["2-5m"] += 1;
      else if (dt < 6e5) distribution["5-10m"] += 1;
      else distribution["10m+"] += 1;
    }
    return { distribution, totalUsers };
  }
  function detectTalentPeakMoments(comments, opts = {}) {
    const silenceMin = typeof opts?.silenceMinMs === "number" && opts.silenceMinMs > 0 ? opts.silenceMinMs : 6e4;
    const after = typeof opts?.afterWindowMs === "number" && opts.afterWindowMs > 0 ? opts.afterWindowMs : 3e4;
    const minAfter = typeof opts?.minAfterCount === "number" && opts.minAfterCount > 0 ? opts.minAfterCount : 5;
    const valid = collectValid(comments || []);
    const out = [];
    for (let i = 1; i < valid.length; i++) {
      const gap = valid[i].at - valid[i - 1].at;
      if (gap < silenceMin) continue;
      const windowEnd = valid[i].at + after;
      let cnt = 0;
      for (let j = i; j < valid.length; j++) {
        if (valid[j].at > windowEnd) break;
        cnt += 1;
      }
      if (cnt >= minAfter) {
        out.push({
          silenceStartAt: valid[i - 1].at,
          silenceEndAt: valid[i].at,
          silenceMs: gap,
          afterCount: cnt
        });
      }
    }
    return out;
  }
  var SENTIMENT_LEXICON = {
    positive: [
      /楽し[いさみ]/,
      /嬉し[いさ]/,
      /うれし/,
      /ありがと/,
      /すご[いき]/,
      /神回/,
      /最高/,
      /好[きく]/,
      /素敵/,
      /可愛/,
      /かわい/,
      /やった/,
      /応援/,
      /ほっこり/,
      /幸[せ]/
    ],
    negative: [
      /つら[いさ]/,
      /辛[いさ]/,
      /悲し/,
      /やばい/,
      /ひどい/,
      /酷い/,
      /疲れ/,
      /嫌[いだ]/,
      /きら[いだ]/,
      /怖[いさ]/,
      /こわい/,
      /無理/,
      /もう無理/,
      /お先真っ暗/
    ],
    surprise: [
      /マジ/,
      /まじ/,
      /えっ/,
      /うそ/,
      /ウソ/,
      /ホント/,
      /まさか/,
      /びっくり/,
      /びっくし/,
      /おお[ぉー]/
    ],
    confusion: [
      /うーん/,
      /ううむ/,
      /わからん/,
      /分から[なな]/,
      /謎/,
      /なんで/,
      /どうゆう/,
      /どういう/,
      /混乱/
    ]
  };
  function scoreSentimentTimeline(comments, opts = {}) {
    const bucketMs = typeof opts?.bucketMs === "number" && opts.bucketMs > 0 ? opts.bucketMs : 6e4;
    const valid = collectValid(comments || []);
    const totals = { positive: 0, negative: 0, surprise: 0, confusion: 0 };
    if (!valid.length) return { buckets: [], totals };
    const first = valid[0].at;
    const last = valid[valid.length - 1].at;
    const total = Math.max(1, Math.floor((last - first) / bucketMs) + 1);
    const buckets = Array.from({ length: total }, (_, m) => ({
      minute: m,
      atStart: first + m * bucketMs,
      total: 0,
      positive: 0,
      negative: 0,
      surprise: 0,
      confusion: 0
    }));
    for (const v of valid) {
      const idx = Math.floor((v.at - first) / bucketMs);
      if (idx < 0 || idx >= buckets.length) continue;
      const bucket = buckets[idx];
      bucket.total += 1;
      for (const [k, regs] of Object.entries(SENTIMENT_LEXICON)) {
        for (const r of regs) {
          if (r.test(v.text)) {
            bucket[
              /** @type {'positive'|'negative'|'surprise'|'confusion'} */
              k
            ] += 1;
            totals[
              /** @type {'positive'|'negative'|'surprise'|'confusion'} */
              k
            ] += 1;
            break;
          }
        }
      }
    }
    return { buckets, totals };
  }
  var STOP_WORDS = /* @__PURE__ */ new Set([
    "です",
    "ます",
    "する",
    "いる",
    "ある",
    "なる",
    "こと",
    "もの",
    "よう",
    "って",
    "けど",
    "けれど",
    "でも",
    "これ",
    "それ",
    "あれ",
    "どれ",
    "てる",
    "たい",
    "ない",
    "ます",
    "まし",
    "みたい"
  ]);
  function tokenizeSimple(text) {
    const s = String(text || "").replace(/[\s!?！？。、,．]+/g, " ").trim();
    if (!s) return [];
    const tokens = [];
    const re = /([ぁ-んー]+|[ァ-ヴー]+|[一-龥]+|[a-zA-Z0-9ｗＷ]+)/gu;
    let m;
    while ((m = re.exec(s)) !== null) {
      const t = m[1];
      if (t.length < 2) continue;
      if (STOP_WORDS.has(t)) continue;
      tokens.push(t.toLowerCase());
    }
    return tokens;
  }
  function suggestUniqueWords(input) {
    if (!input || typeof input !== "object") return [];
    const allList = Array.isArray(input.allComments) ? input.allComments : [];
    const selfList = Array.isArray(input.selfComments) ? input.selfComments : [];
    const topN = typeof input.topN === "number" && input.topN > 0 ? Math.floor(input.topN) : 10;
    const minOccurrence = typeof input.minOccurrence === "number" && input.minOccurrence > 0 ? input.minOccurrence : 3;
    const selfTokens = /* @__PURE__ */ new Set();
    for (const c of selfList) {
      for (const t of tokenizeSimple(c?.text)) selfTokens.add(t);
    }
    const allCount = /* @__PURE__ */ new Map();
    for (const c of allList) {
      const local = new Set(tokenizeSimple(c?.text));
      for (const t of local) {
        allCount.set(t, (allCount.get(t) || 0) + 1);
      }
    }
    const out = [];
    for (const [t, n] of allCount) {
      if (n < minOccurrence) continue;
      if (selfTokens.has(t)) continue;
      out.push({ word: t, count: n });
    }
    out.sort((a, b) => b.count - a.count);
    return out.slice(0, topN);
  }
  function computeReachCoefficient(input) {
    if (!input || typeof input !== "object") return { coefficient: null };
    const c = typeof input.currentConcurrent === "number" && Number.isFinite(input.currentConcurrent) ? input.currentConcurrent : NaN;
    const u = typeof input.uniqueCommentersInWindow === "number" && Number.isFinite(input.uniqueCommentersInWindow) ? input.uniqueCommentersInWindow : NaN;
    if (!Number.isFinite(c) || c < 0 || !Number.isFinite(u) || u <= 0) {
      return { coefficient: null };
    }
    return { coefficient: Math.round(c / u * 100) / 100 };
  }

  // src/lib/giftMomentumAnalytics.js
  var THREE_MIN_MS = 3 * 60 * 1e3;
  var FIVE_MIN_MS2 = 5 * 60 * 1e3;
  function clean(v) {
    return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  }
  function nonNegativeNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  function positiveTimestamp(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  function positiveIntOrNull(v) {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  function normalizeThrowCount(v) {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) && n >= 1 ? n : 1;
  }
  function identifySender(raw) {
    if (!raw || typeof raw !== "object") return null;
    const r = (
      /** @type {Record<string, unknown>} */
      raw
    );
    const userId = clean(r.userId ?? r.userKey);
    const label = clean(r.nickname) || clean(r.senderName) || clean(r.advertiserName) || clean(r.name) || (userId ? `u/${userId}` : "");
    const isAnonymous = Boolean(r.isAnonymous) || /^(__anon_|anon:|a:)/i.test(userId) || label === "名無し" || label === "匿名";
    if (!userId && !label) return null;
    const key = userId && !/^__anon_/i.test(userId) ? `uid:${userId}` : `name:${label || "名無し"}`;
    return {
      key,
      userId,
      label: label || "名無し",
      isAnonymous
    };
  }
  function emptyAgg(id) {
    return {
      key: id.key,
      userId: id.userId,
      label: id.label,
      isAnonymous: id.isAnonymous,
      eventPoints: 0,
      eventThrows: 0,
      userPoints: 0,
      userThrows: 0,
      historyPoints: 0,
      historyThrows: 0,
      officialHistoryPoints: 0,
      officialHistoryThrows: 0,
      officialContribution: 0,
      adContribution: 0,
      rank: null,
      firstAt: 0,
      lastAt: 0,
      sources: /* @__PURE__ */ new Set()
    };
  }
  function getAgg(map, id) {
    let cur = map.get(id.key);
    if (!cur) {
      cur = emptyAgg(id);
      map.set(id.key, cur);
    }
    if (!cur.userId && id.userId) cur.userId = id.userId;
    if ((!cur.label || cur.label === "名無し") && id.label) cur.label = id.label;
    cur.isAnonymous = cur.isAnonymous || id.isAnonymous;
    return cur;
  }
  function touchTime(agg, at) {
    if (!at) return;
    if (!agg.firstAt || at < agg.firstAt) agg.firstAt = at;
    if (!agg.lastAt || at > agg.lastAt) agg.lastAt = at;
  }
  function buildCommentCountLookup(comments, broadcasterUserId) {
    const counts = /* @__PURE__ */ new Map();
    const excluded = clean(broadcasterUserId);
    for (const c of Array.isArray(comments) ? comments : []) {
      const uid = clean(c?.userId);
      if (excluded && uid === excluded) continue;
      const nick = clean(c?.nickname);
      if (uid) counts.set(`uid:${uid}`, (counts.get(`uid:${uid}`) || 0) + 1);
      if (nick) counts.set(`name:${nick}`, (counts.get(`name:${nick}`) || 0) + 1);
    }
    return counts;
  }
  function resolveStreamStart(comments, fallback) {
    let min = positiveTimestamp(fallback);
    for (const c of Array.isArray(comments) ? comments : []) {
      const at = positiveTimestamp(c?.capturedAt);
      if (at && (!min || at < min)) min = at;
    }
    return min || 0;
  }
  function formatCompactNumber(n) {
    return Math.round(n).toLocaleString("ja-JP");
  }
  function formatMinuteLabel(minute) {
    if (!Number.isFinite(minute) || minute < 0) return "開始時刻不明";
    const h = Math.floor(minute / 60);
    const m = Math.floor(minute % 60);
    return h > 0 ? `開始から約${h}時間${m}分` : `開始から約${m}分`;
  }
  function roughTokens(text) {
    const normalized = clean(text).replace(/https?:\/\/\S+/g, " ").replace(/[!?！？。、,．「」『』（）()[\]{}<>【】]/g, " ");
    if (!normalized) return [];
    const stop = /* @__PURE__ */ new Set(["です", "ます", "する", "いる", "ある", "これ", "それ", "今日"]);
    return normalized.split(/\s+/).map((w) => w.trim()).filter((w) => w.length >= 2 && w.length <= 24 && !stop.has(w)).slice(0, 40);
  }
  function topWords(counts, limit) {
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja")).slice(0, limit).map(([w]) => w);
  }
  function classifyFlow(before, after) {
    if (before === 0 && after === 0) return "静かな時間のギフト";
    if (after >= before + 3 || after >= before * 1.4) return "ギフト後に反応が伸びた";
    if (before >= after + 3 || before >= after * 1.4) return "盛り上がり直後にギフト";
    return "前後とも反応あり";
  }
  function classifySenderType(p) {
    if (p.rank != null && p.rank <= 3) return "ランキング上位の応援者";
    if (p.throwCount >= 4 && p.avgPoint <= 500) return "こまめに投げる人";
    if (p.totalPoints >= Math.max(1e3, p.maxPoints * 0.45) || p.avgPoint >= 1e3) {
      return "大きめギフト型";
    }
    if (p.commentCount >= 5) return "会話もギフトも厚い人";
    if (p.commentCount <= 1) return p.isAnonymous ? "匿名で静かに支える人" : "静かに支える人";
    return "反応に合わせて支える人";
  }
  function senderEvidence(row) {
    const bits = [];
    if (row.totalPoints > 0) bits.push(`${formatCompactNumber(row.totalPoints)}pt`);
    if (row.throwCount > 0) bits.push(`${row.throwCount}投げ`);
    bits.push(`コメント${row.commentCount}件`);
    if (row.rank != null) bits.push(`貢献度${row.rank}位`);
    return bits.join(" / ");
  }
  function analyzeGiftMomentum(input, options = {}) {
    const comments = Array.isArray(input?.comments) ? input.comments : [];
    const giftUsers = Array.isArray(input?.giftUsers) ? input.giftUsers : [];
    const giftEvents = Array.isArray(input?.giftEvents) ? input.giftEvents : [];
    const giftHistoryThrows = Array.isArray(input?.giftHistoryThrows) ? input.giftHistoryThrows : [];
    const officialGiftHistory = Array.isArray(input?.officialGiftHistory) ? input.officialGiftHistory : [];
    const giftContributionRanking = Array.isArray(input?.giftContributionRanking) ? input.giftContributionRanking : [];
    const adContributionRanking = Array.isArray(input?.adContributionRanking) ? input.adContributionRanking : [];
    const maxSenders = Math.max(1, Math.min(20, Math.trunc(Number(options.maxSenders) || 10)));
    const maxTimingWindows = Math.max(
      1,
      Math.min(12, Math.trunc(Number(options.maxTimingWindows) || 6))
    );
    const senderMap = /* @__PURE__ */ new Map();
    const timingEvents = [];
    const approxEvents = [];
    for (const raw of giftEvents) {
      const id = identifySender(raw);
      if (!id) continue;
      const agg = getAgg(senderMap, id);
      const point = nonNegativeNumber(raw?.point);
      const at = positiveTimestamp(raw?.capturedAt);
      agg.eventPoints += point;
      agg.eventThrows += 1;
      const rank = positiveIntOrNull(raw?.contributionRank);
      if (rank != null) agg.rank = agg.rank == null ? rank : Math.min(agg.rank, rank);
      touchTime(agg, at);
      agg.sources.add("gift-events");
      if (at) {
        timingEvents.push({
          key: id.key,
          label: id.label,
          at,
          point,
          itemName: clean(raw?.itemName),
          source: "exact"
        });
      }
    }
    for (const raw of giftUsers) {
      const id = identifySender(raw);
      if (!id) continue;
      const agg = getAgg(senderMap, id);
      const point = nonNegativeNumber(raw?.totalPoints);
      const throws = normalizeThrowCount(raw?.throwCount);
      const at = positiveTimestamp(raw?.capturedAt);
      agg.userPoints = Math.max(agg.userPoints, point);
      agg.userThrows = Math.max(agg.userThrows, throws);
      touchTime(agg, at);
      agg.sources.add("gift-users");
      if (at) {
        approxEvents.push({
          key: id.key,
          label: id.label,
          at,
          point,
          itemName: "",
          source: "approx"
        });
      }
    }
    for (const raw of giftHistoryThrows) {
      const id = identifySender(raw);
      if (!id) continue;
      const agg = getAgg(senderMap, id);
      const point = nonNegativeNumber(raw?.totalPoints);
      const throws = normalizeThrowCount(raw?.throwCount);
      const at = positiveTimestamp(raw?.capturedAt);
      agg.historyPoints = Math.max(agg.historyPoints, point);
      agg.historyThrows = Math.max(agg.historyThrows, throws);
      touchTime(agg, at);
      agg.sources.add("gift-history");
    }
    for (const raw of officialGiftHistory) {
      const id = identifySender({
        advertiserName: raw?.advertiserName,
        isAnonymous: raw?.isAnonymous
      });
      if (!id) continue;
      const agg = getAgg(senderMap, id);
      agg.officialHistoryPoints += nonNegativeNumber(raw?.point);
      agg.officialHistoryThrows += 1;
      agg.sources.add("official-history");
    }
    for (const raw of giftContributionRanking) {
      const id = identifySender(raw);
      if (!id) continue;
      const agg = getAgg(senderMap, id);
      const contribution = Math.max(nonNegativeNumber(raw?.contribution), nonNegativeNumber(raw?.score));
      agg.officialContribution = Math.max(agg.officialContribution, contribution);
      const rank = positiveIntOrNull(raw?.rank);
      if (rank != null) agg.rank = agg.rank == null ? rank : Math.min(agg.rank, rank);
      agg.sources.add("gift-ranking");
    }
    for (const raw of adContributionRanking) {
      const id = identifySender(raw);
      if (!id) continue;
      const agg = getAgg(senderMap, id);
      const contribution = Math.max(nonNegativeNumber(raw?.contribution), nonNegativeNumber(raw?.score));
      agg.adContribution = Math.max(agg.adContribution, contribution);
      agg.sources.add("ad-ranking");
    }
    const commentCounts = buildCommentCountLookup(comments, options.broadcasterUserId || "");
    const rawRows = [...senderMap.values()].map((agg) => {
      const totalPoints = Math.max(
        agg.historyPoints,
        agg.officialHistoryPoints,
        agg.eventPoints,
        agg.userPoints,
        agg.officialContribution
      );
      const throwCount = Math.max(
        agg.historyThrows,
        agg.officialHistoryThrows,
        agg.eventThrows,
        agg.userThrows
      );
      const byUid = agg.userId ? commentCounts.get(`uid:${agg.userId}`) || 0 : 0;
      const byName = agg.label ? commentCounts.get(`name:${agg.label}`) || 0 : 0;
      const commentCount = Math.max(byUid, byName);
      return {
        agg,
        totalPoints,
        throwCount,
        commentCount,
        avgPoint: throwCount > 0 ? Math.round(totalPoints / throwCount) : totalPoints
      };
    });
    const maxPoints = rawRows.reduce((mx, r) => Math.max(mx, r.totalPoints), 0);
    const totalPointsAll = rawRows.reduce((sum, r) => sum + r.totalPoints, 0);
    const totalThrows = rawRows.reduce((sum, r) => sum + r.throwCount, 0);
    const knownPointRows = rawRows.filter((r) => r.totalPoints > 0).length;
    const visibleRawRows = rawRows.filter(
      (r) => r.totalPoints > 0 || r.throwCount > 0 || r.agg.rank != null
    );
    const senderRows = visibleRawRows.map((r) => {
      const typeLabel = classifySenderType({
        commentCount: r.commentCount,
        throwCount: r.throwCount,
        avgPoint: r.avgPoint,
        rank: r.agg.rank,
        isAnonymous: r.agg.isAnonymous,
        totalPoints: r.totalPoints,
        maxPoints
      });
      const row = {
        senderKey: r.agg.key,
        userId: r.agg.userId,
        label: r.agg.label || "名無し",
        totalPoints: Math.round(r.totalPoints),
        throwCount: r.throwCount,
        avgPoint: Math.round(r.avgPoint),
        sharePct: totalPointsAll > 0 ? Math.round(r.totalPoints / totalPointsAll * 1e3) / 10 : 0,
        commentCount: r.commentCount,
        typeLabel,
        evidence: "",
        rank: r.agg.rank,
        firstAt: r.agg.firstAt,
        lastAt: r.agg.lastAt,
        sources: [...r.agg.sources].sort()
      };
      row.evidence = senderEvidence(row);
      return row;
    }).sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.throwCount !== a.throwCount) return b.throwCount - a.throwCount;
      return a.label.localeCompare(b.label, "ja");
    }).slice(0, maxSenders);
    const exactKeys = new Set(timingEvents.map((e) => e.key));
    const timingSource = [
      ...timingEvents,
      ...approxEvents.filter((e) => !exactKeys.has(e.key))
    ].sort((a, b) => a.at - b.at);
    const streamStart = resolveStreamStart(
      comments,
      timingSource.length ? timingSource[0].at : 0
    );
    const timingWindows = buildTimingWindows({
      comments,
      timingEvents: timingSource,
      streamStart,
      maxTimingWindows
    });
    const officialGiftPoints = nonNegativeNumber(input?.programStats?.giftPoints);
    const topShare = senderRows[0]?.sharePct || 0;
    const insightLines = buildInsightLines({
      senderRows,
      timingWindows,
      officialGiftPoints,
      totalPointsAll,
      totalThrows
    });
    const dataNotes = [];
    if (giftEvents.length) {
      dataNotes.push("ギフト時刻はライブ受信イベントの capturedAt を優先しています。");
    }
    if (approxEvents.length) {
      dataNotes.push("giftUsers の時刻は初回検知・更新時刻に近い場合があります。");
    }
    if (officialGiftHistory.length || giftHistoryThrows.length) {
      dataNotes.push("公式履歴・保存履歴は送り主別 pt の補完に使い、時刻分析には原則使いません。");
    }
    if (giftContributionRanking.length) {
      dataNotes.push("貢献度ランキング由来の pt は、個別ギフト履歴が無い送り主の代表値として使います。");
    }
    if (adContributionRanking.length) {
      dataNotes.push("ニコ広告ランキングはギフトとは別枠の応援シグナルとして参照しています。");
    }
    const hasSignals = senderRows.length > 0 || timingWindows.length > 0 || officialGiftPoints > 0 || giftUsers.length > 0 || giftEvents.length > 0;
    return {
      hasSignals,
      totals: {
        senderCount: visibleRawRows.length,
        throwCount: totalThrows,
        totalPoints: Math.round(totalPointsAll),
        knownPointRows,
        exactEventCount: timingEvents.length,
        approxEventCount: approxEvents.length,
        officialGiftPoints: Math.round(officialGiftPoints),
        topSenderSharePct: topShare
      },
      senderRows,
      timingWindows,
      insightLines,
      dataNotes
    };
  }
  function buildTimingWindows(opts) {
    if (!opts.timingEvents.length || !opts.streamStart) return [];
    const groups = /* @__PURE__ */ new Map();
    for (const ev of opts.timingEvents) {
      const bucket = Math.floor((ev.at - opts.streamStart) / FIVE_MIN_MS2);
      const key = Math.max(0, bucket);
      const list = groups.get(key) || [];
      list.push(ev);
      groups.set(key, list);
    }
    const windows = [];
    for (const events of groups.values()) {
      const sorted = events.slice().sort((a, b) => a.at - b.at);
      const firstAt = sorted[0].at;
      const lastAt = sorted[sorted.length - 1].at;
      let before = 0;
      let after = 0;
      const wordCounts = /* @__PURE__ */ new Map();
      for (const c of opts.comments) {
        const at = positiveTimestamp(c?.capturedAt);
        if (!at) continue;
        if (at >= firstAt - THREE_MIN_MS && at < firstAt) before += 1;
        if (at > lastAt && at <= lastAt + THREE_MIN_MS) after += 1;
        if (at >= firstAt - THREE_MIN_MS && at <= lastAt + THREE_MIN_MS) {
          for (const w of roughTokens(String(c?.text || ""))) {
            wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
          }
        }
      }
      const totalPoints = sorted.reduce((sum, ev) => sum + nonNegativeNumber(ev.point), 0);
      const minute = Math.max(0, Math.round((firstAt - opts.streamStart) / 6e4));
      const senders = new Set(sorted.map((ev) => ev.key));
      const sample = sorted.map((ev) => [ev.label, ev.itemName].filter(Boolean).join(" / ")).filter(Boolean)[0] || "ギフト";
      windows.push({
        label: formatMinuteLabel(minute),
        minute,
        giftCount: sorted.length,
        totalPoints: Math.round(totalPoints),
        senderCount: senders.size,
        beforeCommentCount: before,
        afterCommentCount: after,
        delta: after - before,
        flowLabel: classifyFlow(before, after),
        topWords: topWords(wordCounts, 5),
        sampleGiftLabel: sample,
        source: sorted.some((ev) => ev.source === "exact") ? "exact" : "approx"
      });
    }
    return windows.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.giftCount !== a.giftCount) return b.giftCount - a.giftCount;
      return a.minute - b.minute;
    }).slice(0, opts.maxTimingWindows);
  }
  function buildInsightLines(p) {
    const lines = [];
    if (p.officialGiftPoints > 0) {
      lines.push(`公式ギフト累計は ${formatCompactNumber(p.officialGiftPoints)} pt です。`);
    }
    const top = p.senderRows[0];
    if (top && top.sharePct >= 60) {
      lines.push(`ギフトは ${top.label} さんに寄った集中型です（代表値の ${top.sharePct}%）。`);
    } else if (p.senderRows.length >= 3) {
      const top3 = p.senderRows.slice(0, 3).reduce((sum, row) => sum + row.sharePct, 0);
      if (top3 >= 75) {
        lines.push(`上位3名で約 ${Math.round(top3)}% を占める、コア応援者が強い回です。`);
      } else {
        lines.push("ギフトは複数の送り主に分散していて、広めに支えられた回です。");
      }
    }
    const quiet = p.senderRows.filter((r) => r.commentCount <= 1).length;
    const chatty = p.senderRows.filter((r) => r.commentCount >= 5).length;
    if (quiet >= Math.max(1, Math.ceil(p.senderRows.length / 2))) {
      lines.push("コメントは少なめでもギフトで支える人が目立ちます。名前を呼ぶお礼が効きやすい型です。");
    } else if (chatty > 0) {
      lines.push("会話にも入る応援者がギフトも支えているため、普段のコメント拾いが支援につながっています。");
    }
    const bestWindow = p.timingWindows[0];
    if (bestWindow) {
      lines.push(
        `${bestWindow.label} がギフトの山です（${bestWindow.giftCount}件 / ${formatCompactNumber(bestWindow.totalPoints)}pt、${bestWindow.flowLabel}）。`
      );
    } else if (p.totalThrows > 0 || p.totalPointsAll > 0) {
      lines.push("送り主別の傾向は読めますが、正確なギフト時刻は不足しています。");
    }
    return lines.slice(0, 5);
  }

  // src/lib/giftMomentAnalytics.js
  var GIFT_MOMENT_FORBIDDEN_WORDS = Object.freeze(["が原因", "すれば増える", "必ず", "確実", "間違いなく"]);
  var WINDOW_MS = 5 * 6e4;
  var CHAIN_GAP_MS = 6e4;
  var MIN_MOMENTS_FOR_TREND = 5;
  var VIEWER_NEAR_MS = 9e4;
  var AXIS_SLACK_MS = 10 * 6e4;
  var ja = (n) => Math.floor(n).toLocaleString("en-US");
  function median(xs) {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }
  function countIn(sorted, lo, hi) {
    const lower = (x) => {
      let a = 0;
      let b = sorted.length;
      while (a < b) {
        const m = a + b >> 1;
        if (sorted[m] < x) a = m + 1;
        else b = m;
      }
      return a;
    };
    return lower(hi) - lower(lo);
  }
  function nearestViewer(points, target) {
    let best = null;
    let bestD = Infinity;
    for (const p of points) {
      const d = Math.abs(p.at - target);
      if (d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best && bestD <= VIEWER_NEAR_MS ? best : null;
  }
  function topWords2(texts) {
    const counts = /* @__PURE__ */ new Map();
    let seg = null;
    try {
      seg = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function" ? new Intl.Segmenter("ja", { granularity: "word" }) : null;
    } catch {
      seg = null;
    }
    if (!seg) return [];
    for (const t of texts) {
      for (const part of seg.segment(String(t || ""))) {
        if (!part.isWordLike) continue;
        const w = part.segment.trim();
        if (w.length < 2) continue;
        if (/^[0-9a-z_-]+$/i.test(w) && w.length < 4) continue;
        if (/^(.)\1+$/.test(w)) continue;
        counts.set(w, (counts.get(w) || 0) + 1);
      }
    }
    return [...counts.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([w]) => w);
  }
  function analyzeGiftMoments(input) {
    const historyIn = Array.isArray(input?.history) ? input.history : [];
    const gifts = [];
    let noTime = 0;
    const seen = /* @__PURE__ */ new Set();
    let totalPointsAll = 0;
    for (const raw of historyIn) {
      if (!raw || typeof raw !== "object") continue;
      const h = (
        /** @type {Record<string, any>} */
        raw
      );
      const points = Math.floor(Number(h.points));
      if (!Number.isFinite(points) || points <= 0) continue;
      const key = String(h.kokenHistoryId || "").trim() || `${h.itemName}|${h.publishedAt}|${points}|${h.userId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      totalPointsAll += points;
      const pub = Number(h.publishedAt);
      if (!Number.isFinite(pub) || pub <= 0) {
        noTime += 1;
        continue;
      }
      gifts.push({
        at: Math.floor(pub) * 1e3,
        userId: String(h.userId == null ? "" : h.userId).trim(),
        senderName: String(h.senderName == null ? "" : h.senderName).trim(),
        itemName: String(h.itemName == null ? "" : h.itemName).trim(),
        points,
        contribution: Math.max(0, Math.floor(Number(h.contribution)) || 0),
        avatarUrl: /^https?:\/\//i.test(String(h.senderAvatarUrl || "")) ? String(h.senderAvatarUrl) : ""
      });
    }
    gifts.sort((a, b) => a.at - b.at);
    const emptySummary = { n: 0, k: null, medianDelta: null, viewersMedian: null, viewersN: 0, chainCount: 0, quietCount: 0 };
    const notes = [];
    const result = {
      hasHistory: gifts.length > 0 || noTime > 0,
      axisOk: false,
      /** @type {GiftMoment[]} */
      moments: [],
      summary: emptySummary,
      notes,
      excluded: { noTime, outOfRange: 0 },
      totals: { giftCount: gifts.length, points: totalPointsAll }
    };
    if (!result.hasHistory) return result;
    const remaining = Math.max(0, Math.floor(Number(input?.officialRemaining) || 0));
    const offTotal = input?.officialTotalPoint == null || String(input.officialTotalPoint) === "" ? NaN : Number(input.officialTotalPoint);
    if (remaining > 0) {
      notes.push(`公式が返す履歴は新しい順に100件までです。古い方の残り ${remaining}件は載っていません(公式の値)。`);
    } else if (Number.isFinite(offTotal) && offTotal >= 0) {
      notes.push(
        totalPointsAll === Math.floor(offTotal) ? `公式の合計 ${ja(offTotal)}pt と一致(全件を取得できています)。` : `公式の合計 ${ja(offTotal)}pt と、明細の合計 ${ja(totalPointsAll)}pt が一致しません。`
      );
    }
    const cts = (Array.isArray(input?.comments) ? input.comments : []).map((c) => toEpochMs(c?.capturedAt)).filter((t) => t > 0).sort((a, b) => a - b);
    if (cts.length === 0) {
      notes.push("コメントの記録が無いため、ギフトの前後の比較は出せません。");
      return result;
    }
    const cMin = cts[0];
    const cMax = cts[cts.length - 1];
    if (!gifts.length) return result;
    const inRange = gifts.filter((g) => g.at >= cMin - AXIS_SLACK_MS && g.at <= cMax + AXIS_SLACK_MS);
    if (inRange.length === 0) {
      notes.push("ギフトの公式時刻と、このPCがコメントを受け取った時刻が重なりません(タイムシフト視聴や時計のずれの可能性)。瞬間ごとの前後比較は出せません。");
      return result;
    }
    const outOfRange = gifts.length - inRange.length;
    if (outOfRange > 0) {
      notes.push(`コメントの記録を始める前(または終えた後)のギフト ${outOfRange}件は、前後の比較から外しています。`);
      result.excluded.outOfRange = outOfRange;
    }
    gifts.length = 0;
    gifts.push(...inRange);
    result.axisOk = true;
    const groups = [];
    for (const g of gifts) {
      const last = groups[groups.length - 1];
      if (last && g.at - last[last.length - 1].at <= CHAIN_GAP_MS) last.push(g);
      else groups.push([g]);
    }
    const commentsAll = Array.isArray(input?.comments) ? input.comments : [];
    const viewerPoints = Array.isArray(input?.concurrentPoints) ? input.concurrentPoints : [];
    const moments = groups.map((grp) => {
      const startAt = grp[0].at;
      const endAt = grp[grp.length - 1].at;
      const fullWindow = startAt - WINDOW_MS >= cMin && endAt + WINDOW_MS <= cMax;
      const before = countIn(cts, startAt - WINDOW_MS, startAt);
      const after = countIn(cts, endAt + 1, endAt + WINDOW_MS + 1);
      const vb = nearestViewer(viewerPoints, startAt - WINDOW_MS);
      const va = nearestViewer(viewerPoints, endAt + WINDOW_MS);
      const viewers = vb && va ? { before: vb.value, after: va.value, diff: va.value - vb.value, kind: vb.kind === va.kind ? vb.kind : "mixed" } : null;
      const texts = commentsAll.filter((c) => {
        const t = toEpochMs(c?.capturedAt);
        return t > 0 && t >= startAt - WINDOW_MS && t <= endAt + WINDOW_MS;
      }).map((c) => c?.text);
      return {
        startAt,
        endAt,
        gifts: grp,
        chain: grp.length >= 2,
        points: grp.reduce((s, g) => s + g.points, 0),
        contribution: grp.reduce((s, g) => s + g.contribution, 0),
        fullWindow,
        before: { comments: before },
        after: { comments: after },
        viewers,
        topics: topWords2(texts)
      };
    });
    result.moments = moments;
    const full = moments.filter((m) => m.fullWindow);
    const n = full.length;
    const trend = n >= MIN_MOMENTS_FOR_TREND;
    const vdiffs = full.filter((m) => m.viewers).map((m) => (
      /** @type {NonNullable<GiftMoment['viewers']>} */
      m.viewers.diff
    ));
    result.summary = {
      n,
      k: trend ? full.filter((m) => m.after.comments > m.before.comments).length : null,
      medianDelta: trend ? median(full.map((m) => m.after.comments - m.before.comments)) : null,
      viewersMedian: trend ? median(vdiffs) : null,
      viewersN: vdiffs.length,
      chainCount: moments.filter((m) => m.chain).length,
      quietCount: full.filter((m) => m.before.comments + m.after.comments < 3).length
    };
    if (!trend) {
      notes.push(`ギフトの瞬間が ${n}件(5件未満)なので、傾向はまだ言えません。瞬間ごとの数字だけ載せています。`);
    }
    if (input?.sampled === true) notes.push("コメントは一部サンプル(重い配信)のため、件数は実際より小さく出ます。");
    notes.push("ギフトの時刻は公式(koken)の公開時刻、コメント・同接は拡張がこのPCで受け取った時刻です。前後の増減は「同じ時間に起きたこと」であり、ギフトが原因とは限りません。");
    return result;
  }
  function buildGiftMomentNextActions(summary) {
    const s = summary || { n: 0, k: null, medianDelta: null, chainCount: 0, quietCount: 0 };
    if (!(s.n >= MIN_MOMENTS_FOR_TREND)) return ["次の配信でも同じ章を見比べると、傾向が見えてきます。"];
    const lines = [];
    if (s.k != null && s.k / s.n >= 0.6) {
      lines.push("ギフトの後にコメントが増えやすい回でした。次回はギフトが来たら名前を呼んで一言返す時間を取ると、同じ流れを作れるかもしれません。");
    }
    if (s.chainCount >= 2) {
      lines.push(`ギフトが続けて飛んだ瞬間が ${s.chainCount}回ありました。最初の1件のお礼を丁寧にすると、続きやすいのかもしれません。`);
    }
    if (s.quietCount / s.n >= 0.5) {
      lines.push("静かな時間にも支えてくれる人がいます。コメントが少ない時間帯のお礼を意識する価値があります。");
    }
    return lines.slice(0, 3);
  }

  // src/lib/adObservationLog.js
  var AD_OBS_STORAGE_PREFIX = "nls_ad_obs_";
  function adObservationStorageKey(liveId) {
    return AD_OBS_STORAGE_PREFIX + String(liveId == null ? "" : liveId).trim().toLowerCase();
  }
  function adRowUid(row) {
    if (!row || typeof row !== "object") return "";
    const url = String(
      /** @type {Record<string, any>} */
      row.userPageUrl || ""
    );
    const m = /\/user\/([1-9]\d{0,17})(?:[/?#]|$)/.exec(url);
    return m ? m[1] : "";
  }

  // src/lib/audienceEngagementGap.js
  var DEFAULT_HIGH_VISITOR_COUNT = 300;
  var DEFAULT_QUIET_COMMENTS_PER_100 = 20;
  var DEFAULT_SILENT_COMMENTS_PER_100 = 8;
  var DEFAULT_QUIET_UNIQUE_PER_100 = 4;
  function nonNegativeNumber2(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  function positiveTimestamp2(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  function cleanString(value) {
    return String(value == null ? "" : value).trim();
  }
  function normalizeLiveId(value) {
    const s = cleanString(value).toLowerCase();
    if (!s) return "";
    const m = s.match(/lv\d{1,15}/);
    return m ? m[0] : s;
  }
  function rowLiveId(row) {
    const o = (
      /** @type {{ liveId?: unknown, lvId?: unknown }} */
      row || {}
    );
    return normalizeLiveId(o.liveId) || normalizeLiveId(o.lvId);
  }
  function rowMatchesLive(row, targetLiveId) {
    if (!targetLiveId) return true;
    const own = rowLiveId(row);
    return !own || own === targetLiveId;
  }
  function ratioPer100(numerator, denominator) {
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
      return 0;
    }
    return Math.round(numerator / denominator * 1e4) / 100;
  }
  function computeCommentParticipationPct(uniqueCommenters, totalVisitors) {
    return ratioPer100(uniqueCommenters, totalVisitors);
  }
  function visitorCountFromSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return 0;
    return nonNegativeNumber2(snapshot.viewerCountFromDom) || nonNegativeNumber2(snapshot.totalVisitors) || nonNegativeNumber2(snapshot.watchCount) || nonNegativeNumber2(snapshot.visitorCount);
  }
  function officialCommentCountFromSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return 0;
    return nonNegativeNumber2(snapshot.officialCommentCount) || nonNegativeNumber2(snapshot.commentCount) || nonNegativeNumber2(snapshot.comments);
  }
  function normalizeSample(sample) {
    const row = (
      /** @type {Record<string, unknown>} */
      sample || {}
    );
    const at = positiveTimestamp2(row.capturedAt) || positiveTimestamp2(row.updatedAt) || positiveTimestamp2(row.timestamp);
    const visitors = nonNegativeNumber2(row.viewerCountFromDom) || nonNegativeNumber2(row.totalVisitors) || nonNegativeNumber2(row.visitorCount);
    const comments = nonNegativeNumber2(row.officialCommentCount) || nonNegativeNumber2(row.commentStorageCount) || nonNegativeNumber2(row.commentCount);
    if (!at || !visitors && !comments) return null;
    return { at, visitors, comments };
  }
  function findQuietAudienceWindows(samples, liveId, quietCommentsPer100Visitors) {
    const normalized = [];
    for (const raw of Array.isArray(samples) ? samples : []) {
      if (!rowMatchesLive(raw, liveId)) continue;
      const sample = normalizeSample(raw);
      if (sample) normalized.push(sample);
    }
    normalized.sort((a, b) => a.at - b.at);
    const windows = [];
    for (let i = 1; i < normalized.length; i++) {
      const prev = normalized[i - 1];
      const cur = normalized[i];
      const visitorDelta = Math.max(0, cur.visitors - prev.visitors);
      const commentDelta = Math.max(0, cur.comments - prev.comments);
      if (visitorDelta < 50) continue;
      const commentsPer100NewVisitors = ratioPer100(commentDelta, visitorDelta);
      if (commentsPer100NewVisitors >= quietCommentsPer100Visitors) continue;
      windows.push({
        startAt: prev.at,
        endAt: cur.at,
        visitorDelta,
        commentDelta,
        commentsPer100NewVisitors
      });
    }
    return windows.slice(0, 8);
  }
  function classifyEngagementLevel(visitors, commentsPer100Visitors, uniquePer100Visitors, thresholds) {
    if (visitors <= 0) return "unknown";
    const highVisitors = visitors >= thresholds.minHighVisitorCount;
    const veryLowComments = commentsPer100Visitors < thresholds.silentCommentsPer100Visitors;
    const lowComments = commentsPer100Visitors < thresholds.quietCommentsPer100Visitors;
    const lowUnique = uniquePer100Visitors < thresholds.quietUniqueCommentersPer100Visitors;
    if (highVisitors && veryLowComments) return "silent-crowd";
    if (highVisitors && lowComments && lowUnique) return "silent-crowd";
    if (lowComments || lowUnique) return "quiet";
    return "healthy";
  }
  function buildInsightLines2(result) {
    if (result.level === "unknown") {
      return ["来場者数が未取得のため、来場とコメントの変換率は判定できません。"];
    }
    const lines = [];
    if (result.totalVisitors > 0 && result.uniqueCommenters > 0) {
      lines.push(
        `来場${result.totalVisitors}人中${result.uniqueCommenters}人がコメント（${result.commentParticipationPct}%）。`
      );
    }
    lines.push(
      `来場100人あたりコメントは${result.commentsPer100Visitors}件、発言者は${result.uniqueCommentersPer100Visitors}人です。`
    );
    if (result.level === "silent-crowd") {
      lines.push("来場は多い一方で、発言に変わった割合が低い「静かな観客」状態です。");
    } else if (result.level === "quiet") {
      lines.push("コメントへの変換はやや控えめです。問いかけや参加型の導線を増やす余地があります。");
    } else {
      lines.push("来場に対するコメント反応は十分に出ています。");
    }
    if (result.quietAudienceWindows.length > 0) {
      lines.push("来場が増えたのにコメントが伸びにくい時間帯があります。");
    }
    return lines;
  }
  function analyzeAudienceEngagementGap(input, options = {}) {
    const liveId = normalizeLiveId(options.liveId) || normalizeLiveId(input?.liveId);
    const broadcasterUserId = cleanString(options.broadcasterUserId);
    const comments = [];
    const unique = /* @__PURE__ */ new Set();
    for (const raw of Array.isArray(input?.comments) ? input.comments : []) {
      if (!rowMatchesLive(raw, liveId)) continue;
      const row = (
        /** @type {Record<string, unknown>} */
        raw || {}
      );
      if (!cleanString(row.text)) continue;
      const uid = cleanString(row.userId);
      if (broadcasterUserId && uid === broadcasterUserId) continue;
      comments.push(row);
      if (uid) unique.add(uid);
    }
    const samples = Array.isArray(input?.samples) ? input.samples : [];
    let sampleMaxVisitors = 0;
    let sampleMaxComments = 0;
    for (const raw of samples) {
      if (!rowMatchesLive(raw, liveId)) continue;
      const s = normalizeSample(raw);
      if (!s) continue;
      if (s.visitors > sampleMaxVisitors) sampleMaxVisitors = s.visitors;
      if (s.comments > sampleMaxComments) sampleMaxComments = s.comments;
    }
    const totalVisitors = nonNegativeNumber2(input?.visitorCount) || visitorCountFromSnapshot(input?.snapshot) || sampleMaxVisitors;
    const officialCommentCount = nonNegativeNumber2(input?.officialCommentCount) || officialCommentCountFromSnapshot(input?.snapshot) || sampleMaxComments;
    const recordedCommentCount = comments.length;
    const effectiveCommentCount = Math.max(officialCommentCount, recordedCommentCount);
    const uniqueCommenters = unique.size;
    const commentsPer100Visitors = ratioPer100(effectiveCommentCount, totalVisitors);
    const recordedCommentsPer100Visitors = ratioPer100(recordedCommentCount, totalVisitors);
    const uniqueCommentersPer100Visitors = ratioPer100(uniqueCommenters, totalVisitors);
    const commentParticipationPct = computeCommentParticipationPct(uniqueCommenters, totalVisitors);
    const thresholds = {
      minHighVisitorCount: Math.max(1, Math.trunc(Number(options.minHighVisitorCount) || DEFAULT_HIGH_VISITOR_COUNT)),
      quietCommentsPer100Visitors: nonNegativeNumber2(options.quietCommentsPer100Visitors) || DEFAULT_QUIET_COMMENTS_PER_100,
      silentCommentsPer100Visitors: nonNegativeNumber2(options.silentCommentsPer100Visitors) || DEFAULT_SILENT_COMMENTS_PER_100,
      quietUniqueCommentersPer100Visitors: nonNegativeNumber2(options.quietUniqueCommentersPer100Visitors) || DEFAULT_QUIET_UNIQUE_PER_100
    };
    const level = classifyEngagementLevel(
      totalVisitors,
      commentsPer100Visitors,
      uniqueCommentersPer100Visitors,
      thresholds
    );
    const result = {
      level,
      totalVisitors: Math.round(totalVisitors),
      officialCommentCount: Math.round(officialCommentCount),
      recordedCommentCount,
      effectiveCommentCount: Math.round(effectiveCommentCount),
      uniqueCommenters,
      commentsPer100Visitors,
      recordedCommentsPer100Visitors,
      uniqueCommentersPer100Visitors,
      commentParticipationPct,
      silentVisitorEstimate: Math.max(0, Math.round(totalVisitors - uniqueCommenters)),
      quietAudienceWindows: findQuietAudienceWindows(
        samples,
        liveId,
        thresholds.quietCommentsPer100Visitors
      ),
      insightLines: []
    };
    result.insightLines = buildInsightLines2(result);
    return result;
  }

  // src/domain/user/identity.js
  function isAnonymousStyleNicoUserId2(userId) {
    const s = String(userId || "").trim();
    if (!s) return true;
    if (/^\d{5,14}$/.test(s)) return false;
    if (/^a:/i.test(s)) return true;
    if (/^[a-zA-Z0-9_-]{10,26}$/.test(s)) return true;
    return true;
  }

  // src/lib/parseGiftComment.js
  function parseNicoadPointToken(raw) {
    const normalized = String(raw || "").replace(/,/g, "").replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 65248));
    const point = parseInt(normalized, 10);
    return Number.isFinite(point) && point > 0 ? point : null;
  }
  function parseNicoadCommentText(text) {
    if (typeof text !== "string") return null;
    const trimmed = text.trim();
    if (!trimmed) return null;
    const re = /^(?:【[^】]*】\s*)*(.+?)さんが([\d,０-９]+)\s*pt(?:広告しました|の(?:ニコニコ)?広告)/i;
    const m = trimmed.match(re);
    if (!m) return null;
    const sender = m[1].trim();
    const point = parseNicoadPointToken(m[2]);
    if (!sender || point == null) return null;
    return { sender, point };
  }

  // src/lib/supportGridDisplayTier.js
  function supportGridStrongNickname(nick, userId) {
    const n = String(nick ?? "").trim();
    if (!n) return false;
    if (isNiconicoAutoUserPlaceholderNickname(n)) return false;
    if (n === "（未取得）" || n === "(未取得)") return false;
    if (n === "匿名") return false;
    if (n === "ゲスト" || /^guest$/i.test(n)) return false;
    if (isNiconicoAnonymousUserId(userId) && n.length <= 1) return false;
    return true;
  }

  // src/lib/giftDisplayNickname.js
  function isLikelyInternalNdgGiftOrCampaignLabel(s) {
    const t = String(s || "").trim();
    if (!t) return false;
    if (/^nicolive_/i.test(t)) return true;
    if (/^stamp_[a-z0-9_]{2,}$/i.test(t)) return true;
    let hasNonAscii = false;
    for (let i = 0; i < t.length; i += 1) {
      if (t.charCodeAt(i) > 127) {
        hasNonAscii = true;
        break;
      }
    }
    if (/^[a-z][a-z0-9_]{22,}$/i.test(t) && !hasNonAscii) return true;
    if (/unei_niconico/i.test(t)) return true;
    if (/^\d{4,}[_a-z][a-z0-9_]{8,}$/i.test(t) && !hasNonAscii) return true;
    return false;
  }
  function isTrustworthySupportGridDisplayNickname(nick, userId) {
    const uid = String(userId || "").trim();
    const n = String(nick || "").trim();
    if (!n) return false;
    if (isLikelyInternalNdgGiftOrCampaignLabel(n)) return false;
    return supportGridStrongNickname(n, uid);
  }
  function containsJapaneseScriptOrFullwidthDisplayChars(s) {
    return /[\u3040-\u30FF\u4E00-\u9FFF\u3000-\u303F\uFF00-\uFFEF]/.test(String(s || ""));
  }
  function isLikelyPlainAsciiHandleNickname(s) {
    const t = String(s || "").trim();
    if (t.length < 8) return false;
    return /^[a-z0-9_]+$/i.test(t);
  }
  function isLikelySnakeCaseAsciiHandleNickname(s) {
    const t = String(s || "").trim();
    if (t.length < 8) return false;
    if (!t.includes("_")) return false;
    return /^[a-z0-9_]+$/i.test(t);
  }
  function isShortLatinLettersOnlyNickname(s) {
    const t = String(s || "").trim();
    if (t.length < 2 || t.length > 20) return false;
    return /^[A-Za-z]+$/.test(t);
  }
  function pickBetterInterceptNickname(userId, prevNick, incomingNick) {
    const uid = String(userId || "").trim();
    const prev = String(prevNick || "").trim();
    const next = String(incomingNick || "").trim();
    if (!next) return prev;
    if (!prev) return next;
    if (prev === next) return prev;
    const prevInternal = isLikelyInternalNdgGiftOrCampaignLabel(prev);
    const nextInternal = isLikelyInternalNdgGiftOrCampaignLabel(next);
    const prevTrust = isTrustworthySupportGridDisplayNickname(prev, uid);
    const nextTrust = isTrustworthySupportGridDisplayNickname(next, uid);
    let preferNext = false;
    if (prevInternal && !nextInternal) preferNext = true;
    else if (!prevInternal && nextInternal) preferNext = false;
    else if (prevTrust && !nextTrust) preferNext = false;
    else if (!prevTrust && nextTrust) preferNext = true;
    else if (!prevInternal && !nextInternal && prevTrust && nextTrust && containsJapaneseScriptOrFullwidthDisplayChars(next) && isLikelyPlainAsciiHandleNickname(prev)) {
      preferNext = true;
    } else if (!prevInternal && !nextInternal && prevTrust && nextTrust && containsJapaneseScriptOrFullwidthDisplayChars(prev) && isLikelyPlainAsciiHandleNickname(next)) {
      preferNext = false;
    } else if (!prevInternal && !nextInternal && prevTrust && nextTrust && isShortLatinLettersOnlyNickname(next) && isLikelySnakeCaseAsciiHandleNickname(prev)) {
      preferNext = true;
    } else if (!prevInternal && !nextInternal && prevTrust && nextTrust && isShortLatinLettersOnlyNickname(prev) && isLikelySnakeCaseAsciiHandleNickname(next)) {
      preferNext = false;
    } else if (next.length > prev.length) preferNext = true;
    return preferNext ? next : prev;
  }

  // src/lib/userLaneMergeGiftThrowers.js
  function isNumericGiftThrowerUserId(uid) {
    return /^\d{5,14}$/.test(String(uid || "").trim());
  }
  function buildGiftThrowerLaneEntries(giftUsers, opts = {}) {
    const outLiveId = String(opts.liveId || "").trim();
    const byUid = /* @__PURE__ */ new Map();
    for (const g of Array.isArray(giftUsers) ? giftUsers : []) {
      const uid = String(g?.userId || "").trim();
      if (!uid || uid.startsWith("__anon_")) continue;
      if (isAnonymousStyleNicoUserId2(uid)) continue;
      if (!isNumericGiftThrowerUserId(uid)) continue;
      const capturedAt = Number(g?.capturedAt);
      const sortAt = Number.isFinite(capturedAt) && capturedAt > 0 ? capturedAt : 0;
      const nick = String(g?.nickname || "").trim();
      const ex = byUid.get(uid);
      if (ex) {
        if (sortAt > ex.capturedAt) ex.capturedAt = sortAt;
        if (nick) ex.nickname = pickBetterInterceptNickname(uid, ex.nickname, nick);
        continue;
      }
      byUid.set(uid, {
        userId: uid,
        nickname: nick,
        capturedAt: sortAt,
        avatarUrl: "",
        avatarObserved: false,
        liveId: outLiveId
      });
    }
    const built = [...byUid.values()].sort((a, b) => b.capturedAt - a.capturedAt);
    return Object.freeze(
      built.map(
        (row) => Object.freeze({
          userId: row.userId,
          nickname: row.nickname,
          capturedAt: row.capturedAt,
          avatarUrl: row.avatarUrl,
          avatarObserved: row.avatarObserved,
          liveId: row.liveId
        })
      )
    );
  }

  // src/lib/marketingSupportParticipationCounts.js
  function isNumericUserId(uid) {
    return /^\d{5,14}$/.test(String(uid || "").trim());
  }
  function countUniqueGiftThrowers(giftUsers, giftEvents, giftHistoryThrows) {
    const keys = /* @__PURE__ */ new Set();
    for (const row of buildGiftThrowerLaneEntries(giftUsers, {})) {
      if (row.userId) keys.add(row.userId);
    }
    for (const list of [giftEvents, giftHistoryThrows]) {
      if (!Array.isArray(list)) continue;
      for (const raw of list) {
        const uid = String(raw?.userId || "").trim();
        if (isNumericUserId(uid)) keys.add(uid);
      }
    }
    return keys.size;
  }
  function countUniqueAdContributors(adContributionRanking, comments) {
    const keys = /* @__PURE__ */ new Set();
    for (const raw of Array.isArray(adContributionRanking) ? adContributionRanking : []) {
      const uid = String(raw?.userId || "").trim();
      const contribution = Math.max(
        Number(raw?.contribution) || 0,
        Number(raw?.score) || 0
      );
      if (!Number.isFinite(contribution) || contribution <= 0) continue;
      if (uid && !isAnonymousStyleNicoUserId2(uid)) {
        keys.add(isNumericUserId(uid) ? `uid:${uid}` : `id:${uid}`);
        continue;
      }
      const name = String(raw?.nickname ?? raw?.name ?? "").trim();
      if (name) keys.add(`name:${name}`);
    }
    if (keys.size > 0) return keys.size;
    for (const c of Array.isArray(comments) ? comments : []) {
      const parsed = parseNicoadCommentText(String(c?.text ?? "").trim());
      if (!parsed?.sender) continue;
      keys.add(`nicoad:${parsed.sender}`);
    }
    return keys.size;
  }
  function resolveMarketingSupportParticipationCounts(input = {}) {
    const uniqueGiftThrowers = countUniqueGiftThrowers(
      input.giftUsers,
      input.giftEvents,
      input.giftHistoryThrows
    );
    const uniqueAdContributors = countUniqueAdContributors(
      input.adContributionRanking,
      input.comments
    );
    return {
      uniqueGiftThrowers,
      uniqueAdContributors,
      giftParticipationPct: 0,
      adParticipationPct: 0
    };
  }
  function supportParticipationPctAgainstVisitors(gap, support) {
    const visitors = Number(gap?.totalVisitors) || 0;
    if (visitors <= 0) {
      return { giftParticipationPct: 0, adParticipationPct: 0 };
    }
    return {
      giftParticipationPct: computeCommentParticipationPct(
        support.uniqueGiftThrowers,
        visitors
      ),
      adParticipationPct: computeCommentParticipationPct(
        support.uniqueAdContributors,
        visitors
      )
    };
  }

  // src/lib/supporterChikuranScore.js
  var SUPPORTER_CHIKURAN_ANONYMOUS_KEY = "__supporter_chikuran_anonymous__";
  var SUPPORTER_CHIKURAN_DEFAULT_WEIGHTS = Object.freeze({
    comment: 2,
    recent5mComment: 8,
    recent15mComment: 4,
    giftThrow: 16,
    giftPointPer100: 10,
    adPointPer100: 6,
    activeDay: 3,
    newcomerMomentum: 6
  });
  var FIVE_MINUTES_MS = 5 * 60 * 1e3;
  var FIFTEEN_MINUTES_MS = 15 * 60 * 1e3;
  var NEWCOMER_WINDOW_MS = 30 * 60 * 1e3;
  function cleanString2(value) {
    return String(value == null ? "" : value).trim();
  }
  function nonNegativeNumber3(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  function positiveTimestamp3(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  function normalizeLiveId2(value) {
    const s = cleanString2(value).toLowerCase();
    if (!s) return "";
    const m = s.match(/lv\d{1,15}/);
    return m ? m[0] : s;
  }
  function rowLiveId2(row) {
    const o = (
      /** @type {{ liveId?: unknown, lvId?: unknown }} */
      row || {}
    );
    return normalizeLiveId2(o.liveId) || normalizeLiveId2(o.lvId);
  }
  function rowMatchesLive2(row, targetLiveId) {
    if (!targetLiveId) return true;
    const own = rowLiveId2(row);
    return !own || own === targetLiveId;
  }
  function extractUidFromUserPageUrl(value) {
    const s = cleanString2(value);
    const m = s.match(/^https:\/\/www\.nicovideo\.jp\/user\/(\d{1,18})\/?$/i);
    return m ? m[1] : "";
  }
  function sanitizeHttpUrl(value) {
    const s = cleanString2(value);
    return /^https?:\/\//i.test(s) ? s : "";
  }
  function isAnonymousSupporter(uid, name, raw) {
    const lower = uid.toLowerCase();
    const row = (
      /** @type {{ is184?: unknown, isAnonymous?: unknown }} */
      raw || {}
    );
    if (row.is184 === true || row.isAnonymous === true) return true;
    if (!uid && (!name || /^(名無し|匿名|anonymous)$/i.test(name))) return true;
    if (isNiconicoAnonymousUserId(uid)) return true;
    if (lower.startsWith("__anon_")) return true;
    if (lower.startsWith("__gift_sender_")) return true;
    return false;
  }
  function dayKey(value) {
    const at = positiveTimestamp3(value);
    if (!at) return "";
    try {
      return new Date(at).toISOString().slice(0, 10);
    } catch {
      return "";
    }
  }
  function pickRankingName(raw) {
    const row = (
      /** @type {Record<string, unknown>} */
      raw || {}
    );
    return cleanString2(row.name) || cleanString2(row.supporterName) || cleanString2(row.advertiserName) || cleanString2(row.nickname) || cleanString2(row.thumbnailAltName);
  }
  function pickRankingContribution(raw) {
    const row = (
      /** @type {Record<string, unknown>} */
      raw || {}
    );
    return nonNegativeNumber3(row.contribution) || nonNegativeNumber3(row.totalContribution) || nonNegativeNumber3(row.totalPoints) || nonNegativeNumber3(row.point);
  }
  function identifyCommentLike(raw) {
    const row = (
      /** @type {Record<string, unknown>} */
      raw || {}
    );
    const uid = cleanString2(row.userId ?? row.user_id);
    const name = cleanString2(row.nickname ?? row.name);
    return {
      uid,
      name,
      avatarUrl: sanitizeHttpUrl(row.avatarUrl ?? row.thumbnailUrl),
      anonymous: isAnonymousSupporter(uid, name, raw)
    };
  }
  function identifyOfficialRanking(raw) {
    const row = (
      /** @type {Record<string, unknown>} */
      raw || {}
    );
    const uid = extractUidFromUserPageUrl(row.userPageUrl) || cleanString2(row.userId ?? row.supporterId ?? row.advertiserId);
    const name = pickRankingName(row);
    return {
      uid,
      name,
      avatarUrl: sanitizeHttpUrl(row.thumbnailUrl ?? row.avatarUrl),
      anonymous: isAnonymousSupporter(uid, name, raw)
    };
  }
  function supporterKeyFor(id, foldAnonymous) {
    if (id.anonymous && foldAnonymous) {
      return { key: SUPPORTER_CHIKURAN_ANONYMOUS_KEY, identityKind: "anonymous" };
    }
    if (id.uid && !id.anonymous) {
      return { key: `u:${id.uid}`, identityKind: "userId" };
    }
    if (id.name && !id.anonymous) {
      return { key: `n:${id.name.toLowerCase()}`, identityKind: "name" };
    }
    return { key: SUPPORTER_CHIKURAN_ANONYMOUS_KEY, identityKind: "anonymous" };
  }
  function touchAggregate(agg, p) {
    const at = positiveTimestamp3(p.at);
    if (p.uid && !agg.userId) agg.userId = p.uid;
    if (p.avatarUrl && !agg.avatarUrl) agg.avatarUrl = p.avatarUrl;
    if (p.name && (!agg.displayName || at >= agg.lastSeenAt)) {
      agg.displayName = p.name;
    }
    if (at > 0) {
      if (!agg.firstSeenAt || at < agg.firstSeenAt) agg.firstSeenAt = at;
      if (at > agg.lastSeenAt) agg.lastSeenAt = at;
      const day = dayKey(at);
      if (day) agg.activeDays.add(day);
    }
    agg.sources.add(p.source);
  }
  function createEmptyAggregate(key, identityKind) {
    return {
      supporterKey: key,
      identityKind,
      displayName: identityKind === "anonymous" ? "匿名応援" : "",
      userId: "",
      avatarUrl: "",
      commentCount: 0,
      recent5mCommentCount: 0,
      recent15mCommentCount: 0,
      giftThrowCountFromUsers: 0,
      giftEventCount: 0,
      observedGiftPointTotal: 0,
      officialGiftContribution: 0,
      adPointTotal: 0,
      firstSeenAt: 0,
      lastSeenAt: 0,
      activeDays: /* @__PURE__ */ new Set(),
      sources: /* @__PURE__ */ new Set()
    };
  }
  function getAggregate(map, id, foldAnonymous) {
    const { key, identityKind } = supporterKeyFor(id, foldAnonymous);
    let agg = map.get(key);
    if (!agg) {
      agg = createEmptyAggregate(key, identityKind);
      map.set(key, agg);
    }
    if (identityKind === "anonymous") {
      agg.displayName = "匿名応援";
    }
    return agg;
  }
  function roundScore(value) {
    return Math.round(value * 10) / 10;
  }
  function aggregateToRow(agg, weights, nowMs) {
    const giftThrowCount = Math.max(agg.giftThrowCountFromUsers, agg.giftEventCount);
    const giftPointTotal = Math.max(
      Math.round(agg.observedGiftPointTotal),
      Math.round(agg.officialGiftContribution)
    );
    const activeDayCount = agg.activeDays.size;
    const hasNewcomerMomentum = agg.firstSeenAt > 0 && nowMs - agg.firstSeenAt <= NEWCOMER_WINDOW_MS && (agg.recent15mCommentCount > 0 || giftThrowCount > 0);
    const totalScore = roundScore(
      agg.commentCount * weights.comment + agg.recent5mCommentCount * weights.recent5mComment + agg.recent15mCommentCount * weights.recent15mComment + giftThrowCount * weights.giftThrow + giftPointTotal / 100 * weights.giftPointPer100 + agg.adPointTotal / 100 * weights.adPointPer100 + activeDayCount * weights.activeDay + (hasNewcomerMomentum ? weights.newcomerMomentum : 0)
    );
    const isAnonymousAggregate = agg.identityKind === "anonymous";
    return {
      supporterKey: agg.supporterKey,
      identityKind: agg.identityKind,
      displayName: isAnonymousAggregate ? "匿名応援" : agg.displayName || (agg.userId ? `u/${agg.userId}` : "応援者"),
      userId: isAnonymousAggregate ? "" : agg.userId,
      avatarUrl: isAnonymousAggregate ? "" : agg.avatarUrl,
      isAnonymousAggregate,
      commentCount: agg.commentCount,
      recent5mCommentCount: agg.recent5mCommentCount,
      recent15mCommentCount: agg.recent15mCommentCount,
      giftThrowCount,
      giftPointTotal,
      adPointTotal: Math.round(agg.adPointTotal),
      activeDayCount,
      firstSeenAt: agg.firstSeenAt,
      lastSeenAt: agg.lastSeenAt,
      totalScore,
      sources: [...agg.sources].sort()
    };
  }
  function buildSupporterChikuranRows(input, options = {}) {
    const nowMs = positiveTimestamp3(options.nowMs) || Date.now();
    const maxRows = Math.max(1, Math.min(100, Math.trunc(Number(options.maxRows) || 20)));
    const foldAnonymous = options.foldAnonymous !== false;
    const liveId = normalizeLiveId2(options.liveId) || normalizeLiveId2(input?.liveId);
    const excluded = new Set((options.excludeUserIds || []).map((v) => cleanString2(v)).filter(Boolean));
    const weights = Object.freeze({
      ...SUPPORTER_CHIKURAN_DEFAULT_WEIGHTS,
      ...options.weights || {}
    });
    const map = /* @__PURE__ */ new Map();
    for (const raw of input?.comments || []) {
      if (!rowMatchesLive2(raw, liveId)) continue;
      const id = identifyCommentLike(raw);
      if (id.uid && excluded.has(id.uid)) continue;
      const at = positiveTimestamp3(
        /** @type {{ capturedAt?: unknown }} */
        (raw || {}).capturedAt
      );
      const agg = getAggregate(map, id, foldAnonymous);
      agg.commentCount += 1;
      if (at > 0 && nowMs - at <= FIVE_MINUTES_MS) agg.recent5mCommentCount += 1;
      if (at > 0 && nowMs - at <= FIFTEEN_MINUTES_MS) agg.recent15mCommentCount += 1;
      touchAggregate(agg, { uid: id.uid, name: id.name, avatarUrl: id.avatarUrl, at, source: "comment" });
    }
    for (const raw of input?.giftUsers || []) {
      if (!rowMatchesLive2(raw, liveId)) continue;
      const id = identifyCommentLike(raw);
      if (id.uid && excluded.has(id.uid)) continue;
      const at = positiveTimestamp3(
        /** @type {{ capturedAt?: unknown }} */
        (raw || {}).capturedAt
      );
      const throwCount = Math.max(
        1,
        Math.trunc(nonNegativeNumber3(
          /** @type {{ throwCount?: unknown }} */
          (raw || {}).throwCount
        ) || 1)
      );
      const agg = getAggregate(map, id, foldAnonymous);
      agg.giftThrowCountFromUsers += throwCount;
      touchAggregate(agg, { uid: id.uid, name: id.name, avatarUrl: id.avatarUrl, at, source: "gift-users" });
    }
    for (const raw of input?.giftEvents || []) {
      if (!rowMatchesLive2(raw, liveId)) continue;
      const id = identifyCommentLike(raw);
      if (id.uid && excluded.has(id.uid)) continue;
      const row = (
        /** @type {{ capturedAt?: unknown, point?: unknown }} */
        raw || {}
      );
      const at = positiveTimestamp3(row.capturedAt);
      const point = nonNegativeNumber3(row.point);
      const agg = getAggregate(map, id, foldAnonymous);
      agg.giftEventCount += 1;
      agg.observedGiftPointTotal += point;
      touchAggregate(agg, { uid: id.uid, name: id.name, avatarUrl: id.avatarUrl, at, source: "gift-events" });
    }
    for (const raw of input?.giftContributionRanking || []) {
      const id = identifyOfficialRanking(raw);
      if (id.uid && excluded.has(id.uid)) continue;
      const agg = getAggregate(map, id, foldAnonymous);
      agg.officialGiftContribution = Math.max(agg.officialGiftContribution, pickRankingContribution(raw));
      touchAggregate(agg, {
        uid: id.uid,
        name: id.name,
        avatarUrl: id.avatarUrl,
        at: nowMs,
        source: "gift-contribution"
      });
    }
    for (const raw of input?.adContributionRanking || []) {
      const id = identifyOfficialRanking(raw);
      if (id.uid && excluded.has(id.uid)) continue;
      const agg = getAggregate(map, id, foldAnonymous);
      agg.adPointTotal += pickRankingContribution(raw);
      touchAggregate(agg, {
        uid: id.uid,
        name: id.name,
        avatarUrl: id.avatarUrl,
        at: nowMs,
        source: "ad-contribution"
      });
    }
    const rows = [...map.values()].map((agg) => aggregateToRow(agg, weights, nowMs)).filter((row) => row.totalScore > 0).sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.lastSeenAt !== a.lastSeenAt) return b.lastSeenAt - a.lastSeenAt;
      return a.supporterKey.localeCompare(b.supporterKey);
    }).slice(0, maxRows);
    return {
      generatedAt: nowMs,
      liveId,
      rows,
      totals: {
        supporterCount: rows.length,
        anonymousIncluded: rows.some((row) => row.isAnonymousAggregate)
      }
    };
  }

  // src/lib/marketingChartsHtml.js
  var DEFAULT_USERICON_ONERROR_ATTR = `onerror="this.onerror=null;this.src='${escapeHtml(NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS)}'"`;
  function formatSilenceMs(ms) {
    if (ms <= 0) return "—";
    const s = Math.floor(ms / 1e3);
    if (s < 60) return `${s}秒`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem ? `${m}分${rem}秒` : `${m}分`;
  }
  function sectionContentShape(r) {
    if (r.totalComments <= 0) return "";
    const ts = r.textStats;
    const i = r.is184;
    const p = r.premium || { premiumCount: 0, knownCount: 0, pctPremiumOfKnown: 0 };
    const silence = formatSilenceGapLabel(r.maxSilenceGapMs);
    const cards = [
      {
        label: "平均文字数（trim）",
        value: String(ts.avgChars),
        icon: "📝"
      },
      {
        label: "中央値文字数",
        value: String(ts.medianChars),
        icon: "📏"
      },
      {
        label: "URL を含む割合",
        value: `${ts.pctWithUrl}%（${ts.withUrlCount}件）`,
        icon: "🔗"
      },
      {
        label: "絵文字を含む割合",
        value: `${ts.pctWithEmoji}%（${ts.withEmojiCount}件）`,
        icon: "😀"
      },
      {
        label: "自分投稿（selfPosted）",
        value: `${r.selfPostedPct}%（${r.selfPostedCount}件）`,
        icon: "🙋"
      },
      {
        label: "184（既知のみ）",
        value: i.knownCount > 0 ? `${i.pctOfKnown}%（${i.count184}/${i.knownCount}件）` : "データなし",
        icon: "🎭"
      },
      {
        label: "プレミアム会員（既知のみ）",
        value: p.knownCount > 0 ? `${p.pctPremiumOfKnown}%（${p.premiumCount}/${p.knownCount}件）` : "データなし",
        icon: "⭐"
      },
      {
        label: "最長のコメント間隔",
        value: silence,
        icon: "⏸️"
      }
    ];
    const inner = cards.map(
      (c) => `<div class="mkt-kpi mkt-kpi--compact"><span class="mkt-kpi__icon">${c.icon}</span><span class="mkt-kpi__val">${escapeHtml(c.value)}</span><span class="mkt-kpi__label">${escapeHtml(c.label)}</span></div>`
    ).join("");
    return `<section class="mkt-section"><h2>コメント本文・属性の傾向</h2>
<p class="mkt-note">記録された本文のみを対象。184・プレミアム会員は、その属性が記録に付いている行だけ（既知のみ）で割合を計算します。一般/プレミアムが取れるのは主に NDGR 取り込み行で、DOM のみの行は母数から除外されます。</p>
<div class="mkt-kpi-grid">${inner}</div></section>`;
  }
  function sectionBroadcastNarrative(narrative, maskShare) {
    if (!narrative || !Array.isArray(narrative.segments) || narrative.segments.length === 0) {
      return "";
    }
    const segmentHtml = narrative.segments.map((seg) => {
      const keywords = maskShare ? '<span class="mkt-narrative-muted">共有向けでは話題語を省略</span>' : seg.keywords.length ? seg.keywords.map((word) => `<span class="mkt-narrative-keyword">${escapeHtml(word)}</span>`).join("") : '<span class="mkt-narrative-muted">目立つ語は少なめ</span>';
      const samples = !maskShare && seg.sampleComments.length ? `<ul class="mkt-narrative-samples">${seg.sampleComments.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>` : "";
      return `<article class="mkt-narrative-card">
<div class="mkt-narrative-card__head">
<strong>${escapeHtml(seg.label)}</strong>
<span>${seg.startMinute}〜${seg.endMinute}分 / ${seg.commentCount}件 / ${seg.uniqueUsers}人</span>
</div>
<div class="mkt-narrative-keywords">${keywords}</div>
${samples}
</article>`;
    }).join("");
    const sampleNote = maskShare ? '<p class="mkt-note">共有向け出力では話題語と代表コメント本文を省略しています。</p>' : "";
    const summaryLine = maskShare ? `${narrative.peakSegmentLabel || "全体"}にコメントが最も集まりました。` : narrative.summaryLine;
    return `<section class="mkt-section mkt-section--narrative">
<h2>配信内容の流れ</h2>
<p class="mkt-lead">${escapeHtml(summaryLine)}</p>
${sampleNote}
<div class="mkt-narrative-grid">${segmentHtml}</div>
</section>`;
  }
  function formatSilenceGapLabel(ms) {
    if (ms <= 0) return "—（1件以下または時刻なし）";
    return `${formatSilenceMs(ms)}（連続する2コメント間の最大）`;
  }
  function sectionQuarterEngagement(r) {
    if (r.totalComments <= 0 || !r.quarterEngagement) return "";
    const q = r.quarterEngagement;
    if (q.skippedShortSpan) {
      return `<section class="mkt-section"><h2>冒頭・終盤（四分位）</h2>
<p class="mkt-note">記録の時間幅が1分未満のため、最初・最後の四分の一に現れた人数の比較は出していません。長めの枠ほど指標が意味を持ちやすいです。</p></section>`;
    }
    const cards = [
      {
        label: "最初の1/4の時間帯にいた人",
        value: String(q.uniqueCommentersFirstQuarter),
        icon: "🌅"
      },
      {
        label: "最後の1/4の時間帯にいた人",
        value: String(q.uniqueCommentersLastQuarter),
        icon: "🌙"
      },
      {
        label: "冒頭にも終盤にもコメントした人",
        value: String(q.uniqueCommentersBothQuarters),
        icon: "🔁"
      }
    ];
    const inner = cards.map(
      (c) => `<div class="mkt-kpi mkt-kpi--compact"><span class="mkt-kpi__icon">${c.icon}</span><span class="mkt-kpi__val">${escapeHtml(c.value)}</span><span class="mkt-kpi__label">${escapeHtml(c.label)}</span></div>`
    ).join("");
    return `<section class="mkt-section"><h2>冒頭・終盤（四分位）</h2>
<p class="mkt-note">記録の先頭から末尾までの<strong>実時間幅</strong>を4等分し、最初・最後の区間にコメントした<strong>ユニーク人数</strong>と、両方に現れた人数です（離脱や再訪の目安程度）。</p>
<div class="mkt-kpi-grid">${inner}</div></section>`;
  }
  function sectionDerivedTimeline(r) {
    const tl = r.timeline;
    const cum = r.timelineCumulative;
    const roll = r.timelineRolling5Min;
    if (tl.length < 2 || cum.length !== tl.length || roll.length !== tl.length) return "";
    const maxC = Math.max(1, ...cum);
    const maxR = Math.max(1, ...roll);
    const W = 900;
    const H = 220;
    const pad = 40;
    const innerW = W - pad * 2;
    const innerH = H - pad * 2;
    const n = tl.length;
    const cumPts = cum.map((v, i) => {
      const x = pad + innerW * (i + 0.5) / n;
      const y = pad + innerH - v / maxC * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const rollPts = roll.map((v, i) => {
      const x = pad + innerW * (i + 0.5) / n;
      const y = pad + innerH - v / maxR * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const yLabelsL = Array.from({ length: 5 }, (_, i) => {
      const v = Math.round(maxC * (4 - i) / 4);
      const y = pad + innerH * i / 4;
      return `<text x="${pad - 4}" y="${y + 4}" text-anchor="end" class="mkt-axis mkt-axis--cum">${v}</text>`;
    }).join("");
    const yLabelsR = Array.from({ length: 5 }, (_, i) => {
      const v = Math.round(maxR * (4 - i) / 4);
      const y = pad + innerH * i / 4;
      return `<text x="${W - pad + 4}" y="${y + 4}" text-anchor="start" class="mkt-axis mkt-axis--roll">${v}</text>`;
    }).join("");
    const xLabels = tl.filter((_, i) => i % Math.max(1, Math.floor(n / 10)) === 0).map((b) => {
      const x = pad + innerW * (b.minute + 0.5) / n;
      return `<text x="${x.toFixed(1)}" y="${H - 4}" text-anchor="middle" class="mkt-axis">${b.minute}m</text>`;
    }).join("");
    return `<section class="mkt-section">
<h2>累積コメント数と5分窓</h2>
<p class="mkt-note">緑線＝累積件数 / 紫線＝その分を含む直近5分の合計（分単位の桶に対応）</p>
<div class="mkt-chart-wrap">
<svg viewBox="0 0 ${W} ${H}" class="mkt-svg" aria-label="累積と5分窓の折れ線">
<rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="none" stroke="#334155" stroke-width="0.5"/>
${yLabelsL}${yLabelsR}${xLabels}
<polyline points="${cumPts}" fill="none" stroke="#22c55e" stroke-width="2.2" stroke-linecap="round"/>
<polyline points="${rollPts}" fill="none" stroke="#a855f7" stroke-width="2" stroke-linecap="round" stroke-dasharray="6 3"/>
</svg>
</div>
<p class="mkt-note mkt-note--legend"><span class="mkt-leg-inline" style="color:#22c55e">■</span> 累積 <span class="mkt-leg-inline" style="color:#a855f7">■</span> 5分窓（破線）</p>
</section>`;
  }
  function sectionVposThirds(r) {
    const v = r.vposThirds;
    if (!v || r.totalComments <= 0) return "";
    const total = v.early + v.mid + v.late;
    if (total <= 0) return "";
    const max = Math.max(1, v.early, v.mid, v.late);
    const W = 320;
    const H = 140;
    const pad = 28;
    const bw = 56;
    const gap = 40;
    const baseY = H - pad;
    const bars = [
      { label: "早い帯", n: v.early, x: pad },
      { label: "中間帯", n: v.mid, x: pad + bw + gap },
      { label: "遅い帯", n: v.late, x: pad + (bw + gap) * 2 }
    ].map((b) => {
      const h = b.n / max * (H - pad * 2);
      const y = baseY - h;
      return `<rect x="${b.x}" y="${y}" width="${bw}" height="${h}" fill="#38bdf8" opacity="0.75" rx="4"><title>${b.label}: ${b.n}件</title></rect>
<text x="${b.x + bw / 2}" y="${baseY + 16}" text-anchor="middle" class="mkt-axis">${escapeHtml(b.label)}</text>
<text x="${b.x + bw / 2}" y="${y - 4}" text-anchor="middle" class="mkt-axis">${b.n}</text>`;
    }).join("");
    return `<section class="mkt-section">
<h2>再生位置（vpos）の三分割</h2>
<p class="mkt-note">vpos が付いたコメントが5件以上あるときだけ表示。最大 vpos を3等分して早・中・遅に振り分けています（アーカイブ視聴の目安）。</p>
<div class="mkt-chart-wrap">
<svg viewBox="0 0 ${W} ${H}" class="mkt-svg mkt-svg--vpos" aria-label="vpos 三分割">${bars}</svg>
</div>
<p class="mkt-note">合計 ${total} 件（該当コメントのみ）</p>
</section>`;
  }
  function sectionToc(items) {
    if (!items || !items.length) return "";
    const lis = items.map(
      (it) => `<li><a href="#${escapeHtml(it.id)}" class="mkt-toc__link">${escapeHtml(it.label)}</a></li>`
    ).join("");
    return `<nav class="mkt-section mkt-section--toc" aria-label="目次">
<h2>目次</h2>
<p class="mkt-note">各セクションへ飛べます（PRO 印は将来有料）</p>
<ol class="mkt-toc">${lis}</ol>
</nav>`;
  }
  function sectionConcurrentTimeline(series, peak) {
    if (!series || series.points.length < 2) return "";
    const W = 900;
    const H = 220;
    const pad = 40;
    const innerW = W - pad * 2;
    const innerH = H - pad * 2;
    const n = series.points.length;
    const maxV = Math.max(1, series.maxValue);
    const lastMin = series.points[n - 1].minute;
    const xOf = (i) => pad + innerW * i / Math.max(1, n - 1);
    const yOf = (v) => pad + innerH - v / maxV * innerH;
    const linePts = series.points.map((p, i) => `${xOf(i).toFixed(1)},${yOf(p.value).toFixed(1)}`).join(" ");
    const dots = series.points.map(
      (p, i) => `<circle cx="${xOf(i).toFixed(1)}" cy="${yOf(p.value).toFixed(1)}" r="2.5" fill="#22d3ee"><title>${p.minute}分: ${p.value.toLocaleString("ja-JP")}人</title></circle>`
    ).join("");
    const yLabels = Array.from({ length: 5 }, (_, i) => {
      const v = Math.round(maxV * (4 - i) / 4);
      const y = pad + innerH * i / 4;
      return `<text x="${pad - 4}" y="${y + 4}" text-anchor="end" class="mkt-axis">${v.toLocaleString("ja-JP")}</text>`;
    }).join("");
    const xLabels = (() => {
      const step = Math.max(1, Math.floor(n / 8));
      return series.points.filter((_, i) => i % step === 0 || i === n - 1).map((p, _idx) => {
        const i = series.points.indexOf(p);
        return `<text x="${xOf(i).toFixed(1)}" y="${H - 4}" text-anchor="middle" class="mkt-axis">${p.minute}m</text>`;
      }).join("");
    })();
    const peakMarker = peak && typeof peak.peakMinute === "number" ? (() => {
      const idx = series.points.findIndex((p) => p.minute === peak.peakMinute);
      if (idx < 0) return "";
      const x = xOf(idx);
      const y = yOf(peak.peakValue);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="none" stroke="#fbbf24" stroke-width="2"><title>ピーク: ${peak.peakMinute}分目 / ${peak.peakValue.toLocaleString("ja-JP")}人</title></circle>`;
    })() : "";
    const halfDecayMarker = peak && typeof peak.halfDecayMinute === "number" ? (() => {
      const idx = series.points.findIndex((p) => p.minute === peak.halfDecayMinute);
      if (idx < 0) return "";
      const x = xOf(idx);
      const y = yOf(series.points[idx].value);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="none" stroke="#f87171" stroke-width="2"><title>半減点: ${peak.halfDecayMinute}分目（ピークの 50% を割った）</title></circle>`;
    })() : "";
    const sourceLabel = series.source === "official" ? "公式来場者数" : series.source === "mixed" ? "公式来場者数 + 同接推定値（取れた方を採用）" : "同接推定値";
    const peakSummary = peak && peak.peakMinute != null ? `<ul class="mkt-mini-stats">
<li><strong>ピーク到達:</strong> ${peak.peakMinute}分目 / ${peak.peakValue.toLocaleString("ja-JP")}人</li>
<li><strong>開始時:</strong> ${peak.startValue.toLocaleString("ja-JP")}人</li>
<li><strong>終了時:</strong> ${peak.endValue.toLocaleString("ja-JP")}人</li>
<li><strong>終了時保持率:</strong> ${peak.endRetentionRatio != null ? `${(peak.endRetentionRatio * 100).toFixed(1)}%` : "-"}（終了時 / ピーク）</li>
<li><strong>半減点:</strong> ${peak.halfDecayMinute != null ? `${peak.halfDecayMinute}分目` : "到達なし"}（ピークの 50% を割った最初の分）</li>
</ul>` : "";
    return `<section class="mkt-section" id="mkt-concurrent">
<h2>同接推移カーブ <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">${escapeHtml(sourceLabel)}を時系列で表示。黄丸＝ピーク / 赤丸＝半減点。${lastMin}分間で ${n} サンプル。</p>
<div class="mkt-chart-wrap">
<svg viewBox="0 0 ${W} ${H}" class="mkt-svg">
<rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="none" stroke="#334155" stroke-width="0.5"/>
${yLabels}${xLabels}
<polyline points="${linePts}" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round"/>
${dots}${peakMarker}${halfDecayMarker}
</svg>
</div>
${peakSummary}
</section>`;
  }
  function sectionCommentVelocityCurve(series) {
    if (!series || series.buckets.length < 2) return "";
    const W = 900;
    const H = 200;
    const pad = 40;
    const innerW = W - pad * 2;
    const innerH = H - pad * 2;
    const n = series.buckets.length;
    const maxV = Math.max(1, series.peakValue);
    const xOf = (i) => pad + innerW * i / Math.max(1, n - 1);
    const yOfRaw = (v) => pad + innerH - v / maxV * innerH;
    const linePts = series.buckets.map((b, i) => `${xOf(i).toFixed(1)},${yOfRaw(b.count).toFixed(1)}`).join(" ");
    const rollingPts = series.buckets.map((b, i) => `${xOf(i).toFixed(1)},${yOfRaw(b.rolling5).toFixed(1)}`).join(" ");
    const yLabels = Array.from({ length: 5 }, (_, i) => {
      const v = Math.round(maxV * (4 - i) / 4);
      const y = pad + innerH * i / 4;
      return `<text x="${pad - 4}" y="${y + 4}" text-anchor="end" class="mkt-axis">${v}</text>`;
    }).join("");
    return `<section class="mkt-section" id="mkt-velocity">
<h2>コメ速度カーブ（CPM）<span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">水色＝1分ごとのコメ件数 / オレンジ点線＝5分移動平均。ピーク: ${series.peakMinute != null ? `${series.peakMinute}分目（${series.peakValue}件）` : "-"}</p>
<div class="mkt-chart-wrap">
<svg viewBox="0 0 ${W} ${H}" class="mkt-svg">
<rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="none" stroke="#334155" stroke-width="0.5"/>
${yLabels}
<polyline points="${linePts}" fill="none" stroke="#38bdf8" stroke-width="1.6" stroke-linecap="round"/>
<polyline points="${rollingPts}" fill="none" stroke="#fb923c" stroke-width="2" stroke-dasharray="4 3"/>
</svg>
</div></section>`;
  }
  function sectionCommentFatigue(fatigue) {
    if (!fatigue || !Array.isArray(fatigue.tenureBuckets) || fatigue.tenureBuckets.length < 2) {
      return "";
    }
    const buckets = fatigue.tenureBuckets;
    const kpis = [
      {
        label: "ペースが落ちた人",
        value: fatigue.analyzedCount > 0 ? `${fatigue.slowedPct}%（${fatigue.slowedCount}/${fatigue.analyzedCount}人）` : "データ不足",
        icon: "🥵"
      },
      {
        label: "失速の中央値（後半÷前半の間隔）",
        value: fatigue.analyzedCount > 0 ? `×${fatigue.medianSlowdownRatio}` : "-",
        icon: "🐢"
      },
      {
        label: "追跡できたコメンター",
        value: `${fatigue.trackedUsers}人（3コメ以上 ${fatigue.multiCommenterCount}人）`,
        icon: "👥"
      }
    ];
    const kpiHtml = kpis.map(
      (c) => `<div class="mkt-kpi mkt-kpi--compact"><span class="mkt-kpi__icon">${c.icon}</span><span class="mkt-kpi__val">${escapeHtml(c.value)}</span><span class="mkt-kpi__label">${escapeHtml(c.label)}</span></div>`
    ).join("");
    const W = 900;
    const H = 200;
    const pad = 40;
    const innerW = W - pad * 2;
    const innerH = H - pad * 2;
    const n = buckets.length;
    const maxPerUser = Math.max(1, ...buckets.map((b) => b.perUser));
    const xOf = (i) => pad + innerW * i / Math.max(1, n - 1);
    const yOf = (v, max) => pad + innerH - v / max * innerH;
    const perUserPts = buckets.map((b, i) => `${xOf(i).toFixed(1)},${yOf(b.perUser, maxPerUser).toFixed(1)}`).join(" ");
    const retentionPts = buckets.map((b, i) => `${xOf(i).toFixed(1)},${yOf(b.retentionPct, 100).toFixed(1)}`).join(" ");
    const xLabels = buckets.filter((_, i) => i % Math.ceil(n / 8) === 0 || i === n - 1).map((b) => {
      const x = xOf(b.minute);
      return `<text x="${x.toFixed(1)}" y="${H - pad + 16}" text-anchor="middle" class="mkt-axis">${b.minute}</text>`;
    }).join("");
    return `<section class="mkt-section" id="mkt-fatigue">
<h2>コメント疲労カーブ（在籍時間別）<span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">「短い時間でコメントを打つと疲れて失速する」を可視化。横軸＝各コメンターが<strong>初コメしてからの経過分</strong>。水色＝1人あたりコメ数（右肩下がりなら発話量が減衰）、黄＝残存率（初コメ直後を100%として何%が発話を続けているか）。userId が取れる行のみ対象（匿名184は同一人物として追跡不可のため除外）。</p>
<div class="mkt-kpi-grid">${kpiHtml}</div>
<div class="mkt-chart-wrap">
<svg viewBox="0 0 ${W} ${H}" class="mkt-svg" role="img" aria-label="在籍時間別のコメント疲労カーブ">
<rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="none" stroke="#334155" stroke-width="0.5"/>
${xLabels}
<polyline points="${retentionPts}" fill="none" stroke="#facc15" stroke-width="2" stroke-dasharray="4 3"/>
<polyline points="${perUserPts}" fill="none" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round"/>
</svg>
</div>
<p class="mkt-note">※ 水色は最大値、黄は0〜100%でスケールしています。両方とも右肩下がりだと「冒頭に勢いよくコメ→だんだん疲れて減る」傾向です。</p>
</section>`;
  }
  function sectionSilenceZones(zones) {
    if (!Array.isArray(zones) || zones.length === 0) return "";
    const sorted = [...zones].sort((a, b) => b.durationMs - a.durationMs);
    const top = sorted.slice(0, 10);
    const qualityLabel = (q) => q === "engaged" ? "ガン見系（皆ガン見・話芸ピーク候補）" : q === "departed" ? "離脱系（盛り下がり）" : q === "neutral" ? "ふつう" : "判定なし";
    const qualityColor = (q) => q === "engaged" ? "#22c55e" : q === "departed" ? "#ef4444" : q === "neutral" ? "#94a3b8" : "#64748b";
    const rows = top.map((z) => {
      const sec = Math.round(z.durationMs / 1e3);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      const dur = m > 0 ? `${m}分${s}秒` : `${s}秒`;
      const color = qualityColor(z.quality);
      return `<tr>
<td>${escapeHtml(dur)}</td>
<td><span class="mkt-quality-pill" style="background:${color}">${escapeHtml(qualityLabel(z.quality))}</span></td>
<td>${z.afterCount}</td>
<td class="mkt-mono">${escapeHtml(z.beforeText)}</td>
<td class="mkt-mono">${escapeHtml(z.afterText)}</td>
</tr>`;
    }).join("");
    return `<section class="mkt-section" id="mkt-silence">
<h2>沈黙ゾーン × 沈黙の質 <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">60 秒以上コメが流れなかった区間 ${zones.length} 件のうち、長い順に最大 10 件。沈黙後 30 秒以内のコメ件数で「ガン見系（5+件）」「離脱系（0-1件）」「ふつう（2-4件）」に分類（ラテラル分析 L2）。</p>
<table class="mkt-rank">
<thead><tr><th>長さ</th><th>沈黙の質</th><th>直後30秒のコメ数</th><th>沈黙直前のコメ</th><th>沈黙明けのコメ</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</section>`;
  }
  function sectionLaughterDensity(laugh) {
    if (!laugh || laugh.buckets.length < 2) return "";
    const W = 900;
    const H = 180;
    const pad = 36;
    const innerW = W - pad * 2;
    const innerH = H - pad * 2;
    const n = laugh.buckets.length;
    const maxV = Math.max(1, laugh.peakValue);
    const xOf = (i) => pad + innerW * i / Math.max(1, n - 1);
    const barW = Math.max(1, Math.min(8, innerW / n - 1));
    const bars = laugh.buckets.map((b, i) => {
      const x = xOf(i);
      const h = b.count / maxV * innerH;
      const halfMin = Math.floor(b.minute / 2);
      const halfSec = b.minute % 2 * 30;
      return `<rect x="${x.toFixed(1)}" y="${(pad + innerH - h).toFixed(1)}" width="${barW}" height="${h.toFixed(1)}" fill="#fbbf24" opacity="0.85"><title>${halfMin}分${halfSec}秒〜: 笑い ${b.count}件 / 総 ${b.total}件 (${(b.ratio * 100).toFixed(0)}%)</title></rect>`;
    }).join("");
    return `<section class="mkt-section" id="mkt-laughter">
<h2>笑い密度（盛り上がり指標）<span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">w / 草 / 8888 / 笑 / 爆笑 / ワロタ 等の出現を 30 秒粒度で。全体の笑い比率 ${(laugh.overallRatio * 100).toFixed(1)}% / ピーク: ${laugh.peakBucket != null ? `${Math.floor(laugh.peakBucket / 2)}分${laugh.peakBucket % 2 * 30}秒〜` : "-"}（${laugh.peakValue}件）（ラテラル分析 L4）</p>
<div class="mkt-chart-wrap">
<svg viewBox="0 0 ${W} ${H}" class="mkt-svg">
<rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="none" stroke="#334155" stroke-width="0.5"/>
${bars}
</svg>
</div></section>`;
  }
  function sectionNewVsRepeat(c) {
    if (!c || c.totalCurrent === 0) return "";
    const pct = (n) => `${(n * 100).toFixed(1)}%`;
    return `<section class="mkt-section" id="mkt-new-vs-repeat">
<h2>新規 vs 常連 <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">過去の記録した配信と突合して、今回のコメンターを 3 区分に分類（過去 5+ コメ実績ありが「ヘビー常連」）。${c.totalCurrent} 名中。</p>
<table class="mkt-rank">
<thead><tr><th>分類</th><th>人数</th><th>比率</th></tr></thead>
<tbody>
<tr><th>新規（このアカウントで初めて記録）</th><td>${c.newCount}</td><td>${pct(c.newRatio)}</td></tr>
<tr><th>リピーター（過去にも記録あり）</th><td>${c.repeatCount}</td><td>${pct(c.repeatRatio)}</td></tr>
<tr><th>うちヘビー常連（過去 5+ コメ）</th><td>${c.heavyCount}</td><td>${pct(c.heavyRatio)}</td></tr>
</tbody>
</table>
</section>`;
  }
  function sectionNewVsRepeatUnavailable(note) {
    return `<section class="mkt-section" id="mkt-new-vs-repeat">
<h2>新規 vs 常連 <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">${escapeHtml(note)}</p>
</section>`;
  }
  function sectionSurvivalCurve(curve) {
    if (!curve || curve.segments.length < 2) return "";
    const W = 900;
    const H = 200;
    const pad = 40;
    const innerW = W - pad * 2;
    const innerH = H - pad * 2;
    const n = curve.segments.length;
    const xOf = (i) => pad + innerW * i / Math.max(1, n - 1);
    const yOf = (pct) => pad + innerH - Math.min(100, pct) / 100 * innerH;
    const linePts = curve.segments.map((s, i) => `${xOf(i).toFixed(1)},${yOf(s.retentionPct).toFixed(1)}`).join(" ");
    const dots = curve.segments.map(
      (s, i) => `<circle cx="${xOf(i).toFixed(1)}" cy="${yOf(s.retentionPct).toFixed(1)}" r="3" fill="#a78bfa"><title>区間${i + 1} (${s.startMin}〜${s.endMin}分): ${s.retentionPct}% (${s.presentCount}名)</title></circle>`
    ).join("");
    const xLabels = curve.segments.map(
      (s, i) => `<text x="${xOf(i).toFixed(1)}" y="${H - 4}" text-anchor="middle" class="mkt-axis">${s.startMin}m</text>`
    ).join("");
    const yLabels = [0, 25, 50, 75, 100].map(
      (v) => `<text x="${pad - 4}" y="${yOf(v) + 4}" text-anchor="end" class="mkt-axis">${v}%</text>`
    ).join("");
    return `<section class="mkt-section" id="mkt-survival">
<h2>コメンター生存曲線 <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">配信を ${n} 等分し、最初の区間に居た「base ${curve.baseUserCount} 名」のうち各区間にも居た % を表示。「コメント参加維持率」=コメ書く層の残存。</p>
<div class="mkt-chart-wrap">
<svg viewBox="0 0 ${W} ${H}" class="mkt-svg">
<rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="none" stroke="#334155" stroke-width="0.5"/>
${yLabels}${xLabels}
<polyline points="${linePts}" fill="none" stroke="#a78bfa" stroke-width="2"/>
${dots}
</svg>
</div></section>`;
  }
  function sectionDepartedHeavy(departed, maskShare, identiconResolver) {
    if (!Array.isArray(departed) || departed.length === 0) return "";
    if (maskShare) return "";
    const rows = departed.map((d, i) => {
      const labelHtml = buildUserProfileLinkedLabelHtml(
        d.userId,
        displayUserLabel(d.userId, d.nickname || "")
      );
      const thumbSrc = resolveReportUserThumbSrc({
        userId: d.userId,
        avatarUrl: "",
        identiconResolver
      });
      const thumbCell = wrapThumbWithProfileLink(
        d.userId,
        thumbSrc ? `<img class="mkt-departed-thumb" src="${escapeHtml(thumbSrc)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${DEFAULT_USERICON_ONERROR_ATTR}>` : '<span class="mkt-departed-thumb mkt-departed-thumb--empty"></span>'
      );
      return `<tr>
<td>${i + 1}</td>
<td>${thumbCell}</td>
<td>${labelHtml}</td>
<td class="mkt-mono">${/^\d{1,18}$/.test(String(d.userId || "")) ? buildUserProfileLinkedLabelHtml(d.userId, d.userId) : escapeHtml(d.userId)}</td>
<td>${d.totalComments}</td>
<td>${d.broadcastCount}</td>
</tr>`;
    }).join("");
    return `<section class="mkt-section" id="mkt-departed">
<h2>離反コメンター TOP <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">過去の配信で 5+ コメだったが、今回は記録に居ないユーザー（ラテラル分析 L8）。引き留め / 復帰アプローチの候補。</p>
<p class="mkt-spec-note">※ 表示名・サムネはコメ記録時点のもの（仕様）。配信者がハンドルを変えた場合、niconico 側の最新と異なることがあります。ID クリックで現在のユーザーページに移動します。</p>
<table class="mkt-rank">
<thead><tr><th>#</th><th>サムネ</th><th>ユーザー</th><th>ID</th><th>過去累計コメ</th><th>過去参加放送数</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</section>`;
  }
  function sectionAttendanceMatrix(matrix, maskShare, identiconResolver) {
    if (!matrix || matrix.users.length === 0 || matrix.broadcasts.length < 2) return "";
    if (maskShare) return "";
    const headCols = matrix.broadcasts.map((b, i) => `<th title="${escapeHtml(b.liveId)}">配信${i + 1}</th>`).join("");
    const rows = matrix.users.map((u) => {
      const labelHtml = buildUserProfileLinkedLabelHtml(
        u.userId,
        displayUserLabel(u.userId, u.nickname || "")
      );
      const thumbSrc = resolveReportUserThumbSrc({
        userId: u.userId,
        avatarUrl: "",
        identiconResolver
      });
      const thumbCell = wrapThumbWithProfileLink(
        u.userId,
        thumbSrc ? `<img class="mkt-departed-thumb" src="${escapeHtml(thumbSrc)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${DEFAULT_USERICON_ONERROR_ATTR}>` : '<span class="mkt-departed-thumb mkt-departed-thumb--empty"></span>'
      );
      const cells = u.attendance.map(
        (v) => v ? '<td class="mkt-att-cell mkt-att-cell--on" aria-label="出席">●</td>' : '<td class="mkt-att-cell mkt-att-cell--off" aria-label="不参加">·</td>'
      ).join("");
      return `<tr>
<td>${thumbCell}</td>
<td>${labelHtml}</td>
${cells}
<td>${u.totalComments}</td>
</tr>`;
    }).join("");
    return `<section class="mkt-section" id="mkt-attendance">
<h2>常連出席カレンダー <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">直近 ${matrix.broadcasts.length} 配信 × TOP ${matrix.users.length} コメンター（ラテラル分析 L9）。● = 出席 / · = 不参加。各列の横軸は左→右が古→新。</p>
<p class="mkt-spec-note">※ 表示名・サムネはコメ記録時点のもの（仕様）。配信者がハンドルを変えた場合、niconico 側の最新と異なることがあります。</p>
<div class="mkt-chart-wrap">
<table class="mkt-rank mkt-attendance">
<thead><tr><th>サムネ</th><th>ユーザー</th>${headCols}<th>累計</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</div></section>`;
  }
  function sectionKeyboardTypes(report) {
    if (!report) return "";
    const { counts } = report;
    const total = counts.emoji + counts.short + counts.long + counts.quiet + counts.balanced;
    if (total === 0) return "";
    const pct = (n) => `${(n / total * 100).toFixed(1)}%`;
    const labels = {
      emoji: "絵文字派（絵文字率 30%+）",
      short: "短文派（平均 5字未満）",
      long: "ロング派（平均 25字以上）",
      quiet: "無口観戦派（1コメ以下）",
      balanced: "バランス派"
    };
    const colors = {
      emoji: "#fb923c",
      short: "#22c55e",
      long: "#a78bfa",
      quiet: "#94a3b8",
      balanced: "#3b82f6"
    };
    const rows = (
      /** @type {Array<keyof typeof labels>} */
      ["emoji", "short", "long", "long", "quiet", "balanced"].filter((k, i, arr) => arr.indexOf(k) === i).map((k) => {
        return `<tr>
<td><span class="mkt-leg__dot" style="background:${colors[k]}"></span> ${escapeHtml(labels[k])}</td>
<td>${counts[k]}</td>
<td>${pct(counts[k])}</td>
</tr>`;
      }).join("")
    );
    return `<section class="mkt-section" id="mkt-keyboard">
<h2>キーボード型診断 <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">コメンター ${total} 名を 5 つの型に自動分類（ラテラル分析 L12）。配信スタイルとファン層の傾向把握用。</p>
<table class="mkt-rank">
<thead><tr><th>型</th><th>人数</th><th>比率</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</section>`;
  }
  function sectionRecentComparison(cmp) {
    if (!cmp || cmp.bars.length < 2) return "";
    const W = 900;
    const H = 220;
    const pad = 40;
    const innerW = W - pad * 2;
    const innerH = H - pad * 2;
    const n = cmp.bars.length;
    const maxC = Math.max(1, ...cmp.bars.map((b) => b.totalComments));
    const maxU = Math.max(1, ...cmp.bars.map((b) => b.uniqueUsers));
    const groupW = innerW / n;
    const barW = Math.max(2, groupW / 3 - 2);
    const bars = cmp.bars.map((b, i) => {
      const xBase = pad + groupW * i + (groupW - barW * 2 - 2) / 2;
      const hC = b.totalComments / maxC * innerH;
      const hU = b.uniqueUsers / maxU * innerH;
      const labelX = pad + groupW * i + groupW / 2;
      const liveLabel = b.liveId.length > 12 ? `${b.liveId.slice(0, 11)}…` : b.liveId;
      return `<rect x="${xBase.toFixed(1)}" y="${(pad + innerH - hC).toFixed(1)}" width="${barW}" height="${hC.toFixed(1)}" fill="#3b82f6" opacity="0.85"><title>${b.liveId}: ${b.totalComments}コメ / ${b.durationMin}分</title></rect>
<rect x="${(xBase + barW + 2).toFixed(1)}" y="${(pad + innerH - hU).toFixed(1)}" width="${barW}" height="${hU.toFixed(1)}" fill="#22c55e" opacity="0.85"><title>${b.liveId}: ${b.uniqueUsers}人</title></rect>
<text x="${labelX.toFixed(1)}" y="${H - 4}" text-anchor="middle" class="mkt-axis">${escapeHtml(liveLabel)}</text>`;
    }).join("");
    return `<section class="mkt-section" id="mkt-recent-cmp">
<h2>直近 ${n} 配信の比較 <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">青＝総コメ数、緑＝ユニークコメンター数。古→新で左から並びます。</p>
<div class="mkt-chart-wrap">
<svg viewBox="0 0 ${W} ${H}" class="mkt-svg">
<rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="none" stroke="#334155" stroke-width="0.5"/>
${bars}
</svg>
</div></section>`;
  }
  function sectionWeekdayHourHeatmap(heat) {
    if (!heat || heat.maxValue === 0) return "";
    const dayLabels = ["日", "月", "火", "水", "木", "金", "土"];
    const cells = heat.matrix.map((row, dow) => {
      const tds = row.map((v, h) => {
        const intensity = heat.maxValue > 0 ? v / heat.maxValue : 0;
        const bg = `rgba(59, 130, 246, ${intensity.toFixed(2)})`;
        return `<td class="mkt-heat-cell" style="background:${bg}" title="${dayLabels[dow]}曜 ${h}時: ${v}件">${v > 0 ? v : ""}</td>`;
      }).join("");
      return `<tr><th>${dayLabels[dow]}</th>${tds}</tr>`;
    }).join("");
    const hourCols = Array.from({ length: 24 }, (_, h) => `<th>${h}</th>`).join("");
    return `<section class="mkt-section" id="mkt-weekday-heat">
<h2>曜日 × 時間帯 ヒートマップ <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">過去全配信を横断したコメ密度。最も濃い時間帯がアクティブな視聴者層の活動時間。</p>
<div class="mkt-chart-wrap">
<table class="mkt-rank mkt-heatmap">
<thead><tr><th></th>${hourCols}</tr></thead>
<tbody>${cells}</tbody>
</table>
</div></section>`;
  }
  function sectionGrowthMeter(growth, label) {
    if (!growth || growth.average == null) return "";
    const deltaPct = growth.deltaPct != null ? `${(growth.deltaPct * 100).toFixed(1)}%` : "-";
    const z = growth.zScore != null ? growth.zScore.toFixed(2) : "-";
    const sign = growth.deltaPct != null && growth.deltaPct > 0 ? "＋" : "";
    return `<section class="mkt-section" id="mkt-growth-meter">
<h2>成長メーター <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">${escapeHtml(label)}：過去配信の平均（${growth.average}）と比べて<strong>${sign}${escapeHtml(deltaPct)}</strong>（z-score=${escapeHtml(z)}）。</p>
<table class="mkt-rank">
<thead><tr><th>指標</th><th>値</th></tr></thead>
<tbody>
<tr><th>過去平均</th><td>${growth.average}</td></tr>
<tr><th>標準偏差</th><td>${growth.stdDev}</td></tr>
<tr><th>偏差（%）</th><td>${escapeHtml(deltaPct)}</td></tr>
<tr><th>z-score</th><td>${escapeHtml(z)}</td></tr>
</tbody>
</table>
</section>`;
  }
  function sectionOpeningFivePrediction(pts) {
    if (!pts || pts.points.length < 2) return "";
    const W = 600;
    const H = 240;
    const pad = 40;
    const innerW = W - pad * 2;
    const innerH = H - pad * 2;
    const maxX = Math.max(1, ...pts.points.map((p) => p.openingCpm));
    const maxY = Math.max(1, ...pts.points.map((p) => p.peakCpm));
    const xOf = (v) => pad + innerW * v / maxX;
    const yOf = (v) => pad + innerH - innerH * v / maxY;
    const dots = pts.points.map(
      (p) => `<circle cx="${xOf(p.openingCpm).toFixed(1)}" cy="${yOf(p.peakCpm).toFixed(1)}" r="4" fill="#a855f7" opacity="0.7"><title>${p.liveId}: 冒頭 ${p.openingCpm} CPM → ピーク ${p.peakCpm} CPM</title></circle>`
    ).join("");
    const corrLabel = pts.correlation != null ? `相関係数 r=${pts.correlation.toFixed(2)}（${pts.correlation > 0.5 ? "強い正の相関" : pts.correlation > 0.2 ? "弱い正の相関" : "相関弱"}）` : "相関は要件不足";
    return `<section class="mkt-section" id="mkt-opening-five">
<h2>冒頭 5 分の予兆 → ピーク（ラテラル L13）<span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">横軸＝冒頭 5 分の CPM、縦軸＝全体ピーク CPM。${escapeHtml(corrLabel)}。配信開始 5 分の盛り上がりが結果に効くかの仮説検証。</p>
<div class="mkt-chart-wrap">
<svg viewBox="0 0 ${W} ${H}" class="mkt-svg">
<rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="none" stroke="#334155" stroke-width="0.5"/>
<text x="${(W / 2).toFixed(0)}" y="${H - 4}" text-anchor="middle" class="mkt-axis">冒頭 5 分の CPM</text>
<text x="12" y="${(H / 2).toFixed(0)}" text-anchor="middle" class="mkt-axis" transform="rotate(-90, 12, ${(H / 2).toFixed(0)})">ピーク CPM</text>
${dots}
</svg>
</div></section>`;
  }
  function sectionWaveformSimilarity(similar) {
    if (!Array.isArray(similar) || similar.length === 0) return "";
    const rows = similar.map(
      (s, i) => `<tr>
<td>${i + 1}</td>
<td class="mkt-mono">${escapeHtml(s.liveId)}</td>
<td>${(s.similarity * 100).toFixed(1)}%</td>
<td>${s.totalCount}</td>
</tr>`
    ).join("");
    return `<section class="mkt-section" id="mkt-waveform">
<h2>似てる配信（コメ波形指紋）<span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">CPM カーブを 16 次元ベクトルにしてコサイン類似度で比較（ラテラル分析 L3）。盛り上がり方の "形" が今回と似ている過去配信。</p>
<table class="mkt-rank">
<thead><tr><th>#</th><th>liveId</th><th>類似度</th><th>総コメ</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</section>`;
  }
  function sectionEchoBursts(propagation, sync) {
    if ((!propagation || propagation.length === 0) && (!sync || sync.length === 0)) return "";
    const propRows = (propagation || []).slice(0, 10).map(
      (b, i) => `<tr>
<td>${i + 1}</td>
<td class="mkt-mono">${escapeHtml(b.text)}</td>
<td>${b.userCount}</td>
<td>${b.commentCount}</td>
<td>${Math.round((b.lastAt - b.firstAt) / 1e3)}秒</td>
</tr>`
    ).join("");
    const syncRows = (sync || []).slice(0, 10).map(
      (b, i) => `<tr>
<td>${i + 1}</td>
<td class="mkt-mono">${escapeHtml(b.text)}</td>
<td>${b.userCount}</td>
<td>${b.commentCount}</td>
</tr>`
    ).join("");
    return `<section class="mkt-section" id="mkt-echo">
<h2>コメ伝染 × コメ被り <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">短時間に同じ語が複数ユーザーから出る瞬間を 2 通りの粒度で検出（ラテラル分析 L1 / L5）。</p>
${propRows ? `<h3 style="font-size:.95rem;margin:.6rem 0 .4rem">伝染（30秒窓・3名以上、L1）</h3>
<table class="mkt-rank">
<thead><tr><th>#</th><th>語</th><th>ユーザー数</th><th>件数</th><th>持続</th></tr></thead>
<tbody>${propRows}</tbody>
</table>` : ""}
${syncRows ? `<h3 style="font-size:.95rem;margin:.8rem 0 .4rem">被り瞬間（5秒窓・3名以上、L5）</h3>
<table class="mkt-rank">
<thead><tr><th>#</th><th>語</th><th>ユーザー数</th><th>件数</th></tr></thead>
<tbody>${syncRows}</tbody>
</table>` : ""}
</section>`;
  }
  function sectionFirstSecondLatency(latency) {
    if (!latency || latency.totalUsers === 0) return "";
    const max = Math.max(1, ...Object.values(latency.distribution));
    const labels = Object.keys(latency.distribution);
    const rows = labels.map((k) => {
      const v = latency.distribution[k];
      const w = Math.round(v / max * 100);
      return `<tr>
<th>${escapeHtml(k)}</th>
<td><div class="mkt-bar"><span class="mkt-bar__fill" style="width:${w}%;background:#0ea5e9"></span></div></td>
<td>${v}</td>
</tr>`;
    }).join("");
    return `<section class="mkt-section" id="mkt-first-second">
<h2>初コメ → 2 コメ目 latency <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">2 コメ目を打ったユーザー ${latency.totalUsers} 名の「最初のコメから 2 コメ目までの間隔」分布（ラテラル分析 L6）。短いほど "乗ってきた" 派、長いほど "様子見" 派。</p>
<table class="mkt-rank">
<thead><tr><th>区間</th><th>分布</th><th>件数</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</section>`;
  }
  function sectionTalentPeak(moments) {
    if (!Array.isArray(moments) || moments.length === 0) return "";
    const rows = moments.slice(0, 10).map(
      (m, i) => `<tr>
<td>${i + 1}</td>
<td>${Math.round(m.silenceMs / 1e3)}秒</td>
<td>${m.afterCount}</td>
</tr>`
    ).join("");
    return `<section class="mkt-section" id="mkt-talent-peak">
<h2>配信者の話芸ピーク <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">沈黙（60秒以上）→ 30秒以内に 5+ コメ反応 = 配信者の話芸／リアクション要素が即効性を出した瞬間（ラテラル分析 L10）。${moments.length} 件検出。</p>
<table class="mkt-rank">
<thead><tr><th>#</th><th>沈黙の長さ</th><th>沈黙明け 30秒の反応コメ数</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</section>`;
  }
  function sectionSentimentCurve(sentiment) {
    if (!sentiment || sentiment.buckets.length < 2) return "";
    const W = 900;
    const H = 200;
    const pad = 36;
    const innerW = W - pad * 2;
    const innerH = H - pad * 2;
    const n = sentiment.buckets.length;
    const maxV = Math.max(
      1,
      ...sentiment.buckets.flatMap((b) => [b.positive, b.negative, b.surprise, b.confusion])
    );
    const xOf = (i) => pad + innerW * i / Math.max(1, n - 1);
    const yOf = (v) => pad + innerH - innerH * v / maxV;
    const lineFor = (key, color) => {
      const pts = sentiment.buckets.map((b, i) => `${xOf(i).toFixed(1)},${yOf(b[key]).toFixed(1)}`).join(" ");
      return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2"/>`;
    };
    return `<section class="mkt-section" id="mkt-sentiment">
<h2>感情曲線 <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">語彙辞書ベースで「ポジ／ネガ／驚き／困惑」を 1 分粒度で時系列表示（ラテラル分析 L11）。総計：ポジ ${sentiment.totals.positive} / ネガ ${sentiment.totals.negative} / 驚き ${sentiment.totals.surprise} / 困惑 ${sentiment.totals.confusion}。</p>
<div class="mkt-chart-wrap">
<svg viewBox="0 0 ${W} ${H}" class="mkt-svg">
<rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="none" stroke="#334155" stroke-width="0.5"/>
${lineFor("positive", "#22c55e")}
${lineFor("negative", "#ef4444")}
${lineFor("surprise", "#fbbf24")}
${lineFor("confusion", "#94a3b8")}
</svg>
</div>
<div class="mkt-seg-legend">
<span class="mkt-leg"><span class="mkt-leg__dot" style="background:#22c55e"></span>ポジティブ</span>
<span class="mkt-leg"><span class="mkt-leg__dot" style="background:#ef4444"></span>ネガティブ</span>
<span class="mkt-leg"><span class="mkt-leg__dot" style="background:#fbbf24"></span>驚き</span>
<span class="mkt-leg"><span class="mkt-leg__dot" style="background:#94a3b8"></span>困惑</span>
</div></section>`;
  }
  function sectionUniqueWordSuggestions(suggestions) {
    if (!Array.isArray(suggestions) || suggestions.length === 0) return "";
    const rows = suggestions.map(
      (s, i) => `<tr>
<td>${i + 1}</td>
<td class="mkt-mono">${escapeHtml(s.word)}</td>
<td>${s.count}</td>
</tr>`
    ).join("");
    return `<section class="mkt-section" id="mkt-unique-words">
<h2>視聴者発の人気語 TOP <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">配信全体でよく使われ、あなたのコメントと重なっていない視聴者側の言葉（ラテラル分析 L14）。次回の話題づくりヒント。</p>
<table class="mkt-rank">
<thead><tr><th>#</th><th>語</th><th>出現回数</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</section>`;
  }
  function sectionReachCoefficient(reach) {
    if (!reach || reach.coefficient == null) return "";
    return `<section class="mkt-section" id="mkt-reach">
<h2>リーチ係数（同接 / コメンター比）<span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">「現在の同接 ÷ 直近 5 分のユニークコメンター数」= 1 コメンターあたりの観戦者比率（ラテラル分析 L15）。</p>
<div class="mkt-kpi-grid"><div class="mkt-kpi"><span class="mkt-kpi__icon">📡</span><span class="mkt-kpi__val">${reach.coefficient.toFixed(2)}</span><span class="mkt-kpi__label">リーチ係数</span></div></div>
</section>`;
  }
  function wrapThumbWithProfileLink(userId, innerHtml, maskShare = false) {
    const uid = String(userId == null ? "" : userId).trim();
    if (maskShare || !/^\d{1,18}$/.test(uid)) return innerHtml;
    return `<a href="https://www.nicovideo.jp/user/${encodeURIComponent(uid)}" target="_blank" rel="noopener noreferrer" class="nl-user-thumb-link">${innerHtml}</a>`;
  }
  function sectionAdObserved(obs, adRows, maskShare, identiconResolver = void 0) {
    if (!obs || typeof obs !== "object") return "";
    const entries = Object.entries(obs).filter(([uid, e]) => /^\d+$/.test(uid) && e && Number(e.firstAt) > 0);
    if (!entries.length) return "";
    const rowByUid = /* @__PURE__ */ new Map();
    for (const row of adRows || []) {
      const u = adRowUid(row);
      if (u && !rowByUid.has(u)) rowByUid.set(u, row);
    }
    entries.sort((a, b) => Number(b[1].lastAt || 0) - Number(a[1].lastAt || 0) || Number(a[1].firstAt) - Number(b[1].firstAt));
    const SHOW = 15;
    const items = entries.slice(0, SHOW).map(([uid, e]) => {
      const row = rowByUid.get(uid);
      const rawLabel = row && String(row.name || "").trim() ? String(row.name).trim() : `ID ${uid}`;
      const nameHtml = maskShare ? escapeHtml(maskLabelForShare(rawLabel)) : buildUserProfileLinkedLabelHtml(uid, rawLabel);
      const thumbSrc = maskShare ? "" : resolveReportUserThumbSrc({ userId: uid, avatarUrl: row && row.thumbnailUrl ? String(row.thumbnailUrl) : "", identiconResolver });
      const thumbImg = thumbSrc ? `<img class="mkt-gift-thumb" src="${escapeHtml(thumbSrc)}" alt="" width="28" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${DEFAULT_USERICON_ONERROR_ATTR}>` : '<span class="mkt-gift-thumb mkt-gift-thumb--empty"></span>';
      const thumbCell = wrapThumbWithProfileLink(uid, thumbImg, maskShare);
      const last = Number(e.lastAt) > 0 ? `最後に増えたのを検知 ${escapeHtml(giftMomentClock(Number(e.lastAt)))}・+${escapeHtml(formatEventRankingNumber(Number(e.lastDelta) || 0))}pt(増加を検知した回数 ${escapeHtml(String(Number(e.n) || 0))}回)` : "増えたのは未検知";
      return `<li class="mkt-ad-obs-item">${thumbCell}<span class="mkt-gm-sender">${nameHtml}</span><span class="mkt-ad-obs-text">初めて検知 ${escapeHtml(giftMomentClock(Number(e.firstAt)))}・そのとき ${escapeHtml(formatEventRankingNumber(Number(e.firstTotal) || 0))}pt ／ ${last}・いま ${escapeHtml(formatEventRankingNumber(Number(e.lastTotal) || 0))}pt</span></li>`;
    }).join("");
    const more = entries.length > SHOW ? `<p class="mkt-note">ほか ${entries.length - SHOW}社は載せていません。</p>` : "";
    return `<section class="mkt-section mkt-ad-observed"><h2>広告の気づいた時刻</h2>
<p class="mkt-note">公式の広告データは、人ごとの合計ptだけで、いつ入れたかの時刻はありません。この章の時刻は、拡張が約25〜30秒ごとに合計を見て、増えたのに気づいた時刻です(公式の時刻ではありません)。</p>
<ul class="mkt-ad-obs-list">${items}</ul>${more}
<p class="mkt-note">拡張が気づいた時刻です(最大約30秒の誤差があり、拡張を開く前に入った分は分かりません)。</p></section>`;
  }
  function giftMomentClock(ms) {
    const d = new Date(ms);
    const p2 = (n) => String(n).padStart(2, "0");
    return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
  }
  function sectionGiftMoments(analysis, nextLines, maskShare, identiconResolver = void 0) {
    if (!analysis || analysis.hasHistory !== true) return "";
    const head = `<h2>ギフトの瞬間</h2>
<p class="mkt-note">ギフトが飛んだ時刻の前5分と後5分で、コメントと同時接続がどう動いたかを並べます。</p>`;
    const notesHtml = analysis.notes.length ? `<ul class="mkt-gm-notes">${analysis.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>` : "";
    if (!analysis.axisOk || analysis.moments.length === 0) {
      return `<section class="mkt-section mkt-gift-moments">${head}${notesHtml}</section>`;
    }
    const sm = analysis.summary;
    const summaryLine = sm.k != null && sm.medianDelta != null ? `ギフトの瞬間 ${analysis.moments.length}件のうち、前後の窓がそろう ${sm.n}件で、後5分のコメントが前5分より増えたのは ${sm.k}件(後−前の中央値 ${sm.medianDelta >= 0 ? "+" : ""}${sm.medianDelta}件)でした。` : `ギフトの瞬間は ${analysis.moments.length}件でした。`;
    const SHOW = 12;
    const cards = analysis.moments.slice(0, SHOW).map((m) => {
      const giftLines = m.gifts.map((g) => {
        const rawLabel = g.userId && /^\d+$/.test(g.userId) ? displayUserLabel(g.userId, g.senderName) : g.senderName || "名無し";
        const nameHtml = maskShare ? escapeHtml(maskLabelForShare(rawLabel)) : g.userId && /^\d+$/.test(g.userId) ? buildUserProfileLinkedLabelHtml(g.userId, rawLabel) : escapeHtml(rawLabel);
        const thumbSrc = maskShare ? "" : resolveReportUserThumbSrc({ userId: g.userId || "", avatarUrl: g.avatarUrl || "", identiconResolver });
        const thumbImg = thumbSrc ? `<img class="mkt-gift-thumb" src="${escapeHtml(thumbSrc)}" alt="" width="28" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${DEFAULT_USERICON_ONERROR_ATTR}>` : '<span class="mkt-gift-thumb mkt-gift-thumb--empty"></span>';
        const thumbCell = wrapThumbWithProfileLink(g.userId, thumbImg, maskShare);
        return `<li class="mkt-gm-gift">${thumbCell}<span class="mkt-gm-sender">${nameHtml}</span><span class="mkt-gm-item">${escapeHtml(g.itemName || "(名称未取得)")}</span><span class="mkt-gm-pt">${escapeHtml(formatEventRankingNumber(g.points))}pt</span></li>`;
      }).join("");
      const bC = m.before.comments;
      const aC = m.after.comments;
      const diff = aC - bC;
      const diffTxt = `${diff >= 0 ? "+" : ""}${diff}`;
      const viewers = m.viewers ? `<span class="mkt-gm-viewers">同接 ${escapeHtml(formatEventRankingNumber(m.viewers.before))}→${escapeHtml(formatEventRankingNumber(m.viewers.after))}(${m.viewers.diff >= 0 ? "+" : ""}${escapeHtml(formatEventRankingNumber(m.viewers.diff))}・${m.viewers.kind === "official" ? "公式" : m.viewers.kind === "estimated" ? "推定" : "公式/推定"})</span>` : '<span class="mkt-gm-viewers mkt-gm-viewers--none">同接 —</span>';
      const topics = !maskShare && m.topics.length ? `<div class="mkt-gm-topics">この10分に多かった話題: ${m.topics.map((t) => escapeHtml(t)).join("・")}</div>` : "";
      const badges = [
        m.chain ? '<span class="mkt-gm-badge">連鎖</span>' : "",
        m.fullWindow ? "" : '<span class="mkt-gm-badge mkt-gm-badge--warn">窓が足りない</span>'
      ].join("");
      return `<div class="mkt-gm-card">
<div class="mkt-gm-time">${escapeHtml(giftMomentClock(m.startAt))}${m.chain ? `〜${escapeHtml(giftMomentClock(m.endAt))}` : ""} ${badges}</div>
<ul class="mkt-gm-gifts">${giftLines}</ul>
<div class="mkt-gm-delta">前5分 <strong>${bC}</strong>件 → 後5分 <strong>${aC}</strong>件(${escapeHtml(diffTxt)}) ${viewers}</div>
${topics}
</div>`;
    }).join("");
    const more = analysis.moments.length > SHOW ? `<p class="mkt-note">ほか ${analysis.moments.length - SHOW}件の瞬間は、台帳(ギフト投げ履歴)を見てください。</p>` : "";
    const nextHtml = nextLines.length ? `<div class="mkt-gm-next"><h3>次回に試すこと</h3><ul>${nextLines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul></div>` : "";
    return `<section class="mkt-section mkt-gift-moments">${head}<p class="mkt-gm-summary">${escapeHtml(summaryLine)}</p>
<div class="mkt-gm-cards">${cards}</div>${more}${notesHtml}${nextHtml}</section>`;
  }
  function sectionGiftMomentum(analysis, maskShare, identiconResolver = void 0) {
    if (!analysis || analysis.hasSignals !== true) return "";
    const cards = [
      {
        label: "送り主",
        value: `${analysis.totals.senderCount}名`,
        hint: "ギフト・履歴・ランキングから見えた人数"
      },
      {
        label: "代表pt",
        value: analysis.totals.totalPoints > 0 ? `${formatEventRankingNumber(analysis.totals.totalPoints)}pt` : "pt未取得",
        hint: "重複を避けるため送り主別の最大値を採用"
      },
      {
        label: "公式ギフト累計",
        value: analysis.totals.officialGiftPoints > 0 ? `${formatEventRankingNumber(analysis.totals.officialGiftPoints)}pt` : "未取得",
        hint: "番組統計メニュー由来"
      },
      {
        label: "時刻つきギフト",
        value: `${analysis.totals.exactEventCount}件`,
        hint: analysis.totals.approxEventCount > 0 ? `近似時刻 ${analysis.totals.approxEventCount}件も参照` : "ライブ受信イベント由来"
      }
    ];
    const cardHtml = cards.map(
      (c) => `<div class="mkt-gift-card">
<span class="mkt-gift-card__label">${escapeHtml(c.label)}</span>
<strong class="mkt-gift-card__value">${escapeHtml(c.value)}</strong>
<span class="mkt-gift-card__hint">${escapeHtml(c.hint)}</span>
</div>`
    ).join("");
    const insightHtml = analysis.insightLines.length ? `<ul class="mkt-insight-list">${analysis.insightLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : '<p class="mkt-note">ギフトの傾向はまだ薄めです。コメントの山や同接推移とあわせて見てください。</p>';
    const senderRows = analysis.senderRows.slice(0, 10).map((row, i) => {
      const rawLabel = row.userId && /^\d+$/.test(row.userId) ? displayUserLabel(row.userId, row.label) : row.label;
      const nameHtml = maskShare ? escapeHtml(maskLabelForShare(rawLabel)) : row.userId && /^\d+$/.test(row.userId) ? buildUserProfileLinkedLabelHtml(row.userId, rawLabel) : escapeHtml(rawLabel);
      const points = row.totalPoints > 0 ? `${formatEventRankingNumber(row.totalPoints)}pt` : "—";
      const rank = row.rank != null ? `<span class="mkt-gift-rank">貢献度${row.rank}位</span>` : "";
      const thumbSrc = maskShare ? "" : resolveReportUserThumbSrc({
        userId: row.userId || "",
        avatarUrl: "",
        identiconResolver
      });
      const thumbImg = thumbSrc ? `<img class="mkt-gift-thumb" src="${escapeHtml(thumbSrc)}" alt="" width="28" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${DEFAULT_USERICON_ONERROR_ATTR}>` : '<span class="mkt-gift-thumb mkt-gift-thumb--empty"></span>';
      const thumbCell = wrapThumbWithProfileLink(row.userId, thumbImg, maskShare);
      return `<tr>
<td data-label="#">${i + 1}</td>
<td data-label="サムネ">${thumbCell}</td>
<td data-label="送り主" class="mkt-gift-sender">${nameHtml}${rank}</td>
<td data-label="タイプ"><span class="mkt-gift-type">${escapeHtml(row.typeLabel)}</span></td>
<td data-label="pt" class="mkt-num">${escapeHtml(points)}</td>
<td data-label="投げ">${row.throwCount || "—"}</td>
<td data-label="コメント">${row.commentCount}</td>
<td data-label="根拠" class="mkt-gift-evidence">${escapeHtml(row.evidence)}</td>
</tr>`;
    }).join("");
    const senderTable = senderRows ? `<div class="mkt-table-scroll"><table class="mkt-rank mkt-gift-table">
<thead><tr><th>#</th><th>サムネ</th><th>送り主</th><th>タイプ</th><th>pt</th><th>投げ</th><th>コメント</th><th>根拠</th></tr></thead>
<tbody>${senderRows}</tbody>
</table></div>` : '<p class="mkt-note">送り主別の行はまだ作れません。</p>';
    const timingHtml = analysis.timingWindows.length ? `<div class="mkt-gift-window-grid">${analysis.timingWindows.map((w) => {
      const points = w.totalPoints > 0 ? `${formatEventRankingNumber(w.totalPoints)}pt` : "pt未取得";
      const words = w.topWords.length ? w.topWords.map((word) => `<span class="mkt-gift-word">${escapeHtml(word)}</span>`).join("") : '<span class="mkt-gift-word mkt-gift-word--muted">目立つ語は少なめ</span>';
      const source = w.source === "exact" ? "時刻: ライブ受信" : "時刻: 近似";
      return `<article class="mkt-gift-window">
<div class="mkt-gift-window__head">
<strong>${escapeHtml(w.label)}</strong>
<span>${escapeHtml(w.flowLabel)}</span>
</div>
<dl class="mkt-gift-window__stats">
<div><dt>ギフト</dt><dd>${w.giftCount}件 / ${escapeHtml(points)}</dd></div>
<div><dt>送り主</dt><dd>${w.senderCount}名</dd></div>
<div><dt>前後コメント</dt><dd>前 ${w.beforeCommentCount} / 後 ${w.afterCommentCount}</dd></div>
</dl>
<p class="mkt-gift-window__sample">代表: ${escapeHtml(w.sampleGiftLabel)}</p>
<div class="mkt-gift-words">${words}</div>
<p class="mkt-gift-window__source">${escapeHtml(source)}</p>
</article>`;
    }).join("")}</div>` : '<p class="mkt-note">時刻つきのギフトが少ないため、タイミング分析は省略しています。</p>';
    const notes = analysis.dataNotes.length ? `<ul class="mkt-gift-notes">${analysis.dataNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : "";
    return `<section class="mkt-section mkt-section--gift-deep" id="mkt-gift-deep">
<h2>ギフト深掘り（誰が・いつ・どんな流れで）</h2>
<p class="mkt-note">手元に残ったギフト・公式履歴・貢献度ランキングをまとめ、送り主のタイプとギフトが飛んだ前後のコメント量を見ます。</p>
<div class="mkt-gift-card-grid">${cardHtml}</div>
${insightHtml}
<h3 class="mkt-subhead">たくさんギフトが飛ぶ人の傾向</h3>
${senderTable}
<h3 class="mkt-subhead">ギフトが飛んだタイミング</h3>
${timingHtml}
${notes}
</section>`;
  }
  function giftLedgerSenderBarChartHtml(aggregates, maskShare, identiconResolver = void 0) {
    if (!Array.isArray(aggregates) || !aggregates.length) return "";
    const max = Math.max(1, ...aggregates.map((s) => s.totalPoints));
    const rows = aggregates.slice(0, 12).map((s) => {
      const w = Math.round(s.totalPoints / max * 100);
      const idCells = giftLedgerUserIdentityCells(s, maskShare, identiconResolver);
      const uid = String(s.userId || "").trim();
      const subParts = [
        uid && /^\d{1,18}$/.test(uid) ? `ID ${uid}` : "",
        `${s.throwCount}投`
      ].filter(Boolean);
      const sub = subParts.length ? `<span class="mkt-gift-chart__sub">${escapeHtml(subParts.join(" · "))}</span>` : "";
      return `<tr>
<th class="mkt-gift-chart__label"><div class="mkt-gift-chart__identity">${idCells.thumbCell}<span class="mkt-gift-chart__name">${idCells.accountHtml}${sub}</span></div></th>
<td><div class="mkt-bar"><span class="mkt-bar__fill" style="width:${w}%;background:#f59e0b"></span></div></td>
<td class="mkt-num">${escapeHtml(formatEventRankingNumber(s.totalPoints))} pt</td>
</tr>`;
    }).join("");
    return `<div class="mkt-chart-wrap mkt-gift-chart">
<table class="mkt-rank mkt-gift-chart-table mkt-gift-chart-table--sender">
<thead><tr><th>アカウント</th><th>グラフ</th><th>合計</th></tr></thead>
<tbody>${rows}</tbody>
</table></div>`;
  }
  function giftLedgerItemThumbHtml(thumbnailUrl, maskShare, size = 28) {
    const src = maskShare ? "" : String(thumbnailUrl || "").trim();
    if (src) {
      return `<img class="mkt-gift-ledger-item__thumb" src="${escapeHtml(src)}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${DEFAULT_USERICON_ONERROR_ATTR}>`;
    }
    return `<span class="mkt-gift-ledger-item__thumb mkt-gift-ledger-item__thumb--empty" style="width:${size}px;height:${size}px"></span>`;
  }
  function giftLedgerItemBarChartHtml(aggregates, maskShare) {
    if (!Array.isArray(aggregates) || !aggregates.length) return "";
    const max = Math.max(1, ...aggregates.map((it) => it.points));
    const rows = aggregates.slice(0, 12).map((it) => {
      const w = Math.round(it.points / max * 100);
      const thumb = giftLedgerItemThumbHtml(it.thumbnailUrl, maskShare, 28);
      return `<tr>
<th class="mkt-gift-chart__label"><div class="mkt-gift-chart__identity">${thumb}<span class="mkt-gift-chart__name"><span class="mkt-gift-chart__item-name">${escapeHtml(it.itemName)}</span><span class="mkt-gift-chart__sub">×${escapeHtml(formatEventRankingNumber(it.count))}</span></span></div></th>
<td><div class="mkt-bar"><span class="mkt-bar__fill" style="width:${w}%;background:#fb923c"></span></div></td>
<td class="mkt-num">${escapeHtml(formatEventRankingNumber(it.points))} pt</td>
</tr>`;
    }).join("");
    return `<div class="mkt-chart-wrap mkt-gift-chart">
<table class="mkt-rank mkt-gift-chart-table mkt-gift-chart-table--item">
<thead><tr><th>アイテム</th><th>グラフ</th><th>合計</th></tr></thead>
<tbody>${rows}</tbody>
</table></div>`;
  }
  function giftLedgerUserIdentityCells(identity, maskShare, identiconResolver = void 0) {
    const uid = String(identity.userId || "").trim();
    const rawLabel = uid && /^\d{1,18}$/.test(uid) ? displayUserLabel(uid, identity.senderLabel || "") : String(identity.senderLabel || "").trim() || "（不明）";
    const accountHtml = maskShare ? escapeHtml(maskLabelForShare(rawLabel)) : uid && /^\d{1,18}$/.test(uid) ? buildUserProfileLinkedLabelHtml(uid, rawLabel) : escapeHtml(rawLabel);
    const thumbSrc = maskShare ? "" : resolveReportUserThumbSrc({
      userId: uid,
      avatarUrl: String(identity.senderAvatarUrl || "").trim(),
      identiconResolver
    });
    const thumbInner = thumbSrc ? `<img class="mkt-gift-thumb" src="${escapeHtml(thumbSrc)}" alt="" width="28" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${DEFAULT_USERICON_ONERROR_ATTR}>` : '<span class="mkt-gift-thumb mkt-gift-thumb--empty"></span>';
    const thumbCell = wrapThumbWithProfileLink(uid, thumbInner, maskShare);
    const idInner = maskShare || !uid ? escapeHtml(maskShare ? "—" : uid || "—") : /^\d{1,18}$/.test(uid) ? buildUserProfileLinkedLabelHtml(uid, uid) : escapeHtml(uid);
    const idHtml = `<span class="mkt-mono">${idInner}</span>`;
    return { thumbCell, accountHtml, idHtml };
  }
  function sectionGiftThrowLedger(ledger, maskShare, identiconResolver = void 0) {
    if (!ledger || !ledger.rows.length && !ledger.itemAggregates.length) {
      return `<section class="mkt-section mkt-section--gift-ledger" id="mkt-gift-ledger">
<h2>ギフト投げ履歴（誰が・何を・いくら）</h2>
<p class="mkt-note">${escapeHtml(ledger?.sourceNotes?.[0] || "ギフト履歴がありません。マーケ DL 時に koken 公式 API で一括取得します（「履歴」タブを開かなくても可）。配信ページを開いた状態で再 DL してください。")}</p>
</section>`;
    }
    const summaryBits = [
      ledger.totalThrows > 0 ? `投げ ${formatEventRankingNumber(ledger.totalThrows)} 件` : "",
      ledger.totalPoints > 0 ? `合計 ${formatEventRankingNumber(ledger.totalPoints)} pt` : "",
      ledger.uniqueSenders > 0 ? `送り主 ${formatEventRankingNumber(ledger.uniqueSenders)} 名` : ""
    ].filter(Boolean);
    const senderChartHtml = giftLedgerSenderBarChartHtml(
      ledger.senderAggregates || [],
      maskShare,
      identiconResolver
    );
    const itemChartHtml = giftLedgerItemBarChartHtml(ledger.itemAggregates || [], maskShare);
    const senderRows = (ledger.senderAggregates || []).map((row, i) => {
      const idCells = giftLedgerUserIdentityCells(row, maskShare, identiconResolver);
      const itemsHtml = (row.items || []).map((it) => {
        const itemThumb = giftLedgerItemThumbHtml(it.thumbnailUrl, maskShare, 24);
        return `<li class="mkt-gift-sender-item">${itemThumb}<span class="mkt-gift-sender-item__name">${escapeHtml(it.itemName)}</span> <strong>×${it.throwCount}</strong> <span class="mkt-gift-sender-item__pt">${escapeHtml(formatEventRankingNumber(it.totalPoints))} pt</span></li>`;
      }).join("");
      return `<tr>
<td data-label="#">${i + 1}</td>
<td data-label="サムネ">${idCells.thumbCell}</td>
<td data-label="アカウント" class="mkt-gift-sender">${idCells.accountHtml}</td>
<td data-label="ID">${idCells.idHtml}</td>
<td data-label="投げたアイテム"><ul class="mkt-gift-sender-items">${itemsHtml}</ul></td>
<td data-label="回数" class="mkt-num">${escapeHtml(formatEventRankingNumber(row.throwCount))}</td>
<td data-label="合計pt" class="mkt-num">${escapeHtml(formatEventRankingNumber(row.totalPoints))} pt</td>
</tr>`;
    }).join("");
    const senderSection = senderRows.length > 0 ? `<h3 class="mkt-subhead">送り主別（誰が・何を・合計いくら）</h3>
<p class="mkt-note">送り主ごとに、よく投げたアイテムと回数・pt をまとめています。ニコ生の匿名ギフトは「名無し」にまとまることがあります。</p>
<p class="mkt-spec-note">※ 表示名・サムネは取得時点のもの。数値 ID はクリックでユーザーページへ移動します。</p>
<div class="mkt-table-scroll"><table class="mkt-rank mkt-gift-sender-table">
<thead><tr><th>#</th><th>サムネ</th><th>アカウント</th><th>ID</th><th>投げたアイテム</th><th>回数</th><th>合計pt</th></tr></thead>
<tbody>${senderRows}</tbody>
</table></div>` : "";
    const itemChips = ledger.itemAggregates.length ? `<div class="mkt-gift-ledger-items">${ledger.itemAggregates.map((row) => {
      const thumb = row.thumbnailUrl ? `<img class="mkt-gift-ledger-item__thumb" src="${escapeHtml(row.thumbnailUrl)}" alt="" width="32" height="32" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${DEFAULT_USERICON_ONERROR_ATTR}>` : '<span class="mkt-gift-ledger-item__thumb mkt-gift-ledger-item__thumb--empty"></span>';
      const ptNote = row.points > 0 ? ` / ${escapeHtml(formatEventRankingNumber(row.points))}pt` : "";
      return `<span class="mkt-gift-ledger-item">${thumb}<span class="mkt-gift-ledger-item__name">${escapeHtml(row.itemName)}</span><strong>×${row.count}</strong>${ptNote}</span>`;
    }).join("")}</div>` : "";
    const tableRows = ledger.rows.map((row, i) => {
      const idCells = giftLedgerUserIdentityCells(row, maskShare, identiconResolver);
      const itemThumbSrc = maskShare ? "" : String(row.thumbnailUrl || "").trim();
      const itemThumbInner = itemThumbSrc ? `<img class="mkt-gift-ledger-row__thumb" src="${escapeHtml(itemThumbSrc)}" alt="" width="28" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${DEFAULT_USERICON_ONERROR_ATTR}>` : '<span class="mkt-gift-ledger-row__thumb mkt-gift-ledger-row__thumb--empty"></span>';
      const points = `${formatEventRankingNumber(row.points)} pt`;
      return `<tr>
<td data-label="#">${i + 1}</td>
<td data-label="時刻" class="mkt-gift-ledger-time">${escapeHtml(row.timeLabel)}</td>
<td data-label="アイテム" class="mkt-gift-ledger-itemcell">${itemThumbInner}<span>${escapeHtml(row.itemName)}</span></td>
<td data-label="サムネ">${idCells.thumbCell}</td>
<td data-label="アカウント" class="mkt-gift-sender">${idCells.accountHtml}</td>
<td data-label="ID">${idCells.idHtml}</td>
<td data-label="pt" class="mkt-num">${escapeHtml(points)}</td>
<td data-label="出典" class="mkt-gift-evidence">${escapeHtml(row.source)}</td>
</tr>`;
    }).join("");
    const truncateNote = ledger.truncated ? `<p class="mkt-note">表示は新しい順に ${ledger.rows.length} 件まで（全 ${formatEventRankingNumber(ledger.totalThrows)} 件）。</p>` : "";
    const notes = ledger.sourceNotes.length ? `<ul class="mkt-gift-notes">${ledger.sourceNotes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>` : "";
    const chartsBlock = senderChartHtml || itemChartHtml ? `<div class="mkt-gift-ledger-charts">
${senderChartHtml ? `<h3 class="mkt-subhead">送り主別 pt（グラフ）</h3>${senderChartHtml}` : ""}
${itemChartHtml ? `<h3 class="mkt-subhead">アイテム別 pt（グラフ）</h3>${itemChartHtml}` : ""}
</div>` : "";
    return `<section class="mkt-section mkt-section--gift-ledger" id="mkt-gift-ledger">
<h2>ギフト投げ履歴（誰が・何を・いくら）</h2>
<p class="mkt-note">ニコ生の「この番組へのギフト履歴」に近い形で、送り主・アイテム・pt・時刻を一覧します。マーケ DL 時に <strong>koken 公式 API で一括取得</strong>し、サイドバー「履歴」タブの DOM 取得とマージします。${summaryBits.length ? ` <strong>${escapeHtml(summaryBits.join(" / "))}</strong>` : ""}</p>
<p class="mkt-spec-note">${escapeHtml(MARKETING_GIFT_LEDGER_DISPLAY_RULE_NOTE)} 台帳の投げ件数は <code>history</code> 行数が正本です（<code>totalCounts</code> はアイテム別回数の表示にのみ使用し、二重加算しません）。</p>
${chartsBlock}
${senderSection}
${itemChips ? `<h3 class="mkt-subhead">アイテム別の投げ数</h3>${itemChips}` : ""}
<h3 class="mkt-subhead">投げ一覧（新しい順）</h3>
${truncateNote}
<div class="mkt-table-scroll"><table class="mkt-rank mkt-gift-ledger-table">
<thead><tr><th>#</th><th>時刻</th><th>アイテム</th><th>サムネ</th><th>アカウント</th><th>ID</th><th>pt</th><th>出典</th></tr></thead>
<tbody>${tableRows}</tbody>
</table></div>
${notes}
</section>`;
  }
  function formatShortClock(ms) {
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "—";
    return new Date(ms).toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  function resolveParticipantPeople(r) {
    const rr = (
      /** @type {Record<string, any>} */
      r || {}
    );
    const people = typeof rr.identifiedUsers === "number" ? rr.identifiedUsers : Number(rr.uniqueUsers) || 0;
    const unattributed = Number(rr.unattributedComments) > 0 ? Math.floor(Number(rr.unattributedComments)) : 0;
    return { people, unattributed };
  }
  function resolveCommentParticipation(r, gap) {
    const uniqueCommenters = typeof gap?.uniqueCommenters === "number" ? Math.max(gap.uniqueCommenters, resolveParticipantPeople(r).people) : resolveParticipantPeople(r).people;
    const totalVisitors = gap?.totalVisitors ?? 0;
    const commentParticipationPct = totalVisitors > 0 ? computeCommentParticipationPct(uniqueCommenters, totalVisitors) : 0;
    return { uniqueCommenters, totalVisitors, commentParticipationPct };
  }
  function sectionAudienceParticipationLead(gap, r, supportParticipation) {
    return buildAudienceParticipationLeadSectionHtml(gap, r, { supportParticipation });
  }
  function buildAudienceParticipationLeadSectionHtml(gap, r, opts = {}) {
    const participation = resolveCommentParticipation(r, gap);
    const { uniqueCommenters, totalVisitors, commentParticipationPct } = participation;
    const support = opts.supportParticipation || resolveMarketingSupportParticipationCounts(
      /** @type {{ giftUsers?: unknown[], giftEvents?: unknown[], adContributionRanking?: unknown[], comments?: unknown[] }} */
      opts.supportInputs || {}
    );
    const giftPct = totalVisitors > 0 ? support.giftParticipationPct ?? supportParticipationPctAgainstVisitors(gap, support).giftParticipationPct : 0;
    const adPct = totalVisitors > 0 ? support.adParticipationPct ?? supportParticipationPctAgainstVisitors(gap, support).adParticipationPct : 0;
    const uniqueGiftThrowers = Math.max(0, Math.floor(support.uniqueGiftThrowers || 0));
    const uniqueAdContributors = Math.max(0, Math.floor(support.uniqueAdContributors || 0));
    const level = gap?.level || "unknown";
    const levelLabel = {
      unknown: "来場データ不足",
      healthy: "反応あり",
      quiet: "やや静か",
      "silent-crowd": "静かな観客が多い"
    }[level] || "判定不可";
    const visitorsValue = totalVisitors > 0 ? `${formatEventRankingNumber(totalVisitors)}人` : "未取得";
    const visitorsHint = totalVisitors > 0 ? "公式または配信中サンプルの累計来場" : "配信ページを開いたまま記録すると取得できます";
    const commentersValue = `${formatEventRankingNumber(uniqueCommenters)}人`;
    const commentersHint = totalVisitors > 0 ? `来場の ${commentParticipationPct}% がコメント` : "手元記録の発言者数（来場者数が未取得のため参加率は出せません）";
    const headline = totalVisitors > 0 ? `来場 ${formatEventRankingNumber(totalVisitors)} 人 — コメント ${formatEventRankingNumber(uniqueCommenters)}人（${commentParticipationPct}%）· ギフト ${formatEventRankingNumber(uniqueGiftThrowers)}人（${giftPct}%）· 広告 ${formatEventRankingNumber(uniqueAdContributors)}人（${adPct}%）` : `${formatEventRankingNumber(uniqueCommenters)} 人がコメント（来場者数は未取得）· ギフト ${formatEventRankingNumber(uniqueGiftThrowers)}人 · 広告 ${formatEventRankingNumber(uniqueAdContributors)}人`;
    const giftHint = uniqueGiftThrowers > 0 ? totalVisitors > 0 ? `来場の ${giftPct}% がギフト（記録ベース）` : "手元記録のギフト送り主" : "ギフト記録なし（履歴タブ・NDGR待ち）";
    const adHint = uniqueAdContributors > 0 ? totalVisitors > 0 ? `来場の ${adPct}% が広告（ランキング or 広告コメ）` : "手元記録の広告した人" : "広告ランキング未取得（配信ページで記録）";
    const insight = gap?.insightLines?.find((line) => line.includes("来場") && line.includes("コメント")) || (totalVisitors > 0 ? `100人あたりコメント ${gap?.commentsPer100Visitors ?? 0} 件 · 発言者 ${gap?.uniqueCommentersPer100Visitors ?? 0} 人` : "");
    const noteHtml = totalVisitors <= 0 ? '<p class="mkt-spec-note">来場者数が取れていないため「来場 X 人中 Y 人がコメント」は表示できません。視聴ページを開いた状態で配信を記録し、再出力してください。</p>' : "";
    const sectionId = String(opts.sectionId || "mkt-participation-lead").trim();
    const extraClass = String(opts.extraSectionClass || "").trim();
    const searchData = String(opts.searchData || "").trim();
    const sectionClass = extraClass ? `${extraClass} mkt-section mkt-section--participation-lead` : "mkt-section mkt-section--participation-lead";
    const searchAttr = searchData ? ` data-search="${escapeAttr(searchData.toLowerCase())}"` : "";
    const detailFooter = opts.showDetailLink !== false ? `<p class="mkt-note mkt-note--legend"><a href="${escapeAttr(opts.detailLinkHref || "#mkt-audience-gap")}" class="mkt-toc__link">来場→コメント変換率</a> セクションで詳細（100人あたり・静かな時間帯）を見られます。</p>` : "";
    return `<section class="${escapeAttr(sectionClass)}" id="${escapeAttr(sectionId)}" aria-label="来場と応援参加"${searchAttr}>
<h2>来場と応援参加</h2>
<p class="mkt-note">来場者のうち、コメント・ギフト・広告のそれぞれに参加した人数を並べます。広告の「演出」ではなく、記録ベースの分析用指標です。</p>
${noteHtml}
<p class="mkt-participation-headline">${escapeHtml(headline)}</p>
<p class="mkt-audience-level mkt-audience-level--${escapeAttr(level)}">${escapeHtml(levelLabel)}</p>
<div class="mkt-participation-lead-grid mkt-participation-lead-grid--four">
<div class="mkt-participation-lead-card mkt-participation-lead-card--visitors">
<span class="mkt-participation-lead-card__label">来場者数</span>
<strong class="mkt-participation-lead-card__value">${escapeHtml(visitorsValue)}</strong>
<span class="mkt-participation-lead-card__hint">${escapeHtml(visitorsHint)}</span>
</div>
<div class="mkt-participation-lead-card mkt-participation-lead-card--commenters">
<span class="mkt-participation-lead-card__label">コメントした人</span>
<strong class="mkt-participation-lead-card__value">${escapeHtml(commentersValue)}</strong>
<span class="mkt-participation-lead-card__hint">${escapeHtml(commentersHint)}</span>
</div>
<div class="mkt-participation-lead-card mkt-participation-lead-card--gift">
<span class="mkt-participation-lead-card__label">アイテムを投げた人</span>
<strong class="mkt-participation-lead-card__value">${escapeHtml(`${formatEventRankingNumber(uniqueGiftThrowers)}人`)}</strong>
<span class="mkt-participation-lead-card__hint">${escapeHtml(giftHint)}</span>
</div>
<div class="mkt-participation-lead-card mkt-participation-lead-card--ad">
<span class="mkt-participation-lead-card__label">広告をした人</span>
<strong class="mkt-participation-lead-card__value">${escapeHtml(`${formatEventRankingNumber(uniqueAdContributors)}人`)}</strong>
<span class="mkt-participation-lead-card__hint">${escapeHtml(adHint)}</span>
</div>
</div>
${insight ? `<p class="mkt-participation-lead-insight">${escapeHtml(insight)}</p>` : ""}
${detailFooter}
</section>`;
  }
  function sectionAudienceEngagementGap(gap, report) {
    if (!gap || gap.level === "unknown" && gap.totalVisitors <= 0) return "";
    const participation = report ? resolveCommentParticipation(report, gap) : null;
    const levelLabel = {
      unknown: "判定不可",
      healthy: "反応あり",
      quiet: "やや静か",
      "silent-crowd": "静かな観客が多い"
    }[gap.level] || "判定不可";
    const cards = [
      {
        label: "コメントした人",
        value: participation && participation.totalVisitors > 0 ? `${formatEventRankingNumber(participation.uniqueCommenters)}人 / ${formatEventRankingNumber(participation.totalVisitors)}来場（${participation.commentParticipationPct}%）` : participation && participation.uniqueCommenters > 0 ? `${formatEventRankingNumber(participation.uniqueCommenters)}人` : `${formatEventRankingNumber(Math.max(gap.uniqueCommenters, resolveParticipantPeople(
          /** @type {any} */
          report
        ).people))}人`,
        hint: "来場者のうち発言した人数と比率（必須指標）"
      },
      {
        label: "来場者数",
        value: gap.totalVisitors > 0 ? `${formatEventRankingNumber(gap.totalVisitors)}人` : "未取得",
        hint: "公式値またはサンプル最大値"
      },
      {
        label: "コメント数",
        value: `${formatEventRankingNumber(gap.effectiveCommentCount)}件`,
        hint: `手元記録 ${formatEventRankingNumber(gap.recordedCommentCount)}件`
      },
      {
        label: "100人あたりコメント",
        value: `${gap.commentsPer100Visitors}件`,
        hint: "来場から発言への変換率"
      },
      {
        label: "100人あたり発言者",
        value: `${gap.uniqueCommentersPer100Visitors}人`,
        hint: "実際にコメントした人数"
      }
    ];
    const cardHtml = cards.map(
      (c) => `<div class="mkt-audience-card">
<span class="mkt-audience-card__label">${escapeHtml(c.label)}</span>
<strong class="mkt-audience-card__value">${escapeHtml(c.value)}</strong>
<span class="mkt-audience-card__hint">${escapeHtml(c.hint)}</span>
</div>`
    ).join("");
    const insights = gap.insightLines.length ? `<ul class="mkt-insight-list">${gap.insightLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : "";
    const windows = gap.quietAudienceWindows.length ? `<div class="mkt-table-scroll"><table class="mkt-rank mkt-audience-window-table">
<thead><tr><th>時間</th><th>来場増</th><th>コメント増</th><th>新規来場100人あたり</th></tr></thead>
<tbody>${gap.quietAudienceWindows.map((w) => `<tr>
<td data-label="時間">${escapeHtml(`${formatShortClock(w.startAt)}〜${formatShortClock(w.endAt)}`)}</td>
<td data-label="来場増" class="mkt-num">+${formatEventRankingNumber(w.visitorDelta)}</td>
<td data-label="コメント増" class="mkt-num">+${formatEventRankingNumber(w.commentDelta)}</td>
<td data-label="100人あたり" class="mkt-num">${w.commentsPer100NewVisitors}件</td>
</tr>`).join("")}</tbody>
</table></div>` : '<p class="mkt-note">来場が増えたのにコメントが伸びにくい時間帯は目立ちません。</p>';
    return `<section class="mkt-section mkt-section--audience-gap" id="mkt-audience-gap">
<h2>来場→コメント変換率</h2>
<p class="mkt-note">「来場者数は多いけどコメントが少ない」状態を、公式コメント数・手元コメント・発言者数から見ます。</p>
<p class="mkt-audience-level mkt-audience-level--${escapeAttr(gap.level)}">${escapeHtml(levelLabel)}</p>
<div class="mkt-audience-card-grid">${cardHtml}</div>
${insights}
<h3 class="mkt-subhead">来場が増えたのに静かだった時間</h3>
${windows}
</section>`;
  }
  function positiveMarketingNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  function pickMarketingPoint(row) {
    const r = (
      /** @type {Record<string, unknown>} */
      row || {}
    );
    return positiveMarketingNumber(r.contribution) || positiveMarketingNumber(r.totalContribution) || positiveMarketingNumber(r.totalPoints) || positiveMarketingNumber(r.point) || positiveMarketingNumber(r.score);
  }
  function sumMarketingPoints(rows) {
    return (
      /** @type {number} */
      rows.reduce((sum, row) => (
        /** @type {number} */
        sum + pickMarketingPoint(row)
      ), 0)
    );
  }
  function marketingMetricLabel(value, unit = "") {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "未取得";
    return `${formatEventRankingNumber(n)}${unit}`;
  }
  function marketingPctLabel(value) {
    const n = Number(value);
    return Number.isFinite(n) ? `${Math.round(n * 10) / 10}%` : "—";
  }
  function maxMarketingField(rows, keys) {
    let max = 0;
    for (const raw of rows) {
      const row = (
        /** @type {Record<string, unknown>} */
        raw || {}
      );
      for (const key of keys) {
        const n = positiveMarketingNumber(row[key]);
        if (n > max) max = n;
      }
    }
    return max;
  }
  function pickGiftItemForMarketing(row) {
    const r = (
      /** @type {Record<string, unknown>} */
      row || {}
    );
    const name = String(r.itemName ?? r.giftName ?? r.name ?? r.title ?? "").trim();
    return {
      name,
      point: positiveMarketingNumber(r.point ?? r.totalPoints ?? r.contribution)
    };
  }
  function buildMarketingGiftItemRows(giftEvents, officialGiftHistory) {
    const map = /* @__PURE__ */ new Map();
    for (const raw of [...giftEvents, ...officialGiftHistory]) {
      const picked = pickGiftItemForMarketing(raw);
      if (!picked.name) continue;
      const key = picked.name.toLowerCase();
      const cur = map.get(key) || { name: picked.name, count: 0, points: 0 };
      cur.count += 1;
      cur.points += picked.point;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.points - a.points || b.count - a.count || a.name.localeCompare(b.name, "ja")).slice(0, 5);
  }
  function buildMarketingDataSummary(input) {
    const r = input.report;
    const programStats = input.programStats || {};
    const maxSampleVisitors = maxMarketingField(input.sessionSummaryRows, [
      "viewerCountFromDom",
      "totalVisitors",
      "watchCount",
      "visitorCount"
    ]);
    const maxSampleComments = maxMarketingField(input.sessionSummaryRows, [
      "officialCommentCount",
      "commentCount",
      "comments"
    ]);
    const officialVisitors = positiveMarketingNumber(programStats.watchCount) || positiveMarketingNumber(programStats.viewerCount) || maxSampleVisitors;
    const officialComments = positiveMarketingNumber(programStats.commentCount) || maxSampleComments;
    const officialGiftPoints = positiveMarketingNumber(programStats.giftPoints);
    const adPointTotal = sumMarketingPoints(input.adContributionRanking);
    const giftContributionPointTotal = sumMarketingPoints(input.giftContributionRanking);
    const availableSourceCount = [
      r.totalComments > 0,
      input.sessionSummaryRows.length > 0,
      Object.keys(programStats).length > 0,
      input.giftUsers.length > 0,
      input.giftEvents.length > 0,
      input.giftHistoryThrows.length > 0 || input.officialGiftHistory.length > 0,
      input.giftContributionRanking.length > 0,
      input.adContributionRanking.length > 0,
      Boolean(input.eventRanking),
      input.pastBroadcasts.length > 0
    ].filter(Boolean).length;
    const sourceRows = [
      {
        source: "コメント本文",
        status: r.totalComments > 0 ? "あり" : "なし",
        value: `${formatEventRankingNumber(r.totalComments)}件 / ${formatEventRankingNumber(resolveParticipantPeople(r).people)}人`,
        detail: `CPM ${r.commentsPerMinute}、ピーク ${r.peakMinute}分 ${r.peakMinuteCount}件`
      },
      {
        source: "来場・公式コメント",
        status: officialVisitors > 0 || officialComments > 0 ? "あり" : "未取得",
        value: `${marketingMetricLabel(officialVisitors, "人")} / ${marketingMetricLabel(officialComments, "件")}`,
        detail: `時系列サンプル ${input.sessionSummaryRows.length}点`
      },
      {
        source: "公式番組統計",
        status: Object.keys(programStats).length ? "あり" : "未取得",
        value: `ギフト ${marketingMetricLabel(officialGiftPoints, "pt")}`,
        detail: `watch/comment/gift 系の番組メニュー値`
      },
      {
        source: "ギフト送信者・イベント",
        status: input.giftUsers.length || input.giftEvents.length ? "あり" : "未取得",
        value: `${input.giftUsers.length}人 / ${input.giftEvents.length}件`,
        detail: `時刻つきギフト ${input.giftMomentum.totals.exactEventCount}件`
      },
      {
        source: "ギフト履歴・貢献度",
        status: input.giftHistoryThrows.length || input.officialGiftHistory.length || input.giftContributionRanking.length ? "あり" : "未取得",
        value: `${input.giftHistoryThrows.length}人 / ${input.giftContributionRanking.length}行`,
        detail: `代表pt ${marketingMetricLabel(Math.max(input.giftMomentum.totals.totalPoints, giftContributionPointTotal), "pt")}`
      },
      {
        source: "ニコニ広告",
        status: input.adContributionRanking.length ? "あり" : "未取得",
        value: `${input.adContributionRanking.length}行 / ${marketingMetricLabel(adPointTotal, "pt")}`,
        detail: "広告ランキングはギフトとは別の応援シグナル"
      },
      {
        source: "応援者ちくらんβ",
        status: input.supporterChikuran.rows.length ? "あり" : "少なめ",
        value: `${input.supporterChikuran.totals.supporterCount}名`,
        detail: `匿名応援 ${input.supporterChikuran.totals.anonymousIncluded ? "あり" : "なし"}`
      },
      {
        source: "過去配信",
        status: input.pastBroadcasts.length ? "あり" : "未取得",
        value: `${input.pastBroadcasts.length}枠`,
        detail: "常連・比較・成長メーターに利用"
      },
      {
        source: "イベント順位",
        status: input.eventRanking ? "あり" : "未取得",
        value: input.eventRanking?.rows?.length ? `${input.eventRanking.rows.length}行` : input.eventRanking?.self?.rank ? `${input.eventRanking.self.rank}位` : "未取得",
        detail: input.eventRanking?.eventName || "イベント情報なし"
      }
    ];
    const participationUnique = Math.max(input.audienceGap.uniqueCommenters, resolveParticipantPeople(r).people);
    const participationVisitors = input.audienceGap.totalVisitors || officialVisitors;
    const participationPct = participationVisitors > 0 ? computeCommentParticipationPct(participationUnique, participationVisitors) : 0;
    const matrixRows = [
      {
        area: "集客",
        main: participationVisitors > 0 ? `来場 ${formatEventRankingNumber(participationVisitors)}人中 ${formatEventRankingNumber(participationUnique)}人がコメント（${participationPct}%）` : `来場 ${marketingMetricLabel(input.audienceGap.totalVisitors || officialVisitors, "人")}`,
        sub: `100人あたりコメント ${input.audienceGap.commentsPer100Visitors}件`,
        reading: input.audienceGap.level === "silent-crowd" ? "来場はあるが発言転換が弱い" : "来場から発言への流れを見る"
      },
      {
        area: "反応",
        main: `${formatEventRankingNumber(r.totalComments)}件 / ${formatEventRankingNumber(resolveParticipantPeople(r).people)}人`,
        sub: `CPM ${r.commentsPerMinute}、最長間隔 ${formatSilenceMs(r.maxSilenceGapMs)}`,
        reading: `ピークは ${r.peakMinute}分目 ${r.peakMinuteCount}件`
      },
      {
        area: "コミュニティ",
        main: `ヘビー ${r.segmentCounts.heavy}人 / 中間 ${r.segmentCounts.mid}人`,
        sub: `一見 ${r.segmentCounts.once}人、184 ${marketingPctLabel(r.is184.pctOfKnown)}`,
        reading: "常連・一見・匿名の混ざり具合"
      },
      {
        area: "継続",
        main: r.quarterEngagement?.skippedShortSpan ? "判定なし" : `冒頭 ${r.quarterEngagement.uniqueCommentersFirstQuarter}人 / 終盤 ${r.quarterEngagement.uniqueCommentersLastQuarter}人`,
        sub: r.quarterEngagement?.skippedShortSpan ? "記録時間が短め" : `両方にいた人 ${r.quarterEngagement.uniqueCommentersBothQuarters}人`,
        reading: "最後まで残った応援の厚み"
      },
      {
        area: "支援",
        main: `送り主 ${input.giftMomentum.totals.senderCount}名 / 応援者候補 ${input.supporterChikuran.totals.supporterCount}名`,
        sub: `ギフト ${marketingMetricLabel(input.giftMomentum.totals.totalPoints, "pt")}、広告 ${marketingMetricLabel(adPointTotal, "pt")}`,
        reading: "コメント以外の応援量"
      },
      {
        area: "本文素材",
        main: `平均 ${r.textStats.avgChars}字 / 中央 ${r.textStats.medianChars}字`,
        sub: `URL ${marketingPctLabel(r.textStats.pctWithUrl)}、絵文字 ${marketingPctLabel(r.textStats.pctWithEmoji)}`,
        reading: "切り抜き・告知・話題抽出の素材感"
      },
      {
        area: "データ厚み",
        main: `${availableSourceCount}/10 種類`,
        sub: `過去 ${input.pastBroadcasts.length}枠、サンプル ${input.sessionSummaryRows.length}点`,
        reading: "多いほど判断材料が増える"
      }
    ];
    const giftItemRows = buildMarketingGiftItemRows(
      input.giftEvents,
      input.officialGiftHistory
    );
    const cards = [
      {
        label: "コメントした人",
        value: participationVisitors > 0 ? `${formatEventRankingNumber(participationUnique)}人 / ${formatEventRankingNumber(participationVisitors)}来場（${participationPct}%）` : `${formatEventRankingNumber(participationUnique)}人`,
        hint: "来場者のうち発言した人数（必須）"
      },
      {
        label: "観測ソース",
        value: `${availableSourceCount}/10`,
        hint: "このHTMLに入ったデータ種類"
      },
      {
        label: "来場→発言",
        value: input.audienceGap.totalVisitors > 0 ? `${input.audienceGap.commentsPer100Visitors}件/100人` : "未取得",
        hint: `発言者 ${input.audienceGap.uniqueCommentersPer100Visitors}人/100人`
      },
      {
        label: "応援者候補",
        value: `${input.supporterChikuran.totals.supporterCount}名`,
        hint: "コメント・ギフト・広告の合算"
      },
      {
        label: "ギフト代表pt",
        value: marketingMetricLabel(input.giftMomentum.totals.totalPoints, "pt"),
        hint: `${input.giftMomentum.totals.senderCount}名 / ${input.giftMomentum.totals.throwCount}投`
      },
      {
        label: "広告pt",
        value: marketingMetricLabel(adPointTotal, "pt"),
        hint: `${input.adContributionRanking.length}行`
      },
      {
        label: "過去比較素材",
        value: `${input.pastBroadcasts.length}枠`,
        hint: "常連・成長・波形比較"
      }
    ];
    return { cards, matrixRows, sourceRows, giftItemRows };
  }
  function sectionMarketingDataSummary(summary) {
    const cardHtml = summary.cards.map(
      (c) => `<div class="mkt-data-card">
<span class="mkt-data-card__label">${escapeHtml(c.label)}</span>
<strong class="mkt-data-card__value">${escapeHtml(c.value)}</strong>
<span class="mkt-data-card__hint">${escapeHtml(c.hint)}</span>
</div>`
    ).join("");
    const matrixHtml = summary.matrixRows.map(
      (row) => `<tr>
<td data-label="領域">${escapeHtml(row.area)}</td>
<td data-label="主指標">${escapeHtml(row.main)}</td>
<td data-label="補助">${escapeHtml(row.sub)}</td>
<td data-label="読み方">${escapeHtml(row.reading)}</td>
</tr>`
    ).join("");
    const sourceHtml = summary.sourceRows.map(
      (row) => `<tr>
<td data-label="データ">${escapeHtml(row.source)}</td>
<td data-label="状態"><span class="mkt-data-status mkt-data-status--${escapeAttr(row.status)}">${escapeHtml(row.status)}</span></td>
<td data-label="値">${escapeHtml(row.value)}</td>
<td data-label="使い道">${escapeHtml(row.detail)}</td>
</tr>`
    ).join("");
    const giftItems = summary.giftItemRows.length ? `<div class="mkt-data-gift-items">${summary.giftItemRows.map(
      (row) => `<span class="mkt-data-gift-chip">${escapeHtml(row.name)} <b>${row.count}件</b>${row.points > 0 ? ` / ${escapeHtml(formatEventRankingNumber(row.points))}pt` : ""}</span>`
    ).join("")}</div>` : '<p class="mkt-note">ギフト名の素材はまだありません。</p>';
    return `<section class="mkt-section mkt-section--data-summary" id="mkt-data-summary">
<h2>マーケ総合サマリ（データ全部入り）</h2>
<p class="mkt-note">このHTMLに入ったコメント・来場・同接サンプル・ギフト・広告・過去配信を横断して、マーケ判断に使う数字を先にまとめます。</p>
<div class="mkt-data-card-grid">${cardHtml}</div>
<h3 class="mkt-subhead">横断指標</h3>
<div class="mkt-table-scroll"><table class="mkt-rank mkt-data-matrix">
<thead><tr><th>領域</th><th>主指標</th><th>補助</th><th>読み方</th></tr></thead>
<tbody>${matrixHtml}</tbody>
</table></div>
<h3 class="mkt-subhead">取り込めたデータ</h3>
<div class="mkt-table-scroll"><table class="mkt-rank mkt-data-source-table">
<thead><tr><th>データ</th><th>状態</th><th>値</th><th>使い道</th></tr></thead>
<tbody>${sourceHtml}</tbody>
</table></div>
<h3 class="mkt-subhead">ギフト素材 TOP</h3>
${giftItems}
</section>`;
  }
  function supporterChikuranSourceLabel(source) {
    return {
      comment: "コメント",
      "gift-users": "ギフト記録",
      "gift-events": "ギフト時刻",
      "gift-contribution": "ギフト貢献度",
      "ad-contribution": "広告"
    }[source] || source;
  }
  function supporterChikuranNameHtml(row, maskShare) {
    const rawLabel = row.isAnonymousAggregate ? "匿名応援" : row.userId && /^\d+$/.test(row.userId) ? displayUserLabel(row.userId, row.displayName || "") : row.displayName || "応援者";
    if (row.isAnonymousAggregate) return escapeHtml(rawLabel);
    if (maskShare) return escapeHtml(maskLabelForShare(rawLabel));
    return row.userId && /^\d+$/.test(row.userId) ? buildUserProfileLinkedLabelHtml(row.userId, rawLabel) : escapeHtml(rawLabel);
  }
  function supporterChikuranAvatarHtml(row, rank, maskShare, identiconResolver) {
    if (maskShare || row.isAnonymousAggregate) {
      return `<span class="mkt-supporter-avatar mkt-supporter-avatar--empty" aria-hidden="true">${rank}</span>`;
    }
    const thumbSrc = resolveReportUserThumbSrc({
      userId: row.userId || "",
      avatarUrl: row.avatarUrl || "",
      identiconResolver
    });
    return wrapThumbWithProfileLink(
      row.userId,
      thumbSrc ? `<img class="mkt-supporter-avatar" src="${escapeAttr(thumbSrc)}" alt="" width="34" height="34" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${DEFAULT_USERICON_ONERROR_ATTR}>` : `<span class="mkt-supporter-avatar mkt-supporter-avatar--empty" aria-hidden="true">${rank}</span>`
    );
  }
  function supporterChikuranSummaryLine(rows, maskShare) {
    const top = rows[0];
    if (!top) return "手元データから見える応援者の勢いはまだ薄めです。";
    const signals = [];
    if (top.commentCount > 0) signals.push(`コメント${top.commentCount}件`);
    if (top.giftThrowCount > 0) signals.push(`ギフト${top.giftThrowCount}投`);
    if (top.giftPointTotal > 0) signals.push(`${formatEventRankingNumber(top.giftPointTotal)}pt`);
    if (top.adPointTotal > 0) signals.push(`広告${formatEventRankingNumber(top.adPointTotal)}pt`);
    const detail = signals.length ? `（${signals.join(" / ")}）` : "";
    const rawName = top.isAnonymousAggregate ? "匿名応援" : top.userId && /^\d+$/.test(top.userId) ? displayUserLabel(top.userId, top.displayName || "") : top.displayName || "応援者";
    const name = !top.isAnonymousAggregate && maskShare ? maskLabelForShare(rawName) : rawName;
    const nameHtml = !top.isAnonymousAggregate && !maskShare && top.userId && /^\d+$/.test(top.userId) ? buildUserProfileLinkedLabelHtml(top.userId, name) : escapeHtml(name);
    return `${nameHtml}さんが、このPCで見た応援の勢いでは先頭です${escapeHtml(detail)}。`;
  }
  function sectionSupporterChikuranBeta(analysis, maskShare, identiconResolver) {
    if (!analysis || !Array.isArray(analysis.rows) || analysis.rows.length === 0) return "";
    const rows = analysis.rows.slice(0, 15);
    const maxScore = Math.max(1, ...rows.map((row) => row.totalScore || 0));
    const giftSupporterCount = rows.filter(
      (row) => row.giftThrowCount > 0 || row.giftPointTotal > 0
    ).length;
    const adSupporterCount = rows.filter((row) => row.adPointTotal > 0).length;
    const recentSupporterCount = rows.filter((row) => row.recent15mCommentCount > 0).length;
    const cards = [
      {
        label: "応援者候補",
        value: `${analysis.totals.supporterCount}名`,
        hint: "コメント・ギフト・広告を合算"
      },
      {
        label: "直近15分で反応",
        value: `${recentSupporterCount}名`,
        hint: "最近のコメント勢い"
      },
      {
        label: "ギフト反応あり",
        value: `${giftSupporterCount}名`,
        hint: "投げ回数またはptあり"
      },
      {
        label: "広告/匿名",
        value: `${adSupporterCount}名 / ${analysis.totals.anonymousIncluded ? "あり" : "なし"}`,
        hint: "広告ptと匿名応援の有無"
      }
    ];
    const cardHtml = cards.map(
      (c) => `<div class="mkt-supporter-card">
<span class="mkt-supporter-card__label">${escapeHtml(c.label)}</span>
<strong class="mkt-supporter-card__value">${escapeHtml(c.value)}</strong>
<span class="mkt-supporter-card__hint">${escapeHtml(c.hint)}</span>
</div>`
    ).join("");
    const rowHtml = rows.map((row, i) => {
      const rank = i + 1;
      const pct = Math.max(4, Math.min(100, Math.round(row.totalScore / maxScore * 100)));
      const giftLabel = row.giftThrowCount > 0 || row.giftPointTotal > 0 ? `${row.giftThrowCount || 0}投 / ${row.giftPointTotal > 0 ? `${formatEventRankingNumber(row.giftPointTotal)}pt` : "pt未取得"}` : "—";
      const adLabel = row.adPointTotal > 0 ? `${formatEventRankingNumber(row.adPointTotal)}pt` : "—";
      const sources = row.sources.length ? row.sources.map((source) => `<span class="mkt-supporter-source">${escapeHtml(supporterChikuranSourceLabel(source))}</span>`).join(" ") : '<span class="mkt-supporter-source mkt-supporter-source--muted">手元記録</span>';
      return `<tr>
<td data-label="#">${rank}</td>
<td data-label="応援者" class="mkt-supporter-name">
<div class="mkt-supporter-person">${supporterChikuranAvatarHtml(row, rank, maskShare, identiconResolver)}<span>${supporterChikuranNameHtml(row, maskShare)}</span></div>
</td>
<td data-label="ローカル勢い" class="mkt-supporter-score-cell">
<div class="mkt-supporter-score"><strong>${escapeHtml(String(row.totalScore))}</strong><span class="mkt-supporter-scorebar"><i style="width:${pct}%"></i></span></div>
</td>
<td data-label="コメ" class="mkt-num">${row.commentCount}</td>
<td data-label="直近15分" class="mkt-num">${row.recent15mCommentCount || "—"}</td>
<td data-label="ギフト">${escapeHtml(giftLabel)}</td>
<td data-label="広告pt">${escapeHtml(adLabel)}</td>
<td data-label="根拠" class="mkt-supporter-sources">${sources}</td>
</tr>`;
    }).join("");
    return `<section class="mkt-section mkt-section--supporter-chikuran" id="mkt-supporter-chikuran">
<h2>応援者ちくらん β（ローカル）</h2>
<p class="mkt-note">このPCに残ったコメント・ギフト・広告・貢献度だけで見た<strong>応援する人が主役</strong>の勢いです。公式順位ではありません。</p>
<div class="mkt-supporter-card-grid">${cardHtml}</div>
<p class="mkt-supporter-summary">${supporterChikuranSummaryLine(rows, maskShare)}</p>
<div class="mkt-table-scroll"><table class="mkt-rank mkt-supporter-table">
<thead><tr><th>#</th><th>応援者</th><th>ローカル勢い</th><th>コメ</th><th>直近15分</th><th>ギフト</th><th>広告pt</th><th>根拠</th></tr></thead>
<tbody>${rowHtml}</tbody>
</table></div>
</section>`;
  }
  function sectionCrossSupporterRanking(rows, pastBroadcastCount) {
    if (!Array.isArray(rows) || rows.length === 0) return "";
    const rowHtml = rows.map(
      (row) => `<tr>
<td data-label="#">${row.rank}</td>
<td data-label="応援者">${escapeHtml(row.name)}</td>
<td data-label="コメ(横断合計)" class="mkt-num">${row.count}</td>
<td data-label="横断配信数" class="mkt-num">${row.broadcastCount}</td>
</tr>`
    ).join("");
    return `<section class="mkt-section mkt-section--cross-supporter-ranking" id="mkt-cross-supporter-ranking">
<h2>横断応援者ランキング（このPC内・β）</h2>
<p class="mkt-note">過去${pastBroadcastCount}配信 + 今回を横断して、コメント数が多い順に並べています。<strong>このPCに記録が残っている配信だけ</strong>が対象で、公開や他PCとの集約はしていません。匿名の方は「匿名」とまとめて表示します。</p>
<div class="mkt-table-scroll"><table class="mkt-rank mkt-cross-supporter-table">
<thead><tr><th>#</th><th>応援者</th><th>コメ(横断合計)</th><th>横断配信数</th></tr></thead>
<tbody>${rowHtml}</tbody>
</table></div>
</section>`;
  }
  var MKT_SECTION_REVEAL_ENABLED = false;
  function buildSectionRevealBootScriptHtml() {
    if (!MKT_SECTION_REVEAL_ENABLED) return "";
    return `<script>
(function(){
  try{document.documentElement.classList.add('mkt-section-reveal-enabled');}catch(e){}
})();
<\/script>`;
  }
  function buildSectionRevealScriptHtml() {
    if (!MKT_SECTION_REVEAL_ENABLED) return "";
    return `<div id="mktRevealControl" class="mkt-reveal-control" role="group" aria-label="セクション発表">
<span id="mktRevealStatus" class="mkt-reveal-control__status">発表準備中…</span>
<button id="mktRevealSoundBtn" class="mkt-reveal-btn mkt-reveal-btn--sound" type="button">音ON</button>
<button id="mktRevealSkipBtn" class="mkt-reveal-btn mkt-reveal-btn--skip" type="button">スキップ</button>
</div>
<script>
(function(){
  var root=document.documentElement;
  var REVEAL_DELAY_MS=520;
  var REVEAL_HIGHLIGHT_MS=620;
  var audioCtx=null;
  var audioReady=false;
  var autoScroll=true;
  var timer=0;
  var index=0;
  var stopped=false;

  function allSections(){
    return Array.prototype.slice.call(document.querySelectorAll('.mkt-section'));
  }

  function reducedMotion(){
    try{return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}
    catch(e){return false;}
  }

  function failOpen(){
    try{root.classList.remove('mkt-section-reveal-enabled');}catch(e){}
    var control=document.getElementById('mktRevealControl');
    if(control&&control.parentNode)control.parentNode.removeChild(control);
  }

  function enableAll(sections){
    sections.forEach(function(section){
      section.classList.add('mkt-section--reveal');
      section.classList.remove('mkt-section--revealing');
    });
    root.classList.add('mkt-section-reveal-done');
  }

  function ensureAudioContext(){
    var Ctor=window.AudioContext||window.webkitAudioContext;
    if(!Ctor)return null;
    if(!audioCtx)audioCtx=new Ctor();
    return audioCtx;
  }

  function updateSoundButton(btn){
    if(!btn)return;
    if(audioReady){
      btn.textContent='音ON';
      btn.classList.add('is-ready');
      btn.disabled=true;
      btn.title='発表音は有効です';
      return;
    }
    btn.textContent='音ON';
    btn.classList.remove('is-ready');
    btn.disabled=false;
    btn.title='ブラウザの自動再生制限で音が出ないときに押してください';
  }

  function tryEnableAudio(btn){
    var ctx=ensureAudioContext();
    if(!ctx){
      if(btn){
        btn.textContent='音なし';
        btn.disabled=true;
      }
      return Promise.resolve(false);
    }
    var resume=ctx.state==='suspended'&&typeof ctx.resume==='function'?ctx.resume():Promise.resolve();
    return Promise.resolve(resume).then(function(){
      audioReady=ctx.state==='running';
      updateSoundButton(btn);
      if(audioReady)playTone({start:660,end:920,duration:0.11,type:'sine',gain:0.055,delay:0});
      return audioReady;
    }).catch(function(){
      audioReady=false;
      updateSoundButton(btn);
      return false;
    });
  }

  function playTone(opts){
    var ctx=ensureAudioContext();
    if(!ctx||ctx.state!=='running')return;
    var now=ctx.currentTime+(opts.delay||0);
    var osc=ctx.createOscillator();
    var gain=ctx.createGain();
    osc.type=opts.type||'sine';
    osc.frequency.setValueAtTime(opts.start,now);
    osc.frequency.exponentialRampToValueAtTime(opts.end,now+opts.duration);
    gain.gain.setValueAtTime(0.0001,now);
    gain.gain.exponentialRampToValueAtTime(opts.gain,now+0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001,now+opts.duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now+opts.duration+0.025);
  }

  function playSectionCue(step,total){
    var ctx=ensureAudioContext();
    if(!ctx){
      updateSoundButton(document.getElementById('mktRevealSoundBtn'));
      return;
    }
    if(ctx.state!=='running'){
      audioReady=false;
      updateSoundButton(document.getElementById('mktRevealSoundBtn'));
      return;
    }
    audioReady=true;
    updateSoundButton(document.getElementById('mktRevealSoundBtn'));
    var phase=step%6;
    if(phase===0){
      playTone({start:138,end:82,duration:0.12,type:'triangle',gain:0.09,delay:0});
      playTone({start:510,end:690,duration:0.09,type:'sine',gain:0.035,delay:0.035});
    }else{
      var base=520+phase*48;
      playTone({start:base,end:base*1.42,duration:0.105,type:'sine',gain:0.052,delay:0});
    }
    if(step===total-1){
      playTone({start:740,end:980,duration:0.11,type:'sine',gain:0.048,delay:0.13});
      playTone({start:980,end:1320,duration:0.13,type:'triangle',gain:0.045,delay:0.24});
    }
  }

  function setStatus(status,count,total){
    if(!status)return;
    status.textContent='発表中 '+count+'/'+total;
  }

  function revealOne(section,step,total){
    section.classList.add('mkt-section--reveal','mkt-section--revealing');
    window.setTimeout(function(){
      section.classList.remove('mkt-section--revealing');
    },REVEAL_HIGHLIGHT_MS);
    playSectionCue(step,total);
    if(autoScroll&&typeof section.scrollIntoView==='function'){
      try{section.scrollIntoView({behavior:'smooth',block:'center'});}catch(e){}
    }
  }

  function init(){
    var sections=allSections();
    var control=document.getElementById('mktRevealControl');
    var status=document.getElementById('mktRevealStatus');
    var soundBtn=document.getElementById('mktRevealSoundBtn');
    var skipBtn=document.getElementById('mktRevealSkipBtn');
    if(!sections.length){failOpen();return;}
    if(reducedMotion()){
      enableAll(sections);
      if(control&&control.parentNode)control.parentNode.removeChild(control);
      return;
    }
    setStatus(status,0,sections.length);
    updateSoundButton(soundBtn);
    ['wheel','touchstart','keydown'].forEach(function(type){
      window.addEventListener(type,function(){autoScroll=false;},{passive:true});
    });
    if(soundBtn){
      soundBtn.addEventListener('click',function(){tryEnableAudio(soundBtn);});
    }
    window.addEventListener('pointerdown',function(){
      if(audioCtx&&audioCtx.state==='suspended')tryEnableAudio(soundBtn);
    },{passive:true});
    if(skipBtn){
      skipBtn.addEventListener('click',function(){
        stopped=true;
        if(timer)window.clearTimeout(timer);
        enableAll(sections);
        setStatus(status,sections.length,sections.length);
        skipBtn.textContent='表示済み';
        skipBtn.disabled=true;
        if(control)control.classList.add('is-done');
      });
    }
    function revealThrough(target){
      if(!target||stopped)return;
      var i=sections.indexOf(target);
      if(i<0||i<index)return;
      for(var j=index;j<=i;j+=1){
        sections[j].classList.add('mkt-section--reveal');
      }
      index=i+1;
      setStatus(status,index,sections.length);
    }
    function revealTargetFromHash(){
      var id=(location.hash||'').replace(/^#/,'');
      if(!id)return;
      var el=document.getElementById(id);
      if(el)revealThrough(el);
    }
    window.addEventListener('hashchange',revealTargetFromHash);
    revealTargetFromHash();
    function tick(){
      if(stopped)return;
      if(index>=sections.length){
        root.classList.add('mkt-section-reveal-done');
        if(skipBtn){
          skipBtn.textContent='表示済み';
          skipBtn.disabled=true;
        }
        if(control)control.classList.add('is-done');
        setStatus(status,sections.length,sections.length);
        return;
      }
      revealOne(sections[index],index,sections.length);
      index+=1;
      setStatus(status,index,sections.length);
      timer=window.setTimeout(tick,REVEAL_DELAY_MS);
    }
    timer=window.setTimeout(tick,180);
  }

  try{
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
    else init();
  }catch(e){
    failOpen();
  }
})();
<\/script>`;
  }
  function buildMarketingDashboardHtml(r, opts = {}) {
    const maskShare = opts.maskShareLabels === true;
    const identiconResolver = typeof opts.anonymousIdenticonResolver === "function" ? opts.anonymousIdenticonResolver : void 0;
    const broadcasterUserId = typeof opts.broadcasterUserId === "string" ? opts.broadcasterUserId : "";
    const sessionSummaryRows = Array.isArray(opts.sessionSummaryRows) ? opts.sessionSummaryRows : [];
    const exportedAtIso = (/* @__PURE__ */ new Date()).toISOString();
    const embedJson = buildMarketingEmbedScriptInnerText(r, {
      maskShareLabels: maskShare,
      exportedAt: exportedAtIso,
      slimForHeavyExport: opts.slimForHeavyExport === true
    });
    const subSuffix = maskShare ? " · 共有向けに表示名を伏せた出力" : "";
    const concurrentSeries = buildConcurrentTimelineSeries(sessionSummaryRows);
    const concurrentPeak = analyzeConcurrentPeak(concurrentSeries);
    const commentsForAnalytics = Array.isArray(opts.commentsForAnalytics) ? opts.commentsForAnalytics : [];
    const velocityTimeline = buildCommentVelocityTimeline(commentsForAnalytics, {
      bucketMs: 6e4,
      rollingWindowMin: 5
    });
    const silenceZones = detectCommentSilenceZones(commentsForAnalytics, {
      thresholdMs: 6e4,
      quality: { windowMs: 3e4 }
    });
    const laughterDensity = buildLaughterDensityTimeline(commentsForAnalytics, {
      bucketMs: 3e4
    });
    const commentFatigue = computeCommentFatigue(commentsForAnalytics, {
      broadcasterUserId,
      maxTenureMin: 30
    });
    const pastBroadcasts = Array.isArray(opts.pastBroadcasts) ? opts.pastBroadcasts : [];
    const filterBroadcaster2 = broadcasterUserId ? (cs) => Array.isArray(cs) ? cs.filter((c) => String(c?.userId || "").trim() !== broadcasterUserId) : [] : (cs) => Array.isArray(cs) ? cs : [];
    const currentCommentsForLayer = filterBroadcaster2(commentsForAnalytics);
    const broadcastNarrative = buildBroadcastNarrative({
      report: r,
      comments: currentCommentsForLayer,
      broadcasterUserId,
      includeSamples: !maskShare
    });
    const pastBroadcastsForLayer = pastBroadcasts.map((b) => ({
      liveId: String(b?.liveId || ""),
      comments: filterBroadcaster2(b?.comments)
    }));
    const crossSupporterRanking = buildCrossSupporterRanking(pastBroadcastsForLayer, r.liveId, {
      limit: 10
    });
    const newVsRepeatBasis = judgeNewVsRepeatBasis(pastBroadcastsForLayer.length);
    const newVsRepeat = classifyCommentersAgainstHistory({
      currentLiveId: r.liveId,
      currentComments: currentCommentsForLayer,
      pastBroadcasts: pastBroadcastsForLayer,
      heavyThreshold: 5
    });
    const viewerRetention = estimateViewerRetention(currentCommentsForLayer, {
      broadcasterUserId,
      programStartAtMs: typeof opts.programStartAtMs === "number" ? opts.programStartAtMs : void 0
    });
    const survivalCurve = buildCommenterSurvivalCurve(currentCommentsForLayer, {
      segmentCount: 5
    });
    const departedHeavy = findDepartedHeavyCommenters({
      currentComments: currentCommentsForLayer,
      pastBroadcasts: pastBroadcastsForLayer.filter(
        (b) => String(b.liveId).toLowerCase() !== String(r.liveId).toLowerCase()
      ),
      heavyThreshold: 5,
      topN: 15
    });
    const attendanceMatrix = buildCommenterAttendanceMatrix({
      broadcasts: [
        ...pastBroadcastsForLayer.filter(
          (b) => String(b.liveId).toLowerCase() !== String(r.liveId).toLowerCase()
        ),
        { liveId: r.liveId, comments: currentCommentsForLayer }
      ],
      topN: 20
    });
    const keyboardTypes = diagnoseKeyboardTypes(commentsForAnalytics, {
      broadcasterUserId
    });
    const allBroadcastsForCompare = [
      ...pastBroadcastsForLayer.filter(
        (b) => String(b.liveId).toLowerCase() !== String(r.liveId).toLowerCase()
      ),
      { liveId: String(r.liveId || ""), comments: currentCommentsForLayer }
    ];
    const recentComparison = buildRecentBroadcastComparison({
      broadcasts: allBroadcastsForCompare,
      limit: 5
    });
    const weekdayHourHeat = buildWeekdayHourHeatmap({
      broadcasts: allBroadcastsForCompare
    });
    const pastTotalsForGrowth = pastBroadcastsForLayer.filter((b) => String(b.liveId).toLowerCase() !== String(r.liveId).toLowerCase()).map((b) => Array.isArray(b.comments) ? b.comments.length : 0).filter((n) => n > 0);
    const growth = computeBroadcastGrowthScore({
      currentValue: r.totalComments || currentCommentsForLayer.length,
      pastValues: pastTotalsForGrowth
    });
    const openingFivePts = buildOpeningFiveMinutePoints(allBroadcastsForCompare);
    const currentFingerprint = buildBroadcastWaveformFingerprint(currentCommentsForLayer);
    const pastFingerprints = pastBroadcastsForLayer.filter((b) => String(b.liveId).toLowerCase() !== String(r.liveId).toLowerCase()).map((b) => {
      const fp = buildBroadcastWaveformFingerprint(b.comments);
      return fp ? { liveId: b.liveId, vector: fp.vector, totalCount: fp.totalCount } : null;
    }).filter(
      /** @returns {x is { liveId: string, vector: number[], totalCount: number }} */
      (x) => x != null
    );
    const similarBroadcasts = currentFingerprint ? findSimilarBroadcasts(
      { liveId: String(r.liveId || ""), vector: currentFingerprint.vector, totalCount: currentFingerprint.totalCount },
      pastFingerprints,
      { topN: 5 }
    ) : [];
    const echoPropagation = detectCommentPropagation(currentCommentsForLayer, {
      windowMs: 3e4,
      minDistinctUsers: 3
    });
    const echoSync = detectCommentSyncBursts(currentCommentsForLayer, {
      windowMs: 5e3,
      minDistinctUsers: 3
    });
    const firstSecondLatency = buildCommenterFirstSecondLatency(currentCommentsForLayer);
    const talentPeaks = detectTalentPeakMoments(currentCommentsForLayer);
    const sentimentCurve = scoreSentimentTimeline(currentCommentsForLayer, {
      bucketMs: 6e4
    });
    const selfComments = Array.isArray(opts.commentsForAnalytics) ? opts.commentsForAnalytics.filter(
      (c) => Boolean(
        /** @type {{ selfPosted?: any }} */
        c?.selfPosted
      )
    ) : [];
    const uniqueWords = suggestUniqueWords({
      allComments: currentCommentsForLayer,
      selfComments,
      topN: 15,
      minOccurrence: 3
    });
    const lastPoint = concurrentSeries.points[concurrentSeries.points.length - 1];
    const recentActiveCommenters = (() => {
      if (!currentCommentsForLayer.length) return 0;
      const last = currentCommentsForLayer.reduce(
        (mx, c) => typeof c?.capturedAt === "number" && c.capturedAt > mx ? c.capturedAt : mx,
        0
      );
      if (!last) return 0;
      const since = last - 5 * 6e4;
      const recent = /* @__PURE__ */ new Set();
      for (const c of currentCommentsForLayer) {
        if (typeof c?.capturedAt !== "number" || c.capturedAt < since) continue;
        const uid = c.userId == null ? "" : String(c.userId).trim();
        if (uid) recent.add(uid);
      }
      return recent.size;
    })();
    const reach = computeReachCoefficient({
      currentConcurrent: lastPoint ? lastPoint.value : NaN,
      uniqueCommentersInWindow: recentActiveCommenters
    });
    const giftUsersForSg = Array.isArray(opts.giftUsers) ? opts.giftUsers : [];
    const giftEventsForAnalytics = Array.isArray(opts.giftEvents) ? opts.giftEvents : [];
    const giftHistoryThrowsForAnalytics = Array.isArray(opts.giftHistoryThrows) ? opts.giftHistoryThrows : [];
    const officialGiftHistoryForAnalytics = Array.isArray(opts.officialEventDomBundle?.giftHistory) ? opts.officialEventDomBundle.giftHistory : [];
    const giftContributionRankingForAnalytics = Array.isArray(
      opts.officialEventDomBundle?.contributionRanking
    ) ? opts.officialEventDomBundle.contributionRanking : [];
    const adContributionRankingForAnalytics = Array.isArray(
      opts.officialEventDomBundle?.adContributionRanking
    ) ? opts.officialEventDomBundle.adContributionRanking : [];
    const giftMomentum = analyzeGiftMomentum({
      comments: currentCommentsForLayer,
      giftUsers: giftUsersForSg,
      giftEvents: giftEventsForAnalytics,
      giftHistoryThrows: giftHistoryThrowsForAnalytics,
      officialGiftHistory: officialGiftHistoryForAnalytics,
      giftContributionRanking: giftContributionRankingForAnalytics,
      adContributionRanking: adContributionRankingForAnalytics,
      programStats: opts.officialEventDomBundle?.programStats || null
    }, {
      broadcasterUserId
    });
    const giftThrowLedger = buildMarketingGiftThrowLedger({
      giftSubAppHistory: opts.giftSubAppHistory || null,
      officialGiftHistory: officialGiftHistoryForAnalytics,
      giftEvents: giftEventsForAnalytics
    });
    const supportersGiftsRows = buildSupportersGiftsRows({
      comments: currentCommentsForLayer,
      giftRows: buildMarketingGiftThrowLedger(
        {
          giftSubAppHistory: opts.giftSubAppHistory || null,
          officialGiftHistory: officialGiftHistoryForAnalytics,
          giftEvents: giftEventsForAnalytics
        },
        { maxRows: 1e6 }
      ).rows,
      broadcasterUserId
    });
    const giftMomentsAnalysis = analyzeGiftMoments({
      history: Array.isArray(opts.giftSubAppHistory?.history) ? opts.giftSubAppHistory.history : [],
      comments: currentCommentsForLayer,
      concurrentPoints: concurrentSeries.points,
      officialTotalPoint: (
        /** @type {any} */
        opts.giftSubAppHistory?.officialTotalPoint ?? null
      ),
      officialRemaining: (
        /** @type {any} */
        opts.giftSubAppHistory?.officialRemaining ?? 0
      ),
      sampled: opts.slimForHeavyExport === true
    });
    const giftMomentNextLines = giftMomentsAnalysis.axisOk ? buildGiftMomentNextActions(giftMomentsAnalysis.summary) : [];
    const adObservedHtml = sectionAdObserved(
      opts.adObservations,
      adContributionRankingForAnalytics,
      maskShare,
      identiconResolver
    );
    const supporterChikuran = buildSupporterChikuranRows({
      liveId: r.liveId,
      comments: currentCommentsForLayer,
      giftUsers: giftUsersForSg,
      giftEvents: giftEventsForAnalytics,
      giftContributionRanking: [
        ...giftContributionRankingForAnalytics,
        ...giftHistoryThrowsForAnalytics
      ],
      adContributionRanking: adContributionRankingForAnalytics
    }, {
      liveId: r.liveId,
      excludeUserIds: broadcasterUserId ? [broadcasterUserId] : [],
      maxRows: 15
    });
    const audienceGap = analyzeAudienceEngagementGap({
      liveId: r.liveId,
      comments: currentCommentsForLayer,
      samples: sessionSummaryRows,
      visitorCount: opts.officialEventDomBundle?.programStats?.watchCount ?? null,
      officialCommentCount: opts.officialEventDomBundle?.programStats?.commentCount ?? null
    }, {
      broadcasterUserId
    });
    const supportParticipationBase = resolveMarketingSupportParticipationCounts({
      giftUsers: giftUsersForSg,
      giftEvents: giftEventsForAnalytics,
      giftHistoryThrows: giftHistoryThrowsForAnalytics,
      adContributionRanking: adContributionRankingForAnalytics,
      comments: currentCommentsForLayer
    });
    const supportParticipation = {
      ...supportParticipationBase,
      ...supportParticipationPctAgainstVisitors(audienceGap, supportParticipationBase)
    };
    const marketingDataSummary = buildMarketingDataSummary({
      report: r,
      audienceGap,
      giftMomentum,
      supporterChikuran,
      sessionSummaryRows,
      pastBroadcasts: pastBroadcastsForLayer,
      giftUsers: giftUsersForSg,
      giftEvents: giftEventsForAnalytics,
      giftHistoryThrows: giftHistoryThrowsForAnalytics,
      officialGiftHistory: officialGiftHistoryForAnalytics,
      giftContributionRanking: giftContributionRankingForAnalytics,
      adContributionRanking: adContributionRankingForAnalytics,
      programStats: opts.officialEventDomBundle?.programStats || null,
      eventRanking: opts.eventRanking || null
    });
    const allTocItems = [
      { id: "mkt-participation-lead", label: "来場とコメント参加" },
      { id: "mkt-viewer-retention", label: "視聴維持率（最後まで見たか）" },
      { id: "mkt-gift-moments", label: "ギフトの瞬間" },
      { id: "mkt-ad-observed", label: "広告の気づいた時刻" },
      { id: "mkt-data-summary", label: "マーケ総合サマリ" },
      { id: "mkt-audience-gap", label: "来場→コメント変換率" },
      { id: "mkt-supporter-chikuran", label: "応援者ちくらんβ" },
      { id: "mkt-cross-supporter-ranking", label: "横断応援者ランキングβ" },
      { id: "mkt-gift-deep", label: "ギフト深掘り" },
      { id: "mkt-gift-ledger", label: "ギフト投げ履歴" },
      { id: "mkt-supporters-gifts", label: "応援者とギフト" },
      { id: "mkt-media-kit-section", label: "メディアキット" },
      { id: "mkt-html-report-section", label: "コメント記録（全文検索・CSV）" },
      { id: "mkt-event-ranking", label: "イベント順位" },
      { id: "mkt-ext-links", label: "支援物資・外部リンク" },
      { id: "mkt-kpi", label: "KPI サマリ" },
      { id: "mkt-content", label: "コメント本文・属性の傾向" },
      { id: "mkt-narrative", label: "配信内容の流れ" },
      { id: "mkt-quarter", label: "冒頭・終盤（四分位）" },
      { id: "mkt-timeline", label: "コメントタイムライン" },
      { id: "mkt-velocity", label: "コメ速度カーブ（PRO）" },
      { id: "mkt-fatigue", label: "コメント疲労カーブ（PRO）" },
      { id: "mkt-concurrent", label: "同接推移カーブ（PRO）" },
      { id: "mkt-silence", label: "沈黙ゾーン × 沈黙の質（PRO）" },
      { id: "mkt-laughter", label: "笑い密度（PRO）" },
      { id: "mkt-new-vs-repeat", label: "新規 vs 常連（PRO）" },
      { id: "mkt-survival", label: "コメンター生存曲線（PRO）" },
      { id: "mkt-departed", label: "離反コメンター TOP（PRO）" },
      { id: "mkt-attendance", label: "常連出席カレンダー（PRO）" },
      { id: "mkt-keyboard", label: "キーボード型診断（PRO）" },
      { id: "mkt-recent-cmp", label: "直近 5 配信の比較（PRO）" },
      { id: "mkt-weekday-heat", label: "曜日×時間帯ヒートマップ（PRO）" },
      { id: "mkt-growth-meter", label: "成長メーター（PRO）" },
      { id: "mkt-opening-five", label: "冒頭 5 分の予兆（PRO）" },
      { id: "mkt-waveform", label: "似てる配信（波形指紋）（PRO）" },
      { id: "mkt-echo", label: "コメ伝染 × 被り（PRO）" },
      { id: "mkt-first-second", label: "初コメ→2コメ目 latency（PRO）" },
      { id: "mkt-talent-peak", label: "配信者の話芸ピーク（PRO）" },
      { id: "mkt-sentiment", label: "感情曲線（PRO）" },
      { id: "mkt-unique-words", label: "視聴者発の人気語 TOP（PRO）" },
      { id: "mkt-reach", label: "リーチ係数（PRO）" },
      { id: "mkt-derived", label: "累積コメント数と5分窓" },
      { id: "mkt-segment", label: "ユーザーセグメント" },
      { id: "mkt-top-users", label: "トップコメンター TOP 20" },
      { id: "mkt-commenter-follow", label: "数値IDコメンター（フォロー情報）" },
      { id: "mkt-commenter-follow-analytics", label: "フォロー×コメント分析" },
      { id: "mkt-supporter-power", label: "応援者パワー診断（S/A/B/C/D/E）" },
      { id: "mkt-interest-arrival", label: "興味タグ別来場" },
      { id: "mkt-thumb-grid", label: "サムネ付きユーザー一覧" },
      { id: "mkt-vpos", label: "vpos 三分割（再生位置）" },
      { id: "mkt-hour", label: "時間帯ヒートマップ" },
      { id: "mkt-json", label: "表計算・ツール向け JSON" }
    ];
    const cfaAnalyticsShared = (() => {
      const ac = Array.isArray(r.allNumericCommenters) ? r.allNumericCommenters : [];
      if (!ac.length) return null;
      return buildCommenterFollowAnalytics(ac, {
        commenterFollowDataset: r.commenterFollowDataset,
        excludeUserId: broadcasterUserId,
        priorFollowEntries: r.commenterFollowPriorEntries,
        followingListMap: r.commenterFollowingListCache,
        followingListCoverage: r.followingListCoverage,
        durationMs: Math.max(0, Number(r.durationMinutes) || 0) * 6e4,
        includeSupporterPower: true,
        supporterPowerTopN: 10
      });
    })();
    const bodyHtml = `__NL_TOC_PLACEHOLDER__
${sectionHeroCard(r, broadcastNarrative?.summaryLine || "", maskShare, audienceGap)}
${idWrap("mkt-kpi", sectionKpi(r, audienceGap))}
${sectionMarketingDataSummary(marketingDataSummary)}
${sectionAudienceParticipationLead(audienceGap, r, supportParticipation)}
${sectionAudienceEngagementGap(audienceGap, r)}
${buildViewerRetentionSectionHtml(viewerRetention, { maskShare, identiconResolver })}
${sectionSurvivalCurve(survivalCurve)}
${idWrap("mkt-quarter", sectionQuarterEngagement(r))}
${newVsRepeatBasis.ok ? sectionNewVsRepeat(newVsRepeat) : sectionNewVsRepeatUnavailable(newVsRepeatBasis.note)}
${sectionDepartedHeavy(departedHeavy, maskShare, identiconResolver)}
${sectionAttendanceMatrix(attendanceMatrix, maskShare, identiconResolver)}
${idWrap("mkt-narrative", sectionBroadcastNarrative(broadcastNarrative, maskShare))}
${idWrap("mkt-timeline", sectionTimeline(r))}
${sectionCommentVelocityCurve(velocityTimeline)}
${sectionConcurrentTimeline(concurrentSeries, concurrentPeak)}
${sectionSilenceZones(silenceZones)}
${sectionLaughterDensity(laughterDensity)}
${sectionSentimentCurve(sentimentCurve)}
${sectionCommentFatigue(commentFatigue)}
${idWrap("mkt-derived", sectionDerivedTimeline(r))}
${idWrap("mkt-content", sectionContentShape(r))}
${sectionUniqueWordSuggestions(uniqueWords)}
${sectionEchoBursts(echoPropagation, echoSync)}
${sectionTalentPeak(talentPeaks)}
${idWrap("mkt-top-users", sectionTopUsers(r, maskShare, identiconResolver, broadcasterUserId))}
${idWrap("mkt-segment", sectionSegment(r))}
${sectionSupporterChikuranBeta(supporterChikuran, maskShare, identiconResolver)}
${sectionCrossSupporterRanking(crossSupporterRanking, pastBroadcastsForLayer.length)}
${sectionFirstSecondLatency(firstSecondLatency)}
${sectionKeyboardTypes(keyboardTypes)}
${idWrap("mkt-commenter-follow", sectionCommenterFollowDirectory(r, maskShare, identiconResolver, broadcasterUserId))}
${sectionCommenterFollowAnalytics(r, maskShare, broadcasterUserId, { precomputedAnalytics: cfaAnalyticsShared })}
${sectionSupporterPowerDiagnostic(r, maskShare, broadcasterUserId, { precomputedAnalytics: cfaAnalyticsShared }, identiconResolver)}
${idWrap("mkt-thumb-grid", sectionUsersWithThumbnails(r, maskShare, identiconResolver, broadcasterUserId))}
${idWrap("mkt-gift-moments", sectionGiftMoments(giftMomentsAnalysis, giftMomentNextLines, maskShare, identiconResolver))}
${sectionGiftMomentum(giftMomentum, maskShare, identiconResolver)}
${sectionGiftThrowLedger(giftThrowLedger, maskShare, identiconResolver)}
${sectionSupportersGiftsHtml(supportersGiftsRows, {
      maskShare,
      renderIdentity: (row) => giftLedgerUserIdentityCells({ userId: row.userId, senderLabel: row.label, senderAvatarUrl: row.avatarUrl }, maskShare, identiconResolver)
    })}
${idWrap("mkt-ad-observed", adObservedHtml)}
${idWrap("mkt-event-ranking", sectionEventRanking(opts.eventRanking, maskShare, opts.broadcasterProfile ?? null))}
${sectionRecentComparison(recentComparison)}
${sectionGrowthMeter(growth, "今回の総コメ数")}
${sectionOpeningFivePrediction(openingFivePts)}
${sectionWaveformSimilarity(similarBroadcasts)}
${sectionReachCoefficient(reach)}
${sectionWeekdayHourHeatmap(weekdayHourHeat)}
${sectionInterestArrival(r)}
${idWrap("mkt-vpos", sectionVposThirds(r))}
${idWrap("mkt-hour", sectionHourHeatmap(r))}
${idWrap("mkt-ext-links", sectionBroadcasterExternalLinks(opts.noopenerLinks))}
${typeof opts.mediaKitHtml === "string" ? sectionMediaKitHtml(opts.mediaKitHtml) : ""}
${typeof opts.htmlReportHtml === "string" ? sectionHtmlReportChapter(opts.htmlReportHtml) : ""}`;
    const tocItems = allTocItems.filter((t) => bodyHtml.includes(`id="${t.id}"`));
    const finalBody = bodyHtml.replace("__NL_TOC_PLACEHOLDER__", sectionToc(tocItems));
    const broadcasterProfileCardHtml = buildBroadcasterProfileMarketingCardHtml(
      opts?.broadcasterProfile ?? null
    );
    return eagerInlineImages(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>配信マーケ分析 — ${escapeHtml(r.liveId)}</title>
${buildSectionRevealBootScriptHtml()}
<style>${CSS_BODY}${SUPPORTERS_GIFTS_CSS}${BROADCASTER_PROFILE_MARKETING_CSS}${yukkuriBroadcastSummaryEmbeddedCss()}${mangaBroadcastSummaryEmbeddedCss()}</style>
</head>
<body>
<header class="mkt-header">
<h1 class="mkt-header__title">📊 配信マーケティング分析</h1>
<p class="mkt-header__sub">${escapeHtml(r.liveId)} — ${(/* @__PURE__ */ new Date()).toLocaleString("ja-JP")} 出力${escapeHtml(subSuffix)} · JSON埋め込み ${escapeHtml(exportedAtIso)}</p>
</header>
${broadcasterProfileCardHtml}
<main class="mkt-main">
${finalBody}
</main>
<footer class="mkt-footer">追憶のきらめき · マーケ分析（手元用） — ${escapeHtml(exportedAtIso)}</footer>
${idWrap("mkt-json", sectionMachineReadableJson(embedJson, maskShare))}
${buildSectionRevealScriptHtml()}
${MARKETING_RENDER_IDLE_SCRIPT_HTML}
</body></html>`);
  }
  var MARKETING_RENDER_IDLE_SCRIPT_HTML = `<script>(function(){var q=[].slice.call(document.querySelectorAll('.mkt-section'));var idle=window.requestIdleCallback||function(cb){return setTimeout(function(){cb({timeRemaining:function(){return 8}})},50)};function step(d){while(q.length&&d.timeRemaining()>4){q.shift().style.contentVisibility='visible'}if(q.length)idle(step)}function go(){idle(step)}if(document.readyState==='complete')go();else window.addEventListener('load',go)})();<\/script>`;
  function eagerInlineImages(html) {
    return String(html).replace(
      /<img\b[^>]*>/g,
      (tag) => /\ssrc="data:/.test(tag) ? tag.replace(/\sloading="lazy"/, "") : tag
    );
  }
  function sectionBroadcasterExternalLinks(links) {
    if (!Array.isArray(links) || links.length === 0) return "";
    const seen = /* @__PURE__ */ new Set();
    const chips = [];
    for (const l of links) {
      const href = String(l?.href || "").trim();
      if (!/^https?:\/\//i.test(href) || seen.has(href)) continue;
      seen.add(href);
      let label = String(l?.text || "").replace(/\s+/g, " ").trim();
      if (!label) {
        try {
          label = new URL(href).hostname.replace(/^www\./, "");
        } catch {
          label = href;
        }
      }
      if (label.length > 60) label = `${label.slice(0, 57)}…`;
      chips.push(
        `<a class="mkt-ext-link-chip" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
      );
      if (chips.length >= 20) break;
    }
    if (chips.length === 0) return "";
    return `<section class="mkt-section mkt-section--ext-links" aria-label="支援物資・外部リンク">
<h2>🔗 支援物資・外部リンク</h2>
<p class="mkt-note">配信ページに記載された外部リンク（欲しいものリスト・支援物資・SNS 等）です。リンク先は配信者の管理下にあります。</p>
<div class="mkt-ext-link-chips">${chips.join("")}</div>
</section>`;
  }
  function idWrap(id, html) {
    if (!html) return "";
    return html.replace(/<section\b/, `<section id="${id}"`);
  }
  function sectionUsersWithThumbnails(r, maskShare, identiconResolver, broadcasterUserId) {
    if (maskShare) return "";
    if (!Array.isArray(r.topUsers) || r.topUsers.length === 0) return "";
    const { numericIdUsers, anonymousUsers } = categorizeUsersForThumbGrid(
      r.topUsers,
      {
        identiconResolver,
        maxNumeric: 60,
        maxAnonymous: 60,
        broadcasterUserId
      }
    );
    if (numericIdUsers.length === 0 && anonymousUsers.length === 0) return "";
    const followByUid = /* @__PURE__ */ new Map();
    for (const u of r.allNumericCommenters || []) {
      const uid = String(u.userId || "").trim();
      if (uid) followByUid.set(uid, u);
    }
    const cellHtml = (u) => {
      const uidForLabel = u.userId || UNKNOWN_USER_KEY;
      const rawLabel = displayUserLabel(u.userId, u.nickname || "");
      const labelHtml = buildUserProfileLinkedLabelHtml(uidForLabel, rawLabel);
      const countText = `${u.count}件`;
      const followHtml = followerInlineHtml(followByUid.get(String(u.userId || "")) || null, maskShare);
      const avatarInner = `<span class="mkt-thumb-grid__avatar-wrap"><img class="mkt-thumb-grid__avatar" src="${escapeHtml(u.thumbSrc)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${DEFAULT_USERICON_ONERROR_ATTR}></span>`;
      const searchHay = `${rawLabel} ${uidForLabel}`.toLowerCase();
      return `<li class="mkt-thumb-grid__cell" data-search="${escapeAttr(searchHay)}">
${wrapThumbWithProfileLink(u.userId, avatarInner)}
<span class="mkt-thumb-grid__label">${labelHtml}</span>
${followHtml}
<span class="mkt-thumb-grid__count">${escapeHtml(countText)}</span>
</li>`;
    };
    const numericBlock = numericIdUsers.length > 0 ? `<h3 class="mkt-thumb-grid__heading">数値 ID（個人サムネ・ニコ既定アイコン）<span class="mkt-thumb-grid__heading-count">${numericIdUsers.length}名</span></h3>
<ol class="mkt-thumb-grid">${numericIdUsers.map(cellHtml).join("")}</ol>` : "";
    const anonymousBlock = anonymousUsers.length > 0 ? `<h3 class="mkt-thumb-grid__heading">匿名（識別子から生成した identicon）<span class="mkt-thumb-grid__heading-count">${anonymousUsers.length}名</span></h3>
<ol class="mkt-thumb-grid">${anonymousUsers.map(cellHtml).join("")}</ol>` : "";
    const searchBoxHtml = `<div class="mkt-thumb-grid__search">
<label class="mkt-thumb-grid__search-label" for="mktThumbGridSearch">名前・ID で絞り込む</label>
<input id="mktThumbGridSearch" class="mkt-thumb-grid__search-input" type="search" placeholder="例: あやりん / 78759947" autocomplete="off">
<div id="mktThumbGridSearchResult" class="mkt-note mkt-thumb-grid__search-result" role="status" aria-live="polite"></div>
</div>`;
    return `<section class="mkt-section mkt-section--thumb-grid" aria-label="サムネ付きユーザー一覧">
<h2>サムネ付きユーザー一覧</h2>
<p class="mkt-note">アイコンが解決できた応援ユーザーをコメ件数の多い順、種別ごとに並べました（各カテゴリ最大 60 名）。アイコンは ① 個人サムネ ② ニコ既定アイコン ③ 識別子から生成した identicon の優先順で選びます。</p>
${searchBoxHtml}
<p class="mkt-spec-note">※ 表示名はコメ記録時点のもの（仕様）。配信者がニコニコでハンドル名を変更した場合、ここの表示と niconico の最新表示が異なることがあります。リアルタイム取得は行っていないため（API 連発によるレート制限を避けるため）、最新名は ID クリック先のユーザーページで確認できます。</p>
${numericBlock}
${anonymousBlock}
<script>
(function () {
  var input = document.getElementById('mktThumbGridSearch');
  var result = document.getElementById('mktThumbGridSearchResult');
  if (!input || !result) return;
  var section = input.closest('.mkt-section--thumb-grid');
  if (!section) return;
  var cells = Array.prototype.slice.call(section.querySelectorAll('.mkt-thumb-grid__cell'));
  var total = cells.length;
  // ★hay は初回に1度だけ読んで配列に持つ(入力のたびに getAttribute しない)。
  //   セルごとの所属リストも先に控えておき、見出しの表示判定を O(リスト数) で終える。
  var hays = [];
  var lists = [];
  var cellList = [];
  for (var p = 0; p < cells.length; p++) {
    hays.push(String(cells[p].getAttribute('data-search') || ''));
    var parent = cells[p].parentElement;
    var li = lists.indexOf(parent);
    if (li === -1) { li = lists.length; lists.push(parent); }
    cellList.push(li);
  }
  var update = function () {
    var kw = String(input.value || '').toLowerCase().trim();
    var visible = 0;
    var liveByList = [];
    for (var z = 0; z < lists.length; z++) liveByList.push(0);
    for (var i = 0; i < cells.length; i++) {
      var hit = !kw || hays[i].indexOf(kw) !== -1;
      cells[i].style.display = hit ? '' : 'none';
      if (hit) { visible++; liveByList[cellList[i]]++; }
    }
    // 見出し(数値ID/匿名)は、その直後のリストが全滅したら一緒に隠す。
    //   ここで querySelector を使うと入力のたびに全走査になり重い(2026-07-31 の実測で
    //   マーケ分析が開かなくなった)。上で数えた件数だけで判定する。
    for (var h = 0; h < lists.length; h++) {
      var list = lists[h];
      if (!list) continue;
      var any = liveByList[h] > 0;
      list.style.display = any ? '' : 'none';
      var heading = list.previousElementSibling;
      if (heading && heading.classList && heading.classList.contains('mkt-thumb-grid__heading')) {
        heading.style.display = any ? '' : 'none';
      }
    }
    if (!kw) {
      result.textContent = '検索対象: ' + total + ' 名';
      return;
    }
    // ★0件のとき「居ない」と誤解させない。この一覧は各カテゴリ最大60名の上限がある。
    result.textContent = visible > 0
      ? '検索結果: ' + visible + ' / ' + total + ' 名'
      : '該当なし（0 / ' + total + ' 名）― この一覧はコメ件数の多い順に各カテゴリ最大 60 名までです。発言が少ない方はここに載らないことがあります。';
  };
  input.addEventListener('input', update);
  update();
})();
<\/script>
</section>`;
  }
  function sectionMachineReadableJson(embedJson, maskShare) {
    const maskNote = maskShare ? "この出力では共有向けに<strong>伏せ字</strong>を付けており、JSON 内のトップコメンターの表示名・ID も伏せ、アイコン URL は空です。" : "手元用のため ID がそのまま入ります。第三者に渡すときは拡張の「伏せ字」チェック付きで書き出してください。";
    return `<section class="mkt-section mkt-section--embed" aria-label="JSON データ">
<h2>表計算・ツール向け JSON</h2>
<p class="mkt-note">${maskNote} 中身は <code>id="nl-marketing-export-v1"</code> の <code>script</code> 要素にあります（<code>schemaVersion</code>・<code>report</code> 形式）。</p>
<script type="application/json" id="nl-marketing-export-v1">${embedJson}<\/script>
</section>`;
  }
  function finiteIntOrNull(v) {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    return Math.trunc(v);
  }
  function formatEventRankingNumber(v) {
    const n = finiteIntOrNull(v);
    return n == null ? "—" : n.toLocaleString("ja-JP");
  }
  function safeEventRankingThumbnailUrl(v) {
    const s = String(v == null ? "" : v).trim();
    return /^https?:/i.test(s) ? s : "";
  }
  function sectionEventRanking(eventRanking, maskShare, broadcasterProfile) {
    if (!eventRanking || typeof eventRanking !== "object") return "";
    const model = (
      /** @type {EventRankingReportModel} */
      eventRanking
    );
    const rows = Array.isArray(model.rows) ? model.rows : [];
    const eventName = String(model.eventName || "").trim();
    const self = model.self && typeof model.self === "object" ? model.self : null;
    if (!eventName && !self && rows.length === 0) return "";
    const selfUid = String(
      broadcasterProfile && /** @type {any} */
      broadcasterProfile.userId || ""
    ).trim();
    const selfRank = self ? finiteIntOrNull(self.rank) : null;
    const selfScore = self ? finiteIntOrNull(self.score) : null;
    const selfDiff = self ? finiteIntOrNull(self.diffToNext) : null;
    const selfName = self ? String(self.broadcasterName || "").trim() : "";
    const nextRankLabel = selfRank != null && selfRank > 1 && selfDiff != null && selfDiff > 0 ? `あと💎${selfDiff.toLocaleString("ja-JP")} で ${selfRank - 1}位` : "上位との差分なし";
    const selfHtml = self ? `<div class="mkt-event-self" aria-label="本人のイベント順位">
<div class="mkt-event-self__card"><span class="mkt-event-self__label">現在順位</span><strong>${escapeHtml(selfRank == null ? "—" : `${selfRank.toLocaleString("ja-JP")}位`)}</strong></div>
<div class="mkt-event-self__card"><span class="mkt-event-self__label">累計💎</span><strong>${escapeHtml(formatEventRankingNumber(selfScore))}</strong></div>
<div class="mkt-event-self__card"><span class="mkt-event-self__label">${/^\d{1,18}$/.test(selfUid) ? buildUserProfileLinkedLabelHtml(selfUid, selfName || "本人") : escapeHtml(selfName || "本人")}</span><strong>${escapeHtml(nextRankLabel)}</strong></div>
</div>` : "";
    const topRows = rows.slice(0, 10).map((row) => {
      const rank = finiteIntOrNull(row?.rank);
      const score = finiteIntOrNull(row?.score);
      if (rank == null || rank <= 0) return "";
      const name = String(row?.name || "").trim() || "名無し";
      const rowUid = String(row?.userId || "").trim();
      const nameHtml = /^\d{1,18}$/.test(rowUid) ? buildUserProfileLinkedLabelHtml(rowUid, name) : escapeHtml(name);
      const thumbSrc = safeEventRankingThumbnailUrl(row?.thumbnailUrl);
      const thumbHtml = wrapThumbWithProfileLink(
        rowUid,
        thumbSrc ? `<img class="mkt-event-rank__thumb" src="${escapeAttr(thumbSrc)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.hidden=true">` : '<span class="mkt-event-rank__thumb mkt-event-rank__thumb--empty"></span>'
      );
      const anon = row?.isAnonymous === true ? '<span class="mkt-event-rank__anon">匿名</span>' : "";
      return `<tr>
<td class="mkt-event-rank__rank">${escapeHtml(`${rank}位`)}</td>
<td class="mkt-event-rank__thumb-cell">${thumbHtml}</td>
<td class="mkt-event-rank__name">${nameHtml}${anon}</td>
<td class="mkt-event-rank__score">💎${escapeHtml(formatEventRankingNumber(score))}</td>
</tr>`;
    }).filter(Boolean).join("");
    const tableHtml = topRows ? `<h3 class="mkt-event-rank__subhead">参加配信者TOP</h3>
<div class="mkt-event-rank__table-wrap"><table class="mkt-event-rank__table"><tbody>${topRows}</tbody></table></div>` : '<p class="mkt-note">参加配信者TOPはまだ取得できていません。</p>';
    const staleNote = model.isStale ? '<p class="mkt-note mkt-event-rank__stale">少し前に取得した値です。最新の順位とは異なる場合があります。</p>' : "";
    const maskNote = maskShare ? '<p class="mkt-note">イベント順位は公開ランキング由来のため、共有向け出力でも配信者名を表示します。</p>' : "";
    return `<section class="mkt-section mkt-section--event-ranking" aria-label="イベント順位">
<h2>🏆 イベント順位</h2>
${eventName ? `<p class="mkt-event-rank__event-name">${escapeHtml(eventName)}</p>` : ""}
${selfHtml}
${tableHtml}
${staleNote}
${maskNote}
</section>`;
  }
  function sectionHeroCard(r, summaryLine, maskShare, gap) {
    const copyId = "mkt-hero-copy-btn";
    const participation = gap ? resolveCommentParticipation(r, gap) : null;
    const participationLine = participation && participation.totalVisitors > 0 ? `来場${participation.totalVisitors.toLocaleString()}人中${participation.uniqueCommenters.toLocaleString()}人がコメント（${participation.commentParticipationPct}%）` : "";
    const participantPeople = resolveParticipantPeople(r);
    const baseLine = `${r.totalComments.toLocaleString()}件 / ${participantPeople.people.toLocaleString()}人 / ${r.durationMinutes}分`;
    const copyText = maskShare ? participationLine ? `${participationLine} · ${baseLine}` : baseLine : summaryLine || (participationLine ? `${participationLine} · ${baseLine}` : baseLine);
    const copyScript = `<script>
(function(){
  var btn=document.getElementById('${copyId}');
  if(!btn)return;
  btn.addEventListener('click',function(){
    var t=${JSON.stringify(copyText)};
    if(navigator.clipboard){navigator.clipboard.writeText(t).then(function(){btn.textContent='✅ コピーしました';setTimeout(function(){btn.textContent='📋 一言まとめをコピー';},2000);})}
    else{var ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();btn.textContent='✅ コピーしました';setTimeout(function(){btn.textContent='📋 一言まとめをコピー';},2000);}
  });
})();
<\/script>`;
    const participationStat = participation && participation.totalVisitors > 0 ? `<span class="mkt-hero-stat mkt-hero-stat--participation"><span class="mkt-hero-stat__val">${escapeHtml(`${participation.uniqueCommenters.toLocaleString()}/${participation.totalVisitors.toLocaleString()}`)}</span><span class="mkt-hero-stat__label">コメント参加（${escapeHtml(String(participation.commentParticipationPct))}%）</span></span>
<span class="mkt-hero-stat__sep">·</span>` : "";
    return `<section class="mkt-section mkt-hero-card" aria-label="配信ハイライト">
<div class="mkt-hero-summary">${escapeHtml(copyText)}</div>
<div class="mkt-hero-stats">
${participationStat}<span class="mkt-hero-stat"><span class="mkt-hero-stat__val">${escapeHtml(r.totalComments.toLocaleString())}</span><span class="mkt-hero-stat__label">コメント</span></span>
<span class="mkt-hero-stat__sep">·</span>
<span class="mkt-hero-stat"><span class="mkt-hero-stat__val">${escapeHtml(participantPeople.people.toLocaleString())}</span><span class="mkt-hero-stat__label">参加者</span></span>
<span class="mkt-hero-stat__sep">·</span>
<span class="mkt-hero-stat"><span class="mkt-hero-stat__val">${escapeHtml(String(r.durationMinutes))}</span><span class="mkt-hero-stat__label">分</span></span>
</div>
${participantPeople.unattributed > 0 ? `<div class="mkt-hero-note">※ID不明のコメント ${escapeHtml(participantPeople.unattributed.toLocaleString())}件は、誰の発言か分からないため参加者の人数に含めていません</div>` : ""}
<button id="${copyId}" class="mkt-hero-copy">📋 一言まとめをコピー</button>
${copyScript}
</section>`;
  }
  function sectionKpi(r, gap) {
    const participation = gap ? resolveCommentParticipation(r, gap) : null;
    const cards = [];
    if (participation && participation.totalVisitors > 0) {
      cards.push({
        label: "コメントした人",
        value: `${participation.uniqueCommenters.toLocaleString()} / ${participation.totalVisitors.toLocaleString()}来場（${participation.commentParticipationPct}%）`,
        icon: "🗣️"
      });
    } else if (participation && participation.uniqueCommenters > 0) {
      cards.push({
        label: "コメントした人",
        value: `${participation.uniqueCommenters.toLocaleString()}人`,
        icon: "🗣️"
      });
    }
    cards.push(
      { label: "総コメント数", value: r.totalComments.toLocaleString(), icon: "💬" },
      { label: "ユニークユーザー", value: resolveParticipantPeople(r).people.toLocaleString(), icon: "👥" },
      { label: "コメント/分", value: String(r.commentsPerMinute), icon: "⚡" },
      { label: "平均コメント/人", value: String(r.avgCommentsPerUser), icon: "📈" },
      { label: "中央値/人", value: String(r.medianCommentsPerUser), icon: "📊" },
      { label: "配信時間", value: `${r.durationMinutes} 分`, icon: "⏱️" },
      { label: "ピーク分", value: `${r.peakMinute} 分目（${r.peakMinuteCount} コメ）`, icon: "🔥" }
    );
    const inner = cards.map(
      (c) => `<div class="mkt-kpi"><span class="mkt-kpi__icon">${c.icon}</span><span class="mkt-kpi__val">${escapeHtml(c.value)}</span><span class="mkt-kpi__label">${escapeHtml(c.label)}</span></div>`
    ).join("");
    return `<section class="mkt-section"><h2>KPI サマリ</h2><div class="mkt-kpi-grid">${inner}</div></section>`;
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
      return `<rect x="${x.toFixed(1)}" y="${(pad + innerH - h).toFixed(1)}" width="${barW}" height="${h.toFixed(1)}" fill="#3b82f6" opacity="0.6"><title>${b.minute}分: ${b.count}コメ / ${b.uniqueUsers}人</title></rect>`;
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
<h2>コメントタイムライン</h2>
<p class="mkt-note">青バー＝コメント数/分 / オレンジ線＝ユニークユーザー数/分</p>
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
      { label: "ヘビー（10+）", count: s.heavy, color: "#ef4444" },
      { label: "ミドル（4-9）", count: s.mid, color: "#f97316" },
      { label: "ライト（2-3）", count: s.light, color: "#3b82f6" },
      { label: "一見（1）", count: s.once, color: "#94a3b8" }
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
      return `<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${sg.color}"><title>${sg.label}: ${sg.count}人 (${(pct * 100).toFixed(1)}%)</title></path>`;
    }).join("");
    const legend = segs.map(
      (sg) => `<span class="mkt-leg"><span class="mkt-leg__dot" style="background:${sg.color}"></span>${escapeHtml(sg.label)} ${sg.count}人</span>`
    ).join("");
    return `<section class="mkt-section">
<h2>ユーザーセグメント</h2>
<p class="mkt-note">コメント回数でユーザーを4層に分類</p>
<div class="mkt-seg-wrap">
<svg viewBox="0 0 200 200" class="mkt-pie">${paths}</svg>
<div class="mkt-seg-legend">${legend}</div>
</div></section>`;
  }
  function memberAccountBadgeHtml(accountStatus) {
    if (accountStatus === 2) return '<span class="mkt-acct-badge mkt-acct-badge--prem">プレミアム</span>';
    if (accountStatus === 1) return '<span class="mkt-acct-badge mkt-acct-badge--reg">一般</span>';
    return "";
  }
  function followerInlineHtml(u, maskShare) {
    if (maskShare || !u) return "";
    const parts = [];
    if (typeof u.followerCount === "number" && u.followerCount >= 0) {
      parts.push(`フォロワー ${formatEventRankingNumber(u.followerCount)}`);
    }
    if (typeof u.followeeCount === "number" && u.followeeCount >= 0) {
      parts.push(`フォロー ${formatEventRankingNumber(u.followeeCount)}`);
    }
    if (typeof u.userLevel === "number" && u.userLevel > 0) {
      parts.push(`LV${u.userLevel}`);
    }
    if (!parts.length) return "";
    return `<span class="mkt-follow-chip">${escapeHtml(parts.join(" / "))}</span>`;
  }
  var COMMENTER_FOLLOW_TABLE_INITIAL_ROWS = 40;
  var COMMENTER_FOLLOW_SCATTER_MAX_POINTS = 600;
  function commenterFollowExpandScriptHtml() {
    return `<script>
(function(){
  var btn=document.querySelector('.mkt-cf-more-btn');
  if(!btn)return;
  btn.addEventListener('click',function(){
    document.querySelectorAll('.mkt-cf-row--hidden').forEach(function(row){
      row.classList.remove('mkt-cf-row--hidden');
    });
    var wrap=btn.closest('.mkt-cf-more-wrap');
    if(wrap)wrap.remove();
  });
})();
<\/script>`;
  }
  function sectionCommenterFollowDirectory(r, maskShare, identiconResolver = void 0, broadcasterUserId = "", sectionOpts = {}) {
    const sectionId = String(sectionOpts.sectionId || "mkt-commenter-follow").trim();
    const src = Array.isArray(r.allNumericCommenters) ? r.allNumericCommenters : [];
    const broadcasterUid = String(broadcasterUserId || "").trim();
    const users = broadcasterUid ? src.filter((u) => String(u.userId || "").trim() !== broadcasterUid) : src;
    if (!users.length) return "";
    const ds = r.commenterFollowDataset;
    const dsNote = ds && typeof ds.withFollowData === "number" && typeof ds.totalNumericCommenters === "number" ? `（スナップショット: ${ds.withFollowData}/${ds.totalNumericCommenters} 名にフォロー情報）` : "";
    const rows = users.map((u, i) => {
      const rawLabel = displayUserLabel(u.userId, u.nickname || "");
      const nameCellHtml = maskShare ? escapeHtml(maskLabelForShare(rawLabel)) : buildUserProfileLinkedLabelHtml(u.userId, rawLabel);
      const badgeHtml = maskShare ? "" : memberAccountBadgeHtml(u.accountStatus);
      const thumbSrc = maskShare ? "" : resolveReportUserThumbSrc({
        userId: u.userId || "",
        avatarUrl: u.avatarUrl || "",
        identiconResolver
      });
      const thumbInner = thumbSrc ? `<img class="mkt-cf-thumb" src="${escapeHtml(thumbSrc)}" alt="" width="28" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${DEFAULT_USERICON_ONERROR_ATTR}>` : '<span class="mkt-cf-thumb mkt-cf-thumb--empty"></span>';
      const thumbCell = wrapThumbWithProfileLink(u.userId, thumbInner, maskShare);
      const followers = typeof u.followerCount === "number" ? formatEventRankingNumber(u.followerCount) : "—";
      const following = typeof u.followeeCount === "number" ? formatEventRankingNumber(u.followeeCount) : "—";
      const level = typeof u.userLevel === "number" && u.userLevel > 0 ? String(u.userLevel) : "—";
      const prem = u.isPremium === true ? "プレミアム" : u.isPremium === false ? "一般" : "—";
      const hiddenClass = i >= COMMENTER_FOLLOW_TABLE_INITIAL_ROWS ? " mkt-cf-row mkt-cf-row--hidden" : " mkt-cf-row";
      return `<tr class="${hiddenClass.trim()}">
<td data-label="#">${i + 1}</td>
<td data-label="サムネ">${thumbCell}</td>
<td data-label="ユーザー" class="mkt-cf-user">${nameCellHtml}${badgeHtml}</td>
<td data-label="コメ">${u.count}</td>
<td data-label="フォロワー" class="mkt-num">${escapeHtml(followers)}</td>
<td data-label="フォロー" class="mkt-num">${escapeHtml(following)}</td>
<td data-label="LV" class="mkt-num">${escapeHtml(level)}</td>
<td data-label="会員">${escapeHtml(prem)}</td>
</tr>`;
    }).join("");
    const hiddenCount = Math.max(0, users.length - COMMENTER_FOLLOW_TABLE_INITIAL_ROWS);
    const moreHtml = hiddenCount > 0 ? `<p class="mkt-cf-more-wrap"><button type="button" class="mkt-cf-more-btn">残り ${hiddenCount} 名を表示（スクロール軽量化のため折りたたみ中）</button></p>${commenterFollowExpandScriptHtml()}` : "";
    return `<section class="mkt-section mkt-section--commenter-follow" id="${escapeAttr(sectionId)}">
<h2>数値IDコメンター一覧（フォロー情報）</h2>
<p class="mkt-note">記録に現れた数値 userId ユーザー ${users.length} 名をコメ数順に並べ、背景取得できたフォロワー/フォロー/LV/会員情報を載せます${escapeHtml(dsNote ? ` ${dsNote}` : "")}。</p>
<p class="mkt-spec-note">※ フォロー情報は配信中に少数ずつ取得するため、DL時点で未取得の行は「—」です。同じ配信を開いたまま時間を置くか、再DLすると埋まります。横断キャッシュ（24h）で別配信でも再利用します。</p>
<div class="mkt-table-scroll"><table class="mkt-rank mkt-cf-table">
<thead><tr><th>#</th><th>サムネ</th><th>ユーザー</th><th>コメ</th><th>フォロワー</th><th>フォロー</th><th>LV</th><th>会員</th></tr></thead>
<tbody>${rows}</tbody>
</table></div>
${moreHtml}
</section>`;
  }
  function commenterFollowSegmentColor(segmentId) {
    if (segmentId === "highFollowerRegulars") return "#38bdf8";
    if (segmentId === "localEnthusiasts") return "#f59e0b";
    if (segmentId === "quietSupporters") return "#a78bfa";
    return "#64748b";
  }
  function formatCommenterFollowPct(value) {
    return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
  }
  function commenterFollowScatterSvg(analytics) {
    const points = analytics.scatterPoints;
    if (points.length === 0) {
      return '<p class="mkt-note">フォロワー数が取れたコメンターがまだいないため、散布図は未表示です。時間を置いて再DLすると点が増えます。</p>';
    }
    const W = 900;
    const H = 320;
    const padL = 62;
    const padR = 24;
    const padT = 22;
    const padB = 46;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const maxX = Math.max(
      1,
      analytics.thresholds.followerCount.threshold,
      ...points.map((p) => p.followerCount)
    );
    const maxY = Math.max(
      1,
      analytics.thresholds.commentCount.threshold,
      ...points.map((p) => p.commentCount)
    );
    const xOf = (v) => padL + Math.max(0, Math.min(maxX, v)) / maxX * innerW;
    const yOf = (v) => padT + innerH - Math.max(0, Math.min(maxY, v)) / maxY * innerH;
    const tickValues = [0, 0.25, 0.5, 0.75, 1];
    const xTicks = tickValues.map((ratio) => {
      const x = padL + ratio * innerW;
      const value = Math.round(maxX * ratio);
      return `<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${padT + innerH}" class="mkt-cfa-grid-line"></line><text x="${x.toFixed(1)}" y="${H - 18}" text-anchor="middle" class="mkt-axis">${formatEventRankingNumber(value)}</text>`;
    }).join("");
    const yTicks = tickValues.map((ratio) => {
      const y = padT + innerH - ratio * innerH;
      const value = Math.round(maxY * ratio);
      return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + innerW}" y2="${y.toFixed(1)}" class="mkt-cfa-grid-line"></line><text x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="mkt-axis">${formatEventRankingNumber(value)}</text>`;
    }).join("");
    const thresholdX = xOf(analytics.thresholds.followerCount.threshold);
    const thresholdY = yOf(analytics.thresholds.commentCount.threshold);
    const thresholdLines = analytics.thresholds.sampleSize > 0 ? `<line x1="${thresholdX.toFixed(1)}" y1="${padT}" x2="${thresholdX.toFixed(1)}" y2="${padT + innerH}" class="mkt-cfa-threshold"></line><line x1="${padL}" y1="${thresholdY.toFixed(1)}" x2="${padL + innerW}" y2="${thresholdY.toFixed(1)}" class="mkt-cfa-threshold"></line>` : "";
    const plotted = points.slice(0, COMMENTER_FOLLOW_SCATTER_MAX_POINTS);
    const circles = plotted.map((p) => {
      const title = `${p.label} / フォロワー ${formatEventRankingNumber(p.followerCount)} / コメ ${formatEventRankingNumber(p.commentCount)}`;
      return `<circle cx="${xOf(p.followerCount).toFixed(1)}" cy="${yOf(p.commentCount).toFixed(1)}" r="4" fill="${commenterFollowSegmentColor(p.segmentId)}" fill-opacity=".82"><title>${escapeHtml(title)}</title></circle>`;
    }).join("");
    const sampleNote = points.length > plotted.length ? `<p class="mkt-note">散布図は表示負荷を抑えるため、コメ数上位 ${plotted.length} 点を描画しています。CSV には全員分が入ります。</p>` : "";
    const legend = [
      ["highFollowerRegulars", "高フォロワー常連"],
      ["localEnthusiasts", "ローカル熱心層"],
      ["quietSupporters", "静かな支援"],
      ["other", "その他"]
    ].map(
      ([id, label]) => `<span class="mkt-cfa-legend-item"><i style="background:${commenterFollowSegmentColor(
        /** @type {any} */
        id
      )}"></i>${escapeHtml(label)}</span>`
    ).join("");
    return `<div class="mkt-chart-wrap mkt-cfa-chart-wrap">
<svg viewBox="0 0 ${W} ${H}" class="mkt-svg mkt-cfa-svg" role="img" aria-label="フォロワー数とコメント数の散布図">
<rect x="${padL}" y="${padT}" width="${innerW}" height="${innerH}" class="mkt-cfa-plot-bg"></rect>
${xTicks}${yTicks}${thresholdLines}
<line x1="${padL}" y1="${padT + innerH}" x2="${padL + innerW}" y2="${padT + innerH}" class="mkt-cfa-axis-line"></line>
<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + innerH}" class="mkt-cfa-axis-line"></line>
${circles}
<text x="${padL + innerW / 2}" y="${H - 4}" text-anchor="middle" class="mkt-axis">フォロワー数</text>
<text x="14" y="${padT + innerH / 2}" text-anchor="middle" class="mkt-axis" transform="rotate(-90 14 ${padT + innerH / 2})">コメント数</text>
</svg>
</div>
<div class="mkt-cfa-legend">${legend}</div>
${sampleNote}`;
  }
  function commenterFollowSegmentCardsHtml(analytics) {
    const segments = [
      analytics.segments.highFollowerRegulars,
      analytics.segments.localEnthusiasts,
      analytics.segments.quietSupporters
    ];
    const head = segments.map(
      (seg) => `<li><span class="mkt-cfa-card__dot" style="background:${commenterFollowSegmentColor(seg.id)}"></span><strong>${escapeHtml(seg.label)}</strong> ${formatEventRankingNumber(seg.count)}名 <small>${escapeHtml(formatCommenterFollowPct(seg.pctOfFollowed))}</small> — ${escapeHtml(seg.description)}</li>`
    ).join("");
    const rows = segments.flatMap(
      (seg) => seg.representatives.map((row) => {
        const rawLabel = displayUserLabel(row.userId, row.nickname || "");
        return `<tr><td><span class="mkt-cfa-card__dot" style="background:${commenterFollowSegmentColor(seg.id)}"></span> ${escapeHtml(seg.label)}</td><td>${buildUserProfileLinkedLabelHtml(row.userId, rawLabel)}</td><td class="mkt-num">${formatEventRankingNumber(row.commentCount)}</td><td class="mkt-num">${formatEventRankingNumber(row.followerCount)}</td></tr>`;
      })
    ).join("");
    const table = rows ? `<div class="mkt-table-scroll"><table class="mkt-rank mkt-cfa-seg-table"><thead><tr><th>層</th><th>ユーザー</th><th>コメ</th><th>フォロワー</th></tr></thead><tbody>${rows}</tbody></table></div>` : "";
    return `<ul class="mkt-cfa-seg-legend">${head}</ul>${table}`;
  }
  function commenterFollowCsvDownloadScriptHtml(buttonId) {
    return `<script>
(function(){
  var btn=document.getElementById(${JSON.stringify(buttonId)});
  if(!btn)return;
  function first(values){for(var i=0;i<values.length;i++){if(values[i]!==undefined&&values[i]!==null&&values[i]!=='')return values[i];}return '';}
  function csvCell(value){
    if(value===undefined||value===null)return '';
    var s=String(value);
    return /[",\\r\\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
  }
  function toInt(value){
    var n=Number(value);
    return Number.isFinite(n)&&n>=0?Math.floor(n):'';
  }
  function normalize(src, follow){
    src=src||{}; follow=follow||{};
    var userId=String(first([src.userId,follow.userId])).trim();
    if(!userId)return null;
    return {
      userId:userId,
      nickname:String(first([src.nickname,follow.nickname])),
      commentCount:toInt(first([src.count,src.commentCount,follow.commentCount])),
      followerCount:toInt(first([src.followerCount,follow.followerCount])),
      followeeCount:toInt(first([src.followeeCount,follow.followeeCount])),
      userLevel:toInt(first([src.userLevel,src.level,follow.userLevel,follow.level])),
      isPremium:first([src.isPremium,follow.isPremium]),
      accountStatus:toInt(src.accountStatus),
      firstAt:toInt(src.firstAt),
      lastAt:toInt(src.lastAt),
      followFetchedAt:toInt(first([src.followFetchedAt,follow.followFetchedAt,follow.fetchedAt])),
      avatarUrl:String(first([src.avatarUrl,follow.avatarUrl]))
    };
  }
  btn.addEventListener('click',function(){
    var script=document.getElementById('nl-marketing-export-v1');
    if(!script){btn.textContent='JSON が見つかりません';return;}
    var payload;
    try{payload=JSON.parse(script.textContent||'{}');}
    catch(e){btn.textContent='JSON を読めません';return;}
    var report=payload.report||{};
    var all=Array.isArray(report.allNumericCommenters)?report.allNumericCommenters:[];
    var followRows=report.commenterFollowDataset&&Array.isArray(report.commenterFollowDataset.rows)?report.commenterFollowDataset.rows:[];
    var followByUid={};
    followRows.forEach(function(row){
      var uid=String(row&&row.userId||'').trim();
      if(uid)followByUid[uid]=row;
    });
    var rows=[];
    var seen={};
    all.forEach(function(src){
      var uid=String(src&&src.userId||'').trim();
      var row=normalize(src,uid?followByUid[uid]:null);
      if(row){rows.push(row);seen[row.userId]=true;}
    });
    followRows.forEach(function(follow){
      var uid=String(follow&&follow.userId||'').trim();
      if(!uid||seen[uid])return;
      var row=normalize(follow,null);
      if(row)rows.push(row);
    });
    var headers=['userId','nickname','commentCount','followerCount','followeeCount','userLevel','isPremium','accountStatus','firstAt','lastAt','followFetchedAt','avatarUrl'];
    var lines=[headers.join(',')].concat(rows.map(function(row){return headers.map(function(key){return csvCell(row[key]);}).join(',');}));
    var blob=new Blob(['\\ufeff'+lines.join('\\r\\n')],{type:'text/csv;charset=utf-8'});
    var a=document.createElement('a');
    var url=URL.createObjectURL(blob);
    var liveId=String(payload.liveId||report.liveId||'marketing').replace(/[^a-zA-Z0-9_-]/g,'');
    a.href=url;
    a.download='commenter-follow-'+(liveId||'marketing')+'.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},15000);
    var old=btn.textContent;
    btn.textContent='CSV を作成しました';
    setTimeout(function(){btn.textContent=old;},1800);
  });
})();
<\/script>`;
  }
  function commenterFollowDeltaPanelHtml(deltas, timing) {
    const deltaRows = (rows, sign) => rows.slice(0, 5).map(
      (row) => `<tr>
<td data-label="ユーザー">${escapeHtml(row.nickname || row.userId)}</td>
<td data-label="フォロワー差" class="mkt-num">${sign}${formatEventRankingNumber(Math.abs(row.followerDelta))}</td>
<td data-label="フォロー差" class="mkt-num">${row.followeeDelta >= 0 ? "+" : ""}${formatEventRankingNumber(row.followeeDelta)}</td>
<td data-label="コメント" class="mkt-num">${formatEventRankingNumber(row.commentCount)}</td>
</tr>`
    ).join("");
    const timingRows = timing.buckets.map(
      (b) => `<tr>
<td data-label="時間帯">${escapeHtml(b.label)}</td>
<td data-label="コメンター" class="mkt-num">${formatEventRankingNumber(b.commenterCount)}</td>
<td data-label="増" class="mkt-num">${formatEventRankingNumber(b.increasedCount)}</td>
<td data-label="減" class="mkt-num">${formatEventRankingNumber(b.decreasedCount)}</td>
<td data-label="純増" class="mkt-num">${b.netFollowerDelta >= 0 ? "+" : ""}${formatEventRankingNumber(b.netFollowerDelta)}</td>
</tr>`
    ).join("");
    const insights = deltas.insightLines.length ? `<ul class="mkt-insight-list">${deltas.insightLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : "";
    const incRows = deltaRows(deltas.increased, "+");
    const decRows = deltaRows(deltas.decreased, "-");
    const timingHasData = timing.buckets.some((b) => b.increasedCount > 0 || b.decreasedCount > 0);
    if (!incRows && !decRows && !timingHasData) return "";
    const timingInsights = timing.insightLines.length ? `<ul class="mkt-insight-list">${timing.insightLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : "";
    return `<div class="mkt-cfa-delta">
<h3 class="mkt-subhead">フォロー増減（前回キャッシュ比較）</h3>
<p class="mkt-note">配信前後の差分は横断キャッシュと今回スナップショットの比較です。配信内のリアルタイム増減ではありません。</p>
${insights}
${incRows || decRows ? `<div class="mkt-cfa-delta-grid">
${incRows ? `<div><h4 class="mkt-cfa-delta__title">増えた人 TOP</h4>
<div class="mkt-table-scroll"><table class="mkt-rank"><thead><tr><th>ユーザー</th><th>フォロワー差</th><th>フォロー差</th><th>コメント</th></tr></thead><tbody>${incRows}</tbody></table></div></div>` : ""}
${decRows ? `<div><h4 class="mkt-cfa-delta__title">減った人 TOP</h4>
<div class="mkt-table-scroll"><table class="mkt-rank"><thead><tr><th>ユーザー</th><th>フォロワー差</th><th>フォロー差</th><th>コメント</th></tr></thead><tbody>${decRows}</tbody></table></div></div>` : ""}
</div>` : ""}
${timingHasData ? `<h3 class="mkt-subhead">初コメ時刻帯 × 増減</h3>
${timingInsights}
<div class="mkt-table-scroll"><table class="mkt-rank mkt-cfa-timing-table"><thead><tr><th>時間帯</th><th>コメンター</th><th>増</th><th>減</th><th>純増</th></tr></thead><tbody>${timingRows}</tbody></table></div>` : ""}
</div>`;
  }
  function commenterFolloweeProfilePanelHtml(profile) {
    if (!profile.sampleSize && !profile.insightLines.length) return "";
    const bucketRows = (buckets) => buckets.filter((b) => b.count > 0).map(
      (b) => `<tr><td data-label="区分">${escapeHtml(b.label)}</td><td data-label="人数" class="mkt-num">${formatEventRankingNumber(b.count)}</td><td data-label="比率" class="mkt-num">${b.pct}%</td></tr>`
    ).join("");
    const insights = profile.insightLines.length ? `<ul class="mkt-insight-list">${profile.insightLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : "";
    const followeeRows = bucketRows(profile.followeeBuckets);
    const levelRows = bucketRows(profile.levelBuckets);
    const distTable = (title, rowsHtml) => rowsHtml ? `<div><h4 class="mkt-cfa-delta__title">${title}</h4>
<div class="mkt-table-scroll"><table class="mkt-rank"><thead><tr><th>区分</th><th>人数</th><th>比率</th></tr></thead><tbody>${rowsHtml}</tbody></table></div></div>` : "";
    const distGrid = followeeRows || levelRows ? `<div class="mkt-cfa-profile-grid">
${distTable("フォロー数分布", followeeRows)}
${distTable("LV 分布", levelRows)}
</div>` : "";
    return `<div class="mkt-cfa-profile">
<h3 class="mkt-subhead">コメンターのフォロー先・属性傾向</h3>
<p class="mkt-note">フォロー先リスト自体は取得していません。各コメンターの「フォロー数（followee）」・LV・プレミアム率から、視聴者層の広がりを推定します。</p>
${insights}
${distGrid}
</div>`;
  }
  function commenterFollowingListPanelHtml(analytics, r) {
    const cov = r.followingListCoverage;
    const notes = [];
    if (cov?.loginRequired > 0) {
      notes.push(
        "ニコニコにログインした状態でレポートを出力すると、上位コメンターのフォロー先一覧が取得できます。"
      );
    }
    if ((cov?.error ?? 0) > 0 && !(cov?.loginRequired ?? 0)) {
      notes.push(
        `${cov.error}名のフォロー一覧取得に失敗しました。ログイン状態を確認のうえ、レポートを再出力してください。`
      );
    }
    if (cov?.notAttempted > 0 && (cov?.attempted ?? 0) === 0) {
      notes.push("フォロー一覧は未取得です。配信中またはレポート出力時に上位コメンターから順に取得します。");
    }
    const noteHtml = notes.length ? notes.map((line) => `<p class="mkt-spec-note">${escapeHtml(line)}</p>`).join("") : "";
    const bf = analytics.broadcasterFollow;
    const bfCard = bf.broadcasterUserId && bf.sampleSize > 0 ? `<div class="mkt-cfa-stat"><span>配信者フォロー</span><strong>${escapeHtml(String(bf.followedCount))} / ${escapeHtml(String(bf.sampleSize))}名（${escapeHtml(String(bf.pct))}%）</strong><small>フォロー一覧取得済みコメンター</small></div>` : "";
    const commonRows = (analytics.commonFollowees || []).slice(0, 15).map(
      (row) => `<tr>
<td data-label="userId">${buildUserProfileLinkedLabelHtml(row.userId, row.userId)}</td>
<td data-label="重複" class="mkt-num">${formatEventRankingNumber(row.overlapCount)}名</td>
</tr>`
    ).join("");
    const commonTable = commonRows ? `<h3 class="mkt-subhead">共通フォロー先 TOP</h3>
<p class="mkt-note">複数の上位コメンターが共通してフォローしている userId です。</p>
<div class="mkt-table-scroll"><table class="mkt-rank"><thead><tr><th>userId</th><th>重複人数</th></tr></thead><tbody>${commonRows}</tbody></table></div>` : "";
    const followingInsightLines = (analytics.followingListInsights || []).filter(
      (line) => !(noteHtml && /取得に失敗|ログイン/.test(String(line)))
    );
    const insights = followingInsightLines.length ? `<ul class="mkt-insight-list">${followingInsightLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : "";
    if (!noteHtml && !bfCard && !commonTable && !insights) return "";
    return `<div class="mkt-cfa-following-list">
<h3 class="mkt-subhead">フォロー先一覧分析</h3>
${noteHtml}
${insights}
<div class="mkt-cfa-stats">${bfCard}</div>
${commonTable}
</div>`;
  }
  function sectionInterestArrival(r) {
    const summary = r.interestArrivalSummary;
    if (!summary || summary.messageCount <= 0) return "";
    const stats = [
      {
        label: "来場人数（合算）",
        value: `${formatEventRankingNumber(summary.totalArrivals)}人`,
        hint: "各通知の人数を合算"
      },
      {
        label: "興味タグ種類",
        value: `${formatEventRankingNumber(summary.uniqueTags)}種`,
        hint: "ユニークタグ数"
      },
      {
        label: "通知回数",
        value: `${formatEventRankingNumber(summary.messageCount)}回`,
        hint: "システムコメ行数"
      }
    ].map(
      (card) => `<div class="mkt-ia-stat"><span>${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong><small>${escapeHtml(card.hint)}</small></div>`
    ).join("");
    const rows = summary.topTags.map((row, i) => {
      const pct = summary.totalArrivals > 0 ? Math.round(row.arrivals / summary.totalArrivals * 1e3) / 10 : 0;
      return `<tr>
<td>${i + 1}</td>
<td>${escapeHtml(row.tag)}</td>
<td>${formatEventRankingNumber(row.arrivals)}人</td>
<td>${formatEventRankingNumber(row.messageCount)}回</td>
<td>${pct}%</td>
</tr>`;
    }).join("");
    return `<section class="mkt-section mkt-section--interest-arrival" id="mkt-interest-arrival">
<h2>興味タグ別来場（公式システムコメ）</h2>
<p class="mkt-note">ニコ公式の集計通知です。視聴者プロフィールの「好きなタグ」に基づく来場人数のお知らせで、個人は特定できません。</p>
<div class="mkt-ia-stats">${stats}</div>
<div class="mkt-ia-table-wrap">
<table class="mkt-ia-table">
<thead><tr><th>#</th><th>タグ</th><th>来場人数</th><th>通知回数</th><th>人数シェア</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</div>
</section>`;
  }
  function sectionCommenterFollowAnalytics(r, maskShare, broadcasterUserId = "", sectionOpts = {}) {
    const sectionId = String(sectionOpts.sectionId || "mkt-commenter-follow-analytics").trim();
    const allNumericCommenters = Array.isArray(r.allNumericCommenters) ? r.allNumericCommenters : [];
    if (!allNumericCommenters.length) return "";
    if (maskShare) {
      return `<section class="mkt-section mkt-section--commenter-follow-analytics" id="${escapeAttr(sectionId)}">
<h2>フォロー×コメント分析</h2>
<p class="mkt-note">共有向け出力では、個人単位の散布図・セグメント代表例・CSV ダウンロードを非表示にしています。手元用で書き出すと確認できます。</p>
</section>`;
    }
    const analytics = sectionOpts.precomputedAnalytics || buildCommenterFollowAnalytics(allNumericCommenters, {
      commenterFollowDataset: r.commenterFollowDataset,
      excludeUserId: broadcasterUserId,
      priorFollowEntries: r.commenterFollowPriorEntries,
      followingListMap: r.commenterFollowingListCache,
      followingListCoverage: r.followingListCoverage,
      durationMs: Math.max(0, Number(r.durationMinutes) || 0) * 6e4
    });
    if (!analytics.rows.length) return "";
    const threshold = analytics.thresholds;
    const csvButtonId = String(sectionOpts.csvButtonId || "mkt-commenter-follow-csv").trim();
    const csvButton = analytics.rows.length > 0 ? `<button type="button" id="${csvButtonId}" class="mkt-cfa-csv-btn">CSV をダウンロード</button>${commenterFollowCsvDownloadScriptHtml(csvButtonId)}` : "";
    const stats = [
      { label: "数値IDコメンター", value: `${formatEventRankingNumber(analytics.rows.length)}名`, hint: "CSV は全員分" },
      { label: "フォロー情報あり", value: `${formatEventRankingNumber(analytics.rowsWithFollowerCount.length)}名`, hint: "散布図の母数" },
      {
        label: "高フォロワーしきい値",
        value: formatEventRankingNumber(threshold.followerCount.threshold),
        hint: `p${threshold.highPercentile}`
      },
      {
        label: "高コメントしきい値",
        value: `${formatEventRankingNumber(threshold.commentCount.threshold)}件`,
        hint: `p${threshold.highPercentile}`
      }
    ].map(
      (card) => `<div class="mkt-cfa-stat"><span>${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong><small>${escapeHtml(card.hint)}</small></div>`
    ).join("");
    return `<section class="mkt-section mkt-section--commenter-follow-analytics" id="${escapeAttr(sectionId)}">
<h2>フォロー×コメント分析</h2>
<p class="mkt-note">数値 ID コメンターを、フォロワー数（横軸）とこの配信でのコメント数（縦軸）で見ます。しきい値は取得済みデータの中央値・上位パーセンタイルから自動計算した目安です。</p>
<div class="mkt-cfa-toolbar">${csvButton}</div>
<div class="mkt-cfa-stats">${stats}</div>
${commenterFollowScatterSvg(analytics)}
<div class="mkt-cfa-segtable">${commenterFollowSegmentCardsHtml(analytics)}</div>
${commenterFollowDeltaPanelHtml(analytics.followDeltas, analytics.followTiming)}
${commenterFolloweeProfilePanelHtml(analytics.followeeProfile)}
${commenterFollowingListPanelHtml(analytics, r)}
</section>`;
  }
  function sectionSupporterPowerDiagnostic(r, maskShare, broadcasterUserId = "", sectionOpts = {}, identiconResolver = void 0) {
    const sectionId = String(sectionOpts.sectionId || "mkt-supporter-power").trim();
    const allNumericCommenters = Array.isArray(r.allNumericCommenters) ? r.allNumericCommenters : [];
    if (!allNumericCommenters.length) return "";
    const analytics = (sectionOpts.precomputedAnalytics && sectionOpts.precomputedAnalytics.supporterPowerRows ? sectionOpts.precomputedAnalytics : null) || buildCommenterFollowAnalytics(allNumericCommenters, {
      commenterFollowDataset: r.commenterFollowDataset,
      excludeUserId: broadcasterUserId,
      priorFollowEntries: r.commenterFollowPriorEntries,
      followingListMap: r.commenterFollowingListCache,
      followingListCoverage: r.followingListCoverage,
      durationMs: Math.max(0, Number(r.durationMinutes) || 0) * 6e4,
      includeSupporterPower: true,
      supporterPowerTopN: 10
    });
    if (!analytics.supporterPowerRows || analytics.supporterPowerRows.length === 0) return "";
    const summary = analytics.supporterPowerSummary;
    if (!summary) return "";
    const TIER_STYLE = {
      S: { badge: "#f59e0b", bg: "rgba(245, 158, 11, 0.14)", label: "最上位" },
      A: { badge: "#ef4444", bg: "rgba(239, 68, 68, 0.13)", label: "強い支援" },
      B: { badge: "#3b82f6", bg: "rgba(59, 130, 246, 0.13)", label: "目立つ支援" },
      C: { badge: "#22c55e", bg: "rgba(34, 197, 94, 0.12)", label: "安定参加" },
      D: { badge: "#94a3b8", bg: "rgba(148, 163, 184, 0.10)", label: "軽参加" },
      E: { badge: "#52525b", bg: "rgba(82, 82, 91, 0.10)", label: "観測少" }
    };
    const tierBarParts = (
      /** @type {const} */
      ["S", "A", "B", "C", "D", "E"].map((t) => {
        const count = summary.tierCounts[t] || 0;
        if (count === 0) return "";
        const pct = count / Math.max(1, summary.sampleSize) * 100;
        return `<span class="mkt-spd-bar__seg" style="flex:${pct} 0 0%;background:${TIER_STYLE[t].badge};" title="${t}: ${count}名"></span>`;
      }).filter((s) => s).join("")
    );
    const tierTable = (
      /** @type {const} */
      ["S", "A", "B", "C", "D", "E"].map((t) => {
        const count = summary.tierCounts[t] || 0;
        const style = TIER_STYLE[t];
        return `<tr>
<td><span class="mkt-spd-badge" style="background:${style.bg};color:${style.badge};border-color:${style.badge};">${t}</span></td>
<td>${escapeHtml(style.label)}</td>
<td style="text-align:right;">${formatEventRankingNumber(count)}名</td>
</tr>`;
      }).join("")
    );
    if (maskShare) {
      return `<section class="mkt-section mkt-section--supporter-power" id="${escapeAttr(sectionId)}">
<h2>応援者パワー診断</h2>
<p class="mkt-note">配信を支えた応援者を「応援量45%＋常連度35%＋外部影響20%」で 0〜100 点にし、S/A/B/C/D/E の階級で見ます。共有向け出力では Tier 別の人数集計のみ表示しています。</p>
<div class="mkt-spd-stats">
<div class="mkt-spd-stat"><span>診断対象</span><strong>${formatEventRankingNumber(summary.sampleSize)}名</strong></div>
<div class="mkt-spd-stat"><span>中央値スコア</span><strong>${formatEventRankingNumber(summary.medianScore)}点</strong></div>
</div>
<div class="mkt-spd-bar" role="img" aria-label="Tier別の構成比">${tierBarParts}</div>
<table class="mkt-spd-tier-table"><thead><tr><th>階級</th><th>意味</th><th style="text-align:right;">人数</th></tr></thead><tbody>${tierTable}</tbody></table>
</section>`;
    }
    const avatarLookup = {};
    for (const u of allNumericCommenters) {
      const uid = String(u?.userId || "").trim();
      if (!uid) continue;
      avatarLookup[uid] = {
        avatarUrl: String(u?.avatarUrl || "").trim(),
        accountStatus: typeof u?.accountStatus === "number" ? u.accountStatus : void 0
      };
    }
    const topRows = summary.topRows.map((row, i) => {
      const style = TIER_STYLE[row.power.tier];
      const eng = Math.round(row.power.components.engagement);
      const loy = Math.round(row.power.components.loyalty);
      const inf = Math.round(row.power.components.influence);
      const followerStr = typeof row.followerCount === "number" ? formatEventRankingNumber(row.followerCount) : "—";
      const segmentLabel = (() => {
        switch (row.segmentId) {
          case "highFollowerRegulars":
            return "高フォロワー常連";
          case "localEnthusiasts":
            return "ローカル熱心層";
          case "quietSupporters":
            return "静かな支援";
          default:
            return "";
        }
      })();
      const lookup = avatarLookup[row.userId] || {};
      const thumbSrc = maskShare ? "" : resolveReportUserThumbSrc({
        userId: row.userId,
        avatarUrl: lookup.avatarUrl || "",
        identiconResolver
      });
      const thumbInner = thumbSrc ? `<img class="mkt-spd-thumb" src="${escapeHtml(thumbSrc)}" alt="" width="28" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${DEFAULT_USERICON_ONERROR_ATTR}>` : '<span class="mkt-spd-thumb mkt-spd-thumb--empty"></span>';
      const thumbCell = wrapThumbWithProfileLink(row.userId, thumbInner, maskShare);
      const nickname = escapeHtml(row.nickname || row.userId);
      const segmentLabelHtml = segmentLabel ? `<span class="mkt-spd-segment-label">${escapeHtml(segmentLabel)}</span>` : "";
      const nameCellHtml = !maskShare && /^\d{1,18}$/.test(row.userId) ? `<a class="mkt-spd-user-link" href="https://www.nicovideo.jp/user/${encodeURIComponent(row.userId)}" target="_blank" rel="noopener noreferrer">${nickname}</a>${segmentLabelHtml}` : `${nickname}${segmentLabelHtml}`;
      return `<tr style="background:${style.bg};">
<td style="text-align:right;font-weight:600;">${i + 1}</td>
<td><span class="mkt-spd-badge" style="background:#ffffff;color:${style.badge};border-color:${style.badge};">${row.power.tier}</span></td>
<td><strong>${formatEventRankingNumber(row.power.score)}</strong><span class="mkt-spd-pct"> (p${row.power.percentile})</span></td>
<td>${thumbCell}</td>
<td>${nameCellHtml}</td>
<td style="text-align:right;">${formatEventRankingNumber(row.commentCount)}</td>
<td style="text-align:right;">${followerStr}</td>
<td class="mkt-spd-components">
<span class="mkt-spd-comp" title="応援量(コメ+ギフト)">応援 ${eng}</span>
<span class="mkt-spd-comp" title="常連度">常連 ${loy}</span>
<span class="mkt-spd-comp" title="外部影響(フォロワー等)">影響 ${inf}</span>
</td>
</tr>`;
    }).join("");
    return `<section class="mkt-section mkt-section--supporter-power" id="${escapeAttr(sectionId)}">
<h2>応援者パワー診断</h2>
<p class="mkt-note">配信を支えた応援者を「応援量45%＋常連度35%＋外部影響20%」で 0〜100 点にし、S/A/B/C/D/E の階級で表示します。フォロワー数だけで上位化しない設計で、コメント量・常連度を最重視します。</p>
<div class="mkt-spd-stats">
<div class="mkt-spd-stat"><span>診断対象</span><strong>${formatEventRankingNumber(summary.sampleSize)}名</strong></div>
<div class="mkt-spd-stat"><span>中央値スコア</span><strong>${formatEventRankingNumber(summary.medianScore)}点</strong></div>
</div>
<div class="mkt-spd-bar" role="img" aria-label="Tier別の構成比">${tierBarParts}</div>
<table class="mkt-spd-tier-table"><thead><tr><th>階級</th><th>意味</th><th style="text-align:right;">人数</th></tr></thead><tbody>${tierTable}</tbody></table>
<h3 class="mkt-spd-top-heading">トップ ${summary.topRows.length} 応援者</h3>
<table class="mkt-spd-top-table"><thead><tr><th>順位</th><th>階級</th><th>スコア</th><th>サムネ</th><th>名前</th><th>コメ</th><th>フォロワー</th><th>内訳</th></tr></thead><tbody>${topRows}</tbody></table>
<p class="mkt-note mkt-spd-formula-note">スコア計算: 応援量(コメ70%＋ギフト30%)・常連度(直近30配信)・外部影響(フォロワー60%＋LV20%＋フォロー先10%＋プレミアム10%)を log 正規化＋偏差値で合算。<br>Tier 判定: S=score≥90&amp;偏差99 / A=80&amp;95 / B=65&amp;80 / C=50&amp;50 / D=35 / E。サンプル20名未満はスコアのみ、5名未満は最高 A。<br>サムネ・名前は数値ID時のみ niconico ユーザーページへリンクします(共有モードでは非表示)。</p>
</section>`;
  }
  function sectionTopUsers(r, maskShare = false, identiconResolver = void 0, broadcasterUserId = "") {
    if (r.topUsers.length === 0) return "";
    const broadcasterUid = String(broadcasterUserId || "").trim();
    const filteredTopUsers = broadcasterUid ? r.topUsers.filter((u) => String(u.userId || "").trim() !== broadcasterUid) : r.topUsers;
    if (filteredTopUsers.length === 0) return "";
    const maxCount = filteredTopUsers[0].count;
    const rows = filteredTopUsers.slice(0, 20).map((u, i) => {
      const pct = u.count / Math.max(1, maxCount) * 100;
      const resolvedAvatar = maskShare ? "" : resolveReportUserThumbSrc({
        userId: u.userId || "",
        avatarUrl: u.avatarUrl || "",
        identiconResolver
      });
      const avImg = wrapThumbWithProfileLink(
        u.userId,
        !resolvedAvatar ? '<span class="mkt-rank-av mkt-rank-av--empty"></span>' : `<img src="${escapeHtml(resolvedAvatar)}" class="mkt-rank-av" alt="" loading="lazy" referrerpolicy="no-referrer">`,
        maskShare
      );
      const uidForLabel = u.userId || UNKNOWN_USER_KEY;
      const rawLabel = u.userId ? displayUserLabel(u.userId, u.nickname || "") : u.nickname || "—";
      const nameCellHtml = maskShare ? escapeHtml(maskLabelForShare(rawLabel)) : buildUserProfileLinkedLabelHtml(uidForLabel, rawLabel);
      const badgeHtml = maskShare ? "" : memberAccountBadgeHtml(u.accountStatus);
      const followHtml = followerInlineHtml(u, maskShare);
      return `<tr>
<td class="mkt-rank-n">${i + 1}</td>
<td>${avImg}</td>
<td class="mkt-rank-name">${nameCellHtml}${badgeHtml}${followHtml}</td>
<td class="mkt-rank-bar"><div class="mkt-rank-bar__fill" style="width:${pct.toFixed(1)}%"></div><span class="mkt-rank-bar__label">${u.count}</span></td>
</tr>`;
    }).join("");
    const note = maskShare ? '<p class="mkt-note">共有向け: 表示名は伏せ字です。件数バーはそのままです（特定用途では件数もマスク検討ください）。</p>' : "";
    return `<section class="mkt-section">
<h2>トップコメンター TOP 20</h2>
${note}
<table class="mkt-rank-table"><tbody>${rows}</tbody></table>
</section>`;
  }
  function sectionHourHeatmap(r) {
    const max = Math.max(1, ...r.hourDistribution);
    const cells = r.hourDistribution.map((v, h) => {
      const intensity = v / max;
      const alpha = Math.max(0.08, intensity);
      return `<div class="mkt-hour" style="background:rgba(59,130,246,${alpha.toFixed(2)})" title="${h}時: ${v}件"><span class="mkt-hour__label">${h}</span><span class="mkt-hour__val">${v}</span></div>`;
    }).join("");
    return `<section class="mkt-section">
<h2>時間帯ヒートマップ</h2>
<p class="mkt-note">コメントが多い時間帯ほど濃い青</p>
<div class="mkt-hour-grid">${cells}</div>
</section>`;
  }
  var CSS_BODY = `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;font-family:'Segoe UI','Hiragino Sans',sans-serif;background:#0f172a;color:#e2e8f0;line-height:1.65;-webkit-text-size-adjust:100%;font-size:16px}
.mkt-header{padding:2rem 1.5rem 1rem;background:linear-gradient(135deg,#1e293b,#0f172a);border-bottom:1px solid #334155}
.mkt-header__title{margin:0;font-size:1.6rem;font-weight:700}
.mkt-header__sub{margin:.3rem 0 0;font-size:.85rem;color:#94a3b8}
.mkt-main{max-width:1440px;margin:0 auto;padding:1.5rem clamp(1rem,2.5vw,2.5rem)}
.mkt-cf-row--hidden{display:none}
.mkt-cf-more-wrap{margin:.75rem 0 0;text-align:center}
.mkt-cf-more-btn{cursor:pointer;border:1px solid #475569;background:#0f172a;color:#cbd5e1;border-radius:999px;padding:.45rem 1rem;font-size:.82rem}
.mkt-cf-more-btn:hover{border-color:#93c5fd;color:#f8fafc}
.mkt-thumb-grid__cell{content-visibility:auto;contain-intrinsic-size:auto 88px}
.mkt-section{content-visibility:auto;contain-intrinsic-size:auto 360px;contain:layout style paint;background:#1e293b;border-radius:12px;padding:1.2rem 1.4rem;margin-bottom:1.2rem;border:1px solid #334155;scroll-margin-top:1rem}
.mkt-section h2{margin:0 0 .8rem;font-size:1.1rem;line-height:1.35;color:#f8fafc;border-left:4px solid #3b82f6;padding-left:.6rem}
.mkt-section p,.mkt-section li{overflow-wrap:anywhere}
html.mkt-section-reveal-enabled .mkt-section{opacity:0;transform:translateY(18px) scale(.985);filter:saturate(.72);transition:opacity .34s ease,transform .38s cubic-bezier(.2,.8,.2,1),filter .34s ease,border-color .34s ease,box-shadow .34s ease;will-change:opacity,transform,filter}
html.mkt-section-reveal-enabled .mkt-section.mkt-section--reveal{opacity:1;transform:none;filter:none}
html.mkt-section-reveal-enabled .mkt-section.mkt-section--revealing{border-color:rgba(250,204,21,.78);box-shadow:0 0 0 1px rgba(250,204,21,.2),0 14px 34px rgba(14,165,233,.18)}
html.mkt-section-reveal-done .mkt-section{will-change:auto}
.mkt-reveal-control{position:fixed;right:16px;bottom:16px;z-index:60;display:flex;align-items:center;gap:.45rem;max-width:min(calc(100% - 24px),440px);padding:.45rem .55rem;border:1px solid rgba(148,163,184,.35);border-radius:12px;background:rgba(15,23,42,.94);box-shadow:0 14px 34px rgba(0,0,0,.32);backdrop-filter:blur(10px)}
.mkt-reveal-control__status{font-size:.75rem;line-height:1.3;color:#cbd5e1;white-space:nowrap}
.mkt-reveal-btn{cursor:pointer;border:1px solid #475569;background:#111827;color:#e2e8f0;border-radius:999px;padding:.42rem .75rem;font-size:.75rem;font-weight:700;line-height:1.2;white-space:nowrap}
.mkt-reveal-btn:hover{border-color:#93c5fd;color:#f8fafc;background:#17233a}
.mkt-reveal-btn:disabled{cursor:default;opacity:.62}
.mkt-reveal-btn--sound.is-ready{border-color:#22c55e;color:#bbf7d0;background:#052e16}
.mkt-reveal-btn--skip{border-color:#f59e0b;color:#fde68a}
.mkt-reveal-control.is-done .mkt-reveal-btn--skip{border-color:#475569;color:#cbd5e1;background:#0f172a}
@media(max-width:640px){
  .mkt-reveal-control{left:.65rem;right:.65rem;bottom:.65rem;max-width:none;justify-content:space-between;flex-wrap:wrap}
  .mkt-reveal-control__status{flex:1 1 100%}
}
@media(prefers-reduced-motion:reduce){
  html.mkt-section-reveal-enabled .mkt-section{opacity:1;transform:none;filter:none;transition:none;will-change:auto}
  .mkt-reveal-control{display:none}
}
@media print{
  html.mkt-section-reveal-enabled .mkt-section{opacity:1;transform:none;filter:none;transition:none;will-change:auto}
  .mkt-reveal-control{display:none!important}
}
.mkt-subhead{margin:1rem 0 .55rem;font-size:.95rem;line-height:1.4;color:#f8fafc}
.mkt-section--toc{background:#0f172a}
.mkt-toc{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.45rem}
.mkt-toc__link{display:block;color:#bfdbfe;text-decoration:none;font-size:.84rem;line-height:1.35;background:#111c31;border:1px solid #26364f;border-radius:8px;padding:.5rem .65rem}
.mkt-toc__link:hover{border-color:#60a5fa;background:#16233a}
.mkt-pro-tag{display:inline-block;font-size:.68rem;font-weight:700;color:#f0f9ff;background:linear-gradient(135deg,#a855f7,#7c3aed);border-radius:6px;padding:1px 6px;margin-left:.4rem;vertical-align:middle;letter-spacing:.04em}
.mkt-mini-stats{margin:.6rem 0 0;padding-left:1.2rem;font-size:.85rem;color:#cbd5e1}
.mkt-mini-stats li{margin-bottom:.15rem}
.mkt-quality-pill{display:inline-block;border-radius:6px;padding:1px 8px;color:#0f172a;font-size:.72rem;font-weight:600}
.mkt-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.78rem;color:#cbd5e1;word-break:break-all}
.mkt-attendance{font-size:.75rem}
.mkt-attendance th,.mkt-attendance td{padding:.25rem .35rem;text-align:center}
.mkt-attendance th:first-child,.mkt-attendance td:first-child{text-align:left;min-width:140px}
.mkt-att-cell{font-family:ui-monospace,monospace;font-weight:700}
.mkt-att-cell--on{color:#22c55e}
.mkt-att-cell--off{color:#475569}
.mkt-heatmap{font-size:.65rem}
.mkt-heatmap th,.mkt-heatmap td{padding:.15rem .25rem;text-align:center;min-width:1.6rem}
.mkt-heat-cell{color:#f8fafc;font-weight:700}
.mkt-bar{background:#1e3a5a;border-radius:4px;height:14px;width:100%;overflow:hidden}
.mkt-bar__fill{display:block;height:100%}
.mkt-departed-thumb{width:24px;height:24px;border-radius:6px;object-fit:cover;display:inline-block;background:#0f172a}
.mkt-departed-thumb--empty{border:1px dashed #334155}
.mkt-note{font-size:.78rem;color:#aab6c8;margin:0 0 .6rem}
.mkt-spec-note{font-size:.72rem;color:#fbbf24;background:rgba(251,191,36,0.08);border-left:3px solid #fbbf24;padding:.4rem .6rem;margin:0 0 .8rem;border-radius:0 4px 4px 0}
.mkt-section--participation-lead h2{border-left-color:#34d399}
.mkt-participation-headline{margin:.35rem 0 .65rem;font-size:clamp(1.05rem,3.2vw,1.35rem);line-height:1.55;color:#ecfdf5;font-weight:700}
.mkt-participation-lead-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem;margin:.5rem 0 .75rem}
.mkt-participation-lead-grid--four{grid-template-columns:repeat(auto-fit,minmax(min(100%,9.5rem),1fr))}
.mkt-participation-lead-card{background:linear-gradient(160deg,#0f172a,#111827);border:1px solid #334155;border-radius:14px;padding:clamp(.85rem,3vw,1.1rem);min-width:0;text-align:center}
.mkt-participation-lead-card--visitors{border-color:rgba(56,189,248,.45);box-shadow:0 0 18px rgba(56,189,248,.08)}
.mkt-participation-lead-card--commenters{border-color:rgba(52,211,153,.45);box-shadow:0 0 18px rgba(52,211,153,.08)}
.mkt-participation-lead-card--gift{border-color:rgba(251,191,36,.45);box-shadow:0 0 18px rgba(251,191,36,.08)}
.mkt-participation-lead-card--ad{border-color:rgba(244,114,182,.45);box-shadow:0 0 18px rgba(244,114,182,.08)}
.mkt-participation-lead-card__label{display:block;font-size:.74rem;color:#94a3b8;margin-bottom:.25rem;letter-spacing:.03em}
.mkt-participation-lead-card__value{display:block;font-size:clamp(1.55rem,5vw,2.15rem);line-height:1.15;color:#f8fafc;font-weight:800;overflow-wrap:anywhere}
.mkt-participation-lead-card__hint{display:block;margin-top:.35rem;font-size:.72rem;color:#cbd5e1;line-height:1.45}
.mkt-participation-lead-insight{margin:.15rem 0 .55rem;font-size:.84rem;color:#dbeafe;line-height:1.55}
.mkt-hero-card{background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);border:1px solid #38bdf8;border-radius:16px;padding:clamp(1rem,4vw,1.6rem);text-align:center;box-shadow:0 0 24px rgba(56,189,248,.15)}
.mkt-hero-summary{font-size:clamp(.9rem,2.5vw,1.1rem);color:#e2e8f0;line-height:1.6;margin:0 0 .8rem}
.mkt-hero-stats{display:flex;align-items:center;justify-content:center;gap:.5rem;flex-wrap:wrap;margin:0 0 1rem}
.mkt-hero-stat{display:flex;flex-direction:column;align-items:center;gap:.1rem}
.mkt-hero-stat__val{font-size:clamp(1.4rem,5vw,2rem);font-weight:700;color:#38bdf8;line-height:1}
.mkt-hero-stat__label{font-size:.72rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em}
.mkt-hero-stat__sep{color:#475569;font-size:1.5rem;line-height:1;margin:0 .25rem}
.mkt-hero-note{font-size:.75rem;opacity:.8;margin:.4rem 0 .2rem}
.mkt-hero-copy{background:#0284c7;color:#fff;border:none;border-radius:8px;padding:.5rem 1.1rem;font-size:.85rem;cursor:pointer;transition:background .15s}
.mkt-hero-copy:hover{background:#0369a1}
.mkt-kpi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.8rem}
.mkt-kpi{background:#0f172a;border-radius:10px;padding:.8rem;text-align:center;border:1px solid #334155}
.mkt-kpi__icon{font-size:1.4rem;display:block}
.mkt-kpi__val{font-size:1.3rem;font-weight:700;display:block;color:#f8fafc}
.mkt-kpi__label{font-size:.72rem;color:#94a3b8}
.mkt-kpi--compact .mkt-kpi__val{font-size:1.05rem;line-height:1.25}
.mkt-kpi--compact .mkt-kpi__label{font-size:.68rem;line-height:1.3}
.mkt-leg-inline{font-weight:700;margin:0 .2rem}
.mkt-note--legend{margin-top:.35rem}
.mkt-svg--vpos{max-height:168px}
.mkt-chart-wrap{overflow-x:auto}
.mkt-svg{width:100%;height:auto;max-height:260px}
.mkt-axis{font-size:10px;fill:#94a3b8}
.mkt-seg-wrap{display:flex;align-items:center;gap:2rem;flex-wrap:wrap}
.mkt-pie{width:180px;height:180px;flex-shrink:0}
.mkt-seg-legend{display:flex;flex-direction:column;gap:.5rem}
.mkt-leg{display:flex;align-items:center;gap:.4rem;font-size:.85rem}
.mkt-leg__dot{width:12px;height:12px;border-radius:3px;flex-shrink:0}
.mkt-rank-table{width:100%;border-collapse:collapse;table-layout:fixed}
.mkt-rank-table td:nth-child(1){width:2.5rem}.mkt-rank-table td:nth-child(2){width:40px}.mkt-rank-table td:nth-child(3){width:clamp(9rem,32%,22rem)}
.mkt-rank-table td{padding:.35rem .4rem;border-bottom:1px solid #1e293b}
.mkt-table-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
.mkt-rank{width:100%;border-collapse:collapse;font-size:.83rem}
.mkt-rank th,.mkt-rank td{padding:.44rem .5rem;border-bottom:1px solid #334155;text-align:left;vertical-align:top}
.mkt-rank th{font-size:.72rem;color:#94a3b8;font-weight:700;white-space:nowrap;background:#17233a}
.mkt-rank td{color:#dbeafe}
.mkt-num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.mkt-rank-n{width:2rem;color:#94a3b8;text-align:right;font-size:.8rem}
.mkt-rank-av{width:28px;height:28px;border-radius:50%;object-fit:cover;display:block}
.mkt-rank-av--empty{background:#334155}
.mkt-rank-name{font-size:.85rem;overflow:hidden}
.mkt-rank-name>.nl-user-profile-link,.mkt-rank-name>span:not(.mkt-acct-badge):not(.mkt-follow-chip){display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom}
.mkt-follow-chip{display:block;margin-top:2px;font-size:.7rem;color:#94a3b8;white-space:normal}
.mkt-section--commenter-follow h2{border-left-color:#22d3ee}
.mkt-cf-thumb{width:28px;height:28px;border-radius:50%;object-fit:cover;background:#0f172a;vertical-align:middle}
.mkt-cf-thumb--empty{display:inline-block;width:28px;height:28px;border:1px solid #334155;border-radius:50%}
.mkt-cf-user .nl-user-profile-link{color:#93c5fd}
.mkt-section--commenter-follow-analytics h2{border-left-color:#93c5fd}
.mkt-cfa-toolbar{display:flex;justify-content:flex-end;gap:.5rem;margin:0 0 .75rem;flex-wrap:wrap}
.mkt-cfa-csv-btn{cursor:pointer;border:1px solid rgba(147,197,253,.55);background:#0f172a;color:#dbeafe;border-radius:8px;padding:.48rem .8rem;font-size:.82rem;font-weight:700}
.mkt-cfa-csv-btn:hover{background:#17233a;border-color:#bfdbfe;color:#f8fafc}
.mkt-cfa-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.65rem;margin:.65rem 0 .9rem}
.mkt-cfa-stat{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:.65rem .75rem;min-width:0}
.mkt-cfa-stat span{display:block;font-size:.72rem;color:#93c5fd;margin-bottom:.1rem}
.mkt-cfa-stat strong{display:block;font-size:1.05rem;line-height:1.35;color:#f8fafc;overflow-wrap:anywhere}
.mkt-cfa-stat small{display:block;margin-top:.12rem;font-size:.68rem;color:#94a3b8}
/* v0.1.611 (OSINT Phase 3-A): 応援者パワー診断 セクション CSS */
.mkt-section--supporter-power h2{border-left-color:#f59e0b}
.mkt-spd-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.65rem;margin:.65rem 0 .9rem}
.mkt-spd-stat{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:.65rem .75rem;min-width:0}
.mkt-spd-stat span{display:block;font-size:.72rem;color:#fbbf24;margin-bottom:.1rem}
.mkt-spd-stat strong{display:block;font-size:1.05rem;line-height:1.35;color:#f8fafc;overflow-wrap:anywhere}
.mkt-spd-bar{display:flex;align-items:stretch;height:14px;border-radius:7px;overflow:hidden;margin:.6rem 0 .8rem;background:#0f172a;border:1px solid #334155}
.mkt-spd-bar__seg{display:block;min-width:2px}
.mkt-spd-tier-table{width:100%;border-collapse:collapse;margin:.4rem 0 1rem;font-size:.86rem}
.mkt-spd-tier-table th,.mkt-spd-tier-table td{padding:.4rem .55rem;border-bottom:1px solid #1e293b;text-align:left}
.mkt-spd-tier-table th{color:#fbbf24;font-weight:700;background:#0f172a}
.mkt-spd-badge{display:inline-block;min-width:1.6em;padding:.12rem .42rem;border-radius:6px;border:1px solid currentColor;font-weight:800;font-size:.78rem;letter-spacing:.04em;text-align:center}
.mkt-spd-top-heading{margin:1rem 0 .4rem;font-size:1rem;color:#fbbf24;font-weight:700}
.mkt-spd-top-table{width:100%;border-collapse:collapse;font-size:.82rem}
.mkt-spd-top-table th,.mkt-spd-top-table td{padding:.4rem .45rem;border-bottom:1px solid #1e293b;text-align:left;vertical-align:top}
.mkt-spd-top-table th{color:#fbbf24;font-weight:700;background:#0f172a;position:sticky;top:0}
.mkt-spd-pct{font-size:.7rem;color:#94a3b8;margin-left:.3rem}
.mkt-spd-segment-label{display:inline-block;margin-left:.4rem;padding:.05rem .3rem;font-size:.7rem;color:#cbd5e1;background:#1e293b;border-radius:4px}
.mkt-spd-components{font-size:.74rem;color:#cbd5e1;white-space:nowrap}
.mkt-spd-comp{display:inline-block;margin-right:.5rem;padding:.04rem .35rem;background:#0f172a;border:1px solid #334155;border-radius:4px}
.mkt-spd-formula-note{margin-top:.8rem;font-size:.72rem;color:#94a3b8;line-height:1.6}
/* v0.1.612: サムネ + nicovideo.jp/user リンク(既存 sectionCommenterFollowDirectory と同型) */
.mkt-spd-thumb{display:inline-block;width:28px;height:28px;border-radius:50%;background:#1e293b;border:1px solid #334155;object-fit:cover;vertical-align:middle}
.mkt-spd-thumb--empty{background:#1e293b}
.mkt-spd-user-link{color:#f8fafc;text-decoration:none;border-bottom:1px dotted #475569}
.mkt-spd-user-link:hover{color:#fbbf24;border-bottom-color:#fbbf24}
.mkt-section--interest-arrival h2{border-left-color:#6ee7b7}
.mkt-ia-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.65rem;margin:.65rem 0 .9rem}
.mkt-ia-stat{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:.65rem .75rem;min-width:0}
.mkt-ia-stat span{display:block;font-size:.72rem;color:#6ee7b7;margin-bottom:.1rem}
.mkt-ia-stat strong{display:block;font-size:1.05rem;line-height:1.35;color:#f8fafc;overflow-wrap:anywhere}
.mkt-ia-stat small{display:block;margin-top:.12rem;font-size:.68rem;color:#94a3b8}
.mkt-ia-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.mkt-ia-table{width:100%;border-collapse:collapse;min-width:320px}
.mkt-ia-table th,.mkt-ia-table td{padding:.4rem .45rem;border-bottom:1px solid #1e293b;text-align:left;font-size:.84rem}
.mkt-ia-table th{color:#93c5fd;font-weight:700;background:#0f172a;position:sticky;top:0}
.mkt-cfa-chart-wrap{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:.5rem;margin:.35rem 0 .55rem}
.mkt-cfa-svg{max-height:340px}
.mkt-cfa-plot-bg{fill:#0b1220;stroke:#334155;stroke-width:1}
.mkt-cfa-grid-line{stroke:#1f2a44;stroke-width:1}
.mkt-cfa-axis-line{stroke:#64748b;stroke-width:1.2}
.mkt-cfa-threshold{stroke:#fbbf24;stroke-width:1.4;stroke-dasharray:5 5;opacity:.78}
.mkt-cfa-legend{display:flex;flex-wrap:wrap;gap:.45rem .7rem;margin:.25rem 0 .85rem;font-size:.76rem;color:#cbd5e1}
.mkt-cfa-legend-item{display:inline-flex;align-items:center;gap:.28rem}
.mkt-cfa-legend-item i{display:inline-block;width:9px;height:9px;border-radius:50%;box-shadow:0 0 0 1px rgba(255,255,255,.16)}
.mkt-cfa-segments{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.7rem;margin:.8rem 0 0}
.mkt-cfa-seg-legend{list-style:none;margin:.8rem 0 .4rem;padding:0;display:flex;flex-direction:column;gap:.3rem;font-size:.82rem;color:#cbd5e1}
.mkt-cfa-seg-legend small{color:#94a3b8}
.mkt-cfa-seg-table td{white-space:nowrap}
.mkt-cfa-delta{margin-top:1rem;padding-top:.5rem;border-top:1px solid #334155}
.mkt-cfa-delta-grid,.mkt-cfa-profile-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem;margin:.65rem 0}
.mkt-cfa-delta__title{margin:0 0 .35rem;font-size:.84rem;color:#e2e8f0}
.mkt-cfa-profile{margin-top:1rem;padding-top:.5rem;border-top:1px solid #334155}
.mkt-cfa-following-list{margin-top:1rem;padding-top:.5rem;border-top:1px solid #334155}
.mkt-hero-stat--participation .mkt-hero-stat__val{color:#34d399}
.mkt-cfa-card{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:.78rem;min-width:0}
.mkt-cfa-card__head{display:flex;align-items:center;gap:.42rem;margin-bottom:.3rem}
.mkt-cfa-card__head h3{margin:0;font-size:.92rem;line-height:1.35;color:#f8fafc}
.mkt-cfa-card__dot{display:inline-block;width:10px;height:10px;border-radius:50%;flex:0 0 10px}
.mkt-cfa-card__count{display:block;font-size:1.05rem;line-height:1.3;color:#e0f2fe;margin:.15rem 0 .25rem}
.mkt-cfa-card__count small{font-size:.72rem;color:#94a3b8;margin-left:.25rem}
.mkt-cfa-card p{margin:.2rem 0 .55rem;color:#cbd5e1;font-size:.78rem;line-height:1.55}
.mkt-cfa-examples{list-style:none;margin:.35rem 0 0;padding:0;display:flex;flex-direction:column;gap:.35rem}
.mkt-cfa-examples li{display:flex;justify-content:space-between;gap:.6rem;align-items:baseline;border-top:1px solid #1f2a44;padding-top:.35rem;font-size:.78rem;line-height:1.45}
.mkt-cfa-examples li span{color:#94a3b8;text-align:right;white-space:nowrap;font-size:.72rem}
.mkt-thumb-grid__cell .mkt-follow-chip{margin-top:2px;font-size:.65rem;line-height:1.2}
/* レポート全体の共通リンク色。セクションごとに個別指定が無くても
   ユーザープロフィールリンクが暗い既定青のまま埋もれないようにする。 */
.mkt-section .nl-user-profile-link,.mkt-main .nl-user-profile-link{color:#93c5fd;text-decoration:underline;text-underline-offset:2px}
.mkt-section .nl-user-profile-link:hover,.mkt-main .nl-user-profile-link:hover{color:#dbeafe}
.mkt-rank-name .nl-user-profile-link{color:#93c5fd;text-decoration:underline;text-underline-offset:2px}
.mkt-rank-name .nl-user-profile-link:hover{color:#bfdbfe}
.mkt-rank-bar{position:relative;height:22px;background:#0f172a;border-radius:4px;overflow:hidden}
.mkt-rank-bar__fill{height:100%;background:linear-gradient(90deg,#3b82f6,#6366f1);border-radius:4px}
.mkt-rank-bar__label{position:absolute;right:6px;top:2px;font-size:.75rem;color:#f8fafc;font-weight:600}
.mkt-section--event-ranking h2{border-left-color:#facc15}
.mkt-event-rank__event-name{margin:.15rem 0 .75rem;font-size:.9rem;color:#fde68a;font-weight:700;line-height:1.45}
.mkt-event-self{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.7rem;margin:.7rem 0 .95rem}
.mkt-event-self__card{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:.75rem;min-width:0}
.mkt-event-self__label{display:block;font-size:.72rem;color:#94a3b8;margin-bottom:.25rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mkt-event-self__card strong{display:block;color:#f8fafc;font-size:1rem;line-height:1.35;overflow-wrap:anywhere}
.mkt-event-rank__subhead{margin:.3rem 0 .45rem;font-size:.9rem;color:#e2e8f0}
.mkt-event-rank__table-wrap{overflow-x:auto}
.mkt-event-rank__table{width:100%;border-collapse:collapse}
.mkt-event-rank__table td{padding:.4rem .45rem;border-bottom:1px solid #334155;vertical-align:middle}
.mkt-event-rank__rank{width:3.6rem;color:#fde68a;font-weight:700;font-size:.82rem;text-align:right}
.mkt-event-rank__thumb-cell{width:38px}
.mkt-event-rank__thumb{width:30px;height:30px;border-radius:8px;object-fit:cover;display:block;background:#0f172a}
.mkt-event-rank__thumb--empty{border:1px dashed #475569}
.mkt-event-rank__name{font-size:.85rem;color:#e2e8f0;min-width:140px;overflow-wrap:anywhere}
.mkt-event-rank__score{text-align:right;font-variant-numeric:tabular-nums;font-size:.85rem;color:#f8fafc;white-space:nowrap}
.mkt-event-rank__anon{display:inline-block;margin-left:.35rem;border:1px solid #475569;border-radius:999px;padding:0 .4rem;color:#94a3b8;font-size:.68rem}
.mkt-event-rank__stale{color:#fbbf24}
/* 0.1.12 (F3): サムネ付きユーザー一覧グリッド。トップコメンター表とは別軸で、
   どんな顔ぶれが応援してくれたかを視覚的に振り返るための面。 */
.mkt-section--thumb-grid h2{border-left-color:#fb923c}
.mkt-thumb-grid__heading{margin:1rem 0 .5rem;padding:0 0 .35rem;border-bottom:1px solid #334155;font-size:.92rem;font-weight:700;color:#cbd5e1;display:flex;align-items:baseline;gap:.5rem}
.mkt-thumb-grid__heading:first-of-type{margin-top:.4rem}
.mkt-thumb-grid__heading-count{font-size:.74rem;color:#94a3b8;font-weight:600}
.mkt-thumb-grid{list-style:none;margin:.6rem 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px}
.mkt-thumb-grid__cell{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 6px;background:#1e293b;border:1px solid #334155;border-radius:10px;min-width:0;text-align:center}
.mkt-thumb-grid__avatar-wrap{width:48px;height:48px;border-radius:50%;overflow:hidden;background:#0f172a;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.mkt-thumb-grid__avatar{width:48px;height:48px;object-fit:cover;display:block}
.mkt-thumb-grid__label{font-size:.74rem;line-height:1.25;color:#e2e8f0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%}
.mkt-thumb-grid__label .nl-user-profile-link{color:#93c5fd}
.mkt-thumb-grid__count{font-size:.7rem;color:#94a3b8}
/* 2026-07-31: 名前・IDで絞り込む検索窓(マーケ分析HTMLに検索が1つも無かったため追加)。 */
.mkt-thumb-grid__search{margin:.75rem 0 1rem;display:flex;flex-direction:column;gap:.35rem}
.mkt-thumb-grid__search-label{font-size:.75rem;color:#64748b;font-weight:700}
.mkt-thumb-grid__search-input{width:100%;max-width:28rem;padding:.5rem .7rem;font-size:.9rem;border:1px solid #cbd5e1;border-radius:.5rem;background:#fff;color:#0f172a}
.mkt-thumb-grid__search-input:focus{outline:2px solid #2563eb;outline-offset:1px;border-color:#2563eb}
.mkt-thumb-grid__search-result{font-size:.75rem;color:#64748b;margin:0}
.mkt-hour-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:4px}
.mkt-hour{border-radius:6px;text-align:center;padding:.5rem .2rem;min-height:52px;display:flex;flex-direction:column;justify-content:center;border:1px solid #334155}
.mkt-hour__label{font-size:.7rem;color:#94a3b8}
.mkt-hour__val{font-size:.9rem;font-weight:600}
.mkt-footer{text-align:center;padding:1.5rem;font-size:.72rem;color:#8b97a8}
.mkt-section--embed h2{border-left-color:#22d3ee}
.mkt-section--embed script{display:none}
.mkt-lead{margin:0 0 .85rem;font-size:.88rem;color:#e2e8f0;line-height:1.65}
.mkt-feature-list{margin:.4rem 0 0;padding-left:1.15rem;color:#cbd5e1;font-size:.82rem;line-height:1.65}
.mkt-feature-list li{margin:.45rem 0 0}
.mkt-feature-list li:first-child{margin-top:0}
.mkt-values-note{margin:.95rem 0 0;padding-top:.85rem;border-top:1px solid #334155;font-size:.82rem;color:#94a3b8;line-height:1.65}
.mkt-section--advice h2{border-left-color:#a78bfa}
@media(max-width:640px){
  .mkt-participation-lead-grid{grid-template-columns:1fr}
  .mkt-participation-headline{font-size:1rem}
  .mkt-participation-lead-card__value{font-size:1.65rem}
  .mkt-header{padding:1.35rem 1rem .85rem}
  .mkt-header__title{font-size:1.25rem}
  .mkt-header__sub{font-size:.76rem;line-height:1.55}
  .mkt-main{padding:1rem .65rem;overflow-x:hidden}
  .mkt-section{padding:1rem .9rem;border-radius:10px;margin-bottom:1rem;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
  .mkt-toc{grid-template-columns:1fr}
  .mkt-rank-table{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch}
  .mkt-rank{min-width:520px}
  .mkt-cfa-toolbar{justify-content:flex-start}
  .mkt-cfa-stats{grid-template-columns:repeat(2,minmax(0,1fr))}
  .mkt-cfa-segments{grid-template-columns:1fr}
  .mkt-cfa-delta-grid,.mkt-cfa-profile-grid{grid-template-columns:1fr}
  .mkt-cfa-examples li{display:block}
  .mkt-cfa-examples li span{display:block;text-align:left;white-space:normal;margin-top:.08rem}
}
@media(max-width:480px){
}
@media(max-width:640px){
  .mkt-kpi-grid{grid-template-columns:repeat(2,1fr)}
  .mkt-hour-grid{grid-template-columns:repeat(6,1fr)}
  .mkt-seg-wrap{flex-direction:column;align-items:flex-start}
}
@media(max-width:380px){
  .mkt-kpi-grid{grid-template-columns:1fr}
}
.mkt-sg-pack{margin-bottom:.5rem}
.mkt-section--sg{border-left:4px solid #22c55e}
.mkt-sg-live-note{margin:.25rem 0 .7rem;padding:.55rem .7rem;border:1px dashed #4ade80;border-radius:10px;background:#0b2a1b;color:#dcfce7;font-size:.82rem;line-height:1.55}
.mkt-sg-note{margin:.35rem 0 .55rem;font-size:.85rem;color:#94a3b8;line-height:1.45}
.mkt-sg-line{margin:.25rem 0;font-weight:600;color:#f8fafc}
.mkt-sg-meta{margin:.15rem 0;font-size:.82rem;color:#94a3b8}
.mkt-sg-time{font-size:.82rem;color:#cbd5e1}
.mkt-section--narrative h2{border-left-color:#38bdf8}
.mkt-narrative-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.8rem;margin:.8rem 0}
.mkt-narrative-card{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:.8rem;min-width:0}
.mkt-narrative-card__head{display:flex;justify-content:space-between;gap:.6rem;align-items:baseline;font-size:.82rem;color:#cbd5e1;margin-bottom:.5rem;flex-wrap:wrap}
.mkt-narrative-card__head strong{color:#f8fafc;font-size:.95rem}
.mkt-narrative-keywords{display:flex;flex-wrap:wrap;gap:.35rem}
.mkt-narrative-keyword{display:inline-block;border:1px solid rgba(56,189,248,.45);background:rgba(56,189,248,.12);color:#bae6fd;border-radius:999px;padding:.12rem .45rem;font-size:.74rem}
.mkt-narrative-muted{color:#64748b;font-size:.78rem}
.mkt-narrative-samples{margin:.65rem 0 0;padding-left:1.1rem;color:#e2e8f0;font-size:.8rem;line-height:1.55}
.mkt-narrative-samples li{margin-bottom:.25rem}
.mkt-narrative-subhead{font-size:.9rem;margin:.9rem 0 .35rem;color:#f8fafc}
.mkt-narrative-hints{margin:.3rem 0 0;padding-left:1.2rem;color:#cbd5e1;font-size:.84rem}
.mkt-narrative-hints li{margin-bottom:.35rem}
.mkt-sg-sample{font-size:.88rem;color:#e2e8f0}
.mkt-section--data-summary h2{border-left-color:#14b8a6}
.mkt-data-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.7rem;margin:.7rem 0 .9rem}
.mkt-data-card{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:.75rem;min-width:0}
.mkt-data-card__label{display:block;font-size:.72rem;color:#5eead4;margin-bottom:.18rem}
.mkt-data-card__value{display:block;font-size:1.1rem;line-height:1.3;color:#f8fafc;overflow-wrap:anywhere}
.mkt-data-card__hint{display:block;margin-top:.25rem;font-size:.72rem;color:#94a3b8;line-height:1.45}
.mkt-data-matrix td:nth-child(1),.mkt-data-source-table td:nth-child(1){font-weight:700;color:#e2e8f0;white-space:nowrap}
.mkt-data-status{display:inline-block;border-radius:999px;padding:.08rem .45rem;font-size:.7rem;font-weight:700;border:1px solid #334155;background:#111827;color:#cbd5e1;white-space:nowrap}
.mkt-data-status--あり{border-color:rgba(20,184,166,.55);background:rgba(20,184,166,.14);color:#99f6e4}
.mkt-data-status--未取得{border-color:#475569;background:#111827;color:#94a3b8}
.mkt-data-status--なし,.mkt-data-status--少なめ{border-color:rgba(251,191,36,.45);background:rgba(251,191,36,.12);color:#fde68a}
.mkt-data-gift-items{display:flex;flex-wrap:wrap;gap:.4rem;margin:.35rem 0 0}
.mkt-data-gift-chip{display:inline-block;border:1px solid rgba(20,184,166,.5);background:rgba(20,184,166,.1);color:#ccfbf1;border-radius:999px;padding:.14rem .55rem;font-size:.76rem;line-height:1.35}
.mkt-data-gift-chip b{color:#f8fafc}
.mkt-section--funnel h2{border-left-color:#38bdf8}
.mkt-funnel-table td:nth-child(1),.mkt-priority-table td:nth-child(1){font-weight:700;color:#e2e8f0;white-space:nowrap}
.mkt-section--segment-action h2{border-left-color:#a3e635}
.mkt-segment-action-table td:nth-child(1),.mkt-support-overlap-table td:nth-child(1){font-weight:700;color:#e2e8f0;white-space:nowrap}
.mkt-section--analysis-skills h2{border-left-color:#60a5fa}
.mkt-section--harness h2{border-left-color:#f472b6}
.mkt-section--audience-gap h2{border-left-color:#22d3ee}
.mkt-audience-level{display:inline-block;margin:0 0 .75rem;border-radius:999px;padding:.18rem .62rem;font-size:.76rem;font-weight:700}
.mkt-audience-level--healthy{background:rgba(34,197,94,.14);color:#bbf7d0;border:1px solid rgba(34,197,94,.45)}
.mkt-audience-level--quiet{background:rgba(251,191,36,.14);color:#fde68a;border:1px solid rgba(251,191,36,.45)}
.mkt-audience-level--silent-crowd{background:rgba(248,113,113,.14);color:#fecaca;border:1px solid rgba(248,113,113,.45)}
.mkt-audience-level--unknown{background:#111827;color:#cbd5e1;border:1px solid #334155}
.mkt-audience-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.7rem;margin:.3rem 0 .8rem}
.mkt-audience-card{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:.75rem;min-width:0}
.mkt-audience-card__label{display:block;font-size:.72rem;color:#67e8f9;margin-bottom:.18rem}
.mkt-audience-card__value{display:block;font-size:1.1rem;line-height:1.3;color:#f8fafc;overflow-wrap:anywhere}
.mkt-audience-card__hint{display:block;margin-top:.25rem;font-size:.72rem;color:#94a3b8;line-height:1.45}
.mkt-section--supporter-chikuran h2{border-left-color:#a78bfa}
.mkt-supporter-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.7rem;margin:.7rem 0 .85rem}
.mkt-supporter-card{background:#111827;border:1px solid #374151;border-radius:10px;padding:.75rem;min-width:0}
.mkt-supporter-card__label{display:block;font-size:.72rem;color:#c4b5fd;margin-bottom:.18rem}
.mkt-supporter-card__value{display:block;font-size:1.1rem;line-height:1.3;color:#f8fafc;overflow-wrap:anywhere}
.mkt-supporter-card__hint{display:block;margin-top:.25rem;font-size:.72rem;color:#9ca3af;line-height:1.45}
.mkt-supporter-summary{margin:.25rem 0 .75rem;color:#e9d5ff;font-size:.86rem;line-height:1.65}
.mkt-supporter-name{min-width:180px}
.mkt-supporter-person{display:flex;align-items:center;gap:.55rem;min-width:0}
.mkt-supporter-person span:last-child{min-width:0;overflow-wrap:anywhere}
.mkt-supporter-avatar{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;flex:0 0 34px;border-radius:50%;object-fit:cover;background:#1f2937;border:1px solid #4b5563;color:#c4b5fd;font-size:.75rem;font-weight:700}
.mkt-supporter-avatar--empty{background:linear-gradient(135deg,#1f2937,#312e81);color:#ddd6fe}
.mkt-supporter-score-cell{min-width:130px}
.mkt-supporter-score{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:.45rem}
.mkt-supporter-score strong{color:#f8fafc;font-size:.85rem}
.mkt-supporter-scorebar{display:block;height:8px;border-radius:999px;background:#1f2937;overflow:hidden;border:1px solid #374151}
.mkt-supporter-scorebar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#22d3ee,#a78bfa)}
.mkt-supporter-sources{display:flex;flex-wrap:wrap;gap:.22rem;min-width:150px}
.mkt-supporter-source{display:inline-block;margin:.08rem .18rem .08rem 0;border:1px solid rgba(167,139,250,.45);background:rgba(167,139,250,.12);color:#ddd6fe;border-radius:999px;padding:.08rem .42rem;font-size:.7rem;line-height:1.35;white-space:nowrap}
.mkt-supporter-source--muted{border-color:#334155;background:#111827;color:#94a3b8}
.mkt-section--gift-deep h2{border-left-color:#f97316}
.mkt-gift-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.7rem;margin:.7rem 0 .9rem}
.mkt-gift-card{background:#111827;border:1px solid #374151;border-radius:10px;padding:.75rem;min-width:0}
.mkt-gift-card__label{display:block;font-size:.72rem;color:#a7f3d0;margin-bottom:.18rem}
.mkt-gift-card__value{display:block;font-size:1.1rem;line-height:1.3;color:#f8fafc;overflow-wrap:anywhere}
.mkt-gift-card__hint{display:block;margin-top:.25rem;font-size:.72rem;color:#9ca3af;line-height:1.45}
.mkt-insight-list{margin:.6rem 0 .8rem;padding-left:1.15rem;color:#e5e7eb;font-size:.86rem}
.mkt-insight-list li{margin-bottom:.35rem}
.mkt-gift-sender{min-width:150px}
.mkt-gift-rank{display:inline-block;margin-left:.35rem;border:1px solid #f59e0b;border-radius:999px;padding:0 .42rem;color:#fde68a;font-size:.68rem;white-space:nowrap}
.mkt-gift-type{display:inline-block;border:1px solid rgba(251,146,60,.45);background:rgba(251,146,60,.12);color:#fed7aa;border-radius:999px;padding:.1rem .45rem;font-size:.74rem;line-height:1.35}
.mkt-gift-evidence{font-size:.78rem;color:#cbd5e1;min-width:150px}
.mkt-gift-window-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.8rem}
.mkt-gift-moments .mkt-gm-summary{font-weight:700;margin:.4rem 0}
.mkt-gm-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:.7rem;margin:.6rem 0}
.mkt-gm-card{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:.7rem .8rem;min-width:0}
.mkt-gm-time{font-size:.8rem;color:#93c5fd;font-variant-numeric:tabular-nums;margin-bottom:.35rem}
.mkt-gm-gifts{list-style:none;margin:0 0 .4rem;padding:0}
.mkt-gm-gift{display:flex;align-items:center;gap:.45rem;flex-wrap:wrap;margin:.15rem 0;font-size:.85rem}
.mkt-gm-sender{font-weight:700;overflow-wrap:anywhere}
.mkt-gm-item{color:#cbd5e1}
.mkt-gm-pt{margin-left:auto;font-variant-numeric:tabular-nums;color:#fde68a}
.mkt-gm-delta{font-size:.85rem}
.mkt-gm-delta strong{font-size:1.05rem}
.mkt-gm-viewers{display:inline-block;margin-left:.4rem;font-size:.78rem;color:#aab6c8}
.mkt-gm-topics{margin-top:.35rem;font-size:.78rem;color:#aab6c8}
.mkt-gm-badge{display:inline-block;margin-left:.3rem;border:1px solid #475569;border-radius:999px;padding:.02rem .45rem;font-size:.7rem;color:#dbeafe}
.mkt-gm-badge--warn{border-color:rgba(251,191,36,.55);color:#fde68a}
.mkt-gm-notes{font-size:.8rem;color:#aab6c8;margin:.4rem 0;padding-left:1.1rem}
.mkt-ad-obs-list{list-style:none;margin:.4rem 0;padding:0}
.mkt-ad-obs-item{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;padding:.3rem 0;border-bottom:1px solid #1e293b;font-size:.85rem}
.mkt-ad-obs-text{color:#cbd5e1;font-variant-numeric:tabular-nums}
.mkt-gm-next{margin-top:.6rem;border-left:3px solid #38bdf8;padding:.3rem .7rem;background:rgba(15,23,42,.55)}
.mkt-gm-next h3{margin:.1rem 0 .3rem;font-size:.95rem}
.mkt-gm-next ul{margin:0;padding-left:1.1rem;font-size:.88rem}
.mkt-gift-window{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:.8rem;min-width:0}
.mkt-gift-window__head{display:flex;justify-content:space-between;gap:.5rem;align-items:flex-start;flex-wrap:wrap;margin-bottom:.5rem}
.mkt-gift-window__head strong{color:#f8fafc;font-size:.95rem}
.mkt-gift-window__head span{color:#fdba74;font-size:.76rem;border:1px solid rgba(251,146,60,.45);border-radius:999px;padding:.08rem .45rem}
.mkt-gift-window__stats{display:grid;grid-template-columns:repeat(3,1fr);gap:.45rem;margin:.45rem 0}
.mkt-gift-window__stats div{background:#111827;border:1px solid #26364f;border-radius:8px;padding:.45rem;min-width:0}
.mkt-gift-window__stats dt{font-size:.68rem;color:#94a3b8}
.mkt-gift-window__stats dd{margin:0;color:#f8fafc;font-size:.78rem;line-height:1.35}
.mkt-gift-window__sample{margin:.5rem 0 .35rem;font-size:.82rem;color:#e2e8f0}
.mkt-gift-words{display:flex;flex-wrap:wrap;gap:.3rem}
.mkt-gift-word{display:inline-block;border:1px solid rgba(34,211,238,.4);background:rgba(34,211,238,.1);color:#a5f3fc;border-radius:999px;padding:.08rem .42rem;font-size:.72rem}
.mkt-gift-word--muted{border-color:#334155;background:#111827;color:#94a3b8}
.mkt-gift-window__source{margin:.5rem 0 0;font-size:.72rem;color:#94a3b8}
.mkt-gift-notes{margin:.75rem 0 0;padding-left:1.15rem;color:#94a3b8;font-size:.76rem}
.mkt-gift-ledger-items{display:flex;flex-wrap:wrap;gap:.55rem;margin:.5rem 0 .85rem}
.mkt-gift-ledger-item{display:inline-flex;align-items:center;gap:.35rem;padding:.35rem .55rem;border:1px solid #374151;border-radius:10px;background:#111827;font-size:.78rem;color:#e2e8f0;max-width:100%}
.mkt-gift-ledger-item__thumb{width:32px;height:32px;border-radius:6px;object-fit:contain;flex:0 0 auto;background:#0f172a}
.mkt-gift-ledger-item__thumb--empty{width:32px;height:32px;border-radius:6px;background:#1f2937;display:inline-block}
.mkt-gift-ledger-item__name{overflow-wrap:anywhere;line-height:1.35}
.mkt-gift-ledger-item strong{color:#fdba74;font-weight:700}
.mkt-gift-ledger-table .mkt-gift-ledger-itemcell{display:flex;align-items:center;gap:.45rem;min-width:140px}
.mkt-gift-ledger-row__thumb{width:28px;height:28px;border-radius:6px;object-fit:contain;flex:0 0 auto}
.mkt-gift-ledger-row__thumb--empty{width:28px;height:28px;border-radius:6px;background:#1f2937;display:inline-block}
.mkt-gift-ledger-time{font-variant-numeric:tabular-nums;white-space:nowrap}
.mkt-gift-ledger-charts{display:grid;gap:1rem;margin:.65rem 0 1rem}
@media(min-width:720px){.mkt-gift-ledger-charts{grid-template-columns:1fr 1fr}}
.mkt-gift-chart{margin:.35rem 0 .5rem}
.mkt-gift-chart__label{font-weight:600;max-width:14rem;overflow-wrap:anywhere;line-height:1.35}
.mkt-gift-chart__identity{display:flex;align-items:flex-start;gap:.45rem}
.mkt-gift-chart__name{display:flex;flex-direction:column;gap:.1rem;min-width:0}
.mkt-gift-chart-table--sender .mkt-gift-thumb{width:28px;height:28px;border-radius:50%;object-fit:cover;flex:0 0 auto}
.mkt-gift-chart-table--sender .mkt-gift-thumb--empty{width:28px;height:28px;border-radius:50%;background:#1f2937;display:inline-block}
.mkt-gift-chart-table--item .mkt-gift-ledger-item__thumb{border-radius:6px;object-fit:contain}
.mkt-gift-chart__item-name{display:block;font-weight:600;line-height:1.35}
.mkt-gift-sender-items li.mkt-gift-sender-item{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem .45rem}
.mkt-gift-sender-items li.mkt-gift-sender-item .mkt-gift-ledger-item__thumb{flex:0 0 auto}
.mkt-gift-chart__sub{display:block;font-size:.72rem;font-weight:400;color:#94a3b8;margin-top:.15rem}
.mkt-gift-chart-table th:first-child{width:38%}
.mkt-gift-sender-table .mkt-gift-sender-items{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.35rem}
.mkt-gift-sender-items li{font-size:.78rem;line-height:1.4;color:#e2e8f0;display:flex;flex-wrap:wrap;align-items:baseline;gap:.25rem .4rem}
.mkt-gift-sender-item__name{overflow-wrap:anywhere}
.mkt-gift-sender-items strong{color:#fdba74;font-weight:700}
.mkt-gift-sender-item__pt{color:#94a3b8;font-variant-numeric:tabular-nums}
@media(max-width:560px){
  .mkt-data-matrix,.mkt-data-source-table,.mkt-funnel-table,.mkt-priority-table,.mkt-segment-action-table,.mkt-support-overlap-table,.mkt-skill-table,.mkt-harness-layer-table,.mkt-harness-gate-table{min-width:0}
  .mkt-data-matrix thead,.mkt-data-source-table thead,.mkt-funnel-table thead,.mkt-priority-table thead,.mkt-segment-action-table thead,.mkt-support-overlap-table thead,.mkt-skill-table thead,.mkt-harness-layer-table thead,.mkt-harness-gate-table thead{display:none}
  .mkt-data-matrix,.mkt-data-matrix tbody,.mkt-data-matrix tr,.mkt-data-matrix td,.mkt-data-source-table,.mkt-data-source-table tbody,.mkt-data-source-table tr,.mkt-data-source-table td,.mkt-funnel-table,.mkt-funnel-table tbody,.mkt-funnel-table tr,.mkt-funnel-table td,.mkt-priority-table,.mkt-priority-table tbody,.mkt-priority-table tr,.mkt-priority-table td,.mkt-segment-action-table,.mkt-segment-action-table tbody,.mkt-segment-action-table tr,.mkt-segment-action-table td,.mkt-support-overlap-table,.mkt-support-overlap-table tbody,.mkt-support-overlap-table tr,.mkt-support-overlap-table td,.mkt-skill-table,.mkt-skill-table tbody,.mkt-skill-table tr,.mkt-skill-table td,.mkt-harness-layer-table,.mkt-harness-layer-table tbody,.mkt-harness-layer-table tr,.mkt-harness-layer-table td,.mkt-harness-gate-table,.mkt-harness-gate-table tbody,.mkt-harness-gate-table tr,.mkt-harness-gate-table td{display:block;width:100%}
  .mkt-data-matrix tr,.mkt-data-source-table tr,.mkt-funnel-table tr,.mkt-priority-table tr,.mkt-segment-action-table tr,.mkt-support-overlap-table tr,.mkt-skill-table tr,.mkt-harness-layer-table tr,.mkt-harness-gate-table tr{border:1px solid #334155;border-radius:10px;margin:.55rem 0;padding:.45rem;background:#0f172a}
  .mkt-data-matrix td,.mkt-data-source-table td,.mkt-funnel-table td,.mkt-priority-table td,.mkt-segment-action-table td,.mkt-support-overlap-table td,.mkt-skill-table td,.mkt-harness-layer-table td,.mkt-harness-gate-table td{border:0;padding:.28rem .15rem;display:flex;justify-content:space-between;gap:.8rem;align-items:flex-start}
  .mkt-data-matrix td::before,.mkt-data-source-table td::before,.mkt-funnel-table td::before,.mkt-priority-table td::before,.mkt-segment-action-table td::before,.mkt-support-overlap-table td::before,.mkt-skill-table td::before,.mkt-harness-layer-table td::before,.mkt-harness-gate-table td::before{content:attr(data-label);color:#94a3b8;font-size:.72rem;flex:0 0 5.8rem}
  .mkt-data-matrix td:nth-child(1),.mkt-data-source-table td:nth-child(1),.mkt-funnel-table td:nth-child(1),.mkt-priority-table td:nth-child(1),.mkt-segment-action-table td:nth-child(1),.mkt-support-overlap-table td:nth-child(1),.mkt-skill-table td:nth-child(1),.mkt-harness-layer-table td:nth-child(1),.mkt-harness-gate-table td:nth-child(1){white-space:normal}
  .mkt-audience-window-table{min-width:0}
  .mkt-audience-window-table thead{display:none}
  .mkt-audience-window-table,.mkt-audience-window-table tbody,.mkt-audience-window-table tr,.mkt-audience-window-table td{display:block;width:100%}
  .mkt-audience-window-table tr{border:1px solid #334155;border-radius:10px;margin:.55rem 0;padding:.45rem;background:#0f172a}
  .mkt-audience-window-table td{border:0;padding:.28rem .15rem;display:flex;justify-content:space-between;gap:.8rem}
  .mkt-audience-window-table td::before{content:attr(data-label);color:#94a3b8;font-size:.72rem;flex:0 0 7.2rem}
  .mkt-supporter-table{min-width:0}
  .mkt-supporter-table thead{display:none}
  .mkt-supporter-table,.mkt-supporter-table tbody,.mkt-supporter-table tr,.mkt-supporter-table td{display:block;width:100%}
  .mkt-supporter-table tr{border:1px solid #334155;border-radius:10px;margin:.55rem 0;padding:.45rem;background:#0f172a}
  .mkt-supporter-table td{border:0;padding:.28rem .15rem;display:flex;justify-content:space-between;gap:.8rem;align-items:flex-start}
  .mkt-supporter-table td::before{content:attr(data-label);color:#94a3b8;font-size:.72rem;flex:0 0 5.8rem}
  .mkt-supporter-name,.mkt-supporter-score-cell,.mkt-supporter-sources{min-width:0}
  .mkt-supporter-person{justify-content:flex-end;text-align:right;max-width:100%}
  .mkt-supporter-score{min-width:140px}
  .mkt-supporter-sources{justify-content:flex-end;text-align:right;max-width:100%}
  .mkt-gift-table{min-width:0}
  .mkt-gift-ledger-table{min-width:0}
  .mkt-gift-ledger-table thead{display:none}
  .mkt-gift-ledger-table,.mkt-gift-ledger-table tbody,.mkt-gift-ledger-table tr,.mkt-gift-ledger-table td{display:block;width:100%}
  .mkt-gift-ledger-table tr{border:1px solid #334155;border-radius:10px;margin:.55rem 0;padding:.45rem;background:#0f172a}
  .mkt-gift-ledger-table td{border:0;padding:.28rem .15rem;display:flex;justify-content:space-between;gap:.8rem}
  .mkt-gift-ledger-table td::before{content:attr(data-label);color:#94a3b8;font-size:.72rem;flex:0 0 5.8rem}
  .mkt-gift-sender-table{min-width:0}
  .mkt-gift-sender-table thead{display:none}
  .mkt-gift-sender-table,.mkt-gift-sender-table tbody,.mkt-gift-sender-table tr,.mkt-gift-sender-table td{display:block;width:100%}
  .mkt-gift-sender-table tr{border:1px solid #334155;border-radius:10px;margin:.55rem 0;padding:.45rem;background:#0f172a}
  .mkt-gift-sender-table td{border:0;padding:.28rem .15rem;display:flex;justify-content:space-between;gap:.8rem}
  .mkt-gift-sender-table td::before{content:attr(data-label);color:#94a3b8;font-size:.72rem;flex:0 0 5.8rem}
  .mkt-gift-ledger-charts{grid-template-columns:1fr}
  .mkt-gift-table thead{display:none}
  .mkt-gift-table,.mkt-gift-table tbody,.mkt-gift-table tr,.mkt-gift-table td{display:block;width:100%}
  .mkt-gift-table tr{border:1px solid #334155;border-radius:10px;margin:.55rem 0;padding:.45rem;background:#0f172a}
  .mkt-gift-table td{border:0;padding:.28rem .15rem;display:flex;justify-content:space-between;gap:.8rem}
  .mkt-gift-table td::before{content:attr(data-label);color:#94a3b8;font-size:.72rem;flex:0 0 5.8rem}
  .mkt-gift-evidence{min-width:0;text-align:right}
  .mkt-gift-window__stats{grid-template-columns:1fr}
}
@media print{
  body{background:#fff;color:#0f172a}
  .mkt-header,.mkt-section{background:#f1f5f9;border-color:#cbd5e1;box-shadow:none}
  .mkt-section{break-inside:avoid-page}
  .mkt-chart-wrap{overflow:visible}
}
`;
  var AUDIENCE_PARTICIPATION_LEAD_SECTION_CSS = `
.mkt-section{content-visibility:auto;contain-intrinsic-size:auto 360px;contain:layout style paint;background:#1e293b;border-radius:12px;padding:1.2rem 1.4rem;margin-bottom:1.2rem;border:1px solid #334155;scroll-margin-top:1rem}
.mkt-section h2{margin:0 0 .8rem;font-size:1.1rem;line-height:1.35;color:#f8fafc;border-left:4px solid #3b82f6;padding-left:.6rem}
.mkt-section p,.mkt-section li{overflow-wrap:anywhere}
.mkt-note{font-size:.78rem;color:#aab6c8;margin:0 0 .6rem}
.mkt-spec-note{font-size:.72rem;color:#fbbf24;background:rgba(251,191,36,0.08);border-left:3px solid #fbbf24;padding:.4rem .6rem;margin:0 0 .8rem;border-radius:0 4px 4px 0}
.mkt-section--participation-lead h2{border-left-color:#34d399}
.mkt-participation-headline{margin:.35rem 0 .65rem;font-size:clamp(1.05rem,3.2vw,1.35rem);line-height:1.55;color:#ecfdf5;font-weight:700}
.mkt-participation-lead-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem;margin:.5rem 0 .75rem}
.mkt-participation-lead-grid--four{grid-template-columns:repeat(auto-fit,minmax(min(100%,9.5rem),1fr))}
.mkt-participation-lead-card{background:linear-gradient(160deg,#0f172a,#111827);border:1px solid #334155;border-radius:14px;padding:clamp(.85rem,3vw,1.1rem);min-width:0;text-align:center}
.mkt-participation-lead-card--visitors{border-color:rgba(56,189,248,.45);box-shadow:0 0 18px rgba(56,189,248,.08)}
.mkt-participation-lead-card--commenters{border-color:rgba(52,211,153,.45);box-shadow:0 0 18px rgba(52,211,153,.08)}
.mkt-participation-lead-card--gift{border-color:rgba(251,191,36,.45);box-shadow:0 0 18px rgba(251,191,36,.08)}
.mkt-participation-lead-card--ad{border-color:rgba(244,114,182,.45);box-shadow:0 0 18px rgba(244,114,182,.08)}
.mkt-participation-lead-card__label{display:block;font-size:.74rem;color:#94a3b8;margin-bottom:.25rem;letter-spacing:.03em}
.mkt-participation-lead-card__value{display:block;font-size:clamp(1.55rem,5vw,2.15rem);line-height:1.15;color:#f8fafc;font-weight:800;overflow-wrap:anywhere}
.mkt-participation-lead-card__hint{display:block;margin-top:.35rem;font-size:.72rem;color:#cbd5e1;line-height:1.45}
.mkt-participation-lead-insight{margin:.15rem 0 .55rem;font-size:.84rem;color:#dbeafe;line-height:1.55}
.mkt-audience-level{display:inline-block;margin:0 0 .75rem;border-radius:999px;padding:.18rem .62rem;font-size:.76rem;font-weight:700}
.mkt-audience-level--healthy{background:rgba(34,197,94,.14);color:#bbf7d0;border:1px solid rgba(34,197,94,.45)}
.mkt-audience-level--quiet{background:rgba(251,191,36,.14);color:#fde68a;border:1px solid rgba(251,191,36,.45)}
.mkt-audience-level--silent-crowd{background:rgba(248,113,113,.14);color:#fecaca;border:1px solid rgba(248,113,113,.45)}
.mkt-audience-level--unknown{background:#111827;color:#cbd5e1;border:1px solid #334155}
.mkt-section .mkt-toc__link{color:#93c5fd;text-decoration:underline;text-underline-offset:2px}
@media(max-width:640px){
  .mkt-section{padding:1rem .9rem;border-radius:10px;margin-bottom:1rem;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
  .mkt-participation-lead-grid{grid-template-columns:1fr}
  .mkt-participation-headline{font-size:1rem}
  .mkt-participation-lead-card__value{font-size:1.65rem}
}
`;
  function audienceParticipationLeadEmbeddedCss() {
    return AUDIENCE_PARTICIPATION_LEAD_SECTION_CSS;
  }
  var COMMENTER_FOLLOW_SECTION_CSS = `
.mkt-cf-row--hidden{display:none}
.mkt-cf-more-wrap{margin:.75rem 0 0;text-align:center}
.mkt-cf-more-btn{cursor:pointer;border:1px solid #475569;background:#0f172a;color:#cbd5e1;border-radius:999px;padding:.45rem 1rem;font-size:.82rem}
.mkt-cf-more-btn:hover{border-color:#93c5fd;color:#f8fafc}
.mkt-section{content-visibility:auto;contain-intrinsic-size:auto 360px;contain:layout style paint;background:#1e293b;border-radius:12px;padding:1.2rem 1.4rem;margin-bottom:1.2rem;border:1px solid #334155;scroll-margin-top:1rem}
.mkt-section h2{margin:0 0 .8rem;font-size:1.1rem;line-height:1.35;color:#f8fafc;border-left:4px solid #3b82f6;padding-left:.6rem}
.mkt-section p,.mkt-section li{overflow-wrap:anywhere}
.mkt-note{font-size:.78rem;color:#aab6c8;margin:0 0 .6rem}
.mkt-spec-note{font-size:.72rem;color:#fbbf24;background:rgba(251,191,36,0.08);border-left:3px solid #fbbf24;padding:.4rem .6rem;margin:0 0 .8rem;border-radius:0 4px 4px 0}
.mkt-chart-wrap{overflow-x:auto}
.mkt-svg{width:100%;height:auto;max-height:260px}
.mkt-axis{font-size:10px;fill:#94a3b8}
.mkt-table-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
.mkt-rank{width:100%;border-collapse:collapse;font-size:.83rem}
.mkt-rank th,.mkt-rank td{padding:.44rem .5rem;border-bottom:1px solid #334155;text-align:left;vertical-align:top}
.mkt-rank th{font-size:.72rem;color:#94a3b8;font-weight:700;white-space:nowrap;background:#17233a}
.mkt-rank td{color:#dbeafe}
.mkt-num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.mkt-acct-badge{display:inline-block;margin-left:.4rem;border-radius:999px;padding:.02rem .42rem;font-size:.66rem;font-weight:700;line-height:1.5;vertical-align:middle;white-space:nowrap}
.mkt-acct-badge--prem{border:1px solid rgba(251,191,36,.55);background:rgba(251,191,36,.16);color:#fde68a}
.mkt-acct-badge--reg{border:1px solid #475569;background:#0f172a;color:#cbd5e1}
.mkt-section--commenter-follow h2{border-left-color:#22d3ee}
.mkt-cf-thumb{width:28px;height:28px;border-radius:50%;object-fit:cover;background:#0f172a;vertical-align:middle}
.mkt-cf-thumb--empty{display:inline-block;width:28px;height:28px;border:1px solid #334155;border-radius:50%}
.mkt-cf-user .nl-user-profile-link{color:#93c5fd}
.mkt-section--commenter-follow-analytics h2{border-left-color:#93c5fd}
.mkt-cfa-toolbar{display:flex;justify-content:flex-end;gap:.5rem;margin:0 0 .75rem;flex-wrap:wrap}
.mkt-cfa-csv-btn{cursor:pointer;border:1px solid rgba(147,197,253,.55);background:#0f172a;color:#dbeafe;border-radius:8px;padding:.48rem .8rem;font-size:.82rem;font-weight:700}
.mkt-cfa-csv-btn:hover{background:#17233a;border-color:#bfdbfe;color:#f8fafc}
.mkt-cfa-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.65rem;margin:.65rem 0 .9rem}
.mkt-cfa-stat{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:.65rem .75rem;min-width:0}
.mkt-cfa-stat span{display:block;font-size:.72rem;color:#93c5fd;margin-bottom:.1rem}
.mkt-cfa-stat strong{display:block;font-size:1.05rem;line-height:1.35;color:#f8fafc;overflow-wrap:anywhere}
.mkt-cfa-stat small{display:block;margin-top:.12rem;font-size:.68rem;color:#94a3b8}
/* v0.1.611 (OSINT Phase 3-A): 応援者パワー診断 セクション CSS */
.mkt-section--supporter-power h2{border-left-color:#f59e0b}
.mkt-spd-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.65rem;margin:.65rem 0 .9rem}
.mkt-spd-stat{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:.65rem .75rem;min-width:0}
.mkt-spd-stat span{display:block;font-size:.72rem;color:#fbbf24;margin-bottom:.1rem}
.mkt-spd-stat strong{display:block;font-size:1.05rem;line-height:1.35;color:#f8fafc;overflow-wrap:anywhere}
.mkt-spd-bar{display:flex;align-items:stretch;height:14px;border-radius:7px;overflow:hidden;margin:.6rem 0 .8rem;background:#0f172a;border:1px solid #334155}
.mkt-spd-bar__seg{display:block;min-width:2px}
.mkt-spd-tier-table{width:100%;border-collapse:collapse;margin:.4rem 0 1rem;font-size:.86rem}
.mkt-spd-tier-table th,.mkt-spd-tier-table td{padding:.4rem .55rem;border-bottom:1px solid #1e293b;text-align:left}
.mkt-spd-tier-table th{color:#fbbf24;font-weight:700;background:#0f172a}
.mkt-spd-badge{display:inline-block;min-width:1.6em;padding:.12rem .42rem;border-radius:6px;border:1px solid currentColor;font-weight:800;font-size:.78rem;letter-spacing:.04em;text-align:center}
.mkt-spd-top-heading{margin:1rem 0 .4rem;font-size:1rem;color:#fbbf24;font-weight:700}
.mkt-spd-top-table{width:100%;border-collapse:collapse;font-size:.82rem}
.mkt-spd-top-table th,.mkt-spd-top-table td{padding:.4rem .45rem;border-bottom:1px solid #1e293b;text-align:left;vertical-align:top}
.mkt-spd-top-table th{color:#fbbf24;font-weight:700;background:#0f172a;position:sticky;top:0}
.mkt-spd-pct{font-size:.7rem;color:#94a3b8;margin-left:.3rem}
.mkt-spd-segment-label{display:inline-block;margin-left:.4rem;padding:.05rem .3rem;font-size:.7rem;color:#cbd5e1;background:#1e293b;border-radius:4px}
.mkt-spd-components{font-size:.74rem;color:#cbd5e1;white-space:nowrap}
.mkt-spd-comp{display:inline-block;margin-right:.5rem;padding:.04rem .35rem;background:#0f172a;border:1px solid #334155;border-radius:4px}
.mkt-spd-formula-note{margin-top:.8rem;font-size:.72rem;color:#94a3b8;line-height:1.6}
/* v0.1.612: サムネ + nicovideo.jp/user リンク(既存 sectionCommenterFollowDirectory と同型) */
.mkt-spd-thumb{display:inline-block;width:28px;height:28px;border-radius:50%;background:#1e293b;border:1px solid #334155;object-fit:cover;vertical-align:middle}
.mkt-spd-thumb--empty{background:#1e293b}
.mkt-spd-user-link{color:#f8fafc;text-decoration:none;border-bottom:1px dotted #475569}
.mkt-spd-user-link:hover{color:#fbbf24;border-bottom-color:#fbbf24}
.mkt-section--interest-arrival h2{border-left-color:#6ee7b7}
.mkt-ia-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.65rem;margin:.65rem 0 .9rem}
.mkt-ia-stat{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:.65rem .75rem;min-width:0}
.mkt-ia-stat span{display:block;font-size:.72rem;color:#6ee7b7;margin-bottom:.1rem}
.mkt-ia-stat strong{display:block;font-size:1.05rem;line-height:1.35;color:#f8fafc;overflow-wrap:anywhere}
.mkt-ia-stat small{display:block;margin-top:.12rem;font-size:.68rem;color:#94a3b8}
.mkt-ia-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.mkt-ia-table{width:100%;border-collapse:collapse;min-width:320px}
.mkt-ia-table th,.mkt-ia-table td{padding:.4rem .45rem;border-bottom:1px solid #1e293b;text-align:left;font-size:.84rem}
.mkt-ia-table th{color:#93c5fd;font-weight:700;background:#0f172a;position:sticky;top:0}
.mkt-cfa-chart-wrap{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:.5rem;margin:.35rem 0 .55rem}
.mkt-cfa-svg{max-height:340px}
.mkt-cfa-plot-bg{fill:#0b1220;stroke:#334155;stroke-width:1}
.mkt-cfa-grid-line{stroke:#1f2a44;stroke-width:1}
.mkt-cfa-axis-line{stroke:#64748b;stroke-width:1.2}
.mkt-cfa-threshold{stroke:#fbbf24;stroke-width:1.4;stroke-dasharray:5 5;opacity:.78}
.mkt-cfa-legend{display:flex;flex-wrap:wrap;gap:.45rem .7rem;margin:.25rem 0 .85rem;font-size:.76rem;color:#cbd5e1}
.mkt-cfa-legend-item{display:inline-flex;align-items:center;gap:.28rem}
.mkt-cfa-legend-item i{display:inline-block;width:9px;height:9px;border-radius:50%;box-shadow:0 0 0 1px rgba(255,255,255,.16)}
.mkt-cfa-segments{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.7rem;margin:.8rem 0 0}
.mkt-cfa-delta{margin-top:1rem;padding-top:.5rem;border-top:1px solid #334155}
.mkt-cfa-delta-grid,.mkt-cfa-profile-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem;margin:.65rem 0}
.mkt-cfa-delta__title{margin:0 0 .35rem;font-size:.84rem;color:#e2e8f0}
.mkt-cfa-profile{margin-top:1rem;padding-top:.5rem;border-top:1px solid #334155}
.mkt-cfa-following-list{margin-top:1rem;padding-top:.5rem;border-top:1px solid #334155}
.mkt-hero-stat--participation .mkt-hero-stat__val{color:#34d399}
.mkt-cfa-card{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:.78rem;min-width:0}
.mkt-cfa-card__head{display:flex;align-items:center;gap:.42rem;margin-bottom:.3rem}
.mkt-cfa-card__head h3{margin:0;font-size:.92rem;line-height:1.35;color:#f8fafc}
.mkt-cfa-card__dot{display:inline-block;width:10px;height:10px;border-radius:50%;flex:0 0 10px}
.mkt-cfa-card__count{display:block;font-size:1.05rem;line-height:1.3;color:#e0f2fe;margin:.15rem 0 .25rem}
.mkt-cfa-card__count small{font-size:.72rem;color:#94a3b8;margin-left:.25rem}
.mkt-cfa-card p{margin:.2rem 0 .55rem;color:#cbd5e1;font-size:.78rem;line-height:1.55}
.mkt-cfa-examples{list-style:none;margin:.35rem 0 0;padding:0;display:flex;flex-direction:column;gap:.35rem}
.mkt-cfa-examples li{display:flex;justify-content:space-between;gap:.6rem;align-items:baseline;border-top:1px solid #1f2a44;padding-top:.35rem;font-size:.78rem;line-height:1.45}
.mkt-cfa-examples li span{color:#94a3b8;text-align:right;white-space:nowrap;font-size:.72rem}
.mkt-section .nl-user-profile-link{color:#93c5fd;text-decoration:underline;text-underline-offset:2px}
.mkt-section .nl-user-profile-link:hover{color:#dbeafe}
@media(max-width:640px){
  .mkt-section{padding:1rem .9rem;border-radius:10px;margin-bottom:1rem;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
  .mkt-rank{min-width:520px}
  .mkt-cfa-toolbar{justify-content:flex-start}
  .mkt-cfa-stats{grid-template-columns:repeat(2,minmax(0,1fr))}
  .mkt-cfa-segments{grid-template-columns:1fr}
  .mkt-cfa-delta-grid,.mkt-cfa-profile-grid{grid-template-columns:1fr}
  .mkt-cfa-examples li{display:block}
  .mkt-cfa-examples li span{display:block;text-align:left;white-space:normal;margin-top:.08rem}
}
`;
  function buildCommenterFollowDirectorySectionHtml(report, opts = {}) {
    const html = sectionCommenterFollowDirectory(
      report,
      opts.maskShare === true,
      opts.identiconResolver,
      opts.broadcasterUserId || "",
      { sectionId: opts.sectionId || "mkt-commenter-follow" }
    );
    return wrapCommenterFollowSectionForEmbed(html, opts.extraSectionClass);
  }
  function buildCommenterFollowAnalyticsSectionHtml(report, opts = {}) {
    const html = sectionCommenterFollowAnalytics(
      report,
      opts.maskShare === true,
      opts.broadcasterUserId || "",
      {
        sectionId: opts.sectionId || "mkt-commenter-follow-analytics",
        csvButtonId: opts.csvButtonId || "mkt-commenter-follow-csv"
      }
    );
    return wrapCommenterFollowSectionForEmbed(html, opts.extraSectionClass);
  }
  function commenterFollowSectionEmbeddedCss() {
    return COMMENTER_FOLLOW_SECTION_CSS;
  }
  function wrapCommenterFollowSectionForEmbed(html, extraSectionClass) {
    if (!html || !extraSectionClass) return html;
    return html.replace(
      'class="mkt-section',
      `class="${escapeAttr(extraSectionClass)} mkt-section`
    );
  }

  // src/lib/broadcastSessionSummaryDb.js
  var BROADCAST_SUMMARY_DB_NAME = "nls_broadcast_summary_v1";
  var BROADCAST_SUMMARY_STORE = "samples";
  var DB_VERSION2 = 1;
  function openBroadcastSessionSummaryDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(BROADCAST_SUMMARY_DB_NAME, DB_VERSION2);
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

  // src/lib/recentBroadcastLiveIds.js
  async function listRecentUniqueBroadcastLiveIds(db, opts = {}) {
    const limit = typeof opts.limit === "number" && opts.limit > 0 ? Math.floor(opts.limit) : 10;
    const exclude = String(opts.excludeLiveId || "").trim().toLowerCase();
    if (!db) return [];
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction(BROADCAST_SUMMARY_STORE, "readonly");
      } catch (e) {
        reject(e);
        return;
      }
      const store = tx.objectStore(BROADCAST_SUMMARY_STORE);
      const idx = store.index("byCapturedAt");
      const req = idx.openCursor(null, "prev");
      const seen = /* @__PURE__ */ new Set();
      const out = [];
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur || out.length >= limit) {
          resolve(out);
          return;
        }
        const lid = String(cur.value?.liveId || "").trim().toLowerCase();
        if (lid && lid !== exclude && !seen.has(lid)) {
          seen.add(lid);
          out.push(lid);
        }
        cur.continue();
      };
    });
  }

  // src/lib/comeviewRows.js
  var GENERIC_ANON_NAMES = /* @__PURE__ */ new Set(["匿名", "名無し", "名無しさん", "匿名さん"]);
  function isGenericComeviewName(name) {
    return GENERIC_ANON_NAMES.has(String(name || "").trim());
  }

  // src/lib/mediaKitStats.js
  var DAY_MS = 24 * 60 * 60 * 1e3;
  var MEDIA_KIT_COMMENT_LIVE_CAP = 12;
  function finiteNonNegative(value) {
    if (value === null || value === void 0 || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  function positiveTimestamp4(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  function cleanText2(value) {
    return String(value ?? "").trim();
  }
  function average(values) {
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  function groupSummaryRows(rows) {
    const grouped = /* @__PURE__ */ new Map();
    for (const raw of Array.isArray(rows) ? rows : []) {
      if (!raw || typeof raw !== "object") continue;
      const liveId = cleanText2(raw.liveId).toLowerCase();
      const capturedAt = positiveTimestamp4(raw.capturedAt);
      if (!liveId || capturedAt == null) continue;
      const list = grouped.get(liveId) || [];
      list.push({ ...raw, capturedAt });
      grouped.set(liveId, list);
    }
    const out = /* @__PURE__ */ new Map();
    for (const [liveId, list] of grouped) {
      list.sort((a, b) => a.capturedAt - b.capturedAt);
      const first = list[0];
      const final = list[list.length - 1];
      out.set(liveId, {
        liveId,
        rows: list,
        firstAt: first.capturedAt,
        finalAt: final.capturedAt,
        finalRow: final
      });
    }
    return out;
  }
  function resolveBroadcaster(summaryRows, profileSnapshots) {
    const sources = [
      ...(Array.isArray(summaryRows) ? summaryRows : []).map((row) => ({
        capturedAt: positiveTimestamp4(row?.capturedAt) || 0,
        priority: 0,
        name: cleanText2(row?.broadcasterName),
        userId: cleanText2(row?.broadcasterUserId),
        iconUrl: cleanText2(row?.broadcasterIconUrl)
      })),
      ...(Array.isArray(profileSnapshots) ? profileSnapshots : []).map((row) => ({
        capturedAt: positiveTimestamp4(row?.capturedAt) || 0,
        priority: 1,
        name: cleanText2(row?.nickname ?? row?.name),
        userId: cleanText2(row?.userId),
        iconUrl: cleanText2(row?.avatarUrl ?? row?.iconUrl)
      }))
    ].sort((a, b) => b.capturedAt - a.capturedAt || b.priority - a.priority);
    const pick = (key) => sources.find((source) => source[key])?.[key] || "";
    return {
      name: pick("name"),
      userId: pick("userId"),
      iconUrl: pick("iconUrl")
    };
  }
  function giftEventsForLive(giftEventsByLive, liveId) {
    if (giftEventsByLive instanceof Map) {
      return giftEventsByLive.has(liveId) ? {
        present: true,
        events: Array.isArray(giftEventsByLive.get(liveId)) ? giftEventsByLive.get(liveId) : []
      } : { present: false, events: [] };
    }
    if (!giftEventsByLive || typeof giftEventsByLive !== "object") {
      return { present: false, events: [] };
    }
    if (!Object.prototype.hasOwnProperty.call(giftEventsByLive, liveId)) {
      return { present: false, events: [] };
    }
    const value = giftEventsByLive[liveId];
    return { present: true, events: Array.isArray(value) ? value : [] };
  }
  function buildMediaKitStats(input = {}) {
    const summaryRows = Array.isArray(input.summaryRows) ? input.summaryRows : [];
    const profileSnapshots = Array.isArray(input.profileSnapshots) ? input.profileSnapshots : [];
    const giftEventsByLive = input.giftEventsByLive || {};
    const nowCandidate = Number(input.nowMs);
    const nowMs = Number.isFinite(nowCandidate) && nowCandidate > 0 ? nowCandidate : Date.now();
    const requestedWindows = Array.isArray(input.windowsDays) ? input.windowsDays : [30, 60, 90];
    const windowsDays = requestedWindows.map((value) => Math.floor(Number(value))).filter((value, index, all) => value > 0 && all.indexOf(value) === index);
    const grouped = groupSummaryRows(summaryRows);
    const windows = windowsDays.map((days) => {
      const fromMs = nowMs - days * DAY_MS;
      const lives = [...grouped.values()].filter(
        (live) => live.finalAt >= fromMs && live.finalAt <= nowMs
      );
      const liveIds = new Set(lives.map((live) => live.liveId));
      const profiles = profileSnapshots.map((profile) => ({
        profile,
        capturedAt: positiveTimestamp4(profile?.capturedAt),
        followerCount: finiteNonNegative(profile?.followerCount)
      })).filter(
        (item) => item.capturedAt != null && item.capturedAt >= fromMs && item.capturedAt <= nowMs && item.followerCount != null
      ).sort((a, b) => (
        /** @type {number} */
        a.capturedAt - /** @type {number} */
        b.capturedAt
      ));
      const latestFollowers = profiles.length ? (
        /** @type {number} */
        profiles[profiles.length - 1].followerCount
      ) : null;
      const followersGained = profiles.length >= 2 ? (
        /** @type {number} */
        profiles[profiles.length - 1].followerCount - /** @type {number} */
        profiles[0].followerCount
      ) : null;
      const liveConcurrentAverages = [];
      const concurrentSamples = [];
      const visitorValues = [];
      const commentValues = [];
      const supporterValues = [];
      let durationMinutes = 0;
      for (const live of lives) {
        const samples = live.rows.map((row) => finiteNonNegative(row.peakConcurrentEstimate)).filter((value) => value != null);
        if (samples.length) {
          concurrentSamples.push(.../** @type {number[]} */
          samples);
          liveConcurrentAverages.push(
            /** @type {number} */
            average(
              /** @type {number[]} */
              samples
            )
          );
        }
        const officialVisitors = finiteNonNegative(live.finalRow.officialViewerCount);
        const fallbackVisitors = finiteNonNegative(live.finalRow.viewerCountFromDom);
        const visitors = officialVisitors ?? fallbackVisitors;
        if (visitors != null) visitorValues.push(visitors);
        const officialComments = finiteNonNegative(live.finalRow.officialCommentCount);
        const fallbackComments = finiteNonNegative(live.finalRow.commentStorageCount);
        const comments = officialComments ?? fallbackComments;
        if (comments != null) commentValues.push(comments);
        const supporters = finiteNonNegative(live.finalRow.uniqueKnownCommenters);
        if (supporters != null) supporterValues.push(supporters);
        if (live.finalAt > live.firstAt) {
          durationMinutes += (live.finalAt - live.firstAt) / 6e4;
        }
      }
      let hasGiftData = false;
      let giftPoints = 0;
      let giftCount = 0;
      for (const liveId of liveIds) {
        const giftData = giftEventsForLive(giftEventsByLive, liveId);
        if (!giftData.present) continue;
        hasGiftData = true;
        for (const event of giftData.events) {
          if (!event || typeof event !== "object") continue;
          const record = (
            /** @type {{ point?: unknown }} */
            event
          );
          giftCount += 1;
          giftPoints += finiteNonNegative(record.point) || 0;
        }
      }
      const commentsTotal = commentValues.length ? commentValues.reduce((sum, value) => sum + value, 0) : null;
      const visitorsTotal = visitorValues.length ? visitorValues.reduce((sum, value) => sum + value, 0) : null;
      return {
        days,
        followers: latestFollowers,
        followersGained,
        avgConcurrent: average(liveConcurrentAverages),
        maxConcurrent: concurrentSamples.length ? Math.max(...concurrentSamples) : null,
        visitors: visitorsTotal == null ? null : {
          total: visitorsTotal,
          average: visitorsTotal / visitorValues.length
        },
        comments: commentsTotal,
        chatRatePerMin: commentsTotal != null && durationMinutes > 0 ? commentsTotal / durationMinutes : null,
        uniqueSupporters: supporterValues.length ? Math.max(...supporterValues) : null,
        giftPoints: hasGiftData ? giftPoints : null,
        giftCount: hasGiftData ? giftCount : null,
        broadcastsPerWeek: lives.length ? lives.length / (days / 7) : null,
        liveCount: lives.length
      };
    });
    return {
      windows,
      broadcaster: resolveBroadcaster(summaryRows, profileSnapshots)
    };
  }
  function buildMediaKitSupporters(input = {}) {
    const giftEventsByLive = input.giftEventsByLive || {};
    const commentRowsByLive = input.commentRowsByLive && typeof input.commentRowsByLive === "object" ? input.commentRowsByLive : {};
    const profileMap = input.profileMap && typeof input.profileMap === "object" ? input.profileMap : {};
    const topNRaw = Math.floor(Number(input.topN));
    const topN = Number.isFinite(topNRaw) && topNRaw > 0 ? topNRaw : 10;
    const resolveName = (uid, rawName) => {
      const name = cleanText2(rawName);
      if (name && !isGenericComeviewName(name)) return name;
      const nick = cleanText2(
        /** @type {any} */
        profileMap[uid]?.nickname
      );
      if (nick && !isGenericComeviewName(nick)) return nick;
      return "";
    };
    const giftLiveIds = Array.isArray(input.liveIds) ? input.liveIds.map((id) => cleanText2(id).toLowerCase()).filter(Boolean) : giftEventsByLive instanceof Map ? [...giftEventsByLive.keys()] : Object.keys(giftEventsByLive);
    const giftByUid = /* @__PURE__ */ new Map();
    for (const liveId of giftLiveIds) {
      const { events } = giftEventsForLive(giftEventsByLive, liveId);
      for (const event of events) {
        if (!event || typeof event !== "object") continue;
        const record = (
          /** @type {{ userId?: unknown, nickname?: unknown, point?: unknown }} */
          event
        );
        const uid = cleanText2(record.userId);
        if (!uid) continue;
        const entry = giftByUid.get(uid) || { userId: uid, name: "", points: 0, count: 0 };
        entry.points += finiteNonNegative(record.point) || 0;
        entry.count += 1;
        const name = resolveName(uid, record.nickname);
        if (name) entry.name = name;
        giftByUid.set(uid, entry);
      }
    }
    const giftTop = [...giftByUid.values()].sort((a, b) => b.points - a.points || b.count - a.count).slice(0, topN);
    const commentByUid = /* @__PURE__ */ new Map();
    let sampledLives = 0;
    for (const [liveId, rows] of Object.entries(commentRowsByLive)) {
      if (!Array.isArray(rows)) continue;
      sampledLives += 1;
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const record = (
          /** @type {{ userId?: unknown, nickname?: unknown, name?: unknown }} */
          row
        );
        const uid = cleanText2(record.userId);
        if (!uid) continue;
        const entry = commentByUid.get(uid) || { userId: uid, name: "", count: 0, lives: /* @__PURE__ */ new Set() };
        entry.count += 1;
        entry.lives.add(liveId);
        const name = resolveName(uid, record.nickname ?? record.name);
        if (name) entry.name = name;
        commentByUid.set(uid, entry);
      }
    }
    const commentTop = [...commentByUid.values()].sort((a, b) => b.count - a.count).slice(0, topN).map(({ lives, ...rest }) => ({ ...rest, liveCount: lives.size }));
    const supporters = commentByUid.size;
    const regulars = [...commentByUid.values()].filter((entry) => entry.lives.size >= 2).length;
    return {
      giftTop,
      commentTop,
      regulars: {
        sampledLives,
        supporters,
        regulars,
        ratio: supporters > 0 ? regulars / supporters : null
      }
    };
  }

  // src/lib/nicoUserPage.js
  function anonymousDisplayLabel(anonKey) {
    const key = String(anonKey == null ? "" : anonKey).trim();
    const digits = key.replace(/\D+/g, "");
    if (digits.length > 0) {
      const tail = digits.slice(-3);
      const n = Number(tail);
      if (Number.isFinite(n) && n > 0) return `匿名${n}`;
    }
    let h = 0;
    for (let i = 0; i < key.length; i += 1) {
      h = (h * 31 + key.charCodeAt(i)) % 1e5;
    }
    return `匿名${h % 999 + 1}`;
  }

  // src/lib/comeviewUserNotes.js
  function comeviewAnonLabel(userId) {
    const s = String(userId || "").trim();
    if (!s.startsWith("a:") && !isNiconicoHashedAnonymousUserId(s)) return "";
    return anonymousDisplayLabel(s);
  }

  // src/lib/mediaKitHtml.js
  var RASTER_DATA_URL_RE = /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;
  function finiteNumber(value) {
    if (value === null || value === void 0 || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function formatInteger(value) {
    const n = finiteNumber(value);
    return n == null ? "-" : Math.round(n).toLocaleString("ja-JP");
  }
  function formatDecimal(value, digits = 1) {
    const n = finiteNumber(value);
    if (n == null) return "-";
    return n.toLocaleString("ja-JP", {
      minimumFractionDigits: Number.isInteger(n) ? 0 : digits,
      maximumFractionDigits: digits
    });
  }
  function formatSignedInteger(value) {
    const n = finiteNumber(value);
    if (n == null) return "-";
    const rounded = Math.round(n);
    return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("ja-JP")}`;
  }
  function formatVisitors(visitors) {
    if (!visitors || typeof visitors !== "object") return "-";
    const record = (
      /** @type {{ total?: unknown, average?: unknown }} */
      visitors
    );
    const total = finiteNumber(record.total);
    const average2 = finiteNumber(record.average);
    if (total == null && average2 == null) return "-";
    return `累計 ${formatInteger(total)} / 配信平均 ${formatDecimal(average2)}`;
  }
  function formatGifts(points, count) {
    const p = finiteNumber(points);
    const c = finiteNumber(count);
    if (p == null && c == null) return "-";
    return `${formatInteger(p)} pt / ${formatInteger(c)} 件`;
  }
  function formatChatRate(value) {
    return finiteNumber(value) == null ? "-" : `${formatDecimal(value)} 件/分`;
  }
  function formatFrequency(value) {
    return finiteNumber(value) == null ? "-" : `週 ${formatDecimal(value)} 回配信`;
  }
  function formatPeople(value) {
    return finiteNumber(value) == null ? "-" : `${formatInteger(value)} 人`;
  }
  function formatGeneratedAt(value) {
    const n = finiteNumber(value);
    if (n == null || n <= 0) return "-";
    try {
      return new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(new Date(n));
    } catch {
      return "-";
    }
  }
  function safeRasterDataUrl(raw) {
    const value = String(raw ?? "").trim();
    return RASTER_DATA_URL_RE.test(value) ? value : "";
  }
  var REMOTE_ICON_RE = /^https:\/\/secure-dcdn\.cdn\.nimg\.jp\/[^\s"'<>]+$/i;
  function broadcasterAvatarHtml(broadcaster, iconDataUrl) {
    const embedded = safeRasterDataUrl(iconDataUrl || broadcaster?.iconUrl);
    const name = String(broadcaster?.name ?? "").trim();
    if (embedded) {
      return `<img class="avatar" src="${escapeAttr(embedded)}" alt="" width="88" height="88">`;
    }
    const remote = String(broadcaster?.iconUrl ?? "").trim();
    if (REMOTE_ICON_RE.test(remote)) {
      return `<img class="avatar" src="${escapeAttr(remote)}" alt="" width="88" height="88" loading="lazy">`;
    }
    const derived = deriveAvatarUrlFromUid(String(broadcaster?.userId ?? "").trim());
    if (derived) {
      return `<img class="avatar" src="${escapeAttr(derived)}" alt="" width="88" height="88" loading="lazy">`;
    }
    const initial = Array.from(name || "配")[0] || "配";
    return `<div class="avatar avatar--fallback" aria-hidden="true">${escapeHtml(initial)}</div>`;
  }
  function nicoUserPageUrl(userId) {
    const uid = String(userId ?? "").trim();
    return /^\d{1,18}$/.test(uid) ? `https://www.nicovideo.jp/user/${uid}` : "";
  }
  function supporterDisplayName(entry) {
    const name = String(entry?.name ?? "").trim();
    if (name) return name;
    const uid = String(entry?.userId ?? "").trim();
    const anon = comeviewAnonLabel(uid);
    if (anon) return anon;
    return uid ? `ID:${uid}` : "応援者";
  }
  function supporterAvatarHtml(entry, displayName) {
    const uid = String(entry?.userId ?? "").trim();
    const url = deriveAvatarUrlFromUid(uid);
    if (url) {
      return `<img class="s-avatar" src="${escapeAttr(url)}" alt="" width="40" height="40" loading="lazy">`;
    }
    const initial = Array.from(displayName || "応")[0] || "応";
    return `<span class="s-avatar s-avatar--fallback" aria-hidden="true">${escapeHtml(initial)}</span>`;
  }
  var SUPPORTER_MEDALS = ["🥇", "🥈", "🥉"];
  function supporterListHtml(entries, valueLabel, masked = false) {
    if (!entries.length) {
      return '<p class="s-empty">この期間の記録はまだありません</p>';
    }
    return `<ol class="s-list">${entries.map((entry, index) => {
      const displayName = masked ? `応援者${index + 1}` : supporterDisplayName(entry);
      const medal = SUPPORTER_MEDALS[index] || `${index + 1}`;
      const pageUrl = masked ? "" : nicoUserPageUrl(entry?.userId);
      const nameHtml = pageUrl ? `<a class="s-name" href="${escapeAttr(pageUrl)}" rel="noopener noreferrer">${escapeHtml(displayName)}</a>` : `<span class="s-name">${escapeHtml(displayName)}</span>`;
      return `<li class="s-row"><span class="s-rank">${escapeHtml(medal)}</span>` + (masked ? `<span class="s-avatar s-avatar--fallback" aria-hidden="true">${escapeHtml(Array.from(displayName)[0] || "応")}</span>` : supporterAvatarHtml(entry, displayName)) + nameHtml + `<span class="s-value">${escapeHtml(valueLabel(entry))}</span></li>`;
    }).join("")}</ol>`;
  }
  function supportersSectionHtml(supportersRaw, masked = false) {
    if (!supportersRaw || typeof supportersRaw !== "object") return "";
    const supporters = (
      /** @type {{ giftTop?: unknown, commentTop?: unknown, regulars?: unknown }} */
      supportersRaw
    );
    const giftTop = Array.isArray(supporters.giftTop) ? supporters.giftTop : [];
    const commentTop = Array.isArray(supporters.commentTop) ? supporters.commentTop : [];
    const regulars = supporters.regulars && typeof supporters.regulars === "object" ? (
      /** @type {{ sampledLives?: unknown, supporters?: unknown, regulars?: unknown, ratio?: unknown }} */
      supporters.regulars
    ) : null;
    if (!giftTop.length && !commentTop.length) return "";
    const ratio = regulars ? finiteNumber(regulars.ratio) : null;
    const regularsLine = regulars ? `<p class="s-regulars">🔁 常連さん(2配信以上): <strong>${formatInteger(
      regulars.regulars
    )}人</strong> / 集計できた応援者 ${formatInteger(regulars.supporters)}人${ratio != null ? `(${formatDecimal(ratio * 100, 0)}%)` : ""}・直近${formatInteger(regulars.sampledLives)}配信のコメントから</p>` : "";
    return `
      <section class="supporters">
        <h2>この配信を支えた応援者たち</h2>
        <p class="s-lead">配信の熱量をつくっているのは応援者のみなさんです。ニコ生上で公開されている応援(コメント・ギフト)の記録から表彰します。</p>
        <div class="s-grid">
          <div class="s-col">
            <h3>🎁 ギフト応援</h3>
            ${supporterListHtml(giftTop, (entry) => `${formatInteger(entry.points)} pt・${formatInteger(entry.count)} 件`, masked)}
          </div>
          <div class="s-col">
            <h3>💬 コメント応援</h3>
            ${supporterListHtml(commentTop, (entry) => `${formatInteger(entry.count)} 件・${formatInteger(entry.liveCount)} 配信`, masked)}
          </div>
        </div>
        ${regularsLine}
      </section>`;
  }
  function metricCells(windows, formatter) {
    return windows.map((window2) => `<td>${escapeHtml(formatter(window2))}</td>`).join("");
  }
  function dedupeSameWindows(windows) {
    const out = [];
    for (const window2 of windows) {
      const prev = out[out.length - 1];
      if (prev && Number(prev.liveCount) === Number(window2.liveCount)) continue;
      out.push(window2);
    }
    return out;
  }
  function buildMediaKitHtml(stats, options = {}) {
    const windows = dedupeSameWindows(Array.isArray(stats?.windows) ? stats.windows : []);
    const broadcaster = stats?.broadcaster && typeof stats.broadcaster === "object" ? stats.broadcaster : {};
    const broadcasterName = String(broadcaster.name ?? "").trim() || "配信者名 未取得";
    const broadcasterUserId = String(broadcaster.userId ?? "").trim();
    const generatedAtMs = finiteNumber(options.generatedAtMs) && Number(options.generatedAtMs) > 0 ? Number(options.generatedAtMs) : Date.now();
    const sourceLiveLimit = Math.max(1, Math.floor(finiteNumber(options.sourceLiveLimit) || 60));
    const sourceLiveLimitReached = options.sourceLiveLimitReached === true;
    const metricSpecs = [
      ["フォロワー数", (window2) => formatInteger(window2.followers)],
      ["獲得フォロワー数", (window2) => formatSignedInteger(window2.followersGained)],
      ["平均同時視聴者数", (window2) => formatDecimal(window2.avgConcurrent)],
      ["最大同時視聴者数", (window2) => formatInteger(window2.maxConcurrent)],
      ["来場者数", (window2) => formatVisitors(window2.visitors)],
      ["コメント数（累計）", (window2) => formatInteger(window2.comments)],
      ["チャット率", (window2) => formatChatRate(window2.chatRatePerMin)],
      ["応援者数（ユニーク目安）", (window2) => formatPeople(window2.uniqueSupporters)],
      ["ギフト（累計）", (window2) => formatGifts(window2.giftPoints, window2.giftCount)],
      ["配信頻度", (window2) => formatFrequency(window2.broadcastsPerWeek)],
      ["集計配信数", (window2) => formatInteger(window2.liveCount)]
    ];
    const metricRows = metricSpecs.map(
      ([label, formatter]) => `<tr><th scope="row">${escapeHtml(label)}</th>${metricCells(
        windows,
        /** @type {(window: Record<string, unknown>) => string} */
        formatter
      )}</tr>`
    ).join("\n");
    const limitNote = sourceLiveLimitReached ? `保存履歴が多いため、新しい順に最大${sourceLiveLimit}枠を集計しています。` : `処理負荷を抑えるため、集計対象は新しい順に最大${sourceLiveLimit}枠です。`;
    return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https://secure-dcdn.cdn.nimg.jp; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
  <title>${escapeHtml(broadcasterName)} - 追憶メディアキット</title>
  <style>
    :root {
      color-scheme: light;
      --nl-accent: #0f8fd8;
      --nl-accent-soft: #e8f5fc;
      --nl-ink: #152033;
      --nl-sub: #5f6b7a;
      --nl-line: #dce3ea;
      --nl-panel: #f7f9fb;
      --nl-success: #117a50;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #eef2f6;
      color: var(--nl-ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", sans-serif;
      line-height: 1.6;
    }
    main {
      width: min(1080px, calc(100% - 32px));
      margin: 32px auto;
      background: #fff;
      border: 1px solid var(--nl-line);
      border-radius: 18px;
      box-shadow: 0 16px 40px rgb(25 45 70 / 10%);
      overflow: hidden;
    }
    header {
      display: flex;
      align-items: center;
      gap: 20px;
      padding: 30px;
      border-bottom: 1px solid var(--nl-line);
      background: linear-gradient(135deg, #fff 55%, var(--nl-accent-soft));
    }
    .avatar {
      flex: 0 0 88px;
      width: 88px;
      height: 88px;
      border-radius: 50%;
      object-fit: cover;
      border: 3px solid #fff;
      box-shadow: 0 0 0 1px var(--nl-line);
      background: var(--nl-accent-soft);
    }
    .avatar--fallback {
      display: grid;
      place-items: center;
      color: var(--nl-accent);
      font-size: 34px;
      font-weight: 800;
    }
    .eyebrow {
      margin: 0 0 4px;
      color: var(--nl-accent);
      font-size: 13px;
      font-weight: 800;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    h1 { margin: 0; font-size: clamp(26px, 5vw, 42px); line-height: 1.25; }
    .identity { margin: 4px 0 0; color: var(--nl-sub); overflow-wrap: anywhere; }
    .identity a { color: var(--nl-accent); font-weight: 700; text-decoration: none; }
    .identity a:hover { text-decoration: underline; }
    a.s-name { color: var(--nl-ink); text-decoration: none; }
    a.s-name:hover { text-decoration: underline; color: var(--nl-accent); }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      margin-top: 12px;
      padding: 6px 11px;
      border: 1px solid #a8dcc8;
      border-radius: 999px;
      background: #effaf6;
      color: var(--nl-success);
      font-size: 13px;
      font-weight: 800;
    }
    .content { padding: 28px 30px 34px; }
    .lead { margin: 0 0 18px; color: var(--nl-sub); }
    .table-wrap { overflow-x: auto; border: 1px solid var(--nl-line); border-radius: 14px; }
    table { width: 100%; border-collapse: collapse; min-width: 720px; }
    th, td { padding: 14px 16px; border-bottom: 1px solid var(--nl-line); text-align: right; }
    thead th {
      background: var(--nl-panel);
      color: #364255;
      font-size: 13px;
      letter-spacing: .04em;
    }
    thead th:first-child, tbody th { text-align: left; }
    tbody th { width: 31%; background: #fbfcfd; font-weight: 700; }
    tbody td { font-variant-numeric: tabular-nums; font-weight: 700; white-space: nowrap; }
    tbody tr:last-child th, tbody tr:last-child td { border-bottom: 0; }
    .sources {
      margin-top: 24px;
      padding: 20px 22px;
      border-radius: 14px;
      background: var(--nl-panel);
      color: var(--nl-sub);
      font-size: 13px;
    }
    .sources h2 { margin: 0 0 8px; color: var(--nl-ink); font-size: 16px; }
    .sources p { margin: 0 0 8px; }
    .sources ul { margin: 8px 0 0; padding-left: 1.4em; }
    .generated { margin: 18px 0 0; color: var(--nl-sub); font-size: 12px; text-align: right; }
    .supporters { margin-top: 28px; }
    .supporters h2 { margin: 0 0 6px; font-size: 20px; color: var(--nl-ink); }
    .s-lead { margin: 0 0 14px; color: var(--nl-sub); font-size: 13.5px; }
    .s-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    .s-col { border: 1px solid var(--nl-line); border-radius: 14px; padding: 16px 18px; background: #fff; }
    .s-col h3 { margin: 0 0 10px; font-size: 15px; }
    .s-list { list-style: none; margin: 0; padding: 0; }
    .s-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px dashed var(--nl-line); }
    .s-row:last-child { border-bottom: 0; }
    .s-rank { flex: 0 0 1.8em; text-align: center; font-weight: 800; color: var(--nl-sub); }
    .s-avatar { flex: 0 0 40px; width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: var(--nl-accent-soft); border: 1px solid var(--nl-line); }
    .s-avatar--fallback { display: grid; place-items: center; color: var(--nl-accent); font-weight: 800; font-size: 17px; }
    .s-name { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
    .s-value { flex: 0 0 auto; font-variant-numeric: tabular-nums; color: var(--nl-sub); font-weight: 700; font-size: 13px; }
    .s-empty { margin: 0; color: var(--nl-sub); font-size: 13px; }
    .s-regulars { margin: 14px 2px 0; color: var(--nl-sub); font-size: 13.5px; }
    @media (max-width: 640px) {
      main { width: 100%; margin: 0; border: 0; border-radius: 0; }
      header { align-items: flex-start; padding: 22px 18px; }
      .avatar { flex-basis: 68px; width: 68px; height: 68px; }
      .content { padding: 22px 16px 28px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      ${broadcasterAvatarHtml(broadcaster, options.broadcasterIconDataUrl)}
      <div>
        <p class="eyebrow">追憶メディアキット</p>
        <h1>${escapeHtml(broadcasterName)}</h1>
        <p class="identity">${broadcasterUserId ? nicoUserPageUrl(broadcasterUserId) ? `ニコニコユーザーID: <a href="${escapeAttr(nicoUserPageUrl(broadcasterUserId))}" rel="noopener noreferrer">${escapeHtml(broadcasterUserId)}</a>` : `ニコニコユーザーID: ${escapeHtml(broadcasterUserId)}` : "ニコニコユーザーID: -"}</p>
        <span class="badge" aria-label="追憶のきらめきが記録した実測統計">✓ 追憶のきらめき 実測統計</span>
      </div>
    </header>
    <section class="content">
      <p class="lead">${escapeHtml(
      windows.length > 1 ? `配信実績を${windows.map((window2) => `${formatInteger(window2.days)}日`).join("・")}の期間で比較できる、共有用の統計資料です。` : `過去${formatInteger(windows[0]?.days ?? 30)}日の配信実績をまとめた、共有用の統計資料です。`
    )}</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">指標</th>
              ${windows.map((window2) => `<th scope="col">過去${escapeHtml(formatInteger(window2.days))}日</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${metricRows}
          </tbody>
        </table>
      </div>
      ${supportersSectionHtml(
      /** @type {any} */
      stats?.supporters,
      options.maskSupporters === true
    )}
      <aside class="sources">
        <h2>データの出所</h2>
        <p><strong>以下の統計データは、追憶のきらめきが配信中にこのPCへ記録した公式値・実測値です。</strong></p>
        <ul>
          <li>フォロワー数は、ニコニコの公開プロフィールから配信時に取得したスナップショットです。</li>
          <li>来場者数とコメント数は公式表示値を優先し、未取得時のみこのPCの実測値で補います。</li>
          <li>同時視聴者数は配信中サンプルの推定値です。公式の同時接続数ではありません。</li>
          <li>チャット率は記録できたコメント数と、最初・最後のサンプル間の推定配信時間から算出します。</li>
          <li>応援者数は各配信で確認できた既知コメント投稿者数の最大値で、期間全体の厳密なユニーク人数ではありません。</li>
          <li>ギフトはこのPCに保存されたギフトイベントのポイント合計と件数です。</li>
          <li>${escapeHtml(limitNote)}</li>
          <li>応援者の表彰は、ニコ生上で公開されているコメント・ギフト情報(オープンデータ)の集計です。コメント応援と常連の集計は処理負荷を抑えるため直近の配信に限っています。</li>
        </ul>
      </aside>
      <p class="generated">生成日時: ${escapeHtml(formatGeneratedAt(generatedAtMs))}（日本時間）</p>
    </section>
  </main>
</body>
</html>`;
  }

  // src/lib/storageKeys.js
  var KEY_ANONYMOUS_IDENTICON_ENABLED = "nls_anonymous_identicon_enabled_v1";
  var KEY_USER_COMMENT_PROFILE_CACHE = "nls_user_comment_profile_v1";
  var KEY_COMMENTER_FOLLOW_CACHE = "nls_commenter_follow_v1";
  var KEY_COMMENTER_FOLLOWING_LIST_CACHE = "nls_commenter_following_list_v1";
  var EXTENSION_SOFT_CACHE_STORAGE_KEYS = Object.freeze([
    KEY_USER_COMMENT_PROFILE_CACHE,
    KEY_COMMENTER_FOLLOW_CACHE,
    KEY_COMMENTER_FOLLOWING_LIST_CACHE
  ]);
  var KEY_MARKETING_EXPORT_MASK_LABELS = "nls_marketing_export_mask_labels_v1";
  function normalizeMarketingExportMaskLabels(raw) {
    return raw === true;
  }
  function commentsStorageKey(liveId) {
    const id = String(liveId || "").trim().toLowerCase();
    return `nls_comments_${id}`;
  }
  function watchSnapshotStorageKey(liveId) {
    const id = String(liveId || "").trim().toLowerCase();
    return `nls_watch_snapshot_${id}`;
  }
  function giftUsersStorageKey(liveId) {
    const id = String(liveId || "").trim().toLowerCase();
    return `nls_gift_users_${id}`;
  }
  function eventDomStorageKey(liveId) {
    const id = String(liveId || "").trim().toLowerCase();
    return `nls_event_dom_${id}`;
  }
  function giftSubAppHistoryStorageKey(liveId) {
    const id = String(liveId || "").trim().toLowerCase();
    return `nls_gift_subapp_history_${id}`;
  }
  function broadcasterProfileStorageKey(liveId) {
    const id = String(liveId || "").trim().toLowerCase();
    return `nls_broadcaster_profile_${id}`;
  }
  function commenterFollowLiveStorageKey(liveId) {
    const id = String(liveId || "").trim().toLowerCase();
    return `nls_commenter_follow_live_${id}`;
  }

  // src/lib/mediaKitExport.js
  var MEDIA_KIT_LIVE_LIMIT = 60;
  var MEDIA_KIT_SCAN_LIVE_LIMIT = 300;
  function pickLivesForBroadcaster(liveIds, rowsByLiveId, opts) {
    const uid = String(opts.broadcasterUserId || "").trim();
    const current = String(opts.currentLiveId || "").trim().toLowerCase();
    const out = [];
    for (const lid of liveIds) {
      if (out.length >= opts.limit) break;
      const rows = rowsByLiveId.get(lid) || [];
      const match = uid ? rows.some((row) => String(
        /** @type {any} */
        row?.broadcasterUserId ?? ""
      ).trim() === uid) : lid === current;
      if (match || current && lid === current) out.push(lid);
    }
    return out;
  }
  var MEDIA_KIT_SUPPORTER_SCAN_TIMEOUT_MS = 15e3;
  async function buildMediaKitDocument(deps) {
    const nowMs = typeof deps.nowMs === "number" ? deps.nowMs : Date.now();
    const openDb = deps.openDb || openBroadcastSessionSummaryDb;
    const listLiveIds = deps.listLiveIds || listRecentUniqueBroadcastLiveIds;
    const listSummaryForLive = deps.listSummaryForLive || listBroadcastSessionSummaryForLive;
    let db;
    let liveIds = [];
    let summaryRows = [];
    try {
      db = await openDb();
      const filterByBroadcaster = deps.broadcasterUserId !== void 0 || deps.currentLiveId !== void 0;
      const candidateIds = await listLiveIds(db, {
        limit: filterByBroadcaster ? MEDIA_KIT_SCAN_LIVE_LIMIT : MEDIA_KIT_LIVE_LIMIT
      });
      const openedDb = db;
      const readRows = async (ids, rowLimit) => {
        const arrays = await Promise.all(
          ids.map((liveId) => listSummaryForLive(openedDb, liveId, rowLimit).catch(() => (
            /** @type {unknown[]} */
            []
          )))
        );
        return new Map(ids.map((lid, index) => [lid, arrays[index] || []]));
      };
      if (filterByBroadcaster) {
        const probe = await readRows(candidateIds, 5);
        liveIds = pickLivesForBroadcaster(candidateIds, probe, {
          broadcasterUserId: deps.broadcasterUserId,
          currentLiveId: deps.currentLiveId,
          limit: MEDIA_KIT_LIVE_LIMIT
        });
      } else {
        liveIds = candidateIds;
      }
      const rowsByLiveId = await readRows(liveIds, 200);
      summaryRows = liveIds.flatMap((lid) => rowsByLiveId.get(lid) || []);
    } finally {
      try {
        db?.close();
      } catch {
      }
    }
    const storageKeys = liveIds.flatMap((liveId) => [
      broadcasterProfileStorageKey(liveId),
      `nls_gift_events_${liveId}`
    ]);
    const bag = storageKeys.length ? await deps.storageGet(storageKeys) : {};
    const profileSnapshots = liveIds.map((liveId) => {
      const value = (
        /** @type {any} */
        bag[broadcasterProfileStorageKey(liveId)]
      );
      return value && typeof value === "object" ? { ...value, liveId } : null;
    }).filter(Boolean);
    const giftEventsByLive = {};
    for (const liveId of liveIds) {
      const value = bag[`nls_gift_events_${liveId}`];
      if (Array.isArray(value)) giftEventsByLive[liveId] = value;
    }
    const stats = buildMediaKitStats({
      summaryRows,
      profileSnapshots,
      giftEventsByLive,
      nowMs,
      windowsDays: [30, 60, 90]
    });
    const commentRowsByLive = {};
    try {
      const commentLives = liveIds.slice(0, MEDIA_KIT_COMMENT_LIVE_CAP);
      await deps.withTimeout(
        (async () => {
          const arrays = await Promise.all(
            commentLives.map((lid) => deps.readAllCommentsForLive(lid).catch(() => (
              /** @type {unknown[]} */
              []
            )))
          );
          commentLives.forEach((lid, index) => {
            commentRowsByLive[lid] = Array.isArray(arrays[index]) ? arrays[index] : [];
          });
        })(),
        MEDIA_KIT_SUPPORTER_SCAN_TIMEOUT_MS,
        "media_kit_supporter_scan_timeout"
      );
    } catch {
    }
    let profileMap = {};
    try {
      profileMap = await deps.resolveProfileMap() || {};
    } catch {
      profileMap = {};
    }
    const supporters = buildMediaKitSupporters({
      liveIds,
      giftEventsByLive,
      commentRowsByLive,
      profileMap
    });
    const html = buildMediaKitHtml(
      /** @type {any} */
      { ...stats, supporters },
      {
        generatedAtMs: nowMs,
        sourceLiveLimit: MEDIA_KIT_LIVE_LIMIT,
        sourceLiveLimitReached: liveIds.length >= MEDIA_KIT_LIVE_LIMIT,
        maskSupporters: deps.maskSupporters === true
      }
    );
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(nowMs));
    return {
      html,
      filename: `${date}_tsuioku-media-kit.html`,
      liveCount: stats.windows.find((window2) => window2.days === 90)?.liveCount || 0
    };
  }

  // src/lib/formatDateTime.js
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

  // src/lib/eventRankingSectionHtml.js
  function buildEventRankingSectionHtml(eventRankingModel, broadcasterProfileModel) {
    let eventRankingSectionHtml = "";
    try {
      const erm = (
        /** @type {any} */
        eventRankingModel
      );
      if (erm && typeof erm === "object") {
        const fmtN = (n) => Number(n).toLocaleString("en-US");
        const self = erm.self && typeof erm.self === "object" ? erm.self : null;
        const evName = String(erm.eventName || "").trim();
        const rows = Array.isArray(erm.rows) ? erm.rows : [];
        const headParts = [];
        if (evName) headParts.push(`<p class="event-rank__name">🏆 ${escapeHtml(evName)}</p>`);
        if (self && (self.rank != null || self.score != null)) {
          const selfUid = String(broadcasterProfileModel?.userId || "").trim();
          const selfNameHtml = self.broadcasterName ? /^\d{1,18}$/.test(selfUid) ? buildUserProfileLinkedLabelHtml(selfUid, String(self.broadcasterName)) : escapeHtml(String(self.broadcasterName)) : "";
          const who = self.broadcasterName ? `${selfNameHtml}さん` : "この配信者さん";
          const rk = self.rank != null ? `現在 <strong>${escapeHtml(String(self.rank))}</strong> 位` : "";
          const sc = self.score != null ? ` 💎 <strong>${escapeHtml(fmtN(self.score))}</strong>` : "";
          headParts.push(`<p class="event-rank__self">${who} ${rk}${sc}</p>`);
          if (self.rank != null && self.rank > 1 && self.diffToNext != null && self.diffToNext > 0) {
            headParts.push(`<p class="event-rank__diff">あと 💎 ${escapeHtml(fmtN(self.diffToNext))} で ${escapeHtml(String(self.rank - 1))} 位</p>`);
          }
        }
        const rowsHtml = rows.map((r) => {
          const rank = escapeHtml(String(r.rank));
          const rowUid = String(r.userId || "").trim();
          const rawName = String(r.name || "名無し");
          const name = /^\d{1,18}$/.test(rowUid) ? buildUserProfileLinkedLabelHtml(rowUid, rawName) : escapeHtml(rawName);
          const score = escapeHtml(fmtN(Number(r.score) || 0));
          const thumb = /^https?:\/\//i.test(String(r.thumbnailUrl || "")) ? String(r.thumbnailUrl) : "";
          const imgInner = thumb ? `<img class="event-rank__thumb" src="${escapeAttr(thumb)}" alt="" width="28" height="28" decoding="async" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'" />` : `<span class="event-rank__thumb event-rank__thumb--none" aria-hidden="true"></span>`;
          const img = /^\d{1,18}$/.test(rowUid) ? `<a href="https://www.nicovideo.jp/user/${encodeURIComponent(rowUid)}" target="_blank" rel="noopener noreferrer" class="nl-user-thumb-link">${imgInner}</a>` : imgInner;
          return `<tr><td class="event-rank__rank">${rank}</td><td>${img}</td><td class="event-rank__user">${name}</td><td class="event-rank__score">💎 ${score}</td></tr>`;
        }).join("");
        const staleNote = erm.isStale ? `<p class="event-rank__stale">※ この順位は少し前に取得した値です（配信中に変動します）。</p>` : "";
        if (headParts.length > 0 || rowsHtml) {
          eventRankingSectionHtml = `<section class="card" id="sec-event-ranking" style="margin-top:12px;"><h2>イベント順位</h2><p class="guide-lead">この配信が参加しているイベントの💎スコア順ランキングなのだ（公式の表示に準拠）。</p>` + (headParts.length ? `<div class="event-rank__head">${headParts.join("")}</div>` : "") + (rowsHtml ? `<table class="event-rank__table"><thead><tr><th>順位</th><th></th><th>配信者</th><th>累計💎</th></tr></thead><tbody>${rowsHtml}</tbody></table>` : "") + staleNote + `</section>`;
        }
      }
    } catch {
      eventRankingSectionHtml = "";
    }
    return eventRankingSectionHtml;
  }

  // src/lib/supportGrowthInsights.js
  function filterBroadcaster(comments, broadcasterUserId) {
    const uid = String(broadcasterUserId || "").trim();
    if (!uid) return Array.isArray(comments) ? comments.slice() : [];
    return (Array.isArray(comments) ? comments : []).filter(
      (c) => String(c?.userId || "").trim() !== uid
    );
  }
  function formatOffsetClock(ms, streamStart) {
    if (typeof ms !== "number" || !Number.isFinite(ms) || typeof streamStart !== "number") return "—";
    const rel = Math.max(0, ms - streamStart);
    const m = Math.floor(rel / 6e4);
    const h = Math.floor(m / 60);
    const mm = m % 60;
    if (h > 0) return `開始から約 ${h}時間${mm}分`;
    return `開始から約 ${m}分`;
  }
  function roughTokens2(text) {
    const t = String(text || "").replace(/https?:\/\/\S+/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!t) return [];
    const parts = t.split(/\s+/).filter((w) => w.length >= 2 && w.length <= 24);
    return parts.slice(0, 40);
  }
  function topKeys(counts, n) {
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
  }
  function safeNick(nick, mask) {
    const s = String(nick || "").trim();
    if (!s) return "ギフト参加者";
    return mask ? maskLabelForShare(s) : s;
  }
  function safeCommentSnippet(text, mask) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return "";
    const slice = t.length > 48 ? `${t.slice(0, 47)}…` : t;
    if (!mask) return slice;
    return maskLabelForShare(slice.length > 12 ? slice : `${slice}••`);
  }
  function buildSupportGrowthInsights(opts) {
    const report = opts.report;
    const mask = opts.maskShareLabels === true;
    const broadcasterUserId = String(opts.broadcasterUserId || "").trim();
    const comments = filterBroadcaster(opts.comments || [], broadcasterUserId);
    const giftUsers = Array.isArray(opts.giftUsers) ? opts.giftUsers.slice() : [];
    const sessionSummaryRows = Array.isArray(opts.sessionSummaryRows) ? opts.sessionSummaryRows : [];
    const pastBroadcasts = Array.isArray(opts.pastBroadcasts) ? opts.pastBroadcasts : [];
    const streamStart = (() => {
      let min = 0;
      for (const c of comments) {
        const at = c?.capturedAt;
        if (typeof at !== "number" || !Number.isFinite(at)) continue;
        if (!min || at < min) min = at;
      }
      return min;
    })();
    const total = comments.length;
    const lowData = total < 8;
    const velocity = buildCommentVelocityTimeline(comments, { bucketMs: 6e4, rollingWindowMin: 5 });
    const laughter = buildLaughterDensityTimeline(comments, { bucketMs: 3e4 });
    const silenceZones = detectCommentSilenceZones(comments, {
      thresholdMs: 6e4,
      quality: { windowMs: 3e4 }
    });
    const sentimentCurve = scoreSentimentTimeline(comments, { bucketMs: 6e4 });
    const newVsRepeat = classifyCommentersAgainstHistory({
      currentLiveId: report.liveId,
      currentComments: comments,
      pastBroadcasts: pastBroadcasts.map((b) => ({
        liveId: String(b?.liveId || ""),
        comments: filterBroadcaster(b?.comments || [], broadcasterUserId)
      })),
      heavyThreshold: 5
    });
    const firstSecondLatency = buildCommenterFirstSecondLatency(comments);
    const talentPeaks = detectTalentPeakMoments(comments);
    const echoPropagation = detectCommentPropagation(comments, { windowMs: 3e4, minDistinctUsers: 3 });
    const echoSync = detectCommentSyncBursts(comments, { windowMs: 5e3, minDistinctUsers: 3 });
    const concurrentSeries = buildConcurrentTimelineSeries(sessionSummaryRows);
    const concurrentPeak = analyzeConcurrentPeak(concurrentSeries);
    const departedHeavySilence = silenceZones.filter((z) => String(z?.quality) === "departed").length;
    const sentimentTotals = sentimentCurve.totals;
    const pos = sentimentTotals.positive + sentimentTotals.surprise;
    const neg = sentimentTotals.negative + sentimentTotals.confusion;
    const positiveLean = pos >= neg * 1.2;
    const endRetentionOk = concurrentPeak?.endRetentionRatio != null && concurrentPeak.endRetentionRatio >= 0.45;
    const newVisitorLean = newVsRepeat.totalCurrent > 0 && newVsRepeat.newCount / newVsRepeat.totalCurrent >= 0.35;
    const nextActions = [];
    if (lowData) {
      nextActions.push({
        phase: "全体",
        line: "短い枠でも OK。「今日来てくれてありがとう」と一言だけ入れる",
        because: "記録がまだ少なくて細かい傾向が読みにくい時間帯",
        effect: "コメントが増えやすい（安心の合図）"
      });
    } else {
      if (velocity.peakMinute != null && velocity.peakMinute <= 4) {
        nextActions.push({
          phase: "冒頭",
          line: "「初見さんも、一言だけでも挨拶だけ置いてってね」と軽く呼ぶ",
          because: "開始直後にコメントの山があり、流れが早い",
          effect: "参加の入口を広げる"
        });
      } else {
        nextActions.push({
          phase: "冒頭",
          line: "今日の目的を 10 秒で言い切ってから雑談に入る",
          because: "はじめの分かりやすさが後半の会話量に効きやすい",
          effect: "コメントが増えやすい"
        });
      }
      if (echoPropagation.length || echoSync.length) {
        nextActions.push({
          phase: "盛り上がり直後",
          line: "さっき盛り上がったワードを次回の冒頭で一回だけ振る",
          because: "同じ言葉が短時間に続いた「みんなで乗った」時間がある",
          effect: "再訪・合言葉化しやすい"
        });
      }
      if (giftUsers.length) {
        nextActions.push({
          phase: "ギフト直後",
          line: "『（名前）さん、ありがとう』＋今日のできたことひと言",
          because: "ギフト参加が記録に残っている",
          effect: "ギフト・投げのお礼が伝わる（催し付けに見えにくい）"
        });
      } else {
        nextActions.push({
          phase: "中盤",
          line: "「ここだけ答えて」で二択クイズを一問だけ挟む",
          because: "ギフトが少ない回でも、会話のきっかけを作れる",
          effect: "コメントが増えやすい"
        });
      }
      if (departedHeavySilence >= 1) {
        nextActions.push({
          phase: "沈黙が長く感じたら",
          line: "答えやすい二択（A か B）を出してから話を続ける",
          because: "「静かになったあと」が離脱向きに読める区間がある",
          effect: "離脱防止（空気が重くなりにくい）"
        });
      } else if (talentPeaks.length) {
        nextActions.push({
          phase: "盛り上がり直後",
          line: "「ここ良かったね」と自分でも一言だけまとめる",
          because: "間が空いたあと反応が返ってきた時間がある",
          effect: "リスナーの気持ちが続きやすい"
        });
      }
      nextActions.push({
        phase: "終盤",
        line: "終わり 5 分前に「次回いつ／なにするか」を一言だけ予告",
        because: endRetentionOk ? "終盤まで反応が残りやすかった" : "次回につなげると残りやすい",
        effect: "再訪しやすい"
      });
    }
    while (nextActions.length > 5) nextActions.pop();
    while (nextActions.length < 3 && !lowData) {
      nextActions.push({
        phase: "全体",
        line: "『コメントは読むけど打つのが苦手な人もいいねだけで OK』と伝える",
        because: "参加のハードルを下げると後から増えやすい",
        effect: "コメントが増えやすい"
      });
      if (nextActions.length >= 3) break;
    }
    const supportWindows = [];
    const vb = velocity.buckets || [];
    let bestV = -1;
    let bestVm = -1;
    for (const b of vb) {
      if (b.count > bestV) {
        bestV = b.count;
        bestVm = b.minute;
      }
    }
    if (bestVm >= 0 && bestV > 0) {
      const at = streamStart ? streamStart + bestVm * 6e4 : 0;
      supportWindows.push({
        label: "みんなが乗っていた時間",
        timeHint: streamStart ? formatOffsetClock(at, streamStart) : "記録の前半〜中盤",
        because: "このあたりでコメントの勢いが強かった"
      });
    }
    const lb = laughter.buckets || [];
    let bestL = -1;
    let bestLm = -1;
    for (const b of lb) {
      const c = b.count ?? 0;
      if (c > bestL) {
        bestL = c;
        bestLm = b.minute;
      }
    }
    if (bestLm >= 0 && bestL > 0) {
      const at = streamStart ? streamStart + bestLm * 3e4 : 0;
      supportWindows.push({
        label: "笑いやリアクションが集まった時間",
        timeHint: streamStart ? formatOffsetClock(at, streamStart) : "中盤付近",
        because: "笑い系の反応がここでまとまって見える"
      });
    }
    if (positiveLean && sentimentCurve.buckets.length >= 2) {
      let bestIdx = 0;
      let bestScore = -1;
      sentimentCurve.buckets.forEach((bu2, i) => {
        const s = bu2.positive + bu2.surprise - (bu2.negative + bu2.confusion) * 0.5;
        if (s > bestScore) {
          bestScore = s;
          bestIdx = i;
        }
      });
      const bu = sentimentCurve.buckets[bestIdx];
      if (bu && bestScore > 0) {
        supportWindows.push({
          label: "お願いしても空気が重くなりにくい時間",
          timeHint: streamStart ? formatOffsetClock(bu.atStart, streamStart) : "中盤",
          because: "この付近は前向きな言い回しが目立ちやすかった"
        });
      }
    }
    if (echoSync.length) {
      const b0 = echoSync[0];
      const at = (b0.firstAt + b0.lastAt) / 2;
      if (Number.isFinite(at)) {
        supportWindows.push({
          label: "みんなが同じ言葉で盛り上がった瞬間",
          timeHint: streamStart ? formatOffsetClock(at, streamStart) : "—",
          because: "短時間に同じ反応が重なった"
        });
      }
    }
    const giftFlow = [];
    const WIN = 3 * 6e4;
    for (const g of giftUsers.slice(0, 8)) {
      const uid = String(g.userId || "").trim();
      const at = g.capturedAt;
      if (!uid || typeof at !== "number" || !Number.isFinite(at)) continue;
      const beforeCounts = /* @__PURE__ */ new Map();
      const afterCounts = /* @__PURE__ */ new Map();
      let beforeN = 0;
      let afterN = 0;
      for (const c of comments) {
        const ca = c?.capturedAt;
        if (typeof ca !== "number" || !Number.isFinite(ca)) continue;
        const text = String(c.text || "");
        if (ca < at && ca >= at - WIN) {
          beforeN += 1;
          for (const w of roughTokens2(text)) {
            beforeCounts.set(w, (beforeCounts.get(w) || 0) + 1);
          }
        }
        if (ca > at && ca <= at + WIN) {
          afterN += 1;
          for (const w of roughTokens2(text)) {
            afterCounts.set(w, (afterCounts.get(w) || 0) + 1);
          }
        }
      }
      const beforeWords = topKeys(beforeCounts, 4).join("、") || "（目立つ単語は少なめ）";
      const afterWords = topKeys(afterCounts, 4).join("、") || "（目立つ単語は少なめ）";
      const nick = safeNick(g.nickname, mask);
      giftFlow.push({
        headline: `${nick} さんのギフト前後（記録は初回検知時刻ベース）`,
        beforeHint: `その前後 3 分のコメント数: 前 ${beforeN} / 後 ${afterN}。前に出やすかった言葉: ${beforeWords}`,
        afterHint: `後に出やすかった言葉: ${afterWords}`,
        thankTimingHint: afterN >= beforeN ? "お礼の一言はギフト直後が自然（反応が続きやすい）" : "短くお礼を挟んでから、話題を戻すと流れが滑らか"
      });
    }
    const onboarding = {
      summaryLine: "",
      voiceExamples: [
        "「初見さんも、好きな食べ物だけ置いてってね」",
        "「今来た人向けに 10 秒で説明すると…」",
        "「打つのが苦手な人は 888 だけでも大丈夫」"
      ]
    };
    if (newVsRepeat.totalCurrent > 0) {
      const ratio = newVsRepeat.newCount / newVsRepeat.totalCurrent;
      if (ratio >= 0.4) {
        onboarding.summaryLine = "初めての反応が目立つ回に見える（「初見さんが入りやすい回」になりやすい）";
      } else if (ratio <= 0.15) {
        onboarding.summaryLine = "いつものメンバーが中心になりやすい回に見える（深い会話向き）";
      } else {
        onboarding.summaryLine = "初見さんと常連さんが混ざりやすいバランスに見える";
      }
    } else {
      onboarding.summaryLine = "ユーザー層の比率は十分な記録がないため省略";
    }
    const fsTotal = firstSecondLatency.totalUsers || 0;
    const fsQuick = (firstSecondLatency.distribution?.["<10s"] || 0) + (firstSecondLatency.distribution?.["10-30s"] || 0);
    if (fsTotal > 0 && fsQuick / fsTotal >= 0.35) {
      onboarding.voiceExamples.push(
        "「2 コメ目までが早い人が多いので、短く拾ってあげると続きやすいかも」"
      );
    }
    const clippingMoments = [];
    for (const tp of talentPeaks.slice(0, 2)) {
      const mid = (tp.silenceEndAt + tp.silenceStartAt) / 2;
      let sample = "";
      for (const c of comments) {
        const ca = c?.capturedAt;
        if (typeof ca !== "number") continue;
        if (ca >= tp.silenceEndAt && ca <= tp.silenceEndAt + 25e3) {
          sample = safeCommentSnippet(String(c.text || ""), mask);
          break;
        }
      }
      clippingMoments.push({
        atLabel: streamStart ? formatOffsetClock(mid, streamStart) : "—",
        reason: "間が空いたあと反応が返ってきた時間（話の転換点になりやすい）",
        sampleLine: sample || "（代表コメントはこの近くを見る）",
        promoHint: "短く切り抜くなら「間→盛り上がり」の流れが伝わるカット",
        kind: "talk"
      });
    }
    for (const b of laughter.buckets || []) {
      if ((b.count || 0) < 2) continue;
      const at = b.atStart;
      let sample = "";
      for (const c of comments) {
        const ca = c?.capturedAt;
        if (typeof ca !== "number") continue;
        if (ca >= at && ca < at + 3e4) {
          const tx = String(c.text || "");
          if (/[wｗ草笑ワロタ8888]/i.test(tx)) {
            sample = safeCommentSnippet(tx, mask);
            break;
          }
        }
      }
      clippingMoments.push({
        atLabel: streamStart ? formatOffsetClock(at + 15e3, streamStart) : "—",
        reason: "ここは笑いやリアクションが集中",
        sampleLine: sample || "（笑い系のコメントがまとまって見える）",
        promoHint: "SNS なら「この瞬間だけでも見てほしい」系の一言が合いやすい",
        kind: "laugh"
      });
      if (clippingMoments.length >= 5) break;
    }
    for (const eb of echoSync.slice(0, 2)) {
      const at = (eb.firstAt + eb.lastAt) / 2;
      if (!Number.isFinite(at)) continue;
      clippingMoments.push({
        atLabel: streamStart ? formatOffsetClock(at, streamStart) : "—",
        reason: "みんなが同じ言葉で重なった瞬間（内輪っぽさが強いことも）",
        sampleLine: eb.text ? safeCommentSnippet(eb.text, mask) : "（被りワード周辺）",
        promoHint: "常連向けの「その日の合言葉」として使えることがある",
        kind: "echo"
      });
    }
    const listenerRewards = [];
    listenerRewards.push({ line: "よく書いてくれた人の話題を、次回の最初に軽く触れる" });
    if (giftUsers.length) {
      listenerRewards.push({ line: "ギフトが出たら短く名前を呼んで一言お礼（長く説明しない）" });
    }
    listenerRewards.push({ line: "初コメっぽい短文には「ありがとう」だけでも返すと続きやすい" });
    listenerRewards.push({
      line: "よく出た言葉を「次回の合言葉」として一回だけ使うと参加しやすい"
    });
    const askTiming = { good: [], bad: [] };
    if (positiveLean) {
      askTiming.good.push("前向きなコメントが目立つ時間は、お礼や軽い案内が自然");
    }
    if (bestV > 2) {
      askTiming.good.push("コメントの勢いがある時間は、短いお願いも空気が軽い");
    }
    if (giftUsers.length && endRetentionOk) {
      askTiming.good.push("終盤まで反応が残りやすい回は、締めのお礼が効きやすい");
    }
    if (departedHeavySilence >= 2) {
      askTiming.bad.push("静かな時間が「離脱向き」と読める区間では、お願いより雑談に戻す");
    }
    if (!positiveLean && neg > pos) {
      askTiming.bad.push("不安や迷いの言い回しが目立つときは、支援の話より安心の話を先に");
    }
    if (newVisitorLean && fsTotal > 0 && fsQuick / fsTotal < 0.2) {
      askTiming.bad.push("初見さんが多いのに 2 コメ目が伸びにくいときは、長いお願いより短い呼びかけを先に");
    }
    const caution = [];
    if (!giftUsers.length && total > 30) {
      caution.push("ギフト記録が無い回でも失敗ではないのだ。コメントの山や笑いの時間をまず探すのだ。");
    }
    if (giftUsers.length && total < 5) {
      caution.push("ギフト記録はあるがコメント記録が少ない。結合の精度は参考程度に留めるのだ。");
    }
    const adviceSlice = {
      hasGiftSignals: giftUsers.length > 0,
      lowData,
      departedSilenceHeavy: departedHeavySilence >= 2,
      positiveLean,
      giftFlowRows: giftFlow.length,
      newVisitorLean,
      endRetentionOk: Boolean(endRetentionOk)
    };
    return {
      nextActions: nextActions.slice(0, 5),
      supportWindows: supportWindows.slice(0, 6),
      giftFlow,
      onboarding,
      clippingMoments: clippingMoments.slice(0, 8),
      listenerRewards,
      askTiming,
      caution,
      adviceSlice,
      meta: {
        streamStartAt: streamStart || null,
        giftNote: "ギフトはストレージ上 userId ごとに 1 行で、時刻は初回検知に近い場合があるのだ。"
      }
    };
  }
  function buildReportMemoPayload(opts) {
    const full = buildSupportGrowthInsights(opts);
    return {
      nextMemos: full.nextActions.slice(0, 3).map((a) => `${a.phase}: ${a.line}`),
      highlights: full.clippingMoments.slice(0, 3).map((c) => ({
        atLabel: c.atLabel,
        reason: c.reason,
        sampleLine: c.sampleLine
      })),
      thanksPoints: [
        full.adviceSlice.hasGiftSignals ? "ギフト・投げに反応があった" : null,
        full.supportWindows.length ? "盛り上がりの時間帯が読み取れた" : null,
        full.onboarding.summaryLine ? "初見さんの入り方の傾向メモ" : null
      ].filter(Boolean),
      templates: full.onboarding.voiceExamples.slice(0, 4),
      caution: full.caution
    };
  }

  // src/lib/reportNextMemoSectionHtml.js
  function buildReportNextMemoSectionHtml(memo, avatars = {}) {
    const m = (
      /** @type {any} */
      memo || {}
    );
    const nextMemos = Array.isArray(m.nextMemos) ? m.nextMemos : [];
    const highlights = Array.isArray(m.highlights) ? m.highlights : [];
    const thanksPoints = Array.isArray(m.thanksPoints) ? m.thanksPoints : [];
    const templates = Array.isArray(m.templates) ? m.templates : [];
    const avatarLink = String(avatars.avatarLink || "");
    const avatarKonta = String(avatars.avatarKonta || "");
    const avatarTanu = String(avatars.avatarTanu || "");
    const memLis = nextMemos.length > 0 ? nextMemos.map((x) => `<li>${escapeHtml(x)}</li>`).join("") : "<li>（まだ十分なメモが出ません）</li>";
    const hiLis = highlights.length > 0 ? highlights.map(
      (h) => `<li><strong>${escapeHtml(h.atLabel)}</strong> — ${escapeHtml(h.reason)}<br><span class="memo-sample">${escapeHtml(h.sampleLine)}</span></li>`
    ).join("") : "<li>（この枠では目立つ場面の抽出がまだ少ないです）</li>";
    const thLis = thanksPoints.length > 0 ? thanksPoints.map((t) => `<li>${escapeHtml(t)}</li>`).join("") : "<li>（記録が増えるとここが埋まります）</li>";
    const tplLis = templates.length > 0 ? templates.map((t) => `<li>${escapeHtml(t)}</li>`).join("") : "<li>（テンプレはマーケ分析の「りんく達の作戦会議」も参照）</li>";
    const dynamicNote = "この内容は今回の配信データから組み立てています。配信内容によって毎回変わります。";
    const trioGuideHtml = `
        <div class="yukkuri-guide memo-yukkuri-guide" role="note" aria-label="りんく・こん太・たぬ姉の次枠ガイド">
          <div class="yukkuri-row">
            ${avatarLink}
            <div class="speech-bubble">
              <strong>りんくより</strong>
              <p>次の枠で試しやすい順に、まずはやってみる作戦をまとめたよ。1つだけでも十分なのだ。</p>
            </div>
          </div>
          <div class="yukkuri-row">
            ${avatarKonta}
            <div class="speech-bubble">
              <strong>こん太より</strong>
              <p>リスナーが参加しやすかった流れを拾ってるよ。声かけやお礼の言葉に使うと、空気があたたまりやすいのだ。</p>
            </div>
          </div>
          <div class="yukkuri-row">
            ${avatarTanu}
            <div class="speech-bubble">
              <strong>たぬ姉より</strong>
              <p>${escapeHtml(dynamicNote)}</p>
            </div>
          </div>
        </div>`;
    return `
      <section class="card yukkuri-guide-card" id="sec-next-memo" style="margin-top:12px;">
        <h2>りんく・こん太・たぬ姉の次枠メモ</h2>
        <p class="guide-lead">詳しい分析より先に、次の配信で試せる短い作戦をまとめたのだ。</p>
        ${trioGuideHtml}
        <h3>次の配信で試したいこと（最大3）</h3>
        <ol>${memLis}</ol>
        <h3>盛り上がった場面（最大3）</h3>
        <ul>${hiLis}</ul>
        <h3>ありがとうポイント</h3>
        <ul>${thLis}</ul>
        <h3>次の配信で使える一言テンプレ</h3>
        <ul>${tplLis}</ul>
      </section>`;
  }

  // src/lib/reportHeadInfoRowsHtml.js
  function buildReportLinkRows(links) {
    return (Array.isArray(links) ? links : []).map((v) => {
      const search = escapeAttr(`${v.rel} ${v.href} ${v.as} ${v.type}`.toLowerCase());
      return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(v.rel)}</td>
          <td>${escapeHtml(v.href || "-")}</td>
          <td>${escapeHtml(v.as || "-")}</td>
          <td>${escapeHtml(v.type || "-")}</td>
        </tr>
      `;
    });
  }
  function buildReportMetaRows(metas) {
    return (Array.isArray(metas) ? metas : []).map((v) => {
      const search = escapeAttr(`${v.key} ${v.value}`.toLowerCase());
      return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(v.key)}</td>
          <td>${escapeHtml(v.value || "-")}</td>
        </tr>
      `;
    });
  }
  function buildReportScriptRows(scripts) {
    return (Array.isArray(scripts) ? scripts : []).map((v) => {
      const search = escapeAttr(`${v.src} ${v.type}`.toLowerCase());
      return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(v.type || "text/javascript")}</td>
          <td>${escapeHtml(v.src || "-")}</td>
        </tr>
      `;
    });
  }
  function buildReportNoopenerRows(links) {
    return (Array.isArray(links) ? links : []).map((v) => {
      const search = escapeAttr(`${v.text} ${v.href}`.toLowerCase());
      return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(v.text || "-")}</td>
          <td>${escapeHtml(v.href || "-")}</td>
        </tr>
      `;
    });
  }

  // src/lib/broadcastReportSummary.js
  function toFiniteNumberOrNull(v) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
    if (typeof v === "string" && v.trim()) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  }
  function summarizeBroadcastTiming(input) {
    const snapshot = input?.snapshot ?? null;
    const comments = Array.isArray(input?.comments) ? input.comments : [];
    const lvRaw = snapshot && typeof snapshot === "object" ? snapshot.broadcasterLevel : null;
    const broadcasterLevel = typeof lvRaw === "number" && Number.isFinite(lvRaw) && lvRaw > 0 ? lvRaw : null;
    let first = null;
    let last = null;
    let validCount = 0;
    for (const c of comments) {
      const at = toFiniteNumberOrNull(c?.capturedAt);
      if (at == null) continue;
      validCount += 1;
      if (first == null || at < first) first = at;
      if (last == null || at > last) last = at;
    }
    const durationMs = first != null && last != null ? last - first : 0;
    const durationMinutes = durationMs / 6e4;
    const commentsPerMinute = durationMinutes > 0 && validCount > 1 ? Math.round(validCount / durationMinutes * 100) / 100 : 0;
    return {
      broadcasterLevel,
      firstCapturedAt: first,
      lastCapturedAt: last,
      durationMs,
      durationMinutes,
      commentsPerMinute
    };
  }
  function summarizeCommentBodyStats(comments) {
    const list = Array.isArray(comments) ? comments : [];
    if (!list.length) {
      return { totalCount: 0, totalChars: 0, averageChars: 0, medianChars: 0, maxChars: 0 };
    }
    const lengths = [];
    let total = 0;
    let max = 0;
    for (const c of list) {
      const len = String(c?.text == null ? "" : c.text).length;
      lengths.push(len);
      total += len;
      if (len > max) max = len;
    }
    lengths.sort((a, b) => a - b);
    const mid = Math.floor(lengths.length / 2);
    const median2 = lengths.length % 2 === 0 ? (lengths[mid - 1] + lengths[mid]) / 2 : lengths[mid];
    const average2 = Math.round(total / lengths.length * 100) / 100;
    return {
      totalCount: lengths.length,
      totalChars: total,
      averageChars: average2,
      medianChars: median2,
      maxChars: max
    };
  }
  function summarizeIdentifierStats(comments) {
    const list = Array.isArray(comments) ? comments : [];
    let numeric = 0;
    let anon = 0;
    let self = 0;
    let other = 0;
    for (const c of list) {
      const uid = c?.userId == null ? "" : String(c.userId).trim();
      if (c?.selfPosted) self += 1;
      if (/^\d+$/.test(uid)) {
        numeric += 1;
      } else if (isNiconicoAnonymousUserId(uid)) {
        anon += 1;
      } else {
        other += 1;
      }
    }
    const total = list.length;
    return {
      totalCount: total,
      numericIdCount: numeric,
      anonymous184Count: anon,
      selfPostedCount: self,
      otherCount: other,
      numericIdRatio: total > 0 ? Math.round(numeric / total * 1e3) / 1e3 : 0,
      anonymous184Ratio: total > 0 ? Math.round(anon / total * 1e3) / 1e3 : 0
    };
  }

  // src/lib/broadcastDurationLabel.js
  function formatBroadcastDurationLabel(timing) {
    const min = timing?.durationMinutes;
    if (!min || min <= 0) return "-";
    const ms = timing?.durationMs;
    const totalSeconds = Math.round((typeof ms === "number" ? ms : 0) / 1e3);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor(totalSeconds % 3600 / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}時間${m}分${s}秒`;
    if (m > 0) return `${m}分${s}秒`;
    return `${s}秒`;
  }

  // src/lib/htmlReportConceptGuide.js
  var CONCEPT_H2 = "この拡張について（君斗りんくの追憶のきらめき）";
  var CONCEPT_TEASER_LEAD = "このブラウザ拡張の呼び名は「君斗りんくの追憶のきらめき」なのだ。ニコニコ生放送の応援コメントをこのPCに記録し、応援の可視化やあとからの振り返りにつなげるのだ。詳しい文脈は、下の折りたたみを開いてほしいのだ。";
  var CONCEPT_READ_MORE_1_BODY = `
          <p class="concept-read-more__prose">
            ダウンロードする HTML のファイル名などには、開発識別子として <strong>nicolivelog</strong>
            が付くことがあるのだ。Chrome の拡張一覧に表示される名前は「君斗りんくの追憶のきらめき」なのだ。
          </p>
          <p class="concept-read-more__prose">
            基本の視聴は外部プラットフォーム上で起きるのだ。だから「サイトに来たユニーク」だけでは、応援の全体像は見えにくいのだ。この拡張は、コメントという<strong>応援の痕跡</strong>をローカルに残し、主催側もファン側も「ちゃんとあった」と確認しやすくするのだ。
          </p>
          <p class="concept-read-more__prose">
            ニコ生の<strong>累計来場者数</strong>（配信ページの statistics.watchCount 相当）は、<a href="https://nicodb.net/" target="_blank" rel="noopener noreferrer">NicoDB（nicodb.net）</a> の「来場者数」と同系で比較しやすいのだ。下の「来場（応援コメント）」の話とは<strong>別の定義</strong>なのだ。
          </p>
          <p class="concept-read-more__prose">
            今後、X（旧Twitter）などチャネルが増えても、<strong>定義をすり替えずに</strong>同じ考え方でそろえていきたいのだ。用語の定義ページを別途用意し、「来場」「応援ログ」などを共有しておくイメージなのだ。
          </p>
          <p class="concept-read-more__prose">
            <strong>動員ちゃれんじ</strong>（<a href="https://doin-challenge.com/" target="_blank" rel="noopener noreferrer">doin-challenge.com</a>）は、この拡張と<strong>文脈でリンクしている関連の取り組み</strong>なのだ。サイト側のコンセプトと、ここで残るコメント記録を、同じ土俵で語れるようにしたいのだ。
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
  var LINK_PARAS = [
    "応援は、消えやすいのだ。外のプラットフォームだけだと、いいねも返信もつきにくく、自分だけ浮いているように感じて、投稿やコメントを消してしまう人もいるのだ。それは応援した人が悪いのではなく、<strong>届いたかどうかが見えにくい</strong>からなのだ。アイドルや配信の現場でも、応援投稿して反応がなくて消す、という話はよく聞くのだ。",
    "だから「<strong>応援ログ</strong>」の考え方があるのだ。ファンには「ちゃんと応援したことが、ここに残る」、主催には「ちゃんと見ているよ」を、返信の本数だけに頼らず伝えやすくするのだ。すべてに手で返すことが正解とは限らないのだ。",
    "今後 X なども視野に入れるなら、ハッシュタグやメンションなど「これをしたら記録対象」といったルールをそろえていくイメージなのだ。削除や非公開になった投稿は、プラットフォーム側の都合で追いにくいこともあるのだ。",
    "応援の<strong>可視化</strong>は、数字の競争だけではないのだ。<strong>ちゃんと応援した人が、仕組み上すくわれる</strong>方向に寄せたいのだ。"
  ];
  var KONTA_PARAS = [
    "主催側には、「<strong>ちゃんと見てるよ</strong>」が伝わるようにしたいのだ。ログがあれば、すべてのコメントに手で返さなくても、受け取ったことが形として共有しやすいのだ。",
    "<strong>コメント</strong>や<strong>アイテム</strong>、テンションを上げてくれる行為には、一生懸命の熱量があるのだ。<strong>盛り上げてくれた人</strong>を、件数や同接の数字だけで切り捨てないでいたいのだ。",
    "同時接続（同接）の数字は、サーバー上の数だけではないのだ。<strong>同じ時間にスケジュールを合わせてきた</strong>、そのコストと意志も含めて、厚みとして語れるのだ。表示の定義はサービスごとに違うから、公式に数えるときはルールをそろえるのだ。",
    "この HTML レポートは、あとから読み返す<strong>振り返り用メモ</strong>でもあるのだ。創作者がファンの熱量に気づく手がかりになればいいのだ。"
  ];
  var TANU_PARAS = [
    "「<strong>来場</strong>」を数えるときの原則として、<strong>応援コメントが一本はあること</strong>、という考え方を軸にしたいのだ。見ているだけの人まで同じ枠に入れないと、エンゲージした人がかえって見えにくくなるのだ。",
    '応援コメントを記録するこの拡張の設計と、「来場」や「参加」の語は、つながるのだ。<strong>動員ちゃれんじ</strong>（<a href="https://doin-challenge.com/" target="_blank" rel="noopener noreferrer">doin-challenge.com</a>）と<strong>リンクして</strong>、オンラインの応援と会場への動線を、同じ文脈で語れるようにしたいのだ。動員チャンネルなどで、定義を毎回すり替えないのが大事なのだ。',
    "熱量の階段をイメージすると、視聴・同じ時間帯にいる、デジタル上の応援（コメントやアイテム）、そして<strong>イベント当日、身体を動かしてライブ会場に来てくれたこと</strong>を、いちばん重い参加として置きたいのだ。オンラインの応援を軽くする話ではないのだ。<strong>来られない理由</strong>は人それぞれだから、別軸で尊重するのだ。",
    "全体の「ユニークユーザー」をプラットフォーム横断で正確に一つにまとめるのは難しいのだ。だから「この拡張とレポートで何を数えるか」を、文章で共有しておくのだ。"
  ];
  var SAVE_H2 = "なにこれ？（キャラガイド）";
  var SAVE_LEAD = "このHTMLは、このPCに保存したコメントと、当時の放送ページから取れた情報をまとめた「振り返り用メモ」なのだ。応援の痕跡を残すための記録でもあるのだ。";
  function conceptReadMoreHtml(summaryTitle, bodyHtml) {
    return `
        <details class="concept-read-more">
          <summary class="concept-read-more__summary">
            <span class="concept-read-more__tag">続きを読む</span>
            <span class="concept-read-more__title">${summaryTitle}</span>
          </summary>
          <div class="concept-read-more__body">${bodyHtml}</div>
        </details>`;
  }
  function buildHtmlReportConceptGuideCardHtml(avatars) {
    const { avatarLinkHtml, avatarKontaHtml, avatarTanuHtml } = avatars;
    const linkRow = yukkuriGuideRowMultiHtml(
      avatarLinkHtml,
      "ガイドキャラりんく",
      LINK_PARAS,
      false
    );
    const kontaRow = yukkuriGuideRowMultiHtml(
      avatarKontaHtml,
      "ガイドキャラこん太",
      KONTA_PARAS,
      true
    );
    const tanuRow = yukkuriGuideRowMultiHtml(
      avatarTanuHtml,
      "ガイドキャラたぬ姉",
      TANU_PARAS,
      false
    );
    const accordions = [
      conceptReadMoreHtml("ねらい・名前・動員ちゃれんじとの関係", CONCEPT_READ_MORE_1_BODY),
      conceptReadMoreHtml("ガイドキャラりんく：応援ログと可視化", linkRow),
      conceptReadMoreHtml("ガイドキャラこん太：主催の「見ている」と熱量", kontaRow),
      conceptReadMoreHtml("ガイドキャラたぬ姉：来場・会場・定義の話", tanuRow)
    ].join("");
    return `
      <section class="card yukkuri-guide-card" style="margin-top:12px;">
        <h2>${CONCEPT_H2}</h2>
        <p class="guide-lead">${CONCEPT_TEASER_LEAD}</p>
        ${accordions}
      </section>`;
  }
  function buildHtmlReportSaveGuideCardHtml(avatars) {
    const { avatarLinkHtml, avatarKontaHtml, avatarTanuHtml } = avatars;
    const rows = [
      yukkuriGuideRowHtml(
        avatarLinkHtml,
        "ガイドキャラりんく",
        "まずは上の「概要」でタイトルと配信者を確認するのだ。検索ボックスにキーワードを入れると、このページ全体から絞り込めるのだ。",
        false
      ),
      yukkuriGuideRowHtml(
        avatarKontaHtml,
        "ガイドキャラこん太",
        "「シェア・プレビュー向け」は、LINEやXでリンクを貼ったときに出やすいタイトルや説明文なのだ。細かい英語のキー名は気にしなくてよいのだ。",
        true
      ),
      yukkuriGuideRowHtml(
        avatarTanuHtml,
        "ガイドキャラたぬ姉",
        "アプリ連携用の長いタグや script のURLは、下の折りたたみにまとめてあるのだ。調べものをするとき以外は開かなくて大丈夫なのだ。タグのチップは上の概要と同じだから、表では二度出さないのだ。",
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

  // src/lib/excludeBroadcasterFromRankedRooms.js
  function excludeBroadcasterFromRankedRooms(rooms, broadcasterUid) {
    if (!Array.isArray(rooms)) return [];
    const uid = String(broadcasterUid ?? "").trim();
    if (!uid) return rooms.slice();
    return rooms.filter((room) => {
      const userKey = String(room?.userKey ?? "").trim();
      return userKey !== uid;
    });
  }

  // src/lib/sanitizeRoomAvatarsForBroadcaster.js
  function sanitizeRoomAvatarForBroadcaster(room, ctx) {
    if (!room || typeof room !== "object") return room;
    const av = String(room.avatarUrl ?? "").trim();
    if (!av) return room;
    const broadcasterUid = String(ctx?.broadcasterUid ?? "").trim();
    const broadcasterIconUrl = String(ctx?.broadcasterIconUrl ?? "").trim();
    const userKey = String(room.userKey ?? "").trim();
    const avUid = extractNiconicoUserIdFromIconUrl(av);
    if (avUid) {
      const isAnonymousLike = !userKey || userKey === "__unknown__" || /^a:/.test(userKey);
      if (isAnonymousLike) {
        return { ...room, avatarUrl: "" };
      }
      if (/^\d+$/.test(userKey) && userKey !== avUid) {
        return { ...room, avatarUrl: "" };
      }
    }
    if (!broadcasterUid || !broadcasterIconUrl) return room;
    if (userKey === broadcasterUid) return room;
    if (!isSameAvatarUrl(av, broadcasterIconUrl)) return room;
    return { ...room, avatarUrl: "" };
  }
  function sanitizeRoomAvatarsForBroadcaster(rooms, ctx) {
    if (!Array.isArray(rooms)) return [];
    return rooms.map((r) => sanitizeRoomAvatarForBroadcaster(r, ctx));
  }

  // src/lib/externalLinksSectionHtml.js
  function buildExternalLinksSectionHtml(noopenerLinks) {
    const links = Array.isArray(noopenerLinks) ? noopenerLinks : [];
    const seen = /* @__PURE__ */ new Set();
    const chips = [];
    for (const l of links) {
      const href = String(l?.href || "").trim();
      if (!isHttpOrHttpsUrl(href) || seen.has(href)) continue;
      seen.add(href);
      let label = String(l?.text || "").replace(/\s+/g, " ").trim();
      if (!label) {
        try {
          label = new URL(href).hostname.replace(/^www\./, "");
        } catch {
          label = href;
        }
      }
      if (label.length > 60) label = `${label.slice(0, 57)}…`;
      chips.push(
        `<a class="tag-chip nl-user-profile-link" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
      );
      if (chips.length >= 20) break;
    }
    return chips.length ? `<h2 style="margin-top:12px;">支援物資・外部リンク</h2><div class="tag-list">${chips.join("")}</div>` : "";
  }

  // src/lib/reportThumbedUsersSectionHtml.js
  function reportThumbCellHtml(u) {
    const label = displayUserLabel(u.userId, u.nickname || "");
    const labelHtml = buildUserProfileLinkedLabelHtml(u.userId, label);
    return `<li class="report-thumb-grid__cell">
        <span class="report-thumb-grid__avatar-wrap"><img class="report-thumb-grid__avatar" src="${escapeAttr(u.thumbSrc)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
        <span class="report-thumb-grid__label">${labelHtml}</span>
        <span class="report-thumb-grid__count">${u.count}件</span>
      </li>`;
  }
  function buildReportThumbedUsersSectionHtml(input) {
    const numericUsers = Array.isArray(input?.numericUsers) ? input.numericUsers : [];
    const anonymousUsers = Array.isArray(input?.anonymousUsers) ? input.anonymousUsers : [];
    const thumbNumericBlockHtml = numericUsers.length > 0 ? `
          <h3 class="report-thumb-grid__heading">数値 ID（個人サムネ・ニコ既定アイコン）<span class="report-thumb-grid__heading-count">${numericUsers.length}名</span></h3>
          <ol class="report-thumb-grid">${numericUsers.map(reportThumbCellHtml).join("")}</ol>
        ` : "";
    const thumbAnonymousBlockHtml = anonymousUsers.length > 0 ? `
          <h3 class="report-thumb-grid__heading">匿名（識別子から生成した identicon）<span class="report-thumb-grid__heading-count">${anonymousUsers.length}名</span></h3>
          <ol class="report-thumb-grid">${anonymousUsers.map(reportThumbCellHtml).join("")}</ol>
        ` : "";
    return numericUsers.length > 0 || anonymousUsers.length > 0 ? `
        <section class="card" id="sec-thumb-grid">
          <h2>サムネ付きユーザー一覧</h2>
          <p class="guide-lead">アイコンが解決できた応援ユーザーを件数の多い順、種別ごとに並べたのだ（各カテゴリ最大 80 名）。アイコンは ① 個人サムネ ② ニコ既定アイコン ③ 識別子から生成した identicon の優先順なのだ。</p>
          ${thumbNumericBlockHtml}
          ${thumbAnonymousBlockHtml}
        </section>
      ` : "";
  }

  // src/lib/kiramekiAwards.js
  var AWARD_DEFS = (
    /** @type {const} */
    [
      {
        id: "tomoshibi",
        name: "ともしびのきらめき",
        emoji: "🕯️",
        category: "all",
        description: "この配信に参加してくれたすべての人へ。コメント・ギフト・広告—どんな形でも、あなたの灯りが届いていました。"
      },
      {
        id: "kayoi",
        name: "かよいのきらめき",
        emoji: "🌿",
        category: "fixed",
        description: "前の枠から引き続き来てくれた常連さんへ。継続する応援が配信の土台を作っています。"
      },
      {
        id: "hajimari",
        name: "はじまりのきらめき",
        emoji: "🌱",
        category: "fixed",
        description: "はじめて参加してくれた方へ。その最初の一歩が、配信の世界を広げてくれます。"
      },
      {
        id: "kotoba",
        name: "ことばのきらめき",
        emoji: "✍️",
        category: "fixed",
        description: "手間をかけた長文・凝った応援を書いてくれた人へ。その丁寧さはちゃんと届いています。"
      },
      {
        id: "hikari",
        name: "ひかりのきらめき",
        emoji: "✨",
        category: "daily",
        description: "今日の配信でいちばん場を照らした人へ。あなたの存在感が配信を輝かせました。"
      },
      {
        id: "egao",
        name: "えがおのきらめき",
        emoji: "😊",
        category: "daily",
        description: "短くても場を笑わせた・動かした一言を放った人へ。軽やかな応援も立派な光です。"
      },
      {
        id: "sotto",
        name: "そっとのきらめき",
        emoji: "🤍",
        category: "daily",
        description: "あたたかいコメントで場を包んでくれた人へ。数や勢いに関係なく、その優しさは輝いていました。"
      }
    ]
  );
  var KOTOBA_MIN_CHARS_TOTAL = 50;
  var HIKARI_TOP_N = 3;
  var EGAO_MAX_CHARS_PER_COMMENT = 10;
  var EGAO_MIN_SHORT_COUNT = 3;
  var SOTTO_WARM_WORDS = [
    "ありがとう",
    "おつかれ",
    "お疲れ",
    "がんばって",
    "頑張って",
    "すごい",
    "素晴らしい",
    "うれしい",
    "嬉しい",
    "たのしい",
    "楽しい",
    "だいすき",
    "大好き",
    "かわいい",
    "可愛い",
    "よかった",
    "良かった",
    "さすが",
    "応援",
    "おうえん",
    "ファイト",
    "ぎゅー",
    "なでなで",
    "いつもありがとう",
    "またくるね",
    "また来るね",
    "おかえり",
    "おめでとう"
  ];
  function hasWarmWord(text) {
    const t = String(text || "").toLowerCase();
    return SOTTO_WARM_WORDS.some((w) => t.includes(w));
  }
  function buildUserTotalCharsMap(comments, broadcasterUserId) {
    const map = /* @__PURE__ */ new Map();
    for (const c of comments) {
      const uid = String(c?.userId || "").trim() || "__anon__";
      if (broadcasterUserId && uid === broadcasterUserId) continue;
      const len = String(c?.text ?? "").length;
      map.set(uid, (map.get(uid) || 0) + len);
    }
    return map;
  }
  function buildUserShortCommentCountMap(comments, broadcasterUserId) {
    const map = /* @__PURE__ */ new Map();
    for (const c of comments) {
      const uid = String(c?.userId || "").trim() || "__anon__";
      if (broadcasterUserId && uid === broadcasterUserId) continue;
      const len = String(c?.text ?? "").length;
      if (len > 0 && len <= EGAO_MAX_CHARS_PER_COMMENT) {
        map.set(uid, (map.get(uid) || 0) + 1);
      }
    }
    return map;
  }
  function buildSottoUserSet(comments, broadcasterUserId) {
    const set = /* @__PURE__ */ new Set();
    for (const c of comments) {
      const uid = String(c?.userId || "").trim() || "__anon__";
      if (broadcasterUserId && uid === broadcasterUserId) continue;
      if (hasWarmWord(String(c?.text ?? ""))) {
        set.add(uid);
      }
    }
    return set;
  }
  function computeKiramekiAwards(input) {
    const {
      comments = [],
      aggregatedRooms = [],
      returningUserKeys = [],
      firstTimeUserKeys = [],
      broadcasterUserId = ""
    } = input || {};
    const validRooms = aggregatedRooms.filter(
      (r) => r != null && typeof r.userKey === "string" && r.userKey.trim() !== "" && typeof r.count === "number" && Number.isFinite(r.count)
    );
    const allUserKeys = validRooms.map((r) => r.userKey);
    const returningSet = new Set(returningUserKeys);
    const firstTimeSet = new Set(firstTimeUserKeys);
    const userTotalCharsMap = buildUserTotalCharsMap(comments, broadcasterUserId);
    const userShortCountMap = buildUserShortCommentCountMap(comments, broadcasterUserId);
    const sottoSet = buildSottoUserSet(comments, broadcasterUserId);
    const sortedByCount = [...validRooms].sort((a, b) => b.count - a.count);
    const hikariThreshold = sortedByCount[HIKARI_TOP_N - 1]?.count ?? 0;
    const hikariSet = new Set(
      hikariThreshold > 0 ? sortedByCount.filter((r) => r.count >= hikariThreshold).map((r) => r.userKey) : []
    );
    const sortedByShort = [...userShortCountMap.entries()].filter(([, v]) => v >= EGAO_MIN_SHORT_COUNT).sort((a, b) => b[1] - a[1]);
    const egaoThreshold = sortedByShort[HIKARI_TOP_N - 1]?.[1] ?? (sortedByShort[0]?.[1] ?? 0);
    const egaoSet = new Set(
      egaoThreshold >= EGAO_MIN_SHORT_COUNT ? sortedByShort.filter(([, v]) => v >= egaoThreshold).map(([k]) => k) : []
    );
    const kotobaSet = new Set(
      [...userTotalCharsMap.entries()].filter(([, v]) => v >= KOTOBA_MIN_CHARS_TOTAL).map(([k]) => k)
    );
    const userKeyToAwardIds = /* @__PURE__ */ new Map();
    const addAward = (userKey, awardId) => {
      const list = userKeyToAwardIds.get(userKey) || [];
      if (!list.includes(awardId)) list.push(awardId);
      userKeyToAwardIds.set(userKey, list);
    };
    const awardRecipients = {
      tomoshibi: allUserKeys,
      kayoi: allUserKeys.filter((k) => returningSet.has(k)),
      hajimari: allUserKeys.filter((k) => firstTimeSet.has(k)),
      kotoba: allUserKeys.filter((k) => kotobaSet.has(k)),
      hikari: allUserKeys.filter((k) => hikariSet.has(k)),
      egao: allUserKeys.filter((k) => egaoSet.has(k)),
      sotto: allUserKeys.filter((k) => sottoSet.has(k))
    };
    for (const [awardId, keys] of Object.entries(awardRecipients)) {
      for (const k of keys) addAward(k, awardId);
    }
    const awards = AWARD_DEFS.map((def) => ({
      ...def,
      userKeys: awardRecipients[def.id] || []
    }));
    return { awards, userKeyToAwardIds };
  }

  // src/lib/kiramekiAwardsSectionHtml.js
  var KIRAMEKI_AWARDS_CSS = `
.kirameki-awards { margin: 2rem 0; grid-column: 1 / -1; }
.kirameki-awards__heading { font-size: 1.4rem; margin-bottom: 0.4rem; color: #e2e8f0; }
.kirameki-awards__lead { color: #94a3b8; font-size: 0.92rem; margin-bottom: 1.5rem; line-height: 1.6; }
.kirameki-awards__group { margin-bottom: 1.5rem; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: 0 0.8rem; }
.kirameki-awards__group-label { font-size: 1.05rem; font-weight: 700; color: #e2e8f0; border-bottom: 2px solid #334155; padding-bottom: 0.3rem; margin-bottom: 0.8rem; grid-column: 1 / -1; }
.kirameki-award { background: #fafafa; border: 1px solid #d8dadd; border-radius: 12px; padding: 1rem; margin-bottom: 0.8rem; }
.kirameki-award--all { background: linear-gradient(135deg, #fff4cc, #fff0e0); border-color: #f0b400; }
.kirameki-award--daily { background: #eaf3ff; border-color: #5aa7e8; }
.kirameki-award__header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; }
.kirameki-award__emoji { font-size: 1.5rem; }
.kirameki-award__name { font-size: 1.08rem; font-weight: 700; flex: 1; color: #14171a; }
.kirameki-award__count { font-size: 0.85rem; font-weight: 600; color: #404750; }
.kirameki-award__desc { font-size: 0.86rem; color: #353b42; margin-bottom: 0.8rem; line-height: 1.55; }
.kirameki-award__recipients { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 0.5rem; }
.kirameki-award__recipient { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; width: 56px; }
.kirameki-award__avatar { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; }
.kirameki-award__avatar--empty { width: 48px; height: 48px; border-radius: 50%; background: #c4c8cc; display: inline-block; }
.kirameki-award__nickname { font-size: 0.67rem; color: #2c3138; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; }
.kirameki-award__more { font-size: 0.8rem; font-weight: 600; color: #404750; margin-top: 0.5rem; }
.kirameki-award__empty { font-size: 0.86rem; color: #5a626b; font-style: italic; }
.kirameki-award__nickname .nl-user-profile-link { color: #1c64c4; text-decoration: none; }
.kirameki-award__nickname .nl-user-profile-link:hover { text-decoration: underline; }
`;
  var CATEGORY_LABELS = {
    fixed: "積み重ねのきらめき",
    daily: "今日だけのきらめき"
  };
  var MAX_VISIBLE_BY_CATEGORY = {
    all: 24,
    fixed: 12,
    daily: 12
  };
  function buildRoomByUserKey(aggregatedRooms) {
    const map = /* @__PURE__ */ new Map();
    for (const room of Array.isArray(aggregatedRooms) ? aggregatedRooms : []) {
      if (!room || typeof room !== "object") continue;
      const r = (
        /** @type {any} */
        room
      );
      for (const key of [r.userKey, r.key, r.userId, r.id, r.anonymousId]) {
        if (key !== null && key !== void 0 && key !== "") {
          map.set(String(key), room);
        }
      }
    }
    return map;
  }
  function resolveNickname(room) {
    if (!room || typeof room !== "object") return "参加者";
    const r = (
      /** @type {any} */
      room
    );
    for (const value of [
      r.nickname,
      r.displayName,
      r.userName,
      r.name,
      r.label
    ]) {
      if (value !== null && value !== void 0 && String(value).trim() !== "") {
        return String(value);
      }
    }
    return "参加者";
  }
  function resolveUserKeys(award) {
    const a = (
      /** @type {any} */
      award
    );
    return Array.isArray(a?.userKeys) ? a.userKeys.map(String) : [];
  }
  function buildRecipientHtml(recipient, { escapeAttr: escapeAttr2 }) {
    const nicknameHtml = buildUserProfileLinkedLabelHtml(recipient.userKey, recipient.nickname);
    const avatarHtml = recipient.avatarSrc ? `<img src="${escapeAttr2(recipient.avatarSrc)}" alt="${escapeAttr2(recipient.nickname)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" class="kirameki-award__avatar">` : '<span class="kirameki-award__avatar kirameki-award__avatar--empty"></span>';
    return `<li class="kirameki-award__recipient">
      ${avatarHtml}
      <span class="kirameki-award__nickname">${nicknameHtml}</span>
    </li>`;
  }
  function buildAwardCardHtml(award, roomByUserKey, deps) {
    const { resolveAvatarSrc, escapeHtml: escapeHtml2, escapeAttr: escapeAttr2 } = deps;
    const a = (
      /** @type {any} */
      award
    );
    const userKeys = resolveUserKeys(award);
    const category = String(a?.category || "");
    const maxVisible = (
      /** @type {Record<string,number>} */
      MAX_VISIBLE_BY_CATEGORY[category] || 12
    );
    const visibleRecipients = userKeys.slice(0, maxVisible).map((userKey) => {
      const room = roomByUserKey.get(userKey) || { userKey };
      const avatarSrc = resolveAvatarSrc(room, userKey);
      return {
        userKey,
        room,
        nickname: resolveNickname(room),
        avatarSrc: avatarSrc !== null && avatarSrc !== void 0 ? String(avatarSrc) : ""
      };
    });
    const remainingCount = Math.max(0, userKeys.length - visibleRecipients.length);
    const recipientsHtml = userKeys.length > 0 ? `<ol class="kirameki-award__recipients">
      ${visibleRecipients.map((recipient) => buildRecipientHtml(recipient, deps)).join("")}
    </ol>` : '<p class="kirameki-award__empty">今回は該当者なし</p>';
    const moreHtml = remainingCount > 0 ? `<p class="kirameki-award__more">他 ${remainingCount} 人</p>` : "";
    return `<div class="kirameki-award kirameki-award--${escapeAttr2(category)}" data-award-id="${escapeAttr2(a?.id || "")}">
    <div class="kirameki-award__header">
      <span class="kirameki-award__emoji">${escapeHtml2(a?.emoji || "")}</span>
      <h3 class="kirameki-award__name">${escapeHtml2(a?.name || "")}</h3>
      <span class="kirameki-award__count">${userKeys.length}人</span>
    </div>
    <p class="kirameki-award__desc">${escapeHtml2(a?.description || "")}</p>
    ${recipientsHtml}
    ${moreHtml}
  </div>`;
  }
  function buildKiramekiAwardsSectionHtml(awards, aggregatedRooms, { resolveAvatarSrc, escapeHtml: escapeHtml2, escapeAttr: escapeAttr2 }) {
    const safeAwards = Array.isArray(awards) ? awards : [];
    const roomByUserKey = buildRoomByUserKey(aggregatedRooms);
    const renderCard = (award) => buildAwardCardHtml(award, roomByUserKey, {
      resolveAvatarSrc,
      escapeHtml: escapeHtml2,
      escapeAttr: escapeAttr2
    });
    const allCards = safeAwards.filter((award) => (
      /** @type {any} */
      award?.category === "all"
    )).map(renderCard).join("");
    const groupHtml = (category) => {
      const cards = safeAwards.filter((award) => (
        /** @type {any} */
        award?.category === category
      )).map(renderCard).join("");
      return cards ? `<div class="kirameki-awards__group">
    <h3 class="kirameki-awards__group-label">${escapeHtml2(CATEGORY_LABELS[category])}</h3>
    ${cards}
  </div>` : "";
    };
    return `<section class="kirameki-awards">
  <h2 class="kirameki-awards__heading">✨ きらめきの賞</h2>
  <p class="kirameki-awards__lead">この配信に参加してくれたみなさんへ。それぞれの光り方で、今日の配信を作ってくれました。</p>
  ${allCards}
  ${groupHtml("fixed")}
  ${groupHtml("daily")}
</section>`;
  }

  // src/lib/resolveKiramekiReturningAndFirstTimeUserKeys.js
  function resolveKiramekiReturningAndFirstTimeUserKeys(input) {
    const currentUserKeys = Array.isArray(input?.currentUserKeys) ? input.currentUserKeys : [];
    const pastUserIds = input?.pastUserIds;
    const pastSet = pastUserIds instanceof Set ? pastUserIds : new Set(Array.isArray(pastUserIds) ? pastUserIds : []);
    const returningUserKeys = [];
    const firstTimeUserKeys = [];
    for (const key of currentUserKeys) {
      const k = String(key || "").trim();
      if (!k) continue;
      if (pastSet.has(k)) {
        returningUserKeys.push(k);
      } else {
        firstTimeUserKeys.push(k);
      }
    }
    return { returningUserKeys, firstTimeUserKeys };
  }

  // src/lib/reportUserRoomTableHtml.js
  function buildReportUserRoomRows(aggregatedRooms, {
    userKeyToTotalChars,
    displayUserLabel: displayUserLabel2,
    buildUserProfileLinkedLabelHtml: buildUserProfileLinkedLabelHtml2,
    resolveReportUserThumbSrc: resolveReportUserThumbSrc2,
    identiconResolver
  }) {
    const list = Array.isArray(aggregatedRooms) ? aggregatedRooms : [];
    const totalCharsMap = userKeyToTotalChars instanceof Map ? userKeyToTotalChars : /* @__PURE__ */ new Map();
    return list.map((room) => {
      const label = displayUserLabel2(room.userKey, room.nickname);
      const labelHtml = buildUserProfileLinkedLabelHtml2(room.userKey, label);
      const totalChars = totalCharsMap.get(room.userKey) || 0;
      const avgChars = room.count > 0 ? Math.round(totalChars / room.count * 10) / 10 : 0;
      const search = escapeAttr(
        `${label} ${room.nickname || ""} ${room.userKey} ${room.lastText || ""} ${room.count} ${totalChars}`.toLowerCase()
      );
      const avatarSrc = resolveReportUserThumbSrc2({
        userId: room.userKey,
        avatarUrl: room.avatarUrl || "",
        identiconResolver
      });
      const avatarCell = avatarSrc ? `<img class="report-room-av" src="${escapeAttr(avatarSrc)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '<span class="report-room-av report-room-av--empty"></span>';
      return `
      <tr class="search-item" data-search="${search}">
        <td>${avatarCell}</td>
        <td>${labelHtml}</td>
        <td>${room.count}</td>
        <td>${totalChars}（平均 ${avgChars}）</td>
        <td>${escapeHtml(room.lastText || "")}</td>
      </tr>
    `;
    });
  }

  // src/lib/htmlReportCommenterFollowSection.js
  function buildHtmlReportCommenterFollowBlock(input) {
    const report = input?.report;
    const identiconResolver = input?.identiconResolver;
    const broadcasterUserId = String(input?.broadcasterUserId || "").trim();
    const exportedAt = input?.exportedAt || (/* @__PURE__ */ new Date()).toISOString();
    const baseOpts = {
      maskShare: false,
      identiconResolver,
      broadcasterUserId,
      extraSectionClass: "card"
    };
    const directoryHtml = buildCommenterFollowDirectorySectionHtml(report, {
      ...baseOpts,
      sectionId: "sec-commenter-follow"
    });
    const analyticsHtml = buildCommenterFollowAnalyticsSectionHtml(report, {
      ...baseOpts,
      sectionId: "sec-commenter-follow-analytics",
      csvButtonId: "html-commenter-follow-csv"
    });
    const hasDirectory = Boolean(directoryHtml);
    const hasAnalytics = Boolean(analyticsHtml);
    const embedScriptHtml = hasDirectory || hasAnalytics ? `<script type="application/json" id="nl-marketing-export-v1">${buildMarketingEmbedScriptInnerText(report, { exportedAt })}<\/script>` : "";
    return {
      directoryHtml: hasDirectory ? addSearchItemClass(directoryHtml) : "",
      analyticsHtml: hasAnalytics ? addSearchItemClass(analyticsHtml) : "",
      embedScriptHtml,
      css: hasDirectory || hasAnalytics ? commenterFollowSectionEmbeddedCss() : "",
      hasDirectory,
      hasAnalytics,
      hasAny: hasDirectory || hasAnalytics
    };
  }
  function addSearchItemClass(html) {
    return html.replace(
      'class="card mkt-section',
      `class="card mkt-section search-item" data-search="${escapeAttr("フォロー コメンター 散布図 セグメント")}"`
    );
  }

  // src/lib/reportSelfPostedRowsHtml.js
  function buildReportSelfPostedRows(selfPostedComments, { formatDateTime: formatDateTime2 }) {
    const list = Array.isArray(selfPostedComments) ? selfPostedComments : [];
    return list.map((c, idx) => {
      const text = String(c?.text || "").trim();
      const search = escapeAttr(`${idx + 1} ${text} ${c?.commentNo || ""}`.toLowerCase());
      return `
      <tr class="search-item" data-search="${search}">
        <td>${idx + 1}</td>
        <td>${escapeHtml(String(c?.commentNo || "-"))}</td>
        <td>${escapeHtml(text || "-")}</td>
        <td>${escapeHtml(formatDateTime2(c?.capturedAt || 0))}</td>
      </tr>
    `;
    });
  }

  // src/lib/reportFriendlyMetaRowsHtml.js
  function friendlyHtmlReportMetaLabel(key) {
    const k = String(key || "").toLowerCase().trim();
    const labels = {
      description: "ページ説明（meta）",
      keywords: "キーワード（meta）",
      "og:title": "シェア用タイトル（Open Graph）",
      "og:description": "シェア用説明（Open Graph）",
      "og:image": "シェア用画像URL（Open Graph）",
      "og:url": "正規URL（Open Graph）",
      "og:site_name": "サイト名（Open Graph）",
      "og:type": "種類（Open Graph）",
      "twitter:title": "シェア用タイトル（X）",
      "twitter:description": "シェア用説明（X）"
    };
    if (k.startsWith("twitter:image")) return "シェア用画像（X）";
    return labels[k] || key;
  }
  function buildReportFriendlyMetaRows(friendlyMetas) {
    const list = Array.isArray(friendlyMetas) ? friendlyMetas : [];
    return list.map((v) => {
      const label = friendlyHtmlReportMetaLabel(v?.key);
      const search = escapeAttr(`${v?.key} ${v?.value} ${label}`.toLowerCase());
      return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(label)}</td>
          <td class="mono">${escapeHtml(v?.value || "-")}</td>
        </tr>`;
    });
  }

  // src/lib/reportCommentsCsv.js
  var HEADER_COLUMNS = Object.freeze([
    "#",
    "commentNo",
    "userId",
    "nickname",
    "text",
    "vpos",
    "is184",
    "selfPosted",
    "capturedAtIso"
  ]);
  function csvEscapeField(value) {
    if (value == null) return "";
    let s = String(value);
    const startsWithFormula = /^[=+\-@\t]/.test(s);
    if (startsWithFormula) s = `'${s}`;
    const needsQuotes = startsWithFormula || /[",\r\n]/.test(s);
    if (!needsQuotes) return s;
    const inner = s.replace(/"/g, '""');
    return `"${inner}"`;
  }
  function buildReportCommentsCsv(comments) {
    const list = Array.isArray(comments) ? comments : [];
    const rows = [HEADER_COLUMNS.join(",")];
    for (let i = 0; i < list.length; i++) {
      const c = list[i] || {};
      const uid = c.userId == null ? "" : String(c.userId);
      const is184 = isNiconicoAnonymousUserId(uid);
      const selfPosted = Boolean(c.selfPosted);
      const at = typeof c.capturedAt === "number" && Number.isFinite(c.capturedAt) && c.capturedAt > 0 ? new Date(c.capturedAt).toISOString() : "";
      const vposStr = typeof c.vpos === "number" && Number.isFinite(c.vpos) ? String(c.vpos) : "";
      const cells = [
        String(i + 1),
        csvEscapeField(c.commentNo),
        csvEscapeField(uid),
        csvEscapeField(c.nickname),
        csvEscapeField(c.text),
        vposStr,
        is184 ? "true" : "false",
        selfPosted ? "true" : "false",
        csvEscapeField(at)
      ];
      rows.push(cells.join(","));
    }
    return rows.join("\r\n") + "\r\n";
  }

  // src/lib/reportCommentsTableSection.js
  var HTML_REPORT_COMMENTS_TABLE_INITIAL_ROWS = 80;
  var HTML_REPORT_HEAVY_COMMENT_THRESHOLD = 2500;
  var HTML_REPORT_OVERFLOW_JSON_MAX_ROWS = 1500;
  var HTML_REPORT_AGGREGATE_ROOM_CAP = 500;
  function formatCapturedAt(ms, formatDateTime2) {
    return escapeHtml(formatDateTime2(typeof ms === "number" && Number.isFinite(ms) ? ms : 0));
  }
  function buildReportCommentTableRowHtml(c, idx, ctx) {
    const commentNo = String(c.commentNo || "").trim();
    const text = String(c.text || "").trim();
    const userId = c.userId ? String(c.userId) : "";
    const userKey = userId || UNKNOWN_USER_KEY;
    const userLabel = displayUserLabel(userKey, String(c.nickname || ""));
    const userLabelHtml = buildUserProfileLinkedLabelHtml(userId, userLabel);
    const search = escapeAttr(
      `${commentNo} ${text} ${userId} ${userLabel} ${String(c.liveId || "")}`.toLowerCase()
    );
    let avatarSrc = ctx.userKeyToResolvedThumb.get(userKey);
    if (avatarSrc === void 0) {
      avatarSrc = resolveReportUserThumbSrc({
        userId: userKey,
        avatarUrl: String(c.avatarUrl || ""),
        identiconResolver: ctx.identiconResolver
      });
    }
    const avatarInlineHtml = avatarSrc ? `<img class="report-comment-av" src="${escapeAttr(avatarSrc)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '<span class="report-comment-av report-comment-av--empty"></span>';
    const searchClass = ctx.includeInSearch === false ? "nl-comment-row nl-comment-row--overflow" : "search-item nl-comment-row";
    return `
      <tr class="${searchClass}" data-search="${search}">
        <td>${idx + 1}</td>
        <td>${escapeHtml(commentNo || "-")}</td>
        <td><span class="report-user-cell">${avatarInlineHtml}<span class="report-user-cell__label">${userLabelHtml}</span></span></td>
        <td>${escapeHtml(text || "-")}</td>
        <td>${formatCapturedAt(Number(c.capturedAt) || 0, ctx.formatDateTime)}</td>
      </tr>
    `;
  }
  function buildOverflowCommentRowsPayload(comments, fromIndex, formatDateTime2, toIndex) {
    const end = Math.min(
      comments.length,
      typeof toIndex === "number" && Number.isFinite(toIndex) ? toIndex : comments.length
    );
    const rows = [];
    for (let i = fromIndex; i < end; i += 1) {
      const c = comments[i] || {};
      const userId = c.userId ? String(c.userId) : "";
      const userKey = userId || UNKNOWN_USER_KEY;
      const userLabel = displayUserLabel(userKey, String(c.nickname || ""));
      rows.push([
        i + 1,
        String(c.commentNo || "").trim(),
        userId,
        userLabel,
        String(c.text || "").trim(),
        formatDateTime2(typeof c.capturedAt === "number" && Number.isFinite(c.capturedAt) ? c.capturedAt : 0)
      ]);
    }
    return JSON.stringify({ schemaVersion: 1, rows }).replace(/</g, "\\u003c");
  }
  function reportCommentsExpandScriptHtml() {
    return `<script>
(function(){
  var btn=document.getElementById('nl-report-comments-more-btn');
  var tbody=document.getElementById('nl-report-comments-tbody');
  var dataEl=document.getElementById('nl-report-comments-overflow-v1');
  if(!btn||!tbody||!dataEl||btn.disabled)return;
  function cellText(value){
    var td=document.createElement('td');
    td.textContent=value==null?'':String(value);
    return td;
  }
  btn.addEventListener('click',function(){
    if(btn.disabled)return;
    var payload;
    try{payload=JSON.parse(dataEl.textContent||'{}');}
    catch(e){btn.textContent='残りコメントを読めません';return;}
    var rows=Array.isArray(payload.rows)?payload.rows:[];
    if(!rows.length){btn.remove();return;}
    var frag=document.createDocumentFragment();
    rows.forEach(function(row){
      if(!Array.isArray(row)||row.length<6)return;
      var tr=document.createElement('tr');
      tr.className='nl-comment-row nl-comment-row--overflow';
      tr.setAttribute('data-search-scope','comments-overflow');
      tr.appendChild(cellText(row[0]));
      tr.appendChild(cellText(row[1]||'-'));
      var userTd=document.createElement('td');
      var uid=String(row[2]||'');
      var label=String(row[3]||'');
      var userWrap=document.createElement('span');
      userWrap.className='report-user-cell';
      var labelWrap=document.createElement('span');
      labelWrap.className='report-user-cell__label';
      if(/^\\d+$/.test(uid)){
        var a=document.createElement('a');
        a.className='nl-user-profile-link';
        a.href='https://nicovideo.jp/user/'+encodeURIComponent(uid);
        a.target='_blank';
        a.rel='noopener noreferrer';
        a.textContent=label;
        labelWrap.appendChild(a);
      }else{
        labelWrap.textContent=label;
      }
      userWrap.appendChild(labelWrap);
      userTd.appendChild(userWrap);
      tr.appendChild(userTd);
      tr.appendChild(cellText(row[4]||'-'));
      tr.appendChild(cellText(row[5]||'-'));
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
    btn.disabled=true;
    btn.textContent='残り '+rows.length+' 件を表示しました';
    var wrap=btn.closest('.nl-report-comments-more-wrap');
    if(wrap){wrap.style.opacity='.85';}
    dataEl.textContent='';
  });
})();
<\/script>`;
  }
  function buildReportCommentsTableSectionHtml(input) {
    const comments = Array.isArray(input?.comments) ? input.comments : [];
    const heavyExport = comments.length > HTML_REPORT_HEAVY_COMMENT_THRESHOLD;
    const initialRows = Math.max(
      1,
      typeof input?.initialRows === "number" ? input.initialRows : HTML_REPORT_COMMENTS_TABLE_INITIAL_ROWS
    );
    const userKeyToResolvedThumb = input?.userKeyToResolvedThumb instanceof Map ? input.userKeyToResolvedThumb : /* @__PURE__ */ new Map();
    const formatDateTime2 = input.formatDateTime;
    const reportCommentsCsv = heavyExport ? "" : String(input.reportCommentsCsv || "");
    const rowCtx = {
      userKeyToResolvedThumb,
      identiconResolver: input.identiconResolver,
      formatDateTime: formatDateTime2
    };
    const visibleComments = comments.slice(0, initialRows);
    const hiddenCount = Math.max(0, comments.length - visibleComments.length);
    const commentRows = visibleComments.map(
      (c, idx) => buildReportCommentTableRowHtml(c, idx, { ...rowCtx, includeInSearch: true })
    );
    const overflowFromIndex = initialRows;
    const overflowCap = Math.min(
      hiddenCount,
      HTML_REPORT_OVERFLOW_JSON_MAX_ROWS
    );
    const overflowOmitted = hiddenCount - overflowCap;
    const canEmbedOverflowJson = hiddenCount > 0 && !heavyExport && overflowCap > 0;
    const overflowScript = canEmbedOverflowJson ? `<script type="application/json" id="nl-report-comments-overflow-v1">${buildOverflowCommentRowsPayload(
      comments,
      overflowFromIndex,
      formatDateTime2,
      overflowFromIndex + overflowCap
    )}<\/script>${reportCommentsExpandScriptHtml()}` : "";
    const moreHtml = hiddenCount > 0 && canEmbedOverflowJson ? `<p class="nl-report-comments-more-wrap"><button type="button" id="nl-report-comments-more-btn" class="nl-report-comments-more-btn">残り ${overflowCap} 件を表示（スクロール軽量化のため折りたたみ中）</button></p>` : "";
    const heavyNote = heavyExport ? `<p class="guide-lead nl-report-comments-heavy-note">コメントが ${comments.length} 件あるため、HTML への全件 CSV 埋め込みを省略しました（表示は先頭 ${visibleComments.length} 件のみ）。全件が必要なときは拡張パネルから JSON/マーケ分析の CSV をご利用ください。</p>` : "";
    const overflowOmittedNote = overflowOmitted > 0 ? `<p class="guide-lead">残り ${overflowOmitted} 件は HTML サイズ制限のため展開ボタン対象外です（先頭 ${visibleComments.length + overflowCap} 件まで表示可能）。</p>` : "";
    const displayNote = hiddenCount > 0 ? `<p class="guide-lead">全 ${comments.length} 件中、先頭 ${visibleComments.length} 件を表示しています。${canEmbedOverflowJson ? "残りはボタンで展開するか、CSV で全件取得できます。" : "件数が多いため HTML 内の全件 CSV は省略しています。"}</p>` : `<p class="guide-lead">記録した ${comments.length} 件を表示しています。</p>`;
    return `
      <section class="card nl-report-comments-section" id="sec-all-comments" style="margin-top:12px;">
        <h2>保存コメント一覧</h2>
        ${heavyNote}
        ${displayNote}
        ${overflowOmittedNote}
        ${reportCommentsCsv ? `<p class="guide-lead">
          <button type="button" id="nlReportCsvDownloadBtn" class="nl-report-csv-btn">CSV をダウンロード</button>
          <span class="nl-report-csv-hint">Excel / Google Sheets で開けるのだ（UTF-8 BOM 付き）。</span>
        </p>
        <pre id="nlReportCsvData" hidden>${escapeHtml(reportCommentsCsv)}</pre>` : ""}
        <div class="nl-report-comments-table-wrap">
          <table>
            <thead><tr><th>#</th><th>commentNo</th><th>user</th><th>text</th><th>capturedAt</th></tr></thead>
            <tbody id="nl-report-comments-tbody">${commentRows.join("") || '<tr><td colspan="5">コメントなし</td></tr>'}</tbody>
          </table>
        </div>
        ${moreHtml}
        ${overflowScript}
      </section>
    `;
  }

  // src/lib/commenterFollowCache.js
  var COMMENTER_FOLLOW_CACHE_MAX = 8e3;
  var COMMENTER_FOLLOW_TTL_MS = 6 * 60 * 60 * 1e3;
  var COMMENTER_FOLLOW_FETCH_BATCH = 8;
  function posIntOrNull(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.floor(n);
  }
  function isFreshFollowEntry(fetchedAt, nowMs, ttlMs) {
    const at = Number(fetchedAt);
    if (!Number.isFinite(at) || at <= 0) return false;
    const now = Number.isFinite(nowMs) && nowMs > 0 ? nowMs : Date.now();
    const ttl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : COMMENTER_FOLLOW_TTL_MS;
    return at >= now - ttl;
  }
  function normalizeCommenterFollowEntry(raw, fetchedAtFallback) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = (
      /** @type {Record<string, unknown>} */
      raw
    );
    const followerCount = posIntOrNull(o.followerCount);
    const followeeCount = posIntOrNull(o.followeeCount);
    const level = posIntOrNull(o.level);
    const isPremium = typeof o.isPremium === "boolean" ? o.isPremium : null;
    if (followerCount === null && followeeCount === null && level === null && isPremium === null) {
      return null;
    }
    const fa = Number(o.fetchedAt);
    const fetchedAt = Number.isFinite(fa) && fa > 0 ? fa : Number.isFinite(Number(fetchedAtFallback)) && Number(fetchedAtFallback) > 0 ? Number(fetchedAtFallback) : Date.now();
    const entry = { fetchedAt };
    if (followerCount !== null) entry.followerCount = followerCount;
    if (followeeCount !== null) entry.followeeCount = followeeCount;
    if (level !== null) entry.level = level;
    if (isPremium !== null) entry.isPremium = isPremium;
    return entry;
  }
  function normalizeCommenterFollowMap(raw, opts = {}) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const nowMs = Number.isFinite(Number(opts.nowMs)) && Number(opts.nowMs) > 0 ? Number(opts.nowMs) : Date.now();
    const ttlMs = Number.isFinite(Number(opts.ttlMs)) && Number(opts.ttlMs) > 0 ? Number(opts.ttlMs) : COMMENTER_FOLLOW_TTL_MS;
    const src = (
      /** @type {Record<string, unknown>} */
      raw
    );
    const out = {};
    for (const [k, v] of Object.entries(src)) {
      const uid = String(k || "").trim();
      if (!/^\d{1,18}$/.test(uid)) continue;
      const entry = normalizeCommenterFollowEntry(v);
      if (!entry) continue;
      if (!isFreshFollowEntry(entry.fetchedAt, nowMs, ttlMs)) continue;
      out[uid] = entry;
    }
    return out;
  }
  function commenterFollowEntryFromProfile(profile, now) {
    return normalizeCommenterFollowEntry(profile, now);
  }
  function upsertCommenterFollowEntry(map, uid, entry, opts = {}) {
    if (!map || typeof map !== "object") return false;
    const id = String(uid || "").trim();
    if (!/^\d{1,18}$/.test(id) || !entry) return false;
    const prev = map[id];
    if (prev && Number(prev.fetchedAt) >= Number(entry.fetchedAt)) return false;
    map[id] = entry;
    const max = Number.isFinite(Number(opts.maxEntries)) && Number(opts.maxEntries) > 0 ? Math.floor(Number(opts.maxEntries)) : COMMENTER_FOLLOW_CACHE_MAX;
    const ids = Object.keys(map);
    if (ids.length > max) {
      ids.sort((a, b) => (Number(map[b]?.fetchedAt) || 0) - (Number(map[a]?.fetchedAt) || 0));
      for (const drop of ids.slice(max)) delete map[drop];
    }
    return true;
  }
  function pickFollowUidsToFetch(candidateUids, cache, opts = {}) {
    const nowMs = Number.isFinite(Number(opts.nowMs)) && Number(opts.nowMs) > 0 ? Number(opts.nowMs) : Date.now();
    const ttlMs = Number.isFinite(Number(opts.ttlMs)) && Number(opts.ttlMs) > 0 ? Number(opts.ttlMs) : COMMENTER_FOLLOW_TTL_MS;
    const limit = Number.isFinite(Number(opts.limit)) && Number(opts.limit) > 0 ? Math.floor(Number(opts.limit)) : COMMENTER_FOLLOW_FETCH_BATCH;
    const forceRefetch = opts.forceRefetch === true;
    const safeCache = cache && typeof cache === "object" ? cache : {};
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const raw of candidateUids || []) {
      const uid = String(raw || "").trim();
      if (!/^\d{1,18}$/.test(uid) || seen.has(uid)) continue;
      seen.add(uid);
      if (!forceRefetch) {
        const hit = safeCache[uid];
        if (hit && isFreshFollowEntry(Number(hit.fetchedAt), nowMs, ttlMs)) continue;
      }
      out.push(uid);
      if (out.length >= limit) break;
    }
    return out;
  }
  function buildCommenterFollowLiveSnapshot(liveId, rows, capturedAt) {
    const lid = String(liveId || "").trim().toLowerCase();
    if (!/^lv\d{1,15}$/.test(lid) || !Array.isArray(rows)) return null;
    const at = Number.isFinite(Number(capturedAt)) && Number(capturedAt) > 0 ? Number(capturedAt) : Date.now();
    const withFollowData = rows.filter(
      (r) => typeof r.followerCount === "number" || typeof r.followeeCount === "number" || typeof r.level === "number" || typeof r.isPremium === "boolean"
    ).length;
    return {
      liveId: lid,
      capturedAt: at,
      totalNumericCommenters: rows.length,
      withFollowData,
      rows
    };
  }
  function normalizeCommenterFollowLiveSnapshot(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = (
      /** @type {Record<string, unknown>} */
      raw
    );
    const lid = String(o.liveId || "").trim().toLowerCase();
    if (!/^lv\d{1,15}$/.test(lid)) return null;
    const capturedAt = Number(o.capturedAt);
    if (!Number.isFinite(capturedAt) || capturedAt <= 0) return null;
    const srcRows = Array.isArray(o.rows) ? o.rows : [];
    const rows = [];
    for (const item of srcRows) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const r = (
        /** @type {Record<string, unknown>} */
        item
      );
      const uid = String(r.userId || "").trim();
      if (!/^\d{1,18}$/.test(uid)) continue;
      const commentCount = posIntOrNull(r.commentCount);
      if (commentCount === null || commentCount < 1) continue;
      const row = {
        userId: uid,
        commentCount,
        nickname: String(r.nickname || "").trim()
      };
      const followerCount = posIntOrNull(r.followerCount);
      const followeeCount = posIntOrNull(r.followeeCount);
      const level = posIntOrNull(r.level);
      if (followerCount !== null) row.followerCount = followerCount;
      if (followeeCount !== null) row.followeeCount = followeeCount;
      if (level !== null && level > 0) row.level = level;
      if (typeof r.isPremium === "boolean") row.isPremium = r.isPremium;
      const fetchedAt = Number(r.followFetchedAt);
      if (Number.isFinite(fetchedAt) && fetchedAt > 0) row.followFetchedAt = fetchedAt;
      if (typeof r.followsBroadcaster === "boolean") row.followsBroadcaster = r.followsBroadcaster;
      const flStatus = String(r.followingListStatus || "").trim();
      if (flStatus === "ok" || flStatus === "forbidden" || flStatus === "error" || flStatus === "login_required") {
        row.followingListStatus = flStatus;
      }
      const flCount = posIntOrNull(r.followingListCount);
      if (flCount !== null) row.followingListCount = flCount;
      rows.push(row);
    }
    rows.sort((a, b) => b.commentCount - a.commentCount);
    const withFollowData = rows.filter(
      (r) => typeof r.followerCount === "number" || typeof r.followeeCount === "number" || typeof r.level === "number" || typeof r.isPremium === "boolean"
    ).length;
    return {
      liveId: lid,
      capturedAt,
      totalNumericCommenters: rows.length,
      withFollowData,
      rows
    };
  }
  function applyFollowFieldsToUser(user, follow) {
    if (!user || !follow) return;
    if (typeof follow.followerCount === "number") user.followerCount = follow.followerCount;
    if (typeof follow.followeeCount === "number") user.followeeCount = follow.followeeCount;
    if (typeof follow.isPremium === "boolean") user.isPremium = follow.isPremium;
    const lv = (
      /** @type {{ level?: number, userLevel?: number }} */
      follow.level ?? /** @type {{ userLevel?: number }} */
      follow.userLevel
    );
    if (typeof lv === "number" && lv > 0) user.userLevel = lv;
  }

  // src/lib/commenterFollowingListCache.js
  var COMMENTER_FOLLOWING_LIST_TTL_MS = 12 * 60 * 60 * 1e3;
  var COMMENTER_FOLLOWING_LIST_MAX_UIDS_STORED = 200;
  var COMMENTER_FOLLOWING_LIST_MAX_PER_LIVE = 10;
  function posIntOrNull2(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.floor(n);
  }
  function statusOrError(v) {
    const s = String(v || "").trim();
    if (s === "ok" || s === "forbidden" || s === "error" || s === "login_required") return s;
    return "error";
  }
  function isFreshFollowingListEntry(fetchedAt, nowMs, ttlMs) {
    const at = Number(fetchedAt);
    if (!Number.isFinite(at) || at <= 0) return false;
    const now = Number.isFinite(nowMs) && nowMs > 0 ? nowMs : Date.now();
    const ttl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : COMMENTER_FOLLOWING_LIST_TTL_MS;
    return at >= now - ttl;
  }
  function shouldSkipFollowingListFetch(entry, nowMs, ttlMs) {
    if (!entry || !Number.isFinite(Number(entry.fetchedAt))) return false;
    return isFreshFollowingListEntry(Number(entry.fetchedAt), nowMs, ttlMs);
  }
  function normalizeCommenterFollowingListEntry(raw, fetchedAtFallback) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = (
      /** @type {Record<string, unknown>} */
      raw
    );
    const fa = Number(o.fetchedAt);
    const fetchedAt = Number.isFinite(fa) && fa > 0 ? fa : Number.isFinite(Number(fetchedAtFallback)) && Number(fetchedAtFallback) > 0 ? Number(fetchedAtFallback) : Date.now();
    const status = statusOrError(o.status);
    const srcIds = Array.isArray(o.userIds) ? o.userIds : [];
    const userIds = [];
    const seen = /* @__PURE__ */ new Set();
    for (const item of srcIds) {
      const uid = String(item || "").trim();
      if (!/^\d{1,18}$/.test(uid) || seen.has(uid)) continue;
      seen.add(uid);
      userIds.push(uid);
      if (userIds.length >= COMMENTER_FOLLOWING_LIST_MAX_UIDS_STORED) break;
    }
    const totalCount = posIntOrNull2(o.totalCount);
    const pageCount = posIntOrNull2(o.pageCount) ?? 0;
    const truncated = o.truncated === true || userIds.length >= COMMENTER_FOLLOWING_LIST_MAX_UIDS_STORED;
    if (status !== "ok" && status !== "forbidden" && status !== "login_required" && status !== "error") {
      return null;
    }
    if (status === "ok" && !userIds.length && totalCount == null) {
    }
    const entry = {
      userIds,
      fetchedAt,
      status,
      truncated,
      pageCount
    };
    if (totalCount != null) entry.totalCount = totalCount;
    return entry;
  }
  function normalizeFollowingListMap(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const src = (
      /** @type {Record<string, unknown>} */
      raw
    );
    const out = {};
    for (const [key, value] of Object.entries(src)) {
      const uid = String(key || "").trim();
      if (!/^\d{1,18}$/.test(uid)) continue;
      const entry = normalizeCommenterFollowingListEntry(value);
      if (entry) out[uid] = entry;
    }
    return out;
  }
  function upsertFollowingListEntry(map, uid, entry) {
    const id = String(uid || "").trim();
    if (!/^\d{1,18}$/.test(id) || !entry) return false;
    if (!map || typeof map !== "object") return false;
    map[id] = entry;
    return true;
  }
  function pickFollowingListUidsToFetch(stats, cache, opts = {}) {
    const nowMs = Number.isFinite(Number(opts.nowMs)) && Number(opts.nowMs) > 0 ? Number(opts.nowMs) : Date.now();
    const ttlMs = Number.isFinite(Number(opts.ttlMs)) && Number(opts.ttlMs) > 0 ? Number(opts.ttlMs) : COMMENTER_FOLLOWING_LIST_TTL_MS;
    const limit = Number.isFinite(Number(opts.limit)) && Number(opts.limit) > 0 ? Math.floor(Number(opts.limit)) : 1;
    const maxRank = Number.isFinite(Number(opts.maxRank)) && Number(opts.maxRank) > 0 ? Math.floor(Number(opts.maxRank)) : COMMENTER_FOLLOWING_LIST_MAX_PER_LIVE;
    const skipStatuses = opts.skipStatuses || ["forbidden"];
    const safeCache = cache && typeof cache === "object" ? cache : {};
    const out = [];
    const ranked = Array.isArray(stats) ? stats.slice(0, maxRank) : [];
    for (const row of ranked) {
      const uid = String(row?.userId || "").trim();
      if (!/^\d{1,18}$/.test(uid)) continue;
      const hit = safeCache[uid];
      const forceRetry = Array.isArray(opts.forceRetryStatuses) ? opts.forceRetryStatuses : [];
      if (hit && forceRetry.includes(hit.status)) {
        out.push(uid);
        if (out.length >= limit) break;
        continue;
      }
      if (hit && shouldSkipFollowingListFetch(hit, nowMs, ttlMs)) continue;
      if (hit && skipStatuses.includes(hit.status)) continue;
      out.push(uid);
      if (out.length >= limit) break;
    }
    return out;
  }
  function mergeFollowingListIntoRows(rows, listMap, broadcasterUserId) {
    if (!Array.isArray(rows) || !rows.length) return rows || [];
    const map = listMap && typeof listMap === "object" ? listMap : {};
    const bUid = String(broadcasterUserId || "").trim();
    return rows.map((row) => {
      const hit = map[row.userId];
      if (!hit) return row;
      const next = { ...row };
      next.followingListStatus = hit.status;
      next.followingListCount = hit.userIds.length;
      if (bUid && hit.status === "ok") {
        next.followsBroadcaster = hit.userIds.includes(bUid);
      }
      return next;
    });
  }
  function buildFollowingListEntryFromFetchResponse(resp, nowMs) {
    const now = Number.isFinite(Number(nowMs)) && Number(nowMs) > 0 ? Number(nowMs) : Date.now();
    const r = resp && typeof resp === "object" ? (
      /** @type {Record<string, unknown>} */
      resp
    ) : null;
    if (!r || r.skipped) return null;
    if (r.ok === true && r.followingStatus === "ok") {
      return normalizeCommenterFollowingListEntry({
        userIds: Array.isArray(r.userIds) ? r.userIds : [],
        totalCount: r.totalCount,
        status: "ok",
        truncated: r.truncated === true,
        pageCount: Number(r.pageCount) || 1,
        fetchedAt: now
      });
    }
    const statusRaw = r.followingStatus;
    const status = statusRaw === "login_required" || statusRaw === "forbidden" || statusRaw === "error" ? statusRaw : Number(r.status) === 401 ? "login_required" : Number(r.status) === 403 || Number(r.status) === 404 ? "forbidden" : "error";
    return normalizeCommenterFollowingListEntry({
      userIds: [],
      status,
      truncated: false,
      pageCount: 0,
      fetchedAt: now
    });
  }
  function summarizeFollowingListCoverage(listMap, candidateUids) {
    const map = listMap && typeof listMap === "object" ? listMap : {};
    const out = {
      attempted: 0,
      ok: 0,
      forbidden: 0,
      loginRequired: 0,
      error: 0,
      notAttempted: 0
    };
    for (const raw of candidateUids || []) {
      const uid = String(raw || "").trim();
      if (!/^\d{1,18}$/.test(uid)) continue;
      const hit = map[uid];
      if (!hit) {
        out.notAttempted += 1;
        continue;
      }
      out.attempted += 1;
      if (hit.status === "ok") out.ok += 1;
      else if (hit.status === "forbidden") out.forbidden += 1;
      else if (hit.status === "login_required") out.loginRequired += 1;
      else out.error += 1;
    }
    return out;
  }

  // src/lib/nicoUserProfileApi.js
  var NICO_USER_PROFILE_FETCH_MESSAGE_TYPE = "NLS_NICO_USER_PROFILE_FETCH";
  var UID_RE = /^\d{1,18}$/;
  function isResolvableNicoUid(uid) {
    const s = String(uid == null ? "" : uid).trim();
    return UID_RE.test(s) && Number(s) > 0;
  }
  function isLikelyNicoUserProfileShape(json) {
    if (!json || typeof json !== "object") return false;
    const j = (
      /** @type {Record<string, any>} */
      json
    );
    if (j.meta && typeof j.meta === "object" && j.meta.status != null) {
      if (Number(j.meta.status) !== 200) return false;
    }
    return !!(j.data && typeof j.data === "object" && j.data.user && typeof j.data.user === "object");
  }
  function sanitizeHttpUrl2(value) {
    const s = String(value == null ? "" : value).trim();
    return /^https?:\/\//i.test(s) ? s : "";
  }
  function asPosIntOrNull(v) {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
  }
  function normalizeNicoUserProfileResponse(json) {
    if (!isLikelyNicoUserProfileShape(json)) return null;
    const data = (
      /** @type {Record<string, any>} */
      /** @type {Record<string, any>} */
      json.data
    );
    const user = (
      /** @type {Record<string, any>} */
      data.user
    );
    const userId = String(user.id == null ? "" : user.id).trim();
    if (!isResolvableNicoUid(userId)) return null;
    const nickname = String(user.nickname == null ? "" : user.nickname).trim().slice(0, 200);
    let avatarUrl = "";
    const icons = user.icons;
    if (icons && typeof icons === "object") {
      avatarUrl = sanitizeHttpUrl2(icons.large) || sanitizeHttpUrl2(icons.small);
    }
    if (!nickname && !avatarUrl) return null;
    const out = { userId, nickname, avatarUrl };
    const level = asPosIntOrNull(user.userLevel && user.userLevel.currentLevel) ?? asPosIntOrNull(user.niconicoLevel) ?? asPosIntOrNull(user.level);
    if (level != null) out.level = level;
    if (user.isPremium === true || user.premium === true) out.isPremium = true;
    else if (user.isPremium === false || user.premium === false) out.isPremium = false;
    const followeeCount = asPosIntOrNull(data.followeeCount) ?? asPosIntOrNull(user.followeeCount);
    if (followeeCount != null) out.followeeCount = followeeCount;
    const followerCount = asPosIntOrNull(data.followerCount) ?? asPosIntOrNull(user.followerCount);
    if (followerCount != null) out.followerCount = followerCount;
    const rawDesc = typeof user.strippedDescription === "string" ? user.strippedDescription : typeof user.description === "string" ? user.description.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "") : "";
    const description = rawDesc.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 2e3);
    if (description) out.description = description;
    if (Array.isArray(user.sns)) {
      const sns = [];
      for (const raw of user.sns.slice(0, 8)) {
        const o = raw && typeof raw === "object" ? raw : {};
        const url = sanitizeHttpUrl2(o.url);
        if (!url) continue;
        sns.push({
          label: String(o.label == null ? "" : o.label).trim().slice(0, 40) || String(o.type || "").slice(0, 40),
          screenName: String(o.screenName == null ? "" : o.screenName).trim().slice(0, 80),
          url
        });
      }
      if (sns.length) out.sns = sns;
    }
    const ul = user.userLevel && typeof user.userLevel === "object" ? user.userLevel : null;
    if (ul) {
      const current = Number(ul.currentLevelExperience);
      const threshold = Number(ul.nextLevelThresholdExperience);
      if (Number.isFinite(current) && current >= 0 && Number.isFinite(threshold) && threshold > 0) {
        out.levelExp = { current: Math.trunc(current), threshold: Math.trunc(threshold) };
      }
    }
    return out;
  }

  // src/lib/nicoUserFollowingApi.js
  var NICO_USER_FOLLOWING_FETCH_MESSAGE_TYPE = "NLS_NICO_USER_FOLLOWING_FETCH";

  // src/extension/popup/report/htmlReportDocument.js
  var YUKKURI_REPORT_IMAGES = {
    link: "images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png",
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
  var _yukkuriImageDataUrlMapPromise = null;
  async function buildYukkuriImageDataUrlMap() {
    if (_yukkuriImageDataUrlMapPromise) return _yukkuriImageDataUrlMapPromise;
    _yukkuriImageDataUrlMapPromise = (async () => {
      const out = {};
      const paths = listYukkuriCharacterImagePaths();
      await Promise.all(
        paths.map(async (p) => {
          try {
            const dataUrl = await fetchExtensionPngAsDataUrl(p);
            if (dataUrl) out[p] = dataUrl;
          } catch {
          }
        })
      );
      return out;
    })();
    return _yukkuriImageDataUrlMapPromise;
  }
  function yukkuriReportAvatarHtml(dataUrl, fallbackClass, fallbackChar) {
    if (dataUrl) {
      return `<img class="yukkuri-avatar-img" src="${escapeAttr(dataUrl)}" alt="" width="72" height="72" decoding="async" />`;
    }
    return `<div class="yukkuri-avatar ${fallbackClass}" aria-hidden="true">${escapeHtml(fallbackChar)}</div>`;
  }
  function isFriendlyHtmlReportMetaKey(key) {
    const k = String(key || "").toLowerCase().trim();
    if (k === "description" || k === "keywords" || k === "og:title" || k === "og:description" || k === "og:image" || k === "og:url" || k === "og:site_name" || k === "og:type" || k === "twitter:title" || k === "twitter:description" || k.startsWith("twitter:image")) {
      return true;
    }
    return false;
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
  async function backfillCommenterFollowProfilesForReport(report, followMap, deps) {
    if (deps.inlinePassive) return false;
    const stats = (Array.isArray(report.allNumericCommenters) ? report.allNumericCommenters : []).map((u) => String(u?.userId || "").trim()).filter((uid) => /^\d{1,18}$/.test(uid));
    if (!stats.length) return false;
    const toFetch = pickFollowUidsToFetch(stats, followMap, { limit: COMMENTER_FOLLOW_FETCH_BATCH });
    if (!toFetch.length) return false;
    let touched = false;
    for (const uid of toFetch) {
      const resp = await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ type: NICO_USER_PROFILE_FETCH_MESSAGE_TYPE, uid }, (r) => {
            const le = chrome.runtime.lastError;
            if (le) return resolve(null);
            resolve(r);
          });
        } catch {
          resolve(null);
        }
      });
      if (!resp || resp.ok !== true || resp.json == null) continue;
      let profile = null;
      try {
        profile = normalizeNicoUserProfileResponse(resp.json);
      } catch {
        profile = null;
      }
      const entry = commenterFollowEntryFromProfile(profile, Date.now());
      if (entry && upsertCommenterFollowEntry(followMap, uid, entry)) touched = true;
      if (toFetch.indexOf(uid) < toFetch.length - 1) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    if (touched) {
      await chrome.storage.local.set({ [KEY_COMMENTER_FOLLOW_CACHE]: followMap }).catch(() => {
      });
    }
    return touched;
  }
  async function resolveBroadcasterUserIdForReport(liveId, report, deps) {
    const fromReport = String(report?.broadcasterUserId || "").trim();
    if (/^\d{1,18}$/.test(fromReport)) return fromReport;
    const fromWatch = String(deps.watchMetaSnapshot?.broadcasterUserId || "").trim();
    if (/^\d{1,18}$/.test(fromWatch)) return fromWatch;
    const lid = String(liveId || "").trim().toLowerCase();
    if (!/^lv\d{1,15}$/.test(lid)) return "";
    try {
      const bag = await chrome.storage.local.get(watchSnapshotStorageKey(lid)).catch(() => ({}));
      const snap = bag?.[watchSnapshotStorageKey(lid)];
      const fromSnap = String(snap?.broadcasterUserId || "").trim();
      if (/^\d{1,18}$/.test(fromSnap)) return fromSnap;
    } catch {
    }
    return "";
  }
  async function attachCommenterFollowingListToReport(report, liveId, broadcasterUidHint = "", opts = {}, deps) {
    const skipNetworkFetch = Boolean(opts?.skipNetworkFetch);
    try {
      if (!report) return;
      const lid = String(liveId || report.liveId || "").trim().toLowerCase();
      if (!/^lv\d{1,15}$/.test(lid)) return;
      const bag = await chrome.storage.local.get([KEY_COMMENTER_FOLLOWING_LIST_CACHE, commenterFollowLiveStorageKey(lid)]).catch(() => ({}));
      const followingListMap = normalizeFollowingListMap(bag?.[KEY_COMMENTER_FOLLOWING_LIST_CACHE]);
      const liveSnapshot = normalizeCommenterFollowLiveSnapshot(bag?.[commenterFollowLiveStorageKey(lid)]) || (report.commenterFollowDataset ? normalizeCommenterFollowLiveSnapshot(report.commenterFollowDataset) : null);
      const broadcasterUid = String(
        broadcasterUidHint || report.broadcasterUserId || deps.watchMetaSnapshot?.broadcasterUserId || ""
      ).trim();
      if (broadcasterUid && !report.broadcasterUserId) report.broadcasterUserId = broadcasterUid;
      const rowByUid = /* @__PURE__ */ new Map();
      if (liveSnapshot?.rows?.length) {
        for (const row of liveSnapshot.rows) rowByUid.set(row.userId, row);
      }
      const stats = (Array.isArray(report.allNumericCommenters) ? report.allNumericCommenters : []).map((u) => ({
        userId: String(u?.userId || "").trim(),
        commentCount: Number(u?.count) || 0
      })).filter((u) => /^\d{1,18}$/.test(u.userId)).sort((a, b) => b.commentCount - a.commentCount).slice(0, COMMENTER_FOLLOWING_LIST_MAX_PER_LIVE);
      const candidateUids = stats.map((s) => s.userId);
      const toFetch = pickFollowingListUidsToFetch(stats, followingListMap, {
        limit: Math.max(0, COMMENTER_FOLLOWING_LIST_MAX_PER_LIVE - 3),
        maxRank: COMMENTER_FOLLOWING_LIST_MAX_PER_LIVE,
        forceRetryStatuses: ["error", "login_required"]
      });
      let listTouched = false;
      if (!skipNetworkFetch) {
        for (const uid of toFetch) {
          const resp = await new Promise((resolve) => {
            try {
              chrome.runtime.sendMessage({ type: NICO_USER_FOLLOWING_FETCH_MESSAGE_TYPE, uid }, (r) => {
                const le = chrome.runtime.lastError;
                if (le) return resolve(null);
                resolve(r);
              });
            } catch {
              resolve(null);
            }
          });
          const entry = buildFollowingListEntryFromFetchResponse(resp, Date.now());
          if (entry && upsertFollowingListEntry(followingListMap, uid, entry)) {
            listTouched = true;
          }
          if (toFetch.indexOf(uid) < toFetch.length - 1) {
            await new Promise((r) => setTimeout(r, 500));
          }
        }
        if (listTouched) {
          await chrome.storage.local.set({ [KEY_COMMENTER_FOLLOWING_LIST_CACHE]: followingListMap }).catch(() => {
          });
        }
      }
      const baseRows = liveSnapshot?.rows?.length ? liveSnapshot.rows : stats.map((s) => ({
        userId: s.userId,
        commentCount: s.commentCount,
        nickname: ""
      }));
      const mergedRows = mergeFollowingListIntoRows(baseRows, followingListMap, broadcasterUid);
      const snapshot = buildCommenterFollowLiveSnapshot(lid, mergedRows, Date.now());
      if (snapshot) {
        report.commenterFollowDataset = snapshot;
        await chrome.storage.local.set({ [commenterFollowLiveStorageKey(lid)]: snapshot }).catch(() => {
        });
      }
      report.commenterFollowingListCache = followingListMap;
      report.followingListCoverage = summarizeFollowingListCoverage(followingListMap, candidateUids);
    } catch {
    }
  }
  async function attachCommenterFollowToReport(report, liveId, opts = {}, deps) {
    const cacheOnly = Boolean(opts?.cacheOnly);
    try {
      if (!report) return;
      const lid = String(liveId || report.liveId || "").trim().toLowerCase();
      const keys = [KEY_COMMENTER_FOLLOW_CACHE];
      if (/^lv\d{1,15}$/.test(lid)) keys.push(commenterFollowLiveStorageKey(lid));
      const bag = await chrome.storage.local.get(keys).catch(() => ({}));
      const followMap = normalizeCommenterFollowMap(bag?.[KEY_COMMENTER_FOLLOW_CACHE]);
      if (!cacheOnly) {
        await backfillCommenterFollowProfilesForReport(report, followMap, deps);
      }
      const liveSnapshot = /^lv\d{1,15}$/.test(lid) ? normalizeCommenterFollowLiveSnapshot(bag?.[commenterFollowLiveStorageKey(lid)]) : null;
      if (liveSnapshot) report.commenterFollowDataset = liveSnapshot;
      report.commenterFollowPriorEntries = followMap;
      const broadcasterUid = await resolveBroadcasterUserIdForReport(lid, report, deps);
      if (broadcasterUid) report.broadcasterUserId = broadcasterUid;
      const rowByUid = /* @__PURE__ */ new Map();
      if (liveSnapshot?.rows?.length) {
        for (const row of liveSnapshot.rows) rowByUid.set(row.userId, row);
      }
      const mergeUser = (u) => {
        if (!u) return;
        const uid = String(u.userId || "").trim();
        if (!/^\d{1,18}$/.test(uid)) return;
        const row = rowByUid.get(uid);
        if (row) applyFollowFieldsToUser(u, row);
        applyFollowFieldsToUser(u, followMap[uid]);
      };
      for (const u of report.allNumericCommenters || []) mergeUser(u);
      for (const u of report.topUsers || []) mergeUser(u);
      await attachCommenterFollowingListToReport(report, lid, broadcasterUid, {
        skipNetworkFetch: cacheOnly
      }, deps);
    } catch {
    }
  }
  async function buildHtmlReportDocument(comments, snapshot, snapshotError, liveId, watchUrl, eventRankingModel, deps) {
    const embed = deps.embedForMarketing === true;
    const exportedAtIso = (/* @__PURE__ */ new Date()).toISOString();
    const exportedAtJst = formatDateTime(Date.now());
    const safeLiveId = escapeHtml(liveId);
    const safeWatchUrl = escapeHtml(watchUrl || snapshot?.url || "-");
    const safeTitle = escapeHtml(snapshot?.title || "-");
    const safeBroadcastTitle = escapeHtml(
      snapshot?.broadcastTitle || snapshot?.title || "-"
    );
    const safeStartAtText = escapeHtml(snapshot?.startAtText || "-");
    const rawThumbnailUrl = String(snapshot?.thumbnailUrl || "").trim();
    const safeThumbnailUrl = isHttpOrHttpsUrl(rawThumbnailUrl) ? escapeAttr(rawThumbnailUrl) : "";
    const safeSnapshotError = snapshotError ? escapeHtml(snapshotError) : "";
    const tags = Array.isArray(snapshot?.tags) ? snapshot.tags.filter((v) => String(v || "").trim()) : [];
    const lidForSummary = String(liveId || "").trim().toLowerCase();
    const sessionSummaryPromise = /^lv\d{1,15}$/.test(lidForSummary) ? (async () => {
      try {
        const db = await openBroadcastSessionSummaryDb();
        return await listBroadcastSessionSummaryForLive(db, lidForSummary, 200);
      } catch {
        return [];
      }
    })() : Promise.resolve([]);
    const giftParticipationPromise = /^lv\d{1,15}$/.test(lidForSummary) ? chrome.storage.local.get([giftUsersStorageKey(lidForSummary), `nls_gift_events_${lidForSummary}`]).catch(() => ({})) : Promise.resolve({});
    const reportPrepPromise = Promise.all([
      /^lv\d{1,15}$/.test(lidForSummary) ? deps.readOfficialEventDomBundleFromStorage(lidForSummary) : Promise.resolve(null),
      deps.resolveBroadcasterProfileModel(snapshot, liveId),
      buildYukkuriImageDataUrlMap(),
      Promise.all([
        fetchExtensionPngAsDataUrl(YUKKURI_REPORT_IMAGES.link),
        fetchExtensionPngAsDataUrl(YUKKURI_REPORT_IMAGES.konta),
        fetchExtensionPngAsDataUrl(YUKKURI_REPORT_IMAGES.tanu)
      ])
    ]);
    const [
      eventDomBundleForReport,
      broadcasterProfileModel,
      yukkuriReportImageMap,
      [dataLink, dataKonta, dataTanu]
    ] = await reportPrepPromise;
    await deps.yieldToBrowserPaint();
    const avatarLink = yukkuriReportAvatarHtml(dataLink, "yukkuri-avatar--link", "り");
    const avatarKonta = yukkuriReportAvatarHtml(dataKonta, "yukkuri-avatar--konta", "こ");
    const avatarTanu = yukkuriReportAvatarHtml(dataTanu, "yukkuri-avatar--tanu", "た");
    const yukkuriAvatars = {
      avatarLinkHtml: avatarLink,
      avatarKontaHtml: avatarKonta,
      avatarTanuHtml: avatarTanu
    };
    const htmlReportConceptGuideCardHtml = buildHtmlReportConceptGuideCardHtml(yukkuriAvatars);
    const htmlReportSaveGuideCardHtml = buildHtmlReportSaveGuideCardHtml(yukkuriAvatars);
    const broadcasterProfileRowsHtml = buildBroadcasterProfileReportRowsHtml(
      broadcasterProfileModel
    );
    const externalLinksHtml = buildExternalLinksSectionHtml(snapshot?.noopenerLinks);
    const mangaReportPanels = buildMangaBroadcastPanels({
      bundle: eventDomBundleForReport,
      broadcastTitle: String(snapshot?.broadcastTitle || snapshot?.title || ""),
      broadcasterName: String(snapshot?.broadcasterName || ""),
      broadcasterUserId: String(
        broadcasterProfileModel?.userId || snapshot?.broadcasterUserId || ""
      ),
      recordedCommentCount: Array.isArray(comments) ? comments.length : 0,
      streamAgeMin: typeof snapshot?.streamAgeMin === "number" && snapshot.streamAgeMin >= 0 ? snapshot.streamAgeMin : void 0
    });
    const yukkuriReportHtml = renderMangaBroadcastPanelsHtml(mangaReportPanels, {
      heading: "今回の放送のおさらい・漫画版",
      imageDataUrlMap: yukkuriReportImageMap
    });
    const yukkuriReportCss = yukkuriBroadcastSummaryEmbeddedCss() + mangaBroadcastSummaryEmbeddedCss() + KIRAMEKI_AWARDS_CSS;
    const reportBroadcasterUserId = String(
      snapshot?.broadcasterUserId || ""
    ).trim();
    const htmlHeavyExport = comments.length > HTML_REPORT_HEAVY_COMMENT_THRESHOLD;
    const aggregatedRoomsAll = sanitizeRoomAvatarsForBroadcaster(
      aggregateCommentsByUser(
        comments,
        htmlHeavyExport ? {
          requireText: true,
          trackCharTotals: true,
          maxRooms: HTML_REPORT_AGGREGATE_ROOM_CAP,
          sortByCount: true
          // v0.1.1707: 集計の入力は【全件】(旧: 4000件の均等サンプル=件数・字数・賞が縮んでいた)。maxRooms は表示のための切り。
        } : { requireText: true }
      ),
      {
        broadcasterUid: reportBroadcasterUserId,
        broadcasterIconUrl: String(snapshot?.broadcasterIconUrl || "").trim()
      }
    );
    const aggregatedRooms = excludeBroadcasterFromRankedRooms(
      aggregatedRoomsAll,
      reportBroadcasterUserId
    );
    await deps.yieldToBrowserPaint();
    const userKeyToTotalChars = /* @__PURE__ */ new Map();
    if (htmlHeavyExport) {
      for (const room of aggregatedRooms) {
        const tc = Number(
          /** @type {{ totalChars?: number }} */
          room.totalChars
        );
        userKeyToTotalChars.set(room.userKey, Number.isFinite(tc) ? tc : 0);
      }
    } else {
      for (const c of comments) {
        const uid = c?.userId ? String(c.userId).trim() : "";
        if (reportBroadcasterUserId && uid === reportBroadcasterUserId) continue;
        const userKey = uid || UNKNOWN_USER_KEY;
        const len = String(c?.text == null ? "" : c.text).length;
        userKeyToTotalChars.set(userKey, (userKeyToTotalChars.get(userKey) || 0) + len);
      }
    }
    const roomRows = buildReportUserRoomRows(aggregatedRooms, {
      userKeyToTotalChars,
      displayUserLabel,
      buildUserProfileLinkedLabelHtml,
      resolveReportUserThumbSrc,
      identiconResolver: deps.getCachedAnonymousIdenticonDataUrl
    });
    const sortedRoomsForThumbGrid = [...aggregatedRooms].sort((a, b) => b.count - a.count).map((room) => ({
      userId: room.userKey,
      nickname: room.nickname,
      avatarUrl: room.avatarUrl || "",
      count: room.count
    }));
    const { numericIdUsers: thumbNumericUsers, anonymousUsers: thumbAnonymousUsers } = categorizeUsersForThumbGrid(sortedRoomsForThumbGrid, {
      identiconResolver: deps.getCachedAnonymousIdenticonDataUrl,
      maxNumeric: 80,
      maxAnonymous: 80
    });
    const thumbedUsersSectionHtml = buildReportThumbedUsersSectionHtml({
      numericUsers: thumbNumericUsers,
      anonymousUsers: thumbAnonymousUsers
    });
    const commentsForReport = reportBroadcasterUserId ? comments.filter(
      (c) => String(c?.userId || "").trim() !== reportBroadcasterUserId
    ) : comments;
    const sessionSummaryRows = await sessionSummaryPromise;
    await deps.yieldToBrowserPaint();
    const participationSummaryReport = aggregateMarketingReport(commentsForReport, liveId, { broadcasterUserId: reportBroadcasterUserId });
    await deps.yieldToBrowserPaint();
    const audienceGapForReport = analyzeAudienceEngagementGap(
      {
        liveId,
        comments: commentsForReport,
        samples: sessionSummaryRows,
        snapshot,
        visitorCount: eventDomBundleForReport?.programStats?.watchCount ?? snapshot?.viewerCountFromDom ?? null,
        officialCommentCount: eventDomBundleForReport?.programStats?.commentCount ?? null
      },
      { broadcasterUserId: reportBroadcasterUserId, liveId }
    );
    let giftUsersForParticipation = [];
    let giftEventsForParticipation = [];
    try {
      const gKey = giftUsersStorageKey(lidForSummary);
      const evKey = `nls_gift_events_${lidForSummary}`;
      const partBag = await giftParticipationPromise;
      giftUsersForParticipation = Array.isArray(partBag[gKey]) ? partBag[gKey] : [];
      giftEventsForParticipation = Array.isArray(partBag[evKey]) ? partBag[evKey] : [];
    } catch {
      giftUsersForParticipation = [];
      giftEventsForParticipation = [];
    }
    const supportParticipationBase = resolveMarketingSupportParticipationCounts({
      giftUsers: giftUsersForParticipation,
      giftEvents: giftEventsForParticipation,
      adContributionRanking: Array.isArray(eventDomBundleForReport?.adContributionRanking) ? eventDomBundleForReport.adContributionRanking : [],
      comments: commentsForReport
    });
    const supportParticipation = {
      ...supportParticipationBase,
      ...supportParticipationPctAgainstVisitors(
        audienceGapForReport,
        supportParticipationBase
      )
    };
    const participationLeadHtml = buildAudienceParticipationLeadSectionHtml(
      audienceGapForReport,
      participationSummaryReport,
      {
        sectionId: "sec-participation-lead",
        extraSectionClass: "card search-item",
        showDetailLink: false,
        searchData: "来場 コメント 参加率 来場者 コメントした人 ギフト アイテム 広告",
        supportParticipation
      }
    );
    const commenterFollowMarketingReport = participationSummaryReport;
    const attachFollowPromise = attachCommenterFollowToReport(commenterFollowMarketingReport, liveId, {
      cacheOnly: true
    }, deps);
    let kiramekiReturningUserKeys = [];
    let kiramekiFirstTimeUserKeys = [];
    try {
      const lid = String(liveId || "").trim().toLowerCase();
      if (lid && /^lv\d{1,15}$/.test(lid) && commentsForReport.length <= HTML_REPORT_HEAVY_COMMENT_THRESHOLD) {
        await deps.withTimeout(
          (async () => {
            const sumDb = await openBroadcastSessionSummaryDb();
            const pastLiveIds = await listRecentUniqueBroadcastLiveIds(sumDb, {
              limit: 12,
              excludeLiveId: lid
            });
            const pastUserIdSet = /* @__PURE__ */ new Set();
            if (pastLiveIds.length > 0) {
              const pastArrays = await Promise.all(
                pastLiveIds.map((id) => deps.readAllCommentsForLive(id))
              );
              for (const cs of pastArrays) {
                for (const c of Array.isArray(cs) ? cs : []) {
                  const uid = String(
                    /** @type {any} */
                    c?.userId || ""
                  ).trim();
                  if (uid) pastUserIdSet.add(uid);
                }
              }
            }
            const currentUserKeys = aggregatedRooms.map((r) => String(r?.userKey || "").trim()).filter((k) => k && k !== UNKNOWN_USER_KEY);
            ({ returningUserKeys: kiramekiReturningUserKeys, firstTimeUserKeys: kiramekiFirstTimeUserKeys } = resolveKiramekiReturningAndFirstTimeUserKeys({
              currentUserKeys,
              pastUserIds: pastUserIdSet
            }));
          })(),
          15e3,
          "kirameki_past_scan_timeout"
        );
      }
    } catch {
    }
    const { awards: kiramekiAwards } = computeKiramekiAwards({
      comments: commentsForReport,
      aggregatedRooms,
      returningUserKeys: kiramekiReturningUserKeys,
      firstTimeUserKeys: kiramekiFirstTimeUserKeys,
      broadcasterUserId: reportBroadcasterUserId
    });
    const kiramekiAwardsSectionHtml = buildKiramekiAwardsSectionHtml(
      kiramekiAwards,
      aggregatedRooms,
      {
        resolveAvatarSrc: (room) => resolveReportUserThumbSrc({
          userId: String(room?.userKey || ""),
          avatarUrl: String(room?.avatarUrl || ""),
          identiconResolver: deps.getCachedAnonymousIdenticonDataUrl
        }),
        escapeHtml,
        escapeAttr
      }
    );
    await attachFollowPromise;
    const commenterFollowBlock = buildHtmlReportCommenterFollowBlock({
      report: commenterFollowMarketingReport,
      identiconResolver: deps.getCachedAnonymousIdenticonDataUrl,
      broadcasterUserId: reportBroadcasterUserId,
      exportedAt: exportedAtIso
    });
    const userKeyToResolvedThumb = /* @__PURE__ */ new Map();
    for (const room of aggregatedRooms) {
      const src = resolveReportUserThumbSrc({
        userId: room.userKey,
        avatarUrl: room.avatarUrl || "",
        identiconResolver: deps.getCachedAnonymousIdenticonDataUrl
      });
      userKeyToResolvedThumb.set(room.userKey, src);
    }
    const reportTiming = summarizeBroadcastTiming({ snapshot, comments: commentsForReport });
    const reportBody = summarizeCommentBodyStats(commentsForReport);
    const reportId = summarizeIdentifierStats(commentsForReport);
    const formatTimingDate = (ms) => typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? formatDateTime(ms) : "-";
    const formatPct = (ratio) => typeof ratio === "number" && Number.isFinite(ratio) ? `${Math.round(ratio * 1e3) / 10}%` : "-";
    const durationLabel = formatBroadcastDurationLabel(reportTiming);
    const selfPostedComments = commentsForReport.filter((c) => Boolean(c?.selfPosted));
    const selfPostedRows = buildReportSelfPostedRows(selfPostedComments, { formatDateTime });
    const reportCommentsCsv = commentsForReport.length > HTML_REPORT_HEAVY_COMMENT_THRESHOLD ? "" : buildReportCommentsCsv(commentsForReport);
    const reportCsvFilename = `tsuioku-comments-${liveId || "unknown"}.csv`;
    const commentsTableSectionHtml = buildReportCommentsTableSectionHtml({
      comments: commentsForReport,
      userKeyToResolvedThumb,
      identiconResolver: deps.getCachedAnonymousIdenticonDataUrl,
      formatDateTime,
      reportCommentsCsv
    });
    const headLinkRows = snapshot ? buildReportLinkRows(snapshot.links) : [];
    const { friendly: friendlyMetas, technical: technicalMetas } = partitionMetasForHtmlReport(snapshot?.metas);
    const friendlyMetaRowsHtml = buildReportFriendlyMetaRows(friendlyMetas);
    const headTechnicalMetaRows = buildReportMetaRows(technicalMetas);
    const headScriptRows = snapshot ? buildReportScriptRows(snapshot.scripts) : [];
    const headNoopenerRows = snapshot ? buildReportNoopenerRows(snapshot.noopenerLinks) : [];
    let nextMemoSectionHtml = "";
    try {
      const lidKey = String(liveId || "").trim();
      const gk = giftUsersStorageKey(lidKey);
      const giftBag = await chrome.storage.local.get(gk);
      const giftUsers = Array.isArray(giftBag[gk]) ? giftBag[gk] : [];
      const mr = htmlHeavyExport ? participationSummaryReport : aggregateMarketingReport(comments, lidKey, {
        broadcasterUserId: reportBroadcasterUserId || void 0
      });
      const memo = buildReportMemoPayload({
        report: mr,
        comments,
        giftUsers,
        broadcasterUserId: reportBroadcasterUserId,
        maskShareLabels: false
      });
      nextMemoSectionHtml = buildReportNextMemoSectionHtml(memo, {
        avatarLink,
        avatarKonta,
        avatarTanu
      });
    } catch {
      nextMemoSectionHtml = "";
    }
    const eventRankingSectionHtml = buildEventRankingSectionHtml(
      eventRankingModel,
      broadcasterProfileModel
    );
    return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>君斗りんくの追憶のきらめき レポート ${safeLiveId}</title>
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
        content-visibility: auto;
        contain-intrinsic-size: auto 320px;
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
      .nl-user-profile-link {
        color: #93c5fd;
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      .nl-user-profile-link:hover { color: #bfdbfe; }
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
      .nl-report-comments-table-wrap {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      .nl-comment-row {
        content-visibility: auto;
        contain-intrinsic-size: auto 36px;
      }
      .nl-report-comments-more-wrap {
        margin: 10px 0 0;
        text-align: center;
      }
      .nl-report-comments-more-btn {
        cursor: pointer;
        border: 1px solid #475569;
        background: #0f172a;
        color: #cbd5e1;
        border-radius: 999px;
        padding: 0.45rem 1rem;
        font-size: 0.82rem;
      }
      .nl-report-comments-more-btn:hover:not(:disabled) {
        border-color: #93c5fd;
        color: #f8fafc;
      }
      .nl-report-comments-more-btn:disabled {
        cursor: default;
        opacity: 0.85;
      }
      .report-thumb-grid__cell {
        content-visibility: auto;
        contain-intrinsic-size: auto 88px;
      }
      html { scroll-behavior: auto; }
      .toc {
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 12px;
        padding: 12px 14px;
        margin-bottom: 14px;
      }
      .toc__heading {
        margin: 0 0 8px;
        font-size: 0.85rem;
        color: #cbd5e1;
        font-weight: 700;
      }
      .toc__list {
        margin: 0;
        padding-left: 1.4em;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 4px 12px;
      }
      .toc__list li { font-size: 0.85rem; }
      .toc__list a {
        color: #93c5fd;
        text-decoration: none;
      }
      .toc__list a:hover { text-decoration: underline; }
      section.card[id], details[id] { scroll-margin-top: 12px; }
      .nl-report-csv-btn {
        display: inline-block;
        background: #1d4ed8;
        color: #fff;
        border: 1px solid #1e3a8a;
        border-radius: 8px;
        padding: 6px 12px;
        font-size: 12px;
        cursor: pointer;
      }
      .nl-report-csv-btn:hover { background: #1e40af; }
      .nl-report-csv-btn:focus-visible {
        outline: 2px solid #38bdf8;
        outline-offset: 2px;
      }
      .nl-report-csv-hint {
        color: var(--muted);
        font-size: 11px;
        margin-left: 8px;
      }
      #nlReportCsvData { display: none; }
      .guide-lead {
        margin: 0 0 12px;
        color: var(--muted);
        font-size: 0.88rem;
        line-height: 1.45;
      }
      .memo-sample {
        display: block;
        margin-top: 4px;
        color: var(--muted);
        font-size: 0.84rem;
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
      .memo-yukkuri-guide {
        margin: 4px 0 12px;
        padding: 10px;
        border: 1px solid #334155;
        border-radius: 12px;
        background: #0b1325;
      }
      .memo-yukkuri-guide .speech-bubble {
        border-color: #3b4b68;
        background: #111827;
      }
      .yukkuri-row {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: 12px;
      }
      /* 右寄せアバターは本文列が極端に狭くなり日本語が崩れるため、常に左アバター＋右本文 */
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
      .yukkuri-avatar--link {
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
      /* キャラ名は直下の strong のみブロック（本文内の strong はインラインのまま） */
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
      /* アコーディオン内: 折り返しで1文字行・読点頭などを防ぐ（reverse で狭い列にならない） */
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
      /* 0.1.12 (F): ユーザー別テーブルのサムネ列。最低 28px の丸サムネ。 */
      .report-room-av {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        object-fit: cover;
        display: block;
      }
      .report-room-av--empty {
        background: #cbd5e1;
      }
      /* 0.1.12 (F2 追加): 全コメント一覧のユーザーセル内インラインサムネ。
         行高さを増やさないよう 20px に抑え、ラベルとは 6px のギャップ。 */
      .report-user-cell {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }
      .report-user-cell__label {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .report-comment-av {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        object-fit: cover;
        flex-shrink: 0;
        display: block;
      }
      .report-comment-av--empty {
        background: #cbd5e1;
      }
      /* 0.1.12 (F3): サムネ付きユーザー一覧グリッド。可変列で詰めて並べる。 */
      /* 0.1.14 (J): HTML レポートの dark テーマ (--bg #0b1220 / --panel #111b2e) に
         合わせて、明示色で書く。旧 CSS は var(--panel-bg, #ffffff) を使っていて、
         --panel-bg は report 側で未定義 → 白 fallback が当たり、しかも text 色は
         --text (light gray) を継承していたため「白×ライトグレー」で読めない状態
         だった（ユーザー報告の視認性問題）。 */
      /* 0.1.15 (L): subsection heading（数値 ID / 匿名）。card 内の小見出し。 */
      .report-thumb-grid__heading {
        margin: 14px 0 8px;
        padding: 0 0 6px;
        border-bottom: 1px solid #2a3a5e;
        font-size: 0.85rem;
        font-weight: 700;
        color: #cbd5e1;
        display: flex;
        align-items: baseline;
        gap: 8px;
      }
      .report-thumb-grid__heading:first-of-type {
        margin-top: 4px;
      }
      .report-thumb-grid__heading-count {
        font-size: 0.74rem;
        color: #94a3b8;
        font-weight: 600;
      }
      .report-thumb-grid {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
        gap: 10px;
      }
      .report-thumb-grid__cell {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 8px 6px;
        /* --panel より一段明るくして、card 内でカード感を出す */
        background: #1a2540;
        border: 1px solid #2a3a5e;
        border-radius: 10px;
        text-align: center;
        min-width: 0;
      }
      .report-thumb-grid__avatar-wrap {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        overflow: hidden;
        background: #0b1220;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .report-thumb-grid__avatar {
        width: 48px;
        height: 48px;
        object-fit: cover;
        display: block;
      }
      .report-thumb-grid__label {
        font-size: 0.78rem;
        line-height: 1.25;
        /* dark bg 上で WCAG AA 確保のため明示 */
        color: #e2e8f0;
        font-weight: 600;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        width: 100%;
      }
      .report-thumb-grid__label .nl-user-profile-link {
        color: #93c5fd;
      }
      .report-thumb-grid__count {
        font-size: 0.72rem;
        /* --muted #93a4be より一段明るくして読みやすく */
        color: #cbd5e1;
        font-weight: 600;
      }
      /* イベント順位セクション（Phase B） */
      .event-rank__head { margin: 0 0 10px; padding: 10px 12px; border-radius: 10px; background: rgba(5,109,255,0.12); border: 1px solid rgba(5,109,255,0.35); }
      .event-rank__name { margin: 0 0 4px; font-weight: 700; color: #e2e8f0; }
      .event-rank__self { margin: 0; font-size: 1.05rem; font-weight: 700; color: #e2e8f0; }
      .event-rank__self strong { color: #60a5fa; }
      .event-rank__diff { margin: 3px 0 0; font-size: 0.85rem; color: #93a4be; }
      .event-rank__table { width: 100%; border-collapse: collapse; }
      .event-rank__table th, .event-rank__table td { padding: 5px 8px; border-bottom: 1px solid rgba(148,164,190,0.2); text-align: left; vertical-align: middle; }
      .event-rank__rank { width: 2.4em; font-weight: 800; color: #60a5fa; }
      .event-rank__thumb { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; display: block; }
      .event-rank__thumb--none { display: inline-block; background: rgba(148,164,190,0.25); }
      .event-rank__user { font-weight: 600; color: #e2e8f0; }
      .event-rank__score { white-space: nowrap; font-weight: 700; color: #cbd5e1; }
      .event-rank__stale { margin: 6px 0 0; font-size: 0.8rem; color: #93a4be; }
      ${commenterFollowBlock.css}
      ${audienceParticipationLeadEmbeddedCss()}
      ${yukkuriReportCss}
    </style>
  </head>
  <body>
    <div class="wrap">
      ${embed ? "" : `<header class="hero">
        <h1>君斗りんくの追憶のきらめき HTMLレポート <span class="pill">${safeLiveId}</span></h1>
        <p>出力日時: ${escapeHtml(exportedAtJst)} / ISO: ${escapeHtml(exportedAtIso)}</p>
        <p class="mono">watch URL: ${safeWatchUrl}</p>
      </header>`}

      ${embed ? "" : participationLeadHtml}

      ${embed ? "" : sectionInterestArrival(participationSummaryReport)}

      ${embed ? "" : yukkuriReportHtml}

      ${embed ? "" : eventRankingSectionHtml}

      <div class="search-box">
        <input id="q" type="search" placeholder="タイトル・配信者・タグ・メタ・script・コメントを横断検索（例: 珈琲 / まめ。２ / コーヒー / og:title）">
        <div id="searchResult" class="hint">検索対象: <span id="totalCount">0</span> 件</div>
      </div>

      <nav class="toc" aria-label="目次">
        <h2 class="toc__heading">目次（クリックで該当セクションへ）</h2>
        <ol class="toc__list">
          ${embed ? "" : `<li><a href="#sec-participation-lead">来場とコメント参加</a></li>
          <li><a href="#mkt-interest-arrival">興味タグ別来場${participationSummaryReport?.interestArrivalSummary?.messageCount > 0 ? "" : "（検出 0件）"}</a></li>`}
          ${embed ? "" : '<li><a href="#sec-next-memo">りんく達の次枠メモ</a></li>'}
          ${eventRankingSectionHtml && !embed ? '<li><a href="#sec-event-ranking">イベント順位</a></li>' : ""}
          <li><a href="#sec-overview">概要・サムネ・タグ</a></li>
          <li><a href="#sec-user-summary">ユーザー別（しおり集計）</a></li>
          <li><a href="#sec-id-breakdown">内訳統計（ID 種別比率）</a></li>
          ${thumbedUsersSectionHtml && !embed ? '<li><a href="#sec-thumb-grid">サムネ付きユーザー一覧</a></li>' : ""}
          ${commenterFollowBlock.hasDirectory && !embed ? '<li><a href="#sec-commenter-follow">数値IDコメンター（フォロー情報）</a></li>' : ""}
          ${commenterFollowBlock.hasAnalytics && !embed ? '<li><a href="#sec-commenter-follow-analytics">フォロー×コメント分析</a></li>' : ""}
          <li><a href="#sec-self-comments">自分のコメント抜粋</a></li>
          <li><a href="#sec-all-comments">保存コメント一覧（CSV ダウンロードあり）</a></li>
          ${embed ? "" : `<li><a href="#sec-share-meta">シェア・プレビュー向けの情報</a></li>
          <li><a href="#sec-tech-dump">ページの裏側データ（上級者向け）</a></li>`}
        </ol>
      </nav>

      ${embed ? "" : nextMemoSectionHtml}

      <div class="grid">
        <section class="card" id="sec-overview">
          <h2>概要</h2>
          <table>
            <tbody>
              <tr class="search-item" data-search="${escapeAttr(liveId.toLowerCase())}"><th>liveId</th><td class="mono">${safeLiveId}</td></tr>
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.broadcastTitle || "").toLowerCase())}"><th>放送タイトル</th><td>${safeBroadcastTitle}</td></tr>
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.broadcasterName || "").toLowerCase())}"><th>配信者名</th><td>${broadcasterNameCellHtml(broadcasterProfileModel, snapshot?.broadcasterName || "")}</td></tr>
              ${broadcasterProfileRowsHtml}
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.startAtText || "").toLowerCase())}"><th>開始時刻（公式表記）</th><td>${safeStartAtText}</td></tr>
              <tr><th>最初の記録コメント</th><td>${escapeHtml(formatTimingDate(reportTiming.firstCapturedAt))}</td></tr>
              <tr><th>最後の記録コメント</th><td>${escapeHtml(formatTimingDate(reportTiming.lastCapturedAt))}</td></tr>
              <tr><th>記録できた区間の長さ</th><td>${escapeHtml(durationLabel)}</td></tr>
              <tr><th>1分あたりのコメント（CPM）</th><td>${reportTiming.commentsPerMinute || "-"}</td></tr>
              <tr><th>配信者レベル</th><td>${reportTiming.broadcasterLevel != null ? `LV${reportTiming.broadcasterLevel}` : "-"}</td></tr>
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.url || watchUrl || "").toLowerCase())}"><th>URL</th><td class="mono">${safeWatchUrl}</td></tr>
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.title || "").toLowerCase())}"><th>Titleタグ</th><td>${safeTitle}</td></tr>
              <tr><th>保存コメント数</th><td>${comments.length}</td></tr>
              <tr><th>ユーザー別件数</th><td>${aggregatedRooms.length}${htmlHeavyExport ? "（表示は上位ルームのみ）" : ""}</td></tr>
              <tr><th>本文の平均字数</th><td>${reportBody.averageChars}</td></tr>
              <tr><th>本文の中央値字数</th><td>${reportBody.medianChars}</td></tr>
              <tr><th>本文の最大字数</th><td>${reportBody.maxChars}</td></tr>
            </tbody>
          </table>
          <h2 style="margin-top:12px;">サムネイル</h2>
          ${safeThumbnailUrl ? `<div class="thumb-wrap search-item" data-search="${safeThumbnailUrl.toLowerCase()}"><img src="${safeThumbnailUrl}" alt="放送サムネイル"></div>` : '<div class="mono">取得なし</div>'}
          <h2 style="margin-top:12px;">タグ</h2>
          ${tags.length ? `<div class="tag-list">${tags.map(
      (tag) => `<span class="tag-chip search-item" data-search="${escapeAttr(
        tag.toLowerCase()
      )}">${escapeHtml(tag)}</span>`
    ).join("")}</div>` : '<div class="mono">取得なし</div>'}
          ${externalLinksHtml}
          ${safeSnapshotError ? `<div class="warn">${safeSnapshotError}</div>` : ""}
        </section>

        <section class="card" id="sec-user-summary">
          <h2>ユーザー別（しおり集計）</h2>
          <table>
            <thead><tr><th>サムネ</th><th>ユーザー</th><th>件数</th><th>累計字数</th><th>最新コメント</th></tr></thead>
            <tbody>${(embed ? roomRows.slice(0, 50) : roomRows).join("") || '<tr><td colspan="5">データなし</td></tr>'}</tbody>
          </table>
          ${// v0.1.1856: マーケに埋め込むときは51人目以降を畳む(畳んだ中のサムネは開くまで描かれない=スクロールが重くならない)
    embed && roomRows.length > 50 ? `<details class="report-room-rest"><summary>残り ${roomRows.length - 50}人を見る</summary><table><thead><tr><th>サムネ</th><th>ユーザー</th><th>件数</th><th>累計字数</th><th>最新コメント</th></tr></thead><tbody>${roomRows.slice(50).join("")}</tbody></table></details>` : ""}
        </section>
        <section class="card" id="sec-id-breakdown">
          <h2>内訳統計（無料）</h2>
          <p class="guide-lead">記録したコメントの内訳を、登場した識別子の種類別にまとめたのだ。匿名（184）と数値ID、自分のコメントの比率がわかるのだ。</p>
          <table>
            <thead><tr><th>種別</th><th>件数</th><th>比率</th></tr></thead>
            <tbody>
              <tr><th>数値 ID（ログインユーザー）</th><td>${reportId.numericIdCount}</td><td>${formatPct(reportId.numericIdRatio)}</td></tr>
              <tr><th>匿名（184 / a:プレフィックス）</th><td>${reportId.anonymous184Count}</td><td>${formatPct(reportId.anonymous184Ratio)}</td></tr>
              <tr><th>自分のコメント</th><td>${reportId.selfPostedCount}</td><td>${formatPct(reportId.totalCount > 0 ? reportId.selfPostedCount / reportId.totalCount : 0)}</td></tr>
              <tr><th>その他（ID 未取得）</th><td>${reportId.otherCount}</td><td>${formatPct(reportId.totalCount > 0 ? reportId.otherCount / reportId.totalCount : 0)}</td></tr>
              <tr><th>総コメント数</th><td colspan="2">${reportId.totalCount}</td></tr>
            </tbody>
          </table>
        </section>
        ${kiramekiAwardsSectionHtml}
        ${embed ? "" : thumbedUsersSectionHtml}
        ${embed ? "" : commenterFollowBlock.directoryHtml}
        ${embed ? "" : commenterFollowBlock.analyticsHtml}
      </div>
      ${embed ? "" : htmlReportConceptGuideCardHtml}
      ${embed ? "" : htmlReportSaveGuideCardHtml}

      ${embed ? "" : `      <section class="card" id="sec-share-meta" style="margin-top:12px;">
        <h2>シェア・プレビュー向けの情報</h2>
        <p class="guide-lead">SNSやブラウザのプレビューに使われることが多い項目だけ、日本語の見出しに直して載せているのだ。</p>
        <table>
          <thead><tr><th>項目</th><th>内容</th></tr></thead>
          <tbody>${friendlyMetaRowsHtml.join("") || '<tr><td colspan="2">このページからは取得できなかったのだ</td></tr>'}</tbody>
        </table>
      </section>

      <details class="tech-dump" id="sec-tech-dump">
        <summary>ページの裏側データ（アプリ連携・調査用・上級者向け）— クリックで開く</summary>
        <div class="tech-dump-inner">
          <p class="tech-dump-hint">al:android や twitter:card など、ふだん読まなくてよい行が並ぶのだ。ページの解析やトラブル調査のときに使うのだ。</p>
          <h3>head 内の link（stylesheet / icon など）</h3>
          <table>
            <thead><tr><th>rel</th><th>href</th><th>as</th><th>type</th></tr></thead>
            <tbody>${headLinkRows.join("") || '<tr><td colspan="4">取得なし</td></tr>'}</tbody>
          </table>
          <h3>メタタグ全文（上記「シェア向け」以外）</h3>
          <table>
            <thead><tr><th>key</th><th>value</th></tr></thead>
            <tbody>${headTechnicalMetaRows.join("") || '<tr><td colspan="2">取得なし</td></tr>'}</tbody>
          </table>
          <h3>script（src）</h3>
          <table>
            <thead><tr><th>type</th><th>src</th></tr></thead>
            <tbody>${headScriptRows.join("") || '<tr><td colspan="2">取得なし</td></tr>'}</tbody>
          </table>
          <h3>noopener リンク</h3>
          <table>
            <thead><tr><th>text</th><th>href</th></tr></thead>
            <tbody>${headNoopenerRows.join("") || '<tr><td colspan="2">取得なし</td></tr>'}</tbody>
          </table>
        </div>
      </details>`}

      <section class="card" id="sec-self-comments" style="margin-top:12px;">
        <h2>自分のコメント抜粋（${selfPostedComments.length}件）</h2>
        <p class="guide-lead">自分が送ったコメントだけを抜き出したのだ。後から自分の応援を振り返るとき用なのだ。</p>
        <table>
          <thead><tr><th>#</th><th>commentNo</th><th>本文</th><th>capturedAt</th></tr></thead>
          <tbody>${selfPostedRows.join("") || '<tr><td colspan="4">自コメは記録されていないのだ</td></tr>'}</tbody>
        </table>
      </section>

      ${commentsTableSectionHtml}

      <p class="footer-note">
        このHTMLは「君斗りんくの追憶のきらめき」（開発識別子 nicolivelog）がローカル生成した振り返り用レポートです。ブラウザ内で検索して再利用できます。
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
            ? '検索結果: ' + visible + ' / ' + all.length + ' 件'
            : '検索対象: ' + all.length + ' 件';
        };
        q.addEventListener('input', update);
        update();

        // 0.1.21 (V): CSV ダウンロード。pre 要素の textContent から生 CSV を取り、
        // UTF-8 BOM を先頭に付けた Blob を生成して a.click() でダウンロード。
        const csvBtn = document.getElementById('nlReportCsvDownloadBtn');
        const csvData = document.getElementById('nlReportCsvData');
        if (csvBtn && csvData) {
          csvBtn.addEventListener('click', () => {
            try {
              const csv = csvData.textContent || '';
              const blob = new Blob(['\\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = ${JSON.stringify(reportCsvFilename)};
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 15000);
            } catch (e) {
              console.warn('csv download failed', e);
            }
          });
        }
      })();
    <\/script>
    ${embed ? "" : commenterFollowBlock.embedScriptHtml}
  </body>
</html>`;
  }

  // src/lib/kokenGiftHistoryApi.js
  var KOKEN_GIFT_HISTORY_FETCH_MESSAGE_TYPE = "NLS_KOKEN_GIFT_HISTORY_FETCH";
  var NUMERIC_UID_RE = /^[1-9]\d{0,17}$/;
  function giftHistoryThrowsStorageKey(liveId) {
    return "nls_gift_history_throws_" + String(liveId == null ? "" : liveId).trim().toLowerCase();
  }
  function isLikelyKokenGiftHistoryShape(json) {
    if (!json || typeof json !== "object") return false;
    const j = (
      /** @type {Record<string, any>} */
      json
    );
    if (j.meta && typeof j.meta === "object" && j.meta.status != null) {
      if (Number(j.meta.status) !== 200) return false;
    }
    return !!(j.data && typeof j.data === "object" && Array.isArray(j.data.histories));
  }
  function sanitizeHttpUrl3(value) {
    const s = String(value == null ? "" : value).trim();
    return /^https?:\/\//i.test(s) ? s : "";
  }
  function nonNegativeInt(v) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
    return 0;
  }
  function formatKokenGiftStreamTimeLabel(publishedAt, showTimeBeginAt) {
    const pub = Number(publishedAt);
    if (!Number.isFinite(pub) || pub <= 0) {
      return { timeLabel: "—", sortKey: 0 };
    }
    const begin = Number(showTimeBeginAt);
    let offsetSec = pub;
    if (Number.isFinite(begin) && begin > 0) {
      offsetSec = Math.max(0, Math.floor(pub - begin));
    }
    const h = Math.floor(offsetSec / 3600);
    const m = Math.floor(offsetSec % 3600 / 60);
    const s = Math.floor(offsetSec % 60);
    const timeLabel = `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return { timeLabel, sortKey: offsetSec };
  }
  function buildGiftSubAppPayloadFromKokenJson(json, options = {}) {
    if (!isLikelyKokenGiftHistoryShape(json)) return null;
    const data = (
      /** @type {Record<string, any>} */
      /** @type {any} */
      json.data
    );
    const histories = Array.isArray(data.histories) ? data.histories : [];
    if (!histories.length) return null;
    const showTimeBeginAt = data.showTimeBeginAt;
    const now = options && Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const liveId = String(options?.liveId || "").trim().toLowerCase();
    const history2 = [];
    const itemMap = /* @__PURE__ */ new Map();
    for (const h of histories) {
      if (!h || typeof h !== "object") continue;
      const sidRaw = String(h.supporterId == null ? "" : h.supporterId).trim();
      const hasUid = NUMERIC_UID_RE.test(sidRaw);
      let senderName = String(h.supporterName == null ? "" : h.supporterName).trim();
      if (!senderName) {
        if (hasUid) senderName = sidRaw;
        else continue;
      }
      const itemName = String(h.itemName == null ? "" : h.itemName).trim() || "（名称未取得）";
      const points = nonNegativeInt(h.point);
      if (!points) continue;
      const { timeLabel, sortKey } = formatKokenGiftStreamTimeLabel(
        h.publishedAt,
        showTimeBeginAt
      );
      const thumbnailUrl = sanitizeHttpUrl3(h.itemThumbnailUrl);
      history2.push({
        itemName,
        senderName,
        points,
        time: timeLabel,
        sortKey,
        thumbnailUrl,
        senderAvatarUrl: sanitizeHttpUrl3(h.supporterThumbnailUrl),
        userId: hasUid ? sidRaw : "",
        kokenHistoryId: String(h.id == null ? "" : h.id).trim(),
        // v0.1.1663: 公式の公開時刻(epoch 秒)。「いつ投げたか」を時計の時刻で出すため(配信内の経過時間 time とは別)。
        publishedAt: Number(h.publishedAt) > 0 ? Math.floor(Number(h.publishedAt)) : 0,
        // v0.1.1669: 貢献度(contribution)。公式ランキング(タイルの🎁)は人ごとの contribution の合計=pt の10倍(実測: 記名25人すべて一致)。
        //   明細とタイルを同じ単位で照合するため保存する(additive)。
        contribution: nonNegativeInt(h.contribution)
      });
      const key = itemName.toLowerCase();
      const cur = itemMap.get(key) || { itemName, count: 0, thumbnailUrl: "" };
      cur.count += 1;
      if (thumbnailUrl) cur.thumbnailUrl = thumbnailUrl;
      itemMap.set(key, cur);
    }
    if (!history2.length) return null;
    history2.sort(
      (a, b) => Number(
        /** @type {{ sortKey?: number }} */
        b.sortKey
      ) - Number(
        /** @type {{ sortKey?: number }} */
        a.sortKey
      )
    );
    const officialTotal = Number(data.totalPoint);
    return {
      liveId,
      capturedAt: now,
      source: "koken-api",
      history: history2,
      totalCounts: [...itemMap.values()].sort((a, b) => b.count - a.count),
      // v0.1.1669: 公式の合計ptと残り件数(明細の合計と照合するため・additive)。残り件数 0 = 全件取得。
      ...Number.isFinite(officialTotal) && officialTotal >= 0 ? { officialTotalPoint: Math.floor(officialTotal), officialRemaining: nonNegativeInt(data.nextCount) } : {}
    };
  }
  function pickRicherGiftSubAppHistoryRow(a, b) {
    const score = (raw) => {
      const r = (
        /** @type {Record<string, unknown>} */
        raw || {}
      );
      let s = 0;
      if (/^\d{1,18}$/.test(String(r.userId || "").trim())) s += 8;
      if (sanitizeHttpUrl3(r.thumbnailUrl)) s += 4;
      if (sanitizeHttpUrl3(r.senderAvatarUrl)) s += 2;
      const name = String(r.itemName || "").trim();
      if (name && name !== "（名称未取得）") s += 6;
      if (Number(r.publishedAt) > 0) s += 1;
      if (Number(r.contribution) > 0) s += 1;
      return s;
    };
    return score(a) >= score(b) ? (
      /** @type {object} */
      a
    ) : (
      /** @type {object} */
      b
    );
  }
  function giftSubAppHistoryItemKey(item) {
    const r = (
      /** @type {Record<string, unknown>} */
      item || {}
    );
    const kid = String(r.kokenHistoryId || "").trim();
    if (kid) return `koken:${kid}`;
    return `${String(r.time || "").trim()}	${String(r.senderName || "").trim()}	${String(r.itemName || "").trim()}	${Number(r.points)}`;
  }
  function mergeGiftSubAppHistoryPayload(prev, next) {
    const out = mergeGiftSubAppHistoryPayloadCore(prev, next);
    if (!out || typeof out !== "object") return out;
    const pick = (o) => o && typeof o === "object" && Number.isFinite(Number(o.officialTotalPoint)) ? o : null;
    const src = pick(next) || pick(prev);
    if (src) {
      return { ...out, officialTotalPoint: Math.floor(Number(src.officialTotalPoint)), officialRemaining: nonNegativeInt(src.officialRemaining) };
    }
    return out;
  }
  function mergeGiftSubAppHistoryPayloadCore(prev, next) {
    const n = next && typeof next === "object" ? next : null;
    const p = prev && typeof prev === "object" ? prev : null;
    if (!n || !Array.isArray(n.history) || n.history.length === 0) {
      if (!p || !Array.isArray(p.history) || p.history.length === 0) return null;
      return {
        history: [...p.history],
        totalCounts: Array.isArray(p.totalCounts) ? [...p.totalCounts] : [],
        capturedAt: Number(p.capturedAt) || Date.now(),
        source: String(p.source || "dom-scrape"),
        liveId: String(p.liveId || "")
      };
    }
    if (!p || !Array.isArray(p.history) || p.history.length === 0) {
      return {
        history: [...n.history],
        totalCounts: Array.isArray(n.totalCounts) ? [...n.totalCounts] : [],
        capturedAt: Number(n.capturedAt) || Date.now(),
        source: String(n.source || "koken-api"),
        liveId: String(n.liveId || "")
      };
    }
    const byKey = /* @__PURE__ */ new Map();
    for (const raw of p.history) {
      const key = giftSubAppHistoryItemKey(raw);
      if (!key) continue;
      const prev2 = byKey.get(key);
      byKey.set(key, prev2 ? pickRicherGiftSubAppHistoryRow(prev2, raw) : (
        /** @type {object} */
        raw
      ));
    }
    for (const raw of n.history) {
      const key = giftSubAppHistoryItemKey(raw);
      if (!key) continue;
      const prev2 = byKey.get(key);
      byKey.set(key, prev2 ? pickRicherGiftSubAppHistoryRow(prev2, raw) : (
        /** @type {object} */
        raw
      ));
    }
    const history2 = [...byKey.values()].sort((a, b) => {
      const ra = (
        /** @type {{ sortKey?: unknown, time?: unknown }} */
        a
      );
      const rb = (
        /** @type {{ sortKey?: unknown, time?: unknown }} */
        b
      );
      const sa = Number(ra.sortKey);
      const sb = Number(rb.sortKey);
      if (Number.isFinite(sa) && Number.isFinite(sb) && sb !== sa) return sb - sa;
      return parseGiftStreamTimeSortKey2(String(rb.time || "")) - parseGiftStreamTimeSortKey2(String(ra.time || ""));
    });
    const itemMap = /* @__PURE__ */ new Map();
    const allCounts = [
      ...Array.isArray(p.totalCounts) ? p.totalCounts : [],
      ...Array.isArray(n.totalCounts) ? n.totalCounts : []
    ];
    for (const raw of allCounts) {
      const r = (
        /** @type {Record<string, unknown>} */
        raw || {}
      );
      const name = String(r.itemName || "").trim();
      const count = nonNegativeInt(r.count);
      if (!name || !count) continue;
      const key = name.toLowerCase();
      const cur = itemMap.get(key) || { itemName: name, count: 0, thumbnailUrl: "" };
      cur.count = Math.max(cur.count, count);
      const thumb = sanitizeHttpUrl3(r.thumbnailUrl);
      if (thumb) cur.thumbnailUrl = thumb;
      itemMap.set(key, cur);
    }
    for (const row of history2) {
      const r = (
        /** @type {Record<string, unknown>} */
        row
      );
      const name = String(r.itemName || "").trim();
      const key = name.toLowerCase();
      if (!key) continue;
      const cur = itemMap.get(key) || { itemName: name, count: 0, thumbnailUrl: "" };
      cur.count += 1;
      const thumb = sanitizeHttpUrl3(r.thumbnailUrl);
      if (thumb) cur.thumbnailUrl = thumb;
      itemMap.set(key, cur);
    }
    const sources = new Set([String(p.source || ""), String(n.source || "")].filter(Boolean));
    let source = "merged";
    if (sources.has("koken-api") && sources.has("dom-scrape")) source = "merged";
    else if (sources.has("koken-api")) source = "koken-api";
    else if (sources.has("dom-scrape")) source = "dom-scrape";
    return {
      history: history2,
      totalCounts: [...itemMap.values()].sort((a, b) => b.count - a.count),
      capturedAt: Math.max(Number(p.capturedAt) || 0, Number(n.capturedAt) || 0) || Date.now(),
      source,
      liveId: String(n.liveId || p.liveId || "")
    };
  }
  function parseGiftStreamTimeSortKey2(timeLabel) {
    const s = String(timeLabel || "").trim();
    if (!s) return 0;
    const parts = s.split(":").map((p) => parseInt(String(p).replace(/[^\d]/g, ""), 10));
    if (parts.some((n) => !Number.isFinite(n))) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 1) return parts[0];
    return 0;
  }
  function normalizeKokenGiftHistoryResponse(json, options = {}) {
    if (!isLikelyKokenGiftHistoryShape(json)) return null;
    const histories = (
      /** @type {any[]} */
      /** @type {Record<string, any>} */
      json.data.histories
    );
    const now = options && Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const byKey = /* @__PURE__ */ new Map();
    for (let i = 0; i < histories.length; i++) {
      const h = histories[i];
      if (!h || typeof h !== "object") continue;
      const sidRaw = String(h.supporterId == null ? "" : h.supporterId).trim();
      const hasUid = NUMERIC_UID_RE.test(sidRaw);
      let name = String(h.supporterName == null ? "" : h.supporterName).trim();
      if (!name) {
        if (hasUid) name = sidRaw;
        else continue;
      }
      const userId = hasUid ? sidRaw : `__anon_${name}`;
      const points = nonNegativeInt(h.point);
      const avatarUrl = sanitizeHttpUrl3(h.supporterThumbnailUrl);
      const ex = byKey.get(userId);
      if (ex) {
        ex.throwCount += 1;
        ex.totalPoints += points;
        if (avatarUrl) ex.avatarUrl = avatarUrl;
      } else {
        byKey.set(userId, {
          userId,
          nickname: name,
          throwCount: 1,
          totalPoints: points,
          capturedAt: now,
          ...avatarUrl ? { avatarUrl } : {}
        });
      }
    }
    if (byKey.size === 0) return null;
    return [...byKey.values()];
  }

  // src/lib/kokenGiftHistoryFetchClient.js
  function fetchKokenGiftHistoryViaExtension(liveId, opts = {}) {
    const lid = String(liveId || "").trim().toLowerCase();
    if (!/^lv\d{1,15}$/.test(lid)) return Promise.resolve(null);
    const timeoutMs = typeof opts.timeoutMs === "number" && opts.timeoutMs > 0 ? Math.trunc(opts.timeoutMs) : 1e4;
    const nextCursor = opts.nextCursor != null && Number.isFinite(Number(opts.nextCursor)) && Number(opts.nextCursor) > 0 ? Math.floor(Number(opts.nextCursor)) : null;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (v) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };
      const timer = setTimeout(() => finish(null), timeoutMs);
      try {
        chrome.runtime.sendMessage(
          {
            type: KOKEN_GIFT_HISTORY_FETCH_MESSAGE_TYPE,
            liveId: lid,
            ...nextCursor != null ? { nextCursor } : {}
          },
          (resp) => {
            clearTimeout(timer);
            try {
              if (chrome.runtime.lastError) {
                finish(null);
                return;
              }
              finish(resp && typeof resp === "object" ? (
                /** @type {KokenGiftHistoryFetchResponse} */
                resp
              ) : null);
            } catch {
              finish(null);
            }
          }
        );
      } catch {
        clearTimeout(timer);
        finish(null);
      }
    });
  }

  // src/lib/eventScoreRankingRelay.js
  var EVENT_SCORE_RANKING_STORAGE_PREFIX = "nls_event_score_ranking_";
  function eventScoreRankingStorageKey(liveId) {
    return EVENT_SCORE_RANKING_STORAGE_PREFIX + String(liveId == null ? "" : liveId).trim().toLowerCase();
  }

  // src/lib/eventRankingReportModel.js
  var EVENT_RANKING_REPORT_MAX_ROWS = 10;
  var EVENT_RANKING_REPORT_STALE_MS = 10 * 60 * 1e3;
  function posIntOrNull3(v) {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    const n = Math.trunc(v);
    return n > 0 ? n : null;
  }
  function nonNegIntOrNull(v) {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    const n = Math.trunc(v);
    return n >= 0 ? n : null;
  }
  function buildEventRankingReportModel(raw, opts = {}) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const obj = (
      /** @type {Record<string, unknown>} */
      raw
    );
    const nowMs = typeof opts.nowMs === "number" && Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
    const rawRows = Array.isArray(obj.rows) ? obj.rows : [];
    const rows = [];
    for (const r of rawRows) {
      if (!r || typeof r !== "object") continue;
      const row = (
        /** @type {Record<string, unknown>} */
        r
      );
      const rank = posIntOrNull3(row.rank);
      const score = nonNegIntOrNull(row.score);
      if (rank == null || score == null) continue;
      const name = String(row.name == null ? "" : row.name).replace(/\s+/g, " ").trim() || "名無し";
      const isAnonymous = row.isAnonymous === true || name === "名無し";
      const thumbnailUrl = safeHttpUrl(row.thumbnailUrl);
      const userId = String(row.userId == null ? "" : row.userId).trim();
      rows.push({
        rank,
        score,
        name,
        isAnonymous,
        thumbnailUrl,
        ...userId ? { userId } : {}
      });
    }
    rows.sort((a, b) => a.rank - b.rank);
    if (rows.length > EVENT_RANKING_REPORT_MAX_ROWS) {
      rows.length = EVENT_RANKING_REPORT_MAX_ROWS;
    }
    let self = null;
    const rawSelf = obj.selfStatus;
    if (rawSelf && typeof rawSelf === "object" && !Array.isArray(rawSelf)) {
      const s = (
        /** @type {Record<string, unknown>} */
        rawSelf
      );
      const rank = posIntOrNull3(s.rank);
      const score = nonNegIntOrNull(s.score);
      const diffToNext = nonNegIntOrNull(s.diffToNext);
      const broadcasterName = String(s.broadcasterName == null ? "" : s.broadcasterName).replace(/\s+/g, " ").trim();
      if (rank != null || score != null || broadcasterName) {
        self = { rank, score, diffToNext, broadcasterName };
      }
    }
    const eventName = String(
      rawSelf && typeof rawSelf === "object" && /** @type {any} */
      rawSelf.eventName || obj.eventName || ""
    ).replace(/\s+/g, " ").trim();
    const capturedAt = typeof obj.capturedAt === "number" && Number.isFinite(obj.capturedAt) ? obj.capturedAt : null;
    const ageMs = capturedAt != null ? Math.max(0, nowMs - capturedAt) : null;
    const isStale = ageMs != null && ageMs > EVENT_RANKING_REPORT_STALE_MS;
    if (rows.length === 0 && !self && !eventName) return null;
    return { eventName, self, rows, capturedAt, ageMs, isStale };
  }

  // src/lib/exportDownloadFilename.js
  var JST_TIME_ZONE = "Asia/Tokyo";
  function formatBroadcastDateYmdJst(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "unknown-date";
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: JST_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(new Date(n));
      const y = parts.find((p) => p.type === "year")?.value;
      const m = parts.find((p) => p.type === "month")?.value;
      const d = parts.find((p) => p.type === "day")?.value;
      if (y && m && d) return `${y}-${m}-${d}`;
    } catch {
    }
    return "unknown-date";
  }
  function sanitizeLiveIdForFilename(liveId) {
    const raw = String(liveId || "unknown").trim().toLowerCase();
    const safe = raw.replace(/[/\\:*?"<>|]/g, "").replace(/\.\./g, "").slice(0, 32);
    if (/^lv\d{1,15}$/.test(safe)) return safe;
    if (safe) return safe;
    return "unknown";
  }
  function commentCapturedAtMs(c) {
    const at = Number(c?.capturedAt);
    return Number.isFinite(at) && at > 0 ? at : null;
  }
  function resolveBroadcastStartMs(input = {}) {
    const comments = Array.isArray(input.comments) ? input.comments : [];
    let first = null;
    for (const c of comments) {
      const at = commentCapturedAtMs(c);
      if (at == null) continue;
      if (first == null || at < first) first = at;
    }
    if (first != null) return first;
    const snap = input.snapshot;
    if (snap && typeof snap === "object") {
      for (const key of ["startAtMs", "programStartAtMs"]) {
        const v = Number(
          /** @type {Record<string, unknown>} */
          snap[key]
        );
        if (Number.isFinite(v) && v > 0) return v;
      }
    }
    const now = Number(input.nowMs);
    return Number.isFinite(now) && now > 0 ? now : Date.now();
  }
  function buildMarketingReportDownloadFilename(liveId, opts = {}) {
    const lv = sanitizeLiveIdForFilename(liveId);
    const date = formatBroadcastDateYmdJst(resolveBroadcastStartMs(opts));
    return `${date}_${lv}_marketing.html`;
  }

  // src/lib/exportStageProfiler.js
  function createExportStageProfiler() {
    const startedAt = Date.now();
    let lastAt = startedAt;
    const rows = [];
    return {
      mark(stage) {
        const now = Date.now();
        const ms = Math.max(0, now - (lastAt ?? startedAt));
        rows.push({ stage: String(stage || "stage"), ms });
        lastAt = now;
      },
      finish(label = "export") {
        const total = Math.max(0, Date.now() - startedAt);
        const parts = rows.map((r) => `${r.stage} ${formatMsShort(r.ms)}`);
        const summary = parts.length > 0 ? `${label} ${parts.join(" · ")}（計 ${formatMsShort(total)}）` : `${label}（計 ${formatMsShort(total)}）`;
        return { rows: [...rows], summary };
      },
      rows: () => [...rows]
    };
  }
  function logExportStageProfileIfEnabled(label, rows) {
    try {
      if (typeof globalThis !== "undefined" && /** @type {{ __nlsExportProfile?: boolean }} */
      globalThis.__nlsExportProfile === true) {
        console.table(rows.map((r) => ({ stage: r.stage, ms: r.ms })));
        console.log(`[nls export] ${label}`, rows);
      }
    } catch {
    }
  }
  function formatMsShort(ms) {
    const n = Math.max(0, Math.round(Number(ms) || 0));
    if (n < 1e3) return `${n}ms`;
    const s = Math.round(n / 1e3 * 10) / 10;
    return `${s}s`;
  }

  // src/lib/reportCompleteVoice.js
  var REPORT_COMPLETE_VOICE_PATHS = Object.freeze([
    "sound/voice-complete.mp3",
    "sound/voice-watch.mp3"
  ]);
  var REPORT_COMPLETE_VOICE_GUARD_MS = 8e3;
  function shouldPlayReportCompleteVoice(lastAtMs, nowMs, guardMs = REPORT_COMPLETE_VOICE_GUARD_MS) {
    const last = Number(lastAtMs) || 0;
    const now = Number(nowMs) || 0;
    return now - last >= guardMs;
  }
  var _reportCompleteVoiceLastAt = 0;
  function playReportCompleteVoiceSequence(deps = {}) {
    try {
      const nowMs = typeof deps.nowMs === "number" ? deps.nowMs : Date.now();
      if (!shouldPlayReportCompleteVoice(_reportCompleteVoiceLastAt, nowMs)) return;
      _reportCompleteVoiceLastAt = nowMs;
      const getUrl = deps.getUrl || ((path) => typeof chrome !== "undefined" && chrome.runtime?.getURL ? chrome.runtime.getURL(path) : path);
      const audioFactory = deps.audioFactory || ((url) => new Audio(url));
      const playNext = (rest) => {
        if (!rest.length) return;
        try {
          const audio = audioFactory(getUrl(rest[0]));
          if (audio && typeof audio.volume === "number") audio.volume = 0.85;
          const next = () => playNext(rest.slice(1));
          audio.addEventListener("ended", next, { once: true });
          audio.addEventListener("error", next, { once: true });
          const p = audio.play && audio.play();
          if (p && typeof p.catch === "function") p.catch(next);
        } catch {
          playNext(rest.slice(1));
        }
      };
      playNext([...REPORT_COMPLETE_VOICE_PATHS]);
    } catch {
    }
  }

  // src/lib/reportSilentError.js
  function isContextInvalidatedError(err) {
    const msg = err && typeof err === "object" && "message" in err ? String(
      /** @type {{ message?: unknown }} */
      err.message || ""
    ) : String(err || "");
    return msg.includes("Extension context invalidated");
  }

  // src/lib/blobDownload.js
  function normalizeDownloadBasename(filename) {
    let base = String(filename || "download.html").replace(/\\/g, "/").split("/").pop() || "download.html";
    base = base.replace(/[/\\:*?"<>|]/g, "_").replace(/\.\./g, "").trim();
    if (!base) base = "download.html";
    if (!/\.\w{1,8}$/i.test(base)) base = `${base}.html`;
    return base.slice(0, 180);
  }
  function triggerAnchorBlobDownload(blob, filename, doc = document) {
    if (!blob || !doc?.body) {
      return { ok: false, blobUrl: "", safeName: normalizeDownloadBasename(filename) };
    }
    const safeName = normalizeDownloadBasename(filename);
    const blobUrl = URL.createObjectURL(blob);
    try {
      const a = doc.createElement("a");
      a.href = blobUrl;
      a.download = safeName;
      a.rel = "noopener";
      a.style.display = "none";
      doc.body.appendChild(a);
      a.click();
      a.remove();
      return { ok: true, blobUrl, safeName };
    } catch {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch {
      }
      return { ok: false, blobUrl: "", safeName };
    }
  }

  // src/lib/objectUrlRevokeQueue.js
  var DEFAULT_TIMEOUT_MS = 15e3;
  var DEFAULT_MAX_CONCURRENT = 3;
  function createObjectUrlRevokeQueue(opts = {}) {
    const timeoutMs = typeof opts?.timeoutMs === "number" && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
    const maxConcurrent = typeof opts?.maxConcurrent === "number" && opts.maxConcurrent > 0 ? Math.floor(opts.maxConcurrent) : DEFAULT_MAX_CONCURRENT;
    const revokeFn = typeof opts?.revoke === "function" ? opts.revoke : (
      /** @param {string} u */
      (u) => {
        try {
          URL.revokeObjectURL(u);
        } catch {
        }
      }
    );
    const scheduleFn = typeof opts?.schedule === "function" ? opts.schedule : setTimeout;
    const cancelFn = typeof opts?.cancel === "function" ? opts.cancel : clearTimeout;
    const queue = [];
    function enqueue(url, opts2 = {}) {
      if (!url) return;
      const delay = typeof opts2?.timeoutMs === "number" && opts2.timeoutMs > 0 ? Math.floor(opts2.timeoutMs) : timeoutMs;
      while (queue.length >= maxConcurrent) {
        const oldest = queue.shift();
        if (oldest?.timer != null) cancelFn(oldest.timer);
        if (oldest?.url) revokeFn(oldest.url);
      }
      const entry = { url, timer: null };
      entry.timer = scheduleFn(() => {
        const idx = queue.indexOf(entry);
        if (idx >= 0) queue.splice(idx, 1);
        revokeFn(entry.url);
      }, delay);
      queue.push(entry);
    }
    function flushAll() {
      while (queue.length > 0) {
        const e = queue.shift();
        if (e?.timer != null) cancelFn(e.timer);
        if (e?.url) revokeFn(e.url);
      }
    }
    function size() {
      return queue.length;
    }
    return { enqueue, flushAll, size };
  }

  // src/lib/pickCommentsForExport.js
  function pickCommentsForExport(full, memEntries, memMatchesLive) {
    const fullArr = Array.isArray(full) ? full : [];
    if (fullArr.length > 0) return fullArr;
    if (memMatchesLive && Array.isArray(memEntries) && memEntries.length > 0) {
      return memEntries;
    }
    return fullArr;
  }

  // src/lib/commentDb.js
  var COMMENT_DB_NAME = "nls_comment_db_v1";
  var COMMENT_DB_STORE = "comments";
  var COMMENT_DB_VERSION = 1;
  var COMMENT_DB_INDEX_BY_LIVE = "byLive";
  var COMMENT_DB_INDEX_BY_DKEY = "byDkey";
  function isCommentDbAvailable() {
    return typeof indexedDB !== "undefined";
  }
  function openCommentDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(COMMENT_DB_NAME, COMMENT_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(COMMENT_DB_STORE)) {
          const store = db.createObjectStore(COMMENT_DB_STORE, {
            keyPath: "id",
            autoIncrement: true
          });
          store.createIndex(COMMENT_DB_INDEX_BY_LIVE, "liveId", { unique: false });
          store.createIndex(COMMENT_DB_INDEX_BY_DKEY, "dkey", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function countCommentsForLive(db, liveId) {
    const lid = String(liveId || "").trim().toLowerCase();
    return new Promise((resolve, reject) => {
      if (!lid) {
        resolve(0);
        return;
      }
      const tx = db.transaction(COMMENT_DB_STORE, "readonly");
      const idx = tx.objectStore(COMMENT_DB_STORE).index(COMMENT_DB_INDEX_BY_LIVE);
      const req = idx.count(IDBKeyRange.only(lid));
      req.onsuccess = () => {
        const n = Number(req.result);
        resolve(Number.isFinite(n) && n >= 0 ? n : 0);
      };
      req.onerror = () => reject(req.error);
    });
  }
  function readAllCommentsForLive(db, liveId) {
    const lid = String(liveId || "").trim().toLowerCase();
    return new Promise((resolve, reject) => {
      if (!lid) {
        resolve([]);
        return;
      }
      const out = [];
      const tx = db.transaction(COMMENT_DB_STORE, "readonly");
      const idx = tx.objectStore(COMMENT_DB_STORE).index(COMMENT_DB_INDEX_BY_LIVE);
      const curReq = idx.openCursor(IDBKeyRange.only(lid));
      curReq.onsuccess = () => {
        const cursor = curReq.result;
        if (!cursor) {
          resolve(out);
          return;
        }
        out.push(
          /** @type {Record<string, unknown>} */
          cursor.value
        );
        cursor.continue();
      };
      curReq.onerror = () => reject(curReq.error);
    });
  }

  // src/lib/commentChunkStore.js
  var CHUNK_INDEX_VERSION = 1;
  function normLid(liveId) {
    return String(liveId || "").trim().toLowerCase();
  }
  function chunkStorageKey(liveId, seq) {
    return `nls_cchunk_${normLid(liveId)}_${Math.max(0, Math.floor(Number(seq) || 0))}`;
  }
  function chunkIndexKey(liveId) {
    return `nls_cchunk_index_${normLid(liveId)}`;
  }
  function isChunkIndex(obj, liveId) {
    if (!obj || typeof obj !== "object") return false;
    const o = (
      /** @type {Record<string, unknown>} */
      obj
    );
    if (Number(o.v) !== CHUNK_INDEX_VERSION) return false;
    if (!Array.isArray(o.seqs)) return false;
    if (!Number.isFinite(Number(o.total))) return false;
    if (liveId !== void 0 && normLid(
      /** @type {string} */
      o.liveId
    ) !== normLid(liveId)) {
      return false;
    }
    return true;
  }
  function chunkKeysFromIndex(liveId, index) {
    const seqs = Array.isArray(index?.seqs) ? index.seqs.slice() : [];
    seqs.sort((a, b) => a - b);
    return seqs.map((seq) => chunkStorageKey(liveId, seq));
  }
  async function readChunkedComments(liveId, mainKey, getMany) {
    const idxKey = chunkIndexKey(liveId);
    const idxBag = await getMany([idxKey]);
    const index = idxBag ? idxBag[idxKey] : null;
    if (isChunkIndex(index, liveId) && Array.isArray(
      /** @type {any} */
      index.seqs
    )) {
      const keys = chunkKeysFromIndex(
        liveId,
        /** @type {any} */
        index
      );
      if (keys.length === 0) {
        return { rows: [], fromChunks: true, index: (
          /** @type {object} */
          index
        ), complete: true };
      }
      const bag = await getMany(keys);
      let rows = [];
      let complete = true;
      for (const key of keys) {
        const part = bag ? bag[key] : null;
        if (Array.isArray(part)) rows = rows.concat(part);
        else complete = false;
      }
      const expectedTotal = Math.max(0, Math.floor(Number(
        /** @type {any} */
        index.total
      ) || 0));
      if (complete && expectedTotal > 0 && rows.length < expectedTotal) complete = false;
      return { rows, fromChunks: true, index: (
        /** @type {object} */
        index
      ), complete };
    }
    const mainBag = await getMany([mainKey]);
    const main = mainBag ? mainBag[mainKey] : null;
    return {
      rows: Array.isArray(main) ? main : [],
      fromChunks: false,
      index: null,
      complete: Array.isArray(main) || main == null
    };
  }

  // src/shared/avatar/clampAvatarUrl.js
  var AVATAR_URL_DEFAULT_MAX = 2e3;
  function clampAvatarUrl(raw, max = AVATAR_URL_DEFAULT_MAX) {
    if (typeof raw !== "string") return "";
    const s = raw.trim();
    if (!s) return "";
    const cap = Math.floor(Number(max));
    if (!Number.isFinite(cap) || cap <= 0) return "";
    return s.length <= cap ? s : s.slice(0, cap);
  }

  // src/lib/userCommentProfileCache.js
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
      const av = clampAvatarUrl(o.avatarUrl);
      const avatarUrl = av && isHttpOrHttpsUrl(av) && !isWeakNiconicoUserIconHttpUrl(av) ? av : "";
      if (!nick && !avatarUrl) continue;
      out[uid] = {
        updatedAt,
        ...nick ? { nickname: nick } : {},
        ...avatarUrl ? { avatarUrl } : {}
      };
    }
    return out;
  }
  async function readStorageBagWithRetry(readFn, opts = {}) {
    const attempts = Math.max(1, Math.min(Number(opts.attempts) || 4, 8));
    const delays = Array.isArray(opts.delaysMs) && opts.delaysMs.length ? opts.delaysMs : [0, 50, 120, 280];
    const rawTimeout = Number(opts.perAttemptTimeoutMs);
    const perAttemptTimeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : rawTimeout === Infinity ? Infinity : 2e3;
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
        const bag = perAttemptTimeoutMs === Infinity ? await readFn() : await (async () => {
          let timer = null;
          const TIMED_OUT = /* @__PURE__ */ Symbol("storage_read_attempt_timeout");
          try {
            const result = await Promise.race([
              readFn(),
              new Promise((resolve) => {
                timer = setTimeout(() => resolve(TIMED_OUT), perAttemptTimeoutMs);
              })
            ]);
            if (result === TIMED_OUT) {
              return void 0;
            }
            return result;
          } finally {
            if (timer != null) clearTimeout(timer);
          }
        })();
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

  // src/lib/commentRecord.js
  var COMMENT_TEXT_MAX_CHARS = 1e3;
  function normalizeCommentText(value) {
    return String(value || "").replace(/\r\n/g, "\n").split("\n").map((l) => l.trim()).join("\n").trim().slice(0, COMMENT_TEXT_MAX_CHARS);
  }

  // src/lib/commentTailBuffer.js
  function tailStorageKey(liveId) {
    const id = String(liveId || "").trim().toLowerCase();
    return `nls_ctail_${id}`;
  }

  // src/lib/anonymousIdenticon.js
  function hashString(str3) {
    let h = 2166136261;
    for (let i = 0; i < str3.length; i += 1) {
      h ^= str3.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  var LINE = "#332a26";
  var SKIN_TONES = ["#ffeede", "#ffe6cf", "#fdf0e4", "#f8dfc8"];
  var HAIR_COLORS = [
    ["#f29b38", "#ffc97e"],
    ["#3a3534", "#6b6360"],
    ["#8a5a2b", "#c08c50"],
    ["#e88bb1", "#ffc3da"],
    ["#5b87c5", "#9cc0ea"],
    ["#7aa45a", "#b4d59a"],
    ["#e9c25a", "#ffe6a0"],
    ["#d4543a", "#f59679"],
    ["#8d6bb0", "#c4a8e0"],
    ["#8f8f8f", "#c9c9c9"],
    ["#4ba596", "#92d5c9"],
    ["#a4683f", "#d49a6e"]
  ];
  var EYES = [
    // ぱっちり（白目+2色虹彩+ハイライト2つ）
    (iris, irisDark) => `<ellipse cx="23.5" cy="37" rx="5" ry="6.6" fill="#fff" stroke="${LINE}" stroke-width="2.2"/><ellipse cx="40.5" cy="37" rx="5" ry="6.6" fill="#fff" stroke="${LINE}" stroke-width="2.2"/><ellipse cx="23.5" cy="38" rx="3.2" ry="4.4" fill="${irisDark}"/><ellipse cx="40.5" cy="38" rx="3.2" ry="4.4" fill="${irisDark}"/><ellipse cx="23.5" cy="39.2" rx="2" ry="2.6" fill="${iris}"/><ellipse cx="40.5" cy="39.2" rx="2" ry="2.6" fill="${iris}"/><circle cx="22" cy="35.4" r="1.6" fill="#fff"/><circle cx="39" cy="35.4" r="1.6" fill="#fff"/><circle cx="25.2" cy="40.2" r="0.8" fill="#fff" opacity="0.9"/><circle cx="42.2" cy="40.2" r="0.8" fill="#fff" opacity="0.9"/>`,
    // にこにこ閉じ目（∩・太線）
    () => `<path d="M18.5 38 q5 -6.5 10 0" stroke="${LINE}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M35.5 38 q5 -6.5 10 0" stroke="${LINE}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    // ジト目（まぶた直線+下半分の虹彩）
    (iris, irisDark) => `<path d="M18.5 35 l10 0" stroke="${LINE}" stroke-width="2.8" stroke-linecap="round"/><path d="M35.5 35 l10 0" stroke="${LINE}" stroke-width="2.8" stroke-linecap="round"/><path d="M20.5 35.8 a3.6 4 0 0 0 7.2 0 z" fill="${irisDark}"/><path d="M37.5 35.8 a3.6 4 0 0 0 7.2 0 z" fill="${irisDark}"/><path d="M22 35.8 a2 2.2 0 0 0 4 0 z" fill="${iris}"/><path d="M39 35.8 a2 2.2 0 0 0 4 0 z" fill="${iris}"/>`
  ];
  var MOUTHS = [
    () => `<path d="M27.5 46.5 q2.3 2.6 4.5 0 q2.2 2.6 4.5 0" stroke="${LINE}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
    () => `<path d="M27 46 a5 4.6 0 0 0 10 0 z" fill="#9e3a30" stroke="${LINE}" stroke-width="1.8"/><path d="M29.5 49.2 a2.6 1.8 0 0 1 5 0 z" fill="#e9756a"/>`,
    () => `<path d="M27 46 q5 4.4 10 0" stroke="${LINE}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
  ];
  var HAIRS = [
    // ボブ+ぱっつんギザ（りんく系）
    (c, hi) => `<path d="M8 44 q-2 -26 24 -28 q26 2 24 28 l-5 3 q3 -8 1 -14 l-3 6 -3 -8 -4 6 -4 -8 -3 7 -4 -7 -4 8 -4 -6 -3 8 -3 -6 q-2 6 1 14 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/><path d="M14 24 q8 -7 18 -7 q10 0 18 7 q-8 -3 -18 -3 q-10 0 -18 3 z" fill="${hi}" opacity="0.85"/>`,
    // 外はねショート（こんた系）
    (c, hi) => `<path d="M9 42 q-7 -4 -3 -10 q-6 -2 0 -8 q2 -12 26 -12 q24 0 26 12 q6 6 0 8 q4 6 -3 10 l-4 1 q2 -6 0 -10 l-4 5 -3 -9 -5 6 -5 -9 -4 8 -5 -7 -4 9 -4 -5 q-2 4 0 10 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/><path d="M15 22 q8 -6 17 -6 q9 0 17 6 q-8 -2.5 -17 -2.5 q-9 0 -17 2.5 z" fill="${hi}" opacity="0.85"/>`,
    // ロング風（たぬ姉系・髪が顔の横を流れ落ちる）
    (c, hi) => `<path d="M10 58 q-4 -18 -2 -30 q4 -14 24 -14 q20 0 24 14 q2 12 -2 30 l-6 -2 q3 -12 2 -22 l-4 6 -3 -9 -5 6 -4 -9 -4 8 -5 -7 -4 8 -4 -5 q-1 10 2 22 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/><path d="M15 23 q8 -6 17 -6 q9 0 17 6 q-8 -2.5 -17 -2.5 q-9 0 -17 2.5 z" fill="${hi}" opacity="0.85"/>`,
    // ふんわりマッシュ
    (c, hi) => `<path d="M8 40 q-2 -25 24 -25 q26 0 24 25 q-1 5 -5 6 q2 -5 1 -9 l-4 5 -3 -7 -5 5 -4 -7 -4 6 -4 -6 -4 7 -5 -5 -3 7 -4 -5 q-1 4 1 9 q-4 -1 -5 -6 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/><path d="M14 24 q9 -6.5 18 -6.5 q9 0 18 6.5 q-9 -3 -18 -3 q-9 0 -18 3 z" fill="${hi}" opacity="0.85"/>`
  ];
  var ACCENTS = [
    (c) => `<path d="M32 16 q-2 -8 4 -11 q-1 5 1 7 q3 -3 7 -2 q-5 2 -6 7 z" fill="${c}" stroke="${LINE}" stroke-width="2" stroke-linejoin="round"/>`,
    (c) => `<path d="M13 26 q-3 -12 3 -16 q6 3 7 13 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/><path d="M51 26 q3 -12 -3 -16 q-6 3 -7 13 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/><path d="M15.5 24 q-1.5 -7 1.5 -10 q3 2 4 8 z" fill="#fff" opacity="0.75"/><path d="M48.5 24 q1.5 -7 -1.5 -10 q-3 2 -4 8 z" fill="#fff" opacity="0.75"/>`,
    () => ""
  ];
  function shade(hex, f) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return "#5a4636";
    const c = (x) => Math.max(0, Math.min(255, Math.floor(parseInt(x, 16) * f)));
    return `rgb(${c(m[1])},${c(m[2])},${c(m[3])})`;
  }
  var IDENTICON_CACHE_MAX = 2e3;
  var identiconCache = /* @__PURE__ */ new Map();
  function anonymousIdenticonDataUrl(userId, sizePx = 64) {
    const s = String(userId || "").trim();
    if (!s) return "";
    const n = Math.max(16, Math.min(128, Number(sizePx) || 64));
    const cacheKey = `${n}|${s}`;
    const hit = identiconCache.get(cacheKey);
    if (hit !== void 0) {
      identiconCache.delete(cacheKey);
      identiconCache.set(cacheKey, hit);
      return hit;
    }
    const h = hashString(s);
    const hue = (h >>> 15) % 360;
    const bg = `hsl(${hue},55%,90%)`;
    const skin = SKIN_TONES[h % SKIN_TONES.length];
    const [hairC, hairHi] = HAIR_COLORS[(h >>> 3) % HAIR_COLORS.length];
    const iris = shade(hairC, 0.9);
    const irisDark = shade(hairC, 0.45);
    const eyes = EYES[(h >>> 7) % EYES.length];
    const mouth = MOUTHS[(h >>> 10) % MOUTHS.length];
    const hairShape = HAIRS[(h >>> 12) % HAIRS.length];
    const accent = ACCENTS[(h >>> 21) % ACCENTS.length];
    const blushStrong = (h >>> 20 & 1) === 1;
    const blush = `<ellipse cx="17" cy="44" rx="4.4" ry="2.6" fill="#ff9d9d" opacity="${blushStrong ? 0.8 : 0.45}"/><ellipse cx="47" cy="44" rx="4.4" ry="2.6" fill="#ff9d9d" opacity="${blushStrong ? 0.8 : 0.45}"/>`;
    const k = n / 64;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}"><rect width="100%" height="100%" fill="${bg}"/><g transform="scale(${k})">` + accent(hairC) + `<path d="M13 38 a19 19 0 1 0 38 0 a19 21 0 0 0 -38 0 z" fill="${skin}" stroke="${LINE}" stroke-width="2.2"/>` + hairShape(hairC, hairHi) + blush + eyes(iris, irisDark) + mouth() + `</g></svg>`;
    const out = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    identiconCache.set(cacheKey, out);
    while (identiconCache.size > IDENTICON_CACHE_MAX) {
      const oldest = identiconCache.keys().next().value;
      if (oldest === void 0) break;
      identiconCache.delete(oldest);
    }
    return out;
  }

  // src/lib/exportWaitNarration.js
  var EXPORT_WAIT_LINES_HTML = Object.freeze([
    Object.freeze({ who: "link", name: "りんく", text: "コメントを整理して、ページに載せてるよ！" }),
    Object.freeze({ who: "konta", name: "こん太", text: "みんなの応援を、きれいなレポートにまとめ中〜" }),
    Object.freeze({ who: "tanunee", name: "たぬ姉", text: "数字や表も、いま組み立てているわ" }),
    Object.freeze({ who: "link", name: "りんく", text: "コメントが多いと、少しだけ時間がかかるよ" }),
    Object.freeze({ who: "konta", name: "こん太", text: "もうちょっとだけ待っててね…がんばるよ！" }),
    Object.freeze({ who: "tanunee", name: "たぬ姉", text: "ゆっくりで大丈夫。ちゃんと仕上げるわ" })
  ]);
  var EXPORT_WAIT_LINES_MARKETING = Object.freeze([
    Object.freeze({ who: "link", name: "りんく", text: "マーケ分析のグラフを準備してるよ！" }),
    Object.freeze({ who: "konta", name: "こん太", text: "来てくれた人のデータ、集計してる〜" }),
    Object.freeze({ who: "tanunee", name: "たぬ姉", text: "傾向やランキングをまとめているわ" }),
    Object.freeze({ who: "link", name: "りんく", text: "過去の配信と比べる準備もしてるよ" }),
    Object.freeze({ who: "konta", name: "こん太", text: "がんばってるから、あと少し待って！" }),
    Object.freeze({ who: "tanunee", name: "たぬ姉", text: "重いときは時間がかかるの、ごめんね" })
  ]);
  function resolveHtmlReportBuildTimeoutMs(commentCount) {
    const n = Math.max(0, Number(commentCount) || 0);
    if (n <= 2500) return 9e4;
    return Math.min(3e5, 9e4 + Math.floor((n - 2500) * 12));
  }
  function exportWaitLinesForKind(kind) {
    return kind === "marketing" ? EXPORT_WAIT_LINES_MARKETING : EXPORT_WAIT_LINES_HTML;
  }

  // src/lib/storedCommentDedupeKey.js
  var DEDUPE_TIME_BUCKET_MS = 10 * 60 * 1e3;
  function storedCommentDedupeKey(entry, opts) {
    const e = entry && typeof entry === "object" ? entry : {};
    const no = String(e.commentNo ?? "").trim();
    if (/^\d+$/.test(no)) return `no:${no}`;
    const liveId = String(e.liveId ?? "").trim().toLowerCase();
    const text = normalizeCommentText(e.text ?? "");
    const userId = String(e.userId ?? "").trim();
    const bucketMs = Number.isFinite(Number(opts?.bucketMs)) && Number(opts?.bucketMs) > 0 ? Number(opts?.bucketMs) : DEDUPE_TIME_BUCKET_MS;
    const cap = toEpochMs(e.capturedAt);
    const bucket = cap > 0 ? Math.floor(cap / bucketMs) : 0;
    return `t:${liveId}|${userId}|${text}|${bucket}`;
  }

  // src/lib/storedCommentDedupeMerge.js
  function storyCommentTextPenalty(text) {
    const s = normalizeCommentText(text).replace(/\n+/g, " ").trim();
    if (!s) return Number.POSITIVE_INFINITY;
    const numberedTokens = s.match(/(?:^|[\s\u3000])\d{3,9}(?=\s+\S)/g)?.length || 0;
    return s.length + Math.max(0, numberedTokens - 1) * 240;
  }
  function mergeStoredCommentDedupeVariants(prev, next) {
    const prevText = normalizeCommentText(prev.text);
    const nextText = normalizeCommentText(next.text);
    const preferNextText = Boolean(nextText) && storyCommentTextPenalty(nextText) < storyCommentTextPenalty(prevText);
    const userId = String(next.userId || "").trim() || String(prev.userId || "").trim() || null;
    const nickname = String(next.nickname || "").trim() || String(prev.nickname || "").trim() || "";
    const avatarUrl = String(next.avatarUrl || "").trim() || String(prev.avatarUrl || "").trim() || "";
    const selfPosted = Boolean(prev.selfPosted) || Boolean(next.selfPosted);
    const avatarObserved = Boolean(prev.avatarObserved) || Boolean(next.avatarObserved);
    return {
      ...prev,
      ...preferNextText ? { text: nextText || prevText } : {},
      ...userId ? { userId } : { userId: null },
      ...nickname ? { nickname } : {},
      ...avatarUrl ? { avatarUrl } : {},
      ...selfPosted ? { selfPosted: true } : {},
      ...avatarObserved ? { avatarObserved: true } : {}
    };
  }

  // src/lib/mergeTailRowsIntoDisplay.js
  var LOOKBACK_EXTRA = 64;
  function mergeTailRowsIntoDisplay(base, tail, opts) {
    const baseRows = Array.isArray(base) ? base : [];
    const tailRows = Array.isArray(tail) ? tail : [];
    if (tailRows.length === 0) return baseRows;
    if (baseRows.length === 0) return tailRows.slice();
    const lid = String(opts && opts.liveId || "").trim().toLowerCase();
    const keyOf = opts && typeof opts.keyOf === "function" ? opts.keyOf : (
      /** @param {any} row */
      (row) => storedCommentDedupeKey(row && typeof row === "object" && !row.liveId && lid ? { ...row, liveId: lid } : row)
    );
    const from = Math.max(0, baseRows.length - (tailRows.length * 2 + LOOKBACK_EXTRA));
    const indexByKey = /* @__PURE__ */ new Map();
    for (let i = from; i < baseRows.length; i += 1) {
      const r = baseRows[i];
      if (!r || typeof r !== "object") continue;
      indexByKey.set(keyOf(r), i);
    }
    const out = baseRows.slice();
    for (const row of tailRows) {
      if (!row || typeof row !== "object") {
        out.push(row);
        continue;
      }
      const hit = indexByKey.get(keyOf(row));
      if (hit == null) {
        out.push(row);
        continue;
      }
      out[hit] = /** @type {any} */
      mergeStoredCommentDedupeVariants(
        /** @type {Record<string, unknown>} */
        out[hit],
        /** @type {Record<string, unknown>} */
        row
      );
    }
    return out;
  }

  // src/extension/marketing-export-entry.js
  function liveIdFromUrl() {
    try {
      const lv = String(new URLSearchParams(location.search).get("lv") || "").trim().toLowerCase();
      return /^lv\d{1,15}$/.test(lv) ? lv : "";
    } catch {
      return "";
    }
  }
  async function withTimeout(promise, ms, timeoutCode = "timeout") {
    let timer = null;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(timeoutCode)), ms);
        })
      ]);
    } finally {
      if (timer != null) clearTimeout(timer);
    }
  }
  function yieldToBrowserPaint() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve(void 0));
      });
    });
  }
  async function readAllCommentsFromCommentDb(lv) {
    if (!isCommentDbAvailable()) return null;
    let db = null;
    try {
      db = await openCommentDb();
      const cnt = await countCommentsForLive(db, lv);
      if (cnt <= 0) return null;
      return await readAllCommentsForLive(db, lv);
    } catch {
      return null;
    } finally {
      try {
        if (db) db.close();
      } catch {
      }
    }
  }
  async function readAllCommentsForLive2(lv) {
    const fromDb = await readAllCommentsFromCommentDb(lv);
    if (Array.isArray(fromDb) && fromDb.length) return fromDb;
    const mainKey = commentsStorageKey(lv);
    let rows = [];
    try {
      const res = await readChunkedComments(
        lv,
        mainKey,
        (keys) => readStorageBagWithRetry(() => chrome.storage.local.get(keys), {
          attempts: 3,
          delaysMs: [0, 80, 200],
          perAttemptTimeoutMs: 1200
        })
      );
      rows = Array.isArray(res.rows) ? res.rows : [];
    } catch {
      rows = [];
    }
    try {
      const tKey = tailStorageKey(lv);
      const tailBag = await readStorageBagWithRetry(() => chrome.storage.local.get([tKey]), {
        attempts: 2,
        delaysMs: [0, 120],
        perAttemptTimeoutMs: 900
      });
      const tail = (
        /** @type {Record<string, unknown>} */
        tailBag[tKey]
      );
      if (Array.isArray(tail) && tail.length) rows = mergeTailRowsIntoDisplay(rows, tail, { liveId: lv });
    } catch {
    }
    return rows;
  }
  async function resolveCommentsForHtmlExport(liveId) {
    const full = await readAllCommentsForLive2(liveId);
    return (
      /** @type {import('../lib/commentRecord.js').StoredComment[]} */
      pickCommentsForExport(full, [], false)
    );
  }
  async function readOfficialEventDomBundleFromStorage(liveId) {
    const lid = String(liveId || "").trim().toLowerCase();
    if (!lid) return null;
    try {
      const key = eventDomStorageKey(lid);
      const adKey = `nls_nicoad_ranking_${lid}`;
      const adApiKey = `nls_nicoad_api_ranking_${lid}`;
      const bag = (
        /** @type {Record<string, any>} */
        await chrome.storage.local.get([key, adKey, adApiKey])
      );
      const v = bag?.[key];
      let bundle = v && typeof v === "object" && !Array.isArray(v) ? (
        /** @type {import('../lib/officialEventDomBundle.js').OfficialEventDomBundle} */
        v
      ) : null;
      const adApiVal = bag?.[adApiKey];
      const apiRows = adApiVal && typeof adApiVal === "object" && String(adApiVal.liveId || "").trim().toLowerCase() === lid && Array.isArray(adApiVal.rows) && adApiVal.rows.length > 0 ? adApiVal.rows : null;
      const adVal = bag?.[adKey];
      const scrapeRows = adVal && typeof adVal === "object" && Array.isArray(adVal.ranking) && adVal.ranking.length > 0 ? adVal.ranking : null;
      const adRows = apiRows || scrapeRows;
      if (adRows && bundle) {
        bundle = { ...bundle, adContributionRanking: adRows };
      } else if (adRows && !bundle) {
        bundle = /** @type {any} */
        { adContributionRanking: adRows };
      }
      return bundle;
    } catch {
      return null;
    }
  }
  function mergeBroadcasterProfileRaw(snapshot, stored) {
    const snap = snapshot && typeof snapshot === "object" ? (
      /** @type {any} */
      snapshot
    ) : {};
    const st = stored && typeof stored === "object" ? (
      /** @type {any} */
      stored
    ) : {};
    return {
      broadcasterUserId: st.broadcasterUserId || snap.broadcasterUserId || "",
      broadcasterName: st.broadcasterName || snap.broadcasterName || "",
      broadcasterIconUrl: st.broadcasterIconUrl || snap.broadcasterIconUrl || "",
      ...st
    };
  }
  function fetchBroadcasterProfileFresh(uid) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 6e3);
      try {
        chrome.runtime.sendMessage({ type: NICO_USER_PROFILE_FETCH_MESSAGE_TYPE, uid, force: true }, (r) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError || !r || r.ok !== true || r.json == null) return resolve(null);
          try {
            resolve(normalizeNicoUserProfileResponse(r.json));
          } catch {
            resolve(null);
          }
        });
      } catch {
        clearTimeout(timer);
        resolve(null);
      }
    });
  }
  async function resolveBroadcasterProfileModel(snapshot, liveId) {
    const lid = String(liveId || "").trim().toLowerCase();
    let stored = null;
    try {
      if (lid) {
        const key = broadcasterProfileStorageKey(lid);
        const bag = (
          /** @type {Record<string, any>} */
          await chrome.storage.local.get(key)
        );
        stored = bag?.[key] || null;
      }
    } catch {
      stored = null;
    }
    const raw = mergeBroadcasterProfileRaw(snapshot, stored);
    const uid = String(raw.broadcasterUserId || "").trim();
    if (/^\d{1,18}$/.test(uid)) {
      const api = await fetchBroadcasterProfileFresh(uid);
      if (api) {
        if (api.nickname) raw.nickname = api.nickname;
        if (api.avatarUrl) raw.avatarUrl = api.avatarUrl;
        if (api.level != null) raw.level = api.level;
        if (api.isPremium != null) raw.isPremium = api.isPremium;
        if (api.followeeCount != null) raw.followeeCount = api.followeeCount;
        if (api.followerCount != null) raw.followerCount = api.followerCount;
        if (api.description) raw.description = api.description;
        if (api.sns) raw.sns = api.sns;
        if (api.levelExp) raw.levelExp = api.levelExp;
      }
    }
    return normalizeBroadcasterProfileModel(raw);
  }
  var anonymousIdenticonRuntimeEnabled = true;
  var anonymousIdenticonDataUrlCache = /* @__PURE__ */ new Map();
  var ANON_IDENTICON_CACHE_MAX = 256;
  function getCachedAnonymousIdenticonDataUrl(userId) {
    if (!anonymousIdenticonRuntimeEnabled) return "";
    const u = String(userId || "").trim();
    if (!u || !isAnonymousStyleNicoUserId(u)) return "";
    const hit = anonymousIdenticonDataUrlCache.get(u);
    if (hit) return hit;
    const gen = anonymousIdenticonDataUrl(u);
    if (gen) {
      anonymousIdenticonDataUrlCache.set(u, gen);
      if (anonymousIdenticonDataUrlCache.size > ANON_IDENTICON_CACHE_MAX) {
        const oldestKey = anonymousIdenticonDataUrlCache.keys().next().value;
        if (oldestKey) anonymousIdenticonDataUrlCache.delete(oldestKey);
      }
    }
    return gen;
  }
  var exportBlobRevokeQueue = createObjectUrlRevokeQueue({ timeoutMs: 12e4 });
  async function downloadBlobViaChromeDownloads(blob, filename) {
    const anchorRes = triggerAnchorBlobDownload(blob, filename, document);
    if (anchorRes.ok && anchorRes.blobUrl) {
      exportBlobRevokeQueue.enqueue(anchorRes.blobUrl);
      return;
    }
    const blobUrl = URL.createObjectURL(blob);
    try {
      await chrome.downloads.download({
        url: blobUrl,
        filename: anchorRes.safeName || filename,
        saveAs: false,
        conflictAction: "uniquify"
      });
    } catch {
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = anchorRes.safeName || filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    exportBlobRevokeQueue.enqueue(blobUrl);
  }
  function buildHtmlReportDeps(snapshot) {
    return {
      readOfficialEventDomBundleFromStorage,
      resolveBroadcasterProfileModel,
      withTimeout,
      readAllCommentsForLive: readAllCommentsForLive2,
      yieldToBrowserPaint,
      getCachedAnonymousIdenticonDataUrl,
      watchMetaSnapshot: snapshot,
      inlinePassive: false
    };
  }
  var waitCharCycleTimer = null;
  var waitCycleIdx = 0;
  function applyWaitLine(line) {
    if (!line) return;
    for (const who of ["link", "konta", "tanunee"]) {
      const row = document.querySelector(`.mkt-wait-row[data-who="${who}"]`);
      const textEl = document.querySelector(`[data-wait-text="${who}"]`);
      if (row instanceof HTMLElement) row.classList.toggle("is-speaking", who === line.who);
      if (textEl instanceof HTMLElement && who === line.who) textEl.textContent = line.text;
    }
  }
  function startWaitCharCycle() {
    const lines = exportWaitLinesForKind("marketing");
    if (!lines.length) return;
    waitCycleIdx = 0;
    applyWaitLine(lines[0]);
    waitCharCycleTimer = setInterval(() => {
      waitCycleIdx = (waitCycleIdx + 1) % lines.length;
      applyWaitLine(lines[waitCycleIdx]);
    }, 2600);
  }
  function stopWaitCharCycle() {
    if (waitCharCycleTimer != null) {
      clearInterval(waitCharCycleTimer);
      waitCharCycleTimer = null;
    }
  }
  function setWaitStageText(text, progressPct) {
    const el = document.getElementById("mktWaitStageText");
    if (el) el.textContent = text;
    if (typeof progressPct === "number") {
      const fill = document.getElementById("mktWaitProgressFill");
      if (fill) fill.style.width = `${Math.max(0, Math.min(100, progressPct))}%`;
    }
  }
  function showDoneStage(text) {
    stopWaitCharCycle();
    const wait = document.getElementById("mktWaitStage");
    const done = document.getElementById("mktDoneStage");
    const doneText = document.getElementById("mktDoneText");
    if (wait) wait.style.display = "none";
    if (doneText) doneText.textContent = text;
    if (done) done.classList.add("is-visible");
  }
  function showErrorStage(text, showRetry) {
    stopWaitCharCycle();
    const wait = document.getElementById("mktWaitStage");
    const err = document.getElementById("mktErrorStage");
    const errText = document.getElementById("mktErrorText");
    const retryBtn = (
      /** @type {HTMLButtonElement|null} */
      document.getElementById("mktRetryBtn")
    );
    if (wait) wait.style.display = "none";
    if (errText) errText.textContent = text;
    if (retryBtn) {
      retryBtn.hidden = !showRetry;
      retryBtn.onclick = () => {
        err?.classList.remove("is-visible");
        if (wait) wait.style.display = "flex";
        void runExport(liveIdFromUrl());
      };
    }
    if (err) err.classList.add("is-visible");
  }
  async function runExport(lid) {
    if (!lid) {
      showErrorStage("URLに ?lv=lv×××××× が指定されていません。\n拡張のポップアップから開き直してください。");
      return;
    }
    try {
      const identiconEnabledBag = await chrome.storage.local.get(KEY_ANONYMOUS_IDENTICON_ENABLED);
      if (identiconEnabledBag && KEY_ANONYMOUS_IDENTICON_ENABLED in identiconEnabledBag) {
        anonymousIdenticonRuntimeEnabled = identiconEnabledBag[KEY_ANONYMOUS_IDENTICON_ENABLED] !== false;
      }
    } catch {
    }
    const snapKey = watchSnapshotStorageKey(lid);
    let snapshot = null;
    try {
      const bag = (
        /** @type {Record<string, any>} */
        await chrome.storage.local.get(snapKey)
      );
      snapshot = bag?.[snapKey] || null;
    } catch {
      snapshot = null;
    }
    const mktProf = createExportStageProfiler();
    setWaitStageText("分析中… (1/3) データ取得", 10);
    try {
      await yieldToBrowserPaint();
      const gKey = giftUsersStorageKey(lid);
      const giftEventsKey = `nls_gift_events_${lid}`;
      const giftThrowsKey = giftHistoryThrowsStorageKey(lid);
      const giftSubKey = giftSubAppHistoryStorageKey(lid);
      const adObsKey = adObservationStorageKey(lid);
      const [commentsRaw, data] = (
        /** @type {[unknown, Record<string, any>]} */
        await withTimeout(
          Promise.all([
            resolveCommentsForHtmlExport(lid),
            chrome.storage.local.get([gKey, giftEventsKey, giftThrowsKey, giftSubKey, adObsKey])
          ]),
          3e4,
          "marketing_storage_timeout"
        )
      );
      const comments = (
        /** @type {import('../lib/commentRecord.js').StoredComment[]} */
        Array.isArray(commentsRaw) ? commentsRaw : []
      );
      const giftUsersForMarketing = Array.isArray(data[gKey]) ? data[gKey] : [];
      const giftEventsForMarketing = Array.isArray(data[giftEventsKey]) ? data[giftEventsKey] : [];
      const giftHistoryThrowsForMarketing = Array.isArray(data[giftThrowsKey]) ? data[giftThrowsKey] : [];
      const giftSubAppHistoryRaw = data[giftSubKey] && typeof data[giftSubKey] === "object" ? data[giftSubKey] : null;
      if (comments.length === 0) {
        showErrorStage("コメントが0件です。\nこのタブは閉じて大丈夫です。");
        return;
      }
      mktProf.mark("read");
      const heavyMkt = comments.length > HTML_REPORT_HEAVY_COMMENT_THRESHOLD;
      const reportBroadcasterUid = String(snapshot?.broadcasterUserId || "").trim();
      setWaitStageText("分析中… (2/3) 集計・画像準備", 35);
      await yieldToBrowserPaint();
      const report = aggregateMarketingReport(comments, lid, { broadcasterUserId: reportBroadcasterUid });
      mktProf.mark("aggregate");
      const [
        ,
        sessionSummaryRows,
        pastBroadcasts,
        bundleForMkt,
        yukkuriImageMapForMkt,
        eventRankingForMkt,
        kokenGiftResp,
        broadcasterProfileForMkt
      ] = await Promise.all([
        attachCommenterFollowToReport(report, lid, { cacheOnly: true }, buildHtmlReportDeps(snapshot)),
        (async () => {
          try {
            const db = await openBroadcastSessionSummaryDb();
            return await listBroadcastSessionSummaryForLive(db, lid, 200);
          } catch {
            return [];
          }
        })(),
        (async () => {
          if (heavyMkt) return [];
          try {
            const sumDb = await openBroadcastSessionSummaryDb();
            const pastLimit = comments.length > 8e3 ? 4 : 8;
            const recentLiveIds = await listRecentUniqueBroadcastLiveIds(sumDb, {
              limit: pastLimit,
              excludeLiveId: lid
            });
            if (!recentLiveIds.length) return [];
            const pastArrays = await Promise.all(recentLiveIds.map((id) => readAllCommentsForLive2(id)));
            const out = [];
            for (let i = 0; i < recentLiveIds.length; i += 1) {
              const cs = (
                /** @type {import('../lib/commentRecord.js').StoredComment[]} */
                Array.isArray(pastArrays[i]) ? pastArrays[i] : []
              );
              if (cs.length) out.push({ liveId: recentLiveIds[i], comments: cs });
            }
            return out;
          } catch {
            return [];
          }
        })(),
        readOfficialEventDomBundleFromStorage(lid),
        buildYukkuriImageDataUrlMap(),
        (async () => {
          try {
            const lidLc = String(lid || "").trim().toLowerCase();
            if (!/^lv\d{1,15}$/.test(lidLc)) return null;
            const ek = eventScoreRankingStorageKey(lidLc);
            const bag = (
              /** @type {Record<string, any>} */
              await chrome.storage.local.get(ek).catch(() => ({}))
            );
            return bag && bag[ek] ? buildEventRankingReportModel(bag[ek], { nowMs: Date.now() }) : null;
          } catch {
            return null;
          }
        })(),
        (async () => {
          try {
            return await Promise.race([
              fetchKokenGiftHistoryViaExtension(lid),
              new Promise((_, reject) => {
                setTimeout(() => reject(new Error("koken_fetch_timeout")), 5e3);
              })
            ]);
          } catch {
            return null;
          }
        })(),
        resolveBroadcasterProfileModel(snapshot, lid)
      ]);
      mktProf.mark("parallel_io");
      const kokenPayload = kokenGiftResp?.ok && kokenGiftResp.json != null ? buildGiftSubAppPayloadFromKokenJson(kokenGiftResp.json, { now: Date.now(), liveId: lid }) : null;
      const giftSubAppHistoryForMarketing = mergeGiftSubAppHistoryPayload(giftSubAppHistoryRaw, kokenPayload);
      setWaitStageText("分析中… (3/3) HTML生成", 75);
      await yieldToBrowserPaint();
      let maskShareLabels = true;
      try {
        const maskBag = await chrome.storage.local.get(KEY_MARKETING_EXPORT_MASK_LABELS);
        maskShareLabels = normalizeMarketingExportMaskLabels(maskBag?.[KEY_MARKETING_EXPORT_MASK_LABELS]);
      } catch {
        maskShareLabels = true;
      }
      setWaitStageText("メディアキットをまとめています…", 85);
      let mediaKitHtml = "";
      try {
        const kit = await withTimeout(
          buildMediaKitDocument({
            storageGet: (keys) => chrome.storage.local.get(keys),
            readAllCommentsForLive: readAllCommentsForLive2,
            withTimeout,
            resolveProfileMap: async () => {
              const bag = await chrome.storage.local.get(KEY_USER_COMMENT_PROFILE_CACHE);
              return normalizeUserCommentProfileMap(bag?.[KEY_USER_COMMENT_PROFILE_CACHE]);
            },
            maskSupporters: maskShareLabels,
            // v0.1.1857: 記録は見た配信全部なので、この配信の配信者の配信だけで集計する(他の配信者の数字を混ぜない)。
            broadcasterUserId: String(snapshot?.broadcasterUserId || "").trim(),
            currentLiveId: lid
          }),
          6e4,
          "media_kit_build_timeout"
        );
        mediaKitHtml = kit.html;
      } catch {
        mediaKitHtml = "";
      }
      mktProf.mark("media_kit");
      let htmlReportHtml = "";
      if (!maskShareLabels) {
        setWaitStageText("コメント記録をまとめています…", 90);
        try {
          htmlReportHtml = await withTimeout(
            buildHtmlReportDocument(
              comments,
              snapshot,
              "",
              lid,
              `https://live.nicovideo.jp/watch/${lid}`,
              null,
              { ...buildHtmlReportDeps(snapshot), watchSnapshotStorageKey, embedForMarketing: true }
            ),
            resolveHtmlReportBuildTimeoutMs(comments.length),
            "html_report_build_timeout"
          );
        } catch {
          htmlReportHtml = "";
        }
      }
      mktProf.mark("html_report");
      const html = buildMarketingDashboardHtml(report, {
        mediaKitHtml,
        htmlReportHtml,
        programStartAtMs: Number(snapshot?.programStartAtMs || snapshot?.startAtMs) || void 0,
        maskShareLabels,
        anonymousIdenticonResolver: getCachedAnonymousIdenticonDataUrl,
        broadcasterUserId: String(snapshot?.broadcasterUserId || "").trim(),
        sessionSummaryRows,
        // v0.1.1708: 分析の入力は全件(旧: heavy のとき2,500件の均等サンプル=速度・沈黙・笑い・疲労・離脱・出席などが無注記で縮んだ)。
        commentsForAnalytics: comments,
        pastBroadcasts,
        giftUsers: giftUsersForMarketing,
        giftEvents: giftEventsForMarketing,
        giftHistoryThrows: giftHistoryThrowsForMarketing,
        giftSubAppHistory: giftSubAppHistoryForMarketing,
        adObservations: data[adObsKey],
        officialEventDomBundle: bundleForMkt,
        broadcastTitle: String(snapshot?.broadcastTitle || snapshot?.title || ""),
        broadcasterName: String(snapshot?.broadcasterName || ""),
        broadcasterProfile: broadcasterProfileForMkt,
        noopenerLinks: Array.isArray(snapshot?.noopenerLinks) ? snapshot.noopenerLinks : [],
        recordedCommentCount: Array.isArray(comments) ? comments.length : 0,
        streamAgeMin: typeof snapshot?.streamAgeMin === "number" ? snapshot.streamAgeMin : void 0,
        yukkuriImageDataUrlMap: yukkuriImageMapForMkt,
        eventRanking: eventRankingForMkt,
        slimForHeavyExport: heavyMkt
      });
      mktProf.mark("build_html");
      const mktFilename = buildMarketingReportDownloadFilename(lid, { comments, snapshot });
      setWaitStageText(`DL開始: ${mktFilename}`, 95);
      await downloadBlobViaChromeDownloads(new Blob([html], { type: "text/html;charset=utf-8" }), mktFilename);
      mktProf.mark("download");
      const mktDone = mktProf.finish("マーケ");
      logExportStageProfileIfEnabled("マーケ", mktDone.rows);
      void (async () => {
        try {
          const giftPersist = {};
          if (giftSubAppHistoryForMarketing) giftPersist[giftSubKey] = giftSubAppHistoryForMarketing;
          if (kokenGiftResp?.ok && kokenGiftResp.json != null) {
            const throwsRows = normalizeKokenGiftHistoryResponse(kokenGiftResp.json, { now: Date.now() });
            if (Array.isArray(throwsRows) && throwsRows.length > 0) giftPersist[giftThrowsKey] = throwsRows;
          }
          if (Object.keys(giftPersist).length > 0) await chrome.storage.local.set(giftPersist);
        } catch {
        }
      })();
      playReportCompleteVoiceSequence();
      showDoneStage(
        // v0.1.1668: 人数は userId のある人だけ(ID 空のコメントを別人として数えない)。
        `${mktFilename}
${report.totalComments}件 / ${typeof report.identifiedUsers === "number" ? report.identifiedUsers : report.uniqueUsers}人
このタブは閉じて大丈夫です。`
      );
    } catch (e) {
      const msg = String(
        e && typeof e === "object" && "message" in e ? (
          /** @type {{ message?: unknown }} */
          e.message
        ) : e || "marketing_dl_error"
      );
      if (isContextInvalidatedError(msg)) {
        showErrorStage(
          "拡張が更新されました。\nこのタブを閉じて、拡張のポップアップから開き直してください。"
        );
      } else if (msg === "marketing_storage_timeout") {
        showErrorStage("分析がタイムアウトしました。", true);
      } else {
        showErrorStage(`エラー: ${msg}`, true);
      }
    }
  }
  function bootstrap() {
    window.__NL_MKTEXPORT_BOOTED = true;
    startWaitCharCycle();
    const skipBtn = document.getElementById("mktSkipBtn");
    if (skipBtn) skipBtn.hidden = true;
    void runExport(liveIdFromUrl());
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
