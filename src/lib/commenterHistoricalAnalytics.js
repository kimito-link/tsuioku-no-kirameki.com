/**
 * 過去 N 配信 × 現在配信のコメンターを横断分析する純粋関数群。
 *
 * 設計（0.1.23 X: マーケ分析有料 / ユーザー層動向）:
 *   - `classifyCommentersAgainstHistory` … 現在のコメンターを「new / repeat / heavy」に分類
 *   - `findDepartedHeavyCommenters`     … 過去ヘビー層で現在不参加 = 離反者 TOP（ラテラル L8）
 *   - `buildCommenterAttendanceMatrix`  … TOP K コメンター × N 配信 の出席マトリクス（ラテラル L9）
 *
 *   いずれも `pastBroadcasts: { liveId, comments }[]` を受け取り、現在の `currentLiveId`
 *   と同じ liveId は除外してから集計する。
 */

/**
 * @typedef {{ userId?: string|null, nickname?: string|null }} HistoricalCommentInput
 */

/**
 * @typedef {{
 *   liveId: string,
 *   comments: HistoricalCommentInput[]
 * }} BroadcastBundle
 */

/**
 * @param {unknown} v
 * @returns {string}
 */
function cleanUid(v) {
  if (v == null) return '';
  return String(v).trim();
}

/**
 * 過去配信から「userId → 累積コメ数 / 出現放送数 / nickname」の Map を作る
 * （currentLiveId 除外）。0.1.34 (AI): 表示用に nickname も同時に集約する。
 * 同じ userId で nickname が複数あった場合は「最も長い」候補を採用（ハンドル名は
 * 詳しいほどよい想定）。
 *
 * @param {BroadcastBundle[]} pastBroadcasts
 * @param {string} currentLiveId
 * @returns {Map<string, { userId: string, totalComments: number, broadcastIds: Set<string>, nickname: string }>}
 */
function indexPastUsers(pastBroadcasts, currentLiveId) {
  /** @type {Map<string, { userId: string, totalComments: number, broadcastIds: Set<string>, nickname: string }>} */
  const map = new Map();
  const currentLid = cleanUid(currentLiveId).toLowerCase();
  const list = Array.isArray(pastBroadcasts) ? pastBroadcasts : [];
  for (const b of list) {
    if (!b || typeof b !== 'object') continue;
    const lid = cleanUid(b.liveId).toLowerCase();
    if (!lid) continue;
    if (lid === currentLid) continue;
    const cs = Array.isArray(b.comments) ? b.comments : [];
    for (const c of cs) {
      const uid = cleanUid(c?.userId);
      if (!uid) continue;
      const nick = String(c?.nickname == null ? '' : c.nickname).trim();
      let row = map.get(uid);
      if (!row) {
        row = { userId: uid, totalComments: 0, broadcastIds: new Set(), nickname: '' };
        map.set(uid, row);
      }
      row.totalComments += 1;
      row.broadcastIds.add(lid);
      // 0.1.34 (AI): より「詳しい」nickname（長い方）を残す
      if (nick && nick.length > row.nickname.length) {
        row.nickname = nick;
      }
    }
  }
  return map;
}

/**
 * @param {{
 *   currentLiveId?: string,
 *   currentComments?: HistoricalCommentInput[],
 *   pastBroadcasts?: BroadcastBundle[],
 *   heavyThreshold?: number
 * } | null | undefined} input
 * @returns {{
 *   totalCurrent: number,
 *   newCount: number,
 *   repeatCount: number,
 *   heavyCount: number,
 *   newRatio: number,
 *   repeatRatio: number,
 *   heavyRatio: number
 * }}
 */
export function classifyCommentersAgainstHistory(input) {
  const params = input && typeof input === 'object' ? input : {};
  const currentLiveId = cleanUid(params.currentLiveId);
  const currentComments = Array.isArray(params.currentComments) ? params.currentComments : [];
  const pastBroadcasts = Array.isArray(params.pastBroadcasts) ? params.pastBroadcasts : [];
  const heavyThreshold =
    typeof params.heavyThreshold === 'number' && params.heavyThreshold > 0
      ? params.heavyThreshold
      : 5;

  const past = indexPastUsers(pastBroadcasts, currentLiveId);

  /** @type {Set<string>} */
  const currentUsers = new Set();
  for (const c of currentComments) {
    const uid = cleanUid(c?.userId);
    if (!uid) continue;
    currentUsers.add(uid);
  }

  let newCount = 0;
  let repeatCount = 0;
  let heavyCount = 0;
  for (const uid of currentUsers) {
    const past_ = past.get(uid);
    if (!past_) {
      newCount += 1;
    } else {
      repeatCount += 1;
      if (past_.totalComments >= heavyThreshold) heavyCount += 1;
    }
  }

  const total = currentUsers.size;
  /** @param {number} n */
  const ratio = (n) => (total > 0 ? Math.round((n / total) * 1000) / 1000 : 0);
  return {
    totalCurrent: total,
    newCount,
    repeatCount,
    heavyCount,
    newRatio: ratio(newCount),
    repeatRatio: ratio(repeatCount),
    heavyRatio: ratio(heavyCount)
  };
}

/**
 * @param {{
 *   currentComments?: HistoricalCommentInput[],
 *   pastBroadcasts?: BroadcastBundle[],
 *   heavyThreshold?: number,
 *   topN?: number
 * } | null | undefined} input
 * @returns {{ userId: string, nickname: string, totalComments: number, broadcastCount: number }[]}
 */
export function findDepartedHeavyCommenters(input) {
  const params = input && typeof input === 'object' ? input : {};
  const currentComments = Array.isArray(params.currentComments) ? params.currentComments : [];
  const pastBroadcasts = Array.isArray(params.pastBroadcasts) ? params.pastBroadcasts : [];
  const heavyThreshold =
    typeof params.heavyThreshold === 'number' && params.heavyThreshold > 0
      ? params.heavyThreshold
      : 5;
  const topN =
    typeof params.topN === 'number' && params.topN > 0 ? Math.floor(params.topN) : 10;

  const past = indexPastUsers(pastBroadcasts, '');
  /** @type {Set<string>} */
  const currentUsers = new Set();
  for (const c of currentComments) {
    const uid = cleanUid(c?.userId);
    if (uid) currentUsers.add(uid);
  }

  const departed = [];
  for (const [uid, row] of past) {
    if (currentUsers.has(uid)) continue;
    if (row.totalComments < heavyThreshold) continue;
    departed.push({
      userId: uid,
      // 0.1.34 (AI): 表示用 nickname も返す（過去配信から最も詳しいハンドル名）。
      nickname: row.nickname || '',
      totalComments: row.totalComments,
      broadcastCount: row.broadcastIds.size
    });
  }
  departed.sort((a, b) => b.totalComments - a.totalComments);
  return departed.slice(0, topN);
}

/**
 * @param {{
 *   broadcasts?: BroadcastBundle[],
 *   topN?: number
 * } | null | undefined} input
 * @returns {{
 *   users: {
 *     userId: string,
 *     nickname: string,
 *     totalComments: number,
 *     attendance: number[]
 *   }[],
 *   broadcasts: { liveId: string, totalComments: number }[]
 * }}
 */
export function buildCommenterAttendanceMatrix(input) {
  const params = input && typeof input === 'object' ? input : {};
  const broadcasts = Array.isArray(params.broadcasts) ? params.broadcasts : [];
  const topN =
    typeof params.topN === 'number' && params.topN > 0 ? Math.floor(params.topN) : 20;

  if (!broadcasts.length) return { users: [], broadcasts: [] };

  /** @type {{ liveId: string, users: Map<string, number> }[]} */
  const perBroadcast = [];
  /** @type {Map<string, number>} */
  const totals = new Map();
  /** @type {Map<string, string>} 0.1.34 (AI): userId -> 最も詳しい nickname */
  const nicknames = new Map();
  for (const b of broadcasts) {
    if (!b || typeof b !== 'object') continue;
    const lid = cleanUid(b.liveId);
    if (!lid) continue;
    /** @type {Map<string, number>} */
    const userCount = new Map();
    const cs = Array.isArray(b.comments) ? b.comments : [];
    for (const c of cs) {
      const uid = cleanUid(c?.userId);
      if (!uid) continue;
      userCount.set(uid, (userCount.get(uid) || 0) + 1);
      totals.set(uid, (totals.get(uid) || 0) + 1);
      const nick = String(c?.nickname == null ? '' : c.nickname).trim();
      if (nick) {
        const cur = nicknames.get(uid) || '';
        if (nick.length > cur.length) nicknames.set(uid, nick);
      }
    }
    perBroadcast.push({ liveId: lid, users: userCount });
  }

  // TOP N コメンター
  const ranked = [...totals.entries()]
    .map(([uid, n]) => ({ userId: uid, totalComments: n }))
    .sort((a, b) => b.totalComments - a.totalComments)
    .slice(0, topN);

  /** @type {{ userId: string, nickname: string, totalComments: number, attendance: number[] }[]} */
  const users = ranked.map((u) => ({
    userId: u.userId,
    nickname: nicknames.get(u.userId) || '',
    totalComments: u.totalComments,
    attendance: perBroadcast.map((b) => (b.users.has(u.userId) ? 1 : 0))
  }));

  return {
    users,
    broadcasts: perBroadcast.map((b) => ({
      liveId: b.liveId,
      totalComments: [...b.users.values()].reduce((a, x) => a + x, 0)
    }))
  };
}
