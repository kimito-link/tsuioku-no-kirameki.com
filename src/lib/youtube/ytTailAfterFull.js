/**
 * v0.1.1983: 全件を一度渡したあとのテール(新着の差分)を、短くして渡す。
 *
 * 横の欄(popup)は、全件(nls_comments_)を読んだあと、3秒ごとにテール(nls_ctail_)で新着を足す。
 * YouTube 系の入口(shim)は記録の全部を持っているので、テールとして全件を渡していた。
 * 1981 で「何も増えていないとき」だけ最新 max 件にしたが、生放送の途中は毎回増えるので毎回全件(8万行)を渡し、
 * 軽いはずの見回り(3秒ごと)が 8万行を処理していた(手元の計測・CPU 4倍遅く・1秒に5行増える条件:
 * 150秒のうち 32秒が軽い見回りのレーン描き)。
 *
 * ここでは、最後に全件として渡した配列に無い行(=そのあと増えた行)と、最新 max 件を渡す。
 * 増えた行が max 件を超えるときは、今までどおり全件を渡す(取りこぼさない)。
 */

/** @type {WeakMap<any[], Set<string>>} 全件として渡した配列 → その id の集まり(配列ごとに1回だけ作る) */
const idSetCache = new WeakMap();

/** @param {any[]} arr */
function idSetOf(arr) {
  let s = idSetCache.get(arr);
  if (!s) {
    s = new Set();
    for (const e of arr) s.add(String(e?.id ?? ''));
    idSetCache.set(arr, s);
  }
  return s;
}

/**
 * @template T
 * @param {T[]} arr いま組み上がっている全件(古い順)
 * @param {T[] | undefined | null} lastFull この画面に最後に全件として渡した配列(無ければ undefined)
 * @param {number} max テールの大きさ(最新この件数は必ず入れる)
 * @returns {{ rows: T[], short: boolean }} short=true は短くして渡した
 */
export function ytTailAfterFull(arr, lastFull, max) {
  if (!Array.isArray(arr) || !Array.isArray(lastFull) || !(max > 0) || arr.length <= max) return { rows: arr, short: false };
  const head = arr.length - max;
  if (lastFull === arr) return { rows: arr.slice(head), short: true };
  const known = idSetOf(lastFull);
  /** @type {T[]} */
  const extras = [];
  for (let i = 0; i < head; i++) {
    const e = /** @type {any} */ (arr[i]);
    if (known.has(String(e?.id ?? ''))) continue;
    extras.push(arr[i]);
    if (extras.length > max) return { rows: arr, short: false };
  }
  return { rows: extras.length ? extras.concat(arr.slice(head)) : arr.slice(head), short: true };
}
