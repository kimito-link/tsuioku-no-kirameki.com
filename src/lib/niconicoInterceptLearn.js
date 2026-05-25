/**
 * page-intercept が JSON から拾う userId / nickname / avatar / commentNo の走査（純関数）
 * MAIN world の IIFE から import してバンドルされる。
 */

/**
 * @typedef {{ no: string, uid: string, name: string, av: string }} InterceptEnqueueSignal
 * @typedef {{ uid: string, name: string, av: string }} InterceptLearnUserSignal
 */

export const INTERCEPT_NO_KEYS = Object.freeze([
  'no',
  'commentNo',
  'comment_no',
  'number',
  'vpos_no'
]);

export const INTERCEPT_UID_KEYS = Object.freeze([
  'user_id',
  'userId',
  'uid',
  'raw_user_id',
  'hashedUserId',
  'hashed_user_id',
  'senderUserId',
  'accountId',
  'advertiser_user_id',
  'advertiserUserId'
]);

export const INTERCEPT_NAME_KEYS = Object.freeze([
  'name',
  'nickname',
  'userName',
  'user_name',
  'displayName',
  'display_name',
  'advertiser_name',
  'advertiserName'
]);

export const INTERCEPT_AVATAR_KEYS = Object.freeze([
  'iconUrl',
  'icon_url',
  'avatarUrl',
  'avatar_url',
  'userIconUrl',
  'user_icon_url',
  'thumbnailUrl',
  'thumbnail_url'
]);

export const INTERCEPT_NESTED_KEYS = Object.freeze([
  'chat',
  'comment',
  'data',
  'message',
  'body',
  'user',
  'sender'
]);

/**
 * @param {unknown} url
 * @returns {string}
 */
export function normalizeInterceptAvatarUrl(url) {
  const s = String(url ?? '').trim();
  if (!/^https?:\/\//i.test(s)) return '';
  return s;
}

/** @type {RegExp} */
const NICO_USERICON_IN_STRING_RE =
  /https?:\/\/[^\s"'<>]+?nicoaccount\/usericon\/(?:s\/)?(\d+)\/(\d+)\.[\w.]+/gi;

/**
 * JSON 文字列断片内の公式 usericon URL から uid→av を学習用シグナルにする（パッシブ）。
 *
 * @param {string} text
 * @returns {InterceptLearnUserSignal[]}
 */
export function extractLearnUsersFromNicoUserIconUrlsInString(text) {
  const s = String(text || '');
  if (!s.includes('nicoaccount') || !s.includes('usericon')) return [];
  /** @type {InterceptLearnUserSignal[]} */
  const out = [];
  NICO_USERICON_IN_STRING_RE.lastIndex = 0;
  let m;
  while ((m = NICO_USERICON_IN_STRING_RE.exec(s)) !== null) {
    const uid = String(m[2] || '').trim();
    const av = normalizeInterceptAvatarUrl(m[0]);
    if (uid && av && /^\d{5,14}$/.test(uid)) out.push({ uid, name: '', av });
  }
  return out;
}

export const AD_OR_RANKING_KEYS = Object.freeze([
  'advertiserUserId',
  'advertiser_user_id',
  'advertiserName',
  'advertiser_name',
  'nicoadId',
  'nicoad_id',
  'adPoint',
  'ad_point',
  'totalAdPoint',
  'total_ad_point',
  'contribution',
  'contributionRank',
  'contribution_rank',
  'rank',
  'score',
  'giftPoint',
  'gift_point',
  'adPoints',
  'giftPoints'
]);

/**
 * @param {Record<string, unknown>} rec
 * @returns {boolean}
 */
function isAdOrRankingObject(rec) {
  if (!rec) return false;
  for (const k of AD_OR_RANKING_KEYS) {
    if (rec[k] !== undefined) return true;
  }
  return false;
}

/**
 * 1オブジェクト（配列でない）について、従来 `dig` 内と同じキー走査でシグナルを返す。
 * @param {unknown} obj
 * @returns {{ enqueues: InterceptEnqueueSignal[], learnUsers: InterceptLearnUserSignal[] }}
 */
export function collectInterceptSignalsFromObject(obj) {
  /** @type {InterceptEnqueueSignal[]} */
  const enqueues = [];
  /** @type {InterceptLearnUserSignal[]} */
  const learnUsers = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { enqueues, learnUsers };
  }

  const rec = /** @type {Record<string, unknown>} */ (obj);

  let no = null;
  let uid = null;
  let name = null;
  let av = '';

  for (const k of INTERCEPT_NO_KEYS) {
    if (rec[k] != null) {
      no = rec[k];
      break;
    }
  }
  for (const k of INTERCEPT_UID_KEYS) {
    if (rec[k] != null) {
      uid = rec[k];
      break;
    }
  }
  for (const k of INTERCEPT_NAME_KEYS) {
    if (rec[k] != null && typeof rec[k] === 'string') {
      name = rec[k];
      break;
    }
  }
  for (const k of INTERCEPT_AVATAR_KEYS) {
    if (rec[k] != null && typeof rec[k] === 'string') {
      av = normalizeInterceptAvatarUrl(rec[k]);
      if (av) break;
    }
  }

  let childAdOrRank = false;
  if (no == null || uid == null || name == null || !av) {
    for (const sub of INTERCEPT_NESTED_KEYS) {
      const child = rec[sub];
      if (!child || typeof child !== 'object' || Array.isArray(child)) continue;
      const ch = /** @type {Record<string, unknown>} */ (child);
      if (isAdOrRankingObject(ch)) {
        childAdOrRank = true;
      }
      if (no == null) {
        for (const k of INTERCEPT_NO_KEYS) {
          if (ch[k] != null) {
            no = ch[k];
            break;
          }
        }
      }
      if (uid == null) {
        for (const k of INTERCEPT_UID_KEYS) {
          if (ch[k] != null) {
            uid = ch[k];
            break;
          }
        }
      }
      if (name == null) {
        for (const k of INTERCEPT_NAME_KEYS) {
          if (ch[k] != null && typeof ch[k] === 'string') {
            name = ch[k];
            break;
          }
        }
      }
      if (!av) {
        for (const k of INTERCEPT_AVATAR_KEYS) {
          if (ch[k] != null && typeof ch[k] === 'string') {
            av = normalizeInterceptAvatarUrl(ch[k]);
            if (av) break;
          }
        }
      }
    }
  }

  const sUid = uid != null ? String(uid).trim() : '';
  const sName = name != null ? String(name).trim() : '';
  const isAdOrRank = isAdOrRankingObject(rec) || childAdOrRank;

  if (no != null && (uid != null || name != null || av) && !isAdOrRank) {
    const n = String(no ?? '').trim();
    if (n) {
      enqueues.push({ no: n, uid: sUid, name: sName, av });
    }
  } else if (uid != null && (name != null || av)) {
    learnUsers.push({ uid: sUid, name: sName, av });
  }

  return { enqueues, learnUsers };
}

/**
 * `dig` と同じ深さ制限・子キー上限で JSON 木を走査する（テスト・診断用）
 * @param {unknown} root
 * @param {{ maxDepth?: number, maxArray?: number, maxKeys?: number }} [opts]
 * @returns {{ enqueues: InterceptEnqueueSignal[], learnUsers: InterceptLearnUserSignal[] }}
 */
export function walkJsonForInterceptSignals(root, opts = {}) {
  const maxDepth = opts.maxDepth ?? 5;
  const maxArray = opts.maxArray ?? 500;
  const maxKeys = opts.maxKeys ?? 30;
  /** @type {InterceptEnqueueSignal[]} */
  const enqueues = [];
  /** @type {InterceptLearnUserSignal[]} */
  const learnUsers = [];

  /**
   * @param {unknown} obj
   * @param {number} depth
   */
  function dig(obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > maxDepth) return;
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length && i < maxArray; i++) dig(obj[i], depth + 1);
      return;
    }
    const c = collectInterceptSignalsFromObject(obj);
    enqueues.push(...c.enqueues);
    learnUsers.push(...c.learnUsers);
    const keys = Object.keys(
      /** @type {Record<string, unknown>} */ (obj)
    );
    for (let i = 0; i < keys.length && i < maxKeys; i++) {
      const v = /** @type {Record<string, unknown>} */ (obj)[keys[i]];
      if (v && typeof v === 'object') dig(v, depth + 1);
    }
  }

  dig(root, 0);
  return { enqueues, learnUsers };
}
