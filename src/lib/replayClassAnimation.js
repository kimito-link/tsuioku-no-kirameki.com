/**
 * v0.1.2223: CSS の一発アニメ(クラスを付けると1回動く)を、レイアウトを強制せずに鳴らす。
 *
 * 以前は「クラスを外す → `void el.offsetWidth` → 付け直す」で毎回アニメを再始動していた。
 * offsetWidth を読むと、それまでに書いた横の欄じゅうの変更をその場で計算し直す(強制レイアウト)。
 * 遅い PC の実測(4倍遅い CPU・8コメ/秒)では、コメントごとの描画の中でこれが一番重かった。
 *
 * 決まり:
 *   ・クラスが付いていなければ付けるだけ(付いた瞬間にアニメは最初から動く)。
 *   ・同じクラスがまだ付いている(=前のアニメの最中。外す役目は呼び出し側の既存の後始末タイマー)なら、
 *     付け直さずそのまま動かし続ける。コメントが速いときに毎回やり直さないので見た目も落ち着く。
 *   ・others に挙げた別のクラスは外す(段階の違うアニメへの切り替えはクラス名が変わるので再始動不要)。
 *
 * @param {Element|null|undefined} el
 * @param {string} cls
 * @param {readonly string[]} [others]
 * @returns {boolean} 新しく鳴らしたら true、前のアニメを続けたら false
 */
export function replayClassAnimation(el, cls, others = []) {
  if (!el || !el.classList || !cls) return false;
  for (const c of others) if (c !== cls && el.classList.contains(c)) el.classList.remove(c);
  if (el.classList.contains(cls)) return false;
  el.classList.add(cls);
  return true;
}
