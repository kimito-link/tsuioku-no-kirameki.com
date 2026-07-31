/**
 * avCue.js — 「AVCue = 音の再生結果を真実とする単一発火点」の純関数群(V1・DOM/storage/音に触れない)。
 *
 * 設計(council/pachinko-av-max-SYNTHESIS.md §2): 「音だけ鳴っている」の真因は視覚の不在であり、
 *   新しいキュー機構/新しいスケジューラは作らない。既存の playEffectSound の戻り値が 'played' の
 *   ときだけ、同一同期タスク内で本ファイルの固定対応表(音キー→視覚キー)を引いて視覚を発火する。
 *   これにより 600ms ガード・ボイスゲート・バースト置換昇格の歯止めが視覚にそのまま継承される
 *   (§2.1)。対応表・オフセットは全て固定値(乱数ゼロ=決定論)。
 */

/**
 * 音キー→視覚キーの固定対応表(§2.3・単一の真実)。値 ''=視覚を発火しない(意図的な無し)。
 * ここに載っていないキーは visualForAudioKind が '' を返す(未知キー=安全側の無音視覚)。
 * @type {Readonly<Record<string, string>>}
 */
export const VISUAL_FOR_AUDIO_KIND = Object.freeze({
  gift_small: 'flash_t1',
  gift_medium: 'flash_t2',
  gift_large: 'flash_t3',
  gift_mega: 'flash_t4',
  ad: 'flash_t2',
  milestone_soft: 'lamp_pulse',
  milestone_hard: 'cutin_aori',
  milestone_jackpot: 'logo_jackpot',
  reach: 'cutin_reach',
  breakthrough: 'cutin_break',
  voice_chance: 'cutin_chance',
  voice_atsui: 'cutin_atsui',
  voice_breakthrough: '', // 直前+300msのbreakthrough帯が出ている最中のため重ねない(§2.3)
  voice_kamitsumi: 'combo_counter',
  voice_jackpot: 'logo_jackpot',
  voice_max: 'logo_max',
  voice_stage: '', // フィーバー雰気はフェーズ側tintが担当(§2.3)
  payout: 'coin_rain',
  hold_lamp: 'lamp_pulse',
  rank_up: '', // 意図的に無し(順位変動に演出を寄せない既決・§7)
  rank_down: ''
});

/**
 * 音キーから対応する視覚キーを引く純関数。未知キー・対応表で''指定のキーは共に ''(視覚なし)。
 * @param {string|undefined|null} kind
 * @returns {string}
 */
export function visualForAudioKind(kind) {
  const key = String(kind || '');
  const v = VISUAL_FOR_AUDIO_KIND[key];
  return typeof v === 'string' ? v : '';
}

/**
 * ギフト着弾比(§2.2)。既存 nlsb-gift-fly keyframe のバースト点(72%地点)と一致させる固定値。
 *   飛翔時間(durationMs)にこの比を掛けた時刻に、音なしの視覚エコー(着弾リップル)を1本予約する。
 */
export const GIFT_LANDING_RATIO = 0.72;

/**
 * ギフト投擲の飛翔時間(ms)から、着弾リップルを発火すべき遅延(ms)を求める純関数(決定論)。
 * @param {number} durationMs GIFT_THROW_DURATION_MS のいずれか(small/medium/large/mega)
 * @returns {number}
 */
export function planGiftLandingCueDelayMs(durationMs) {
  const ms = Number(durationMs) || 0;
  return Math.round(ms * GIFT_LANDING_RATIO);
}

/** 視覚強度レベルの既定値(§3.1・配信視聴の邪魔をしない側に倒す)。 */
export const DEFAULT_EFFECT_VISUAL_LEVEL = 'soft';

/** 視覚強度レベルの許容値集合。 */
const VISUAL_LEVELS = Object.freeze(['off', 'soft', 'max']);

/**
 * storage から読んだ生値を強度レベル(既定'soft')へ正規化する純関数。不正値は既定に落とす。
 * @param {unknown} stored
 * @returns {'off'|'soft'|'max'}
 */
export function visualLevelFor(stored) {
  const s = String(stored || '');
  return VISUAL_LEVELS.includes(s) ? /** @type {'off'|'soft'|'max'} */ (s) : DEFAULT_EFFECT_VISUAL_LEVEL;
}
