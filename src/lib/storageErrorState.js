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

/**
 * ポップアップが今見ている放送とエラーペイロードの liveId が一致するか。
 * payload に liveId が無い（旧データ等）は常に表示対象。
 * viewerLiveId が空（watch 文脈なし）も表示する（ユーザーに失敗を知らせる）。
 *
 * @param {{ liveId?: string }} payload
 * @param {string|null|undefined} viewerLiveId 小文字化済み lv を想定
 * @returns {boolean}
 */
export function storageErrorRelevantToLiveId(payload, viewerLiveId) {
  if (!payload || typeof payload !== 'object') return false;
  const errLid = String(
    /** @type {{ liveId?: unknown }} */ (payload).liveId || ''
  )
    .trim()
    .toLowerCase();
  if (!errLid) return true;
  const v = String(viewerLiveId || '')
    .trim()
    .toLowerCase();
  if (!v) return true;
  return errLid === v;
}
