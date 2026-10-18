/**
 * avatar URL 比較・抽出・整合性判定の純粋関数群（shared レイヤ）。
 *
 * Phase A (avatar resolver refactor): 既存の lib/avatarUrlCompare.js と
 * lib/avatarBroadcasterGuard.js から URL 操作の核を shared に移管。
 * domain/ レイヤから直接 import できるようにする（lib は legacy）。
 */

/**
 * avatarCompareKey の記憶(同じ文字列 → 同じキー)。
 *
 * ★v0.1.1677: 全コメント分(数千件)を毎回の再描画で回す呼び手(popup の countResolvedAvatarEntries 等)が、
 *   同じ人のアイコン URL を何千回も `new URL` で解析し直していた。実機の保存データを写したヘッドレスの
 *   CPU プロファイルで、拡張プロセスの JS 自己時間 11.4 秒のうち 1.8 秒(16%)がこの関数だった。
 *   純粋関数(同じ入力は同じ出力)なので、入力文字列ごとに結果を覚える。
 *   上限を超えたら全部捨てて作り直す(大きくなり続けない・捨てても答えは同じ)。
 */
const COMPARE_KEY_CACHE_MAX = 3000;
/** @type {Map<string, string>} */
const _compareKeyCache = new Map();

/**
 * URL の query/hash を取り除いた href を返す（比較キー用）。
 *
 * @param {unknown} raw
 * @returns {string}
 */
export function avatarCompareKey(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  const hit = _compareKeyCache.get(s);
  if (hit !== undefined) return hit;
  /** @type {string} */
  let key;
  try {
    const u = new URL(s);
    u.search = '';
    u.hash = '';
    key = u.href;
  } catch {
    key = s;
  }
  if (_compareKeyCache.size >= COMPARE_KEY_CACHE_MAX) _compareKeyCache.clear();
  _compareKeyCache.set(s, key);
  return key;
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
 * 普遍ルール（0.1.83 → 0.1.99 で厳格化）:
 * avatar URL の埋め込み uid とエントリ uid の一致を検証する純粋関数。
 *
 * niconico user icon URL は `usericon/.../<uid>.jpg` 形式で uid を含む。
 * エントリの userId と URL の埋め込み uid が一致しなければ、それは
 * 「他人のアバターが間違って紐付けられた」状態であり、必ず reject する。
 *
 * 0.1.99 厳格化:
 *   旧 0.1.83 は「entry uid 空 / 匿名 (a:xxx) → 判定不可で通す」設計だったが、
 *   ユーザー実機 (lv350429804 シミケン) で「ID 未取得（DOM に投稿者情報なし）」
 *   のコメントに broadcaster icon が焼き込まれて rank strip 1 番目に
 *   出続ける不具合が確認されたため、以下を追加:
 *   - entry uid 空 + URL に niconico uid 埋め込みあり → reject
 *   - 匿名 (a:xxx) entry + URL に niconico uid 埋め込みあり → reject
 *   どちらも「他人の niconico user icon を借りる事故」を防ぐ。
 *
 * @param {unknown} url
 * @param {unknown} expectedUserId
 * @returns {boolean}
 *   - true:  紐付け OK
 *   - false: 取り違え or 不適切な紐付け
 */
export function isAvatarUrlForUserId(url, expectedUserId) {
  const expected = String(expectedUserId ?? '').trim();
  const urlUid = extractNiconicoUserIdFromIconUrl(url);
  // 0.1.99: entry uid 空 → niconico user icon は紐付けない（他人 icon 借りる事故防止）
  if (!expected) return !urlUid;
  // 0.1.99: niconico 匿名 (a:xxx) → niconico user icon は紐付けない（identicon が正）
  if (/^a:/.test(expected)) return !urlUid;
  // 数値 niconico uid 以外（test stub 'u1'/'a' 等）は判定不能で通す
  if (!/^\d{2,15}$/.test(expected)) return true;
  if (!urlUid) return true;
  return urlUid === expected;
}
