/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】YouTube の通常動画・Shorts の種別判定、再生数、画面に出ているコメント投稿者、配信記録との交差
 * 【この箱に入らないもの】fetch / storage / DOM 書き換え / chrome.* / 新しい Observer
 * 【書けるstorageキー】なし
 * 【正本宣言】動画ページで出す再生数・交差・スーパーサンクスの材料の読み方はこのファイル
 *
 * ライブの同時視聴者数は ytConcurrentViewers.js の正本のまま。こちらは総再生回数だけを扱う。
 */

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const UC_RE = /^UC[A-Za-z0-9_-]{22}$/;
const MAX_NODES = 80_000;

/** @param {unknown} v */
function isVideoId(v) {
  return typeof v === 'string' && VIDEO_ID_RE.test(v);
}

/** @param {unknown} v */
export function isYtChannelId(v) {
  return typeof v === 'string' && UC_RE.test(v);
}

/**
 * 表示文（simpleText / runs / 文字列）を1本にする。
 * @param {any} node
 */
export function ytTextFromRunsOrSimple(node) {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  if (typeof node.simpleText === 'string') return node.simpleText;
  if (typeof node.content === 'string') return node.content;
  if (Array.isArray(node.runs)) {
    return node.runs.map((/** @type {any} */ r) => String(r?.text || r?.content || '')).join('');
  }
  return '';
}

/**
 * /shorts/<動画ID> の視聴 URL か。
 * @param {string} rawUrl
 */
export function isYtShortsUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl || ''), 'https://www.youtube.com');
    const host = u.hostname.toLowerCase();
    if (host !== 'youtube.com' && !host.endsWith('.youtube.com')) return false;
    const m = u.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})(?:\/|$)/);
    return Boolean(m);
  } catch {
    return false;
  }
}

/**
 * 1本の動画（通常の視聴・Shorts）の URL か。ライブチャット欄は偽。
 * 配信中かどうかはこの関数では決めない（同じ /watch?v= が配信にもなる）。
 * @param {string} rawUrl
 */
export function isYtWatchOrShortsUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl || ''), 'https://www.youtube.com');
    const host = u.hostname.toLowerCase();
    if (host !== 'youtube.com' && !host.endsWith('.youtube.com')) return false;
    if (u.pathname.startsWith('/live_chat')) return false;
    if (u.pathname === '/watch') return true;
    if (u.pathname.startsWith('/live/')) return true;
    return isYtShortsUrl(rawUrl);
  } catch {
    return false;
  }
}

/**
 * 「N 回視聴」「1.2万回視聴」「1.5M views」など、総再生の表示文から数を取る。
 * 「N 人が視聴中」「N watching」は同時視聴なので捨てる。
 * @param {unknown} raw
 * @returns {number | null}
 */
export function parseYtViewCountFromText(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (/視聴中|watching now|watching$/i.test(text) && !/回視聴|views/i.test(text)) return null;
  if (/人が視聴|watching/i.test(text) && !/回視聴|views/i.test(text)) return null;

  const jaMan = text.match(/([\d.,]+)\s*万\s*回/);
  if (jaMan) {
    const n = Number(String(jaMan[1]).replace(/,/g, ''));
    if (Number.isFinite(n) && n >= 0) return Math.floor(n * 10000);
  }
  const jaOku = text.match(/([\d.,]+)\s*億\s*回/);
  if (jaOku) {
    const n = Number(String(jaOku[1]).replace(/,/g, ''));
    if (Number.isFinite(n) && n >= 0) return Math.floor(n * 100000000);
  }
  const jaPlain = text.match(/([\d,]+)\s*回視聴/);
  if (jaPlain) {
    const n = Number(String(jaPlain[1]).replace(/,/g, ''));
    if (Number.isFinite(n) && n >= 0 && n <= 50_000_000_000) return Math.floor(n);
  }
  const enMul = text.match(/([\d.,]+)\s*([KMB])\s*views/i);
  if (enMul) {
    const n = Number(String(enMul[1]).replace(/,/g, ''));
    const mul = { K: 1e3, M: 1e6, B: 1e9 }[String(enMul[2]).toUpperCase()] || 1;
    if (Number.isFinite(n) && n >= 0) return Math.floor(n * mul);
  }
  const enPlain = text.match(/([\d,]+)\s*views/i);
  if (enPlain) {
    const n = Number(String(enPlain[1]).replace(/,/g, ''));
    if (Number.isFinite(n) && n >= 0 && n <= 50_000_000_000) return Math.floor(n);
  }
  return null;
}

/**
 * videoViewCountRenderer から総再生回数を取る。ライブ配信の同時視聴文は使わない。
 * @param {any} renderer
 * @returns {number | null}
 */
export function viewCountFromVideoViewCountRenderer(renderer) {
  if (!renderer || typeof renderer !== 'object') return null;
  const text = ytTextFromRunsOrSimple(renderer.viewCount) || ytTextFromRunsOrSimple(renderer.extraShortViewCount);
  const live = renderer.isLive === true || /視聴中|watching/i.test(text);
  if (live) return null;
  const fromText = parseYtViewCountFromText(text);
  if (fromText != null) return fromText;
  const raw = renderer.originalViewCount ?? renderer.viewCount;
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^\d+$/.test(raw)
        ? Number(raw)
        : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 50_000_000_000) return null;
  return Math.floor(n);
}

/**
 * @param {any} data
 * @param {string} wantId
 * @returns {number | null}
 */
export function viewCountInInnertube(data, wantId) {
  const want = isVideoId(wantId) ? wantId : '';
  /** @type {{ n: number }} */
  const budget = { n: 0 };
  return walkViewCount(data, '', want, budget, 0);
}

/**
 * @param {any} node
 * @param {string} videoId
 * @param {string} want
 * @param {{ n: number }} budget
 * @param {number} depth
 * @returns {number | null}
 */
function walkViewCount(node, videoId, want, budget, depth) {
  if (!node || typeof node !== 'object' || depth > 40 || budget.n > MAX_NODES) return null;
  budget.n += 1;
  if (Array.isArray(node)) {
    for (const item of node) {
      const n = walkViewCount(item, videoId, want, budget, depth + 1);
      if (n !== null) return n;
    }
    return null;
  }
  const vid = isVideoId(node.videoId) ? node.videoId : videoId;
  const renderer = node.videoViewCountRenderer;
  if (renderer && typeof renderer === 'object') {
    const count = viewCountFromVideoViewCountRenderer(renderer);
    if (count !== null && (!want || vid === want || !vid)) return count;
  }
  for (const key of Object.keys(node)) {
    if (key === 'videoViewCountRenderer') continue;
    const n = walkViewCount(node[key], vid, want, budget, depth + 1);
    if (n !== null) return n;
  }
  return null;
}

/**
 * ytInitialPlayerResponse / ytInitialData から、配信かどうかの印を読む。
 * @param {any} data
 * @returns {{ isLive: boolean | null, isLiveContent: boolean | null, isOwnerViewing: boolean | null }}
 */
export function ytLiveFlagsFromPlayerOrInitial(data) {
  const vd = data && typeof data === 'object' ? data.videoDetails || data : null;
  const micro = data && typeof data === 'object' ? data.microformat?.playerMicroformatRenderer : null;
  const isLive =
    vd && typeof vd.isLive === 'boolean'
      ? vd.isLive
      : micro && typeof micro.liveBroadcastDetails?.isLiveNow === 'boolean'
        ? micro.liveBroadcastDetails.isLiveNow
        : null;
  const isLiveContent =
    vd && typeof vd.isLiveContent === 'boolean'
      ? vd.isLiveContent
      : null;
  return { isLive, isLiveContent, isOwnerViewing: null };
}

/**
 * 視聴ページの中身の種別。不明のときは video にしない（配信開始直後の取り違えを防ぐ）。
 *
 * @param {{
 *   url?: string,
 *   concurrentViewers?: number | null,
 *   viewCount?: number | null,
 *   isLive?: boolean | null,
 *   isLiveContent?: boolean | null,
 *   hasLiveChat?: boolean,
 *   hasLiveChatReplay?: boolean,
 *   existingItemCount?: number | null,
 * }} signals
 * @returns {'live' | 'live_replay' | 'video' | 'unknown'}
 */
/**
 * 通常動画・アーカイブでは、どの経路の数でも同時視聴者数を出さない。
 * @param {{ isLive?: boolean | null, isLiveContent?: boolean | null, contentKind?: string | null, hasLiveChat?: boolean }} [signals]
 * @returns {boolean}
 */
/**
 * 通常の動画ページでは会場モードのボタンを出さない。
 * @param {{ contentKind?: string|null, isLive?: boolean|null, isLiveContent?: boolean|null }} [meta]
 */
export function ytPageShouldHideVenueMode(meta) {
  const kind = String(meta?.contentKind || '').trim();
  if (kind === 'video') return true;
  if (meta?.isLive === false && kind !== 'live' && kind !== 'live_replay') {
    return meta?.isLiveContent !== true;
  }
  return false;
}

/** @param {any} signals */
export function ytWatchMayShowConcurrentViewers(signals) {
  const s = signals && typeof signals === 'object' ? signals : {};
  if (s.isLive === false) return false;
  if (s.contentKind === 'video' || s.contentKind === 'live_replay') return false;
  if (s.isLive === true || s.contentKind === 'live' || s.hasLiveChat === true) return true;
  return false;
}

/**
 * 同時視聴の欄に入っている数が、再生回数と同じなら取り違え。
 * v0.1.2241: 再生回数が丸めた表示(「474万回視聴」= 4,740,000)から読めたときは、その桁の中の数(4,740,759)も同じ数とみなす。
 *   0.1.2239 実機(kKl0E22tU78): 概要欄の「4,740,759 回視聴」が同時視聴に入り、丸めた再生回数と完全一致しないので
 *   ライブ扱いになり、横の欄に「同時視聴者数 4,740,759 人」と出て、動画のカードが作られなかった。
 *   YouTube の丸め(万・K・M)は切り捨てなので、a は b 以上・b + 桁 未満。丸めでない数(末尾の 0 が 3 個未満)は完全一致だけ。
 * @param {unknown} concurrent
 * @param {unknown} viewCount
 * @returns {boolean}
 */
export function concurrentViewersIsViewCountLeak(concurrent, viewCount) {
  const a = Number(concurrent);
  const b = Number(viewCount);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) return false;
  const fa = Math.floor(a);
  const fb = Math.floor(b);
  if (fa === fb) return true;
  if (fb <= 0) return false;
  let unit = 1;
  let rest = fb;
  while (rest % 10 === 0 && unit < 100_000_000) {
    rest /= 10;
    unit *= 10;
  }
  if (unit < 1000) return false;
  return fa > fb && fa - fb < unit;
}

/** @param {any} signals */
export function classifyYtWatchContentKind(signals) {
  const s = signals && typeof signals === 'object' ? signals : {};
  if (s.hasLiveChatReplay === true) return 'live_replay';
  if (s.isLive === true) return 'live';
  // 公式が「いまは配信ではない」と出しているときは、取り違えた同時視聴の数や残ったチャット枠で live にしない
  if (s.hasLiveChat === true && s.isLive !== false) return 'live';
  // v0.1.2241: 公式が「この動画はライブ配信ではない」(isLiveContent=false)と出していれば、同時視聴の欄に数が入っていても通常動画。
  //   ライブ・ライブのアーカイブは isLiveContent=true なので、この行はライブの判定を変えない。
  if (s.isLiveContent === false && s.isLive !== true && s.hasLiveChat !== true) return 'video';
  const viewCount = typeof s.viewCount === 'number' && Number.isFinite(s.viewCount) ? s.viewCount : null;
  const concurrentIsViewCount = viewCount != null && concurrentViewersIsViewCountLeak(s.concurrentViewers, viewCount);
  if (s.isLive !== true && viewCount != null && (s.concurrentViewers == null || concurrentIsViewCount) && s.hasLiveChatReplay !== true) {
    if (s.isLiveContent === true) return 'live_replay';
    return 'video';
  }
  if (
    s.isLive !== false &&
    !concurrentIsViewCount &&
    typeof s.concurrentViewers === 'number' &&
    Number.isFinite(s.concurrentViewers) &&
    s.concurrentViewers >= 0
  ) {
    return 'live';
  }
  const items = Number(s.existingItemCount);
  if (Number.isFinite(items) && items > 0) {
    return s.isLive === false && s.isLiveContent === false ? 'video' : 'live_replay';
  }
  if (s.isLiveContent === true && s.isLive === false) return 'live_replay';
  if (s.isLive === false && s.isLiveContent === false) return 'video';
  if (s.isLiveContent === false && s.isLive !== true) return 'video';
  try {
    const path = new URL(String(s.url || ''), 'https://www.youtube.com').pathname;
    if (/^\/shorts\//.test(path) && s.isLive !== true && s.hasLiveChat !== true) {
      if (s.isLiveContent === true) return 'unknown';
      return 'video';
    }
  } catch {
    /* URL が取れなくても他の印で決める */
  }
  return 'unknown';
}

/**
 * @typedef {{ channelId: string, handle: string, name: string, amount: number | null, currency: string, avatarUrl?: string, commentId?: string, commentCount?: number, creatorHeart?: boolean, creatorReply?: boolean, pending?: boolean, postedAtMs?: number | null }} YtVideoCommentAuthor
 */

/**
 * @param {any} node
 * @returns {string}
 */
function channelIdFromEndpoint(node) {
  const browse =
    node?.authorEndpoint?.browseEndpoint?.browseId ||
    node?.authorExternalChannelId ||
    node?.channelId ||
    node?.authorName?.browseEndpoint?.browseId ||
    '';
  return isYtChannelId(browse) ? browse : '';
}

/**
 * スーパーサンクス等の金額。形が違えば null（数字は作らない）。
 * @param {any} node
 * @returns {{ amount: number, currency: string } | null}
 */
export function parseYtPaidCommentAmount(node) {
  if (!node || typeof node !== 'object') return null;
  const rawText =
    ytTextFromRunsOrSimple(node.superThanksAmount) ||
    ytTextFromRunsOrSimple(node.purchaseAmount) ||
    ytTextFromRunsOrSimple(node.paidCommentChip?.pdgCommentChipRenderer?.chipText) ||
    (typeof node.amount === 'number' || typeof node.amount === 'string' ? String(node.amount) : '') ||
    ytTextFromRunsOrSimple(node.amount) ||
    '';
  const text = String(rawText || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    const cur = String(node.currency || node.amountCurrency || '').trim().toUpperCase();
    const n = Number(node.amountValue ?? node.purchaseAmountValue);
    if (cur && Number.isFinite(n) && n > 0) return { amount: n, currency: cur };
    return null;
  }
  const m = text.match(/^\s*([¥￥$€£]|USD|JPY|EUR|GBP)?\s*([\d,]+(?:\.\d+)?)\s*([A-Z]{3})?\s*$/i);
  if (!m) return null;
  const n = Number(String(m[2]).replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  const sym = String(m[1] || '').toUpperCase();
  const cur =
    String(m[3] || '').toUpperCase() ||
    (sym === '¥' || sym === '￥' || sym === 'JPY' ? 'JPY' : '') ||
    (sym === '$' || sym === 'USD' ? 'USD' : '') ||
    (sym === '€' || sym === 'EUR' ? 'EUR' : '') ||
    (sym === '£' || sym === 'GBP' ? 'GBP' : '') ||
    String(node.currency || '').trim().toUpperCase();
  if (!cur) return null;
  return { amount: n, currency: cur };
}

/**
 * innertube 木から動画コメントの投稿者を集める（本文は返さない）。
 * @param {any} data
 * @param {{ limit?: number, nowMs?: number }} [opts]
 * @returns {YtVideoCommentAuthor[]}
 */
export function ytVideoCommentAuthorsFromInnertube(data, opts = {}) {
  const limit = Number.isFinite(Number(opts.limit)) ? Math.max(1, Math.floor(Number(opts.limit))) : 80;
  const nowMs = Number.isFinite(Number(opts.nowMs)) ? Number(opts.nowMs) : Date.now();
  /** @type {YtVideoCommentAuthor[]} */
  const out = [];
  const seen = new Set();
  /** @type {{ n: number }} */
  const budget = { n: 0 };
  walkComments(data, out, seen, budget, 0, limit, nowMs);
  out.sort((a, b) => (Number(b.postedAtMs) || 0) - (Number(a.postedAtMs) || 0));
  return out;
}

/**
 * @param {any} node
 * @param {YtVideoCommentAuthor[]} out
 * @param {Set<string>} seen
 * @param {{ n: number }} budget
 * @param {number} depth
 * @param {number} limit
 * @param {number} nowMs
 */
function walkComments(node, out, seen, budget, depth, limit, nowMs) {
  if (!node || typeof node !== 'object' || depth > 40 || budget.n > MAX_NODES || out.length >= limit) return;
  budget.n += 1;
  const entity = node.commentEntityPayload;
  if (entity && typeof entity === 'object') {
    takeCommentEntityAuthor(entity, out, seen, nowMs);
  }
  const renderer =
    node.commentRenderer ||
    node.commentViewModel ||
    (node.authorText || node.authorExternalChannelId ? node : null);
  if (renderer && typeof renderer === 'object' && (renderer.authorText || renderer.authorExternalChannelId || renderer.authorName)) {
    const channelId = channelIdFromEndpoint(renderer);
    const name = ytTextFromRunsOrSimple(renderer.authorText) || ytTextFromRunsOrSimple(renderer.authorName) || '';
    const handle = String(renderer.authorEndpoint?.browseEndpoint?.canonicalBaseUrl || '').replace(/^\//, '');
    const paid = parseYtPaidCommentAmount(renderer) || parseYtPaidCommentAmount(node.paidCommentChip);
    const key = channelId || (name ? `name:${name}` : '');
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push({
        channelId,
        handle: handle.startsWith('@') ? handle : '',
        name: String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        amount: paid ? paid.amount : null,
        currency: paid ? paid.currency : '',
      });
    }
  }
  const vals = Array.isArray(node) ? node : Object.values(node);
  for (const v of vals) {
    if (!v || typeof v !== 'object') continue;
    walkComments(v, out, seen, budget, depth + 1, limit, nowMs);
    if (out.length >= limit) return;
  }
}

/**
 * 2026 年の公開 next 応答は commentRenderer ではなく commentEntityPayload で来る。
 * 本文は返さない。同じ人は新しい投稿時刻を残す。
 * @param {any} entity
 * @param {YtVideoCommentAuthor[]} out
 * @param {Set<string>} seen
 * @param {number} nowMs
 */
function takeCommentEntityAuthor(entity, out, seen, nowMs) {
  const author = entity && typeof entity === 'object' ? entity.author || {} : {};
  const props = entity && typeof entity === 'object' ? entity.properties || {} : {};
  const channelId = isYtChannelId(author.channelId) ? String(author.channelId) : '';
  const display = String(author.displayName || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const fromUrl = String(author.channelCommand?.innertubeCommand?.browseEndpoint?.canonicalBaseUrl || '').replace(/^\//, '');
  const handle = display.startsWith('@') ? display : (fromUrl.startsWith('@') ? fromUrl : '');
  const key = channelId || (display ? `name:${display}` : '');
  if (!key) return;
  const avatarUrl = String(author.avatarThumbnailUrl || '').trim();
  const postedAtMs = parseYtCommentPublishedAtMs(props.publishedTime, nowMs);
  if (seen.has(key)) {
    const prev = out.find((row) => (row.channelId && row.channelId === channelId) || (!channelId && `name:${row.name}` === key));
    if (prev) {
      if (avatarUrl && !prev.avatarUrl) prev.avatarUrl = avatarUrl;
      if (postedAtMs && (!prev.postedAtMs || postedAtMs > prev.postedAtMs)) prev.postedAtMs = postedAtMs;
    }
    return;
  }
  seen.add(key);
  out.push({
    channelId,
    handle: handle.startsWith('@') ? handle : '',
    name: display,
    amount: null,
    currency: '',
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(props.commentId ? { commentId: String(props.commentId) } : {}),
    ...(postedAtMs ? { postedAtMs } : {}),
  });
}


/**
 * YouTube の公開コメント ID は、返信だと「親ID.続き」。
 * @param {unknown} commentId
 * @returns {string}
 */
export function parentYtCommentId(commentId) {
  const s = String(commentId || '').trim();
  const i = s.lastIndexOf('.');
  return i > 0 ? s.slice(0, i) : '';
}

/**
 * innertube 木から、投稿者だけでなく返信（replyLevel / isCreator / parentId）も含めて集める。
 * 本文は返さない。
 * @param {any} data
 * @param {{ nowMs?: number, limit?: number }} [opts]
 * @returns {{ commentId: string, parentId: string, channelId: string, name: string, handle: string, avatarUrl: string, isCreator: boolean, replyLevel: number, postedAtMs: number | null }[]}
 */
export function ytVideoCommentsFromInnertube(data, opts = {}) {
  const limit = Number.isFinite(Number(opts.limit)) ? Math.max(1, Math.floor(Number(opts.limit))) : 200;
  const nowMs = Number.isFinite(Number(opts.nowMs)) ? Number(opts.nowMs) : Date.now();
  /** @type {any[]} */
  const out = [];
  /** @type {{ n: number }} */
  const budget = { n: 0 };
  walkCommentRecords(data, out, budget, 0, limit, nowMs);
  return out;
}

/**
 * @param {any} node
 * @param {any[]} out
 * @param {{ n: number }} budget
 * @param {number} depth
 * @param {number} limit
 * @param {number} nowMs
 */
function walkCommentRecords(node, out, budget, depth, limit, nowMs) {
  if (!node || typeof node !== 'object' || depth > 40 || budget.n > MAX_NODES || out.length >= limit) return;
  budget.n += 1;
  if (node.commentEntityPayload && typeof node.commentEntityPayload === 'object') {
    const rec = commentRecordFromEntity(node.commentEntityPayload, nowMs);
    if (rec && rec.commentId) out.push(rec);
  }
  const vals = Array.isArray(node) ? node : Object.values(node);
  for (const v of vals) {
    if (!v || typeof v !== 'object') continue;
    walkCommentRecords(v, out, budget, depth + 1, limit, nowMs);
    if (out.length >= limit) return;
  }
}

/** @param {any} entity @param {number} nowMs */
function commentRecordFromEntity(entity, nowMs) {
  const author = entity && typeof entity === 'object' ? entity.author || {} : {};
  const props = entity && typeof entity === 'object' ? entity.properties || {} : {};
  const commentId = String(props.commentId || '').trim();
  const display = String(author.displayName || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const fromUrl = String(author.channelCommand?.innertubeCommand?.browseEndpoint?.canonicalBaseUrl || '').replace(/^\//, '');
  const handle = display.startsWith('@') ? display : (fromUrl.startsWith('@') ? fromUrl : '');
  const replyLevel = Number(props.replyLevel);
  return {
    commentId,
    parentId: parentYtCommentId(commentId),
    channelId: isYtChannelId(author.channelId) ? String(author.channelId) : '',
    name: display,
    handle: handle.startsWith('@') ? handle : '',
    avatarUrl: String(author.avatarThumbnailUrl || '').trim(),
    isCreator: author.isCreator === true,
    replyLevel: Number.isFinite(replyLevel) && replyLevel > 0 ? Math.floor(replyLevel) : (parentYtCommentId(commentId) ? 1 : 0),
    postedAtMs: parseYtCommentPublishedAtMs(props.publishedTime, nowMs),
  };
}

/**
 * 画面に見えているコメント欄から投稿者を読む。新しい Observer は使わず、呼んだ瞬間の DOM だけ。
 * @param {ParentNode | null | undefined} root
 * @param {{ limit?: number }} [opts]
 * @returns {YtVideoCommentAuthor[]}
 */

/** ページの世界(ytCommentPhotoTag.js)が、まだ空の顔の img の代わりに置く属性。チャット欄と同じ名前 */
export const YT_COMMENT_TAGGED_PHOTO_ATTR = 'data-nl-author-photo';

/**
 * コメントの投稿者の顔の URL。img の src → data-src → ページの世界が写した属性(v0.1.2247・遅延読み込みでまだ空の顔)。
 * @param {Element} el
 * @returns {string}
 */
function ytCommentAvatarUrlFromEl(el) {
  const img = queryDeep(el, '#author-thumbnail img, yt-img-shadow img, img#img, #author-photo img');
  const fromImg = String(
    (img && typeof img.getAttribute === 'function' && (img.getAttribute('src') || img.getAttribute('data-src')))
    || (img && /** @type {any} */ (img).src)
    || '',
  ).trim();
  if (/^https?:\/\//i.test(fromImg)) return fromImg;
  const tagged = queryDeep(el, `[${YT_COMMENT_TAGGED_PHOTO_ATTR}]`);
  const url = String(tagged?.getAttribute?.(YT_COMMENT_TAGGED_PHOTO_ATTR) || '').trim();
  return /^https:\/\//i.test(url) ? url : fromImg;
}

/** @param {ParentNode | Element | null | undefined} root @param {string} sel */
function queryDeep(root, sel) {
  if (!root || typeof root.querySelector !== 'function') return null;
  try {
    const hit = root.querySelector(sel);
    if (hit) return hit;
  } catch {
    /* セレクタが古い環境でも他の場所を見る */
  }
  const sr = /** @type {any} */ (root).shadowRoot;
  if (sr && typeof sr.querySelector === 'function') {
    try {
      const hit = sr.querySelector(sel);
      if (hit) return hit;
    } catch {
      /* shadow が読めなくても外の DOM は使う */
    }
  }
  return null;
}

/**
 * スレッドの器は light DOM にあり、中の view-model や #author-thumbnail は shadow にあることがある。
 * @param {ParentNode} root
 * @returns {Element[]}
 */
function ytCommentHostElements(root) {
  /** @type {Element[]} */
  const hosts = [];
  /** @type {ArrayLike<Element>} */
  const threads = typeof root.querySelectorAll === 'function' ? root.querySelectorAll('ytd-comment-thread-renderer') : [];
  for (let i = 0; i < threads.length; i += 1) {
    const th = threads[i];
    const vm = queryDeep(th, 'ytd-comment-view-model, ytd-comment-renderer, yt-comment-view-model');
    hosts.push(/** @type {Element} */ (vm || th));
  }
  if (hosts.length) return hosts;
  /** @type {ArrayLike<Element>} */
  const loose = typeof root.querySelectorAll === 'function'
    ? root.querySelectorAll('ytd-comment-view-model, ytd-comment-renderer, yt-comment-view-model')
    : [];
  for (let i = 0; i < loose.length; i += 1) hosts.push(loose[i]);
  return hosts;
}

/**
 * コメントの「3 時間前」「2 days ago」などから、おおよその投稿時刻を出す。並び用であり、記録の正式な時刻ではない。
 * @param {unknown} text
 * @param {number} [nowMs]
 * @returns {number | null}
 */
export function parseYtCommentPublishedAtMs(text, nowMs = Date.now()) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  const m = s.match(/(\d+)\s*(秒|seconds?|分|minutes?|時間|hours?|日|days?|週間|週|weeks?|(?:か|ヵ|ヶ|ケ|カ)?月|months?|年|years?)\s*(前|ago)/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0) return null;
  const unit = m[2].toLowerCase();
  let ms = 0;
  if (/秒|second/.test(unit)) ms = n * 1000;
  else if (/分|minute/.test(unit)) ms = n * 60_000;
  else if (/時間|hour/.test(unit)) ms = n * 3_600_000;
  else if (/週|week/.test(unit)) ms = n * 7 * 86_400_000;
  else if (/日|day/.test(unit)) ms = n * 86_400_000;
  else if (/月|month/.test(unit)) ms = n * 30 * 86_400_000;
  else if (/年|year/.test(unit)) ms = n * 365 * 86_400_000;
  else return null;
  const now = Number(nowMs);
  const base = Number.isFinite(now) && now > 0 ? now : Date.now();
  return Math.floor(base - ms);
}

/**
 * @param {any} root
 * @param {{ limit?: number, nowMs?: number }} [opts]
 */
export function ytVideoCommentAuthorsFromDom(root, opts = {}) {
  const limit = Number.isFinite(Number(opts.limit)) ? Math.max(1, Math.floor(Number(opts.limit))) : 80;
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  /** @type {Map<string, YtVideoCommentAuthor>} */
  const byKey = new Map();
  const threads = ytCommentHostElements(root);
  for (let i = 0; i < threads.length; i += 1) {
    const el = threads[i];
    if (!el) continue;
    let channelId = '';
    let handle = '';
    let commentId = String(el.getAttribute?.('comment-id') || el.getAttribute?.('data-comment-id') || '').trim();
    const links = el.querySelectorAll('a[href]');
    for (let j = 0; j < links.length; j += 1) {
      const href = String(links[j].getAttribute?.('href') || '');
      if (!channelId) {
        const uc = href.match(/\/channel\/(UC[A-Za-z0-9_-]{22})/);
        if (uc) channelId = uc[1];
      }
      if (!handle) {
        const h = href.match(/\/(@[^/?#]+)/);
        if (h) {
          try { handle = decodeURIComponent(h[1]); } catch { handle = h[1]; }
        }
      }
      if (!commentId) {
        const lc = href.match(/[?&]lc=([^&]+)/);
        if (lc) {
          try { commentId = decodeURIComponent(lc[1]); } catch { commentId = lc[1]; }
        }
      }
    }
    const nameEl = queryDeep(el, '#author-text, #author-text yt-formatted-string, a#author-text, #name, yt-attributed-string#name');
    const name = String(nameEl?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const paidEl = queryDeep(el, '[id*="super-thanks"], [class*="super-thanks"], [class*="superThanks"], #paid-comment-chip, .paid-comment-chip');
    const paid = parseYtPaidCommentAmount({ amount: String(paidEl?.textContent || '').trim() });
    const avatarUrl = ytCommentAvatarUrlFromEl(el);
    const creatorHeart = Boolean(queryDeep(el, '#creator-heart, ytd-creator-heart-renderer, [id*="creator-heart"], [class*="creator-heart"]'));
    const creatorReply = Boolean(queryDeep(el, 'ytd-author-comment-badge-renderer, #author-comment-badge, [class*="author-comment-badge"]'));
    const pending = !creatorHeart && !creatorReply;
    const publishedEl = queryDeep(el, '#published-time-text, #published-time-text a, .published-time-text, yt-formatted-string#published-time-text');
    const publishedText = String(publishedEl?.getAttribute?.('aria-label') || publishedEl?.getAttribute?.('title') || publishedEl?.textContent || '').trim();
    const postedAtMs = parseYtCommentPublishedAtMs(publishedText, opts.nowMs);
    const key = channelId || handle || (name ? `name:${name}` : '');
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, {
        channelId,
        handle,
        name,
        amount: paid ? paid.amount : null,
        currency: paid ? paid.currency : '',
        avatarUrl,
        commentId: pending ? commentId : (commentId || ''),
        commentCount: 1,
        creatorHeart,
        creatorReply,
        pending,
        postedAtMs,
      });
    } else {
      prev.commentCount = (Number(prev.commentCount) || 1) + 1;
      if (paid && (!prev.amount || paid.amount > prev.amount)) {
        prev.amount = paid.amount;
        prev.currency = paid.currency;
      }
      if (avatarUrl && !prev.avatarUrl) prev.avatarUrl = avatarUrl;
      prev.creatorHeart = prev.creatorHeart || creatorHeart;
      prev.creatorReply = prev.creatorReply || creatorReply;
      if (pending && !prev.pending) {
        prev.pending = true;
        if (commentId) prev.commentId = commentId;
      } else if (pending) {
        prev.pending = true;
        if (commentId && !prev.commentId) prev.commentId = commentId;
      }
      if (!pending && !prev.pending && commentId && !prev.commentId) prev.commentId = commentId;
      if (postedAtMs && (!prev.postedAtMs || postedAtMs > prev.postedAtMs)) prev.postedAtMs = postedAtMs;
    }
    if (byKey.size >= limit && !prev) break;
  }
  const rows = [...byKey.values()];
  rows.sort((a, b) => (Number(b.postedAtMs) || 0) - (Number(a.postedAtMs) || 0));
  return rows;
}

/**
 * 画面に既に描かれているコメントから、返信（replyLevel / isCreator / parentId）も含めて集める。
 * 本文は返さない。新しい通信はしない。
 * 投稿者の印は .channel-owner か、ytd-author-comment-badge-renderer の creator 属性。
 * アーティストなどのバッジだけでは投稿者にしない。
 * @param {ParentNode | null | undefined} root
 * @param {{ nowMs?: number, limit?: number }} [opts]
 * @returns {{ commentId: string, parentId: string, channelId: string, name: string, handle: string, avatarUrl: string, isCreator: boolean, replyLevel: number, postedAtMs: number | null }[]}
 */
export function ytVideoCommentsFromDom(root, opts = {}) {
  const limit = Number.isFinite(Number(opts.limit)) ? Math.max(1, Math.floor(Number(opts.limit))) : 200;
  const nowMs = Number.isFinite(Number(opts.nowMs)) ? Number(opts.nowMs) : Date.now();
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  /** @type {{ commentId: string, parentId: string, channelId: string, name: string, handle: string, avatarUrl: string, isCreator: boolean, replyLevel: number, postedAtMs: number | null }[]} */
  const out = [];
  const threads = root.querySelectorAll('ytd-comment-thread-renderer');
  const useThreads = threads.length > 0;
  /** @type {any} */
  const hosts = useThreads ? threads : [];
  if (!useThreads) {
    const loose = root.querySelectorAll('ytd-comment-view-model, ytd-comment-renderer, yt-comment-view-model');
    for (let i = 0; i < loose.length; i += 1) hosts.push(loose[i]);
  }
  for (let i = 0; i < hosts.length; i += 1) {
    const th = hosts[i];
    const rawVms = th.querySelectorAll
      ? th.querySelectorAll('ytd-comment-view-model, ytd-comment-renderer, yt-comment-view-model')
      : [];
    /** 未閉じの返信ブロックで、後続スレッドまで巻き込まれないようにする */
    const list = [];
    const source = rawVms.length ? rawVms : [th];
    for (let k = 0; k < source.length; k += 1) {
      const vm = source[k];
      if (!vm) continue;
      if (typeof vm.closest === 'function') {
        const owner = vm.closest('ytd-comment-thread-renderer');
        if (owner && owner !== th) continue;
      }
      list.push(vm);
    }
    if (!list.length) list.push(th);
    let topId = '';
    for (let j = 0; j < list.length; j += 1) {
      const el = list[j];
      if (!el) continue;
      const inReplies = typeof el.closest === 'function' && !!el.closest('ytd-comment-replies-renderer')
        && (!el.closest('ytd-comment-thread-renderer') || el.closest('ytd-comment-thread-renderer') === th);
      const rec = ytCommentRecordFromViewModel(el, { nowMs, replyLevel: inReplies ? 1 : 0, parentId: inReplies ? topId : '' });
      if (!rec) continue;
      if (!inReplies && rec.commentId) topId = rec.commentId;
      if (inReplies && !rec.parentId && topId) rec.parentId = topId;
      out.push(rec);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/**
 * @param {Element} el
 * @param {{ nowMs?: number, replyLevel?: number, parentId?: string }} [opts]
 */
function ytCommentRecordFromViewModel(el, opts = {}) {
  let channelId = '';
  let handle = '';
  let commentId = String(el.getAttribute?.('comment-id') || el.getAttribute?.('data-comment-id') || '').trim();
  if (!commentId) {
    const pubLink = queryDeep(el, '#published-time-text a[href], a#published-time-text[href]');
    const pubHref = String(pubLink?.getAttribute?.('href') || '');
    const lc = pubHref.match(/[?&]lc=([^&]+)/);
    if (lc) {
      try { commentId = decodeURIComponent(lc[1]); } catch { commentId = lc[1]; }
    }
  }
  /** @type {ArrayLike<Element>} */
  const links = el.querySelectorAll ? el.querySelectorAll('a[href]') : [];
  for (let j = 0; j < links.length; j += 1) {
    const href = String(links[j].getAttribute?.('href') || '');
    if (!channelId) {
      const uc = href.match(/\/channel\/(UC[A-Za-z0-9_-]{22})/);
      if (uc) channelId = uc[1];
    }
    if (!handle) {
      const h = href.match(/\/(@[^/?#]+)/);
      if (h) {
        try { handle = decodeURIComponent(h[1]); } catch { handle = h[1]; }
      }
    }
    if (!commentId) {
      const lc = href.match(/[?&]lc=([^&]+)/);
      if (lc) {
        try { commentId = decodeURIComponent(lc[1]); } catch { commentId = lc[1]; }
      }
    }
  }
  const nameEl = queryDeep(el, '#author-text, #author-text yt-formatted-string, a#author-text, #name, yt-attributed-string#name, ytd-channel-name #text');
  let name = String(nameEl?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!name || /^@/.test(name)) {
    const aria = el.querySelector?.('#author-thumbnail-button')?.getAttribute?.('aria-label');
    const fromAria = String(aria || '').replace(/\s+/g, ' ').trim();
    if (fromAria) name = fromAria.replace(/^@/, '').slice(0, 80);
  }
  if (!name) name = (handle ? handle.replace(/^@/, '') : '').slice(0, 80);
  const avatarUrl = ytCommentAvatarUrlFromEl(el);
  const isCreator = Boolean(
    queryDeep(el, '.channel-owner, [class*="channel-owner"]')
    || queryDeep(el, 'ytd-author-comment-badge-renderer[creator]'),
  );
  const publishedEl = queryDeep(el, '#published-time-text, #published-time-text a, .published-time-text, yt-formatted-string#published-time-text');
  const publishedText = String(publishedEl?.getAttribute?.('aria-label') || publishedEl?.getAttribute?.('title') || publishedEl?.textContent || '').trim();
  const postedAtMs = parseYtCommentPublishedAtMs(publishedText, opts.nowMs);
  const replyLevel = Number(opts.replyLevel) > 0 ? 1 : 0;
  let parentId = String(opts.parentId || '').trim();
  if (replyLevel > 0 && !parentId) parentId = parentYtCommentId(commentId);
  if (!commentId && !channelId && !handle && !name) return null;
  return {
    commentId,
    parentId,
    channelId,
    id: channelId || handle || (name ? `name:${name}` : ''),
    name,
    handle,
    avatarUrl,
    isCreator,
    replyLevel,
    postedAtMs,
  };
}

/**
 * 画面の「N 件のコメント」から数を取る。読み込まれた範囲の見出しであり、記録の件数ではない。
 * @param {ParentNode | null | undefined} root
 * @returns {number | null}
 */
export function ytCommentCountFromDom(root) {
  if (!root || typeof root.querySelector !== 'function') return null;
  /** @type {ArrayLike<Element>} */
  const els = root.querySelectorAll
    ? root.querySelectorAll(
        'ytd-comments-header-renderer #count, ytd-comments-header-renderer #title, ytd-comments-header-renderer, #comments #count, #comments #title, #leading-section',
      )
    : [];
  for (let i = 0; i < els.length; i += 1) {
    const text = String(els[i]?.textContent || '').replace(/\s+/g, ' ').trim();
    const m = text.match(/([0-9][0-9,]*)\s*件のコメント/) || text.match(/([0-9][0-9,]*)\s*Comments/i);
    if (!m) continue;
    const n = Number(String(m[1]).replace(/,/g, ''));
    if (Number.isFinite(n) && n >= 0 && n <= 50_000_000) return Math.floor(n);
  }
  return null;
}

/**
 * 画面の再生数表示から数を取る。
 * @param {ParentNode | null | undefined} root
 * @returns {number | null}
 */
export function ytViewCountFromDom(root) {
  if (!root || typeof root.querySelector !== 'function') return null;
  /** @type {ArrayLike<Element>} */
  const els = root.querySelectorAll
    ? root.querySelectorAll(
        [
          'ytd-watch-info-text #tooltip',
          'ytd-watch-info-text yt-formatted-string',
          'ytd-watch-info-text yt-attributed-string',
          'ytd-watch-info-text #info',
          'ytd-watch-info-text',
          '#info-container yt-formatted-string',
          '#info-container yt-attributed-string',
          'yt-formatted-string#info',
          'span.view-count',
          '#count .view-count',
        ].join(', '),
      )
    : [];
  for (let i = 0; i < els.length; i += 1) {
    const n = parseYtViewCountFromText(els[i]?.textContent);
    if (n != null) return n;
  }
  return null;
}

/**
 * @param {Record<string, any> | null | undefined} summaries
 * @param {string} broadcasterChannelId
 * @returns {{ streamCount: number, itemCount: number, videoIds: string[] }}
 */
export function summarizeChannelRecordedLives(summaries, broadcasterChannelId) {
  const ch = String(broadcasterChannelId || '').trim();
  const bag = summaries && typeof summaries === 'object' ? summaries : {};
  /** @type {Array<{ id: string, at: number, items: number }>} */
  const rows = [];
  for (const [id, sum] of Object.entries(bag)) {
    if (!isVideoId(id) && !String(id).startsWith('ytlive:')) {
      // YouTube の通常の動画IDだけ（他サービスの配信キーは混ぜない）
      if (!/^[A-Za-z0-9_-]{11}$/.test(String(id))) continue;
    }
    if (!isVideoId(id)) continue;
    const s = sum && typeof sum === 'object' ? sum : {};
    if (ch && String(s.broadcasterChannelId || '').trim() !== ch) continue;
    const items = Number(s.itemCount);
    if (!Number.isFinite(items) || items <= 0) continue;
    if (s.contentKind === 'video') continue;
    rows.push({
      id,
      at: Number(s.updatedAt || s.createdAt || 0) || 0,
      items: Math.floor(items),
    });
  }
  rows.sort((a, b) => b.at - a.at);
  return {
    streamCount: rows.length,
    itemCount: rows.reduce((acc, r) => acc + r.items, 0),
    videoIds: rows.map((r) => r.id),
  };
}

/**
 * @param {readonly any[]} commentRows
 * @returns {Map<string, { name: string, count: number, lastAt: number }>}
 */
export function liveCommenterMapFromRows(commentRows) {
  /** @type {Map<string, { name: string, count: number, lastAt: number }>} */
  const map = new Map();
  const list = Array.isArray(commentRows) ? commentRows : [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const id = String(row.channelId || row.ytChannelId || '').trim();
    if (!isYtChannelId(id)) continue;
    const name = String(row.name || row.nickname || row.authorName || '').replace(/\s+/g, ' ').trim();
    const at = Number(row.postedAtMs || row.recordedAt || row.ts || 0) || 0;
    const prev = map.get(id);
    if (!prev) map.set(id, { name: name.slice(0, 80), count: 1, lastAt: at });
    else {
      prev.count += 1;
      if (at > prev.lastAt) prev.lastAt = at;
      if (name && !prev.name) prev.name = name.slice(0, 80);
    }
  }
  return map;
}

/**
 * @param {readonly YtVideoCommentAuthor[]} videoAuthors
 * @param {Map<string, { name: string, count: number, lastAt?: number }> | Record<string, { n?: string, name?: string, c?: number, count?: number }>} liveMap
 * @returns {{ matched: Array<{ channelId: string, name: string, liveComments: number }>, videoAuthorCount: number, matchedCount: number }}
 */
export function matchVideoCommentersToLive(videoAuthors, liveMap) {
  const authors = Array.isArray(videoAuthors) ? videoAuthors : [];
  /** @param {string} id */
  const lookup = (id) => {
    if (!id) return null;
    if (liveMap && typeof liveMap.get === 'function') return liveMap.get(id) || null;
    if (liveMap && typeof liveMap === 'object') return /** @type {any} */ (liveMap)[id] || null;
    return null;
  };
  const seenVideo = new Set();
  /** @type {Array<{ channelId: string, name: string, liveComments: number }>} */
  const matched = [];
  let videoAuthorCount = 0;
  for (const a of authors) {
    const id = String(a?.channelId || '').trim();
    if (!isYtChannelId(id) || seenVideo.has(id)) continue;
    seenVideo.add(id);
    videoAuthorCount += 1;
    const hit = lookup(id);
    if (!hit) continue;
    const liveComments = Number(hit.count ?? hit.c) || 0;
    const name = String(a.name || hit.name || hit.n || '').replace(/\s+/g, ' ').trim();
    matched.push({ channelId: id, name, liveComments: liveComments > 0 ? liveComments : 1 });
  }
  matched.sort((a, b) => b.liveComments - a.liveComments || a.name.localeCompare(b.name, 'ja'));
  return { matched, videoAuthorCount, matchedCount: matched.length };
}

/**
 * 見えているスーパーサンクスの通貨別合計。
 * @param {readonly YtVideoCommentAuthor[]} authors
 * @returns {{ count: number, amounts: Record<string, number> }}
 */
export function tallyVisibleSuperThanks(authors) {
  /** @type {Record<string, number>} */
  const amounts = {};
  let count = 0;
  const list = Array.isArray(authors) ? authors : [];
  for (const a of list) {
    const cur = String(a?.currency || '').trim().toUpperCase();
    const n = Number(a?.amount);
    if (!cur || !Number.isFinite(n) || n <= 0) continue;
    count += 1;
    amounts[cur] = (amounts[cur] || 0) + n;
  }
  return { count, amounts };
}
