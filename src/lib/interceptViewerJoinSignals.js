/**
 * page-intercept 用: JSON から「視聴者入室・オーディエンス更新」らしいユーザ配列を抽出（純関数・PII は userId/表示名/アイコン URL のみ）
 */

import { anonymousNicknameFallback } from './nicoAnonymousDisplay.js';
import {
  INTERCEPT_AVATAR_KEYS,
  INTERCEPT_NAME_KEYS,
  INTERCEPT_UID_KEYS,
  normalizeInterceptAvatarUrl
} from './niconicoInterceptLearn.js';
import { niconicoDefaultUserIconUrl } from './supportGrowthTileSrc.js';

/** 入室・オーディエンス系でよくある配列キー（statistics の viewers 数値と区別するためオブジェクト配列のみ採用） */
export const VIEWER_JOIN_ARRAY_KEYS = Object.freeze([
  'joinUsers',
  'joinedUsers',
  'newViewers',
  'audience',
  'audiences',
  'viewerList',
  'recentViewers',
  'members',
  'participants',
  'entrants',
  'watchingUsers',
  'watching_users'
]);

/** @type {RegExp} */
const JOIN_LIKE_TYPE_RE =
  /join|audience|entrant|participant|member|watching|viewerlist|newviewer/i;

/**
 * @param {unknown} v
 * @returns {string}
 */
function pickUserIdFromRecord(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return '';
  const o = /** @type {Record<string, unknown>} */ (v);
  for (const k of INTERCEPT_UID_KEYS) {
    const x = o[k];
    if (x == null || x === '') continue;
    const s = String(x).trim();
    if (s) return s;
  }
  return '';
}

/**
 * @param {unknown} v
 * @returns {string}
 */
/** 入室 JSON でだけよく出る別名（collectInterceptSignals には混ぜない） */
const VIEWER_JOIN_EXTRA_NAME_KEYS = Object.freeze([
  'screenName',
  'screen_name',
  'profileNickname',
  'profile_nickname'
]);

/**
 * @param {unknown} v
 * @returns {string}
 */
function pickNameFromRecord(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return '';
  const o = /** @type {Record<string, unknown>} */ (v);
  for (const k of INTERCEPT_NAME_KEYS) {
    const x = o[k];
    if (x != null && typeof x === 'string') {
      const s = x.trim();
      if (s) return s;
    }
  }
  for (const k of VIEWER_JOIN_EXTRA_NAME_KEYS) {
    const x = o[k];
    if (x != null && typeof x === 'string') {
      const s = x.trim();
      if (s) return s;
    }
  }
  return '';
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function pickAvatarFromRecord(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return '';
  const o = /** @type {Record<string, unknown>} */ (v);
  for (const k of INTERCEPT_AVATAR_KEYS) {
    const x = o[k];
    if (x != null && typeof x === 'string') {
      const av = normalizeInterceptAvatarUrl(x);
      if (av) return av;
    }
  }
  const avatar = o.avatar;
  if (typeof avatar === 'string') {
    const av = normalizeInterceptAvatarUrl(avatar);
    if (av) return av;
  }
  return '';
}

/**
 * 入室 API の生オブジェクトを postMessage 用に正規化（サムネは数値 userId なら CDN URL を補完）。
 * content 側はこの形だけ見ればよい。
 *
 * @param {unknown} raw
 * @param {number} [nowMs] 固定タイムスタンプ（単体テスト用。省略時は内部で Date.now()）
 * @returns {{ userId: string, nickname: string, iconUrl: string, timestamp: number, source: 'network-intercept' }}
 */
export function normalizeViewerJoin(raw, nowMs) {
  const now =
    typeof nowMs === 'number' && Number.isFinite(nowMs) && nowMs > 0
      ? nowMs
      : Date.now();
  /** @type {'network-intercept'} */
  const source = 'network-intercept';
  /** @type {{ userId: string, nickname: string, iconUrl: string, timestamp: number, source: 'network-intercept' }} */
  const empty = {
    userId: '',
    nickname: '',
    iconUrl: '',
    timestamp: now,
    source
  };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;

  const rec = /** @type {Record<string, unknown>} */ (raw);
  let userId = '';
  for (const k of ['userId', 'id', 'uid']) {
    const x = rec[k];
    if (x == null || x === '') continue;
    const s = String(x).trim();
    if (s) {
      userId = s;
      break;
    }
  }
  if (!userId) userId = pickUserIdFromRecord(raw);

  let nickname = pickNameFromRecord(raw);
  if (!nickname && typeof rec.name === 'string') nickname = rec.name.trim();

  let iconUrl = pickAvatarFromRecord(raw);

  if (!iconUrl && /^\d{5,14}$/.test(userId)) {
    iconUrl = niconicoDefaultUserIconUrl(userId) || '';
  }

  nickname = anonymousNicknameFallback(userId, nickname);

  return {
    userId,
    nickname,
    iconUrl,
    timestamp: now,
    source
  };
}

/**
 * 配列が「ユーザー行のリスト」らしいか（数値だけの配列は除外＝統計の列挙と誤認しない）
 * @param {unknown[]} arr
 * @returns {boolean}
 */
function looksLikeUserObjectArray(arr) {
  if (!Array.isArray(arr) || arr.length < 1 || arr.length > 250) return false;
  let objCount = 0;
  for (let i = 0; i < Math.min(arr.length, 8); i++) {
    const x = arr[i];
    if (x && typeof x === 'object' && !Array.isArray(x)) objCount++;
  }
  return objCount >= Math.min(2, arr.length) || (arr.length === 1 && objCount === 1);
}

/**
 * 単一オブジェクトから入室ユーザー候補を列挙（直下の配列プロパティのみ）
 *
 * @param {unknown} obj
 * @returns {{ userId: string, nickname: string, iconUrl: string }[]}
 */
export function collectViewerJoinUsersFromObject(obj) {
  /** @type {{ userId: string, nickname: string, iconUrl: string }[]} */
  const out = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;

  const o = /** @type {Record<string, unknown>} */ (obj);
  const t = o.type;
  const typeStr = typeof t === 'string' ? t : '';
  const joinTyped = typeStr && JOIN_LIKE_TYPE_RE.test(typeStr);

  for (const key of VIEWER_JOIN_ARRAY_KEYS) {
    const raw = o[key];
    if (!Array.isArray(raw) || !looksLikeUserObjectArray(raw)) continue;
    for (const item of raw) {
      const userId = pickUserIdFromRecord(item);
      if (!userId) continue;
      const nickname = pickNameFromRecord(item);
      const iconUrl = pickAvatarFromRecord(item);
      out.push({
        userId,
        nickname,
        iconUrl
      });
    }
  }

  if (joinTyped) {
    const inner = o.data ?? o.payload ?? o.body;
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      out.push(...collectViewerJoinUsersFromObject(inner));
    }
  }

  return out;
}

/**
 * 木を走査して入室ユーザー候補を集める（重複 userId は後段で畳む）
 *
 * @param {unknown} root
 * @param {{ maxDepth?: number, maxArray?: number, maxKeys?: number }} [opts]
 * @returns {{ userId: string, nickname: string, iconUrl: string }[]}
 */
export function walkJsonForViewerJoinUsers(root, opts = {}) {
  const maxDepth = opts.maxDepth ?? 6;
  const maxArray = opts.maxArray ?? 400;
  const maxKeys = opts.maxKeys ?? 36;
  /** @type {{ userId: string, nickname: string, iconUrl: string }[]} */
  const acc = [];

  /**
   * @param {unknown} obj
   * @param {number} depth
   */
  function walk(obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > maxDepth) return;
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length && i < maxArray; i++) walk(obj[i], depth + 1);
      return;
    }
    acc.push(...collectViewerJoinUsersFromObject(obj));
    const keys = Object.keys(/** @type {Record<string, unknown>} */ (obj));
    for (let i = 0; i < keys.length && i < maxKeys; i++) {
      const v = /** @type {Record<string, unknown>} */ (obj)[keys[i]];
      if (v && typeof v === 'object') walk(v, depth + 1);
    }
  }

  walk(root, 0);
  return acc;
}

/**
 * userId で畳み、nickname / iconUrl は空でないものを優先してマージ
 *
 * @param {{ userId: string, nickname: string, iconUrl: string }[]} items
 * @returns {{ userId: string, nickname: string, iconUrl: string }[]}
 */
export function dedupeViewerJoinUsersByUserId(items) {
  /** @type {Map<string, { userId: string, nickname: string, iconUrl: string }>} */
  const m = new Map();
  for (const it of items) {
    const uid = String(it.userId || '').trim();
    if (!uid) continue;
    const prev = m.get(uid);
    if (!prev) {
      m.set(uid, {
        userId: uid,
        nickname: String(it.nickname || '').trim(),
        iconUrl: String(it.iconUrl || '').trim()
      });
      continue;
    }
    const nick = String(it.nickname || '').trim() || prev.nickname;
    const icon = String(it.iconUrl || '').trim() || prev.iconUrl;
    m.set(uid, { userId: uid, nickname: nick, iconUrl: icon });
  }
  return [...m.values()];
}
