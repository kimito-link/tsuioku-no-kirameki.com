/**
 * 「値が同じなら DOM に書かない」小さな書き込み部品(純粋寄り・DOM 要素を引数で受け取る)。v0.1.1688
 *
 * ■ なぜ要るか(2026-10-19・実機の速報)
 *   サイドパネルの応援マス(.nl-story-growth-cell / -icon)は、描き直しのたびに className の全面代入・classList の
 *   add/remove/toggle・属性の setAttribute を【同じ値のまま】毎回行っていた(4秒で約1,000回ずつ)。
 *   classList の操作と setAttribute は、値が変わらなくても属性の「更新手順」が走って変更記録(MutationObserver)と
 *   スタイル無効化の確認を起こす。ギフト履歴も、同じ HTML を毎回 innerHTML へ入れ直し、約180個の子を作り直していた。
 *   → 値が同じなら何もしない。見た目は変わらない。
 *
 * ■ 守ること: 値が違うときは必ず従来どおり書く(書き漏らさない)。
 */

/** @param {Element|null|undefined} el @param {string} name @param {string} value @returns {boolean} 書いたら true */
export function setAttrIfChanged(el, name, value) {
  if (!el) return false;
  if (el.getAttribute(name) === value) return false;
  el.setAttribute(name, value);
  return true;
}

/** @param {Element|null|undefined} el @param {string} name @returns {boolean} 外したら true */
export function removeAttrIfPresent(el, name) {
  if (!el || !el.hasAttribute(name)) return false;
  el.removeAttribute(name);
  return true;
}

/** @param {Element|null|undefined} el @param {string} token @param {boolean} on @returns {boolean} 変えたら true */
export function setClassFlag(el, token, on) {
  if (!el) return false;
  if (el.classList.contains(token) === Boolean(on)) return false;
  el.classList.toggle(token, Boolean(on));
  return true;
}

/** @param {HTMLElement|null|undefined} el @param {string} prop CSS カスタムプロパティ名 @returns {boolean} 外したら true */
export function removeStylePropIfSet(el, prop) {
  if (!el || !el.style || el.style.getPropertyValue(prop) === '') return false;
  el.style.removeProperty(prop);
  return true;
}

/** @type {WeakMap<Element, string>} */
const lastHtml = new WeakMap();

/**
 * innerHTML を、前回この関数で入れた HTML と同じなら入れ直さない。
 * ★ほかの経路が同じ要素を書いた場合は noteHtmlWrittenElsewhere で覚えを捨てる(古い覚えで書き漏らさない)。
 * @param {HTMLElement|null|undefined} el @param {string} html @returns {boolean} 書いたら true
 */
export function setInnerHtmlIfChanged(el, html) {
  if (!el) return false;
  if (lastHtml.get(el) === html && el.childNodes.length > 0) return false;
  el.innerHTML = html;
  lastHtml.set(el, html);
  return true;
}

/** @param {Element|null|undefined} el */
export function noteHtmlWrittenElsewhere(el) {
  if (el) lastHtml.delete(el);
}
