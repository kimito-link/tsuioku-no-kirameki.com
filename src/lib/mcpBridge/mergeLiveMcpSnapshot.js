/**
 * Canonical Snapshot のマージ（Deterministic + Monotonic Sequence）。
 *
 * 設計原則:
 * - 入力順に依存しない（同入力 → 同出力）
 * - seq が新しい方を base にする（古い世代で新しい値を上書きしない）
 * - watch.liveId が異なれば merge せず seq の新しい方を返す（live mismatch）
 * - gift field は「base に値がなければ other で補完」（depleted-fill 戦略）
 * - diag.mismatchReasons は和集合（重複排除）
 */

/**
 * @typedef {import('./schema.js').CanonicalLiveSnapshot} CanonicalLiveSnapshot
 */

/**
 * @param {CanonicalLiveSnapshot|null|undefined} a
 * @param {CanonicalLiveSnapshot|null|undefined} b
 * @returns {CanonicalLiveSnapshot|null}
 */
export function mergeLiveMcpSnapshot(a, b) {
  if (!a && !b) return null;
  if (!a) return /** @type {CanonicalLiveSnapshot} */ (b);
  if (!b) return /** @type {CanonicalLiveSnapshot} */ (a);

  const aSeq = Number(a.meta?.seq) || 0;
  const bSeq = Number(b.meta?.seq) || 0;

  // live mismatch: liveId が両方非空かつ不一致 → seq 新しい方を返す（merge せず）
  const aLid = String(a.watch?.liveId || '').trim();
  const bLid = String(b.watch?.liveId || '').trim();
  if (aLid && bLid && aLid !== bLid) {
    return aSeq >= bSeq ? a : b;
  }

  // base = seq 大きい方（同 seq なら a 優先 = 安定性）
  const base = aSeq >= bSeq ? a : b;
  const other = base === a ? b : a;

  /** @type {CanonicalLiveSnapshot} */
  const merged = {
    nlsMcpSnapshotVersion: base.nlsMcpSnapshotVersion,
    meta: { ...base.meta },
    watch: { ...base.watch },
    gift: { ...base.gift },
    diag: { mismatchReasons: [] }
  };

  // gift: base に値がない（または value=null）field を other で補完
  for (const [key, otherVal] of Object.entries(other.gift || {})) {
    if (!otherVal) continue;
    /** @type {Record<string, unknown>} */
    const giftBag = merged.gift;
    const baseVal = /** @type {{ value: unknown }|undefined} */ (giftBag[key]);
    if (!baseVal) {
      giftBag[key] = otherVal;
    } else if (baseVal.value === null || baseVal.value === undefined) {
      // base が値なしなら other 採用
      const otherCasted = /** @type {{ value: unknown }} */ (otherVal);
      if (otherCasted.value !== null && otherCasted.value !== undefined) {
        giftBag[key] = otherVal;
      }
    }
  }

  // diag.mismatchReasons の和集合（順序：base 先 → other 後の出現順、重複排除）
  /** @type {Set<string>} */
  const reasons = new Set();
  for (const r of base.diag?.mismatchReasons || []) reasons.add(String(r));
  for (const r of other.diag?.mismatchReasons || []) reasons.add(String(r));
  merged.diag.mismatchReasons = [...reasons];

  return merged;
}
