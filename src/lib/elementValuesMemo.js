// elementValuesMemo.js — 要素ごとに「前回書いたときの値の並び」を控え、全部同じなら書かずに済ませるための小さな台帳。
// v0.1.2227: 応援マスのアイコン(popup-entry の applyStoryGrowthIconAttributes)で使う。要素が消えれば控えも消える(WeakMap)。

/**
 * @template {object} K
 * @returns {{ same: (el: K, vals: readonly unknown[]) => boolean, set: (el: K, vals: unknown[]) => void }}
 */
export function createElementValuesMemo() {
  /** @type {WeakMap<K, readonly unknown[]>} */
  const memo = new WeakMap();
  return {
    same(el, vals) {
      const prev = memo.get(el);
      if (!prev || prev.length !== vals.length) return false;
      for (let i = 0; i < vals.length; i += 1) if (!Object.is(prev[i], vals[i])) return false;
      return true;
    },
    set(el, vals) { memo.set(el, vals); }
  };
}
