// srCommentInput.js — SHOWROOM の公式コメント欄を探す(会場の「ここから発言」は拾わない)。
//   会場の箱は画面いっぱいに被さるので、公式の欄があってもクリックが届かず
//   「送信ボタンを押しましたが、文字が入力欄に残っています」になることがある。
//   送り口は会場を一時的にしまう共通処理(venueRevealOfficialComposer.js)と組み合わせて使う。
// @layer L1 — DOM を読むだけ
import { isOwnExtensionUi, queryPageControl, findPageButton } from '../platform/pageControlPick.js';

/** 公式の欄(2026-11-08 実測: placeholder「コメントを投稿」) */
export const SR_INPUT_SEL =
  'input[placeholder="コメントを投稿"], textarea[placeholder="コメントを投稿"], .st-comment input[type="text"], .st-comment textarea';
export const SR_SEND_SEL = 'button.st-comment__button, .st-comment button[type="submit"]';

/**
 * 見えている公式の欄を優先する(隠れた複製を拾って文字だけ入れて終わる、を避ける)。
 * @param {Element | null | undefined} el
 */
export function isSrVisibleField(el) {
  if (!el || typeof el.getClientRects !== 'function') return false;
  return el.getClientRects().length > 0;
}

/**
 * @param {ParentNode} [root]
 * @returns {HTMLInputElement | HTMLTextAreaElement | null}
 */
export function findSrCommentInput(root = typeof document !== 'undefined' ? document : /** @type {any} */ (null)) {
  if (!root || typeof root.querySelectorAll !== 'function') return null;
  /** @type {Element | null} */
  let hidden = null;
  for (const el of Array.from(root.querySelectorAll(SR_INPUT_SEL))) {
    if (isOwnExtensionUi(el)) continue;
    if (isSrVisibleField(el)) return /** @type {any} */ (el);
    if (!hidden) hidden = el;
  }
  return /** @type {any} */ (hidden || queryPageControl(root, SR_INPUT_SEL));
}

/**
 * @param {ParentNode} [root]
 * @param {Element | null} [near]
 * @returns {HTMLButtonElement | null}
 */
export function findSrSendButton(root = typeof document !== 'undefined' ? document : /** @type {any} */ (null), near = null) {
  if (!root || typeof root.querySelectorAll !== 'function') return null;
  const scope = near && near.closest && near.closest('.st-comment') ? near.closest('.st-comment') : root;
  for (const el of Array.from(scope.querySelectorAll(SR_SEND_SEL))) {
    if (!isOwnExtensionUi(el)) return /** @type {HTMLButtonElement} */ (el);
  }
  return findPageButton(root, /投稿|送信/, near);
}
