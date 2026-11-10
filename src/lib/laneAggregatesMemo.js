/**
 * 応援マスの元(人ごとの集計)を、同じ記録に対して何度も数え直さないための控え(v0.1.2007)。
 *
 * 背景(手元の計測・81,110行・約6,500人・CPU 4倍遅く): 1回の読み直しの中で描画が2〜3回続き、
 *   そのたびに 8万行を人ごとに数え直していた(60秒で約2.2秒・描画1回の中でいちばん重い所)。
 *   記録の行が前と全部同じ物(同じ長さ・同じ順・1行ずつ同じ物。配列そのものは描画のたびに作り直される)で、配信と配信者の情報も同じなら、
 *   数え直しても同じ結果なので前の結果を返す。
 *
 * ふつうの大きさの配信(minRows 未満)では控えを使わない(今までと同じ)。
 */

/**
 * 2つの配列が、同じ長さで同じ行(同じ物)を同じ順に持っているか。8万行でも1ms ほど。
 * @param {readonly unknown[]} a
 * @param {readonly unknown[]} b
 * @returns {boolean}
 */
function sameRowObjects(a, b) {
  if (a.length !== b.length) return false;
  for (let i = a.length - 1; i >= 0; i--) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * @template T
 * @param {{ compute: (rows: readonly unknown[], liveId: string, opts: { broadcasterUid?: string, broadcasterIconUrl?: string, requireText?: boolean }) => T, minRows: number }} deps
 */
export function createLaneAggregatesMemo(deps) {
  const minRows = Math.max(0, Number(deps.minRows) || 0);
  /** @type {{ rows: readonly unknown[], sig: string, out: T } | null} 行は写しで持つ(元の配列があとで書き換わっても比べられるように) */
  let last = null;
  const diag = { hits: 0, misses: 0, bypassed: 0, missBySig: 0, missByLen: 0, missByRow: 0 };
  return {
    diag,
    /**
     * @param {readonly unknown[]} rows
     * @param {string} liveId
     * @param {{ broadcasterUid?: string, broadcasterIconUrl?: string, requireText?: boolean }} opts
     * @returns {T}
     */
    get(rows, liveId, opts) {
      const list = Array.isArray(rows) ? rows : [];
      if (list.length < minRows) {
        diag.bypassed += 1;
        last = null;
        return deps.compute(list, liveId, opts);
      }
      const sig = `${String(liveId || '')}\u0000${String(opts?.broadcasterUid ?? '')}\u0000${String(opts?.broadcasterIconUrl ?? '')}\u0000${opts?.requireText === true ? 1 : 0}`;
      if (last && last.sig === sig && sameRowObjects(last.rows, list)) {
        diag.hits += 1;
        return last.out;
      }
      diag.misses += 1;
      // v0.1.2023 計器: 何が違って数え直したか(配信・配信者の情報 / 行数 / 行そのもの)
      if (last) {
        if (last.sig !== sig) diag.missBySig += 1;
        else if (last.rows.length !== list.length) diag.missByLen += 1;
        else diag.missByRow += 1;
      }
      const out = deps.compute(list, liveId, opts);
      last = { rows: list.slice(), sig, out };
      return out;
    },
    reset() {
      last = null;
    }
  };
}
