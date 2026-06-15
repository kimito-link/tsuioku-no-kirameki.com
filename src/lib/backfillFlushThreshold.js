/**
 * バックフィル（過去ログ一括取り込み）の persist フラッシュ閾値を、
 * 「現在の保存済みコメント件数」に応じて動的に引き上げる純関数。
 *
 * なぜ必要か:
 *   flush 1 回ごとに巨大コメント配列を read → merge → 全件パス（profile 適用 /
 *   synthetic avatar 除去 / uid 集計）→ write する。この同期コストは保存済み件数 N に
 *   比例（O(N)）する。固定行数（例: 800 行）で flush すると、N が大きい放送ほど
 *   flush 回数も増え、総コストが O(N^2) に近づき watch ページが「応答しません」になる。
 *
 *   保存済み件数に比例して閾値を上げる（=溜めてからまとめて書く）ことで、full-array の
 *   read-merge-write 回数を放送サイズに依存しない定数オーダーへ近づけ、総コストを
 *   実質 O(N log N) 程度まで落とす。メモリは max で頭打ちにして上限を保証する。
 *
 *   記録の正確性は呼び出し側 mergeNewComments の dedupe が担保するため、まとめても
 *   重複・欠落は起きない（フラッシュ間隔を変えるだけ）。
 */

/** 最小フラッシュ閾値（小規模放送は従来どおり 800 行で素早く反映）。 */
export const BACKFILL_FLUSH_BASE_ROWS = 800;

/** 保存済み件数に対する成長係数（保存 N 件のとき N*係数 行たまるまで待つ）。 */
export const BACKFILL_FLUSH_GROWTH = 0.5;

/**
 * バッファに溜める上限（これを超えたら必ず flush）。
 *
 * v0.1.654「一気に取れない」根治: 旧 8000 は O(N²) 緩和のため大きく取っていたが、
 *   crawl が高速で大量取得した分(最大 8000 行)が pending バッファに溜まったまま、
 *   storage へ書く前に watch タブ離脱 / visibility 変化で content script が止まると
 *   一括で失われていた(実機 lv350631410: crawl rows=9297 取り切ったのに chunk=4951 で
 *   53% 停止・約 4300 行が pending のまま消失=「一気に取れない」の真因)。上限を 2000 に
 *   下げ、中断時の最大損失を 8000→2000 行に圧縮する。flush 回数は増えるが、保存件数比例の
 *   成長係数(growth)は維持しているので O(N²) には戻らない(大規模放送でも growth 側が支配的)。
 */
export const BACKFILL_FLUSH_MAX_ROWS = 2000;

/**
 * 保存済みコメント件数から、次に flush するまでの最小バッファ行数を返す。
 *
 * @param {number} storedCount 現在 storage に保存済みのコメント件数
 * @param {{ base?: number, growth?: number, max?: number }} [opts]
 * @returns {number} このバッファ行数以上たまったら flush してよい（>=1）
 */
export function computeBackfillFlushThreshold(storedCount, opts = {}) {
  const base =
    Number.isFinite(Number(opts.base)) && Number(opts.base) > 0
      ? Math.floor(Number(opts.base))
      : BACKFILL_FLUSH_BASE_ROWS;
  const growth =
    Number.isFinite(Number(opts.growth)) && Number(opts.growth) >= 0
      ? Number(opts.growth)
      : BACKFILL_FLUSH_GROWTH;
  const max =
    Number.isFinite(Number(opts.max)) && Number(opts.max) > 0
      ? Math.floor(Number(opts.max))
      : BACKFILL_FLUSH_MAX_ROWS;

  const n = Math.max(0, Math.floor(Number(storedCount) || 0));
  const grown = Math.floor(n * growth);
  // base 以上・max 以下にクランプ。max は base 以上であることを保証する。
  const upper = Math.max(base, max);
  return Math.min(upper, Math.max(base, grown));
}
