/**
 * 応援ユーザーレーン（りんく・こん太・たぬ姉）のセル画像 URL。
 * 匿名 a: は tier 3（りんく段）以外では捕獲 HTTP を出さず Identicon 等へ寄せる（りんく段では http をそのまま使う）。
 */

import { isNiconicoAnonymousUserId } from './nicoAnonymousDisplay.js';
import { supportGridPersonalThumbPreferredUrl } from './supportGridDisplayTier.js';
import {
  isHttpOrHttpsUrl,
  pickSupportGrowthTileWithOptionalIdenticon
} from './supportGrowthTileSrc.js';

/**
 * ユーザーレーン img 用: tier が見る stored と同順で個人 URL を選び、
 * storyGrowthAvatarSrcCandidate が合成 canonical だけ返すときも記録上の個人 URL を渡す。
 *
 * @param {unknown} userId
 * @param {unknown} primaryHttp storyGrowthAvatarSrcCandidate
 * @param {unknown} storedRaw entry.avatarUrl
 * @returns {string} pickSupportGrowthTile… へ渡す http（空可）
 */
export function userLaneHttpForTilePick(userId, primaryHttp, storedRaw) {
  const preferred = supportGridPersonalThumbPreferredUrl(
    String(userId ?? ''),
    String(primaryHttp ?? ''),
    String(storedRaw ?? '')
  );
  if (preferred) return preferred;
  const h = String(primaryHttp ?? '').trim();
  if (!isHttpOrHttpsUrl(h)) return '';
  return h;
}

/**
 * @param {{
 *   userId?: unknown,
 *   httpCandidate?: unknown,
 *   profileTier: number,
 *   yukkuriSrc: unknown,
 *   tvSrc: unknown,
 *   identiconOpts?: { anonymousIdenticonEnabled?: boolean, anonymousIdenticonDataUrl?: unknown }
 * }} p profileTier: 3=りんく / 2=こん太 / 1=たぬ姉（storyUserLaneRowModel.userLaneProfileCompletenessTier と一致）
 * @returns {string}
 */
export function pickStoryUserLaneCellDisplaySrc(p) {
  const uid = String(p?.userId ?? '').trim();
  const tier = Math.max(0, Math.floor(Number(p?.profileTier) || 0));
  const httpRaw = String(p?.httpCandidate ?? '').trim();
  const stripHttp = tier < 3 && isNiconicoAnonymousUserId(uid);
  const http = stripHttp ? '' : httpRaw;
  return pickSupportGrowthTileWithOptionalIdenticon(
    uid,
    http,
    p.yukkuriSrc,
    p.tvSrc,
    p.identiconOpts
  );
}
