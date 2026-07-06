/**
 * 配信スコアパネル(カラオケ採点/太鼓の達人風)の純粋なスコア化ロジック。
 *
 * 背景(2026-07-04 ユーザー要望): 「太鼓の達人・パンチングマシーンのスコア、カラオケ採点みたいに
 *   配信の盛り上がりを点数で見たい。ダウンロード式でなくpopup内でいつでも見られるようにしたい」。
 *
 * ★軽量制約(ユーザー明示): HTMLレポート生成(marketingAggregate の全コメント再集計)は重いため
 *   新たに走らせない。既に15秒間引きでpublish済みの reportPreview(nls_report_preview_v1)を
 *   そのまま読むだけでスコア化する(新規の重い集計ゼロ・新規storage readゼロ)。
 *
 * @typedef {{
 *   total: number,             // 0-100
 *   rank: 'S'|'A'|'B'|'C'|'D',
 *   parts: { volume: number, people: number, pace: number, heat: number }
 * }} BroadcastScore
 */

/** @param {unknown} x @param {number} [fallback] @returns {number} */
function num(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * コメント総数から「量」の点数(0-30)。対数スケールで小規模配信も0点にしない。
 * @param {number} totalComments
 * @returns {number}
 */
function volumeScore(totalComments) {
  const n = Math.max(0, totalComments);
  return Math.min(30, 10 * Math.log10(n + 1));
}

/**
 * コメントした人数から「人気」の点数(0-30)。
 * @param {number} commenters
 * @returns {number}
 */
function peopleScore(commenters) {
  const n = Math.max(0, commenters);
  return Math.min(30, 12 * Math.log10(n + 1));
}

/**
 * 分速から「勢い」の点数(0-20)。
 * @param {number} commentsPerMinute
 * @returns {number}
 */
function paceScore(commentsPerMinute) {
  const n = Math.max(0, commentsPerMinute);
  return Math.min(20, n * 2);
}

/**
 * ヘビー層%・一度きり%から「熱量」の点数(0-20)。ヘビー層が多く一度きりが少ないほど高得点。
 *   コメント自体が無い(totalComments=0)配信は「一度きり率0%」が意味を持たないため0点にする
 *   (未観測を「一度きりが皆無=優秀」と誤って高評価しない)。
 * @param {number} heavyPct
 * @param {number} oncePct
 * @param {number} totalComments
 * @returns {number}
 */
function heatScore(heavyPct, oncePct, totalComments) {
  if (totalComments <= 0) return 0;
  const heavy = Math.max(0, heavyPct);
  const once = Math.max(0, oncePct);
  return Math.min(20, heavy * 0.8 + Math.max(0, 15 - once * 0.15));
}

/**
 * @param {number} total 0-100
 * @returns {'S'|'A'|'B'|'C'|'D'}
 */
export function rankForScore(total) {
  if (total >= 90) return 'S';
  if (total >= 75) return 'A';
  if (total >= 55) return 'B';
  if (total >= 35) return 'C';
  return 'D';
}

/**
 * reportPreview(nls_report_preview_v1 の中身)からスコアを計算する純関数。
 * @param {{ totalComments?: unknown, commenters?: unknown, commentsPerMinute?: unknown, heavyPct?: unknown, oncePct?: unknown }|null|undefined} preview
 * @returns {BroadcastScore}
 */
export function computeBroadcastScore(preview) {
  const p = preview && typeof preview === 'object' ? preview : {};
  const totalComments = num(p.totalComments);
  const volume = volumeScore(totalComments);
  const people = peopleScore(num(p.commenters));
  const pace = paceScore(num(p.commentsPerMinute));
  const heat = heatScore(num(p.heavyPct), num(p.oncePct), totalComments);
  const total = Math.round(Math.min(100, volume + people + pace + heat));
  return {
    total,
    rank: rankForScore(total),
    parts: {
      volume: Math.round(volume),
      people: Math.round(people),
      pace: Math.round(pace),
      heat: Math.round(heat)
    }
  };
}

/**
 * council/broadcast-scoring-SYNTHESIS.md §1.1 の「フェーズ実績」入力(bgmPhaseDiag の
 *   additive拡張フィールドのうち採点に使う3値)。BGMトグルON/OFFに関わらず値が入る
 *   (既存reachInCount等はBGM有効時しか動かないため採点には使えない・設計書の重要発見)。
 * @typedef {{
 *   reachCount?: unknown,
 *   breakthroughCount?: unknown,
 *   jackpotCount?: unknown
 * }} PhaseStatsForScore
 */

/**
 * @typedef {BroadcastScore & {
 *   base: number,
 *   bonus: number,
 *   bonusParts: { reach: number, breakthrough: number, jackpot: number }
 * }} BroadcastScoreV2
 */

/**
 * フェーズ実績(リーチ/突破/大当たり到達回数)から「感性ボーナス」(上限20点)を求める純関数。
 *   加点式(乗率式は却下・設計書§1.1): 基礎点の低い配信でボーナスが死なず、高い配信でも
 *   天井超えの丸めが要らない=決定論の検証がしやすい。
 * @param {PhaseStatsForScore|null|undefined} phaseStats
 * @returns {{ total: number, reach: number, breakthrough: number, jackpot: number }}
 */
function sensibilityBonus(phaseStats) {
  const ps = phaseStats && typeof phaseStats === 'object' ? phaseStats : {};
  const reachCount = Math.max(0, num(ps.reachCount));
  const breakthroughCount = Math.max(0, num(ps.breakthroughCount));
  const jackpotCount = Math.max(0, num(ps.jackpotCount));
  const reach = Math.min(6, reachCount * 2);
  const breakthrough = Math.min(6, breakthroughCount * 3);
  const jackpot = Math.min(8, jackpotCount * 4);
  return { total: Math.min(20, reach + breakthrough + jackpot), reach, breakthrough, jackpot };
}

/**
 * 配信採点モデルv2(council/broadcast-scoring-SYNTHESIS.md §1.1)。
 *   既存 computeBroadcastScore の0-100点を基礎点として0.8倍に再スケールし、
 *   フェーズ実績からの上限20点「感性ボーナス」を加点する。
 *   phaseStats が null(フェーズ観測なし=会場未使用等)なら bonus=0 で v1 と同傾向に縮退する。
 *   乱数ゼロ・全入力は既publish済みの決定論カウンタ(同じ入力には常に同じ結果)。
 * @param {Parameters<typeof computeBroadcastScore>[0]} preview
 * @param {PhaseStatsForScore|null|undefined} phaseStats
 * @returns {BroadcastScoreV2}
 */
export function computeBroadcastScoreV2(preview, phaseStats) {
  const v1 = computeBroadcastScore(preview);
  const bonusInfo = sensibilityBonus(phaseStats);
  const total = Math.round(Math.min(100, v1.total * 0.8 + bonusInfo.total));
  return {
    total,
    rank: rankForScore(total),
    base: v1.total,
    bonus: bonusInfo.total,
    parts: v1.parts,
    bonusParts: { reach: bonusInfo.reach, breakthrough: bonusInfo.breakthrough, jackpot: bonusInfo.jackpot }
  };
}
