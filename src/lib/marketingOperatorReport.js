// @ts-nocheck
/**
 * 運営者向けマーケHTMLの章立て（純関数）。
 * 同じ順で出し、埋まらない章は落とす。記録とページ DOM に無い数字は作らない。
 */

import { toEpochMs } from './timeAuthority.js';
import { isYtPseudoLvShape } from './youtube/ytPseudoLv.js';
import { isSiteDefaultSilhouetteUrl } from './avatarFallbackFromUrl.js';
import { isMarketingSupportRow, speechCommentsForMarketing } from './marketingAggregate.js';
import { indexPastUsers } from './commenterHistoricalAnalytics.js';
import { judgeNewVsRepeatBasis } from './newVsRepeatBasis.js';
import {
  estimateViewerSpendFromComments,
  formatEstimatedViewerSpendDisplays,
  estimateStreamerTakeHomeFromComments,
  formatStreamerTakeHomeDisplay,
  estimateNiconicoGiftSpendJpy,
  STREAMER_TAKE_HOME_PLATFORMS,
} from './estimatedViewerSpend.js';
import { marketingViewFor } from './platform/marketingPlatformPlan.js';
import { isTwLogin } from './twitch/twIrcParse.js';
import { isKickSlug } from './kick/kickChatParse.js';


/** 章の決まった順。lead は見出しの前に出す。 */
export const OPERATOR_SECTION_ORDER = Object.freeze([
  'thanks',
  'who',
  'top',
  'threads',
  'gifts',
  'peaks',
  'related',
]);

/**
 * @param {unknown} c
 * @returns {string}
 */
function uidOf(c) {
  if (!c || typeof c !== 'object') return '';
  const row = /** @type {any} */ (c);
  if (row.is184 === true || row.isAnonymous === true) return '';
  return String(row.userId || row.ytChannelId || row.channelId || '').trim();
}

/** @param {unknown} c */
function nameOf(c) {
  if (!c || typeof c !== 'object') return '';
  const row = /** @type {any} */ (c);
  return String(row.nickname || row.name || '').replace(/\s+/g, ' ').trim();
}

/** @param {unknown} c */
function capturedAtOf(c) {
  return toEpochMs(/** @type {any} */ (c)?.capturedAt) || toEpochMs(/** @type {any} */ (c)?.postedAtMs);
}


/** @param {unknown} platformId */

/**
 * サービスの公式の呼び方。kicker に使う。
 * @param {unknown} platformId
 * @param {unknown} contentKind
 */

/**
 * 運営者レポートに出す名前。空欄にはしない。
 * 共有マスク時は「視聴者」。照合できない／匿名は「匿名」。
 * 名前が無くても Twitch / Kick は login を使い、ニコの数値 ID だけ「ID 123456」と出す
 * （a: やハッシュした内部 ID は出さない）。それ以外は「名前未取得」。
 * @param {any} person
 * @param {{ maskShare?: boolean, platformId?: string }} [opts]
 * @returns {string}
 */
export function operatorDisplayName(person, opts = {}) {
  if (opts.maskShare === true) return '視聴者';
  const platformId = String(opts.platformId || person?.platformId || '').trim();
  const name = String(person?.name || person?.nickname || '').replace(/\s+/g, ' ').trim();
  if (name && !isInternalMarketingId(name, platformId)) return name;
  if (!isOperatorPersonComparable(person)) return '匿名';
  const login = String(person?.login || '').trim();
  if (login && operatorLoginIsPublic(platformId, person)) return login;
  const uid = String(person?.uid || person?.userId || '').trim();
  if (/^\d{3,14}$/.test(uid) && operatorUidIsPublicNumericId(platformId)) return `ID ${uid}`;
  return '名前未取得';
}

/** @param {any} person */
function isOperatorPersonComparable(person) {
  if (!person || typeof person !== 'object') return false;
  if (person.comparable === true) return true;
  if (person.comparable === false) return false;
  if (person.is184 === true || person.isAnonymous === true) return false;
  const uid = String(person.uid || person.userId || person.ytChannelId || person.channelId || '').trim();
  return !!uid && !uid.startsWith('__row:');
}

/** @param {string} platformId @param {any} person */
function operatorLoginIsPublic(platformId, person) {
  const login = String(person?.login || '').trim();
  if (!login || isInternalMarketingId(login, platformId)) return false;
  const id = String(platformId || '').trim();
  const ch = String(person?.channelId || person?.uid || '').trim();
  if (id === 'twitch' || /^tw:/i.test(ch)) return isTwLogin(login);
  if (id === 'kick' || /^kk:/i.test(ch)) return isKickSlug(login.toLowerCase());
  return false;
}

/** 数字の「ID n」は、サービスがニコニコだと分かっているときだけ。 */
function operatorUidIsPublicNumericId(platformId) {
  return String(platformId || '').trim() === 'niconico';
}

/**
 * 内部キー・匿名 ID・他サービス接頭辞を、表示名として出さない。
 * @param {unknown} value
 * @param {unknown} [platformId]
 */
export function isInternalMarketingId(value, platformId) {
  const s = String(value || '').trim();
  if (!s) return true;
  if (/^a:[A-Za-z0-9_-]+$/i.test(s)) return true;
  if (/^(tw|kk|tc|sr|tt|mx|ww|ab):/i.test(s)) return true;
  if (/^(login|name):/i.test(s)) return true;
  if (s.startsWith('__row:') || s === '__unknown__') return true;
  if (/^stored_\d+$/i.test(s)) return true;
  void platformId;
  return false;
}

export function operatorServiceLabel(platformId, contentKind) {
  const id = String(platformId || '').trim() || 'niconico';
  const video = contentKind === 'video' || contentKind === 'live_replay';
  if (id === 'niconico') return video ? 'ニコニコ動画' : 'ニコニコ生放送';
  if (id === 'youtube') return video ? 'YouTube 動画' : 'YouTube ライブ';
  if (id === 'twitch') return 'Twitch';
  if (id === 'kick') return 'Kick';
  if (id === 'twitcasting') return 'ツイキャス';
  if (id === 'showroom') return 'SHOWROOM';
  if (id === 'mixch') return 'ミクチャ';
  if (id === 'tiktok') return video ? 'TikTok' : 'TikTok LIVE';
  if (id === 'abema') return 'ABEMA';
  if (id === 'whowatch') return 'ふわっち';
  const view = marketingViewFor(id);
  return view?.id || 'ニコニコ生放送';
}

/**
 * 見出しに出す公式の ID。YouTube の仮 lv は出さない。
 * @param {{ platformId?: string, liveId?: string, watchId?: string, publicId?: string }} input
 */
export function operatorPublicId(input) {
  const explicit = String(input?.publicId || '').trim();
  if (explicit) return explicit;
  const watch = String(input?.watchId || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(watch)) return watch;
  const liveId = String(input?.liveId || '').trim();
  if (isYtPseudoLvShape(liveId)) return watch;
  return liveId;
}

export function operatorKindLabel(platformId, contentKind) {
  const view = marketingViewFor(platformId);
  if (contentKind === 'video') return '動画';
  if (view?.id === 'abema') return '番組';
  if (view?.id === 'tiktok') return 'LIVE';
  return '配信';
}

/** @param {unknown} platformId */
export function operatorProgramWord(platformId, contentKind) {
  if (contentKind === 'video') return '動画';
  const view = marketingViewFor(platformId);
  return view?.programWord || '配信';
}

/**
 * 公式単価がある推定だけ残す。金額の無い「—」は返さない。
 * @param {unknown} platformId
 * @param {readonly unknown[]} comments
 * @param {{ officialGiftPts?: number }} [extra]
 */
export function officialEstimatesForOperator(platformId, comments, extra = {}) {
  const id = String(platformId || 'niconico');
  /** @type {Array<{ key: string, label: string, text: string, note: string, sourceUrl: string, asOf?: string }>} */
  const out = [];
  const viewer = (id === 'niconico' || id === '')
    ? (Number(extra.officialGiftPts) > 0
      ? formatEstimatedViewerSpendDisplays(estimateNiconicoGiftSpendJpy(extra.officialGiftPts))
      : [])
    : formatEstimatedViewerSpendDisplays(estimateViewerSpendFromComments(id, comments));
  for (const item of viewer) {
    const text = String(item.text || '').trim();
    if (!text || text === '—' || text === '-') continue;
    if (!/[0-9]/.test(text)) continue;
    out.push({
      key: String(item.key || 'estimatedViewerSpend'),
      label: String(item.label || '推定'),
      text,
      note: String(item.note || ''),
      sourceUrl: String(item.sourceUrl || ''),
      asOf: String(item.asOf || ''),
    });
  }
  if (STREAMER_TAKE_HOME_PLATFORMS.includes(/** @type {any} */ (id))) {
    const th = formatStreamerTakeHomeDisplay(id, estimateStreamerTakeHomeFromComments(id, comments));
    const text = String(th?.text || '').trim();
    if (th && text && text !== '—' && /[0-9]/.test(text)) {
      out.push({
        key: 'estimatedStreamerTakeHome',
        label: String(th.label || '推定（配信者の受取）'),
        text,
        note: String(th.note || ''),
        sourceUrl: String(th.sourceUrl || ''),
        asOf: String(th.asOf || ''),
      });
    }
  }
  return out;
}

/**
 * コメントの山（15分桶）。時刻が無ければ空。
 * @param {readonly unknown[]} comments
 * @param {{ bucketMs?: number, cap?: number }} [opts]
 */
export function commentPeakBuckets(comments, opts = {}) {
  const bucketMs = Number(opts.bucketMs) > 0 ? Number(opts.bucketMs) : 15 * 60_000;
  const cap = Number(opts.cap) > 0 ? Number(opts.cap) : 16;
  /** @type {number[]} */
  const times = [];
  for (const c of comments) {
    const at = capturedAtOf(c);
    if (at) times.push(at);
  }
  if (times.length < 2) {
    if (times.length === 1) {
      return [{ startAt: times[0], count: 1, label: formatClock(times[0]) }];
    }
    return [];
  }
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = Math.max(1, Math.ceil((max - min + 1) / bucketMs));
  const n = Math.min(span, cap);
  const width = Math.max(bucketMs, Math.ceil((max - min + 1) / n));
  /** @type {{ startAt: number, count: number, label: string }[]} */
  const buckets = [];
  for (let i = 0; i < n; i += 1) {
    const startAt = min + i * width;
    buckets.push({ startAt, count: 0, label: formatClock(startAt) });
  }
  for (const at of times) {
    let i = Math.floor((at - min) / width);
    if (i < 0) i = 0;
    if (i >= buckets.length) i = buckets.length - 1;
    buckets[i].count += 1;
  }
  return buckets;
}

/** @param {number} ms */
function formatClock(ms) {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** @param {number} ms */
function formatDay(ms) {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * @param {{
 *   liveId?: string,
 *   platformId?: string,
 *   contentKind?: string,
 *   comments?: readonly any[],
 *   pastBroadcasts?: readonly { liveId?: string, comments?: readonly any[] }[],
 *   pageFacts?: Record<string, any> | null,
 *   pageCount?: number,
 *   visitorCount?: number,
 *   concurrentPeak?: number,
 *   officialGiftPts?: number,
 *   relatedChip?: import('./youtube/ytRelatedChipSnapshot.js').YtRelatedChipSnapshot | null,
 *   videoThreads?: readonly any[],
 *   broadcastTitle?: string,
 *   broadcasterUserId?: string,
 *   broadcasterName?: string,
 *   nowMs?: number,
 * }} input
 */

/**
 * 画面種別。明示が無ければニコ生の lv / 動画の sm・so から判断する。YouTube の仮 lv は使わない。
 * @param {{ contentKind?: string, liveId?: string, platformId?: string, pageFacts?: Record<string, any>|null, isLive?: boolean }} input
 */
export function resolveOperatorContentKind(input) {
  const facts = input?.pageFacts && typeof input.pageFacts === 'object' ? input.pageFacts : {};
  const raw = String(input?.contentKind || facts.contentKind || '').trim();
  if (raw === 'video' || raw === 'live_replay') return 'video';
  if (raw === 'live') return 'live';
  if (facts.isLive === false || input?.isLive === false) return 'video';
  if (facts.isLive === true || input?.isLive === true) return 'live';
  const plat = String(input?.platformId || '').trim();
  const id = String(input?.liveId || '').trim();
  if ((!plat || plat === 'niconico') && /^(sm|so|nm)\d+/.test(id)) return 'video';
  if ((!plat || plat === 'niconico') && /^lv\d+/.test(id)) return 'live';
  return 'live';
}


/**
 * 記録行に付いているサービス名を優先する。仮 lv だけ見て YouTube と決めない。
 * @param {{ platformId?: string, comments?: readonly any[], liveId?: string }} input
 */

/**
 * コメントやアイコン控えから、その人の本物の顔 URL を取る。灰色の既定アイコンは使わない。
 * @param {any} row
 * @param {Record<string, string>|null|undefined} liveIcons
 */
export function liveIconUrlForComment(row, liveIcons, platformHint) {
  const direct = String(row?.avatarUrl || row?.iconUrl || '').trim();
  if (/^https:\/\//i.test(direct) && !isSiteDefaultSilhouetteUrl(direct)) return direct;
  const plat = String(platformHint || row?.ytPlatform || row?.platform || inferIconPlatform(row) || '').trim();
  const dict = platformLiveIconDict(liveIcons, plat);
  if (!dict) return '';
  /** @type {string[]} */
  const keys = [];
  const login = String(row?.login || '').trim().toLowerCase();
  if (login) keys.push(login);
  const ch = String(row?.channelId || row?.ytChannelId || '').trim();
  const tw = /^tw:(.+)$/i.exec(ch);
  const kk = /^kk:@?(.+)$/i.exec(ch);
  if (tw) keys.push(String(tw[1] || '').trim().toLowerCase());
  if (kk) keys.push(String(kk[1] || '').trim().toLowerCase());
  if (ch) keys.push(ch, ch.toLowerCase());
  const uid = String(row?.uid || row?.userId || '').trim();
  if (uid) keys.push(uid, uid.toLowerCase());
  const seen = new Set();
  for (const k of keys) {
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const u = String(dict[k] || dict[k.toLowerCase()] || '').trim();
    if (/^https:\/\//i.test(u) && !isSiteDefaultSilhouetteUrl(u)) return u;
  }
  return '';
}

/** @param {any} row */
function inferIconPlatform(row) {
  const ch = String(row?.channelId || row?.ytChannelId || '');
  if (ch.startsWith('tw:')) return 'twitch';
  if (ch.startsWith('kk:')) return 'kick';
  if (ch.startsWith('tc:')) return 'twitcasting';
  if (ch.startsWith('sr:')) return 'showroom';
  if (ch.startsWith('tt:')) return 'tiktok';
  if (ch.startsWith('mx:')) return 'mixch';
  if (ch.startsWith('ww:')) return 'whowatch';
  if (ch.startsWith('ab:')) return 'abema';
  if (/^UC[A-Za-z0-9_-]{22}$/.test(ch)) return 'youtube';
  return '';
}

/**
 * サービスごとの控えだけを見る。横断の名前キーは使わない。
 * @param {unknown} liveIcons
 * @param {string} platformId
 * @returns {Record<string, string>|null}
 */
function platformLiveIconDict(liveIcons, platformId) {
  if (!liveIcons || typeof liveIcons !== 'object') return null;
  const plat = String(platformId || '').trim();
  if (!plat) return null;
  const nested = /** @type {Record<string, unknown>} */ (liveIcons)[plat];
  if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return null;
  return /** @type {Record<string, string>} */ (nested);
}

export function inferOperatorPlatform(input) {
  const fromRow = (row) => {
    if (!row || typeof row !== 'object') return '';
    const p = String(row.ytPlatform || row.platform || '').trim();
    if (p) return p;
    const ch = String(row.channelId || row.ytChannelId || '');
    if (ch.startsWith('tw:')) return 'twitch';
    if (ch.startsWith('kk:')) return 'kick';
    if (ch.startsWith('tc:')) return 'twitcasting';
    if (ch.startsWith('sr:')) return 'showroom';
    if (ch.startsWith('tt:')) return 'tiktok';
    if (ch.startsWith('mx:')) return 'mixch';
    if (ch.startsWith('ww:')) return 'whowatch';
    if (ch.startsWith('ab:')) return 'abema';
    return '';
  };
  const rows = Array.isArray(input?.comments) ? input.comments : [];
  for (let i = 0; i < rows.length && i < 80; i += 1) {
    const p0 = fromRow(rows[i]);
    if (p0) return p0;
  }
  const given = String(input?.platformId || '').trim();
  if (given) return given;
  const id = String(input?.liveId || '').trim();
  if (isYtPseudoLvShape(id)) return 'youtube';
  return given;
}

export function buildOperatorReportModel(input) {
  const liveId = String(input?.liveId || '').trim();
  const platformId = inferOperatorPlatform({ platformId: input?.platformId, comments: input?.comments, liveId }) || 'niconico';
  const contentKind = resolveOperatorContentKind(input);
  const isVideo = contentKind === 'video';
  const view = marketingViewFor(platformId);
  const giftWord = view?.hideGift ? '' : (view?.giftWord || (platformId === 'niconico' || !view ? 'ギフト' : 'ギフト'));
  const rawComments = Array.isArray(input?.comments) ? input.comments : [];
  const broadcasterUid = String(input?.broadcasterUserId || '').trim();
  const comments = rawComments.filter((c) => {
    if (c && c.isCreator === true) return true;
    const uid = String(c?.userId || c?.ytChannelId || c?.channelId || '').trim();
    if (broadcasterUid && uid && uid === broadcasterUid) return false;
    return true;
  });
  const speech = speechCommentsForMarketing(comments);
  const support = comments.filter((c) => isMarketingSupportRow(c));
  const past = Array.isArray(input?.pastBroadcasts) ? input.pastBroadcasts : [];
  const basis = judgeNewVsRepeatBasis(past.length);
  const pastIndex = basis.ok ? indexPastUsers(/** @type {any} */ (past), liveId) : new Map();

  /** @type {Map<string, { uid: string, name: string, avatarUrl: string, comments: any[], comparable: boolean, returning: boolean, pastBroadcasts: number, pastComments: number, giftRows: any[] }>} */
  const people = new Map();
  let incomparable = 0;
  for (const c of comments) {
    const comparable = !!uidOf(c);
    const uid = comparable ? uidOf(c) : `__row:${String(c?.id || c?.commentNo || nameOf(c) || Math.random())}`;
    if (!comparable) incomparable += 1;
    let row = people.get(uid);
    if (!row) {
      const pastRow = comparable && basis.ok ? pastIndex.get(uid) : null;
      row = {
        uid,
        name: nameOf(c),
        login: String(c?.login || '').trim(),
        avatarUrl: liveIconUrlForComment(c, input?.liveIcons, platformId),
        comments: [],
        comparable,
        returning: Boolean(pastRow),
        pastBroadcasts: pastRow ? pastRow.broadcastIds.size : 0,
        pastComments: pastRow ? pastRow.totalComments : 0,
        giftRows: [],
      };
      people.set(uid, row);
    }
    row.comments.push(c);
    if (isMarketingSupportRow(c)) row.giftRows.push(c);
    if (nameOf(c) && !row.name) row.name = nameOf(c);
    if (!row.avatarUrl) row.avatarUrl = liveIconUrlForComment(c, input?.liveIcons, platformId);
    if (c?.login && !row.login) row.login = String(c.login).trim();
  }
  // incomparable was incremented per comment; recount people
  incomparable = [...people.values()].filter((p) => !p.comparable).length;
  const speechPeople = [...people.values()].filter((p) => p.comments.some((c) => !isMarketingSupportRow(c)));
  const returningPeople = speechPeople.filter((p) => p.comparable && p.returning);
  const unmatchedPeople = speechPeople.filter((p) => p.comparable && !p.returning);
  const firstTimers = basis.ok ? unmatchedPeople : [];

  const threads = Array.isArray(input?.videoThreads) ? input.videoThreads : [];
  const topLevelThreads = threads.filter((t) => !t.parentId && Number(t.replyLevel || 0) === 0);
  const replyByParent = new Map();
  for (const t of threads) {
    if (!t.parentId) continue;
    const arr = replyByParent.get(t.parentId) || [];
    arr.push(t);
    replyByParent.set(t.parentId, arr);
  }
  const pending = topLevelThreads
    .filter((t) => t.isCreator !== true)
    .filter((t) => t.creatorHeart !== true)
    .filter((t) => {
      const replies = replyByParent.get(t.commentId) || [];
      const creatorReplied = replies.some((r) => r.isCreator === true);
      return !creatorReplied;
    })
    .slice()
    .sort((a, b) => (Number(b.likeCount) || 0) - (Number(a.likeCount) || 0) || (Number(b.postedAtMs) || 0) - (Number(a.postedAtMs) || 0));

  /** @type {any[]} */
  const giftPeople = [...people.values()]
    .filter((p) => p.giftRows.length)
    .map((p) => ({
      ...p,
      giftLabel: summarizeGiftRows(p.giftRows, giftWord, view),
    }))
    .sort((a, b) => giftSortKey(b.giftRows, view) - giftSortKey(a.giftRows, view));

  const useReplyThanks = isVideo && (pending.length > 0 || topLevelThreads.length > 0);
  /** @type {any[]} */
  const thanksItems = [];
  if (useReplyThanks) {
    for (const t of pending.slice(0, 12)) {
      thanksItems.push({
        kind: 'pending',
        name: String(t.name || ''),
        uid: String(t.channelId || '').trim(),
        login: String(t.login || '').trim(),
        comparable: Boolean(String(t.channelId || '').trim()),
        avatarUrl: liveIconUrlForComment(t, input?.liveIcons),
        text: String(t.text || ''),
        timeText: String(t.timeText || ''),
        likeCount: t.likeCount,
        replyCount: t.replyCount,
        returning: (() => {
          const uid = String(t.channelId || '').trim();
          return Boolean(uid && basis.ok && pastIndex.get(uid));
        })(),
      });
    }
  } else {
    for (const p of giftPeople.slice(0, 8)) {
      const last = p.giftRows.concat(p.comments).sort((a, b) => capturedAtOf(b) - capturedAtOf(a))[0];
      thanksItems.push({
        kind: 'gift',
        name: p.name,
        uid: p.uid,
        login: p.login,
        comparable: p.comparable,
        avatarUrl: p.avatarUrl || liveIconUrlForComment(p, input?.liveIcons, platformId),
        text: String(last?.text || ''),
        timeText: capturedAtOf(last) ? formatClock(capturedAtOf(last)) : '',
        giftLabel: p.giftLabel,
        returning: p.returning,
      });
    }
    for (const p of firstTimers
      .slice()
      .sort((a, b) => capturedAtOf(a.comments[0]) - capturedAtOf(b.comments[0]))
      .slice(0, 8)) {
      if (thanksItems.some((x) => x.name === p.name && x.kind === 'gift')) continue;
      const first = p.comments.slice().sort((a, b) => capturedAtOf(a) - capturedAtOf(b))[0];
      thanksItems.push({
        kind: 'first',
        name: p.name,
        uid: p.uid,
        login: p.login,
        comparable: p.comparable,
        avatarUrl: p.avatarUrl || liveIconUrlForComment(p, input?.liveIcons, platformId),
        text: String(first?.text || ''),
        timeText: capturedAtOf(first) ? formatClock(capturedAtOf(first)) : '',
        commentCount: p.comments.filter((c) => !isMarketingSupportRow(c)).length,
        returning: false,
      });
    }
  }

  const topPeople = speechPeople
    .slice()
    .sort((a, b) => b.comments.filter((c) => !isMarketingSupportRow(c)).length - a.comments.filter((c) => !isMarketingSupportRow(c)).length)
    .slice(0, 20)
    .map((p) => ({
      name: p.name,
      uid: p.uid,
      login: p.login,
      comparable: p.comparable,
      avatarUrl: p.avatarUrl || liveIconUrlForComment(p, input?.liveIcons, platformId),
      commentCount: p.comments.filter((c) => !isMarketingSupportRow(c)).length,
      likeTotal: sumKnownLikes(p.comments),
      giftLabel: p.giftRows.length ? summarizeGiftRows(p.giftRows, giftWord, view) : '',
      returning: p.returning,
      pending: useReplyThanks && pending.some((t) => t.channelId && uidOf({ userId: t.channelId }) === p.uid),
    }));

  const threadCards = (useReplyThanks ? topLevelThreads : []).slice(0, 15).map((t) => ({
    ...t,
    replies: replyByParent.get(t.commentId) || [],
    pending: pending.includes(t) || pending.some((p) => p.commentId === t.commentId),
  }));

  const estimates = officialEstimatesForOperator(platformId, comments, { officialGiftPts: input?.officialGiftPts });
  const giftCards = buildGiftCards({ support, giftWord, view, officialGiftPts: input?.officialGiftPts, estimates });

  const speechTimes = speech.filter((c) => capturedAtOf(c));
  const useDayBuckets = isVideo && daySpan(speechTimes) >= 2;
  const peaks = useDayBuckets ? dayPeakBuckets(speechTimes) : commentPeakBuckets(speech);
  const peakNote = peaks.length
    ? peakSummary(peaks, useDayBuckets)
    : '';

  const related = input?.relatedChip && (input.relatedChip.videos?.length || input.relatedChip.chipLabels?.length)
    ? input.relatedChip
    : null;

  const pageCommentCount = measuredPositiveCount(input?.pageFacts?.commentCount ?? input?.pageFacts?.slotCommentCount);
  const pageViews = measuredPositiveCount(input?.pageCount ?? input?.pageFacts?.viewCount);
  const visitors = measuredPositiveCount(input?.visitorCount);
  const concurrentPeak = measuredPositiveCount(input?.concurrentPeak);
  const loadedCommentCount = measuredPositiveCount(input?.pageFacts?.loadedCommentCount ?? input?.loadedCommentCount);
  const viewsLabel = isVideo ? '再生数' : String(view?.pageCountLabel || '').trim();

  /** @type {Array<{ key: string, value: string, label: string, hint: string }>} */
  const kpis = [];
  const commenterCount = speechPeople.length;
  if (commenterCount > 0) {
    kpis.push({
      key: 'commenters',
      value: `${commenterCount.toLocaleString('ja-JP')}人`,
      label: 'コメントした人',
      hint: isVideo && loadedCommentCount != null
        ? `画面に出ていた ${loadedCommentCount.toLocaleString('ja-JP')}件から`
        : `このPCの記録 ${speech.length.toLocaleString('ja-JP')}件から`,
    });
  }
  if (basis.ok && returningPeople.length > 0) {
    kpis.push({
      key: 'returning',
      value: `${returningPeople.length.toLocaleString('ja-JP')}人`,
      label: '以前の配信でも書いてくれた人',
      hint: 'このPCの配信記録と照合',
    });
  }
  if (useReplyThanks && pending.length > 0) {
    kpis.push({
      key: 'pending',
      value: `${pending.length.toLocaleString('ja-JP')}件`,
      label: 'おへんじできるコメント',
      hint: '返信・ハートがまだ無いもの',
    });
  } else if (support.length > 0 && giftWord) {
    const pts = numOrNull(input?.officialGiftPts);
    kpis.push({
      key: 'gifts',
      value: pts != null ? `${pts.toLocaleString('ja-JP')}pt` : `${support.length.toLocaleString('ja-JP')}件`,
      label: giftWord,
      hint: pts != null ? '公式の履歴で確認できた範囲' : 'このPCの記録',
    });
  }
  if (visitors != null) {
    kpis.push({ key: 'visitors', value: `${visitors.toLocaleString('ja-JP')}人`, label: '来場者', hint: 'ページの来場者（取れていたとき）' });
  } else if (pageViews != null && viewsLabel) {
    kpis.push({
      key: 'views',
      value: pageViews.toLocaleString('ja-JP'),
      label: viewsLabel,
      hint: 'ページの表示',
    });
  } else if (pageCommentCount != null && isVideo) {
    kpis.push({
      key: 'pageComments',
      value: `${pageCommentCount.toLocaleString('ja-JP')}件`,
      label: 'ページのコメント数',
      hint: '見出しの表示。全部は読んでいません',
    });
  } else if (concurrentPeak != null) {
    const concurrentLabel = String(view?.concurrentLabel || (platformId === 'niconico' || !view ? '推定同時接続' : '視聴者数')).trim() || '視聴者数';
    kpis.push({
      key: 'concurrent',
      value: `${concurrentPeak.toLocaleString('ja-JP')}人`,
      label: `${concurrentLabel}の山`,
      hint: 'このPCの記録の山',
    });
  }
  // fourth slot: page comment count on video if not already used
  if (kpis.length < 4 && pageCommentCount != null && !kpis.some((k) => k.key === 'pageComments') && isVideo) {
    kpis.push({
      key: 'pageComments',
      value: `${pageCommentCount.toLocaleString('ja-JP')}件`,
      label: 'ページのコメント数',
      hint: '見出しの表示。全部は読んでいません',
    });
  }

  const leadSentence = buildLeadSentence({
    isVideo,
    commenterCount,
    returningCount: basis.ok ? returningPeople.length : null,
    pendingCount: useReplyThanks ? pending.length : null,
    giftCount: support.length,
    giftWord,
    officialGiftPts: numOrNull(input?.officialGiftPts),
    peakNote,
    basisOk: basis.ok,
  });

  /** @type {Array<{ id: string, key: string, title: string, why: string, data: any }>} */
  const sections = [];
  const push = (key, title, why, data, empty) => {
    if (empty) return;
    sections.push({ id: `mkt-op-${key}`, key, title, why, data });
  };

  if (useReplyThanks) {
    push(
      'thanks',
      'おへんじできるコメント',
      '投稿者の返信やハートが、まだついていないコメントです。いいねが多いものから並べています。',
      { items: thanksItems, more: Math.max(0, pending.length - thanksItems.length), mode: 'pending' },
      thanksItems.length === 0,
    );
  } else {
    push(
      'thanks',
      '声をかけてくれた人',
      giftWord
        ? `${giftWord}を贈ってくれた人と、この${operatorProgramWord(platformId, contentKind)}で初めて書いてくれた人です。お礼や名前呼びの手がかりとして並べています。`
        : `この${operatorProgramWord(platformId, contentKind)}で初めて書いてくれた人です。お礼や名前呼びの手がかりとして並べています。`,
      { items: thanksItems, mode: 'live', basisOk: basis.ok, firstTimerNote: basis.ok
        ? '初めての人は、このPCの過去の配信記録に名前が無かった人です。記録していない配信に居た可能性は、ここでは分かりません。'
        : '過去の配信を読み込んでいないため、初めてかどうかは出ていません。' },
      thanksItems.length === 0,
    );
  }

  push(
    'who',
    '誰が来てくれたか',
    basis.ok
      ? '名前が分かる人だけを、このPCの過去の配信記録と突き合わせています。記録の無い人を「新しい人」とは書いていません。'
      : '過去の配信を突き合わせていないので、新しい人／また来てくれた人の数は出していません。',
    {
      returning: returningPeople.slice(0, 8).map((p) => ({
        name: p.name,
        uid: p.uid,
        login: p.login,
        comparable: p.comparable,
        avatarUrl: p.avatarUrl || liveIconUrlForComment(p, input?.liveIcons, platformId),
        pastBroadcasts: p.pastBroadcasts,
        commentCount: p.comments.filter((c) => !isMarketingSupportRow(c)).length,
      })),
      returningCount: returningPeople.length,
      unmatchedCount: basis.ok ? unmatchedPeople.length : null,
      incomparableCount: incomparable,
      commenterCount,
      visitorCount: visitors,
      pageCommentCount,
      loadedCommentCount,
      basisOk: basis.ok,
      isVideo,
    },
    commenterCount === 0 || !basis.ok,
  );

  push(
    'top',
    'よく書いてくれた人',
    isVideo
      ? '画面に出ていたコメントの件数です。同じ人の返信も含みます。'
      : 'このPCが受け取ったコメントの件数です。配信者本人は除いています。',
    { rows: topPeople, hasLikes: topPeople.some((p) => p.likeTotal != null), giftWord },
    topPeople.length === 0,
  );

  push(
    'threads',
    'コメント・いいね・返信',
    '書き出したときに画面に出ていたスレッドです。数字はページの表示のままです。',
    { cards: threadCards },
    threadCards.length === 0,
  );

  push(
    'gifts',
    giftWord || '応援',
    view?.id === 'youtube'
      ? 'YouTube の言葉のままです。チャットに書いてあった金額と、公式の単価で出せる推定だけを載せています。'
      : `${giftWord || '応援'}の記録です。公式の単価で出せる推定だけ金額を出し、それ以外は件数だけです。`,
    { cards: giftCards, estimates, rows: giftLedgerRows(support, view).slice(0, 8), giftWord },
    giftCards.length === 0 && estimates.length === 0 && support.length === 0,
  );

  push(
    'peaks',
    useDayBuckets ? 'コメントが集まった日' : 'コメントが集まった時間',
    isVideo
      ? '画面に出ていたコメントの、おおよその投稿日です（「3日前」などの表示から換算することがあります）。'
      : 'このPCがコメントを受け取った時刻です。',
    { buckets: peaks, note: peakNote, concurrentPeak, concurrentLabel: view?.concurrentLabel || (platformId === 'niconico' || !view ? '推定同時接続' : '視聴者数') },
    peaks.length === 0,
  );

  push(
    'related',
    'この動画の隣に並んでいたもの',
    'YouTube 右側のチップに、どのチャンネルの動画が座っていたかの記録です。新しい通信はせず、書き出したときに画面に出ていたチップだけを載せています。',
    { snapshot: related, operatorName: String(input?.broadcasterName || '') },
    !related,
  );

  // Enforce order
  const ordered = [];
  for (const key of OPERATOR_SECTION_ORDER) {
    const s = sections.find((x) => x.key === key);
    if (s) ordered.push(s);
  }

  return {
    liveId,
    platformId,
    contentKind,
    isVideo,
    programWord: operatorProgramWord(platformId, contentKind),
    title: String(input?.broadcastTitle || '').trim(),
    leadSentence,
    kpis: kpis.slice(0, 4),
    sections: ordered,
    sectionKeys: ordered.map((s) => s.key),
    basisOk: basis.ok,
    commenterCount,
    returningCount: basis.ok ? returningPeople.length : null,
    unmatchedCount: basis.ok ? unmatchedPeople.length : null,
    incomparableCount: incomparable,
  };
}

/** @param {any[]} comments */
function sumKnownLikes(comments) {
  let sum = 0;
  let any = false;
  for (const c of comments) {
    if (c?.likeCount == null || c.likeCount === '') continue;
    if (typeof c.likeCount === 'string' && !String(c.likeCount).trim()) continue;
    const n = Number(c.likeCount);
    if (Number.isFinite(n) && n >= 0) {
      sum += n;
      any = true;
    }
  }
  return any ? sum : null;
}

/** @param {any[]} rows @param {string} giftWord */
function summarizeGiftRows(rows, giftWord) {
  if (!rows.length) return '';
  let amount = 0;
  let unit = '';
  let count = 0;
  for (const r of rows) {
    const amt = Number(r.ytAmount);
    const cur = String(r.ytCurrency || '').toUpperCase();
    const gc = Number(r.ytGiftCount);
    if (Number.isFinite(amt) && amt > 0) {
      amount += amt;
      unit = currencyUnit(cur);
    } else if (Number.isFinite(gc) && gc > 0) {
      count += gc;
    } else {
      count += 1;
    }
  }
  if (amount > 0) return `${giftWord} ${amount.toLocaleString('ja-JP')}${unit ? unit : ''}`;
  return `${giftWord} ${Math.max(count, rows.length).toLocaleString('ja-JP')}件`;
}

/** @param {any[]} rows @param {any} view */
function giftSortKey(rows, _view) {
  let n = 0;
  for (const r of rows) {
    const amt = Number(r.ytAmount);
    if (Number.isFinite(amt) && amt > 0) n += amt;
    else n += 1;
  }
  return n;
}

/** @param {string} cur @param {any} view */
function currencyUnit(cur) {
  if (cur === 'JPY' || cur === '¥' || cur === '￥') return '円';
  if (cur === 'BITS') return ' Bits';
  if (cur === 'KICKS') return ' Kicks';
  if (cur === 'SRPT') return 'pt';
  if (cur === 'MXCOIN' || cur === 'TTCOIN') return 'コイン';
  if (cur === 'TCSCORE') return 'スコア';
  if (cur === 'WWITEM') return '個';
  return cur ? ` ${cur}` : '';
}

function buildGiftCards({ support, giftWord, view: _view, officialGiftPts, estimates }) {
  /** @type {Array<{ value: string, label: string, hint: string }>} */
  const cards = [];
  if (support.length) {
    cards.push({ value: `${support.length.toLocaleString('ja-JP')}件`, label: `${giftWord || '応援'}の件数`, hint: 'このPCの記録' });
  }
  const pts = numOrNull(officialGiftPts);
  if (pts != null) {
    cards.push({ value: `${pts.toLocaleString('ja-JP')}pt`, label: 'ptの合計', hint: '公式の履歴' });
  }
  const senders = new Set();
  for (const r of support) {
    const u = uidOf(r) || nameOf(r);
    if (u) senders.add(u);
  }
  if (senders.size) {
    cards.push({ value: `${senders.size.toLocaleString('ja-JP')}人`, label: '贈ってくれた人', hint: '記録に名前があった人' });
  }
  for (const est of estimates) {
    cards.push({ value: est.text, label: `推定 ${est.label.replace(/^推定（|）$/g, '').replace(/^推定/, '')}`.trim(), hint: est.note ? '公式の単価による推定' : '推定' });
  }
  return cards;
}

function giftLedgerRows(support, _view) {
  return support
    .slice()
    .sort((a, b) => capturedAtOf(a) - capturedAtOf(b))
    .map((r) => ({
      timeText: capturedAtOf(r) ? formatClock(capturedAtOf(r)) : '',
      name: nameOf(r),
      login: String(r.login || '').trim(),
      uid: uidOf(r),
      comparable: !!uidOf(r),
      label: String(r.ytGiftName || r.text || '').trim() || String(r.ytKind || ''),
      amount: Number(r.ytAmount) > 0 ? `${Number(r.ytAmount).toLocaleString('ja-JP')}${currencyUnit(String(r.ytCurrency || ''))}` : (Number(r.ytGiftCount) > 0 ? `${Number(r.ytGiftCount)}件` : ''),
    }))
    .filter((r) => r.name || r.label);
}

function numOrNull(v) {
  if (v == null) return null;
  if (typeof v === 'string' && !v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/** 測れていない 0 は「無い」とみなす。サマリーに 0 を出さないための判定。 */
function measuredPositiveCount(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function daySpan(comments) {
  const days = new Set();
  for (const c of comments) {
    const at = capturedAtOf(c);
    if (!at) continue;
    const d = new Date(at);
    days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }
  return days.size;
}

function dayPeakBuckets(comments) {
  /** @type {Map<string, { startAt: number, count: number, label: string }>} */
  const map = new Map();
  for (const c of comments) {
    const at = capturedAtOf(c);
    if (!at) continue;
    const d = new Date(at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const startAt = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const prev = map.get(key);
    if (!prev) map.set(key, { startAt, count: 1, label: formatDay(startAt) });
    else prev.count += 1;
  }
  return [...map.values()].sort((a, b) => a.startAt - b.startAt);
}

function peakSummary(buckets, useDay) {
  if (!buckets.length) return '';
  const top = buckets.slice().sort((a, b) => b.count - a.count)[0];
  if (!top || top.count <= 0) return '';
  const second = buckets.slice().sort((a, b) => b.count - a.count)[1];
  const unit = useDay ? '' : 'ごろ';
  let s = `いちばん多いのは ${top.label}${unit}（${top.count.toLocaleString('ja-JP')}件）です。`;
  if (second && second.count > 0 && second !== top) {
    s += ` 次は ${second.label}${unit}（${second.count.toLocaleString('ja-JP')}件）です。`;
  }
  return s;
}

function buildLeadSentence(p) {
  const parts = [];
  if (p.commenterCount > 0) {
    let s = `この${p.isVideo ? '動画' : '配信'}にコメントした ${p.commenterCount.toLocaleString('ja-JP')}人`;
    if (p.basisOk && p.returningCount != null) {
      s += `のうち、${p.returningCount.toLocaleString('ja-JP')}人は以前の配信でも書いてくれていました`;
    }
    s += '。';
    parts.push(s);
  }
  if (p.pendingCount != null && p.pendingCount > 0) {
    parts.push(`投稿者のおへんじやハートがまだついていないコメントが ${p.pendingCount.toLocaleString('ja-JP')}件あります。`);
  } else if (p.giftCount > 0 && p.giftWord) {
    if (p.officialGiftPts != null) {
      parts.push(`${p.giftWord}は ${p.giftCount.toLocaleString('ja-JP')}件・${p.officialGiftPts.toLocaleString('ja-JP')}pt。`);
    } else {
      parts.push(`${p.giftWord}は ${p.giftCount.toLocaleString('ja-JP')}件あります。`);
    }
  }
  if (p.peakNote) parts.push(p.peakNote);
  return parts.join('');
}

/**
 * 「作った数字」をレポートに出していないことの検査用。
 * @param {ReturnType<typeof buildOperatorReportModel>} model
 * @returns {string[]}
 */
export function inventedNumberViolations(model) {
  /** @type {string[]} */
  const v = [];
  if (!model) return ['model が無い'];
  if (!model.basisOk) {
    if (model.returningCount != null) v.push('過去配信が無いのに returningCount を出している');
    if (model.unmatchedCount != null) v.push('過去配信が無いのに unmatchedCount を出している');
    const who = model.sections.find((s) => s.key === 'who');
    if (who && (who.data.returningCount > 0 || who.data.unmatchedCount != null)) {
      v.push('過去配信が無いのに誰が来たかで新規／再訪の数を出している');
    }
    const blob = JSON.stringify(model);
    if (/新規\s*100%|全員が「?新規|newRatio|100%/.test(blob) && /新規/.test(blob)) {
      v.push('過去配信が無いのに新規100%に読める値がある');
    }
  }
  for (const est of (model.sections.find((s) => s.key === 'gifts')?.data?.estimates || [])) {
    if (!/[0-9]/.test(String(est.text || ''))) v.push(`推定に数字が無い: ${est.text}`);
    if (String(est.text || '').trim() === '—') v.push('推定がダッシュだけ');
  }
  return v;
}
