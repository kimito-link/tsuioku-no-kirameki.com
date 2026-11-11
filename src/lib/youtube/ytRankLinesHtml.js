// ytRankLinesHtml.js — 応援ユーザーの順位カード(`.nl-top-support-rank__line`)の HTML を YouTube 用に組む純関数。
//
// ★見た目はニコ生版と1バイトも変えない: タグ・class・子の順序は
//   src/lib/topSupportRankLinesHtml.js(ニコ生版の正本)と同じ。違うのは次の3点だけ。
//   1. リンク先: ニコニコのユーザーページではなく、YouTube のチャンネルページ(https のみ)。
//   2. 件数の文字: 「N件」固定ではなく、呼び出し側が決める(「12件 · ¥1,500」「¥3,000」など)。
//   3. 配信者タイル: ニコ生版の topSupportRankStripCasterTileHtml と同じ形で、YouTube の配信者を出す。
//   行の中身(順位・色・サムネ・ID・名前)はニコ生版の topSupportRankLineModels が作ったモデルをそのまま使う。

import { escapeHtml, escapeAttr } from '../htmlEscape.js';
import { isHttpOrHttpsUrl } from '../supportGrowthTileSrc.js';
import { anonymousIdenticonDataUrl } from '../anonymousIdenticon.js';

/**
 * 順位カードの人を表す鍵。チャンネルIDがあればそれ、無ければ表示名から作る(同じ人は同じ鍵)。
 * @param {unknown} channelId
 * @param {unknown} name
 * @returns {string}
 */
export function ytRankUserKey(channelId, name) {
  const id = String(channelId || '').trim();
  if (id) return id;
  const n = String(name || '').trim();
  return n ? `name:${n}` : '';
}

/**
 * YouTube のチャンネルページ URL(https の youtube.com だけ許す)。それ以外は ''。
 * @param {unknown} url
 * @returns {string}
 */
export function safeYtChannelHref(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:') return '';
    if (!/(^|\.)youtube\.com$/i.test(u.hostname)) return '';
    return u.toString();
  } catch {
    return '';
  }
}

/**
 * @typedef {{
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
 * }} YtRankLineModel
 */

/**
 * @param {YtRankLineModel[]} models topSupportRankLineModels の結果
 * @param {{
 *   countTextAt: (index: number) => string,
 *   hrefFor?: (userKey: string, index: number) => string,
 *   resolveDisplayThumb?: (thumbSrc: string) => string
 * }} opts
 * @returns {string}
 */
export function buildYtRankLinesHtml(models, opts) {
  const list = Array.isArray(models) ? models : [];
  const countTextAt = typeof opts?.countTextAt === 'function' ? opts.countTextAt : () => '';
  const hrefFor = typeof opts?.hrefFor === 'function' ? opts.hrefFor : () => '';
  const resolveDisplayThumb =
    typeof opts?.resolveDisplayThumb === 'function'
      ? opts.resolveDisplayThumb
      : (/** @type {string} */ s) => s;
  return list
    .map((m, i) => {
      const placeHtml =
        m.placeNumber != null
          ? `<span class="nl-top-support-rank__place" aria-hidden="true">${m.placeNumber}</span>`
          : `<span class="nl-top-support-rank__place nl-top-support-rank__place--empty" aria-hidden="true"></span>`;
      const full = escapeAttr(m.fullLabelForTitle);
      const displayThumb = resolveDisplayThumb(m.thumbSrc);
      const thumbRp = isHttpOrHttpsUrl(displayThumb) ? ' referrerpolicy="no-referrer"' : '';
      const nameText = escapeHtml(m.nameLine);
      const idTitle = m.isUnknown ? '' : escapeAttr(m.idTitle);
      const idBlock =
        String(m.idShort || '').trim() === ''
          ? ''
          : `<span class="nl-top-support-rank__id" title="${idTitle}">${escapeHtml(m.idShort)}</span>`;
      let lineClass = `nl-top-support-rank__line${m.isUnknown ? ' nl-top-support-rank__line--unknown' : ''}`;
      let lineStyle = '';
      if (m.hasAccent && m.accentColorCss) {
        lineClass += ' nl-top-support-rank__line--has-accent';
        lineStyle = ` style="--nl-rank-accent:${escapeAttr(m.accentColorCss)}"`;
      }
      const href = m.isUnknown ? '' : safeYtChannelHref(hrefFor(m.userKey, i));
      const innerHtml = `${placeHtml}
        <span class="nl-top-support-rank__count">${escapeHtml(countTextAt(i))}</span>
        <span class="nl-top-support-rank__thumb-wrap">
          <img class="nl-top-support-rank__thumb" src="${escapeAttr(displayThumb)}" alt="${nameText}" decoding="async"${thumbRp} />
        </span>
        ${idBlock}
        <span class="nl-top-support-rank__name">${nameText}</span>`;
      return href
        ? `<a class="${lineClass} nl-top-support-rank__line--linkable"${lineStyle} role="listitem" title="${full}" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${innerHtml}</a>`
        : `<div class="${lineClass}"${lineStyle} role="listitem" title="${full}">${innerHtml}</div>`;
    })
    .join('');
}

/**
 * 配信者タイル(順位カードの左端)。ニコ生版 topSupportRankStripCasterTileHtml と同じ形。
 * 名前が無いときは ''(タイルを出さない)。
 * @param {{ name?: string, iconUrl?: string, pageUrl?: string, followLabel?: string }} input
 * @returns {string}
 */
export function buildYtCasterTileHtml(input) {
  const name = String(input?.name || '').trim();
  if (!name) return '';
  const pageUrl = safeYtChannelHref(input?.pageUrl);
  const iconUrl = String(input?.iconUrl || '').trim();
  const followLabel = String(input?.followLabel || 'チャンネル');
  const usable = /^https:\/\//i.test(iconUrl) || /^data:image\//i.test(iconUrl);
  const src = usable ? iconUrl : anonymousIdenticonDataUrl(name, 64);
  const iconHtml =
    `<img class="nl-top-support-rank__caster-thumb" src="${escapeAttr(src)}" alt="${escapeAttr(name)}" decoding="async" referrerpolicy="no-referrer" data-fallback-name="${escapeAttr(name)}" />`;
  const title = pageUrl ? `配信者 ${name}（クリックでチャンネルページ）` : `配信者 ${name}`;
  const nameBlock = pageUrl
    ? `<a class="nl-top-support-rank__caster-link" href="${escapeAttr(pageUrl)}" target="_blank" rel="noopener noreferrer" style="display:flex;flex-direction:column;align-items:center;gap:3px;text-decoration:none;color:inherit;min-width:0;max-width:100%;">` +
      iconHtml +
      `<span class="nl-top-support-rank__caster-name">${escapeHtml(name)}</span>` +
      `</a>` +
      `<a class="nl-top-support-rank__caster-follow" href="${escapeAttr(pageUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(followLabel)}</a>`
    : iconHtml + `<span class="nl-top-support-rank__caster-name">${escapeHtml(name)}</span>`;
  return (
    `<div class="nl-top-support-rank__caster" role="listitem" title="${escapeAttr(title)}">` +
    `<span class="nl-top-support-rank__caster-label">配信者</span>` +
    nameBlock +
    `</div>`
  );
}
