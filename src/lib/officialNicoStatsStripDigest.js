import { formatOfficialStreamAgeMinutes } from './formatOfficialStreamAgeMinutes.js';

/**
 * @typedef {{
 *   text: string,
 *   isPlaceholder: boolean
 * }} OfficialNicoStatChip
 */

/**
 * @typedef {{
 *   stableKey: string,
 *   summaryText: string,
 *   viewers: OfficialNicoStatChip,
 *   comments: OfficialNicoStatChip,
 *   streamAge: OfficialNicoStatChip,
 *   adPts: OfficialNicoStatChip,
 *   giftPts: OfficialNicoStatChip
 * }} OfficialNicoStatsStripDigest
 */

/**
 * @param {unknown} v
 * @returns {OfficialNicoStatChip}
 */
function chipNumber(v) {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
    return { text: v.toLocaleString('ja-JP'), isPlaceholder: false };
  }
  return { text: '—', isPlaceholder: true };
}

/**
 * @param {unknown} streamAgeMin
 * @returns {OfficialNicoStatChip}
 */
function chipStreamAge(streamAgeMin) {
  const t = formatOfficialStreamAgeMinutes(streamAgeMin);
  if (t) return { text: t, isPlaceholder: false };
  return { text: '—', isPlaceholder: true };
}

/**
 * 記録カード下「本家寄せ」帯用の表示値・安定キー・折りたたみ summary 一行。
 *
 * @param {{
 *   liveId?: string|null,
 *   officialViewerCount?: number|null,
 *   officialCommentCount?: number|null,
 *   streamAgeMin?: number|null,
 *   officialAdPoints?: number|null,
 *   officialGiftPoints?: number|null
 * }} snap
 * @returns {OfficialNicoStatsStripDigest|null} liveId 無しは null（帯非表示）
 */
export function buildOfficialNicoStatsStripDigest(snap) {
  const lid = String(snap?.liveId || '').trim().toLowerCase();
  if (!lid) return null;

  const viewers = chipNumber(snap?.officialViewerCount);
  const comments = chipNumber(snap?.officialCommentCount);
  const streamAge = chipStreamAge(snap?.streamAgeMin);
  const adPts = chipNumber(snap?.officialAdPoints);
  const giftPts = chipNumber(snap?.officialGiftPoints);

  const stableKey = [
    lid,
    viewers.text,
    comments.text,
    streamAge.text,
    adPts.text,
    giftPts.text
  ].join('|');

  /** @type {{ short: string, full: string }[]} */
  const parts = [];
  if (!viewers.isPlaceholder) parts.push({ short: `来${viewers.text}`, full: `来場 ${viewers.text}` });
  if (!comments.isPlaceholder) parts.push({ short: `コ${comments.text}`, full: `コメ ${comments.text}` });
  if (!streamAge.isPlaceholder) parts.push({ short: `経${streamAge.text}`, full: `経過 ${streamAge.text}` });
  if (!adPts.isPlaceholder) parts.push({ short: `広${adPts.text}`, full: `広告 ${adPts.text}` });
  if (!giftPts.isPlaceholder) parts.push({ short: `ギ${giftPts.text}`, full: `ギフト ${giftPts.text}` });

  let summaryText = '本家寄せ（WS / NDGR）';
  if (parts.length) {
    const shortJoined = parts.map((p) => p.short).join(' · ');
    summaryText = `本家寄せ: ${shortJoined}`;
    if (summaryText.length > 52) {
      summaryText = `${summaryText.slice(0, 49)}…`;
    }
  } else {
    summaryText = '本家寄せ（WS / NDGR）· タップで各項目';
  }

  return {
    stableKey,
    summaryText,
    viewers,
    comments,
    streamAge,
    adPts,
    giftPts
  };
}
