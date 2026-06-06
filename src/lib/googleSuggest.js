/**
 * Google サジェスト取得の契約 (URL組み立て + レスポンスパース + message type)
 *
 * 配信者の評判チェック (PR R2) 用。dns-osint-pro の fetchGoogleSuggest を
 * 追憶の「lib に契約 + test / background は手書きで文字列同期」パターンに移植。
 *
 * 設計 ([[reference_broadcaster_reputation_check_from_dns_osint]] §3 R2):
 *   - Google のみ採用 (suggestqueries.google.com 1ドメイン)。Yahoo(HTMLパーサ)/
 *     Bing(503頻発) は審査スコープを汚すため見送り。
 *   - suggestqueries.google.com/complete/search?client=firefox は CORS フリーで
 *     JSON を返す = SW の host_permissions で素直に取れる。
 *   - chrome.* 非依存の純関数 = lib 側でテスト可能 / Web版にも布石。
 *   - background.js は ESM import 不可の手書き成果物 → 下記の定数/URL/パースを
 *     文字列同期し、ここの契約 test で担保する。
 */

/** background.js と文字列同期する message type */
export const GOOGLE_SUGGEST_FETCH_MESSAGE_TYPE = 'NLS_GOOGLE_SUGGEST_FETCH';

/** クエリの最大長 (異常な長文を SW に投げない) */
export const GOOGLE_SUGGEST_MAX_QUERY_LEN = 100;

/**
 * クエリが取得対象として妥当か
 * @param {unknown} query
 * @returns {boolean}
 */
export function isValidSuggestQuery(query) {
  if (typeof query !== 'string') return false;
  const q = query.trim();
  return q.length >= 1 && q.length <= GOOGLE_SUGGEST_MAX_QUERY_LEN;
}

/**
 * Google サジェスト API の URL を組み立てる。
 * 固定 host/path + encodeURIComponent でクエリだけ可変 (SSRF面遮断)。
 * @param {string} query
 * @returns {string}
 */
export function buildGoogleSuggestUrl(query) {
  const q = encodeURIComponent(String(query == null ? '' : query).trim());
  return `https://suggestqueries.google.com/complete/search?client=firefox&hl=ja&q=${q}`;
}

/**
 * Google サジェスト API のレスポンス(client=firefox 形式)から候補配列を取り出す。
 * 形式: [query, [candidate, ...], ...] / data[1] が候補配列。
 * @param {unknown} data
 * @returns {string[]}
 */
export function parseGoogleSuggestResponse(data) {
  if (!Array.isArray(data)) return [];
  const candidates = data[1];
  if (!Array.isArray(candidates)) return [];
  return candidates.filter((c) => typeof c === 'string' && c.length > 0);
}
