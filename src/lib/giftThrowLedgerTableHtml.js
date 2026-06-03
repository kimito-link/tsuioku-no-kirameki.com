/**
 * ギフト投げ一覧テーブル HTML（マーケ #mkt-gift-ledger と同型・popup 用 nl- クラス）。
 * marketingChartsHtml の giftLedger 行ビルダーを popup 北極星からも再利用する。
 */

import { escapeHtml } from './htmlEscape.js';
import { buildUserProfileLinkedLabelHtml } from './userProfileLinkHtml.js';
import { displayUserLabel } from './userRooms.js';
import { resolveReportUserThumbSrc } from './reportUserThumb.js';
import { NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS } from './supportGrowthTileSrc.js';

const DEFAULT_USERICON_ONERROR_ATTR = `onerror="this.onerror=null;this.src='${escapeHtml(NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS)}'"`;

/** @param {unknown} v */
function formatLedgerNumber(v) {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : NaN;
  return Number.isFinite(n) ? n.toLocaleString('ja-JP') : '—';
}

/** @param {unknown} value */
function sanitizeHttpUrl(value) {
  const s = String(value || '').trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

/**
 * @param {string} userId
 * @param {string} innerHtml
 * @param {boolean} [maskShare]
 */
function wrapThumbWithProfileLink(userId, innerHtml, maskShare = false) {
  const uid = String(userId || '').trim();
  if (maskShare || !/^\d{1,18}$/.test(uid)) return innerHtml;
  return (
    `<a href="https://www.nicovideo.jp/user/${encodeURIComponent(uid)}"` +
    ` target="_blank" rel="noopener noreferrer" class="nl-user-thumb-link">${innerHtml}</a>`
  );
}

/**
 * @param {{ userId?: string, senderLabel?: string, senderAvatarUrl?: string }} identity
 * @param {{ maskShare?: boolean, identiconResolver?: (uid: string) => string }} [opts]
 */
export function buildGiftLedgerUserIdentityCells(identity, opts = {}) {
  const maskShare = opts.maskShare === true;
  const uid = String(identity.userId || '').trim();
  const rawLabel =
    uid && /^\d{1,18}$/.test(uid)
      ? displayUserLabel(uid, identity.senderLabel || '')
      : String(identity.senderLabel || '').trim() || '（不明）';
  const accountHtml =
    uid && /^\d{1,18}$/.test(uid)
      ? buildUserProfileLinkedLabelHtml(uid, rawLabel)
      : escapeHtml(rawLabel);
  const thumbSrc = maskShare
    ? ''
    : resolveReportUserThumbSrc({
        userId: uid,
        avatarUrl: String(identity.senderAvatarUrl || '').trim(),
        identiconResolver: opts.identiconResolver
      });
  const thumbInner = thumbSrc
    ? `<img class="nl-gift-ledger-thumb" src="${escapeHtml(thumbSrc)}" alt="" width="28" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${DEFAULT_USERICON_ONERROR_ATTR}>`
    : '<span class="nl-gift-ledger-thumb nl-gift-ledger-thumb--empty"></span>';
  const thumbCell = wrapThumbWithProfileLink(uid, thumbInner, maskShare);
  const idInner =
    !uid
      ? escapeHtml('—')
      : /^\d{1,18}$/.test(uid)
        ? buildUserProfileLinkedLabelHtml(uid, uid)
        : escapeHtml(uid);
  const idHtml = `<span class="nl-gift-ledger-mono">${idInner}</span>`;
  return { thumbCell, accountHtml, idHtml };
}

/**
 * @param {string} thumbnailUrl
 * @param {number} [size]
 */
export function buildGiftLedgerItemThumbHtml(thumbnailUrl, size = 28) {
  const src = sanitizeHttpUrl(thumbnailUrl);
  if (src) {
    return `<img class="nl-gift-ledger-row__thumb" src="${escapeHtml(src)}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${DEFAULT_USERICON_ONERROR_ATTR}>`;
  }
  return `<span class="nl-gift-ledger-row__thumb nl-gift-ledger-row__thumb--empty" style="width:${size}px;height:${size}px"></span>`;
}

/**
 * @typedef {{
 *   timeLabel: string,
 *   itemName: string,
 *   points: number,
 *   thumbnailUrl?: string,
 *   userId?: string,
 *   senderLabel?: string,
 *   senderAvatarUrl?: string,
 *   source?: string
 * }} GiftThrowLedgerDisplayRow
 */

/**
 * @param {GiftThrowLedgerDisplayRow} row
 * @param {number} index 0-based
 * @param {{ identiconResolver?: (uid: string) => string, showSource?: boolean }} [opts]
 */
export function buildGiftThrowLedgerTableRowHtml(row, index, opts = {}) {
  const idCells = buildGiftLedgerUserIdentityCells(
    {
      userId: row.userId,
      senderLabel: row.senderLabel,
      senderAvatarUrl: row.senderAvatarUrl
    },
    opts
  );
  const itemThumbInner = buildGiftLedgerItemThumbHtml(row.thumbnailUrl, 28);
  const points = `${formatLedgerNumber(row.points)} pt`;
  const sourceCol =
    opts.showSource !== false
      ? `<td data-label="出典" class="nl-gift-ledger-evidence">${escapeHtml(formatGiftThrowSourceLabel(row.source))}</td>`
      : '';
  return `<tr>
<td data-label="#">${index + 1}</td>
<td data-label="時刻" class="nl-gift-ledger-time">${escapeHtml(row.timeLabel || '—')}</td>
<td data-label="アイテム" class="nl-gift-ledger-itemcell">${itemThumbInner}<span>${escapeHtml(row.itemName || '—')}</span></td>
<td data-label="サムネ">${idCells.thumbCell}</td>
<td data-label="アカウント" class="nl-gift-ledger-sender">${idCells.accountHtml}</td>
<td data-label="ID">${idCells.idHtml}</td>
<td data-label="pt" class="nl-num">${escapeHtml(points)}</td>
${sourceCol}
</tr>`;
}

/** @param {unknown} source */
function formatGiftThrowSourceLabel(source) {
  const s = String(source || '').trim();
  if (s === 'koken-api') return 'koken API';
  if (s === 'dom-scrape') return '公式DOM';
  if (s === 'merged') return '統合';
  if (s === 'gift-sub-app') return '履歴タブ';
  return s || '—';
}

/**
 * @param {readonly GiftThrowLedgerDisplayRow[]} rows
 * @param {{ totalCount: number, shownCount: number, payloadSource?: string, showSource?: boolean }} meta
 * @param {{ identiconResolver?: (uid: string) => string }} [opts]
 */
export function buildGiftThrowLedgerTableSectionHtml(rows, meta, opts = {}) {
  if (!rows.length) return '';
  const totalCount = Math.max(0, Math.floor(Number(meta.totalCount) || rows.length));
  const shownCount = Math.max(0, Math.floor(Number(meta.shownCount) || rows.length));
  const showSource = meta.showSource !== false;
  const caption =
    totalCount > shownCount
      ? `投げ一覧（${totalCount} 件中 新しい ${shownCount} 件）`
      : `投げ一覧（${totalCount} 件）`;
  const tableRows = rows
    .map((row, i) => buildGiftThrowLedgerTableRowHtml(row, i, { ...opts, showSource }))
    .join('');
  const sourceNote = meta.payloadSource
    ? `<p class="nl-gift-ledger-spec-note">データ源: ${escapeHtml(formatGiftThrowSourceLabel(meta.payloadSource))}</p>`
    : '';
  const headSource = showSource ? '<th>出典</th>' : '';
  return (
    `<section class="nl-gift-ledger-section" aria-label="個別ギフト投げ一覧">` +
    `<h3 class="nl-gift-ledger-head">${escapeHtml(caption)}</h3>` +
    sourceNote +
    `<div class="nl-gift-ledger-scroll"><table class="nl-gift-ledger-table">` +
    `<thead><tr><th>#</th><th>時刻</th><th>アイテム</th><th>サムネ</th><th>アカウント</th><th>ID</th><th>pt</th>${headSource}</tr></thead>` +
    `<tbody>${tableRows}</tbody></table></div></section>`
  );
}

/**
 * sub-app history 行を台帳表示行に正規化。
 *
 * @param {unknown} raw
 * @param {string} [payloadSource]
 * @returns {GiftThrowLedgerDisplayRow|null}
 */
export function giftThrowRowFromSubAppHistory(raw, payloadSource = '') {
  const r = /** @type {Record<string, unknown>} */ (raw || {});
  const points = Number(r.points);
  if (!Number.isFinite(points) || points <= 0) return null;
  const userId = String(r.userId || '').trim();
  const senderName = String(r.senderName || '').trim() || '名無し';
  return {
    timeLabel: String(r.time || '').trim() || '—',
    itemName: String(r.itemName || '').trim() || '（名称未取得）',
    points: Math.trunc(points),
    thumbnailUrl: sanitizeHttpUrl(r.thumbnailUrl),
    userId,
    senderLabel: senderName,
    senderAvatarUrl: sanitizeHttpUrl(r.senderAvatarUrl),
    source: payloadSource || 'koken-api'
  };
}
