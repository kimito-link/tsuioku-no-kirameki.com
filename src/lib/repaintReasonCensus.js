// repaintReasonCensus.js — 「描き直しが何回・どの理由で起きたか」を数える純関数群。
//
// ───────────────────────────────────────────────────────────────────────────
// なぜ要るか(2026-08-04・docs/handoff/ROOT-CAUSE-CLAIM-RULE.md 第4条):
//   実測で 1コメントあたり77回の描き直しが起きていた(3分で描画+2013回・コメント+26件)。
//   ユーザーには「ちかちか」として見えていた。
//
//   ★しかし当時、原因を特定できなかった。理由は【総数しか数えていなかった】から。
//     paintCount=2517 は分かっても、その2517回を誰が呼んだのかが分からない。
//     refresh の引き金は popup-entry.js だけで36箇所ある。
//     総数だけでは、36箇所のうちどれが暴走しているか永久に分からない。
//
//   計器の教訓([[instrument-must-name-the-cause-2026-08-01]])は
//   「症状でなく原因を出す」。総数は症状であり、【理由別の内訳】が原因である。
//
// 設計方針:
//   ・理由(reason)ごとに件数を持つ。どれが突出しているかが一目で分かる。
//   ・呼び出し元は文字列1つ渡すだけ。hot path に負荷を足さない(加算のみ)。
//   ・「1コメントあたり何回か」を理由別に出す。絶対数は配信規模で変わるため。
// ───────────────────────────────────────────────────────────────────────────

/** @typedef {Record<string, number>} RepaintReasonCounts */

/**
 * 理由別カウントに1件加算した新しいオブジェクトを返す(純関数)。
 *
 * @param {RepaintReasonCounts|null|undefined} counts
 * @param {unknown} reason 呼び出し理由(例 'instant_push' / 'storage_changed' / 'interval')
 * @returns {RepaintReasonCounts}
 */
export function addRepaintReason(counts, reason) {
  const base = counts && typeof counts === 'object' && !Array.isArray(counts) ? counts : {};
  const key = String(reason || '').trim() || 'unknown';
  const prev = Number(base[key]);
  const next = Number.isFinite(prev) && prev > 0 ? Math.floor(prev) : 0;
  return { ...base, [key]: next + 1 };
}

/**
 * 理由別カウントの合計を返す。
 *
 * @param {RepaintReasonCounts|null|undefined} counts
 * @returns {number}
 */
export function totalRepaints(counts) {
  const base = counts && typeof counts === 'object' && !Array.isArray(counts) ? counts : {};
  let total = 0;
  for (const v of Object.values(base)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) total += Math.floor(n);
  }
  return total;
}

/**
 * 突出している理由(=暴走の犯人)を1つ名指しする。
 *
 * 「突出」の定義: 最多の理由が全体の半分以上を占め、かつ2位の2倍以上あること。
 *   単に最多なだけでは犯人と断定できない(均等に分かれていれば構造の問題であり、
 *   特定の1箇所を直しても効かない)。断定できないときは null を返す=
 *   「判定不能」を正しく出す(ROOT-CAUSE-CLAIM-RULE 第4条)。
 *
 * @param {RepaintReasonCounts|null|undefined} counts
 * @returns {{ reason: string, count: number, share: number }|null}
 */
export function dominantRepaintReason(counts) {
  const base = counts && typeof counts === 'object' && !Array.isArray(counts) ? counts : {};
  /** @type {Array<[string, number]>} */
  const rows = [];
  for (const [k, v] of Object.entries(base)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) rows.push([k, Math.floor(n)]);
  }
  if (rows.length === 0) return null;
  rows.sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, r) => s + r[1], 0);
  if (total <= 0) return null;
  const [topKey, topCount] = rows[0];
  const share = topCount / total;
  const second = rows.length > 1 ? rows[1][1] : 0;
  // 半分未満なら「突出」と言えない。2位の2倍未満でも同様(拮抗している)。
  if (share < 0.5) return null;
  if (second > 0 && topCount < second * 2) return null;
  return { reason: topKey, count: topCount, share };
}

/**
 * 速報に出す1行を組み立てる。0件なら空文字(静かな計器)。
 *
 * @param {RepaintReasonCounts|null|undefined} counts
 * @param {unknown} commentCount 同期間のコメント件数(1件あたりの回数を出すため)
 * @returns {string}
 */
export function formatRepaintReasonLine(counts, commentCount) {
  const total = totalRepaints(counts);
  if (total <= 0) return '';
  const base = counts && typeof counts === 'object' && !Array.isArray(counts) ? counts : {};
  /** @type {Array<[string, number]>} */
  const rows = Object.entries(base)
    .map(([k, v]) => /** @type {[string, number]} */ ([k, Math.floor(Number(v) || 0)]))
    .filter((r) => r[1] > 0)
    .sort((a, b) => b[1] - a[1]);
  const parts = rows.map(([k, n]) => `${k}${n}`);
  const comments = Number(commentCount);
  let perComment = '';
  if (Number.isFinite(comments) && comments >= 20) {
    const ratio = total / comments;
    perComment = ` / 1コメントあたり${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}回`;
  }
  const dom = dominantRepaintReason(counts);
  const blame = dom
    ? ` ← ${dom.reason}が${Math.round(dom.share * 100)}%を占める(ここが原因)`
    : '';
  return `描き直しの内訳(計${total}回): ${parts.join(' / ')}${perComment}${blame}`;
}
