// wwParse.js — ふわっち(whowatch.tv)の配信とコメントを、YouTube 版の記録と同じ形にする(純関数)
// @layer L0 — 純粋計算
//
// ★council/whowatch-support-PLAN.md。ふわっちの API は公式の文書が無い。形は 2018〜2025 の非公式資料(yt-dlp など)による推定で、
//   本物は PC で確かめる(計器 yt_diag_ww_chat)。形が違う・欠けている1件は null を返して捨てる(AGENTS.md §3.6)。
//   - 視聴ページ: https://whowatch.tv/viewer/<live_id>
//   - 配信とコメント: GET https://api.whowatch.tv/lives/<live_id>?last_updated_at=<前回の updated_at>(最初は 0)
//     → { live: {...}, comments: [...], updated_at }
//   出す形は kickChatParse.js と同じ: { id, channelId:'ww:<user id>', name, login(user_path), iconUrl, text, kind, amount, currency,
//   badges, ts:'', postedAtMs, channel(live id), color, giftName?, giftImageUrl?, giftCount? }

export const WW_API_ORIGIN = 'https://api.whowatch.tv';
/**
 * ふわっちのアイテムの数え方。値段はコメントにも公開の API にも無い(2026-11-08 PC 実測)ので、個数で数える(1個 = 1)。
 *   画面では「3 個」と出る(ytGiftToNico.js の COUNT_CURRENCY)。
 */
export const WW_CURRENCY = 'WWITEM';

/** 配信の番号として正しいか @param {unknown} s */
export function isWwLiveId(s) {
  return /^\d{1,20}$/.test(String(s ?? ''));
}

/** 人のページの名前(user_path・例 w:abc / t:abc)として正しいか @param {unknown} s */
export function isWwUserPath(s) {
  const v = String(s ?? '');
  return /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,63}$/.test(v) && !/^\d+$/.test(v);
}

/**
 * 視聴ページの URL → 配信の番号。視聴ページでなければ ''。
 * @param {unknown} url
 */
export function parseWwLiveIdFromUrl(url) {
  let u;
  try {
    u = new URL(String(url || ''));
  } catch {
    return '';
  }
  if (!/^(?:www\.)?whowatch\.tv$/i.test(u.hostname)) return '';
  const m = /^\/viewer\/(\d{1,20})\/?$/.exec(u.pathname);
  return m ? m[1] : '';
}

/** @param {string} liveId @param {number} [lastUpdatedAt] */
export function wwLiveApiUrl(liveId, lastUpdatedAt = 0) {
  if (!isWwLiveId(liveId)) return '';
  const n = Number(lastUpdatedAt);
  return `${WW_API_ORIGIN}/lives/${liveId}?last_updated_at=${Number.isFinite(n) && n > 0 ? Math.floor(n) : 0}`;
}

/** API の URL として通してよいか(バックグラウンドが代わりに読むとき) @param {unknown} url */
export function isWwApiUrl(url) {
  const u = String(url || '');
  // 配信の情報とコメント、イベントの順位(events/event_info・ログイン不要・2026-11-11 実測)だけ
  return /^https:\/\/api\.whowatch\.tv\/lives\/\d{1,20}(?:\/play)?(?:\?last_updated_at=\d{1,16})?$/.test(u)
    || /^https:\/\/api\.whowatch\.tv\/events\/event_info\?live_id=\d{1,20}$/.test(u);
}

/** 秒でも ms でも ms にする(読めなければ 0) @param {unknown} v */
export function wwTimeMs(v) {
  if (typeof v === 'string' && v && !/^\d+$/.test(v)) {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : 0;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n > 1e12) return Math.floor(n);
  if (n > 1e9) return Math.floor(n * 1000);
  return 0;
}

/** 画像の URL として使ってよいか(https・ふわっちか、その画像置き場) @param {unknown} url */
export function safeWwImageUrl(url) {
  const s = String(url || '').trim();
  let u;
  try {
    u = new URL(s);
  } catch {
    return '';
  }
  if (u.protocol !== 'https:') return '';
  if (!/(^|\.)whowatch\.tv$|\.cloudfront\.net$|\.amazonaws\.com$/i.test(u.hostname)) return '';
  if (/default|no_?image|noimage/i.test(u.pathname)) return '';
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
/** 最初に入っている値 @param {Record<string, any>} o @param {string[]} keys */
function pick(o, keys) {
  for (const k of keys) if (o[k] != null && o[k] !== '') return o[k];
  return undefined;
}

/** 終わった配信の印(live_status 等の値・PC で確かめる) */
const ENDED_RE = /^(?:finish(?:ed)?|end(?:ed)?|closed?|archived?|stop(?:ped)?)$/i;
const LIVE_RE = /^(?:publishing|live|on_?air|streaming|broadcasting|started)$/i;

/**
 * ふわっちの人(コメントの user・配信の user)→ { id, name, userPath, iconUrl }。id が無ければ null。
 * @param {unknown} raw
 */
export function parseWwUser(raw) {
  const u = obj(raw);
  if (!u) return null;
  const id = str(u.id);
  if (!/^\d{1,20}$/.test(id)) return null;
  const userPath = str(u.user_path);
  return {
    id,
    // 匿名の人(anonymized / is_tanuki)の id は配信をまたいで十数種類しかない共有の番号(2026-11-08 PC 実測: 1つの id に38人分の名前)
    anonymous: u.anonymized === true || u.is_tanuki === true,
    name: str(pick(u, ['name', 'nickname', 'screen_name'])).slice(0, 80),
    userPath: isWwUserPath(userPath) ? userPath : '',
    iconUrl: safeWwImageUrl(pick(u, ['icon_url', 'icon', 'image_url', 'profile_image_url'])),
  };
}

/**
 * GET /lives/<id> の応答 → 配信の情報。形が違えば null。
 * @param {unknown} json
 * @param {string} [liveIdHint] 開いているページの配信の番号(応答に番号が無いとき)
 */
export function parseWwLive(json, liveIdHint = '') {
  const root = obj(json);
  if (!root) return null;
  const live = obj(root.live) || (root.id != null && root.user ? root : null);
  const comments = Array.isArray(root.comments) ? root.comments : [];
  if (!live && !comments.length && root.updated_at == null) return null;
  const l = live || {};
  const liveId = str(l.id) || str(liveIdHint);
  if (!isWwLiveId(liveId)) return null;
  const user = parseWwUser(l.user);
  const status = str(pick(l, ['live_status', 'status', 'state'])).slice(0, 30);
  /** @type {boolean | null} 分からなければ null(配信中として扱う) */
  let isLive = null;
  if (status && ENDED_RE.test(status)) isLive = false;
  else if (status && LIVE_RE.test(status)) isLive = true;
  if (isLive === null && wwTimeMs(l.ended_at) > 0) isLive = false;
  if (isLive === null && typeof l.is_live === 'boolean') isLive = l.is_live;
  const viewers = pick(l, ['view_count', 'viewer_count', 'current_view_count']);
  return {
    liveId,
    title: str(l.title).slice(0, 200),
    user,
    startedAtMs: wwTimeMs(l.started_at),
    viewers: viewers == null ? null : num(viewers),
    totalViews: num(l.total_view_count),
    commentCount: num(l.comment_count),
    status,
    isLive,
    updatedAt: wwTimeMs(root.updated_at) || num(root.updated_at),
    comments,
  };
}

/**
 * コメントに付いたアイテム(投げ銭)→ { name, imageUrl, count }。アイテムでなければ null。
 *   本物の形(2026-11-08 PC 実測): comment_type "BY_PLAYITEM" と play_item_pattern{ id, name, image_url, quantity(いつも1) }・
 *   個数は comment.item_count(1〜100)。値段はどこにも無い。
 * @param {Record<string, any>} c
 */
export function parseWwItem(c) {
  const it = obj(c.play_item_pattern) || obj(c.play_item) || obj(c.item);
  if (!it) return null;
  const name = str(pick(it, ['name', 'item_name', 'title'])).slice(0, 60);
  if (!name) return null;
  const count = Math.min(10000, Math.max(1, Math.floor(num(c.item_count) || num(it.quantity) || 1)));
  return { name, imageUrl: safeWwImageUrl(pick(it, ['image_url', 'icon_url', 'image'])), count };
}

const ENTITIES = /** @type {Record<string, string>} */ ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" });
/**
 * not_escaped: true のコメント(アイテム・お知らせ)は本文に HTML が入る(<b> <img> <br>)。タグを除いて文字だけにする。
 *   画面は文字として出すので HTML としては動かないが、タグが見えていた(2026-11-08 PC 実測)。
 * @param {unknown} html
 */
export function wwPlainText(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<img\b[^>]*\balt\s*=\s*"([^"]*)"[^>]*>/gi, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d{1,6}|#x[0-9a-f]{1,6}|[a-z]{2,6});/gi, (m, e) => {
      const k = String(e).toLowerCase();
      if (ENTITIES[k] != null) return ENTITIES[k];
      const code = k.startsWith('#x') ? parseInt(k.slice(2), 16) : k.startsWith('#') ? Number(k.slice(1)) : NaN;
      return Number.isFinite(code) && code > 31 && code < 0x110000 ? String.fromCodePoint(code) : m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** 運営のお知らせ(人の発言ではない)。順位表に人として入れない */
const SYSTEM_TYPE_RE = /SYSTEM|NOTICE|ADMIN|OFFICIAL|ANNOUNCE/i;
const SYSTEM_NAMES = new Set(['ふわっち運営', 'ふわっち']);
/** 「ふわっち運営＠ねこにゃんず学園 文化祭」のように、運営の名前の後ろに催しの名前が付く(2026-11-08 PC 実測) */
const SYSTEM_NAME_HEAD_RE = /^ふわっち運営/;

/**
 * コメント1件 → 記録の1件。記録しないもの・形が違うものは null。
 * @param {unknown} raw
 * @param {{ liveId: string, nowMs?: number }} ctx
 */
export function parseWwComment(raw, ctx) {
  const c = obj(raw);
  if (!c) return null;
  const id = str(c.id);
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return null;
  const user = parseWwUser(c.user);
  if (!user) return null;
  const type = str(pick(c, ['comment_type', 'type'])).slice(0, 40);
  if (SYSTEM_TYPE_RE.test(type) || SYSTEM_NAMES.has(user.name) || SYSTEM_NAME_HEAD_RE.test(user.name)) return null;
  // 匿名の印は user の中ではなくコメントの直下に来る(2026-11-08 PC 実測)。どちらにあっても匿名として扱う
  const anonymous = user.anonymous || c.anonymized === true || c.is_tanuki === true;
  const rawText = str(pick(c, ['message', 'comment', 'body', 'text']));
  const text = (c.not_escaped === true || /<[a-z/][^>]*>/i.test(rawText) ? wwPlainText(rawText) : rawText.replace(/\s+/g, ' ').trim()).slice(0, 500);
  const postedAtMs = wwTimeMs(pick(c, ['posted_at', 'created_at', 'timestamp'])) || Number(ctx.nowMs) || Date.now();
  const item = /^BY_PLAYITEM$/i.test(type) || c.play_item_pattern ? parseWwItem(c) : null;
  const name = user.name || user.userPath || `ふわっち${user.id.slice(-4)}`;
  // 匿名の人は id が共有なので、名前で見分ける(同じ名前の匿名は同じ人として数える)
  const channelId = anonymous ? `ww:n:${name.slice(0, 40)}` : `ww:${user.id}`;
  const base = {
    id: `ww-${id}`,
    channelId,
    name,
    login: anonymous ? '' : user.userPath,
    iconUrl: user.iconUrl,
    badges: type && !/^by_(?:public|playitem)$/i.test(type) ? [type.toLowerCase()] : [],
    ts: '',
    postedAtMs,
    channel: String(ctx.liveId || ''),
    color: '',
  };
  if (item) {
    return {
      ...base,
      text: text || `${item.name}${item.count > 1 ? ` ×${item.count}` : ''}`,
      kind: 'superchat',
      amount: item.count,
      currency: WW_CURRENCY,
      giftName: item.name,
      ...(item.imageUrl ? { giftImageUrl: item.imageUrl } : {}),
      ...(item.count > 1 ? { giftCount: item.count } : {}),
    };
  }
  if (!text) return null;
  return { ...base, text, kind: 'text', amount: 0, currency: '' };
}

/**
 * 配信キー: ww.<配信の番号>.<配信者の user id>(配信者が分からなければ 0)。
 *   タブの URL(viewer/<配信の番号>)からそのまま引けるよう、Twitch の login の位置に配信の番号を置く。
 * @param {string} liveId
 * @param {{ userId?: string | number | null }} [opts]
 */
export function buildWwStreamKey(liveId, opts = {}) {
  const id = String(liveId || '');
  if (!isWwLiveId(id)) return '';
  const uid = String(opts.userId ?? '');
  return `ww.${id}.${/^\d{1,20}$/.test(uid) ? uid : '0'}`;
}

/** @param {unknown} key */
export function isWwStreamKey(key) {
  return /^ww\.\d{1,20}\.\d{1,20}$/.test(String(key || ''));
}

/** 配信キー → 配信の番号 @param {unknown} key */
export function wwLiveIdOfStreamKey(key) {
  const m = /^ww\.(\d{1,20})\.\d{1,20}$/.exec(String(key || ''));
  return m ? m[1] : '';
}

/**
 * ふわっちのページの URL。数字は配信の番号(視聴ページ)、それ以外は人の user_path(プロフィール)。
 * @param {unknown} login
 */
export function wwPageUrl(login) {
  const s = String(login || '');
  if (isWwLiveId(s)) return `https://whowatch.tv/viewer/${s}`;
  if (isWwUserPath(s)) return `https://whowatch.tv/profile/${encodeURIComponent(s).replace(/%3A/gi, ':')}`;
  return '';
}
