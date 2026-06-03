/**
 * HTML レポート「保存コメント一覧」セクション。
 * コメント数が多い配信では DOM 行数がスクロール負荷の主因になるため、
 * 初期表示を絞り、残りは JSON + ボタン展開（または CSV）に委ねる。
 */

import { escapeAttr, escapeHtml } from './htmlEscape.js';
import { displayUserLabel, UNKNOWN_USER_KEY } from './userRooms.js';
import { buildUserProfileLinkedLabelHtml } from './userProfileLinkHtml.js';
import { resolveReportUserThumbSrc } from './reportUserThumb.js';

/**
 * @typedef {import('./reportCommentsCsv.js').CsvCommentInput & {
 *   liveId?: unknown,
 *   avatarUrl?: unknown
 * }} ReportCommentTableRowInput
 */

/** ブラウザ表示の初期行数（マーケ分析コメンター一覧 40 より多め。本文確認用）。 */
export const HTML_REPORT_COMMENTS_TABLE_INITIAL_ROWS = 80;

/**
 * これを超えると HTML 内への全件 CSV / overflow JSON 埋め込みを省略する。
 * 数万件で文字列生成が DL 開始まで数十秒かかるのを防ぐ。
 */
export const HTML_REPORT_HEAVY_COMMENT_THRESHOLD = 2500;

/** heavy 時のルーム集計に使うコメントの均等サンプル上限（全件走査回避） */
export const HTML_REPORT_AGGREGATE_SAMPLE_MAX = 4000;

/** overflow JSON に載せる最大行数（超過分は CSV 案内のみ）。 */
export const HTML_REPORT_OVERFLOW_JSON_MAX_ROWS = 1500;

/** heavy 時のユーザー別集計ルーム上限（全件スキャンはするが表示・表は cap）。 */
export const HTML_REPORT_AGGREGATE_ROOM_CAP = 500;

/**
 * @param {number} ms
 * @param {(ms: number) => string} formatDateTime
 */
function formatCapturedAt(ms, formatDateTime) {
  return escapeHtml(formatDateTime(typeof ms === 'number' && Number.isFinite(ms) ? ms : 0));
}

/**
 * @param {ReportCommentTableRowInput} c
 * @param {number} idx
 * @param {{
 *   userKeyToResolvedThumb: Map<string, string>,
 *   identiconResolver?: (uid: string) => string,
 *   formatDateTime: (ms: number) => string,
 *   includeInSearch?: boolean
 * }} ctx
 * @returns {string}
 */
export function buildReportCommentTableRowHtml(c, idx, ctx) {
  const commentNo = String(c.commentNo || '').trim();
  const text = String(c.text || '').trim();
  const userId = c.userId ? String(c.userId) : '';
  const userKey = userId || UNKNOWN_USER_KEY;
  const userLabel = displayUserLabel(userKey, String(c.nickname || ''));
  const userLabelHtml = buildUserProfileLinkedLabelHtml(userId, userLabel);
  const search = escapeAttr(
    `${commentNo} ${text} ${userId} ${userLabel} ${String(c.liveId || '')}`.toLowerCase()
  );
  let avatarSrc = ctx.userKeyToResolvedThumb.get(userKey);
  if (avatarSrc === undefined) {
    avatarSrc = resolveReportUserThumbSrc({
      userId: userKey,
      avatarUrl: String(c.avatarUrl || ''),
      identiconResolver: ctx.identiconResolver
    });
  }
  const avatarInlineHtml = avatarSrc
    ? `<img class="report-comment-av" src="${escapeAttr(avatarSrc)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
    : '<span class="report-comment-av report-comment-av--empty"></span>';
  const searchClass =
    ctx.includeInSearch === false ? 'nl-comment-row nl-comment-row--overflow' : 'search-item nl-comment-row';
  return `
      <tr class="${searchClass}" data-search="${search}">
        <td>${idx + 1}</td>
        <td>${escapeHtml(commentNo || '-')}</td>
        <td><span class="report-user-cell">${avatarInlineHtml}<span class="report-user-cell__label">${userLabelHtml}</span></span></td>
        <td>${escapeHtml(text || '-')}</td>
        <td>${formatCapturedAt(Number(c.capturedAt) || 0, ctx.formatDateTime)}</td>
      </tr>
    `;
}

/**
 * 展開用 JSON（アバターなし・軽量行）。
 * @param {ReportCommentTableRowInput[]} comments
 * @param {number} fromIndex
 * @param {(ms: number) => string} formatDateTime
 * @param {number} [toIndex]
 */
function buildOverflowCommentRowsPayload(comments, fromIndex, formatDateTime, toIndex) {
  const end = Math.min(
    comments.length,
    typeof toIndex === 'number' && Number.isFinite(toIndex) ? toIndex : comments.length
  );
  const rows = [];
  for (let i = fromIndex; i < end; i += 1) {
    const c = comments[i] || {};
    const userId = c.userId ? String(c.userId) : '';
    const userKey = userId || UNKNOWN_USER_KEY;
    const userLabel = displayUserLabel(userKey, String(c.nickname || ''));
    rows.push([
      i + 1,
      String(c.commentNo || '').trim(),
      userId,
      userLabel,
      String(c.text || '').trim(),
      formatDateTime(typeof c.capturedAt === 'number' && Number.isFinite(c.capturedAt) ? c.capturedAt : 0)
    ]);
  }
  return JSON.stringify({ schemaVersion: 1, rows }).replace(/</g, '\\u003c');
}

/**
 * @returns {string}
 */
function reportCommentsExpandScriptHtml() {
  return `<script>
(function(){
  var btn=document.getElementById('nl-report-comments-more-btn');
  var tbody=document.getElementById('nl-report-comments-tbody');
  var dataEl=document.getElementById('nl-report-comments-overflow-v1');
  if(!btn||!tbody||!dataEl||btn.disabled)return;
  function cellText(value){
    var td=document.createElement('td');
    td.textContent=value==null?'':String(value);
    return td;
  }
  btn.addEventListener('click',function(){
    if(btn.disabled)return;
    var payload;
    try{payload=JSON.parse(dataEl.textContent||'{}');}
    catch(e){btn.textContent='残りコメントを読めません';return;}
    var rows=Array.isArray(payload.rows)?payload.rows:[];
    if(!rows.length){btn.remove();return;}
    var frag=document.createDocumentFragment();
    rows.forEach(function(row){
      if(!Array.isArray(row)||row.length<6)return;
      var tr=document.createElement('tr');
      tr.className='nl-comment-row nl-comment-row--overflow';
      tr.setAttribute('data-search-scope','comments-overflow');
      tr.appendChild(cellText(row[0]));
      tr.appendChild(cellText(row[1]||'-'));
      var userTd=document.createElement('td');
      var uid=String(row[2]||'');
      var label=String(row[3]||'');
      var userWrap=document.createElement('span');
      userWrap.className='report-user-cell';
      var labelWrap=document.createElement('span');
      labelWrap.className='report-user-cell__label';
      if(/^\\d+$/.test(uid)){
        var a=document.createElement('a');
        a.className='nl-user-profile-link';
        a.href='https://nicovideo.jp/user/'+encodeURIComponent(uid);
        a.target='_blank';
        a.rel='noopener noreferrer';
        a.textContent=label;
        labelWrap.appendChild(a);
      }else{
        labelWrap.textContent=label;
      }
      userWrap.appendChild(labelWrap);
      userTd.appendChild(userWrap);
      tr.appendChild(userTd);
      tr.appendChild(cellText(row[4]||'-'));
      tr.appendChild(cellText(row[5]||'-'));
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
    btn.disabled=true;
    btn.textContent='残り '+rows.length+' 件を表示しました';
    var wrap=btn.closest('.nl-report-comments-more-wrap');
    if(wrap){wrap.style.opacity='.85';}
    dataEl.textContent='';
  });
})();
</script>`;
}

/**
 * @param {{
 *   comments?: ReportCommentTableRowInput[],
 *   initialRows?: number,
 *   userKeyToResolvedThumb?: Map<string, string>,
 *   identiconResolver?: (uid: string) => string,
 *   formatDateTime: (ms: number) => string,
 *   reportCommentsCsv: string
 * }} input
 * @returns {string}
 */
export function buildReportCommentsTableSectionHtml(input) {
  const comments = Array.isArray(input?.comments) ? input.comments : [];
  const heavyExport = comments.length > HTML_REPORT_HEAVY_COMMENT_THRESHOLD;
  const initialRows = Math.max(
    1,
    typeof input?.initialRows === 'number' ? input.initialRows : HTML_REPORT_COMMENTS_TABLE_INITIAL_ROWS
  );
  const userKeyToResolvedThumb =
    input?.userKeyToResolvedThumb instanceof Map ? input.userKeyToResolvedThumb : new Map();
  const formatDateTime = input.formatDateTime;
  const reportCommentsCsv = heavyExport ? '' : String(input.reportCommentsCsv || '');
  const rowCtx = {
    userKeyToResolvedThumb,
    identiconResolver: input.identiconResolver,
    formatDateTime
  };

  const visibleComments = comments.slice(0, initialRows);
  const hiddenCount = Math.max(0, comments.length - visibleComments.length);
  const commentRows = visibleComments.map((c, idx) =>
    buildReportCommentTableRowHtml(c, idx, { ...rowCtx, includeInSearch: true })
  );

  const overflowFromIndex = initialRows;
  const overflowCap = Math.min(
    hiddenCount,
    HTML_REPORT_OVERFLOW_JSON_MAX_ROWS
  );
  const overflowOmitted = hiddenCount - overflowCap;
  const canEmbedOverflowJson = hiddenCount > 0 && !heavyExport && overflowCap > 0;

  const overflowScript = canEmbedOverflowJson
    ? `<script type="application/json" id="nl-report-comments-overflow-v1">${buildOverflowCommentRowsPayload(
        comments,
        overflowFromIndex,
        formatDateTime,
        overflowFromIndex + overflowCap
      )}</script>${reportCommentsExpandScriptHtml()}`
    : '';

  const moreHtml =
    hiddenCount > 0 && canEmbedOverflowJson
      ? `<p class="nl-report-comments-more-wrap"><button type="button" id="nl-report-comments-more-btn" class="nl-report-comments-more-btn">残り ${overflowCap} 件を表示（スクロール軽量化のため折りたたみ中）</button></p>`
      : '';

  const heavyNote = heavyExport
    ? `<p class="guide-lead nl-report-comments-heavy-note">コメントが ${comments.length} 件あるため、HTML への全件 CSV 埋め込みを省略しました（表示は先頭 ${visibleComments.length} 件のみ）。全件が必要なときは拡張パネルから JSON/マーケ分析の CSV をご利用ください。</p>`
    : '';
  const overflowOmittedNote =
    overflowOmitted > 0
      ? `<p class="guide-lead">残り ${overflowOmitted} 件は HTML サイズ制限のため展開ボタン対象外です（先頭 ${visibleComments.length + overflowCap} 件まで表示可能）。</p>`
      : '';

  const displayNote =
    hiddenCount > 0
      ? `<p class="guide-lead">全 ${comments.length} 件中、先頭 ${visibleComments.length} 件を表示しています。${canEmbedOverflowJson ? '残りはボタンで展開するか、CSV で全件取得できます。' : '件数が多いため HTML 内の全件 CSV は省略しています。'}</p>`
      : `<p class="guide-lead">記録した ${comments.length} 件を表示しています。</p>`;

  return `
      <section class="card nl-report-comments-section" id="sec-all-comments" style="margin-top:12px;">
        <h2>保存コメント一覧</h2>
        ${heavyNote}
        ${displayNote}
        ${overflowOmittedNote}
        ${
          reportCommentsCsv
            ? `<p class="guide-lead">
          <button type="button" id="nlReportCsvDownloadBtn" class="nl-report-csv-btn">CSV をダウンロード</button>
          <span class="nl-report-csv-hint">Excel / Google Sheets で開けるのだ（UTF-8 BOM 付き）。</span>
        </p>
        <pre id="nlReportCsvData" hidden>${escapeHtml(reportCommentsCsv)}</pre>`
            : ''
        }
        <div class="nl-report-comments-table-wrap">
          <table>
            <thead><tr><th>#</th><th>commentNo</th><th>user</th><th>text</th><th>capturedAt</th></tr></thead>
            <tbody id="nl-report-comments-tbody">${commentRows.join('') || '<tr><td colspan="5">コメントなし</td></tr>'}</tbody>
          </table>
        </div>
        ${moreHtml}
        ${overflowScript}
      </section>
    `;
}
