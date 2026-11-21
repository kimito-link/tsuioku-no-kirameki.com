/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】スナップショットの形の検証と、メモリ上の保管(テスト用)
 * 【この箱に入らないもの】fetch / Redis / DOM / chrome.*
 * 【書けるstorageキー】なし
 * 【正本宣言】保存してよいフィールド(画像URLを含まない)はこのファイルのみ
 *
 * model.js — 壊れた1件は捨て、空で既存の値を潰さない。
 */

/**
 * @typedef {'aka'|'shiro'} TeamId
 * @typedef {{
 *   team: TeamId,
 *   rank: number,
 *   userId: string,
 *   displayName: string,
 *   score: number
 * }} RankingEntry
 * @typedef {'bootstrap'|'cron'} SnapshotOrigin
 * @typedef {{
 *   schemaVersion: 1,
 *   id: string,
 *   fetchedAt: string,
 *   sourceUrl: string,
 *   officialUpdateLabel: string,
 *   officialUpdateAt: string|null,
 *   etag: string|null,
 *   previousId: string|null,
 *   origin: SnapshotOrigin,
 *   entries: RankingEntry[]
 * }} Snapshot
 * @typedef {{
 *   schemaVersion: 1,
 *   jstDate: string|null,
 *   attempts: number,
 *   lastAttemptAt: string|null,
 *   lastSuccessAt: string|null,
 *   lastError: string|null,
 *   etag: string|null,
 *   lastHttpStatus: number|null,
 *   lastSnapshotId: string|null
 * }} FetchState
 * @typedef {{
 *   kind: string,
 *   canWrite: () => boolean,
 *   getState: () => Promise<FetchState>,
 *   saveState: (next: FetchState) => Promise<void>,
 *   getLatest: () => Promise<Snapshot|null>,
 *   getById: (id: string) => Promise<Snapshot|null>,
 *   saveSnapshot: (snapshot: Snapshot) => Promise<void>
 * }} SnapshotStore
 */

const SNAPSHOT_ID_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * @returns {FetchState}
 */
export function emptyState() {
  return {
    schemaVersion: 1,
    jstDate: null,
    attempts: 0,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    etag: null,
    lastHttpStatus: null,
    lastSnapshotId: null
  };
}

/**
 * @param {string} id
 * @returns {boolean}
 */
export function isSnapshotId(id) {
  return SNAPSHOT_ID_RE.test(id);
}

/**
 * @param {unknown} value
 * @returns {value is RankingEntry}
 */
export function isRankingEntry(value) {
  if (!value || typeof value !== 'object') return false;
  const entry = /** @type {RankingEntry} */ (value);
  return (
    (entry.team === 'aka' || entry.team === 'shiro') &&
    Number.isInteger(entry.rank) &&
    entry.rank >= 1 &&
    typeof entry.userId === 'string' &&
    /^\d{1,16}$/.test(entry.userId) &&
    typeof entry.displayName === 'string' &&
    entry.displayName.length > 0 &&
    entry.displayName.length <= 80 &&
    Number.isInteger(entry.score) &&
    entry.score >= 0
  );
}

/**
 * @param {unknown} value
 * @returns {Snapshot|null}
 */
export function sanitizeSnapshot(value) {
  if (!value || typeof value !== 'object') return null;
  const snapshot = /** @type {Snapshot} */ (value);
  if (snapshot.schemaVersion !== 1 || !isSnapshotId(snapshot.id)) return null;
  if (typeof snapshot.fetchedAt !== 'string' || typeof snapshot.officialUpdateLabel !== 'string') return null;
  if (!Array.isArray(snapshot.entries)) return null;
  const entries = snapshot.entries.filter(isRankingEntry).map((entry) => ({
    team: entry.team,
    rank: entry.rank,
    userId: entry.userId,
    displayName: entry.displayName,
    score: entry.score
  }));
  return {
    schemaVersion: 1,
    id: snapshot.id,
    fetchedAt: snapshot.fetchedAt,
    sourceUrl: typeof snapshot.sourceUrl === 'string' ? snapshot.sourceUrl : '',
    officialUpdateLabel: snapshot.officialUpdateLabel,
    officialUpdateAt: typeof snapshot.officialUpdateAt === 'string' ? snapshot.officialUpdateAt : null,
    etag: typeof snapshot.etag === 'string' ? snapshot.etag : null,
    previousId: typeof snapshot.previousId === 'string' ? snapshot.previousId : null,
    origin: snapshot.origin === 'bootstrap' ? 'bootstrap' : 'cron',
    entries
  };
}

/**
 * @param {unknown} value
 * @returns {FetchState}
 */
export function sanitizeState(value) {
  const base = emptyState();
  if (!value || typeof value !== 'object') return base;
  const state = /** @type {FetchState} */ (value);
  return {
    schemaVersion: 1,
    jstDate: typeof state.jstDate === 'string' ? state.jstDate : null,
    attempts: Number.isInteger(state.attempts) && state.attempts >= 0 ? state.attempts : 0,
    lastAttemptAt: typeof state.lastAttemptAt === 'string' ? state.lastAttemptAt : null,
    lastSuccessAt: typeof state.lastSuccessAt === 'string' ? state.lastSuccessAt : null,
    lastError: typeof state.lastError === 'string' ? state.lastError : null,
    etag: typeof state.etag === 'string' ? state.etag : null,
    lastHttpStatus: Number.isInteger(state.lastHttpStatus) ? state.lastHttpStatus : null,
    lastSnapshotId: typeof state.lastSnapshotId === 'string' ? state.lastSnapshotId : null
  };
}

/**
 * @param {{ state?: FetchState, snapshots?: Snapshot[] }} [initial]
 * @returns {SnapshotStore}
 */
export function createMemoryStore(initial) {
  let state = sanitizeState(initial && initial.state ? initial.state : emptyState());
  /** @type {Map<string, Snapshot>} */
  const snapshots = new Map();
  /** @type {string|null} */
  let latestId = null;
  for (const snapshot of (initial && initial.snapshots) || []) {
    const clean = sanitizeSnapshot(snapshot);
    if (!clean) continue;
    snapshots.set(clean.id, clean);
    latestId = clean.id;
  }

  return {
    kind: 'memory',
    canWrite: () => true,
    async getState() {
      return structuredClone(state);
    },
    async saveState(next) {
      state = sanitizeState(next);
    },
    async getLatest() {
      if (!latestId) return null;
      const snapshot = snapshots.get(latestId);
      return snapshot ? structuredClone(snapshot) : null;
    },
    async getById(id) {
      const snapshot = snapshots.get(id);
      return snapshot ? structuredClone(snapshot) : null;
    },
    async saveSnapshot(snapshot) {
      const clean = sanitizeSnapshot(snapshot);
      if (!clean) throw new Error('invalid-snapshot');
      snapshots.set(clean.id, clean);
      latestId = clean.id;
    }
  };
}
