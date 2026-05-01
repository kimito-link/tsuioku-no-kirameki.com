/**
 * 0.1.69 (AY): empty state（配信なし）popup で「前回の配信」cards を復元するために、
 * `nls_broadcast_summary_v1` IDB から最新（capturedAt 最大）の 1 行を読み出し、
 * 同じ liveId の中での **最新行**を返す純粋関数群。
 *
 * 設計:
 * - `byCapturedAt` index を `prev` 方向に走査し最初の行を採用する
 *   （`listRecentUniqueBroadcastLiveIds` と同じ index で軽量）
 * - 古すぎる行（しきい値超過）は null を返す。デフォルトしきい値は 30 日。
 *   これより古い場合は empty state で「前回の配信」を出すと体感が悪い
 *   （「最近見た放送」じゃない）ので、case A（hide）に倒す。
 * - undefined 許容のフィールドは undefined のまま返す。呼出元 popup-entry が
 *   描画時にフォールバック表記を選ぶ。
 *
 * 注意:
 * - row の中で `viewerCountFromDom` は **その時点での値** であり、放送が伸びた
 *   後の数字ではない（broadcastSessionSummary は 60 秒間欠 sample）。
 *   empty state は最新 sample をそのまま「前回の配信の様子」として表示する。
 */

import { BROADCAST_SUMMARY_STORE } from './broadcastSessionSummaryDb.js';

/** デフォルトの「前回の配信」許容鮮度（30 日） */
export const DEFAULT_LAST_BROADCAST_FRESHNESS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * @typedef {import('./broadcastSessionSummaryDb.js').BroadcastSessionSummaryRow} Row
 */

/**
 * @param {IDBDatabase|null|undefined} db
 * @param {{ nowMs?: number, freshnessMs?: number }} [opts]
 * @returns {Promise<Row|null>}
 */
export async function loadLastBroadcastSummary(db, opts = {}) {
  if (!db) return null;
  const nowMs =
    typeof opts.nowMs === 'number' && Number.isFinite(opts.nowMs)
      ? opts.nowMs
      : Date.now();
  const freshnessMs =
    typeof opts.freshnessMs === 'number' &&
    Number.isFinite(opts.freshnessMs) &&
    opts.freshnessMs > 0
      ? opts.freshnessMs
      : DEFAULT_LAST_BROADCAST_FRESHNESS_MS;

  return new Promise((resolve, reject) => {
    /** @type {IDBTransaction|undefined} */
    let tx;
    try {
      tx = db.transaction(BROADCAST_SUMMARY_STORE, 'readonly');
    } catch (e) {
      reject(e);
      return;
    }
    const store = tx.objectStore(BROADCAST_SUMMARY_STORE);
    const idx = store.index('byCapturedAt');
    const req = idx.openCursor(null, 'prev');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) {
        resolve(null);
        return;
      }
      const row = /** @type {Row} */ (cur.value);
      const capturedAt =
        typeof row?.capturedAt === 'number' && Number.isFinite(row.capturedAt)
          ? row.capturedAt
          : 0;
      if (capturedAt <= 0 || nowMs - capturedAt > freshnessMs) {
        resolve(null);
        return;
      }
      const lid = String(row?.liveId || '').trim();
      if (!lid) {
        resolve(null);
        return;
      }
      resolve(row);
    };
  });
}

/**
 * 「前回の配信」表示用のビュー型（純粋）。
 * `loadLastBroadcastSummary` で取った row を、popup の cards / banner /
 * action button が必要な形にフラットに整形する。
 *
 * 文字列が空 / 数値が finite でないフィールドは undefined のまま残す
 * （呼出元 popup-entry がフォールバック文言を選ぶ）。
 *
 * @param {Row|null|undefined} row
 * @returns {{
 *   liveId: string,
 *   capturedAt: number,
 *   watchUrl: string,
 *   commentStorageCount: number,
 *   peakConcurrentEstimate: number|null,
 *   officialCommentCount: number|null,
 *   officialViewerCount: number|null,
 *   viewerCount: number|null,
 *   broadcastTitle?: string,
 *   broadcasterName?: string,
 *   broadcasterUserId?: string,
 *   broadcasterIconUrl?: string,
 *   broadcasterPageUrl?: string,
 *   thumbnailUrl?: string
 * } | null}
 */
export function buildLastBroadcastReviewView(row) {
  if (!row || typeof row !== 'object') return null;
  const liveId = String(row.liveId || '').trim();
  if (!liveId) return null;

  const capturedAt =
    typeof row.capturedAt === 'number' && Number.isFinite(row.capturedAt)
      ? row.capturedAt
      : 0;
  if (capturedAt <= 0) return null;

  /**
   * @param {unknown} v
   * @returns {number|null}
   */
  const finiteOrNull = (v) =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;

  /**
   * @param {unknown} v
   * @returns {string|undefined}
   */
  const trimOrUndef = (v) => {
    if (typeof v !== 'string') return undefined;
    const t = v.trim();
    return t || undefined;
  };

  const vc =
    typeof row.viewerCountFromDom === 'number' &&
    Number.isFinite(row.viewerCountFromDom) &&
    row.viewerCountFromDom >= 0
      ? row.viewerCountFromDom
      : null;

  return {
    liveId,
    capturedAt,
    watchUrl: String(row.watchUrl || '').trim(),
    commentStorageCount:
      typeof row.commentStorageCount === 'number' &&
      Number.isFinite(row.commentStorageCount)
        ? row.commentStorageCount
        : 0,
    peakConcurrentEstimate: finiteOrNull(row.peakConcurrentEstimate),
    officialCommentCount: finiteOrNull(row.officialCommentCount),
    officialViewerCount: finiteOrNull(row.officialViewerCount),
    viewerCount: vc,
    broadcastTitle: trimOrUndef(row.broadcastTitle),
    broadcasterName: trimOrUndef(row.broadcasterName),
    broadcasterUserId: trimOrUndef(row.broadcasterUserId),
    broadcasterIconUrl: trimOrUndef(row.broadcasterIconUrl),
    broadcasterPageUrl: trimOrUndef(row.broadcasterPageUrl),
    thumbnailUrl: trimOrUndef(row.thumbnailUrl)
  };
}

/**
 * 「前回の配信（4/30 8:37〜）」のような indicator 文字列を作る純粋関数。
 *
 * 当日なら「前回（HH:mm 〜）」、別日なら「前回（M/D HH:mm 〜）」、
 * 7 日以上前なら「前回（YYYY/M/D 〜）」。
 *
 * @param {number} capturedAt epoch ms
 * @param {number} [nowMs] テスト用に時刻を注入できる
 * @returns {string}
 */
export function formatLastBroadcastIndicator(capturedAt, nowMs) {
  if (typeof capturedAt !== 'number' || !Number.isFinite(capturedAt) || capturedAt <= 0) {
    return '前回の配信';
  }
  const now =
    typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : Date.now();
  const d = new Date(capturedAt);
  const nd = new Date(now);
  const sameDay =
    d.getFullYear() === nd.getFullYear() &&
    d.getMonth() === nd.getMonth() &&
    d.getDate() === nd.getDate();
  const ageMs = Math.max(0, now - capturedAt);
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (sameDay) {
    return `前回（${hh}:${mm} 〜）`;
  }
  if (ageMs < sevenDays) {
    return `前回（${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm} 〜）`;
  }
  return `前回（${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} 〜）`;
}
