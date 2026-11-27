import { isSiteDefaultSilhouetteUrl, faceForRowKey, noAvatarFace } from './avatarFallbackFromUrl.js';
import { pickAvatarUrlForUid } from './deriveAvatarUrlFromUid.js';
import { mergeVideoCommentLists, videoCommentsDetailHtml } from './videoWatch/videoCommentDetail.js';
/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】いま見えている視聴者について、このPCの記録から「行動」を組むことと、その文言・HTML
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.* / 新しい Observer / タイマー
 * 【書けるstorageキー】なし（呼び出し側が nls_viewer_behavior_board_v1 などに書く）
 * 【正本宣言】活動している人が最初に見たい「視聴者の行動」の言葉と並びはこのファイル
 */

export const VIEWER_BEHAVIOR_TITLE = '視聴者の行動';
export const VIEWER_BEHAVIOR_ROW_CAP = 20;
export const VIEWER_BEHAVIOR_GRID_CAP = 80;
export const VIEWER_BEHAVIOR_TIME_ZONE = 'Asia/Tokyo';
export const VIEWER_BEHAVIOR_ANON_ID = '__anon__';
export const VIEWER_BEHAVIOR_FALLBACK_AVATAR = noAvatarFace();

/**
 * ニコ生の 184 / a: / 「匿名」「匿名938」など、一人ずつ並べない匿名か。
 * YouTube の UC や @名前は匿名にしない。
 * @param {unknown} id
 * @param {unknown} [name]
 */
export function isAnonymousViewer(id, name) {
  const i = String(id == null ? '' : id).trim();
  const n = String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
  if (!i || i === VIEWER_BEHAVIOR_ANON_ID) return true;
  if (/^(__anon_|anon:|a:)/i.test(i)) return true;
  if (/^184$/.test(i)) return true;
  if (/^匿名\d*$/.test(n) || n === '184' || n === '匿名さん') return true;
  return false;
}

/**
 * 配信モードの応援アイコン列と同じ解決。既にある URL を優先し、無ければ数値 ID から公開アイコン URL を作る。
 * @param {unknown} id
 * @param {unknown} [avatarUrl]
 * @param {string} [platform]
 * @returns {string}
 */
export function resolveViewerBehaviorAvatarUrl(id, avatarUrl, platform = '') {
  const given = String(avatarUrl || '').trim();
  if (/^https?:/i.test(given) && !isSiteDefaultSilhouetteUrl(given)) return given;
  const derived = platform === 'niconico' && !isSiteDefaultSilhouetteUrl(given)
    ? pickAvatarUrlForUid(/** @type {string | number} */ (id), null) : '';
  return derived || (id ? faceForRowKey(platform + ':' + String(id)) : VIEWER_BEHAVIOR_FALLBACK_AVATAR);
}

/**
 * @typedef {{
 *   id: string,
 *   name?: string,
 *   commentCount?: number | null,
 *   giftCount?: number | null,
 *   knownAmountJpy?: number | null,
 *   at?: number | null,
 *   creatorReplies?: ViewerBehaviorReply[],
 *   viewerReplies?: ViewerBehaviorReply[],
 *   comments?: any[],
 *   handle?: string,
 *   channelUrl?: string,
 *   pageOrder?: number,
 * }} ViewerBehaviorVisiblePerson
 *
 * @typedef {{
 *   name?: string,
 *   commentCount?: number | null,
 *   giftCount?: number | null,
 *   knownAmountJpy?: number | null,
 *   firstAt?: number | null,
 *   lastAt?: number | null,
 *   liveVisits?: number | null,
 *   videoVisits?: number | null,
 *   seenLive?: boolean,
 *   seenVideo?: boolean,
 * }} ViewerBehaviorHistory
 *
 * @typedef {{
 *   id: string,
 *   name: string,
 *   relation: 'regular' | 'new' | 'unknown',
 *   relationLabel: string,
 *   liveVisits: number | null,
 *   videoVisits: number | null,
 *   seenLive: boolean,
 *   seenVideo: boolean,
 *   commentCount: number | null,
 *   giftCount: number | null,
 *   knownAmountJpy: number | null,
 *   firstSeenAt: number | null,
 *   lastSeenAt: number | null,
 *   firstSeenText: string,
 *   lastSeenText: string,
 *   factLine: string,
 *   isAnonymous?: boolean,
 *   anonymousCount?: number,
 *   pending?: boolean,
 *   pageAt?: number | null,
 *   avatarUrl?: string,
 *   commentAnchor?: string,
 *   creatorReplies?: ViewerBehaviorReply[],
 *   viewerReplies?: ViewerBehaviorReply[],
 *   comments?: any[],
 *   handle?: string,
 *   channelUrl?: string,
 *   pageOrder?: number,
 * }} ViewerBehaviorRow
 *
 * @typedef {{
 *   title: string,
 *   historyReady: boolean,
 *   visibleCount: number,
 *   regularCount: number,
 *   newCount: number,
 *   unknownCount: number,
 *   summary: string,
 *   rows: ViewerBehaviorRow[],
 *   truncated: boolean,
 *   anonymousCount?: number,
 *   pendingCount?: number | null,
 *   pendingKnown?: boolean,
 *   commentsTotal?: number,
 *   giftCountTotal?: number,
 *   knownAmountTotal?: number,
 *   spend?: any,
 *   takeHome?: any,
 *   viewCount?: number | null,
 *   platform?: string,
 *   contentKind?: 'video' | 'live',
 * }} ViewerBehaviorBoard
 */

/**
 * @param {unknown} v
 * @returns {string}
 */
function cleanId(v) {
  return String(v == null ? '' : v).trim();
}

/**
 * @param {unknown} v
 * @returns {number | null}
 */
function nonNegIntOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/**
 * @param {unknown} v
 * @returns {number | null}
 */
function positiveMsOrNull(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/**
 * @param {unknown} s
 * @returns {string}
 */
export function escapeViewerBehaviorHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Asia/Tokyo の短い日時。年が同じなら月日だけ、同じ日なら時刻も付ける。
 * @param {number | null | undefined} ms
 * @param {number | null | undefined} nowMs
 * @param {string} [timeZone]
 * @returns {string}
 */
export function formatViewerBehaviorSeenAt(ms, nowMs, timeZone = VIEWER_BEHAVIOR_TIME_ZONE) {
  const at = positiveMsOrNull(ms);
  if (at == null) return '';
  const tz = String(timeZone || VIEWER_BEHAVIOR_TIME_ZONE);
  const now = positiveMsOrNull(nowMs) ?? at;
  const atParts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(at));
  const nowParts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date(now));
  /** @param {Intl.DateTimeFormatPart[]} parts @param {string} type */
  const pick = (parts, type) => {
    const row = parts.find((p) => p.type === type);
    return row ? row.value : '';
  };
  const y = pick(atParts, 'year');
  const m = pick(atParts, 'month');
  const d = pick(atParts, 'day');
  const hour = pick(atParts, 'hour');
  const minute = pick(atParts, 'minute');
  const sameDay =
    y === pick(nowParts, 'year') && m === pick(nowParts, 'month') && d === pick(nowParts, 'day');
  const dateText = y === pick(nowParts, 'year') ? `${m}/${d}` : `${y}/${m}/${d}`;
  if (sameDay && hour && minute) return `${dateText} ${hour}:${minute}`;
  return dateText;
}

/**
 * 索引の1人分を、行動の履歴の形にする（古い索引で欠けている欄は unknown のまま）。
 * @param {any} entry
 * @returns {ViewerBehaviorHistory}
 */
export function historyFromCommenterIndexEntry(entry) {
  const src = entry && typeof entry === 'object' ? entry : {};
  const commentCount = nonNegIntOrNull(src.c ?? src.commentCount);
  const giftCount = nonNegIntOrNull(src.g ?? src.giftCount);
  const knownAmountJpy = nonNegIntOrNull(src.a ?? src.knownAmountJpy);
  const firstAt = positiveMsOrNull(src.f ?? src.firstAt);
  const lastAt = positiveMsOrNull(src.t ?? src.lastAt);
  const liveVisits = nonNegIntOrNull(src.lv ?? src.liveVisits);
  const videoVisits = nonNegIntOrNull(src.vv ?? src.videoVisits);
  const hasVisitFields = src.lv != null || src.vv != null || src.seenLive != null || src.seenVideo != null
    || src.liveVisits != null || src.videoVisits != null;
  // 古い索引は配信コメントだけだったので、訪問回数の欄が無い人は配信で見かけた扱い。
  const seenLive = src.seenLive === true || (liveVisits != null && liveVisits > 0)
    || (!hasVisitFields && commentCount != null);
  const seenVideo = src.seenVideo === true || (videoVisits != null && videoVisits > 0);
  return {
    name: String(src.n || src.name || '').replace(/\s+/g, ' ').trim(),
    commentCount,
    giftCount,
    knownAmountJpy,
    firstAt,
    lastAt,
    liveVisits,
    videoVisits,
    seenLive: !!seenLive,
    seenVideo: !!seenVideo,
  };
}

/**
 * @param {ViewerBehaviorHistory | null | undefined} history
 * @param {boolean} historyReady
 * @returns {'regular' | 'new' | 'unknown'}
 */
export function classifyViewerRelation(history, historyReady) {
  if (!historyReady) return 'unknown';
  const h = history && typeof history === 'object' ? history : null;
  if (!h) return 'new';
  if (h.seenLive || h.seenVideo || (h.liveVisits != null && h.liveVisits > 0) || (h.videoVisits != null && h.videoVisits > 0)) {
    return 'regular';
  }
  return 'new';
}

/**
 * @param {'regular' | 'new' | 'unknown'} relation
 * @returns {string}
 */
export function viewerRelationLabel(relation) {
  if (relation === 'regular') return 'なじみ';
  if (relation === 'new') return '初めて';
  return '記録がまだない';
}

/**
 * @param {ViewerBehaviorVisiblePerson} person
 * @param {ViewerBehaviorHistory | null | undefined} history
 * @param {{ historyReady?: boolean, nowMs?: number }} [opts]
 * @returns {ViewerBehaviorRow}
 */
export function buildViewerBehaviorRow(person, history, opts = {}) {
  const src = person && typeof person === 'object' ? person : { id: '' };
  const hist = history && typeof history === 'object' ? history : null;
  const historyReady = opts.historyReady != null ? !!opts.historyReady : !!hist;
  const id = cleanId(src.id);
  const name = String(src.name || hist?.name || id).replace(/\s+/g, ' ').trim() || id;
  const relation = classifyViewerRelation(hist, historyReady);
  const liveVisits = hist?.liveVisits ?? null;
  const videoVisits = hist?.videoVisits ?? null;
  const pageComments = nonNegIntOrNull(src.commentCount);
  const histComments = hist?.commentCount ?? null;
  const commentCount =
    pageComments != null && histComments != null
      ? Math.max(pageComments, histComments)
      : histComments ?? pageComments;
  const pageGifts = nonNegIntOrNull(src.giftCount);
  const histGifts = hist?.giftCount ?? null;
  const giftCount =
    pageGifts != null && histGifts != null ? Math.max(pageGifts, histGifts) : histGifts ?? pageGifts;
  const pageAmt = nonNegIntOrNull(src.knownAmountJpy);
  const histAmt = hist?.knownAmountJpy ?? null;
  const knownAmountJpy =
    pageAmt != null && histAmt != null ? Math.max(pageAmt, histAmt) : histAmt ?? pageAmt;
  const firstSeenAt = hist?.firstAt ?? positiveMsOrNull(src.at);
  const lastSeenAt = hist?.lastAt ?? positiveMsOrNull(src.at);
  const nowMs = opts.nowMs;
  const firstSeenText = formatViewerBehaviorSeenAt(firstSeenAt, nowMs);
  const lastSeenText = formatViewerBehaviorSeenAt(lastSeenAt, nowMs);
  const facts = [];
  if (liveVisits != null && liveVisits > 0) facts.push(`配信 ${liveVisits.toLocaleString('ja-JP')} 回`);
  else if (hist?.seenLive) facts.push('配信に来たことがある');
  if (videoVisits != null && videoVisits > 0) facts.push(`動画 ${videoVisits.toLocaleString('ja-JP')} 回`);
  else if (hist?.seenVideo) facts.push('動画に来たことがある');
  if (commentCount != null) facts.push(`コメント ${commentCount.toLocaleString('ja-JP')}`);
  if (giftCount != null && giftCount > 0) {
    facts.push(knownAmountJpy != null && knownAmountJpy > 0
      ? `ギフト ${giftCount.toLocaleString('ja-JP')} 件 約¥${knownAmountJpy.toLocaleString('ja-JP')}`
      : `ギフト ${giftCount.toLocaleString('ja-JP')} 件`);
  } else if (knownAmountJpy != null && knownAmountJpy > 0) {
    facts.push(`ギフト 約¥${knownAmountJpy.toLocaleString('ja-JP')}`);
  }
  if (firstSeenText) facts.push(`最初 ${firstSeenText}`);
  if (lastSeenText && lastSeenText !== firstSeenText) facts.push(`いちばん新しい ${lastSeenText}`);
  return {
    id,
    name,
    relation,
    relationLabel: viewerRelationLabel(relation),
    liveVisits,
    videoVisits,
    seenLive: !!hist?.seenLive,
    seenVideo: !!hist?.seenVideo,
    commentCount,
    giftCount,
    knownAmountJpy,
    firstSeenAt: firstSeenAt ?? null,
    lastSeenAt: lastSeenAt ?? null,
    firstSeenText,
    lastSeenText,
    factLine: facts.join(' ・ '),
  };
}

/**
 * @param {ViewerBehaviorRow} a
 * @param {ViewerBehaviorRow} b
 * @returns {number}
 */
function compareBehaviorRows(a, b) {
  // なじみ → ギフトを贈った人 → ほか → 匿名の1枚
  const anonA = a.isAnonymous ? 1 : 0;
  const anonB = b.isAnonymous ? 1 : 0;
  if (anonA !== anonB) return anonA - anonB;
  const regularA = a.relation === 'regular' ? 0 : 1;
  const regularB = b.relation === 'regular' ? 0 : 1;
  if (regularA !== regularB) return regularA - regularB;
  const giftedA = (a.giftCount || 0) > 0 || (a.knownAmountJpy || 0) > 0 ? 0 : 1;
  const giftedB = (b.giftCount || 0) > 0 || (b.knownAmountJpy || 0) > 0 ? 0 : 1;
  if (giftedA !== giftedB) return giftedA - giftedB;
  const giftA = a.knownAmountJpy || 0;
  const giftB = b.knownAmountJpy || 0;
  if (giftA !== giftB) return giftB - giftA;
  const gA = a.giftCount || 0;
  const gB = b.giftCount || 0;
  if (gA !== gB) return gB - gA;
  const cA = a.commentCount || 0;
  const cB = b.commentCount || 0;
  if (cA !== cB) return cB - cA;
  const tA = a.lastSeenAt || 0;
  const tB = b.lastSeenAt || 0;
  if (tA !== tB) return tB - tA;
  return String(a.name).localeCompare(String(b.name), 'ja');
}

/**
 * 通常動画の並び: 新しいコメントの人が先・同じ時刻はページの順・匿名の1枚は最後。
 * @param {any} a
 * @param {any} b
 * @returns {number}
 */
export function compareVideoRows(a, b) {
  const anonA = a.isAnonymous ? 1 : 0;
  const anonB = b.isAnonymous ? 1 : 0;
  if (anonA !== anonB) return anonA - anonB;
  const tA = Number(a.pageAt) || 0;
  const tB = Number(b.pageAt) || 0;
  if (tA !== tB) return tB - tA;
  return (Number(a.pageOrder) || 0) - (Number(b.pageOrder) || 0);
}

/**
 * @param {{
 *   visiblePeople?: readonly ViewerBehaviorVisiblePerson[] | null,
 *   historyById?: Record<string, ViewerBehaviorHistory | any> | Map<string, any> | null,
 *   historyReady?: boolean,
 *   nowMs?: number,
 *   cap?: number,
 *   spend?: any,
 *   takeHome?: any,
 *   viewCount?: number | string | null,
 *   platform?: string,
 *   contentKind?: string,
 * }} input
 * @returns {ViewerBehaviorBoard}
 */
export function buildViewerBehaviorBoard(input) {
  const src = input && typeof input === 'object' ? input : {};
  const visible = Array.isArray(src.visiblePeople) ? src.visiblePeople : [];
  const rawHist = src.historyById;
  /** @param {string} id */
  const histOf = (id) => {
    if (!rawHist) return null;
    if (rawHist instanceof Map) return rawHist.get(id) || null;
    if (typeof rawHist === 'object') return rawHist[id] || null;
    return null;
  };
  const historyCount =
    rawHist instanceof Map ? rawHist.size : rawHist && typeof rawHist === 'object' ? Object.keys(rawHist).length : 0;
  const historyReady = src.historyReady != null ? !!src.historyReady : historyCount > 0;
  const cap = Number.isFinite(Number(src.cap)) && Number(src.cap) > 0
    ? Math.floor(Number(src.cap))
    : VIEWER_BEHAVIOR_GRID_CAP;
  /** @type {Map<string, ViewerBehaviorVisiblePerson & { pending?: boolean | null, avatarUrl?: string, commentAnchor?: string, anonymousCount?: number }>} */
  const byId = new Map();
  /** @type {{ commentCount: number, giftCount: number, knownAmountJpy: number, at: number, pendingCount: number, people: number }} */
  const anonAcc = { commentCount: 0, giftCount: 0, knownAmountJpy: 0, at: 0, pendingCount: 0, people: 0 };
  let pendingKnown = false;
  let pendingTotal = 0;
  for (const p of visible) {
    const rawId = cleanId(p?.id);
    const name = String(p?.name || '').replace(/\s+/g, ' ').trim();
    const commentCount = nonNegIntOrNull(p?.commentCount) ?? 1;
    const giftCount = nonNegIntOrNull(p?.giftCount);
    const knownAmountJpy = nonNegIntOrNull(p?.knownAmountJpy);
    const at = positiveMsOrNull(p?.at);
    const pending = p?.pending === true ? true : p?.pending === false ? false : null;
    if (pending != null) pendingKnown = true;
    if (isAnonymousViewer(rawId, name)) {
      anonAcc.people += 1;
      anonAcc.commentCount += commentCount;
      if (giftCount != null) anonAcc.giftCount += giftCount;
      if (knownAmountJpy != null) anonAcc.knownAmountJpy += knownAmountJpy;
      if (at != null && at > anonAcc.at) anonAcc.at = at;
      if (pending === true) anonAcc.pendingCount += 1;
      if (pending === true) pendingTotal += 1;
      continue;
    }
    if (!rawId) continue;
    if (pending === true) pendingTotal += 1;
    const prev = byId.get(rawId);
    if (!prev) {
      byId.set(rawId, {
        id: rawId,
        name,
        commentCount,
        giftCount,
        knownAmountJpy,
        at,
        pending,
        avatarUrl: String(p?.avatarUrl || '').trim(),
        commentAnchor: String(p?.commentAnchor || '').trim(),
        creatorReplies: listRepliesOf(p).creatorReplies,
        viewerReplies: listRepliesOf(p).viewerReplies,
        comments: Array.isArray(p?.comments) ? mergeVideoCommentLists(p.comments, []) : [],
        handle: String(p?.handle || '').trim(),
        channelUrl: String(p?.channelUrl || '').trim(),
        pageOrder: byId.size,
      });
      continue;
    }
    if (Array.isArray(p?.comments) && p.comments.length) prev.comments = mergeVideoCommentLists(prev.comments, p.comments);
    if (!prev.handle && p?.handle) prev.handle = String(p.handle).trim();
    prev.commentCount = (prev.commentCount || 0) + commentCount;
    if (giftCount != null) prev.giftCount = (prev.giftCount || 0) + giftCount;
    if (knownAmountJpy != null) prev.knownAmountJpy = (prev.knownAmountJpy || 0) + knownAmountJpy;
    if (at != null && (prev.at == null || at > prev.at)) prev.at = at;
    if (name && name.length > String(prev.name || '').length) prev.name = name;
    if (!prev.avatarUrl && p?.avatarUrl) prev.avatarUrl = String(p.avatarUrl).trim();
    if (!prev.commentAnchor && p?.commentAnchor) prev.commentAnchor = String(p.commentAnchor).trim();
    if (pending === true) prev.pending = true;
    const extra = listRepliesOf(p);
    prev.creatorReplies = mergeReplyLists(prev.creatorReplies, extra.creatorReplies);
    prev.viewerReplies = mergeReplyLists(prev.viewerReplies, extra.viewerReplies);
  }
  const rows = [];
  for (const person of byId.values()) {
    const raw = histOf(person.id);
    const history = raw ? historyFromCommenterIndexEntry(raw) : null;
    const row = buildViewerBehaviorRow(person, history, { historyReady, nowMs: src.nowMs });
    row.avatarUrl = resolveViewerBehaviorAvatarUrl(person.id, person.avatarUrl, String(src.platform || ''));
    row.commentAnchor = String(person.commentAnchor || '').trim();
    row.pending = person.pending === true;
    row.isAnonymous = false;
    row.anonymousCount = 0;
    row.pageAt = Number(person.at) > 0 ? Math.floor(Number(person.at)) : 0;
    row.creatorReplies = Array.isArray(person.creatorReplies) ? person.creatorReplies : [];
    row.viewerReplies = Array.isArray(person.viewerReplies) ? person.viewerReplies : [];
    row.pageOrder = Number(person.pageOrder) || 0;
    if (Array.isArray(person.comments) && person.comments.length) row.comments = person.comments;
    if (person.handle) row.handle = person.handle;
    if (person.channelUrl) row.channelUrl = person.channelUrl;
    rows.push(row);
  }
  if (anonAcc.people > 0) {
    const row = buildViewerBehaviorRow(
      {
        id: VIEWER_BEHAVIOR_ANON_ID,
        name: '匿名',
        commentCount: anonAcc.commentCount,
        giftCount: anonAcc.giftCount || null,
        knownAmountJpy: anonAcc.knownAmountJpy || null,
        at: anonAcc.at || null,
      },
      null,
      { historyReady: false, nowMs: src.nowMs },
    );
    row.name = `匿名 ${anonAcc.people.toLocaleString('ja-JP')}人`;
    row.relation = 'unknown';
    row.relationLabel = '匿名';
    row.isAnonymous = true;
    row.anonymousCount = anonAcc.people;
    row.pending = anonAcc.pendingCount > 0;
    row.avatarUrl = resolveViewerBehaviorAvatarUrl('', '') ;
    row.commentAnchor = '';
    row.pageAt = anonAcc.at || 0;
    row.factLine = [
      `いま見えている匿名 ${anonAcc.people.toLocaleString('ja-JP')} 人をまとめています`,
      `コメント ${anonAcc.commentCount.toLocaleString('ja-JP')}`,
      anonAcc.giftCount > 0
        ? (anonAcc.knownAmountJpy > 0
          ? `ギフト ${anonAcc.giftCount.toLocaleString('ja-JP')} 件 約¥${anonAcc.knownAmountJpy.toLocaleString('ja-JP')}`
          : `ギフト ${anonAcc.giftCount.toLocaleString('ja-JP')} 件`)
        : '',
    ].filter(Boolean).join(' ・ ');
    rows.push(row);
  }
  // v0.1.2263: 通常動画は「新しいコメント順」(りんく 2026-11-26 会議の結論・11-27「最新順にならんでいない」)。
  //   ライブと同じ並び(なじみ→ギフト→コメント数→時刻→名前)だと、2件書いた人が先頭・同じ「2週間前」は名前順になっていた。
  //   時刻が同じ(YouTube は「7か月前」のような丸めた時刻しか無い)・分からないときは、ページに出ている順のまま。上限で切るのも並べた後。
  rows.sort(src.contentKind === 'video' ? compareVideoRows : compareBehaviorRows);
  const named = rows.filter((r) => !r.isAnonymous);
  const regularCount = named.filter((r) => r.relation === 'regular').length;
  const newCount = named.filter((r) => r.relation === 'new').length;
  const unknownCount = named.filter((r) => r.relation === 'unknown').length;
  const anonymousCount = anonAcc.people;
  const visibleCount = named.length + anonymousCount;
  const truncated = named.length > cap;
  const shown = [...named.slice(0, cap), ...rows.filter((r) => r.isAnonymous)];
  const pendingCount = pendingKnown ? pendingTotal : null;
  const parts = [];
  if (historyReady) {
    parts.push(`なじみ ${regularCount.toLocaleString('ja-JP')}人`);
    parts.push(`初めて ${newCount.toLocaleString('ja-JP')}人`);
  } else if (named.length > 0) {
    parts.push(`いま見えている人 ${named.length.toLocaleString('ja-JP')}人`);
  }
  if (anonymousCount > 0) parts.push(`匿名 ${anonymousCount.toLocaleString('ja-JP')}人`);
  if (pendingCount != null) parts.push(`未対応 ${pendingCount.toLocaleString('ja-JP')}件`);
  let summary = parts.length ? parts.join(' / ') : 'いま見えているコメントの投稿者がまだいません。';
  if (visibleCount > 0 && !historyReady && named.length > 0) {
    summary = `${summary}。このチャンネルの配信や動画を、このPCで記録すると、なじみか初めてかを見分けられます。`;
  }
  // 合計は、いま見えているコメント・ギフトだけ（過去の配信の累計は行の説明に残す）
  const commentsTotal = [...byId.values()].reduce((n, p) => n + (Number(p.commentCount) || 0), 0) + anonAcc.commentCount;
  const giftCountTotal = [...byId.values()].reduce((n, p) => n + (Number(p.giftCount) || 0), 0) + anonAcc.giftCount;
  const knownAmountTotal = [...byId.values()].reduce((n, p) => n + (Number(p.knownAmountJpy) || 0), 0) + anonAcc.knownAmountJpy;
  return {
    title: VIEWER_BEHAVIOR_TITLE,
    historyReady,
    visibleCount,
    regularCount,
    newCount,
    unknownCount,
    anonymousCount,
    pendingCount,
    pendingKnown,
    summary,
    commentsTotal,
    giftCountTotal,
    knownAmountTotal,
    spend: src.spend || null,
    takeHome: src.takeHome || null,
    viewCount: Number.isFinite(Number(src.viewCount)) && Number(src.viewCount) >= 0 ? Math.floor(Number(src.viewCount)) : null,
    platform: String(src.platform || '').trim() || '',
    contentKind: src.contentKind === 'video' ? 'video' : 'live',
    rows: shown,
    truncated,
  };
}

/**
 * ホバーカードなど1行で添えるときの文言。履歴が無ければ空（既存の数字を変えない）。
 * @param {ViewerBehaviorRow | null | undefined} row
 * @returns {string}
 */
export function viewerBehaviorHoverLine(row) {
  if (!row || !row.id) return '';
  if (row.relation === 'unknown' && !row.factLine) return '';
  return row.factLine ? `${row.relationLabel} ・ ${row.factLine}` : row.relationLabel;
}

/**
 * @param {ViewerBehaviorBoard | null | undefined} board
 * @returns {string}
 */
export function viewerBehaviorBoardInnerHtml(board) {
  if (!board || typeof board !== 'object') return '';
  const esc = escapeViewerBehaviorHtml;
  const items = Array.isArray(board.rows) ? board.rows : [];
  const pendingKnown = board.pendingKnown === true;
  const pendingCount = pendingKnown && board.pendingCount != null ? Number(board.pendingCount) : null;
  const summary = String(board.summary || '').trim();
  const more = board.truncated
    ? `<p class="nlsb-viewer-behavior__more">ほかの人は、いま見えている範囲の先頭 ${esc(String(items.filter((r) => !r.isAnonymous).length))} 人まで出しています。</p>`
    : '';
  const totals = [];
  if (board.commentsTotal > 0) totals.push(`コメント ${Number(board.commentsTotal).toLocaleString('ja-JP')} 件`);
  if (board.giftCountTotal > 0) {
    totals.push(
      board.knownAmountTotal > 0
        ? `ギフト ${Number(board.giftCountTotal).toLocaleString('ja-JP')} 件 約¥${Number(board.knownAmountTotal).toLocaleString('ja-JP')}`
        : `ギフト ${Number(board.giftCountTotal).toLocaleString('ja-JP')} 件`,
    );
  }
  if (board.spend && board.spend.text) totals.push(`${board.spend.label || '推定（視聴者の購入額）'} ${board.spend.text}`);
  if (board.takeHome && board.takeHome.text) totals.push(`${board.takeHome.label || '推定（配信者の受取）'} ${board.takeHome.text}`);
  const totalLine = totals.length
    ? `<p class="nlsb-viewer-behavior__totals">${esc(totals.join(' / '))}</p>`
    : '';
  const pendingBtn = pendingCount != null
    ? `<button type="button" class="nlsb-viewer-behavior__pending-toggle" data-pending-toggle="1" aria-pressed="false">未対応だけ見る</button>`
    : '';
  const scope = `<p class="nlsb-viewer-behavior__scope">いまページに読み込まれているコメントだけを見ています。</p>`;
  // タイル本体は描画層が配信モードの paintStoryUserLaneDomFilled で足す。ここは器だけ。
  // 通常動画では「視聴者の行動」の要約板を常時出さない。サムネイル列と、タップ後の詳細だけ。
  if (board.contentKind === 'video') {
    return (
      `<section class="nlsb-viewer-behavior nlsb-viewer-behavior--video" data-content-kind="video" aria-label="コメントした人">` +
      pendingBtn +
      `<div data-live-lane-host></div>` +
      `<div class="nlsb-viewer-behavior__detail" hidden></div>` +
      `</section>`
    );
  }
  return (
    `<section class="nlsb-viewer-behavior" data-collapsed="0" aria-label="${esc(VIEWER_BEHAVIOR_TITLE)}">` +
    `<h2 class="nlsb-viewer-behavior__title">${esc(board.title || VIEWER_BEHAVIOR_TITLE)}</h2>` +
    `<button type="button" class="nlsb-viewer-behavior__summary-btn" data-summary-toggle="1" aria-expanded="true">${esc(summary)}</button>` +
    `<div class="nlsb-viewer-behavior__body">` +
    totalLine +
    pendingBtn +
    `<div data-stat-strip-host></div>` +
    `<div data-live-lane-host></div>` +
    `<div class="nlsb-viewer-behavior__detail" hidden></div>` +
    more +
    scope +
    `</div>` +
    `</section>`
  );
}

/**
 * 返信を、投稿者の返信と視聴者の返信に分ける。replyLevel が 1 以上、または parentId / isReply があるものだけを返信とする。
 * isCreator が真、または kind が creator なら投稿者の返信。
 * @param {readonly any[] | null | undefined} items
 * @returns {{ creatorReplies: ViewerBehaviorReply[], viewerReplies: ViewerBehaviorReply[] }}
 */
export function splitCreatorViewerReplies(items) {
  const list = Array.isArray(items) ? items : [];
  /** @type {ViewerBehaviorReply[]} */
  const creatorReplies = [];
  /** @type {ViewerBehaviorReply[]} */
  const viewerReplies = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const level = Number(raw.replyLevel);
    const parentId = String(raw.parentId || '').trim();
    const isReply = raw.isReply === true || (Number.isFinite(level) && level > 0) || !!parentId;
    if (!isReply) continue;
    const row = normalizeReply(raw);
    if (!row.name && !row.id) continue;
    if (row.kind === 'creator') creatorReplies.push(row);
    else viewerReplies.push(row);
  }
  return { creatorReplies, viewerReplies };
}

/**
 * @typedef {{ id: string, name: string, kind: 'creator' | 'viewer', at: number | null, avatarUrl?: string }} ViewerBehaviorReply
 */

/** @param {any} raw @returns {ViewerBehaviorReply} */
function normalizeReply(raw) {
  const isCreator = raw.isCreator === true || raw.kind === 'creator';
  const atNum = Number(raw.at || raw.postedAtMs);
  return {
    id: String(raw.id || raw.channelId || raw.userId || '').trim(),
    name: String(raw.name || raw.displayName || '').replace(/\s+/g, ' ').trim(),
    kind: isCreator ? 'creator' : 'viewer',
    at: Number.isFinite(atNum) && atNum > 0 ? Math.floor(atNum) : null,
    // v0.1.2263: 返信した人の顔(ページにあるときだけ・https のみ)
    ...(/^https:\/\//i.test(String(raw.avatarUrl || raw.iconUrl || '')) ? { avatarUrl: String(raw.avatarUrl || raw.iconUrl) } : {}),
  };
}

/** @param {any} person */
function listRepliesOf(person) {
  if (Array.isArray(person?.creatorReplies) || Array.isArray(person?.viewerReplies)) {
    return {
      creatorReplies: Array.isArray(person.creatorReplies) ? person.creatorReplies.map(normalizeReply) : [],
      viewerReplies: Array.isArray(person.viewerReplies) ? person.viewerReplies.map(normalizeReply) : [],
    };
  }
  return splitCreatorViewerReplies(person?.replies || person?.replyItems || []);
}

/** @param {ViewerBehaviorReply[] | null | undefined} a @param {ViewerBehaviorReply[] | null | undefined} b */
function mergeReplyLists(a, b) {
  const seen = new Set();
  /** @type {ViewerBehaviorReply[]} */
  const out = [];
  for (const r of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
    const row = normalizeReply(r);
    const key = `${row.kind}:${row.id}:${row.name}:${row.at || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/**
 * 親コメントの投稿者ごとに、付いた返信を creator / viewer に分けて載せる。
 * comments は { id|channelId|userId, name, commentId, parentId, isCreator, replyLevel, at|postedAtMs }。
 * @param {readonly any[]} people
 * @param {readonly any[] | null | undefined} comments
 * @returns {any[]}
 */
export function attachRepliesToPeople(people, comments) {
  const list = Array.isArray(people) ? people : [];
  const comm = Array.isArray(comments) ? comments : [];
  if (!comm.length) return list;
  /** @type {Map<string, any[]>} */
  const byParent = new Map();
  /** @type {Map<string, string[]>} */
  const topByAuthor = new Map();
  for (const c of comm) {
    if (!c || typeof c !== 'object') continue;
    const commentId = String(c.commentId || c.id || '').trim();
    const parentId = String(c.parentId || '').trim();
    const level = Number(c.replyLevel);
    const authorKey = String(c.channelId || c.userId || c.authorId || c.id || '').trim();
    if ((Number.isFinite(level) && level > 0) || parentId) {
      const pid = parentId || (commentId.includes('.') ? commentId.slice(0, commentId.lastIndexOf('.')) : '');
      if (!pid) continue;
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(c);
      continue;
    }
    if (authorKey && commentId) {
      if (!topByAuthor.has(authorKey)) topByAuthor.set(authorKey, []);
      topByAuthor.get(authorKey).push(commentId);
    }
  }
  return list.map((person) => {
    const key = String(person?.id || person?.channelId || person?.userId || '').trim();
    const myTops = topByAuthor.get(key) || [];
    const replies = myTops.flatMap((id) => byParent.get(id) || []);
    const split = splitCreatorViewerReplies(replies);
    return {
      ...person,
      creatorReplies: mergeReplyLists(person?.creatorReplies, split.creatorReplies),
      viewerReplies: mergeReplyLists(person?.viewerReplies, split.viewerReplies),
    };
  });
}

/**
 * サムネイルを押したときに横の欄へ出す、1人分の行動。ライブ配信のタイルには使わない。
 * @param {any} row
 * @returns {{
 *   id: string,
 *   name: string,
 *   relationLabel: string,
 *   visitsText: string,
 *   firstSeenText: string,
 *   lastSeenText: string,
 *   commentText: string,
 *   giftText: string,
 *   creatorReplies: ViewerBehaviorReply[],
 *   viewerReplies: ViewerBehaviorReply[],
 *   pending: boolean,
 *   canOpenComeview: boolean,
 *   comments: any[],
 *   handle: string,
 *   channelUrl: string,
 *   relationKnown: boolean,
 *   hasHistory: boolean,
 * }}
 */
export function buildViewerBehaviorPersonDetail(row) {
  const src = row && typeof row === 'object' ? row : {};
  const id = String(src.id || '').trim();
  const visits = [];
  if (src.liveVisits != null && Number(src.liveVisits) > 0) visits.push(`配信 ${Number(src.liveVisits).toLocaleString('ja-JP')} 回`);
  else if (src.seenLive) visits.push('配信に来たことがある');
  if (src.videoVisits != null && Number(src.videoVisits) > 0) visits.push(`動画 ${Number(src.videoVisits).toLocaleString('ja-JP')} 回`);
  else if (src.seenVideo) visits.push('動画に来たことがある');
  const commentCount = src.commentCount != null ? Number(src.commentCount) : null;
  const giftCount = src.giftCount != null ? Number(src.giftCount) : null;
  const yen = src.knownAmountJpy != null ? Number(src.knownAmountJpy) : null;
  let giftText = 'ギフト なし';
  if (giftCount != null && giftCount > 0) {
    giftText = yen != null && yen > 0
      ? `ギフト ${giftCount.toLocaleString('ja-JP')} 件 約¥${yen.toLocaleString('ja-JP')}`
      : `ギフト ${giftCount.toLocaleString('ja-JP')} 件`;
  } else if (yen != null && yen > 0) {
    giftText = `ギフト 約¥${yen.toLocaleString('ja-JP')}`;
  }
  return {
    id,
    name: String(src.name || '').replace(/\s+/g, ' ').trim() || id,
    relationLabel: String(src.relationLabel || viewerRelationLabel(src.relation) || '').trim(),
    visitsText: visits.length ? `来訪：${visits.join(' ・ ')}` : '来訪：記録がまだない',
    firstSeenText: src.firstSeenText ? `最初 ${src.firstSeenText}` : '最初：—',
    lastSeenText: src.lastSeenText ? `いちばん新しい ${src.lastSeenText}` : 'いちばん新しい：—',
    commentText: commentCount != null && Number.isFinite(commentCount)
      ? `コメント ${commentCount.toLocaleString('ja-JP')}`
      : 'コメント —',
    giftText,
    creatorReplies: Array.isArray(src.creatorReplies) ? src.creatorReplies : [],
    viewerReplies: Array.isArray(src.viewerReplies) ? src.viewerReplies : [],
    pending: src.pending === true,
    canOpenComeview: !!id && id !== VIEWER_BEHAVIOR_ANON_ID && !src.isAnonymous,
    comments: Array.isArray(src.comments) ? src.comments : [],
    handle: String(src.handle || (String(id).startsWith('@') ? id : '')).trim(),
    channelUrl: String(src.channelUrl || '').trim(),
    relationKnown: src.relation ? src.relation !== 'unknown' : !!src.relationLabel && src.relationLabel !== viewerRelationLabel('unknown'),
    hasHistory: visits.length > 0 || !!src.firstSeenText,
  };
}

/**
 * @param {ReturnType<typeof buildViewerBehaviorPersonDetail> | null | undefined} detail
 * @returns {string}
 */
export function viewerBehaviorPersonDetailInnerHtml(detail) {
  if (!detail || typeof detail !== 'object') return '';
  const esc = escapeViewerBehaviorHtml;
  const replyList = (/** @type {string} */ title, /** @type {any[]} */ rows) => {
    if (!rows.length) {
      // v0.1.2263: 返信を読めないサービス(録画など)は「なし」と書かない(分からないことを「無い」にしない)
      if (/** @type {any} */ (detail).repliesUnknown === true) return '';
      return `<div class="nlsb-person-detail__replies"><p class="nlsb-person-detail__label">${esc(title)}</p><p>なし</p></div>`;
    }
    const items = rows.map((r) => {
      const who = r.name || r.id || '名前なし';
      const kind = r.kind === 'creator' ? '投稿者の返信' : '視聴者の返信';
      return `<li data-reply-kind="${esc(r.kind)}"><span class="nlsb-person-detail__who">${esc(who)}</span>（${esc(kind)}）</li>`;
    }).join('');
    return `<div class="nlsb-person-detail__replies"><p class="nlsb-person-detail__label">${esc(title)}</p><ul>${items}</ul></div>`;
  };
  const open = detail.canOpenComeview
    ? `<button type="button" class="nlsb-person-detail__comeview" data-open-comeview="1" data-user-id="${esc(detail.id)}" data-user-name="${esc(detail.name)}">発言一覧を開く</button>`
    : '';
  const pending = detail.pending ? '<p class="nlsb-person-detail__pending">未対応</p>' : '';
  // v0.1.2263: 動画で書いたことがあるときは、それを先に出す(返信・いいね・ハートは1件ごと)。
  //   来訪や最初・いちばん新しいは「詳しく」の中へ(記録が無い「—」や「なし」の行を並べない)。
  const wrote = videoCommentsDetailHtml(detail.comments);
  if (wrote) {
    const facts = [];
    if (detail.hasHistory && !/記録がまだない/.test(detail.visitsText)) facts.push(detail.visitsText);
    if (detail.firstSeenText && !/：—/.test(detail.firstSeenText)) facts.push(detail.firstSeenText);
    if (detail.lastSeenText && !/：—/.test(detail.lastSeenText) && detail.lastSeenText.replace('いちばん新しい', '') !== detail.firstSeenText.replace('最初', '')) facts.push(detail.lastSeenText);
    if (detail.giftText && detail.giftText !== 'ギフト なし') facts.push(detail.giftText);
    if (detail.handle) facts.push(detail.handle);
    const link = /^https:\/\//i.test(detail.channelUrl)
      ? `<p><a class="nlsb-person-detail__channel" href="${esc(detail.channelUrl)}" target="_blank" rel="noopener noreferrer">チャンネルを開く</a></p>`
      : '';
    const more = facts.length || link
      ? `<details class="nlsb-person-detail__more nlsb-person-detail__more--person"><summary>詳しく</summary>${facts.map((f) => `<p>${esc(f)}</p>`).join('')}${link}</details>`
      : '';
    return (
      `<div class="nlsb-person-detail" data-user-id="${esc(detail.id)}">` +
      `<p class="nlsb-person-detail__name">${esc(detail.name)}</p>` +
      (detail.relationKnown ? `<p class="nlsb-person-detail__relation">${esc(detail.relationLabel)}</p>` : '') +
      `<p>${esc(detail.commentText)}</p>` +
      wrote +
      more +
      pending +
      open +
      `</div>`
    );
  }
  return (
    `<div class="nlsb-person-detail" data-user-id="${esc(detail.id)}">` +
    `<p class="nlsb-person-detail__name">${esc(detail.name)}</p>` +
    `<p class="nlsb-person-detail__relation">${esc(detail.relationLabel)}</p>` +
    `<p>${esc(detail.visitsText)}</p>` +
    `<p>${esc(detail.firstSeenText)}</p>` +
    `<p>${esc(detail.lastSeenText)}</p>` +
    `<p>${esc(detail.commentText)}</p>` +
    `<p>${esc(detail.giftText)}</p>` +
    replyList('投稿者の返信', detail.creatorReplies) +
    replyList('視聴者の返信', detail.viewerReplies) +
    pending +
    open +
    `</div>`
  );
}
