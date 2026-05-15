/**
 * 北極星「公式値レーン」待機 UI のバッジ用キャラ画像。
 * 拡張ルートからの相対パス（popup では chrome.runtime.getURL で解決）。
 */

/** @type {Readonly<Record<string, string>>} */
const BADGE_TO_REL = Object.freeze({
  りんく: 'images/yukkuri-charactore-english/link/link-yukkuri-smile-mouth-closed.png',
  こん太: 'images/yukkuri-charactore-english/konta/kitsune-yukkuri-smile-mouth-closed.png',
  たぬ姉: 'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-normal-mouth-open.png'
});

/**
 * @param {unknown} badgeLabel `getNorthStarWaitRotationMessages` の badge 文字列
 * @returns {string|null} 画像相対パス。未対応ラベルは null
 */
export function northStarWaitBadgeToImageRelativePath(badgeLabel) {
  const k = String(badgeLabel || '').trim();
  return BADGE_TO_REL[k] || null;
}
