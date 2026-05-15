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
 *   giftPts: OfficialNicoStatChip,
 *   eventGiftPts: OfficialNicoStatChip,
 *   eventRank: OfficialNicoStatChip,
 *   eventTitle: OfficialNicoStatChip
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
 * イベント参加 UI の「現在 N 位」（数値のみ。表示は「21位」）。
 *
 * @param {unknown} v
 * @returns {OfficialNicoStatChip}
 */
function chipEventRank(v) {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 999_999) {
    return { text: `${v}位`, isPlaceholder: false };
  }
  return { text: '—', isPlaceholder: true };
}

/**
 * @param {unknown} v
 * @returns {OfficialNicoStatChip}
 */
function chipEventTitle(v) {
  const s = String(v || '').trim();
  if (s.length >= 4) {
    return {
      text: s.length > 52 ? `${s.slice(0, 49)}…` : s,
      isPlaceholder: false
    };
  }
  return { text: '—', isPlaceholder: true };
}

/**
 * statistics の viewers を優先し、未取得時は watch ページ由来の来場者数（DOM/WS/embedded）にフォールバック。
 *
 * @param {{
 *   officialViewerCount?: unknown,
 *   viewerCountFromDom?: unknown
 * }} snap
 * @returns {unknown}
 */
function pickViewerCountForOfficialStrip(snap) {
  const o = snap?.officialViewerCount;
  if (typeof o === 'number' && Number.isFinite(o) && o >= 0) return o;
  const d = snap?.viewerCountFromDom;
  if (typeof d === 'number' && Number.isFinite(d) && d >= 0) return d;
  return null;
}

/**
 * 記録カード下「本家寄せ」帯用の表示値・安定キー・折りたたみ summary 一行。
 *
 * 広告pt / ギフトpt / イベント系は WIP で snapshot のフィールド名が
 * `officialAdPointsNdgr` 等に rename された。古い `officialAdPoints` も
 * 念のためフォールバックとして見る（過去 snapshot を読み直す経路が残っているため）。
 *
 * @param {{
 *   liveId?: string|null,
 *   officialViewerCount?: number|null,
 *   viewerCountFromDom?: number|null,
 *   officialCommentCount?: number|null,
 *   streamAgeMin?: number|null,
 *   officialAdPoints?: number|null,
 *   officialAdPointsNdgr?: number|null,
 *   officialGiftPoints?: number|null,
 *   officialGiftPointsNdgr?: number|null,
 *   officialEventGiftScore?: number|null,
 *   officialEventGiftScoreNdgr?: number|null,
 *   officialNicoEventRank?: number|null,
 *   officialNicoEventRankNdgr?: number|null,
 *   officialNicoEventTitle?: string|null,
 *   officialNicoEventTitleNdgr?: string|null
 * }} snap
 * @returns {OfficialNicoStatsStripDigest|null} liveId 無しは null（帯非表示）
 */
export function buildOfficialNicoStatsStripDigest(snap) {
  const lid = String(snap?.liveId || '').trim().toLowerCase();
  if (!lid) return null;

  /** @param {unknown} a @param {unknown} b */
  const pickNum = (a, b) =>
    typeof a === 'number' && Number.isFinite(a)
      ? a
      : typeof b === 'number' && Number.isFinite(b)
        ? b
        : null;
  /** @param {unknown} a @param {unknown} b */
  const pickStr = (a, b) => {
    const sa = String(a || '').trim();
    if (sa) return sa;
    return String(b || '').trim();
  };

  const viewers = chipNumber(pickViewerCountForOfficialStrip(snap));
  const comments = chipNumber(snap?.officialCommentCount);
  const streamAge = chipStreamAge(snap?.streamAgeMin);
  const adPts = chipNumber(pickNum(snap?.officialAdPointsNdgr, snap?.officialAdPoints));
  const giftPts = chipNumber(pickNum(snap?.officialGiftPointsNdgr, snap?.officialGiftPoints));
  const eventGiftPts = chipNumber(
    pickNum(snap?.officialEventGiftScoreNdgr, snap?.officialEventGiftScore)
  );
  // イベント「現在 N 位」はギフト欄 DOM / 鏡の正本のみ。NDGR field 6 は別指標になり得る。
  const eventRank = chipEventRank(snap?.officialNicoEventRank);
  const eventTitle = chipEventTitle(
    pickStr(snap?.officialNicoEventTitleNdgr, snap?.officialNicoEventTitle)
  );

  const stableKey = [
    lid,
    viewers.text,
    comments.text,
    streamAge.text,
    adPts.text,
    giftPts.text,
    eventGiftPts.text,
    eventRank.text,
    eventTitle.text
  ].join('|');

  /** @type {{ short: string, full: string }[]} */
  const parts = [];
  if (!viewers.isPlaceholder) parts.push({ short: `来${viewers.text}`, full: `来場 ${viewers.text}` });
  if (!comments.isPlaceholder) parts.push({ short: `コ${comments.text}`, full: `コメ ${comments.text}` });
  if (!streamAge.isPlaceholder) parts.push({ short: `経${streamAge.text}`, full: `経過 ${streamAge.text}` });
  if (!adPts.isPlaceholder) parts.push({ short: `広${adPts.text}`, full: `広告 ${adPts.text}` });
  if (!giftPts.isPlaceholder) parts.push({ short: `累${giftPts.text}`, full: `番組累計 ${giftPts.text}` });
  if (!eventGiftPts.isPlaceholder) {
    parts.push({ short: `イ${eventGiftPts.text}`, full: `イベント累計 ${eventGiftPts.text}` });
  }
  if (!eventRank.isPlaceholder) {
    parts.push({ short: `順${eventRank.text}`, full: `現在の順位 ${eventRank.text}` });
  }
  if (!eventTitle.isPlaceholder && eventTitle.text) {
    parts.push({
      short: `題${eventTitle.text.length > 14 ? `${eventTitle.text.slice(0, 12)}…` : eventTitle.text}`,
      full: `イベント ${eventTitle.text}`
    });
  }

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
    giftPts,
    eventGiftPts,
    eventRank,
    eventTitle
  };
}
