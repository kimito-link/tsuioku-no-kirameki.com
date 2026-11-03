/**
 * 視聴維持率（推定）: 「最後まで配信を見ていたか」を、コメントした人ひとりずつ推定する。
 *
 * ■ なぜ「推定」か
 *   ニコ生は「誰がいつ入って、いつ出たか」を外に出さない。拡張が分かるのは
 *   「誰がいつコメントしたか」だけなので、コメントの時刻から在席を推し量る。
 *   コメントしなかった人（見ているだけの人）は数えられない。
 *
 * ■ 推定のルール（レポートにも同じ文を出す＝計算と説明を食い違わせない）
 *   - 配信の始まり = 番組の開始時刻（分かれば）。無ければ最初の記録コメントの時刻。
 *   - 配信の終わり = 最後の記録コメントの時刻（配信中に保存したときは、その時点まで）。
 *   - 終盤 = 配信の終わりから「配信の長さの10%（3分〜10分）」さかのぼった区間。
 *   - 最後まで見た = その人の最後のコメントが終盤にある。
 *   - 一人ずつの視聴維持率 = 推定視聴時間 ÷ 配信の長さ。
 *       推定視聴時間は「最初のコメント〜最後のコメント」をずっと見ていたとみなす。
 *       序盤（始まりから同じ幅）にコメントした人は始まりから、最後まで見た人は終わりまで見たとみなす。
 *   - 全体の視聴維持率 = 最後まで見た人 ÷ コメントした人。
 *
 * 純関数（storage / DOM に触らない）。
 */

import { parseInterestArrivalComment } from './parseInterestArrivalComment.js';
import { toEpochMs } from './timeAuthority.js';

/** 配信がこれより短いと終盤と序盤の区別がつかないので判定しない */
export const VIEWER_RETENTION_MIN_DURATION_MS = 6 * 60_000;
const EDGE_WINDOW_RATIO = 0.1;
const EDGE_WINDOW_MIN_MS = 3 * 60_000;
const EDGE_WINDOW_MAX_MS = 10 * 60_000;

/**
 * @typedef {{
 *   userId: string,
 *   nickname: string,
 *   avatarUrl: string,
 *   count: number,
 *   firstAt: number,
 *   lastAt: number,
 *   watchedMs: number,
 *   retentionPct: number,
 *   stayedToEnd: boolean,
 *   fromStart: boolean,
 *   singleComment: boolean
 * }} ViewerRetentionUser
 */

/**
 * @typedef {{
 *   ok: boolean,
 *   reason: string,
 *   startMs: number,
 *   endMs: number,
 *   durationMs: number,
 *   edgeWindowMs: number,
 *   startSource: 'program' | 'first_comment',
 *   totalUsers: number,
 *   stayedCount: number,
 *   stayedPct: number,
 *   fromStartCount: number,
 *   fromStartStayedCount: number,
 *   fromStartStayedPct: number,
 *   avgRetentionPct: number,
 *   users: ViewerRetentionUser[]
 * }} ViewerRetentionEstimate
 */

/** @param {number} n */
function pct1(n) {
  return Math.round(n * 1000) / 10;
}

/**
 * @param {unknown[] | null | undefined} comments
 * @param {{ broadcasterUserId?: string, programStartAtMs?: number }} [opts]
 * @returns {ViewerRetentionEstimate}
 */
export function estimateViewerRetention(comments, opts = {}) {
  const broadcasterUid = String(opts?.broadcasterUserId || '').trim();
  /** @type {Map<string, ViewerRetentionUser>} */
  const byUser = new Map();
  let firstAll = 0;
  let lastAll = 0;
  for (const raw of Array.isArray(comments) ? comments : []) {
    if (!raw || typeof raw !== 'object') continue;
    const c = /** @type {Record<string, unknown>} */ (raw);
    const at = toEpochMs(c.capturedAt);
    if (!(at > 0)) continue;
    const uid = c.userId == null ? '' : String(c.userId).trim();
    if (!uid) continue;
    if (broadcasterUid && uid === broadcasterUid) continue;
    if (parseInterestArrivalComment(String(c.text || ''))) continue;
    if (!firstAll || at < firstAll) firstAll = at;
    if (at > lastAll) lastAll = at;
    const nick = typeof c.nickname === 'string' ? c.nickname : '';
    const av = typeof c.avatarUrl === 'string' ? c.avatarUrl : '';
    const u = byUser.get(uid);
    if (u) {
      u.count += 1;
      if (at < u.firstAt) u.firstAt = at;
      if (at > u.lastAt) u.lastAt = at;
      if (!u.nickname && nick) u.nickname = nick;
      if (!u.avatarUrl && av) u.avatarUrl = av;
    } else {
      byUser.set(uid, {
        userId: uid,
        nickname: nick,
        avatarUrl: av,
        count: 1,
        firstAt: at,
        lastAt: at,
        watchedMs: 0,
        retentionPct: 0,
        stayedToEnd: false,
        fromStart: false,
        singleComment: false
      });
    }
  }

  const programStart = Number(opts?.programStartAtMs);
  const useProgram = Number.isFinite(programStart) && programStart > 0 && firstAll > 0 && programStart <= firstAll;
  const startMs = useProgram ? programStart : firstAll;
  const endMs = lastAll;
  const durationMs = Math.max(0, endMs - startMs);
  const edgeWindowMs = Math.min(EDGE_WINDOW_MAX_MS, Math.max(EDGE_WINDOW_MIN_MS, durationMs * EDGE_WINDOW_RATIO));

  /** @type {ViewerRetentionEstimate} */
  const empty = {
    ok: false,
    reason: '',
    startMs,
    endMs,
    durationMs,
    edgeWindowMs,
    startSource: useProgram ? 'program' : 'first_comment',
    totalUsers: byUser.size,
    stayedCount: 0,
    stayedPct: 0,
    fromStartCount: 0,
    fromStartStayedCount: 0,
    fromStartStayedPct: 0,
    avgRetentionPct: 0,
    users: []
  };
  if (byUser.size === 0) return { ...empty, reason: 'コメントした人が記録されていません。' };
  if (durationMs < VIEWER_RETENTION_MIN_DURATION_MS) {
    return { ...empty, reason: '記録できた配信が6分より短いため、最後まで見たかを判定できません。' };
  }

  const users = [...byUser.values()];
  let stayed = 0;
  let fromStart = 0;
  let fromStartStayed = 0;
  let sumPct = 0;
  for (const u of users) {
    u.stayedToEnd = u.lastAt >= endMs - edgeWindowMs;
    u.fromStart = u.firstAt <= startMs + edgeWindowMs;
    u.singleComment = u.count === 1;
    const from = u.fromStart ? startMs : u.firstAt;
    const to = u.stayedToEnd ? endMs : u.lastAt;
    u.watchedMs = Math.max(0, to - from);
    u.retentionPct = Math.min(100, pct1(u.watchedMs / durationMs));
    sumPct += u.retentionPct;
    if (u.stayedToEnd) stayed += 1;
    if (u.fromStart) {
      fromStart += 1;
      if (u.stayedToEnd) fromStartStayed += 1;
    }
  }
  users.sort(
    (a, b) =>
      Number(b.stayedToEnd) - Number(a.stayedToEnd) ||
      b.retentionPct - a.retentionPct ||
      b.count - a.count ||
      a.firstAt - b.firstAt
  );
  return {
    ...empty,
    ok: true,
    stayedCount: stayed,
    stayedPct: pct1(stayed / users.length),
    fromStartCount: fromStart,
    fromStartStayedCount: fromStartStayed,
    fromStartStayedPct: fromStart > 0 ? pct1(fromStartStayed / fromStart) : 0,
    avgRetentionPct: Math.round((sumPct / users.length) * 10) / 10,
    users
  };
}
