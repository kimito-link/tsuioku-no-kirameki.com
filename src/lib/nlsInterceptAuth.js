/**
 * v0.1.234: page-intercept (MAIN world) → content-entry (ISOLATED world) 経路の
 * postMessage を最低限の改ざん耐性で守るための token + shape 検証 純関数。
 *
 * 脅威:
 *   - 同じ watch ページ上の任意 JS（別拡張・userscript・ページ注入 等）が
 *     `NLS_INTERCEPT_CHAT_ROWS` 等を `window.postMessage` で投げると、
 *     `e.source !== window` だけの check では弾けず、`nls_comments_<lid>` /
 *     `nls_gift_users_<lid>` 等の local storage を汚染できる。
 *
 * 対策（防御の段階）:
 *   1. token: page-intercept が起動時に生成した値を `data-nls-page-token`
 *      属性に書き、postMessage に `_token` で同梱。content-entry は属性から
 *      期待値を読み、一致しないメッセージを drop。
 *      （MAIN world script は属性を読めば偽装可能だが、generic / opportunistic な
 *      attacker や別拡張の事故的衝突を弾くのに有効。）
 *   2. shape: 各メッセージ型の payload を最低限の型 / 範囲で検証。
 *      過大文字列 / 過大配列 / 異常 commentNo / 異常 userId 等を drop。
 *   3. 入力 cap: 配列要素数の上限を強制（DoS 緩和）。
 *
 * 副作用なし、純関数。
 */

export const NLS_AUTH_TOKEN_ATTR = 'data-nls-page-token';

/**
 * 32 byte hex 文字列の token を生成する。
 * `crypto.getRandomValues` が使えなければ Date.now + Math.random で fallback
 * （生成エントロピーは落ちるが、空 token / 固定値よりは強い）。
 *
 * @returns {string}
 */
export function generateNlsAuthToken() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const buf = new Uint8Array(16);
      crypto.getRandomValues(buf);
      let s = '';
      for (let i = 0; i < buf.length; i++) {
        s += buf[i].toString(16).padStart(2, '0');
      }
      return s;
    }
  } catch { /* fallback below */ }
  // fallback: Math.random + Date.now
  const a = Date.now().toString(16);
  const b = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  const c = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return (a + b + c).slice(0, 32);
}

/**
 * @param {{ data?: unknown }|null|undefined} eventLike
 * @param {string} expectedToken
 * @returns {boolean}
 */
export function isNlsInterceptTokenValid(eventLike, expectedToken) {
  if (!expectedToken) return false;
  if (!eventLike || !eventLike.data || typeof eventLike.data !== 'object') return false;
  const tok = /** @type {{ _token?: unknown }} */ (eventLike.data)._token;
  return typeof tok === 'string' && tok === expectedToken;
}

/* ================================================================
 * shape validation
 *
 * 基本方針:
 *   - 「明らかに異常な値」は drop（極端に長い文字列、巨大配列、負の数 等）
 *   - 上限超過は drop でも truncate でもなく drop（送信側の bug 検出も兼ねる）
 *   - 真正な page-intercept からの値は通過する
 * ================================================================ */

/** 1 メッセージあたりの最大配列要素数。これを超える場合は payload を drop。 */
export const NLS_INTERCEPT_MAX_ARRAY_LEN = 1000;
/** 文字列フィールド上限。コメント本文等は実質 256 字以内のはず。余裕を持って 4096。 */
export const NLS_INTERCEPT_MAX_STRING_LEN = 4096;
/** userId の最大長（数値 ID 12 桁 + a:hash 等）。 */
export const NLS_INTERCEPT_MAX_USER_ID_LEN = 64;
/** commentNo は 1〜10 桁の整数文字列を想定。 */
const COMMENT_NO_RE = /^\d{1,10}$/;
/** userId は数値か `a:hash` 形式（hex / Base64 ish）。 */
const USER_ID_RE = /^[a-zA-Z0-9_:.-]{1,64}$/;

/**
 * 文字列として妥当か判定。
 * @param {unknown} v
 * @returns {boolean}
 */
function isReasonableString(v) {
  return typeof v === 'string' && v.length > 0 && v.length <= NLS_INTERCEPT_MAX_STRING_LEN;
}

/**
 * @param {unknown} row
 * @returns {boolean}
 */
export function isValidChatRow(row) {
  if (!row || typeof row !== 'object') return false;
  const r = /** @type {Record<string, unknown>} */ (row);
  // commentNo: 1-10 桁数字
  const no = String(r.commentNo ?? r.no ?? '');
  if (no && !COMMENT_NO_RE.test(no)) return false;
  // text: 4096 字以内
  if (r.text != null && typeof r.text !== 'string') return false;
  if (typeof r.text === 'string' && r.text.length > NLS_INTERCEPT_MAX_STRING_LEN) return false;
  // userId: 任意だが形式チェック
  if (r.userId != null && typeof r.userId !== 'string') return false;
  if (typeof r.userId === 'string' && r.userId && !USER_ID_RE.test(r.userId)) return false;
  return true;
}

/**
 * @param {unknown} u
 * @returns {boolean}
 */
export function isValidGiftUser(u) {
  if (!u || typeof u !== 'object') return false;
  const r = /** @type {Record<string, unknown>} */ (u);
  // userId: 任意（anonymous gift は空）だが形式チェック
  if (r.userId != null && typeof r.userId !== 'string') return false;
  if (typeof r.userId === 'string' && r.userId && !USER_ID_RE.test(r.userId)) return false;
  // nickname: 任意 / 文字列
  if (r.nickname != null && typeof r.nickname !== 'string') return false;
  if (typeof r.nickname === 'string' && r.nickname.length > NLS_INTERCEPT_MAX_STRING_LEN) return false;
  // point: 任意 / 数値（負はあり得ない）
  if (r.point != null && (typeof r.point !== 'number' || !Number.isFinite(r.point) || r.point < 0)) return false;
  // itemId / itemName: 任意 / 文字列
  if (r.itemId != null && typeof r.itemId !== 'string') return false;
  if (r.itemName != null && typeof r.itemName !== 'string') return false;
  if (typeof r.itemId === 'string' && r.itemId.length > 256) return false;
  if (typeof r.itemName === 'string' && r.itemName.length > 256) return false;
  return true;
}

/**
 * NLS_INTERCEPT_COMMENT_POST の body shape 検証。
 * @param {unknown} body
 * @returns {boolean}
 */
export function isValidCommentPostBody(body) {
  if (!body || typeof body !== 'object') return false;
  const r = /** @type {Record<string, unknown>} */ (body);
  const no = String(r.no ?? r.commentNo ?? '');
  const text = r.body ?? r.text;
  if (!no || !COMMENT_NO_RE.test(no)) return false;
  if (!isReasonableString(text)) return false;
  const uid = r.userId ?? r.user_id;
  if (uid != null && typeof uid !== 'string') return false;
  if (typeof uid === 'string' && uid && !USER_ID_RE.test(uid)) return false;
  return true;
}

/**
 * 配列 payload を上限以内かつ各要素が valid に絞る。空配列 / null は null を返す。
 * @template T
 * @param {unknown} raw
 * @param {(item: unknown) => boolean} validate
 * @returns {Array<T>|null}
 */
export function sanitizeIncomingArray(raw, validate) {
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0) return null;
  if (raw.length > NLS_INTERCEPT_MAX_ARRAY_LEN) return null;
  /** @type {Array<T>} */
  const out = [];
  for (const x of raw) {
    if (validate(x)) out.push(/** @type {any} */ (x));
  }
  return out.length > 0 ? out : null;
}
