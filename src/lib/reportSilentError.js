// reportSilentError.js — 内部エラーを静かに記録する純ロジック(context invalidated 等の判定・メッセージ正規化)。
const MESSAGE_MAX = 200;

/**
 * Extension context invalidated エラーかどうかを判定する。
 * content-entry.js から抽出した純関数。
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isContextInvalidatedError(err) {
  const msg =
    err && typeof err === 'object' && 'message' in err
      ? String(/** @type {{ message?: unknown }} */ (err).message || '')
      : String(err || '');
  return msg.includes('Extension context invalidated');
}

/**
 * サイレントエラーを構造化ペイロードに変換する純関数。
 * catch(() => {}) を置き換えるための統一レポーター。
 *
 * @param {string} context - エラー発生箇所の識別子（'persist', 'flush' 等）
 * @param {unknown} err
 * @param {string} [liveId]
 * @returns {{ context: string, at: number, shouldReport: boolean, message?: string, liveId?: string }}
 */
export function buildSilentErrorPayload(context, err, liveId) {
  const invalidated = isContextInvalidatedError(err);

  /** @type {string|undefined} */
  let message;
  if (
    err !== null &&
    typeof err === 'object' &&
    'message' in err &&
    typeof /** @type {{ message?: unknown }} */ (err).message === 'string'
  ) {
    message = /** @type {{ message: string }} */ (err).message.slice(0, MESSAGE_MAX);
  } else if (typeof err === 'string') {
    message = err.slice(0, MESSAGE_MAX);
  }

  const id = liveId == null ? undefined : String(liveId).trim() || undefined;

  return {
    context,
    at: Date.now(),
    shouldReport: !invalidated,
    ...(message !== undefined ? { message } : {}),
    ...(id ? { liveId: id } : {})
  };
}
