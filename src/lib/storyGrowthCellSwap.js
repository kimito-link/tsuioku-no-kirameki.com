/**
 * アイコングリッドの「既存マスの中身がすり替わった回数」を観測する純関数(v0.1.1215)。
 *
 * ユーザー報告(2026-08-01)「積み上げ式にならず、もともと記録されたアイコンがちらちら変わる」。
 *
 * v0.1.1208 の storyGrowthChurn は `rebuildStoryGrowth`(全消し再構築)だけを数えており、
 * 実測は「作り直し1回・スライド0」=「積み上がりのみ(設計どおり)」と出た。
 * しかし報告された現象はそこではなく、もう一つの経路にあった:
 *
 *   patchStoryGrowthIconsFromSource (popup-entry.js)
 *     = innerHTML を捨てずに【各マスの中身だけを今のデータで上書き】する経路。
 *       窓(sourceOffset)がずれると i 番目のマスに別人が入るため、
 *       既に置かれていたアイコンが次々と別人へ書き換わる=「ちらちら」。
 *
 * つまり DOM の枚数は変わらないので churn 計器には映らないが、**中身は総入替**になりうる。
 * 「積み上がる」という設計意図に反しているのはこちら。
 *
 * ★このモジュールは数えるだけ。描画にもタイミングにも干渉しない。
 *   前回(v0.1.1201)ホットパスに走査を持ち込んで拡張全体を重くした反省から、
 *   受け取るのは既に呼び出し側が持っている値だけにする(配列を舐めない)。
 *
 * @module storyGrowthCellSwap
 */

/**
 * @typedef {{
 *   patches: number,
 *   cellsPatched: number,
 *   swaps: number,
 *   maxSwapsInOnePatch: number,
 *   lastOffset: number,
 *   lastAtMs: number
 * }} StoryGrowthCellSwapState
 */

/** @returns {StoryGrowthCellSwapState} */
export function createStoryGrowthCellSwapState() {
  return {
    patches: 0,
    cellsPatched: 0,
    swaps: 0,
    maxSwapsInOnePatch: 0,
    lastOffset: -1,
    lastAtMs: 0
  };
}

/**
 * 1回の patch を記録する。
 *
 * @param {StoryGrowthCellSwapState|null|undefined} state
 * @param {{ cells: number, offset: number, atMs: number }} ev
 *   cells: 書き換えたマス数 / offset: 窓の先頭位置(sourceOffset)
 */
export function noteStoryGrowthPatch(state, ev) {
  if (!state || typeof state !== 'object') return;
  const cells = Math.max(0, Math.floor(Number(ev?.cells) || 0));
  const offset = Math.floor(Number(ev?.offset));
  const atMs = Number(ev?.atMs) || 0;

  state.patches += 1;
  state.cellsPatched += cells;
  if (atMs > 0) state.lastAtMs = atMs;

  // 窓がずれた patch は、ずれた分だけ「別人が入ったマス」が生じる。
  //   例: offset が 3 進めば、全マスが3つぶん前へシフト=実質すべての中身が入れ替わる。
  //   ずれ幅が cells 以上なら全マス総入替とみなす。
  if (Number.isFinite(offset) && offset >= 0) {
    if (state.lastOffset >= 0 && offset !== state.lastOffset) {
      const shifted = Math.abs(offset - state.lastOffset);
      const swapped = Math.min(cells, shifted);
      state.swaps += swapped;
      if (swapped > state.maxSwapsInOnePatch) state.maxSwapsInOnePatch = swapped;
    }
    state.lastOffset = offset;
  }
}

/**
 * 状態速報の1行を組み立てる。patch が無ければ空文字(静かな計器)。
 *
 * @param {StoryGrowthCellSwapState|null|undefined} state
 * @returns {string}
 */
export function formatStoryGrowthCellSwapLine(state) {
  const patches = Math.max(0, Math.floor(Number(state?.patches) || 0));
  if (patches <= 0) return '';
  const cellsPatched = Math.max(0, Math.floor(Number(state?.cellsPatched) || 0));
  const swaps = Math.max(0, Math.floor(Number(state?.swaps) || 0));
  const maxSwaps = Math.max(0, Math.floor(Number(state?.maxSwapsInOnePatch) || 0));
  // 「ちらちら」の正体はここ。中身のすり替えが起きているかを一目で分かるようにする。
  const verdict =
    swaps <= 0
      ? '中身の入替なし(積み上がり)'
      : `中身の入替${swaps}マス=既存アイコンが別人にすり替わっています(最大${maxSwaps}マス/回)`;
  return `グリッド中身更新 ${patches}回 / 書換${cellsPatched}マス — ${verdict}`;
}
