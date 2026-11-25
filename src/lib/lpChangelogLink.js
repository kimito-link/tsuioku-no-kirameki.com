/**
 * lpChangelogLink.js — 拡張の版番号から、紹介ページの「その版の説明」への URL を作る（純関数）。
 *
 * 0.1.2229（りんく「バージョン番号をクリックしたときに LP に飛ぶべき」）:
 *   ・拡張の中は「版番号＋一言」だけにして、詳しい説明は紹介ページで読む。
 *   ・紹介ページの全版一覧（tsuioku-no-kirameki/changelog.html）は、
 *     版ごとに id="v<版>" を持つ。版を消さないので、一度出したリンクは切れない。
 *   ・通信はしない。URL の文字列を作るだけ（開くのはクリックしたときの <a target="_blank">）。
 */

/** 紹介ページの全版一覧（正本は scripts/lp-changelog-page.mjs が生成）。 */
export const LP_CHANGELOG_PAGE_URL = 'https://tsuioku-no-kirameki.com/changelog.html';

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

/**
 * 版ごとの id（例: 0.1.2229 → "v0.1.2229"）。版でなければ空文字。
 * @param {unknown} version
 * @returns {string}
 */
export function lpChangelogAnchorId(version) {
  const v = typeof version === 'string' ? version.trim().replace(/^v/, '') : '';
  return SEMVER_RE.test(v) ? `v${v}` : '';
}

/**
 * 版の説明への URL。版が分からないときは一覧のページそのもの。
 * @param {unknown} version
 * @returns {string}
 */
export function lpChangelogUrl(version) {
  const id = lpChangelogAnchorId(version);
  return id ? `${LP_CHANGELOG_PAGE_URL}#${id}` : LP_CHANGELOG_PAGE_URL;
}
