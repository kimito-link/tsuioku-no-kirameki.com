/**
 * 公式「本家コメ」の件数から、いまの速さ(件/分)を出す(葉モジュール・依存ゼロ)。
 *
 * ■ なぜ補間しないか
 *   拡張には公式の実値が秒単位で届く。2 つの実測の差から出した速度だけを表示し、
 *   間を滑らかに埋める「補間カウンタ」は作らない(嘘の中間値になるため)。
 * ■ 規則
 *   ・値が変わったときだけ標本として採用(同値・逆行・時刻の逆戻りは捨てる)。
 *   ・最新の標本と、それより 20 秒以上前の標本のうち一番新しいものとの差から出す
 *     (忙しい配信では数秒ごとに標本が増えるため、直前の標本だけと比べると永久に出ない)。
 *   ・2 標本が 15 分を超えて離れている/最新の標本が 15 分より古いときは出さない
 *     (/live/ の RATE_MAX_GAP_MS と同値)。
 *   ・出せないときは null。表示側は「計測中」と書かず空にする(チップが狭い)。
 */

/** これ未満の 2 標本では出さない(秒単位のノイズ)。 */
export const RATE_MIN_SPAN_MS = 20_000;
/** 標本間・最新標本の古さの上限(15 分)。liveMotion.js:11 と同値。 */
export const RATE_MAX_GAP_MS = 15 * 60_000;
/** 保持する標本数の上限(メモリを際限なく使わない)。 */
const MAX_SAMPLES = 120;

export function createCommentRateTrack() {
  /** @type {Array<{ count: number, at: number }>} */
  let samples = [];

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
        if (at <= last.at) return false; // 時刻が戻った/同時刻
        if (c <= last.count) return false; // 同値(増えていない)・逆行
      }
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
      if (Number(nowMs) - last.at >= RATE_MAX_GAP_MS) return null;
      for (let i = samples.length - 2; i >= 0; i -= 1) {
        const span = last.at - samples[i].at;
        if (span > RATE_MAX_GAP_MS) return null;
        if (span >= RATE_MIN_SPAN_MS) return ((last.count - samples[i].count) / span) * 60_000;
      }
      return null;
    },

    reset() {
      samples = [];
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
