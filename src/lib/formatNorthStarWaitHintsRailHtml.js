import { escapeHtml, escapeAttr } from './htmlEscape.js';

/**
 * 待機メッセージのバッジ名 → 拡張ルート相対のマーケPNG（popup / インラインでそのまま src に使える）。
 *
 * @param {unknown} badgeLabel `getNorthStarWaitRotationMessages` の badge
 * @returns {string}
 */
export function northStarWaitBadgeToMarketingPngRelative(badgeLabel) {
  const k = String(badgeLabel || '').trim();
  if (k === 'こん太') return 'images/marketing-html-avatars/konta-72.png';
  if (k === 'たぬ姉') return 'images/marketing-html-avatars/tanu-72.png';
  return 'images/marketing-html-avatars/rink-72.png';
}

/**
 * 北極星右列: 待機中の「3キャラ一言」HTML（ランキング rail とは別レイヤ）。
 *
 * @param {ReadonlyArray<{ badge: string; line: string }>} messages
 * @returns {string} 空配列なら空文字
 */
export function buildNorthStarWaitHintsRailHtml(messages) {
  const list = Array.isArray(messages) ? messages.slice(0, 6) : [];
  if (!list.length) return '';
  const rows = list
    .map((m) => {
      const badge = escapeHtml(String(m.badge || '').trim() || '案内');
      const line = escapeHtml(String(m.line || '').trim());
      const src = escapeAttr(northStarWaitBadgeToMarketingPngRelative(m.badge));
      const title = escapeAttr(`${String(m.badge || '').trim()}：${String(m.line || '').trim()}`);
      return (
        `<li class="nl-north-star-rail-wait__row" role="listitem">` +
        `<span class="nl-north-star-rail-wait__avatar" aria-hidden="true">` +
        `<img class="nl-north-star-rail-wait__img" src="${src}" alt="" width="20" height="20" decoding="async" />` +
        `</span>` +
        `<span class="nl-north-star-rail-wait__text" title="${title}">` +
        `<span class="nl-north-star-rail-wait__name">${badge}</span>` +
        `<span class="nl-north-star-rail-wait__line">：${line}</span>` +
        `</span>` +
        `</li>`
      );
    })
    .join('');
  return (
    `<div class="nl-north-star-rail-wait" data-nl-rail-wait="1" role="note">` +
    `<ul class="nl-north-star-rail-wait__list" role="list">${rows}</ul>` +
    `</div>`
  );
}
