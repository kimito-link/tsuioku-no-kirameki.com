/**
 * コメント1件の形・重複排除・マージ（純関数）
 */

/**
 * @typedef {{
 *   id?: string,
 *   liveId?: string,
 *   commentNo?: string,
 *   text?: string,
 *   userId?: string|null,
 *   nickname?: string,
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
 * @param {{ liveId: string, commentNo?: string, text: string, userId?: string|null, nickname?: string }} p
 */
export function createCommentEntry(p) {
  const capturedAt = Date.now();
  const text = normalizeCommentText(p.text);
  const commentNo = String(p.commentNo ?? '').trim();
  const liveId = String(p.liveId || '').trim().toLowerCase();
  const nickname = p.nickname ? String(p.nickname).trim() : '';
  const entry = {
    id: randomId(),
    liveId,
    commentNo,
    text,
    userId: p.userId ? String(p.userId) : null,
    ...(nickname ? { nickname } : {}),
    capturedAt
  };
  return entry;
}

/**
 * @param {string} liveId
 * @param {StoredComment[]} existing
 * @param {{ commentNo?: string, text: string, userId?: string|null, nickname?: string }[]} incoming
 */
export function mergeNewComments(liveId, existing, incoming) {
  const lid = String(liveId || '').trim().toLowerCase();
  const keys = new Set();
  for (const e of existing) {
    const ex = /** @type {StoredComment} */ (e);
    keys.add(
      buildDedupeKey(lid, {
        commentNo: ex.commentNo,
        text: ex.text,
        capturedAt: ex.capturedAt
      })
    );
  }
  const added = [];
  const next = [...existing];
  const now = Date.now();
  for (const row of incoming) {
    const text = normalizeCommentText(row.text);
    if (!text) continue;
    const commentNo = String(row.commentNo ?? '').trim();
    const key = buildDedupeKey(lid, {
      commentNo,
      text,
      capturedAt: now
    });
    if (keys.has(key)) continue;
    keys.add(key);
    const entry = createCommentEntry({
      liveId: lid,
      commentNo,
      text,
      userId: row.userId ?? null,
      nickname: row.nickname || ''
    });
    added.push(entry);
    next.push(entry);
  }
  return { next, added };
}
