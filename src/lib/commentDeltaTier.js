/**
 * コメント増分(件)の段階(葉モジュール・依存ゼロ)。
 *   ギフトの pt 段階(tierForGiftDeltaPoints)とは別物(1件と1ptは重みが違う)。
 *   /live/ の liveMotion.js から移動した(liveMotion.js は re-export=正本は1つ)。
 *   ★popup が liveMotion.js を import すると liveRankingView.js(500行超)が bundle に付いてくるため、
 *     応援レーンの「熱い人」はこの葉だけを読む。
 */

/** @param {number} d @returns {'small'|'medium'|'large'|'mega'} */
export function tierForCommentDelta(d) {
  return d >= 10 ? 'mega' : d >= 5 ? 'large' : d >= 2 ? 'medium' : 'small';
}
