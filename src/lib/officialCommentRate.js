/**
 * 公式「本家コメ」の件数から、いまの速さ(件/分)を出す(葉モジュール・依存ゼロ)。
 *
 * ■ なぜ補間しないか
 *   拡張には公式の実値が秒単位で届く。2 つの実測の差から出した速度だけを表示し、
 *   間を滑らかに埋める「補間カウンタ」は作らない(嘘の中間値になるため)。
 * ■ 規則
 *   ・値が増えたときだけ標本として採用(同値・逆行・時刻の逆戻りは捨てる)。
 *     ★ただし逆行が3回続いたら基準を取り直す(過大値1回で固着しない・v0.1.1573)。
 *   ・最新の標本と、それより 20 秒以上前の標本のうち一番新しいものとの差から出す
 *     (忙しい配信では数秒ごとに標本が増えるため、直前の標本だけと比べると永久に出ない)。
 *   ・2 標本が 15 分を超えて離れている/最新の標本が 2 分(RATE_STALE_MS)より古いときは出さない
 *     (/live/ の RATE_MAX_GAP_MS と同値)。
 *   ・出せないときは null。表示側は「計測中」と書かず空にする(チップが狭い)。
 */

/** これ未満の 2 標本では出さない(秒単位のノイズ)。 */
export const RATE_MIN_SPAN_MS = 20_000;
/** 標本間・最新標本の古さの上限(15 分)。liveMotion.js:11 と同値。 */
export const RATE_MAX_GAP_MS = 15 * 60_000;
/**
 * 最新の標本がこれより古ければ出さない(2分)。静かになった配信で、直前の速さを15分まで出し続けない
 * (コメントが数秒おきに来ている間は標本が更新され続けるので消えない)。v0.1.1577。
 */
export const RATE_STALE_MS = 2 * 60_000;
/** 保持する標本数の上限(メモリを際限なく使わない)。 */
const MAX_SAMPLES = 120;
/** 逆行がこの回数続いたら基準を取り直す。 */
const REGRESS_RESET_STREAK = 3;

export function createCommentRateTrack() {
  /** @type {Array<{ count: number, at: number }>} */
  let samples = [];
  /** 逆行(最新標本より小さい値)の連続回数。増えた/同値で 0 に戻る。 */
  let regressStreak = 0;

  return {
    /**
     * @param {number} count 公式のコメント累計
     * @param {number} atMs 観測時刻(epoch ms)
     * @returns {boolean} 標本として採用したか
     */
    push(count, atMs) {
      const c = Number(count);
      const at = Number(atMs);
      if (!Number.isFinite(c) || !Number.isFinite(at) || at <= 0) return false;
      const last = samples[samples.length - 1];
      if (last) {
        if (at <= last.at) return false; // 時刻が戻った/同時刻(逆行として数えない)
        if (c === last.count) {
          regressStreak = 0; // 同値=逆行の連続は切れる(採用もしない)
          return false;
        }
        if (c < last.count) {
          // 逆行。1〜2回は揺れとして捨てるが、3回続いたら「基準が過大だった/値源が切り替わった」とみなし、
          //   基準を取り直す(取り直さないと過大値1回で、以後の正しい値を全部捨てて最長15分固着する)。
          regressStreak += 1;
          if (regressStreak < REGRESS_RESET_STREAK) return false;
          regressStreak = 0;
          samples = [{ count: c, at }]; // 古い(過大な)速度を残さない=標本1つ=次の20秒後まで出さない
          return true;
        }
      }
      regressStreak = 0;
      samples.push({ count: c, at });
      if (samples.length > MAX_SAMPLES) samples = samples.slice(samples.length - MAX_SAMPLES);
      return true;
    },

    /**
     * @param {number} nowMs
     * @returns {number|null} 件/分。出せなければ null
     */
    ratePerMin(nowMs) {
      const last = samples[samples.length - 1];
      if (!last || samples.length < 2) return null;
      if (Number(nowMs) - last.at >= RATE_STALE_MS) return null;
      for (let i = samples.length - 2; i >= 0; i -= 1) {
        const span = last.at - samples[i].at;
        if (span > RATE_MAX_GAP_MS) return null;
        if (span >= RATE_MIN_SPAN_MS) return ((last.count - samples[i].count) / span) * 60_000;
      }
      return null;
    },

    reset() {
      samples = [];
      regressStreak = 0;
    }
  };
}

/**
 * 「+66/分」。null・0 以下・非数は空文字(嘘の 0 を書かない)。1 未満は小数 1 桁。
 * @param {number|null|undefined} rate
 */
export function formatCommentRate(rate) {
  const r = Number(rate);
  if (rate == null || !Number.isFinite(r) || r <= 0) return '';
  if (r < 1) return `+${(Math.round(r * 10) / 10).toFixed(1)}/分`;
  return `+${Math.round(r).toLocaleString('ja-JP')}/分`;
}
