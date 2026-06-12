/**
 * 応援タイムラインの重い全件読み込みを実行してよいか判定する。
 * 明示的な閉状態は standalone でも優先し、未指定時だけ standalone を既定開扱いにする。
 *
 * @param {{ detailsOpen?: boolean, isStandaloneWindow?: boolean }} input
 * @returns {boolean}
 */
export function shouldRefreshSupportTimeline(input = {}) {
  if (input.detailsOpen === false) return false;
  if (input.detailsOpen === true) return true;
  return input.isStandaloneWindow === true;
}
