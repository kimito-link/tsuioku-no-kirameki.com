// venueBusyCalm.js — コメントが速い間だけ、会場の「飾りの動き」を止めて軽くする(見た目の情報は残す)。
// @layer L0 — 純関数と CSS 文字列だけ(DOM・タイマー・通信なし)
//
// ■ なぜ要るか(2026-11-25 箱の実測・GPU 切り・8コメ/秒):
//   拡張を入れると Chromium 全体で約1.2コア使い、拡張なし(約0.1コア)より大きく重かった。
//   会場の飾りアニメ(席が話すたびの弾み・熱い人の弾み・連投の脈動・吹き出しのポップとフェード・案内役の光)は
//   1つずつは小さいが、コメントが速いと毎秒何十回も鳴り直し、そのたびに会場全体を描き直していた。
//   全部止めると拡張ぶんの CPU が約3割減った(GPU 側は約6割減)。
// ■ どう決めるか: 既にある「熱量」(直近のコメントの速さ・venueHeat.js)が「盛り上がり」以上の間だけ止める。
//   新しいタイマー・見張り・計測は足さない。設定も要らない(自動)。静かな配信では今までどおり動く。
// ■ 残すもの: 光の色・枠・順位バッジ・連投の光(脈動だけ止める)・吹き出しそのもの・入場とギフトの演出(まれで意味がある)。

/** 飾りの動きを止める熱量(heatLevelToLabel の「盛り上がり」の下端=約27件/分)。 */
export const VENUE_BUSY_CALM_HEAT = 0.45;

/**
 * 会場の飾りの動きを止める混み具合か。
 * @param {number} heatLevel 0..1(resolveVenueHeatLevel)
 * @returns {boolean}
 */
export function isVenueBusyForCalm(heatLevel) {
  const t = Number(heatLevel);
  return Number.isFinite(t) && t >= VENUE_BUSY_CALM_HEAT;
}

/**
 * stage に印を付け外しする(値が変わるときだけ DOM に書く)。熱量を書く既存の場所(venueBar.applyVenueHeat)から呼ぶ。
 * @param {{ hasAttribute: (n: string) => boolean, toggleAttribute: (n: string, f?: boolean) => boolean } | null | undefined} stage
 * @param {number} heatLevel
 */
export function applyVenueBusyCalm(stage, heatLevel) {
  if (!stage) return;
  const busy = isVenueBusyForCalm(heatLevel);
  if (busy !== stage.hasAttribute(VENUE_BUSY_CALM_ATTR)) stage.toggleAttribute(VENUE_BUSY_CALM_ATTR, busy);
}

/** stage に付ける印(付いている間だけ下の CSS が効く)。 */
export const VENUE_BUSY_CALM_ATTR = 'data-nls-busy';

/** 混んでいる間だけ効く CSS。reduced-motion と同じ考え方(動きだけ止め、色・形は残す)。 */
export const VENUE_BUSY_CALM_CSS = `
  .nlsb-stage[${VENUE_BUSY_CALM_ATTR}] .nlsb-seat .nl-story-userlane-avatar,
  .nlsb-stage[${VENUE_BUSY_CALM_ATTR}] .nl-story-userlane-cell,
  .nlsb-stage[${VENUE_BUSY_CALM_ATTR}] .nlsb-resident-img,
  .nlsb-stage[${VENUE_BUSY_CALM_ATTR}] .nlsb-bubble,
  .nlsb-stage[${VENUE_BUSY_CALM_ATTR}] .nlsb-bubble.nlsb-bubble-voiced,
  .nlsb-stage[${VENUE_BUSY_CALM_ATTR}] .nlsb-bubble.nlsb-bubble-previoice {
    animation: none !important;
    transition: none !important;
  }
`;
