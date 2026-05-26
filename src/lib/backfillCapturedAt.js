/**
 * v0.1.405: バックフィルした過去コメントの「実時刻 capturedAt」を推定する純関数。
 *
 * なぜ必要か（会議で特定した地雷4「保存順 ≠ 時系列」）:
 *   通常の取り込み経路は capturedAt = Date.now()（＝取り込んだ時刻）を入れる。
 *   ところが backfill は「過去のコメント」を今になって取り込むので、Date.now() を
 *   入れると全部が「今」になり、表示を時系列ソートすると過去ログが最新位置に化ける。
 *   そこで、コメントが実際に流れた時刻に近い値を capturedAt に入れる。
 *
 * 算出の優先:
 *   1) programStartMs（配信開始の Unix ミリ秒）+ vpos。
 *      niconico の vpos は「配信開始からの経過センチ秒（1/100 秒）」なので、
 *      実時刻 ≒ programStartMs + vpos * 10[ms]。これが最も正確。
 *   2) programStartMs が無い場合は、その segment を取得したときの巡回 at（Unix 秒）を
 *      ミリ秒化した粗い値。segment 単位の時刻なので分解能は粗いが、Date.now() より
 *      遥かにマシ（過去は過去の位置に並ぶ）。
 *   3) どちらも無い場合は null（呼び出し側が Date.now() フォールバックに委ねる）。
 *
 * 副作用なし・例外を投げない（不正入力は null）。
 *
 * @module backfillCapturedAt
 */

/** vpos の単位（センチ秒）をミリ秒へ。 */
const VPOS_CENTISECONDS_TO_MS = 10;

/**
 * @param {object} args
 * @param {number|null|undefined} [args.vpos] NDGR chat の vpos（配信開始からのセンチ秒）。
 * @param {number|null|undefined} [args.programStartMs] 配信開始の Unix ミリ秒。
 * @param {number|null|undefined} [args.segmentAtSec] その segment を取得した巡回 at（Unix 秒）。
 * @returns {number|null} 推定 capturedAt（Unix ミリ秒）。算出不能なら null。
 */
export function deriveBackfillCapturedAt({ vpos, programStartMs, segmentAtSec } = {}) {
  const start = toFiniteNumber(programStartMs);
  const v = toFiniteNumber(vpos);
  if (start != null && start > 0 && v != null && v >= 0) {
    return Math.round(start + v * VPOS_CENTISECONDS_TO_MS);
  }
  const atSec = toFiniteNumber(segmentAtSec);
  if (atSec != null && atSec > 0) {
    // 秒 → ミリ秒。NDGR の at は Unix 秒なので 1000 倍。
    return Math.round(atSec * 1000);
  }
  return null;
}

/** @param {unknown} x @returns {number|null} */
function toFiniteNumber(x) {
  if (x == null) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
