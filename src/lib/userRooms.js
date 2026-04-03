/**
 * 保存済みコメントを「ユーザー＝ルーム」に集計（純関数）
 */

export const UNKNOWN_USER_KEY = '__unknown__';

/**
 * @param {string} userKey
 */
export function displayUserLabel(userKey) {
  if (!userKey || userKey === UNKNOWN_USER_KEY) {
    return 'ID未取得（DOMに投稿者情報なし）';
  }
  const s = String(userKey);
  if (s.length <= 18) return s;
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

/**
 * @param {{ userId?: string|null, text?: string, capturedAt?: number }[]} entries
 * @returns {{ userKey: string, count: number, lastAt: number, lastText: string }[]}
 */
export function aggregateCommentsByUser(entries) {
  const list = Array.isArray(entries) ? entries : [];
  /** @type {Map<string, { userKey: string, count: number, lastAt: number, lastText: string }>} */
  const map = new Map();

  for (const e of list) {
    const uid = e?.userId ? String(e.userId).trim() : '';
    const userKey = uid || UNKNOWN_USER_KEY;
    const capturedAt = Number(e?.capturedAt || 0);
    const text = String(e?.text || '').trim();

    if (!map.has(userKey)) {
      map.set(userKey, {
        userKey,
        count: 0,
        lastAt: 0,
        lastText: ''
      });
    }
    const row = map.get(userKey);
    row.count += 1;
    if (capturedAt >= row.lastAt) {
      row.lastAt = capturedAt;
      row.lastText = text.length > 60 ? `${text.slice(0, 60)}…` : text;
    }
  }

  return [...map.values()].sort((a, b) => b.lastAt - a.lastAt);
}
