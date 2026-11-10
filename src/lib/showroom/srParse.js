// srParse.js — SHOWROOM の配信・コメント・ギフトを、YouTube 版の記録と同じ形にする(純関数)
// @layer L0 — 純粋計算
//
// ★council/showroom-support-PLAN.md。形は 2026-11-08 の PC 実測(本物の SHOWROOM・ログインなし・値抜き)から作った。
//   公式の開発者向け API は無い。ページ自身が使う口を読む。形が違う・欠けている1件は null を返して捨てる(AGENTS.md §3.6)。
//   - 部屋: GET /api/room/status?room_url_key=<key> → room_id・live_id・started_at(秒)・is_live・broadcast_host・broadcast_key
//   - リアルタイム: wss://<bcsvr_host>/ に「SUB\t<bcsvr_key>」→「MSG\t<key>\t{json}」(t=1 コメント・t=2 ギフト)
//   - 過去分: /api/live/comment_log(新しい順)・/api/live/gift_log(古い順)・created_at は秒
//   - ギフトの値段: /api/live/gift_list の normal/enquete の行(gift_id・gift_name・point・free・image)

export const SR_ORIGIN = 'https://www.showroom-live.com';
/** SHOWROOM のギフトの pt(ギフトの一覧の point × 個数) */
export const SR_CURRENCY = 'SRPT';

/** 部屋の URL の名前(room_url_key)として正しいか @param {unknown} s */
export function isSrRoomKey(s) {
  return /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(String(s ?? ''));
}

/** 部屋のページの URL → room_url_key(部屋のページでなければ '') @param {unknown} url */
export function parseSrRoomKeyFromUrl(url) {
  let u;
  try {
    u = new URL(String(url || ''));
  } catch {
    return '';
  }
  if (!/^(?:www\.)?showroom-live\.com$/i.test(u.hostname)) return '';
  const m = /^\/r\/([^/?#]{1,64})\/?$/.exec(u.pathname);
  if (!m) return '';
  let key = m[1];
  try {
    key = decodeURIComponent(key);
  } catch {
    return '';
  }
  return isSrRoomKey(key) ? key : '';
}

/** @param {string} key */
export function srRoomStatusUrl(key) {
  return isSrRoomKey(key) ? `${SR_ORIGIN}/api/room/status?room_url_key=${encodeURIComponent(key)}` : '';
}
/** @param {'live_info' | 'comment_log' | 'gift_log' | 'gift_list' | 'stage_user_list' | 'summary_ranking' | 'polling'} what @param {string} roomId */
export function srLiveApiUrl(what, roomId) {
  return /^\d{1,20}$/.test(String(roomId)) ? `${SR_ORIGIN}/api/live/${what}?room_id=${roomId}` : '';
}

/** 秒でも ms でも ms(読めなければ 0) @param {unknown} v */
export function srTimeMs(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n > 1e12) return Math.floor(n);
  if (n > 1e9) return Math.floor(n * 1000);
  return 0;
}

/** 画像の URL として使ってよいか(https・SHOWROOM の画像置き場) @param {unknown} url */
export function safeSrImageUrl(url) {
  const s = String(url || '').trim();
  let u;
  try {
    u = new URL(s);
  } catch {
    return '';
  }
  if (u.protocol !== 'https:') return '';
  if (!/(^|\.)showroom-live\.com$|(^|\.)showroom-cdn\.com$/i.test(u.hostname)) return '';
  return s;
}

/** アバターの番号 → 画像の URL @param {unknown} av */
export function srAvatarUrl(av) {
  const n = String(av ?? '');
  return /^\d{1,10}$/.test(n) ? `https://static.showroom-live.com/image/avatar/${n}.png` : '';
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

/**
 * /api/room/status の応答 → 部屋と配信の情報。形が違えば null。
 * @param {unknown} json
 */
export function parseSrRoomStatus(json) {
  const o = obj(json);
  if (!o) return null;
  const roomId = str(o.room_id);
  if (!/^\d{1,20}$/.test(roomId)) return null;
  const liveId = str(o.live_id);
  return {
    roomId,
    roomKey: isSrRoomKey(str(o.room_url_key)) ? str(o.room_url_key) : '',
    liveId: /^\d{1,20}$/.test(liveId) && liveId !== '0' ? liveId : '',
    isLive: o.is_live === true || o.is_live === 1,
    startedAtMs: srTimeMs(o.started_at),
    title: str(o.telop ?? '').slice(0, 200),
    roomName: str(o.room_name ?? o.main_name ?? '').slice(0, 120),
    iconUrl: safeSrImageUrl(o.image_s ?? o.image ?? ''),
    bcsvrHost: /^[a-z0-9.-]{3,80}$/i.test(str(o.broadcast_host)) ? str(o.broadcast_host) : '',
    bcsvrKey: /^[A-Za-z0-9:_-]{1,80}$/.test(str(o.broadcast_key)) ? str(o.broadcast_key) : '',
  };
}

/** /api/live/live_info → { bcsvrHost, bcsvrKey, liveId, title } @param {unknown} json */
export function parseSrLiveInfo(json) {
  const o = obj(json);
  if (!o) return null;
  const host = str(o.bcsvr_host);
  const key = str(o.bcsvr_key);
  if (!/^[a-z0-9.-]{3,80}$/i.test(host) || !/^[A-Za-z0-9:_-]{1,80}$/.test(key)) return null;
  const liveId = str(o.live_id);
  return { bcsvrHost: host, bcsvrKey: key, liveId: /^\d{1,20}$/.test(liveId) && liveId !== '0' ? liveId : '', title: str(o.telop ?? '').slice(0, 200) };
}

/** ソケットの URL(ページと同じ) @param {string} host */
export function srSocketUrl(host) {
  return /^[a-z0-9.-]{3,80}$/i.test(host) && /(^|\.)showroom-live\.com$/i.test(host) ? `wss://${host}/` : '';
}

/**
 * ソケットの1通 → { key, msg }。MSG 以外(ACK・ERR 等)は null。
 * @param {unknown} raw 例 "MSG\t<key>\t{json}"
 */
export function parseSrSocketFrame(raw) {
  const s = String(raw ?? '');
  if (!s.startsWith('MSG\t')) return null;
  const i = s.indexOf('\t', 4);
  if (i < 0) return null;
  try {
    const msg = obj(JSON.parse(s.slice(i + 1)));
    return msg ? { key: s.slice(4, i), msg } : null;
  } catch {
    return null;
  }
}

/** @typedef {{ name: string, point: number, free: boolean, imageUrl: string }} SrGift */

/**
 * /api/live/gift_list → gift_id → { 名前・pt・無料か・絵 }
 * @param {unknown} json
 * @returns {Map<string, SrGift>}
 */
export function parseSrGiftList(json) {
  const o = obj(json);
  /** @type {Map<string, SrGift>} */
  const out = new Map();
  if (!o) return out;
  for (const k of ['normal', 'enquete']) {
    for (const g of Array.isArray(o[k]) ? o[k] : []) {
      const row = obj(g);
      const id = str(row?.gift_id);
      if (!row || !/^\d{1,12}$/.test(id)) continue;
      out.set(id, {
        name: str(row.gift_name).slice(0, 60),
        point: num(row.point),
        free: row.free === true || row.free === 1,
        imageUrl: safeSrImageUrl(row.image) || `https://static.showroom-live.com/image/gift/${id}_s.png`,
      });
    }
  }
  return out;
}

/** 本文の短い指紋(同じ人・同じ秒の別のコメントを分ける) @param {string} s */
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/**
 * コメント1件(ソケットの t=1 か comment_log の行)→ 記録の1件。
 *   ソケット: u・ac・cm・av・created_at / ログ: user_id・name・comment・avatar_url・avatar_id・created_at
 *   同じコメントはどちらから来ても同じ id になる(重ねて記録しない)。
 * @param {unknown} raw
 * @param {{ roomId: string, nowMs?: number }} ctx
 */
export function parseSrComment(raw, ctx) {
  const c = obj(raw);
  if (!c) return null;
  const uid = str(c.u ?? c.user_id);
  if (!/^\d{1,20}$/.test(uid)) return null;
  const text = str(c.cm ?? c.comment).replace(/\s+/g, ' ').slice(0, 500);
  if (!text) return null;
  const at = srTimeMs(c.created_at);
  const postedAtMs = at || Number(ctx.nowMs) || Date.now();
  // カウント(1〜50 の数字だけのコメント)は SHOWROOM の文化。普通のコメントとして残す
  return {
    id: `sr-c-${uid}-${at ? Math.floor(at / 1000) : 0}-${hash(text)}`,
    channelId: `sr:${uid}`,
    name: str(c.ac ?? c.name).slice(0, 80) || `SHOWROOM${uid.slice(-4)}`,
    login: '',
    iconUrl: safeSrImageUrl(c.avatar_url) || srAvatarUrl(c.av ?? c.avatar_id),
    text,
    kind: 'text',
    amount: 0,
    currency: '',
    badges: /** @type {string[]} */ ([]),
    ts: '',
    postedAtMs,
    channel: String(ctx.roomId || ''),
    color: '',
  };
}

/**
 * ギフト1件(ソケットの t=2 か gift_log の行)→ 記録の1件。無料のギフト(星・種)は null(数が多すぎる・計器でだけ数える)。
 *   ソケット: u・ac・g・n・av・created_at / ログ: user_id・name・gift_id・num・avatar_url・created_at
 * @param {unknown} raw
 * @param {{ roomId: string, gifts: Map<string, SrGift>, nowMs?: number }} ctx
 * @returns {null | { free: true } | Record<string, any>}
 */
export function parseSrGift(raw, ctx) {
  const c = obj(raw);
  if (!c) return null;
  const uid = str(c.u ?? c.user_id);
  const gid = str(c.g ?? c.gift_id);
  if (!/^\d{1,20}$/.test(uid) || !/^\d{1,12}$/.test(gid)) return null;
  const count = Math.min(100000, Math.max(1, Math.floor(num(c.n ?? c.num) || 1)));
  const g = ctx.gifts.get(gid);
  // 一覧に無いギフトは値段が分からない=pt 0 の名前なしで残す(無料かどうかも分からないので捨てない)
  if (g?.free) return { free: true };
  const at = srTimeMs(c.created_at);
  const name = g?.name || `ギフト${gid}`;
  const amount = g ? g.point * count : 0;
  return {
    id: `sr-g-${uid}-${at ? Math.floor(at / 1000) : 0}-${gid}-${count}`,
    channelId: `sr:${uid}`,
    name: str(c.ac ?? c.name).slice(0, 80) || `SHOWROOM${uid.slice(-4)}`,
    login: '',
    iconUrl: safeSrImageUrl(c.avatar_url) || srAvatarUrl(c.av ?? c.avatar_id),
    text: `${name}${count > 1 ? ` ×${count}` : ''}`,
    kind: amount > 0 ? 'superchat' : 'text',
    amount,
    currency: amount > 0 ? SR_CURRENCY : '',
    giftName: name,
    giftImageUrl: g?.imageUrl || `https://static.showroom-live.com/image/gift/${gid}_s.png`,
    ...(count > 1 ? { giftCount: count } : {}),
    badges: [],
    ts: '',
    postedAtMs: at || Number(ctx.nowMs) || Date.now(),
    channel: String(ctx.roomId || ''),
    color: '',
  };
}

/** /api/live/comment_log・gift_log の一覧 @param {unknown} json @param {'comment_log' | 'gift_log'} key */
export function srLogRows(json, key) {
  const o = obj(json);
  return o && Array.isArray(o[key]) ? o[key] : [];
}

/**
 * 公式の順位(summary_ranking は pt つき・無ければ stage_user_list の順)→ YT_LEADERBOARD の行
 * @param {unknown} summary
 * @param {unknown} [stage]
 * @returns {{ rank: number, name: string, xp: number, iconUrl: string }[]}
 */
export function parseSrRanking(summary, stage) {
  const s = obj(summary);
  /** @type {{ rank: number, name: string, xp: number, iconUrl: string }[]} */
  const out = [];
  for (const r of Array.isArray(s?.ranking) ? s.ranking : []) {
    const row = obj(r);
    const name = str(row?.name).slice(0, 80);
    if (!row || !name) continue;
    out.push({ rank: Math.floor(num(row.rank ?? row.order)) || out.length + 1, name, xp: Math.floor(num(row.point)), iconUrl: safeSrImageUrl(row.avatar_url) });
    if (out.length >= 100) break;
  }
  if (out.length) return out;
  const st = obj(stage);
  for (const r of Array.isArray(st?.stage_user_list) ? st.stage_user_list : []) {
    const row = obj(r);
    const u = obj(row?.user);
    const name = str(u?.name).slice(0, 80);
    if (!row || !name) continue;
    out.push({ rank: Math.floor(num(row.rank ?? row.order_no)) || out.length + 1, name, xp: 0, iconUrl: safeSrImageUrl(u?.avatar_url) });
    if (out.length >= 100) break;
  }
  return out;
}

/** 配信キー: sr.<room_url_key>.<live_id> @param {string} roomKey @param {{ liveId?: string | number | null }} [opts] */
export function buildSrStreamKey(roomKey, opts = {}) {
  const lid = String(opts.liveId ?? '');
  return isSrRoomKey(roomKey) && /^\d{1,20}$/.test(lid) ? `sr.${roomKey}.${lid}` : '';
}
/** @param {unknown} key */
export function isSrStreamKey(key) {
  return /^sr\.[A-Za-z0-9][A-Za-z0-9_.-]{0,63}\.\d{1,20}$/.test(String(key || ''));
}
/** 配信キー → room_url_key(room_url_key に . が入ることがあるので最後の . で分ける) @param {unknown} key */
export function srRoomKeyOfStreamKey(key) {
  const k = String(key || '');
  if (!isSrStreamKey(k)) return '';
  return k.slice(3, k.lastIndexOf('.'));
}
/** @param {unknown} roomKey */
export function srRoomUrl(roomKey) {
  const k = String(roomKey || '');
  return isSrRoomKey(k) ? `${SR_ORIGIN}/r/${encodeURIComponent(k)}` : '';
}
