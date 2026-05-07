/**
 * v0.1.214: anonymous gift（userId 空）も nickname を bucket key にして
 * lifetime 観測（ギフト送信者観測数）の対象に含める。これまでは uid 空 =
 * 完全 skip だったため、anonymous gift だけ来た配信では「ギフト送信者観測数」
 * が 0 のまま表示されていた。
 *
 * 同名 anonymous は同じ bucket に集約される（nickname 単位で集計）。
 * 副作用なし。
 */

/**
 * @param {{ userId?: unknown, nickname?: unknown }|null|undefined} input
 * @returns {string|null}
 */
export function resolveGiftSenderBucketKey(input) {
  if (!input || typeof input !== 'object') return null;
  const uid = String(input.userId ?? '').trim();
  if (uid) return uid;
  const nickname = String(input.nickname ?? '').trim();
  if (nickname) return `__anon_${nickname}`;
  return null;
}
