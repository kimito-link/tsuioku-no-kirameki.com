/**
 * 応援グリッド用・診断表示（PII なし・件数のみ）。
 * ユーザー向けは平易な文＋折りたたみの詳細。
 */

import { escapeHtml } from './htmlEscape.js';

/**
 * @typedef {{
 *   total: number,
 *   withUid: number,
 *   withAvatar: number,
 *   uniqueAvatar: number,
 *   resolvedAvatar: number,
 *   resolvedUniqueAvatar: number,
 *   selfShown: number,
 *   selfSaved: number,
 *   selfPending: number,
 *   selfPendingMatched: number,
 *   interceptItems: number,
 *   interceptWithUid: number,
 *   interceptWithAvatar: number,
 *   mergedPatched: number,
 *   mergedUidReplaced: number,
 *   stripped: number,
 *   interceptMapOnPage?: number,
 *   interceptExportRows?: number,
 *   interceptExportCode?: string,
 *   interceptExportDetail?: string,
 *   userLaneDeduped?: number,
 *   userLaneTier3?: number,
 *   userLaneTier2?: number,
 *   userLaneTier1?: number,
 *   userLaneStrongNick?: number,
 *   userLanePersonalThumb?: number
 * }} StoryAvatarDiagSnapshot
 */

/**
 * エクスポート理由コードを短い日本語に（ユーザー向け1行）。
 * @param {string} code
 * @param {string} [detail]
 */
export function interceptExportCodeUserLabel(code, detail = '') {
  const c = String(code || '').trim();
  const d = String(detail || '').trim();
  switch (c) {
    case 'ok':
      return '取り込みに成功しました。';
    case 'ok_empty':
      return '取り込みは成功しましたが、まだ行がありません。watch タブを開いたままにして、ポップアップを更新してみてください。';
    case 'export_rejected':
      return d ? `取り込みをページ側が拒否しました（${d.slice(0, 80)}）` : '取り込みをページ側が拒否しました。';
    case 'message_failed':
      return 'ページとの通信に失敗しました。watch を再読み込み（F5）してから試してください。';
    case 'no_success_response':
      return 'ページから応答がありませんでした。対象の watch タブが開いているか確認してください。';
    default:
      return c ? `状態コード: ${c}` : '状態を取得できませんでした。';
  }
}

/**
 * 開発者向けの1行（従来形式・折りたたみ内）。
 * @param {StoryAvatarDiagSnapshot} s
 * @returns {string|null}
 */
export function formatStoryAvatarDiagLine(s) {
  const totalNum = Math.max(0, Math.floor(Number(s?.total) || 0));
  if (totalNum <= 0) return null;

  let line =
    `診断(技術): 保存アイコンURL ${s.withAvatar}/${totalNum}（種類 ${s.uniqueAvatar}）` +
    ` / 表示に使えたアイコン ${s.resolvedAvatar}/${totalNum}（種類 ${s.resolvedUniqueAvatar}）` +
    ` / ユーザーID ${s.withUid}/${totalNum}` +
    ` / 自分の投稿 表示${s.selfShown}件（保存済${s.selfSaved}, 待ち${s.selfPending}, 一致${s.selfPendingMatched}）` +
    ` / ページから拾った補助 ${s.interceptItems}件（ID${s.interceptWithUid}, アイコン${s.interceptWithAvatar}）` +
    ` / 後から補完 ${s.mergedPatched}件`;
  if (s.mergedUidReplaced > 0) {
    line += `（ID差し替え ${s.mergedUidReplaced}）`;
  }
  if (s.stripped > 0) {
    line += ` / 不整合除去 ${s.stripped}件`;
  }

  const mapOn =
    typeof s.interceptMapOnPage === 'number' && s.interceptMapOnPage >= 0
      ? String(s.interceptMapOnPage)
      : '—';
  const exportRows =
    typeof s.interceptExportRows === 'number' && s.interceptExportRows >= 0
      ? s.interceptExportRows
      : null;
  const exCode = String(s.interceptExportCode || '').trim();
  const exDetail = String(s.interceptExportDetail || '').trim().slice(0, 72);
  if (mapOn !== '—' || exportRows != null || exCode) {
    line += ` / ページ内の一時対応表 ${mapOn}件`;
    if (exportRows != null) line += `・直近の取り込み ${exportRows}行`;
    if (exCode) line += ` [${exCode}]`;
    if (exDetail) line += ` (${exDetail})`;
  }

  const ulDed = Math.max(0, Math.floor(Number(s.userLaneDeduped) || 0));
  if (ulDed > 0) {
    const t3 = Math.max(0, Math.floor(Number(s.userLaneTier3) || 0));
    const t2 = Math.max(0, Math.floor(Number(s.userLaneTier2) || 0));
    const t1 = Math.max(0, Math.floor(Number(s.userLaneTier1) || 0));
    const sn = Math.max(0, Math.floor(Number(s.userLaneStrongNick) || 0));
    const th = Math.max(0, Math.floor(Number(s.userLanePersonalThumb) || 0));
    line += ` / レーン候補${ulDed}（り${t3}/こ${t2}/た${t1}・強名${sn}/個サ${th}）`;
  }

  return line;
}

/**
 * 件数の細かい内訳（ポーリングで数字が変わりやすい）—「詳しい状況」内に出す HTML。
 * @param {StoryAvatarDiagSnapshot} s
 * @returns {string} 常に1ブロックの HTML（0件も明示）
 */
export function buildStoryAvatarDiagVerboseHtml(s) {
  const totalNum = Math.max(0, Math.floor(Number(s?.total) || 0));
  const withUidRaw = Math.max(0, Math.floor(Number(s?.withUid) || 0));
  const resolvedRaw = Math.max(0, Math.floor(Number(s?.resolvedAvatar) || 0));
  const withUidN = totalNum <= 0 ? 0 : withUidRaw;
  const resolvedN = totalNum <= 0 ? 0 : resolvedRaw;

  const leadParts = [];
  leadParts.push(
    `記録している応援コメント <strong>${totalNum}</strong> 件のうち、一覧でアイコンまで表示できているのは <strong>${resolvedN}</strong> 件、ユーザーIDが付いているのは <strong>${withUidN}</strong> 件です。`
  );
  if (totalNum <= 0) {
    return (
      `<div class="nl-story-diag nl-story-diag--verbose">` +
      `<p class="nl-story-diag__lead">${leadParts.join(' ')}</p>` +
      `</div>`
    );
  }
  if (s.mergedPatched > 0) {
    leadParts.push(
      `あとから情報が足りて埋まった行が <strong>${s.mergedPatched}</strong> 件あります。`
    );
  }
  if (s.selfShown > 0 || s.selfPending > 0 || s.selfSaved > 0) {
    leadParts.push(
      `あなたが送ったコメントは、画面上 <strong>${s.selfShown}</strong> 件・このPCに保存済み <strong>${s.selfSaved}</strong> 件・照合待ち <strong>${s.selfPending}</strong> 件です。`
    );
  }
  if (s.interceptItems > 0) {
    leadParts.push(
      `視聴ページの通信から拾った利用者情報（アイコンや名前の補助）が <strong>${s.interceptItems}</strong> 件分あります。`
    );
  }

  const ulDed = Math.max(0, Math.floor(Number(s.userLaneDeduped) || 0));
  if (ulDed > 0) {
    const t3 = Math.max(0, Math.floor(Number(s.userLaneTier3) || 0));
    const t2 = Math.max(0, Math.floor(Number(s.userLaneTier2) || 0));
    const t1 = Math.max(0, Math.floor(Number(s.userLaneTier1) || 0));
    const sn = Math.max(0, Math.floor(Number(s.userLaneStrongNick) || 0));
    const th = Math.max(0, Math.floor(Number(s.userLanePersonalThumb) || 0));
    leadParts.push(
      `ユーザーレーンの候補（重複のない利用者）<strong>${ulDed}</strong> 件のうち、りんく列相当 <strong>${t3}</strong>・こん太 <strong>${t2}</strong>・たぬ姉 <strong>${t1}</strong>。強い表示名として扱えたのは <strong>${sn}</strong> 件、個人サムネありは <strong>${th}</strong> 件です（ニコの「user 英数字」仮名は強い表示名に入りません）。`
    );
  }

  const mapOn =
    typeof s.interceptMapOnPage === 'number' && s.interceptMapOnPage >= 0
      ? s.interceptMapOnPage
      : null;
  const exCode = String(s.interceptExportCode || '').trim();
  if (mapOn != null || exCode) {
    const extra = [];
    if (mapOn != null) {
      extra.push(
        `いまの watch タブ内の「コメント番号と利用者の対応表」は <strong>${mapOn}</strong> 件です（タブを閉じると消えます）。`
      );
    }
    if (exCode) {
      extra.push(
        escapeHtml(
          interceptExportCodeUserLabel(
            exCode,
            String(s.interceptExportDetail || '')
          )
        )
      );
    }
    leadParts.push(extra.join(' '));
  }

  return (
    `<div class="nl-story-diag nl-story-diag--verbose">` +
    `<p class="nl-story-diag__lead">${leadParts.join(' ')}</p>` +
    `</div>`
  );
}

/**
 * ユーザー向け HTML（グリッド直上は短い文のみ。細かい内訳は buildStoryAvatarDiagVerboseHtml）。
 * @param {StoryAvatarDiagSnapshot} s
 * @returns {string|null}
 */
export function buildStoryAvatarDiagHtml(s) {
  const totalNum = Math.max(0, Math.floor(Number(s?.total) || 0));
  if (totalNum <= 0) {
    return (
      '<div class="nl-story-diag nl-story-diag--compact">' +
      '<p class="nl-story-diag__lead">' +
      '記録している応援コメント <strong>0</strong> 件です。' +
      '</p></div>'
    );
  }

  const technical = formatStoryAvatarDiagLine(s);
  const glossary =
    '<ul class="nl-story-diag__list">' +
    '<li><strong>保存アイコン</strong>：このPCの記録に、アイコンのURLとして残っている件数です。</li>' +
    '<li><strong>表示アイコン</strong>：グリッドなどで実際に画像として使えている件数です。</li>' +
    '<li><strong>ページから拾った補助</strong>：ニコ生のページが読み取る通信から、拡張が利用者表示を補うために使う情報です（本文は保存しません）。</li>' +
    '<li><strong>一時対応表</strong>：開いている watch タブのメモリ上だけにある対応表で、キャッシュとは別です。</li>' +
    '<li><strong>ユーザーレーンの段</strong>：記録コメントの表示名・サムネURL・成長タイル用の解決結果から「強い名前」「個人サムネ」を判定しています。公式の仮名のままだとこん太・たぬ姉に寄りやすいです。</li>' +
    '</ul>';

  const compactLead =
    `記録している応援コメント <strong>${totalNum}</strong> 件です。` +
    `件数の内訳（アイコン・ユーザーID・レーン・取り込みなど）は、下の「詳しい状況（開発・切り分け用）」を開くと読めます。`;

  return (
    `<div class="nl-story-diag nl-story-diag--compact">` +
    `<p class="nl-story-diag__lead">${compactLead}</p>` +
    `<details class="nl-story-diag__more">` +
    `<summary class="nl-story-diag__summary">内訳・用語（詳しく見る）</summary>` +
    `<div class="nl-story-diag__body">` +
    glossary +
    (technical
      ? `<p class="nl-story-diag__technical">${escapeHtml(technical)}</p>`
      : '') +
    `</div></details></div>`
  );
}
