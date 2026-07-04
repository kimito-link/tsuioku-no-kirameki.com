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
 * 拡張の runtime context が現在も有効かどうかを判定する。
 * v0.1.1070: content-entry.js に散在していた `hasExtensionContext()` を
 * 純関数として抽出。拡張がリロード/更新されると、古いタブに残った content
 * script からは `chrome.runtime.id` が undefined になる（storage/runtime API が
 * 使えなくなる合図）。周期処理・イベントハンドラの入口でこれを見て、無効なら
 * 以後の chrome.* 呼び出しを止める（＝黙って引退する）ためのガード。
 *
 * @param {{ runtime?: { id?: unknown }, storage?: { local?: unknown } }} [chromeRef]
 *   省略時は globalThis.chrome を見る（content script 実行環境向け）。
 * @returns {boolean}
 */
export function isExtensionContextAlive(chromeRef) {
  try {
    const c =
      chromeRef !== undefined
        ? chromeRef
        : /** @type {any} */ (typeof chrome !== 'undefined' ? chrome : undefined);
    return Boolean(c?.runtime?.id && c?.storage?.local);
  } catch {
    return false;
  }
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
