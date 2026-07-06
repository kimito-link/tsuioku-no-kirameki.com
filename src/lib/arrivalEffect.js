/**
 * arrivalEffect.js
 *
 * ニコ生「来場」システムメッセージ(parseArrivalComment.js でパース済み)を、パチンコの
 * 入賞演出(保留玉が入る)として飛ばすための純関数群。giftThrowProjectile.js /
 * effectDirector.js と同じ設計方針: 演出/音は既存部品を流用し、ここでは
 * 「どのラベルで・鳴らしてよいか」の決定論的な判定だけを持つ。
 *
 * 設計原則(ユーザー確定・最重要): 「無料アイテム/無料イベントを派手にすると有料ギフト演出の
 *   価値が下がる」。演出強度の序列は【来場 < gift_small < … < mega】の最下段に固定する。
 *   効果音は totalCount に関わらず常に hold_lamp のみ(昇格なし・音量も既定のまま)。
 *   人数の多さはラベル表記(buildArrivalLabel)だけで表現する。
 *
 * 乱数は使わない(絵文字はすべて固定・ラベルは totalCount からの決定論マッピング)。
 */

/** @typedef {import('./parseArrivalComment.js').ParsedArrivalComment} ParsedArrivalComment */

/** 来場演出専用のクールダウン(ms)。CD中の来場は演出をスキップしカウンタ計上のみ(積み増し禁止)。 */
export const ARRIVAL_EFFECT_CD_MS = 20_000;

/** 来場演出で使う絵文字(来場らしいもの)。 */
export const ARRIVAL_EMOJI = '🚪';

/**
 * 投げ物ラベルの最大文字数(giftThrowProjectile.js の clampLabel と同基準)。
 */
const LABEL_MAX = 14;

/** @param {unknown} s @param {number} [max] */
function clampLabel(s, max = LABEL_MAX) {
  const str = String(s || '').trim();
  const chars = Array.from(str);
  return chars.length <= max ? str : `${chars.slice(0, max).join('')}…`;
}

/**
 * パース済み来場イベントから投げ物ラベルを組む純関数。
 * 複数キーワードは先頭を代表に「XXX ほかN件」形式(N=残りのキーワード種類数)。
 * @param {ParsedArrivalComment} parsed
 * @returns {string}
 */
export function buildArrivalLabel(parsed) {
  const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
  if (entries.length === 0) return '来場';
  const first = clampLabel(entries[0].keyword);
  if (entries.length === 1) return first;
  return `${first} ほか${entries.length - 1}件`;
}

/**
 * 来場演出の効果音キー(常に固定)。
 *
 * 設計原則(ユーザー確定・最重要): 「無料アイテム/無料イベントを派手にすると有料ギフト演出の
 *   価値が下がる」。来場は無料イベントなので演出強度の序列は【来場 < gift_small < … < mega】
 *   の最下段に固定する。totalCount(来場人数)に関わらず常に hold_lamp(保留ランプ的な最も
 *   軽い音)のみを鳴らし、音量も既定のまま(昇格・音量調整は一切しない)。人数の多さは
 *   buildArrivalLabel の表記(「X ほかN件」)側だけで表現し、音では表現しない。
 * @param {unknown} _totalCount 未使用(将来の互換のため引数は残す・シグネチャは呼び出し側と同じ)
 * @returns {'hold_lamp'}
 */
export function arrivalSoundKindForCount(_totalCount) {
  return 'hold_lamp';
}

/**
 * 来場演出専用CD判定(純関数・テスト容易)。effectSoundPlayer.js の shouldPlayEffectSound と
 * 同じ形(lastAtMs/nowMs/guardMs)。CD中は演出を「捨てる」(待たせて後で鳴らす積み増しは禁止)。
 * @param {number} lastAtMs 直近に来場演出を発火した時刻(ms)。未発火は0。
 * @param {number} nowMs 現在時刻(ms)。
 * @param {number} [cdMs]
 * @returns {boolean} true=今回は発火してよい
 */
export function shouldFireArrivalEffect(lastAtMs, nowMs, cdMs = ARRIVAL_EFFECT_CD_MS) {
  const last = Number(lastAtMs) || 0;
  const now = Number(nowMs) || 0;
  return now - last >= cdMs;
}

/**
 * Phase Director(盛り上がりメーター)へ足す重み。コメント+1と同じ重みを来場人数ぶん
 * 加算する(実際に人が来た事実は許容=順位変動と違い禁止対象ではない)。上限5でクランプ。
 * @param {unknown} totalCount
 * @param {number} [perHead] 一人あたりの重み(既定はコメントと同じ1)
 * @param {number} [cap] 一回あたりの上限(既定5)
 * @returns {number}
 */
export function arrivalMeterWeight(totalCount, perHead = 1, cap = 5) {
  const n = Number(totalCount) || 0;
  if (n <= 0) return 0;
  return Math.min(cap, n * perHead);
}
