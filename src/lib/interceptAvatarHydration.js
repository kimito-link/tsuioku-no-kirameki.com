import { isHttpOrHttpsUrl, isWeakNiconicoUserIconHttpUrl } from './supportGrowthTileSrc.js';
import { shouldAssociateAvatarWithUser } from './avatarBroadcasterGuard.js';

/**
 * profile cache の強い avatar を intercept avatar map へ補完する。
 * 既存 map は上書きせず、欠損分のみを埋める。
 *
 * @param {Map<string, string>} avatarMap
 * @param {Record<string, { avatarUrl?: string }>} profileMap
 * @param {Set<string>} [allowedUserIds] 指定時はこの live で観測済み userId のみ補完
 * @param {{ broadcasterUid?: string, broadcasterIconUrl?: string }} [broadcasterContext]
 *   0.1.82: profile cache に過去の汚染データが残っていても、broadcaster icon と
 *   一致する URL は viewer uid に hydrate しない（永続汚染のループを断つ）。
 * @returns {number} 追加件数
 */
export function hydrateInterceptAvatarMapFromProfile(
  avatarMap,
  profileMap,
  allowedUserIds,
  broadcasterContext
) {
  if (!(avatarMap instanceof Map) || !profileMap || typeof profileMap !== 'object') {
    return 0;
  }
  const hasAllowSet = allowedUserIds instanceof Set && allowedUserIds.size > 0;
  const broadcasterUid = String(broadcasterContext?.broadcasterUid ?? '').trim();
  const broadcasterIconUrl = String(broadcasterContext?.broadcasterIconUrl ?? '').trim();
  let added = 0;
  for (const [uidRaw, rec] of Object.entries(profileMap)) {
    const uid = String(uidRaw || '').trim();
    if (hasAllowSet && !allowedUserIds.has(uid)) continue;
    if (!uid || avatarMap.has(uid)) continue;
    const av = String(rec?.avatarUrl || '').trim();
    if (!isHttpOrHttpsUrl(av)) continue;
    if (isWeakNiconicoUserIconHttpUrl(av)) continue;
    // 0.1.82: 過去に焼き込まれた broadcaster icon の汚染データを hydrate しない
    if (
      broadcasterUid &&
      !shouldAssociateAvatarWithUser({
        uid,
        av,
        broadcasterUid,
        broadcasterIconUrl
      })
    ) {
      continue;
    }
    avatarMap.set(uid, av);
    added += 1;
  }
  return added;
}
