/**
 * pickCountToShow.js — popup の見出し「記録コメント N 件」の元の値を選ぶ純関数(2026-10-20)。
 *
 * council/count-simplify-SYNTHESIS.md 第2: 表示の正本はサマリ(summaryRecordedCount=recordedCountForDisplay 系)。
 * 旧: max(サマリ, 表示用配列の長さ)。表示用配列(UI が組んだ行)は「並べる中身」であって件数の正本ではなく、
 *   一時的な二重合流(25→50)や暫定供給の件数を混ぜると、単調化ゲートがその過大値を居座らせた(memory: popup-count-overcount-race)。
 * 規則: サマリが取れている(>0)ならそれを使う。取れていない(null・0以下・不正)ときだけ配列の長さへ落とす
 *   (サマリが 0 のまま中身があるときに 0 に潰さない=「0潰れ」防止。AGENTS §12.8)。
 *
 * @param {number|null|undefined} summaryRecordedCount
 * @param {number} displayLength 表示用配列の長さ
 * @returns {number}
 */
export function pickCountToShow(summaryRecordedCount, displayLength) {
  const summary = Number(summaryRecordedCount);
  if (Number.isFinite(summary) && summary > 0) return Math.floor(summary);
  const len = Number(displayLength);
  return Number.isFinite(len) && len > 0 ? Math.floor(len) : 0;
}
