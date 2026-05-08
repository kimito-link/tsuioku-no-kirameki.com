import { parseGiftCommentText } from './parseGiftComment.js';

/**
 * NDGR チャット行の正規化純関数。
 * content-entry.js L935-957 から抽出。
 *
 * @param {unknown[]} raw
 * @returns {{ commentNo: string, text: string, userId: string|null, nickname?: string, vpos?: number|null, accountStatus?: number|null, is184?: boolean }[]}
 */
export function cleanNdgrChatRows(raw) {
  /** @type {{ commentNo: string, text: string, userId: string|null, nickname?: string, vpos?: number|null, accountStatus?: number|null, is184?: boolean }[]} */
  const cleaned = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const commentNo = String(/** @type {any} */ (x).commentNo ?? '').trim();
    const text = String(/** @type {any} */ (x).text ?? '');
    if (!commentNo) continue;
    // v0.1.195: ギフトシステムメッセージは「ユーザーが投げたコメント」ではないので
    //   nls_comments_<lv> に persist しない。content/userId はギフト送信者のもので、
    //   そのまま記録すると非コメユーザーが「ユーザー別応援件数」に混入する真因。
    //   v0.1.172 で `requireText: true` を入れたが、これらの行は text 非空のため
    //   素通りしていたので、parseGiftCommentText で確定排除する。
    if (parseGiftCommentText(text)) continue;
    const uid = String(/** @type {any} */ (x).userId ?? '').trim();
    /** @type {{ commentNo: string, text: string, userId: string|null, nickname?: string, vpos?: number|null, accountStatus?: number|null, is184?: boolean }} */
    const row = { commentNo, text, userId: uid || null };
    const nick = String(/** @type {any} */ (x).nickname ?? '').trim();
    if (nick) row.nickname = nick;
    if (/** @type {any} */ (x).vpos != null) row.vpos = /** @type {any} */ (x).vpos;
    if (/** @type {any} */ (x).accountStatus != null) row.accountStatus = /** @type {any} */ (x).accountStatus;
    if (/** @type {any} */ (x).is184) row.is184 = true;
    cleaned.push(row);
  }
  return cleaned;
}
