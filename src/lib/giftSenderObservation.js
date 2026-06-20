import { isPlausibleGiftDisplayText } from './giftDisplayNickname.js';

/**
 * v0.1.214: anonymous gift（userId 空）も nickname を bucket key にして
 * lifetime 観測（ギフト送信者観測数）の対象に含める。これまでは uid 空 =
 * 完全 skip だったため、anonymous gift だけ来た配信では「ギフト送信者観測数」
 * が 0 のまま表示されていた。
 *
 * 同名 anonymous は同じ bucket に集約される（nickname 単位で集計）。
 *
 * v0.1.837: nickname が文字化け（制御文字/U+FFFD を含む生 protobuf バイト等）の場合は
 *   `__anon_<生バイト>` バケットを作らない。実機 giftSenderDiag.topSenders に
 *   "__anon_\b…" のような文字化けキーが出ていた真因。giftRecord / giftEventStore が
 *   既に使う共有ガード isPlausibleGiftDisplayText に委譲（文字化けガードの実装分散を避ける）。
 *   診断カウンタのみに関わり、記録本体・会場/レーンには影響しない。
 * 副作用なし。
 *
 * @param {{ userId?: unknown, nickname?: unknown }|null|undefined} input
 * @returns {string|null}
 */
export function resolveGiftSenderBucketKey(input) {
  if (!input || typeof input !== 'object') return null;
  const uid = String(input.userId ?? '').trim();
  if (uid) return uid;
  const nickname = String(input.nickname ?? '').trim();
  // 文字化け（制御文字/U+FFFD 混じりの生バイト）は人間が読める名前でない=バケット化しない。
  if (nickname && isPlausibleGiftDisplayText(nickname)) return `__anon_${nickname}`;
  return null;
}
