/**
 * v0.1.1735: 送信本文を gzip に縮める(状態速報 → api/status)。
 *   ふだん約130KB の JSON を毎回そのまま送っていた。コメント・名前の繰り返しが多いので gzip でおよそ5分の1になる。
 *   受け口は `x-nls-body: gzip` を見て解く(api/status.js readBody)。
 *   CompressionStream が無い環境・失敗したときは null=呼び出し側はそのまま(圧縮なし)で送る。
 *
 * @module gzipBody
 */

/** 受け口に「gzip で送った」と伝えるヘッダ名(api/status.js の GZIP_BODY_HEADER と同じ)。 */
export const GZIP_BODY_HEADER = 'x-nls-body';

/**
 * @param {string} text JSON 文字列
 * @returns {Promise<Uint8Array|null>}
 */
export async function gzipText(text) {
  try {
    const CS = /** @type {any} */ (globalThis).CompressionStream;
    if (typeof CS !== 'function' || typeof Response !== 'function') return null;
    const stream = new Blob([String(text)]).stream().pipeThrough(new CS('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * 送る fetch の init を組む。縮められたら gzip、だめなら従来どおりの JSON。
 * @param {Record<string, string>} headers 認証ヘッダ(Content-Type: application/json を含む)
 * @param {string} jsonText
 * @param {{ allowGzip?: boolean }} [opts]
 * @returns {Promise<{ init: RequestInit, gzip: boolean }>}
 */
export async function buildPublishInit(headers, jsonText, opts = {}) {
  const zipped = opts.allowGzip === false ? null : await gzipText(jsonText);
  if (!zipped) return { init: { method: 'POST', headers, body: jsonText }, gzip: false };
  return {
    init: {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/octet-stream', [GZIP_BODY_HEADER]: 'gzip' },
      body: /** @type {any} */ (zipped)
    },
    gzip: true
  };
}
