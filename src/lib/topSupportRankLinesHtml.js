// 応援ランクストリップの各行（renderTopSupportRankStrip の <a>/<div> 行群）の HTML を組む純関数。
//   popup-entry.js:renderTopSupportRankStrip から「models → 行 HTML 文字列」部分だけ抽出
//   （pure refactor・挙動不変）。サムネ解決(storyAvatarLoadGuard.pickDisplaySrc)は注入し、
//   生成後の DOM 配線(bindOnErrorHandlers / noteRemoteAttempt / upgradeAnonymousAvatar)・
//   caster タイル合成・strip.innerHTML 代入は popup に残す。
//   依存は既存 lib（htmlEscape / supportGrowthTileSrc）のみ＝循環 import なし。
import { escapeHtml, escapeAttr } from './htmlEscape.js';
import { isHttpOrHttpsUrl, isAnonymousStyleNicoUserId } from './supportGrowthTileSrc.js';

/**
 * @typedef {{
 *   count: number,
 *   userKey: string,
 *   isUnknown: boolean,
 *   placeNumber: number | null,
 *   hasAccent: boolean,
 *   accentColorCss: string | null,
 *   thumbSrc: string,
 *   idTitle: string,
 *   idShort: string,
 *   nameLine: string,
 *   fullLabelForTitle: string
 * }} TopSupportRankLineModel
 */

/**
 * ランク行モデル配列を行 HTML 文字列（join 済み）に整形する。
 *   ★サムネの表示 src 解決（load guard）は副作用を持つので注入する＝テストは決定的に、
 *     本番は抽出前と同一の resolver を渡してバイト一致を保つ。
 *
 * @param {TopSupportRankLineModel[]} models
 * @param {{ resolveDisplayThumb?: (thumbSrc: string) => string }} [opts]
 * @returns {string} 連結済みの行 HTML
 */
export function buildTopSupportRankLinesHtml(models, opts = {}) {
  const list = Array.isArray(models) ? models : [];
  const resolveDisplayThumb =
    typeof opts.resolveDisplayThumb === 'function'
      ? opts.resolveDisplayThumb
      : (/** @type {string} */ src) => src;
  return list
    .map((m) => {
      const placeHtml =
        m.placeNumber != null
          ? `<span class="nl-top-support-rank__place" aria-hidden="true">${m.placeNumber}</span>`
          : `<span class="nl-top-support-rank__place nl-top-support-rank__place--empty" aria-hidden="true"></span>`;
      const full = escapeAttr(m.fullLabelForTitle);
      const displayThumb = resolveDisplayThumb(m.thumbSrc);
      const thumbRp = isHttpOrHttpsUrl(displayThumb) ? ' referrerpolicy="no-referrer"' : '';
      const idText = escapeHtml(m.idShort);
      const nameText = escapeHtml(m.nameLine);
      const idTitle = m.isUnknown ? '' : escapeAttr(m.idTitle);
      const idBlock =
        String(m.idShort || '').trim() === ''
          ? ''
          : `<span class="nl-top-support-rank__id" title="${idTitle}">${idText}</span>`;
      let lineClass = `nl-top-support-rank__line${m.isUnknown ? ' nl-top-support-rank__line--unknown' : ''}`;
      let lineStyle = '';
      if (m.hasAccent && m.accentColorCss) {
        lineClass += ' nl-top-support-rank__line--has-accent';
        lineStyle = ` style="--nl-rank-accent:${escapeAttr(m.accentColorCss)}"`;
      }
      // 数値 ID（非匿名）のユーザーはニコニコのユーザーページにリンクする
      const isLinkable = !m.isUnknown && !isAnonymousStyleNicoUserId(m.userKey);
      const linkHref = isLinkable
        ? `https://www.nicovideo.jp/user/${escapeAttr(m.userKey)}`
        : '';
      const innerHtml = `${placeHtml}
        <span class="nl-top-support-rank__count">${m.count}件</span>
        <span class="nl-top-support-rank__thumb-wrap">
          <img class="nl-top-support-rank__thumb" src="${escapeAttr(displayThumb)}" alt="${nameText}" decoding="async"${thumbRp} />
        </span>
        ${idBlock}
        <span class="nl-top-support-rank__name">${nameText}</span>`;
      return isLinkable
        ? `<a class="${lineClass} nl-top-support-rank__line--linkable"${lineStyle} role="listitem" title="${full}" href="${linkHref}" target="_blank" rel="noopener noreferrer">${innerHtml}</a>`
        : `<div class="${lineClass}"${lineStyle} role="listitem" title="${full}">${innerHtml}</div>`;
    })
    .join('');
}
