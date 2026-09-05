/**
 * 【層】L0 判定層(依存ゼロ・chrome.* 非依存)
 * 【この箱に入るもの】OS の「視差効果を減らす」設定を読むだけの1関数
 * 【この箱に入らないもの】fetch / storage / chrome.*(import も禁止)
 * 【書けるstorageキー】なし
 * 【正本宣言】prefers-reduced-motion の判定はこのファイルのみ
 *
 * ★なぜ切り出したか(2026-08-12・v0.1.1340)
 *   同じ判定が実コード内に【4箇所】散らばっていた:
 *     popup-entry.js:2116 / :5958 / :18324、content-entry.js:3581
 *   しかも書き方が微妙に違う(`window.matchMedia?.` と素の `matchMedia`)。
 *   ＝仕様が変わったとき直し漏れる構造。1つに寄せる。
 *   併せて popup-entry.js の max-lines 対策にもなる(22,119行の上限に張り付いている)。
 *
 * ★安全側に倒す: matchMedia が無い/例外を投げる環境では false(=演出を止めない)。
 *   ここで true を返すと、判定できない環境で一律にアニメが消える。
 *
 * @module prefersReducedMotion
 */

/**
 * OS が「視差効果を減らす」設定になっているか。
 *
 * @returns {boolean} 減らす設定なら true。判定不能なら false(安全側)
 */
export function prefersReducedMotion() {
  try {
    const mm = typeof globalThis !== 'undefined' ? globalThis.matchMedia : undefined;
    if (typeof mm !== 'function') return false;
    return Boolean(mm.call(globalThis, '(prefers-reduced-motion: reduce)')?.matches);
  } catch {
    return false;
  }
}
