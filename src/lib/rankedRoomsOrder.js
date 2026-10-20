/**
 * rankedRoomsOrder.js — 応援ランキング(ユーザー別の記録内件数の多い順)の並びを安定させる純関数(2026-10-20)。
 *
 * 背景: popup の応援ランキングが「めまぐるしく入れ替わる」と報告された。真因は2つ(docs: 数字の設計の調査)。
 *   (1) 件数の入力が 2,500件の均等サンプルで、コメントが1件増えるたびにサンプル位置が全部ずれた(=別 lib 側で全件に直す)。
 *   (2) 同数のときの並びを、サムネ評価・直近5分の件数・最終発言時刻という【時間で動く値】で決めていた。
 *       前回の順位を参照する仕組みも無かった。
 *
 * 規則(これだけ):
 *   1. 件数の降順。
 *   2. 同数は【前回の順位を保つ】(追いつかれただけでは抜かれない・厳密に上回って初めて抜かれる)。
 *   3. 前回に居なかった人(新顔)は、同数の既存の人の後ろ。新顔どうしは userKey の昇順(入力の並びに依らず決定的)。
 *   → 件数が少ない人が多い人を抜くことは無く、同数のぐらつき・循環も起きない(性質テストで固定)。
 *   会場の stabilizeVenueSupporterOrder(連続スコアのバンド量子化)は、整数の件数には向かないので使わない。
 *   「N秒ホールド」「ペアワイズ比較」は会場 SPEC で非推移・遅延のため却下済み(同じ轍を踏まない)。
 *
 * @module rankedRoomsOrder
 */

/** 次回のために覚えておく順位キーの最大数(上位だけで十分。メモリを抑える)。 */
export const RANK_ORDER_KEEP_MAX = 300;

/**
 * @template {{ userKey: string, count: number }} T
 * @param {readonly T[]} rooms 集計済みのルーム(件数つき)
 * @param {readonly string[]} prevKeys 前回の並び(userKey の列)。配信が変わったときは [] を渡す。
 * @returns {{ ordered: T[], keys: string[] }}
 */
export function orderRankedRooms(rooms, prevKeys) {
  const list = Array.isArray(rooms) ? rooms : [];
  const prev = Array.isArray(prevKeys) ? prevKeys : [];
  /** @type {Map<string, number>} */
  const prevRank = new Map();
  for (let i = 0; i < prev.length; i++) {
    if (!prevRank.has(prev[i])) prevRank.set(prev[i], i);
  }
  const ordered = [...list].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const ra = prevRank.has(a.userKey) ? /** @type {number} */ (prevRank.get(a.userKey)) : Infinity;
    const rb = prevRank.has(b.userKey) ? /** @type {number} */ (prevRank.get(b.userKey)) : Infinity;
    if (ra !== rb) return ra < rb ? -1 : 1;
    return a.userKey < b.userKey ? -1 : a.userKey > b.userKey ? 1 : 0;
  });
  return { ordered, keys: ordered.slice(0, RANK_ORDER_KEEP_MAX).map((r) => r.userKey) };
}
