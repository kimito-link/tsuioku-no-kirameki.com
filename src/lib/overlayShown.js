/**
 * overlayShown.js — ローディング重ね(キャラ重ね)の表示/非表示を、値が【違うときだけ】DOM に書く(2026-10-20)。
 *
 * 背景: ちらつき計(状態速報)で、件数カード3つ(#liveStatCard{Comments,Concurrent,Visitors}Load)が、同じ値のまま
 *   4分で約6,500回(約27回/秒)書き直されていた。syncLiveStatThreeCardsCharLoadingOverlays が refresh・描画のたびに
 *   `el.hidden = !on; el.setAttribute('aria-hidden', …)` を無条件に代入していたため。同値でも属性への代入は
 *   変更記録(MutationObserver)を生み、拡張全体の主スレッドの無駄になる。
 *
 * @module overlayShown
 */
import { setAttrIfChanged } from './domWriteIfChanged.js';

/**
 * @param {{ hidden: boolean, getAttribute: (n: string) => string|null, setAttribute: (n: string, v: string) => void }|null|undefined} el
 * @param {unknown} show
 * @returns {boolean} 実際に DOM を書いたとき true
 */
export function setOverlayShown(el, show) {
  if (!el) return false;
  const on = Boolean(show);
  let changed = false;
  if (el.hidden !== !on) {
    el.hidden = !on;
    changed = true;
  }
  if (setAttrIfChanged(/** @type {any} */ (el), 'aria-hidden', on ? 'false' : 'true')) changed = true;
  return changed;
}
