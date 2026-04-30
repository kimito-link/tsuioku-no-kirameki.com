/**
 * コメント送信エラー文に「再読み込み案内」を 1 回だけ追加する純関数。
 *
 * 設計（0.1.38 AM: popup-entry.js コンポーネント分割の続き）:
 *   - すでに「再読み込み」「F5」「別タブ」「前面」を含むメッセージには追加しない
 *     （二重案内を防ぐ）。
 *   - 「chrome://extensions」「「更新」」を含まないメッセージには拡張更新案内も追加。
 *   - エラーメッセージが空の場合は空文字を返す（"※うまくいかないとき" を単独で出さない）。
 */

/** 拡張コンテキスト無効化・更新手順の共通文案（UI とヒントで揃える） */
export const EXTENSION_RELOAD_USER_GUIDE_JA =
  '改善しなければ chrome://extensions を開き、「君斗りんくの追憶のきらめき」の「更新」で拡張を再読み込みしてください。';

/**
 * @param {string|null|undefined} message 元のエラーメッセージ
 * @returns {string} 必要に応じて再読み込み案内を追加したメッセージ
 */
export function withCommentSendTroubleshootHint(message) {
  const s = String(message == null ? '' : message).trim();
  if (!s) return '';
  /** @type {string[]} */
  const hintLines = [];
  if (!/再読み込み|F5|別タブ|前面/.test(s)) {
    hintLines.push(
      'watchページを再読み込み（F5）し、別タブで開いている放送ページを前面にしてください。'
    );
  }
  if (!/chrome:\/\/extensions|「更新」/.test(s)) {
    hintLines.push(EXTENSION_RELOAD_USER_GUIDE_JA);
  }
  return hintLines.length ? `${s}\n※うまくいかないとき: ${hintLines.join('\n')}` : s;
}
