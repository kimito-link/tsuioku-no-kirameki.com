// @ts-nocheck — 鏡スナップショット(任意形)を歩いて整形する
/**
 * 状態速報に「応援コメント(最新N件・本文)」を出す整形 lib。
 *
 * 狙い = ユーザー指摘「配信の実コメントが診断ページに載っていない」。状態速報は数字と診断だけで、
 *   コメント本文そのものが1件も出ていなかった(buildLiveBlockText は件数/率/来場/pt のみ)。
 *   応援ライブビューが描いている当のコメント(commentTimelineMirror=最新N件)を、状態速報にも
 *   【貼るだけ】で載せる。これで「いま何がコメントされているか」がスクショ往復なしで分かる。
 *
 * ★制約(role-separation-design §6): 新規 storage read を増やさない。jsonBlob に既に同梱されている
 *   commentTimelineMirror をそのまま読む純関数(chrome 非依存)。名寄せ/fetch はしない(鏡の値だけ)。
 *
 * 鏡の形(commentTimelineMirror.js):
 *   { liveId, capturedAt, rows: [{ at, name, text, avatarUrl, userId, kind }], totalSeen }
 *
 * @module commentTimelineReport
 */

/** 文字列化(null/undefined→'')。前後空白除去。 */
function s(v) {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}

/** 表示するコメント本文の最大件数(下から=最新)。状態速報を膨らませすぎない。 */
const REPORT_COMMENT_MAX = 20;

/**
 * 状態速報用の「応援コメント(最新N件)」行を組み立てる。
 *   - 鏡が無い/空 → 「(まだコメントの鏡がありません)」を1行だけ返す(空配列にしない=載ってないことが分かる)。
 *   - 鏡あり → 見出し + 最新 REPORT_COMMENT_MAX 件を「名前: 本文」で出す(本文のみの匿名は「(匿名): 本文」)。
 *
 * @param {{ liveId?: string, capturedAt?: number, rows?: Array<object>, totalSeen?: number }|null|undefined} mirror
 * @param {number} [nowMs] 鮮度(何秒前)表示用。省略時は付けない。
 * @returns {string[]} 状態速報に push する行(空配列なら呼び出し側は何も出さない)
 */
export function formatCommentTimelineReportLines(mirror, nowMs) {
  const lines = [];
  lines.push('### 応援コメント(最新の本文)');
  const rows = mirror && Array.isArray(mirror.rows) ? mirror.rows : [];
  // 本文 or 名前があるものだけを表示対象にする(空行は出さない)。
  const renderable = rows.filter((r) => r && (s(r.text) || s(r.name)));
  if (!renderable.length) {
    lines.push('  (まだコメントの鏡がありません。応援ライブビューを開く/コメントが流れると、ここに最新の本文が出ます)');
    return lines;
  }
  // 鮮度(何秒前のコメント鏡か)を1行。capturedAt が無ければ付けない。
  const capturedAt = Number(mirror && mirror.capturedAt) || 0;
  if (capturedAt > 0 && Number.isFinite(Number(nowMs))) {
    const ageSec = Math.max(0, Math.round((Number(nowMs) - capturedAt) / 1000));
    const totalSeen = Number(mirror && mirror.totalSeen) || renderable.length;
    lines.push(`  (鏡 ${renderable.length} 件・約${ageSec}秒前 / 観測累計 ${totalSeen} 件)`);
  }
  // 最新 REPORT_COMMENT_MAX 件(末尾=最新)。古い順に並べて「上から下へ時間が進む」自然な読み順にする。
  const shown = renderable.slice(-REPORT_COMMENT_MAX);
  for (const r of shown) {
    const name = s(r.name) || '(匿名)';
    const text = s(r.text);
    // kind がギフト/システム等なら印を付けて通常コメントと区別する(鏡の値をそのまま使う)。
    const kind = s(r.kind);
    const mark = kind && kind !== 'comment' && kind !== 'chat' ? `[${kind}] ` : '';
    lines.push(`  ${mark}${name}: ${text}`.trimEnd());
  }
  return lines;
}
