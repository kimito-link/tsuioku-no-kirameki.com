/**
 * 保存済みコメントを「ユーザー＝ルーム」に集計（純関数）
 */

import { isHttpOrHttpsUrl } from './supportGrowthTileSrc.js';
import { anonymousNicknameFallback } from './nicoAnonymousDisplay.js';
import { isRecommendedUserChipPollutionRow } from './backfillRemoveRecommendedLivePollution.js';

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
 * @param {{ requireText?: boolean, sampleMaxEntries?: number }} [options]
 *   - `requireText: true` のとき、`text` が空の entry は集計から除外する。
 *   - `sampleMaxEntries`: 件数超過時に均等サンプルしてから集計（heavy HTML 用）。
 *     ギフト送信のみ（コメント無し）のユーザーが「ユーザー別の応援件数」に
 *     混入する事象（ポンコツびぃちゃん lv350459157 で確認）を防ぐための filter。
 * @returns {{ userKey: string, nickname: string, count: number, lastAt: number, lastText: string, avatarUrl: string, totalChars?: number }[]}
 */
/**
 * @param {readonly { capturedAt?: number }[]} list
 * @param {number} sampleMax
 */
function sampleEntriesEvenly(list, sampleMax) {
  if (list.length <= sampleMax) return [...list];
  const out = [];
  const step = list.length / sampleMax;
  for (let i = 0; i < sampleMax; i++) {
    out.push(list[Math.floor(i * step)]);
  }
  return out;
}

/**
 * @param {{ userId?: string|null, nickname?: string, text?: string, capturedAt?: number, avatarUrl?: string|null }[]} entries
 * @param {{ requireText?: boolean, sampleMaxEntries?: number, trackCharTotals?: boolean, maxRooms?: number, sortByCount?: boolean }} [options]
 * @returns {{ userKey: string, nickname: string, count: number, lastAt: number, lastText: string, avatarUrl: string, totalChars?: number }[]}
 */
export function aggregateCommentsByUser(entries, options) {
  let list = Array.isArray(entries) ? entries : [];
  const sampleMax =
    typeof options?.sampleMaxEntries === 'number' && options.sampleMaxEntries > 0
      ? Math.floor(options.sampleMaxEntries)
      : 0;
  if (sampleMax > 0 && list.length > sampleMax) {
    list = sampleEntriesEvenly(list, sampleMax);
  }
  const requireText = !!options?.requireText;
  const trackCharTotals = options?.trackCharTotals === true;
  const maxRooms =
    typeof options?.maxRooms === 'number' && options.maxRooms > 0
      ? Math.floor(options.maxRooms)
      : 0;
  const sortByCount = options?.sortByCount === true;
  /** @type {Map<string, { userKey: string, nickname: string, count: number, lastAt: number, lastText: string, avatarUrl: string, totalChars: number }>} */
  const map = new Map();

  for (const e of list) {
    const uid = e?.userId ? String(e.userId).trim() : '';
    const userKey = uid || UNKNOWN_USER_KEY;
    const capturedAt = Number(e?.capturedAt || 0);
    const text = String(e?.text || '').trim();
    if (requireText && !text) continue;
    if (requireText && isRecommendedUserChipPollutionRow(e)) continue;
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
        avatarUrl: '',
        totalChars: 0
      });
    }
    const row = map.get(userKey);
    row.count += 1;
    if (trackCharTotals) row.totalChars += text.length;
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

  let rows = [...map.values()];
  if (sortByCount) {
    rows.sort((a, b) => b.count - a.count || b.lastAt - a.lastAt);
  } else {
    rows.sort((a, b) => b.lastAt - a.lastAt);
  }
  if (maxRooms > 0 && rows.length > maxRooms) {
    rows = rows.slice(0, maxRooms);
  }
  if (!trackCharTotals) {
    return rows.map(({ totalChars: _tc, ...rest }) => rest);
  }
  return rows;
}
