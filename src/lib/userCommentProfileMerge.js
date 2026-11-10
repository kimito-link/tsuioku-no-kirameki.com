// userCommentProfileMerge.js — 横の欄(popup)の描き直しごとに、記録の行から名前・顔の控えを学び、行を補い、控えを刈る1回分。
//   控えそのものの部品(学ぶ・補う・刈る)は userCommentProfileCache.js。ここは3つを「結果が毎回同じになる順」でつなぐ。

import { toEpochMs } from './timeAuthority.js';
import {
  applyUserCommentProfileMapToEntries,
  pruneUserCommentProfileMap,
  upsertUserCommentProfileFromEntry
} from './userCommentProfileCache.js';

/** @typedef {{ updatedAt: number, nickname?: string, avatarUrl?: string }} ProfileEntry */

/**
 * 記録の行(arr)から控え(map)を学び、控えで行を補い、控えを上限まで刈る。横の欄(popup)の描き直しごとの1回分。
 *
 * ★v0.1.1984: 人数が上限(USER_COMMENT_PROFILE_CACHE_MAX=5,000人)を超える配信で、描き直しが止まらなくなっていた。
 *   上限を超えた分は刈られる → 次の描き直しでまた学ぶ(更新時刻=いま になる)→ 古い順に別の人が刈られる → 中身が毎回変わる
 *   → 控えを書く → その知らせで自分がまた描き直す、の繰り返し(手元の計測: 6,500人の配信で、何も変わっていないのに
 *   約10秒の描き直しが 30〜40秒おきに続いた)。
 *   直し方: この回で新しく入った人の更新時刻は「いま」ではなく「その人を最後に見た時刻(行の capturedAt)」にする。
 *   刈るときは最近見た人が残る。同じ記録・同じ控えなら結果が毎回同じになり、中身が変わらなければ「変わった」と言わない。
 *
 * @template T
 * @param {Record<string, ProfileEntry>} map 読み込んだ控え(この中身は書き換わる)
 * @param {T[]} arr 記録の行
 * @param {{ nowMs?: number, max?: number }} [opts]
 * @returns {{ map: Record<string, ProfileEntry>, arr: T[], commentsPatched: boolean, cacheTouched: boolean }}
 */
export function mergeEntriesIntoUserCommentProfileMap(map, arr, opts = {}) {
  const nowRaw = Number(opts.nowMs);
  const nowMs = Number.isFinite(nowRaw) && nowRaw > 0 ? nowRaw : Date.now();
  /** @type {Record<string, ProfileEntry>} 始まりの中身(同じ物かどうかで変化を見る) */
  const before = { ...map };
  const beforeCount = Object.keys(before).length;
  /** @type {Map<string, number>} この回で新しく入った人 → 最後に見た時刻 */
  const lastSeenOfNew = new Map();
  for (const e of arr) {
    const row = /** @type {{ userId?: unknown, capturedAt?: unknown }} */ (e);
    const changed = upsertUserCommentProfileFromEntry(map, /** @type {any} */ (e));
    const uid = String(row?.userId || '').trim();
    if (!uid || before[uid]) continue;
    if (!changed && !lastSeenOfNew.has(uid)) continue;
    const at = toEpochMs(row?.capturedAt); // 時刻の読み方は timeAuthority に任せる
    const seen = at >= 1_000_000_000_000 ? Math.min(nowMs, at) : nowMs;
    const cur = lastSeenOfNew.get(uid);
    if (cur === undefined || seen > cur) lastSeenOfNew.set(uid, seen);
  }
  for (const [uid, seen] of lastSeenOfNew) {
    const hit = map[uid];
    if (hit) hit.updatedAt = seen;
  }
  const ap = applyUserCommentProfileMapToEntries(arr, map);
  const pruned = pruneUserCommentProfileMap(map, opts.max, { nowMs });
  const afterKeys = Object.keys(pruned);
  let cacheTouched = afterKeys.length !== beforeCount;
  if (!cacheTouched) {
    for (const k of afterKeys) {
      if (pruned[k] !== before[k]) {
        cacheTouched = true;
        break;
      }
    }
  }
  return { map: pruned, arr: ap.patched > 0 ? ap.next : arr, commentsPatched: ap.patched > 0, cacheTouched };
}
