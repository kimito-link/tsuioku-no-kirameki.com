/**
 * 応援レーンの「誰が消えたか」を測る純関数(v0.1.1231・Phase 1 計器)。
 *
 * 【なぜ必要か】
 * ユーザー確定の不変条件:
 *   「レーンは途中で増えることがあっても、減って消えたりの挙動があってはいけない。
 *     その配信に来た人はずっと記録しないと」
 *
 * ところが調査で、**「一度出た人」を覚える仕組みがどこにも無い**ことが分かった。
 * 毎 paint がゼロから候補を作り直し、横断的な記憶は
 *   - 直前の描画内容の文字列(diff-skip 用)
 *   - 最後に描いた配信ID(文字列1個)
 *   - DOM の childElementCount(**個数だけ**)
 * しかない。つまり **同じ人数のまま中身が入れ替わると、既存のどのガードも検知できない**。
 *
 * 既存の計器も「個数」しか見ていないので、この入れ替わりが観測できていなかった。
 * ここを埋めるのが本モジュール。Phase 2 の蓄積器を作る前に、
 * **実配信で本当に人が消えているのか/何人消えるのか**を数字で確定させる。
 *
 * ★挙動は一切変えない(観測のみ)。
 *
 * 正本: docs/handoff/(計画) レーンから人が消える根治
 * @module laneRosterDelta
 */

/** 消えた人の例を保持する上限(状態速報が膨らまないように少なく固定)。 */
export const LANE_DROPPED_SAMPLE_MAX = 5;

/**
 * 描画対象から userId の集合を作る。
 *
 * ★入力は「今回描こうとしている候補」。DOM は走査しない
 *   (paint のたびの DOM 全走査は禁止=過去に拡張全体を重くした)。
 *
 * @param {readonly unknown[]|null|undefined} picks 5段ぶんの描画候補(flatten 済み想定)
 * @returns {Set<string>}
 */
export function laneUserIdSet(picks) {
  const out = new Set();
  if (!Array.isArray(picks)) return out;
  for (const p of picks) {
    const o = /** @type {Record<string, unknown>} */ (p && typeof p === 'object' ? p : null);
    if (!o) continue;
    // 候補の形は { entry: { userId } } か、直接 userId を持つ形の両方がありうる。
    const entry = /** @type {Record<string, unknown>} */ (
      o.entry && typeof o.entry === 'object' ? o.entry : o
    );
    const uid = String(entry.userId ?? '').trim();
    if (uid) out.add(uid);
  }
  return out;
}

/**
 * 前回と今回の人物集合を比べ、「消えた人」を割り出す。
 *
 * @param {Set<string>|null|undefined} prev 前回描画した userId 集合
 * @param {Set<string>|null|undefined} next 今回描こうとしている userId 集合
 * @returns {{ dropped: string[], added: string[], keptCount: number }}
 */
export function diffLaneRoster(prev, next) {
  const a = prev instanceof Set ? prev : new Set();
  const b = next instanceof Set ? next : new Set();
  /** @type {string[]} */
  const dropped = [];
  /** @type {string[]} */
  const added = [];
  let keptCount = 0;
  for (const uid of a) {
    if (b.has(uid)) keptCount += 1;
    else dropped.push(uid);
  }
  for (const uid of b) {
    if (!a.has(uid)) added.push(uid);
  }
  return { dropped, added, keptCount };
}

/**
 * 計器の初期状態を作る。
 *
 * @returns {{
 *   lastLid: string,
 *   lastSet: Set<string>,
 *   everSeen: Set<string>,
 *   droppedTotal: number,
 *   droppedEventCount: number,
 *   maxDroppedAtOnce: number,
 *   droppedSamples: string[],
 *   addedTotal: number,
 *   everSeenMax: number,
 *   cappedOutTotal: number
 * }}
 */
export function makeLaneRosterDeltaState() {
  return {
    lastLid: '',
    lastSet: new Set(),
    /** ★この配信で一度でも描画された userId。Phase 2 の蓄積器が扱う人数の実測値になる。 */
    everSeen: new Set(),
    droppedTotal: 0,
    droppedEventCount: 0,
    maxDroppedAtOnce: 0,
    droppedSamples: [],
    addedTotal: 0,
    /** everSeen の最大サイズ(=上限48を撤廃したら何人になるかの実測)。 */
    everSeenMax: 0,
    /** 上限で切られた人数の累計(候補はあったのに描かれなかった)。 */
    cappedOutTotal: 0
  };
}

/**
 * 1回の paint を記録する。
 *
 * @param {ReturnType<typeof makeLaneRosterDeltaState>} state
 * @param {{
 *   liveId?: unknown,
 *   picks?: readonly unknown[],
 *   candidateTotal?: unknown
 * }} args
 *   candidateTotal: 上限で切る前の候補総数(あれば cappedOut を算出できる)
 * @returns {{ dropped: number, added: number }}
 */
export function noteLaneRoster(state, args) {
  if (!state || typeof state !== 'object') return { dropped: 0, added: 0 };
  try {
    const lid = String(args?.liveId ?? '').trim().toLowerCase();
    const next = laneUserIdSet(args?.picks);

    // ★配信が変わったらリセット(ユーザーが別番組へ移った=正当な切替)。
    //   「その配信に来た人はずっと残る」は同一配信の中での約束。
    if (lid !== state.lastLid) {
      state.lastLid = lid;
      state.lastSet = next;
      state.everSeen = new Set(next);
      state.everSeenMax = next.size;
      // 累計系は配信ごとに数え直す(前の配信の数字を引きずらない)。
      state.droppedTotal = 0;
      state.droppedEventCount = 0;
      state.maxDroppedAtOnce = 0;
      state.droppedSamples = [];
      state.addedTotal = 0;
      state.cappedOutTotal = 0;
      return { dropped: 0, added: next.size };
    }

    const { dropped, added } = diffLaneRoster(state.lastSet, next);
    if (dropped.length > 0) {
      state.droppedTotal += dropped.length;
      state.droppedEventCount += 1;
      if (dropped.length > state.maxDroppedAtOnce) state.maxDroppedAtOnce = dropped.length;
      for (const uid of dropped) {
        if (state.droppedSamples.length >= LANE_DROPPED_SAMPLE_MAX) break;
        if (!state.droppedSamples.includes(uid)) state.droppedSamples.push(uid);
      }
    }
    state.addedTotal += added.length;
    for (const uid of next) state.everSeen.add(uid);
    if (state.everSeen.size > state.everSeenMax) state.everSeenMax = state.everSeen.size;

    // 上限で切られた人数(候補総数 - 実際に描いた数)。負にはしない。
    const cand = Math.max(0, Math.floor(Number(args?.candidateTotal) || 0));
    if (cand > next.size) state.cappedOutTotal += cand - next.size;

    state.lastSet = next;
    return { dropped: dropped.length, added: added.length };
  } catch {
    return { dropped: 0, added: 0 };
  }
}

/**
 * 状態速報用のスナップショットを作る。
 *
 * @param {ReturnType<typeof makeLaneRosterDeltaState>|null|undefined} state
 * @returns {object}
 */
export function snapshotLaneRosterDelta(state) {
  const s = state && typeof state === 'object' ? state : null;
  if (!s) return {};
  return {
    droppedTotal: Number(s.droppedTotal) || 0,
    droppedEventCount: Number(s.droppedEventCount) || 0,
    maxDroppedAtOnce: Number(s.maxDroppedAtOnce) || 0,
    droppedSamples: Array.isArray(s.droppedSamples) ? s.droppedSamples.slice(0, LANE_DROPPED_SAMPLE_MAX) : [],
    addedTotal: Number(s.addedTotal) || 0,
    everSeenNow: s.everSeen instanceof Set ? s.everSeen.size : 0,
    everSeenMax: Number(s.everSeenMax) || 0,
    cappedOutTotal: Number(s.cappedOutTotal) || 0
  };
}

/**
 * 状態速報の1行を組み立てる。0件なら空文字(静かな計器)。
 *
 * ★「消えた人数」が本丸。0 なら不変条件は守られている。
 *   everSeenMax は「上限を撤廃したら何人になるか」の実測=上限48を決める材料。
 *
 * @param {object|null|undefined} snap snapshotLaneRosterDelta の戻り
 * @returns {string}
 */
export function formatLaneRosterDeltaLine(snap) {
  const s = snap && typeof snap === 'object' ? /** @type {any} */ (snap) : null;
  if (!s) return '';
  const dropped = Number(s.droppedTotal) || 0;
  const everMax = Number(s.everSeenMax) || 0;
  if (dropped <= 0 && everMax <= 0) return '';
  const parts = [];
  if (dropped > 0) {
    parts.push(
      `⚠ 消えた人 累計${dropped}人(${Number(s.droppedEventCount) || 0}回・一度に最大${Number(s.maxDroppedAtOnce) || 0}人)`
    );
    const samples = Array.isArray(s.droppedSamples) ? s.droppedSamples : [];
    if (samples.length) parts.push(`例:${samples.join(',')}`);
  } else {
    parts.push('消えた人 0人 ✅');
  }
  parts.push(`来た人 累計${everMax}人(今${Number(s.everSeenNow) || 0}人)`);
  const capped = Number(s.cappedOutTotal) || 0;
  if (capped > 0) parts.push(`上限で切られた のべ${capped}人`);
  return `  → レーンの人物: ${parts.join(' / ')}`;
}
