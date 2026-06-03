/**
 * 多タブ時の NDGR バックフィル待ち行列・前面タブ優先（session 共有）。
 *
 * @module globalBackfillQueue
 */

export const KEY_BACKFILL_PRIORITY_LV = 'nls_backfill_priority_lv_v1';
export const KEY_BACKFILL_PRIORITY_AT = 'nls_backfill_priority_at_v1';
export const KEY_BACKFILL_WAITING_LVS = 'nls_backfill_waiting_lvs_v1';

/** 前面化直後の再アーム cooldown 短縮（ms） */
export const BACKFILL_PRIORITY_COOLDOWN_MS = 5_000;

/** グローバルロック 1 本あたりの最大連続実行（次の lv に譲る） */
export const GLOBAL_BACKFILL_ROTATION_MS = 90_000;

/**
 * @param {string} liveId
 * @returns {string}
 */
export function normalizeBackfillLiveId(liveId) {
  return String(liveId || '').trim().toLowerCase();
}

/**
 * @param {string} liveId
 * @returns {Promise<void>}
 */
export async function setBackfillPriorityLiveId(liveId) {
  const lid = normalizeBackfillLiveId(liveId);
  if (!/^lv\d{1,15}$/.test(lid)) return;
  try {
    await chrome.storage.session.set({
      [KEY_BACKFILL_PRIORITY_LV]: lid,
      [KEY_BACKFILL_PRIORITY_AT]: Date.now()
    });
  } catch {
    /* no-op */
  }
}

/**
 * @returns {Promise<{ liveId: string, at: number }|null>}
 */
export async function readBackfillPriorityLiveId() {
  try {
    const bag = await chrome.storage.session.get([
      KEY_BACKFILL_PRIORITY_LV,
      KEY_BACKFILL_PRIORITY_AT
    ]);
    const lid = normalizeBackfillLiveId(String(bag[KEY_BACKFILL_PRIORITY_LV] || ''));
    const at = Number(bag[KEY_BACKFILL_PRIORITY_AT]);
    if (!/^lv\d{1,15}$/.test(lid)) return null;
    return { liveId: lid, at: Number.isFinite(at) ? at : 0 };
  } catch {
    return null;
  }
}

/**
 * @param {string} liveId
 * @returns {Promise<void>}
 */
export async function registerBackfillWaiter(liveId) {
  const lid = normalizeBackfillLiveId(liveId);
  if (!/^lv\d{1,15}$/.test(lid)) return;
  try {
    const bag = await chrome.storage.session.get(KEY_BACKFILL_WAITING_LVS);
    const prev = Array.isArray(bag[KEY_BACKFILL_WAITING_LVS])
      ? /** @type {string[]} */ (bag[KEY_BACKFILL_WAITING_LVS])
      : [];
    const set = new Set(prev.map(normalizeBackfillLiveId).filter((x) => /^lv\d{1,15}$/.test(x)));
    set.add(lid);
    await chrome.storage.session.set({
      [KEY_BACKFILL_WAITING_LVS]: [...set]
    });
  } catch {
    /* no-op */
  }
}

/**
 * @param {string} liveId
 * @returns {Promise<void>}
 */
export async function clearBackfillWaiter(liveId) {
  const lid = normalizeBackfillLiveId(liveId);
  try {
    const bag = await chrome.storage.session.get(KEY_BACKFILL_WAITING_LVS);
    const prev = Array.isArray(bag[KEY_BACKFILL_WAITING_LVS])
      ? /** @type {string[]} */ (bag[KEY_BACKFILL_WAITING_LVS])
      : [];
    const next = prev
      .map(normalizeBackfillLiveId)
      .filter((x) => x !== lid && /^lv\d{1,15}$/.test(x));
    await chrome.storage.session.set({ [KEY_BACKFILL_WAITING_LVS]: next });
  } catch {
    /* no-op */
  }
}

/**
 * @returns {Promise<string[]>}
 */
export async function listBackfillWaitingLiveIds() {
  try {
    const bag = await chrome.storage.session.get(KEY_BACKFILL_WAITING_LVS);
    const prev = Array.isArray(bag[KEY_BACKFILL_WAITING_LVS])
      ? /** @type {string[]} */ (bag[KEY_BACKFILL_WAITING_LVS])
      : [];
    return prev.map(normalizeBackfillLiveId).filter((x) => /^lv\d{1,15}$/.test(x));
  } catch {
    return [];
  }
}

/**
 * @param {string} liveId
 * @param {number} [nowMs]
 * @returns {Promise<boolean>}
 */
export async function isBackfillPriorityLiveId(liveId, nowMs = Date.now()) {
  const lid = normalizeBackfillLiveId(liveId);
  const hit = await readBackfillPriorityLiveId();
  if (!hit) return false;
  if (hit.liveId !== lid) return false;
  return nowMs - hit.at < 120_000;
}
