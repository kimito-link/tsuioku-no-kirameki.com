(() => {
  // src/lib/protobufVarint.js
  function readUint32Varint(bytes, offset) {
    if (offset < 0 || offset >= bytes.length) return null;
    let result = 0n;
    let shift = 0n;
    let o = offset;
    for (let i = 0; i < 10; i += 1) {
      const b = bytes[o];
      if (b === void 0) return null;
      o += 1;
      result |= BigInt(b & 127) << shift;
      if (result > 0xffffffffn) return null;
      if ((b & 128) === 0) {
        return { value: Number(result), length: o - offset };
      }
      shift += 7n;
    }
    return null;
  }

  // src/lib/lengthDelimitedStream.js
  function splitLengthDelimitedMessagesWithTail(bytes) {
    const frames = [];
    let offset = 0;
    while (offset < bytes.length) {
      const vr = readUint32Varint(bytes, offset);
      if (!vr) break;
      const frameStart = offset + vr.length;
      const frameEnd = frameStart + vr.value;
      if (frameEnd > bytes.length) break;
      frames.push(bytes.subarray(frameStart, frameEnd));
      offset = frameEnd;
    }
    const tail = offset < bytes.length ? bytes.subarray(offset) : new Uint8Array(0);
    return { frames, tail };
  }
  function concatUint8Arrays(parts) {
    let len = 0;
    for (const p of parts) len += p.length;
    const out = new Uint8Array(len);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
  function createLengthDelimitedStreamAccumulator(options = {}) {
    const maxPending = Math.max(
      4096,
      Math.min(Number(options.maxPendingBytes) || 2e6, 8e6)
    );
    let pending = new Uint8Array(0);
    let droppedBytes = 0;
    let totalFrames = 0;
    return {
      /**
       * @param {Uint8Array} chunk
       * @param {(frame: Uint8Array) => void} onFrame
       */
      push(chunk, onFrame) {
        if (!chunk?.length) return;
        let combined = pending.length === 0 ? chunk : concatUint8Arrays([pending, chunk]);
        if (combined.length > maxPending) {
          const over = combined.length - maxPending;
          droppedBytes += over;
          combined = combined.subarray(combined.length - maxPending);
        }
        const { frames, tail } = splitLengthDelimitedMessagesWithTail(combined);
        pending = tail.length ? new Uint8Array(tail) : new Uint8Array(0);
        for (const fr of frames) {
          totalFrames += 1;
          onFrame(fr);
        }
      },
      getStats() {
        return {
          pendingBytes: pending.length,
          droppedBytes,
          totalFrames
        };
      },
      reset() {
        pending = new Uint8Array(0);
        droppedBytes = 0;
        totalFrames = 0;
      }
    };
  }

  // src/lib/interceptBinaryTextExtract.js
  var MAX_PAIR_DISTANCE = 600;
  var UID_RE = /"(?:user_id|userId|uid|hashed_user_id|hashedUserId|raw_user_id)"\s*:\s*"?(\w{5,26})"?/g;
  var NO_RE = /"(?:no|commentNo|comment_no)"\s*:\s*(\d+)/g;
  function extractPairsFromBinaryUtf8(text) {
    if (!text || text.length < 4) return [];
    const uids = [];
    const nos = [];
    let m;
    const uidRe = new RegExp(UID_RE.source, "g");
    while ((m = uidRe.exec(text)) !== null) {
      uids.push({ val: m[1], pos: m.index });
    }
    const noRe = new RegExp(NO_RE.source, "g");
    while ((m = noRe.exec(text)) !== null) {
      nos.push({ val: m[1], pos: m.index });
    }
    if (!uids.length || !nos.length) return [];
    const out = [];
    for (const u of uids) {
      let best = null;
      let bestDist = Infinity;
      for (const n of nos) {
        const dist = Math.abs(u.pos - n.pos);
        if (dist < bestDist) {
          bestDist = dist;
          best = n;
        }
      }
      if (best && bestDist < MAX_PAIR_DISTANCE) {
        out.push({ no: best.val, uid: u.val });
      }
    }
    return out;
  }

  // src/lib/ndgrDecode.js
  function pbVarint(buf, off) {
    let v = 0, s = 0;
    for (let i = off; i < buf.length; i++) {
      const b = buf[i];
      v += (b & 127) * 2 ** s;
      s += 7;
      if (!(b & 128)) return [v, i + 1];
      if (s > 56) return null;
    }
    return null;
  }
  function pbForEach(buf, start, end, cb) {
    let o = start;
    while (o < end) {
      const t = pbVarint(buf, o);
      if (!t) break;
      o = t[1];
      const fn = t[0] >>> 3, wt = t[0] & 7;
      if (wt === 0) {
        const v = pbVarint(buf, o);
        if (!v) break;
        cb(fn, 0, v[0], o, v[1]);
        o = v[1];
      } else if (wt === 2) {
        const l = pbVarint(buf, o);
        if (!l) break;
        const s = l[1], e = l[1] + l[0];
        if (e > end) break;
        cb(fn, 2, null, s, e);
        o = e;
      } else if (wt === 1) {
        o += 8;
        if (o > end) break;
      } else if (wt === 5) {
        o += 4;
        if (o > end) break;
      } else {
        break;
      }
    }
  }
  function decodeStatistics(buf, start, end) {
    let viewers = null, comments = null, adPoints = null, giftPoints = null;
    pbForEach(buf, start, end, (fn, wt, val) => {
      if (wt !== 0) return;
      if (fn === 1) viewers = val;
      if (fn === 2) comments = val;
      if (fn === 3) adPoints = val;
      if (fn === 4) giftPoints = val;
    });
    return { viewers, comments, adPoints, giftPoints };
  }
  var _dec = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { fatal: false }) : null;
  function decodeStr(buf, s, e) {
    if (!_dec) return "";
    try {
      return _dec.decode(buf.subarray(s, e));
    } catch {
      return "";
    }
  }
  function decodeChat(buf, start, end) {
    let no = null, rawUserId = null, hashedUserId = "", name = "", content = "";
    let vpos = (
      /** @type {number|null} */
      null
    );
    let accountStatus = (
      /** @type {number|null} */
      null
    );
    let is184 = false;
    pbForEach(buf, start, end, (fn, wt, val, s, e) => {
      if (fn === 8 && wt === 0) no = val;
      if (fn === 5 && wt === 0) rawUserId = val;
      if (fn === 6 && wt === 2) hashedUserId = decodeStr(buf, s, e);
      if (fn === 2 && wt === 2) name = decodeStr(buf, s, e);
      if (fn === 1 && wt === 2) content = decodeStr(buf, s, e);
      if (fn === 3 && wt === 0) vpos = val;
      if (fn === 4 && wt === 0) accountStatus = val;
      if (fn === 7 && wt === 2) {
        pbForEach(buf, s, e, (mfn, mwt, mval) => {
          if (mfn === 1 && mwt === 0) is184 = Boolean(mval);
        });
      }
    });
    return { no, rawUserId, hashedUserId, name, content, vpos, accountStatus, is184 };
  }
  function decodeGift(buf, start, end) {
    let advertiserUserId = "";
    let advertiserName = "";
    const strs = [];
    pbForEach(buf, start, end, (fn, wt, val, s, e) => {
      if (wt === 2) {
        const str = decodeStr(buf, s, e);
        if (str) strs.push(str);
        if (fn === 2 && str) advertiserName = advertiserName || str;
        if (fn === 1 && str && /^\d{5,14}$/.test(str)) {
          advertiserUserId = advertiserUserId || str;
        }
      } else if (wt === 0 && val != null) {
        const vs = String(val);
        if (/^\d{5,14}$/.test(vs)) advertiserUserId = advertiserUserId || vs;
      }
    });
    for (const str of strs) {
      if (!advertiserUserId && /^\d{5,14}$/.test(str)) advertiserUserId = str;
    }
    if (!advertiserName) {
      for (const str of strs) {
        if (str !== advertiserUserId && str.length > 0 && str.length <= 128 && !/^https?:\/\//i.test(str)) {
          advertiserName = str;
          break;
        }
      }
    }
    return { advertiserUserId, advertiserName };
  }
  function decodeChunkedMessage(buf, start, end) {
    const s0 = start ?? 0;
    const e0 = end ?? buf.length;
    let stats = null;
    const chats = [];
    const gifts = [];
    pbForEach(buf, s0, e0, (fn, wt, _v, s, e) => {
      if (wt !== 2) return;
      if (fn === 4) {
        pbForEach(buf, s, e, (sfn, swt, _sv, ss, se) => {
          if (sfn === 1 && swt === 2) {
            stats = decodeStatistics(buf, ss, se);
          }
        });
      }
      if (fn === 2) {
        pbForEach(buf, s, e, (mfn, mwt, _mv, ms, me) => {
          if (mwt !== 2) return;
          if (mfn === 1 || mfn === 20) {
            const chat = decodeChat(buf, ms, me);
            if (chat.no != null) chats.push(chat);
          } else if (mfn === 8) {
            const g = decodeGift(buf, ms, me);
            if (g.advertiserUserId || g.advertiserName) gifts.push(g);
          }
        });
      }
    });
    return { stats, chats, gifts };
  }
  function decodePackedSegment(buf, start, end) {
    const s0 = start ?? 0;
    const e0 = end ?? buf.length;
    const results = [];
    pbForEach(buf, s0, e0, (fn, wt, _v, s, e) => {
      if (fn === 1 && wt === 2) {
        results.push(decodeChunkedMessage(buf, s, e));
      }
    });
    return results;
  }

  // src/lib/supportGrowthTileSrc.js
  function niconicoDefaultUserIconUrl(userId) {
    const s = String(userId || "").trim();
    if (!/^\d{5,14}$/.test(s)) return "";
    const n = Number(s);
    if (!Number.isFinite(n) || n < 1) return "";
    const bucket = Math.max(1, Math.floor(n / 1e4));
    return `https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/${bucket}/${s}.jpg`;
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

  // src/lib/commentRecord.js
  function normalizeCommentText(value) {
    return String(value || "").replace(/\r\n/g, "\n").split("\n").map((l) => l.trim()).join("\n").trim();
  }

  // src/lib/ndgrChatRows.js
  function ndgrChatUserId(chat) {
    if (chat.rawUserId) {
      const s = String(chat.rawUserId).trim();
      if (s) return s;
    }
    const h = String(chat.hashedUserId || "").trim();
    return h || null;
  }
  function ndgrChatsToMergeRows(chats) {
    if (!Array.isArray(chats) || !chats.length) return [];
    const out = [];
    for (const chat of chats) {
      if (!chat || chat.no == null) continue;
      const text = normalizeCommentText(chat.content);
      if (!text) continue;
      const commentNo = String(chat.no).trim();
      if (!commentNo) continue;
      const uid = ndgrChatUserId(chat);
      const row = { commentNo, text, userId: uid || null };
      const nick = anonymousNicknameFallback(uid, chat.name);
      if (nick) row.nickname = nick;
      if (chat.vpos != null) row.vpos = chat.vpos;
      if (chat.accountStatus != null) row.accountStatus = chat.accountStatus;
      if (chat.is184) row.is184 = true;
      out.push(row);
    }
    return out;
  }

  // src/lib/niconicoInterceptLearn.js
  var INTERCEPT_NO_KEYS = Object.freeze([
    "no",
    "commentNo",
    "comment_no",
    "number",
    "vpos_no"
  ]);
  var INTERCEPT_UID_KEYS = Object.freeze([
    "user_id",
    "userId",
    "uid",
    "raw_user_id",
    "hashedUserId",
    "hashed_user_id",
    "senderUserId",
    "accountId",
    "advertiser_user_id",
    "advertiserUserId"
  ]);
  var INTERCEPT_NAME_KEYS = Object.freeze([
    "name",
    "nickname",
    "userName",
    "user_name",
    "displayName",
    "display_name",
    "advertiser_name",
    "advertiserName"
  ]);
  var INTERCEPT_AVATAR_KEYS = Object.freeze([
    "iconUrl",
    "icon_url",
    "avatarUrl",
    "avatar_url",
    "userIconUrl",
    "user_icon_url",
    "thumbnailUrl",
    "thumbnail_url"
  ]);
  var INTERCEPT_NESTED_KEYS = Object.freeze([
    "chat",
    "comment",
    "data",
    "message",
    "body",
    "user",
    "sender"
  ]);
  function normalizeInterceptAvatarUrl(url) {
    const s = String(url ?? "").trim();
    if (!/^https?:\/\//i.test(s)) return "";
    return s;
  }
  var NICO_USERICON_IN_STRING_RE = /https?:\/\/[^\s"'<>]+?nicoaccount\/usericon\/(?:s\/)?(\d+)\/(\d+)\.[\w.]+/gi;
  function extractLearnUsersFromNicoUserIconUrlsInString(text) {
    const s = String(text || "");
    if (!s.includes("nicoaccount") || !s.includes("usericon")) return [];
    const out = [];
    NICO_USERICON_IN_STRING_RE.lastIndex = 0;
    let m;
    while ((m = NICO_USERICON_IN_STRING_RE.exec(s)) !== null) {
      const uid = String(m[2] || "").trim();
      const av = normalizeInterceptAvatarUrl(m[0]);
      if (uid && av && /^\d{5,14}$/.test(uid)) out.push({ uid, name: "", av });
    }
    return out;
  }
  function collectInterceptSignalsFromObject(obj) {
    const enqueues = [];
    const learnUsers = [];
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      return { enqueues, learnUsers };
    }
    const rec = (
      /** @type {Record<string, unknown>} */
      obj
    );
    let no = null;
    let uid = null;
    let name = null;
    let av = "";
    for (const k of INTERCEPT_NO_KEYS) {
      if (rec[k] != null) {
        no = rec[k];
        break;
      }
    }
    for (const k of INTERCEPT_UID_KEYS) {
      if (rec[k] != null) {
        uid = rec[k];
        break;
      }
    }
    for (const k of INTERCEPT_NAME_KEYS) {
      if (rec[k] != null && typeof rec[k] === "string") {
        name = rec[k];
        break;
      }
    }
    for (const k of INTERCEPT_AVATAR_KEYS) {
      if (rec[k] != null && typeof rec[k] === "string") {
        av = normalizeInterceptAvatarUrl(rec[k]);
        if (av) break;
      }
    }
    if (no == null || uid == null || name == null || !av) {
      for (const sub of INTERCEPT_NESTED_KEYS) {
        const child = rec[sub];
        if (!child || typeof child !== "object" || Array.isArray(child)) continue;
        const ch = (
          /** @type {Record<string, unknown>} */
          child
        );
        if (no == null) {
          for (const k of INTERCEPT_NO_KEYS) {
            if (ch[k] != null) {
              no = ch[k];
              break;
            }
          }
        }
        if (uid == null) {
          for (const k of INTERCEPT_UID_KEYS) {
            if (ch[k] != null) {
              uid = ch[k];
              break;
            }
          }
        }
        if (name == null) {
          for (const k of INTERCEPT_NAME_KEYS) {
            if (ch[k] != null && typeof ch[k] === "string") {
              name = ch[k];
              break;
            }
          }
        }
        if (!av) {
          for (const k of INTERCEPT_AVATAR_KEYS) {
            if (ch[k] != null && typeof ch[k] === "string") {
              av = normalizeInterceptAvatarUrl(ch[k]);
              if (av) break;
            }
          }
        }
      }
    }
    const sUid = uid != null ? String(uid).trim() : "";
    const sName = name != null ? String(name).trim() : "";
    if (no != null && (uid != null || name != null || av)) {
      const n = String(no ?? "").trim();
      if (n) {
        enqueues.push({ no: n, uid: sUid, name: sName, av });
      }
    } else if (uid != null && (name != null || av)) {
      learnUsers.push({ uid: sUid, name: sName, av });
    }
    return { enqueues, learnUsers };
  }

  // src/lib/interceptVisitorProbeDebug.js
  var INTERCEPT_VISITOR_PROBE_SESSION_KEY = "nls_intercept_visitor_probe";
  var _ring = [];
  function isInterceptVisitorProbeDebugEnabled() {
    try {
      if (typeof sessionStorage === "undefined") return false;
      return sessionStorage.getItem(INTERCEPT_VISITOR_PROBE_SESSION_KEY) === "1";
    } catch {
      return false;
    }
  }
  function formatInterceptJsonProbeSnippet(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return "";
    const o = (
      /** @type {Record<string, unknown>} */
      obj
    );
    const type = typeof o.type === "string" ? o.type : "";
    const keys = Object.keys(o).slice(0, 12);
    const parts = [`type=${type || "-"}`, `keys=${keys.join(",")}`];
    if (o.data && typeof o.data === "object" && !Array.isArray(o.data)) {
      const dk = Object.keys(
        /** @type {Record<string, unknown>} */
        o.data
      ).slice(0, 10);
      parts.push(`dataKeys=${dk.join(",")}`);
    }
    return parts.join("|").slice(0, 200);
  }
  function recordUnforwardedInterceptJsonForProbe(obj, options = {}) {
    const { maxRing = 8 } = options;
    if (!isInterceptVisitorProbeDebugEnabled()) return null;
    const s = formatInterceptJsonProbeSnippet(obj);
    if (!s) return null;
    _ring.push(`${Date.now() % 1e8}:${s}`);
    if (_ring.length > maxRing) _ring = _ring.slice(-maxRing);
    return _ring.join(" ;; ");
  }

  // src/lib/interceptViewerJoinSignals.js
  var VIEWER_JOIN_ARRAY_KEYS = Object.freeze([
    "joinUsers",
    "joinedUsers",
    "newViewers",
    "audience",
    "audiences",
    "viewerList",
    "recentViewers",
    "members",
    "participants",
    "entrants",
    "watchingUsers",
    "watching_users"
  ]);
  var JOIN_LIKE_TYPE_RE = /join|audience|entrant|participant|member|watching|viewerlist|newviewer/i;
  function pickUserIdFromRecord(v) {
    if (!v || typeof v !== "object" || Array.isArray(v)) return "";
    const o = (
      /** @type {Record<string, unknown>} */
      v
    );
    for (const k of INTERCEPT_UID_KEYS) {
      const x = o[k];
      if (x == null || x === "") continue;
      const s = String(x).trim();
      if (s) return s;
    }
    return "";
  }
  var VIEWER_JOIN_EXTRA_NAME_KEYS = Object.freeze([
    "screenName",
    "screen_name",
    "profileNickname",
    "profile_nickname"
  ]);
  function pickNameFromRecord(v) {
    if (!v || typeof v !== "object" || Array.isArray(v)) return "";
    const o = (
      /** @type {Record<string, unknown>} */
      v
    );
    for (const k of INTERCEPT_NAME_KEYS) {
      const x = o[k];
      if (x != null && typeof x === "string") {
        const s = x.trim();
        if (s) return s;
      }
    }
    for (const k of VIEWER_JOIN_EXTRA_NAME_KEYS) {
      const x = o[k];
      if (x != null && typeof x === "string") {
        const s = x.trim();
        if (s) return s;
      }
    }
    return "";
  }
  function pickAvatarFromRecord(v) {
    if (!v || typeof v !== "object" || Array.isArray(v)) return "";
    const o = (
      /** @type {Record<string, unknown>} */
      v
    );
    for (const k of INTERCEPT_AVATAR_KEYS) {
      const x = o[k];
      if (x != null && typeof x === "string") {
        const av = normalizeInterceptAvatarUrl(x);
        if (av) return av;
      }
    }
    const avatar = o.avatar;
    if (typeof avatar === "string") {
      const av = normalizeInterceptAvatarUrl(avatar);
      if (av) return av;
    }
    return "";
  }
  function normalizeViewerJoin(raw, nowMs) {
    const now = typeof nowMs === "number" && Number.isFinite(nowMs) && nowMs > 0 ? nowMs : Date.now();
    const source = "network-intercept";
    const empty = {
      userId: "",
      nickname: "",
      iconUrl: "",
      timestamp: now,
      source
    };
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty;
    const rec = (
      /** @type {Record<string, unknown>} */
      raw
    );
    let userId = "";
    for (const k of ["userId", "id", "uid"]) {
      const x = rec[k];
      if (x == null || x === "") continue;
      const s = String(x).trim();
      if (s) {
        userId = s;
        break;
      }
    }
    if (!userId) userId = pickUserIdFromRecord(raw);
    let nickname = pickNameFromRecord(raw);
    if (!nickname && typeof rec.name === "string") nickname = rec.name.trim();
    let iconUrl = pickAvatarFromRecord(raw);
    if (!iconUrl && /^\d{5,14}$/.test(userId)) {
      iconUrl = niconicoDefaultUserIconUrl(userId) || "";
    }
    nickname = anonymousNicknameFallback(userId, nickname);
    return {
      userId,
      nickname,
      iconUrl,
      timestamp: now,
      source
    };
  }
  function looksLikeUserObjectArray(arr) {
    if (!Array.isArray(arr) || arr.length < 1 || arr.length > 250) return false;
    let objCount = 0;
    for (let i = 0; i < Math.min(arr.length, 8); i++) {
      const x = arr[i];
      if (x && typeof x === "object" && !Array.isArray(x)) objCount++;
    }
    return objCount >= Math.min(2, arr.length) || arr.length === 1 && objCount === 1;
  }
  function collectViewerJoinUsersFromObject(obj) {
    const out = [];
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
    const o = (
      /** @type {Record<string, unknown>} */
      obj
    );
    const t = o.type;
    const typeStr = typeof t === "string" ? t : "";
    const joinTyped = typeStr && JOIN_LIKE_TYPE_RE.test(typeStr);
    for (const key of VIEWER_JOIN_ARRAY_KEYS) {
      const raw = o[key];
      if (!Array.isArray(raw) || !looksLikeUserObjectArray(raw)) continue;
      for (const item of raw) {
        const userId = pickUserIdFromRecord(item);
        if (!userId) continue;
        const nickname = pickNameFromRecord(item);
        const iconUrl = pickAvatarFromRecord(item);
        out.push({
          userId,
          nickname,
          iconUrl
        });
      }
    }
    if (joinTyped) {
      const inner = o.data ?? o.payload ?? o.body;
      if (inner && typeof inner === "object" && !Array.isArray(inner)) {
        out.push(...collectViewerJoinUsersFromObject(inner));
      }
    }
    return out;
  }
  function walkJsonForViewerJoinUsers(root, opts = {}) {
    const maxDepth = opts.maxDepth ?? 6;
    const maxArray = opts.maxArray ?? 400;
    const maxKeys = opts.maxKeys ?? 36;
    const acc = [];
    function walk(obj, depth) {
      if (!obj || typeof obj !== "object" || depth > maxDepth) return;
      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length && i < maxArray; i++) walk(obj[i], depth + 1);
        return;
      }
      acc.push(...collectViewerJoinUsersFromObject(obj));
      const keys = Object.keys(
        /** @type {Record<string, unknown>} */
        obj
      );
      for (let i = 0; i < keys.length && i < maxKeys; i++) {
        const v = (
          /** @type {Record<string, unknown>} */
          obj[keys[i]]
        );
        if (v && typeof v === "object") walk(v, depth + 1);
      }
    }
    walk(root, 0);
    return acc;
  }
  function dedupeViewerJoinUsersByUserId(items) {
    const m = /* @__PURE__ */ new Map();
    for (const it of items) {
      const uid = String(it.userId || "").trim();
      if (!uid) continue;
      const prev = m.get(uid);
      if (!prev) {
        m.set(uid, {
          userId: uid,
          nickname: String(it.nickname || "").trim(),
          iconUrl: String(it.iconUrl || "").trim()
        });
        continue;
      }
      const nick = String(it.nickname || "").trim() || prev.nickname;
      const icon = String(it.iconUrl || "").trim() || prev.iconUrl;
      m.set(uid, { userId: uid, nickname: nick, iconUrl: icon });
    }
    return [...m.values()];
  }

  // src/extension/page-intercept-entry.js
  (() => {
    "use strict";
    if (window.__NLS_PAGE_INTERCEPT__) return;
    const href = String(window.location?.href || "");
    const referrer = String(document.referrer || "");
    const parseUrl = (raw) => {
      try {
        return new URL(String(raw || ""));
      } catch {
        return null;
      }
    };
    const isNicoHost = (h) => String(h || "").endsWith(".nicovideo.jp") || String(h || "") === "nicovideo.jp";
    const isLocalHost = (h) => String(h || "") === "127.0.0.1:3456" || String(h || "") === "localhost:3456";
    const isWatchLikePath = (p) => String(p || "").startsWith("/watch/") || String(p || "").startsWith("/embed/");
    const here = parseUrl(href);
    const ref = parseUrl(referrer);
    const host = String(here?.host || window.location?.host || "");
    const path = String(here?.pathname || window.location?.pathname || "");
    const isAboutLikeFrame = /^(about:blank|about:srcdoc|blob:|data:)/i.test(href);
    const isRefWatchPage = Boolean(
      ref && (isNicoHost(ref.host) || isLocalHost(ref.host)) && isWatchLikePath(ref.pathname)
    );
    const isWatchPage = isNicoHost(host) && isWatchLikePath(path) || isAboutLikeFrame && isRefWatchPage;
    const isLocalDev = isLocalHost(host) || isAboutLikeFrame && Boolean(ref && isLocalHost(ref.host));
    if (!isWatchPage && !isLocalDev) return;
    window.__NLS_PAGE_INTERCEPT__ = true;
    const MSG_TYPE = "NLS_INTERCEPT_USERID";
    const MSG_STATISTICS = "NLS_INTERCEPT_STATISTICS";
    const MSG_SCHEDULE = "NLS_INTERCEPT_SCHEDULE";
    const MSG_CHAT_ROWS = "NLS_INTERCEPT_CHAT_ROWS";
    const MSG_GIFT_USERS = "NLS_INTERCEPT_GIFT_USERS";
    const MSG_VIEWER_JOIN = "NLS_INTERCEPT_VIEWER_JOIN";
    let ndgrChatRowsBatch = [];
    let ndgrChatRowsTimer = null;
    const NDGR_CHAT_ROWS_BATCH_MS = 120;
    const NDGR_CHAT_ROWS_POST_CHUNK = 220;
    function postNdgrChatRowsChunks(all) {
      if (!all.length) return;
      const w = typeof window !== "undefined" ? window : null;
      const schedule = w && typeof w.queueMicrotask === "function" ? (fn) => w.queueMicrotask(fn) : (fn) => setTimeout(fn, 0);
      let i = 0;
      const pump = () => {
        if (i >= all.length) return;
        const payload = all.slice(i, i + NDGR_CHAT_ROWS_POST_CHUNK);
        i += payload.length;
        window.postMessage({ type: MSG_CHAT_ROWS, rows: payload }, "*");
        if (i < all.length) schedule(pump);
      };
      pump();
    }
    function scheduleNdgrChatRowsPost(rows) {
      if (!rows?.length) return;
      ndgrChatRowsBatch.push(...rows);
      if (ndgrChatRowsTimer != null) return;
      ndgrChatRowsTimer = setTimeout(() => {
        ndgrChatRowsTimer = null;
        const payload = ndgrChatRowsBatch;
        ndgrChatRowsBatch = [];
        if (payload.length) postNdgrChatRowsChunks(payload);
      }, NDGR_CHAT_ROWS_BATCH_MS);
    }
    const batch = /* @__PURE__ */ new Map();
    const dirtyUsers = /* @__PURE__ */ new Map();
    let timer = null;
    const diag = {
      enqueued: 0,
      posted: 0,
      wsMessages: 0,
      fetchHits: 0,
      xhrHits: 0
    };
    function publishDiag() {
      const root = document.documentElement;
      if (!root) return;
      root.setAttribute("data-nls-page-intercept", "1");
      root.setAttribute("data-nls-page-intercept-enqueued", String(diag.enqueued));
      root.setAttribute("data-nls-page-intercept-posted", String(diag.posted));
      root.setAttribute("data-nls-page-intercept-ws", String(diag.wsMessages));
      root.setAttribute("data-nls-page-intercept-fetch", String(diag.fetchHits));
      root.setAttribute("data-nls-page-intercept-xhr", String(diag.xhrHits));
      if (href) root.setAttribute("data-nls-page-intercept-href", href.slice(0, 240));
      if (referrer) {
        root.setAttribute("data-nls-page-intercept-referrer", referrer.slice(0, 240));
      }
    }
    publishDiag();
    const knownNames = /* @__PURE__ */ new Map();
    const knownAvatars = /* @__PURE__ */ new Map();
    const viewerJoinDedupeAt = /* @__PURE__ */ new Map();
    const VIEWER_JOIN_SUPPRESS_MS = 2500;
    const VIEWER_JOIN_DEDUPE_MAP_MAX = 8e3;
    function pruneViewerJoinDedupe(now) {
      if (viewerJoinDedupeAt.size <= VIEWER_JOIN_DEDUPE_MAP_MAX) return;
      const cutoff = now - VIEWER_JOIN_SUPPRESS_MS * 4;
      for (const [k, t] of viewerJoinDedupeAt) {
        if (t < cutoff) viewerJoinDedupeAt.delete(k);
      }
    }
    function emitViewerJoinFromJsonRoot(parsed) {
      try {
        const raw = walkJsonForViewerJoinUsers(parsed, { maxDepth: 6, maxArray: 400 });
        const merged = dedupeViewerJoinUsersByUserId(raw);
        if (!merged.length) return;
        const now = Date.now();
        pruneViewerJoinDedupe(now);
        const out = [];
        for (const v of merged) {
          const row = normalizeViewerJoin(
            {
              userId: v.userId,
              nickname: v.nickname,
              iconUrl: v.iconUrl
            },
            now
          );
          const uid = row.userId;
          if (!uid) continue;
          const last = viewerJoinDedupeAt.get(uid) || 0;
          if (now - last < VIEWER_JOIN_SUPPRESS_MS) continue;
          viewerJoinDedupeAt.set(uid, now);
          out.push(row);
        }
        if (out.length) {
          window.postMessage(
            { type: MSG_VIEWER_JOIN, viewers: out, priority: "fast" },
            "*"
          );
        }
      } catch {
      }
    }
    function flush() {
      const entries = [];
      for (const [no, v] of batch) {
        const uid = String(v?.uid || "").trim();
        const name = String(v?.name || "").trim() || (uid ? String(knownNames.get(uid) || "").trim() : "");
        const av = String(v?.av || "").trim() || (uid ? String(knownAvatars.get(uid) || "").trim() : "");
        if (!uid && !name && !av) continue;
        entries.push({
          no,
          ...uid ? { uid } : {},
          ...name ? { name } : {},
          ...av ? { av } : {}
        });
      }
      batch.clear();
      const users = [];
      for (const [uid, meta] of dirtyUsers) {
        const name = String(meta?.name || "").trim();
        const av = String(meta?.av || "").trim();
        if (!uid || !name && !av) continue;
        users.push({
          uid,
          ...name ? { name } : {},
          ...av ? { av } : {}
        });
      }
      dirtyUsers.clear();
      if (!entries.length && !users.length) return;
      diag.posted += entries.length;
      publishDiag();
      window.postMessage({ type: MSG_TYPE, entries, users }, "*");
    }
    function normalizeAvatarUrl(url) {
      const s = String(url ?? "").trim();
      if (!/^https?:\/\//i.test(s)) return "";
      return s;
    }
    function enqueue(commentNo, userId, nickname, avatarUrl = "") {
      const no = String(commentNo ?? "").trim();
      const uid = String(userId ?? "").trim();
      if (!no) return;
      const name = String(nickname ?? "").trim();
      const av = normalizeAvatarUrl(avatarUrl);
      if (!uid && !name && !av) return;
      diag.enqueued += 1;
      publishDiag();
      if (uid && (name || av)) {
        if (name) knownNames.set(uid, name);
        if (av) knownAvatars.set(uid, av);
        const prevMeta = dirtyUsers.get(uid);
        dirtyUsers.set(uid, {
          ...String(prevMeta?.name || "").trim() || name ? { name: String(prevMeta?.name || "").trim() || name } : {},
          ...String(prevMeta?.av || "").trim() || av ? { av: String(prevMeta?.av || "").trim() || av } : {}
        });
      }
      const prev = batch.get(no);
      const prevUid = String(prev?.uid || "").trim();
      const prevName = String(prev?.name || "").trim();
      const prevAv = String(prev?.av || "").trim();
      const nextUid = uid || prevUid;
      const nextName = name || prevName;
      const nextAv = av || prevAv;
      batch.set(no, {
        ...nextUid ? { uid: nextUid } : {},
        ...nextName ? { name: nextName } : {},
        ...nextAv ? { av: nextAv } : {}
      });
      if (!timer) timer = setTimeout(() => {
        timer = null;
        flush();
      }, 150);
    }
    function learnUser(userId, nickname, avatarUrl = "") {
      const uid = String(userId ?? "").trim();
      const name = String(nickname ?? "").trim();
      const av = normalizeAvatarUrl(avatarUrl);
      if (!uid || !name && !av) return;
      if (name) knownNames.set(uid, name);
      if (av) knownAvatars.set(uid, av);
      const prevMeta = dirtyUsers.get(uid);
      dirtyUsers.set(uid, {
        ...String(prevMeta?.name || "").trim() || name ? { name: String(prevMeta?.name || "").trim() || name } : {},
        ...String(prevMeta?.av || "").trim() || av ? { av: String(prevMeta?.av || "").trim() || av } : {}
      });
      if (!timer) timer = setTimeout(() => {
        timer = null;
        flush();
      }, 150);
    }
    function dig(obj, depth) {
      if (!obj || typeof obj !== "object" || depth > 5) return;
      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length && i < 500; i++) dig(obj[i], depth + 1);
        return;
      }
      const { enqueues, learnUsers } = collectInterceptSignalsFromObject(obj);
      for (const e of enqueues) {
        enqueue(e.no, e.uid, e.name, e.av);
      }
      for (const u of learnUsers) {
        learnUser(u.uid, u.name, u.av);
      }
      const keys = Object.keys(obj);
      for (let i = 0; i < keys.length && i < 30; i++) {
        const v = obj[keys[i]];
        if (typeof v === "string") {
          for (const u of extractLearnUsersFromNicoUserIconUrlsInString(v)) {
            learnUser(u.uid, u.name, u.av);
          }
        } else if (v && typeof v === "object") dig(v, depth + 1);
      }
    }
    function extractFromBinaryText(text) {
      for (const p of extractPairsFromBinaryUtf8(text)) {
        enqueue(p.no, p.uid, anonymousNicknameFallback(String(p.uid), ""), "");
      }
    }
    const _ndgr = { stats: 0, chats: 0, gifts: 0, decoded: 0 };
    let _ldStreamStats = null;
    function publishLdStreamDiag() {
      const root = document.documentElement;
      if (!root || !_ldStreamStats) return;
      root.setAttribute(
        "data-nls-ld-stream",
        `p=${_ldStreamStats.pendingBytes} d=${_ldStreamStats.droppedBytes} f=${_ldStreamStats.totalFrames}`
      );
    }
    function handleNdgrResult(result) {
      if (!result) return;
      if (result.stats && result.stats.viewers != null) {
        _ndgr.stats++;
        window.postMessage({ type: MSG_STATISTICS, viewers: result.stats.viewers, comments: result.stats.comments }, "*");
      }
      for (const chat of result.chats) {
        const uid = chat.rawUserId ? String(chat.rawUserId) : chat.hashedUserId;
        if (chat.no != null && uid) {
          _ndgr.chats++;
          enqueue(
            String(chat.no),
            uid,
            anonymousNicknameFallback(String(uid), chat.name),
            ""
          );
        }
      }
      const giftList = result.gifts || [];
      const giftUsers = [];
      for (const g of giftList) {
        const uid = String(g.advertiserUserId || "").trim();
        const name = String(g.advertiserName || "").trim();
        if (uid) {
          _ndgr.gifts++;
          learnUser(uid, name, "");
          giftUsers.push({ userId: uid, nickname: name });
        }
      }
      if (giftUsers.length) {
        window.postMessage({ type: MSG_GIFT_USERS, users: giftUsers }, "*");
      }
      scheduleNdgrChatRowsPost(ndgrChatsToMergeRows(result.chats));
    }
    function processLengthDelimitedNdgrFrame(frame) {
      const dec = new TextDecoder("utf-8", { fatal: false });
      extractFromBinaryText(dec.decode(frame));
      let handled = false;
      try {
        const r = decodeChunkedMessage(frame);
        if (r.stats || r.chats.length || r.gifts && r.gifts.length) {
          handleNdgrResult(r);
          handled = true;
        }
      } catch {
      }
      if (!handled) {
        try {
          for (const r of decodePackedSegment(frame)) handleNdgrResult(r);
        } catch {
        }
      }
    }
    function tryProcessBinaryBuffer(u8, streamAcc) {
      if (u8.byteLength < 4 || u8.byteLength > 2e6) return;
      const dec = new TextDecoder("utf-8", { fatal: false });
      if (streamAcc) {
        streamAcc.push(u8, processLengthDelimitedNdgrFrame);
        _ldStreamStats = streamAcc.getStats();
        publishLdStreamDiag();
        _ndgr.decoded++;
      } else {
        const { frames, tail } = splitLengthDelimitedMessagesWithTail(u8);
        if (frames.length > 0) {
          for (const ch of frames) processLengthDelimitedNdgrFrame(ch);
          _ndgr.decoded++;
        } else {
          processLengthDelimitedNdgrFrame(u8);
          _ndgr.decoded++;
        }
        extractFromBinaryText(dec.decode(u8));
        if (tail.length) {
          try {
            extractFromBinaryText(dec.decode(tail));
          } catch {
          }
        }
      }
      const root = document.documentElement;
      if (root && (_ndgr.stats > 0 || _ndgr.chats > 0 || _ndgr.gifts > 0)) {
        root.setAttribute(
          "data-nls-ndgr",
          `s=${_ndgr.stats} c=${_ndgr.chats} g=${_ndgr.gifts} d=${_ndgr.decoded}`
        );
      }
    }
    const VIEWER_KEYS = ["viewers", "watchCount", "watching", "watchingCount", "viewerCount", "viewCount"];
    const COMMENT_KEYS = ["comments", "commentCount"];
    function pickNum(obj, keys, max) {
      for (const k of keys) {
        const r = obj[k];
        if (r == null) continue;
        const n = typeof r === "number" ? r : parseInt(String(r), 10);
        if (Number.isFinite(n) && n >= 0 && (!max || n <= max)) return n;
      }
      return null;
    }
    function tryForwardStatistics(obj) {
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
      const o = (
        /** @type {Record<string, unknown>} */
        obj
      );
      const d = o.data;
      const target = d && typeof d === "object" && !Array.isArray(d) ? (
        /** @type {Record<string, unknown>} */
        d
      ) : o;
      let viewers = pickNum(target, VIEWER_KEYS, 5e7);
      let comments = pickNum(target, COMMENT_KEYS);
      if (viewers == null && target !== o) {
        viewers = pickNum(o, VIEWER_KEYS, 5e7);
        comments = comments ?? pickNum(o, COMMENT_KEYS);
      }
      if (viewers == null) return false;
      window.postMessage(
        { type: MSG_STATISTICS, viewers, comments },
        "*"
      );
      return true;
    }
    function maybeRecordInterceptVisitorProbe(parsed) {
      const snippet = recordUnforwardedInterceptJsonForProbe(parsed);
      if (!snippet) return;
      const root = document.documentElement;
      if (root) root.setAttribute("data-nls-intercept-visitor-probe", snippet);
    }
    let _scheduleSent = false;
    function tryForwardSchedule(obj) {
      if (_scheduleSent) return;
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
      const o = (
        /** @type {Record<string, unknown>} */
        obj
      );
      if (o.type !== "schedule") return;
      const d = o.data;
      if (!d || typeof d !== "object") return;
      const dd = (
        /** @type {Record<string, unknown>} */
        d
      );
      const begin = dd.begin || dd.beginAt || dd.openTime;
      if (typeof begin === "string" && begin.length >= 10) {
        _scheduleSent = true;
        window.postMessage({ type: MSG_SCHEDULE, begin }, "*");
      }
    }
    function tryProcess(raw) {
      if (typeof raw === "string") {
        if (raw.length < 4 || raw.length > 1e6) return;
        try {
          const parsed = JSON.parse(raw);
          emitViewerJoinFromJsonRoot(parsed);
          if (!tryForwardStatistics(parsed)) maybeRecordInterceptVisitorProbe(parsed);
          tryForwardSchedule(parsed);
          dig(parsed, 0);
        } catch {
        }
        return;
      }
      if (raw instanceof ArrayBuffer || raw instanceof Uint8Array) {
        const buf = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
        tryProcessBinaryBuffer(buf);
        return;
      }
      if (typeof Blob !== "undefined" && raw instanceof Blob) {
        if (raw.size > 2e6) return;
        raw.arrayBuffer().then((ab) => tryProcess(ab)).catch(() => {
        });
      }
    }
    const OrigWS = window.WebSocket;
    try {
      window.WebSocket = new Proxy(OrigWS, {
        construct(target, args) {
          const ws = new target(...args);
          ws.addEventListener("message", (e) => {
            try {
              diag.wsMessages += 1;
              publishDiag();
              tryProcess(e.data);
            } catch {
            }
          });
          return ws;
        }
      });
      Object.defineProperty(window.WebSocket, "prototype", {
        value: OrigWS.prototype,
        writable: false,
        configurable: false
      });
    } catch {
    }
    const _fetchLog = [];
    const origFetch = window.fetch;
    if (typeof origFetch === "function") {
      window.fetch = function(...args) {
        let p;
        try {
          p = origFetch.apply(this, args);
        } catch (e) {
          return Promise.reject(e);
        }
        if (p != null && typeof p.then === "function") {
          p.catch(() => {
          });
        }
        void (async () => {
          try {
            const res = await p;
            const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
            const isNico = url.includes("nicovideo.jp") || url.includes("nimg.jp") || url.includes("dmc.nico") || url.includes("nicolive") || url.includes("ndgr") || url.includes("127.0.0.1:3456") || url.includes("localhost:3456");
            if (!isNico) return;
            diag.fetchHits += 1;
            try {
              if (typeof maybeScanFromFetch === "function") maybeScanFromFetch();
            } catch {
            }
            const ct = res.headers?.get("content-type") || "";
            if (_fetchLog.length < 20) {
              const u = url.replace(/https?:\/\/[^/]+/, "").substring(0, 60);
              _fetchLog.push(`${u} [${ct.substring(0, 25)}]`);
              const root = document.documentElement;
              if (root) root.setAttribute("data-nls-fetch-log", _fetchLog.join(" | "));
            }
            publishDiag();
            const isBinary = ct.includes("protobuf") || ct.includes("octet") || ct.includes("grpc");
            const isJson = ct.includes("json");
            const isStream = ct.includes("event-stream") || ct.includes("ndjson");
            const isNdgr = /\/(view|segment|backward|snapshot)\/v\d\//.test(url) || url.includes("ndgr");
            if (!isBinary && !isJson && !isStream && !isNdgr) return;
            const clone = res.clone();
            if ((isBinary || isStream || isNdgr) && clone.body) {
              const reader = clone.body.getReader();
              void (async () => {
                try {
                  const dec = new TextDecoder("utf-8", { fatal: false });
                  const ldAcc = createLengthDelimitedStreamAccumulator({
                    maxPendingBytes: 2e6
                  });
                  for (; ; ) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (value) {
                      tryProcessBinaryBuffer(value, ldAcc);
                      extractFromBinaryText(dec.decode(value));
                      const text = dec.decode(value, { stream: true });
                      if (text.length > 3 && text.length < 5e5) {
                        try {
                          const j = JSON.parse(text);
                          emitViewerJoinFromJsonRoot(j);
                          if (!tryForwardStatistics(j)) maybeRecordInterceptVisitorProbe(j);
                          dig(j, 0);
                        } catch {
                        }
                      }
                    }
                  }
                  _ldStreamStats = ldAcc.getStats();
                  publishLdStreamDiag();
                } catch {
                }
              })();
            } else {
              try {
                tryProcess(await clone.arrayBuffer());
              } catch {
              }
            }
          } catch {
          }
        })();
        return p;
      };
    }
    const OrigXHR = window.XMLHttpRequest;
    if (typeof OrigXHR === "function") {
      try {
        const origOpen = OrigXHR.prototype.open;
        const origSend = OrigXHR.prototype.send;
        OrigXHR.prototype.open = function(method, url, ...rest) {
          try {
            this.__nlsUrl = typeof url === "string" ? url : String(url || "");
          } catch {
          }
          return origOpen.call(this, method, url, ...rest);
        };
        OrigXHR.prototype.send = function(...args) {
          try {
            this.addEventListener(
              "loadend",
              () => {
                try {
                  const url = String(this.__nlsUrl || this.responseURL || "");
                  const isNico = url.includes("nicovideo.jp") || url.includes("nimg.jp") || url.includes("dmc.nico") || url.includes("nicolive") || url.includes("ndgr") || url.includes("127.0.0.1:3456") || url.includes("localhost:3456");
                  if (!isNico) return;
                  diag.xhrHits += 1;
                  try {
                    if (typeof maybeScanFromFetch === "function") maybeScanFromFetch();
                  } catch {
                  }
                  publishDiag();
                  const rt = String(this.responseType || "");
                  if (!rt || rt === "text") {
                    tryProcess(String(this.responseText || ""));
                    return;
                  }
                  if (rt === "json") {
                    const res = this.response;
                    emitViewerJoinFromJsonRoot(res);
                    if (!tryForwardStatistics(res)) maybeRecordInterceptVisitorProbe(res);
                    dig(res, 0);
                    return;
                  }
                  if (rt === "arraybuffer" && this.response) {
                    tryProcess(this.response);
                    return;
                  }
                  if (rt === "blob" && this.response) {
                    tryProcess(this.response);
                  }
                } catch {
                }
              },
              { once: true }
            );
          } catch {
          }
          return origSend.apply(this, args);
        };
      } catch {
      }
    }
    try {
      const _r = document.documentElement;
      if (_r) _r.setAttribute("data-nls-pi-phase", "fiber-init");
    } catch {
    }
    const FIBER_SCAN_MS = 3e3;
    const FB_NO = ["no", "commentNo", "comment_no", "number", "vposNo"];
    const FB_UID = [
      "userId",
      "user_id",
      "uid",
      "hashedUserId",
      "hashed_user_id",
      "senderUserId",
      "rawUserId",
      "raw_user_id",
      "advertiserUserId",
      "advertiser_user_id"
    ];
    const FB_NAME = [
      "name",
      "nickname",
      "userName",
      "user_name",
      "displayName",
      "display_name",
      "advertiserName",
      "advertiser_name"
    ];
    const FB_AV = [
      "iconUrl",
      "icon_url",
      "avatarUrl",
      "avatar_url",
      "userIconUrl",
      "thumbnailUrl",
      "thumbnail_url"
    ];
    function getReactCandidates(el) {
      const out = [];
      if (!el) return out;
      try {
        for (const k of Object.getOwnPropertyNames(el)) {
          if (k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$") || k.startsWith("__reactProps$") || k.startsWith("__reactEventHandlers$")) {
            out.push(el[k]);
          }
        }
      } catch {
      }
      try {
        for (const s of Object.getOwnPropertySymbols(el)) {
          const d = String(s?.description || s?.toString?.() || "");
          if (/react/i.test(d)) out.push(el[s]);
        }
      } catch {
      }
      return out;
    }
    function pickStr(obj, keys) {
      if (!obj || typeof obj !== "object") return "";
      for (const k of keys) {
        const v = obj[k];
        if (v != null && v !== "") return String(v);
      }
      return "";
    }
    function extractFromProps(props) {
      if (!props || typeof props !== "object" || Array.isArray(props)) return null;
      let no = pickStr(props, FB_NO);
      let uid = pickStr(props, FB_UID);
      let nm = pickStr(props, FB_NAME);
      let av = normalizeAvatarUrl(pickStr(props, FB_AV));
      const SUBS = ["data", "chat", "comment", "item", "message", "props", "value", "row", "rowData", "original"];
      for (const s of SUBS) {
        const c = props[s];
        if (!c || typeof c !== "object" || Array.isArray(c)) continue;
        if (!no) no = pickStr(c, FB_NO);
        if (!uid) uid = pickStr(c, FB_UID);
        if (!nm) nm = pickStr(c, FB_NAME);
        if (!av) av = normalizeAvatarUrl(pickStr(c, FB_AV));
      }
      if (no && (uid || nm || av)) return { no, uid, nm, av };
      return null;
    }
    function digFiberDown(fiber, depth) {
      if (!fiber || depth > 6) return null;
      const props = fiber.memoizedProps || fiber.pendingProps;
      const r = extractFromProps(props);
      if (r) return r;
      let child = fiber.child;
      while (child) {
        const cr = digFiberDown(child, depth + 1);
        if (cr) return cr;
        child = child.sibling;
      }
      return null;
    }
    function digFiberUp(fiber, maxUp) {
      let cur = fiber;
      for (let i = 0; i < maxUp && cur; i++) {
        const props = cur.memoizedProps || cur.pendingProps;
        const r = extractFromProps(props);
        if (r) return r;
        cur = cur.return;
      }
      return null;
    }
    function digFiber(fiber, _depth) {
      const down = digFiberDown(fiber, 0);
      if (down) return down;
      return digFiberUp(fiber, 8);
    }
    const _fb = { scans: 0, found: 0, rows: 0, probe: "", step: "", attempts: 0, err: "" };
    function publishFiberDiag() {
      const root = document.documentElement;
      if (!root) return;
      root.setAttribute("data-nls-fiber-scans", String(_fb.scans));
      root.setAttribute("data-nls-fiber-found", String(_fb.found));
      root.setAttribute("data-nls-fiber-rows", String(_fb.rows));
      root.setAttribute("data-nls-fiber-probe", _fb.probe.substring(0, 300));
      root.setAttribute("data-nls-fiber-step", _fb.step);
      root.setAttribute("data-nls-fiber-attempts", String(_fb.attempts));
      if (_fb.err) root.setAttribute("data-nls-fiber-err", _fb.err.substring(0, 120));
    }
    function scanCommentFibers() {
      try {
        const panel = document.querySelector(".ga-ns-comment-panel") || document.querySelector('[class*="comment-panel" i]');
        const grid = document.querySelector('[class*="comment-data-grid"], [class*="data-grid"]');
        const root = panel || grid;
        if (!root) {
          _fb.step = "no-root";
          publishFiberDiag();
          return;
        }
        const allEls = root.querySelectorAll("*");
        _fb.scans++;
        _fb.rows = allEls.length;
        let found = 0;
        let hasFiber = 0;
        let firstHitProbe = "";
        for (let i = 0; i < allEls.length && i < 1200; i++) {
          const el = allEls[i];
          const candidates = getReactCandidates(el);
          if (!candidates.length) continue;
          hasFiber += candidates.length;
          for (const candidate of candidates) {
            if (_fb.probe === "") {
              try {
                const p = candidate?.memoizedProps || candidate?.pendingProps || (candidate && typeof candidate === "object" ? candidate : {}) || {};
                const keys = Object.keys(p).slice(0, 20);
                _fb.probe = keys.join(",");
                for (const key of keys) {
                  const v = p[key];
                  if (v && typeof v === "object" && !Array.isArray(v)) {
                    _fb.probe += " | " + key + ":{" + Object.keys(v).slice(0, 15).join(",") + "}";
                    break;
                  }
                }
              } catch {
              }
            }
            const data = extractFromProps(candidate) || (candidate && typeof candidate === "object" ? digFiber(candidate, 0) : null);
            if (!data) continue;
            enqueue(data.no, data.uid, data.nm, data.av);
            found++;
            if (!firstHitProbe) {
              try {
                const p = candidate?.memoizedProps || candidate?.pendingProps || (candidate && typeof candidate === "object" ? candidate : {}) || {};
                firstHitProbe = Object.keys(p).slice(0, 10).join(",");
              } catch {
              }
            }
            break;
          }
        }
        _fb.found += found;
        _fb.step = (panel ? "panel" : "grid") + ":" + allEls.length + " fb=" + hasFiber + " hit=" + found;
        if (firstHitProbe) _fb.step += " hp=" + firstHitProbe.substring(0, 60);
        publishFiberDiag();
      } catch (e) {
        _fb.err = String(e?.message || e || "?").substring(0, 120);
        publishFiberDiag();
      }
    }
    try {
      const _r2 = document.documentElement;
      if (_r2) _r2.setAttribute("data-nls-pi-phase", "pre-fiber-start");
    } catch {
    }
    let _fiberRunning = false;
    const _bST = window.setTimeout.bind(window);
    const _bSI = window.setInterval.bind(window);
    function fiberTick() {
      try {
        _fb.attempts++;
        _fb.step = "tick-" + _fb.attempts;
        publishFiberDiag();
        const rootEl = document.querySelector(".ga-ns-comment-panel") || document.querySelector('[class*="comment-panel" i]') || document.querySelector('[class*="comment-data-grid"], [class*="data-grid"]');
        if (rootEl) {
          _fb.step = "found-root";
          publishFiberDiag();
          _fiberRunning = true;
          scanCommentFibers();
          _bSI(scanCommentFibers, FIBER_SCAN_MS);
          return;
        }
      } catch (e) {
        _fb.err = String(e?.message || e || "?").substring(0, 80);
        publishFiberDiag();
      }
      if (_fb.attempts < 200) _bST(fiberTick, 1500);
    }
    _bST(fiberTick, 2e3);
    let _lastFetchFiber = 0;
    function maybeScanFromFetch() {
      if (_fiberRunning) return;
      const now = Date.now();
      if (now - _lastFetchFiber < 3e3) return;
      _lastFetchFiber = now;
      fiberTick();
    }
    const OrigES = window.EventSource;
    if (typeof OrigES === "function") {
      try {
        window.EventSource = function(url, opts) {
          const es = new OrigES(url, opts);
          diag.fetchHits += 1;
          if (_fetchLog.length < 12) {
            _fetchLog.push("ES:" + String(url).replace(/https?:\/\/[^/]+/, "").substring(0, 60));
            const root = document.documentElement;
            if (root) root.setAttribute("data-nls-fetch-log", _fetchLog.join(" | "));
          }
          publishDiag();
          es.addEventListener("message", (e) => {
            try {
              diag.wsMessages += 1;
              publishDiag();
              tryProcess(e.data);
            } catch {
            }
          });
          return es;
        };
        Object.defineProperty(window.EventSource, "prototype", {
          value: OrigES.prototype,
          writable: false,
          configurable: false
        });
        window.EventSource.CONNECTING = OrigES.CONNECTING;
        window.EventSource.OPEN = OrigES.OPEN;
        window.EventSource.CLOSED = OrigES.CLOSED;
      } catch {
      }
    }
    const MSG_EMBEDDED_DATA = "NLS_INTERCEPT_EMBEDDED_DATA";
    const MAIN_POLL_MS = 3e4;
    function tryReadEmbeddedData() {
      try {
        const el = document.getElementById("embedded-data");
        if (!el) return;
        let raw = el.getAttribute("data-props") || "";
        if (!raw) return;
        if (raw.includes("&quot;")) raw = raw.replace(/&quot;/g, '"');
        if (raw.includes("&amp;")) raw = raw.replace(/&amp;/g, "&");
        const obj = JSON.parse(raw);
        if (!obj || typeof obj !== "object") return;
        const wc = obj?.program?.statistics?.watchCount;
        const viewers = wc != null && Number.isFinite(Number(wc)) && Number(wc) >= 0 ? Number(wc) : null;
        window.postMessage({ type: MSG_EMBEDDED_DATA, viewers }, "*");
      } catch {
      }
    }
    function mainWorldPollStats() {
      try {
        const pageUrl = window.location.href;
        if (!pageUrl || !pageUrl.startsWith("http")) return;
        origFetch(pageUrl, { credentials: "same-origin" }).then((res) => {
          if (!res.ok) return;
          return res.text();
        }).then((html) => {
          if (!html) return;
          if (html.includes("&quot;")) html = html.replace(/&quot;/g, '"');
          if (html.includes("&amp;")) html = html.replace(/&amp;/g, "&");
          const wc = html.match(/"watchCount"\s*:\s*(\d+)/) || html.match(/"watching(?:Count)?"\s*:\s*(\d+)/i);
          if (wc?.[1]) {
            const n = parseInt(wc[1], 10);
            if (Number.isFinite(n) && n >= 0) {
              window.postMessage({ type: MSG_STATISTICS, viewers: n }, "*");
            }
          }
          const cc = html.match(/"commentCount"\s*:\s*(\d+)/) || html.match(/"comments"\s*:\s*(\d+)/);
          if (cc?.[1]) {
            const cn = parseInt(cc[1], 10);
            if (Number.isFinite(cn) && cn >= 0) {
              window.postMessage({ type: MSG_STATISTICS, viewers: null, comments: cn }, "*");
            }
          }
        }).catch(() => {
        });
      } catch {
      }
    }
    function initEmbeddedAndPoll() {
      tryReadEmbeddedData();
      setTimeout(mainWorldPollStats, 8e3);
      setInterval(mainWorldPollStats, MAIN_POLL_MS);
    }
    let _embeddedPollStarted = false;
    const _embPollId = setInterval(() => {
      if (_embeddedPollStarted) return;
      if (document.getElementById("embedded-data") || document.readyState !== "loading") {
        _embeddedPollStarted = true;
        clearInterval(_embPollId);
        initEmbeddedAndPoll();
      }
    }, 500);
    const _allFetchLog = [];
    try {
      const prevFetch = window.fetch;
      window.fetch = function(...args) {
        const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
        if (_allFetchLog.length < 5 && !url.includes("nicovideo.jp") && !url.includes("nimg.jp")) {
          const u = url.substring(0, 80);
          _allFetchLog.push(u);
          const root = document.documentElement;
          if (root) root.setAttribute("data-nls-fetch-other", _allFetchLog.join(" | "));
        }
        return prevFetch.apply(this, args);
      };
    } catch {
    }
  })();
})();
