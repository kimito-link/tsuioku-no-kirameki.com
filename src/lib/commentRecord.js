/**
 * コメント1件の形・重複排除・マージ（純関数）
 */

import {
  isHttpOrHttpsUrl,
  isNiconicoSyntheticDefaultUserIconUrl,
  isWeakNiconicoUserIconHttpUrl,
  looksLikeNiconicoUserIconHttpUrl
} from './supportGrowthTileSrc.js';
import { pickStrongerUserId } from './userIdPreference.js';
import { anonymousNicknameFallback } from './nicoAnonymousDisplay.js';
import { clampAvatarUrl } from '../shared/avatar/clampAvatarUrl.js';

/** コメント本文の上限（storage肥大化を抑制） */
export const COMMENT_TEXT_MAX_CHARS = 1000;

/**
 * 保存済み・取り込み済みの usericon URL から数字 userId を復元（DOM 側で ID 欠けのみの救済）
 * @param {string} url
 * @returns {string}
 */
function userIdFromNicoUserIconHttpUrl(url) {
  const s = String(url || '');
  if (!isHttpOrHttpsUrl(s)) return '';
  let m = s.match(/\/usericon\/(?:s\/)?(\d+)\/(\d+)\./i);
  if (m?.[2]) return m[2];
  m = s.match(/nicoaccount\/usericon\/(\d+)/i);
  if (m?.[1] && m[1].length >= 5) return m[1];
  return '';
}

/**
 * @typedef {{
 *   id?: string,
 *   liveId?: string,
 *   commentNo?: string,
 *   text?: string,
 *   userId?: string|null,
 *   nickname?: string,
 *   avatarUrl?: string,
 *   avatarObserved?: boolean,
 *   selfPosted?: boolean,
 *   capturedAt?: number,
 *   vpos?: number|null,
 *   accountStatus?: number|null,
 *   is184?: boolean
 * }} StoredComment
 */

/**
 * @param {unknown} value
 */
export function normalizeCommentText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim()
    .slice(0, COMMENT_TEXT_MAX_CHARS);
}

/**
 * @param {string} liveId
 * @param {{ commentNo?: string, text?: string, capturedAt?: number, userId?: string|null }} rec
 *
 * 0.1.46 (AB): commentNo 欠落時の dedupe key に userId を含める。
 *   旧コードは `${liveId}||${text}|${sec}` で、複数ユーザーが同じ 1 秒内に
 *   同じ短文（"8888" / "草" 等）を打つと最初の 1 件だけ採用され残りは patch
 *   扱いになり、コメ被り検出（L1 / L5）が「N 人の被り」を N=1 と記録してしまい
 *   `detectCommentSyncBursts` の minDistinctUsers=3 を満たさなくなる問題があった。
 *   userId を key に含めることで同秒・同テキスト・別ユーザーが別行として扱われる。
 */
export function buildDedupeKey(liveId, rec) {
  const text = normalizeCommentText(rec.text);
  const no = String(rec.commentNo ?? '').trim();
  if (no) {
    return `${liveId}|${no}|${text}`;
  }
  const sec = Math.floor(Number(rec.capturedAt || 0) / 1000);
  const uid = String(rec.userId ?? '').trim();
  return `${liveId}||${text}|${sec}|${uid}`;
}

function randomId() {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {{ liveId: string, commentNo?: string, text: string, userId?: string|null, nickname?: string, avatarUrl?: string|null, avatarObserved?: boolean, vpos?: number|null, accountStatus?: number|null, is184?: boolean }} p
 */
export function createCommentEntry(p) {
  const capturedAt = Date.now();
  const text = normalizeCommentText(p.text);
  const commentNo = String(p.commentNo ?? '').trim();
  const liveId = String(p.liveId || '').trim().toLowerCase();
  // avatar URL の長さ上限を共通 helper（src/shared/avatar/clampAvatarUrl.js）に
  // 一元化（H2 / D-5）。createCommentEntry / patchExistingComment / merge /
  // userCommentProfileCache すべてが同じ閾値（既定 2000 字）を参照する。
  const av = clampAvatarUrl(p.avatarUrl);
  const avatarUrl = isHttpOrHttpsUrl(av) ? av : '';
  let uid = p.userId ? String(p.userId).trim() : '';
  if (!uid && avatarUrl) {
    const fromAv = userIdFromNicoUserIconHttpUrl(avatarUrl);
    if (fromAv) uid = fromAv;
  }
  const nickname = anonymousNicknameFallback(uid, p.nickname);
  const storedAvatar = avatarUrl;
  const entry = {
    id: randomId(),
    liveId,
    commentNo,
    text,
    userId: uid || null,
    ...(nickname ? { nickname } : {}),
    ...(storedAvatar ? { avatarUrl: storedAvatar } : {}),
    ...(p.avatarObserved ? { avatarObserved: true } : {}),
    ...(p.vpos != null ? { vpos: p.vpos } : {}),
    ...(p.accountStatus != null ? { accountStatus: p.accountStatus } : {}),
    ...(p.is184 ? { is184: true } : {}),
    capturedAt
  };
  return entry;
}

/**
 * @param {string} lid
 * @param {StoredComment} ex
 */
function storedCommentDedupeKey(lid, ex) {
  return buildDedupeKey(lid, {
    commentNo: ex.commentNo,
    text: ex.text,
    capturedAt: ex.capturedAt
  });
}

/**
 * mergeNewComments の incoming が dedupe キー計算で使う capturedAt を決める。
 * - 収集側が `row.capturedAt` を載せればそれを最優先（NDGR／将来のソース時刻）。
 * - commentNo 欠落時、ストレージ上に同一 `{ text,userId?,commentNo 空}` が 1 件だけあるなら、
 *   その行の capturedAt でキーを組み直す（秒境界を跨いだ再取り込みでの二重保存抑止）。
 * - それ以外は呼び出し時点の `fallbackMs`（通常 `Date.now()`）。
 *
 * @param {StoredComment[]} next
 * @param {{ capturedAt?: number, commentNo?: string, text: string, userId?: string|null }} row
 * @param {number} fallbackMs
 * @returns {number}
 */
function deriveIncomingDedupeCapturedAt(next, row, fallbackMs) {
  const cap = Number(row.capturedAt);
  if (typeof cap === 'number' && Number.isFinite(cap) && cap > 0) {
    return cap;
  }
  const commentNo = String(row.commentNo ?? '').trim();
  if (commentNo) {
    return fallbackMs;
  }
  const text = normalizeCommentText(row.text);
  const uid = String(row.userId ?? '').trim();

  /** @type {number|null} */
  let lone = null;
  let hits = 0;
  for (const ex of next) {
    /** @type {StoredComment} */
    const entry = /** @type {StoredComment} */ (ex);
    if (String(entry.commentNo ?? '').trim()) continue;
    if (normalizeCommentText(entry.text) !== text) continue;
    if (String(entry.userId ?? '').trim() !== uid) continue;
    hits += 1;
    if (hits === 1) {
      const raw = Number(entry.capturedAt);
      lone =
        typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null;
    } else {
      lone = null;
    }
  }

  return hits === 1 && lone != null ? lone : fallbackMs;
}

/**
 * 既存コメントに incoming の情報をパッチ適用（純関数）。
 * avatarUrl / userId / nickname / avatarObserved を「強い方優先」で更新する。
 *
 * @param {StoredComment} existing
 * @param {{ userId?: string|null, nickname?: string, avatarUrl?: string|null, avatarObserved?: boolean }} incoming
 * @returns {{ entry: StoredComment, touched: boolean }}
 */
export function patchExistingComment(existing, incoming) {
  // incoming の avatarUrl も clampAvatarUrl で揃える（H2 / D-5）。
  // 既存行の avatarUrl が 2000 字超の場合、後続の equality 比較で「短いものに
  // 上書き済み」と認識されるよう、必要なら同じ slice を当てる。
  const rawAv = clampAvatarUrl(incoming.avatarUrl);
  const validAvatar = isHttpOrHttpsUrl(rawAv) ? rawAv : '';
  let incUid = incoming.userId ? String(incoming.userId).trim() : '';
  if (!incUid && validAvatar) {
    const fromAv = userIdFromNicoUserIconHttpUrl(validAvatar);
    if (fromAv) incUid = fromAv;
  }

  let entry = /** @type {StoredComment} */ (existing);
  let touched = false;

  if (validAvatar) {
    // 既存 avatarUrl が 0.1.9 以前で書かれた巨大 URL（2KB 超）の場合があるので、
    // 比較・upgrade 経路に入る前に clampAvatarUrl で揃える（D-5）。
    const exAv = clampAvatarUrl(entry.avatarUrl);
    const hasAv = Boolean(exAv && isHttpOrHttpsUrl(exAv));
    let uidForSynthetic = String(entry.userId || incUid || '').trim();
    if (!uidForSynthetic && exAv) {
      uidForSynthetic = userIdFromNicoUserIconHttpUrl(exAv);
    }
    const canUpgradeSynthetic =
      hasAv &&
      looksLikeNiconicoUserIconHttpUrl(validAvatar) &&
      validAvatar !== exAv &&
      isNiconicoSyntheticDefaultUserIconUrl(exAv, uidForSynthetic);
    const canUpgradeWeakPlaceholder =
      hasAv &&
      isWeakNiconicoUserIconHttpUrl(exAv) &&
      looksLikeNiconicoUserIconHttpUrl(validAvatar) &&
      !isWeakNiconicoUserIconHttpUrl(validAvatar) &&
      validAvatar !== exAv;

    if (!hasAv) {
      entry = { ...entry, avatarUrl: validAvatar };
      touched = true;
    } else if (canUpgradeSynthetic) {
      entry = { ...entry, avatarUrl: validAvatar };
      touched = true;
    } else if (canUpgradeWeakPlaceholder) {
      entry = { ...entry, avatarUrl: validAvatar };
      touched = true;
    }
  }

  const exUid = String(entry.userId || '').trim();
  const chosenUid = pickStrongerUserId(exUid, incUid);
  if (incUid && chosenUid !== exUid) {
    entry = { ...entry, userId: chosenUid ? chosenUid : null };
    touched = true;
  }

  const incNickRaw = String(incoming.nickname || '').trim();
  const incNick =
    incNickRaw ||
    anonymousNicknameFallback(String(entry.userId || incUid || ''), '');
  const exNick = String(entry.nickname || '').trim();
  if (incNick && (!exNick || incNick.length > exNick.length)) {
    entry = { ...entry, nickname: incNick };
    touched = true;
  }

  if (!String(entry.userId || '').trim()) {
    const avHeal = String(entry.avatarUrl || '').trim();
    if (isHttpOrHttpsUrl(avHeal)) {
      const h = userIdFromNicoUserIconHttpUrl(avHeal);
      if (h) {
        entry = { ...entry, userId: h };
        touched = true;
      }
    }
  }

  if (incoming.avatarObserved && !entry.avatarObserved) {
    entry = { ...entry, avatarObserved: true };
    touched = true;
  }

  return { entry, touched };
}

/**
 * @param {string} liveId
 * @param {StoredComment[]} existing
 * @param {{ commentNo?: string, text: string, userId?: string|null, nickname?: string, avatarUrl?: string|null, avatarObserved?: boolean, vpos?: number|null, accountStatus?: number|null, is184?: boolean, capturedAt?: number }[]} incoming
 * @returns {{ next: StoredComment[], added: StoredComment[], storageTouched: boolean }}
 */
export function mergeNewComments(liveId, existing, incoming) {
  const lid = String(liveId || '').trim().toLowerCase();
  /** @type {Map<string, number>} */
  const keyToIndex = new Map();
  for (let i = 0; i < existing.length; i += 1) {
    const e = existing[i];
    const ex = /** @type {StoredComment} */ (e);
    const key = storedCommentDedupeKey(lid, ex);
    if (!keyToIndex.has(key)) keyToIndex.set(key, i);
  }
  const added = [];
  const next = /** @type {StoredComment[]} */ ([...existing]);
  let storageTouched = false;
  for (const row of incoming) {
    const text = normalizeCommentText(row.text);
    if (!text) continue;
    const commentNo = String(row.commentNo ?? '').trim();
    const capForDedupe = deriveIncomingDedupeCapturedAt(next, row, Date.now());
    const key = buildDedupeKey(lid, {
      commentNo,
      text,
      capturedAt: capForDedupe
    });

    const idx = keyToIndex.get(key);
    if (idx != null && idx >= 0 && idx < next.length) {
      const result = patchExistingComment(next[idx], row);
      if (result.touched) {
        next[idx] = result.entry;
        storageTouched = true;
      }
      continue;
    }
    keyToIndex.set(key, next.length);
    const rawAv = String(row.avatarUrl || '').trim();
    const validAvatar = isHttpOrHttpsUrl(rawAv) ? rawAv : '';
    const entry = createCommentEntry({
      liveId: lid,
      commentNo,
      text,
      userId: row.userId ?? null,
      nickname: row.nickname || '',
      avatarUrl: validAvatar || undefined,
      avatarObserved: row.avatarObserved || false,
      vpos: row.vpos,
      accountStatus: row.accountStatus,
      is184: row.is184
    });
    added.push(entry);
    next.push(entry);
  }
  if (added.length) storageTouched = true;
  return { next, added, storageTouched };
}

/**
 * ストレージ上のコメントから合成 canonical URL を除去（ティア判定の誤昇格を防ぐ）。
 * 合成 URL = `niconicoDefaultUserIconUrl(userId)` と完全一致する URL。
 * DOM/intercept で実際に観測された URL は残す（合成 URL とは URL 形式が同じだが、
 * 過去の backfill で書き込まれたものだけ除去対象）。
 * @param {unknown[]} entries
 * @returns {{ next: unknown[], patched: number }}
 */
export function backfillNumericSyntheticAvatarsOnStoredComments(entries) {
  if (!Array.isArray(entries) || !entries.length) {
    return { next: entries, patched: 0 };
  }
  let patched = 0;
  const next = entries.map((e) => {
    const av = String(/** @type {{ avatarUrl?: unknown }} */ (e)?.avatarUrl || '').trim();
    if (!av || !isHttpOrHttpsUrl(av)) return e;
    const uid = String(/** @type {{ userId?: unknown }} */ (e)?.userId || '').trim();
    if (/^\d{5,14}$/.test(uid) && isNiconicoSyntheticDefaultUserIconUrl(av, uid)) {
      patched += 1;
      const copy = { .../** @type {object} */ (e) };
      delete /** @type {Record<string,unknown>} */ (copy).avatarUrl;
      return copy;
    }
    return e;
  });
  return { next, patched };
}
