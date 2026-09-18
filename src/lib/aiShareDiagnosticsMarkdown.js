/**
 * AI 共有用「診断バンドル」Markdown の整形（純粋関数）。
 *
 * popup-entry.js から Track A（refactor Phase 4）で切り出した
 * `formatAiShareDiagnosticsMarkdown` / `romiDebugDataChecklist`（挙動不変）。
 * どちらも DOM/fetch/chrome/module-level 状態に依存しない（データは引数で受ける）ため
 * lib へ移せる。Track B 4-2（開発モニタのエクスポート/DL）の負担軽減も兼ねる。
 */

/**
 * 改善切り分けに必要な観測データ（ロミ式: 入口/経路/出口を最短で絞る）。
 * @returns {string[]}
 */
export function romiDebugDataChecklist() {
  return [
    '`diagSchemaVersion`（診断 JSON ルート）',
    '`content.romiDebug`（取り込み入口/保存ゲート）',
    '`content.giftDiagnostics.rankingDiag`（自動オープン失敗の段）',
    '`content.commentObservability`（NDGR/DOM 経路比率）',
    'watch URL（lv番号）',
    'popup exportedAt / content exportedAt',
    'intercept map size',
    'ndgr pending / ndgrLastReceivedAgo',
    'lastPersistBatch / persistGateFailures'
  ];
}

/**
 * 診断バンドルを AI に貼れる Markdown へ整形する。既存挙動そのまま。
 *
 * @param {{
 *   extensionName: string;
 *   extensionVersion: string;
 *   watchUrlNote: string;
 *   lastSendMessageError: string;
 *   payload: Record<string, unknown>;
 * }} parts
 * @returns {string}
 */
export function formatAiShareDiagnosticsMarkdown(parts) {
  const lines = [];
  lines.push('## nicolivelog 診断バンドル（AI 共有用）');
  lines.push('');
  lines.push(
    '次の JSON ブロックをそのまま AI に貼ってください。拡張を再読み込みした直後は watch ページを **F5** してください。'
  );
  lines.push('');
  lines.push(`- 拡張: ${parts.extensionName} v${parts.extensionVersion}`);
  lines.push(`- 診断スキーマ: \`${String(parts.payload?.diagSchemaVersion || '') || '（未付与）'}\`（LLM への再現用バージョン）`);
  lines.push(`- タブ選択: ${parts.watchUrlNote}`);
  if (parts.lastSendMessageError) {
    lines.push(`- content への送信: \`${parts.lastSendMessageError}\``);
  }
  lines.push(
    '- 重点確認: `content.romiDebug`（取り込み入口/補完/保存ゲートの全体像。ここを見ると不具合の段が特定しやすいです）'
  );
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(parts.payload, null, 2));
  lines.push('```');
  return lines.join('\n');
}
