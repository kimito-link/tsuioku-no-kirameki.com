// abParse.js — ABEMA の放送ページが受け取ったコメント JSON を、YouTube 版の記録と同じ形にする(純関数)
// @layer L0 — 純粋計算
//
// ★ページ自身の応答を写す(拡張からコメント用の別ホストへ取りに行かない)。
//   形は 2025-07 に公開された観測(chats/{id}/messages の messages[]・elapsedMs・isPolling)と、
//   それより前の slots/{id}/comments の comments[]。2026-11 時点の本番応答は地域制限で未確認。
//   欠けている欄・知らない形は捨てる。空の配列で既存の記録を消さない(呼び出し側が 0 件なら送らない)。
//
//   since / until は資料によって向きが逆なので、大きい方を新しい端、小さい方を古い端として扱う。
//   画面に出ている分は全部残す。読み上げ(speak)は新しい端から 20 秒以内だけ true。

export const AB_ORIGIN = 'https://abema.tv';
/** 再生位置の近くとみなす幅 */
export const AB_PLAYHEAD_KEEP_MS = 20_000;
/** これ以下の取得窓は、そのまま全部残す */
export const AB_TIGHT_WINDOW_MS = 25_000;

const LOGIN_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const USER_ID_RE = /^[A-Za-z0-9_-]{4,40}$/;
const SESSION_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/** @param {unknown} v */
function obj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? /** @type {Record<string, any>} */ (v) : null;
}
/** @param {unknown} v */
function str(v) {
  return typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '';
}
/** @param {unknown} v */
function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** 配信キーの login として使えるか @param {unknown} s */
export function isAbLogin(s) {
  return LOGIN_RE.test(String(s ?? '').toLowerCase());
}

/**
 * 放送ページの URL → login(n- / e- / p- / s- 付き)。放送ページでなければ ''。
 * @param {unknown} url
 */
export function parseAbLoginFromUrl(url) {
  let u;
  try {
    u = new URL(String(url || ''));
  } catch {
    return '';
  }
  if (!/^(?:www\.)?abema\.tv$/i.test(u.hostname)) return '';
  const path = u.pathname.replace(/\/+$/, '') || '/';
  /** @type {Array<[RegExp, string]>} */
  const rules = [
    [/^\/now-on-air\/([a-z0-9][a-z0-9_-]{0,40})$/i, 'n'],
    [/^\/live-event\/([a-z0-9][a-z0-9_-]{0,40})$/i, 'e'],
    [/^\/video\/episode\/([a-z0-9][a-z0-9_-]{0,60})$/i, 'p'],
  ];
  for (const [re, kind] of rules) {
    const m = re.exec(path);
    if (!m) continue;
    const login = `${kind}-${m[1].toLowerCase()}`;
    return isAbLogin(login) ? login : '';
  }
  const slot = /^\/channels\/([a-z0-9][a-z0-9_-]{0,40})\/slots\/([a-z0-9][a-z0-9_-]{0,40})$/i.exec(path);
  if (!slot) return '';
  const login = `s-${slot[1].toLowerCase()}__${slot[2].toLowerCase()}`;
  return isAbLogin(login) ? login : '';
}

/** login → 放送ページの URL。戻せなければ '' @param {unknown} login */
export function abPageUrl(login) {
  const l = String(login || '').toLowerCase();
  if (!isAbLogin(l)) return '';
  if (l.startsWith('n-')) return `${AB_ORIGIN}/now-on-air/${l.slice(2)}`;
  if (l.startsWith('e-')) return `${AB_ORIGIN}/live-event/${l.slice(2)}`;
  if (l.startsWith('p-')) return `${AB_ORIGIN}/video/episode/${l.slice(2)}`;
  if (l.startsWith('s-')) {
    const rest = l.slice(2);
    const i = rest.indexOf('__');
    if (i <= 0 || i >= rest.length - 2) return '';
    return `${AB_ORIGIN}/channels/${rest.slice(0, i)}/slots/${rest.slice(i + 2)}`;
  }
  return '';
}

/** チャット id の末尾を、配信キーのセッションに使える形へ @param {unknown} chatId */
export function abSessionOfChatId(chatId) {
  const parts = String(chatId || '').toLowerCase().split(/[^a-z0-9_-]+/).filter(Boolean);
  const last = parts[parts.length - 1] || '';
  const m = last.match(/[a-z0-9][a-z0-9_-]{0,39}/);
  return m && SESSION_RE.test(m[0]) ? m[0] : '';
}

/**
 * 配信キー ab.<login>.<session>
 * @param {string} login
 * @param {{ session?: string | null, chatId?: string | null }} [opts]
 */
export function buildAbStreamKey(login, opts = {}) {
  const l = String(login || '').toLowerCase();
  if (!isAbLogin(l)) return '';
  const session = abSessionOfChatId(opts.session || opts.chatId);
  if (!session) return '';
  return `ab.${l}.${session}`;
}

/** @param {unknown} key */
export function isAbStreamKey(key) {
  return /^ab\.[a-z0-9][a-z0-9_-]{1,63}\.[a-z0-9][a-z0-9_-]{0,39}$/.test(String(key || ''));
}

/** 配信キー → login @param {unknown} key */
export function abLoginOfStreamKey(key) {
  const m = String(key || '').match(/^ab\.([a-z0-9][a-z0-9_-]{1,63})\./);
  return m && isAbLogin(m[1]) ? m[1] : '';
}

/** 画像 URL として使ってよいか(https・ABEMA の画像置き場) @param {unknown} url */
export function safeAbImageUrl(url) {
  const s = String(url || '').trim();
  let u;
  try {
    u = new URL(s);
  } catch {
    return '';
  }
  if (u.protocol !== 'https:') return '';
  if (!/(^|\.)abema\.tv$|(^|\.)abema-tv\.com$|(^|\.)abema\.io$|(^|\.)hayabusa\.io$/i.test(u.hostname)) return '';
  return s.length <= 2000 ? s : '';
}

const CHANNEL_ID_RE = /^[a-z0-9][a-z0-9_-]{0,40}$/;

/** ロゴの URL か（チャンネル画像。番組の横長サムネとは分ける） @param {string} url */
function isAbLogoUrl(url) {
  return /\/channels\/logo\/|\/channels\/[^/?#]+\/logo/i.test(url);
}

/** ロゴ URL にチャンネル id が入っていればそれ、無ければ '' @param {string} url */
function logoChannelId(url) {
  const m = String(url || '').match(/\/channels\/([^/?#]+)\/logo/i);
  return m ? m[1].toLowerCase() : '';
}

/** 今のチャンネルのロゴか。別チャンネルのロゴは使わない @param {string} url @param {string} want */
function logoMatches(url, want) {
  if (!isAbLogoUrl(url)) return false;
  if (!want) return true;
  const id = logoChannelId(url);
  return !id || id === want;
}

/**
 * リニア放送の login（n- / s-）かチャンネル id から、チャンネル id だけ取り出す。
 * イベント（e-）やエピソード（p-）からは作らない。
 * @param {unknown} loginOrChannelId
 */
export function abLinearChannelId(loginOrChannelId) {
  const raw = String(loginOrChannelId || '').trim().toLowerCase();
  let id = '';
  if (raw.startsWith('n-') && isAbLogin(raw)) id = raw.slice(2);
  else if (raw.startsWith('s-') && isAbLogin(raw)) {
    const rest = raw.slice(2);
    const cut = rest.indexOf('__');
    id = cut > 0 ? rest.slice(0, cut) : '';
  } else if (!/^[neps]-/.test(raw) && CHANNEL_ID_RE.test(raw)) id = raw;
  return CHANNEL_ID_RE.test(id) ? id : '';
}

/**
 * リニア放送の login（n- / s-）かチャンネル id から、公開されているチャンネルロゴ。
 * 放送ページに画像がまだ無いときの最後の候補。イベントやエピソードの id からは作らない。
 * 2026-11 に image.p-c2-x.abema-tv.com の logo.png が 200 の PNG で返ることを確認した。
 * @param {unknown} loginOrChannelId
 */
export function abChannelLogoUrl(loginOrChannelId) {
  const id = abLinearChannelId(loginOrChannelId);
  if (!id) return '';
  return safeAbImageUrl(
    `https://image.p-c2-x.abema-tv.com/image/channels/${id}/logo.png?format=png&width=320&height=320`
  );
}

/**
 * 配信者カードに残す画像。リニアの ABEMA は、記録が空でも公開のチャンネルロゴにする。
 * ニコニコの既定アイコンは使わない（白い丸のまま残るため）。
 * @param {unknown} videoId
 * @param {unknown} given
 */
export function abBroadcasterIconForStream(videoId, given) {
  const raw = String(given || '').trim();
  const logo = abChannelLogoUrl(abLoginOfStreamKey(videoId));
  if (!logo) return raw;
  if (safeAbImageUrl(raw) && /\/channels\/[^/?#]+\/logo/i.test(raw)) return raw;
  return logo;
}

/** srcset の中から使ってよい ABEMA の画像だけ @param {unknown} raw */
export function abUrlsFromSrcset(raw) {
  /** @type {string[]} */
  const out = [];
  for (const part of String(raw || '').split(',')) {
    const u = safeAbImageUrl(part.trim().split(/\s+/)[0]);
    if (u) out.push(u);
  }
  return out;
}

/** style の url() から使ってよい ABEMA の画像だけ @param {unknown} style */
export function abUrlsFromCss(style) {
  /** @type {string[]} */
  const out = [];
  const re = /url\(\s*(['"]?)(https:[^)'"]+)\1\s*\)/gi;
  let m;
  const text = String(style || '');
  while ((m = re.exec(text))) {
    const u = safeAbImageUrl(m[2]);
    if (u) out.push(u);
  }
  return out;
}

/** @param {unknown} v */
function explicitImage(v) {
  if (typeof v === 'string') return safeAbImageUrl(v);
  const o = obj(v);
  return o ? safeAbImageUrl(o.url || o.href || o.imageUrl) : '';
}

/** @param {Record<string, any>} node */
function joinedThumb(node) {
  const thumb = obj(node.thumbComponent) || obj(node.thumbnailComponent) || obj(node.sceneThumbComponent);
  if (!thumb) return '';
  const direct = explicitImage(thumb.url || thumb.imageUrl || thumb);
  if (direct) return direct;
  const prefix = str(thumb.urlPrefix).replace(/\/+$/, '');
  const file = str(thumb.filename || thumb.name).replace(/^\/+/, '');
  if (!prefix || !file || /^(?:https?:)?\/\//i.test(file)) return '';
  return safeAbImageUrl(`${prefix}/${file}`);
}

/**
 * 番組 JSON から、配信者カード用の画像とチャンネル id。
 * コメントした人の icon は見ない。
 * @param {Record<string, any>} node
 * @returns {{ imageUrl: string, channelId: string }}
 */
function programImage(node) {
  const ch = obj(node.channel) || obj(node.channelInfo);
  const rawId = str(ch?.id || node.channelId).toLowerCase();
  const channelId = CHANNEL_ID_RE.test(rawId) && !/^[neps]-/.test(rawId) ? rawId : '';
  const logo = explicitImage(ch?.logoUrl || ch?.logo || ch?.thumbnailUrl || ch?.thumbnail || ch?.image || node.logoUrl || node.channelLogo);
  const thumb = joinedThumb(node)
    || explicitImage(node.thumbnailUrl || node.thumbUrl || node.imageUrl || node.image || node.thumbnail);
  return { imageUrl: logo || thumb, channelId };
}

/**
 * 配信者カードに出す 1 枚。ページに出ているチャンネルロゴ、番組の og:image、
 * ページ自身の応答に入っていた画像、最後にリニアの公開ロゴ、の順。
 * コメントした人の顔はここでは選ばない（ABEMA のコメントに絵は無く、描画側の生成顔のまま）。
 * @param {{ login?: string, channelId?: string, apiImage?: string, metas?: Array<{ property?: string, name?: string, content?: string }>, images?: string[] }} [src]
 */
export function pickAbBroadcasterImage(src = {}) {
  const images = (Array.isArray(src.images) ? src.images : []).map((u) => safeAbImageUrl(u)).filter(Boolean);
  const api = safeAbImageUrl(src.apiImage);
  let og = '';
  for (const m of Array.isArray(src.metas) ? src.metas : []) {
    const key = str(m?.property || m?.name).toLowerCase();
    if (key !== 'og:image' && key !== 'og:image:secure_url' && key !== 'twitter:image') continue;
    const u = safeAbImageUrl(m?.content);
    if (u) {
      og = u;
      break;
    }
  }
  const want = abLinearChannelId(src.channelId) || abLinearChannelId(src.login);
  const logo = images.find((u) => logoMatches(u, want)) || (api && logoMatches(api, want) ? api : '');
  if (logo) return logo;
  // リニアは番組の横長サムネより、公開されているチャンネルロゴを先に出す。
  const built = abChannelLogoUrl(src.channelId) || abChannelLogoUrl(src.login);
  if (built) return built;
  if (og) return og;
  if (api) return api;
  const thumb = images.find((u) => /\/programs\/|thumb/i.test(u));
  if (thumb) return thumb;
  return '';
}

/**
 * チャンネルや番組の JSON か。コメントの口とは別に、ロゴだけ受け取る。
 * 画像ファイルそのもの（/image/ や画像用ホスト）は JSON ではないので含めない。
 * @param {unknown} url
 */
export function isAbBroadcastJsonUrl(url) {
  let u;
  try {
    u = new URL(String(url || ''), AB_ORIGIN);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  if (!/(^|\.)abema\.tv$|(^|\.)abema-tv\.com$|(^|\.)abema\.io$/i.test(u.hostname)) return false;
  if (/^image\.|^img\.|hayabusa/i.test(u.hostname)) return false;
  if (u.pathname.startsWith('/image/')) return false;
  if (/\/comments(?:\/|$)/.test(u.pathname)) return false;
  if (/\/stats(?:\/|$)/.test(u.pathname)) return true;
  return /\/(?:channels|slots|media|programs|broadcasts?|liveEvents|live-events)(?:\/|$)/.test(u.pathname);
}

/**
 * コメントした人の icon は見ずに、チャンネルロゴか番組画像だけ拾う。
 * コメントの束と同じ JSON にロゴが入っていても拾える。
 * @param {unknown} raw
 * @returns {{ imageUrl: string, channelId: string }}
 */
export function abBroadcastImage(raw) {
  const root = unwrap(raw);
  if (!root) return { imageUrl: '', channelId: '' };
  const slot = obj(root.slot) || obj(root.liveEvent) || obj(root.event) || obj(root.program) || obj(root.episode);
  const pic = slot ? programImage(slot) : { imageUrl: '', channelId: '' };
  const rootPic = programImage(root);
  return {
    imageUrl: pic.imageUrl || rootPic.imageUrl,
    channelId: pic.channelId || rootPic.channelId,
  };
}

/**
 * 0 以上の視聴数。空や桁あふれは null。0 は欄があるときだけ。
 * @param {Record<string, any>} node
 * @param {readonly string[]} keys
 */
function pickCount(node, keys) {
  for (const k of keys) {
    if (node[k] == null || node[k] === '') continue;
    const n = Number(node[k]);
    if (Number.isFinite(n) && n >= 0 && n <= 50_000_000) return Math.floor(n);
  }
  return null;
}

/**
 * 番組詳細の「3.7万」を数にする。視聴の単位が付いていないただの整数は、コメント件数と紛れるので null。
 * @param {unknown} text
 * @returns {number|null}
 */
export function abCompactCount(text) {
  const s = String(text || '').replace(/,/g, '').replace(/\s+/g, '');
  const m = s.match(/^(\d+(?:\.\d+)?)(万|億)(?:回|再生|視聴)?$/);
  if (!m) return null;
  let n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  if (m[2] === '万') n *= 10_000;
  if (m[2] === '億') n *= 100_000_000;
  if (n < 0 || n > 50_000_000) return null;
  return Math.round(n);
}

/**
 * 画面の短い文字から視聴数を1つ。近くに「視聴」とあればそれを、無ければ「万」「億」が1つだけのとき。
 * @param {ReadonlyArray<{ text?: string, label?: string }>} snippets
 * @returns {number|null}
 */
export function abViewsFromSnippets(snippets) {
  /** @type {number|null} */
  let labeled = null;
  /** @type {number[]} */
  const compact = [];
  for (const s of Array.isArray(snippets) ? snippets : []) {
    const n = abCompactCount(s?.text);
    if (n == null) continue;
    if (/視聴/.test(String(s?.label || ''))) {
      labeled = n;
      break;
    }
    compact.push(n);
  }
  if (labeled != null) return labeled;
  return compact.length === 1 ? compact[0] : null;
}

/**
 * JSON の視聴数と、画面に出ている視聴数。大きく違うときは画面の数（おすすめ欄の別番組を拾わない）。
 * @param {unknown} jsonCount
 * @param {unknown} domCount
 * @returns {number|null}
 */
export function abPreferViewCount(jsonCount, domCount) {
  const ok = (/** @type {unknown} */ v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 50_000_000 ? Math.floor(n) : null;
  };
  const j = ok(jsonCount);
  const d = ok(domCount);
  if (j == null) return d;
  if (d == null) return j;
  const ratio = j / Math.max(1, d);
  if (ratio < 0.5 || ratio > 2) return d;
  return j;
}

/**
 * ページが受け取る視聴数。`stats.view` は番組の視聴数（3.7万の元）で、同時接続ではない。
 * `concurrentViewers` と `audienceCount` だけを同時接続にする。コメントの icon は見ない。
 * @param {unknown} raw
 * @returns {{ views: number|null, concurrent: number|null, comments: number|null }}
 */
export function abAudienceFromPayload(raw) {
  const root = unwrap(raw);
  const none = { views: /** @type {number|null} */ (null), concurrent: /** @type {number|null} */ (null), comments: /** @type {number|null} */ (null) };
  if (!root) return none;
  /** @type {Record<string, any>[]} */
  const nodes = [];
  const push = (/** @type {unknown} */ v) => {
    const o = obj(v);
    if (o) nodes.push(o);
  };
  push(root.stats);
  if (!Array.isArray(root.messages) && !Array.isArray(root.comments)) push(root);
  for (const key of ['slot', 'liveEvent', 'event', 'program', 'episode']) {
    const n = obj(root[key]);
    if (!n) continue;
    push(n.stats);
    push(n.playback);
    push(n.realtime);
    push(n);
  }
  let views = /** @type {number|null} */ (null);
  let concurrent = /** @type {number|null} */ (null);
  let comments = /** @type {number|null} */ (null);
  for (const node of nodes) {
    if (views == null) views = pickCount(node, ['view', 'views', 'viewCount', 'viewers', 'viewerCount']);
    if (concurrent == null) concurrent = pickCount(node, ['concurrentViewers', 'audienceCount']);
    if (comments == null) comments = pickCount(node, ['comment', 'comments', 'commentCount']);
  }
  return { views, concurrent, comments };
}

/**
 * ページの応答を、コメントの束と番組情報に分ける。
 * コメントの束にチャンネルロゴが同居していても、ロゴは meta に残す（コメントの icon には入れない）。
 * @param {unknown} raw
 * @returns {{ batch: { chatId: string, isPolling: boolean | null, pollingIntervalSec: number | null, messages: any[] } | null, meta: { title: string, startedAtMs: number | null, viewers: number | null, views: number | null, concurrent: number | null, comments: number | null, imageUrl: string, channelId: string } | null } | null}
 */
export function abPayloadNotices(raw) {
  const shrunk = shrinkAbPayload(raw);
  const pic = abBroadcastImage(raw);
  const audience = abAudienceFromPayload(raw);
  const metaBase = shrunk && shrunk.meta ? shrunk.meta : null;
  const imageUrl = pic.imageUrl || (metaBase ? metaBase.imageUrl : '') || '';
  const channelId = pic.channelId || (metaBase ? metaBase.channelId : '') || '';
  const batch = shrunk && Array.isArray(shrunk.messages)
    ? {
        chatId: String(shrunk.chatId || ''),
        isPolling: shrunk.isPolling ?? null,
        pollingIntervalSec: shrunk.pollingIntervalSec ?? null,
        messages: shrunk.messages,
      }
    : null;
  const hasAudience = audience.views != null || audience.concurrent != null || audience.comments != null;
  const meta = metaBase || imageUrl || channelId || hasAudience
    ? {
        title: metaBase ? metaBase.title : '',
        startedAtMs: metaBase ? metaBase.startedAtMs : null,
        viewers: metaBase ? metaBase.viewers : null,
        views: audience.views,
        concurrent: audience.concurrent,
        comments: audience.comments,
        imageUrl,
        channelId,
      }
    : null;
  if (!batch && !meta) return null;
  return { batch, meta };
}

/**
 * コメント取得の URL か(ページ自身が開く口)。放送ページそのものは含めない。
 * @param {unknown} url
 */
export function isAbCommentUrl(url) {
  let u;
  try {
    u = new URL(String(url || ''), AB_ORIGIN);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'wss:') return false;
  if (!/(^|\.)abema\.tv$|(^|\.)abema-tv\.com$|(^|\.)abema\.io$/i.test(u.hostname)) return false;
  const p = u.pathname;
  if (/\/v1\/chats\/[^/]+\/messages/.test(p)) return true;
  if (/\/comments(?:\/|$)/.test(p)) return true;
  if (/\/v1\/(?:slots|liveEvents|live-events|video\/programs|broadcasts?)(?:\/|$)/.test(p)) return true;
  return false;
}

/** 取得 URL の since / until(無ければ null)。向きは呼び出し側で大きい方を新しい端にする @param {unknown} url */
export function abCommentWindowFromUrl(url) {
  let u;
  try {
    u = new URL(String(url || ''), AB_ORIGIN);
  } catch {
    return { sinceMs: null, untilMs: null };
  }
  return { sinceMs: numOrNull(u.searchParams.get('since')), untilMs: numOrNull(u.searchParams.get('until')) };
}

/** パスにチャット id があればセッションへ @param {unknown} url */
export function abChatIdFromUrl(url) {
  let u;
  try {
    u = new URL(String(url || ''), AB_ORIGIN);
  } catch {
    return '';
  }
  const m = /\/v1\/chats\/([^/]+)\/messages|\/v1\/slots\/([^/]+)\/comments/.exec(u.pathname);
  const raw = m ? (m[1] || m[2] || '') : '';
  if (!raw) return '';
  try {
    return abSessionOfChatId(decodeURIComponent(raw));
  } catch {
    return abSessionOfChatId(raw);
  }
}

/** @param {Record<string, any>} m */
function pickName(m) {
  const user = obj(m.user);
  const profile = obj(m.profile) || obj(user?.profile);
  const candidates = [
    m.name, m.userName, m.displayName, m.nickname, m.screenName,
    user?.name, user?.displayName, user?.nickname,
    profile?.name, profile?.displayName,
  ];
  for (const c of candidates) {
    const s = str(c).replace(/\s+/g, ' ').trim();
    if (!s || s.length > 40 || /[<>]/.test(s)) continue;
    return s;
  }
  return '';
}

/** @param {Record<string, any>} m */
function pickIcon(m) {
  const user = obj(m.user);
  const profile = obj(m.profile) || obj(user?.profile);
  return str(m.iconUrl || m.icon || m.thumbnailUrl || m.profileImage || user?.iconUrl || user?.thumbnailUrl || profile?.iconUrl || profile?.thumbnailUrl);
}

/** @param {Record<string, any>} m @param {string} userId @param {number | null} elapsed @param {string} text */
function messageKey(m, userId, elapsed, text) {
  const chat = str(m.chatArin || m.chatId);
  const arin = str(m.arin);
  if (arin && arin !== chat && /^[A-Za-z0-9_.:-]{4,200}$/.test(arin)) return arin;
  const id = str(m.id || m.key);
  if (id && /^[A-Za-z0-9_.:-]{4,200}$/.test(id)) return id;
  const head = text.slice(0, 40);
  if (!head) return '';
  return `${userId}:${elapsed == null ? 'x' : Math.floor(elapsed)}:${head}`;
}

/**
 * @param {unknown} raw
 * @returns {{ key: string, userId: string, name: string, iconUrl: string, text: string, elapsedMs: number | null, createdAtMs: number | null, chatId: string } | null}
 */
function normalizeMessage(raw) {
  const m = obj(raw);
  if (!m) return null;
  const text = str(m.body ?? m.message ?? m.text ?? m.comment).replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!text) return null;
  const user = obj(m.user);
  const userId = str(m.userId || user?.id || user?.userId);
  if (!USER_ID_RE.test(userId) || /^(?:system|admin|official)$/i.test(userId)) return null;
  const elapsed = numOrNull(m.elapsedMs);
  const key = messageKey(m, userId, elapsed, text);
  if (!key) return null;
  return {
    key,
    userId,
    name: pickName(m) || userId,
    iconUrl: safeAbImageUrl(pickIcon(m)),
    text,
    elapsedMs: elapsed != null && elapsed < 1e12 ? elapsed : null,
    createdAtMs: clockMs(m.createdAtMs),
    chatId: abSessionOfChatId(m.chatArin || m.chatId),
  };
}

/** @param {unknown} raw */
function unwrap(raw) {
  const root = obj(raw);
  if (!root) return null;
  const data = obj(root.data);
  if (data && (Array.isArray(data.messages) || Array.isArray(data.comments) || data.slot || data.liveEvent || data.event)) return data;
  return root;
}

/**
 * コメントの束。形が違うときは null。配列が空でも、コメントの口なら { messages: [] } を返す。
 * @param {unknown} raw
 */
export function parseAbCommentBatch(raw) {
  const root = unwrap(raw);
  if (!root) return null;
  const list = Array.isArray(root.messages) ? root.messages : Array.isArray(root.comments) ? root.comments : null;
  if (!list) return null;
  /** @type {NonNullable<ReturnType<typeof normalizeMessage>>[]} */
  const messages = [];
  let chatId = abSessionOfChatId(root.chatArin || root.chatId);
  for (const item of list) {
    const m = normalizeMessage(item);
    if (!m) continue;
    if (!chatId && m.chatId) chatId = m.chatId;
    messages.push(m);
  }
  const polling = numOrNull(root.pollingInterval);
  return {
    chatId,
    isPolling: typeof root.isPolling === 'boolean' ? root.isPolling : null,
    pollingIntervalSec: polling != null && polling < 3600 ? polling : null,
    messages,
  };
}

/**
 * 番組情報。コメントの束は番組情報にしない。
 * @param {unknown} raw
 * @returns {{ title: string, startedAtMs: number | null, viewers: number | null, imageUrl: string, channelId: string } | null}
 */
export function parseAbProgramMeta(raw) {
  const root = unwrap(raw);
  if (!root || Array.isArray(root.messages) || Array.isArray(root.comments)) return null;
  const slot = obj(root.slot) || obj(root.liveEvent) || obj(root.event) || obj(root.program) || obj(root.episode);
  const src = slot || root;
  if (src.body && src.userId && !src.title) return null;
  const title = str(src.title || src.displayName || (!slot ? '' : root.title)).replace(/\s*[|｜]\s*ABEMA\s*$/i, '').slice(0, 200);
  const cleanTitle = title && title !== 'ABEMA' && title !== 'エラー' ? title : '';
  const startedAtMs = clockMs(src.startAt ?? src.startedAt ?? src.startTime ?? root.startAt);
  const viewers = viewersOf(src.realtime) ?? viewersOf(src.playback) ?? viewersOf(src) ?? viewersOf(root);
  const pic = programImage(src);
  const rootPic = src === root ? pic : programImage(root);
  const imageUrl = pic.imageUrl || rootPic.imageUrl;
  const channelId = pic.channelId || rootPic.channelId;
  if (!cleanTitle && !startedAtMs && viewers == null && !imageUrl && !channelId) return null;
  return { title: cleanTitle, startedAtMs, viewers, imageUrl, channelId };
}

/** @param {unknown} v */
function clockMs(v) {
  const n = numOrNull(v);
  if (n == null || n <= 0) return null;
  if (n > 1e12) return Math.floor(n);
  if (n > 1e9) return Math.floor(n * 1000);
  return null;
}

/** @param {unknown} v */
function viewersOf(v) {
  const o = obj(v);
  if (!o) return null;
  for (const k of ['viewers', 'viewerCount', 'concurrentViewers']) {
    if (o[k] == null || o[k] === '') continue;
    const n = Number(o[k]);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return null;
}

/**
 * 届いたコメントは全部残す。時刻は createdAtMs（壁時計）を優先し、無ければ elapsedMs。
 * 新しい順でも古い順でも時刻で並べる。speak は新しい端から 20 秒以内だけ true
 * （最初の limit=100 に混ざる 1 時間分は記録するが、読み上げには流さない）。
 * since が壁時計なら createdAtMs と、番組内の経過なら elapsedMs と比べる。
 * 時刻が無い束は、ABEMA の新しい順に合わせて先頭 20 件まで（それらは speak）。
 * @param {ReadonlyArray<{ elapsedMs?: number | null, createdAtMs?: number | null }>} messages
 * @param {{ sinceMs?: number | null, untilMs?: number | null }} [win]
 */
export function abMessagesNearPlayhead(messages, win = {}) {
  const list = Array.isArray(messages) ? messages.slice() : [];
  const axis = list.some((m) => m && m.createdAtMs != null) ? 'created' : 'elapsed';
  /** @param {any} m */
  const atOf = (m) => {
    if (!m) return null;
    return axis === 'created' ? numOrNull(m.createdAtMs) : numOrNull(m.elapsedMs);
  };
  /** @param {any[]} rows @param {(m: any) => boolean} speakOf */
  const tag = (rows, speakOf) => rows.map((m) => ({ ...m, speak: speakOf(m) }));
  const known = list.filter((m) => atOf(m) != null);
  if (!known.length) return tag(list.length > 20 ? list.slice(0, 20) : list.slice(), () => true);
  /** @type {number[]} */
  const times = known.map((m) => /** @type {number} */ (atOf(m)));
  const newest = Math.max(...times);
  const oldest = Math.min(...times);
  const epoch = newest > 1e12;
  /** @type {number[]} */
  const bounds = [numOrNull(win.sinceMs), numOrNull(win.untilMs)].filter((n) => n != null && (epoch ? n > 1e12 : n <= 1e12));
  let head = newest;
  let span = newest - oldest;
  if (bounds.length >= 2) {
    head = Math.max(bounds[0], bounds[1]);
    span = Math.abs(bounds[0] - bounds[1]);
  } else if (bounds.length === 1) {
    const edge = bounds[0];
    if (newest > edge + AB_PLAYHEAD_KEEP_MS) {
      head = newest;
      span = newest - Math.min(edge, oldest);
    } else {
      head = Math.max(edge, newest);
      span = head - Math.min(edge, oldest);
    }
  }
  const ordered = known.slice().sort((a, b) => /** @type {number} */ (atOf(a)) - /** @type {number} */ (atOf(b)));
  if (span <= AB_TIGHT_WINDOW_MS) return tag(ordered, () => true);
  const lo = head - AB_PLAYHEAD_KEEP_MS;
  const hi = head + 5000;
  return tag(ordered, (m) => {
    const at = atOf(m);
    return at != null && at >= lo && at <= hi;
  });
}

/**
 * 記録の 1 件。投稿時刻は createdAtMs。無いときはいま。
 * speak が false の過去分は skipVoice（記録はする。読み上げと PICK UP には流さない）。
 * @param {{ key?: string, userId?: string, name?: string, iconUrl?: string, text?: string, createdAtMs?: number | null, speak?: boolean }} msg
 * @param {{ pageLogin?: string, nowMs?: number }} ctx
 */
export function abCommentRow(msg, ctx) {
  if (!msg || !msg.key || !msg.userId || !msg.text) return null;
  if (!USER_ID_RE.test(msg.userId)) return null;
  const idPart = String(msg.key).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
  if (idPart.length < 4) return null;
  const now = Number(ctx.nowMs) > 0 ? Number(ctx.nowMs) : Date.now();
  const created = clockMs(msg.createdAtMs);
  return {
    id: `ab-${idPart}`,
    channelId: `ab:${msg.userId}`,
    name: String(msg.name || msg.userId).slice(0, 40),
    login: '',
    // コメント応答に絵は無い。チャンネル画像をここへ入れない（描画側の生成顔のまま）。
    iconUrl: safeAbImageUrl(msg.iconUrl),
    badges: /** @type {string[]} */ ([]),
    ts: '',
    postedAtMs: created != null ? created : now,
    channel: String(ctx.pageLogin || ''),
    color: '',
    text: String(msg.text).slice(0, 500),
    kind: 'text',
    amount: 0,
    currency: '',
    skipVoice: msg.speak === false,
  };
}

/**
 * hello までの控え。コメントの束は番組情報で押し出さない（最初の一覧を落とさない）。
 * コメントの束は新しい方を最大 8 件残す。全体は limit 件までで、溢れたら番組情報から捨てる。
 * @param {any[]} backlog
 * @param {any} msg
 * @param {number} [limit]
 */
export function enqueueAbMainBacklog(backlog, msg, limit = 40) {
  const next = (Array.isArray(backlog) ? backlog.slice() : []).concat([msg]);
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 40;
  /** @param {any} m */
  const isComment = (m) => Boolean(m && m.t === 'batch' && Array.isArray(m.body?.messages) && m.body.messages.length > 0);
  let commentCount = 0;
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (!isComment(next[i])) continue;
    commentCount += 1;
    if (commentCount > 8) next.splice(i, 1);
  }
  while (next.length > cap) {
    const i = next.findIndex((m) => !isComment(m));
    if (i < 0) break;
    next.splice(i, 1);
  }
  return next;
}

/**
 * ページの応答から、記録に要る欄だけ残す。認可ヘッダや知らない大きな JSON は落とす。
 * @param {unknown} raw
 */
export function shrinkAbPayload(raw) {
  const batch = parseAbCommentBatch(raw);
  if (batch && (batch.messages.length || batch.chatId || batch.isPolling != null || batch.pollingIntervalSec != null)) {
    return {
      chatId: batch.chatId,
      isPolling: batch.isPolling,
      pollingIntervalSec: batch.pollingIntervalSec,
      messages: batch.messages.map((m) => ({
        key: m.key,
        userId: m.userId,
        name: m.name,
        iconUrl: m.iconUrl,
        text: m.text,
        elapsedMs: m.elapsedMs,
        createdAtMs: m.createdAtMs,
        chatId: m.chatId,
      })),
    };
  }
  const meta = parseAbProgramMeta(raw);
  if (meta) return { meta };
  return null;
}
