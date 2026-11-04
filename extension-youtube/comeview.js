// comeview.js — ニコ生版 comeview-entry.js(本物)+ YouTube の記録を読む入口のバンドル
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

  // src/lib/htmlText.js
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
  function parseYtReplayOffsetSec(ts) {
    const s = String(ts || "").trim();
    const m = s.match(/^(-)?(?:(\d+):)?(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const sec = Number(m[2] || 0) * 3600 + Number(m[3]) * 60 + Number(m[4]);
    return m[1] ? -sec : sec;
  }
  function ytReplayPostedAt(ts, streamStartedAt, recordedAt) {
    const start = Number(streamStartedAt);
    const off = parseYtReplayOffsetSec(ts);
    if (!(start > 0) || off == null) return Number(recordedAt);
    return start + Math.max(0, off) * 1e3;
  }

  // src/lib/youtube/ytWording.js
  var TOP_FAN_RULES = [
    [
      "ニコニコ公式のギフト貢献度ランキング（上位）を表示します。ギフトを投げた人がいない配信では空になります（広告ポイントとは別系統です）。",
      "YouTube のトップファン（チャットでの応援の XP の順位・上位）を表示します。チャット欄のトップファンの画面から読み取ります。"
    ],
    ["公式の貢献度ランキング（niconico の表示に準拠）", "YouTube 公式のトップファン（XP の順位）"],
    ["ギフト貢献度", "トップファン"],
    // 数字のあとの単位「貢」→ XP(例: 410貢 → 410 XP)
    [/(\d[\d,]*)\s*貢(?![献])/g, "$1 XP"]
  ];
  var SUPERCHAT_RANK_RULES = [
    [
      "ニコニコ公式のギフト貢献度ランキング（上位）を表示します。ギフトを投げた人がいない配信では空になります（広告ポイントとは別系統です）。",
      "スーパーチャット・ギフトの合計の順位（上位）を表示します。トップファンの順位が出ていない配信（アーカイブなど）で使います。"
    ],
    ["公式の貢献度ランキング（niconico の表示に準拠）", "スーパーチャット・ギフトの合計の順位"],
    ["ギフト貢献度", "スパチャの合計順"],
    [/(\d[\d,]*)\s*貢(?![献])/g, "$1 pt"]
  ];
  var RULES = [
    ["ニコ生の応援コメントを、このPCで見える化", "YouTube の応援コメントを、このPCで見える化"],
    ["ニコニコ生放送 トップ", "YouTube トップ"],
    ["ニコ生の視聴ページの右下に", "YouTube の視聴ページの右下に"],
    ["ニコ生の画面改修でパネルが", "YouTube の画面改修でパネルが"],
    ["ニコ生公式の表示は変わりません", "YouTube 公式の表示は変わりません"],
    // マーケHTML の説明文(ニコ生版の文をそのまま使っている所)
    ["ニコニコユーザーID: ", "YouTube チャンネル: "],
    ["配信者がニコニコでハンドル名を変更した場合、ここの表示と niconico の最新表示が異なることがあります", "配信者が YouTube でハンドル名を変更した場合、ここの表示と YouTube の最新表示が異なることがあります"],
    ["サムネ・名前は数値ID時のみ niconico ユーザーページへリンクします", "サムネ・名前は YouTube のチャンネルへリンクします"],
    ["ニコ生は「誰がいつ入って、いつ出たか」を公開していません", "YouTube は「誰がいつ入って、いつ出たか」を公開していません"],
    ["ニコ生の「この番組へのギフト履歴」に近い形で", "YouTube のスーパーチャット・ギフトを"],
    ["ニコ生の匿名ギフトは「名無し」にまとまることがあります。", ""],
    ["ニコ生上で公開されている応援(コメント・ギフト)", "YouTube 上で公開されている応援(コメント・スーパーチャット)"],
    ["ニコ生上で公開されているコメント・ギフト情報", "YouTube 上で公開されているコメント・スーパーチャット情報"],
    ["ニコニコの公開プロフィールから", "YouTube の公開ページから"],
    ["ニコ広告", "広告"],
    // YouTube には来場者数(延べの入場数)がない。「取れていない」と書くと故障に見えるので、無いものとして書く
    ["来場者数が取れていないため「来場 X 人中 Y 人がコメント」は表示できません。視聴ページを開いた状態で配信を記録し、再出力してください。", "YouTube には来場者数（延べの入場数）がないため、「来場 X 人中 Y 人がコメント」は出しません。"],
    ["（来場者数は未取得）", ""],
    ["来場データ不足", "YouTube に来場者数なし"],
    ["配信ページを開いたまま記録すると取得できます", "YouTube には来場者数がありません"],
    ["手元記録の発言者数（来場者数が未取得のため参加率は出せません）", "手元記録の発言者数"],
    ["広告ランキング未取得（配信ページで記録）", "YouTube に広告ランキングなし"],
    ["来場者数が未取得のため、来場とコメントの変換率は判定できません。", "YouTube には来場者数がないため、来場とコメントの変換率は出しません。"]
  ];
  var QUICK = /貢|ニコ|niconico|来場|取得できます|広告ランキング/;
  function ytWording(text, opts = {}) {
    const v = String(text ?? "");
    if (!QUICK.test(v)) return v;
    let out = v;
    const rules = [...opts.topFans === false ? SUPERCHAT_RANK_RULES : TOP_FAN_RULES, ...RULES];
    for (const [from, to] of rules) {
      out = typeof from === "string" ? out.split(from).join(to) : out.replace(from, to);
    }
    return out;
  }
  function ytWordingTopFanToSuperChatRank(text) {
    let out = String(text ?? "");
    if (!/トップファン|XP/.test(out)) return out;
    out = swapOnce(out, TOP_FAN_RULES, SUPERCHAT_RANK_RULES);
    return out.replace(/(\d[\d,]*) XP\b/g, "$1 pt");
  }
  function ytWordingSuperChatRankToTopFan(text) {
    let out = String(text ?? "");
    if (!/スパチャの合計順|スーパーチャット・ギフトの合計の順位/.test(out)) return out;
    return swapOnce(out, SUPERCHAT_RANK_RULES, TOP_FAN_RULES);
  }
  function swapOnce(text, fromRules, toRules) {
    const map = /* @__PURE__ */ new Map();
    for (let i = 0; i < 3; i += 1) map.set(String(fromRules[i][1]), String(toRules[i][1]));
    const keys = [...map.keys()].sort((a, b) => b.length - a.length);
    const re = new RegExp(keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
    return text.replace(re, (m) => map.get(m) ?? m);
  }

  // src/lib/youtube/ytSuperChatTier.js
  var TIERS = [
    { min: 1e4, bg: "#e62117" },
    { min: 5e3, bg: "#e91e63" },
    { min: 2e3, bg: "#f57c00" },
    { min: 1e3, bg: "#ffca28" },
    { min: 500, bg: "#1de9b6" },
    { min: 200, bg: "#00e5ff" },
    { min: 0, bg: "#1e88e5" }
  ];
  function ytSuperChatTierColor(yen) {
    const n = Number(yen);
    const v = Number.isFinite(n) && n > 0 ? n : 0;
    for (const t of TIERS) if (v >= t.min) return t.bg;
    return TIERS[TIERS.length - 1].bg;
  }
  function ytSuperChatFromRowText(rowText) {
    const s = String(rowText || "");
    if (!/スーパーチャット|スーパーステッカー/.test(s)) return null;
    const pt = s.match(/([\d,]+)\s*pt/);
    if (pt) return { yen: Number(pt[1].replace(/,/g, "")) || 0 };
    const yen = s.match(/[¥￥]\s*([\d,]+)/);
    return { yen: yen ? Number(yen[1].replace(/,/g, "")) || 0 : 0 };
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
      membership_gift: "メンバーシップギフト",
      yt_gift: "ギフト"
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
      const giftName = kind === "yt_gift" ? String(e.ytGiftName || "").trim() : "";
      const giftThumb = kind === "yt_gift" ? String(e.ytGiftImageUrl || "") : "";
      const itemName = giftName || (amountLabel ? `${baseItemName} ${amountLabel}` : baseItemName);
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
        thumbnailUrl: giftThumb,
        senderAvatarUrl: String(e.avatarUrl || ""),
        userId: uid,
        kokenHistoryId: `yt:${String(e.id || "")}`,
        publishedAt: pubSec,
        contribution: point,
        capturedAt: at
      });
      const item = byItem.get(itemName) || { itemName, count: 0, thumbnailUrl: giftThumb };
      item.count += 1;
      byItem.set(itemName, item);
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
  var LAST_WATCH_URL_KEY = "nls_last_watch_url";
  function newestVideoIdOf(sums) {
    let best = "";
    let bestAt = -1;
    for (const [vid, sum] of Object.entries(sums || {})) {
      const at = Number(sum?.updatedAt || 0);
      if (at > bestAt) {
        bestAt = at;
        best = vid;
      }
    }
    return best;
  }
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
  var IS_MARKETING_PAGE = typeof location !== "undefined" && /marketing-export\.html$/.test(String(location.pathname || ""));
  var replayVideoIds = /* @__PURE__ */ new Set();
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
    const postedAt = r?.replay ? ytReplayPostedAt(String(r?.ts || ""), Number(r?._streamStartedAt || 0), at) : ytPostedAtFromClock(String(r?.ts || ""), at);
    const capturedAt = r?.replay && IS_MARKETING_PAGE && postedAt > 0 ? postedAt : at;
    return {
      id: String(r?.id || r?.pk || `yt${i}`),
      liveId: lv,
      commentNo: String(i + 1),
      text: String(r?.text || ""),
      userId: numericUidForYtKey(key),
      ytChannelId: /^UC/.test(key) ? key : channelId,
      nickname: name,
      avatarUrl: String(r?.iconUrl || ""),
      capturedAt,
      // チャット欄の時刻表示から求めた「書かれた時刻」(受け取った時刻とずれるのは開いたときに残っていた分)
      // リプレイ(アーカイブ)は時刻表示が経過時間なので、配信の開始時刻 + 経過時間にする
      ytPostedAt: postedAt,
      ytKind: String(r?.kind || "text"),
      ...r?.giftName ? { ytGiftName: String(r.giftName) } : {},
      ...r?.giftImageUrl ? { ytGiftImageUrl: String(r.giftImageUrl) } : {},
      ytAmount: Number(r?.amount || 0),
      ytCurrency: String(r?.currency || "")
    };
  }
  function ytTrustedStartedAt(sum, videoId, all) {
    const t = Number(sum?.startedAt || 0);
    if (!(t > 0)) return 0;
    const mine = Number(sum?.createdAt || 0);
    for (const [vid, other] of Object.entries(all || knownSummaries || {})) {
      if (vid === videoId) continue;
      if (Number(other?.startedAt) === t && Number(other?.createdAt || 0) <= mine) return 0;
    }
    return t;
  }
  function ytSummaryToNicoSnapshot(sum, videoId, tabTitle, all) {
    const lv = pseudoLvForVideoId(videoId);
    const viewers = typeof sum?.concurrentViewers === "number" ? sum.concurrentViewers : NaN;
    const startedAt = ytTrustedStartedAt(sum, videoId, all) || Number(sum?.createdAt || 0);
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
      // アーカイブ(チャットのリプレイで記録した配信)は今も配信中ではないので、開始からの経過は出さない(2週間前の配信が「372時間」になる)
      streamAgeMin: startedAt > 0 && !replayVideoIds.has(videoId) ? Math.max(0, Math.round((Date.now() - startedAt) / 6e4)) : null
    };
  }
  var normName = (name) => String(name || "").trim().replace(/^@/, "").toLowerCase();
  function ytUsableIcon(url) {
    const u = String(url || "").trim();
    return /^https:\/\//i.test(u) ? u : "";
  }
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
      const icon = ytUsableIcon(r?.iconUrl);
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
    return buildYtGiftBags(entries, lv, { startedAt: ytTrustedStartedAt(summary, videoIdForPseudoLv(lv)) });
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
    let streamStartedAt = 0;
    if (list.some((r) => r?.replay)) {
      replayVideoIds.add(vid);
      try {
        const bag = await real.storage.local.get(KEY_YT_SUMMARIES);
        const sum = bag?.[KEY_YT_SUMMARIES]?.[vid];
        streamStartedAt = ytTrustedStartedAt(sum, vid, bag?.[KEY_YT_SUMMARIES]);
      } catch {
      }
    }
    const out = list.map((r, i) => {
      const key = who.keyOf(r);
      const icon = ytUsableIcon(r?.iconUrl) || who.iconOf(key);
      const e = ytRecordToNicoEntry({ ...r, iconUrl: icon, _streamStartedAt: streamStartedAt }, i, lv, key);
      if (icon && e.userId) ytIconByNumericUid.set(e.userId, icon);
      return e;
    });
    registerBroadcastersFromSummaries();
    return out;
  }
  var knownSummaries = {};
  var kokenIsTopFans = true;
  function registerBroadcastersFromSummaries() {
    for (const [vid, sum] of Object.entries(knownSummaries)) {
      try {
        ytSummaryToNicoSnapshot(sum, vid, "");
      } catch {
      }
    }
  }
  var real = (
    /** @type {any} */
    globalThis.chrome
  );
  if (real && real.storage && real.storage.local && real.tabs) {
    const realLocal = real.storage.local;
    const realGet = realLocal.get.bind(realLocal);
    const knownVideosReady = Promise.resolve(realGet(KEY_YT_SUMMARIES)).then((bag) => {
      knownSummaries = bag && bag[KEY_YT_SUMMARIES] || {};
      for (const vid of Object.keys(knownSummaries)) pseudoLvForVideoId(vid);
      registerBroadcastersFromSummaries();
    }).catch(() => {
    });
    const lastWatchUrlFromSummaries = async () => {
      const sums = (
        /** @type {Record<string, any>} */
        (await realGet(KEY_YT_SUMMARIES))?.[KEY_YT_SUMMARIES]
      );
      const vid = newestVideoIdOf(sums);
      return vid ? `https://live.nicovideo.jp/watch/${pseudoLvForVideoId(vid)}` : "";
    };
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
          if (k === LAST_WATCH_URL_KEY) {
            const url = await lastWatchUrlFromSummaries();
            if (url) bag[k] = url;
            continue;
          }
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
          if (g[1] === "subApp") {
            const hist = Array.isArray(gifts?.subApp?.history) ? gifts.subApp.history : [];
            zeroPtGifts = hist.filter((h) => !(Number(h?.points) > 0));
            scheduleTopFanRest();
          }
          const laneRead = !!list && list.some((x) => x.startsWith("nls_gift_users_"));
          if (g[1] === "koken" && !laneRead) {
            const lbKey = `yt_leaderboard_${vid}`;
            const lb = (
              /** @type {Record<string, any>} */
              (await realGet(lbKey))?.[lbKey]
            );
            const fromBoard = lb ? ytLeaderboardToKoken(lb, await buildCommentsForLv(lv) || [], lv) : null;
            if (fromBoard) {
              v = fromBoard;
              topFanRestRows = fromBoard.rows.slice(10);
              scheduleTopFanRest();
            } else topFanRestRows = [];
            if (v != null) {
              const wasTopFans = kokenIsTopFans;
              kokenIsTopFans = !!fromBoard;
              if (wasTopFans && !kokenIsTopFans) rewordTopFanHeadings(ytWordingTopFanToSuperChatRank);
              if (!wasTopFans && kokenIsTopFans) rewordTopFanHeadings(ytWordingSuperChatRankToTopFan);
            }
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
          const gifts = await buildGiftBagsForLv(pseudoLvForVideoId(vid), sum).catch(() => void 0);
          const snapshot = (
            /** @type {Record<string, any>} */
            ytSummaryToNicoSnapshot(sum, vid, String(tab?.title || ""), bag && bag[KEY_YT_SUMMARIES] || {})
          );
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
            buildYtGiftBags(arr, lv, { startedAt: ytTrustedStartedAt(summary, videoIdForPseudoLv(lv)) })
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
        const newestNext = newestVideoIdOf(next);
        if (newestNext && newestNext !== newestVideoIdOf(prev)) {
          const synthUrl = { [LAST_WATCH_URL_KEY]: { newValue: `https://live.nicovideo.jp/watch/${pseudoLvForVideoId(newestNext)}` } };
          for (const fn of listeners) {
            try {
              fn(synthUrl, "local");
            } catch {
            }
          }
        }
        for (const vid of Object.keys(next)) {
          if (prev[vid] && Number(prev[vid].updatedAt || 0) === Number(next[vid]?.updatedAt || 0)) continue;
          void notifyLv(pseudoLvForVideoId(vid), next[vid]);
        }
      });
      const pollTimer = setInterval(() => {
        try {
          if (!real.runtime?.id) {
            clearInterval(pollTimer);
            try {
              const last = Number(sessionStorage.getItem("nl_yt_page_orphan_reload_at") || 0);
              if (Date.now() - last > 6e4) {
                sessionStorage.setItem("nl_yt_page_orphan_reload_at", String(Date.now()));
                setTimeout(() => location.reload(), 1500);
              }
            } catch {
            }
            return;
          }
          const lv = lastAskedLv;
          if (!lv) return;
          const vid = videoIdForPseudoLv(lv);
          if (!vid) return;
          void Promise.resolve(realGet(KEY_YT_SUMMARIES)).then((bag) => notifyLv(lv, bag?.[KEY_YT_SUMMARIES]?.[vid])).catch(() => {
          });
        } catch {
          clearInterval(pollTimer);
        }
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
  var PSEUDO_WATCH_URL_RE = /https?:\/\/live\.nicovideo\.jp\/watch\/(lv9\d{11})/g;
  var PSEUDO_LV_RE = /\blv9\d{11}\b/g;
  function ytFixPseudoLvText(text) {
    return String(text).replace(PSEUDO_WATCH_URL_RE, (all, lv) => {
      const vid = videoIdForPseudoLv(lv);
      return vid ? `https://www.youtube.com/watch?v=${vid}` : all;
    }).replace(PSEUDO_LV_RE, (lv) => videoIdForPseudoLv(lv) || lv);
  }
  function fixAnchor(a) {
    const href = String(a.getAttribute("href") || "");
    if (/live\.nicovideo\.jp\/watch\/lv9\d{11}/.test(href)) {
      const next = ytFixPseudoLvText(href);
      if (next !== href) a.setAttribute("href", next);
      return;
    }
    const m = href.match(NICO_USER_LINK_RE);
    if (!m || !ytKeyForNumericUid(m[1])) return;
    const yt = ytChannelUrlForNumericUid(m[1]);
    if (yt) a.setAttribute("href", yt);
    else a.removeAttribute("href");
  }
  function fixTextNode(node) {
    const parentTag = node.parentNode && /** @type {Element} */
    node.parentNode.tagName;
    if (parentTag === "SCRIPT" || parentTag === "STYLE") return;
    const v = String(node.nodeValue || "");
    let next = ytWording(v, { topFans: kokenIsTopFans });
    if (/8\d{9}/.test(next)) next = next.replace(PSEUDO_UID_RE, (uid) => ytKeyForNumericUid(uid) ? ytLabelForUid(uid) : uid);
    if (/lv9\d{11}/.test(next)) next = ytFixPseudoLvText(next);
    if (next !== v) node.nodeValue = next;
  }
  function fixUidLabelAttr(el) {
    const uid = String(el.getAttribute("data-nl-uid") || "");
    if (!/^8\d{9}$/.test(uid) || !ytKeyForNumericUid(uid)) return;
    const label = ytLabelForUid(uid) || "";
    if (el.getAttribute("data-yt-uid-label") !== label) el.setAttribute("data-yt-uid-label", label);
  }
  function fixTitleAttr(el) {
    const t = el.getAttribute("title");
    if (!t) return;
    let next = ytWording(t, { topFans: kokenIsTopFans });
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
  var EMPTY_THUMB_SEL = '[class*="thumb--empty"]';
  var SC_BUBBLE_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='white' d='M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'/%3E%3Ctext x='12' y='14' font-size='9' font-family='Arial' font-weight='700' text-anchor='middle' fill='%23333'%3E%24%3C/text%3E%3C/svg%3E") center/70% no-repeat`;
  function rewordTopFanHeadings(reword) {
    if (typeof document === "undefined" || !document.body) return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while (n = walker.nextNode()) {
      const v = String(n.nodeValue || "");
      const next = reword(v);
      if (next !== v) n.nodeValue = next;
    }
  }
  function fixEmptyThumb(el) {
    const tr = el.closest("tr");
    const row = tr || el.parentElement;
    let sc = ytSuperChatFromRowText(row ? row.textContent : "");
    if (!sc) return;
    const ptCell = tr && tr.querySelector('td[data-label="pt"]');
    if (ptCell) sc = ytSuperChatFromRowText(`スーパーチャット ${ptCell.textContent}`) || sc;
    const color = tr ? ytSuperChatTierColor(sc.yen) : "#e62117";
    if (el.getAttribute("data-yt-sc") === color) return;
    el.setAttribute("data-yt-sc", color);
    const h = (
      /** @type {HTMLElement} */
      el
    );
    h.style.background = `${SC_BUBBLE_BG}, ${color}`;
    h.style.borderColor = color;
    h.style.borderRadius = "6px";
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
    if (el.hasAttribute("data-nl-uid")) fixUidLabelAttr(el);
    el.querySelectorAll("[data-nl-uid]").forEach(fixUidLabelAttr);
    el.querySelectorAll('img[src*="nicoaccount/usericon"]').forEach(fixImg);
    el.querySelectorAll('a[href*="nicovideo.jp/user/"], a[href*="live.nicovideo.jp/watch/lv9"]').forEach(fixAnchor);
    el.querySelectorAll("[title]").forEach(fixTitleAttr);
    if (el.matches(EMPTY_THUMB_SEL)) fixEmptyThumb(el);
    el.querySelectorAll(EMPTY_THUMB_SEL).forEach(fixEmptyThumb);
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while (n = walker.nextNode()) fixTextNode(
      /** @type {Text} */
      n
    );
  }
  function ytTrimMarketingDoc(doc) {
    for (const id of ["mkt-commenter-follow", "mkt-commenter-follow-analytics"]) {
      doc.getElementById(id)?.remove();
      doc.querySelectorAll(`a[href="#${id}"]`).forEach((a) => (a.closest("li") || a).remove());
    }
    doc.querySelectorAll("#mkt-participation-lead *").forEach((el) => {
      if (el.children.length === 0 && String(el.textContent || "").trim() === "未取得") el.textContent = "—";
    });
    const KEEP = 8;
    doc.querySelectorAll("ul.mkt-gm-gifts").forEach((ul) => {
      const items = Array.from(ul.children);
      if (items.length <= KEEP + 1) return;
      for (const li of items.slice(KEEP)) li.remove();
      const more = doc.createElement("li");
      more.className = "mkt-gm-gift";
      more.textContent = `ほか ${items.length - KEEP} 件（全部はギフト投げ履歴の表にあります）`;
      ul.appendChild(more);
    });
  }
  function ytFixHtmlString(html) {
    try {
      const OFF = "data-ytoff-on";
      const parked = html.replace(/(\s)on([a-z]+=)/gi, `$1${OFF}$2`);
      const doc = new DOMParser().parseFromString(parked, "text/html");
      fixSubtree(doc.documentElement);
      if (doc.getElementById("mkt-kpi")) ytTrimMarketingDoc(doc);
      doc.querySelectorAll("[data-search]").forEach((el) => {
        const v = String(el.getAttribute("data-search") || "");
        let next = /lv9\d{11}/.test(v) ? ytFixPseudoLvText(v) : v;
        if (/8\d{9}/.test(next)) next = next.replace(PSEUDO_UID_RE, (uid) => ytKeyForNumericUid(uid) ? ytLabelForUid(uid) || uid : uid);
        if (next !== v) el.setAttribute("data-search", next);
      });
      const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
      const out = (doctype ? doctype[0] + "\n" : "") + doc.documentElement.outerHTML;
      return out.split(OFF).join("on");
    } catch {
      return html;
    }
  }
  if (typeof Blob === "function" && typeof DOMParser === "function" && typeof document !== "undefined") {
    const RealBlob = Blob;
    class YtFixingBlob extends RealBlob {
      /** @param {any[]} [parts] @param {BlobPropertyBag} [opts] */
      constructor(parts, opts) {
        if (opts && /^text\/html/i.test(String(opts.type || "")) && Array.isArray(parts) && parts.length === 1 && typeof parts[0] === "string") {
          parts = [ytFixHtmlString(parts[0])];
        }
        super(parts, opts);
      }
    }
    globalThis.Blob = YtFixingBlob;
  }
  var topFanRestRows = [];
  var topFanRestQueued = false;
  function scheduleTopFanRest() {
    if (topFanRestQueued || typeof document === "undefined") return;
    topFanRestQueued = true;
    setTimeout(() => {
      topFanRestQueued = false;
      ensureTopFanRest();
    }, 0);
  }
  function ytFaceOrLetter(url, name) {
    const wrap = document.createElement("span");
    const letter = (String(name || "").replace(/^@/, "").trim().charAt(0) || "?").toUpperCase();
    let hue = 0;
    for (const ch of String(name || "")) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
    wrap.textContent = letter;
    wrap.style.cssText = `width:22px;height:22px;border-radius:50%;flex:none;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;background:hsl(${hue} 45% 50%);overflow:hidden;position:relative;`;
    if (/^https:\/\//.test(url)) {
      const img = document.createElement("img");
      img.alt = "";
      img.src = url;
      img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;";
      img.addEventListener("error", () => img.remove(), { once: true });
      wrap.appendChild(img);
    }
    return wrap;
  }
  var zeroPtGifts = [];
  function ensureZeroPtGifts() {
    const panel = document.getElementById("northStarLaneThrows-giftHistory");
    const old = document.getElementById("yt-zero-pt-gifts");
    if (!panel || panel.hidden || !zeroPtGifts.length) {
      if (old) old.remove();
      return;
    }
    const sig = zeroPtGifts.map((h) => String(h.kokenHistoryId || "")).join("|");
    if (old && old.parentElement === panel && old.getAttribute("data-sig") === sig) return;
    if (old) old.remove();
    const box = document.createElement("div");
    box.id = "yt-zero-pt-gifts";
    box.setAttribute("data-sig", sig);
    box.style.cssText = "margin:8px 4px 2px;font-size:12px;";
    const head = document.createElement("div");
    head.textContent = `YouTube のギフト（金額が出ないもの・${zeroPtGifts.length}件）`;
    head.style.cssText = "font-weight:700;margin-bottom:4px;";
    box.appendChild(head);
    const ol = document.createElement("ol");
    ol.style.cssText = "list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;";
    for (const h of zeroPtGifts) {
      const li = document.createElement("li");
      li.style.cssText = "display:flex;align-items:center;gap:8px;";
      const t = document.createElement("span");
      t.textContent = String(h.time || "—");
      t.style.cssText = "width:56px;color:#64748b;flex:none;";
      li.appendChild(t);
      const thumb = String(h.thumbnailUrl || "");
      if (/^https:\/\//.test(thumb)) {
        const gi = document.createElement("img");
        gi.alt = "";
        gi.src = thumb;
        gi.width = 22;
        gi.height = 22;
        gi.style.cssText = "flex:none;object-fit:contain;";
        gi.addEventListener("error", () => gi.remove(), { once: true });
        li.appendChild(gi);
      }
      const item = document.createElement("span");
      item.textContent = String(h.itemName || "ギフト");
      item.style.cssText = "flex:none;";
      li.appendChild(item);
      const name = String(h.senderName || "");
      li.appendChild(ytFaceOrLetter(String(h.senderAvatarUrl || ""), name));
      const who = document.createElement("span");
      who.textContent = name;
      who.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;";
      li.appendChild(who);
      ol.appendChild(li);
    }
    box.appendChild(ol);
    panel.appendChild(box);
  }
  function ensureTopFanRest() {
    ensureZeroPtGifts();
    const body = document.getElementById("northStarLaneBody-contributionRanking");
    const old = document.getElementById("yt-topfan-rest");
    const rows = kokenIsTopFans ? topFanRestRows : [];
    if (!body || !rows.length || !body.querySelector('img, [class*="thumb"]')) {
      if (old) old.remove();
      return;
    }
    const sig = rows.map((r) => `${r.rank}:${r.name}:${r.contribution}`).join("|");
    if (old && old.parentElement === body && old.getAttribute("data-sig") === sig) return;
    const wasOpen = !!(old && /** @type {HTMLDetailsElement} */
    old.open);
    if (old) old.remove();
    const det = document.createElement("details");
    det.id = "yt-topfan-rest";
    det.setAttribute("data-sig", sig);
    det.open = wasOpen;
    det.style.cssText = "margin:8px 4px 2px;font-size:12px;";
    const sum = document.createElement("summary");
    sum.textContent = `11位から下（${rows.length}人）`;
    sum.style.cssText = "cursor:pointer;color:#2563eb;";
    det.appendChild(sum);
    const ol = document.createElement("ol");
    ol.style.cssText = "list-style:none;margin:6px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:4px 10px;";
    for (const r of rows) {
      const li = document.createElement("li");
      li.style.cssText = "display:flex;align-items:center;gap:6px;min-width:0;";
      const rank = document.createElement("span");
      rank.textContent = String(r.rank || "");
      rank.style.cssText = "width:22px;text-align:right;color:#64748b;flex:none;";
      li.appendChild(rank);
      const name = String(r.name || "");
      li.appendChild(ytFaceOrLetter(String(r.thumbnailUrl || ""), name));
      const a = document.createElement("a");
      a.textContent = name;
      if (/^@\S+$/.test(name)) {
        a.href = `https://www.youtube.com/${encodeURIComponent(name).replace(/^%40/, "@")}`;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
      a.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1;color:inherit;";
      li.appendChild(a);
      const xp = document.createElement("span");
      xp.textContent = `${Number(r.contribution || 0).toLocaleString("ja-JP")} XP`;
      xp.style.cssText = "color:#64748b;flex:none;";
      li.appendChild(xp);
      ol.appendChild(li);
    }
    det.appendChild(ol);
    body.appendChild(det);
  }
  function startDomFixer() {
    if (!document.body) return;
    fixSubtree(document.body);
    new MutationObserver((muts) => {
      if ((topFanRestRows.length || zeroPtGifts.length) && muts.some((m) => m.type === "childList" && !(m.target instanceof Element && m.target.closest("#yt-topfan-rest, #yt-zero-pt-gifts")))) scheduleTopFanRest();
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
          else if (m.attributeName === "data-nl-uid") fixUidLabelAttr(el);
        } else m.addedNodes.forEach(fixSubtree);
      }
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["href", "title", "src", "data-nl-uid"]
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

  // src/lib/storageKeys.js
  var KEY_LAST_WATCH_URL = "nls_last_watch_url";
  var KEY_USER_COMMENT_PROFILE_CACHE = "nls_user_comment_profile_v1";
  var KEY_COMMENTER_FOLLOW_CACHE = "nls_commenter_follow_v1";
  var KEY_COMMENTER_FOLLOWING_LIST_CACHE = "nls_commenter_following_list_v1";
  var EXTENSION_SOFT_CACHE_STORAGE_KEYS = Object.freeze([
    KEY_USER_COMMENT_PROFILE_CACHE,
    KEY_COMMENTER_FOLLOW_CACHE,
    KEY_COMMENTER_FOLLOWING_LIST_CACHE
  ]);
  var KEY_COMEVIEW_WINDOW_GEOMETRY = "nls_comeview_window_geometry_v1";
  function commentsStorageKey(liveId) {
    const id = String(liveId || "").trim().toLowerCase();
    return `nls_comments_${id}`;
  }

  // src/lib/voiceKeys.js
  var KEY_VOICE_READING_ENABLED = "nls_voice_reading_enabled_v1";
  var KEY_VOICE_ASSIGNMENTS = "nls_voice_assignments_v1";
  var KEY_VOICE_READ_NAME_ENABLED = "nls_voice_read_name_enabled_v1";
  var KEY_VOICE_VOLUME_PERCENT = "nls_voice_volume_percent_v1";
  var KEY_VOICE_NARROW_MODE = "nls_voice_narrow_mode_v1";
  var KEY_VOICE_WEAK_PC = "nls_voice_weak_pc_v1";
  var KEY_VOICE_QUALITY = "nls_voice_quality_v1";

  // src/lib/comeviewWindowGeometry.js
  var COMEVIEW_WINDOW_DEFAULT = Object.freeze({ width: 400, height: 640 });
  var MIN_W = 240;
  var MIN_H = 200;
  var MAX_W = 4e3;
  var MAX_H = 4e3;
  function intOrNull(v) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  function normalizeComeviewWindowGeometry(raw) {
    const o = raw && typeof raw === "object" ? (
      /** @type {Record<string, unknown>} */
      raw
    ) : {};
    const w = intOrNull(o.width);
    const h = intOrNull(o.height);
    const left = intOrNull(o.left);
    const top = intOrNull(o.top);
    return {
      width: w !== null && w >= MIN_W && w <= MAX_W ? w : COMEVIEW_WINDOW_DEFAULT.width,
      height: h !== null && h >= MIN_H && h <= MAX_H ? h : COMEVIEW_WINDOW_DEFAULT.height,
      // ★位置は「妥当なときだけ」返す。負の巨大値などは捨てる(画面外の窓を作らない)。
      left: left !== null && left > -MAX_W && left < MAX_W ? left : null,
      top: top !== null && top > -MAX_H && top < MAX_H ? top : null
    };
  }
  function buildComeviewWindowOptions(url, savedGeometry) {
    const g = normalizeComeviewWindowGeometry(savedGeometry);
    const opts = { url: String(url || ""), type: "popup", width: g.width, height: g.height };
    if (g.left !== null && g.top !== null) {
      opts.left = g.left;
      opts.top = g.top;
    }
    return opts;
  }
  function pickComeviewGeometryToSave(current) {
    const w = intOrNull(current?.width);
    const h = intOrNull(current?.height);
    if (w === null || h === null) return null;
    if (w < MIN_W || h < MIN_H || w > MAX_W || h > MAX_H) return null;
    const left = intOrNull(current?.left);
    const top = intOrNull(current?.top);
    return {
      width: w,
      height: h,
      left: left !== null && left > -MAX_W && left < MAX_W ? left : null,
      top: top !== null && top > -MAX_H && top < MAX_H ? top : null
    };
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
  function isWeakNiconicoUserIconHttpUrl(url) {
    const s = String(url || "").trim();
    if (!isHttpOrHttpsUrl(s)) return false;
    return /\/usericon\/defaults\//i.test(s);
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

  // src/lib/commentTailBuffer.js
  function tailStorageKey(liveId) {
    const id = String(liveId || "").trim().toLowerCase();
    return `nls_ctail_${id}`;
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
    const main2 = mainBag ? mainBag[mainKey] : null;
    return {
      rows: Array.isArray(main2) ? main2 : [],
      fromChunks: false,
      index: null,
      complete: Array.isArray(main2) || main2 == null
    };
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

  // src/lib/comeviewRows.js
  var GENERIC_ANON_NAMES = /* @__PURE__ */ new Set(["匿名", "名無し", "名無しさん", "匿名さん"]);
  function isGenericComeviewName(name) {
    return GENERIC_ANON_NAMES.has(String(name || "").trim());
  }
  function combineCanonicalComeviewRows(baseRows, tailRows) {
    const base = Array.isArray(baseRows) ? baseRows : [];
    const tail = Array.isArray(tailRows) ? tailRows : [];
    const knownNos = /* @__PURE__ */ new Set();
    for (const r of base) {
      if (!r || typeof r !== "object") continue;
      const o = (
        /** @type {Record<string, unknown>} */
        r
      );
      const no = o.commentNo ?? o.no;
      const key = no == null ? "" : String(no).trim();
      if (key) knownNos.add(key);
    }
    const extra = tail.filter((r) => {
      if (!r || typeof r !== "object") return false;
      const o = (
        /** @type {Record<string, unknown>} */
        r
      );
      const no = o.commentNo ?? o.no;
      const key = no == null ? "" : String(no).trim();
      return !key || !knownNos.has(key);
    });
    return [...base, ...extra];
  }
  function normalizeComeviewRow(raw) {
    if (!raw || typeof raw !== "object") return null;
    const r = (
      /** @type {Record<string, unknown>} */
      raw
    );
    const text = String(r.text ?? "").trim();
    if (!text) return null;
    const noRaw = r.commentNo ?? r.no;
    const no = Number.isFinite(Number(noRaw)) ? Number(noRaw) : null;
    const capRaw = r.capturedAt;
    const capturedAt = Number.isFinite(Number(capRaw)) ? Number(capRaw) : null;
    const id = no != null ? `no:${no}` : r.id ? `id:${String(r.id)}` : `c:${String(r.userId ?? "")}:${text}:${capturedAt ?? ""}`;
    return {
      id,
      no,
      name: String(r.name ?? r.nickname ?? "").trim(),
      text,
      userId: String(r.userId ?? "").trim(),
      avatar: String(r.avatar ?? r.avatarUrl ?? "").trim(),
      selfPosted: !!r.selfPosted,
      capturedAt
    };
  }

  // src/lib/supportActivityTimeline.js
  function safeAt(v) {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  function safeStr(v, max = 500) {
    return String(v == null ? "" : v).trim().slice(0, max);
  }
  function normalizeComments(comments) {
    if (!Array.isArray(comments)) return [];
    const out = [];
    for (const c of comments) {
      if (!c || typeof c !== "object") continue;
      const at = safeAt(c.capturedAt);
      const commentNo = safeStr(c.commentNo, 40);
      const userId = safeStr(c.userId, 40);
      const key = safeStr(c.id, 80) || `c:${commentNo || "x"}:${userId || "anon"}:${at}`;
      out.push({
        kind: "comment",
        at,
        key,
        userId,
        nickname: safeStr(c.nickname, 200),
        text: safeStr(c.text, 500),
        commentNo,
        avatarUrl: safeStr(c.avatarUrl, 400),
        selfPosted: c.selfPosted === true
      });
    }
    return out;
  }
  function normalizeGifts(gifts) {
    if (!Array.isArray(gifts)) return [];
    const out = [];
    let i = 0;
    for (const g of gifts) {
      i += 1;
      if (!g || typeof g !== "object") continue;
      const at = safeAt(g.capturedAt);
      const userId = safeStr(g.userId, 40);
      const itemId = safeStr(g.itemId, 80);
      const pointN = Number(g.point);
      const point = Number.isFinite(pointN) && pointN >= 0 ? Math.floor(pointN) : 0;
      const key = `g:${userId || "anon"}:${itemId || "x"}:${at}:${i}`;
      out.push({
        kind: "gift",
        at,
        key,
        userId,
        nickname: safeStr(g.nickname, 200),
        itemName: safeStr(g.itemName, 120),
        point,
        message: safeStr(g.message, 300),
        // v0.1.342: 送信者アバター（呼出側が rememberedAvatarUrlForUserId で enrich して渡す）。
        avatarUrl: safeStr(g.avatarUrl, 400)
      });
    }
    return out;
  }
  function buildSupportActivityTimeline(comments, gifts, opts) {
    const order = opts?.order === "asc" ? "asc" : "desc";
    const rawLimit = Number(opts?.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 100;
    const merged = [...normalizeComments(comments), ...normalizeGifts(gifts)];
    const decorated = merged.map((item, index) => ({ item, index }));
    decorated.sort((a, b) => {
      if (a.item.at !== b.item.at) {
        return order === "asc" ? a.item.at - b.item.at : b.item.at - a.item.at;
      }
      const aGift = a.item.kind === "gift" ? 1 : 0;
      const bGift = b.item.kind === "gift" ? 1 : 0;
      if (aGift !== bGift) {
        return order === "desc" ? bGift - aGift : aGift - bGift;
      }
      return a.index - b.index;
    });
    return decorated.slice(0, limit).map((d) => d.item);
  }
  function formatRelativeTimeJa(at, now) {
    const t = Number(at);
    if (!Number.isFinite(t) || t <= 0) return "";
    const ref = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    const diffMs = ref - t;
    if (diffMs < -5e3) return "";
    const sec = Math.max(0, Math.floor(diffMs / 1e3));
    if (sec < 10) return "たった今";
    if (sec < 60) return `${sec}秒前`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}分前`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}時間前`;
    const day = Math.floor(hr / 24);
    return `${day}日前`;
  }

  // src/lib/anonymousIdenticon.js
  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
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

  // src/lib/nicoUserPage.js
  function nicoUserPageUrl(userId) {
    const uid = String(userId == null ? "" : userId).trim();
    if (!/^\d{1,18}$/.test(uid)) return "";
    return `https://www.nicovideo.jp/user/${uid}`;
  }
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
  var COMEVIEW_USER_NOTES_KEY = "nls_comeview_usernotes_v1";
  var COMEVIEW_USER_NOTES_MAX = 500;
  function normalizeComeviewUserNotes(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out = {};
    for (const [key, v] of Object.entries(raw)) {
      const k = String(key || "").trim();
      if (!k || !v || typeof v !== "object") continue;
      const e = (
        /** @type {any} */
        v
      );
      const nickname = String(e.nickname || "").trim();
      const label = String(e.label || "").trim();
      const memo = String(e.memo || "").trim();
      if (!nickname && !label && !memo) continue;
      out[k] = { nickname, label, memo, at: Number(e.at) || 0 };
    }
    return out;
  }
  function upsertComeviewUserNote(map, userKey, patch, nowMs = 0) {
    const base = map && typeof map === "object" && !Array.isArray(map) ? map : {};
    const key = String(userKey || "").trim();
    if (!key) return { ...base };
    const cur = base[key] || { nickname: "", label: "", memo: "", at: 0 };
    const next = {
      nickname: patch && patch.nickname !== void 0 ? String(patch.nickname || "").trim() : cur.nickname,
      label: patch && patch.label !== void 0 ? String(patch.label || "").trim() : cur.label,
      memo: patch && patch.memo !== void 0 ? String(patch.memo || "").trim() : cur.memo,
      at: Number(nowMs) || 0
    };
    const out = { ...base };
    if (!next.nickname && !next.label && !next.memo) {
      delete out[key];
      return out;
    }
    out[key] = next;
    const keys = Object.keys(out);
    if (keys.length > COMEVIEW_USER_NOTES_MAX) {
      keys.sort((a, b) => (out[a].at || 0) - (out[b].at || 0)).slice(0, keys.length - COMEVIEW_USER_NOTES_MAX).forEach((k) => delete out[k]);
    }
    return out;
  }
  function comeviewAnonLabel(userId) {
    const s = String(userId || "").trim();
    if (!s.startsWith("a:") && !isNiconicoHashedAnonymousUserId(s)) return "";
    return anonymousDisplayLabel(s);
  }
  function resolveComeviewDisplayName(row, notes, userKey) {
    if (!row || typeof row !== "object") return "";
    const key = String(userKey || "").trim();
    if (key && notes && typeof notes === "object") {
      const nick = String(notes[key]?.nickname || "").trim();
      if (nick) return nick;
    }
    const name = String(row.name || "").trim();
    if (name && !isGenericComeviewName(name)) return name;
    const anon = comeviewAnonLabel(String(row.userId || ""));
    if (anon) return anon;
    return name;
  }
  function formatComeviewTime(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return "";
    const d = new Date(n);
    const p = (x) => String(x).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  // src/lib/supportTimelineHtml.js
  function timelineDisplayName(item) {
    const nick = String(item?.nickname || "").trim();
    if (nick && !isGenericComeviewName(nick)) return nick;
    const anon = comeviewAnonLabel(String(item?.userId || ""));
    if (anon) return anon;
    return nick || "名無し";
  }
  function resolveTimelineAvatar(item, defaultAvatar) {
    const real2 = String(item?.avatarUrl || "").trim();
    if (real2) return { src: real2, upgradeUserKey: "" };
    const id = String(item?.userId || "").trim();
    if (id) {
      const identicon = anonymousIdenticonDataUrl(id, 64);
      if (identicon) return { src: identicon, upgradeUserKey: id };
    }
    return { src: defaultAvatar, upgradeUserKey: "" };
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }
  function isNumericUid(uid) {
    const s = String(uid == null ? "" : uid).trim();
    return /^\d{1,18}$/.test(s) && Number(s) > 0;
  }
  function formatPoint(point) {
    const n = Number(point);
    if (!Number.isFinite(n) || n <= 0) return "0";
    return Math.floor(n).toLocaleString("en-US");
  }
  function commentTextShown(text, commentNo) {
    const t = String(text || "").trim();
    if (t) return t;
    const no = String(commentNo || "").trim();
    return no ? `（本文なし・No.${no}）` : "（本文なし）";
  }
  function buildTimelineRowHtml(item, opts) {
    if (!item || typeof item !== "object") return "";
    const defaultAvatar = String(opts?.defaultAvatar || "");
    const detailUid = String(item.userId || "").trim();
    const detailAttrs = detailUid ? ` data-nl-uid="${escapeAttr(detailUid)}" data-nl-uname="${escapeAttr(timelineDisplayName(item))}"` : "";
    const agoLabel = formatRelativeTimeJa(item.at, opts?.now);
    const agoBlock = agoLabel ? `<span class="nl-tl-time" aria-hidden="true">${escapeHtml(agoLabel)}</span>` : "";
    if (item.kind === "gift") {
      const name2 = escapeHtml(timelineDisplayName(item));
      const itemName = escapeHtml(item.itemName || "ギフト");
      const pt = escapeHtml(formatPoint(item.point));
      const ptBlock = Number(item.point) > 0 ? `<span class="nl-tl-gift__pt">${pt}pt</span>` : "";
      const gAvatar = resolveTimelineAvatar(item, defaultAvatar);
      const gAvRp = /^https?:\/\//i.test(gAvatar.src) ? ' referrerpolicy="no-referrer"' : "";
      const gAvUpgrade = gAvatar.upgradeUserKey ? ` data-nl-anonymous-avatar-key="${escapeAttr(gAvatar.upgradeUserKey)}"` : "";
      const avatarBlock = gAvatar.src ? `<span class="nl-tl-gift__avatar-wrap"><img class="nl-tl-gift__avatar" src="${escapeAttr(gAvatar.src)}" alt="" decoding="async"${gAvRp}${gAvUpgrade} /><span class="nl-tl-gift__badge" aria-hidden="true">🎁</span></span>` : `<span class="nl-tl-gift__icon" aria-hidden="true">🎁</span>`;
      const inner2 = avatarBlock + `<span class="nl-tl-gift__name">${name2}</span><span class="nl-tl-gift__item">${itemName}</span>` + ptBlock + agoBlock;
      const title2 = escapeAttr(
        `${timelineDisplayName(item)} が ${item.itemName || "ギフト"}${Number(item.point) > 0 ? `（${formatPoint(item.point)}pt）` : ""} を贈りました${agoLabel ? `（${agoLabel}）` : ""}`
      );
      if (isNumericUid(item.userId)) {
        const href = `https://www.nicovideo.jp/user/${escapeAttr(item.userId)}`;
        return `<a class="nl-tl-gift" href="${href}" target="_blank" rel="noopener noreferrer" title="${title2}"${detailAttrs}>${inner2}</a>`;
      }
      return `<div class="nl-tl-gift" title="${title2}"${detailAttrs}>${inner2}</div>`;
    }
    const name = escapeHtml(timelineDisplayName(item));
    const text = escapeHtml(commentTextShown(item.text, item.commentNo));
    const avatar = resolveTimelineAvatar(item, defaultAvatar);
    const avRp = /^https?:\/\//i.test(avatar.src) ? ' referrerpolicy="no-referrer"' : "";
    const avUpgrade = avatar.upgradeUserKey ? ` data-nl-anonymous-avatar-key="${escapeAttr(avatar.upgradeUserKey)}"` : "";
    const avBlock = avatar.src ? `<img class="nl-tl-row__avatar" src="${escapeAttr(avatar.src)}" alt="" decoding="async"${avRp}${avUpgrade} />` : "";
    const selfCls = item.selfPosted ? " nl-tl-row--self" : "";
    const inner = avBlock + `<span class="nl-tl-row__name">${name}</span><span class="nl-tl-row__text">${text}</span>` + agoBlock;
    const title = escapeAttr(
      `${timelineDisplayName(item)}：${commentTextShown(item.text, item.commentNo)}${agoLabel ? `（${agoLabel}）` : ""}`
    );
    if (isNumericUid(item.userId)) {
      const href = `https://www.nicovideo.jp/user/${escapeAttr(item.userId)}`;
      return `<a class="nl-tl-row${selfCls}" href="${href}" target="_blank" rel="noopener noreferrer" title="${title}"${detailAttrs}>${inner}</a>`;
    }
    return `<div class="nl-tl-row${selfCls}" title="${title}"${detailAttrs}>${inner}</div>`;
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

  // src/shared/avatar/avatarUrlGuard.js
  function extractNiconicoUserIdFromIconUrl(raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (!s) return "";
    const m = s.match(/\/(\d{2,15})\.(?:jpg|jpeg|png|gif|webp)(?:[?#]|$)/i);
    if (m && m[1]) return m[1];
    return "";
  }
  function isAvatarUrlForUserId(url, expectedUserId) {
    const expected = String(expectedUserId ?? "").trim();
    const urlUid = extractNiconicoUserIdFromIconUrl(url);
    if (!expected) return !urlUid;
    if (/^a:/.test(expected)) return !urlUid;
    if (!/^\d{2,15}$/.test(expected)) return true;
    if (!urlUid) return true;
    return urlUid === expected;
  }

  // src/lib/avatarBroadcasterGuard.js
  var isAvatarUrlForUserId2 = isAvatarUrlForUserId;

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
  function isWeakMergedDisplayNickname(nick) {
    const n = String(nick || "").trim();
    if (!n) return true;
    if (n === "（未取得）" || n === "(未取得)" || n === "匿名") return true;
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
        const candInternal = isLikelyInternalNdgGiftOrCampaignLabel(candNick);
        const curInternal = isLikelyInternalNdgGiftOrCampaignLabel(curNick);
        const candTrust = isTrustworthySupportGridDisplayNickname(candNick, uid);
        const preferNick = candNick !== curNick && (!curNick && (!candInternal || candTrust) || curInternal && !candInternal || !curInternal && !candInternal && (!curNick || candNick.length > curNick.length) || isWeakMergedDisplayNickname(curNick) && candTrust && !candInternal);
        if (preferNick) {
          out = { ...out, nickname: candNick };
          changed = true;
        }
      }
      if (candAv && isHttpOrHttpsUrl(candAv) && !isWeakNiconicoUserIconHttpUrl(candAv) && // 0.1.83: 普遍ガード — URL 埋め込み uid とエントリ uid の一致を要求
      isAvatarUrlForUserId2(candAv, uid)) {
        const curStrong = curAv && isHttpOrHttpsUrl(curAv) && !isWeakNiconicoUserIconHttpUrl(curAv);
        if (!curStrong) {
          out = { ...out, avatarUrl: candAv };
          changed = true;
        }
      }
      if (curAv && isHttpOrHttpsUrl(curAv) && !isAvatarUrlForUserId2(curAv, uid)) {
        out = { ...out, avatarUrl: "" };
        changed = true;
      }
      if (changed) patched += 1;
      return out;
    });
    return { next, patched };
  }

  // src/lib/comeviewActions.js
  var COMEVIEW_NG_STORAGE_KEY = "nls_comeview_ng_v1";
  var COMEVIEW_NG_MAX = 300;
  function comeviewPinStorageKey(liveId) {
    return `nls_comeview_pin_${String(liveId || "").trim().toLowerCase()}`;
  }
  var COMEVIEW_DEFAULT_AVATAR_URL = "https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg";
  function resolveComeviewAvatarUrl(row) {
    if (!row || typeof row !== "object") return "";
    const direct = String(row.avatar || "").trim();
    if (direct) return direct;
    const uid = String(row.userId || "").trim();
    const derived = deriveAvatarUrlFromUid(uid);
    if (derived) return derived;
    if (uid) {
      const identicon = anonymousIdenticonDataUrl(uid, 64);
      if (identicon) return identicon;
      return COMEVIEW_DEFAULT_AVATAR_URL;
    }
    return "";
  }
  function mergeComeviewRowWithProfile(row, profileMap) {
    if (!row || typeof row !== "object") return row;
    const uid = String(row.userId || "").trim();
    const e = uid && profileMap && typeof profileMap === "object" ? profileMap[uid] : null;
    if (!e) return row;
    const curName = String(row.name || "").trim();
    const curAvatar = String(row.avatar || "").trim();
    const name = curName || String(e.nickname || "").trim();
    const avatar = curAvatar || String(e.avatarUrl || "").trim();
    if (name === curName && avatar === curAvatar) return row;
    return { ...row, name, avatar };
  }
  function comeviewUserPageUrl(userId) {
    return nicoUserPageUrl(userId);
  }
  function comeviewUserKeyForRow(row) {
    if (!row || typeof row !== "object") return "";
    const uid = String(row.userId || "").trim();
    if (uid) return `u:${uid}`;
    const name = String(row.name || "").trim();
    if (name && !isGenericComeviewName(name)) return `n:${name}`;
    return "";
  }
  function buildComeviewCopyText(row) {
    if (!row || typeof row !== "object") return "";
    const text = String(row.text || "").trim();
    if (!text) return "";
    const name = String(row.name || "").trim();
    return name ? `${name}: ${text}` : text;
  }
  function normalizeComeviewNgList(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const e of raw) {
      if (!e || typeof e !== "object") continue;
      const key = String(
        /** @type {any} */
        e.key || ""
      ).trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        name: String(
          /** @type {any} */
          e.name || ""
        ).trim(),
        at: Number(
          /** @type {any} */
          e.at
        ) || 0
      });
    }
    return out.length > COMEVIEW_NG_MAX ? out.slice(out.length - COMEVIEW_NG_MAX) : out;
  }
  function addComeviewNgEntry(list, row, nowMs = 0) {
    const key = comeviewUserKeyForRow(row);
    const base = Array.isArray(list) ? list : [];
    if (!key) return { list: base, added: false, key: "" };
    if (base.some((e) => e && e.key === key)) return { list: base, added: false, key };
    const next = [
      ...base,
      { key, name: String(row?.name || "").trim(), at: Number(nowMs) || 0 }
    ];
    return {
      list: next.length > COMEVIEW_NG_MAX ? next.slice(next.length - COMEVIEW_NG_MAX) : next,
      added: true,
      key
    };
  }
  function removeComeviewNgEntry(list, key) {
    const base = Array.isArray(list) ? list : [];
    const k = String(key || "").trim();
    if (!k) return base;
    return base.filter((e) => e && e.key !== k);
  }
  function extractUserCommentRows(rawRows, userKey, max = 200) {
    const key = String(userKey || "").trim();
    if (!Array.isArray(rawRows) || !key) return { rows: [], total: 0 };
    const cap = Number.isFinite(max) && max > 0 ? Math.floor(max) : 200;
    const hits = [];
    for (const raw of rawRows) {
      const n = normalizeComeviewRow(raw);
      if (!n) continue;
      if (comeviewUserKeyForRow(n) !== key) continue;
      hits.push(n);
    }
    return {
      rows: hits.length > cap ? hits.slice(hits.length - cap) : hits,
      total: hits.length
    };
  }

  // src/lib/noSpeechNote.js
  var NO_SPEECH_PLAIN = "この配信の記録にはまだ発言がありません";
  function giftTextOf(text) {
    const t = String(text ?? "").trim();
    if (!t) return "";
    return /（[\d,]+pt）$/.test(t) ? t : "";
  }
  function buildNoSpeechNote(row) {
    const gift = giftTextOf(row?.text);
    if (gift) {
      return `コメントはまだありません。この配信では ${gift} を贈っています`;
    }
    return NO_SPEECH_PLAIN;
  }

  // src/lib/comeviewUserDetailLink.js
  var USER_SPEECH_ROWS_MAX = 1e3;

  // src/lib/comeviewInstantRender.js
  function clippedText(value, max) {
    return String(value == null ? "" : value).trim().slice(0, max);
  }
  function comeviewTimelineItemSignature(item) {
    if (!item || typeof item !== "object") return "";
    const uid = clippedText(item.userId, 40);
    if (item.kind === "gift") {
      return `g|${uid}|${clippedText(item.itemName, 120)}`;
    }
    return `c|${uid}|${clippedText(item.text, 500)}`;
  }
  function filterVisibleComeviewTimeline(timeline, ngKeys, hiddenSigs) {
    if (!Array.isArray(timeline)) return [];
    const ng = ngKeys instanceof Set ? ngKeys : /* @__PURE__ */ new Set();
    const hidden = hiddenSigs instanceof Set ? hiddenSigs : /* @__PURE__ */ new Set();
    return timeline.filter((item) => {
      if (!item || typeof item !== "object") return false;
      const sig = comeviewTimelineItemSignature(item);
      if (sig && hidden.has(sig)) return false;
      const userKey = comeviewUserKeyForRow({
        userId: item.userId,
        name: item.nickname
      });
      return !userKey || !ng.has(userKey);
    });
  }
  function keepLatestComeviewTimelineItems(timeline, max) {
    if (!Array.isArray(timeline)) return [];
    const cap = Number.isFinite(max) && max > 0 ? Math.floor(max) : 1;
    return timeline.length > cap ? timeline.slice(timeline.length - cap) : [...timeline];
  }
  function pickNewComeviewTimelineItems(timeline, renderedKeys) {
    if (!Array.isArray(timeline)) return [];
    const seen = new Set(renderedKeys instanceof Set ? renderedKeys : []);
    const fresh = [];
    for (const item of timeline) {
      const key = clippedText(item?.key, 500);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      fresh.push(item);
    }
    return fresh;
  }
  function pickAppendedComeviewSnapshotRows(previous, next, kind) {
    const before = Array.isArray(previous) ? previous : [];
    const after = Array.isArray(next) ? next : [];
    const counts = /* @__PURE__ */ new Map();
    for (const row of before) {
      const id = comeviewSnapshotRowIdentity(row, kind);
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    const added = [];
    for (const row of after) {
      const id = comeviewSnapshotRowIdentity(row, kind);
      const remaining = counts.get(id) || 0;
      if (remaining > 0) {
        counts.set(id, remaining - 1);
      } else {
        added.push(row);
      }
    }
    return added;
  }
  function selectAppendedComeviewTimelineItems(timeline, addedComments, addedGifts) {
    if (!Array.isArray(timeline)) return [];
    const counts = /* @__PURE__ */ new Map();
    const addCount = (row, kind) => {
      const id = comeviewSnapshotRowIdentity(row, kind);
      counts.set(id, (counts.get(id) || 0) + 1);
    };
    if (Array.isArray(addedComments)) {
      for (const row of addedComments) addCount(row, "comment");
    }
    if (Array.isArray(addedGifts)) {
      for (const row of addedGifts) addCount(row, "gift");
    }
    const selected = [];
    for (const item of timeline) {
      const id = comeviewSnapshotRowIdentity(item, item?.kind);
      const remaining = counts.get(id) || 0;
      if (remaining <= 0) continue;
      counts.set(id, remaining - 1);
      selected.push(item);
    }
    return selected;
  }
  function comeviewSnapshotRowIdentity(row, kind) {
    const source = row && typeof row === "object" ? (
      /** @type {Record<string, unknown>} */
      row
    ) : {};
    const at = Number(source.capturedAt ?? source.at);
    const capturedAt = Number.isFinite(at) ? at : 0;
    const userId = clippedText(source.userId, 40);
    if (kind === "gift") {
      const point = Number(source.point);
      return JSON.stringify([
        "g",
        userId,
        clippedText(source.itemName, 120),
        Number.isFinite(point) && point >= 0 ? Math.floor(point) : 0,
        clippedText(source.message, 300),
        capturedAt
      ]);
    }
    return JSON.stringify([
      "c",
      clippedText(source.commentNo, 40),
      userId,
      clippedText(source.text, 500),
      capturedAt
    ]);
  }
  function commentNoOfComeviewRow(row) {
    if (!row || typeof row !== "object") return "";
    const source = (
      /** @type {Record<string, unknown>} */
      row
    );
    return clippedText(source.commentNo ?? source.no, 40);
  }
  function filterUnseenComeviewComments(rows, seenNos) {
    if (!Array.isArray(rows)) return [];
    const seen = seenNos instanceof Set ? seenNos : /* @__PURE__ */ new Set();
    return rows.filter((row) => {
      const no = commentNoOfComeviewRow(row);
      return !no || !seen.has(no);
    });
  }
  var VOICE_BACKLOG_NO_MARGIN = 30;
  function splitVoiceBacklogByCommentNo(items, maxNo, margin = VOICE_BACKLOG_NO_MARGIN) {
    const list = Array.isArray(items) ? items : [];
    const floor = Number(maxNo) > 0 ? Number(maxNo) - margin : -Infinity;
    const fresh = [];
    let backlog = 0;
    let next = Number(maxNo) > 0 ? Number(maxNo) : 0;
    for (const item of list) {
      const no = Number(commentNoOfComeviewRow(item));
      if (item?.kind === "comment" && Number.isFinite(no) && no > 0) {
        if (no < floor) {
          backlog += 1;
          continue;
        }
        if (no > next) next = no;
      }
      fresh.push(item);
    }
    return { fresh, backlog, maxNo: next };
  }
  function pickRefreshVoiceItems(timeline, seenNos, nowMs, maxAgeMs) {
    if (!Array.isArray(timeline)) return [];
    const seen = seenNos instanceof Set ? seenNos : /* @__PURE__ */ new Set();
    return timeline.filter((item) => {
      if (!item || item.kind !== "comment") return false;
      const no = commentNoOfComeviewRow(item);
      if (!no || seen.has(no)) return false;
      const age = nowMs - Number(item.at);
      return Number.isFinite(age) && age >= 0 && age <= maxAgeMs;
    });
  }
  function pickUnseenComeviewGifts(rows, seenAtBySig, windowMs = 9e4) {
    if (!Array.isArray(rows)) return [];
    const seen = seenAtBySig instanceof Map ? seenAtBySig : /* @__PURE__ */ new Map();
    const win = Number.isFinite(windowMs) && windowMs >= 0 ? windowMs : 9e4;
    const fresh = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const source = (
        /** @type {Record<string, unknown>} */
        row
      );
      const point = Number(source.point);
      const sig = JSON.stringify([
        clippedText(source.userId, 40),
        clippedText(source.itemName, 120),
        Number.isFinite(point) && point >= 0 ? Math.floor(point) : 0,
        clippedText(source.message, 300)
      ]);
      const atRaw = Number(source.capturedAt ?? source.at);
      const at = Number.isFinite(atRaw) ? atRaw : 0;
      const last = seen.get(sig);
      if (last != null && Math.abs(at - last) <= win) continue;
      seen.set(sig, at);
      fresh.push(row);
    }
    return fresh;
  }
  function isComeviewNearBottom(metrics, threshold = 80) {
    const scrollTop = Math.max(0, Number(metrics?.scrollTop) || 0);
    const clientHeight = Math.max(0, Number(metrics?.clientHeight) || 0);
    const scrollHeight = Math.max(0, Number(metrics?.scrollHeight) || 0);
    const limit = Number.isFinite(threshold) && threshold >= 0 ? Number(threshold) : 80;
    return Math.max(0, scrollHeight - clientHeight - scrollTop) <= limit;
  }

  // src/lib/comeviewLivePush.js
  var COMEVIEW_LIVE_PORT_NAME = "nls-comeview-live-v1";
  var COMEVIEW_LIVE_ROWS_TYPE = "nls_comeview_live_rows";
  var COMEVIEW_LIVE_PUSH_MAX_ROWS = 50;
  var COMEVIEW_VOICE_READ_NOS_LIMIT = 2e3;
  function pickComeviewPushRows(rows) {
    if (!Array.isArray(rows)) return [];
    const picked = rows.filter((r) => r && typeof r === "object" && String(
      /** @type {any} */
      r.commentNo || ""
    ).trim() !== "");
    return (
      /** @type {Record<string, unknown>[]} */
      picked.slice(-COMEVIEW_LIVE_PUSH_MAX_ROWS)
    );
  }
  function parseComeviewLiveMessage(msg) {
    const m = (
      /** @type {any} */
      msg
    );
    if (!m || typeof m !== "object" || m.type !== COMEVIEW_LIVE_ROWS_TYPE) return null;
    const liveId = String(m.liveId || "").trim().toLowerCase();
    if (!/^lv\d{1,15}$/.test(liveId) || !Array.isArray(m.rows)) return null;
    return { liveId, rows: pickComeviewPushRows(m.rows) };
  }
  function takeUnreadVoiceItems(items, readNos, noOf, limit = COMEVIEW_VOICE_READ_NOS_LIMIT) {
    if (!Array.isArray(items) || !(readNos instanceof Set)) return Array.isArray(items) ? [...items] : [];
    const out = [];
    for (const item of items) {
      const no = String(noOf(item) ?? "").trim();
      if (!no) {
        out.push(item);
        continue;
      }
      if (readNos.has(no)) continue;
      readNos.add(no);
      out.push(item);
    }
    while (readNos.size > limit) {
      const oldest = readNos.values().next().value;
      if (oldest === void 0) break;
      readNos.delete(oldest);
    }
    return out;
  }
  function pickWatchTabIdForLive(tabs, liveId) {
    const lv = String(liveId || "").trim().toLowerCase();
    if (!/^lv\d{1,15}$/.test(lv) || !Array.isArray(tabs)) return null;
    let best = null;
    let bestAt = -Infinity;
    for (const t of tabs) {
      if (!t || typeof t.id !== "number") continue;
      const url = String(t.url || "").toLowerCase();
      if (!/\/watch\//.test(url)) continue;
      const m = url.match(/lv\d{1,15}/);
      if (!m || m[0] !== lv) continue;
      const at = Number(t.lastAccessed) || 0;
      if (at > bestAt) {
        best = t.id;
        bestAt = at;
      }
    }
    return best;
  }

  // src/lib/voiceQuality.js
  var VOICE_QUALITY_STANDARD = "standard";
  var VOICE_QUALITY_HIGH = "high";
  var VOICE_QUALITY_SAMPLING_RATES = Object.freeze({ standard: 16e3, high: 24e3 });
  function normalizeVoiceQuality(value) {
    return String(value ?? "").trim().toLowerCase() === VOICE_QUALITY_HIGH ? VOICE_QUALITY_HIGH : VOICE_QUALITY_STANDARD;
  }
  function voiceQualitySamplingRate(value) {
    return VOICE_QUALITY_SAMPLING_RATES[normalizeVoiceQuality(value)];
  }

  // src/lib/voiceReadingNormalize.js
  var VOICE_REPEAT_KEEP = 4;
  var LAUGH_W_RE = /(?<![A-Za-zＡ-Ｚａ-ｚ])[wWｗＷ]{2,}(?![A-Za-zＡ-Ｚａ-ｚ])/g;
  var LAUGH_W_TAIL_RE = /(?<=[\u3040-\u30ff\u3400-\u9fff\uff01-\uff9f])[wWｗＷ](?=[\s!！?？。、…]*$)/;
  var CLAP_8_RE = /(?<![0-9０-９.,，．])[8８]{3,}(?![0-9０-９.,，．円万億人位点個回件年月日時分秒%％ptPT])/g;
  var laughWord = (m) => Array.from(m).length >= 3 ? "わらわら" : "わら";
  function normalizeVoiceReadingBody(text, opts = {}) {
    let s = String(text ?? "");
    if (!s) return "";
    s = s.replace(/(?:https?:\/\/|www\.)[^\s]+/gi, typeof opts.urlWord === "string" ? opts.urlWord : "URL省略");
    s = s.replace(LAUGH_W_RE, laughWord).replace(LAUGH_W_TAIL_RE, "わら");
    if (/^\s*[wWｗＷ]\s*$/.test(s)) s = "わら";
    s = s.replace(CLAP_8_RE, "パチパチ");
    s = s.replace(/(.)\1{4,}/gsu, (_m, ch) => ch.repeat(VOICE_REPEAT_KEEP));
    s = s.replace(/\s+/g, " ").trim();
    return /[\p{L}\p{N}]/u.test(s) ? s : "";
  }

  // src/lib/voiceVolume.js
  var VOICE_VOLUME_MIN = 0;
  var VOICE_VOLUME_MAX = 300;
  var VOICE_VOLUME_DEFAULT = 100;
  var VOICE_TARGET_PEAK_AT_100 = 0.48;
  var VOICE_PEAK_CEILING = 0.98;
  var VOICE_MAX_BOOST = 4;
  var VOICE_TYPICAL_CREST = 6.68;
  function voiceTargetRms(targetPeak) {
    return targetPeak / VOICE_TYPICAL_CREST;
  }
  function voiceLevelGain(peak, rms, targetPeak) {
    if (rms > 0 && peak > 0) {
      return Math.min(VOICE_MAX_BOOST, voiceTargetRms(targetPeak) / rms, VOICE_PEAK_CEILING * 0.9 / peak);
    }
    return peak > 0 ? Math.min(VOICE_MAX_BOOST, targetPeak / peak) : VOICE_MAX_BOOST;
  }
  function normalizeVoiceVolumePercent(raw) {
    if (raw === null || raw === void 0 || raw === "") return VOICE_VOLUME_DEFAULT;
    const n = Number(raw);
    if (!Number.isFinite(n)) return VOICE_VOLUME_DEFAULT;
    return Math.min(VOICE_VOLUME_MAX, Math.max(VOICE_VOLUME_MIN, Math.round(n)));
  }
  function findPcm16Data(dv) {
    if (dv.byteLength < 12) return null;
    const tag = (o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
    if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
    let off = 12;
    let isPcm16 = false;
    while (off + 8 <= dv.byteLength) {
      const id = tag(off);
      const size = dv.getUint32(off + 4, true);
      const body = off + 8;
      if (id === "fmt " && body + 16 <= dv.byteLength) {
        const format = dv.getUint16(body, true);
        const bits = dv.getUint16(body + 14, true);
        isPcm16 = format === 1 && bits === 16;
      } else if (id === "data") {
        if (!isPcm16) return null;
        const length = Math.min(size, dv.byteLength - body) & ~1;
        return { offset: body, length };
      }
      off = body + size + (size & 1);
    }
    return null;
  }
  function applyVoiceVolumeToWav(wav, volumePercent) {
    if (!(wav instanceof ArrayBuffer)) return wav;
    const pct = normalizeVoiceVolumePercent(volumePercent);
    let dv;
    try {
      dv = new DataView(wav);
    } catch {
      return wav;
    }
    const data = findPcm16Data(dv);
    if (!data || data.length < 2) return wav;
    let peak = 0;
    let sumSq = 0;
    let voiced = 0;
    for (let i = data.offset; i < data.offset + data.length; i += 2) {
      const v = dv.getInt16(i, true);
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a >= 328) {
        sumSq += v / 32768 * (v / 32768);
        voiced++;
      }
    }
    if (peak === 0) return wav;
    const targetPeak = Math.min(VOICE_PEAK_CEILING, VOICE_TARGET_PEAK_AT_100 * pct / 100);
    const gain = voiceLevelGain(peak / 32767, voiced > 0 ? Math.sqrt(sumSq / voiced) : 0, targetPeak);
    if (Math.abs(gain - 1) < 0.01) return wav;
    const out = wav.slice(0);
    const odv = new DataView(out);
    for (let i = data.offset; i < data.offset + data.length; i += 2) {
      const v = Math.round(dv.getInt16(i, true) * gain);
      odv.setInt16(i, Math.max(-32768, Math.min(32767, v)), true);
    }
    return out;
  }
  function voiceTargetPeak(volumePercent) {
    const pct = normalizeVoiceVolumePercent(volumePercent);
    return Math.min(VOICE_PEAK_CEILING, VOICE_TARGET_PEAK_AT_100 * pct / 100);
  }
  function measureVoiceWavLevel(wav) {
    if (!(wav instanceof ArrayBuffer)) return null;
    let dv;
    try {
      dv = new DataView(wav);
    } catch {
      return null;
    }
    const data = findPcm16Data(dv);
    if (!data || data.length < 2) return null;
    let peak = 0;
    let sumSq = 0;
    let n = 0;
    for (let i = data.offset; i < data.offset + data.length; i += 2) {
      const v = dv.getInt16(i, true);
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a >= 328) {
        sumSq += v / 32768 * (v / 32768);
        n++;
      }
    }
    return { peak: Math.min(1, peak / 32767), rms: n > 0 ? Math.sqrt(sumSq / n) : 0 };
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
  function voicePitchRmsFactor(styleId, pitchOffset) {
    const p = Number(pitchOffset);
    if (!Number.isFinite(p) || Math.abs(p) < 1e-6) return 1;
    const row = VOICE_STYLE_PITCH_RMS_FACTOR[String(Number(styleId))];
    if (!Array.isArray(row)) return 1;
    const f = [Number(row[0]), Number(row[1]), 1, Number(row[2]), Number(row[3])];
    if (!f.every((x) => x > 0 && x < 4)) return 1;
    const g = VOICE_PITCH_OFFSET_GRID;
    if (p <= g[0]) return f[0];
    if (p >= g[g.length - 1]) return f[f.length - 1];
    for (let i = 0; i < g.length - 1; i++) {
      if (p <= g[i + 1]) return f[i] + (f[i + 1] - f[i]) * (p - g[i]) / (g[i + 1] - g[i]);
    }
    return 1;
  }
  function voiceStyleTableLevel(styleId, pitchOffset = 0) {
    const id = Number(styleId);
    if (!Number.isInteger(id) || id < 0) return null;
    const row = VOICE_STYLE_LEVEL_TABLE[String(id)];
    if (!Array.isArray(row)) return null;
    const rms = Number(row[0]);
    const peak = Number(row[1]);
    if (!(rms > 0 && rms < 1) || !(peak > 0 && peak <= 1)) return null;
    const k = voicePitchRmsFactor(id, pitchOffset);
    return { rms: rms * k, peak: Math.min(1, peak * k) };
  }

  // src/lib/voiceStream.js
  var VOICE_STREAM_SEGMENT_SEC = 0.3;
  var VOICE_STREAM_PREBUFFER_SEC = 0.3;
  var VOICE_STREAM_LONG_TEXT_CHARS = 30;
  var VOICE_STREAM_STALL_MS = 5e3;
  var VOICE_STREAM_ASSUMED_PEAK = 0.45;
  var VOICE_STREAM_MIN_RMS_SAMPLES = 2e3;
  var VOICE_STREAM_FIRST_PEAK_HEADROOM = 1.25;
  var VOICE_STREAM_MEDIAN_RMS = 0.0708;
  var VOICE_STREAM_MIN_EST_RMS = 0.04;
  var VOICE_STREAM_MAX_EST_RMS = 0.112;
  var VOICE_STREAM_SHORT_MIN_EST_PEAK = 0.4;
  var stylePeaks = /* @__PURE__ */ new Map();
  var styleRms = /* @__PURE__ */ new Map();
  function rememberVoiceStylePeak(styleId, peak, rms, textLength, pitchOffset) {
    const len = Number(textLength);
    if (Number.isFinite(len) && len >= 0 && len < VOICE_STREAM_LONG_TEXT_CHARS) return;
    const key = voiceLevelKey(styleId, pitchOffset);
    const p = Number(peak);
    if (key === null || !Number.isFinite(p) || p <= 0 || p > 1) return;
    const prev = stylePeaks.get(key);
    stylePeaks.set(key, prev === void 0 ? p : prev + 0.5 * (p - prev));
    const r = Number(rms);
    if (Number.isFinite(r) && r > 0 && r <= 1) {
      const pr = styleRms.get(key);
      styleRms.set(key, pr === void 0 ? r : pr + 0.5 * (r - pr));
    }
  }
  function voiceLevelKey(styleId, pitchOffset) {
    const id = Number(styleId);
    if (!Number.isInteger(id) || id < 0) return null;
    const pitch = Math.round((Number(pitchOffset) || 0) * 100);
    return pitch === 0 ? String(id) : `${id}@${pitch}`;
  }
  function knownVoiceStyleRms(styleId, pitchOffset) {
    const key = voiceLevelKey(styleId, pitchOffset);
    if (key === null) return -1;
    const v = styleRms.get(key);
    return v === void 0 ? -1 : v;
  }
  function knownVoiceStylePeak(styleId, pitchOffset) {
    const key = voiceLevelKey(styleId, pitchOffset);
    if (key === null) return -1;
    const v = stylePeaks.get(key);
    return v === void 0 ? -1 : v;
  }
  function voiceStyleLevelsSnapshot() {
    const out = {};
    for (const [key, peak] of stylePeaks) {
      const rms = styleRms.get(key) ?? -1;
      out[key] = {
        peak: Math.round(peak * 1e3) / 1e3,
        rms: rms > 0 ? Math.round(rms * 1e3) / 1e3 : -1,
        crestDb: rms > 0 ? Math.round(20 * Math.log10(peak / rms) * 10) / 10 : -1
      };
    }
    return out;
  }
  function shouldStreamVoice(input) {
    if (input?.supported !== true || input?.idle !== true) return false;
    if (input.slowEngine === true) return true;
    return Number(input.textLength) >= VOICE_STREAM_LONG_TEXT_CHARS;
  }
  function createWavStreamParser() {
    let head = new Uint8Array(0);
    let headerDone = false;
    let sampleRate = 0;
    let error = "";
    let remaining = Infinity;
    let carry = -1;
    function parseHeader(buf) {
      const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      const tag = (o) => String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
      if (buf.length < 12) return -1;
      if (tag(0) !== "RIFF" || tag(8) !== "WAVE") {
        error = "not_wav";
        return -2;
      }
      let off = 12;
      let pcm16 = false;
      while (off + 8 <= buf.length) {
        const id = tag(off);
        const size = dv.getUint32(off + 4, true);
        const body = off + 8;
        if (id === "fmt ") {
          if (body + 16 > buf.length) return -1;
          const format = dv.getUint16(body, true);
          const channels = dv.getUint16(body + 2, true);
          sampleRate = dv.getUint32(body + 4, true);
          const bits = dv.getUint16(body + 14, true);
          pcm16 = format === 1 && bits === 16 && channels === 1 && sampleRate > 0;
          if (!pcm16) {
            error = "not_pcm16_mono";
            return -2;
          }
        } else if (id === "data") {
          if (!pcm16) {
            error = "no_fmt";
            return -2;
          }
          remaining = size > 0 && size < 4294967295 ? size : Infinity;
          return body;
        }
        off = body + size + (size & 1);
      }
      return -1;
    }
    return {
      push(bytes) {
        if (error || !(bytes instanceof Uint8Array) || bytes.length === 0) return null;
        let data = bytes;
        if (!headerDone) {
          const merged = new Uint8Array(head.length + bytes.length);
          merged.set(head, 0);
          merged.set(bytes, head.length);
          const at = parseHeader(merged);
          if (at === -2) return null;
          if (at === -1) {
            if (merged.length > 4096) error = "header_too_long";
            head = merged;
            return null;
          }
          headerDone = true;
          head = new Uint8Array(0);
          data = merged.subarray(at);
        }
        if (remaining !== Infinity) {
          if (remaining <= 0) return null;
          if (data.length > remaining) data = data.subarray(0, remaining);
          remaining -= data.length;
        }
        let buf = data;
        if (carry >= 0) {
          buf = new Uint8Array(data.length + 1);
          buf[0] = carry;
          buf.set(data, 1);
          carry = -1;
        }
        const n = buf.length >> 1;
        if (buf.length & 1) carry = buf[buf.length - 1];
        if (n === 0) return null;
        const out = new Int16Array(n);
        for (let i = 0; i < n; i++) out[i] = (buf[2 * i + 1] << 8 | buf[2 * i]) << 16 >> 16;
        return out;
      },
      get sampleRate() {
        return sampleRate;
      },
      get error() {
        return error;
      }
    };
  }
  var StreamedVoice = class {
    /** @param {number} sampleRate */
    constructor(sampleRate) {
      this.sampleRate = sampleRate;
      this.chunks = [];
      this.totalSamples = 0;
      this.peak = 0;
      this._sumSq = 0;
      this._voiced = 0;
      this.styleId = -1;
      this.pitchOffset = 0;
      this.textLength = -1;
      this.done = false;
      this.failed = false;
      this._listeners = /* @__PURE__ */ new Set();
      this._cancel = null;
      this._resolveDone = () => {
      };
      this.whenDone = new Promise((r) => {
        this._resolveDone = r;
      });
    }
    /** 届いた分の素の RMS(0〜1・無音を除く)。 */
    get rms() {
      return this._voiced > 0 ? Math.sqrt(this._sumSq / this._voiced) : 0;
    }
    /** ためた長さ(秒)。 */
    get bufferedSec() {
      return this.sampleRate > 0 ? this.totalSamples / this.sampleRate : 0;
    }
    /** @param {Int16Array} samples */
    append(samples) {
      if (this.done || !samples || samples.length === 0) return;
      this.chunks.push(samples);
      this.totalSamples += samples.length;
      let m = 0;
      for (let i = 0; i < samples.length; i++) {
        const a = Math.abs(samples[i]);
        if (a > m) m = a;
      }
      if (m / 32768 > this.peak) this.peak = m / 32768;
      for (let i = 0; i < samples.length; i++) {
        if (Math.abs(samples[i]) >= 328) {
          const x = samples[i] / 32768;
          this._sumSq += x * x;
          this._voiced++;
        }
      }
      this._emit();
    }
    finish() {
      if (this.done) return;
      this.done = true;
      this._resolveDone(true);
      this._emit();
    }
    fail() {
      if (this.done) return;
      this.done = true;
      this.failed = true;
      this._resolveDone(false);
      this._emit();
    }
    /** 受け取りをやめる(鳴らすのをやめた・読み上げを止めた)。 */
    cancel() {
      const c = this._cancel;
      this._cancel = null;
      if (c) {
        try {
          c();
        } catch {
        }
      }
      this.fail();
    }
    /** @param {() => void} fn @returns {() => void} */
    onUpdate(fn) {
      this._listeners.add(fn);
      return () => {
        this._listeners.delete(fn);
      };
    }
    _emit() {
      for (const fn of [...this._listeners]) {
        try {
          fn();
        } catch {
        }
      }
    }
    /** ためた分を普通の WAV(16bit モノラル)にする。丸ごと再生への切り替え用。 */
    toWav() {
      const dataBytes = this.totalSamples * 2;
      const buf = new ArrayBuffer(44 + dataBytes);
      const dv = new DataView(buf);
      const w = (o, s) => {
        for (let i = 0; i < 4; i++) dv.setUint8(o + i, s.charCodeAt(i));
      };
      w(0, "RIFF");
      dv.setUint32(4, 36 + dataBytes, true);
      w(8, "WAVE");
      w(12, "fmt ");
      dv.setUint32(16, 16, true);
      dv.setUint16(20, 1, true);
      dv.setUint16(22, 1, true);
      dv.setUint32(24, this.sampleRate, true);
      dv.setUint32(28, this.sampleRate * 2, true);
      dv.setUint16(32, 2, true);
      dv.setUint16(34, 16, true);
      w(36, "data");
      dv.setUint32(40, dataBytes, true);
      let off = 44;
      for (const c of this.chunks) {
        for (let i = 0; i < c.length; i++, off += 2) dv.setInt16(off, c[i], true);
      }
      return buf;
    }
  };
  function isStreamedVoice(x) {
    return x instanceof StreamedVoice;
  }
  function createStreamGain(volumePercent, opts = {}) {
    const knownPeak = Number(opts?.knownPeak) > 0 ? Number(opts.knownPeak) : -1;
    const knownRms = Number(opts?.knownRms) > 0 ? Number(opts.knownRms) : -1;
    const tableRms = Number(opts?.tableRms) > 0 ? Number(opts.tableRms) : -1;
    const tablePeak = Number(opts?.tablePeak) > 0 ? Number(opts.tablePeak) : -1;
    const shortText = opts?.shortText === true;
    const pct = normalizeVoiceVolumePercent(volumePercent);
    const target = Math.min(VOICE_PEAK_CEILING, VOICE_TARGET_PEAK_AT_100 * pct / 100);
    let gain = Math.min(VOICE_MAX_BOOST, target / VOICE_STREAM_ASSUMED_PEAK);
    const startGain = gain;
    let outPeak = 0;
    let firstGain = -1;
    let sumSq = 0;
    let voiced = 0;
    return {
      get gain() {
        return gain;
      },
      get outPeak() {
        return outPeak;
      },
      /** 鳴らした音の RMS(無音を除く・0〜1)。 */
      get outRms() {
        return voiced > 0 ? Math.sqrt(sumSq / voiced) : 0;
      },
      /** 鳴らし始めた倍率に対する今の倍率(1=下げていない)。まだ鳴らしていなければ 1。 */
      get dropRatio() {
        return firstGain > 0 ? gain / firstGain : 1;
      },
      targetPeak: target,
      startGain,
      /**
       * @param {Int16Array} samples
       * @returns {Float32Array}
       */
      process(samples) {
        let peak = 0;
        for (let i = 0; i < samples.length; i++) {
          const a = Math.abs(samples[i]);
          if (a > peak) peak = a;
        }
        if (firstGain < 0 && peak > 0) {
          const first = peak / 32768 * VOICE_STREAM_FIRST_PEAK_HEADROOM;
          let firstRms = -1;
          if (shortText || knownRms <= 0 && tableRms <= 0) {
            let sq = 0;
            let n = 0;
            for (let i = 0; i < samples.length; i++) {
              if (Math.abs(samples[i]) >= 328) {
                const x = samples[i] / 32768;
                sq += x * x;
                n++;
              }
            }
            if (n >= VOICE_STREAM_MIN_RMS_SAMPLES) firstRms = Math.sqrt(sq / n);
          }
          if (shortText) {
            if (firstRms > 0) {
              gain = Math.min(
                VOICE_MAX_BOOST,
                target / VOICE_TYPICAL_CREST / Math.max(firstRms, VOICE_STREAM_MIN_EST_RMS),
                VOICE_PEAK_CEILING * 0.9 / Math.max(first, 1e-6)
              );
            } else {
              const est = Math.max(first, VOICE_STREAM_SHORT_MIN_EST_PEAK);
              gain = Math.min(VOICE_MAX_BOOST, target / est);
            }
          } else {
            let estRms = knownRms > 0 ? knownRms : tableRms > 0 ? tableRms : Math.max(firstRms, VOICE_STREAM_MEDIAN_RMS);
            estRms = Math.min(VOICE_STREAM_MAX_EST_RMS, Math.max(VOICE_STREAM_MIN_EST_RMS, estRms));
            gain = Math.min(VOICE_MAX_BOOST, target / VOICE_TYPICAL_CREST / estRms);
            const peakEst = Math.max(first, tablePeak > 0 ? tablePeak : 0, knownPeak > 0 ? knownPeak : 0);
            if (peakEst > 0) gain = Math.min(gain, VOICE_PEAK_CEILING * 0.9 / peakEst);
          }
        }
        if (peak > 0 && peak / 32768 * gain > VOICE_PEAK_CEILING) gain = VOICE_PEAK_CEILING / (peak / 32768);
        if (firstGain < 0) firstGain = gain;
        outPeak = Math.max(outPeak, peak / 32768 * gain);
        const out = new Float32Array(samples.length);
        for (let i = 0; i < samples.length; i++) {
          out[i] = samples[i] / 32768 * gain;
          if (Math.abs(samples[i]) >= 328) {
            sumSq += out[i] * out[i];
            voiced++;
          }
        }
        return out;
      }
    };
  }
  function createStreamedVoiceAudio(voice, deps) {
    const listeners = /* @__PURE__ */ new Map();
    const emit = (type) => {
      for (const fn of [...listeners.get(type) || []]) {
        try {
          fn({ type });
        } catch {
        }
      }
    };
    const sources = /* @__PURE__ */ new Set();
    let scheduledSamples = 0;
    let nextAt = 0;
    let started = false;
    let stopped = false;
    let ended = false;
    let unsubscribe = null;
    let whole = null;
    const tableLevel = voiceStyleTableLevel(voice.styleId, voice.pitchOffset);
    const gain = createStreamGain(deps.volumePercent, {
      knownPeak: knownVoiceStylePeak(voice.styleId, voice.pitchOffset),
      knownRms: knownVoiceStyleRms(voice.styleId, voice.pitchOffset),
      tableRms: tableLevel?.rms,
      tablePeak: tableLevel?.peak,
      shortText: voice.textLength >= 0 && voice.textLength < VOICE_STREAM_LONG_TEXT_CHARS
    });
    let underruns = 0;
    let underrunMaxMs = 0;
    const finishEnded = () => {
      if (ended) return;
      ended = true;
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      emit("ended");
    };
    const schedule = (ctx) => {
      if (stopped || ended) return;
      let skip = scheduledSamples;
      const pending = [];
      for (const c of voice.chunks) {
        if (skip >= c.length) {
          skip -= c.length;
          continue;
        }
        pending.push(skip > 0 ? c.subarray(skip) : c);
        skip = 0;
      }
      const count = pending.reduce((n, c) => n + c.length, 0);
      if (count > 0) {
        const buffer = ctx.createBuffer(1, count, voice.sampleRate);
        const ch = buffer.getChannelData(0);
        let off = 0;
        for (const c of pending) {
          ch.set(gain.process(c), off);
          off += c.length;
        }
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        if (started && nextAt > 0 && nextAt < ctx.currentTime) {
          underruns += 1;
          underrunMaxMs = Math.max(underrunMaxMs, Math.round((ctx.currentTime + 0.02 - nextAt) * 1e3));
        }
        const at = Math.max(nextAt, ctx.currentTime + 0.02);
        nextAt = at + count / voice.sampleRate;
        scheduledSamples += count;
        sources.add(src);
        src.onended = () => {
          sources.delete(src);
          if (voice.done && sources.size === 0 && scheduledSamples >= voice.totalSamples) finishEnded();
        };
        src.start(at);
        if (!started) {
          started = true;
          emit("playing");
        }
      } else if (voice.done && sources.size === 0) {
        if (!started) emit("error");
        finishEnded();
      }
    };
    const playWhole = async () => {
      const ok = await voice.whenDone;
      if (stopped) return;
      if (!ok && voice.totalSamples === 0) {
        emit("error");
        finishEnded();
        return;
      }
      if (typeof deps.playWholeWav !== "function") {
        emit("error");
        finishEnded();
        return;
      }
      let wav = voice.toWav();
      if (typeof deps.wholeWavVolume === "function") wav = deps.wholeWavVolume(wav, deps.volumePercent);
      whole = deps.playWholeWav(wav);
      whole.addEventListener("playing", () => emit("playing"), { once: true });
      whole.addEventListener("ended", () => finishEnded(), { once: true });
      whole.addEventListener("error", () => {
        emit("error");
        finishEnded();
      }, { once: true });
      await whole.play();
    };
    return {
      /** 少しずつ流すときは再生速度を変えない(変えると声の高さも変わるため)。 */
      playbackRate: 1,
      preservesPitch: true,
      /** 聞こえ方の計器(voicePlaybackQuality.js の observeVoicePlayback が読む)。 */
      get quality() {
        return {
          underruns,
          underrunMaxMs,
          outPeak: started && !whole ? gain.outPeak : -1,
          outRms: started && !whole ? gain.outRms : -1,
          gainDropRatio: started && !whole ? gain.dropRatio : 1,
          partial: voice.failed === true && voice.totalSamples > 0
        };
      },
      get duration() {
        return voice.done && voice.sampleRate > 0 ? voice.totalSamples / voice.sampleRate : NaN;
      },
      /** @param {string} type @param {Function} fn */
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, /* @__PURE__ */ new Set());
        listeners.get(type)?.add(fn);
      },
      /** @param {string} type @param {Function} fn */
      removeEventListener(type, fn) {
        listeners.get(type)?.delete(fn);
      },
      async play() {
        let ctx = null;
        try {
          ctx = deps.audioContext();
        } catch {
          ctx = null;
        }
        if (ctx && ctx.state !== "running") {
          try {
            await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 300))]);
          } catch {
          }
        }
        if (stopped) return;
        if (!ctx || ctx.state !== "running") return playWhole();
        const live = (
          /** @type {AudioContext} */
          ctx
        );
        const tryStart = () => {
          if (!started && !voice.done && voice.bufferedSec < VOICE_STREAM_PREBUFFER_SEC) return;
          schedule(live);
        };
        unsubscribe = voice.onUpdate(tryStart);
        tryStart();
      },
      pause() {
        stopped = true;
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        for (const s of sources) {
          try {
            s.stop();
          } catch {
          }
        }
        sources.clear();
        if (whole) {
          try {
            whole.pause();
          } catch {
          }
        }
        voice.cancel();
      }
    };
  }

  // src/lib/voicevoxClient.js
  var VOICEVOX_BASE_URL = "http://127.0.0.1:50021";
  var VOICEVOX_OUTPUT_SAMPLING_RATE = 16e3;
  var _outputSamplingRate = VOICEVOX_OUTPUT_SAMPLING_RATE;
  function setVoicevoxOutputSamplingRate(hz) {
    const n = Number(hz);
    _outputSamplingRate = n === 24e3 ? 24e3 : VOICEVOX_OUTPUT_SAMPLING_RATE;
  }
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
  async function proxyFetchBufferFn(url, init) {
    if (isExtensionPage()) {
      return globalThis.fetch(url, init);
    }
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      return new Promise((resolve, reject) => {
        const safeInit = { ...init };
        if ("signal" in safeInit) delete safeInit.signal;
        chrome.runtime.sendMessage(
          { type: "NLS_FETCH_PROXY", url: url.toString(), init: safeInit, wantBuffer: true },
          (res) => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (!res || res.error) return reject(new Error(res?.error || "Proxy fetch failed"));
            const uint8 = new Uint8Array(res.buffer);
            resolve({ ok: res.ok, status: res.status, arrayBuffer: async () => uint8.buffer });
          }
        );
      });
    }
    return globalThis.fetch(url, init);
  }
  async function proxyStreamFetchFn(url, init) {
    if (isExtensionPage() || typeof chrome === "undefined" || !chrome.runtime?.connect) {
      return globalThis.fetch(url, init);
    }
    const port = chrome.runtime.connect({ name: VOICEVOX_STREAM_PORT });
    const safeInit = { ...init };
    const signal = safeInit.signal;
    delete safeInit.signal;
    return new Promise((resolve, reject) => {
      let ctl = null;
      let headed = false;
      const body = new ReadableStream({
        start(c) {
          ctl = c;
        },
        cancel() {
          try {
            port.disconnect();
          } catch {
          }
        }
      });
      const close = (err) => {
        try {
          if (err) ctl?.error(err);
          else ctl?.close();
        } catch {
        }
      };
      signal?.addEventListener?.("abort", () => {
        try {
          port.disconnect();
        } catch {
        }
        if (!headed) reject(new Error("voicevox_stream_abort"));
        close(new Error("voicevox_stream_abort"));
      });
      port.onMessage.addListener((m) => {
        if (!m || typeof m !== "object") return;
        if (m.type === "head") {
          headed = true;
          resolve({ ok: m.ok === true, status: Number(m.status) || 0, body });
        } else if (m.type === "chunk" && Array.isArray(m.data)) {
          try {
            ctl?.enqueue(Uint8Array.from(m.data));
          } catch {
          }
        } else if (m.type === "end") {
          close(null);
          try {
            port.disconnect();
          } catch {
          }
        } else if (m.type === "error") {
          if (!headed) reject(new Error(String(m.error || "Proxy stream failed")));
          close(new Error(String(m.error || "Proxy stream failed")));
        }
      });
      port.onDisconnect.addListener(() => {
        if (!headed) reject(new Error("Proxy stream disconnected"));
        close(new Error("Proxy stream disconnected"));
      });
      port.postMessage({ type: "start", url: url.toString(), init: safeInit });
    });
  }
  var VOICEVOX_STREAM_PORT = "NLS_VOICEVOX_STREAM";
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
  async function arrayBufferWithTimeout(res, timeoutMs) {
    let timer = 0;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("voicevox_body_timeout")), timeoutMs);
    });
    try {
      return (
        /** @type {ArrayBuffer} */
        await Promise.race([res.arrayBuffer(), timeout])
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
  async function initializeVoicevoxSpeaker(styleId, opts = {}) {
    const id = Number(styleId);
    if (!Number.isInteger(id) || id < 0) return false;
    const fetchFn = opts.fetchFn || proxyFetchFn;
    if (typeof fetchFn !== "function") return false;
    const baseUrl = String(opts.baseUrl || VOICEVOX_BASE_URL).replace(/\/+$/, "");
    try {
      const response = await fetchWithTimeout(
        fetchFn,
        `${baseUrl}/initialize_speaker?speaker=${id}&skip_reinit=true`,
        { method: "POST" },
        positiveTimeout(opts.timeoutMs, 3e4)
      );
      return !!response && response.ok !== false;
    } catch {
      return false;
    }
  }
  async function warmupVoicevoxQuery(styleId, opts = {}) {
    const id = Number(styleId);
    if (!Number.isInteger(id) || id < 0) return false;
    const fetchFn = opts.fetchFn || proxyFetchFn;
    if (typeof fetchFn !== "function") return false;
    const baseUrl = String(opts.baseUrl || VOICEVOX_BASE_URL).replace(/\/+$/, "");
    const query = new URLSearchParams({ text: "あ", speaker: String(id) });
    try {
      const response = await fetchWithTimeout(
        fetchFn,
        `${baseUrl}/audio_query?${query}`,
        { method: "POST" },
        positiveTimeout(opts.timeoutMs, 15e3)
      );
      return !!response && response.ok !== false;
    } catch {
      return false;
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
  var _streamSupport = (
    /** @type {'unknown'|'yes'|'no'} */
    "unknown"
  );
  var _streamRejectedStyles = /* @__PURE__ */ new Set();
  async function probeVoicevoxStreaming(opts = {}) {
    const fetchFn = opts.fetchFn || proxyFetchFn;
    if (typeof fetchFn !== "function") return false;
    const baseUrl = String(opts.baseUrl || VOICEVOX_BASE_URL).replace(/\/+$/, "");
    try {
      const res = await fetchWithTimeout(fetchFn, `${baseUrl}/engine_manifest`, { method: "GET" }, positiveTimeout(opts.timeoutMs, 5e3));
      if (!res || res.ok === false || typeof /** @type {any} */
      res.json !== "function") {
        _streamSupport = "no";
        return false;
      }
      const manifest = await /** @type {any} */
      res.json();
      const ok = manifest?.supported_features?.streaming_synthesis === true;
      _streamSupport = ok ? "yes" : "no";
      return ok;
    } catch {
      return false;
    }
  }
  async function probeVoicevoxGpuCapable(opts = {}) {
    const fetchFn = opts.fetchFn || proxyFetchFn;
    if (typeof fetchFn !== "function") return null;
    const baseUrl = String(opts.baseUrl || VOICEVOX_BASE_URL).replace(/\/+$/, "");
    try {
      const res = await fetchWithTimeout(fetchFn, `${baseUrl}/supported_devices`, { method: "GET" }, positiveTimeout(opts.timeoutMs, 5e3));
      if (!res || res.ok === false || typeof /** @type {any} */
      res.json !== "function") return null;
      const devices = await /** @type {any} */
      res.json();
      if (!devices || typeof devices !== "object") return null;
      return devices.cuda === true || devices.dml === true;
    } catch {
      return null;
    }
  }
  var STREAM_FALLBACK = /* @__PURE__ */ Symbol("stream_fallback");
  async function streamSynthesis(url, audioQuery, styleId, opts, notifyFailure) {
    const streamFetchFn = typeof opts.streamFetchFn === "function" ? opts.streamFetchFn : proxyStreamFetchFn;
    const firstAudioMs = positiveTimeout(opts.synthesisTimeoutMs, 8e3);
    const controller = new AbortController();
    let res;
    let timer = (
      /** @type {any} */
      0
    );
    try {
      res = await Promise.race([
        Promise.resolve().then(() => streamFetchFn(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "audio/wav" },
          body: JSON.stringify(audioQuery),
          signal: controller.signal
        })),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("voicevox_timeout"));
          }, firstAudioMs);
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
    if (!res || res.ok === false) {
      const status = Number(res?.status) || 0;
      if (status === 404 || status === 405 || status === 501) {
        _streamSupport = "no";
        return STREAM_FALLBACK;
      }
      if (status === 422) {
        _streamRejectedStyles.add(styleId);
        return STREAM_FALLBACK;
      }
      notifyFailure({ stage: "synth", httpStatus: status });
      return null;
    }
    const reader = res.body && typeof res.body.getReader === "function" ? res.body.getReader() : null;
    if (!reader) return STREAM_FALLBACK;
    const parser = createWavStreamParser();
    let voice = null;
    return new Promise((resolve) => {
      let settled = false;
      const settle = (v) => {
        if (settled) return;
        settled = true;
        clearTimeout(firstTimer);
        resolve(v);
      };
      const firstTimer = setTimeout(() => {
        try {
          controller.abort();
          void reader.cancel().catch(() => {
          });
        } catch {
        }
        voice?.fail();
        notifyFailure({ stage: "synth", error: new Error("voicevox_timeout") });
        settle(null);
      }, firstAudioMs);
      void (async () => {
        try {
          for (; ; ) {
            let stall = (
              /** @type {any} */
              0
            );
            const next = await Promise.race([
              reader.read(),
              new Promise((_, reject) => {
                stall = setTimeout(() => reject(new Error("voicevox_stream_stall")), VOICE_STREAM_STALL_MS);
              })
            ]).finally(() => clearTimeout(stall));
            const { done, value } = (
              /** @type {{ done: boolean, value?: Uint8Array }} */
              next
            );
            if (done) break;
            const samples = parser.push(value instanceof Uint8Array ? value : new Uint8Array(value || []));
            if (parser.error) throw new Error(`voicevox_stream_${parser.error}`);
            if (samples && samples.length) {
              if (!voice) {
                voice = new StreamedVoice(parser.sampleRate);
                voice._cancel = () => {
                  try {
                    controller.abort();
                    void reader.cancel().catch(() => {
                    });
                  } catch {
                  }
                };
              }
              voice.append(samples);
              if (voice.bufferedSec >= VOICE_STREAM_PREBUFFER_SEC) settle(voice);
            }
            if (voice?.done) return;
          }
          if (voice) {
            voice.finish();
            settle(voice);
          } else {
            notifyFailure({ stage: "synth", bodyInvalid: true });
            settle(null);
          }
        } catch (err) {
          try {
            void reader.cancel().catch(() => {
            });
          } catch {
          }
          if (voice && voice.totalSamples > 0) {
            voice.fail();
            settle(voice);
          } else {
            notifyFailure({ stage: "synth", error: err });
            settle(null);
          }
        }
      })();
    });
  }
  async function streamSynthesisWhole(url, audioQuery, styleId, opts, notifyFailure) {
    const streamFetchFn = typeof opts.streamFetchFn === "function" ? opts.streamFetchFn : proxyStreamFetchFn;
    const totalMs = positiveTimeout(opts.synthesisTimeoutMs, 8e3);
    const controller = new AbortController();
    let reader = null;
    let timer = (
      /** @type {any} */
      0
    );
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        try {
          controller.abort();
          void reader?.cancel?.().catch(() => {
          });
        } catch {
        }
        reject(new Error("voicevox_timeout"));
      }, totalMs);
    });
    try {
      return await Promise.race([timeout, (async () => {
        const res = await streamFetchFn(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "audio/wav" },
          body: JSON.stringify(audioQuery),
          signal: controller.signal
        });
        if (!res || res.ok === false) {
          const status = Number(res?.status) || 0;
          if (status === 404 || status === 405 || status === 501) {
            _streamSupport = "no";
            return STREAM_FALLBACK;
          }
          if (status === 422) {
            _streamRejectedStyles.add(styleId);
            return STREAM_FALLBACK;
          }
          notifyFailure({ stage: "synth", httpStatus: status });
          return null;
        }
        reader = res.body && typeof res.body.getReader === "function" ? res.body.getReader() : null;
        if (!reader) return STREAM_FALLBACK;
        const parts = [];
        let total = 0;
        for (; ; ) {
          const { done, value } = await reader.read();
          if (done) break;
          const part = value instanceof Uint8Array ? value : new Uint8Array(value || []);
          parts.push(part);
          total += part.length;
        }
        const wav = new Uint8Array(total);
        let off = 0;
        for (const part of parts) {
          wav.set(part, off);
          off += part.length;
        }
        const tag = (o) => String.fromCharCode(wav[o], wav[o + 1], wav[o + 2], wav[o + 3]);
        if (total <= 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") {
          notifyFailure({ stage: "synth", bodyInvalid: true });
          return null;
        }
        if (tag(36) === "data") {
          const dv = new DataView(wav.buffer);
          dv.setUint32(4, total - 8, true);
          dv.setUint32(40, total - 44, true);
        }
        return wav.buffer;
      })()]);
    } catch (err) {
      notifyFailure({ stage: "synth", error: err });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  async function synthesizeVoice(text, voice, opts = {}) {
    const readingText = String(text || "").trim();
    const fetchFn = opts.fetchFn || proxyFetchFn;
    const fetchBufferFn = opts.fetchFn ? opts.fetchFn : proxyFetchBufferFn;
    const notifyFailure = (info) => {
      try {
        if (typeof opts.onFailure === "function") opts.onFailure(info);
      } catch {
      }
    };
    if (!readingText || typeof fetchFn !== "function") return null;
    const baseUrl = String(opts.baseUrl || VOICEVOX_BASE_URL).replace(/\/+$/, "");
    const styleId = Number.isFinite(Number(voice?.styleId)) ? Number(voice.styleId) : 3;
    const pitchOffset = Number.isFinite(Number(voice?.pitchOffset)) ? Number(voice.pitchOffset) : 0;
    const speedOffset = Number.isFinite(Number(voice?.speedOffset)) ? Number(voice.speedOffset) : 0;
    const query = new URLSearchParams({
      text: readingText,
      speaker: String(styleId)
    });
    const nowMs = () => Date.now();
    const queryStartAt = nowMs();
    let stage = "query";
    try {
      const queryResponse = await fetchWithTimeout(
        fetchFn,
        `${baseUrl}/audio_query?${query}`,
        { method: "POST" },
        positiveTimeout(opts.audioQueryTimeoutMs, 3e3)
      );
      if (!queryResponse || queryResponse.ok === false) {
        notifyFailure({ stage: "query", httpStatus: Number(queryResponse?.status) || 0 });
        return null;
      }
      const audioQuery = await queryResponse.json();
      if (!audioQuery || typeof audioQuery !== "object") {
        notifyFailure({ stage: "query", bodyInvalid: true });
        return null;
      }
      const pitchScale = Number(audioQuery.pitchScale);
      const speedScale = Number(audioQuery.speedScale);
      audioQuery.pitchScale = (Number.isFinite(pitchScale) ? pitchScale : 0) + pitchOffset;
      audioQuery.speedScale = (Number.isFinite(speedScale) ? speedScale : 1) + speedOffset;
      audioQuery.outputSamplingRate = _outputSamplingRate;
      audioQuery.outputStereo = false;
      const queryMs = nowMs() - queryStartAt;
      stage = "synth";
      const synthStartAt = nowMs();
      if (opts.stream === true && _streamSupport === "yes" && !_streamRejectedStyles.has(styleId)) {
        const streamed = await streamSynthesis(
          `${baseUrl}/streaming_synthesis?speaker=${styleId}&segment_length=${VOICE_STREAM_SEGMENT_SEC}`,
          audioQuery,
          styleId,
          opts,
          notifyFailure
        );
        if (streamed !== STREAM_FALLBACK) {
          if (streamed) {
            try {
              if (typeof opts.onTiming === "function") opts.onTiming({ queryMs, synthMs: nowMs() - synthStartAt, streamed: true });
            } catch {
            }
          }
          return streamed;
        }
      } else if (opts.stream !== true && opts.wholeViaStream !== false && _streamSupport === "yes" && !_streamRejectedStyles.has(styleId)) {
        const whole = await streamSynthesisWhole(
          `${baseUrl}/streaming_synthesis?speaker=${styleId}&segment_length=${VOICE_STREAM_SEGMENT_SEC}`,
          audioQuery,
          styleId,
          opts,
          notifyFailure
        );
        if (whole !== STREAM_FALLBACK) {
          if (whole) {
            try {
              if (typeof opts.onTiming === "function") opts.onTiming({ queryMs, synthMs: nowMs() - synthStartAt });
            } catch {
            }
          }
          return whole;
        }
      }
      const synthesisRes = await fetchWithTimeout(
        fetchBufferFn,
        `${baseUrl}/synthesis?speaker=${styleId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "audio/wav"
          },
          body: JSON.stringify(audioQuery)
        },
        positiveTimeout(opts.synthesisTimeoutMs, 8e3)
      );
      if (!synthesisRes || synthesisRes.ok === false) {
        notifyFailure({ stage: "synth", httpStatus: Number(synthesisRes?.status) || 0 });
        return null;
      }
      const wav = await arrayBufferWithTimeout(
        synthesisRes,
        positiveTimeout(opts.synthesisTimeoutMs, 8e3)
      );
      try {
        if (typeof opts.onTiming === "function") opts.onTiming({ queryMs, synthMs: nowMs() - synthStartAt });
      } catch {
      }
      return wav;
    } catch (err) {
      notifyFailure({ stage, error: err });
      return null;
    }
  }
  function buildVoiceReadingText(row, { maxChars = 60 } = {}) {
    const rawText = String(row?.text || "").trim();
    if (!rawText) return "";
    const rawMaxChars = Number(maxChars);
    const limit = Number.isFinite(rawMaxChars) && rawMaxChars >= 1 ? Math.floor(rawMaxChars) : 60;
    const body = Array.from(normalizeVoiceReadingBody(rawText)).slice(0, limit).join("");
    if (!body) return "";
    const name = normalizeVoiceReadingBody(String(row?.name || ""));
    return name ? `${name}、${body}` : body;
  }
  function buildMergedVoiceText(item, { maxChars } = {}) {
    const text = buildVoiceReadingText(
      { name: item?.name, text: item?.body },
      { maxChars }
    );
    if (!text) return "";
    const rawCount = Number(item?.count);
    const count = Number.isFinite(rawCount) && rawCount >= 1 ? Math.floor(rawCount) : 1;
    return count > 1 ? `${text}、ほか${count - 1}件` : text;
  }

  // src/extension/voiceQualitySetting.js
  var _wired = false;
  function wireVoiceQualitySetting() {
    if (_wired) return;
    _wired = true;
    try {
      void chrome.storage.local.get(KEY_VOICE_QUALITY).then((bag) => {
        setVoicevoxOutputSamplingRate(voiceQualitySamplingRate(bag?.[KEY_VOICE_QUALITY]));
      }).catch(() => {
      });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !changes || !changes[KEY_VOICE_QUALITY]) return;
        setVoicevoxOutputSamplingRate(voiceQualitySamplingRate(changes[KEY_VOICE_QUALITY].newValue));
      });
    } catch {
    }
  }

  // src/extension/comeviewLivePushClient.js
  var COMEVIEW_LIVE_RECONNECT_MS = 5e3;
  var WATCH_TAB_URLS = ["https://live.nicovideo.jp/watch/*", "https://live2.nicovideo.jp/watch/*"];
  function createComeviewLivePushClient(deps) {
    let port = null;
    let portLiveId = "";
    let retryTimer = null;
    let connecting = false;
    function scheduleRetry() {
      if (retryTimer || !deps.isActive()) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void ensure();
      }, COMEVIEW_LIVE_RECONNECT_MS);
    }
    function close() {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      const p = port;
      port = null;
      portLiveId = "";
      try {
        p?.disconnect();
      } catch {
      }
    }
    async function ensure() {
      const liveId = String(deps.getLiveId() || "");
      if (!deps.isActive() || !liveId) {
        close();
        return;
      }
      if (port && portLiveId === liveId) return;
      if (connecting) return;
      if (port) close();
      connecting = true;
      try {
        const tabs = await chrome.tabs.query({ url: WATCH_TAB_URLS });
        const tabId = pickWatchTabIdForLive(tabs, liveId);
        if (tabId == null || !deps.isActive() || deps.getLiveId() !== liveId) {
          scheduleRetry();
          return;
        }
        const p = chrome.tabs.connect(tabId, { name: COMEVIEW_LIVE_PORT_NAME });
        port = p;
        portLiveId = liveId;
        p.onMessage.addListener((msg) => {
          const parsed = parseComeviewLiveMessage(msg);
          if (!parsed || parsed.liveId !== deps.getLiveId()) return;
          try {
            deps.onRows(parsed.liveId, parsed.rows);
          } catch {
          }
        });
        p.onDisconnect.addListener(() => {
          void chrome.runtime.lastError;
          if (port === p) {
            port = null;
            portLiveId = "";
          }
          scheduleRetry();
        });
      } catch {
        scheduleRetry();
      } finally {
        connecting = false;
      }
    }
    return { ensure, close };
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

  // src/lib/voiceLagBudget.js
  function updateVoiceServiceTimeEma(prevMs, sampleMs, alpha = 0.3) {
    const sample = Math.max(0, Number(sampleMs) || 0);
    const prev = Number(prevMs);
    if (!Number.isFinite(prev) || prev < 0) return sample;
    return prev + alpha * (sample - prev);
  }
  function foldVoiceArrivalWindow(state, nowMs, count = 1, windowMs = 1e4, alpha = 0.3) {
    const now = Number(nowMs);
    const safeNow = Number.isFinite(now) ? now : 0;
    const addCount = Math.max(0, Math.floor(Number(count) || 0));
    const s = state && typeof state === "object" ? state : {};
    const prevStart = Number(s.windowStartMs);
    const prevCount = Math.max(0, Math.floor(Number(s.windowCount) || 0));
    const prevRate = Number(s.arrivalPerMin);
    if (!Number.isFinite(prevStart)) {
      return { windowStartMs: safeNow, windowCount: addCount, arrivalPerMin: Number.isFinite(prevRate) && prevRate >= 0 ? prevRate : -1 };
    }
    const elapsed = safeNow - prevStart;
    if (elapsed < windowMs) {
      return { windowStartMs: prevStart, windowCount: prevCount + addCount, arrivalPerMin: Number.isFinite(prevRate) && prevRate >= 0 ? prevRate : -1 };
    }
    const closedCount = prevCount + addCount;
    const safeElapsed = Math.max(1, elapsed);
    const sampleRate = closedCount * 6e4 / safeElapsed;
    const nextRate = !Number.isFinite(prevRate) || prevRate < 0 ? sampleRate : prevRate + alpha * (sampleRate - prevRate);
    return { windowStartMs: safeNow, windowCount: 0, arrivalPerMin: nextRate };
  }
  var VOICE_SUSTAINED_BOOST_MAX = 0.8;
  var VOICE_BACKLOG_WAIT_START_MS = 1500;
  var VOICE_BACKLOG_BOOST_MAX = 0.3;
  function computeBacklogCatchUpBoost(queueWaitMs, paceFloor = 0) {
    const w = Number(queueWaitMs);
    const floor = Number.isFinite(Number(paceFloor)) ? Math.max(0, Number(paceFloor)) : 0;
    const byWait = Number.isFinite(w) && w > VOICE_BACKLOG_WAIT_START_MS ? (w - VOICE_BACKLOG_WAIT_START_MS) / 1e3 * 0.1 : 0;
    return Math.min(VOICE_BACKLOG_BOOST_MAX, floor + byWait);
  }
  var VOICE_PACE_MIN_SAMPLES = 3;
  var VOICE_PACE_GAP_CAP_MS = 2e4;
  var VOICE_PACE_EMA_ALPHA = 0.3;
  var VOICE_PACE_FLOOR_MARGIN = 0.03;
  function createVoicePaceState() {
    return { lastArrivalAt: -1, gapEmaMs: -1, gapCount: 0, naturalEmaMs: -1, naturalCount: 0, charMsEma: -1 };
  }
  function resetVoicePaceArrival(state) {
    if (!state) return;
    state.lastArrivalAt = -1;
    state.gapEmaMs = -1;
    state.gapCount = 0;
  }
  function paceEma(prev, sample) {
    return prev < 0 ? sample : prev + VOICE_PACE_EMA_ALPHA * (sample - prev);
  }
  function noteVoicePaceArrival(state, nowMs) {
    if (!state) return;
    const now = Number(nowMs);
    if (!Number.isFinite(now)) return;
    if (state.lastArrivalAt >= 0 && now >= state.lastArrivalAt) {
      const gap = Math.min(VOICE_PACE_GAP_CAP_MS, now - state.lastArrivalAt);
      state.gapEmaMs = paceEma(state.gapEmaMs, gap);
      state.gapCount += 1;
    }
    state.lastArrivalAt = now;
  }
  function noteVoicePacePlayed(state, playedMs, playbackRate = 1, boostAtSynth = 0, chars = 0) {
    if (!state) return;
    const ms = Number(playedMs);
    if (!Number.isFinite(ms) || ms <= 0) return;
    const rate = Number(playbackRate) > 0 ? Number(playbackRate) : 1;
    const boost = Number(boostAtSynth) > 0 ? Number(boostAtSynth) : 0;
    const natural = ms * rate * (1 + boost);
    state.naturalEmaMs = paceEma(state.naturalEmaMs, natural);
    state.naturalCount += 1;
    const n = Math.floor(Number(chars));
    if (n > 0) state.charMsEma = paceEma(state.charMsEma, natural / n);
  }
  function computeVoicePaceFloor(state) {
    if (!state || state.gapCount < VOICE_PACE_MIN_SAMPLES || state.naturalCount < VOICE_PACE_MIN_SAMPLES) return 0;
    if (!(state.gapEmaMs > 0) || !(state.naturalEmaMs > 0)) return 0;
    const over = state.naturalEmaMs / state.gapEmaMs - 1;
    return over > 0 ? Math.min(VOICE_BACKLOG_BOOST_MAX, over + VOICE_PACE_FLOOR_MARGIN) : 0;
  }
  function mergeVoiceSpeedBoost(congestionBoost, sustainedBoost) {
    const a = Number(congestionBoost);
    const b = Number(sustainedBoost);
    const base = Number.isFinite(a) && a > 0 ? a : 0;
    const extra = Number.isFinite(b) && b > 0 ? b : 0;
    return Math.min(VOICE_SUSTAINED_BOOST_MAX, Math.max(base, extra));
  }

  // src/extension/voiceStreamAudio.js
  var sharedContext = null;
  function getAudioContext() {
    if (sharedContext) return sharedContext;
    const Ctor = globalThis.AudioContext || /** @type {any} */
    globalThis.webkitAudioContext;
    if (typeof Ctor !== "function") return null;
    try {
      sharedContext = new Ctor();
    } catch {
      sharedContext = null;
    }
    return sharedContext;
  }
  function playWholeWav(wav) {
    const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
    const audio = new Audio(url);
    const revoke = () => URL.revokeObjectURL(url);
    audio.addEventListener("ended", revoke, { once: true });
    audio.addEventListener("error", revoke, { once: true });
    return audio;
  }
  function createBrowserStreamedAudio(voice, volumePercent) {
    return createStreamedVoiceAudio(voice, {
      audioContext: getAudioContext,
      volumePercent,
      playWholeWav,
      wholeWavVolume: applyVoiceVolumeToWav
    });
  }

  // src/lib/voiceReaderLease.js
  var VOICE_READER_LEASE_TTL_MS = 6e3;
  var VOICE_READER_LEASE_BEAT_MS = 2e3;
  var VOICE_READER_LEASE_QUERY_TIMEOUT_MS = 500;
  var VOICE_READER_CLAIM = "NLS_VOICE_READER_CLAIM";
  var VOICE_READER_RELEASE = "NLS_VOICE_READER_RELEASE";
  function createVoiceReaderLeaseLink(sendMessage, opts = {}) {
    const now = opts.now || (() => Date.now());
    const holder = opts.holder || `r${Math.random().toString(36).slice(2, 10)}${now().toString(36)}`;
    let lastLive = "";
    let lastGranted = true;
    let lastAnswerAt = -Infinity;
    let lastSentAt = -Infinity;
    let inflight = null;
    const claim = (lv) => {
      if (!inflight) inflight = claimOnce(lv).finally(() => {
        inflight = null;
      });
      return inflight;
    };
    const claimOnce = async (lv) => {
      lastSentAt = now();
      let timer = null;
      try {
        const res = await Promise.race([
          Promise.resolve(sendMessage({ type: VOICE_READER_CLAIM, liveId: lv, holder })),
          new Promise((r) => {
            timer = setTimeout(() => r(null), VOICE_READER_LEASE_QUERY_TIMEOUT_MS);
          })
        ]);
        const granted = res && typeof res === "object" ? (
          /** @type {any} */
          res.granted
        ) : void 0;
        if (lv !== lastLive) return;
        lastGranted = granted !== false;
        lastAnswerAt = now();
      } catch {
        if (lv === lastLive) {
          lastGranted = true;
          lastAnswerAt = now();
        }
      } finally {
        if (timer !== null) clearTimeout(
          /** @type {any} */
          timer
        );
      }
    };
    const norm = (liveId) => String(liveId || "").trim().toLowerCase();
    let chain = Promise.resolve();
    const link = {
      holder,
      /** 読んでいる間の合図(定期的に呼ぶ)。 */
      beat(liveId) {
        const lv = norm(liveId);
        if (!lv) return Promise.resolve();
        if (lv !== lastLive) {
          lastLive = lv;
          lastGranted = true;
          lastAnswerAt = -Infinity;
        }
        return claim(lv);
      },
      /**
       * 読んでよいか(届いた順に答える)。
       * @param {unknown} liveId
       * @returns {Promise<boolean>}
       */
      async check(liveId) {
        const lv = norm(liveId);
        if (!lv) return true;
        if (lv !== lastLive) {
          lastLive = lv;
          lastGranted = true;
          lastAnswerAt = -Infinity;
        }
        const isFresh = () => now() - lastAnswerAt <= VOICE_READER_LEASE_TTL_MS;
        if (!isFresh()) await claim(lv);
        else if (now() - lastSentAt >= VOICE_READER_LEASE_BEAT_MS / 2) void claim(lv);
        return !isFresh() || lastGranted;
      },
      /**
       * 読んでよければ onMine、もう片方が読んでいれば onYield を呼ぶ(届いた順を崩さない)。
       * @param {unknown} liveId
       * @param {() => unknown} onMine
       * @param {() => unknown} [onYield]
       */
      whenMine(liveId, onMine, onYield) {
        chain = chain.then(() => link.check(liveId)).then((ok) => ok ? onMine() : onYield?.()).catch(() => {
        });
        return chain;
      },
      /** もう読まない(窓を閉じる・読み上げを切った)。 */
      release() {
        lastGranted = true;
        lastAnswerAt = -Infinity;
        try {
          const r = sendMessage({ type: VOICE_READER_RELEASE, holder });
          if (r && typeof /** @type {any} */
          r.catch === "function") r.catch(() => {
          });
        } catch {
        }
      }
    };
    return link;
  }
  function chromeVoiceReaderLeaseLink() {
    const rt = typeof chrome !== "undefined" ? chrome.runtime : void 0;
    if (!rt || typeof rt.sendMessage !== "function") return null;
    return createVoiceReaderLeaseLink((msg) => rt.sendMessage(msg));
  }
  function startVoiceReaderLease(isActive, liveId, opts = {}) {
    const link = opts.link !== void 0 ? opts.link : chromeVoiceReaderLeaseLink();
    if (!link) return null;
    let beating = false;
    setInterval(() => {
      if (isActive()) {
        void link.beat(liveId());
        beating = true;
      } else if (beating) {
        link.release();
        beating = false;
      }
    }, VOICE_READER_LEASE_BEAT_MS);
    if (typeof opts.onPageHide === "function") opts.onPageHide(() => link.release());
    return link;
  }

  // src/lib/voiceNarrowing.js
  var VOICE_NARROW_STYLE_IDS = Object.freeze([3, 2, 8, 10, 13, 14]);
  var VOICE_CAPPED_STYLE_IDS = Object.freeze([3, 2, 8, 10, 13, 14, 11, 21, 20, 46, 0, 4, 6, 1, 7, 5, 81, 82, 83, 84, 85, 66, 77, 78, 79, 80]);
  var VOICE_WEAK_PC_WARM_SYNTH_MS = 500;
  var VOICE_WEAK_PC_COLD_SYNTH_MS = 3e3;
  var VOICE_WEAK_PC_MIN_WARM_SAMPLES = 5;
  var VOICE_FAST_PC_MIN_WARM_SAMPLES = 10;
  var VOICE_WEAK_PC_RTF_PERMILLE = 400;
  function isWarmSynthSlow(diag, minSamples) {
    const rtf = Number(diag?.warmSynthRtfPermille);
    const rtfSamples = Number(diag?.warmRtfSamples) || 0;
    if (rtfSamples > 0) {
      if (rtfSamples < minSamples || !Number.isFinite(rtf) || rtf < 0) return null;
      return rtf >= VOICE_WEAK_PC_RTF_PERMILLE;
    }
    const warm = Number(diag?.warmSynthEmaMs);
    const samples = Number(diag?.warmSynthSamples) || 0;
    if (samples >= minSamples && Number.isFinite(warm) && warm >= 0) return warm >= VOICE_WEAK_PC_WARM_SYNTH_MS;
    return null;
  }
  function isWeakVoicePc(diag) {
    const cold = Number(diag?.coldSynthMaxMs);
    if (isWarmSynthSlow(diag, VOICE_WEAK_PC_MIN_WARM_SAMPLES) === true) return true;
    if (Number.isFinite(cold) && cold >= VOICE_WEAK_PC_COLD_SYNTH_MS) return true;
    return false;
  }
  function narrowVoiceStyleIds(availableStyleIds, weak) {
    return pickFromTable(availableStyleIds, weak ? VOICE_NARROW_STYLE_IDS : null);
  }
  function pickFromTable(availableStyleIds, table) {
    const available = Array.isArray(availableStyleIds) ? availableStyleIds.map(Number) : [];
    if (!table) return available;
    const have = new Set(available);
    const picked = table.filter((id) => have.has(id));
    return picked.length >= 2 ? picked : available;
  }
  var VOICE_NARROW_MODES = Object.freeze(["off", "auto", "on"]);
  function normalizeVoiceNarrowMode(raw) {
    return raw === "off" || raw === "on" ? raw : "auto";
  }
  function isVoiceNarrowActive(mode, weakRemembered) {
    const m = normalizeVoiceNarrowMode(mode);
    return m === "on" || m === "auto" && weakRemembered === true;
  }
  async function prepareVoiceStyleIds(allStyleIds, deps) {
    const all = Array.isArray(allStyleIds) ? allStyleIds.map(Number) : [];
    let settings = {};
    try {
      settings = await deps.readSettings() || {};
    } catch {
      settings = {};
    }
    const active = isVoiceNarrowActive(settings.mode, settings.weak);
    const capped = !active && normalizeVoiceNarrowMode(settings.mode) === "auto";
    const styleIds = active ? narrowVoiceStyleIds(all, true) : pickFromTable(all, capped ? VOICE_CAPPED_STYLE_IDS : null);
    const narrowed = active && styleIds.length < all.length;
    if (narrowed && typeof deps.initSpeaker === "function") {
      const init = deps.initSpeaker;
      void (async () => {
        for (const id of styleIds) {
          try {
            await init(id);
          } catch {
          }
        }
      })();
    }
    return { styleIds, narrowed };
  }
  function rememberWeakVoicePc(diag, state, write) {
    if (state.saved || !isWeakVoicePc(diag)) return;
    state.saved = true;
    Promise.resolve().then(() => write(true)).catch(() => {
    });
  }
  function isFastVoicePc(diag) {
    const cold = Number(diag?.coldSynthMaxMs) || 0;
    return isWarmSynthSlow(diag, VOICE_FAST_PC_MIN_WARM_SAMPLES) === false && cold < VOICE_WEAK_PC_COLD_SYNTH_MS;
  }
  function forgetWeakVoicePcIfFast(diag, state, clear) {
    if (state.cleared || !isFastVoicePc(diag)) return;
    state.cleared = true;
    Promise.resolve().then(() => clear()).catch(() => {
    });
  }

  // src/lib/voiceEngineActivity.js
  var VOICE_ENGINE_PING_MIN_INTERVAL_MS = 500;
  var VOICE_ENGINE_QUIET_QUERY_TIMEOUT_MS = 500;
  function createVoiceEngineActivityLink(sendMessage, opts = {}) {
    const now = opts.now || (() => Date.now());
    let lastPingAt = -Infinity;
    return {
      /** 合成・読み込みを始めた/終えた合図(間引いて送る・失敗は無視)。 */
      ping() {
        const t = now();
        if (t - lastPingAt < VOICE_ENGINE_PING_MIN_INTERVAL_MS) return;
        lastPingAt = t;
        try {
          const r = sendMessage({ type: "NLS_VOICE_ENGINE_ACTIVITY" });
          if (r && typeof /** @type {any} */
          r.catch === "function") r.catch(() => {
          });
        } catch {
        }
      },
      /**
       * どちらかのページが最後に VOICEVOX を使ってから何 ms たったか。分からなければ Infinity。
       * @returns {Promise<number>}
       */
      async quietMs() {
        let timer = null;
        try {
          const res = await Promise.race([
            Promise.resolve(sendMessage({ type: "NLS_VOICE_ENGINE_QUIET" })),
            new Promise((r) => {
              timer = setTimeout(() => r(null), VOICE_ENGINE_QUIET_QUERY_TIMEOUT_MS);
            })
          ]);
          const raw = res && typeof res === "object" ? (
            /** @type {any} */
            res.quietMs
          ) : void 0;
          return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : Infinity;
        } catch {
          return Infinity;
        } finally {
          if (timer !== null) clearTimeout(
            /** @type {any} */
            timer
          );
        }
      }
    };
  }
  function chromeVoiceEngineLink() {
    const rt = typeof chrome !== "undefined" ? chrome.runtime : void 0;
    if (!rt || typeof rt.sendMessage !== "function") return null;
    return createVoiceEngineActivityLink((msg) => rt.sendMessage(msg));
  }

  // src/lib/voiceWarmup.js
  var VOICE_IDLE_INIT_DELAY_MS = 1500;
  var VOICE_REMOTE_QUIET_MS = 4e3;
  var VOICE_BUSY_PING_INTERVAL_MS = 1e3;
  var VOICE_STREAM_GATE_MAX_MS = 8e3;
  var VOICE_WARMUP_QUERY_TIMEOUT_MS = 8e3;
  function createVoiceWarmup(deps) {
    const now = typeof deps?.now === "function" ? deps.now : () => Date.now();
    const setT = typeof deps?.setTimeout === "function" ? deps.setTimeout : (fn, ms) => setTimeout(fn, ms);
    const clearT = typeof deps?.clearTimeout === "function" ? deps.clearTimeout : (h) => clearTimeout(h);
    const warm = /* @__PURE__ */ new Set();
    const inflight = /* @__PURE__ */ new Map();
    const failed = /* @__PURE__ */ new Set();
    let chain = Promise.resolve();
    let pending = 0;
    let epoch = 0;
    let engineWarmed = false;
    let primePromise = null;
    const later = /* @__PURE__ */ new Set();
    const waiters = /* @__PURE__ */ new Map();
    let active = 0;
    let pumpTimer = null;
    let lastActivityAt = -Infinity;
    let hooks = {};
    let remoteChecking = false;
    function signalActivity() {
      try {
        if (typeof hooks.onActivity === "function") hooks.onActivity();
      } catch {
      }
    }
    let streamGate = null;
    function settle(key, ok) {
      later.delete(key);
      const list = waiters.get(key);
      if (!list) return;
      waiters.delete(key);
      for (const fn of list) fn(ok);
    }
    function waitGate(gate) {
      let timer = null;
      return Promise.race([
        gate.then(() => {
        }, () => {
        }),
        new Promise((r) => {
          timer = setT(() => r(void 0), VOICE_STREAM_GATE_MAX_MS);
        })
      ]).then(() => {
        if (timer !== null) clearT(timer);
      });
    }
    function pump() {
      if (pumpTimer !== null || remoteChecking || later.size === 0) return;
      pumpTimer = setT(() => {
        pumpTimer = null;
        if (later.size === 0) return;
        if (!locallyIdle()) {
          pump();
          return;
        }
        if (typeof hooks.engineQuietMs !== "function") {
          startNext();
          return;
        }
        remoteChecking = true;
        const ask = (
          /** @type {() => Promise<number>} */
          hooks.engineQuietMs
        );
        void Promise.resolve().then(ask).then((q) => q, () => Infinity).then((q) => {
          remoteChecking = false;
          if (!(Number(q) >= VOICE_REMOTE_QUIET_MS)) {
            try {
              if (typeof hooks.onRemoteBusy === "function") hooks.onRemoteBusy();
            } catch {
            }
            pump();
            return;
          }
          if (!locallyIdle()) {
            pump();
            return;
          }
          startNext();
        });
      }, VOICE_IDLE_INIT_DELAY_MS);
    }
    function locallyIdle() {
      let playerIdle = true;
      try {
        playerIdle = typeof hooks.isIdle === "function" ? hooks.isIdle() !== false : true;
      } catch {
        playerIdle = true;
      }
      return active === 0 && pending === 0 && playerIdle && now() - lastActivityAt >= VOICE_IDLE_INIT_DELAY_MS;
    }
    function startNext() {
      if (later.size === 0) return;
      const key = (
        /** @type {string} */
        later.values().next().value
      );
      later.delete(key);
      void ensureInternal(Number(key), true).then(() => {
      }, () => {
      });
    }
    function enqueue(task) {
      pending += 1;
      const p = chain.then(task, task);
      chain = p.then(() => {
      }, () => {
      });
      return p.finally(() => {
        pending -= 1;
        pump();
      });
    }
    const keyOf = (styleId) => String(Number(styleId));
    function ensureInternal(styleId, background) {
      const id = Number(styleId);
      if (!Number.isInteger(id) || id < 0) return Promise.resolve(false);
      const key = keyOf(id);
      if (warm.has(key)) return Promise.resolve(true);
      if (failed.has(key)) return Promise.resolve(false);
      const existing = inflight.get(key);
      if (existing) return existing;
      const myEpoch = epoch;
      const p = enqueue(async () => {
        if (myEpoch !== epoch) return false;
        if (warm.has(key)) return true;
        let ok = false;
        const t0 = now();
        signalActivity();
        try {
          ok = !!await deps.initSpeaker(id);
        } catch {
          ok = false;
        }
        signalActivity();
        try {
          if (typeof hooks.onInit === "function") hooks.onInit(Math.max(0, now() - t0), background);
        } catch {
        }
        if (myEpoch === epoch) (ok ? warm : failed).add(key);
        return ok;
      }).then((ok) => {
        if (myEpoch === epoch) settle(key, ok);
        return ok;
      }).finally(() => {
        if (inflight.get(key) === p) inflight.delete(key);
      });
      inflight.set(key, p);
      return p;
    }
    const api = {
      /** @param {unknown} styleId */
      isWarm(styleId) {
        return warm.has(keyOf(styleId));
      },
      /** 合成に成功した声は温まっている。 @param {unknown} styleId */
      markWarm(styleId) {
        const id = Number(styleId);
        if (Number.isInteger(id) && id >= 0) warm.add(keyOf(id));
      },
      /** 列で読み込みを待っている・実行中のものがあるか。 */
      busy() {
        return pending > 0;
      },
      /**
       * まだ温まっていない声を読み込む(列で順番に)。同じ声を同時に頼まれたら1回にまとめる。
       * @param {unknown} styleId
       * @returns {Promise<boolean>} 読み込めたら true(すでに温まっていても true)
       */
      ensure(styleId) {
        return ensureInternal(styleId, false);
      },
      /**
       * 読み上げ ON の直後に1回だけ、捨てる audio_query でエンジンを起こす(待たない呼び方でよい)。
       * @param {unknown} styleId
       * @returns {Promise<boolean>}
       */
      primeEngine(styleId) {
        const id = Number(styleId);
        if (engineWarmed || typeof deps.warmQuery !== "function" || !Number.isInteger(id) || id < 0) {
          return Promise.resolve(false);
        }
        engineWarmed = true;
        const myEpoch = epoch;
        const warmQuery = deps.warmQuery;
        const p = enqueue(async () => {
          if (myEpoch !== epoch) return false;
          let ok = false;
          try {
            ok = !!await warmQuery(id);
          } catch {
            ok = false;
          }
          if (ok && myEpoch === epoch) warm.add(keyOf(id));
          return ok;
        });
        primePromise = p;
        return p;
      },
      /** エンジンを起こしている最中なら、その約束(無ければ null)。 */
      priming() {
        return primePromise;
      },
      /**
       * 合成が1件も走っていない時に、裏で1つずつ読み込む(待たせない読み込み)。
       * @param {unknown} styleId
       * @returns {Promise<boolean>} 読み込めたら true
       */
      ensureWhenIdle(styleId) {
        const id = Number(styleId);
        if (!Number.isInteger(id) || id < 0) return Promise.resolve(false);
        const key = keyOf(id);
        if (warm.has(key)) return Promise.resolve(true);
        if (failed.has(key)) return Promise.resolve(false);
        const existing = inflight.get(key);
        if (existing) return existing;
        later.add(key);
        const p = new Promise((resolve) => {
          const list = waiters.get(key) || [];
          list.push(resolve);
          waiters.set(key, list);
        });
        pump();
        return (
          /** @type {Promise<boolean>} */
          p
        );
      },
      /**
       * まだ温まっていない声の代わりに今すぐ読む声。温まった声が無ければ null。
       *   決まった順(絞り込みの固定表→番号順)に並べ、頼まれた声の番号で選ぶ=同じ状態なら同じ声。
       * @param {unknown} styleId
       * @returns {number|null}
       */
      borrowFor(styleId) {
        const ids = [...warm].map(Number);
        if (!ids.length) return null;
        const inPalette = VOICE_NARROW_STYLE_IDS.filter((x) => ids.includes(x));
        const rest = ids.filter((x) => !VOICE_NARROW_STYLE_IDS.includes(x)).sort((a, b) => a - b);
        const order = [...inPalette, ...rest];
        const n = Math.abs(Math.floor(Number(styleId))) || 0;
        return order[n % order.length];
      },
      /**
       * 合成を始める前に呼ぶ。少しずつ受け取り中の声があれば、届き終わるまで(上限つきで)待つ約束を返す。
       *   無ければ null(=待たずに同期で合成を始められる)。
       * @returns {Promise<void>|null}
       */
      beforeSynth() {
        active += 1;
        lastActivityAt = now();
        signalActivity();
        const gate = streamGate;
        if (!gate) return null;
        return waitGate(gate);
      },
      /**
       * 少しずつ受け取る合成を【頼む時点】で門を閉じる(v0.1.1773)。返事を待つ間に並んで始まった先読みが
       *   エンジンを取り合い、鳴り始めた声の続きが間に合わなかった(グラボ無し・一気に10件で 1.1秒の無音)。
       * @returns {(result: unknown) => void} 合成の結果を渡すと、届き終わった時に門を開ける
       */
      closeStreamGate() {
        let open = () => {
        };
        const g = new Promise((r) => {
          open = r;
        });
        streamGate = g;
        return (result) => {
          const release = () => {
            if (streamGate === g) streamGate = null;
            open();
          };
          if (isStreamedVoice(result)) void result.whenDone.then(release, release);
          else release();
        };
      },
      /**
       * 再生側の様子と計器をつなぐ(v0.1.1777)。isIdle: 再生も順番待ちも無い時 true。
       *   onInit: 声を読み込んだ時間(ms)と、裏の読み込みだったか。
       *   v0.1.1781: onActivity(合成・読み込みの合図) / engineQuietMs(両ページ通して静かな時間) / onRemoteBusy(計器)。
       * @param {{ isIdle?: () => boolean, onInit?: (ms: number, background: boolean) => void, onActivity?: () => void, engineQuietMs?: () => Promise<number>, onRemoteBusy?: () => void }} h
       */
      setHooks(h) {
        hooks = h && typeof h === "object" ? h : {};
      },
      /** 走っている合成の数(少しずつ受け取り中も含む)。 */
      activeCount() {
        return active;
      },
      /**
       * 合成が終わったら呼ぶ。少しずつ受け取った声は、届き終わってから「終わった」にする。
       * @param {unknown} result
       */
      afterSynth(result) {
        const done = () => {
          active = Math.max(0, active - 1);
          lastActivityAt = now();
          signalActivity();
          pump();
        };
        if (isStreamedVoice(result)) {
          void result.whenDone.then(done, done);
          return;
        }
        done();
      },
      /** 読み上げ ON のたびに呼ぶ(エンジンが再起動していても温まった扱いにしない)。 */
      reset() {
        epoch += 1;
        warm.clear();
        failed.clear();
        inflight.clear();
        engineWarmed = false;
        primePromise = null;
        if (pumpTimer !== null) {
          clearT(pumpTimer);
          pumpTimer = null;
        }
        for (const key of [...waiters.keys()]) settle(key, false);
        later.clear();
      },
      now
    };
    return api;
  }
  function createVoicevoxWarmup() {
    return createVoiceWarmup({
      initSpeaker: (id) => initializeVoicevoxSpeaker(id, { timeoutMs: 15e3 }),
      warmQuery: (id) => warmupVoicevoxQuery(id)
    });
  }
  function withVoiceWarmup(warmup, synth) {
    if (!warmup) return synth;
    return async (text, voice, opts = {}) => {
      const raw = Number(voice?.styleId);
      const styleId = Number.isFinite(raw) ? raw : 3;
      const startAt = warmup.now();
      let useStyle = styleId;
      let borrowed = false;
      if (!warmup.isWarm(styleId)) {
        const priming = warmup.priming();
        if (priming && warmup.borrowFor(styleId) === null) {
          try {
            await priming;
          } catch {
          }
        }
        const sub = warmup.borrowFor(styleId);
        if (sub !== null && sub !== styleId) {
          useStyle = sub;
          borrowed = true;
          void warmup.ensureWhenIdle(styleId);
        } else if (sub === null) {
          try {
            await warmup.ensure(styleId);
          } catch {
          }
        }
      }
      const initMs = Math.max(0, warmup.now() - startAt);
      const streamOk = opts?.stream === true && warmup.activeCount() === 0 && !warmup.busy();
      const callOpts = { ...opts };
      if (!streamOk) delete callOpts.stream;
      const gate = warmup.beforeSynth();
      if (gate) await gate;
      const releaseStream = streamOk ? warmup.closeStreamGate() : null;
      const busyAtStart = warmup.busy();
      const onTiming = opts?.onTiming;
      let wav = null;
      try {
        wav = await synth(text, borrowed ? { ...voice, styleId: useStyle } : voice, {
          ...callOpts,
          audioQueryTimeoutMs: Math.max(Number(opts?.audioQueryTimeoutMs) || 0, VOICE_WARMUP_QUERY_TIMEOUT_MS),
          onTiming: (t) => {
            if (typeof onTiming === "function") onTiming({ ...t || {}, initMs, contended: busyAtStart || warmup.busy(), borrowed });
          }
        });
      } finally {
        warmup.afterSynth(wav);
        if (releaseStream) releaseStream(wav);
      }
      if (wav) warmup.markWarm(useStyle);
      try {
        const textLength = String(text ?? "").length;
        const pitchOffset = (
          /** @type {any} */
          voice?.pitchOffset
        );
        if (isStreamedVoice(wav)) {
          wav.styleId = useStyle;
          wav.pitchOffset = Number(pitchOffset) || 0;
          wav.textLength = textLength;
          const sv = wav;
          void sv.whenDone.then((ok) => {
            if (ok) rememberVoiceStylePeak(useStyle, sv.peak, sv.rms, textLength, pitchOffset);
          }, () => {
          });
        } else if (wav instanceof ArrayBuffer) {
          const level = measureVoiceWavLevel(wav);
          if (level) rememberVoiceStylePeak(useStyle, level.peak, level.rms, textLength, pitchOffset);
        }
      } catch {
      }
      return wav;
    };
  }
  function startVoiceWarmup(warmup, allStyleIds) {
    if (!warmup) return;
    const ids = Array.isArray(allStyleIds) ? allStyleIds.map(Number) : [];
    warmup.reset();
    const first = ids.includes(3) ? 3 : ids[0];
    if (first === void 0) return;
    void warmup.primeEngine(first).catch(() => {
    });
    for (const id of VOICE_NARROW_STYLE_IDS) {
      if (id !== first && ids.includes(id)) void warmup.ensureWhenIdle(id);
    }
  }
  function wireVoiceWarmupHooks(warmup, isPlayerIdle, getDiag, engine) {
    if (!warmup) return;
    const w = (
      /** @type {any} */
      warmup
    );
    if (w._busyPingTimer) {
      clearInterval(w._busyPingTimer);
      w._busyPingTimer = null;
    }
    if (engine) {
      w._busyPingTimer = setInterval(() => {
        let idle = true;
        try {
          idle = isPlayerIdle() !== false;
        } catch {
          idle = true;
        }
        if (!idle) engine.ping();
      }, VOICE_BUSY_PING_INTERVAL_MS);
    }
    warmup.setHooks({
      isIdle: isPlayerIdle,
      onActivity: engine ? () => engine.ping() : void 0,
      engineQuietMs: engine ? () => engine.quietMs() : void 0,
      onRemoteBusy: () => {
        const d = getDiag();
        if (d && typeof d === "object") d.bgInitYieldTotal = (Number(d.bgInitYieldTotal) || 0) + 1;
      },
      onInit: (ms, background) => {
        if (!background) return;
        const d = getDiag();
        if (!d || typeof d !== "object") return;
        d.bgInitTotal = (Number(d.bgInitTotal) || 0) + 1;
        d.bgInitMaxMs = Math.max(Number(d.bgInitMaxMs) || 0, Math.round(ms));
      }
    });
  }

  // src/lib/voiceAgeGate.js
  var VOICE_STALE_MS_NORMAL = 8e3;
  var VOICE_STALE_BACKLOG_QUEUE = Number.POSITIVE_INFINITY;
  var VOICE_STALE_MS_HIGH_PRIORITY = 1e4;
  function isVoiceItemStale(enqueuedAt, now, queueLength, isHighPriority = false) {
    if (typeof enqueuedAt !== "number" || typeof now !== "number" || typeof queueLength !== "number") {
      return { stale: false, reason: "" };
    }
    if (enqueuedAt > now || enqueuedAt <= 0) {
      return { stale: false, reason: "" };
    }
    const ageMs = now - enqueuedAt;
    if (isHighPriority) {
      if (ageMs > VOICE_STALE_MS_HIGH_PRIORITY) {
        return { stale: true, reason: `age ${ageMs}ms > ${VOICE_STALE_MS_HIGH_PRIORITY}ms (high priority)` };
      }
      return { stale: false, reason: "" };
    }
    const thresholdMs = VOICE_STALE_MS_NORMAL;
    if (ageMs > thresholdMs) {
      return { stale: true, reason: `age ${ageMs}ms > ${thresholdMs}ms (q: ${queueLength})` };
    }
    return { stale: false, reason: "" };
  }

  // src/lib/voiceFailureTaxonomy.js
  var ALIVE_FAILURES = Object.freeze({
    "no-fetch": Object.freeze({ cause: "not_wired", stage: "probe" }),
    timeout: Object.freeze({ cause: "timeout", stage: "probe" }),
    refused: Object.freeze({ cause: "down", stage: "probe" }),
    "http-error": Object.freeze({ cause: "http", stage: "probe" }),
    "": null
  });
  var SYNTH_FAILURES = Object.freeze({
    timeout: Object.freeze({ cause: "timeout", stage: "synth" }),
    query_timeout: Object.freeze({ cause: "timeout", stage: "query" }),
    unreachable: Object.freeze({ cause: "down", stage: "synth" }),
    query_http: Object.freeze({ cause: "http", stage: "query" }),
    query_body: Object.freeze({ cause: "payload", stage: "query" }),
    synth_http: Object.freeze({ cause: "http", stage: "synth" }),
    synth_body: Object.freeze({ cause: "payload", stage: "synth" }),
    unknown: Object.freeze({ cause: "unknown", stage: "synth" })
  });

  // src/lib/voiceSynthFailureReason.js
  var VOICE_SYNTH_FAIL_REASONS = Object.freeze([
    "timeout",
    "query_timeout",
    "unreachable",
    "query_http",
    "query_body",
    "synth_http",
    "synth_body",
    "unknown"
  ]);
  function classifyVoiceSynthFailureReason(ev) {
    const stage = String(ev?.stage || "");
    const msg = String(
      /** @type {any} */
      ev?.error?.message ?? ev?.error ?? ""
    ).toLowerCase();
    if (msg.includes("timeout") || msg.includes("abort")) return stage === "query" ? "query_timeout" : "timeout";
    if (msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("econnrefused") || msg.includes("connection refused") || msg.includes("load failed")) {
      return "unreachable";
    }
    if (ev?.bodyInvalid === true) {
      return stage === "synth" ? "synth_body" : "query_body";
    }
    const status = Number(ev?.httpStatus);
    if (Number.isFinite(status) && status > 0) {
      return stage === "synth" ? "synth_http" : "query_http";
    }
    if (stage === "synth") return "synth_http";
    if (stage === "query") return "query_http";
    return "unknown";
  }

  // src/lib/voicePlaybackQuality.js
  var VOICE_CUT_SHORT_RATIO = 0.85;
  var VOICE_CUT_SHORT_SLACK_MS = 150;
  var VOICE_STALL_RATIO = 1.25;
  var VOICE_STALL_SLACK_MS = 400;
  var VOICE_CLIP_LEVEL = 0.995;
  var VOICE_QUIET_RATIO = 0.6;
  function recordVoicePlaybackQuality(diag, s) {
    if (!diag || typeof diag !== "object" || !s) return;
    const inc = (k) => {
      diag[k] = (Number(diag[k]) || 0) + 1;
    };
    const issues = [];
    if (s.outcome === "error") {
      if (s.started) {
        inc("playErrorAfterStartTotal");
        issues.push("error");
      }
      if (issues.length) diag.lastPlayIssue = issues.join(",");
      return;
    }
    inc("playCheckedTotal");
    const exp = Number(s.expectedMs);
    const played = Number(s.playedMs);
    if (s.streamed && s.partial) {
      inc("playCutShortTotal");
      issues.push("partial");
    } else if (s.started && exp > 0 && played >= 0) {
      if (played < exp * VOICE_CUT_SHORT_RATIO - VOICE_CUT_SHORT_SLACK_MS) {
        inc("playCutShortTotal");
        issues.push(`cut${Math.round(played)}/${Math.round(exp)}ms`);
      } else if (!s.streamed && played > exp * VOICE_STALL_RATIO + VOICE_STALL_SLACK_MS) {
        inc("playStallTotal");
        issues.push(`stall${Math.round(played)}/${Math.round(exp)}ms`);
      }
    }
    if (s.streamed && Number(s.underruns) > 0) {
      inc("streamUnderrunTotal");
      diag.streamUnderrunMaxMs = Math.max(Number(diag.streamUnderrunMaxMs) || 0, Math.round(Number(s.underrunMaxMs) || 0));
      issues.push(`gap${s.underruns}x${Math.round(Number(s.underrunMaxMs) || 0)}ms`);
    }
    const peak = Number(s.outPeak);
    if (Number.isFinite(peak) && peak >= 0) {
      diag.outPeakEmaPermille = Math.round(updateVoiceServiceTimeEma(diag.outPeakEmaPermille, peak * 1e3));
      if (peak >= VOICE_CLIP_LEVEL) {
        inc("clipItemTotal");
        issues.push("clip");
      }
      const target = Number(s.targetPeak);
      const rmsNow = Number(s.outRms);
      const loudEnough = Number.isFinite(rmsNow) && rmsNow >= voiceTargetRms(target) * VOICE_QUIET_RATIO;
      if (Number.isFinite(target) && target > 0 && peak > 0 && peak < target * VOICE_QUIET_RATIO && !loudEnough) {
        inc("quietItemTotal");
        issues.push(`quiet${Math.round(peak * 100)}/${Math.round(target * 100)}%`);
      }
    }
    const rms = Number(s.outRms);
    if (Number.isFinite(rms) && rms > 0) {
      const db = Math.round(20 * Math.log10(rms) * 10) / 10;
      const lo = Number(diag.outRmsDbMin);
      const hi = Number(diag.outRmsDbMax);
      diag.outRmsDbMin = Number.isFinite(lo) ? Math.min(lo, db) : db;
      diag.outRmsDbMax = Number.isFinite(hi) ? Math.max(hi, db) : db;
      diag.lastOutRmsDb = db;
    }
    if (s.streamed && Number(s.gainDropRatio) > 0 && Number(s.gainDropRatio) < 0.8) {
      inc("streamGainDropTotal");
      issues.push(`drop${Math.round(Number(s.gainDropRatio) * 100)}%`);
    }
    if (issues.length) diag.lastPlayIssue = issues.join(",");
  }
  function observeVoicePlayback(audio, opts) {
    if (!audio || typeof audio.addEventListener !== "function" || !opts?.diag) return;
    const now = typeof opts.now === "function" ? opts.now : () => Date.now();
    const rate = Number(opts.playbackRate) > 0 ? Number(opts.playbackRate) : 1;
    let playingAt = -1;
    let done = false;
    const finish = (outcome) => {
      if (done) return;
      done = true;
      try {
        const q = audio.quality && typeof audio.quality === "object" ? audio.quality : null;
        const durSec = Number(audio.duration);
        recordVoicePlaybackQuality(opts.diag, {
          expectedMs: Number.isFinite(durSec) && durSec > 0 ? durSec * 1e3 / rate : -1,
          playedMs: playingAt >= 0 ? now() - playingAt : -1,
          outcome,
          started: playingAt >= 0,
          streamed: !!q,
          underruns: q ? Number(q.underruns) || 0 : 0,
          underrunMaxMs: q ? Number(q.underrunMaxMs) || 0 : 0,
          outPeak: q && Number(q.outPeak) >= 0 ? Number(q.outPeak) : Number(opts.outPeak ?? -1),
          outRms: q && Number(q.outRms) > 0 ? Number(q.outRms) : Number(opts.outRms ?? -1),
          targetPeak: Number(opts.targetPeak ?? -1),
          gainDropRatio: q ? Number(q.gainDropRatio) || 0 : 0,
          partial: q ? q.partial === true : false
        });
        if (typeof opts.onRecorded === "function") opts.onRecorded();
      } catch {
      }
    };
    try {
      audio.addEventListener("playing", () => {
        if (playingAt < 0) playingAt = now();
      }, { once: true });
      audio.addEventListener("ended", () => finish("ended"), { once: true });
      audio.addEventListener("error", () => finish("error"), { once: true });
    } catch {
    }
  }

  // src/lib/voiceLightFallback.js
  var LIGHT_VOICE_PITCHES = Object.freeze([0.8, 0.95, 1.1, 1.25, 1.4]);

  // src/lib/voiceReadQueue.js
  function pushVoiceQueue(queue, item, { max = 5, keep } = {}) {
    const current = Array.isArray(queue) ? [...queue] : [];
    if (item && typeof item === "object" && /** @type {{priority?: string}} */
    item.priority === "high") {
      const insertIdx = current.findIndex((x) => !x || typeof x !== "object" || /** @type {{priority?: string}} */
      x.priority !== "high");
      if (insertIdx < 0) {
        current.push(item);
      } else {
        current.splice(insertIdx, 0, item);
      }
    } else {
      current.push(item);
    }
    const rawMax = Number(max);
    const limit = Number.isFinite(rawMax) ? Math.max(0, Math.floor(rawMax)) : 5;
    const dropCount = Math.max(0, current.length - limit);
    if (typeof keep !== "function" || dropCount === 0) {
      return {
        queue: current.slice(dropCount),
        dropped: current.slice(0, dropCount)
      };
    }
    const dropped = [];
    const kept = [];
    for (const x of current) {
      if (dropped.length < dropCount && x !== item && !keep(x)) dropped.push(x);
      else kept.push(x);
    }
    return { queue: kept, dropped };
  }
  function mergeRepeatedVoiceItem(queue, candidate) {
    const current = Array.isArray(queue) ? [...queue] : [];
    if (!candidate || typeof candidate !== "object") {
      return { queue: current, merged: false };
    }
    const index = current.findIndex(
      (existing2) => existing2 && typeof existing2 === "object" && existing2.body === candidate.body
    );
    if (index < 0) return { queue: current, merged: false };
    const existing = current[index];
    const rawCount = Number(existing.count);
    const count = Number.isFinite(rawCount) && rawCount >= 1 ? Math.floor(rawCount) : 1;
    current[index] = { ...existing, count: count + 1 };
    return { queue: current, merged: true };
  }
  function computeVoiceCongestion(queueLength) {
    const rawLength = Number(queueLength);
    const length = Number.isFinite(rawLength) && rawLength >= 0 ? Math.floor(rawLength) : 0;
    if (length >= 8) return { speedBoost: 0.8, maxChars: 30 };
    if (length >= 5) return { speedBoost: 0.5, maxChars: 40 };
    if (length >= 3) return { speedBoost: 0.3, maxChars: 50 };
    if (length >= 2) return { speedBoost: 0.15, maxChars: 60 };
    return { speedBoost: 0, maxChars: 60 };
  }
  function capVoiceMaxCharsByBoost(effectiveBoost, queueMaxChars) {
    const boost = Number(effectiveBoost);
    const base = Number.isFinite(Number(queueMaxChars)) && Number(queueMaxChars) >= 1 ? Math.floor(Number(queueMaxChars)) : 60;
    let cap = 60;
    if (Number.isFinite(boost)) {
      if (boost >= 0.8) cap = 30;
      else if (boost >= 0.5) cap = 40;
      else if (boost >= 0.3) cap = 50;
    }
    return Math.min(base, cap);
  }
  function computeVoiceE2eAverage(prevAvgMs, sampleMs, alpha = 0.3) {
    const sample = Number(sampleMs);
    if (!Number.isFinite(sample) || sample < 0) {
      const prev2 = Number(prevAvgMs);
      return Number.isFinite(prev2) ? prev2 : -1;
    }
    const prev = Number(prevAvgMs);
    if (!Number.isFinite(prev) || prev < 0) return Math.round(sample);
    return Math.round(prev + alpha * (sample - prev));
  }
  var VOICE_PLAYBACK_RATE_MAX = 1.35;
  function computeVoicePlaybackRate(boostAtSynth, boostNow) {
    const at = Number(boostAtSynth);
    const now = Number(boostNow);
    if (!Number.isFinite(at) || !Number.isFinite(now)) return 1;
    const rate = (1 + now) / (1 + at);
    return Math.min(VOICE_PLAYBACK_RATE_MAX, Math.max(1, rate));
  }
  function resolveVoiceSynthDepth(queueLength, opts = {}) {
    const rawLength = Number(queueLength);
    const length = Number.isFinite(rawLength) && rawLength >= 0 ? Math.floor(rawLength) : 0;
    let depth;
    if (length >= 5) depth = 3;
    else if (length >= 3) depth = 2;
    else depth = 1;
    const rawPending = Number(opts?.pending);
    if (Number.isFinite(rawPending) && rawPending >= 0) {
      depth = Math.min(depth, Math.floor(rawPending));
    }
    return depth;
  }

  // src/lib/voiceStageTiming.js
  var VOICE_UPSTREAM_SANE_MAX_MS = 6e4;
  var VOICE_RTF_MIN_AUDIO_MS = 600;
  var VOICE_RTF_FIXED_OVERHEAD_MS = 250;
  function foldWarmSynthRtf(diag, ownMs, audioMs) {
    if (!Number.isFinite(audioMs) || audioMs < VOICE_RTF_MIN_AUDIO_MS || !Number.isFinite(ownMs)) return;
    foldVoiceStageEma(diag, "warmSynthRtfPermille", Math.max(0, ownMs - VOICE_RTF_FIXED_OVERHEAD_MS) / audioMs * 1e3);
    diag.warmRtfSamples = (Number(diag.warmRtfSamples) || 0) + 1;
  }
  function measureVoiceGapMs(fromMs, toMs) {
    const cap = Number(fromMs);
    const enq = Number(toMs);
    if (!Number.isFinite(cap) || cap <= 0 || !Number.isFinite(enq) || enq <= 0) return -1;
    const ms = enq - cap;
    if (ms < 0 || ms > VOICE_UPSTREAM_SANE_MAX_MS) return -1;
    return Math.round(ms);
  }
  function foldVoiceStageEma(diag, field, sampleMs) {
    const v = Number(sampleMs);
    if (!diag || typeof diag !== "object" || !Number.isFinite(v) || v < 0) return;
    diag[field] = Math.round(updateVoiceServiceTimeEma(diag[field], v));
  }
  function createVoiceSynthTracker(deps = {}) {
    const now = typeof deps.now === "function" ? deps.now : () => Date.now();
    const seenStyles = /* @__PURE__ */ new Set();
    let prevDone = Promise.resolve(0);
    return {
      /**
       * 読み上げ ON のたびに呼ぶ(2026-10-31)。VOICEVOX を再起動すると声はまた冷えているので、
       *   覚えていると初めての声を「温まった声」として数え、起動直後の遅れを弱い PC と取り違える。
       */
      reset() {
        seenStyles.clear();
      },
      /**
       * @param {unknown} styleId
       * @returns {{ cold: boolean, end: (timing?: { queryMs?: number, synthMs?: number, initMs?: number, streamed?: boolean, contended?: boolean, audioMs?: number, borrowed?: boolean }, ok?: boolean) => { cold: boolean, ok: boolean, startAt: number, totalMs: number, engineWaitMs: number, queryMs: number, synthMs: number, initMs: number, streamed: boolean, contended: boolean, audioMs: number, borrowed: boolean } }}
       */
      begin(styleId) {
        const startAt = now();
        const key = String(styleId ?? "");
        const cold = !seenStyles.has(key);
        seenStyles.add(key);
        let prevDoneAt = -1;
        prevDone.then((t) => {
          prevDoneAt = t;
        }, () => {
        });
        let resolveSelf = () => {
        };
        prevDone = new Promise((r) => {
          resolveSelf = r;
        });
        let ended = false;
        const end = (timing = {}, ok = true) => {
          const endAt = now();
          if (!ended) {
            ended = true;
            resolveSelf(endAt);
          }
          const q = Number(timing?.queryMs);
          const s = Number(timing?.synthMs);
          const i = Number(timing?.initMs);
          const a = Number(timing?.audioMs);
          const borrowed = timing?.borrowed === true;
          return {
            // 借りた声は温まっている声で読んだので「初めての声」に入れない(v0.1.1772)。
            cold: cold && !borrowed,
            ok: ok === true,
            startAt,
            totalMs: Math.max(0, endAt - startAt),
            engineWaitMs: prevDoneAt > startAt ? Math.min(prevDoneAt, endAt) - startAt : 0,
            queryMs: Number.isFinite(q) && q >= 0 ? Math.round(q) : -1,
            synthMs: Number.isFinite(s) && s >= 0 ? Math.round(s) : -1,
            // 2026-10-26: 合成の前に声を読み込んだ時間(voiceWarmup)。無ければ 0。
            initMs: Number.isFinite(i) && i > 0 ? Math.round(i) : 0,
            // 2026-10-26: 少しずつ受け取った(voiceStream)。時間は「最初の声が届くまで」。
            streamed: timing?.streamed === true,
            // 2026-10-26: 別の声の準備と重なった(voiceWarmup)。速さの物差しに入れない。
            contended: timing?.contended === true,
            // 2026-10-26: できた声の長さ(ms)。合成の速さを文の長さで割るのに使う。分からなければ -1。
            audioMs: Number.isFinite(a) && a > 0 ? Math.round(a) : -1,
            // v0.1.1772: まだ温まっていない声の代わりに、温まった声で読んだ(voiceWarmup)。
            borrowed
          };
        };
        return { cold, end };
      }
    };
  }
  function recordVoiceSynthStage(diag, r) {
    if (!diag || typeof diag !== "object" || !r) return;
    if (!r.ok) return;
    if (r.borrowed) diag.voiceBorrowTotal = (Number(diag.voiceBorrowTotal) || 0) + 1;
    foldVoiceStageEma(diag, "engineWaitEmaMs", r.engineWaitMs);
    foldVoiceStageEma(diag, "audioQueryEmaMs", r.queryMs);
    const initMs = Number(r.initMs) > 0 ? Number(r.initMs) : 0;
    if (r.streamed) {
      diag.streamTotal = (Number(diag.streamTotal) || 0) + 1;
      foldVoiceStageEma(diag, "streamFirstAudioEmaMs", Math.max(0, r.totalMs - r.engineWaitMs - initMs));
      return;
    }
    if (r.synthMs >= 0) foldVoiceStageEma(diag, "synthesisEmaMs", Math.max(0, r.synthMs - r.engineWaitMs));
    if (initMs > 0) {
      diag.speakerInitTotal = (Number(diag.speakerInitTotal) || 0) + 1;
      diag.speakerInitMaxMs = Math.max(Number(diag.speakerInitMaxMs) || 0, Math.round(initMs));
    }
    const ownMs = Math.max(0, r.totalMs - r.engineWaitMs - initMs);
    if (r.contended) {
      diag.contendedSynthTotal = (Number(diag.contendedSynthTotal) || 0) + 1;
      return;
    }
    if (r.cold) {
      diag.coldSynthTotal = (Number(diag.coldSynthTotal) || 0) + 1;
      diag.coldSynthMaxMs = Math.max(Number(diag.coldSynthMaxMs) || 0, Math.round(ownMs));
      diag.lastColdSynthMs = Math.round(ownMs);
    } else {
      foldVoiceStageEma(diag, "warmSynthEmaMs", ownMs);
      diag.warmSynthSamples = (Number(diag.warmSynthSamples) || 0) + 1;
      foldWarmSynthRtf(diag, ownMs, Number(r.audioMs));
    }
  }
  function resetVoiceWarmMeasure(diag) {
    if (!diag || typeof diag !== "object") return;
    diag.warmSynthEmaMs = -1;
    diag.warmSynthSamples = 0;
    diag.warmSynthRtfPermille = -1;
    diag.warmRtfSamples = 0;
  }
  function recordVoiceStreamDone(diag, r, voice, now, after) {
    if (!diag || !r || !r.ok || !r.streamed || !voice || typeof voice.whenDone?.then !== "function") return Promise.resolve();
    return voice.whenDone.then((ok) => {
      if (ok !== true || voice.failed || r.cold || r.contended) return;
      const audioMs = voice.sampleRate > 0 ? voice.totalSamples / voice.sampleRate * 1e3 : -1;
      const ownMs = now() - r.startAt - r.engineWaitMs - (Number(r.initMs) > 0 ? Number(r.initMs) : 0);
      foldWarmSynthRtf(diag, ownMs, audioMs);
      if (typeof after === "function") after();
    }).catch(() => {
    });
  }
  function measureWavAudioMs(wav) {
    if (!(wav instanceof ArrayBuffer) || wav.byteLength < 44) return -1;
    try {
      const v = new DataView(wav);
      if (v.getUint32(0, false) !== 1380533830 || v.getUint32(8, false) !== 1463899717) return -1;
      let off = 12;
      let bytesPerSec = 0;
      while (off + 8 <= wav.byteLength) {
        const id = v.getUint32(off, false);
        const size = v.getUint32(off + 4, true);
        if (id === 1718449184 && off + 16 <= wav.byteLength) bytesPerSec = v.getUint32(off + 16, true);
        if (id === 1684108385) {
          if (bytesPerSec <= 0) return -1;
          const dataBytes = Math.min(size, wav.byteLength - off - 8);
          return Math.round(dataBytes / bytesPerSec * 1e3);
        }
        off += 8 + size + size % 2;
      }
    } catch {
    }
    return -1;
  }
  function recordVoiceE2eSample(diag, ms) {
    const v = Number(ms);
    if (!diag || typeof diag !== "object" || !Number.isFinite(v) || v < 0) return;
    diag.e2eSampleTotal = (Number(diag.e2eSampleTotal) || 0) + 1;
    diag.e2eSumMsTotal = (Number(diag.e2eSumMsTotal) || 0) + Math.round(v);
    diag.e2eMaxMs = Math.max(Number(diag.e2eMaxMs) || 0, Math.round(v));
  }

  // src/lib/voiceLagNotice.js
  var VOICE_LAG_NOTICE_SHOW_MS = 4e3;
  var VOICE_LAG_NOTICE_HIDE_MS = 2500;
  var VOICE_GPU_TIP_TEXT = "⚡ 読み上げを速くするには: VOICEVOX の「設定」→「オプション」→「エンジンモード」を「GPU」に(切り替えると VOICEVOX が再起動します)";
  var VOICE_WARMING_TEXT = "VOICEVOX を起動した直後は、初めて使う声の準備で遅れます。続けて読むうちに速くなります";
  var VOICE_LIGHT_ACTIVE_TEXT = "VOICEVOX が追いつかないので、いまは PC の声で読んでいます。VOICEVOX が速くなったら自動で戻ります";
  function isVoiceWarmingUp(diag) {
    const samples = Math.max(Number(diag?.warmSynthSamples) || 0, Number(diag?.warmRtfSamples) || 0);
    return samples < VOICE_WEAK_PC_MIN_WARM_SAMPLES;
  }
  function shouldHintVoiceGpu(diag, gpuCapable) {
    return gpuCapable === true && (isWeakVoicePc(diag) || diag?.voiceOverloaded === true);
  }
  function decideVoiceGpuTip(diag, gpuCapable) {
    if (isVoiceWarmingUp(diag) && diag?.voiceOverloaded !== true) return "";
    return shouldHintVoiceGpu(diag, gpuCapable) ? VOICE_GPU_TIP_TEXT : "";
  }
  function decideVoiceLagNotice(prevShown, diag, _opts = {}) {
    if (diag?.lightVoiceActive === true) return { shown: true, lagMs: -1, text: VOICE_LIGHT_ACTIVE_TEXT };
    const e2e = Number(diag?.e2eAvgMs);
    const up = Number(diag?.upstreamEmaMs);
    const queueNow = Number(diag?.queueNow);
    if (!Number.isFinite(e2e) || e2e < 0) return { shown: false, lagMs: -1, text: "" };
    const lagMs = Math.round(e2e + (Number.isFinite(up) && up > 0 ? up : 0));
    if (Number.isFinite(queueNow) && queueNow <= 0 && prevShown) return { shown: false, lagMs, text: "" };
    const shown = prevShown ? lagMs >= VOICE_LAG_NOTICE_HIDE_MS : lagMs >= VOICE_LAG_NOTICE_SHOW_MS;
    if (!shown) return { shown: false, lagMs, text: "" };
    const sec = Math.round(lagMs / 1e3);
    const staleSec = Math.round(VOICE_STALE_MS_NORMAL / 1e3);
    return {
      shown: true,
      lagMs,
      text: `読み上げが約${sec}秒遅れています。追いつくまで、${staleSec}秒より前のコメントは読まずに飛ばします` + (isVoiceWarmingUp(diag) && diag?.voiceOverloaded !== true ? `。${VOICE_WARMING_TEXT}` : "")
    };
  }

  // src/lib/voicePlayer.js
  var VOICE_ALIVE_RETRY_BACKOFF_MS = Object.freeze([0, 500, 1500]);
  var SILENT_WAV_DATA_URI = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";

  // src/lib/voiceDiag.js
  function makeInitialVoiceDiag() {
    return {
      enabled: false,
      queueNow: 0,
      queueMax: 0,
      spokenTotal: 0,
      staleDropTotal: 0,
      playbackTimeoutTotal: 0,
      lastSpokenBase: 0,
      lastSynthMs: -1,
      lastDepth: 0,
      lastSpeedBoost: 0,
      lastPhase: "",
      lastPhaseAt: 0,
      lastE2eMs: -1,
      e2eAvgMs: -1,
      mergeTotal: 0,
      serviceTimeEmaMs: -1,
      effectiveQueueMax: 8,
      rateClampTotal: 0,
      voicedRatio: -1,
      synthWaitEmaMs: -1,
      playPrepEmaMs: -1,
      playbackEmaMs: -1,
      expectedPlayEmaMs: -1,
      arrivalPerMin: -1,
      voicedRecentRatio: -1,
      lastSustainedBoost: 0,
      lastBacklogBoost: 0,
      lastPaceFloor: 0,
      queueMaxByChars: 0,
      sustainedBoostTotal: 0,
      synthFailReasons: {},
      dropCountGateTotal: 0,
      dropHeadStaleTotal: 0,
      dropSweepStaleTotal: 0,
      lightSpokenTotal: 0,
      lightVoiceActive: false,
      // v0.1.1213: 合成が null で返って消えた件(時間切れ内訳つき)。
      synthNullTotal: 0,
      synthNullNearTimeout: 0,
      // v0.1.1327: 自動再生ブロックで鳴らせなかった件。「読み上げONなのに無音」の切り分け用
      //   (合成は成功しているのに音が出ない=ブラウザ側の制約、という状態を名指しする)。
      audioBlockedTotal: 0,
      // v0.1.1331: 「押しても一瞬で戻る」の理由。画面にしか出していなかったため
      //   ユーザー報告に理由が乗らず、原因特定ができなかった反省から計器へ載せる。
      lastEnableFailReason: "",
      enableFailTotal: 0,
      // 2026-10-22計器(P1・voiceStageTiming.js): 遅れを段階ごとに分ける(-1=未計測)。
      upstreamEmaMs: -1,
      lastUpstreamMs: -1,
      queueWaitEmaMs: -1,
      engineWaitEmaMs: -1,
      audioQueryEmaMs: -1,
      synthesisEmaMs: -1,
      warmSynthEmaMs: -1,
      coldSynthTotal: 0,
      coldSynthMaxMs: 0,
      lastColdSynthMs: -1,
      speakerInitTotal: 0,
      speakerInitMaxMs: 0,
      voiceBorrowTotal: 0,
      e2eSampleTotal: 0,
      e2eSumMsTotal: 0,
      e2eMaxMs: 0,
      bgInitTotal: 0,
      bgInitMaxMs: 0,
      bgInitYieldTotal: 0,
      readerYieldTotal: 0,
      ngMutedTotal: 0,
      refreshVoicedTotal: 0,
      backlogSkipTotal: 0,
      bigBatchTotal: 0,
      lastBigBatch: (
        /** @type {VoiceBigBatch | null} */
        null
      ),
      streamTotal: 0,
      streamFirstAudioEmaMs: -1,
      warmSynthSamples: 0,
      contendedSynthTotal: 0,
      warmSynthRtfPermille: -1,
      warmRtfSamples: 0,
      playCheckedTotal: 0,
      playCutShortTotal: 0,
      playStallTotal: 0,
      streamUnderrunTotal: 0,
      streamUnderrunMaxMs: 0,
      playErrorAfterStartTotal: 0,
      clipItemTotal: 0,
      quietItemTotal: 0,
      streamGainDropTotal: 0,
      outPeakEmaPermille: -1,
      outRmsDbMin: 999,
      outRmsDbMax: -999,
      lastOutRmsDb: 0,
      lastPlayIssue: "",
      venueGate: "",
      lagVerdict: "",
      diagBornAt: 0
    };
  }
  var VOICE_DIAG_KEEP_ACROSS_LIVES = Object.freeze([
    "enabled",
    "lastEnableFailReason",
    "enableFailTotal",
    "serviceTimeEmaMs",
    "effectiveQueueMax",
    "synthWaitEmaMs",
    "playPrepEmaMs",
    "playbackEmaMs",
    "expectedPlayEmaMs",
    "engineWaitEmaMs",
    "audioQueryEmaMs",
    "synthesisEmaMs",
    "warmSynthEmaMs",
    "warmSynthSamples",
    "warmSynthRtfPermille",
    "warmRtfSamples",
    "coldSynthTotal",
    "coldSynthMaxMs",
    "lastColdSynthMs",
    "speakerInitTotal",
    "speakerInitMaxMs",
    "voiceBorrowTotal",
    "bgInitTotal",
    "bgInitMaxMs",
    "bgInitYieldTotal",
    "streamTotal",
    "streamFirstAudioEmaMs",
    "contendedSynthTotal",
    "outPeakEmaPermille",
    "outRmsDbMin",
    "outRmsDbMax",
    "lastOutRmsDb",
    "venueGate"
  ]);
  function resetVoiceDiagForNewLive(diag, nowMs) {
    if (!diag || typeof diag !== "object") return;
    const base = (
      /** @type {Record<string, any>} */
      makeInitialVoiceDiag()
    );
    const keep = new Set(VOICE_DIAG_KEEP_ACROSS_LIVES);
    for (const key of Object.keys(diag)) {
      if (keep.has(key)) continue;
      if (Object.prototype.hasOwnProperty.call(base, key)) {
        const v = base[key];
        diag[key] = v && typeof v === "object" ? { ...v } : v;
      } else if (typeof diag[key] === "number") {
        diag[key] = 0;
      }
    }
    diag.diagBornAt = Number(nowMs) || 0;
  }
  function buildVoiceDiagSnapshot(diag, nowMs, liveId) {
    const base = makeInitialVoiceDiag();
    const d = (
      /** @type {any} */
      diag && typeof diag === "object" ? diag : {}
    );
    const num2 = (x, fallback) => {
      const n = Number(x);
      return Number.isFinite(n) ? n : fallback;
    };
    const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
    return {
      enabled: !!d.enabled,
      queueNow: num2(d.queueNow, base.queueNow),
      queueMax: num2(d.queueMax, base.queueMax),
      spokenTotal: num2(d.spokenTotal, base.spokenTotal),
      staleDropTotal: num2(d.staleDropTotal, base.staleDropTotal),
      playbackTimeoutTotal: num2(d.playbackTimeoutTotal, base.playbackTimeoutTotal),
      lastSpokenBase: num2(d.lastSpokenBase, base.lastSpokenBase),
      lastSynthMs: num2(d.lastSynthMs, base.lastSynthMs),
      lastDepth: num2(d.lastDepth, base.lastDepth),
      lastSpeedBoost: num2(d.lastSpeedBoost, base.lastSpeedBoost),
      lastPhase: String(d.lastPhase || base.lastPhase),
      lastPhaseAt: num2(d.lastPhaseAt, base.lastPhaseAt),
      lastE2eMs: num2(d.lastE2eMs, base.lastE2eMs),
      e2eAvgMs: num2(d.e2eAvgMs, base.e2eAvgMs),
      mergeTotal: num2(d.mergeTotal, base.mergeTotal),
      serviceTimeEmaMs: num2(d.serviceTimeEmaMs, base.serviceTimeEmaMs),
      effectiveQueueMax: num2(d.effectiveQueueMax, base.effectiveQueueMax),
      rateClampTotal: num2(d.rateClampTotal, base.rateClampTotal),
      voicedRatio: num2(d.voicedRatio, base.voicedRatio),
      synthWaitEmaMs: num2(d.synthWaitEmaMs, base.synthWaitEmaMs),
      playPrepEmaMs: num2(d.playPrepEmaMs, base.playPrepEmaMs),
      playbackEmaMs: num2(d.playbackEmaMs, base.playbackEmaMs),
      expectedPlayEmaMs: num2(d.expectedPlayEmaMs, base.expectedPlayEmaMs),
      synthFailReasons: d.synthFailReasons && typeof d.synthFailReasons === "object" && !Array.isArray(d.synthFailReasons) ? { ...d.synthFailReasons } : base.synthFailReasons,
      lastSustainedBoost: num2(d.lastSustainedBoost, base.lastSustainedBoost),
      lastBacklogBoost: num2(d.lastBacklogBoost, base.lastBacklogBoost),
      lastPaceFloor: num2(d.lastPaceFloor, base.lastPaceFloor),
      queueMaxByChars: num2(d.queueMaxByChars, base.queueMaxByChars),
      sustainedBoostTotal: num2(d.sustainedBoostTotal, base.sustainedBoostTotal),
      arrivalPerMin: num2(d.arrivalPerMin, base.arrivalPerMin),
      voicedRecentRatio: num2(d.voicedRecentRatio, base.voicedRecentRatio),
      synthNullTotal: num2(d.synthNullTotal, base.synthNullTotal),
      synthNullNearTimeout: num2(d.synthNullNearTimeout, base.synthNullNearTimeout),
      audioBlockedTotal: num2(d.audioBlockedTotal, base.audioBlockedTotal),
      lastEnableFailReason: String(d.lastEnableFailReason || base.lastEnableFailReason),
      enableFailTotal: num2(d.enableFailTotal, base.enableFailTotal),
      dropCountGateTotal: num2(d.dropCountGateTotal, base.dropCountGateTotal),
      dropHeadStaleTotal: num2(d.dropHeadStaleTotal, base.dropHeadStaleTotal),
      dropSweepStaleTotal: num2(d.dropSweepStaleTotal, base.dropSweepStaleTotal),
      lightSpokenTotal: num2(d.lightSpokenTotal, base.lightSpokenTotal),
      lightVoiceActive: d.lightVoiceActive === true,
      upstreamEmaMs: num2(d.upstreamEmaMs, base.upstreamEmaMs),
      lastUpstreamMs: num2(d.lastUpstreamMs, base.lastUpstreamMs),
      queueWaitEmaMs: num2(d.queueWaitEmaMs, base.queueWaitEmaMs),
      engineWaitEmaMs: num2(d.engineWaitEmaMs, base.engineWaitEmaMs),
      audioQueryEmaMs: num2(d.audioQueryEmaMs, base.audioQueryEmaMs),
      synthesisEmaMs: num2(d.synthesisEmaMs, base.synthesisEmaMs),
      warmSynthEmaMs: num2(d.warmSynthEmaMs, base.warmSynthEmaMs),
      coldSynthTotal: num2(d.coldSynthTotal, base.coldSynthTotal),
      coldSynthMaxMs: num2(d.coldSynthMaxMs, base.coldSynthMaxMs),
      lastColdSynthMs: num2(d.lastColdSynthMs, base.lastColdSynthMs),
      speakerInitTotal: num2(d.speakerInitTotal, base.speakerInitTotal),
      speakerInitMaxMs: num2(d.speakerInitMaxMs, base.speakerInitMaxMs),
      voiceBorrowTotal: num2(d.voiceBorrowTotal, base.voiceBorrowTotal),
      e2eSampleTotal: num2(d.e2eSampleTotal, base.e2eSampleTotal),
      e2eSumMsTotal: num2(d.e2eSumMsTotal, base.e2eSumMsTotal),
      e2eMaxMs: num2(d.e2eMaxMs, base.e2eMaxMs),
      bgInitTotal: num2(d.bgInitTotal, base.bgInitTotal),
      bgInitMaxMs: num2(d.bgInitMaxMs, base.bgInitMaxMs),
      bgInitYieldTotal: num2(d.bgInitYieldTotal, base.bgInitYieldTotal),
      readerYieldTotal: num2(d.readerYieldTotal, base.readerYieldTotal),
      ngMutedTotal: num2(d.ngMutedTotal, base.ngMutedTotal),
      refreshVoicedTotal: num2(d.refreshVoicedTotal, base.refreshVoicedTotal),
      backlogSkipTotal: num2(d.backlogSkipTotal, base.backlogSkipTotal),
      bigBatchTotal: num2(d.bigBatchTotal, base.bigBatchTotal),
      lastBigBatch: d.lastBigBatch && typeof d.lastBigBatch === "object" ? d.lastBigBatch : null,
      streamTotal: num2(d.streamTotal, base.streamTotal),
      warmSynthSamples: num2(d.warmSynthSamples, base.warmSynthSamples),
      contendedSynthTotal: num2(d.contendedSynthTotal, base.contendedSynthTotal),
      warmSynthRtfPermille: num2(d.warmSynthRtfPermille, base.warmSynthRtfPermille),
      warmRtfSamples: num2(d.warmRtfSamples, base.warmRtfSamples),
      playCheckedTotal: num2(d.playCheckedTotal, base.playCheckedTotal),
      playCutShortTotal: num2(d.playCutShortTotal, base.playCutShortTotal),
      playStallTotal: num2(d.playStallTotal, base.playStallTotal),
      streamUnderrunTotal: num2(d.streamUnderrunTotal, base.streamUnderrunTotal),
      streamUnderrunMaxMs: num2(d.streamUnderrunMaxMs, base.streamUnderrunMaxMs),
      playErrorAfterStartTotal: num2(d.playErrorAfterStartTotal, base.playErrorAfterStartTotal),
      clipItemTotal: num2(d.clipItemTotal, base.clipItemTotal),
      quietItemTotal: num2(d.quietItemTotal, base.quietItemTotal),
      streamGainDropTotal: num2(d.streamGainDropTotal, base.streamGainDropTotal),
      outPeakEmaPermille: num2(d.outPeakEmaPermille, base.outPeakEmaPermille),
      outRmsDbMin: num2(d.outRmsDbMin, base.outRmsDbMin),
      outRmsDbMax: num2(d.outRmsDbMax, base.outRmsDbMax),
      lastOutRmsDb: num2(d.lastOutRmsDb, base.lastOutRmsDb),
      lastPlayIssue: typeof d.lastPlayIssue === "string" ? d.lastPlayIssue : "",
      venueGate: typeof d.venueGate === "string" ? d.venueGate : "",
      streamFirstAudioEmaMs: num2(d.streamFirstAudioEmaMs, base.streamFirstAudioEmaMs),
      lagVerdict: String(d.lagVerdict || base.lagVerdict),
      diagBornAt: num2(d.diagBornAt, base.diagBornAt),
      capturedAt: now,
      /*
       * ★v0.1.1328: どちらの面が書いたスナップショットかを必ず残す。
       *   読み上げは【会場(VoicePlayer)】と【コメビュ(独自実装)】の2実装が同じ
       *   storage キーを奪い合っており(last-writer-wins)、化石値を見たときに
       *   「どちらが書いたか」が分からないと調査の出発点が決まらない。
       *   venueBar は従来から 'venue' を後付けしていたが、comeview は無印だった=非対称。
       *   ここで既定を持たせ、呼び出し側が上書きする形に揃える。
       */
      source: String(d.source || ""),
      liveId: String(liveId ?? d.liveId ?? "").trim().toLowerCase()
    };
  }

  // src/lib/trailingPublisher.js
  function createTrailingPublisher(publishNow, gapMs, deps = {}) {
    const now = deps.now || (() => Date.now());
    const setTimer = deps.setTimer || ((fn, ms) => setTimeout(fn, ms));
    const clearTimer = deps.clearTimer || ((h) => clearTimeout(
      /** @type {any} */
      h
    ));
    const gap = Number.isFinite(gapMs) && gapMs > 0 ? gapMs : 0;
    let lastAt = -Infinity;
    let timer = null;
    const fire = () => {
      timer = null;
      lastAt = now();
      try {
        publishNow();
      } catch {
      }
    };
    return {
      request() {
        const wait = lastAt + gap - now();
        if (wait <= 0) {
          if (timer != null) {
            clearTimer(timer);
            timer = null;
          }
          fire();
          return;
        }
        if (timer == null) timer = setTimer(fire, wait);
      },
      cancel() {
        if (timer != null) {
          clearTimer(timer);
          timer = null;
        }
      }
    };
  }

  // src/lib/voiceTestRun.js
  var VOICE_TEST_REPORT_KEY = "nls_voice_test_report_v1";
  var VOICE_TEST_REPORT_KEEP = 20;
  var VOICE_TEST_MESSAGE = "NLS_VOICE_TEST";
  var VOICE_TEST_KINDS = Object.freeze(["short", "long", "burst", "mixed"]);
  function isVoiceTestAllowed(manifest) {
    const key = (
      /** @type {any} */
      manifest?.key
    );
    return typeof key === "string" && key.length > 0;
  }
  var SHORT_TEXTS = Object.freeze(["こんばんは", "わこつ", "888", "かわいい", "すごい", "なるほど", "おつかれさま", "きたー", "ありがとう", "それな"]);
  var LONG_TEXTS = Object.freeze([
    "今日の配信もすごく楽しみにしていました、仕事が終わってからずっと待っていたので本当にうれしいです",
    "さっきの話の続きなんですけど、あの場面で右に曲がっていたらどうなっていたのかずっと気になっています",
    "初見です、友達にすすめられて来てみたんですが雰囲気がとてもよくて、これからも見に来ようと思いました",
    "ギフトを送ろうと思ったんですけど、どれがいいのか迷っているうちに配信が終わりそうになってあせりました",
    "明日は早起きしないといけないのでそろそろ寝ますが、最後まで見られなくて残念です、またアーカイブで見ます",
    "このゲームは昔やったことがあるんですが、ここのボスがとても強くて何回も負けたのを思い出して笑っています",
    "みなさんのコメントを読んでいると、同じところで同じように驚いている人がたくさんいて一体感がすごいですね",
    "音量はちょうどいいです、さっきより声が聞き取りやすくなったので、そのままの設定でいいと思いますよ本当に",
    "配信のサムネイルがとてもかわいかったので思わずクリックしてしまいました、今日はどんな内容になるんですか",
    "いつも楽しい時間をありがとうございます、来週の配信も予定を空けて待っているので無理せずがんばってください"
  ]);
  var MIXED_PLAN = Object.freeze([
    [0, false],
    [1200, false],
    [2500, true],
    [800, false],
    [300, false],
    [300, false],
    [4e3, true],
    [3e3, true],
    [1500, false],
    [6e3, false],
    [500, true],
    [500, false],
    [2e3, false],
    [7e3, true],
    [2500, true],
    [1e3, false],
    [200, false],
    [200, false],
    [200, true],
    [9e3, false],
    [3500, true],
    [1800, false],
    [1200, false],
    [4500, true],
    [600, false],
    [600, true],
    [5e3, false],
    [2200, true],
    [1400, false],
    [3e3, false]
  ]);
  function buildVoiceTestItems(kind, count, runId) {
    const k = VOICE_TEST_KINDS.includes(
      /** @type {any} */
      kind
    ) ? (
      /** @type {string} */
      kind
    ) : "short";
    const n = Math.max(1, Math.min(30, Math.floor(Number(count)) || 10));
    if (k === "mixed") {
      return MIXED_PLAN.slice(0, n).map(([gapMs, isLong], i) => ({
        gapMs,
        item: {
          kind: "comment",
          userId: `voicetest-${runId}-${i}`,
          nickname: `試験${i + 1}`,
          text: (isLong ? LONG_TEXTS : SHORT_TEXTS)[i % 10]
        }
      }));
    }
    const texts = k === "long" ? LONG_TEXTS : SHORT_TEXTS;
    const gap = k === "long" ? 7e3 : k === "burst" ? 100 : 1500;
    return Array.from({ length: n }, (_, i) => ({
      gapMs: i === 0 ? 0 : gap,
      item: {
        kind: "comment",
        userId: `voicetest-${runId}-${i}`,
        nickname: `試験${i + 1}`,
        text: texts[i % texts.length]
      }
    }));
  }
  function diffVoiceDiag(before, after) {
    const out = {};
    for (const [key, v] of Object.entries(after || {})) {
      if (typeof v === "string") {
        out[key] = v;
        continue;
      }
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const prev = before?.[key] && typeof before[key] === "object" ? before[key] : {};
        for (const [sub, sv] of Object.entries(v)) {
          const n = Number(sv);
          if (!Number.isFinite(n)) continue;
          const d = n - (Number(prev[sub]) || 0);
          if (d !== 0) out[`${key}.${sub}`] = d;
        }
        continue;
      }
      const a = Number(v);
      if (!Number.isFinite(a)) continue;
      const cumulative = /Total$|Samples$|^spoken|Count$/.test(key);
      out[key] = cumulative ? a - (Number(before?.[key]) || 0) : a;
    }
    return out;
  }
  async function runVoiceTest(o) {
    const now = typeof o.now === "function" ? o.now : () => Date.now();
    const sleep = typeof o.sleep === "function" ? o.sleep : (ms) => new Promise((r) => setTimeout(r, ms));
    const runId = `${now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
    const plan = buildVoiceTestItems(o.kind, o.count, runId);
    if (typeof o.prepare === "function") {
      try {
        o.prepare();
      } catch {
      }
    }
    const settleBy = now() + 15e3;
    while (!o.isIdle() && now() < settleBy) await sleep(250);
    const live = o.getDiag();
    if (live && typeof live === "object") {
      live.outRmsDbMin = 999;
      live.outRmsDbMax = -999;
      live.e2eMaxMs = 0;
      live.bgInitMaxMs = 0;
      live.lastPlayIssue = "";
    }
    const before = JSON.parse(JSON.stringify(o.getDiag() || {}));
    const startedAt = now();
    const items = [];
    for (const [i, { gapMs, item }] of plan.entries()) {
      if (gapMs > 0) await sleep(gapMs);
      const at = now();
      const rec = { i: i + 1, long: item.text.length >= 40, at: at - startedAt, startMs: -1, durMs: -1, dropped: false };
      items.push(rec);
      let startAt = -1;
      o.enqueue([{
        ...item,
        at,
        receivedAt: at,
        onAudioStart: () => {
          if (startAt < 0) {
            startAt = now();
            rec.startMs = startAt - at;
          }
        },
        onAudioEnd: () => {
          if (startAt >= 0 && rec.durMs < 0) rec.durMs = now() - startAt;
        },
        onDropped: () => {
          if (startAt < 0) rec.dropped = true;
        }
      }]);
    }
    const lastEnqueuedAt = now();
    const deadline = startedAt + (Number(o.timeoutMs) > 0 ? Number(o.timeoutMs) : 18e4);
    let idleStreak = 0;
    let timedOut = false;
    while (idleStreak < 2 || now() - lastEnqueuedAt < 2e3) {
      if (now() > deadline) {
        timedOut = true;
        break;
      }
      await sleep(500);
      idleStreak = o.isIdle() ? idleStreak + 1 : 0;
    }
    const after = JSON.parse(JSON.stringify(o.getDiag() || {}));
    const delta = diffVoiceDiag(before, after);
    const e2eN = Number(delta.e2eSampleTotal) || 0;
    const report = {
      mode: o.mode,
      label: typeof o.label === "string" ? o.label : "",
      kind: plan.length && o.kind ? String(o.kind) : "short",
      count: plan.length,
      runId,
      startedAt,
      finishedAt: now(),
      timedOut,
      // v0.1.1774: この回だけの「声が出るまで」の平均・最大(e2eAvgMs は過去の回を引きずる)。
      e2eRunAvgMs: e2eN > 0 ? Math.round((Number(delta.e2eSumMsTotal) || 0) / e2eN) : -1,
      e2eRunMaxMs: e2eN > 0 ? Number(delta.e2eMaxMs) || 0 : -1,
      // v0.1.1776: 試験の間に混ざった本物のコメントの件数(声の差・遅れの見え方に効く)。計器が無ければ -1。
      otherItems: Number.isFinite(Number(delta.voiceEnqueuedTotal)) ? Math.max(0, Number(delta.voiceEnqueuedTotal) - plan.length) : -1,
      // v0.1.1783: 声ごとの素の最大振幅・RMS(このページで覚えている分)。声ごとの差の直し方を決める材料。
      styleLevels: voiceStyleLevelsSnapshot(),
      items,
      delta
    };
    if (typeof o.write === "function") {
      try {
        await o.write(report);
      } catch {
      }
    }
    return report;
  }
  async function appendVoiceTestReport(storage, report) {
    const bag = await storage.get(VOICE_TEST_REPORT_KEY);
    const prev = Array.isArray(bag?.[VOICE_TEST_REPORT_KEY]) ? bag[VOICE_TEST_REPORT_KEY] : [];
    await storage.set({ [VOICE_TEST_REPORT_KEY]: [...prev, report].slice(-VOICE_TEST_REPORT_KEEP) });
  }

  // src/extension/voiceTestHook.js
  function wireVoiceTestHook(o) {
    let manifest = null;
    try {
      manifest = chrome.runtime.getManifest();
    } catch {
      manifest = null;
    }
    if (!isVoiceTestAllowed(manifest)) return;
    let running = false;
    const start = async (req) => {
      if (running) return { ok: false, reason: "busy" };
      running = true;
      try {
        if (typeof o.ensureEnabled === "function" && !await o.ensureEnabled()) return { ok: false, reason: "voice-off" };
        const report = await runVoiceTest({
          kind: req.kind,
          count: req.count,
          label: typeof req.label === "string" ? req.label : "",
          mode: o.target,
          enqueue: o.enqueue,
          getDiag: o.getDiag,
          isIdle: o.isIdle,
          prepare: o.prepare,
          write: (r) => appendVoiceTestReport(chrome.storage.local, r)
        });
        return { ok: true, report };
      } finally {
        running = false;
      }
    };
    try {
      chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (!msg || msg.type !== VOICE_TEST_MESSAGE || msg.target !== o.target) return false;
        if (msg.ping === true) {
          let voiceOn = true;
          try {
            voiceOn = typeof o.isVoiceOn === "function" ? o.isVoiceOn() === true : true;
          } catch {
            voiceOn = false;
          }
          sendResponse({ ok: true, ready: true, running, voiceOn });
          return false;
        }
        void start(msg).then(sendResponse, () => sendResponse({ ok: false, reason: "error" }));
        return true;
      });
    } catch {
    }
    if (o.readUrl) {
      try {
        const sp = new URLSearchParams(window.location.search);
        const kind = sp.get("voicetest");
        if (kind) setTimeout(() => {
          void start({ kind, count: sp.get("voicetestn") || 10, label: sp.get("voicetestlabel") || "" });
        }, 3e3);
      } catch {
      }
    }
  }

  // src/lib/voiceDiagKey.js
  var KEY_VOICE_DIAG = "nls_voice_diag_v1";

  // src/lib/avatarFaceStore.js
  var AVATAR_FACE_DB_NAME = "nls_avatar_face_v1";
  var AVATAR_FACE_STORE_NAME = "faces";
  var FACE_RENDER_VERSION = 1;
  var AVATAR_FACE_MAX_ENTRIES = 2e3;
  var PNG_PREFIX = "data:image/png;base64,";
  var PRUNE_EVERY_MS = 6e4;
  function createAvatarFaceStore(deps = {}) {
    const idb = deps.indexedDBRef !== void 0 ? deps.indexedDBRef : typeof indexedDB !== "undefined" ? indexedDB : null;
    const now = deps.now || (() => Date.now());
    const later = deps.setTimeoutRef || ((fn, ms) => setTimeout(fn, ms));
    const flushMs = deps.flushMs ?? 1e3;
    const maxEntries = deps.maxEntries ?? AVATAR_FACE_MAX_ENTRIES;
    let dbPromise2 = null;
    const openDb = () => {
      if (!idb) return Promise.resolve(null);
      if (dbPromise2) return dbPromise2;
      dbPromise2 = new Promise((resolve) => {
        try {
          const req = idb.open(AVATAR_FACE_DB_NAME, 1);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(AVATAR_FACE_STORE_NAME)) {
              const os = db.createObjectStore(AVATAR_FACE_STORE_NAME, { keyPath: "k" });
              os.createIndex("byTime", "t", { unique: false });
            }
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
          req.onblocked = () => resolve(null);
        } catch {
          resolve(null);
        }
      }).then((db) => {
        if (!db) dbPromise2 = null;
        return db;
      });
      return dbPromise2;
    };
    const fullKey = (userKey) => `${FACE_RENDER_VERSION}:${userKey}`;
    let pendingGets = /* @__PURE__ */ new Map();
    let getScheduled = false;
    const flushGets = async () => {
      getScheduled = false;
      const batch = pendingGets;
      pendingGets = /* @__PURE__ */ new Map();
      const found = /* @__PURE__ */ new Map();
      try {
        const db = await openDb();
        if (db) {
          await new Promise((resolve) => {
            try {
              const tx = db.transaction(AVATAR_FACE_STORE_NAME, "readonly");
              const os = tx.objectStore(AVATAR_FACE_STORE_NAME);
              for (const key of batch.keys()) {
                const r = os.get(fullKey(key));
                r.onsuccess = () => {
                  const rec = r.result;
                  if (rec && typeof rec.u === "string" && rec.u.startsWith(PNG_PREFIX)) found.set(key, rec.u);
                };
              }
              tx.oncomplete = () => resolve(void 0);
              tx.onerror = () => resolve(void 0);
              tx.onabort = () => resolve(void 0);
            } catch {
              resolve(void 0);
            }
          });
        }
      } catch {
      }
      for (const [key, resolvers] of batch) {
        const v = found.get(key) || "";
        for (const r of resolvers) r(v);
      }
    };
    let pendingPuts = /* @__PURE__ */ new Map();
    let putScheduled = false;
    let lastPruneAt = 0;
    let lastFlush = Promise.resolve();
    const flushPuts = async () => {
      putScheduled = false;
      const batch = pendingPuts;
      pendingPuts = /* @__PURE__ */ new Map();
      if (batch.size === 0) return;
      try {
        const db = await openDb();
        if (!db) return;
        const t = now();
        await new Promise((resolve) => {
          try {
            const tx = db.transaction(AVATAR_FACE_STORE_NAME, "readwrite");
            const os = tx.objectStore(AVATAR_FACE_STORE_NAME);
            for (const [key, url] of batch) os.put({ k: fullKey(key), u: url, t });
            tx.oncomplete = () => resolve(void 0);
            tx.onerror = () => resolve(void 0);
            tx.onabort = () => resolve(void 0);
          } catch {
            resolve(void 0);
          }
        });
        if (t - lastPruneAt >= PRUNE_EVERY_MS) {
          lastPruneAt = t;
          await prune(db);
        }
      } catch {
      }
    };
    const prune = (db) => new Promise((resolve) => {
      try {
        const tx = db.transaction(AVATAR_FACE_STORE_NAME, "readwrite");
        const os = tx.objectStore(AVATAR_FACE_STORE_NAME);
        const countReq = os.count();
        countReq.onsuccess = () => {
          let excess = countReq.result - maxEntries;
          if (excess <= 0) return;
          const cur = os.index("byTime").openCursor();
          cur.onsuccess = () => {
            const c = cur.result;
            if (!c || excess <= 0) return;
            c.delete();
            excess -= 1;
            c.continue();
          };
        };
        tx.oncomplete = () => resolve(void 0);
        tx.onerror = () => resolve(void 0);
        tx.onabort = () => resolve(void 0);
      } catch {
        resolve(void 0);
      }
    });
    return {
      /**
       * 作り済みの顔(PNG の data URL)を返す。無ければ ''。同じ tick の呼び出しは 1 回の読みにまとめる。
       * @param {string} userKey
       * @returns {Promise<string>}
       */
      get(userKey) {
        const key = String(userKey || "");
        if (!key || !idb) return Promise.resolve("");
        return new Promise((resolve) => {
          const list = pendingGets.get(key);
          if (list) list.push(resolve);
          else pendingGets.set(key, [resolve]);
          if (!getScheduled) {
            getScheduled = true;
            later(() => void flushGets(), 0);
          }
        });
      },
      /**
       * 作った顔を覚えさせる(まとめて書く・1秒に1回)。PNG の data URL 以外は無視。
       * @param {string} userKey
       * @param {string} dataUrl
       */
      put(userKey, dataUrl) {
        const key = String(userKey || "");
        if (!key || !idb || typeof dataUrl !== "string" || !dataUrl.startsWith(PNG_PREFIX)) return;
        pendingPuts.set(key, dataUrl);
        if (!putScheduled) {
          putScheduled = true;
          later(() => {
            lastFlush = flushPuts();
          }, flushMs);
        }
      },
      /**
       * 直近に書いた顔を新しい順に最大 limit 件返す(読むだけ・1回のトランザクション)。v0.1.1691
       *   パネルを開いた瞬間に、前回までの顔をメモリへ先読みするために使う(avatarPartsComposer.hydrateRecentAnonymousFaces)。
       *   今の合成の版(FACE_RENDER_VERSION)の PNG だけ返す。IndexedDB が無い・空・壊れた値・失敗は、空配列(従来どおり作るだけ)。
       *   スキーマは変えない(byTime 索引を逆順に読むだけ=古い版の DB でもそのまま動く)。
       * @param {number} limit
       * @returns {Promise<Array<{ userKey: string, url: string }>>}
       */
      async getRecent(limit) {
        const n = Math.floor(Number(limit));
        if (!idb || !Number.isFinite(n) || n <= 0) return [];
        try {
          const db = await openDb();
          if (!db) return [];
          const cap = Math.min(n, maxEntries);
          const prefix = `${FACE_RENDER_VERSION}:`;
          return await new Promise((resolve) => {
            const out = [];
            try {
              const tx = db.transaction(AVATAR_FACE_STORE_NAME, "readonly");
              const cur = tx.objectStore(AVATAR_FACE_STORE_NAME).index("byTime").openCursor(null, "prev");
              cur.onsuccess = () => {
                const c = cur.result;
                if (!c || out.length >= cap) return;
                const rec = c.value;
                if (rec && typeof rec.k === "string" && rec.k.startsWith(prefix) && typeof rec.u === "string" && rec.u.startsWith(PNG_PREFIX)) {
                  out.push({ userKey: rec.k.slice(prefix.length), url: rec.u });
                }
                c.continue();
              };
              tx.oncomplete = () => resolve(out);
              tx.onerror = () => resolve([]);
              tx.onabort = () => resolve([]);
            } catch {
              resolve([]);
            }
          });
        } catch {
          return [];
        }
      },
      /** テスト用: 書きをいま流す。 */
      flushNow: async () => {
        putScheduled = false;
        lastFlush = flushPuts();
        await lastFlush;
      },
      /** テスト用: 予約済みの書き込みが終わるまで待つ(掃除を含む)。 */
      idle: () => lastFlush
    };
  }
  var defaultStore;
  function getDefaultAvatarFaceStore() {
    if (defaultStore !== void 0) return defaultStore;
    defaultStore = typeof indexedDB !== "undefined" ? createAvatarFaceStore() : null;
    return defaultStore;
  }

  // src/lib/avatarPartAnchors.js
  var AVATAR_PART_ANCHORS = Object.freeze({
    canvasSize: 128,
    face: Object.freeze({
      cx: 0.5,
      cy: 0.53,
      radius: 0.34,
      fill: "#ffe6cf",
      stroke: "#332a26",
      strokeWidth: 0.02
    }),
    cheek: Object.freeze({
      cx: 0.5,
      cy: 0.6,
      width: 0.58
    }),
    eyes: Object.freeze({
      cx: 0.5,
      cy: 0.5,
      width: 0.52
    }),
    mouth: Object.freeze({
      cx: 0.5,
      cy: 0.66,
      width: 0.24
    }),
    hair: Object.freeze({
      cx: 0.5,
      cy: 0.39,
      width: 0.92
    })
  });

  // src/lib/avatarFaceWorkerClient.js
  var AVATAR_FACE_WORKER_TIMEOUT_MS = 3e3;
  var AVATAR_FACE_WORKER_IDLE_MS = 3e4;
  var AVATAR_FACE_WORKER_MAX_CONSECUTIVE_FAILURES = 2;
  function createAvatarFaceWorkerClient(deps) {
    const timeoutMs = deps.timeoutMs ?? AVATAR_FACE_WORKER_TIMEOUT_MS;
    const idleMs = deps.idleMs ?? AVATAR_FACE_WORKER_IDLE_MS;
    const maxFail = deps.maxConsecutiveFailures ?? AVATAR_FACE_WORKER_MAX_CONSECUTIVE_FAILURES;
    const later = deps.setTimeoutRef || ((fn, ms) => setTimeout(fn, ms));
    const cancel = deps.clearTimeoutRef || ((h) => clearTimeout(h));
    let state = "off";
    let worker = null;
    let nextId = 1;
    const pending = /* @__PURE__ */ new Map();
    let idleTimer = null;
    let consecutiveFailures = 0;
    const stats = { rendered: 0, failed: 0, timedOut: 0, started: 0 };
    let lastError = "";
    const clearIdle = () => {
      if (idleTimer != null) {
        cancel(idleTimer);
        idleTimer = null;
      }
    };
    const shutdown = (dead, reason) => {
      clearIdle();
      for (const [, p] of pending) {
        cancel(p.timer);
        p.reject(new Error(reason));
      }
      pending.clear();
      if (worker) {
        try {
          worker.terminate();
        } catch {
        }
        worker = null;
      }
      state = dead ? "dead" : "off";
      if (dead) lastError = reason;
    };
    const armIdle = () => {
      clearIdle();
      if (pending.size > 0) return;
      idleTimer = later(() => {
        idleTimer = null;
        if (pending.size === 0 && state === "ready") shutdown(false, "idle");
      }, idleMs);
    };
    const noteFailure = (reason) => {
      stats.failed += 1;
      consecutiveFailures += 1;
      lastError = reason;
      if (consecutiveFailures >= maxFail) shutdown(true, `連続${maxFail}回失敗: ${reason}`);
    };
    const onMessage = (ev) => {
      const d = ev && ev.data;
      if (!d || typeof d.id !== "number") return;
      const p = pending.get(d.id);
      if (!p) return;
      pending.delete(d.id);
      cancel(p.timer);
      if (d.ok === true && typeof d.dataUrl === "string" && d.dataUrl.startsWith("data:image/png;base64,")) {
        consecutiveFailures = 0;
        stats.rendered += 1;
        p.resolve(d.dataUrl);
      } else {
        const err = String(d && d.error || "bad response");
        if (err === "no-offscreencanvas") shutdown(true, err);
        else noteFailure(err);
        p.reject(new Error(err));
      }
      armIdle();
    };
    const ensureWorker = () => {
      if (state === "dead") throw new Error("worker dead");
      if (worker) return worker;
      try {
        const w = deps.makeWorker();
        if (!w) throw new Error("worker unavailable");
        w.onmessage = onMessage;
        w.onerror = (e) => shutdown(true, `onerror: ${String(e && e.message || "error")}`);
        w.onmessageerror = () => shutdown(true, "onmessageerror");
        worker = w;
        state = "ready";
        stats.started += 1;
        return w;
      } catch (e) {
        shutdown(true, `起動失敗: ${String(e && /** @type {any} */
        e.message || e)}`);
        throw e;
      }
    };
    return {
      /**
       * @param {FaceParts} parts
       * @returns {Promise<string>} PNG の data URL。Worker 不可・故障・タイムアウト・失敗は reject。
       */
      render(parts) {
        return new Promise((resolve, reject) => {
          let w;
          try {
            w = ensureWorker();
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
            return;
          }
          clearIdle();
          const id = nextId++;
          const timer = later(() => {
            if (!pending.has(id)) return;
            pending.delete(id);
            stats.timedOut += 1;
            noteFailure("timeout");
            reject(new Error("timeout"));
            armIdle();
          }, timeoutMs);
          pending.set(id, { resolve, reject, timer });
          try {
            w.postMessage({ id, baseUrl: parts.baseUrl, files: parts.files, hairHue: parts.hairHue });
          } catch (e) {
            pending.delete(id);
            cancel(timer);
            noteFailure(`postMessage: ${String(e && /** @type {any} */
            e.message || e)}`);
            reject(e instanceof Error ? e : new Error(String(e)));
            armIdle();
          }
        });
      },
      snapshot() {
        return { state, inFlight: pending.size, ...stats, lastError };
      },
      dispose() {
        shutdown(false, "dispose");
      }
    };
  }

  // src/lib/avatarComposeDiagLine.js
  var KEY_AVATAR_COMPOSE_DIAG = "nls_avatar_compose_diag_v1";

  // src/lib/avatarPartsComposer.js
  var AVATAR_PART_KEYS = Object.freeze({
    hair: Object.freeze([
      "bob",
      "short-flip",
      "long",
      "ponytail",
      "twintail",
      "mushroom",
      "center-part",
      "wolf"
    ]),
    eyes: Object.freeze([
      "open",
      "smile",
      "jito",
      "sparkle",
      "surprised",
      "sleepy"
    ]),
    mouth: Object.freeze([
      "omega",
      "smile",
      "open",
      "mu",
      "pokan",
      "smirk"
    ]),
    cheek: Object.freeze([null, "0", "1"]),
    hairHue: Object.freeze([0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330])
  });
  var AVATAR_DATA_URL_CACHE_MAX = 512;
  var avatarDataUrlCache = /* @__PURE__ */ new Map();
  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const r = typeof reader.result === "string" ? reader.result : "";
        if (r.startsWith("data:")) resolve(r);
        else reject(new Error("FileReader returned a non data: value"));
      };
      reader.onerror = () => reject(reader.error || new Error("FileReader failed"));
      reader.readAsDataURL(blob);
    });
  }
  async function canvasToImageUrl(canvas) {
    if (typeof canvas.toBlob === "function" && typeof FileReader !== "undefined") {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (blob) {
        try {
          return await blobToDataUrl(blob);
        } catch {
        }
      }
    }
    return canvas.toDataURL("image/png");
  }
  var avatarComposeInFlight = /* @__PURE__ */ new Map();
  var avatarPartImageCache = /* @__PURE__ */ new Map();
  function hashString2(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function normalizeUserKey(userKey) {
    return typeof userKey === "string" ? userKey.trim() : "";
  }
  function pickHashed(userKey, slot, values) {
    return values[hashString2(`${userKey}${slot}`) % values.length];
  }
  function selectAvatarParts(userKey) {
    const key = normalizeUserKey(userKey);
    if (!key) return null;
    return Object.freeze({
      hairKey: pickHashed(key, "hair", AVATAR_PART_KEYS.hair),
      hairHue: pickHashed(key, "hair-hue", AVATAR_PART_KEYS.hairHue),
      eyesKey: pickHashed(key, "eyes", AVATAR_PART_KEYS.eyes),
      mouthKey: pickHashed(key, "mouth", AVATAR_PART_KEYS.mouth),
      cheekKey: pickHashed(key, "cheek", AVATAR_PART_KEYS.cheek)
    });
  }
  function avatarPartUrl(filename) {
    const runtime = globalThis.chrome?.runtime;
    if (!runtime || typeof runtime.getURL !== "function") {
      throw new Error("chrome.runtime.getURL is unavailable");
    }
    return runtime.getURL(`images/avatar-parts/${filename}`);
  }
  function loadAvatarPartImage(filename) {
    const hit = avatarPartImageCache.get(filename);
    if (hit) return hit;
    const promise = new Promise((resolve, reject) => {
      if (typeof Image !== "function") {
        reject(new Error("Image is unavailable"));
        return;
      }
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`avatar part load failed: ${filename}`));
      img.src = avatarPartUrl(filename);
    });
    avatarPartImageCache.set(filename, promise);
    promise.catch(() => {
      if (avatarPartImageCache.get(filename) === promise) {
        avatarPartImageCache.delete(filename);
      }
    });
    return promise;
  }
  function drawPart(ctx, image, anchor, size) {
    const width = anchor.width * size;
    const natW = Number(
      /** @type {any} */
      image?.naturalWidth
    ) || 0;
    const natH = Number(
      /** @type {any} */
      image?.naturalHeight
    ) || 0;
    const aspect = natW > 0 && natH > 0 ? natH / natW : null;
    const height = aspect != null ? width * aspect : (Number.isFinite(anchor.height) ? Number(anchor.height) : anchor.width) * size;
    ctx.drawImage(
      image,
      anchor.cx * size - width / 2,
      anchor.cy * size - height / 2,
      width,
      height
    );
  }
  function colorizeHair(image, hairHue, size) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d canvas is unavailable");
    drawPart(ctx, image, AVATAR_PART_ANCHORS.hair, size);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = `hsl(${hairHue} 72% 58%)`;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = "destination-in";
    drawPart(ctx, image, AVATAR_PART_ANCHORS.hair, size);
    ctx.globalCompositeOperation = "source-over";
    return canvas;
  }
  var FACE_WORKER_ENABLED = true;
  var faceWorkerClient = null;
  function getFaceWorkerClient() {
    if (!FACE_WORKER_ENABLED || typeof Worker !== "function") return null;
    const runtime = globalThis.chrome?.runtime;
    if (!runtime || typeof runtime.getURL !== "function") return null;
    if (!faceWorkerClient) {
      faceWorkerClient = createAvatarFaceWorkerClient({
        makeWorker: () => new Worker(runtime.getURL("dist/avatar-face-worker.js"))
      });
    }
    return faceWorkerClient;
  }
  async function composeFaceViaWorker(selected) {
    const client = getFaceWorkerClient();
    if (!client) return "";
    try {
      return await client.render({
        baseUrl: avatarPartUrl(""),
        files: {
          hair: `hair-${selected.hairKey}.png`,
          eyes: `eyes-${selected.eyesKey}.png`,
          mouth: `mouth-${selected.mouthKey}.png`,
          cheek: selected.cheekKey == null ? null : `cheek-${selected.cheekKey}.png`
        },
        hairHue: selected.hairHue
      });
    } catch {
      avatarComposeStats.workerFallback += 1;
      return "";
    }
  }
  function rememberFace(key, dataUrl) {
    avatarDataUrlCache.set(key, dataUrl);
    while (avatarDataUrlCache.size > AVATAR_DATA_URL_CACHE_MAX) {
      const oldestKey = avatarDataUrlCache.keys().next().value;
      if (oldestKey == null) break;
      avatarDataUrlCache.delete(oldestKey);
    }
  }
  function composeAvatarPartsDataUrl(userKey) {
    const key = normalizeUserKey(userKey);
    const selected = selectAvatarParts(key);
    if (!selected) return Promise.resolve("");
    const cached = avatarDataUrlCache.get(key);
    if (cached) {
      avatarDataUrlCache.delete(key);
      avatarDataUrlCache.set(key, cached);
      return Promise.resolve(cached);
    }
    const inFlight = avatarComposeInFlight.get(key);
    if (inFlight) return inFlight;
    const promise = (async () => {
      const faceStore = getDefaultAvatarFaceStore();
      if (faceStore) {
        const persisted = await faceStore.get(key);
        if (persisted) {
          avatarComposeStats.persistedHit += 1;
          rememberFace(key, persisted);
          return persisted;
        }
      }
      const viaWorker = await composeFaceViaWorker(selected);
      if (viaWorker) {
        avatarComposeStats.workerComposed += 1;
        rememberFace(key, viaWorker);
        if (faceStore) faceStore.put(key, viaWorker);
        return viaWorker;
      }
      if (typeof document === "undefined" || typeof document.createElement !== "function") {
        throw new Error("document canvas is unavailable");
      }
      const files = [
        `hair-${selected.hairKey}.png`,
        `eyes-${selected.eyesKey}.png`,
        `mouth-${selected.mouthKey}.png`,
        ...selected.cheekKey == null ? [] : [`cheek-${selected.cheekKey}.png`]
      ];
      const loaded = await Promise.all(files.map(loadAvatarPartImage));
      const [hair, eyes, mouth, cheek] = loaded;
      const size = AVATAR_PART_ANCHORS.canvasSize;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2d canvas is unavailable");
      const face = AVATAR_PART_ANCHORS.face;
      ctx.beginPath();
      ctx.arc(face.cx * size, face.cy * size, face.radius * size, 0, Math.PI * 2);
      ctx.fillStyle = face.fill;
      ctx.fill();
      ctx.lineWidth = face.strokeWidth * size;
      ctx.strokeStyle = face.stroke;
      ctx.stroke();
      if (cheek) drawPart(ctx, cheek, AVATAR_PART_ANCHORS.cheek, size);
      drawPart(ctx, eyes, AVATAR_PART_ANCHORS.eyes, size);
      drawPart(ctx, mouth, AVATAR_PART_ANCHORS.mouth, size);
      ctx.drawImage(colorizeHair(hair, selected.hairHue, size), 0, 0);
      const dataUrl = await canvasToImageUrl(canvas);
      rememberFace(key, dataUrl);
      if (faceStore) faceStore.put(key, dataUrl);
      return dataUrl;
    })();
    avatarComposeInFlight.set(key, promise);
    void promise.then(
      () => {
        if (avatarComposeInFlight.get(key) === promise) {
          avatarComposeInFlight.delete(key);
        }
      },
      () => {
        if (avatarComposeInFlight.get(key) === promise) {
          avatarComposeInFlight.delete(key);
        }
      }
    );
    return promise;
  }
  function anonymousAvatarDataUrlUpgrade(userKey, sizePx = 64) {
    const key = normalizeUserKey(userKey);
    const immediate = anonymousIdenticonDataUrl(key, sizePx);
    if (!key || !immediate) {
      return { immediate: "", promise: Promise.resolve("") };
    }
    return {
      immediate,
      promise: composeAvatarPartsDataUrl(key).catch(() => immediate)
    };
  }
  function upgradeAnonymousAvatarImage(img, userKey, sizePx = 64) {
    const key = normalizeUserKey(userKey);
    const immediate = key ? anonymousIdenticonDataUrl(key, sizePx) : "";
    if (!img || !key || !immediate) return anonymousAvatarDataUrlUpgrade(key, sizePx);
    const upgrade = { immediate, promise: composeWhenNear(img, key, immediate) };
    img.dataset.nlAnonymousAvatarKey = key;
    if (!img.getAttribute("src")) img.src = upgrade.immediate;
    const expectedSrc = img.getAttribute("src") || upgrade.immediate;
    void upgrade.promise.then((dataUrl) => {
      if (!dataUrl || img.dataset.nlAnonymousAvatarKey !== key) return;
      if ("isConnected" in img && !img.isConnected) return;
      const currentSrc = img.getAttribute("src") || "";
      if (currentSrc !== expectedSrc && currentSrc !== upgrade.immediate) return;
      if (currentSrc === dataUrl) return;
      img.src = dataUrl;
    });
    return upgrade;
  }
  var AVATAR_COMPOSE_MAX_CONCURRENT = 3;
  var AVATAR_COMPOSE_NEAR_MARGIN_PX = 400;
  var AVATAR_GATE_SWEEP_MS = 3e3;
  function createComposeLimiter(max = AVATAR_COMPOSE_MAX_CONCURRENT) {
    const limit = Math.max(1, Math.floor(max) || 1);
    let active = 0;
    const queue = [];
    const stats = { maxQueued: 0 };
    const pump = () => {
      while (active < limit && queue.length > 0) {
        const job = (
          /** @type {NonNullable<ReturnType<typeof queue.shift>>} */
          queue.shift()
        );
        active += 1;
        let p;
        try {
          p = Promise.resolve(job.task());
        } catch (e) {
          p = Promise.reject(e);
        }
        p.then(job.resolve, job.reject).finally(() => {
          active -= 1;
          pump();
        });
      }
    };
    return {
      run(task) {
        return new Promise((resolve, reject) => {
          queue.push({ task, resolve, reject });
          if (queue.length > stats.maxQueued) stats.maxQueued = queue.length;
          pump();
        });
      },
      snapshot: () => ({ active, queued: queue.length, maxQueued: stats.maxQueued })
    };
  }
  function createViewportGate(deps = {}) {
    const IO = deps.IntersectionObserver !== void 0 ? deps.IntersectionObserver : globalThis.IntersectionObserver;
    const setIv = deps.setInterval || globalThis.setInterval;
    const clearIv = deps.clearInterval || globalThis.clearInterval;
    const marginPx = deps.marginPx ?? AVATAR_COMPOSE_NEAR_MARGIN_PX;
    const pending = /* @__PURE__ */ new Map();
    let io = null;
    let timer = null;
    const stopSweepIfIdle = () => {
      if (pending.size === 0 && timer != null) {
        clearIv(timer);
        timer = null;
      }
    };
    const sweep = () => {
      for (const [el, resolve] of [...pending]) {
        if (el && el.isConnected === false) {
          pending.delete(el);
          try {
            io?.unobserve(el);
          } catch {
          }
          resolve(false);
        }
      }
      stopSweepIfIdle();
    };
    return {
      whenNear(el) {
        if (!el || typeof IO !== "function") return Promise.resolve(true);
        return new Promise((resolve) => {
          if (!io) {
            io = new IO((entries) => {
              for (const e of entries) {
                if (!e.isIntersecting) continue;
                const r = pending.get(e.target);
                if (!r) continue;
                pending.delete(e.target);
                try {
                  io.unobserve(e.target);
                } catch {
                }
                r(true);
              }
              stopSweepIfIdle();
            }, { rootMargin: `${marginPx}px 0px` });
          }
          pending.set(el, resolve);
          io.observe(el);
          if (timer == null) timer = setIv(sweep, AVATAR_GATE_SWEEP_MS);
        });
      },
      pendingCount: () => pending.size,
      sweepNow: sweep
    };
  }
  var avatarComposeLimiter = createComposeLimiter();
  var avatarViewportGate = createViewportGate();
  var avatarComposeStats = { requested: 0, cacheHit: 0, persistedHit: 0, hydrated: 0, workerComposed: 0, workerFallback: 0, composedAfterNear: 0, skippedDetached: 0, failed: 0 };
  function getAvatarComposeStats() {
    const lim = avatarComposeLimiter.snapshot();
    return { ...avatarComposeStats, waitingNear: avatarViewportGate.pendingCount(), active: lim.active, queued: lim.queued, maxQueued: lim.maxQueued, cacheSize: avatarDataUrlCache.size, worker: faceWorkerClient ? faceWorkerClient.snapshot() : { state: "unused" } };
  }
  var composeDiagTimer = null;
  var composeDiagSig = "";
  function noteComposeDiag() {
    if (composeDiagTimer != null) return;
    const session = globalThis.chrome?.storage?.session;
    if (!session || typeof session.set !== "function") return;
    composeDiagTimer = setTimeout(() => {
      composeDiagTimer = null;
      try {
        const stats = getAvatarComposeStats();
        const sig = JSON.stringify(stats);
        if (sig === composeDiagSig) return;
        composeDiagSig = sig;
        void session.set({ [KEY_AVATAR_COMPOSE_DIAG]: { at: Date.now(), stats } }).catch(() => {
        });
        noteComposeDiag();
      } catch {
      }
    }, 4e3);
  }
  function composeWhenNear(img, key, immediate) {
    avatarComposeStats.requested += 1;
    noteComposeDiag();
    if (avatarDataUrlCache.has(key)) {
      avatarComposeStats.cacheHit += 1;
      return composeAvatarPartsDataUrl(key).catch(() => immediate);
    }
    return avatarViewportGate.whenNear(img).then((near) => {
      if (!near) {
        avatarComposeStats.skippedDetached += 1;
        return immediate;
      }
      avatarComposeStats.composedAfterNear += 1;
      return avatarComposeLimiter.run(() => composeAvatarPartsDataUrl(key)).catch(() => {
        avatarComposeStats.failed += 1;
        return immediate;
      });
    });
  }
  function upgradeAnonymousAvatarImages(root) {
    if (!root || typeof root.querySelectorAll !== "function") return;
    root.querySelectorAll("img[data-nl-anonymous-avatar-key]").forEach((node) => {
      const img = (
        /** @type {HTMLImageElement} */
        node
      );
      upgradeAnonymousAvatarImage(
        img,
        img.dataset.nlAnonymousAvatarKey || "",
        Math.max(img.naturalWidth || 0, img.width || 0, 64)
      );
    });
  }

  // src/lib/storageOpTimeout.js
  var STORAGE_OP_TIMED_OUT = /* @__PURE__ */ Symbol("storage_op_timeout");
  async function runStorageOpWithTimeout(opFn, timeoutMs, sentinel = STORAGE_OP_TIMED_OUT) {
    const ms = Number(timeoutMs);
    if (!Number.isFinite(ms) || ms <= 0) {
      return opFn();
    }
    let timer = null;
    try {
      const result = await Promise.race([
        opFn(),
        new Promise((_resolve, reject) => {
          timer = setTimeout(() => reject(sentinel), ms);
        })
      ]);
      return (
        /** @type {T} */
        result
      );
    } finally {
      if (timer != null) clearTimeout(timer);
    }
  }

  // src/lib/comeviewTimelineDiff.js
  function diffComeviewTimeline(domKeys, timeline) {
    const dom = Array.isArray(domKeys) ? domKeys.filter((k) => typeof k === "string" && k) : [];
    const items = Array.isArray(timeline) ? timeline.filter((it) => it && it.key) : [];
    const wantKeys = items.map((it) => String(it.key));
    const wantSet = new Set(wantKeys);
    if (wantKeys.length !== wantSet.size) {
      return { removeKeys: [], appendItems: [], reorderNeeded: true, unchanged: false };
    }
    const domSet = new Set(dom);
    const removeKeys = dom.filter((k) => !wantSet.has(k));
    const keptFromDom = dom.filter((k) => wantSet.has(k));
    const keptFromWant = wantKeys.filter((k) => domSet.has(k));
    if (keptFromDom.length !== keptFromWant.length) {
      return { removeKeys: [], appendItems: [], reorderNeeded: true, unchanged: false };
    }
    for (let i = 0; i < keptFromDom.length; i += 1) {
      if (keptFromDom[i] !== keptFromWant[i]) {
        return { removeKeys: [], appendItems: [], reorderNeeded: true, unchanged: false };
      }
    }
    const lastKeptIndexInWant = keptFromWant.length ? wantKeys.lastIndexOf(keptFromWant[keptFromWant.length - 1]) : -1;
    for (let i = 0; i < lastKeptIndexInWant; i += 1) {
      if (!domSet.has(wantKeys[i])) {
        return { removeKeys: [], appendItems: [], reorderNeeded: true, unchanged: false };
      }
    }
    const appendItems = items.slice(lastKeptIndexInWant + 1).filter((it) => !domSet.has(String(it.key)));
    return {
      removeKeys,
      appendItems,
      reorderNeeded: false,
      unchanged: removeKeys.length === 0 && appendItems.length === 0
    };
  }

  // src/lib/voiceLoadingState.js
  var VOICE_LOADING_FLICKER_GUARD_MS = 180;
  function shouldRenderLoading(state, elapsedMs) {
    if (state === "connecting") return true;
    if (state !== "checking") return false;
    const e = typeof elapsedMs === "number" && elapsedMs >= 0 ? elapsedMs : 0;
    return e >= VOICE_LOADING_FLICKER_GUARD_MS;
  }
  function resolveVoiceLoadingView(state, surface, reason) {
    if (state === "ready" || state === "idle") return { kind: "hidden", text: "" };
    if (state === "notfound") {
      if (reason === "timeout") {
        return {
          kind: "error",
          text: "VOICEVOXは起動していますが応答がありません(重い処理中かもしれません。もう一度押すと再接続します)"
        };
      }
      if (reason === "http-error") {
        return {
          kind: "error",
          text: "VOICEVOXが応答しましたがエラーでした(バージョンを確認してください)"
        };
      }
      if (reason === "no-fetch") {
        return {
          kind: "error",
          text: "拡張の接続が切れています(ページを再読み込みしてください)"
        };
      }
      return {
        kind: "error",
        text: "VOICEVOXが見つかりません(起動して読み上げを押し直してください)"
      };
    }
    const connecting = state === "connecting";
    if (surface === "venue") {
      return {
        kind: "loading",
        text: connecting ? "🎤 ステージ準備中…(起動直後は数秒かかります)" : "🎤 まもなく開演…声の準備中"
      };
    }
    return {
      kind: "loading",
      text: connecting ? "🎤 接続中…(起動直後は数秒かかります)" : "🎤 マイクチェック中…"
    };
  }

  // src/extension/comeview-entry.js
  var DEFAULT_TILE_IMG = "images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png";
  var TIMELINE_LIMIT = 120;
  var HOT_POLL_INTERVAL_MS = 5e3;
  var RECONCILE_INTERVAL_MS = 6e4;
  var FULL_REFRESH_STORAGE_TIMEOUT_MS = 8e3;
  var COMEVIEW_BOOT_READ_TIMEOUT_MS = 1500;
  var _storageChangesWired = false;
  var VOICE_READING_ENABLED_KEY = KEY_VOICE_READING_ENABLED;
  var VOICE_ASSIGNMENTS_KEY = KEY_VOICE_ASSIGNMENTS;
  var VOICE_READ_NAME_KEY = KEY_VOICE_READ_NAME_ENABLED;
  var _liveId = "";
  var _paused = false;
  var _timer = null;
  var _lastReconcileAt = 0;
  var _fullRefreshPromise = null;
  var _fullRefreshRequested = false;
  var _fullRefreshForceBottom = false;
  var _fullRefreshRunning = false;
  var _tailRows = [];
  var _giftRows = [];
  var _deferredTailRows = null;
  var _deferredGiftRows = null;
  var _renderedKeys = /* @__PURE__ */ new Set();
  var _seenCommentNos = /* @__PURE__ */ new Set();
  var SEEN_COMMENT_NOS_MAX = 8e3;
  var _seenGiftAtBySig = /* @__PURE__ */ new Map();
  var SEEN_GIFT_SIGS_MAX = 2e3;
  function rememberSeenCommentNo(no) {
    if (!no) return;
    _seenCommentNos.add(no);
    if (_seenCommentNos.size > SEEN_COMMENT_NOS_MAX) {
      const drop = _seenCommentNos.size - SEEN_COMMENT_NOS_MAX;
      let i = 0;
      for (const k of _seenCommentNos) {
        _seenCommentNos.delete(k);
        i += 1;
        if (i >= drop) break;
      }
    }
  }
  function trimSeenGiftSigs() {
    if (_seenGiftAtBySig.size <= SEEN_GIFT_SIGS_MAX) return;
    const drop = _seenGiftAtBySig.size - SEEN_GIFT_SIGS_MAX;
    let i = 0;
    for (const k of _seenGiftAtBySig.keys()) {
      _seenGiftAtBySig.delete(k);
      i += 1;
      if (i >= drop) break;
    }
  }
  var _timelineItemsByKey = /* @__PURE__ */ new Map();
  var _commentCount = 0;
  var _hoverBar = null;
  var _hoverRow = null;
  var _voiceReadingEnabled = false;
  var _voiceReaderLease = startVoiceReaderLease(() => _voiceReadingEnabled && !isObsMode() && !!_liveId, () => _liveId, {
    onPageHide: (fn) => window.addEventListener("pagehide", fn)
  });
  var _voiceToggleBusy = false;
  var _voiceReadNameEnabled = false;
  var _voiceStyleIds = [];
  var _voiceAssignments = {};
  var _voiceQueue = [];
  var _voicePrefetches = /* @__PURE__ */ new Map();
  var _voicePlaying = false;
  var _voiceGeneration = 0;
  var _voiceStopCurrent = null;
  var _voiceStreamSupported = false;
  var _voiceGpuCapable = (
    /** @type {boolean|null} */
    null
  );
  var _voiceSlowEngine = false;
  var _voiceSkipTimer = null;
  var _initialVoicesPrimed = false;
  var _voiceDiag = makeInitialVoiceDiag();
  _voiceDiag.diagBornAt = Date.now();
  function markVoicePhase(phase) {
    _voiceDiag.lastPhase = String(phase || "");
    _voiceDiag.lastPhaseAt = Date.now();
  }
  var VOICE_DRAIN_STUCK_MS = 3e4;
  var _voiceDrainStuckTimer = null;
  function publishVoiceDiag() {
    _voiceDiagPublisher.request();
  }
  var _voiceDiagPublisher = createTrailingPublisher(writeVoiceDiagNow, 3e3);
  function writeVoiceDiagNow() {
    try {
      const now = Date.now();
      const snap = { ...buildVoiceDiagSnapshot(_voiceDiag, now, _liveId), source: "comeview" };
      chrome.storage.local.set({ [KEY_VOICE_DIAG]: snap }).catch(() => {
      });
    } catch {
    }
  }
  function recordVoiceSynthFailureReason(info) {
    try {
      const reason = classifyVoiceSynthFailureReason(info);
      const bag = _voiceDiag.synthFailReasons || (_voiceDiag.synthFailReasons = {});
      bag[reason] = (Number(bag[reason]) || 0) + 1;
    } catch {
    }
  }
  var _ngList = [];
  var _ngKeys = /* @__PURE__ */ new Set();
  var _userNotes = {};
  var _profileCache = {};
  var _hiddenSigs = /* @__PURE__ */ new Set();
  var _pinShownSig = "";
  var CV_ACTION_ICONS = {
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9zm4 2v9h2v-9h-2zm4 0v9h2v-9h-2z"/></svg>',
    block: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM4 12a8 8 0 0 1 12.9-6.3L5.7 16.9A7.96 7.96 0 0 1 4 12zm8 8a7.96 7.96 0 0 1-4.9-1.7L18.3 7.1A8 8 0 0 1 12 20z"/></svg>',
    person: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3.3 0-8 1.7-8 5v2h16v-2c0-3.3-4.7-5-8-5z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 9V4h1a1 1 0 0 0 0-2H7a1 1 0 0 0 0 2h1v5l-2 3v2h5v6l1 1 1-1v-6h5v-2l-2-3z"/></svg>'
  };
  function resolveLiveIdFromUrl() {
    try {
      const p = new URLSearchParams(window.location.search).get("lv") || "";
      const m = String(p).trim().toLowerCase().match(/lv\d{1,15}/);
      if (m) return m[0];
    } catch {
    }
    return "";
  }
  async function resolveLiveIdFromStorage() {
    try {
      const bag = await runStorageOpWithTimeout(
        () => chrome.storage.local.get(KEY_LAST_WATCH_URL),
        COMEVIEW_BOOT_READ_TIMEOUT_MS
      );
      const url = String(bag?.[KEY_LAST_WATCH_URL] || "");
      const m = url.toLowerCase().match(/lv\d{1,15}/);
      if (m) return m[0];
    } catch {
    }
    return "";
  }
  var _explicitLiveId = false;
  async function switchToLiveId(nextLiveId) {
    const lv = String(nextLiveId || "").trim().toLowerCase();
    if (!/^lv\d{1,15}$/.test(lv) || lv === _liveId) return;
    _liveId = lv;
    const meta = document.getElementById("cvLiveMeta");
    if (meta) meta.textContent = _liveId;
    _renderedKeys.clear();
    _seenCommentNos.clear();
    _voiceBatchSeenNos.clear();
    _voiceMaxCommentNo = 0;
    _voiceReadNos.clear();
    void _livePush.ensure();
    _seenGiftAtBySig.clear();
    _tailRows = [];
    _giftRows = [];
    _voiceQueue = [];
    _voiceGeneration += 1;
    _voicePrefetches.clear();
    resetVoiceDiagForNewLive(_voiceDiag, Date.now());
    _voiceArrivalWindow = null;
    resetVoicePaceArrival(_voicePaceState);
    updateVoiceLagNotice();
    await requestFullRefresh(true);
  }
  function isObsMode() {
    try {
      return new URLSearchParams(window.location.search).get("obs") === "1";
    } catch {
      return false;
    }
  }
  function updateVoiceToggle() {
    const button = document.getElementById("cvBtnVoice");
    if (!button) return;
    button.disabled = _voiceToggleBusy;
    button.classList.toggle("is-on", _voiceReadingEnabled);
    button.setAttribute("aria-pressed", String(_voiceReadingEnabled));
    button.textContent = _voiceReadingEnabled ? "🔊 読み上げ: ON" : "🔈 読み上げ: OFF";
    const nameBtn = document.getElementById("cvBtnVoiceName");
    if (nameBtn) {
      nameBtn.hidden = !_voiceReadingEnabled;
      nameBtn.classList.toggle("is-on", _voiceReadNameEnabled);
      nameBtn.setAttribute("aria-pressed", String(_voiceReadNameEnabled));
      nameBtn.textContent = _voiceReadNameEnabled ? "名前読み ON" : "名前読み OFF";
    }
  }
  function setVoiceStatus(message) {
    const status = document.getElementById("cvVoiceStatus");
    if (!status) return;
    status.classList.remove("is-loading");
    status.classList.toggle("is-error", /見つかりません|ブロック/.test(String(message || "")));
    status.textContent = String(message || "");
  }
  var _cvVoiceLoadingTimer = null;
  function renderCvVoiceLoading(state, reason) {
    const status = document.getElementById("cvVoiceStatus");
    if (!status) return;
    const view = resolveVoiceLoadingView(state, "comeview", reason);
    status.classList.toggle("is-loading", view.kind === "loading");
    status.classList.toggle("is-error", view.kind === "error");
    status.textContent = view.text;
  }
  function driveCvVoiceLoading(state, reason) {
    if (_cvVoiceLoadingTimer != null) {
      clearTimeout(_cvVoiceLoadingTimer);
      _cvVoiceLoadingTimer = null;
    }
    if (state === "checking") {
      const status = document.getElementById("cvVoiceStatus");
      if (status) {
        status.classList.remove("is-loading", "is-error");
        status.textContent = "";
      }
      _cvVoiceLoadingTimer = window.setTimeout(() => {
        _cvVoiceLoadingTimer = null;
        if (shouldRenderLoading("checking", VOICE_LOADING_FLICKER_GUARD_MS)) renderCvVoiceLoading("checking");
      }, VOICE_LOADING_FLICKER_GUARD_MS);
      return;
    }
    renderCvVoiceLoading(state, reason);
  }
  function showVoiceSkipped(count) {
    const skipped = document.getElementById("cvVoiceSkip");
    if (!skipped || count <= 0) return;
    skipped.textContent = `${count}件スキップ`;
    if (_voiceSkipTimer != null) clearTimeout(_voiceSkipTimer);
    _voiceSkipTimer = window.setTimeout(() => {
      skipped.textContent = "";
      _voiceSkipTimer = null;
    }, 3e3);
  }
  function persistVoiceReadingEnabled(enabled) {
    try {
      void chrome.storage.local.set({ [VOICE_READING_ENABLED_KEY]: enabled === true });
    } catch {
    }
  }
  function normalizeVoiceAssignments(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw;
  }
  function stopVoicePlayback() {
    _voiceQueue = [];
    _voiceGeneration += 1;
    _voicePrefetches.clear();
    if (typeof _voiceStopCurrent === "function") _voiceStopCurrent();
    _voiceStopCurrent = null;
    updateVoiceLagNotice();
  }
  var _voiceLagNoticeShown = false;
  function updateVoiceLagNotice() {
    const r = decideVoiceLagNotice(_voiceLagNoticeShown, { ..._voiceDiag, queueNow: _voiceQueue.length }, { gpuCapable: _voiceGpuCapable });
    if (r.shown === _voiceLagNoticeShown && !r.shown) return;
    _voiceLagNoticeShown = r.shown;
    const el = document.getElementById("cvVoiceLag");
    if (el) el.textContent = r.text;
    updateVoiceGpuTip();
  }
  function updateVoiceGpuTip() {
    const el = document.getElementById("cvVoiceGpuTip");
    if (!el) return;
    const text = _voiceReadingEnabled ? decideVoiceGpuTip(_voiceDiag, _voiceGpuCapable) : "";
    if (el.textContent === text) return;
    el.textContent = text;
    el.title = text;
    el.hidden = !text;
  }
  function disableVoiceReading({ persist = true } = {}) {
    _voiceReadingEnabled = false;
    _voiceToggleBusy = false;
    _livePush.close();
    stopVoicePlayback();
    updateVoiceToggle();
    if (persist) persistVoiceReadingEnabled(false);
  }
  async function primeCvAudioUnlock() {
    try {
      if (typeof Audio !== "function") return false;
      const a = new Audio();
      a.src = SILENT_WAV_DATA_URI;
      a.volume = 0;
      const p = a.play();
      if (p && typeof p.then === "function") await p;
      try {
        a.pause();
      } catch {
      }
      return true;
    } catch {
      return false;
    }
  }
  async function enableVoiceReading({ persist = true } = {}) {
    if (isObsMode() || _voiceToggleBusy) return;
    _voiceToggleBusy = true;
    updateVoiceToggle();
    driveCvVoiceLoading("checking");
    await primeCvAudioUnlock();
    let probe = await probeVoicevoxAlive();
    if (!probe.ok) {
      driveCvVoiceLoading("connecting");
      for (const waitMs of VOICE_ALIVE_RETRY_BACKOFF_MS) {
        if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
        probe = await probeVoicevoxAlive();
        if (probe.ok) break;
      }
    }
    if (!probe.ok) {
      _voiceDiag.lastEnableFailReason = String(probe.reason || "unknown");
      _voiceDiag.enableFailTotal = (Number(_voiceDiag.enableFailTotal) || 0) + 1;
      publishVoiceDiag();
      disableVoiceReading({ persist: false });
      driveCvVoiceLoading("notfound", probe.reason);
      return;
    }
    const allStyleIds = await listVoicevoxStyleIds();
    startVoiceWarmup(_voiceWarmup, allStyleIds);
    _voiceSynthTracker.reset();
    resetVoiceWarmMeasure(_voiceDiag);
    _voiceStreamSupported = false;
    void probeVoicevoxStreaming().then((ok) => {
      _voiceStreamSupported = ok === true;
    }, () => {
    });
    _voiceGpuCapable = null;
    void probeVoicevoxGpuCapable().then((ok) => {
      _voiceGpuCapable = typeof ok === "boolean" ? ok : null;
    }, () => {
    });
    _voiceStyleIds = (await prepareVoiceStyleIds(allStyleIds, {
      readSettings: async () => {
        const b = await chrome.storage.local.get([KEY_VOICE_NARROW_MODE, KEY_VOICE_WEAK_PC]);
        _voiceSlowEngine = b[KEY_VOICE_WEAK_PC] === true;
        return { mode: b[KEY_VOICE_NARROW_MODE], weak: b[KEY_VOICE_WEAK_PC] };
      },
      initSpeaker: (id) => _voiceWarmup.ensureWhenIdle(id)
      // 合成が走っていない時に裏で(v0.1.1772)
    })).styleIds;
    _voiceGeneration += 1;
    _voiceReadingEnabled = true;
    _voiceToggleBusy = false;
    if (_liveId) void _voiceReaderLease?.beat(_liveId);
    _voiceDiag.lastEnableFailReason = "";
    publishVoiceDiag();
    driveCvVoiceLoading("ready");
    updateVoiceToggle();
    if (persist) persistVoiceReadingEnabled(true);
    void _livePush.ensure();
  }
  function voiceUserKeyForItem(item) {
    const row = {
      userId: String(item?.userId || "").trim(),
      name: String(item?.nickname || "").trim()
    };
    return comeviewUserKeyForRow(row) || row.userId || row.name || "anon";
  }
  var _voiceVolumePercent = VOICE_VOLUME_DEFAULT;
  var _voiceSynthTracker = createVoiceSynthTracker();
  var _voiceWarmup = createVoicevoxWarmup();
  var synthesizeVoiceWarm = withVoiceWarmup(_voiceWarmup, synthesizeVoice);
  wireVoiceQualitySetting();
  wireVoiceWarmupHooks(_voiceWarmup, () => !_voicePlaying && _voiceQueue.length === 0, () => _voiceDiag, chromeVoiceEngineLink());
  var _voiceWeakPcState = { saved: false };
  function synthesizeVoiceTracked(text, voice, extra = {}) {
    const track = _voiceSynthTracker.begin(voice?.styleId);
    let timing = {};
    return synthesizeVoiceWarm(text, voice, {
      onFailure: (info) => recordVoiceSynthFailureReason(info),
      onTiming: (t) => {
        timing = t || {};
      },
      ...extra.stream === true ? { stream: true } : {}
    }).then(
      (wav) => {
        let r = null;
        try {
          r = track.end({ ...timing, audioMs: measureWavAudioMs(wav) }, !!wav);
          recordVoiceSynthStage(_voiceDiag, r);
        } catch {
        }
        const judge = () => {
          rememberWeakVoicePc(_voiceDiag, _voiceWeakPcState, () => chrome.storage.local.set({ [KEY_VOICE_WEAK_PC]: true }));
          forgetWeakVoicePcIfFast(_voiceDiag, _voiceWeakPcState, () => {
            _voiceSlowEngine = false;
            return chrome.storage.local.set({ [KEY_VOICE_WEAK_PC]: false });
          });
        };
        judge();
        if (r && isStreamedVoice(wav)) void recordVoiceStreamDone(_voiceDiag, r, wav, () => Date.now(), judge);
        return wav;
      },
      (err) => {
        try {
          track.end(timing, false);
        } catch {
        }
        throw err;
      }
    );
  }
  function notifyVoiceItemDropped(item) {
    if (item && typeof item.onDropped === "function") {
      try {
        item.onDropped();
      } catch {
      }
    }
  }
  var _voicePaceState = createVoicePaceState();
  var _voiceArrivalWindow = null;
  function comeviewSpeedBoost(congestionBoost) {
    const paceFloor = computeVoicePaceFloor(_voicePaceState);
    const backlog = computeBacklogCatchUpBoost(_voiceDiag.queueWaitEmaMs, paceFloor);
    _voiceDiag.lastPaceFloor = paceFloor;
    _voiceDiag.lastBacklogBoost = backlog;
    return mergeVoiceSpeedBoost(congestionBoost, backlog);
  }
  function ensureVoicePrefetch(item, generation) {
    if (!item || generation !== _voiceGeneration) return null;
    const existing = _voicePrefetches.get(item);
    if (existing && existing.generation === generation) return existing.promise;
    const congestion = computeVoiceCongestion(_voiceQueue.length);
    const assigned = resolveVoiceForUser(
      item.userKey,
      _voiceAssignments,
      _voiceStyleIds
    );
    const boostAtSynth = comeviewSpeedBoost(congestion.speedBoost);
    const text = buildMergedVoiceText(item, { maxChars: capVoiceMaxCharsByBoost(boostAtSynth, congestion.maxChars) });
    if (!_voiceSlowEngine && isWeakVoicePc(_voiceDiag)) _voiceSlowEngine = true;
    const stream = shouldStreamVoice({
      supported: _voiceStreamSupported,
      idle: _voiceQueue[0] === item && !_voiceStopCurrent,
      slowEngine: _voiceSlowEngine,
      textLength: text.length
    });
    const promise = synthesizeVoiceTracked(
      text,
      {
        ...assigned,
        speedOffset: assigned.speedOffset + boostAtSynth
      },
      { stream }
    ).catch(() => null);
    _voicePrefetches.set(item, { generation, promise, boostAtSynth });
    return promise;
  }
  function startVoicePrefetch(generation) {
    if (generation !== _voiceGeneration) {
      _voicePrefetches.clear();
      return;
    }
    const depth = resolveVoiceSynthDepth(_voiceQueue.length, {
      pending: _voiceQueue.length
    });
    const wanted = /* @__PURE__ */ new Set();
    for (let i = 0; i < depth && i < _voiceQueue.length; i++) {
      const item = _voiceQueue[i];
      if (!item) continue;
      wanted.add(item);
      ensureVoicePrefetch(item, generation);
    }
    for (const key of _voicePrefetches.keys()) {
      if (!wanted.has(key)) _voicePrefetches.delete(key);
    }
  }
  async function drainVoiceQueue() {
    if (_voicePlaying || !_voiceReadingEnabled || isObsMode()) return;
    _voicePlaying = true;
    markVoicePhase("drain_enter");
    const drainGenerationAtStart = _voiceGeneration;
    const armDrainWatchdog = () => {
      if (_voiceDrainStuckTimer !== null) clearTimeout(_voiceDrainStuckTimer);
      _voiceDrainStuckTimer = setTimeout(() => {
        if (_voicePlaying && _voiceGeneration === drainGenerationAtStart) {
          markVoicePhase("stuck_recovered");
          _voiceDiag.playbackTimeoutTotal += 1;
          publishVoiceDiag();
          _voiceGeneration += 1;
          _voicePrefetches.clear();
          if (typeof _voiceStopCurrent === "function") {
            try {
              _voiceStopCurrent();
            } catch {
            }
          }
          _voiceStopCurrent = null;
          _voicePlaying = false;
          if (_voiceReadingEnabled && _voiceQueue.length) void drainVoiceQueue();
        }
      }, VOICE_DRAIN_STUCK_MS);
    };
    armDrainWatchdog();
    try {
      while (_voiceReadingEnabled && _voiceQueue.length) {
        const now = Date.now();
        let allStale = true;
        for (const qItem of _voiceQueue) {
          if (!isVoiceItemStale(qItem.enqueuedAt, now, _voiceQueue.length, qItem.priority === "high").stale) {
            allStale = false;
            break;
          }
        }
        if (allStale && _voiceQueue.length > 0) {
          const dropCount = _voiceQueue.length;
          for (const d of _voiceQueue) notifyVoiceItemDropped(d);
          _voiceQueue = [];
          showVoiceSkipped(dropCount);
          _voiceDiag.staleDropTotal += dropCount;
          _voiceDiag.queueNow = 0;
          publishVoiceDiag();
          break;
        }
        const queueLength = _voiceQueue.length;
        if (queueLength > _voiceDiag.queueMax) _voiceDiag.queueMax = queueLength;
        _voiceDiag.queueNow = queueLength;
        const generation = _voiceGeneration;
        startVoicePrefetch(generation);
        const item = _voiceQueue.shift();
        if (!item) continue;
        foldVoiceStageEma(_voiceDiag, "queueWaitEmaMs", measureVoiceGapMs(item.enqueuedAt, Date.now()));
        const ageCheck = isVoiceItemStale(item.enqueuedAt, Date.now(), queueLength, item.priority === "high");
        if (ageCheck.stale) {
          showVoiceSkipped(1);
          _voiceDiag.staleDropTotal += 1;
          notifyVoiceItemDropped(item);
          _voicePrefetches.delete(item);
          continue;
        }
        const congestion = computeVoiceCongestion(queueLength);
        _voiceDiag.lastSpeedBoost = congestion.speedBoost;
        _voiceDiag.lastDepth = resolveVoiceSynthDepth(queueLength, { pending: queueLength });
        const assigned = resolveVoiceForUser(
          item.userKey,
          _voiceAssignments,
          _voiceStyleIds
        );
        const prefetch = _voicePrefetches.get(item);
        _voicePrefetches.delete(item);
        const _synthStart = Date.now();
        markVoicePhase(prefetch ? "await_prefetch" : "await_synth");
        const boostAtSynth = prefetch ? Number(prefetch.boostAtSynth) || 0 : comeviewSpeedBoost(congestion.speedBoost);
        const wav = prefetch ? await prefetch.promise : await synthesizeVoiceTracked(
          buildMergedVoiceText(item, { maxChars: capVoiceMaxCharsByBoost(boostAtSynth, congestion.maxChars) }),
          {
            ...assigned,
            speedOffset: assigned.speedOffset + boostAtSynth
          }
        );
        _voiceDiag.lastSynthMs = Math.max(0, Date.now() - _synthStart);
        markVoicePhase("synth_done");
        if (!wav) {
          _voiceDiag.synthNullTotal = (Number(_voiceDiag.synthNullTotal) || 0) + 1;
          publishVoiceDiag();
        }
        if (!wav || !_voiceReadingEnabled || generation !== _voiceGeneration || isObsMode()) {
          markVoicePhase("skip_after_synth");
          notifyVoiceItemDropped(item);
          if (isStreamedVoice(wav)) wav.cancel();
          continue;
        }
        startVoicePrefetch(generation);
        let objectUrl = "";
        try {
          markVoicePhase("await_playback");
          let audio = isStreamedVoice(wav) ? createBrowserStreamedAudio(wav, _voiceVolumePercent) : null;
          let wholeLevel = null;
          if (!audio) {
            const loud = applyVoiceVolumeToWav(wav, _voiceVolumePercent);
            wholeLevel = measureVoiceWavLevel(loud);
            objectUrl = URL.createObjectURL(new Blob([loud], { type: "audio/wav" }));
            audio = new Audio(objectUrl);
          }
          const playbackRate = isStreamedVoice(wav) ? 1 : computeVoicePlaybackRate(boostAtSynth, comeviewSpeedBoost(computeVoiceCongestion(_voiceQueue.length).speedBoost));
          if (playbackRate !== 1) {
            audio.preservesPitch = true;
            audio.playbackRate = playbackRate;
          }
          observeVoicePlayback(audio, {
            diag: _voiceDiag,
            playbackRate,
            outPeak: wholeLevel ? wholeLevel.peak : -1,
            outRms: wholeLevel ? wholeLevel.rms : -1,
            targetPeak: voiceTargetPeak(_voiceVolumePercent),
            onRecorded: () => publishVoiceDiag()
          });
          let _playStartAt = -1;
          await new Promise((resolve) => {
            let settled = false;
            let watchdog = null;
            const VOICE_PLAYBACK_HARD_CAP_MS = 2e4;
            const armWatchdog = (ms) => {
              if (watchdog !== null) clearTimeout(watchdog);
              watchdog = setTimeout(() => {
                _voiceDiag.playbackTimeoutTotal += 1;
                finish();
              }, Math.max(1e3, ms));
            };
            const finish = () => {
              if (settled) return;
              settled = true;
              if (watchdog !== null) {
                clearTimeout(watchdog);
                watchdog = null;
              }
              audio.removeEventListener("ended", finish);
              audio.removeEventListener("error", finish);
              audio.removeEventListener("loadedmetadata", onMeta);
              if (objectUrl) URL.revokeObjectURL(objectUrl);
              objectUrl = "";
              _voiceStopCurrent = null;
              if (typeof item.onAudioEnd === "function") {
                try {
                  item.onAudioEnd();
                } catch {
                }
              }
              if (_playStartAt > 0) noteVoicePacePlayed(_voicePaceState, Date.now() - _playStartAt, playbackRate, boostAtSynth);
              resolve();
            };
            const onMeta = () => {
              const dur = Number(audio.duration);
              if (Number.isFinite(dur) && dur > 0) armWatchdog(dur * 1e3 / playbackRate + 1500);
            };
            _voiceStopCurrent = () => {
              try {
                audio.pause();
              } catch {
              }
              finish();
            };
            audio.addEventListener("ended", finish, { once: true });
            audio.addEventListener("error", finish, { once: true });
            audio.addEventListener("loadedmetadata", onMeta, { once: true });
            armWatchdog(VOICE_PLAYBACK_HARD_CAP_MS);
            try {
              const playResult = audio.play();
              if (typeof item.onAudioStart === "function") {
                try {
                  item.onAudioStart();
                } catch {
                }
              }
              _playStartAt = Date.now();
              const _e2eMs = measureVoiceGapMs(item.enqueuedAt, Date.now());
              if (_e2eMs >= 0) {
                _voiceDiag.lastE2eMs = _e2eMs;
                _voiceDiag.e2eAvgMs = computeVoiceE2eAverage(_voiceDiag.e2eAvgMs, _e2eMs);
                recordVoiceE2eSample(_voiceDiag, _e2eMs);
              }
              updateVoiceLagNotice();
              if (playResult && typeof playResult.catch === "function") {
                playResult.catch((err) => {
                  if (err && err.name === "NotAllowedError") {
                    _voiceDiag.audioBlockedTotal = (Number(_voiceDiag.audioBlockedTotal) || 0) + 1;
                    publishVoiceDiag();
                    setVoiceStatus("⚠️ブラウザが音声をブロックしています。ページのどこかを一度クリックすると鳴ります");
                  }
                  finish();
                });
              }
            } catch {
              finish();
            }
          });
        } catch {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
        }
        _voiceDiag.spokenTotal += 1;
        _voiceDiag.lastSpokenBase = Date.now();
        _voiceDiag.queueNow = _voiceQueue.length;
        _voiceDiag.enabled = _voiceReadingEnabled;
        markVoicePhase("spoke_done");
        armDrainWatchdog();
        publishVoiceDiag();
      }
    } finally {
      _voicePlaying = false;
      markVoicePhase("drain_exit");
      updateVoiceLagNotice();
      if (_voiceDrainStuckTimer !== null) {
        clearTimeout(_voiceDrainStuckTimer);
        _voiceDrainStuckTimer = null;
      }
      if (_voiceReadingEnabled && _voiceQueue.length) void drainVoiceQueue();
    }
  }
  function noteVoiceBigBatch(items) {
    const nos = items.map((it) => commentNoOfComeviewRow(it));
    const seenBefore = nos.filter((no) => no && _voiceBatchSeenNos.has(no)).length;
    for (const no of nos) if (no) _voiceBatchSeenNos.add(no);
    if (_voiceBatchSeenNos.size > 2e3) _voiceBatchSeenNos.clear();
    if (items.length < 10) return;
    const now = Date.now();
    const ages = items.map((it) => now - Number(it?.at)).filter((a) => Number.isFinite(a));
    _voiceDiag.bigBatchTotal = (Number(_voiceDiag.bigBatchTotal) || 0) + 1;
    _voiceDiag.lastBigBatch = {
      at: now,
      size: items.length,
      noLess: nos.filter((no) => !no).length,
      seenBefore,
      oldestAgeMs: ages.length ? Math.max(...ages) : -1,
      newestAgeMs: ages.length ? Math.min(...ages) : -1
    };
    publishVoiceDiag();
  }
  var _voiceBatchSeenNos = /* @__PURE__ */ new Set();
  var _voiceMaxCommentNo = 0;
  var _voiceReadNos = /* @__PURE__ */ new Set();
  var _livePush = createComeviewLivePushClient({
    isActive: () => _voiceReadingEnabled && !isObsMode(),
    getLiveId: () => _liveId,
    onRows: (_lv, rows) => {
      if (_paused || !rows.length) return;
      const profiled = Object.keys(_profileCache).length ? applyUserCommentProfileMapToEntries(rows, _profileCache).next : rows;
      const items = buildAllComeviewTimeline(profiled, []).filter((it) => it.kind === "comment");
      enqueueLiveVoiceItems(filterVisibleComeviewTimeline(items, _ngKeys, _hiddenSigs));
    }
  });
  function enqueueLiveVoiceItems(items) {
    if (!_voiceReadingEnabled || !Array.isArray(items) || !items.length) return;
    items = takeUnreadVoiceItems(items, _voiceReadNos, commentNoOfComeviewRow);
    if (!items.length) return;
    noteVoiceBigBatch(items);
    const split = splitVoiceBacklogByCommentNo(items, _voiceMaxCommentNo);
    _voiceMaxCommentNo = split.maxNo;
    if (split.backlog) _voiceDiag.backlogSkipTotal = (Number(_voiceDiag.backlogSkipTotal) || 0) + split.backlog;
    items = split.fresh;
    if (!items.length) {
      publishVoiceDiag();
      return;
    }
    if (!_voiceReaderLease) {
      enqueueVoiceTimelineItems(items);
      return;
    }
    void _voiceReaderLease.whenMine(_liveId, () => enqueueVoiceTimelineItems(items), () => {
      _voiceDiag.readerYieldTotal = (Number(_voiceDiag.readerYieldTotal) || 0) + items.length;
      publishVoiceDiag();
    });
  }
  function enqueueVoiceTimelineItems(items) {
    if (!_voiceReadingEnabled || isObsMode() || !Array.isArray(items)) return;
    let droppedCount = 0;
    for (const item of items) {
      if (!item || item.kind !== "comment" && item.kind !== "gift") continue;
      const name = _voiceReadNameEnabled ? String(item.nickname || "").trim() : "";
      let body = "";
      let isHighPriority = false;
      if (item.kind === "gift") {
        isHighPriority = true;
        const count = item.gift?.count > 1 ? `を${item.gift.count}個` : "を";
        body = `ギフト、${item.gift?.name || "アイテム"}${count}贈りました。${item.gift?.message || ""}`.trim();
      } else {
        body = String(item.text || "").trim();
      }
      if (!buildVoiceReadingText({ name, text: body })) {
        notifyVoiceItemDropped(item);
        continue;
      }
      const _upstreamMs = measureVoiceGapMs(item.at, Date.now());
      if (_upstreamMs >= 0) {
        _voiceDiag.lastUpstreamMs = _upstreamMs;
        foldVoiceStageEma(_voiceDiag, "upstreamEmaMs", _upstreamMs);
      }
      _voiceArrivalWindow = foldVoiceArrivalWindow(_voiceArrivalWindow, Date.now(), 1);
      _voiceDiag.arrivalPerMin = _voiceArrivalWindow.arrivalPerMin;
      const candidate = {
        userKey: voiceUserKeyForItem(item),
        name,
        body,
        count: 1,
        enqueuedAt: Date.now(),
        priority: isHighPriority ? "high" : "normal",
        // v0.1.1799: 鳴り始め・鳴り終わり・捨てた時の知らせ(試験の1件ごとの記録用・会場 VoicePlayer と同じ名前)。
        onAudioStart: item.onAudioStart,
        onAudioEnd: item.onAudioEnd,
        onDropped: item.onDropped
      };
      _voiceDiag.voiceEnqueuedTotal = (Number(_voiceDiag.voiceEnqueuedTotal) || 0) + 1;
      const merged = mergeRepeatedVoiceItem(_voiceQueue, candidate);
      _voiceQueue = merged.queue;
      if (merged.merged) {
        notifyVoiceItemDropped(candidate);
        continue;
      }
      const pushed = pushVoiceQueue(
        _voiceQueue,
        candidate,
        { max: 8 }
      );
      _voiceQueue = pushed.queue;
      noteVoicePaceArrival(_voicePaceState, candidate.enqueuedAt);
      droppedCount += pushed.dropped.length;
      for (const d of pushed.dropped) notifyVoiceItemDropped(d);
    }
    if (droppedCount > 0) showVoiceSkipped(droppedCount);
    _voiceDiag.staleDropTotal += droppedCount;
    _voiceDiag.enabled = _voiceReadingEnabled;
    _voiceDiag.queueNow = _voiceQueue.length;
    if (_voiceQueue.length > _voiceDiag.queueMax) _voiceDiag.queueMax = _voiceQueue.length;
    publishVoiceDiag();
    if (_voiceQueue.length) {
      try {
        startVoicePrefetch(_voiceGeneration);
      } catch {
      }
    }
    if (_voiceQueue.length) void drainVoiceQueue();
  }
  async function initializeVoiceReading() {
    if (isObsMode()) return;
    let bag = {};
    try {
      bag = await runStorageOpWithTimeout(
        () => chrome.storage.local.get([
          VOICE_READING_ENABLED_KEY,
          VOICE_ASSIGNMENTS_KEY,
          VOICE_READ_NAME_KEY,
          KEY_VOICE_VOLUME_PERCENT
        ]),
        COMEVIEW_BOOT_READ_TIMEOUT_MS
      );
    } catch {
      bag = {};
    }
    if (!bag || typeof bag !== "object") bag = {};
    _voiceAssignments = normalizeVoiceAssignments(bag[VOICE_ASSIGNMENTS_KEY]);
    _voiceReadNameEnabled = bag[VOICE_READ_NAME_KEY] === true;
    _voiceVolumePercent = normalizeVoiceVolumePercent(bag[KEY_VOICE_VOLUME_PERCENT]);
    updateVoiceToggle();
    let forceVoiceOn = false;
    try {
      forceVoiceOn = new URLSearchParams(window.location.search).get("voice") === "1";
    } catch {
      forceVoiceOn = false;
    }
    if (forceVoiceOn || bag[VOICE_READING_ENABLED_KEY] === true) {
      await enableVoiceReading({ persist: forceVoiceOn });
    }
    wireVoiceTestHook({
      target: "comeview",
      readUrl: true,
      enqueue: (items) => enqueueVoiceTimelineItems(items),
      getDiag: () => _voiceDiag,
      isIdle: () => !_voicePlaying && _voiceQueue.length === 0,
      prepare: () => {
        _voiceQueue = [];
        _voicePrefetches.clear();
      },
      // 開いた時のさかのぼり分を捨てる
      isVoiceOn: () => _voiceReadingEnabled === true && !_voiceToggleBusy,
      ensureEnabled: async () => _voiceReadingEnabled
    });
  }
  function resolveDetailRequestFromUrl() {
    try {
      const sp = new URLSearchParams(window.location.search);
      const uid = String(sp.get("user") || "").trim();
      if (!uid || uid.length > 128) return null;
      let name = String(sp.get("uname") || "").trim();
      if (/^匿名\d{1,3}$/.test(name)) name = "";
      return { userId: uid, name };
    } catch {
      return null;
    }
  }
  var AVATAR_COLORS = ["#0f8fd8", "#ec4899", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444"];
  function avatarColor(seed) {
    let h = 0;
    const s = String(seed || "");
    for (let i = 0; i < s.length; i += 1) h = h * 31 + s.charCodeAt(i) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }
  function initial(name) {
    const s = String(name || "").trim();
    return s ? s.slice(0, 1) : "★";
  }
  function copyTextToClipboard(text) {
    const t = String(text || "");
    if (!t) return;
    try {
      void navigator.clipboard.writeText(t);
      return;
    } catch {
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    } catch {
    }
  }
  function persistNgList() {
    try {
      void chrome.storage.local.set({ [COMEVIEW_NG_STORAGE_KEY]: _ngList });
    } catch {
    }
  }
  function setNgList(next) {
    _ngList = next;
    _ngKeys = new Set(next.map((e) => e.key));
    persistNgList();
    updateNgButton();
    void requestFullRefresh();
  }
  function addNg(row) {
    const { list, added } = addComeviewNgEntry(_ngList, row, Date.now());
    if (!added) return;
    setNgList(list);
  }
  function updateNgButton() {
    const btn = document.getElementById("cvBtnNg");
    if (!btn) return;
    const n = _ngList.length;
    btn.textContent = `NG ${n}`;
    btn.style.display = n > 0 ? "" : "none";
  }
  async function loadNgList() {
    try {
      const bag = await runStorageOpWithTimeout(
        () => chrome.storage.local.get(COMEVIEW_NG_STORAGE_KEY),
        COMEVIEW_BOOT_READ_TIMEOUT_MS
      );
      _ngList = normalizeComeviewNgList(bag?.[COMEVIEW_NG_STORAGE_KEY]);
      _ngKeys = new Set(_ngList.map((e) => e.key));
    } catch {
      _ngList = [];
      _ngKeys = /* @__PURE__ */ new Set();
    }
    updateNgButton();
  }
  function saveUserNotePatch(ukey, patch) {
    if (!ukey) return;
    _userNotes = upsertComeviewUserNote(_userNotes, ukey, patch, Date.now());
    try {
      void chrome.storage.local.set({ [COMEVIEW_USER_NOTES_KEY]: _userNotes });
    } catch {
    }
  }
  function openPanel(title) {
    const panel = document.getElementById("cvPanel");
    const titleEl = document.getElementById("cvPanelTitle");
    const bodyEl = document.getElementById("cvPanelBody");
    if (!panel || !titleEl || !bodyEl) return null;
    titleEl.textContent = title;
    bodyEl.textContent = "";
    panel.style.display = "";
    return bodyEl;
  }
  function closePanel() {
    const panel = document.getElementById("cvPanel");
    if (panel) panel.style.display = "none";
  }
  async function showUserDetail(row) {
    row = mergeComeviewRowWithProfile(row, _profileCache) || row;
    const ukey = comeviewUserKeyForRow(row);
    if (!ukey || !_liveId) return;
    const label = resolveComeviewDisplayName(row, _userNotes, ukey) || row.userId || "この人";
    const bodyEl = openPanel(`👤 ${label}`);
    if (!bodyEl) return;
    const head = document.createElement("div");
    head.className = "cv-detail-head";
    const avatarUrl = resolveComeviewAvatarUrl(row);
    if (avatarUrl) {
      const av = document.createElement("img");
      av.className = "cv-detail-avatar";
      av.src = avatarUrl;
      av.alt = "";
      if (avatarUrl.startsWith("data:image/svg+xml") && row.userId) {
        upgradeAnonymousAvatarImage(av, row.userId, 64);
      }
      av.onerror = () => {
        const fb = document.createElement("div");
        fb.className = "cv-avatar-fallback cv-detail-avatar";
        fb.style.background = avatarColor(row.userId || row.name);
        fb.textContent = initial(label);
        av.replaceWith(fb);
      };
      head.appendChild(av);
    } else {
      const fb = document.createElement("div");
      fb.className = "cv-avatar-fallback cv-detail-avatar";
      fb.style.background = avatarColor(row.userId || row.name);
      fb.textContent = initial(label);
      head.appendChild(fb);
    }
    const headBody = document.createElement("div");
    headBody.className = "cv-detail-head-body";
    const headName = document.createElement("div");
    headName.className = "cv-detail-name";
    headName.textContent = label;
    headBody.appendChild(headName);
    const idLine = document.createElement("div");
    idLine.className = "cv-detail-id";
    const idText = document.createElement("span");
    idText.textContent = row.userId ? `ID: ${row.userId}` : "(名前のみ・ID なし)";
    idLine.appendChild(idText);
    if (row.userId) {
      const cp = document.createElement("button");
      cp.type = "button";
      cp.className = "cv-panel-unng";
      cp.textContent = "コピー";
      cp.addEventListener("click", () => copyTextToClipboard(row.userId));
      idLine.appendChild(cp);
    }
    const pageUrl = comeviewUserPageUrl(row.userId);
    if (pageUrl) {
      const lk = document.createElement("button");
      lk.type = "button";
      lk.className = "cv-panel-unng";
      lk.textContent = "↗ ユーザーページ";
      lk.title = "ニコニコのユーザーページを開く";
      lk.addEventListener("click", () => {
        try {
          void chrome.tabs.create({ url: pageUrl });
        } catch {
          window.open(pageUrl, "_blank", "noopener");
        }
      });
      idLine.appendChild(lk);
    }
    const ngBtn = document.createElement("button");
    ngBtn.type = "button";
    ngBtn.className = "cv-panel-unng";
    ngBtn.textContent = "🚫 非表示";
    ngBtn.title = "この人のコメントをコメビュで非表示にする(ヘッダの NG から解除可)";
    ngBtn.addEventListener("click", () => {
      addNg(row);
      closePanel();
    });
    idLine.appendChild(ngBtn);
    headBody.appendChild(idLine);
    head.appendChild(headBody);
    bodyEl.appendChild(head);
    const note = _userNotes[ukey] || { nickname: "", label: "", memo: "" };
    const form = document.createElement("div");
    form.className = "cv-detail-form";
    const mkField = (caption, placeholder, value, field, multiline) => {
      const wrap = document.createElement("label");
      wrap.className = "cv-detail-field";
      const cap = document.createElement("span");
      cap.textContent = caption;
      wrap.appendChild(cap);
      const input = document.createElement(multiline ? "textarea" : "input");
      if (!multiline) input.type = "text";
      input.value = value;
      input.placeholder = placeholder;
      input.addEventListener(
        "change",
        () => saveUserNotePatch(ukey, { [field]: input.value })
      );
      wrap.appendChild(input);
      form.appendChild(wrap);
    };
    mkField(
      "ニックネーム(あなた用のメモ名・匿名にも付けられます)",
      "例: 常連の柿ピーさん",
      note.nickname,
      "nickname",
      false
    );
    mkField("ラベル", "例: 常連 / 初見", note.label, "label", false);
    mkField("メモ(自分用・画面には出ません)", "", note.memo, "memo", true);
    bodyEl.appendChild(form);
    const loading = document.createElement("div");
    loading.className = "cv-panel-note";
    loading.textContent = "アーカイブから読み込み中…";
    bodyEl.appendChild(loading);
    let rawRows = [];
    try {
      rawRows = await readCanonicalComments(_liveId);
    } catch {
      rawRows = [];
    }
    const { rows, total } = extractUserCommentRows(rawRows, ukey, USER_SPEECH_ROWS_MAX);
    loading.remove();
    const countNote = document.createElement("div");
    countNote.className = "cv-panel-note";
    countNote.textContent = total ? `この配信での発言 全 ${total} 件${total > rows.length ? `(新しい ${rows.length} 件を表示)` : ""}` : buildNoSpeechNote(row);
    bodyEl.appendChild(countNote);
    const frag = document.createDocumentFragment();
    for (const r of rows) {
      const line = document.createElement("div");
      line.className = "cv-panel-row";
      const no = document.createElement("span");
      no.className = "cv-panel-no";
      no.textContent = r.no != null ? `#${r.no}` : "·";
      line.appendChild(no);
      const tx = document.createElement("span");
      tx.className = "cv-panel-text";
      tx.textContent = r.text;
      line.appendChild(tx);
      const tm = document.createElement("span");
      tm.className = "cv-panel-time";
      tm.textContent = formatComeviewTime(r.capturedAt);
      line.appendChild(tm);
      frag.appendChild(line);
    }
    bodyEl.appendChild(frag);
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }
  function showNgPanel() {
    const bodyEl = openPanel("🚫 非表示にした人");
    if (!bodyEl) return;
    if (!_ngList.length) {
      const note = document.createElement("div");
      note.className = "cv-panel-note";
      note.textContent = "非表示中のユーザーはいません";
      bodyEl.appendChild(note);
      return;
    }
    for (const e of [..._ngList].reverse()) {
      const line = document.createElement("div");
      line.className = "cv-panel-row";
      const uid = e.key.startsWith("u:") ? e.key.slice(2) : "";
      const avatarUrl = resolveComeviewAvatarUrl({ avatar: "", userId: uid });
      if (avatarUrl) {
        const av = document.createElement("img");
        av.className = "cv-ng-avatar";
        av.src = avatarUrl;
        av.alt = "";
        if (avatarUrl.startsWith("data:image/svg+xml") && uid) {
          upgradeAnonymousAvatarImage(av, uid, 64);
        }
        av.onerror = () => av.remove();
        line.appendChild(av);
      }
      const nm = document.createElement("span");
      nm.className = "cv-panel-text";
      nm.textContent = e.name || resolveComeviewDisplayName({ userId: uid, name: "" }, {}, "") || e.key;
      line.appendChild(nm);
      if (uid) {
        const idSpan = document.createElement("span");
        idSpan.className = "cv-panel-time";
        idSpan.textContent = uid;
        line.appendChild(idSpan);
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cv-panel-unng";
      btn.textContent = "解除";
      btn.addEventListener("click", () => {
        setNgList(removeComeviewNgEntry(_ngList, e.key));
        line.remove();
      });
      line.appendChild(btn);
      bodyEl.appendChild(line);
    }
  }
  async function readCanonicalComments(lv) {
    let rows = [];
    if (isCommentDbAvailable()) {
      let db = null;
      try {
        db = await openCommentDb();
        const cnt = await countCommentsForLive(db, lv);
        if (cnt > 0) {
          const dbRows = await readAllCommentsForLive(db, lv);
          if (Array.isArray(dbRows) && dbRows.length) rows = dbRows;
        }
      } catch {
      } finally {
        try {
          if (db) db.close();
        } catch {
        }
      }
    }
    if (!rows.length) {
      try {
        const res = await readChunkedComments(
          lv,
          commentsStorageKey(lv),
          (keys) => chrome.storage.local.get(keys)
        );
        rows = Array.isArray(res.rows) ? res.rows : [];
      } catch {
        rows = [];
      }
    }
    try {
      const tKey = tailStorageKey(lv);
      const bag = await chrome.storage.local.get(tKey);
      rows = combineCanonicalComeviewRows(rows, Array.isArray(bag[tKey]) ? bag[tKey] : []);
    } catch {
    }
    return rows;
  }
  function updateCommentCount() {
    const countEl = document.getElementById("cvCount");
    if (countEl) countEl.textContent = `${_commentCount} 件`;
  }
  function buildAllComeviewTimeline(comments, gifts) {
    const commentList = Array.isArray(comments) ? comments : [];
    const giftList = Array.isArray(gifts) ? gifts : [];
    return buildSupportActivityTimeline(commentList, giftList, {
      order: "asc",
      limit: Math.max(TIMELINE_LIMIT, commentList.length + giftList.length)
    });
  }
  function timelineRowHtml(item) {
    return buildTimelineRowHtml(item, {
      defaultAvatar: DEFAULT_TILE_IMG,
      now: Date.now()
    });
  }
  function rememberTimelineElement(element, item, animate) {
    if (!(element instanceof HTMLElement) || !item?.key) return;
    element.dataset.cvKey = item.key;
    if (animate) element.classList.add("cv-row-in");
    _renderedKeys.add(item.key);
    _timelineItemsByKey.set(item.key, item);
  }
  function forgetTimelineElement(element) {
    if (!(element instanceof HTMLElement)) return;
    const key = element.dataset.cvKey || "";
    if (key) {
      _renderedKeys.delete(key);
      _timelineItemsByKey.delete(key);
    }
    if (_hoverRow === element) hideHoverBar();
  }
  function renderFullTimeline(timeline, forceBottom = false) {
    const listEl = document.getElementById("cvList");
    if (!listEl) return;
    const rows = Array.from(listEl.children).filter(
      (element) => element instanceof HTMLElement && element.matches(".nl-tl-row, .nl-tl-gift")
    );
    const domKeys = rows.map((element) => element.dataset.cvKey || "");
    const items = Array.isArray(timeline) ? timeline : [];
    const diff = domKeys.every((k) => k) ? diffComeviewTimeline(domKeys, items) : null;
    if (diff && !diff.reorderNeeded && diff.unchanged) return;
    if (diff && !diff.reorderNeeded && items.length > 0) {
      const wasNearBottomD = forceBottom || isComeviewNearBottom({
        scrollTop: listEl.scrollTop,
        clientHeight: listEl.clientHeight,
        scrollHeight: listEl.scrollHeight
      });
      const bottomGapD = Math.max(
        0,
        listEl.scrollHeight - listEl.clientHeight - listEl.scrollTop
      );
      if (diff.removeKeys.length) {
        const drop = new Set(diff.removeKeys);
        for (const element of rows) {
          if (!drop.has(element.dataset.cvKey || "")) continue;
          forgetTimelineElement(element);
          element.remove();
        }
      }
      if (diff.appendItems.length) {
        const empty = listEl.querySelector(".nl-support-timeline__empty, #cvEmpty");
        if (empty) empty.remove();
        const fragment = document.createDocumentFragment();
        for (const item of diff.appendItems) {
          const template = document.createElement("template");
          template.innerHTML = timelineRowHtml(item).trim();
          const element = template.content.firstElementChild;
          if (!element) continue;
          rememberTimelineElement(element, item, false);
          fragment.appendChild(element);
        }
        listEl.appendChild(fragment);
        upgradeAnonymousAvatarImages(listEl);
      }
      if (wasNearBottomD) {
        listEl.scrollTop = listEl.scrollHeight;
      } else {
        listEl.scrollTop = Math.max(
          0,
          listEl.scrollHeight - listEl.clientHeight - bottomGapD
        );
      }
      return;
    }
    rebuildFullTimeline(listEl, items, forceBottom);
  }
  function rebuildFullTimeline(listEl, timeline, forceBottom) {
    const wasNearBottom = forceBottom || isComeviewNearBottom({
      scrollTop: listEl.scrollTop,
      clientHeight: listEl.clientHeight,
      scrollHeight: listEl.scrollHeight
    });
    const bottomGap = Math.max(
      0,
      listEl.scrollHeight - listEl.clientHeight - listEl.scrollTop
    );
    hideHoverBar();
    _renderedKeys.clear();
    _timelineItemsByKey.clear();
    listEl.innerHTML = timeline.length ? timeline.map((item) => timelineRowHtml(item)).join("") : '<p class="nl-support-timeline__empty">まだコメントもギフトもありません（記録ONで時系列にたまります）</p>';
    const elements = Array.from(listEl.children).filter(
      (element) => element.matches(".nl-tl-row, .nl-tl-gift")
    );
    elements.forEach(
      (element, index) => rememberTimelineElement(element, timeline[index], false)
    );
    upgradeAnonymousAvatarImages(listEl);
    if (wasNearBottom) {
      listEl.scrollTop = listEl.scrollHeight;
    } else {
      listEl.scrollTop = Math.max(
        0,
        listEl.scrollHeight - listEl.clientHeight - bottomGap
      );
    }
  }
  function appendTimelineItems(items) {
    const listEl = document.getElementById("cvList");
    if (!listEl || !items.length) return;
    const shouldFollow = isComeviewNearBottom({
      scrollTop: listEl.scrollTop,
      clientHeight: listEl.clientHeight,
      scrollHeight: listEl.scrollHeight
    });
    const empty = listEl.querySelector(".nl-support-timeline__empty, #cvEmpty");
    if (empty) empty.remove();
    const fragment = document.createDocumentFragment();
    for (const item of items) {
      const template = document.createElement("template");
      template.innerHTML = timelineRowHtml(item).trim();
      const element = template.content.firstElementChild;
      if (!element) continue;
      rememberTimelineElement(element, item, true);
      fragment.appendChild(element);
    }
    listEl.appendChild(fragment);
    upgradeAnonymousAvatarImages(listEl);
    enqueueLiveVoiceItems(items);
    let rows = listEl.querySelectorAll("[data-cv-key]");
    while (rows.length > TIMELINE_LIMIT) {
      const oldest = rows[0];
      forgetTimelineElement(oldest);
      oldest.remove();
      rows = listEl.querySelectorAll("[data-cv-key]");
    }
    if (shouldFollow) listEl.scrollTop = listEl.scrollHeight;
  }
  function normalizePin(raw) {
    if (!raw || typeof raw !== "object") return null;
    const text = String(raw.text || "").trim().slice(0, 500);
    if (!text) return null;
    return {
      name: String(raw.name || "").trim().slice(0, 200),
      text,
      at: Number(raw.at) || 0
    };
  }
  function renderPin(raw) {
    const pinBar = document.getElementById("cvPinBar");
    if (!pinBar) return;
    const pin = normalizePin(raw);
    const sig = pin ? JSON.stringify(pin) : "";
    if (sig === _pinShownSig) return;
    _pinShownSig = sig;
    pinBar.textContent = "";
    if (!pin) {
      pinBar.style.display = "none";
      return;
    }
    const icon = document.createElement("span");
    icon.className = "cv-pin-icon";
    icon.textContent = "📌";
    pinBar.appendChild(icon);
    const body = document.createElement("div");
    body.className = "cv-pin-body";
    if (pin.name) {
      const name = document.createElement("span");
      name.className = "cv-pin-name";
      name.textContent = pin.name;
      body.appendChild(name);
    }
    const text = document.createElement("span");
    text.className = "cv-pin-text";
    text.textContent = pin.text;
    body.appendChild(text);
    pinBar.appendChild(body);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "cv-pin-close";
    close.textContent = "✕";
    close.title = "コメピタを解除";
    close.addEventListener("click", () => {
      if (!_liveId) return;
      renderPin(null);
      try {
        void chrome.storage.local.remove(comeviewPinStorageKey(_liveId));
      } catch {
      }
    });
    pinBar.appendChild(close);
    pinBar.style.display = "";
  }
  function savePin(row) {
    if (!_liveId) return;
    const pin = normalizePin({
      name: row.name,
      text: row.text,
      at: Date.now()
    });
    if (!pin) return;
    renderPin(pin);
    try {
      void chrome.storage.local.set({
        [comeviewPinStorageKey(_liveId)]: pin
      });
    } catch {
    }
  }
  async function performFullRefresh(forceBottom) {
    if (!_liveId) return;
    const lv = _liveId;
    const tKey = tailStorageKey(lv);
    const giftKey = `nls_gift_events_${lv}`;
    const pinKey = comeviewPinStorageKey(lv);
    let bag = {};
    try {
      bag = await runStorageOpWithTimeout(
        () => chrome.storage.local.get([
          tKey,
          giftKey,
          pinKey,
          COMEVIEW_USER_NOTES_KEY,
          KEY_USER_COMMENT_PROFILE_CACHE
        ]),
        FULL_REFRESH_STORAGE_TIMEOUT_MS
      );
    } catch {
      return;
    }
    _tailRows = Array.isArray(bag[tKey]) ? bag[tKey] : [];
    _giftRows = Array.isArray(bag[giftKey]) ? bag[giftKey] : [];
    _userNotes = normalizeComeviewUserNotes(bag[COMEVIEW_USER_NOTES_KEY]);
    _profileCache = normalizeUserCommentProfileMap(bag[KEY_USER_COMMENT_PROFILE_CACHE]);
    renderPin(bag[pinKey]);
    let comments = [];
    try {
      comments = await runStorageOpWithTimeout(
        () => readCanonicalComments(lv),
        FULL_REFRESH_STORAGE_TIMEOUT_MS
      );
    } catch {
      comments = [];
    }
    comments = combineCanonicalComeviewRows(comments, _tailRows);
    if (Object.keys(_profileCache).length) {
      comments = applyUserCommentProfileMapToEntries(comments, _profileCache).next;
    }
    const timeline = keepLatestComeviewTimelineItems(
      filterVisibleComeviewTimeline(
        buildAllComeviewTimeline(comments, _giftRows),
        _ngKeys,
        _hiddenSigs
      ),
      TIMELINE_LIMIT
    );
    _commentCount = comments.length;
    const refreshVoiceItems = _initialVoicesPrimed ? pickRefreshVoiceItems(timeline, _seenCommentNos, Date.now(), VOICE_STALE_MS_NORMAL) : [];
    renderFullTimeline(timeline, forceBottom);
    for (const item of timeline) {
      if (item.kind === "gift") continue;
      rememberSeenCommentNo(commentNoOfComeviewRow(item));
    }
    if (refreshVoiceItems.length) {
      _voiceDiag.refreshVoicedTotal = (Number(_voiceDiag.refreshVoicedTotal) || 0) + refreshVoiceItems.length;
      enqueueLiveVoiceItems(refreshVoiceItems);
    }
    if (!_initialVoicesPrimed) {
      _initialVoicesPrimed = true;
      if (timeline.length > 0) {
        const primes = timeline.slice(Math.max(0, timeline.length - 3));
        enqueueLiveVoiceItems(primes);
      }
    }
    pickUnseenComeviewGifts(_giftRows, _seenGiftAtBySig);
    trimSeenGiftSigs();
    updateCommentCount();
    _lastReconcileAt = Date.now();
  }
  function requestFullRefresh(forceBottom = false) {
    _fullRefreshRequested = true;
    _fullRefreshForceBottom ||= forceBottom;
    if (_fullRefreshPromise) return _fullRefreshPromise;
    _fullRefreshPromise = (async () => {
      while (_fullRefreshRequested) {
        const nextForceBottom = _fullRefreshForceBottom;
        _fullRefreshRequested = false;
        _fullRefreshForceBottom = false;
        _fullRefreshRunning = true;
        try {
          await performFullRefresh(nextForceBottom);
        } finally {
          _fullRefreshRunning = false;
        }
        await flushDeferredHotSnapshots();
      }
    })().finally(() => {
      _fullRefreshPromise = null;
    });
    return _fullRefreshPromise;
  }
  function processHotSnapshots(nextTail, nextGifts) {
    const tail = Array.isArray(nextTail) ? nextTail : [];
    const gifts = Array.isArray(nextGifts) ? nextGifts : [];
    if (_paused || document.hidden || _fullRefreshRunning) {
      _deferredTailRows = tail;
      _deferredGiftRows = gifts;
      return;
    }
    const addedComments = filterUnseenComeviewComments(
      pickAppendedComeviewSnapshotRows(_tailRows, tail, "comment"),
      _seenCommentNos
    );
    const addedGifts = pickUnseenComeviewGifts(
      pickAppendedComeviewSnapshotRows(_giftRows, gifts, "gift"),
      _seenGiftAtBySig
    );
    trimSeenGiftSigs();
    _tailRows = tail;
    _giftRows = gifts;
    if (!addedComments.length && !addedGifts.length) return;
    for (const row of addedComments) rememberSeenCommentNo(commentNoOfComeviewRow(row));
    let profiledTail = tail;
    if (Object.keys(_profileCache).length) {
      profiledTail = applyUserCommentProfileMapToEntries(tail, _profileCache).next;
    }
    const appended = selectAppendedComeviewTimelineItems(
      buildAllComeviewTimeline(profiledTail, gifts),
      addedComments,
      addedGifts
    );
    const unseen = pickNewComeviewTimelineItems(appended, _renderedKeys);
    _commentCount += unseen.filter((item) => item.kind === "comment").length;
    appendTimelineItems(
      filterVisibleComeviewTimeline(unseen, _ngKeys, _hiddenSigs)
    );
    updateCommentCount();
  }
  async function flushDeferredHotSnapshots() {
    if (!_deferredTailRows && !_deferredGiftRows) return;
    const tail = _deferredTailRows || _tailRows;
    const gifts = _deferredGiftRows || _giftRows;
    _deferredTailRows = null;
    _deferredGiftRows = null;
    processHotSnapshots(tail, gifts);
  }
  async function pollHotSnapshots() {
    if (_paused || document.hidden || !_liveId || _fullRefreshRunning) return;
    const tKey = tailStorageKey(_liveId);
    const giftKey = `nls_gift_events_${_liveId}`;
    try {
      const bag = await chrome.storage.local.get([tKey, giftKey]);
      processHotSnapshots(
        Array.isArray(bag[tKey]) ? bag[tKey] : [],
        Array.isArray(bag[giftKey]) ? bag[giftKey] : []
      );
    } catch {
    }
  }
  async function timerTick() {
    if (_paused || document.hidden) return;
    if (Date.now() - _lastReconcileAt >= RECONCILE_INTERVAL_MS) {
      await requestFullRefresh();
      return;
    }
    await pollHotSnapshots();
  }
  function startTimer() {
    if (_timer != null) return;
    _timer = window.setInterval(() => void timerTick(), HOT_POLL_INTERVAL_MS);
  }
  function stopTimer() {
    if (_timer != null) {
      clearInterval(_timer);
      _timer = null;
    }
  }
  function hideHoverBar() {
    if (_hoverBar) {
      _hoverBar.classList.remove("is-visible");
      _hoverBar.style.display = "none";
    }
    _hoverRow = null;
  }
  function actionDataForTimelineRow(element, item) {
    const name = element.querySelector(".nl-tl-row__name, .nl-tl-gift__name")?.textContent?.trim() || String(item?.nickname || "").trim();
    const userId = element.getAttribute("data-nl-uid") || String(item?.userId || "").trim();
    let text = "";
    if (item?.kind === "gift") {
      const itemName = String(item.itemName || "ギフト").trim();
      const point = Number(item.point) || 0;
      text = point > 0 ? `${itemName}（${point.toLocaleString("ja-JP")}pt）` : itemName;
    } else {
      text = element.querySelector(".nl-tl-row__text")?.textContent?.trim() || String(item?.text || "").trim();
    }
    return {
      id: String(item?.key || ""),
      no: item?.kind === "comment" ? item.commentNo : null,
      name,
      text,
      userId,
      avatar: String(item?.avatarUrl || ""),
      selfPosted: item?.selfPosted === true,
      capturedAt: Number(item?.at) || null
    };
  }
  function positionHoverBar() {
    if (!_hoverBar || !_hoverRow || !_hoverRow.isConnected) {
      hideHoverBar();
      return;
    }
    const rect = _hoverRow.getBoundingClientRect();
    const width = _hoverBar.offsetWidth;
    const height = _hoverBar.offsetHeight;
    const left = Math.max(4, Math.min(window.innerWidth - width - 4, rect.right - width - 4));
    const top = Math.max(4, Math.min(window.innerHeight - height - 4, rect.top + 2));
    _hoverBar.style.left = `${left}px`;
    _hoverBar.style.top = `${top}px`;
  }
  function showHoverBar(row) {
    if (isObsMode() || !_hoverBar || !(row instanceof HTMLElement)) return;
    const key = row.dataset.cvKey || "";
    const item = _timelineItemsByKey.get(key);
    if (!item) return;
    _hoverRow = row;
    const userId = String(item.userId || "").trim();
    for (const button of _hoverBar.querySelectorAll("button[data-cv-action]")) {
      const action = button.dataset.cvAction;
      button.disabled = (action === "block" || action === "person") && !userId;
    }
    _hoverBar.style.display = "flex";
    _hoverBar.classList.add("is-visible");
    positionHoverBar();
  }
  function createHoverBar() {
    if (isObsMode() || _hoverBar) return;
    const bar = document.createElement("div");
    bar.className = "cv-hover-actions";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "コメント操作");
    const actions = [
      ["trash", "この行を隠す"],
      ["block", "この人を非表示"],
      ["person", "この人の詳細"],
      ["copy", "名前と本文をコピー"],
      ["pin", "コメピタ"]
    ];
    for (const [action, label] of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.cvAction = action;
      button.title = label;
      button.setAttribute("aria-label", label);
      button.innerHTML = CV_ACTION_ICONS[action];
      bar.appendChild(button);
    }
    bar.addEventListener("mouseenter", () => {
      if (_hoverRow) bar.classList.add("is-visible");
    });
    bar.addEventListener("mouseleave", (event) => {
      if (_hoverRow && event.relatedTarget instanceof Node && _hoverRow.contains(event.relatedTarget)) {
        return;
      }
      hideHoverBar();
    });
    bar.addEventListener("click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("button[data-cv-action]") : null;
      if (!button || button.disabled || !_hoverRow) return;
      event.preventDefault();
      event.stopPropagation();
      const key = _hoverRow.dataset.cvKey || "";
      const item = _timelineItemsByKey.get(key);
      if (!item) return;
      const row = actionDataForTimelineRow(_hoverRow, item);
      switch (button.dataset.cvAction) {
        case "trash": {
          const sig = comeviewTimelineItemSignature(item);
          if (sig) _hiddenSigs.add(sig);
          const target = _hoverRow;
          forgetTimelineElement(target);
          target.remove();
          hideHoverBar();
          break;
        }
        case "block":
          addNg(row);
          hideHoverBar();
          break;
        case "person":
          void showUserDetail(row);
          hideHoverBar();
          break;
        case "copy":
          copyTextToClipboard(buildComeviewCopyText(row));
          hideHoverBar();
          break;
        case "pin":
          savePin(row);
          hideHoverBar();
          break;
        default:
          break;
      }
    });
    document.body.appendChild(bar);
    _hoverBar = bar;
  }
  function wireStorageChanges() {
    if (_storageChangesWired) return;
    _storageChangesWired = true;
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      const tKey = _liveId ? tailStorageKey(_liveId) : "";
      const giftKey = _liveId ? `nls_gift_events_${_liveId}` : "";
      const pinKey = _liveId ? comeviewPinStorageKey(_liveId) : "";
      if (!_explicitLiveId && changes[KEY_LAST_WATCH_URL]) {
        const url = String(changes[KEY_LAST_WATCH_URL].newValue || "");
        const m = url.toLowerCase().match(/lv\d{1,15}/);
        if (m && m[0] !== _liveId) void switchToLiveId(m[0]);
      }
      if (pinKey && changes[pinKey]) renderPin(changes[pinKey].newValue);
      if (changes[COMEVIEW_USER_NOTES_KEY]) {
        _userNotes = normalizeComeviewUserNotes(
          changes[COMEVIEW_USER_NOTES_KEY].newValue
        );
      }
      if (changes[KEY_USER_COMMENT_PROFILE_CACHE]) {
        _profileCache = normalizeUserCommentProfileMap(
          changes[KEY_USER_COMMENT_PROFILE_CACHE].newValue
        );
      }
      if (changes[COMEVIEW_NG_STORAGE_KEY]) {
        const next = normalizeComeviewNgList(
          changes[COMEVIEW_NG_STORAGE_KEY].newValue
        );
        if (JSON.stringify(next) !== JSON.stringify(_ngList)) {
          _ngList = next;
          _ngKeys = new Set(next.map((entry) => entry.key));
          updateNgButton();
          void requestFullRefresh();
        }
      }
      if (changes[KEY_VOICE_VOLUME_PERCENT]) {
        _voiceVolumePercent = normalizeVoiceVolumePercent(changes[KEY_VOICE_VOLUME_PERCENT].newValue);
      }
      if (!isObsMode() && changes[VOICE_ASSIGNMENTS_KEY]) {
        _voiceAssignments = normalizeVoiceAssignments(
          changes[VOICE_ASSIGNMENTS_KEY].newValue
        );
      }
      if (!isObsMode() && changes[VOICE_READING_ENABLED_KEY]) {
        const nextEnabled = changes[VOICE_READING_ENABLED_KEY].newValue === true;
        if (!nextEnabled && _voiceReadingEnabled) {
          disableVoiceReading({ persist: false });
          setVoiceStatus("");
        } else if (nextEnabled && !_voiceReadingEnabled && !_voiceToggleBusy) {
          void enableVoiceReading({ persist: false });
        }
      }
      if (tKey && changes[tKey] || giftKey && changes[giftKey]) {
        processHotSnapshots(
          changes[tKey] ? Array.isArray(changes[tKey].newValue) ? changes[tKey].newValue : [] : _tailRows,
          changes[giftKey] ? Array.isArray(changes[giftKey].newValue) ? changes[giftKey].newValue : [] : _giftRows
        );
      }
    });
  }
  function wireButtons() {
    const btnVoice = document.getElementById("cvBtnVoice");
    if (btnVoice && !isObsMode()) {
      btnVoice.addEventListener("click", () => {
        if (_voiceReadingEnabled) {
          disableVoiceReading();
          setVoiceStatus("");
        } else {
          void enableVoiceReading();
        }
      });
    }
    const btnVoiceName = document.getElementById("cvBtnVoiceName");
    if (btnVoiceName && !isObsMode()) {
      btnVoiceName.addEventListener("click", () => {
        _voiceReadNameEnabled = !_voiceReadNameEnabled;
        updateVoiceToggle();
        try {
          void chrome.storage.local.set({ [VOICE_READ_NAME_KEY]: _voiceReadNameEnabled });
        } catch {
        }
      });
    }
    const openComeviewWindow = async (url) => {
      let saved = null;
      try {
        const bag = await chrome.storage.local.get(KEY_COMEVIEW_WINDOW_GEOMETRY);
        saved = bag?.[KEY_COMEVIEW_WINDOW_GEOMETRY] ?? null;
      } catch {
      }
      const opts = buildComeviewWindowOptions(url, saved);
      try {
        chrome.windows.create(opts);
      } catch {
        window.open(url, "_blank", `width=${opts.width},height=${opts.height}`);
      }
    };
    const btnWin = document.getElementById("cvBtnWindow");
    if (btnWin) {
      btnWin.addEventListener("click", () => {
        void openComeviewWindow(
          chrome.runtime.getURL(`comeview.html?lv=${encodeURIComponent(_liveId)}`)
        );
      });
    }
    const btnObs = document.getElementById("cvBtnObs");
    if (btnObs) {
      btnObs.addEventListener("click", () => {
        void openComeviewWindow(
          chrome.runtime.getURL(`comeview.html?lv=${encodeURIComponent(_liveId)}&obs=1`)
        );
      });
    }
    const btnPause = document.getElementById("cvBtnPause");
    if (btnPause) {
      btnPause.addEventListener("click", () => {
        _paused = !_paused;
        btnPause.textContent = _paused ? "再開" : "一時停止";
        if (!_paused) {
          if (Date.now() - _lastReconcileAt >= RECONCILE_INTERVAL_MS) {
            void requestFullRefresh();
          } else {
            void flushDeferredHotSnapshots();
            void pollHotSnapshots();
          }
        }
      });
    }
    const btnNg = document.getElementById("cvBtnNg");
    if (btnNg) btnNg.addEventListener("click", () => showNgPanel());
    const btnPanelClose = document.getElementById("cvPanelClose");
    if (btnPanelClose) btnPanelClose.addEventListener("click", () => closePanel());
    const listEl = document.getElementById("cvList");
    if (listEl) {
      listEl.addEventListener("mouseover", (event) => {
        const row = event.target instanceof Element ? event.target.closest(".nl-tl-row, .nl-tl-gift") : null;
        if (row && listEl.contains(row)) showHoverBar(row);
      });
      listEl.addEventListener("mouseleave", (event) => {
        if (_hoverBar && event.relatedTarget instanceof Node && _hoverBar.contains(event.relatedTarget)) {
          return;
        }
        hideHoverBar();
      });
      listEl.addEventListener("scroll", () => hideHoverBar(), { passive: true });
      listEl.addEventListener("click", (ev) => {
        const t = ev.target instanceof Element ? ev.target.closest("[data-nl-uid]") : null;
        if (!t) return;
        ev.preventDefault();
        const uid = t.getAttribute("data-nl-uid") || "";
        if (!uid) return;
        const key = t instanceof HTMLElement ? t.dataset.cvKey || "" : "";
        const item = _timelineItemsByKey.get(key);
        if (item) {
          void showUserDetail(actionDataForTimelineRow(t, item));
          return;
        }
        let uname = t.getAttribute("data-nl-uname") || "";
        if (/^匿名\d{1,3}$/.test(uname)) uname = "";
        void showUserDetail({ name: uname, text: "", userId: uid });
      });
    }
    createHoverBar();
    window.addEventListener("resize", () => hideHoverBar(), { passive: true });
    let _geometrySaveTimer = 0;
    const saveWindowGeometry = () => {
      const next = pickComeviewGeometryToSave({
        width: window.outerWidth,
        height: window.outerHeight,
        left: window.screenX,
        top: window.screenY
      });
      if (!next) return;
      try {
        void chrome.storage.local.set({ [KEY_COMEVIEW_WINDOW_GEOMETRY]: next });
      } catch {
      }
    };
    window.addEventListener(
      "resize",
      () => {
        if (_geometrySaveTimer) window.clearTimeout(_geometrySaveTimer);
        _geometrySaveTimer = window.setTimeout(saveWindowGeometry, 500);
      },
      { passive: true }
    );
    window.addEventListener("pagehide", saveWindowGeometry);
  }
  async function main() {
    if (isObsMode()) document.body.classList.add("is-obs");
    const urlLiveId = resolveLiveIdFromUrl();
    _explicitLiveId = !!urlLiveId;
    wireButtons();
    wireStorageChanges();
    _liveId = urlLiveId || await resolveLiveIdFromStorage();
    const meta = document.getElementById("cvLiveMeta");
    if (meta) {
      meta.textContent = _liveId ? _liveId : "配信を探しています…";
    }
    void initializeVoiceReading();
    void loadNgList();
    await requestFullRefresh(true);
    const detailReq = resolveDetailRequestFromUrl();
    if (detailReq) {
      void showUserDetail({
        id: "",
        no: null,
        name: detailReq.name,
        text: "",
        userId: detailReq.userId,
        avatar: "",
        selfPosted: false,
        capturedAt: null
      });
    }
    startTimer();
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopTimer();
      else {
        startTimer();
        if (Date.now() - _lastReconcileAt >= RECONCILE_INTERVAL_MS) {
          void requestFullRefresh();
        } else {
          void flushDeferredHotSnapshots();
          void pollHotSnapshots();
        }
      }
    });
  }
  void main();
})();
