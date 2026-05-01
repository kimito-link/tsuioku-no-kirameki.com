/**
 * avatar URL 比較・抽出・整合性判定の純粋関数群（shared レイヤ）。
 *
 * Phase A (avatar resolver refactor): 既存の lib/avatarUrlCompare.js と
 * lib/avatarBroadcasterGuard.js から URL 操作の核を shared に移管。
 * domain/ レイヤから直接 import できるようにする（lib は legacy）。
 */

/**
 * URL の query/hash を取り除いた href を返す（比較キー用）。
 *
 * @param {unknown} raw
 * @returns {string}
 */
export function avatarCompareKey(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    u.search = '';
    u.hash = '';
    return u.href;
  } catch {
    return s;
  }
}

/**
 * 両者とも非空で、query/hash 除去後の URL が一致するか。
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function isSameAvatarUrl(a, b) {
  const ka = avatarCompareKey(a);
  const kb = avatarCompareKey(b);
  return Boolean(ka && kb && ka === kb);
}

/**
 * niconico user icon URL からユーザー ID を抽出する純粋関数。
 *
 * 対象パターン例:
 *   - https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/14367/143675916.jpg
 *   - https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/uri150x150/14367/143675916.jpg
 *   - https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/m/14367/143675916.jpg?cache_buster=1
 *
 * @param {unknown} raw
 * @returns {string} userId（見つからなければ空文字）
 */
export function extractNiconicoUserIdFromIconUrl(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  const m = s.match(/\/(\d{2,15})\.(?:jpg|jpeg|png|gif|webp)(?:[?#]|$)/i);
  if (m && m[1]) return m[1];
  return '';
}

/**
 * 普遍ルール（0.1.83）:
 * avatar URL の埋め込み uid とエントリ uid の一致を検証する純粋関数。
 *
 * niconico user icon URL は `usericon/.../<uid>.jpg` 形式で uid を含む。
 * エントリの userId と URL の埋め込み uid が一致しなければ、それは
 * 「他人のアバターが間違って紐付けられた」状態であり、必ず reject する。
 *
 * 対象: 数値 niconico uid（2〜15 桁）のみ。匿名 (a:xxxx) や test stub (u1 等)
 *      は対象外（URL に uid が埋まらないため判定不能）。
 *
 * @param {unknown} url
 * @param {unknown} expectedUserId
 * @returns {boolean}
 *   - true: URL に uid が埋まっていない or uid が一致 → 紐付け OK
 *   - false: URL の uid が expectedUserId と異なる → 取り違え確定
 */
export function isAvatarUrlForUserId(url, expectedUserId) {
  const expected = String(expectedUserId ?? '').trim();
  if (!expected) return true;
  if (!/^\d{2,15}$/.test(expected)) return true;
  const urlUid = extractNiconicoUserIdFromIconUrl(url);
  if (!urlUid) return true;
  return urlUid === expected;
}
