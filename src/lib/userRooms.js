/**
 * 保存済みコメントを「ユーザー＝ルーム」に集計（純関数）
 */

import { isHttpOrHttpsUrl } from './supportGrowthTileSrc.js';
import { anonymousNicknameFallback } from './nicoAnonymousDisplay.js';

export const UNKNOWN_USER_KEY = '__unknown__';

/**
 * 一覧・ランキング用の短い userKey 表示（未取得は空）
 * @param {string} userKey
 * @returns {string}
 */
export function shortUserKeyDisplay(userKey) {
  if (!userKey || userKey === UNKNOWN_USER_KEY) return '';
  const s = String(userKey);
  return s.length <= 18 ? s : `${s.slice(0, 8)}…${s.slice(-6)}`;
}

/**
 * @param {string} userKey
 * @param {string} [nickname]
 */
export function displayUserLabel(userKey, nickname) {
  if (!userKey || userKey === UNKNOWN_USER_KEY) {
    return 'ID未取得（DOMに投稿者情報なし）';
  }
  const name = anonymousNicknameFallback(userKey, nickname);
  const shortId = shortUserKeyDisplay(userKey);
  if (name) return `${name}（${shortId}）`;
  return shortId;
}

/**
 * @param {{ userId?: string|null, nickname?: string, text?: string, capturedAt?: number, avatarUrl?: string|null }[]} entries
 * @returns {{ userKey: string, nickname: string, count: number, lastAt: number, lastText: string, avatarUrl: string }[]}
 */
export function aggregateCommentsByUser(entries) {
  const list = Array.isArray(entries) ? entries : [];
  /** @type {Map<string, { userKey: string, nickname: string, count: number, lastAt: number, lastText: string, avatarUrl: string }>} */
  const map = new Map();

  for (const e of list) {
    const uid = e?.userId ? String(e.userId).trim() : '';
    const userKey = uid || UNKNOWN_USER_KEY;
    const capturedAt = Number(e?.capturedAt || 0);
    const text = String(e?.text || '').trim();
    const nickname = String(e?.nickname || '').trim();
    const rawAv = String(e?.avatarUrl || '').trim();
    const avatarCandidate = isHttpOrHttpsUrl(rawAv) ? rawAv : '';

    if (!map.has(userKey)) {
      map.set(userKey, {
        userKey,
        nickname: '',
        count: 0,
        lastAt: 0,
        lastText: '',
        avatarUrl: ''
      });
    }
    const row = map.get(userKey);
    row.count += 1;
    if (nickname) {
      if (!row.nickname) row.nickname = nickname;
      else if (nickname.length > row.nickname.length) row.nickname = nickname;
    }
    if (capturedAt >= row.lastAt) {
      row.lastAt = capturedAt;
      row.lastText = text.length > 60 ? `${text.slice(0, 60)}…` : text;
      if (userKey !== UNKNOWN_USER_KEY && avatarCandidate) row.avatarUrl = avatarCandidate;
    }
  }

  return [...map.values()].sort((a, b) => b.lastAt - a.lastAt);
}
