/**
 * NDGR decodeChat の結果を mergeNewComments 向け行に変換する。
 */

import { normalizeCommentText } from './commentRecord.js';
import { anonymousNicknameFallback } from './nicoAnonymousDisplay.js';
import { parseGiftCommentText } from './parseGiftComment.js';
import { shouldAcceptNdgrChatAsComment } from './ndgrDecode.js';

/**
 * @param {import('./ndgrDecode.js').NdgrChat} chat
 * @returns {string|null}
 */
function ndgrChatUserId(chat) {
  /** page-intercept の handleNdgrResult と同じく rawUserId が falsy（0 含む）ならハッシュへ */
  if (chat.rawUserId) {
    const s = String(chat.rawUserId).trim();
    if (s) return s;
  }
  const h = String(chat.hashedUserId || '').trim();
  return h || null;
}

/**
 * @typedef {{ commentNo: string, text: string, userId: string|null, nickname?: string, vpos?: number|null, accountStatus?: number|null, is184?: boolean }} NdgrMergeRow
 */

/**
 * @param {import('./ndgrDecode.js').NdgrChat[]} chats
 * @returns {NdgrMergeRow[]}
 */
export function ndgrChatsToMergeRows(chats) {
  if (!Array.isArray(chats) || !chats.length) return [];
  /** @type {NdgrMergeRow[]} */
  const out = [];
  for (const chat of chats) {
    if (!chat) continue;
    const text = normalizeCommentText(chat.content);
    if (!text) continue;
    // v0.1.195: ギフトシステムメッセージは通常コメントとして記録しない
    // （cleanNdgrChatRows と同じ guard を NDGR decode 経路にも適用）
    if (parseGiftCommentText(text)) continue;
    // v0.1.803(星野ロミ式最大化): 採用判定を shouldAcceptNdgrChatAsComment に一元化。
    //   no(コメント番号)が無くても「content 非空 かつ userId を持つ」匿名(184)
    //   コメントは採用し、捨てずレーンへ活かす(userLaneCandidatesFromStorage は
    //   userId 必須)。no 無し+userId 無し(gift payload 誤読等)は採用しない。
    //   commentNo 欠落行は buildDedupeKey が text+sec+uid フォールバックで安全に
    //   重複排除する(commentRecord.js:75-84 + createLoneDedupeIndex で裏取り済)。
    if (!shouldAcceptNdgrChatAsComment(chat)) continue;
    const commentNo = chat.no != null ? String(chat.no).trim() : '';
    const uid = ndgrChatUserId(chat);
    /** @type {NdgrMergeRow} */
    const row = { commentNo, text, userId: uid || null };
    const nick = anonymousNicknameFallback(uid, chat.name);
    if (nick) row.nickname = nick;
    if (chat.vpos != null) row.vpos = chat.vpos;
    if (chat.accountStatus != null) row.accountStatus = chat.accountStatus;
    if (chat.is184) row.is184 = true;
    out.push(row);
  }
  return out;
}
