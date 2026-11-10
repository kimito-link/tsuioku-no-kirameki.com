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
 * @returns {any[]} 新しい配列(引数は変更しない)。tail が空、または足す行も変わる行も無いなら base をそのまま返す。
 *
 * ■ v0.1.2023(大きな記録の描き直し): 全件が読めたあとも、テール(直近2,000行)は読み直しのたびに【新しい物】で届く。
 *   中身が本体と同じでも、統合が毎回 新しい行・新しい配列を作っていたので、下流の「同じ行なら数え直さない」記憶が外れ、
 *   8万行の配信で読み直しのたびに表示用の行と人ごとの集計を全部作り直していた(手元の計測: 外れ4回中4回がこれ)。
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
  let touched = false;
  for (const row of tailRows) {
    if (!row || typeof row !== 'object') {
      out.push(row);
      touched = true;
      continue;
    }
    const hit = indexByKey.get(keyOf(row));
    if (hit == null) {
      out.push(row);
      touched = true;
      continue;
    }
    const prev = /** @type {Record<string, unknown>} */ (out[hit]);
    const merged = mergeStoredCommentDedupeVariants(prev, /** @type {Record<string, unknown>} */ (row));
    // ★v0.1.2023: 統合しても中身が変わらない行は、元の行(同じ物)のまま置く。
    if (sameRowFields(prev, merged)) continue;
    out[hit] = /** @type {any} */ (merged);
    touched = true;
  }
  // ★v0.1.2023: 何も足さず何も変わらなかったら base そのものを返す(中身は同じ。下流の「同じ配列なら作り直さない」記憶を外さない)。
  return touched ? out : baseRows;
}

/**
 * 統合後の行が元の行と同じ中身か(統合は元の行の写しに数項目を上書きするだけなので、項目ごとの === で足りる)。
 * @param {Record<string, unknown>} prev
 * @param {Record<string, unknown>} merged
 */
function sameRowFields(prev, merged) {
  let n = 0;
  for (const k in merged) {
    if (merged[k] !== prev[k] || !(k in prev)) return false;
    n += 1;
  }
  return n === Object.keys(prev).length;
}
