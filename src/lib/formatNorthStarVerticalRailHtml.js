import { escapeHtml, escapeAttr } from './htmlEscape.js';

/**
 * 北極星右列: 1〜10 位の縦リスト HTML（中央の横カードと同じ rooms 由来の表示用）。
 *
 * @param {ReadonlyArray<{
 *   placeNumber: number | null,
 *   nameLine: string,
 *   count: number,
 *   isUnknown: boolean,
 *   userKey: string,
 *   fullLabelForTitle: string
 * }>} models `topSupportRankLineModels` の戻りと同形を想定
 * @param {string} unitSuffix
 * @param {number} [maxLines]
 * @returns {string}
 */
export function buildNorthStarVerticalRailHtml(models, unitSuffix, maxLines = 10) {
  const suf = String(unitSuffix || '');
  const list = Array.isArray(models) ? models.slice(0, Math.max(1, maxLines)) : [];
  if (!list.length) return '';
  const rows = list
    .map((m) => {
      const place =
        m.placeNumber != null && Number.isFinite(m.placeNumber)
          ? String(m.placeNumber)
          : '—';
      const name = escapeHtml(String(m.nameLine || ''));
      const cnt = escapeHtml(String(Math.max(0, Number(m.count) || 0)) + suf);
      const title = escapeAttr(String(m.fullLabelForTitle || ''));
      const rankClass =
        m.placeNumber != null && m.placeNumber <= 3
          ? ' nl-north-star-rail__place--top'
          : '';
      return (
        `<li class="nl-north-star-rail__row" role="listitem">` +
        `<span class="nl-north-star-rail__place${rankClass}" aria-hidden="true">${escapeHtml(place)}</span>` +
        `<span class="nl-north-star-rail__name" title="${title}">${name}</span>` +
        `<span class="nl-north-star-rail__count">${cnt}</span>` +
        `</li>`
      );
    })
    .join('');
  return `<ol class="nl-north-star-rail__list" role="list">${rows}</ol>`;
}
