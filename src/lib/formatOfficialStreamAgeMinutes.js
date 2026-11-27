import { formatLongGapJa, MARKETING_TIMELINE_MAX_MINUTES } from './marketingTimeSpan.js';

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
  // v0.1.2265: 7日ちょうど以上の経過は「38380時間9分」のような数にせず、日・年で(どのサービスも同じ帯の読み口)。7日未満は今まで通り
  if (rounded >= MARKETING_TIMELINE_MAX_MINUTES) return formatLongGapJa(rounded * 60_000) || '';
  if (rounded < 60) return `${rounded}分`;
  const h = Math.floor(rounded / 60);
  const r = rounded % 60;
  if (r === 0) return `${h}時間`;
  return `${h}時間${r}分`;
}
