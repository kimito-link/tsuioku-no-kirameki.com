// @ts-nocheck — popup-entry.js から切り出し。DOM/Chrome API が広く any 相当(移設元と同方針)。
/**
 * devMonitorExport — 開発モニタの「エクスポート/ダウンロード/較正データ消去」一式。
 *
 * ★refactor Phase 4 Track B の 4-2。挙動は一切変えていない。
 *   popup-entry.js の initPopup 上限を下げるため、DL 系の I/O 関数とその listener を外へ出す。
 *
 * ★選定と境界(2026-09-18 に司令塔が実コードで再測定):
 *   - 移すのは DL 系 4 関数(downloadMcpSnapshotJson / downloadSessionSummaryJson /
 *     downloadCalibrationData / clearCalibrationData)とその listener 配線。
 *   - lib の純粋関数(較正シリアライザ・session summary DB アクセサ)は lib なので直接 import する
 *     (import は排他ではない。popup-entry 側の同名 import はそのまま=他所でも使うため)。
 *   - popup-entry 固有の共有物は ctx で注入する:
 *       objectUrlRevokeQueue(連続 DL のメモリ滞留対策・popup-entry で生成)
 *       refreshAutopatrolStatusLine(消去後の状態行更新・popup-entry 内の関数)
 *       getExportLiveId(exportBtn.dataset.liveId を読む・DOM 依存)
 *   - 純粋部分(formatAiShareDiagnosticsMarkdown / romiDebugDataChecklist)は Track A-5 で
 *     既に src/lib/aiShareDiagnosticsMarkdown.js へ移設済み。
 *
 * ★DOM/chrome/IndexedDB を触るので純関数ではない。src/extension/popup 配下。
 *
 * @module popup/init/devMonitorExport
 */

import {
  listBroadcastSessionSummaryForLive,
  openBroadcastSessionSummaryDb
} from '../../../lib/broadcastSessionSummaryDb.js';
import {
  parseCalibrationLog,
  serializeCalibrationCsv,
  serializeCalibrationJson
} from '../../../lib/concurrentCalibrationLog.js';
import { KEY_CONCURRENT_CALIBRATION_RING_V1 } from '../../../lib/storageKeys.js';

/**
 * chrome.storage.local の `nls_mcp_live_latest_v1` を JSON として
 * Downloads/nicolivelog-mcp/<liveId>.json に保存する。
 * @param {{ enqueue: (url: string) => void }} objectUrlRevokeQueue
 */
export async function downloadMcpSnapshotJson(objectUrlRevokeQueue) {
  /** @type {{ liveId?: string, snapshot?: unknown, updatedAt?: number }|null} */
  let bag = null;
  try {
    const got = await chrome.storage.local.get('nls_mcp_live_latest_v1');
    bag = /** @type {any} */ (got?.nls_mcp_live_latest_v1) || null;
  } catch {
    return;
  }
  if (!bag || !bag.snapshot) return;
  const lid = String(bag.liveId || 'unknown').toLowerCase().replace(/[^a-z0-9_-]/gi, '');
  const json = JSON.stringify(bag.snapshot, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename: `nicolivelog-mcp/${lid || 'unknown'}.json`,
      saveAs: false,
      conflictAction: 'overwrite'
    });
  } finally {
    objectUrlRevokeQueue.enqueue(url);
  }
}

/**
 * @param {string} liveId
 * @param {{ enqueue: (url: string) => void }} objectUrlRevokeQueue
 */
export async function downloadSessionSummaryJson(liveId, objectUrlRevokeQueue) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || typeof indexedDB === 'undefined') return;
  /** @type {IDBDatabase|undefined} */
  let db;
  try {
    db = await openBroadcastSessionSummaryDb();
    const rows = await listBroadcastSessionSummaryForLive(db, lid, 500);
    const json = JSON.stringify(rows, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      await chrome.downloads.download({
        url,
        filename: `nicolivelog-session-summary-${lid}-${Date.now()}.json`,
        saveAs: true,
        conflictAction: 'uniquify'
      });
    } finally {
      objectUrlRevokeQueue.enqueue(url);
    }
  } catch {
    // no-op
  } finally {
    try {
      db?.close();
    } catch {
      // no-op
    }
  }
}

/**
 * 同接推定 較正データ（KEY_CONCURRENT_CALIBRATION_RING_V1）を JSON/CSV でダウンロードする。
 * @param {'json'|'csv'} format
 * @param {{ enqueue: (url: string) => void }} objectUrlRevokeQueue
 */
export async function downloadCalibrationData(format, objectUrlRevokeQueue) {
  try {
    const bag = await chrome.storage.local.get(KEY_CONCURRENT_CALIBRATION_RING_V1);
    const parsed = parseCalibrationLog(bag[KEY_CONCURRENT_CALIBRATION_RING_V1]);
    if (!parsed.items.length) return;
    const isCsv = format === 'csv';
    const text = isCsv ? serializeCalibrationCsv(parsed) : serializeCalibrationJson(parsed);
    const blob = new Blob([text], {
      type: isCsv ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    try {
      await chrome.downloads.download({
        url,
        filename: `nicolivelog-concurrent-calibration-${Date.now()}.${isCsv ? 'csv' : 'json'}`,
        saveAs: true,
        conflictAction: 'uniquify'
      });
    } finally {
      objectUrlRevokeQueue.enqueue(url);
    }
  } catch {
    // no-op
  }
}

/** 較正データを全消去する（リングバッファを空にする）。 */
export async function clearCalibrationData() {
  try {
    await chrome.storage.local.set({
      [KEY_CONCURRENT_CALIBRATION_RING_V1]: { v: 1, items: [] }
    });
  } catch {
    // no-op
  }
}

/**
 * 開発モニタのエクスポート/DL/消去 listener 一式を張る。initPopup から 1 回呼ぶ。
 *
 * @param {{
 *   getEl: (id: string) => any,
 *   objectUrlRevokeQueue: { enqueue: (url: string) => void },
 *   refreshAutopatrolStatusLine: () => void,
 *   getExportLiveId: () => string | undefined,
 *   isExportBusy: () => boolean,
 * }} deps
 */
export function wireDevMonitorExport(deps) {
  const {
    getEl,
    objectUrlRevokeQueue,
    refreshAutopatrolStatusLine,
    getExportLiveId,
    isExportBusy
  } = deps;

  // 較正データのエクスポート/クリア。
  getEl('calibrationExportJsonBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    void downloadCalibrationData('json', objectUrlRevokeQueue);
  });
  getEl('calibrationExportCsvBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    void downloadCalibrationData('csv', objectUrlRevokeQueue);
  });
  getEl('calibrationClearBtn')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const ok =
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm('貯めた較正データ（数値のみ）を全消去します。よろしいですか？')
        : true;
    if (!ok) return;
    await clearCalibrationData();
    refreshAutopatrolStatusLine();
  });

  getEl('exportSessionSummaryJsonBtn')?.addEventListener('click', async () => {
    const lv = getExportLiveId();
    if (!lv || isExportBusy()) return;
    try {
      await downloadSessionSummaryJson(lv, objectUrlRevokeQueue);
    } catch {
      // no-op
    }
  });

  // 0.1.191: MCP Phase1a 手動 export
  getEl('exportMcpSnapshotJsonBtn')?.addEventListener('click', async () => {
    try {
      await downloadMcpSnapshotJson(objectUrlRevokeQueue);
    } catch {
      // no-op
    }
  });
}
