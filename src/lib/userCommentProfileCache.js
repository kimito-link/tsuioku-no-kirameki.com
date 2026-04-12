/**
 * userId 単位で表示名・個人サムネ（弱い CDN 既定アイコン以外の http URL）を蓄積し、
 * ストレージ上のコメント行へ後追いで適用する。
 */

import {
  isHttpOrHttpsUrl,
  isWeakNiconicoUserIconHttpUrl
} from './supportGrowthTileSrc.js';
import { isNiconicoAutoUserPlaceholderNickname } from './nicoAnonymousDisplay.js';
import { supportGridStrongNickname } from './supportGridDisplayTier.js';

/** 保持するエントリ数の上限（chrome.storage.local 容量対策） */
export const USER_COMMENT_PROFILE_CACHE_MAX = 5000;

/**
 * @typedef {{
 *   nickname?: string,
 *   avatarUrl?: string,
 *   updatedAt: number
 * }} UserCommentProfileCacheEntry
 */

/**
 * @param {unknown} raw
 * @returns {Record<string, UserCommentProfileCacheEntry>}
 */
export function normalizeUserCommentProfileMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const src = /** @type {Record<string, unknown>} */ (raw);
  /** @type {Record<string, UserCommentProfileCacheEntry>} */
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    const uid = String(k || '').trim();
    if (!uid || uid.length > 128) continue;
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const o = /** @type {Record<string, unknown>} */ (v);
    const updatedAt = Number(o.updatedAt);
    if (!Number.isFinite(updatedAt) || updatedAt <= 0) continue;
    const nick = String(o.nickname || '').trim().slice(0, 200);
    const av = String(o.avatarUrl || '').trim();
    const avatarUrl =
      av && isHttpOrHttpsUrl(av) && !isWeakNiconicoUserIconHttpUrl(av)
        ? av.slice(0, 2000)
        : '';
    if (!nick && !avatarUrl) continue;
    out[uid] = {
      updatedAt,
      ...(nick ? { nickname: nick } : {}),
      ...(avatarUrl ? { avatarUrl } : {})
    };
  }
  return out;
}

/**
 * @param {Record<string, UserCommentProfileCacheEntry>} map
 * @param {string} uid
 * @param {{ nickname?: string, avatarUrl?: string }} p
 * @returns {boolean} map を更新したか
 */
function mergeIntoMap(map, uid, p) {
  const nickIn = String(p.nickname || '').trim();
  const avIn = String(p.avatarUrl || '').trim();
  const strongAv =
    avIn && isHttpOrHttpsUrl(avIn) && !isWeakNiconicoUserIconHttpUrl(avIn)
      ? avIn
      : '';
  if (!nickIn && !strongAv) return false;

  const now = Date.now();
  const prev = map[uid] || { updatedAt: 0 };
  let nextNick = String(prev.nickname || '').trim();
  let nextAv = String(prev.avatarUrl || '').trim();
  let changed = false;

  if (nickIn) {
    if (!nextNick || nickIn.length > nextNick.length) {
      nextNick = nickIn;
      changed = true;
    }
  }
  if (strongAv) {
    const prevStrong =
      nextAv && isHttpOrHttpsUrl(nextAv) && !isWeakNiconicoUserIconHttpUrl(nextAv);
    if (!prevStrong) {
      nextAv = strongAv;
      changed = true;
    }
  }

  if (!changed) return false;

  /** @type {UserCommentProfileCacheEntry} */
  const entry = { updatedAt: now };
  if (nextNick) entry.nickname = nextNick;
  if (nextAv && isHttpOrHttpsUrl(nextAv)) entry.avatarUrl = nextAv;
  map[uid] = entry;
  return true;
}

/**
 * @param {Record<string, UserCommentProfileCacheEntry>} map
 * @param {{ userId?: string|null, nickname?: string, avatarUrl?: string|null }} entry
 * @returns {boolean}
 */
export function upsertUserCommentProfileFromEntry(map, entry) {
  const uid = String(entry?.userId || '').trim();
  if (!uid) return false;
  return mergeIntoMap(map, uid, {
    nickname: String(entry?.nickname || '').trim(),
    avatarUrl: String(entry?.avatarUrl || '').trim()
  });
}

/**
 * @param {Record<string, UserCommentProfileCacheEntry>} map
 * @param {{ uid?: string, name?: string, av?: string }} it intercept 行
 * @returns {boolean}
 */
export function upsertUserCommentProfileFromIntercept(map, it) {
  const uid = String(it?.uid || '').trim();
  if (!uid) return false;
  const av = String(it?.av || '').trim();
  return mergeIntoMap(map, uid, {
    nickname: String(it?.name || '').trim(),
    avatarUrl: av
  });
}

/**
 * 記録行の表示名が「匿名」等のプレースホルダだけのとき true（キャッシュの本物で置き換えてよい）。
 * @param {string} nick
 */
function isWeakMergedDisplayNickname(nick) {
  const n = String(nick || '').trim();
  if (!n) return true;
  if (n === '（未取得）' || n === '(未取得)' || n === '匿名') return true;
  if (isNiconicoAutoUserPlaceholderNickname(n)) return true;
  return false;
}

/**
 * @template T
 * @param {T[]} entries
 * @param {Record<string, UserCommentProfileCacheEntry>} map
 * @returns {{ next: T[], patched: number }}
 */
export function applyUserCommentProfileMapToEntries(entries, map) {
  if (!Array.isArray(entries) || !entries.length || !Object.keys(map).length) {
    return { next: entries, patched: 0 };
  }
  let patched = 0;
  const next = entries.map((e) => {
    const uid = String(
      /** @type {{ userId?: string|null }} */ (e)?.userId || ''
    ).trim();
    if (!uid) return e;
    const hit = map[uid];
    if (!hit) return e;

    const curNick = String(
      /** @type {{ nickname?: string }} */ (e)?.nickname || ''
    ).trim();
    const candNick = String(hit.nickname || '').trim();
    const curAv = String(
      /** @type {{ avatarUrl?: string }} */ (e)?.avatarUrl || ''
    ).trim();
    const candAv = String(hit.avatarUrl || '').trim();

    let out = /** @type {T} */ (e);
    let changed = false;

    if (candNick) {
      const preferNick =
        !curNick ||
        candNick.length > curNick.length ||
        (isWeakMergedDisplayNickname(curNick) &&
          supportGridStrongNickname(candNick, uid));
      if (preferNick && candNick !== curNick) {
        out = { ...out, nickname: candNick };
        changed = true;
      }
    }
    if (
      candAv &&
      isHttpOrHttpsUrl(candAv) &&
      !isWeakNiconicoUserIconHttpUrl(candAv)
    ) {
      const curStrong =
        curAv &&
        isHttpOrHttpsUrl(curAv) &&
        !isWeakNiconicoUserIconHttpUrl(curAv);
      if (!curStrong) {
        out = { ...out, avatarUrl: candAv };
        changed = true;
      }
    }
    if (changed) patched += 1;
    return out;
  });
  return { next, patched };
}

/**
 * @param {Record<string, UserCommentProfileCacheEntry>} map
 * @param {number} [max]
 * @returns {Record<string, UserCommentProfileCacheEntry>}
 */
export function pruneUserCommentProfileMap(
  map,
  max = USER_COMMENT_PROFILE_CACHE_MAX
) {
  const raw = Number(max);
  const lim = Math.max(
    1,
    Math.min(
      Number.isFinite(raw) && raw > 0 ? raw : USER_COMMENT_PROFILE_CACHE_MAX,
      20_000
    )
  );
  const ids = Object.keys(map);
  if (ids.length <= lim) return map;
  ids.sort((a, b) => (map[b].updatedAt || 0) - (map[a].updatedAt || 0));
  const keep = new Set(ids.slice(0, lim));
  /** @type {Record<string, UserCommentProfileCacheEntry>} */
  const out = {};
  for (const id of keep) {
    out[id] = map[id];
  }
  return out;
}

/**
 * chrome.storage.local.get が起動直後などで失敗することがあるため再試行する。
 * @param {() => Promise<Record<string, unknown>>} readFn
 * @param {{ attempts?: number, delaysMs?: number[] }} [opts]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function readStorageBagWithRetry(readFn, opts = {}) {
  const attempts = Math.max(1, Math.min(Number(opts.attempts) || 4, 8));
  const delays =
    Array.isArray(opts.delaysMs) && opts.delaysMs.length
      ? opts.delaysMs
      : [0, 50, 120, 280];
  for (let i = 0; i < attempts; i += 1) {
    if (i > 0) {
      const ms = Math.max(
        0,
        Number(delays[Math.min(i - 1, delays.length - 1)]) || 0
      );
      if (ms > 0) {
        await new Promise((r) => setTimeout(r, ms));
      }
    }
    try {
      const bag = await readFn();
      if (bag && typeof bag === 'object' && !Array.isArray(bag)) {
        return /** @type {Record<string, unknown>} */ (bag);
      }
    } catch {
      // 次の試行へ
    }
  }
  return {};
}

/**
 * 遅延で読み直したストレージのスナップショットを in-memory マップへ取り込む。
 * 新規キー・より新しい updatedAt・欠損フィールドの補完のみ行う。
 *
 * @param {Record<string, UserCommentProfileCacheEntry>} into
 * @param {Record<string, UserCommentProfileCacheEntry>} fromDisk
 * @returns {boolean} into を変更したか
 */
export function hydrateUserCommentProfileMapFromStorage(into, fromDisk) {
  if (!into || !fromDisk || typeof into !== 'object' || typeof fromDisk !== 'object') {
    return false;
  }
  let touched = false;
  for (const [uid, disk] of Object.entries(fromDisk)) {
    if (!disk || typeof disk !== 'object') continue;
    const du = Number(disk.updatedAt);
    if (!Number.isFinite(du) || du <= 0) continue;
    const cur = into[uid];
    if (!cur) {
      into[uid] = { ...disk };
      touched = true;
      continue;
    }
    const cu = Number(cur.updatedAt) || 0;
    if (du > cu) {
      into[uid] = { ...disk };
      touched = true;
      continue;
    }
    let nextNick = String(cur.nickname || '').trim();
    const dn = String(disk.nickname || '').trim();
    let gapTouched = false;
    if (dn.length > nextNick.length) {
      nextNick = dn;
      gapTouched = true;
    }
    let nextAv = String(cur.avatarUrl || '').trim();
    const da = String(disk.avatarUrl || '').trim();
    const curStrong =
      nextAv &&
      isHttpOrHttpsUrl(nextAv) &&
      !isWeakNiconicoUserIconHttpUrl(nextAv);
    const diskStrong =
      da && isHttpOrHttpsUrl(da) && !isWeakNiconicoUserIconHttpUrl(da);
    if (!curStrong && diskStrong) {
      nextAv = da;
      gapTouched = true;
    }
    if (!gapTouched) continue;
    /** @type {UserCommentProfileCacheEntry} */
    const entry = { updatedAt: Math.max(cu, du) };
    if (nextNick) entry.nickname = nextNick;
    if (nextAv && isHttpOrHttpsUrl(nextAv)) entry.avatarUrl = nextAv;
    into[uid] = entry;
    touched = true;
  }
  return touched;
}
