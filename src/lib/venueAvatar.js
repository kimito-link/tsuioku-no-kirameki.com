// venueAvatar.js
// v0.1.712: 会場モードのアバター解決(サムネ補強)純関数。
//
// 設計正本: memory/reference_venue_fullscreen_meeting.md「仕上げ会議 確定1」。
//   会場がサムネを出せない真因=パネルが使う「プロファイルキャッシュ
//   (KEY_USER_COMMENT_PROFILE_CACHE = nls_user_comment_profile_v1)による avatarUrl 補強」を
//   会場が呼んでいなかった。チャンク本体(nls_cchunk)には avatarUrl が無く、avatarUrl は
//   プロファイルキャッシュ(userId→{nickname, avatarUrl})に在る。
//
//   このファイルは「会場行の avatar が空なら、プロファイルキャッシュの avatarUrl を
//   取り違えガード付きで補強する」純関数だけ(DOM/storage/chrome.* 非依存・テスト可能)。
//   取り違えガード(URL 埋め込み uid とエントリ uid の不一致を弾く)は avatarBroadcasterGuard を再利用。

import { isAvatarUrlForUserId } from './avatarBroadcasterGuard.js';
import { deriveAvatarUrlFromUid } from './deriveAvatarUrlFromUid.js';

/**
 * http(s) URL か。data URL や空は false。
 * @param {unknown} u
 * @returns {boolean}
 */
function isHttpUrl(u) {
  return /^https?:\/\//i.test(String(u || '').trim());
}

/**
 * 会場行(venueRowsFromUserLaneCandidates の出力など)の avatar を、プロファイルキャッシュの
 * avatarUrl で補強する純関数。avatar が既にある行はそのまま。空の行だけ、profileMap[userId] の
 * avatarUrl を取り違えガード(isAvatarUrlForUserId)を通してから入れる。
 *
 * これでパネルと同じ「サムネ取れた人は実サムネ・無い人は空(=会場側でゆっくり顔生成)」になる。
 *
 * v0.1.1110: 入力行の未知フィールドは保持する(スプレッド)。venueRowsFromUserLaneCandidates /
 *   rosterToVenueRows が出す preCount/preHasGift/preGiftCount(VIP常連光らせの契約・
 *   venueLiveRoster.js 冒頭の契約参照)を enrich が落とすと全員 count=1 扱いになる(v0.1.734 の轍)。
 *
 * @param {ReadonlyArray<{userId?: string, name?: string, avatar?: string, text?: string, capturedAt?: number}>} rows
 * @param {Record<string, { avatarUrl?: unknown }>|null|undefined} profileMap
 *   KEY_USER_COMMENT_PROFILE_CACHE の値(userId→{nickname, avatarUrl})
 * @returns {Array<{userId: string, name: string, avatar: string, text: string, capturedAt: number, avatarObserved: boolean}>}
 *   avatarObserved=実 http サムネが補強できた行は true(席の前列優先などに使える)
 */
export function enrichVenueRowsWithProfileAvatars(rows, profileMap) {
  const list = Array.isArray(rows) ? rows : [];
  const map =
    profileMap && typeof profileMap === 'object' && !Array.isArray(profileMap)
      ? profileMap
      : {};
  const out = [];
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const userId = String(r.userId || '').trim();
    const name = String(r.name || '').trim();
    const capturedAt = Number.isFinite(Number(r.capturedAt)) ? Number(r.capturedAt) : 0;
    let avatar = String(r.avatar || '').trim();
    let observed = isHttpUrl(avatar);
    // avatar が空(または非http)なら、プロファイルキャッシュから補強を試みる。
    if (!observed && userId) {
      const profileAvatar = String(map[userId]?.avatarUrl ?? '').trim();
      // 取り違えガード: URL 埋め込み uid とエントリ uid が一致するときだけ採用。
      if (isHttpUrl(profileAvatar) && isAvatarUrlForUserId(profileAvatar, userId)) {
        avatar = profileAvatar;
        observed = true;
      }
    }
    // プロファイルキャッシュにも無ければ、popup と同じ確定パターンで UID から生成する
    // (popup 側は storyGrowthAvatarSrcCandidate→rememberedAvatarUrlForUserId が
    //   deriveAvatarUrlFromUid でこのフォールバックを持つが、会場側だけ欠けていたため
    //   記名ユーザーでもキャッシュ未充填だと白円のままになっていた)。数値 uid のみ対象
    //   (匿名 uid 'a:xxx' 等は deriveAvatarUrlFromUid が '' を返すので無害)。
    if (!observed && userId) {
      const derived = deriveAvatarUrlFromUid(userId);
      if (derived) {
        avatar = derived;
        observed = true;
      }
    }
    out.push({
      ...r,
      userId,
      name,
      avatar,
      text: String(r.text || ''),
      capturedAt,
      avatarObserved: observed
    });
  }
  return out;
}
