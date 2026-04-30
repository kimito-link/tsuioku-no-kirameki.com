/**
 * コメンター生存曲線（B6）。
 *
 * 設計（0.1.23 X: マーケ分析有料 / ユーザー層動向）:
 *   配信を N 等分し、最初のセグメントに居た「base ユーザー」のうち、
 *   各セグメントに何 % が残ってコメントを書いていたかを返す。
 *
 *   per-viewer の入退場が取れない代わりに「コメント参加維持」を計測する。
 *   "視聴維持率の代替指標" の補強。
 */

/**
 * @typedef {{
 *   capturedAt?: any,
 *   userId?: any
 * }} SurvivalCommentInput
 */

/**
 * @typedef {{
 *   segmentIndex: number,
 *   startMin: number,
 *   endMin: number,
 *   presentCount: number,
 *   retentionPct: number
 * }} SurvivalSegment
 */

/**
 * @typedef {{
 *   baseUserCount: number,
 *   segments: SurvivalSegment[]
 * }} CommenterSurvivalCurve
 */

/**
 * @param {SurvivalCommentInput[] | null | undefined} comments
 * @param {{ segmentCount?: number } | undefined} [opts]
 * @returns {CommenterSurvivalCurve}
 */
export function buildCommenterSurvivalCurve(comments, opts = {}) {
  const segmentCount =
    typeof opts?.segmentCount === 'number' && opts.segmentCount > 0
      ? Math.floor(opts.segmentCount)
      : 4;
  const list = Array.isArray(comments) ? comments : [];
  /** @type {{ at: number, uid: string }[]} */
  const valid = [];
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    const at = c.capturedAt;
    if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) continue;
    const uid = c.userId == null ? '' : String(c.userId).trim();
    if (!uid) continue;
    valid.push({ at, uid });
  }
  if (!valid.length) return { baseUserCount: 0, segments: [] };
  valid.sort((a, b) => a.at - b.at);
  const firstAt = valid[0].at;
  const lastAt = valid[valid.length - 1].at;
  const totalSpan = Math.max(1, lastAt - firstAt);
  const segSpan = totalSpan / segmentCount;

  /** @type {Set<string>[]} */
  const segUsers = Array.from({ length: segmentCount }, () => new Set());
  for (const v of valid) {
    let idx = Math.floor((v.at - firstAt) / segSpan);
    if (idx >= segmentCount) idx = segmentCount - 1;
    if (idx < 0) idx = 0;
    segUsers[idx].add(v.uid);
  }

  const baseUsers = segUsers[0];
  const baseUserCount = baseUsers.size;
  /** @type {SurvivalSegment[]} */
  const segments = segUsers.map((users, i) => {
    let present = 0;
    for (const u of baseUsers) if (users.has(u)) present += 1;
    const retentionPct =
      baseUserCount > 0 ? Math.round((present / baseUserCount) * 1000) / 10 : 0;
    return {
      segmentIndex: i,
      startMin: Math.round((i * segSpan) / 60_000),
      endMin: Math.round(((i + 1) * segSpan) / 60_000),
      presentCount: present,
      retentionPct
    };
  });

  return { baseUserCount, segments };
}
