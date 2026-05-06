import {
  isHttpOrHttpsUrl,
  isAnonymousStyleNicoUserId,
  pickSupportGrowthFallbackTileSrc
} from './supportGrowthTileSrc.js';
import {
  accentColorForSlot,
  accentSlotFromUserKey
} from './userSupportGridAccent.js';
import {
  UNKNOWN_USER_KEY,
  shortUserKeyDisplay,
  displayUserLabel
} from './userRooms.js';
import { anonymousNicknameFallback } from './nicoAnonymousDisplay.js';
import { formatNicknameWithUidFallback } from './giftDisplayNickname.js';

/**
 * @typedef {{ userKey: string, nickname: string, count: number, avatarUrl?: string }} TopSupportRankRoom
 */

/**
 * @typedef {{
 *   count: number,
 *   userKey: string,
 *   isUnknown: boolean,
 *   placeNumber: number | null,
 *   hasAccent: boolean,
 *   accentColorCss: string | null,
 *   thumbSrc: string,
 *   thumbNeedsNoReferrer: boolean,
 *   idTitle: string,
 *   idShort: string,
 *   nameLine: string,
 *   fullLabelForTitle: string
 * }} TopSupportRankLineModel
 */

/**
 * 応援ランキングストリップ1行分の表示モデル（DOM・HTML エスケープなし）。
 *
 * @param {TopSupportRankRoom[]} stripRooms
 * @param {{
 *   defaultThumbSrc: string,
 *   anonymousFallbackThumbSrc?: string,
 *   colorScheme?: 'light'|'dark',
 *   anonymousIdenticonResolver?: (userId: string) => string,
 *   placeNumberMode?: 'row'|'dense'
 * }} opts
 * @returns {TopSupportRankLineModel[]}
 */
export function topSupportRankLineModels(stripRooms, opts) {
  const defaultThumb = String(opts?.defaultThumbSrc || '').trim();
  const anonThumb = String(opts?.anonymousFallbackThumbSrc || '').trim();
  const colorScheme = opts?.colorScheme === 'dark' ? 'dark' : 'light';
  const placeMode = opts?.placeNumberMode === 'dense' ? 'dense' : 'row';
  const idnResolver =
    typeof opts?.anonymousIdenticonResolver === 'function'
      ? opts.anonymousIdenticonResolver
      : null;
  const rooms = Array.isArray(stripRooms) ? stripRooms : [];
  let knownRank = 0;
  /** 密順位（同回数は同順位、次は飛ばさず 1,2,2,2,3…）用 */
  let denseRank = 0;
  /** @type {number|null} */
  let denseLastCount = null;

  return rooms.map((r) => {
    const userKey = String(r?.userKey ?? '');
    const isUnknown = userKey === UNKNOWN_USER_KEY;
    const count = Math.max(0, Number(r?.count) || 0);
    /** @type {number|null} */
    let placeNumber;
    if (isUnknown) {
      placeNumber = null;
    } else if (placeMode === 'dense') {
      if (denseLastCount === null || count < denseLastCount) {
        denseRank += 1;
        denseLastCount = count;
      }
      placeNumber = denseRank;
    } else {
      knownRank += 1;
      placeNumber = knownRank;
    }

    const rawAv = String(r?.avatarUrl || '').trim();
    const uidForThumb = isUnknown ? '' : userKey;
    let thumbSrc = '';
    if (isHttpOrHttpsUrl(rawAv)) {
      thumbSrc = String(rawAv).trim();
    } else if (
      idnResolver &&
      uidForThumb &&
      isAnonymousStyleNicoUserId(uidForThumb)
    ) {
      const idn = String(idnResolver(uidForThumb) || '').trim();
      thumbSrc = idn
        ? idn
        : pickSupportGrowthFallbackTileSrc(
            uidForThumb,
            rawAv,
            defaultThumb,
            anonThumb || defaultThumb
          );
    } else {
      thumbSrc = pickSupportGrowthFallbackTileSrc(
        uidForThumb,
        rawAv,
        defaultThumb,
        anonThumb || defaultThumb
      );
    }
    const thumbNeedsNoReferrer = isHttpOrHttpsUrl(thumbSrc);

    const idTitle = isUnknown ? '' : String(r.userKey);
    const idShort = isUnknown
      ? '—'
      : shortUserKeyDisplay(userKey) || String(userKey);

    const nickRaw = String(r?.nickname || '').trim();
    const nameLine = isUnknown
      ? '—'
      : formatNicknameWithUidFallback(
          userKey,
          anonymousNicknameFallback(userKey, nickRaw)
        ) || '（未取得）';

    const fullLabelForTitle = displayUserLabel(userKey, r?.nickname);

    let hasAccent = false;
    let accentColorCss = null;
    if (!isUnknown) {
      const slot = accentSlotFromUserKey(userKey);
      const col = slot != null ? accentColorForSlot(slot, colorScheme) : null;
      if (col) {
        hasAccent = true;
        accentColorCss = col;
      }
    }

    return {
      count,
      userKey,
      isUnknown,
      placeNumber,
      hasAccent,
      accentColorCss,
      thumbSrc,
      thumbNeedsNoReferrer,
      idTitle,
      idShort,
      nameLine,
      fullLabelForTitle
    };
  });
}
