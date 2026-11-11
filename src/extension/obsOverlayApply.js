/**
 * OBS透過コメントの表示へ、決めた見た目を載せる。
 * 色の決め方は src/lib/obsOverlayStyle.js。ここは class と style 要素だけ。
 */

import { buildObsOverlayCss, obsOverlayStyleOrDefault } from '../lib/obsOverlayStyle.js';

/**
 * @param {HTMLElement} root
 * @param {unknown} style
 * @param {'body.is-obs' | '#obsPreview.is-obs'} scope
 */
export function mountObsOverlayStyle(root, style, scope) {
  const normalized = obsOverlayStyleOrDefault(style);
  root.classList.add('is-obs');
  root.classList.toggle('obs-hide-icons', normalized.showIcons === false);
  root.classList.toggle('obs-hide-names', normalized.showNames === false);
  root.classList.toggle('obs-animate', normalized.animate === true);
  let tag = root.querySelector('style[data-obs-overlay-style]');
  if (!(tag instanceof HTMLStyleElement)) {
    const created = document.createElement('style');
    created.dataset.obsOverlayStyle = '1';
    root.appendChild(created);
    tag = created;
  }
  tag.textContent = buildObsOverlayCss(normalized, scope);
  return normalized;
}

/**
 * @param {ParentNode | null} listEl
 * @param {number} maxLines
 */
export function applyObsRowVisibility(listEl, maxLines) {
  if (!listEl || typeof listEl.querySelectorAll !== 'function') return;
  const rows = listEl.querySelectorAll('.nl-tl-row, .nl-tl-gift');
  const max = Math.max(1, Math.round(Number(maxLines)) || 1);
  const hideBefore = Math.max(0, rows.length - max);
  rows.forEach((el, i) => {
    el.classList.toggle('obs-row-hidden', i < hideBefore);
  });
}
