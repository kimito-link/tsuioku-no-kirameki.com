// mxParse.js — ミクチャ(mixch.tv)の配信・コメント・ギフトを、YouTube 版の記録と同じ形にする(純関数)
// @layer L0 — 純粋計算
//
// ★council/mixch-support-PLAN.md。形は 2026-11-08 の PC 実測(本物のミクチャ・ログインなし・値抜き)から作った。
//   公式の開発者向け API は無い。ページ自身が使う口を読む。形が違う・欠けている1件は null を返して捨てる(AGENTS.md §3.6)。
//   - 配信: GET /api-web/users/<A>/live → liveInfo{id, chat, live_session_id, title, viewer, created}・broadcasterInfo{id, name, profile_image_url}
//     A はページ /u/<A>/live の数字(= broadcasterInfo.id = liveInfo.id)
//   - リアルタイム: wss://chat.mixch.tv/torte/room/<A>(受けるだけ・1通が JSON 1件)
//   - 開いた時点の分: GET /api-web/lives/<A>/messages(ルートが配列・新しい順・created は秒)
//   - kind: 0 コメント / 42 45 46 48 53 120 ギフト(item_id・count)/ 10 配信の状態(viewer・point)/ 61 入室 62 ファン 50 シェア
//   - ギフトの値段: /items/available?live_session_id= の items[{id, price, url}](item_id と id が対応・PC 実測 484/487 件)。
//     アイテムの名前の口はまだ見つかっていない(ギフトの name は贈った人の名前)ので、名前は「ギフト」とだけ出す。

export const MX_ORIGIN = 'https://mixch.tv';
/** ミクチャのギフトの値段(items の price × 個数。単位はコインとみている・未確認) */
export const MX_CURRENCY = 'MXCOIN';

/** ギフトの kind(PC 実測で item_id を持っていたもの) */
const GIFT_KINDS = new Set([42, 45, 46, 48, 53, 120]);

/** 配信者の番号(ページ /u/<A>/live の A)として正しいか @param {unknown} s */
export function isMxUserId(s) {
  return /^\d{1,15}$/.test(String(s ?? ''));
}

/** ページの URL → 配信者の番号(ミクチャの配信者のページでなければ '') @param {unknown} url */
export function parseMxUserIdFromUrl(url) {
  let u;
  try {
    u = new URL(String(url || ''));
  } catch {
    return '';
  }
  if (!/^(?:www\.)?mixch\.tv$/i.test(u.hostname)) return '';
  const m = /^\/u\/(\d{1,15})(?:\/live)?\/?$/.exec(u.pathname);
  return m ? m[1] : '';
}

/** @param {string} a */
export function mxLiveInfoUrl(a) {
  return isMxUserId(a) ? `${MX_ORIGIN}/api-web/users/${a}/live` : '';
}
/** @param {string} a */
export function mxMessagesUrl(a) {
  return isMxUserId(a) ? `${MX_ORIGIN}/api-web/lives/${a}/messages` : '';
}
/** @param {string} a */
export function mxRankingUrl(a) {
  return isMxUserId(a) ? `${MX_ORIGIN}/api-web/users/${a}/fans/ranking/monthly` : '';
}
/**
 * アイテムの一覧の URL の候補(PC 実測ではパスが /items/available としか分かっていないので、両方を順に試す)
 * @param {string} sessionId
 */
export function mxItemsUrls(sessionId) {
  if (!/^\d{1,20}$/.test(String(sessionId))) return [];
  const q = `available?live_session_id=${sessionId}`;
  // /api-web/items は 302 で飛ばされる(2026-11-08 PC 実測・全部屋 root で取れた)。root を先に試す
  return [`${MX_ORIGIN}/items/${q}`, `${MX_ORIGIN}/api-web/items/${q}`];
}
/** ソケットの URL(liveInfo.chat がこの形のときだけ使う。無ければ番号から作る) @param {unknown} chat @param {string} a */
export function mxSocketUrl(chat, a) {
  const s = String(chat || '').trim();
  if (/^wss:\/\/chat\.mixch\.tv\/torte\/room\/\d{1,15}$/.test(s)) return s;
  return isMxUserId(a) ? `wss://chat.mixch.tv/torte/room/${a}` : '';
}

/** 秒でも ms でも ms(読めなければ 0) @param {unknown} v */
export function mxTimeMs(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n > 1e12) return Math.floor(n);
  if (n > 1e9) return Math.floor(n * 1000);
  return 0;
}

/** 画像の URL として使ってよいか(https・ミクチャの画像置き場=cloudfront・mixch.tv) @param {unknown} url */
export function safeMxImageUrl(url) {
  const s = String(url || '').trim();
  let u;
  try {
    u = new URL(s);
  } catch {
    return '';
  }
  if (u.protocol !== 'https:') return '';
  if (!/(^|\.)cloudfront\.net$|(^|\.)mixch\.tv$/i.test(u.hostname)) return '';
  return s;
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
 * GET /api-web/users/<A>/live → 配信の情報。配信していなければ isLive=false。形が違えば null。
 * @param {unknown} json
 * @param {string} [aHint] ページの番号
 */
export function parseMxLive(json, aHint = '') {
  const o = obj(json);
  if (!o) return null;
  const li = obj(o.liveInfo);
  const bi = obj(o.broadcasterInfo);
  if (!li && !bi) return null;
  const a = str(bi?.id ?? li?.id) || aHint;
  if (!isMxUserId(a)) return null;
  const sessionId = str(li?.live_session_id);
  const chat = str(li?.chat);
  return {
    userId: a,
    sessionId: /^\d{1,20}$/.test(sessionId) && sessionId !== '0' ? sessionId : '',
    // 配信中の印は「配信の情報があり、チャットのつなぎ先がある」こと(終わりの印は未実測)
    isLive: !!(li && chat && /^\d{1,20}$/.test(sessionId) && sessionId !== '0'),
    liveStatus: str(bi?.live_status).slice(0, 20),
    title: str(li?.title).slice(0, 200),
    name: str(bi?.name ?? li?.name).slice(0, 120),
    iconUrl: safeMxImageUrl(bi?.profile_image_url ?? li?.profile_image_url),
    chat: mxSocketUrl(chat, a),
    viewers: li && Number.isFinite(Number(li.viewer)) ? Math.floor(num(li.viewer)) : null,
    startedAtMs: mxTimeMs(li?.created),
  };
}

/**
 * /items/available → item_id → { price, resourceId, imageUrl }
 *   items[].url は絵ではなくページへのリンク(mixch.tv/p/…・2026-11-08 PC 実測)なので使わない。
 *   絵は resource_id から ギフトの資源(MX_RES_BASE)を引いて決める(imageUrl はあとで入れる)。
 * @param {unknown} json
 * @returns {Map<string, MxItem>}
 */
export function parseMxItems(json) {
  const o = obj(json);
  /** @type {Map<string, MxItem>} */
  const out = new Map();
  for (const it of Array.isArray(o?.items) ? o.items : []) {
    const r = obj(it);
    const id = str(r?.id);
    if (!r || !/^\d{1,12}$/.test(id)) continue;
    const res = str(r.resource_id);
    out.set(id, { price: Math.floor(num(r.price)), resourceId: /^\d{1,9}$/.test(res) ? res : '', imageUrl: '' });
  }
  return out;
}
/** @typedef {{ price: number, resourceId: string, imageUrl: string, imageTried?: boolean }} MxItem */

// ---- ギフトの絵(2026-11-08 PC 実測) ----
//   index.json → {resources:[{id, file}]}(file は / で始まる)→ 土台 + file の JSON の preview(/ で始まる)→ 土台 + preview が絵。
//   どちらも Access-Control-Allow-Origin が無いので、読むのはバックグラウンド(ホスト権限)。
export const MX_RES_BASE = 'https://d2uqarpmf42qy0.cloudfront.net/torte_web_resources';
export const MX_RES_INDEX_URL = `${MX_RES_BASE}/index.json`;
const RES_PATH_RE = /^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*$/;
/** @param {unknown} p @param {RegExp} ext */
function safeResPath(p, ext) {
  const s = str(p).trim();
  if (!RES_PATH_RE.test(s) || s.includes('..') || !ext.test(s)) return '';
  return s;
}
/** index.json → resource_id → file の URL @param {unknown} json @returns {Map<string, string>} */
export function parseMxResourceIndex(json) {
  const o = obj(json);
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const it of Array.isArray(o?.resources) ? o.resources : []) {
    const r = obj(it);
    const id = str(r?.id);
    const file = safeResPath(r?.file, /\.json$/i);
    if (!/^\d{1,9}$/.test(id) || !file) continue;
    out.set(id, `${MX_RES_BASE}${file}`);
    if (out.size >= 5000) break;
  }
  return out;
}
/** 資源の JSON → 絵の URL(無ければ '') @param {unknown} json */
export function mxResourcePreviewUrl(json) {
  const p = safeResPath(obj(json)?.preview, /\.(?:png|jpe?g|webp|gif)$/i);
  return p ? `${MX_RES_BASE}${p}` : '';
}

/** ソケットの1通 → JSON の行の配列(読めなければ空)。1通に配列が来ても全部返す @param {unknown} raw @returns {Record<string, any>[]} */
export function parseMxSocketFrame(raw) {
  const s = String(raw ?? '').trim();
  if (!s || (s[0] !== '{' && s[0] !== '[')) return [];
  try {
    const v = JSON.parse(s);
    return /** @type {Record<string, any>[]} */ ((Array.isArray(v) ? v : [v]).map(obj).filter(Boolean));
  } catch {
    return [];
  }
}

/** /api-web/lives/<A>/messages(ルートが配列・新しい順)→ 古い順の行 @param {unknown} json */
export function mxMessageRows(json) {
  const rows = Array.isArray(json) ? json : Array.isArray(obj(json)?.messages) ? obj(json)?.messages : [];
  return rows.slice().reverse();
}

/** @param {unknown} v */
export function mxKindOf(v) {
  const n = Number(obj(v)?.kind);
  return Number.isInteger(n) ? n : -1;
}

/**
 * コメントかギフト1件 → 記録の1件。記録しないもの(入室・状態など)・形が違うものは null。
 * @param {unknown} raw
 * @param {{ userId: string, items?: Map<string, MxItem>, nowMs?: number }} ctx
 */
export function parseMxMessage(raw, ctx) {
  const c = obj(raw);
  if (!c) return null;
  const kind = mxKindOf(c);
  const isGift = GIFT_KINDS.has(kind) || (kind !== 0 && c.item_id != null);
  if (kind !== 0 && !isGift) return null;
  const mid = str(c.message_id);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(mid)) return null;
  const uid = str(c.user_id);
  const anonymous = Number(c.anonymous) === 1;
  if (!anonymous && !/^\d{1,15}$/.test(uid)) return null;
  const name = anonymous ? '匿名' : str(c.name).slice(0, 80) || `ミクチャ${uid.slice(-4)}`;
  const postedAtMs = mxTimeMs(c.created) || Number(ctx.nowMs) || Date.now();
  const base = {
    id: `mx-${mid}`,
    // 匿名のギフトは誰か分からないので1つの席にまとめる
    channelId: anonymous ? 'mx:n:匿名' : `mx:${uid}`,
    name,
    login: '',
    iconUrl: anonymous ? '' : safeMxImageUrl(c.profile_image_url),
    badges: /** @type {string[]} */ ([]),
    ts: '',
    postedAtMs,
    channel: String(ctx.userId || ''),
    color: '',
  };
  if (!isGift) {
    const text = str(c.body).replace(/\s+/g, ' ').slice(0, 500);
    if (!text) return null;
    return { ...base, text, kind: 'text', amount: 0, currency: '' };
  }
  const itemId = str(c.item_id);
  if (!/^\d{1,12}$/.test(itemId)) return null;
  const count = Math.min(100000, Math.max(1, Math.floor(num(c.count) || 1)));
  const it = ctx.items?.get(itemId);
  // 値段は一覧の price。一覧に無ければ kind 120 にだけ来る item_price を使う。どちらも無ければ 0(名前つきの text で残す)
  const unit = it?.price || Math.floor(num(c.item_price));
  const amount = unit * count;
  const giftName = 'ギフト';
  return {
    ...base,
    text: `${giftName}${count > 1 ? ` ×${count}` : ''}`,
    kind: amount > 0 ? 'superchat' : 'text',
    amount,
    currency: amount > 0 ? MX_CURRENCY : '',
    giftName,
    ...(it?.imageUrl && safeMxImageUrl(it.imageUrl) ? { giftImageUrl: it.imageUrl } : {}),
    ...(count > 1 ? { giftCount: count } : {}),
  };
}

/**
 * 公式の今月のファンランキング → YT_LEADERBOARD の行
 * @param {unknown} json
 * @returns {{ rank: number, name: string, xp: number, iconUrl: string }[]}
 */
export function parseMxRanking(json) {
  const o = obj(json);
  /** @type {{ rank: number, name: string, xp: number, iconUrl: string }[]} */
  const out = [];
  for (const r of Array.isArray(o?.superfans) ? o.superfans : []) {
    const row = obj(r);
    const name = str(row?.name).slice(0, 80);
    if (!row || !name) continue;
    out.push({ rank: out.length + 1, name, xp: Math.floor(num(row.score)), iconUrl: safeMxImageUrl(row.profile_image_url) });
    if (out.length >= 100) break;
  }
  return out;
}

/**
 * 人のアイコンの帳面に足す1件(ギフトの行など profile_image_url を持つ行から)。
 *   ★コメント(kind 0)にはアイコンの項目が無い(2026-11-12 PC 実測: ソケット 13 件・messages 54 件とも profile_image_url のキー自体が無い)。
 *   アイコンが来るのはギフトの行と今月のファンランキング(superfans[].id)だけなので、そこで覚えた人のアイコンをコメントに付ける。
 * @param {unknown} raw
 * @returns {[string, string] | null} [user_id, 画像 URL]
 */
export function mxIconFromRaw(raw) {
  const c = obj(raw);
  if (!c || Number(c.anonymous) === 1) return null;
  const uid = str(c.user_id);
  const url = safeMxImageUrl(c.profile_image_url);
  return /^\d{1,15}$/.test(uid) && url ? [uid, url] : null;
}

/**
 * 人のプロフィール(アイコンだけの小さな口・ログイン不要・約120バイト・2026-11-12 PC 実測)。
 *   ギフトもランキングも無い人のアイコンはここでしか分からない。画像 URL は /p/<id>/<変わる番号>/small なので id から作れない。
 * @param {string} uid
 */
export function mxProfileUrl(uid) {
  return isMxUserId(uid) ? `${MX_ORIGIN}/api-web/users/${uid}/profile` : '';
}

/**
 * /api-web/users/<id>/profile → 画像 URL(無い・形が違う・別の人の応答なら '')
 * @param {unknown} json
 * @param {string} uid
 */
export function parseMxProfileIcon(json, uid) {
  const o = obj(json);
  if (!o || str(o.id) !== String(uid)) return '';
  return safeMxImageUrl(o.profile_image_url);
}

/**
 * 今月のファンランキング → user_id → 画像 URL(人の番号のキーは id)
 * @param {unknown} json
 * @returns {Map<string, string>}
 */
export function mxIconsFromRanking(json) {
  const out = new Map();
  const list = obj(json)?.superfans;
  for (const r of Array.isArray(list) ? list : []) {
    const row = obj(r);
    const uid = str(row?.id);
    const url = safeMxImageUrl(row?.profile_image_url);
    if (/^\d{1,15}$/.test(uid) && url) out.set(uid, url);
    if (out.size >= 500) break;
  }
  return out;
}

/** 配信キー: mx.<配信者の番号>.<live_session_id> @param {string} a @param {{ sessionId?: string | number | null }} [opts] */
export function buildMxStreamKey(a, opts = {}) {
  const sid = String(opts.sessionId ?? '');
  return isMxUserId(a) && /^\d{1,20}$/.test(sid) ? `mx.${a}.${sid}` : '';
}
/** @param {unknown} key */
export function isMxStreamKey(key) {
  return /^mx\.\d{1,15}\.\d{1,20}$/.test(String(key || ''));
}
/** 配信キー → 配信者の番号 @param {unknown} key */
export function mxUserIdOfStreamKey(key) {
  const k = String(key || '');
  return isMxStreamKey(k) ? k.split('.')[1] : '';
}
/** @param {unknown} a */
export function mxLiveUrl(a) {
  const s = String(a || '');
  return isMxUserId(s) ? `${MX_ORIGIN}/u/${s}/live` : '';
}
