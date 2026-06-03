/**
 * 視聴者本人のギフト／広告システムコメント判定（ニコ生の表記揺れに耐える）。
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeCelebrationDisplayName(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

/**
 * 「りんく＠クリエイター応援」→「りんく」など、広告コメの長い表示名を短くする。
 * @param {unknown} value
 * @returns {string}
 */
export function stripCreatorSuffixFromDisplayName(value) {
  return normalizeCelebrationDisplayName(value)
    .replace(/＠.+$/u, '')
    .replace(/@.+$/u, '')
    .trim();
}

/**
 * パース済み送り主名がログイン中の視聴者と同一とみなせるか（保守的に複数パターン）。
 *
 * @param {unknown} sender
 * @param {unknown} viewerNickname
 * @param {unknown} viewerUserId
 * @returns {boolean}
 */
export function senderLooksLikeViewer(sender, viewerNickname, viewerUserId) {
  const s = normalizeCelebrationDisplayName(sender);
  if (!s) return false;
  const nick = normalizeCelebrationDisplayName(viewerNickname);
  const uid = String(viewerUserId || '').trim();
  if (uid && (s === uid || s.includes(uid))) return true;
  if (nick && s === nick) return true;
  const sBase = stripCreatorSuffixFromDisplayName(s);
  const nickBase = stripCreatorSuffixFromDisplayName(nick);
  if (!sBase || !nickBase) return false;
  if (sBase === nickBase) return true;
  if (sBase.length >= 2 && nickBase.length >= 2) {
    if (sBase.includes(nickBase) || nickBase.includes(sBase)) return true;
  }
  return false;
}
