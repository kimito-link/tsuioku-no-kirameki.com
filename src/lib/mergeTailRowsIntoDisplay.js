/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】表示用のコメント行(本体/サマリ)に「未畳み込みのテール」を足すとき、重なる行を畳む処理
 * 【この箱に入らないもの】storage の読み書き・DOM・件数の単調化ゲート
 * 【書けるstorageキー】なし
 * 【正本宣言】テールを表示用の行へ足す重複除去はこのファイルのみ(popup・書き出しの全連結箇所がここを通る)
 *
 * mergeTailRowsIntoDisplay.js — `rows.concat(tail)` の置き換え(v0.1.1678)。
 *
 * ■ なぜ要るか(2026-10-19・e2e snapshot-fetch-hang-resilient で再現)
 *   popup の軽い読みは本体配列を読まないので、cold open の表示行は「csummary.recent(直近N行)」になり、
 *   そこへ ctail の行を足していた。recent と tail は同じ直近コメントを指すので、重複除去なしで連結すると
 *   表示行が二重(25+25=50)になる。記録件数カードは単調増加ゲートを通るため、一度出た過大値が居座る。
 *   畳み込み(テール→本体)の競合でも、本体の末尾とテールが重なりうる(書き出し系も同じ)。
 *
 * ■ 規則(新しい判定は作らない=既存の正本を再利用)
 *   - キー: storedCommentDedupeKey(commentNo があれば no:<n>、無ければ 同じ人×同じ文言×10分バケット)
 *   - 重複は捨てずに mergeStoredCommentDedupeVariants で統合する(summary の薄い行に tail の userId 等を補う)
 *   - 重なりは base の【末尾】にしか起きない(畳み込み直後はテールが末尾へ移る・summary は小さい)ので、
 *     base の末尾 tail.length*2+64 件だけ索引にする=数万件の配信でも毎回 O(N) にしない
 *   - tail 同士の重複には触れない(従来の挙動の範囲を広げない)
 *
 * @module mergeTailRowsIntoDisplay
 */

import { storedCommentDedupeKey } from './storedCommentDedupeKey.js';
import { mergeStoredCommentDedupeVariants } from './storedCommentDedupeMerge.js';

/** base の末尾をどれだけ見るか: tail の2倍+余裕。 */
const LOOKBACK_EXTRA = 64;

/**
 * @param {unknown} base 本体(またはサマリ由来)の表示行
 * @param {unknown} tail テール(未畳み込みの新着)の表示行
 * @param {{ liveId?: string, keyOf?: (row: any) => string }} [opts]
 *   liveId: tail の行に liveId が無いとき(書き出し側の生の行)に、キー計算だけ補う。keyOf はテスト用の差し替え。
 * @returns {any[]} 新しい配列(引数は変更しない)。tail が空なら base をそのまま返す。
 */
export function mergeTailRowsIntoDisplay(base, tail, opts) {
  const baseRows = Array.isArray(base) ? base : [];
  const tailRows = Array.isArray(tail) ? tail : [];
  if (tailRows.length === 0) return baseRows;
  if (baseRows.length === 0) return tailRows.slice();

  const lid = String((opts && opts.liveId) || '').trim().toLowerCase();
  const keyOf =
    opts && typeof opts.keyOf === 'function'
      ? opts.keyOf
      : /** @param {any} row */ (row) =>
          storedCommentDedupeKey(row && typeof row === 'object' && !row.liveId && lid ? { ...row, liveId: lid } : row);

  const from = Math.max(0, baseRows.length - (tailRows.length * 2 + LOOKBACK_EXTRA));
  /** @type {Map<string, number>} */
  const indexByKey = new Map();
  for (let i = from; i < baseRows.length; i += 1) {
    const r = baseRows[i];
    if (!r || typeof r !== 'object') continue;
    indexByKey.set(keyOf(r), i);
  }

  const out = baseRows.slice();
  for (const row of tailRows) {
    if (!row || typeof row !== 'object') {
      out.push(row);
      continue;
    }
    const hit = indexByKey.get(keyOf(row));
    if (hit == null) {
      out.push(row);
      continue;
    }
    out[hit] = /** @type {any} */ (
      mergeStoredCommentDedupeVariants(
        /** @type {Record<string, unknown>} */ (out[hit]),
        /** @type {Record<string, unknown>} */ (row)
      )
    );
  }
  return out;
}
