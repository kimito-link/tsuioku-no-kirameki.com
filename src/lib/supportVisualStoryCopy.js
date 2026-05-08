/**
 * アイコン列・診断ブロックで共有する文言（二重定義防止）。
 * DOM 非依存・chrome 非依存。
 */

/** 折りたたみ「詳しい状況」の見出しと一致させる */
export const SUPPORT_VISUAL_DEV_MONITOR_SUMMARY_LABEL =
  '詳しい状況（開発・切り分け用）';

/**
 * 三段レーンの stack 用 aria-label（件数はレーン枠の合計）。
 * @param {number} laneDisplayedSlots
 * @returns {string}
 */
export function buildStoryUserLaneStackAriaLabel(laneDisplayedSlots) {
  const n = Math.max(0, Math.floor(Number(laneDisplayedSlots) || 0));
  return `最近の応援ユーザーサムネイル（りんく・こん太・たぬ姉の三段）合計${n}件`;
}

/**
 * 応援グリッド直下 `#sceneStoryGaugeLabel` の案内（popup.html 初期表示と同期すること）。
 */
export const STORY_SUPPORT_GROWTH_GAUGE_HELP =
  '記録した応援コメントの件数に応じて、下にアイコンが並びます（ホバーでプレビュー・クリックで詳細）。';

/**
 * メーター下の1行ラベル全文（記録件数＋操作案内）。
 * @param {number} recordedCommentCount `setSceneStory` の opts.count と同じ
 * @returns {string}
 */
export function buildStoryGaugeMeterLabelText(recordedCommentCount) {
  const n = Math.max(0, Math.floor(Number(recordedCommentCount) || 0));
  const help = STORY_SUPPORT_GROWTH_GAUGE_HELP;
  const escHint = 'Esc・外側クリックで詳細を閉じられます。';
  if (n <= 0) {
    return `応援コメントの記録がまだありません。${help}`;
  }
  return `いま ${n.toLocaleString('ja-JP')} 件記録しています。${help}${escHint}`;
}
