/**
 * コメント疲労（「短い時間でコメントを打つと疲れて失速する」）をデータ化する純関数。
 *
 * 配信者の体感（短時間枠ほどコメンターが冒頭バーストして後半失速する）を、記録済み
 * コメントの時刻から定量化する。userId が安定して取れる行のみ対象（匿名 184 で uid が
 * 取れない行は同一人物として追跡できないため除外）。
 *
 * 3 つの観点:
 *   1. 個人ペース鈍化: 各コメンターの「後半のコメント間隔 ÷ 前半のコメント間隔」。
 *      1 を超えるほど打つ速度が落ちている＝疲労。
 *   2. 在籍時間カーブ: 各人の初コメからの経過分ごとの「1 人あたりコメ数」。右肩下がりなら
 *      時間経過で 1 人の発話量が落ちている。
 *   3. 残存率: 経過分ごとに、初コメ直後（tenure 0 分）の発話者の何 % がまだ発話しているか。
 *
 * @typedef {import('./commentRecord.js').StoredComment} StoredComment
 */

/**
 * @param {{ minute: number, activeUsers: number, comments: number, perUser: number, retentionPct: number }} _b
 * @typedef {{ minute: number, activeUsers: number, comments: number, perUser: number, retentionPct: number }} CommentFatigueTenureBucket
 */

/**
 * @typedef {{
 *   trackedUsers: number,
 *   multiCommenterCount: number,
 *   analyzedCount: number,
 *   slowedCount: number,
 *   slowedPct: number,
 *   medianSlowdownRatio: number,
 *   startUsers: number,
 *   tenureBuckets: CommentFatigueTenureBucket[]
 * }} CommentFatigueReport
 */

/** @param {number[]} sorted 昇順ソート済み配列 */
function medianOfSorted(sorted) {
  const n = sorted.length;
  if (!n) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** @param {number} v @param {number} digits */
function round(v, digits) {
  const p = 10 ** digits;
  return Math.round(v * p) / p;
}

/**
 * @param {StoredComment[]} comments
 * @param {{ minComments?: number, slowThreshold?: number, maxTenureMin?: number, broadcasterUserId?: string }} [opts]
 * @returns {CommentFatigueReport}
 */
export function computeCommentFatigue(comments, opts = {}) {
  const minComments =
    Number.isFinite(opts.minComments) && opts.minComments >= 3 ? Math.floor(opts.minComments) : 3;
  const slowThreshold =
    Number.isFinite(opts.slowThreshold) && opts.slowThreshold > 1 ? opts.slowThreshold : 1.2;
  const maxTenureMin =
    Number.isFinite(opts.maxTenureMin) && opts.maxTenureMin > 0 ? Math.floor(opts.maxTenureMin) : 30;
  const broadcasterUserId = String(opts.broadcasterUserId || '').trim();

  /** @type {Map<string, number[]>} uid -> timestamps */
  const byUser = new Map();
  const rows = Array.isArray(comments) ? comments : [];
  for (const c of rows) {
    const uid = String((c && c.userId) || '').trim();
    if (!uid) continue;
    if (broadcasterUserId && uid === broadcasterUserId) continue;
    const t = Number((c && c.capturedAt) || 0);
    if (!Number.isFinite(t) || t <= 0) continue;
    let arr = byUser.get(uid);
    if (!arr) {
      arr = [];
      byUser.set(uid, arr);
    }
    arr.push(t);
  }

  let multiCommenterCount = 0;
  let analyzedCount = 0;
  let slowedCount = 0;
  /** @type {number[]} */
  const ratios = [];

  const tenureComments = new Array(maxTenureMin + 1).fill(0);
  /** @type {Array<Set<string>>} */
  const tenureUserSets = Array.from({ length: maxTenureMin + 1 }, () => new Set());

  for (const [uid, tsRaw] of byUser) {
    const ts = tsRaw.slice().sort((a, b) => a - b);
    const n = ts.length;
    if (n >= minComments) multiCommenterCount += 1;

    const first = ts[0];
    for (const t of ts) {
      const m = Math.floor((t - first) / 60000);
      if (m >= 0 && m <= maxTenureMin) {
        tenureComments[m] += 1;
        tenureUserSets[m].add(uid);
      }
    }

    // ペース鈍化は「間隔（gap）」が 2 本以上 = コメント 3 件以上で測れる。
    if (n >= 3) {
      /** @type {number[]} */
      const gaps = [];
      for (let i = 1; i < n; i++) gaps.push(ts[i] - ts[i - 1]);
      const half = Math.floor(gaps.length / 2);
      if (half >= 1) {
        // 前半 = 早い側、後半 = 遅い側。gap 数が奇数なら中央の 1 本は両方から除外。
        const firstHalf = gaps.slice(0, half).sort((a, b) => a - b);
        const secondHalf = gaps.slice(gaps.length - half).sort((a, b) => a - b);
        const fMed = medianOfSorted(firstHalf);
        const sMed = medianOfSorted(secondHalf);
        if (fMed > 0) {
          const ratio = sMed / fMed;
          ratios.push(ratio);
          analyzedCount += 1;
          if (ratio >= slowThreshold) slowedCount += 1;
        }
      }
    }
  }

  ratios.sort((a, b) => a - b);
  const medianSlowdownRatio = ratios.length ? round(medianOfSorted(ratios), 2) : 0;

  const startUsers = tenureUserSets[0].size;
  /** @type {CommentFatigueTenureBucket[]} */
  const tenureBuckets = [];
  for (let m = 0; m <= maxTenureMin; m++) {
    const activeUsers = tenureUserSets[m].size;
    const cnt = tenureComments[m];
    tenureBuckets.push({
      minute: m,
      activeUsers,
      comments: cnt,
      perUser: activeUsers > 0 ? round(cnt / activeUsers, 2) : 0,
      retentionPct: startUsers > 0 ? round((activeUsers / startUsers) * 100, 1) : 0
    });
  }
  // 末尾の空バケツ（誰も居ない経過分）を削る。最低 1 本は残す。
  while (
    tenureBuckets.length > 1 &&
    tenureBuckets[tenureBuckets.length - 1].comments === 0 &&
    tenureBuckets[tenureBuckets.length - 1].activeUsers === 0
  ) {
    tenureBuckets.pop();
  }

  return {
    trackedUsers: byUser.size,
    multiCommenterCount,
    analyzedCount,
    slowedCount,
    slowedPct: analyzedCount > 0 ? round((slowedCount / analyzedCount) * 100, 1) : 0,
    medianSlowdownRatio,
    startUsers,
    tenureBuckets
  };
}
