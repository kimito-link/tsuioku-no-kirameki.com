/**
 * HTML レポート用: NDGR 由来ギフト／投げ一覧（マーケ分析の mkt-gifts と同データ形）。
 */

import { escapeHtml, escapeAttr } from './htmlEscape.js';
import { buildUserProfileLinkedLabelHtml } from './userProfileLinkHtml.js';
import { displayUserLabel, UNKNOWN_USER_KEY } from './userRooms.js';
import { resolveReportUserThumbSrc } from './reportUserThumb.js';
import { GIFT_RANK_STRIP_MAX } from './giftRankStripConfig.js';

/** @typedef {{ userId: string, nickname: string, throwCount: number, capturedAt: number }} GiftNdgrRow */

export const DEFAULT_REPORT_GIFT_TABLE_MAX = 5000;

/**
 * @param {GiftNdgrRow[]} rows mergeAndSortGiftUserRows 済み（配信者除外済み）
 * @param {{
 *   identiconResolver?: (uid: string) => string,
 *   maxRows?: number
 * }} [opts]
 * @returns {string} 行が無ければ空文字
 */
export function buildReportGiftNdgrSectionHtml(rows, opts = {}) {
  const list = Array.isArray(rows)
    ? rows.filter((x) => x && String(/** @type {{ userId?: unknown }} */ (x).userId || '').trim())
    : [];
  if (!list.length) return '';

  const maxRows =
    Number.isFinite(Number(opts?.maxRows)) && Number(opts.maxRows) > 0
      ? Math.floor(Number(opts.maxRows))
      : DEFAULT_REPORT_GIFT_TABLE_MAX;
  const identiconResolver =
    typeof opts.identiconResolver === 'function' ? opts.identiconResolver : undefined;

  const totalPeople = list.length;
  const totalThrows = list.reduce(
    (s, r) => s + (Number(r.throwCount) > 0 ? Number(r.throwCount) : 0),
    0
  );
  const maxThrow = list.reduce((m, r) => Math.max(m, Number(r.throwCount) || 0), 0);

  const truncated = list.length > maxRows;
  const display = truncated ? list.slice(0, maxRows) : list;
  const noteTrunc = truncated
    ? `<p class="guide-lead">表は最大 ${maxRows} 行です（全 ${totalPeople} ユーザー・投げ合計 ${totalThrows} 回）。</p>`
    : '';

  const rowsHtml = display
    .map((r, i) => {
      const uidForLabel = r.userId || UNKNOWN_USER_KEY;
      const rawLabel = displayUserLabel(r.userId, r.nickname || '');
      const nameCellHtml = buildUserProfileLinkedLabelHtml(uidForLabel, rawLabel);
      const resolvedAvatar = resolveReportUserThumbSrc({
        userId: r.userId || '',
        avatarUrl: '',
        identiconResolver
      });
      const avImg = resolvedAvatar
        ? `<img class="report-room-av" src="${escapeAttr(resolvedAvatar)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
        : '<span class="report-room-av report-room-av--empty"></span>';
      const pct = maxThrow > 0 ? ((Number(r.throwCount) || 0) / maxThrow) * 100 : 0;
      const when =
        typeof r.capturedAt === 'number' && r.capturedAt > 0
          ? escapeHtml(new Date(r.capturedAt).toLocaleString('ja-JP'))
          : '—';
      const searchHay = [
        String(r.userId || ''),
        String(r.nickname || ''),
        String(r.throwCount),
        when !== '—' ? when : ''
      ]
        .join(' ')
        .toLowerCase();
      return `<tr class="search-item" data-search="${escapeAttr(searchHay)}">
<td>${i + 1}</td>
<td>${avImg}</td>
<td class="report-gift-name">${nameCellHtml}</td>
<td class="report-gift-bar"><div class="report-gift-bar__track"><div class="report-gift-bar__fill" style="width:${pct.toFixed(1)}%"></div><span class="report-gift-bar__label">${escapeHtml(String(r.throwCount))}</span></div></td>
<td class="mono">${when}</td>
</tr>`;
    })
    .join('');

  return `<section class="card" id="sec-gifts">
<h2>ギフト・投げ（NDGR 検知）</h2>
<p class="guide-lead">popup のギフト帯と同じ並び（投げ回数の多い順）。本家「ギフト」→「履歴」の番組累計ポイントの一覧とは別指標です。画面上のストリップは上位 ${GIFT_RANK_STRIP_MAX} 件のみ表示します。</p>
<p class="guide-lead">ユーザー <strong>${totalPeople}</strong> 名・投げ合計 <strong>${totalThrows}</strong> 回。</p>
${noteTrunc}
<table class="report-gift-table">
<thead><tr><th>#</th><th></th><th>ユーザー</th><th>投げ回数</th><th>最終検知</th></tr></thead>
<tbody>${rowsHtml}</tbody>
</table>
</section>`;
}
