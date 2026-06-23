/**
 * 「Alt+Tab に出てこない裏 watch タブ(active:false)」の判定。
 *
 * 背景(council/orphan-tab-survivor-SYNTHESIS.md):
 *   過去の自動巡回(autopatrol)や削除済みの古い重複拡張が `chrome.tabs.create({ active:false })`
 *   で開いた【裏タブ】が生き残ることがある。active:false なので Alt+Tab に出ないが content script は
 *   走り「視聴中・記録中」と表示される。autopatrol は停止済み(新規は生まれない)だが、既存の遺物は
 *   URL マーカーも visited 履歴も失っており、手動の「裏で流し見」タブと観測上は区別できない。
 *
 *   そこで自動クローズはせず(誤爆ゼロ)、status が「このタブは Alt+Tab に出ない裏タブです」と正直に
 *   表示し、ユーザーがボタンを押したときだけ閉じる。この純関数は「提示すべき裏タブか」を tab の
 *   active フラグだけから副作用なく判定する(将来の放置時間しきい値拡張の足場にもなる)。
 *
 * @module backgroundWatchTab
 */

/**
 * watch タブが「Alt+Tab に出ない裏タブ(閉じる候補として提示すべき)」かを判定する純関数。
 *
 * 前面で見ているタブ(active:true)は絶対に提示しない(手動視聴の誤爆防止)。tabId が無効なものも
 * 提示しない(閉じる対象にできない)。
 *
 * @param {{ active?: unknown, tabId?: unknown }|null|undefined} tabInfo
 * @returns {boolean} active:false かつ有効な tabId を持つときだけ true
 */
export function isBackgroundWatchTab(tabInfo) {
  if (!tabInfo || typeof tabInfo !== 'object') return false;
  // active が明示的に false のときだけ「裏タブ」。true / 不明(undefined)は提示しない(安全側)。
  if (tabInfo.active !== false) return false;
  const id = Number(tabInfo.tabId);
  if (!Number.isFinite(id) || id < 0) return false;
  return true;
}
