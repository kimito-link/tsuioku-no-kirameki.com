// tcParse.js — ツイキャス(twitcasting.tv)の配信・コメント・ギフトを、YouTube 版の記録と同じ形にする(純関数)
// @layer L0 — 純粋計算
//
// ★council/twitcasting-support-PLAN.md。公式 API v2 はアプリ登録(OAuth)が要るので使わない。ページ自身が使う口を読む。
//   形が違う・欠けている1件は null を返して捨てる(AGENTS.md §3.6)。
//   - 配信中か・movie id: GET https://twitcasting.tv/streamserver.php?target=<user>&mode=client&player=pc_web
//       → { movie: { id, live }, ... }(未配信の応答には前の配信の id が残るので live だけを見る)
//   - コメントの口: POST https://twitcasting.tv/eventpubsuburl.php(form movie_id)→ { url: "wss://….twitcasting.tv/event.pubsub/v1/streams/<id>/events?token=…&n=…" }
//       署名は約1時間で切れる → つなぎ直すたびに取り直す。ギフトはページと同じく &gift=1 を足したときだけ来る。
//   - ソケット: 1通が JSON の配列。10秒何も無いと [] が来る(生きている印)。形は 2026-11-12 の PC 実測(本物・ログインなし)。
//       comment: { type, id(数), message, createdAt(ms), author{ id, name, screenName, profileImage, grade }, isAnonymous?, numComments(累計) }
//         匿名は author.id が c:tw1〜c:tw3 などで、大勢が同じ id を使う(人を見分けられない)→ 1つの席にまとめる。
//       gift:    { type, id(文字), message("言葉(+🍡90)"), plainMessage(言葉だけ), isPaidGift, item{ name, image, showsSenderInfo },
//                  sender{ id, name, screenName, profileImage }, createdAt, score_items:[{ title:'🍡', text:'90' }] }
//         ギフトの数はページに出ている 🍡(スコア)。有料ギフト(お茶爆100 等)は text が「✨」で数が出ない。匿名ギフトの sender.id は twitcastinguest。
//       raid(みんなで移動)なども来るが記録しない。
//   出す形は他サービスと同じ: { id, channelId:'tc:<screenName>', name, login(screenName), iconUrl, text, kind, amount, currency,
//   badges, ts:'', postedAtMs, channel(user), color, giftName?, giftImageUrl?, giftCount? }

export const TC_ORIGIN = 'https://twitcasting.tv';
/**
 * ツイキャスのギフトの数え方 = ページに出ている 🍡(スコア・score_items)。円やコインの値段は配信の口に出ない(2026-11-12 PC 実測)。
 *   画面では「90 🍡」。有料ギフトは 🍡 が「✨」で数が無いので 0(名前と個数は残す)。
 */
export const TC_CURRENCY = 'TCSCORE';

/** ページの最初の区切りに来るが、人のページではない名前 */
const RESERVED = new Set([
  'about', 'help', 'search', 'portal', 'login', 'logout', 'signup', 'settings', 'setting', 'account', 'mypage', 'notification',
  'notifications', 'ranking', 'rankings', 'category', 'categories', 'live', 'lives', 'movie', 'movies', 'shop', 'store', 'item',
  'items', 'gift', 'gifts', 'support', 'supporter', 'privacy', 'terms', 'company', 'contact', 'news', 'blog', 'event', 'events',
  'app', 'apps', 'download', 'premier', 'tickets', 'ticket', 'img', 'image', 'images', 'css', 'js', 'static', 'api', 'embed',
  'indexcaslive', 'index', 'home', 'top', 'feed', 'feeds', 'tag', 'tags', 'user', 'users', 'group', 'groups', 'mail', 'inquiry',
]);

/**
 * 配信者の名前(ページ /<user> の user)として正しいか。c: / g: / f: / ig: / tw: などの頭が付くことがある。
 * @param {unknown} s
 */
export function isTcUser(s) {
  const v = String(s ?? '');
  if (!/^(?:[a-z]{1,3}:)?[a-z0-9_]{1,40}$/i.test(v)) return false;
  return !RESERVED.has(v.toLowerCase());
}

/**
 * ページの URL → 配信者の名前(小文字)。配信者のページ(/<user> または /<user>/ ・/<user>/broadcaster はのぞく)でなければ ''。
 *   録画(/<user>/movie/<id>)は配信中の口ではないので ''。
 * @param {unknown} url
 */
export function parseTcUserFromUrl(url) {
  let u;
  try {
    u = new URL(String(url || ''));
  } catch {
    return '';
  }
  if (!/^(?:www\.)?twitcasting\.tv$/i.test(u.hostname)) return '';
  let path = u.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    return '';
  }
  const m = /^\/([^/]+)\/?$/.exec(path);
  if (!m) return '';
  const user = m[1].toLowerCase();
  return isTcUser(user) ? user : '';
}

/** @param {string} user */
export function tcStreamServerUrl(user) {
  return isTcUser(user) ? `${TC_ORIGIN}/streamserver.php?target=${encodeURIComponent(user)}&mode=client&player=pc_web` : '';
}
export const TC_PUBSUB_URL = `${TC_ORIGIN}/eventpubsuburl.php`;

/** @param {unknown} v */
function obj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? /** @type {Record<string, any>} */ (v) : null;
}
/** @param {unknown} v */
function str(v) {
  return typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '';
}

/** 秒でも ms でも ms(読めなければ 0) @param {unknown} v */
export function tcTimeMs(v) {
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

/** 画像の URL として使ってよいか(https・ツイキャスの画像置き場) @param {unknown} url */
export function safeTcImageUrl(url) {
  let s = String(url || '').trim();
  if (s.startsWith('//')) s = `https:${s}`;
  let u;
  try {
    u = new URL(s);
  } catch {
    return '';
  }
  if (u.protocol !== 'https:') return '';
  if (!/(^|\.)twitcasting\.tv$|(^|\.)twimg\.com$|(^|\.)imagegw\.net$|(^|\.)cloudfront\.net$/i.test(u.hostname)) return '';
  return u.href;
}

/**
 * streamserver.php → { movieId, isLive }。形が違えば null。
 *   未配信の応答にも前の配信の id が入っていることがある(id だけで配信中と決めない)。
 * @param {unknown} json
 */
export function parseTcStreamServer(json) {
  const o = obj(json);
  const mv = obj(o?.movie);
  if (!mv || typeof mv.live !== 'boolean') return null;
  const id = str(mv.id);
  const ok = /^\d{1,20}$/.test(id) && id !== '0';
  return { movieId: ok ? id : '', isLive: mv.live === true && ok };
}

/**
 * eventpubsuburl.php → ソケットの URL(ギフトも来るように gift=1 を足す)。ツイキャスの wss でなければ ''。
 * @param {unknown} json
 */
export function parseTcPubSubUrl(json) {
  const s = str(obj(json)?.url);
  let u;
  try {
    u = new URL(s);
  } catch {
    return '';
  }
  if (u.protocol !== 'wss:' || !/(^|\.)twitcasting\.tv$/i.test(u.hostname)) return '';
  if (!/^\/event\.pubsub\/v1\/streams\/\d{1,20}\/events$/.test(u.pathname)) return '';
  if (!u.searchParams.has('gift')) u.searchParams.set('gift', '1');
  return u.href;
}

/** ソケットの1通 → 行の配列(読めなければ空・[] は生きている印) @param {unknown} raw @returns {Record<string, any>[]} */
export function parseTcSocketFrame(raw) {
  const s = String(raw ?? '').trim();
  if (!s || (s[0] !== '{' && s[0] !== '[')) return [];
  try {
    const v = JSON.parse(s);
    return /** @type {Record<string, any>[]} */ ((Array.isArray(v) ? v : [v]).map(obj).filter(Boolean));
  } catch {
    return [];
  }
}

/** @param {unknown} v */
export function tcTypeOf(v) {
  return str(obj(v)?.type).slice(0, 40);
}

/**
 * 人(author / sender)→ { key, name, login, iconUrl }。形が違えば null。
 *   人のページは screenName(c:xxx 等)。id は数字のこともある。人キーは screenName を優先(ページへのリンクに使える)
 * @param {unknown} v
 */
function tcPerson(v) {
  const p = obj(v);
  if (!p) return null;
  const screen = str(p.screenName ?? p.screen_id ?? p.screenId);
  const id = str(p.id);
  const login = isTcUser(screen) ? screen : isTcUser(id) ? id : '';
  const key = login || (/^[A-Za-z0-9:_-]{1,64}$/.test(id) ? id : '');
  if (!key) return null;
  const name = str(p.name ?? p.displayName ?? p.display_name).slice(0, 80) || login || `ツイキャス${key.slice(-4)}`;
  return { key: key.toLowerCase(), name, login, iconUrl: safeTcImageUrl(p.profileImage ?? p.profile_image ?? p.image) };
}

/** 「お茶ｘ10」「お茶x10」「お茶×10」の個数(無ければ 1) @param {string} name */
export function tcGiftCountOfName(name) {
  const m = /[xｘ×✕]\s*([0-9０-９]{1,6})\s*$/.exec(String(name || ''));
  if (!m) return 1;
  const n = Number(m[1].replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)));
  return Number.isFinite(n) && n > 0 ? Math.min(100000, Math.floor(n)) : 1;
}

/**
 * ギフトの 🍡(スコア)。score_items の 🍡 の数。無い・「✨」(有料ギフト)なら message の「+🍡N」、それも無ければ 0。
 * @param {Record<string, any>} c
 */
export function tcGiftScore(c) {
  for (const it of Array.isArray(c?.score_items) ? c.score_items : []) {
    const r = obj(it);
    if (!r || str(r.title) !== '🍡') continue;
    const t = str(r.text).replace(/[,，]/g, '');
    if (/^\d{1,9}$/.test(t)) return Number(t);
  }
  const m = /\+\s*🍡\s*([\d,]{1,12})/.exec(str(c?.message));
  return m ? Number(m[1].replace(/,/g, '')) : 0;
}

/**
 * コメントかギフト1件 → 記録の1件(ギフトに言葉が付いていても1件にまとめる)。記録しないもの・形が違うものは null。
 * @param {unknown} raw
 * @param {{ user: string, nowMs?: number }} ctx
 */
export function parseTcEvent(raw, ctx) {
  const c = obj(raw);
  if (!c) return null;
  const type = tcTypeOf(c);
  if (type !== 'comment' && type !== 'gift') return null;
  const id = str(c.id);
  if (!/^[A-Za-z0-9.:_-]{1,96}$/.test(id)) return null;
  const postedAtMs = tcTimeMs(c.createdAt ?? c.created_at) || Number(ctx.nowMs) || Date.now();
  if (type === 'comment') {
    const who = tcPerson(c.author ?? c.from_user ?? c.fromUser);
    if (!who) return null;
    // 匿名は大勢が同じ id(c:tw1 等)を使うので、人として数えず1つの席にまとめる
    const anonC = c.isAnonymous === true || /^c:tw\d{1,3}$/.test(who.key);
    const text = str(c.message).replace(/\s+/g, ' ').slice(0, 500);
    if (!text) return null;
    return {
      id: `tc-${id}`,
      channelId: anonC ? 'tc:n:匿名' : `tc:${who.key}`,
      name: anonC ? who.name || '匿名' : who.name,
      login: anonC ? '' : who.login,
      iconUrl: anonC ? '' : who.iconUrl,
      badges: anonC ? ['anonymous'] : /** @type {string[]} */ ([]),
      ts: '',
      postedAtMs,
      channel: String(ctx.user || ''),
      color: '',
      text,
      kind: 'text',
      amount: 0,
      currency: '',
    };
  }
  const item = obj(c.item);
  // 配信者自身の「スコアのお知らせ」(showsSenderInfo が false)は贈り物ではないので記録しない
  if (!item || item.showsSenderInfo === false) return null;
  const giftName = str(item.name).slice(0, 60);
  if (!giftName) return null;
  const person = tcPerson(c.sender);
  // 匿名さん(sender.id = twitcastinguest)は誰か分からないので1つの席にまとめる
  const anon = !person || person.key === 'twitcastinguest';
  const who = anon ? null : person;
  const count = tcGiftCountOfName(giftName);
  const score = tcGiftScore(c);
  const words = str(c.plainMessage).replace(/\s+/g, ' ').slice(0, 500);
  const senderName = !who ? str(obj(c.sender)?.name).slice(0, 80) || '匿名さん' : who.name;
  return {
    id: `tc-g-${id}`,
    channelId: !who ? 'tc:n:匿名' : `tc:${who.key}`,
    name: senderName,
    login: !who ? '' : who.login,
    iconUrl: !who ? '' : who.iconUrl,
    badges: c.isPaidGift === true ? ['paid'] : [],
    ts: '',
    postedAtMs,
    channel: String(ctx.user || ''),
    color: '',
    text: words || giftName,
    kind: 'superchat',
    amount: score,
    currency: TC_CURRENCY,
    giftName,
    ...(safeTcImageUrl(item.image) ? { giftImageUrl: safeTcImageUrl(item.image) } : {}),
    ...(count > 1 ? { giftCount: count } : {}),
  };
}

/** 配信キー: tc.<user(小文字)>.<movie id> @param {string} user @param {{ movieId?: string | number | null }} [opts] */
export function buildTcStreamKey(user, opts = {}) {
  const u = String(user || '').toLowerCase();
  const mid = String(opts.movieId ?? '');
  return isTcUser(u) && /^\d{1,20}$/.test(mid) ? `tc.${u}.${mid}` : '';
}
/** @param {unknown} key */
export function isTcStreamKey(key) {
  const m = /^tc\.((?:[a-z]{1,3}:)?[a-z0-9_]{1,40})\.\d{1,20}$/.exec(String(key || ''));
  return !!m && isTcUser(m[1]);
}
/** 配信キー → 配信者の名前 @param {unknown} key */
export function tcUserOfStreamKey(key) {
  const k = String(key || '');
  return isTcStreamKey(k) ? k.slice(3, k.lastIndexOf('.')) : '';
}
/** @param {unknown} user */
export function tcUserUrl(user) {
  const s = String(user || '').toLowerCase();
  return isTcUser(s) ? `${TC_ORIGIN}/${s}` : '';
}
