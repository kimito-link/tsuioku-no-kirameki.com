/**
 * v0.1.637: 開発者診断パネル(dev monitor)の重い集計を「パネルが開いているときだけ」走らせる
 * ゲート判定(純ロジック)。
 *
 * 背景(2026-06-05 スクロール重さ根治 会議・[[reference_scroll_5yr_architecture_plan]]):
 *   popup-entry.js#paintWatchPopupUi は dev monitor 用に summarizeStoredCommentAvatarStats /
 *   countResolvedAvatarEntries / summarizeStoredCommentProfileGaps の **全件 O(N) 集計 3 本 +
 *   renderDevMonitorPanel(内部 storage I/O)** を**毎 450ms 無条件**に実行していた。
 *   dev monitor は `<details id="devMonitorDetails">`(popup.html)= **折りたたみ式で通常は閉**。
 *   閉じている間この集計は画面に一切出ないのに、1 万件超の配信ではスクロール中も毎 tick 走り、
 *   メインスレッドを圧迫していた(スクロール激重の一因)。
 *
 *   本判定で「パネルが開いているときだけ集計する」=閉時は O(N)×3 + I/O が丸ごと消える。
 *   表示中の挙動は完全不変(開いていれば従来どおり全部走る)。
 *
 * 純関数(DOM/chrome を参照しない)。呼び出し側が `details?.open` 等の真偽値を渡す。
 *
 * @module devMonitorPaintGate
 */

/**
 * dev monitor の重い集計・描画を実行すべきか判定する。
 *
 * @param {object} args
 * @param {boolean} args.panelOpen dev monitor パネル(<details>)が開いているか。
 *   呼び出し側が `devMonitorDetails?.open === true` を渡す。要素が無い(null)場合は false。
 * @returns {boolean} true なら集計+描画を実行してよい。false なら丸ごとスキップ。
 */
export function shouldRunDevMonitorPaint(args) {
  return args?.panelOpen === true;
}
