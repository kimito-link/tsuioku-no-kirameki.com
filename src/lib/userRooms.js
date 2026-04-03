/**
 * 保存済みコメントを「ユーザー＝ルーム」に集計（純関数）
 */

export const UNKNOWN_USER_KEY = '__unknown__';

/**
 * @param {string} userKey
 * @param {string} [nickname]
 */
export function displayUserLabel(userKey, nickname) {
  if (!userKey || userKey === UNKNOWN_USER_KEY) {
    return 'ID未取得（DOMに投稿者情報なし）';
  }
  const name = String(nickname || '').trim();
  const s = String(userKey);
  const shortId = s.length <= 18 ? s : `${s.slice(0, 8)}…${s.slice(-6)}`;
  if (name) return `${name}（${shortId}）`;
  return shortId;
}

/**
 * @param {{ userId?: string|null, nickname?: string, text?: string, capturedAt?: number }[]} entries
 * @returns {{ userKey: string, nickname: string, count: number, lastAt: number, lastText: string }[]}
 */
export function aggregateCommentsByUser(entries) {
  const list = Array.isArray(entries) ? entries : [];
  /** @type {Map<string, { userKey: string, nickname: string, count: number, lastAt: number, lastText: string }>} */
  const map = new Map();

  for (const e of list) {
    const uid = e?.userId ? String(e.userId).trim() : '';
    const userKey = uid || UNKNOWN_USER_KEY;
    const capturedAt = Number(e?.capturedAt || 0);
    const text = String(e?.text || '').trim();
    const nickname = String(e?.nickname || '').trim();

    if (!map.has(userKey)) {
      map.set(userKey, {
        userKey,
        nickname: '',
        count: 0,
        lastAt: 0,
        lastText: ''
      });
    }
    const row = map.get(userKey);
    row.count += 1;
    if (nickname && !row.nickname) row.nickname = nickname;
    if (capturedAt >= row.lastAt) {
      row.lastAt = capturedAt;
      row.lastText = text.length > 60 ? `${text.slice(0, 60)}…` : text;
    }
  }

  return [...map.values()].sort((a, b) => b.lastAt - a.lastAt);
}
