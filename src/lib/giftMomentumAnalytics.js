/**
 * HTML マーケ分析向けのギフト深掘り集計。
 *
 * 複数の保存経路を二重計上しないよう、送り主別の pt は
 * 公式履歴/保存履歴/ライブ受信/ランキング由来の「最大値」を代表値にする。
 * 時刻分析は capturedAt を持つライブ受信イベントを優先し、無ければ giftUsers の
 * 検知時刻を近似値として使う。
 */

/**
 * @typedef {import('./commentRecord.js').StoredComment} StoredComment
 * @typedef {import('./giftEventStore.js').StoredGiftEvent} StoredGiftEvent
 * @typedef {import('./giftRecord.js').StoredGiftUser} StoredGiftUser
 */

/**
 * @typedef {{
 *   senderKey: string,
 *   userId: string,
 *   label: string,
 *   totalPoints: number,
 *   throwCount: number,
 *   avgPoint: number,
 *   sharePct: number,
 *   commentCount: number,
 *   typeLabel: string,
 *   evidence: string,
 *   rank: number|null,
 *   firstAt: number,
 *   lastAt: number,
 *   sources: string[]
 * }} GiftMomentumSenderRow
 */

/**
 * @typedef {{
 *   label: string,
 *   minute: number,
 *   giftCount: number,
 *   totalPoints: number,
 *   senderCount: number,
 *   beforeCommentCount: number,
 *   afterCommentCount: number,
 *   delta: number,
 *   flowLabel: string,
 *   topWords: string[],
 *   sampleGiftLabel: string,
 *   source: 'exact'|'approx'
 * }} GiftMomentumTimingWindow
 */

/**
 * @typedef {{
 *   hasSignals: boolean,
 *   totals: {
 *     senderCount: number,
 *     throwCount: number,
 *     totalPoints: number,
 *     knownPointRows: number,
 *     exactEventCount: number,
 *     approxEventCount: number,
 *     officialGiftPoints: number,
 *     topSenderSharePct: number
 *   },
 *   senderRows: GiftMomentumSenderRow[],
 *   timingWindows: GiftMomentumTimingWindow[],
 *   insightLines: string[],
 *   dataNotes: string[]
 * }} GiftMomentumAnalysis
 */

const THREE_MIN_MS = 3 * 60 * 1000;
const FIVE_MIN_MS = 5 * 60 * 1000;

/** @param {unknown} v */
function clean(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
}

/** @param {unknown} v */
function nonNegativeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** @param {unknown} v */
function positiveTimestamp(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** @param {unknown} v */
function positiveIntOrNull(v) {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** @param {unknown} v */
function normalizeThrowCount(v) {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/**
 * @param {unknown} raw
 * @returns {{ key: string, userId: string, label: string, isAnonymous: boolean }|null}
 */
function identifySender(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const r = /** @type {Record<string, unknown>} */ (raw);
  const userId = clean(r.userId ?? r.userKey);
  const label =
    clean(r.nickname) ||
    clean(r.senderName) ||
    clean(r.advertiserName) ||
    clean(r.name) ||
    (userId ? `u/${userId}` : '');
  const isAnonymous =
    Boolean(r.isAnonymous) ||
    /^(__anon_|anon:|a:)/i.test(userId) ||
    label === '名無し' ||
    label === '匿名';
  if (!userId && !label) return null;
  // 公式履歴由来の `__anon_<name>` は「同名バケット」なので、name 側に寄せる。
  // 184 の `a:<token>` は別人識別できるため uid 側を維持する。
  const key =
    userId && !/^__anon_/i.test(userId)
      ? `uid:${userId}`
      : `name:${label || '名無し'}`;
  return {
    key,
    userId,
    label: label || '名無し',
    isAnonymous
  };
}

/**
 * @returns {{
 *   key: string,
 *   userId: string,
 *   label: string,
 *   isAnonymous: boolean,
 *   eventPoints: number,
 *   eventThrows: number,
 *   userPoints: number,
 *   userThrows: number,
 *   historyPoints: number,
 *   historyThrows: number,
 *   officialHistoryPoints: number,
 *   officialHistoryThrows: number,
 *   officialContribution: number,
 *   adContribution: number,
 *   rank: number|null,
 *   firstAt: number,
 *   lastAt: number,
 *   sources: Set<string>
 * }}
 */
function emptyAgg(id) {
  return {
    key: id.key,
    userId: id.userId,
    label: id.label,
    isAnonymous: id.isAnonymous,
    eventPoints: 0,
    eventThrows: 0,
    userPoints: 0,
    userThrows: 0,
    historyPoints: 0,
    historyThrows: 0,
    officialHistoryPoints: 0,
    officialHistoryThrows: 0,
    officialContribution: 0,
    adContribution: 0,
    rank: null,
    firstAt: 0,
    lastAt: 0,
    sources: new Set()
  };
}

/**
 * @param {Map<string, ReturnType<typeof emptyAgg>>} map
 * @param {{ key: string, userId: string, label: string, isAnonymous: boolean }} id
 */
function getAgg(map, id) {
  let cur = map.get(id.key);
  if (!cur) {
    cur = emptyAgg(id);
    map.set(id.key, cur);
  }
  if (!cur.userId && id.userId) cur.userId = id.userId;
  if ((!cur.label || cur.label === '名無し') && id.label) cur.label = id.label;
  cur.isAnonymous = cur.isAnonymous || id.isAnonymous;
  return cur;
}

/**
 * @param {ReturnType<typeof emptyAgg>} agg
 * @param {number} at
 */
function touchTime(agg, at) {
  if (!at) return;
  if (!agg.firstAt || at < agg.firstAt) agg.firstAt = at;
  if (!agg.lastAt || at > agg.lastAt) agg.lastAt = at;
}

/**
 * @param {StoredComment[]} comments
 * @param {string} broadcasterUserId
 */
function buildCommentCountLookup(comments, broadcasterUserId) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  const excluded = clean(broadcasterUserId);
  for (const c of Array.isArray(comments) ? comments : []) {
    const uid = clean(c?.userId);
    if (excluded && uid === excluded) continue;
    const nick = clean(c?.nickname);
    if (uid) counts.set(`uid:${uid}`, (counts.get(`uid:${uid}`) || 0) + 1);
    if (nick) counts.set(`name:${nick}`, (counts.get(`name:${nick}`) || 0) + 1);
  }
  return counts;
}

/**
 * @param {StoredComment[]} comments
 * @param {number} fallback
 */
function resolveStreamStart(comments, fallback) {
  let min = positiveTimestamp(fallback);
  for (const c of Array.isArray(comments) ? comments : []) {
    const at = positiveTimestamp(c?.capturedAt);
    if (at && (!min || at < min)) min = at;
  }
  return min || 0;
}

/** @param {number} n */
function formatCompactNumber(n) {
  return Math.round(n).toLocaleString('ja-JP');
}

/** @param {number} minute */
function formatMinuteLabel(minute) {
  if (!Number.isFinite(minute) || minute < 0) return '開始時刻不明';
  const h = Math.floor(minute / 60);
  const m = Math.floor(minute % 60);
  return h > 0 ? `開始から約${h}時間${m}分` : `開始から約${m}分`;
}

/** @param {string} text */
function roughTokens(text) {
  const normalized = clean(text)
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[!?！？。、,．「」『』（）()[\]{}<>【】]/g, ' ');
  if (!normalized) return [];
  const stop = new Set(['です', 'ます', 'する', 'いる', 'ある', 'これ', 'それ', '今日']);
  return normalized
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && w.length <= 24 && !stop.has(w))
    .slice(0, 40);
}

/**
 * @param {Map<string, number>} counts
 * @param {number} limit
 */
function topWords(counts, limit) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
    .slice(0, limit)
    .map(([w]) => w);
}

/**
 * @param {number} before
 * @param {number} after
 */
function classifyFlow(before, after) {
  if (before === 0 && after === 0) return '静かな時間のギフト';
  if (after >= before + 3 || after >= before * 1.4) return 'ギフト後に反応が伸びた';
  if (before >= after + 3 || before >= after * 1.4) return '盛り上がり直後にギフト';
  return '前後とも反応あり';
}

/**
 * @param {{
 *   commentCount: number,
 *   throwCount: number,
 *   avgPoint: number,
 *   rank: number|null,
 *   isAnonymous: boolean,
 *   totalPoints: number,
 *   maxPoints: number
 * }} p
 */
function classifySenderType(p) {
  if (p.rank != null && p.rank <= 3) return 'ランキング上位の応援者';
  if (p.throwCount >= 4 && p.avgPoint <= 500) return 'こまめに投げる人';
  if (p.totalPoints >= Math.max(1000, p.maxPoints * 0.45) || p.avgPoint >= 1000) {
    return '大きめギフト型';
  }
  if (p.commentCount >= 5) return '会話もギフトも厚い人';
  if (p.commentCount <= 1) return p.isAnonymous ? '匿名で静かに支える人' : '静かに支える人';
  return '反応に合わせて支える人';
}

/**
 * @param {GiftMomentumSenderRow} row
 */
function senderEvidence(row) {
  const bits = [];
  if (row.totalPoints > 0) bits.push(`${formatCompactNumber(row.totalPoints)}pt`);
  if (row.throwCount > 0) bits.push(`${row.throwCount}投げ`);
  bits.push(`コメント${row.commentCount}件`);
  if (row.rank != null) bits.push(`貢献度${row.rank}位`);
  return bits.join(' / ');
}

/**
 * @param {{
 *   comments?: StoredComment[],
 *   giftUsers?: Array<StoredGiftUser & { throwCount?: number, totalPoints?: number }>,
 *   giftEvents?: StoredGiftEvent[],
 *   giftHistoryThrows?: Array<{ userId?: string, nickname?: string, throwCount?: number, totalPoints?: number, capturedAt?: number }>,
 *   officialGiftHistory?: Array<{ advertiserName?: string, isAnonymous?: boolean, point?: number }>,
 *   giftContributionRanking?: Array<{ userId?: string, name?: string, nickname?: string, contribution?: number, score?: number, rank?: number, isAnonymous?: boolean }>,
 *   adContributionRanking?: Array<{ userId?: string, name?: string, nickname?: string, contribution?: number, score?: number, rank?: number, isAnonymous?: boolean }>,
 *   programStats?: { giftPoints?: number|null } | null,
 * }} input
 * @param {{ broadcasterUserId?: string, nowMs?: number, maxSenders?: number, maxTimingWindows?: number }} [options]
 * @returns {GiftMomentumAnalysis}
 */
export function analyzeGiftMomentum(input, options = {}) {
  const comments = Array.isArray(input?.comments) ? input.comments : [];
  const giftUsers = Array.isArray(input?.giftUsers) ? input.giftUsers : [];
  const giftEvents = Array.isArray(input?.giftEvents) ? input.giftEvents : [];
  const giftHistoryThrows = Array.isArray(input?.giftHistoryThrows)
    ? input.giftHistoryThrows
    : [];
  const officialGiftHistory = Array.isArray(input?.officialGiftHistory)
    ? input.officialGiftHistory
    : [];
  const giftContributionRanking = Array.isArray(input?.giftContributionRanking)
    ? input.giftContributionRanking
    : [];
  const adContributionRanking = Array.isArray(input?.adContributionRanking)
    ? input.adContributionRanking
    : [];
  const maxSenders = Math.max(1, Math.min(20, Math.trunc(Number(options.maxSenders) || 10)));
  const maxTimingWindows = Math.max(
    1,
    Math.min(12, Math.trunc(Number(options.maxTimingWindows) || 6))
  );

  /** @type {Map<string, ReturnType<typeof emptyAgg>>} */
  const senderMap = new Map();
  /** @type {{ key: string, label: string, at: number, point: number, itemName: string, source: 'exact'|'approx' }[]} */
  const timingEvents = [];
  /** @type {{ key: string, label: string, at: number, point: number, itemName: string, source: 'exact'|'approx' }[]} */
  const approxEvents = [];

  for (const raw of giftEvents) {
    const id = identifySender(raw);
    if (!id) continue;
    const agg = getAgg(senderMap, id);
    const point = nonNegativeNumber(raw?.point);
    const at = positiveTimestamp(raw?.capturedAt);
    agg.eventPoints += point;
    agg.eventThrows += 1;
    const rank = positiveIntOrNull(raw?.contributionRank);
    if (rank != null) agg.rank = agg.rank == null ? rank : Math.min(agg.rank, rank);
    touchTime(agg, at);
    agg.sources.add('gift-events');
    if (at) {
      timingEvents.push({
        key: id.key,
        label: id.label,
        at,
        point,
        itemName: clean(raw?.itemName),
        source: 'exact'
      });
    }
  }

  for (const raw of giftUsers) {
    const id = identifySender(raw);
    if (!id) continue;
    const agg = getAgg(senderMap, id);
    const point = nonNegativeNumber(raw?.totalPoints);
    const throws = normalizeThrowCount(raw?.throwCount);
    const at = positiveTimestamp(raw?.capturedAt);
    agg.userPoints = Math.max(agg.userPoints, point);
    agg.userThrows = Math.max(agg.userThrows, throws);
    touchTime(agg, at);
    agg.sources.add('gift-users');
    if (at) {
      approxEvents.push({
        key: id.key,
        label: id.label,
        at,
        point,
        itemName: '',
        source: 'approx'
      });
    }
  }

  for (const raw of giftHistoryThrows) {
    const id = identifySender(raw);
    if (!id) continue;
    const agg = getAgg(senderMap, id);
    const point = nonNegativeNumber(raw?.totalPoints);
    const throws = normalizeThrowCount(raw?.throwCount);
    const at = positiveTimestamp(raw?.capturedAt);
    agg.historyPoints = Math.max(agg.historyPoints, point);
    agg.historyThrows = Math.max(agg.historyThrows, throws);
    touchTime(agg, at);
    agg.sources.add('gift-history');
  }

  for (const raw of officialGiftHistory) {
    const id = identifySender({
      advertiserName: raw?.advertiserName,
      isAnonymous: raw?.isAnonymous
    });
    if (!id) continue;
    const agg = getAgg(senderMap, id);
    agg.officialHistoryPoints += nonNegativeNumber(raw?.point);
    agg.officialHistoryThrows += 1;
    agg.sources.add('official-history');
  }

  for (const raw of giftContributionRanking) {
    const id = identifySender(raw);
    if (!id) continue;
    const agg = getAgg(senderMap, id);
    const contribution = Math.max(nonNegativeNumber(raw?.contribution), nonNegativeNumber(raw?.score));
    agg.officialContribution = Math.max(agg.officialContribution, contribution);
    const rank = positiveIntOrNull(raw?.rank);
    if (rank != null) agg.rank = agg.rank == null ? rank : Math.min(agg.rank, rank);
    agg.sources.add('gift-ranking');
  }

  for (const raw of adContributionRanking) {
    const id = identifySender(raw);
    if (!id) continue;
    const agg = getAgg(senderMap, id);
    const contribution = Math.max(nonNegativeNumber(raw?.contribution), nonNegativeNumber(raw?.score));
    agg.adContribution = Math.max(agg.adContribution, contribution);
    agg.sources.add('ad-ranking');
  }

  const commentCounts = buildCommentCountLookup(comments, options.broadcasterUserId || '');
  const rawRows = [...senderMap.values()].map((agg) => {
    const totalPoints = Math.max(
      agg.historyPoints,
      agg.officialHistoryPoints,
      agg.eventPoints,
      agg.userPoints,
      agg.officialContribution
    );
    const throwCount = Math.max(
      agg.historyThrows,
      agg.officialHistoryThrows,
      agg.eventThrows,
      agg.userThrows
    );
    const byUid = agg.userId ? commentCounts.get(`uid:${agg.userId}`) || 0 : 0;
    const byName = agg.label ? commentCounts.get(`name:${agg.label}`) || 0 : 0;
    const commentCount = Math.max(byUid, byName);
    return {
      agg,
      totalPoints,
      throwCount,
      commentCount,
      avgPoint: throwCount > 0 ? Math.round(totalPoints / throwCount) : totalPoints
    };
  });
  const maxPoints = rawRows.reduce((mx, r) => Math.max(mx, r.totalPoints), 0);
  const totalPointsAll = rawRows.reduce((sum, r) => sum + r.totalPoints, 0);
  const totalThrows = rawRows.reduce((sum, r) => sum + r.throwCount, 0);
  const knownPointRows = rawRows.filter((r) => r.totalPoints > 0).length;

  const visibleRawRows = rawRows.filter(
    (r) => r.totalPoints > 0 || r.throwCount > 0 || r.agg.rank != null
  );

  /** @type {GiftMomentumSenderRow[]} */
  const senderRows = visibleRawRows
    .map((r) => {
      const typeLabel = classifySenderType({
        commentCount: r.commentCount,
        throwCount: r.throwCount,
        avgPoint: r.avgPoint,
        rank: r.agg.rank,
        isAnonymous: r.agg.isAnonymous,
        totalPoints: r.totalPoints,
        maxPoints
      });
      /** @type {GiftMomentumSenderRow} */
      const row = {
        senderKey: r.agg.key,
        userId: r.agg.userId,
        label: r.agg.label || '名無し',
        totalPoints: Math.round(r.totalPoints),
        throwCount: r.throwCount,
        avgPoint: Math.round(r.avgPoint),
        sharePct:
          totalPointsAll > 0 ? Math.round((r.totalPoints / totalPointsAll) * 1000) / 10 : 0,
        commentCount: r.commentCount,
        typeLabel,
        evidence: '',
        rank: r.agg.rank,
        firstAt: r.agg.firstAt,
        lastAt: r.agg.lastAt,
        sources: [...r.agg.sources].sort()
      };
      row.evidence = senderEvidence(row);
      return row;
    })
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.throwCount !== a.throwCount) return b.throwCount - a.throwCount;
      return a.label.localeCompare(b.label, 'ja');
    })
    .slice(0, maxSenders);

  const exactKeys = new Set(timingEvents.map((e) => e.key));
  const timingSource = [
    ...timingEvents,
    ...approxEvents.filter((e) => !exactKeys.has(e.key))
  ].sort((a, b) => a.at - b.at);
  const streamStart = resolveStreamStart(
    comments,
    timingSource.length ? timingSource[0].at : 0
  );
  const timingWindows = buildTimingWindows({
    comments,
    timingEvents: timingSource,
    streamStart,
    maxTimingWindows
  });

  const officialGiftPoints = nonNegativeNumber(input?.programStats?.giftPoints);
  const topShare = senderRows[0]?.sharePct || 0;
  const insightLines = buildInsightLines({
    senderRows,
    timingWindows,
    officialGiftPoints,
    totalPointsAll,
    totalThrows
  });

  const dataNotes = [];
  if (giftEvents.length) {
    dataNotes.push('ギフト時刻はライブ受信イベントの capturedAt を優先しています。');
  }
  if (approxEvents.length) {
    dataNotes.push('giftUsers の時刻は初回検知・更新時刻に近い場合があります。');
  }
  if (officialGiftHistory.length || giftHistoryThrows.length) {
    dataNotes.push('公式履歴・保存履歴は送り主別 pt の補完に使い、時刻分析には原則使いません。');
  }
  if (giftContributionRanking.length) {
    dataNotes.push('貢献度ランキング由来の pt は、個別ギフト履歴が無い送り主の代表値として使います。');
  }
  if (adContributionRanking.length) {
    dataNotes.push('ニコ広告ランキングはギフトとは別枠の応援シグナルとして参照しています。');
  }

  const hasSignals =
    senderRows.length > 0 ||
    timingWindows.length > 0 ||
    officialGiftPoints > 0 ||
    giftUsers.length > 0 ||
    giftEvents.length > 0;

  return {
    hasSignals,
    totals: {
      senderCount: visibleRawRows.length,
      throwCount: totalThrows,
      totalPoints: Math.round(totalPointsAll),
      knownPointRows,
      exactEventCount: timingEvents.length,
      approxEventCount: approxEvents.length,
      officialGiftPoints: Math.round(officialGiftPoints),
      topSenderSharePct: topShare
    },
    senderRows,
    timingWindows,
    insightLines,
    dataNotes
  };
}

/**
 * @param {{
 *   comments: StoredComment[],
 *   timingEvents: { key: string, label: string, at: number, point: number, itemName: string, source: 'exact'|'approx' }[],
 *   streamStart: number,
 *   maxTimingWindows: number
 * }} opts
 * @returns {GiftMomentumTimingWindow[]}
 */
function buildTimingWindows(opts) {
  if (!opts.timingEvents.length || !opts.streamStart) return [];
  /** @type {Map<number, typeof opts.timingEvents>} */
  const groups = new Map();
  for (const ev of opts.timingEvents) {
    const bucket = Math.floor((ev.at - opts.streamStart) / FIVE_MIN_MS);
    const key = Math.max(0, bucket);
    const list = groups.get(key) || [];
    list.push(ev);
    groups.set(key, list);
  }
  /** @type {GiftMomentumTimingWindow[]} */
  const windows = [];
  for (const events of groups.values()) {
    const sorted = events.slice().sort((a, b) => a.at - b.at);
    const firstAt = sorted[0].at;
    const lastAt = sorted[sorted.length - 1].at;
    let before = 0;
    let after = 0;
    /** @type {Map<string, number>} */
    const wordCounts = new Map();
    for (const c of opts.comments) {
      const at = positiveTimestamp(c?.capturedAt);
      if (!at) continue;
      if (at >= firstAt - THREE_MIN_MS && at < firstAt) before += 1;
      if (at > lastAt && at <= lastAt + THREE_MIN_MS) after += 1;
      if (at >= firstAt - THREE_MIN_MS && at <= lastAt + THREE_MIN_MS) {
        for (const w of roughTokens(String(c?.text || ''))) {
          wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
        }
      }
    }
    const totalPoints = sorted.reduce((sum, ev) => sum + nonNegativeNumber(ev.point), 0);
    const minute = Math.max(0, Math.round((firstAt - opts.streamStart) / 60_000));
    const senders = new Set(sorted.map((ev) => ev.key));
    const sample = sorted
      .map((ev) => [ev.label, ev.itemName].filter(Boolean).join(' / '))
      .filter(Boolean)[0] || 'ギフト';
    windows.push({
      label: formatMinuteLabel(minute),
      minute,
      giftCount: sorted.length,
      totalPoints: Math.round(totalPoints),
      senderCount: senders.size,
      beforeCommentCount: before,
      afterCommentCount: after,
      delta: after - before,
      flowLabel: classifyFlow(before, after),
      topWords: topWords(wordCounts, 5),
      sampleGiftLabel: sample,
      source: sorted.some((ev) => ev.source === 'exact') ? 'exact' : 'approx'
    });
  }
  return windows
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.giftCount !== a.giftCount) return b.giftCount - a.giftCount;
      return a.minute - b.minute;
    })
    .slice(0, opts.maxTimingWindows);
}

/**
 * @param {{
 *   senderRows: GiftMomentumSenderRow[],
 *   timingWindows: GiftMomentumTimingWindow[],
 *   officialGiftPoints: number,
 *   totalPointsAll: number,
 *   totalThrows: number
 * }} p
 */
function buildInsightLines(p) {
  /** @type {string[]} */
  const lines = [];
  if (p.officialGiftPoints > 0) {
    lines.push(`公式ギフト累計は ${formatCompactNumber(p.officialGiftPoints)} pt です。`);
  }
  const top = p.senderRows[0];
  if (top && top.sharePct >= 60) {
    lines.push(`ギフトは ${top.label} さんに寄った集中型です（代表値の ${top.sharePct}%）。`);
  } else if (p.senderRows.length >= 3) {
    const top3 = p.senderRows.slice(0, 3).reduce((sum, row) => sum + row.sharePct, 0);
    if (top3 >= 75) {
      lines.push(`上位3名で約 ${Math.round(top3)}% を占める、コア応援者が強い回です。`);
    } else {
      lines.push('ギフトは複数の送り主に分散していて、広めに支えられた回です。');
    }
  }
  const quiet = p.senderRows.filter((r) => r.commentCount <= 1).length;
  const chatty = p.senderRows.filter((r) => r.commentCount >= 5).length;
  if (quiet >= Math.max(1, Math.ceil(p.senderRows.length / 2))) {
    lines.push('コメントは少なめでもギフトで支える人が目立ちます。名前を呼ぶお礼が効きやすい型です。');
  } else if (chatty > 0) {
    lines.push('会話にも入る応援者がギフトも支えているため、普段のコメント拾いが支援につながっています。');
  }
  const bestWindow = p.timingWindows[0];
  if (bestWindow) {
    lines.push(
      `${bestWindow.label} がギフトの山です（${bestWindow.giftCount}件 / ${formatCompactNumber(bestWindow.totalPoints)}pt、${bestWindow.flowLabel}）。`
    );
  } else if (p.totalThrows > 0 || p.totalPointsAll > 0) {
    lines.push('送り主別の傾向は読めますが、正確なギフト時刻は不足しています。');
  }
  return lines.slice(0, 5);
}
