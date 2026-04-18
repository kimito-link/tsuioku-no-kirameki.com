/**
 * 応援レーン acquirer: chrome.storage.local(nls_comments) → laneStore の橋渡し。
 *
 * レイヤ: data/acquirers/ (ブラウザ API と domain の境界)
 *
 * 役割（lane-architecture-redesign.md §2.4）:
 *   ・chrome.storage.local から `nls_comments` を非同期で読み出す
 *   ・呼び出し側が liveId を指定できないとき（popup を生 URL で開いた等）は
 *     保存行の `capturedAt` 最大から「直近の放送」を推定して fallback する
 *     → 既存 popup の "no-url → lane 真っ白" 退行（E2E lane-visibility spec 失敗）
 *       を塞ぐのが目的
 *   ・data/sources/laneFromStoredComments を通して LaneCandidate[] に射影し、
 *     laneStore.setCandidates に渡す
 *
 * テスト容易性:
 *   ・chrome API は直接参照しない。`chromeStorage` を引数で注入する
 *     （本番呼び出しは popup 側が `chrome.storage.local` を渡す）
 *
 * なぜ try/catch で握り潰すか:
 *   lane の描画は診断・参考情報であり、storage が一時的に壊れてもアプリ全体を
 *   止める理由にはならない（失敗時は空 lane にフェイル閉する）。
 *   console.warn は AI汎用ルール/NO_SILENT_FAILURE に従い必ず出す。
 */

import { laneCandidatesFromStoredComments } from '../sources/laneFromStoredComments.js';
import { normalizeLv } from '../../shared/niconico/liveId.js';

/**
 * @typedef {import('../store/laneStore.js').createLaneStore} CreateLaneStore
 */

/**
 * @typedef {Object} ChromeStorageLike
 * @property {(keys: string|string[]|Record<string, unknown>) => Promise<Record<string, unknown>>} get
 */

/**
 * @typedef {Object} LoadLaneOptions
 * @property {string} liveId 空文字 or 未指定なら最新 liveId にフォールバック
 * @property {{
 *   setCandidates: (liveId: string, candidates: readonly unknown[]) => void,
 *   getState: () => { liveId: string, candidates: readonly unknown[] }
 * }} store laneStoreInstance もしくは同等 API
 * @property {ChromeStorageLike} chromeStorage chrome.storage.local 相当
 */

/**
 * 行オブジェクトから capturedAt を取り出す。
 * @param {unknown} row
 * @returns {number}
 */
function rowCapturedAt(row) {
  const n = Number(/** @type {{ capturedAt?: unknown }} */ (row)?.capturedAt);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 行の liveId を lv 接頭辞付きの正規形で返す（lvId フォールバックあり）。
 * @param {unknown} row
 * @returns {string}
 */
function rowLiveIdNorm(row) {
  const o = /** @type {{ liveId?: unknown, lvId?: unknown }} */ (row);
  return normalizeLv(o?.liveId) || normalizeLv(o?.lvId);
}

/**
 * 保存行配列から「最新の放送 ID」を推定する。
 *
 * 定義: capturedAt が最大の行の liveId。空 / 壊れ入力は空文字。
 * popup が生 URL で開かれたとき、最終観測のライブに暫定的にロックするために使う。
 *
 * @param {readonly unknown[]|null|undefined} storedComments
 * @returns {string}
 */
export function findLatestLiveIdFromStoredComments(storedComments) {
  if (!Array.isArray(storedComments) || storedComments.length === 0) return '';
  let bestAt = -1;
  let bestLive = '';
  for (const row of storedComments) {
    const at = rowCapturedAt(row);
    if (at <= 0) continue;
    if (at <= bestAt) continue;
    const lv = rowLiveIdNorm(row);
    if (!lv) continue;
    bestAt = at;
    bestLive = lv;
  }
  return bestLive;
}

/**
 * nls_comments を chrome.storage.local から読み出し、laneStore に流し込む。
 *
 * 失敗時はフェイル閉（store 無変更 + console.warn）。成功時は liveId と
 * candidates を一度に setCandidates に渡すので、subscriber の発火は 1 回。
 *
 * @param {LoadLaneOptions} options
 * @returns {Promise<void>}
 */
export async function loadLaneIntoStore(options) {
  const { liveId, store, chromeStorage } = options || {};
  if (!store || !chromeStorage?.get) {
    if (typeof console !== 'undefined' && console?.warn) {
      console.warn('[laneFromStorage] missing store or chromeStorage');
    }
    return;
  }
  /** @type {Record<string, unknown>} */
  let bag;
  try {
    bag = await chromeStorage.get({ nls_comments: [] });
  } catch (err) {
    if (typeof console !== 'undefined' && console?.warn) {
      console.warn('[laneFromStorage] storage.get failed:', err);
    }
    return;
  }
  const rawRows = bag?.nls_comments;
  const rows = Array.isArray(rawRows) ? rawRows : [];

  const explicitLv = normalizeLv(liveId);
  const effectiveLv = explicitLv || findLatestLiveIdFromStoredComments(rows);

  const candidates = effectiveLv
    ? laneCandidatesFromStoredComments(rows, effectiveLv)
    : [];
  store.setCandidates(effectiveLv, candidates);
}
