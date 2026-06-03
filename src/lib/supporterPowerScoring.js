/**
 * 応援者パワー診断スコアリング（OSINT Phase 2-A・v0.1.609）。
 *
 * 設計の正本は `docs/codex-supporter-power-scoring-design-v0607.md`
 *（Codex 設計レポート、556 行）。本ファイルは Phase 2-A として **pure function 群**
 * のみを実装する。副作用なし・chrome 依存なし・既存 commenterFollowAnalytics には
 * 接続しない（Phase 2-B 以降で `includeSupporterPower: true` opt-in で接続予定）。
 *
 * スコアリング:
 *   supporterScore = round(0.45 * engagement + 0.35 * loyalty + 0.20 * influence)
 *
 * 正規化: log1p + p95 cap で線形回避（極端値が支配しない）。
 * Tier: score × percentile の hybrid 判定、サンプル 20 名未満は score-only fallback。
 *
 * 関連:
 * - reference_osint_strategy_socialxup_chikuran.md（OSINT 戦略全体）
 * - reference_phase2_supporter_power_scoring_request.md（依頼書）
 * - docs/codex-supporter-power-scoring-design-v0607.md（設計正本）
 */

/**
 * @typedef {{
 *   userId: string,
 *   nickname?: string,
 *   commentCount: number,
 *   giftTotalPoints?: number,
 *   loyaltyCount?: number,
 *   followerCount?: number,
 *   followeeCount?: number,
 *   isPremium?: boolean,
 *   userLevel?: number
 * }} SupporterInput
 */

/**
 * @typedef {'S'|'A'|'B'|'C'|'D'|'E'} SupporterTier
 */

/**
 * @typedef {{
 *   score: number,
 *   tier: SupporterTier,
 *   components: {
 *     engagement: number,
 *     loyalty: number,
 *     influence: number
 *   },
 *   percentile: number,
 *   coverage: {
 *     hasGiftData: boolean,
 *     influenceFieldsAvailable: number
 *   }
 * }} SupporterPower
 */

/**
 * @typedef {{
 *   sampleSize: number,
 *   hasGiftData: boolean,
 *   loyaltyWindowSize: number,
 *   availableLiveCount: number,
 *   commentCap: number,
 *   giftCap: number,
 *   followerCap: number,
 *   followeeCap: number,
 *   levelCap: number,
 *   influenceMedian: number|null,
 *   tierMode: 'normal'|'smallSample'|'verySmall',
 *   allowS: boolean
 * }} SupporterPowerScoringContext
 */

/* -------------------------------------------------------------------------- */
/* 純粋ユーティリティ                                                          */
/* -------------------------------------------------------------------------- */

/**
 * 0 以上の有限数のみ受理。それ以外は null。
 *
 * v0.1.609: Number(null) === 0 になる罠を避けるため、null/undefined/空文字は明示的に弾く。
 * これにより「欠損(undefined)」と「実測 0(値として 0 が与えられた)」を区別できる。
 *
 * @param {unknown} v
 * @returns {number|null}
 */
export function asNonNegativeNumber(v) {
  if (v == null) return null; // null と undefined 両方
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * clamp(0, max) で round しない。
 * @param {number} v
 * @param {number} min
 * @param {number} max
 */
export function clampNumber(v, min, max) {
  if (!Number.isFinite(v)) return min;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

/**
 * 対数正規化。`logNorm(value, cap)` は value→100 * log1p(value) / log1p(max(1, cap))。
 * 範囲は [0, 100] にクランプ。cap が 0 以下なら 0 を返す。
 *
 * @param {number|null|undefined} value
 * @param {number|null|undefined} cap
 * @returns {number}
 */
export function logNorm(value, cap) {
  const v = asNonNegativeNumber(value);
  const c = asNonNegativeNumber(cap);
  if (v == null) return 0;
  if (c == null || c <= 0) return 0;
  const denom = Math.log1p(Math.max(1, c));
  if (denom <= 0) return 0;
  const x = (100 * Math.log1p(v)) / denom;
  return clampNumber(x, 0, 100);
}

/**
 * 配列の percentile を返す（線形補間・p \in [0, 100]）。
 * 空配列は 0 を返す。NaN/Infinity は除外。
 * @param {readonly number[]} values
 * @param {number} p 0-100
 * @returns {number}
 */
export function percentileOf(values, p) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const xs = values.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (xs.length === 0) return 0;
  const pp = clampNumber(p, 0, 100);
  if (xs.length === 1) return xs[0];
  const rank = (pp / 100) * (xs.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return xs[lo];
  const frac = rank - lo;
  return xs[lo] * (1 - frac) + xs[hi] * frac;
}

/**
 * 配列の median（p50 と同等）。
 * @param {readonly number[]} values
 */
export function medianOf(values) {
  return percentileOf(values, 50);
}

/**
 * 利用可能な sub-field の重みだけで加重平均を取る。すべて欠損ならば null を返す。
 *
 * 使い方: { followerScore: 0.60, levelScore: 0.20, ... } のようにキー＝値、重みは別マップ。
 * fields の値は number|null|undefined のいずれかで、null/undefined は欠損として除外。
 *
 * @param {Record<string, number|null|undefined>} fields
 * @param {Record<string, number>} weights
 * @returns {number|null}
 */
export function weightedAverageAvailable(fields, weights) {
  if (!fields || !weights) return null;
  let sum = 0;
  let wTotal = 0;
  for (const key of Object.keys(weights)) {
    const w = Number(weights[key]);
    if (!Number.isFinite(w) || w <= 0) continue;
    const raw = fields[key];
    if (raw == null) continue;
    const v = Number(raw);
    if (!Number.isFinite(v)) continue;
    sum += v * w;
    wTotal += w;
  }
  if (wTotal <= 0) return null;
  return sum / wTotal;
}

/* -------------------------------------------------------------------------- */
/* コンテキスト構築                                                            */
/* -------------------------------------------------------------------------- */

/**
 * SupporterInput[] からスコアリングコンテキスト（cap、median 等）を構築する。
 *
 * @param {readonly SupporterInput[]} inputs
 * @param {{
 *   loyaltyWindowSize?: number,
 *   availableLiveCount?: number
 * }} [opts]
 * @returns {SupporterPowerScoringContext}
 */
export function buildSupporterPowerScoringContext(inputs, opts = {}) {
  const rows = Array.isArray(inputs) ? inputs : [];
  const sampleSize = rows.length;
  const loyaltyWindowSize =
    Number.isFinite(Number(opts.loyaltyWindowSize)) && Number(opts.loyaltyWindowSize) > 0
      ? Math.floor(Number(opts.loyaltyWindowSize))
      : 30;
  const availableLiveCount =
    Number.isFinite(Number(opts.availableLiveCount)) && Number(opts.availableLiveCount) > 0
      ? Math.floor(Number(opts.availableLiveCount))
      : loyaltyWindowSize;

  // ギフト集計の有無: いずれかに正の値があれば「ギフト集計あり」
  const giftValues = [];
  let hasGiftData = false;
  for (const r of rows) {
    const v = asNonNegativeNumber(r?.giftTotalPoints);
    if (v != null && v > 0) hasGiftData = true;
    if (v != null) giftValues.push(v);
  }
  // 「集計あり」だが全員 0 のケースは hasGiftData = false（engagement 全員 comment 100%）

  const commentValues = rows
    .map((r) => asNonNegativeNumber(r?.commentCount))
    .filter((v) => v != null);
  const followerValues = rows
    .map((r) => asNonNegativeNumber(r?.followerCount))
    .filter((v) => v != null);
  const followeeValues = rows
    .map((r) => asNonNegativeNumber(r?.followeeCount))
    .filter((v) => v != null);
  const levelValues = rows
    .map((r) => asNonNegativeNumber(r?.userLevel))
    .filter((v) => v != null);

  // cap 決定: 20 名以上で p95、未満で p90、ギフトは positive p95、20 未満で positive max
  const useP90 = sampleSize < 20;
  const commentCap = Math.max(
    1,
    useP90 ? percentileOf(/** @type {number[]} */ (commentValues), 90)
           : percentileOf(/** @type {number[]} */ (commentValues), 95)
  );
  // gift cap: 正の値だけで cap
  const positiveGifts = /** @type {number[]} */ (giftValues.filter((v) => v > 0));
  const giftCap = positiveGifts.length === 0
    ? 1
    : sampleSize < 20
      ? Math.max(...positiveGifts)
      : percentileOf(positiveGifts, 95);

  const followerCap = Math.max(
    10,
    percentileOf(/** @type {number[]} */ (followerValues), 95)
  );
  const followeeCap = Math.max(
    50,
    percentileOf(/** @type {number[]} */ (followeeValues), 95)
  );
  const levelCapRaw = percentileOf(/** @type {number[]} */ (levelValues), 95);
  const levelCap = Math.max(50, levelCapRaw);

  // tierMode: 20 名以上 normal、5-19 名 smallSample、5 名未満 verySmall（S 禁止）
  /** @type {'normal'|'smallSample'|'verySmall'} */
  let tierMode;
  let allowS;
  if (sampleSize >= 20) {
    tierMode = 'normal';
    allowS = true;
  } else if (sampleSize >= 5) {
    tierMode = 'smallSample';
    allowS = true;
  } else {
    tierMode = 'verySmall';
    allowS = false;
  }

  return {
    sampleSize,
    hasGiftData,
    loyaltyWindowSize,
    availableLiveCount,
    commentCap,
    giftCap,
    followerCap,
    followeeCap,
    levelCap,
    influenceMedian: null, // 後で influence を計算してから埋める（computeAllSupporterPowers で）
    tierMode,
    allowS
  };
}

/* -------------------------------------------------------------------------- */
/* コンポーネント計算                                                          */
/* -------------------------------------------------------------------------- */

/**
 * engagement = 0.70 * commentScore + 0.30 * giftScore（ギフト集計ありの場合）
 *            = commentScore（ギフト集計なしの場合）
 *
 * 範囲: [0, 100]
 *
 * @param {SupporterInput} input
 * @param {SupporterPowerScoringContext} ctx
 * @returns {number}
 */
export function computeEngagementScore(input, ctx) {
  const commentScore = logNorm(input?.commentCount, ctx.commentCap);
  if (!ctx.hasGiftData) return clampNumber(commentScore, 0, 100);
  const giftScore = logNorm(input?.giftTotalPoints, ctx.giftCap);
  return clampNumber(0.7 * commentScore + 0.3 * giftScore, 0, 100);
}

/**
 * loyalty = 100 * sqrt(clamp(loyaltyCount / effectiveN, 0, 1))
 *   effectiveN = min(N, max(1, availableLiveCount))
 *
 * loyaltyCount が undefined のときは 1 として扱う（当該配信に出現＝最低 1 回観測の前提）。
 *
 * @param {SupporterInput} input
 * @param {SupporterPowerScoringContext} ctx
 * @returns {number}
 */
export function computeLoyaltyScore(input, ctx) {
  const raw =
    input?.loyaltyCount == null
      ? 1
      : asNonNegativeNumber(input.loyaltyCount);
  const lc = raw == null ? 1 : raw;
  const effectiveN = Math.min(
    ctx.loyaltyWindowSize,
    Math.max(1, ctx.availableLiveCount)
  );
  const ratio = clampNumber(lc / effectiveN, 0, 1);
  return clampNumber(100 * Math.sqrt(ratio), 0, 100);
}

/**
 * influence の sub-field 計算結果を返す。すべて欠損なら null。
 *
 * @param {SupporterInput} input
 * @param {SupporterPowerScoringContext} ctx
 * @returns {{ value: number|null, availableFields: number }}
 */
export function computeInfluenceScore(input, ctx) {
  const followerVal = asNonNegativeNumber(input?.followerCount);
  const followeeVal = asNonNegativeNumber(input?.followeeCount);
  const levelVal = asNonNegativeNumber(input?.userLevel);
  // isPremium: true/false が明示的に与えられた時だけ scoring 対象、undefined は欠損
  const premiumKnown = typeof input?.isPremium === 'boolean';

  const followerScore = followerVal == null ? null : logNorm(followerVal, ctx.followerCap);
  const followeeScore = followeeVal == null ? null : logNorm(followeeVal, ctx.followeeCap);
  const levelScore =
    levelVal == null ? null : clampNumber((100 * levelVal) / Math.max(1, ctx.levelCap), 0, 100);
  const premiumScore = premiumKnown ? (input.isPremium ? 100 : 0) : null;

  const fields = {
    followerScore,
    levelScore,
    followeeScore,
    premiumScore
  };
  const weights = {
    followerScore: 0.6,
    levelScore: 0.2,
    followeeScore: 0.1,
    premiumScore: 0.1
  };
  let availableFields = 0;
  for (const k of Object.keys(fields)) {
    if (fields[/** @type {keyof typeof fields} */ (k)] != null) availableFields += 1;
  }
  const value = weightedAverageAvailable(fields, weights);
  return { value: value == null ? null : clampNumber(value, 0, 100), availableFields };
}

/* -------------------------------------------------------------------------- */
/* 総合スコア & Tier                                                          */
/* -------------------------------------------------------------------------- */

/**
 * 1 人の総合スコアと内訳を返す（percentile/Tier は最後にまとめて算出）。
 * @param {SupporterInput} input
 * @param {SupporterPowerScoringContext} ctx
 * @returns {{
 *   score: number,
 *   components: { engagement: number, loyalty: number, influence: number },
 *   coverage: { hasGiftData: boolean, influenceFieldsAvailable: number },
 *   _influenceWasMissing: boolean
 * }}
 */
export function computeSupporterRawScore(input, ctx) {
  const engagement = computeEngagementScore(input, ctx);
  const loyalty = computeLoyaltyScore(input, ctx);
  const inf = computeInfluenceScore(input, ctx);
  // influence 全欠損 fallback は集合計算後に埋める（ここでは null を残す）
  const influence = inf.value == null
    ? ctx.influenceMedian == null ? 50 : ctx.influenceMedian
    : inf.value;
  const raw = 0.45 * engagement + 0.35 * loyalty + 0.2 * influence;
  return {
    score: clampNumber(raw, 0, 100),
    components: {
      engagement: clampNumber(engagement, 0, 100),
      loyalty: clampNumber(loyalty, 0, 100),
      influence: clampNumber(influence, 0, 100)
    },
    coverage: {
      hasGiftData: ctx.hasGiftData,
      influenceFieldsAvailable: inf.availableFields
    },
    _influenceWasMissing: inf.value == null
  };
}

/**
 * Tier 判定。score × percentile の hybrid。
 *
 * - サンプル 20+ の normal: S(score≥90, p≥99), A(≥80, p≥95), B(≥65, p≥80),
 *   C(≥50, p≥50), D(≥35), E(else)
 * - サンプル 5-19 の smallSample: S(score≥92), A(≥80), B(≥65), C(≥50), D(≥35), E(else)
 * - サンプル 5 未満 verySmall: S を出さない（最高 A）
 *
 * 例外:
 *   - engagement < 20 かつ loyalty < 20 のとき、influence が高くても A 以上にしない
 *   - loyalty ≥ 90 かつ engagement ≥ 55 のとき、percentile が少し足りなくても B 以上に floor
 *
 * @param {{ score: number, components: { engagement: number, loyalty: number, influence: number } }} row
 * @param {number} percentile  [0, 100]
 * @param {SupporterPowerScoringContext} ctx
 * @returns {SupporterTier}
 */
export function classifyTier(row, percentile, ctx) {
  const score = row.score;
  const eng = row.components.engagement;
  const loy = row.components.loyalty;

  // 例外 1: 静かな支援は A 以上にしない（influence 高だけのケース）
  const quietHighInfluence = eng < 20 && loy < 20;
  // 例外 2: 強い常連は B 以上に floor
  const heavyRegular = loy >= 90 && eng >= 55;

  /** @type {SupporterTier} */
  let tier;
  if (ctx.tierMode === 'normal') {
    if (ctx.allowS && score >= 90 && percentile >= 99) tier = 'S';
    else if (score >= 80 && percentile >= 95) tier = 'A';
    else if (score >= 65 && percentile >= 80) tier = 'B';
    else if (score >= 50 && percentile >= 50) tier = 'C';
    else if (score >= 35) tier = 'D';
    else tier = 'E';
  } else if (ctx.tierMode === 'smallSample') {
    if (ctx.allowS && score >= 92) tier = 'S';
    else if (score >= 80) tier = 'A';
    else if (score >= 65) tier = 'B';
    else if (score >= 50) tier = 'C';
    else if (score >= 35) tier = 'D';
    else tier = 'E';
  } else {
    // verySmall: S 禁止
    if (score >= 80) tier = 'A';
    else if (score >= 65) tier = 'B';
    else if (score >= 50) tier = 'C';
    else if (score >= 35) tier = 'D';
    else tier = 'E';
  }

  // 例外 1: quietHighInfluence は A 以上にしない（B 以下に格下げ）
  if (quietHighInfluence) {
    if (tier === 'S' || tier === 'A') tier = 'B';
  }
  // 例外 2: heavyRegular は B 以上に floor（C/D/E なら B に押し上げる）
  if (heavyRegular) {
    if (tier === 'C' || tier === 'D' || tier === 'E') tier = 'B';
  }

  return tier;
}

/* -------------------------------------------------------------------------- */
/* バッチ計算（推奨入口）                                                      */
/* -------------------------------------------------------------------------- */

/**
 * SupporterInput[] から SupporterPower[] を一括計算する。
 * - percentile は配信内 score の percent rank（tie は同 percentile）
 * - 同点は commentCount → loyaltyCount → userId で deterministic に sort
 *
 * @param {readonly SupporterInput[]} inputs
 * @param {{
 *   loyaltyWindowSize?: number,
 *   availableLiveCount?: number
 * }} [opts]
 * @returns {{
 *   rows: Array<{ input: SupporterInput, power: SupporterPower }>,
 *   context: SupporterPowerScoringContext
 * }}
 */
export function computeAllSupporterPowers(inputs, opts = {}) {
  const rows = Array.isArray(inputs) ? inputs : [];
  const ctx = buildSupporterPowerScoringContext(rows, opts);

  // 1st pass: 影響度を計算して influenceMedian を確定（influence_was_missing 行は後で再算）
  const firstPass = rows.map((input) => computeSupporterRawScore(input, ctx));
  const influenceValuesForMedian = firstPass
    .filter((r) => !r._influenceWasMissing)
    .map((r) => r.components.influence);
  /** @type {number|null} */
  const influenceMedian =
    influenceValuesForMedian.length > 0 ? medianOf(influenceValuesForMedian) : null;
  // ctx を mutate（pure からは外れるが性能上やむなし・呼出側に副作用なし）
  /** @type {SupporterPowerScoringContext} */
  const ctxFinal = { ...ctx, influenceMedian };

  // 2nd pass: influence missing 行を中央値で補正
  const finalRaw = rows.map((input, i) => {
    if (!firstPass[i]._influenceWasMissing) return firstPass[i];
    return computeSupporterRawScore(input, ctxFinal);
  });

  // percentile 計算（score の rank）
  const scoresOnly = finalRaw.map((r) => r.score);
  const sortedScores = scoresOnly.slice().sort((a, b) => a - b);
  /** @type {(s: number) => number} */
  const percentileFor = (s) => {
    if (sortedScores.length === 0) return 0;
    if (sortedScores.length === 1) return 100;
    // 同点を等しく扱う: rank の平均
    let lo = 0;
    let hi = sortedScores.length - 1;
    // 最初の >= s の index
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (sortedScores[mid] < s) lo = mid + 1;
      else hi = mid;
    }
    const firstGe = lo;
    // 最後の <= s の index
    let lo2 = 0;
    let hi2 = sortedScores.length - 1;
    while (lo2 < hi2) {
      const mid = Math.ceil((lo2 + hi2) / 2);
      if (sortedScores[mid] > s) hi2 = mid - 1;
      else lo2 = mid;
    }
    const lastLe = lo2;
    // tie が連続している場合、平均 rank を percentile に
    const avgRank = (firstGe + lastLe) / 2;
    return clampNumber((avgRank / (sortedScores.length - 1)) * 100, 0, 100);
  };

  const out = rows.map((input, i) => {
    const raw = finalRaw[i];
    const percentile = percentileFor(raw.score);
    const power = {
      score: Math.round(raw.score),
      tier: classifyTier(raw, percentile, ctxFinal),
      components: {
        engagement: Math.round(raw.components.engagement),
        loyalty: Math.round(raw.components.loyalty),
        influence: Math.round(raw.components.influence)
      },
      percentile: Math.round(percentile),
      coverage: raw.coverage
    };
    return { input, power };
  });

  return { rows: out, context: ctxFinal };
}

/**
 * 集計サマリ。Tier 別の人数・上位行・中央値スコア。
 *
 * @param {Array<{ input: SupporterInput, power: SupporterPower }>} computedRows
 * @param {{ topN?: number }} [opts]
 * @returns {{
 *   sampleSize: number,
 *   tierCounts: Record<SupporterTier, number>,
 *   medianScore: number,
 *   topRows: Array<{ input: SupporterInput, power: SupporterPower }>
 * }}
 */
export function buildSupporterPowerSummary(computedRows, opts = {}) {
  const rows = Array.isArray(computedRows) ? computedRows : [];
  /** @type {Record<SupporterTier, number>} */
  const tierCounts = { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0 };
  for (const r of rows) {
    const t = r?.power?.tier;
    if (t === 'S' || t === 'A' || t === 'B' || t === 'C' || t === 'D' || t === 'E') {
      tierCounts[t] += 1;
    }
  }
  const scores = rows.map((r) => Number(r?.power?.score) || 0);
  const medianScore = scores.length === 0 ? 0 : Math.round(medianOf(scores));
  const topN =
    Number.isFinite(Number(opts.topN)) && Number(opts.topN) > 0
      ? Math.floor(Number(opts.topN))
      : 10;
  // 同点 deterministic 並び替え: score desc → commentCount desc → loyaltyCount desc → userId asc
  const sorted = rows.slice().sort((a, b) => {
    if (b.power.score !== a.power.score) return b.power.score - a.power.score;
    const ac = Number(a.input?.commentCount) || 0;
    const bc = Number(b.input?.commentCount) || 0;
    if (bc !== ac) return bc - ac;
    const al = Number(a.input?.loyaltyCount) || 0;
    const bl = Number(b.input?.loyaltyCount) || 0;
    if (bl !== al) return bl - al;
    return String(a.input?.userId || '').localeCompare(String(b.input?.userId || ''));
  });
  return {
    sampleSize: rows.length,
    tierCounts,
    medianScore,
    topRows: sorted.slice(0, topN)
  };
}
