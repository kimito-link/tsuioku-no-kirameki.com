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
 *   lastAtMs: number,
 *   identityCalls: number,
 *   identitySwaps: number,
 *   userKeyChanges: number,
 *   maxIdentitySwapsInOnePatch: number,
 *   maxUserKeyChangesInOnePatch: number,
 *   unknownCells: number,
 *   lastIdentityChangeAtMs: number,
 *   prevIds: string[],
 *   prevKeys: string[]
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
    lastAtMs: 0,
    identityCalls: 0,
    identitySwaps: 0,
    userKeyChanges: 0,
    maxIdentitySwapsInOnePatch: 0,
    maxUserKeyChangesInOnePatch: 0,
    unknownCells: 0,
    lastIdentityChangeAtMs: 0,
    prevIds: [],
    prevKeys: []
  };
}

/** userId が取れていないマスの利用者キー(userRooms.js の UNKNOWN_USER_KEY と同じ値。依存を増やさないため値で持つ)。 */
const UNKNOWN_KEY = '__unknown__';

/**
 * 各マスの「どのコメントか(ids)」と「誰として数えたか(keys)」を前回と比べて数える。
 *
 * ★窓オフセットだけを見る noteStoryGrowthPatch は、窓が常に 0 固定の今は何も検出できない(2026-10-14 の調査)。
 *   実際にマスの中身が変わる経路は2つで、ここで分けて数える:
 *   (a) 同じマスに【別のコメント】が入った(identitySwaps): 供給経路ごとに entries の中身が違う・配信者行の出入りで以降が1つずつずれる等
 *   (b) 【同じコメント】なのに利用者キーが変わった(userKeyChanges): userId が後から付いた(UNKNOWN→実ID)等
 *   どちらもマスが見た目で入れ替わる(ちらつき)原因になる。
 * 受け取るのは呼び出し側が組んだ文字列配列だけ。配列は state に控える(最大でマス数ぶん)。
 *
 * @param {StoryGrowthCellSwapState|null|undefined} state
 * @param {{ ids: ReadonlyArray<unknown>, keys: ReadonlyArray<unknown>, atMs?: number }} ev
 */
export function noteStoryGrowthCellIdentities(state, ev) {
  if (!state || typeof state !== 'object') return;
  const ids = Array.isArray(ev?.ids) ? ev.ids.map((v) => String(v ?? '')) : [];
  const keys = Array.isArray(ev?.keys) ? ev.keys.map((v) => String(v ?? '')) : [];
  const atMs = Number(ev?.atMs) || 0;
  const prevIds = Array.isArray(state.prevIds) ? state.prevIds : [];
  const prevKeys = Array.isArray(state.prevKeys) ? state.prevKeys : [];
  const common = Math.min(prevIds.length, ids.length);
  let swaps = 0;
  let keyChanges = 0;
  for (let i = 0; i < common; i += 1) {
    if (!prevIds[i] || !ids[i]) continue;
    if (ids[i] !== prevIds[i]) swaps += 1;
    else if ((prevKeys[i] || '') !== (keys[i] || '')) keyChanges += 1;
  }
  let unknown = 0;
  for (let i = 0; i < keys.length; i += 1) if (keys[i] === UNKNOWN_KEY) unknown += 1;
  state.identityCalls += 1;
  state.identitySwaps += swaps;
  state.userKeyChanges += keyChanges;
  if (swaps > state.maxIdentitySwapsInOnePatch) state.maxIdentitySwapsInOnePatch = swaps;
  if (keyChanges > state.maxUserKeyChangesInOnePatch) state.maxUserKeyChangesInOnePatch = keyChanges;
  if ((swaps > 0 || keyChanges > 0) && atMs > 0) state.lastIdentityChangeAtMs = atMs;
  state.unknownCells = unknown;
  state.prevIds = ids;
  state.prevKeys = keys;
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
  return `グリッド中身更新 ${patches}回 / 書換${cellsPatched}マス — ${verdict}${formatIdentitySuffix(state)}`;
}

/**
 * @param {StoryGrowthCellSwapState|null|undefined} state
 * @returns {string} マスの中身の指紋の要約(未観測なら空)
 */
function formatIdentitySuffix(state) {
  const calls = Math.max(0, Math.floor(Number(state?.identityCalls) || 0));
  if (calls <= 0) return '';
  const swaps = Math.max(0, Math.floor(Number(state?.identitySwaps) || 0));
  const keyChanges = Math.max(0, Math.floor(Number(state?.userKeyChanges) || 0));
  const unknown = Math.max(0, Math.floor(Number(state?.unknownCells) || 0));
  const maxSwaps = Math.max(0, Math.floor(Number(state?.maxIdentitySwapsInOnePatch) || 0));
  const maxKeys = Math.max(0, Math.floor(Number(state?.maxUserKeyChangesInOnePatch) || 0));
  const bad = swaps > 0 || keyChanges > 0;
  const head = bad ? ' / ★マスの中身が変わっています' : ' / マスの中身は安定';
  return `${head}(別コメントへ入替${swaps}マス(最大${maxSwaps}/回)・同じコメントでIDが後から付いた${keyChanges}マス(最大${maxKeys}/回)・ID未取得${unknown}マス・観測${calls}回)`;
}
