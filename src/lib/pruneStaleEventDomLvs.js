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

// v0.1.801: TTL を 24h→6h へ短縮。発生源(autopatrol の per-live キャッシュ書き込み)を断った上で、
//   人間の再訪は数時間内に収まるため 6h で十分。TTL だけでは「短時間に大量アクセス」で爆発するので
//   件数上限(LRU)を併用する(下記 DEFAULT_MAX_KEEP)。
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000; // 6h
/**
 * v0.1.801: per-live event-dom キャッシュの件数上限(LRU)。TTL 内でも、capturedAt 新しい順に
 *   この件数だけ残し超過分は prune する=無界蓄積(実機 513件)の根を断つ予備防衛線。現 lv は別枠で必ず保護。
 *   30 = 人間が数時間で再訪する配信数として十分・autopatrol を止めればまず到達しない頭打ち。
 */
const DEFAULT_MAX_KEEP = 30;

/**
 * @typedef {{ lv: string, capturedAt?: number }} EventDomEntry
 *
 * @typedef {{ keep: string[], prune: string[] }} PruneResult
 */

/**
 * @param {EventDomEntry[]|null|undefined} entries  storage の nls_event_dom_* 一覧
 * @param {string|null|undefined} currentLiveId  現在 watch 中の lv（保護）
 * @param {number} nowMs  現在時刻 Date.now()
 * @param {number} [ttlMs=21600000]  残骸 TTL（ms）デフォルト 6h
 * @param {number} [maxKeep=30]  TTL 内でも残す件数上限(LRU・capturedAt 新しい順)。現 lv は別枠保護。
 * @returns {PruneResult}
 */
export function pruneStaleEventDomLvs(
  entries,
  currentLiveId,
  nowMs,
  ttlMs = DEFAULT_TTL_MS,
  maxKeep = DEFAULT_MAX_KEEP
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
  const cap =
    typeof maxKeep === 'number' && Number.isFinite(maxKeep) && maxKeep > 0
      ? Math.floor(maxKeep)
      : DEFAULT_MAX_KEEP;

  // v0.1.801: TTL 通過した非現 lv を capturedAt 新しい順に並べ、上限超過分を prune に回す。
  //   現 lv は無条件 keep(上限の枠外)。capturedAt 不明は即 prune(従来どおり)。
  /** @type {{ lv: string, captured: number }[]} */
  const ttlSurvivors = [];

  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    const lv = typeof e.lv === 'string' ? e.lv.trim() : '';
    if (!lv) continue;

    // 現在 watch 中の lv は無条件で保護(件数上限の枠外)
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
      ttlSurvivors.push({ lv, captured });
    } else {
      prune.push(lv);
    }
  }

  // 件数上限(LRU): 新しい順に cap 件だけ keep、超過分(古い側)は prune。
  ttlSurvivors.sort((a, b) => b.captured - a.captured); // 新しい順
  for (let i = 0; i < ttlSurvivors.length; i += 1) {
    if (i < cap) keep.push(ttlSurvivors[i].lv);
    else prune.push(ttlSurvivors[i].lv);
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
