/**
 * ギフト／広告投げ主専用レーン用のエントリ一覧（りんく列とは別段）。
 */

import { isAnonymousStyleNicoUserId } from '../domain/user/identity.js';
import { pickBetterInterceptNickname } from './giftDisplayNickname.js';

/**
 * @typedef {{
 *   userId: string,
 *   nickname: string,
 *   capturedAt: number,
 *   avatarUrl: string,
 *   avatarObserved: boolean,
 *   liveId: string
 * }} GiftThrowerLaneEntry
 */

/**
 * @param {unknown} uid
 * @returns {boolean}
 */
function isNumericGiftThrowerUserId(uid) {
  return /^\d{5,14}$/.test(String(uid || '').trim());
}

/**
 * @param {readonly { userId?: unknown, nickname?: unknown, capturedAt?: unknown }[]|null|undefined} giftUsers
 * @param {{ liveId?: string }} [opts]
 * @returns {readonly Readonly<GiftThrowerLaneEntry>[]}
 */
export function buildGiftThrowerLaneEntries(giftUsers, opts = {}) {
  const outLiveId = String(opts.liveId || '').trim();
  /** @type {Map<string, GiftThrowerLaneEntry>} */
  const byUid = new Map();

  for (const g of Array.isArray(giftUsers) ? giftUsers : []) {
    const uid = String(g?.userId || '').trim();
    if (!uid || uid.startsWith('__anon_')) continue;
    if (isAnonymousStyleNicoUserId(uid)) continue;
    if (!isNumericGiftThrowerUserId(uid)) continue;

    const capturedAt = Number(g?.capturedAt);
    const sortAt = Number.isFinite(capturedAt) && capturedAt > 0 ? capturedAt : 0;
    const nick = String(g?.nickname || '').trim();
    const ex = byUid.get(uid);
    if (ex) {
      if (sortAt > ex.capturedAt) ex.capturedAt = sortAt;
      if (nick) ex.nickname = pickBetterInterceptNickname(uid, ex.nickname, nick);
      continue;
    }
    byUid.set(uid, {
      userId: uid,
      nickname: nick,
      capturedAt: sortAt,
      avatarUrl: '',
      avatarObserved: false,
      liveId: outLiveId
    });
  }

  const built = [...byUid.values()].sort((a, b) => b.capturedAt - a.capturedAt);
  return Object.freeze(
    built.map((row) =>
      Object.freeze({
        userId: row.userId,
        nickname: row.nickname,
        capturedAt: row.capturedAt,
        avatarUrl: row.avatarUrl,
        avatarObserved: row.avatarObserved,
        liveId: row.liveId
      })
    )
  );
}
