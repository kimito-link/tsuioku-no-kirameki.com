/**
 * v0.1.203 Patch 4: 古い event-dom snapshot 残骸を cleanup 対象として識別する純関数。
 *
 * Agent B の調査で判明：`__nls_multitab_snapshot__.eventDomLvs` は storage の
 * `nls_event_dom_<lv>` キー一覧を蓄積するだけで削除ロジックがない。実機で
 * `eventDomLvCount: 49` まで膨れ上がり、multi-tab race 警告が常時出ていた。
 *
 * 本関数で「現在 watch 中の lv は保護、TTL 超過した過去の lv は prune」と判定し、
 * content-entry.js から storage cleanup に使う。
 *
 * 副作用なし。
 */

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * @typedef {{ lv: string, capturedAt?: number }} EventDomEntry
 *
 * @typedef {{ keep: string[], prune: string[] }} PruneResult
 */

/**
 * @param {EventDomEntry[]|null|undefined} entries  storage の nls_event_dom_* 一覧
 * @param {string|null|undefined} currentLiveId  現在 watch 中の lv（保護）
 * @param {number} nowMs  現在時刻 Date.now()
 * @param {number} [ttlMs=86400000]  残骸 TTL（ms）デフォルト 24h
 * @returns {PruneResult}
 */
export function pruneStaleEventDomLvs(
  entries,
  currentLiveId,
  nowMs,
  ttlMs = DEFAULT_TTL_MS
) {
  /** @type {string[]} */
  const keep = [];
  /** @type {string[]} */
  const prune = [];

  if (!Array.isArray(entries)) return { keep, prune };
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) {
    return { keep, prune };
  }
  const cur = typeof currentLiveId === 'string' ? currentLiveId.trim() : '';
  const ttl =
    typeof ttlMs === 'number' && Number.isFinite(ttlMs) && ttlMs > 0
      ? ttlMs
      : DEFAULT_TTL_MS;

  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    const lv = typeof e.lv === 'string' ? e.lv.trim() : '';
    if (!lv) continue;

    // 現在 watch 中の lv は無条件で保護
    if (cur && lv === cur) {
      keep.push(lv);
      continue;
    }

    const captured =
      typeof e.capturedAt === 'number' && Number.isFinite(e.capturedAt) && e.capturedAt > 0
        ? e.capturedAt
        : 0;

    // capturedAt 不明 → 古い扱いで prune（守るべきは現在 lv のみ）
    if (captured === 0) {
      prune.push(lv);
      continue;
    }

    const age = nowMs - captured;
    if (age < ttl) {
      keep.push(lv);
    } else {
      prune.push(lv);
    }
  }

  return { keep, prune };
}

/**
 * storage の nls_event_dom_* バッグ（chrome.storage.local.get の結果）から
 * EventDomEntry[] 形式に正規化する補助。
 *
 * @param {Record<string, any>|null|undefined} bag  chrome.storage.local.get の結果
 * @returns {EventDomEntry[]}
 */
export function buildEventDomEntriesFromStorageBag(bag) {
  if (!bag || typeof bag !== 'object') return [];
  /** @type {EventDomEntry[]} */
  const out = [];
  for (const key of Object.keys(bag)) {
    if (!key.startsWith('nls_event_dom_')) continue;
    const lv = key.slice('nls_event_dom_'.length);
    if (!lv) continue;
    const v = /** @type {any} */ (bag[key]);
    let capturedAt = 0;
    if (v && typeof v === 'object') {
      if (typeof v.capturedAt === 'number') capturedAt = v.capturedAt;
      else if (typeof v.lastUpdatedAt === 'number') capturedAt = v.lastUpdatedAt;
      else if (typeof v.updatedAt === 'number') capturedAt = v.updatedAt;
    }
    out.push({ lv, capturedAt });
  }
  return out;
}
