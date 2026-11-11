// abParse.js — ABEMA の放送ページが受け取ったコメント JSON を、YouTube 版の記録と同じ形にする(純関数)
// @layer L0 — 純粋計算
//
// ★ページ自身の応答を写す(拡張からコメント用の別ホストへ取りに行かない)。
//   形は 2025-07 に公開された観測(chats/{id}/messages の messages[]・elapsedMs・isPolling)と、
//   それより前の slots/{id}/comments の comments[]。2026-11 時点の本番応答は地域制限で未確認。
//   欠けている欄・知らない形は捨てる。空の配列で既存の記録を消さない(呼び出し側が 0 件なら送らない)。
//
//   since / until は資料によって向きが逆なので、大きい方を新しい端、小さい方を古い端として扱う。
//   窓が約 25 秒より広ければ、新しい端から 20 秒以内だけ残す(過去のまとめて取得を読み上げに流さない)。

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
  const m = /\/v1\/chats\/([^/]+)\/messages/.exec(u.pathname);
  if (!m) return '';
  try {
    return abSessionOfChatId(decodeURIComponent(m[1]));
  } catch {
    return abSessionOfChatId(m[1]);
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
  if (arin && arin !== chat && /^[A-Za-z0-9_.:-]{4,120}$/.test(arin)) return arin;
  const id = str(m.id || m.key);
  if (id && /^[A-Za-z0-9_.:-]{4,120}$/.test(id)) return id;
  const head = text.slice(0, 40);
  if (!head) return '';
  return `${userId}:${elapsed == null ? 'x' : Math.floor(elapsed)}:${head}`;
}

/**
 * @param {unknown} raw
 * @returns {{ key: string, userId: string, name: string, iconUrl: string, text: string, elapsedMs: number | null, chatId: string } | null}
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
 * @returns {{ title: string, startedAtMs: number | null, viewers: number | null } | null}
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
  if (!cleanTitle && !startedAtMs && viewers == null) return null;
  return { title: cleanTitle, startedAtMs, viewers };
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
 * 再生位置の近くだけ残す。時刻が無いコメントは残す(いま届いたものとして扱う)。
 * @param {ReadonlyArray<{ elapsedMs: number | null }>} messages
 * @param {{ sinceMs?: number | null, untilMs?: number | null }} [win]
 */
export function abMessagesNearPlayhead(messages, win = {}) {
  const list = Array.isArray(messages) ? messages.slice() : [];
  const bounds = [numOrNull(win.sinceMs), numOrNull(win.untilMs)].filter((n) => n != null);
  const elapsed = list.map((m) => m.elapsedMs).filter((n) => n != null);
  const msgMax = elapsed.length ? Math.max(...elapsed) : null;
  const msgMin = elapsed.length ? Math.min(...elapsed) : null;
  let head = /** @type {number | null} */ (null);
  let span = /** @type {number | null} */ (null);
  if (bounds.length >= 2) {
    head = Math.max(...bounds);
    span = head - Math.min(...bounds);
  } else if (bounds.length === 1) {
    const b = bounds[0];
    if (msgMax != null && msgMax > b + AB_PLAYHEAD_KEEP_MS) {
      head = msgMax;
      span = msgMax - Math.min(b, msgMin ?? b);
    } else {
      head = Math.max(b, msgMax ?? b);
    }
  } else if (msgMax != null) {
    head = msgMax;
    span = msgMin == null ? null : msgMax - msgMin;
  }
  if (head == null) return list.length > 20 ? list.slice(-20) : list;
  if (span != null && span <= AB_TIGHT_WINDOW_MS) return list;
  const lo = head - AB_PLAYHEAD_KEEP_MS;
  const hi = head + 5000;
  return list.filter((m) => m.elapsedMs == null || (m.elapsedMs >= lo && m.elapsedMs <= hi));
}

/**
 * 記録の 1 件。投稿時刻は「いま届いた」にする(保存側が recordedAt を今にする。過去分をまとめて読ませないのは窓の側)。
 * @param {{ key?: string, userId?: string, name?: string, iconUrl?: string, text?: string }} msg
 * @param {{ pageLogin?: string, nowMs?: number }} ctx
 */
export function abCommentRow(msg, ctx) {
  if (!msg || !msg.key || !msg.userId || !msg.text) return null;
  if (!USER_ID_RE.test(msg.userId)) return null;
  const idPart = String(msg.key).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
  if (idPart.length < 4) return null;
  const now = Number(ctx.nowMs) > 0 ? Number(ctx.nowMs) : Date.now();
  return {
    id: `ab-${idPart}`,
    channelId: `ab:${msg.userId}`,
    name: String(msg.name || msg.userId).slice(0, 40),
    login: '',
    iconUrl: safeAbImageUrl(msg.iconUrl),
    badges: /** @type {string[]} */ ([]),
    ts: '',
    postedAtMs: now,
    channel: String(ctx.pageLogin || ''),
    color: '',
    text: String(msg.text).slice(0, 500),
    kind: 'text',
    amount: 0,
    currency: '',
  };
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
        chatId: m.chatId,
      })),
    };
  }
  const meta = parseAbProgramMeta(raw);
  if (meta) return { meta };
  return null;
}
