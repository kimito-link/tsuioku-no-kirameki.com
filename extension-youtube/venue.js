// venue.js — ニコ生版 venue-entry.js(本物)+ YouTube の記録を読む入口のバンドル
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
  function safeHttpUrl(v) {
    const s = String(v == null ? "" : v).trim();
    return /^https?:\/\//i.test(s) ? s : "";
  }
  function formatNumberJa(n) {
    const v = Number(n);
    return (Number.isFinite(v) ? v : 0).toLocaleString("ja-JP");
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

  // src/shared/html/escape.js
  function escapeHtml2(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function escapeAttr(s) {
    return escapeHtml2(s);
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
  function niconicoDefaultUserIconUrl(userId) {
    const s = String(userId || "").trim();
    if (!/^\d{5,14}$/.test(s)) return "";
    const n = Number(s);
    if (!Number.isFinite(n) || n < 1) return "";
    return deriveAvatarUrlFromUid(s);
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
    if (isAnonymousStyleNicoUserId(userId)) {
      return t || y;
    }
    const syn = niconicoDefaultUserIconUrl(userId);
    if (isHttpOrHttpsUrl(syn)) return syn;
    return y || t;
  }
  function pickSupportGrowthTileWithOptionalIdenticon(userId, httpCandidate, yukkuriSrc, tvSrc, identiconOpts) {
    if (isHttpOrHttpsUrl(httpCandidate)) {
      return String(httpCandidate).trim();
    }
    const uid = String(userId || "").trim();
    if (identiconOpts?.anonymousIdenticonEnabled !== false && uid && isAnonymousStyleNicoUserId(uid)) {
      const data = String(identiconOpts.anonymousIdenticonDataUrl || "").trim();
      if (data) return data;
    }
    return pickSupportGrowthFallbackTileSrc(
      userId,
      httpCandidate,
      yukkuriSrc,
      tvSrc
    );
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
  function userLaneResolvedThumbScore(userId, httpCandidate, verifiedUids) {
    const c = String(httpCandidate || "").trim();
    if (!isHttpOrHttpsUrl(c)) return 0;
    if (isWeakNiconicoUserIconHttpUrl(c)) return 0;
    const u = String(userId || "").trim();
    if (/^[0-9]{5,14}$/.test(u) && isNiconicoSyntheticDefaultUserIconUrl(c, u)) {
      if (verifiedUids && typeof verifiedUids.has === "function" && verifiedUids.has(u)) return 2;
      return 1;
    }
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
    const escaped = escapeHtml2(text);
    const href = buildCommentTickerNameHref(userKey);
    if (!href) return escaped;
    return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" class="nl-user-profile-link">${escaped}</a>`;
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
  function compactNicoLaneUserId(userId) {
    const s = String(userId ?? "").trim();
    if (!s) return "";
    if (/^\d{5,14}$/.test(s)) {
      return s.length <= 18 ? s : `${s.slice(0, 8)}…${s.slice(-6)}`;
    }
    if (/^a:/i.test(s)) {
      const rest = s.slice(2).trim();
      const head = rest.slice(0, 4);
      if (rest.length <= 5) return `a:${rest}`;
      return `a:${head}…`;
    }
    if (s.length <= 12) return s;
    return `${s.slice(0, 5)}…${s.slice(-3)}`;
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

  // src/lib/giftThrowLedgerTableHtml.js
  var DEFAULT_USERICON_ONERROR_ATTR = 'data-on-error-fallback="blank"';
  function formatLedgerNumber(v) {
    const n = typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : NaN;
    return Number.isFinite(n) ? n.toLocaleString("ja-JP") : "—";
  }
  function wrapThumbWithProfileLink(userId, innerHtml, maskShare = false) {
    const uid = String(userId || "").trim();
    if (maskShare || !/^\d{1,18}$/.test(uid)) return innerHtml;
    return `<a href="https://www.nicovideo.jp/user/${encodeURIComponent(uid)}" target="_blank" rel="noopener noreferrer" class="nl-user-thumb-link">${innerHtml}</a>`;
  }
  function buildGiftLedgerUserIdentityCells(identity, opts = {}) {
    const maskShare = opts.maskShare === true;
    const uid = String(identity.userId || "").trim();
    const rawLabel = uid && /^\d{1,18}$/.test(uid) ? displayUserLabel(uid, identity.senderLabel || "") : String(identity.senderLabel || "").trim() || "（不明）";
    const accountHtml = uid && /^\d{1,18}$/.test(uid) ? buildUserProfileLinkedLabelHtml(uid, rawLabel) : escapeHtml2(rawLabel);
    const thumbSrc = maskShare ? "" : resolveReportUserThumbSrc({
      userId: uid,
      avatarUrl: String(identity.senderAvatarUrl || "").trim(),
      identiconResolver: opts.identiconResolver
    });
    const thumbInner = thumbSrc ? `<img class="nl-gift-ledger-thumb" src="${escapeHtml2(thumbSrc)}" alt="" width="28" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${DEFAULT_USERICON_ONERROR_ATTR}>` : '<span class="nl-gift-ledger-thumb nl-gift-ledger-thumb--empty"></span>';
    const thumbCell = wrapThumbWithProfileLink(uid, thumbInner, maskShare);
    const idInner = !uid ? escapeHtml2("—") : /^\d{1,18}$/.test(uid) ? buildUserProfileLinkedLabelHtml(uid, uid) : escapeHtml2(uid);
    const idHtml = `<span class="nl-gift-ledger-mono">${idInner}</span>`;
    return { thumbCell, accountHtml, idHtml };
  }
  function buildGiftLedgerItemThumbHtml(thumbnailUrl, size = 28) {
    const src = safeHttpUrl(thumbnailUrl);
    if (src) {
      return `<img class="nl-gift-ledger-row__thumb" src="${escapeHtml2(src)}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${DEFAULT_USERICON_ONERROR_ATTR}>`;
    }
    return `<span class="nl-gift-ledger-row__thumb nl-gift-ledger-row__thumb--empty" style="width:${size}px;height:${size}px"></span>`;
  }
  function buildGiftThrowLedgerTableRowHtml(row, index, opts = {}) {
    const idCells = buildGiftLedgerUserIdentityCells(
      {
        userId: row.userId,
        senderLabel: row.senderLabel,
        senderAvatarUrl: row.senderAvatarUrl
      },
      opts
    );
    const itemThumbInner = buildGiftLedgerItemThumbHtml(row.thumbnailUrl, 28);
    const points = `${formatLedgerNumber(row.points)} pt`;
    const sourceCol = opts.showSource !== false ? `<td data-label="出典" class="nl-gift-ledger-evidence">${escapeHtml2(formatGiftThrowSourceLabel(row.source))}</td>` : "";
    return `<tr>
<td data-label="#">${index + 1}</td>
<td data-label="時刻" class="nl-gift-ledger-time">${escapeHtml2(row.timeLabel || "—")}</td>
<td data-label="アイテム" class="nl-gift-ledger-itemcell">${itemThumbInner}<span>${escapeHtml2(row.itemName || "—")}</span></td>
<td data-label="サムネ">${idCells.thumbCell}</td>
<td data-label="アカウント" class="nl-gift-ledger-sender">${idCells.accountHtml}</td>
<td data-label="ID">${idCells.idHtml}</td>
<td data-label="pt" class="nl-num">${escapeHtml2(points)}</td>
${sourceCol}
</tr>`;
  }
  function formatGiftThrowSourceLabel(source) {
    const s = String(source || "").trim();
    if (s === "koken-api") return "koken API";
    if (s === "dom-scrape") return "公式DOM";
    if (s === "merged") return "統合";
    if (s === "gift-sub-app") return "履歴タブ";
    return s || "—";
  }
  function buildGiftThrowLedgerTableSectionHtml(rows, meta, opts = {}) {
    if (!rows.length) return "";
    const totalCount = Math.max(0, Math.floor(Number(meta.totalCount) || rows.length));
    const shownCount = Math.max(0, Math.floor(Number(meta.shownCount) || rows.length));
    const showSource = meta.showSource !== false;
    const caption = totalCount > shownCount ? `投げ一覧（${totalCount} 件中 新しい ${shownCount} 件）` : `投げ一覧（${totalCount} 件）`;
    const tableRows = rows.map((row, i) => buildGiftThrowLedgerTableRowHtml(row, i, { ...opts, showSource })).join("");
    const sourceNote = meta.payloadSource ? `<p class="nl-gift-ledger-spec-note">データ源: ${escapeHtml2(formatGiftThrowSourceLabel(meta.payloadSource))}</p>` : "";
    const headSource = showSource ? "<th>出典</th>" : "";
    return `<section class="nl-gift-ledger-section" aria-label="個別ギフト投げ一覧"><h3 class="nl-gift-ledger-head">${escapeHtml2(caption)}</h3>` + sourceNote + `<div class="nl-gift-ledger-scroll"><table class="nl-gift-ledger-table"><thead><tr><th>#</th><th>時刻</th><th>アイテム</th><th>サムネ</th><th>アカウント</th><th>ID</th><th>pt</th>${headSource}</tr></thead><tbody>${tableRows}</tbody></table></div></section>`;
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
  var uidRegVersion = 0;
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
    uidRegVersion += 1;
    return uid;
  }
  function ytKeyForNumericUid(uid) {
    return ytKeyByNumericUid.get(String(uid || "")) || "";
  }
  function ytChannelUrlForNumericUid(uid) {
    const key = ytKeyForNumericUid(uid).replace(/^topfan:/, "");
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
    const postedAt = Number(r?.postedAtMs) > 0 ? Number(r.postedAtMs) : r?.replay ? ytReplayPostedAt(String(r?.ts || ""), Number(r?._streamStartedAt || 0), at) : ytPostedAtFromClock(String(r?.ts || ""), at);
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
      //   配信が終わっていたら(endedAt)、終わった時刻までで止める
      streamAgeMin: startedAt > 0 && !replayVideoIds.has(videoId) ? Math.max(0, Math.round(((Number(sum?.endedAt) > startedAt ? Number(sum.endedAt) : Date.now()) - startedAt) / 6e4)) : null
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
    const keyOf2 = (r) => {
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
      const k = keyOf2(r);
      if (k) iconByKey.set(k, icon);
    }
    return { keyOf: keyOf2, iconOf: (key) => iconByKey.get(key) || "" };
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
        const icon = String(r?.iconUrl || "") || hit?.icon || "";
        return {
          rank: Number(r?.rank) || 0,
          name,
          contribution: Number(r?.xp) || 0,
          isAnonymous: false,
          thumbnailUrl: icon
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
            allThrowHistory = hist;
            rebuildLaneKindLabels(hist);
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
            const sum = knownSummaries?.[vid];
            const gifts = (
              /** @type {Record<string, any>} */
              buildYtGiftBags(arr || [], lv, { startedAt: ytTrustedStartedAt(sum, vid) })
            );
            const synth = { [`nls_koken_api_contrib_${lv}`]: { newValue: gifts?.koken ?? null } };
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
    const key = ytKeyForNumericUid(uid).replace(/^topfan:/, "");
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
  var laneKindLabelByUid = /* @__PURE__ */ new Map();
  function rebuildLaneKindLabels(hist) {
    const rank = { スパチャ: 4, ギフト: 3, メンバー: 2, ステッカー: 1 };
    laneKindLabelByUid.clear();
    for (const h of Array.isArray(hist) ? hist : []) {
      const uid = String(h?.userId || "");
      if (!uid) continue;
      const name = String(h?.itemName || "");
      const kind = /スーパーチャット/.test(name) ? "スパチャ" : /メンバー/.test(name) ? "メンバー" : /ステッカー/.test(name) ? "ステッカー" : "ギフト";
      const cur = laneKindLabelByUid.get(uid);
      if (!cur || rank[
        /** @type {keyof typeof rank} */
        kind
      ] > rank[
        /** @type {keyof typeof rank} */
        cur
      ]) laneKindLabelByUid.set(uid, kind);
    }
  }
  var SUPPORT_LANE_SEL = "#sceneStoryUserLaneLink, #sceneStoryUserLaneGift, #sceneStoryUserLaneAd";
  function fixTextNode(node) {
    const parentTag = node.parentNode && /** @type {Element} */
    node.parentNode.tagName;
    if (parentTag === "SCRIPT" || parentTag === "STYLE") return;
    const v = String(node.nodeValue || "");
    if (node.parentElement?.id === "officialStatNicoViewers") {
      if (v !== "—") node.nodeValue = "—";
      node.parentElement.classList.add("is-placeholder");
      return;
    }
    {
      const uid = v.trim();
      if (/^8\d{9}$/.test(uid) && laneKindLabelByUid.has(uid) && node.parentElement?.closest(SUPPORT_LANE_SEL)) {
        node.nodeValue = /** @type {string} */
        laneKindLabelByUid.get(uid);
        return;
      }
    }
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
    const ledger = doc.getElementById("mkt-gift-ledger");
    if (ledger) {
      const w = doc.createTreeWalker(ledger, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const v = String(n.nodeValue || "");
        if (v.includes("（UC")) n.nodeValue = v.replace(/（UC[^（）]*）/g, "");
      }
    }
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
      ytRebuildMarketingLedger(doc);
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
  var allThrowHistory = [];
  function ytDecorateLedger(root) {
    const next = root;
    next.querySelectorAll('td[data-label="pt"]').forEach((td) => {
      if (/^—/.test(String(td.textContent || "").trim())) td.textContent = "—";
    });
    next.querySelectorAll("td.nl-gift-ledger-sender, td.mkt-gift-sender").forEach((td) => {
      const walker = (td.ownerDocument || document).createTreeWalker(td, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        n.nodeValue = String(n.nodeValue || "").replace(/（[^（）]*）\s*$/, "");
      }
    });
    next.querySelectorAll(".nl-gift-ledger-row__thumb--empty, .mkt-gift-ledger-row__thumb--empty").forEach((box) => {
      const name = String(box.parentElement?.textContent || "");
      box.textContent = /メンバー/.test(name) ? "★" : /スーパーチャット/.test(name) ? "¥" : /ステッカー/.test(name) ? "✦" : "🎁";
      box.style.cssText += ";display:inline-flex;align-items:center;justify-content:center;font-size:16px;line-height:1;border-radius:6px;background:#e8f4ff;color:#2b7bd6";
    });
    next.querySelectorAll("img").forEach((img) => img.addEventListener("error", () => img.remove(), { once: true }));
  }
  function ytRebuildMarketingLedger(doc) {
    const section = doc.getElementById("mkt-gift-ledger");
    if (!section || !allThrowHistory.length) return;
    if (String(doc.body?.textContent || "").includes("共有向けに表示名を伏せた出力")) return;
    const rows = allThrowHistory.slice(0, 200).map((h) => ({
      timeLabel: String(h.time || "—"),
      itemName: String(h.itemName || "ギフト"),
      points: Number(h.points) > 0 ? Math.trunc(Number(h.points)) : NaN,
      thumbnailUrl: String(h.thumbnailUrl || ""),
      userId: String(h.userId || ""),
      senderLabel: String(h.senderName || ""),
      senderAvatarUrl: String(h.senderAvatarUrl || ""),
      source: "youtube"
    }));
    const html = rows.map((r, i) => buildGiftThrowLedgerTableRowHtml(r, i)).join("").replace(/nl-gift-ledger-sender/g, "mkt-gift-sender").replace(/nl-gift-ledger-evidence/g, "mkt-gift-evidence").replace(/nl-gift-ledger-thumb/g, "mkt-gift-thumb").replace(/nl-gift-ledger-mono/g, "mkt-mono").replace(/nl-gift-ledger-/g, "mkt-gift-ledger-").replace(/\bnl-num\b/g, "mkt-num").replace(/nl-user-thumb-link/g, "mkt-user-thumb-link");
    let table = section.querySelector("table.mkt-gift-ledger-table");
    if (!table) {
      const head = doc.createElement("h3");
      head.className = "mkt-subhead";
      head.textContent = "投げ一覧（新しい順）";
      const wrap = doc.createElement("div");
      wrap.className = "mkt-table-scroll";
      wrap.innerHTML = '<table class="mkt-rank mkt-gift-ledger-table"><thead><tr><th>#</th><th>時刻</th><th>アイテム</th><th>サムネ</th><th>アカウント</th><th>ID</th><th>pt</th><th>出典</th></tr></thead><tbody></tbody></table>';
      section.append(head, wrap);
      table = wrap.querySelector("table");
    }
    const tbody = table?.querySelector("tbody");
    if (!tbody) return;
    tbody.innerHTML = html;
    const note = table.closest(".mkt-table-scroll")?.previousElementSibling;
    if (note && note.classList.contains("mkt-note") && /表示は新しい順に/.test(String(note.textContent))) note.remove();
    if (allThrowHistory.length > rows.length) {
      const p = doc.createElement("p");
      p.className = "mkt-note";
      p.textContent = `表示は新しい順に ${rows.length} 件まで（全 ${allThrowHistory.length} 件）。`;
      table.closest(".mkt-table-scroll")?.before(p);
    }
    ytDecorateLedger(tbody);
  }
  function ensureZeroPtGifts() {
    const panel = document.getElementById("northStarLaneThrows-giftHistory");
    if (!panel || panel.hidden || !zeroPtGifts.length) return;
    const section = panel.querySelector("section.nl-gift-ledger-section");
    if (!section) return;
    const sig = allThrowHistory.map((h) => String(h.kokenHistoryId || "")).join("|");
    if (section.getAttribute("data-yt-all") === sig) return;
    const shown = allThrowHistory.slice(0, 20);
    const rows = shown.map((h) => ({
      timeLabel: String(h.time || "—"),
      itemName: String(h.itemName || "ギフト"),
      points: Number(h.points) > 0 ? Math.trunc(Number(h.points)) : NaN,
      thumbnailUrl: String(h.thumbnailUrl || ""),
      userId: String(h.userId || ""),
      senderLabel: String(h.senderName || ""),
      senderAvatarUrl: String(h.senderAvatarUrl || ""),
      source: "youtube"
    }));
    const html = buildGiftThrowLedgerTableSectionHtml(rows, {
      totalCount: allThrowHistory.length,
      shownCount: rows.length,
      payloadSource: "youtube"
    });
    if (!html) return;
    const holder = document.createElement("div");
    holder.innerHTML = html;
    const next = holder.firstElementChild;
    if (!next) return;
    next.setAttribute("data-yt-all", sig);
    ytDecorateLedger(next);
    section.replaceWith(next);
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
    if (/\/venue\.html$/.test(String(location.pathname || ""))) {
      let fixedAtVersion = uidRegVersion;
      setInterval(() => {
        if (fixedAtVersion === uidRegVersion || document.hidden) return;
        fixedAtVersion = uidRegVersion;
        try {
          const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          for (let n = w.nextNode(); n; n = w.nextNode()) {
            if (/8\d{9}/.test(String(n.nodeValue || ""))) fixTextNode(
              /** @type {Text} */
              n
            );
          }
        } catch {
        }
      }, 2e3);
    }
    new MutationObserver((muts) => {
      if ((topFanRestRows.length || zeroPtGifts.length) && muts.some((m) => m.type === "childList" && !(m.target instanceof Element && m.target.closest("#yt-topfan-rest, [data-yt-all]")))) scheduleTopFanRest();
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
  function ensureVenueButton() {
    if (!/\/sidepanel\.html$/.test(String(location.pathname || ""))) return;
    const anchor = document.getElementById("openComeviewVoiceBtn") || document.getElementById("openComeviewBtn");
    if (!anchor || document.getElementById("ytOpenVenueBtn")) return;
    const btn = (
      /** @type {HTMLButtonElement} */
      anchor.cloneNode(false)
    );
    btn.id = "ytOpenVenueBtn";
    btn.title = "会場モードを別ウィンドウで開く";
    btn.setAttribute("aria-label", "会場モードを別ウィンドウで開きます。");
    btn.innerHTML = '<span class="nl-compose-qbtn__row"><span class="nl-compose-qbtn__emoji" aria-hidden="true">🏟</span><span class="nl-compose-qbtn__word">会場</span></span>';
    btn.addEventListener("click", () => {
      void (async () => {
        const sums = (await chrome.storage.local.get(KEY_YT_SUMMARIES))?.[KEY_YT_SUMMARIES];
        const vid = newestVideoIdOf(sums);
        if (!vid) return;
        const url = chrome.runtime.getURL("venue.html") + `?lv=${pseudoLvForVideoId(vid)}`;
        try {
          await chrome.windows.create({ url, type: "popup", width: 1280, height: 760 });
        } catch {
          window.open(url, "_blank", "width=1280,height=760");
        }
      })();
    });
    anchor.after(btn);
  }
  if (typeof document !== "undefined" && /\/sidepanel\.html$/.test(String(location.pathname || ""))) {
    const tryVenue = () => {
      ensureVenueButton();
      if (!document.getElementById("ytOpenVenueBtn")) setTimeout(tryVenue, 1e3);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tryVenue, { once: true });
    else tryVenue();
  }
  if (typeof document !== "undefined" && /\/venue\.html$/.test(String(location.pathname || ""))) {
    const swapEmbed = (el, tries = 0) => {
      if (!(el instanceof HTMLIFrameElement)) return;
      const m = String(el.getAttribute("src") || "").match(/^https:\/\/live\.nicovideo\.jp\/embed\/(lv\d+)/i);
      if (!m) return;
      const vid = videoIdForPseudoLv(m[1].toLowerCase());
      if (!vid) {
        if (tries < 20) setTimeout(() => swapEmbed(el, tries + 1), 300);
        return;
      }
      el.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture; fullscreen");
      el.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      el.src = `https://www.youtube.com/embed/${encodeURIComponent(vid)}?autoplay=1&mute=1`;
    };
    const scan = (root) => root.querySelectorAll?.("iframe").forEach((f) => swapEmbed(f));
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) if (n instanceof Element) {
        swapEmbed(n);
        scan(n);
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (typeof HTMLImageElement !== "undefined" && typeof Element !== "undefined") {
    const mapSrc = (v) => {
      const s = String(v ?? "");
      const m = s.match(NICO_USERICON_RE);
      if (!m) return v;
      return ytIconForNumericUid(m[1]) || v;
    };
    try {
      const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
      if (desc && desc.set && desc.get) {
        Object.defineProperty(HTMLImageElement.prototype, "src", {
          configurable: true,
          enumerable: desc.enumerable,
          get() {
            return desc.get.call(this);
          },
          set(v) {
            desc.set.call(this, mapSrc(v));
          }
        });
      }
      const realSetAttr = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function(name, value) {
        if (this instanceof HTMLImageElement && String(name).toLowerCase() === "src") return realSetAttr.call(this, name, mapSrc(value));
        return realSetAttr.call(this, name, value);
      };
      const ih = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
      if (ih && ih.set && ih.get) {
        const GLOBAL_RE = /https?:\/\/[^"'\s<>]*?nicoaccount\/usericon\/(?:s\/)?\d+\/(8\d{9})\.jpg[^"'\s<>]*/g;
        Object.defineProperty(Element.prototype, "innerHTML", {
          configurable: true,
          enumerable: ih.enumerable,
          get() {
            return ih.get.call(this);
          },
          set(v) {
            if (v === "" && this.id === "sceneStoryGrowth") {
              try {
                const why = (
                  /** @type {any} */
                  globalThis.__ytFlickerWhy
                );
                if (why) {
                  const names = String(new Error().stack || "").split("\n").slice(2, 8).map((l) => (/at (?:async )?([\w$.<>]+) \(/.exec(l) || [])[1] || "?").join("<");
                  why.clears[names] = (why.clears[names] || 0) + 1;
                  const imgs = this.querySelectorAll("img");
                  const icons = this.querySelectorAll("img.nl-story-growth-icon");
                  const k = `imgs${imgs.length}/icons${icons.length}/cells${this.childElementCount}`;
                  why.before[k] = (why.before[k] || 0) + 1;
                }
              } catch {
              }
            }
            let s = v;
            if (typeof s === "string" && s.includes("usericon")) {
              s = s.replace(GLOBAL_RE, (all, uid) => {
                const icon = ytIconForNumericUid(uid);
                return icon ? icon.replace(/&/g, "&amp;").replace(/"/g, "&quot;") : all;
              });
            }
            ih.set.call(this, s);
          }
        });
      }
    } catch {
    }
  }
  if (typeof document !== "undefined" && /\/(sidepanel|venue)\.html$/.test(String(location.pathname || ""))) {
    const kindOf = (src) => {
      const s = String(src || "");
      if (!s) return "empty";
      if (s.startsWith("data:image/svg")) return "data-svg";
      if (s.startsWith("data:")) return "data";
      if (/nicoaccount\/usericon/.test(s)) return "nico-usericon";
      if (/yt\d?\.ggpht\.com|googleusercontent/.test(s)) return "yt-face";
      if (/gstatic\.com/.test(s)) return "gstatic";
      if (s.startsWith("chrome-extension:")) return "ext-image";
      return "other";
    };
    globalThis.__ytFlickerWhy = { clears: {}, before: {}, idChanges: 0, idSamples: [], srcSamples: [] };
    let perImg = /* @__PURE__ */ new WeakMap();
    let win = { srcChanges: 0, imgAdds: 0, flips: 0, byTransition: (
      /** @type {Record<string, number>} */
      {}
    ), where: (
      /** @type {Record<string, number>} */
      {}
    ) };
    const whereOf = (el) => {
      const host = el.closest("[id]");
      return host ? `#${host.id}`.slice(0, 60) : "?";
    };
    const start = () => {
      if (!document.body) return;
      new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.type === "attributes" && m.attributeName === "data-comment-id") {
            if (m.oldValue && m.oldValue !== /** @type {Element} */
            m.target.getAttribute("data-comment-id")) {
              const why = (
                /** @type {any} */
                globalThis.__ytFlickerWhy
              );
              why.idChanges += 1;
              if (why.idSamples.length < 4) {
                why.idSamples.push({ idx: (
                  /** @type {Element} */
                  m.target.getAttribute("data-comment-index")
                ), from: String(m.oldValue).slice(0, 40), to: String(
                  /** @type {Element} */
                  m.target.getAttribute("data-comment-id")
                ).slice(0, 40) });
              }
            }
            continue;
          }
          if (m.type === "attributes" && m.target instanceof HTMLImageElement && m.attributeName === "src") {
            const img = m.target;
            const t = `${kindOf(m.oldValue || "")}→${kindOf(img.getAttribute("src") || "")}`;
            if (t.split("→")[0] === t.split("→")[1] && m.oldValue === img.getAttribute("src")) continue;
            win.srcChanges += 1;
            {
              const why = (
                /** @type {any} */
                globalThis.__ytFlickerWhy
              );
              if (why.srcSamples.length < 3 && img.closest("#sceneStoryGrowth")) {
                why.srcSamples.push({ idx: img.getAttribute("data-comment-index"), from: String(m.oldValue || "").slice(-60), to: String(img.getAttribute("src") || "").slice(-60) });
              }
            }
            win.byTransition[t] = (win.byTransition[t] || 0) + 1;
            const n = (perImg.get(img) || 0) + 1;
            perImg.set(img, n);
            if (n === 2) {
              win.flips += 1;
              const w = whereOf(img);
              win.where[w] = (win.where[w] || 0) + 1;
            }
          } else if (m.type === "childList") {
            for (const n of m.addedNodes) {
              if (!(n instanceof Element)) continue;
              const c = n instanceof HTMLImageElement ? 1 : n.getElementsByTagName("img").length;
              if (c) {
                win.imgAdds += c;
                const w = `add:${whereOf(n)}`;
                win.where[w] = (win.where[w] || 0) + c;
              }
            }
          }
        }
      }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["src", "data-comment-id"], attributeOldValue: true });
      setInterval(() => {
        const why = (
          /** @type {any} */
          globalThis.__ytFlickerWhy
        );
        const snap = { at: Date.now(), page: location.pathname.split("/").pop(), version: chrome.runtime.getManifest?.().version, ...win, why: { ...why } };
        globalThis.__ytFlickerWhy = { clears: {}, before: {}, idChanges: 0, idSamples: [], srcSamples: [] };
        win = { srcChanges: 0, imgAdds: 0, flips: 0, byTransition: {}, where: {} };
        perImg = /* @__PURE__ */ new WeakMap();
        void (async () => {
          try {
            const key = "yt_diag_flicker";
            const prev = (await real.storage.local.get(key))?.[key];
            const list = Array.isArray(prev) ? prev : [];
            list.push(snap);
            await real.storage.local.set({ [key]: list.slice(-60) });
            const tileOf = (t) => {
              const img = t.querySelector("img");
              return {
                lines: String(
                  /** @type {HTMLElement} */
                  t.innerText || ""
                ).split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 5),
                img: img ? kindOf(img.getAttribute("src") || "") : "none"
              };
            };
            const lanes = {};
            for (const name of ["Link", "Gift", "Ad", "Konta", "Tanu"]) {
              const el = document.getElementById(`sceneStoryUserLane${name}`);
              if (!el) continue;
              const tiles = Array.from(el.children).filter((c) => c.querySelector("img"));
              const guide = document.getElementById(name === "Link" ? "sceneStoryUserLaneGuideLinesTop" : `sceneStoryUserLaneGuideLinesMid${name}`);
              lanes[name] = {
                shown: (
                  /** @type {HTMLElement} */
                  el.offsetParent !== null
                ),
                guide: String(
                  /** @type {HTMLElement|null} */
                  guide?.innerText || ""
                ).slice(0, 80),
                n: tiles.length,
                first: tiles.slice(0, 5).map(tileOf)
              };
            }
            const cards = {};
            for (const id of ["topSupportRankStrip", "watchConcurrentCard", "supportVisualLiveCard", "northStarLaneBody-contributionRanking", "northStarLaneBody-giftHistory", "northStarLaneBody-adRanking", "northStarLaneBody-programPoints", "northStarLaneBody-eventRank"]) {
              const el = (
                /** @type {HTMLElement|null} */
                document.getElementById(id)
              );
              if (el) cards[id] = String(el.innerText || "").replace(/\s+/g, " ").slice(0, 300);
            }
            await real.storage.local.set({ yt_diag_lanes: { at: Date.now(), version: snap.version, lanes, cards } });
          } catch {
          }
        })();
      }, 1e4);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
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

  // src/lib/venuePickupBanner.js
  var VENUE_PICKUP_CLASS = "nlsb-pickup";
  function createVenuePickupBanner(doc) {
    const root = doc.createElement("div");
    root.className = VENUE_PICKUP_CLASS;
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
    root.setAttribute("aria-label", "ピックアップされた応援コメント");
    const badge = doc.createElement("span");
    badge.className = "nlsb-pickup__badge";
    badge.textContent = "PICK UP";
    const face = doc.createElement("img");
    face.className = "nlsb-pickup__face";
    face.setAttribute("alt", "");
    face.setAttribute("hidden", "");
    const main2 = doc.createElement("span");
    main2.className = "nlsb-pickup__main";
    const body = doc.createElement("span");
    body.className = "nlsb-pickup__body";
    const meta = doc.createElement("a");
    meta.className = "nlsb-pickup__meta";
    main2.append(body, meta);
    root.append(badge, face, main2);
    return { root, body, meta, face, main: main2 };
  }
  function buildVenuePickupView(picked, opts = {}) {
    const maxChars = Math.max(8, Math.floor(Number(opts.maxChars) || 60));
    const p = picked && typeof picked === "object" ? picked : null;
    const e = p?.entry && typeof p.entry === "object" ? (
      /** @type {any} */
      p.entry
    ) : null;
    const raw = String(e?.text ?? "").replace(/\s+/g, " ").trim();
    const isGift = String(p?.why || "") === "gift";
    const giftName = String(e?.name ?? e?.nickname ?? "").trim();
    const speaker = e?.speaker && typeof e.speaker === "object" ? e.speaker : null;
    if (!raw) {
      if (isGift) {
        return {
          text: giftName ? `${giftName} さんがギフトを贈りました` : "ギフトが届きました",
          meta: "🎁 ギフト",
          empty: false,
          speaker
        };
      }
      return {
        text: "コメントが流れると、ここに1件ずつ大きく出るよ",
        meta: "",
        empty: true,
        speaker: null
      };
    }
    const chars = Array.from(raw);
    const text = chars.length > maxChars ? `${chars.slice(0, maxChars).join("")}…` : raw;
    const speakerMeta = speaker ? [String(speaker.name || ""), String(speaker.idLine || "")].filter(Boolean).join(" ・ ") : "";
    const meta = isGift ? "🎁 ギフト" : speakerMeta || giftName || "";
    return { text, meta, empty: false, speaker };
  }
  function applyVenuePickupView(els, view) {
    if (!els || !els.root || !els.body) return false;
    const sp = view?.speaker && typeof view.speaker === "object" ? view.speaker : null;
    const key = `${view?.empty ? "e" : "f"}|${view?.text || ""}|${view?.meta || ""}|${sp ? `${sp.avatar || ""}|${sp.href || ""}` : ""}`;
    if (els.root.dataset.nlPickupKey === key) return false;
    els.root.dataset.nlPickupKey = key;
    els.body.textContent = String(view?.text || "");
    if (els.meta) {
      els.meta.textContent = String(view?.meta || "");
      if (sp && sp.href) {
        els.meta.setAttribute("href", String(sp.href));
        els.meta.setAttribute("target", "_blank");
        els.meta.setAttribute("rel", "noopener noreferrer");
      } else {
        els.meta.removeAttribute("href");
        els.meta.removeAttribute("target");
        els.meta.removeAttribute("rel");
      }
    }
    if (els.face) {
      if (sp && sp.avatar) {
        els.face.removeAttribute("hidden");
        els.face.onerror = () => {
          els.face.onerror = null;
          if (sp.fallbackAvatar && sp.fallbackAvatar !== sp.avatar) els.face.setAttribute("src", String(sp.fallbackAvatar));
          else els.face.setAttribute("hidden", "");
        };
        els.face.setAttribute("src", String(sp.avatar));
      } else {
        els.face.setAttribute("hidden", "");
        els.face.removeAttribute("src");
      }
    }
    if (view?.empty) els.root.setAttribute("data-empty", "1");
    else els.root.removeAttribute("data-empty");
    return true;
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

  // src/lib/pickTickerHighlight.js
  var TICKER_BUCKET_MS = 7e3;
  var TICKER_LOOKBACK_MS = 8e3;
  var TICKER_MIN_TEXT_LEN = 3;
  var TICKER_SWEET_LEN_MAX = 60;
  var TICKER_DUP_EXCLUDE = 3;
  function normalizeText(text) {
    return String(text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  }
  function toCandidate(row) {
    const o = (
      /** @type {Record<string, unknown>} */
      row && typeof row === "object" ? row : null
    );
    if (!o) return null;
    const atRaw = Number(o.at);
    const capRaw = Number(o.capturedAt);
    const ts = Number.isFinite(atRaw) && atRaw > 0 ? atRaw : Number.isFinite(capRaw) && capRaw > 0 ? capRaw : 0;
    return {
      ts,
      kind: String(o.kind || "comment"),
      text: String(o.text ?? "").replace(/\s+/g, " ").trim(),
      userId: String(o.userId ?? "").trim(),
      commentNo: String(o.commentNo ?? "").trim(),
      src: row
    };
  }
  function pickTickerHighlightEntry(list, nowMs, opts = {}) {
    const rows = Array.isArray(list) ? list : [];
    const now = Number(nowMs);
    const nowSafe = Number.isFinite(now) && now > 0 ? now : 0;
    const bucketAt = nowSafe > 0 ? nowSafe - nowSafe % TICKER_BUCKET_MS : 0;
    const stats = {
      candidates: 0,
      filteredTooShort: 0,
      filteredDup: 0,
      filteredSameUser: 0
    };
    const fallback = () => {
      const latest = pickLatestCommentEntry(
        /** @type {any} */
        rows
      );
      return {
        entry: latest || null,
        why: (
          /** @type {'fallback'|'none'} */
          latest ? "fallback" : "none"
        ),
        bucketAt,
        stats
      };
    };
    if (!rows.length || bucketAt <= 0) return fallback();
    const windowFrom = bucketAt - TICKER_LOOKBACK_MS;
    const windowTo = bucketAt + TICKER_BUCKET_MS;
    const inWindow = [];
    for (const row of rows) {
      const c = toCandidate(row);
      if (!c || c.ts <= windowFrom || c.ts > windowTo) continue;
      inWindow.push(c);
    }
    if (!inWindow.length) return fallback();
    const dupCount = /* @__PURE__ */ new Map();
    for (const c of inWindow) {
      const key = normalizeText(c.text);
      if (!key) continue;
      dupCount.set(key, (dupCount.get(key) || 0) + 1);
    }
    const lastUserId = String(opts?.lastUserId ?? "").trim();
    let best = null;
    for (const c of inWindow) {
      const isGift = c.kind === "gift";
      const norm2 = normalizeText(c.text);
      const len = Array.from(c.text).length;
      if (!isGift && len < TICKER_MIN_TEXT_LEN) {
        stats.filteredTooShort += 1;
        continue;
      }
      const dup = norm2 ? dupCount.get(norm2) || 0 : 0;
      if (!isGift && dup >= TICKER_DUP_EXCLUDE) {
        stats.filteredDup += 1;
        continue;
      }
      if (!isGift && lastUserId && c.userId && c.userId === lastUserId) {
        stats.filteredSameUser += 1;
        continue;
      }
      stats.candidates += 1;
      let score = isGift ? 100 : 0;
      if (len >= TICKER_MIN_TEXT_LEN && len <= TICKER_SWEET_LEN_MAX) score += 10;
      else if (len <= 120) score += 5;
      score -= Math.max(0, dup - 1) * 8;
      if (score <= 0) continue;
      if (!best) {
        best = { c, score };
        continue;
      }
      if (score > best.score) {
        best = { c, score };
      } else if (score === best.score) {
        if (c.ts > best.c.ts) best = { c, score };
        else if (c.ts === best.c.ts) {
          const a = /^\d+$/.test(c.commentNo) ? Number(c.commentNo) : -1;
          const b = /^\d+$/.test(best.c.commentNo) ? Number(best.c.commentNo) : -1;
          if (a > b) best = { c, score };
        }
      }
    }
    if (!best) return fallback();
    return {
      entry: best.c.src,
      why: best.c.kind === "gift" ? "gift" : "scored",
      bucketAt,
      stats
    };
  }

  // src/lib/recentTextRing.js
  var RECENT_TEXT_KEEP = 5;
  function pushRecentText(list, text, keep) {
    const cap = Math.max(1, Math.floor(Number(keep) || RECENT_TEXT_KEEP));
    const prev = Array.isArray(list) ? list.filter((v) => typeof v === "string" && v) : [];
    const t = String(text ?? "").replace(/\s+/g, " ").trim();
    if (!t) return prev.slice(0, cap);
    if (prev[0] === t) return prev.slice(0, cap);
    return [t, ...prev].slice(0, cap);
  }
  function mergeRecentTexts(newer, older, keep) {
    const cap = Math.max(1, Math.floor(Number(keep) || RECENT_TEXT_KEEP));
    const out = [];
    for (const list of [newer, older]) {
      if (!Array.isArray(list)) continue;
      for (const raw of list) {
        if (out.length >= cap) return out;
        const t = String(raw ?? "").replace(/\s+/g, " ").trim();
        if (!t) continue;
        if (out[out.length - 1] === t) continue;
        out.push(t);
      }
    }
    return out;
  }
  function formatRecentTexts(list, opts = {}) {
    const max = Math.max(0, Math.floor(Number(opts.max) || RECENT_TEXT_KEEP));
    const maxChars = Math.max(1, Math.floor(Number(opts.maxChars) || 60));
    const src = Array.isArray(list) ? list : [];
    const out = [];
    for (const raw of src) {
      if (out.length >= max) break;
      const t = String(raw ?? "").replace(/\s+/g, " ").trim();
      if (!t) continue;
      out.push(t.length > maxChars ? `${t.slice(0, maxChars)}…` : t);
    }
    return out;
  }

  // src/lib/timeAuthority.js
  var VALUE_FRESH_MS = 3 * 60 * 1e3;
  function toEpochMs(v) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
    const t = Date.parse(String(v || ""));
    return Number.isFinite(t) && t > 0 ? t : 0;
  }
  function ageMsOf(capturedAt, nowMs) {
    const at = toEpochMs(capturedAt);
    const now = Number(nowMs);
    if (!(at > 0) || !Number.isFinite(now) || !(now > 0)) return null;
    return Math.max(0, now - at);
  }

  // src/lib/speechEvidence.js
  var SPEECH_EVIDENCE_GATE_ENABLED = true;
  var SPEECH_UNKNOWN = Object.freeze(
    /** @type {SpeechEvidence} */
    { comments: null, lastAt: null, texts: Object.freeze([]) }
  );
  function toTexts(v) {
    if (!Array.isArray(v)) return [];
    const out = [];
    for (const raw of v) {
      if (out.length >= RECENT_TEXT_KEEP) break;
      const t = String(raw ?? "").replace(/\s+/g, " ").trim();
      if (t) out.push(t);
    }
    return out;
  }
  function toCount(v) {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
  }
  function toAt(v) {
    const num3 = Number(v);
    if (v != null && v !== "" && Number.isFinite(num3)) return num3 > 0 ? Math.floor(num3) : null;
    const n = toEpochMs(v);
    return n > 0 ? Math.floor(n) : null;
  }
  function speechEvidence(input) {
    const texts = toTexts(input?.texts);
    let comments = toCount(input?.comments);
    if (comments === 0 && texts.length > 0) comments = null;
    const lastAt = toAt(input?.lastAt);
    return Object.freeze({ comments, lastAt, texts: Object.freeze(texts) });
  }
  function hasSpeech(e) {
    if (!e) return false;
    return Number(e.comments) > 0 || Array.isArray(e.texts) && e.texts.length > 0;
  }
  function mergeSpeechEvidence(older, newer) {
    const a = older || SPEECH_UNKNOWN;
    const b = newer || SPEECH_UNKNOWN;
    const comments = a.comments == null && b.comments == null ? null : (a.comments || 0) + (b.comments || 0);
    const lastAt = a.lastAt == null ? b.lastAt : b.lastAt == null ? a.lastAt : Math.max(a.lastAt, b.lastAt);
    const texts = b.texts.length ? b.texts : a.texts;
    return speechEvidence({ comments, lastAt, texts });
  }
  function speechEvidenceFromCandidate(c) {
    if (!c || typeof c !== "object") return SPEECH_UNKNOWN;
    const comments = toCount(c.commentCount);
    return speechEvidence({
      comments,
      // 件数が正のときだけ最終発言時刻とみなす(0 件の候補の _laneSortAt は発言の時刻ではない)。
      lastAt: comments != null && comments > 0 ? c._laneSortAt : null,
      texts: c.recentTexts
    });
  }
  function speechEvidenceFromMirrorCell(cell) {
    if (!cell || typeof cell !== "object") return SPEECH_UNKNOWN;
    const st = cell.stats && typeof cell.stats === "object" ? cell.stats : null;
    const c = toCount(st?.c ?? st?.commentCount);
    return speechEvidence({
      comments: c != null && c > 0 ? c : null,
      // 0 は「数えていない/落ちた」と区別できない(positiveOrNull)=不明
      lastAt: null,
      texts: cell.recentTexts
    });
  }
  function speechEvidenceFromRoster(e) {
    if (!e || typeof e !== "object") return SPEECH_UNKNOWN;
    const comments = toCount("realComments" in e ? e.realComments : e.commentCount);
    const texts = toTexts(Array.isArray(e.recentTexts) && e.recentTexts.length ? e.recentTexts : e.lastText ? [e.lastText] : []);
    const lastTextAt = toAt(e.lastTextAt);
    return speechEvidence({
      comments,
      // lastTextAt(本文行を受けた時刻)があればそれ。無い旧エントリは件数が正のときだけ lastSeen を使う。
      lastAt: lastTextAt != null ? lastTextAt : comments != null && comments > 0 ? e.lastSeen : null,
      texts
    });
  }
  function speechEvidenceFromRow(r) {
    if (!r || typeof r !== "object") return SPEECH_UNKNOWN;
    const text = String(r.text ?? "").trim();
    if (!text || r.isGift === true) return SPEECH_UNKNOWN;
    return speechEvidence({ comments: 1, lastAt: r.capturedAt, texts: [text] });
  }
  function speechWithFallbackTexts(base, fallbackTexts) {
    const b = base || SPEECH_UNKNOWN;
    if (b.texts.length > 0 || !Array.isArray(fallbackTexts) || fallbackTexts.length === 0) return b;
    return speechEvidence({ comments: b.comments, lastAt: b.lastAt, texts: fallbackTexts });
  }

  // src/lib/venueSeats.js
  var VENUE_MAX_SEATS = 50;
  var VENUE_FULLSCREEN_MAX_SEATS = 500;
  var VENUE_FRONT_ROW_SEATS = 20;
  var VENUE_VIP_MAX = 8;
  var VENUE_NORMAL_MAX = 30;
  function resolveVenueLayoutMode(arenaCount) {
    const n = Math.max(0, Math.floor(Number(arenaCount) || 0));
    if (n === 0) return "empty";
    if (n <= VENUE_VIP_MAX) return "vip";
    if (n <= VENUE_NORMAL_MAX) return "normal";
    return "packed";
  }
  function venueParticipantKey(row, isGenericName, _promoteUserIds) {
    if (!row || typeof row !== "object") return null;
    const uid = String(row.userId || "").trim();
    if (uid) {
      return `u:${uid}`;
    }
    const name = String(row.name || "").trim();
    if (!name) return null;
    if (typeof isGenericName === "function" && isGenericName(name)) return null;
    return `n:${name}`;
  }
  function collectVenueParticipants(rows, opts = {}) {
    const list = Array.isArray(rows) ? rows : [];
    const isGenericName = opts.isGenericName;
    const promoteUserIds = opts.promoteUserIds instanceof Set ? opts.promoteUserIds : null;
    const byKey = /* @__PURE__ */ new Map();
    let order = 0;
    for (const r of list) {
      const key = venueParticipantKey(r, isGenericName, promoteUserIds);
      if (!key) continue;
      const at = Number.isFinite(Number(r?.capturedAt)) ? Number(r.capturedAt) : 0;
      const text = String(r?.text ?? "").trim();
      const preCount = Number.isFinite(Number(r?.preCount)) ? Math.max(1, Math.floor(Number(r.preCount))) : 1;
      const preHasGift = r?.preHasGift === true || !!r?.isGift;
      const preGiftCount = Number.isFinite(Number(r?.preGiftCount)) ? Math.max(0, Math.floor(Number(r.preGiftCount))) : 0;
      const existing = byKey.get(key);
      if (existing) {
        existing.count += preCount;
        existing.giftCount += preGiftCount;
        existing.speech = mergeSpeechEvidence(existing.speech, r?.speech || speechEvidenceFromRow(r));
        if (at >= existing.lastAt) {
          existing.lastAt = at;
          if (text) existing.lastText = text;
          if (Array.isArray(r?.recentTexts) && r.recentTexts.length) {
            existing.recentTexts = r.recentTexts.slice();
          }
        }
        if (preHasGift) existing.hasGift = true;
        const uid = String(r?.userId || "").trim();
        if (uid && !existing.userId) existing.userId = uid;
        const name = String(r?.name || "").trim();
        if (name && !existing.name) existing.name = name;
        const avatar = String(r?.avatar || "").trim();
        if (avatar && !existing.avatar) existing.avatar = avatar;
      } else {
        byKey.set(key, {
          key,
          name: String(r?.name || "").trim(),
          userId: String(r?.userId || "").trim(),
          avatar: String(r?.avatar || "").trim(),
          lastText: text,
          recentTexts: Array.isArray(r?.recentTexts) ? r.recentTexts.slice() : [],
          lastAt: at,
          firstAt: at,
          count: preCount,
          hasGift: preHasGift,
          giftCount: preGiftCount,
          speech: r?.speech || speechEvidenceFromRow(r) || SPEECH_UNKNOWN,
          // 発言の証拠(2026-10-16・表示用。count は並び/VIP 用)
          order: order++
        });
      }
    }
    const out = Array.from(byKey.values());
    out.sort((a, b) => a.order - b.order);
    return out.map(({ order: _order, ...rest }) => rest);
  }
  function hasRealThumbnail(avatar) {
    return /^https?:\/\//i.test(String(avatar || "").trim());
  }
  function deriveNicoUserIconUrl(userId) {
    const uid = String(userId || "").trim();
    if (!/^\d{2,15}$/.test(uid)) return "";
    return deriveAvatarUrlFromUid(uid);
  }
  function resolveVenueEffectiveAvatar(participant) {
    const p = participant && typeof participant === "object" ? participant : {};
    const stored = String(p.avatar || "").trim();
    if (hasRealThumbnail(stored)) return stored;
    return deriveNicoUserIconUrl(p.userId);
  }
  function participantHasEffectiveThumbnail(participant) {
    return hasRealThumbnail(resolveVenueEffectiveAvatar(participant));
  }
  function resolveVenueRegularScore(participant, opts = {}) {
    const p = participant && typeof participant === "object" ? participant : {};
    const count = Math.max(0, Math.floor(Number(p.count) || 0));
    const giftPoints = Math.max(0, Number(p.giftPoints) || 0);
    const commentCap = Number.isFinite(opts.commentCap) && opts.commentCap > 0 ? opts.commentCap : 40;
    const giftPointsCap = Number.isFinite(opts.giftPointsCap) && opts.giftPointsCap > 0 ? opts.giftPointsCap : 5e3;
    const log1p = (v) => Math.log(1 + Math.max(0, v));
    const commentNorm = Math.min(1, log1p(count) / log1p(commentCap));
    const giftFlag = p.hasGift ? 1 : 0;
    const giftPointsNorm = giftPoints > 0 ? Math.min(1, log1p(giftPoints) / log1p(giftPointsCap)) : 0;
    const score = 100 * (0.55 * commentNorm + 0.3 * giftFlag + 0.15 * giftPointsNorm);
    return Math.max(0, Math.min(100, score));
  }
  var VENUE_VIP_REGULAR_MAX = 8;
  var VENUE_VIP_REGULAR_MIN_SCORE = 1;
  function selectVenueVipRegularKeys(participants, opts = {}) {
    const max = Number.isFinite(opts.max) && opts.max > 0 ? Math.floor(opts.max) : VENUE_VIP_REGULAR_MAX;
    return new Set(rankVenueContributors(participants, opts).slice(0, max).map((s) => s.key));
  }
  function rankVenueContributors(participants, opts = {}) {
    const list = Array.isArray(participants) ? participants : [];
    const minScore = Number.isFinite(opts.minScore) && opts.minScore >= 0 ? opts.minScore : Number.isFinite(opts.threshold) && opts.threshold >= 0 ? opts.threshold : VENUE_VIP_REGULAR_MIN_SCORE;
    const scored = [];
    for (const p of list) {
      if (!p || typeof p.key !== "string" || !p.key) continue;
      const score = resolveVenueRegularScore(p, opts);
      if (score >= minScore && score > 0) {
        scored.push({ key: p.key, score, count: Number(p.count) || 0 });
      }
    }
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.count !== a.count) return b.count - a.count;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });
    return scored;
  }
  var VENUE_SUPPORTER_RANK_BAND = 8;
  var VENUE_SUPPORTER_ORDER_KEEP = 24;
  function stabilizeVenueSupporterOrder(ranked, prevOrderKeys, opts = {}) {
    const list = Array.isArray(ranked) ? ranked.filter((r) => r && typeof r.key === "string" && r.key) : [];
    const band = Number.isFinite(opts.band) && opts.band > 0 ? opts.band : VENUE_SUPPORTER_RANK_BAND;
    const keep = Number.isFinite(opts.keep) && opts.keep >= 0 ? Math.floor(opts.keep) : VENUE_SUPPORTER_ORDER_KEEP;
    const prevKeys = Array.isArray(prevOrderKeys) ? prevOrderKeys.filter((k) => typeof k === "string" && k) : [];
    const prevIndexByKey = /* @__PURE__ */ new Map();
    prevKeys.forEach((k, i) => {
      if (!prevIndexByKey.has(k)) prevIndexByKey.set(k, i);
    });
    const decorated = list.map((r) => ({
      r,
      band: Math.floor((Number(r.score) || 0) / band),
      prevIndex: prevIndexByKey.has(r.key) ? prevIndexByKey.get(r.key) : Number.POSITIVE_INFINITY
    }));
    decorated.sort((a, b) => {
      if (b.band !== a.band) return b.band - a.band;
      if (a.prevIndex !== b.prevIndex) return a.prevIndex - b.prevIndex;
      if (b.r.score !== a.r.score) return b.r.score - a.r.score;
      if (b.r.count !== a.r.count) return b.r.count - a.r.count;
      return a.r.key < b.r.key ? -1 : a.r.key > b.r.key ? 1 : 0;
    });
    const order = decorated.map((d) => d.r);
    const orderKeys = order.map((r) => r.key).slice(0, keep);
    const currentKeys = new Set(order.map((r) => r.key));
    const droppedKeys = prevKeys.filter((k) => !currentKeys.has(k));
    const prevPresent = prevKeys.filter((k) => currentKeys.has(k));
    const finalIndexByKey = new Map(order.map((r, i) => [r.key, i]));
    let overtakeCount = 0;
    for (let i = 0; i < prevPresent.length; i += 1) {
      for (let j = i + 1; j < prevPresent.length; j += 1) {
        const ki = prevPresent[i];
        const kj = prevPresent[j];
        if (finalIndexByKey.get(kj) < finalIndexByKey.get(ki)) overtakeCount += 1;
      }
    }
    return { order, orderKeys, droppedKeys, overtakeCount };
  }
  var VENUE_TOP_RANK_MAX = 3;
  var VENUE_TOP_SUPPORTERS_BAR = 8;
  function rankVenueParticipants(participants, maxSeats = VENUE_MAX_SEATS, prevSeatByKey = null) {
    const list = Array.isArray(participants) ? participants.slice() : [];
    const cap = Number.isFinite(maxSeats) && maxSeats > 0 ? Math.floor(maxSeats) : VENUE_MAX_SEATS;
    const seated = /* @__PURE__ */ new Set();
    if (prevSeatByKey instanceof Map) {
      for (const [k, seat] of prevSeatByKey) {
        const s = Number(seat);
        if (Number.isInteger(s) && s >= 0 && s < cap) seated.add(String(k));
      }
    } else if (prevSeatByKey && typeof prevSeatByKey === "object") {
      for (const [k, seat] of Object.entries(prevSeatByKey)) {
        const s = Number(seat);
        if (Number.isInteger(s) && s >= 0 && s < cap) seated.add(String(k));
      }
    }
    const byCountThenRecent = (a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (b.lastAt !== a.lastAt) return b.lastAt - a.lastAt;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    };
    const byRecentThenCount = (a, b) => {
      if (b.lastAt !== a.lastAt) return b.lastAt - a.lastAt;
      if (b.count !== a.count) return b.count - a.count;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    };
    const picked = /* @__PURE__ */ new Set();
    const out = [];
    const fill = (pred, sorter) => {
      if (out.length >= cap) return;
      const layer = list.filter((p) => p && !picked.has(p.key) && pred(p)).sort(sorter);
      for (const p of layer) {
        if (out.length >= cap) break;
        picked.add(p.key);
        out.push(p);
      }
    };
    fill((p) => seated.has(p.key), byCountThenRecent);
    fill((p) => hasRealThumbnail(p.avatar), byCountThenRecent);
    fill((p) => (p.count || 0) >= 2, byCountThenRecent);
    fill(() => true, byRecentThenCount);
    return out.slice(0, cap);
  }
  function assignVenueSeats(ranked, prevSeatByKey, maxSeats = VENUE_MAX_SEATS, frontRow = 0) {
    const list = Array.isArray(ranked) ? ranked : [];
    const cap = Number.isFinite(maxSeats) && maxSeats > 0 ? Math.floor(maxSeats) : VENUE_MAX_SEATS;
    const front = Number.isFinite(frontRow) && frontRow > 0 ? Math.min(Math.floor(frontRow), cap) : 0;
    const prev = prevSeatByKey instanceof Map ? prevSeatByKey : new Map(Object.entries(prevSeatByKey || {}).map(([k, v]) => [k, Number(v)]));
    const seatByKey = /* @__PURE__ */ new Map();
    const usedSeats = /* @__PURE__ */ new Set();
    for (const p of list) {
      const prevSeat = prev.get(p.key);
      if (Number.isInteger(prevSeat) && prevSeat >= 0 && prevSeat < cap && !usedSeats.has(prevSeat)) {
        if (front > 0 && prevSeat < front && !hasRealThumbnail(p.avatar)) {
          continue;
        }
        seatByKey.set(p.key, prevSeat);
        usedSeats.add(prevSeat);
      }
    }
    let nextFreeFront = 0;
    let nextFreeBack = front;
    for (const p of list) {
      if (seatByKey.has(p.key)) continue;
      let seat = -1;
      if (front > 0 && hasRealThumbnail(p.avatar)) {
        while (nextFreeFront < front && usedSeats.has(nextFreeFront)) nextFreeFront += 1;
        if (nextFreeFront < front) seat = nextFreeFront;
      }
      if (seat < 0) {
        while (nextFreeBack < cap && usedSeats.has(nextFreeBack)) nextFreeBack += 1;
        if (nextFreeBack < cap) seat = nextFreeBack;
      }
      if (seat < 0) break;
      seatByKey.set(p.key, seat);
      usedSeats.add(seat);
    }
    const seats = [];
    for (const p of list) {
      const seatIndex = seatByKey.get(p.key);
      if (seatIndex == null) continue;
      seats.push({ seatIndex, participant: p });
    }
    seats.sort((a, b) => a.seatIndex - b.seatIndex);
    return { seats, seatByKey };
  }
  function countAnonymousParticipants(rows, isGenericName, promoteUserIds, excludeKeys = null) {
    const list = Array.isArray(rows) ? rows : [];
    const promote = promoteUserIds instanceof Set ? promoteUserIds : null;
    const anonUids = /* @__PURE__ */ new Set();
    let hasUidlessAnon = false;
    const exclude = excludeKeys instanceof Set ? excludeKeys : null;
    for (const r of list) {
      const key = venueParticipantKey(r, isGenericName, promote);
      if (exclude && key && exclude.has(key)) continue;
      if (!exclude && key) continue;
      const uid = String(r?.userId || "").trim();
      if (uid) anonUids.add(uid);
      else hasUidlessAnon = true;
    }
    return anonUids.size + (hasUidlessAnon ? 1 : 0);
  }
  var VENUE_AUDIENCE_FACE_MAX = 120;
  function collectAudienceFaceUserIds(rows, opts = {}) {
    const list = Array.isArray(rows) ? rows : [];
    const isGenericName = opts.isGenericName;
    const promote = opts.promoteUserIds instanceof Set ? opts.promoteUserIds : null;
    const max = Number.isFinite(opts.max) && opts.max > 0 ? Math.floor(opts.max) : VENUE_AUDIENCE_FACE_MAX;
    const excludeKeys = opts.excludeKeys instanceof Set ? opts.excludeKeys : null;
    const lastAtByUid = /* @__PURE__ */ new Map();
    let hasUidlessAnon = false;
    for (const r of list) {
      const key = venueParticipantKey(r, isGenericName, promote);
      if (excludeKeys && key && excludeKeys.has(key)) continue;
      if (!excludeKeys && key) continue;
      const uid = String(r?.userId || "").trim();
      if (!uid) {
        hasUidlessAnon = true;
        continue;
      }
      const at = Number.isFinite(Number(r?.capturedAt)) ? Number(r.capturedAt) : 0;
      const prev = lastAtByUid.get(uid);
      if (prev == null || at >= prev) lastAtByUid.set(uid, at);
    }
    const totalAnonymous = lastAtByUid.size + (hasUidlessAnon ? 1 : 0);
    const faceUserIds = Array.from(lastAtByUid.entries()).sort((a, b) => b[1] - a[1]).slice(0, max).map(([uid]) => uid);
    return { faceUserIds, totalAnonymous };
  }
  function buildVenueSeating(rows, opts = {}) {
    const maxSeats = Number.isFinite(opts.maxSeats) ? opts.maxSeats : VENUE_MAX_SEATS;
    const frontRow = Number.isFinite(opts.frontRowSeats) ? opts.frontRowSeats : VENUE_FRONT_ROW_SEATS;
    const promoteUserIds = opts.promoteUserIds instanceof Set ? opts.promoteUserIds : null;
    const participants = collectVenueParticipants(rows, {
      isGenericName: opts.isGenericName,
      promoteUserIds
    });
    const ranked = rankVenueParticipants(participants, maxSeats, opts.prevSeatByKey);
    const { seats, seatByKey } = assignVenueSeats(ranked, opts.prevSeatByKey, maxSeats, frontRow);
    const vipRegularKeys = opts.vipRegular === false ? /* @__PURE__ */ new Set() : selectVenueVipRegularKeys(participants, {
      threshold: opts.vipRegularThreshold,
      max: opts.vipRegularMax,
      commentCap: opts.vipRegularCommentCap,
      giftPointsCap: opts.vipRegularGiftPointsCap
    });
    const contributorOpts = {
      commentCap: opts.vipRegularCommentCap,
      giftPointsCap: opts.vipRegularGiftPointsCap
    };
    const stabilized = stabilizeVenueSupporterOrder(
      rankVenueContributors(participants, contributorOpts),
      opts.prevSupporterOrderKeys,
      { band: opts.supporterRankBand }
    );
    const topRankN = Number.isFinite(opts.topRank) ? Math.floor(opts.topRank) : VENUE_TOP_RANK_MAX;
    const rankByKey = topRankN > 0 ? new Map(stabilized.order.slice(0, topRankN).map((r, i) => [r.key, i + 1])) : /* @__PURE__ */ new Map();
    const topSupportersN = Number.isFinite(opts.topSupporters) ? Math.floor(opts.topSupporters) : VENUE_TOP_SUPPORTERS_BAR;
    let topSupporters = [];
    if (topSupportersN > 0) {
      const byKey = new Map(participants.map((p) => [p.key, p]));
      topSupporters = stabilized.order.slice(0, topSupportersN).map((r, idx) => ({ rank: idx + 1, participant: byKey.get(r.key), score: r.score })).filter((x) => x.participant);
    }
    return {
      seats: seats.map((s) => ({
        ...s,
        isFrontRow: s.seatIndex < frontRow,
        isVipRegular: vipRegularKeys.has(s.participant.key),
        venueRank: rankByKey.get(s.participant.key) || 0
      })),
      topSupporters,
      seatByKey,
      participantCount: participants.length,
      anonymousCount: countAnonymousParticipants(rows, opts.isGenericName, promoteUserIds),
      layoutMode: resolveVenueLayoutMode(participants.length),
      supporterRank: {
        orderKeys: stabilized.orderKeys,
        droppedKeys: stabilized.droppedKeys,
        overtakeCount: stabilized.overtakeCount
      }
    };
  }
  function venueRowsFromUserLaneCandidates(candidates) {
    const list = Array.isArray(candidates) ? candidates : [];
    const out = [];
    for (const c of list) {
      if (!c || typeof c !== "object") continue;
      const userId = String(c.userId || "").trim();
      if (!userId) continue;
      const preCount = Math.max(1, Math.floor(Number(c.commentCount) || 0) || 1);
      const giftCount = Math.max(0, Math.floor(Number(c.giftCount) || 0));
      out.push({
        userId,
        name: String(c.nickname || "").trim(),
        avatar: String(c.avatarUrl || "").trim(),
        // 席の表示自体は名前/サムネで成立する(吹き出しは別経路)ので text は空のまま。
        text: "",
        // v0.1.1219: ホバーカード用の直近発言。userLaneCandidatesFromStorage が
        //   集計時に既存配列の先頭N件から作っている(storage の追加読みゼロ)。
        //   ★ここを落とすと、値は貯まるのにカードが空になる(v0.1.1218 で実際に踏んだ)。
        recentTexts: Array.isArray(c.recentTexts) ? c.recentTexts.slice() : [],
        capturedAt: Number.isFinite(Number(c._laneSortAt)) ? Number(c._laneSortAt) : 0,
        // 集約済みの実数(VIP常連光らせのスコア用)。collectVenueParticipants が拾う。
        preCount,
        preHasGift: giftCount > 0,
        preGiftCount: giftCount,
        // 2026-10-16(発言の証拠): 表示用の『発言したか』は preCount(下駄込み)でなくこちらを見る(正本=speechEvidence.js)。
        speech: speechEvidenceFromCandidate(c)
      });
    }
    return out;
  }

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
  function shouldAssociateAvatarWithUser(input) {
    const uid = String(input?.uid ?? "").trim();
    const av = String(input?.av ?? "").trim();
    if (!uid || !av) return true;
    const broadcasterUid = String(input?.broadcasterUid ?? "").trim();
    const broadcasterIconUrl = String(input?.broadcasterIconUrl ?? "").trim();
    if (!broadcasterUid) return true;
    const avUidFromUrl = extractNiconicoUserIdFromIconUrl(av);
    if (avUidFromUrl && avUidFromUrl === broadcasterUid) {
      return uid === broadcasterUid;
    }
    if (broadcasterIconUrl && isSameAvatarUrl(av, broadcasterIconUrl)) {
      return uid === broadcasterUid;
    }
    return true;
  }

  // src/lib/supportGridDisplayTier.js
  var SUPPORT_GRID_TIER_LINK = "link";
  var SUPPORT_GRID_TIER_KONTA = "konta";
  var SUPPORT_GRID_TIER_TANU = "tanu";
  function demoteNiconicoAnonymousFromKontaTier(userId, tier) {
    if (tier !== SUPPORT_GRID_TIER_KONTA) return tier;
    if (!isNiconicoAnonymousUserId(userId)) return tier;
    return SUPPORT_GRID_TIER_TANU;
  }
  function supportGridPersonalThumbPreferredUrl(userId, httpAvatarCandidate, storedAvatarUrl) {
    const u = String(userId || "").trim();
    const http = String(httpAvatarCandidate ?? "").trim();
    const raw = String(storedAvatarUrl ?? "").trim();
    if (commentEnrichmentAvatarScore(u, raw) >= 2) return raw;
    if (commentEnrichmentAvatarScore(u, http) >= 2) return http;
    return "";
  }
  function supportGridTierHasPersonalThumb(userId, httpAvatarCandidate, storedAvatarUrl) {
    return Boolean(
      supportGridPersonalThumbPreferredUrl(userId, httpAvatarCandidate, storedAvatarUrl)
    );
  }
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
  function bestAvatarScore(uid, httpCandidate, rawAv) {
    const a = commentEnrichmentAvatarScore(uid, rawAv);
    const b = commentEnrichmentAvatarScore(uid, httpCandidate);
    return (
      /** @type {0|1|2} */
      Math.max(a, b)
    );
  }
  function explainSupportGridDisplayTier(p) {
    const uid = String(p?.userId ?? "").trim();
    const nick = String(p?.nickname ?? "").trim();
    const httpCandidate = String(p.httpAvatarCandidate ?? "").trim();
    const rawAv = String(p.storedAvatarUrl ?? "").trim();
    const strongNick = uid ? supportGridStrongNickname(nick, uid) : false;
    const observed = Boolean(p?.avatarObserved);
    let hasThumb = false;
    if (p.lpMockHasCustomAvatar === true) hasThumb = true;
    else if (p.lpMockHasCustomAvatar === false) hasThumb = false;
    else if (uid) {
      hasThumb = supportGridTierHasPersonalThumb(uid, httpCandidate, rawAv);
    }
    const avatarScore = uid ? bestAvatarScore(uid, httpCandidate, rawAv) : 0;
    const hasAnyAvatar = avatarScore >= 1 || observed;
    const storedAvatarScore = uid ? commentEnrichmentAvatarScore(uid, rawAv) : 0;
    const hasObservedAvatar = storedAvatarScore >= 1;
    const isNumericId = /^\d{5,14}$/.test(uid);
    const isAnonymous = isNiconicoAnonymousUserId(uid);
    const TIER_RULES = [
      { tier: SUPPORT_GRID_TIER_LINK, match: (f) => f.observed },
      { tier: SUPPORT_GRID_TIER_LINK, match: (f) => f.strongNick && f.hasThumb },
      { tier: SUPPORT_GRID_TIER_LINK, match: (f) => f.strongNick && f.isNumericId },
      { tier: SUPPORT_GRID_TIER_KONTA, match: (f) => f.strongNick || f.hasThumb },
      { tier: SUPPORT_GRID_TIER_KONTA, match: (f) => f.hasAnyAvatar && !f.isAnonymous },
      { tier: SUPPORT_GRID_TIER_KONTA, match: (f) => f.isNumericId }
    ];
    const flags = { observed, strongNick, hasThumb, hasAnyAvatar, hasObservedAvatar, isNumericId, isAnonymous };
    const tierRaw = !uid ? SUPPORT_GRID_TIER_TANU : TIER_RULES.find((r) => r.match(flags))?.tier ?? SUPPORT_GRID_TIER_TANU;
    const tier = demoteNiconicoAnonymousFromKontaTier(uid, tierRaw);
    const demotedAnonymousKontaToTanu = tierRaw === SUPPORT_GRID_TIER_KONTA && tier === SUPPORT_GRID_TIER_TANU;
    const demotedAnonymousLinkToKonta = false;
    return {
      tier,
      strongNick,
      hasPersonalThumb: hasThumb,
      hasAnyAvatar,
      avatarObserved: observed,
      demotedAnonymousLinkToKonta,
      demotedAnonymousKontaToTanu,
      httpCandidateNonEmpty: Boolean(httpCandidate),
      storedAvatarNonEmpty: Boolean(rawAv)
    };
  }
  function supportGridDisplayTier(p) {
    return explainSupportGridDisplayTier(p).tier;
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
  function formatNicknameWithUidFallback(userId, resolvedNickname) {
    const nick = String(resolvedNickname || "").trim();
    if (nick) return nick;
    const uid = String(userId || "").trim();
    if (!uid) return "";
    if (isNiconicoAnonymousUserId(uid)) return "";
    if (/^\d+$/.test(uid)) return `u/${uid}`;
    return `u/${uid.slice(0, 20)}`;
  }

  // src/lib/userLaneCandidatesFromStorage.js
  function normalizeLv2(v) {
    return normalizeLv(v);
  }
  function rowLiveId(row) {
    const o = (
      /** @type {{ liveId?: unknown, lvId?: unknown }} */
      row
    );
    return String(o?.liveId ?? o?.lvId ?? "").trim();
  }
  function rowCapturedAt(row) {
    const n = Number(
      /** @type {{ capturedAt?: unknown }} */
      row?.capturedAt
    );
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  var NON_SPACE_RE = /\S/;
  function isSortedByCapturedAt(group) {
    for (let i = 1; i < group.length; i++) {
      if (rowCapturedAt(group[i - 1]) > rowCapturedAt(group[i])) return false;
    }
    return true;
  }
  function newestFirstFromChronological(chronological) {
    const out = [];
    let end = chronological.length;
    while (end > 0) {
      const t = rowCapturedAt(chronological[end - 1]);
      let start = end - 1;
      while (start > 0 && rowCapturedAt(chronological[start - 1]) === t) start -= 1;
      for (let i = start; i < end; i++) out.push(chronological[i]);
      end = start;
    }
    return out;
  }
  function userLaneCandidatesFromStorage(storedComments, liveId, opts) {
    const filterByLive = arguments.length >= 2 && liveId != null && String(liveId).trim() !== "";
    const lidNorm = filterByLive ? String(liveId).trim() : "";
    const targetNorm = filterByLive ? normalizeLv2(lidNorm) : "";
    const broadcasterUid = String(opts?.broadcasterUid ?? "").trim();
    const broadcasterIconUrl = String(opts?.broadcasterIconUrl ?? "").trim();
    const broadcasterGuardEnabled = Boolean(broadcasterUid && broadcasterIconUrl);
    const requireText = opts?.requireText === true;
    const allRows = Array.isArray(storedComments) ? storedComments : [];
    const lvNormMemo = /* @__PURE__ */ new Map();
    const normLvMemo = (v) => {
      let n = lvNormMemo.get(v);
      if (n === void 0) {
        n = normalizeLv2(v);
        lvNormMemo.set(v, n);
      }
      return n;
    };
    const rows = [];
    for (const e of allRows) {
      if (filterByLive) {
        const o = (
          /** @type {{ liveId?: unknown, lvId?: unknown }} */
          e
        );
        const a = normLvMemo(o?.liveId);
        const b = a && a === targetNorm ? a : normLvMemo(o?.lvId);
        if (!(Boolean(a) && a === targetNorm || Boolean(b) && b === targetNorm)) continue;
      }
      if (requireText && !NON_SPACE_RE.test(String(
        /** @type {{ text?: unknown }} */
        e?.text ?? ""
      ))) continue;
      rows.push(e);
    }
    const useLidForOutput = filterByLive;
    const byUid = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const uid = String(
        /** @type {{ userId?: unknown }} */
        row?.userId ?? ""
      ).trim();
      if (!uid) continue;
      const g = byUid.get(uid);
      if (g) g.push(row);
      else byUid.set(uid, [row]);
    }
    const built = [];
    for (const [userId, group] of byUid) {
      if (broadcasterUid && userId === broadcasterUid) {
        continue;
      }
      const chronological = isSortedByCapturedAt(group) ? group : [...group].sort((a, b) => rowCapturedAt(a) - rowCapturedAt(b));
      let observed = false;
      const urls = [];
      const isBroadcasterHere = broadcasterGuardEnabled && userId === broadcasterUid;
      const seenUrls = /* @__PURE__ */ new Set();
      for (const g of chronological) {
        if (
          /** @type {{ avatarObserved?: boolean }} */
          g.avatarObserved === true
        ) {
          observed = true;
        }
        const u = String(
          /** @type {{ avatarUrl?: unknown }} */
          g.avatarUrl ?? ""
        ).trim();
        if (!u) continue;
        if (seenUrls.has(u)) continue;
        seenUrls.add(u);
        if (!isAvatarUrlForUserId2(u, userId)) continue;
        if (broadcasterGuardEnabled && !isBroadcasterHere && isSameAvatarUrl(u, broadcasterIconUrl)) {
          continue;
        }
        urls.push(u);
      }
      const avatarUrl = pickStrongestAvatarUrlForUser(userId, urls);
      const newestFirst = newestFirstFromChronological(chronological);
      let nickname = "";
      for (const g of chronological) {
        const n = String(
          /** @type {{ nickname?: unknown }} */
          g.nickname ?? ""
        ).trim();
        if (!n) continue;
        nickname = pickBetterInterceptNickname(userId, nickname, n);
      }
      const lastCapturedAt = chronological.length ? rowCapturedAt(chronological[chronological.length - 1]) : 0;
      const commentCount = chronological.length;
      let giftCount = 0;
      for (const g of chronological) {
        const gg = (
          /** @type {{ isGift?: unknown, gift?: unknown, kind?: unknown }} */
          g
        );
        if (gg.isGift === true || gg.gift != null || gg.kind === "gift") giftCount += 1;
      }
      const outLiveId = useLidForOutput ? lidNorm : rowLiveId(newestFirst[0] || chronological[chronological.length - 1] || {});
      const recentTexts = [];
      for (const g of newestFirst) {
        if (recentTexts.length >= RECENT_TEXT_KEEP) break;
        const t = String(
          /** @type {{ text?: unknown }} */
          g.text ?? ""
        ).replace(/\s+/g, " ").trim();
        if (!t) continue;
        if (recentTexts[recentTexts.length - 1] === t) continue;
        recentTexts.push(t);
      }
      built.push({
        userId,
        nickname,
        avatarUrl,
        avatarObserved: observed,
        liveId: outLiveId,
        commentCount,
        giftCount,
        recentTexts,
        _laneSortAt: lastCapturedAt
      });
    }
    built.sort((a, b) => (b._laneSortAt || 0) - (a._laneSortAt || 0));
    const frozen = Object.freeze(
      built.map(
        (row) => Object.freeze({
          userId: row.userId,
          nickname: row.nickname,
          avatarUrl: row.avatarUrl,
          avatarObserved: row.avatarObserved,
          liveId: row.liveId,
          commentCount: row.commentCount,
          giftCount: row.giftCount,
          // v0.1.1219: ここはフィールドを個別に列挙する造りなので、足し忘れると
          //   上で作った値が黙って消える(実際に踏んだ)。新フィールドは必ずここにも足す。
          recentTexts: Object.freeze(row.recentTexts || []),
          _laneSortAt: row._laneSortAt
        })
      )
    );
    return (
      /** @type {readonly Readonly<UserLaneCandidateFromStorage>[]} */
      frozen
    );
  }

  // src/lib/venueLiveOpenFlag.js
  var KEY_VENUE_LIVE_OPEN = "nls_venue_live_open_v1";
  function buildVenueLiveOpenValue(open, nowMs) {
    const at = Number.isFinite(Number(nowMs)) ? Math.floor(Number(nowMs)) : 0;
    return { open: open === true, at };
  }

  // src/lib/broadcastContext.js
  var KEY_LIVE_BROADCASTER_CTX = "nls_live_broadcaster_ctx_v1";
  function emptyBroadcasterCtx() {
    return { uid: "", iconUrl: "", liveId: "", updatedAt: 0 };
  }
  function normalizeBroadcasterCtx(raw) {
    if (!raw || typeof raw !== "object") return emptyBroadcasterCtx();
    const o = (
      /** @type {Record<string, unknown>} */
      raw
    );
    const updatedAtNum = Number(o.updatedAt);
    return {
      uid: String(o.uid ?? "").trim(),
      iconUrl: String(o.iconUrl ?? "").trim(),
      liveId: String(o.liveId ?? "").trim(),
      updatedAt: Number.isFinite(updatedAtNum) && updatedAtNum > 0 ? updatedAtNum : 0
    };
  }
  function isBroadcasterCtxUsableForGuard(ctx, currentLiveId) {
    if (!ctx || !ctx.uid || !ctx.iconUrl) return false;
    const cur = String(currentLiveId ?? "").trim().toLowerCase();
    const own = String(ctx.liveId ?? "").trim().toLowerCase();
    if (cur && own && cur !== own) return false;
    return true;
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

  // src/lib/comeviewActions.js
  var COMEVIEW_NG_STORAGE_KEY = "nls_comeview_ng_v1";
  var COMEVIEW_NG_MAX = 300;
  function comeviewUserKeyForRow(row) {
    if (!row || typeof row !== "object") return "";
    const uid = String(row.userId || "").trim();
    if (uid) return `u:${uid}`;
    const name = String(row.name || "").trim();
    if (name && !isGenericComeviewName(name)) return `n:${name}`;
    return "";
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

  // src/lib/venueOpenLatency.js
  function createVenueOpenLatencyState() {
    return {
      openedAt: 0,
      mirrorReadyAt: 0,
      aggregateReadyAt: 0,
      firstPaintAt: 0,
      firstSeatAt: 0,
      mirrorTimedOut: false,
      mirrorAbsent: false,
      opens: 0
    };
  }
  function noteVenueOpened(state, nowMs) {
    if (!state || typeof state !== "object") return;
    const now = Number(nowMs) || 0;
    state.openedAt = now;
    state.mirrorReadyAt = 0;
    state.aggregateReadyAt = 0;
    state.firstPaintAt = 0;
    state.firstSeatAt = 0;
    state.mirrorTimedOut = false;
    state.mirrorAbsent = false;
    state.opens += 1;
  }
  function noteVenueMirrorSettled(state, nowMs, outcome) {
    if (!state || typeof state !== "object") return;
    if (!(state.openedAt > 0)) return;
    if (state.mirrorReadyAt > 0) return;
    state.mirrorReadyAt = Number(nowMs) || 0;
    state.mirrorTimedOut = outcome?.timedOut === true;
    state.mirrorAbsent = outcome?.absent === true;
  }
  function noteVenueAggregateSettled(state, nowMs) {
    if (!state || typeof state !== "object") return;
    if (!(state.openedAt > 0)) return;
    if (state.aggregateReadyAt > 0) return;
    state.aggregateReadyAt = Number(nowMs) || 0;
  }
  function noteVenueFirstPaint(state, nowMs, seatCount) {
    if (!state || typeof state !== "object") return;
    if (!(state.openedAt > 0)) return;
    const now = Number(nowMs) || 0;
    if (state.firstPaintAt <= 0) state.firstPaintAt = now;
    const seats = Math.max(0, Math.floor(Number(seatCount) || 0));
    if (seats > 0 && state.firstSeatAt <= 0) state.firstSeatAt = now;
  }
  function elapsed(from, to) {
    if (!(from > 0) || !(to > 0) || to < from) return -1;
    return to - from;
  }
  function summarizeVenueOpenLatency(state) {
    const s = state && typeof state === "object" ? state : createVenueOpenLatencyState();
    const mirrorMs = elapsed(s.openedAt, s.mirrorReadyAt);
    const aggregateMs = elapsed(s.openedAt, s.aggregateReadyAt);
    const firstPaintMs = elapsed(s.openedAt, s.firstPaintAt);
    const firstSeatMs = elapsed(s.openedAt, s.firstSeatAt);
    const opens = Math.max(0, Math.floor(Number(s.opens) || 0));
    if (opens <= 0) {
      return {
        opens: 0,
        mirrorMs: -1,
        aggregateMs: -1,
        firstPaintMs: -1,
        firstSeatMs: -1,
        mirrorTimedOut: false,
        mirrorAbsent: false,
        line: "会場立ち上がり ⚪ 未観測(会場をまだ開いていません)"
      };
    }
    const ms = (v) => v >= 0 ? `${v}ms` : "—";
    const flags = [];
    if (s.mirrorTimedOut) flags.push("鏡タイムアウト");
    if (s.mirrorAbsent) flags.push("鏡なし");
    const seatNote = firstSeatMs >= 0 ? `初席${ms(firstSeatMs)}` : firstPaintMs >= 0 ? "初席—(描画はしたが0人=匿名主体なら仕様)" : "初席—(未描画)";
    return {
      opens,
      mirrorMs,
      aggregateMs,
      firstPaintMs,
      firstSeatMs,
      mirrorTimedOut: s.mirrorTimedOut === true,
      mirrorAbsent: s.mirrorAbsent === true,
      line: `会場立ち上がり 開いた${opens}回 / 鏡${ms(mirrorMs)} / 集計${ms(aggregateMs)} / 初描画${ms(firstPaintMs)} / ${seatNote}` + (flags.length ? ` / ${flags.join("・")}` : "")
    };
  }

  // src/lib/venueIncrementalAggregate.js
  function selectNewChunkSeqs(allSeqs, processedSeqs) {
    const all = Array.isArray(allSeqs) ? allSeqs.map((n) => Math.max(0, Math.floor(Number(n) || 0))) : [];
    const done = new Set(
      Array.isArray(processedSeqs) ? processedSeqs.map((n) => Math.max(0, Math.floor(Number(n) || 0))) : []
    );
    return all.filter((seq) => !done.has(seq)).sort((a, b) => a - b);
  }
  function mergeUserLaneAggregates(existing, incoming) {
    const byUid = /* @__PURE__ */ new Map();
    const ingest = (list) => {
      if (!Array.isArray(list)) return;
      for (const c of list) {
        if (!c || typeof c !== "object") continue;
        const uid = String(c.userId || "").trim();
        if (!uid) continue;
        const prev = byUid.get(uid);
        if (!prev) {
          byUid.set(uid, {
            userId: uid,
            nickname: String(c.nickname || ""),
            avatarUrl: String(c.avatarUrl || ""),
            avatarObserved: Boolean(c.avatarObserved),
            liveId: String(c.liveId || ""),
            commentCount: Math.max(0, Math.floor(Number(c.commentCount) || 0)),
            giftCount: Math.max(0, Math.floor(Number(c.giftCount) || 0)),
            // 2026-10-16(発言の証拠 v3): 本文(直近・新しい順)を持ち回す。以前は落としていたので、チャンク経路の会場はカードに本文が出なかった。
            recentTexts: mergeRecentTexts(c.recentTexts, []),
            _laneSortAt: Math.max(0, Number(c._laneSortAt) || 0)
          });
          continue;
        }
        prev.commentCount = (prev.commentCount || 0) + Math.max(0, Math.floor(Number(c.commentCount) || 0));
        prev.giftCount = (prev.giftCount || 0) + Math.max(0, Math.floor(Number(c.giftCount) || 0));
        prev._laneSortAt = Math.max(prev._laneSortAt || 0, Math.max(0, Number(c._laneSortAt) || 0));
        prev.recentTexts = mergeRecentTexts(c.recentTexts, prev.recentTexts);
        prev.avatarObserved = prev.avatarObserved || Boolean(c.avatarObserved);
        prev.nickname = pickBetterInterceptNickname(uid, prev.nickname, String(c.nickname || ""));
        const stronger = pickStrongestAvatarUrlForUser(uid, [prev.avatarUrl, String(c.avatarUrl || "")]);
        if (stronger) prev.avatarUrl = stronger;
        const nextLid = String(c.liveId || "").trim();
        if (nextLid) prev.liveId = nextLid;
      }
    };
    ingest(existing);
    ingest(incoming);
    const out = Array.from(byUid.values());
    out.sort((a, b) => (b._laneSortAt || 0) - (a._laneSortAt || 0));
    return out;
  }

  // src/lib/venueLiveRoster.js
  var VENUE_ROSTER_VIP_COMMENT_THRESHOLD = 5;
  var VENUE_ROSTER_WINDOW_MS = 4 * 6e4;
  var VENUE_ROSTER_VIP_WINDOW_MS = 15 * 6e4;
  var VENUE_ROSTER_MAX_SEATS = VENUE_FULLSCREEN_MAX_SEATS;
  function isRosterEntryVip(entry) {
    const c = Math.max(0, Math.floor(Number(entry?.commentCount) || 0));
    const g = Math.max(0, Math.floor(Number(entry?.giftCount) || 0));
    return g > 0 || c >= VENUE_ROSTER_VIP_COMMENT_THRESHOLD;
  }
  function touchRoster(roster, row, nowMs, opts = {}) {
    if (!(roster instanceof Map) || !row || typeof row !== "object") return null;
    const userId = String(row.userId ?? "").trim();
    if (!userId) return null;
    const requireText = opts.requireText !== false;
    const text = String(row.text ?? "").trim();
    if (requireText && !text) return null;
    const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
    const isGift = opts.isGift === true;
    const incomingName = String(row.nickname ?? row.name ?? "").trim();
    const incomingAvatar = String(row.avatarUrl ?? "").trim();
    let e = roster.get(userId);
    if (!e) {
      e = {
        userId,
        name: incomingName,
        avatar: incomingAvatar,
        // 2026-08-01(v0.1.1216): 直前の発言本文を保持する。以前はここで text の有無だけを見て
        //   捨てていたため、rosterToVenueRows が text:'' しか出せず、ホバーカードの
        //   本文表示(v0.1.1192実装済み)が**席のある人でも常に空**になっていた。
        //   ★ギフトだけの行(isGift)は発言ではないので本文を持たせない。
        lastText: isGift ? "" : text,
        // v0.1.1218: ホバーカードで直近数件を読めるようにする。storage を読まずに
        //   在席の記録へ持たせる(ホバーのたびに read すると会場が重くなる)。
        recentTexts: isGift ? [] : pushRecentText([], text),
        firstSeen: now,
        lastSeen: now,
        commentCount: 1,
        // 発言の証拠(2026-10-16): 実際に本文のある発言を受けた回数。commentCount は並び/VIP 用の下駄込み(hydrate は最低1)で、発言の根拠にしない。
        realComments: isGift ? 0 : 1,
        // 本文のある発言を最後に受けた時刻(ギフト行では更新しない)。speechEvidenceFromRoster が最終発言時刻として使う。
        lastTextAt: isGift ? 0 : now,
        giftCount: isGift ? 1 : 0,
        vip: false
      };
      e.vip = isRosterEntryVip(e);
      roster.set(userId, e);
      return e;
    }
    e.lastSeen = Math.max(e.lastSeen || 0, now);
    e.commentCount = (e.commentCount || 0) + 1;
    if (!isGift) e.realComments = (Number.isFinite(Number(e.realComments)) ? Number(e.realComments) : 0) + 1;
    if (isGift) e.giftCount = (e.giftCount || 0) + 1;
    if (!isGift && text) {
      e.lastText = text;
      e.lastTextAt = now;
      e.recentTexts = pushRecentText(e.recentTexts, text);
    }
    if (!e.name && incomingName) e.name = incomingName;
    if (incomingAvatar && hasRealThumbnail(incomingAvatar) && !hasRealThumbnail(e.avatar)) {
      e.avatar = incomingAvatar;
    } else if (!e.avatar && incomingAvatar) {
      e.avatar = incomingAvatar;
    }
    e.vip = isRosterEntryVip(e);
    return e;
  }
  function pruneRoster(roster, nowMs, opts = {}) {
    if (!(roster instanceof Map)) return roster;
    const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
    const windowMs = Number.isFinite(opts.windowMs) && opts.windowMs > 0 ? opts.windowMs : VENUE_ROSTER_WINDOW_MS;
    const vipWindowMs = Number.isFinite(opts.vipWindowMs) && opts.vipWindowMs > 0 ? opts.vipWindowMs : VENUE_ROSTER_VIP_WINDOW_MS;
    const maxSeats = Number.isFinite(opts.maxSeats) && opts.maxSeats > 0 ? Math.floor(opts.maxSeats) : VENUE_ROSTER_MAX_SEATS;
    for (const [uid, e] of roster) {
      const win = e.vip ? vipWindowMs : windowMs;
      if (now - (e.lastSeen || 0) > win) roster.delete(uid);
    }
    if (roster.size > maxSeats) {
      const entries = Array.from(roster.values()).sort((a, b) => (a.lastSeen || 0) - (b.lastSeen || 0));
      const order = [
        ...entries.filter((e) => !e.vip),
        ...entries.filter((e) => e.vip)
      ];
      let over = roster.size - maxSeats;
      for (const e of order) {
        if (over <= 0) break;
        roster.delete(e.userId);
        over -= 1;
      }
    }
    return roster;
  }
  function rosterToVenueRows(roster) {
    if (!(roster instanceof Map)) return [];
    const out = [];
    for (const e of roster.values()) {
      const giftCount = Math.max(0, Math.floor(Number(e.giftCount) || 0));
      out.push({
        userId: e.userId,
        name: String(e.name || ""),
        avatar: String(e.avatar || ""),
        // 2026-08-01(v0.1.1216): 直前の発言本文。collectVenueParticipants がこの text を
        //   lastText に載せ(venueSeats.js:166)、ホバーカードが表示する(v0.1.1192実装済み)。
        //   以前は '' 固定だったため、席のある人でもカードに本文が出ていなかった。
        text: String(e.lastText || ""),
        // v0.1.1218: 直近数件。collectVenueParticipants → ホバーカードへ運ぶ。
        recentTexts: Array.isArray(e.recentTexts) ? e.recentTexts.slice() : [],
        capturedAt: Math.max(0, Number(e.lastSeen) || 0),
        preCount: Math.max(1, Math.floor(Number(e.commentCount) || 0) || 1),
        preHasGift: giftCount > 0,
        preGiftCount: giftCount,
        speech: speechEvidenceFromRoster(e)
        // 発言の証拠(2026-10-16)
      });
    }
    out.sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0));
    return out;
  }
  function hydrateRosterFromCandidates(roster, candidates, opts = {}) {
    if (!(roster instanceof Map) || !Array.isArray(candidates)) return roster;
    for (const c of candidates) {
      if (!c || typeof c !== "object") continue;
      const userId = String(c.userId ?? "").trim();
      if (!userId) continue;
      if (roster.has(userId)) continue;
      const lastSeen = Math.max(0, Number(c._laneSortAt) || 0);
      const e = {
        userId,
        name: String(c.nickname ?? "").trim(),
        avatar: String(c.avatarUrl ?? "").trim(),
        // 候補(storage シード)は本文を持たないので空。以後ライブで発言が届いたときに
        //   touchRoster が埋める=「開いた直後は空欄・喋ったら出る」という自然な挙動になる。
        // 2026-10-16(発言の証拠 v4): 候補が持つ本文(直近・新しい順)を読む。以前は『候補は本文を持たない』と決めつけて空にしていた(実際は userLaneCandidatesFromStorage が最大5件持つ)。
        lastText: mergeRecentTexts(c.recentTexts, [], 1)[0] || "",
        recentTexts: mergeRecentTexts(c.recentTexts, []),
        lastTextAt: mergeRecentTexts(c.recentTexts, [], 1).length > 0 ? lastSeen : 0,
        firstSeen: lastSeen,
        lastSeen,
        commentCount: Math.max(1, Math.floor(Number(c.commentCount) || 0) || 1),
        // 候補の【実数】(0 も有効な答え・不明は null)。下の commentCount の下駄(最低1)を発言の証拠に化けさせない。
        realComments: Number.isFinite(Number(c.commentCount)) ? Math.max(0, Math.floor(Number(c.commentCount))) : null,
        giftCount: Math.max(0, Math.floor(Number(c.giftCount) || 0)),
        vip: false
      };
      e.vip = isRosterEntryVip(e);
      roster.set(userId, e);
    }
    const maxSeats = Number.isFinite(opts.maxSeats) && opts.maxSeats > 0 ? Math.floor(opts.maxSeats) : VENUE_ROSTER_MAX_SEATS;
    if (roster.size > maxSeats) {
      const order = Array.from(roster.values()).sort((a, b) => (a.lastSeen || 0) - (b.lastSeen || 0));
      let over = roster.size - maxSeats;
      for (const e of order) {
        if (over <= 0) break;
        if (e.vip) continue;
        roster.delete(e.userId);
        over -= 1;
      }
    }
    return roster;
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
  function isNumericNicoUserId(userId) {
    return !isAnonymousStyleNicoUserId2(userId);
  }

  // src/lib/venuePresenceNote.js
  var VENUE_PRESENCE_QUIET_MS = 5 * 6e4;
  var VENUE_PRESENCE_LONG_QUIET_MS = 30 * 6e4;
  function buildVenuePresenceNote(input) {
    const i = input && typeof input === "object" ? input : {};
    const explicitlyUnknown = i.count === null || i.giftCount === null;
    const knowsCount = i.count !== null && i.count !== void 0;
    const knowsGift = i.giftCount !== null && i.giftCount !== void 0;
    const count = knowsCount ? Math.max(0, Math.floor(Number(i.count) || 0)) : null;
    const giftCount = knowsGift ? Math.max(0, Math.floor(Number(i.giftCount) || 0)) : null;
    const venueRank = Math.max(0, Math.floor(Number(i.venueRank) || 0));
    const lastAt = Number(i.lastAt);
    const nowMs = Number(i.nowMs);
    const hasTime = Number.isFinite(lastAt) && lastAt > 0 && Number.isFinite(nowMs) && nowMs > 0;
    const sinceLast = hasTime ? Math.max(0, nowMs - lastAt) : -1;
    const knowsSomething = knowsCount || knowsGift;
    const nothingHappened = (count || 0) <= 0 && (giftCount || 0) <= 0;
    if (knowsSomething && nothingHappened) return "";
    if (!knowsSomething && !explicitlyUnknown) return "";
    const parts = [];
    if (sinceLast >= 0) {
      if (sinceLast < 6e4) parts.push("いま喋っている");
      else if (sinceLast < VENUE_PRESENCE_QUIET_MS) parts.push("さっきまで喋っていた");
      else if (sinceLast < VENUE_PRESENCE_LONG_QUIET_MS) parts.push("いまは聞いている");
    }
    if (count === 1) parts.push("ここで1回");
    else if (count !== null && count > 0) parts.push(`ここまで${count}回`);
    if (giftCount === 1) parts.push("ギフトを贈った");
    else if (giftCount !== null && giftCount > 1) parts.push(`ギフトを${giftCount}回`);
    if (venueRank === 1) parts.push("いちばん多い");
    else if (venueRank === 2 || venueRank === 3) parts.push(`${venueRank}番目に多い`);
    if (parts.length === 0) return explicitlyUnknown ? "会場に居る" : "";
    return parts.join("・");
  }

  // src/lib/venueHoverCard.js
  function readVenueTileThumbState(cellEl) {
    const img = cellEl && typeof cellEl.querySelector === "function" ? cellEl.querySelector(".nl-story-userlane-avatar") : null;
    if (!img) return { src: "", kind: "none", load: "loading" };
    const src = String(img.src || "");
    let kind = (
      /** @type {VenueTileThumbState['kind']} */
      "none"
    );
    if (img.classList && img.classList.contains("nl-avatar--tv-fallback")) {
      kind = "tv-fallback";
    } else if (src.startsWith("data:image/svg+xml")) {
      kind = "identicon";
    } else if (/^https?:/i.test(src)) {
      kind = "real-http";
    }
    let load = (
      /** @type {VenueTileThumbState['load']} */
      "ok"
    );
    if (!img.complete) {
      load = "loading";
    } else if (Number(img.naturalWidth) === 0) {
      load = "failed";
    }
    return { src, kind, load };
  }
  function formatVenueHoverRelativeTime(lastAt, nowMs) {
    const a = Number(lastAt);
    const n = Number(nowMs);
    if (!Number.isFinite(a) || a <= 0 || !Number.isFinite(n) || n <= 0) return "";
    const d = n - a;
    if (d < 6e4) return "たった今";
    if (d < 36e5) return `${Math.floor(d / 6e4)}分前`;
    if (d < 864e5) return `${Math.floor(d / 36e5)}時間前`;
    if (d < 30 * 864e5) return `${Math.floor(d / 864e5)}日前`;
    return "";
  }
  function resolveThumbStatusLabel(kind, load) {
    if (load === "loading") return "読み込み中";
    if (load === "failed") return "読み込み失敗(白丸)";
    if (kind === "identicon") return "代替顔(identicon)";
    if (kind === "tv-fallback") return "公式デフォルト";
    if (kind === "real-http") return "実サムネ";
    return "不明";
  }
  var HOVER_LAST_TEXT_MAX = 60;
  function buildVenueHoverCardModel(input) {
    const i = input && typeof input === "object" ? input : {};
    const uid = String(i.uid || "").trim();
    const displayName = String(i.displayName || "").trim();
    const knowsCount = i.count !== null && i.count !== void 0;
    const count = knowsCount ? Math.max(0, Math.floor(Number(i.count) || 0)) : null;
    const hasGift = i.hasGift === true;
    const knowsGift = i.giftCount !== null && i.giftCount !== void 0;
    const giftCount = knowsGift ? Math.max(0, Math.floor(Number(i.giftCount) || 0)) : null;
    const venueRank = Math.max(0, Math.floor(Number(i.venueRank) || 0));
    const thumb = i.thumb && typeof i.thumb === "object" ? i.thumb : {};
    const thumbSrc = String(thumb.src || "");
    const thumbKind = (
      /** @type {VenueTileThumbState['kind']} */
      thumb.kind || "none"
    );
    const thumbLoad = (
      /** @type {VenueTileThumbState['load']} */
      thumb.load || "loading"
    );
    const diagMode = i.diagMode === true;
    let idKind = (
      /** @type {VenueHoverCardModel['idKind']} */
      "none"
    );
    let idLine = "";
    if (uid) {
      if (isNumericNicoUserId(uid)) {
        idKind = "registered";
        idLine = `ID:${uid}(本登録)`;
      } else {
        idKind = "anonymous";
        idLine = anonymousDisplayLabel(uid);
      }
    }
    const avatarSrc = thumbKind === "real-http" && thumbLoad !== "ok" ? "" : thumbSrc;
    const sp = SPEECH_EVIDENCE_GATE_ENABLED && i.speech && typeof i.speech === "object" ? speechEvidence(i.speech) : null;
    const spoke = sp ? hasSpeech(sp) : false;
    const relTime = formatVenueHoverRelativeTime(sp ? sp.lastAt : i.lastAt, i.nowMs);
    const statParts = [];
    const tier = String(i.tier || "").trim();
    if (sp) {
      if (spoke) {
        const n = sp.comments;
        statParts.push(n !== null && n > 0 ? relTime ? `発言 ${n}(${relTime})` : `発言 ${n}` : relTime ? `発言あり(${relTime})` : "発言あり");
      } else {
        statParts.push(tier === "ad" ? "広告" : tier === "gift" ? "ギフト" : "会場に居る");
      }
    } else if (tier === "ad") {
      statParts.push(relTime ? `広告(${relTime})` : "広告");
    } else if (tier === "gift") {
      statParts.push(relTime ? `ギフト(${relTime})` : "ギフト");
    } else if (count === null) {
      statParts.push(relTime ? `会場に居る(${relTime})` : "会場に居る");
    } else {
      statParts.push(relTime ? `発言 ${count}(${relTime})` : `発言 ${count}`);
    }
    if (hasGift && giftCount !== null && giftCount > 0) statParts.push(`🎁${giftCount}`);
    else if (hasGift && giftCount === null) statParts.push("🎁");
    if (venueRank === 1) statParts.push("🥇1位");
    else if (venueRank === 2) statParts.push("🥈2位");
    else if (venueRank === 3) statParts.push("🥉3位");
    const isThrowTier = !sp && (tier === "ad" || tier === "gift");
    const rawLastText = String(sp ? sp.texts[0] || "" : i.lastText || "").replace(/\s+/g, " ").trim();
    const lastText = isThrowTier || !rawLastText ? "" : rawLastText.length > HOVER_LAST_TEXT_MAX ? `${rawLastText.slice(0, HOVER_LAST_TEXT_MAX)}…` : rawLastText;
    return {
      displayName,
      idLine,
      idKind,
      avatarSrc,
      statLine: statParts.join(" ・ "),
      /*
       * ★「この人はここでどうしていたか」の一言（2026-08-29）。
       *   statLine が数字の羅列(発言42 ・ 🎁3 ・ 🥇1位)なのに対し、
       *   こちらは読んだままで分かる文にする。
       *   ★判定は venuePresenceNote.js が正本。ここは渡すだけ。
       *   ★追加の storage 読みはゼロ（既に手元にある値だけで作る）。
       */
      presenceNote: buildVenuePresenceNote({
        // 証拠が無い人は数を『知らない(null)』・時刻なしで渡す=『いま喋っている』『ここでN回』を言わず、居ることだけ言う。
        count: sp ? spoke ? sp.comments : null : count,
        giftCount,
        venueRank,
        lastAt: sp ? spoke ? sp.lastAt : 0 : i.lastAt,
        nowMs: i.nowMs
      }),
      lastText,
      // v0.1.1218(ユーザー要望): ホバーだけでその人の発言を数件読めるようにする。
      //   既存データ(在席の記録)から来るので storage の追加読みはゼロ。
      //   投擲段(広告/ギフト)は発言由来ではないので出さない=lastText と同じ扱い。
      recentTexts: isThrowTier ? [] : formatRecentTexts(sp ? sp.texts : i.recentTexts, { max: RECENT_TEXT_KEEP, maxChars: HOVER_LAST_TEXT_MAX }),
      thumbStatusLabel: diagMode ? resolveThumbStatusLabel(thumbKind, thumbLoad) : "",
      thumbKind,
      thumbLoad
    };
  }
  function createVenueHoverCardEl(doc) {
    const card = doc.createElement("div");
    card.className = "nlsb-hover-card";
    card.setAttribute("aria-hidden", "true");
    const avatarBox = doc.createElement("div");
    avatarBox.className = "nlsb-hover-card__avatar-box";
    const avatarImg = doc.createElement("img");
    avatarImg.className = "nlsb-hover-card__avatar";
    avatarImg.alt = "";
    avatarImg.decoding = "async";
    avatarImg.addEventListener("error", () => {
      avatarImg.hidden = true;
    });
    avatarBox.appendChild(avatarImg);
    const body = doc.createElement("div");
    body.className = "nlsb-hover-card__body";
    const nameEl = doc.createElement("div");
    nameEl.className = "nlsb-hover-card__name";
    const idEl = doc.createElement("div");
    idEl.className = "nlsb-hover-card__id";
    const statsEl = doc.createElement("div");
    statsEl.className = "nlsb-hover-card__stats";
    const presenceEl = doc.createElement("div");
    presenceEl.className = "nlsb-hover-card__presence";
    const thumbStatusEl = doc.createElement("div");
    thumbStatusEl.className = "nlsb-hover-card__thumb-status";
    const lastTextEl = doc.createElement("div");
    lastTextEl.className = "nlsb-hover-card__last-text";
    body.append(nameEl, statsEl, presenceEl, lastTextEl, idEl, thumbStatusEl);
    card.append(avatarBox, body);
    return card;
  }
  function renderVenueHoverCard(cardEl, model) {
    if (!cardEl || typeof cardEl.querySelector !== "function") return;
    const m = model && typeof model === "object" ? model : {};
    const avatarImg = cardEl.querySelector(".nlsb-hover-card__avatar");
    if (avatarImg) {
      const src = String(m.avatarSrc || "");
      avatarImg.hidden = !src;
      if (src) avatarImg.src = src;
    }
    const nameEl = cardEl.querySelector(".nlsb-hover-card__name");
    if (nameEl) nameEl.textContent = String(m.displayName || "");
    const idEl = cardEl.querySelector(".nlsb-hover-card__id");
    if (idEl) idEl.textContent = String(m.idLine || "");
    const statsEl = cardEl.querySelector(".nlsb-hover-card__stats");
    if (statsEl) statsEl.textContent = String(m.statLine || "");
    const presenceEl = cardEl.querySelector(".nlsb-hover-card__presence");
    if (presenceEl) {
      const note = String(m.presenceNote || "");
      presenceEl.textContent = note;
      presenceEl.hidden = !note;
    }
    const lastTextEl = cardEl.querySelector(".nlsb-hover-card__last-text");
    if (lastTextEl) {
      const list = Array.isArray(m.recentTexts) ? m.recentTexts.filter(Boolean) : [];
      const rows = list.length ? list : [String(m.lastText || "")].filter(Boolean);
      lastTextEl.textContent = "";
      for (const t of rows) {
        const line = cardEl.ownerDocument.createElement("div");
        line.className = "nlsb-hover-card__speech";
        line.textContent = `「${t}」`;
        lastTextEl.appendChild(line);
      }
      lastTextEl.hidden = rows.length === 0;
    }
    const thumbStatusEl = cardEl.querySelector(".nlsb-hover-card__thumb-status");
    if (thumbStatusEl) {
      const label = String(m.thumbStatusLabel || "");
      thumbStatusEl.textContent = label;
      thumbStatusEl.hidden = !label;
    }
    cardEl.dataset.thumbKind = String(m.thumbKind || "");
    cardEl.dataset.thumbLoad = String(m.thumbLoad || "");
  }
  var VENUE_HOVER_CARD_MARGIN = 8;
  var VENUE_HOVER_CARD_GAP = 6;
  function resolveVenueHoverCardPlacement(a) {
    const input = a && typeof a === "object" ? a : {};
    const anchor = input.anchor && typeof input.anchor === "object" ? input.anchor : {};
    const card = input.card && typeof input.card === "object" ? input.card : {};
    const viewport = input.viewport && typeof input.viewport === "object" ? input.viewport : {};
    const anchorLeft = Number.isFinite(Number(anchor.left)) ? Number(anchor.left) : 0;
    const anchorTop = Number.isFinite(Number(anchor.top)) ? Number(anchor.top) : 0;
    const anchorWidth = Number.isFinite(Number(anchor.width)) ? Number(anchor.width) : 0;
    const anchorHeight = Number.isFinite(Number(anchor.height)) ? Number(anchor.height) : 0;
    const cardWidth = Number.isFinite(Number(card.width)) ? Number(card.width) : 0;
    const cardHeight = Number.isFinite(Number(card.height)) ? Number(card.height) : 0;
    const viewportWidth = Number.isFinite(Number(viewport.width)) && Number(viewport.width) > 0 ? Number(viewport.width) : 1280;
    const viewportHeight = Number.isFinite(Number(viewport.height)) && Number(viewport.height) > 0 ? Number(viewport.height) : 800;
    const margin = Number.isFinite(Number(input.margin)) ? Number(input.margin) : VENUE_HOVER_CARD_MARGIN;
    const gap = Number.isFinite(Number(input.gap)) ? Number(input.gap) : VENUE_HOVER_CARD_GAP;
    const anchorCenterX = anchorLeft + anchorWidth / 2;
    let left = anchorCenterX - cardWidth / 2;
    left = Math.max(margin, Math.min(left, viewportWidth - cardWidth - margin));
    const spaceAbove = anchorTop - gap;
    const fitsAbove = spaceAbove >= cardHeight + margin;
    let top;
    let placement;
    if (fitsAbove) {
      placement = "above";
      top = anchorTop - gap - cardHeight;
    } else {
      placement = "below";
      top = anchorTop + anchorHeight + gap;
    }
    top = Math.max(margin, Math.min(top, viewportHeight - cardHeight - margin));
    return { left, top, placement };
  }

  // src/lib/venueDisplayRows.js
  function resolveDisplayRows(incoming, lastGood) {
    const inRows = Array.isArray(incoming) ? incoming : [];
    const prev = Array.isArray(lastGood) ? lastGood : [];
    if (inRows.length > 0) {
      return { rows: inRows, nextLastGood: inRows, usedFallback: false };
    }
    if (prev.length > 0) {
      return { rows: prev, nextLastGood: prev, usedFallback: true };
    }
    return { rows: [], nextLastGood: [], usedFallback: false };
  }

  // src/lib/venueEntryQueue.js
  var VENUE_ENTRY_MAX_CONCURRENT = 6;
  var VENUE_ENTRY_MAX_PER_SEC = 8;
  var VENUE_ENTRY_QUEUE_LIMIT = 24;
  var VENUE_ENTRY_FLIGHT_MS = 900;
  function createVenueEntryQueue(nowFn = Date.now) {
    let known = /* @__PURE__ */ new Set();
    let inFlight = /* @__PURE__ */ new Set();
    let queue = [];
    let recentFires = [];
    let currentLiveId = "";
    let sawFirstPaint = false;
    const normalizeKeys = (keys) => {
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      if (!Array.isArray(keys)) return out;
      for (const raw of keys) {
        const k = String(raw || "").trim();
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push(k);
      }
      return out;
    };
    const resetAll = (lid) => {
      known = /* @__PURE__ */ new Set();
      inFlight = /* @__PURE__ */ new Set();
      queue = [];
      recentFires = [];
      currentLiveId = lid;
      sawFirstPaint = false;
    };
    return {
      tick({ keys, liveId, nowMs }) {
        const now = Number.isFinite(nowMs) ? Number(nowMs) : nowFn();
        const lid = String(liveId || "").trim().toLowerCase();
        const list = normalizeKeys(keys);
        const isFirst = !sawFirstPaint;
        const isLiveChanged = !isFirst && lid !== currentLiveId;
        if (isFirst || isLiveChanged) {
          resetAll(lid);
          known = new Set(list);
          sawFirstPaint = true;
          return {
            fly: [],
            seat: list.slice(),
            suppressedReason: isFirst ? "first_paint" : "live_changed"
          };
        }
        const fresh = list.filter((k) => !known.has(k));
        for (const k of list) known.add(k);
        const alive = new Set(list);
        const queued = new Set(queue);
        for (const k of Array.from(known)) {
          if (!alive.has(k) && !inFlight.has(k) && !queued.has(k)) known.delete(k);
        }
        const seat = [];
        for (const k of fresh) {
          if (queue.length >= VENUE_ENTRY_QUEUE_LIMIT) seat.push(k);
          else queue.push(k);
        }
        if (!fresh.length && !queue.length) {
          return { fly: [], seat: [], suppressedReason: "" };
        }
        recentFires = recentFires.filter((t) => now - t < 1e3);
        const fly = [];
        while (queue.length && inFlight.size < VENUE_ENTRY_MAX_CONCURRENT && recentFires.length < VENUE_ENTRY_MAX_PER_SEC) {
          const k = queue.shift();
          if (!k) break;
          inFlight.add(k);
          recentFires.push(now);
          fly.push(k);
        }
        return { fly, seat, suppressedReason: "" };
      },
      onFlightDone(key) {
        const k = String(key || "").trim();
        if (k) inFlight.delete(k);
      },
      stats() {
        return {
          known: known.size,
          inFlight: inFlight.size,
          queued: queue.length,
          liveId: currentLiveId
        };
      }
    };
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

  // src/lib/celebrationCharaAssets.js
  var CHARA_IMG_BASE = "images/yukkuri-charactore-english";
  var RINKU_IMGS = Object.freeze({
    default: `${CHARA_IMG_BASE}/link/link-yukkuri-smile-mouth-open.png`,
    small: `${CHARA_IMG_BASE}/link/link-yukkuri-smile-mouth-closed.png`,
    medium: `${CHARA_IMG_BASE}/link/link-yukkuri-smile-mouth-open.png`,
    big: `${CHARA_IMG_BASE}/link/link-yukkuri-blink-mouth-open.png`
  });
  var KONTA_IMGS = Object.freeze({
    default: `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-smile-mouth-open.png`,
    small: `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-smile-mouth-closed.png`,
    medium: `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-smile-mouth-open.png`,
    big: `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-blink-mouth-open.png`
  });
  var TANUNEE_IMGS = Object.freeze({
    default: `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-smile-mouth-open.png`,
    small: `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-normal-mouth-open.png`,
    medium: `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-smile-mouth-open.png`,
    big: `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-blink-mouth-open.png`
  });
  var DELUGE_CHAR_POOLS = Object.freeze([
    [
      `${CHARA_IMG_BASE}/link/link-yukkuri-smile-mouth-open.thumb128.png`,
      `${CHARA_IMG_BASE}/link/link-yukkuri-normal-mouth-closed.thumb128.png`,
      `${CHARA_IMG_BASE}/link/link-yukkuri-blink-mouth-closed.thumb128.png`,
      `${CHARA_IMG_BASE}/link/link-yukkuri-half-eyes-mouth-closed.thumb128.png`
    ],
    [
      `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-smile-mouth-open.thumb128.png`,
      `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-normal.thumb128.png`,
      `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-blink-mouth-closed.thumb128.png`,
      `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-half-eyes-mouth-closed.thumb128.png`
    ],
    [
      `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-smile-mouth-open.thumb128.png`,
      `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-normal-mouth-open.thumb128.png`,
      `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-blink-mouth-closed.thumb128.png`,
      `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-half-eyes-mouth-closed.thumb128.png`
    ]
  ]);

  // src/lib/venueResidents.js
  var VENUE_RESIDENT_IDS = Object.freeze(["rinku", "konta", "tanunee"]);
  var RESIDENT_DEFS = Object.freeze([
    Object.freeze({ id: "rinku", name: "りんく", rel: RINKU_IMGS.default }),
    Object.freeze({ id: "konta", name: "こん太", rel: KONTA_IMGS.default }),
    Object.freeze({ id: "tanunee", name: "たぬ姉", rel: TANUNEE_IMGS.default })
  ]);
  function buildVenueResidents(resolveUrl) {
    const resolve = typeof resolveUrl === "function" ? resolveUrl : (
      /** @param {string} rel */
      (rel3) => rel3
    );
    return RESIDENT_DEFS.map((def) => ({
      id: def.id,
      name: def.name,
      imgSrc: resolve(def.rel)
    }));
  }

  // src/lib/storageKeys.js
  function commentDbSummaryKey(liveId) {
    const id = String(liveId || "").trim().toLowerCase();
    return `nls_cdb_summary_${id}`;
  }
  var KEY_USER_COMMENT_PROFILE_CACHE = "nls_user_comment_profile_v1";
  var KEY_COMMENTER_FOLLOW_CACHE = "nls_commenter_follow_v1";
  var KEY_COMMENTER_FOLLOWING_LIST_CACHE = "nls_commenter_following_list_v1";
  var EXTENSION_SOFT_CACHE_STORAGE_KEYS = Object.freeze([
    KEY_USER_COMMENT_PROFILE_CACHE,
    KEY_COMMENTER_FOLLOW_CACHE,
    KEY_COMMENTER_FOLLOWING_LIST_CACHE
  ]);
  var KEY_EFFECT_SOUND_ENABLED = "nls_effect_sound_enabled_v1";
  function isEffectSoundEnabled(raw) {
    return raw !== false;
  }
  var KEY_VENUE_EFFECT_SOUND_PRESENCE = "nls_venue_effect_sound_presence_v1";
  var KEY_CUSTOM_SOUND_REV = "nls_custom_sound_rev_v1";
  function commentsStorageKey(liveId) {
    const id = String(liveId || "").trim().toLowerCase();
    return `nls_comments_${id}`;
  }
  function officialGiftPointsAggregateStorageKey(liveId) {
    const id = String(liveId || "").trim().toLowerCase();
    return `nls_official_gift_points_${id}`;
  }
  function giftSubAppHistoryStorageKey(liveId) {
    const id = String(liveId || "").trim().toLowerCase();
    return `nls_gift_subapp_history_${id}`;
  }

  // src/lib/effectSoundPlayer.js
  var EFFECT_SOUND_KINDS = Object.freeze({
    GIFT: "gift",
    AD: "ad",
    RANK_UP: "rank_up",
    RANK_DOWN: "rank_down",
    // v0.1.1054: コメント数マイルストーン(パチンコ演出)。節目の大きさで3段階(Fable設計)。
    MILESTONE_SOFT: "milestone_soft",
    // 100/200件
    MILESTONE_HARD: "milestone_hard",
    // 500件
    MILESTONE_JACKPOT: "milestone_jackpot"
    // 1000件以上(大当たり)
  });
  var EFFECT_SOUND_PATHS = Object.freeze({
    [EFFECT_SOUND_KINDS.GIFT]: "sound/effect-gift.mp3",
    [EFFECT_SOUND_KINDS.AD]: "sound/effect-ad.mp3",
    [EFFECT_SOUND_KINDS.RANK_UP]: "sound/effect-rank-up.mp3",
    [EFFECT_SOUND_KINDS.RANK_DOWN]: "sound/effect-rank-down.mp3",
    [EFFECT_SOUND_KINDS.MILESTONE_SOFT]: "sound/effect-milestone-soft.mp3",
    [EFFECT_SOUND_KINDS.MILESTONE_HARD]: "sound/effect-milestone-hard.mp3",
    [EFFECT_SOUND_KINDS.MILESTONE_JACKPOT]: "sound/effect-milestone-jackpot.mp3"
  });
  var EFFECT_SOUND_VARIANT_PATHS = Object.freeze({
    [EFFECT_SOUND_KINDS.MILESTONE_SOFT]: Object.freeze([
      "sound/tiers/milestone-soft-1.mp3",
      "sound/tiers/milestone-soft-2.mp3",
      "sound/tiers/milestone-soft-3.mp3"
    ]),
    [EFFECT_SOUND_KINDS.MILESTONE_HARD]: Object.freeze([
      "sound/tiers/milestone-hard-1.mp3",
      "sound/tiers/milestone-hard-2.mp3",
      "sound/tiers/milestone-hard-3.mp3"
    ]),
    [EFFECT_SOUND_KINDS.MILESTONE_JACKPOT]: Object.freeze([
      "sound/tiers/milestone-jackpot-1.mp3",
      "sound/tiers/milestone-jackpot-2.mp3",
      "sound/tiers/milestone-jackpot-3.mp3"
    ]),
    // v0.1.1059: ギフト金額帯別バリエーション(既存の単一 gift 種別とは別に、point 帯を
    //   意識する呼び出し元が使える追加の種類。giftThrowProjectile.js の tier(small/medium/large/mega)
    //   と対応させる想定・呼び出し元の配線は別実装で行う)。
    gift_small: Object.freeze(["sound/tiers/gift-small-1.mp3", "sound/tiers/gift-small-2.mp3", "sound/tiers/gift-small-3.mp3"]),
    gift_medium: Object.freeze(["sound/tiers/gift-medium-1.mp3", "sound/tiers/gift-medium-2.mp3", "sound/tiers/gift-medium-3.mp3"]),
    gift_large: Object.freeze(["sound/tiers/gift-large-1.mp3", "sound/tiers/gift-large-2.mp3", "sound/tiers/gift-large-3.mp3"]),
    gift_mega: Object.freeze(["sound/tiers/gift-mega-1.mp3", "sound/tiers/gift-mega-2.mp3", "sound/tiers/gift-mega-3.mp3"]),
    // 2026-07-16: ad/rank_upは効果音ラボ(soundeffect-lab.info・商用利用無料/クレジット表記不要/
    //   「アプリの操作音として組み込む」用途を明示許可)の専用素材へ差し替え(sound-src/SOURCES.md
    //   参照)。ad=可愛く輝く(控えめな通知)・rank_up=シャキーン(短い上昇感)。
    [EFFECT_SOUND_KINDS.AD]: Object.freeze(["sound/tiers/ad-1.mp3", "sound/tiers/ad-2.mp3", "sound/tiers/ad-3.mp3"]),
    [EFFECT_SOUND_KINDS.RANK_UP]: Object.freeze(["sound/tiers/rank-up-1.mp3", "sound/tiers/rank-up-2.mp3", "sound/tiers/rank-up-3.mp3"]),
    // rank_downは価値序列上ad/rank_upより控えめであるべきため、引き続きgift-small(自作合成音)を使う。
    [EFFECT_SOUND_KINDS.RANK_DOWN]: Object.freeze(["sound/tiers/gift-small-1.mp3", "sound/tiers/gift-small-2.mp3", "sound/tiers/gift-small-3.mp3"])
  });
  function effectSoundKindForGiftTier(tier) {
    switch (tier) {
      case "small":
        return "gift_small";
      case "medium":
        return "gift_medium";
      case "large":
        return "gift_large";
      case "mega":
        return "gift_mega";
      default:
        return EFFECT_SOUND_KINDS.GIFT;
    }
  }
  function resolveEffectSoundPath(kind, deps = {}) {
    const variantPaths = (
      /** @type {Record<string, ReadonlyArray<string>>} */
      deps.variantPaths || EFFECT_SOUND_VARIANT_PATHS
    );
    const variants = variantPaths[String(kind)];
    if (Array.isArray(variants) && variants.length > 0) {
      const rng = typeof deps.rng === "function" ? deps.rng : Math.random;
      const idx = Math.floor(rng() * variants.length) % variants.length;
      return variants[idx];
    }
    const paths = (
      /** @type {Record<string, string>} */
      deps.paths || EFFECT_SOUND_PATHS
    );
    return paths[String(kind)];
  }
  var EFFECT_SOUND_GUARD_MS = 600;
  var EFFECT_SOUND_DEFAULT_VOLUME = 0.7;
  function defaultVolumeForEffectSoundKind(kind) {
    return String(kind || "").startsWith("gift") ? 1 : EFFECT_SOUND_DEFAULT_VOLUME;
  }
  function shouldPlayEffectSound(lastAtMs, nowMs, guardMs = EFFECT_SOUND_GUARD_MS) {
    const last = Number(lastAtMs) || 0;
    const now = Number(nowMs) || 0;
    return now - last >= guardMs;
  }
  var _lastPlayedAt = /* @__PURE__ */ Object.create(null);
  var _audioCache = /* @__PURE__ */ new Map();
  var AUDIO_CACHE_MAX = 48;
  function cachedAudioFactory(url) {
    const cached = _audioCache.get(url);
    if (cached) {
      try {
        cached.currentTime = 0;
      } catch {
      }
      return cached;
    }
    const audio = new Audio(url);
    if (_audioCache.size < AUDIO_CACHE_MAX) _audioCache.set(url, audio);
    return audio;
  }
  function playEffectSound(kind, deps = {}) {
    try {
      const path = resolveEffectSoundPath(kind, deps);
      if (!path) return "no-path";
      const nowMs = typeof deps.nowMs === "number" ? deps.nowMs : Date.now();
      const guardMs = typeof deps.guardMs === "number" ? deps.guardMs : EFFECT_SOUND_GUARD_MS;
      if (!shouldPlayEffectSound(_lastPlayedAt[kind] || 0, nowMs, guardMs)) return "guarded";
      _lastPlayedAt[kind] = nowMs;
      const getUrl = deps.getUrl || ((p2) => typeof chrome !== "undefined" && chrome.runtime?.getURL ? chrome.runtime.getURL(p2) : p2);
      const audioFactory = deps.audioFactory || cachedAudioFactory;
      const volume = typeof deps.volume === "number" ? Math.max(0, Math.min(1, deps.volume)) : defaultVolumeForEffectSoundKind(kind);
      const audio = audioFactory(getUrl(path));
      if (audio && typeof audio.volume === "number") audio.volume = volume;
      const p = audio.play && audio.play();
      if (p && typeof p.catch === "function") p.catch(() => {
      });
      return "played";
    } catch {
      return "error";
    }
  }

  // src/lib/effectDirector.js
  var COMBO_WINDOW_MS = 3e4;
  var MILESTONE_TIER_LADDER = Object.freeze([
    "milestone_soft",
    "milestone_hard",
    "milestone_jackpot"
  ]);
  var GIFT_TIER_LADDER = Object.freeze([
    "gift_small",
    "gift_medium",
    "gift_large",
    "gift_mega"
  ]);
  function makeInitialComboState() {
    return { lastHitAt: 0, comboCount: 0, kind: "", promotedSteps: 0 };
  }
  function directHit(prev, baseKind, nowMs, opts = {}) {
    const ladder = Array.isArray(opts.ladder) ? opts.ladder : MILESTONE_TIER_LADDER;
    const windowMs = Number(opts.windowMs) > 0 ? Number(opts.windowMs) : COMBO_WINDOW_MS;
    const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
    const p = prev && typeof prev === "object" ? prev : null;
    const lastAt = Math.max(0, Number(p?.lastHitAt) || 0);
    const prevCombo = Math.max(0, Math.floor(Number(p?.comboCount) || 0));
    const inWindow = lastAt > 0 && now - lastAt >= 0 && now - lastAt <= windowMs;
    const comboCount = inWindow ? prevCombo + 1 : 1;
    const base = String(baseKind || "");
    const baseIdx = ladder.indexOf(base);
    if (baseIdx < 0) {
      return { lastHitAt: now, comboCount, kind: base, promotedSteps: 0 };
    }
    const idx = Math.min(baseIdx + (comboCount - 1), ladder.length - 1);
    return {
      lastHitAt: now,
      comboCount,
      kind: ladder[idx],
      promotedSteps: idx - baseIdx
    };
  }

  // src/lib/customSoundStore.js
  var CUSTOM_SOUND_DB_NAME = "tk-custom-sounds";
  var CUSTOM_SOUND_DB_VERSION = 1;
  var CUSTOM_SOUND_STORE_BLOBS = "blobs";
  var CUSTOM_SOUND_STORE_ASSIGNMENTS = "assignments";
  var CUSTOM_SOUND_DEFAULT_GAIN = 1;
  function isCustomSoundDbAvailable() {
    return typeof indexedDB !== "undefined";
  }
  function openCustomSoundDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(CUSTOM_SOUND_DB_NAME, CUSTOM_SOUND_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(CUSTOM_SOUND_STORE_BLOBS)) {
          db.createObjectStore(CUSTOM_SOUND_STORE_BLOBS, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(CUSTOM_SOUND_STORE_ASSIGNMENTS)) {
          db.createObjectStore(CUSTOM_SOUND_STORE_ASSIGNMENTS, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function getSoundBlob(db, id) {
    return new Promise((resolve, reject) => {
      if (!id) {
        resolve(null);
        return;
      }
      const tx = db.transaction(CUSTOM_SOUND_STORE_BLOBS, "readonly");
      const req = tx.objectStore(CUSTOM_SOUND_STORE_BLOBS).get(String(id));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }
  function listAssignments(db) {
    return new Promise((resolve, reject) => {
      const out = [];
      const tx = db.transaction(CUSTOM_SOUND_STORE_ASSIGNMENTS, "readonly");
      const req = tx.objectStore(CUSTOM_SOUND_STORE_ASSIGNMENTS).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve(out);
          return;
        }
        out.push(cursor.value);
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  }
  function mergeVariantPaths(basePaths, customPaths) {
    const base = basePaths && typeof basePaths === "object" ? basePaths : {};
    const custom = customPaths && typeof customPaths === "object" ? customPaths : {};
    const merged = { ...base };
    for (const [key, list] of Object.entries(custom)) {
      if (Array.isArray(list) && list.length > 0) merged[key] = list;
    }
    return merged;
  }
  function getUrlForCustomSound(path, chromeGetUrl) {
    const p = String(path || "");
    if (p.startsWith("blob:")) return p;
    return typeof chromeGetUrl === "function" ? chromeGetUrl(p) : p;
  }
  function gainForAssignments(assignments) {
    const map = /* @__PURE__ */ new Map();
    for (const a of Array.isArray(assignments) ? assignments : []) {
      if (a && a.key) {
        const g = typeof a.gain === "number" && Number.isFinite(a.gain) ? Math.max(0, Math.min(1, a.gain)) : CUSTOM_SOUND_DEFAULT_GAIN;
        map.set(String(a.key), g);
      }
    }
    return (kind) => map.has(String(kind)) ? map.get(String(kind)) : CUSTOM_SOUND_DEFAULT_GAIN;
  }
  function buildCustomVariantPathsFromAssignments(assignments, idToUrl) {
    const out = {};
    for (const a of Array.isArray(assignments) ? assignments : []) {
      if (!a || !a.key || !Array.isArray(a.ids)) continue;
      const urls = a.ids.map((id) => idToUrl.get(String(id))).filter((u) => typeof u === "string" && u);
      if (urls.length > 0) out[a.key] = urls;
    }
    return out;
  }
  var _rotationCounters = /* @__PURE__ */ Object.create(null);
  function rotationRngFor(kind, variantsLength) {
    const k = String(kind || "");
    const n = Math.max(1, Math.floor(Number(variantsLength) || 1));
    return () => {
      const counter = _rotationCounters[k] || 0;
      _rotationCounters[k] = counter + 1;
      const mod = counter % n;
      return mod / n;
    };
  }
  async function loadCustomSoundRuntimeState(opts = {}) {
    const empty = { customVariantPaths: {}, gainFor: () => CUSTOM_SOUND_DEFAULT_GAIN, urlsById: /* @__PURE__ */ new Map(), localBundledCount: 0 };
    const localVariantPaths = {};
    const localBundledCount = 0;
    if (!isCustomSoundDbAvailable()) {
      return { ...empty, customVariantPaths: localVariantPaths, localBundledCount };
    }
    try {
      if (opts.previousUrlsById instanceof Map) {
        for (const url of opts.previousUrlsById.values()) {
          try {
            URL.revokeObjectURL(url);
          } catch {
          }
        }
      }
      const db = await openCustomSoundDb();
      const assignments = await listAssignments(db);
      const urlsById = /* @__PURE__ */ new Map();
      for (const a of assignments) {
        for (const id of Array.isArray(a.ids) ? a.ids : []) {
          if (urlsById.has(id)) continue;
          const rec = await getSoundBlob(db, id);
          if (rec?.blob instanceof Blob) urlsById.set(id, URL.createObjectURL(rec.blob));
        }
      }
      const idbVariantPaths = buildCustomVariantPathsFromAssignments(assignments, urlsById);
      const customVariantPaths = mergeVariantPaths(localVariantPaths, idbVariantPaths);
      const idbGainFor = gainForAssignments(assignments);
      const assignedKeys = new Set(assignments.map((a) => String(a.key)));
      const gainFor = (kind) => assignedKeys.has(String(kind)) ? idbGainFor(kind) : CUSTOM_SOUND_DEFAULT_GAIN;
      return { customVariantPaths, gainFor, urlsById, localBundledCount };
    } catch {
      return { ...empty, customVariantPaths: localVariantPaths, localBundledCount };
    }
  }

  // src/lib/giftEffectDiagKey.js
  var KEY_GIFT_EFFECT_DIAG = "nls_gift_effect_diag_v1";

  // src/lib/giftEffectDiag.js
  function makeInitialGiftEffectDiag() {
    return {
      giftDetected: 0,
      giftThrown: 0,
      giftSoundPlayed: 0,
      giftSoundCoalesced: 0,
      giftSoundGuarded: 0,
      giftSoundNoPath: 0,
      giftSoundError: 0,
      giftSoundOff: 0,
      adDetected: 0,
      adThrown: 0,
      adSoundPlayed: 0,
      adSoundGuarded: 0,
      adSoundNoPath: 0,
      adSoundError: 0,
      adSoundOff: 0,
      soundEnabled: true,
      lastEventAt: 0,
      lastSoundGapMs: -1,
      lastBurstGapMs: -1,
      avgSoundGapMs: -1,
      avgBurstGapMs: -1,
      deltaSynthesized: 0,
      deltaPoints: 0,
      arrivalDetected: 0,
      arrivalThrown: 0,
      arrivalSoundPlayed: 0,
      arrivalSkippedCd: 0,
      throwPointFallbackUsed: 0,
      giftThrowCapGuarded: 0,
      adThrowCapGuarded: 0
    };
  }
  function computeGiftGapAverage(prevAvgMs, sampleMs, alpha = 0.3) {
    const sample = Number(sampleMs);
    if (!Number.isFinite(sample) || sample < 0) {
      const prev2 = Number(prevAvgMs);
      return Number.isFinite(prev2) ? prev2 : -1;
    }
    const prev = Number(prevAvgMs);
    if (!Number.isFinite(prev) || prev < 0) return Math.round(sample);
    return Math.round(prev + alpha * (sample - prev));
  }
  function giftSoundDiagFieldForPlayResult(playResult) {
    return soundDiagFieldForPlayResult("gift", playResult);
  }
  function adSoundDiagFieldForPlayResult(playResult) {
    return (
      /** @type {'adSoundGuarded'|'adSoundNoPath'|'adSoundError'|null} */
      soundDiagFieldForPlayResult("ad", playResult)
    );
  }
  function soundDiagFieldForPlayResult(prefix, playResult) {
    const r = String(playResult || "");
    if (r === "guarded") return `${prefix}SoundGuarded`;
    if (r === "no-path") return `${prefix}SoundNoPath`;
    if (r === "error") return `${prefix}SoundError`;
    return null;
  }
  function buildGiftEffectDiagSnapshot(diag, nowMs, liveId) {
    const base = makeInitialGiftEffectDiag();
    const d = (
      /** @type {any} */
      diag && typeof diag === "object" ? diag : {}
    );
    const num3 = (x, fallback) => {
      const n = Number(x);
      return Number.isFinite(n) ? n : fallback;
    };
    const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
    return {
      giftDetected: num3(d.giftDetected, base.giftDetected),
      giftThrown: num3(d.giftThrown, base.giftThrown),
      giftSoundPlayed: num3(d.giftSoundPlayed, base.giftSoundPlayed),
      giftSoundCoalesced: num3(d.giftSoundCoalesced, base.giftSoundCoalesced),
      giftSoundGuarded: num3(d.giftSoundGuarded, base.giftSoundGuarded),
      giftSoundNoPath: num3(d.giftSoundNoPath, base.giftSoundNoPath),
      giftSoundError: num3(d.giftSoundError, base.giftSoundError),
      giftSoundOff: num3(d.giftSoundOff, base.giftSoundOff),
      adDetected: num3(d.adDetected, base.adDetected),
      adThrown: num3(d.adThrown, base.adThrown),
      adSoundPlayed: num3(d.adSoundPlayed, base.adSoundPlayed),
      adSoundGuarded: num3(d.adSoundGuarded, base.adSoundGuarded),
      adSoundNoPath: num3(d.adSoundNoPath, base.adSoundNoPath),
      adSoundError: num3(d.adSoundError, base.adSoundError),
      adSoundOff: num3(d.adSoundOff, base.adSoundOff),
      soundEnabled: d.soundEnabled !== false,
      lastEventAt: num3(d.lastEventAt, base.lastEventAt),
      lastSoundGapMs: num3(d.lastSoundGapMs, base.lastSoundGapMs),
      lastBurstGapMs: num3(d.lastBurstGapMs, base.lastBurstGapMs),
      avgSoundGapMs: num3(d.avgSoundGapMs, base.avgSoundGapMs),
      avgBurstGapMs: num3(d.avgBurstGapMs, base.avgBurstGapMs),
      deltaSynthesized: num3(d.deltaSynthesized, base.deltaSynthesized),
      deltaPoints: num3(d.deltaPoints, base.deltaPoints),
      arrivalDetected: num3(d.arrivalDetected, base.arrivalDetected),
      arrivalThrown: num3(d.arrivalThrown, base.arrivalThrown),
      arrivalSoundPlayed: num3(d.arrivalSoundPlayed, base.arrivalSoundPlayed),
      arrivalSkippedCd: num3(d.arrivalSkippedCd, base.arrivalSkippedCd),
      throwPointFallbackUsed: num3(d.throwPointFallbackUsed, base.throwPointFallbackUsed),
      giftThrowCapGuarded: num3(d.giftThrowCapGuarded, base.giftThrowCapGuarded),
      adThrowCapGuarded: num3(d.adThrowCapGuarded, base.adThrowCapGuarded),
      capturedAt: now,
      // v0.1.1721: どの配信の計測か。未指定/非文字列は '' (= 旧データと同じ扱い=判定保留)。
      liveId: String(liveId ?? d.liveId ?? "").trim().toLowerCase()
    };
  }

  // src/lib/highlightLedgerKey.js
  var KEY_HIGHLIGHT_LEDGER = "nls_highlight_ledger_v1";
  function highlightLedgerKeyFor(liveId) {
    const lid = String(liveId || "").trim().toLowerCase();
    if (!lid) return "";
    return `${KEY_HIGHLIGHT_LEDGER}_${lid}`;
  }

  // src/lib/adObservationLog.js
  var AD_OBS_STORAGE_PREFIX = "nls_ad_obs_";
  function adObservationStorageKey(liveId) {
    return AD_OBS_STORAGE_PREFIX + String(liveId == null ? "" : liveId).trim().toLowerCase();
  }
  function rel(ms, nowMs) {
    const d = nowMs - ms;
    if (!(ms > 0) || !Number.isFinite(d)) return "";
    if (d < 6e4) return "たった今";
    if (d < 36e5) return `${Math.floor(d / 6e4)}分前`;
    if (d < 864e5) return `${Math.floor(d / 36e5)}時間前`;
    return "";
  }
  function clock(ms) {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  var ja = (n) => Math.floor(n).toLocaleString("en-US");
  function adObservationNote(e, nowMs) {
    if (!e || !(e.firstAt > 0)) return "";
    const first = `初めて検知 ${clock(e.firstAt)}${rel(e.firstAt, nowMs) ? `(${rel(e.firstAt, nowMs)})` : ""}・そのとき ${ja(e.firstTotal)}pt`;
    const last = e.lastAt > 0 ? `最後に増えたのを検知 ${clock(e.lastAt)}${rel(e.lastAt, nowMs) ? `(${rel(e.lastAt, nowMs)})` : ""}・+${ja(e.lastDelta)}pt` : "増えたのは未検知";
    return `${first} ／ ${last}。※拡張が気づいた時刻(最大約25秒の誤差・開く前の分は分かりません)`;
  }

  // src/lib/prunableStorageKeys.js
  var PRUNABLE_STORAGE_KEY_PREFIXES = Object.freeze([
    "nls_event_dom_",
    "nls_koken_api_contrib_",
    "nls_nicoad_api_ranking_",
    // v0.1.1665: 広告の「気づいた時刻」(adObservationLog.js)も配信ごとに増えるので TTL/LRU 巡回に載せる。
    AD_OBS_STORAGE_PREFIX,
    "nls_event_participation_",
    "nls_event_score_ranking_",
    "nls_event_voting_ranking_",
    "nls_nicoad_ranking_",
    "nls_broadcaster_profile_",
    "nls_commenter_follow_live_",
    // ★v0.1.1301(Codex レビュー指摘・重大度中): 応援レーン鏡を配信ごとキーへ分離した
    //   (v0.1.1300)結果、視聴した配信の数だけキーが増えるようになった。旧実装は
    //   単一グローバルキー1本だったので lifecycle が要らなかったが、分離した以上
    //   削除する人が必要=既存の TTL(6h)+LRU(30件) 巡回に相乗りさせる。
    //   ★どちらの値も capturedAt を持つ(laneMirror.js buildLaneMirrorSnapshot /
    //     buildLaneReceipt)ので、既存の prune 判定がそのまま使える。
    //   ★現在視聴中の lv は pruneStaleEventDomLvs が別枠で保護する。
    "nls_lane_mirror_v2_",
    "nls_lane_receipt_v1_",
    // 2026-10-09: ハイライト台帳も配信ごとキーへ分離(highlightLedgerKeyFor)。視聴した配信の数だけ増えるので同じ巡回で掃除する。
    //   値は capturedAt(最後のハイライト時刻)を持つので既存の prune 判定がそのまま使える。現在視聴中の lv は別枠で保護される。
    "nls_highlight_ledger_v1_"
  ]);

  // src/lib/highlightLedger.js
  var HIGHLIGHT_LEDGER_CAP = 50;
  var HIGHLIGHT_KIND_LABEL = Object.freeze({
    gift_large: "ギフト大波(large)",
    gift_mega: "ギフト大波(mega)",
    milestone_hard: "コメント節目(500件)",
    milestone_jackpot: "コメント節目 大当たり(1000件以上)"
  });
  function isHighlightWorthyKind(kind) {
    return Object.prototype.hasOwnProperty.call(HIGHLIGHT_KIND_LABEL, String(kind || ""));
  }
  function num2(x) {
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  }
  function normalizeLedger(raw) {
    const r = raw && typeof raw === "object" ? (
      /** @type {any} */
      raw
    ) : {};
    const rowsSrc = Array.isArray(r.rows) ? r.rows : [];
    const rows = [];
    for (const it of rowsSrc) {
      if (!it || typeof it !== "object") continue;
      const at = num2(it.at);
      const kind = String(it.kind || "");
      const label = String(it.label || "");
      if (at <= 0 || !kind || !label) continue;
      rows.push({ at, kind, label });
    }
    return { liveId: String(r.liveId || ""), rows, capturedAt: num2(r.capturedAt) };
  }
  function appendHighlight(prevRaw, entry) {
    const liveId = String(entry?.liveId || "").trim().toLowerCase();
    const kind = String(entry?.kind || "");
    const atMs = num2(entry?.atMs);
    if (!liveId || !kind || atMs <= 0 || !isHighlightWorthyKind(kind)) {
      return normalizeLedger(prevRaw);
    }
    const prev = normalizeLedger(prevRaw);
    const rows = prev.liveId === liveId ? prev.rows.slice() : [];
    rows.push({ at: atMs, kind, label: (
      /** @type {Record<string, string>} */
      HIGHLIGHT_KIND_LABEL[kind]
    ) });
    const capped = rows.length > HIGHLIGHT_LEDGER_CAP ? rows.slice(rows.length - HIGHLIGHT_LEDGER_CAP) : rows;
    return { liveId, rows: capped, capturedAt: atMs };
  }
  function highlightLedgerReadKeys(liveId) {
    const k = highlightLedgerKeyFor(liveId);
    return k ? [k, KEY_HIGHLIGHT_LEDGER] : [KEY_HIGHLIGHT_LEDGER];
  }
  function pickLedgerForLive(bag, liveId) {
    const lid = String(liveId || "").trim().toLowerCase();
    if (!lid || !bag || typeof bag !== "object") return null;
    const perKey = highlightLedgerKeyFor(lid);
    const cands = [perKey ? bag[perKey] : null, bag[KEY_HIGHLIGHT_LEDGER]];
    for (const c of cands) {
      if (c && typeof c === "object" && String(
        /** @type {any} */
        c.liveId || ""
      ).trim().toLowerCase() === lid) {
        return (
          /** @type {HighlightLedger} */
          c
        );
      }
    }
    return null;
  }
  function planHighlightAppend(bag, entry) {
    const liveId = String(entry?.liveId || "").trim().toLowerCase();
    const perKey = highlightLedgerKeyFor(liveId);
    if (!perKey || !isHighlightWorthyKind(String(entry?.kind || ""))) return null;
    const next = appendHighlight(pickLedgerForLive(bag, liveId), { liveId, kind: entry.kind, atMs: entry.atMs });
    return { [perKey]: next, [KEY_HIGHLIGHT_LEDGER]: next };
  }
  var HIGHLIGHT_LEDGER_TTL_MS = 24 * 60 * 60 * 1e3;
  var HIGHLIGHT_TIER_WEIGHT = Object.freeze({
    gift_mega: 90,
    milestone_jackpot: 85,
    gift_large: 60,
    milestone_hard: 50
  });

  // src/lib/commentTailBuffer.js
  function tailStorageKey(liveId) {
    const id = String(liveId || "").trim().toLowerCase();
    return `nls_ctail_${id}`;
  }

  // src/lib/venueSpeech.js
  function venueSpeechKey(row) {
    if (!row || typeof row !== "object") return "";
    const no = row.commentNo ?? row.no;
    if (no != null && String(no).trim()) return `no:${String(no).trim()}`;
    if (row.id != null && String(row.id).trim()) return `id:${String(row.id).trim()}`;
    const uid = String(row.userId ?? "").trim();
    const text = String(row.text ?? "").trim();
    const cap = row.capturedAt != null ? String(row.capturedAt) : "";
    return `c:${uid}:${text}:${cap}`;
  }
  function venueSpeakerKey(row) {
    const uid = String(row?.userId ?? "").trim();
    if (uid) return `u:${uid}`;
    const name = String(row?.name ?? "").trim();
    return name ? `n:${name}` : "";
  }
  function liveFeedSpeechRows(rows) {
    if (!Array.isArray(rows)) return [];
    const out = [];
    for (const r of rows) {
      if (!r || typeof r !== "object") continue;
      const no = r.commentNo ?? r.no;
      if (no == null) continue;
      if (!String(no).trim()) continue;
      out.push(r);
    }
    return out;
  }
  function pickNewVenueSpeech(rows, state = {}, opts = {}) {
    const list = Array.isArray(rows) ? rows : [];
    const maxEmit = Number.isFinite(opts.maxEmit) && opts.maxEmit > 0 ? Math.floor(opts.maxEmit) : 8;
    const primeEmit = Number.isFinite(opts.primeEmit) && opts.primeEmit > 0 ? Math.floor(opts.primeEmit) : 0;
    const seen = state.seenKeys instanceof Set ? new Set(state.seenKeys) : /* @__PURE__ */ new Set();
    const wasPrimed = state.primed === true;
    const speakable = [];
    for (const r of list) {
      if (!r || typeof r !== "object") continue;
      const text = String(r.text ?? "").trim();
      if (!text) continue;
      const key = venueSpeechKey(r);
      if (!key) continue;
      speakable.push({ row: r, key, text });
    }
    let primeSet = null;
    if (!wasPrimed) {
      primeSet = new Set(
        speakable.slice(Math.max(0, speakable.length - primeEmit)).map((s) => s.key)
      );
      for (const s of speakable) {
        if (primeSet.has(s.key)) continue;
        seen.add(s.key);
      }
      if (primeEmit <= 0) {
        return { speeches: [], seenKeys: seen, primed: true };
      }
    }
    const fresh = [];
    for (const s of speakable) {
      if (seen.has(s.key)) continue;
      seen.add(s.key);
      const speakerKey = venueSpeakerKey(s.row);
      if (!speakerKey) continue;
      fresh.push({
        key: s.key,
        speakerKey,
        userId: String(s.row.userId ?? "").trim(),
        name: String(s.row.name ?? "").trim(),
        text: s.text,
        // 2026-10-22計器(P1): 受信時刻。読み上げの「受信→キュー」の遅れを測るために渡す(0=不明)。
        capturedAt: Number(s.row.capturedAt) > 0 ? Number(s.row.capturedAt) : 0
      });
    }
    const speeches = fresh.length > maxEmit ? fresh.slice(fresh.length - maxEmit) : fresh;
    const SEEN_CAP = 4e3;
    if (seen.size > SEEN_CAP) {
      const arr = Array.from(seen);
      return {
        speeches,
        seenKeys: new Set(arr.slice(arr.length - SEEN_CAP)),
        primed: true
      };
    }
    return { speeches, seenKeys: seen, primed: true };
  }
  function mergeSpeakersIntoVenueRows(baseRows, speeches, nowMs) {
    const base = Array.isArray(baseRows) ? baseRows : [];
    const talks = Array.isArray(speeches) ? speeches : [];
    const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
    const byUid = /* @__PURE__ */ new Map();
    const out = [];
    for (const r of base) {
      if (!r || typeof r !== "object") continue;
      const uid = String(r.userId ?? "").trim();
      const row = {
        ...r,
        userId: uid,
        name: String(r.name ?? "").trim(),
        avatar: String(r.avatar ?? "").trim(),
        text: String(r.text ?? ""),
        capturedAt: Number.isFinite(Number(r.capturedAt)) ? Number(r.capturedAt) : 0
      };
      out.push(row);
      if (uid) byUid.set(uid, row);
    }
    for (const sp of talks) {
      if (!sp || typeof sp !== "object") continue;
      const uid = String(sp.userId ?? "").trim();
      const name = String(sp.name ?? "").trim();
      if (!uid && !name) continue;
      const existing = uid ? byUid.get(uid) : null;
      if (existing) {
        existing.capturedAt = now;
        if (name && !existing.name) existing.name = name;
      } else {
        const row = { userId: uid, name, avatar: "", text: "", capturedAt: now };
        out.push(row);
        if (uid) byUid.set(uid, row);
      }
    }
    return out;
  }

  // src/lib/venueSpeechStats.js
  function numAfter(s, emoji) {
    const i = s.indexOf(emoji);
    if (i < 0) return null;
    const m = /^[\d,]+/.exec(s.slice(i + emoji.length).trim());
    if (!m) return null;
    const n = Number(m[0].replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }
  function parseTileStatsText(text) {
    const s = typeof text === "string" ? text : "";
    return { gift: numAfter(s, "🎁"), ad: numAfter(s, "📣"), comments: numAfter(s, "💬") };
  }
  function ja2(n) {
    return Math.floor(n).toLocaleString("en-US");
  }
  function speechSupportLine(text) {
    const p = parseTileStatsText(text);
    const parts = [];
    if (p.gift != null) parts.push(`🎁 ギフト ${ja2(p.gift)}pt`);
    if (p.ad != null) parts.push(`📣 広告 ${ja2(p.ad)}pt`);
    return parts.join(" ・ ");
  }
  function speechEmptyMessage(text, read = {}) {
    if (read && read.contextLost) {
      return "拡張が更新されたため、このタブからは保存した記録を読めません。ページを再読み込み(F5)すると出ます";
    }
    if (read && read.readFailed) {
      return "記録の読み込みが間に合いませんでした。少し待ってもう一度押してください";
    }
    const p = parseTileStatsText(text);
    if (p.comments != null) {
      return `発言 ${ja2(p.comments)} 回の本文が、保存した記録の中に見つかりませんでした`;
    }
    return speechSupportLine(text) ? "この配信のコメントの記録はありません(応援はギフト・広告のみ)" : "この配信の記録にはまだ発言がありません";
  }
  function speechFallbackNote(shown, read = {}) {
    const n = Number(shown);
    if (!Number.isFinite(n) || n <= 0) return "";
    const head = `会場が覚えている直近の発言 ${ja2(n)} 件だけを出しています`;
    if (read && read.contextLost) return `${head}(拡張が更新されたため。ページを再読み込み(F5)すると全部出ます)`;
    if (read && read.readFailed) return `${head}(記録の読み込みが間に合わなかったため。もう一度押すと全部出ることがあります)`;
    return head;
  }
  function speechFallbackListHtml(texts, read, esc, max = 1e3) {
    const rows = (Array.isArray(texts) ? texts : []).map((t) => String(t ?? "").trim()).filter(Boolean).slice(0, max);
    if (!rows.length) return "";
    return `<div class="nlsb-speech-support">${esc(speechFallbackNote(rows.length, read))}</div>` + rows.map((t) => `<div class="nlsb-roster-row"><span class="nlsb-roster-who">${esc(t)}</span></div>`).join("");
  }

  // src/lib/venueGiftThrowsForUser.js
  var NUMERIC_UID_RE = /^[1-9]\d{0,17}$/;
  var STALE_MS = 5 * 6e4;
  var GIFT_THROWS_PANEL_MAX = 30;
  var norm = (v) => String(v == null ? "" : v).trim().toLowerCase();
  function httpUrlOrEmpty(v) {
    const s = String(v == null ? "" : v).trim();
    return /^https?:\/\//i.test(s) ? s : "";
  }
  var ja3 = (n) => Math.floor(n).toLocaleString("en-US");
  function giftThrowsForUser(p) {
    const no = (reason) => ({ ok: false, reason, rows: [], sumPoints: 0, count: 0, notes: [] });
    const uid = String(p?.uid == null ? "" : p.uid).trim();
    if (!NUMERIC_UID_RE.test(uid)) return no("no-uid");
    const payload = (
      /** @type {Record<string, any>|null} */
      p?.payload && typeof p.payload === "object" ? p.payload : null
    );
    if (!payload || !Array.isArray(payload.history)) return no("no-history");
    const want = norm(p.liveId);
    if (!want || norm(payload.liveId) !== want) return no("live-mismatch");
    const byId = /* @__PURE__ */ new Map();
    let anonCount = 0;
    let anonPoints = 0;
    const allSeen = /* @__PURE__ */ new Set();
    let allPoints = 0;
    for (const raw of payload.history) {
      if (!raw || typeof raw !== "object") continue;
      const h = (
        /** @type {Record<string, any>} */
        raw
      );
      const rowUid = String(h.userId == null ? "" : h.userId).trim();
      {
        const pts = Math.floor(Number(h.points));
        const k = String(h.kokenHistoryId || "").trim() || `${h.itemName}|${h.time}|${pts}|${h.sortKey}`;
        if (Number.isFinite(pts) && pts > 0 && !allSeen.has(k)) {
          allSeen.add(k);
          allPoints += pts;
          if (!rowUid) {
            anonCount += 1;
            anonPoints += pts;
          }
        }
      }
      if (!rowUid) continue;
      if (rowUid !== uid) continue;
      const points = Math.floor(Number(h.points));
      if (!Number.isFinite(points) || points <= 0) continue;
      const key = String(h.kokenHistoryId || "").trim() || `${h.itemName}|${h.time}|${points}|${h.sortKey}`;
      if (byId.has(key)) continue;
      byId.set(key, {
        sortKey: Number(h.sortKey) || 0,
        r: {
          itemName: String(h.itemName == null ? "" : h.itemName).trim() || "(名称未取得)",
          points,
          // 公式ランキング(タイルの🎁)と同じ単位(contribution=ptの10倍)。古い保存には無い=0。
          contribution: Math.max(0, Math.floor(Number(h.contribution)) || 0),
          time: String(h.time == null ? "" : h.time).trim(),
          // 公式の公開時刻(epoch 秒→ms)。無ければ 0=時計の時刻は出さず、配信内の経過だけを出す。
          at: Number(h.publishedAt) > 0 ? Math.floor(Number(h.publishedAt)) * 1e3 : 0,
          thumbnailUrl: httpUrlOrEmpty(h.thumbnailUrl)
        }
      });
    }
    const all = [...byId.values()].sort((a, b) => b.sortKey - a.sortKey).map((x) => x.r);
    if (all.length === 0) return no("empty");
    const sumPoints = all.reduce((s, r) => s + r.points, 0);
    const hasContribution = all.every((r) => r.contribution > 0);
    const sumContribution = all.reduce((s, r) => s + r.contribution, 0);
    const tile = Number(p.tileGiftPt);
    const canReconcile = hasContribution && Number.isFinite(tile) && tile > 0;
    if (canReconcile && sumContribution > tile) return { ...no("over-total"), sumPoints, count: all.length };
    const notes = [];
    if (canReconcile && sumContribution < tile) {
      notes.push(`全部ではありません(明細の合計 ${ja3(sumContribution)} / ランキングの値 ${ja3(tile)}・どちらもタイルと同じ単位)`);
    } else if (canReconcile && sumContribution === tile) {
      notes.push(`この人の明細は、タイルの🎁 ${ja3(tile)}(ランキングの値)と一致しています`);
    }
    if (anonCount > 0) notes.push(`匿名のギフト ${anonCount}件・合計 ${ja3(anonPoints)}pt は、誰のものか分からないため含みません`);
    let official = null;
    const offTotal = Number(payload.officialTotalPoint);
    if (Number.isFinite(offTotal) && offTotal >= 0) {
      const remaining = Math.max(0, Math.floor(Number(payload.officialRemaining) || 0));
      if (remaining > 0) {
        official = "truncated";
        notes.push(`公式の履歴が100件を超えています(残り ${remaining}件)。古い分は含みません`);
      } else if (allPoints === Math.floor(offTotal)) {
        official = "match";
        notes.push(`公式の合計 ${ja3(offTotal)}pt と一致(全件を取得できています)`);
      } else {
        official = "short";
      }
    }
    const ageMs = ageMsOf(payload.capturedAt, p.nowMs);
    if (ageMs != null && ageMs > STALE_MS) notes.push(`${Math.floor(ageMs / 6e4)}分前の記録です`);
    return { ok: true, rows: all.slice(0, GIFT_THROWS_PANEL_MAX), sumPoints, count: all.length, notes, anonCount, anonPoints, official };
  }
  var pad2 = (n) => String(n).padStart(2, "0");
  function giftThrowWhenLabel(row, nowMs) {
    const parts = [];
    if (row.at > 0) {
      const d = new Date(row.at);
      const clock2 = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
      const rel3 = formatVenueHoverRelativeTime(row.at, nowMs);
      parts.push(rel3 ? `${clock2}(${rel3})` : clock2);
    }
    const el = String(row.time || "").trim();
    if (el && el !== "—") parts.push(`配信${el}`);
    return parts.join(" ・ ");
  }
  function giftThrowsSectionHtml(r, escapeHtml3, nowMs = Date.now(), hasGift = false) {
    if (!r) return "";
    if (!r.ok) {
      const note = (t) => `<div class="nlsb-speech-gifts"><div class="nlsb-speech-gifts__note">${escapeHtml3(t)}</div></div>`;
      if (r.reason === "over-total") return note("ギフトの明細は、累計と照合できません");
      if (hasGift && r.reason === "empty") return note("公式のギフト履歴には、この人のIDがついた投げの記録がありません。匿名(名無し)で投げた分は、誰のものか分からないため出せません");
      if (hasGift && (r.reason === "no-history" || r.reason === "live-mismatch")) return note("ギフトの履歴をまだ取得できていません(しばらくして開き直すと出ることがあります)");
      return "";
    }
    const rows = r.rows.map((x) => {
      const thumb = x.thumbnailUrl ? `<img class="nlsb-speech-gifts__img" src="${escapeHtml3(x.thumbnailUrl)}" alt="" loading="lazy">` : "";
      return `<div class="nlsb-speech-gifts__row">${thumb}<span class="nlsb-speech-gifts__item">${escapeHtml3(x.itemName)}</span><span class="nlsb-speech-gifts__pt">${escapeHtml3(ja3(x.points))}pt</span><span class="nlsb-speech-gifts__time">${escapeHtml3(giftThrowWhenLabel(x, nowMs))}</span></div>`;
    }).join("");
    const head = `🎁 ギフトの記録(${r.count}回・合計 ${ja3(r.sumPoints)}pt)`;
    const notes = r.notes.map((n) => `<div class="nlsb-speech-gifts__note">${escapeHtml3(n)}</div>`).join("");
    return `<div class="nlsb-speech-gifts"><div class="nlsb-speech-gifts__head">${escapeHtml3(head)}</div>${rows}${notes}</div>`;
  }

  // src/lib/reportSilentError.js
  function isContextInvalidatedError(err) {
    const msg = err && typeof err === "object" && "message" in err ? String(
      /** @type {{ message?: unknown }} */
      err.message || ""
    ) : String(err || "");
    return msg.includes("Extension context invalidated");
  }
  function isExtensionContextAlive(chromeRef) {
    try {
      const c = chromeRef !== void 0 ? chromeRef : (
        /** @type {any} */
        typeof chrome !== "undefined" ? chrome : void 0
      );
      return Boolean(c?.runtime?.id && c?.storage?.local);
    } catch {
      return false;
    }
  }

  // src/lib/storageWriteLedger.js
  function makeStorageWriteLedger(nowMs) {
    const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
    return { keys: /* @__PURE__ */ Object.create(null), windowStartMs: now };
  }
  function approxByteLength(value) {
    if (value === void 0) return 0;
    try {
      const s = typeof value === "string" ? value : JSON.stringify(value);
      return typeof s === "string" ? s.length : 0;
    } catch {
      return 0;
    }
  }
  function recordWrite(ledger, items) {
    if (!ledger || typeof ledger !== "object") return makeStorageWriteLedger();
    if (!ledger.keys) ledger.keys = /* @__PURE__ */ Object.create(null);
    if (!items || typeof items !== "object") return ledger;
    for (const key of Object.keys(items)) {
      const bytes = approxByteLength(items[key]);
      const prev = ledger.keys[key];
      if (prev) {
        prev.count += 1;
        prev.bytes += bytes;
      } else {
        ledger.keys[key] = { count: 1, bytes };
      }
    }
    return ledger;
  }

  // src/lib/safeStorageLocal.js
  var _storageWriteLedger = makeStorageWriteLedger(
    typeof Date !== "undefined" ? Date.now() : 0
  );
  function noteStorageWrite(items) {
    try {
      recordWrite(_storageWriteLedger, items);
    } catch {
    }
  }
  function resolveStorageLocal(chromeRef) {
    try {
      const c = chromeRef !== void 0 ? chromeRef : (
        /** @type {any} */
        typeof chrome !== "undefined" ? chrome : void 0
      );
      if (!isExtensionContextAlive(c)) return null;
      return c.storage.local;
    } catch {
      return null;
    }
  }
  async function safeStorageLocalGet(keys, opts = {}) {
    const local = resolveStorageLocal(opts.chromeRef);
    if (!local) return {};
    try {
      return await local.get(keys) || {};
    } catch {
      return {};
    }
  }
  async function safeStorageLocalSet(items, opts = {}) {
    const local = resolveStorageLocal(opts.chromeRef);
    if (!local) return;
    noteStorageWrite(items);
    try {
      await local.set(items);
    } catch {
    }
  }
  function safeStorageOnChangedAddListener(listener, opts = {}) {
    try {
      const c = opts.chromeRef !== void 0 ? opts.chromeRef : (
        /** @type {any} */
        typeof chrome !== "undefined" ? chrome : void 0
      );
      if (!isExtensionContextAlive(c) || typeof c?.storage?.onChanged?.addListener !== "function") {
        return false;
      }
      c.storage.onChanged.addListener(listener);
      return true;
    } catch {
      return false;
    }
  }
  var NOOP_STORAGE_LOCAL_REF = Object.freeze({
    get: async () => ({}),
    set: async () => {
    }
  });

  // src/lib/venueSpeechStreak.js
  var STREAK_GAP_MS = 6e3;
  var STREAK_MAX = 5;
  function updateSpeechStreak(state, speakerKey, nowMs, opts = {}) {
    const key = String(speakerKey || "").trim();
    if (!key || !(state instanceof Map)) return { count: 1, isContinuation: false };
    const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
    const gap = Number.isFinite(Number(opts.gapMs)) && opts.gapMs > 0 ? Number(opts.gapMs) : STREAK_GAP_MS;
    const max = Number.isFinite(Number(opts.max)) && opts.max > 0 ? Math.floor(opts.max) : STREAK_MAX;
    const prev = state.get(key);
    let count;
    let isContinuation;
    if (prev && now - prev.lastAt <= gap) {
      count = Math.min(max, prev.count + 1);
      isContinuation = true;
    } else {
      count = 1;
      isContinuation = false;
    }
    state.set(key, { count, lastAt: now });
    return { count, isContinuation };
  }
  function pruneSpeechStreaks(state, nowMs, ttlMs = STREAK_GAP_MS * 3) {
    if (!(state instanceof Map)) return 0;
    const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
    const ttl = Number.isFinite(Number(ttlMs)) && ttlMs > 0 ? Number(ttlMs) : STREAK_GAP_MS * 3;
    let removed = 0;
    for (const [key, v] of state) {
      if (now - v.lastAt > ttl) {
        state.delete(key);
        removed += 1;
      }
    }
    return removed;
  }
  function streakGlowStage(count) {
    const c = Math.floor(Number(count) || 0);
    if (c <= 1) return 0;
    return Math.min(STREAK_MAX - 1, c - 1);
  }
  function streakBubbleLifetimeMs(count, baseMs) {
    const base = Number.isFinite(Number(baseMs)) && baseMs > 0 ? Number(baseMs) : 4e3;
    const c = Math.floor(Number(count) || 0);
    if (c <= 1) return base;
    return Math.min(base * 2, base + (c - 1) * 500);
  }
  var BUBBLE_FLOW_LIFETIME_MIN_MS = 1200;
  function resolveBubbleFlowLifetimeMs(commentsPerSec, baseMs) {
    const base = Number.isFinite(Number(baseMs)) && baseMs > 0 ? Number(baseMs) : 4e3;
    const rate = Number(commentsPerSec);
    if (!Number.isFinite(rate) || rate <= 1) return base;
    const scaled = base / Math.sqrt(rate);
    return Math.max(BUBBLE_FLOW_LIFETIME_MIN_MS, Math.round(scaled));
  }

  // src/lib/venueBubbleChurn.js
  var SHORT_LIFETIME_MS = 1500;
  var MID_LIFETIME_MS = 3e3;
  function createVenueBubbleChurnState() {
    return {
      spawned: 0,
      shortCount: 0,
      midCount: 0,
      longCount: 0,
      evicted: 0,
      lastRatePerSec: 0,
      removedVoiced: 0,
      removedUnvoiced: 0
    };
  }
  function observeVenueBubbleSpawn(state, obs) {
    if (!state || typeof state !== "object" || !obs || typeof obs !== "object") return;
    state.spawned += 1;
    const lifetime = Number(obs.flowLifetimeMs);
    if (Number.isFinite(lifetime)) {
      if (lifetime < SHORT_LIFETIME_MS) state.shortCount += 1;
      else if (lifetime < MID_LIFETIME_MS) state.midCount += 1;
      else state.longCount += 1;
    }
    const rate = Number(obs.ratePerSec);
    if (Number.isFinite(rate) && rate >= 0) state.lastRatePerSec = rate;
  }
  function observeVenueBubbleEviction(state, count) {
    if (!state || typeof state !== "object") return;
    const n = Math.max(0, Math.floor(Number(count) || 0));
    state.evicted += n;
  }
  var VOICED_STATES = /* @__PURE__ */ new Set(["speaking", "done"]);
  function observeVenueBubbleRemoval(state, voiceState) {
    if (!state || typeof state !== "object") return;
    if (VOICED_STATES.has(String(voiceState))) state.removedVoiced += 1;
    else state.removedUnvoiced += 1;
  }
  function toVenueBubbleChurnDiag(state) {
    if (!state || typeof state !== "object") return null;
    let line;
    if (state.spawned <= 0) {
      line = "応援TOP吹き出し ⚪ 未観測";
    } else {
      const removedTotal = state.removedVoiced + state.removedUnvoiced;
      const unvoicedRatioStr = removedTotal > 0 ? `${Math.round(state.removedUnvoiced / removedTotal * 1e3) / 10}%` : "-";
      line = `応援TOP吹き出し 生成累計${state.spawned}(短命<1.5s:${state.shortCount} 中1.5-3s:${state.midCount} 長>3s:${state.longCount}) / 強制退去${state.evicted} / 直近流速${Math.round(state.lastRatePerSec * 10) / 10}件/秒 / 消滅時voiced${state.removedVoiced}・unvoiced${state.removedUnvoiced}(unvoiced率${unvoicedRatioStr})`;
    }
    return {
      line,
      spawned: state.spawned,
      shortCount: state.shortCount,
      midCount: state.midCount,
      longCount: state.longCount,
      evicted: state.evicted,
      lastRatePerSec: state.lastRatePerSec,
      removedVoiced: state.removedVoiced,
      removedUnvoiced: state.removedUnvoiced
    };
  }

  // src/lib/venueAvatar.js
  function isHttpUrl(u) {
    return /^https?:\/\//i.test(String(u || "").trim());
  }
  function enrichVenueRowsWithProfileAvatars(rows, profileMap) {
    const list = Array.isArray(rows) ? rows : [];
    const map = profileMap && typeof profileMap === "object" && !Array.isArray(profileMap) ? profileMap : {};
    const out = [];
    for (const r of list) {
      if (!r || typeof r !== "object") continue;
      const userId = String(r.userId || "").trim();
      const name = String(r.name || "").trim();
      const capturedAt = Number.isFinite(Number(r.capturedAt)) ? Number(r.capturedAt) : 0;
      let avatar = String(r.avatar || "").trim();
      let observed = isHttpUrl(avatar);
      if (!observed && userId) {
        const profileAvatar = String(map[userId]?.avatarUrl ?? "").trim();
        if (isHttpUrl(profileAvatar) && isAvatarUrlForUserId2(profileAvatar, userId)) {
          avatar = profileAvatar;
          observed = true;
        }
      }
      if (!observed && userId) {
        const derived = deriveAvatarUrlFromUid(userId);
        if (derived) {
          avatar = derived;
          observed = true;
        }
      }
      out.push({
        ...r,
        userId,
        name,
        avatar,
        text: String(r.text || ""),
        capturedAt,
        avatarObserved: observed
      });
    }
    return out;
  }

  // src/lib/venueMirrorAvatarEnrich.js
  var TIERS2 = ["link", "gift", "ad", "konta", "tanu"];
  function buildVenueMirrorAvatarMap(snap) {
    const map = /* @__PURE__ */ new Map();
    const s = (
      /** @type {any} */
      snap && typeof snap === "object" ? snap : null
    );
    if (!s) return map;
    for (const tier of TIERS2) {
      const cells = Array.isArray(s[tier]) ? s[tier] : [];
      for (const cell of cells) {
        const c = (
          /** @type {any} */
          cell && typeof cell === "object" ? cell : {}
        );
        const uid = String(c.userId ?? c.entry?.userId ?? "").trim();
        if (!uid || map.has(uid)) continue;
        const url = String(c.displaySrc || "").trim();
        if (!/^https?:\/\//i.test(url)) continue;
        if (commentEnrichmentAvatarScore(uid, url) !== 2) continue;
        map.set(uid, url);
      }
    }
    return map;
  }
  function enrichVenueRowsWithMirrorAvatars(rows, mirrorAvatarMap) {
    const list = Array.isArray(rows) ? rows : [];
    const map = mirrorAvatarMap instanceof Map ? mirrorAvatarMap : null;
    if (!map || map.size === 0) return list.slice();
    return list.map((r) => {
      if (!r || typeof r !== "object") return r;
      const uid = String(r.userId || "").trim();
      if (!uid) return r;
      const mirrorUrl = map.get(uid);
      if (!mirrorUrl) return r;
      const rowScore = commentEnrichmentAvatarScore(uid, r.avatar);
      if (rowScore >= 2) return r;
      return { ...r, avatar: mirrorUrl, avatarObserved: true };
    });
  }

  // src/lib/laneMirrorContract.js
  var LANE_MIRROR_CONSUMERS = Object.freeze([
    Object.freeze({
      file: "src/extension/popup-entry.js",
      role: "writer",
      // 書くのは renderStoryUserLane 内の publishLaneMirror 1箇所のみ。
      // INLINE_PASSIVE(②応援プレビュー)は書かない=受動ビューの不可侵原則。
      // 自身も passive 描画のために read する(7063行)。
      // ★v0.1.1300: 同じ1箇所から【配信ごとキー(v2)+受領証】も書く
      //   (publishLaneMirrorPerLive)。書き手は増えていない=単一書き手の不変条件は維持。
      note: "唯一の書き手(publishLaneMirror)。passive時は書かず読むだけ"
    }),
    Object.freeze({
      file: "src/extension/status-entry.js",
      role: "reader",
      note: "③WEB/状態速報が本物の描画関数で描くために読む"
    }),
    Object.freeze({
      file: "src/extension/venueBar.js",
      role: "reader",
      // ★v0.1.1111 で「会場の正本に昇格」。会場は鏡があれば鏡の5段をそのまま使い、
      //   無ければ fallback(席から組む)へ落ちる。fallback は gift/ad を作れない(原理)。
      note: "会場モードの正本(v0.1.1111)。鏡が無い/古すぎると fallback へ降格"
    }),
    Object.freeze({
      file: "src/lib/mirrorBundleFlushScheduler.js",
      role: "writer",
      note: "5鏡を1回の storage.set に合流させる書き出し口(同一tick化の書き側)"
    }),
    Object.freeze({
      file: "src/lib/laneMirrorPerLivePublish.js",
      role: "writer",
      // ★v0.1.1300: 配信ごとキー(v2)+受領証の書き出し。popup-entry.js の publishLaneMirror
      //   から1回だけ呼ばれる=書き手の【主体】は増えていない(storage I/O グルーの抽出のみ)。
      //   ★合流バッファは通さない: あれは全 section を毎回同梱するので、配信が切り替わると
      //     前の配信の lane を再同梱して巻き戻す。配信ごとキーは単独 set でなければならない。
      note: "配信ごと鏡(v2)+受領証の書き出し口。popup の publishLaneMirror から1回だけ呼ばれる"
    }),
    Object.freeze({
      file: "src/lib/statusExtrasBatch.js",
      role: "reader",
      note: "状態速報の extras 一括read(12秒間引き)の一員として読む"
    })
  ]);
  var LANE_MIRROR_TIERS = Object.freeze(["link", "gift", "ad", "konta", "tanu"]);
  var ANONYMOUS_FORBIDDEN_TIERS = Object.freeze(["link", "konta"]);
  var UNKEYED_ALLOWED_TIERS = Object.freeze(["gift", "ad"]);
  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }
  function sanitizeLaneMirrorForRead(rawSnap) {
    const issues = [];
    const empty = { snap: null, droppedLinkAnon: 0, droppedKontaAnon: 0, droppedUnkeyed: 0, issues };
    if (!rawSnap || typeof rawSnap !== "object") {
      issues.push("snapshotが無い");
      return empty;
    }
    const snap = (
      /** @type {Record<string, any>} */
      rawSnap
    );
    if (!String(snap.liveId || "").trim()) {
      issues.push("liveIdが空");
      return empty;
    }
    if (!LANE_MIRROR_TIERS.some((tier) => Array.isArray(
      /** @type {any} */
      snap[tier]
    ))) {
      issues.push("段が無い");
      return empty;
    }
    let droppedLinkAnon = 0;
    let droppedKontaAnon = 0;
    let droppedUnkeyed = 0;
    const nextTiers = {};
    for (const tier of LANE_MIRROR_TIERS) {
      const rows = asArray(
        /** @type {any} */
        snap[tier]
      );
      const kept = [];
      for (const cell of rows) {
        const uid = String(cell?.userId ?? cell?.entry?.userId ?? "").trim();
        if (!uid) {
          if (UNKEYED_ALLOWED_TIERS.includes(tier)) {
            kept.push(cell);
          } else {
            droppedUnkeyed += 1;
          }
          continue;
        }
        if (ANONYMOUS_FORBIDDEN_TIERS.includes(tier) && isAnonymousStyleNicoUserId2(uid)) {
          if (tier === "link") droppedLinkAnon += 1;
          else droppedKontaAnon += 1;
          continue;
        }
        kept.push(cell);
      }
      nextTiers[tier] = kept;
    }
    return {
      snap: { ...snap, ...nextTiers },
      droppedLinkAnon,
      droppedKontaAnon,
      droppedUnkeyed,
      issues
    };
  }

  // src/lib/avatarFallbackFromUrl.js
  function identiconFallbackForAvatarUrl(requestedSrc) {
    try {
      const m = /\/usericon\/(?:[sm]\/)?\d+\/(\d{1,14})\.jpg/i.exec(String(requestedSrc || ""));
      const uid = m ? m[1] : "";
      if (!uid) return "";
      return anonymousIdenticonDataUrl(uid, 64) || "";
    } catch {
      return "";
    }
  }

  // src/lib/venueMirrorIntakeDiag.js
  function createVenueMirrorIntakeState() {
    return {
      changedEvents: 0,
      keyMatched: 0,
      keyMissed: 0,
      accepted: 0,
      rejectedByGate: 0,
      lastMissedKeys: [],
      lastExpectedKey: "",
      lastAcceptedAt: 0,
      lastRejectReason: ""
    };
  }
  function observeVenueMirrorChange(state, obs) {
    if (!state || typeof state !== "object") return;
    state.changedEvents += 1;
    state.lastExpectedKey = String(obs?.expectedKey || "");
    if (obs?.matched) {
      state.keyMatched += 1;
      return;
    }
    const mirrorish = (Array.isArray(obs?.changedKeys) ? obs.changedKeys : []).filter(
      (k) => String(k || "").startsWith("nls_lane_mirror")
    );
    if (mirrorish.length > 0) {
      state.keyMissed += 1;
      state.lastMissedKeys = mirrorish.slice(0, 3);
    }
  }
  function observeVenueMirrorAccept(state, obs) {
    if (!state || typeof state !== "object") return;
    if (obs?.accepted) {
      state.accepted += 1;
      const n = Number(obs?.nowMs);
      if (Number.isFinite(n) && n > 0) state.lastAcceptedAt = n;
      return;
    }
    state.rejectedByGate += 1;
    state.lastRejectReason = String(obs?.reason || "不明");
  }
  function judgeVenueMirrorIntake(state, nowMs) {
    const na = (
      /** @type {VenueMirrorIntakeVerdict} */
      {
        cause: "unobserved",
        level: "na",
        detail: "",
        nextAction: "",
        agoSec: null
      }
    );
    if (!state || typeof state !== "object") return na;
    const ev = Number(state.changedEvents) || 0;
    const matched = Number(state.keyMatched) || 0;
    const missed = Number(state.keyMissed) || 0;
    const acc = Number(state.accepted) || 0;
    const rej = Number(state.rejectedByGate) || 0;
    if (ev === 0 && acc === 0 && rej === 0) return na;
    const now = Number(nowMs) || 0;
    const lastAcc = Number(state.lastAcceptedAt) || 0;
    const agoSec = lastAcc > 0 && now > lastAcc ? Math.round((now - lastAcc) / 1e3) : null;
    if (matched === 0 && missed > 0) {
      const got = (state.lastMissedKeys || []).join(",") || "?";
      return {
        cause: "key-mismatch",
        level: "bad",
        agoSec,
        detail: `別の配信の鏡を見ています(期待「${state.lastExpectedKey || "?"}」/ 実際「${got}」)`,
        nextAction: "会場タブを開き直してください(配信IDの取り直し)"
      };
    }
    if (matched === 0 && missed === 0) {
      return {
        cause: "no-notify",
        level: "bad",
        agoSec,
        detail: "鏡の変更通知が会場に一度も届いていません(購読が効いていない疑い)",
        nextAction: "会場タブを再読込してください"
      };
    }
    if (rej > 0 && acc === 0) {
      return {
        cause: "gate-reject",
        level: "bad",
        agoSec,
        detail: `届いていますが全て捨てられています(${state.lastRejectReason || "不明"})`,
        nextAction: "①ポップアップを開き直して鏡を作り直してください"
      };
    }
    return {
      cause: "none",
      level: "ok",
      agoSec,
      detail: agoSec != null ? `受け取れています(最終${agoSec}秒前)` : "受け取れています",
      nextAction: ""
    };
  }
  function formatVenueMirrorIntakeLine(state, nowMs) {
    if (!state || typeof state !== "object") return "";
    const ev = Number(state.changedEvents) || 0;
    const matched = Number(state.keyMatched) || 0;
    const missed = Number(state.keyMissed) || 0;
    const acc = Number(state.accepted) || 0;
    const rej = Number(state.rejectedByGate) || 0;
    if (ev === 0 && acc === 0 && rej === 0) return "";
    const v = judgeVenueMirrorIntake(state, nowMs);
    const agoSec = v.agoSec;
    let cause = "";
    if (v.cause === "key-mismatch") {
      const got = (state.lastMissedKeys || []).join(",") || "?";
      cause = ` ★原因=鏡は届いているがキーが一致しない(期待「${state.lastExpectedKey || "?"}」 / 実際「${got}」)＝会場と①で liveId が食い違っています`;
    } else if (v.cause === "no-notify") {
      cause = " ★原因=鏡の変更通知が会場に一度も届いていません(購読が効いていない疑い)";
    } else if (v.cause === "gate-reject") {
      cause = ` ★原因=届いているが関所で全部捨てられています(${state.lastRejectReason})`;
    }
    return `会場の鏡うけとり: 通知${ev}回 / キー一致${matched}・不一致${missed} / 採用${acc}・関所却下${rej}` + (agoSec != null ? ` / 最終採用${agoSec}秒前` : " / まだ一度も採用していません") + cause;
  }

  // src/lib/supportVisualStoryCopy.js
  var SUPPORT_VISUAL_DEV_MONITOR_SUMMARY_LABEL = "詳しい状況（開発・切り分け用）";
  function buildStoryUserLaneStackAriaLabel(laneDisplayedSlots) {
    const n = Math.max(0, Math.floor(Number(laneDisplayedSlots) || 0));
    return `最近の応援ユーザーサムネイル（りんく・こん太・たぬ姉の三段）合計${n}件`;
  }

  // src/lib/giftDeltaFallback.js
  var GIFT_DELTA_TIER_THRESHOLDS = Object.freeze({
    medium: 50,
    large: 500,
    mega: 5e3
  });
  var GIFT_DELTA_MIN_POINTS = 1;
  var GIFT_DELTA_DEBOUNCE_MS = 6e4;
  function makeInitialGiftDeltaState(liveId = "") {
    return {
      lastAggregate: 0,
      accountedPoints: 0,
      synthesizedPoints: 0,
      lastRealEventAt: 0,
      liveId: String(liveId || "")
    };
  }
  function tierForGiftDeltaPoints(points) {
    const pt = Number(points) || 0;
    if (pt >= GIFT_DELTA_TIER_THRESHOLDS.mega) return "mega";
    if (pt >= GIFT_DELTA_TIER_THRESHOLDS.large) return "large";
    if (pt >= GIFT_DELTA_TIER_THRESHOLDS.medium) return "medium";
    return "small";
  }
  function accountRealGiftEvent(prev, points, nowMs) {
    const p = normalizeState(prev);
    const pt = Math.max(0, Number(points) || 0);
    const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
    return {
      ...p,
      accountedPoints: p.accountedPoints + pt,
      lastRealEventAt: now
    };
  }
  function normalizeState(prev) {
    const p = prev && typeof prev === "object" ? prev : null;
    return {
      lastAggregate: Math.max(0, Number(p?.lastAggregate) || 0),
      accountedPoints: Math.max(0, Number(p?.accountedPoints) || 0),
      synthesizedPoints: Math.max(0, Number(p?.synthesizedPoints) || 0),
      lastRealEventAt: Math.max(0, Number(p?.lastRealEventAt) || 0),
      liveId: String(p?.liveId || "")
    };
  }
  function computeGiftDelta(state, aggregatePoints, nowMs, opts = {}) {
    const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
    const liveId = String(opts.liveId ?? "");
    const minPoints = Number.isFinite(Number(opts.minPoints)) && Number(opts.minPoints) > 0 ? Number(opts.minPoints) : GIFT_DELTA_MIN_POINTS;
    const debounceMs = Number.isFinite(Number(opts.debounceMs)) && Number(opts.debounceMs) >= 0 ? Number(opts.debounceMs) : GIFT_DELTA_DEBOUNCE_MS;
    let s = normalizeState(state);
    if (liveId && s.liveId && s.liveId !== liveId) {
      s = makeInitialGiftDeltaState(liveId);
    } else if (liveId && !s.liveId) {
      s = { ...s, liveId };
    }
    const GIFT_DELTA_AGGREGATE_SANITY_MAX = 1e9;
    const aggregate = Math.min(GIFT_DELTA_AGGREGATE_SANITY_MAX, Math.max(0, Math.floor(Number(aggregatePoints) || 0)));
    if (!(aggregate > 0) && s.lastAggregate === 0) {
      return { events: [], nextState: s };
    }
    if (aggregate < s.lastAggregate) {
      return { events: [], nextState: s };
    }
    const nextState = { ...s, lastAggregate: aggregate };
    const realEventRecent = s.lastRealEventAt > 0 && now >= s.lastRealEventAt && now - s.lastRealEventAt < debounceMs;
    if (realEventRecent) {
      return { events: [], nextState };
    }
    const unaccounted = aggregate - s.accountedPoints - s.synthesizedPoints;
    if (unaccounted < minPoints) {
      return { events: [], nextState };
    }
    const tier = tierForGiftDeltaPoints(unaccounted);
    return {
      events: [{ points: unaccounted, tier }],
      nextState: { ...nextState, synthesizedPoints: s.synthesizedPoints + unaccounted }
    };
  }

  // src/lib/liveGiftPulse.js
  var PULSE_MAX_GAP_MS = 15 * 6e4;
  var EMPTY_PULSE = Object.freeze({ byKey: /* @__PURE__ */ new Map(), sum: 0, spanMs: 0, top: null, tier: null });
  function formatPtDelta(d) {
    const n = Math.floor(Number(d) || 0);
    return n > 0 ? `+${n.toLocaleString("ja-JP")}pt` : "";
  }
  function formatCountDelta(d) {
    const n = Math.floor(Number(d) || 0);
    return n > 0 ? `+${n.toLocaleString("ja-JP")}件` : "";
  }

  // src/lib/laneTileStats.js
  function positiveOrNull(n) {
    const v = Math.floor(Number(n));
    return Number.isFinite(v) && v > 0 ? v : null;
  }
  var STATS_TEXT_CACHE_MAX = 5e3;
  var statsTextCache = /* @__PURE__ */ new Map();
  function formatLaneTileStats(stats) {
    if (!stats || typeof stats !== "object") return "";
    const g = positiveOrNull(stats.giftPt);
    const a = positiveOrNull(stats.adPt);
    const c = positiveOrNull(stats.commentCount);
    if (g == null && a == null && c == null) return "";
    const key = `${g ?? ""}|${a ?? ""}|${c ?? ""}`;
    const hit = statsTextCache.get(key);
    if (hit !== void 0) return hit;
    const parts = [];
    if (g != null) parts.push(`🎁${formatNumberJa(g)}`);
    if (a != null) parts.push(`📣${formatNumberJa(a)}`);
    if (c != null) parts.push(`💬${formatNumberJa(c)}`);
    const out = parts.join(" ");
    if (statsTextCache.size >= STATS_TEXT_CACHE_MAX) statsTextCache.clear();
    statsTextCache.set(key, out);
    return out;
  }
  function laneTileStatsLegendText() {
    return "🎁📣は公式の公開pt・💬は拡張が記録した件数";
  }
  function formatLaneTilePulse(pulse) {
    const gift = formatPtDelta(pulse && pulse.giftDelta);
    if (gift) return { text: gift, kind: "gift", tier: String(pulse && pulse.giftTier || "") };
    const hot = formatCountDelta(pulse && pulse.heat);
    if (hot) return { text: hot, kind: "hot", tier: String(pulse && pulse.heatTier || "") };
    return { text: "", kind: "", tier: "" };
  }

  // src/lib/storyUserLaneGuideHtml.js
  function guideCountSpan(count) {
    if (typeof count !== "number" || !Number.isFinite(count) || count < 0) return "";
    return `<span class="nl-story-userlane-guide__count">${Math.floor(count)}人</span>`;
  }
  function storyUserLaneGuideLine(src, textEscaped, count) {
    return `<div class="nl-story-userlane-guide__line"><img class="nl-story-userlane-guide__face" src="${escapeAttr(src)}" alt="" width="24" height="24" decoding="async" /><span class="nl-story-userlane-guide__text">${textEscaped}${guideCountSpan(count)}</span></div>`;
  }
  function buildStoryUserLaneGuideTopHtml(faceLink, count) {
    return storyUserLaneGuideLine(
      faceLink,
      escapeHtml2(
        "りんく: 数値ユーザーID＋個人サムネが揃った応援だけ、この列に載せるよ。匿名（a:）はカスタム表示名やサムネが見えていても上には出さず、下の段に流す設計だよ。"
      ),
      count
    );
  }
  function buildStoryUserLaneGuideGiftHtml(faceGift, count) {
    return storyUserLaneGuideLine(
      faceGift,
      escapeHtml2(
        "ギフト列: この放送でギフトを投げた人を、数値ユーザーIDで記録できた順に並べるよ。個人サムネが取れている人はその画像、まだの人はゆっくり画像で表示するよ。"
      ),
      count
    );
  }
  function buildStoryUserLaneGuideAdHtml(faceAd, count) {
    return storyUserLaneGuideLine(
      faceAd,
      escapeHtml2(
        "広告列: 公式のニコニ広告ランキング（この放送の貢献度順）から広告主を並べるよ。数値ユーザーIDが取れた人は個人サムネ（無ければゆっくり画像）で、ID無しの匿名広告も広告主名で表示するよ。"
      ),
      count
    );
  }
  function buildStoryUserLaneGuideKontaHtml(faceKonta, count) {
    return storyUserLaneGuideLine(
      faceKonta,
      escapeHtml2(
        "こん太: 2番目の優先として、数値IDのアカウントで表示名か個人サムネのどちらかまで取れた人は、その次の段として並びやすいよ。ニコの匿名ID（a: 形式）はここには載せず、りんく条件を満たすときだけりんく、それ以外はたぬ姉側だよ。"
      ),
      count
    );
  }
  function buildStoryUserLaneGuideTanuHtml(faceTanu, count) {
    return storyUserLaneGuideLine(
      faceTanu,
      escapeHtml2(
        `たぬ姉: 匿名（a:）の応援、表示名やサムネが揃わない応援、ID 不明はぜんぶこの段に集めるよ。下の「${SUPPORT_VISUAL_DEV_MONITOR_SUMMARY_LABEL}」を開くと、どこの情報が欠けているか確認してね。`
      ),
      count
    );
  }
  function buildStoryUserLaneGuideFootHtml(displayCount, totalCandidates) {
    const n = Math.max(0, Math.floor(Number(displayCount) || 0));
    const total = Math.max(0, Math.floor(Number(totalCandidates) || 0));
    const others = total > n ? total - n : 0;
    const text = others > 0 ? `いま ${n} 件を表示中（ほか ${others}人・直近アクティブ順）` : `いま ${n} 件を表示中`;
    return `<p class="nl-story-userlane-guide__foot" aria-live="polite">${escapeHtml2(text)}</p>`;
  }
  function buildStoryUserLaneStatsLegendHtml() {
    return `<p class="nl-story-userlane-guide__legend">${escapeHtml2(laneTileStatsLegendText())}</p>`;
  }
  function buildStoryUserLaneGuideFootAndRecordedHtml(laneDisplayedSlots, recordedCommentRowsTotal, totalCandidates, withStatsLegend) {
    let foot = buildStoryUserLaneGuideFootHtml(laneDisplayedSlots, totalCandidates);
    if (withStatsLegend === true && Math.floor(Number(laneDisplayedSlots) || 0) > 0) {
      foot += buildStoryUserLaneStatsLegendHtml();
    }
    if (recordedCommentRowsTotal == null || !Number.isFinite(Number(recordedCommentRowsTotal))) {
      return foot;
    }
    const total = Math.max(0, Math.floor(Number(recordedCommentRowsTotal)));
    if (total <= 0) {
      return foot;
    }
    return foot + `<p class="nl-story-userlane-guide__recorded" aria-live="polite">この放送で記録している応援コメントは <strong>${total}</strong> 件です。上の件数はレーンに並べた人数の合計であり、コメント件数とは数え方が異なります。</p>`;
  }
  function storyUserLaneEmptyNoteTwoLines(line1, line2) {
    return `<p class="nl-story-userlane__empty-note-p">${escapeHtml2(line1)}</p><p class="nl-story-userlane__empty-note-p">${escapeHtml2(line2)}</p>`;
  }
  function buildStoryUserLaneEmptyNoteLinkHtml() {
    return storyUserLaneEmptyNoteTwoLines(
      "この段は「数値ユーザーID＋個人サムネがそろった応援」だけが並ぶよ。いまの記録では該当者がいません。",
      "条件を満たす応援が届くと自動で増えます。"
    );
  }
  function buildStoryUserLaneEmptyNoteGiftHtml() {
    return storyUserLaneEmptyNoteTwoLines(
      "この段は「ギフトを投げた人」だけが並ぶよ。いまの記録では該当者がいません。",
      "ギフトが届くと、送り主の数値IDが取れた人から自動で増えます。"
    );
  }
  function buildVenueFallbackGiftEmptyNoteHtml() {
    return storyUserLaneEmptyNoteTwoLines(
      "ギフト段は①パネル（こん太のパネル）から受け取っています。いまは受け取れていないので、居るかどうか分かりません。",
      "①パネルを開いたままにすると、数十秒で反映されます。"
    );
  }
  function buildStoryUserLaneEmptyNoteKontaHtml() {
    return storyUserLaneEmptyNoteTwoLines(
      "この段は「数値IDで、表示名か個人サムネのどちらかまで取れた応援」だけが並ぶよ。いまの記録では該当者がいません。",
      "条件を満たす応援が届くと自動で増えます。"
    );
  }
  function buildStoryUserLaneEmptyNoteTanuHtml() {
    return storyUserLaneEmptyNoteTwoLines(
      "この段は「匿名（a:）や表示名・サムネが揃わない応援、ID 不明」だけが並ぶよ。いまの記録では該当者がいません。",
      "条件を満たす応援が届くと自動で増えます。"
    );
  }

  // src/lib/laneMirrorKey.js
  var KEY_LANE_MIRROR = "nls_lane_mirror_v1";
  function laneMirrorKeyFor(liveId) {
    const lid = String(liveId || "").trim().toLowerCase();
    if (!lid) return "";
    return `nls_lane_mirror_v2_${lid}`;
  }
  function laneReceiptKeyFor(liveId) {
    const lid = String(liveId || "").trim().toLowerCase();
    if (!lid) return "";
    return `nls_lane_receipt_v1_${lid}`;
  }

  // src/lib/storyDiagMirrorKey.js
  var KEY_STORY_DIAG_MIRROR = "nls_story_diag_mirror_v1";

  // src/lib/commentSummary.js
  var RECENT_ROW_KEEP_KEYS = Object.freeze([
    "id",
    "text",
    "userId",
    "capturedAt",
    "commentNo",
    "no",
    "name",
    "selfPosted",
    "avatar",
    "liveId",
    "lvId"
  ]);

  // src/lib/panelLiveSummary.js
  function panelSummaryStorageKey(liveId) {
    const id = String(liveId || "").trim().toLowerCase();
    return `nls_panel_summary_${id}`;
  }

  // src/lib/laneSceneEnvelope.js
  var TIERS3 = (
    /** @type {const} */
    ["link", "gift", "ad", "konta", "tanu"]
  );
  function djb2Hex(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i += 1) {
      hash = hash * 33 ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
  function laneSceneContentHash(buckets) {
    const b = buckets && typeof buckets === "object" ? buckets : {};
    const parts = [];
    for (const tier of TIERS3) {
      const arr = Array.isArray(
        /** @type {any} */
        b[tier]
      ) ? (
        /** @type {any} */
        b[tier]
      ) : [];
      const cellKeys = arr.map((it) => {
        const c = it && typeof it === "object" ? (
          /** @type {any} */
          it
        ) : {};
        const uid = String(c.userId ?? c.entry?.userId ?? "").trim();
        const displaySrc = String(c.displaySrc || "").trim();
        const title = String(c.title || "").trim();
        return `${uid}|${displaySrc}|${title}`;
      });
      parts.push(`${tier}:${cellKeys.join(",")}`);
    }
    return djb2Hex(parts.join(";"));
  }
  function laneDomFingerprint(perTierKeys) {
    const src = perTierKeys && typeof perTierKeys === "object" ? (
      /** @type {any} */
      perTierKeys
    ) : {};
    const parts = [];
    for (const tier of TIERS3) {
      const arr = Array.isArray(src[tier]) ? src[tier] : [];
      const keys = arr.map((k) => String(k ?? "").trim()).filter(Boolean);
      parts.push(`${tier}:${keys.join(",")}`);
    }
    return djb2Hex(parts.join(";"));
  }
  function buildRenderReceipt(input) {
    const inp = (
      /** @type {any} */
      input && typeof input === "object" ? input : {}
    );
    return {
      surface: inp.surface === "venue" ? "venue" : "pop",
      revision: Math.max(0, Math.floor(Number(inp.revision) || 0)),
      contentHash: String(inp.contentHash || ""),
      domFingerprint: String(inp.domFingerprint || ""),
      paintedAt: Math.max(0, Math.floor(Number(inp.paintedAt) || 0))
    };
  }
  function buildVenueSceneReceipts(input) {
    const inp = (
      /** @type {any} */
      input && typeof input === "object" ? input : {}
    );
    const acceptedSnap = inp.acceptedSnap && typeof inp.acceptedSnap === "object" ? inp.acceptedSnap : null;
    const paintedSnap = inp.paintedSnap && typeof inp.paintedSnap === "object" ? inp.paintedSnap : null;
    if (!acceptedSnap || !paintedSnap) return null;
    const popContentHash = String(acceptedSnap.contentHash || "");
    const venueContentHash = laneSceneContentHash(
      /** @type {any} */
      inp.paintedBuckets
    );
    const domSelf = acceptedSnap.domSelf && typeof acceptedSnap.domSelf === "object" ? acceptedSnap.domSelf : null;
    const fingerprintFor = String(domSelf?.fingerprintFor || "");
    const popDomFingerprint = popContentHash && fingerprintFor && fingerprintFor === popContentHash ? String(domSelf?.fingerprint || "") : "";
    return {
      popReceipt: buildRenderReceipt({
        surface: "pop",
        revision: Number(acceptedSnap.capturedAt) || 0,
        contentHash: popContentHash,
        domFingerprint: popDomFingerprint
      }),
      venueReceipt: buildRenderReceipt({
        surface: "venue",
        revision: Number(paintedSnap.capturedAt) || 0,
        contentHash: venueContentHash,
        domFingerprint: String(inp.venueDomFingerprint || "")
      })
    };
  }
  function compareRenderReceipts(popReceipt, venueReceipt) {
    if (!popReceipt || !venueReceipt) {
      return { match: false, line: "scene 未計測(①または会場のReceiptなし)" };
    }
    if (popReceipt.revision !== venueReceipt.revision) {
      const laggingBy = popReceipt.revision - venueReceipt.revision;
      return {
        match: false,
        line: `scene ①r${popReceipt.revision}≠会場r${venueReceipt.revision}(${laggingBy > 0 ? `${laggingBy}ms遅れ` : `${-laggingBy}ms先行`}) 🔴`
      };
    }
    if (popReceipt.contentHash !== venueReceipt.contentHash) {
      return {
        match: false,
        line: `scene r${popReceipt.revision} hash①${popReceipt.contentHash}≠会場${venueReceipt.contentHash} 🔴`
      };
    }
    const popFp = String(popReceipt.domFingerprint || "");
    const venueFp = String(venueReceipt.domFingerprint || "");
    if (!popFp || !venueFp) {
      return {
        match: false,
        line: `scene r${popReceipt.revision} hash${popReceipt.contentHash} 指紋未計測(①${popFp || "無"}/会場${venueFp || "無"}) ⚪`
      };
    }
    if (popFp !== venueFp) {
      return {
        match: false,
        line: `scene r${popReceipt.revision} 指紋①${popFp}≠会場${venueFp} 🔴`
      };
    }
    return {
      match: true,
      line: `scene r${popReceipt.revision} hash${popReceipt.contentHash} 指紋${popFp} ①=会場 ✅`
    };
  }

  // src/lib/laneMirror.js
  var LANE_MIRROR_MAX_JSON_BYTES = 512 * 1024;
  function restoreMirrorPulse(p) {
    const o = (
      /** @type {{ g?: unknown, gt?: unknown, h?: unknown, ht?: unknown }|null} */
      p && typeof p === "object" ? p : null
    );
    if (!o) return void 0;
    const out = {};
    const g = Math.floor(Number(o.g));
    if (g > 0) {
      out.giftDelta = g;
      out.giftTier = typeof o.gt === "string" ? o.gt : "";
    }
    const h = Math.floor(Number(o.h));
    if (h > 0) {
      out.heat = h;
      out.heatTier = typeof o.ht === "string" ? o.ht : "";
    }
    return Object.keys(out).length ? out : void 0;
  }
  function restoreMirrorStats(s) {
    const o = (
      /** @type {{ c?: unknown, g?: unknown, a?: unknown }|null} */
      s && typeof s === "object" ? s : null
    );
    if (!o) return void 0;
    const pos = (v) => {
      const n = Math.floor(Number(v));
      return v != null && n > 0 ? n : null;
    };
    const r = { commentCount: pos(o.c), giftPt: pos(o.g), adPt: pos(o.a) };
    return r.commentCount != null || r.giftPt != null || r.adPt != null ? r : void 0;
  }
  function restoreLaneMirrorBuckets(snap) {
    const s = (
      /** @type {any} */
      snap && typeof snap === "object" ? snap : {}
    );
    const restore = (arr) => (Array.isArray(arr) ? arr : []).map((c) => {
      const cell = (
        /** @type {LaneMirrorCell} */
        c && typeof c === "object" ? c : {}
      );
      const userId = String(cell.userId || "").trim();
      const displaySrc = String(cell.displaySrc || "") || (userId ? anonymousIdenticonDataUrl(userId, 64) : "");
      const stats = restoreMirrorStats(cell.stats);
      const pulse = restoreMirrorPulse(cell.pulse);
      const recentTexts = Array.isArray(cell.recentTexts) ? cell.recentTexts.filter((t) => typeof t === "string" && t) : [];
      return {
        displaySrc,
        title: String(cell.title || ""),
        meta: { idLine: String(cell.idLine || ""), nameLine: String(cell.nameLine || "") },
        entry: { userId },
        ...stats ? { stats } : {},
        ...pulse ? { pulse } : {},
        ...recentTexts.length ? { recentTexts } : {}
      };
    });
    return {
      link: restore(s.link),
      gift: restore(s.gift),
      ad: restore(s.ad),
      konta: restore(s.konta),
      tanu: restore(s.tanu)
    };
  }
  function isReceiptComparable(snap, receipt) {
    const hash = String(snap?.contentHash || "").trim();
    const forHash = String(receipt?.fingerprintFor || "").trim();
    const fp = String(receipt?.fingerprint || "").trim();
    if (!hash) return { comparable: false, reason: "鏡にcontentHashが無い" };
    if (!receipt) return { comparable: false, reason: "受領証が無い(未描画)" };
    if (!fp) return { comparable: false, reason: "指紋未計測" };
    if (!forHash) return { comparable: false, reason: "受領証が対象内容を名乗っていない" };
    if (forHash !== hash) return { comparable: false, reason: "受領証は別の内容を測っている(世代差)" };
    return { comparable: true, reason: "" };
  }

  // src/lib/venueGeometryVerdict.js
  function keyOf(v) {
    return String(v == null ? "" : v).trim();
  }
  function classifyVenueGeometryDiff(popupGeometry, venueGeometry) {
    const popKey = keyOf(popupGeometry?.tileKey);
    const venueKey = keyOf(venueGeometry?.tileKey);
    if (!popKey || !venueKey) {
      return {
        cause: "unknown_target",
        sameTarget: false,
        note: "測定対象の識別子が取れず、CSS差か測定ズレか判定できません"
      };
    }
    if (popKey === venueKey) {
      return {
        cause: "css_mismatch",
        sameTarget: true,
        note: "同一人物を測って寸法が違う=CSSの不一致"
      };
    }
    return {
      cause: "measured_different_people",
      sameTarget: false,
      note: `別人を測っています(①${popKey} / 会場${venueKey})=名前の長さ差で、CSS不一致ではありません`
    };
  }
  function formatVenueGeometryCause(label, verdict) {
    const cause = verdict?.cause;
    if (cause === "css_mismatch") return `${label}:幾何差(同一人物=CSS不一致)`;
    if (cause === "measured_different_people") return `${label}:測定対象ズレ(別人=CSS不一致ではない)`;
    return `${label}:幾何差(対象不明)`;
  }

  // src/lib/venueDomCensus.js
  var VENUE_CENSUS_SECTIONS = Object.freeze(["link", "gift", "ad", "konta", "tanu"]);
  var TILE_SELECTOR = ".nl-story-userlane-cell";
  var SEAT_SELECTOR = ".nlsb-seat";
  var SEAT_EMPTY_CLASS = "nlsb-is-empty";
  var LANE_SELECTOR = ".nl-story-userlane";
  var AVATAR_IMG_SELECTOR = "img.nl-story-userlane-avatar";
  var BLANK_AVATAR_RE = /\/usericon\/defaults\//i;
  var NUMERIC_UID_KEY_RE = /^u:\d+$/;
  function nonNegativeDimension(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  function emptySectionCount() {
    return {
      visible: 0,
      tileW: 0,
      tileH: 0,
      // v0.1.1212: tileW/tileH を測った当のタイルの userKey。①側(laneDomSelfMeasure)と
      //   突き合わせ、別人を測っていたなら「幾何差」ではなく「測定対象ズレ」と判定するため。
      tileKey: "",
      ghost: 0,
      bare: 0,
      visibleEmpty: 0,
      unkeyed: 0,
      blank: 0,
      blankAnon: 0,
      keys: []
    };
  }
  function countSection(rootEl) {
    const out = emptySectionCount();
    if (!rootEl || typeof rootEl.querySelectorAll !== "function") return out;
    for (const tile of rootEl.querySelectorAll(TILE_SELECTOR)) {
      const seat = typeof tile.closest === "function" ? tile.closest(SEAT_SELECTOR) : null;
      const inSeat = !!(seat && rootEl.contains(seat));
      if (inSeat && seat.classList.contains(SEAT_EMPTY_CLASS)) continue;
      if (!inSeat) out.bare += 1;
      if (out.visible === 0) {
        out.tileW = nonNegativeDimension(tile.offsetWidth);
        out.tileH = nonNegativeDimension(tile.offsetHeight);
        out.tileKey = String(tile.dataset && tile.dataset.userKey || "").trim();
      }
      out.visible += 1;
      const key = String(tile.dataset && tile.dataset.userKey || "").trim();
      if (key) out.keys.push(key);
      else out.unkeyed += 1;
      const img = typeof tile.querySelector === "function" ? tile.querySelector(AVATAR_IMG_SELECTOR) : null;
      if (img && BLANK_AVATAR_RE.test(String(img.src || img.getAttribute?.("src") || ""))) {
        out.blank += 1;
        if (!NUMERIC_UID_KEY_RE.test(key)) out.blankAnon += 1;
      }
    }
    for (const seat of rootEl.querySelectorAll(SEAT_SELECTOR)) {
      if (seat.classList.contains(SEAT_EMPTY_CLASS)) {
        if (seat.childElementCount > 0) out.ghost += 1;
      } else if (!seat.querySelector(TILE_SELECTOR)) {
        out.visibleEmpty += 1;
      }
    }
    return out;
  }
  function collectVenueLaneDomCensus(input) {
    const inp = input && typeof input === "object" ? input : {};
    const laneEls = inp.laneEls && typeof inp.laneEls === "object" ? inp.laneEls : {};
    const perSection = {};
    for (const sec of VENUE_CENSUS_SECTIONS) {
      perSection[sec] = countSection(laneEls[sec]);
    }
    let strays = 0;
    const stackEl = inp.stackEl;
    if (stackEl && typeof stackEl.querySelectorAll === "function") {
      for (const tile of stackEl.querySelectorAll(TILE_SELECTOR)) {
        if (typeof tile.closest !== "function" || !tile.closest(LANE_SELECTOR)) strays += 1;
      }
    }
    const extras = inp.extras && typeof inp.extras === "object" ? inp.extras : {};
    const charFrameLayer = extras.charFrameLayer;
    const charFrameTiles = charFrameLayer && Number.isFinite(Number(charFrameLayer.childElementCount)) ? Math.max(0, Number(charFrameLayer.childElementCount)) : 0;
    const probeIn = extras.avatarProbe && typeof extras.avatarProbe === "object" ? extras.avatarProbe : null;
    const rawDpr = typeof window !== "undefined" ? Number(window.devicePixelRatio) : 1;
    return {
      perSection: (
        /** @type {any} */
        perSection
      ),
      dpr: Number.isFinite(rawDpr) && rawDpr > 0 ? rawDpr : 1,
      strays,
      charFrameTiles,
      crowdOn: extras.crowdOn === true,
      crowdCount: Math.max(0, Math.floor(Number(extras.crowdCount) || 0)),
      avatarProbe: probeIn ? {
        usericonSucceeded: Math.max(0, Math.floor(Number(probeIn.usericonSucceeded) || 0)),
        usericonFailed: Math.max(0, Math.floor(Number(probeIn.usericonFailed) || 0)),
        failedTimeout: Math.max(0, Math.floor(Number(probeIn.failedTimeout) || 0)),
        failedError: Math.max(0, Math.floor(Number(probeIn.failedError) || 0)),
        retriedTotal: Math.max(0, Math.floor(Number(probeIn.retriedTotal) || 0)),
        lastFailAgoMs: Number.isFinite(Number(probeIn.lastFailAgoMs)) && Number(probeIn.lastFailAgoMs) >= 0 ? Math.floor(Number(probeIn.lastFailAgoMs)) : null
      } : null
    };
  }
  function countVenueKeyDuplicates(perSection) {
    const ps = perSection && typeof perSection === "object" ? perSection : {};
    let dupIntra = 0;
    const sectionsByKey = /* @__PURE__ */ new Map();
    for (const sec of VENUE_CENSUS_SECTIONS) {
      const keys = Array.isArray(ps[sec]?.keys) ? ps[sec].keys : [];
      const seen = /* @__PURE__ */ new Set();
      for (const k of keys) {
        if (seen.has(k)) dupIntra += 1;
        seen.add(k);
        const set = sectionsByKey.get(k) || /* @__PURE__ */ new Set();
        set.add(sec);
        sectionsByKey.set(k, set);
      }
    }
    let dupCross = 0;
    for (const secs of sectionsByKey.values()) {
      const laneCount = secs.size;
      if (laneCount > 1) dupCross += laneCount - 1;
    }
    return { dupIntra, dupCross };
  }
  function venueDomCensusToParityDom(census) {
    if (!census || typeof census !== "object" || !census.perSection) return null;
    const dup = countVenueKeyDuplicates(census.perSection);
    const perSection = {};
    let ghost = 0;
    let bare = 0;
    let visibleEmpty = 0;
    let unkeyed = 0;
    let blank = 0;
    let blankAnon = 0;
    for (const sec of VENUE_CENSUS_SECTIONS) {
      const c = census.perSection[sec] || emptySectionCount();
      perSection[sec] = {
        visible: Math.max(0, Math.floor(Number(c.visible) || 0)),
        tileW: nonNegativeDimension(c.tileW),
        tileH: nonNegativeDimension(c.tileH),
        ghost: Math.max(0, Math.floor(Number(c.ghost) || 0)),
        bare: Math.max(0, Math.floor(Number(c.bare) || 0)),
        visibleEmpty: Math.max(0, Math.floor(Number(c.visibleEmpty) || 0)),
        unkeyed: Math.max(0, Math.floor(Number(c.unkeyed) || 0)),
        blank: Math.max(0, Math.floor(Number(c.blank) || 0)),
        blankAnon: Math.max(0, Math.floor(Number(c.blankAnon) || 0))
      };
      ghost += perSection[sec].ghost;
      bare += perSection[sec].bare;
      visibleEmpty += perSection[sec].visibleEmpty;
      unkeyed += perSection[sec].unkeyed;
      blank += perSection[sec].blank;
      blankAnon += perSection[sec].blankAnon;
    }
    return {
      measured: true,
      perSection,
      dpr: Number.isFinite(Number(census.dpr)) && Number(census.dpr) > 0 ? Number(census.dpr) : 1,
      ghost,
      bare,
      visibleEmpty,
      unkeyed,
      blank,
      blankAnon,
      dupIntra: dup.dupIntra,
      dupCross: dup.dupCross,
      strays: Math.max(0, Math.floor(Number(census.strays) || 0)),
      charFrame: Math.max(0, Math.floor(Number(census.charFrameTiles) || 0)),
      crowdOn: census.crowdOn === true,
      crowdCount: Math.max(0, Math.floor(Number(census.crowdCount) || 0)),
      probeOk: Math.max(0, Math.floor(Number(census.avatarProbe?.usericonSucceeded) || 0)),
      probeFail: Math.max(0, Math.floor(Number(census.avatarProbe?.usericonFailed) || 0)),
      probeFailTimeout: Math.max(0, Math.floor(Number(census.avatarProbe?.failedTimeout) || 0)),
      probeFailError: Math.max(0, Math.floor(Number(census.avatarProbe?.failedError) || 0)),
      probeRetried: Math.max(0, Math.floor(Number(census.avatarProbe?.retriedTotal) || 0)),
      probeLastFailAgoSec: Number.isFinite(Number(census.avatarProbe?.lastFailAgoMs)) && Number(census.avatarProbe?.lastFailAgoMs) >= 0 ? Math.floor(Number(census.avatarProbe.lastFailAgoMs) / 1e3) : null
    };
  }

  // src/lib/venueLaneParity.js
  var VENUE_LANE_MIRROR_SOFT_WINDOW_MS = 18e4;
  var VENUE_LANE_MIRROR_HARD_WINDOW_MS = 9e5;
  var VENUE_LANE_TRANSIENT_WINDOW_MS = 6e4;
  var VENUE_TILE_GEOMETRY_TOLERANCE = 0.1;
  function positiveMetric(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  function geometryDiffers(a, b) {
    if (!(a > 0) || !(b > 0)) return false;
    return Math.abs(a - b) / Math.max(a, b) > VENUE_TILE_GEOMETRY_TOLERANCE;
  }
  var TIERS4 = (
    /** @type {const} */
    ["link", "gift", "ad", "konta", "tanu"]
  );
  var TIER_LABEL = { link: "link", gift: "gift", ad: "ad", konta: "konta", tanu: "tanu" };
  function venueLaneParityKey(cellOrItem) {
    const c = (
      /** @type {any} */
      cellOrItem && typeof cellOrItem === "object" ? cellOrItem : {}
    );
    const uid = String(c.userId ?? c.entry?.userId ?? "").trim();
    if (uid) return `u:${uid}`;
    const idLine = String(c.idLine ?? c.meta?.idLine ?? "").trim();
    const title = String(c.title ?? "").trim();
    const composite = `${idLine}|${title}`;
    return composite === "|" ? "" : `c:${composite}`;
  }
  function laneMirrorTierKeySequences(snap) {
    const s = (
      /** @type {any} */
      snap && typeof snap === "object" ? snap : {}
    );
    const out = (
      /** @type {Record<string, string[]>} */
      {}
    );
    for (const tier of TIERS4) {
      const arr = Array.isArray(s[tier]) ? s[tier] : [];
      out[tier] = arr.map((c) => venueLaneParityKey(c)).filter(Boolean);
    }
    return (
      /** @type {any} */
      out
    );
  }
  function buildVenueLaneParity(input) {
    const inp = (
      /** @type {any} */
      input && typeof input === "object" ? input : {}
    );
    const liveId = String(inp.liveId || "").trim().toLowerCase();
    const nowMs = Number.isFinite(Number(inp.nowMs)) ? Number(inp.nowMs) : 0;
    const snap = inp.snap && typeof inp.snap === "object" ? inp.snap : null;
    const painted = inp.painted && typeof inp.painted === "object" ? inp.painted : {};
    const transientKeys = inp.transientKeys instanceof Set ? inp.transientKeys : new Set(Array.isArray(inp.transientKeys) ? inp.transientKeys : []);
    const visibleShown = Math.max(0, Math.floor(Number(inp.visibleShown) || 0));
    const logicalTotal = Math.max(0, Math.floor(Number(inp.logicalTotal) || 0));
    const mode = inp.mode === "mirror" ? "mirror" : "fallback";
    const snapLiveId = String(snap?.liveId || "").trim().toLowerCase();
    const capturedAt = Math.max(0, Number(snap?.capturedAt) || 0);
    const mirrorAgeMs = capturedAt > 0 ? Math.max(0, nowMs - capturedAt) : Number.POSITIVE_INFINITY;
    const mirrorAgeSec = Number.isFinite(mirrorAgeMs) ? Math.round(mirrorAgeMs / 1e3) : -1;
    let mirrorIssue = "";
    if (!snap) mirrorIssue = "鏡なし";
    else if (!snapLiveId || liveId && snapLiveId !== liveId) mirrorIssue = "鏡は別配信";
    else if (mirrorAgeMs > VENUE_LANE_MIRROR_HARD_WINDOW_MS) mirrorIssue = `鏡staleHard(${mirrorAgeSec}s→fallback降格)`;
    else if (mirrorAgeMs > VENUE_LANE_MIRROR_SOFT_WINDOW_MS) mirrorIssue = `鏡stale(${mirrorAgeSec}s)`;
    const popSeq = laneMirrorTierKeySequences(snap);
    const popTotalCells = TIERS4.reduce((a, t) => a + popSeq[t].length, 0);
    const pickedLength = Math.max(0, Math.floor(Number(snap?.pickedLength) || 0));
    const mirrorPruned = popTotalCells > 0 && pickedLength > popTotalCells;
    const perTier = {};
    const unexplainedSamples = [];
    let unexplainedCount = 0;
    for (const tier of TIERS4) {
      const pop = popSeq[tier];
      const drawn = Array.isArray(painted[tier]) ? painted[tier].map(String).filter(Boolean) : [];
      const popSet = new Set(pop);
      let prefixOk = true;
      let missing = 0;
      if (mode === "mirror" && !mirrorIssue) {
        for (let i = 0; i < pop.length; i += 1) {
          if (drawn[i] !== pop[i]) {
            prefixOk = false;
            break;
          }
        }
        if (!prefixOk) {
          const drawnSet = new Set(drawn);
          for (const k of pop) {
            if (!drawnSet.has(k)) {
              missing += 1;
              if (unexplainedSamples.length < 5) unexplainedSamples.push(`${tier}:欠${k}`);
            }
          }
          if (missing === 0) {
            const at = pop.findIndex((k, i) => drawn[i] !== k);
            if (unexplainedSamples.length < 5) unexplainedSamples.push(`${tier}:順序@${at}`);
            unexplainedCount += 1;
          }
          unexplainedCount += missing;
        }
      } else {
        prefixOk = false;
      }
      let tail = 0;
      let transientCount = 0;
      for (const k of drawn) {
        if (popSet.has(k)) continue;
        if (transientKeys.has(k)) transientCount += 1;
        else tail += 1;
        if (mode === "mirror" && !mirrorIssue) {
          unexplainedCount += 1;
          if (unexplainedSamples.length < 5) unexplainedSamples.push(`${tier}:余${k}`);
        }
      }
      perTier[tier] = {
        pop: pop.length,
        painted: drawn.length,
        prefixOk,
        tail,
        transient: transientCount,
        missing
      };
    }
    const isMirrorJudgingEarly = mode === "mirror" && !mirrorIssue;
    const domIn = (
      /** @type {any} */
      inp.dom && typeof inp.dom === "object" ? inp.dom : null
    );
    const domMeasured = !!(domIn && domIn.measured === true && domIn.perSection && typeof domIn.perSection === "object");
    const popDomIn = snap?.domSelf && typeof snap.domSelf === "object" ? (
      /** @type {any} */
      snap.domSelf
    ) : null;
    const popDomMeasured = !!(popDomIn && popDomIn.measured === true && popDomIn.perTier && typeof popDomIn.perTier === "object");
    const popDomMismatchParts = [];
    const geometryMismatchParts = [];
    const geometryMissingParts = [];
    const popupDpr = popDomMeasured ? positiveMetric(popDomIn.dpr) || 1 : 1;
    const venueDpr = domMeasured ? positiveMetric(domIn.dpr) || 1 : 1;
    if (popDomMeasured) {
      for (const tier of TIERS4) {
        const visible = Math.max(0, Math.floor(Number(popDomIn.perTier[tier]?.visible) || 0));
        const expected = perTier[tier].pop;
        const diff = visible - expected;
        if (diff === 0) continue;
        popDomMismatchParts.push(`${tier}:可視${visible}(鏡${expected})`);
        if (isMirrorJudgingEarly) {
          unexplainedCount += Math.abs(diff);
          if (unexplainedSamples.length < 5) {
            unexplainedSamples.push(diff > 0 ? `${tier}:①DOM余${diff}` : `${tier}:①DOM欠${-diff}`);
          }
        }
      }
    }
    const domMismatchParts = [];
    if (domMeasured) {
      const checkSection = (sec, expected) => {
        const c = domIn.perSection[sec] || {};
        const visible = Math.max(0, Math.floor(Number(c.visible) || 0));
        const bare = Math.max(0, Math.floor(Number(c.bare) || 0));
        const diff = visible - expected;
        if (diff === 0) return;
        domMismatchParts.push(
          `${/** @type {any} */
          TIER_LABEL[sec]}:可視${visible}(データ${expected}${bare > 0 ? ` 裸${bare}` : ""})`
        );
        if (isMirrorJudgingEarly) {
          unexplainedCount += Math.abs(diff);
          if (unexplainedSamples.length < 5) {
            unexplainedSamples.push(diff > 0 ? `${sec}:DOM余${diff}` : `${sec}:DOM欠${-diff}`);
          }
        }
      };
      for (const tier of TIERS4) checkSection(tier, perTier[tier].painted);
      if (popDomMeasured) {
        const readGeometry = (source, dpr) => ({
          visible: Math.max(0, Math.floor(Number(source?.visible) || 0)),
          tileW: positiveMetric(source?.tileW),
          tileH: positiveMetric(source?.tileH),
          physicalW: positiveMetric(source?.tileW) * dpr,
          physicalH: positiveMetric(source?.tileH) * dpr,
          // v0.1.1212: 寸法を測った当のタイルが誰か。①と会場で別人を測っていれば
          //   名前長の差でタイル幅が変わるだけで、CSS不一致ではない。
          tileKey: String(source?.tileKey || "").trim()
        });
        const compareGeometry = (label, popupGeometry, venueGeometry) => {
          if (!(popupGeometry.tileW > 0 && popupGeometry.tileH > 0 && venueGeometry.tileW > 0 && venueGeometry.tileH > 0)) {
            geometryMissingParts.push(label);
            return;
          }
          if (!geometryDiffers(popupGeometry.physicalW, venueGeometry.physicalW) && !geometryDiffers(popupGeometry.physicalH, venueGeometry.physicalH)) return;
          const cause = classifyVenueGeometryDiff(popupGeometry, venueGeometry);
          geometryMismatchParts.push(
            `${label}:${venueGeometry.tileW}×${venueGeometry.tileH}px(①${popupGeometry.tileW}×${popupGeometry.tileH}px${cause.sameTarget ? "・同一人物" : cause.cause === "measured_different_people" ? "・別人を測定" : ""})`
          );
          if (isMirrorJudgingEarly) {
            unexplainedCount += 1;
            if (unexplainedSamples.length < 5) {
              unexplainedSamples.push(formatVenueGeometryCause(label, cause));
            }
          }
        };
        for (const tier of TIERS4) {
          const popupGeometry = readGeometry(popDomIn.perTier[tier], popupDpr);
          const venueGeometry = readGeometry(domIn.perSection[tier], venueDpr);
          if (popupGeometry.visible > 0 && venueGeometry.visible > 0) {
            compareGeometry(tier, popupGeometry, venueGeometry);
          }
        }
      }
    }
    const domGhost = domMeasured ? Math.max(0, Math.floor(Number(domIn.ghost) || 0)) : 0;
    const domDupTotal = domMeasured ? Math.max(0, Math.floor(Number(domIn.dupIntra) || 0)) + Math.max(0, Math.floor(Number(domIn.dupCross) || 0)) : 0;
    const expectedDup = countVenueKeyDuplicates(
      Object.fromEntries(
        TIERS4.map((t) => [t, { keys: Array.isArray(painted[t]) ? painted[t].map(String).filter(Boolean) : [] }])
      )
    );
    const expectedDupTotal = expectedDup.dupIntra + expectedDup.dupCross;
    const domDupExcess = Math.max(0, domDupTotal - expectedDupTotal);
    const domStrays = domMeasured ? Math.max(0, Math.floor(Number(domIn.strays) || 0)) : 0;
    const domVisibleEmpty = domMeasured ? Math.max(0, Math.floor(Number(domIn.visibleEmpty) || 0)) : 0;
    const domUnkeyed = domMeasured ? Math.max(0, Math.floor(Number(domIn.unkeyed) || 0)) : 0;
    const domAnomalyCount = domDupExcess + domStrays + domVisibleEmpty + domUnkeyed;
    let verdict;
    let reason;
    if (mode !== "mirror" || mirrorIssue) {
      verdict = "⚪";
      reason = mirrorIssue || "fallback(鏡未使用)";
    } else if (unexplainedCount > 0) {
      verdict = "🔴";
      reason = `未説明${unexplainedCount}`;
    } else if (domMeasured && domAnomalyCount > 0) {
      verdict = "🔴";
      reason = `DOM異常(重複超過${domDupExcess}(データ内${expectedDupTotal}) 迷子${domStrays} 空可視${domVisibleEmpty} 無鍵${domUnkeyed})`;
    } else if (!domMeasured) {
      verdict = "⚪";
      reason = "DOM未計測";
    } else if (!popDomMeasured) {
      verdict = "⚪";
      reason = "①DOM未計測";
    } else if (geometryMissingParts.length > 0) {
      verdict = "⚪";
      reason = `寸法未計測(${geometryMissingParts.join(",")})`;
    } else if (mirrorPruned) {
      verdict = "⚪";
      reason = "鏡縮退(判定は鏡範囲のみ)";
    } else {
      verdict = "✅";
      reason = "";
    }
    const isMirrorJudging = mode === "mirror" && !mirrorIssue;
    const totalTransientInLanes = TIERS4.reduce((a, t) => a + perTier[t].transient, 0);
    const tierStr = TIERS4.map((t) => {
      const p = perTier[t];
      const tailStr = !isMirrorJudging && p.tail > 0 ? `+尾${p.tail}` : "";
      return `${TIER_LABEL[t]}${p.pop}${tailStr}`;
    }).join(" ");
    const ageStr = mirrorAgeSec >= 0 && Number.isFinite(mirrorAgeMs) ? `鏡(${mirrorAgeSec}s前)` : "鏡なし";
    const midStr = isMirrorJudging ? "" : ` / 暫定${totalTransientInLanes}`;
    let domStr;
    if (!domMeasured) {
      domStr = " / DOM未計測";
    } else if (domMismatchParts.length > 0) {
      domStr = ` / DOM≠ ${domMismatchParts.join(" ")} / 重複${domDupTotal}${expectedDupTotal > 0 ? `(データ内${expectedDupTotal})` : ""} 迷子${domStrays}`;
    } else {
      domStr = ` / DOM=データ${domGhost > 0 ? `(幽${domGhost})` : ""}` + (domDupTotal > 0 || domStrays > 0 ? ` / 重複${domDupTotal}${expectedDupTotal > 0 ? `(データ内${expectedDupTotal})` : ""} 迷子${domStrays}` : "");
    }
    const popDomMeasuredAt = popDomMeasured ? Math.max(0, Number(popDomIn.measuredAt) || 0) : 0;
    const popDomAgeMs = popDomMeasuredAt > 0 && capturedAt > 0 ? capturedAt - popDomMeasuredAt : -1;
    const popDomAgeStr = popDomAgeMs > VENUE_LANE_MIRROR_SOFT_WINDOW_MS ? ` / ①DOM齢${Math.round(popDomAgeMs / 1e3)}s` : "";
    const popDomStr = (!popDomMeasured ? " / ①DOM未計測" : popDomMismatchParts.length > 0 ? ` / ①DOM≠鏡 ${popDomMismatchParts.join(" ")}` : " / ①DOM=鏡") + popDomAgeStr;
    let geometryStr = "";
    if (popDomMeasured && domMeasured) {
      if (geometryMismatchParts.length > 0) {
        geometryStr = ` / 幾何≠ ${geometryMismatchParts.join(" ")}`;
      } else if (geometryMissingParts.length > 0) {
        geometryStr = ` / 幾何未計測(${geometryMissingParts.join(",")})`;
      } else {
        geometryStr = " / 幾何=一致";
      }
    }
    const domBlank = domMeasured ? Math.max(0, Math.floor(Number(domIn.blank) || 0)) : 0;
    const domBlankAnon = domMeasured ? Math.max(0, Math.floor(Number(domIn.blankAnon) || 0)) : 0;
    const domProbeFail = domMeasured ? Math.max(0, Math.floor(Number(domIn.probeFail) || 0)) : 0;
    const domProbeFailTimeout = domMeasured ? Math.max(0, Math.floor(Number(domIn.probeFailTimeout) || 0)) : 0;
    const domProbeFailError = domMeasured ? Math.max(0, Math.floor(Number(domIn.probeFailError) || 0)) : 0;
    const domProbeRetried = domMeasured ? Math.max(0, Math.floor(Number(domIn.probeRetried) || 0)) : 0;
    const extraStr = domMeasured ? (domIn.crowdOn === true ? ` / 群衆on(${Math.max(0, Math.floor(Number(domIn.crowdCount) || 0))})` : "") + (Number(domIn.charFrame) > 0 ? ` / 額縁${Math.floor(Number(domIn.charFrame))}` : "") + (domUnkeyed > 0 ? ` / 無鍵${domUnkeyed}` : "") + (domVisibleEmpty > 0 ? ` / 空可視${domVisibleEmpty}` : "") + (domBlank > 0 ? ` / 白円${domBlank}(匿名${domBlankAnon})` : "") + (domProbeFail > 0 ? ` / 顔404=${domProbeFail}(t:${domProbeFailTimeout},e:${domProbeFailError})` : "") + (domProbeRetried > 0 ? ` / 顔再試行${domProbeRetried}` : "") : "";
    const line = `会場一致 ${verdict}${verdict === "⚪" ? reason : ageStr} ${tierStr}` + midStr + domStr + popDomStr + geometryStr + ` / 未説明${unexplainedCount}` + (unexplainedSamples.length > 0 ? `(${unexplainedSamples.join(", ")})` : "") + (visibleShown < logicalTotal ? ` / 表示${visibleShown}/${logicalTotal}` : "") + extraStr;
    return {
      mode,
      verdict,
      reason,
      mirrorAgeSec: Number.isFinite(mirrorAgeMs) ? mirrorAgeSec : -1,
      mirrorPruned,
      perTier: (
        /** @type {any} */
        perTier
      ),
      unexplained: { count: unexplainedCount, sampleKeys: unexplainedSamples },
      visibleShown,
      logicalTotal,
      // v3: 実DOM census 要約(perSection は line に写した後なので落とす=storage を太らせない)。
      dom: domMeasured ? {
        measured: true,
        ghost: domGhost,
        bare: Math.max(0, Math.floor(Number(domIn.bare) || 0)),
        visibleEmpty: domVisibleEmpty,
        unkeyed: domUnkeyed,
        blank: domBlank,
        blankAnon: domBlankAnon,
        dupIntra: Math.max(0, Math.floor(Number(domIn.dupIntra) || 0)),
        dupCross: Math.max(0, Math.floor(Number(domIn.dupCross) || 0)),
        strays: domStrays,
        charFrame: Math.max(0, Math.floor(Number(domIn.charFrame) || 0)),
        crowdOn: domIn.crowdOn === true,
        crowdCount: Math.max(0, Math.floor(Number(domIn.crowdCount) || 0)),
        probeFail: domProbeFail,
        probeFailTimeout: domProbeFailTimeout,
        probeFailError: domProbeFailError,
        probeRetried: domProbeRetried
      } : null,
      line
    };
  }
  function toVenueLaneParityDiag(parity) {
    if (!parity || typeof parity !== "object") return null;
    const dom = (
      /** @type {any} */
      parity.dom
    );
    return {
      mode: String(parity.mode || ""),
      verdict: String(parity.verdict || ""),
      reason: String(parity.reason || ""),
      line: String(parity.line || ""),
      unexplained: Math.max(0, Math.floor(Number(parity.unexplained?.count) || 0)),
      mirrorAgeSec: Math.floor(Number(parity.mirrorAgeSec) || 0),
      dom: dom && typeof dom === "object" && dom.measured === true ? {
        measured: true,
        ghost: Math.max(0, Math.floor(Number(dom.ghost) || 0)),
        bare: Math.max(0, Math.floor(Number(dom.bare) || 0)),
        visibleEmpty: Math.max(0, Math.floor(Number(dom.visibleEmpty) || 0)),
        unkeyed: Math.max(0, Math.floor(Number(dom.unkeyed) || 0)),
        blank: Math.max(0, Math.floor(Number(
          /** @type {any} */
          dom.blank
        ) || 0)),
        blankAnon: Math.max(0, Math.floor(Number(
          /** @type {any} */
          dom.blankAnon
        ) || 0)),
        dupIntra: Math.max(0, Math.floor(Number(dom.dupIntra) || 0)),
        dupCross: Math.max(0, Math.floor(Number(dom.dupCross) || 0)),
        strays: Math.max(0, Math.floor(Number(dom.strays) || 0)),
        charFrame: Math.max(0, Math.floor(Number(dom.charFrame) || 0)),
        crowdOn: dom.crowdOn === true,
        crowdCount: Math.max(0, Math.floor(Number(dom.crowdCount) || 0)),
        probeFail: Math.max(0, Math.floor(Number(
          /** @type {any} */
          dom.probeFail
        ) || 0)),
        probeFailTimeout: Math.max(0, Math.floor(Number(
          /** @type {any} */
          dom.probeFailTimeout
        ) || 0)),
        probeFailError: Math.max(0, Math.floor(Number(
          /** @type {any} */
          dom.probeFailError
        ) || 0)),
        // venue-avatar-stale-mirror-DESIGN.md §C-1(段階1): 顔再試行回数(実測)。
        probeRetried: Math.max(0, Math.floor(Number(
          /** @type {any} */
          dom.probeRetried
        ) || 0))
      } : null
    };
  }

  // src/lib/venueLaneMirrorSupply.js
  var TIERS5 = (
    /** @type {const} */
    ["link", "gift", "ad", "konta", "tanu"]
  );
  var TIER_PROFILE = { link: 3, gift: 3, ad: 3, konta: 2, tanu: 1 };
  function isHttpUrl2(u) {
    return /^https?:\/\//i.test(String(u || "").trim());
  }
  function isLaneMirrorUsableForVenue(snap, liveId, nowMs) {
    if (!snap || typeof snap !== "object") return { usable: false, reason: "absent" };
    const snapLive = String(snap.liveId || "").trim().toLowerCase();
    const cur = String(liveId || "").trim().toLowerCase();
    if (!snapLive || !cur || snapLive !== cur) return { usable: false, reason: "liveIdMismatch" };
    const capturedAt = Number(snap.capturedAt) || 0;
    const now = Number(nowMs) || 0;
    if (capturedAt <= 0) return { usable: false, reason: "staleHard" };
    const ageMs = now - capturedAt;
    if (ageMs > VENUE_LANE_MIRROR_HARD_WINDOW_MS) {
      return { usable: false, reason: "staleHard" };
    }
    if (ageMs > VENUE_LANE_MIRROR_SOFT_WINDOW_MS) {
      return { usable: false, reason: "stale" };
    }
    const total = TIERS5.reduce(
      (a, t) => a + (Array.isArray(
        /** @type {any} */
        snap[t]
      ) ? (
        /** @type {any} */
        snap[t].length
      ) : 0),
      0
    );
    if (total <= 0) return { usable: false, reason: "empty" };
    return { usable: true, reason: "" };
  }
  function shouldAdoptLaneMirrorForVenue(snap, liveId) {
    if (!snap || typeof snap !== "object") return false;
    const snapLive = String(snap.liveId || "").trim().toLowerCase();
    const cur = String(liveId || "").trim().toLowerCase();
    return Boolean(snapLive && cur && snapLive === cur);
  }
  function countLaneMirrorCells(snap) {
    if (!snap || typeof snap !== "object") return 0;
    const s = (
      /** @type {any} */
      snap
    );
    return TIERS5.reduce((a, t) => a + (Array.isArray(s[t]) ? s[t].length : 0), 0);
  }
  function decideVenueMirrorAdoption(current, incoming, liveId, nowMs) {
    const from = countLaneMirrorCells(current);
    const to = countLaneMirrorCells(incoming);
    if (!shouldAdoptLaneMirrorForVenue(incoming, liveId)) return { adopt: false, shrunk: false, from, to };
    const sameLive = current && String(current.liveId || "").trim().toLowerCase() === String(liveId || "").trim().toLowerCase();
    if (!sameLive || to >= from) return { adopt: true, shrunk: false, from, to };
    const heldAt = Number(current.capturedAt) || 0;
    const heldAge = (Number(nowMs) || 0) - heldAt;
    if (heldAt <= 0 || heldAge > VENUE_LANE_MIRROR_HARD_WINDOW_MS) return { adopt: true, shrunk: true, from, to };
    return { adopt: false, shrunk: true, from, to };
  }
  function venueRowsFromLaneMirror(snap, candidatesByUid) {
    const s = (
      /** @type {any} */
      snap && typeof snap === "object" ? snap : {}
    );
    const byUid = candidatesByUid instanceof Map ? candidatesByUid : /* @__PURE__ */ new Map();
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    const fallbackAt = Math.max(0, Number(s.capturedAt) || 0);
    for (const tier of TIERS5) {
      const arr = Array.isArray(s[tier]) ? s[tier] : [];
      for (const cell of arr) {
        const uid = String(cell?.userId || "").trim();
        if (!uid || seen.has(uid)) continue;
        seen.add(uid);
        const cand = (
          /** @type {any} */
          byUid.get(uid) || null
        );
        const giftCount = Math.max(0, Math.floor(Number(cand?.giftCount) || 0));
        out.push({
          userId: uid,
          name: String(cell?.title || "").trim(),
          // displaySrc は http 実サムネのときだけ avatar として引き継ぐ(identicon データURL等は
          //   会場側の生成に任せる=enrich 関所とも整合)。
          avatar: isHttpUrl2(cell?.displaySrc) ? String(cell.displaySrc).trim() : "",
          text: "",
          // v0.1.1220: ホバーカードの直近発言。会場は鏡が使えるとき鏡を優先するので、
          //   ここを通さないと候補側に足しても届かない(v0.1.1218/1219 で2回踏んだ)。
          recentTexts: Array.isArray(cell?.recentTexts) ? cell.recentTexts.slice() : [],
          capturedAt: Math.max(0, Number(cand?._laneSortAt) || 0) || fallbackAt,
          preCount: Math.max(1, Math.floor(Number(cand?.commentCount) || 0) || 1),
          preHasGift: giftCount > 0,
          preGiftCount: giftCount,
          // 2026-10-16(発言の証拠): 候補があれば候補の実数、無ければ鏡セルの stats.c と本文だけ(★鏡の発行時刻から発言時刻を作らない)。
          speech: cand ? speechEvidenceFromCandidate(cand) : speechEvidenceFromMirrorCell(cell)
        });
      }
    }
    return out;
  }
  function composeVenueLaneBuckets(input) {
    const inp = (
      /** @type {any} */
      input && typeof input === "object" ? input : {}
    );
    const mirror = inp.mirrorBuckets && typeof inp.mirrorBuckets === "object" ? inp.mirrorBuckets : {};
    const seatIndexByUid = inp.seatIndexByUid instanceof Map ? inp.seatIndexByUid : /* @__PURE__ */ new Map();
    const out = {};
    for (const tier of TIERS5) {
      const rows = [];
      const arr = Array.isArray(mirror[tier]) ? mirror[tier] : [];
      for (let i = 0; i < arr.length; i += 1) {
        const cell = arr[i] || {};
        const uid = String(cell?.entry?.userId || "").trim();
        const seatIdxRaw = uid && seatIndexByUid.has(uid) ? Number(seatIndexByUid.get(uid)) : -1;
        rows.push({
          entryIndex: i,
          profileTier: TIER_PROFILE[tier] || 1,
          thumbScore: isHttpUrl2(cell?.displaySrc) ? 2 : 0,
          displaySrc: String(cell?.displaySrc || ""),
          title: String(cell?.title || ""),
          entry: { userId: uid },
          meta: {
            idLine: String(cell?.meta?.idLine || ""),
            nameLine: String(cell?.meta?.nameLine || "")
          },
          // 席が無い(uid無し/席未割当)アイテムは -1 = wrapTileEl が素通し(席ラップしない)。
          // v0.1.1562: タイル 3 行目の値。個別列挙で作り直す型なので明示的に引き継ぐ(落とすと会場だけ黙って消える)。
          ...cell?.stats ? { stats: cell.stats } : {},
          ...cell?.pulse ? { pulse: cell.pulse } : {},
          // 2026-10-12: 発言(ホバーカードの「セリフ」)。同上=個別列挙で作り直すので明示的に引き継ぐ。
          ...Array.isArray(cell?.recentTexts) && cell.recentTexts.length ? { recentTexts: cell.recentTexts.slice() } : {},
          _venueSeatIndex: Number.isInteger(seatIdxRaw) && seatIdxRaw >= 0 ? seatIdxRaw : -1,
          _venueIsVip: isHttpUrl2(cell?.displaySrc),
          _venueMirror: true
        });
      }
      out[tier] = rows;
    }
    return (
      /** @type {any} */
      { buckets: out }
    );
  }
  function venueSeatIndexByUid(visibleSeats) {
    const map = /* @__PURE__ */ new Map();
    const list = Array.isArray(visibleSeats) ? visibleSeats : [];
    for (const entry of list) {
      const uid = String(entry?.participant?.userId || "").trim();
      if (!uid || map.has(uid)) continue;
      const idx = Math.floor(Number(entry?.seatIndex));
      if (Number.isInteger(idx) && idx >= 0) map.set(uid, idx);
    }
    return map;
  }
  function venueMirrorAgeNotice(mode, mirrorAgeSec, softWindowSec = 180) {
    if (String(mode) === "fallback") return "①パネル未接続";
    const sec = Number(mirrorAgeSec);
    if (!Number.isFinite(sec) || sec < 0) return "";
    const soft = Number.isFinite(Number(softWindowSec)) ? Number(softWindowSec) : 180;
    if (sec <= soft) return "";
    const min = Math.max(1, Math.round(sec / 60));
    return `①の鏡 ${min}分前（①パネルを開くと更新）`;
  }

  // src/lib/personTileDom.js
  function buildPersonTileEl(p, io) {
    const fullUid = String(p.entry?.userId || "").trim();
    const pageUrl = nicoUserPageUrl(fullUid);
    const isLinkable = isNumericNicoUserId(fullUid) && pageUrl !== "";
    const cell = isLinkable ? document.createElement("a") : document.createElement("span");
    cell.className = "nl-story-userlane-cell";
    if (isLinkable) {
      cell.href = pageUrl;
      cell.target = "_blank";
      cell.rel = "noopener noreferrer";
      cell.classList.add("nl-story-userlane-cell--linkable");
    }
    const img = document.createElement("img");
    img.className = "nl-story-userlane-avatar";
    const requestedLane = p.displaySrc;
    const displayLane = io.storyAvatarLoadGuard.pickDisplaySrc(requestedLane);
    const cachedFace = fullUid && requestedLane.startsWith("data:image/svg+xml") && typeof io.cachedAnonymousFace === "function" ? io.cachedAnonymousFace(fullUid) : "";
    img.src = cachedFace || displayLane;
    io.storyAvatarLoadGuard.noteRemoteAttempt(img, requestedLane);
    img.classList.toggle(
      "nl-avatar--tv-fallback",
      io.storyTileUsesYukkuriTvStyle(requestedLane, displayLane)
    );
    img.alt = "";
    const tip = fullUid && fullUid !== p.meta.idLine ? `${p.title} | ${fullUid}` : p.title;
    img.title = tip;
    cell.title = tip;
    img.decoding = "async";
    if (io.isHttpOrHttpsUrl(img.src)) {
      img.referrerPolicy = "no-referrer";
    }
    if (fullUid && requestedLane.startsWith("data:image/svg+xml") && typeof io.upgradeAnonymousAvatarImage === "function") {
      io.upgradeAnonymousAvatarImage(img, fullUid, 64);
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
    return cell;
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
  var DEFAULT_RETRY_POLICY = Object.freeze({ baseMs: 3e4, maxMs: 6e5, maxAttempts: 5 });
  function isProbeRetryEligible(rec, nowMs, policy) {
    if (!policy || typeof policy !== "object") return false;
    if (!rec || typeof rec !== "object") return false;
    const failCount = Math.max(1, Number(rec.failCount) || 1);
    const maxAttempts = Math.max(1, Number(policy.maxAttempts) || DEFAULT_RETRY_POLICY.maxAttempts);
    if (failCount >= maxAttempts) return false;
    const baseMs = Math.max(1, Number(policy.baseMs) || DEFAULT_RETRY_POLICY.baseMs);
    const maxMs = Math.max(baseMs, Number(policy.maxMs) || DEFAULT_RETRY_POLICY.maxMs);
    const backoffMs = Math.min(maxMs, baseMs * 2 ** (failCount - 1));
    const lastFailAt = Number(rec.lastFailAt) || 0;
    if (!(lastFailAt > 0)) return false;
    return nowMs - lastFailAt > backoffMs;
  }
  function createSupportAvatarLoadGuard(options) {
    const fallbackSrc = String(options?.fallbackSrc || "");
    const fallbackSrcFor = typeof options?.fallbackSrcFor === "function" ? options.fallbackSrcFor : null;
    const resolveFallback = (requestedSrc) => {
      if (!fallbackSrcFor) return fallbackSrc;
      try {
        const s = String(fallbackSrcFor(String(requestedSrc || "")) || "").trim();
        return s || fallbackSrc;
      } catch {
        return fallbackSrc;
      }
    };
    const urlKeyFn = typeof options?.urlKey === "function" ? options.urlKey : defaultUrlKey;
    const retryPolicy = options?.retryPolicy && typeof options.retryPolicy === "object" ? options.retryPolicy : null;
    const onFallbackApplied = typeof options?.onFallbackApplied === "function" ? options.onFallbackApplied : null;
    const onRemoteSuccess = typeof options?.onRemoteSuccess === "function" ? options.onRemoteSuccess : null;
    const timeoutRaw = Number(options?.timeoutMs);
    const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 3e3;
    const failedKeys = /* @__PURE__ */ new Map();
    const succeededKeys = /* @__PURE__ */ new Set();
    const activeProbes = /* @__PURE__ */ new WeakMap();
    let retriedTotal = 0;
    function pickDisplaySrc(requestedSrc) {
      const req = String(requestedSrc || "").trim();
      if (!req) return resolveFallback(req);
      if (!isHttpOrHttpsUrl(req)) return req;
      if (req === fallbackSrc) return req;
      const key = urlKeyFn(req);
      if (key && failedKeys.has(key)) return resolveFallback(req);
      if (key && succeededKeys.has(key)) return req;
      return resolveFallback(req);
    }
    function noteRemoteAttempt(img, requestedSrc) {
      if (!(img instanceof HTMLImageElement)) return null;
      const req = String(requestedSrc || "").trim();
      if (!isHttpOrHttpsUrl(req)) return null;
      if (req === fallbackSrc) return null;
      const key = urlKeyFn(req);
      if (!key) return null;
      if (failedKeys.has(key)) {
        const eligible = isProbeRetryEligible(failedKeys.get(key), Date.now(), retryPolicy);
        try {
          img.dataset.nlsbAvatarRetrySrc = req;
        } catch {
        }
        if (!eligible) return null;
        retriedTotal += 1;
      }
      const cancelPrev = activeProbes.get(img);
      if (cancelPrev) {
        cancelPrev();
        activeProbes.delete(img);
      }
      if (succeededKeys.has(key)) {
        if (img.getAttribute("src") !== req) {
          img.src = req;
          onRemoteSuccess?.(img);
        }
        return null;
      }
      let settled = false;
      let timer = null;
      const probe = document.createElement("img");
      const cleanup = () => {
        if (timer != null) {
          clearTimeout(timer);
          timer = null;
        }
        activeProbes.delete(img);
      };
      const applyFailed = (kind) => {
        if (settled) return;
        settled = true;
        const prev = failedKeys.get(key);
        failedKeys.set(key, {
          kind,
          failCount: (prev?.failCount || 0) + 1,
          lastFailAt: Date.now()
        });
        try {
          img.dataset.nlsbAvatarRetrySrc = req;
        } catch {
        }
        const alt = resolveFallback(req);
        if (alt && img.getAttribute("src") !== alt) {
          try {
            img.src = alt;
          } catch {
          }
        }
        onFallbackApplied?.(img);
        cleanup();
      };
      const applySuccess = () => {
        if (settled) return;
        settled = true;
        succeededKeys.add(key);
        failedKeys.delete(key);
        img.src = req;
        try {
          delete img.dataset.nlsbAvatarRetrySrc;
        } catch {
        }
        onRemoteSuccess?.(img);
        cleanup();
      };
      probe.addEventListener("load", applySuccess, { once: true });
      probe.addEventListener("error", () => applyFailed("error"), { once: true });
      timer = setTimeout(() => applyFailed("timeout"), timeoutMs);
      activeProbes.set(img, () => {
        if (!settled) {
          settled = true;
          cleanup();
        }
      });
      probe.src = req;
      return probe;
    }
    function clearFailedUrls() {
      failedKeys.clear();
      succeededKeys.clear();
    }
    function clearTimedOutFailures() {
      for (const [key, rec] of failedKeys) {
        if (rec.kind === "timeout") failedKeys.delete(key);
      }
    }
    function retrySweep(rootEl, nowMs) {
      const result = { scanned: 0, retried: 0 };
      if (!rootEl || typeof rootEl.querySelectorAll !== "function") return result;
      if (!retryPolicy) return result;
      const imgs = rootEl.querySelectorAll("img[data-nlsb-avatar-retry-src]");
      for (const img of imgs) {
        result.scanned += 1;
        const req = String(img.dataset.nlsbAvatarRetrySrc || "").trim();
        if (!req) continue;
        const key = urlKeyFn(req);
        if (!key) continue;
        const rec = failedKeys.get(key);
        if (!rec) {
          try {
            delete img.dataset.nlsbAvatarRetrySrc;
          } catch {
          }
          continue;
        }
        if (!isProbeRetryEligible(rec, nowMs, retryPolicy)) continue;
        if (activeProbes.has(img)) continue;
        noteRemoteAttempt(img, req);
        result.retried += 1;
      }
      return result;
    }
    function markFailedForTests(url, kind = "error") {
      const k = urlKeyFn(String(url || ""));
      if (k) failedKeys.set(k, { kind, failCount: 1, lastFailAt: Date.now() });
    }
    function markSucceededForTests(url) {
      const k = urlKeyFn(String(url || ""));
      if (k) succeededKeys.add(k);
    }
    function getDiagnostics() {
      const isUsericon = (k) => /\/nicoaccount\/usericon\//i.test(String(k || ""));
      let usericonSucceeded = 0;
      for (const k of succeededKeys) if (isUsericon(k)) usericonSucceeded += 1;
      let usericonFailed = 0;
      let failedTimeout = 0;
      let failedError = 0;
      let lastFailAt = 0;
      const failedUsericonSamples = [];
      for (const [k, rec] of failedKeys) {
        if (rec.kind === "timeout") failedTimeout += 1;
        else failedError += 1;
        if (rec.lastFailAt > lastFailAt) lastFailAt = rec.lastFailAt;
        if (!isUsericon(k)) continue;
        usericonFailed += 1;
        if (failedUsericonSamples.length < 5) failedUsericonSamples.push(k);
      }
      return {
        succeededTotal: succeededKeys.size,
        failedTotal: failedKeys.size,
        usericonSucceeded,
        usericonFailed,
        failedUsericonSamples,
        failedTimeout,
        failedError,
        retriedTotal,
        lastFailAgoMs: lastFailAt > 0 ? Math.max(0, Date.now() - lastFailAt) : null
      };
    }
    return {
      pickDisplaySrc,
      noteRemoteAttempt,
      clearFailedUrls,
      clearTimedOutFailures,
      retrySweep,
      markFailedForTests,
      markSucceededForTests,
      getDiagnostics
    };
  }

  // src/lib/storyAvatarTvFallbackClass.js
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
  function removeStoryAvatarTvFallbackClass(img) {
    if (!(img instanceof HTMLImageElement)) return;
    img.classList.remove(
      "nl-story-growth-icon--tv-fallback",
      "nl-story-detail-img--tv-fallback",
      "nl-avatar--tv-fallback"
    );
    if (isHttpOrHttpsUrl(img.src)) {
      img.referrerPolicy = "no-referrer";
    }
  }

  // src/lib/storyTileTvStyle.js
  function storyTileUsesYukkuriTvStyle(requestedSrc, displaySrc) {
    const r = String(requestedSrc == null ? "" : requestedSrc);
    const d = String(displaySrc == null ? "" : displaySrc);
    return r.includes("yukkuri-charactore-english") || d.includes("yukkuri-charactore-english");
  }

  // src/lib/storyUserLaneMeta.js
  function storyUserLaneMetaLines(entry, httpCandidate, userLaneDedupeKey = "") {
    const uid = String(entry?.userId || "").trim();
    const nick = String(entry?.nickname || "").trim();
    const hasHttp = isHttpOrHttpsUrl(httpCandidate);
    const dk = String(userLaneDedupeKey || "");
    if (!uid) {
      if (dk.startsWith("t:")) {
        return {
          idLine: "—",
          nameLine: "ユーザーID未取得（サムネURLで区別）"
        };
      }
      if (dk.startsWith("s:")) {
        return {
          idLine: "—",
          nameLine: "ユーザーID未取得（行IDで区別）"
        };
      }
      return { idLine: "—", nameLine: "ID未取得" };
    }
    if (isAnonymousStyleNicoUserId(uid)) {
      const idLine2 = compactNicoLaneUserId(uid);
      const nameLine = anonymousNicknameFallback(uid, nick);
      return {
        idLine: idLine2 || "—",
        nameLine: nameLine || "—"
      };
    }
    const idLine = shortUserKeyDisplay(uid) || uid;
    const numeric = /^\d{5,14}$/.test(uid);
    if (numeric && hasHttp && nick) {
      return { idLine, nameLine: nick };
    }
    if (numeric && !nick) {
      return { idLine, nameLine: formatNicknameWithUidFallback(uid, "") || "（未取得）" };
    }
    if (nick) {
      return { idLine, nameLine: nick };
    }
    return { idLine, nameLine: formatNicknameWithUidFallback(uid, "") || "（未取得）" };
  }

  // src/lib/storyUserLaneBuckets.js
  function bucketStoryUserLanePicks(sortedCandidates, maxTotal) {
    const n = Math.max(0, Math.floor(Number(maxTotal) || 0));
    const a3 = sortedCandidates.filter((c) => c.profileTier === 3);
    const a2 = sortedCandidates.filter((c) => c.profileTier === 2);
    const a1 = sortedCandidates.filter((c) => c.profileTier === 1);
    let rem = n;
    const link = a3.slice(0, rem);
    rem -= link.length;
    const konta = a2.slice(0, rem);
    rem -= konta.length;
    const tanu = a1.slice(0, rem);
    return { link, konta, tanu };
  }

  // src/lib/storyUserLaneSort.js
  function storyUserLaneUidSortRank(uidRaw) {
    const s = String(uidRaw || "").trim();
    if (/^\d{5,14}$/.test(s)) return 0;
    if (isNiconicoAnonymousUserId(s)) return 1;
    return 2;
  }
  function compareStoryUserLaneCandidates(a, b) {
    const tierA = Number(a?.profileTier) || 0;
    const tierB = Number(b?.profileTier) || 0;
    if (tierB !== tierA) return tierB - tierA;
    const thumbA = Number(a?.thumbScore) || 0;
    const thumbB = Number(b?.thumbScore) || 0;
    if (thumbB !== thumbA) return thumbB - thumbA;
    const ua = String(a?.entry?.userId || "").trim();
    const ub = String(b?.entry?.userId || "").trim();
    const ra = storyUserLaneUidSortRank(ua);
    const rb = storyUserLaneUidSortRank(ub);
    if (ra !== rb) return ra - rb;
    if (ua !== ub) return ua < ub ? -1 : ua > ub ? 1 : 0;
    const indexA = Number(a?.entryIndex) || 0;
    const indexB = Number(b?.entryIndex) || 0;
    return indexB - indexA;
  }

  // src/lib/storyUserLaneDisplaySrc.js
  function userLaneHttpForTilePick(userId, primaryHttp, storedRaw) {
    const preferred = supportGridPersonalThumbPreferredUrl(
      String(userId ?? ""),
      String(primaryHttp ?? ""),
      String(storedRaw ?? "")
    );
    if (preferred) return preferred;
    const h = String(primaryHttp ?? "").trim();
    if (!isHttpOrHttpsUrl(h)) return "";
    return h;
  }
  function pickStoryUserLaneCellDisplaySrc(p) {
    const uid = String(p?.userId ?? "").trim();
    const tier = Math.max(0, Math.floor(Number(p?.profileTier) || 0));
    const httpRaw = String(p?.httpCandidate ?? "").trim();
    const stripHttp = tier < 3 && isNiconicoAnonymousUserId(uid);
    const http = stripHttp ? "" : httpRaw;
    return pickSupportGrowthTileWithOptionalIdenticon(
      uid,
      http,
      p.yukkuriSrc,
      p.tvSrc,
      p.identiconOpts
    );
  }

  // src/domain/user/nickname.js
  function isNiconicoAutoUserPlaceholderNickname2(nick) {
    const n = String(nick ?? "").trim();
    if (!n) return false;
    return /^user[0-9A-Za-z]{4,20}$/i.test(n);
  }
  function isStrongNickname(nick, userId) {
    const n = String(nick ?? "").trim();
    if (!n) return false;
    if (isNiconicoAutoUserPlaceholderNickname2(n)) return false;
    if (n === "（未取得）" || n === "(未取得)") return false;
    if (n === "匿名") return false;
    if (n === "ゲスト" || /^guest$/i.test(n)) return false;
    if (isAnonymousStyleNicoUserId2(userId) && n.length <= 1) return false;
    return true;
  }

  // src/domain/lane/columns/linkPolicy.js
  function matchesLinkPolicy(entry) {
    const uid = String(entry?.userId || "").trim();
    if (!uid) return false;
    if (isAnonymousStyleNicoUserId2(uid)) return false;
    const kinds = entry?.avatarObservationKinds;
    const observedAny = kinds instanceof Set && kinds.size > 0 || Array.isArray(kinds) && kinds.length > 0 || Boolean(entry?.avatarObserved);
    if (observedAny) return true;
    if (entry?.hasNonCanonicalPersonalUrl) return true;
    if (isStrongNickname(entry?.nickname, uid)) return true;
    return false;
  }

  // src/domain/lane/columns/kontaPolicy.js
  function matchesKontaPolicy(entry) {
    const uid = String(entry?.userId || "").trim();
    if (!uid) return false;
    if (isAnonymousStyleNicoUserId2(uid)) return false;
    if (matchesLinkPolicy(entry)) return false;
    return true;
  }

  // src/domain/lane/columns/tanuPolicy.js
  function matchesTanuPolicy(entry) {
    const uid = String(entry?.userId || "").trim();
    if (!uid) return false;
    return isAnonymousStyleNicoUserId2(uid);
  }

  // src/domain/lane/tier.js
  function resolveLaneTier(entry) {
    const uid = String(entry?.userId || "").trim();
    if (!uid) return 0;
    if (matchesTanuPolicy(entry)) return 1;
    if (matchesLinkPolicy(entry)) return 3;
    if (matchesKontaPolicy(entry)) return 2;
    return 1;
  }

  // src/lib/storyUserLaneRowModel.js
  function userLaneProfileCompletenessTier(entry, httpAvatarCandidate) {
    const uid = String(entry?.userId || "").trim();
    if (!uid) return 0;
    const nickname = String(entry?.nickname || "").trim();
    const observed = Boolean(entry?.avatarObserved);
    const ex = explainSupportGridDisplayTier({
      userId: uid,
      nickname,
      httpAvatarCandidate: String(httpAvatarCandidate ?? "").trim(),
      storedAvatarUrl: String(entry?.avatarUrl || "").trim(),
      avatarObserved: observed
    });
    return resolveLaneTier({
      userId: uid,
      nickname,
      avatarObserved: observed,
      hasNonCanonicalPersonalUrl: Boolean(ex.hasPersonalThumb)
    });
  }
  function buildStoryUserLaneCandidateRow(entry, entryIndex, httpFromGrowth, pickCtx) {
    const uidRaw = String(entry?.userId || "").trim();
    if (!uidRaw) return null;
    const rawAvStored = String(entry?.avatarUrl || "").trim();
    const httpTrim = String(httpFromGrowth ?? "").trim();
    const httpForLane = userLaneHttpForTilePick(uidRaw, httpTrim, rawAvStored);
    const profileTier = userLaneProfileCompletenessTier(entry, httpForLane);
    const displaySrc = pickStoryUserLaneCellDisplaySrc({
      userId: entry?.userId,
      httpCandidate: httpForLane,
      profileTier,
      yukkuriSrc: pickCtx.yukkuriSrc,
      tvSrc: pickCtx.tvSrc,
      identiconOpts: {
        anonymousIdenticonEnabled: pickCtx.anonymousIdenticonEnabled,
        anonymousIdenticonDataUrl: String(pickCtx.anonymousIdenticonDataUrl ?? "")
      }
    });
    if (!displaySrc) return null;
    const thumbScore = userLaneResolvedThumbScore(entry?.userId, httpForLane, pickCtx?.verifiedAvatarUids);
    return {
      entryIndex,
      profileTier,
      thumbScore,
      displaySrc,
      httpForLane,
      entry
    };
  }

  // src/lib/storyLaneAvatarSrc.js
  function resolveStoryLaneAvatarSrc(entry, ctx) {
    const snap = ctx?.snapshot;
    const bc = String(snap?.broadcasterUserId || "").trim();
    const broadcasterIconUrl = String(snap?.broadcasterIconUrl || "").trim();
    const entUid = String(entry?.userId || "").trim();
    const viewerUid = String(snap?.viewerUserId || "").trim();
    const own = ctx?.isOwnPosted === true || Boolean(viewerUid && entUid && entUid === viewerUid);
    const guardedRememberedSource = String(ctx?.rememberedAvatar ?? "").trim();
    const avatarUrl = String(entry?.avatarUrl || "").trim();
    const viewerAvatarUrl = String(snap?.viewerAvatarUrl || "").trim();
    const mistakenBroadcaster = !own && Boolean(bc && entUid && bc === entUid);
    const guardAv = (av) => {
      if (!av) return "";
      if (!isAvatarUrlForUserId2(av, entUid)) return "";
      return shouldAssociateAvatarWithUser({
        uid: entUid,
        av,
        broadcasterUid: bc,
        broadcasterIconUrl
      }) ? av : "";
    };
    const guardedRememberedAvatar = guardAv(guardedRememberedSource);
    const guardedAvatarUrl = guardAv(avatarUrl);
    const fallbackAvatar = mistakenBroadcaster || viewerAvatarUrl && isSameAvatarUrl(guardedAvatarUrl, viewerAvatarUrl) && !own ? "" : guardedRememberedAvatar;
    const effectiveAvatar = viewerAvatarUrl && isSameAvatarUrl(guardedAvatarUrl, viewerAvatarUrl) && !own ? "" : guardedAvatarUrl;
    const rawUserId = entry?.userId;
    const userIdForResolve = typeof rawUserId === "string" ? rawUserId : rawUserId == null ? null : String(rawUserId);
    const src = resolveSupportGrowthTileSrc({
      entryAvatarUrl: effectiveAvatar || fallbackAvatar,
      userId: mistakenBroadcaster ? null : userIdForResolve,
      isOwnPosted: own,
      viewerAvatarUrl: snap?.viewerAvatarUrl,
      defaultSrc: ""
    });
    return isHttpOrHttpsUrl(src) ? src : "";
  }

  // src/lib/venueLaneBuckets.js
  var TIER_PROFILE2 = { link: 3, konta: 2, tanu: 1 };
  function venueSeatEntryToLaneItem(seatEntry, opts = {}) {
    if (!seatEntry || typeof seatEntry !== "object") return null;
    const participant = seatEntry.participant && typeof seatEntry.participant === "object" ? seatEntry.participant : null;
    if (!participant) return null;
    const uid = String(participant.userId || "").trim();
    const key = String(participant.key || (uid ? `u:${uid}` : "")).trim();
    if (!uid && !key) return null;
    const seatIndex = Math.max(0, Math.floor(Number(seatEntry.seatIndex) || 0));
    const fallbackLabel = String(opts.fallbackLabel || `会場${seatIndex + 1}`);
    const rawName = String(participant.name || "").trim();
    const displayName = rawName || (uid ? anonymousDisplayLabel(uid) : anonymousDisplayLabel(key || fallbackLabel));
    const avatarUrl = String(participant.avatar || "").trim();
    const entryIndex = Number.isFinite(Number(participant.lastAt)) ? Math.max(0, Math.floor(Number(participant.lastAt))) : seatIndex;
    const pickCtxIn = opts.pickCtx && typeof opts.pickCtx === "object" ? opts.pickCtx : {};
    const entryModel = { userId: uid, nickname: rawName, avatarUrl };
    let row = null;
    if (uid) {
      try {
        row = buildStoryUserLaneCandidateRow(
          entryModel,
          entryIndex,
          // ①の storyGrowthAvatarSrcCandidate 相当。会場は popup 固有 state(watchMeta/own判定/
          //   remembered)を持たないため snapshot=null/own=false/remembered='' で渡す
          //   =avatar 取り違えガードだけ①と同じ経路を通す(enrich 済み participant.avatar が入力)。
          //
          //   ★avatar-stability-DESIGN.md §A 裁定(2026-07-18・意図的・未実装の穴ではない):
          //   rememberedAvatar='' は popup の rememberedAvatarUrlForUserId の【第2分岐】
          //   (STORY_SOURCE_STATE.entries 逆順走査=popup 専用のメモリ上生コメント配列)相当を
          //   「埋めない」という確定裁定。第1分岐(profileCache)相当は entryModel.avatarUrl 経由で
          //   既に enrichVenueRowsWithProfileAvatars(venueAvatar.js)がカバー済みなので、
          //   ここで欠けているのは第2分岐の狭い残余窓だけ(白丸ではなく UID 合成 URL に落ちる)。
          //   会場に生 entries 配列相当の新 state を持たせるコストに見合わないため埋めない。
          //   再裁定条件: popup 側 avatarRememberedDiag.hitEntriesScan の実配信比率が無視できない
          //   (目安1%超)なら再検討(avatar-stability-DESIGN.md §A/§E 参照)。
          resolveStoryLaneAvatarSrc(entryModel, { snapshot: null, isOwnPosted: false, rememberedAvatar: "" }),
          {
            yukkuriSrc: String(pickCtxIn.yukkuriSrc || ""),
            tvSrc: String(pickCtxIn.tvSrc || NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS),
            anonymousIdenticonEnabled: pickCtxIn.anonymousIdenticonEnabled !== false,
            // ①の getCachedAnonymousIdenticonDataUrl と同条件(匿名系IDのみ生成)。
            anonymousIdenticonDataUrl: isAnonymousStyleNicoUserId(uid) ? anonymousIdenticonDataUrl(uid) : ""
          }
        );
      } catch {
        row = null;
      }
    }
    const httpForLane = row ? String(row.httpForLane || "") : "";
    const displaySrc = row ? row.displaySrc : uid ? anonymousIdenticonDataUrl(uid, 64) : anonymousIdenticonDataUrl(key || fallbackLabel, 64);
    const legacyHttpAvatar = avatarUrl || deriveNicoUserIconUrl(uid);
    const legacyTierName = supportGridDisplayTier({
      userId: uid,
      nickname: rawName,
      httpAvatarCandidate: legacyHttpAvatar,
      storedAvatarUrl: avatarUrl,
      avatarObserved: false
    });
    const meta = storyUserLaneMetaLines({ userId: uid, nickname: rawName }, httpForLane, key);
    const speakerKey = uid ? `u:${uid}` : rawName ? `n:${rawName}` : "";
    return {
      entryIndex,
      profileTier: row ? row.profileTier : TIER_PROFILE2[legacyTierName] || 1,
      thumbScore: row ? row.thumbScore : userLaneResolvedThumbScore(uid, legacyHttpAvatar),
      displaySrc,
      title: displayName,
      entry: { userId: uid },
      meta,
      _venueSeatIndex: seatIndex,
      _venueParticipantKey: key,
      _venueRank: Math.max(0, Math.floor(Number(seatEntry.venueRank) || 0)),
      _venueIsVip: Boolean(legacyHttpAvatar),
      _venueSpeakerKey: speakerKey,
      _venueAvatarUrl: avatarUrl,
      _venueRawName: rawName
    };
  }
  function bucketVenueLaneSeats(seatEntries, opts = {}) {
    const list = Array.isArray(seatEntries) ? seatEntries : [];
    const maxTotal = Number.isFinite(Number(opts.maxTotal)) ? Math.max(0, Math.floor(Number(opts.maxTotal))) : list.length;
    const candidates = list.map((entry) => venueSeatEntryToLaneItem(entry, { pickCtx: opts.pickCtx })).filter(Boolean).sort(compareStoryUserLaneCandidates);
    const laneCands = candidates.filter((it) => String(it?.entry?.userId || "").trim() !== "");
    const b = bucketStoryUserLanePicks(laneCands, maxTotal);
    return { link: b.link, gift: [], ad: [], konta: b.konta, tanu: b.tanu };
  }
  function flattenVenueLaneBuckets(buckets) {
    return [
      ...Array.isArray(buckets.link) ? buckets.link : [],
      ...Array.isArray(buckets.gift) ? buckets.gift : [],
      ...Array.isArray(buckets.ad) ? buckets.ad : [],
      ...Array.isArray(buckets.konta) ? buckets.konta : [],
      ...Array.isArray(buckets.tanu) ? buckets.tanu : []
    ];
  }

  // src/lib/venueSeatLinkParity.js
  var HREF_UID_RE = /\/user\/(\d{1,20})(?:[/?#]|$)/;
  function createVenueSeatLinkParityState() {
    return {
      paints: 0,
      badPaints: 0,
      checked: 0,
      uidMismatch: 0,
      affordanceMismatch: 0,
      hrefStale: 0,
      lastSample: null,
      _paintDirty: false
    };
  }
  function beginVenueSeatLinkPaint(state) {
    if (!state || typeof state !== "object") return;
    state.paints += 1;
    state._paintDirty = false;
  }
  function observeVenueSeatLink(state, obs) {
    if (!state || typeof state !== "object" || !obs || typeof obs !== "object") return;
    const mirrorUid = String(obs.mirrorUid || "").trim();
    const rosterUid = String(obs.rosterUid || "").trim();
    const tileTag = String(obs.tileTag || "").toUpperCase();
    if (!tileTag) return;
    state.checked += 1;
    let kind = "";
    if (mirrorUid && rosterUid && mirrorUid !== rosterUid) {
      state.uidMismatch += 1;
      kind = "uid";
    }
    const tileIsAnchor = tileTag === "A";
    const seatLinkOn = obs.seatLinkOn === true;
    if (seatLinkOn !== tileIsAnchor) {
      state.affordanceMismatch += 1;
      kind = kind ? `${kind}+tag` : "tag";
    }
    if (tileIsAnchor && mirrorUid) {
      const m = HREF_UID_RE.exec(String(obs.tileHref || ""));
      if (m && m[1] !== mirrorUid) {
        state.hrefStale += 1;
        kind = kind ? `${kind}+href` : "href";
      }
    }
    if (!kind) return;
    if (!state._paintDirty) {
      state.badPaints += 1;
      state._paintDirty = true;
    }
    state.lastSample = {
      kind,
      seatIndex: Math.max(0, Math.floor(Number(obs.seatIndex) || 0)),
      mirrorUid,
      rosterUid,
      tileTag,
      seatLinkOn,
      mode: obs.mode === "mirror" ? "mirror" : "fallback",
      atWall: Math.max(0, Math.floor(Number(obs.wallNow) || 0))
    };
  }
  function toVenueSeatLinkParityDiag(state, wallNow) {
    if (!state || typeof state !== "object") return null;
    const bad = state.uidMismatch + state.affordanceMismatch + state.hrefStale;
    let line;
    if (state.checked <= 0) {
      line = "席リンク一致 ⚪ 未観測";
    } else if (bad === 0) {
      line = `席リンク一致 ✅ 検${state.checked}(紙${state.paints})`;
    } else {
      const s = state.lastSample;
      const ageSec = s && s.atWall > 0 ? Math.max(0, Math.round((Number(wallNow || 0) - s.atWall) / 1e3)) : -1;
      line = `席リンク一致 🔴 uid≠${state.uidMismatch} 実体≠${state.affordanceMismatch} href古${state.hrefStale} / 検${state.checked}(紙${state.paints} 悪${state.badPaints})` + (s ? ` / 直近{${s.kind} 席${s.seatIndex} 鏡u:${s.mirrorUid || "-"} 席u:${s.rosterUid || "-"} tile=${s.tileTag} 級${s.seatLinkOn ? "on" : "off"} ${s.mode}${ageSec >= 0 ? ` ${ageSec}s前` : ""}}` : "");
    }
    return {
      line,
      checked: state.checked,
      paints: state.paints,
      badPaints: state.badPaints,
      uidMismatch: state.uidMismatch,
      affordanceMismatch: state.affordanceMismatch,
      hrefStale: state.hrefStale,
      lastSample: state.lastSample ? { ...state.lastSample } : null
    };
  }

  // src/lib/venueSeatDomState.js
  function createEmptySeatState() {
    return { empty: true, link: false, vip: false, aria: "true", title: "", streak: 0 };
  }
  function setClassIf(cl, token, on) {
    if (cl.contains(token) === on) return;
    if (on) cl.add(token);
    else cl.remove(token);
  }
  function flushVenueSeatState(seat, next) {
    if (!seat || !next) return;
    const cl = seat.classList;
    setClassIf(cl, "nlsb-is-empty", next.empty === true);
    setClassIf(cl, "nlsb-seat-link", next.link === true);
    setClassIf(cl, "nlsb-seat-vip", next.vip === true);
    setClassIf(cl, "nlsb-seat-regular", false);
    if (seat.getAttribute("aria-hidden") !== next.aria) seat.setAttribute("aria-hidden", next.aria);
    const title = String(next.title || "");
    if (title) {
      if (seat.getAttribute("title") !== title) seat.setAttribute("title", title);
    } else if (seat.getAttribute("title") !== null) {
      seat.removeAttribute("title");
    }
    const streak = Math.max(0, Math.floor(Number(next.streak) || 0));
    if (streak > 0) {
      const want = String(streak);
      if (seat.dataset.streak !== want) seat.dataset.streak = want;
    } else if (seat.dataset.streak !== void 0) {
      delete seat.dataset.streak;
    }
  }

  // src/lib/venueYukkuriNamedCensus.js
  var IDENTICON_SRC_PREFIX = "data:image/svg+xml";
  var NUMERIC_UID_RE2 = /^\d+$/;
  var IN_RANGE_NUMERIC_UID_RE = /^\d{5,14}$/;
  function createVenueYukkuriNamedCensusState() {
    return {
      checked: 0,
      yukkuriNamed: 0,
      outOfRangeDigits: 0,
      checkedAnonymousStyle: 0,
      yukkuriNamedAnonymousStyle: 0,
      lastSample: null,
      lastSampleAnonymousStyle: null,
      /*
       * ★v0.1.1358: uid を持たない「名前ありゆっくり顔」(広告主・ゲスト等)。
       *
       * ■ なぜ足すか(2026-08-12 ユーザー実機・指摘「計器が機能してない証拠」)
       *   スクショには広告列に「無職にまっしぐら」「そろおじさん」「ノエル」等、
       *   **名前があるのにゆっくり顔**のタイルが並んでいた。
       *   ところが速報は `名前ありゆっくり顔 ✅ 検18(匿名系検0)` = 実害0 と報告していた。
       *   真因: 数値ID系でも a:系でもない(uid が空の)タイルは `if (!uid) return` で
       *   **checked にすら入らず**、完全に計器の外だった。
       *   ★「0件」は「異常なし」ではなく「測っていない」だった
       *     ([[zero-count-may-mean-unmeasured]] の典型)。
       */
      checkedNoUid: 0,
      yukkuriNamedNoUid: 0,
      lastSampleNoUid: (
        /** @type {null | { name: string }} */
        null
      )
    };
  }
  function observeVenueYukkuriNamedTile(state, obs) {
    if (!state || typeof state !== "object" || !obs || typeof obs !== "object") return;
    const uid = String(obs.uid || "").trim();
    const rawName = String(obs.rawName || "").trim();
    const displaySrc = String(obs.displaySrc || "").trim();
    if (!rawName) return;
    if (rawName.startsWith("匿名")) return;
    if (isNiconicoGuestPlaceholderNickname(rawName) || isNiconicoAutoUserPlaceholderNickname(rawName)) {
      return;
    }
    if (!NUMERIC_UID_RE2.test(uid)) {
      if (!uid) {
        state.checkedNoUid += 1;
        if (!displaySrc.startsWith(IDENTICON_SRC_PREFIX)) return;
        state.yukkuriNamedNoUid += 1;
        state.lastSampleNoUid = { name: rawName };
        return;
      }
      state.checkedAnonymousStyle += 1;
      if (!displaySrc.startsWith(IDENTICON_SRC_PREFIX)) return;
      state.yukkuriNamedAnonymousStyle += 1;
      state.lastSampleAnonymousStyle = { uid, name: rawName };
      return;
    }
    state.checked += 1;
    if (!displaySrc.startsWith(IDENTICON_SRC_PREFIX)) return;
    state.yukkuriNamed += 1;
    if (!IN_RANGE_NUMERIC_UID_RE.test(uid)) state.outOfRangeDigits += 1;
    state.lastSample = { uid, name: rawName, digits: uid.length };
  }
  function toVenueYukkuriNamedCensusDiag(state) {
    if (!state || typeof state !== "object") return null;
    const checkedNoUid = Number(state.checkedNoUid) || 0;
    const yukkuriNamedNoUid = Number(state.yukkuriNamedNoUid) || 0;
    const checkedAny = state.checked > 0 || state.checkedAnonymousStyle > 0 || checkedNoUid > 0;
    const harmAny = state.yukkuriNamed > 0 || state.yukkuriNamedAnonymousStyle > 0 || yukkuriNamedNoUid > 0;
    let line;
    if (!checkedAny) {
      line = "名前ありゆっくり顔 ⚪ 未観測";
    } else if (!harmAny) {
      line = `名前ありゆっくり顔 ✅ 検${state.checked}(匿名系検${state.checkedAnonymousStyle}/ID無検${checkedNoUid})`;
    } else {
      const s = state.lastSample;
      const sa = state.lastSampleAnonymousStyle;
      const sn = state.lastSampleNoUid;
      line = `名前ありゆっくり顔 🔴 ${state.yukkuriNamed}件(桁境界${state.outOfRangeDigits}) 匿名系${state.yukkuriNamedAnonymousStyle}件 ID無${yukkuriNamedNoUid}件 / 検${state.checked}(匿名系検${state.checkedAnonymousStyle}/ID無検${checkedNoUid})` + (s ? ` / 直近{${s.name} uid${s.digits}桁}` : "") + (sa ? ` / 直近匿名系{${sa.name} uid=${sa.uid}}` : "") + (sn ? ` / 直近ID無{${sn.name}}` : "");
    }
    return {
      line,
      checked: state.checked,
      yukkuriNamed: state.yukkuriNamed,
      outOfRangeDigits: state.outOfRangeDigits,
      checkedAnonymousStyle: state.checkedAnonymousStyle,
      yukkuriNamedAnonymousStyle: state.yukkuriNamedAnonymousStyle,
      checkedNoUid,
      yukkuriNamedNoUid,
      lastSample: state.lastSample ? { ...state.lastSample } : null,
      lastSampleAnonymousStyle: state.lastSampleAnonymousStyle ? { ...state.lastSampleAnonymousStyle } : null,
      lastSampleNoUid: state.lastSampleNoUid ? { ...state.lastSampleNoUid } : null
    };
  }

  // src/lib/venueSpeechCensus.js
  var SAMPLE_MAX = 3;
  function createVenueSpeechCensusState() {
    return {
      tiles: { checked: 0, shown: 0, mirrorOnly: 0, missing: 0, silent: 0 },
      missingSamples: [],
      hover: { opened: 0, withLines: 0, emptyButSpoke: 0, lied: 0 },
      hoverEmptySamples: [],
      hoverLiedSamples: []
    };
  }
  function n0(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  function lineCount(v) {
    return Array.isArray(v) ? v.filter((t) => typeof t === "string" && t.trim() !== "").length : 0;
  }
  function observeVenueSpeechTiles(state, tiles) {
    const t = { checked: 0, shown: 0, mirrorOnly: 0, missing: 0, silent: 0 };
    const samples = [];
    for (const it of Array.isArray(tiles) ? tiles : []) {
      if (!it || typeof it !== "object") continue;
      t.checked += 1;
      const roster = lineCount(it.rosterTexts);
      const mirror = lineCount(it.mirrorTexts);
      if (roster > 0) {
        t.shown += 1;
      } else if (mirror > 0) {
        t.shown += 1;
        t.mirrorOnly += 1;
      } else if (n0(it.commentCount) > 0 || n0(it.rosterCount) > 0) {
        t.missing += 1;
        if (samples.length < SAMPLE_MAX) samples.push(String(it.name || it.uid || "?").slice(0, 20));
      } else {
        t.silent += 1;
      }
    }
    state.tiles = t;
    state.missingSamples = samples;
  }
  function observeVenueSpeechHover(state, card) {
    state.hover.opened += 1;
    if (card?.saidSpeech === true && card?.spoke !== true) {
      state.hover.lied += 1;
      if (state.hoverLiedSamples.length < SAMPLE_MAX) {
        let raw = card?.detail;
        try {
          if (typeof raw === "function") raw = raw();
        } catch {
          raw = "";
        }
        const detail = String(raw || "").slice(0, 80);
        state.hoverLiedSamples.push(String(card?.name || "?").slice(0, 20) + (detail ? `(${detail})` : ""));
      }
    }
    if (lineCount(card?.lines) > 0 || n0(card?.lines) > 0) {
      state.hover.withLines += 1;
      return;
    }
    if (card?.spoke === true) {
      state.hover.emptyButSpoke += 1;
      if (state.hoverEmptySamples.length < SAMPLE_MAX) {
        let raw = card?.detail;
        try {
          if (typeof raw === "function") raw = raw();
        } catch {
          raw = "";
        }
        const detail = String(raw || "").slice(0, 60);
        state.hoverEmptySamples.push(String(card?.name || "?").slice(0, 20) + (detail ? `(${detail})` : ""));
      }
    }
  }
  function toVenueSpeechCensusDiag(state) {
    const t = state.tiles;
    const h = state.hover;
    const idle = t.checked === 0 && h.opened === 0;
    const bad = t.missing > 0 || h.emptyButSpoke > 0 || h.lied > 0;
    const verdict = idle ? "idle" : bad ? "warn" : "ok";
    const mark = idle ? "⚪" : bad ? "🔴" : "✅";
    const parts = [`会場セリフ ${mark}`];
    if (idle) {
      parts.push("未観測(会場を開いて数秒後に出ます)");
    } else {
      parts.push(`タイル${t.checked}枚: 出る${t.shown}(うち鏡頼み${t.mirrorOnly}) / 欠け${t.missing} / 無言${t.silent}`);
      parts.push(`カード${h.opened}回: セリフあり${h.withLines} / 発言ありなのに空${h.emptyButSpoke} / 発言の嘘${h.lied}`);
      if (state.missingSamples.length) parts.push(`欠け例{${state.missingSamples.join("・")}}`);
      if (state.hoverEmptySamples.length) parts.push(`空だったカード{${state.hoverEmptySamples.join("・")}}`);
      if (state.hoverLiedSamples.length) parts.push(`嘘だったカード{${state.hoverLiedSamples.join("・")}}`);
    }
    return {
      line: parts.join(" / "),
      verdict,
      checked: t.checked,
      shown: t.shown,
      mirrorOnly: t.mirrorOnly,
      missing: t.missing,
      silent: t.silent,
      hoverOpened: h.opened,
      hoverWithLines: h.withLines,
      hoverEmptyButSpoke: h.emptyButSpoke,
      hoverLied: h.lied
    };
  }

  // src/lib/venueTileCountCensus.js
  var VENUE_TILE_RECENT_CAP = 6;
  function createVenueTileCountState() {
    return {
      liveId: "",
      last: -1,
      lastOrigin: "",
      paints: 0,
      changes: 0,
      max: 0,
      min: 0,
      drops: 0,
      shrinkRefused: 0,
      worstDrop: 0,
      worstFrom: 0,
      worstTo: 0,
      worstCause: "",
      worstAt: 0,
      lastDropAt: 0,
      recent: []
    };
  }
  function n02(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  function observeVenueTileCount(state, sample) {
    const liveId = String(sample?.liveId ?? "").trim().toLowerCase();
    const tiles = n02(sample?.tiles);
    const origin = String(sample?.origin ?? "").trim() || "?";
    const nowMs = n02(sample?.nowMs);
    if (liveId && state.liveId && liveId !== state.liveId) {
      Object.assign(state, createVenueTileCountState());
    }
    if (liveId) state.liveId = liveId;
    state.paints += 1;
    const prev = state.last;
    if (prev === tiles && state.lastOrigin === origin) return;
    state.changes += 1;
    if (prev >= 0 && tiles < prev) {
      state.drops += 1;
      state.lastDropAt = nowMs;
      const size = prev - tiles;
      if (size > state.worstDrop) {
        state.worstDrop = size;
        state.worstFrom = prev;
        state.worstTo = tiles;
        state.worstCause = state.lastOrigin === origin ? origin : `${state.lastOrigin}→${origin}`;
        state.worstAt = nowMs;
      }
    }
    state.max = Math.max(state.max, tiles);
    state.min = prev < 0 ? tiles : Math.min(state.min, tiles);
    state.last = tiles;
    state.lastOrigin = origin;
    state.recent.push({ at: nowMs, tiles, origin });
    if (state.recent.length > VENUE_TILE_RECENT_CAP) state.recent.shift();
  }
  function noteVenueMirrorShrinkRefused(state) {
    state.shrinkRefused += 1;
  }
  function ago(ms, nowMs) {
    if (!(ms > 0) || !(nowMs > 0)) return "?";
    const s = Math.max(0, Math.round((nowMs - ms) / 1e3));
    return s < 120 ? `${s}秒前` : `${Math.round(s / 60)}分前`;
  }
  function toVenueTileCountDiag(state, nowMs) {
    const idle = state.paints === 0 || state.last < 0;
    const bad = state.drops > 0;
    const verdict = idle ? "idle" : bad ? "warn" : "ok";
    const mark = idle ? "⚪" : bad ? "🔴" : "✅";
    const parts = [];
    if (idle) {
      parts.push(`会場の人数 ${mark} 未観測(会場を開いて描画されると出ます)`);
    } else if (!bad) {
      parts.push(
        `会場の人数 ${mark} 増え続けている(${state.min}→${state.max}枚・描画${state.paints}回/変化${state.changes}回・いま${state.last}枚・${state.lastOrigin})`
      );
    } else {
      parts.push(
        `会場の人数 ${mark} ★減った${state.drops}回(最大${state.worstFrom}→${state.worstTo}枚=${state.worstDrop}枚減・原因 ${state.worstCause || "?"}・${ago(state.worstAt, nowMs)})`
      );
      parts.push(`最大${state.max}枚・いま${state.last}枚(${state.lastOrigin})・描画${state.paints}回/変化${state.changes}回`);
    }
    if (!idle && state.recent.length > 1) {
      const tail = state.recent.map((r) => `${r.tiles}(${r.origin}・${ago(r.at, nowMs)})`).join(" → ");
      parts.push(`直近の変化: ${tail}`);
    }
    if (state.shrinkRefused > 0) parts.push(`縮んだ鏡を採らなかった${state.shrinkRefused}回(減らさない安全網)`);
    return {
      line: parts.join(" / "),
      verdict,
      paints: state.paints,
      changes: state.changes,
      last: Math.max(0, state.last),
      max: state.max,
      drops: state.drops,
      shrinkRefused: state.shrinkRefused,
      worstDrop: state.worstDrop,
      worstFrom: state.worstFrom,
      worstTo: state.worstTo,
      worstCause: state.worstCause
    };
  }

  // src/lib/laneWindowVerdict.js
  var LANE_WINDOW_MIN_TILES = 49;
  function judgeLaneWindow(input) {
    const isVenue = input?.isVenue === true;
    if (isVenue) {
      return { windowed: false, reason: "venue-has-own-scroll" };
    }
    const raw = input?.tileCount;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
      return { windowed: false, reason: "count-unknown" };
    }
    const n = raw;
    if (n < LANE_WINDOW_MIN_TILES) {
      return { windowed: false, reason: "fits-without-window" };
    }
    return { windowed: true, reason: "many-tiles" };
  }

  // src/lib/storyUserLaneClickAffordanceParity.js
  function createStoryUserLaneClickAffordanceParityState() {
    return { checked: 0, mismatched: 0, lastSample: null };
  }
  function observeStoryUserLaneClickAffordance(state, obs) {
    if (!state || typeof state !== "object" || !obs || typeof obs !== "object") return;
    const el = obs.tileEl;
    if (!el || typeof el !== "object" || typeof el.tagName !== "string") return;
    const tag = el.tagName.toUpperCase();
    if (tag !== "SPAN" && tag !== "TD") return;
    let cursor = "";
    try {
      const view = el.ownerDocument && el.ownerDocument.defaultView;
      if (view && typeof view.getComputedStyle === "function") {
        cursor = String(view.getComputedStyle(el).cursor || "").trim();
      }
    } catch {
      return;
    }
    if (!cursor) return;
    state.checked += 1;
    if (cursor !== "pointer") return;
    state.mismatched += 1;
    state.lastSample = { tag, cursor, title: String(obs.title || "").trim().slice(0, 40) };
  }

  // src/extension/story/laneContentLod.js
  var LANE_CONTENT_LOD_ENABLED = false;
  var LANE_CONTENT_LOD_EAGER_HEAD = 24;
  var LANE_CONTENT_LOD_HOLLOW_CLASS = "nl-story-userlane-cell--hollow";
  var LANE_CONTENT_LOD_ROOT_MARGIN = "600px 0px";
  var _laneLodState = /* @__PURE__ */ new WeakMap();
  function shouldRenderHollow(ctx, enabled = LANE_CONTENT_LOD_ENABLED) {
    if (!enabled) return false;
    if (!ctx || typeof ctx !== "object") return false;
    if (ctx.hasWrap === true) return false;
    if (ctx.laneName !== "tanu") return false;
    if (ctx.hasRealThumb === true) return false;
    if (ctx.alreadyFilled === true) return false;
    return Math.floor(Number(ctx.index) || 0) >= LANE_CONTENT_LOD_EAGER_HEAD;
  }
  function buildHollowTileEl(p) {
    const cell = document.createElement("span");
    cell.className = `nl-story-userlane-cell ${LANE_CONTENT_LOD_HOLLOW_CLASS}`;
    const tip = String(p && p.title || "");
    if (tip) cell.title = tip;
    return cell;
  }
  function stateFor(laneEl) {
    let st = _laneLodState.get(laneEl);
    if (!st) {
      st = { observer: null, filledKeys: /* @__PURE__ */ new Set(), pending: /* @__PURE__ */ new WeakMap() };
      _laneLodState.set(laneEl, st);
    }
    return st;
  }
  function isAlreadyFilled(laneEl, userKey) {
    if (!laneEl || !userKey) return false;
    const st = _laneLodState.get(laneEl);
    return st ? st.filledKeys.has(userKey) : false;
  }
  function forgetLaneContentLod(laneEl) {
    if (!laneEl) return;
    const st = _laneLodState.get(laneEl);
    if (!st) return;
    if (st.observer) {
      try {
        st.observer.disconnect();
      } catch {
      }
      st.observer = null;
    }
    st.pending = /* @__PURE__ */ new WeakMap();
  }
  function observeHollowTile(laneEl, hollowEl, userKey, fill, enabled = LANE_CONTENT_LOD_ENABLED) {
    if (!enabled) return;
    if (!laneEl || !hollowEl || typeof fill !== "function") return;
    if (typeof IntersectionObserver !== "function") {
      try {
        fill();
      } catch {
      }
      return;
    }
    const st = stateFor(laneEl);
    if (!st.observer) {
      const root = typeof laneEl.closest === "function" ? laneEl.closest(".nl-main") : null;
      st.observer = new IntersectionObserver(
        (entries, obs) => {
          for (const ent of entries) {
            if (!ent.isIntersecting) continue;
            const target = ent.target;
            const run = st.pending.get(target);
            st.pending.delete(target);
            try {
              obs.unobserve(target);
            } catch {
            }
            if (typeof run === "function") {
              try {
                run();
              } catch {
              }
            }
          }
        },
        { root: root || null, rootMargin: LANE_CONTENT_LOD_ROOT_MARGIN }
      );
    }
    const key = String(userKey || "");
    st.pending.set(hollowEl, () => {
      if (key) st.filledKeys.add(key);
      fill();
    });
    try {
      st.observer.observe(hollowEl);
    } catch {
    }
  }

  // src/extension/story/renderStoryUserLaneDom.js
  var _laneTierLastKey = /* @__PURE__ */ new WeakMap();
  function invalidateStoryUserLaneTierKey(laneEl) {
    if (laneEl) {
      _laneTierLastKey.delete(laneEl);
      _laneTierTileKeys.delete(laneEl);
    }
  }
  var _laneTileNodes = /* @__PURE__ */ new WeakMap();
  var _laneTierTileKeys = /* @__PURE__ */ new WeakMap();
  function applyLaneTileStatsAttr(tileEl, p) {
    const metaEl = tileEl && tileEl.lastElementChild;
    if (!metaEl || !metaEl.classList || !metaEl.classList.contains("nl-story-userlane-meta")) return;
    const text = formatLaneTileStats(p && /** @type {any} */
    p.stats);
    const cur = metaEl.getAttribute("data-stats");
    if (text) {
      if (cur !== text) metaEl.setAttribute("data-stats", text);
    } else if (cur !== null) {
      metaEl.removeAttribute("data-stats");
    }
    applyLaneTilePulseAttr(tileEl, p);
  }
  function setAttrIfChanged(el, name, value) {
    const cur = el.getAttribute(name);
    if (value) {
      if (cur !== value) el.setAttribute(name, value);
    } else if (cur !== null) {
      el.removeAttribute(name);
    }
  }
  function applyLaneTilePulseAttr(tileEl, p) {
    const { text, kind, tier } = formatLaneTilePulse(p && /** @type {any} */
    p.pulse);
    setAttrIfChanged(tileEl, "data-pulse", text);
    setAttrIfChanged(tileEl, "data-pulse-tier", text ? tier : "");
    const gifted = kind === "gift";
    if (tileEl.classList.contains("is-gifted") !== gifted) tileEl.classList.toggle("is-gifted", gifted);
    const hot = kind === "hot";
    if (tileEl.classList.contains("is-hot") !== hot) tileEl.classList.toggle("is-hot", hot);
  }
  function syncLaneTierStatsInPlace(laneEl, items) {
    const nodes = laneEl ? _laneTileNodes.get(laneEl) : null;
    if (!nodes || !Array.isArray(items) || nodes.length !== items.length) return;
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const sameWho = !node || !node.dataset || node.dataset.userKey === venueLaneParityKey(items[i]);
      if (sameWho) applyLaneTileStatsAttr(node, items[i]);
    }
  }
  function bucketsHaveTileStats(buckets) {
    for (const tier of ["link", "gift", "ad", "konta", "tanu"]) {
      const arr = buckets && Array.isArray(buckets[tier]) ? buckets[tier] : [];
      for (const p of arr) if (p && p.stats && formatLaneTileStats(p.stats)) return true;
    }
    return false;
  }
  var _laneTierRepaintCount = { link: 0, gift: 0, ad: 0, konta: 0, tanu: 0, unknown: 0 };
  function laneNameOfEl(el) {
    const id = String(el && el.id || "");
    const m = /sceneStoryUserLane(Link|Gift|Ad|Konta|Tanu)/.exec(id);
    if (m) return m[1].toLowerCase();
    const dataLaneName = String(el && el.dataset && el.dataset.laneName || "").trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(_laneTierRepaintCount, dataLaneName) ? dataLaneName : "unknown";
  }
  var _clickAffordanceParity = createStoryUserLaneClickAffordanceParityState();
  var _yukkuriNamedCensus = createVenueYukkuriNamedCensusState();
  function shouldKeepStoryUserLaneTilesOnEmpty(els, currentLiveId, lastTiledLid) {
    const cur = String(currentLiveId || "").trim().toLowerCase();
    const last = String(lastTiledLid || "").trim().toLowerCase();
    if (!last) return false;
    if (cur && cur !== last) return false;
    const lanes = els ? [els.laneLink, els.laneGift, els.laneAd, els.laneKonta, els.laneTanu] : [];
    for (const lane of lanes) {
      if (lane && typeof lane.childElementCount === "number" && lane.childElementCount > 0) return true;
    }
    return false;
  }
  var STORY_USER_LANE_SHRINK_KEEP_MAX_MS = 10 * 60 * 1e3;
  function storyLaneTierBodyKey(items) {
    return items.map(storyLaneTileKey).join("");
  }
  function storyLaneTileKey(p) {
    const it = p && typeof p === "object" ? p : {};
    return [
      String(it.entry?.userId || ""),
      String(it.displaySrc || ""),
      String(it.meta?.idLine || ""),
      String(it.meta?.nameLine || ""),
      String(it.title || "")
    ].join("");
  }
  function applyStoryUserLaneWindow(laneEl, tileCount, wrapTileEl) {
    if (!laneEl || !laneEl.classList) return;
    const { windowed } = judgeLaneWindow({ tileCount, isVenue: !!wrapTileEl });
    laneEl.classList.toggle("nl-story-userlane--windowed", windowed);
  }
  function removeStoryUserLaneEmptyNotesUnder(root) {
    if (!root) return;
    root.querySelectorAll(".nl-story-userlane__empty-note").forEach((n) => {
      n.remove();
    });
  }
  var _guideHtmlLast = /* @__PURE__ */ new WeakMap();
  var _emptyNoteHtml = /* @__PURE__ */ new WeakMap();
  function setGuideHtmlIfChanged(el, html) {
    const next = String(html);
    const hasChild = !!el.firstChild;
    if (_guideHtmlLast.get(el) === next && (next === "" ? !hasChild : hasChild)) return;
    el.innerHTML = next;
    _guideHtmlLast.set(el, next);
  }
  function syncStoryUserLaneTierEmptyNote(laneEl, show, innerHtml) {
    const next = laneEl.nextElementSibling;
    const isNote = !!(next && next.classList.contains("nl-story-userlane__empty-note"));
    if (isNote && show && innerHtml && _emptyNoteHtml.get(next) === innerHtml) return;
    if (isNote) next.remove();
    if (!show || !innerHtml) return;
    const box = document.createElement("div");
    box.className = "nl-story-userlane__empty-note";
    box.innerHTML = innerHtml;
    _emptyNoteHtml.set(box, innerHtml);
    laneEl.insertAdjacentElement("afterend", box);
  }
  function resetStoryUserLaneDom(els) {
    const {
      stack,
      laneLink,
      laneGift,
      laneAd,
      laneKonta,
      laneTanu,
      hintLink,
      linkWrap,
      giftWrap,
      adWrap,
      guideTop,
      guideLinesTop,
      guideMidGift,
      guideLinesMidGift,
      guideMidAd,
      guideLinesMidAd,
      guideMidKonta,
      guideLinesMidKonta,
      guideMidTanu,
      guideLinesMidTanu,
      guideBottom,
      guideLinesBottom
    } = els;
    removeStoryUserLaneEmptyNotesUnder(stack);
    for (const laneEl of [laneLink, laneGift, laneAd, laneKonta, laneTanu]) {
      if (laneEl) forgetLaneContentLod(laneEl);
      if (laneEl) {
        laneEl.innerHTML = "";
        _laneTierLastKey.delete(laneEl);
        _laneTileNodes.delete(laneEl);
        _laneTierTileKeys.delete(laneEl);
      }
    }
    laneLink.hidden = true;
    laneGift.hidden = true;
    if (laneAd) laneAd.hidden = true;
    laneKonta.hidden = true;
    laneTanu.hidden = true;
    if (hintLink) hintLink.hidden = true;
    if (linkWrap) linkWrap.hidden = true;
    if (giftWrap) giftWrap.hidden = true;
    if (adWrap) adWrap.hidden = true;
    if (guideMidGift) guideMidGift.hidden = true;
    if (guideLinesMidGift) guideLinesMidGift.innerHTML = "";
    if (guideMidAd) guideMidAd.hidden = true;
    if (guideLinesMidAd) guideLinesMidAd.innerHTML = "";
    if (guideMidKonta) guideMidKonta.hidden = true;
    if (guideLinesMidKonta) guideLinesMidKonta.innerHTML = "";
    if (guideMidTanu) guideMidTanu.hidden = true;
    if (guideLinesMidTanu) guideLinesMidTanu.innerHTML = "";
    stack.hidden = true;
    if (guideTop) guideTop.hidden = true;
    if (guideLinesTop) guideLinesTop.innerHTML = "";
    if (guideBottom) guideBottom.hidden = true;
    if (guideLinesBottom) guideLinesBottom.innerHTML = "";
  }
  function fillLaneTier(el, items, io, wrapTileEl) {
    if (!items.length) {
      if (_laneTierLastKey.get(el) === "" && !el.firstChild) {
        el.hidden = true;
        return;
      }
      el.innerHTML = "";
      el.hidden = true;
      _laneTierLastKey.set(el, "");
      _laneTileNodes.delete(el);
      _laneTierTileKeys.delete(el);
      return;
    }
    const key = storyLaneTierBodyKey(items);
    if (_laneTierLastKey.get(el) === key && el.firstChild) {
      el.hidden = false;
      syncLaneTierStatsInPlace(el, items);
      return;
    }
    forgetLaneContentLod(el);
    const laneNameForLod = laneNameOfEl(el);
    const frag = document.createDocumentFragment();
    const tileNodes = new Array(items.length).fill(null);
    const tileKeys = items.map(storyLaneTileKey);
    let reusePool = null;
    if (typeof wrapTileEl !== "function") {
      const prevNodes = _laneTileNodes.get(el);
      const prevKeys = _laneTierTileKeys.get(el);
      if (prevNodes && prevKeys && prevNodes.length === prevKeys.length) {
        reusePool = /* @__PURE__ */ new Map();
        for (let j = 0; j < prevNodes.length; j += 1) {
          const n = prevNodes[j];
          if (!n || n.parentNode !== el) continue;
          const list = reusePool.get(prevKeys[j]);
          if (list) list.push(n);
          else reusePool.set(prevKeys[j], [n]);
        }
      }
    }
    for (let i = 0; i < items.length; i += 1) {
      const p = items[i];
      const lodUserKey = String(p && p.entry && p.entry.userId || "");
      if (shouldRenderHollow({
        laneName: laneNameForLod,
        index: i,
        hasRealThumb: io.isHttpOrHttpsUrl(String(p && p.displaySrc || "")),
        hasWrap: typeof wrapTileEl === "function",
        alreadyFilled: isAlreadyFilled(el, lodUserKey)
      })) {
        const hollowEl = buildHollowTileEl(p);
        try {
          hollowEl.dataset.thumb = "0";
          hollowEl.dataset.userKey = venueLaneParityKey(p);
        } catch {
        }
        observeHollowTile(el, hollowEl, lodUserKey, () => {
          if (!hollowEl.parentNode) return;
          const realEl = buildPersonTileEl(p, io);
          try {
            realEl.dataset.thumb = io.isHttpOrHttpsUrl(String(p && p.displaySrc || "")) ? "1" : "0";
            realEl.dataset.userKey = venueLaneParityKey(p);
          } catch {
          }
          applyLaneTileStatsAttr(realEl, p);
          tileNodes[i] = realEl;
          hollowEl.replaceWith(realEl);
        });
        frag.appendChild(hollowEl);
        continue;
      }
      const reuseList = reusePool ? reusePool.get(tileKeys[i]) : void 0;
      const reused = reuseList && reuseList.length ? reuseList.shift() : null;
      if (reused) {
        applyLaneTileStatsAttr(reused, p);
        tileNodes[i] = reused;
        frag.appendChild(reused);
        continue;
      }
      const tileEl = buildPersonTileEl(p, io);
      try {
        observeStoryUserLaneClickAffordance(_clickAffordanceParity, { tileEl, title: p && p.title });
      } catch {
      }
      try {
        observeVenueYukkuriNamedTile(_yukkuriNamedCensus, {
          uid: p && p.entry && p.entry.userId,
          rawName: p && p.title,
          displaySrc: p && p.displaySrc
        });
      } catch {
      }
      try {
        tileEl.dataset.thumb = io.isHttpOrHttpsUrl(String(p && p.displaySrc || "")) ? "1" : "0";
        tileEl.dataset.userKey = venueLaneParityKey(p);
      } catch {
      }
      applyLaneTileStatsAttr(tileEl, p);
      tileNodes[i] = tileEl;
      frag.appendChild(typeof wrapTileEl === "function" ? wrapTileEl(tileEl, p, i) : tileEl);
    }
    el.replaceChildren(frag);
    el.hidden = false;
    _laneTierLastKey.set(el, key);
    _laneTileNodes.set(el, tileNodes);
    _laneTierTileKeys.set(el, tileKeys);
    const laneName = laneNameOfEl(el);
    _laneTierRepaintCount[laneName] = (_laneTierRepaintCount[laneName] || 0) + 1;
  }
  function paintStoryUserLaneDomFilled(els, faces, buckets, pickedLength, io, opts) {
    const {
      stack,
      laneLink,
      laneGift,
      laneAd,
      laneKonta,
      laneTanu,
      hintLink,
      linkWrap,
      giftWrap,
      adWrap,
      guideTop,
      guideLinesTop,
      guideMidGift,
      guideLinesMidGift,
      guideMidAd,
      guideLinesMidAd,
      guideMidKonta,
      guideLinesMidKonta,
      guideMidTanu,
      guideLinesMidTanu,
      guideBottom,
      guideLinesBottom
    } = els;
    const wrapTileEl = opts && typeof opts.wrapTileEl === "function" ? opts.wrapTileEl : void 0;
    const showGuides = !(opts && opts.guides === false);
    fillLaneTier(laneLink, buckets.link, io, wrapTileEl);
    fillLaneTier(laneGift, buckets.gift, io, wrapTileEl);
    if (laneAd) fillLaneTier(laneAd, buckets.ad || [], io, wrapTileEl);
    fillLaneTier(laneKonta, buckets.konta, io, wrapTileEl);
    fillLaneTier(laneTanu, buckets.tanu, io, wrapTileEl);
    applyStoryUserLaneWindow(laneTanu, buckets.tanu.length, wrapTileEl);
    syncStoryUserLaneTierEmptyNote(
      laneLink,
      showGuides && buckets.link.length === 0,
      buildStoryUserLaneEmptyNoteLinkHtml()
    );
    const emptyOverrides = opts && opts.emptyTextOverrides && typeof opts.emptyTextOverrides === "object" ? opts.emptyTextOverrides : null;
    syncStoryUserLaneTierEmptyNote(
      laneGift,
      showGuides && buckets.gift.length === 0,
      emptyOverrides && typeof emptyOverrides.gift === "string" ? emptyOverrides.gift : buildStoryUserLaneEmptyNoteGiftHtml()
    );
    syncStoryUserLaneTierEmptyNote(
      laneKonta,
      showGuides && buckets.konta.length === 0,
      buildStoryUserLaneEmptyNoteKontaHtml()
    );
    syncStoryUserLaneTierEmptyNote(
      laneTanu,
      showGuides && buckets.tanu.length === 0,
      buildStoryUserLaneEmptyNoteTanuHtml()
    );
    if (hintLink) {
      const showLinkHint = showGuides && buckets.link.length === 0 && (buckets.konta.length > 0 || buckets.tanu.length > 0);
      hintLink.hidden = !showLinkHint;
    }
    if (linkWrap) {
      const showLinkWrap = !laneLink.hidden || hintLink && !hintLink.hidden;
      linkWrap.hidden = !showLinkWrap;
    }
    if (giftWrap) {
      const showGiftWrap = !laneGift.hidden || guideMidGift && !guideMidGift.hidden || Boolean(
        laneGift.nextElementSibling?.classList?.contains("nl-story-userlane__empty-note")
      );
      giftWrap.hidden = !showGiftWrap;
    }
    if (laneAd && adWrap) {
      const hasAd = (buckets.ad || []).length > 0;
      if (hasAd) laneAd.hidden = false;
      adWrap.hidden = !hasAd;
      if (guideMidAd) guideMidAd.hidden = !(showGuides && hasAd);
      if (guideLinesMidAd) {
        setGuideHtmlIfChanged(
          guideLinesMidAd,
          showGuides && hasAd ? buildStoryUserLaneGuideAdHtml(faces.faceAd, buckets.ad.length) : ""
        );
      }
    }
    stack.setAttribute("aria-label", buildStoryUserLaneStackAriaLabel(pickedLength));
    stack.hidden = false;
    if (guideLinesTop) {
      setGuideHtmlIfChanged(
        guideLinesTop,
        showGuides ? buildStoryUserLaneGuideTopHtml(faces.faceLink, buckets.link.length) : ""
      );
    }
    if (guideTop) guideTop.hidden = !showGuides;
    if (guideLinesMidGift) {
      setGuideHtmlIfChanged(
        guideLinesMidGift,
        showGuides ? buildStoryUserLaneGuideGiftHtml(faces.faceGift, buckets.gift.length) : ""
      );
    }
    if (guideMidGift) guideMidGift.hidden = !showGuides;
    if (guideLinesMidKonta) {
      setGuideHtmlIfChanged(
        guideLinesMidKonta,
        showGuides ? buildStoryUserLaneGuideKontaHtml(faces.faceKonta, buckets.konta.length) : ""
      );
    }
    if (guideMidKonta) guideMidKonta.hidden = !showGuides;
    if (guideLinesMidTanu) {
      setGuideHtmlIfChanged(
        guideLinesMidTanu,
        showGuides ? buildStoryUserLaneGuideTanuHtml(faces.faceTanu, buckets.tanu.length) : ""
      );
    }
    if (guideMidTanu) guideMidTanu.hidden = !showGuides;
    if (guideLinesBottom) {
      setGuideHtmlIfChanged(
        guideLinesBottom,
        showGuides ? buildStoryUserLaneGuideFootAndRecordedHtml(
          pickedLength,
          opts && typeof opts.recordedCommentRowsTotal === "number" ? opts.recordedCommentRowsTotal : void 0,
          opts && typeof opts.totalCandidates === "number" ? opts.totalCandidates : void 0,
          bucketsHaveTileStats(buckets)
        ) : ""
      );
    }
    if (guideBottom) guideBottom.hidden = !showGuides;
  }

  // src/lib/venueSeatsDiagKey.js
  var KEY_VENUE_SEATS_DIAG = "nls_venue_seats_diag_v1";

  // src/lib/venueSeatsDiag.js
  function makeInitialVenueSeatsDiag() {
    return {
      enabled: false,
      liveId: "",
      seatsShown: 0,
      participantCount: 0,
      otherCount: 0,
      broadcasterInSeats: false,
      broadcasterKnown: false,
      lastUpdateAt: 0,
      perRow: 0,
      venueMaxRows: 0,
      seatAreaWidth: 0,
      visibleCapReason: "",
      laneParity: (
        /** @type {VenueSeatsDiagState['laneParity']} */
        null
      ),
      sceneReceipt: (
        /** @type {VenueSeatsDiagState['sceneReceipt']} */
        null
      ),
      anonExcluded: 0,
      unseated: 0,
      storyDiagMirror: { present: false, ageSec: (
        /** @type {number|null} */
        null
      ) },
      // v0.1.1207: 会場の立ち上がり分解(開く→鏡→集計→初描画→初席)。未観測は -1。
      openLatency: {
        opens: 0,
        mirrorMs: -1,
        aggregateMs: -1,
        firstPaintMs: -1,
        firstSeatMs: -1,
        mirrorTimedOut: false,
        mirrorAbsent: false,
        line: "会場立ち上がり ⚪ 未観測"
      },
      seatLinkParity: (
        /** @type {VenueSeatsDiagState['seatLinkParity']} */
        null
      ),
      yukkuriNamedCensus: (
        /** @type {VenueSeatsDiagState['yukkuriNamedCensus']} */
        null
      ),
      speechCensus: (
        /** @type {VenueSeatsDiagState['speechCensus']} */
        null
      ),
      // 2026-10-13: 会場の人数の増減(減った瞬間の証拠取り)。未観測は null=状態速報に出ない。
      tileCountCensus: (
        /** @type {VenueSeatsDiagState['tileCountCensus']} */
        null
      ),
      // ★v0.1.1317: 会場が鏡を受け取れているかの1行(未観測は空文字=状態速報に出ない)。
      mirrorIntakeLine: "",
      /*
       * ★v0.1.1405: 判定の【材料】(行だけでは画面のセルが作れない)。
       *   ★この関数は「フィールドを個別列挙して作り直す」型なので、
       *     ここに足さないと venueBar が載せても **黙って落ちる**
       *     ([[venue-mirror-is-the-primary-path-2026-08-01]] を5回踏んだ箇所)。
       */
      mirrorIntake: (
        /** @type {VenueSeatsDiagState['mirrorIntake']} */
        null
      ),
      // ★v0.1.1348: 会場のアイコン実績(初期は未計測=null)。
      avatarProbe: (
        /** @type {VenueSeatsDiagState['avatarProbe']} */
        null
      )
    };
  }
  function classifyVenueVisibleCapReason(obs) {
    const o = obs && typeof obs === "object" ? obs : {};
    const participant = Math.max(0, Math.floor(Number(o.participantCount) || 0));
    const perRow = Math.max(0, Math.floor(Number(o.perRow) || 0));
    const rows = Math.max(0, Math.floor(Number(o.venueMaxRows) || 0));
    const hardCap = Math.max(0, Math.floor(Number(o.hardCap) || 0));
    if (participant <= 0 || perRow <= 0 || rows <= 0 || hardCap <= 0) return "";
    const grid = perRow * rows;
    const min = Math.min(participant, grid, hardCap);
    if (participant <= min) return "participant";
    if (grid <= min) return "grid";
    return "hardCap";
  }
  function buildVenueSeatsDiagSnapshot(diag, nowMs) {
    const base = makeInitialVenueSeatsDiag();
    const d = (
      /** @type {any} */
      diag && typeof diag === "object" ? diag : {}
    );
    const num3 = (x, fallback) => {
      const n = Number(x);
      return Number.isFinite(n) ? n : fallback;
    };
    const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
    const perRow = num3(d.perRow, base.perRow);
    const venueMaxRows = num3(d.venueMaxRows, base.venueMaxRows);
    const participantCount = num3(d.participantCount, base.participantCount);
    const seatAreaWidth = num3(d.seatAreaWidth, base.seatAreaWidth);
    const reasonIn = typeof d.visibleCapReason === "string" ? d.visibleCapReason : "";
    const visibleCapReason = reasonIn === "participant" || reasonIn === "grid" || reasonIn === "hardCap" ? reasonIn : classifyVenueVisibleCapReason({
      participantCount,
      perRow,
      venueMaxRows,
      hardCap: num3(d.hardCap, 0)
    });
    const lpIn = (
      /** @type {any} */
      d.laneParity && typeof d.laneParity === "object" ? d.laneParity : null
    );
    const lpDomIn = (
      /** @type {any} */
      lpIn && lpIn.dom && typeof lpIn.dom === "object" ? lpIn.dom : null
    );
    const lpDom = lpDomIn && lpDomIn.measured === true ? {
      measured: true,
      ghost: Math.max(0, Math.floor(num3(lpDomIn.ghost, 0))),
      bare: Math.max(0, Math.floor(num3(lpDomIn.bare, 0))),
      visibleEmpty: Math.max(0, Math.floor(num3(lpDomIn.visibleEmpty, 0))),
      unkeyed: Math.max(0, Math.floor(num3(lpDomIn.unkeyed, 0))),
      // v0.1.1116: 白円計器(blank=avatarがblank.jpg・blankAnon=数値ID鍵でないのに白円=導出バグ)。
      blank: Math.max(0, Math.floor(num3(lpDomIn.blank, 0))),
      blankAnon: Math.max(0, Math.floor(num3(lpDomIn.blankAnon, 0))),
      dupIntra: Math.max(0, Math.floor(num3(lpDomIn.dupIntra, 0))),
      dupCross: Math.max(0, Math.floor(num3(lpDomIn.dupCross, 0))),
      strays: Math.max(0, Math.floor(num3(lpDomIn.strays, 0))),
      charFrame: Math.max(0, Math.floor(num3(lpDomIn.charFrame, 0))),
      crowdOn: lpDomIn.crowdOn === true,
      crowdCount: Math.max(0, Math.floor(num3(lpDomIn.crowdCount, 0))),
      probeFail: Math.max(0, Math.floor(num3(lpDomIn.probeFail, 0)))
    } : null;
    const laneParity = lpIn ? {
      mode: String(lpIn.mode || ""),
      verdict: String(lpIn.verdict || ""),
      reason: String(lpIn.reason || ""),
      line: String(lpIn.line || ""),
      unexplained: Math.max(0, Math.floor(num3(lpIn.unexplained, 0))),
      mirrorAgeSec: Math.floor(num3(lpIn.mirrorAgeSec, 0)),
      dom: lpDom
    } : null;
    const sdmIn = (
      /** @type {any} */
      d.storyDiagMirror && typeof d.storyDiagMirror === "object" ? d.storyDiagMirror : null
    );
    const sdmAge = Number(sdmIn?.ageSec);
    const olIn = (
      /** @type {any} */
      d.openLatency && typeof d.openLatency === "object" ? d.openLatency : null
    );
    const openLatency = olIn ? {
      opens: num3(olIn.opens, 0),
      mirrorMs: num3(olIn.mirrorMs, -1),
      aggregateMs: num3(olIn.aggregateMs, -1),
      firstPaintMs: num3(olIn.firstPaintMs, -1),
      firstSeatMs: num3(olIn.firstSeatMs, -1),
      mirrorTimedOut: olIn.mirrorTimedOut === true,
      mirrorAbsent: olIn.mirrorAbsent === true,
      line: String(olIn.line || "")
    } : base.openLatency;
    const storyDiagMirror = {
      present: sdmIn?.present === true,
      ageSec: sdmIn?.present === true && Number.isFinite(sdmAge) ? Math.max(0, Math.floor(sdmAge)) : null
    };
    const srIn = (
      /** @type {any} */
      d.sceneReceipt && typeof d.sceneReceipt === "object" ? d.sceneReceipt : null
    );
    const sceneReceipt = srIn ? { match: srIn.match === true, line: String(srIn.line || "") } : null;
    const slpIn = (
      /** @type {any} */
      d.seatLinkParity && typeof d.seatLinkParity === "object" ? d.seatLinkParity : null
    );
    const slpSampleIn = (
      /** @type {any} */
      slpIn?.lastSample && typeof slpIn.lastSample === "object" ? slpIn.lastSample : null
    );
    const seatLinkParity = slpIn ? {
      line: String(slpIn.line || ""),
      checked: Math.max(0, Math.floor(num3(slpIn.checked, 0))),
      paints: Math.max(0, Math.floor(num3(slpIn.paints, 0))),
      badPaints: Math.max(0, Math.floor(num3(slpIn.badPaints, 0))),
      uidMismatch: Math.max(0, Math.floor(num3(slpIn.uidMismatch, 0))),
      affordanceMismatch: Math.max(0, Math.floor(num3(slpIn.affordanceMismatch, 0))),
      hrefStale: Math.max(0, Math.floor(num3(slpIn.hrefStale, 0))),
      lastSample: slpSampleIn ? {
        kind: String(slpSampleIn.kind || ""),
        seatIndex: Math.max(0, Math.floor(num3(slpSampleIn.seatIndex, 0))),
        mirrorUid: String(slpSampleIn.mirrorUid || ""),
        rosterUid: String(slpSampleIn.rosterUid || ""),
        tileTag: String(slpSampleIn.tileTag || ""),
        seatLinkOn: slpSampleIn.seatLinkOn === true,
        mode: String(slpSampleIn.mode || ""),
        atWall: Math.max(0, Math.floor(num3(slpSampleIn.atWall, 0)))
      } : null
    } : null;
    const ynIn = (
      /** @type {any} */
      d.yukkuriNamedCensus && typeof d.yukkuriNamedCensus === "object" ? d.yukkuriNamedCensus : null
    );
    const ynSampleIn = (
      /** @type {any} */
      ynIn?.lastSample && typeof ynIn.lastSample === "object" ? ynIn.lastSample : null
    );
    const yukkuriNamedCensus = ynIn ? {
      line: String(ynIn.line || ""),
      checked: Math.max(0, Math.floor(num3(ynIn.checked, 0))),
      yukkuriNamed: Math.max(0, Math.floor(num3(ynIn.yukkuriNamed, 0))),
      outOfRangeDigits: Math.max(0, Math.floor(num3(ynIn.outOfRangeDigits, 0))),
      lastSample: ynSampleIn ? {
        uid: String(ynSampleIn.uid || ""),
        name: String(ynSampleIn.name || ""),
        digits: Math.max(0, Math.floor(num3(ynSampleIn.digits, 0)))
      } : null
    } : null;
    const scIn = (
      /** @type {any} */
      d.speechCensus && typeof d.speechCensus === "object" ? d.speechCensus : null
    );
    const speechCensus = scIn ? {
      line: String(scIn.line || ""),
      verdict: scIn.verdict === "warn" || scIn.verdict === "ok" ? scIn.verdict : "idle",
      checked: Math.max(0, Math.floor(num3(scIn.checked, 0))),
      shown: Math.max(0, Math.floor(num3(scIn.shown, 0))),
      mirrorOnly: Math.max(0, Math.floor(num3(scIn.mirrorOnly, 0))),
      missing: Math.max(0, Math.floor(num3(scIn.missing, 0))),
      silent: Math.max(0, Math.floor(num3(scIn.silent, 0))),
      hoverOpened: Math.max(0, Math.floor(num3(scIn.hoverOpened, 0))),
      hoverWithLines: Math.max(0, Math.floor(num3(scIn.hoverWithLines, 0))),
      hoverEmptyButSpoke: Math.max(0, Math.floor(num3(scIn.hoverEmptyButSpoke, 0))),
      hoverLied: Math.max(0, Math.floor(num3(scIn.hoverLied, 0)))
    } : null;
    const tcIn = (
      /** @type {any} */
      d.tileCountCensus && typeof d.tileCountCensus === "object" ? d.tileCountCensus : null
    );
    const tileCountCensus = tcIn ? {
      line: String(tcIn.line || ""),
      verdict: tcIn.verdict === "warn" || tcIn.verdict === "ok" ? tcIn.verdict : "idle",
      paints: Math.max(0, Math.floor(num3(tcIn.paints, 0))),
      changes: Math.max(0, Math.floor(num3(tcIn.changes, 0))),
      last: Math.max(0, Math.floor(num3(tcIn.last, 0))),
      max: Math.max(0, Math.floor(num3(tcIn.max, 0))),
      drops: Math.max(0, Math.floor(num3(tcIn.drops, 0))),
      shrinkRefused: Math.max(0, Math.floor(num3(tcIn.shrinkRefused, 0))),
      worstDrop: Math.max(0, Math.floor(num3(tcIn.worstDrop, 0))),
      worstFrom: Math.max(0, Math.floor(num3(tcIn.worstFrom, 0))),
      worstTo: Math.max(0, Math.floor(num3(tcIn.worstTo, 0))),
      worstCause: String(tcIn.worstCause || "")
    } : null;
    return {
      enabled: !!d.enabled,
      liveId: String(d.liveId || base.liveId),
      seatsShown: num3(d.seatsShown, base.seatsShown),
      participantCount,
      otherCount: num3(d.otherCount, base.otherCount),
      broadcasterInSeats: !!d.broadcasterInSeats,
      broadcasterKnown: !!d.broadcasterKnown,
      lastUpdateAt: num3(d.lastUpdateAt, base.lastUpdateAt),
      perRow,
      venueMaxRows,
      seatAreaWidth,
      visibleCapReason,
      laneParity,
      sceneReceipt,
      anonExcluded: Math.max(0, Math.floor(num3(d.anonExcluded, 0))),
      // venue-exact-parity-SPEC-2026-08-07 §5-3: 席なし(uid で席に結びつかなかった段タイル)件数。
      unseated: Math.max(0, Math.floor(num3(d.unseated, 0))),
      storyDiagMirror,
      openLatency,
      seatLinkParity,
      yukkuriNamedCensus,
      speechCensus,
      tileCountCensus,
      /*
       * ★v0.1.1317: 会場が鏡を受け取れているかの1行(会場が完全一致しない件の切り分け)。
       *   文字列1本だけ通す(未知の巨大オブジェクトを写さない=このファイルの既存方針)。
       *   空文字なら状態速報側で行ごと出さない=普段の速報を汚さない。
       */
      mirrorIntakeLine: String(d.mirrorIntakeLine || ""),
      // ★v0.1.1405: 判定の材料を素通しする(数値/文字列のみ・構造は固定)。
      mirrorIntake: (() => {
        const mi = (
          /** @type {any} */
          d.mirrorIntake
        );
        if (!mi || typeof mi !== "object") return null;
        const num4 = (x) => Number.isFinite(Number(x)) ? Number(x) : 0;
        return {
          changedEvents: num4(mi.changedEvents),
          keyMatched: num4(mi.keyMatched),
          keyMissed: num4(mi.keyMissed),
          accepted: num4(mi.accepted),
          rejectedByGate: num4(mi.rejectedByGate),
          lastMissedKeys: Array.isArray(mi.lastMissedKeys) ? mi.lastMissedKeys.slice(0, 3).map(String) : [],
          lastExpectedKey: String(mi.lastExpectedKey || ""),
          lastAcceptedAt: num4(mi.lastAcceptedAt),
          lastRejectReason: String(mi.lastRejectReason || "")
        };
      })(),
      /*
       * ★v0.1.1348: 会場のアイコン実績(6値だけ)を通す。
       *
       * ■ なぜ必要か: v0.1.1347 で読み手に `venueSeatsDiag.avatarProbe` を読む行を足したが、
       *   ここを通していなかったため【永久に出ない行】だった(書き手の実出力で通し確認せず出荷)。
       *   ★このファイルは「個別列挙して作り直す」方式なので、
       *     載せ忘れた値は静かに消える([[venue-mirror-is-the-primary-path]]・6回目)。
       *
       * ★未知フィールドは通さない既存方針を守り、数値6つだけを検証して写す。
       */
      avatarProbe: (() => {
        const p = d.avatarProbe;
        if (!p || typeof p !== "object") return null;
        return {
          usericonSucceeded: Math.max(0, Math.floor(num3(p.usericonSucceeded, 0))),
          usericonFailed: Math.max(0, Math.floor(num3(p.usericonFailed, 0))),
          failedTimeout: Math.max(0, Math.floor(num3(p.failedTimeout, 0))),
          failedError: Math.max(0, Math.floor(num3(p.failedError, 0))),
          retriedTotal: Math.max(0, Math.floor(num3(p.retriedTotal, 0))),
          lastFailAgoMs: Math.max(-1, Math.floor(num3(p.lastFailAgoMs, -1)))
        };
      })(),
      capturedAt: now
    };
  }

  // src/lib/storyAvatarDiagLine.js
  function interceptExportCodeUserLabel(code, detail = "") {
    const c = String(code || "").trim();
    const d = String(detail || "").trim();
    switch (c) {
      case "ok":
        return "取り込みに成功しました。";
      case "ok_empty":
        return "取り込みは成功しましたが、まだ行がありません。watch タブを開いたままにして、ポップアップを更新してみてください。";
      case "export_rejected":
        return d ? `取り込みをページ側が拒否しました（${d.slice(0, 80)}）` : "取り込みをページ側が拒否しました。";
      case "message_failed":
        return "ページとの通信に失敗しました。watch を再読み込み（F5）してから試してください。";
      case "no_success_response":
        return "ページから応答がありませんでした。対象の watch タブが開いているか確認してください。";
      default:
        return c ? `状態コード: ${c}` : "状態を取得できませんでした。";
    }
  }
  function formatStoryAvatarDiagLine(s) {
    const totalNum = Math.max(0, Math.floor(Number(s?.total) || 0));
    if (totalNum <= 0) return null;
    let line = `診断(技術): 保存アイコンURL ${s.withAvatar}/${totalNum}（種類 ${s.uniqueAvatar}） / 表示に使えたアイコン ${s.resolvedAvatar}/${totalNum}（種類 ${s.resolvedUniqueAvatar}） / ユーザーID ${s.withUid}/${totalNum} / 自分の投稿 表示${s.selfShown}件（保存済${s.selfSaved}, 待ち${s.selfPending}, 一致${s.selfPendingMatched}） / ページから拾った補助 ${s.interceptItems}件（ID${s.interceptWithUid}, アイコン${s.interceptWithAvatar}） / 後から補完 ${s.mergedPatched}件`;
    if (s.mergedUidReplaced > 0) {
      line += `（ID差し替え ${s.mergedUidReplaced}）`;
    }
    if (s.stripped > 0) {
      line += ` / 不整合除去 ${s.stripped}件`;
    }
    const mapOn = typeof s.interceptMapOnPage === "number" && s.interceptMapOnPage >= 0 ? String(s.interceptMapOnPage) : "—";
    const exportRows = typeof s.interceptExportRows === "number" && s.interceptExportRows >= 0 ? s.interceptExportRows : null;
    const exCode = String(s.interceptExportCode || "").trim();
    const exDetail = String(s.interceptExportDetail || "").trim().slice(0, 72);
    if (mapOn !== "—" || exportRows != null || exCode) {
      line += ` / ページ内の一時対応表 ${mapOn}件`;
      if (exportRows != null) line += `・直近の取り込み ${exportRows}行`;
      if (exCode) line += ` [${exCode}]`;
      if (exDetail) line += ` (${exDetail})`;
    }
    const ulDed = Math.max(0, Math.floor(Number(s.userLaneDeduped) || 0));
    if (ulDed > 0) {
      const t3 = Math.max(0, Math.floor(Number(s.userLaneTier3) || 0));
      const t2 = Math.max(0, Math.floor(Number(s.userLaneTier2) || 0));
      const t1 = Math.max(0, Math.floor(Number(s.userLaneTier1) || 0));
      const sn = Math.max(0, Math.floor(Number(s.userLaneStrongNick) || 0));
      const th = Math.max(0, Math.floor(Number(s.userLanePersonalThumb) || 0));
      line += ` / レーン候補${ulDed}（り${t3}/こ${t2}/た${t1}・強名${sn}/個サ${th}）`;
    }
    const regressions = Math.max(0, Math.floor(Number(s.diagRegressions) || 0));
    if (regressions > 0) {
      line += ` / 表示ゆらぎ補正${regressions}回`;
    }
    return line;
  }
  function buildStoryAvatarDiagVerboseHtml(s) {
    const totalNum = Math.max(0, Math.floor(Number(s?.total) || 0));
    const withUidRaw = Math.max(0, Math.floor(Number(s?.withUid) || 0));
    const resolvedRaw = Math.max(0, Math.floor(Number(s?.resolvedAvatar) || 0));
    const withUidN = totalNum <= 0 ? 0 : withUidRaw;
    const resolvedN = totalNum <= 0 ? 0 : resolvedRaw;
    const leadParts = [];
    leadParts.push(
      `記録している応援コメント <strong>${totalNum}</strong> 件のうち、一覧でアイコンまで表示できているのは <strong>${resolvedN}</strong> 件、ユーザーIDが付いているのは <strong>${withUidN}</strong> 件です。`
    );
    if (totalNum <= 0) {
      return `<div class="nl-story-diag nl-story-diag--verbose"><p class="nl-story-diag__lead">${leadParts.join(" ")}</p></div>`;
    }
    if (s.mergedPatched > 0) {
      leadParts.push(
        `あとから情報が足りて埋まった行が <strong>${s.mergedPatched}</strong> 件あります。`
      );
    }
    if (s.selfShown > 0 || s.selfPending > 0 || s.selfSaved > 0) {
      leadParts.push(
        `あなたが送ったコメントは、画面上 <strong>${s.selfShown}</strong> 件・このPCに保存済み <strong>${s.selfSaved}</strong> 件・照合待ち <strong>${s.selfPending}</strong> 件です。`
      );
    }
    if (s.interceptItems > 0) {
      leadParts.push(
        `視聴ページの通信から拾った利用者情報（アイコンや名前の補助）が <strong>${s.interceptItems}</strong> 件分あります。`
      );
    }
    const ulDed = Math.max(0, Math.floor(Number(s.userLaneDeduped) || 0));
    if (ulDed > 0) {
      const t3 = Math.max(0, Math.floor(Number(s.userLaneTier3) || 0));
      const t2 = Math.max(0, Math.floor(Number(s.userLaneTier2) || 0));
      const t1 = Math.max(0, Math.floor(Number(s.userLaneTier1) || 0));
      const sn = Math.max(0, Math.floor(Number(s.userLaneStrongNick) || 0));
      const th = Math.max(0, Math.floor(Number(s.userLanePersonalThumb) || 0));
      leadParts.push(
        `ユーザーレーンの候補（重複のない利用者）<strong>${ulDed}</strong> 件のうち、りんく列相当 <strong>${t3}</strong>・こん太 <strong>${t2}</strong>・たぬ姉 <strong>${t1}</strong>。強い表示名として扱えたのは <strong>${sn}</strong> 件、個人サムネありは <strong>${th}</strong> 件です（ニコの「user 英数字」仮名は強い表示名に入りません）。`
      );
    }
    const mapOn = typeof s.interceptMapOnPage === "number" && s.interceptMapOnPage >= 0 ? s.interceptMapOnPage : null;
    const exCode = String(s.interceptExportCode || "").trim();
    if (mapOn != null || exCode) {
      const extra = [];
      if (mapOn != null) {
        extra.push(
          `いまの watch タブ内の「コメント番号と利用者の対応表」は <strong>${mapOn}</strong> 件です（タブを閉じると消えます）。`
        );
      }
      if (exCode) {
        extra.push(
          escapeHtml2(
            interceptExportCodeUserLabel(
              exCode,
              String(s.interceptExportDetail || "")
            )
          )
        );
      }
      leadParts.push(extra.join(" "));
    }
    return `<div class="nl-story-diag nl-story-diag--verbose"><p class="nl-story-diag__lead">${leadParts.join(" ")}</p></div>`;
  }
  function buildStoryAvatarDiagHtml(s) {
    const totalNum = Math.max(0, Math.floor(Number(s?.total) || 0));
    if (totalNum <= 0) {
      return '<div class="nl-story-diag nl-story-diag--compact"><p class="nl-story-diag__lead">記録している応援コメント <strong>0</strong> 件です。</p></div>';
    }
    const technical = formatStoryAvatarDiagLine(s);
    const glossary = '<ul class="nl-story-diag__list"><li><strong>保存アイコン</strong>：このPCの記録に、アイコンのURLとして残っている件数です。</li><li><strong>表示アイコン</strong>：グリッドなどで実際に画像として使えている件数です。</li><li><strong>ページから拾った補助</strong>：ニコ生のページが読み取る通信から、拡張が利用者表示を補うために使う情報です（本文は保存しません）。</li><li><strong>一時対応表</strong>：開いている watch タブのメモリ上だけにある対応表で、キャッシュとは別です。</li><li><strong>ユーザーレーンの段</strong>：記録コメントの表示名・サムネURL・成長タイル用の解決結果から「強い名前」「個人サムネ」を判定しています。公式の仮名のままだとこん太・たぬ姉に寄りやすいです。</li></ul>';
    const compactLead = `記録している応援コメント <strong>${totalNum}</strong> 件です。件数の内訳（アイコン・ユーザーID・レーン・取り込みなど）は、下の「${SUPPORT_VISUAL_DEV_MONITOR_SUMMARY_LABEL}」を開くと読めます。`;
    return `<div class="nl-story-diag nl-story-diag--compact"><p class="nl-story-diag__lead">${compactLead}</p><details class="nl-story-diag__more"><summary class="nl-story-diag__summary">内訳・用語（詳しく見る）</summary><div class="nl-story-diag__body">` + glossary + (technical ? `<p class="nl-story-diag__technical">${escapeHtml2(technical)}</p>` : "") + `</div></details></div>`;
  }

  // src/lib/displayRecordedCount.js
  var DIAGNOSTIC_ONLY_COUNT_FIELDS = Object.freeze([
    "savedCommentsUidStats",
    "commentIngestBySource",
    "totalSaved",
    "withUid"
  ]);
  function selectDisplayRecordedCount(summary) {
    if (!summary || typeof summary !== "object") return 0;
    const n = Number(
      /** @type {any} */
      summary.recordedCount
    );
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  // src/lib/storyDiagTotalSource.js
  function nonNegativeIntOrZero(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  function isUsablePanelSummaryForLive(panelSummary, liveId) {
    if (!panelSummary || typeof panelSummary !== "object") return false;
    const lid = String(liveId || "").trim().toLowerCase();
    if (!lid) return false;
    const s = (
      /** @type {{ liveId?: unknown, recordedCount?: unknown }} */
      panelSummary
    );
    const summaryLid = String(s.liveId || "").trim().toLowerCase();
    if (summaryLid !== lid) return false;
    return Number.isFinite(Number(s.recordedCount));
  }
  function resolveStoryDiagTotal({ panelSummary, liveId, fallbackTotal, nowMs } = {}) {
    if (isUsablePanelSummaryForLive(panelSummary, liveId)) {
      const s = (
        /** @type {{ updatedAt?: unknown }} */
        panelSummary
      );
      const now = Number.isFinite(Number(nowMs)) && Number(nowMs) > 0 ? Number(nowMs) : Date.now();
      const updatedAt = Number(s.updatedAt);
      const panelAgeSec = Number.isFinite(updatedAt) && updatedAt > 0 ? Math.max(0, Math.floor((now - updatedAt) / 1e3)) : null;
      return {
        total: selectDisplayRecordedCount(panelSummary),
        source: "panel",
        panelAgeSec
      };
    }
    return {
      total: nonNegativeIntOrZero(fallbackTotal),
      source: "fallback",
      panelAgeSec: null
    };
  }

  // src/lib/venueStoryDiagMirrorPanel.js
  function normalizeLiveId(value) {
    return String(value || "").trim().toLowerCase();
  }
  function finiteNumberOrZero(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  function storyDiagAgeSec(capturedAt, nowMs) {
    const cap = finiteNumberOrZero(capturedAt);
    const now = finiteNumberOrZero(nowMs);
    if (cap <= 0 || now <= 0) return 0;
    return Math.max(0, Math.floor((now - cap) / 1e3));
  }
  function formatAgeLabel(sec) {
    if (sec < 60) return `${sec}秒前`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}分前`;
    return `${Math.floor(min / 60)}時間前`;
  }
  function storyDiagMirrorStatus(snap, liveId, nowMs) {
    const s = snap && typeof snap === "object" ? (
      /** @type {Record<string, unknown>} */
      snap
    ) : null;
    const sameLive = Boolean(s && normalizeLiveId(s.liveId) && normalizeLiveId(s.liveId) === normalizeLiveId(liveId));
    if (!sameLive) return { present: false, ageSec: null };
    return { present: true, ageSec: storyDiagAgeSec(s.capturedAt, nowMs) };
  }
  function buildVenueStoryDiagMirrorHtml(snap, nowMs) {
    const s = (
      /** @type {import('./storyAvatarDiagLine.js').StoryAvatarDiagSnapshot & { liveId?: string, capturedAt?: number }} */
      snap
    );
    const compactHtml = buildStoryAvatarDiagHtml(s);
    if (compactHtml == null) return { html: null, sig: "__hidden__" };
    const verboseHtml = buildStoryAvatarDiagVerboseHtml(s);
    const ageLabel = formatAgeLabel(storyDiagAgeSec(s?.capturedAt, nowMs));
    const sig = `${normalizeLiveId(s?.liveId)}|${finiteNumberOrZero(s?.capturedAt)}|${compactHtml}|${verboseHtml}`;
    return {
      sig,
      html: `<div class="nlsb-story-diag__head">①の診断(内訳 ${ageLabel})</div>` + compactHtml + (verboseHtml || "")
    };
  }
  function buildVenueStoryDiagPanelOnlyHtml(resolved) {
    const totalNum = Math.max(0, Math.floor(Number(resolved.total) || 0));
    const ageLabel = resolved.panelAgeSec == null ? "" : `(件数 ${formatAgeLabel(resolved.panelAgeSec)})`;
    const compactHtml = `<div class="nl-story-diag nl-story-diag--compact"><p class="nl-story-diag__lead">記録している応援コメント <strong>${totalNum}</strong> 件です。内訳は①ポップアップを開くと表示されます。</p></div>`;
    const sig = `panelOnly|${totalNum}`;
    return {
      sig,
      html: `<div class="nlsb-story-diag__head">①の診断${ageLabel}</div>` + compactHtml
    };
  }
  function tryBuildPanelOnlyFallback(opts) {
    if (opts.panelSummary === void 0) return null;
    const resolved = resolveStoryDiagTotal({
      panelSummary: opts.panelSummary,
      liveId: String(opts.liveId || ""),
      fallbackTotal: 0,
      nowMs: finiteNumberOrZero(opts.nowMs)
    });
    if (resolved.source !== "panel") return null;
    return buildVenueStoryDiagPanelOnlyHtml(resolved);
  }
  function renderVenueStoryDiagMirrorPanel(host, snap, opts = {}) {
    if (!host) return { sig: String(opts.lastSig || ""), changed: false };
    const s = snap && typeof snap === "object" ? (
      /** @type {Record<string, unknown>} */
      snap
    ) : null;
    const sameLive = Boolean(s && normalizeLiveId(s.liveId) && normalizeLiveId(s.liveId) === normalizeLiveId(opts.liveId));
    if (!sameLive) {
      const fallback = tryBuildPanelOnlyFallback(opts);
      if (fallback) {
        if (fallback.sig === opts.lastSig && !host.hidden) return { sig: fallback.sig, changed: false };
        host.innerHTML = fallback.html;
        host.hidden = false;
        return { sig: fallback.sig, changed: true };
      }
      const changed = !host.hidden || host.innerHTML !== "" || opts.lastSig !== "__hidden__";
      if (changed) {
        host.hidden = true;
        host.innerHTML = "";
      }
      return { sig: "__hidden__", changed };
    }
    const built = buildVenueStoryDiagMirrorHtml(s, opts.nowMs);
    if (built.html == null) {
      const fallback = tryBuildPanelOnlyFallback(opts);
      if (fallback) {
        if (fallback.sig === opts.lastSig && !host.hidden) return { sig: fallback.sig, changed: false };
        host.innerHTML = fallback.html;
        host.hidden = false;
        return { sig: fallback.sig, changed: true };
      }
      const changed = !host.hidden || host.innerHTML !== "" || opts.lastSig !== "__hidden__";
      if (changed) {
        host.hidden = true;
        host.innerHTML = "";
      }
      return { sig: "__hidden__", changed };
    }
    if (built.sig === opts.lastSig && !host.hidden) {
      return { sig: built.sig, changed: false };
    }
    host.innerHTML = built.html;
    host.hidden = false;
    return { sig: built.sig, changed: true };
  }

  // src/lib/venueAvatarDiagLine.js
  function computeVenueParticipantAvatarCounts(participants) {
    const list = Array.isArray(participants) ? participants : [];
    let total = 0;
    let withUid = 0;
    let withAvatar = 0;
    let resolvedAvatar = 0;
    for (const p of list) {
      if (!p || typeof p !== "object") continue;
      total += 1;
      if (String(p.userId || "").trim() !== "") withUid += 1;
      if (/^https?:\/\//i.test(String(p.avatar || "").trim())) withAvatar += 1;
      if (participantHasEffectiveThumbnail(p)) resolvedAvatar += 1;
    }
    return { total, withUid, withAvatar, resolvedAvatar };
  }
  function venueDiagSig(counts, seatsDiag) {
    const c = (
      /** @type {any} */
      counts && typeof counts === "object" ? counts : {}
    );
    const d = (
      /** @type {any} */
      seatsDiag && typeof seatsDiag === "object" ? seatsDiag : {}
    );
    const n = (x) => Math.max(0, Math.floor(Number(x) || 0));
    return [
      n(c.total),
      n(c.withUid),
      n(c.withAvatar),
      n(c.resolvedAvatar),
      n(d.seatsShown),
      n(d.participantCount),
      n(d.otherCount),
      d.broadcasterInSeats ? 1 : 0,
      d.broadcasterKnown ? 1 : 0
    ].join("|");
  }
  function formatUpdatedAgo(agoMs) {
    const ms = Number(agoMs);
    if (!Number.isFinite(ms) || ms < 0) return "—";
    const sec = Math.floor(ms / 1e3);
    if (sec < 5) return "たった今";
    if (sec < 60) return `${sec}秒前`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}分前`;
    return `${Math.floor(min / 60)}時間前`;
  }
  function buildVenueDiagHtml(input) {
    const counts = input && input.counts && typeof input.counts === "object" ? input.counts : { total: 0, withUid: 0, withAvatar: 0, resolvedAvatar: 0 };
    const d = (
      /** @type {any} */
      input && input.seatsDiag && typeof input.seatsDiag === "object" ? input.seatsDiag : {}
    );
    const n = (x) => Math.max(0, Math.floor(Number(x) || 0));
    const total = n(counts.total);
    const withUid = total <= 0 ? 0 : n(counts.withUid);
    const resolved = total <= 0 ? 0 : n(counts.resolvedAvatar);
    const seatsShown = n(d.seatsShown);
    const participantCount = n(d.participantCount);
    const otherCount = n(d.otherCount);
    const lead = `いま会場には <strong>${participantCount}</strong> 人が参加していて、席に表示しているのは <strong>${seatsShown}</strong> 人` + (otherCount > 0 ? `（ほか <strong>${otherCount}</strong> 人は席に入りきりません）` : "") + `。`;
    const faceLine = total > 0 ? `席にご案内できた <strong>${total}</strong> 人のうち、顔アイコンを表示できているのは <strong>${resolved}</strong> 人、ユーザーIDが付いているのは <strong>${withUid}</strong> 人です。` : `まだ参加者がいません。`;
    let broadcasterLine = "";
    if (d.broadcasterKnown) {
      broadcasterLine = d.broadcasterInSeats ? `<p class="nl-venue-diag__warn">⚠️ 配信者ご本人が席に混ざっています（本来は除外されます）。</p>` : `<p class="nl-venue-diag__ok">配信者ご本人は席に混ざっていません。</p>`;
    }
    const updated = formatUpdatedAgo(input && input.updatedAgoMs);
    return `<div class="nl-venue-diag"><p class="nl-venue-diag__lead">${lead}</p><p class="nl-venue-diag__face">${faceLine}</p>` + broadcasterLine + `<p class="nl-venue-diag__foot">最終更新: ${escapeHtml2(updated)}</p></div>`;
  }

  // src/lib/venueViewport.js
  var VENUE_MAX_HEIGHT_VH = 48;
  function seatsPerRow(availableWidthPx, seatMinWidthPx) {
    const w = Math.max(0, Number(availableWidthPx) || 0);
    const sw = Math.max(1, Number(seatMinWidthPx) || 1);
    return Math.max(1, Math.floor(w / sw));
  }
  function resolveDynamicArenaCap(total, opts = {}) {
    const n = Math.max(0, Math.floor(Number(total) || 0));
    const base = Math.max(1, Math.floor(Number(opts.base ?? 60)));
    const ratio = Number(opts.ratio ?? 0.5) > 0 ? Number(opts.ratio ?? 0.5) : 0.5;
    const max = Math.max(base, Math.floor(Number(opts.max ?? 150)));
    const byRatio = Math.floor(n * ratio);
    return Math.min(max, Math.max(base, byRatio));
  }
  function resolveVenueMaxHeightVh(_total) {
    return VENUE_MAX_HEIGHT_VH;
  }
  function resolveVisibleArenaCount(opts) {
    const total = Math.max(0, Math.floor(Number(opts?.totalCount) || 0));
    const perRow = Math.max(1, Math.floor(Number(opts?.perRow) || 1));
    const rows = Math.max(1, Math.floor(Number(opts?.rows ?? 3)));
    const hardCap = opts?.hardCap != null ? Math.max(1, Math.floor(Number(opts.hardCap))) : resolveDynamicArenaCap(total);
    const byGrid = perRow * rows;
    return Math.min(total, byGrid, hardCap);
  }
  function selectStableVisibleMembers(ordered, visibleCount, recentlySpokenKeys, keyOf2) {
    const list = Array.isArray(ordered) ? ordered : [];
    const cap = Math.max(0, Math.floor(Number(visibleCount) || 0));
    if (cap === 0 || list.length === 0) return [];
    if (list.length <= cap) return list.slice();
    const getKey = typeof keyOf2 === "function" ? keyOf2 : (
      /** @param {any} row */
      (row) => String(row?.key || row?.userId || row?.name || "").trim()
    );
    const spoken = recentlySpokenKeys instanceof Set ? recentlySpokenKeys : new Set(Array.isArray(recentlySpokenKeys) ? recentlySpokenKeys.map((k) => String(k)) : []);
    const picked = [];
    const pickedIdx = /* @__PURE__ */ new Set();
    if (spoken.size > 0) {
      for (let i = 0; i < list.length && picked.length < cap; i += 1) {
        const k = getKey(list[i]);
        if (k && spoken.has(k)) {
          picked.push(i);
          pickedIdx.add(i);
        }
      }
    }
    for (let i = 0; i < list.length && picked.length < cap; i += 1) {
      if (pickedIdx.has(i)) continue;
      picked.push(i);
      pickedIdx.add(i);
    }
    picked.sort((a, b) => a - b);
    return picked.map((i) => list[i]);
  }
  function partitionThumbnailFirst(list, hasThumb) {
    const arr = Array.isArray(list) ? list : [];
    const pred = typeof hasThumb === "function" ? hasThumb : () => false;
    const withThumb = [];
    const without = [];
    for (const entry of arr) {
      if (pred(entry)) withThumb.push(entry);
      else without.push(entry);
    }
    return [...withThumb, ...without];
  }

  // src/lib/venueDragScroll.js
  var VENUE_DRAG_THRESHOLD_PX = 6;
  function initVenueDragState() {
    return { active: false, moved: false, startY: 0, startScrollTop: 0 };
  }
  function beginVenueDrag(pointerY, scrollTop) {
    return {
      active: true,
      moved: false,
      startY: Number(pointerY) || 0,
      startScrollTop: Math.max(0, Number(scrollTop) || 0)
    };
  }
  function updateVenueDrag(state, pointerY, maxScrollTop) {
    if (!state || !state.active) {
      return { state: state || initVenueDragState(), scrollTop: 0 };
    }
    const y = Number(pointerY) || 0;
    const delta = y - state.startY;
    const max = Math.max(0, Number(maxScrollTop) || 0);
    const raw = state.startScrollTop - delta;
    const scrollTop = Math.min(max, Math.max(0, raw));
    const moved = state.moved || Math.abs(delta) >= VENUE_DRAG_THRESHOLD_PX;
    return { state: { ...state, moved }, scrollTop };
  }
  function endVenueDrag(state) {
    const wasDrag = !!(state && state.active && state.moved);
    return { state: initVenueDragState(), wasDrag };
  }

  // src/lib/venueRoster.js
  function buildVenueRoster(input = {}) {
    const allSeats = Array.isArray(input.allSeats) ? input.allSeats : [];
    const visibleSeats = Array.isArray(input.visibleSeats) ? input.visibleSeats : [];
    const audienceCount = Math.max(0, Math.floor(Number(input.audienceCount) || 0));
    const visibleKeys = new Set(
      visibleSeats.map((s) => String(s?.participant?.key || s?.participant?.userId || "").trim())
    );
    const rows = allSeats.map((s) => {
      const p = s?.participant || {};
      const key = String(p.key || p.userId || "").trim();
      const hasThumb = participantHasEffectiveThumbnail(p);
      return {
        seatIndex: Number(s?.seatIndex) || 0,
        userId: String(p.userId || "").trim(),
        name: String(p.name || "").trim(),
        hasThumb,
        visible: visibleKeys.has(key),
        isGift: !!p.hasGift
      };
    });
    rows.sort((a, b) => a.seatIndex - b.seatIndex);
    const withThumb = rows.filter((r) => r.hasThumb).length;
    const thumbVisible = rows.filter((r) => r.hasThumb && r.visible).length;
    const visible = rows.filter((r) => r.visible).length;
    return {
      rows,
      summary: {
        total: rows.length,
        visible,
        hidden: rows.length - visible,
        withThumb,
        thumbVisible,
        audience: audienceCount
      }
    };
  }
  function formatVenueRosterSummary(summary) {
    const s = summary || {};
    const total = Number(s.total) || 0;
    const visible = Number(s.visible) || 0;
    const withThumb = Number(s.withThumb) || 0;
    const thumbVisible = Number(s.thumbVisible) || 0;
    const audience = Number(s.audience) || 0;
    return `席を持つ参加者 ${total}人 / 画面表示中 ${visible}人 / 隠れ ${total - visible}人 ・サムネ持ち ${withThumb}人(うち表示 ${thumbVisible}人) ・ 後方観客(点描) ${audience}人`;
  }

  // src/lib/bubblePlacement.js
  var SIDE_PENALTY = { top: 0, bottom: 0.12, right: 0.22, left: 0.24 };
  var TAIL_INSET = 16;
  function overlapArea(a, b) {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0 && h > 0 ? w * h : 0;
  }
  function clamp(v, lo, hi) {
    if (hi < lo) return lo;
    return v < lo ? lo : v > hi ? hi : v;
  }
  function toBox(r) {
    const o = (
      /** @type {any} */
      r
    );
    if (!o) return null;
    const left = Number(o.left);
    const top = Number(o.top);
    const right = Number.isFinite(Number(o.right)) ? Number(o.right) : left + Number(o.width);
    const bottom = Number.isFinite(Number(o.bottom)) ? Number(o.bottom) : top + Number(o.height);
    if (![left, top, right, bottom].every(Number.isFinite)) return null;
    return { left, top, right: Math.max(left, right), bottom: Math.max(top, bottom) };
  }
  function resolveVisibleAnchor(seat, clip) {
    const s = toBox(seat) || { left: 0, top: 0, right: 0, bottom: 0 };
    const c = toBox(clip);
    if (!c) return { anchor: s, visible: true, edge: null };
    const area = (s.right - s.left) * (s.bottom - s.top);
    const seen = overlapArea(s, c);
    if (area <= 0 || seen / area >= 0.5) return { anchor: s, visible: true, edge: null };
    const cx = clamp((s.left + s.right) / 2, c.left + 4, c.right - 4);
    const below = (s.top + s.bottom) / 2 >= (c.top + c.bottom) / 2;
    const y = below ? c.bottom - 2 : c.top + 2;
    return {
      anchor: { left: cx - 1, top: y, right: cx + 1, bottom: y },
      visible: false,
      edge: below ? "bottom" : "top"
    };
  }
  function chooseBubblePlacement(p) {
    const a = toBox(p?.anchor) || { left: 0, top: 0, right: 0, bottom: 0 };
    const w = Math.max(1, Number(p?.size?.w) || 160);
    const h = Math.max(1, Number(p?.size?.h) || 40);
    const b = toBox(p?.bounds) || { left: -1e6, top: -1e6, right: 1e6, bottom: 1e6 };
    const gap = Number.isFinite(Number(p?.gap)) ? Number(p.gap) : 10;
    const home = toBox(p?.home);
    const outsideWeight = Number.isFinite(Number(p?.outsideWeight)) ? Number(p.outsideWeight) : 0.5;
    const obstacles = [];
    for (const o of Array.isArray(p?.obstacles) ? p.obstacles : []) {
      const box = toBox(o);
      const weight = Number(
        /** @type {any} */
        o?.weight
      );
      if (box && weight > 0) obstacles.push({ ...box, weight });
    }
    const sides = Array.isArray(p?.sides) && p.sides.length ? p.sides : ["top", "bottom", "right", "left"];
    const prefer = p?.prefer || null;
    const cx = (a.left + a.right) / 2;
    const cy = (a.top + a.bottom) / 2;
    const area = w * h;
    const cands = [];
    const push = (side, left, top, dist) => {
      cands.push({
        side,
        left: clamp(left, b.left, b.right - w),
        top: clamp(top, b.top, b.bottom - h),
        dist
      });
    };
    const xs = [cx - w / 2, cx - TAIL_INSET - 8, cx - w + TAIL_INSET + 8];
    for (const side of sides) {
      if (side === "top" || side === "bottom") {
        const y0 = side === "top" ? a.top - gap - h : a.bottom + gap;
        for (const x of xs) push(side, x, y0, 0);
        for (const o of obstacles) {
          if (o.right <= cx - w || o.left >= cx + w) continue;
          const y = side === "top" ? o.top - 6 - h : o.bottom + 6;
          const dist = side === "top" ? y0 - y : y - y0;
          if (dist > 0) for (const x of xs) push(side, x, y, dist);
        }
      } else {
        const x0 = side === "right" ? a.right + gap : a.left - gap - w;
        push(side, x0, cy - h / 2, 0);
        push(side, x0, cy - h + TAIL_INSET + 8, 0);
        push(side, x0, cy - TAIL_INSET - 8, 0);
      }
    }
    let best = null;
    for (const c of cands) {
      const box = { left: c.left, top: c.top, right: c.left + w, bottom: c.top + h };
      let score = 0;
      for (const o of obstacles) score += overlapArea(box, o) * o.weight;
      score += overlapArea(box, a) * 8;
      if (home) score += (area - overlapArea(box, home)) * outsideWeight;
      score += area * (SIDE_PENALTY[c.side] ?? 0.3);
      if (prefer && c.side !== prefer) score += area * 0.06;
      const far = Math.max(0, c.dist - h);
      score += c.dist * w * 0.8 + far * far * w * 0.05;
      const tail = c.side === "top" || c.side === "bottom" ? cx - c.left : cy - c.top;
      const span = c.side === "top" || c.side === "bottom" ? w : h;
      const reach = tail < TAIL_INSET ? TAIL_INSET - tail : tail > span - TAIL_INSET ? tail - (span - TAIL_INSET) : 0;
      score += reach * span * 2;
      if (!best || score < best.score - 0.5) {
        best = { left: Math.round(c.left), top: Math.round(c.top), side: c.side, tail: Math.round(clamp(tail, TAIL_INSET, span - TAIL_INSET)), score };
      }
    }
    return best || { left: Math.round(cx - w / 2), top: Math.round(a.top - gap - h), side: "top", tail: Math.round(w / 2), score: 0 };
  }
  function coveredBubbleIndexes(box, others, ratio = 0.35) {
    const me = toBox(box);
    const out = [];
    if (!me || !Array.isArray(others)) return out;
    others.forEach((o, i) => {
      const r = toBox(o);
      if (!r) return;
      const area = (r.right - r.left) * (r.bottom - r.top);
      if (area > 0 && overlapArea(me, r) / area >= ratio) out.push(i);
    });
    return out;
  }

  // src/extension/venueBubblePlacer.js
  var VENUE_BUBBLE_OBSTACLE_WEIGHTS = { bubble: 5, pickup: 3, header: 3, guide: 2 };
  function visibleClipRect(el, stopAt) {
    let clip = null;
    let outerScroll = null;
    for (let p = el.parentElement; p && p !== stopAt; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
      const r = p.getBoundingClientRect();
      if (/auto|scroll/.test(cs.overflowY)) outerScroll = r;
      clip = clip ? { left: Math.max(clip.left, r.left), top: Math.max(clip.top, r.top), right: Math.min(clip.right, r.right), bottom: Math.min(clip.bottom, r.bottom) } : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
    if (clip && (clip.bottom <= clip.top || clip.right <= clip.left) && outerScroll) {
      return { left: outerScroll.left, top: outerScroll.top, right: outerScroll.right, bottom: outerScroll.bottom };
    }
    return clip;
  }
  var rel2 = (r, o) => ({ left: r.left - o.left, top: r.top - o.top, right: r.right - o.left, bottom: r.bottom - o.top });
  function placeVenueBubble(p) {
    const { layer, bubbleEl, anchorEl } = p;
    const L = layer.getBoundingClientRect();
    let anchor;
    let away = false;
    let edge = null;
    let clip = null;
    if (anchorEl) {
      clip = visibleClipRect(anchorEl, layer.parentElement || layer);
      const v = resolveVisibleAnchor(rel2(anchorEl.getBoundingClientRect(), L), clip ? rel2(clip, L) : null);
      anchor = v.anchor;
      away = !v.visible;
      edge = v.edge;
    } else if (p.fallback && p.viewport) {
      const v = rel2(p.viewport.getBoundingClientRect(), L);
      const x = Math.min(Math.max(p.fallback.x, v.left + 24), v.right - 24);
      let floor = v.bottom;
      if (p.viewportFloor && p.viewportFloor.isConnected) {
        const f = rel2(p.viewportFloor.getBoundingClientRect(), L);
        if (f.bottom > f.top && f.top > v.top + 40 && f.top < floor) floor = f.top;
      }
      anchor = { left: x - 1, top: floor - 2, right: x + 1, bottom: floor - 2 };
      away = true;
      edge = "bottom";
    } else if (p.fallback) {
      anchor = { left: p.fallback.x - 1, top: p.fallback.y, right: p.fallback.x + 1, bottom: p.fallback.y };
    } else {
      return null;
    }
    bubbleEl.classList.toggle("nlsb-bubble--away", away);
    bubbleEl.classList.toggle("nlsb-bubble--seatless", !anchorEl && !!p.viewport);
    const w = bubbleEl.offsetWidth || 160;
    const h = bubbleEl.offsetHeight || 40;
    const obstacles = [];
    for (const o of p.obstacleEls) {
      if (!o.el || !o.el.isConnected) continue;
      let r = rel2(o.el.getBoundingClientRect(), L);
      if (o.clipTo) {
        const c = rel2(o.clipTo.getBoundingClientRect(), L);
        r = { left: Math.max(r.left, c.left), top: Math.max(r.top, c.top), right: Math.min(r.right, c.right), bottom: Math.min(r.bottom, c.bottom) };
      }
      if (r.right > r.left && r.bottom > r.top) obstacles.push({ ...r, weight: o.weight });
    }
    for (const r of p.otherBubbles) obstacles.push({ ...r, weight: VENUE_BUBBLE_OBSTACLE_WEIGHTS.bubble });
    const vw = Math.min(L.width, (globalThis.innerWidth || L.width) - L.left);
    const pl = chooseBubblePlacement({
      anchor,
      size: { w, h },
      bounds: { left: 8, top: 8, right: Math.max(16, vw - 8), bottom: Math.max(16, L.height - 8) },
      obstacles,
      home: p.seating ? rel2(p.seating.getBoundingClientRect(), L) : null,
      outsideWeight: 0.5,
      gap: away ? 4 : 10,
      sides: edge === "bottom" ? ["top"] : edge === "top" ? ["bottom"] : void 0,
      prefer: p.prefer || null
    });
    bubbleEl.dataset.side = pl.side;
    bubbleEl.style.setProperty("--nlsb-bubble-tail", `${pl.tail}px`);
    bubbleEl.style.left = `${pl.left}px`;
    bubbleEl.style.top = `${pl.top + h}px`;
    return { box: { left: pl.left, top: pl.top, right: pl.left + w, bottom: pl.top + h }, side: pl.side };
  }

  // src/lib/venueCrowdMotion.js
  var BASE_PERIOD_MS = 3600;
  function clamp01(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return n < 0 ? 0 : n > 1 ? 1 : n;
  }
  function resolveCrowdMotionProfile(heatLevel) {
    const h = clamp01(heatLevel);
    const periodMs = BASE_PERIOD_MS - h * 2400;
    const swayDeg = 4 + h * 18;
    const breathePx = 0.018 + h * 0.022;
    const desync = h * 0.28;
    return { periodMs, swayDeg, breathePx, desync };
  }
  function resolveCrowdSpriteMotion(timeMs, unitPhase, profile) {
    const t = Number(timeMs) || 0;
    const period = Math.max(200, profile.periodMs || BASE_PERIOD_MS);
    const u = clamp01(unitPhase);
    const globalPhase = t / period * Math.PI * 2;
    const phase = globalPhase + u * Math.PI * 2 * profile.desync;
    const swayRad = Math.sin(phase) * ((profile.swayDeg || 0) * Math.PI / 180);
    const breathePhase = t / (period * 1.7) * Math.PI * 2 + u * Math.PI * 0.5 * profile.desync;
    const breathe = -(Math.sin(breathePhase) * 0.5 + 0.5) * (profile.breathePx || 0);
    return { swayRad, breathe };
  }

  // src/lib/crowdRasterizer.js
  function resolveCrowdRenderPlan(count) {
    const n = Math.max(0, Math.floor(Number(count) || 0));
    if (n <= 0) return { spriteCap: 0, glow: false, lightStick: false };
    if (n <= 600) return { spriteCap: n, glow: true, lightStick: true };
    if (n <= 1e3) return { spriteCap: n, glow: false, lightStick: true };
    if (n <= 2048) return { spriteCap: 1e3, glow: false, lightStick: true };
    return { spriteCap: 800, glow: false, lightStick: false };
  }
  function xorshift32(state) {
    let x = state || 1;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x >>> 0;
  }
  var SILHOUETTES = [
    { type: "round" },
    { type: "square" }
  ];
  var LIGHTSTICK_COLORS = [
    "#ff3366",
    // ピンクレッド
    "#33ccff",
    // シアン
    "#ffcc00",
    // イエロー
    "#66ff66",
    // エメラルドグリーン
    "#cc66ff",
    // パープル
    "#ff8833",
    // オレンジ
    "#ffffff"
    // ホワイト
  ];
  function drawAudience(ctx, x, y, size, depth, spriteType, lightColor, detail = {}, motion = {}) {
    const wantStick = detail.lightStick !== false;
    const wantGlow = detail.glow !== false;
    const swayRad = Number(motion.swayRad) || 0;
    const breatheY = (Number(motion.breathe) || 0) * size;
    y += breatheY;
    const alpha = 0.2 + depth * 0.8;
    const lightness = Math.floor(10 + depth * 25);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `rgb(${lightness}, ${lightness + 5}, ${lightness + 15})`;
    ctx.beginPath();
    if (spriteType === "round") {
      ctx.arc(x, y - size * 0.5, size * 0.45, 0, Math.PI * 2);
      ctx.moveTo(x - size * 0.7, y + size * 0.4);
      ctx.quadraticCurveTo(x, y - size * 0.2, x + size * 0.7, y + size * 0.4);
      ctx.lineTo(x + size * 0.7, y + size);
      ctx.lineTo(x - size * 0.7, y + size);
    } else {
      ctx.roundRect(x - size * 0.4, y - size, size * 0.8, size * 0.9, size * 0.2);
      ctx.moveTo(x - size * 0.6, y + size * 0.5);
      ctx.lineTo(x, y - size * 0.1);
      ctx.lineTo(x + size * 0.6, y + size * 0.5);
      ctx.lineTo(x + size * 0.6, y + size);
      ctx.lineTo(x - size * 0.6, y + size);
    }
    ctx.fill();
    if (!wantStick) return;
    const stickX = x + size * 0.4;
    const stickY = y - size * 0.2;
    const stickLength = size * 0.8;
    const stickWidth = Math.max(1.5, size * 0.15);
    const baseDX = size * 0.1;
    const baseDY = -stickLength;
    const cos = Math.cos(swayRad);
    const sin = Math.sin(swayRad);
    const tipX = stickX + (baseDX * cos - baseDY * sin);
    const tipY = stickY + (baseDX * sin + baseDY * cos);
    ctx.globalAlpha = depth * 0.9 + 0.1;
    ctx.lineCap = "round";
    ctx.lineWidth = stickWidth;
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(stickX, stickY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.globalAlpha = depth * 0.6 + 0.1;
    ctx.lineWidth = stickWidth * 3;
    ctx.strokeStyle = lightColor;
    ctx.stroke();
    if (!wantGlow) return;
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = depth * 0.3;
    ctx.lineWidth = stickWidth * 6;
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  }
  function drawCrowdOnCanvas(canvas, count, seed = 12345, anim = null) {
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (count <= 0) return;
    const plan = resolveCrowdRenderPlan(count);
    const maxDraw = Math.max(0, Math.min(count, plan.spriteCap));
    if (maxDraw <= 0) return;
    const detail = { glow: plan.glow, lightStick: plan.lightStick };
    let rngState = seed + count >>> 0;
    const motionProfile = anim ? resolveCrowdMotionProfile(anim.heatLevel ?? 0) : null;
    const timeMs = anim ? Number(anim.timeMs) || 0 : 0;
    const positions = [];
    for (let i = 0; i < maxDraw; i++) {
      rngState = xorshift32(rngState);
      const r = rngState / 4294967295;
      const normalizedIndex = i / maxDraw;
      const depth = 1 - Math.pow(normalizedIndex, 0.6);
      rngState = xorshift32(rngState);
      const angleRng = rngState / 4294967295;
      const xPos = w * 0.5 + (angleRng - 0.5) * w * 1.8;
      const xDist = Math.abs((xPos - w * 0.5) / (w * 0.5));
      const curveY = Math.pow(xDist, 1.5) * depth * h * 0.3;
      const yPos = depth * h * 0.85 - curveY + r * h * 0.15 + h * 0.1;
      const size = Math.max(2, 5 + depth * 35);
      rngState = xorshift32(rngState);
      const spriteType = SILHOUETTES[rngState % SILHOUETTES.length].type;
      rngState = xorshift32(rngState);
      const lightColor = LIGHTSTICK_COLORS[rngState % LIGHTSTICK_COLORS.length];
      const unitPhase = (xPos / w + 2) % 1;
      positions.push({ x: xPos, y: yPos, size, depth, spriteType, lightColor, unitPhase });
    }
    positions.sort((a, b) => a.y - b.y);
    for (const p of positions) {
      const motion = motionProfile ? resolveCrowdSpriteMotion(timeMs, p.unitPhase, motionProfile) : void 0;
      drawAudience(ctx, p.x, p.y, p.size, p.depth, p.spriteType, p.lightColor, detail, motion);
    }
  }

  // src/lib/venueHeat.js
  var VENUE_HEAT_WINDOW_MS = 2e4;
  var VENUE_HEAT_FULL_PER_MIN = 60;
  function resolveVenueHeatLevel(rows, opts = {}) {
    const list = Array.isArray(rows) ? rows : [];
    const now = Number.isFinite(opts.now) ? Number(opts.now) : Date.now();
    const windowMs = Number.isFinite(opts.windowMs) && opts.windowMs > 0 ? Number(opts.windowMs) : VENUE_HEAT_WINDOW_MS;
    const fullPerMin = Number.isFinite(opts.fullPerMin) && opts.fullPerMin > 0 ? Number(opts.fullPerMin) : VENUE_HEAT_FULL_PER_MIN;
    const since = now - windowMs;
    let countInWindow = 0;
    for (const r of list) {
      const at = Number(r?.capturedAt);
      if (!Number.isFinite(at)) continue;
      const t = at > now ? now : at;
      if (t >= since) countInWindow += 1;
    }
    if (countInWindow <= 0) return 0;
    const perMin = countInWindow * (6e4 / windowMs);
    const level = Math.log1p(perMin) / Math.log1p(fullPerMin);
    return Math.max(0, Math.min(1, level));
  }
  function heatLevelToWarmColor(level) {
    const t = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
    const cool = [70, 90, 140];
    const warm = [255, 150, 60];
    const mix = (a, b2) => Math.round(a + (b2 - a) * t);
    const r = mix(cool[0], warm[0]);
    const g = mix(cool[1], warm[1]);
    const b = mix(cool[2], warm[2]);
    return `rgb(${r}, ${g}, ${b})`;
  }
  function heatLevelToGlowOpacity(level, opts = {}) {
    const t = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
    const min = Number.isFinite(opts.min) ? Math.max(0, Math.min(1, opts.min)) : 0.06;
    const max = Number.isFinite(opts.max) ? Math.max(0, Math.min(1, opts.max)) : 0.34;
    return min + (max - min) * t;
  }
  function heatLevelToLabel(level) {
    const t = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
    if (t < 0.15) return "静か";
    if (t < 0.45) return "おだやか";
    if (t < 0.75) return "盛り上がり";
    return "大盛況";
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

  // src/lib/voiceKeys.js
  var KEY_VOICE_READING_ENABLED = "nls_voice_reading_enabled_v1";
  var KEY_VOICE_ASSIGNMENTS = "nls_voice_assignments_v1";
  var KEY_VOICE_READ_NAME_ENABLED = "nls_voice_read_name_enabled_v1";
  var KEY_VOICE_VOLUME_PERCENT = "nls_voice_volume_percent_v1";
  var KEY_VOICE_NARROW_MODE = "nls_voice_narrow_mode_v1";
  var KEY_VOICE_WEAK_PC = "nls_voice_weak_pc_v1";
  var KEY_VOICE_QUALITY = "nls_voice_quality_v1";

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
  async function isVoicevoxAlive(opts = {}) {
    const probe = await probeVoicevoxAlive(opts);
    return probe.ok;
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

  // src/lib/voiceSynthFailure.js
  var VOICE_SYNTH_TIMEOUT_MS = 8e3;
  var VOICE_SYNTH_NEAR_TIMEOUT_RATIO = 0.9;
  function classifyVoiceSynthNull(ev) {
    const timeoutMs = Number(ev?.timeoutMs);
    const limit = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : VOICE_SYNTH_TIMEOUT_MS;
    const ms = Number(ev?.synthMs);
    if (!Number.isFinite(ms) || ms < 0) return { nearTimeout: false, ratio: -1 };
    const ratio = ms / limit;
    return { nearTimeout: ratio >= VOICE_SYNTH_NEAR_TIMEOUT_RATIO, ratio };
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
    const keyOf2 = (styleId) => String(Number(styleId));
    function ensureInternal(styleId, background) {
      const id = Number(styleId);
      if (!Number.isInteger(id) || id < 0) return Promise.resolve(false);
      const key = keyOf2(id);
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
        return warm.has(keyOf2(styleId));
      },
      /** 合成に成功した声は温まっている。 @param {unknown} styleId */
      markWarm(styleId) {
        const id = Number(styleId);
        if (Number.isInteger(id) && id >= 0) warm.add(keyOf2(id));
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
          if (ok && myEpoch === epoch) warm.add(keyOf2(id));
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
        const key = keyOf2(id);
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

  // src/lib/voiceEngineOverload.js
  var VOICE_OVERLOAD_TIMEOUT_STREAK = 2;
  var VOICE_OVERLOAD_RECOVER_STREAK = 5;
  var VOICE_OVERLOAD_FAST_MS = 3e3;
  var VOICE_OVERLOAD_QUERY_TIMEOUT_MS = 3e4;
  var VOICE_OVERLOAD_SYNTH_TIMEOUT_MS = 45e3;
  function createVoiceOverloadState() {
    return { overloaded: false, timeoutStreak: 0, fastStreak: 0 };
  }
  function noteVoiceSynthOutcome(state, outcome) {
    if (!state) return false;
    if (outcome?.timedOut === true) {
      state.timeoutStreak += 1;
      state.fastStreak = 0;
      if (state.timeoutStreak >= VOICE_OVERLOAD_TIMEOUT_STREAK) state.overloaded = true;
      return state.overloaded;
    }
    if (outcome?.ok !== true) return state.overloaded;
    state.timeoutStreak = 0;
    const ms = Number(outcome?.totalMs);
    if (Number.isFinite(ms) && ms >= 0 && ms < VOICE_OVERLOAD_FAST_MS) {
      state.fastStreak += 1;
      if (state.overloaded && state.fastStreak >= VOICE_OVERLOAD_RECOVER_STREAK) state.overloaded = false;
    } else {
      state.fastStreak = 0;
    }
    return state.overloaded;
  }
  function resolveVoiceOverloadTimeouts(overloaded) {
    if (!overloaded) return {};
    return {
      audioQueryTimeoutMs: VOICE_OVERLOAD_QUERY_TIMEOUT_MS,
      synthesisTimeoutMs: VOICE_OVERLOAD_SYNTH_TIMEOUT_MS
    };
  }
  function capVoiceSynthDepthForOverload(depth, overloaded) {
    const d = Number(depth);
    if (!Number.isFinite(d)) return overloaded ? 1 : 0;
    return overloaded ? Math.min(d, 1) : d;
  }

  // src/lib/voiceLagBudget.js
  var VOICE_LAG_BUDGET_MS = 6e3;
  var VOICE_QUEUE_MAX_CEIL = 8;
  var VOICE_QUEUE_MAX_FLOOR = 5;
  var VOICE_GROW_STREAK_N = 5;
  function updateVoiceServiceTimeEma(prevMs, sampleMs, alpha = 0.3) {
    const sample = Math.max(0, Number(sampleMs) || 0);
    const prev = Number(prevMs);
    if (!Number.isFinite(prev) || prev < 0) return sample;
    return prev + alpha * (sample - prev);
  }
  function resolveVoiceQueueMax(serviceTimeEmaMs) {
    const ema = Number(serviceTimeEmaMs);
    if (!Number.isFinite(ema) || ema <= 0) return VOICE_QUEUE_MAX_CEIL;
    const raw = Math.floor(VOICE_LAG_BUDGET_MS / ema);
    return Math.min(VOICE_QUEUE_MAX_CEIL, Math.max(VOICE_QUEUE_MAX_FLOOR, raw));
  }
  function stepVoiceQueueMax(currentMax, computedMax, growStreak) {
    const current = Math.min(VOICE_QUEUE_MAX_CEIL, Math.max(VOICE_QUEUE_MAX_FLOOR, Math.floor(Number(currentMax) || VOICE_QUEUE_MAX_CEIL)));
    const computed = Math.min(VOICE_QUEUE_MAX_CEIL, Math.max(VOICE_QUEUE_MAX_FLOOR, Math.floor(Number(computedMax) || VOICE_QUEUE_MAX_CEIL)));
    const streak = Math.max(0, Math.floor(Number(growStreak) || 0));
    if (computed < current) {
      return { nextMax: computed, nextGrowStreak: 0 };
    }
    if (computed === current) {
      return { nextMax: current, nextGrowStreak: 0 };
    }
    const nextStreak = streak + 1;
    if (nextStreak >= VOICE_GROW_STREAK_N) {
      return { nextMax: Math.min(VOICE_QUEUE_MAX_CEIL, current + 1), nextGrowStreak: 0 };
    }
    return { nextMax: current, nextGrowStreak: nextStreak };
  }
  var VOICE_PRESSURE_OK_MAX = 1.2;
  var VOICE_SYNTH_WAIT_DOMINANT_RATIO = 0.35;
  var VOICE_PLAYBACK_DOMINANT_RATIO = 0.6;
  var VOICE_STALL_EXCESS_RATIO = 0.2;
  function updateVoiceEventRatioEma(prevRatio, hit, alpha = 0.05) {
    const h = Number(hit);
    if (h !== 0 && h !== 1) {
      const prev2 = Number(prevRatio);
      return Number.isFinite(prev2) ? prev2 : -1;
    }
    const prev = Number(prevRatio);
    if (!Number.isFinite(prev) || prev < 0) return h;
    return prev + alpha * (h - prev);
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
    const elapsed2 = safeNow - prevStart;
    if (elapsed2 < windowMs) {
      return { windowStartMs: prevStart, windowCount: prevCount + addCount, arrivalPerMin: Number.isFinite(prevRate) && prevRate >= 0 ? prevRate : -1 };
    }
    const closedCount = prevCount + addCount;
    const safeElapsed = Math.max(1, elapsed2);
    const sampleRate = closedCount * 6e4 / safeElapsed;
    const nextRate = !Number.isFinite(prevRate) || prevRate < 0 ? sampleRate : prevRate + alpha * (sampleRate - prevRate);
    return { windowStartMs: safeNow, windowCount: 0, arrivalPerMin: nextRate };
  }
  function computeVoiceLagVerdict(inputs) {
    const i = inputs && typeof inputs === "object" ? inputs : {};
    const S = Number(i.serviceTimeEmaMs);
    const W = Number(i.synthWaitEmaMs);
    const E = Number(i.expectedPlayEmaMs);
    const P = Number(i.playbackEmaMs);
    const L = Number(i.arrivalPerMin);
    const cap = Number(i.effectiveQueueMax);
    const capLagTicks = Math.max(0, Math.floor(Number(i.capLagTicks) || 0));
    const sampleCount = Math.max(0, Math.floor(Number(i.sampleCount) || 0));
    if (!Number.isFinite(S) || S <= 0 || !Number.isFinite(L) || L <= 0 || sampleCount < 5) {
      return "insufficient";
    }
    const pressure = L * S / 6e4;
    if (pressure <= VOICE_PRESSURE_OK_MAX) {
      if (capLagTicks >= 10) return "hysteresis";
      return "ok";
    }
    const synthDominant = Number.isFinite(W) && W >= 0 && W / S >= VOICE_SYNTH_WAIT_DOMINANT_RATIO;
    if (synthDominant) {
      const capIsSmall = Number.isFinite(cap) && cap <= 3;
      return capIsSmall ? "coldsynth" : "synthslow";
    }
    if (Number.isFinite(P) && Number.isFinite(E) && (P - E) / S >= VOICE_STALL_EXCESS_RATIO) {
      return "stall";
    }
    if (Number.isFinite(E) && E >= 0 && E / S >= VOICE_PLAYBACK_DOMINANT_RATIO) {
      return "playback";
    }
    return "mixed";
  }
  var VOICE_SUSTAINED_PRESSURE_MIN = VOICE_PRESSURE_OK_MAX;
  var VOICE_SUSTAINED_BOOST_MAX = 0.8;
  function computeSustainedPressureBoost(inputs) {
    const i = inputs && typeof inputs === "object" ? inputs : {};
    const L = Number(i.arrivalPerMin);
    const S = Number(i.serviceTimeEmaMs);
    const sampleCount = Math.max(0, Math.floor(Number(i.sampleCount) || 0));
    if (!Number.isFinite(L) || L <= 0 || !Number.isFinite(S) || S <= 0 || sampleCount < 5) {
      return 0;
    }
    const pressure = L * S / 6e4;
    if (pressure <= VOICE_SUSTAINED_PRESSURE_MIN) return 0;
    const raw = (pressure - VOICE_SUSTAINED_PRESSURE_MIN) * 0.4;
    return Math.min(VOICE_SUSTAINED_BOOST_MAX, Math.max(0, raw));
  }
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
  var VOICE_ITEM_MIN_MS = 600;
  var VOICE_SYNTH_FIXED_MS = 250;
  var VOICE_CHAR_MS_DEFAULT = 130;
  function resolveVoiceQueueMaxByChars(charCounts, paceState, synthRtf = 0) {
    if (!Array.isArray(charCounts)) return null;
    const learned = Number(paceState?.charMsEma);
    const perChar = learned > 0 ? learned : VOICE_CHAR_MS_DEFAULT;
    const rtf = Number(synthRtf) > 0 ? Number(synthRtf) : 0;
    let total = 0;
    let fit = 0;
    for (let i = charCounts.length - 1; i >= 0; i -= 1) {
      const n = Math.max(0, Math.floor(Number(charCounts[i]) || 0));
      const natural = Math.max(VOICE_ITEM_MIN_MS, n * perChar);
      total += rtf > 0 ? Math.max(natural, VOICE_SYNTH_FIXED_MS + natural * rtf) : natural;
      if (total > VOICE_LAG_BUDGET_MS) break;
      fit += 1;
    }
    return Math.min(VOICE_QUEUE_MAX_CEIL, Math.max(VOICE_QUEUE_MAX_FLOOR, fit));
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

  // src/lib/voiceLightFallback.js
  var LIGHT_VOICE_PITCHES = Object.freeze([0.8, 0.95, 1.1, 1.25, 1.4]);
  var LIGHT_VOICE_RATE = 1.2;
  var LIGHT_VOICE_MAX_CHARS = 60;
  var LIGHT_VOICE_PROBE_INTERVAL_MS = 3e4;
  var LIGHT_VOICE_PROBE_TEXT = "てすと";
  function pickJapaneseVoices(voices) {
    if (!Array.isArray(voices)) return [];
    const ja4 = voices.filter((v) => v && /^ja([-_]|$)/i.test(String(v.lang || "")));
    const local = ja4.filter((v) => v.localService === true);
    const use = local.length ? local : ja4;
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
  function shouldUseLightVoice(s) {
    return !!s && s.setting !== "off" && s.available === true && s.overloaded === true;
  }
  function shouldProbeVoicevox(s) {
    if (!s || s.inFlight > 0) return false;
    return !(s.lastProbeAt > 0) || s.nowMs - s.lastProbeAt >= LIGHT_VOICE_PROBE_INTERVAL_MS;
  }

  // src/lib/voiceLightSpeaker.js
  var MAX_MS_PER_CHAR = 400;
  var WATCHDOG_EXTRA_MS = 5e3;
  function createLightSpeaker(deps = {}) {
    const synth = deps.synth ?? globalThis.speechSynthesis;
    const Utterance = deps.Utterance ?? globalThis.SpeechSynthesisUtterance;
    if (!synth || typeof synth.speak !== "function" || typeof Utterance !== "function") return null;
    let cached = [];
    const refresh = () => {
      try {
        cached = pickJapaneseVoices(synth.getVoices?.() || []);
      } catch {
        cached = [];
      }
    };
    refresh();
    try {
      synth.addEventListener?.("voiceschanged", refresh);
    } catch {
    }
    return {
      available: () => {
        if (!cached.length) refresh();
        return cached.length > 0;
      },
      voices: () => cached,
      cancel: () => {
        try {
          synth.cancel();
        } catch {
        }
      },
      speak(text, tone, hooks = {}) {
        return new Promise((resolve) => {
          if (!cached.length) refresh();
          const t = String(text || "");
          if (!t || !cached.length) {
            resolve(false);
            return;
          }
          let started = false;
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve(started);
          };
          const u = new Utterance(t);
          u.voice = cached[tone.voiceIndex % cached.length];
          u.lang = u.voice?.lang || "ja-JP";
          u.pitch = tone.pitch;
          u.rate = tone.rate;
          u.onstart = () => {
            started = true;
            try {
              hooks.onStart?.();
            } catch {
            }
          };
          u.onend = finish;
          u.onerror = finish;
          const timer = setTimeout(() => {
            try {
              synth.cancel();
            } catch {
            }
            finish();
          }, t.length * MAX_MS_PER_CHAR + WATCHDOG_EXTRA_MS);
          try {
            synth.speak(u);
          } catch {
            finish();
          }
        });
      }
    };
  }

  // src/lib/voiceNgMute.js
  function voiceNgKeySet(raw) {
    return new Set(normalizeComeviewNgList(raw).map((e) => e.key));
  }
  function isVoiceItemNgMuted(item, ngKeys) {
    if (!item || !(ngKeys instanceof Set) || ngKeys.size === 0) return false;
    const key = comeviewUserKeyForRow({
      userId: String(item.userId ?? ""),
      name: String(item.nickname ?? item.name ?? "")
    });
    return !!key && ngKeys.has(key);
  }

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
  var VoicePlayer = class {
    constructor(deps = {}) {
      this.storage = deps.storage;
      this.onToggle = deps.onToggle || (() => {
      });
      this.onStatus = deps.onStatus || (() => {
      });
      this.onLoadingState = deps.onLoadingState || (() => {
      });
      this.onSkip = deps.onSkip || (() => {
      });
      this.onLagNotice = deps.onLagNotice || (() => {
      });
      this.onGpuTip = deps.onGpuTip || (() => {
      });
      this._gpuTipText = "";
      this._lagNoticeShown = false;
      this.isObsMode = deps.isObsMode || (() => false);
      this.audioConstructor = deps.audioConstructor;
      this.unlockAudioConstructor = deps.unlockAudioConstructor || (typeof globalThis !== "undefined" && typeof globalThis.Audio === "function" ? globalThis.Audio : null);
      this.createObjectURL = deps.createObjectURL;
      this.revokeObjectURL = deps.revokeObjectURL;
      this.fetchVoicevoxAlive = deps.fetchVoicevoxAlive;
      this.probeVoicevoxAlive = deps.probeVoicevoxAlive || (async () => {
        const ok = await this.fetchVoicevoxAlive();
        return { ok: !!ok, reason: ok ? "" : "refused" };
      });
      this.fetchVoiceStyleIds = deps.fetchVoiceStyleIds;
      this.initVoiceSpeaker = deps.initVoiceSpeaker || null;
      this.voiceWarmup = deps.voiceWarmup || null;
      this.probeVoiceStreaming = deps.probeVoiceStreaming || null;
      this.probeVoiceGpu = deps.probeVoiceGpu || null;
      this._gpuCapable = null;
      this.createStreamedAudio = deps.createStreamedAudio || null;
      this._streamSupported = false;
      this._slowEngine = false;
      this._weakPcState = { saved: false };
      this._overload = createVoiceOverloadState();
      this._synthInFlight = 0;
      this.lightSpeaker = deps.lightSpeaker === void 0 ? createLightSpeaker() : deps.lightSpeaker;
      this.lightVoiceSetting = "auto";
      this._lightProbeAt = 0;
      this._lightFailStreak = 0;
      this.fetchSynthesizeVoice = deps.fetchSynthesizeVoice;
      this.resolveVoice = deps.resolveVoice;
      this.enabled = false;
      this.readNameEnabled = false;
      this.ngKeys = /* @__PURE__ */ new Set();
      this.toggleBusy = false;
      this.styleIds = [];
      this.assignments = {};
      this.queue = [];
      this.prefetches = /* @__PURE__ */ new Map();
      this.playing = false;
      this.generation = 0;
      this.stopCurrent = null;
      this.skipTimer = null;
      this.onDiag = deps.onDiag || (() => {
      });
      this._serviceTimeEmaMs = -1;
      this._paceState = createVoicePaceState();
      this._effectiveQueueMax = 8;
      this._growStreak = 0;
      this._synthWaitEmaMs = -1;
      this._playPrepEmaMs = -1;
      this._playbackEmaMs = -1;
      this._expectedPlayEmaMs = -1;
      this._arrivalWindowState = null;
      this._dropCountGateTotal = 0;
      this._dropHeadStaleTotal = 0;
      this._dropSweepStaleTotal = 0;
      this._voicedRecentRatioEma = -1;
      this._capLagTicks = 0;
      this._diagBornAt = Date.now();
      this._spokenSampleCount = 0;
      this.diag = {
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
        // v0.1.1088計器(voice-tempo-realtime-SYNTHESIS §3 Phase 1): 「到着→発声」の体感遅延。
        //   lastE2eMs=直近1件・e2eAvgMs=EMA(係数0.3・窓バッファ無し=メモリ有界)。
        //   mergeTotal=mergeRepeatedVoiceItem で吸収した累計(統合が効いているかの計器)。
        lastE2eMs: -1,
        e2eAvgMs: -1,
        mergeTotal: 0,
        // 2026-07-24 計器(段階1=apply・council-fable設計venue-bubble-voice-realtime-max-DESIGN.md):
        //   serviceTimeEmaMs=1件あたり処理時間の実測EMA、effectiveQueueMax=そこから算出した
        //   実効上限(pushVoiceQueueのmaxに実適用)、rateClampTotal=playbackRateが上限1.35で
        //   飽和した回数、voicedRatio=spokenTotal/(spokenTotal+staleDropTotal)(生存者バイアスの緑を潰す指標)。
        serviceTimeEmaMs: -1,
        effectiveQueueMax: 8,
        rateClampTotal: 0,
        voicedRatio: -1,
        // 2026-07-28計器(段階0=shadow・council-fable設計voice-lag-decomposition-DESIGN.md):
        //   serviceTimeの3分解(合成待ち/準備待ち/実再生/期待再生時間)+drop原因の分別+需要/供給+判定。
        synthWaitEmaMs: -1,
        playPrepEmaMs: -1,
        playbackEmaMs: -1,
        expectedPlayEmaMs: -1,
        arrivalPerMin: -1,
        voicedRecentRatio: -1,
        // v0.1.1222計器: 持続過負荷ブースト(pressure由来)。lastSustainedBoost=直近の上乗せ値、
        //   sustainedBoostTotal=キュー長では出せない速度を実際に足した累計。
        //   ★「速くしたのに読める数が増えたか」を後から検算するための計器(効果の裏取り用)。
        lastSustainedBoost: 0,
        sustainedBoostTotal: 0,
        lastBacklogBoost: 0,
        lastPaceFloor: 0,
        queueMaxByChars: 0,
        dropCountGateTotal: 0,
        dropHeadStaleTotal: 0,
        dropSweepStaleTotal: 0,
        // 2026-08-01計器(v0.1.1213): 合成が null で返った件を数える。
        //   実配信(lv351072048)で「需要52.2/分・読めた約6件・間引き12件」=**約34件がどの計器にも
        //   乗っていない**帳尻の穴が見つかった。真犯人は下の !wav 分岐が spokenTotal も drop も
        //   増やさずに continue していたこと(voicevoxClient は 8000ms タイムアウトで null を返す)。
        //   これが無いと「なぜ読まれないか」が原理的に分からない。
        synthNullTotal: 0,
        synthNullNearTimeout: 0,
        // v0.1.1224計器: 合成失敗の【理由別】内訳。従来は6通りの失敗が全部 null に畳まれ、
        //   実配信の「合成失敗17件(その他16)」の正体を誰も答えられなかった。
        //   原因ごとに打つ手が正反対(接続不能=拡張では直せない / HTTP拒否=絞れば直る)。
        synthFailReasons: {},
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
        diagBornAt: this._diagBornAt
      };
      this._synthTracker = createVoiceSynthTracker();
      this.volumePercent = VOICE_VOLUME_DEFAULT;
      this.storageOnChanged = deps.storageOnChanged || null;
    }
    _emitDiag() {
      this.diag.enabled = this.enabled;
      this.diag.queueNow = this.queue.length;
      if (this.queue.length > this.diag.queueMax) this.diag.queueMax = this.queue.length;
      try {
        this.onDiag(this.diag);
      } catch {
      }
    }
    // ★v0.1.1506: キー文字列の正本は voiceKeys.js。getter の【形は残し】戻り値だけ委譲する
    //   (comeview-entry.js と二重定義になっていた。片方だけ直す事故を構造的に無くす)。
    get VOICE_READING_ENABLED_KEY() {
      return KEY_VOICE_READING_ENABLED;
    }
    get VOICE_ASSIGNMENTS_KEY() {
      return KEY_VOICE_ASSIGNMENTS;
    }
    get VOICE_READ_NAME_KEY() {
      return KEY_VOICE_READ_NAME_ENABLED;
    }
    /**
     * @param {{ forceOn?: boolean }} [opts]
     *   forceOn=true なら保存状態に関わらず読み上げを自動 ON にする(会場モードを開いたら
     *   「いきなり読み上げ上がる」ユーザー期待のため。comeview の ?voice=1 相当)。
     *   このとき persist:true で storage にも ON を残し、以後も復元される。
     */
    async initialize(opts = {}) {
      if (this.isObsMode()) return;
      let bag = {};
      try {
        if (this.storage) {
          bag = await this.storage.get([
            this.VOICE_READING_ENABLED_KEY,
            this.VOICE_ASSIGNMENTS_KEY,
            this.VOICE_READ_NAME_KEY,
            KEY_VOICE_VOLUME_PERCENT,
            COMEVIEW_NG_STORAGE_KEY
          ]);
        }
      } catch {
        bag = {};
      }
      const rawAssignments = bag[this.VOICE_ASSIGNMENTS_KEY];
      this.assignments = !rawAssignments || typeof rawAssignments !== "object" || Array.isArray(rawAssignments) ? {} : rawAssignments;
      this.readNameEnabled = bag[this.VOICE_READ_NAME_KEY] === true;
      this.volumePercent = normalizeVoiceVolumePercent(bag[KEY_VOICE_VOLUME_PERCENT]);
      this.ngKeys = voiceNgKeySet(bag[COMEVIEW_NG_STORAGE_KEY]);
      this._watchVolumeSetting();
      this._emitToggle();
      const forceOn = opts.forceOn === true;
      if (forceOn || bag[this.VOICE_READING_ENABLED_KEY] === true) {
        await this.enable({ persist: forceOn });
      }
    }
    /** ポップアップで音量が変わったら、次に鳴らす声から反映する(1回だけ購読)。コメビュの NG の変更も同じ口で拾う。 */
    _watchVolumeSetting() {
      const ev = this.storageOnChanged;
      if (this._volumeWatched || !ev || typeof ev.addListener !== "function") return;
      this._volumeWatched = true;
      try {
        ev.addListener((changes, areaName) => {
          if (areaName && areaName !== "local") return;
          const c = changes && changes[KEY_VOICE_VOLUME_PERCENT];
          if (c) this.volumePercent = normalizeVoiceVolumePercent(c.newValue);
          const ng = changes && changes[COMEVIEW_NG_STORAGE_KEY];
          if (ng) this.ngKeys = voiceNgKeySet(ng.newValue);
        });
      } catch {
      }
    }
    _emitToggle() {
      this.onToggle(this.enabled, this.readNameEnabled, this.toggleBusy);
    }
    _showSkipped(count) {
      if (count <= 0) return;
      this.onSkip(count);
    }
    /**
     * v0.1.799: item が【鳴らずに捨てられた】(stale/件数drop/合成失敗/flush/stop/merge)ときだけ
     *   呼ぶ drop 専用シグナル。再生パスでは絶対に呼ばない(=onAudioStart と排他)。吹き出し側は
     *   これを resolved として受け、pending→unvoiced に落として流速寿命で消す(床いっぱい残さない)。
     *   onPlayStart(再生・破棄の両方で発火する曖昧な「消費」信号)は後方互換でそのまま残す。
     * @param {{ onDropped?: Function }} item
     */
    _notifyDropped(item) {
      if (item && typeof item.onDropped === "function") {
        try {
          item.onDropped();
        } catch {
        }
      }
    }
    stop() {
      const dropped = this.queue;
      this.queue = [];
      this.generation += 1;
      this.prefetches.clear();
      for (const item of dropped) this._notifyDropped(item);
      if (typeof this.stopCurrent === "function") this.stopCurrent();
      this.stopCurrent = null;
      this._updateLagNotice();
    }
    /**
     * v0.1.773 長時間ラグ対策: 待機中のキューだけを破棄して「今」へリセットする。
     *   再生中の1本は止めない(stop と違い不協和を出さない)。タブが裏に回って drain が
     *   スロットリングされ溜まった backlog を、可視復帰時に一掃して定常ラグの蓄積を断つ。
     *   破棄した item には onPlayStart(=消費=resolved)を通知し、吹き出し側の状態整合を保つ。
     * @returns {number} 破棄した件数
     */
    flushPendingQueue() {
      const dropped = this.queue;
      this.queue = [];
      this.prefetches.clear();
      for (const item of dropped) {
        if (item && typeof item.onPlayStart === "function") item.onPlayStart();
        this._notifyDropped(item);
      }
      if (dropped.length > 0) this._showSkipped(dropped.length);
      return dropped.length;
    }
    disable({ persist = true } = {}) {
      this.enabled = false;
      this.toggleBusy = false;
      this.stop();
      this.onLoadingState("idle");
      this._emitToggle();
      if (persist && this.storage) {
        this.storage.set({ [this.VOICE_READING_ENABLED_KEY]: false }).catch(() => {
        });
      }
    }
    /**
     * ★v0.1.1327: クリックの「ユーザー操作」を【その場で】使って音声を解錠する。
     *
     * ■ なぜ要るか(ユーザー実機「一瞬ONになって戻ってしまう」)
     *   Chrome は自動再生をブロックし、`audio.play()` は【ユーザー操作の延長】でしか
     *   通らない。ところが enable() は
     *     クリック → (生存確認 最大3回+バックオフ) → スタイル取得 → …数百ms〜数秒…
     *     → 最初のコメント到着 → 合成 → ようやく audio.play()
     *   という流れで、実際に鳴らす時点では**クリックから遠く離れている**。
     *   すると NotAllowedError になり、再生パス(:612-617)が disable() を呼ぶため
     *   「ONになった直後にOFFへ戻る」ように見えていた。
     *   ★comeview(拡張ページ)は制約が緩く、会場(content script)だけで出る非対称の正体。
     *
     * ■ 何をするか
     *   クリック直後の同期タイミングで、無音の短い音を1回 play() しておく。
     *   これが通れば以後の play() は解錠済みとして扱われる(標準的な audio unlock 手法)。
     *   失敗しても握りつぶす=従来どおり進む(悪化させない)。
     *
     * @returns {Promise<boolean>} 解錠できたか(できなくても enable は続行する)
     */
    async primeAudioUnlock() {
      const Ctor = this.unlockAudioConstructor;
      if (typeof Ctor !== "function") return false;
      try {
        const a = new Ctor();
        a.src = SILENT_WAV_DATA_URI;
        a.volume = 0;
        const p = a.play();
        if (p && typeof p.then === "function") await p;
        try {
          a.pause();
        } catch {
        }
        this._audioUnlocked = true;
        return true;
      } catch {
        return false;
      }
    }
    async enable({ persist = true } = {}) {
      if (this.isObsMode() || this.toggleBusy) return;
      this.toggleBusy = true;
      this._emitToggle();
      await this.primeAudioUnlock();
      this.onLoadingState("checking");
      let probe = await this.probeVoicevoxAlive();
      if (!probe.ok) {
        this.onLoadingState("connecting");
        for (const waitMs of VOICE_ALIVE_RETRY_BACKOFF_MS) {
          if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
          probe = await this.probeVoicevoxAlive();
          if (probe.ok) break;
        }
      }
      if (!probe.ok) {
        this.diag.lastEnableFailReason = String(probe.reason || "unknown");
        this.diag.enableFailTotal = (Number(this.diag.enableFailTotal) || 0) + 1;
        this._emitDiag();
        this.disable({ persist: false });
        this.onLoadingState("notfound", probe.reason);
        this.toggleBusy = false;
        this._emitToggle();
        return;
      }
      const allStyleIds = await this.fetchVoiceStyleIds();
      startVoiceWarmup(this.voiceWarmup, allStyleIds);
      this._synthTracker.reset();
      resetVoiceWarmMeasure(this.diag);
      this._streamSupported = false;
      if (this.probeVoiceStreaming && this.createStreamedAudio) {
        void Promise.resolve().then(() => this.probeVoiceStreaming()).then((ok) => {
          this._streamSupported = ok === true;
        }, () => {
        });
      }
      this._gpuCapable = null;
      if (this.probeVoiceGpu) {
        void Promise.resolve().then(() => this.probeVoiceGpu()).then((ok) => {
          this._gpuCapable = typeof ok === "boolean" ? ok : null;
        }, () => {
        });
      }
      const prepared = await prepareVoiceStyleIds(allStyleIds, {
        readSettings: async () => {
          const b = this.storage ? await this.storage.get([KEY_VOICE_NARROW_MODE, KEY_VOICE_WEAK_PC]) : {};
          this._slowEngine = b[KEY_VOICE_WEAK_PC] === true;
          return { mode: b[KEY_VOICE_NARROW_MODE], weak: b[KEY_VOICE_WEAK_PC] };
        },
        initSpeaker: this.initVoiceSpeaker
      });
      this.styleIds = prepared.styleIds;
      this.diag.voiceNarrowed = prepared.narrowed;
      this.generation += 1;
      this.enabled = true;
      this.diag.lastEnableFailReason = "";
      this._emitDiag();
      this.toggleBusy = false;
      this.onLoadingState("ready");
      this._emitToggle();
      if (persist && this.storage) {
        this.storage.set({ [this.VOICE_READING_ENABLED_KEY]: true }).catch(() => {
        });
      }
    }
    _voiceUserKeyForItem(item) {
      const userId = String(item?.userId || "").trim();
      const name = String(item?.nickname || "").trim();
      const key = String(item?.userKey || item?.key || "").trim();
      return userId || key || name || "anon";
    }
    /**
     * v0.1.1800: 待っている件+新しい件の文字数から件数の上限を見積もる(voiceLagBudget.resolveVoiceQueueMaxByChars)。
     * @param {object} candidate
     * @returns {number}
     */
    _resolveQueueMaxByChars(candidate) {
      try {
        const maxChars = computeVoiceCongestion(this.queue.length + 1).maxChars;
        const counts = [...this.queue, candidate].map((it) => buildMergedVoiceText(it, { maxChars }).length);
        const rtfSamples = Number(this.diag.warmRtfSamples) || 0;
        const rtfPermille = Number(this.diag.warmSynthRtfPermille);
        const synthRtf = rtfSamples >= 3 && rtfPermille > 0 ? rtfPermille / 1e3 : 0;
        const byChars = resolveVoiceQueueMaxByChars(counts, this._paceState, synthRtf);
        if (byChars == null) return this._effectiveQueueMax;
        this.diag.queueMaxByChars = byChars;
        return byChars;
      } catch {
        return this._effectiveQueueMax;
      }
    }
    /** item 1件ぶんの合成を起動し、in-flight WAV Promise を返す(まだ無ければ）。 */
    _ensurePrefetch(item, generation) {
      if (!item || generation !== this.generation) return null;
      const existing = this.prefetches.get(item);
      if (existing && existing.generation === generation) return existing.promise;
      const congestion = computeVoiceCongestion(this.queue.length);
      const effBoost = this._resolveEffectiveSpeedBoost(congestion.speedBoost);
      const assigned = this.resolveVoice(item.userKey, this.assignments, this.styleIds);
      const text = buildMergedVoiceText(item, { maxChars: capVoiceMaxCharsByBoost(effBoost, congestion.maxChars) });
      if (!this._slowEngine && isWeakVoicePc(this.diag)) this._slowEngine = true;
      const stream = shouldStreamVoice({
        supported: this._streamSupported,
        idle: this.queue[0] === item && !this.stopCurrent,
        slowEngine: this._slowEngine,
        textLength: text.length
      });
      const promise = this._synthesizeTracked(
        text,
        {
          ...assigned,
          speedOffset: assigned.speedOffset + effBoost
        },
        { stream }
      ).catch(() => null);
      this.prefetches.set(item, { generation, promise, boostAtSynth: effBoost, textLength: text.length });
      return promise;
    }
    /**
     * v0.1.1224: 合成失敗の理由を1件記録する。voicevoxClient の onFailure から呼ばれる。
     * @param {{ stage?: string, error?: unknown, httpStatus?: number, bodyInvalid?: boolean }} info
     */
    /**
     * 合成を依頼し、段階計測(エンジン待ち・audio_query/synthesis・初めての声)を diag へ記録する。
     * 戻り値・例外は fetchSynthesizeVoice と同じ(計器は読み上げの挙動を変えない)。
     * @param {string} text
     * @param {{ styleId?: number, pitchOffset?: number, speedOffset?: number }} voice
     * @param {{ stream?: boolean }} [extra]
     */
    _synthesizeTracked(text, voice, extra = {}) {
      const track = this._synthTracker.begin(voice?.styleId);
      let timing = {};
      let timedOut = false;
      const startedAt = Date.now();
      const overloadTimeouts = resolveVoiceOverloadTimeouts(this._overload.overloaded);
      this._synthInFlight += 1;
      let settled = false;
      const settle = () => {
        if (!settled) {
          settled = true;
          this._synthInFlight = Math.max(0, this._synthInFlight - 1);
        }
      };
      let started;
      try {
        started = this.fetchSynthesizeVoice(text, voice, {
          ...overloadTimeouts,
          onFailure: (info) => {
            const reason = this._recordSynthFailureReason(info);
            if (reason === "timeout" || reason === "query_timeout") timedOut = true;
          },
          onTiming: (t) => {
            timing = t || {};
          },
          ...extra.stream === true ? { stream: true } : {}
        });
      } catch (err) {
        started = Promise.reject(err);
      }
      return Promise.resolve(started).then(
        (wav) => {
          settle();
          let r = null;
          try {
            r = track.end({ ...timing, audioMs: measureWavAudioMs(wav) }, !!wav);
            recordVoiceSynthStage(this.diag, r);
          } catch {
          }
          this._noteOverload({ timedOut, ok: !!wav, totalMs: Date.now() - startedAt });
          const judge = () => {
            if (this.storage) rememberWeakVoicePc(this.diag, this._weakPcState, () => this.storage.set({ [KEY_VOICE_WEAK_PC]: true }));
            if (this.storage) {
              forgetWeakVoicePcIfFast(this.diag, this._weakPcState, () => {
                this._slowEngine = false;
                return this.storage.set({ [KEY_VOICE_WEAK_PC]: false });
              });
            }
          };
          judge();
          if (r && isStreamedVoice(wav)) void recordVoiceStreamDone(this.diag, r, wav, () => Date.now(), judge);
          return wav;
        },
        (err) => {
          settle();
          try {
            track.end(timing, false);
          } catch {
          }
          this._noteOverload({ timedOut, ok: false });
          throw err;
        }
      );
    }
    _recordSynthFailureReason(info) {
      try {
        const reason = classifyVoiceSynthFailureReason(info);
        const bag = this.diag.synthFailReasons || (this.diag.synthFailReasons = {});
        bag[reason] = (Number(bag[reason]) || 0) + 1;
        return reason;
      } catch {
      }
      return "";
    }
    /**
     * 2026-10-31: 合成1件の結果から「エンジン混雑中」を更新し、計器に出す(状態速報で見える)。
     * @param {{ timedOut?: boolean, ok?: boolean, totalMs?: number }} outcome
     */
    _noteOverload(outcome) {
      try {
        const was = this._overload.overloaded;
        const now = noteVoiceSynthOutcome(this._overload, outcome);
        this.diag.voiceOverloaded = now;
        if (now && !was) this.diag.voiceOverloadTotal = (Number(this.diag.voiceOverloadTotal) || 0) + 1;
      } catch {
      }
    }
    /**
     * v0.1.1222: 実際に適用する speedBoost を決める(既存の混雑ブースト ∪ 持続過負荷ブースト)。
     *
     * 【なぜ要るか】混雑ブーストは【絶対キュー長】依存(5件で0.5・8件で0.8)だが、実効上限が
     *   処理時間EMAから3まで絞られると**キューは構造的に5件へ到達できない**=上位2段が
     *   永久に発火しない。結果「速く読んで消化する」より「入口で捨てる」に倒れていた
     *   (2026-08-01 実測: 需要102.3/分 vs 供給39.6/分・間引き88件・判定=playback・実効上限3)。
     *   pressure はキュー長に依らず過負荷を検出できるので、この穴だけを埋める。
     *
     * ★上げるだけ(mergeVoiceSpeedBoost が max を取る)なので、既存の速さを下回らせない。
     * @param {number} congestionBoost 既存の混雑由来ブースト
     * @returns {number}
     */
    _resolveEffectiveSpeedBoost(congestionBoost) {
      const sustained = computeSustainedPressureBoost({
        arrivalPerMin: this.diag?.arrivalPerMin,
        serviceTimeEmaMs: this._serviceTimeEmaMs,
        sampleCount: this._spokenSampleCount
      });
      const paceFloor = computeVoicePaceFloor(this._paceState);
      const backlog = computeBacklogCatchUpBoost(this.diag?.queueWaitEmaMs, paceFloor);
      this.diag.lastPaceFloor = paceFloor;
      this.diag.lastBacklogBoost = backlog;
      const merged = mergeVoiceSpeedBoost(congestionBoost, Math.max(sustained, backlog));
      if (sustained > 0 && merged > congestionBoost) {
        this.diag.sustainedBoostTotal = (Number(this.diag.sustainedBoostTotal) || 0) + 1;
      }
      this.diag.lastSustainedBoost = sustained;
      return merged;
    }
    /**
     * v0.1.768: 先頭から深さ分(最大3)の item を先行合成する。
     *   再生中に N+1 だけでなく N+2/N+3 も貯めることで、フラッド時に合成を遊ばせない。
     *   深さは詰まり具合(resolveVoiceSynthDepth)で動的=落ち着いていれば1=無駄打ちしない。
     *   先読みした item が後で stale 破棄されても、再生直前に必ず age-gate を通すので無駄打ちは回収。
     */
    _startPrefetch(generation) {
      if (generation !== this.generation) {
        this.prefetches.clear();
        return;
      }
      if (this._useLightVoice()) {
        this._maybeProbeVoicevox();
        return;
      }
      const depth = capVoiceSynthDepthForOverload(resolveVoiceSynthDepth(this.queue.length, {
        pending: this.queue.length
      }), this._overload.overloaded);
      this.diag.lastDepth = depth;
      const wanted = /* @__PURE__ */ new Set();
      for (let i = 0; i < depth && i < this.queue.length; i++) {
        const item = this.queue[i];
        if (!item) continue;
        if (this._overload.overloaded && this._synthInFlight > 0 && !this.prefetches.has(item)) continue;
        wanted.add(item);
        this._ensurePrefetch(item, generation);
      }
      for (const key of this.prefetches.keys()) {
        if (!wanted.has(key)) this.prefetches.delete(key);
      }
    }
    /**
     * 2026-11-03: VOICEVOX が混雑中(時間切れが続いた)なら、合成を頼み済みの件を守る判定を返す。
     *   混雑していなければ null(=従来どおり件数・鮮度で捨てる)。
     * @returns {((x: any) => boolean) | null}
     */
    _inflightKeeper() {
      if (!this._overload.overloaded) return null;
      return (x) => this.prefetches.has(x);
    }
    /** 2026-11-03: 今、軽い声で読むか(VOICEVOX が混雑中で、軽い声が使えるときだけ)。 */
    _useLightVoice() {
      let available = false;
      try {
        available = !!this.lightSpeaker && this._lightFailStreak < 3 && this.lightSpeaker.available();
      } catch {
        available = false;
      }
      const on = shouldUseLightVoice({ overloaded: this._overload.overloaded, available, setting: this.lightVoiceSetting });
      this.diag.lightVoiceActive = on;
      return on;
    }
    /** 軽い声で読んでいる間、ときどき VOICEVOX に短い文を頼んで速さを確かめる(速ければ混雑が解けて戻る)。 */
    _maybeProbeVoicevox() {
      const nowMs = Date.now();
      if (!shouldProbeVoicevox({ nowMs, lastProbeAt: this._lightProbeAt, inFlight: this._synthInFlight })) return;
      this._lightProbeAt = nowMs;
      try {
        const voice = this.resolveVoice("", this.assignments, this.styleIds);
        void Promise.resolve(this._synthesizeTracked(LIGHT_VOICE_PROBE_TEXT, voice)).catch(() => null);
      } catch {
      }
    }
    /**
     * 2026-11-03: 1件を軽い声で読む。人ごとの声(どの声・高さ・速さ)は voiceLightFallback.lightVoiceToneFor。
     * @param {any} item
     * @param {number} generation
     */
    async _playLight(item, generation) {
      this._maybeProbeVoicevox();
      const text = buildMergedVoiceText(item, { maxChars: LIGHT_VOICE_MAX_CHARS });
      const speaker = this.lightSpeaker;
      let started = false;
      if (text && speaker) {
        const tone = lightVoiceToneFor(String(item.userKey || ""), speaker.voices().length);
        this.stopCurrent = () => speaker.cancel();
        try {
          started = await speaker.speak(text, tone, {
            onStart: () => {
              if (typeof item.onAudioStart === "function") item.onAudioStart();
            }
          });
        } catch {
          started = false;
        }
        this.stopCurrent = null;
      }
      if (started && typeof item.onAudioEnd === "function") item.onAudioEnd();
      if (typeof item.onPlayStart === "function") item.onPlayStart();
      if (text && speaker) this._lightFailStreak = started ? 0 : this._lightFailStreak + 1;
      if (!started || generation !== this.generation) {
        this._notifyDropped(item);
        return;
      }
      this.diag.spokenTotal += 1;
      this.diag.lightSpokenTotal = (Number(this.diag.lightSpokenTotal) || 0) + 1;
      this.diag.lastSpokenBase = Date.now();
      const denom = this.diag.spokenTotal + this.diag.staleDropTotal;
      this.diag.voicedRatio = denom > 0 ? this.diag.spokenTotal / denom : -1;
      this._voicedRecentRatioEma = updateVoiceEventRatioEma(this._voicedRecentRatioEma, 1);
      this.diag.voicedRecentRatio = this._voicedRecentRatioEma;
      this._emitDiag();
      this._updateLagNotice();
    }
    async _drainQueue() {
      if (this.playing || !this.enabled || this.isObsMode()) return;
      this.playing = true;
      try {
        while (this.enabled && this.queue.length) {
          const now = Date.now();
          let allStale = true;
          for (const qItem of this.queue) {
            if (!isVoiceItemStale(qItem.enqueuedAt, now, this.queue.length, qItem.priority === "high").stale) {
              allStale = false;
              break;
            }
          }
          if (allStale && this.queue.length > 0) {
            const newest = this.queue[this.queue.length - 1];
            const keepInflight2 = this._inflightKeeper();
            const survivors = this.queue.filter((q) => q === newest || (keepInflight2 ? keepInflight2(q) : false));
            const dropped = this.queue.filter((q) => !survivors.includes(q));
            for (const d of dropped) {
              if (typeof d.onPlayStart === "function") d.onPlayStart();
              this._notifyDropped(d);
            }
            this.queue = survivors;
            if (dropped.length > 0) {
              this._showSkipped(dropped.length);
              this.diag.staleDropTotal += dropped.length;
              this._dropSweepStaleTotal += dropped.length;
              this.diag.dropSweepStaleTotal = this._dropSweepStaleTotal;
              for (let _i = 0; _i < dropped.length; _i += 1) {
                this._voicedRecentRatioEma = updateVoiceEventRatioEma(this._voicedRecentRatioEma, 0);
              }
              this.diag.voicedRecentRatio = this._voicedRecentRatioEma;
              this._emitDiag();
            }
          }
          const queueLength = this.queue.length;
          const generation = this.generation;
          this._startPrefetch(generation);
          const item = this.queue.shift();
          if (!item) continue;
          const _serviceStart = Date.now();
          foldVoiceStageEma(this.diag, "queueWaitEmaMs", measureVoiceGapMs(item.enqueuedAt, _serviceStart));
          const ageCheck = isVoiceItemStale(item.enqueuedAt, Date.now(), queueLength, item.priority === "high");
          const keepInflight = this._inflightKeeper();
          const keepAnyway = !!keepInflight && (keepInflight(item) || this.queue.length === 0);
          if (ageCheck.stale && !keepAnyway) {
            if (typeof item.onPlayStart === "function") item.onPlayStart();
            this._notifyDropped(item);
            this._showSkipped(1);
            this.diag.staleDropTotal += 1;
            this._dropHeadStaleTotal += 1;
            this.diag.dropHeadStaleTotal = this._dropHeadStaleTotal;
            this._voicedRecentRatioEma = updateVoiceEventRatioEma(this._voicedRecentRatioEma, 0);
            this.diag.voicedRecentRatio = this._voicedRecentRatioEma;
            this._emitDiag();
            this.prefetches.delete(item);
            continue;
          }
          if (this._useLightVoice() && !this.prefetches.has(item)) {
            await this._playLight(item, generation);
            continue;
          }
          const congestion = computeVoiceCongestion(queueLength);
          const effBoostNow = this._resolveEffectiveSpeedBoost(congestion.speedBoost);
          const assigned = this.resolveVoice(item.userKey, this.assignments, this.styleIds);
          const pf = this.prefetches.get(item);
          this.prefetches.delete(item);
          const boostAtSynth = pf ? pf.boostAtSynth : effBoostNow;
          const inlineText = pf ? "" : buildMergedVoiceText(item, { maxChars: capVoiceMaxCharsByBoost(effBoostNow, congestion.maxChars) });
          const spokenChars = pf ? Number(pf.textLength) || 0 : inlineText.length;
          const _synthStart = Date.now();
          const wav = pf ? await pf.promise : await this._synthesizeTracked(
            inlineText,
            {
              ...assigned,
              speedOffset: assigned.speedOffset + effBoostNow
            }
          );
          this.diag.lastSynthMs = Math.max(0, Date.now() - _synthStart);
          this.diag.lastSpeedBoost = effBoostNow;
          this._synthWaitEmaMs = updateVoiceServiceTimeEma(this._synthWaitEmaMs, this.diag.lastSynthMs);
          this.diag.synthWaitEmaMs = this._synthWaitEmaMs;
          if (!wav || !this.enabled || generation !== this.generation || this.isObsMode()) {
            if (isStreamedVoice(wav)) wav.cancel();
            if (!wav) {
              this.diag.synthNullTotal += 1;
              const failure = classifyVoiceSynthNull({ synthMs: this.diag.lastSynthMs });
              if (failure.nearTimeout) this.diag.synthNullNearTimeout += 1;
            }
            if (typeof item.onPlayStart === "function") item.onPlayStart();
            this._notifyDropped(item);
            continue;
          }
          this._startPrefetch(generation);
          let objectUrl = "";
          try {
            const streamedAudio = isStreamedVoice(wav) && this.createStreamedAudio ? this.createStreamedAudio(wav, this.volumePercent) : null;
            let audio = streamedAudio;
            let wholeLevel = null;
            if (!audio) {
              const whole = isStreamedVoice(wav) ? (await wav.whenDone, wav.toWav()) : wav;
              const loud = applyVoiceVolumeToWav(whole, this.volumePercent);
              wholeLevel = measureVoiceWavLevel(loud);
              const blob = new Blob([loud], { type: "audio/wav" });
              objectUrl = this.createObjectURL(blob);
              const AudioCtor = this.audioConstructor;
              audio = new AudioCtor(objectUrl);
            }
            const boostNow = this._resolveEffectiveSpeedBoost(
              computeVoiceCongestion(this.queue.length).speedBoost
            );
            const playbackRate = streamedAudio ? 1 : computeVoicePlaybackRate(boostAtSynth, boostNow);
            if (playbackRate !== 1) {
              audio.preservesPitch = true;
              audio.playbackRate = playbackRate;
            }
            observeVoicePlayback(audio, {
              diag: this.diag,
              playbackRate,
              outPeak: wholeLevel ? wholeLevel.peak : -1,
              outRms: wholeLevel ? wholeLevel.rms : -1,
              targetPeak: voiceTargetPeak(this.volumePercent),
              onRecorded: () => this._emitDiag()
            });
            if (playbackRate >= VOICE_PLAYBACK_RATE_MAX) this.diag.rateClampTotal += 1;
            const _prepStart = Date.now();
            let _playbackStartAt = -1;
            try {
              audio.addEventListener("playing", () => {
                try {
                  const prepMs = Math.max(0, Date.now() - _prepStart);
                  this._playPrepEmaMs = updateVoiceServiceTimeEma(this._playPrepEmaMs, prepMs);
                  this.diag.playPrepEmaMs = this._playPrepEmaMs;
                  _playbackStartAt = Date.now();
                  const durationSec = Number(audio.duration);
                  if (Number.isFinite(durationSec) && durationSec > 0) {
                    const expectedMs = durationSec * 1e3 / (Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1);
                    this._expectedPlayEmaMs = updateVoiceServiceTimeEma(this._expectedPlayEmaMs, expectedMs);
                    this.diag.expectedPlayEmaMs = this._expectedPlayEmaMs;
                  }
                } catch {
                }
              }, { once: true });
            } catch {
            }
            await new Promise((resolve) => {
              let settled = false;
              const _watchdog = setTimeout(() => {
                this.diag.playbackTimeoutTotal += 1;
                finish();
              }, 2e4);
              const finish = () => {
                if (settled) return;
                settled = true;
                clearTimeout(_watchdog);
                audio.removeEventListener("ended", finish);
                audio.removeEventListener("error", finish);
                if (objectUrl) this.revokeObjectURL(objectUrl);
                objectUrl = "";
                this.stopCurrent = null;
                if (_playbackStartAt > 0) {
                  try {
                    const playbackMs = Math.max(0, Date.now() - _playbackStartAt);
                    this._playbackEmaMs = updateVoiceServiceTimeEma(this._playbackEmaMs, playbackMs);
                    this.diag.playbackEmaMs = this._playbackEmaMs;
                    noteVoicePacePlayed(this._paceState, playbackMs, playbackRate, boostAtSynth, spokenChars);
                  } catch {
                  }
                }
                if (typeof item.onAudioEnd === "function") item.onAudioEnd();
                resolve();
              };
              this.stopCurrent = () => {
                try {
                  audio.pause();
                } catch {
                }
                finish();
              };
              audio.addEventListener("ended", finish, { once: true });
              audio.addEventListener("error", finish, { once: true });
              try {
                const playResult = audio.play();
                if (typeof item.onPlayStart === "function") item.onPlayStart();
                const _enqueuedAt = Number(item.enqueuedAt);
                if (Number.isFinite(_enqueuedAt) && _enqueuedAt > 0) {
                  const e2e = Math.max(0, Date.now() - _enqueuedAt);
                  this.diag.lastE2eMs = e2e;
                  this.diag.e2eAvgMs = computeVoiceE2eAverage(this.diag.e2eAvgMs, e2e);
                  recordVoiceE2eSample(this.diag, e2e);
                }
                this._updateLagNotice();
                if (typeof item.onAudioStart === "function") item.onAudioStart();
                if (playResult && typeof playResult.catch === "function") {
                  playResult.catch((err) => {
                    if (err && err.name === "NotAllowedError") {
                      this.diag.audioBlockedTotal = (Number(this.diag.audioBlockedTotal) || 0) + 1;
                      this.onStatus("⚠️ブラウザが音声をブロックしています。ページのどこかを一度クリックすると鳴ります");
                    }
                    finish();
                  });
                }
              } catch {
                finish();
              }
            });
          } catch {
            if (typeof item.onPlayStart === "function") item.onPlayStart();
            this._notifyDropped(item);
            if (objectUrl) this.revokeObjectURL(objectUrl);
          }
          this.diag.spokenTotal += 1;
          this.diag.lastSpokenBase = Date.now();
          this._spokenSampleCount += 1;
          this._serviceTimeEmaMs = updateVoiceServiceTimeEma(this._serviceTimeEmaMs, Date.now() - _serviceStart);
          const _computedMax = resolveVoiceQueueMax(this._serviceTimeEmaMs);
          const _step = stepVoiceQueueMax(this._effectiveQueueMax, _computedMax, this._growStreak);
          this._effectiveQueueMax = _step.nextMax;
          this._growStreak = _step.nextGrowStreak;
          this.diag.serviceTimeEmaMs = this._serviceTimeEmaMs;
          this.diag.effectiveQueueMax = this._effectiveQueueMax;
          const _voicedDenom = this.diag.spokenTotal + this.diag.staleDropTotal;
          this.diag.voicedRatio = _voicedDenom > 0 ? this.diag.spokenTotal / _voicedDenom : -1;
          this._voicedRecentRatioEma = updateVoiceEventRatioEma(this._voicedRecentRatioEma, 1);
          this.diag.voicedRecentRatio = this._voicedRecentRatioEma;
          {
            const _pressure = this.diag.arrivalPerMin > 0 && this._serviceTimeEmaMs > 0 ? this.diag.arrivalPerMin * this._serviceTimeEmaMs / 6e4 : -1;
            this._capLagTicks = _pressure >= 0 && _pressure <= 1.2 && _computedMax - this._effectiveQueueMax >= 2 ? this._capLagTicks + 1 : 0;
            this.diag.lagVerdict = computeVoiceLagVerdict({
              serviceTimeEmaMs: this._serviceTimeEmaMs,
              synthWaitEmaMs: this._synthWaitEmaMs,
              expectedPlayEmaMs: this._expectedPlayEmaMs,
              playbackEmaMs: this._playbackEmaMs,
              arrivalPerMin: this.diag.arrivalPerMin,
              effectiveQueueMax: this._effectiveQueueMax,
              computedMax: _computedMax,
              capLagTicks: this._capLagTicks,
              sampleCount: this._spokenSampleCount
            });
          }
          this._emitDiag();
        }
      } finally {
        this.playing = false;
        this._updateLagNotice();
        if (this.enabled && this.queue.length) void this._drainQueue();
      }
    }
    /** P5: 遅れの一言を出す/消す(状態が変わったときだけ通知)。 */
    _updateLagNotice() {
      this._updateGpuTip();
      const r = decideVoiceLagNotice(this._lagNoticeShown, { ...this.diag, queueNow: this.queue.length }, { gpuCapable: this._gpuCapable });
      if (r.shown === this._lagNoticeShown && !r.shown) return;
      this._lagNoticeShown = r.shown;
      try {
        this.onLagNotice(r.text);
      } catch {
      }
    }
    /** 2026-11-01: GPU の案内を出す/消す(文言が変わったときだけ通知)。 */
    _updateGpuTip() {
      const text = this.enabled ? decideVoiceGpuTip(this.diag, this._gpuCapable) : "";
      if (text === this._gpuTipText) return;
      this._gpuTipText = text;
      try {
        this.onGpuTip(text);
      } catch {
      }
    }
    enqueue(items) {
      if (!this.enabled || this.isObsMode() || !Array.isArray(items)) return;
      let droppedCount = 0;
      for (const item of items) {
        if (!item || item.kind !== "comment" && item.kind !== "gift") continue;
        if (isVoiceItemNgMuted(item, this.ngKeys)) {
          this.diag.ngMutedTotal = (Number(this.diag.ngMutedTotal) || 0) + 1;
          this._notifyDropped(item);
          continue;
        }
        const name = this.readNameEnabled ? String(item.nickname || "").trim() : "";
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
          this._notifyDropped(item);
          continue;
        }
        const _upstreamMs = measureVoiceGapMs(item.receivedAt, Date.now());
        if (_upstreamMs >= 0) {
          this.diag.lastUpstreamMs = _upstreamMs;
          foldVoiceStageEma(this.diag, "upstreamEmaMs", _upstreamMs);
        }
        this._arrivalWindowState = foldVoiceArrivalWindow(this._arrivalWindowState, Date.now(), 1);
        this.diag.arrivalPerMin = this._arrivalWindowState.arrivalPerMin;
        const candidate = {
          userKey: this._voiceUserKeyForItem(item),
          name,
          body,
          count: 1,
          enqueuedAt: Date.now(),
          priority: isHighPriority ? "high" : "normal",
          // onPlayStart: 「item が消費された(再生/破棄/merge/失敗)」= resolved 信号(後方互換)。
          onPlayStart: item.onPlayStart,
          // v0.1.771: 吹き出しを読み上げに連動させるため、実際の再生開始/終了だけを通知する。
          //   onAudioStart は audio.play() が実際に走ったときだけ・onAudioEnd は再生終了(ended/error/stop)時。
          onAudioStart: item.onAudioStart,
          onAudioEnd: item.onAudioEnd,
          // v0.1.799: 鳴らず破棄された時だけ発火する drop 専用シグナル(再生では呼ばれない)。
          onDropped: item.onDropped
        };
        this.diag.voiceEnqueuedTotal = (Number(this.diag.voiceEnqueuedTotal) || 0) + 1;
        const merged = mergeRepeatedVoiceItem(this.queue, candidate);
        this.queue = merged.queue;
        if (merged.merged) {
          this.diag.mergeTotal += 1;
          if (typeof candidate.onPlayStart === "function") candidate.onPlayStart();
          this._notifyDropped(candidate);
          continue;
        }
        const queueMax = this._resolveQueueMaxByChars(candidate);
        const pushed = pushVoiceQueue(this.queue, candidate, { max: queueMax, keep: this._inflightKeeper() });
        this.queue = pushed.queue;
        noteVoicePaceArrival(this._paceState, candidate.enqueuedAt);
        if (pushed.dropped && pushed.dropped.length > 0) {
          for (const dropped of pushed.dropped) {
            if (typeof dropped.onPlayStart === "function") dropped.onPlayStart();
            this._notifyDropped(dropped);
          }
          droppedCount += pushed.dropped.length;
        }
      }
      if (droppedCount > 0) {
        this._showSkipped(droppedCount);
        this.diag.staleDropTotal += droppedCount;
        this._dropCountGateTotal += droppedCount;
        this.diag.dropCountGateTotal = this._dropCountGateTotal;
        for (let _i = 0; _i < droppedCount; _i += 1) {
          this._voicedRecentRatioEma = updateVoiceEventRatioEma(this._voicedRecentRatioEma, 0);
        }
        this.diag.voicedRecentRatio = this._voicedRecentRatioEma;
      }
      this._emitDiag();
      if (this.enabled && !this.isObsMode() && this.queue.length) {
        try {
          this._startPrefetch(this.generation);
        } catch {
        }
      }
      if (this.queue.length) void this._drainQueue();
    }
    /**
     * v0.1.800: 外部(会場)から「今キューにある先頭群の合成を即起動」するための公開フック。
     *   吹き出しを出した直後に呼ぶと、再生開始までの待ち(Δ)が合成時間まで縮む。深さ有界・FIFO不変。
     */
    kickPrefetch() {
      if (!this.enabled || this.isObsMode() || !this.queue.length) return;
      try {
        this._startPrefetch(this.generation);
      } catch {
      }
    }
  };

  // src/lib/voiceDiagKey.js
  var KEY_VOICE_DIAG = "nls_voice_diag_v1";

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
  function buildVoiceDiagSnapshot(diag, nowMs, liveId) {
    const base = makeInitialVoiceDiag();
    const d = (
      /** @type {any} */
      diag && typeof diag === "object" ? diag : {}
    );
    const num3 = (x, fallback) => {
      const n = Number(x);
      return Number.isFinite(n) ? n : fallback;
    };
    const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
    return {
      enabled: !!d.enabled,
      queueNow: num3(d.queueNow, base.queueNow),
      queueMax: num3(d.queueMax, base.queueMax),
      spokenTotal: num3(d.spokenTotal, base.spokenTotal),
      staleDropTotal: num3(d.staleDropTotal, base.staleDropTotal),
      playbackTimeoutTotal: num3(d.playbackTimeoutTotal, base.playbackTimeoutTotal),
      lastSpokenBase: num3(d.lastSpokenBase, base.lastSpokenBase),
      lastSynthMs: num3(d.lastSynthMs, base.lastSynthMs),
      lastDepth: num3(d.lastDepth, base.lastDepth),
      lastSpeedBoost: num3(d.lastSpeedBoost, base.lastSpeedBoost),
      lastPhase: String(d.lastPhase || base.lastPhase),
      lastPhaseAt: num3(d.lastPhaseAt, base.lastPhaseAt),
      lastE2eMs: num3(d.lastE2eMs, base.lastE2eMs),
      e2eAvgMs: num3(d.e2eAvgMs, base.e2eAvgMs),
      mergeTotal: num3(d.mergeTotal, base.mergeTotal),
      serviceTimeEmaMs: num3(d.serviceTimeEmaMs, base.serviceTimeEmaMs),
      effectiveQueueMax: num3(d.effectiveQueueMax, base.effectiveQueueMax),
      rateClampTotal: num3(d.rateClampTotal, base.rateClampTotal),
      voicedRatio: num3(d.voicedRatio, base.voicedRatio),
      synthWaitEmaMs: num3(d.synthWaitEmaMs, base.synthWaitEmaMs),
      playPrepEmaMs: num3(d.playPrepEmaMs, base.playPrepEmaMs),
      playbackEmaMs: num3(d.playbackEmaMs, base.playbackEmaMs),
      expectedPlayEmaMs: num3(d.expectedPlayEmaMs, base.expectedPlayEmaMs),
      synthFailReasons: d.synthFailReasons && typeof d.synthFailReasons === "object" && !Array.isArray(d.synthFailReasons) ? { ...d.synthFailReasons } : base.synthFailReasons,
      lastSustainedBoost: num3(d.lastSustainedBoost, base.lastSustainedBoost),
      lastBacklogBoost: num3(d.lastBacklogBoost, base.lastBacklogBoost),
      lastPaceFloor: num3(d.lastPaceFloor, base.lastPaceFloor),
      queueMaxByChars: num3(d.queueMaxByChars, base.queueMaxByChars),
      sustainedBoostTotal: num3(d.sustainedBoostTotal, base.sustainedBoostTotal),
      arrivalPerMin: num3(d.arrivalPerMin, base.arrivalPerMin),
      voicedRecentRatio: num3(d.voicedRecentRatio, base.voicedRecentRatio),
      synthNullTotal: num3(d.synthNullTotal, base.synthNullTotal),
      synthNullNearTimeout: num3(d.synthNullNearTimeout, base.synthNullNearTimeout),
      audioBlockedTotal: num3(d.audioBlockedTotal, base.audioBlockedTotal),
      lastEnableFailReason: String(d.lastEnableFailReason || base.lastEnableFailReason),
      enableFailTotal: num3(d.enableFailTotal, base.enableFailTotal),
      dropCountGateTotal: num3(d.dropCountGateTotal, base.dropCountGateTotal),
      dropHeadStaleTotal: num3(d.dropHeadStaleTotal, base.dropHeadStaleTotal),
      dropSweepStaleTotal: num3(d.dropSweepStaleTotal, base.dropSweepStaleTotal),
      lightSpokenTotal: num3(d.lightSpokenTotal, base.lightSpokenTotal),
      lightVoiceActive: d.lightVoiceActive === true,
      upstreamEmaMs: num3(d.upstreamEmaMs, base.upstreamEmaMs),
      lastUpstreamMs: num3(d.lastUpstreamMs, base.lastUpstreamMs),
      queueWaitEmaMs: num3(d.queueWaitEmaMs, base.queueWaitEmaMs),
      engineWaitEmaMs: num3(d.engineWaitEmaMs, base.engineWaitEmaMs),
      audioQueryEmaMs: num3(d.audioQueryEmaMs, base.audioQueryEmaMs),
      synthesisEmaMs: num3(d.synthesisEmaMs, base.synthesisEmaMs),
      warmSynthEmaMs: num3(d.warmSynthEmaMs, base.warmSynthEmaMs),
      coldSynthTotal: num3(d.coldSynthTotal, base.coldSynthTotal),
      coldSynthMaxMs: num3(d.coldSynthMaxMs, base.coldSynthMaxMs),
      lastColdSynthMs: num3(d.lastColdSynthMs, base.lastColdSynthMs),
      speakerInitTotal: num3(d.speakerInitTotal, base.speakerInitTotal),
      speakerInitMaxMs: num3(d.speakerInitMaxMs, base.speakerInitMaxMs),
      voiceBorrowTotal: num3(d.voiceBorrowTotal, base.voiceBorrowTotal),
      e2eSampleTotal: num3(d.e2eSampleTotal, base.e2eSampleTotal),
      e2eSumMsTotal: num3(d.e2eSumMsTotal, base.e2eSumMsTotal),
      e2eMaxMs: num3(d.e2eMaxMs, base.e2eMaxMs),
      bgInitTotal: num3(d.bgInitTotal, base.bgInitTotal),
      bgInitMaxMs: num3(d.bgInitMaxMs, base.bgInitMaxMs),
      bgInitYieldTotal: num3(d.bgInitYieldTotal, base.bgInitYieldTotal),
      readerYieldTotal: num3(d.readerYieldTotal, base.readerYieldTotal),
      ngMutedTotal: num3(d.ngMutedTotal, base.ngMutedTotal),
      refreshVoicedTotal: num3(d.refreshVoicedTotal, base.refreshVoicedTotal),
      backlogSkipTotal: num3(d.backlogSkipTotal, base.backlogSkipTotal),
      bigBatchTotal: num3(d.bigBatchTotal, base.bigBatchTotal),
      lastBigBatch: d.lastBigBatch && typeof d.lastBigBatch === "object" ? d.lastBigBatch : null,
      streamTotal: num3(d.streamTotal, base.streamTotal),
      warmSynthSamples: num3(d.warmSynthSamples, base.warmSynthSamples),
      contendedSynthTotal: num3(d.contendedSynthTotal, base.contendedSynthTotal),
      warmSynthRtfPermille: num3(d.warmSynthRtfPermille, base.warmSynthRtfPermille),
      warmRtfSamples: num3(d.warmRtfSamples, base.warmRtfSamples),
      playCheckedTotal: num3(d.playCheckedTotal, base.playCheckedTotal),
      playCutShortTotal: num3(d.playCutShortTotal, base.playCutShortTotal),
      playStallTotal: num3(d.playStallTotal, base.playStallTotal),
      streamUnderrunTotal: num3(d.streamUnderrunTotal, base.streamUnderrunTotal),
      streamUnderrunMaxMs: num3(d.streamUnderrunMaxMs, base.streamUnderrunMaxMs),
      playErrorAfterStartTotal: num3(d.playErrorAfterStartTotal, base.playErrorAfterStartTotal),
      clipItemTotal: num3(d.clipItemTotal, base.clipItemTotal),
      quietItemTotal: num3(d.quietItemTotal, base.quietItemTotal),
      streamGainDropTotal: num3(d.streamGainDropTotal, base.streamGainDropTotal),
      outPeakEmaPermille: num3(d.outPeakEmaPermille, base.outPeakEmaPermille),
      outRmsDbMin: num3(d.outRmsDbMin, base.outRmsDbMin),
      outRmsDbMax: num3(d.outRmsDbMax, base.outRmsDbMax),
      lastOutRmsDb: num3(d.lastOutRmsDb, base.lastOutRmsDb),
      lastPlayIssue: typeof d.lastPlayIssue === "string" ? d.lastPlayIssue : "",
      venueGate: typeof d.venueGate === "string" ? d.venueGate : "",
      streamFirstAudioEmaMs: num3(d.streamFirstAudioEmaMs, base.streamFirstAudioEmaMs),
      lagVerdict: String(d.lagVerdict || base.lagVerdict),
      diagBornAt: num3(d.diagBornAt, base.diagBornAt),
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
  function wireVenueVoiceTestHook(voicePlayer) {
    voicePlayer.diag.venueGate = "panel-closed";
    wireVoiceTestHook({
      target: "venue",
      enqueue: (items) => voicePlayer.enqueue(items),
      getDiag: () => voicePlayer.diag,
      isIdle: () => !voicePlayer.playing && voicePlayer.queue.length === 0,
      prepare: () => {
        voicePlayer.queue = [];
        voicePlayer.prefetches.clear();
      },
      // 試験の前の待ち行列を捨てる
      isVoiceOn: () => voicePlayer.enabled === true && !voicePlayer.toggleBusy,
      ensureEnabled: async () => {
        for (let i = 0; i < 60 && voicePlayer.toggleBusy; i++) await new Promise((r) => setTimeout(r, 250));
        if (!voicePlayer.enabled) await voicePlayer.enable({ persist: false });
        return voicePlayer.enabled === true;
      }
    });
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

  // src/lib/venueBubbleLifecycle.js
  var BUBBLE_VOICE_AFTERGLOW_MS = 500;
  var BUBBLE_PENDING_VOICE_FLOOR_MS = VOICE_STALE_MS_NORMAL;
  function resolvePendingLifetimeMs(flowLifetimeMs, voiceEnabled) {
    const flow = typeof flowLifetimeMs === "number" && flowLifetimeMs > 0 ? flowLifetimeMs : 0;
    if (!voiceEnabled) return flow;
    return Math.max(flow, BUBBLE_PENDING_VOICE_FLOOR_MS);
  }
  var BUBBLE_VOICE_SPEAKING_CAP_MS = 12e3;
  function nextBubbleVoiceState(current, event) {
    const state = current === "speaking" || current === "done" || current === "unvoiced" ? current : "pending";
    if (event === "audioStart") {
      return state === "pending" ? "speaking" : state;
    }
    if (event === "audioEnd") {
      if (state === "speaking" || state === "pending") return "done";
      return state;
    }
    if (event === "resolved") {
      return state === "pending" ? "unvoiced" : state;
    }
    return state;
  }
  function bubbleEvictionScore(bubble, now) {
    const state = bubble && typeof bubble.voiceState === "string" ? bubble.voiceState : "pending";
    const createdAt = bubble && typeof bubble.createdAt === "number" ? bubble.createdAt : now;
    const age = Math.max(0, now - createdAt);
    let rank;
    if (state === "speaking") rank = 3;
    else if (state === "done") rank = 2;
    else if (state === "pending") rank = 1;
    else rank = 0;
    const ageComponent = Math.min(age, 1e9);
    return rank * 1e10 - ageComponent;
  }
  function selectBubblesToEvict(bubbles, max, now) {
    const list = Array.isArray(bubbles) ? bubbles.slice() : [];
    const limit = typeof max === "number" && max > 0 ? max : 0;
    if (list.length <= limit) return [];
    const sorted = list.map((b) => ({ b, score: bubbleEvictionScore(b, now) })).sort((a, b) => a.score - b.score);
    const evictCount = list.length - limit;
    return sorted.slice(0, evictCount).map((x) => x.b);
  }

  // src/lib/venueCharacterFrame.js
  var BASE = "images/yukkuri-charactore-english";
  var VENUE_FRAME_CHARACTER_THUMBS = Object.freeze({
    rinku: Object.freeze([
      `${BASE}/link/link-yukkuri-smile-mouth-open.thumb128.png`,
      `${BASE}/link/link-yukkuri-normal-mouth-open.thumb128.png`,
      `${BASE}/link/link-yukkuri-normal-mouth-closed.thumb128.png`,
      `${BASE}/link/link-yukkuri-blink-mouth-closed.thumb128.png`,
      `${BASE}/link/link-yukkuri-half-eyes-mouth-closed.thumb128.png`
    ]),
    konta: Object.freeze([
      `${BASE}/konta/kitsune-yukkuri-smile-mouth-open.thumb128.png`,
      `${BASE}/konta/kitsune-yukkuri-normal.thumb128.png`,
      `${BASE}/konta/kitsune-yukkuri-blink-mouth-closed.thumb128.png`,
      `${BASE}/konta/kitsune-yukkuri-half-eyes-mouth-closed.thumb128.png`
    ]),
    tanunee: Object.freeze([
      `${BASE}/tanunee/tanuki-yukkuri-smile-mouth-open.thumb128.png`,
      `${BASE}/tanunee/tanuki-yukkuri-normal-mouth-open.thumb128.png`,
      `${BASE}/tanunee/tanuki-yukkuri-normal-mouth-closed.thumb128.png`,
      `${BASE}/tanunee/tanuki-yukkuri-blink-mouth-closed.thumb128.png`,
      `${BASE}/tanunee/tanuki-yukkuri-half-eyes-mouth-closed.thumb128.png`
    ])
  });
  var VENUE_FRAME_EDGES = Object.freeze(["top", "right", "bottom", "left"]);
  function interleaveFrameThumbs() {
    const lists = [
      VENUE_FRAME_CHARACTER_THUMBS.rinku,
      VENUE_FRAME_CHARACTER_THUMBS.konta,
      VENUE_FRAME_CHARACTER_THUMBS.tanunee
    ];
    const out = [];
    const maxLen = Math.max(...lists.map((l) => l.length));
    for (let i = 0; i < maxLen; i += 1) {
      for (const list of lists) {
        if (i < list.length) out.push(list[i]);
      }
    }
    return out;
  }
  function distributeFrameSlots(count) {
    const n = Math.max(0, Math.floor(count));
    if (!n) return [];
    const per = Math.floor(n / 4);
    const extra = n % 4;
    const slots = [];
    for (let e = 0; e < 4; e += 1) {
      const edge = VENUE_FRAME_EDGES[e];
      const onThisEdge = per + (e < extra ? 1 : 0);
      for (let k = 0; k < onThisEdge; k += 1) {
        const pos = onThisEdge === 1 ? 0.5 : 0.06 + k / (onThisEdge - 1) * 0.88;
        slots.push({ edge, pos, edgeIndex: e });
      }
    }
    return slots;
  }
  function buildVenueCharacterFrame(resolveUrl) {
    const resolve = typeof resolveUrl === "function" ? resolveUrl : (rel3) => rel3;
    const thumbs = interleaveFrameThumbs();
    const slots = distributeFrameSlots(thumbs.length);
    return thumbs.map((rel3, i) => ({
      src: resolve(rel3),
      edge: slots[i].edge,
      pos: slots[i].pos
    }));
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

  // src/lib/charaLiveState.js
  var CHARA_LIVE_MEMBERS = Object.freeze([
    Object.freeze({ id: "rinku", displayName: "りんく", role: "配信者視点" }),
    Object.freeze({ id: "konta", displayName: "こん太", role: "ファン視点" }),
    Object.freeze({ id: "tanunee", displayName: "たぬ姉", role: "匿名ガイド / しっかり者解説" })
  ]);
  var CHARA_LIVE_IDS = Object.freeze(CHARA_LIVE_MEMBERS.map((m) => m.id));
  function fnv1a322(value) {
    const s = String(value ?? "");
    let hash = 2166136261;
    for (let i = 0; i < s.length; i += 1) {
      hash ^= s.charCodeAt(i) & 255;
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
  function charaHashUnit(seed) {
    return fnv1a322(seed) / 4294967296;
  }
  function clamp012(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return n < 0 ? 0 : n > 1 ? 1 : n;
  }
  var FLOAT_BASE_PERIOD_MS = 5200;
  function resolveCharaFloat(timeMs, charaId, opts = {}) {
    if (opts.reducedMotion === true) {
      return { x: 0, y: 0, rotateDeg: 0, scale: 1 };
    }
    const t = Number(timeMs) || 0;
    const heat = clamp012(opts.heatLevel);
    const idx = CHARA_LIVE_IDS.indexOf(
      /** @type {any} */
      charaId
    );
    const evenPhase = idx >= 0 ? idx / CHARA_LIVE_IDS.length : 0;
    const phaseSeed = (evenPhase + charaHashUnit(`float:${charaId}`) * 0.08) % 1;
    const period = Math.max(1200, FLOAT_BASE_PERIOD_MS - heat * 1600);
    const base = t / period * Math.PI * 2 + phaseSeed * Math.PI * 2;
    const y = Math.sin(base) * (5 + heat * 3);
    const x = Math.sin(base * 0.63 + phaseSeed * 3.1) * (3 + heat * 2);
    const rotateDeg = Math.sin(base * 0.41 + phaseSeed * 1.7) * (1.6 + heat * 1.2);
    const scale = 1 + Math.sin(base * 0.77 + phaseSeed * 2.3) * 0.012;
    return { x, y, rotateDeg, scale };
  }
  var BLINK_DURATION_MS = 130;
  var BLINK_INTERVAL_MS = 4200;
  function isCharaBlinking(timeMs, charaId) {
    const t = Number(timeMs) || 0;
    if (t < 0) return false;
    const seed = charaHashUnit(`blink:${charaId}`);
    const interval = BLINK_INTERVAL_MS * (0.8 + seed * 0.4);
    const cycle = Math.floor(t / interval);
    const jitter = charaHashUnit(`blink:${charaId}:${cycle}`) * interval * 0.5;
    const startAt = cycle * interval + jitter;
    return t >= startAt && t < startAt + BLINK_DURATION_MS;
  }
  var IDLE_EXPRESSION_PERIOD_MS = 7e3;
  function resolveIdleExpression(timeMs, charaId, opts = {}) {
    const t = Number(timeMs) || 0;
    const heat = clamp012(opts.heatLevel);
    const seed = charaHashUnit(`expr:${charaId}`);
    const period = IDLE_EXPRESSION_PERIOD_MS * (0.75 + seed * 0.5);
    const slot = Math.floor(t / period);
    const roll = charaHashUnit(`expr:${charaId}:${slot}`);
    const smileChance = 0.22 + heat * 0.38;
    if (roll < smileChance) return "smile";
    if (roll > 1 - 0.14 * (1 - heat)) return "half-eyes";
    return "normal";
  }
  var LIPSYNC_PERIOD_MS = 180;
  function isCharaMouthOpen(elapsedMs, charaId) {
    const e = Number(elapsedMs);
    if (!Number.isFinite(e) || e < 0) return false;
    const cycle = Math.floor(e / LIPSYNC_PERIOD_MS);
    const within = e % LIPSYNC_PERIOD_MS / LIPSYNC_PERIOD_MS;
    const openRatio = 0.35 + charaHashUnit(`lip:${charaId}:${cycle}`) * 0.4;
    return within < openRatio;
  }
  function pickReactingChara(commentKey, lastSpeaker = null) {
    const pool = CHARA_LIVE_IDS.filter((id) => id !== lastSpeaker);
    const list = pool.length ? pool : CHARA_LIVE_IDS;
    const idx = fnv1a322(`react:${commentKey}`) % list.length;
    return (
      /** @type {CharaId} */
      list[idx]
    );
  }
  function detectAddressedChara(text) {
    const raw = String(text ?? "").trim();
    if (!raw) return null;
    const s = raw.toLowerCase();
    const hits = [];
    const ALIASES = {
      rinku: ["りんく", "リンク", "link", "rinku"],
      konta: ["こん太", "コン太", "こんた", "コンタ", "konta"],
      tanunee: ["たぬ姉", "たぬねえ", "タヌ姉", "たぬネエ", "tanunee", "tanu"]
    };
    for (const id of CHARA_LIVE_IDS) {
      for (const alias of ALIASES[id]) {
        const at = s.indexOf(alias.toLowerCase());
        if (at >= 0) {
          hits.push({ id, at });
          break;
        }
      }
    }
    if (!hits.length) return null;
    hits.sort((a, b) => a.at - b.at);
    return hits[0].id;
  }
  var REACT_MIN_MS = 1400;
  var ANSWER_MIN_MS = 1800;
  function resolveThinkingLook(elapsedMs) {
    const e = Number(elapsedMs) || 0;
    const slot = Math.floor(e / 1500);
    const roll = charaHashUnit(`think:${slot}`);
    return {
      expression: roll < 0.75 ? "half-eyes" : "normal",
      mouthOpen: false
    };
  }
  var THINKING_TILT_MAX_DEG = 9;
  function resolveThinkingTilt(elapsedMs) {
    const e = Number(elapsedMs) || 0;
    const phase = e / 2400 * Math.PI;
    return Math.sin(phase) * THINKING_TILT_MAX_DEG;
  }
  function resolveCharaLiveLook(input) {
    const charaId = (
      /** @type {CharaId} */
      input?.charaId || "rinku"
    );
    const mode = (
      /** @type {CharaMode} */
      input?.mode || "idle"
    );
    const timeMs = Number(input?.timeMs) || 0;
    const startedAt = Number(input?.modeStartedAtMs);
    const elapsed2 = Number.isFinite(startedAt) ? Math.max(0, timeMs - startedAt) : timeMs;
    const heatLevel = clamp012(input?.heatLevel);
    const reducedMotion = input?.reducedMotion === true;
    const float = resolveCharaFloat(timeMs, charaId, { heatLevel, reducedMotion });
    let expression;
    let mouthOpen = false;
    let tiltDeg = 0;
    let allowBlink = true;
    if (mode === "thinking") {
      const look = resolveThinkingLook(elapsed2);
      expression = look.expression;
      mouthOpen = look.mouthOpen;
      tiltDeg = reducedMotion ? 0 : resolveThinkingTilt(elapsed2);
      allowBlink = false;
    } else if (mode === "answer") {
      expression = "smile";
      mouthOpen = isCharaMouthOpen(elapsed2, charaId);
    } else if (mode === "react") {
      expression = "smile";
      mouthOpen = isCharaMouthOpen(elapsed2, charaId);
    } else {
      expression = resolveIdleExpression(timeMs, charaId, { heatLevel });
      mouthOpen = false;
    }
    if (allowBlink && isCharaBlinking(timeMs, charaId)) {
      expression = "blink";
    }
    return {
      charaId,
      mode,
      expression,
      mouthOpen,
      // konta の normal 単独ファイル問題は yukkuriCharacterImagePath が吸収済み。
      imagePath: yukkuriCharacterImagePath(charaId, expression, mouthOpen),
      float,
      tiltDeg
    };
  }
  function makeInitialCharaLiveState() {
    const slots = {};
    for (const id of CHARA_LIVE_IDS) {
      slots[id] = { mode: "idle", modeStartedAtMs: 0, untilMs: 0, text: "" };
    }
    return { slots, lastSpeaker: null };
  }
  function expireCharaModes(state, nowMs) {
    const now = Number(nowMs) || 0;
    for (const id of CHARA_LIVE_IDS) {
      const slot = state?.slots?.[id];
      if (!slot || slot.mode === "idle") continue;
      if (Number.isFinite(slot.untilMs) && now >= slot.untilMs) {
        slot.mode = "idle";
        slot.modeStartedAtMs = now;
        slot.untilMs = 0;
        slot.text = "";
      }
    }
    return state;
  }
  function triggerCharaReaction(state, input) {
    const now = Number(input?.nowMs) || 0;
    const commentKey = String(input?.commentKey ?? "");
    const duration = Number.isFinite(input?.durationMs) ? Math.max(REACT_MIN_MS, Number(input.durationMs)) : REACT_MIN_MS;
    const first = pickReactingChara(commentKey, state?.lastSpeaker ?? null);
    const order = [first, ...CHARA_LIVE_IDS.filter((id) => id !== first)];
    for (const id of order) {
      const slot = state?.slots?.[id];
      if (!slot) continue;
      if (slot.mode !== "idle") continue;
      slot.mode = "react";
      slot.modeStartedAtMs = now;
      slot.untilMs = now + duration;
      slot.text = String(input?.text ?? "");
      state.lastSpeaker = id;
      return id;
    }
    return null;
  }
  function triggerCharaCheer(state, input) {
    const now = Number(input?.nowMs) || 0;
    const duration = Number.isFinite(input?.durationMs) ? Math.max(REACT_MIN_MS, Number(input.durationMs)) : 2400;
    const out = [];
    for (const id of CHARA_LIVE_IDS) {
      const slot = state?.slots?.[id];
      if (!slot) continue;
      if (slot.mode !== "idle" && slot.mode !== "react") continue;
      slot.mode = "react";
      slot.modeStartedAtMs = now;
      slot.untilMs = now + duration;
      slot.text = "";
      out.push(id);
    }
    return out;
  }
  function triggerCharaAnswer(state, input) {
    const now = Number(input?.nowMs) || 0;
    const prompt = String(input?.prompt ?? "");
    const duration = Number.isFinite(input?.durationMs) ? Math.max(ANSWER_MIN_MS, Number(input.durationMs)) : ANSWER_MIN_MS;
    const addressed = detectAddressedChara(prompt);
    const id = addressed || pickReactingChara(`answer:${prompt}`, state?.lastSpeaker ?? null);
    const slot = state?.slots?.[id];
    if (slot) {
      slot.mode = "answer";
      slot.modeStartedAtMs = now;
      slot.untilMs = now + duration;
      slot.text = String(input?.answer ?? "");
      state.lastSpeaker = id;
    }
    return id;
  }
  function startCharaThinking(state, input) {
    const now = Number(input?.nowMs) || 0;
    const explicit = input?.charaId && CHARA_LIVE_IDS.includes(input.charaId) ? input.charaId : null;
    const id = explicit || detectAddressedChara(String(input?.prompt ?? "")) || "tanunee";
    const slot = state?.slots?.[id];
    if (slot) {
      slot.mode = "thinking";
      slot.modeStartedAtMs = now;
      slot.untilMs = Infinity;
      slot.text = "";
    }
    return (
      /** @type {CharaId} */
      id
    );
  }
  function endCharaThinking(state, input) {
    const now = Number(input?.nowMs) || 0;
    const only = input?.charaId ?? null;
    const cleared = [];
    for (const id of CHARA_LIVE_IDS) {
      if (only && id !== only) continue;
      const slot = state?.slots?.[id];
      if (!slot || slot.mode !== "thinking") continue;
      slot.mode = "idle";
      slot.modeStartedAtMs = now;
      slot.untilMs = 0;
      slot.text = "";
      cleared.push(id);
    }
    return cleared;
  }
  function buildCharaLiveRenderModel(state, opts) {
    const timeMs = Number(opts?.timeMs) || 0;
    return CHARA_LIVE_MEMBERS.map((member) => {
      const id = (
        /** @type {CharaId} */
        member.id
      );
      const slot = state?.slots?.[id] || {
        mode: "idle",
        modeStartedAtMs: 0,
        untilMs: 0,
        text: ""
      };
      const look = resolveCharaLiveLook({
        charaId: id,
        mode: (
          /** @type {CharaMode} */
          slot.mode
        ),
        timeMs,
        modeStartedAtMs: slot.modeStartedAtMs,
        heatLevel: opts?.heatLevel,
        reducedMotion: opts?.reducedMotion
      });
      return { ...look, displayName: member.displayName, text: slot.text || "" };
    });
  }

  // src/lib/supportCelebration.js
  var COMMENT_MILESTONES = Object.freeze([10, 25, 50, 100, 200, 500, 1e3, 2e3, 3e3, 5e3, 1e4]);
  var GIFT_MILESTONES = Object.freeze([1, 5, 10, 25, 50, 100]);
  var AD_POINTS_MILESTONES = Object.freeze([
    1,
    1e3,
    5e3,
    1e4,
    5e4,
    1e5,
    5e5
  ]);
  var AD_ADVERTISER_MILESTONES = Object.freeze([1, 3, 5, 10, 25]);
  function pickHighestCrossedMilestone(prev, next, milestones) {
    if (prev == null || !Number.isFinite(prev) || !Number.isFinite(next)) return null;
    if (next <= prev) return null;
    let hit = null;
    for (const m of milestones) {
      if (prev < m && next >= m) hit = m;
    }
    return hit;
  }
  var BROADCASTER_FOLLOWER_MILESTONES = Object.freeze([
    1,
    10,
    50,
    100,
    500,
    1e3,
    5e3,
    1e4
  ]);

  // src/lib/charaLiveCheerTrigger.js
  var CHEER_MIN_MILESTONE = 100;
  var CHEER_STEP_AFTER_FIXED = 1e3;
  var CHEER_FIXED_MILESTONES = Object.freeze([100, 200, 500]);
  function cheerMilestonesBetween(prev, next, minMilestone) {
    const out = [];
    for (const m of CHEER_FIXED_MILESTONES) if (m >= minMilestone && m > prev && m <= next) out.push(m);
    const first = Math.max(CHEER_STEP_AFTER_FIXED, Math.floor(prev / CHEER_STEP_AFTER_FIXED + 1) * CHEER_STEP_AFTER_FIXED);
    for (let m = first; m <= next && out.length < 64; m += CHEER_STEP_AFTER_FIXED) if (m >= minMilestone) out.push(m);
    return out;
  }
  var CHEER_JUMP_GUARD = 300;
  function resolveCommentCheer(prev, next, opts = {}) {
    const minMilestone = Number.isFinite(opts.minMilestone) ? Number(opts.minMilestone) : CHEER_MIN_MILESTONE;
    const jumpGuard = Number.isFinite(opts.jumpGuard) && Number(opts.jumpGuard) > 0 ? Number(opts.jumpGuard) : CHEER_JUMP_GUARD;
    const n = next == null || next === "" ? NaN : Number(next);
    if (!Number.isFinite(n) || n < 0) return { baseline: prev == null ? null : prev, cheer: null };
    const cur = Math.floor(n);
    if (prev == null || !Number.isFinite(prev)) return { baseline: cur, cheer: null };
    if (cur < prev) return { baseline: cur, cheer: null };
    if (cur - prev >= jumpGuard) return { baseline: cur, cheer: null };
    const hit = pickHighestCrossedMilestone(prev, cur, cheerMilestonesBetween(prev, cur, minMilestone));
    return { baseline: cur, cheer: hit == null ? null : { milestone: hit } };
  }
  function cheerLabel(milestone) {
    const n = Math.floor(Number(milestone));
    return Number.isFinite(n) && n > 0 ? `${n.toLocaleString("ja-JP")}件!` : "";
  }

  // src/lib/charaLiveStage.js
  var THUMB_FALLBACK = Object.freeze({
    // smile-mouth-closed の thumb は存在しない → 口を閉じた normal で代用。
    "link/link-yukkuri-smile-mouth-closed": "link/link-yukkuri-normal-mouth-closed",
    "tanunee/tanuki-yukkuri-smile-mouth-closed": "tanunee/tanuki-yukkuri-normal-mouth-closed",
    "konta/kitsune-yukkuri-smile-mouth-closed": "konta/kitsune-yukkuri-normal",
    // blink-mouth-open / half-eyes-mouth-open の thumb は無い → 口を閉じた同表情へ。
    "link/link-yukkuri-blink-mouth-open": "link/link-yukkuri-blink-mouth-closed",
    "konta/kitsune-yukkuri-blink-mouth-open": "konta/kitsune-yukkuri-blink-mouth-closed",
    "tanunee/tanuki-yukkuri-blink-mouth-open": "tanunee/tanuki-yukkuri-blink-mouth-closed",
    "link/link-yukkuri-half-eyes-mouth-open": "link/link-yukkuri-half-eyes-mouth-closed",
    "konta/kitsune-yukkuri-half-eyes-mouth-open": "konta/kitsune-yukkuri-half-eyes-mouth-closed",
    "tanunee/tanuki-yukkuri-half-eyes-mouth-open": "tanunee/tanuki-yukkuri-half-eyes-mouth-closed",
    // konta は normal-mouth-open の実体が無い(fullでも) → smile-mouth-open で口を開ける。
    "konta/kitsune-yukkuri-normal-mouth-open": "konta/kitsune-yukkuri-smile-mouth-open"
  });
  var IMG_BASE = "images/yukkuri-charactore-english/";
  function toThumbPath(fullPath) {
    const rel3 = String(fullPath).startsWith(IMG_BASE) ? String(fullPath).slice(IMG_BASE.length) : String(fullPath);
    const stem = rel3.replace(/\.png$/, "");
    const mapped = THUMB_FALLBACK[stem] || stem;
    return `${IMG_BASE}${mapped}.thumb128.png`;
  }
  var CHARA_LIVE_SIZE_PX = 116;
  var CHARA_LIVE_COMPACT_SIZE_PX = 64;
  var CHARA_LIVE_PLACEMENT = "top";
  function listCharaLiveImagePaths() {
    const out = /* @__PURE__ */ new Set();
    for (const id of CHARA_LIVE_IDS) {
      for (
        const expression of
        /** @type {const} */
        ["normal", "smile", "blink", "half-eyes"]
      ) {
        for (const mouthOpen of [false, true]) {
          out.add(toThumbPath(yukkuriCharacterImagePath(id, expression, mouthOpen)));
        }
      }
    }
    return [...out];
  }
  function charaLiveStageCss() {
    return `
.nlcl-stage {
  /*
   * ★会場ステージ(.nlsb-stage)の内側に入る前提の配置(2026-08-25 実機で踏んだ)。
   *   当初 body 直下に fixed + z-index:2147483000 で置いたが、会場ルート(.nlsb-root)が
   *   まったく同じ z-index の全画面要素で、かつ後から DOM に入るため【完全に覆われて
   *   一度も見えなかった】。同値 z-index は DOM 順で後勝ちになる。
   *   会場の既存階層(客席 z4 / 吹き出し z5 / 常駐・roster z6 / 投げ物 z7)。
   *
   * ★z6 も間違いだった(2回目の同じ失敗・2026-08-25):
   *   stage.append(stageLayout, bubbleLayer, rosterPanel, ...) は startCharaLive より
   *   先に実行されるので、【同じ z6 の rosterPanel より DOM順で前】に置かれてしまい、
   *   また負けた(venueBar.js:2711 のコメントが「stage.appendの最後に置くことで同z-index(6)
   *   の常駐レイヤーより手前に来る」と明言している＝先に入る側は負ける)。
   *   実測: 会場内で使われている z-index の最大は 7(投げ物)。よって 8 で最前面を取る。
   *   ★「最大値を名乗る」でも「既存に合わせる」でもなく【実測して1つ上】が正解。
   */
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 8;
  display: flex;
  align-items: flex-end;
  gap: 10px;
  /* 配信の操作を絶対に奪わない。吹き出しも含めて素通し。 */
  pointer-events: none;
  /* 親の文字設定に引きずられない(ニコ生ページに寄生するため)。 */
  font: 13px/1.5 system-ui, "Segoe UI", "Hiragino Kaku Gothic ProN", sans-serif;
}
.nlcl-chara {
  position: relative;
  width: ${CHARA_LIVE_SIZE_PX}px;
  height: ${CHARA_LIVE_SIZE_PX}px;
  /* transform の原点を足元に。浮遊しても「立っている」感じが崩れない。 */
  transform-origin: 50% 90%;
  will-change: transform;
}
/*
 * ★上端配置(2026-10-17): data-placement="top" のとき、会場の上端の余白に 64px で右寄せ横一列。
 *   吹き出しと「…」は画面外に出ないよう下向きにする(しっぽの向きも反転)。従来の右下配置は data-placement 無し/bottom-right のまま変わらない。
 */
.nlcl-stage[data-placement="top"] {
  top: 4px;
  bottom: auto;
  align-items: flex-start;
}
.nlcl-stage[data-placement="top"] .nlcl-chara {
  width: ${CHARA_LIVE_COMPACT_SIZE_PX}px;
  height: ${CHARA_LIVE_COMPACT_SIZE_PX}px;
  transform-origin: 50% 50%;
}
.nlcl-stage[data-placement="top"] .nlcl-chara__bubble,
.nlcl-stage[data-placement="top"] .nlcl-chara__think {
  top: calc(100% + 6px);
  bottom: auto;
}
.nlcl-stage[data-placement="top"] .nlcl-chara__bubble::after {
  top: auto;
  bottom: 100%;
  border-top-color: transparent;
  border-bottom-color: #2f3a46;
}
/*
 * ★お祝い(2026-10-17・応援コメント100件など): 3人が弾んで「100件!」のバッジが出る。
 *   CSS animation は inline transform(浮遊)より優先されるので競合しない。終わると浮遊に戻る(fill-mode なし)。
 *   transform/opacity のみ・DOM 追加はバッジ1個だけ。prefers-reduced-motion では弾みを止め、バッジの fade だけ残す。
 */
.nlcl-stage.is-cheering .nlcl-chara {
  animation: nlcl-cheer 2.4s ease-in-out;
}
.nlcl-cheer-badge {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  padding: 6px 16px;
  border-radius: 999px;
  background: #ff9800;
  color: #fff;
  border: 3px solid #fff;
  box-shadow: 0 3px 0 rgba(150, 70, 0, 0.9), 0 6px 14px rgba(0, 0, 0, 0.35);
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0.04em;
  white-space: nowrap;
  transform-origin: 100% 100%;
  animation: nlcl-cheer-badge 2.2s ease-out forwards;
}
.nlcl-stage[data-placement="top"] .nlcl-cheer-badge {
  top: calc(100% + 8px);
  bottom: auto;
  transform-origin: 100% 0;
}
.nlcl-cheer-badge[hidden] { display: none; }
@keyframes nlcl-cheer {
  0%   { transform: scale(1) translateY(0); }
  14%  { transform: scale(1.35) translateY(-10px); }
  28%  { transform: scale(1) translateY(0); }
  44%  { transform: scale(1.25) translateY(-7px); }
  60%  { transform: scale(1) translateY(0); }
  76%  { transform: scale(1.15) translateY(-4px); }
  100% { transform: scale(1) translateY(0); }
}
@keyframes nlcl-cheer-badge {
  0%   { opacity: 0; transform: scale(0.4); }
  12%  { opacity: 1; transform: scale(1.18); }
  22%  { transform: scale(1); }
  80%  { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(1); }
}
.nlcl-chara__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  /* 立ち絵を背景から浮かせる(配信映像の上でも輪郭が見える)。 */
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.45));
  -webkit-user-select: none;
  user-select: none;
}
/* 喋っている子を少し持ち上げて前に出す(誰が喋ったか一目で分かる)。 */
.nlcl-chara.is-speaking { z-index: 2; }
.nlcl-chara.is-speaking .nlcl-chara__img {
  filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.5));
}
.nlcl-chara__bubble {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  max-width: 190px;
  width: max-content;
  padding: 6px 10px;
  border-radius: 12px;
  background: #fffdf7;
  color: #23303f;
  border: 2px solid #2f3a46;
  box-shadow: 2px 2px 0 rgba(47, 58, 70, 0.9);
  font-size: 12px;
  line-height: 1.45;
  text-align: center;
  /* 長文でも会場を覆わない。3 行で切る。 */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  animation: nlcl-pop 160ms ease-out;
}
/* 吹き出しのしっぽ。 */
.nlcl-chara__bubble::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  margin-left: -6px;
  border: 6px solid transparent;
  border-top-color: #2f3a46;
}
.nlcl-chara__name {
  display: block;
  font-size: 10px;
  font-weight: 700;
  opacity: 0.7;
  margin-bottom: 1px;
}
/* シンキングの「…」。考えている間だけ出る。 */
.nlcl-chara__think {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
  padding: 7px 11px;
  border-radius: 999px;
  background: #fffdf7;
  border: 2px solid #2f3a46;
  box-shadow: 2px 2px 0 rgba(47, 58, 70, 0.9);
}
.nlcl-chara__think i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4b5b6b;
  animation: nlcl-think 1.25s ease-in-out infinite;
}
.nlcl-chara__think i:nth-child(2) { animation-delay: 0.18s; }
.nlcl-chara__think i:nth-child(3) { animation-delay: 0.36s; }
/* ★hidden を必ず効かせる(2026-08-25 発見のバグ):
   display:flex は hidden 属性の既定 display:none に勝ってしまうため、
   setVisible(false) しても隠れない。明示的に打ち消す。 */
.nlcl-stage[hidden] { display: none; }
/* ★2026-10-12 同じ罠が吹き出しと「…」にも残っていた(実測: 3体とも hidden なのに画面に出ていた)。
   display:flex / -webkit-box は hidden の既定 display:none に勝つ。JS が hidden で出し入れする部品は全部ここで打ち消す。 */
.nlcl-chara__bubble[hidden] { display: none; }
.nlcl-chara__think[hidden] { display: none; }
@keyframes nlcl-pop {
  from { opacity: 0; transform: translateX(-50%) translateY(4px) scale(0.94); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0)   scale(1); }
}
@keyframes nlcl-cheer-badge-calm {
  0%   { opacity: 0; }
  10%  { opacity: 1; }
  80%  { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes nlcl-think {
  0%, 100% { opacity: 0.28; transform: translateY(0); }
  50%      { opacity: 1;    transform: translateY(-3px); }
}
@media (prefers-reduced-motion: reduce) {
  .nlcl-stage.is-cheering .nlcl-chara { animation: none; }
  .nlcl-cheer-badge { animation: nlcl-cheer-badge-calm 2.2s linear forwards; }
  .nlcl-chara__bubble { animation: none; }
  .nlcl-chara__think i { animation: none; opacity: 0.7; }
}
`.trim();
  }
  function buildCharaLiveStageDom(doc, resolveUrl) {
    const root = doc.createElement("div");
    root.className = "nlcl-stage";
    root.dataset.placement = CHARA_LIVE_PLACEMENT;
    root.setAttribute("aria-live", "polite");
    const nodes = {};
    for (const member of CHARA_LIVE_MEMBERS) {
      const el = doc.createElement("div");
      el.className = "nlcl-chara";
      el.dataset.chara = member.id;
      const img = doc.createElement("img");
      img.className = "nlcl-chara__img";
      img.alt = member.displayName;
      img.decoding = "async";
      img.src = resolveUrl(toThumbPath(yukkuriCharacterImagePath(member.id, "normal", false)));
      const bubble = doc.createElement("div");
      bubble.className = "nlcl-chara__bubble";
      bubble.hidden = true;
      const think = doc.createElement("div");
      think.className = "nlcl-chara__think";
      think.hidden = true;
      think.setAttribute("aria-hidden", "true");
      for (let i = 0; i < 3; i += 1) think.appendChild(doc.createElement("i"));
      el.append(img, bubble, think);
      root.appendChild(el);
      nodes[member.id] = { el, img, bubble, think };
    }
    const badge = doc.createElement("div");
    badge.className = "nlcl-cheer-badge";
    badge.hidden = true;
    badge.setAttribute("aria-hidden", "true");
    root.appendChild(badge);
    return { root, badge, nodes };
  }
  function applyCharaLiveFrame(nodes, model, resolveUrl) {
    for (const item of model) {
      const node = nodes?.[item.charaId];
      if (!node) continue;
      const nextSrc = resolveUrl(toThumbPath(item.imagePath));
      if (node.img.getAttribute("src") !== nextSrc) {
        node.img.setAttribute("src", nextSrc);
      }
      const { x, y, rotateDeg, scale } = item.float;
      const speaking = item.mode === "react" || item.mode === "answer";
      const emphasise = speaking ? 1.06 : 1;
      const transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${(rotateDeg + item.tiltDeg).toFixed(2)}deg) scale(${(scale * emphasise).toFixed(4)})`;
      if (node.el.style.transform !== transform) {
        node.el.style.transform = transform;
      }
      if (node.el.classList.contains("is-speaking") !== speaking) {
        node.el.classList.toggle("is-speaking", speaking);
      }
      const showBubble = speaking && !!item.text;
      if (showBubble) {
        if (node.bubble.dataset.text !== item.text) {
          node.bubble.textContent = "";
          const name = node.bubble.ownerDocument.createElement("b");
          name.className = "nlcl-chara__name";
          name.textContent = item.displayName;
          node.bubble.append(name, node.bubble.ownerDocument.createTextNode(item.text));
          node.bubble.dataset.text = item.text;
        }
        if (node.bubble.hidden) node.bubble.hidden = false;
      } else if (!node.bubble.hidden) {
        node.bubble.hidden = true;
        delete node.bubble.dataset.text;
      }
      const showThink = item.mode === "thinking";
      if (node.think.hidden === showThink) node.think.hidden = !showThink;
    }
  }
  function preloadCharaLiveImages(doc, resolveUrl) {
    return listCharaLiveImagePaths().map((path) => {
      const img = doc.createElement("img");
      img.decoding = "async";
      img.src = resolveUrl(path);
      return img;
    });
  }

  // src/lib/charaLiveController.js
  var CHARA_BACKCHANNELS = Object.freeze([
    "うんうん",
    "なるほど〜",
    "たしかに",
    "わかる",
    "おお〜",
    "それな",
    "いいね！",
    "ふむふむ"
  ]);
  var CHARA_LIVE_FPS = 18;
  var FRAME_MIN_GAP_MS = Math.round(1e3 / CHARA_LIVE_FPS);
  var REACTION_MIN_GAP_MS = 2600;
  var CHEER_DURATION_MS = 2400;
  function startCharaLive(deps) {
    const doc = deps.doc;
    const resolveUrl = typeof deps.resolveUrl === "function" ? deps.resolveUrl : (p) => p;
    const now = typeof deps.now === "function" ? deps.now : () => Date.now();
    const view = doc.defaultView;
    const raf = typeof deps.requestFrame === "function" ? deps.requestFrame : typeof view?.requestAnimationFrame === "function" ? view.requestAnimationFrame.bind(view) : (cb) => (
      /** @type {any} */
      setTimeout(() => cb(now()), Math.round(1e3 / CHARA_LIVE_FPS))
    );
    const caf = typeof deps.cancelFrame === "function" ? deps.cancelFrame : typeof view?.cancelAnimationFrame === "function" ? view.cancelAnimationFrame.bind(view) : (id) => clearTimeout(id);
    const getHeat = typeof deps.getHeatLevel === "function" ? deps.getHeatLevel : () => 0;
    const talk = deps.talk !== false;
    const backchannels = Array.isArray(deps.backchannels) && deps.backchannels.length ? deps.backchannels : CHARA_BACKCHANNELS;
    const reducedMotion = typeof deps.reducedMotion === "boolean" ? deps.reducedMotion : typeof doc.defaultView?.matchMedia === "function" && doc.defaultView.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const STYLE_ID2 = "nlcl-stage-style";
    if (!doc.getElementById(STYLE_ID2)) {
      const style = doc.createElement("style");
      style.id = STYLE_ID2;
      style.textContent = charaLiveStageCss();
      (doc.head || doc.documentElement).appendChild(style);
    }
    const { root, badge, nodes } = buildCharaLiveStageDom(doc, resolveUrl);
    (deps.mount || doc.body || doc.documentElement).appendChild(root);
    const preloadedImages = preloadCharaLiveImages(doc, resolveUrl);
    const state = makeInitialCharaLiveState();
    let lastReactionAt = -Infinity;
    let visible = true;
    let lastDrawMs = -Infinity;
    let needsImmediateDraw = false;
    let speakingChara = (
      /** @type {import('./charaLiveState.js').CharaId|null} */
      null
    );
    let frameId = 0;
    let destroyed = false;
    let cheerUntilMs = 0;
    const tick = () => {
      if (destroyed) return;
      if (!visible) {
        frameId = 0;
        return;
      }
      const t = now();
      if (!needsImmediateDraw && t - lastDrawMs < FRAME_MIN_GAP_MS) {
        frameId = raf(tick);
        return;
      }
      needsImmediateDraw = false;
      lastDrawMs = t;
      if (cheerUntilMs && t >= cheerUntilMs) {
        cheerUntilMs = 0;
        root.classList.remove("is-cheering");
        badge.hidden = true;
      }
      expireCharaModes(state, t);
      const model = buildCharaLiveRenderModel(state, {
        timeMs: t,
        heatLevel: getHeat(),
        reducedMotion
      });
      applyCharaLiveFrame(nodes, model, resolveUrl);
      frameId = raf(tick);
    };
    frameId = raf(tick);
    return {
      root,
      /** 先読み画像。GC 回収を防ぐために参照を公開して保持する(見た目には使わない)。 */
      preloadedImages,
      /**
       * 表示/非表示。会場を閉じている間は描画を止める(閉じても CPU を食い続けない)。
       * destroy と違い、再び true にすれば同じ状態から復帰する。
       * @param {boolean} next
       */
      setVisible(next) {
        const on = next !== false;
        if (on === visible) return;
        visible = on;
        root.hidden = !on;
        if (on && !frameId && !destroyed) {
          frameId = raf(tick);
        }
      },
      /**
       * コメントの読み上げが **実際に鳴り始めた** ときに呼ぶ(voicePlayer の onAudioStart)。
       * 3 体のうち 1 体が相槌を入れる。
       *
       * @param {{ commentKey: string, text?: string }} input
       */
      onCommentSpoken(input) {
        if (!talk) return;
        const t = now();
        if (t - lastReactionAt < REACTION_MIN_GAP_MS) return;
        const key = String(input?.commentKey ?? "");
        const idx = Math.abs(hashForPick(key)) % backchannels.length;
        const who = triggerCharaReaction(state, {
          commentKey: key,
          text: backchannels[idx],
          nowMs: t,
          // 読み上げが終わるまで相槌を出し続けたいので長めに取り、onAudioEnd で早めに畳む。
          durationMs: Math.max(REACT_MIN_MS, 6e3)
        });
        if (who) {
          lastReactionAt = t;
          speakingChara = who;
          needsImmediateDraw = true;
        }
      },
      /**
       * 読み上げが終わった/破棄されたときに呼ぶ(onAudioEnd / onDropped)。
       * 相槌を畳んで idle に戻す。声が止まっているのに口が動き続ける事故を防ぐ。
       */
      onCommentSpokenEnd() {
        if (!speakingChara) return;
        const slot = state.slots[speakingChara];
        if (slot && slot.mode === "react") {
          slot.untilMs = now();
          needsImmediateDraw = true;
        }
        speakingChara = null;
      },
      /**
       * お祝い(応援コメント100件など): 3人が笑顔+口パクで弾み、「100件!」のバッジを出す(2026-10-17)。
       *   しゃべる設定(talk)とは独立=talk:false でも効く。お祝い中の再入は無視する(キューしない=節目は数分に1回以下)。
       *   判定(いつ祝うか)は charaLiveCheerTrigger.js、ここは見せるだけ。
       * @param {{ milestone: number }} input
       * @returns {boolean} 始めたか(中・不正・非表示は false)
       */
      cheer(input) {
        if (destroyed || !visible) return false;
        const label = cheerLabel(input?.milestone);
        if (!label) return false;
        const t = now();
        if (cheerUntilMs && t < cheerUntilMs) return false;
        cheerUntilMs = t + CHEER_DURATION_MS;
        triggerCharaCheer(state, { nowMs: t, durationMs: CHEER_DURATION_MS });
        badge.textContent = label;
        badge.hidden = false;
        root.classList.remove("is-cheering");
        void root.offsetWidth;
        root.classList.add("is-cheering");
        needsImmediateDraw = true;
        return true;
      },
      /**
       * 配信者が「〇〇さん、〇〇だよね」と話しかけたときに呼ぶ。
       * 名指しがあればその子が、無ければ誰かが答える。
       *
       * @param {{ prompt: string, answer?: string, durationMs?: number }} input
       * @returns {string} 答える子の id
       */
      onStreamerAddressed(input) {
        if (!talk) return "";
        needsImmediateDraw = true;
        return triggerCharaAnswer(state, {
          prompt: String(input?.prompt ?? ""),
          answer: String(input?.answer ?? ""),
          nowMs: now(),
          durationMs: input?.durationMs
        });
      },
      /**
       * AI が考え始めたときに呼ぶ。返り値の id を endThinking に渡すと確実に閉じられる。
       * @param {{ prompt?: string, charaId?: string|null }} [input]
       * @returns {string}
       */
      beginThinking(input = {}) {
        if (!talk) return "";
        needsImmediateDraw = true;
        return startCharaThinking(state, {
          nowMs: now(),
          prompt: input.prompt,
          charaId: (
            /** @type {any} */
            input.charaId ?? null
          )
        });
      },
      /**
       * AI の思考が終わったときに呼ぶ。**必ず finally で呼ぶこと**
       * (例外で抜けると考え込んだまま固まる)。
       * @param {{ charaId?: string|null }} [input]
       * @returns {string[]}
       */
      endThinking(input = {}) {
        if (!talk) return [];
        needsImmediateDraw = true;
        return endCharaThinking(state, {
          nowMs: now(),
          charaId: (
            /** @type {any} */
            input.charaId ?? null
          )
        });
      },
      destroy() {
        destroyed = true;
        if (frameId) caf(frameId);
        frameId = 0;
        root.remove();
      }
    };
  }
  function hashForPick(s) {
    let h = 0;
    const str = String(s ?? "");
    for (let i = 0; i < str.length; i += 1) {
      h = Math.imul(h, 31) + str.charCodeAt(i) | 0;
    }
    return h;
  }

  // src/lib/venueHoverCardProbe.js
  function venueHoverCardPresenceVerdict(census) {
    const c = census && typeof census === "object" ? census : {};
    const text = String(c.text || "").trim();
    const buildId = String(c.buildId || "").trim();
    const buildPart = buildId ? `（ビルド ${buildId}）` : "（ビルドID不明）";
    if (c.cardExists !== true) {
      return {
        visible: false,
        reason: "no-card",
        line: `⚪ カードがまだ出ていません。会場のアイコンにカーソルを合わせてから実行してください${buildPart}`
      };
    }
    if (c.elementExists !== true) {
      return {
        visible: false,
        reason: "element-missing",
        line: `🔴 一言の置き場所そのものがありません${buildPart}。★古いコードが動いている（拡張をリロードしていない）か、DOM を組む配線が抜けています。まず chrome://extensions でリロード→放送タブを F5 して、それでも同じならコードの問題です`
      };
    }
    if (text === "") {
      return {
        visible: false,
        reason: "empty-text",
        line: "⚪ 置き場所はありますが文字が空です。★発言もギフトも無い人（＝まだ何もしていない人）だとここは空になります。発言のある人のアイコンで試してください"
      };
    }
    if (c.hidden === true || c.displayNone === true) {
      const why = c.hidden === true ? "hidden 属性が立っています" : "CSS で display:none になっています";
      return {
        visible: false,
        reason: "hidden",
        line: `🔴 文字は入っているのに見えません（${why}）。文字: 「${text}」${buildPart}`
      };
    }
    return {
      visible: true,
      reason: "ok",
      line: `✅ 出ています: 「${text}」${buildPart}`
    };
  }

  // src/lib/venueHoverFacts.js
  var VENUE_HOVER_SOURCE_REGISTERED = "registered";
  var VENUE_HOVER_SOURCE_ROSTER = "roster";
  var VENUE_HOVER_SOURCE_NONE = "none";
  function toCount2(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
  }
  function toStamp(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.floor(n);
  }
  function toTexts2(v) {
    if (!Array.isArray(v)) return [];
    return v.filter((t) => typeof t === "string" && t !== "");
  }
  function resolveVenueHoverFacts(input) {
    const i = input && typeof input === "object" ? input : {};
    const registered = i.registered && typeof i.registered === "object" ? i.registered : null;
    if (registered && Number.isFinite(Number(registered.count))) {
      return {
        count: toCount2(registered.count),
        giftCount: toCount2(registered.giftCount),
        venueRank: toCount2(registered.venueRank),
        lastAt: toStamp(registered.lastAt),
        lastText: typeof registered.lastText === "string" ? registered.lastText : "",
        recentTexts: toTexts2(registered.recentTexts),
        // 発言の証拠(2026-10-16): 席の participant が持つ speech をそのまま。無い旧呼び出しは不明(count は並び/VIP 用で発言の根拠にしない)。
        speech: registered.speech || SPEECH_UNKNOWN,
        source: VENUE_HOVER_SOURCE_REGISTERED
      };
    }
    const roster = i.rosterEntry && typeof i.rosterEntry === "object" ? i.rosterEntry : null;
    if (roster && Number.isFinite(Number(roster.commentCount))) {
      return {
        count: toCount2(roster.commentCount),
        giftCount: toCount2(roster.giftCount),
        venueRank: toCount2(roster.venueRank),
        // 生名簿は最後に見かけた時刻を lastSeen で持つ。lastAt を持つ形も許す。
        lastAt: toStamp(roster.lastSeen) || toStamp(roster.lastAt),
        lastText: typeof roster.lastText === "string" ? roster.lastText : "",
        recentTexts: toTexts2(roster.recentTexts),
        speech: speechEvidenceFromRoster(roster),
        source: VENUE_HOVER_SOURCE_ROSTER
      };
    }
    return {
      count: null,
      giftCount: null,
      venueRank: 0,
      lastAt: 0,
      lastText: "",
      recentTexts: [],
      // 名簿にも席にも居ない=知らない。鏡のセルが stats.c/本文を持っていればそれだけ(時刻は作らない)。
      speech: i.mirrorCell && typeof i.mirrorCell === "object" ? speechEvidenceFromMirrorCell(i.mirrorCell) : SPEECH_UNKNOWN,
      source: VENUE_HOVER_SOURCE_NONE
    };
  }

  // src/lib/venuePickupRing.js
  var PICKUP_RING_MAX = 40;
  var PICKUP_RING_MAX_AGE_MS = 12e4;
  function appendPickupRows(ring, speeches, nowMs, opts = {}) {
    const max = Math.max(1, Math.floor(Number(opts.max) || PICKUP_RING_MAX));
    const maxAge = Math.max(1e3, Number(opts.maxAgeMs) || PICKUP_RING_MAX_AGE_MS);
    const now = Number(nowMs);
    const base = Array.isArray(ring) ? ring.slice() : [];
    const seen = new Set(base.map((r) => String(r.key || "")).filter(Boolean));
    for (const s of Array.isArray(speeches) ? speeches : []) {
      const text = String(s?.text ?? "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const key = String(s?.key ?? "").trim();
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      let speaker = null;
      try {
        speaker = typeof opts.resolveSpeaker === "function" ? opts.resolveSpeaker(s) : null;
      } catch {
        speaker = null;
      }
      base.push({ key, userId: String(s?.userId ?? "").trim(), name: String(s?.name ?? "").trim(), text, capturedAt: Number.isFinite(now) && now > 0 ? now : 0, kind: "comment", speaker });
    }
    const fresh = Number.isFinite(now) && now > 0 ? base.filter((r) => now - toEpochMs(r.capturedAt) <= maxAge) : base;
    return fresh.length > max ? fresh.slice(fresh.length - max) : fresh;
  }

  // src/lib/venuePickupSpeaker.js
  function isHttpUrl3(v) {
    return typeof v === "string" && /^https?:\/\//i.test(v.trim());
  }
  function resolvePickupSpeaker(speech, ctx = {}) {
    const uid = String(speech?.userId ?? "").trim();
    const rawName = String(speech?.name ?? "").replace(/\s+/g, " ").trim() || String(ctx.profileNickname ?? "").replace(/\s+/g, " ").trim();
    if (uid && isNumericNicoUserId(uid)) {
      const observed = isHttpUrl3(ctx.profileAvatarUrl) ? String(ctx.profileAvatarUrl).trim() : "";
      return {
        uid,
        anon: false,
        name: rawName,
        idLine: `ID:${uid}`,
        href: nicoUserPageUrl(uid) || "",
        avatar: observed || deriveAvatarUrlFromUid(uid) || anonymousIdenticonDataUrl(uid, 64),
        fallbackAvatar: anonymousIdenticonDataUrl(uid, 64)
      };
    }
    const key = uid || rawName || "anonymous";
    return {
      uid,
      anon: true,
      name: anonymousDisplayLabel(key),
      idLine: "",
      href: "",
      avatar: anonymousIdenticonDataUrl(key, 64),
      fallbackAvatar: anonymousIdenticonDataUrl(key, 64)
    };
  }

  // src/lib/charaLiveCensus.js
  function collectCharaLiveCensus(doc) {
    const out = {
      mounted: false,
      parent: "",
      inVenueStage: false,
      hidden: false,
      display: "",
      visibility: "",
      opacity: "",
      zIndex: "",
      rect: { x: 0, y: 0, w: 0, h: 0 },
      charaCount: 0,
      imgLoaded: 0,
      imgBroken: 0,
      coveredBy: ""
    };
    const el = doc?.querySelector?.(".nlcl-stage");
    if (!el) return out;
    out.mounted = true;
    out.parent = String(el.parentElement?.className || "(なし)");
    out.inVenueStage = !!el.closest?.(".nlsb-stage");
    out.hidden = el.hasAttribute?.("hidden") === true;
    const view = doc.defaultView;
    if (view?.getComputedStyle) {
      const cs = view.getComputedStyle(el);
      out.display = cs.display;
      out.visibility = cs.visibility;
      out.opacity = cs.opacity;
      out.zIndex = cs.zIndex;
    }
    if (typeof el.getBoundingClientRect === "function") {
      const r = el.getBoundingClientRect();
      out.rect = {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height)
      };
    }
    const charas = el.querySelectorAll?.(".nlcl-chara") || [];
    out.charaCount = charas.length;
    for (const c of Array.from(charas)) {
      const img = c.querySelector?.("img");
      if (!img) continue;
      if (img.complete && img.naturalWidth > 0) out.imgLoaded += 1;
      else if (img.complete) out.imgBroken += 1;
    }
    if (out.rect.w > 0 && typeof doc.elementFromPoint === "function") {
      const cx = out.rect.x + out.rect.w / 2;
      const cy = out.rect.y + out.rect.h / 2;
      const top = doc.elementFromPoint(cx, cy);
      if (top && !el.contains(top) && top !== el) {
        out.coveredBy = String(top.className || top.tagName || "?");
      }
    }
    return out;
  }
  function charaLiveVerdict(c) {
    const ng = (reason) => ({
      visible: false,
      reason,
      line: `キャラライブ ❌ ${reason}`
    });
    if (!c || !c.mounted) return ng("DOMに存在しない(起動コードが走っていない)");
    if (!c.inVenueStage) return ng(`会場ステージの外にある(親=${c.parent})`);
    if (c.hidden) return ng("hidden 属性が付いている(会場が閉じている扱い)");
    if (c.display === "none") return ng("display:none になっている");
    if (c.visibility === "hidden") return ng("visibility:hidden になっている");
    if (c.opacity === "0") return ng("opacity:0 になっている");
    if (c.rect.w === 0 || c.rect.h === 0) return ng("大きさが 0(レイアウトされていない)");
    if (c.charaCount === 0) return ng("中にキャラが1体もいない");
    if (c.imgLoaded === 0) return ng(`画像が1枚も読めていない(壊れ${c.imgBroken}枚)`);
    if (c.coveredBy) return ng(`「${c.coveredBy}」に覆われている(z-index=${c.zIndex})`);
    return {
      visible: true,
      reason: "",
      line: `キャラライブ ✅ ${c.charaCount}体 表示中 (z=${c.zIndex} ${c.rect.w}x${c.rect.h} @${c.rect.x},${c.rect.y} 画像${c.imgLoaded}枚)`
    };
  }

  // src/lib/parseGiftComment.js
  function parseGiftCommentText(text) {
    if (typeof text !== "string") return null;
    const trimmed = text.trim();
    if (!trimmed) return null;
    const re = /^(?:【[^】]*】\s*)*(.+?)さんがギフト[「『](.+?)[（(](\d+)\s*pt[)）][」』]を贈りました/;
    const m = trimmed.match(re);
    if (!m) return null;
    const sender = m[1].trim();
    const item = m[2].trim();
    const point = parseInt(m[3], 10);
    if (!sender || !item || !Number.isFinite(point) || point < 0) return null;
    const rankMatch = trimmed.match(/【ギフト貢献(\d+)位】/);
    if (rankMatch) {
      const rank = parseInt(rankMatch[1], 10);
      if (Number.isFinite(rank) && rank > 0) {
        return { sender, item, point, rank };
      }
    }
    return { sender, item, point };
  }
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

  // src/lib/giftThrowProjectile.js
  var GIFT_THROW_MAX_CONCURRENT = 8;
  var GIFT_THROW_ARC_LIFT_PX = 90;
  var GIFT_THROW_DURATION_MS = Object.freeze({ small: 1500, medium: 1750, large: 2050, mega: 2400 });
  var GIFT_THUMBNAIL_BASE = "https://secure-dcdn.cdn.nimg.jp/nicoad/res/nage/thumbnail/";
  function resolveGiftImageUrl(itemId) {
    const s = String(itemId ?? "").trim();
    if (!s) return "";
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{2,79}$/.test(s)) return "";
    return `${GIFT_THUMBNAIL_BASE}${s}.png`;
  }
  function tierFromPoints(point) {
    const pt = Number(point) || 0;
    if (pt >= 5e3) return "mega";
    if (pt >= 500) return "large";
    if (pt >= 50) return "medium";
    return "small";
  }
  function clampLabel(s, max = 14) {
    const str = String(s || "").trim();
    const chars = Array.from(str);
    return chars.length <= max ? str : `${chars.slice(0, max).join("")}…`;
  }
  function resolveGiftProjectile(parsed, kind) {
    if (!parsed || typeof parsed !== "object") return null;
    const point = Number(parsed.point) || 0;
    const tier = tierFromPoints(point);
    const durationMs = GIFT_THROW_DURATION_MS[tier];
    if (kind === "ad") {
      if (point <= 0) return null;
      return {
        kind: "ad",
        emoji: "📣",
        label: `${point.toLocaleString("ja-JP")}pt`,
        point,
        tier,
        durationMs,
        imageUrl: ""
        // 広告は投げ物画像なし(絵文字+ptで見せる)
      };
    }
    const item = String(parsed.item || "").trim();
    return {
      kind: "gift",
      emoji: "🎁",
      label: item ? clampLabel(item) : "ギフト",
      point,
      tier,
      durationMs,
      imageUrl: resolveGiftImageUrl(parsed.itemId)
      // item_id があれば実画像・無ければ ''
    };
  }
  function resolveGiftThrowPath(start, target, lift = GIFT_THROW_ARC_LIFT_PX) {
    const sx = Number(start?.x) || 0;
    const sy = Number(start?.y) || 0;
    const tx = Number(target?.x) || 0;
    const ty = Number(target?.y) || 0;
    const dx = tx - sx;
    const dy = ty - sy;
    const midX = dx * 0.6;
    const midY = dy * 0.6 - (Number(lift) || 0);
    return { startX: sx, startY: sy, dx, dy, midX, midY };
  }
  function canLaunchGiftThrow(activeCount, max = GIFT_THROW_MAX_CONCURRENT) {
    const n = Number(activeCount) || 0;
    const cap = Number(max) || 0;
    return n < cap;
  }
  function resolveVisibleThrowPoint(point, layerSize, kind) {
    const w = Number(layerSize?.width) || 0;
    const h = Number(layerSize?.height) || 0;
    const px = Number(point?.x);
    const py = Number(point?.y);
    const isFinitePoint = Number.isFinite(px) && Number.isFinite(py);
    const isOriginZero = px === 0 && py === 0;
    const hasKnownSize = w > 0 && h > 0;
    const isOutOfBounds = hasKnownSize && (px < 0 || py < 0 || px > w || py > h);
    const usable = isFinitePoint && !isOriginZero && !isOutOfBounds;
    if (usable) {
      return { x: px, y: py, usedFallback: false };
    }
    const fw = hasKnownSize ? w : 800;
    const fh = hasKnownSize ? h : 600;
    if (kind === "origin") {
      return { x: Math.round(fw * 0.5), y: Math.max(40, fh - 80), usedFallback: true };
    }
    return { x: Math.round(fw * 0.5), y: Math.round(fh * 0.4), usedFallback: true };
  }

  // src/lib/parseArrivalComment.js
  var BRACKET = "[「『]([^」』]+)[」』]";
  var COUNT = "(\\d+)人";
  var TAIL = "が来場しました$";
  var RE_PREFERENCE = new RegExp(`^放送者の好み${BRACKET}に興味のある${COUNT}${TAIL}`);
  var RE_DICTIONARY_SINGLE = new RegExp(`^大百科記事${BRACKET}から${COUNT}${TAIL}`);
  var RE_LIKE_SINGLE = new RegExp(`^${BRACKET}が好きな${COUNT}${TAIL}`);
  function stripTail(s) {
    return s.replace(/が来場しました$/, "");
  }
  function splitCommaItems(bodyNoTail) {
    const parts = bodyNoTail.split("、").map((s) => s.trim()).filter(Boolean);
    return parts;
  }
  function parseArrivalCommentText(text) {
    if (typeof text !== "string") return null;
    const trimmed = text.trim();
    if (!trimmed) return null;
    if (!/が来場しました$/.test(trimmed)) return null;
    const mPref = trimmed.match(RE_PREFERENCE);
    if (mPref) {
      const keyword = mPref[1].trim();
      const count = parseInt(mPref[2], 10);
      if (keyword && Number.isFinite(count) && count > 0) {
        return { entries: [{ keyword, count, source: "interest" }], totalCount: count };
      }
      return null;
    }
    const bodyNoTail = stripTail(trimmed);
    if (/^大百科記事/.test(bodyNoTail)) {
      const items = splitCommaItems(bodyNoTail);
      const entries = [];
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        const re = i === 0 ? /^大百科記事[「『]([^」』]+)[」』]から(\d+)人$/ : /^[「『]([^」』]+)[」』]から(\d+)人$/;
        const m = item.match(re);
        if (!m) return null;
        const keyword = m[1].trim();
        const count = parseInt(m[2], 10);
        if (!keyword || !Number.isFinite(count) || count <= 0) return null;
        entries.push({ keyword, count, source: "dictionary" });
      }
      if (entries.length === 0) return null;
      return { entries, totalCount: entries.reduce((s, e) => s + e.count, 0) };
    }
    if (/^[「『]/.test(bodyNoTail)) {
      const items = splitCommaItems(bodyNoTail);
      const entries = [];
      for (const item of items) {
        const m = item.match(/^[「『]([^」』]+)[」』]が好きな(\d+)人$/);
        if (!m) return null;
        const keyword = m[1].trim();
        const count = parseInt(m[2], 10);
        if (!keyword || !Number.isFinite(count) || count <= 0) return null;
        entries.push({ keyword, count, source: "like" });
      }
      if (entries.length === 0) return null;
      return { entries, totalCount: entries.reduce((s, e) => s + e.count, 0) };
    }
    return null;
  }

  // src/lib/arrivalEffect.js
  var ARRIVAL_EFFECT_CD_MS = 2e4;
  var ARRIVAL_EMOJI = "🚪";
  var LABEL_MAX = 14;
  function clampLabel2(s, max = LABEL_MAX) {
    const str = String(s || "").trim();
    const chars = Array.from(str);
    return chars.length <= max ? str : `${chars.slice(0, max).join("")}…`;
  }
  function buildArrivalLabel(parsed) {
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    if (entries.length === 0) return "来場";
    const first = clampLabel2(entries[0].keyword);
    if (entries.length === 1) return first;
    return `${first} ほか${entries.length - 1}件`;
  }
  function arrivalSoundKindForCount(_totalCount) {
    return "hold_lamp";
  }
  function shouldFireArrivalEffect(lastAtMs, nowMs, cdMs = ARRIVAL_EFFECT_CD_MS) {
    const last = Number(lastAtMs) || 0;
    const now = Number(nowMs) || 0;
    return now - last >= cdMs;
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
    const norm2 = (liveId) => String(liveId || "").trim().toLowerCase();
    let chain = Promise.resolve();
    const link = {
      holder,
      /** 読んでいる間の合図(定期的に呼ぶ)。 */
      beat(liveId) {
        const lv = norm2(liveId);
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
        const lv = norm2(liveId);
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

  // src/extension/venueBar.js
  var VENUE_ROSTER_ENABLED = false;
  var VENUE_SPEECH_PANEL_MAX = 1e3;
  var ROOT_ID = "nlsb-venue-root";
  var STYLE_ID = "nlsb-venue-style";
  var AGGREGATE_INTERVAL_MS = 3e4;
  var SPEECH_INTERVAL_MS = 800;
  var BUBBLE_LIFETIME_MS = 4e3;
  var BUBBLE_FADE_MS = 600;
  var BUBBLE_MAX = 12;
  var BUBBLE_FLOW_WINDOW_MS = 3e3;
  var BUBBLE_TEXT_MAX = 36;
  var VENUE_LAYOUT_CLASSES = [
    "nlsb-mode-empty",
    "nlsb-mode-vip",
    "nlsb-mode-normal",
    "nlsb-mode-packed"
  ];
  var VENUE_LANE_GUIDES_EXACT_COPY = true;
  var VENUE_FALLBACK_GIFT_EMPTY_HTML = buildVenueFallbackGiftEmptyNoteHtml();
  var venueAvatarFallbackFor = identiconFallbackForAvatarUrl;
  var venueAvatarLoadGuard = createSupportAvatarLoadGuard({
    fallbackSrc: NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS,
    fallbackSrcFor: venueAvatarFallbackFor,
    onFallbackApplied: applyStoryAvatarTvFallbackClass,
    onRemoteSuccess: removeStoryAvatarTvFallbackClass,
    retryPolicy: {}
  });
  var venuePersonTileIo = {
    storyAvatarLoadGuard: venueAvatarLoadGuard,
    isHttpOrHttpsUrl,
    storyTileUsesYukkuriTvStyle
  };
  var STORY_GUIDE_FACE_LINK = "images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png";
  var STORY_GUIDE_FACE_KONTA = "images/yukkuri-charactore-english/konta/kitsune-yukkuri-half-eyes-mouth-closed.png";
  var STORY_GUIDE_FACE_GIFT = STORY_GUIDE_FACE_KONTA;
  var STORY_GUIDE_FACE_TANU = "images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-half-eyes-mouth-closed.png";
  function resolveVenueAssetUrl(rel3) {
    try {
      return typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.getURL === "function" ? chrome.runtime.getURL(rel3) : rel3;
    } catch {
      return rel3;
    }
  }
  var venueLanePickCtx = {
    yukkuriSrc: resolveVenueAssetUrl(STORY_GUIDE_FACE_LINK),
    tvSrc: NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS,
    anonymousIdenticonEnabled: true
  };
  function buildVenuePersonTile(participant, fallbackLabel = "会場") {
    const item = venueSeatEntryToLaneItem(
      { seatIndex: 0, participant: (
        /** @type {any} */
        participant
      ) },
      { fallbackLabel, pickCtx: venueLanePickCtx }
    );
    if (item) {
      return buildPersonTileEl(
        { displaySrc: item.displaySrc, title: item.title, meta: item.meta, entry: item.entry },
        venuePersonTileIo
      );
    }
    return buildPersonTileEl(
      {
        displaySrc: "",
        title: anonymousDisplayLabel(String(fallbackLabel)),
        meta: { idLine: "", nameLine: "" },
        entry: { userId: "" }
      },
      venuePersonTileIo
    );
  }
  var VENUE_CSS = `
  /* v0.1.1650: hidden 属性の安全網(会場配下)。.nlsb-roster-panel / .nl-story-userlane 等の display が UA の [hidden] に勝って残るのを型ごと防ぐ。 */
  .nlsb-root [hidden] {
    display: none !important;
  }
  .nlsb-root {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    pointer-events: none;
    color: #f7f7f7;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  /*
   * v0.1.1648: 会場を開いている間も、透明な所のクリックはニコ生の画面へ通す。
   *   以前は root/stage/stage-layout が全面 pointer-events:auto で、映像・再生ボタン・音量・コメント入力欄の上を会場が覆い、
   *   会場を閉じるまで押せなかった(実測: 映像の中心を elementFromPoint すると .nlsb-root 配下が返った)。
   *   → 全面を覆う3枚(root / stage / stage-layout)は none。押す必要がある所(ヘッダー・席・パネル・トグル)だけ auto を明示する。
   *   pointer-events は子へ継承されるので、auto の箱(.nlsb-seating)の中身はそのまま押せる。
   */
  .nlsb-root.nlsb-is-open {
    pointer-events: none;
  }
  /* ★2026-08-11 v0.1.1323 ユーザー報告「会場モードにするボタンがないかも？どこ？」:
     見つけられなかったのは position:absolute + 暗色 + 13px の三重苦だった。
       ① absolute = .nlsb-root(ページ内)の右下 = スクロールすると流れて画面外へ出る
       ② 背景 rgba(20,24,30,.82) はニコ生の暗いページに溶ける(同系色)
       ③ 13px・パディング7px = 視線が拾う前に他のUIに埋もれる
     → fixed で画面右下に常駐させ、桜ピンク(DESIGN.md の主アクセント)で必ず目に入るようにする。
     ★会場を開いている間は隠す(html.nlsb-venue-open で制御)。閉じるのはヘッダーの「✕ 閉じる」。 */
  .nlsb-toggle {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 2147483000;
    min-height: 44px;
    padding: 12px 20px;
    border: 2px solid rgba(255, 255, 255, 0.9);
    border-radius: 999px;
    background: linear-gradient(135deg, #ff8fb1, #ff6f9c);
    color: #fff;
    font-weight: 700;
    letter-spacing: 0.02em;
    box-shadow: 0 6px 20px rgba(214, 51, 108, 0.45), 0 2px 6px rgba(0, 0, 0, 0.25);
    cursor: pointer;
    pointer-events: auto;
    font: inherit;
    font-size: 15px;
    font-weight: 700;
    line-height: 1;
    transition: transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease;
  }
  .nlsb-toggle:hover {
    background: linear-gradient(135deg, #ff7ea6, #ff5e91);
    transform: translateY(-2px);
    box-shadow: 0 10px 26px rgba(214, 51, 108, 0.55), 0 2px 6px rgba(0, 0, 0, 0.25);
  }
  /* 会場を開いている間はボタンを隠す(ヘッダーの「✕ 閉じる」が閉じる手段)。
     fixed 化で最前面に来たため、開いている間も出したままだと会場の上に浮いて邪魔になる。
     ★セレクタは html.nlsb-venue-open(既存の文字列契約・content-entry.js:2923 が
       「venueBar.js が open 中に立てる documentElement クラス」として wiring テストで固定)。
       会場側の独自クラスを新設しない=契約を1本に保つ。 */
  html.nlsb-venue-open .nlsb-toggle {
    display: none;
  }
  /*
   * v0.1.1654: 「しまう/戻す」(tuck)。コメント入力のあいだ、会場を閉じずに箱だけ一時的に隠す。
   *   ・ニコ生のコメント入力欄はページ側の固定位置で、会場の箱(画面の下端固定)が高さ×表示幅しだいで覆う(実測: 9格子のうち5つ)。
   *   ・✕で閉じると DOM と集計を捨てて再描画になる(clearDisplay)。しまうだけなら集計・DOM・席順は保持され、戻すのは瞬時。
   *   ・hidden 属性は使わない(v0.1.1650 の安全網で display:none になり、席の幅の計算が変わる)=visibility で隠す(レイアウトは保つ)。
   *   ・トグルは root の子。html.nlsb-venue-open 側の新しいクラスは作らず(契約を1本に保つ)、root の is-tucked で詳細度を上げて出す。
   *   ・LANE_CSS_SYNC 区間の外。
   */
  .nlsb-root.nlsb-is-open.nlsb-is-tucked .nlsb-stage {
    visibility: hidden;
    pointer-events: none;
  }
  html.nlsb-venue-open .nlsb-root.nlsb-is-tucked .nlsb-toggle {
    display: inline-block;
  }
  /* 動きを減らす設定の人には拡大アニメを出さない(a11y)。 */
  @media (prefers-reduced-motion: reduce) {
    .nlsb-toggle {
      transition: none;
    }
    .nlsb-toggle:hover {
      transform: none;
    }
  }
  .nlsb-toggle:focus-visible {
    outline: 2px solid #8dc8ff;
    outline-offset: 2px;
  }
  /* v0.1.1230 ピックアップ枠(BSP風): 会場ヘッダー直下に常設。高さを先に確保して
     出たり消えたりで下の段が動かないようにする(ユーザー報告「上下に動く」の対策と同趣旨)。 */
  .nlsb-pickup {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    margin: 4px 0 6px;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid rgba(255, 190, 90, 0.55);
    /*
     * ★v0.1.1337: 地の色を【不透明で】敷く(実機で読めなくなっていた)。
     *   旧: linear-gradient のみ = 透明度 0.22〜0.06 の帯だけ。
     *   会場の暗い背景の上なら成立するが、後ろにニコ生のページ(カテゴリタグ等)が
     *   透けると文字と背景が重なって【判読不能】になる。実機スクリーンショットで確認。
     *   さらに data-empty の opacity:0.55 が乗ると実質 0.03〜0.12 まで薄くなっていた。
     *   → 不透明の下地(#2a2118 相当)を先に置き、その上に既存のグラデを重ねる。
     *     色は会場の暗色系に馴染ませる(白背景でも黒背景でも読める濃さ)。
     */
    background-color: rgba(38, 30, 20, 0.92);
    background-image: linear-gradient(90deg, rgba(255, 176, 62, 0.28), rgba(255, 176, 62, 0.1));
    color: #fff5e8;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
    font-size: 13px;
    line-height: 1.35;
  }
  /* ★空のときも【薄くしすぎない】(0.55 だと下地ごと透けて読めなくなる)。 */
  .nlsb-pickup[data-empty='1'] { opacity: 0.85; }
  .nlsb-pickup__badge {
    flex: 0 0 auto;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 2px 6px;
    border-radius: 999px;
    background: rgba(255, 152, 0, 0.9);
    color: #fff;
  }
  .nlsb-pickup__face {
    flex: 0 0 auto;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    object-fit: cover;
    background: rgba(255, 255, 255, 0.12);
    box-shadow: 0 0 0 1px rgba(255, 245, 232, 0.45);
  }
  .nlsb-pickup__face[hidden] { display: none; }
  .nlsb-pickup__main {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .nlsb-pickup__body {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }
  .nlsb-pickup__meta {
    flex: 0 0 auto;
    font-size: 11px;
    opacity: 0.8;
    color: inherit;
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nlsb-pickup__meta:empty { display: none; }
  a.nlsb-pickup__meta[href] { text-decoration: underline; text-underline-offset: 2px; }
  .nlsb-stage {
    position: fixed;
    inset: 0;
    z-index: 1;
    display: grid;
    box-sizing: border-box;
    padding: clamp(52px, 7vh, 76px) clamp(14px, 3vw, 44px) 64px;
    overflow: hidden;
    /* FX(ビネット等)の mix-blend を中央映像へ漏らさないため独立スタッキング(会議確定)。 */
    isolation: isolate;
    /*
     * ユーザー方針(2026-06-13 強)「配信の画面と実際の画面にスモークをかけないで・ちゃんと
     * 見たい」: 全面を覆う暗幕(linear-gradient)を撤去。背景は透明にして、後ろのニコ生映像と
     * 本家UIをそのまま見せる。会場の雰囲気は上端・下端の淡いステージ照明だけで出し、中央の
     * 映像にはかけない(上下のグラデは画面端で transparent に消えるので映像本体は素通し)。
     */
    /*
     * 2026-06-14 星野アイデア会議2「熱量の色温度」: 下端(客席)の照明色をコメント速度連動で
     * 注入する。--nlsb-heat-color(涼=青紫→暖=オレンジ)/ --nlsb-heat-opacity(過疎=ほぼ透明→
     * 怒涛=濃い)を JS が更新。映像中央は素通しのまま(下端だけ色温度が変わる)。
     * 既定は涼色・薄めにして未設定時も従来の雰囲気を壊さない。
     */
    --nlsb-heat-color: rgb(120, 130, 200);
    --nlsb-heat-opacity: 0.12;
    background:
      radial-gradient(ellipse 70% 24% at 50% 0%, rgba(120, 165, 224, 0.16), transparent 70%),
      radial-gradient(
        ellipse 96% 30% at 50% 100%,
        color-mix(in srgb, var(--nlsb-heat-color) calc(var(--nlsb-heat-opacity) * 100%), transparent),
        transparent 74%
      );
    opacity: 0;
    transform: translateY(18px);
    visibility: hidden;
    pointer-events: none;
    overscroll-behavior: contain;
    transition:
      opacity 180ms ease,
      transform 180ms ease,
      visibility 0s linear 180ms,
      background 800ms ease;
  }
  .nlsb-root.nlsb-is-open .nlsb-stage {
    opacity: 1;
    transform: translateY(0);
    visibility: visible;
    pointer-events: none; /* v0.1.1648: 透明な所は素通し(押せる箱は個別に auto) */
    transition-delay: 0s;
  }
  /*
   * 後方ビネット(ライブ演出会議 確定①・プロの「空席を闇に沈める」術のWeb再現)。
   * ⚠️ユーザー方針「中央の配信映像にスモークをかけない」を厳守: 中央は大きく transparent で
   * くり抜き、暗くするのは【四隅】と【下端の席エリア後方】だけ。これで空席/隙間が闇に溶けて
   * 「奥まで満員」に見えつつ、配信映像(中央セーフエリア)は素通しのまま。
   * pointer-events:none でクリック透過・吹き出しレイヤー(z5)より下(z0)。
   */
  .nlsb-stage::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background:
      radial-gradient(ellipse 78% 64% at 50% 46%, transparent 52%, rgba(2, 4, 10, 0.55) 100%),
      linear-gradient(to bottom, transparent 64%, rgba(2, 4, 12, 0.5) 100%);
  }
  /* v0.1.772: 閉じるは右上隅(absolute)でなくヘッダー右端の他ボタンと並べる(nlsb-comeview-btn 流用)。
     閉じる専用に薄赤の見た目を上書きして「閉じる」と分かりやすくする。 */
  .nlsb-close-btn {
    border-color: rgba(255, 150, 150, 0.45);
    background: rgba(60, 30, 34, 0.7);
    color: #ffd2cf;
  }
  .nlsb-close-btn:hover {
    background: rgba(90, 40, 46, 0.92);
    border-color: rgba(255, 170, 170, 0.7);
  }
  .nlsb-close-btn:focus-visible {
    outline: 2px solid #ffb4a2;
    outline-offset: 2px;
  }
  /* v0.1.770 VOICEVOX 起動待ちの「楽しいローディング」(会議 2026-06-16):
     会場は『開演前の期待感』。控えめにふわっと脈動する(派手すぎ厳禁=過去にリバーブ等は却下)。
     遅延ガード(180ms)は JS 側で制御し、一瞬成功ではこの class が付かない=チラつかない。 */
  .nlsb-voice-status.is-loading {
    color: #ffd98a;
    animation: nlsb-voice-loading 1.25s ease-in-out infinite;
  }
  .nlsb-voice-status.is-error {
    color: #ffb4a2;
    animation: none;
  }
  @keyframes nlsb-voice-loading {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-voice-status.is-loading {
      animation: none;
      opacity: 0.92;
    }
  }
  /*
   * 会議確定B(2026-06-13): 中央に「映像セーフエリア」を確保して配信映像を見せる。
   *   上端=なし(背景の光の海)、中央=何も置かない空き(映像が透ける)、下端=ひな壇。
   *   ひな壇を画面の下に逃がし、中央 1fr を空けることで映像が常に見える。
   */
  .nlsb-stage-layout {
    position: relative;
    z-index: 1;
    display: grid;
    /*
     * 2026-06-22 会場スペース拡大(ユーザー要望「席を画面いっぱいに広げる」):
     *   旧 width:min(1500px,100%);margin:0 auto は広い画面で左右に余白を残し、seatsHost の
     *   clientWidth が 1500px で頭打ち→perRow(seatsPerRow)が伸びず席が画面端まで並ばなかった
     *   (実機「会場スペースが狭い」不満の核)。全幅にすると seatsHost.clientWidth=実画面幅となり
     *   perRow が自然に増え、resolveVisibleArenaCount(perRow×8段)で同時表示席が画面端まで埋まる。
     *   「全員載せる」ロジック(buildVenueSeating の論理席/resolveDynamicArenaCap の人数連動上限)は
     *   一切変えない=全幅化で『ほか N人』に回る人が減り、より多くが席に出る方向にだけ働く。
     *   映像セーフエリア(上段 safe)は縦分割で守られるので全幅でも映像は覆わない。
     */
    width: 100%;
    height: 100%;
    min-height: 0;
    margin: 0;
    grid-template-rows: minmax(0, 1fr) auto;
    grid-template-areas:
      "safe"
      "seating";
    gap: clamp(8px, 1.5vh, 16px);
    /*
     * v0.1.1648: 旧コメント『none にすると子の <a> がクリックできなくなる』は誤り(pointer-events:auto を子で明示すれば押せる)。
     *   親を none にしないと、子の safe-area を none にしても親が受けてしまい、映像へクリックが通らなかった。
     *   押せる箱(.nlsb-seating)は auto を明示済み(下)。
     */
    pointer-events: none;
  }
  /* 中央の映像セーフエリア: UI を一切置かず、クリックを透過して映像/本家UIを直接触れる。 */
  .nlsb-safe-area {
    grid-area: safe;
    min-height: 0;
    pointer-events: none;
  }
  /* 配信者ステージカードは映像を覆うので撤去(中央は映像そのものを見せる)。 */
  .nlsb-center {
    display: none;
  }
  .nlsb-center-label {
    color: #9fd1ff;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
  }
  .nlsb-center-title {
    overflow: hidden;
    font-size: clamp(18px, 2.4vw, 28px);
    font-weight: 700;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nlsb-center-meta {
    color: rgba(255, 255, 255, 0.62);
    font-size: 12px;
    letter-spacing: 0.08em;
  }
  /*
   * 会場席は画面下端のひな壇だけにする(中央の映像セーフエリアは空ける)。高さは
   * 下端 max 35vh に制限し、配信映像を覆わない(会議確定B「ひな壇は下端 30〜35vh」)。
   */
  .nlsb-seating {
    grid-area: seating;
    align-self: end;
    display: grid;
    width: 100%;
    /* ★2026-08-11: 人数連動(旧 48→72vh)を撤回し 48vh 固定にした(会議4体・3対1)。
       ユーザー実機2,769人で「配信の映像はちゃんとみたい」＝映像が実質ゼロだったため。
       正本の経緯は src/lib/venueViewport.js の resolveVenueMaxHeightVh JSDoc。

       ★fallback を 55vh → 48vh に変更した理由(css_default_should_be_the_safe_state):
       JS の注入(renderSeats 内)が走る前や、何らかの理由で注入が失敗した場合、
       この fallback がそのまま効く。55vh のままだと「注入が失敗したときだけ
       映像が余計に潰れる」= 直したはずの症状が経路によって復活する。
       CSS 既定は常に【安全な側】に置く。 */
    max-height: var(--nlsb-venue-max-h, 48vh);
    min-height: 0;
    box-sizing: border-box;
    grid-template-areas:
      "header"
      "topbar"
      "seats";
    grid-template-rows: auto auto minmax(0, 1fr);
    overflow: hidden;
    position: relative; /* 3キャラ常駐レイヤー(.nlsb-residents)の絶対配置の基準 */
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    /* スモークを薄く: 名前が読める最低限の暗さだけ残し、下の映像を極力透けさせる。 */
    background: rgba(9, 13, 19, 0.28);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    overscroll-behavior: contain;
    pointer-events: auto;
  }
  /* 3キャラ常駐(りんく・こん太・たぬ姉): 配信画面の「まわり(左右の縁)」に出す。会場の席とは
     重ねない=満員でも邪魔にしない(ユーザー実機指摘の根治)。3人が画面を囲んで一緒に観てる感。
     stageLayout 全面を覆う透明レイヤー・pointer-events:none で映像/クリック/席リンクを邪魔しない。 */
  .nlsb-residents {
    position: absolute;
    inset: 0;
    z-index: 6;
    pointer-events: none;
  }
  .nlsb-resident {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: clamp(40px, 4.4vw, 64px);
  }
  /* 配置: りんく=左上・たぬ姉=左下(縦に2人)・こん太=右中央。映像の左右の縁に寄せ中央は空ける。 */
  .nlsb-resident-rinku   { left: 6px;  top: 8%; }
  .nlsb-resident-tanunee { left: 6px;  top: 34%; }
  .nlsb-resident-konta   { right: 6px; top: 18%; }
  .nlsb-resident-img {
    width: 100%;
    height: auto;
    object-fit: contain;
    /* 実視聴者と区別する金色の光。reduced-motion でも静的グローは残す。 */
    filter: drop-shadow(0 0 6px rgba(255, 206, 96, 0.9)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
    animation: nlsb-resident-glow 2.8s ease-in-out infinite;
  }
  .nlsb-resident-name {
    margin-top: 1px;
    font-size: 10px;
    font-weight: 700;
    color: #ffe7b0;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
    white-space: nowrap;
  }
  @keyframes nlsb-resident-glow {
    0%, 100% { filter: drop-shadow(0 0 5px rgba(255, 206, 96, 0.7)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6)); }
    50% { filter: drop-shadow(0 0 9px rgba(255, 220, 120, 1)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6)); }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-resident-img { animation: none; }
  }
  /* v0.1.777 額縁フレーム: 3キャラ全表情サムネを四辺に沿って並べ会場を囲む。中央(映像)と
     コメント欄は触らない。各タイルは JS が edge(top/right/bottom/left)と pos(0..1)を data 属性で渡し、
     ここで辺に貼り付ける。軽量 .thumb128 を使い負荷を抑える。 */
  .nlsb-charframe {
    position: absolute;
    inset: 0;
    z-index: 4; /* 客席(seats)より背面・映像セーフエリアより前。吹き出し(z5)/常駐(z6)より背面 */
    pointer-events: none;
    overflow: hidden;
  }
  .nlsb-charframe-tile {
    position: absolute;
    width: clamp(26px, 2.6vw, 40px);
    height: auto;
    opacity: 0.85;
    filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.6));
  }
  .nlsb-charframe-tile[data-edge="top"]    { top: 2px; transform: translateX(-50%); }
  .nlsb-charframe-tile[data-edge="bottom"] { bottom: 2px; transform: translateX(-50%); }
  .nlsb-charframe-tile[data-edge="left"]   { left: 2px; transform: translateY(-50%); }
  .nlsb-charframe-tile[data-edge="right"]  { right: 2px; transform: translateY(-50%); }
  /* v0.1.778 ギフト/広告の投げ演出: 投げ主のサムネ座標から中央映像へ放物線で飛ぶ。
     bubbleLayer(最前面・overflow外)に乗せ、JS は起点 left/top と --dx/--dy/--mid* を CSS 変数で
     渡すだけ=GPU アニメで毎フレーム JS 計算しない。プール再利用+同時上限で会場を重くしない。 */
  .nlsb-gift-proj {
    position: absolute;
    z-index: 7; /* 吹き出し(z5)・常駐(z6)より前=投げ物は最前面で映像へ飛ぶ */
    display: none;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(20, 24, 32, 0.82);
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
    pointer-events: none;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
    will-change: transform, opacity;
    /* v0.1.783: テキスト投げ物のみ screen 合成(中央映像を隠しすぎない)。
       実画像(is-image)は写真調なので screen を外し、はっきり見せる。 */
    mix-blend-mode: screen;
    transform: translate(-50%, -50%);
  }
  /* v0.1.783: 実画像の投げ物。pill 背景を消して画像そのものを大きく飛ばす。 */
  .nlsb-gift-proj.is-image {
    padding: 0;
    background: transparent;
    border-radius: 0;
    mix-blend-mode: normal;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.55));
  }
  .nlsb-gift-proj-img {
    width: 56px;
    height: 56px;
    object-fit: contain;
    display: block;
  }
  .nlsb-gift-proj.is-flying {
    display: inline-flex;
    animation: nlsb-gift-fly var(--nlsb-gift-dur, 1500ms) cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
  }
  .nlsb-gift-proj-emoji { font-size: 18px; }
  /* v0.1.783「一瞬で見えない」改善: 着弾(70%)で一度大きく見せて(バースト)から、
     余韻を残してフェード。以前は終端で scale(0.45)+opacity0 に縮んで消え、見る間もなかった。 */
  @keyframes nlsb-gift-fly {
    0%   { transform: translate(-50%, -50%) scale(0.6); opacity: 0; }
    10%  { transform: translate(-50%, -50%) scale(1.08); opacity: 1; }
    55%  { transform: translate(calc(-50% + var(--nlsb-gift-mx)), calc(-50% + var(--nlsb-gift-my))) scale(1.14) rotate(7deg); opacity: 1; }
    72%  { transform: translate(calc(-50% + var(--nlsb-gift-dx)), calc(-50% + var(--nlsb-gift-dy))) scale(1.35) rotate(-3deg); opacity: 1; }
    100% { transform: translate(calc(-50% + var(--nlsb-gift-dx)), calc(-50% + var(--nlsb-gift-dy))) scale(1.05) rotate(-2deg); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-gift-proj.is-flying {
      animation: nlsb-gift-fade var(--nlsb-gift-dur, 1500ms) ease-out forwards;
    }
    /* reduced-motion: 飛ばさず、着弾点でふわっと出して消える(余韻は残す)。 */
    @keyframes nlsb-gift-fade {
      0%   { transform: translate(calc(-50% + var(--nlsb-gift-dx)), calc(-50% + var(--nlsb-gift-dy))) scale(1); opacity: 0; }
      20%  { transform: translate(calc(-50% + var(--nlsb-gift-dx)), calc(-50% + var(--nlsb-gift-dy))) scale(1); opacity: 0.95; }
      80%  { transform: translate(calc(-50% + var(--nlsb-gift-dx)), calc(-50% + var(--nlsb-gift-dy))) scale(1); opacity: 0.95; }
      100% { transform: translate(calc(-50% + var(--nlsb-gift-dx)), calc(-50% + var(--nlsb-gift-dy))) scale(1); opacity: 0; }
    }
  }
  .nlsb-header {
    grid-area: header;
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 38px;
    box-sizing: border-box;
    padding: 7px 14px;
    gap: 12px;
    /* v0.1.1647: 狭い幅(サイドパネル等)で右端のボタンが画面外へ出ないよう折り返す。 */
    flex-wrap: wrap;
    row-gap: 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(14, 19, 27, 0.55);
  }
  /* 2026-07-01 会議(venue-role-separation フェーズ2): ひな壇上部「応援者トップNバー」。
     密集会場でも上位が必ず大きく見える。高さ固定=下の席を揺らさない(v0.1.1026 高さ振動対策)。 */
  .nlsb-topbar {
    grid-area: topbar;
    display: flex;
    align-items: center;
    gap: 10px;
    box-sizing: border-box;
    height: 72px;
    padding: 4px 14px;
    overflow-x: auto;
    overflow-y: hidden;
    background: linear-gradient(180deg, rgba(255, 210, 110, 0.10), rgba(14, 19, 27, 0.0));
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    scrollbar-width: thin;
  }
  .nlsb-topbar[hidden] { display: none; }
  .nlsb-topbar-label {
    flex: 0 0 auto;
    font-size: 11px;
    font-weight: 700;
    color: #ffd88a;
    letter-spacing: 0.04em;
    writing-mode: vertical-rl;
    text-orientation: upright;
    line-height: 1;
    opacity: 0.9;
  }
  .nlsb-topbar-list {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1 1 auto;
    min-width: 0;
  }
  .nlsb-topbar-cell {
    position: relative;
    flex: 0 0 auto;
    width: 56px;
  }
  /* トップバーのアバターは席より大きく主役感を出す(顔=買った本物タイル buildPersonTileEl 流用)。 */
  .nlsb-topbar-cell .nl-story-userlane-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 100%;
  }
  .nlsb-topbar-cell .nl-story-userlane-avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(255, 255, 255, 0.25);
  }
  .nlsb-topbar-cell .nl-story-userlane-meta {
    max-width: 56px;
    overflow: hidden;
    font-size: 9px;
    line-height: 1.15;
    text-align: center;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  /* 上位3位は金・銀・銅の縁 + 順位バッジ(席と同じ🥇🥈🥉)。静的=ピカピカしない。 */
  .nlsb-topbar-cell[data-venue-rank] .nl-story-userlane-avatar { border-width: 3px; }
  .nlsb-topbar-cell[data-venue-rank='1'] .nl-story-userlane-avatar { border-color: #ffcf5a; }
  .nlsb-topbar-cell[data-venue-rank='2'] .nl-story-userlane-avatar { border-color: #d8dde6; }
  .nlsb-topbar-cell[data-venue-rank='3'] .nl-story-userlane-avatar { border-color: #e0a878; }
  .nlsb-topbar-cell[data-venue-rank]::after {
    position: absolute;
    top: -4px;
    right: 2px;
    z-index: 2;
    font-size: 15px;
    line-height: 1;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
    pointer-events: none;
  }
  .nlsb-topbar-cell[data-venue-rank='1']::after { content: '🥇'; }
  .nlsb-topbar-cell[data-venue-rank='2']::after { content: '🥈'; }
  .nlsb-topbar-cell[data-venue-rank='3']::after { content: '🥉'; }
  .nlsb-title {
    overflow: hidden;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nlsb-note {
    color: rgba(255, 255, 255, 0.62);
    font-size: 10px;
    white-space: nowrap;
  }
  .nlsb-header-right {
    display: flex;
    align-items: center;
    gap: 6px 12px;
    /* v0.1.1647: 縮めない(0 0 auto)と幅855px のまま画面外へはみ出し『✕閉じる』が押せなかった(表示幅640px以下で実測)。
       折り返して収める。min-width:0 で親の幅に従う。 */
    flex: 0 1 auto;
    flex-wrap: wrap;
    justify-content: flex-end;
    min-width: 0;
    max-width: 100%;
  }
  /* コメビュ起動ボタン(会場ヘッダー右)。読み上げ付きコメントビューアを別窓で開く。 */
  .nlsb-comeview-btn {
    flex: 0 0 auto;
    min-height: 28px;
    padding: 4px 11px;
    border: 1px solid rgba(141, 200, 255, 0.4);
    border-radius: 999px;
    background: rgba(30, 41, 56, 0.7);
    color: #cfe6ff;
    cursor: pointer;
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    pointer-events: auto;
  }
  .nlsb-comeview-btn:hover {
    background: rgba(48, 64, 86, 0.92);
    border-color: rgba(141, 200, 255, 0.6);
  }
  .nlsb-comeview-btn:focus-visible {
    outline: 2px solid #8dc8ff;
    outline-offset: 2px;
  }
  .nlsb-seats {
    grid-area: seats;
    position: relative;
    display: block;
    gap: clamp(0px, 0.2vh, 4px);
    min-height: 0;
    box-sizing: border-box;
    padding: clamp(10px, 2vh, 22px) 14px;
    --nl-surface: rgba(255, 255, 255, 0.96);
    --nl-border: rgba(78, 109, 148, 0.26);
    --nl-text: #243244;
    --nl-text-sub: #56687d;
    --nl-muted: #6f7c8b;
    --nl-user-accent: #5aa7ff;
    --nl-lane-stats: #9a6f12;
    --nl-lane-pulse-gift: #c8721c;
    --nl-lane-pulse-hot: #c8721c;
    /*
     * 横スクロールバー根絶(ユーザー不満「位置がずれてスクロールバーが出て変な動きで
     * 見えなくなる」): 同時表示人数は selectStableVisibleMembers で行に収まる数に制限済み
     * なので横溢れは起きないが、保険として overflow-x:hidden で横スクロールを構造的に殺す。
     * 縦も clip(段数が増えても下端 35vh に収め、映像へはみ出さない)。 -> 見切れる不満解消のため auto に変更
     */
    overflow-x: hidden;
    overflow-y: auto;
    /* v0.1.1129: 会場のスクロールバー非表示(ユーザー要望「会場モードはスクロールバーが
       でてるのなくせないですか?」)。スクロール機能(ホイール/パン/タッチ)はそのまま=
       バーの見た目だけ消す。①POPは触らない(会場スコープのみ)。 */
    scrollbar-width: none;
    /* 2026-06-14 会議(摩擦ゼロUI): 会場は左ドラッグでパンできる=grab カーソルで掴めると示す。
       席リンク(.nlsb-seat-link)上はリンクカーソルを優先(下のセレクタで上書き)。
       v0.1.738: パンできる(縦に溢れている)時だけ grab を出す=掴めるのに動かない誤解を防ぐ。
       全席が画面に収まる時は通常カーソル。.nlsb-can-pan を renderSeats が溢れ時に付与。 */
    cursor: default;
    touch-action: pan-y;
    background:
      radial-gradient(ellipse at 50% 100%, rgba(102, 144, 190, 0.16), transparent 62%);
    overscroll-behavior: contain;
    /* v0.1.1817: 客席を自分の層へ。毎フレーム変わる隣(群衆・ニコ生側)につられ481席を毎回描き直していた(実測 描画1,487→364ms/10秒) */
    contain: layout paint style;
    will-change: transform;
  }
  /* v0.1.1129: Chrome系のスクロールバー非表示(scrollbar-width:none の webkit 版)。 */
  .nlsb-seats::-webkit-scrollbar {
    width: 0;
    height: 0;
  }
  .nlsb-seats.nlsb-mode-empty {
    display: grid;
    place-items: center;
  }
  /* LANE_CSS_SYNC_BEGIN 転写元=popup.html の応援レーンCSS(★行番号参照は腐る=書かない。popup.html / app/live-view.html / この区間の集合差は src/lib/laneCssSync.parity.test.js が照合する) */
  .nlsb-venue-lane-stack.nl-story-userlane-stack {
    /*
     * ★レーンのアバター寸法（2026-08-30）。popup.html の値を写す。
     *   会場は「常に inline 相当」（下の :1337-1338 の既存コメント参照）なので
     *   popup の html.nl-inline 側の値を採る。
     *   ★以前は 38px/22px の直書きだった。変数にして
     *     【値が書ける場所を塞ぐ】＝どんな値の退化も検査が捕まえる。
     *   検査: src/lib/laneAvatarSize.wiring.test.js
     */
    --nl-lane-avatar: 44px;
    --nl-lane-avatar-anon: 22px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-x: hidden;
    overflow-y: visible;
    margin: 0 0 4px;
    min-height: 0;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-tier-wrap {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-tier-wrap--gift {
    padding: 6px 6px 4px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--nl-surface) 82%, #e8b84a 18%);
    border: 1px solid color-mix(in srgb, var(--nl-border) 70%, #d4a017 30%);
  }
  .nlsb-venue-lane-stack .nl-story-userlane-tier-hint {
    margin: 0;
    padding: 4px 6px;
    font-size: 10px;
    font-weight: 700;
    line-height: 1.4;
    color: var(--nl-text-sub);
    border-radius: 8px;
    background: color-mix(in srgb, var(--nl-surface) 88%, #b8a06a 12%);
    border: 1px solid color-mix(in srgb, var(--nl-border) 75%, #c9a227 25%);
  }
  .nlsb-venue-lane-stack .nl-story-userlane {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    align-content: flex-start;
    gap: 6px 8px;
    margin: 0;
    min-height: 0;
    max-height: none;
    overflow-x: auto;
    overflow-y: visible;
    -webkit-overflow-scrolling: touch;
    /* v0.1.1133: v0.1.1129 は外枠 .nlsb-seats のスクロールバーだけ消しており、①からの
       転写元 CSS(LANE_CSS_SYNC_BEGIN)にある段自体(たぬ姉等)の overflow-x:auto には
       効いていなかった(段だけ独自スクロールバーが出る不具合)。ここにも同様に適用する。 */
    scrollbar-width: none;
  }
  .nlsb-venue-lane-stack .nl-story-userlane::-webkit-scrollbar {
    width: 0;
    height: 0;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-cell {
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    flex-shrink: 0;
    max-width: 100%;
    min-width: 0;
    border-radius: 999px;
    padding-right: 6px;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-cell--accent {
    padding: 3px 5px 3px 3px;
    background: color-mix(in srgb, var(--nl-user-accent) 20%, transparent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--nl-user-accent) 48%, transparent);
  }
  .nlsb-venue-lane-stack a.nl-story-userlane-cell--linkable {
    text-decoration: none;
    color: inherit;
    cursor: pointer;
    transition: background-color 0.12s;
  }
  .nlsb-venue-lane-stack a.nl-story-userlane-cell--linkable:hover {
    background-color: color-mix(in srgb, var(--nl-border) 40%, transparent);
  }
  .nlsb-venue-lane-stack .nl-story-userlane-meta {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1px;
    min-width: 0;
    /* ①popup.html の html.nl-inline(動画埋め込み表示)限定拡大ルールと同値。
       会場は常にその表示に相当するため無条件適用(avatar 38px 拡大と同じ扱い)。 */
    max-width: min(142px, 34vw);
    font-size: 11px;
    line-height: 1.22;
    text-align: left;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-meta__id,
  .nlsb-venue-lane-stack .nl-story-userlane-meta__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-meta__id {
    color: var(--nl-text-sub);
    font-weight: 600;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-meta__name {
    color: var(--nl-text);
    font-weight: 500;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-avatar {
    width: var(--nl-lane-avatar);
    height: var(--nl-lane-avatar);
    border-radius: 999px;
    object-fit: cover;
    object-position: center;
    border: 1.5px solid color-mix(in srgb, var(--nl-border) 82%, #fff 18%);
    box-shadow: 0 1px 3px rgb(2 17 31 / 22%);
    background: var(--nl-surface);
    flex-shrink: 0;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-avatar.nl-avatar--tv-fallback {
    object-fit: contain;
    padding: 3px;
    background: linear-gradient(180deg, #efebe9, #d7ccc8);
    border-color: color-mix(in srgb, #8d6e63 55%, var(--nl-border) 45%);
  }
  /* ★v0.1.1049: サムネ持ち=大(現状38px維持) / 匿名(実サムネ無し)=小・ぎゅうぎゅう詰め。
     popup.html と同じ規約([data-thumb="0"] 側のみ・displaySrc が http か)を会場にも。
     VIP金縁/streak/順位バッジは border/box-shadow を触るだけ=サイズ非依存で競合しない。 */
  .nlsb-venue-lane-stack .nl-story-userlane-cell[data-thumb="0"] .nl-story-userlane-avatar {
    width: var(--nl-lane-avatar-anon);
    height: var(--nl-lane-avatar-anon);
    border-width: 1px;
    border-style: dashed;
    box-shadow: none;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-cell[data-thumb="0"] {
    gap: 4px;
    padding-right: 4px;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-cell[data-thumb="0"] .nl-story-userlane-meta {
    font-size: 9px;
    max-width: 72px;
  }
  /* v0.1.1565: ギフト増分バッジ「+1,200pt」(popup.html の同名規則の写し) */
  .nlsb-venue-lane-stack .nl-story-userlane-cell[data-pulse] {
    position: relative;
  }
  /* v0.1.1578: バッジはタイルの流れから外して【重ねる】。流れに置くと、出入りのたびにタイルが約 68px 伸び縮みして
     折り返しの並びが全部ずれた(devtools 実測: バッジ出入り 10 回 = layout-shift 10 回)。幅を増やす指定は書かない。タイルの【内側】の角に置く(負のオフセットでタイル外へ出すと、上 padding の無い popup/別窓で親の overflow に切られる=実測)。 */
  .nlsb-venue-lane-stack .nl-story-userlane-cell[data-pulse]::after {
    content: attr(data-pulse);
    position: absolute;
    top: 0;
    right: 0;
    z-index: 2;
    pointer-events: none;
    padding: 0 5px;
    border-radius: 999px;
    font-size: 9px;
    font-weight: 800;
    line-height: 14px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    background: var(--nl-lane-pulse-gift);
    color: #fff;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-cell.is-gifted {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--nl-lane-pulse-gift) 55%, transparent);
    animation: nl-lane-pulse-pop 600ms ease-out 1;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-cell[data-pulse-tier="mega"] {
    --nl-lane-pulse-gift: #c02a2a;
  }
  /* v0.1.1566: 熱い人「+3件」(popup.html の同名規則の写し) */
  .nlsb-venue-lane-stack .nl-story-userlane-cell.is-hot {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--nl-lane-pulse-hot) 55%, transparent);
    animation: nl-lane-pulse-pop 600ms ease-out 1;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-cell.is-hot[data-pulse]::after {
    background: var(--nl-lane-pulse-hot);
    color: #fff;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-cell.is-hot[data-pulse-tier="mega"] {
    --nl-lane-pulse-hot: #c02a2a;
  }
  @keyframes nl-lane-pulse-pop {
    0% { transform: scale(1); }
    40% { transform: scale(1.045); }
    100% { transform: scale(1); }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-venue-lane-stack .nl-story-userlane-cell.is-gifted,
    .nlsb-venue-lane-stack .nl-story-userlane-cell.is-hot { animation: none; }
  }
  /* v0.1.1562: タイル 3 行目「🎁pt 📣pt 💬件」(popup.html の同名規則の写し) */
  .nlsb-venue-lane-stack .nl-story-userlane-meta[data-stats]::after {
    content: attr(data-stats);
    font-size: 9px;
    font-weight: 700;
    line-height: 1.2;
    color: var(--nl-lane-stats);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* ★v0.1.1376: たぬ姉段の段内LOD(遠近法)。popup.html と同じ規約を会場にも。
     先頭24人は読めるpill / 25人目以降の匿名はアイコンのみ=群れとして見せる。
     ★会場はタイルが wrapTileEl でラップされる(renderStoryUserLaneDom.js:402)ので
     【子孫形】で書く(①popup は直接子形)。ここを直接子形にすると会場だけ効かない。
     根拠と実測(1,615px→598px)は popup.html の同名ブロックのコメント参照。 */
  /* v0.1.1651: タイル間の間隔も popup(#sceneStoryUserLaneTanu{gap:4px})に揃える。popup は id セレクタなので会場へは来なかった。 */
  .nlsb-venue-lane-stack .nl-story-userlane--tanu {
    gap: 4px;
  }
  .nlsb-venue-lane-stack .nl-story-userlane--tanu > :nth-child(n + 25) .nl-story-userlane-cell[data-thumb="0"] {
    gap: 0;
    padding-right: 0;
  }
  .nlsb-venue-lane-stack .nl-story-userlane--tanu > :nth-child(n + 25) .nl-story-userlane-cell[data-thumb="0"] .nl-story-userlane-meta {
    display: none;
  }
  .nlsb-venue-lane-stack .nl-story-userlane--tanu > :nth-child(n + 25) .nl-story-userlane-cell[data-thumb="0"] .nl-story-userlane-avatar {
    /* ★後列は匿名寸法のまま（v0.1.1376 の 63%減を守る）。 */
    width: var(--nl-lane-avatar-anon);
    height: var(--nl-lane-avatar-anon);
  }
  .nlsb-venue-lane-stack .nl-story-userlane-guide {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 5px;
    margin: 0 0 6px;
    min-width: 0;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-guide__lines {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-guide__line {
    display: flex;
    align-items: flex-start;
    /* 顔アイコンを display:none にしたぶん、左の余白は不要(v0.1.1199)。 */
    gap: 0;
    padding: 5px 8px;
    border-radius: 10px;
    background: linear-gradient(180deg, #fffaf0, #fff4db);
    border: 1px solid #f5d28d;
    color: #6b4f18;
    font-size: 10px;
    font-weight: 700;
    line-height: 1.38;
    box-shadow: 0 1px 5px rgb(148 101 14 / 9%);
    min-width: 0;
  }
  /*
   * v0.1.1199(ユーザー要望 2026-07-31): 会場では段の説明文からキャラ顔アイコンを外す。
   *   説明文は5段ぶん繰り返されるため、24pxの丸顔+枠が5回並んで場所を取り、
   *   会場が賑わっている(191人)ときほど参加者の邪魔になっていた。文言自体は
   *   「どの段か」を伝える役目があるので残し、装飾だけ落とす。
   *   ①POP側は storyUserLaneGuideHtml.js が正本で従来どおり顔つき(このCSSは会場限定)。
   */
  /*
   * 2026-08-01(v0.1.1220): v0.1.1199 の display:none を撤回して復活。
   *   消してほしかったのは「映像に重なる」3キャラ常駐(v0.1.1214で対応済み)の方で、
   *   段の説明文の顔アイコンは映像に重ならないので残す=ユーザー確定
   *   「重ならない部分は残してほしい」。
   *   ★「会場=①と見た目もそっくり同じ」方針に従い①側と同じ寸法。
   */
  .nlsb-venue-lane-stack .nl-story-userlane-guide__face {
    width: 24px;
    height: 24px;
    border-radius: 999px;
    object-fit: cover;
    object-position: center;
    border: 1px solid color-mix(in srgb, var(--nl-border) 82%, #fff 18%);
    background: var(--nl-surface);
    flex: 0 0 auto;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-guide__text {
    flex: 1 1 auto;
    min-width: 0;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-guide__foot {
    margin: 2px 0 0;
    padding: 0 2px;
    font-size: 10px;
    font-weight: 800;
    color: var(--nl-muted);
    line-height: 1.35;
  }
  .nlsb-venue-lane-stack .nl-story-userlane__empty-note {
    margin: 4px 0 2px;
    padding: 8px 10px;
    font-size: clamp(10px, 2.4vw, 11px);
    line-height: 1.45;
    font-weight: 600;
    color: var(--nl-text-sub);
    border-radius: 10px;
    background: color-mix(in srgb, var(--nl-surface) 92%, var(--nl-border) 8%);
    border: 1px solid color-mix(in srgb, var(--nl-border) 70%, transparent);
  }
  .nlsb-venue-lane-stack .nl-story-userlane__empty-note-p {
    margin: 0 0 6px;
  }
  .nlsb-venue-lane-stack .nl-story-userlane__empty-note-p:last-child {
    margin-bottom: 0;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-guide__count {
    color: #9a6f12;
    font-weight: 800;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-guide__legend {
    margin: 2px 0 0;
    padding: 0 2px;
    font-size: 10px;
    line-height: 1.35;
    color: var(--nl-muted);
  }
  /* LANE_CSS_SYNC_END */
  .nlsb-story-diag {
    margin: 8px 0 10px;
    padding: 8px 10px 10px;
    border: 1px solid color-mix(in srgb, var(--nl-border) 74%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--nl-surface) 94%, #f4fbff 6%);
    color: var(--nl-text-sub);
    font-size: 11px;
    line-height: 1.45;
  }
  .nlsb-story-diag__head {
    margin: 0 0 6px;
    color: var(--nl-text);
    font-size: 11px;
    font-weight: 800;
  }
  .nlsb-story-diag .nl-story-diag__lead {
    margin: 0 0 6px;
  }
  .nlsb-story-diag .nl-story-diag__lead strong {
    color: var(--nl-text);
    font-weight: 800;
  }
  .nlsb-story-diag .nl-story-diag__more {
    margin: 0;
    padding: 4px 8px 6px;
    border: 1px solid color-mix(in srgb, var(--nl-border) 80%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--nl-surface) 92%, transparent);
  }
  .nlsb-story-diag .nl-story-diag__summary {
    cursor: pointer;
    color: var(--nl-muted);
    font-size: 10px;
    font-weight: 700;
    list-style-position: outside;
  }
  .nlsb-story-diag .nl-story-diag__body {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid color-mix(in srgb, var(--nl-border) 65%, transparent);
    color: var(--nl-muted);
    font-size: 10px;
    line-height: 1.4;
  }
  .nlsb-story-diag .nl-story-diag__list {
    margin: 0 0 6px;
    padding-left: 1.1em;
  }
  .nlsb-story-diag .nl-story-diag__list li {
    margin-bottom: 4px;
  }
  .nlsb-story-diag .nl-story-diag__technical {
    margin: 0;
    color: var(--nl-text-sub);
    font-size: 10px;
    overflow-wrap: anywhere;
  }
  .nlsb-seat {
    position: relative;
    display: inline-flex;
    min-width: 0;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    overflow: visible;
  }
  .nlsb-seats.nlsb-can-pan {
    cursor: grab;
  }
  .nlsb-seats.nlsb-is-grabbing {
    cursor: grabbing;
    user-select: none;
  }
  /* 診断: メンバー一覧パネル(モーダル風)。会場の上に重ねて出す。 */
  .nlsb-roster-panel {
    pointer-events: auto; /* v0.1.1648: 親(stage)が none なので、パネルは自分で受ける */
    position: absolute;
    top: 8%;
    left: 50%;
    transform: translateX(-50%);
    width: min(560px, 92vw);
    /*
     * v0.1.1653: パネルの下端を【会場の箱の最大上端】より上に収める(ヘッダーの6ボタンを覆わない)。
     *   以前は max-height:72vh で、top:8% から画面の80%まで伸び、画面の下半分にある会場ヘッダーを覆っていた
     *   (実測: 420/640 で6/6、1280 で4/6のボタンが押せない)。
     *   計算: 上端 8vh から、会場の箱の上端(= 100vh − 箱の最大高 var(--nlsb-venue-max-h) − 下余白79px実測 − 余白9px)まで。
     *   → 92vh − var(--nlsb-venue-max-h) − 88px。top と bottom の両方を指定すると中身が少なくても枠いっぱいに伸びるので、上限(max-height)で表す。
     *   --nlsb-venue-max-h は stage に注入する(パネルは stage の子。seating の inline に置くとパネルから見えない)。
     *   短い窓で負になっても 160px は確保(中身は .nlsb-roster-list がスクロール)。
     */
    max-height: max(160px, calc(92vh - var(--nlsb-venue-max-h, 48vh) - 88px));
    z-index: 6;
    display: flex;
    flex-direction: column;
    background: rgba(18, 22, 30, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 14px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
    color: #eef1f6;
    font-size: 13px;
    overflow: hidden;
  }
  /*
   * v0.1.1644: hidden 属性のパネルを実際に隠す。上の display:flex が UA の [hidden]{display:none} に勝つため、閉じた(hidden=true の)
   *   発言/一覧/診断パネルが幅560×高さ数百px のまま画面に残っていた(閉じたはずの『読み込み中…』が居座る症状・実測で確認)。
   */
  .nlsb-roster-panel[hidden] {
    display: none;
  }
  .nlsb-roster-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  }
  .nlsb-roster-close {
    /* v0.1.738: 当たり判定を広げ(36x36)確実に押せるように。背景を薄く付けて存在を明示。 */
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    min-height: 36px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 8px;
    color: #eef1f6;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    padding: 2px 8px;
  }
  .nlsb-roster-close:hover {
    background: rgba(255, 255, 255, 0.16);
  }
  .nlsb-roster-close:focus-visible {
    outline: 2px solid #8dc8ff;
    outline-offset: 2px;
  }
  .nlsb-roster-summary {
    padding: 8px 14px;
    font-size: 12px;
    color: #b9c2d0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .nlsb-roster-list {
    overflow-y: auto;
    padding: 6px 0;
  }
  .nlsb-roster-row {
    display: grid;
    grid-template-columns: 44px 1fr auto;
    align-items: center;
    gap: 8px;
    padding: 5px 14px;
  }
  .nlsb-roster-row:nth-child(odd) {
    background: rgba(255, 255, 255, 0.03);
  }
  .nlsb-roster-seat {
    color: #8b94a3;
    font-variant-numeric: tabular-nums;
  }
  .nlsb-roster-who {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /*
   * 2026-07-31: 発言パネル(クリックで開く)は本文を読ませるのが目的なので、
   *   名簿の1行省略(nowrap+ellipsis)を打ち消して折り返す。名簿側の見た目は変えない。
   */
  .nlsb-speech-panel .nlsb-roster-who {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
    word-break: break-word;
    line-height: 1.45;
  }
  .nlsb-speech-panel .nlsb-roster-badges {
    flex: 0 0 auto;
    opacity: 0.7;
    font-size: 11px;
    white-space: nowrap;
  }
  /*
   * v0.1.1656: 発言パネルの行は2列(本文 | 時刻)。名簿(.nlsb-roster-row)の3列 44px 1fr auto(順位|名前|バッジ)のままだと、
   *   子が2つ(本文と時刻)しか無いので本文が 44px の列に入り、1行5文字ほどで折り返されていた(実測: 本文の幅 44px・時刻が 457px の列)。
   *   minmax(0,1fr) で縮められるようにし、長い語・URL でも枠から出ないよう overflow-wrap:anywhere。
   */
  .nlsb-speech-panel .nlsb-roster-row {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: flex-start;
    gap: 8px;
  }
  .nlsb-speech-panel .nlsb-roster-who {
    overflow-wrap: anywhere;
  }
  /*
   * v0.1.1656: 見出しの注記(「ここまで422回」・flex:1 1 100%・order:9)が1行目に居座り、タイトルを 160px・3行へ押しつぶしていた。
   *   折り返し可にして注記を次の行へ送り、タイトルは残りの幅を使う。
   */
  .nlsb-speech-panel .nlsb-roster-head {
    flex-wrap: wrap;
    gap: 8px;
  }
  /* v0.1.1658: 発言パネルの「ギフト・広告」の一行(タイル3行目と同じ値)。 */
  .nlsb-speech-panel .nlsb-speech-support {
    padding: 2px 14px 8px;
    font-size: 12px;
    font-weight: 700;
    color: #ffd98a;
    overflow-wrap: anywhere;
  }
  /* v0.1.1659: ギフトの記録(1回ごとの明細)。最大でも約6行ぶんでスクロールし、発言一覧を押し出さない。 */
  .nlsb-speech-panel .nlsb-speech-gifts {
    padding: 0 14px 8px;
    max-height: 150px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .nlsb-speech-panel .nlsb-speech-gifts__head {
    font-size: 12px;
    font-weight: 700;
    color: #ffd98a;
    margin-bottom: 4px;
  }
  .nlsb-speech-panel .nlsb-speech-gifts__row {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    padding: 2px 0;
  }
  .nlsb-speech-panel .nlsb-speech-gifts__img {
    width: 20px;
    height: 20px;
    object-fit: contain;
  }
  .nlsb-speech-panel .nlsb-speech-gifts__item {
    overflow-wrap: anywhere;
  }
  .nlsb-speech-panel .nlsb-speech-gifts__pt {
    font-weight: 700;
    white-space: nowrap;
  }
  .nlsb-speech-panel .nlsb-speech-gifts__time {
    opacity: 0.8;
    font-size: 11px;
    text-align: right;
    max-width: 11em;
  }
  .nlsb-speech-panel .nlsb-speech-gifts__note {
    font-size: 11px;
    opacity: 0.7;
    margin-top: 4px;
  }
  .nlsb-speech-panel .nlsb-roster-title {
    flex: 1 1 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  /*
   * ★発言パネルの見出し（2026-08-30）。
   *   §3.5「サムネ・ID・ハンドルネーム・リンクをセットで出す」の実装。
   *   ★ここは席タイルでもホバーカードでも無いので、
   *   ①POP=②プレビュー=③会場=④WEB のパリティ検査には触れない。
   */
  .nlsb-roster-avatar {
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
    background: rgba(255, 255, 255, 0.08);
  }
  /* ★名前は押せることが見て分かる形にする（押せるのに押せないように見えない）。 */
  .nlsb-roster-title .nl-user-profile-link {
    color: #93c5fd;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .nlsb-roster-title .nl-user-profile-link:hover {
    color: #dbeafe;
  }
  /* 「この人がここでどうしていたか」の一言。見出しの下に小さく。 */
  .nlsb-roster-note {
    flex: 1 1 100%;
    order: 9;
    opacity: 0.75;
    font-size: 11px;
    line-height: 1.4;
  }
  .nlsb-roster-badge {
    display: inline-block;
    margin-left: 4px;
    padding: 1px 6px;
    border-radius: 8px;
    font-size: 11px;
  }
  .nlsb-roster-badge.thumb { background: rgba(255, 200, 90, 0.25); color: #ffd66f; }
  .nlsb-roster-badge.gift { background: rgba(120, 200, 255, 0.22); color: #9fd4ff; }
  .nlsb-roster-badge.on { background: rgba(120, 220, 140, 0.22); color: #9fe6af; }
  .nlsb-roster-badge.off { background: rgba(255, 255, 255, 0.08); color: #99a2b0; }
  .nlsb-roster-empty {
    padding: 24px 14px;
    text-align: center;
    color: #99a2b0;
  }
  /* 2026-07-01 会議(venue-diag): 「🩺 会場の状態」パネルの中身。roster と同じ overlay 枠を流用し、
     内側の文章だけをここで整える。件数のみ・PII なし(純関数 venueAvatarDiagLine.js が組む)。 */
  .nl-venue-diag {
    padding: 12px 14px 14px;
    line-height: 1.7;
    font-size: 13px;
    color: #d7dce6;
  }
  .nl-venue-diag p { margin: 0 0 8px; }
  .nl-venue-diag p:last-child { margin-bottom: 0; }
  .nl-venue-diag strong { color: #fff; }
  .nl-venue-diag__warn { color: #ffcf7a; }
  .nl-venue-diag__ok { color: #9fe6af; }
  .nl-venue-diag__foot {
    font-size: 11px;
    color: #99a2b0;
  }
  .nlsb-seat.nlsb-is-empty {
    display: none;
    opacity: 0.12;
    pointer-events: none;
    filter: blur(0.5px);
  }
  /* 2026-06-15 星野ロミ会議(サムネ優遇を"一目で特別"に): 1.12倍では脳が比較を要求し
     ノイズとして処理される(ユーザー実機「特別になってない」)→倍率の"断絶"を作る。
     会議7体一致=scale 1.45(28→約40px)で「大きい=重要」を本能で認識させる。金縁を太く
     はっきり+明るさ+12%。脈動は付けない(止まった大きさ=存在そのもの・上品さを保つ)。 */
  .nlsb-seat.nlsb-seat-vip .nl-story-userlane-avatar {
    filter: brightness(1.12);
    border-color: rgba(255, 220, 130, 1);
    box-shadow: 0 0 0 2px rgba(255, 206, 96, 0.55), 0 0 10px 1px rgba(255, 190, 70, 0.42), 0 1px 3px rgb(2 17 31 / 22%);
    z-index: 5;
  }
  /* 2026-07-01 会議(venue-grid-diag): 応援者ランキング上位3位の席に順位バッジを重ねる。
     旧「金色オーラで脈動」はユーザー要望で廃止(ピカピカ演出なし)。バッジは席の右上に
     絵文字(🥇🥈🥉)を絶対配置で重ねるだけ=高さ・レイアウトを一切変えない(v0.1.1026 の
     高さ振動を原理的に踏まない)。脈動・アニメーションは付けない(上品さ・静けさを保つ)。 */
  .nlsb-seat[data-venue-rank] {
    position: relative;
  }
  .nlsb-seat[data-venue-rank]::after {
    position: absolute;
    top: -2px;
    right: -2px;
    z-index: 6;
    font-size: 0.9em;
    line-height: 1;
    pointer-events: none;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
  }
  .nlsb-seat[data-venue-rank='1']::after { content: '🥇'; }
  .nlsb-seat[data-venue-rank='2']::after { content: '🥈'; }
  .nlsb-seat[data-venue-rank='3']::after { content: '🥉'; }
  /* v0.1.742 一緒に過ごしている感(co-presence): 誰かがコメントした瞬間、その人の席が
     ふわっと一度だけ反応する。吹き出しだけでなく「会場が一人ひとりの発言に反応する」ことで
     一緒にいる感を強める(星野式・摩擦ゼロ=自動・設定不要)。0.6秒で1回だけ・上品に。 */
  .nlsb-seat.nlsb-seat-speaking .nl-story-userlane-avatar {
    animation: nlsb-seat-speak 0.6s ease-out;
  }
  @keyframes nlsb-seat-speak {
    0% {
      transform: scale(1);
    }
    35% {
      transform: scale(1.18);
      filter: brightness(1.15);
    }
    100% {
      transform: scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-seat.nlsb-seat-speaking .nl-story-userlane-avatar {
      animation: none;
    }
  }
  /*
   * 2026-08-08 入場演出(サイドパネル→会場へ「運ぶ」): 新しく来た人のアイコンが
   * 画面端から自分の席へ弧を描いて飛び、着弾で席が一度ふくらむ。
   *
   * ★これは飾りであると同時に【計器】でもある。会場は「気づいたら居る」ので
   *   載っていないのか目立たないのか区別できない。入場をイベントにすると
   *   「飛んでこない＝載っていない」が目視で分かる。
   *   だから reduced-motion でも【消さずに】ゆっくり出す(検証価値を残す)。
   *
   * 正本SPEC: docs/handoff/venue-transport-effect-SPEC-2026-08-08.md
   */
  .nlsb-entry-proj {
    position: absolute;
    left: 0;
    top: 0;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    overflow: hidden;
    pointer-events: none;
    opacity: 0;
    z-index: 6;
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.85), 0 6px 18px rgba(0, 0, 0, 0.5);
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.5));
  }
  .nlsb-entry-proj img,
  .nlsb-entry-proj .nl-story-userlane-avatar {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    border-radius: 50%;
  }
  .nlsb-entry-proj.is-flying {
    animation: nlsb-entry-fly var(--nlsb-entry-dur, 900ms) cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
  }
  @keyframes nlsb-entry-fly {
    0%   { transform: translate(-50%, -50%) scale(0.7); opacity: 0; }
    12%  { transform: translate(-50%, -50%) scale(1); opacity: 1; }
    60%  { transform: translate(calc(-50% + var(--nlsb-entry-mx)), calc(-50% + var(--nlsb-entry-my))) scale(1.06); opacity: 1; }
    100% { transform: translate(calc(-50% + var(--nlsb-entry-dx)), calc(-50% + var(--nlsb-entry-dy))) scale(0.92); opacity: 0; }
  }
  /* 着弾: 席が一度だけふくらんで「確定」を示す。 */
  .nlsb-seat.nlsb-seat-entered .nl-story-userlane-avatar {
    animation: nlsb-seat-enter 0.5s ease-out;
  }
  @keyframes nlsb-seat-enter {
    0%   { transform: scale(0.72); filter: brightness(1.3); }
    55%  { transform: scale(1.14); filter: brightness(1.12); }
    100% { transform: scale(1); filter: brightness(1); }
  }
  @media (prefers-reduced-motion: reduce) {
    /* ★飛ばさない。ただし【消さない】=着弾点でふわっと出して消える(入場が分かる)。 */
    .nlsb-entry-proj.is-flying {
      animation: nlsb-entry-fade var(--nlsb-entry-dur, 900ms) ease-out forwards;
    }
    @keyframes nlsb-entry-fade {
      0%   { transform: translate(calc(-50% + var(--nlsb-entry-dx)), calc(-50% + var(--nlsb-entry-dy))) scale(1); opacity: 0; }
      25%  { transform: translate(calc(-50% + var(--nlsb-entry-dx)), calc(-50% + var(--nlsb-entry-dy))) scale(1); opacity: 0.95; }
      75%  { transform: translate(calc(-50% + var(--nlsb-entry-dx)), calc(-50% + var(--nlsb-entry-dy))) scale(1); opacity: 0.95; }
      100% { transform: translate(calc(-50% + var(--nlsb-entry-dx)), calc(-50% + var(--nlsb-entry-dy))) scale(1); opacity: 0; }
    }
    .nlsb-seat.nlsb-seat-entered .nl-story-userlane-avatar { animation: none; }
  }
  /* v0.1.743 「会話の連鎖」(会議の最大多数決の本命・弱点A/C): 同じ人が短い間隔で続けて喋ると、
     その席が段階的に暖色(コーラル)で輝き、連続するほど強く速く脈動する=「溜まっていく感」。
     金色オーラ(.nlsb-seat-regular=支えてる人)とは別軸の「いま盛り上げてる人」を引き立てる。
     data-streak=1..4 を JS が席に付け、段階ごとに色の強さ/脈動速度が上がる。発言が途切れると
     prune で data-streak が外れて自然に消える。*/
  .nlsb-seat[data-streak] .nl-story-userlane-avatar {
    box-shadow: 0 0 9px 2px rgba(255, 138, 92, 0.6), inset 0 0 0 1px rgba(0, 0, 0, 0.12);
    animation: nlsb-seat-streak 1.4s ease-in-out infinite;
    z-index: 4;
  }
  .nlsb-seat[data-streak="2"] .nl-story-userlane-avatar { box-shadow: 0 0 11px 3px rgba(255, 132, 86, 0.72), inset 0 0 0 1px rgba(0, 0, 0, 0.12); animation-duration: 1.2s; }
  .nlsb-seat[data-streak="3"] .nl-story-userlane-avatar { box-shadow: 0 0 13px 4px rgba(255, 120, 80, 0.82), inset 0 0 0 1px rgba(0, 0, 0, 0.12); animation-duration: 1.0s; }
  .nlsb-seat[data-streak="4"] .nl-story-userlane-avatar { box-shadow: 0 0 16px 5px rgba(255, 108, 74, 0.92), inset 0 0 0 1px rgba(0, 0, 0, 0.12); animation-duration: 0.85s; }
  @keyframes nlsb-seat-streak {
    0%, 100% { filter: brightness(1); }
    50% { filter: brightness(1.18); }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-seat[data-streak] .nl-story-userlane-avatar {
      animation: none;
    }
  }
  /* 数値 ID 持ち=クリックでユーザーページへ飛べるリンク。会場は開時のみ操作可能。
     リンク本体は本物タイルの a.nl-story-userlane-cell--linkable が持つので、ラッパー(.nlsb-seat-link)は
     カーソルとヒットテスト透過だけを担う。 */
  a.nlsb-seat-link,
  .nlsb-seat.nlsb-seat-link {
    cursor: pointer;
    pointer-events: auto;
  }
  .nlsb-seat .nl-story-userlane-cell {
    pointer-events: auto;
  }
  .nlsb-seat-link:hover .nl-story-userlane-meta__name {
    color: #bfe1ff;
    text-decoration: underline;
  }
  .nlsb-seat-link:hover .nl-story-userlane-avatar {
    border-color: rgba(191, 225, 255, 0.6);
  }
  .nlsb-seat-link:focus-visible {
    outline: 2px solid #8dc8ff;
    outline-offset: 2px;
    border-radius: 3px;
  }
  /*
   * 会議確定A: 吹き出し専用の最上位レイヤー。席コンテナ(.nlsb-seats overflow:hidden)の
   * 外・stage 直下に置き、セリフがクリップされない/アバターに潜らない。
   */
  .nlsb-bubble-layer {
    position: absolute;
    inset: 0;
    z-index: 5;
    overflow: visible;
    pointer-events: none;
  }
  /*
   * 吹き出し本体。レイヤー基準で left/top を JS が席頭上にセットする。
   * translate(-50%, -100%) で「指定点が吹き出しの下辺中央」になる。
   * 会議確定B: font 18px(12px から大幅拡大)・最大2行・読みやすさ最優先(星野ロミ流)。
   */
  /*
   * 2026-07-30(wayfinder→to-spec方式・venue-avatar-hover-preview): 会場アイコンのホバー
   * プレビューカード。吹き出し(z:5)より前・投げ物演出(z:7)より背面になるよう z:6 とし、
   * stage 直下の最後に append することで常駐レイヤー(同z:6)より DOM 順で手前にする。
   * pointer-events:none=マウスを一切奪わない(カード越しのクリック・ドラッグ・下のタイルへの
   * ホバーは素通し)。表示/非表示はクラス nlsb-hover-card--open のトグルのみ(最小構成)。
   */
  .nlsb-hover-card {
    position: absolute;
    left: 0;
    top: 0;
    z-index: 6;
    display: none;
    box-sizing: border-box;
    width: max-content;
    max-width: min(26ch, 70vw);
    padding: 10px 12px;
    gap: 10px;
    border: 1px solid rgba(20, 29, 42, 0.16);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.97);
    color: #141d28;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.34);
    pointer-events: none;
  }
  .nlsb-hover-card.nlsb-hover-card--open {
    display: flex;
  }
  .nlsb-hover-card__avatar-box {
    flex: 0 0 auto;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: rgba(20, 29, 42, 0.12);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .nlsb-hover-card__avatar {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .nlsb-hover-card__body {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 13px;
    line-height: 1.4;
  }
  .nlsb-hover-card__name {
    font-size: 15px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nlsb-hover-card__id {
    /* 2026-07-30(council-fable設計・venue-hover-card-content-DESIGN.md 必答1): 文言は
       そのまま(匿名の同一人物照合に必須)・体裁だけ格下げ(名前/活動より控えめな見た目)。 */
    font-size: 11px;
    opacity: 0.7;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nlsb-hover-card__stats {
    font-weight: 600;
  }
  /*
   * ★2026-08-29: 「この人はここでどうしていたか」の一言。
   *   直上の __stats(発言42 ・ 🎁3 ・ 🥇1位)を日本語に言い換えた行なので、
   *   ★統計より控えめにして「読み解きの補助」だと分かる見た目にする
   *   （主役は本人と発言であって、この行ではない）。
   */
  .nlsb-hover-card__presence {
    margin-top: 2px;
    font-size: 0.92em;
    opacity: 0.85;
    line-height: 1.35;
  }
  .nlsb-hover-card__presence[hidden] {
    display: none;
  }
  /*
   * 2026-07-31(ユーザー要望): 直前の発言内容。「多忙なあやりん」が何を言ったか分からない、
   *   という指摘への回答。本文はモデル側で60字に畳んであるが、それでも席を覆わないよう
   *   2行までで省略する(カードは会場の上に重なるため縦に伸ばさない)。
   */
  /* v0.1.1218: 直近数件を縦に並べる。以前は1件前提で -webkit-line-clamp:2 だったため、
     複数件にすると3行目以降が隠れて「出しているのに見えない」状態になっていた。 */
  .nlsb-hover-card__last-text {
    margin-top: 2px;
    font-size: 12px;
    line-height: 1.4;
    opacity: 0.9;
    word-break: break-word;
  }
  /* 1件ぶん。長文は buildVenueHoverCardModel 側で既に切ってあるので、ここでは
     2行までに抑えて「1件が縦に伸びてカードが会場を覆う」のを防ぐ。 */
  .nlsb-hover-card__speech {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .nlsb-hover-card__speech + .nlsb-hover-card__speech {
    margin-top: 2px;
    opacity: 0.72; /* 古い発言ほど控えめ=最新がどれか一目で分かる */
  }
  .nlsb-hover-card__thumb-status {
    opacity: 0.65;
    font-size: 12px;
  }
  .nlsb-bubble {
    position: absolute;
    left: 0;
    top: 0;
    z-index: 5;
    box-sizing: border-box;
    width: max-content;
    max-width: min(30ch, 40vw);
    padding: 9px 13px;
    overflow: hidden;
    border: 1px solid rgba(20, 29, 42, 0.16);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.97);
    color: #141d28;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.34);
    font-size: clamp(16px, 1.4vw, 20px);
    font-weight: 700;
    line-height: 1.4;
    opacity: 1;
    overflow-wrap: anywhere;
    word-break: break-all;
    pointer-events: none;
    text-shadow: none;
    transform: translateY(-100%);
    white-space: normal;
    animation: nlsb-bubble-pop 160ms ease-out;
    transition: opacity ${BUBBLE_FADE_MS}ms ease;
  }
  .nlsb-bubble::after {
    position: absolute;
    top: 100%;
    left: var(--nlsb-bubble-tail, 50%);
    width: 0;
    height: 0;
    border: 7px solid transparent;
    border-top-color: rgba(255, 255, 255, 0.97);
    content: "";
    transform: translateX(-50%);
  }
  /* v0.1.1760: 吹き出しの向き(data-side=席から見てどちら側か)。尻尾は席の方の辺に付ける。 */
  .nlsb-bubble[data-side='bottom']::after { top: auto; bottom: 100%; border-top-color: transparent; border-bottom-color: rgba(255, 255, 255, 0.97); }
  .nlsb-bubble[data-side='right']::after,
  .nlsb-bubble[data-side='left']::after { top: var(--nlsb-bubble-tail, 50%); transform: translateY(-50%); border-top-color: transparent; }
  .nlsb-bubble[data-side='right']::after { left: auto; right: 100%; border-right-color: rgba(255, 255, 255, 0.97); }
  .nlsb-bubble[data-side='left']::after { left: 100%; border-left-color: rgba(255, 255, 255, 0.97); }
  .nlsb-bubble-who { display: none; font-size: 11px; font-weight: 700; color: #5b6b80; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nlsb-bubble--away .nlsb-bubble-who { display: block; }
  .nlsb-bubble--away .nlsb-bubble-who::after { content: " ↓"; }
  .nlsb-bubble--away[data-side='bottom'] .nlsb-bubble-who::after { content: " ↑"; }
  /* v0.1.1828: 席が無い人の吹き出しは指す席が無い=矢印も尻尾も出さない(名前だけ)。 */
  .nlsb-bubble--seatless .nlsb-bubble-who::after,
  .nlsb-bubble--seatless[data-side='bottom'] .nlsb-bubble-who::after { content: ""; }
  .nlsb-bubble--seatless::after { display: none; }
  .nlsb-bubble.nlsb-is-leaving {
    opacity: 0;
  }
  /* v0.1.800「吹き出しと読み上げを同時に立ち上げる」(会議 案C・2段階表示):
     読み上げONのとき、声が鳴り始める前は「仮(淡い・少し小さい)」で出し、onAudioStart で
     仮 class を外す瞬間に「本(鮮明・等倍)」へ瞬時昇格=声と同時に立ち上がった体感を作る。
     声非依存(v0.1.757)は不変: 仮でも必ず即出る・声が来なければ仮のまま流速寿命で消える。
     transition は短く(120ms)=「遅延」と感じない範囲で昇格のメリハリだけ付ける。 */
  .nlsb-bubble.nlsb-bubble-previoice {
    opacity: 0.78;
    transform: translateY(-100%) scale(0.965);
    transform-origin: bottom center;
    transition:
      opacity 120ms ease,
      transform 120ms ease;
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-bubble.nlsb-bubble-previoice {
      transform: translateY(-100%);
      transition: none;
    }
  }
  /* v0.1.773 軽い同期: 読み上げが鳴り始めた瞬間に一度だけ淡く光らせ「声＝この吹き出し」を結ぶ。
     上品に1回だけ(派手すぎ厳禁)。即時表示は変えない=即時性は維持。 */
  .nlsb-bubble.nlsb-bubble-voiced {
    animation: nlsb-bubble-voiced 620ms ease-out;
  }
  @keyframes nlsb-bubble-voiced {
    0% { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.34), 0 0 0 0 rgba(141, 200, 255, 0.55); }
    40% { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.34), 0 0 0 5px rgba(141, 200, 255, 0.32); }
    100% { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.34), 0 0 0 0 rgba(141, 200, 255, 0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-bubble.nlsb-bubble-voiced { animation: none; }
  }
  @keyframes nlsb-bubble-pop {
    from {
      opacity: 0;
      transform: translateY(calc(-100% + 6px)) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(-100%);
    }
  }
  .nlsb-bubble-text {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
  .nlsb-empty-message {
    display: none;
    color: rgba(255, 255, 255, 0.52);
    font-size: 12px;
    letter-spacing: 0.02em;
  }
  .nlsb-seats.nlsb-mode-empty .nlsb-empty-message {
    display: block;
  }
  .nlsb-crowd-canvas {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: clamp(200px, 40vh, 350px);
    z-index: 0; /* ひな壇(.nlsb-seating z:1)の裏 */
    pointer-events: none;
    opacity: 0;
    transition: opacity 1200ms ease-in-out;
    mix-blend-mode: screen; /* サイリウムを美しく光らせる */
  }
  .nlsb-crowd-canvas.nlsb-is-visible {
    opacity: 1;
  }
  @media (max-width: 900px) {
    /* ★2026-08-11: fixed 化に伴い、狭い窓では少し内側+上に寄せる。
       ニコ生の右下UI(コメント入力欄まわり)と重なって押せなくなるのを避ける。 */
    .nlsb-toggle {
      right: 12px;
      bottom: 76px;
      font-size: 14px;
      padding: 10px 16px;
    }
    .nlsb-stage {
      padding-right: 10px;
      padding-left: 10px;
    }
    .nlsb-stage-layout {
      grid-template-rows: minmax(120px, 22vh) minmax(0, 1fr);
    }
    .nlsb-center {
      width: min(620px, 92vw);
      border-radius: 14px;
    }
    .nlsb-seats {
      padding-right: 10px;
      padding-left: 10px;
    }
  }
  @media (max-height: 560px) {
    .nlsb-stage {
      padding-top: 48px;
      padding-bottom: 54px;
    }
    .nlsb-stage-layout {
      grid-template-rows: minmax(100px, 22vh) minmax(0, 1fr);
      gap: 10px;
    }
    .nlsb-center {
      gap: 5px;
      padding-top: 14px;
      padding-bottom: 14px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-toggle,
    .nlsb-stage,
    .nlsb-seat,
    .nlsb-bubble {
      transition: none;
    }
    .nlsb-bubble {
      animation: none;
    }
  }
  /* v0.1.1115 ①POP遮蔽(reference_venue_pop_copy_SYNTHESIS.md §C-1): 会場open中は①POP(インライン
     埋め込みホスト)を畳む。会場=①の鏡なので同じ情報の二重表示であり、①のキャラ案内バナーが
     会場の背景に透けて邪魔になるのを消す。配信映像と本家watch UIは今後も素通し(スモーク禁止
     方針は不変・隠すのは拡張自身の冗長UIのみ)。
     ★display:none は禁止: iframe のレイアウト消滅で①の paint/鏡publish が痩せ、会場は鏡で
     生きているため自殺になる。visibility:hidden はレイアウト保持=鏡は生き続ける。 */
  html.nlsb-venue-open #nls-inline-popup-host {
    visibility: hidden !important;
    pointer-events: none !important;
  }
  /*
   * v0.1.1649: ①POP の iframe 自身も隠す。親(host)の visibility:hidden は子へ継承されるが、iframe は読み込み完了時に
   *   インラインで visibility:visible を付ける(content-entry.js の reveal)ため、継承が上書きされて【会場の半透明な背景越しに
   *   ①POP(HTML・マーケ・メディアキット・スクショのボタン等)が透けて見えていた】(実測: iframe#nls-inline-popup-iframe が全幅で visible)。
   *   display:none は上のコメントのとおり不可(再読込の誘発)。インラインより !important の規則が勝つ。
   */
  html.nlsb-venue-open #nls-inline-popup-host iframe {
    visibility: hidden !important;
  }
  /* v0.1.1119 見た目①化(P5・reference_venue_pop_copy_SYNTHESIS.md §C-3): 段(レーン帯)配下は
     ①応援レーンと同じ見た目に=会場独自の席装飾(VIP金縁・連鎖発光)を段の中では無効化する。
     順位バッジ(🥇🥈🥉)と発話の一拍(speaking)は残す(既存ユーザー指示=光る演出なし・バッジのみ)。
     ★LANE_CSS_SYNC マーカー区間の外に書く(区間内直接編集は同期テスト赤/黙ったdriftの地雷)。
     ★席ラップ(.nlsb-seat)の display/overflow は触らない(吹き出し/ギフト起点の座標系を変えない)。 */
  .nlsb-venue-lane-stack .nlsb-seat.nlsb-seat-vip .nl-story-userlane-avatar {
    filter: none;
    border-color: color-mix(in srgb, var(--nl-border) 82%, #fff 18%);
    box-shadow: none;
    z-index: auto;
  }
  .nlsb-venue-lane-stack .nlsb-seat[data-streak] .nl-story-userlane-avatar {
    box-shadow: none;
    animation: none;
    z-index: auto;
  }
  /* v0.1.1613 文字サイズ・寸法規則を①に揃える(2026-10-13・状態速報「幾何≠ gift:179×46px(①149×44px)」)。
     タイルは font-size を自分で持たず親から継承する。①は popup の body が 15px、会場はニコ生ページの 16px を継承して
     いた=同じ人のタイルが会場だけ約7%大きい(再現環境の実測: 会場 16px・高さ46 / ①15px・高さ44)。
     段(レーン帯)の中だけを①の値に固定する。席/ツールバー等の他の部品は触らない。
     ★LANE_CSS_SYNC マーカー区間の外(区間内の直接編集は同期テスト赤)。 */
  .nlsb-venue-lane-stack {
    font-size: 15px;
  }
  /* ★寸法の本当の原因: ①(popup)は全要素 box-sizing:border-box だが、会場はホストページ上にあり既定の content-box。
     アバターは width:44px でも border(1.5px×2)が外側へ足されて 46px になる(実測: 会場46×46 / ①44×44)。
     段の中だけ border-box にして①と同じ寸法規則にする。 */
  .nlsb-venue-lane-stack,
  .nlsb-venue-lane-stack *,
  .nlsb-venue-lane-stack *::before,
  .nlsb-venue-lane-stack *::after {
    box-sizing: border-box;
  }
  /* v0.1.1121 surface行単位化(C): v0.1.1119 の stack 全面surfaceは、ガイド/空文込みの下端55vh
     バンド全体を白い大パネルにして画面下半分を占有した(実機で確認)。surfaceは【実在タイルの行
     (.nl-story-userlane)だけ】に敷く=透け防止(タイル背後)と「画面を占有しない」を粒度で両立。
     空の段は hidden(display:none)なので白帯自体が存在しない。①と同じ不透明(半透明は棄却=
     透け防止の毀損+①との見た目差の再導入)。 */
  .nlsb-venue-lane-stack .nl-story-userlane {
    background: var(--nl-surface);
    border: 1px solid var(--nl-border);
    border-radius: 10px;
    padding: 6px;
  }
  /* gift/ad 段は wrap 自体が金色surface(--gift ルール)を既に持つ=行に重ねるとカードの入れ子に
     なるため除外。 */
  .nlsb-venue-lane-stack .nl-story-userlane-tier-wrap--gift .nl-story-userlane {
    background: none;
    border: none;
    padding: 0;
  }
`;
  var _forcedLiveId = null;
  function liveIdFromPathname() {
    if (_forcedLiveId) return _forcedLiveId;
    const match = String(location.pathname || "").match(/^\/watch\/(lv\d{1,15})(?:\/|$)/i);
    return match ? match[1].toLowerCase() : "";
  }
  function ensureVenueStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = VENUE_CSS;
    (document.head || document.documentElement).appendChild(style);
  }
  function createSeatNode(seatIndex) {
    const seat = document.createElement("div");
    seat.className = "nlsb-seat nlsb-is-empty";
    seat.dataset.seatIndex = String(seatIndex);
    seat.setAttribute("aria-hidden", "true");
    return { seat, tile: (
      /** @type {HTMLElement|null} */
      null
    ), next: createEmptySeatState() };
  }
  function createVenueStoryLaneDom() {
    const stack = document.createElement("div");
    stack.className = "nl-story-userlane-stack nlsb-venue-lane-stack";
    stack.hidden = true;
    const makeGuide = () => {
      const guide = document.createElement("div");
      guide.className = "nl-story-userlane-guide";
      const lines = document.createElement("div");
      lines.className = "nl-story-userlane-guide__lines";
      guide.appendChild(lines);
      return { guide, lines };
    };
    const makeLane = (laneName) => {
      const lane = document.createElement("div");
      lane.className = laneName === "tanu" ? "nl-story-userlane nl-story-userlane--tanu" : "nl-story-userlane";
      lane.dataset.laneName = laneName;
      lane.hidden = true;
      return lane;
    };
    const makeWrap = (className = "") => {
      const wrap = document.createElement("div");
      wrap.className = `nl-story-userlane-tier-wrap${className ? ` ${className}` : ""}`;
      return wrap;
    };
    const top = makeGuide();
    const giftGuide = makeGuide();
    const adGuide = makeGuide();
    const kontaGuide = makeGuide();
    const tanuGuide = makeGuide();
    const bottom = makeGuide();
    const linkWrap = makeWrap();
    const giftWrap = makeWrap("nl-story-userlane-tier-wrap--gift");
    const adWrap = makeWrap("nl-story-userlane-tier-wrap--ad");
    const kontaWrap = makeWrap();
    const tanuWrap = makeWrap();
    const laneLink = makeLane("link");
    const laneGift = makeLane("gift");
    const laneAd = makeLane("ad");
    const laneKonta = makeLane("konta");
    const laneTanu = makeLane("tanu");
    const hintLink = document.createElement("div");
    hintLink.className = "nl-story-userlane-tier-hint";
    hintLink.textContent = "りんく候補はまだ少なめです。下の段も会場の応援者です。";
    hintLink.hidden = true;
    linkWrap.append(laneLink, hintLink);
    giftWrap.append(giftGuide.guide, laneGift);
    adWrap.append(adGuide.guide, laneAd);
    kontaWrap.append(kontaGuide.guide, laneKonta);
    tanuWrap.append(tanuGuide.guide, laneTanu);
    stack.append(top.guide, linkWrap, giftWrap, adWrap, kontaWrap, tanuWrap, bottom.guide);
    return {
      stack,
      laneLink,
      laneGift,
      laneAd,
      laneKonta,
      laneTanu,
      hintLink,
      linkWrap,
      giftWrap,
      adWrap,
      guideTop: top.guide,
      guideLinesTop: top.lines,
      guideMidGift: giftGuide.guide,
      guideLinesMidGift: giftGuide.lines,
      guideMidAd: adGuide.guide,
      guideLinesMidAd: adGuide.lines,
      guideMidKonta: kontaGuide.guide,
      guideLinesMidKonta: kontaGuide.lines,
      guideMidTanu: tanuGuide.guide,
      guideLinesMidTanu: tanuGuide.lines,
      guideBottom: bottom.guide,
      guideLinesBottom: bottom.lines
    };
  }
  function seatAnchorEl(node) {
    if (!node) return null;
    const tile = node.tile;
    if (tile) {
      const avatar = tile.querySelector(".nl-story-userlane-avatar");
      if (avatar instanceof HTMLElement) return avatar;
      return tile;
    }
    return node.seat || null;
  }
  function hasVenueExtensionContext() {
    try {
      return Boolean(chrome?.runtime?.id && chrome?.storage?.local);
    } catch {
      return false;
    }
  }
  function mountVenueBarButton(options = {}) {
    const isStandalone = !!options.standalone;
    const NOOP_API = { onLiveComments: () => {
    } };
    if (!liveIdFromPathname()) return NOOP_API;
    if (document.getElementById(ROOT_ID)) return NOOP_API;
    const parent = isStandalone ? document.body : document.documentElement;
    if (!parent) return NOOP_API;
    try {
      document.documentElement.classList.remove("nlsb-venue-open");
    } catch {
    }
    ensureVenueStyle();
    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "nlsb-root nlsb-full";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "nlsb-toggle";
    toggle.textContent = "🏟 会場モード";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", "nlsb-venue-stage");
    const stage = document.createElement("section");
    stage.id = "nlsb-venue-stage";
    stage.className = "nlsb-stage";
    stage.setAttribute("role", "dialog");
    stage.setAttribute("aria-modal", "true");
    stage.setAttribute("aria-label", "全画面会場モード");
    stage.setAttribute("aria-hidden", "true");
    const close = document.createElement("button");
    close.type = "button";
    close.className = "nlsb-comeview-btn nlsb-close-btn";
    close.textContent = "✕ 閉じる";
    close.title = "会場モードを閉じます";
    const isObsCapture = (window.name || "").includes("OBS") || window.location.search.includes("obs=");
    if (isStandalone) {
      toggle.style.display = "none";
      if (isObsCapture) {
        close.style.display = "none";
      } else {
        close.textContent = "✕ タブを閉じる";
        close.title = "会場タブを閉じます";
      }
      root.style.background = "#0a0b0c";
    }
    const CROWD_CANVAS_W = 1200;
    const CROWD_CANVAS_H = 350;
    const crowdCanvas = document.createElement("canvas");
    crowdCanvas.className = "nlsb-crowd-canvas";
    crowdCanvas.width = CROWD_CANVAS_W;
    crowdCanvas.height = CROWD_CANVAS_H;
    const stageLayout = document.createElement("div");
    stageLayout.className = "nlsb-stage-layout";
    stageLayout.appendChild(crowdCanvas);
    const center = document.createElement("div");
    center.className = "nlsb-center";
    const centerLabel = document.createElement("div");
    centerLabel.className = "nlsb-center-label";
    centerLabel.textContent = "配信者ステージ";
    const centerTitle = document.createElement("div");
    centerTitle.className = "nlsb-center-title";
    centerTitle.textContent = String(document.title || "").trim() || "配信中の番組";
    const centerMeta = document.createElement("div");
    centerMeta.className = "nlsb-center-meta";
    centerMeta.textContent = liveIdFromPathname();
    center.append(centerLabel, centerTitle, centerMeta);
    const seating = document.createElement("div");
    seating.className = "nlsb-seating";
    const header = document.createElement("div");
    header.className = "nlsb-header";
    const title = document.createElement("div");
    title.className = "nlsb-title";
    title.textContent = "会場参加者 0人";
    const headerRight = document.createElement("div");
    headerRight.className = "nlsb-header-right";
    const rosterBtn = document.createElement("button");
    rosterBtn.type = "button";
    rosterBtn.className = "nlsb-comeview-btn";
    rosterBtn.textContent = "👥 一覧";
    rosterBtn.title = "今この会場にいるメンバーの一覧(診断)を開く";
    rosterBtn.addEventListener("click", () => toggleRosterPanel());
    const diagBtn = document.createElement("button");
    diagBtn.type = "button";
    diagBtn.className = "nlsb-comeview-btn";
    diagBtn.textContent = "🩺 状態";
    diagBtn.title = "会場の状態(参加者数・アバター解決率など)を開く";
    diagBtn.addEventListener("click", () => toggleDiagPanel());
    const comeviewBtn = document.createElement("button");
    comeviewBtn.type = "button";
    comeviewBtn.className = "nlsb-comeview-btn";
    comeviewBtn.textContent = "💬 コメビュ";
    comeviewBtn.title = "読み上げ付きコメントビューア(別ウィンドウ)を開く";
    comeviewBtn.addEventListener("click", () => {
      try {
        chrome.runtime.sendMessage({ type: "NLS_OPEN_COMEVIEW", liveId: liveIdFromPathname() });
      } catch {
      }
    });
    const voiceBtn = document.createElement("button");
    voiceBtn.type = "button";
    voiceBtn.className = "nlsb-comeview-btn nlsb-voice-btn";
    voiceBtn.style.marginLeft = "8px";
    voiceBtn.textContent = "🔈 読み上げ: OFF";
    const voiceStatus = document.createElement("span");
    voiceStatus.className = "nlsb-voice-status";
    voiceStatus.style.marginLeft = "8px";
    voiceStatus.style.fontSize = "12px";
    voiceStatus.style.color = "#7a828e";
    const voiceLag = (
      /** @type {HTMLSpanElement} */
      voiceStatus.cloneNode()
    );
    voiceLag.className = "nlsb-voice-lag";
    const voiceGpuTip = Object.assign(
      /** @type {HTMLSpanElement} */
      voiceStatus.cloneNode(),
      { className: "nlsb-voice-gpu-tip", hidden: true }
    );
    voiceGpuTip.style.cssText += "color:#b45309;font-weight:600;";
    voiceLag.hidden = true;
    for (const el of [voiceLag, voiceGpuTip]) {
      el.style.cssText += "background:rgba(255,255,255,0.96);padding:2px 8px;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.18);";
    }
    voiceGpuTip.style.background = "#fff7e6";
    let venueWindowBtn = null;
    if (!isStandalone) {
      venueWindowBtn = document.createElement("button");
      venueWindowBtn.type = "button";
      venueWindowBtn.className = "nlsb-comeview-btn";
      venueWindowBtn.textContent = "↗ 別窓化";
      venueWindowBtn.title = "会場モードを別ウィンドウ(OBS等用)で開く";
      venueWindowBtn.style.marginLeft = "8px";
      venueWindowBtn.addEventListener("click", () => {
        try {
          chrome.runtime.sendMessage({ type: "NLS_OPEN_VENUE", liveId: liveIdFromPathname() });
          userChangedOpen = true;
          setOpen(false, true);
        } catch {
        }
      });
    }
    let tuckBtn = null;
    if (!isStandalone) {
      tuckBtn = document.createElement("button");
      tuckBtn.type = "button";
      tuckBtn.className = "nlsb-comeview-btn";
      tuckBtn.textContent = "✍ しまう";
      tuckBtn.title = "コメントを打つあいだ会場をしまいます(記録は続きます)。右下の「▲ 会場に戻る」で戻せます";
      tuckBtn.addEventListener("click", () => setTucked(true));
    }
    const note = document.createElement("div");
    note.className = "nlsb-note";
    note.textContent = `全コメント集計・最大${VENUE_FULLSCREEN_MAX_SEATS}席`;
    if (venueWindowBtn) {
      headerRight.append(...tuckBtn ? [tuckBtn] : [], rosterBtn, diagBtn, comeviewBtn, voiceBtn, voiceStatus, voiceLag, voiceGpuTip, venueWindowBtn, note, close);
    } else {
      headerRight.append(...tuckBtn ? [tuckBtn] : [], rosterBtn, diagBtn, comeviewBtn, voiceBtn, voiceStatus, voiceLag, voiceGpuTip, note, close);
    }
    header.append(title, headerRight);
    const topBar = document.createElement("div");
    topBar.className = "nlsb-topbar";
    topBar.hidden = true;
    const topBarLabel = document.createElement("div");
    topBarLabel.className = "nlsb-topbar-label";
    topBarLabel.textContent = "応援者トップ";
    const topBarList = document.createElement("div");
    topBarList.className = "nlsb-topbar-list";
    topBar.append(topBarLabel, topBarList);
    const seatsHost = document.createElement("div");
    seatsHost.className = "nlsb-seats nlsb-mode-empty";
    const venueLaneEls = createVenueStoryLaneDom();
    const venueStoryFaces = {
      faceLink: resolveVenueAssetUrl(STORY_GUIDE_FACE_LINK),
      faceGift: resolveVenueAssetUrl(STORY_GUIDE_FACE_GIFT),
      faceAd: resolveVenueAssetUrl(STORY_GUIDE_FACE_GIFT),
      faceKonta: resolveVenueAssetUrl(STORY_GUIDE_FACE_KONTA),
      faceTanu: resolveVenueAssetUrl(STORY_GUIDE_FACE_TANU)
    };
    seatsHost.appendChild(venueLaneEls.stack);
    const storyDiagHost = document.createElement("div");
    storyDiagHost.className = "nlsb-story-diag";
    storyDiagHost.hidden = true;
    seatsHost.appendChild(storyDiagHost);
    const seatNodes = [];
    for (let i = 0; i < VENUE_FULLSCREEN_MAX_SEATS; i += 1) {
      const node = createSeatNode(i);
      seatNodes.push(node);
    }
    const emptyMessage = document.createElement("div");
    emptyMessage.className = "nlsb-empty-message";
    emptyMessage.textContent = "まだ名前付きの参加者がいません";
    seatsHost.appendChild(emptyMessage);
    let venueDrag = initVenueDragState();
    const venueDragMaxScroll = () => Math.max(0, seatsHost.scrollHeight - seatsHost.clientHeight);
    const VENUE_DRAG_SWALLOW_MS = 400;
    let venueSwallow = null;
    const clearVenueSwallow = () => {
      if (!venueSwallow) return;
      seatsHost.removeEventListener("click", venueSwallow.fn, true);
      window.clearTimeout(venueSwallow.timer);
      venueSwallow = null;
    };
    seatsHost.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      clearVenueSwallow();
      venueDrag = beginVenueDrag(e.clientY, seatsHost.scrollTop);
      seatsHost.classList.add("nlsb-is-grabbing");
    });
    seatsHost.addEventListener("pointermove", (e) => {
      if (!venueDrag.active) return;
      const r = updateVenueDrag(venueDrag, e.clientY, venueDragMaxScroll());
      venueDrag = r.state;
      if (venueDrag.moved) {
        seatsHost.scrollTop = r.scrollTop;
        if (typeof e.preventDefault === "function") e.preventDefault();
      }
    });
    const endVenueDragHandler = () => {
      const { state, wasDrag } = endVenueDrag(venueDrag);
      venueDrag = state;
      seatsHost.classList.remove("nlsb-is-grabbing");
      if (wasDrag) {
        clearVenueSwallow();
        const swallow = (ev) => {
          ev.stopPropagation();
          if (typeof ev.preventDefault === "function") ev.preventDefault();
          clearVenueSwallow();
        };
        venueSwallow = { fn: swallow, timer: window.setTimeout(clearVenueSwallow, VENUE_DRAG_SWALLOW_MS) };
        seatsHost.addEventListener("click", swallow, true);
      }
    };
    seatsHost.addEventListener("pointerup", endVenueDragHandler);
    seatsHost.addEventListener("pointerleave", endVenueDragHandler);
    seatsHost.addEventListener("pointercancel", endVenueDragHandler);
    const safeArea = document.createElement("div");
    safeArea.className = "nlsb-safe-area";
    safeArea.setAttribute("aria-hidden", "true");
    if (isStandalone && liveIdFromPathname()) {
      const iframe = document.createElement("iframe");
      iframe.src = `https://live.nicovideo.jp/embed/${liveIdFromPathname()}`;
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      iframe.style.border = "none";
      iframe.style.pointerEvents = "auto";
      safeArea.appendChild(iframe);
      safeArea.style.pointerEvents = "auto";
    }
    const residentsLayer = document.createElement("div");
    residentsLayer.className = "nlsb-residents";
    residentsLayer.setAttribute("aria-hidden", "false");
    const charFrameLayer = document.createElement("div");
    charFrameLayer.className = "nlsb-charframe";
    charFrameLayer.setAttribute("aria-hidden", "true");
    const pickupEls = createVenuePickupBanner(document);
    let pickupRing = [];
    const updatePickupBanner = (fallbackRows) => {
      try {
        const rows = pickupRing.length ? pickupRing : Array.isArray(fallbackRows) ? fallbackRows : [];
        applyVenuePickupView(pickupEls, buildVenuePickupView(pickTickerHighlightEntry(rows, Date.now())));
      } catch {
      }
    };
    seating.append(header, pickupEls.root, topBar, seatsHost);
    stageLayout.append(crowdCanvas, safeArea, charFrameLayer, seating, center, residentsLayer);
    const bubbleLayer = document.createElement("div");
    bubbleLayer.className = "nlsb-bubble-layer";
    bubbleLayer.setAttribute("aria-live", "polite");
    const speechPanel = document.createElement("div");
    speechPanel.className = "nlsb-roster-panel nlsb-speech-panel";
    speechPanel.hidden = true;
    const rosterPanel = document.createElement("div");
    rosterPanel.className = "nlsb-roster-panel";
    rosterPanel.hidden = true;
    const diagPanel = document.createElement("div");
    diagPanel.className = "nlsb-roster-panel nlsb-venue-diag-panel";
    diagPanel.hidden = true;
    const hoverCardEl = createVenueHoverCardEl(document);
    stage.append(stageLayout, bubbleLayer, rosterPanel, speechPanel, diagPanel, hoverCardEl);
    const VENUE_HOVER_CARD_OPEN_DELAY_MS = 120;
    const closeHoverCard = () => {
      if (_hoverCardTimer) {
        clearTimeout(_hoverCardTimer);
        _hoverCardTimer = 0;
      }
      const anchorEl = _hoverCardOpenFor;
      _hoverCardOpenFor = null;
      hoverCardEl.classList.remove("nlsb-hover-card--open");
      if (!(anchorEl instanceof HTMLElement)) return;
      const backup = _hoverCardTitleBackupByEl.get(anchorEl);
      if (!backup) return;
      _hoverCardTitleBackupByEl.delete(anchorEl);
      if (!anchorEl.title) anchorEl.title = backup.seatTitle;
      if (backup.cellEl instanceof HTMLElement) {
        if (!backup.cellEl.title) backup.cellEl.title = backup.cellTitle;
        const img = backup.cellEl.querySelector("img");
        if (img instanceof HTMLElement && !img.title) img.title = backup.imgTitle;
      }
    };
    const resolveSeatlessHoverData = (el) => {
      try {
        const laneEl = el.closest?.(".nl-story-userlane");
        if (!(laneEl instanceof HTMLElement)) return null;
        const tier = String(laneEl.dataset?.laneName || "").trim();
        const items = (
          /** @type {any} */
          _laneItemsByTier[tier]
        );
        if (!Array.isArray(items) || !items.length) return null;
        const siblings = laneEl.querySelectorAll(".nl-story-userlane-cell");
        let idx = -1;
        for (let i = 0; i < siblings.length; i += 1) {
          if (siblings[i] === el) {
            idx = i;
            break;
          }
        }
        if (idx < 0 || idx >= items.length) return null;
        const it = items[idx];
        const seatIdx = Number(it?._venueSeatIndex);
        if (Number.isInteger(seatIdx) && seatIdx >= 0) return null;
        const u = String(it?.entry?.userId || "").trim();
        const rosterEntry = u ? liveRoster.get(u) || null : null;
        const facts = resolveVenueHoverFacts({ registered: null, rosterEntry, mirrorCell: it });
        return {
          uid: u,
          displayName: String(it?.title || "").trim(),
          count: facts.count,
          hasGift: tier === "gift" || (facts.giftCount || 0) > 0,
          giftCount: facts.giftCount,
          venueRank: facts.venueRank,
          lastAt: facts.lastAt,
          tier,
          lastText: facts.lastText,
          // 2026-10-12: 在席名簿に発言が無い人(会場を開く前に発言した人)は、鏡のセルが持つ発言を使う(カードの「セリフ」)。
          recentTexts: facts.recentTexts && facts.recentTexts.length ? facts.recentTexts : Array.isArray(it?.recentTexts) ? it.recentTexts : [],
          // ★どこから採った値かを残す（後から「どちらを見たか」を言えるようにする）。
          factsSource: facts.source,
          // 発言の証拠(2026-10-16・v1は表示に使わず census の計測だけ)。名簿の本文が空なら鏡セルの本文だけ借りる(件数/時刻は借りない)。
          speech: speechWithFallbackTexts(facts.speech, it?.recentTexts)
        };
      } catch {
        return null;
      }
    };
    const openHoverCardFor = (anchorEl) => {
      let data = _hoverCardDataByEl.get(anchorEl);
      if (!data) {
        const seatless = resolveSeatlessHoverData(anchorEl);
        if (seatless) {
          data = seatless;
          if (!seatless.uid) _hoverCardDataByEl.set(anchorEl, seatless);
        }
      }
      if (!data) return;
      _hoverCardOpenFor = anchorEl;
      const cellEl = anchorEl.querySelector instanceof Function ? anchorEl.querySelector(".nl-story-userlane-cell") || (anchorEl.classList?.contains("nl-story-userlane-cell") ? anchorEl : null) : null;
      const imgEl = cellEl instanceof HTMLElement ? cellEl.querySelector("img") : null;
      _hoverCardTitleBackupByEl.set(anchorEl, {
        seatTitle: anchorEl.title || "",
        cellTitle: cellEl instanceof HTMLElement ? cellEl.title || "" : "",
        imgTitle: imgEl instanceof HTMLElement ? imgEl.title || "" : "",
        cellEl: cellEl instanceof HTMLElement ? cellEl : null
      });
      anchorEl.title = "";
      if (cellEl instanceof HTMLElement) cellEl.title = "";
      if (imgEl instanceof HTMLElement) imgEl.title = "";
      const thumb = readVenueTileThumbState(
        /** @type {HTMLElement|null} */
        cellEl
      );
      const model = buildVenueHoverCardModel({ ...data, thumb, nowMs: Date.now(), diagMode: !diagPanel.hidden });
      try {
        observeVenueSpeechHover(_speechCensus, {
          name: model.displayName || data.displayName,
          lines: model.recentTexts && model.recentTexts.length ? model.recentTexts : model.lastText ? [model.lastText] : [],
          spoke: hasSpeech(data.speech),
          saidSpeech: /発言/.test(String(model.statLine || "")),
          // 空/嘘だったときだけ評価する原因切り分け用の手がかり: 発言回数・最後の発言から何秒・データの出所・本文の有無・uidの種類・段・名簿の本文。
          detail: () => `発言${Number(data.count) || 0}・${data.lastAt ? Math.max(0, Math.round((Date.now() - Number(data.lastAt)) / 1e3)) : "?"}秒前・出所${String(data.factsSource || "?")}・本文${data.lastText ? 1 : 0}・uid${/^\d+$/.test(String(data.uid || "")) ? "数値" : data.uid ? "匿名系" : "無"}・段${String(data.tier || "?")}`
        });
      } catch {
      }
      renderVenueHoverCard(hoverCardEl, model);
      hoverCardEl.classList.add("nlsb-hover-card--open");
      const anchorRect = anchorEl.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const cardRect = hoverCardEl.getBoundingClientRect();
      const placement = resolveVenueHoverCardPlacement({
        anchor: {
          left: anchorRect.left - stageRect.left,
          top: anchorRect.top - stageRect.top,
          width: anchorRect.width,
          height: anchorRect.height
        },
        card: { width: cardRect.width, height: cardRect.height },
        viewport: { width: stageRect.width, height: stageRect.height }
      });
      hoverCardEl.style.left = `${placement.left}px`;
      hoverCardEl.style.top = `${placement.top}px`;
    };
    const resolveHoverAnchor = (target) => {
      if (!(target instanceof HTMLElement)) return null;
      const seat = target.closest(".nlsb-seat, .nlsb-topbar-cell");
      if (seat instanceof HTMLElement) return seat;
      const cell = target.closest(".nl-story-userlane-cell");
      return cell instanceof HTMLElement ? cell : null;
    };
    const wireHoverCardDelegation = (host) => {
      host.addEventListener("pointerover", (e) => {
        if (e.pointerType === "touch") return;
        const anchorEl = resolveHoverAnchor(e.target);
        if (!(anchorEl instanceof HTMLElement)) return;
        if (anchorEl === _hoverCardOpenFor) return;
        if (_hoverCardTimer) clearTimeout(_hoverCardTimer);
        _hoverCardTimer = window.setTimeout(() => {
          _hoverCardTimer = 0;
          openHoverCardFor(anchorEl);
        }, VENUE_HOVER_CARD_OPEN_DELAY_MS);
      });
      host.addEventListener("pointerout", (e) => {
        const anchorEl = resolveHoverAnchor(e.target);
        if (!(anchorEl instanceof HTMLElement)) return;
        const related = resolveHoverAnchor(e.relatedTarget);
        if (related === anchorEl) return;
        closeHoverCard();
      });
    };
    wireHoverCardDelegation(seatsHost);
    wireHoverCardDelegation(topBarList);
    const tileIdentityFromAnchor = (el) => {
      try {
        const a = el.matches("a.nl-story-userlane-cell") ? el : el.querySelector("a.nl-story-userlane-cell");
        if (!(a instanceof HTMLElement)) return { uid: "", name: "" };
        const tail = String(a.getAttribute("href") || "").split("/user/")[1] || "";
        const cand = tail.split(/[?#/]/)[0];
        const uid = isNumericNicoUserId(cand) ? cand : "";
        const nameEl = a.querySelector(".nl-story-userlane-meta__name");
        const name = String(nameEl?.textContent || "").trim() || String(a.getAttribute("title") || "").split(" | ")[0].trim();
        return { uid, name };
      } catch {
        return { uid: "", name: "" };
      }
    };
    const wireSpeechPanelDelegation = (host) => {
      host.addEventListener("click", (e) => {
        const anchorEl = resolveHoverAnchor(e.target);
        if (!(anchorEl instanceof HTMLElement)) return;
        const data = _hoverCardDataByEl.get(anchorEl) || resolveSeatlessHoverData(anchorEl);
        const fromTile = data?.uid ? { uid: "", name: "" } : tileIdentityFromAnchor(anchorEl);
        const uid = String(data?.uid || fromTile.uid || "").trim();
        if (!uid) return;
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        closeHoverCard();
        let avatarSrc = "";
        try {
          const imgEl = anchorEl.querySelector(".nl-story-userlane-avatar");
          if (imgEl instanceof HTMLImageElement) avatarSrc = imgEl.currentSrc || imgEl.src || "";
        } catch {
        }
        if (!speechPanel.hidden) closeSpeechPanel();
        let statsText = "";
        try {
          statsText = String(anchorEl.querySelector("[data-stats]")?.getAttribute("data-stats") || "");
        } catch {
        }
        const fallbackTexts = Array.isArray(data?.recentTexts) && data.recentTexts.length ? data.recentTexts : data?.lastText ? [data.lastText] : [];
        void openSpeechPanelFor({ uid, displayName: String(data?.displayName || fromTile.name || ""), avatarSrc, statsText, fallbackTexts });
      });
    };
    wireSpeechPanelDelegation(seatsHost);
    wireSpeechPanelDelegation(topBarList);
    seatsHost.addEventListener("pointerdown", closeHoverCard);
    seatsHost.addEventListener("scroll", closeHoverCard);
    root.append(toggle, stage);
    parent.appendChild(root);
    let open = false;
    let userChangedOpen = false;
    let voiceLoadingTimer = 0;
    const renderVoiceLoading = (state, reason) => {
      const view = resolveVoiceLoadingView(state, "venue", reason);
      voiceStatus.classList.toggle("is-loading", view.kind === "loading");
      voiceStatus.classList.toggle("is-error", view.kind === "error");
      voiceStatus.textContent = view.text;
    };
    const driveVoiceLoading = (state, reason = "") => {
      if (voiceLoadingTimer) {
        window.clearTimeout(voiceLoadingTimer);
        voiceLoadingTimer = 0;
      }
      if (state === "checking") {
        voiceStatus.classList.remove("is-loading", "is-error");
        voiceStatus.textContent = "";
        voiceLoadingTimer = window.setTimeout(() => {
          voiceLoadingTimer = 0;
          if (shouldRenderLoading("checking", VOICE_LOADING_FLICKER_GUARD_MS)) renderVoiceLoading("checking", "");
        }, VOICE_LOADING_FLICKER_GUARD_MS);
        return;
      }
      renderVoiceLoading(state, reason);
    };
    let _venueVoiceDiagLatest = (
      /** @type {import('../lib/voiceDiag.js').VoiceDiagState | null} */
      null
    );
    const venueVoiceDiagPublisher = createTrailingPublisher(() => {
      if (_venueVoiceDiagLatest) void chrome.storage.local.set({ [KEY_VOICE_DIAG]: { ...buildVoiceDiagSnapshot(_venueVoiceDiagLatest, Date.now(), liveIdFromPathname()), source: "venue" } }).catch(() => {
      });
    }, 3e3);
    const publishVenueVoiceDiag = (diag) => {
      _venueVoiceDiagLatest = diag;
      venueVoiceDiagPublisher.request();
    };
    const venueVoiceWarmup = createVoicevoxWarmup();
    wireVoiceQualitySetting();
    const voicePlayer = new VoicePlayer({
      storage: typeof chrome !== "undefined" && chrome.storage ? chrome.storage.local : null,
      storageOnChanged: typeof chrome !== "undefined" && chrome.storage ? chrome.storage.onChanged : null,
      // P2: 音量の追従
      onDiag: publishVenueVoiceDiag,
      onToggle: (enabled, readNameEnabled, toggleBusy) => {
        voiceBtn.disabled = toggleBusy;
        voiceBtn.classList.toggle("is-on", enabled);
        voiceBtn.textContent = enabled ? "🔊 読み上げ: ON" : "🔈 読み上げ: OFF";
      },
      // onStatus は読み上げブロック警告(audio NotAllowedError)等の臨時メッセージ用に温存。
      //   起動待ちの状態表示は onLoadingState(driveVoiceLoading)が所有する。
      onStatus: (msg) => {
        if (!msg) return;
        voiceStatus.classList.remove("is-loading");
        voiceStatus.classList.toggle("is-error", /見つかりません|ブロック/.test(msg));
        voiceStatus.textContent = msg;
      },
      onLoadingState: (state, reason = "") => driveVoiceLoading(state, reason),
      onSkip: () => {
      },
      onLagNotice: (text) => {
        voiceLag.textContent = text;
        voiceLag.hidden = !text;
      },
      onGpuTip: (text) => {
        voiceGpuTip.textContent = text;
        voiceGpuTip.title = text;
        voiceGpuTip.hidden = !text;
      },
      isObsMode: () => {
        return (window.name || "").includes("OBS") || window.location.search.includes("obs=");
      },
      audioConstructor: typeof window !== "undefined" ? window.Audio : null,
      createObjectURL: typeof URL !== "undefined" ? URL.createObjectURL.bind(URL) : null,
      revokeObjectURL: typeof URL !== "undefined" ? URL.revokeObjectURL.bind(URL) : null,
      fetchVoicevoxAlive: isVoicevoxAlive,
      // ★v0.1.1326: 理由付きの生存確認を配線(未配線だと reason が常に 'refused' になり、
      //   起動しているのに「見つかりません」と言い続ける従来の誤案内が残る)。
      probeVoicevoxAlive,
      fetchVoiceStyleIds: listVoicevoxStyleIds,
      initVoiceSpeaker: (id) => venueVoiceWarmup.ensureWhenIdle(id),
      // P3 の先読みは合成の合間に裏で
      voiceWarmup: venueVoiceWarmup,
      probeVoiceStreaming: probeVoicevoxStreaming,
      probeVoiceGpu: probeVoicevoxGpuCapable,
      createStreamedAudio: createBrowserStreamedAudio,
      // 声を少しずつ(voiceStream.js)
      fetchSynthesizeVoice: withVoiceWarmup(venueVoiceWarmup, synthesizeVoice),
      // 初めての声は合成の前に読み込む
      resolveVoice: resolveVoiceForUser
    });
    wireVoiceWarmupHooks(venueVoiceWarmup, () => !voicePlayer.playing && voicePlayer.queue.length === 0, () => voicePlayer.diag, chromeVoiceEngineLink());
    wireVenueVoiceTestHook(voicePlayer);
    const venueReaderLease = startVoiceReaderLease(() => open && voicePlayer.enabled, liveIdFromPathname, { onPageHide: (fn) => window.addEventListener("pagehide", fn) });
    voiceBtn.addEventListener("click", () => {
      if (voicePlayer.enabled) {
        voicePlayer.disable();
      } else {
        voicePlayer.enable();
      }
    });
    void voicePlayer.initialize({ forceOn: true });
    let aggregateTimer = 0;
    let aggregateInFlight = false;
    let speechTimer = 0;
    let speechInFlight = false;
    let speechGeneration = 0;
    let speechLiveId = "";
    let speechState = { seenKeys: null, primed: false };
    const speechStreaks = /* @__PURE__ */ new Map();
    let activeLiveId = "";
    let escapeListening = false;
    let lastCrowdCount = -1;
    let lastCrowdSeed = NaN;
    let crowdAnimCount = 0;
    let crowdAnimSeed = 0;
    let crowdHeatLevel = 0;
    let crowdRaf = 0;
    let crowdLastDrawMs = 0;
    const crowdReducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const charaLive = startCharaLive({
      doc: document,
      // ★必ず会場ステージの内側へ入れる(2026-08-25 実機で踏んだ)。
      //   body 直下だと .nlsb-root(全画面・同じ z-index 2147483000・DOM順で後)に
      //   完全に覆われて一度も見えなかった。ステージ内なら会場の階層(z6)に乗る。
      mount: stage,
      resolveUrl: resolveVenueAssetUrl,
      getHeatLevel: () => crowdHeatLevel,
      reducedMotion: crowdReducedMotion,
      // ★2026-10-12 ユーザー要望「とりあえず浮かんでるだけでいい」: しゃべらない(相槌・返事・考え中の「…」を出さない)。
      //   吹き出しが会場の内容(広告ランキング等)に被っていた。浮遊・まばたき・表情だけ続ける。
      //   しゃべらせたくなったら true(または削除=既定 true)に戻すだけ。
      talk: false
    });
    charaLive.setVisible(false);
    try {
      globalThis.__nls_chara_live_probe__ = () => {
        const census = collectCharaLiveCensus(document);
        const verdict = charaLiveVerdict(census);
        return { line: verdict.line, visible: verdict.visible, census };
      };
    } catch {
    }
    try {
      globalThis.__nls_chara_cheer_probe__ = (n = 100) => ({ started: charaLive.cheer({ milestone: Number(n) }) });
    } catch {
    }
    try {
      globalThis.__nls_hover_note_probe__ = () => {
        const cardEl = document.querySelector(".nlsb-hover-card");
        const el = (
          /** @type {HTMLElement|null} */
          cardEl ? cardEl.querySelector(".nlsb-hover-card__presence") : null
        );
        let displayNone = false;
        try {
          displayNone = el ? getComputedStyle(el).display === "none" : false;
        } catch {
        }
        const census = {
          cardExists: Boolean(cardEl),
          elementExists: Boolean(el),
          text: el ? String(el.textContent || "") : "",
          hidden: el ? el.hidden === true : false,
          displayNone,
          /*
           * ★どのビルドで動いているか。新旧の取り違えを防ぐ。
           *   ★`typeof` で囲むのは既存の作法（popup-entry / status-entry と同じ）。
           *     esbuild の define で置換される値なので、型宣言は無い。
           */
          buildId: true ? String("yt-2026-11-04T06:24") : ""
        };
        const verdict = venueHoverCardPresenceVerdict(census);
        return { line: verdict.line, visible: verdict.visible, reason: verdict.reason, census };
      };
    } catch {
    }
    let baseRows = [];
    let aggregatedChunkSeqs = [];
    let aggregatedCandidates = [];
    const liveRoster = /* @__PURE__ */ new Map();
    const rosterDriven = VENUE_ROSTER_ENABLED && !isStandalone;
    let rosterCommitRaf = 0;
    let rosterPruneTimer = 0;
    let lastGoodRows = [];
    let profileAvatarMap = null;
    let laneMirrorSnap = null;
    let laneMirrorPaintSnap = null;
    let _laneMirrorSanitizeDropped = 0;
    let _laneReceiptFromPopup = null;
    let _venueDomFingerprintLast = "";
    let _venueUnseatedCount = 0;
    let _venueTitleBaseText = "";
    let _venueTitleLastText = "";
    let _venueStoryUserLaneLastTiledLid = "";
    const _venueMirrorIntake = createVenueMirrorIntakeState();
    let _laneMirrorSanitizeIssues = "";
    function acceptLaneMirrorSnapshot(rawSnap) {
      const r = sanitizeLaneMirrorForRead(rawSnap);
      _laneMirrorSanitizeDropped = r.droppedLinkAnon + r.droppedKontaAnon + r.droppedUnkeyed;
      _laneMirrorSanitizeIssues = Array.isArray(r.issues) ? r.issues.join("/") : "";
      return (
        /** @type {any} */
        r.snap
      );
    }
    let _lastPaintedMirrorCapturedAt = 0;
    let storyDiagMirrorSnap = null;
    let storyDiagMirrorRenderSig = "";
    let panelSummarySnap = null;
    let cheerPrevCount = null;
    let cheerLiveId = "";
    const noteCheerCount = () => {
      try {
        const lid = String(activeLiveId || liveIdFromPathname() || "");
        if (lid !== cheerLiveId) {
          cheerLiveId = lid;
          cheerPrevCount = null;
        }
        const r = resolveCommentCheer(cheerPrevCount, selectDisplayRecordedCount(panelSummarySnap));
        cheerPrevCount = r.baseline;
        if (r.cheer) charaLive.cheer({ milestone: r.cheer.milestone });
      } catch {
      }
    };
    let _panelSummaryLastSeenAt = 0;
    const venueTransientFirstSeen = /* @__PURE__ */ new Map();
    let laneMirrorRecommitRaf = 0;
    let hasRenderedNonEmpty = false;
    let _anonExcludedCount = 0;
    const _seatLinkParity = createVenueSeatLinkParityState();
    const _yukkuriNamedCensus2 = createVenueYukkuriNamedCensusState();
    const _speechCensus = createVenueSpeechCensusState();
    const _tileCountCensus = createVenueTileCountState();
    const adoptVenueMirrorGuarded = (incoming, liveIdNow) => {
      const d = decideVenueMirrorAdoption(laneMirrorSnap, incoming, liveIdNow, Date.now());
      if (!d.adopt && d.shrunk) noteVenueMirrorShrinkRefused(_tileCountCensus);
      return d.adopt;
    };
    let _venueTileOrigin = "fallback:absent";
    const _bubbleChurn = createVenueBubbleChurnState();
    let _lastTopBarSig = "";
    let _topBarShownOnce = false;
    const _lastVenueRankByNode = /* @__PURE__ */ new WeakMap();
    const _hoverCardDataByEl = /* @__PURE__ */ new WeakMap();
    const _openLatency = createVenueOpenLatencyState();
    let _laneItemsByTier = { link: [], gift: [], ad: [], konta: [], tanu: [] };
    let _seatOwnerTierPrev = /* @__PURE__ */ new Map();
    const _hoverCardTitleBackupByEl = /* @__PURE__ */ new WeakMap();
    let _hoverCardTimer = 0;
    let _hoverCardOpenFor = null;
    let lastRosterInput = { allSeats: [], visibleSeats: [], audienceCount: 0 };
    let _lastBroadcasterUid = "";
    let _venueSeatsDiagLastWriteAt = 0;
    let _effectSoundEnabledCache = true;
    void chrome.storage.local.get(KEY_EFFECT_SOUND_ENABLED).then((bag) => {
      _effectSoundEnabledCache = isEffectSoundEnabled(bag?.[KEY_EFFECT_SOUND_ENABLED]);
    }).catch(() => {
    });
    chrome.storage.onChanged?.addListener?.((changes, area) => {
      if (area !== "local" || !changes[KEY_EFFECT_SOUND_ENABLED]) return;
      _effectSoundEnabledCache = isEffectSoundEnabled(changes[KEY_EFFECT_SOUND_ENABLED].newValue);
    });
    let _customSoundState = { customVariantPaths: {}, gainFor: () => 1, urlsById: /* @__PURE__ */ new Map() };
    const refreshCustomSoundState = () => {
      void loadCustomSoundRuntimeState({ previousUrlsById: _customSoundState.urlsById }).then((state) => {
        _customSoundState = state;
      }).catch(() => {
      });
    };
    refreshCustomSoundState();
    safeStorageOnChangedAddListener((changes, area) => {
      if (area !== "local" || !changes[KEY_CUSTOM_SOUND_REV]) return;
      refreshCustomSoundState();
    });
    const buildEffectSoundDeps = (kind) => {
      const variantPaths = mergeVariantPaths(EFFECT_SOUND_VARIANT_PATHS, _customSoundState.customVariantPaths);
      const variants = variantPaths[String(kind)];
      const n = Array.isArray(variants) ? variants.length : 1;
      return {
        // playEffectSound の deps 型は Record<string, string[]>(可変)だが、実体は
        //   EFFECT_SOUND_VARIANT_PATHS 由来の Object.freeze 配列を含みうる(effectSoundPlayer.js は
        //   resolveEffectSoundPath 内で読むだけで変更しないため実害なし)。型注釈だけの相違。
        variantPaths: (
          /** @type {Record<string, string[]>} */
          variantPaths
        ),
        paths: EFFECT_SOUND_PATHS,
        getUrl: (p) => getUrlForCustomSound(p, (q) => chrome.runtime.getURL(q)),
        rng: rotationRngFor(kind, n),
        volume: _customSoundState.gainFor(kind) * defaultVolumeForEffectSoundKind(kind)
      };
    };
    let _venueEffectSoundPresenceLastWriteAt = 0;
    const writeVenueEffectSoundPresence = () => {
      const now = Date.now();
      if (now - _venueEffectSoundPresenceLastWriteAt < 3e3) return;
      _venueEffectSoundPresenceLastWriteAt = now;
      void chrome.storage.local.set({ [KEY_VENUE_EFFECT_SOUND_PRESENCE]: now }).catch(() => {
      });
    };
    const _giftEffectDiagCounters = makeInitialGiftEffectDiag();
    let _giftEffectDiagLastWriteAt = 0;
    let _giftEffectDiagDirty = false;
    let _giftEffectDiagFlushTimer = 0;
    let _giftDeltaState = makeInitialGiftDeltaState("");
    let _lastArrivalEffectAtMs = 0;
    const writeGiftEffectDiagSnapshot = (now) => {
      _giftEffectDiagLastWriteAt = now;
      _giftEffectDiagDirty = false;
      _giftEffectDiagCounters.soundEnabled = _effectSoundEnabledCache;
      const snap = buildGiftEffectDiagSnapshot(_giftEffectDiagCounters, now, liveIdFromPathname());
      void chrome.storage.local.set({ [KEY_GIFT_EFFECT_DIAG]: snap }).catch(() => {
      });
    };
    const publishGiftEffectDiag = () => {
      const now = Date.now();
      const elapsed2 = now - _giftEffectDiagLastWriteAt;
      if (elapsed2 < 3e3) {
        _giftEffectDiagDirty = true;
        if (!_giftEffectDiagFlushTimer) {
          _giftEffectDiagFlushTimer = window.setTimeout(() => {
            _giftEffectDiagFlushTimer = 0;
            if (_giftEffectDiagDirty) writeGiftEffectDiagSnapshot(Date.now());
          }, 3e3 - elapsed2 + 50);
        }
        return;
      }
      writeGiftEffectDiagSnapshot(now);
    };
    const GIFT_COMBO_WINDOW_MS = 1e4;
    let _giftComboState = makeInitialComboState();
    let _pendingGiftSound = (
      /** @type {{ kind: string, timer: number, run: () => void }|null} */
      null
    );
    const scheduleGiftSound = (tier, _flightMs, detectAt) => {
      if (!_effectSoundEnabledCache) {
        _giftEffectDiagCounters.giftSoundOff += 1;
        publishGiftEffectDiag();
        return "off";
      }
      const baseKind = effectSoundKindForGiftTier(tier);
      _giftComboState = directHit(_giftComboState, baseKind, Date.now(), {
        ladder: GIFT_TIER_LADDER,
        windowMs: GIFT_COMBO_WINDOW_MS
      });
      const kind = _giftComboState.kind || baseKind;
      if (_pendingGiftSound) {
        _pendingGiftSound.kind = kind;
        return "coalesced";
      }
      const pending = { kind, timer: 0, run: (
        /** @type {() => void} */
        (() => {
        })
      ) };
      const runPendingGiftSound = () => {
        _pendingGiftSound = null;
        try {
          const playResult = playEffectSound(pending.kind, buildEffectSoundDeps(pending.kind));
          if (playResult === "played") {
            _giftEffectDiagCounters.giftSoundPlayed += 1;
            if (Number.isFinite(Number(detectAt)) && Number(detectAt) > 0) {
              const gap = Math.max(0, Date.now() - Number(detectAt));
              _giftEffectDiagCounters.lastSoundGapMs = gap;
              _giftEffectDiagCounters.avgSoundGapMs = computeGiftGapAverage(_giftEffectDiagCounters.avgSoundGapMs, gap);
            }
            if (pending.kind === "gift_large" || pending.kind === "gift_mega") {
              appendHighlightAndPublish(speechLiveId, pending.kind, Date.now());
            }
          } else {
            const field = giftSoundDiagFieldForPlayResult(playResult);
            if (field) _giftEffectDiagCounters[field] += 1;
          }
        } catch {
          _giftEffectDiagCounters.giftSoundError += 1;
        }
        publishGiftEffectDiag();
      };
      pending.timer = window.setTimeout(runPendingGiftSound, 0);
      pending.run = runPendingGiftSound;
      _pendingGiftSound = pending;
      return "scheduled";
    };
    window.addEventListener(
      "pagehide",
      () => {
        if (_pendingGiftSound && _pendingGiftSound.run) {
          window.clearTimeout(_pendingGiftSound.timer);
          _pendingGiftSound.run();
        }
      },
      { once: true }
    );
    const appendHighlightAndPublish = (liveId, kind, atMs) => {
      if (!isHighlightWorthyKind(kind)) return;
      void safeStorageLocalGet(highlightLedgerReadKeys(liveId)).then((bag) => {
        const plan = planHighlightAppend(bag, { liveId, kind, atMs });
        if (plan) void safeStorageLocalSet(plan);
      });
    };
    const renderRosterPanel = () => {
      const roster = buildVenueRoster(lastRosterInput);
      const summaryLine = formatVenueRosterSummary(roster.summary);
      const head = `<div class="nlsb-roster-head"><strong>会場メンバー一覧（診断）</strong><button type="button" class="nlsb-roster-close" aria-label="閉じる">×</button></div><div class="nlsb-roster-summary">${escapeHtml(summaryLine)}</div>`;
      const rowsHtml = roster.rows.map((r) => {
        const who = r.name || (r.userId ? `id:${r.userId}` : "匿名");
        const badges = (r.hasThumb ? '<span class="nlsb-roster-badge thumb">サムネ</span>' : "") + (r.isGift ? '<span class="nlsb-roster-badge gift">ギフト</span>' : "") + (r.visible ? '<span class="nlsb-roster-badge on">表示中</span>' : '<span class="nlsb-roster-badge off">隠れ</span>');
        return `<div class="nlsb-roster-row"><span class="nlsb-roster-seat">#${r.seatIndex + 1}</span><span class="nlsb-roster-who">${escapeHtml(who)}</span><span class="nlsb-roster-badges">${badges}</span></div>`;
      }).join("");
      rosterPanel.innerHTML = head + `<div class="nlsb-roster-list">${rowsHtml || '<div class="nlsb-roster-empty">まだ誰もいません</div>'}</div>`;
      const closeBtn = rosterPanel.querySelector(".nlsb-roster-close");
      if (closeBtn) closeBtn.addEventListener("click", () => toggleRosterPanel(false));
    };
    const onRosterOutsideClick = (event) => {
      if (rosterPanel.hidden) return;
      const target = (
        /** @type {Node|null} */
        event.target
      );
      if (target && (rosterPanel.contains(target) || rosterBtn.contains(target))) return;
      toggleRosterPanel(false);
    };
    const readVenueCommentRowsForSpeech = async (liveId) => {
      const lid = String(liveId || "").trim();
      if (!lid) return { rows: [], readFailed: true, contextLost: false };
      if (!hasVenueExtensionContext()) return { rows: [], readFailed: true, contextLost: true };
      let rows = [];
      let readFailed = false;
      try {
        const result = await runStorageOpWithTimeout(
          () => readChunkedComments(lid, commentsStorageKey(lid), (keys) => chrome.storage.local.get(keys)),
          8e3
        );
        rows = Array.isArray(result?.rows) ? result.rows : [];
      } catch {
        rows = [];
        readFailed = true;
      }
      try {
        const tKey = tailStorageKey(lid);
        const bag = await runStorageOpWithTimeout(() => chrome.storage.local.get(tKey), 8e3);
        rows = combineCanonicalComeviewRows(rows, Array.isArray(bag?.[tKey]) ? bag[tKey] : []);
      } catch {
      }
      return { rows, readFailed, contextLost: !hasVenueExtensionContext() };
    };
    const onSpeechOutsideClick = (event) => {
      if (speechPanel.hidden) return;
      const target = (
        /** @type {Node|null} */
        event.target
      );
      if (target && speechPanel.contains(target)) return;
      closeSpeechPanel();
    };
    let speechOpenGen = 0;
    const closeSpeechPanel = () => {
      speechOpenGen += 1;
      speechPanel.hidden = true;
      document.removeEventListener("click", onSpeechOutsideClick, true);
    };
    const buildSpeechPanelHeadHtml = (uid, name, avatarSrc, note2, countNote) => {
      const linked = buildUserProfileLinkedLabelHtml(uid, name);
      const avatar = avatarSrc ? `<img class="nlsb-roster-avatar" src="${escapeHtml(avatarSrc)}" alt="">` : "";
      const noteHtml = note2 ? `<span class="nlsb-roster-note">${escapeHtml(note2)}</span>` : "";
      return `<div class="nlsb-roster-head">` + avatar + `<span class="nlsb-roster-title">${linked} の発言${escapeHtml(countNote || "")}</span>` + noteHtml + `<button type="button" class="nlsb-roster-close" aria-label="閉じる">✕</button></div>`;
    };
    const readGiftHtmlForSpeech = async (uid, statsText) => {
      try {
        const lidG = String(activeLiveId || liveIdFromPathname() || "");
        const gKey = giftSubAppHistoryStorageKey(lidG);
        const aKey = adObservationStorageKey(lidG);
        const gBag = await runStorageOpWithTimeout(() => chrome.storage.local.get([gKey, aKey]), 4e3);
        const adLog = (
          /** @type {Record<string, any>} */
          gBag?.[aKey] || {}
        );
        const adNote = parseTileStatsText(statsText).ad != null ? adObservationNote(adLog[uid], Date.now()) : "";
        const adHtml = adNote ? `<div class="nlsb-speech-gifts"><div class="nlsb-speech-gifts__head">📣 広告の動き</div><div class="nlsb-speech-gifts__note">${escapeHtml(adNote)}</div></div>` : "";
        return adHtml + giftThrowsSectionHtml(
          giftThrowsForUser({ payload: gBag?.[gKey], uid, liveId: lidG, tileGiftPt: parseTileStatsText(statsText).gift, nowMs: Date.now() }),
          escapeHtml,
          Date.now(),
          parseTileStatsText(statsText).gift != null
        );
      } catch {
        return "";
      }
    };
    const openSpeechPanelFor = async (who) => {
      const uid = String(who?.uid || "").trim();
      const name = String(who?.displayName || "").trim() || (uid ? anonymousDisplayLabel(uid) : "") || "(名前なし)";
      if (!uid) return;
      const avatarSrc = String(who?.avatarSrc || "").trim();
      const statsText = String(who?.statsText || "");
      const gen = speechOpenGen += 1;
      const head = buildSpeechPanelHeadHtml(uid, name, avatarSrc, "", "");
      speechPanel.innerHTML = `${head}<div class="nlsb-roster-list"><div class="nlsb-roster-empty">読み込み中…</div></div>`;
      speechPanel.hidden = false;
      const closeBtnEl = speechPanel.querySelector(".nlsb-roster-close");
      if (closeBtnEl) closeBtnEl.addEventListener("click", () => closeSpeechPanel());
      setTimeout(() => {
        if (!speechPanel.hidden) document.addEventListener("click", onSpeechOutsideClick, true);
      }, 0);
      let rows = [];
      let total = 0;
      let readState = { readFailed: false, contextLost: false };
      try {
        const lid = String(activeLiveId || liveIdFromPathname() || "");
        const { rows: raw, ...st } = await readVenueCommentRowsForSpeech(lid);
        readState = st;
        const userKey = comeviewUserKeyForRow({ userId: uid });
        const picked = extractUserCommentRows(raw, userKey, VENUE_SPEECH_PANEL_MAX);
        rows = picked.rows;
        total = picked.total;
      } catch {
        rows = [];
        total = 0;
        readState = { readFailed: true, contextLost: !hasVenueExtensionContext() };
      }
      if (speechPanel.hidden || gen !== speechOpenGen) return;
      const listHtml = rows.length ? rows.slice().reverse().map((r) => {
        const t = String(r?.text || "").trim();
        if (!t) return "";
        const at = Number(r?.capturedAt) || 0;
        const rel3 = at > 0 ? formatVenueHoverRelativeTime(at, Date.now()) : "";
        return `<div class="nlsb-roster-row"><span class="nlsb-roster-who">${escapeHtml(t)}</span><span class="nlsb-roster-badges">${escapeHtml(rel3)}</span></div>`;
      }).join("") : speechFallbackListHtml(total ? [] : who?.fallbackTexts, readState, escapeHtml, VENUE_SPEECH_PANEL_MAX);
      const note2 = total > rows.length ? `（新しい ${rows.length} 件を表示 / 全 ${total} 件）` : `（全 ${total} 件）`;
      let presenceNote = "";
      try {
        let lastAt = 0;
        for (const r of rows) {
          const at = Number(r?.capturedAt) || 0;
          if (at > lastAt) lastAt = at;
        }
        presenceNote = buildVenuePresenceNote({
          count: total,
          giftCount: null,
          lastAt,
          nowMs: Date.now()
        });
      } catch {
        presenceNote = "";
      }
      speechPanel.innerHTML = buildSpeechPanelHeadHtml(uid, name, avatarSrc, presenceNote, total ? note2 : "") + // v0.1.1658: ギフト・広告の応援の一行(タイルと同じ値)。
      (speechSupportLine(statsText) ? `<div class="nlsb-speech-support">${escapeHtml(speechSupportLine(statsText))}</div>` : "") + `<div class="nlsb-roster-list">${listHtml || `<div class="nlsb-roster-empty">${escapeHtml(speechEmptyMessage(statsText, readState))}</div>`}</div>`;
      const closeBtn2 = speechPanel.querySelector(".nlsb-roster-close");
      if (closeBtn2) closeBtn2.addEventListener("click", () => closeSpeechPanel());
      void readGiftHtmlForSpeech(uid, statsText).then((html) => {
        if (!html || speechPanel.hidden || gen !== speechOpenGen) return;
        speechPanel.querySelector(".nlsb-roster-list")?.insertAdjacentHTML("beforebegin", html);
      });
    };
    const toggleRosterPanel = (force) => {
      const next = typeof force === "boolean" ? force : rosterPanel.hidden;
      if (next) renderRosterPanel();
      rosterPanel.hidden = !next;
      if (next) {
        setTimeout(() => {
          if (!rosterPanel.hidden) document.addEventListener("click", onRosterOutsideClick, true);
        }, 0);
      } else {
        document.removeEventListener("click", onRosterOutsideClick, true);
      }
    };
    let _lastVenueSeatsDiagObs = {};
    let _lastVenueDiagSig = "";
    const renderDiagPanel = () => {
      const participants = (lastRosterInput.allSeats || []).map((s) => s && s.participant).filter(Boolean);
      const counts = computeVenueParticipantAvatarCounts(participants);
      const seatsDiag = _lastVenueSeatsDiagObs || {};
      const sig = venueDiagSig(counts, seatsDiag);
      if (sig === _lastVenueDiagSig && diagPanel.querySelector(".nl-venue-diag")) return;
      _lastVenueDiagSig = sig;
      const updatedAgoMs = Number.isFinite(Number(seatsDiag.lastUpdateAt)) && Number(seatsDiag.lastUpdateAt) > 0 ? Math.max(0, nowMs() - Number(seatsDiag.lastUpdateAt)) : -1;
      const body = buildVenueDiagHtml({ counts, seatsDiag, updatedAgoMs });
      diagPanel.innerHTML = `<div class="nlsb-roster-head"><strong>🩺 会場の状態</strong><button type="button" class="nlsb-roster-close" aria-label="閉じる">×</button></div>` + body;
      const closeBtn = diagPanel.querySelector(".nlsb-roster-close");
      if (closeBtn) closeBtn.addEventListener("click", () => toggleDiagPanel(false));
    };
    const onDiagOutsideClick = (event) => {
      if (diagPanel.hidden) return;
      const target = (
        /** @type {Node|null} */
        event.target
      );
      if (target && (diagPanel.contains(target) || diagBtn.contains(target))) return;
      toggleDiagPanel(false);
    };
    const toggleDiagPanel = (force) => {
      const next = typeof force === "boolean" ? force : diagPanel.hidden;
      if (next) {
        _lastVenueDiagSig = "";
        renderDiagPanel();
      }
      diagPanel.hidden = !next;
      if (next) {
        setTimeout(() => {
          if (!diagPanel.hidden) document.addEventListener("click", onDiagOutsideClick, true);
        }, 0);
      } else {
        document.removeEventListener("click", onDiagOutsideClick, true);
      }
    };
    const spokenUserIds = /* @__PURE__ */ new Set();
    let seatByKey = /* @__PURE__ */ new Map();
    let supporterOrderKeys = [];
    let _supporterRankDrops = 0;
    let _supporterRankOvertakes = 0;
    const bubbleBySeat = /* @__PURE__ */ new Map();
    const activeBubbles = [];
    let bubbleFlowTimestamps = [];
    const recordBubbleFlow = (nowMs2) => {
      bubbleFlowTimestamps.push(nowMs2);
      const cutoff = nowMs2 - BUBBLE_FLOW_WINDOW_MS;
      if (bubbleFlowTimestamps.length > 256 || bubbleFlowTimestamps[0] < cutoff) {
        bubbleFlowTimestamps = bubbleFlowTimestamps.filter((t) => t >= cutoff);
      }
    };
    const currentBubbleFlowPerSec = (nowMs2) => {
      const cutoff = nowMs2 - BUBBLE_FLOW_WINDOW_MS;
      const n = bubbleFlowTimestamps.filter((t) => t >= cutoff).length;
      return n / BUBBLE_FLOW_WINDOW_MS * 1e3;
    };
    const removeBubble = (bubble) => {
      if (!bubble || bubble.removed) return;
      bubble.removed = true;
      try {
        observeVenueBubbleRemoval(_bubbleChurn, bubble.voiceState);
      } catch {
      }
      if (bubble.fadeTimer) clearTimeout(bubble.fadeTimer);
      if (bubble.removeTimer) clearTimeout(bubble.removeTimer);
      if (bubble.speakingCapTimer) clearTimeout(bubble.speakingCapTimer);
      const key = bubble.bubbleKey != null ? bubble.bubbleKey : bubble.seatIndex;
      if (bubbleBySeat.get(key) === bubble) {
        bubbleBySeat.delete(key);
      }
      const index = activeBubbles.indexOf(bubble);
      if (index >= 0) activeBubbles.splice(index, 1);
      bubble.element.remove();
    };
    const crowdBubbleAnchor = (speakerKey) => {
      let h = 2166136261;
      const s = String(speakerKey || "");
      for (let i = 0; i < s.length; i += 1) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      const frac = (h >>> 0) % 1e3 / 1e3;
      let w = 800;
      let bottom = 560;
      try {
        const r = bubbleLayer.getBoundingClientRect();
        if (r && r.width > 0) w = r.width;
        if (r && r.height > 0) bottom = r.height - 80;
      } catch {
      }
      const x = Math.round(40 + frac * Math.max(80, w - 200));
      return { x, y: Math.max(40, bottom) };
    };
    const clearBubbles = () => {
      for (const bubble of [...activeBubbles]) removeBubble(bubble);
    };
    const truncateBubbleText = (text) => {
      const chars = Array.from(String(text || "").trim());
      if (chars.length <= BUBBLE_TEXT_MAX) return chars.join("");
      return `${chars.slice(0, BUBBLE_TEXT_MAX).join("")}…`;
    };
    const showSpeechBubble = (speech) => {
      const seatIndex = seatByKey.get(speech.speakerKey);
      const hasSeat = typeof seatIndex === "number" && Number.isInteger(seatIndex);
      const node = hasSeat ? seatNodes[seatIndex] : null;
      const seatUsable = hasSeat && node && !node.seat.classList.contains("nlsb-is-empty");
      const streak = updateSpeechStreak(speechStreaks, speech.speakerKey, Date.now());
      if (seatUsable) {
        node.seat.classList.remove("nlsb-seat-speaking");
        void node.seat.offsetWidth;
        node.seat.classList.add("nlsb-seat-speaking");
        window.setTimeout(() => node.seat.classList.remove("nlsb-seat-speaking"), 650);
        const streakStage = streakGlowStage(streak.count);
        if (streakStage > 0) node.seat.dataset.streak = String(streakStage);
        else delete node.seat.dataset.streak;
      }
      const text = truncateBubbleText(speech.text);
      if (!text) return;
      const bubbleKey = seatUsable ? seatIndex : `nf:${speech.speakerKey}`;
      const previous = bubbleBySeat.get(bubbleKey);
      if (previous) removeBubble(previous);
      if (activeBubbles.length >= BUBBLE_MAX) {
        const toEvict = selectBubblesToEvict(activeBubbles, BUBBLE_MAX - 1, Date.now());
        for (const victim of toEvict) removeBubble(victim);
        try {
          observeVenueBubbleEviction(_bubbleChurn, toEvict.length);
        } catch {
        }
      }
      const element = document.createElement("div");
      element.className = "nlsb-bubble";
      const whoSpan = document.createElement("span");
      whoSpan.className = "nlsb-bubble-who";
      const whoName = String(
        /** @type {any} */
        speech.name || ""
      ).trim();
      const whoUid = String(
        /** @type {any} */
        speech.userId || ""
      ).trim();
      whoSpan.textContent = (whoName && !isGenericComeviewName(whoName) ? whoName : "") || anonymousDisplayLabel(whoUid || speech.speakerKey);
      const textSpan = document.createElement("span");
      textSpan.className = "nlsb-bubble-text";
      textSpan.textContent = text;
      element.append(whoSpan, textSpan);
      element.setAttribute("aria-hidden", "true");
      bubbleLayer.appendChild(element);
      const now = Date.now();
      recordBubbleFlow(now);
      const ratePerSec = currentBubbleFlowPerSec(now);
      const flowBase = resolveBubbleFlowLifetimeMs(ratePerSec, BUBBLE_LIFETIME_MS);
      const lifetimeMs = Math.max(flowBase, streakBubbleLifetimeMs(streak.count, flowBase));
      try {
        observeVenueBubbleSpawn(_bubbleChurn, { flowLifetimeMs: flowBase, ratePerSec });
      } catch {
      }
      const reducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const bubble = {
        bubbleKey,
        seatIndex: seatUsable ? seatIndex : -1,
        // 席が無い発言者は観客領域の決定座標(speakerKey ハッシュで毎回同じ位置)へ。
        fallbackAnchor: seatUsable ? null : crowdBubbleAnchor(speech.speakerKey),
        element,
        fadeTimer: 0,
        removeTimer: 0,
        removed: false,
        // v0.1.771 読み上げ連動: pending=合成待ち(流速寿命で消える)/speaking=再生中(消さない)/
        //   done=再生終了(余韻)/unvoiced=鳴らない(流速寿命のまま)。createdAt/flowLifetimeMs/reducedMotion は
        //   状態が変わったとき寿命を再計算するために保持。
        voiceState: "pending",
        createdAt: now,
        flowLifetimeMs: lifetimeMs,
        reducedMotion,
        speakingCapTimer: 0
      };
      bubbleBySeat.set(bubbleKey, bubble);
      activeBubbles.push(bubble);
      positionBubble(bubble);
      const others = activeBubbles.filter((b) => b !== bubble && !b.removed && b.voiceState !== "speaking");
      for (const i of coveredBubbleIndexes(bubble._box, others.map((b) => b._box))) scheduleBubbleFade(others[i], BUBBLE_FADE_MS);
      scheduleBubbleFade(bubble, resolvePendingLifetimeMs(lifetimeMs, voicePlayer.enabled));
      if (voicePlayer.enabled) element.classList.add("nlsb-bubble-previoice");
      return bubble;
    };
    const scheduleBubbleFade = (bubble, lifetimeMs) => {
      if (!bubble || bubble.removed) return;
      if (bubble.fadeTimer) {
        clearTimeout(bubble.fadeTimer);
        bubble.fadeTimer = 0;
      }
      if (bubble.removeTimer) {
        clearTimeout(bubble.removeTimer);
        bubble.removeTimer = 0;
      }
      const ms = Math.max(0, lifetimeMs);
      if (!bubble.reducedMotion) {
        bubble.fadeTimer = window.setTimeout(() => {
          bubble.fadeTimer = 0;
          if (!bubble.removed) bubble.element.classList.add("nlsb-is-leaving");
        }, Math.max(0, ms - BUBBLE_FADE_MS));
      }
      bubble.removeTimer = window.setTimeout(() => {
        bubble.removeTimer = 0;
        removeBubble(bubble);
      }, ms);
    };
    const markBubbleSpeaking = (bubble) => {
      if (!bubble || bubble.removed) return;
      const next = nextBubbleVoiceState(bubble.voiceState, "audioStart");
      if (next !== "speaking" || bubble.voiceState === "speaking") {
        bubble.voiceState = next;
        return;
      }
      bubble.voiceState = "speaking";
      if (bubble.fadeTimer) {
        clearTimeout(bubble.fadeTimer);
        bubble.fadeTimer = 0;
      }
      if (bubble.removeTimer) {
        clearTimeout(bubble.removeTimer);
        bubble.removeTimer = 0;
      }
      bubble.element.classList.remove("nlsb-is-leaving");
      bubble.element.classList.remove("nlsb-bubble-previoice");
      bubble.element.classList.add("nlsb-bubble-voiced");
      if (bubble.speakingCapTimer) clearTimeout(bubble.speakingCapTimer);
      bubble.speakingCapTimer = window.setTimeout(() => {
        bubble.speakingCapTimer = 0;
        markBubbleDone(bubble);
      }, BUBBLE_VOICE_SPEAKING_CAP_MS);
    };
    const markBubbleDone = (bubble) => {
      if (!bubble || bubble.removed) return;
      const next = nextBubbleVoiceState(bubble.voiceState, "audioEnd");
      bubble.voiceState = next;
      bubble.element.classList.remove("nlsb-bubble-previoice");
      if (bubble.speakingCapTimer) {
        clearTimeout(bubble.speakingCapTimer);
        bubble.speakingCapTimer = 0;
      }
      if (next === "done") scheduleBubbleFade(bubble, BUBBLE_VOICE_AFTERGLOW_MS);
    };
    const markBubbleResolved = (bubble) => {
      if (!bubble || bubble.removed) return;
      const next = nextBubbleVoiceState(bubble.voiceState, "resolved");
      if (next === bubble.voiceState) return;
      bubble.voiceState = next;
      bubble.element.classList.remove("nlsb-bubble-previoice");
      const flow = typeof bubble.flowLifetimeMs === "number" && bubble.flowLifetimeMs > 0 ? bubble.flowLifetimeMs : 0;
      const age = Date.now() - (bubble.createdAt || Date.now());
      scheduleBubbleFade(bubble, Math.max(0, flow - age));
    };
    const giftProjPool = [];
    let giftProjActive = 0;
    const GIFT_PROJ_POOL_SIZE = 10;
    const giftThrowOriginForSpeaker = (speakerKey) => {
      const seatIndex = seatByKey.get(speakerKey);
      const node = typeof seatIndex === "number" ? seatNodes[seatIndex] : null;
      const anchorEl = node ? seatAnchorEl(node) : null;
      if (anchorEl && anchorEl.isConnected) {
        try {
          const layerRect = bubbleLayer.getBoundingClientRect();
          const r = anchorEl.getBoundingClientRect();
          if (r.width > 0) {
            return { x: r.left - layerRect.left + r.width / 2, y: r.top - layerRect.top + r.height / 2 };
          }
        } catch {
        }
      }
      return crowdBubbleAnchor(speakerKey);
    };
    const giftThrowTarget = () => {
      try {
        const layerRect = bubbleLayer.getBoundingClientRect();
        const r = safeArea.getBoundingClientRect();
        if (r.width > 0) {
          return { x: r.left - layerRect.left + r.width / 2, y: r.top - layerRect.top + r.height / 2 };
        }
      } catch {
      }
      const lr = bubbleLayer.getBoundingClientRect();
      return { x: lr.width / 2, y: lr.height * 0.4 };
    };
    const launchGiftThrow = (speakerKey, proj, detectAt) => {
      if (!proj || !open) return false;
      if (!canLaunchGiftThrow(giftProjActive)) {
        if (proj.kind === "ad") {
          _giftEffectDiagCounters.adThrowCapGuarded += 1;
        } else {
          _giftEffectDiagCounters.giftThrowCapGuarded += 1;
        }
        publishGiftEffectDiag();
        return false;
      }
      const el = giftProjPool.pop() || (() => {
        const d = document.createElement("div");
        d.className = "nlsb-gift-proj";
        bubbleLayer.appendChild(d);
        return d;
      })();
      let layerSize = null;
      try {
        const lr = bubbleLayer.getBoundingClientRect();
        layerSize = { width: lr.width, height: lr.height };
      } catch {
      }
      const rawOrigin = giftThrowOriginForSpeaker(speakerKey);
      const rawTarget = giftThrowTarget();
      const originResolved = resolveVisibleThrowPoint(rawOrigin, layerSize, "origin");
      const targetResolved = resolveVisibleThrowPoint(rawTarget, layerSize, "target");
      if (originResolved.usedFallback || targetResolved.usedFallback) {
        _giftEffectDiagCounters.throwPointFallbackUsed += 1;
      }
      const origin = { x: originResolved.x, y: originResolved.y };
      const target = { x: targetResolved.x, y: targetResolved.y };
      const path = resolveGiftThrowPath(origin, target);
      el.innerHTML = "";
      const imageUrl = String(proj.imageUrl || "");
      el.classList.toggle("is-image", Boolean(imageUrl));
      if (imageUrl) {
        const img = document.createElement("img");
        img.className = "nlsb-gift-proj-img";
        img.alt = "";
        img.decoding = "async";
        img.loading = "eager";
        img.addEventListener("error", () => {
          el.classList.remove("is-image");
          img.remove();
          const emoji = document.createElement("span");
          emoji.className = "nlsb-gift-proj-emoji";
          emoji.textContent = proj.emoji;
          const label = document.createElement("span");
          label.textContent = proj.label;
          el.prepend(label);
          el.prepend(emoji);
        }, { once: true });
        img.src = imageUrl;
        el.append(img);
      } else {
        const emoji = document.createElement("span");
        emoji.className = "nlsb-gift-proj-emoji";
        emoji.textContent = proj.emoji;
        const label = document.createElement("span");
        label.textContent = proj.label;
        el.append(emoji, label);
      }
      el.style.left = `${path.startX}px`;
      el.style.top = `${path.startY}px`;
      el.style.setProperty("--nlsb-gift-dx", `${path.dx}px`);
      el.style.setProperty("--nlsb-gift-dy", `${path.dy}px`);
      el.style.setProperty("--nlsb-gift-mx", `${path.midX}px`);
      el.style.setProperty("--nlsb-gift-my", `${path.midY}px`);
      el.style.setProperty("--nlsb-gift-dur", `${proj.durationMs}ms`);
      giftProjActive += 1;
      const recycle = () => {
        el.removeEventListener("animationend", recycle);
        if (Number.isFinite(Number(detectAt)) && Number(detectAt) > 0) {
          const gap = Math.max(0, Date.now() - Number(detectAt));
          _giftEffectDiagCounters.lastBurstGapMs = gap;
          _giftEffectDiagCounters.avgBurstGapMs = computeGiftGapAverage(_giftEffectDiagCounters.avgBurstGapMs, gap);
          publishGiftEffectDiag();
        }
        el.classList.remove("is-flying", "is-image");
        el.style.cssText = "";
        el.textContent = "";
        giftProjActive = Math.max(0, giftProjActive - 1);
        if (giftProjPool.length < GIFT_PROJ_POOL_SIZE) giftProjPool.push(el);
        else el.remove();
      };
      el.addEventListener("animationend", recycle, { once: true });
      window.setTimeout(recycle, proj.durationMs + 400);
      void el.offsetWidth;
      el.classList.add("is-flying");
      return true;
    };
    const entryQueue = createVenueEntryQueue();
    const entryProjPool = [];
    const ENTRY_PROJ_POOL_SIZE = 8;
    const _entryEffectDiag = { flown: 0, seatedDirect: 0, suppressedFirst: 0, suppressedLiveChange: 0, noSeat: 0 };
    const entryOriginPoint = (seatY) => {
      try {
        const lr = bubbleLayer.getBoundingClientRect();
        return { x: lr.width + 40, y: Number.isFinite(seatY) ? seatY : lr.height * 0.5 };
      } catch {
        return { x: 900, y: 300 };
      }
    };
    const entrySeatPoint = (key) => {
      const seatIndex = seatByKey.get(key);
      const node = typeof seatIndex === "number" ? seatNodes[seatIndex] : null;
      const anchorEl = node ? seatAnchorEl(node) : null;
      if (!anchorEl || !anchorEl.isConnected) return null;
      try {
        const layerRect = bubbleLayer.getBoundingClientRect();
        const r = anchorEl.getBoundingClientRect();
        if (r.width <= 0) return null;
        return {
          x: r.left - layerRect.left + r.width / 2,
          y: r.top - layerRect.top + r.height / 2,
          node
        };
      } catch {
        return null;
      }
    };
    const launchEntryFlight = (key) => {
      if (!open) return false;
      const seat = entrySeatPoint(key);
      if (!seat) {
        _entryEffectDiag.noSeat += 1;
        return false;
      }
      const el = entryProjPool.pop() || (() => {
        const d = document.createElement("div");
        d.className = "nlsb-entry-proj";
        bubbleLayer.appendChild(d);
        return d;
      })();
      el.innerHTML = "";
      const srcEl = seatAnchorEl(seat.node);
      const srcImg = srcEl ? srcEl.querySelector("img") : null;
      if (srcImg instanceof HTMLImageElement && srcImg.src) {
        const img = document.createElement("img");
        img.alt = "";
        img.decoding = "async";
        img.src = srcImg.src;
        el.append(img);
      } else if (srcEl instanceof HTMLElement) {
        const clone = (
          /** @type {HTMLElement} */
          srcEl.cloneNode(true)
        );
        clone.removeAttribute("id");
        el.append(clone);
      }
      const origin = entryOriginPoint(seat.y);
      const dx = seat.x - origin.x;
      const dy = seat.y - origin.y;
      el.style.left = `${origin.x}px`;
      el.style.top = `${origin.y}px`;
      el.style.setProperty("--nlsb-entry-dx", `${dx}px`);
      el.style.setProperty("--nlsb-entry-dy", `${dy}px`);
      el.style.setProperty("--nlsb-entry-mx", `${dx * 0.55}px`);
      el.style.setProperty("--nlsb-entry-my", `${dy * 0.55 - 46}px`);
      el.style.setProperty("--nlsb-entry-dur", `${VENUE_ENTRY_FLIGHT_MS}ms`);
      const recycle = () => {
        el.removeEventListener("animationend", recycle);
        el.classList.remove("is-flying");
        el.style.cssText = "";
        el.textContent = "";
        entryQueue.onFlightDone(key);
        if (entryProjPool.length < ENTRY_PROJ_POOL_SIZE) entryProjPool.push(el);
        else el.remove();
        const landed = entrySeatPoint(key);
        if (landed && landed.node && landed.node.seat) {
          const seatEl = landed.node.seat;
          seatEl.classList.remove("nlsb-seat-entered");
          void seatEl.offsetWidth;
          seatEl.classList.add("nlsb-seat-entered");
          window.setTimeout(() => seatEl.classList.remove("nlsb-seat-entered"), 700);
        }
      };
      el.addEventListener("animationend", recycle, { once: true });
      window.setTimeout(recycle, VENUE_ENTRY_FLIGHT_MS + 400);
      void el.offsetWidth;
      el.classList.add("is-flying");
      _entryEffectDiag.flown += 1;
      return true;
    };
    const runEntryEffects = (liveId) => {
      try {
        const keys = Array.from(seatByKey.keys()).map((k) => String(k));
        const r = entryQueue.tick({ keys, liveId: String(liveId || "") });
        if (r.suppressedReason === "first_paint") _entryEffectDiag.suppressedFirst += r.seat.length;
        else if (r.suppressedReason === "live_changed") _entryEffectDiag.suppressedLiveChange += r.seat.length;
        else _entryEffectDiag.seatedDirect += r.seat.length;
        for (const key of r.fly) {
          if (!launchEntryFlight(key)) entryQueue.onFlightDone(key);
        }
      } catch {
      }
    };
    const maybeThrowGiftFromSpeech = (speech) => {
      const text = String(speech?.text || "");
      if (!text) return;
      const gift = parseGiftCommentText(text);
      if (gift) {
        const _detectAt = Date.now();
        _giftEffectDiagCounters.giftDetected += 1;
        _giftEffectDiagCounters.lastEventAt = _detectAt;
        _giftDeltaState = accountRealGiftEvent(_giftDeltaState, Number(gift?.point) || 0, _detectAt);
        const p = resolveGiftProjectile(gift, "gift");
        if (p) {
          if (launchGiftThrow(speech.speakerKey, p, _detectAt)) {
            _giftEffectDiagCounters.giftThrown += 1;
            if (scheduleGiftSound(p.tier, p.durationMs, _detectAt) === "coalesced") {
              _giftEffectDiagCounters.giftSoundCoalesced += 1;
            }
          }
        }
        publishGiftEffectDiag();
        return;
      }
      const ad = parseNicoadCommentText(text);
      if (ad) {
        _giftEffectDiagCounters.adDetected += 1;
        _giftEffectDiagCounters.lastEventAt = Date.now();
        const p = resolveGiftProjectile(ad, "ad");
        if (p) {
          if (launchGiftThrow(speech.speakerKey, p)) {
            _giftEffectDiagCounters.adThrown += 1;
            if (!_effectSoundEnabledCache) {
              _giftEffectDiagCounters.adSoundOff += 1;
            } else {
              let playResult = (
                /** @type {any} */
                "error"
              );
              try {
                playResult = playEffectSound(EFFECT_SOUND_KINDS.AD, buildEffectSoundDeps(EFFECT_SOUND_KINDS.AD));
              } catch {
              }
              const field = playResult === "played" ? "adSoundPlayed" : adSoundDiagFieldForPlayResult(playResult);
              if (field) _giftEffectDiagCounters[field] += 1;
            }
          }
        }
        publishGiftEffectDiag();
      }
    };
    const maybeThrowArrivalFromSpeech = (speech) => {
      const text = String(speech?.text || "");
      if (!text) return;
      const arrival = parseArrivalCommentText(text);
      if (!arrival) return;
      const _detectAt = Date.now();
      _giftEffectDiagCounters.arrivalDetected += 1;
      _giftEffectDiagCounters.lastEventAt = _detectAt;
      try {
        if (!shouldFireArrivalEffect(_lastArrivalEffectAtMs, _detectAt, ARRIVAL_EFFECT_CD_MS)) {
          _giftEffectDiagCounters.arrivalSkippedCd += 1;
          publishGiftEffectDiag();
          return;
        }
        const label = buildArrivalLabel(arrival);
        const tier = "small";
        const proj = {
          kind: "gift",
          emoji: ARRIVAL_EMOJI,
          label,
          point: 0,
          tier,
          durationMs: GIFT_THROW_DURATION_MS[tier],
          imageUrl: ""
        };
        if (launchGiftThrow("", proj, _detectAt)) {
          _lastArrivalEffectAtMs = _detectAt;
          _giftEffectDiagCounters.arrivalThrown += 1;
          const soundKind = arrivalSoundKindForCount(arrival.totalCount);
          const playResult = playEffectSound(soundKind, buildEffectSoundDeps(soundKind));
          if (playResult === "played") {
            _giftEffectDiagCounters.arrivalSoundPlayed += 1;
          }
        }
      } catch {
        _giftEffectDiagCounters.giftSoundError += 1;
      }
      publishGiftEffectDiag();
    };
    const thrownGiftEventKeys = /* @__PURE__ */ new Set();
    const handleNewGiftEvents = (events) => {
      if (!open || !Array.isArray(events)) return;
      for (const ev of events) {
        if (!ev || typeof ev !== "object") continue;
        const uid = String(ev.userId || "").trim();
        const item = String(ev.itemName || "").trim();
        const point = Number(ev.point) || 0;
        const itemId = String(ev.itemId || "").trim();
        const key = `${uid}|${ev.capturedAt || ""}|${item}|${point}`;
        if (thrownGiftEventKeys.has(key)) continue;
        thrownGiftEventKeys.add(key);
        if (thrownGiftEventKeys.size > 400) {
          const arr = [...thrownGiftEventKeys];
          thrownGiftEventKeys.clear();
          for (const k of arr.slice(-200)) thrownGiftEventKeys.add(k);
        }
        const _detectAt = Date.now();
        _giftEffectDiagCounters.giftDetected += 1;
        _giftEffectDiagCounters.lastEventAt = _detectAt;
        _giftDeltaState = accountRealGiftEvent(_giftDeltaState, point, _detectAt);
        const proj = resolveGiftProjectile({ item, point, itemId }, "gift");
        if (proj) {
          if (launchGiftThrow(uid ? `u:${uid}` : "", proj, _detectAt)) {
            _giftEffectDiagCounters.giftThrown += 1;
            if (scheduleGiftSound(proj.tier, proj.durationMs, _detectAt) === "coalesced") {
              _giftEffectDiagCounters.giftSoundCoalesced += 1;
            }
          }
        }
        publishGiftEffectDiag();
      }
    };
    const handleGiftPointsAggregate = (aggregatePoints) => {
      if (!open) return;
      const currentLiveId = liveIdFromPathname();
      if (!currentLiveId) return;
      const { events, nextState } = computeGiftDelta(_giftDeltaState, aggregatePoints, Date.now(), {
        liveId: currentLiveId
      });
      _giftDeltaState = nextState;
      if (events.length === 0) return;
      for (const ev of events) {
        const _detectAt = Date.now();
        _giftEffectDiagCounters.giftDetected += 1;
        _giftEffectDiagCounters.lastEventAt = _detectAt;
        _giftEffectDiagCounters.deltaSynthesized += 1;
        _giftEffectDiagCounters.deltaPoints += ev.points;
        try {
          const proj = resolveGiftProjectile({ item: `+${ev.points.toLocaleString("ja-JP")}pt`, point: ev.points }, "gift");
          if (proj) {
            if (launchGiftThrow("", proj, _detectAt)) {
              _giftEffectDiagCounters.giftThrown += 1;
              if (scheduleGiftSound(proj.tier, proj.durationMs, _detectAt) === "coalesced") {
                _giftEffectDiagCounters.giftSoundCoalesced += 1;
              }
            }
          }
        } catch {
          _giftEffectDiagCounters.giftSoundError += 1;
        }
        publishGiftEffectDiag();
      }
    };
    const positionBubble = (bubble) => {
      if (!bubble || bubble.removed) return;
      const node = bubble.seatIndex >= 0 ? seatNodes[bubble.seatIndex] : null;
      const anchorEl = node ? seatAnchorEl(node) : null;
      if (node && (!node.seat.isConnected || !anchorEl || !anchorEl.isConnected)) {
        bubble.element.style.visibility = "hidden";
        return;
      }
      if (!node && !bubble.fallbackAnchor) return;
      bubble.element.style.visibility = "";
      const W = VENUE_BUBBLE_OBSTACLE_WEIGHTS;
      const placed = placeVenueBubble({
        layer: bubbleLayer,
        bubbleEl: bubble.element,
        anchorEl: anchorEl instanceof HTMLElement ? anchorEl : null,
        fallback: node ? null : bubble.fallbackAnchor,
        seating,
        viewport: seatsHost,
        viewportFloor: storyDiagHost,
        obstacleEls: [
          { el: storyDiagHost, weight: W.guide, clipTo: seatsHost },
          { el: pickupEls.root, weight: W.pickup },
          { el: header, weight: W.header },
          ...Array.from(seatsHost.querySelectorAll(".nl-story-userlane-guide"), (el) => ({ el, weight: W.guide, clipTo: seatsHost }))
        ],
        otherBubbles: activeBubbles.filter((b) => b !== bubble && !b.removed && b._box).map((b) => b._box),
        prefer: bubble._side || null
      });
      if (!placed) return;
      bubble._box = placed.box;
      bubble._side = placed.side;
    };
    const repositionAllBubbles = () => {
      for (const b of [...activeBubbles]) positionBubble(b);
    };
    const resetSpeechTracking = (nextLiveId = "") => {
      speechGeneration += 1;
      speechLiveId = nextLiveId;
      speechState = { seenKeys: null, primed: false };
      speechStreaks.clear();
      lastGoodRows = [];
      hasRenderedNonEmpty = false;
      liveRoster.clear();
      pickupRing = [];
      cheerPrevCount = null;
      clearBubbles();
    };
    const applyVenueHeat = (commentRows) => {
      const level = resolveVenueHeatLevel(commentRows, { now: Date.now() });
      stage.style.setProperty("--nlsb-heat-color", heatLevelToWarmColor(level));
      stage.style.setProperty("--nlsb-heat-opacity", String(heatLevelToGlowOpacity(level)));
      stage.setAttribute("data-nls-heat", heatLevelToLabel(level));
      crowdHeatLevel = level;
    };
    const nowMs = () => typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
    const crowdMotionTick = () => {
      crowdRaf = 0;
      if (!open || crowdReducedMotion || crowdAnimCount <= 0) return;
      const t = nowMs();
      if (t - crowdLastDrawMs >= 55) {
        crowdLastDrawMs = t;
        drawCrowdOnCanvas(crowdCanvas, crowdAnimCount, crowdAnimSeed, {
          timeMs: t,
          heatLevel: crowdHeatLevel
        });
      }
      if (typeof requestAnimationFrame === "function") {
        crowdRaf = requestAnimationFrame(crowdMotionTick);
      }
    };
    const ensureCrowdCanvasSize = () => {
      try {
        if (crowdCanvas && crowdCanvas.width !== CROWD_CANVAS_W) {
          crowdCanvas.width = CROWD_CANVAS_W;
          crowdCanvas.height = CROWD_CANVAS_H;
        }
      } catch {
      }
    };
    const startCrowdMotion = () => {
      if (crowdReducedMotion || crowdRaf || !open || crowdAnimCount <= 0) return;
      if (typeof requestAnimationFrame !== "function") return;
      ensureCrowdCanvasSize();
      crowdLastDrawMs = 0;
      crowdRaf = requestAnimationFrame(crowdMotionTick);
    };
    const stopCrowdMotion = () => {
      if (crowdRaf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(crowdRaf);
      crowdRaf = 0;
      try {
        if (crowdCanvas && crowdCanvas.width > 0) {
          crowdCanvas.width = 0;
          crowdCanvas.height = 0;
          lastCrowdCount = -1;
          lastCrowdSeed = Number.NaN;
        }
      } catch {
      }
    };
    let _mirrorAvatarMapCacheAt = -1;
    let _mirrorAvatarMapCache = /* @__PURE__ */ new Map();
    const currentMirrorAvatarMap = () => {
      const snap = laneMirrorPaintSnap || laneMirrorSnap;
      const cap = Math.max(0, Number(
        /** @type {any} */
        snap?.capturedAt
      ) || 0);
      if (cap !== _mirrorAvatarMapCacheAt) {
        _mirrorAvatarMapCacheAt = cap;
        _mirrorAvatarMapCache = buildVenueMirrorAvatarMap(
          /** @type {any} */
          snap
        );
      }
      return _mirrorAvatarMapCache;
    };
    const renderStoryDiagMirrorPanel = () => {
      const result = renderVenueStoryDiagMirrorPanel(storyDiagHost, storyDiagMirrorSnap, {
        liveId: String(activeLiveId || liveIdFromPathname() || ""),
        nowMs: Date.now(),
        lastSig: storyDiagMirrorRenderSig,
        panelSummary: panelSummarySnap
      });
      storyDiagMirrorRenderSig = result.sig;
    };
    const commitDisplay = (incoming) => {
      const resolved = resolveDisplayRows(
        enrichVenueRowsWithMirrorAvatars(
          enrichVenueRowsWithProfileAvatars(incoming, profileAvatarMap),
          currentMirrorAvatarMap()
        ),
        lastGoodRows
      );
      lastGoodRows = resolved.nextLastGood;
      renderSeats(resolved.rows);
      updatePickupBanner(resolved.rows);
    };
    const clearDisplay = () => {
      lastGoodRows = [];
      hasRenderedNonEmpty = false;
      _topBarShownOnce = false;
      _lastTopBarSig = "";
      topBar.hidden = true;
      topBarList.replaceChildren();
      renderSeats([]);
    };
    let residentsRendered = false;
    const VENUE_RESIDENTS_ENABLED = false;
    const renderResidents = () => {
      if (!VENUE_RESIDENTS_ENABLED) return;
      if (residentsRendered) return;
      const resolveUrl = typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.getURL === "function" ? (
        /** @param {string} rel */
        (rel3) => chrome.runtime.getURL(rel3)
      ) : (
        /** @param {string} rel */
        (rel3) => rel3
      );
      const residents = buildVenueResidents(resolveUrl);
      residentsLayer.textContent = "";
      for (const r of residents) {
        const cell = document.createElement("div");
        cell.className = `nlsb-resident nlsb-resident-${r.id}`;
        const img = document.createElement("img");
        img.className = "nlsb-resident-img";
        img.src = r.imgSrc;
        img.alt = `${r.name}(会場の案内役)`;
        img.addEventListener("error", () => {
          img.style.display = "none";
        });
        const label = document.createElement("div");
        label.className = "nlsb-resident-name";
        label.textContent = r.name;
        cell.append(img, label);
        residentsLayer.appendChild(cell);
      }
      residentsRendered = true;
    };
    const VENUE_CHAR_FRAME_ENABLED = false;
    let charFrameRendered = false;
    const renderCharFrame = () => {
      if (!VENUE_CHAR_FRAME_ENABLED) return;
      if (charFrameRendered) return;
      const resolveUrl = typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.getURL === "function" ? (
        /** @param {string} rel */
        (rel3) => chrome.runtime.getURL(rel3)
      ) : (
        /** @param {string} rel */
        (rel3) => rel3
      );
      const tiles = buildVenueCharacterFrame(resolveUrl);
      charFrameLayer.textContent = "";
      for (const t of tiles) {
        const img = document.createElement("img");
        img.className = "nlsb-charframe-tile";
        img.src = t.src;
        img.alt = "";
        img.dataset.edge = t.edge;
        if (t.edge === "top" || t.edge === "bottom") img.style.left = `${(t.pos * 100).toFixed(2)}%`;
        else img.style.top = `${(t.pos * 100).toFixed(2)}%`;
        img.addEventListener("error", () => {
          img.style.display = "none";
        });
        charFrameLayer.appendChild(img);
      }
      charFrameRendered = true;
    };
    const renderTopBar = (topSupporters) => {
      const list = Array.isArray(topSupporters) ? topSupporters : [];
      if (list.length === 0) {
        if (!_topBarShownOnce) topBar.hidden = true;
        return;
      }
      const sig = list.map((x) => `${x.rank}:${x.participant?.key || ""}`).join("|");
      if (sig === _lastTopBarSig && _topBarShownOnce) return;
      _lastTopBarSig = sig;
      const frag = document.createDocumentFragment();
      for (const item of list) {
        const cell = document.createElement("div");
        cell.className = "nlsb-topbar-cell";
        if (item.rank >= 1 && item.rank <= 3) cell.dataset.venueRank = String(item.rank);
        cell.appendChild(buildVenuePersonTile(item.participant, "応援者"));
        const p = item.participant || {};
        _hoverCardDataByEl.set(cell, {
          uid: String(p.userId || "").trim(),
          displayName: String(p.name || "").trim() || String(item?.participant?.key || ""),
          count: Number(p.count) || 0,
          hasGift: p.hasGift === true,
          giftCount: Number(p.giftCount) || 0,
          venueRank: Math.max(0, Math.floor(Number(item.rank) || 0)),
          // 2026-07-30(MVP-2・venue-hover-card-content-DESIGN.md): 最終発言時刻(既存データ・
          //   新規取得ゼロ)。ホバーカードで相対時刻(「3分前」等)に変換して表示する。
          lastAt: Number(p.lastAt) || 0,
          // 2026-07-31(ユーザー要望): 直前の発言内容(既存データ・新規取得ゼロ)。
          lastText: String(p.lastText || ""),
          recentTexts: Array.isArray(p.recentTexts) ? p.recentTexts : [],
          // 発言の証拠(2026-10-16・v1は表示に使わず census の計測だけ)。応援者トップのセルも同じ participant 由来。
          speech: p.speech
        });
        frag.appendChild(cell);
      }
      topBarList.replaceChildren(frag);
      topBar.hidden = false;
      _topBarShownOnce = true;
    };
    const renderSeats = (rows) => {
      const incomingRows = Array.isArray(rows) ? rows : [];
      if (incomingRows.length === 0 && hasRenderedNonEmpty) {
        return;
      }
      const seating2 = buildVenueSeating(incomingRows, {
        maxSeats: VENUE_FULLSCREEN_MAX_SEATS,
        prevSeatByKey: seatByKey,
        isGenericName: isGenericComeviewName,
        promoteUserIds: spokenUserIds,
        // 光らせ演出(金色オーラ)はユーザー要望で無効。上位貢献者は順位バッジ(venueRank)で示す。
        vipRegular: false,
        // 2026-07-30(venue-ranking-churn-SPEC.md §4.3): 応援者ランキングのヒステリシス安定化。
        prevSupporterOrderKeys: supporterOrderKeys
      });
      if (seating2.participantCount > 0) hasRenderedNonEmpty = true;
      seatByKey = seating2.seatByKey;
      supporterOrderKeys = seating2.supporterRank.orderKeys;
      _supporterRankDrops += seating2.supporterRank.droppedKeys.length;
      _supporterRankOvertakes += seating2.supporterRank.overtakeCount;
      if (topBar.dataset.rankDrops !== String(_supporterRankDrops)) {
        topBar.dataset.rankDrops = String(_supporterRankDrops);
      }
      if (topBar.dataset.rankOvertakes !== String(_supporterRankOvertakes)) {
        topBar.dataset.rankOvertakes = String(_supporterRankOvertakes);
      }
      renderTopBar(seating2.topSupporters);
      seatsHost.classList.remove(...VENUE_LAYOUT_CLASSES);
      seatsHost.classList.add(`nlsb-mode-${seating2.layoutMode}`);
      stage.style.setProperty(
        "--nlsb-venue-max-h",
        `${resolveVenueMaxHeightVh(seating2.participantCount)}vh`
      );
      const seatAreaWidth = seatsHost.clientWidth || window.innerWidth || 1280;
      const seatMinWidth = seating2.layoutMode === "vip" ? 158 : seating2.layoutMode === "normal" ? 92 : 76;
      const perRow = seatsPerRow(seatAreaWidth - 28, seatMinWidth);
      const neededRows = Math.max(1, Math.ceil(seating2.seats.length / Math.max(1, perRow)));
      const venueMaxRows = Math.min(
        neededRows,
        Math.ceil(VENUE_FULLSCREEN_MAX_SEATS / Math.max(1, perRow))
      );
      const visibleSeatCount = resolveVisibleArenaCount({
        totalCount: seating2.seats.length,
        perRow,
        rows: venueMaxRows,
        hardCap: VENUE_FULLSCREEN_MAX_SEATS
      });
      const visibleSeatsRaw = selectStableVisibleMembers(
        seating2.seats,
        visibleSeatCount,
        spokenUserIds,
        (entry) => String(entry?.participant?.userId || entry?.participant?.key || "").trim()
      );
      const seatHasRealThumb = (entry) => {
        const p = entry?.participant || {};
        const avatarUrl = String(p.avatar || "").trim();
        const derived = deriveNicoUserIconUrl(String(p.userId || "").trim());
        return hasRealThumbnail(avatarUrl) || hasRealThumbnail(derived);
      };
      const visibleSeats = partitionThumbnailFirst(visibleSeatsRaw, seatHasRealThumb);
      const visibleSeatKeys = new Set(visibleSeats.map((entry) => entry.participant.key));
      const { totalAnonymous } = collectAudienceFaceUserIds(rows, {
        isGenericName: isGenericComeviewName,
        promoteUserIds: spokenUserIds,
        excludeKeys: visibleSeatKeys
      });
      lastRosterInput = {
        allSeats: seating2.seats,
        visibleSeats,
        audienceCount: totalAnonymous
      };
      _venueTitleBaseText = totalAnonymous > 0 ? `会場参加者 ${seating2.participantCount}人 ・ ほか ${totalAnonymous}人` : `会場参加者 ${seating2.participantCount}人`;
      title.textContent = _venueTitleBaseText;
      if (totalAnonymous > 0) {
        crowdCanvas.classList.add("nlsb-is-visible");
        const seed = Array.from(activeLiveId).reduce((hash, char) => (hash << 5) - hash + char.charCodeAt(0), 0);
        crowdAnimCount = totalAnonymous;
        crowdAnimSeed = seed;
        if (totalAnonymous !== lastCrowdCount || seed !== lastCrowdSeed) {
          ensureCrowdCanvasSize();
          drawCrowdOnCanvas(crowdCanvas, totalAnonymous, seed, crowdReducedMotion ? null : { timeMs: nowMs(), heatLevel: crowdHeatLevel });
          lastCrowdCount = totalAnonymous;
          lastCrowdSeed = seed;
        }
        startCrowdMotion();
      } else {
        crowdCanvas.classList.remove("nlsb-is-visible");
        lastCrowdCount = -1;
        crowdAnimCount = 0;
        stopCrowdMotion();
      }
      const visibleSeatIndexSet = new Set(visibleSeats.map((entry) => entry.seatIndex));
      const entryBySeatIndex = new Map(visibleSeats.map((entry) => [entry.seatIndex, entry]));
      for (let i = 0; i < seatNodes.length; i += 1) {
        const node = seatNodes[i];
        node.next = createEmptySeatState();
        if (node.seat.dataset.tierIndex !== void 0) delete node.seat.dataset.tierIndex;
        if (!visibleSeatIndexSet.has(i)) {
          if (node.seat.parentElement) node.seat.parentElement.removeChild(node.seat);
          node.seat.replaceChildren();
          node.tile = null;
        }
      }
      const fallbackLaneBuckets = bucketVenueLaneSeats(visibleSeats, {
        maxTotal: visibleSeats.length,
        // v0.1.1117 白円根治(P3): ①と同じ資産で displaySrc を導出(委譲先は venueLaneBuckets)。
        pickCtx: venueLanePickCtx
      });
      _anonExcludedCount = Math.max(
        0,
        visibleSeats.length - flattenVenueLaneBuckets(fallbackLaneBuckets).length
      );
      const lanePaintSnap = laneMirrorPaintSnap;
      const laneComposed = lanePaintSnap ? composeVenueLaneBuckets({
        mirrorBuckets: restoreLaneMirrorBuckets(lanePaintSnap),
        seatIndexByUid: venueSeatIndexByUid(visibleSeats)
      }) : null;
      const laneBuckets = laneComposed ? laneComposed.buckets : fallbackLaneBuckets;
      const visibleLaneItems = flattenVenueLaneBuckets(laneBuckets);
      try {
        noteVenueFirstPaint(_openLatency, Date.now(), visibleLaneItems.length);
      } catch {
      }
      try {
        observeVenueTileCount(_tileCountCensus, {
          liveId: activeLiveId || liveIdFromPathname(),
          tiles: visibleLaneItems.length,
          origin: _venueTileOrigin,
          nowMs: Date.now()
        });
      } catch {
      }
      const laneTierByUid = /* @__PURE__ */ new Map();
      for (const tierName of ["link", "gift", "ad", "konta", "tanu"]) {
        const arr = Array.isArray(
          /** @type {any} */
          laneBuckets?.[tierName]
        ) ? (
          /** @type {any} */
          laneBuckets[tierName]
        ) : [];
        for (const it of arr) {
          const u = String(it?.entry?.userId || "").trim();
          if (u && !laneTierByUid.has(u)) laneTierByUid.set(u, tierName);
        }
      }
      const isLaneMirrorPaintMode = Boolean(lanePaintSnap);
      try {
        const nowForAge = Date.now();
        const ageSec = lanePaintSnap && Number(lanePaintSnap.capturedAt) > 0 ? Math.round((nowForAge - Number(lanePaintSnap.capturedAt)) / 1e3) : -1;
        const notice = venueMirrorAgeNotice(
          isLaneMirrorPaintMode ? "mirror" : "fallback",
          ageSec
        );
        const nextTitle = notice ? `${_venueTitleBaseText} ・ ${notice}` : _venueTitleBaseText;
        if (_venueTitleLastText !== nextTitle) {
          _venueTitleLastText = nextTitle;
          title.textContent = nextTitle;
        }
      } catch {
      }
      emptyMessage.hidden = visibleLaneItems.length > 0;
      if (visibleLaneItems.length === 0) {
        const keepOnEmpty = shouldKeepStoryUserLaneTilesOnEmpty(
          venueLaneEls,
          String(activeLiveId || ""),
          _venueStoryUserLaneLastTiledLid
        );
        if (keepOnEmpty) {
          emptyMessage.hidden = true;
        } else {
          resetStoryUserLaneDom(venueLaneEls);
        }
      } else {
        const seatOwnerItem = /* @__PURE__ */ new Map();
        const seatOwnerTier = /* @__PURE__ */ new Map();
        for (const tierName of ["link", "gift", "ad", "konta", "tanu"]) {
          const arr = Array.isArray(
            /** @type {any} */
            laneBuckets?.[tierName]
          ) ? (
            /** @type {any} */
            laneBuckets[tierName]
          ) : [];
          for (const it of arr) {
            const si = Number(it?._venueSeatIndex);
            if (Number.isInteger(si) && si >= 0 && !seatOwnerItem.has(si)) {
              seatOwnerItem.set(si, it);
              seatOwnerTier.set(si, tierName);
            }
          }
        }
        const _laneElByTier = {
          link: venueLaneEls.laneLink,
          gift: venueLaneEls.laneGift,
          ad: venueLaneEls.laneAd,
          konta: venueLaneEls.laneKonta,
          tanu: venueLaneEls.laneTanu
        };
        for (const [si, tierNow] of seatOwnerTier) {
          const tierPrev = _seatOwnerTierPrev.get(si);
          if (tierPrev && tierPrev !== tierNow) {
            invalidateStoryUserLaneTierKey(
              /** @type {any} */
              _laneElByTier[tierPrev]
            );
            invalidateStoryUserLaneTierKey(
              /** @type {any} */
              _laneElByTier[tierNow]
            );
          }
        }
        _seatOwnerTierPrev = seatOwnerTier;
        paintStoryUserLaneDomFilled(
          venueLaneEls,
          venueStoryFaces,
          laneBuckets,
          visibleLaneItems.length,
          venuePersonTileIo,
          {
            recordedCommentRowsTotal: isLaneMirrorPaintMode ? lanePaintSnap.pickedLength : seating2.participantCount,
            totalCandidates: isLaneMirrorPaintMode ? lanePaintSnap.totalCandidates : seating2.participantCount,
            // v0.1.1133: fallback でも同じ共有rendererの案内文言を出す。fallback は件数だけ
            //   seating.participantCount に差し替え、a:匿名ルール等の説明文は①POPと同じ正本に揃える。
            guides: VENUE_LANE_GUIDES_EXACT_COPY,
            /*
             * ★v0.1.1280: fallback 経路のときだけ gift 段の空文言を差し替える。
             *   fallback は席から段を組むため【構造上 gift 段を作れない】(①の gift/ad は
             *   tier 判定を通さない後付けで、席からは導出できない)。
             *   それを「いまの記録では該当者がいません」と断定するのは嘘なので、
             *   「①パネルが必要」であることを正直に言う。
             *   ★mirror 経路(鏡がある)ときは渡さない=鏡が空だと知っている=従来の断定でよい。
             */
            emptyTextOverrides: isLaneMirrorPaintMode ? void 0 : { gift: VENUE_FALLBACK_GIFT_EMPTY_HTML },
            wrapTileEl: (tileEl, item) => {
              const laneItem = (
                /** @type {{ _venueSeatIndex?: unknown }} */
                item || {}
              );
              const seatIndexRaw = Number(laneItem._venueSeatIndex);
              if (!Number.isInteger(seatIndexRaw) || seatIndexRaw < 0) return tileEl;
              const node = seatNodes[seatIndexRaw];
              if (!node) return tileEl;
              if (seatOwnerItem.has(seatIndexRaw) && seatOwnerItem.get(seatIndexRaw) !== item) return tileEl;
              node.seat.replaceChildren(tileEl);
              node.tile = tileEl;
              return node.seat;
            }
          }
        );
        _venueStoryUserLaneLastTiledLid = String(activeLiveId || "").trim().toLowerCase();
      }
      _laneItemsByTier = {
        link: Array.isArray(
          /** @type {any} */
          laneBuckets?.link
        ) ? (
          /** @type {any} */
          laneBuckets.link
        ) : [],
        gift: Array.isArray(
          /** @type {any} */
          laneBuckets?.gift
        ) ? (
          /** @type {any} */
          laneBuckets.gift
        ) : [],
        ad: Array.isArray(
          /** @type {any} */
          laneBuckets?.ad
        ) ? (
          /** @type {any} */
          laneBuckets.ad
        ) : [],
        konta: Array.isArray(
          /** @type {any} */
          laneBuckets?.konta
        ) ? (
          /** @type {any} */
          laneBuckets.konta
        ) : [],
        tanu: Array.isArray(
          /** @type {any} */
          laneBuckets?.tanu
        ) ? (
          /** @type {any} */
          laneBuckets.tanu
        ) : []
      };
      beginVenueSeatLinkPaint(_seatLinkParity);
      const seatLinkWallNow = Date.now();
      let unseatedThisPaint = 0;
      for (const item of visibleLaneItems) {
        const seatIndexRaw = Number(item?._venueSeatIndex);
        if (!Number.isInteger(seatIndexRaw) || seatIndexRaw < 0) {
          unseatedThisPaint += 1;
          continue;
        }
        const seatIndex = seatIndexRaw;
        const node = seatNodes[seatIndex];
        const entry = entryBySeatIndex.get(seatIndex);
        if (!node || !entry) continue;
        const participant = entry.participant || {};
        const uid = String(participant.userId || "").trim();
        const rawName = String(participant.name || "").trim();
        try {
          observeVenueYukkuriNamedTile(_yukkuriNamedCensus2, { uid, rawName, displaySrc: item?.displaySrc });
        } catch {
        }
        const displayName = String(item?.title || "").trim() || rawName || (uid ? anonymousDisplayLabel(uid) : anonymousDisplayLabel(participant.key || `会場${seatIndex + 1}`));
        const tile = node.seat.querySelector(".nl-story-userlane-cell");
        if (tile instanceof HTMLElement) node.tile = tile;
        const seatLinkOn = isNumericNicoUserId(uid) && nicoUserPageUrl(uid) !== "";
        if (node.next) node.next.link = seatLinkOn;
        try {
          observeVenueSeatLink(_seatLinkParity, {
            seatIndex,
            mirrorUid: String(item?.entry?.userId || "").trim(),
            rosterUid: uid,
            seatLinkOn,
            tileTag: tile instanceof HTMLElement ? tile.tagName : "",
            tileHref: tile instanceof HTMLAnchorElement ? tile.getAttribute("href") || "" : "",
            mode: isLaneMirrorPaintMode ? "mirror" : "fallback",
            wallNow: seatLinkWallNow
          });
        } catch {
        }
        if (node.next) {
          node.next.title = displayName;
          node.next.empty = false;
          node.next.aria = "false";
          node.next.vip = item?._venueIsVip === true;
        }
        const venueRank = Math.max(0, Math.floor(Number(entry.venueRank || item?._venueRank) || 0));
        if (_lastVenueRankByNode.get(node.seat) !== venueRank) {
          if (venueRank >= 1 && venueRank <= 3) {
            node.seat.dataset.venueRank = String(venueRank);
          } else {
            delete node.seat.dataset.venueRank;
          }
          _lastVenueRankByNode.set(node.seat, venueRank);
        }
        _hoverCardDataByEl.set(node.seat, {
          uid,
          displayName,
          count: Number(participant.count) || 0,
          hasGift: participant.hasGift === true,
          giftCount: Number(participant.giftCount) || 0,
          venueRank,
          // 2026-07-30(MVP-2・venue-hover-card-content-DESIGN.md): 最終発言時刻(既存データ・
          //   新規取得ゼロ)。ホバーカードで相対時刻(「3分前」等)に変換して表示する。
          lastAt: Number(participant.lastAt) || 0,
          // 2026-07-31: 段。広告/ギフト段では「発言N」でなく「広告(◯分前)」等に出し分ける。
          tier: uid ? laneTierByUid.get(uid) || "" : "",
          // 2026-07-31(ユーザー要望): 直前の発言内容(既存データ・新規取得ゼロ)。
          lastText: String(participant.lastText || ""),
          // v0.1.1218: ホバーで直近数件を読めるようにする(既存データ・新規取得ゼロ)。
          //   在席名簿に発言が無い人は、鏡のセルが持つ発言を使う(2026-10-12・会場を開く前に発言した人のカードが空だった)。
          recentTexts: Array.isArray(participant.recentTexts) && participant.recentTexts.length ? participant.recentTexts : Array.isArray(item?.recentTexts) ? item.recentTexts : [],
          // 発言の証拠(2026-10-16・v1は表示に使わず census の計測だけ)。
          speech: speechWithFallbackTexts(participant.speech, item?.recentTexts)
        });
        const speakerKey = uid ? `u:${uid}` : rawName ? `n:${rawName}` : "";
        const streakEntry = speakerKey ? speechStreaks.get(speakerKey) : null;
        const seatStreakStage = streakEntry ? streakGlowStage(streakEntry.count) : 0;
        if (node.next) node.next.streak = seatStreakStage;
      }
      for (let i = 0; i < seatNodes.length; i += 1) flushVenueSeatState(seatNodes[i].seat, seatNodes[i].next);
      _venueUnseatedCount = unseatedThisPaint;
      const diagDue = nowMs() - _venueSeatsDiagLastWriteAt >= 3e3;
      const laneWallNow = Date.now();
      const laneTransientKeys = currentVenueTransientKeys(laneWallNow);
      let laneParityDiag = (
        /** @type {any} */
        _lastVenueSeatsDiagObs ? _lastVenueSeatsDiagObs.laneParity ?? null : null
      );
      let sceneReceiptDiag = (
        /** @type {any} */
        _lastVenueSeatsDiagObs ? _lastVenueSeatsDiagObs.sceneReceipt ?? null : null
      );
      if (diagDue) {
        try {
          venueAvatarLoadGuard.retrySweep(venueLaneEls.stack, laneWallNow);
        } catch {
        }
        try {
          const speechTiles = [];
          for (
            const tier of
            /** @type {const} */
            ["link", "konta", "tanu"]
          ) {
            for (
              const it of
              /** @type {any[]} */
              _laneItemsByTier[tier] || []
            ) {
              const uid = String(it?.entry?.userId || "").trim();
              const rosterEntry = uid ? liveRoster.get(uid) || null : null;
              speechTiles.push({
                uid,
                name: String(it?.title || "").trim(),
                rosterTexts: rosterEntry ? rosterEntry.recentTexts : null,
                mirrorTexts: it?.recentTexts,
                commentCount: Number(it?.stats?.c) || 0,
                rosterCount: rosterEntry ? Number(rosterEntry.commentCount) || 0 : 0
              });
            }
          }
          observeVenueSpeechTiles(_speechCensus, speechTiles);
        } catch {
        }
        try {
          const painted = {};
          for (const tier of ["link", "gift", "ad", "konta", "tanu"]) {
            painted[tier] = (Array.isArray(
              /** @type {any} */
              laneBuckets[tier]
            ) ? (
              /** @type {any} */
              laneBuckets[tier]
            ) : []).map((it) => venueLaneParityKey(
              /** @type {any} */
              it
            )).filter(Boolean);
          }
          let domSummary = null;
          try {
            const rawCensus = collectVenueLaneDomCensus({
              laneEls: {
                link: venueLaneEls.laneLink,
                gift: venueLaneEls.laneGift,
                ad: venueLaneEls.laneAd,
                konta: venueLaneEls.laneKonta,
                tanu: venueLaneEls.laneTanu
              },
              stackEl: venueLaneEls.stack,
              extras: {
                charFrameLayer,
                crowdOn: totalAnonymous > 0,
                crowdCount: totalAnonymous,
                // v0.1.1116 白円計器: 会場の顔プローブ実績(成功/404)を census 経由で状態速報へ。
                //   getDiagnostics は Set サイズ集計のみ=3秒期日内の1回呼びで hot path 無汚染。
                avatarProbe: venueAvatarLoadGuard.getDiagnostics()
              }
            });
            _venueDomFingerprintLast = laneDomFingerprint({
              link: rawCensus.perSection?.link?.keys,
              gift: rawCensus.perSection?.gift?.keys,
              ad: rawCensus.perSection?.ad?.keys,
              konta: rawCensus.perSection?.konta?.keys,
              tanu: rawCensus.perSection?.tanu?.keys
            });
            domSummary = venueDomCensusToParityDom(rawCensus);
          } catch {
            domSummary = null;
            _venueDomFingerprintLast = "";
          }
          laneParityDiag = toVenueLaneParityDiag(
            buildVenueLaneParity({
              snap: lanePaintSnap || laneMirrorSnap,
              liveId: String(activeLiveId || liveIdFromPathname() || ""),
              nowMs: laneWallNow,
              mode: lanePaintSnap ? "mirror" : "fallback",
              painted,
              transientKeys: laneTransientKeys,
              visibleShown: visibleSeats.length,
              logicalTotal: seating2.seats.length,
              dom: domSummary
            })
          );
          if (laneParityDiag && _laneMirrorSanitizeDropped > 0) {
            laneParityDiag = {
              ...laneParityDiag,
              line: `${laneParityDiag.line} / 鏡除外${_laneMirrorSanitizeDropped}`
            };
          }
          if (laneParityDiag && _venueUnseatedCount > 0) {
            laneParityDiag = {
              ...laneParityDiag,
              line: `${laneParityDiag.line} / 席なし${_venueUnseatedCount}`
            };
          }
          let _acceptedForScene = laneMirrorSnap;
          try {
            const hasOwnFp = String(laneMirrorSnap?.domSelf?.fingerprint || "").trim() !== "";
            if (!hasOwnFp && _laneReceiptFromPopup) {
              const cmp = isReceiptComparable(laneMirrorSnap, _laneReceiptFromPopup);
              if (cmp.comparable) {
                const base = laneMirrorSnap?.domSelf;
                _acceptedForScene = {
                  ...laneMirrorSnap,
                  domSelf: (
                    /** @type {import('../lib/laneMirror.js').LaneMirrorDomSelf} */
                    {
                      measured: base?.measured === true || _laneReceiptFromPopup.measured === true,
                      perTier: base?.perTier ?? _laneReceiptFromPopup.perTier,
                      dpr: base?.dpr ?? _laneReceiptFromPopup.dpr ?? 1,
                      measuredAt: base?.measuredAt ?? _laneReceiptFromPopup.measuredAt ?? 0,
                      fingerprint: String(_laneReceiptFromPopup.fingerprint || ""),
                      fingerprintFor: String(_laneReceiptFromPopup.fingerprintFor || "")
                    }
                  )
                };
              }
            }
          } catch {
          }
          const sceneReceipts = buildVenueSceneReceipts({
            acceptedSnap: _acceptedForScene,
            paintedSnap: lanePaintSnap,
            paintedBuckets: laneBuckets,
            venueDomFingerprint: _venueDomFingerprintLast
          });
          sceneReceiptDiag = sceneReceipts ? compareRenderReceipts(sceneReceipts.popReceipt, sceneReceipts.venueReceipt) : null;
        } catch {
        }
      }
      const updatePanAffordance = () => {
        const canPan = seatsHost.scrollHeight > seatsHost.clientHeight + 2;
        seatsHost.classList.toggle("nlsb-can-pan", canPan);
      };
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          repositionAllBubbles();
          updatePanAffordance();
        });
      } else {
        repositionAllBubbles();
        updatePanAffordance();
      }
      const bcUid = String(_lastBroadcasterUid || "").trim();
      const broadcasterInSeats = bcUid !== "" && visibleSeats.some(
        (entry) => String(entry?.participant?.userId || "").trim() === bcUid
      );
      const seatsDiagObs = {
        enabled: open,
        // ★v0.1.1050: 会場が観測した配信ID。パリティ突合で status が「現配信か」を判定し、前配信の
        //   残骸(古いスナップショット)を現配信と突き合わせて嘘の🔴を出さないためのガード(観測のみ)。
        liveId: String(activeLiveId || liveIdFromPathname() || ""),
        seatsShown: visibleSeats.length,
        participantCount: seating2.participantCount,
        otherCount: totalAnonymous,
        broadcasterInSeats,
        broadcasterKnown: bcUid !== "",
        // ★これは会場パネル renderDiagPanel が nowMs()(相対)と引き算する用の相対時計。
        //   storage(状態速報)へ出す lastUpdateAt は publishVenueSeatsDiag が Date.now()(壁時計)で
        //   上書きするので、ここは相対のまま=会場パネルの「更新◯秒前」は相対同士で正しく出る。
        lastUpdateAt: nowMs(),
        // v0.1.1043: 「なぜ全員出ないか」を状態速報で数値切り分けするための計器。
        //   既に算出済みの値を載せるだけ(新規計算/再描画を足さない=churn 源にしない)。
        //   perRow*venueMaxRows と participantCount と 500 のどれで可視席が頭打ちかを status が判定。
        perRow,
        venueMaxRows,
        seatAreaWidth,
        hardCap: VENUE_FULLSCREEN_MAX_SEATS,
        // v0.1.1111: 会場=①レーンのメンバー一致トークン(P/T/X 3層)。状態速報が1行そのまま出す。
        laneParity: laneParityDiag,
        // v0.1.1137(lanescene-structural-review MVP): ①=会場の鏡世代突合(軽量な代理指標・独立判定)。
        sceneReceipt: sceneReceiptDiag,
        // v0.1.1138(「消す側」の計器): fallback時に段から除外された匿名の人数。
        anonExcluded: _anonExcludedCount,
        // ★venue-exact-parity-SPEC §5-3: 席に結びつかなかった段タイル数(uid-only join の説明済み差分)。
        //   ★状態速報へは laneParity.line への併記で出る(この構造フィールドは診断パネル/回帰テスト用)。
        unseated: _venueUnseatedCount,
        // 2026-07-14 席リンク一致計器: タイル実体(鏡uid)⇄席クラス(roster uid)の二重ソース突合(累積)。
        seatLinkParity: toVenueSeatLinkParityDiag(_seatLinkParity, Date.now()),
        // 2026-07-15 診断先行(venue-yukkuri-named-diagnose): 「名前ありゆっくり顔」の実害を数えるだけの1行。
        yukkuriNamedCensus: toVenueYukkuriNamedCensusDiag(_yukkuriNamedCensus2),
        // 2026-10-12(ユーザー要望): 会場のホバーカードの「セリフ」がちゃんと出ているか。
        speechCensus: toVenueSpeechCensusDiag(_speechCensus),
        // 2026-10-13: 会場のタイル数の増減(減った回数・最大の脱落・原因=供給元の切替)。★ここに載せないと状態速報に出ない。
        tileCountCensus: toVenueTileCountDiag(_tileCountCensus, Date.now()),
        // 2026-07-21 診断先行: 応援TOP吹き出しchurnの実害を数えるだけの1行。
        bubbleChurn: toVenueBubbleChurnDiag(_bubbleChurn),
        storyDiagMirror: storyDiagMirrorStatus(storyDiagMirrorSnap, String(activeLiveId || liveIdFromPathname() || ""), Date.now()),
        // v0.1.1207: 会場の立ち上がり分解(開く→鏡→集計→初描画→初席)。ユーザー報告
        //   「立ち上がりが遅い/出ないときがある」を体感でなく数字で切り分けるため。
        //   ★ここに載せないと状態速報に出ない([[fastdiag-lite-is-the-printer-subset]]の同型)。
        openLatency: summarizeVenueOpenLatency(_openLatency),
        // ★v0.1.1317: 会場が鏡を受け取れているか(通知/キー一致/関所)を1行で出す。
        //   ★ここに載せないと状態速報に出ない([[fastdiag-lite-is-the-printer-subset]]の同型)。
        //   観測ゼロなら空文字=行ごと出ない(普段の速報を汚さない)。
        mirrorIntakeLine: formatVenueMirrorIntakeLine(_venueMirrorIntake, Date.now()),
        /*
         * ★v0.1.1405: 判定の【材料】も載せる(行だけでは画面のセルが作れない)。
         *
         * ■ なぜ必要か
         *   会場が publish していたのは整形済みの1行だけで、(a)通知が来ない /
         *   (b)別配信の鏡 / (c)関所で却下 を区別するカウンタは会場の外に出ていなかった。
         *   ＝ 状態速報の本文を人が読む以外に使い道がなく、未解決の
         *   「会場一致が鏡stale(656s)で固定」を **画面が名指しできなかった**。
         *   ★[[screen-only-info-never-reaches-the-report-2026-08-11]] の逆向きの穴
         *     (報告にしか出さない情報は画面に届かない)。
         *
         * ★構造のまま渡す=読み手(healthCells)が judgeVenueMirrorIntake で判定する。
         *   ここで判定結果を文字列化して渡すと、また同じ穴を作る。
         */
        mirrorIntake: {
          changedEvents: _venueMirrorIntake.changedEvents,
          keyMatched: _venueMirrorIntake.keyMatched,
          keyMissed: _venueMirrorIntake.keyMissed,
          accepted: _venueMirrorIntake.accepted,
          rejectedByGate: _venueMirrorIntake.rejectedByGate,
          lastMissedKeys: (_venueMirrorIntake.lastMissedKeys || []).slice(0, 3),
          lastExpectedKey: _venueMirrorIntake.lastExpectedKey,
          lastAcceptedAt: _venueMirrorIntake.lastAcceptedAt,
          lastRejectReason: _venueMirrorIntake.lastRejectReason
        },
        /*
         * ★v0.1.1348: 会場のアイコン実績を【トップレベル】にも載せる(v0.1.1347 の断線修理)。
         *
         * ■ v0.1.1347 で読み手(aiShareFullText)に `venueSeatsDiag.avatarProbe` を読む行を足したが、
         *   書き手はここに載せておらず【永久に出ない行】だった(通し確認を怠った)。
         *   avatarProbe は census の extras 経由で laneParity.dom へ平坦化されるだけで、
         *   しかも whitelist は probeFail 1個しか通していない。
         *   ＝[[venue-mirror-is-the-primary-path]]「個別列挙して作り直す関数が値を落とす」の再演。
         *
         * ★census 側(extras.avatarProbe)は現状維持で、ここに【追加で】貫通させる
         *   (既存契約を壊さない)。同じ 3秒 min-gap 内の1回呼びなので hot path は汚さない。
         */
        avatarProbe: venueAvatarLoadGuard.getDiagnostics()
      };
      publishVenueSeatsDiag(seatsDiagObs);
      _lastVenueSeatsDiagObs = seatsDiagObs;
      if (!diagPanel.hidden) renderDiagPanel();
      if (open) writeVenueEffectSoundPresence();
      runEntryEffects(String(activeLiveId || liveIdFromPathname() || ""));
    };
    const publishVenueSeatsDiag = (obs) => {
      try {
        const monotonic = nowMs();
        if (monotonic - _venueSeatsDiagLastWriteAt < 3e3) return;
        _venueSeatsDiagLastWriteAt = monotonic;
        const wallNow = Date.now();
        const snap = buildVenueSeatsDiagSnapshot({ ...obs, lastUpdateAt: wallNow }, wallNow);
        if (!hasVenueExtensionContext()) return;
        chrome.storage.local.set({ [KEY_VENUE_SEATS_DIAG]: snap }).catch(() => {
        });
      } catch {
      }
    };
    const composeVenueBaseRows = (candidates, fallbackRows) => {
      const liveId = String(activeLiveId || liveIdFromPathname() || "");
      const usable = isLaneMirrorUsableForVenue(laneMirrorSnap, liveId, Date.now());
      const staleButUsable = !usable.usable && usable.reason === "stale";
      if (!usable.usable && !staleButUsable) {
        laneMirrorPaintSnap = null;
        _venueTileOrigin = `fallback:${usable.reason || "?"}`;
        return fallbackRows;
      }
      laneMirrorPaintSnap = laneMirrorSnap;
      _venueTileOrigin = staleButUsable ? "mirror-stale" : "mirror";
      try {
        const cap = Math.max(0, Number(laneMirrorSnap?.capturedAt) || 0);
        if (cap > 0 && cap > _lastPaintedMirrorCapturedAt) {
          _lastPaintedMirrorCapturedAt = cap;
          venueAvatarLoadGuard.clearTimedOutFailures();
        }
      } catch {
      }
      const byUid = /* @__PURE__ */ new Map();
      for (const c of Array.isArray(candidates) ? candidates : []) {
        const uid = String(
          /** @type {any} */
          c?.userId || ""
        ).trim();
        if (uid && !byUid.has(uid)) byUid.set(uid, c);
      }
      const mirrorRows = venueRowsFromLaneMirror(laneMirrorPaintSnap, byUid);
      const inMirror = /* @__PURE__ */ new Set();
      for (const r of mirrorRows) {
        inMirror.add(r.userId);
        venueTransientFirstSeen.delete(`u:${r.userId}`);
      }
      const tail = (Array.isArray(fallbackRows) ? fallbackRows : []).filter(
        (r) => !inMirror.has(String(r?.userId || "").trim())
      );
      return (
        /** @type {VenueRow[]} */
        [...mirrorRows, ...tail]
      );
    };
    const currentVenueTransientKeys = (nowWallMs) => {
      const out = /* @__PURE__ */ new Set();
      for (const [k, at] of venueTransientFirstSeen) {
        if (nowWallMs - at > VENUE_LANE_TRANSIENT_WINDOW_MS * 2) {
          venueTransientFirstSeen.delete(k);
          continue;
        }
        if (nowWallMs - at <= VENUE_LANE_TRANSIENT_WINDOW_MS) out.add(k);
      }
      return out;
    };
    const scheduleLaneMirrorRecommit = () => {
      if (laneMirrorRecommitRaf) return;
      const run = () => {
        laneMirrorRecommitRaf = 0;
        if (!open) return;
        baseRows = composeVenueBaseRows(
          aggregatedCandidates,
          venueRowsFromUserLaneCandidates(aggregatedCandidates)
        );
        commitDisplay(baseRows);
      };
      laneMirrorRecommitRaf = typeof requestAnimationFrame === "function" ? requestAnimationFrame(run) : (run(), 0);
    };
    const aggregateParticipants = async () => {
      if (!open || aggregateInFlight) return;
      if (!hasVenueExtensionContext()) {
        markContextInvalidated();
        return;
      }
      const liveId = liveIdFromPathname();
      if (!liveId) return;
      aggregateInFlight = true;
      try {
        if (activeLiveId !== liveId) {
          activeLiveId = liveId;
          baseRows = [];
          seatByKey = /* @__PURE__ */ new Map();
          supporterOrderKeys = [];
          _supporterRankDrops = 0;
          _supporterRankOvertakes = 0;
          spokenUserIds.clear();
          aggregatedChunkSeqs = [];
          aggregatedCandidates = [];
          liveRoster.clear();
          laneMirrorPaintSnap = null;
          _venueStoryUserLaneLastTiledLid = "";
          venueTransientFirstSeen.clear();
          clearDisplay();
        }
        const idxKey = chunkIndexKey(liveId);
        const idxBag = await runStorageOpWithTimeout(
          () => chrome.storage.local.get(idxKey),
          8e3
        );
        if (!open || liveIdFromPathname() !== liveId) return;
        const index = idxBag ? idxBag[idxKey] : null;
        let _bcCtx = normalizeBroadcasterCtx(null);
        try {
          const _bcBag = await runStorageOpWithTimeout(
            () => chrome.storage.local.get(KEY_LIVE_BROADCASTER_CTX),
            3e3
          );
          if (!open || liveIdFromPathname() !== liveId) return;
          _bcCtx = normalizeBroadcasterCtx(_bcBag?.[KEY_LIVE_BROADCASTER_CTX]);
        } catch {
        }
        const _bcUsable = isBroadcasterCtxUsableForGuard(_bcCtx, liveId);
        const _bcLiveMatches = (() => {
          const cur = String(liveId ?? "").trim().toLowerCase();
          const own = String(_bcCtx.liveId ?? "").trim().toLowerCase();
          return !(cur && own && cur !== own);
        })();
        const _bcUidForExclude = _bcCtx.uid && _bcLiveMatches ? _bcCtx.uid : "";
        _lastBroadcasterUid = _bcUidForExclude;
        const LANE_OPTS = {
          requireText: true,
          // 本人除外は uid だけで効くので _bcUidForExclude(iconUrl 不問)。アイコン化け防止の
          //   broadcasterIconUrl は従来どおり両方そろった _bcUsable 時のみ(誤除外を避ける)。
          broadcasterUid: _bcUidForExclude,
          broadcasterIconUrl: _bcUsable ? _bcCtx.iconUrl : ""
        };
        if (isChunkIndex(index, liveId) && Array.isArray(
          /** @type {any} */
          index.seqs
        )) {
          const allSeqs = (
            /** @type {number[]} */
            /** @type {any} */
            index.seqs
          );
          const newSeqs = selectNewChunkSeqs(allSeqs, aggregatedChunkSeqs);
          if (newSeqs.length > 0) {
            const keys = newSeqs.map((seq) => chunkStorageKey(liveId, seq));
            const bag = await runStorageOpWithTimeout(
              () => chrome.storage.local.get(keys),
              8e3
            );
            if (!open || liveIdFromPathname() !== liveId) return;
            let newRows = [];
            for (const key of keys) {
              const part = bag ? bag[key] : null;
              if (Array.isArray(part)) newRows = newRows.concat(part);
            }
            const newCandidates = userLaneCandidatesFromStorage(newRows, liveId, LANE_OPTS);
            aggregatedCandidates = mergeUserLaneAggregates(aggregatedCandidates, newCandidates);
            aggregatedChunkSeqs = aggregatedChunkSeqs.concat(newSeqs);
          }
          baseRows = composeVenueBaseRows(
            aggregatedCandidates,
            venueRowsFromUserLaneCandidates(aggregatedCandidates)
          );
        } else {
          const result = await runStorageOpWithTimeout(
            () => readChunkedComments(
              liveId,
              commentsStorageKey(liveId),
              (keys) => chrome.storage.local.get(keys)
            ),
            8e3
          );
          if (!open || liveIdFromPathname() !== liveId) return;
          const candidates = userLaneCandidatesFromStorage(result.rows, liveId, LANE_OPTS);
          aggregatedCandidates = Array.from(candidates);
          baseRows = composeVenueBaseRows(candidates, venueRowsFromUserLaneCandidates(candidates));
        }
        const profileBag = await runStorageOpWithTimeout(
          () => chrome.storage.local.get(KEY_USER_COMMENT_PROFILE_CACHE),
          8e3
        );
        if (!open || liveIdFromPathname() !== liveId) return;
        const profileMap = (
          /** @type {Record<string, { avatarUrl?: unknown, nickname?: unknown }>|null} */
          profileBag?.[KEY_USER_COMMENT_PROFILE_CACHE] || null
        );
        if (profileMap) profileAvatarMap = profileMap;
        commitDisplay(baseRows);
      } catch (err) {
        if (isContextInvalidatedError(err) || !hasVenueExtensionContext()) {
          markContextInvalidated();
          return;
        }
        if (err !== STORAGE_OP_TIMED_OUT) {
          console.warn("[venue] aggregate failed; keeping last good", err);
        }
      } finally {
        aggregateInFlight = false;
      }
    };
    let aggregateBurstTimers = [];
    const clearAggregateBurst = () => {
      for (const t of aggregateBurstTimers) clearTimeout(t);
      aggregateBurstTimers = [];
    };
    let venueLiveOpenTimer = 0;
    const writeVenueLiveOpen = (open2) => {
      try {
        if (!hasVenueExtensionContext()) return;
        void chrome.storage.local.set({ [KEY_VENUE_LIVE_OPEN]: buildVenueLiveOpenValue(open2, Date.now()) }).catch(() => {
        });
      } catch {
      }
    };
    const startVenueLiveOpenHeartbeat = () => {
      if (venueLiveOpenTimer) return;
      writeVenueLiveOpen(true);
      venueLiveOpenTimer = setInterval(() => writeVenueLiveOpen(true), 3e4);
    };
    const stopVenueLiveOpenHeartbeat = () => {
      if (venueLiveOpenTimer) {
        clearInterval(venueLiveOpenTimer);
        venueLiveOpenTimer = 0;
      }
      writeVenueLiveOpen(false);
    };
    const stopAggregation = () => {
      stopVenueLiveOpenHeartbeat();
      clearAggregateBurst();
      if (rosterPruneTimer) {
        clearInterval(rosterPruneTimer);
        rosterPruneTimer = 0;
      }
      if (rosterCommitRaf && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rosterCommitRaf);
      }
      rosterCommitRaf = 0;
      if (!aggregateTimer) return;
      clearInterval(aggregateTimer);
      aggregateTimer = 0;
    };
    const startAggregation = () => {
      startVenueLiveOpenHeartbeat();
      if (aggregateTimer || rosterPruneTimer) return;
      void (async () => {
        try {
          if (!hasVenueExtensionContext()) return;
          const _catchUpLiveId = String(activeLiveId || liveIdFromPathname() || "").trim().toLowerCase();
          const _panelKey = _catchUpLiveId ? panelSummaryStorageKey(_catchUpLiveId) : "";
          const _mirrorKey = laneMirrorKeyFor(_catchUpLiveId);
          const _receiptKey = laneReceiptKeyFor(_catchUpLiveId);
          const _keys = [KEY_LANE_MIRROR, KEY_STORY_DIAG_MIRROR];
          if (_panelKey) _keys.push(_panelKey);
          if (_mirrorKey) _keys.push(_mirrorKey, _receiptKey);
          const bag = await runStorageOpWithTimeout(() => chrome.storage.local.get(_keys), 3e3);
          const snap = (_mirrorKey ? acceptLaneMirrorSnapshot(bag?.[_mirrorKey]) : null) || acceptLaneMirrorSnapshot(bag?.[KEY_LANE_MIRROR]);
          if (open && _receiptKey && bag?.[_receiptKey]) {
            _laneReceiptFromPopup = /** @type {any} */
            bag[_receiptKey];
          }
          if (open && snap && adoptVenueMirrorGuarded(snap, _catchUpLiveId)) {
            laneMirrorSnap = snap;
            scheduleLaneMirrorRecommit();
          }
          const storySnap = bag?.[KEY_STORY_DIAG_MIRROR];
          if (open && storySnap && typeof storySnap === "object") {
            storyDiagMirrorSnap = /** @type {Record<string, unknown>} */
            storySnap;
          }
          const panelSnap = _panelKey ? bag?.[_panelKey] : null;
          if (open && panelSnap && typeof panelSnap === "object") {
            panelSummarySnap = /** @type {Record<string, unknown>} */
            panelSnap;
            _panelSummaryLastSeenAt = Date.now();
            noteCheerCount();
          }
          if (open && (storySnap && typeof storySnap === "object" || panelSnap && typeof panelSnap === "object")) {
            renderStoryDiagMirrorPanel();
          }
          try {
            noteVenueMirrorSettled(_openLatency, Date.now(), {
              absent: !(snap && typeof snap === "object")
            });
          } catch {
          }
        } catch {
          try {
            noteVenueMirrorSettled(_openLatency, Date.now(), { timedOut: true });
          } catch {
          }
        }
      })();
      if (rosterDriven) {
        void (async () => {
          await aggregateParticipants();
          try {
            noteVenueAggregateSettled(_openLatency, Date.now());
          } catch {
          }
          if (!open || !rosterDriven) return;
          hydrateRosterFromCandidates(liveRoster, aggregatedCandidates, {
            maxSeats: VENUE_ROSTER_MAX_SEATS
          });
          scheduleRosterCommit();
        })();
        rosterPruneTimer = window.setInterval(() => {
          if (!open || !rosterDriven) return;
          const before = liveRoster.size;
          pruneRoster(liveRoster, Date.now(), {
            windowMs: VENUE_ROSTER_WINDOW_MS,
            vipWindowMs: VENUE_ROSTER_VIP_WINDOW_MS,
            maxSeats: VENUE_ROSTER_MAX_SEATS
          });
          if (liveRoster.size !== before) {
            baseRows = rosterToVenueRows(liveRoster);
            commitDisplay(baseRows);
          }
        }, 5e3);
        return;
      }
      void aggregateParticipants();
      clearAggregateBurst();
      for (const delay of [400, 1e3, 2e3, 3500, 5500, 8e3]) {
        aggregateBurstTimers.push(
          window.setTimeout(() => {
            if (open) void aggregateParticipants();
          }, delay)
        );
      }
      aggregateTimer = window.setInterval(() => {
        void aggregateParticipants();
      }, AGGREGATE_INTERVAL_MS);
    };
    const processSpeechRows = (rows) => {
      applyVenueHeat(rows);
      pruneSpeechStreaks(speechStreaks, Date.now());
      const speechReceivedAt = Date.now();
      const result = pickNewVenueSpeech(rows, speechState, { maxEmit: 24, primeEmit: 3 });
      speechState = {
        seenKeys: result.seenKeys,
        primed: result.primed
      };
      if (result.speeches.length > 0) voicePlayer.diag.venueGate = voicePlayer.enabled ? "ok" : "voice-off";
      if (result.speeches.length > 0) {
        pickupRing = appendPickupRows(pickupRing, result.speeches, Date.now(), {
          // 発言者のサムネ・ハンドル名・ID・リンクをセットで(§3.5)。サムネは観測済みのプロフィール > uid から導出 > 匿名は identicon。
          resolveSpeaker: (sp) => resolvePickupSpeaker(sp, { profileAvatarUrl: profileAvatarMap && profileAvatarMap[String(sp?.userId || "")]?.avatarUrl, profileNickname: profileAvatarMap && profileAvatarMap[String(sp?.userId || "")]?.nickname })
        });
        updatePickupBanner(null);
      }
      if (result.speeches.length > 0) {
        for (const speech of result.speeches) {
          const uid = String(speech.userId || "").trim();
          if (uid) spokenUserIds.add(uid);
        }
        const nowMs2 = Date.now();
        if (rosterDriven) {
          for (const speech of result.speeches) {
            touchRoster(liveRoster, { userId: speech.userId, name: speech.name, text: speech.text }, nowMs2);
          }
          baseRows = rosterToVenueRows(liveRoster);
          commitDisplay(baseRows);
        } else {
          if (laneMirrorPaintSnap) {
            const wallNow = Date.now();
            for (const speech of result.speeches) {
              const uid = String(speech.userId || "").trim();
              if (!uid) continue;
              const k = `u:${uid}`;
              if (!venueTransientFirstSeen.has(k)) venueTransientFirstSeen.set(k, wallNow);
            }
          }
          baseRows = mergeSpeakersIntoVenueRows(baseRows, result.speeches, nowMs2);
          commitDisplay(baseRows);
        }
      }
      for (const speech of result.speeches) {
        const bubble = showSpeechBubble(speech);
        maybeThrowGiftFromSpeech(speech);
        maybeThrowArrivalFromSpeech(speech);
        if (voicePlayer.enabled) {
          const voiceIt = () => voicePlayer.enqueue([{
            kind: "comment",
            userId: speech.userId,
            nickname: speech.name,
            key: speech.key,
            text: speech.text,
            // 2026-10-22計器(P1): 受信時刻。読み上げの「受信→キュー」の遅れを測る。
            receivedAt: speech.capturedAt > 0 ? speech.capturedAt : speechReceivedAt,
            // ★キャラライブの相槌はここに乗せる(2026-08-25)。
            //   onAudioStart は「本当に audio.play() が走った」時だけ鳴る信号なので、
            //   読み上げの声とキャラの頷きが必ず揃う。onPlayStart(再生/破棄の両方で
            //   発火する曖昧信号)に乗せると、鳴っていないのに頷く事故になる。
            onAudioStart: () => {
              if (bubble) markBubbleSpeaking(bubble);
              charaLive.onCommentSpoken({ commentKey: speech.key, text: speech.text });
            },
            onAudioEnd: () => {
              if (bubble) markBubbleDone(bubble);
              charaLive.onCommentSpokenEnd();
            },
            // 鳴らずに捨てられた時も相槌を畳む(声が無いのに頷いたまま残さない)。
            onDropped: () => {
              if (bubble) markBubbleResolved(bubble);
              charaLive.onCommentSpokenEnd();
            }
          }]);
          if (!venueReaderLease) voiceIt();
          else venueReaderLease.whenMine(liveIdFromPathname(), voiceIt, () => {
            if (bubble) markBubbleResolved(bubble);
            voicePlayer.diag.readerYieldTotal = (Number(voicePlayer.diag.readerYieldTotal) || 0) + 1;
          });
        }
      }
    };
    const scheduleRosterCommit = () => {
      if (rosterCommitRaf) return;
      const run = () => {
        rosterCommitRaf = 0;
        if (!open || !rosterDriven) return;
        pruneRoster(liveRoster, Date.now(), {
          windowMs: VENUE_ROSTER_WINDOW_MS,
          vipWindowMs: VENUE_ROSTER_VIP_WINDOW_MS,
          maxSeats: VENUE_ROSTER_MAX_SEATS
        });
        baseRows = rosterToVenueRows(liveRoster);
        commitDisplay(baseRows);
      };
      rosterCommitRaf = typeof requestAnimationFrame === "function" ? requestAnimationFrame(run) : (run(), 0);
    };
    const onLiveComments = (incomingLiveId, rows) => {
      if (!open) return;
      const cur = liveIdFromPathname();
      if (!cur || cur !== incomingLiveId) return;
      if (speechLiveId !== cur) resetSpeechTracking(cur);
      const feedRows = liveFeedSpeechRows(rows);
      if (feedRows.length === 0) return;
      processSpeechRows(feedRows);
      if (!rosterDriven) return;
      const now = Date.now();
      for (const r of feedRows) touchRoster(liveRoster, r, now);
      scheduleRosterCommit();
    };
    const pollSpeech = async () => {
      if (!open || speechInFlight) return;
      if (!hasVenueExtensionContext()) {
        markContextInvalidated();
        return;
      }
      const liveId = liveIdFromPathname();
      if (!liveId) return;
      if (speechLiveId !== liveId) resetSpeechTracking(liveId);
      const generation = speechGeneration;
      const tailKey = tailStorageKey(liveId);
      const summaryKey = commentDbSummaryKey(liveId);
      const giftPointsAggregateKey = officialGiftPointsAggregateStorageKey(liveId);
      const STORY_DIAG_PANEL_STALE_MS = 15e3;
      const needsPanelSummaryRefresh = Date.now() - _panelSummaryLastSeenAt > STORY_DIAG_PANEL_STALE_MS;
      const panelKey = needsPanelSummaryRefresh ? panelSummaryStorageKey(liveId) : "";
      speechInFlight = true;
      try {
        const bag = await chrome.storage.local.get(
          panelKey ? [tailKey, summaryKey, giftPointsAggregateKey, panelKey] : [tailKey, summaryKey, giftPointsAggregateKey]
        );
        if (!open || generation !== speechGeneration || speechLiveId !== liveId || liveIdFromPathname() !== liveId) {
          return;
        }
        const tailRows = Array.isArray(bag?.[tailKey]) ? bag[tailKey] : [];
        const summary = (
          /** @type {{ recent?: unknown }|undefined} */
          bag?.[summaryKey]
        );
        const recentRows = Array.isArray(summary?.recent) ? summary.recent : [];
        const rows = tailRows.length > 0 ? tailRows : recentRows;
        processSpeechRows(rows);
        const aggregatePoints = bag?.[giftPointsAggregateKey];
        if (typeof aggregatePoints === "number") handleGiftPointsAggregate(aggregatePoints);
        if (panelKey) {
          const panelSnap = bag?.[panelKey];
          if (panelSnap && typeof panelSnap === "object") {
            panelSummarySnap = /** @type {Record<string, unknown>} */
            panelSnap;
            _panelSummaryLastSeenAt = Date.now();
            noteCheerCount();
            renderStoryDiagMirrorPanel();
          }
        }
      } catch (err) {
        if (isContextInvalidatedError(err) || !hasVenueExtensionContext()) {
          markContextInvalidated();
          return;
        }
      } finally {
        speechInFlight = false;
      }
    };
    const handleStorageChange = (changes, areaName) => {
      if (areaName !== "local" || !open) return;
      const liveId = liveIdFromPathname();
      if (!liveId) return;
      const tailKey = tailStorageKey(liveId);
      const summaryKey = commentDbSummaryKey(liveId);
      if (changes[tailKey] && Array.isArray(changes[tailKey].newValue)) {
        processSpeechRows(
          /** @type {Array<Record<string, any>>} */
          changes[tailKey].newValue
        );
      } else if (changes[tailKey] || changes[summaryKey]) {
        void pollSpeech();
      }
      const giftEventsKey = `nls_gift_events_${liveId}`;
      if (changes[giftEventsKey] && Array.isArray(changes[giftEventsKey].newValue)) {
        handleNewGiftEvents(
          /** @type {Array<Record<string, any>>} */
          changes[giftEventsKey].newValue
        );
      }
      const giftPointsAggregateKey = officialGiftPointsAggregateStorageKey(liveId);
      if (changes[giftPointsAggregateKey] && typeof changes[giftPointsAggregateKey].newValue === "number") {
        handleGiftPointsAggregate(
          /** @type {number} */
          changes[giftPointsAggregateKey].newValue
        );
      }
      const profChange = changes[KEY_USER_COMMENT_PROFILE_CACHE];
      if (profChange && profChange.newValue && typeof profChange.newValue === "object" && !Array.isArray(profChange.newValue)) {
        profileAvatarMap = /** @type {Record<string, { avatarUrl?: unknown, nickname?: unknown }>} */
        profChange.newValue;
        if (rosterDriven) scheduleRosterCommit();
      }
      const _perLiveKey = laneMirrorKeyFor(liveId);
      const perLiveChange = _perLiveKey ? changes[_perLiveKey] : null;
      const mirrorChange = _perLiveKey ? perLiveChange : changes[KEY_LANE_MIRROR];
      try {
        observeVenueMirrorChange(_venueMirrorIntake, {
          changedKeys: Object.keys(changes || {}),
          expectedKey: _perLiveKey || KEY_LANE_MIRROR,
          matched: Boolean(mirrorChange && mirrorChange.newValue)
        });
      } catch {
      }
      if (mirrorChange && mirrorChange.newValue) {
        const accepted = acceptLaneMirrorSnapshot(mirrorChange.newValue);
        try {
          observeVenueMirrorAccept(_venueMirrorIntake, {
            accepted: Boolean(accepted),
            nowMs: Date.now(),
            reason: accepted ? "" : _laneMirrorSanitizeIssues || "関所が捨てた"
          });
        } catch {
        }
        if (accepted && adoptVenueMirrorGuarded(accepted, liveId)) {
          laneMirrorSnap = accepted;
          scheduleLaneMirrorRecommit();
        }
      }
      const _receiptChangeKey = laneReceiptKeyFor(liveId);
      const receiptChange = _receiptChangeKey ? changes[_receiptChangeKey] : null;
      if (receiptChange && receiptChange.newValue && typeof receiptChange.newValue === "object") {
        _laneReceiptFromPopup = /** @type {any} */
        receiptChange.newValue;
      }
      const storyDiagChange = changes[KEY_STORY_DIAG_MIRROR];
      if (storyDiagChange && storyDiagChange.newValue && typeof storyDiagChange.newValue === "object") {
        storyDiagMirrorSnap = /** @type {Record<string, unknown>} */
        storyDiagChange.newValue;
        renderStoryDiagMirrorPanel();
      }
      const panelChange = changes[panelSummaryStorageKey(liveId)];
      if (panelChange && panelChange.newValue && typeof panelChange.newValue === "object") {
        panelSummarySnap = /** @type {Record<string, unknown>} */
        panelChange.newValue;
        _panelSummaryLastSeenAt = Date.now();
        noteCheerCount();
        renderStoryDiagMirrorPanel();
      }
      if (rosterDriven) return;
      const idxKey = chunkIndexKey(liveId);
      const chunkPrefix = `nls_cchunk_${liveId}`;
      let chunkChanged = false;
      for (const k in changes) {
        if (k === idxKey || k === summaryKey || k.indexOf(chunkPrefix) === 0) {
          chunkChanged = true;
          break;
        }
      }
      if (chunkChanged) void aggregateParticipants();
    };
    const stopSpeechPolling = () => {
      if (!speechTimer) return;
      clearInterval(speechTimer);
      speechTimer = 0;
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.removeListener(handleStorageChange);
      }
    };
    let _contextInvalidated = false;
    const markContextInvalidated = () => {
      if (_contextInvalidated) return;
      _contextInvalidated = true;
      try {
        stopAggregation();
      } catch {
      }
      try {
        stopSpeechPolling();
      } catch {
      }
      try {
        stopCrowdMotion();
      } catch {
      }
      try {
        charaLive.destroy();
      } catch {
      }
      try {
        title.textContent = "⚠ 拡張が新しい版になりました。このページを自動で読み込み直します(コメント入力中は待ちます)";
        title.style.color = "#ffcf66";
      } catch {
      }
    };
    const startSpeechPolling = () => {
      if (speechTimer) return;
      void pollSpeech();
      speechTimer = window.setInterval(() => {
        void pollSpeech();
      }, SPEECH_INTERVAL_MS);
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(handleStorageChange);
      }
    };
    const isEditableOutsideVenue = (t) => {
      if (!(t instanceof HTMLElement)) return false;
      if (root.contains(t)) return false;
      return t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT";
    };
    const onEscapeKey = (event) => {
      if (event.key !== "Escape" || !open) return;
      if (event.isComposing || event.keyCode === 229 || isEditableOutsideVenue(event.target)) return;
      if (tucked) {
        setTucked(false);
        return;
      }
      if (!speechPanel.hidden) {
        closeSpeechPanel();
        return;
      }
      if (!diagPanel.hidden) {
        toggleDiagPanel(false);
        return;
      }
      if (!rosterPanel.hidden) {
        toggleRosterPanel(false);
        return;
      }
      if (isStandalone) return;
      userChangedOpen = true;
      setOpen(false, true);
    };
    const addEscapeListener = () => {
      if (escapeListening) return;
      window.addEventListener("keydown", onEscapeKey);
      escapeListening = true;
    };
    const removeEscapeListener = () => {
      if (!escapeListening) return;
      window.removeEventListener("keydown", onEscapeKey);
      escapeListening = false;
    };
    let reflowRaf = 0;
    let reflowListening = false;
    const onBubbleReflow = () => {
      if (reflowRaf) return;
      reflowRaf = typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => {
        reflowRaf = 0;
        repositionAllBubbles();
      }) : 0;
      if (!reflowRaf) repositionAllBubbles();
    };
    const addBubbleReflowListener = () => {
      if (reflowListening) return;
      window.addEventListener("resize", onBubbleReflow);
      window.addEventListener("scroll", onBubbleReflow, true);
      reflowListening = true;
    };
    const removeBubbleReflowListener = () => {
      if (!reflowListening) return;
      window.removeEventListener("resize", onBubbleReflow);
      window.removeEventListener("scroll", onBubbleReflow, true);
      if (reflowRaf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(reflowRaf);
      reflowRaf = 0;
      reflowListening = false;
    };
    let tucked = false;
    const TOGGLE_LABEL_OPEN = toggle.textContent || "🏟 会場モード";
    const setTucked = (next) => {
      tucked = next === true;
      root.classList.toggle("nlsb-is-tucked", tucked);
      toggle.textContent = tucked ? "▲ 会場に戻る" : TOGGLE_LABEL_OPEN;
      toggle.setAttribute("aria-label", tucked ? "会場に戻る" : "会場モード");
      if (tucked) {
        try {
          closeSpeechPanel();
          if (!rosterPanel.hidden) toggleRosterPanel(false);
          if (!diagPanel.hidden) toggleDiagPanel(false);
          closeHoverCard();
        } catch {
        }
      }
    };
    const setOpen = (nextOpen, persist) => {
      open = nextOpen === true;
      voicePlayer.diag.venueGate = open ? "no-input" : "panel-closed";
      root.classList.toggle("nlsb-is-open", open);
      try {
        document.documentElement.classList.toggle("nlsb-venue-open", open);
      } catch {
      }
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      stage.setAttribute("aria-hidden", open ? "false" : "true");
      try {
        charaLive.setVisible(open);
      } catch {
      }
      if (open) {
        try {
          noteVenueOpened(_openLatency, Date.now());
        } catch {
        }
        addEscapeListener();
        addBubbleReflowListener();
        renderResidents();
        renderCharFrame();
        startAggregation();
        startSpeechPolling();
      } else {
        setTucked(false);
        try {
          closeSpeechPanel();
          if (!rosterPanel.hidden) toggleRosterPanel(false);
          if (!diagPanel.hidden) toggleDiagPanel(false);
          closeHoverCard();
        } catch {
        }
        removeEscapeListener();
        removeBubbleReflowListener();
        stopAggregation();
        stopSpeechPolling();
        stopCrowdMotion();
        resetSpeechTracking();
        clearDisplay();
        aggregatedChunkSeqs = [];
        aggregatedCandidates = [];
        spokenUserIds.clear();
        laneMirrorPaintSnap = null;
        venueTransientFirstSeen.clear();
      }
      if (persist) {
      }
    };
    toggle.addEventListener("click", () => {
      if (tucked) {
        setTucked(false);
        return;
      }
      userChangedOpen = true;
      setOpen(!open, true);
    });
    close.addEventListener("click", () => {
      if (isStandalone) {
        stopAggregation();
        stopSpeechPolling();
        stopCrowdMotion();
        try {
          window.close();
        } catch {
        }
        userChangedOpen = true;
        setOpen(false, false);
        return;
      }
      userChangedOpen = true;
      setOpen(false, true);
    });
    window.addEventListener(
      "pagehide",
      (ev) => {
        stopAggregation();
        stopSpeechPolling();
        stopCrowdMotion();
        resetSpeechTracking();
        removeEscapeListener();
        try {
          document.documentElement.classList.remove("nlsb-venue-open");
        } catch {
        }
        if (ev && /** @type {PageTransitionEvent} */
        ev.persisted && open) {
          try {
            setOpen(false, false);
          } catch {
          }
        }
      }
    );
    const relocateRootForFullscreen = () => {
      try {
        const fs = document.fullscreenElement;
        const home = document.documentElement;
        if (fs) {
          if (fs !== root && !(fs instanceof HTMLVideoElement) && !fs.contains(root)) fs.appendChild(root);
        } else if (root.parentNode !== home) {
          home.appendChild(root);
        }
      } catch {
      }
    };
    document.addEventListener("fullscreenchange", relocateRootForFullscreen);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      if (!open || !voicePlayer.enabled) return;
      try {
        voicePlayer.flushPendingQueue();
      } catch {
      }
    });
    if (isStandalone) {
      setOpen(true, false);
    } else {
      setOpen(false, false);
    }
    return { onLiveComments };
  }
  function mountVenueStandalone(liveId) {
    _forcedLiveId = liveId;
    mountVenueBarButton({ standalone: true });
  }

  // src/extension/venue-entry.js
  function main() {
    const searchParams = new URLSearchParams(location.search);
    const liveId = searchParams.get("lv");
    if (liveId) {
      mountVenueStandalone(liveId);
    }
  }
  main();
})();
