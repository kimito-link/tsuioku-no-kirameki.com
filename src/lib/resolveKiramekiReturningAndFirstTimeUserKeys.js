/**
 * 「きらめきの賞」のかよい / はじまり判定用 userKey 分類（純関数）。
 *
 * @param {{
 *   currentUserKeys?: string[],
 *   pastUserIds?: Iterable<string>
 * }} input
 * @returns {{ returningUserKeys: string[], firstTimeUserKeys: string[] }}
 */
export function resolveKiramekiReturningAndFirstTimeUserKeys(input) {
  const currentUserKeys = Array.isArray(input?.currentUserKeys)
    ? input.currentUserKeys
    : [];
  const pastUserIds = input?.pastUserIds;
  const pastSet =
    pastUserIds instanceof Set
      ? pastUserIds
      : new Set(Array.isArray(pastUserIds) ? pastUserIds : []);

  /** @type {string[]} */
  const returningUserKeys = [];
  /** @type {string[]} */
  const firstTimeUserKeys = [];

  for (const key of currentUserKeys) {
    const k = String(key || '').trim();
    if (!k) continue;
    if (pastSet.has(k)) {
      returningUserKeys.push(k);
    } else {
      firstTimeUserKeys.push(k);
    }
  }

  return { returningUserKeys, firstTimeUserKeys };
}
