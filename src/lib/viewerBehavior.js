/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】いま見えている視聴者について、このPCの記録から「行動」を組むことと、その文言・HTML
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.* / 新しい Observer / タイマー
 * 【書けるstorageキー】なし（呼び出し側が nls_viewer_behavior_board_v1 などに書く）
 * 【正本宣言】活動している人が最初に見たい「視聴者の行動」の言葉と並びはこのファイル
 */

export const VIEWER_BEHAVIOR_TITLE = '視聴者の行動';
export const VIEWER_BEHAVIOR_ROW_CAP = 20;
export const VIEWER_BEHAVIOR_TIME_ZONE = 'Asia/Tokyo';

/**
 * @typedef {{
 *   id: string,
 *   name?: string,
 *   commentCount?: number | null,
 *   giftCount?: number | null,
 *   knownAmountJpy?: number | null,
 *   at?: number | null,
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
  const rank = (r) => (r.relation === 'regular' ? 0 : r.relation === 'new' ? 1 : 2);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
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
 * @param {{
 *   visiblePeople?: readonly ViewerBehaviorVisiblePerson[] | null,
 *   historyById?: Record<string, ViewerBehaviorHistory | any> | Map<string, any> | null,
 *   historyReady?: boolean,
 *   nowMs?: number,
 *   cap?: number,
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
    : VIEWER_BEHAVIOR_ROW_CAP;
  /** @type {Map<string, ViewerBehaviorVisiblePerson>} */
  const byId = new Map();
  for (const p of visible) {
    const id = cleanId(p?.id);
    if (!id) continue;
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, {
        id,
        name: String(p?.name || '').replace(/\s+/g, ' ').trim(),
        commentCount: nonNegIntOrNull(p?.commentCount) ?? 1,
        giftCount: nonNegIntOrNull(p?.giftCount),
        knownAmountJpy: nonNegIntOrNull(p?.knownAmountJpy),
        at: positiveMsOrNull(p?.at),
      });
      continue;
    }
    prev.commentCount = (prev.commentCount || 0) + (nonNegIntOrNull(p?.commentCount) ?? 1);
    const g = nonNegIntOrNull(p?.giftCount);
    if (g != null) prev.giftCount = (prev.giftCount || 0) + g;
    const amt = nonNegIntOrNull(p?.knownAmountJpy);
    if (amt != null) prev.knownAmountJpy = (prev.knownAmountJpy || 0) + amt;
    const at = positiveMsOrNull(p?.at);
    if (at != null && (prev.at == null || at > prev.at)) prev.at = at;
    const name = String(p?.name || '').replace(/\s+/g, ' ').trim();
    if (name && name.length > String(prev.name || '').length) prev.name = name;
  }
  const rows = [];
  for (const person of byId.values()) {
    const raw = histOf(person.id);
    const history = raw ? historyFromCommenterIndexEntry(raw) : null;
    rows.push(buildViewerBehaviorRow(person, history, { historyReady, nowMs: src.nowMs }));
  }
  rows.sort(compareBehaviorRows);
  const regularCount = rows.filter((r) => r.relation === 'regular').length;
  const newCount = rows.filter((r) => r.relation === 'new').length;
  const unknownCount = rows.filter((r) => r.relation === 'unknown').length;
  const visibleCount = rows.length;
  const truncated = visibleCount > cap;
  const shown = rows.slice(0, cap);
  let summary = 'いま見えているコメントの投稿者がまだいません。';
  if (visibleCount > 0 && !historyReady) {
    summary = `いま見えている人は ${visibleCount.toLocaleString('ja-JP')} 人です。このチャンネルの配信や動画を、このPCで記録すると、なじみか初めてかを見分けられます。`;
  } else if (visibleCount > 0) {
    summary = `なじみ ${regularCount.toLocaleString('ja-JP')} 人 / 初めて ${newCount.toLocaleString('ja-JP')} 人（いま見えている ${visibleCount.toLocaleString('ja-JP')} 人・このPCの記録）`;
  } else if (historyReady) {
    summary = 'いま見えている範囲に、照合できるコメントの投稿者はまだいません。コメントが読み込まれると更新します。';
  }
  return {
    title: VIEWER_BEHAVIOR_TITLE,
    historyReady,
    visibleCount,
    regularCount,
    newCount,
    unknownCount,
    summary,
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
  const lis = items
    .map((row) => {
      const facts = row.factLine
        ? `<span class="nlsb-viewer-behavior__facts">${esc(row.factLine)}</span>`
        : '';
      return (
        `<li class="nlsb-viewer-behavior__row" data-relation="${esc(row.relation)}">` +
        `<span class="nlsb-viewer-behavior__name">${esc(row.name)}</span>` +
        `<span class="nlsb-viewer-behavior__rel">${esc(row.relationLabel)}</span>` +
        facts +
        `</li>`
      );
    })
    .join('');
  const more = board.truncated
    ? `<p class="nlsb-viewer-behavior__more">ほかの人は、いま見えている範囲の先頭 ${esc(String(items.length))} 人まで出しています。</p>`
    : '';
  const list = lis ? `<ul class="nlsb-viewer-behavior__list">${lis}</ul>` : '';
  return (
    `<section class="nlsb-viewer-behavior" aria-label="${esc(VIEWER_BEHAVIOR_TITLE)}">` +
    `<h2 class="nlsb-viewer-behavior__title">${esc(board.title || VIEWER_BEHAVIOR_TITLE)}</h2>` +
    `<p class="nlsb-viewer-behavior__summary">${esc(board.summary)}</p>` +
    list +
    more +
    `</section>`
  );
}
