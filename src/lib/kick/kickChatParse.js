// kickChatParse.js — Kick のチャット(ページ自身が使う Pusher)の1件を、YouTube 版の記録と同じ形にする(純関数)
// @layer L0 — 純粋計算
//
// ★council/kick-support-PLAN.md。Kick の Pusher の形は公式文書が無い(非公式の実装と PC 実測で確かめる)。
//   形が違う・欠けている1件は null を返して捨てる(AGENTS.md §3.6)。
//   出す形は twIrcParse.js と同じ: { id, channelId:'kk:<user id>', name, login(slug), iconUrl:'', text, kind, amount, currency,
//   badges, ts:'', postedAtMs, channel(chatroom id), color, subMonths?, giftCount?, subTier? }

/** チャンネル名(URL の slug)として正しいか @param {unknown} s */
export function isKickSlug(s) {
  return /^[a-z0-9][a-z0-9_-]{1,24}$/.test(String(s || ''));
}

/** 名前 → slug(Kick は小文字・_ は - に) @param {unknown} name */
export function kickSlugOfName(name) {
  const s = String(name || '').trim().toLowerCase().replace(/_/g, '-');
  return isKickSlug(s) ? s : '';
}

const RESERVED = new Set([
  'categories', 'category', 'browse', 'following', 'search', 'video', 'videos', 'clips', 'clip', 'dashboard', 'settings',
  'terms-of-service', 'privacy-policy', 'community-guidelines', 'dmca-policy', 'about', 'careers', 'contact', 'faq',
  'login', 'signup', 'subscriptions', 'wallet', 'messages', 'notifications', 'creator-dashboard', 'popout', 'embed',
  'kick-gaming', 'apps', 'help', 'brand', 'kicks', 'stream-key', 'oauth', 'api', 'auth', 'leaderboards', 'gift',
]);

/**
 * Kick のチャンネルページの URL → slug。チャンネルのページでなければ ''。
 *   kick.com/<slug> と、チャットだけの kick.com/popout/<slug>/chat を受ける。
 * @param {unknown} url
 */
export function parseKickChannelFromUrl(url) {
  let u;
  try {
    u = new URL(String(url || ''));
  } catch {
    return '';
  }
  if (!/^(?:www\.)?kick\.com$/i.test(u.hostname)) return '';
  const seg = u.pathname.split('/').filter(Boolean).map((x) => x.toLowerCase());
  if (!seg.length) return '';
  if (seg[0] === 'popout') return isKickSlug(seg[1]) && seg[2] === 'chat' ? seg[1] : '';
  if (RESERVED.has(seg[0])) return '';
  if (seg.length > 1) return ''; // /foo/videos 等はチャンネルの別ページ
  return isKickSlug(seg[0]) ? seg[0] : '';
}

/** 本文の絵文字 [emote:123:KEKW] → KEKW(読み上げ・表示で数字を出さない) @param {unknown} text */
export function stripKickEmotes(text) {
  return String(text ?? '').replace(/\[emote:\d+:([^\]\s]{1,64})\]/g, '$1').replace(/\[emoji:([^\]\s]{1,64})\]/g, '$1');
}

/** Kick の時刻(ISO・または "2025-01-01 12:00:00" の UTC)→ ms。読めなければ 0 @param {unknown} s */
export function parseKickTime(s) {
  const v = String(s || '').trim();
  if (!v) return 0;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v) ? `${v.replace(' ', 'T')}Z` : v;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

/** @param {unknown} v */
function obj(v) {
  return v && typeof v === 'object' ? /** @type {Record<string, any>} */ (v) : null;
}

/**
 * Pusher の1通(文字列)→ { event, channel, data(オブジェクト) }。Pusher の data は JSON 文字列のことが多い。
 * @param {unknown} raw
 * @returns {null | { event: string, channel: string, data: Record<string, any> | null }}
 */
export function parsePusherFrame(raw) {
  let m;
  try {
    m = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  const o = obj(m);
  if (!o || typeof o.event !== 'string') return null;
  let data = o.data;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      data = null;
    }
  }
  return { event: o.event, channel: String(o.channel || ''), data: obj(data) };
}

/** バッジ → ['subscriber', 'moderator', ...] @param {unknown} badges */
function badgeTypes(badges) {
  return Array.isArray(badges) ? badges.map((b) => String(obj(b)?.type || '')).filter(Boolean).slice(0, 8) : [];
}

/**
 * @typedef {{
 *   id: string, channelId: string, name: string, login: string, iconUrl: string, text: string, kind: string,
 *   amount: number, currency: string, badges: string[], ts: string, postedAtMs: number, channel: string, color: string,
 *   subMonths?: number, giftCount?: number, subTier?: string
 * }} KickItem
 */

/**
 * Pusher のイベント1件 → 記録の1件。記録しないイベント・形が違うものは null。
 * @param {{ event: string, channel?: string, data: Record<string, any> | null }} frame
 * @param {{ chatroomId?: string | number, idOfSlug?: (slug: string) => string, nowMs?: number }} [ctx]
 *   idOfSlug: チャットで見た人の slug → user id(サブスク等の通知には id が無いので、同じ人にそろえる)
 * @returns {KickItem | null}
 */
export function parseKickEvent(frame, ctx = {}) {
  const d = frame?.data;
  if (!d) return null;
  const ev = String(frame.event || '').replace(/^App\\Events\\/, '');
  const room = String(ctx.chatroomId ?? '');
  const now = Number(ctx.nowMs) || Date.now();
  // 別のチャットルームの行は捨てる(chatroom_id がある行だけ確かめる)
  if (room && d.chatroom_id != null && String(d.chatroom_id) !== room) return null;
  const personKey = (/** @type {unknown} */ id, /** @type {string} */ slug) => {
    const s = String(id ?? '').trim();
    if (/^\d{1,20}$/.test(s)) return `kk:${s}`;
    const viaChat = slug && ctx.idOfSlug ? String(ctx.idOfSlug(slug) || '') : '';
    if (/^\d{1,20}$/.test(viaChat)) return `kk:${viaChat}`;
    return slug ? `kk:@${slug}` : '';
  };
  const base = { iconUrl: '', badges: /** @type {string[]} */ ([]), ts: '', channel: room, color: '', amount: 0, currency: '' };

  if (ev === 'ChatMessageEvent') {
    const s = obj(d.sender);
    const id = String(d.id || '').trim();
    if (!s || !id) return null;
    const name = String(s.username || '').trim();
    const slug = String(s.slug || '').trim().toLowerCase() || kickSlugOfName(name);
    const text = stripKickEmotes(d.content).trim();
    const channelId = personKey(s.id, slug);
    if (!name || !channelId || !text) return null;
    const identity = obj(s.identity);
    return {
      ...base,
      id: `kk-${id}`,
      channelId,
      name,
      login: slug,
      text,
      kind: 'text',
      badges: badgeTypes(identity?.badges),
      color: /^#[0-9a-f]{6}$/i.test(String(identity?.color || '')) ? String(identity?.color) : '',
      postedAtMs: parseKickTime(d.created_at) || now,
    };
  }

  if (ev === 'SubscriptionEvent') {
    const name = String(d.username || '').trim();
    const slug = kickSlugOfName(name);
    const months = Math.max(1, Math.floor(Number(d.months) || 1));
    const channelId = personKey(d.user_id, slug);
    if (!name || !channelId) return null;
    return {
      ...base,
      id: `kk-sub-${slug || name}-${months}-${Math.floor(now / 60000)}`,
      channelId,
      name,
      login: slug,
      text: months > 1 ? `サブスク(${months}か月目)` : 'サブスク',
      kind: 'membership',
      subMonths: months,
      postedAtMs: now,
    };
  }

  if (ev === 'GiftedSubscriptionsEvent') {
    const name = String(d.gifter_username || '').trim();
    const list = Array.isArray(d.gifted_usernames) ? d.gifted_usernames : [];
    const count = Math.max(1, list.length || Math.floor(Number(d.gifted_count) || 0) || 1);
    const slug = kickSlugOfName(name);
    const channelId = name ? personKey(d.gifter_id, slug) : 'kk:@anonymous';
    return {
      ...base,
      id: `kk-gift-${slug || 'anon'}-${list.slice(0, 3).join(',')}-${count}-${Math.floor(now / 10000)}`,
      channelId,
      name: name || '匿名',
      login: slug,
      text: `ギフトサブを${count}件贈りました`,
      kind: 'membership_gift',
      giftCount: count,
      postedAtMs: now,
    };
  }

  if (ev === 'StreamHostEvent') {
    const name = String(d.host_username || '').trim();
    const slug = kickSlugOfName(name);
    const viewers = Math.max(0, Math.floor(Number(d.number_viewers) || 0));
    const channelId = personKey(null, slug);
    if (!name || !channelId) return null;
    const msg = String(d.optional_message || '').trim();
    return {
      ...base,
      id: `kk-host-${slug}-${Math.floor(now / 60000)}`,
      channelId,
      name,
      login: slug,
      text: `${viewers}人でホストしてきました${msg ? `「${msg}」` : ''}`,
      kind: 'kk_host',
      postedAtMs: now,
    };
  }

  // Kicks(Kick のギフト)。形は非公式の実装からの推定(PC 実測で確かめる)
  if (ev === 'KicksGifted' || ev === 'KicksGiftedEvent') {
    const s = obj(d.sender) || obj(d.user);
    const g = obj(d.gift);
    const amount = Math.max(0, Math.floor(Number(g?.amount ?? d.amount) || 0));
    const name = String(s?.username || d.username || '').trim();
    const slug = String(s?.slug || '').toLowerCase() || kickSlugOfName(name);
    const channelId = personKey(s?.id ?? d.user_id, slug);
    if (!name || !channelId || amount <= 0) return null;
    const gname = String(g?.name || '').trim();
    const msg = stripKickEmotes(d.message).trim();
    const gid = String(g?.gift_id || g?.id || '');
    return {
      ...base,
      id: `kk-kicks-${String(d.id || '') || `${slug}-${gid}-${amount}-${Math.floor(now / 2000)}`}`,
      channelId,
      name,
      login: slug,
      text: msg || (gname ? `${gname}を贈りました` : `${amount} Kicks を贈りました`),
      kind: 'superchat',
      amount,
      currency: 'KICKS',
      postedAtMs: parseKickTime(d.created_at) || now,
    };
  }
  return null;
}

/** 消されたメッセージの id(MessageDeletedEvent)→ 'kk-<id>'。違えば '' @param {{ event: string, data: Record<string, any> | null }} frame */
export function parseKickDeleted(frame) {
  const ev = String(frame?.event || '').replace(/^App\\Events\\/, '');
  if (ev !== 'MessageDeletedEvent') return '';
  const m = obj(frame.data?.message);
  const id = String(m?.id || '').trim();
  return id ? `kk-${id}` : '';
}
