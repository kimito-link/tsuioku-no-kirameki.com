/**
 * ユーザー由来文字列を HTML 断片に埋め込む前にエスケープする（XSS 対策の共通実装）。
 *
 * レイヤ: shared/ (どこからでも import 可)
 * pure: yes
 *
 * NOTE: これが正本。`src/lib/htmlEscape.js` は Phase 1 の transitional re-export
 * として残してあり、Phase 5 で削除する予定。新規 import は必ずこちらから行うこと。
 */

/** @param {unknown} s */
export function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // single quote もエスケープする。double-quoted 属性が中心の現コードでは
    // breakout は起きないが、`<a href='${escapeAttr(href)}'>` のような
    // single-quoted 属性に書き換わった瞬間に XSS になるため、防御的に閉じておく。
    .replace(/'/g, '&#39;');
}

/** @param {unknown} s */
export function escapeAttr(s) {
  return escapeHtml(s);
}
