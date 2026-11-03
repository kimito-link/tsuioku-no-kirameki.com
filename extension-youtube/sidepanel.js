// sidepanel.js — YouTube Live 3レーン・通貨別応援者ランキング・読み上げ設定の表示バンドル
/* eslint-disable */
(() => {
  // src/lib/htmlText.js
  function safeHttpUrl(v) {
    const s = String(v == null ? "" : v).trim();
    return /^https?:\/\//i.test(s) ? s : "";
  }
  function formatNumberJa(n) {
    const v = Number(n);
    return (Number.isFinite(v) ? v : 0).toLocaleString("ja-JP");
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

  // src/lib/youtube/ytSupportRanking.js
  var ZERO_DECIMAL_CURRENCIES = /* @__PURE__ */ new Set(["JPY", "KRW", "TWD", "VND"]);
  function buildYtChannelUrl(channelId) {
    const id = String(channelId || "").trim();
    if (/^UC[A-Za-z0-9_-]{16,32}$/.test(id)) {
      return `https://www.youtube.com/channel/${id}`;
    }
    if (id.startsWith("handle:@")) {
      const handle = id.slice("handle:".length);
      if (/^@[A-Za-z0-9_.-]+$/.test(handle)) {
        return `https://www.youtube.com/${handle}`;
      }
    }
    if (/^@[A-Za-z0-9_.-]+$/.test(id)) {
      return `https://www.youtube.com/${id}`;
    }
    return "";
  }
  function formatYtCurrencyAmount(amount, currency) {
    const code = String(currency || "").trim().toUpperCase();
    const n = Number(amount);
    if (!Number.isFinite(n)) return "—";
    if (code === "JPY") {
      return `¥${formatNumberJa(Math.round(n))}`;
    }
    if (code === "KRW") {
      return `₩${formatNumberJa(Math.round(n))}`;
    }
    if (ZERO_DECIMAL_CURRENCIES.has(code)) {
      return `${code} ${formatNumberJa(Math.round(n))}`;
    }
    const fixed = (Math.round(n * 100) / 100).toFixed(2);
    return code ? `${code} ${fixed}` : fixed;
  }
  function createYtSupportRankingAccumulator() {
    const totalsByCurrency = {};
    const currencyUserMap = {};
    const supporterMap = /* @__PURE__ */ new Map();
    const supporterChannelIds = /* @__PURE__ */ new Set();
    const counts = {
      superchat: 0,
      sticker: 0,
      membership: 0,
      membershipGift: 0
    };
    const byCurrency = {};
    const supporters = [];
    return {
      totalsByCurrency,
      currencyUserMap,
      supporterMap,
      supporterChannelIds,
      counts,
      snapshot: {
        totalsByCurrency,
        byCurrency,
        counts,
        supporters,
        supporterChannelIds
      }
    };
  }
  function applyYtSupportRankingDelta(accumulator, newItems) {
    const acc = accumulator || createYtSupportRankingAccumulator();
    let rankingChanged = false;
    let supporterSetChanged = false;
    const touchedCurrencies = /* @__PURE__ */ new Set();
    if (!Array.isArray(newItems) || newItems.length === 0) {
      return {
        accumulator: acc,
        snapshot: acc.snapshot,
        rankingChanged: false,
        supporterSetChanged: false
      };
    }
    for (const item of newItems) {
      if (!item || typeof item !== "object") continue;
      const kind = String(item.kind || "");
      const isSupportKind = kind === "superchat" || kind === "sticker" || kind === "membership" || kind === "membership_gift";
      const badges = Array.isArray(item.badges) ? item.badges : [];
      const isMemberBadge = badges.includes("member");
      const channelId = String(item.channelId || item.name || "").trim();
      if (channelId && (isSupportKind || isMemberBadge)) {
        if (!acc.supporterChannelIds.has(channelId)) {
          acc.supporterChannelIds.add(channelId);
          supporterSetChanged = true;
        }
      }
      if (!isSupportKind || !channelId) continue;
      rankingChanged = true;
      if (kind === "superchat") acc.counts.superchat += 1;
      else if (kind === "sticker") acc.counts.sticker += 1;
      else if (kind === "membership") acc.counts.membership += 1;
      else if (kind === "membership_gift") acc.counts.membershipGift += 1;
      const name = String(item.name || channelId).trim();
      const iconUrl = safeHttpUrl(item.iconUrl || "");
      const channelUrl = buildYtChannelUrl(channelId);
      const ts = Number.isFinite(Number(item.ts)) ? Number(item.ts) : 0;
      let sup = acc.supporterMap.get(channelId);
      if (!sup) {
        sup = {
          channelId,
          name,
          iconUrl,
          channelUrl,
          amountsByCurrency: {},
          superchatCount: 0,
          stickerCount: 0,
          membershipCount: 0,
          giftCount: 0,
          lastTs: ts
        };
        acc.supporterMap.set(channelId, sup);
      } else {
        if (name && (!sup.name || sup.name === sup.channelId)) sup.name = name;
        if (iconUrl && !sup.iconUrl) sup.iconUrl = iconUrl;
        if (ts > sup.lastTs) sup.lastTs = ts;
      }
      if (kind === "superchat") sup.superchatCount += 1;
      else if (kind === "sticker") sup.stickerCount += 1;
      else if (kind === "membership") sup.membershipCount += 1;
      else if (kind === "membership_gift") sup.giftCount += 1;
      const amount = Number(item.amount || 0);
      const currency = String(item.currency || "").trim().toUpperCase();
      if ((kind === "superchat" || kind === "sticker") && Number.isFinite(amount) && amount > 0 && currency) {
        acc.totalsByCurrency[currency] = Math.round(((acc.totalsByCurrency[currency] || 0) + amount) * 100) / 100;
        sup.amountsByCurrency[currency] = Math.round(((sup.amountsByCurrency[currency] || 0) + amount) * 100) / 100;
        if (!acc.currencyUserMap[currency]) {
          acc.currencyUserMap[currency] = /* @__PURE__ */ new Map();
        }
        const cMap = acc.currencyUserMap[currency];
        let cEntry = cMap.get(channelId);
        if (!cEntry) {
          cEntry = {
            channelId,
            name,
            iconUrl,
            channelUrl,
            amount: 0,
            currency,
            count: 0,
            lastTs: ts
          };
          cMap.set(channelId, cEntry);
        }
        cEntry.amount = Math.round((cEntry.amount + amount) * 100) / 100;
        cEntry.count += 1;
        if (name && (!cEntry.name || cEntry.name === cEntry.channelId)) cEntry.name = name;
        if (iconUrl && !cEntry.iconUrl) cEntry.iconUrl = iconUrl;
        if (ts > cEntry.lastTs) cEntry.lastTs = ts;
        touchedCurrencies.add(currency);
      }
    }
    if (rankingChanged) {
      for (const currency of touchedCurrencies) {
        const cMap = acc.currencyUserMap[currency];
        if (!cMap) continue;
        const sorted = Array.from(cMap.values()).sort((a, b) => {
          if (b.amount !== a.amount) return b.amount - a.amount;
          if (b.count !== a.count) return b.count - a.count;
          return b.lastTs - a.lastTs;
        });
        acc.snapshot.byCurrency[currency] = sorted.map((entry, idx) => ({
          rank: idx + 1,
          ...entry,
          formattedAmount: formatYtCurrencyAmount(entry.amount, currency)
        }));
      }
      acc.snapshot.supporters = Array.from(acc.supporterMap.values()).sort((a, b) => {
        const aPaid = a.superchatCount + a.stickerCount;
        const bPaid = b.superchatCount + b.stickerCount;
        if (bPaid !== aPaid) return bPaid - aPaid;
        if (b.giftCount !== a.giftCount) return b.giftCount - a.giftCount;
        if (b.membershipCount !== a.membershipCount) return b.membershipCount - a.membershipCount;
        return b.lastTs - a.lastTs;
      });
    }
    return {
      accumulator: acc,
      snapshot: acc.snapshot,
      rankingChanged,
      supporterSetChanged
    };
  }

  // src/lib/voiceAssignment.js
  var DEFAULT_VOICE = Object.freeze({
    styleId: 3,
    pitchOffset: 0,
    speedOffset: 0
  });
  var PITCH_OFFSETS = Object.freeze([-0.06, -0.03, 0, 0.03, 0.06]);
  var SPEED_OFFSETS = Object.freeze([0, 0.05, 0.1]);

  // src/lib/voiceNarrowing.js
  var VOICE_NARROW_STYLE_IDS = Object.freeze([3, 2, 8, 10, 13, 14]);
  var VOICE_CAPPED_STYLE_IDS = Object.freeze([3, 2, 8, 10, 13, 14, 11, 21, 20, 46, 0, 4, 6, 1, 7, 5, 81, 82, 83, 84, 85, 66, 77, 78, 79, 80]);
  var VOICE_NARROW_MODES = Object.freeze(["off", "auto", "on"]);

  // src/lib/youtube/ytVoiceQueue.js
  var YT_VOICE_MODES = Object.freeze({
    ALL: "all",
    SELECT: "select"
  });
  var YT_DEFAULT_STYLE_IDS = VOICE_CAPPED_STYLE_IDS;

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
  function assignYtCommentLane(item, opts = {}) {
    if (!item || typeof item !== "object") {
      return YT_LANES.TANUNEE;
    }
    const badges = Array.isArray(item.badges) ? item.badges.map((b) => String(b || "").toLowerCase()) : [];
    const kind = String(item.kind || "text").toLowerCase();
    const channelId = String(item.channelId || "");
    const broadcasterChannelId = String(opts.broadcasterChannelId || "");
    const supporterSet = opts.supporterChannelIds instanceof Set ? opts.supporterChannelIds : Array.isArray(opts.supporterChannelIds) ? new Set(opts.supporterChannelIds) : null;
    for (const rule of YT_LANE_RULES) {
      if (rule.isDefault) {
        return (
          /** @type {'rinku' | 'konta' | 'tanunee'} */
          rule.lane
        );
      }
      if (rule.lane === YT_LANES.RINKU && broadcasterChannelId && channelId && channelId === broadcasterChannelId) {
        return YT_LANES.RINKU;
      }
      if (rule.badges.some((b) => badges.includes(b))) {
        return (
          /** @type {'rinku' | 'konta' | 'tanunee'} */
          rule.lane
        );
      }
      if (rule.kinds.includes(kind)) {
        return (
          /** @type {'rinku' | 'konta' | 'tanunee'} */
          rule.lane
        );
      }
      if (rule.includeSupporterChannels && channelId && supporterSet && supporterSet.has(channelId)) {
        return (
          /** @type {'rinku' | 'konta' | 'tanunee'} */
          rule.lane
        );
      }
    }
    return YT_LANES.TANUNEE;
  }

  // src/lib/youtube/ytStreamStorePolicy.js
  var YT_SIDE_PANEL_DISPLAY_LIMIT = 150;
  function buildYtCommentPrimaryKey(videoId, commentId) {
    const v = String(videoId || "").trim();
    const c = String(commentId || "").trim();
    if (!v || !c) return "";
    return `${v}::${c}`;
  }
  function createYtStreamIncrementalState(videoId, opts = {}) {
    const displayLimit = typeof opts.displayLimit === "number" && opts.displayLimit > 0 ? Math.floor(opts.displayLimit) : YT_SIDE_PANEL_DISPLAY_LIMIT;
    return {
      videoId: String(videoId || "").trim(),
      broadcasterChannelId: String(opts.broadcasterChannelId || "").trim(),
      displayLimit,
      totalCount: 0,
      lastRecordedAt: 0,
      /** @type {Set<string>} */
      seenPks: /* @__PURE__ */ new Set(),
      laneCounts: {
        rinku: 0,
        konta: 0,
        tanunee: 0
      },
      /** @type {{ rinku: any[], konta: any[], tanunee: any[] }} */
      laneDisplay: {
        rinku: [],
        konta: [],
        tanunee: []
      },
      rankingAcc: createYtSupportRankingAccumulator()
    };
  }
  function applyYtStreamIncrementalItems(state, incomingItems, opts = {}) {
    if (opts.broadcasterChannelId) {
      state.broadcasterChannelId = String(opts.broadcasterChannelId).trim();
    }
    const addedByLane = {
      rinku: [],
      konta: [],
      tanunee: []
    };
    if (!Array.isArray(incomingItems) || incomingItems.length === 0) {
      return {
        addedCount: 0,
        addedByLane,
        rankingChanged: false,
        supporterSetChanged: false,
        ranking: state.rankingAcc.snapshot,
        laneCounts: state.laneCounts,
        laneDisplay: state.laneDisplay,
        totalCount: state.totalCount
      };
    }
    const unseen = [];
    for (let i = 0; i < incomingItems.length; i += 1) {
      const item = incomingItems[i];
      if (!item || typeof item !== "object") continue;
      const pk = String(item.pk || "").trim() || buildYtCommentPrimaryKey(state.videoId || item.videoId, item.id);
      if (!pk || state.seenPks.has(pk)) continue;
      state.seenPks.add(pk);
      unseen.push(item);
      const recAt = Number(item.recordedAt || 0);
      if (Number.isFinite(recAt) && recAt > state.lastRecordedAt) {
        state.lastRecordedAt = recAt;
      }
    }
    if (unseen.length === 0) {
      return {
        addedCount: 0,
        addedByLane,
        rankingChanged: false,
        supporterSetChanged: false,
        ranking: state.rankingAcc.snapshot,
        laneCounts: state.laneCounts,
        laneDisplay: state.laneDisplay,
        totalCount: state.totalCount
      };
    }
    state.totalCount += unseen.length;
    const rankRes = applyYtSupportRankingDelta(state.rankingAcc, unseen);
    for (let i = 0; i < unseen.length; i += 1) {
      const item = unseen[i];
      const lane = assignYtCommentLane(item, {
        broadcasterChannelId: state.broadcasterChannelId,
        supporterChannelIds: state.rankingAcc.supporterChannelIds
      });
      state.laneCounts[lane] += 1;
      addedByLane[lane].push(item);
    }
    const limit = state.displayLimit || YT_SIDE_PANEL_DISPLAY_LIMIT;
    for (
      const lane of
      /** @type {const} */
      ["rinku", "konta", "tanunee"]
    ) {
      const added = addedByLane[lane];
      if (added.length === 0) continue;
      const addedNewestFirst = added.slice().reverse();
      if (addedNewestFirst.length >= limit) {
        state.laneDisplay[lane] = addedNewestFirst.slice(0, limit);
      } else {
        const merged = addedNewestFirst.concat(state.laneDisplay[lane]);
        if (merged.length > limit) {
          merged.length = limit;
        }
        state.laneDisplay[lane] = merged;
      }
    }
    return {
      addedCount: unseen.length,
      addedByLane,
      rankingChanged: rankRes.rankingChanged,
      supporterSetChanged: rankRes.supporterSetChanged,
      ranking: rankRes.snapshot,
      laneCounts: state.laneCounts,
      laneDisplay: state.laneDisplay,
      totalCount: state.totalCount
    };
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
        req.onsuccess = () => resolve(req.result);
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

  // extension-youtube/src/sidepanel-entry.js
  var STORAGE_KEYS = Object.freeze({
    STREAM_SUMMARIES: "yt_stream_summaries",
    ACTIVE_VIDEO_ID: "yt_active_video_id",
    VOICE_SETTINGS: "yt_voice_settings",
    VOICE_ASSIGNMENTS: "yt_voice_assignments",
    VOICE_QUEUE: "yt_voice_queue",
    VOICE_STATE: "yt_voice_state"
  });
  var LANE_CONFIG = Object.freeze({
    rinku: {
      listId: "lane-rinku-list",
      countId: "lane-rinku-count",
      emptyMessage: "配信者本人・モデレーターのコメントがここに表示されます",
      fallbackIcon: "images/yukkuri-charactore-english/link/link-yukkuri-normal-mouth-closed.thumb128.png"
    },
    konta: {
      listId: "lane-konta-list",
      countId: "lane-konta-count",
      emptyMessage: "スパチャ・ステッカー・メンバー・ギフトの応援がここに表示されます",
      fallbackIcon: "images/yukkuri-charactore-english/konta/kitsune-yukkuri-normal.thumb128.png"
    },
    tanunee: {
      listId: "lane-tanunee-list",
      countId: "lane-tanunee-count",
      emptyMessage: "一般リスナーのコメントがここに表示されます",
      fallbackIcon: "images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-normal-mouth-closed.thumb128.png"
    }
  });
  var selectedVideoId = "";
  var currentIncrementalState = null;
  var renderJobChain = Promise.resolve();
  var metrics = {
    fullGetAllCount: 0,
    incrementalFetchCount: 0,
    lastIncrementalFetchedItems: 0,
    lastIncrementalAddedItems: 0,
    lastIncrementalDurationMs: 0,
    lastFullLoadDurationMs: 0,
    voiceOnlyUpdateCount: 0
  };
  if (typeof window !== "undefined") {
    window.__ytSidepanelMetrics = metrics;
  }
  function runRenderSerialized(fn) {
    const next = renderJobChain.then(fn, fn);
    renderJobChain = next.then(
      () => void 0,
      () => void 0
    );
    return next;
  }
  function clearChildren(el) {
    if (!el) return;
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }
  function createAvatarNode(iconUrl, name, fallbackIconPath) {
    const safeUrl = safeHttpUrl(iconUrl || "");
    const makeFallback = () => {
      if (fallbackIconPath) {
        const fImg = document.createElement("img");
        fImg.className = "nl-story-userlane-avatar avatar-img";
        fImg.src = fallbackIconPath;
        fImg.alt = name || "icon";
        fImg.decoding = "async";
        return fImg;
      }
      const initial = String(name || "?").replace(/^@/, "").trim().slice(0, 1).toUpperCase() || "?";
      const span = document.createElement("span");
      span.className = "avatar-fallback";
      span.textContent = initial;
      return span;
    };
    if (!safeUrl) {
      return makeFallback();
    }
    const img = document.createElement("img");
    img.className = "nl-story-userlane-avatar avatar-img";
    img.src = safeUrl;
    img.alt = name || "icon";
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      const fallback = makeFallback();
      if (img.parentNode) {
        img.parentNode.replaceChild(fallback, img);
      }
    });
    return img;
  }
  function createAuthorHeaderFragment(user, fallbackIconPath) {
    const frag = document.createDocumentFragment();
    const displayName = String(user.name || user.channelId || "匿名リスナー").trim();
    const channelId = String(user.channelId || "").trim();
    const channelUrl = safeHttpUrl(buildYtChannelUrl(channelId));
    const shortId = channelId ? `${channelId.slice(0, 14)}${channelId.length > 14 ? "…" : ""}` : "";
    const cell = channelUrl ? document.createElement("a") : document.createElement("span");
    cell.className = channelUrl ? "nl-story-userlane-cell nl-story-userlane-cell--linkable author-link" : "nl-story-userlane-cell author-link";
    if (channelUrl) {
      cell.href = channelUrl;
      cell.target = "_blank";
      cell.rel = "noopener noreferrer";
    }
    cell.title = channelId ? `${displayName} (${channelId})` : displayName;
    cell.appendChild(createAvatarNode(user.iconUrl || "", displayName, fallbackIconPath));
    const meta = document.createElement("span");
    meta.className = "nl-story-userlane-meta";
    const nameSpan = document.createElement("span");
    nameSpan.className = "nl-story-userlane-meta__name";
    nameSpan.textContent = displayName;
    meta.appendChild(nameSpan);
    if (shortId) {
      const idTag = document.createElement("span");
      idTag.className = "nl-story-userlane-meta__id channel-id-tag";
      idTag.textContent = `(${shortId})`;
      idTag.title = channelId;
      meta.appendChild(idTag);
    }
    cell.appendChild(meta);
    frag.appendChild(cell);
    if (Number.isFinite(Number(user.voiceStyleId))) {
      const voicePill = document.createElement("span");
      voicePill.className = "voice-pill";
      voicePill.dataset.voiceStyleId = String(user.voiceStyleId);
      voicePill.textContent = `声 #${user.voiceStyleId}`;
      frag.appendChild(voicePill);
    }
    return frag;
  }
  function createChatItemElement(item, lane = "tanunee") {
    const card = document.createElement("div");
    const kind = String(item.kind || "text");
    const isGiftLike = kind === "superchat" || kind === "sticker" || kind === "membership" || kind === "membership_gift";
    card.className = `chat-item ${isGiftLike ? "nl-tl-gift" : "nl-tl-row"} kind-${kind}`;
    card.dataset.itemId = String(item.id || "");
    card.dataset.channelId = String(item.channelId || "");
    if (Number.isFinite(Number(item.voiceStyleId))) {
      card.dataset.voiceStyleId = String(item.voiceStyleId);
    }
    const fallbackIcon = LANE_CONFIG[lane]?.fallbackIcon || LANE_CONFIG.tanunee.fallbackIcon;
    const head = document.createElement("div");
    head.className = "chat-item-head";
    head.appendChild(createAuthorHeaderFragment(item, fallbackIcon));
    if ((kind === "superchat" || kind === "sticker") && Number(item.amount) > 0) {
      const pill = document.createElement("span");
      pill.className = "amount-pill";
      pill.textContent = formatYtCurrencyAmount(item.amount, item.currency);
      head.appendChild(pill);
    } else if (kind === "membership") {
      const pill = document.createElement("span");
      pill.className = "member-pill";
      pill.textContent = "メンバー加入";
      head.appendChild(pill);
    } else if (kind === "membership_gift") {
      const pill = document.createElement("span");
      pill.className = "member-pill";
      pill.textContent = "ギフト";
      head.appendChild(pill);
    }
    if (item.ts) {
      const tsSpan = document.createElement("span");
      tsSpan.className = "channel-id-tag";
      tsSpan.style.marginLeft = "auto";
      tsSpan.textContent = String(item.ts);
      head.appendChild(tsSpan);
    }
    card.appendChild(head);
    if (item.text) {
      const body = document.createElement("div");
      body.className = "chat-text";
      body.textContent = String(item.text);
      card.appendChild(body);
    }
    return card;
  }
  function renderLaneFull(lane, displayItems, totalLaneCount) {
    const cfg = LANE_CONFIG[lane];
    const listEl = document.getElementById(cfg.listId);
    const countEl = document.getElementById(cfg.countId);
    if (countEl) {
      countEl.textContent = `${totalLaneCount}件`;
    }
    if (!listEl) return;
    clearChildren(listEl);
    if (displayItems.length === 0) {
      const hint = document.createElement("div");
      hint.className = "empty-hint";
      hint.textContent = cfg.emptyMessage;
      listEl.appendChild(hint);
      return;
    }
    const frag = document.createDocumentFragment();
    for (let i = 0; i < displayItems.length; i += 1) {
      frag.appendChild(createChatItemElement(displayItems[i], lane));
    }
    listEl.appendChild(frag);
  }
  function patchLaneIncremental(lane, newlyAddedChronological, totalLaneCount) {
    const cfg = LANE_CONFIG[lane];
    const countEl = document.getElementById(cfg.countId);
    if (countEl) {
      countEl.textContent = `${totalLaneCount}件`;
    }
    if (!newlyAddedChronological || newlyAddedChronological.length === 0) return;
    const listEl = document.getElementById(cfg.listId);
    if (!listEl) return;
    const emptyHint = listEl.querySelector(".empty-hint");
    if (emptyHint) {
      emptyHint.remove();
    }
    if (newlyAddedChronological.length >= YT_SIDE_PANEL_DISPLAY_LIMIT) {
      clearChildren(listEl);
      const newest = newlyAddedChronological.slice(-YT_SIDE_PANEL_DISPLAY_LIMIT).reverse();
      const frag2 = document.createDocumentFragment();
      for (let i = 0; i < newest.length; i += 1) {
        frag2.appendChild(createChatItemElement(newest[i], lane));
      }
      listEl.appendChild(frag2);
      return;
    }
    const frag = document.createDocumentFragment();
    for (let i = newlyAddedChronological.length - 1; i >= 0; i -= 1) {
      frag.appendChild(createChatItemElement(newlyAddedChronological[i], lane));
    }
    listEl.insertBefore(frag, listEl.firstChild);
    while (listEl.children.length > YT_SIDE_PANEL_DISPLAY_LIMIT) {
      if (listEl.lastElementChild) {
        listEl.removeChild(listEl.lastElementChild);
      } else {
        break;
      }
    }
  }
  function renderSupportRanking(ranking) {
    const summaryEl = document.getElementById("yt-support-summary");
    const containerEl = document.getElementById("yt-currency-ranking-container");
    const paidTotalCount = ranking.counts.superchat + ranking.counts.sticker;
    const memberTotalCount = ranking.counts.membership + ranking.counts.membershipGift;
    if (summaryEl) {
      summaryEl.textContent = `スパチャ・ステッカー ${paidTotalCount}件 / メンバー・ギフト ${memberTotalCount}件`;
    }
    if (!containerEl) return;
    clearChildren(containerEl);
    const currencies = Object.keys(ranking.byCurrency);
    if (currencies.length === 0 && ranking.supporters.length === 0) {
      const hint = document.createElement("div");
      hint.className = "empty-hint";
      hint.textContent = "スーパーチャット・ステッカー・メンバー加入が届くと通貨ごとに集計されます。";
      containerEl.appendChild(hint);
      return;
    }
    const kontaFallback = LANE_CONFIG.konta.fallbackIcon;
    for (const currency of currencies) {
      const box = document.createElement("div");
      box.className = "currency-box";
      box.dataset.currency = currency;
      const header = document.createElement("div");
      header.className = "currency-header";
      const titleSpan = document.createElement("span");
      titleSpan.textContent = `${currency} ランキング`;
      const totalSpan = document.createElement("span");
      totalSpan.textContent = `合計 ${formatYtCurrencyAmount(
        ranking.totalsByCurrency[currency],
        currency
      )}`;
      header.appendChild(titleSpan);
      header.appendChild(totalSpan);
      box.appendChild(header);
      const listWrap = document.createElement("div");
      listWrap.className = "nl-top-support-rank__list";
      listWrap.setAttribute("role", "list");
      const rows = ranking.byCurrency[currency].slice(0, 10);
      for (const row of rows) {
        const rowEl = document.createElement("div");
        rowEl.className = "nl-top-support-rank__line supporter-row";
        rowEl.setAttribute("role", "listitem");
        const rankSpan = document.createElement("span");
        rankSpan.className = "nl-top-support-rank__place rank-badge";
        rankSpan.textContent = `${row.rank}位`;
        rowEl.appendChild(rankSpan);
        rowEl.appendChild(
          createAuthorHeaderFragment(
            {
              name: row.name,
              channelId: row.channelId,
              iconUrl: row.iconUrl
            },
            kontaFallback
          )
        );
        const amountSpan = document.createElement("span");
        amountSpan.className = "nl-top-support-rank__count amount-pill";
        amountSpan.style.marginLeft = "auto";
        amountSpan.textContent = `${row.formattedAmount} (${row.count}回)`;
        rowEl.appendChild(amountSpan);
        listWrap.appendChild(rowEl);
      }
      box.appendChild(listWrap);
      containerEl.appendChild(box);
    }
    const memberSupporters = ranking.supporters.filter(
      (s) => s.membershipCount > 0 || s.giftCount > 0
    );
    if (memberSupporters.length > 0) {
      const box = document.createElement("div");
      box.className = "currency-box";
      box.dataset.currency = "MEMBERSHIP";
      const header = document.createElement("div");
      header.className = "currency-header";
      const titleSpan = document.createElement("span");
      titleSpan.textContent = "メンバー加入・ギフト応援者";
      const totalSpan = document.createElement("span");
      totalSpan.textContent = `加入 ${ranking.counts.membership} / ギフト ${ranking.counts.membershipGift}`;
      header.appendChild(titleSpan);
      header.appendChild(totalSpan);
      box.appendChild(header);
      const listWrap = document.createElement("div");
      listWrap.className = "nl-top-support-rank__list";
      listWrap.setAttribute("role", "list");
      for (const sup of memberSupporters.slice(0, 10)) {
        const rowEl = document.createElement("div");
        rowEl.className = "nl-top-support-rank__line supporter-row";
        rowEl.setAttribute("role", "listitem");
        rowEl.appendChild(
          createAuthorHeaderFragment(
            {
              name: sup.name,
              channelId: sup.channelId,
              iconUrl: sup.iconUrl
            },
            kontaFallback
          )
        );
        const badge = document.createElement("span");
        badge.className = "member-pill";
        badge.style.marginLeft = "auto";
        badge.textContent = sup.giftCount > 0 ? `ギフト ${sup.giftCount}回` : `メンバー加入 ${sup.membershipCount}回`;
        rowEl.appendChild(badge);
        listWrap.appendChild(rowEl);
      }
      box.appendChild(listWrap);
      containerEl.appendChild(box);
    }
  }
  async function renderVoiceUiFromStorage(prefetchedData) {
    const data = prefetchedData || await chrome.storage.local.get([
      STORAGE_KEYS.STREAM_SUMMARIES,
      STORAGE_KEYS.VOICE_SETTINGS,
      STORAGE_KEYS.VOICE_QUEUE,
      STORAGE_KEYS.VOICE_STATE
    ]);
    const summaries = data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
    const currentSummary = selectedVideoId ? summaries[selectedVideoId] : null;
    const settings = data[STORAGE_KEYS.VOICE_SETTINGS] || {
      enabled: true,
      mode: YT_VOICE_MODES.ALL,
      broadcasterNameOverride: ""
    };
    const voiceState = data[STORAGE_KEYS.VOICE_STATE] || {
      effectiveMode: settings.mode,
      autoSwitched: false
    };
    const voiceQueue = Array.isArray(data[STORAGE_KEYS.VOICE_QUEUE]) ? data[STORAGE_KEYS.VOICE_QUEUE] : [];
    const enabledEl = (
      /** @type {HTMLInputElement | null} */
      document.getElementById("yt-voice-enabled")
    );
    if (enabledEl && document.activeElement !== enabledEl) {
      enabledEl.checked = Boolean(settings.enabled);
    }
    const modeEl = (
      /** @type {HTMLSelectElement | null} */
      document.getElementById("yt-voice-mode")
    );
    if (modeEl && document.activeElement !== modeEl) {
      modeEl.value = settings.mode === YT_VOICE_MODES.SELECT ? "select" : "all";
    }
    const bNameInput = (
      /** @type {HTMLInputElement | null} */
      document.getElementById("yt-broadcaster-name-input")
    );
    if (bNameInput && document.activeElement !== bNameInput) {
      bNameInput.value = settings.broadcasterNameOverride || currentSummary?.broadcasterName || "";
    }
    const queueInfoEl = document.getElementById("yt-voice-queue-info");
    if (queueInfoEl) {
      const modeLabel = voiceState.effectiveMode === YT_VOICE_MODES.SELECT ? "選んで読む" : "全部読む";
      queueInfoEl.textContent = `待機キュー: ${voiceQueue.length}件（実効モード: ${modeLabel}）`;
    }
    const autoSwitchBadge = document.getElementById("yt-voice-autoswitch-badge");
    if (autoSwitchBadge) {
      if (voiceState.autoSwitched) {
        autoSwitchBadge.classList.add("is-active");
      } else {
        autoSwitchBadge.classList.remove("is-active");
      }
    }
    const statusBox = document.getElementById("yt-voice-status-box");
    if (statusBox) {
      if (voiceState.voicevoxOnline === true) {
        const styleCount = Number(voiceState.availableStyleCount) || (Array.isArray(settings.availableStyleIds) ? settings.availableStyleIds.length : YT_DEFAULT_STYLE_IDS.length);
        statusBox.className = "voice-status-box is-online";
        statusBox.textContent = `VOICEVOX 接続中（${VOICEVOX_BASE_URL} / 利用可能スタイル: ${styleCount}種・サイドパネルを閉じていても再生継続）`;
      } else if (voiceState.voicevoxOnline === false) {
        const detail = voiceState.voicevoxReason === "timeout" ? "応答がタイムアウトしました" : "ローカルの VOICEVOX エンジンへ接続できませんでした";
        statusBox.className = "voice-status-box is-offline";
        statusBox.textContent = `VOICEVOX が起動していません（${VOICEVOX_BASE_URL} — ${detail}）。VOICEVOX を起動して「VOICEVOX 再確認」を押すと、チャンネルIDごとに決まった声で読み上げます。`;
      }
    }
    const lastSpokenEl = document.getElementById("yt-voice-last-spoken");
    if (lastSpokenEl && voiceState.lastSpokenSummary) {
      lastSpokenEl.textContent = String(voiceState.lastSpokenSummary);
    }
  }
  function updateStreamHeaderUi(summaries, activeId, totalItemsCount) {
    const videoIds = Object.keys(summaries).sort(
      (a, b) => Number(summaries[b]?.updatedAt || 0) - Number(summaries[a]?.updatedAt || 0)
    );
    if (!selectedVideoId || !summaries[selectedVideoId]) {
      selectedVideoId = activeId && summaries[activeId] ? activeId : videoIds[0] || "";
    }
    const selectEl = (
      /** @type {HTMLSelectElement | null} */
      document.getElementById("yt-stream-select")
    );
    if (selectEl && document.activeElement !== selectEl) {
      clearChildren(selectEl);
      if (videoIds.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "記録済みの配信はまだありません";
        selectEl.appendChild(opt);
      } else {
        for (const vid of videoIds) {
          const s = summaries[vid];
          const opt = document.createElement("option");
          opt.value = vid;
          const labelTitle = s.title || vid;
          opt.textContent = `${labelTitle} (${Number(s.itemCount || 0)}件)`;
          if (vid === selectedVideoId) opt.selected = true;
          selectEl.appendChild(opt);
        }
      }
    }
    const currentSummary = selectedVideoId ? summaries[selectedVideoId] : null;
    const summaryEl = document.getElementById("yt-stream-summary");
    if (summaryEl) {
      if (currentSummary) {
        const bName = currentSummary.broadcasterName ? ` / 配信者: ${currentSummary.broadcasterName}` : "";
        summaryEl.textContent = `記録中: ${currentSummary.title || currentSummary.videoId}${bName}（合計 ${totalItemsCount}件・全件 IndexedDB 保存）`;
      } else {
        summaryEl.textContent = "YouTube Live の視聴ページを開くと自動でチャットを記録します";
      }
    }
    const filterBadge = document.getElementById("yt-detected-filter-badge");
    const noticeBanner = document.getElementById("yt-all-chat-notice");
    const filterLabel = String(currentSummary?.chatFilterLabel || "").trim();
    if (filterBadge && noticeBanner) {
      if (!filterLabel) {
        filterBadge.textContent = "現在のチャット表示: 検出待ち（「すべてのチャット」を選択してください）";
        noticeBanner.classList.remove("is-warning");
      } else if (/トップチャット|top chat/i.test(filterLabel)) {
        filterBadge.textContent = `現在「${filterLabel}」表示です — 「すべてのチャット」へ切り替えると全件取得できます`;
        noticeBanner.classList.add("is-warning");
        const detailsEl = (
          /** @type {HTMLDetailsElement | null} */
          document.getElementById("yt-settings-details")
        );
        if (detailsEl && !detailsEl.open) {
          detailsEl.open = true;
        }
      } else {
        filterBadge.textContent = `現在のチャット表示: ${filterLabel}`;
        noticeBanner.classList.remove("is-warning");
      }
    }
  }
  async function renderStreamFullLoad() {
    const t0 = performance.now();
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.STREAM_SUMMARIES,
      STORAGE_KEYS.ACTIVE_VIDEO_ID,
      STORAGE_KEYS.VOICE_SETTINGS,
      STORAGE_KEYS.VOICE_QUEUE,
      STORAGE_KEYS.VOICE_STATE
    ]);
    const summaries = data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
    const activeId = String(data[STORAGE_KEYS.ACTIVE_VIDEO_ID] || "");
    const videoIds = Object.keys(summaries).sort(
      (a, b) => Number(summaries[b]?.updatedAt || 0) - Number(summaries[a]?.updatedAt || 0)
    );
    if (!selectedVideoId || !summaries[selectedVideoId]) {
      selectedVideoId = activeId && summaries[activeId] ? activeId : videoIds[0] || "";
    }
    const currentSummary = selectedVideoId ? summaries[selectedVideoId] : null;
    const items = selectedVideoId ? await getYtStreamCommentsByVideoId(selectedVideoId) : [];
    metrics.fullGetAllCount += 1;
    currentIncrementalState = createYtStreamIncrementalState(selectedVideoId, {
      broadcasterChannelId: currentSummary?.broadcasterChannelId || "",
      displayLimit: YT_SIDE_PANEL_DISPLAY_LIMIT
    });
    const applied = applyYtStreamIncrementalItems(currentIncrementalState, items, {
      broadcasterChannelId: currentSummary?.broadcasterChannelId || ""
    });
    updateStreamHeaderUi(summaries, activeId, applied.totalCount);
    await renderVoiceUiFromStorage(data);
    renderSupportRanking(applied.ranking);
    renderLaneFull("rinku", applied.laneDisplay.rinku, applied.laneCounts.rinku);
    renderLaneFull("konta", applied.laneDisplay.konta, applied.laneCounts.konta);
    renderLaneFull("tanunee", applied.laneDisplay.tanunee, applied.laneCounts.tanunee);
    metrics.lastFullLoadDurationMs = Math.round((performance.now() - t0) * 100) / 100;
  }
  async function renderStreamIncrementalUpdate() {
    const t0 = performance.now();
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.STREAM_SUMMARIES,
      STORAGE_KEYS.ACTIVE_VIDEO_ID,
      STORAGE_KEYS.VOICE_SETTINGS,
      STORAGE_KEYS.VOICE_QUEUE,
      STORAGE_KEYS.VOICE_STATE
    ]);
    const summaries = data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
    const activeId = String(data[STORAGE_KEYS.ACTIVE_VIDEO_ID] || "");
    const videoIds = Object.keys(summaries).sort(
      (a, b) => Number(summaries[b]?.updatedAt || 0) - Number(summaries[a]?.updatedAt || 0)
    );
    if (!selectedVideoId || !summaries[selectedVideoId]) {
      selectedVideoId = activeId && summaries[activeId] ? activeId : videoIds[0] || "";
    }
    if (!currentIncrementalState || currentIncrementalState.videoId !== selectedVideoId) {
      await renderStreamFullLoad();
      return;
    }
    const currentSummary = selectedVideoId ? summaries[selectedVideoId] : null;
    const newRecords = selectedVideoId ? await getYtStreamCommentsSince(selectedVideoId, currentIncrementalState.lastRecordedAt) : [];
    metrics.incrementalFetchCount += 1;
    metrics.lastIncrementalFetchedItems = newRecords.length;
    const applied = applyYtStreamIncrementalItems(currentIncrementalState, newRecords, {
      broadcasterChannelId: currentSummary?.broadcasterChannelId || ""
    });
    metrics.lastIncrementalAddedItems = applied.addedCount;
    updateStreamHeaderUi(summaries, activeId, applied.totalCount);
    await renderVoiceUiFromStorage(data);
    if (applied.addedCount > 0) {
      patchLaneIncremental("rinku", applied.addedByLane.rinku, applied.laneCounts.rinku);
      patchLaneIncremental("konta", applied.addedByLane.konta, applied.laneCounts.konta);
      patchLaneIncremental("tanunee", applied.addedByLane.tanunee, applied.laneCounts.tanunee);
    }
    if (applied.rankingChanged) {
      renderSupportRanking(applied.ranking);
    }
    metrics.lastIncrementalDurationMs = Math.round((performance.now() - t0) * 100) / 100;
  }
  function requestVoicevoxRecheck() {
    chrome.runtime.sendMessage({ type: "YT_RECHECK_VOICEVOX" }, () => {
      void chrome.runtime.lastError;
      runRenderSerialized(() => renderVoiceUiFromStorage());
    });
  }
  function bindUiEvents() {
    const selectEl = (
      /** @type {HTMLSelectElement | null} */
      document.getElementById("yt-stream-select")
    );
    selectEl?.addEventListener("change", () => {
      selectedVideoId = selectEl.value;
      runRenderSerialized(() => renderStreamFullLoad());
    });
    const enabledEl = (
      /** @type {HTMLInputElement | null} */
      document.getElementById("yt-voice-enabled")
    );
    enabledEl?.addEventListener("change", () => {
      chrome.runtime.sendMessage(
        {
          type: "YT_UPDATE_VOICE_SETTINGS",
          payload: { enabled: enabledEl.checked }
        },
        () => {
          void chrome.runtime.lastError;
          runRenderSerialized(() => renderVoiceUiFromStorage());
        }
      );
    });
    const modeEl = (
      /** @type {HTMLSelectElement | null} */
      document.getElementById("yt-voice-mode")
    );
    modeEl?.addEventListener("change", () => {
      chrome.runtime.sendMessage(
        {
          type: "YT_UPDATE_VOICE_SETTINGS",
          payload: { mode: modeEl.value === "select" ? YT_VOICE_MODES.SELECT : YT_VOICE_MODES.ALL }
        },
        () => {
          void chrome.runtime.lastError;
          runRenderSerialized(() => renderVoiceUiFromStorage());
        }
      );
    });
    const bNameInput = (
      /** @type {HTMLInputElement | null} */
      document.getElementById("yt-broadcaster-name-input")
    );
    bNameInput?.addEventListener("change", () => {
      chrome.runtime.sendMessage(
        {
          type: "YT_UPDATE_VOICE_SETTINGS",
          payload: { broadcasterNameOverride: bNameInput.value.trim() }
        },
        () => {
          void chrome.runtime.lastError;
          runRenderSerialized(() => renderVoiceUiFromStorage());
        }
      );
    });
    const recheckBtn = document.getElementById("yt-voice-recheck-btn");
    recheckBtn?.addEventListener("click", () => {
      requestVoicevoxRecheck();
    });
    const clearBtn = document.getElementById("yt-voice-clear-btn");
    clearBtn?.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "YT_CLEAR_VOICE_QUEUE" }, () => {
        void chrome.runtime.lastError;
        runRenderSerialized(() => renderVoiceUiFromStorage());
      });
    });
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      const streamChanged = Boolean(
        changes[STORAGE_KEYS.STREAM_SUMMARIES] || changes[STORAGE_KEYS.ACTIVE_VIDEO_ID]
      );
      if (streamChanged) {
        runRenderSerialized(() => renderStreamIncrementalUpdate());
      } else {
        metrics.voiceOnlyUpdateCount += 1;
        runRenderSerialized(() => renderVoiceUiFromStorage());
      }
    });
  }
  async function initSidepanel() {
    bindUiEvents();
    await runRenderSerialized(() => renderStreamFullLoad());
    requestVoicevoxRecheck();
  }
  initSidepanel();
})();
