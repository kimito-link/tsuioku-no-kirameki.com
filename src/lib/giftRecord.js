/**
 * ギフト/広告ユーザーの永続化（純関数）
 */

import {
  isLikelyInternalNdgGiftOrCampaignLabel,
  nicknameShouldReplaceExisting
} from './giftDisplayNickname.js';

/**
 * @typedef {{ userId: string, nickname: string, capturedAt: number }} StoredGiftUser
 */

/**
 * NDGR 等で検知したギフト／アイテム1イベントにつき throwCount を 1 加算する行。
 *
 * @typedef {{ userId: string, nickname: string, capturedAt: number, throwCount: number }} StoredGiftUserWithThrows
 */

/**
 * ストレージ上の throwCount を正規化（省略・不正値は 1）
 * @param {unknown} v
 * @returns {number}
 */
export function normalizeGiftThrowCount(v) {
  const n = Math.round(Number(v));
  if (Number.isFinite(n) && n >= 1) return n;
  return 1;
}

/**
 * 同一 userId の複数イベントを回数としてマージする（mergeGiftUsers とは別経路）。
 *
 * @param {Partial<StoredGiftUserWithThrows & StoredGiftUser>[]} existing
 * @param {{ userId: string, nickname?: string }[]} incoming 1要素 = 1検知イベント
 * @returns {{ next: StoredGiftUserWithThrows[], added: StoredGiftUserWithThrows[], storageTouched: boolean }}
 */
export function mergeGiftUserThrowEvents(existing, incoming) {
  if (!incoming?.length) {
    const next = [];
    for (const e of existing) {
      const uid = String(e?.userId || '').trim();
      if (!uid) continue;
      next.push({
        userId: uid,
        nickname: String(e?.nickname || '').trim(),
        capturedAt: Number(e?.capturedAt) || 0,
        throwCount: normalizeGiftThrowCount(e?.throwCount)
      });
    }
    return { next, added: [], storageTouched: false };
  }

  /** @type {Map<string, StoredGiftUserWithThrows>} */
  const byId = new Map();
  for (const e of existing) {
    const uid = String(e?.userId || '').trim();
    if (!uid) continue;
    byId.set(uid, {
      userId: uid,
      nickname: String(e?.nickname || '').trim(),
      capturedAt: Number(e?.capturedAt) || 0,
      throwCount: normalizeGiftThrowCount(e?.throwCount)
    });
  }

  /** @type {StoredGiftUserWithThrows[]} */
  const added = [];
  let storageTouched = false;
  const now = Date.now();

  for (const inc of incoming) {
    const uid = String(inc?.userId || '').trim();
    if (!uid) continue;
    const nick = String(inc?.nickname || '').trim();
    const ex = byId.get(uid);
    if (ex) {
      ex.throwCount += 1;
      ex.capturedAt = now;
      if (nicknameShouldReplaceExisting(ex.nickname, nick, uid)) {
        ex.nickname = nick;
      }
      storageTouched = true;
    } else {
      const safeNick =
        nick && isLikelyInternalNdgGiftOrCampaignLabel(nick) ? '' : nick;
      const entry = {
        userId: uid,
        nickname: safeNick,
        capturedAt: now,
        throwCount: 1
      };
      byId.set(uid, entry);
      added.push({ ...entry });
      storageTouched = true;
    }
  }

  const next = [...byId.values()];
  return { next, added, storageTouched };
}

/**
 * @param {StoredGiftUser[]} existing
 * @param {{ userId: string, nickname?: string }[]} incoming
 * @returns {{ next: StoredGiftUser[], added: StoredGiftUser[], storageTouched: boolean }}
 */
export function mergeGiftUsers(existing, incoming) {
  /** @type {Map<string, StoredGiftUser>} */
  const byId = new Map();
  for (const e of existing) {
    byId.set(e.userId, e);
  }
  /** @type {StoredGiftUser[]} */
  const added = [];
  let storageTouched = false;
  const now = Date.now();

  for (const inc of incoming) {
    const uid = String(inc.userId || '').trim();
    const nick = String(inc.nickname || '').trim();
    // v0.1.215: anonymous gift（uid 空 + nickname あり）も bucket key を
    //   __anon_<nickname> にして storage に格納する。これで popup「ユーザー
    //   別の応援件数」 fallback (refreshGiftRankStrip) で anonymous gift も
    //   表示される。同名 anonymous は 1 つの bucket に集約する仕様。
    //   uid 空 + nickname が内部ラベルのみ（運営割り当て）の場合は表示価値が
    //   ないので従来通り skip。
    if (!uid && (!nick || isLikelyInternalNdgGiftOrCampaignLabel(nick))) {
      continue;
    }
    const key = uid || `__anon_${nick}`;

    const ex = byId.get(key);
    if (ex) {
      if (nicknameShouldReplaceExisting(ex.nickname, nick, key)) {
        byId.set(key, { ...ex, nickname: nick });
        storageTouched = true;
      }
      continue;
    }
    const entryNickname =
      nick && isLikelyInternalNdgGiftOrCampaignLabel(nick) ? '' : nick;
    /** @type {StoredGiftUser} */
    const entry = { userId: key, nickname: entryNickname, capturedAt: now };
    byId.set(key, entry);
    added.push(entry);
  }

  if (added.length) storageTouched = true;
  const next = [...byId.values()];
  return { next, added, storageTouched };
}
