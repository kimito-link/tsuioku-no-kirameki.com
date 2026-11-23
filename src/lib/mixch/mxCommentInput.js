// mxCommentInput.js — ミクチャの公式コメント欄を探す(会場の「ここから発言」は拾わない)。
//   2026-11-23 実測(mixch.tv/u/.../live): 公式の欄は form に入っていない textarea で、
//   placeholder は「コメントする...」。会場を開くと覆われて欄が外れることがあり、
//   そのときは会場を一時的にしまって欄を出してから送る。
// @layer L1 — DOM を読む / 会場をしまう印は付け外しだけ
import { isOwnExtensionUi, queryPageControl, findPageButton } from '../platform/pageControlPick.js';
export { revealVenueOfficialComposer as revealMxOfficialComposer } from '../venueRevealOfficialComposer.js';

/** 公式の欄らしいセレクタ(form に入っていない textarea も拾う) */
export const MX_INPUT_SEL =
  'textarea[placeholder*="コメント"], input[placeholder*="コメント"], textarea[placeholder*="メッセージ"], input[placeholder*="メッセージ"], .textarea-wrapper textarea, div.column.right textarea, [role="textbox"], form textarea, form input[type="text"]';

/**
 * ミクチャが文字の高さ用に body へ置く、見えないダミー欄か。
 * @param {Element | null | undefined} el
 * @returns {boolean}
 */
export function isMxDummyAutosizeField(el) {
  if (!el || el.tagName !== 'TEXTAREA') return false;
  if (el.parentElement && el.parentElement.tagName === 'BODY') {
    const vis = typeof getComputedStyle === 'function' ? getComputedStyle(el).visibility : '';
    const z = typeof getComputedStyle === 'function' ? getComputedStyle(el).zIndex : '';
    const h = typeof el.clientHeight === 'number' ? el.clientHeight : 0;
    if (vis === 'hidden' || h === 0 || (Number(z) < 0 && Number.isFinite(Number(z)))) return true;
    const style = String(el.getAttribute('style') || '');
    if (/visibility:\s*hidden/i.test(style) || /z-index:\s*-\d/i.test(style)) return true;
  }
  return false;
}

/**
 * 公式のコメント欄(会場の入力は飛ばす・ダミー欄も飛ばす)。
 * @param {ParentNode} [root]
 * @returns {HTMLTextAreaElement | HTMLInputElement | HTMLElement | null}
 */
export function findMxCommentInput(root = typeof document !== 'undefined' ? document : /** @type {any} */ (null)) {
  if (!root || typeof root.querySelectorAll !== 'function') return null;
  const picked = queryPageControl(root, MX_INPUT_SEL);
  if (picked && !isMxDummyAutosizeField(picked) && !isOwnExtensionUi(picked)) {
    return /** @type {any} */ (picked);
  }
  for (const el of Array.from(root.querySelectorAll(MX_INPUT_SEL))) {
    if (isOwnExtensionUi(el) || isMxDummyAutosizeField(el)) continue;
    return /** @type {any} */ (el);
  }
  return null;
}

/**
 * 公式の送信ボタン(会場の「送信」は拾わない)。入力の近くを先に。
 * @param {ParentNode} [root]
 * @param {Element | null} [near]
 * @returns {HTMLButtonElement | null}
 */
export function findMxSendButton(root = typeof document !== 'undefined' ? document : /** @type {any} */ (null), near = null) {
  if (!root) return null;
  const nearbySubmit = near && !isOwnExtensionUi(near) ? near.closest?.('div') : null;
  const scope = nearbySubmit && nearbySubmit.querySelector ? nearbySubmit : root;
  const byClass = scope.querySelector && scope.querySelector('button.submit-btn');
  if (byClass && !isOwnExtensionUi(byClass)) return /** @type {HTMLButtonElement} */ (byClass);
  return findPageButton(root, /送信/, near);
}
