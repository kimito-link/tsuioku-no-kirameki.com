/**
 * ギフト貢献／応援ストリップに並べる行の上限。
 *
 * 公式ニコ生ランキングは 1-10 位が正本（plan_v0250_button_triggered_scrape）。
 * 11 位以降のノイズで縦が膨らむのを防ぎ、公式表示と並びを揃えるため **10** に統一
 * （v0.1.304: 応援 11 / ギフト履歴 12 直書き → 両方 10 に一極集約）。
 */
export const GIFT_RANK_STRIP_MAX = 10;

/** ギフト履歴レーン（北極星 lane 2）のユーザー別カード上限。公式 1-10 位正本に整合。 */
export const GIFT_HISTORY_LANE_MAX = 10;
