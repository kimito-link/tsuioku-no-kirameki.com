/**
 * ニコニコ ユーザープロフィール 無認証 API の URL 組立 & 正規化（純関数）。
 *
 * 目的:
 *   ギフト送信者・広告主・貢献者など「記名 uid」が判明したとき、その uid から
 *   nickname と個人サムネを引いて、ギフト履歴・貢献度ランキング・コメント全体に
 *   反映する（ユーザー要望「投げた人がわかればサムネ/アカウント/リンクを反映」）。
 *
 * 経緯（2026-05-23 実機 curl 確証）:
 *   - レガシー api.ce.nicovideo.jp/api/v1/user.info は 403/PATH NOT FOUND（死亡）。
 *   - 現行 `GET https://nvapi.nicovideo.jp/v1/users/<uid>` が無認証
 *     （X-Frontend-Id:6 / X-Frontend-Version:0 のみ）で 200 を返す:
 *       { meta:{status:200},
 *         data:{ user:{ id, nickname,
 *                       icons:{ small, large }, ... } } }
 *     icons.large は secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/.../<uid>.jpg 形式
 *     ＝URL に uid を含むので既存の avatar-uid 一致ガード（isAvatarUrlForUserId）を通る。
 *   - CORS の都合上、本文を読めるのは拡張の service-worker（host_permissions
 *     特権 fetch）のみ。本モジュールは URL 組立と正規化だけを純粋に担う。
 *
 * 正規化先は既存の userCommentProfileCache が受ける {userId, nickname, avatarUrl} で、
 * upsertUserCommentProfileFromEntry → applyUserCommentProfileMapToEntries の
 * 既存反映経路にそのまま乗る（新キャッシュは作らない）。
 *
 * 副作用なし、純関数（fetch も storage も触らない）。
 *
 * @see src/lib/userCommentProfileCache.js - 反映先の既存キャッシュ基盤
 * @see reference_gift_sender_identity_research_2026-05-23 - nvapi 確証の一次資料
 */

/**
 * content → service-worker の fetch 依頼メッセージ type。
 * background.js（手書き成果物）は本定数を import できないため同じリテラルを使う（契約 test）。
 */
export const NICO_USER_PROFILE_FETCH_MESSAGE_TYPE = 'NLS_NICO_USER_PROFILE_FETCH';

/** niconico uid の厳格パターン（正の整数のみ。user/0 は存在しない）。 */
const UID_RE = /^\d{1,18}$/;

/**
 * uid が正の整数か（記名 uid 判定）。匿名/合成キー（u/__anon_… 等）を弾く。
 * @param {unknown} uid
 * @returns {boolean}
 */
export function isResolvableNicoUid(uid) {
  const s = String(uid == null ? '' : uid).trim();
  return UID_RE.test(s) && Number(s) > 0;
}

/**
 * ニコニコ ユーザープロフィール API の URL を組み立てる。
 * uid は厳格検証（不正なら null＝SW が任意文字列を fetch しない）。
 * @param {string|number} uid
 * @returns {string|null}
 */
export function buildNicoUserProfileUrl(uid) {
  const s = String(uid == null ? '' : uid).trim();
  if (!isResolvableNicoUid(s)) return null;
  return 'https://nvapi.nicovideo.jp/v1/users/' + encodeURIComponent(s);
}

/**
 * 生 JSON が nvapi user レスポンスの概形か（meta.status と data.user）。
 * @param {unknown} json
 * @returns {boolean}
 */
export function isLikelyNicoUserProfileShape(json) {
  if (!json || typeof json !== 'object') return false;
  const j = /** @type {Record<string, any>} */ (json);
  if (j.meta && typeof j.meta === 'object' && j.meta.status != null) {
    if (Number(j.meta.status) !== 200) return false;
  }
  return !!(j.data && typeof j.data === 'object' && j.data.user && typeof j.data.user === 'object');
}

/**
 * http(s) のサムネ URL だけ通す。それ以外は ''。
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeHttpUrl(value) {
  const s = String(value == null ? '' : value).trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

/**
 * nvapi user の生 JSON を、既存 userCommentProfileCache が受ける形に正規化する。
 *
 * 安全条件:
 *   - meta.status!==200 / data.user 欠落 → null。
 *   - userId は data.user.id（数値）を文字列化。正の整数でなければ null（記名のみ）。
 *   - avatarUrl は icons.large 優先・無ければ small。http(s) のみ。
 *   - nickname も avatarUrl も無ければ null（供給する価値がない）。
 *
 * @param {unknown} json nvapi レスポンスの生 JSON（SW が res.json() したもの）
 * @returns {{ userId: string, nickname: string, avatarUrl: string }|null}
 */
export function normalizeNicoUserProfileResponse(json) {
  if (!isLikelyNicoUserProfileShape(json)) return null;
  const user = /** @type {Record<string, any>} */ (
    /** @type {Record<string, any>} */ (json).data.user
  );

  const userId = String(user.id == null ? '' : user.id).trim();
  if (!isResolvableNicoUid(userId)) return null;

  const nickname = String(user.nickname == null ? '' : user.nickname).trim().slice(0, 200);

  let avatarUrl = '';
  const icons = user.icons;
  if (icons && typeof icons === 'object') {
    avatarUrl = sanitizeHttpUrl(icons.large) || sanitizeHttpUrl(icons.small);
  }

  if (!nickname && !avatarUrl) return null;
  return { userId, nickname, avatarUrl };
}
