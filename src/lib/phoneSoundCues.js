/**
 * v0.1.1737: スマホの WEB版でギフトの効果音を鳴らす「どれが新しく来たか」の判定(純関数)。
 *   拡張では会場モード(venueBar.js)がギフトの金額帯で音を選んで鳴らす。スマホには会場モードが無いので、
 *   送られてくるコメント鏡(commentTimelineMirror)のギフト行の【増えた分】から同じ音を選ぶ。
 *   ★最初に見た分は鳴らさない(開いた瞬間に過去のギフトがまとめて鳴らないように)。
 *   ★1回の更新で何件増えても鳴らすのは1回だけ・いちばん高い金額帯の音(会場のコンボと同じ「積み増ししない」考え)。
 *
 * @module phoneSoundCues
 */
import { effectSoundKindForGiftTier } from './effectSoundPlayer.js';
import { tierFromPoints } from './giftThrowProjectile.js';

/** 覚えておくキーの上限(鏡は最新60件なので十分)。 */
const SEEN_CAP = 400;
/** @type {Record<string, number>} */
const TIER_RANK = { small: 1, medium: 2, large: 3, mega: 4 };

/**
 * ギフト行の一意キー。番号は無いので「送り主・時刻・品名・pt」で作る。
 * @param {any} row
 * @returns {string}
 */
export function giftRowSoundKey(row) {
  const r = row && typeof row === 'object' ? row : {};
  return `g:${String(r.userId || r.name || '')}:${Number(r.at) || 0}:${String(r.itemName || r.text || '')}:${Number(r.point) || 0}`;
}

/**
 * @param {{ rows: any[], seen: Set<string>|null }} a seen が null = まだ一度も見ていない(最初の1回は覚えるだけ)
 * @returns {{ kind: string, count: number, seen: Set<string> }} kind が '' なら鳴らさない
 */
export function pickPhoneGiftSound(a) {
  const rows = Array.isArray(a && a.rows) ? a.rows : [];
  const first = !(a && a.seen instanceof Set);
  const seen = first ? new Set() : new Set(a.seen);
  let bestTier = '';
  let count = 0;
  for (const row of rows) {
    if (!row || row.kind !== 'gift') continue;
    const key = giftRowSoundKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    if (first) continue;
    count += 1;
    const tier = tierFromPoints(Number(row.point) || 0);
    if (!bestTier || TIER_RANK[tier] > TIER_RANK[bestTier]) bestTier = tier;
  }
  while (seen.size > SEEN_CAP) seen.delete(/** @type {string} */ (seen.values().next().value));
  return { kind: count > 0 ? effectSoundKindForGiftTier(bestTier) : '', count, seen };
}
