/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】公式時点の順位差と、前回スナップショットからの伸び
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.* / 日中の推定
 * 【書けるstorageキー】なし
 * 【正本宣言】「次の順位まで」と「前回からの伸び」の計算はこのファイルのみ
 *
 * calc.js — 1位は差なし。同点は 0。前回にいない人の伸びは null。
 */

/**
 * @typedef {import('./parse.js').RankingEntry} RankingEntry
 * @typedef {RankingEntry & {
 *   gapToNext: number|null,
 *   nextRank: number|null,
 *   scoreDelta: number|null,
 *   previousRank: number|null,
 *   previousScore: number|null
 * }} RankedEntry
 */

/**
 * @param {RankingEntry[]} current
 * @param {RankingEntry[]|null} previous
 * @returns {RankedEntry[]}
 */
export function rankEntries(current, previous) {
  const previousByUser = new Map((previous || []).map((entry) => [entry.userId, entry]));
  const byRank = new Map(current.map((entry) => [entry.rank, entry]));

  return [...current]
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => {
      /** @type {number|null} */
      let gapToNext = null;
      /** @type {number|null} */
      let nextRank = null;
      if (entry.rank > 1) {
        const direct = byRank.get(entry.rank - 1);
        const above = direct || [...current].filter((item) => item.rank < entry.rank).sort((a, b) => b.rank - a.rank)[0];
        if (above) {
          nextRank = above.rank;
          gapToNext = Math.max(0, above.score - entry.score);
        }
      }
      const prev = previousByUser.get(entry.userId);
      return {
        team: entry.team,
        rank: entry.rank,
        userId: entry.userId,
        displayName: entry.displayName,
        score: entry.score,
        gapToNext,
        nextRank,
        scoreDelta: prev ? entry.score - prev.score : null,
        previousRank: prev ? prev.rank : null,
        previousScore: prev ? prev.score : null
      };
    });
}
