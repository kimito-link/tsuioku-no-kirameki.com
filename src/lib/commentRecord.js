/**
 * コメント1件の形・重複排除・マージ（純関数）
 */

import { isHttpOrHttpsUrl } from './supportGrowthTileSrc.js';

/**
 * @typedef {{
 *   id?: string,
 *   liveId?: string,
 *   commentNo?: string,
 *   text?: string,
 *   userId?: string|null,
 *   nickname?: string,
 *   avatarUrl?: string,
 *   capturedAt?: number
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
    .trim();
}

/**
 * @param {string} liveId
 * @param {{ commentNo?: string, text?: string, capturedAt?: number }} rec
 */
export function buildDedupeKey(liveId, rec) {
  const text = normalizeCommentText(rec.text);
  const no = String(rec.commentNo ?? '').trim();
  if (no) {
    return `${liveId}|${no}|${text}`;
  }
  const sec = Math.floor(Number(rec.capturedAt || 0) / 1000);
  return `${liveId}||${text}|${sec}`;
}

function randomId() {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {{ liveId: string, commentNo?: string, text: string, userId?: string|null, nickname?: string, avatarUrl?: string|null }} p
 */
export function createCommentEntry(p) {
  const capturedAt = Date.now();
  const text = normalizeCommentText(p.text);
  const commentNo = String(p.commentNo ?? '').trim();
  const liveId = String(p.liveId || '').trim().toLowerCase();
  const nickname = p.nickname ? String(p.nickname).trim() : '';
  const av = String(p.avatarUrl || '').trim();
  const avatarUrl = isHttpOrHttpsUrl(av) ? av : '';
  const entry = {
    id: randomId(),
    liveId,
    commentNo,
    text,
    userId: p.userId ? String(p.userId) : null,
    ...(nickname ? { nickname } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
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
 * @param {string} liveId
 * @param {StoredComment[]} existing
 * @param {{ commentNo?: string, text: string, userId?: string|null, nickname?: string, avatarUrl?: string|null }[]} incoming
 * @returns {{ next: StoredComment[], added: StoredComment[], storageTouched: boolean }}
 */
export function mergeNewComments(liveId, existing, incoming) {
  const lid = String(liveId || '').trim().toLowerCase();
  const keys = new Set();
  for (const e of existing) {
    const ex = /** @type {StoredComment} */ (e);
    keys.add(storedCommentDedupeKey(lid, ex));
  }
  const added = [];
  const next = /** @type {StoredComment[]} */ ([...existing]);
  const now = Date.now();
  let storageTouched = false;
  for (const row of incoming) {
    const text = normalizeCommentText(row.text);
    if (!text) continue;
    const commentNo = String(row.commentNo ?? '').trim();
    const key = buildDedupeKey(lid, {
      commentNo,
      text,
      capturedAt: now
    });
    const rawAv = String(row.avatarUrl || '').trim();
    const validAvatar = isHttpOrHttpsUrl(rawAv) ? rawAv : '';

    if (keys.has(key)) {
      const idx = next.findIndex((ex) => storedCommentDedupeKey(lid, ex) === key);
      if (idx >= 0) {
        const ex = /** @type {StoredComment} */ (next[idx]);
        let patched = ex;
        let touched = false;

        if (validAvatar) {
          const hasAv = Boolean(
            ex.avatarUrl && isHttpOrHttpsUrl(String(ex.avatarUrl))
          );
          if (!hasAv) {
            patched = { ...patched, avatarUrl: validAvatar };
            touched = true;
          }
        }

        const incUid = row.userId ? String(row.userId).trim() : '';
        if (incUid && !ex.userId) {
          patched = { ...patched, userId: incUid };
          touched = true;
        }

        const incNick = String(row.nickname || '').trim();
        if (incNick && !String(ex.nickname || '').trim()) {
          patched = { ...patched, nickname: incNick };
          touched = true;
        }

        if (touched) {
          next[idx] = patched;
          storageTouched = true;
        }
      }
      continue;
    }
    keys.add(key);
    const entry = createCommentEntry({
      liveId: lid,
      commentNo,
      text,
      userId: row.userId ?? null,
      nickname: row.nickname || '',
      avatarUrl: validAvatar || undefined
    });
    added.push(entry);
    next.push(entry);
  }
  if (added.length) storageTouched = true;
  return { next, added, storageTouched };
}
