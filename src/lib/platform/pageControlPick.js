// pageControlPick.js — 配信ページの「公式の」入力欄・送信ボタンを探す(追憶が自分でページに置いた部品を除く)。
// @layer L1 — DOM を読むだけ
//
// ★2026-11-12 りんく「ミクチャの会場モードからコメント送信ができない」。会場の帯の「ここから発言」は
//   <form><input type=text><button>送信</button></form> をページの中に置く。ミクチャの送り口は
//   「文字が『送信』の最初のボタン」「form の中の input[type=text]」で探していたので、会場を開いていると
//   追憶自身の部品を拾い、送っている最中で押せない自分のボタンを見て send-disabled で止まっていた。
//   追憶の部品(id/class が nlsb で始まる・#nlsb-venue-root の中)は、どのサービスの送り口でも探す対象にしない。

const OWN_UI_SEL = '#nlsb-venue-root, [id^="nlsb-"], [class^="nlsb-"], [class*=" nlsb-"]';

/** 追憶がページに置いた部品(またはその中)か @param {Element | null | undefined} el */
export function isOwnExtensionUi(el) {
  if (!el || typeof el.closest !== 'function') return false;
  try {
    return !!el.closest(OWN_UI_SEL);
  } catch {
    return false;
  }
}

/**
 * selector に合う最初の「ページの」要素(追憶の部品は飛ばす)。
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {Element | null}
 */
export function queryPageControl(root, selector) {
  for (const el of Array.from(root.querySelectorAll(selector))) {
    if (!isOwnExtensionUi(el)) return el;
  }
  return null;
}

/**
 * 文字(textContent・aria-label・value)が re に合う「ページの」ボタン。入力欄と同じ form の中を先に探す。
 * @param {ParentNode} root
 * @param {RegExp} re
 * @param {Element | null} [near] 入力欄
 * @returns {HTMLButtonElement | null}
 */
export function findPageButton(root, re, near) {
  const label = (/** @type {Element} */ b) => `${b.textContent || ''} ${b.getAttribute('aria-label') || ''} ${b.getAttribute('value') || ''}`;
  const pick = (/** @type {ParentNode} */ scope) => {
    for (const b of Array.from(scope.querySelectorAll('button, input[type="submit"]'))) {
      if (!isOwnExtensionUi(b) && re.test(label(b))) return /** @type {HTMLButtonElement} */ (b);
    }
    return null;
  };
  const form = near && !isOwnExtensionUi(near) ? near.closest('form') : null;
  return (form && pick(form)) || pick(root);
}
