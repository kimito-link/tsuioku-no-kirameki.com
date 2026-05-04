/**
 * NDGR ギフト protobuf から拾いがちな「内部用ラベル」を表示名から除外する。
 * 実例: nicolive_audition_lightgreen 等（本家の表示名ではない）
 */

import { supportGridStrongNickname } from './supportGridDisplayTier.js';

/**
 * @param {unknown} s
 * @returns {boolean}
 */
export function isLikelyInternalNdgGiftOrCampaignLabel(s) {
  const t = String(s || '').trim();
  if (!t) return false;
  if (/^nicolive_/i.test(t)) return true;
  // 長い ASCII のみ snake_case（人間のニックに稀なパターン）
  const hasNonAscii = [...t].some((ch) => (ch.codePointAt(0) ?? 0) > 127);
  if (/^[a-z][a-z0-9_]{22,}$/i.test(t) && !hasNonAscii) return true;
  return false;
}

/**
 * ストレージ上のニックを、より信頼できる新ニックで置き換えるか
 * @param {string} prev
 * @param {string} next
 * @param {string} userId
 */
export function nicknameShouldReplaceExisting(prev, next, userId) {
  const p = String(prev || '').trim();
  const n = String(next || '').trim();
  const uid = String(userId || '').trim();
  if (!n) return false;
  if (!p) return !isLikelyInternalNdgGiftOrCampaignLabel(n);
  if (isLikelyInternalNdgGiftOrCampaignLabel(p) && !isLikelyInternalNdgGiftOrCampaignLabel(n)) {
    return true;
  }
  if (supportGridStrongNickname(n, uid) && !supportGridStrongNickname(p, uid)) {
    return true;
  }
  return false;
}

/**
 * ギフト帯・応援ランク用の最終表示名（ストレージ優先だが内部ラベルはコメント側へ譲る）
 * @param {string} userId
 * @param {string} storedNick
 * @param {string} commentCachedNick
 * @param {string} [interceptNick] 視聴ページ intercept で観測した表示名（本家コメ UI 由来）
 * @returns {string}
 */
export function pickGiftRankDisplayNickname(
  userId,
  storedNick,
  commentCachedNick,
  interceptNick = ''
) {
  const uid = String(userId || '').trim();
  const a = String(storedNick || '').trim();
  const b = String(commentCachedNick || '').trim();
  const c = String(interceptNick || '').trim();
  if (c && nicknameShouldReplaceExisting(a, c, uid)) {
    return c;
  }
  if (isLikelyInternalNdgGiftOrCampaignLabel(a) && b && !isLikelyInternalNdgGiftOrCampaignLabel(b)) {
    return b;
  }
  if (supportGridStrongNickname(b, uid) && !supportGridStrongNickname(a, uid)) {
    return b;
  }
  if (!a && b) return b;
  return a || b;
}

/**
 * NDGR ギフト着信行の nickname を、intercept マップで上書きできるなら上書きする（merge 直前）。
 * @param {{ userId?: unknown, nickname?: unknown }[]} incoming
 * @param {(uid: string) => string} getInterceptNick
 * @returns {{ userId?: unknown, nickname?: unknown }[]}
 */
export function enrichIncomingGiftThrowUsersWithInterceptNicknames(incoming, getInterceptNick) {
  if (!Array.isArray(incoming) || !incoming.length) return incoming;
  const get = typeof getInterceptNick === 'function' ? getInterceptNick : () => '';
  return incoming.map((u) => {
    const uid = String(u?.userId ?? '').trim();
    if (!uid) return u;
    const ndgr = String(u?.nickname ?? '').trim();
    const intercept = String(get(uid) || '').trim();
    if (intercept && nicknameShouldReplaceExisting(ndgr, intercept, uid)) {
      return { ...u, nickname: intercept };
    }
    return u;
  });
}

/**
 * ストレージ済みギフト行の nickname を intercept で後追い補正する。
 * @param {Array<Record<string, unknown>>} rows
 * @param {(uid: string) => string} getInterceptNick
 * @returns {{ next: Array<Record<string, unknown>>, storageTouched: boolean }}
 */
export function upgradeGiftUserRowsWithInterceptNicknames(rows, getInterceptNick) {
  if (!Array.isArray(rows) || !rows.length) {
    return { next: Array.isArray(rows) ? rows : [], storageTouched: false };
  }
  const get = typeof getInterceptNick === 'function' ? getInterceptNick : () => '';
  let storageTouched = false;
  const next = rows.map((row) => {
    const uid = String(row?.userId ?? '').trim();
    if (!uid) return row;
    const nick = String(row?.nickname ?? '').trim();
    const intercept = String(get(uid) || '').trim();
    if (intercept && nicknameShouldReplaceExisting(nick, intercept, uid)) {
      storageTouched = true;
      return { ...row, nickname: intercept };
    }
    return row;
  });
  return { next, storageTouched };
}
