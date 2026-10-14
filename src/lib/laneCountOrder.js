/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】応援レーン候補の「件数の多い順」並べ替えと、並べ替えの頻度制限(60秒に1回)
 * 【この箱に入らないもの】DOM・storage・chrome.*・時計(now は呼び出し側から受け取る)
 * 【書けるstorageキー】なし
 * 【正本宣言】レーン内の並び順(段内)を決める入口はこのファイルのみ
 *
 * ★なぜ(2026-10-14・ユーザー「/live/ の安定性を全部移植して」+ 並びは「件数の多い順・並べ替えは60秒に1回まで」)
 *   /live/ は件数降順・同数は先着順。拡張は uid 文字列の昇順で、コメントしても位置が変わらず、人が増えると
 *   途中へ割り込んで他のタイルがずれていた。ただし件数降順を毎回効かせると、コメントのたびにタイルが入れ替わる。
 *   → 並びは【60秒に1回だけ】件数降順へ取り直し、その間は前回の並びを保つ。新しく来た人は末尾に足すだけ
 *     (既存の人を動かさない・減らさない)。
 * @module laneCountOrder
 */

import { compareStoryUserLaneCandidates } from './storyUserLaneSort.js';

/** 件数降順へ並べ直す最小間隔(ms)。 */
export const LANE_COUNT_REORDER_MIN_GAP_MS = 60_000;

/** @typedef {{ profileTier?: number, thumbScore?: number, commentCount?: number, entryIndex?: number, entry?: { userId?: unknown } }} LaneOrderCandidate */

/**
 * @typedef {{
 *   liveId: string, lastSortAtMs: number, nextRank: number,
 *   rank: Map<string, number>, reorders: number, appended: number
 * }} LaneCountOrderState
 */

/** @returns {LaneCountOrderState} */
export function makeLaneCountOrderState() {
  return { liveId: '', lastSortAtMs: 0, nextRank: 0, rank: new Map(), reorders: 0, appended: 0 };
}

/** @param {LaneOrderCandidate} c @returns {string} */
const keyOf = (c) => String(c?.entry?.userId || '').trim();
/** @param {LaneOrderCandidate} c @returns {number} */
const countOf = (c) => {
  const n = Number(c?.commentCount);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * 段(tier)が上の人が先・同段では件数の多い人が先・同数は従来の比較器(サムネ→ID→新しさ)。
 * @param {LaneOrderCandidate} a @param {LaneOrderCandidate} b
 */
export function compareByTierThenCount(a, b) {
  const ta = Number(a?.profileTier) || 0;
  const tb = Number(b?.profileTier) || 0;
  if (ta !== tb) return tb - ta;
  const ca = countOf(a);
  const cb = countOf(b);
  if (ca !== cb) return cb - ca;
  return compareStoryUserLaneCandidates(/** @type {any} */ (a), /** @type {any} */ (b));
}

/**
 * 候補を並べる。in-place ではなく新しい配列を返し、state を更新する。
 *  - 配信が変わった / 初回 / 前回の取り直しから60秒以上: 全員を件数降順に取り直し、順位表を作り直す
 *  - それ以外: 順位表にいる人は前回の順位のまま。新しい人は末尾に(新規どうしは件数降順)足して順位表へ載せる
 *  段(tier)は常に優先(段をまたぐ並びは段分けが担う)。
 * @template {LaneOrderCandidate} T
 * @param {LaneCountOrderState} state in-place
 * @param {{ liveId: unknown, candidates: T[], nowMs: number, minGapMs?: number }} input
 * @returns {{ ordered: T[], reordered: boolean, appended: number }}
 */
export function orderLaneCandidatesByCount(state, input) {
  const list = Array.isArray(input?.candidates) ? input.candidates.slice() : [];
  const liveId = String(input?.liveId ?? '');
  const nowMs = Number(input?.nowMs) || 0;
  const gap = Number.isFinite(Number(input?.minGapMs)) ? Number(input.minGapMs) : LANE_COUNT_REORDER_MIN_GAP_MS;

  if (state.liveId !== liveId) {
    state.liveId = liveId;
    state.rank = new Map();
    state.nextRank = 0;
    state.lastSortAtMs = 0;
  }
  const due = state.rank.size === 0 || nowMs - state.lastSortAtMs >= gap;
  if (due) {
    list.sort(compareByTierThenCount);
    state.rank = new Map();
    state.nextRank = 0;
    for (const c of list) {
      const k = keyOf(c);
      if (k && !state.rank.has(k)) state.rank.set(k, state.nextRank++);
    }
    state.lastSortAtMs = nowMs;
    state.reorders += 1;
    return { ordered: list, reordered: true, appended: 0 };
  }

  // 新しい人: 順位表に無い人を件数降順で末尾へ。
  const fresh = list.filter((c) => { const k = keyOf(c); return k && !state.rank.has(k); });
  fresh.sort(compareByTierThenCount);
  for (const c of fresh) state.rank.set(keyOf(c), state.nextRank++);
  state.appended += fresh.length;
  const r = (/** @type {LaneOrderCandidate} */ c) => state.rank.get(keyOf(c)) ?? Number.MAX_SAFE_INTEGER;
  // 段が上の人が先(段分けは段ごとに先頭から取る)・同段では順位表の順。
  list.sort((a, b) => {
    const ta = Number(a?.profileTier) || 0;
    const tb = Number(b?.profileTier) || 0;
    if (ta !== tb) return tb - ta;
    return r(a) - r(b);
  });
  return { ordered: list, reordered: false, appended: fresh.length };
}

/**
 * 状態速報の1行。観測前は空。
 * @param {LaneCountOrderState|null|undefined} state
 */
export function formatLaneCountOrderLine(state) {
  if (!state || state.reorders === 0) return '';
  return `レーン並び: 件数の多い順(取り直し${state.reorders}回・60秒に1回まで) / 途中で足した人${state.appended}人 / 順位表${state.rank.size}人`;
}
