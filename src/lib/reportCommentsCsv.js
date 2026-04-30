/**
 * 保存コメント配列を「Excel / LibreOffice / Google Sheets で安全に開ける CSV」に変換する純関数。
 *
 * 設計（0.1.21 V: HTML レポート無料拡張で CSV ダウンロードボタンを追加）:
 *   - RFC 4180 準拠（CRLF 改行 / カンマ・引用符・改行を含む値はダブルクォートで囲む）。
 *   - **CSV インジェクション対策**: 値が `= + @ - \t` で始まる場合は先頭に
 *     シングルクォートを付加し、さらに二重引用符で囲む。Excel が
 *     `=cmd|"/C calc"!A1` のような値を関数として実行する事例を防ぐ。
 *   - 列: `#, commentNo, userId, nickname, text, vpos, is184, selfPosted, capturedAtIso`
 *     （`capturedAtIso` は ISO 8601、未取得は空欄）。
 */

const HEADER_COLUMNS = Object.freeze([
  '#',
  'commentNo',
  'userId',
  'nickname',
  'text',
  'vpos',
  'is184',
  'selfPosted',
  'capturedAtIso'
]);

/**
 * CSV 1 セルを RFC 4180 + Excel injection 対策でエスケープする。
 * @param {unknown} value
 * @returns {string}
 */
export function csvEscapeField(value) {
  if (value == null) return '';
  let s = String(value);
  const startsWithFormula = /^[=+\-@\t]/.test(s);
  if (startsWithFormula) s = `'${s}`;
  const needsQuotes = startsWithFormula || /[",\r\n]/.test(s);
  if (!needsQuotes) return s;
  const inner = s.replace(/"/g, '""');
  return `"${inner}"`;
}

/**
 * @typedef {{
 *   commentNo?: unknown,
 *   userId?: unknown,
 *   nickname?: unknown,
 *   text?: unknown,
 *   vpos?: unknown,
 *   capturedAt?: unknown,
 *   selfPosted?: unknown
 * }} CsvCommentInput
 */

/**
 * @param {CsvCommentInput[] | null | undefined} comments
 * @returns {string}
 */
export function buildReportCommentsCsv(comments) {
  const list = Array.isArray(comments) ? comments : [];
  const rows = [HEADER_COLUMNS.join(',')];
  for (let i = 0; i < list.length; i++) {
    const c = list[i] || {};
    const uid = c.userId == null ? '' : String(c.userId);
    const is184 = uid.startsWith('a:');
    const selfPosted = Boolean(c.selfPosted);
    const at = typeof c.capturedAt === 'number' && Number.isFinite(c.capturedAt) && c.capturedAt > 0
      ? new Date(c.capturedAt).toISOString()
      : '';
    const vposStr =
      typeof c.vpos === 'number' && Number.isFinite(c.vpos) ? String(c.vpos) : '';
    const cells = [
      String(i + 1),
      csvEscapeField(c.commentNo),
      csvEscapeField(uid),
      csvEscapeField(c.nickname),
      csvEscapeField(c.text),
      vposStr,
      is184 ? 'true' : 'false',
      selfPosted ? 'true' : 'false',
      csvEscapeField(at)
    ];
    rows.push(cells.join(','));
  }
  return rows.join('\r\n') + '\r\n';
}
