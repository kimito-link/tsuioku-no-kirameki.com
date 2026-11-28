import { isSiteDefaultSilhouetteUrl } from '../avatarFallbackFromUrl.js';

/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】動画ページでサムネイルを押したときに出す「その人が書いたこと」(1件ずつの本文・時刻・いいね・返信など)の形と HTML
 * 【この箱に入らないもの】fetch / storage / DOM の読み取り / chrome.* / 新しい Observer / タイマー
 * 【書けるstorageキー】なし
 * 【正本宣言】動画のコメント1件の詳しい項目の名前と、出し方はこのファイル
 *
 * v0.1.2263(2026-11-27 りんく「サムネをおしても何を書いたかでない」「リプを運営者がかえしたとか、ユーザーのだれがかえしたかもない」
 *   「いいねもわかるのでそれもだしてほしい」「出せるデータ全部だして」):
 *   ページに描かれている(または記録した)コメントの行だけを使う。無い項目は出さない。数字は作らない。
 *   各サービスの読み取り(ytVideoWatchMeta.js・vodCommentsFromDom.js・nicoVideoWatchMeta.js)は同じ項目名で渡す。
 */

/** 1人分に持つコメントの上限(保存の大きさを抑える) */
export const VIDEO_COMMENTS_PER_PERSON_CAP = 8;
/** 1件に付ける返信の上限 */
export const VIDEO_REPLIES_PER_COMMENT_CAP = 12;
/** 詳しくを開かなくても見える件数 */
export const VIDEO_COMMENTS_SHOWN_FIRST = 3;

/**
 * @typedef {{ id: string, name: string, avatarUrl: string, isCreator: boolean, text: string, timeText: string, likes: string, at: number | null }} VideoCommentReply
 * @typedef {{
 *   id: string,
 *   text: string,
 *   timeText: string,
 *   at: number | null,
 *   likes: string,
 *   likeCount: number | null,
 *   heart: boolean,
 *   pinned: boolean,
 *   edited: boolean,
 *   isCreator: boolean,
 *   member: string,
 *   badge: string,
 *   paid: string,
 *   timeMarks: string[],
 *   replyCount: number | null,
 *   replies: VideoCommentReply[],
 *   replyTo: string,
 * }} VideoCommentDetail
 */

/** @param {unknown} v @param {number} max */
function str(v, max = 600) {
  return String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, max);
}

/** @param {unknown} v */
function posIntOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/** @param {unknown} v */
function atOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/** @param {any} raw @returns {VideoCommentReply} */
function normalizeReply(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    id: str(r.channelId || r.userId || r.handle || r.id, 120),
    name: str(r.name || r.displayName || r.handle, 80),
    avatarUrl: /^https:\/\//i.test(String(r.avatarUrl || r.iconUrl || '')) ? String(r.avatarUrl || r.iconUrl) : '',
    isCreator: r.isCreator === true || r.kind === 'creator',
    text: str(r.text, 300),
    timeText: str(r.timeText, 40),
    likes: str(r.likes, 20),
    at: atOrNull(r.at ?? r.postedAtMs),
  };
}

/**
 * 1件のコメントの行を、詳しく出す形にそろえる。
 * @param {any} raw
 * @returns {VideoCommentDetail}
 */
export function normalizeVideoComment(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const replies = Array.isArray(r.replies) ? r.replies.map(normalizeReply).filter((/** @type {any} */ x) => x.name || x.id).slice(0, VIDEO_REPLIES_PER_COMMENT_CAP) : [];
  const marks = Array.isArray(r.timeMarks) ? r.timeMarks.map((/** @type {unknown} */ m) => str(m, 12)).filter(Boolean).slice(0, 5) : [];
  return {
    id: str(r.commentId || r.id, 120),
    text: str(r.text, 600),
    timeText: str(r.timeText, 40),
    at: atOrNull(r.at ?? r.postedAtMs),
    likes: str(r.likes, 20),
    likeCount: posIntOrNull(r.likeCount),
    heart: r.heart === true,
    pinned: r.pinned === true,
    edited: r.edited === true,
    isCreator: r.isCreator === true,
    member: str(r.member, 60),
    badge: str(r.badge, 40),
    paid: str(r.paid, 30),
    timeMarks: marks,
    replyCount: posIntOrNull(r.replyCount),
    replies,
    replyTo: str(r.replyTo, 80),
  };
}

/**
 * 同じ人の2つのコメント一覧をまとめる(同じ id のコメントは後の方の中身で上書き)。新しい順。
 * @param {readonly any[] | null | undefined} a
 * @param {readonly any[] | null | undefined} b
 * @returns {VideoCommentDetail[]}
 */
export function mergeVideoCommentLists(a, b) {
  /** @type {Map<string, VideoCommentDetail>} */
  const byId = new Map();
  /** @type {VideoCommentDetail[]} */
  const noId = [];
  for (const raw of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
    const c = normalizeVideoComment(raw);
    if (!c.text && !c.id) continue;
    if (!c.id) {
      if (!noId.some((x) => x.text === c.text && x.timeText === c.timeText)) noId.push(c);
      continue;
    }
    const prev = byId.get(c.id);
    byId.set(c.id, prev ? { ...prev, ...pickFilled(c), replies: c.replies.length ? c.replies : prev.replies } : c);
  }
  const all = [...byId.values(), ...noId];
  // 時刻の分かるものは新しい順。分からないものは来た順のまま後ろ(並べ替えは安定)
  all.sort((x, y) => (y.at || 0) - (x.at || 0));
  return all.slice(0, VIDEO_COMMENTS_PER_PERSON_CAP);
}

/** @param {VideoCommentDetail} c */
function pickFilled(c) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const [k, v] of Object.entries(c)) {
    if (v == null || v === '' || v === false || (Array.isArray(v) && !v.length)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * ページの行(親コメントと返信)を、親コメントの投稿者ごとの「書いたこと」にする。
 * 行は { commentId, parentId, replyLevel, channelId|userId|handle|id, name, text, timeText, likes, ... }。
 * 人のキー(id・channelId・handle)のどれかが合えば、その人のコメントにする。
 * @param {readonly any[]} people
 * @param {readonly any[] | null | undefined} rows
 * @returns {any[]} people に comments を足したもの(行が無ければそのまま)
 */
export function attachVideoCommentsToPeople(people, rows) {
  const list = Array.isArray(people) ? people : [];
  const all = Array.isArray(rows) ? rows : [];
  if (!all.length) return list;
  /** @type {Map<string, any[]>} */
  const repliesByParent = new Map();
  /** @type {any[]} */
  const tops = [];
  for (const r of all) {
    if (!r || typeof r !== 'object') continue;
    const id = String(r.commentId || r.id || '').trim();
    const level = Number(r.replyLevel);
    const parent = String(r.parentId || '').trim() || (Number.isFinite(level) && level > 0 && id.includes('.') ? id.slice(0, id.lastIndexOf('.')) : '');
    if ((Number.isFinite(level) && level > 0) || parent) {
      if (!parent) continue;
      if (!repliesByParent.has(parent)) repliesByParent.set(parent, []);
      repliesByParent.get(parent).push(r);
      continue;
    }
    tops.push(r);
  }
  /** @type {Map<string, any[]>} */
  const byKey = new Map();
  const push = (/** @type {any} */ who, /** @type {any} */ c) => {
    for (const key of personKeysOf(who)) {
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(c);
    }
  };
  /** @type {Map<string, any>} */
  const topById = new Map();
  for (const t of tops) {
    const tid = String(t.commentId || '').trim();
    if (tid) topById.set(tid, t);
    const replies = tid ? repliesByParent.get(tid) || [] : [];
    push(t, { ...t, replies });
  }
  // 返信だけ書いた人も、タップで「何を書いたか」が出るように、その人の返信を本人の書いたことに載せる(誰への返信かも)
  for (const [parent, list] of repliesByParent) {
    const top = topById.get(parent);
    const replyTo = String(top?.name || top?.handle || '').trim();
    for (const r of list) push(r, { ...r, replies: [], ...(replyTo ? { replyTo } : {}) });
  }
  return list.map((p) => {
    /** @type {any[]} */
    const mine = [];
    const seen = new Set();
    for (const key of personKeysOf(p)) {
      for (const c of byKey.get(key) || []) {
        if (seen.has(c)) continue;
        seen.add(c);
        mine.push(c);
      }
    }
    if (!mine.length) return p;
    return { ...p, comments: mergeVideoCommentLists(p?.comments, mine) };
  });
}

/** @param {any} x @returns {string[]} */
function personKeysOf(x) {
  /** @type {string[]} */
  const out = [];
  for (const k of [x?.channelId, x?.userId, x?.id, x?.handle, x?.authorId]) {
    const s = String(k || '').trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * @param {unknown} s
 * @returns {string}
 */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 1件分の小さな印(時刻・いいね・ハート・固定・編集・メンバー・スーパーサンクス)。無いものは出さない。
 * @param {VideoCommentDetail} c
 * @returns {string[]}
 */
export function videoCommentMetaParts(c) {
  const parts = [];
  if (c.replyTo) parts.push(`${c.replyTo} への返信`);
  if (c.timeText) parts.push(c.timeText);
  if (c.likes) parts.push(`👍 ${c.likes}`);
  else if (c.likeCount != null && c.likeCount > 0) parts.push(`👍 ${c.likeCount.toLocaleString('ja-JP')}`);
  if (c.heart) parts.push('❤ 投稿者がハート');
  if (c.pinned) parts.push('📌 固定');
  if (c.paid) parts.push(`💲 ${c.paid}`);
  if (c.edited) parts.push('編集済み');
  return parts;
}

/**
 * 返信の一行(投稿者が返したか・だれが返したか・読み込まれていない分)。返信が1件も無いと分かっていれば ''。
 * @param {VideoCommentDetail} c
 * @returns {string} HTML
 */
export function videoCommentRepliesHtml(c) {
  const loaded = c.replies.length;
  const total = c.replyCount != null ? Math.max(c.replyCount, loaded) : loaded;
  if (total <= 0) return '';
  const creator = c.replies.filter((r) => r.isCreator);
  const viewers = c.replies.filter((r) => !r.isCreator);
  const bits = [];
  bits.push(`返信 ${total.toLocaleString('ja-JP')}件`);
  const unreadN = total - loaded;
  if (creator.length) bits.push('<span class="nlsb-person-detail__owner-reply" data-owner-reply="1">投稿者の返信 あり</span>');
  else if (unreadN <= 0) bits.push('<span class="nlsb-person-detail__owner-reply" data-owner-reply="0">投稿者の返信 なし</span>');
  if (viewers.length) {
    const faces = viewers.slice(0, 6).map((r) => {
      const face = r.avatarUrl && !isSiteDefaultSilhouetteUrl(r.avatarUrl) ? `<img class="nlsb-person-detail__reply-face" src="${esc(r.avatarUrl)}" alt="" width="16" height="16" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '';
      return `<span class="nlsb-person-detail__reply-who">${face}${esc(r.name || r.id)}</span>`;
    }).join('、');
    const more = viewers.length > 6 ? ` ほか${(viewers.length - 6).toLocaleString('ja-JP')}人` : '';
    bits.push(`視聴者の返信 ${faces}${more}`);
  }
  const unread = total - loaded;
  if (unread > 0) bits.push(loaded > 0 ? `（あと${unread.toLocaleString('ja-JP')}件は未読み込み）` : '（未読み込み）');
  return `<p class="nlsb-person-detail__comment-replies" data-replies-loaded="${loaded}" data-replies-total="${total}">${bits.join(' ・ ')}</p>`;
}

/**
 * 「書いたこと」の一覧。先頭の数件はそのまま、残りは「詳しく」の中。1件ずつの細かい項目(返信の本文・時刻の印・正確ないいね数)も「詳しく」。
 * @param {readonly any[] | null | undefined} comments
 * @returns {string} HTML(コメントが無ければ '')
 */
export function videoCommentsDetailHtml(comments) {
  const list = (Array.isArray(comments) ? comments : []).map(normalizeVideoComment).filter((c) => c.text || c.id);
  if (!list.length) return '';
  const item = (/** @type {VideoCommentDetail} */ c) => {
    const meta = videoCommentMetaParts(c);
    const extra = [];
    if (c.likeCount != null && c.likes && String(c.likeCount) !== c.likes.replace(/,/g, '')) extra.push(`いいね ${c.likeCount.toLocaleString('ja-JP')}`);
    if (c.member) extra.push(`メンバー ${c.member}`);
    if (c.badge) extra.push(c.badge);
    if (c.timeMarks.length) extra.push(`動画の時刻 ${c.timeMarks.join('、')}`);
    const replyTexts = c.replies.filter((r) => r.text).map((r) =>
      `<li>${esc(r.name || r.id)}${r.isCreator ? '（投稿者）' : ''}：${esc(r.text)}${r.timeText ? ` <span class="nlsb-person-detail__comment-meta">${esc(r.timeText)}</span>` : ''}${r.likes ? ` <span class="nlsb-person-detail__comment-meta">👍 ${esc(r.likes)}</span>` : ''}</li>`).join('');
    const more = extra.length || replyTexts
      ? `<details class="nlsb-person-detail__more"><summary>詳しく</summary>${extra.length ? `<p class="nlsb-person-detail__comment-meta">${esc(extra.join(' ・ '))}</p>` : ''}${replyTexts ? `<ul class="nlsb-person-detail__reply-texts">${replyTexts}</ul>` : ''}</details>`
      : '';
    return (
      `<li class="nlsb-person-detail__comment"${c.id ? ` data-comment-id="${esc(c.id)}"` : ''}>` +
      (c.text ? `<p class="nlsb-person-detail__comment-text">${esc(c.text)}</p>` : '') +
      (meta.length ? `<p class="nlsb-person-detail__comment-meta">${esc(meta.join(' ・ '))}</p>` : '') +
      videoCommentRepliesHtml(c) +
      more +
      `</li>`
    );
  };
  const first = list.slice(0, VIDEO_COMMENTS_SHOWN_FIRST).map(item).join('');
  const rest = list.slice(VIDEO_COMMENTS_SHOWN_FIRST);
  const restHtml = rest.length
    ? `<details class="nlsb-person-detail__more"><summary>詳しく（ほか ${rest.length.toLocaleString('ja-JP')} 件）</summary><ul class="nlsb-person-detail__comments">${rest.map(item).join('')}</ul></details>`
    : '';
  return (
    `<div class="nlsb-person-detail__wrote"><p class="nlsb-person-detail__label">この動画で書いたこと</p>` +
    `<ul class="nlsb-person-detail__comments">${first}</ul>${restHtml}</div>`
  );
}
