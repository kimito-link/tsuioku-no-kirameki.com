/**
 * avatar URL の長さ上限を一元適用する純関数（H2 / D-5 / S-13 の根治）。
 *
 * レイヤ: shared/ (どこからでも import 可)
 * pure: yes
 *
 * 経緯:
 *   0.1.10 で `commentRecord.createCommentEntry` に `slice(0, 2000)` を入れて
 *   storage quota DoS を一段防ぎつつ、`patchExistingComment` /
 *   `userCommentProfileCache.normalizeUserCommentProfileMap` / `mergeGiftUsers`
 *   などの他経路では未適用だった。同じロジックを散らさず、本 helper を 1 source
 *   of truth として参照させる。
 *
 * 設計方針:
 *   ・null / undefined / 非 string も「空文字」にする（型ガード）
 *   ・前後空白だけ trim、中の空白は保持
 *   ・既定上限は 2000（`userCommentProfileCache.js` の従来仕様と同じ）
 *   ・呼び出し側で max を指定可（テスト・別文脈用）
 */

/** 既定の avatar URL 上限。userCommentProfileCache.js の従来 slice 値と同じ */
export const AVATAR_URL_DEFAULT_MAX = 2000;

/**
 * @param {unknown} raw
 * @param {number} [max=AVATAR_URL_DEFAULT_MAX]
 * @returns {string}
 */
export function clampAvatarUrl(raw, max = AVATAR_URL_DEFAULT_MAX) {
  if (typeof raw !== 'string') return '';
  const s = raw.trim();
  if (!s) return '';
  const cap = Math.floor(Number(max));
  if (!Number.isFinite(cap) || cap <= 0) return '';
  return s.length <= cap ? s : s.slice(0, cap);
}
