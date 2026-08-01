/**
 * アイコングリッド(story growth)の「作り直し」を観測する純関数(v0.1.1208)。
 *
 * ユーザー報告(2026-08-01)「ここの動きがおかしい。増えていく動きならいいけど、そうじゃない」。
 *
 * 設計意図は「ぷよぷよのように積み上がる」だが、上限(STORY_GROWTH_MAX_CELLS=360)を超えると
 * 実装が別物にすり替わる:
 *   - 360件まで: 末尾に足す=積み上がる(設計どおり)
 *   - 360件超  : sourceOffset = srcLen - target が1件ごとに増え、
 *                「直近360件の窓」が1つずつスライドする=毎回360枚が総入れ替え
 * 同じ画面が2つの原理で動いているため、途中から挙動が変わったように見える。
 *
 * ★ただし「1件ごとに全部描き替わる」はコードから読んだ推論であって、実機で何回・
 *   どれだけ走っているかは未実測。推測で直すと今夜のような性能事故を繰り返すので、
 *   まず数える(診断ファースト)。
 *
 * このモジュールは数えるだけ。グリッドの描画・タイミングには一切干渉しない。
 *
 * @module storyGrowthChurn
 */

/**
 * @typedef {{
 *   rebuilds: number,
 *   cellsBuilt: number,
 *   slideRebuilds: number,
 *   slideCells: number,
 *   growRebuilds: number,
 *   maxCells: number,
 *   lastAtMs: number,
 *   lastOffset: number,
 *   totalMs: number,
 *   maxMs: number,
 *   timedRebuilds: number
 * }} StoryGrowthChurnState
 */

/** @returns {StoryGrowthChurnState} */
export function createStoryGrowthChurnState() {
  return {
    rebuilds: 0,
    cellsBuilt: 0,
    slideRebuilds: 0,
    slideCells: 0,
    growRebuilds: 0,
    maxCells: 0,
    lastAtMs: 0,
    lastOffset: -1,
    totalMs: 0,
    maxMs: 0,
    timedRebuilds: 0
  };
}

/**
 * グリッドを作り直した1回ぶんを記録する。
 *
 * ★「スライド由来」と「純粋な増加」を分けるのが核心。前者はユーザーが
 *   「おかしい」と感じている当の動きで、後者は設計どおりの積み上がり。
 *   両者を混ぜて数えると、直すべき対象が見えない。
 *
 * @param {StoryGrowthChurnState|null|undefined} state
 * @param {{ cells: number, offset: number, atMs: number, elapsedMs?: number }} ev
 *   cells: 作り直した枚数 / offset: 表示窓の先頭位置(sourceOffset) /
 *   elapsedMs: 作り直しに要した実測時間(取れなければ省略可)
 */
export function noteStoryGrowthRebuild(state, ev) {
  if (!state || typeof state !== 'object') return;
  const cells = Math.max(0, Math.floor(Number(ev?.cells) || 0));
  const offset = Math.floor(Number(ev?.offset));
  const atMs = Number(ev?.atMs) || 0;
  const elapsedMs = Number(ev?.elapsedMs);

  state.rebuilds += 1;
  state.cellsBuilt += cells;
  if (cells > state.maxCells) state.maxCells = cells;
  state.lastAtMs = atMs;

  // offset が前回より進んでいる=窓がスライドした=既存の枚を捨てて描き直している。
  const prevOffset = Number.isFinite(state.lastOffset) ? state.lastOffset : -1;
  const slid = Number.isFinite(offset) && prevOffset >= 0 && offset > prevOffset;
  if (slid) {
    state.slideRebuilds += 1;
    state.slideCells += cells;
  } else {
    state.growRebuilds += 1;
  }
  if (Number.isFinite(offset)) state.lastOffset = offset;

  if (Number.isFinite(elapsedMs) && elapsedMs >= 0) {
    state.totalMs += elapsedMs;
    state.timedRebuilds = (Number(state.timedRebuilds) || 0) + 1;
    if (elapsedMs > state.maxMs) state.maxMs = elapsedMs;
  }
}

/**
 * 状態速報に出す要約。
 * @param {StoryGrowthChurnState|null|undefined} state
 * @param {number} nowMs
 * @returns {{ rebuilds: number, slideRebuilds: number, growRebuilds: number, cellsBuilt: number,
 *   slideCells: number, maxCells: number, avgMs: number, maxMs: number, lastAgoMs: number, line: string }}
 */
export function summarizeStoryGrowthChurn(state, nowMs) {
  const s = state && typeof state === 'object' ? state : createStoryGrowthChurnState();
  const rebuilds = Math.max(0, Math.floor(Number(s.rebuilds) || 0));
  const slideRebuilds = Math.max(0, Math.floor(Number(s.slideRebuilds) || 0));
  const growRebuilds = Math.max(0, Math.floor(Number(s.growRebuilds) || 0));
  const cellsBuilt = Math.max(0, Math.floor(Number(s.cellsBuilt) || 0));
  const slideCells = Math.max(0, Math.floor(Number(s.slideCells) || 0));
  const maxCells = Math.max(0, Math.floor(Number(s.maxCells) || 0));
  const totalMs = Math.max(0, Number(s.totalMs) || 0);
  const maxMs = Math.max(0, Number(s.maxMs) || 0);
  const lastAtMs = Math.max(0, Number(s.lastAtMs) || 0);
  const now = Number(nowMs) || 0;
  const lastAgoMs = lastAtMs > 0 && now >= lastAtMs ? now - lastAtMs : -1;
  // ★平均は「時間が取れた回数」で割る。elapsedMs が一度も来ていないのに
  //   平均0ms と出すと「速い」という嘘になる(取れていない=不明が正しい)。
  const timedRebuilds = Math.max(0, Math.floor(Number(s.timedRebuilds) || 0));
  const avgMs = timedRebuilds > 0 ? Math.round((totalMs / timedRebuilds) * 10) / 10 : -1;

  if (rebuilds <= 0) {
    return {
      rebuilds: 0, slideRebuilds: 0, growRebuilds: 0, cellsBuilt: 0, slideCells: 0,
      maxCells: 0, avgMs: -1, maxMs: 0, lastAgoMs: -1,
      line: 'アイコングリッド ⚪ 未観測(まだ作り直していません)'
    };
  }

  // スライド由来が支配的なら、それが「増えていく動きではない」の正体。
  const slidePct = rebuilds > 0 ? Math.round((slideRebuilds / rebuilds) * 100) : 0;
  const verdict =
    slideRebuilds <= 0
      ? '積み上がりのみ(設計どおり)'
      : slidePct >= 50
        ? `スライド支配的(${slidePct}%)=上限超えで窓がずれ、毎回総入替になっています`
        : `スライド混在(${slidePct}%)`;

  return {
    rebuilds, slideRebuilds, growRebuilds, cellsBuilt, slideCells, maxCells,
    avgMs, maxMs, lastAgoMs,
    line:
      `アイコングリッド 作り直し${rebuilds}回(スライド${slideRebuilds}/増加${growRebuilds})` +
      ` / 累計${cellsBuilt}枚(うちスライド${slideCells}枚) / 最大${maxCells}枚` +
      (avgMs >= 0 ? ` / 平均${avgMs}ms・最大${maxMs}ms` : '') +
      ` — ${verdict}`
  };
}
