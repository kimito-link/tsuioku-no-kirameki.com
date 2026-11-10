/**
 * 人数がとても多い配信だけ、応援レーンに並べる人数を絞る(v0.1.1975・りんく決定 2026-11-10)。
 *
 * ★経緯(PC 実測 0.1.1974・Kick 8万行・約6,500人): 全員の顔を並べると、横の欄が開いた直後から固まり、
 *   90秒のうち99秒ぶん(重なり込み)メインスレッドが埋まった(顔の SVG 文書の作成 約5,700回/90秒など)。
 *   1万5千行(約1,200人)なら応答していた。
 *   → 候補が LANE_CROWD_LIMIT 人を超えたときだけ、段の優先順(りんく→こん太→たぬ姉)・件数の多い順で
 *     LANE_CROWD_LIMIT 人まで並べる。残りはレーン下の「ほか M人」に人数で出る(既存のフッター)。
 *     超えないとき(ニコ生の普段の配信)は今までどおり全員(v0.1.1232 lane-never-drop は変えない)。
 */
export const LANE_CROWD_LIMIT = 2000;

/**
 * @param {number} candidateTotal 名簿の復活込みの候補の人数
 * @param {number} baseLimit ふだんの上限(Infinity)
 * @returns {number} この描画で使う上限
 */
export function laneCrowdLimit(candidateTotal, baseLimit) {
  const n = Number(candidateTotal);
  return Number.isFinite(n) && n > LANE_CROWD_LIMIT ? LANE_CROWD_LIMIT : baseLimit;
}
