/**
 * コメンター（数値 userId）のフォロー/フォロワー数・プレミアム・LV を userId 単位でためる
 * 横断キャッシュ。`normalizeNicoUserProfileResponse`（nvapi /v1/users/<id>）の戻り値から
 * 抽出し、レポートで「フォロワー数」等を出すために使う。
 *
 * 設計方針:
 *   ・配信者プロフィール取得と同じく nvapi を再利用（新ハンドラを増やさない）。
 *   ・live を跨いで再利用できるよう userId キーの単一マップ。TTL（既定 24h）と件数上限あり。
 *   ・純関数のみ（chrome 依存なし）。content/popup から呼ぶ。
 */

/** フォローキャッシュの保持上限（chrome.storage.local 容量対策） */
export const COMMENTER_FOLLOW_CACHE_MAX = 8000;
/**
 * 再取得を抑止する鮮度（これより新しければ再 fetch しない）。
 *
 * v0.1.607 (OSINT Phase 1-A): 24h → 6h に短縮。
 *   旧 24h は「過去 24h 内に一度でも fetch した uid は再取得対象外」となり、
 *   配信を毎日／数日ごとにやる人は **キャッシュ焼き付きで新規取得 1%** だった
 *   (Explore 調査・2026-06-03 の真因 1 位)。
 *   6h に短縮することで、長尺配信中でも 1 回は再取得され、配信またぎでも
 *   半日経てば最新値が取れる。同時に nvapi への request 量も最大 4 倍までで
 *   抑えられる（既存の COMMENTER_FOLLOW_FETCH_MIN_GAP_MS と BATCH 制限で
 *   ピーク負荷は据え置き）。
 *   OSINT の「日次推移を残す」設計は Phase 1-D の時系列追記ストレージで対応。
 */
export const COMMENTER_FOLLOW_TTL_MS = 6 * 60 * 60 * 1000;
/** content 側の follow 専用バッチ（1 tick あたり nvapi 問い合わせ数） */
export const COMMENTER_FOLLOW_FETCH_BATCH = 8;

/**
 * @typedef {{
 *   followerCount?: number,
 *   followeeCount?: number,
 *   isPremium?: boolean,
 *   level?: number,
 *   fetchedAt: number
 * }} CommenterFollowEntry
 */

/**
 * @typedef {{
 *   userId: string,
 *   commentCount: number,
 *   nickname: string,
 *   avatarUrl: string
 * }} NumericCommenterStat
 */

/**
 * @typedef {{
 *   userId: string,
 *   commentCount: number,
 *   nickname: string,
 *   followerCount?: number,
 *   followeeCount?: number,
 *   level?: number,
 *   isPremium?: boolean,
 *   followFetchedAt?: number,
 *   followsBroadcaster?: boolean,
 *   followingListStatus?: string,
 *   followingListCount?: number
 * }} CommenterFollowRow
 */

/**
 * @typedef {{
 *   liveId: string,
 *   capturedAt: number,
 *   totalNumericCommenters: number,
 *   withFollowData: number,
 *   rows: CommenterFollowRow[]
 * }} CommenterFollowLiveSnapshot
 */

/**
 * @param {unknown} v
 * @returns {number|null} 0 以上の整数のみ
 */
function posIntOrNull(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/**
 * @param {number} fetchedAt
 * @param {number} nowMs
 * @param {number} ttlMs
 * @returns {boolean}
 */
export function isFreshFollowEntry(fetchedAt, nowMs, ttlMs) {
  const at = Number(fetchedAt);
  if (!Number.isFinite(at) || at <= 0) return false;
  const now = Number.isFinite(nowMs) && nowMs > 0 ? nowMs : Date.now();
  const ttl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : COMMENTER_FOLLOW_TTL_MS;
  return at >= now - ttl;
}

/**
 * 任意のオブジェクトを CommenterFollowEntry に正規化する（最低 1 つの数値/真偽が要る）。
 * @param {unknown} raw
 * @param {number} [fetchedAtFallback]
 * @returns {CommenterFollowEntry|null}
 */
export function normalizeCommenterFollowEntry(raw, fetchedAtFallback) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const followerCount = posIntOrNull(o.followerCount);
  const followeeCount = posIntOrNull(o.followeeCount);
  const level = posIntOrNull(o.level);
  const isPremium = typeof o.isPremium === 'boolean' ? o.isPremium : null;
  if (
    followerCount === null &&
    followeeCount === null &&
    level === null &&
    isPremium === null
  ) {
    return null;
  }
  const fa = Number(o.fetchedAt);
  const fetchedAt =
    Number.isFinite(fa) && fa > 0
      ? fa
      : Number.isFinite(Number(fetchedAtFallback)) && Number(fetchedAtFallback) > 0
        ? Number(fetchedAtFallback)
        : Date.now();
  /** @type {CommenterFollowEntry} */
  const entry = { fetchedAt };
  if (followerCount !== null) entry.followerCount = followerCount;
  if (followeeCount !== null) entry.followeeCount = followeeCount;
  if (level !== null) entry.level = level;
  if (isPremium !== null) entry.isPremium = isPremium;
  return entry;
}

/**
 * ストレージから読んだ生マップを正規化する。TTL 切れ・不正値は捨てる。
 * @param {unknown} raw
 * @param {{ nowMs?: number, ttlMs?: number }} [opts]
 * @returns {Record<string, CommenterFollowEntry>}
 */
export function normalizeCommenterFollowMap(raw, opts = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const nowMs = Number.isFinite(Number(opts.nowMs)) && Number(opts.nowMs) > 0 ? Number(opts.nowMs) : Date.now();
  const ttlMs = Number.isFinite(Number(opts.ttlMs)) && Number(opts.ttlMs) > 0 ? Number(opts.ttlMs) : COMMENTER_FOLLOW_TTL_MS;
  const src = /** @type {Record<string, unknown>} */ (raw);
  /** @type {Record<string, CommenterFollowEntry>} */
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    const uid = String(k || '').trim();
    if (!/^\d{1,18}$/.test(uid)) continue;
    const entry = normalizeCommenterFollowEntry(v);
    if (!entry) continue;
    if (!isFreshFollowEntry(entry.fetchedAt, nowMs, ttlMs)) continue;
    out[uid] = entry;
  }
  return out;
}

/**
 * `normalizeNicoUserProfileResponse` の戻り値から follow 用のフィールドを取り出す。
 * @param {unknown} profile
 * @param {number} [now]
 * @returns {CommenterFollowEntry|null}
 */
export function commenterFollowEntryFromProfile(profile, now) {
  return normalizeCommenterFollowEntry(profile, now);
}

/**
 * uid のエントリを upsert（より新しい fetchedAt のときだけ置き換え）。上限超過は古い順に捨てる。
 * @param {Record<string, CommenterFollowEntry>} map
 * @param {string} uid
 * @param {CommenterFollowEntry|null} entry
 * @param {{ maxEntries?: number }} [opts]
 * @returns {boolean} map を変更したか
 */
export function upsertCommenterFollowEntry(map, uid, entry, opts = {}) {
  if (!map || typeof map !== 'object') return false;
  const id = String(uid || '').trim();
  if (!/^\d{1,18}$/.test(id) || !entry) return false;
  const prev = map[id];
  if (prev && Number(prev.fetchedAt) >= Number(entry.fetchedAt)) return false;
  map[id] = entry;
  const max = Number.isFinite(Number(opts.maxEntries)) && Number(opts.maxEntries) > 0
    ? Math.floor(Number(opts.maxEntries))
    : COMMENTER_FOLLOW_CACHE_MAX;
  const ids = Object.keys(map);
  if (ids.length > max) {
    ids.sort((a, b) => (Number(map[b]?.fetchedAt) || 0) - (Number(map[a]?.fetchedAt) || 0));
    for (const drop of ids.slice(max)) delete map[drop];
  }
  return true;
}

/**
 * 与えた候補 uid のうち、follow キャッシュに無い/TTL 切れのものを最大 limit 件返す。
 * @param {Iterable<string>} candidateUids
 * @param {Record<string, CommenterFollowEntry>} cache
 * @param {{ nowMs?: number, ttlMs?: number, limit?: number, forceRefetch?: boolean }} [opts]
 *   - forceRefetch: TTL チェックをスキップして、キャッシュ済みでも対象に含める。
 *     popup の「強制再取得」ボタン用(v0.1.608 Phase 1-C)。既存呼び出しは
 *     省略可なので互換性あり。
 * @returns {string[]}
 */
export function pickFollowUidsToFetch(candidateUids, cache, opts = {}) {
  const nowMs = Number.isFinite(Number(opts.nowMs)) && Number(opts.nowMs) > 0 ? Number(opts.nowMs) : Date.now();
  const ttlMs = Number.isFinite(Number(opts.ttlMs)) && Number(opts.ttlMs) > 0 ? Number(opts.ttlMs) : COMMENTER_FOLLOW_TTL_MS;
  const limit = Number.isFinite(Number(opts.limit)) && Number(opts.limit) > 0
    ? Math.floor(Number(opts.limit))
    : COMMENTER_FOLLOW_FETCH_BATCH;
  const forceRefetch = opts.forceRefetch === true;
  const safeCache = cache && typeof cache === 'object' ? cache : {};
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const raw of candidateUids || []) {
    const uid = String(raw || '').trim();
    if (!/^\d{1,18}$/.test(uid) || seen.has(uid)) continue;
    seen.add(uid);
    if (!forceRefetch) {
      const hit = safeCache[uid];
      if (hit && isFreshFollowEntry(Number(hit.fetchedAt), nowMs, ttlMs)) continue;
    }
    out.push(uid);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * コメント配列から数値 userId のコメンターを集計（コメ数降順）。
 * @param {readonly { userId?: string|null, nickname?: string, avatarUrl?: string|null }[]} comments
 * @param {{ excludeUserId?: string }} [opts]
 * @returns {NumericCommenterStat[]}
 */
export function collectNumericCommentersFromComments(comments, opts = {}) {
  if (!Array.isArray(comments) || !comments.length) return [];
  const exclude = String(opts.excludeUserId || '').trim();
  /** @type {Map<string, NumericCommenterStat>} */
  const map = new Map();
  for (const c of comments) {
    const uid = String(c?.userId || '').trim();
    if (!/^\d{1,18}$/.test(uid)) continue;
    if (exclude && uid === exclude) continue;
    const prev = map.get(uid);
    if (prev) {
      prev.commentCount += 1;
      if (!prev.nickname && c.nickname) prev.nickname = String(c.nickname).trim();
      if (!prev.avatarUrl && c.avatarUrl) prev.avatarUrl = String(c.avatarUrl).trim();
    } else {
      map.set(uid, {
        userId: uid,
        commentCount: 1,
        nickname: String(c?.nickname || '').trim(),
        avatarUrl: String(c?.avatarUrl || '').trim()
      });
    }
  }
  return [...map.values()].sort((a, b) => b.commentCount - a.commentCount);
}

/**
 * 数値コメンター統計 + follow キャッシュ + 任意の nickname キャッシュから行を組み立てる。
 * @param {NumericCommenterStat[]} stats
 * @param {Record<string, CommenterFollowEntry>} followMap
 * @param {Record<string, { nickname?: string }>} [profileMap]
 * @returns {CommenterFollowRow[]}
 */
export function buildCommenterFollowRows(stats, followMap, profileMap = {}) {
  if (!Array.isArray(stats) || !stats.length) return [];
  const safeFollow = followMap && typeof followMap === 'object' ? followMap : {};
  const safeProfile = profileMap && typeof profileMap === 'object' ? profileMap : {};
  return stats.map((s) => {
    const hit = safeFollow[s.userId];
    const prof = safeProfile[s.userId];
    /** @type {CommenterFollowRow} */
    const row = {
      userId: s.userId,
      commentCount: s.commentCount,
      nickname: String(prof?.nickname || s.nickname || '').trim()
    };
    if (typeof hit?.followerCount === 'number') row.followerCount = hit.followerCount;
    if (typeof hit?.followeeCount === 'number') row.followeeCount = hit.followeeCount;
    if (typeof hit?.level === 'number') row.level = hit.level;
    if (typeof hit?.isPremium === 'boolean') row.isPremium = hit.isPremium;
    if (typeof hit?.fetchedAt === 'number') row.followFetchedAt = hit.fetchedAt;
    return row;
  });
}

/**
 * 配信単位のフォロー付きコメンター一覧スナップショットを組み立てる。
 * @param {string} liveId
 * @param {CommenterFollowRow[]} rows
 * @param {number} [capturedAt]
 * @returns {CommenterFollowLiveSnapshot|null}
 */
export function buildCommenterFollowLiveSnapshot(liveId, rows, capturedAt) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(lid) || !Array.isArray(rows)) return null;
  const at = Number.isFinite(Number(capturedAt)) && Number(capturedAt) > 0
    ? Number(capturedAt)
    : Date.now();
  const withFollowData = rows.filter(
    (r) =>
      typeof r.followerCount === 'number' ||
      typeof r.followeeCount === 'number' ||
      typeof r.level === 'number' ||
      typeof r.isPremium === 'boolean'
  ).length;
  return {
    liveId: lid,
    capturedAt: at,
    totalNumericCommenters: rows.length,
    withFollowData,
    rows
  };
}

/**
 * storage から読んだ live snapshot を正規化する。
 * @param {unknown} raw
 * @returns {CommenterFollowLiveSnapshot|null}
 */
export function normalizeCommenterFollowLiveSnapshot(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const lid = String(o.liveId || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(lid)) return null;
  const capturedAt = Number(o.capturedAt);
  if (!Number.isFinite(capturedAt) || capturedAt <= 0) return null;
  const srcRows = Array.isArray(o.rows) ? o.rows : [];
  /** @type {CommenterFollowRow[]} */
  const rows = [];
  for (const item of srcRows) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const r = /** @type {Record<string, unknown>} */ (item);
    const uid = String(r.userId || '').trim();
    if (!/^\d{1,18}$/.test(uid)) continue;
    const commentCount = posIntOrNull(r.commentCount);
    if (commentCount === null || commentCount < 1) continue;
    /** @type {CommenterFollowRow} */
    const row = {
      userId: uid,
      commentCount,
      nickname: String(r.nickname || '').trim()
    };
    const followerCount = posIntOrNull(r.followerCount);
    const followeeCount = posIntOrNull(r.followeeCount);
    const level = posIntOrNull(r.level);
    if (followerCount !== null) row.followerCount = followerCount;
    if (followeeCount !== null) row.followeeCount = followeeCount;
    if (level !== null && level > 0) row.level = level;
    if (typeof r.isPremium === 'boolean') row.isPremium = r.isPremium;
    const fetchedAt = Number(r.followFetchedAt);
    if (Number.isFinite(fetchedAt) && fetchedAt > 0) row.followFetchedAt = fetchedAt;
    if (typeof r.followsBroadcaster === 'boolean') row.followsBroadcaster = r.followsBroadcaster;
    const flStatus = String(r.followingListStatus || '').trim();
    if (flStatus === 'ok' || flStatus === 'forbidden' || flStatus === 'error' || flStatus === 'login_required') {
      row.followingListStatus = flStatus;
    }
    const flCount = posIntOrNull(r.followingListCount);
    if (flCount !== null) row.followingListCount = flCount;
    rows.push(row);
  }
  rows.sort((a, b) => b.commentCount - a.commentCount);
  const withFollowData = rows.filter(
    (r) =>
      typeof r.followerCount === 'number' ||
      typeof r.followeeCount === 'number' ||
      typeof r.level === 'number' ||
      typeof r.isPremium === 'boolean'
  ).length;
  return {
    liveId: lid,
    capturedAt,
    totalNumericCommenters: rows.length,
    withFollowData,
    rows
  };
}

/**
 * follow 行の値を UserCommentProfile 互換オブジェクトへ後付けする。
 * @param {{ userId?: string, followerCount?: number, followeeCount?: number, isPremium?: boolean, userLevel?: number }} user
 * @param {CommenterFollowRow|CommenterFollowEntry|null|undefined} follow
 */
export function applyFollowFieldsToUser(user, follow) {
  if (!user || !follow) return;
  if (typeof follow.followerCount === 'number') user.followerCount = follow.followerCount;
  if (typeof follow.followeeCount === 'number') user.followeeCount = follow.followeeCount;
  if (typeof follow.isPremium === 'boolean') user.isPremium = follow.isPremium;
  const lv = /** @type {{ level?: number, userLevel?: number }} */ (follow).level
    ?? /** @type {{ userLevel?: number }} */ (follow).userLevel;
  if (typeof lv === 'number' && lv > 0) user.userLevel = lv;
}
