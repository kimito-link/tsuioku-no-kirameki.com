import { escapeHtml, escapeAttr } from './htmlEscape.js';

/**
 * コメントティッカー（最新 1 件）の表示 HTML を組み立てる純関数。
 *
 * popup-entry.js の renderCommentTicker から「DOM 非依存の HTML 文字列組み立て」
 * 部分だけを抽出したもの（pure refactor、挙動不変）。DOM 取得・innerHTML 代入・
 * title / referrerPolicy の後付けは呼び出し側（popup）に残す。
 *
 * - 数値 ID のユーザーは行全体（アバター＋名前＋本文）を niconico ユーザーページ
 *   への `<a>` リンクにする（userPageHref が空でなければ）。
 * - 匿名（a:xxx）やハッシュ風 ID は userPageHref が '' なので `<span>` のまま。
 * - label が空のときは名前 span とコロンを出さない（本文のみ）。
 *
 * @param {{
 *   label?: string,
 *   avatarSrc?: string,
 *   textShown?: string,
 *   userPageHref?: string
 * }} input
 * @returns {string} segA に入れる innerHTML（`<a>` または `<span>` のラッパ）
 */
export function buildCommentTickerLatestHtml(input) {
  const label = String(input?.label ?? '');
  const avatarSrc = String(input?.avatarSrc ?? '');
  const textShown = String(input?.textShown ?? '');
  const userPageHref = String(input?.userPageHref ?? '');

  const labelHtml = label
    ? `<span class="nl-ticker-latest__name">${escapeHtml(label)}</span>` +
      `<span class="nl-ticker-latest__colon">：</span>`
    : '';

  const rowInnerHtml =
    `<span class="nl-ticker-latest__row">` +
    `<img class="nl-ticker-latest__avatar" alt="" src="${escapeHtml(avatarSrc)}">` +
    labelHtml +
    `<span class="nl-ticker-latest__text">${escapeHtml(textShown)}</span>` +
    `</span>`;

  return userPageHref
    ? `<a class="nl-ticker-item nl-ticker-latest nl-ticker-latest--linkable" aria-live="polite" href="${escapeAttr(userPageHref)}" target="_blank" rel="noopener noreferrer">${rowInnerHtml}</a>`
    : `<span class="nl-ticker-item nl-ticker-latest" aria-live="polite">${rowInnerHtml}</span>`;
}
