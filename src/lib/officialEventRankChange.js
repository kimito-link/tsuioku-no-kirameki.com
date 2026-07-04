// officialEventRankChange.js
// 配信者が参加しているニコニコイベント(audition)の現在順位(scrapeOfficialEventBannerFromDom の rank)を
//   前回値と比較し、上がった/下がったを検知する純関数。
//
// ★対象は「配信者自身」の順位のみ(ユーザー要望: 応援者個人の順位は変動が激しすぎて音がうるさくなる)。
// ★イベント未参加/DOM取得不能(event_present_unscrapable)の配信では rank が null になるため、
//   null を挟んだ比較では変動とみなさない(誤検知防止)。
// ★数値が小さいほど良い順位(1位が最上位)なので、rank が減れば UP、増えれば DOWN。

/**
 * 前回の順位と今回の順位を比較する純関数。
 * @param {number|null|undefined} prevRank 前回の順位(null/undefined=前回は不明・比較しない)
 * @param {number|null|undefined} currentRank 今回の順位(null/undefined=今回は取得できていない)
 * @returns {'up'|'down'|'none'} up=順位が上がった(数値が減った) / down=下がった(数値が増えた) / none=変化なし・比較不能
 */
export function detectOfficialEventRankChange(prevRank, currentRank) {
  const prev = Number.isFinite(prevRank) ? Number(prevRank) : null;
  const current = Number.isFinite(currentRank) ? Number(currentRank) : null;
  if (prev === null || current === null) return 'none'; // 片方でも欠測なら誤検知を避けて none
  if (prev <= 0 || current <= 0) return 'none'; // 順位は1始まりの正整数のみ有効
  if (current < prev) return 'up';
  if (current > prev) return 'down';
  return 'none';
}
