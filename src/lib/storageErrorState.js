/**
 * ストレージ書き込みエラーをポップアップ向けにシリアライズする純関数
 */

const MESSAGE_MAX = 200;

/**
 * @param {string|null|undefined} liveId
 * @param {unknown} err
 * @returns {{ at: number, liveId?: string, message?: string }}
 */
export function buildStorageWriteErrorPayload(liveId, err) {
  let message;
  const msg =
    err !== null &&
    typeof err === 'object' &&
    'message' in err &&
    typeof /** @type {{ message?: unknown }} */ (err).message === 'string'
      ? /** @type {{ message: string }} */ (err).message
      : undefined;
  if (msg !== undefined) {
    message = String(msg).slice(0, MESSAGE_MAX);
  } else if (typeof err === 'string') {
    message = err.slice(0, MESSAGE_MAX);
  }
  const id = liveId == null ? null : String(liveId).trim();
  return {
    at: Date.now(),
    ...(id ? { liveId: id } : {}),
    ...(message ? { message } : {})
  };
}
