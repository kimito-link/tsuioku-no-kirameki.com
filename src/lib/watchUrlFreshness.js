/**
 * 「最後に視聴した URL（nls_last_watch_url）」フォールバックの鮮度判定。
 *
 * 背景（status「視聴中の配信」に死んだタブの記録が居座る問題）:
 *   status-entry.js の enumerateActiveLives() は、実 watch タブ（経路1）も
 *   fastDiag.lives（経路2）も空のとき、フォールバックで nls_last_watch_url
 *   （時刻なしの URL 文字列）から lv を【どれだけ古くても無条件に1件】返していた。
 *   これにより、watch タブをどこにも開いていないのに過去に見た配信が「視聴中」と
 *   偽表示され続けた（数値が全て「—」の情報価値ゼロのカードが居座る）。
 *
 *   一方 nls_panel_summary_<lv> は content が記録中およそ 2 秒ごとに updatedAt
 *   （epoch ms）付きで更新し、watch タブが死ぬと更新が止まる。よってこの updatedAt
 *   の鮮度を見れば「いま本当に視聴中か」を安く判定できる。
 *
 *   このモジュールは「last_watch_url 由来の lv を視聴中として採用してよいか」を、
 *   panel_summary.updatedAt と現在時刻だけから決める副作用なしの純関数を提供する。
 *
 * @module watchUrlFreshness
 */

/**
 * last_watch_url フォールバックの鮮度しきい値（ミリ秒）。
 * panel_summary は content が約 2 秒ごとに書くので、3 分はタブ生存時に十分なマージン。
 * これより古ければ「死んだタブの記録」とみなして視聴中に出さない。
 */
export const LAST_WATCH_URL_FRESH_MS = 3 * 60 * 1000;

/**
 * 有限な非負の数値なら返す。それ以外は null。
 * @param {unknown} value
 * @returns {number|null}
 */
function finiteNonNegativeOrNull(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * last_watch_url 由来の lv を「視聴中」として採用してよいかを判定する純関数。
 *
 * panel_summary が読めない（過去にこの lv のサマリが一度も無い・破損・別 lv 等で
 * updatedAt が取れない）場合は false を返す＝採用しない。これは「サマリが無い＝
 * content が記録した形跡が無い＝視聴中とは言えない」という安全側の判断。
 *
 * @param {number|null|undefined} updatedAt  panel_summary.updatedAt（epoch ms）
 * @param {number} nowMs  現在時刻（epoch ms）
 * @param {number} [maxAgeMs]  鮮度しきい値（既定 LAST_WATCH_URL_FRESH_MS）
 * @returns {boolean}  しきい値以内に更新されていれば true
 */
export function isLastWatchUrlFresh(updatedAt, nowMs, maxAgeMs = LAST_WATCH_URL_FRESH_MS) {
  const updated = finiteNonNegativeOrNull(updatedAt);
  if (updated === null) return false;
  // nowMs は呼び出し側が Date.now() を渡す前提。null/undefined（Number 化で 0 になる）を
  // 弾いてから有限性を見る（壊れた now で誤って「新鮮」と判定しないため）。
  if (nowMs === null || nowMs === undefined) return false;
  const now = finiteNonNegativeOrNull(nowMs);
  if (now === null) return false;
  const threshold =
    Number.isFinite(maxAgeMs) && maxAgeMs > 0 ? maxAgeMs : LAST_WATCH_URL_FRESH_MS;
  const age = now - updated;
  // 未来の updatedAt（時計ずれ）は古くないので採用、age が threshold 以内なら採用。
  return age <= threshold;
}
