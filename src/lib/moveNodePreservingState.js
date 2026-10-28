/**
 * 【層】L1 DOM 小道具(chrome.* 非依存・テスト可能)
 * 【この箱に入るもの】要素を DOM の別の場所へ動かす手順(中の iframe を読み込み直させない)
 * 【この箱に入らないもの】どこへ動かすかの判断(content-entry.js の配置ロジック)
 * 【書けるstorageキー】なし
 *
 * moveNodePreservingState.js — v0.1.1820
 *
 * ■ なぜ要るか
 *   appendChild / insertAdjacentElement で iframe 入りの要素を動かすと、ブラウザは iframe を外して
 *   付け直す=中身(パネルの popup.html)が丸ごと読み込み直しになる(inlineHostMoveProbe.js の reloadCount)。
 *   E2E の実測: 視聴行が後から出来るとパネルが約1秒後に動き、その瞬間パネルが作り直されていた。
 *   Chrome 133+ の parent.moveBefore(node, ref) は同じ文書の中なら iframe の状態を保ったまま動かせる。
 * ■ 使えないとき
 *   moveBefore が無い/どちらかが文書に繋がっていない等で例外=従来の insertBefore で動かす(結果の位置は同じ)。
 */

/**
 * node を parent の ref の直前へ(ref=null なら末尾へ)動かす。
 * @param {any} parent
 * @param {any} node
 * @param {any} [ref]
 * @returns {'moved'|'inserted'} moved=状態を保って移動 / inserted=従来の付け直し
 */
export function moveNodePreservingState(parent, node, ref = null) {
  const r = ref ?? null;
  if (node && node.isConnected && parent && parent.isConnected && typeof parent.moveBefore === 'function') {
    try {
      parent.moveBefore(node, r);
      return 'moved';
    } catch {
      /* 別文書・未接続など=下の従来手順へ */
    }
  }
  parent.insertBefore(node, r);
  return 'inserted';
}

/**
 * anchor の直後へ動かす(insertAdjacentElement('afterend') の状態保持版)。
 * @param {any} anchor
 * @param {any} node
 * @returns {'moved'|'inserted'}
 */
export function moveNodeAfterPreservingState(anchor, node) {
  return moveNodePreservingState(anchor.parentNode, node, anchor.nextSibling);
}
