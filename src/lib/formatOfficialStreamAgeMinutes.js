/**
 * 視聴ページ由来の「放送開始からの経過（分）」を短い日本語にする。
 * @param {unknown} streamAgeMin
 * @returns {string} 表示用。未取得は空文字。
 */
export function formatOfficialStreamAgeMinutes(streamAgeMin) {
  if (streamAgeMin == null || streamAgeMin === '') return '';
  const m = Number(streamAgeMin);
  if (!Number.isFinite(m) || m < 0) return '';
  const rounded = Math.round(m);
  if (rounded < 60) return `${rounded}分`;
  const h = Math.floor(rounded / 60);
  const r = rounded % 60;
  if (r === 0) return `${h}時間`;
  return `${h}時間${r}分`;
}
