// venueTuckState.js — 会場の「しまう」と「送りのあいだ公式へ通す」の印を見分ける。
//   送りの処理は js の tucked フラグを触れない(会場RevealOfficialComposer.js)。
//   印だけ付いているときにトグルを押すと、開閉と勘違いして会場を本当に閉じてしまうのを防ぐ。
// @layer L1 — クラス名を見るだけ
export const VENUE_TUCK_CLASS = 'nlsb-is-tucked';
export const VENUE_COMPOSER_PASS_CLASS = 'nlsb-is-composer-pass';

/**
 * トグルや Esc は、しまい中・送りの通過中なら閉じずに戻す。
 * @param {boolean} tuckedFlag venueBar の js の tucked
 * @param {Element | null | undefined} root #nlsb-venue-root
 */
export function venueToggleShouldUntuck(tuckedFlag, root) {
  if (tuckedFlag) return true;
  if (!root || !root.classList) return false;
  return root.classList.contains(VENUE_TUCK_CLASS) || root.classList.contains(VENUE_COMPOSER_PASS_CLASS);
}
