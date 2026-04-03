/**
 * MutationObserver の監視ルートを決める（ニコ生コメントパネル優先）
 */

import { findNicoCommentPanel } from './commentHarvest.js';

/**
 * パネルが取れたらその要素、無ければ document.documentElement。
 * @param {Document} doc
 * @returns {Element}
 */
export function pickCommentMutationObserverRoot(doc) {
  if (!doc || doc.nodeType !== 9) {
    throw new TypeError('pickCommentMutationObserverRoot expects a Document');
  }
  const panel = findNicoCommentPanel(doc);
  if (panel && panel.nodeType === 1) return panel;
  const el = doc.documentElement;
  if (!el) throw new Error('pickCommentMutationObserverRoot: missing documentElement');
  return el;
}
