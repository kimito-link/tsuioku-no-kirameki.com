/**
 * popup の配色フレーム「共有コード」の エンコード／デコード。
 *
 * 共有コードの実体は `nlsframe.` プレフィックス付きの base64url 文字列で、
 * ペイロードは `{ v: 1, frame: string, custom: { headerStart, headerEnd, accent } }`
 * の JSON。ユーザーが popup の UI で他人にフレーム設定を渡すためのもの。
 *
 * 本ファイルは chrome.storage にも DOM にも触らず、純粋な文字列変換と
 * `popupFramePresets.js` の正規化関数を呼ぶだけ。vitest で単体検証できる。
 */
import {
  DEFAULT_FRAME_ID,
  hasFramePreset,
  normalizeFrameId,
  sanitizeCustomFrame
} from './popupFramePresets.js';

/**
 * UTF-8 テキストを base64url（`+/=` を `-_` に置換しパディング除去）にエンコード。
 * @param {string} text
 * @returns {string}
 */
export function encodeBase64UrlUtf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * base64url を UTF-8 テキストに戻す。パディング再付与は内部で面倒を見る。
 * @param {string} text
 * @returns {string}
 */
export function decodeBase64UrlUtf8(text) {
  let base64 = String(text || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad) base64 += '='.repeat(4 - pad);
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * 現在のフレーム設定を共有コード文字列化する。
 * 未知のフレーム ID は `DEFAULT_FRAME_ID` に正規化、custom 3 色も必ず sanitize。
 * @param {string} frameId
 * @param {{ headerStart: string, headerEnd: string, accent: string }} custom
 * @returns {string}
 */
export function createFrameShareCode(frameId, custom) {
  const normalized = normalizeFrameId(frameId);
  const safeId =
    normalized === 'custom' || hasFramePreset(normalized)
      ? normalized
      : DEFAULT_FRAME_ID;
  const payload = {
    v: 1,
    frame: safeId,
    custom: sanitizeCustomFrame(custom)
  };
  const encoded = encodeBase64UrlUtf8(JSON.stringify(payload));
  return `nlsframe.${encoded}`;
}

/**
 * 共有コード文字列を解釈する。`nlsframe.` プレフィックスがあれば base64url として
 * デコード、なければ生の JSON として扱う（互換）。
 * 空文字は throw、JSON パース失敗も throw。
 * @param {string} raw
 * @returns {{ frameId: string, custom: { headerStart: string, headerEnd: string, accent: string } }}
 */
export function parseFrameShareCode(raw) {
  const code = String(raw || '').trim();
  if (!code) {
    throw new Error('共有コードが空です。');
  }

  const payloadText = code.startsWith('nlsframe.')
    ? decodeBase64UrlUtf8(code.slice('nlsframe.'.length))
    : code;
  const payload = JSON.parse(payloadText);
  const source = payload && typeof payload === 'object' ? payload : {};
  const frameValue = normalizeFrameId(
    /** @type {{ frame?: unknown }} */ (source).frame || ''
  );
  const frameId =
    frameValue === 'custom' || hasFramePreset(frameValue)
      ? frameValue
      : DEFAULT_FRAME_ID;

  return {
    frameId,
    custom: sanitizeCustomFrame(
      /** @type {{ custom?: unknown }} */ (source).custom || {}
    )
  };
}
