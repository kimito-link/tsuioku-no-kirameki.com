/**
 * localCommentJson.js — 外部ツール向けの読み取り専用スナップショット。
 * 待受の口は開けない。この関数は形を作るだけ。
 */
export const LOCAL_COMMENT_JSON_FORMAT = 1;
export const LOCAL_COMMENT_JSON_MAX = 80;
export const LOCAL_COMMENT_TEXT_MAX = 200;
export const LOCAL_COMMENT_JSON_KIND = 'kirameki-local-comments';

/**
 * @param {readonly unknown[]} rows
 * @param {number} generatedAt
 * @param {string} liveId
 * @returns {Record<string, unknown>}
 */
export function buildLocalCommentSnapshot(rows, generatedAt, liveId) {
  const list = Array.isArray(rows) ? rows : [];
  /** @type {Array<{ at: number, no: string, userId: string, name: string, text: string }>} */
  const comments = [];
  for (const row of list) {
    const src = row && typeof row === 'object' ? /** @type {any} */ (row) : {};
    const text = String(src.text || '').replace(/\s+/g, ' ').trim().slice(0, LOCAL_COMMENT_TEXT_MAX);
    if (!text) continue;
    comments.push({
      at: Math.max(0, Number(src.at) || 0),
      no: String(src.no || '').trim().slice(0, 40),
      userId: String(src.userId || '').trim().slice(0, 40),
      name: String(src.name || '').trim().slice(0, 80),
      text
    });
  }
  return {
    formatVersion: LOCAL_COMMENT_JSON_FORMAT,
    kind: LOCAL_COMMENT_JSON_KIND,
    access: 'read-only',
    liveId: String(liveId || '').trim().slice(0, 40),
    generatedAt: Math.max(0, Number(generatedAt) || 0),
    limits: {
      listen: false,
      maxComments: LOCAL_COMMENT_JSON_MAX,
      maxText: LOCAL_COMMENT_TEXT_MAX,
      note: 'extension-page-snapshot-only'
    },
    comments: comments.slice(-LOCAL_COMMENT_JSON_MAX)
  };
}

/**
 * コメント本文だけが同じなら、ファイルを書き直さない。
 * @param {unknown} snapshot
 * @returns {string}
 */
export function localCommentBodyKey(snapshot) {
  const comments = snapshot && typeof snapshot === 'object'
    ? /** @type {any} */ (snapshot).comments
    : [];
  return JSON.stringify(Array.isArray(comments) ? comments : []);
}
