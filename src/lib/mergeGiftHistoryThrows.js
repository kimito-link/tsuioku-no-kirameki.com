/**
 * v0.1.216: 公式ギフト sub-app DOM (`ul.gift-history-list`) から scrape した
 *   個別ギフト履歴を、popup「ユーザー別の応援件数」帯で表示するための集約形式に変換する純関数。
 *
 * 入力: scrapeGiftHistoryList の出力（時系列の個別 throw event）
 *   `[{ senderName, points, itemName, time, thumbnailUrl }, ...]`
 * 出力: throwCount + totalPoints 付き集計済みエントリ
 *   `[{ userId: '__anon_<senderName>', nickname, throwCount, totalPoints, capturedAt }, ...]`
 *
 * 設計（重要）:
 * - **冪等な「全置換」設計**。incoming 配列のみで集計し、existing は無視する。
 *   公式 DOM 履歴は時系列 event log で、iframe content script の re-mount や
 *   Chrome reload のたびに同じ全履歴が再送信される。`existing + incoming` で
 *   throwCount を加算する設計だと、reload するたびに throwCount / totalPoints
 *   が倍々になる重大バグ（v0.1.216 初版で発見、即修正）。
 * - 同名 senderName は 1 entry に集約（throwCount + totalPoints 加算）
 * - senderName 空白のみは skip
 * - userId は `__anon_<senderName>` 固定（公式 DOM には数値 uid が出ないため）
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
 * }} AggregateGiftHistoryThrowsResult
 */

/**
 * 公式サイドバー履歴の現在状態を集計して storage 用の形式に変換する。
 * incoming のみで集計（existing は無視 → 冪等）。
 *
 * @param {GiftHistoryItemInput[]|null|undefined} incoming
 * @param {number} now
 * @returns {AggregateGiftHistoryThrowsResult}
 */
export function aggregateGiftHistoryThrows(incoming, now) {
  const inc = Array.isArray(incoming) ? incoming : [];
  if (inc.length === 0) {
    return { next: [], storageTouched: false };
  }
  /** @type {Map<string, StoredGiftUserWithThrows>} */
  const byKey = new Map();
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
    } else {
      byKey.set(key, {
        userId: key,
        nickname: senderName,
        throwCount: 1,
        totalPoints: points,
        capturedAt: now
      });
    }
  }
  if (byKey.size === 0) {
    return { next: [], storageTouched: false };
  }
  return { next: [...byKey.values()], storageTouched: true };
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
