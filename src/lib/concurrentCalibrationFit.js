/**
 * 較正フィット（蓄積した較正サンプルから係数の「推奨値」を導く純関数）。
 *
 * 同接推定のシグナル式（src/lib/concurrentEstimate.js）:
 *   signalA = activeCommenters × multiplier
 *   signalB = totalVisitors × retentionRate(age)
 *   signalC = (totalVisitors / streamAgeMin) × avgSessionMin           … リトルの法則
 *   signalD = commentsPerMin / perPersonCommentsPerMin                  … チャット密度
 *
 * 参照値 R の取り方:
 *   ・公式同接(officialConcurrent)があるサンプル（YouTube/Twitch 等・Phase 3c）→ R = 公式（真値）。
 *   ・無いサンプル（ニコ生）→ R = geomean(signalA, signalB)（現行で最も信頼している複合値）を擬似真値に。
 *
 * 各係数は R から逆算:
 *   avgSessionMin            = R / (totalVisitors / streamAgeMin)
 *   perPersonCommentsPerMin  = commentsPerMin / R
 *   multiplierScale          = R / signalA           （signalA の倍率の補正係数）
 *
 * サンプル横断で中央値を取り、健全域へ clamp して「推奨値」とする。
 * 重要: この関数は推奨値を計算するだけで、PlatformProfile を自動では書き換えない
 *   （疎/偏ったデータで本番推定を劣化させないため。適用は人の確認を挟む）。
 */

import { NICONICO_PROFILE } from './concurrentEstimate.js';
import { parseCalibrationLog } from './concurrentCalibrationLog.js';

/** 真値（公式同接）フィットに必要な最小サンプル数。 */
export const CALIBRATION_FIT_MIN_TRUTH_SAMPLES = 30;
/** 真値が無いクロスシグナル・フィットに必要な最小サンプル数（真値が無い分多めに要求）。 */
export const CALIBRATION_FIT_MIN_CROSS_SAMPLES = 60;

const AVG_SESSION_MIN_RANGE = Object.freeze({ min: 1, max: 240 });
const PER_PERSON_RANGE = Object.freeze({ min: 0.02, max: 5 });
const MULTIPLIER_SCALE_RANGE = Object.freeze({ min: 0.3, max: 3 });

/** @param {unknown} parsedOrItems @returns {import('./concurrentCalibrationLog.js').CalibrationSample[]} */
function extractItems(parsedOrItems) {
  if (Array.isArray(parsedOrItems)) return parseCalibrationLog({ items: parsedOrItems }).items;
  if (parsedOrItems && typeof parsedOrItems === 'object' && Array.isArray(/** @type {any} */ (parsedOrItems).items)) {
    return parseCalibrationLog(parsedOrItems).items;
  }
  return parseCalibrationLog(parsedOrItems).items;
}

/** @param {number[]} nums @returns {number|null} */
function median(nums) {
  const xs = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 1 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/** @param {number} v @param {{min:number,max:number}} r */
function clampRange(v, r) {
  return Math.min(r.max, Math.max(r.min, v));
}

/** @param {number} v @param {number} digits */
function round(v, digits) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** @param {number} a @param {number} b */
function geomean2(a, b) {
  return Math.sqrt(a * b);
}

/**
 * 1 サンプルの「正の有効シグナル」のばらつき（(max-min)/median × 100[%]）。
 * 低いほど A/B/C/D が一致している（推定の信頼度が高い）。
 * @param {import('./concurrentCalibrationLog.js').CalibrationSample} s
 * @returns {number|null}
 */
function sampleSignalDispersionPct(s) {
  const sig = [s.signalA, s.signalB, s.signalC, s.signalD].filter(
    (x) => typeof x === 'number' && Number.isFinite(x) && x > 0
  );
  if (sig.length < 2) return null;
  const min = Math.min(...sig);
  const max = Math.max(...sig);
  const med = median(sig);
  if (med == null || med <= 0) return null;
  return ((max - min) / med) * 100;
}

/**
 * @typedef {{
 *   platform: string,
 *   sampleCount: number,
 *   withTruthCount: number,
 *   crossUsableCount: number,
 *   basis: 'official'|'cross-signal'|'insufficient',
 *   ready: boolean,
 *   current: { avgSessionMin: number, perPersonCommentsPerMin: number },
 *   suggested: {
 *     avgSessionMin: number|null,
 *     perPersonCommentsPerMin: number|null,
 *     multiplierScale: number|null
 *   },
 *   quality: {
 *     medianAbsBlendErrorPct: number|null,
 *     medianSignalDispersionPct: number|null
 *   },
 *   notes: string[]
 * }} CalibrationFitReport
 */

/**
 * @param {unknown} parsedOrItems  KEY_CONCURRENT_CALIBRATION_RING_V1 の中身 or items 配列
 * @param {{
 *   platform?: string,
 *   currentAvgSessionMin?: number,
 *   currentPerPersonCommentsPerMin?: number
 * }} [opts]
 * @returns {CalibrationFitReport}
 */
export function computeCalibrationFit(parsedOrItems, opts = {}) {
  const platform = String(opts.platform || 'niconico').toLowerCase();
  const all = extractItems(parsedOrItems).filter((s) => s.platform === platform);

  const currentAvgSessionMin =
    typeof opts.currentAvgSessionMin === 'number' && opts.currentAvgSessionMin > 0
      ? opts.currentAvgSessionMin
      : NICONICO_PROFILE.session?.avgSessionMin ?? 15;
  const currentPerPerson =
    typeof opts.currentPerPersonCommentsPerMin === 'number' &&
    opts.currentPerPersonCommentsPerMin > 0
      ? opts.currentPerPersonCommentsPerMin
      : NICONICO_PROFILE.chatDensity?.perPersonCommentsPerMin ?? 0.2;

  /** R（参照値）を 1 サンプルから求める。真値優先、無ければ geomean(A,B)。 */
  const referenceOf = (/** @type {any} */ s) => {
    const official =
      typeof s.officialConcurrent === 'number' && s.officialConcurrent > 0
        ? s.officialConcurrent
        : null;
    if (official != null) return { r: official, truth: true };
    const a = typeof s.signalA === 'number' && s.signalA > 0 ? s.signalA : null;
    const b = typeof s.signalB === 'number' && s.signalB > 0 ? s.signalB : null;
    if (a != null && b != null) return { r: geomean2(a, b), truth: false };
    return { r: null, truth: false };
  };

  let withTruthCount = 0;
  let crossUsableCount = 0;
  /** @type {number[]} */ const dispersions = [];
  for (const s of all) {
    const ref = referenceOf(s);
    if (ref.r == null) continue;
    if (ref.truth) withTruthCount += 1;
    else crossUsableCount += 1;
    const d = sampleSignalDispersionPct(s);
    if (d != null) dispersions.push(d);
  }

  /** @type {'official'|'cross-signal'|'insufficient'} */
  let basis = 'insufficient';
  if (withTruthCount >= CALIBRATION_FIT_MIN_TRUTH_SAMPLES) basis = 'official';
  else if (crossUsableCount >= CALIBRATION_FIT_MIN_CROSS_SAMPLES) basis = 'cross-signal';

  // フィット対象プールを basis に合わせて選ぶ（真値があるなら真値だけを使う＝金本位）。
  const useTruthOnly = basis === 'official';

  /** @type {number[]} */ const impliedAvgSession = [];
  /** @type {number[]} */ const impliedPerPerson = [];
  /** @type {number[]} */ const impliedMultScale = [];
  /** @type {number[]} */ const absBlendErr = [];

  for (const s of all) {
    const ref = referenceOf(s);
    if (ref.r == null) continue;
    if (useTruthOnly && !ref.truth) continue;
    if (!useTruthOnly && ref.truth) continue; // cross モードでは真値混入を避ける
    const R = ref.r;

    // avgSessionMin = R / visitorsPerMin（vpm = totalVisitors / streamAgeMin）
    if (
      typeof s.totalVisitors === 'number' &&
      s.totalVisitors > 0 &&
      typeof s.streamAgeMin === 'number' &&
      s.streamAgeMin > 0
    ) {
      const vpm = s.totalVisitors / s.streamAgeMin;
      if (vpm > 0) impliedAvgSession.push(R / vpm);
    }
    // perPersonCommentsPerMin = commentsPerMin / R
    if (typeof s.commentsPerMin === 'number' && s.commentsPerMin > 0) {
      impliedPerPerson.push(s.commentsPerMin / R);
    }
    // multiplierScale = R / signalA
    if (typeof s.signalA === 'number' && s.signalA > 0) {
      impliedMultScale.push(R / s.signalA);
    }
    // 真値があるサンプルのみ blend 誤差を測れる
    if (
      ref.truth &&
      typeof s.blended === 'number' &&
      s.blended > 0
    ) {
      absBlendErr.push(Math.abs((s.blended - R) / R) * 100);
    }
  }

  const medAvgSession = median(impliedAvgSession);
  const medPerPerson = median(impliedPerPerson);
  const medMultScale = median(impliedMultScale);

  /** @type {string[]} */
  const notes = [];
  if (basis === 'insufficient') {
    notes.push(
      `サンプル不足です（真値付き ${withTruthCount}/${CALIBRATION_FIT_MIN_TRUTH_SAMPLES}、` +
        `クロスシグナル ${crossUsableCount}/${CALIBRATION_FIT_MIN_CROSS_SAMPLES}）。もう少し貯めてください。`
    );
  } else if (basis === 'official') {
    notes.push(`公式同接の真値 ${withTruthCount} 件でフィットしました（最も信頼できる較正）。`);
  } else {
    notes.push(
      `公式同接が無いため、複合値 geomean(A,B) を擬似真値に ${crossUsableCount} 件でフィットしました（自己整合の改善）。`
    );
  }
  notes.push('推奨値はあくまで目安です。PlatformProfile への自動適用はしません（人の確認後に反映）。');

  const ready = basis !== 'insufficient';

  return {
    platform,
    sampleCount: all.length,
    withTruthCount,
    crossUsableCount,
    basis,
    ready,
    current: {
      avgSessionMin: round(currentAvgSessionMin, 2),
      perPersonCommentsPerMin: round(currentPerPerson, 3)
    },
    suggested: {
      avgSessionMin:
        ready && medAvgSession != null
          ? round(clampRange(medAvgSession, AVG_SESSION_MIN_RANGE), 1)
          : null,
      perPersonCommentsPerMin:
        ready && medPerPerson != null
          ? round(clampRange(medPerPerson, PER_PERSON_RANGE), 3)
          : null,
      multiplierScale:
        ready && medMultScale != null
          ? round(clampRange(medMultScale, MULTIPLIER_SCALE_RANGE), 2)
          : null
    },
    quality: {
      medianAbsBlendErrorPct:
        absBlendErr.length ? round(/** @type {number} */ (median(absBlendErr)), 1) : null,
      medianSignalDispersionPct:
        dispersions.length ? round(/** @type {number} */ (median(dispersions)), 1) : null
    },
    notes
  };
}
