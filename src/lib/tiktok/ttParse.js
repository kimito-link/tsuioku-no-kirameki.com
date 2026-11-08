// ttParse.js — TikTok LIVE の配信・コメント・ギフトを、YouTube 版の記録と同じ形にする(純関数)
// @layer L0 — 純粋計算
//
// ★council/tiktok-support-PLAN.md。形は 2026-11-09 の PC 実測(本物・ログイン済みの内蔵ブラウザ・値抜き)から作った。
//   公式の API は無い。ページ自身の WebSocket(webcast-ws.tiktok.com・X-Bogus 署名つき)の受信をメイン世界で写して読む。
//   - 受信1通 = PushFrame{1 seq, 2 logId, 3 service, 4 method, 6 "pb", 7 "msg"|"hb", 8 本体(msg は gzip)}
//   - 本体 = Response{1[] Message{1 型の名前, 2 中身, 3 msgId}}
//   - Chat{1 common(1.4 = 時刻 ms), 2 user, 3 本文} / User{1 userId, 3 nickname, 9.1[] 顔, 38 uniqueId}
//   - Gift{2 giftId, 5 repeatCount, 7 user, 9 repeatEnd(1 のときだけ来る), 11 groupId,
//          15 details{1.1[] 絵, 5 giftId, 11 type, 12 diamondCount(一覧と 8/8 一致), 16 英語の名前らしい(未確認)}}
//   - RoomUserSeq{2[] {1 score, 2 user, 3 rank}, 3 視聴数} / Member{2 user, 3 視聴数}
//   - ギフトの日本語の名前は gift/list(data.gifts[]{id, name, diamond_count, combo, type, image.url_list})。
//   - ログインしていないとコメントのソケット自体が開かない(映像だけ流れる)。
//   形が違う・欠けている1件は null を返して捨てる(AGENTS.md §3.6)。

import { PbMsg, isGzip } from './ttProto.js';

export const TT_ORIGIN = 'https://www.tiktok.com';
/** ギフトのコイン(diamondCount × 個数)。数のまま数える */
export const TT_CURRENCY = 'TTCOIN';
/** 連打の途中で終わりの印(repeatEnd)が来ないとき、最後の数で数えるまでの待ち */
export const TT_COMBO_WAIT_MS = 8000;

/** TikTok の名前(@ の後ろ)として正しいか @param {unknown} s */
export function isTtUniqueId(s) {
  const v = String(s ?? '');
  return /^[A-Za-z0-9_.]{2,24}$/.test(v) && !/^\.+$/.test(v);
}

/** ページの URL → 名前(TikTok の配信ページ /@<名前>/live でなければ '') @param {unknown} url */
export function parseTtUniqueIdFromUrl(url) {
  let u;
  try {
    u = new URL(String(url || ''));
  } catch {
    return '';
  }
  if (!/^(?:www\.)?tiktok\.com$/i.test(u.hostname)) return '';
  const m = /^\/@([A-Za-z0-9_.]{2,24})\/live\/?$/.exec(u.pathname);
  return m && isTtUniqueId(m[1]) ? m[1].toLowerCase() : '';
}

/** 配信の情報の口(ページと同じ・ログイン済みの Cookie で読む) @param {string} uniqueId */
export function ttRoomInfoUrl(uniqueId) {
  return isTtUniqueId(uniqueId) ? `${TT_ORIGIN}/api-live/user/room/?aid=1988&sourceType=54&uniqueId=${encodeURIComponent(uniqueId)}` : '';
}

/** @param {unknown} url */
export function ttLiveUrl(url) {
  const s = String(url || '').toLowerCase();
  return isTtUniqueId(s) ? `${TT_ORIGIN}/@${s}/live` : '';
}

/** 画像の URL として使ってよいか(https・TikTok の画像置き場) @param {unknown} url */
export function safeTtImageUrl(url) {
  const s = String(url || '').trim();
  let u;
  try {
    u = new URL(s);
  } catch {
    return '';
  }
  if (u.protocol !== 'https:') return '';
  if (!/(^|\.)tiktokcdn(?:-[a-z]{2})?\.com$|(^|\.)ibyteimg\.com$|(^|\.)ibytedtos\.com$/i.test(u.hostname)) return '';
  return s.length <= 2000 ? s : '';
}

/** @param {unknown} v */
function obj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? /** @type {Record<string, any>} */ (v) : null;
}
/** @param {unknown} v */
function str(v) {
  return typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '';
}
/** @param {unknown} v */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
/** 秒でも ms でも ms(読めなければ 0) @param {unknown} v */
function timeMs(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n > 1e12) return Math.floor(n);
  if (n > 1e9) return Math.floor(n * 1000);
  return 0;
}
/** url_list の最初の使える絵 @param {unknown} img */
function firstUrl(img) {
  const list = Array.isArray(obj(img)?.url_list) ? obj(img)?.url_list : [];
  for (const u of list || []) {
    const s = safeTtImageUrl(u);
    if (s) return s;
  }
  return '';
}

/**
 * GET /api-live/user/room/ → 配信の情報。形が違えば null。
 *   実測で確かめたのは data.user.roomId・data.liveRoom.status(2=配信中・4=配信なし)・data.liveRoom.liveRoomStats.userCount。
 *   題・開始・顔・名前の位置は未実測なので、無くても壊れないように拾う。
 * @param {unknown} json
 */
export function parseTtRoomInfo(json) {
  const d = obj(obj(json)?.data);
  if (!d) return null;
  const user = obj(d.user);
  const room = obj(d.liveRoom);
  if (!user && !room) return null;
  const roomId = str(user?.roomId ?? room?.roomId ?? room?.id_str);
  const status = Math.floor(num(room?.status ?? user?.status));
  const stats = obj(room?.liveRoomStats);
  const viewers = stats && Number.isFinite(Number(stats.userCount)) ? Math.floor(num(stats.userCount)) : null;
  return {
    roomId: /^\d{5,20}$/.test(roomId) ? roomId : '',
    status,
    isLive: status === 2 && /^\d{5,20}$/.test(roomId),
    title: str(room?.title).slice(0, 200),
    name: str(user?.nickname).slice(0, 120),
    uniqueId: isTtUniqueId(user?.uniqueId) ? String(user?.uniqueId).toLowerCase() : '',
    iconUrl: safeTtImageUrl(user?.avatarThumb ?? user?.avatarMedium ?? '') || firstUrl(user?.avatarThumb),
    viewers,
    startedAtMs: timeMs(room?.startTime ?? room?.create_time),
  };
}

// ---- ソケット ----

/**
 * 受信1通(PushFrame)→ { kind, payload, gzip }。msg 以外(hb 等)や形が違うものは null。
 * @param {Uint8Array} buf
 */
export function parseTtPushFrame(buf) {
  const f = new PbMsg(buf);
  const kind = f.str(7);
  const payload = f.bytes(8);
  if (kind !== 'msg' || !payload || !payload.length) return null;
  return { kind, payload, gzip: isGzip(payload) };
}

/**
 * 本体(gzip を解いたあと)→ メッセージの並び
 * @param {Uint8Array} body
 * @returns {{ type: string, payload: Uint8Array, msgId: string }[]}
 */
export function parseTtResponse(body) {
  const out = [];
  for (const m of new PbMsg(body).allMsg(1)) {
    const type = m.str(1);
    const payload = m.bytes(2);
    if (!/^Webcast[A-Za-z0-9]{1,60}$/.test(type) || !payload) continue;
    out.push({ type, payload, msgId: m.idStr(3) });
  }
  return out;
}

/**
 * 人(User)
 * @param {PbMsg} u
 */
export function parseTtUser(u) {
  const userId = u.idStr(1);
  if (!/^\d{1,20}$/.test(userId) || userId === '0') return null;
  const uniqueRaw = u.str(38);
  let iconUrl = '';
  for (const s of u.msg(9).allStr(1)) {
    iconUrl = safeTtImageUrl(s);
    if (iconUrl) break;
  }
  return {
    userId,
    nickname: u.str(3).replace(/\s+/g, ' ').trim().slice(0, 80),
    uniqueId: isTtUniqueId(uniqueRaw) ? uniqueRaw : '',
    iconUrl,
  };
}

/** 共通の部分(field 1)の時刻 ms @param {PbMsg} m @param {number} nowMs */
function commonTimeMs(m, nowMs) {
  const t = timeMs(m.msg(1).num(4));
  // ありえない時刻(1日より先・30日より前)は今の時刻にする
  return t && t < nowMs + 86_400_000 && t > nowMs - 30 * 86_400_000 ? t : nowMs;
}

/**
 * @param {{ userId: string, nickname: string, uniqueId: string, iconUrl: string }} u
 * @param {number} postedAtMs
 * @param {string} uniqueIdOfStream
 */
function baseRow(u, postedAtMs, uniqueIdOfStream) {
  return {
    channelId: `tt:${u.userId}`,
    name: u.nickname || (u.uniqueId ? `@${u.uniqueId}` : `TikTok${u.userId.slice(-4)}`),
    login: u.uniqueId,
    iconUrl: u.iconUrl,
    badges: /** @type {string[]} */ ([]),
    ts: '',
    postedAtMs,
    channel: String(uniqueIdOfStream || ''),
    color: '',
  };
}

/**
 * WebcastChatMessage → 記録の1行
 * @param {Uint8Array} payload
 * @param {{ msgId?: string, uniqueId?: string, nowMs?: number }} ctx
 */
export function parseTtChat(payload, ctx = {}) {
  const m = new PbMsg(payload);
  const u = parseTtUser(m.msg(2));
  if (!u) return null;
  const text = m.str(3).replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!text) return null;
  const mid = String(ctx.msgId || '');
  if (!/^\d{1,20}$/.test(mid) || mid === '0') return null;
  const postedAtMs = commonTimeMs(m, Number(ctx.nowMs) || Date.now());
  return { id: `tt-${mid}`, ...baseRow(u, postedAtMs, ctx.uniqueId || ''), text, kind: 'text', amount: 0, currency: '' };
}

/**
 * @typedef {{ id: string, name: string, diamond: number, combo: boolean, type: number, imageUrl: string }} TtGiftInfo
 */

/**
 * gift/list → giftId → 情報(日本語の名前・コイン・連打できるか・絵)
 * @param {unknown} json
 * @returns {TtGiftInfo[]}
 */
export function parseTtGiftList(json) {
  const gifts = obj(obj(json)?.data)?.gifts;
  /** @type {TtGiftInfo[]} */
  const out = [];
  for (const g0 of Array.isArray(gifts) ? gifts : []) {
    const g = obj(g0);
    const id = str(g?.id);
    if (!g || !/^\d{1,12}$/.test(id)) continue;
    out.push({
      id,
      name: str(g.name).replace(/\s+/g, ' ').slice(0, 60),
      diamond: Math.floor(num(g.diamond_count)),
      combo: g.combo === true,
      type: Math.floor(num(g.type)),
      imageUrl: firstUrl(g.image) || firstUrl(g.icon),
    });
    if (out.length >= 3000) break;
  }
  return out;
}

/**
 * WebcastGiftMessage → ギフトの1件(連打のまとめ前)
 * @param {Uint8Array} payload
 * @param {{ gifts?: Map<string, TtGiftInfo>, nowMs?: number }} [ctx]
 */
export function parseTtGift(payload, ctx = {}) {
  const m = new PbMsg(payload);
  const u = parseTtUser(m.msg(7));
  if (!u) return null;
  const det = m.msg(15);
  const giftId = m.idStr(2) || det.idStr(5);
  if (!/^\d{1,12}$/.test(giftId) || giftId === '0') return null;
  const info = ctx.gifts?.get(giftId);
  const type = det.has(11) ? det.num(11) : info?.type ?? 0;
  const diamond = det.num(12) || info?.diamond || 0;
  let imageUrl = '';
  for (const s of det.msg(1).allStr(1)) {
    imageUrl = safeTtImageUrl(s);
    if (imageUrl) break;
  }
  // 英語の名前らしい field 16 は、文字として読めるときだけ控えに使う(日本語の名前は一覧から)
  const en = det.str(16).replace(/\s+/g, ' ').trim();
  const name = info?.name || (/^[\p{L}\p{N} '’&!.-]{1,40}$/u.test(en) ? en : '') || 'ギフト';
  return {
    user: u,
    giftId,
    groupId: m.idStr(11),
    count: Math.min(100000, Math.max(1, m.num(5) || 1)),
    repeatEnd: m.num(9) === 1,
    // 連打できるギフト = 一覧の combo か type 1(TikTok の連打ギフト)
    combo: info ? info.combo : type === 1,
    diamond,
    name,
    imageUrl: imageUrl || info?.imageUrl || '',
    postedAtMs: commonTimeMs(m, Number(ctx.nowMs) || Date.now()),
  };
}

/**
 * ギフト1件(数えると決まったもの)→ 記録の1行
 * @param {NonNullable<ReturnType<typeof parseTtGift>>} g
 * @param {string} uniqueIdOfStream
 */
export function ttGiftRow(g, uniqueIdOfStream) {
  const amount = g.diamond * g.count;
  return {
    id: `tt-g-${g.user.userId}-${g.groupId || '0'}-${g.giftId}`,
    ...baseRow(g.user, g.postedAtMs, uniqueIdOfStream),
    text: `${g.name}${g.count > 1 ? ` ×${g.count}` : ''}`,
    kind: amount > 0 ? 'superchat' : 'text',
    amount,
    currency: amount > 0 ? TT_CURRENCY : '',
    giftName: g.name,
    ...(g.imageUrl ? { giftImageUrl: g.imageUrl } : {}),
    ...(g.count > 1 ? { giftCount: g.count } : {}),
  };
}

/**
 * 連打ギフトのまとめ役。同じ人・同じ連打(groupId)・同じギフトは、終わりの印(repeatEnd)が来たとき
 * (来なければ最後の受信から TT_COMBO_WAIT_MS 後)に、最後の個数で1回だけ数える(途中の分を重ねない)。
 * 連打できないギフトはすぐ数える。
 * @param {{ waitMs?: number }} [opts]
 */
export function createTtComboTracker(opts = {}) {
  const waitMs = Number(opts.waitMs) > 0 ? Number(opts.waitMs) : TT_COMBO_WAIT_MS;
  /** @type {Map<string, { g: NonNullable<ReturnType<typeof parseTtGift>>, at: number }>} */
  const pending = new Map();
  /** @type {Set<string>} */
  const done = new Set();
  const remember = (/** @type {string} */ k) => {
    done.add(k);
    if (done.size > 5000) done.delete(/** @type {string} */ (done.values().next().value));
  };
  return {
    /**
     * @param {NonNullable<ReturnType<typeof parseTtGift>>} g
     * @param {number} now
     * @returns {NonNullable<ReturnType<typeof parseTtGift>>[]} いま数えるもの
     */
    push(g, now) {
      const k = `${g.user.userId}|${g.groupId}|${g.giftId}`;
      if (done.has(k)) return [];
      if (g.repeatEnd || !g.combo) {
        const prev = pending.get(k);
        pending.delete(k);
        remember(k);
        // 終わりの印の個数が途中より小さく来たときは、見た中で一番大きい数にする
        return [prev && prev.g.count > g.count ? { ...g, count: prev.g.count } : g];
      }
      const prev = pending.get(k);
      pending.set(k, { g: prev && prev.g.count > g.count ? { ...g, count: prev.g.count } : g, at: now });
      return [];
    },
    /** 待ちきれなかった連打を数える @param {number} now @param {boolean} [all] 全部(止めるとき) */
    flushDue(now, all = false) {
      const out = [];
      for (const [k, p] of pending) {
        if (all || now - p.at >= waitMs) {
          pending.delete(k);
          remember(k);
          out.push(p.g);
        }
      }
      return out;
    },
    get size() {
      return pending.size;
    },
  };
}

/**
 * WebcastRoomUserSeqMessage → 視聴数と、配信中の視聴者の順位(score つき)
 * @param {Uint8Array} payload
 */
export function parseTtRoomUserSeq(payload) {
  const m = new PbMsg(payload);
  const viewers = m.has(3) ? m.num(3) : null;
  /** @type {{ rank: number, name: string, xp: number, iconUrl: string }[]} */
  const rows = [];
  for (const r of m.allMsg(2)) {
    const u = parseTtUser(r.msg(2));
    if (!u) continue;
    const name = u.nickname || (u.uniqueId ? `@${u.uniqueId}` : '');
    if (!name) continue;
    rows.push({ rank: r.num(3) || rows.length + 1, name, xp: r.num(1), iconUrl: u.iconUrl });
    if (rows.length >= 100) break;
  }
  rows.sort((a, b) => a.rank - b.rank);
  return { viewers, rows };
}

/** WebcastMemberMessage → 視聴数(無ければ null) @param {Uint8Array} payload */
export function parseTtMemberViewers(payload) {
  const m = new PbMsg(payload);
  return m.has(3) ? m.num(3) : null;
}

// ---- 配信キー ----

/** 配信キー: tt.<名前(小文字)>.<roomId> @param {string} uniqueId @param {{ roomId?: string | null }} [opts] */
export function buildTtStreamKey(uniqueId, opts = {}) {
  const u = String(uniqueId || '').toLowerCase();
  const r = String(opts.roomId ?? '');
  return isTtUniqueId(u) && /^\d{5,20}$/.test(r) ? `tt.${u}.${r}` : '';
}
/** @param {unknown} key */
export function isTtStreamKey(key) {
  const m = /^tt\.([a-z0-9_.]{2,24})\.(\d{5,20})$/.exec(String(key || ''));
  return !!m && isTtUniqueId(m[1]);
}
/** 配信キー → 名前 @param {unknown} key */
export function ttUniqueIdOfStreamKey(key) {
  const m = /^tt\.([a-z0-9_.]{2,24})\.(\d{5,20})$/.exec(String(key || ''));
  return m && isTtUniqueId(m[1]) ? m[1] : '';
}

/** ソケットの URL から room_id(webcast-ws の口でなければ '') @param {unknown} url */
export function ttRoomIdOfSocketUrl(url) {
  let u;
  try {
    u = new URL(String(url || ''));
  } catch {
    return '';
  }
  if (u.protocol !== 'wss:' || !/(^|\.)tiktok\.com$/i.test(u.hostname) || !/^webcast/i.test(u.hostname)) return '';
  const r = String(u.searchParams.get('room_id') || '');
  return /^\d{5,20}$/.test(r) ? r : '';
}
