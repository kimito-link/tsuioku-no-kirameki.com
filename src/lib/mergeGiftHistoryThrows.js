/**
 * v0.1.216: 公式ギフト sub-app DOM (`ul.gift-history-list`) から scrape した
 *   個別ギフト履歴を、popup「ユーザー別の応援件数」帯で表示するための集約形式に変換する純関数。
 *
 * 入力: scrapeGiftHistoryList の出力（時系列の個別 throw event）
 *   `[{ senderName, points, itemName, time, thumbnailUrl }, ...]`
 * 出力: throwCount + totalPoints 付き StoredGiftUser（mergeGiftUsers の拡張形）
 *   `[{ userId: '__anon_<senderName>', nickname, throwCount, totalPoints, capturedAt }, ...]`
 *
 * - 同名 senderName は 1 entry に集約（throwCount + totalPoints 加算）
 * - senderName 空白のみは skip
 * - userId は `__anon_<senderName>` 固定（公式 DOM には数値 uid が出ないため）
 * - capturedAt は最新 scrape 時刻
 *
 * 注意: 公式 DOM 履歴は時系列 event log なので、同じ scrape 結果を繰り返し
 *   受け取ると throwCount が重複加算される。呼出側で diff 取るか、scrape
 *   interval を長めにして運用する前提。本関数の責務は「incoming = N event →
 *   throwCount を N 加算」。
 *
 * 副作用なし。
 */

/**
 * @typedef {{
 *   senderName: string,
 *   points: number,
 *   itemName?: string,
 *   time?: string,
 *   thumbnailUrl?: string
 * }} GiftHistoryItemInput
 *
 * @typedef {{
 *   userId: string,
 *   nickname: string,
 *   throwCount: number,
 *   totalPoints: number,
 *   capturedAt: number
 * }} StoredGiftUserWithThrows
 *
 * @typedef {{
 *   next: StoredGiftUserWithThrows[],
 *   storageTouched: boolean
 * }} MergeGiftHistoryThrowsResult
 */

/**
 * @param {StoredGiftUserWithThrows[]|null|undefined} existing
 * @param {GiftHistoryItemInput[]|null|undefined} incoming
 * @param {number} now
 * @returns {MergeGiftHistoryThrowsResult}
 */
export function mergeGiftHistoryThrows(existing, incoming, now) {
  const base = Array.isArray(existing) ? existing : [];
  const inc = Array.isArray(incoming) ? incoming : [];
  if (inc.length === 0) {
    return { next: base, storageTouched: false };
  }
  /** @type {Map<string, StoredGiftUserWithThrows>} */
  const byKey = new Map();
  for (const e of base) {
    if (!e || typeof e !== 'object') continue;
    const uid = String(e.userId || '').trim();
    if (!uid) continue;
    byKey.set(uid, {
      userId: uid,
      nickname: String(e.nickname || '').trim(),
      throwCount: positiveIntOr(e.throwCount, 0),
      totalPoints: nonNegativeIntOr(e.totalPoints, 0),
      capturedAt: positiveIntOr(e.capturedAt, 0)
    });
  }
  let touched = false;
  for (const item of inc) {
    if (!item || typeof item !== 'object') continue;
    const senderName = String(item.senderName || '').trim();
    if (!senderName) continue;
    const key = `__anon_${senderName}`;
    const points = nonNegativeIntOr(item.points, 0);
    const ex = byKey.get(key);
    if (ex) {
      ex.throwCount += 1;
      ex.totalPoints += points;
      ex.capturedAt = now;
      ex.nickname = senderName;
    } else {
      byKey.set(key, {
        userId: key,
        nickname: senderName,
        throwCount: 1,
        totalPoints: points,
        capturedAt: now
      });
    }
    touched = true;
  }
  if (!touched) {
    return { next: base, storageTouched: false };
  }
  return { next: [...byKey.values()], storageTouched: true };
}

/**
 * @param {unknown} v
 * @param {number} fallback
 * @returns {number}
 */
function positiveIntOr(v, fallback) {
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return fallback;
}

/**
 * @param {unknown} v
 * @param {number} fallback
 * @returns {number}
 */
function nonNegativeIntOr(v, fallback) {
  const n = Number(v);
  if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  return fallback;
}
