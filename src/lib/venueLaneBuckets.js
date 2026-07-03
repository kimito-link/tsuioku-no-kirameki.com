import { anonymousIdenticonDataUrl } from './anonymousIdenticon.js';
import { anonymousDisplayLabel } from './nicoUserPage.js';
import { storyUserLaneMetaLines } from './storyUserLaneMeta.js';
import { bucketStoryUserLanePicks } from './storyUserLaneBuckets.js';
import { compareStoryUserLaneCandidates } from './storyUserLaneSort.js';
import { supportGridDisplayTier } from './supportGridDisplayTier.js';
import { userLaneResolvedThumbScore } from './supportGrowthTileSrc.js';
import { deriveNicoUserIconUrl } from './venueSeats.js';

const TIER_PROFILE = { link: 3, konta: 2, tanu: 1 };

/**
 * 会場座席の participant を、応援レーンDOMが描ける item へ変換する。
 * 配信者ID未確定時でもここでは数値ID候補を落とさない。席資格の正本は venueSeats.js であり、
 * 会場は「アクティブユーザーは全員着席」の哲学を保つ。
 *
 * @param {{ seatIndex?: number, participant?: { key?: string, userId?: string, name?: string, avatar?: string, lastAt?: number }, venueRank?: number }} seatEntry
 * @param {{ fallbackLabel?: string }} [opts]
 * @returns {null | {
 *   entryIndex: number,
 *   profileTier: number,
 *   thumbScore: number,
 *   displaySrc: string,
 *   title: string,
 *   entry: { userId: string },
 *   meta: { idLine: string, nameLine: string },
 *   _venueSeatIndex: number,
 *   _venueParticipantKey: string,
 *   _venueRank: number,
 *   _venueIsVip: boolean,
 *   _venueSpeakerKey: string,
 *   _venueAvatarUrl: string,
 *   _venueRawName: string
 * }}
 */
export function venueSeatEntryToLaneItem(seatEntry, opts = {}) {
  if (!seatEntry || typeof seatEntry !== 'object') return null;
  const participant = seatEntry.participant && typeof seatEntry.participant === 'object'
    ? seatEntry.participant
    : null;
  if (!participant) return null;

  const uid = String(participant.userId || '').trim();
  const key = String(participant.key || (uid ? `u:${uid}` : '')).trim();
  if (!uid && !key) return null;

  const seatIndex = Math.max(0, Math.floor(Number(seatEntry.seatIndex) || 0));
  const fallbackLabel = String(opts.fallbackLabel || `会場${seatIndex + 1}`);
  const rawName = String(participant.name || '').trim();
  const displayName =
    rawName || (uid ? anonymousDisplayLabel(uid) : anonymousDisplayLabel(key || fallbackLabel));
  const avatarUrl = String(participant.avatar || '').trim();
  const derivedAvatar = deriveNicoUserIconUrl(uid);
  const httpAvatar = avatarUrl || derivedAvatar;
  const displaySrc = httpAvatar || (uid ? anonymousIdenticonDataUrl(uid, 64) : anonymousIdenticonDataUrl(key || fallbackLabel, 64));
  const tierName = supportGridDisplayTier({
    userId: uid,
    nickname: rawName,
    httpAvatarCandidate: httpAvatar,
    storedAvatarUrl: avatarUrl,
    avatarObserved: false
  });
  const meta = storyUserLaneMetaLines(
    { userId: uid, nickname: rawName },
    httpAvatar,
    key
  );
  const speakerKey = uid ? `u:${uid}` : rawName ? `n:${rawName}` : '';

  return {
    entryIndex: Number.isFinite(Number(participant.lastAt))
      ? Math.max(0, Math.floor(Number(participant.lastAt)))
      : seatIndex,
    profileTier: TIER_PROFILE[tierName] || 1,
    thumbScore: userLaneResolvedThumbScore(uid, httpAvatar),
    displaySrc,
    title: displayName,
    entry: { userId: uid },
    meta,
    _venueSeatIndex: seatIndex,
    _venueParticipantKey: key,
    _venueRank: Math.max(0, Math.floor(Number(seatEntry.venueRank) || 0)),
    _venueIsVip: Boolean(httpAvatar),
    _venueSpeakerKey: speakerKey,
    _venueAvatarUrl: avatarUrl,
    _venueRawName: rawName
  };
}

/**
 * @param {Array<{ seatIndex?: number, participant?: object, venueRank?: number }>} seatEntries
 * @param {{ maxTotal?: number }} [opts]
 * @returns {{ link: any[], gift: any[], ad: any[], konta: any[], tanu: any[] }}
 */
export function bucketVenueLaneSeats(seatEntries, opts = {}) {
  const list = Array.isArray(seatEntries) ? seatEntries : [];
  const maxTotal = Number.isFinite(Number(opts.maxTotal))
    ? Math.max(0, Math.floor(Number(opts.maxTotal)))
    : list.length;
  const candidates = list
    .map((entry) => venueSeatEntryToLaneItem(entry))
    .filter(Boolean)
    .sort(compareStoryUserLaneCandidates);
  const b = bucketStoryUserLanePicks(candidates, maxTotal);
  return { link: b.link, gift: [], ad: [], konta: b.konta, tanu: b.tanu };
}

/**
 * @param {{ link: any[], gift?: any[], ad?: any[], konta: any[], tanu: any[] }} buckets
 * @returns {any[]}
 */
export function flattenVenueLaneBuckets(buckets) {
  return [
    ...(Array.isArray(buckets.link) ? buckets.link : []),
    ...(Array.isArray(buckets.gift) ? buckets.gift : []),
    ...(Array.isArray(buckets.ad) ? buckets.ad : []),
    ...(Array.isArray(buckets.konta) ? buckets.konta : []),
    ...(Array.isArray(buckets.tanu) ? buckets.tanu : [])
  ];
}
