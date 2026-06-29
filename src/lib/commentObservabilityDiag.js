/**
 * v0.1.225: コメント記録の uid 解決経路を AI 共有診断 JSON に自動で乗せる純関数。
 *
 * 背景: niconico の最新 frontend で uid を DOM/NDGR から取れない事象の root cause を
 * F12 不要で特定できるよう、観測値だけを増やす。挙動は一切変更しない。
 *
 * 副作用なし。
 */

import { normalizeCommentText } from './commentRecord.js';
import { parseGiftCommentText } from './parseGiftComment.js';
import { shouldAcceptNdgrChatAsComment } from './ndgrDecode.js';

const USER_ID_LIKE_ATTRS = Object.freeze([
  'data-user-id',
  'data-userid',
  'data-owner-id',
  'data-ownerid',
  'data-uid',
  'data-account-id',
  'data-account-no',
  'data-comment-user-id',
  'data-commenter-id',
  'data-poster-id'
]);

/**
 * @typedef {{
 *   sampledRows: number,
 *   rowsWithUserIdLikeAttr: number,
 *   rowsWithoutUserIdLikeAttr: number,
 *   userIdLikeAttributesFound: string[],
 *   attributeKeysSample: string[][]
 * }} CommentRowDataAttributesProbe
 */

/**
 * 直近のコメ table-row Element を sampling し、uid 系属性の有無を判定する。
 * @param {ArrayLike<Element>|null|undefined} rowElements
 * @param {{ limit?: number }} [opts]
 * @returns {CommentRowDataAttributesProbe}
 */
export function probeCommentRowDataAttributes(rowElements, opts) {
  const limit = Math.max(1, Math.min(10, Number(opts?.limit) || 5));
  /** @type {Element[]} */
  const rows = [];
  if (rowElements && typeof rowElements.length === 'number') {
    for (let i = 0; i < rowElements.length && rows.length < limit; i += 1) {
      const el = rowElements[i];
      if (el && typeof el.getAttribute === 'function') rows.push(el);
    }
  }
  /** @type {Set<string>} */
  const foundAttrs = new Set();
  /** @type {string[][]} */
  const keysSample = [];
  let withUid = 0;
  for (const el of rows) {
    /** @type {string[]} */
    let names = [];
    if (typeof el.getAttributeNames === 'function') {
      try { names = Array.from(el.getAttributeNames()); } catch { /* no-op */ }
    }
    keysSample.push(names);
    let hasUid = false;
    for (const candidate of USER_ID_LIKE_ATTRS) {
      if (typeof el.hasAttribute === 'function' && el.hasAttribute(candidate)) {
        foundAttrs.add(candidate);
        hasUid = true;
      }
    }
    if (hasUid) withUid += 1;
  }
  return {
    sampledRows: rows.length,
    rowsWithUserIdLikeAttr: withUid,
    rowsWithoutUserIdLikeAttr: rows.length - withUid,
    userIdLikeAttributesFound: [...foundAttrs],
    attributeKeysSample: keysSample
  };
}

/**
 * @typedef {{
 *   totalInput: number,
 *   noNumberSkip: number,
 *   emptyTextSkip: number,
 *   giftSystemMsgSkip: number,
 *   accepted: number
 * }} NdgrChatRejectionStats
 */

/**
 * NDGR chats を `ndgrChatsToMergeRows` と同じ条件で walk し、reject 理由別カウントを返す。
 * 採用判定は本体と同じ `shouldAcceptNdgrChatAsComment` を使い、ドリフトを防ぐ。
 * @param {ReadonlyArray<{ no?: number|string|null, content?: string, rawUserId?: number|string|null, hashedUserId?: string }>|null|undefined} chats
 * @returns {NdgrChatRejectionStats}
 */
export function analyzeNdgrChatRejection(chats) {
  const list = Array.isArray(chats) ? chats : [];
  let noNumberSkip = 0;
  let emptyTextSkip = 0;
  let giftSystemMsgSkip = 0;
  let accepted = 0;
  for (const chat of list) {
    if (!chat) {
      noNumberSkip += 1;
      continue;
    }
    const text = normalizeCommentText(chat.content);
    if (!text) {
      // 本体(ndgrChatsToMergeRows)が text 空を先に skip するのに合わせる。
      emptyTextSkip += 1;
      continue;
    }
    if (parseGiftCommentText(text)) {
      giftSystemMsgSkip += 1;
      continue;
    }
    // v0.1.803(星野ロミ式最大化): 採用判定は本体と同じ shouldAcceptNdgrChatAsComment。
    //   no があるか、または「content 非空 かつ userId 有り」(匿名コメント)なら採用。
    //   no も userId も無い(同定不能・gift payload 誤読等)は noNumberSkip に計上。
    if (shouldAcceptNdgrChatAsComment(chat)) {
      accepted += 1;
    } else {
      noNumberSkip += 1;
    }
  }
  return {
    totalInput: list.length,
    noNumberSkip,
    emptyTextSkip,
    giftSystemMsgSkip,
    accepted
  };
}

/**
 * @typedef {{
 *   totalSaved: number,
 *   withUid: number,
 *   withoutUid: number,
 *   withUidPercent: number,
 *   commentNoLess: number,
 *   commentNoLessPercent: number
 * }} SavedCommentsUidStats
 */

/**
 * 保存済 entry を userId あり/なし・commentNo あり/なしで集計（同一 walk・副作用なし）。
 *
 * v0.1.1001 計器(記録>本家 104% の切り分け): commentNo を持たない行(匿名184主体)は
 *   dedup キーが `liveId||text|sec|uid` の capturedAt 秒依存フォールバックになり、ライブと
 *   backfill で capturedAt 導出が違うと二重計上し得る(commentRecord.js:75-84)。
 *   「記録のうち何%が commentNo 欠落か」を状態速報に出せば、104% の内訳が「二重計上の温床
 *   (欠落行が多い)」か「本家統計の数え方差(欠落行は少ない)」かをスクショ1枚で切り分けられる。
 *
 * @param {ReadonlyArray<{ userId?: string|null, commentNo?: string|number|null }>|null|undefined} entries
 * @returns {SavedCommentsUidStats}
 */
export function aggregateSavedCommentsUidStats(entries) {
  const list = Array.isArray(entries) ? entries : [];
  let withUid = 0;
  let noLess = 0;
  for (const e of list) {
    const uid = e?.userId ? String(e.userId).trim() : '';
    if (uid) withUid += 1;
    const no = e?.commentNo != null ? String(e.commentNo).trim() : '';
    if (!no) noLess += 1;
  }
  const total = list.length;
  const without = total - withUid;
  const percent = total > 0 ? Math.round((withUid / total) * 1000) / 10 : 0;
  const noLessPercent = total > 0 ? Math.round((noLess / total) * 1000) / 10 : 0;
  return {
    totalSaved: total,
    withUid,
    withoutUid: without,
    withUidPercent: percent,
    commentNoLess: noLess,
    commentNoLessPercent: noLessPercent
  };
}

/**
 * page-intercept-entry.js が `data-nls-fetch-log` 属性に `' | '` 区切りで蓄積する
 * fetch hit 履歴（最新 20 件、URL pathname と Content-Type の短縮形）を配列化。
 * @param {string|null|undefined} attrValue
 * @returns {string[]}
 */
export function parseInterceptFetchLog(attrValue) {
  if (typeof attrValue !== 'string' || !attrValue) return [];
  return attrValue
    .split(' | ')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 累積カウンタ（commentIngestBySource 等）を snapshot として安全にコピーする。
 * @param {Record<string, number>|null|undefined} counters
 * @returns {Record<string, number>}
 */
export function snapshotCommentIngestCounters(counters) {
  if (!counters || typeof counters !== 'object') return {};
  /** @type {Record<string, number>} */
  const out = {};
  for (const key of Object.keys(counters)) {
    const v = Number(counters[key]);
    out[key] = Number.isFinite(v) && v >= 0 ? v : 0;
  }
  return out;
}
