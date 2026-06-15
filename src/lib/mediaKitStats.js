/**
 * 追憶メディアキット向けの期間集計。
 * plain data のみを受け取り、IndexedDB / chrome.* / DOM には依存しない。
 */

import { isGenericComeviewName } from './comeviewRows.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** コメント応援の集計対象とする直近配信数の上限(全件読みの負荷cap・脚注に明記する)。 */
export const MEDIA_KIT_COMMENT_LIVE_CAP = 12;

/** @param {unknown} value */
function finiteNonNegative(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** @param {unknown} value */
function positiveTimestamp(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** @param {unknown} value */
function cleanText(value) {
  return String(value ?? '').trim();
}

/** @param {number[]} values */
function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * @typedef {{
 *   liveId?: unknown,
 *   capturedAt?: unknown,
 *   commentStorageCount?: unknown,
 *   uniqueKnownCommenters?: unknown,
 *   peakConcurrentEstimate?: unknown,
 *   officialCommentCount?: unknown,
 *   officialViewerCount?: unknown,
 *   viewerCountFromDom?: unknown,
 *   broadcasterName?: unknown,
 *   broadcasterUserId?: unknown,
 *   broadcasterIconUrl?: unknown
 * }} MediaKitSummaryRow
 */

/**
 * @typedef {{
 *   liveId?: unknown,
 *   capturedAt?: unknown,
 *   followerCount?: unknown,
 *   nickname?: unknown,
 *   name?: unknown,
 *   userId?: unknown,
 *   avatarUrl?: unknown,
 *   iconUrl?: unknown
 * }} MediaKitProfileSnapshot
 */

/**
 * @param {MediaKitSummaryRow[]} rows
 * @returns {Map<string, { liveId: string, rows: Array<MediaKitSummaryRow & { capturedAt: number }>, firstAt: number, finalAt: number, finalRow: MediaKitSummaryRow }>}
 */
function groupSummaryRows(rows) {
  /** @type {Map<string, Array<MediaKitSummaryRow & { capturedAt: number }>>} */
  const grouped = new Map();
  for (const raw of Array.isArray(rows) ? rows : []) {
    if (!raw || typeof raw !== 'object') continue;
    const liveId = cleanText(raw.liveId).toLowerCase();
    const capturedAt = positiveTimestamp(raw.capturedAt);
    if (!liveId || capturedAt == null) continue;
    const list = grouped.get(liveId) || [];
    list.push({ ...raw, capturedAt });
    grouped.set(liveId, list);
  }

  /** @type {Map<string, { liveId: string, rows: Array<MediaKitSummaryRow & { capturedAt: number }>, firstAt: number, finalAt: number, finalRow: MediaKitSummaryRow }>} */
  const out = new Map();
  for (const [liveId, list] of grouped) {
    list.sort((a, b) => a.capturedAt - b.capturedAt);
    const first = list[0];
    const final = list[list.length - 1];
    out.set(liveId, {
      liveId,
      rows: list,
      firstAt: first.capturedAt,
      finalAt: final.capturedAt,
      finalRow: final
    });
  }
  return out;
}

/**
 * @param {MediaKitSummaryRow[]} summaryRows
 * @param {MediaKitProfileSnapshot[]} profileSnapshots
 */
function resolveBroadcaster(summaryRows, profileSnapshots) {
  const sources = [
    ...(Array.isArray(summaryRows) ? summaryRows : []).map((row) => ({
      capturedAt: positiveTimestamp(row?.capturedAt) || 0,
      priority: 0,
      name: cleanText(row?.broadcasterName),
      userId: cleanText(row?.broadcasterUserId),
      iconUrl: cleanText(row?.broadcasterIconUrl)
    })),
    ...(Array.isArray(profileSnapshots) ? profileSnapshots : []).map((row) => ({
      capturedAt: positiveTimestamp(row?.capturedAt) || 0,
      priority: 1,
      name: cleanText(row?.nickname ?? row?.name),
      userId: cleanText(row?.userId),
      iconUrl: cleanText(row?.avatarUrl ?? row?.iconUrl)
    }))
  ].sort((a, b) => b.capturedAt - a.capturedAt || b.priority - a.priority);

  /** @param {'name'|'userId'|'iconUrl'} key */
  const pick = (key) => sources.find((source) => source[key])?.[key] || '';
  return {
    name: pick('name'),
    userId: pick('userId'),
    iconUrl: pick('iconUrl')
  };
}

/**
 * @param {Record<string, unknown[]>|Map<string, unknown[]>} giftEventsByLive
 * @param {string} liveId
 * @returns {{ present: boolean, events: unknown[] }}
 */
function giftEventsForLive(giftEventsByLive, liveId) {
  if (giftEventsByLive instanceof Map) {
    return giftEventsByLive.has(liveId)
      ? {
          present: true,
          events: Array.isArray(giftEventsByLive.get(liveId))
            ? giftEventsByLive.get(liveId)
            : []
        }
      : { present: false, events: [] };
  }
  if (!giftEventsByLive || typeof giftEventsByLive !== 'object') {
    return { present: false, events: [] };
  }
  if (!Object.prototype.hasOwnProperty.call(giftEventsByLive, liveId)) {
    return { present: false, events: [] };
  }
  const value = giftEventsByLive[liveId];
  return { present: true, events: Array.isArray(value) ? value : [] };
}

/**
 * @param {{
 *   summaryRows?: MediaKitSummaryRow[],
 *   profileSnapshots?: MediaKitProfileSnapshot[],
 *   giftEventsByLive?: Record<string, unknown[]>|Map<string, unknown[]>,
 *   nowMs?: number,
 *   windowsDays?: number[]
 * }} input
 * @returns {{
 *   windows: Array<{
 *     days: number,
 *     followers: number|null,
 *     followersGained: number|null,
 *     avgConcurrent: number|null,
 *     maxConcurrent: number|null,
 *     visitors: { total: number, average: number }|null,
 *     comments: number|null,
 *     chatRatePerMin: number|null,
 *     uniqueSupporters: number|null,
 *     giftPoints: number|null,
 *     giftCount: number|null,
 *     broadcastsPerWeek: number|null,
 *     liveCount: number
 *   }>,
 *   broadcaster: { name: string, userId: string, iconUrl: string }
 * }}
 */
export function buildMediaKitStats(input = {}) {
  const summaryRows = Array.isArray(input.summaryRows) ? input.summaryRows : [];
  const profileSnapshots = Array.isArray(input.profileSnapshots)
    ? input.profileSnapshots
    : [];
  const giftEventsByLive = input.giftEventsByLive || {};
  const nowCandidate = Number(input.nowMs);
  const nowMs = Number.isFinite(nowCandidate) && nowCandidate > 0 ? nowCandidate : Date.now();
  const requestedWindows = Array.isArray(input.windowsDays)
    ? input.windowsDays
    : [30, 60, 90];
  const windowsDays = requestedWindows
    .map((value) => Math.floor(Number(value)))
    .filter((value, index, all) => value > 0 && all.indexOf(value) === index);
  const grouped = groupSummaryRows(summaryRows);

  const windows = windowsDays.map((days) => {
    const fromMs = nowMs - days * DAY_MS;
    const lives = [...grouped.values()].filter(
      (live) => live.finalAt >= fromMs && live.finalAt <= nowMs
    );
    const liveIds = new Set(lives.map((live) => live.liveId));

    const profiles = profileSnapshots
      .map((profile) => ({
        profile,
        capturedAt: positiveTimestamp(profile?.capturedAt),
        followerCount: finiteNonNegative(profile?.followerCount)
      }))
      .filter(
        (item) =>
          item.capturedAt != null &&
          item.capturedAt >= fromMs &&
          item.capturedAt <= nowMs &&
          item.followerCount != null
      )
      .sort((a, b) => /** @type {number} */ (a.capturedAt) - /** @type {number} */ (b.capturedAt));

    const latestFollowers = profiles.length
      ? /** @type {number} */ (profiles[profiles.length - 1].followerCount)
      : null;
    const followersGained =
      profiles.length >= 2
        ? /** @type {number} */ (profiles[profiles.length - 1].followerCount) -
          /** @type {number} */ (profiles[0].followerCount)
        : null;

    /** @type {number[]} */
    const liveConcurrentAverages = [];
    /** @type {number[]} */
    const concurrentSamples = [];
    /** @type {number[]} */
    const visitorValues = [];
    /** @type {number[]} */
    const commentValues = [];
    /** @type {number[]} */
    const supporterValues = [];
    let durationMinutes = 0;

    for (const live of lives) {
      const samples = live.rows
        .map((row) => finiteNonNegative(row.peakConcurrentEstimate))
        .filter((value) => value != null);
      if (samples.length) {
        concurrentSamples.push(.../** @type {number[]} */ (samples));
        liveConcurrentAverages.push(
          /** @type {number} */ (average(/** @type {number[]} */ (samples)))
        );
      }

      const officialVisitors = finiteNonNegative(live.finalRow.officialViewerCount);
      const fallbackVisitors = finiteNonNegative(live.finalRow.viewerCountFromDom);
      const visitors = officialVisitors ?? fallbackVisitors;
      if (visitors != null) visitorValues.push(visitors);

      const officialComments = finiteNonNegative(live.finalRow.officialCommentCount);
      const fallbackComments = finiteNonNegative(live.finalRow.commentStorageCount);
      const comments = officialComments ?? fallbackComments;
      if (comments != null) commentValues.push(comments);

      const supporters = finiteNonNegative(live.finalRow.uniqueKnownCommenters);
      if (supporters != null) supporterValues.push(supporters);

      if (live.finalAt > live.firstAt) {
        durationMinutes += (live.finalAt - live.firstAt) / 60_000;
      }
    }

    let hasGiftData = false;
    let giftPoints = 0;
    let giftCount = 0;
    for (const liveId of liveIds) {
      const giftData = giftEventsForLive(giftEventsByLive, liveId);
      if (!giftData.present) continue;
      hasGiftData = true;
      for (const event of giftData.events) {
        if (!event || typeof event !== 'object') continue;
        const record = /** @type {{ point?: unknown }} */ (event);
        giftCount += 1;
        giftPoints += finiteNonNegative(record.point) || 0;
      }
    }

    const commentsTotal = commentValues.length
      ? commentValues.reduce((sum, value) => sum + value, 0)
      : null;
    const visitorsTotal = visitorValues.length
      ? visitorValues.reduce((sum, value) => sum + value, 0)
      : null;

    return {
      days,
      followers: latestFollowers,
      followersGained,
      avgConcurrent: average(liveConcurrentAverages),
      maxConcurrent: concurrentSamples.length ? Math.max(...concurrentSamples) : null,
      visitors:
        visitorsTotal == null
          ? null
          : {
              total: visitorsTotal,
              average: visitorsTotal / visitorValues.length
            },
      comments: commentsTotal,
      chatRatePerMin:
        commentsTotal != null && durationMinutes > 0
          ? commentsTotal / durationMinutes
          : null,
      uniqueSupporters: supporterValues.length ? Math.max(...supporterValues) : null,
      giftPoints: hasGiftData ? giftPoints : null,
      giftCount: hasGiftData ? giftCount : null,
      broadcastsPerWeek: lives.length ? lives.length / (days / 7) : null,
      liveCount: lives.length
    };
  });

  return {
    windows,
    broadcaster: resolveBroadcaster(summaryRows, profileSnapshots)
  };
}

/**
 * PR4「応援者が主役」: 期間内の応援者(ギフト/コメント)を表彰用に集計する純関数。
 * ニコ生上で公開されている応援情報(OSINT)の集計であり、隠さず主役として載せる方針
 * (memory/reference_media_kit_design_v0678.md・ユーザー指示 2026-06-10)。
 *
 * @param {{
 *   liveIds?: string[],
 *   giftEventsByLive?: Record<string, unknown[]>|Map<string, unknown[]>,
 *   commentRowsByLive?: Record<string, unknown[]>,
 *   profileMap?: Record<string, { nickname?: unknown }>,
 *   topN?: number
 * }} input
 * @returns {{
 *   giftTop: Array<{ userId: string, name: string, points: number, count: number }>,
 *   commentTop: Array<{ userId: string, name: string, count: number, liveCount: number }>,
 *   regulars: { sampledLives: number, supporters: number, regulars: number, ratio: number|null }
 * }}
 */
export function buildMediaKitSupporters(input = {}) {
  const giftEventsByLive = input.giftEventsByLive || {};
  const commentRowsByLive =
    input.commentRowsByLive && typeof input.commentRowsByLive === 'object'
      ? input.commentRowsByLive
      : {};
  const profileMap =
    input.profileMap && typeof input.profileMap === 'object' ? input.profileMap : {};
  const topNRaw = Math.floor(Number(input.topN));
  const topN = Number.isFinite(topNRaw) && topNRaw > 0 ? topNRaw : 10;

  /**
   * 「匿名」等の汎用名は個人名扱いしない(匿名NNN表示はHTML側が uid から導く)。
   * @param {string} uid
   * @param {unknown} rawName
   */
  const resolveName = (uid, rawName) => {
    const name = cleanText(rawName);
    if (name && !isGenericComeviewName(name)) return name;
    const nick = cleanText(/** @type {any} */ (profileMap[uid])?.nickname);
    if (nick && !isGenericComeviewName(nick)) return nick;
    return '';
  };

  // ── ギフト応援(期間内の全配信ぶん・安価) ──
  const giftLiveIds = Array.isArray(input.liveIds)
    ? input.liveIds.map((id) => cleanText(id).toLowerCase()).filter(Boolean)
    : giftEventsByLive instanceof Map
      ? [...giftEventsByLive.keys()]
      : Object.keys(giftEventsByLive);
  /** @type {Map<string, { userId: string, name: string, points: number, count: number }>} */
  const giftByUid = new Map();
  for (const liveId of giftLiveIds) {
    const { events } = giftEventsForLive(giftEventsByLive, liveId);
    for (const event of events) {
      if (!event || typeof event !== 'object') continue;
      const record = /** @type {{ userId?: unknown, nickname?: unknown, point?: unknown }} */ (event);
      const uid = cleanText(record.userId);
      if (!uid) continue;
      const entry =
        giftByUid.get(uid) || { userId: uid, name: '', points: 0, count: 0 };
      entry.points += finiteNonNegative(record.point) || 0;
      entry.count += 1;
      const name = resolveName(uid, record.nickname);
      if (name) entry.name = name;
      giftByUid.set(uid, entry);
    }
  }
  const giftTop = [...giftByUid.values()]
    .sort((a, b) => b.points - a.points || b.count - a.count)
    .slice(0, topN);

  // ── コメント応援(直近最大12配信のサンプル・cap は呼び出し側が適用) ──
  /** @type {Map<string, { userId: string, name: string, count: number, lives: Set<string> }>} */
  const commentByUid = new Map();
  let sampledLives = 0;
  for (const [liveId, rows] of Object.entries(commentRowsByLive)) {
    if (!Array.isArray(rows)) continue;
    sampledLives += 1;
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const record = /** @type {{ userId?: unknown, nickname?: unknown, name?: unknown }} */ (row);
      const uid = cleanText(record.userId);
      if (!uid) continue;
      const entry =
        commentByUid.get(uid) ||
        { userId: uid, name: '', count: 0, lives: new Set() };
      entry.count += 1;
      entry.lives.add(liveId);
      const name = resolveName(uid, record.nickname ?? record.name);
      if (name) entry.name = name;
      commentByUid.set(uid, entry);
    }
  }
  const commentTop = [...commentByUid.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, topN)
    .map(({ lives, ...rest }) => ({ ...rest, liveCount: lives.size }));
  const supporters = commentByUid.size;
  const regulars = [...commentByUid.values()].filter((entry) => entry.lives.size >= 2).length;

  return {
    giftTop,
    commentTop,
    regulars: {
      sampledLives,
      supporters,
      regulars,
      ratio: supporters > 0 ? regulars / supporters : null
    }
  };
}
