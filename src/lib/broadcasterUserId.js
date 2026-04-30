/**
 * 配信者 userId を embedded-data / DOM から純粋関数で抽出する。
 *
 * 0.1.38 (T): lv350420992 で発生した「streamLink が誤った user リンクを
 *   拾い、broadcasterUserId が本配信者と別人になる」事件の対策。
 * 0.1.39 (U): lv350421699 (RIO 枠) で再発したため defense-in-depth 強化。
 *   関連配信サイドバーが `/user/{id}/live_programs` 形式の anchor を多数
 *   持つので、DOM フォールバック時にも候補配列から `?ref=watch_user_information`
 *   付き anchor を最優先するロジックを追加（本配信者リンクだけ ニコ生 が
 *   付与する watch_user_information マーカ）。
 *
 * 背景:
 *   ニコ生 watch ページの DOM には `/user/{id}/live_programs` 形式の
 *   anchor が複数含まれる場合がある:
 *     - 本配信者の anchor → `?ref=watch_user_information` 付き（authoritative）
 *     - 関連配信サイドバーの他配信者 anchor → ref パラメータ無し
 *   従来は `document.querySelectorAll('a[href*="/user/"]')` で先頭 hit から
 *   uid を取り出していたが、関連配信サイドバーが先に来る DOM ではこの方式で
 *   別人を拾ってしまう。
 *
 *   embedded-data の `program.supplier.programProviderId` は配信者本人を
 *   指す authoritative なソースなので、これを最優先にする。さらに DOM
 *   フォールバック時も `?ref=watch_user_information` を最優先にする。
 *
 * 優先順位:
 *   1. embedded-data `program.supplier.programProviderId` (数値文字列)
 *   2. embedded-data `program.supplier.id` (数値文字列)
 *   3. embedded-data `program.supplier.pageUrl` の /user/(\d+)/
 *   4. DOM 候補配列から `?ref=watch_user_information` 付き anchor の uid
 *   5. DOM 候補配列の先頭 anchor の uid（最後の手段、誤検出リスクあり）
 *
 *   1〜3 は authoritative なので、4〜5 が裏で違う値を返しても勝つ。
 *   チャンネル放送（pageUrl が ch.nicovideo.jp/...）は uid 取れずに ''。
 */

/**
 * @typedef {{
 *   embeddedSupplierProgramProviderId?: unknown,
 *   embeddedSupplierId?: unknown,
 *   embeddedSupplierPageUrl?: unknown,
 *   streamLinkHref?: unknown,
 *   streamLinkHrefCandidates?: unknown
 * }} ExtractBroadcasterUserIdInput
 */

const WATCH_USER_INFO_REF_RE = /[?&]ref=watch_user_information(?:&|$)/;

/**
 * @param {unknown} v
 * @returns {string}
 */
function asTrimmedString(v) {
  if (v == null) return '';
  return String(v).trim();
}

/**
 * @param {string} s
 * @returns {boolean}
 */
function isAllDigits(s) {
  return s.length > 0 && /^\d+$/.test(s);
}

/**
 * @param {string} url
 * @returns {string}
 */
function pickUserIdFromUrl(url) {
  if (!url) return '';
  const m = url.match(/\/user\/(\d+)/);
  return m ? m[1] : '';
}

/**
 * 候補 anchor 群から「最も配信者本人らしい」href を 1 つ選ぶ。
 *   - `?ref=watch_user_information` 付きを最優先
 *   - 無ければ最初の候補
 * @param {readonly unknown[]} candidates
 * @returns {string}
 */
function pickBestStreamLinkHref(candidates) {
  /** @type {string[]} */
  const cleaned = [];
  for (const c of candidates) {
    const s = asTrimmedString(c);
    if (s) cleaned.push(s);
  }
  if (cleaned.length === 0) return '';
  for (const c of cleaned) {
    if (WATCH_USER_INFO_REF_RE.test(c)) return c;
  }
  return cleaned[0];
}

/**
 * @param {ExtractBroadcasterUserIdInput} [input]
 * @returns {string}
 */
export function extractBroadcasterUserId(input) {
  if (!input || typeof input !== 'object') return '';

  // 1. supplier.programProviderId（最優先 — embedded-data 内で配信者本人を指す）
  const ppid = asTrimmedString(input.embeddedSupplierProgramProviderId);
  if (isAllDigits(ppid)) return ppid;

  // 2. supplier.id（programProviderId が無い場合のフォールバック）
  const sid = asTrimmedString(input.embeddedSupplierId);
  if (isAllDigits(sid)) return sid;

  // 3. supplier.pageUrl から /user/{id}/
  const pageUrl = asTrimmedString(input.embeddedSupplierPageUrl);
  const fromPageUrl = pickUserIdFromUrl(pageUrl);
  if (fromPageUrl) return fromPageUrl;

  // 4. DOM 候補配列から ?ref=watch_user_information 優先で 1 つ選ぶ
  let candidateList = /** @type {unknown[]} */ ([]);
  if (Array.isArray(input.streamLinkHrefCandidates)) {
    candidateList = input.streamLinkHrefCandidates;
  } else if (input.streamLinkHref != null) {
    // 互換性: 単一 href が来た場合も配列として扱う
    candidateList = [input.streamLinkHref];
  }
  const bestHref = pickBestStreamLinkHref(candidateList);
  const fromStream = pickUserIdFromUrl(bestHref);
  if (fromStream) return fromStream;

  return '';
}
