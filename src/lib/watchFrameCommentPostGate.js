/**
 * watch 上の各フレームが `NLS_POST_COMMENT` / コメント欄系操作を受けてよいかの判定。
 * DOM 探索は呼び出し側で行い、ここは分岐のみ（単体テスト可能）。
 *
 * 狙い: メイン（top）の watch URL だけでは「この document にコメント UI が無い」フレームを
 * 通さない。従来は `locationAllowsCommentRecording()` が true になり editor poll が最大 8s
 * ブロックし、popup の別 frameId 試行が遅れることがあった。
 *
 * @param {{
 *   hasEditor: boolean,
 *   hasCommentPanel: boolean,
 *   isMainTopFrame: boolean,
 *   isWatchUrl: boolean,
 *   locationAllowsRecording: boolean
 * }} p
 * @returns {boolean}
 */
export function shouldAcceptCommentPostInWatchFrame(p) {
  if (p.hasEditor) return true;
  if (p.hasCommentPanel) return true;
  if (p.isMainTopFrame && p.isWatchUrl) return false;
  return Boolean(p.locationAllowsRecording);
}
