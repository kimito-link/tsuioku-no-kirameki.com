/**
 * v0.1.639: paint 内の「重い diag 集計(全件 O(N))をスクロール中スキップしてよいか」の純判定。
 *
 * 背景(スクロール重さ根治 PR4・[[reference_scroll_5yr_architecture_plan]]):
 *   paintWatchPopupUi 冒頭の withUid/withAvatar/uniqueAvatar/resolvedAvatar は全件 O(N)。
 *   これらは storyAvatarDiag の折りたたみ詳細(formatStoryAvatarDiagLine)と dev monitor
 *   (別途ゲート済)でしか読まれず、スクロール中は見えない。よってスクロール中(かつ同 liveId が
 *   既に描画済=初回/配信切替は除外)はスキップしてメインスレッドを空ける。
 *
 *   既存 _perfDeferActive(renderUserRooms/renderCharacterScene の白フラッシュ対策)と同じ
 *   「スクロール中 AND 描画済」条件。初回・配信切替(alreadyPainted=false)では必ず計算する=
 *   古い/空の値で固定されない(更新停止バグの予防)。
 *
 * 純関数(DOM を参照しない)。呼び出し側が DOM 由来の真偽値を渡す。
 *
 * @module diagPaintDeferGate
 */

/**
 * 重い diag 集計をスキップしてよいか。
 *
 * @param {object} args
 * @param {boolean} args.scrolling スクロール直後の見送り窓内か(shouldDeferHeavyPopupPaintNow)。
 * @param {boolean} args.alreadyPainted 同 liveId のユーザールームが既に描画済か
 *   (初回/配信切替では false=必ず計算させる)。
 * @returns {boolean} true なら重い O(N) diag 集計をスキップしてよい。
 */
export function shouldSkipHeavyDiagPaint(args) {
  return args?.scrolling === true && args?.alreadyPainted === true;
}
