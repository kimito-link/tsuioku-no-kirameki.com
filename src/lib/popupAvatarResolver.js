/**
 * v0.1.206 Phase B: popup 表示の avatar URL を統一的に解決する純関数。
 *
 * 既存 intercept 経路で取れた URL を優先、取れない場合は uid から
 * `pickAvatarUrlForUid` で生成する（v0.1.203 の deriveAvatarUrlFromUid 経由）。
 * popup-entry.js の各 avatar 表示箇所（応援グリッド / story / コメント一覧 /
 * top support rank strip）で同じロジックを使い、avatar 取得率を 80%+ に
 * 引き上げる。
 *
 * 副作用なし。
 */

import { pickAvatarUrlForUid } from './deriveAvatarUrlFromUid.js';

/**
 * popupUserCommentProfileMap (= `Record<uid, { avatarUrl?: string, ... }>`) から
 * avatar URL を解決。intercept 由来の URL を優先、なければ uid から生成。
 *
 * @param {string|number|null|undefined} uid
 * @param {Record<string, { avatarUrl?: string }>|null|undefined} commentProfileMap
 * @param {'s'|'m'} [size]
 * @returns {string}
 */
export function resolveAvatarUrlFromCommentProfileMap(
  uid,
  commentProfileMap,
  size = 's'
) {
  const key = String(uid ?? '').trim();
  if (!key) return '';
  const entry =
    commentProfileMap && typeof commentProfileMap === 'object'
      ? /** @type {any} */ (commentProfileMap)[key]
      : null;
  const intercepted = String(entry?.avatarUrl || '').trim();
  if (intercepted) return intercepted;
  return pickAvatarUrlForUid(uid, null, size);
}

/**
 * `Record<uid, avatarUrl>` または `Map<uid, avatarUrl>` 形式から avatar URL を
 * 解決するラッパー。`pickAvatarUrlForUid` の薄いエイリアスだが、popup 側の
 * 呼び出し箇所で「resolver」名で統一するため export する。
 *
 * @param {string|number|null|undefined} uid
 * @param {Record<string, string>|Map<string, string>|null|undefined} avatarMap
 * @param {'s'|'m'} [size]
 * @returns {string}
 */
export function resolveAvatarUrlFromMap(uid, avatarMap, size = 's') {
  return pickAvatarUrlForUid(uid, avatarMap, size);
}

/**
 * 候補リスト（intercept URL / 既存 entry の URL）の中から最初の有効 URL を選び、
 * 全部空なら uid から生成。多段 fallback が必要な場面（例: story user lane で
 * 既存 storyEntry.avatarUrl + comment profile map + uid 生成の 3 段）で使う。
 *
 * @param {string|number|null|undefined} uid
 * @param {Array<string|null|undefined>} candidates  候補（先頭優先）
 * @param {'s'|'m'} [size]
 * @returns {string}
 */
export function resolveAvatarUrlWithCandidates(uid, candidates, size = 's') {
  if (Array.isArray(candidates)) {
    for (const c of candidates) {
      const s = String(c ?? '').trim();
      if (s) return s;
    }
  }
  return pickAvatarUrlForUid(uid, null, size);
}

/**
 * F3(v0.1.282): 観測信号 API（加法追加・表示用 API は不変）。
 *
 * commentProfileMap に「intercept 由来の実 avatar URL」が観測できているかだけ
 * を返す。`resolveAvatarUrlFromCommentProfileMap` は未観測でも uid から合成
 * canonical URL を返すため、戻り値の有無で「観測済みか」を判定できない
 * （退会/未設定ユーザーの 404 を "観測済み" と誤提示する原因）。
 *
 * `userEntryAvatarResolve.js` の `avatarObserved`（実 URL のみ true、合成
 * canonical は含めない）と同じ思想。tier / avatar 品質判定が「avatar あり」
 * 信号にこちらを使えば、合成 URL を観測扱いする退行を防げる。表示ロジックは
 * 一切変えない（合成フォールバックは UX 維持のため継続）。
 *
 * @param {string|number|null|undefined} uid
 * @param {Record<string, { avatarUrl?: string }>|null|undefined} commentProfileMap
 * @returns {boolean} intercept 由来の実 URL を観測できていれば true
 */
export function isAvatarObservedInCommentProfileMap(uid, commentProfileMap) {
  const key = String(uid ?? '').trim();
  if (!key) return false;
  const entry =
    commentProfileMap && typeof commentProfileMap === 'object'
      ? /** @type {any} */ (commentProfileMap)[key]
      : null;
  return Boolean(String(entry?.avatarUrl || '').trim());
}
